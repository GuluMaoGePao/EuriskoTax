# =============================================================================
# EuriskoTax 本地 PostgreSQL 演练门禁 (verify:pg)
#
# 定位：verify:local 只能证明「SQLite 上是对的」，而线上是 PostgreSQL + 容器启动
#       `npx prisma migrate deploy` 建表。本脚本用 docker-compose.postgres.yml 起一个
#       临时 PostgreSQL，按**与生产完全相同的顺序**（generate → migrate deploy → 起服务）
#       把同一套 59 项 e2e 门禁再跑一遍，把「本地绿、上线炸」的迁移/字段类问题拦在本地。
#
# 用法：
#   npm run verify:pg                              # 等价于本脚本无参调用
#   .\tools\ops\ops-verify-pg.ps1 -Fresh           # 先删数据卷（等价「全新库首次部署」）
#   .\tools\ops\ops-verify-pg.ps1 -KeepRunning     # 跑完不停止容器（连续调试时省启动时间）
#   .\tools\ops\ops-verify-pg.ps1 -SkipVerifyGenerate  # 引擎 DLL 被 :3000 后端占用时
#
# 前置：本机已安装 Docker Desktop（`docker compose` 可用）；且**本地 :3000 后端需先停止**
#       （Windows 下运行中的后端会锁住 Prisma 引擎 DLL，generate 会报 EPERM）。
#
# 退出码：0 = 门禁全绿；1 = 门禁/环境失败；2 = 未安装 Docker（环境不满足，非代码问题）
# =============================================================================
param(
    [switch]$Fresh,
    [switch]$KeepRunning,
    [switch]$SkipVerifyGenerate
)

$ScriptPath  = $MyInvocation.MyCommand.Path
$OpsDir      = Split-Path -Parent $ScriptPath
$ToolsDir    = Split-Path -Parent $OpsDir
$ProjectRoot = Split-Path -Parent $ToolsDir
$ComposeFile = Join-Path $ProjectRoot "docker-compose.postgres.yml"
$VerifyScript = Join-Path $ProjectRoot "server\scripts\verify-local-auth.js"

# 与 docker-compose.postgres.yml 保持一致（改端口请两处同改）
$PgPort = 55432
$PgUser = "eurisko"
$PgPass = "eurisko_drill"
$PgDb   = "euriskotax_drill"
$ContainerName = "euriskotax-pg-drill"

function Write-Step {
    param([string]$Text)
    Write-Host ""
    Write-Host "[$Text]" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  EuriskoTax PostgreSQL 演练门禁 (verify:pg)" -ForegroundColor Cyan
Write-Host "  流程: 起演练库 -> generate -> migrate deploy -> 59 项 e2e" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan

# ---- 0. 前置检查：Docker 可用性 ----
Write-Step "0/4 检查 Docker 环境"
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "  [跳过] 未检测到 docker 命令 —— 演练门禁需要 Docker Desktop。" -ForegroundColor Yellow
    Write-Host "         这不是代码问题：本机没有 Docker 时，请继续使用 npm run verify:local（SQLite）。" -ForegroundColor Gray
    Write-Host "         想启用演练：安装 Docker Desktop 后重跑本命令，详见 docs/guides/development-workflow.md" -ForegroundColor Gray
    exit 2
}
& docker compose version *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host "  [跳过] docker 已安装但 docker compose 不可用（需要 Compose V2 插件）。" -ForegroundColor Yellow
    Write-Host "         Docker Desktop 自带该插件；若为独立安装的 docker CLI，请补装 compose 插件。" -ForegroundColor Gray
    exit 2
}
if (-not (Test-Path $ComposeFile)) {
    Write-Host "  [FAIL] 找不到 $ComposeFile" -ForegroundColor Red
    exit 1
}
if (-not (Test-Path $VerifyScript)) {
    Write-Host "  [FAIL] 找不到 $VerifyScript" -ForegroundColor Red
    exit 1
}
Write-Host "  [OK] Docker 与 Compose 可用" -ForegroundColor Green

# ---- 1. 准备演练库 ----
Write-Step "1/4 准备演练库（postgres:16-alpine，端口 $PgPort）"
if ($Fresh) {
    Write-Host "  -Fresh：销毁旧演练库数据卷（等价「全新库首次部署」）..." -ForegroundColor Gray
    & docker compose -f $ComposeFile down -v *> $null
} else {
    # 默认不删卷：复用上次数据，跑得更快，也更接近「已上线的库再升级」场景
    & docker compose -f $ComposeFile down *> $null
}
& docker compose -f $ComposeFile up -d
if ($LASTEXITCODE -ne 0) {
    Write-Host "  [FAIL] 演练库启动失败。常见原因：Docker Desktop 未运行 / 端口 $PgPort 被占用。" -ForegroundColor Red
    exit 1
}

# 等待健康检查通过（首次运行需要拉取镜像，可能较慢）
Write-Host "  等待 PostgreSQL 就绪（首次运行需拉取镜像，请稍候）..." -ForegroundColor Gray
$healthy = $false
for ($i = 1; $i -le 60; $i++) {
    $status = (& docker inspect --format "{{.State.Health.Status}}" $ContainerName 2>$null | Out-String).Trim()
    if ($status -eq "healthy") { $healthy = $true; break }
    Start-Sleep -Seconds 3
}
if (-not $healthy) {
    Write-Host "  [FAIL] 演练库 180s 内未就绪（当前状态: $status）。查看日志：" -ForegroundColor Red
    Write-Host "         docker compose -f docker-compose.postgres.yml logs --tail 40" -ForegroundColor Gray
    exit 1
}
Write-Host "  [OK] 演练库已就绪 → 127.0.0.1:$PgPort/$PgDb" -ForegroundColor Green

# ---- 2. 把 DATABASE_URL 指向演练库并进入 PG 模式 ----
Write-Step "2/4 切换验证目标为演练库"
$env:DATABASE_URL = "postgresql://${PgUser}:${PgPass}@127.0.0.1:${PgPort}/${PgDb}?schema=public"
$env:VERIFY_PG = "1"
if ($SkipVerifyGenerate) { $env:VERIFY_SKIP_GENERATE = "1" }
Write-Host "  DATABASE_URL = postgresql://${PgUser}:***@127.0.0.1:${PgPort}/${PgDb}" -ForegroundColor Gray
Write-Host "  （后面的 generate / migrate deploy / 后端启动 / e2e 全部打向这个演练库，不碰线上）" -ForegroundColor Gray

# ---- 3. 跑完整门禁 ----
Write-Step "3/4 运行 59 项 e2e 门禁（PostgreSQL 演练库）"
& node $VerifyScript
$verifyCode = $LASTEXITCODE

# ---- 4. 收尾 ----
Write-Step "4/4 收尾"
if ($verifyCode -eq 0) {
    Write-Host "  [OK] PostgreSQL 演练门禁全绿 —— 迁移与运行期行为在生产同构环境下可用" -ForegroundColor Green
} else {
    Write-Host "  [FAIL] 演练门禁未通过（退出码 $verifyCode）" -ForegroundColor Red
    Write-Host "         注意：这里失败往往就是「本地 SQLite 绿、推上线才炸」的那类问题，请先修再发布。" -ForegroundColor Yellow
}

if ($KeepRunning) {
    Write-Host "  -KeepRunning：保留演练库容器（下次启动更快）" -ForegroundColor Gray
} else {
    & docker compose -f $ComposeFile stop *> $null
    Write-Host "  演练库已停止（数据保留在卷 pg_drill_data；彻底清理：docker compose -f docker-compose.postgres.yml down -v）" -ForegroundColor Gray
}

Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
if ($verifyCode -eq 0) {
    Write-Host "  ✅ verify:pg 通过" -ForegroundColor Green
} else {
    Write-Host "  ❌ verify:pg 未通过（退出码 $verifyCode）" -ForegroundColor Red
}
Write-Host "=============================================" -ForegroundColor Cyan
exit $verifyCode
