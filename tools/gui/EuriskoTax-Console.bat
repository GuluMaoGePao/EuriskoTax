@echo off
REM =====================================================
REM EuriskoTax Dev Console Launcher
REM Launch GUI console without consuming AI credits
REM Located at tools/gui/, same dir as gui-dev-console.ps1
REM =====================================================

cd /d "%~dp0"

REM 确保 UTF8 BOM 存在（PowerShell 5.1 中文环境需要 BOM 才能正确解析 UTF8 中文）
powershell -NoProfile -Command "$f='%~dp0gui-dev-console.ps1'; $b=[IO.File]::ReadAllBytes($f); if($b.Length -lt 3 -or $b[0] -ne 0xEF -or $b[1] -ne 0xBB -or $b[2] -ne 0xBF){$bom=[byte[]]@(0xEF,0xBB,0xBF);$nb=New-Object byte[] ($bom.Length+$b.Length);[Array]::Copy($bom,0,$nb,0,$bom.Length);[Array]::Copy($b,0,$nb,$bom.Length,$b.Length);[IO.File]::WriteAllBytes($f,$nb)}"

powershell -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0gui-dev-console.ps1"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Console exited abnormally, code: %ERRORLEVEL%
    pause
)
