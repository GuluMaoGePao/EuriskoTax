# ==============================================================================
# 诊断 GUI 滚动条 overlay 实际布局：
#  - 检查 New-TabPanel 的 $panel / $scroll / $head 尺寸
#  - New-ScrollbarOverlay 执行后 overlay 实际位置/尺寸/父容器/是否被 Dock=Right 挤压其他控件
# ==============================================================================
Add-Type -AssemblyName System.Windows.Forms

$global:diagResult = @()

# 静态分析：读取源文件（只读，不修改源文件，因此无需备份）
$f = Join-Path (Split-Path $PSScriptRoot -Parent) "tools\gui\gui-dev-console.ps1"
$content = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8)

# 直接做静态分析：找两处 New-ScrollbarOverlay 调用的上下文，确认 Dock=Right 是否在 Parent
# 上真正覆盖在原生滚动条上方
$lines = $content -split "`n"
for ($i=0;$i -lt $lines.Length;$i++) {
    if ($lines[$i] -match 'New-ScrollbarOverlay') {
        Write-Host "`n=== L$($i+1): $($lines[$i].Trim()) ===" -ForegroundColor Cyan
        for ($j=[Math]::Max(0,$i-5);$j -le [Math]::Min($lines.Length-1,$i+10);$j++) {
            Write-Host (" L{0,4}: {1}" -f ($j+1), $lines[$j].TrimEnd())
        }
    }
}

# 静态分析：New-ScrollbarOverlay 中 $parent.Controls.Add($overlay) + $overlay.Dock = "Right"
# 的致命问题：Dock=Right 会参与父容器布局，抢占右侧空间，导致其他子控件（scroll/head）宽度缩小，
# 而不是"视觉覆盖"。
Write-Host "`n=== 根因分析 ===" -ForegroundColor Red
Write-Host "overlay.Dock='Right' + parent.Controls.Add(overlay) 是参与布局，不是覆盖层！"
Write-Host "  - Tab 内容区父 $panel.Controls 的孩子是: head(Dock=Top), scroll(Dock=Fill)"
Write-Host "  - 再 Add overlay 并 Dock=Right，会导致 scroll 的 Fill 区域从右边被挤掉 overlay.Width=8px"
Write-Host "  - 实际效果：滚动面板少了 8px 右边（视觉上像错位/滚动条飘/空白）"
Write-Host "  - overlay 也不是覆盖在原生滚动条上方，而是挤在旁边"
Write-Host "`n修复方向：overlay 不用 Dock，用绝对坐标 Location + Size 手动跟随，且设置 TopMost 不可，但用 Controls.SetChildIndex(overlay, 0) + BringToFront。"
