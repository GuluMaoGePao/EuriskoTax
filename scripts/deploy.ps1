# EuriskoTax 一键部署脚本 (PowerShell)
# 功能：打包项目 → 传输到服务器 → 安装依赖 → 数据库迁移 → 重启服务 → 健康检查
#
# 用法：
#   .\scripts\deploy.ps1                          # 使用 deploy.config.json 部署
#   .\scripts\deploy.ps1 -DryRun                  # 仅打包预览，不实际部署
#   .\scripts\deploy.ps1 -SkipTest                # 跳过测试直接部署
#   .\scripts\deploy.ps1 -Rollback                # 回滚到上一版本
#   .\scripts\deploy.ps1 -InitEnv                 # 在服务器上初始化 .env.shared（首次部署前执行）
#   .\scripts\deploy.ps1 -ConfigPath custom.json  # 指定配置文件
#
# 前置条件：
#   1. 复制 deploy.config.example.json 为 deploy.config.json 并填入服务器信息
#   2. 本机安装 OpenSSH（Windows 10+ 自带）或 PuTTY（需 plink/pscp）
#   3. 服务器已安装 Node.js 18+ 和 npm
#   4. 如使用 PM2，服务器需安装 pm2 (npm install -g pm2)
#   5. 首次部署前运行 -InitEnv 在服务器创建 .env.shared（敏感变量不经过本地）

param(
    [switch]$DryRun,
    [switch]$SkipTest,
    [switch]$Rollback,
    [switch]$InitEnv,
    [string]$ConfigPath = ""
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

# ====== 日志函数 ======
function Write-DeployLog {
    param([string]$Level, [string]$Msg)
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$ts] [$Level] $Msg"
    $color = switch ($Level) {
        "INFO"  { "Cyan" }
        "OK"    { "Green" }
        "WARN"  { "Yellow" }
        "ERROR" { "Red" }
        default { "Gray" }
    }
    Write-Host $line -ForegroundColor $color
}

# ====== 加载配置 ======
function Load-DeployConfig {
    param([string]$Path)
    if (-not $Path) {
        $Path = Join-Path $ScriptDir "deploy.config.json"
    }
    if (-not (Test-Path $Path)) {
        Write-DeployLog "ERROR" "部署配置文件不存在: $Path"
        Write-DeployLog "INFO" "请复制模板: cp scripts/deploy.config.example.json scripts/deploy.config.json"
        exit 1
    }
    $raw = Get-Content $Path -Raw -Encoding UTF8
    $cfg = $raw | ConvertFrom-Json
    return $cfg
}

# ====== 检查本地工具 ======
function Test-LocalPrerequisites {
    Write-DeployLog "INFO" "检查本地环境..."

    # 检查 node
    $nodeVer = try { (node -v 2>$null) -replace 'v', '' } catch { $null }
    if (-not $nodeVer) {
        Write-DeployLog "ERROR" "未检测到 Node.js，请先安装"
        exit 1
    }
    Write-DeployLog "OK" "Node.js v$nodeVer"

    # 检查 SSH 客户端
    $sshAvailable = Get-Command ssh -ErrorAction SilentlyContinue
    if (-not $sshAvailable) {
        Write-DeployLog "ERROR" "未检测到 ssh 命令，请安装 OpenSSH 客户端"
        exit 1
    }
    Write-DeployLog "OK" "SSH 客户端可用"

    # 检查 tar（Windows 10 1803+ 自带 bsdtar）
    $tarAvailable = Get-Command tar -ErrorAction SilentlyContinue
    if (-not $tarAvailable) {
        Write-DeployLog "WARN" "未检测到 tar 命令，将使用 zip 打包"
    }
}

# ====== 运行测试 ======
function Invoke-Tests {
    Write-DeployLog "INFO" "运行测试套件..."
    Push-Location $ProjectRoot
    try {
        npm test 2>&1 | Out-Host
        if ($LASTEXITCODE -ne 0) {
            Write-DeployLog "ERROR" "测试失败，部署中止（使用 -SkipTest 跳过测试）"
            exit 1
        }
        Write-DeployLog "OK" "测试全部通过"
    } finally {
        Pop-Location
    }
}

# ====== 打包项目 ======
function New-DeployPackage {
    param($Config)
    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $packageName = "euriskotax-$timestamp"
    $tempDir = Join-Path $env:TEMP $packageName
    $archivePath = "$tempDir.tar.gz"

    Write-DeployLog "INFO" "打包项目到临时目录: $tempDir"

    # 清理旧的临时目录
    if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force }

    # 创建临时目录
    New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

    # 计算需要排除的模式
    $excludePatterns = $Config.build.excludePatterns
    $excludeArgs = $excludePatterns | ForEach-Object { "--exclude=$_" }

    # 使用 tar 打包（排除指定文件）
    Push-Location $ProjectRoot
    try {
        # 构造排除参数
        $excludeStr = ($excludePatterns | ForEach-Object { "--exclude='$_'" }) -join ' '
        $cmd = "tar -czf `"$archivePath`" $excludeStr -C `"$ProjectRoot`" ."
        Write-DeployLog "DEBUG" "打包命令: $cmd"
        Invoke-Expression $cmd 2>&1 | Out-Null
        if (-not (Test-Path $archivePath)) {
            Write-DeployLog "ERROR" "打包失败"
            exit 1
        }

        $sizeMB = [math]::Round((Get-Item $archivePath).Length / 1MB, 2)
        Write-DeployLog "OK" "打包完成: $archivePath ($sizeMB MB)"
    } finally {
        Pop-Location
    }

    return @{ Path = $archivePath; Timestamp = $timestamp }
}

# ====== SSH 执行远程命令 ======
function Invoke-RemoteCommand {
    param(
        $Config,
        [string]$Command,
        [int]$Timeout = 120
    )
    $srv = $Config.server
    $sshTarget = "$($srv.user)@$($srv.host)"
    $portArg = if ($srv.port -ne 22) { "-p $($srv.port)" } else { "" }

    # 构造 SSH 选项
    $sshOptions = @("-o", "StrictHostKeyChecking=accept-new", "-o", "ConnectTimeout=10")
    if ($srv.authMethod -eq "key" -and $srv.privateKeyPath) {
        $keyPath = $srv.privateKeyPath -replace "^~", $env:USERPROFILE
        $sshOptions += @("-i", $keyPath)
    }

    $allArgs = @($portArg.Split(' ')) + $sshOptions + @($sshTarget, $Command)
    $allArgs = $allArgs | Where-Object { $_ -ne "" }

    Write-DeployLog "DEBUG" "SSH: $Command"
    $result = & ssh @allArgs 2>&1
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
        Write-DeployLog "WARN" "SSH 命令退出码: $exitCode"
        Write-DeployLog "WARN" "输出: $result"
    }
    return @{ Output = $result; ExitCode = $exitCode }
}

# ====== 上传文件 ======
function Send-FileToServer {
    param($Config, [string]$LocalPath, [string]$RemotePath)
    $srv = $Config.server
    $sshTarget = "$($srv.user)@$($srv.host)"
    $portArg = if ($srv.port -ne 22) { "-P $($srv.port)" } else { "" }

    $scpOptions = @("-o", "StrictHostKeyChecking=accept-new", "-o", "ConnectTimeout=10")
    if ($srv.authMethod -eq "key" -and $srv.privateKeyPath) {
        $keyPath = $srv.privateKeyPath -replace "^~", $env:USERPROFILE
        $scpOptions += @("-i", $keyPath)
    }

    $allArgs = @($portArg.Split(' ')) + $scpOptions + @($LocalPath, "${sshTarget}:$RemotePath")
    $allArgs = $allArgs | Where-Object { $_ -ne "" }

    Write-DeployLog "INFO" "上传文件: $LocalPath -> ${sshTarget}:$RemotePath"
    & scp @allArgs 2>&1 | Out-Host
    if ($LASTEXITCODE -ne 0) {
        Write-DeployLog "ERROR" "文件上传失败"
        exit 1
    }
    Write-DeployLog "OK" "上传完成"
}

# ====== 服务器环境检查 ======
function Test-ServerPrerequisites {
    param($Config)
    Write-DeployLog "INFO" "检查服务器环境..."

    # 检查 Node.js
    $result = Invoke-RemoteCommand -Config $Config -Command "node -v 2>/dev/null || echo 'NODE_NOT_FOUND'"
    if ($result.Output -match "NODE_NOT_FOUND") {
        Write-DeployLog "ERROR" "服务器未安装 Node.js，请安装 Node.js $($Config.deploy.nodeVersion)+"
        Write-DeployLog "INFO" "Ubuntu/Debian: curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - && sudo apt-get install -y nodejs"
        exit 1
    }
    $remoteNodeVer = ($result.Output -replace 'v', '').Trim()
    Write-DeployLog "OK" "服务器 Node.js: v$remoteNodeVer"

    # 检查 PM2（如配置使用）
    if ($Config.deploy.processManager -eq "pm2") {
        $pm2Result = Invoke-RemoteCommand -Config $Config -Command "pm2 -v 2>/dev/null || echo 'PM2_NOT_FOUND'"
        if ($pm2Result.Output -match "PM2_NOT_FOUND") {
            Write-DeployLog "WARN" "服务器未安装 PM2，正在安装..."
            $installResult = Invoke-RemoteCommand -Config $Config -Command "npm install -g pm2 2>&1" -Timeout 60
            if ($installResult.ExitCode -ne 0) {
                Write-DeployLog "ERROR" "PM2 安装失败，请手动安装: npm install -g pm2"
                exit 1
            }
            Write-DeployLog "OK" "PM2 安装完成"
        } else {
            Write-DeployLog "OK" "服务器 PM2: v$($pm2Result.Output.Trim())"
        }
    }

    # 创建部署目录
    $remotePath = $Config.deploy.remotePath
    $releasesDir = "$remotePath/releases"
    $result = Invoke-RemoteCommand -Config $Config -Command "mkdir -p $releasesDir && echo 'OK'"
    if ($result.Output -notmatch "OK") {
        Write-DeployLog "ERROR" "无法创建部署目录: $releasesDir"
        exit 1
    }
    Write-DeployLog "OK" "部署目录就绪: $releasesDir"
}

# ====== 同步服务器环境变量文件 ======
# 从服务器 .env.shared 读取敏感环境变量，复制到新版本的 server/.env
# 避免在本地配置文件中存储 JWT_SECRET、DATABASE_URL 等敏感信息
function Sync-RemoteEnvFile {
    param($Config, [string]$ReleaseDir)
    $serverEnvFile = $Config.env.serverEnvFile
    if (-not $serverEnvFile) {
        $serverEnvFile = "$($Config.deploy.remotePath)/.env.shared"
    }
    $targetEnvFile = "$ReleaseDir/server/.env"

    Write-DeployLog "INFO" "从服务器读取环境变量: $serverEnvFile -> $targetEnvFile"

    # 检查服务器上 .env.shared 是否存在
    $checkResult = Invoke-RemoteCommand -Config $Config -Command "test -f $serverEnvFile && echo 'ENV_EXISTS' || echo 'ENV_NOT_FOUND'"

    if ($checkResult.Output -match "ENV_NOT_FOUND") {
        # 首次部署：引导用户在服务器上创建 .env.shared
        Write-DeployLog "WARN" "服务器环境变量文件不存在: $serverEnvFile"
        Write-DeployLog "INFO" "首次部署需要在服务器上创建环境变量文件。请在服务器上执行："
        Write-Host ""
        Write-Host "  ssh $($Config.server.user)@$($Config.server.host)" -ForegroundColor Yellow
        Write-Host "  cat > $serverEnvFile << 'EOF'" -ForegroundColor Yellow
        Write-Host "  JWT_SECRET=your_strong_secret_here" -ForegroundColor Yellow
        Write-Host "  DATABASE_URL=file:./prod.db" -ForegroundColor Yellow
        Write-Host "  EOF" -ForegroundColor Yellow
        Write-Host "  chmod 600 $serverEnvFile  # 限制权限" -ForegroundColor Yellow
        Write-Host ""
        Write-DeployLog "INFO" "创建后重新运行部署脚本。"
        exit 1
    }

    # 从 .env.shared 复制到新版本，并追加非敏感的默认变量
    $defaultVars = @()
    $Config.env.PSObject.Properties | Where-Object { $_.Name -notmatch "^_" -and $_.Name -ne "serverEnvFile" } | ForEach-Object {
        $defaultVars += "$($_.Name)=$($_.Value)"
    }
    $defaultsStr = $defaultVars -join "`n"
    $escapedDefaults = $defaultsStr -replace "'", "'\''"

    # 合并：先复制 .env.shared，再追加默认变量（不覆盖已存在的 key）
    $mergeCmd = "cp $serverEnvFile $targetEnvFile && echo '$escapedDefaults' >> $targetEnvFile && echo 'ENV_SYNCED' && wc -l $targetEnvFile"
    $result = Invoke-RemoteCommand -Config $Config -Command $mergeCmd
    if ($result.Output -notmatch "ENV_SYNCED") {
        Write-DeployLog "ERROR" "环境变量同步失败"
        Write-DeployLog "ERROR" $result.Output
        exit 1
    }

    # 提取行数信息
    $lineCount = ($result.Output | Select-String "(\d+) $targetEnvFile").Matches.Groups[1].Value
    Write-DeployLog "OK" "环境变量已同步（$lineCount 行）从 $serverEnvFile"

    # 验证关键变量是否存在
    $validateCmd = "grep -c 'JWT_SECRET' $targetEnvFile && grep -c 'DATABASE_URL' $targetEnvFile && echo 'ENV_VALID'"
    $validateResult = Invoke-RemoteCommand -Config $Config -Command $validateCmd
    if ($validateResult.Output -notmatch "ENV_VALID") {
        Write-DeployLog "WARN" "环境变量文件中可能缺少 JWT_SECRET 或 DATABASE_URL"
        Write-DeployLog "WARN" "请在服务器 $serverEnvFile 中补充这些变量"
    } else {
        Write-DeployLog "OK" "关键环境变量验证通过（JWT_SECRET, DATABASE_URL）"
    }
}

# ====== 执行远程部署 ======
function Invoke-RemoteDeploy {
    param($Config, $Package)
    $remotePath = $Config.deploy.remotePath
    $releasesDir = "$remotePath/releases"
    $releaseDir = "$releasesDir/$($Package.Timestamp)"
    $processManager = $Config.deploy.processManager
    $processName = $Config.deploy.processName

    # 1. 上传包文件
    $remoteArchive = "/tmp/euriskotax-$($Package.Timestamp).tar.gz"
    Send-FileToServer -Config $Config -LocalPath $Package.Path -RemotePath $remoteArchive

    # 2. 解压到发布目录
    Write-DeployLog "INFO" "解压到发布目录: $releaseDir"
    $result = Invoke-RemoteCommand -Config $Config -Command "mkdir -p $releaseDir && tar -xzf $remoteArchive -C $releaseDir && rm -f $remoteArchive && echo 'EXTRACT_OK'"
    if ($result.Output -notmatch "EXTRACT_OK") {
        Write-DeployLog "ERROR" "解压失败"
        exit 1
    }
    Write-DeployLog "OK" "解压完成"

    # 3. 从服务器同步环境变量（不再从本地注入敏感信息）
    Sync-RemoteEnvFile -Config $Config -ReleaseDir $releaseDir

    # 4. 安装后端依赖 + Prisma 迁移
    Write-DeployLog "INFO" "安装后端依赖（可能需要 1-2 分钟）..."
    $installCmd = "cd $releaseDir/server && npm install --production 2>&1 && npx prisma generate 2>&1 && npx prisma migrate deploy 2>&1 && echo 'INSTALL_OK'"
    $result = Invoke-RemoteCommand -Config $Config -Command $installCmd -Timeout 180
    if ($result.Output -notmatch "INSTALL_OK") {
        Write-DeployLog "ERROR" "依赖安装或迁移失败"
        Write-DeployLog "ERROR" $result.Output
        exit 1
    }
    Write-DeployLog "OK" "依赖安装 + 数据库迁移完成"

    # 5. 执行 preDeploy hook
    if ($Config.hooks.preDeploy) {
        Write-DeployLog "INFO" "执行 preDeploy hook..."
        Invoke-RemoteCommand -Config $Config -Command $Config.hooks.preDeploy | Out-Null
    }

    # 6. 切换 current 软链接
    $currentLink = "$remotePath/current"
    Write-DeployLog "INFO" "切换 current 软链接..."
    $switchCmd = "cd $remotePath && if [ -L current ] || [ -d current ]; then rm -f current; fi && ln -s $releaseDir current && echo 'SWITCH_OK'"
    $result = Invoke-RemoteCommand -Config $Config -Command $switchCmd
    if ($result.Output -notmatch "SWITCH_OK") {
        Write-DeployLog "ERROR" "软链接切换失败"
        exit 1
    }
    Write-DeployLog "OK" "current -> $releaseDir"

    # 7. 重启进程
    $serverDir = "$currentLink/server"
    if ($processManager -eq "pm2") {
        Write-DeployLog "INFO" "通过 PM2 重启服务..."
        $restartCmd = "cd $serverDir && pm2 delete $processName 2>/dev/null; pm2 start src/app.js --name $processName && pm2 save && echo 'PM2_OK'"
        $result = Invoke-RemoteCommand -Config $Config -Command $restartCmd
        if ($result.Output -notmatch "PM2_OK") {
            # 如果 delete 失败（首次部署），尝试直接 start
            $startCmd = "cd $serverDir && pm2 start src/app.js --name $processName && pm2 save && echo 'PM2_OK'"
            $result = Invoke-RemoteCommand -Config $Config -Command $startCmd
        }
        if ($result.Output -notmatch "PM2_OK") {
            Write-DeployLog "ERROR" "PM2 启动失败"
            Write-DeployLog "ERROR" $result.Output
            exit 1
        }
        Write-DeployLog "OK" "PM2 服务已启动: $processName"

        # 设置开机自启
        $startupResult = Invoke-RemoteCommand -Config $Config -Command "pm2 startup 2>&1 | tail -1"
        Write-DeployLog "INFO" "PM2 开机自启: $($startupResult.Output)"

    } elseif ($processManager -eq "systemd") {
        Write-DeployLog "INFO" "通过 systemd 重启服务..."
        $svcName = $processName
        $serviceContent = @"
[Unit]
Description=EuriskoTax Server
After=network.target

[Service]
Type=simple
User=$($Config.server.user)
WorkingDirectory=$serverDir
ExecStart=$(which node) src/app.js
Restart=on-failure
RestartSec=5
EnvironmentFile=$serverDir/.env

[Install]
WantedBy=multi-user.target
"@
        $escapedSvc = $serviceContent -replace "'", "'\''"
        $svcCmd = "echo '$escapedSvc' | sudo tee /etc/systemd/system/$svcName.service > /dev/null && sudo systemctl daemon-reload && sudo systemctl restart $svcName && sudo systemctl enable $svcName && echo 'SYSTEMD_OK'"
        $result = Invoke-RemoteCommand -Config $Config -Command $svcCmd
        if ($result.Output -notmatch "SYSTEMD_OK") {
            Write-DeployLog "ERROR" "systemd 服务启动失败"
            exit 1
        }
        Write-DeployLog "OK" "systemd 服务已启动: $svcName"

    } else {
        # 直接运行（nohup）
        Write-DeployLog "INFO" "通过 nohup 启动服务..."
        $directCmd = "cd $serverDir && pkill -f 'node src/app.js' 2>/dev/null; nohup node src/app.js > /var/log/euriskotax.log 2>&1 & echo 'DIRECT_OK'"
        $result = Invoke-RemoteCommand -Config $Config -Command $directCmd
        if ($result.Output -notmatch "DIRECT_OK") {
            Write-DeployLog "ERROR" "服务启动失败"
            exit 1
        }
        Write-DeployLog "OK" "服务已启动 (nohup)"
    }

    # 8. 执行 postDeploy hook
    if ($Config.hooks.postDeploy) {
        Write-DeployLog "INFO" "执行 postDeploy hook..."
        Invoke-RemoteCommand -Config $Config -Command $Config.hooks.postDeploy | Out-Null
    }

    # 9. 清理旧版本
    $keepReleases = $Config.deploy.keepReleases
    Write-DeployLog "INFO" "清理旧版本（保留最近 $keepReleases 个）..."
    $cleanupCmd = "cd $releasesDir && ls -dt */ | tail -n +$($keepReleases + 1) | xargs rm -rf 2>/dev/null; echo 'CLEANUP_OK'"
    Invoke-RemoteCommand -Config $Config -Command $cleanupCmd | Out-Null
    Write-DeployLog "OK" "旧版本清理完成"
}

# ====== 健康检查 ======
function Invoke-HealthCheck {
    param($Config)
    $healthPath = $Config.hooks.healthCheckPath
    $timeout = $Config.hooks.healthCheckTimeout
    $port = $Config.env.PORT

    Write-DeployLog "INFO" "健康检查（最多等待 ${timeout}s）..."

    $checkCmd = "for i in `$(seq 1 $timeout); do sleep 1; resp=`$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$port$healthPath 2>/dev/null); if [ '`$resp' != '000' ] && [ '`$resp' != '' ]; then echo HTTP_`$resp; exit 0; fi; done; echo 'HEALTH_TIMEOUT'"
    $result = Invoke-RemoteCommand -Config $Config -Command $checkCmd -Timeout ($timeout + 30)

    if ($result.Output -match "HEALTH_TIMEOUT") {
        Write-DeployLog "ERROR" "健康检查超时，服务可能未正常启动"
        Write-DeployLog "INFO" "请检查日志: ssh $($Config.server.user)@$($Config.server.host) 'pm2 logs $($Config.deploy.processName) --lines 20'"
        exit 1
    } elseif ($result.Output -match "HTTP_(\d+)") {
        $code = $matches[1]
        if ($code -eq "200" -or $code -eq "401") {
            Write-DeployLog "OK" "健康检查通过 (HTTP $code)"
        } else {
            Write-DeployLog "WARN" "健康检查返回 HTTP $code（401 为正常，表示需要认证）"
        }
    }
}

# ====== 回滚 ======
function Invoke-Rollback {
    param($Config)
    $remotePath = $Config.deploy.remotePath
    $releasesDir = "$remotePath/releases"

    Write-DeployLog "INFO" "获取历史版本列表..."
    $result = Invoke-RemoteCommand -Config $Config -Command "ls -dt $releasesDir/*/ 2>/dev/null | head -5"
    $versions = $result.Output | Where-Object { $_ -match "\d{8}-\d{6}" }

    if ($versions.Count -lt 2) {
        Write-DeployLog "ERROR" "可回滚的版本不足（当前仅有 $($versions.Count) 个版本）"
        exit 1
    }

    # 当前版本是第1个，回滚到第2个
    $targetVersion = $versions[1].Trim()
    Write-DeployLog "INFO" "回滚到: $targetVersion"

    $switchCmd = "cd $remotePath && rm -f current && ln -s $targetVersion current && echo 'ROLLBACK_OK'"
    $result = Invoke-RemoteCommand -Config $Config -Command $switchCmd
    if ($result.Output -notmatch "ROLLBACK_OK") {
        Write-DeployLog "ERROR" "回滚失败"
        exit 1
    }

    # 重启服务
    $processManager = $Config.deploy.processManager
    $processName = $Config.deploy.processName
    $serverDir = "$remotePath/current/server"

    if ($processManager -eq "pm2") {
        Invoke-RemoteCommand -Config $Config -Command "cd $serverDir && pm2 restart $processName && echo 'RESTART_OK'" | Out-Null
    }

    Write-DeployLog "OK" "回滚完成，已切换到: $targetVersion"
}

# ====== 主流程 ======
Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  EuriskoTax 一键部署脚本 v1.0" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# 加载配置
$Config = Load-DeployConfig -Path $ConfigPath
Write-DeployLog "INFO" "目标服务器: $($Config.server.user)@$($Config.server.host):$($Config.server.port)"
Write-DeployLog "INFO" "部署路径:   $($Config.deploy.remotePath)"
Write-DeployLog "INFO" "进程管理:   $($Config.deploy.processManager) (name=$($Config.deploy.processName))"

# 回滚模式
if ($Rollback) {
    Invoke-Rollback -Config $Config
    Write-Host ""
    Write-DeployLog "OK" "回滚操作完成"
    exit 0
}

# InitEnv 模式：在服务器上初始化 .env.shared 文件
if ($InitEnv) {
    Write-DeployLog "INFO" "InitEnv 模式：在服务器上初始化环境变量文件"
    $serverEnvFile = $Config.env.serverEnvFile
    if (-not $serverEnvFile) {
        $serverEnvFile = "$($Config.deploy.remotePath)/.env.shared"
    }

    # 检查是否已存在
    $checkResult = Invoke-RemoteCommand -Config $Config -Command "test -f $serverEnvFile && echo 'EXISTS' || echo 'NOT_EXISTS'"

    if ($checkResult.Output -match "EXISTS") {
        Write-DeployLog "WARN" "环境变量文件已存在: $serverEnvFile"
        $readResult = Invoke-RemoteCommand -Config $Config -Command "cat $serverEnvFile | grep -E '^[A-Z]' | sed 's/=.*/=***/' "
        Write-DeployLog "INFO" "当前变量（值已脱敏）:"
        Write-Host $readResult.Output -ForegroundColor Gray
        Write-Host ""
        $overwrite = Read-Host "是否覆盖？(y/N)"
        if ($overwrite -ne "y") {
            Write-DeployLog "INFO" "操作取消"
            exit 0
        }
    }

    # 交互式收集敏感变量
    Write-Host ""
    Write-Host "请输入环境变量（直接回车使用默认值）：" -ForegroundColor Yellow
    Write-Host ""
    $jwtSecret = Read-Host "  JWT_SECRET（必填，建议 32+ 字符随机串）"
    if (-not $jwtSecret) {
        $jwtSecret = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object { [char]$_ })
        Write-DeployLog "OK" "已自动生成 JWT_SECRET（32 字符随机串）"
    }
    $databaseUrl = Read-Host "  DATABASE_URL（默认: file:./prod.db）"
    if (-not $databaseUrl) { $databaseUrl = "file:./prod.db" }

    # 构建文件内容
    $envContent = @"
# EuriskoTax 生产环境变量（服务器端维护）
# 由 deploy.ps1 -InitEnv 生成于 $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
# 文件权限应设为 600（仅 owner 可读写）

JWT_SECRET=$jwtSecret
DATABASE_URL=$databaseUrl
"@

    # 确保远程目录存在并写入文件
    $remoteDir = Split-Path $serverEnvFile -Parent
    $escapedContent = $envContent -replace "'", "'\''"
    $writeCmd = "mkdir -p $remoteDir && echo '$escapedContent' > $serverEnvFile && chmod 600 $serverEnvFile && echo 'INIT_OK'"
    $result = Invoke-RemoteCommand -Config $Config -Command $writeCmd

    if ($result.Output -match "INIT_OK") {
        Write-DeployLog "OK" "环境变量文件已创建: $serverEnvFile（权限 600）"
        Write-DeployLog "INFO" "现在可以运行 .\scripts\deploy.ps1 正式部署"
    } else {
        Write-DeployLog "ERROR" "环境变量文件创建失败"
        Write-DeployLog "ERROR" $result.Output
    }
    exit 0
}

# DryRun 模式：仅打包预览
if ($DryRun) {
    Write-DeployLog "INFO" "DryRun 模式：仅打包预览，不实际部署"
    Test-LocalPrerequisites
    $package = New-DeployPackage -Config $Config
    Write-Host ""
    Write-DeployLog "OK" "打包完成（DryRun）"
    Write-DeployLog "INFO" "包文件: $($package.Path)"
    Write-DeployLog "INFO" "实际部署请去掉 -DryRun 参数"
    exit 0
}

# 正式部署流程
$deploySw = [System.Diagnostics.Stopwatch]::StartNew()

# 1. 本地环境检查
Test-LocalPrerequisites

# 2. 运行测试
if (-not $SkipTest) {
    Invoke-Tests
} else {
    Write-DeployLog "WARN" "已跳过测试（-SkipTest）"
}

# 3. 打包项目
$package = New-DeployPackage -Config $Config

# 4. 服务器环境检查
Test-ServerPrerequisites -Config $Config

# 5. 远程部署
Invoke-RemoteDeploy -Config $Config -Package $package

# 6. 健康检查
Invoke-HealthCheck -Config $Config

$deploySw.Stop()
Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-DeployLog "OK" "部署成功！耗时 $([math]::Round($deploySw.Elapsed.TotalSeconds, 1))s"
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "访问地址:" -ForegroundColor Cyan
Write-Host "  http://$($Config.server.host):$($Config.env.PORT)/" -ForegroundColor White
Write-Host "  API 文档: http://$($Config.server.host):$($Config.env.PORT)/api/docs" -ForegroundColor Gray
Write-Host ""
Write-Host "常用运维命令:" -ForegroundColor Cyan
Write-Host "  查看日志:   ssh $($Config.server.user)@$($Config.server.host) 'pm2 logs $($Config.deploy.processName)'" -ForegroundColor Gray
Write-Host "  查看状态:   ssh $($Config.server.user)@$($Config.server.host) 'pm2 status'" -ForegroundColor Gray
Write-Host "  回滚版本:   .\scripts\deploy.ps1 -Rollback" -ForegroundColor Gray
Write-Host ""
