# EuriskoTax Service Watchdog (PowerShell)
# Monitors backend server on port 3000 and (optionally) cpolar tunnel.
# Auto-restarts processes when they crash or stop responding.
# Records detailed events to events.log and sends email notifications.
#
# Usage:
#   .\watchdog.ps1                     # Monitor local :3000 only
#   .\watchdog.ps1 -Share              # Monitor + cpolar public tunnel
#   .\watchdog.ps1 -IntervalSec 30     # Custom check interval (default 20s)
#   .\watchdog.ps1 -MaxRestarts 10     # Max restarts before giving up (0 = unlimited)
#   Press Ctrl+C to stop the watchdog.

param(
    [switch]$Share,
    [int]$IntervalSec = 20,
    [int]$MaxRestarts = 0
)

$ErrorActionPreference = "Continue"
# 脚本位于 tools/ops/ 子目录，项目根目录需向上两层
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$ToolsDir = Split-Path -Parent $ScriptDir
$ServerDir = Join-Path $ProjectRoot "server"
$CpolarExe = Join-Path $ToolsDir "cpolar\cpolar.exe"
$CpolarLog = Join-Path $env:TEMP "cpolar-euriskotax-watchdog.log"
$WatchdogLog = Join-Path $ScriptDir "watchdog.log"
$EventLog = Join-Path $ScriptDir "events.log"
$NotifyModule = Join-Path $ScriptDir "ops-notify.ps1"
$script:LastCpolarUrl = ""
$CpolarLastUrlFile = Join-Path $env:TEMP "euriskotax-last-cpolar-url.txt"  # 与启动脚本共享的持久化文件
$script:LastCpolarUrlCreatedNotifiedUrl = $null   # 已经成功发送过 URL_CREATED 邮件的 URL（内存去重）
$script:LastUrlChangedNotifiedPair     = $null    # 已经成功发送过 URL_CHANGED 邮件的有序对 "old => new"（内存去重，与 notify 入口 audit 对称）
$RestartCount = 0
$global:WatchdogRunning = $true

# ====== Mail-spam prevention: Get-CpolarUrl stabilizer cache + validator ======
# 避免 4040 短时不可用、旧日志残留多条导致"每轮 currentUrl 乱跳 -> URL_CHANGED 密集发邮件"。
$script:__CpolarUrlCache = @{ Value = $null; Source = ""; Ticks = [DateTime]::MinValue }
$script:__CpolarUrlCacheTtlSec = 10   # 10 秒内同一轮多次查询直接用缓存，保证结果一致
$script:__CpolarUrlValidHostRegex = '^https://[a-z0-9\-]+\.(r\d+\.cpolar\.cn|cpolar\.(com|cn|io))(?::\d+)?(/.*)?$'
$script:__CpolarUrlMinLen = 24  # "https://x.r3.cpolar.cn" 最短约 23

# ====== 共享持久化 URL 文件读写 (v1.3 防止 URL_CREATED 重复发送) ======
# 统一封装: 读取 + 带重试写入 + 失败日志，避免之前 SilentlyContinue 吞掉写入失败后每轮循环重复发邮件
function Get-PersistedLastUrl {
    if (-not (Test-Path $CpolarLastUrlFile)) { return $null }
    try {
        $raw = Get-Content -Path $CpolarLastUrlFile -Raw -Encoding UTF8 -ErrorAction Stop
        if ($raw) { return $raw.Trim() }
    } catch {
        Write-Log "WARN" ("读取持久化 URL 文件失败: " + $CpolarLastUrlFile + " | " + $_.Exception.Message)
    }
    return $null
}

function Save-PersistedLastUrl {
    param([string]$Url)
    if ([string]::IsNullOrWhiteSpace($Url)) { return $false }
    # 最多重试 2 次（间隔 300ms），避免短暂占用导致写入"静默失败"
    for ($attempt = 1; $attempt -le 2; $attempt++) {
        try {
            Set-Content -Path $CpolarLastUrlFile -Value $Url -Encoding UTF8 -ErrorAction Stop
            return $true
        } catch {
            if ($attempt -lt 2) { Start-Sleep -Milliseconds 300 }
            else {
                Write-Log "WARN" ("写入持久化 URL 文件失败 (2 次重试都未成功): " + $CpolarLastUrlFile + " | " + $_.Exception.Message)
            }
        }
    }
    return $false
}

# ====== Load notification module ======
if (Test-Path $NotifyModule) {
    . $NotifyModule
    $NotifyAvailable = $true
} else {
    $NotifyAvailable = $false
}

# ====== Logger ======
function Write-Log {
    param([string]$Level, [string]$Msg)
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$ts] [$Level] $Msg"
    switch ($Level) {
        "INFO"  { Write-Host $line -ForegroundColor Cyan }
        "OK"    { Write-Host $line -ForegroundColor Green }
        "WARN"  { Write-Host $line -ForegroundColor Yellow }
        "ERROR" { Write-Host $line -ForegroundColor Red }
        default { Write-Host $line }
    }
    Add-Content -Path $WatchdogLog -Value $line -ErrorAction SilentlyContinue
}

# ====== Event logger (writes to events.log with structured fields) ======
function Write-EventLog {
    param(
        [Parameter(Mandatory=$true)]
        [string]$EventType,    # BACKEND_RESTART | CPOLAR_RESTART | URL_CHANGED | RESTART_FAILED
        [Parameter(Mandatory=$true)]
        [string]$Reason,
        [string]$Details = "",
        [int]$RecoveryMs = 0,
        [string]$NewUrl = "",
        [string]$OldUrl = ""
    )
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $fields = @("event=$EventType", "reason=$Reason")
    if ($RecoveryMs -gt 0) { $fields += "recovery_ms=$RecoveryMs" }
    if ($NewUrl) { $fields += "new_url=$NewUrl" }
    if ($OldUrl) { $fields += "old_url=$OldUrl" }
    if ($Details) { $fields += "details=$Details" }
    $line = "[$ts] [$EventType] " + ($fields -join " | ")
    Add-Content -Path $EventLog -Value $line -ErrorAction SilentlyContinue
    Write-Host "[EVENT] $line" -ForegroundColor Magenta
}

# ====== Notify helper (email + console, uses Chinese templates) ======
function Invoke-Notification {
    param(
        [string]$EventType,
        [hashtable]$TemplateData
    )
    if ($NotifyAvailable) {
        $sent = Send-WatchdogNotification -EventType $EventType -TemplateData $TemplateData
        if ($sent) {
            # 写入 stdout 给 GUI 的 RedirectStandardOutput 捕获
            if ($script:NotifyConfig -and $script:NotifyConfig.recipients) {
                Write-Output "[GUI-EVENT] [OK] 公网地址邮件通知已发送给: $($script:NotifyConfig.recipients -join ', ')"
            } else {
                Write-Output "[GUI-EVENT] [OK] 公网地址邮件通知已发送"
            }
        } else {
            Write-Log "WARN" "Email not sent (config disabled or SMTP issue). Event still logged to events.log"
            Write-Output "[GUI-EVENT] [WARN] 邮件未发送（notify.enabled=false 或 SMTP 未配置？详见 tools/ops/notify.log）"
        }
    } else {
        Write-Log "WARN" "notify.ps1 not found, skip email. Event still logged to events.log"
        Write-Output "[GUI-EVENT] [WARN] 邮件未发送（notify.ps1 缺失）"
    }
}

# ====== Server health check (port 3000 listening + HTTP 200 response) ======
# 注意：必须探测 /health（无限流）。曾用 /api/auth/profile 会被 authLimiter（10次/15分钟）
# 打爆导致 429 → watchdog 误判后端宕机 → 无限重启循环（2026-09-06 修复）
function Test-ServerHealth {
    try {
        $conn = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
        if (-not $conn) { return $false }
        $resp = Invoke-WebRequest -Uri "http://127.0.0.1:3000/health" `
            -Method GET -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
        return $true
    } catch {
        if ($_.Exception.Response -and $_.Exception.Response.StatusCode.value__ -eq 401) {
            return $true
        }
        return $false
    }
}

# ====== Diagnose backend failure reason ======
function Get-BackendFailureReason {
    $conn = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
    if (-not $conn) { return "port_3000_not_listening" }
    try {
        $resp = Invoke-WebRequest -Uri "http://127.0.0.1:3000/health" `
            -Method GET -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
        return "http_unexpected_status_" + $resp.StatusCode
    } catch {
        if ($_.Exception.Response) {
            $code = $_.Exception.Response.StatusCode.value__
            if ($code -eq 401) { return "false_positive_ok" }
            return "http_error_$code"
        }
        $msg = $_.Exception.Message
        if ($msg -match "timed out" -or $msg -match "Unable to connect") {
            return "connection_refused_or_timeout"
        }
        return "http_exception"
    }
}

# ====== Restart backend server ======
function Restart-ServerService {
    Write-Log "WARN" "Backend service down, diagnosing..."
    $reason = Get-BackendFailureReason
    Write-Log "WARN" "Backend failure reason: $reason"

    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        # Kill processes holding port 3000
        $oldConns = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
        if ($oldConns) {
            $oldPids = $oldConns.OwningProcess | Sort-Object -Unique
            foreach ($p in $oldPids) {
                Get-Process -Id $p -ErrorAction SilentlyContinue |
                    Stop-Process -Force -ErrorAction SilentlyContinue
            }
            Start-Sleep -Seconds 2
        }
        $stdoutLog = Join-Path $env:TEMP "eurisko-server-watchdog.log"
        $stderrLog = Join-Path $env:TEMP "eurisko-server-watchdog.err"
        $proc = Start-Process -FilePath "node" `
            -ArgumentList "src/app.js" `
            -WorkingDirectory $ServerDir `
            -WindowStyle Hidden `
            -RedirectStandardOutput $stdoutLog `
            -RedirectStandardError $stderrLog `
            -PassThru
        # Wait up to 30 seconds for service to become ready
        $ready = $false
        for ($i = 0; $i -lt 15; $i++) {
            Start-Sleep -Seconds 2
            if (Test-ServerHealth) {
                $ready = $true
                break
            }
        }
        $sw.Stop()
        $recoveryMs = [int]$sw.ElapsedMilliseconds

        if ($ready) {
            Write-Log "OK" ("Backend restarted OK (PID: " + $proc.Id + ") in ${recoveryMs}ms")
            Write-EventLog -EventType "BACKEND_RESTART" -Reason $reason -RecoveryMs $recoveryMs -Details ("new_pid=" + $proc.Id)
            $tplData = @{ reason=$reason; recoveryMs=$recoveryMs; newPid=$proc.Id; timestamp=(Get-Date -Format "yyyy-MM-dd HH:mm:ss"); logPath=$stdoutLog }
            Invoke-Notification -EventType "BACKEND_RESTART" -TemplateData $tplData
            return $true
        } else {
            $sw.Stop()
            $recoveryMs = [int]$sw.ElapsedMilliseconds
            Write-Log "ERROR" "Backend restart timed out (not ready in 30s)"
            Write-EventLog -EventType "RESTART_FAILED" -Reason "backend_timeout_30s" -RecoveryMs $recoveryMs -Details ("attempted_pid=" + $proc.Id)
            $tplData = @{ target="backend"; reason=$reason; restartCount=$RestartCount; details=("timeout 30s, attempted_pid=" + $proc.Id); timestamp=(Get-Date -Format "yyyy-MM-dd HH:mm:ss"); logPath=$stdoutLog; cpolarLogPath=$CpolarLog }
            Invoke-Notification -EventType "RESTART_FAILED" -TemplateData $tplData
            return $false
        }
    } catch {
        $sw.Stop()
        $recoveryMs = [int]$sw.ElapsedMilliseconds
        Write-Log "ERROR" ("Backend restart failed: " + $_)
        Write-EventLog -EventType "RESTART_FAILED" -Reason "backend_exception" -RecoveryMs $recoveryMs -Details $_.Exception.Message
        $tplData = @{ target="backend"; reason=$reason; restartCount=$RestartCount; details=$_.Exception.Message; timestamp=(Get-Date -Format "yyyy-MM-dd HH:mm:ss"); logPath=$stdoutLog; cpolarLogPath=$CpolarLog }
        Invoke-Notification -EventType "RESTART_FAILED" -TemplateData $tplData
        return $false
    }
}

# ====== Get cpolar public url (API first, log fallback) ======
function Get-CpolarUrl {
    param([string]$LogPath)

    #region mail-spam-layer2-cache   # 10s 进程内缓存，保证主循环 + health-check + restart-loop 多次调用的一致性
    $nowTicks = [DateTime]::Now
    if ($script:__CpolarUrlCache.Value -and ($nowTicks - $script:__CpolarUrlCache.Ticks).TotalSeconds -lt $script:__CpolarUrlCacheTtlSec) {
        Write-Log "DEBUG" ("Get-CpolarUrl use cache src=$($script:__CpolarUrlCache.Source) url=$($script:__CpolarUrlCache.Value)")
        return $script:__CpolarUrlCache.Value
    }
    #endregion

    #region mail-spam-layer2-validator  # 内联辅助：做 host/https/length 规范化校验，拒绝脏值
    function Resolve-CandidateUrl([string]$Raw, [string]$SrcTag) {
        if ([string]::IsNullOrWhiteSpace($Raw)) { return $null }
        $u = $Raw.Trim()
        # 只接受 https://（免费版 cpolar 提供 https，用 http 会让同一轮产生 https/http 两个值）
        if (-not $u.StartsWith("https://", [System.StringComparison]::OrdinalIgnoreCase)) {
            Write-Log "DEBUG" ("Get-CpolarUrl candidate rejected (non-https) src=$SrcTag value=" + $u.Substring(0, [Math]::Min(40, $u.Length)))
            return $null
        }
        if ($u.Length -lt $script:__CpolarUrlMinLen) {
            Write-Log "DEBUG" ("Get-CpolarUrl candidate rejected (too short len=$($u.Length)) src=$SrcTag value=$u")
            return $null
        }
        if ($u -notmatch $script:__CpolarUrlValidHostRegex) {
            Write-Log "DEBUG" ("Get-CpolarUrl candidate rejected (host not whitelisted) src=$SrcTag value=$u")
            return $null
        }
        # Normalize: 去尾斜杠，统一小写协议与 host（虽然 cpolar host 本身小写，这里兜底）
        $u = $u.TrimEnd('/')
        return $u
    }
    #endregion

    $dbgSrc = "none"
    $dbgVal = ""

    # 1) 优先调用 cpolar 本地管理 API：/api/tunnels 返回 JSON（最可靠）
    try {
        $resp = Invoke-WebRequest -Uri "http://127.0.0.1:4040/api/tunnels" -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
        if ($resp -and $resp.Content) {
            $j = $resp.Content | ConvertFrom-Json -ErrorAction Stop
            if ($j -and $j.tunnels -and $j.tunnels.Count -gt 0) {
                # 与之前保持一致：优先 https，其次 http 降级（Resolve-CandidateUrl 里只留 https，http 降级自动被过滤）
                $bestRaw = $null
                foreach ($t in $j.tunnels) {
                    if ($t.public_url -match '^https://') { $bestRaw = $t.public_url; break }
                    elseif (-not $bestRaw -and $t.public_url -match '^http://') { $bestRaw = $t.public_url }
                }
                if ($bestRaw) {
                    $resolved = Resolve-CandidateUrl -Raw $bestRaw -SrcTag "api"
                    if ($resolved) {
                        $dbgSrc = "api"; $dbgVal = $resolved
                        #region mail-spam-layer2-cache
                        $script:__CpolarUrlCache = @{ Value = $resolved; Source = "api"; Ticks = $nowTicks }
                        #endregion
                        Write-Log "DEBUG" ("Get-CpolarUrl src=api url=$resolved")
                        return $resolved
                    }
                }
            }
        }
    } catch { }

    # 2) 次级：访问 Dashboard HTML，用正则粗取 URL（兼容旧版 cpolar）
    try {
        $resp = Invoke-WebRequest -Uri "http://127.0.0.1:4040" -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
        $candidates = @()
        if ($resp.Content -match 'https://[a-z0-9\-]+\.r\d+\.cpolar\.cn') { $candidates += $matches[0] }
        if ($resp.Content -match 'https://[a-z0-9\-]+\.cpolar\.[a-z]+')   { $candidates += $matches[0] }
        foreach ($raw in $candidates) {
            $resolved = Resolve-CandidateUrl -Raw $raw -SrcTag "dash"
            if ($resolved) {
                $dbgSrc = "dash"; $dbgVal = $resolved
                #region mail-spam-layer2-cache
                $script:__CpolarUrlCache = @{ Value = $resolved; Source = "dash"; Ticks = $nowTicks }
                #endregion
                Write-Log "DEBUG" ("Get-CpolarUrl src=dash url=$resolved")
                return $resolved
            }
        }
    } catch { }

    # 3) Fallback: parse from log file —— 倒序扫描，只取"最后一条"匹配（避免同一日志残留多段 Tunnel 历史）
    if ($LogPath -and (Test-Path $LogPath)) {
        try {
            $lines = Get-Content -Path $LogPath -Encoding UTF8 -ErrorAction Stop
            if ($lines -and $lines.Count -gt 0) {
                $last = $lines.Count - 1
                for ($i = $last; $i -ge 0; $i--) {
                    $line = $lines[$i]
                    if ([string]::IsNullOrWhiteSpace($line)) { continue }
                    $m = [regex]::Match($line, '(?:Tunnel established at|Forwarding)\s+(https?://[^\s"]+)')
                    if ($m.Success) {
                        $resolved = Resolve-CandidateUrl -Raw $m.Groups[1].Value -SrcTag "log#$i"
                        if ($resolved) {
                            $dbgSrc = "log"; $dbgVal = $resolved
                            #region mail-spam-layer2-cache
                            $script:__CpolarUrlCache = @{ Value = $resolved; Source = "log"; Ticks = $nowTicks }
                            #endregion
                            Write-Log "DEBUG" ("Get-CpolarUrl src=log(line=$i) url=$resolved")
                            return $resolved
                        }
                    }
                }
            }
        } catch {
            Write-Log "DEBUG" ("Get-CpolarUrl log parse error: " + $_.Exception.Message)
        }
    }

    $dbgDisp = if ($dbgVal) { $dbgVal } else { "(null)" }
    Write-Log "DEBUG" ("Get-CpolarUrl src=$dbgSrc url=$dbgDisp | logfile=$LogPath exists=$([bool](Test-Path $LogPath))")
    return $null
}

# ====== Diagnose cpolar failure reason ======
function Get-CpolarFailureReason {
    param([string]$ExpectedUrl)
    $proc = Get-Process -Name "cpolar" -ErrorAction SilentlyContinue
    if (-not $proc) { return "cpolar_process_dead" }
    if ($ExpectedUrl) {
        try {
            $resp = Invoke-WebRequest -Uri ($ExpectedUrl + "/health") `
                -Method GET -TimeoutSec 10 -UseBasicParsing -ErrorAction Stop
            return "false_positive_ok"
        } catch {
            if ($_.Exception.Response) {
                $code = $_.Exception.Response.StatusCode.value__
                if ($code -eq 401) { return "false_positive_ok" }
                return "public_url_http_$code"
            }
            $msg = $_.Exception.Message
            if ($msg -match "timed out") { return "public_url_timeout" }
            if ($msg -match "Unable to connect") { return "public_url_unreachable" }
            return "public_url_error"
        }
    }
    return "no_url_and_process_alive"
}

# ====== Cpolar health check (process alive + public URL reachable) ======
# Note: If old URL is unreachable but process is alive, check if URL changed
# (cpolar auto-reconnect assigns new URL). Returns true to avoid unnecessary restart.
function Test-CpolarHealth {
    param([string]$ExpectedUrl)
    $proc = Get-Process -Name "cpolar" -ErrorAction SilentlyContinue
    if (-not $proc) { return $false }
    if ($ExpectedUrl) {
        try {
            $resp = Invoke-WebRequest -Uri ($ExpectedUrl + "/health") `
                -Method GET -TimeoutSec 10 -UseBasicParsing -ErrorAction Stop
            return $true
        } catch {
            if ($_.Exception.Response -and $_.Exception.Response.StatusCode.value__ -eq 401) {
                return $true
            }
            # Old URL unreachable, but process is alive - check if URL changed via dashboard
            $freshUrl = Get-CpolarUrl -LogPath $CpolarLog
            if ($freshUrl -and $freshUrl -ne $ExpectedUrl) {
                Write-Log "INFO" "cpolar URL changed (old unreachable, new detected): $ExpectedUrl -> $freshUrl"
                return $true  # Process healthy, just URL changed (no restart needed)
            }
            return $false
        }
    }
    return $true
}

# ====== Restart cpolar tunnel ======
function Restart-CpolarTunnel {
    Write-Log "WARN" "cpolar tunnel down, diagnosing..."
    $reason = Get-CpolarFailureReason -ExpectedUrl $LastCpolarUrl
    Write-Log "WARN" "cpolar failure reason: $reason"
    $oldUrl = $LastCpolarUrl

    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        Get-Process -Name "cpolar" -ErrorAction SilentlyContinue |
            Stop-Process -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
        if (Test-Path $CpolarLog) {
            Remove-Item $CpolarLog -Force -ErrorAction SilentlyContinue
        }
        if (-not (Test-Path $CpolarExe)) {
            Write-Log "ERROR" ("cpolar.exe not found: " + $CpolarExe)
            Write-EventLog -EventType "RESTART_FAILED" -Reason "cpolar_exe_not_found" -Details $CpolarExe
            $tplData = @{ target="cpolar"; reason="cpolar_exe_not_found"; restartCount=$RestartCount; details=$CpolarExe; timestamp=(Get-Date -Format "yyyy-MM-dd HH:mm:ss"); logPath=$stdoutLog; cpolarLogPath=$CpolarLog }
            Invoke-Notification -EventType "RESTART_FAILED" -TemplateData $tplData
            return $false
        }
        # 使用与 ops-start-dev.ps1 完全一致的临时隧道参数（避免依赖用户配置命名隧道 eurisko）
        $cpolarErrLog = Join-Path $env:TEMP "cpolar-euriskotax-watchdog.err"
        $proc = Start-Process -FilePath $CpolarExe `
            -ArgumentList @("http", "3000", "-region=cn", "-log=stdout") `
            -WindowStyle Hidden `
            -RedirectStandardOutput $CpolarLog `
            -RedirectStandardError $cpolarErrLog `
            -PassThru
        # Wait up to 30s for tunnel establishment
        $newUrl = $null
        for ($i = 0; $i -lt 15; $i++) {
            Start-Sleep -Seconds 2
            $newUrl = Get-CpolarUrl -LogPath $CpolarLog
            if ($newUrl) { break }
        }
        $sw.Stop()
        $recoveryMs = [int]$sw.ElapsedMilliseconds

        if ($newUrl) {
            $script:LastCpolarUrl = $newUrl
            Save-PersistedLastUrl -Url $newUrl | Out-Null
            Write-Log "OK" ("cpolar restart OK: " + $newUrl + " in ${recoveryMs}ms")
            # 给 GUI RedirectStandardOutput 捕获 → 弹窗 + 自动复制
            Write-Output "[GUI-EVENT] 公网分享地址: $newUrl"
            Write-EventLog -EventType "CPOLAR_RESTART" -Reason $reason -RecoveryMs $recoveryMs -NewUrl $newUrl -OldUrl $oldUrl
            $ts = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
            # If URL changed, also fire URL_CHANGED event + notification
            if ($oldUrl -and $newUrl -ne $oldUrl) {
                # Mail-spam prevention: Restart 分支也走"调用方级内存+持久化去重"，
                # 否则如果 S0 先通过 Restart-Cpolar 发了 A->B，主循环下一轮也可能再对同一对判定一次。
                $pairKey = $oldUrl + " => " + $newUrl
                $allowRestartNotify = $true
                if ($script:LastUrlChangedNotifiedPair -and $script:LastUrlChangedNotifiedPair -eq $pairKey) {
                    Write-Log "INFO" ("跳过 URL_CHANGED 邮件 (内存去重，Restart 分支): $pairKey")
                    $allowRestartNotify = $false
                }
                if ($allowRestartNotify -and (Test-Path (Join-Path $env:TEMP "euriskotax-notif-dedup-audit.log"))) {
                    try {
                        $auditFile = Join-Path $env:TEMP "euriskotax-notif-dedup-audit.log"
                        $lines = Get-Content -Path $auditFile -Encoding UTF8 -ErrorAction Stop
                        $searchKey = "URL_CHANGED|$oldUrl|$newUrl"
                        $now = [DateTime]::Now
                        $count = [Math]::Min($lines.Count, 50)
                        for ($i = $lines.Count - 1; $i -ge 0 -and $count -gt 0; $i--, $count--) {
                            $m = [regex]::Match($lines[$i], '^\[([^\]]+)\]\s+(.+)$')
                            if (-not $m.Success) { continue }
                            try {
                                $ts = [DateTime]::ParseExact($m.Groups[1].Value, "yyyy-MM-dd HH:mm:ss", [System.Globalization.CultureInfo]::InvariantCulture)
                                if (($now - $ts).TotalSeconds -lt 300 -and $m.Groups[2].Value -eq $searchKey) {
                                    Write-Log "INFO" ("跳过 URL_CHANGED 邮件 (持久化去重，Restart 分支): pair=$pairKey ts=$($m.Groups[1].Value)")
                                    $allowRestartNotify = $false
                                    $script:LastUrlChangedNotifiedPair = $pairKey
                                    break
                                }
                            } catch {}
                        }
                    } catch {
                        Write-Log "DEBUG" ("URL_CHANGED(Restart) 持久化审计读取失败，忽略：" + $_.Exception.Message)
                    }
                }
                #region debug-point mail-spam-H2-H3-H4-restartcpolar-urlchanged
                $pNow = Get-PersistedLastUrl
                Write-Log "DEBUG" ("[URL_CHANGED][Restart-Cpolar] oldUrl=$oldUrl newUrl=$newUrl persisted=$pNow createdNotified=$script:LastCpolarUrlCreatedNotifiedUrl allow=$allowRestartNotify")
                #endregion
                Write-EventLog -EventType "URL_CHANGED" -Reason "cpolar_restart_new_url" -NewUrl $newUrl -OldUrl $oldUrl
                Write-Output "[GUI-EVENT] 公网分享地址变更: $oldUrl -> $newUrl"
                if ($allowRestartNotify) {
                    $tplData = @{ oldUrl=$oldUrl; newUrl=$newUrl; reason="cpolar_restart_new_url"; recoveryMs=$recoveryMs; timestamp=$ts }
                    Invoke-Notification -EventType "URL_CHANGED" -TemplateData $tplData
                    $script:LastUrlChangedNotifiedPair = $pairKey
                }
            } elseif (-not $oldUrl) {
                # Old URL 为空（首次启动场景）→ 发 URL_CREATED；但如果持久化/内存去重标记已记录过就不再重复发
                # （例如: 进程重启时 Initial seed 取不到，但实际 URL 没变，这里又会走"oldUrl 为空"路径）
                $alreadyNotified = ($script:LastCpolarUrlCreatedNotifiedUrl -and $script:LastCpolarUrlCreatedNotifiedUrl -eq $newUrl)
                #region debug-point mail-spam-H2-H3-restartcpolar-urlcreated-entry
                $pNow = Get-PersistedLastUrl
                Write-Log "DEBUG" ("[URL_CREATED][Restart-Cpolar] ENTRY: newUrl=$newUrl oldUrl=(empty) persisted=$pNow memCreatedNotified=$script:LastCpolarUrlCreatedNotifiedUrl alreadyNotified(mem)=$alreadyNotified")
                #endregion
                if (-not $alreadyNotified) {
                    $persistedNow = Get-PersistedLastUrl
                    $alreadyNotified = ($persistedNow -and $persistedNow -eq $newUrl)
                    #region debug-point mail-spam-H2-H3-restartcpolar-urlcreated-entry
                    Write-Log "DEBUG" ("[URL_CREATED][Restart-Cpolar] persisted check: persistedNow=$persistedNow alreadyNotified(after persisted)=$alreadyNotified")
                    #endregion
                }
                if (-not $alreadyNotified) {
                    Write-EventLog -EventType "URL_CREATED" -Reason "cpolar_restart_first_time" -NewUrl $newUrl
                    $tplData = @{ newUrl=$newUrl; oldUrl="(无，首次创建)"; reason="cpolar 重启时首次建立隧道"; timestamp=$ts }
                    Invoke-Notification -EventType "URL_CREATED" -TemplateData $tplData
                    # 记录到内存去重（持久化已经在本分支前写入了）
                    $script:LastCpolarUrlCreatedNotifiedUrl = $newUrl
                    Write-Output "[GUI-EVENT] [OK] 公网地址邮件通知已发送"
                } else {
                    Write-Log "INFO" ("跳过 URL_CREATED 邮件: newUrl=$newUrl 持久化/内存标记已显示发过一次了，避免重复。")
                }
            } else {
                $tplData = @{ reason=$reason; recoveryMs=$recoveryMs; newUrl=$newUrl; timestamp=$ts }
                Invoke-Notification -EventType "CPOLAR_RESTART" -TemplateData $tplData
            }
            return $true
        } else {
            $sw.Stop()
            $recoveryMs = [int]$sw.ElapsedMilliseconds
            Write-Log "WARN" "cpolar process started but no tunnel URL within 30s"
            Write-EventLog -EventType "RESTART_FAILED" -Reason "cpolar_url_timeout_30s" -RecoveryMs $recoveryMs -Details ("process_pid=" + $proc.Id)
            $tplData = @{ target="cpolar"; reason=$reason; restartCount=$RestartCount; details=("timeout 30s, process_pid=" + $proc.Id); timestamp=(Get-Date -Format "yyyy-MM-dd HH:mm:ss"); logPath=$stdoutLog; cpolarLogPath=$CpolarLog }
            Invoke-Notification -EventType "RESTART_FAILED" -TemplateData $tplData
            return $true
        }
    } catch {
        $sw.Stop()
        $recoveryMs = [int]$sw.ElapsedMilliseconds
        Write-Log "ERROR" ("cpolar restart failed: " + $_)
        Write-EventLog -EventType "RESTART_FAILED" -Reason "cpolar_exception" -RecoveryMs $recoveryMs -Details $_.Exception.Message
        $tplData = @{ target="cpolar"; reason=$reason; restartCount=$RestartCount; details=$_.Exception.Message; timestamp=(Get-Date -Format "yyyy-MM-dd HH:mm:ss"); logPath=$stdoutLog; cpolarLogPath=$CpolarLog }
        Invoke-Notification -EventType "RESTART_FAILED" -TemplateData $tplData
        return $false
    }
}

# ====== Banner ======
Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  EuriskoTax Service Watchdog" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ("  Interval:     " + $IntervalSec + "s") -ForegroundColor Gray
Write-Host "  Targets:      Backend (:3000)" -ForegroundColor Gray
if ($Share) { Write-Host "                + cpolar tunnel" -ForegroundColor Gray }
$limitText = if ($MaxRestarts -eq 0) { "unlimited" } else { $MaxRestarts.ToString() }
Write-Host ("  Max restarts: " + $limitText) -ForegroundColor Gray
Write-Host ("  Watchdog log: " + $WatchdogLog) -ForegroundColor Gray
Write-Host ("  Event log:    " + $EventLog) -ForegroundColor Magenta
if ($NotifyAvailable) {
    Write-Host ("  Notify module: loaded (notify.ps1)") -ForegroundColor Green
} else {
    Write-Host ("  Notify module: NOT FOUND (email disabled)") -ForegroundColor Yellow
}
Write-Host "  Press Ctrl+C to stop" -ForegroundColor Gray
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

Write-Log "INFO" "Watchdog started (notify_available=$NotifyAvailable)"

# Initial URL seed
# 优先 cpolar log（实际运行时的最新状态）；如果取不到再 fallback 到共享持久化文件。
# 之前只靠 cpolar log：一旦看门狗进程重启但 cpolar log 还没生成新内容（或已被清掉），
# $script:LastCpolarUrl 仍然空，下一轮检测到现成 URL 时就会误触发 URL_CREATED 重复邮件。
if ($Share) {
    if (Test-Path $CpolarLog) {
        $script:LastCpolarUrl = Get-CpolarUrl -LogPath $CpolarLog
        if ($script:LastCpolarUrl) {
            Write-Log "INFO" ("Initial cpolar URL (from cpolar log): " + $script:LastCpolarUrl)
        }
    }
    if ([string]::IsNullOrWhiteSpace($script:LastCpolarUrl)) {
        $fallback = Get-PersistedLastUrl
        if ($fallback) {
            $script:LastCpolarUrl = $fallback
            Write-Log "INFO" ("Initial cpolar URL (from persisted file): " + $script:LastCpolarUrl + " | fallback，因为 cpolar log 暂未提供")
            # 持久化里已有值 → 视作 URL_CREATED 邮件已在上次生命周期发过，回填 notifier 去重标记
            $script:LastCpolarUrlCreatedNotifiedUrl = $fallback
        }
    }
}

# ====== Main loop ======
$loopCount = 0
while ($global:WatchdogRunning) {
    $loopCount++

    # 1) Server
    $serverOk = Test-ServerHealth
    if (-not $serverOk) {
        if ($MaxRestarts -eq 0 -or $RestartCount -lt $MaxRestarts) {
            if (Restart-ServerService) {
                $RestartCount++
            }
        } else {
            Write-Log "ERROR" ("Backend down but max restarts (" + $MaxRestarts + ") reached, giving up.")
            Write-EventLog -EventType "RESTART_FAILED" -Reason "max_restarts_reached" -Details ("target=backend count=$RestartCount")
            $tplData = @{ target="backend"; reason="max_restarts_reached"; maxRestarts=$MaxRestarts; timestamp=(Get-Date -Format "yyyy-MM-dd HH:mm:ss") }
            Invoke-Notification -EventType "MAX_RESTARTS_REACHED" -TemplateData $tplData
        }
    }

    # 2) Cpolar tunnel (Share mode)
    if ($Share) {
        $cpolarOk = Test-CpolarHealth -ExpectedUrl $LastCpolarUrl
        if (-not $cpolarOk) {
            if ($MaxRestarts -eq 0 -or $RestartCount -lt $MaxRestarts) {
                if (Restart-CpolarTunnel) {
                    $RestartCount++
                }
            } else {
                Write-Log "ERROR" ("cpolar down but max restarts (" + $MaxRestarts + ") reached, giving up.")
                Write-EventLog -EventType "RESTART_FAILED" -Reason "max_restarts_reached" -Details ("target=cpolar count=$RestartCount")
                $tplData = @{ target="cpolar"; reason="max_restarts_reached"; maxRestarts=$MaxRestarts; timestamp=(Get-Date -Format "yyyy-MM-dd HH:mm:ss") }
                Invoke-Notification -EventType "MAX_RESTARTS_REACHED" -TemplateData $tplData
            }
        } else {
            # Detect URL change (tunnel auto-reconnected with new URL, no restart needed)
            $currentUrl = Get-CpolarUrl -LogPath $CpolarLog
            $persistedUrl = Get-PersistedLastUrl

            #region debug-point mail-spam-H1-H3-mainloop-entry
            Write-Log "DEBUG" ("[MAIN LOOP][URL] round=$loopCount currentUrl=$currentUrl scriptLastUrl=$script:LastCpolarUrl persistedUrl=$persistedUrl memCreatedNotified=$script:LastCpolarUrlCreatedNotifiedUrl memChangedNotifiedLast=$($script:LastUrlChangedNotifiedPair)")
            #endregion

            # ====== Mail-spam prevention Layer 3a: 空值不把 LastCpolarUrl 吞掉 ======
            # 上一轮拿到 URL 后，本轮若 4040 短暂 503，currentUrl=$null。
            # 若直接跳过 while（$null 分支不处理），LastCpolarUrl 还留着 → 下次恢复正常没问题。
            # 但若有其他逻辑把它"清空"过，`-not $script:LastCpolarUrl` 会再次命中 URL_CREATED 分支。
            # 防御：当前 currentUrl 为空 → 如果之前有持久化/内存值，不视为"消失了就是新的"，跳过本轮。
            if (-not $currentUrl -and ($script:LastCpolarUrl -or $persistedUrl)) {
                $lastDisp = if ($script:LastCpolarUrl) { $script:LastCpolarUrl } else { "(null)" }
                $persDisp = if ($persistedUrl) { $persistedUrl } else { "(null)" }
                Write-Log "DEBUG" ("[MAIN LOOP][URL] currentUrl 为空（API 短时不可用），保留上一轮 last=" + $lastDisp + " persisted=" + $persDisp + "。跳过变更/首次分支，避免回来时误触发。")
            }
            # ====== Mail-spam prevention Layer 3b: URL_CHANGED 调用方级去重 + 空值稳定窗口 ======
            # 对称于 URL_CREATED 的内存/持久化去重。即便最后闸门被绕开，
            # watchdog 内部也不会第二次对同一个 (old,new) 有序对发邮件（同一生命周期内）。
            elseif ($currentUrl -and $script:LastCpolarUrl -and $currentUrl -ne $script:LastCpolarUrl) {
                #region debug-point mail-spam-H1-H4-mainloop-urlchanged
                Write-Log "DEBUG" ("[URL_CHANGED][MainLoop] TRIGGER: oldUrl=$script:LastCpolarUrl newUrl=$currentUrl persisted=$persistedUrl")
                #endregion
                $oldUrl = $script:LastCpolarUrl
                $newUrl = $currentUrl
                $pairKey = $oldUrl + " => " + $newUrl
                $allowThisRound = $true
                # Memory dedup (same pair -> drop)
                if ($script:LastUrlChangedNotifiedPair -and $script:LastUrlChangedNotifiedPair -eq $pairKey) {
                    Write-Log "INFO" ("跳过 URL_CHANGED 邮件 (内存去重，同一有序对): $pairKey")
                    $allowThisRound = $false
                }
                # Persisted dedup: 持久化审计里最近 5 分钟有相同有序对 -> drop（即使 watchdog 重启也不会重复）
                if ($allowThisRound -and (Test-Path (Join-Path $env:TEMP "euriskotax-notif-dedup-audit.log"))) {
                    try {
                        $auditFile = Join-Path $env:TEMP "euriskotax-notif-dedup-audit.log"
                        $lines = Get-Content -Path $auditFile -Encoding UTF8 -ErrorAction Stop
                        $searchKey = "URL_CHANGED|$oldUrl|$newUrl"
                        $now = [DateTime]::Now
                        $count = [Math]::Min($lines.Count, 50)
                        for ($i = $lines.Count - 1; $i -ge 0 -and $count -gt 0; $i--, $count--) {
                            $m = [regex]::Match($lines[$i], '^\[([^\]]+)\]\s+(.+)$')
                            if (-not $m.Success) { continue }
                            try {
                                $ts = [DateTime]::ParseExact($m.Groups[1].Value, "yyyy-MM-dd HH:mm:ss", [System.Globalization.CultureInfo]::InvariantCulture)
                                if (($now - $ts).TotalSeconds -lt 300 -and $m.Groups[2].Value -eq $searchKey) {
                                    Write-Log "INFO" ("跳过 URL_CHANGED 邮件 (持久化去重，5 分钟内已发送过): pair=$pairKey ts=$($m.Groups[1].Value)")
                                    $allowThisRound = $false
                                    $script:LastUrlChangedNotifiedPair = $pairKey
                                    break
                                }
                            } catch {}
                        }
                    } catch {
                        Write-Log "DEBUG" ("URL_CHANGED 持久化审计读取失败，忽略：" + $_.Exception.Message)
                    }
                }

                # 无论是否发邮件，状态变量必须推进：old->new 已经被观测到（即便被去重，也不要再判定为 change）
                $script:LastCpolarUrl = $newUrl
                Save-PersistedLastUrl -Url $newUrl | Out-Null
                Write-Log "INFO" ("cpolar URL changed (no restart): $oldUrl -> $newUrl | notify=$allowThisRound")
                # GUI 事件永远发（GUI 自己还有 DedupPopup 180s 冷却），避免邮件被去重的同时，用户在 GUI 也看不到变化
                Write-Output "[GUI-EVENT] 公网分享地址变更: $oldUrl -> $newUrl"
                Write-EventLog -EventType "URL_CHANGED" -Reason "auto_reconnect_new_url" -NewUrl $newUrl -OldUrl $oldUrl

                if ($allowThisRound) {
                    $tplData = @{ oldUrl=$oldUrl; newUrl=$newUrl; reason="auto_reconnect_new_url"; recoveryMs=0; timestamp=(Get-Date -Format "yyyy-MM-dd HH:mm:ss") }
                    Invoke-Notification -EventType "URL_CHANGED" -TemplateData $tplData
                    $script:LastUrlChangedNotifiedPair = $pairKey
                }
            } elseif ($currentUrl -and -not $script:LastCpolarUrl) {
                # 注意: 显式写 $script: 作用域，防止"以为赋值了但实际改的是 while/函数局部变量"导致下次循环又空
                $script:LastCpolarUrl = $currentUrl
                Write-Log "INFO" ("cpolar URL detected (first time in this lifecycle): " + $currentUrl)
                $savedOk = Save-PersistedLastUrl -Url $currentUrl
                # URL_CREATED 三重去重 (防止进程重启/scope丢失/写入失败重复发):
                #   1) 内存去重标记: 已经为这个 URL 发过 CREATED 就不再发
                #   2) 持久化文件已存在且值相同 (说明过去某生命周期发过)
                #   3) 首次判断 $currentUrl -ne $persistedUrl 仍然保留 (兼容老逻辑)
                $shouldNotify = $true
                if ($script:LastCpolarUrlCreatedNotifiedUrl -and $script:LastCpolarUrlCreatedNotifiedUrl -eq $currentUrl) {
                    Write-Log "INFO" ("跳过 URL_CREATED 邮件 (内存去重): currentUrl=$currentUrl")
                    $shouldNotify = $false
                }
                if ($shouldNotify -and $persistedUrl -and $persistedUrl -eq $currentUrl) {
                    # 持久化里已经是当前 URL → 上次肯定发过 (启动脚本或上一任 watchdog 生命周期)
                    Write-Log "INFO" ("跳过 URL_CREATED 邮件 (持久化去重): currentUrl=$currentUrl")
                    $shouldNotify = $false
                    # 顺便回填内存标记
                    $script:LastCpolarUrlCreatedNotifiedUrl = $currentUrl
                }
                #region debug-point mail-spam-H2-H3-mainloop-urlcreated-pre
                Write-Log "DEBUG" ("[URL_CREATED][MainLoop] PRE: currentUrl=$currentUrl persistedUrl=$persistedUrl shouldNotify=$shouldNotify memCreatedNotified=$script:LastCpolarUrlCreatedNotifiedUrl")
                #endregion
                if ($shouldNotify -and $currentUrl -ne $persistedUrl) {
                    Write-EventLog -EventType "URL_CREATED" -Reason "watchdog_detected_new_url" -NewUrl $currentUrl
                    $tplData = @{ newUrl=$currentUrl; oldUrl="(无，首次发现)"; reason="watchdog 检测到新的公网地址首次出现"; timestamp=(Get-Date -Format "yyyy-MM-dd HH:mm:ss") }
                    Invoke-Notification -EventType "URL_CREATED" -TemplateData $tplData
                    # 发送成功立刻更新去重标记 —— 即使 Set-Content 因为权限等原因失败，
                    # 至少在本进程生命周期内不会因为"内存变量丢失场景"而再发第二封
                    $script:LastCpolarUrlCreatedNotifiedUrl = $currentUrl
                    Write-Output "[GUI-EVENT] [OK] 公网地址邮件通知已发送"
                }
                if (-not $savedOk) {
                    Write-Log "WARN" ("持久化 URL 写入未成功，本轮仍正常使用内存变量去重；后续若进程重启可能重新判定为新 URL。请检查 %TEMP% 写权限。")
                }
            }
        }
    }

    # Heartbeat every 10 rounds (~3-4 min at default interval)
    if ($loopCount % 10 -eq 0) {
        $parts = @()
        if (Test-ServerHealth) { $parts += "backend=OK" } else { $parts += "backend=FAIL" }
        if ($Share) {
            if (Test-CpolarHealth -ExpectedUrl $LastCpolarUrl) { $parts += "cpolar=OK" } else { $parts += "cpolar=FAIL" }
        }
        Write-Log "INFO" ("Heartbeat [" + $loopCount + "]: " + ($parts -join " | ") + " | restarts=" + $RestartCount + " | url=" + $LastCpolarUrl)
    }

    Start-Sleep -Seconds $IntervalSec
}
