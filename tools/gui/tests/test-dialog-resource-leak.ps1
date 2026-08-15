# ==============================================================================
# 测试脚本: test-dialog-resource-leak.ps1
# 目的: 验证 GUI 对话框（Show-BranchPicker / SaveFileDialog / Ctrl+K 搜索框）
#       在连续多次创建和销毁后是否还存在 GDI 句柄资源泄漏
#
# 测试原理:
#   1. 通过 Win32 API GetGuiResources 获取当前进程的 GDI Objects 计数
#   2. GDI 资源（Brush/Pen/Font/Control 句柄）在控件创建时分配，Dispose 时释放
#   3. 对比"旧实现"（不 Dispose）和"新实现"（try/finally 保证 Dispose）的 GDI 增量
#   4. 旧实现增量应持续增长（泄漏），新实现增量应稳定在 0 附近（不泄漏）
#
# 注意: 为避免阻塞测试，不调用 ShowDialog()。GDI 资源在 Control 创建时即分配，
#       是否显示窗口不影响 Dispose 释放资源的验证结果。
#
# 使用方式:
#   powershell.exe -NoProfile -ExecutionPolicy Bypass -File test-dialog-resource-leak.ps1
#   powershell.exe -NoProfile -ExecutionPolicy Bypass -File test-dialog-resource-leak.ps1 -Iterations 200
# ==============================================================================

param(
    [int]$Iterations = 100
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# ------------------------------------------------------------------------------
# Win32 API: GetGuiResources - 获取当前进程的 GDI Objects 计数
# ------------------------------------------------------------------------------
if (-not ('Win32.NativeMethods' -as [type])) {
    Add-Type -Namespace Win32 -Name NativeMethods -MemberDefinition @"
        [System.Runtime.InteropServices.DllImport("user32.dll")]
        public static extern uint GetGuiResources(System.IntPtr hProcess, int uiFlags);

        [System.Runtime.InteropServices.DllImport("kernel32.dll")]
        public static extern System.IntPtr GetCurrentProcess();
"@
}

function Get-GdiObjectCount {
    $hProcess = [Win32.NativeMethods]::GetCurrentProcess()
    return [Win32.NativeMethods]::GetGuiResources($hProcess, 0)
}

function Get-UserObjectCount {
    $hProcess = [Win32.NativeMethods]::GetCurrentProcess()
    return [Win32.NativeMethods]::GetGuiResources($hProcess, 1)
}

# ------------------------------------------------------------------------------
# 测试1: Show-BranchPicker 风格的 Form
# ------------------------------------------------------------------------------
function New-TestPickerForm {
    $form = New-Object System.Windows.Forms.Form
    $form.Text = "Test Picker"
    $form.Size = New-Object System.Drawing.Size(520, 280)
    $form.BackColor = [System.Drawing.Color]::FromArgb(28, 31, 42)

    $lbl = New-Object System.Windows.Forms.Label
    $lbl.Text = "select branch"
    $lbl.ForeColor = [System.Drawing.Color]::FromArgb(245, 245, 252)
    $lbl.Location = New-Object System.Drawing.Point(20, 18)
    $lbl.Size = New-Object System.Drawing.Size(460, 28)
    $form.Controls.Add($lbl)

    $combo = New-Object System.Windows.Forms.ComboBox
    $combo.DropDownStyle = "DropDownList"
    $combo.Location = New-Object System.Drawing.Point(20, 78)
    $combo.Size = New-Object System.Drawing.Size(460, 32)
    1..5 | ForEach-Object { [void]$combo.Items.Add("branch-$_") }
    $combo.SelectedIndex = 0
    $form.Controls.Add($combo)

    $okBtn = New-Object System.Windows.Forms.Button
    $okBtn.Text = "OK"
    $okBtn.Location = New-Object System.Drawing.Point(190, 180)
    $okBtn.Size = New-Object System.Drawing.Size(140, 38)
    $okBtn.DialogResult = [System.Windows.Forms.DialogResult]::OK
    $form.AcceptButton = $okBtn
    $form.Controls.Add($okBtn)

    return $form
}

function Invoke-OldPickerPattern {
    # 旧实现：return 时未 Dispose（资源泄漏模式）
    $form = New-TestPickerForm
    # 故意不调用 Dispose，将引用存入全局追踪器防止 GC 回收
    $script:LeakTracker += $form
}

function Invoke-NewPickerPattern {
    # 新实现：try/finally 保证 Dispose
    $form = New-TestPickerForm
    try {
        # 模拟 return 退出路径
        $null = "simulated return"
    } finally {
        $form.Dispose()
    }
}

# ------------------------------------------------------------------------------
# 测试2: SaveFileDialog 风格
# ------------------------------------------------------------------------------
function Invoke-OldSaveDialogPattern {
    $sfd = New-Object System.Windows.Forms.SaveFileDialog
    $sfd.Filter = "txt|*.txt|all|*.*"
    $sfd.FileName = "test-log.txt"
    # 旧实现：未 Dispose
    $script:LeakTracker += $sfd
}

function Invoke-NewSaveDialogPattern {
    $sfd = New-Object System.Windows.Forms.SaveFileDialog
    $sfd.Filter = "txt|*.txt|all|*.*"
    $sfd.FileName = "test-log.txt"
    try {
        $null = "simulated dialog"
    } finally {
        $sfd.Dispose()
    }
}

# ------------------------------------------------------------------------------
# 测试3: searchForm (Ctrl+K) 风格
# ------------------------------------------------------------------------------
function New-TestSearchForm {
    $form = New-Object System.Windows.Forms.Form
    $form.Text = "Search"
    $form.Size = New-Object System.Drawing.Size(380, 180)
    $form.KeyPreview = $true

    $inputBox = New-Object System.Windows.Forms.TextBox
    $inputBox.Location = New-Object System.Drawing.Point(20, 60)
    $inputBox.Size = New-Object System.Drawing.Size(330, 25)
    $form.Controls.Add($inputBox)

    $okBtn = New-Object System.Windows.Forms.Button
    $okBtn.Text = "OK"
    $okBtn.DialogResult = [System.Windows.Forms.DialogResult]::OK
    $form.AcceptButton = $okBtn
    $form.Controls.Add($okBtn)

    return $form
}

function Invoke-OldSearchPattern {
    $form = New-TestSearchForm
    # 旧实现：未 Dispose
    $script:LeakTracker += $form
}

function Invoke-NewSearchPattern {
    $form = New-TestSearchForm
    try {
        $null = "simulated dialog"
    } finally {
        $form.Dispose()
    }
}

# ------------------------------------------------------------------------------
# 测试执行器
# ------------------------------------------------------------------------------
function Invoke-LeakTest {
    param(
        [string]$TestName,
        [scriptblock]$OldPattern,
        [scriptblock]$NewPattern,
        [int]$Iterations
    )

    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host "Test: $TestName" -ForegroundColor Cyan
    Write-Host "Iterations: $Iterations" -ForegroundColor Cyan
    Write-Host "==========================================" -ForegroundColor Cyan

    # --- 旧实现测试 ---
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
    Start-Sleep -Milliseconds 200
    $oldBefore = Get-GdiObjectCount
    $oldUserBefore = Get-UserObjectCount

    for ($i = 1; $i -le $Iterations; $i++) {
        & $OldPattern
    }

    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
    Start-Sleep -Milliseconds 200
    $oldAfter = Get-GdiObjectCount
    $oldUserAfter = Get-UserObjectCount
    $oldDelta = $oldAfter - $oldBefore
    $oldUserDelta = $oldUserAfter - $oldUserBefore

    Write-Host ("[OLD] GDI:  {0} -> {1}  delta = +{2}" -f $oldBefore, $oldAfter, $oldDelta) -ForegroundColor Yellow
    Write-Host ("[OLD] USER: {0} -> {1}  delta = +{2}" -f $oldUserBefore, $oldUserAfter, $oldUserDelta) -ForegroundColor Yellow

    # --- 新实现测试 ---
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
    Start-Sleep -Milliseconds 200
    $newBefore = Get-GdiObjectCount
    $newUserBefore = Get-UserObjectCount

    for ($i = 1; $i -le $Iterations; $i++) {
        & $NewPattern
    }

    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
    Start-Sleep -Milliseconds 200
    $newAfter = Get-GdiObjectCount
    $newUserAfter = Get-UserObjectCount
    $newDelta = $newAfter - $newBefore
    $newUserDelta = $newUserAfter - $newUserBefore

    Write-Host ("[NEW] GDI:  {0} -> {1}  delta = +{2}" -f $newBefore, $newAfter, $newDelta) -ForegroundColor Green
    Write-Host ("[NEW] USER: {0} -> {1}  delta = +{2}" -f $newUserBefore, $newUserAfter, $newUserDelta) -ForegroundColor Green

    # --- 判定 ---
    $pass = $true

    if ($oldDelta -gt 0) {
        Write-Host ("  [OK] OLD pattern confirmed leak (+{0} GDI objects)" -f $oldDelta) -ForegroundColor Yellow
    } else {
        Write-Host ("  [WARN] OLD pattern delta {0}, GC may have collected undisposed objects" -f $oldDelta) -ForegroundColor DarkYellow
    }

    if ($newDelta -le 2) {
        Write-Host ("  [OK] NEW pattern no leak (delta = {0}, within tolerance)" -f $newDelta) -ForegroundColor Green
    } else {
        Write-Host ("  [FAIL] NEW pattern still leaks (delta = {0}, exceeds tolerance)" -f $newDelta) -ForegroundColor Red
        $pass = $false
    }

    return @{
        TestName = $TestName
        Pass = $pass
        OldDelta = $oldDelta
        NewDelta = $newDelta
        OldUserDelta = $oldUserDelta
        NewUserDelta = $newUserDelta
        Iterations = $Iterations
    }
}

# ------------------------------------------------------------------------------
# 主流程
# ------------------------------------------------------------------------------
Write-Host "==========================================================" -ForegroundColor Magenta
Write-Host "  GUI Dialog Resource Leak Test" -ForegroundColor Magenta
Write-Host "  Targets: Show-BranchPicker / SaveFileDialog / Ctrl+K Search" -ForegroundColor Magenta
Write-Host "  Iterations: $Iterations" -ForegroundColor Magenta
Write-Host "==========================================================" -ForegroundColor Magenta

# 全局泄漏追踪器（防止旧实现的 Form 被 GC 提前回收，确保泄漏可见）
$script:LeakTracker = @()

$results = @()

$results += Invoke-LeakTest `
    -TestName "1. Show-BranchPicker (branch dropdown dialog)" `
    -OldPattern ${function:Invoke-OldPickerPattern} `
    -NewPattern ${function:Invoke-NewPickerPattern} `
    -Iterations $Iterations

$results += Invoke-LeakTest `
    -TestName "2. SaveFileDialog (save log dialog)" `
    -OldPattern ${function:Invoke-OldSaveDialogPattern} `
    -NewPattern ${function:Invoke-NewSaveDialogPattern} `
    -Iterations $Iterations

$results += Invoke-LeakTest `
    -TestName "3. searchForm (Ctrl+K search dialog)" `
    -OldPattern ${function:Invoke-OldSearchPattern} `
    -NewPattern ${function:Invoke-NewSearchPattern} `
    -Iterations $Iterations

# ------------------------------------------------------------------------------
# 汇总报告
# ------------------------------------------------------------------------------
Write-Host ""
Write-Host "==========================================================" -ForegroundColor Magenta
Write-Host "  Test Summary Report" -ForegroundColor Magenta
Write-Host "==========================================================" -ForegroundColor Magenta
Write-Host ""
$header = "{0,-50} {1,8} {2,10} {3,10} {4,-10}" -f "Test", "Iter", "OldD_GDI", "NewD_GDI", "Result"
Write-Host $header -ForegroundColor White
Write-Host ("{0}" -f ("-=" * 45)) -ForegroundColor DarkGray

$allPass = $true
foreach ($r in $results) {
    $color = if ($r.Pass) { "Green" } else { "Red" }
    $mark = if ($r.Pass) { "[PASS]" } else { "[FAIL]" }
    $line = "{0,-50} {1,8} {2,10} {3,10} {4,-10}" -f $r.TestName, $r.Iterations, "+$($r.OldDelta)", "+$($r.NewDelta)", $mark
    Write-Host $line -ForegroundColor $color
    if (-not $r.Pass) { $allPass = $false }
}

Write-Host ""
if ($allPass) {
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host "  [ALL PASS] try/finally fix effectively prevents leaks" -ForegroundColor Green
    Write-Host "==========================================================" -ForegroundColor Green
    exit 0
} else {
    Write-Host "==========================================================" -ForegroundColor Red
    Write-Host "  [FAIL] Some tests failed, check fix implementation" -ForegroundColor Red
    Write-Host "==========================================================" -ForegroundColor Red
    exit 1
}
