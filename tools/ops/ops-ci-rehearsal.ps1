# ==============================================================================
# CI 门禁预演：干净克隆一份仓库，把 CI 的三步原样跑一遍
#
#   powershell -File tools\ops\ops-ci-rehearsal.ps1          # 跑完删除克隆副本
#   powershell -File tools\ops\ops-ci-rehearsal.ps1 -Keep    # 跑完保留（翻日志用）
#
# 为什么需要它：CI（.github/workflows/ci.yml）与本机的唯一实质差别，是它每次都是
# clone 下来的**全新仓库**：空 dev.db、全新 node_modules、没有本机 .env。
# 凡是「本机早就有数据 / 早就装好了」才成立的门禁项，在 CI 上必然红、而本机永远绿 ——
# 2026-10-24 就是这么抓到「内容种子只做在 PostgreSQL 演练分支、SQLite 分支拿空库跑断言」
# 这条缝的（干净克隆 265/266，本机房永远 266/266）。
# push 之后等 Actions 页出结果是事后，这里可以在 push 之前就知道答案。
#
# 与 CI 刻意保持一致的两点（改动这里前先想清楚）：
#   ① 失败即停：CI 的 job 是一步红就整体红，后面的步骤不会再执行 —— 这里同样立即停，
#      否则「后面没跑」会被误读成「后面是绿的」；
#   ② 只验证已提交的内容：clone 只带走 HEAD，工作区里未提交的改动不在预演范围内
#      —— 这恰恰就是要证明的东西（漏提交的文件，在 CI 上就是不存在）。
#
# 与 CI 刻意不同的两点：
#   ① 不装 Postgres 服务容器：verify:local 走 SQLite dev.db，不需要（与 ci.yml 同）；
#   ② 不跑 smoke:beta：那要 SSH 隧道 + 服务器私钥 + beta 账号，不该交给 CI，也不该在这里自动跑。
# ==============================================================================
param(
    [switch]$Keep
)

$ErrorActionPreference = "Continue"

# 项目根：tools\ops\ → ..\..
$ProjectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))

# 克隆目标目录名**不能以点开头**：jest 的 testMatch 是 glob，不匹配以点开头的路径段，
# 那样会报「No tests found, exit 1」—— 看着像仓库坏了，其实是目录名。
# （CI 的路径 /home/runner/work/... 不带点，不会遇到；本机踩过一次。）
$GateDir = Join-Path $env:TEMP "eurisko-ci-gate"

$script:GateFailed   = $false
$script:GateFailedAt = ""

function Invoke-GateStep {
    param(
        [int]$No,
        [string]$Label,
        [string]$Dir,
        [string]$Line
    )
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    Write-Host ""
    Write-Host "[$No/6] $Label" -ForegroundColor Cyan
    Push-Location $Dir
    try {
        # 用 cmd /c 包一层：npm 的进度与警告走 stderr，不合并的话 GUI 里看不到
        & cmd /c "$Line 2>&1"
        $code = $LASTEXITCODE
    } finally {
        Pop-Location
    }
    $sw.Stop()
    $sec = [int]$sw.Elapsed.TotalSeconds
    if ($code -ne 0) {
        Write-Host "  [FAIL] $Label 失败（exit $code，耗时 ${sec}s）" -ForegroundColor Red
        $script:GateFailed   = $true
        $script:GateFailedAt = "[$No/6] $Label"
        return $false
    }
    Write-Host "  [OK] $Label 通过（耗时 ${sec}s）" -ForegroundColor Green
    return $true
}

$total = [System.Diagnostics.Stopwatch]::StartNew()

Write-Host ""
Write-Host "========================================================" -ForegroundColor White
Write-Host "  CI 门禁预演：干净克隆 → test → verify:local → verify:release" -ForegroundColor White
Write-Host "========================================================" -ForegroundColor White
Write-Host "  源仓库  ：$ProjectRoot" -ForegroundColor DarkGray
Write-Host "  克隆到  ：$GateDir" -ForegroundColor DarkGray
Write-Host "  提醒    ：clone 只带走 HEAD，未提交的改动不在预演范围内（这正是要证明的东西）" -ForegroundColor DarkGray
Write-Host "  预计耗时：5-15 分钟（取决于 npm 依赖是否需要重新下载）" -ForegroundColor DarkGray

# ---- 0. 先清掉上一次留下的克隆副本 ----
if (Test-Path $GateDir) {
    Write-Host ""
    Write-Host "  发现上一次的克隆副本，先删掉重来：$GateDir" -ForegroundColor DarkGray
    Remove-Item -LiteralPath $GateDir -Recurse -Force -ErrorAction SilentlyContinue
}

# ---- 1~3：clone + 两份依赖 ----
if (-not (Invoke-GateStep -No 1 -Label "干净克隆仓库（只带 HEAD）" -Dir $ProjectRoot -Line "git clone `"$ProjectRoot`" `"$GateDir`"")) {
    # clone 都失败了，后面无从谈起
}
if (-not $script:GateFailed) {
    Invoke-GateStep -No 2 -Label "安装依赖（根）：npm ci" -Dir $GateDir -Line "npm ci" | Out-Null
}
if (-not $script:GateFailed) {
    Invoke-GateStep -No 3 -Label "安装依赖（后端）：cd server && npm ci" -Dir (Join-Path $GateDir "server") -Line "npm ci" | Out-Null
}

# ---- 4~6：CI 的三步门禁，与 ci.yml 的顺序一致 ----
if (-not $script:GateFailed) {
    Invoke-GateStep -No 4 -Label "单元测试：npm test（--coverage=false --maxWorkers=2）" -Dir $GateDir `
        -Line "npm test -- --coverage=false --maxWorkers=2" | Out-Null
}
if (-not $script:GateFailed) {
    Invoke-GateStep -No 5 -Label "本地门禁：npm run verify:local（266 项，空库真起后端）" -Dir $GateDir `
        -Line "npm run verify:local" | Out-Null
}
if (-not $script:GateFailed) {
    Invoke-GateStep -No 6 -Label "发布自检：npm run verify:release（版本五处 + 文档口径）" -Dir $GateDir `
        -Line "npm run verify:release" | Out-Null
}

$total.Stop()
$min = [int]$total.Elapsed.TotalMinutes
$sec = [int]($total.Elapsed.TotalSeconds % 60)

Write-Host ""
Write-Host "========================================================" -ForegroundColor White
if ($script:GateFailed) {
    Write-Host "  预演结论：❌ 会红 —— $($script:GateFailedAt)（总耗时 ${min}m${sec}s）" -ForegroundColor Red
    Write-Host "  push 后 GitHub Actions 会红在同一步；先在本地修掉再 push。" -ForegroundColor Yellow
    Write-Host "  克隆副本保留在：$GateDir（翻日志用，下次跑会自动重建）" -ForegroundColor DarkGray
} else {
    Write-Host "  预演结论：✅ 三步全绿 —— push 后 CI 大概率也是绿的（总耗时 ${min}m${sec}s）" -ForegroundColor Green
    if ($Keep) {
        Write-Host "  按 -Keep 保留克隆副本：$GateDir" -ForegroundColor DarkGray
    } else {
        Remove-Item -LiteralPath $GateDir -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "  已清理克隆副本（要留着翻日志就加 -Keep 再跑一次）" -ForegroundColor DarkGray
    }
}
Write-Host "========================================================" -ForegroundColor White
Write-Host ""

if ($script:GateFailed) { exit 1 }
exit 0
