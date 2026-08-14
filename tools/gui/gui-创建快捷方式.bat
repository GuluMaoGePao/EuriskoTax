@echo off
REM =====================================================
REM Create desktop shortcut for EuriskoTax Dev Console
REM The shortcut points to gui-launch.bat in this folder
REM =====================================================

cd /d "%~dp0"

set "SHORTCUT_NAME=EuriskoTax Dev Console"
set "TARGET_PATH=%~dp0gui-启动.bat"
set "DESKTOP=%USERPROFILE%\Desktop"

if not exist "%DESKTOP%" set "DESKTOP=%USERPROFILE%\OneDrive\Desktop"
if not exist "%DESKTOP%" set "DESKTOP=%USERPROFILE%\OneDrive"

set "SHORTCUT_PATH=%DESKTOP%\%SHORTCUT_NAME%.lnk"

set "WORK_DIR=%~dp0..\.."

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ws = New-Object -ComObject WScript.Shell; " ^
  "$s = $ws.CreateShortcut('%SHORTCUT_PATH%'); " ^
  "$s.TargetPath = '%TARGET_PATH%'; " ^
  "$s.WorkingDirectory = '%WORK_DIR%'; " ^
  "$s.WindowStyle = 7; " ^
  "$s.Description = 'EuriskoTax Dev Console - local, no AI credits'; " ^
  "$s.IconLocation = '%TARGET_PATH%,0'; " ^
  "$s.Save();"

if exist "%SHORTCUT_PATH%" (
    echo [OK] Shortcut created: %SHORTCUT_PATH%
    echo      Double-click this shortcut to launch EuriskoTax Dev Console
    echo      Target: %TARGET_PATH%
) else (
    echo [FAIL] Shortcut creation failed. Check gui-启动.bat exists.
)
timeout /t 3 >nul
