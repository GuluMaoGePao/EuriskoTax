# EuriskoTax beta（预发）部署薄封装
#
# 用法：
#   .\ops-deploy-beta.ps1                 # 部署到 beta（默认跳过 npm test，见下方说明）
#   .\ops-deploy-beta.ps1 -DryRun         # 仅打包预览
#   .\ops-deploy-beta.ps1 -Rollback       # beta 回滚到上一版本
#   .\ops-deploy-beta.ps1 -InitEnv        # 首次：在服务器建 beta 的 .env.shared
#   .\ops-deploy-beta.ps1 -RunTest        # 连 npm test 一起跑（慢，约 1 分钟）
#   .\ops-deploy-beta.ps1 -ConfigPath <p> # 指定别的配置（默认 tools/ops/deploy.config.beta.json）
#
# 为什么默认 -SkipTest：
#   ① beta 的价值就是「快」—— 每改一次都要能立刻上一次真机；
#   ② ops-deploy.ps1 内嵌的 `npm test` 会把 jest 的 PASS 行写进 stderr，
#      PowerShell 视为 NativeCommandError 并让脚本提前终止（正式发布踩过这个坑）；
#   ③ 正式发布链路（`ops-deploy.ps1` 不带 -SkipTest / 本地 `npm test` + `verify:local`）
#      才是门禁，beta 不是门禁，它只是门禁之前的眼睛。
#   所以：正式发布前的全量测试**照旧要在本地跑一遍**，不要因为这里默认跳过就省略。

param(
    [switch]$DryRun,
    [switch]$Rollback,
    [switch]$InitEnv,
    [switch]$RunTest,
    [string]$ConfigPath = ""
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not $ConfigPath) {
    $ConfigPath = Join-Path $ScriptDir "deploy.config.beta.json"
}

$configMissing = -not (Test-Path -LiteralPath $ConfigPath)
if ($configMissing) {
    Write-Host ""
    Write-Host "缺少 beta 部署配置: $ConfigPath" -ForegroundColor Red
    Write-Host "请复制模板: cp tools/ops/deploy.config.beta.example.json tools/ops/deploy.config.beta.json" -ForegroundColor Yellow
    Write-Host "并确认四条硬性前置：独立数据库 / 独立 JWT_SECRET / SMTP_PASS 留空 / 禁止被收录" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

Write-Host ""
Write-Host "目标：beta（预发）  配置：$ConfigPath" -ForegroundColor Cyan
Write-Host "正式站请用 ops-deploy.ps1，不要拿本脚本发正式。" -ForegroundColor DarkGray
Write-Host ""

# 显式传参（不用 splatting）：本机 PowerShell 5.1 下 `& $script @arr` 会把 "-ConfigPath"
# 当成第一个位置参数的值传进去，ops-deploy.ps1 于是报「配置文件不存在: -ConfigPath」。
# switch 用 -Name:$bool 传值，避免依赖参数顺序。
$deploy = Join-Path $ScriptDir "ops-deploy.ps1"
& $deploy -ConfigPath $ConfigPath `
    -DryRun:$DryRun `
    -Rollback:$Rollback `
    -InitEnv:$InitEnv `
    -SkipTest:(-not $RunTest)
exit $LASTEXITCODE
