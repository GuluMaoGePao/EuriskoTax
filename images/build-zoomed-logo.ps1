# ==========================================================================
# logo.png 最大化填充构建：每个 ICO 尺寸独立放大到 94%~97% 画布填充
# 源图 logo.png 原始内容占比只有 W=56% H=49%，正常缩放会显得很小
# 策略：
#   1) 从源 PNG 裁切内容矩形
#   2) 对每个目标尺寸 (sz×sz)：
#        - 先按 sz 缩放到 contentFill=94%（不裁切）
#        - 如果是窄尺寸(16/24/32/48)，再额外 boost 1.05×，让 H 方向 ≥ 90%
#        - 居中绘制到 sz×sz 透明画布
#   3) 打包多尺寸 ICO（256 / 64 / 48 / 32 / 24 / 16）
#   4) 同时输出 logo-zoomed.png（用 256 帧放大到 1024×1024 93% 填充的超集图）
# ==========================================================================
Add-Type -AssemblyName System.Drawing

$imgDir    = $PSScriptRoot
$src       = Join-Path $imgDir "logo.png"
$zoomedPng = Join-Path $imgDir "logo-zoomed.png"
$icoPath   = Join-Path $imgDir "logo.ico"

# 尺寸策略：数组遍历 (Fill=目标W方向填充率, Boost=额外放大倍率让H方向也贴近边缘)
$sizePolicy = @(
    [pscustomobject]@{Sz=256; Fill=0.94; Boost=1.00},
    [pscustomobject]@{Sz=128; Fill=0.95; Boost=1.02},
    [pscustomobject]@{Sz= 64; Fill=0.95; Boost=1.04},
    [pscustomobject]@{Sz= 48; Fill=0.95; Boost=1.05},
    [pscustomobject]@{Sz= 32; Fill=0.96; Boost=1.06},
    [pscustomobject]@{Sz= 24; Fill=0.96; Boost=1.06},
    [pscustomobject]@{Sz= 16; Fill=0.97; Boost=1.08}
)

function Get-ContentBbox {
    param([System.Drawing.Bitmap]$Bmp)
    $w = $Bmp.Width; $h = $Bmp.Height
    $minX = $w; $minY = $h; $maxX = -1; $maxY = -1
    for ($y = 0; $y -lt $h; $y++) {
        for ($x = 0; $x -lt $w; $x++) {
            $p = $Bmp.GetPixel($x, $y)
            if ($p.A -gt 8) {
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

function Resize-HQ {
    param([System.Drawing.Bitmap]$Src, [int]$NewW, [int]$NewH)
    $dst = New-Object System.Drawing.Bitmap $NewW, $NewH, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
        $g = [System.Drawing.Graphics]::FromImage($dst)
        try {
            $g.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $g.PixelOffsetMode    = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $g.SmoothingMode      = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
            $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
            $g.CompositingMode    = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
            $g.Clear([System.Drawing.Color]::Transparent)
            $g.DrawImage($Src, (New-Object System.Drawing.Rectangle 0,0,$NewW,$NewH))
            return $dst
        } catch { $dst.Dispose(); throw } finally { $g.Dispose() }
    } catch { throw }
}

function Draw-Centered-Cropped {
    <# .SYNOPSIS 把 $Src 在 sz×sz 画布中心按比例绘制，超出部分裁切 #>
    param([System.Drawing.Bitmap]$Src, [int]$Sz)
    $dst = New-Object System.Drawing.Bitmap $Sz, $Sz, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
        $g = [System.Drawing.Graphics]::FromImage($dst)
        try {
            $g.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $g.PixelOffsetMode    = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $g.SmoothingMode      = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
            $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
            $g.CompositingMode    = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
            $g.Clear([System.Drawing.Color]::Transparent)
            $g.DrawImage($Src, (New-Object System.Drawing.Rectangle 0,0,$Sz,$Sz))
            return $dst
        } catch { $dst.Dispose(); throw } finally { $g.Dispose() }
    } catch { throw }
}

function Build-Frame-At-Size {
    <# .SYNOPSIS 从 $Cropped (裁切后纯内容位图) 构建 sz×sz 帧，按策略放大到目标填充率 #>
    param([System.Drawing.Bitmap]$Cropped, [int]$Sz, [double]$TargetFillW, [double]$ExtraBoost)
    # 先按 TargetFillW 等比缩放
    [int]$targetContentW = [int][Math]::Max(1, [Math]::Round($Sz * $TargetFillW))
    $aspect = [double]$Cropped.Width / [double]$Cropped.Height
    [int]$scaledW = $targetContentW
    [int]$scaledH = [int][Math]::Max(1, [Math]::Round($scaledW / $aspect))
    # Extra boost（让 H 方向进一步贴近画布边缘）
    $scaledW = [int][Math]::Round($scaledW * $ExtraBoost)
    $scaledH = [int][Math]::Round($scaledH * $ExtraBoost)
    # 缩放到 scaledW × scaledH
    $scaled = Resize-HQ -Src $Cropped -NewW $scaledW -NewH $scaledH
    try {
        # 绘制到 sz×sz 中心，超出部分自动被 Graphics 矩形裁切
        $dst = New-Object System.Drawing.Bitmap $Sz, $Sz, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        try {
            $g = [System.Drawing.Graphics]::FromImage($dst)
            try {
                $g.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                $g.PixelOffsetMode    = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
                $g.SmoothingMode      = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
                $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
                $g.CompositingMode    = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
                $g.Clear([System.Drawing.Color]::Transparent)
                $dx = [int][Math]::Round(($Sz - $scaledW) / 2.0)
                $dy = [int][Math]::Round(($Sz - $scaledH) / 2.0)
                $srcRect = New-Object System.Drawing.Rectangle 0,0,$scaledW,$scaledH
                $dstRect = New-Object System.Drawing.Rectangle $dx,$dy,$scaledW,$scaledH
                $g.DrawImage($scaled, $dstRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
                return $dst
            } catch { $dst.Dispose(); throw } finally { $g.Dispose() }
        } catch { throw }
    } finally { $scaled.Dispose() }
}

Write-Host "[1/5] Load logo.png + Get content bbox ..." -ForegroundColor Cyan
$srcBmp = [System.Drawing.Bitmap]::FromFile($src)
try {
    $bbox = Get-ContentBbox -Bmp $srcBmp
    if (-not $bbox) { throw "No opaque pixels found in $src" }
    Write-Host "   Raw content: ($($bbox.X),$($bbox.Y)) W=$($bbox.W) H=$($bbox.H)" -ForegroundColor Gray
    $cropRect = New-Object System.Drawing.Rectangle $bbox.X, $bbox.Y, $bbox.W, $bbox.H
    $cropped = $srcBmp.Clone($cropRect, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb))
    try {
        Write-Host "[2/5] Build per-size frames (maximized fill, independent):" -ForegroundColor Cyan
        $frames = New-Object System.Collections.Generic.List[object]
        foreach ($pol in $sizePolicy) {
            [int]$sz = [int]$pol.Sz
            $frame = Build-Frame-At-Size -Cropped $cropped -Sz $sz -TargetFillW $pol.Fill -ExtraBoost $pol.Boost
            # 保存PNG到内存
            $ms = New-Object System.IO.MemoryStream
            try {
                $frame.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
                $frames.Add([pscustomobject]@{
                    Size = $sz
                    Bmp  = $frame
                    Data = $ms.ToArray()
                })
                # 诊断：内容占比
                $dbbox = Get-ContentBbox -Bmp $frame
                if ($dbbox) {
                    $fw=[Math]::Round($dbbox.W/$sz*100,1)
                    $fh=[Math]::Round($dbbox.H/$sz*100,1)
                    Write-Host ("   sz {0,3}: data={1,6} bytes | fill W={2,5}% H={3,5}% | bbox {4}x{5}" -f $sz, $ms.Length, $fw, $fh, $dbbox.W, $dbbox.H) -ForegroundColor Gray
                } else {
                    Write-Host "   sz ${sz}: EMPTY" -ForegroundColor Red
                }
            } finally { $ms.Dispose() }
        }

        # 生成 logo-zoomed.png（1024×1024 用 256 策略的近似：以源 cropped 直接按 93% 放大）
        Write-Host "[3/5] Write logo-zoomed.png (1024x1024, ~93% fill) ..." -ForegroundColor Cyan
        $zBig = Build-Frame-At-Size -Cropped $cropped -Sz 1024 -TargetFillW 0.93 -ExtraBoost 1.03
        try {
            $zBig.Save($zoomedPng, [System.Drawing.Imaging.ImageFormat]::Png)
            $dbz = Get-ContentBbox -Bmp $zBig
            $fw=[Math]::Round($dbz.W/1024*100,1); $fh=[Math]::Round($dbz.H/1024*100,1)
            Write-Host "   Saved: $zoomedPng ($((Get-Item $zoomedPng).Length) bytes, fill W=$fw% H=$fh%)" -ForegroundColor Green
        } finally { $zBig.Dispose() }

        # 打包 ICO
        [string[]]$sizesLabel = foreach ($f in $frames) { [string]$f.Size }
        Write-Host "[4/5] Build multi-size ICO: $($sizesLabel -join ', ') ..." -ForegroundColor Cyan
        $icoMs = New-Object System.IO.MemoryStream
        $bw  = New-Object System.IO.BinaryWriter($icoMs)
        try {
            $bw.Write([uint16]0)   # reserved
            $bw.Write([uint16]1)   # type = ICO
            $bw.Write([uint16]$frames.Count)
            $dataOffset = 6 + 16 * $frames.Count
            foreach ($f in $frames) {
                [int]$sz = [int]$f.Size
                $w = [byte]([Math]::Min($sz, 255))
                $h = [byte]([Math]::Min($sz, 255))
                $bw.Write([byte]$w)
                $bw.Write([byte]$h)
                $bw.Write([byte]0)           # color count = 0
                $bw.Write([byte]0)           # reserved
                $bw.Write([uint16]1)         # planes
                $bw.Write([uint16]32)        # bpp
                $bw.Write([uint32]$f.Data.Length)
                $bw.Write([uint32]$dataOffset)
                $dataOffset += $f.Data.Length
            }
            foreach ($f in $frames) {
                $bw.Write($f.Data)
            }
            $bw.Flush()
            [System.IO.File]::WriteAllBytes($icoPath, $icoMs.ToArray())
            Write-Host "   Saved: $icoPath ($((Get-Item $icoPath).Length) bytes)" -ForegroundColor Green
        } finally {
            $bw.Dispose(); $icoMs.Dispose()
        }

        # 释放各帧 Bitmap
        foreach ($f in $frames) { $f.Bmp.Dispose() }
    } finally { $cropped.Dispose() }
} finally { $srcBmp.Dispose() }

Write-Host "[5/5] Done." -ForegroundColor Green
