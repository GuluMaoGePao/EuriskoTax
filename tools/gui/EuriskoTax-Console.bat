@echo off
REM =====================================================
REM EuriskoTax Dev Console Launcher
REM Launch GUI console without consuming AI credits
REM Located at tools/gui/, same dir as gui-dev-console.ps1
REM =====================================================

cd /d "%~dp0"

REM 确保 UTF8 BOM 存在（PowerShell 5.1 中文环境需要 BOM 才能正确解析 UTF8 中文）
REM -WindowStyle Hidden: BOM 自检瞬时完成，无需可见窗口
powershell -NoProfile -WindowStyle Hidden -Command "$f='%~dp0gui-dev-console.ps1'; $b=[IO.File]::ReadAllBytes($f); if($b.Length -lt 3 -or $b[0] -ne 0xEF -or $b[1] -ne 0xBB -or $b[2] -ne 0xBF){$bom=[byte[]]@(0xEF,0xBB,0xBF);$nb=New-Object byte[] ($bom.Length+$b.Length);[Array]::Copy($bom,0,$nb,0,$bom.Length);[Array]::Copy($b,0,$nb,$bom.Length,$b.Length);[IO.File]::WriteAllBytes($f,$nb)}"

REM 主启动: 用 start 异步启动 powershell，cmd 立即退出，避免控制台窗口残留
REM -WindowStyle Hidden 隐藏 powershell 自身窗口；GUI 日志统一走内部 OutputBox
start "EuriskoTax" powershell -NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File "%~dp0gui-dev-console.ps1"
