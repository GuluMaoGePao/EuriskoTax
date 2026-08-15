# 诊断 logo.png 原始 & logo-zoomed.png 各尺寸实际内容占比
Add-Type -AssemblyName System.Drawing

function Get-BboxRatio {
    param([string]$Path, [int]$TargetSize = 0)
    $b = [System.Drawing.Bitmap]::FromFile($Path)
    try {
        if ($TargetSize -gt 0 -and ($b.Width -ne $TargetSize -or $b.Height -ne $TargetSize)) {
            $dst = New-Object System.Drawing.Bitmap $TargetSize, $TargetSize, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
            $g = [System.Drawing.Graphics]::FromImage($dst)
            $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $g.Clear([System.Drawing.Color]::Transparent)
            $g.DrawImage($b, (New-Object System.Drawing.Rectangle 0,0,$TargetSize,$TargetSize))
            $g.Dispose()
            $b.Dispose()
            $b = $dst
        }
        $w = $b.Width; $h = $b.Height
        $minX=$w;$minY=$h;$maxX=-1;$maxY=-1
        for ($y=0;$y-lt$h;$y++){
            for ($x=0;$x-lt$w;$x++){
                $p=$b.GetPixel($x,$y)
                if ($p.A -gt 8){
                    if ($x-lt$minX){$minX=$x}
                    if ($y-lt$minY){$minY=$y}
                    if ($x-gt$maxX){$maxX=$x}
                    if ($y-gt$maxY){$maxY=$y}
                }
            }
        }
        if ($maxX -lt 0) { return [pscustomobject]@{File=(Split-Path $Path -Leaf);Size="${w}x${h}";Fill="0%";BBox="(empty)"} }
        $cw=$maxX-$minX+1; $ch=$maxY-$minY+1
        $fillW=[Math]::Round($cw/$w*100,1); $fillH=[Math]::Round($ch/$h*100,1); $fill=[Math]::Max($fillW,$fillH)
        return [pscustomobject]@{
            File=(Split-Path $Path -Leaf)
            Size="${w}x${h}"
            BBox="($minX,$minY)~($maxX,$maxY)"
            Content="${cw}x${ch}"
            FillW="${fillW}%"
            FillH="${fillH}%"
            MaxFill="${fill}%"
        }
    } finally { $b.Dispose() }
}

$root = $PSScriptRoot
$files = @(
    (Join-Path $root "logo.png"),
    (Join-Path $root "logo-zoomed.png")
)
$sizes = @(1024, 256, 64, 48, 32, 24, 16)
Write-Host ("{0,-22}{1,-10}{2,-30}{3,-16}{4,-8}{5,-8}{6,-8}" -f "FILE","SIZE","BBOX","CONTENT","FILL_W","FILL_H","MAX_FILL") -ForegroundColor Cyan
foreach ($f in $files) {
    foreach ($sz in $sizes) {
        $r = Get-BboxRatio -Path $f -TargetSize $sz
        Write-Host ("{0,-22}{1,-10}{2,-30}{3,-16}{4,-8}{5,-8}{6,-8}" -f $r.File,$r.Size,$r.BBox,$r.Content,$r.FillW,$r.FillH,$r.MaxFill)
    }
    Write-Host ""
}
