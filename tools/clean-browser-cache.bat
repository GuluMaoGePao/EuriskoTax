@echo off
chcp 65001 >nul 2>&1
setlocal
title EuriskoTax - 一键清除旧版缓存

echo.
echo  ============================================================
echo    EuriskoTax  一键清除旧版页面缓存
echo  ============================================================
echo.
echo    什么时候用：
echo      这台电脑的浏览器一直显示旧版页面，
echo      但用其它设备 / 手机打开却是最新版本。
echo.
echo    本脚本会：
echo      1) 强制关闭 Chrome / Edge 等浏览器
echo      2) 删除浏览器里的 Service Worker 与缓存文件
echo      3) 重新打开 https://euriskotax.zeabur.app
echo.
echo    不会影响：
echo      书签、保存的密码、历史记录、其它网站的登录状态。
echo.
echo    [提示] 请先保存浏览器里正在编辑的其它网页内容，
echo           然后按任意键继续。
echo.
pause

echo.
echo  [1/4] 关闭浏览器 ...
taskkill /F /IM chrome.exe     >nul 2>&1
taskkill /F /IM msedge.exe     >nul 2>&1
taskkill /F /IM 360se.exe      >nul 2>&1
taskkill /F /IM 360chrome.exe  >nul 2>&1
taskkill /F /IM QQBrowser.exe  >nul 2>&1
taskkill /F /IM SogouExplorer.exe >nul 2>&1
timeout /t 2 /nobreak >nul

echo  [2/4] 清理 Chrome 缓存 ...
call :PurgeProfile "%LOCALAPPDATA%\Google\Chrome\User Data"

echo  [3/4] 清理 Edge 缓存 ...
call :PurgeProfile "%LOCALAPPDATA%\Microsoft\Edge\User Data"

echo  [4/4] 重新打开网站 ...
start "" "https://euriskotax.zeabur.app"

echo.
echo  ============================================================
echo    完成！浏览器已重新打开。
echo    请在首页底部确认版本号显示为「版本 1.8.0」。
echo    若仍为旧版，请再运行一次本脚本（首次清理时浏览器可能未完全退出）。
echo  ============================================================
echo.
pause
exit /b 0

:PurgeProfile
set "ROOT=%~1"
if not exist "%ROOT%" exit /b 0
for /d %%P in ("%ROOT%\*") do (
    if exist "%%~P\Service Worker" rd /s /q "%%~P\Service Worker" >nul 2>&1
    if exist "%%~P\Cache"          rd /s /q "%%~P\Cache"          >nul 2>&1
    if exist "%%~P\Code Cache"     rd /s /q "%%~P\Code Cache"     >nul 2>&1
)
exit /b 0
