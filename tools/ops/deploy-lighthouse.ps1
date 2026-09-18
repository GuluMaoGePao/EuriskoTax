# 一键部署到腾讯云轻量服务器（上海，Docker CE 镜像）
#
# 做的事：本地打包仓库（排除 .git/node_modules/tests/docs 等）→ scp 上服务器
#         → 解压 → docker compose up -d --build → 健康检查
#
# 前提：
#   1. 腾讯云轻量服务器（Docker CE 应用镜像），安全组放行 80/443/22
#   2. SSH 私钥已放本机（创建密钥时下载的那个文件），例如：
#        $env:USERPROFILE\.ssh\euriskoTax_ssh
#   3. 服务器上已有部署配置：
#        /opt/euriskotax/deploy/lighthouse/.env   （由 .env.example 复制并填写）
#      没有的话脚本会中止并提示，密钥不在本地生成。
#
# 用法：
#   powershell -File tools/ops/deploy-lighthouse.ps1 -ServerIp <公网IP>
#   powershell -File tools/ops/deploy-lighthouse.ps1 -ServerIp <公网IP> -User root -KeyPath C:\path\to\key
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ServerIp,
    [string]$User = 'root',
    [string]$KeyPath = "$env:USERPROFILE\.ssh\euriskoTax_ssh",
    [string]$RemoteDir = '/opt/euriskotax'
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

if (-not (Test-Path $KeyPath)) {
    throw "找不到 SSH 私钥：$KeyPath —— 创建腾讯云密钥时下载的私钥文件请放到这里"
}

# ---- 1. 本地打包（排除无需上服务器的目录）----
$tar = Join-Path $env:TEMP 'euriskotax-deploy.tar.gz'
if (Test-Path $tar) { Remove-Item $tar -Force }

Push-Location $root
try {
    tar -czf $tar `
        --exclude '.git' --exclude 'node_modules' --exclude 'tests' `
        --exclude 'docs' --exclude 'coverage' --exclude '.codebuddy' `
        --exclude 'temp' --exclude '.trae' `
        -C $root .
    if ($LASTEXITCODE -ne 0) { throw "本地打包失败" }
}
finally { Pop-Location }

$sizeMb = [math]::Round((Get-Item $tar).Length / 1MB, 1)
Write-Host "[1/4] 打包完成：$tar ($sizeMb MB)" -ForegroundColor Cyan

# ---- 2. 上传 ----
ssh -i $KeyPath -o StrictHostKeyChecking=accept-new "$User@$ServerIp" "mkdir -p $RemoteDir"
scp -i $KeyPath -o StrictHostKeyChecking=accept-new $tar "${User}@${ServerIp}:/tmp/euriskotax-deploy.tar.gz"
if ($LASTEXITCODE -ne 0) { throw "上传失败" }
Write-Host "[2/4] 上传完成" -ForegroundColor Cyan

# ---- 3. 解压 + 构建 + 启动 ----
$remote = "set -e; cd $RemoteDir; tar -xzf /tmp/euriskotax-deploy.tar.gz -C $RemoteDir; rm -f /tmp/euriskotax-deploy.tar.gz; " +
          "if [ ! -f deploy/lighthouse/.env ]; then echo 'MISSING_ENV'; exit 9; fi; " +
          "docker compose -f deploy/lighthouse/docker-compose.yml up -d --build 2>&1 | tail -n 5; " +
          "docker compose -f deploy/lighthouse/docker-compose.yml ps --format 'table {{.Name}}\t{{.Status}}'"
ssh -i $KeyPath -o StrictHostKeyChecking=accept-new "$User@$ServerIp" $remote
if ($LASTEXITCODE -eq 9) {
    throw "服务器上还没有 $RemoteDir/deploy/lighthouse/.env —— 先 scp deploy/lighthouse/.env.example 上去，复制为 .env 填好密钥，再重跑本脚本"
}
if ($LASTEXITCODE -ne 0) { throw "远端构建/启动失败，SSH 登录后 cd $RemoteDir && docker compose -f deploy/lighthouse/docker-compose.yml logs app 排查" }
Write-Host "[3/4] 构建+启动完成" -ForegroundColor Cyan

# ---- 4. 健康检查 ----
Start-Sleep -Seconds 5
$ok = ssh -i $KeyPath -o StrictHostKeyChecking=accept-new "$User@$ServerIp" "curl -sf -o /dev/null -w '%{http_code}' http://127.0.0.1/health"
if ($ok -eq '200') {
    Write-Host "[4/4] /health = 200，部署成功：http://$ServerIp/" -ForegroundColor Green
} else {
    Write-Host "[4/4] 健康检查返回 '$ok' —— 看日志：ssh -i $KeyPath $User@$ServerIp `"cd $RemoteDir && docker compose -f deploy/lighthouse/docker-compose.yml logs --tail 50 app`"" -ForegroundColor Yellow
}
