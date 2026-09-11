# ==========================================================================
# EuriskoTaxLogo-zoomed.png 构建：品牌图形（云 + 层叠，不含文字）裁切后放大到近满画布
# 背景：源图 EuriskoTaxLogo.png 的可见内容只占画布 56.2%×38.4%，直接缩放显示会显得很小。
# 策略：
#   1) 扫描 alpha 通道求内容包围盒（bbox），无可见像素直接报错退出
#   2) 裁切内容矩形，按目标填充率等比放大（额外 boost 让高度方向也贴近边缘）
#   3) 居中绘制到 $Size×$Size 透明画布，超出部分裁切
#   4) 回读产物做内容占比自检，占比过低视为失败（防止再次产出空白图）
# 用途：悬浮税助手悬浮球图标（44px 圆形，球内图形 30px）。默认 256 已覆盖 8x 屏，
#       不采用 1024 以免为一个 30px 图标加载几百 KB。
# 用法：powershell -File images\build-euriskotax-logo-zoomed.ps1 [-Size 512]
# ==========================================================================
param([int]$Size = 256)

Add-Type -AssemblyName System.Drawing

$imgDir    = $PSScriptRoot
$src       = Join-Path $imgDir "EuriskoTaxLogo.png"
$zoomedPng = Join-Path $imgDir "EuriskoTaxLogo-zoomed.png"

$size         = $Size
$targetFillW  = 0.93   # 内容宽度占画布比例
$extraBoost   = 1.03   # 额外放大，让高度方向也贴近边缘
$minFillRatio = 0.80   # 自检阈值：宽度填充率低于此值视为构建失败

function Get-ContentBbox {
    param([System.Drawing.Bitmap]$Bmp)
    $w = $Bmp.Width
    $h = $Bmp.Height
    $minX = $w; $minY = $h; $maxX = -1; $maxY = -1
    for ($y = 0; $y -lt $h; $y++) {
        for ($x = 0; $x -lt $w; $x++) {
            if ($Bmp.GetPixel($x, $y).A -gt 8) {
                if ($x -lt $minX) { $minX = $x }
                if ($y -lt $minY) { $minY = $y }
                if ($x -gt $maxX) { $maxX = $x }
                if ($y -gt $maxY) { $maxY = $y }
            }
        }
    }
    if ($maxX -lt 0) { return $null }
    return [pscustomobject]@{
        X = $minX; Y = $minY
        W = $maxX - $minX + 1; H = $maxY - $minY + 1
    }
}

function New-ZoomedCanvas {
    <# .SYNOPSIS 把 $Src 等比放大后居中绘制到 sz×sz 透明画布，超出部分裁切 #>
    param([System.Drawing.Bitmap]$Src, [int]$Sz, [double]$FillW, [double]$Boost)
    $scaledW = [int][Math]::Max(1, [Math]::Round($Sz * $FillW * $Boost))
    $aspect  = [double]$Src.Width / [double]$Src.Height
    $scaledH = [int][Math]::Max(1, [Math]::Round($scaledW / $aspect))

    $canvas = New-Object System.Drawing.Bitmap $Sz, $Sz, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
        $g = [System.Drawing.Graphics]::FromImage($canvas)
        try {
            $g.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $g.PixelOffsetMode    = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $g.SmoothingMode      = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
            $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
            $g.CompositingMode    = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
            $g.Clear([System.Drawing.Color]::Transparent)
            $dx = [int][Math]::Round(($Sz - $scaledW) / 2.0)
            $dy = [int][Math]::Round(($Sz - $scaledH) / 2.0)
            $dstRect = New-Object System.Drawing.Rectangle $dx, $dy, $scaledW, $scaledH
            $srcRect = New-Object System.Drawing.Rectangle 0, 0, $Src.Width, $Src.Height
            $unit    = [System.Drawing.GraphicsUnit]::Pixel
            $g.DrawImage($Src, $dstRect, $srcRect, $unit)
        } catch { $canvas.Dispose(); throw } finally { $g.Dispose() }
        return $canvas
    } catch { $canvas.Dispose(); throw }
}

Write-Host "[1/4] Load $src ..." -ForegroundColor Cyan
if (-not (Test-Path $src)) { throw "源图不存在: $src" }

$srcBmp = [System.Drawing.Bitmap]::FromFile((Resolve-Path $src).Path)
try {
    $bbox = Get-ContentBbox -Bmp $srcBmp
    if (-not $bbox) { throw "源图无可见像素（alpha 全透明）: $src" }
    Write-Host ("   [2/4] 内容包围盒 ({0},{1}) {2}x{3}（占画布 W={4}% H={5}%）" -f `
        $bbox.X, $bbox.Y, $bbox.W, $bbox.H, `
        [Math]::Round($bbox.W / $srcBmp.Width * 100, 1), `
        [Math]::Round($bbox.H / $srcBmp.Height * 100, 1)) -ForegroundColor Gray

    $cropRect = New-Object System.Drawing.Rectangle $bbox.X, $bbox.Y, $bbox.W, $bbox.H
    $cropped  = $srcBmp.Clone($cropRect, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb))
    try {
        $canvas = New-ZoomedCanvas -Src $cropped -Sz $size -FillW $targetFillW -Boost $extraBoost
        try {
            $canvas.Save($zoomedPng, [System.Drawing.Imaging.ImageFormat]::Png)
        } finally { $canvas.Dispose() }
    } finally { $cropped.Dispose() }
} finally { $srcBmp.Dispose() }

Write-Host "[3/4] 自检产物内容占比 ..." -ForegroundColor Cyan
$outBmp  = [System.Drawing.Bitmap]::FromFile((Resolve-Path $zoomedPng).Path)
try {
    $outBbox = Get-ContentBbox -Bmp $outBmp
    if (-not $outBbox) { throw "构建失败：产物无可见像素（空白图）-> $zoomedPng" }
    $fillW = [Math]::Round($outBbox.W / $outBmp.Width * 100, 1)
    $fillH = [Math]::Round($outBbox.H / $outBmp.Height * 100, 1)
    if ($fillW -lt ($minFillRatio * 100)) {
        throw "构建失败：产物内容宽度填充率仅 $fillW%（阈值 $($minFillRatio * 100)%）-> $zoomedPng"
    }
} finally { $outBmp.Dispose() }

Write-Host ("[4/4] Saved: $zoomedPng ({0} bytes, fill W={1}% H={2}%)" -f `
    (Get-Item $zoomedPng).Length, $fillW, $fillH) -ForegroundColor Green
