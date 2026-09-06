# =============================================================================
# EuriskoTax 安全发布流水线 (verify -> commit -> push -> 线上核对)
#
# 纪律：本地 verify:local 全绿才允许 commit + push；push 后轮询线上指纹直至就绪。
# 这是所有"上线"动作的唯一入口（GUI: Git & 账号 -> 安全发布）。
#
# 用法：
#   .\tools\ops\ops-publish.ps1                         # 交互确认后发布（自动生成提交说明）
#   .\tools\ops\ops-publish.ps1 -CommitMsg "feat: xxx"  # 指定提交说明
#   .\tools\ops\ops-publish.ps1 -DryRun                 # 只跑本地验证门禁，不 commit/push
#   .\tools\ops\ops-publish.ps1 -SkipVerifyGenerate     # :3000 后端运行中占用引擎 DLL 时跳过 prisma generate
#   .\tools\ops\ops-publish.ps1 -Proxy "http://127.0.0.1:7890"  # push 走代理（仅本次生效，不改 git 全局配置）
# =============================================================================
param(
    [string]$CommitMsg = "",
    [string]$BaseUrl = "https://euriskotax.zeabur.app",
    [switch]$DryRun,
    [int]$PollMaxSeconds = 600,
    [switch]$SkipVerifyGenerate,
    [string]$Proxy = "",
    [int]$PushRetries = 3
)

$ScriptPath = $MyInvocation.MyCommand.Path
$OpsDir     = Split-Path -Parent $ScriptPath
$ToolsDir   = Split-Path -Parent $OpsDir
$ProjectRoot = Split-Path -Parent $ToolsDir
$ServerDir  = Join-Path $ProjectRoot "server"
$VerifyScript = Join-Path $ServerDir "scripts\verify-local-auth.js"
$CheckScript  = Join-Path $OpsDir "ops-check-prod.ps1"

function Exit-Fail {
    param([string]$Msg)
    Write-Host ""
    Write-Host "[FAIL] $Msg" -ForegroundColor Red
    Write-Host "      已中止发布：未推送任何代码到线上。请修复后重试。" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  EuriskoTax 安全发布流水线" -ForegroundColor Cyan
Write-Host "  流程: 本地验证门禁 -> commit -> push -> 线上核对" -ForegroundColor Cyan
if ($DryRun) { Write-Host "  模式: DRY-RUN（只跑本地验证，不提交、不推送）" -ForegroundColor Magenta }
Write-Host "=============================================" -ForegroundColor Cyan

# ---- 0. 前置检查 ----
if (-not (Test-Path $VerifyScript)) { Exit-Fail "找不到验证脚本: $VerifyScript" }
if (-not (Test-Path $CheckScript))   { Exit-Fail "找不到线上核对脚本: $CheckScript" }
if (-not (Test-Path (Join-Path $ProjectRoot ".git"))) { Exit-Fail "项目根目录不是 git 仓库: $ProjectRoot" }

# 只允许从 main 分支发布（避免 feature 分支被推到线上 main）
$branch = (& git -C $ProjectRoot rev-parse --abbrev-ref HEAD 2>&1 | Out-String).Trim()
if ($branch -ne "main") {
    if ($DryRun) {
        Write-Host "[警告] 当前分支是 '$branch'（DRY-RUN 仅验证本地，不推送，继续）" -ForegroundColor Yellow
    } else {
        Exit-Fail "当前分支是 '$branch'，不是 main。请先切回 main 再发布（GUI: Git & 账号 -> 快速切回 main）"
    }
}

# ---- [1/4] 本地验证门禁 ----
Write-Host ""
Write-Host "[1/4] 本地验证门禁 verify:local ..." -ForegroundColor Yellow
Write-Host "      （启动真实后端，跑 登录 dev 号 / 注册新号 / 新号登录 全链路）" -ForegroundColor Gray
if ($SkipVerifyGenerate) {
    Write-Host "      （-SkipVerifyGenerate：跳过 prisma generate，用于 :3000 后端运行中的场景）" -ForegroundColor Gray
    $env:VERIFY_SKIP_GENERATE = "1"
}
& node $VerifyScript
if ($LASTEXITCODE -ne 0) {
    Exit-Fail "本地登录链路验证未通过（verify:local 退出码 $LASTEXITCODE）。"
}
Write-Host "  [OK] 本地验证全绿" -ForegroundColor Green

if ($DryRun) {
    Write-Host ""
    Write-Host "=============================================" -ForegroundColor Green
    Write-Host "  DRY-RUN 结束：本地验证通过。" -ForegroundColor Green
    Write-Host "  正式发布将接着执行: git add -A -> commit -> push origin main -> 线上核对" -ForegroundColor Gray
    Write-Host "=============================================" -ForegroundColor Green
    exit 0
}

# ---- 检查工作区改动 ----
$dirty = (& git -C $ProjectRoot status --porcelain | Out-String).Trim()
if ([string]::IsNullOrWhiteSpace($dirty)) {
    Write-Host ""
    Write-Host "[INFO] 工作区无未提交改动，跳过 commit（仍会 push 并核对线上）。" -ForegroundColor Gray
} else {
    # ---- [2/4] 提交 ----
    if ([string]::IsNullOrWhiteSpace($CommitMsg)) {
        $CommitMsg = "publish: 本地验证全绿后上线 (auto " + (Get-Date -Format "MM-dd HH:mm") + ")"
    }
    # 防注入：提交说明去除换行与单引号，保证 git 参数安全
    $CommitMsg = $CommitMsg -replace "['`r`n]", " "
    Write-Host ""
    Write-Host "[2/4] 提交改动 ..." -ForegroundColor Yellow
    Write-Host "  提交说明: $CommitMsg" -ForegroundColor Gray
    & git -C $ProjectRoot add -A
    if ($LASTEXITCODE -ne 0) { Exit-Fail "git add -A 失败" }
    & git -C $ProjectRoot commit -m $CommitMsg
    if ($LASTEXITCODE -ne 0) { Exit-Fail "git commit 失败" }
    Write-Host "  [OK] 已提交" -ForegroundColor Green
}

# ---- [3/4] 推送（带重试；可选 -Proxy 仅本次生效，不改 git 全局配置） ----
Write-Host ""
Write-Host "[3/4] 推送到远程 main ..." -ForegroundColor Yellow
$pushArgs = @("-C", $ProjectRoot)
if ($Proxy) {
    $pushArgs += @("-c", "http.proxy=$Proxy", "-c", "https.proxy=$Proxy")
    Write-Host "  使用代理: $Proxy（仅本次 push 生效）" -ForegroundColor Gray
}
$pushed = $false
for ($i = 1; $i -le $PushRetries; $i++) {
    if ($i -gt 1) { Write-Host "  [重试 $($i - 1)/$($PushRetries - 1)] push 失败，5s 后重试 ..." -ForegroundColor Yellow; Start-Sleep -Seconds 5 }
    & git @pushArgs push origin main
    if ($LASTEXITCODE -eq 0) { $pushed = $true; break }
}
if (-not $pushed) {
    Write-Host ""
    Write-Host "  [诊断] 网络不通或远程有冲突：先试 git ls-remote origin main 确认连通性。" -ForegroundColor Gray
    Write-Host "        远程有新提交时请先 git pull --rebase；网络受限时可加 -Proxy \"http://127.0.0.1:7890\" 重试。" -ForegroundColor Gray
    Exit-Fail "git push 失败（已重试 ${PushRetries} 次）。请检查网络/代理后重试。"
}
Write-Host "  [OK] 已推送" -ForegroundColor Green

# ---- [4/4] 线上核对（轮询直到部署指纹全绿或超时） ----
Write-Host ""
Write-Host "[4/4] 核对线上部署指纹: $BaseUrl" -ForegroundColor Yellow
Write-Host "  Zeabur 收到 push 后会重新构建（通常 2~6 分钟），将持续轮询直至通过或超时 ..." -ForegroundColor Gray
$interval = 20
$elapsed  = 0
$ok = $false
while ($elapsed -lt $PollMaxSeconds) {
    & powershell -NoProfile -ExecutionPolicy Bypass -File $CheckScript -BaseUrl $BaseUrl *> $null
    if ($LASTEXITCODE -eq 0) { $ok = $true; break }
    Start-Sleep -Seconds $interval
    $elapsed += $interval
    Write-Host "  ...已等待 ${elapsed}s，线上仍在构建/未更新，继续轮询 ..." -ForegroundColor Gray
}
if (-not $ok) {
    Exit-Fail "等待 ${PollMaxSeconds}s 后线上仍未就绪。请稍后手动执行 .\tools\ops\ops-check-prod.ps1 复核，或查看 Zeabur 构建日志。"
}

Write-Host ""
Write-Host "=============================================" -ForegroundColor Green
Write-Host "  ✅ 发布完成：本地验证全绿 -> 已推送 -> 线上已核对为新版本" -ForegroundColor Green
Write-Host "  线上地址: $BaseUrl" -ForegroundColor Cyan
Write-Host "  ⚠ 提醒: 浏览器首次访问请 Unregister Service Worker + Clear site data，避免看到旧缓存页面" -ForegroundColor Yellow
Write-Host "=============================================" -ForegroundColor Green
exit 0
