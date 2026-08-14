@echo off
REM =====================================================
REM EuriskoTax Dev Console Launcher
REM Launch GUI console without consuming AI credits
REM Located at tools/gui/, same dir as gui-dev-console.ps1
REM =====================================================

cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0gui-dev-console.ps1"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Console exited abnormally, code: %ERRORLEVEL%
    pause
)
