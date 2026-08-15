@echo off
REM =============================================
REM EuriskoTax: Create desktop shortcut
REM All logic lives in _create_shortcut.ps1
REM =============================================
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0_create_shortcut.ps1"
if errorlevel 1 ( pause ) else ( timeout /t 4 >nul )
