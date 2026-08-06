# EuriskoTax 服务守护脚本（PowerShell）
# 功能：监控后端服务和 cpolar 隧道，异常时自动重启，避免好友测试中断
# 用法：
#   .\watchdog.ps1                     # 监控本地3000端口（后端服务）
#   .\watchdog.ps1 -Share              # 同时监控 cpolar 公网隧道
#   .\watchdog.ps1 -IntervalSec 30     # 自定义检查间隔（默认20秒）
#   .\watchdog.ps1 -MaxRestarts 0      # 不限制重启次数（默认0=无限制）
#   启动后按 Ctrl+C 停止守护

param(
    [switch]$Share,
    [int]$IntervalSec = 20,
    [int]$MaxRestarts = 0   # 0 = 无限制
)

$ErrorActionPreference = "Continue"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ServerDir = Join-Path $ProjectRoot "server"
$CpolaExe = Join-Path $ProjectRoot "cpolar\cpolar.exe"
$CpolarLog = Join-Path $env:TEMP "cpolar-euriskotax-watchdog.log"
$WatchdogLog = Join-Path $ProjectRoot "watchdog.log"
$CpolarStartedByWatchdog = $false
$ServerStartedByWatchdog = $false
$RestartCount = 0
$LastCpolarUrl = ""

# ====== 日志函数 ======
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

# ====== 清理函数（Ctrl+C触发） ======
$global:WatchdogRunning = $true
$null = Register-EngineEvent -SourceIdentifier 'PowerShell.Exiting' -Action {
    if ($global:WatchdogStarted) {
        Write-Host ""
        Write-Host "[INFO] 守护脚本正在退出..." -ForegroundColor Gray
        if ($global:CleanupServer) {
            Write-Host "[INFO] 不结束后端服务（手动管理）" -ForegroundColor Gray
        }
        if ($global:CleanupCpolar) {
            Write-Host "[INFO] 不结束 cpolar（手动管理）" -ForegroundColor Gray
        }
    }
}

# ====== 检查后端服务健康（3000端口监听 + HTTP响应） ======
function Test-ServerHealth {
    try {
        $conn = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
        if (-not $conn) { return $false }
        $resp = Invoke-WebRequest -Uri "http://127.0.0.1:3000/api/auth/profile" -Method GET -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
        return $true
    } catch {
        # 返回401也算正常（说明接口在响应）
        if ($_.Exception.Response -and $_.Exception.Response.StatusCode.value__ -eq 401) {
            return $true
        }
        return $false
    }
}

# ====== 重启后端服务 ======
function Restart-ServerService {
    Write-Log "WARN" "后端服务异常，正在重启..."
    try {
        # 清理残留 node 进程（监听3000端口的）
        $oldConns = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
        if ($oldConns) {
            $oldPids = $oldConns.OwningProcess | Sort-Object -Unique
            foreach ($pid in $oldPids) {
                Get-Process -Id $pid -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
            }
            Start-Sleep -Seconds 2
        }
        # 后台启动 node src/app.js
        $stdoutLog = Join-Path $env:TEMP "eurisko-server-watchdog.log"
        $proc = Start-Process -FilePath "node" `
            -ArgumentList "src/app.js" `
            -WorkingDirectory $ServerDir `
            -WindowStyle Hidden `
            -RedirectStandardOutput $stdoutLog `
            -RedirectStandardError $stdoutLog `
            -PassThru
        # 等待服务就绪
        for ($i = 0; $i -lt 15; $i++) {
            Start-Sleep -Seconds 2
            if (Test-ServerHealth) {
                Write-Log "OK" "后端服务重启成功 (PID: $($proc.Id))"
                return $true
            }
        }
        Write-Log "ERROR" "后端服务重启超时（30秒内未就绪）"
        return $false
    } catch {
        Write-Log "ERROR" "后端服务重启失败: $_"
        return $false
    }
}

# ====== 从日志解析 cpolar 公网URL ======
function Get-CpolarUrl {
    param([string]$LogPath)
    if (-not (Test-Path $LogPath)) { return $null }
    $content = Get-Content $LogPath -Raw -ErrorAction SilentlyContinue
    if (-not $content) { return $null }
    $m = [regex]::Match($content, 'Tunnel established at (https://[^\s"]+)')
    if ($m.Success) { return $m.Groups[1].Value }
    $m = [regex]::Match($content, 'Tunnel established at (http://[^\s"]+)')
    if ($m.Success) { return $m.Groups[1].Value }
    return $null
}

# ====== 检查 cpolar 进程和隧道 ======
function Test-CpolarHealth {
    param([string]$ExpectedUrl)
    # 1. 进程是否存在
    $proc = Get-Process -Name "cpolar" -ErrorAction SilentlyContinue
    if (-not $proc) { return $false }
    # 2. 如果有URL，检查公网可达
    if ($ExpectedUrl) {
        try {
            $resp = Invoke-WebRequest -Uri "$ExpectedUrl/api/auth/profile" -Method GET -TimeoutSec 10 -UseBasicParsing -ErrorAction Stop
            return $true
        } catch {
            if ($_.Exception.Response -and $_.Exception.Response.StatusCode.value__ -eq 401) {
                return $true
            }
            return $false
        }
    }
    # 无URL时只要进程存活就算通过（可能隧道还在建立）
    return $true
}

# ====== 重启 cpolar 隧道 ======
function Restart-CpolarTunnel {
    Write-Log "WARN" "cpolar 隧道异常，正在重启..."
    try {
        # 清理残留进程
        Get-Process -Name "cpolar" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
        # 清空旧日志，避免解析到旧URL
        if (Test-Path $CpolarLog) { Remove-Item $CpolarLog -Force -ErrorAction SilentlyContinue }
        # 用配置文件中的 eurisko 隧道预设启动
        if (Test-Path $CpolaExe) {
            # 优先用预设隧道（已在 cpolar.yml 配置 region=cn）
            $proc = Start-Process -FilePath $CpolaExe `
                -ArgumentList "start", "eurisko", "-log=stdout" `
                -WindowStyle Hidden `
                -RedirectStandardOutput $CpolarLog `
                -RedirectStandardError $CpolarLog `
                -PassThru
        } else {
            Write-Log "ERROR" "找不到 cpolar.exe: $CpolaExe"
            return $false
        }
        # 等待隧道建立并解析URL
        $newUrl = $null
        for ($i = 0; $i -lt 15; $i++) {
            Start-Sleep -Seconds 2
            $newUrl = Get-CpolarUrl -LogPath $CpolarLog
            if ($newUrl) { break }
        }
        if ($newUrl) {
            $global:LastCpolarUrl = $newUrl
            Write-Log "OK" "cpolar 隧道重启成功: $newUrl"
            return $true
        } else {
            Write-Log "WARN" "cpolar 进程已启动但30秒内未获取到公网地址，可能仍在建立中"
            return $true
        }
    } catch {
        Write-Log "ERROR" "cpolar 重启失败: $_"
        return $false
    }
}

# ====== 主循环 ======
Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  EuriskoTax 服务守护脚本" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  检查间隔:   ${IntervalSec}秒" -ForegroundColor Gray
Write-Host "  监控项目:   后端服务(3000端口)" -ForegroundColor Gray
if ($Share) { Write-Host "  + 公网隧道  cpolar" -ForegroundColor Gray }
$limitText = if ($MaxRestarts -eq 0) { "无限制" } else { $MaxRestarts.ToString() }
Write-Host "  重启上限:   $limitText" -ForegroundColor Gray
Write-Host "  日志文件:   $WatchdogLog" -ForegroundColor Gray
Write-Host "  按 Ctrl+C 停止" -ForegroundColor Gray
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

$global:WatchdogStarted = $true
Write-Log "INFO" "守护脚本启动"

# 首次检查，获取当前 cpolar URL
if ($Share -and (Test-Path $CpolarLog)) {
    $LastCpolarUrl = Get-CpolarUrl -LogPath $CpolarLog
}

$loopCount = 0
while ($global:WatchdogRunning) {
    $loopCount++
    $needRestart = $false

    # ---- 1. 检查后端服务 ----
    $serverOk = Test-ServerHealth
    if (-not $serverOk) {
        if ($MaxRestarts -eq 0 -or $RestartCount -lt $MaxRestarts) {
            if (Restart-ServerService) {
                $RestartCount++
                $needRestart = $true
            }
        } else {
            Write-Log "ERROR" "后端服务异常，但已达重启上限($MaxRestarts)，不再自动重启"
        }
    }

    # ---- 2. 检查 cpolar 隧道（Share模式） ----
    if ($Share) {
        $cpolarOk = Test-CpolarHealth -ExpectedUrl $LastCpolarUrl
        if (-not $cpolarOk) {
            if ($MaxRestarts -eq 0 -or $RestartCount -lt $MaxRestarts) {
                if (Restart-CpolarTunnel) {
                    $RestartCount++
                    $needRestart = $true
                }
            } else {
                Write-Log "ERROR" "cpolar 隧道异常，但已达重启上限($MaxRestarts)，不再自动重启"
            }
        } else {
            # 隧道正常，但日志里有新URL时更新一下显示
            $currentUrl = Get-CpolarUrl -LogPath $CpolarLog
            if ($currentUrl -and $currentUrl -ne $LastCpolarUrl) {
                $LastCpolarUrl = $currentUrl
                Write-Log "INFO" "当前公网地址: $LastCpolarUrl"
            }
        }
    }

    # ---- 心跳日志（每10轮一次） ----
    if ($loopCount % 10 -eq 0) {
        $status = @()
        if (Test-ServerHealth) { $status += "后端=OK" } else { $status += "后端=FAIL" }
        if ($Share) {
            if (Test-CpolarHealth -ExpectedUrl $LastCpolarUrl) { $status += "cpolar=OK" } else { $status += "cpolar=FAIL" }
        }
        $statusStr = $status -join " | "
        Write-Log "INFO" "心跳检查 [$loopCount]: $statusStr | 累计重启=$RestartCount"
    }

    # ---- 等待下一轮 ----
    Start-Sleep -Seconds $IntervalSec
}
