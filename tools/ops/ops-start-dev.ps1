# EuriskoTax 一键启动脚本（PowerShell）
# 功能：检查环境 → 安装依赖 → 重置 dev 用户 → 启动后端服务 → (可选)cpolar公网分享 → (可选)守护
# 用法：
#   .\start-dev.ps1              # 标准启动
#   .\start-dev.ps1 -Share       # 启动并生成 cpolar 公网分享地址
#   .\start-dev.ps1 -Watchdog    # 启动后自动拉起守护脚本（防止意外中断）
#   .\start-dev.ps1 -Share -Watchdog        # 公网分享 + 守护（推荐给好友测试时使用）
#   .\start-dev.ps1 -SkipInstall -SkipResetUser   # 跳过安装和重置，快速启动

param(
    [switch]$SkipInstall,
    [switch]$SkipResetUser,
    [switch]$Share,
    [switch]$Watchdog
)

$ErrorActionPreference = "Stop"
# 脚本位于 tools/ops/ 子目录，项目根目录需向上两层
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$ToolsDir = Split-Path -Parent $ScriptDir
$ServerDir = Join-Path $ProjectRoot "server"

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  EuriskoTax 一键启动脚本" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# ====== 1. 环境检查 ======
Write-Host "[1/4] 检查运行环境..." -ForegroundColor Yellow

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "  [FAIL] 未检测到 Node.js，请先安装 Node.js 16+ 后重试" -ForegroundColor Red
    Write-Host "  下载地址: https://nodejs.org/" -ForegroundColor Gray
    exit 1
}
$nodeVer = node -v
Write-Host "  [OK] Node.js $nodeVer" -ForegroundColor Green

if (-not (Test-Path $ServerDir)) {
    Write-Host "  [FAIL] 未找到 server 目录: $ServerDir" -ForegroundColor Red
    exit 1
}
Write-Host "  [OK] server 目录存在" -ForegroundColor Green

# 检查 .env 文件
$envFile = Join-Path $ServerDir ".env"
if (-not (Test-Path $envFile)) {
    Write-Host "  [INFO] .env 不存在，从 .env.example 复制..." -ForegroundColor Yellow
    Copy-Item (Join-Path $ServerDir ".env.example") $envFile
    Write-Host "  [OK] .env 已创建（开发用默认配置）" -ForegroundColor Green
} else {
    Write-Host "  [OK] .env 已存在" -ForegroundColor Green
}

# ====== 2. 安装依赖 ======
if (-not $SkipInstall) {
    $nodeModules = Join-Path $ServerDir "node_modules"
    if (-not (Test-Path $nodeModules)) {
        Write-Host ""
        Write-Host "[2/4] 安装后端依赖（首次运行可能需要 1-2 分钟）..." -ForegroundColor Yellow
        Push-Location $ServerDir
        try {
            npm install 2>&1 | Out-Host
            if ($LASTEXITCODE -ne 0) {
                Write-Host "  [FAIL] npm install 失败" -ForegroundColor Red
                exit 1
            }
            Write-Host "  [OK] 依赖安装完成" -ForegroundColor Green
        } finally {
            Pop-Location
        }
    } else {
        Write-Host ""
        Write-Host "[2/4] node_modules 已存在，跳过安装（加 -SkipInstall 可强制跳过）" -ForegroundColor Green
    }
} else {
    Write-Host ""
    Write-Host "[2/4] 已跳过依赖安装（-SkipInstall）" -ForegroundColor Gray
}

# ====== 3. 重置 dev 用户 ======
if (-not $SkipResetUser) {
    Write-Host ""
    Write-Host "[3/4] 重置 dev 测试用户..." -ForegroundColor Yellow
    Push-Location $ServerDir
    try {
        node scripts/reset-dev-user.js 2>&1 | Out-Host
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  [WARN] 重置用户失败，可能数据库未迁移，尝试 prisma migrate..." -ForegroundColor Yellow
            npx prisma migrate dev 2>&1 | Out-Host
            node scripts/reset-dev-user.js 2>&1 | Out-Host
        }
        Write-Host "  [OK] dev 用户已就绪 (dev@example.com / password)" -ForegroundColor Green
    } finally {
        Pop-Location
    }
} else {
    Write-Host ""
    Write-Host "[3/4] 已跳过用户重置（-SkipResetUser）" -ForegroundColor Gray
}

# ====== 4. (可选) 启动 cpolar 公网分享 ======
$cpolarStarted = $false
$lastUrlFile  = Join-Path $env:TEMP "euriskotax-last-cpolar-url.txt"   # 记录上次 URL，用于变更检测
function Get-CpolarTunnelUrls {
    param([int]$MaxRetries=5, [int]$RetryMs=1200, [string]$LogFile)
    # 优先级：1) 本地管理API 4040 返回 JSON；2) 输出/日志正则解析 Forwarding
    for ($r=0; $r -lt $MaxRetries; $r++) {
        Start-Sleep -Milliseconds $RetryMs
        try {
            $resp = Invoke-WebRequest -Uri "http://127.0.0.1:4040/api/tunnels" -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
            $j = $resp.Content | ConvertFrom-Json -ErrorAction Stop
            if ($j -and $j.tunnels -and $j.tunnels.Count -gt 0) {
                # 优先 https，其次 http
                $best = $null
                foreach ($t in $j.tunnels) {
                    if ($t.public_url -match '^https://') { $best = $t.public_url; break }
                    elseif (-not $best -and $t.public_url -match '^http://') { $best = $t.public_url }
                }
                if ($best) { return @{ Url=$best; Source="api_4040"; Retries=($r+1) } }
            }
        } catch {
            # 继续 fallback 到日志解析
        }
        if ($LogFile -and (Test-Path $LogFile)) {
            $raw = Get-Content $LogFile -Raw -ErrorAction SilentlyContinue
            if ($raw) {
                $m = [regex]::Match($raw, '(?:Tunnel established at|Forwarding)\s+(https://[^\s"]+)')
                if ($m.Success) { return @{ Url=$m.Groups[1].Value; Source="log_https"; Retries=($r+1) } }
                $m2 = [regex]::Match($raw, '(?:Tunnel established at|Forwarding)\s+(http://[^\s"]+)')
                if ($m2.Success) { return @{ Url=$m2.Groups[1].Value; Source="log_http"; Retries=($r+1) } }
            }
        }
    }
    return $null
}

if ($Share) {
    $cpolarDir = Join-Path $ToolsDir "cpolar"
    $cpolarExe = Join-Path $cpolarDir "cpolar.exe"
    $notifyScript = Join-Path $ScriptDir "ops-notify.ps1"

    Write-Host ""
    Write-Host "[4/5] 启动 cpolar 公网分享..." -ForegroundColor Yellow

    if (-not (Test-Path $cpolarExe)) {
        Write-Host "  [WARN] 未找到 cpolar.exe: $cpolarExe" -ForegroundColor Yellow
        Write-Host "  跳过公网分享，仅本地访问" -ForegroundColor Gray
    } elseif (-not (Test-Path "$env:USERPROFILE\.cpolar\cpolar.yml")) {
        Write-Host "  [WARN] cpolar 未配置 authtoken" -ForegroundColor Yellow
        Write-Host "  请运行: .\tools\cpolar\cpolar.exe authtoken <你的token>" -ForegroundColor Gray
        Write-Host "  跳过公网分享，仅本地访问" -ForegroundColor Gray
    } else {
        # 先清理可能残留的 cpolar 进程
        Get-Process -Name "cpolar" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1

        # 后台启动 cpolar（cn 地区），输出重定向到临时文件
        $cpolarLog    = Join-Path $env:TEMP "cpolar-euriskotax.log"
        $cpolarErrLog = Join-Path $env:TEMP "cpolar-euriskotax.err"
        if (Test-Path $cpolarLog)    { Remove-Item $cpolarLog    -Force -ErrorAction SilentlyContinue }
        if (Test-Path $cpolarErrLog) { Remove-Item $cpolarErrLog -Force -ErrorAction SilentlyContinue }
        Start-Process -FilePath $cpolarExe `
            -ArgumentList "http", "3000", "-region=cn", "-log=stdout" `
            -WindowStyle Hidden `
            -RedirectStandardOutput $cpolarLog `
            -RedirectStandardError  $cpolarErrLog `
            -PassThru | Out-Null

        Write-Host "  等待隧道建立..." -ForegroundColor Gray
        $tunnelInfo = Get-CpolarTunnelUrls -MaxRetries 10 -RetryMs 1500 -LogFile $cpolarLog
        $tunnelUrl  = if ($tunnelInfo) { $tunnelInfo.Url } else { $null }
        if ($tunnelUrl) {
            Write-Host "  [OK] cpolar 隧道已建立 (来源: $($tunnelInfo.Source), $($tunnelInfo.Retries) 次探测)" -ForegroundColor Green
            Write-Host "  公网分享地址: $tunnelUrl" -ForegroundColor Magenta
            # ⚠️ 下面 Write-Output 不写控制台彩色，但进入 stdout 供 GUI 的
            # RedirectStandardOutput 异步事件捕获（GUI 弹窗+复制剪贴板靠这个）
            Write-Output "[GUI-EVENT] 公网分享地址: $tunnelUrl"

            # URL 持久化 + 发邮件通知
            $previousUrl = $null
            if (Test-Path $lastUrlFile) { $previousUrl = (Get-Content $lastUrlFile -Raw -ErrorAction SilentlyContinue).Trim() }
            Set-Content -Path $lastUrlFile -Value $tunnelUrl -Encoding UTF8 -ErrorAction SilentlyContinue

            $sendMail = $true
            if (Test-Path $notifyScript) {
                try {
                    $tplData = @{
                        newUrl    = $tunnelUrl
                        oldUrl    = if ($previousUrl) { $previousUrl } else { "(无，首次生成)" }
                        reason    = "手动启动公网分享（ops-start-dev -Share）"
                        timestamp = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
                    }
                    # 判断这次是"首次创建"还是"变更"
                    if ([string]::IsNullOrWhiteSpace($previousUrl) -or ($previousUrl -ne $tunnelUrl)) {
                        $eventType = if ([string]::IsNullOrWhiteSpace($previousUrl)) { "URL_CREATED" } else { "URL_CHANGED" }
                        . $notifyScript
                        $sent = Send-WatchdogNotification -EventType $eventType -TemplateData $tplData
                        if ($sent) {
                            Write-Host "  [OK] 公网地址邮件通知已发送给: $($script:NotifyConfig.recipients -join ', ')" -ForegroundColor Green
                            Write-Output "[GUI-EVENT] [OK] 公网地址邮件通知已发送给: $($script:NotifyConfig.recipients -join ', ')"
                        } else {
                            Write-Host "  [WARN] 邮件未发送（notify.enabled=false 或 SMTP 未配置？详见 tools/ops/notify.log）" -ForegroundColor Yellow
                            Write-Output "[GUI-EVENT] [WARN] 邮件未发送（notify.enabled=false 或 SMTP 未配置？详见 tools/ops/notify.log）"
                        }
                    } else {
                        Write-Host "  [INFO] 公网地址未变化，跳过重复邮件" -ForegroundColor Gray
                        $sendMail = $false
                    }
                } catch {
                    Write-Host "  [WARN] 发送邮件通知失败: $($_.Exception.Message)" -ForegroundColor Yellow
                    Write-Host "         详情: tools/ops/notify.log" -ForegroundColor Gray
                    Write-Output "[GUI-EVENT] [WARN] 发送邮件通知失败: $($_.Exception.Message)"
                }
            } else {
                Write-Host "  [WARN] 邮件脚本未找到: $notifyScript" -ForegroundColor Yellow
                Write-Output "[GUI-EVENT] [WARN] 邮件未发送（脚本缺失: $notifyScript）"
            }

            $cpolarStarted = $true
        } else {
            Write-Host "  [WARN] cpolar 隧道建立超时（15秒内未获取到公网地址）" -ForegroundColor Yellow
            Write-Host "  可手动访问 cpolar 仪表盘查看: http://127.0.0.1:4040/" -ForegroundColor Gray
        }
    }
} else {
    Write-Host ""
    Write-Host "  (未启用 cpolar 公网分享，加 -Share 参数可生成公网地址并自动邮件通知)" -ForegroundColor Gray
}

# ====== 5. 启动后端服务 ======
$stepNum = if ($Share) { "5/5" } else { "4/4" }
Write-Host ""
Write-Host "[$stepNum] 启动后端服务..." -ForegroundColor Yellow
Write-Host "  前端访问地址: http://localhost:3000/" -ForegroundColor Cyan
Write-Host "  API 文档地址:   http://localhost:3000/api/docs" -ForegroundColor Cyan
Write-Host "  测试账号:       dev@example.com / password" -ForegroundColor Cyan

# 获取内网 IP（方便局域网分享）
try {
    $ipInfo = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch 'Loopback' -and $_.IPAddress -notmatch '^169\.' } | Select-Object -First 1
    if ($ipInfo) {
        Write-Host "  局域网地址:     http://$($ipInfo.IPAddress):3000/" -ForegroundColor Magenta
        Write-Host "  （好友需在同一局域网，且防火墙放行 3000 端口）" -ForegroundColor Gray
    }
} catch { }

if ($cpolarStarted) {
    Write-Host ""
    Write-Host "  友情提示:" -ForegroundColor Yellow
    Write-Host "  - 公网地址每次启动会变化（免费版），关闭服务后自动失效" -ForegroundColor Gray
    Write-Host "  - cpolar 仪表盘: http://127.0.0.1:4040/" -ForegroundColor Gray
    Write-Host "  - 停止服务后请手动结束 cpolar 进程（任务管理器搜 cpolar）" -ForegroundColor Gray
}

# ====== 6. (可选) 启动守护脚本 ======
$watchdogProc = $null
if ($Watchdog) {
    $stepNumWd = if ($Share) { "6/6" } else { "5/5" }
    Write-Host ""
    Write-Host "[$stepNumWd] 启动守护脚本（自动重启异常进程）..." -ForegroundColor Yellow
    $watchdogLog = Join-Path $ScriptDir "watchdog.log"
    $watchdogArgs = @("-File", (Join-Path $ScriptDir "ops-watchdog.ps1"), "-IntervalSec", "20")
    if ($Share) { $watchdogArgs += "-Share" }
    try {
        $watchdogProc = Start-Process -FilePath "powershell.exe" `
            -ArgumentList $watchdogArgs `
            -WindowStyle Minimized `
            -PassThru
        Write-Host "  [OK] 守护脚本已后台运行 (PID: $($watchdogProc.Id))" -ForegroundColor Green
        Write-Host "  - 检查间隔: 20秒 | 日志: $watchdogLog" -ForegroundColor Gray
        Write-Host "  - 会自动重启异常的后端服务和 cpolar 隧道" -ForegroundColor Gray
    } catch {
        Write-Host "  [WARN] 守护脚本启动失败: $_" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "  按 Ctrl+C 停止服务" -ForegroundColor Gray
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

Push-Location $ServerDir
try {
    npm start
} finally {
    Pop-Location
    # Ctrl+C 退出后，顺手结束守护进程
    if ($watchdogProc -and -not $watchdogProc.HasExited) {
        try {
            Stop-Process -Id $watchdogProc.Id -Force -ErrorAction SilentlyContinue
            Write-Host "[INFO] 守护进程 (PID: $($watchdogProc.Id)) 已停止" -ForegroundColor Gray
        } catch { }
    }
}
