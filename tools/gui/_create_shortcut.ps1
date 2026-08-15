# ==============================================================================
# EuriskoTax 桌面快捷方式创建（核心逻辑）
# 由 EuriskoTax-创建桌面快捷方式.bat 调用，传入 bat 目录即可。
# 所有路径 / 桌面定位 / WScript.Shell 调用都在本脚本内直接处理，避免 bat 转义。
#
# 图标缓存注意：
#   Windows 会把图标缓存在 IconCache.db / thumbcache_*.db 中，
#   即使 logo.ico 重新生成/替换为放大版（logo-zoomed 的覆盖产物），桌面显示仍可能是旧的小图标。
#   本脚本额外做：强制刷新 icon cache（不杀 explorer，用 SHChangeNotify + 删缓存文件）。
# ==============================================================================
[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

# 1. 路径准备：统一用 PSScriptRoot
$ShortcutBatDir = [System.IO.Path]::GetFullPath($PSScriptRoot)
$projectRoot    = [System.IO.Path]::GetFullPath((Join-Path $ShortcutBatDir "..\.."))
$imageDir       = Join-Path $projectRoot "images"
$targetBat      = Join-Path $ShortcutBatDir "EuriskoTax-Console.bat"
# logo.ico 已经由 build-zoomed-logo.ps1 生成：每个尺寸独立放大到 94~97% 填充，
# 并**覆盖写入**到 logo.ico（不再需要指向 logo-zoomed.ico）。
$iconFile       = Join-Path $imageDir   "logo.ico"
$buildLogoPs1   = Join-Path $imageDir   "build-zoomed-logo.ps1"
$shortcutName   = "EuriskoTax Dev Console.lnk"

# 2. 桌面真实路径（优先 System.Environment API，其次 OneDrive 回退）
function Get-DesktopPath {
    $special = [Environment]::GetFolderPath('Desktop')
    if (-not [string]::IsNullOrWhiteSpace($special) -and (Test-Path -LiteralPath $special)) {
        return $special
    }
    $candidates = @(
        (Join-Path $env:USERPROFILE "OneDrive\Desktop"),
        (Join-Path $env:USERPROFILE "Desktop")
    )
    foreach ($c in $candidates) {
        if (Test-Path -LiteralPath $c) { return $c }
    }
    return (Join-Path $env:USERPROFILE "Desktop")
}

# 3. 先保证 logo.ico 是最新的放大版
function Ensure-ZoomedIcoBuilt {
    if (-not (Test-Path -LiteralPath $buildLogoPs1)) {
        Write-Warning "[WARN] 找不到 build-zoomed-logo.ps1，跳过重建：$buildLogoPs1"
        return
    }
    # 如果 logo.ico 不存在，或 logo.png 更新过，就重建
    $needBuild = $false
    if (-not (Test-Path -LiteralPath $iconFile)) { $needBuild = $true }
    else {
        $srcPng = Join-Path $imageDir "logo.png"
        if ((Test-Path -LiteralPath $srcPng) -and
            ((Get-Item $srcPng).LastWriteTimeUtc -gt (Get-Item $iconFile).LastWriteTimeUtc)) {
            $needBuild = $true
        }
    }
    if ($needBuild) {
        Write-Host ""
        Write-Host "[1/3] 构建放大版 logo.ico（各尺寸 94~97% 填充）..." -ForegroundColor Cyan
        & powershell -NoProfile -ExecutionPolicy Bypass -File $buildLogoPs1
        if ($LASTEXITCODE -ne 0) { Write-Warning "[WARN] 构建放大版 logo 失败，继续使用现有文件" }
    }
}

# 4. 强制刷新 Windows 图标缓存（温和版：不杀 explorer，避免打断用户）
#   - 删除 IconCache.db（注意：它可能被 explorer 占用，删不掉就算了，加 SHChangeNotify 兜底）
#   - SHChangeNotify 通知 shell 图像变更
function Invoke-IconCacheRefresh {
    $cs = @'
using System;
using System.Runtime.InteropServices;
public static class ShellNotify {
    [DllImport("shell32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    public static extern void SHChangeNotify(int wEventId, uint uFlags, IntPtr dwItem1, IntPtr dwItem2);
    public const int SHCNE_ASSOCCHANGED = 0x08000000;
    public const int SHCNE_UPDATEDIR    = 0x00001000;
    public const uint SHCNF_IDLIST      = 0x0000;
    public const uint SHCNF_PATH        = 0x0005;
    public const uint SHCNF_FLUSH       = 0x1000;
}
'@
    if (-not ([System.Management.Automation.PSTypeName]'ShellNotify').Type) {
        Add-Type -TypeDefinition $cs -ErrorAction SilentlyContinue
    }
    # 清 IconCache.db
    try {
        $iconCache = Join-Path $env:LOCALAPPDATA "IconCache.db"
        if (Test-Path -LiteralPath $iconCache) {
            Remove-Item -LiteralPath $iconCache -Force -ErrorAction SilentlyContinue
            Write-Host "   - IconCache.db deleted" -ForegroundColor DarkGray
        }
    } catch { }
    # 清 Explorer 缩略图缓存（经常也缓存 .lnk 大图标）
    try {
        $expl = Join-Path $env:LOCALAPPDATA "Microsoft\Windows\Explorer"
        if (Test-Path -LiteralPath $expl) {
            Get-ChildItem -LiteralPath $expl -Filter "thumbcache_*.db" -ErrorAction SilentlyContinue |
                Remove-Item -Force -ErrorAction SilentlyContinue
        }
    } catch { }
    # 广播 shell 通知（关联变更 + 刷新）
    try {
        [ShellNotify]::SHChangeNotify([ShellNotify]::SHCNE_ASSOCCHANGED,
            [ShellNotify]::SHCNF_IDLIST -bor [ShellNotify]::SHCNF_FLUSH,
            [IntPtr]::Zero, [IntPtr]::Zero)
    } catch { }
}

# === 主流程 ===
Ensure-ZoomedIcoBuilt

$desktop      = Get-DesktopPath
$shortcutPath = Join-Path $desktop $shortcutName

Write-Host ""
Write-Host "[2/3] Creating shortcut..." -ForegroundColor Cyan
Write-Host "  Desktop    : $desktop"
Write-Host "  Target     : $targetBat"
Write-Host "  Icon       : $iconFile"
Write-Host "  WorkingDir : $projectRoot"

# 校验目标
if (-not (Test-Path -LiteralPath $targetBat)) {
    throw "Target bat not found: $targetBat"
}

# 旧快捷方式先删除（避免 IconLocation 被缓存）
if (Test-Path -LiteralPath $shortcutPath) {
    Remove-Item -LiteralPath $shortcutPath -Force -ErrorAction Stop
}

# 用 WScript.Shell 创建
$ws  = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut($shortcutPath)

# 指向 cmd /c ""path\to\bat"""，保证中文路径和空格都正确，且图标能独立设置
$lnk.TargetPath       = (Join-Path $env:SystemRoot "System32\cmd.exe")
$lnk.Arguments        = '/c "' + $targetBat + '"'
$lnk.WorkingDirectory = $projectRoot
$lnk.WindowStyle      = 7   # Minimized
$lnk.Description      = "EuriskoTax Dev Console - 统一启动中心"

# 图标设置：优先使用 logo.ico（已由 Ensure-ZoomedIcoBuilt 保证是放大版）
if (Test-Path -LiteralPath $iconFile) {
    $lnk.IconLocation = $iconFile
} else {
    $lnk.IconLocation = $targetBat + ",0"
    Write-Warning "[WARN] logo.ico 不存在，已退化到 bat 默认图标"
}

$lnk.Save()

# 验证结果
if (-not (Test-Path -LiteralPath $shortcutPath)) {
    throw "Shortcut file was not created: $shortcutPath"
}

# === 强制刷新图标缓存 ===
Write-Host ""
Write-Host "[3/3] Refreshing Windows icon cache ..." -ForegroundColor Cyan
Invoke-IconCacheRefresh

$fi = Get-Item -LiteralPath $shortcutPath
Write-Host ""
Write-Host "[OK] 桌面快捷方式已创建成功:" -ForegroundColor Green
Write-Host "     $shortcutPath"
Write-Host "     大小: $($fi.Length) bytes"
Write-Host ""
Write-Host "提示: 如果图标仍显示为旧版，请右键桌面 → 刷新，或按 F5；" -ForegroundColor Yellow
Write-Host "      仍未更新时请重启 Explorer，或运行:  taskkill /f /im explorer.exe ; start explorer" -ForegroundColor Yellow
exit 0
