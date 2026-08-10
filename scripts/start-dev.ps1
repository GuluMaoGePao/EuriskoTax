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
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
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
if ($Share) {
    $cpolarDir = Join-Path $ProjectRoot "cpolar"
    $cpolarExe = Join-Path $cpolarDir "cpolar.exe"

    Write-Host ""
    Write-Host "[4/5] 启动 cpolar 公网分享..." -ForegroundColor Yellow

    if (-not (Test-Path $cpolarExe)) {
        Write-Host "  [WARN] 未找到 cpolar.exe: $cpolarExe" -ForegroundColor Yellow
        Write-Host "  跳过公网分享，仅本地访问" -ForegroundColor Gray
    } elseif (-not (Test-Path "$env:USERPROFILE\.cpolar\cpolar.yml")) {
        Write-Host "  [WARN] cpolar 未配置 authtoken" -ForegroundColor Yellow
        Write-Host "  请运行: .\cpolar\cpolar.exe authtoken <你的token>" -ForegroundColor Gray
        Write-Host "  跳过公网分享，仅本地访问" -ForegroundColor Gray
    } else {
        # 先清理可能残留的 cpolar 进程
        Get-Process -Name "cpolar" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1

        # 后台启动 cpolar（cn 地区），输出重定向到临时文件
        $cpolarLog = Join-Path $env:TEMP "cpolar-euriskotax.log"
        Start-Process -FilePath $cpolarExe `
            -ArgumentList "http", "3000", "-region=cn", "-log=stdout" `
            -WindowStyle Hidden `
            -RedirectStandardOutput $cpolarLog `
            -RedirectStandardError $cpolarLog `
            -PassThru | Out-Null

        Write-Host "  等待隧道建立..." -ForegroundColor Gray
        $tunnelUrl = $null
        for ($i = 0; $i -lt 15; $i++) {
            Start-Sleep -Seconds 2
            # 从 cpolar 日志文件中解析公网URL（日志含 "Tunnel established at <url>" 行）
            if (Test-Path $cpolarLog) {
                $logContent = Get-Content $cpolarLog -Raw -ErrorAction SilentlyContinue
                if ($logContent) {
                    # 优先匹配 https 地址
                    $httpsMatch = [regex]::Match($logContent, 'Tunnel established at (https://[^\s"]+)')
                    if ($httpsMatch.Success) {
                        $tunnelUrl = $httpsMatch.Groups[1].Value
                        break
                    }
                    # 退而求其次匹配 http 地址
                    $httpMatch = [regex]::Match($logContent, 'Tunnel established at (http://[^\s"]+)')
                    if ($httpMatch.Success) {
                        $tunnelUrl = $httpMatch.Groups[1].Value
                        break
                    }
                }
            }
        }

        if ($tunnelUrl) {
            $cpolarStarted = $true
            Write-Host "  [OK] cpolar 隧道已建立" -ForegroundColor Green
            Write-Host "  公网分享地址: $tunnelUrl" -ForegroundColor Magenta
        } else {
            Write-Host "  [WARN] cpolar 隧道建立超时（15秒内未获取到公网地址）" -ForegroundColor Yellow
            Write-Host "  可手动访问 cpolar 仪表盘查看: http://127.0.0.1:4040/" -ForegroundColor Gray
        }
    }
} else {
    Write-Host ""
    Write-Host "  (未启用 cpolar 公网分享，加 -Share 参数可生成公网地址)" -ForegroundColor Gray
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
    $watchdogLog = Join-Path $ProjectRoot "watchdog.log"
    $watchdogArgs = @("-File", (Join-Path $ProjectRoot "watchdog.ps1"), "-IntervalSec", "20")
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
