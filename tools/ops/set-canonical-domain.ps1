# 一键切换站点规范域名（canonical / og:url / JSON-LD / sitemap / robots）
#
# 背景：现在生产跑在 Zeabur（euriskotax.zeabur.app），全站有 50+ 处硬编码了这个域名：
#   · 20 个落地页各 3 处：<link rel="canonical">、og:url、JSON-LD 的 url
#   · sitemap.xml：22 个 <loc>
#   · robots.txt：Sitemap 行
#   · index.html / manifest / sw 等
# ICP 备案通过后要切到 euriskotax.com；如果只改 DNS、不改这些，
#   canonical 会继续指向旧域 —— 等于告诉搜索引擎「以 zeabur 那个副本为准」，收录直接废掉。
#
# 用法（默认 dry-run，只报告不落盘）：
#   powershell -File tools/ops/set-canonical-domain.ps1
#   powershell -File tools/ops/set-canonical-domain.ps1 -Apply
#   powershell -File tools/ops/set-canonical-domain.ps1 -From 'euriskotax.zeabur.app' -To 'euriskotax.com' -Apply -IncludeDocs
#
# 注意：脚本只替换**域名字符串**，不碰路径与查询串；写文件统一 UTF-8 无 BOM（与仓库现有文件一致）。
[CmdletBinding()]
param(
    [string]$From = 'euriskotax.zeabur.app',
    [string]$To = 'euriskotax.com',
    # 不加 -Apply 就是预演：只统计、不写盘
    [switch]$Apply,
    # 文档里的示例域名默认不改（内部资料，改了反而增加 diff 噪音）
    [switch]$IncludeDocs
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root

$extensions = @('.html', '.xml', '.txt', '.json', '.js', '.md')
if (-not $IncludeDocs) { $extensions = $extensions | Where-Object { $_ -ne '.md' } }

$excludeDirs = @('node_modules', '.git', 'coverage', 'dist', '.codebuddy', 'temp')

# 注意：Get-ChildItem 的 -Include 必须配合通配符路径才生效，这里改用 Extension 过滤更稳
$files = Get-ChildItem -Path $root -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $extensions -contains $PSItem.Extension.ToLower() } |
    Where-Object {
        $full = $_.FullName
        -not ($excludeDirs | Where-Object { $full -like "*\$_\*" -or $full -like "*/$_/*" })
    }

$totalFiles = 0
$totalHits = 0
$report = @()

foreach ($file in $files) {
    $text = Get-Content -Path $file.FullName -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
    if (-not $text) { continue }
    $matches = [regex]::Matches($text, [regex]::Escape($From))
    if ($matches.Count -eq 0) { continue }

    $rel = $file.FullName.Substring($root.Length).TrimStart('\', '/')
    $report += [pscustomobject]@{ File = $rel; Hits = $matches.Count }
    $totalFiles++
    $totalHits += $matches.Count

    if ($Apply) {
        $newText = $text.Replace($From, $To)
        $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
        [System.IO.File]::WriteAllText($file.FullName, $newText, $utf8NoBom)
    }
}

$mode = if ($Apply) { 'APPLY（已写盘）' } else { 'DRY-RUN（未写盘）' }
Write-Host "== 规范域名切换：$From  ->  $To  [$mode] ==" -ForegroundColor Cyan
$report | Sort-Object Hits -Descending | Format-Table -AutoSize | Out-Host
Write-Host "命中文件：$totalFiles 个；命中处数：$totalHits 处" -ForegroundColor Yellow

if (-not $Apply) {
    Write-Host "确认无误后加 -Apply 执行；切完记得同步：manifest.json 的 start_url、service-worker 作用域、server 侧 CORS_ORIGIN。" -ForegroundColor DarkGray
}
else {
    Write-Host "已替换。下一步：① 提交前 git diff 抽查；② 部署后抽查 /seo/index.html 的 canonical 与 /sitemap.xml 的 loc。" -ForegroundColor Green
}
