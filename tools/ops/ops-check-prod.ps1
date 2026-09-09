# EuriskoTax 线上部署校验脚本
# 用法: .\tools\ops\ops-check-prod.ps1 [-BaseUrl https://euriskotax.zeabur.app]
# 作用: push 后轮询线上资源，确认 Zeabur 已部署到最新版本（认证/按钮/SW 版本指纹）
#       任一检查不过时退出码非 0，用于发布门禁或人工核对。
param(
    [string]$BaseUrl = "https://euriskotax.zeabur.app"
)

$ErrorActionPreference = "Stop"
$checks = New-Object System.Collections.ArrayList

function Fetch-Text {
    param([string]$Url)
    (Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 25).Content
}

function Add-Check {
    param([string]$Name, [bool]$Ok, [string]$Detail = "")
    [void]$checks.Add(@{ Name = $Name; Ok = $Ok; Detail = $Detail })
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  EuriskoTax 线上部署校验: $BaseUrl" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# 抓取关键资源（允许单个失败继续，统一汇总）
$resources = @{}
foreach ($key in @("index", "auth_ui", "api_client", "app", "sw", "plan_js", "history_sync")) {
    try {
        $url = switch ($key) {
            "index"        { "$BaseUrl/" }
            "auth_ui"      { "$BaseUrl/src/js/auth/auth-ui.js" }
            "api_client"   { "$BaseUrl/src/js/api/api-client.js" }
            "app"          { "$BaseUrl/src/js/app.js" }
            "sw"           { "$BaseUrl/service-worker.js" }
            "plan_js"      { "$BaseUrl/src/js/auth/plan.js" }
            "history_sync" { "$BaseUrl/src/js/data/history-sync.js" }
        }
        $resources[$key] = Fetch-Text $url
    } catch {
        $resources[$key] = $null
    }
}

Add-Check "页面可访问" ($null -ne $resources["index"]) "HTTP 资源抓取成功"

if ($resources["index"]) {
    Add-Check "index.html 已无快速登录按钮" (-not $resources["index"].Contains("quick-login-btn"))
    Add-Check "index.html 含登录表单" ($resources["index"].Contains('id="login-form"'))
    # 阶段10A：云同步脚本与 UI（plan 徽标 + 同步卡片）
    Add-Check "index.html 加载 plan/history-sync 脚本" ($resources["index"].Contains("src/js/auth/plan.js") -and $resources["index"].Contains("src/js/data/history-sync.js"))
    Add-Check "index.html 含云同步入口 DOM(cloud-sync-now-btn)" ($resources["index"].Contains("cloud-sync-now-btn"))
    Add-Check "index.html 含 plan 徽标 DOM(topbar/profile)" ($resources["index"].Contains("topbar-plan-badge") -and $resources["index"].Contains("profile-plan-badge"))
}

if ($resources["auth_ui"]) {
    Add-Check "auth-ui.js 含本地开发填充入口(dev-login-fill)" ($resources["auth_ui"].Contains("dev-login-fill"))
    Add-Check "auth-ui.js 无 quick-login 残留" (-not $resources["auth_ui"].Contains("quick-login"))
    Add-Check "auth-ui.js 含 409 已注册提示" ($resources["auth_ui"].Contains("statusCode === 409"))
    Add-Check "auth-ui.js 集成云同步引擎(login/logout/render)" ($resources["auth_ui"].Contains("EuriskoSync") -and $resources["auth_ui"].Contains("renderCloudSyncPanel"))
}

# 阶段10A：前端同步链路静态指纹
if ($resources["plan_js"]) {
    Add-Check "plan.js 含 PRO 判定(isPro/EuriskoPlan)" ($resources["plan_js"].Contains("function isPro") -and $resources["plan_js"].Contains("EuriskoPlan"))
}
if ($resources["history_sync"]) {
    Add-Check "history-sync.js 含同步引擎(mergeCloud/EuriskoSync)" ($resources["history_sync"].Contains("mergeCloud") -and $resources["history_sync"].Contains("window.EuriskoSync"))
    Add-Check "history-sync.js 含同步事件信号(history-synced)" ($resources["history_sync"].Contains("euriskotax:history-synced"))
}

if ($resources["sw"]) {
    Add-Check "service-worker.js 已无应用壳预缓存(APP_SHELL)" (-not $resources["sw"].Contains("APP_SHELL"))
    Add-Check "service-worker.js 含 http/https 协议守卫" ($resources["sw"].Contains("chrome-extension"))
    Add-Check "service-worker.js HTML 导航 network-first" ($resources["sw"].Contains("request.mode === 'navigate'"))
}

if ($resources["app"]) {
    Add-Check "app.js 无 ?v= 指纹（ETag + SW network-first 保证更新）" (-not $resources["app"].Contains("auth-ui.js?v="))
}

$fail = @($checks | Where-Object { -not $_.Ok })
Write-Host ""
foreach ($c in $checks) {
    if ($c.Ok) {
        Write-Host ("  [PASS] " + $c.Name) -ForegroundColor Green
    } else {
        Write-Host ("  [FAIL] " + $c.Name + ($(if ($c.Detail) { " — " + $c.Detail } else { "" }))) -ForegroundColor Red
    }
}
Write-Host ""
Write-Host ("  结果: " + ($checks.Count - $fail.Count) + "/" + $checks.Count + " 通过") -ForegroundColor Cyan

if ($fail.Count -gt 0) {
    Write-Host "  => 线上尚未完全更新：Zeabur 可能还在构建，或需要等待数分钟后再跑一次。" -ForegroundColor Yellow
    Write-Host "     （旧浏览器用户还需在页面上 Unregister Service Worker + Clear site data）" -ForegroundColor Gray
    exit 1
}

Write-Host "  => 线上已是最新版本，可以对外确认。" -ForegroundColor Green
Write-Host ""
exit 0
