# ==============================================================================
# EuriskoTax 开发控制台 v3.3 (统一启动中心)
# 双击 EuriskoTax-Console.bat 即可运行，无需消耗 AI 积分
#
# v3.3 更新内容:
#   1. 导航栏改回单行显示，修复双行文本导致标签不可见的渲染问题
#   2. 标签页头部增加功能概览描述 (HeaderDesc)，列出本页功能区数量和内容
#   3. 所有卡片标题统一编号 (1. xxx / 2. xxx)，结构层次更清晰
#   4. 修复卡片描述文本被截断的问题：设置 MaximumSize 强制换行，动态计算实际高度
#   5. 标签页头部高度优化 (100→88)，操作区高度增加 (540→580)，内容不被遮挡
#
# v3.2 更新内容:
#   1. 窗口尺寸加大 (默认 1560x980，最小 1200x800)，界面更宽松不局促
#   2. 按钮全部重新命名：更直白、清晰、易懂，直接告诉你会做什么
#   3. 每张卡片新增醒目"详细功能说明"区块，使用场景一清二楚
#   4. "启动管理"页顶部增加"快速开始指引"卡片，明确告诉第一次/日常用哪个按钮
#   5. 外边距、内边距、按钮宽度全面加大，视觉呼吸感更强
# ==============================================================================

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName Microsoft.VisualBasic
[System.Windows.Forms.Application]::EnableVisualStyles()
[System.Windows.Forms.Application]::SetCompatibleTextRenderingDefault($false)

# ==============================================================================
# Win32 滚动条 API P/Invoke 定义
# 用于覆盖式自定义滚动条方案：读取 SCROLLINFO、向 RichTextBox 发送 EM_GETSCROLLPOS。
# 注：旧的 WM_NCPAINT 方案对 Panel 的 AutoScroll 滚动条不可靠，已废弃。
# ==============================================================================
$win32ScrollCSharp = @'
using System;
using System.Runtime.InteropServices;

public static class Win32ScrollApi {
    [DllImport("user32.dll")]
    public static extern bool GetScrollInfo(IntPtr hWnd, int nBar, ref SCROLLINFO lpsi);

    [DllImport("user32.dll")]
    public static extern int SetScrollInfo(IntPtr hWnd, int nBar, ref SCROLLINFO lpsi, bool redraw);

    [DllImport("user32.dll")]
    public static extern bool ShowScrollBar(IntPtr hWnd, int wBar, bool bShow);

    [DllImport("user32.dll")]
    public static extern IntPtr SendMessage(IntPtr hWnd, int Msg, IntPtr wParam, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential)]
    public struct SCROLLINFO {
        public int cbSize;
        public uint fMask;
        public int nMin;
        public int nMax;
        public uint nPage;
        public int nPos;
        public int nTrackPos;
    }

    public const int SB_VERT = 1;
    public const uint SIF_ALL = 0x1 | 0x2 | 0x4 | 0x10;
    public const int SB_THUMBTRACK = 5;
    public const int WM_VSCROLL = 0x0115;
    public const int EM_GETSCROLLPOS = 0x04DD;
    public const int EM_SETSCROLLPOS = 0x04DE;
}
'@
try {
    Add-Type -TypeDefinition $win32ScrollCSharp -ErrorAction Stop
} catch {
    # 如果已编译过则忽略重复定义错误
    if ($_.Exception.Message -notmatch 'already exists') { Write-Host "Add-Type warning: $($_.Exception.Message)" -ForegroundColor Yellow }
}

# ==============================================================================
# 路径变量
# ==============================================================================
if ($PSScriptRoot) {
    $ScriptDir = $PSScriptRoot
} elseif ($MyInvocation.MyCommand.Path) {
    $ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
} else {
    $ScriptDir = $PWD.Path
    if (-not (Test-Path (Join-Path $ScriptDir "gui-dev-console.ps1"))) {
        $guess = Join-Path $PWD.Path "tools\gui"
        if (Test-Path $guess) { $ScriptDir = $guess }
    }
}
$ScriptDir    = [System.IO.Path]::GetFullPath($ScriptDir)
$ToolsDir     = [System.IO.Path]::GetFullPath((Join-Path $ScriptDir ".."))
$ProjectRoot  = [System.IO.Path]::GetFullPath((Join-Path $ToolsDir   ".."))
$OpsDir       = Join-Path $ToolsDir "ops"
$CpolarDir    = Join-Path $ToolsDir "cpolar"
$ServerDir    = Join-Path $ProjectRoot "server"
$FrontDir     = $ProjectRoot

# ==============================================================================
# 全局状态
# ==============================================================================
$script:RunningJobs = @{ }
$script:BackendProcess = $null
$script:WatchdogProcess = $null
$script:StartTime = $null
$script:CurrentTab = "启动管理"
$script:OutputBox = $null
$script:StatusBar = $null
$script:TabPanels = @{ }
$script:TabCtxMap = @{ }

# 公网地址面板控件引用（启动管理页 → 公网地址速览卡片）
$script:PublicUrlCardLabel = $null   # 显示 URL 的大标签（可点击复制）
$script:PublicUrlCardHint  = $null   # 小字状态提示（有/无地址、更新时间）
$script:PublicUrlLastSeen  = ""      # 上次 URL，用于变化时触发弹窗

# ====== 性能优化: Font 缓存 + 输出节流 (v3.4) ======
# 之前 Update-PublicUrlCard 每次调用都 New Font 不 Dispose → GDI 句柄泄漏
$script:FontUrlDisplay = New-Object System.Drawing.Font("Consolas", 13.5, [System.Drawing.FontStyle]::Bold)
$script:FontUrlEmpty   = New-Object System.Drawing.Font("Microsoft YaHei UI", 10)
$script:FontUrlCached  = $null  # 标记当前 Label 上设的哪个 Font，避免重复赋值

# outHandler 每行都调 Update-PublicUrlCard → 每行读文件 I/O。改为节流：3 秒内只调 1 次
$script:LastUrlCardUpdateTime = [DateTime]::MinValue
$script:UrlCardUpdateMinIntervalSec = 3

# 输出区行数上限：超过则自动裁剪旧行，防止 RichTextBox 无限增长吃满内存
$script:OutputMaxLines = 5000
$script:OutputTrimTo   = 4000  # 裁剪后保留的行数

# ===== 弹窗去重 (v3.3 修复重复弹 4~6 次问题) =====
# 同一个 URL / 同一封邮件状态，180 秒内相同 key 只允许弹一次
$script:DedupPopup        = @{}   # key=事件key  value=DateTime(上次弹出时间)
$script:DedupPopupWindow  = 180   # 秒
# URL 首次"已生成"弹窗由 outHandler 负责，Set-Content 之后 Update-PublicUrlCard 就不要再弹 "首次出现"了
$script:UrlPopupMode      = $null # $null=从未弹过  "first"=已弹过首次  "change"=已弹过变更

# 辅助: 检查是否可以弹窗（180s 内同 key 只弹 1 次）；返回 true=允许弹窗，同时写入时间
function Test-AllowPopup {
    param([string]$Key)
    if ([string]::IsNullOrWhiteSpace($Key)) { return $true }
    $now = Get-Date
    # 防御性编程：
    #   1) 先 ContainsKey，避免不存在时访问索引器拿不到明确的 null/非 null 语义；
    #   2) 显式判断 $last -ne $null，再做减法 —— 不依赖「-and 短路」这一隐含知识。
    #      （因为 DateTime - $null 会抛 "Cannot find an overload for op_Subtraction"，
    #       虽然原写法靠 `$last -and (...)` 的短路能"侥幸"躲过去，但很脆弱。）
    #   3) 额外加 `-is [DateTime]` 类型检查：如果字典未来被塞入非 DateTime 脏值，
    #      宁可当作"无记录/允许弹窗"也不要让 GUI 抛异常。
    if ($script:DedupPopup.ContainsKey($Key)) {
        $last = $script:DedupPopup[$Key]
        if ($last -ne $null -and $last -is [DateTime] -and ($now - $last).TotalSeconds -lt $script:DedupPopupWindow) {
            return $false
        }
    }
    $script:DedupPopup[$Key] = $now
    return $true
}

# ==============================================================================
# 布局参数 (v3.4 更宽松大方)
# ==============================================================================
$PADDING       = 20        # 外边距
$CARD_PAD      = 16        # 卡片内边距
$BTN_H         = 64        # 按钮高度
$BTN_W         = 220       # 标准按钮宽度 (加宽)
$BTN_WIDE_W    = 290       # 宽按钮 (推荐操作)
$BTN_SMALL_W   = 170       # 小按钮宽度
$BTN_GAP       = 12        # 按钮间距
$CARD_GAP_V    = 16        # 卡片垂直间距
$SCROLL_W      = 20        # 滚动条宽度
$CARD_TITLE_H  = 32        # 卡片标题高度
$CARD_SUB_H    = 20        # 卡片副标题高度
$CARD_DESC_H   = 38        # 卡片描述高度 (支持2行换行)

# ==============================================================================
# 配色方案 (v3.4 现代深色主题 - 参考 VS Code Dark+ / Discord 风格)
# 偏蓝黑主背景 + 高饱和功能色，告别泥灰感
# ==============================================================================
$C_BG_FORM     = [System.Drawing.Color]::FromArgb(20, 22, 30)     # 主背景 (偏蓝黑)
$C_BG_L1       = [System.Drawing.Color]::FromArgb(28, 31, 42)     # 一级面板背景
$C_BG_L2       = [System.Drawing.Color]::FromArgb(32, 35, 48)     # 卡片背景 (带蓝调)
$C_BG_L3       = [System.Drawing.Color]::FromArgb(40, 44, 60)     # 卡片悬停/选中
$C_BG_BTN      = [System.Drawing.Color]::FromArgb(50, 54, 72)     # 按钮基色
$C_BG_DARK     = [System.Drawing.Color]::FromArgb(16, 18, 26)     # 输出区深底
$C_BG_GUIDE    = [System.Drawing.Color]::FromArgb(52, 62, 84)     # 指引卡片背景 (蓝调深色)
$C_BG_NAV_SEL  = [System.Drawing.Color]::FromArgb(50, 55, 78)     # 导航选中背景
$C_CARD_BORDER = [System.Drawing.Color]::FromArgb(55, 58, 75)     # 卡片边框色
$C_FG          = [System.Drawing.Color]::FromArgb(245, 245, 252)
$C_FG_MUTED    = [System.Drawing.Color]::FromArgb(200, 200, 215)
$C_FG_DIM      = [System.Drawing.Color]::FromArgb(150, 150, 170)
$C_ACCENT      = [System.Drawing.Color]::FromArgb(80, 150, 240)   # 信息蓝 (更饱和)
$C_ACCENT_HOT  = [System.Drawing.Color]::FromArgb(110, 170, 250)
$C_DANGER      = [System.Drawing.Color]::FromArgb(235, 100, 100)  # 危险红 (更亮)
$C_SUCCESS     = [System.Drawing.Color]::FromArgb(88, 196, 124)   # 成功绿 (更亮)
$C_WARN        = [System.Drawing.Color]::FromArgb(245, 170, 80)   # 警告橙
$C_PURPLE      = [System.Drawing.Color]::FromArgb(175, 110, 220)  # 紫色
$C_CYAN        = [System.Drawing.Color]::FromArgb(80, 195, 210)   # 青色
$C_GRAY        = [System.Drawing.Color]::FromArgb(120, 120, 140)
$C_BORDER      = [System.Drawing.Color]::FromArgb(60, 64, 82)     # 普通边框 (更清晰)
$C_GUIDE_ACCENT = [System.Drawing.Color]::FromArgb(255, 215, 120) # 指引金 (推荐提示)

# ==============================================================================
# 字体 (中文使用微软雅黑更清晰)
# ==============================================================================
$F_TITLE       = New-Object System.Drawing.Font("Microsoft YaHei UI", 15, [System.Drawing.FontStyle]::Bold)
$F_SUBTITLE    = New-Object System.Drawing.Font("Microsoft YaHei UI", 9)
$F_MENU        = New-Object System.Drawing.Font("Microsoft YaHei UI", 10.5)
$F_MENU_SEL    = New-Object System.Drawing.Font("Microsoft YaHei UI", 10.5, [System.Drawing.FontStyle]::Bold)
$F_TAB_HEAD    = New-Object System.Drawing.Font("Microsoft YaHei UI", 14, [System.Drawing.FontStyle]::Bold)
$F_TAB_DESC    = New-Object System.Drawing.Font("Microsoft YaHei UI", 9.5)
$F_CARD_HEAD   = New-Object System.Drawing.Font("Microsoft YaHei UI", 12, [System.Drawing.FontStyle]::Bold)
$F_CARD_SUB    = New-Object System.Drawing.Font("Microsoft YaHei UI", 9)
$F_CARD_DESC   = New-Object System.Drawing.Font("Microsoft YaHei UI", 9)
$F_BTN_MAIN    = New-Object System.Drawing.Font("Microsoft YaHei UI", 9.5, [System.Drawing.FontStyle]::Bold)
$F_STATUS      = New-Object System.Drawing.Font("Microsoft YaHei UI", 9)
$F_LOG         = New-Object System.Drawing.Font("Consolas", 9.5)
$F_GUIDE_HEAD  = New-Object System.Drawing.Font("Microsoft YaHei UI", 12, [System.Drawing.FontStyle]::Bold)
$F_GUIDE_ITEM  = New-Object System.Drawing.Font("Microsoft YaHei UI", 9.5)

# ==============================================================================
# 覆盖式自定义滚动条（Overlay Scrollbar v2 - 绝对定位锚定）
# 核心修复：v1 用 overlay.Dock = "Right" 会参与父容器布局，
#           把 Dock=Fill 的滚动区挤掉 8px 右边 → 用户看到"滚动条改坏了"。
# v2：overlay 使用绝对坐标 + 父控件 Layout 事件手动锚定，始终浮在 Target
#     可见区域的右上角，不参与任何布局挤压。
# ==============================================================================
# ==============================================================================
# 覆盖式自定义滚动条 v3.2（精致 macOS 风 + 白底修复 + DPI 自适应）
#   - 超细：常态 5px（DPI 自适应原生条宽度，不再硬编码）
#   - 高透明：Alpha 4 档（静止 0 / 滚动中 85 / 悬停 155 / 拖拽 210）
#   - 精致：胶囊圆角 + 悬停双层柔光光晕 + 悬停宽度插值 5→8px
#   - 智能隐藏：macOS 风静止 1.1s 淡出消失
#   - 滚动效果优化：60FPS 全局定时器做位置/alpha/宽度三重插值
#   - 白底覆盖：主动画 Target.BackColor 填满 overlay（彻底盖掉原生条白底）
#   - 鼠标滚轮转发：overlay 捕获 Wheel 后通过 SendMessage 转发给 Target
#   - DPI 自适应：使用 SystemInformation.VerticalScrollBarWidth 获取真实原生条宽度
#   - 健壮性：TabStop=false 防止焦点夺取；定时器异常保护；数组自动清理
# ==============================================================================
$script:ScrollbarOverlays = @()
# 全局共享的 ~60FPS 动画/淡出定时器（所有 overlay 共用一个，省资源）
if (-not $script:ScrollbarAnimTimer) {
    $script:ScrollbarAnimTimer = New-Object System.Windows.Forms.Timer
    $script:ScrollbarAnimTimer.Interval = 16
    $script:ScrollbarAnimTimer.Add_Tick({
        try {
            $dead = @()
            foreach ($ovl in $script:ScrollbarOverlays) {
                if ($ovl -and $ovl.IsHandleCreated -and -not $ovl.IsDisposed) {
                    $ovl.Invalidate()
                } else {
                    $dead += $ovl
                }
            }
            # 清理已销毁的 overlay（防止数组无限增长）
            if ($dead.Count -gt 0) {
                $script:ScrollbarOverlays = @($script:ScrollbarOverlays | Where-Object { $_ -notin $dead })
            }
        } catch {
            # 高频动画回调（~60fps），单帧异常跳过即可，记录日志会刷屏
        }
    })
    $script:ScrollbarAnimTimer.Start()
}

function New-ScrollbarOverlay {
    <#
    .SYNOPSIS
    为指定控件创建一个超细、高透明、macOS 风格的覆盖式滚动条。
    #>
    param($Target, [bool]$IsRichTextBox = $false)

    # === 几何参数 ===
    # V3.2 最终方案：overlay 宽度 = 原生滚动条完整宽度，
    #   主动画 Target.BackColor 填满整个 overlay 区域（彻底覆盖原生条白底），
    #   再在上面画 5/8px 视觉滑块。这是 Chromium/VSCode 等现代滚动条的通用做法。
    [int]$NATIVE_W = 17  # 默认值
    try {
        $w = [System.Windows.Forms.SystemInformation]::VerticalScrollBarWidth
        if ($w -ge 10 -and $w -le 50) { $NATIVE_W = $w }
    } catch {
        # 读取系统参数失败时使用默认值 17，这是合理的容错降级
    }
    [int]$STRIP_W    = 5   # 视觉滑块常态宽（纤细）
    [int]$FAT_W      = 8   # 悬停/拖拽视觉滑块宽
    [int]$MIN_H      = 26  # 滑块最小高度
    [int]$STRIP_RPAD = 4   # 视觉滑块在 overlay 右边的留白（居中靠右）

    # 创建覆盖层：宽度 = 原生条宽
    $overlay = New-Object System.Windows.Forms.Panel
    $overlay.Width = $NATIVE_W
    $overlay.BackColor = [System.Drawing.Color]::Transparent
    $overlay.Margin = New-Object System.Windows.Forms.Padding(0)
    $overlay.Padding = New-Object System.Windows.Forms.Padding(0)
    $overlay.Cursor = "Hand"
    $overlay.TabStop = $false

    # 缓存 Target 的背景色（用来主动画覆盖白底）
    $scrollBgBrush = $null

    # 状态变量（动画 + 视觉）
    $state = @{
        Target = $Target
        IsRTB = $IsRichTextBox
        IsDragging = $false
        DragStartY = 0
        DragStartThumbY = 0
        IsHovering = $false
        LastActiveAt = [DateTime]::UtcNow.AddDays(-1)
        CurAlpha = 0
        TargetAlpha = 0
        AnimThumbY = -1
        TargetThumbY = -1
        ThumbH = -1
        ThumbRect = $null
        RangeExceed = $false
        CurThumbW = $STRIP_W
    }

    # 标记用户有交互（触发"显示" + 重置淡出倒计时）
    $markActive = {
        $state.LastActiveAt = [DateTime]::UtcNow
    }.GetNewClosure()

    # 手动锚定：贴 Target 可见区域的最右边（overlay 宽度 = 原生条宽 17px）
    $reanchorOverlay = {
        if (-not $Target.Parent) { return }
        if (-not $Target.IsHandleCreated) { return }
        [System.Drawing.Rectangle]$tRect = $Target.Bounds
        [int]$newX = $tRect.Right - $NATIVE_W
        [int]$newY = $tRect.Top
        [int]$newH = $tRect.Height
        if ($overlay.Parent) {
            if ($overlay.Location.X -ne $newX -or $overlay.Location.Y -ne $newY -or
                $overlay.Height -ne $newH -or $overlay.Width -ne $NATIVE_W) {
                $overlay.SuspendLayout()
                $overlay.Location = New-Object System.Drawing.Point($newX, $newY)
                $overlay.Size = New-Object System.Drawing.Size($NATIVE_W, $newH)
                $overlay.ResumeLayout($false)
            }
        }
    }.GetNewClosure()

    # 获取当前滚动信息
    $getScrollInfo = {
        if (-not $Target -or -not $Target.IsHandleCreated) {
            return [ordered]@{ Min = 0; Max = 0; Page = 0; Pos = 0 }
        }
        if ($state.IsRTB) {
            $ptr = [System.Runtime.InteropServices.Marshal]::AllocHGlobal(8)
            try {
                [System.Runtime.InteropServices.Marshal]::WriteInt32($ptr, 0, 0)
                [System.Runtime.InteropServices.Marshal]::WriteInt32($ptr, 4, 0)
                [Win32ScrollApi]::SendMessage($Target.Handle, [Win32ScrollApi]::EM_GETSCROLLPOS, [IntPtr]::Zero, $ptr) | Out-Null
                $yPos = [System.Runtime.InteropServices.Marshal]::ReadInt32($ptr, 4)
            } finally {
                [System.Runtime.InteropServices.Marshal]::FreeHGlobal($ptr)
            }
            [int]$lineCount = $Target.GetLineFromCharIndex($Target.TextLength) + 1
            [int]$lineHeight = [int]$Target.Font.GetHeight() + 2
            [int]$visibleLines = [int]($Target.ClientSize.Height / $lineHeight)
            [int]$maxPos = [Math]::Max(1, ($lineCount - $visibleLines) * $lineHeight)
            [int]$pageH = [int]$Target.ClientSize.Height
            return [ordered]@{
                Min = [int]0
                Max = [int]($maxPos + $pageH - 1)
                Page = [int]$pageH
                Pos = [int]$yPos
            }
        } else {
            $si = New-Object Win32ScrollApi+SCROLLINFO
            $si.cbSize = [System.Runtime.InteropServices.Marshal]::SizeOf($si)
            $si.fMask = [Win32ScrollApi]::SIF_ALL
            [Win32ScrollApi]::GetScrollInfo($Target.Handle, [Win32ScrollApi]::SB_VERT, [ref]$si) | Out-Null
            return [ordered]@{
                Min = [int]$si.nMin
                Max = [int]$si.nMax
                Page = [int]$si.nPage
                Pos = [int]$si.nPos
            }
        }
    }.GetNewClosure()

    # 创建圆角胶囊路径（macOS 风两端半圆形）
    function New-CapsulePath {
        param([int]$X, [int]$Y, [int]$W, [int]$H)
        if ($W -lt 2) { $W = 2 }
        if ($H -lt 2) { $H = 2 }
        [int]$r = [Math]::Min($W, $H) / 2
        $path = New-Object System.Drawing.Drawing2D.GraphicsPath
        $path.AddArc($X, $Y, $r * 2, $r * 2, 180, 90)
        $path.AddArc($X + $W - $r * 2, $Y, $r * 2, $r * 2, 270, 90)
        $path.AddArc($X + $W - $r * 2, $Y + $H - $r * 2, $r * 2, $r * 2, 0, 90)
        $path.AddArc($X, $Y + $H - $r * 2, $r * 2, $r * 2, 90, 90)
        $path.CloseFigure()
        return $path
    }

    # === 核心绘制 ===
    # 第 0 步：覆盖原生滚动条白底 —— 用 Target 的背景色填满 overlay（17px 宽）
    # 第 1 步：按 alpha 绘制胶囊滑块（5/8px 细条，居中靠右）
    # 第 2 步：悬停/拖拽时画微发光
    $overlay.Add_Paint({
        $g = $_.Graphics
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

        # === 0. 用 Target 背景色填充 overlay 整个区域（彻底盖住原生条白底） ===
        if ($null -eq $scrollBgBrush) {
            try {
                if ($Target -and $Target.IsHandleCreated -and $Target.BackColor -ne [System.Drawing.Color]::Transparent) {
                    $scrollBgBrush = New-Object System.Drawing.SolidBrush($Target.BackColor)
                }
            } catch {
                # 创建画刷失败时跳过背景填充，不影响后续绘制
            }
        }
        if ($null -ne $scrollBgBrush) {
            try {
                $g.FillRectangle($scrollBgBrush, 0, 0, $overlay.Width, $overlay.Height)
            } catch {
                # 单次绘制失败跳过即可，下一帧会重试
            }
        }

        $info = & $getScrollInfo
        [int]$iMin   = $info.Min
        [int]$iMax   = $info.Max
        [int]$iPage  = $info.Page
        [int]$iPos   = $info.Pos
        [int]$trackH = [int]$overlay.Height
        [int]$ovlW   = [int]$overlay.Width

        [int]$range = $iMax - $iMin + 1
        $state.RangeExceed = ($range -gt $iPage -and $trackH -gt 0)

        if (-not $state.RangeExceed) {
            $state.ThumbRect = $null
            $state.AnimThumbY = -1
            return
        }

        # 1. 目标滑块几何
        [int]$thumbH = [int]($trackH * $iPage / $range)
        if ($thumbH -lt $MIN_H) { $thumbH = $MIN_H }
        if ($thumbH -gt $trackH) { $thumbH = $trackH }
        [int]$scrollRange = $range - $iPage
        [int]$trackAvail  = $trackH - $thumbH
        if ($trackAvail -lt 1) { $trackAvail = 1 }
        [int]$tgtThumbY = [int]($trackAvail * $iPos / [Math]::Max(1, $scrollRange))
        if ($tgtThumbY -lt 0) { $tgtThumbY = 0 }
        if ($tgtThumbY -gt ($trackH - $thumbH)) { $tgtThumbY = $trackH - $thumbH }
        $state.ThumbH = $thumbH
        $state.TargetThumbY = $tgtThumbY

        # 2. 位置插值（45% 每帧收敛）
        if ($state.AnimThumbY -lt 0) {
            $state.AnimThumbY = $tgtThumbY
        } else {
            [double]$dY = $tgtThumbY - $state.AnimThumbY
            if ([Math]::Abs($dY) -gt 0.5) {
                $state.AnimThumbY = [int][Math]::Round($state.AnimThumbY + $dY * 0.45)
            } else {
                $state.AnimThumbY = $tgtThumbY
            }
        }

        # 3. 目标 alpha
        [TimeSpan]$idle = [DateTime]::UtcNow - $state.LastActiveAt
        [bool]$justRolled = ($idle.TotalMilliseconds -lt 1100)
        if ($state.IsDragging) {
            $state.TargetAlpha = 210
        } elseif ($state.IsHovering) {
            $state.TargetAlpha = 155
        } elseif ($justRolled) {
            $state.TargetAlpha = 85
        } else {
            $state.TargetAlpha = 0
        }

        # alpha 插值
        if ($state.CurAlpha -ne $state.TargetAlpha) {
            [int]$dA = $state.TargetAlpha - $state.CurAlpha
            if ([Math]::Abs($dA) -le 2) {
                $state.CurAlpha = $state.TargetAlpha
            } else {
                $state.CurAlpha = [int][Math]::Round($state.CurAlpha + $dA * 0.35)
            }
        }
        if ($state.CurAlpha -le 0) {
            $state.ThumbRect = $null
            return
        }
        if ($state.CurAlpha -gt 255) { $state.CurAlpha = 255 }

        # 4. 宽度插值（5 → 8 悬停增粗）
        [int]$targetThumbW = if ($state.IsDragging -or $state.IsHovering) { $FAT_W } else { $STRIP_W }
        if (-not $state.CurThumbW) { $state.CurThumbW = $STRIP_W }
        [int]$dW = $targetThumbW - $state.CurThumbW
        if ([Math]::Abs($dW) -le 1) { $state.CurThumbW = $targetThumbW }
        else { $state.CurThumbW = [int][Math]::Round($state.CurThumbW + $dW * 0.5) }
        [int]$thumbW = $state.CurThumbW
        if ($thumbW -lt 1) { $thumbW = 1 }

        # 5. 矩形：视觉条靠右居中（STRIP_RPAD 留白，让右侧留空更透气）
        [int]$thumbX = $ovlW - $STRIP_RPAD - $thumbW
        [int]$thumbY = $state.AnimThumbY
        if ($thumbX -lt 0) { $thumbX = 0 }
        if ($thumbX + $thumbW -gt $ovlW) { $thumbX = $ovlW - $thumbW }
        $rect = New-Object System.Drawing.Rectangle($thumbX, $thumbY, $thumbW, $thumbH)
        $state.ThumbRect = $rect

        # 6. 悬停/拖拽光晕（外层柔光 + 内层光亮）
        if ($state.CurAlpha -ge 80 -and ($state.IsHovering -or $state.IsDragging)) {
            [int]$glowAlpha = [Math]::Min(110, [int]($state.CurAlpha * 0.45))
            try {
                [System.Drawing.Rectangle]$gr1 = [System.Drawing.Rectangle]::Inflate($rect, 3, 4)
                [System.Drawing.Rectangle]$gr2 = [System.Drawing.Rectangle]::Inflate($rect, 1, 2)
                $gp1 = New-CapsulePath $gr1.X $gr1.Y $gr1.Width $gr1.Height
                $b1  = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb([int]($glowAlpha * 0.35), 150, 160, 195))
                $g.FillPath($b1, $gp1); $b1.Dispose(); $gp1.Dispose()
                $gp2 = New-CapsulePath $gr2.X $gr2.Y $gr2.Width $gr2.Height
                $b2  = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb($glowAlpha, 165, 175, 210))
                $g.FillPath($b2, $gp2); $b2.Dispose(); $gp2.Dispose()
            } catch {
                # 光晕绘制失败跳过即可，不影响主滑块渲染
            }
        }

        # 7. 主滑块（中性灰紫胶囊）
        [int]$a = $state.CurAlpha
        [int]$rBase = 125; [int]$gBase = 135; [int]$bBase = 165
        if ($state.IsDragging) {
            $rBase = 130; $gBase = 145; $bBase = 185
        } elseif ($state.IsHovering) {
            $rBase = 130; $gBase = 142; $bBase = 178
        }
        $mainColor = [System.Drawing.Color]::FromArgb($a, $rBase, $gBase, $bBase)
        try {
            $capPath = New-CapsulePath $rect.X $rect.Y $rect.Width $rect.Height
            $mainBrush = New-Object System.Drawing.SolidBrush($mainColor)
            $g.FillPath($mainBrush, $capPath)
            $mainBrush.Dispose(); $capPath.Dispose()
        } catch {
            # 主滑块绘制失败跳过即可，下一帧会重试
        }

    }.GetNewClosure())

    $setScrollY = {
        param([int]$newY)
        if (-not $Target -or -not $Target.IsHandleCreated) { return }
        if ($state.IsRTB) {
            $ptr = [System.Runtime.InteropServices.Marshal]::AllocHGlobal(8)
            try {
                [System.Runtime.InteropServices.Marshal]::WriteInt32($ptr, 0, 0)
                [System.Runtime.InteropServices.Marshal]::WriteInt32($ptr, 4, $newY)
                [Win32ScrollApi]::SendMessage($Target.Handle, [Win32ScrollApi]::EM_SETSCROLLPOS, [IntPtr]::Zero, $ptr) | Out-Null
            } finally {
                [System.Runtime.InteropServices.Marshal]::FreeHGlobal($ptr)
            }
        } else {
            $Target.AutoScrollPosition = New-Object System.Drawing.Point(0, $newY)
        }
    }.GetNewClosure()

    $hitTestThumb = {
        param([int]$mouseY)
        if (-not $state.ThumbRect) { return $false }
        return ($mouseY -ge [int]$state.ThumbRect.Top -and $mouseY -le [int]$state.ThumbRect.Bottom)
    }.GetNewClosure()

    $overlay.Add_MouseDown({
        & $markActive
        [int]$my = [int]$_.Y
        if (& $hitTestThumb $my) {
            $state.IsDragging = $true
            $state.DragStartY = $my
            $state.DragStartThumbY = $state.AnimThumbY
        } elseif ($state.ThumbRect) {
            $info = & $getScrollInfo
            [int]$iMin  = $info.Min
            [int]$iMax  = $info.Max
            [int]$iPage = $info.Page
            [int]$iPos  = $info.Pos
            [int]$pageStep = [Math]::Max(1, [int]($iPage * 0.9))
            if ($my -lt [int]$state.ThumbRect.Top) {
                $newPos = [Math]::Max($iMin, $iPos - $pageStep)
            } else {
                $newPos = [Math]::Min($iMax - $iPage + 1, $iPos + $pageStep)
            }
            & $setScrollY $newPos
        }
    }.GetNewClosure())

    $overlay.Add_MouseMove({
        & $markActive
        if (-not $state.IsDragging) {
            if (-not $state.IsHovering) { $state.IsHovering = $true }
            return
        }
        [int]$my     = [int]$_.Y
        [int]$trackH = [int]$overlay.Height
        [int]$thumbH = [int]$state.ThumbH
        if ($thumbH -le 0) { return }
        [int]$deltaY     = $my - [int]$state.DragStartY
        [int]$newThumbY  = [int]$state.DragStartThumbY + $deltaY
        [int]$trackAvail = $trackH - $thumbH
        if ($trackAvail -lt 1) { $trackAvail = 1 }
        if ($newThumbY -lt 0) { $newThumbY = 0 }
        if ($newThumbY -gt $trackAvail) { $newThumbY = $trackAvail }

        $info = & $getScrollInfo
        [int]$iMin  = $info.Min
        [int]$iMax  = $info.Max
        [int]$iPage = $info.Page
        [int]$scrollRange = ($iMax - $iMin + 1) - $iPage
        if ($scrollRange -le 0) { return }
        [int]$newPos = [int]($newThumbY * $scrollRange / $trackAvail)
        $newPos = [Math]::Max($iMin, [Math]::Min($newPos, $iMax - $iPage + 1))
        & $setScrollY $newPos
    }.GetNewClosure())

    $overlay.Add_MouseUp({
        & $markActive
        $state.IsDragging = $false
    }.GetNewClosure())

    $overlay.Add_MouseEnter({
        & $markActive
        $state.IsHovering = $true
    }.GetNewClosure())

    $overlay.Add_MouseLeave({
        & $markActive
        $state.IsHovering = $false
        if ($state.IsDragging) { $state.IsDragging = $false }
    }.GetNewClosure())

    # 关键：overlay 覆盖了 Target 的原生滚动条区域，鼠标滚轮事件被 overlay 吞掉
    # 直接计算目标滚动位置（比 SendMessage 更可靠，跨 32/64 位无差异）
    $overlay.Add_MouseWheel({
        & $markActive
        if (-not $Target -or -not $Target.IsHandleCreated) { return }
        $delta = $_.Delta
        $info = & $getScrollInfo
        $iMin = $info.Min
        $iMax = $info.Max
        $iPos = $info.Pos
        $iPage = $info.Page
        [int]$range = $iMax - $iMin + 1
        [int]$scrollRange = $range - $iPage
        if ($scrollRange -le 0) { return }

        # 标准：WHEEL_DELTA=120 为一格，每格滚动 page/8
        [int]$steps = [Math]::Sign($delta) * [Math]::Max(1, [Math]::Abs([int][Math]::Round([double]$delta / 120.0)))
        [int]$stepPx = [Math]::Max(1, [int]($iPage / 8))
        [int]$newPos = $iPos + $steps * $stepPx
        $newPos = [Math]::Max($iMin, [Math]::Min($newPos, $iMax - $iPage + 1))
        & $setScrollY $newPos
    }.GetNewClosure())

    # === 锚定（绝对坐标，不参与布局） ===
    $parent = $Target.Parent
    if ($parent) {
        $parent.Controls.Add($overlay)
        $overlay.BringToFront()
        & $reanchorOverlay

        $parent.Add_Layout({
            & $reanchorOverlay
            & $markActive
        }.GetNewClosure())

        $Target.Add_Resize({
            & $reanchorOverlay
            & $markActive
        }.GetNewClosure())

        $Target.Add_Move({
            & $reanchorOverlay
        }.GetNewClosure())

        $parent.Add_ControlAdded({
            $overlay.BringToFront()
            & $reanchorOverlay
        }.GetNewClosure())
    }

    # 滚动信号 → 显示滚动条
    if ($IsRichTextBox) {
        $Target.Add_VScroll({
            & $markActive
        }.GetNewClosure())
    } else {
        $Target.Add_Scroll({
            & $markActive
        }.GetNewClosure())
    }

    $Target.Add_MouseWheel({
        & $markActive
    }.GetNewClosure())

    $script:ScrollbarOverlays += $overlay
    return $overlay
}
# ==============================================================================
# 辅助函数: Open-ApiDocsAuto（一键全自动查看API文档）
#   流程：1.后端可达检查 2.自动登录取Token 3.生成自定义Swagger页面（
#         preauthorize 自动注入 Bearer Token + 自动点 Authorize + Close）
#         4.浏览器打开
# ==============================================================================
function Open-ApiDocsAuto {
    Write-Log "[API文档] ===== 一键全自动打开 API 文档 =====" "CMD"
    Write-Log "[API文档] [步骤1/5] 检查后端是否在线..." "INFO"

    # 1. 先检查后端是否在线
    $backendOnline = $false
    try {
        $null = Invoke-WebRequest -Uri "http://localhost:3000/health" -TimeoutSec 3 -UseBasicParsing
        $backendOnline = $true
        Write-Log "[API文档] [步骤1] ✅ 后端在线 (health=200)" "OK"
    } catch {
        Write-Log "[API文档] [步骤1] ❌ 后端未启动！请先到【🚀 启动管理】启动后端" "ERROR"
        return
    }

    # 2. 检查 /api/docs.json 是否可用（这是自定义Swagger页面的数据源）
    Write-Log "[API文档] [步骤2/5] 检查 /api/docs.json 规范文件..." "INFO"
    $specUrl = "http://localhost:3000/api/docs.json"
    $specAvailable = $false
    try {
        $specCheck = Invoke-WebRequest -Uri $specUrl -TimeoutSec 3 -UseBasicParsing
        $specAvailable = $true
        Write-Log "[API文档] [步骤2] ✅ /api/docs.json 可用 (HTTP $($specCheck.StatusCode))" "OK"
    } catch {
        Write-Log "[API文档] [步骤2] ⚠️ /api/docs.json 返回404，后端可能未重启加载新路由" "WARN"
        Write-Log "[API文档] [步骤2] → 将使用原版 Swagger (/api/docs) 作为降级方案" "WARN"
    }

    # 3. 获取 Token
    Write-Log "[API文档] [步骤3/5] 自动登录获取 Bearer Token..." "INFO"
    $token = $null
    try {
        $loginBody = @{ email = "dev@example.com"; password = "password" } | ConvertTo-Json
        $resp = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" -Method POST -ContentType "application/json" -Body $loginBody -TimeoutSec 8
        if ($resp.success -and $resp.data.token) {
            $token = $resp.data.token
            Set-Clipboard -Value $token
            Write-Log "[API文档] [步骤3] ✅ 登录成功，用户：$($resp.data.user.email)，Token长度：$($token.Length)" "OK"
        } else {
            Write-Log "[API文档] [步骤3] ⚠️ 登录返回失败，将不预填Token" "WARN"
        }
    } catch {
        Write-Log "[API文档] [步骤3] ⚠️ 自动取Token失败：$($_.Exception.Message)" "WARN"
    }

    # 4. 如果 /api/docs.json 不可用，降级为打开原版Swagger + 提示
    if (-not $specAvailable) {
        Write-Log "[API文档] [步骤4] 降级方案：打开原版 Swagger UI" "INFO"
        Write-Log "[API文档] [步骤4] ⚠️ /api/docs.json 不存在，无法使用全自动自定义页面" "WARN"
        Write-Log "[API文档] [步骤4] → 已打开原版 /api/docs，请手动点 Authorize 粘贴Token" "INFO"
        Write-Log "[API文档] [步骤4] 💡 要启用全自动模式，请到【启动管理】停止后端后重新启动" "INFO"
        Write-Log "[API文档] [步骤4]    （新加的 /api/docs.json 路由需要重启后端才生效）" "INFO"
        if ($token) {
            Write-Log "[API文档] [步骤4] Token已复制到剪贴板，打开后粘贴到 Authorize 即可" "OK"
        }
        Start-Process "http://localhost:3000/api/docs"
        return
    }

    # 5. 生成自定义Swagger页面（全自动化）
    Write-Log "[API文档] [步骤4/5] 生成自定义 Swagger 页面（自动授权）..." "INFO"
    $hasToken = (-not [string]::IsNullOrWhiteSpace($token))

    # === PS 5.1 兼容：JS 代码统一用单引号字符串 + 占位符替换，避免 Here-string 在 if 块内解析失败 ===
    # 预先定义两个 onComplete 模板（有Token vs 无Token），然后在 if 外面做字符串替换
    $onCompleteTplWithToken =
        'onComplete: function() { ' +
        'try { ' +
        'ui.preauthorizeApiKey("bearerAuth", "Bearer __TOKEN__"); ' +
        'setTimeout(function(){ ' +
        'var topAuthBtn = document.querySelector(".topbar .authorization__btn"); ' +
        'if (topAuthBtn) topAuthBtn.click(); ' +
        'setTimeout(function(){ ' +
        'var dialog = document.querySelector(".dialog-ux"); ' +
        'if (dialog) { ' +
        'var btns = dialog.querySelectorAll("button"); ' +
        'for (var i=0; i<btns.length; i++) { ' +
        'if (/^Authorize$/i.test(btns[i].innerText.trim())) { btns[i].click(); break; } ' +
        '} ' +
        'setTimeout(function(){ ' +
        'var d2 = document.querySelector(".dialog-ux"); ' +
        'if (d2) { ' +
        'var cbtns = d2.querySelectorAll("button"); ' +
        'for (var j=0; j<cbtns.length; j++) { ' +
        'if (/^Close$/i.test(cbtns[j].innerText.trim())) { cbtns[j].click(); break; } ' +
        '} ' +
        '} ' +
        '}, 400); ' +
        '} ' +
        '}, 500); ' +
        '}, 700); ' +
        '} catch(e) { console.warn(e); } ' +
        '}'
    $onCompleteTplNoToken = 'onComplete: function(){}'

    # PS 5.1 兼容：预先计算所有变量
    if ($hasToken) {
        $statusHtml    = '<span style="color:#52c41a;font-weight:700">✅ Bearer Token 已自动注入，全自动授权完成</span>'
        $tokenPreview  = $token.Substring(0, [Math]::Min(50, $token.Length)) + '...'
        $tokenForJs    = $token -replace "'", "\'"   # JS 字符串转义

        # requestInterceptor JS 代码（放在 PowerShell 单引号字符串里）
        # 说明：PS 5.1 中只有双引号 "..." 才会展开 $变量 和 特殊字符；
        #       单引号 '...' 内 $ 、 & 、 \ 、 / 都是字面量，因此正则里的 $ 锚点可以直接写，
        #       不需要再拆成多段拼接。之前拆成 "'...' + '$|...' + '$/'" 的写法已被误读为 regex bug，
        #       现改为一个单引号整串，输出结果字节级一致（JS 正则仍为 /\/auth\/login$|\/auth\/register$/）。
        $reqPart1 = '      if (!/\/auth\/login$|\/auth\/register$/.test(req.url) && !req.headers.Authorization) { req.headers.Authorization = '
        $reqPart2 = "'Bearer ' + '" + $tokenForJs + "'; }"
        $reqInterceptorJs = $reqPart1 + $reqPart2

        # onComplete: 替换占位符
        $onCompleteJs = $onCompleteTplWithToken -replace '__TOKEN__', $tokenForJs
    } else {
        $statusHtml    = '<span style="color:#faad14;font-weight:700">⚠️ Token 获取失败，请手动点击 Authorize 粘贴</span>'
        $tokenPreview  = '（无）'
        $tokenForJs    = ''
        $reqInterceptorJs = '      // no token available'
        $onCompleteJs  = $onCompleteTplNoToken
    }

    $html = @"
<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8">
<title>EuriskoTax API 文档（全自动）</title>
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
<style>
html,body{margin:0;font-family:'Microsoft YaHei',PingFang SC,Segoe UI,sans-serif;line-height:1.6}
.topbar{background:#1e293b!important;padding:12px 28px;color:#fff;display:flex;align-items:center;justify-content:space-between;box-shadow:0 2px 6px rgba(0,0,0,.15)}
.topbar h2{margin:0;font-size:18px;font-weight:600;letter-spacing:.3px}
.topbar .tag{font-size:13px;padding:4px 12px;border-radius:999px;background:#0ea5e9}
.hint{margin:18px 28px 8px;padding:14px 18px;background:#f0fdf4;border-left:4px solid #22c55e;border-radius:6px;color:#0f172a;font-size:14px}
.hint .mono{background:#0f172a;color:#fbbf24;padding:2px 7px;border-radius:4px;font-family:Consolas,Monaco,monospace;font-size:12.5px;margin:0 3px;word-break:break-all}
.hint .row{margin:3px 0}
.swagger-ui .scheme-container{box-shadow:none!important;margin:8px 0 4px!important;padding:10px 28px!important}
.swagger-ui .info{margin:6px 28px 10px!important}
</style></head><body>
<div class="topbar">
  <h2>📚 EuriskoTax · 个税计算系统 API 文档</h2>
  <div class="tag">$statusHtml</div>
</div>
<div class="hint">
  <div class="row">👉 <b>你什么都不用做，接口已经能直接调试了！</b> 展开任意接口 → 点 <b>Try it out</b> → 点 <b>Execute</b> 即可。</div>
  <div class="row">登录账号：<span class="mono">dev@example.com</span> / 密码 <span class="mono">password</span> · Token 已自动复制到剪贴板</div>
  <div class="row">Bearer Token 预览：<span class="mono">$tokenPreview</span> · 有效期 1 小时，过期后重新点 GUI 按钮</div>
</div>
<div id="swagger-ui"></div>
<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js" crossorigin></script>
<script>
try {
  window.ui = SwaggerUIBundle({
    url: "http://localhost:3000/api/docs.json",
    dom_id: '#swagger-ui',
    deepLinking: true,
    docExpansion: "list",
    defaultModelsExpandDepth: 1,
    defaultModelExpandDepth: 1,
    presets: [SwaggerUIBundle.presets.apis],
    layout: "BaseLayout",
    filter: true,
    requestInterceptor: function(req) {
$reqInterceptorJs
      return req;
    },
    $onCompleteJs
  });
} catch(err) {
  document.getElementById('swagger-ui').innerHTML = '<div style="margin:40px 28px;padding:24px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;color:#991b1b"><h3 style="margin:0 0 8px">❌ 加载失败</h3>请先在 GUI 启动管理中 <b>重启后端</b>，再点按钮重试。<pre style="margin-top:12px;background:#111;color:#fecaca;padding:10px;border-radius:6px;overflow:auto;font-size:12px">' + String(err) + '</pre></div>';
}
</script></body></html>
"@
    $outPath = Join-Path $env:TEMP "euriskotax-swagger.html"
    [System.IO.File]::WriteAllText($outPath, $html, (New-Object System.Text.UTF8Encoding $false))
    $fileSize = (Get-Item $outPath).Length
    Write-Log "[API文档] [步骤4] ✅ 页面已生成：$outPath ($fileSize bytes)" "OK"

    # 5. 打开浏览器
    Write-Log "[API文档] [步骤5/5] 打开浏览器..." "INFO"
    Start-Process $outPath
    Write-Log "[API文档] ===== ✅ 全部完成！浏览器已打开 =====" "OK"
    Write-Log "[API文档] 💡 页面打开后直接展开接口点 Try it out 即可，无需手动授权" "INFO"
}

# ==============================================================================
# 辅助函数: Write-Log
# ==============================================================================
function Write-Log {
    param(
        [string]$Text,
        [ValidateSet("INFO", "OK", "WARN", "ERROR", "CMD", "GRAY")]
        [string]$Level = "INFO"
    )
    if (-not $script:OutputBox) { return }
    $color = switch ($Level) {
        "INFO"  { $C_FG }
        "OK"    { [System.Drawing.Color]::LightGreen }
        "WARN"  { [System.Drawing.Color]::Yellow }
        "ERROR" { [System.Drawing.Color]::Tomato }
        "CMD"   { [System.Drawing.Color]::Cyan }
        "GRAY"  { $C_FG_DIM }
    }
    $timestamp = Get-Date -Format "HH:mm:ss"
    $line = "[$timestamp] $Text`r`n"
    $script:OutputBox.SelectionStart = $script:OutputBox.TextLength
    $script:OutputBox.SelectionLength = 0
    $script:OutputBox.SelectionColor = $color
    $script:OutputBox.AppendText($line)
    # 自动滚动开关：OFF 时不滚屏，方便用户向上查看历史
    if ($script:AutoScroll) { $script:OutputBox.ScrollToCaret() }
    $script:OutputBox.SelectionColor = $C_FG
}

# ==============================================================================
# 辅助函数: Update-StatusBar
# ==============================================================================
function Update-StatusBar {
    if (-not $script:StatusBar) { return }
    $status = if ($script:BackendProcess -and -not $script:BackendProcess.HasExited) { "● 运行中" } else { "○ 已停止" }
    $pidText = if ($script:BackendProcess -and -not $script:BackendProcess.HasExited) { "PID: $($script:BackendProcess.Id)" } else { "PID: -" }
    $duration = "运行时长: -"
    if ($script:StartTime) {
        $diff = (Get-Date) - $script:StartTime
        $duration = "运行时长: $("{0:00}:{1:00}:{2:00}" -f $diff.Hours, $diff.Minutes, $diff.Seconds)"
    }
    $jobsCount = ($script:RunningJobs.GetEnumerator() | Where-Object { $_.Value -and -not $_.Value.HasExited } | Measure-Object).Count
    $script:StatusBar.Text = "  $status  |  $pidText  |  端口 3000  |  $duration  |  活跃任务: $jobsCount  |  当前页: $($script:CurrentTab)"
}

# ==============================================================================
# 辅助函数: Update-PublicUrlCard（刷新公网地址速览卡片 + 变化弹窗）
#   数据源：%TEMP%\euriskotax-last-cpolar-url.txt（ops-start-dev 和 watchdog 共享）
# ==============================================================================
function Update-PublicUrlCard {
    param([switch]$Force)
    if (-not $script:PublicUrlCardLabel) { return }

    # 节流：非强制调用时，3 秒内只执行 1 次（减少文件 I/O 和 UI 重绘）
    if (-not $Force) {
        $now = [DateTime]::Now
        if (($now - $script:LastUrlCardUpdateTime).TotalSeconds -lt $script:UrlCardUpdateMinIntervalSec) {
            return
        }
        $script:LastUrlCardUpdateTime = $now
    }

    $urlFile = Join-Path $env:TEMP "euriskotax-last-cpolar-url.txt"

    # ====== 数据源策略：文件优先（ops-start-dev / watchdog / outHandler 写入的权威值）======
    # 文件不存在时才 fallback 查 cpolar API（首次启动、文件还没生成的场景）。
    # 不用 API 优先是因为 cpolar 可能有多个隧道，API 返回的第一个不一定是实际共享的那个。
    $url = $null
    $urlSource = "file"
    $fileTs = $null

    if (Test-Path $urlFile) {
        try {
            $url = (Get-Content $urlFile -Raw -Encoding UTF8 -ErrorAction SilentlyContinue).Trim()
            $fileTs = (Get-Item $urlFile -ErrorAction SilentlyContinue).LastWriteTime
        } catch {
            # 文件可能被 cpolar 进程占用导致读取失败，下方有 API fallback 兜底
        }
    }

    # Fallback: 文件不存在或为空时查 cpolar API
    if ([string]::IsNullOrWhiteSpace($url)) {
        try {
            $resp = Invoke-WebRequest -Uri "http://127.0.0.1:4040/api/tunnels" -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
            if ($resp -and $resp.Content) {
                $j = $resp.Content | ConvertFrom-Json -ErrorAction Stop
                if ($j -and $j.tunnels -and $j.tunnels.Count -gt 0) {
                    foreach ($t in $j.tunnels) {
                        if ($t.public_url -match '^https://') { $url = $t.public_url; break }
                    }
                    if (-not $url) {
                        foreach ($t in $j.tunnels) {
                            if ($t.public_url -match '^http://') { $url = $t.public_url; break }
                        }
                    }
                    if ($url) {
                        $url = $url.TrimEnd('/')
                        $urlSource = "api"
                        try { Set-Content -Path $urlFile -Value $url -Encoding UTF8 -ErrorAction SilentlyContinue } catch {
                            # 缓存文件写入失败不影响功能，下次会重新从 API 获取
                        }
                    }
                }
            }
        } catch {
            # cpolar 未启动时 API 不可达，这是预期情况，不记录日志
        }
    }

    $tsText = if ($fileTs) { $fileTs.ToString("yyyy-MM-dd HH:mm:ss") } else { "-" }

    if ([string]::IsNullOrWhiteSpace($url)) {
        $script:PublicUrlCardLabel.Text = "（暂无公网地址）→ 点下方紫色或红色【启动+公网分享】按钮"
        $script:PublicUrlCardLabel.ForeColor = $C_FG_DIM
        if ($script:FontUrlCached -ne "empty") {
            $script:PublicUrlCardLabel.Font = $script:FontUrlEmpty
            $script:FontUrlCached = "empty"
        }
        $script:PublicUrlCardHint.Text = "  未检测到 cpolar 隧道。点【启动 + 分享 + 自动重启】后会自动刷新，地址生成后会自动复制并发送邮件。  |  共享文件：$urlFile  |  更新：$tsText"
        $script:PublicUrlCardLabel.Cursor = [System.Windows.Forms.Cursors]::Default
        $script:PublicUrlLastSeen = ""
    } else {
        $script:PublicUrlCardLabel.Text = "🌐  $url"
        $script:PublicUrlCardLabel.ForeColor = [System.Drawing.Color]::FromArgb(255, 185, 120)
        if ($script:FontUrlCached -ne "display") {
            $script:PublicUrlCardLabel.Font = $script:FontUrlDisplay
            $script:FontUrlCached = "display"
        }
        $script:PublicUrlCardLabel.Cursor = [System.Windows.Forms.Cursors]::Hand
        $script:PublicUrlCardHint.Text = "  ✅ 点击上面链接复制到剪贴板  |  打开 cpolar 仪表盘：http://127.0.0.1:4040/  |  地址来源：$urlSource  |  最近更新：$tsText"

        $isFirstTime = ([string]::IsNullOrWhiteSpace($script:PublicUrlLastSeen))
        $isChanged   = (-not $isFirstTime) -and ($script:PublicUrlLastSeen -ne $url)

        if ($isChanged) {
            $key = "URL_CHANGED::$url"
            if (Test-AllowPopup -Key $key) {
                try { Set-Clipboard -Value $url } catch { }
                $msg = "公网地址已更新！已自动复制到剪贴板：`n`n  新地址：$url`n  上次地址：$script:PublicUrlLastSeen`n`n如果开启了邮件通知，收件箱也会收到变更邮件。"
                [System.Windows.Forms.MessageBox]::Show($msg, "公网地址变更", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Information) | Out-Null
                $script:UrlPopupMode = "change"
            }
        } elseif ($isFirstTime) {
            try {
                $curr = Get-Clipboard -ErrorAction SilentlyContinue
                if ($curr -ne $url) { Set-Clipboard -Value $url -ErrorAction SilentlyContinue }
            } catch {
                # 剪贴板被其他进程占用时失败很常见，不影响主流程
            }
            if (-not $script:UrlPopupMode) { $script:UrlPopupMode = "first-known" }
        }
        $script:PublicUrlLastSeen = $url
    }
}

# ==============================================================================
# 辅助函数: Show-GuiAlert（GUI 顶部显眼事件提示）
# ==============================================================================
function Show-GuiAlert {
    param(
        [string]$Title,
        [string]$Message,
        [ValidateSet("Info","Warning","Error")]
        [string]$Kind = "Info"
    )
    $icon = switch ($Kind) {
        "Info"    { [System.Windows.Forms.MessageBoxIcon]::Information }
        "Warning" { [System.Windows.Forms.MessageBoxIcon]::Warning }
        "Error"   { [System.Windows.Forms.MessageBoxIcon]::Error }
    }
    [System.Windows.Forms.MessageBox]::Show($Message, $Title, [System.Windows.Forms.MessageBoxButtons]::OK, $icon) | Out-Null
}

# ==============================================================================
# 辅助函数: Show-InputBox（简单文本输入对话框，用于输入分支名等）
# ==============================================================================
function Show-InputBox {
    param(
        [string]$Title = "请输入",
        [string]$Prompt = "请输入内容：",
        [string]$DefaultValue = ""
    )
    $result = [Microsoft.VisualBasic.Interaction]::InputBox($Prompt, $Title, $DefaultValue)
    if ([string]::IsNullOrWhiteSpace($result)) { return $null }
    return $result.Trim()
}

# ==============================================================================
# 辅助函数: Get-GitBranches（获取当前仓库的本地/远程分支列表和当前分支）
# ==============================================================================
function Get-GitBranches {
    param([string]$RepoDir = $ProjectRoot)
    $result = @{
        CurrentBranch = ""
        LocalBranches = @()
        RemoteBranches = @()
        AllBranches = @()
        IsClean = $false
        DirtyFiles = @()
    }
    try {
        # 当前分支
        $cur = (& git -C $RepoDir rev-parse --abbrev-ref HEAD 2>$null)
        if ($LASTEXITCODE -eq 0) { $result.CurrentBranch = ($cur -join "").Trim() }

        # 本地分支（不含 HEAD -> 和远程）
        $locals = (& git -C $RepoDir for-each-ref --format='%(refname:short)' refs/heads/ 2>$null)
        if ($LASTEXITCODE -eq 0) {
            $result.LocalBranches = @($locals | ForEach-Object { $_.Trim() } | Where-Object { $_ })
        }

        # 远程分支（不含 origin/HEAD ->）
        $remotes = (& git -C $RepoDir for-each-ref --format='%(refname:short)' refs/remotes/ 2>$null)
        if ($LASTEXITCODE -eq 0) {
            $result.RemoteBranches = @($remotes | ForEach-Object { $_.Trim() } | Where-Object { $_ -and $_ -notmatch '/HEAD$' })
        }

        $result.AllBranches = @($result.LocalBranches) + @($result.RemoteBranches)

        # 工作区脏检查（仅文件名，不含详细diff）
        $dirty = (& git -C $RepoDir status --porcelain 2>$null)
        if ($LASTEXITCODE -eq 0) {
            $result.DirtyFiles = @($dirty | ForEach-Object { $_.Trim() } | Where-Object { $_ })
            $result.IsClean = ($result.DirtyFiles.Count -eq 0)
        }
    } catch {
        Write-Log "[Git] 获取分支信息失败：$($_.Exception.Message)" "ERROR"
    }
    return $result
}

# ==============================================================================
# 辅助函数: Show-BranchPicker（分支下拉选择对话框，替代手动输入）
# ==============================================================================
function Show-BranchPicker {
    param(
        [string]$Title = "选择分支",
        [string]$RepoDir = $ProjectRoot
    )
    $branches = Get-GitBranches -RepoDir $RepoDir
    if ($branches.AllBranches.Count -eq 0) {
        Show-GuiAlert -Title "未找到分支" -Message "当前仓库没有读取到任何分支信息，可能 Git 未初始化。" -Kind Warning
        return $null
    }

    $form = New-Object System.Windows.Forms.Form
    $form.Text = $Title
    $form.Size = New-Object System.Drawing.Size(520, 280)
    $form.StartPosition = "CenterScreen"
    $form.FormBorderStyle = "FixedDialog"
    $form.MaximizeBox = $false
    $form.MinimizeBox = $false
    $form.BackColor = [System.Drawing.Color]::FromArgb(28, 31, 42)
    $form.Font = New-Object System.Drawing.Font("Microsoft YaHei UI", 9)

    # 说明标签
    $lbl = New-Object System.Windows.Forms.Label
    $lbl.Text = "选择要切换到的分支（本地 + 远程共 $($branches.AllBranches.Count) 个）："
    $lbl.ForeColor = [System.Drawing.Color]::FromArgb(245, 245, 252)
    $lbl.AutoSize = $false
    $lbl.Location = New-Object System.Drawing.Point(20, 18)
    $lbl.Size = New-Object System.Drawing.Size(460, 28)
    $form.Controls.Add($lbl)

    # 当前分支显示
    $curLbl = New-Object System.Windows.Forms.Label
    $curLbl.Text = "当前分支：$($branches.CurrentBranch)"
    if ($branches.IsClean) {
        $curLbl.ForeColor = [System.Drawing.Color]::FromArgb(88, 196, 124)
        $curLbl.Text += " （工作区干净 ✅）"
    } else {
        $curLbl.ForeColor = [System.Drawing.Color]::FromArgb(235, 140, 85)
        $curLbl.Text += " （有 $($branches.DirtyFiles.Count) 个未提交改动 ⚠️）"
    }
    $curLbl.AutoSize = $false
    $curLbl.Location = New-Object System.Drawing.Point(20, 46)
    $curLbl.Size = New-Object System.Drawing.Size(460, 24)
    $form.Controls.Add($curLbl)

    # 下拉框
    $combo = New-Object System.Windows.Forms.ComboBox
    $combo.DropDownStyle = "DropDownList"
    $combo.Location = New-Object System.Drawing.Point(20, 78)
    $combo.Size = New-Object System.Drawing.Size(460, 32)
    $combo.BackColor = [System.Drawing.Color]::FromArgb(40, 44, 60)
    $combo.ForeColor = [System.Drawing.Color]::FromArgb(245, 245, 252)
    $combo.Font = New-Object System.Drawing.Font("Microsoft YaHei UI", 10)

    # 填充下拉项（本地分支在前，远程分支在后，当前分支选中）
    $idx = 0
    $selectIdx = -1
    foreach ($lb in $branches.LocalBranches) {
        $disp = if ($lb -eq $branches.CurrentBranch) { "⭐ $lb  （当前·本地）" } else { "$lb  （本地）" }
        [void]$combo.Items.Add(@{ Display = $disp; Value = $lb })
        if ($lb -eq $branches.CurrentBranch) { $selectIdx = $idx }
        $idx++
    }
    foreach ($rb in $branches.RemoteBranches) {
        $disp = "🌐 $rb  （远程）"
        [void]$combo.Items.Add(@{ Display = $disp; Value = $rb })
        $idx++
    }
    $combo.DisplayMember = "Display"
    $combo.ValueMember = "Value"
    if ($selectIdx -ge 0) { $combo.SelectedIndex = $selectIdx } elseif ($combo.Items.Count -gt 0) { $combo.SelectedIndex = 0 }
    $form.Controls.Add($combo)

    # 提示信息
    $hint = New-Object System.Windows.Forms.Label
    $hint.Text = "提示：切换远程分支会创建本地跟踪分支。有未提交改动可能切换失败。"
    $hint.ForeColor = [System.Drawing.Color]::FromArgb(150, 150, 170)
    $hint.AutoSize = $false
    $hint.Location = New-Object System.Drawing.Point(20, 122)
    $hint.Size = New-Object System.Drawing.Size(460, 36)
    $form.Controls.Add($hint)

    # OK / Cancel 按钮
    $btnW = 140; $btnH = 38
    $okBtn = New-Object System.Windows.Forms.Button
    $okBtn.Text = "✔ 确认切换"
    $okBtn.Location = New-Object System.Drawing.Point(190, 180)
    $okBtn.Size = New-Object System.Drawing.Size($btnW, $btnH)
    $okBtn.BackColor = [System.Drawing.Color]::FromArgb(85, 155, 95)
    $okBtn.ForeColor = [System.Drawing.Color]::FromArgb(245, 245, 252)
    $okBtn.FlatStyle = "Flat"
    $okBtn.Font = New-Object System.Drawing.Font("Microsoft YaHei UI", 10, [System.Drawing.FontStyle]::Bold)
    $okBtn.DialogResult = [System.Windows.Forms.DialogResult]::OK
    $form.AcceptButton = $okBtn
    $form.Controls.Add($okBtn)

    $cancelBtn = New-Object System.Windows.Forms.Button
    $cancelBtn.Text = "取消"
    $cancelBtn.Location = New-Object System.Drawing.Point(340, 180)
    $cancelBtn.Size = New-Object System.Drawing.Size($btnW, $btnH)
    $cancelBtn.BackColor = [System.Drawing.Color]::FromArgb(120, 120, 140)
    $cancelBtn.ForeColor = [System.Drawing.Color]::FromArgb(245, 245, 252)
    $cancelBtn.FlatStyle = "Flat"
    $cancelBtn.Font = New-Object System.Drawing.Font("Microsoft YaHei UI", 10)
    $cancelBtn.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
    $form.CancelButton = $cancelBtn
    $form.Controls.Add($cancelBtn)

    # 显示对话框
    $result = $form.ShowDialog()
    try {
        if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
            if ($combo.SelectedItem -and $combo.SelectedItem.Value) {
                return $combo.SelectedItem.Value
            }
        }
        return $null
    } finally {
        $form.Dispose()
    }
}

# ==============================================================================
# 辅助函数: Assert-WorkingTreeClean（切换分支前的脏检查防护）
# 检查工作区是否有未提交改动。有则弹窗让用户选：
#   A. 取消切换 → 返回 $false
#   B. 暂存改动(stash)后切换 → 返回 $true，并执行 stash
#   C. 强制尝试切换（可能失败，但绝不会丢代码）→ 返回 $true
# 工作区干净直接返回 $true
# ==============================================================================
function Assert-WorkingTreeClean {
    param(
        [string]$RepoDir = $ProjectRoot,
        [string]$TargetBranch = "目标分支"
    )
    $gitState = Get-GitBranches -RepoDir $RepoDir
    if ($gitState.IsClean) {
        return $true
    }

    $dirtyCount = $gitState.DirtyFiles.Count
    $dirtyPreview = if ($dirtyCount -le 8) {
        ($gitState.DirtyFiles -join "`n  ")
    } else {
        ($gitState.DirtyFiles[0..7] -join "`n  ") + "`n  ...共 $dirtyCount 个文件"
    }

    $msg = @"
⚠️ 检测到未提交的改动（$dirtyCount 个文件），直接切换分支可能失败！

Git 保护机制：
  • 有冲突的切换 → 直接报错失败，代码 100% 不会丢
  • 无冲突的切换 → 改动会自动带到新分支（非丢失）

当前改动文件：
  $dirtyPreview

请选择操作方式：

  [否] = 取消本次切换（推荐）→ 先 commit 你的改动再切换
  [是] = 自动暂存 (git stash) 后切换 → 切完可用 git stash pop 恢复
  [取消] = 强制尝试切换（可能报错失败）
"@
    $choice = [System.Windows.Forms.MessageBox]::Show($msg,
        "未提交改动 - 切换 '$TargetBranch'",
        "YesNoCancel",
        [System.Windows.Forms.MessageBoxIcon]::Warning)

    switch ($choice) {
        "No" {
            Write-Log "[Git] ✋ 用户取消分支切换（因有未提交改动）" "WARN"
            return $false
        }
        "Cancel" {
            Write-Log "[Git] ⚠️ 用户选择强制尝试切换（可能失败）" "WARN"
            return $true
        }
        "Yes" {
            Write-Log "[Git] 📦 自动 git stash 暂存 $dirtyCount 个改动文件..." "INFO"
            $stashMsg = "auto-stash-before-switch-to-$TargetBranch-$(Get-Date -Format 'yyyyMMddHHmmss')"
            $out = (& git -C $RepoDir stash push -m $stashMsg 2>&1)
            Write-Log ($out -join "`n") "GRAY"
            return $true
        }
    }
    return $false
}

# ==============================================================================
# 辅助函数: Update-BranchCardLabel（刷新分支卡片顶部的当前分支显示）
# ==============================================================================
function Update-BranchCardLabel {
    if (-not $script:BranchCardLabel) { return }
    $state = Get-GitBranches -RepoDir $ProjectRoot
    $cur = if ([string]::IsNullOrWhiteSpace($state.CurrentBranch)) { "（未检测到 Git 仓库）" } else { $state.CurrentBranch }

    # 根据分支类型决定颜色和附加提示
    if ($cur -eq "main") {
        $labelText = "🌿  当前分支：main  （⭐ 主分支 · 日常开发主线）"
        $bgColor = [System.Drawing.Color]::FromArgb(42, 78, 52)
        $fgColor = [System.Drawing.Color]::FromArgb(130, 230, 158)
        $borderColor = [System.Drawing.Color]::FromArgb(88, 196, 124)
    } elseif ($cur -like "archive/*") {
        $labelText = "📦  当前分支：$cur  （只读存档版本 · 看完记得切回 main）"
        $bgColor = [System.Drawing.Color]::FromArgb(60, 55, 42)
        $fgColor = [System.Drawing.Color]::FromArgb(245, 210, 140)
        $borderColor = [System.Drawing.Color]::FromArgb(235, 180, 85)
    } elseif ($cur -like "feature/*" -or $cur -like "fix/*" -or $cur -like "release/*" -or $cur -like "hotfix/*") {
        $labelText = "🛠  当前分支：$cur  （功能/修复分支 · 开发进行中）"
        $bgColor = [System.Drawing.Color]::FromArgb(55, 45, 75)
        $fgColor = [System.Drawing.Color]::FromArgb(195, 150, 240)
        $borderColor = [System.Drawing.Color]::FromArgb(175, 110, 220)
    } else {
        $labelText = "🔀  当前分支：$cur"
        $bgColor = [System.Drawing.Color]::FromArgb(42, 55, 78)
        $fgColor = [System.Drawing.Color]::FromArgb(130, 185, 250)
        $borderColor = [System.Drawing.Color]::FromArgb(80, 150, 240)
    }

    # 脏状态追加显示
    if ($state.IsClean) {
        $labelText += "  ·  干净 ✅"
    } else {
        $labelText += "  ·  有 $($state.DirtyFiles.Count) 个未提交改动 ⚠️"
    }

    $script:BranchCardLabel.Text = $labelText
    $script:BranchCardLabel.BackColor = $bgColor
    $script:BranchCardLabel.ForeColor = $fgColor
    if ($script:BranchCardLabel.Controls -and $script:BranchCardLabel.Controls.Count -gt 0) {
        # 边框已经是 BorderStyle，设置外部 Panel 边框色（如果有包装）
    }
}

# ==============================================================================
# 辅助函数: Copy-PublicUrlToClipboard（公网地址标签点击时触发）
# ==============================================================================
function Copy-PublicUrlToClipboard {
    $urlFile = Join-Path $env:TEMP "euriskotax-last-cpolar-url.txt"
    $url = $null
    if (Test-Path $urlFile) { $url = (Get-Content $urlFile -Raw -Encoding UTF8 -ErrorAction SilentlyContinue).Trim() }
    if ([string]::IsNullOrWhiteSpace($url)) {
        Show-GuiAlert -Title "暂无公网地址" -Message "当前没有检测到公网地址。请先点下方【启动 + 分享 + 自动重启】按钮，cpolar 建立隧道后这里会自动显示。" -Kind Warning
        return
    }
    try {
        Set-Clipboard -Value $url
        Show-GuiAlert -Title "✅ 已复制到剪贴板" -Message "公网地址已复制：`n`n  $url`n`n把这个链接粘贴发给朋友即可访问（配合 dev@example.com / password）。"
    } catch {
        Show-GuiAlert -Title "复制失败" -Message "剪贴板写入失败，请手动复制：$url" -Kind Error
    }
}

# ==============================================================================
# 辅助函数: Invoke-AsyncCommand (异步执行命令)
# ==============================================================================
function Invoke-AsyncCommand {
    param(
        [string]$Name,
        [string]$Command,
        [string]$WorkingDir,
        [string]$FileName = "powershell.exe",
        [switch]$IsBackend,
        [switch]$IsWatchdog
    )
    if ($script:RunningJobs.ContainsKey($Name) -and -not $script:RunningJobs[$Name].HasExited) {
        Write-Log "任务 '$Name' 已在运行中，请先停止。" "WARN"
        return
    }
    Write-Log "[CMD] $Command" "CMD"
    if ($WorkingDir) { Write-Log "  目录: $WorkingDir" "GRAY" }
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $FileName
    if ($FileName -eq "powershell.exe") {
        $psi.Arguments = "-NoProfile -ExecutionPolicy Bypass -Command `"$Command`""
    } else {
        $psi.Arguments = $Command
    }
    $psi.WorkingDirectory = if ($WorkingDir) { $WorkingDir } else { $ProjectRoot }
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true
    $psi.StandardOutputEncoding = [System.Text.Encoding]::UTF8
    $psi.StandardErrorEncoding = [System.Text.Encoding]::UTF8
    $proc = New-Object System.Diagnostics.Process
    $proc.StartInfo = $psi
    $outHandler = {
        if ($EventArgs.Data) {
            if (-not $script:OutputBox) { return }
            $line = [string]$EventArgs.Data

            # ===== 关键事件捕获：公网地址 / 邮件通知 → 触发 GUI 弹窗 + 自动刷新 =====
            # 【去重】每个事件 key 在 180s 内只允许弹 1 次（同 URL/同邮件状态不重复打扰用户）
            # 1) ops-start-dev / watchdog 输出： 公网分享地址: https://xxx.cpolar.cn
            if ($line -match '公网分享地址:\s*(https?://\S+)') {
                $url = $matches[1]
                # 写入共享文件（防止 ops-start-dev 异常导致没写）
                $uf = Join-Path $env:TEMP "euriskotax-last-cpolar-url.txt"
                try { Set-Content -Path $uf -Value $url -Encoding UTF8 -ErrorAction SilentlyContinue } catch { }
                try { Set-Clipboard -Value $url -ErrorAction SilentlyContinue } catch { }
                # 区分"首次生成"还是"变更" → 使用不同 key 分别去重
                $isFirst = [string]::IsNullOrWhiteSpace($script:PublicUrlLastSeen)
                $key = if ($isFirst) { "URL_FIRST::$url" } else { "URL_CHANGED::$url" }
                if (Test-AllowPopup -Key $key) {
                    if ($isFirst) {
                        $msg = "✅ cpolar 公网隧道建立成功！地址已复制到剪贴板：`n`n  $url`n`n👉 如果开启了邮件通知（notify.config.json 的 urlCreated=true），收件箱很快也会收到。`n👉 在下方【🌐 公网地址速览】卡片里也能看到地址，点击可再次复制。"
                        [System.Windows.Forms.MessageBox]::Show($msg, "公网地址已生成", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Information) | Out-Null
                        $script:UrlPopupMode = "first"
                    } else {
                        # outHandler 里也可能看门狗导致 URL 变化（会输出 GUI-EVENT），弹变更提示
                        $msg = "公网地址已更新！已自动复制到剪贴板：`n`n  新地址：$url`n  上次地址：$script:PublicUrlLastSeen`n`n如果开启了邮件通知，收件箱也会收到变更邮件。"
                        [System.Windows.Forms.MessageBox]::Show($msg, "公网地址变更", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Information) | Out-Null
                        $script:UrlPopupMode = "change"
                    }
                }
                # 无论弹不弹窗，都要更新 LastSeen，避免 Update-PublicUrlCard 再判成"变化"
                $script:PublicUrlLastSeen = $url
                # 收到 URL 事件 → 立即刷新卡片显示
                try { Update-PublicUrlCard -Force } catch { }
            }
            # 2) 输出： [OK] 公网地址邮件通知已发送给: xxx@qq.com
            if ($line -match '公网地址邮件通知已发送给') {
                # 去重 key = 固定的"邮件成功"（只要 180s 内发过，就别反复弹）
                $key = "EMAIL_OK::SENT"
                if (Test-AllowPopup -Key $key) {
                    [System.Windows.Forms.MessageBox]::Show(
                        "邮件已成功发送给配置的收件人！`n`n日志行：`n$line`n`n请叫朋友查收收件箱（如果没找到看一下垃圾箱）。",
                        "✅ 公网地址邮件已发送",
                        [System.Windows.Forms.MessageBoxButtons]::OK,
                        [System.Windows.Forms.MessageBoxIcon]::Information) | Out-Null
                }
            }
            # 3) 输出： 邮件未发送 或 发送失败
            if ($line -match '发送邮件通知失败|邮件未发送') {
                $key = "EMAIL_FAIL::NOT_SENT"
                if (Test-AllowPopup -Key $key) {
                    [System.Windows.Forms.MessageBox]::Show(
                        "邮件发送出现问题，没有发出。`n`n可能原因：`n  ① notify.config.json 中 enabled=false`n  ② QQ 邮箱授权码已过期或填错`n  ③ SMTP 服务器无法连接`n`n👉 排查方式：到【📧 通知日志】→ 邮件通知配置 → 查看通知日志 tools/ops/notify.log",
                        "⚠️ 邮件通知未发送",
                        [System.Windows.Forms.MessageBoxButtons]::OK,
                        [System.Windows.Forms.MessageBoxIcon]::Warning) | Out-Null
                }
            }
            # 4) 看门狗输出的地址变更事件也触发卡片刷新
            if ($line -match '公网分享地址变更:\s*\S+\s*->\s*(https?://\S+)') {
                $newUrl = $matches[1].Trim()
                $uf = Join-Path $env:TEMP "euriskotax-last-cpolar-url.txt"
                try { Set-Content -Path $uf -Value $newUrl -Encoding UTF8 -ErrorAction SilentlyContinue } catch { }
                try { Update-PublicUrlCard -Force } catch { }
            }
            # 5) ops-start-dev.ps1 内部用 Start-Process 启动看门狗后，会输出此事件把 PID 交回 GUI
            #    否则 GUI 的 $script:WatchdogProcess 永远是 null（体检显示「看门狗未启动」，停止按钮也无效）
            if ($line -match '\[WATCHDOG-STARTED\]\s*PID=(\d+)') {
                $wdPid = [int]$matches[1]
                try {
                    $wdProc = [System.Diagnostics.Process]::GetProcessById($wdPid)
                    if ($wdProc -and -not $wdProc.HasExited) {
                        # 只有在 GUI 本身没通过 -IsWatchdog 启动时才接管，避免覆盖已绑定
                        if (-not $script:RunningJobs.ContainsKey("watchdog")) {
                            $script:WatchdogProcess = $wdProc
                            # 同步登记到 RunningJobs（让 Stop-Job -Name watchdog / 体检 / 状态条 都能认出来）
                            $script:RunningJobs["watchdog"] = $wdProc
                            Write-Log "[OK] 看门狗已绑定 (外部启动, PID $wdPid)" "OK"
                            # 注册 Exited 事件，进程退出时同步清变量 + 更新状态栏
                            # 注意：Action scriptblock 无法直接闭包捕获 $wdPid，所以用 -MessageData 传入
                            Register-ObjectEvent -InputObject $wdProc -EventName "Exited" `
                                -MessageData $wdPid -Action {
                                    $pidIn = $Event.MessageData
                                    if ($script:WatchdogProcess -and $script:WatchdogProcess.Id -eq $pidIn) {
                                        $script:WatchdogProcess = $null
                                    }
                                    if ($script:RunningJobs.ContainsKey("watchdog") -and $script:RunningJobs["watchdog"].Id -eq $pidIn) {
                                        $script:RunningJobs.Remove("watchdog")
                                    }
                                    Write-Log "[END] 看门狗已退出 (外部 PID $pidIn)" "WARN"
                                    try { Update-StatusBar } catch { }
                                } | Out-Null
                            try { Update-StatusBar } catch { }
                        } else {
                            Write-Log "[INFO] 检测到看门狗启动(PID $wdPid)，但 GUI 已通过 RunningJobs.watchdog 自行启动，忽略外部绑定" "GRAY"
                        }
                    }
                } catch {
                    Write-Log "[WARN] 看门狗绑定失败 PID=$wdPid：可能进程已退出：$($_.Exception.Message)" "WARN"
                }
            }

            $script:OutputBox.SelectionStart = $script:OutputBox.TextLength
            $script:OutputBox.SelectionLength = 0
            $script:OutputBox.SelectionColor = $C_FG_MUTED
            $script:OutputBox.AppendText($line + "`r`n")
            # 自动滚动开关：OFF 时不滚屏
            if ($script:AutoScroll) { $script:OutputBox.ScrollToCaret() }

            # 输出区行数上限：超过 5000 行时裁剪旧内容，防止内存膨胀
            if ($script:OutputBox.TextLength -gt 300000) {
                $script:OutputBox.SelectionStart = 0
                $script:OutputBox.SelectionLength = ($script:OutputBox.TextLength - 200000)
                $script:OutputBox.SelectedText = ""
            }
        }
    }
    $errHandler = {
        if ($EventArgs.Data) {
            if (-not $script:OutputBox) { return }
            $script:OutputBox.SelectionStart = $script:OutputBox.TextLength
            $script:OutputBox.SelectionLength = 0
            $script:OutputBox.SelectionColor = [System.Drawing.Color]::Yellow
            $script:OutputBox.AppendText($EventArgs.Data + "`r`n")
            # 自动滚动开关：OFF 时不滚屏
            if ($script:AutoScroll) { $script:OutputBox.ScrollToCaret() }
        }
    }
    $exitedHandler = {
        $name = $Event.MessageData
        if ($script:RunningJobs.ContainsKey($name)) {
            $proc = $script:RunningJobs[$name]
            if ($proc) {
                Write-Log "[END] 任务 '$name' 已退出 (返回码: $($proc.ExitCode))" $(if ($proc.ExitCode -eq 0) { "OK" } else { "WARN" })
                if ($name -eq "backend") { $script:BackendProcess = $null; $script:StartTime = $null }
                if ($name -eq "watchdog") { $script:WatchdogProcess = $null }
                $script:RunningJobs.Remove($name)
                Update-StatusBar
            }
        }
    }
    Register-ObjectEvent -InputObject $proc -EventName "OutputDataReceived" -Action $outHandler | Out-Null
    Register-ObjectEvent -InputObject $proc -EventName "ErrorDataReceived" -Action $errHandler | Out-Null
    Register-ObjectEvent -InputObject $proc -EventName "Exited" -Action $exitedHandler -MessageData $Name | Out-Null
    try {
        [void]$proc.Start()
        $proc.BeginOutputReadLine()
        $proc.BeginErrorReadLine()
        $script:RunningJobs[$Name] = $proc
        if ($IsBackend) {
            $script:BackendProcess = $proc
            $script:StartTime = Get-Date
            Write-Log "[OK] 后端已启动 (PID $($proc.Id))" "OK"
        }
        if ($IsWatchdog) {
            $script:WatchdogProcess = $proc
            Write-Log "[OK] 看门狗已启动 (PID $($proc.Id))" "OK"
        }
        Update-StatusBar
    } catch {
        Write-Log "[FAIL] 启动失败: $_" "ERROR"
    }
}

# ==============================================================================
# 辅助函数: Stop-Job / Stop-AllJobs / Free-Port
# ==============================================================================
function Stop-Job {
    param([string]$Name)
    $killed = $false
    # 标准路径：RunningJobs 中登记过的进程（含 Invoke-AsyncCommand 启动 / 外部看门狗绑定登记）
    if ($script:RunningJobs.ContainsKey($Name)) {
        $proc = $script:RunningJobs[$Name]
        if ($proc -and -not $proc.HasExited) {
            try {
                taskkill /PID $proc.Id /T /F 2>&1 | Out-Null
                Write-Log "[STOP] 已停止 '$Name' (PID: $($proc.Id))" "WARN"
                $killed = $true
            } catch { Write-Log "停止失败: $_" "ERROR" }
        }
        $script:RunningJobs.Remove($Name)
    }
    # Fallback：RunningJobs 没有，但脚本级变量仍挂着 Process 对象（比如启动途中的半绑定状态）
    # 额外尝试通过 $script:WatchdogProcess / BackendProcess 杀一次，避免遗留孤儿
    $fallbackProc = $null
    if ($Name -eq "watchdog" -and $script:WatchdogProcess -and -not $script:WatchdogProcess.HasExited) {
        $fallbackProc = $script:WatchdogProcess
    }
    if ($Name -eq "backend" -and $script:BackendProcess -and -not $script:BackendProcess.HasExited) {
        $fallbackProc = $script:BackendProcess
    }
    if ($fallbackProc) {
        try {
            taskkill /PID $fallbackProc.Id /T /F 2>&1 | Out-Null
            Write-Log "[STOP] fallback 停止 '$Name' (PID: $($fallbackProc.Id))" "WARN"
            $killed = $true
        } catch { Write-Log "fallback 停止失败: $_" "ERROR" }
    }
    if ($Name -eq "backend")  { $script:BackendProcess = $null; $script:StartTime = $null }
    if ($Name -eq "watchdog") { $script:WatchdogProcess = $null }
    if (-not $killed) { Write-Log "任务 '$Name' 未在运行" "GRAY" }
    Update-StatusBar
}
function Stop-AllJobs {
    $names = @($script:RunningJobs.Keys)
    foreach ($n in $names) { Stop-Job -Name $n }
}
function Free-Port {
    param([int]$Port = 3000)
    $procs = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
    if (-not $procs) { Write-Log "端口 $Port 已空闲" "OK"; return }
    foreach ($p in $procs) {
        try {
            $pi = Get-Process -Id $p -ErrorAction Stop
            Write-Log "正在杀死 PID=$p [$($pi.ProcessName)] (占用端口 $Port)" "WARN"
            Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
        } catch { Write-Log "无法杀死 PID=$p : $_" "ERROR" }
    }
    Start-Sleep -Milliseconds 400
    Write-Log "端口 $Port 已释放" "OK"
}

# ==============================================================================
# 辅助函数: Switch-Tab (切换标签页并触发布局)
# ==============================================================================
function Switch-Tab {
    param([string]$TabName)
    Write-Log "[导航切换] → $TabName" "INFO"
    foreach ($p in $script:TabPanels.Values) { $p.Visible = $false }
    if ($script:TabPanels.ContainsKey($TabName)) {
        $script:TabPanels[$TabName].Visible = $true
        $script:CurrentTab = $TabName
        if ($script:TabCtxMap.ContainsKey($TabName)) {
            $ctx = $script:TabCtxMap[$TabName]
            $ctx.Panel.Refresh()
            Reflow-TabCards -Ctx $ctx
        }
        Update-StatusBar
    }
}

# ==============================================================================
# 创建主窗体 (更宽敞: 1560x980)
# ==============================================================================
$form = New-Object System.Windows.Forms.Form
$form.Text = "EuriskoTax 开发控制台 v3.4 - 统一启动中心"
$form.Size = New-Object System.Drawing.Size(1560, 980)
$form.MinimumSize = New-Object System.Drawing.Size(1200, 800)
$form.StartPosition = "CenterScreen"
$form.BackColor = $C_BG_FORM
$form.ForeColor = $C_FG
$form.Font = $F_SUBTITLE

# 设置窗体图标（使用项目 logo）
# 注意：New-Object Icon(icoPath) 会由系统自动挑帧，但 PS/.NET 常选错尺寸导致显示偏小。
# 这里显式按「标题栏 SMALL 32」「任务栏 LARGE 48」两档构造，确保最大化填充。
$logoIcoPath = Join-Path $ScriptDir "..\..\images\logo.ico"
if (Test-Path $logoIcoPath) {
    try {
        # 优先从 .ico 中选 32x32 帧（标题栏 / 任务栏 100% DPI 最常用尺寸），没有就退化到默认
        try {
            $icon32 = New-Object System.Drawing.Icon($logoIcoPath, 32, 32)
            if ($icon32) { $form.Icon = $icon32 }
            else         { $form.Icon = New-Object System.Drawing.Icon($logoIcoPath) }
        } catch {
            $form.Icon = New-Object System.Drawing.Icon($logoIcoPath)
        }
    } catch {
        # .ico 文件损坏或格式不支持时使用默认图标，不影响启动
    }
}

# 全局布局参数（硬编码坐标，彻底解决Dock遮挡问题）
$H_HEADER = 56
$H_STATUS = 30
$W_LEFT   = 240

# ==============================================================================
# 顶部标题栏 (v3.4 高度 56 + 底部分隔线 + 版本标签)
# ==============================================================================
$headerPanel = New-Object System.Windows.Forms.Panel
$headerPanel.Dock = "None"
$headerPanel.BackColor = $C_BG_L2

$titleLabel = New-Object System.Windows.Forms.Label
$titleLabel.Text = "  EuriskoTax  统一启动中心"
$titleLabel.Font = $F_TITLE
$titleLabel.ForeColor = $C_FG
$titleLabel.Dock = "Fill"
$titleLabel.TextAlign = "MiddleLeft"
$headerPanel.Controls.Add($titleLabel)

$subtitleLabel = New-Object System.Windows.Forms.Label
$subtitleLabel.Text = "本地运维控制台 · 无需 AI 积分 · 所有操作一键完成 · 鼠标悬停按钮查看详情"
$subtitleLabel.Font = $F_SUBTITLE
# 副标题颜色更柔和 (130, 170, 230)
$subtitleLabel.ForeColor = [System.Drawing.Color]::FromArgb(130, 170, 230)
$subtitleLabel.AutoSize = $true
$subtitleLabel.Location = New-Object System.Drawing.Point(380, 19)
$headerPanel.Controls.Add($subtitleLabel)

# 右侧版本标签 (小号字体，灰色)
$versionLabel = New-Object System.Windows.Forms.Label
$versionLabel.Text = "v3.4"
$versionLabel.Font = New-Object System.Drawing.Font("Microsoft YaHei UI", 9)
$versionLabel.ForeColor = $C_FG_DIM
$versionLabel.AutoSize = $true
$versionLabel.Location = New-Object System.Drawing.Point(1490, 19)
$headerPanel.Controls.Add($versionLabel)

# 底部 2px 分隔线
$headerSep = New-Object System.Windows.Forms.Panel
$headerSep.Dock = "Bottom"
$headerSep.Height = 2
$headerSep.BackColor = $C_BORDER
$headerPanel.Controls.Add($headerSep)

$form.Controls.Add($headerPanel)

# ==============================================================================
# 底部状态栏
# ==============================================================================
$statusBarPanel = New-Object System.Windows.Forms.Panel
$statusBarPanel.Dock = "None"
$statusBarPanel.BackColor = $C_BG_L2
$statusLabel = New-Object System.Windows.Forms.Label
$statusLabel.Text = "  ○ 已停止  |  PID: -  |  端口 3000  |  运行时长: -  |  活跃任务: 0  |  当前页: 启动管理"
$statusLabel.ForeColor = $C_FG_MUTED
$statusLabel.Dock = "Fill"
$statusLabel.TextAlign = "MiddleLeft"
$statusLabel.Font = $F_STATUS
$statusBarPanel.Controls.Add($statusLabel)
$script:StatusBar = $statusLabel
$form.Controls.Add($statusBarPanel)

# ==============================================================================
# 主分栏: 左侧导航 240px + 右侧内容
# ==============================================================================
$mainSplit = New-Object System.Windows.Forms.SplitContainer
$mainSplit.Dock = "None"
$mainSplit.FixedPanel = "Panel1"
$mainSplit.SplitterDistance = $W_LEFT
$mainSplit.SplitterWidth = 1
$mainSplit.BackColor = $C_BG_L1
$mainSplit.SplitterDistance = 236

# ==============================================================================
# 左侧导航栏 (更宽)
# ==============================================================================
$leftPanel = New-Object System.Windows.Forms.Panel
$leftPanel.Dock = "Fill"
$leftPanel.BackColor = $C_BG_L1

$menuButtons = @()
$tabs = @(
    @{ Name = "启动管理"; Icon = "🚀"; Desc = "启动/停止后端 · 端口管理 · 快速访问 · 健康检查";   Color = $C_SUCCESS },
    @{ Name = "数据库";   Icon = "💾"; Desc = "迁移 · 生成 · 重置账号 · 可视化管理 (6个功能)";     Color = $C_ACCENT   },
    @{ Name = "测试中心"; Icon = "🧪"; Desc = "单元测试 · 覆盖率 · 性能基准 (9个功能)";           Color = $C_PURPLE   },
    @{ Name = "运维监控"; Icon = "🛠"; Desc = "看门狗守护 · cpolar 内网穿透 (6个功能)";           Color = $C_WARN     },
    @{ Name = "通知日志"; Icon = "📧"; Desc = "邮件通知配置 · 日志查看 (12个功能)";               Color = $C_CYAN     },
    @{ Name = "部署";     Icon = "📦"; Desc = "远程部署 · 回滚 · 服务器初始化 (11个功能)";        Color = $C_ACCENT   },
    @{ Name = "快捷入口"; Icon = "📂"; Desc = "目录 · 终端 · 浏览器 · 文档 (16个功能)";           Color = $C_GRAY     },
    @{ Name = "Git & 账号"; Icon = "🔐"; Desc = "Git 操作 · 账号密码管理 (18个功能)";              Color = $C_PURPLE   }
)

$yPos = 18
$script:navAccentBars = @{}
foreach ($tab in $tabs) {
    $tabName = $tab.Name
    # 文字稍微左移 (1 个前导空格) + 图标和文字间距加大 (4 个空格)
    $btn = New-Object System.Windows.Forms.Button
    $btn.Text = " $($tab.Icon)    $($tab.Name)"
    $btn.Font = $F_MENU
    $btn.Size = New-Object System.Drawing.Size(212, 44)
    $btn.Location = New-Object System.Drawing.Point(10, $yPos)
    $btn.FlatStyle = "Flat"
    $btn.FlatAppearance.BorderSize = 1
    $btn.FlatAppearance.BorderColor = $C_BORDER
    # 未选中悬停背景色 (新配色 40,44,60)
    $btn.FlatAppearance.MouseOverBackColor = $C_BG_L3
    $btn.BackColor = $C_BG_L2
    $btn.ForeColor = $C_FG
    $btn.TextAlign = "MiddleLeft"
    $btn.Padding = New-Object System.Windows.Forms.Padding(8, 0, 0, 0)
    $btn.Cursor = "Hand"
    $btn.Tag = $tabName
    $btn.UseVisualStyleBackColor = $false
    $tip = New-Object System.Windows.Forms.ToolTip
    $tip.AutoPopDelay = 10000
    $tip.SetToolTip($btn, $tab.Desc)

    # 左侧 3px 彩色指示条 (始终可见，选中时变色为 $C_ACCENT，未选中为 $C_BORDER)
    $bar = New-Object System.Windows.Forms.Panel
    $bar.Size = New-Object System.Drawing.Size(3, 44)
    $bar.Location = New-Object System.Drawing.Point(10, $yPos)
    $bar.BackColor = $C_BORDER
    $bar.Visible = $true
    $bar.BringToFront()
    $script:navAccentBars[$tabName] = $bar

    $btn.Add_Click({
        param($s, $e)
        foreach ($b in $menuButtons) {
            if ($b.Tag -eq $tabName) {
                # 选中状态：使用导航选中背景色 + 加粗字体
                $b.BackColor = $C_BG_NAV_SEL
                $b.ForeColor = $C_FG
                $b.Font = $F_MENU_SEL
                $b.FlatAppearance.BorderColor = $C_ACCENT
                $b.FlatAppearance.BorderSize = 1
            } else {
                $b.BackColor = $C_BG_L2
                $b.ForeColor = $C_FG
                $b.Font = $F_MENU
                $b.FlatAppearance.BorderColor = $C_BORDER
                $b.FlatAppearance.BorderSize = 1
            }
        }
        # 左侧指示条：始终可见，选中时变为 $C_ACCENT，未选中变回 $C_BORDER
        foreach ($n in $script:navAccentBars.Keys) {
            $barCtrl = $script:navAccentBars[$n]
            if ($n -eq $tabName) {
                $barCtrl.BackColor = $C_ACCENT
                $barCtrl.BringToFront()
            } else {
                $barCtrl.BackColor = $C_BORDER
            }
        }
        Switch-Tab -TabName $tabName
    }.GetNewClosure())
    $menuButtons += $btn
    $leftPanel.Controls.Add($bar)
    $leftPanel.Controls.Add($btn)
    $yPos += 48
}

# 分隔线
$sep = New-Object System.Windows.Forms.Label
$sep.Text = "─────────────────────"
$sep.AutoSize = $true
$sep.Location = New-Object System.Drawing.Point(10, ($yPos + 4))
$sep.ForeColor = $C_FG_DIM
$leftPanel.Controls.Add($sep)
$yPos += 24

# 项目信息
$infoLabels = @(
    @{ Text = "  项目信息";          Font = $F_SUBTITLE; Color = $C_FG_DIM },
    @{ Text = "  EuriskoTax v1.1.0"; Font = (New-Object System.Drawing.Font("Microsoft YaHei UI", 9, [System.Drawing.FontStyle]::Bold)); Color = $C_FG_MUTED }
)
foreach ($info in $infoLabels) {
    $lbl = New-Object System.Windows.Forms.Label
    $lbl.Text = $info.Text
    $lbl.Font = $info.Font
    $lbl.AutoSize = $true
    $lbl.Location = New-Object System.Drawing.Point(10, $yPos)
    $lbl.ForeColor = $info.Color
    $leftPanel.Controls.Add($lbl)
    $yPos += 18
}
$rootShort = if ($ProjectRoot.Length -gt 28) { "..." + $ProjectRoot.Substring($ProjectRoot.Length - 26) } else { $ProjectRoot }
$rootLbl = New-Object System.Windows.Forms.Label
$rootLbl.Text = "  $rootShort"
$rootLbl.Font = New-Object System.Drawing.Font("Microsoft YaHei UI", 8.25)
$rootLbl.AutoSize = $true
$rootLbl.Location = New-Object System.Drawing.Point(10, $yPos)
$rootLbl.ForeColor = $C_FG_MUTED
$leftPanel.Controls.Add($rootLbl)
$yPos += 28

# 紧急停止按钮
$stopAllBtn = New-Object System.Windows.Forms.Button
$stopAllBtn.Text = "⛔ 紧急停止所有任务"
$stopAllBtn.Font = New-Object System.Drawing.Font("Microsoft YaHei UI", 9.5, [System.Drawing.FontStyle]::Bold)
$stopAllBtn.Size = New-Object System.Drawing.Size(212, 42)
$stopAllBtn.Location = New-Object System.Drawing.Point(10, $yPos)
$stopAllBtn.FlatStyle = "Flat"
$stopAllBtn.FlatAppearance.BorderSize = 0
$stopAllBtn.BackColor = $C_DANGER
$stopAllBtn.ForeColor = $C_FG
$stopAllBtn.Cursor = "Hand"
$stopAllTip = New-Object System.Windows.Forms.ToolTip
$stopAllTip.SetToolTip($stopAllBtn, "一键停止所有运行中的任务并释放3000端口")
$stopAllBtn.Add_Click({
    $result = [System.Windows.Forms.MessageBox]::Show("确定停止所有运行中的任务并释放 3000 端口？", "确认操作", "YesNo", "Warning")
    if ($result -eq "Yes") {
        Stop-AllJobs
        Free-Port -Port 3000
        Write-Log "[STOP-ALL] 所有任务已停止，端口 3000 已释放。" "WARN"
    }
})
$leftPanel.Controls.Add($stopAllBtn)

$mainSplit.Panel1.Controls.Add($leftPanel)

# ==============================================================================
# 右侧: 上方操作区 + 下方输出区
# ==============================================================================
$rightPanel = New-Object System.Windows.Forms.Panel
$rightPanel.Dock = "Fill"
$rightPanel.BackColor = $C_BG_FORM

# ========== 操作区 / 输出区分栏 ==========
$rightSplit = New-Object System.Windows.Forms.SplitContainer
$rightSplit.Dock = "Fill"
$rightSplit.Orientation = "Horizontal"
$rightSplit.FixedPanel = "Panel2"
$rightSplit.SplitterDistance = 570
$rightSplit.SplitterWidth = 4
$rightSplit.BackColor = $C_BG_FORM
$rightPanel.Controls.Add($rightSplit)

$mainSplit.Panel2.Controls.Add($rightPanel)

# 关键修复：一次性 Add 所有顶级控件，之后用绝对坐标布局，彻底杜绝Dock重叠
$form.Controls.Add($mainSplit)

# ============== 绝对坐标布局函数（核心修复，彻底解决Dock遮挡） ==============
function Invoke-FormLayout {
    $cw = $form.ClientSize.Width
    $ch = $form.ClientSize.Height
    if ($cw -lt 1200) { $cw = 1200 }
    if ($ch -lt 800) { $ch = 800 }

    # 顶部标题栏 (Y=0 固定)
    $headerPanel.Bounds = New-Object System.Drawing.Rectangle(0, 0, $cw, $H_HEADER)

    # 底部状态栏 (Y=客户区-状态栏高度)
    $statusBarPanel.Bounds = New-Object System.Drawing.Rectangle(0, ($ch - $H_STATUS), $cw, $H_STATUS)

    # 主分栏 (夹在 header 和 status 之间)
    $mainY = $H_HEADER
    $mainH = $ch - $H_HEADER - $H_STATUS
    $mainSplit.Bounds = New-Object System.Drawing.Rectangle(0, $mainY, $cw, $mainH)
    $mainSplit.SplitterDistance = $W_LEFT

    # 操作区/输出区分栏自适应高度
    $rightPanelW = $mainSplit.Panel2.ClientSize.Width
    $rightPanelH = $mainSplit.Panel2.ClientSize.Height
    if ($rightPanelW -lt 800) { $rightPanelW = 800 }
    $rightSplit.Bounds = New-Object System.Drawing.Rectangle(0, 0, $rightPanelW, $rightPanelH)
    $workH = $rightPanelH
    $rightSplit.SplitterDistance = [Math]::Max(280, ($workH - 280))
}

# 初始化立即执行一次布局
Invoke-FormLayout
# 窗口大小改变时重新布局
$form.Add_Resize({ Invoke-FormLayout })

# ==============================================================================
# 辅助函数: New-TabPanel
# ==============================================================================
function New-TabPanel {
    param(
        [string]$HeaderText,
        [string]$HeaderTagline = "",
        [string]$HeaderDesc = ""
    )
    $panel = New-Object System.Windows.Forms.Panel
    $panel.Dock = "Fill"
    $panel.BackColor = $C_BG_FORM

    $head = New-Object System.Windows.Forms.Panel
    $head.Dock = "Top"
    $head.Height = 88
    $head.BackColor = $C_BG_L1

    $headLbl = New-Object System.Windows.Forms.Label
    $headLbl.Text = $HeaderText
    $headLbl.Font = $F_TAB_HEAD
    $headLbl.ForeColor = $C_FG
    $headLbl.Location = New-Object System.Drawing.Point($PADDING, 8)
    $headLbl.AutoSize = $true
    $head.Controls.Add($headLbl)

    if ($HeaderTagline) {
        $tag = New-Object System.Windows.Forms.Label
        $tag.Text = $HeaderTagline
        $tag.Font = $F_TAB_DESC
        $tag.ForeColor = [System.Drawing.Color]::FromArgb(145, 195, 255)
        $tag.AutoSize = $true
        $tag.Location = New-Object System.Drawing.Point($PADDING, 38)
        $head.Controls.Add($tag)
    }

    if ($HeaderDesc) {
        $desc = New-Object System.Windows.Forms.Label
        $desc.Text = $HeaderDesc
        $desc.Font = New-Object System.Drawing.Font("Microsoft YaHei UI", 9)
        $desc.ForeColor = $C_FG_DIM
        $desc.AutoSize = $true
        $desc.Location = New-Object System.Drawing.Point($PADDING, 60)
        $head.Controls.Add($desc)
    }

    # 底部分隔线
    $headSep = New-Object System.Windows.Forms.Panel
    $headSep.Dock = "Bottom"
    $headSep.Height = 2
    $headSep.BackColor = $C_BORDER
    $head.Controls.Add($headSep)

    $panel.Controls.Add($head)

    $scroll = New-Object System.Windows.Forms.Panel
    $scroll.Dock = "Fill"
    $scroll.BackColor = $C_BG_FORM
    $scroll.AutoScroll = $true
    $panel.Controls.Add($scroll)

    $panel.Controls.SetChildIndex($scroll, 0)
    $panel.Controls.SetChildIndex($head, 1)

    $ctx = @{ Panel = $panel; Scroll = $scroll; Cards = @(); Header = $head }
    $ctxRef = $ctx
    $scroll.Add_ClientSizeChanged({
        Reflow-TabCards -Ctx $ctxRef
    }.GetNewClosure())

    # 为滚动面板添加覆盖式滚动条（$scroll 已加入 $panel.Controls，Parent 已就绪）
    # 注意：必须用 $null = 抑制返回值，否则 overlay 对象会污染 New-TabPanel 的返回值
    $null = New-ScrollbarOverlay -Target $scroll -IsRichTextBox $false

    return $ctx
}

# ==============================================================================
# 辅助函数: Add-SectionCard (支持详细描述)
# ==============================================================================
function Add-SectionCard {
    param(
        $TabCtx,
        [string]$Title,
        [string]$Subtitle = "",
        [string]$Description = "",
        [System.Drawing.Color]$AccentColor = $C_ACCENT,
        [int]$ButtonsPerRow = 0,
        [hashtable[]]$Buttons,
        [switch]$IsGuide,
        [switch]$IsBranchCard
    )
    $cardInfo = @{
        Title          = $Title
        Subtitle       = $Subtitle
        Description    = $Description
        AccentColor    = $AccentColor
        ButtonsPerRow  = $ButtonsPerRow
        Buttons        = $Buttons
        Card           = $null
        Controls       = @{}
        IsGuide        = [bool]$IsGuide
        IsBranchCard   = [bool]$IsBranchCard
    }
    $TabCtx.Cards += $cardInfo
}

# ==============================================================================
# 辅助函数: Reflow-TabCards (v3.2 布局)
# ==============================================================================
function Reflow-TabCards {
    param($Ctx)
    if (-not $Ctx -or -not $Ctx.Scroll) { return }

    $scroll = $Ctx.Scroll
    $clientW = $scroll.ClientSize.Width
    if ($clientW -le 0) {
        if ($scroll.Parent) { $clientW = $scroll.Parent.ClientSize.Width }
        if ($clientW -le 0) { $clientW = 900 }
    }
    $availW = $clientW - (2 * $PADDING)
    if ($availW -lt 240) { $availW = 240 }

    # 预估高度，判断是否需要滚动条
    $estTotalH = $PADDING
    foreach ($ci in $Ctx.Cards) {
        $btns = $ci.Buttons
        $bw = if ($btns[0].Width) { $btns[0].Width } else { $BTN_W }
        $innerW = $availW - (2 * $CARD_PAD)
        $mpr = if ($ci.ButtonsPerRow -gt 0) { $ci.ButtonsPerRow } else {
            [Math]::Max(1, [Math]::Floor(($innerW + $BTN_GAP) / ($bw + $BTN_GAP)))
        }
        $mpr = [Math]::Min($mpr, $btns.Count)
        $rows = [Math]::Ceiling($btns.Count / $mpr)
        $subH = if ($ci.Subtitle) { $CARD_SUB_H } else { 0 }
        $descH = if ($ci.Description) { $CARD_DESC_H } else { 0 }
        if ($ci.IsGuide) {
            # 指引卡片高度按行数估算
            $estTotalH += $CARD_PAD + 40 + ($btns.Count * 32) + $CARD_PAD + $CARD_GAP_V
        } else {
            $estTotalH += $CARD_PAD + $CARD_TITLE_H + $subH + $descH + 8 + ($rows * ($BTN_H + $BTN_GAP)) + $CARD_GAP_V
        }
    }
    if ($estTotalH -gt $scroll.ClientSize.Height) {
        $availW -= $SCROLL_W
        if ($availW -lt 240) { $availW = 240 }
    }

    $y = $PADDING

    foreach ($cardInfo in $Ctx.Cards) {
        $buttons = $cardInfo.Buttons
        $gap = $BTN_GAP
        $cpad = $CARD_PAD
        $titleH = $CARD_TITLE_H
        $subH = if ($cardInfo.Subtitle) { $CARD_SUB_H } else { 0 }
        $descH = if ($cardInfo.Description) { $CARD_DESC_H } else { 0 }

        # 指引卡片特殊处理
        if ($cardInfo.IsGuide) {
            $guideH = $cpad + 40 + ($buttons.Count * 32) + $cpad
            if (-not $cardInfo.Card) {
                $card = New-Object System.Windows.Forms.Panel
                $card.BackColor = $C_BG_GUIDE
                $card.BorderStyle = "FixedSingle"   # 1px 边框
                $cardInfo.Controls['Card'] = $card
                # 顶部色条 (3px 高，宽度=卡片宽度)
                $accent = New-Object System.Windows.Forms.Panel
                $accent.BackColor = $cardInfo.AccentColor
                $card.Controls.Add($accent)
                $cardInfo.Controls['Accent'] = $accent
                # 标题
                $tLbl = New-Object System.Windows.Forms.Label
                $tLbl.Text = $cardInfo.Title
                $tLbl.Font = $F_GUIDE_HEAD
                $tLbl.ForeColor = $C_GUIDE_ACCENT
                $tLbl.AutoSize = $true
                $card.Controls.Add($tLbl)
                $cardInfo.Controls['Title'] = $tLbl
                # 指引项
                for ($i = 0; $i -lt $buttons.Count; $i++) {
                    $b = $buttons[$i]
                    $gLbl = New-Object System.Windows.Forms.Label
                    $gLbl.Text = $b.Text
                    $gLbl.Font = $F_GUIDE_ITEM
                    $gLbl.ForeColor = if ($b.Color -eq "guide") { $C_GUIDE_ACCENT } else { $C_FG }
                    $gLbl.AutoSize = $true
                    $card.Controls.Add($gLbl)
                    $cardInfo.Controls["Guide$i"] = $gLbl
                }
                $cardInfo.Card = $card
                $scroll.Controls.Add($card)
            }
            $cardInfo.Card.Location = New-Object System.Drawing.Point($PADDING, $y)
            $cardInfo.Card.Size = New-Object System.Drawing.Size($availW, $guideH)
            # 顶部色条：宽=卡片宽，高=3px
            $cardInfo.Controls['Accent'].Location = New-Object System.Drawing.Point(0, 0)
            $cardInfo.Controls['Accent'].Size = New-Object System.Drawing.Size($cardInfo.Card.Width, 3)
            $cardInfo.Controls['Accent'].BringToFront()
            $cardInfo.Controls['Title'].Location = New-Object System.Drawing.Point(($cpad + 6), $cpad)
            for ($i = 0; $i -lt $buttons.Count; $i++) {
                $cardInfo.Controls["Guide$i"].Location = New-Object System.Drawing.Point(($cpad + 6), ($cpad + 36 + $i * 32))
            }
            $y += $guideH + $CARD_GAP_V
            continue
        }

        # 普通卡片按钮宽度
        $bw = if ($buttons[0].Width) { $buttons[0].Width } else { $BTN_W }
        $innerW = $availW - (2 * $cpad)
        $maxPerRow = if ($cardInfo.ButtonsPerRow -gt 0) { $cardInfo.ButtonsPerRow } else {
            [Math]::Max(1, [Math]::Floor(($innerW + $gap) / ($bw + $gap)))
        }
        $maxPerRow = [Math]::Min($maxPerRow, $buttons.Count)
        $topOffset = $cpad + $titleH + $subH + $descH + 8
        $rows = [Math]::Ceiling($buttons.Count / $maxPerRow)
        $cardH = $topOffset + ($rows * $BTN_H) + ([Math]::Max(0, $rows - 1) * $gap) + $cpad

        if (-not $cardInfo.Card) {
            $card = New-Object System.Windows.Forms.Panel
            $card.BackColor = $C_BG_L2
            $card.BorderStyle = "FixedSingle"   # 1px 边框，增加层次感
            $accent = New-Object System.Windows.Forms.Panel
            $accent.BackColor = $cardInfo.AccentColor
            $card.Controls.Add($accent)
            $cardInfo.Controls['Accent'] = $accent
            $tLbl = New-Object System.Windows.Forms.Label
            $tLbl.Text = $cardInfo.Title
            $tLbl.Font = $F_CARD_HEAD
            $tLbl.ForeColor = $C_FG
            $tLbl.AutoSize = $true
            $card.Controls.Add($tLbl)
            $cardInfo.Controls['Title'] = $tLbl
            if ($cardInfo.Subtitle) {
                $sLbl = New-Object System.Windows.Forms.Label
                $sLbl.Text = $cardInfo.Subtitle
                $sLbl.Font = $F_CARD_SUB
                $sLbl.ForeColor = $C_ACCENT_HOT
                $sLbl.AutoSize = $true
                $card.Controls.Add($sLbl)
                $cardInfo.Controls['Subtitle'] = $sLbl
            }
            if ($cardInfo.Description) {
                $dLbl = New-Object System.Windows.Forms.Label
                $dLbl.Text = $cardInfo.Description
                $dLbl.Font = $F_CARD_DESC
                $dLbl.ForeColor = $C_FG_DIM
                $dLbl.AutoSize = $true
                $dLbl.MaximumSize = New-Object System.Drawing.Size(($availW - 2*$cpad - 12), 0)
                $card.Controls.Add($dLbl)
                $cardInfo.Controls['Desc'] = $dLbl
            }
            for ($i = 0; $i -lt $buttons.Count; $i++) {
                $b = $buttons[$i]
                $btn = New-Object System.Windows.Forms.Button
                $btn.Text = $b.Text
                $btn.Font = $F_BTN_MAIN
                $btn.FlatStyle = "Flat"
                # 按钮加 1px 细边框 (颜色为按钮色的暗化版本)
                $btn.FlatAppearance.BorderSize = 1
                $btn.ForeColor = $C_FG
                # 含 \n 的两行文字居中，单行也居中
                $btn.TextAlign = "MiddleCenter"
                $btn.Cursor = "Hand"
                $colorParts = ($b.Color -replace ' ', '').Split(',')
                if ($colorParts.Count -eq 3) {
                    $r0 = [int]$colorParts[0]; $g0 = [int]$colorParts[1]; $b0 = [int]$colorParts[2]
                    $btn.BackColor = [System.Drawing.Color]::FromArgb($r0, $g0, $b0)
                    # 悬停加亮 +40
                    $btn.FlatAppearance.MouseOverBackColor = [System.Drawing.Color]::FromArgb(
                        ([Math]::Min(255, $r0 + 40)),
                        ([Math]::Min(255, $g0 + 40)),
                        ([Math]::Min(255, $b0 + 40))
                    )
                    # 边框色 = 按钮色暗化 (R-20, G-20, B-20)，下限 0
                    $btn.FlatAppearance.BorderColor = [System.Drawing.Color]::FromArgb(
                        ([Math]::Max(0, $r0 - 20)),
                        ([Math]::Max(0, $g0 - 20)),
                        ([Math]::Max(0, $b0 - 20))
                    )
                } else {
                    $btn.BackColor = $C_BG_BTN
                    $btn.FlatAppearance.MouseOverBackColor = $C_BG_L3
                    $btn.FlatAppearance.BorderColor = $C_BORDER
                }
                if ($b.Desc) {
                    $tip = New-Object System.Windows.Forms.ToolTip
                    $tip.AutoPopDelay = 12000
                    $tip.InitialDelay = 200
                    $tip.ReshowDelay = 100
                    $tip.SetToolTip($btn, $b.Desc)
                }
                if ($b.OnClick) { $btn.Add_Click($b.OnClick) }
                $card.Controls.Add($btn)
                $cardInfo.Controls["Btn$i"] = $btn
            }
            $cardInfo.Card = $card
            $scroll.Controls.Add($card)
        }

        $cardInfo.Card.Location = New-Object System.Drawing.Point($PADDING, $y)
        $cardInfo.Controls['Accent'].Location = New-Object System.Drawing.Point(0, 0)
        $cardInfo.Controls['Title'].Location = New-Object System.Drawing.Point(($cpad + 6), $cpad)
        $subY = $cpad + $titleH
        if ($cardInfo.Subtitle) {
            $cardInfo.Controls['Subtitle'].Location = New-Object System.Drawing.Point(($cpad + 6), $subY)
            $subY += $subH
        }
        # Position description and measure actual height for proper card sizing
        $actualDescH = $descH
        if ($cardInfo.Description) {
            $descCtrl = $cardInfo.Controls['Desc']
            $descCtrl.MaximumSize = New-Object System.Drawing.Size(($availW - 2*$cpad - 12), 0)
            $descCtrl.Location = New-Object System.Drawing.Point(($cpad + 6), $subY)
            # Use actual label height if it's larger than estimate (handles text wrapping)
            if ($descCtrl.Height -gt $actualDescH) { $actualDescH = $descCtrl.Height }
        }
        # Recalculate card height with actual description height
        $actualTopOffset = $cpad + $titleH + $subH + $actualDescH + 8

        # ===== 公网地址速览卡片专属：在 description 和按钮之间插入 "大URL标签 + Hint" =====
        if ($cardInfo.IsPublicUrlCard) {
            if (-not $cardInfo.Controls.ContainsKey('BigUrlLabel')) {
                $big = New-Object System.Windows.Forms.Label
                $big.Text = "（暂无公网地址）→ 点下方红色【启动 + 分享 + 自动重启】生成公网地址"
                $big.Font = New-Object System.Drawing.Font("Microsoft YaHei UI", 10)
                $big.ForeColor = $C_FG_DIM
                $big.AutoSize = $false
                $big.BackColor = $C_BG_DARK
                $big.Padding = "14, 12, 14, 12"
                $big.BorderStyle = "FixedSingle"
                $big.Cursor = [System.Windows.Forms.Cursors]::Default
                $big.Add_Click({ Copy-PublicUrlToClipboard })
                $card.Controls.Add($big)
                $cardInfo.Controls['BigUrlLabel'] = $big
                # 注册为全局"公网地址卡片主标签"，供 Update-PublicUrlCard 更新
                $script:PublicUrlCardLabel = $big

                $hint = New-Object System.Windows.Forms.Label
                $hint.Text = "  未检测到公网隧道。启动 cpolar 后会自动刷新。也可以点下面 🔄 刷新地址 按钮。"
                $hint.Font = $F_CARD_DESC
                $hint.ForeColor = [System.Drawing.Color]::FromArgb(180, 180, 200)
                $hint.AutoSize = $false
                $card.Controls.Add($hint)
                $cardInfo.Controls['HintLabel'] = $hint
                $script:PublicUrlCardHint = $hint
            }
            $bigCtrl = $cardInfo.Controls['BigUrlLabel']
            $hintCtrl = $cardInfo.Controls['HintLabel']
            $bigCtrl.Location = New-Object System.Drawing.Point(($cpad + 2), $actualTopOffset)
            $bigCtrl.Size = New-Object System.Drawing.Size(($innerW - 4), 58)
            $actualTopOffset += 58 + 6
            $hintCtrl.Location = New-Object System.Drawing.Point(($cpad + 2), $actualTopOffset)
            $hintCtrl.Size = New-Object System.Drawing.Size(($innerW - 4), 26)
            $actualTopOffset += 26 + 8
        }

        # ===== 分支管理卡片专属：在 description 和按钮之间插入 "当前分支大标签" =====
        if ($cardInfo.IsBranchCard) {
            if (-not $cardInfo.Controls.ContainsKey('BranchBigLabel')) {
                # 大标签：显示当前分支名 + 类型颜色标识 + 脏状态
                $big = New-Object System.Windows.Forms.Label
                $big.Text = "🔄  正在读取分支信息..."
                $big.Font = New-Object System.Drawing.Font("Microsoft YaHei UI", 10.5, [System.Drawing.FontStyle]::Bold)
                $big.AutoSize = $false
                $big.BackColor = [System.Drawing.Color]::FromArgb(42, 55, 78)
                $big.ForeColor = [System.Drawing.Color]::FromArgb(130, 185, 250)
                $big.Padding = "14, 14, 14, 14"
                $big.BorderStyle = "FixedSingle"
                $card.Controls.Add($big)
                $cardInfo.Controls['BranchBigLabel'] = $big
                $script:BranchCardLabel = $big
            }
            # 第一次创建后立即刷新（后续通过 Update-BranchCardLabel 手动刷新）
            try { Update-BranchCardLabel } catch {}

            $branchCtrl = $cardInfo.Controls['BranchBigLabel']
            $branchCtrl.Location = New-Object System.Drawing.Point(($cpad + 2), $actualTopOffset)
            $branchCtrl.Size = New-Object System.Drawing.Size(($innerW - 4), 58)
            $actualTopOffset += 58 + 10
        }

        $actualCardH = $actualTopOffset + ($rows * $BTN_H) + ([Math]::Max(0, $rows - 1) * $gap) + $cpad
        $cardInfo.Card.Size = New-Object System.Drawing.Size($availW, $actualCardH)
        # 顶部色条：宽=卡片宽，高=3px (替代原左侧 5px 竖条)
        $cardInfo.Controls['Accent'].Location = New-Object System.Drawing.Point(0, 0)
        $cardInfo.Controls['Accent'].Size = New-Object System.Drawing.Size($cardInfo.Card.Width, 3)
        $cardInfo.Controls['Accent'].BringToFront()
        for ($i = 0; $i -lt $buttons.Count; $i++) {
            $col = $i % $maxPerRow
            $row = [Math]::Floor($i / $maxPerRow)
            $bw2 = if ($buttons[$i].Width) { $buttons[$i].Width } else { $bw }
            $bx = $cpad + 2 + ($col * ($bw2 + $gap))
            $by = $actualTopOffset + ($row * ($BTN_H + $gap))
            $btnCtrl = $cardInfo.Controls["Btn$i"]
            $btnCtrl.Size = New-Object System.Drawing.Size($bw2, $BTN_H)
            $btnCtrl.Location = New-Object System.Drawing.Point($bx, $by)
        }
        $y += $actualCardH + $CARD_GAP_V
    }
}

# ==============================================================================
# ============ 标签页 1: 启动管理 ============
# ==============================================================================
$tab1Ctx = New-TabPanel -HeaderText "🚀  启动管理" -HeaderTagline "后端服务器启动 · 公网共享 · 端口管理 · 快速访问" -HeaderDesc "本页包含 3 个功能区：① 启动后端（6种模式：一键/快速/分享/看门狗/全开/Nodemon）  ② 停止与端口管理（停止/释放端口/查看状态）  ③ 快速访问（前端/API文档/Prisma Studio）"

# --- 快速开始指引 (醒目) ---
Add-SectionCard -TabCtx $tab1Ctx -IsGuide `
    -Title "👆 快速开始：按你现在的情况选按钮" `
    -AccentColor $C_GUIDE_ACCENT `
    -Buttons @(
    @{ Text = "① 第一次使用？→ 点下方【第一次用：一键启动（安装依赖+重置账号）】 绿色按钮  ⭐推荐"; Color = "guide" },
    @{ Text = "② 之前启动过？→ 点下方【日常启动：跳过检查，快速启动】            蓝色按钮  ⭐推荐"; Color = "guide" },
    @{ Text = "③ 要发链接给朋友？→ 点下方【启动 + 公网分享】 或 【启动 + 分享 + 自动重启】"; Color = "guide" },
    @{ Text = "④ 启动成功后 → 点下方【打开前端 http://localhost:3000/】 去玩！"; Color = "guide" }
)

# --- 🌐 公网地址速览（v3.3 新增：显眼显示 + 一键复制）---
# 数据来源：%TEMP%\euriskotax-last-cpolar-url.txt（ops-start-dev 和 watchdog 共享）
$puCardInfo = @{
    Title          = "🌐 公网地址速览（朋友访问用这个）"
    Subtitle       = "自动刷新 · 点击复制 · 看门狗变更后 3 秒内同步"
    Description    = "详细说明：cpolar 生成的公网链接会立即显示在这里。地址变化自动弹窗并复制到剪贴板；邮件也会同步发给收件人列表。如果暂时为「暂无」，点下面红色【启动 + 分享 + 自动重启】即可。"
    AccentColor    = [System.Drawing.Color]::FromArgb(235, 140, 85)   # 橙色突出
    ButtonsPerRow  = 0
    Buttons        = @(
        @{ Text = "🔄 刷新地址"; Desc = "立即重新读取共享文件（通常 3 秒自动刷新一次）。"
           Color = "200, 140, 75"
           OnClick = { try { Update-PublicUrlCard -Force } catch { } Show-GuiAlert -Title "已刷新" -Message "公网地址卡片已刷新。若仍为空，请稍等 5~15 秒（cpolar 建立隧道需要时间）。" }
        },
        @{ Text = "📋 复制地址"; Desc = "把当前公网地址复制到剪贴板，方便粘贴发给朋友。"
           Color = "160, 110, 200"
           OnClick = { Copy-PublicUrlToClipboard }
        },
        @{ Text = "🌐 浏览器打开"; Desc = "用默认浏览器打开公网地址，预览朋友看到的效果。"
           Color = "75, 170, 190"
           OnClick = {
                $uf = Join-Path $env:TEMP "euriskotax-last-cpolar-url.txt"
                $u = $null
                if (Test-Path $uf) { $u = (Get-Content $uf -Raw -Encoding UTF8 -ErrorAction SilentlyContinue).Trim() }
                if ([string]::IsNullOrWhiteSpace($u)) {
                    Show-GuiAlert -Title "暂无公网地址" -Message "请先点下方红色【启动 + 分享 + 自动重启】按钮，cpolar 建立隧道后这里会自动出现地址。" -Kind Warning
                } else {
                    try { Start-Process $u } catch { Show-GuiAlert -Title "打开失败" -Message "无法打开浏览器。请手动在浏览器访问：$u" -Kind Error }
                }
           }
        },
        @{ Text = "📧 测试邮件通知"; Desc = "立即发送一封【邮件通知测试】到 notify.config.json 中配置的收件人，验证 SMTP 是否正常。"
           Color = "85, 180, 110"
           OnClick = {
                Write-Log "[MAIL] 正在发送测试邮件..." "INFO"
                $notifyScript = Join-Path $OpsDir "ops-notify.ps1"
                if (-not (Test-Path $notifyScript)) {
                    Show-GuiAlert -Title "脚本缺失" -Message "找不到通知脚本：$notifyScript" -Kind Error
                    return
                }
                try {
                    . $notifyScript
                    $sent = Send-TestNotification
                    if ($sent) {
                        Show-GuiAlert -Title "✅ 测试邮件已发送" -Message "测试邮件已发出，请在以下收件人邮箱中查收（约 10~60 秒）：`n`n  $($script:NotifyConfig.recipients -join "`n  ")`n`n如果没收到：`n  ① 检查垃圾箱`n  ② 去 tools/ops/notify.log 看详细错误`n  ③ 确认 QQ 邮箱授权码未过期"
                    } else {
                        Show-GuiAlert -Title "⚠️ 邮件未发出" -Message "发送失败！请立即查看 tools/ops/notify.log 定位原因。常见原因：`n  ① notify.config.json 里 enabled=false`n  ② QQ 授权码错误或过期`n  ③ SMTP 端口 587 被防火墙拦截" -Kind Warning
                    }
                } catch {
                    Show-GuiAlert -Title "测试邮件异常" -Message "异常信息：$($_.Exception.Message)`n`n详情查看 tools/ops/notify.log" -Kind Error
                }
           }
        }
    )
    Card           = $null
    Controls       = @{}
    IsGuide        = $false
    IsPublicUrlCard = $true   # 特殊标记 → Reflow-TabCards 会额外注入 URL 大标签 + Hint
}
$tab1Ctx.Cards += $puCardInfo

# --- 系统健康状态速览 (v3.4 新增) ---
$healthCardInfo = @{
    Title          = "📊 系统健康状态"
    Subtitle       = "一键检测 · 实时状态 · 环境诊断"
    Description    = "详细说明：快速检查后端服务、cpolar 隧道、看门狗、数据库连接、依赖安装等关键状态。无需手动逐个排查，一键定位问题。"
    AccentColor    = [System.Drawing.Color]::FromArgb(85, 180, 110)
    ButtonsPerRow  = 0
    Buttons        = @(
        @{ Text = "🔍 一键全面体检`n后端+cpolar+数据库+依赖"; Desc = "检查后端是否在线、cpolar 隧道状态、看门狗运行状态、数据库连接、node_modules 是否安装。结果输出到下方日志区。"; Color = "85, 180, 110"; Width = $BTN_WIDE_W;
           OnClick = {
                Write-Log "===== 系统健康检查 =====" "CMD"

                # 1. 后端
                Write-Log "[1/5] 检查后端服务..." "INFO"
                $backendOk = $false
                try {
                    $null = Invoke-WebRequest -Uri "http://localhost:3000/health" -TimeoutSec 3 -UseBasicParsing
                    $backendOk = $true
                    Write-Log "  ✅ 后端在线 (localhost:3000)" "OK"
                } catch {
                    Write-Log "  ❌ 后端未启动或无响应" "ERROR"
                }

                # 2. cpolar
                Write-Log "[2/5] 检查 cpolar 隧道..." "INFO"
                $cpolarOk = $false
                try {
                    $null = Invoke-WebRequest -Uri "http://127.0.0.1:4040/api/tunnels" -TimeoutSec 3 -UseBasicParsing
                    $cpolarOk = $true
                    Write-Log "  ✅ cpolar 面板可访问 (4040端口)" "OK"
                } catch {
                    Write-Log "  ❌ cpolar 未运行或面板不可访问" "WARN"
                }

                # 3. 看门狗
                Write-Log "[3/5] 检查看门狗..." "INFO"
                $wdRunning = $false
                if ($script:WatchdogProcess -and -not $script:WatchdogProcess.HasExited) {
                    $wdRunning = $true
                    Write-Log "  ✅ 看门狗运行中 (PID=$($script:WatchdogProcess.Id))" "OK"
                } else {
                    Write-Log "  ❌ 看门狗未启动" "WARN"
                }

                # 4. 数据库
                Write-Log "[4/5] 检查数据库连接..." "INFO"
                $dbOk = $false
                if ($backendOk) {
                    try {
                        $resp = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" -Method POST -ContentType "application/json" -Body '{"email":"dev@example.com","password":"password"}' -TimeoutSec 5
                        if ($resp.success) { $dbOk = $true; Write-Log "  ✅ 数据库连接正常（登录API成功）" "OK" }
                        else { Write-Log "  ⚠️ 登录API返回失败，可能数据库未初始化" "WARN" }
                    } catch {
                        Write-Log "  ❌ 登录API无响应，数据库可能未连接" "ERROR"
                    }
                } else {
                    Write-Log "  ⏭ 后端未启动，跳过数据库检查" "GRAY"
                }

                # 5. 依赖
                Write-Log "[5/5] 检查依赖安装..." "INFO"
                $nmPath = Join-Path $ProjectRoot "node_modules"
                $depOk = (Test-Path $nmPath) -and (Test-Path (Join-Path $ServerDir "node_modules"))
                if ($depOk) { Write-Log "  ✅ node_modules 已安装" "OK" }
                else { Write-Log "  ❌ node_modules 缺失，需要运行 npm install" "ERROR" }

                # 总结
                Write-Log "" "INFO"
                $score = ($backendOk + $cpolarOk + $wdRunning + $dbOk + $depOk)
                Write-Log "===== 体检结果: $score/5 通过 =====" $(if ($score -ge 4) { "OK" } elseif ($score -ge 2) { "WARN" } else { "ERROR" })
                if (-not $backendOk) { Write-Log "  → 建议：到【启动管理】点【日常启动】或【一键启动】" "WARN" }
                if (-not $depOk) { Write-Log "  → 建议：到【启动管理】点【第一次用：一键启动】安装依赖" "WARN" }
                if (-not $cpolarOk -and $backendOk) { Write-Log "  → 建议：如需公网访问，点【启动 + 公网分享】" "INFO" }
                if (-not $wdRunning -and $backendOk) { Write-Log "  → 建议：长时间运行建议开启看门狗守护" "INFO" }
                Write-Log "=================================" "CMD"
           }
        },
        @{ Text = "📋 查看后端环境`n.env 文件检查"; Desc = "检查 server/.env 文件是否存在、关键变量（JWT_SECRET, DATABASE_URL）是否配置。"; Color = "120, 120, 160";
           OnClick = {
                Write-Log "===== 后端环境检查 =====" "CMD"
                $envFile = Join-Path $ServerDir ".env"
                if (-not (Test-Path $envFile)) {
                    Write-Log "❌ server/.env 文件不存在！请从 .env.example 复制并配置。" "ERROR"
                    return
                }
                Write-Log "✅ .env 文件存在" "OK"
                $content = Get-Content $envFile -Encoding UTF8
                $hasJwt = $false; $hasDb = $false; $hasPort = $false
                foreach ($line in $content) {
                    if ($line -match '^\s*JWT_SECRET\s*=\s*(\S+)') { $hasJwt = $true; $v = $matches[1]; Write-Log "  JWT_SECRET = $($v.Substring(0, [Math]::Min(10, $v.Length)))..." "GRAY" }
                    if ($line -match '^\s*DATABASE_URL\s*=\s*(\S+)') { $hasDb = $true; Write-Log "  DATABASE_URL = $($matches[1].Substring(0, [Math]::Min(30, $matches[1].Length)))..." "GRAY" }
                    if ($line -match '^\s*PORT\s*=\s*(\d+)') { $hasPort = $true; Write-Log "  PORT = $($matches[1])" "GRAY" }
                }
                if (-not $hasJwt) { Write-Log "  ⚠️ JWT_SECRET 未配置" "WARN" }
                if (-not $hasDb)  { Write-Log "  ⚠️ DATABASE_URL 未配置" "WARN" }
                if (-not $hasPort) { Write-Log "  ℹ️ PORT 未配置（默认 3000）" "INFO" }
                Write-Log "===== 环境检查完成 =====" "CMD"
           }
        },
        @{ Text = "🔧 检查端口占用`n3000/4040/5555"; Desc = "检查后端(3000)、cpolar(4040)、Prisma(5555) 三个关键端口的占用情况。"; Color = "120, 120, 160";
           OnClick = {
                Write-Log "===== 端口占用检查 =====" "CMD"
                foreach ($port in @(3000, 4040, 5555)) {
                    $conns = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
                    if (-not $conns) {
                        Write-Log "  端口 $port : 空闲" "OK"
                    } else {
                        foreach ($c in $conns) {
                            try {
                                $pi = Get-Process -Id $c.OwningProcess -ErrorAction Stop
                                Write-Log "  端口 $port : 占用 (PID=$($c.OwningProcess) [$($pi.ProcessName)] State=$($c.State))" "WARN"
                            } catch {
                                Write-Log "  端口 $port : 占用 (PID=$($c.OwningProcess) State=$($c.State))" "WARN"
                            }
                        }
                    }
                }
                Write-Log "=========================" "CMD"
           }
        }
    )
    Card           = $null
    Controls       = @{}
    IsGuide        = $false
    IsPublicUrlCard = $false
}
$tab1Ctx.Cards += $healthCardInfo

# --- 启动后端 (更清晰的按钮名) ---
Add-SectionCard -TabCtx $tab1Ctx `
    -Title "1. 启动后端服务" `
    -Subtitle "根据使用场景选择启动方式" `
    -Description "详细说明：所有启动命令都会运行 ops-start-dev.ps1 脚本，在 server/ 目录执行。启动成功后会自动显示日志。" `
    -AccentColor $C_SUCCESS -Buttons @(
    @{ Text = "第一次用：一键启动`n安装依赖 + 重置测试账号`n⭐推荐给新环境"; Desc = "完整流程：环境检查 → npm install 装依赖 → 重置测试账号(dev@example.com/password) → 启动后端服务。如果你是第一次启动或者升级过代码，就点这个。"; Color = "85, 180, 110"; Width = $BTN_WIDE_W;
       OnClick = { Invoke-AsyncCommand -Name "backend" -Command "& '$OpsDir\ops-start-dev.ps1'" -WorkingDir $ProjectRoot -IsBackend } },
    @{ Text = "日常启动：快速启动`n跳过安装，跳过重置`n⭐推荐日常开发"; Desc = "直接启动后端服务，跳过依赖安装和用户重置。只适合之前已经成功启动过、依赖已装齐的情况。速度快很多。"; Color = "75, 140, 230"; Width = $BTN_WIDE_W;
       OnClick = { Invoke-AsyncCommand -Name "backend" -Command "& '$OpsDir\ops-start-dev.ps1' -SkipInstall -SkipResetUser" -WorkingDir $ProjectRoot -IsBackend } },
    @{ Text = "启动 + 公网分享`n开启 cpolar 内网穿透`n✉️ 地址生成后自动发邮件"; Desc = "启动后端后会同时开启 cpolar 隧道，自动生成公网 URL。【新增】URL 获取成功后会自动发送邮件给配置的收件人（notify.config.json），内容含新地址+登录账号密码，朋友直接点击链接就能访问。"; Color = "165, 105, 210";
       OnClick = { Invoke-AsyncCommand -Name "backend" -Command "& '$OpsDir\ops-start-dev.ps1' -Share" -WorkingDir $ProjectRoot -IsBackend } },
    @{ Text = "启动 + 崩溃自动重启`n看门狗守护模式（仅本地）"; Desc = "启动后端的同时开启看门狗守护，后端如果意外崩溃会被自动重启。长时间运行推荐使用。【注意】本按钮不开启公网分享，如果要发公网链接给朋友，请点【启动 + 分享 + 自动重启】。"; Color = "225, 165, 80";
       OnClick = { Invoke-AsyncCommand -Name "backend" -Command "& '$OpsDir\ops-start-dev.ps1' -Watchdog" -WorkingDir $ProjectRoot -IsBackend } },
    @{ Text = "启动 + 分享 + 自动重启`n⭐朋友联调推荐`n✉️ 新建/变更都自动发邮件"; Desc = "启动后端 + cpolar 公网分享 + 看门狗守护三件套。【新增】URL 首次创建自动发 URL_CREATED 邮件；cpolar 自动重连/重启地址变更自动发 URL_CHANGED 邮件。推荐把系统给朋友访问时直接点这个按钮，通知交给程序。"; Color = "225, 95, 90";
       OnClick = { Invoke-AsyncCommand -Name "backend" -Command "& '$OpsDir\ops-start-dev.ps1' -Share -Watchdog" -WorkingDir $ProjectRoot -IsBackend } },
    @{ Text = "Nodemon 开发模式`n修改代码自动重启"; Desc = "在 server/ 目录运行 npm run dev，用 Nodemon 启动，修改后端代码后会自动重启。开发调试时用这个。"; Color = "85, 180, 190";
       OnClick = { Invoke-AsyncCommand -Name "backend" -Command "npm run dev" -WorkingDir $ServerDir -IsBackend } }
)

# --- 停止与端口管理 ---
Add-SectionCard -TabCtx $tab1Ctx `
    -Title "2. 停止后端 & 端口管理" `
    -Subtitle "停止运行中服务，释放或检查端口 3000" `
    -Description "详细说明：正常点 停止后端 就够了。如果提示端口被占用、启动报错，就点 释放3000端口。" `
    -AccentColor $C_DANGER -Buttons @(
    @{ Text = "停止后端服务`n包含看门狗"; Desc = "停止当前运行的后端服务器以及看门狗守护进程。正常退出点这个。"; Color = "200, 85, 85";
       OnClick = { Stop-Job -Name "backend"; Stop-Job -Name "watchdog" } },
    @{ Text = "强制释放 3000 端口`n杀死占用进程"; Desc = "当启动报错 '端口3000被占用' 时点这个，会强制杀掉所有占用3000端口的进程，然后再启动后端。"; Color = "180, 95, 95";
       OnClick = { Free-Port -Port 3000 } },
    @{ Text = "查看 3000 端口状态`n显示占用进程详情"; Desc = "在下方输出区显示当前3000端口的占用情况，含进程名和路径，方便排查。"; Color = "120, 125, 160";
       OnClick = {
            Write-Log "===== 端口 3000 状态 =====" "CMD"
            $conns = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
            if (-not $conns) { Write-Log "端口 3000 空闲，无进程占用" "OK"; return }
            foreach ($c in $conns) {
                try {
                    $pi = Get-Process -Id $c.OwningProcess -ErrorAction Stop
                    Write-Log "状态=$($c.State)  PID=$($c.OwningProcess)  [$($pi.ProcessName)]  $($pi.Path)"
                } catch {
                    Write-Log "状态=$($c.State)  PID=$($c.OwningProcess)  (无权限查看进程详情)" "WARN"
                }
            }
        } }
)

# --- 快速访问 ---
Add-SectionCard -TabCtx $tab1Ctx `
    -Title "3. 快速访问" `
    -Subtitle "在浏览器打开项目页面" `
    -Description "详细说明：先启动后端再点下面按钮。前端页用于操作，API文档用于查看接口说明，Prisma Studio用于改数据。" `
    -AccentColor $C_ACCENT -Buttons @(
    @{ Text = "打开前端首页`nhttp://localhost:3000/"; Desc = "在默认浏览器打开 EuriskoTax 的前端主页面。启动成功后一定要点这个去看！"; Color = "85, 180, 110";
       OnClick = { Start-Process "http://localhost:3000/"; Write-Log "已打开前端: http://localhost:3000/" "INFO" } },
    @{ Text = "📚 一键查看API文档`n自动取Token+全自动授权"; Desc = "⭐一键全自动：检查后端→自动登录取JWT→生成带Token的Swagger页面→浏览器打开。打开后无需手动点Authorize，直接点Try it out就能调用所有接口（后端重启时首次使用建议点启动管理）。"; Color = "85, 180, 110";
       OnClick = { Open-ApiDocsAuto } },
    @{ Text = "打开 Prisma Studio`n可视化管理数据库"; Desc = "启动 Prisma Studio 并打开 localhost:5555，可以像 Excel 一样增删改查数据库。"; Color = "165, 105, 210";
       OnClick = {
            Invoke-AsyncCommand -Name "prismastudio" -Command "npx prisma studio" -WorkingDir $ServerDir
            Start-Sleep -Seconds 4
            Start-Process "http://localhost:5555"
            Write-Log "Prisma Studio 应在 localhost:5555 打开" "INFO"
        } }
)

# ==============================================================================
# ============ 标签页 2: 数据库 ============
# ==============================================================================
$tab2Ctx = New-TabPanel -HeaderText "💾  数据库" -HeaderTagline "Prisma 数据库迁移 · 客户端生成 · 数据重置 · 可视化管理" -HeaderDesc "本页包含 2 个功能区：① Schema 管理（迁移/生成客户端/Prisma Studio/编辑schema）  ② 数据管理（重置账号/强制重建数据库）。所有命令在 server/ 目录执行。"

Add-SectionCard -TabCtx $tab2Ctx `
    -Title "1. Schema 管理" `
    -Subtitle "迁移、生成客户端、可视化编辑、schema 源码" `
    -Description "详细说明：改完 server/prisma/schema.prisma 文件后，要先 运行数据库迁移，再 生成Prisma客户端，代码才能识别新表结构。Prisma Studio 可以像 Excel 一样查看和编辑数据。" `
    -AccentColor $C_ACCENT -Buttons @(
    @{ Text = "运行数据库迁移`n应用 schema 改动"; Desc = "执行 prisma migrate dev。把 schema.prisma 里改的表结构同步到真实数据库，并生成迁移历史文件。"; Color = "75, 140, 230";
       OnClick = { Invoke-AsyncCommand -Name "migrate" -Command "npx prisma migrate dev" -WorkingDir $ServerDir } },
    @{ Text = "生成 Prisma 客户端`nprisma generate"; Desc = "执行 prisma generate。根据 schema.prisma 重新生成 Prisma Client 代码，后端的 import 才认得新表。"; Color = "120, 120, 160";
       OnClick = { Invoke-AsyncCommand -Name "generate" -Command "npx prisma generate" -WorkingDir $ServerDir } },
    @{ Text = "打开可视化数据库`nPrisma Studio"; Desc = "启动 Prisma Studio (端口5555)，在浏览器中像表格一样可视化编辑数据库。"; Color = "165, 105, 210";
       OnClick = {
            Invoke-AsyncCommand -Name "prismastudio" -Command "npx prisma studio" -WorkingDir $ServerDir
            Start-Sleep -Seconds 4
            Start-Process "http://localhost:5555"
        } },
    @{ Text = "编辑 schema.prisma`n数据库结构定义"; Desc = "用记事本打开 server/prisma/schema.prisma，可以改表结构、字段、索引。"; Color = "120, 120, 140";
       OnClick = { Start-Process "notepad.exe" (Join-Path $ServerDir "prisma\schema.prisma") } }
)

Add-SectionCard -TabCtx $tab2Ctx `
    -Title "2. 数据管理" `
    -Subtitle "重置测试账号 · 强制重建数据库" `
    -Description "详细说明：重置测试账号会恢复 dev@example.com/password 默认账号。强制重建数据库会清空所有数据，谨慎操作。" `
    -AccentColor $C_DANGER -Buttons @(
    @{ Text = "重置开发测试账号`ndev@example.com"; Desc = "执行 server/scripts/reset-dev-user.js，重置开发环境的测试用户账号（邮箱 dev@example.com，密码 password）。"; Color = "85, 180, 110";
       OnClick = { Invoke-AsyncCommand -Name "resetuser" -Command "node scripts/reset-dev-user.js" -WorkingDir $ServerDir } },
    @{ Text = "⚠ 强制重建数据库`n所有数据将清空丢失"; Desc = "执行 prisma migrate reset --force，删除当前数据库并重建！！！所有数据会被清空，不可恢复。点前请三思。"; Color = "200, 85, 85";
       OnClick = {
            $r = [System.Windows.Forms.MessageBox]::Show("这将删除并重建数据库! 所有数据将永久丢失! 确定继续?", "危险操作", "YesNo", "Warning")
            if ($r -eq "Yes") { Invoke-AsyncCommand -Name "resetdb" -Command "npx prisma migrate reset --force" -WorkingDir $ServerDir }
        } }
)

# ==============================================================================
# ============ 标签页 3: 测试中心 ============
# ==============================================================================
$tab3Ctx = New-TabPanel -HeaderText "🧪  测试中心" -HeaderTagline "Jest 单元测试 · 覆盖率报告 · 性能基准测试" -HeaderDesc "本页包含 2 个功能区：① 单元测试（全部测试/监视模式/覆盖率/打开报告/tests目录/测试报告）  ② 性能 & 代码质量（基准测试/优化报告/性能单测）"

Add-SectionCard -TabCtx $tab3Ctx `
    -Title "1. 单元测试" `
    -Subtitle "所有命令在项目根目录执行" `
    -Description "详细说明：完整测试+覆盖率会跑所有 tests/ 目录下的用例，并在 coverage/ 目录生成 HTML 报告。监视模式适合边改代码边测。" `
    -AccentColor $C_PURPLE -Buttons @(
    @{ Text = "运行全部测试 + 覆盖率`nnpm test"; Desc = "运行所有 Jest 测试用例，并生成覆盖率报告。可在下方打开覆盖率 HTML 报告查看详细。"; Color = "85, 180, 110";
       OnClick = { Invoke-AsyncCommand -Name "test" -Command "npm test" -WorkingDir $ProjectRoot } },
    @{ Text = "监视模式：改代码自动测`nnpm run test:watch"; Desc = "进入 Jest --watch 模式，监视文件变化，保存代码后自动跑相关测试。开发时持续自测用。"; Color = "75, 140, 230";
       OnClick = { Invoke-AsyncCommand -Name "testwatch" -Command "npm run test:watch" -WorkingDir $ProjectRoot } },
    @{ Text = "停止测试监视`n结束 Jest watch"; Desc = "停止当前运行的测试监视任务。"; Color = "180, 95, 95";
       OnClick = { Stop-Job -Name "testwatch" } },
    @{ Text = "打开覆盖率报告`nHTML 格式"; Desc = "在浏览器打开 coverage/index.html，查看各文件/函数覆盖率百分比。需要先跑完整测试。"; Color = "85, 180, 190";
       OnClick = {
            $cov = Join-Path $ProjectRoot "coverage\index.html"
            if (Test-Path $cov) { Start-Process $cov; Write-Log "覆盖率报告已打开: $cov" "OK" }
            else { Write-Log "覆盖率报告尚未生成，请先运行 全部测试+覆盖率。" "WARN" }
        } },
    @{ Text = "打开 tests 目录`n测试代码所在目录"; Desc = "在资源管理器中打开 tests/ 目录，查看/编辑测试代码文件。"; Color = "120, 120, 140";
       OnClick = { Start-Process "explorer.exe" (Join-Path $ProjectRoot "tests") } },
    @{ Text = "查看测试报告文档`nMarkdown 格式"; Desc = "打开 docs/reports/test-report.md，查看已编写的测试说明和结果记录。"; Color = "120, 120, 140";
       OnClick = { Start-Process (Join-Path $ProjectRoot "docs\reports\test-report.md") } }
)

Add-SectionCard -TabCtx $tab3Ctx `
    -Title "2. 性能 & 代码质量" `
    -Subtitle "性能测试和优化建议" `
    -Description "详细说明：性能测试评估税务计算核心模块的运行速度。优化报告列出了之前发现的性能瓶颈和优化建议。" `
    -AccentColor $C_WARN -Buttons @(
    @{ Text = "运行性能基准测试`nnpm run test:performance"; Desc = "运行 scripts 中的性能基准脚本，结果输出到下方日志区。"; Color = "225, 165, 80";
       OnClick = { Invoke-AsyncCommand -Name "perf" -Command "npm run test:performance" -WorkingDir $ProjectRoot } },
    @{ Text = "查看性能优化报告`n优化建议文档"; Desc = "打开 performance-optimization-report.md，阅读项目性能优化历史和建议。"; Color = "120, 120, 140";
       OnClick = { Start-Process (Join-Path $ProjectRoot "docs\reports\performance-optimization-report.md") } },
    @{ Text = "运行 Jest 性能单测`ntax-assistant-perf"; Desc = "单独运行 tests/tax-assistant-perf.test.js，针对税务助手模块的性能测试。"; Color = "165, 105, 210";
       OnClick = { Invoke-AsyncCommand -Name "perftest" -Command "npx jest tests/tax-assistant-perf.test.js" -WorkingDir $ProjectRoot } }
)

# ==============================================================================
# ============ 标签页 4: 运维监控 ============
# ==============================================================================
$tab4Ctx = New-TabPanel -HeaderText "🛠  运维监控" -HeaderTagline "看门狗守护 · cpolar 内网穿透" -HeaderDesc "本页包含 2 个功能区：① 看门狗守护（启动/停止/编辑脚本）  ② Cpolar 内网穿透（启动隧道/查看面板/停止）"

Add-SectionCard -TabCtx $tab4Ctx `
    -Title "1. 看门狗守护" `
    -Subtitle "脚本：tools/ops/ops-watchdog.ps1" `
    -Description "详细说明：看门狗每10秒检查一次后端 /health 接口，如果连续3次不响应就自动重启后端，并通过邮件发通知。长时间无人值守时必开。" `
    -AccentColor $C_WARN -Buttons @(
    @{ Text = "启动看门狗守护`n监控 + 自动重启后端"; Desc = "在后台运行 ops-watchdog.ps1，定期健康检查后端，崩溃时自动重启并告警。"; Color = "225, 165, 80";
       OnClick = { Invoke-AsyncCommand -Name "watchdog" -Command "& '$OpsDir\ops-watchdog.ps1'" -WorkingDir $OpsDir -IsWatchdog } },
    @{ Text = "停止看门狗守护"; Desc = "停止当前运行的看门狗进程。"; Color = "180, 95, 95";
       OnClick = { Stop-Job -Name "watchdog" } },
    @{ Text = "查看/编辑看门狗脚本"; Desc = "用记事本打开 ops-watchdog.ps1 源码，可调整检查间隔、重试次数、健康检查地址。"; Color = "120, 120, 140";
       OnClick = { Start-Process "notepad.exe" (Join-Path $OpsDir "ops-watchdog.ps1") } }
)

Add-SectionCard -TabCtx $tab4Ctx `
    -Title "2. Cpolar 内网穿透" `
    -Subtitle "程序：tools/cpolar/cpolar.exe" `
    -Description "详细说明：cpolar 将本地 3000 端口映射为可在公网访问的 URL，方便在其他电脑或手机上测试。也可以在启动管理直接用一键模式开启。" `
    -AccentColor $C_CYAN -Buttons @(
    @{ Text = "启动 HTTP 隧道`n映射 3000 端口到公网"; Desc = "执行 cpolar http 3000 -region=cn（国内加速节点），将本地 3000 端口映射为 cpolar 提供的公网地址。启动后在下面打开面板查看URL。"; Color = "75, 180, 190";
       OnClick = {
            $cp = Join-Path $CpolarDir "cpolar.exe"
            if (-not (Test-Path $cp)) { Write-Log "未找到 cpolar.exe: $cp，请确认 cpolar 目录完整。" "ERROR"; return }
            Invoke-AsyncCommand -Name "cpolar-http" -Command "http 3000 -region=cn" -FileName $cp -WorkingDir $CpolarDir
            Write-Log "Cpolar HTTP 隧道已启动。点下面的 Cpolar 面板按钮查看公网 URL (http://localhost:4040/)" "INFO"
        } },
    @{ Text = "打开 Cpolar 面板`n查看公网 URL"; Desc = "在浏览器打开 http://localhost:4040/，这是 cpolar 本地面板（cpolar 默认端口），可查看隧道状态和分配的公网链接。"; Color = "120, 120, 140";
       OnClick = { Start-Process "http://localhost:4040/" } },
    @{ Text = "停止所有 Cpolar 隧道"; Desc = "停止所有 cpolar 相关的进程，关闭隧道。"; Color = "180, 95, 95";
       OnClick = { Stop-Job -Name "cpolar-http"; Stop-Job -Name "cpolar-other" } }
)

# ==============================================================================
# ============ 标签页 4b: 通知日志 ============
# ==============================================================================
$tab4bCtx = New-TabPanel -HeaderText "📧  通知日志" -HeaderTagline "邮件通知配置 · 日志查看" -HeaderDesc "本页包含 2 个功能区：① 邮件通知配置（测试/编辑配置/模板/原因映射）  ② 日志查看（看门狗/事件/通知日志）"

Add-SectionCard -TabCtx $tab4bCtx `
    -Title "1. 邮件通知配置" `
    -Subtitle "脚本：tools/ops/ops-notify.ps1" `
    -Description "详细说明：邮件通知用于后端崩溃、看门狗重启、部署成功等事件的告警。必须先在 notify.config.json 配置 SMTP 账号密码才能发送。" `
    -AccentColor $C_PURPLE -Buttons @(
    @{ Text = "发送测试邮件`n验证通知功能"; Desc = "加载 ops-notify.ps1 中的函数并发送一封测试邮件，验证 SMTP 配置是否正确。"; Color = "165, 105, 210";
       OnClick = { Invoke-AsyncCommand -Name "notifytest" -Command ". '$OpsDir\ops-notify.ps1'; Send-TestNotification" -WorkingDir $OpsDir } },
    @{ Text = "编辑通知配置`nnotify.config.json"; Desc = "编辑邮件配置文件，填 SMTP 服务器、端口、发件邮箱、密码/授权码、收件人列表。"; Color = "120, 120, 140";
       OnClick = { Start-Process "notepad.exe" (Join-Path $OpsDir "notify.config.json") } },
    @{ Text = "查看邮件模板`nops-notify-templates.json"; Desc = "查看/编辑各事件的邮件标题和正文模板。"; Color = "120, 120, 140";
       OnClick = { Start-Process "notepad.exe" (Join-Path $OpsDir "ops-notify-templates.json") } },
    @{ Text = "查看原因映射表`nops-notify-reason-map.json"; Desc = "查看/编辑事件代码(如 HEALTH_FAIL/START_FAIL)到具体原因文字的映射。"; Color = "120, 120, 140";
       OnClick = { Start-Process "notepad.exe" (Join-Path $OpsDir "ops-notify-reason-map.json") } },
    @{ Text = "编辑通知脚本源码"; Desc = "用记事本打开 ops-notify.ps1 源码，查看通知发送的核心逻辑。"; Color = "120, 120, 140";
       OnClick = { Start-Process "notepad.exe" (Join-Path $OpsDir "ops-notify.ps1") } },
    @{ Text = "打开通知规范文档"; Desc = "打开 watchdog-notification-and-event-log-spec.md，了解通知系统的设计和字段说明。"; Color = "120, 120, 140";
       OnClick = { Start-Process (Join-Path $ProjectRoot "docs\tech-reports\watchdog-notification-and-event-log-spec.md") } }
)

Add-SectionCard -TabCtx $tab4bCtx `
    -Title "2. 日志查看" `
    -Subtitle "日志位置：tools/ops/*.log" `
    -Description "详细说明：以下三个日志文件会把最后100行内容输出到下方输出区，也可以点 打开ops目录 用编辑器查看完整文件。" `
    -AccentColor $C_ACCENT -Buttons @(
    @{ Text = "查看看门狗日志`n最近100行"; Desc = "显示 watchdog.log 的最后100行。这个日志记录看门狗的每次检查结果。"; Color = "75, 140, 230";
       OnClick = {
            $f = Join-Path $OpsDir "watchdog.log"
            if (Test-Path $f) { Write-Log "===== watchdog.log (最近100行) =====" "CMD"; Get-Content $f -Tail 100 -Encoding UTF8 | ForEach-Object { Write-Log $_ "GRAY" } }
            else { Write-Log "watchdog.log 还不存在。" "WARN" }
        } },
    @{ Text = "查看事件日志`n最近100行"; Desc = "显示 events.log 的最后100行。这个日志记录所有重要事件（启动/停止/崩溃/重启）。"; Color = "75, 140, 230";
       OnClick = {
            $f = Join-Path $OpsDir "events.log"
            if (Test-Path $f) { Write-Log "===== events.log (最近100行) =====" "CMD"; Get-Content $f -Tail 100 -Encoding UTF8 | ForEach-Object { Write-Log $_ "GRAY" } }
            else { Write-Log "events.log 还不存在。" "WARN" }
        } },
    @{ Text = "查看通知日志`n最近100行"; Desc = "显示 notify.log 的最后100行。这个日志记录所有发出的通知邮件。"; Color = "75, 140, 230";
       OnClick = {
            $f = Join-Path $OpsDir "notify.log"
            if (Test-Path $f) { Write-Log "===== notify.log (最近100行) =====" "CMD"; Get-Content $f -Tail 100 -Encoding UTF8 | ForEach-Object { Write-Log $_ "GRAY" } }
            else { Write-Log "notify.log 还不存在。" "WARN" }
        } },
    @{ Text = "在资源管理器打开 ops 目录"; Desc = "打开 tools/ops/ 目录，查看配置、脚本、日志的完整文件。"; Color = "120, 120, 140";
       OnClick = { Start-Process "explorer.exe" $OpsDir } },
    @{ Text = "⚠ 清空所有日志文件"; Desc = "清空 watchdog.log / events.log / notify.log 三个文件的全部内容，无法撤销。"; Color = "180, 95, 95";
       OnClick = {
            $r = [System.Windows.Forms.MessageBox]::Show("确定清空 tools/ops 下的三个日志文件? 内容将永久丢失！", "确认操作", "YesNo", "Warning")
            if ($r -eq "Yes") {
                foreach ($fn in @("watchdog.log", "events.log", "notify.log")) {
                    $p = Join-Path $OpsDir $fn
                    if (Test-Path $p) { Clear-Content $p -Encoding UTF8; Write-Log "已清空: $fn" "OK" }
                }
            }
        } },
    @{ Text = "打开 ops README 文档"; Desc = "打开 tools/ops/README.md，查看运维脚本的详细说明。"; Color = "120, 120, 140";
       OnClick = { Start-Process (Join-Path $OpsDir "README.md") } }
)

# ==============================================================================
# ============ 标签页 5: 部署 ============
# ==============================================================================
$tab5Ctx = New-TabPanel -HeaderText "📦  部署" -HeaderTagline "远程部署 · 回滚 · 服务器环境初始化 · 部署配置" -HeaderDesc "本页包含 2 个功能区：① 部署执行（试运行/正式部署/紧急部署/回滚/初始化/停止）  ② 部署配置和文档（编辑配置/示例/源码/部署指南/检查清单）"

Add-SectionCard -TabCtx $tab5Ctx `
    -Title "1. 部署执行" `
    -Subtitle "脚本：tools/ops/ops-deploy.ps1" `
    -Description "详细说明：部署会通过 SSH 把代码推到远程服务器并执行命令。先编辑配置文件填好服务器信息，再先用 试运行 预演一遍没问题再正式部署。" `
    -AccentColor $C_ACCENT -Buttons @(
    @{ Text = "只做试运行预览`n不真实推送`n推荐先点这个！"; Desc = "执行 ops-deploy.ps1 -DryRun：跑一遍构建、打包、检查等准备步骤，不真实上传和部署，安全预演。"; Color = "75, 140, 230"; Width = $BTN_WIDE_W;
       OnClick = { Invoke-AsyncCommand -Name "deploy" -Command "& '$OpsDir\ops-deploy.ps1' -DryRun" -WorkingDir $ProjectRoot } },
    @{ Text = "正式部署到生产服务器`n完整流程"; Desc = "正式部署流程：测试 → 打包 → SSH上传 → 解压 → 数据库迁移 → 重启服务 → 健康检查。会弹窗确认。"; Color = "85, 180, 110"; Width = $BTN_WIDE_W;
       OnClick = {
            $r = [System.Windows.Forms.MessageBox]::Show("确认要正式部署到远程生产服务器?", "确认部署", "YesNo", "Warning")
            if ($r -eq "Yes") { Invoke-AsyncCommand -Name "deploy" -Command "& '$OpsDir\ops-deploy.ps1'" -WorkingDir $ProjectRoot }
        } },
    @{ Text = "跳过测试紧急部署`n热修复专用"; Desc = "跳过单元测试直接部署。只在紧急热修复时使用，平时不建议跳过测试。"; Color = "225, 145, 80";
       OnClick = {
            $r = [System.Windows.Forms.MessageBox]::Show("确认跳过测试直接部署?", "确认", "YesNo", "Warning")
            if ($r -eq "Yes") { Invoke-AsyncCommand -Name "deploy" -Command "& '$OpsDir\ops-deploy.ps1' -SkipTest" -WorkingDir $ProjectRoot }
        } },
    @{ Text = "回滚到上一个版本"; Desc = "执行 ops-deploy.ps1 -Rollback，把服务器恢复到上一个版本。"; Color = "225, 165, 80";
       OnClick = {
            $r = [System.Windows.Forms.MessageBox]::Show("确认回滚到上一个发布版本?", "确认回滚", "YesNo", "Question")
            if ($r -eq "Yes") { Invoke-AsyncCommand -Name "rollback" -Command "& '$OpsDir\ops-deploy.ps1' -Rollback" -WorkingDir $ProjectRoot }
        } },
    @{ Text = "初始化服务器环境`n配置 JWT 和数据库"; Desc = "执行 ops-deploy.ps1 -InitEnv，在服务器上首次写入 JWT_SECRET 和 DATABASE_URL 等环境配置。"; Color = "165, 105, 210";
       OnClick = { Invoke-AsyncCommand -Name "initenv" -Command "& '$OpsDir\ops-deploy.ps1' -InitEnv" -WorkingDir $ProjectRoot } },
    @{ Text = "停止当前部署任务"; Desc = "停止正在执行的部署、回滚或初始化任务。"; Color = "180, 95, 95";
       OnClick = { Stop-Job -Name "deploy"; Stop-Job -Name "rollback"; Stop-Job -Name "initenv" } }
)

Add-SectionCard -TabCtx $tab5Ctx `
    -Title "2. 部署配置和文档" `
    -Subtitle "配置文件和参考资料" `
    -Description "详细说明：正式部署前必须先编辑 ops-deploy.config.json，填入服务器地址、SSH账号、项目路径等信息。没有的话可以从 example 复制。" `
    -AccentColor $C_GRAY -Buttons @(
    @{ Text = "编辑部署配置`nops-deploy.config.json"; Desc = "编辑部署核心配置。如果文件不存在会提示从 example 文件复制一份。"; Color = "120, 120, 140";
       OnClick = {
            $cfg = Join-Path $OpsDir "ops-deploy.config.json"
            if (-not (Test-Path $cfg)) {
                $r = [System.Windows.Forms.MessageBox]::Show("ops-deploy.config.json 不存在。从示例文件复制一份?", "提示", "YesNo", "Question")
                if ($r -eq "Yes") { Copy-Item (Join-Path $OpsDir "ops-deploy.config.example.json") $cfg } else { return }
            }
            Start-Process "notepad.exe" $cfg
        } },
    @{ Text = "查看配置示例文件"; Desc = "打开 ops-deploy.config.example.json 示例配置，参考各字段填法。"; Color = "120, 120, 140";
       OnClick = { Start-Process "notepad.exe" (Join-Path $OpsDir "ops-deploy.config.example.json") } },
    @{ Text = "编辑部署脚本源码"; Desc = "用记事本打开 ops-deploy.ps1 源码，查看部署的完整流程。"; Color = "120, 120, 140";
       OnClick = { Start-Process "notepad.exe" (Join-Path $OpsDir "ops-deploy.ps1") } },
    @{ Text = "查看部署指南文档"; Desc = "打开 watchdog-deployment-guide.md，详细阅读远程部署的步骤和注意事项。"; Color = "120, 120, 140";
       OnClick = { Start-Process (Join-Path $ProjectRoot "docs\tech-reports\watchdog-deployment-guide.md") } },
    @{ Text = "查看交付检查清单"; Desc = "打开 final-delivery-checklist.md，交付前逐项对照检查。"; Color = "120, 120, 140";
       OnClick = { Start-Process (Join-Path $ProjectRoot "docs\reports\final-delivery-checklist.md") } },
    @{ Text = "打开 ops README"; Desc = "打开 tools/ops/README.md，综合查看运维脚本的说明。"; Color = "120, 120, 140";
       OnClick = { Start-Process (Join-Path $OpsDir "README.md") } }
)

# ==============================================================================
# ============ 标签页 6: 快捷入口 ============
# ==============================================================================
$tab6Ctx = New-TabPanel -HeaderText "📂  快捷入口" -HeaderTagline "文件夹 · 终端 · 浏览器 · 文档" -HeaderDesc "本页包含 2 个功能区：① 打开项目目录（8个目录快捷入口）  ② 终端和浏览器（PowerShell/前端/API/Prisma Studio）"

Add-SectionCard -TabCtx $tab6Ctx `
    -Title "1. 打开项目目录" `
    -Subtitle "在资源管理器中快速打开各类目录" `
    -Description "详细说明：方便你直接去某个目录下看代码、放图片、改配置。" `
    -AccentColor $C_GRAY -ButtonsPerRow 4 -Buttons @(
    @{ Text = "项目根目录"; Desc = "在资源管理器打开整个项目最顶层。"; Color = "120, 120, 140"; Width = $BTN_SMALL_W;
       OnClick = { Start-Process "explorer.exe" $ProjectRoot } },
    @{ Text = "server 后端目录"; Desc = "打开后端代码目录（Node 服务、Prisma schema、路由等）。"; Color = "120, 120, 140"; Width = $BTN_SMALL_W;
       OnClick = { Start-Process "explorer.exe" $ServerDir } },
    @{ Text = "src 前端源码目录"; Desc = "打开前端 src/ 目录（组件、页面、CSS、JS 等前端代码）。"; Color = "120, 120, 140"; Width = $BTN_SMALL_W;
       OnClick = { Start-Process "explorer.exe" (Join-Path $FrontDir "src") } },
    @{ Text = "tools 工具总目录"; Desc = "打开 tools/ 总目录（gui + ops + cpolar 三个子目录）。"; Color = "120, 120, 140"; Width = $BTN_SMALL_W;
       OnClick = { Start-Process "explorer.exe" $ToolsDir } },
    @{ Text = "tests 测试目录"; Desc = "打开前端 tests/ 目录，查看 Jest 测试代码。"; Color = "120, 120, 140"; Width = $BTN_SMALL_W;
       OnClick = { Start-Process "explorer.exe" (Join-Path $FrontDir "tests") } },
    @{ Text = "docs 文档目录"; Desc = "打开 docs/ 目录，查看所有技术报告和文档。"; Color = "120, 120, 140"; Width = $BTN_SMALL_W;
       OnClick = { Start-Process "explorer.exe" (Join-Path $FrontDir "docs") } },
    @{ Text = "cpolar 穿透工具目录"; Desc = "打开 tools/cpolar/ 目录，有 cpolar.exe 主程序。"; Color = "120, 120, 140"; Width = $BTN_SMALL_W;
       OnClick = { Start-Process "explorer.exe" $CpolarDir } },
    @{ Text = "images 图片资源目录"; Desc = "打开项目的图片资源目录。"; Color = "120, 120, 140"; Width = $BTN_SMALL_W;
       OnClick = { Start-Process "explorer.exe" (Join-Path $FrontDir "images") } }
)

Add-SectionCard -TabCtx $tab6Ctx `
    -Title "2. 终端 & 浏览器快速打开" `
    -Subtitle "快速开 PowerShell 终端和浏览器" `
    -Description "详细说明：浏览器相关页面需要先启动后端才能打开。PowerShell 终端直接在指定目录启动。" `
    -AccentColor $C_ACCENT -ButtonsPerRow 4 -Buttons @(
    @{ Text = "PowerShell (根目录)"; Desc = "在项目根目录开一个新的 PowerShell 窗口。"; Color = "75, 140, 230"; Width = $BTN_SMALL_W;
       OnClick = { Start-Process "powershell.exe" -WorkingDirectory $ProjectRoot } },
    @{ Text = "PowerShell (server)"; Desc = "在 server/ 目录开一个新的 PowerShell 窗口（方便直接跑 npm 命令）。"; Color = "75, 140, 230"; Width = $BTN_SMALL_W;
       OnClick = { Start-Process "powershell.exe" -WorkingDirectory $ServerDir } },
    @{ Text = "浏览器: 前端 :3000"; Desc = "打开 http://localhost:3000/ 前端首页。"; Color = "85, 180, 110"; Width = $BTN_SMALL_W;
       OnClick = { Start-Process "http://localhost:3000/" } },
    @{ Text = "浏览器: API文档(自动)"; Desc = "⭐全自动API文档：自动取Token+自动授权+打开Swagger，可直接点Try it out调试接口。"; Color = "85, 180, 110"; Width = $BTN_SMALL_W;
       OnClick = { Open-ApiDocsAuto } },
    @{ Text = "浏览器: Prisma Studio"; Desc = "打开 http://localhost:5555/ Prisma Studio 数据库管理。"; Color = "165, 105, 210"; Width = $BTN_SMALL_W;
       OnClick = { Start-Process "http://localhost:5555/" } },
    @{ Text = "前端入口 index.html"; Desc = "打开项目根目录下的 index.html 文件。"; Color = "85, 180, 110"; Width = $BTN_SMALL_W;
       OnClick = { Start-Process (Join-Path $FrontDir "index.html") } },
    @{ Text = "Markdown: API参考"; Desc = "打开 docs/api/api-reference.md 接口参考文档。"; Color = "120, 120, 140"; Width = $BTN_SMALL_W;
       OnClick = { Start-Process (Join-Path $ProjectRoot "docs\api\api-reference.md") } },
    @{ Text = "Markdown: README"; Desc = "打开项目根目录的 README.md 总说明。"; Color = "120, 120, 140"; Width = $BTN_SMALL_W;
       OnClick = { Start-Process (Join-Path $ProjectRoot "README.md") } }
)

# ==============================================================================
# ============ 标签页 6b: Git & 账号 ============
# ==============================================================================
$tab6bCtx = New-TabPanel -HeaderText "🔐  Git & 账号" -HeaderTagline "分支管理 · Git 操作 · 账号密码管理" -HeaderDesc "本页包含 3 个功能区：① 分支管理与版本切换（查看分支/切分支/快速跳转存档版本）  ② Git 操作和文档（status/log/pull/push/diff + 项目文档）  ③ 账号密码管理（所有账号统一列表+一键复制）"

Add-SectionCard -TabCtx $tab6bCtx -IsBranchCard `
    -Title "1. 分支管理 & 版本切换" `
    -Subtitle "查看分支、下拉选择切换、一键跳转到存档版本" `
    -Description "详细说明：当前主分支为 main（全栈版本，日常开发主线）；archive/v1.0-static-frontend 是纯前端静态网页存档；archive/v1.2-fullstack-gui 是 v1.2 全栈版存档快照。存档分支只读，看完记得切回 main。分支切换前会自动检查未提交改动，提供取消/stash暂存/强制尝试三选一，100% 不会丢失代码。" `
    -AccentColor $C_CYAN -ButtonsPerRow 3 -Buttons @(
    @{ Text = "🔍 查看所有分支`n弹窗+输出区双通道"; Desc = "✅ 推荐：弹窗清晰显示本地/远程分支列表 + 下方输出区详细展示。当前分支高亮。"; Color = "80, 195, 210"; Width = $BTN_SMALL_W;
       OnClick = {
            # 下方输出区显示详细
            Invoke-AsyncCommand -Name "git" -Command "git branch -a" -WorkingDir $ProjectRoot
            # 同时弹窗简洁显示
            $b = Get-GitBranches -RepoDir $ProjectRoot
            $locals = if ($b.LocalBranches.Count -gt 0) { ($b.LocalBranches | ForEach-Object { if ($_ -eq $b.CurrentBranch) { "⭐ $_  （当前）" } else { "  $_" } }) -join "`n" } else { "（无）" }
            $remotes = if ($b.RemoteBranches.Count -gt 0) { ($b.RemoteBranches | ForEach-Object { "🌐 $_" }) -join "`n" } else { "（无）" }
            $dirtyInfo = if ($b.IsClean) { "工作区干净 ✅" } else { "有 $($b.DirtyFiles.Count) 个未提交改动 ⚠️" }
            Show-GuiAlert -Title "Git 分支列表" -Message "当前分支：$($b.CurrentBranch)  ·  $dirtyInfo`n`n【本地分支（共 $($b.LocalBranches.Count) 个）】`n$locals`n`n【远程分支（共 $($b.RemoteBranches.Count) 个）】`n$remotes"
            try { Update-BranchCardLabel } catch {}
       } },
    @{ Text = "📋 当前分支详情`ngit branch -vv"; Desc = "查看每个分支的跟踪远程分支、最后提交哈希和说明。输出显示在下方输出区。"; Color = "80, 195, 210"; Width = $BTN_SMALL_W;
       OnClick = { Invoke-AsyncCommand -Name "git" -Command "git branch -vv" -WorkingDir $ProjectRoot; try { Update-BranchCardLabel } catch {} } },
    @{ Text = "🏷️ 查看所有标签版本`nGit Releases"; Desc = "显示所有历史版本标签（v1.0.0 静态版、v1.2.0 全栈版等），对应 GitHub Releases 页面。"; Color = "80, 195, 210"; Width = $BTN_SMALL_W;
       OnClick = { Invoke-AsyncCommand -Name "git" -Command "git tag -l -n5" -WorkingDir $ProjectRoot } },

    @{ Text = "🔀 切换分支（下拉选择）`n⭐推荐 · 不再手动输入"; Desc = "✅ 推荐方式：弹出下拉框，列出所有本地+远程分支直接选择。切换前自动检查未提交改动，3选1保护代码安全。"; Color = "75, 140, 230"; Width = $BTN_WIDE_W;
       OnClick = {
            $branchName = Show-BranchPicker -Title "切换 Git 分支 - 下拉选择"
            if ([string]::IsNullOrWhiteSpace($branchName)) { return }
            $go = Assert-WorkingTreeClean -RepoDir $ProjectRoot -TargetBranch $branchName
            if (-not $go) { return }
            Write-Log "[Git] 🔀 切换分支 → $branchName" "CMD"
            $out = (& git -C $ProjectRoot checkout $branchName 2>&1)
            $exitCode = $LASTEXITCODE
            Write-Log ($out -join "`n") "GRAY"
            if ($exitCode -eq 0) {
                Write-Log "[Git] ✅ 切换成功！当前分支：$branchName" "OK"
                if ($branchName -like "archive/*") {
                    Show-GuiAlert -Title "✅ 已切换到存档分支" -Message "已切换到：$branchName`n`n⚠️ 这是只读历史存档版本，仅供查阅代码。`n请不要在此分支做任何修改或提交！`n看完后请点击【快速切回 main 主分支】按钮回到开发主线。" -Kind Warning
                } else {
                    Show-GuiAlert -Title "✅ 分支切换成功" -Message "已成功切换到分支：$branchName"
                }
            } else {
                Write-Log "[Git] ❌ 切换失败（退出码 $exitCode），请查看上方输出详情" "ERROR"
                Show-GuiAlert -Title "❌ 切换失败" -Message "切换到 '$branchName' 失败！`n`n常见原因：`n  • 有冲突的未提交改动（用 stash 暂存或 commit 后再切）`n  • 远程分支格式错误`n  • 分支名不存在`n`n请查看下方输出区的详细 git 错误信息。" -Kind Error
            }
            try { Update-BranchCardLabel } catch {}
       } },
    @{ Text = "🌿 快速切回 main 主分支`n⭐日常开发主线"; Desc = "一键切换回 main 主分支（全栈版本）。切换前自动检查未提交改动，保护代码安全。"; Color = "88, 196, 124"; Width = $BTN_WIDE_W;
       OnClick = {
            $b = Get-GitBranches -RepoDir $ProjectRoot
            if ($b.CurrentBranch -eq "main") {
                Show-GuiAlert -Title "已在 main 分支" -Message "您当前就处于 main 主分支，无需切换。`n`n当前状态：$(if ($b.IsClean) {'干净 ✅'} else {"有 $($b.DirtyFiles.Count) 个改动 ⚠️"})"
                try { Update-BranchCardLabel } catch {}
                return
            }
            $go = Assert-WorkingTreeClean -RepoDir $ProjectRoot -TargetBranch "main"
            if (-not $go) { return }
            $r = [System.Windows.Forms.MessageBox]::Show("确认切换回 main 主分支？", "确认切回 main", "YesNo", "Question")
            if ($r -ne "Yes") { return }
            Write-Log "[Git] 🌿 切回 main 主分支..." "CMD"
            $out = (& git -C $ProjectRoot checkout main 2>&1)
            $exitCode = $LASTEXITCODE
            Write-Log ($out -join "`n") "GRAY"
            if ($exitCode -eq 0) {
                Write-Log "[Git] ✅ 已回到 main 主分支（日常开发主线）" "OK"
                Show-GuiAlert -Title "✅ 已回到 main 主分支" -Message "成功切回 main（全栈版本·日常开发主线）。可以继续开发啦！"
            } else {
                Write-Log "[Git] ❌ 切换失败（退出码 $exitCode）" "ERROR"
                Show-GuiAlert -Title "❌ 切回 main 失败" -Message "切换失败，请查看下方输出区的详细错误信息。" -Kind Error
            }
            try { Update-BranchCardLabel } catch {}
       } },
    @{ Text = "🔄 刷新当前分支显示`n同步卡片顶部标签"; Desc = "手动刷新本卡片顶部显眼的当前分支大标签（颜色区分分支类型、干净/脏状态）。切换分支后会自动刷新，此按钮用于手动同步。"; Color = "110, 170, 190"; Width = $BTN_SMALL_W;
       OnClick = {
            try {
                Update-BranchCardLabel
                Write-Log "[Git] 🔄 分支显示已刷新" "OK"
                $b = Get-GitBranches
                Show-GuiAlert -Title "已刷新" -Message "当前分支：$($b.CurrentBranch)`n状态：$(if ($b.IsClean) {'工作区干净 ✅'} else {"有 $($b.DirtyFiles.Count) 个未提交改动 ⚠️"})"
            } catch {
                Show-GuiAlert -Title "刷新失败" -Message "读取 Git 信息失败：$($_.Exception.Message)" -Kind Error
            }
       } },

    @{ Text = "📦 查看 v1.0 存档版`n静态网页纯前端"; Desc = "切换到 archive/v1.0-static-frontend（只读历史存档）：项目初期纯前端静态网页，无后端、无GUI工具。切换前自动检查改动。看完记得切回 main。"; Color = "120, 120, 140"; Width = $BTN_SMALL_W;
       OnClick = {
            $target = "archive/v1.0-static-frontend"
            $b = Get-GitBranches -RepoDir $ProjectRoot
            if ($b.CurrentBranch -eq $target) { Show-GuiAlert -Title "已在该分支" -Message "您当前已经在 $target 分支。"; return }
            $go = Assert-WorkingTreeClean -RepoDir $ProjectRoot -TargetBranch $target
            if (-not $go) { return }
            $r = [System.Windows.Forms.MessageBox]::Show("确认切换到存档分支 '$target'？`n`n这是只读历史版本：项目初期纯前端静态网页（无后端、无GUI工具）。`n⚠️ 不要在此分支提交代码！看完请切回 main。", "查看存档 v1.0 - 确认", "YesNo", "Warning")
            if ($r -ne "Yes") { return }
            Write-Log "[Git] 📦 切换到存档分支 $target" "CMD"
            $out = (& git -C $ProjectRoot checkout $target 2>&1)
            $exitCode = $LASTEXITCODE
            Write-Log ($out -join "`n") "GRAY"
            if ($exitCode -eq 0) {
                Write-Log "[Git] ✅ 已切换到 v1.0 存档版（静态网页）" "OK"
                Show-GuiAlert -Title "✅ 已切换到 v1.0 存档版" -Message "已切换到：archive/v1.0-static-frontend`n`n📌 这是只读历史存档版本：`n  • 项目初期纯前端静态网页`n  • 无后端服务、无 GUI 工具`n  • 不要在此分支做修改/提交`n`n看完后点【快速切回 main 主分支】回到开发主线。" -Kind Warning
            } else {
                Write-Log "[Git] ❌ 切换失败（退出码 $exitCode）" "ERROR"
                Show-GuiAlert -Title "❌ 切换失败" -Message "切换失败，请查看下方输出区错误信息。" -Kind Error
            }
            try { Update-BranchCardLabel } catch {}
       } },
    @{ Text = "📦 查看 v1.2 存档版`n全栈版本快照"; Desc = "切换到 archive/v1.2-fullstack-gui（只读历史存档）：v1.2 全栈版本永久快照，含后端+GUI+运维工具链。切换前自动检查改动。看完记得切回 main。"; Color = "120, 120, 140"; Width = $BTN_SMALL_W;
       OnClick = {
            $target = "archive/v1.2-fullstack-gui"
            $b = Get-GitBranches -RepoDir $ProjectRoot
            if ($b.CurrentBranch -eq $target) { Show-GuiAlert -Title "已在该分支" -Message "您当前已经在 $target 分支。"; return }
            $go = Assert-WorkingTreeClean -RepoDir $ProjectRoot -TargetBranch $target
            if (-not $go) { return }
            $r = [System.Windows.Forms.MessageBox]::Show("确认切换到存档分支 '$target'？`n`n这是只读历史版本：v1.2 全栈版永久存档快照（含后端+GUI+运维）。`n⚠️ 不要在此分支提交代码！看完请切回 main。", "查看存档 v1.2 - 确认", "YesNo", "Warning")
            if ($r -ne "Yes") { return }
            Write-Log "[Git] 📦 切换到存档分支 $target" "CMD"
            $out = (& git -C $ProjectRoot checkout $target 2>&1)
            $exitCode = $LASTEXITCODE
            Write-Log ($out -join "`n") "GRAY"
            if ($exitCode -eq 0) {
                Write-Log "[Git] ✅ 已切换到 v1.2 存档版（全栈快照）" "OK"
                Show-GuiAlert -Title "✅ 已切换到 v1.2 存档版" -Message "已切换到：archive/v1.2-fullstack-gui`n`n📌 这是只读历史存档版本：`n  • v1.2 全栈版本永久快照`n  • 含后端 API + GUI 控制台 + 运维工具链`n  • 不要在此分支做修改/提交`n`n看完后点【快速切回 main 主分支】回到开发主线。" -Kind Warning
            } else {
                Write-Log "[Git] ❌ 切换失败（退出码 $exitCode）" "ERROR"
                Show-GuiAlert -Title "❌ 切换失败" -Message "切换失败，请查看下方输出区错误信息。" -Kind Error
            }
            try { Update-BranchCardLabel } catch {}
       } },
    @{ Text = "➕ 新建功能分支并切换`ngit checkout -b"; Desc = "基于当前分支新建 feature/xxx 或 fix/xxx 功能分支，并自动切换过去。切换前自动检查当前改动状态。"; Color = "175, 110, 220"; Width = $BTN_SMALL_W;
       OnClick = {
            $curBranch = (& git -C $ProjectRoot rev-parse --abbrev-ref HEAD 2>&1)
            $defaultName = "feature/new-feature"
            $branchName = Show-InputBox -Title "新建功能分支" -Prompt "基于当前分支 '$curBranch' 新建功能分支，`n请输入新分支名：`n（建议格式：feature/功能名  或  fix/修复描述）" -DefaultValue $defaultName
            if ([string]::IsNullOrWhiteSpace($branchName)) { return }
            $go = Assert-WorkingTreeClean -RepoDir $ProjectRoot -TargetBranch "(新建)$branchName"
            if (-not $go) { return }
            $r = [System.Windows.Forms.MessageBox]::Show("确认基于当前分支 '$curBranch'`n新建分支 '$branchName' 并切换过去？", "新建功能分支 - 确认", "YesNo", "Question")
            if ($r -ne "Yes") { return }
            Write-Log "[Git] ➕ 新建分支 $branchName 并切换" "CMD"
            $out = (& git -C $ProjectRoot checkout -b $branchName 2>&1)
            $exitCode = $LASTEXITCODE
            Write-Log ($out -join "`n") "GRAY"
            if ($exitCode -eq 0) {
                Write-Log "[Git] ✅ 已创建并切换到新分支：$branchName" "OK"
                Show-GuiAlert -Title "✅ 新分支创建成功" -Message "已成功创建并切换到：$branchName`n`n基于：$curBranch`n`n现在可以在这个分支上开发新功能啦！"
            } else {
                Write-Log "[Git] ❌ 创建失败（退出码 $exitCode）" "ERROR"
                Show-GuiAlert -Title "❌ 新建分支失败" -Message "创建失败，可能分支名已存在或格式有误。请查看下方输出区详细错误。" -Kind Error
            }
            try { Update-BranchCardLabel } catch {}
       } }
)

Add-SectionCard -TabCtx $tab6bCtx `
    -Title "2. Git 操作 & 项目文档" `
    -Subtitle "常用 Git 命令和关键文档" `
    -Description "详细说明：Git 命令在项目根目录执行，输出会显示在下方输出区。push 前会弹窗确认，避免误推送。" `
    -AccentColor $C_WARN -ButtonsPerRow 4 -Buttons @(
    @{ Text = "git status 查看状态"; Desc = "查看当前仓库的文件修改状态、当前分支名等。"; Color = "225, 165, 80"; Width = $BTN_SMALL_W;
       OnClick = { Invoke-AsyncCommand -Name "git" -Command "git status" -WorkingDir $ProjectRoot } },
    @{ Text = "git log 最近10条"; Desc = "查看最近 10 条提交记录（含变更文件统计、简短说明）。"; Color = "225, 165, 80"; Width = $BTN_SMALL_W;
       OnClick = { Invoke-AsyncCommand -Name "git" -Command "git log -n 10 --stat --oneline" -WorkingDir $ProjectRoot } },
    @{ Text = "git pull 拉取更新"; Desc = "从远程仓库拉取最新提交到本地。"; Color = "225, 165, 80"; Width = $BTN_SMALL_W;
       OnClick = { Invoke-AsyncCommand -Name "git" -Command "git pull" -WorkingDir $ProjectRoot } },
    @{ Text = "git push 推送提交"; Desc = "把本地的提交推送到远程仓库。会弹窗确认。"; Color = "225, 165, 80"; Width = $BTN_SMALL_W;
       OnClick = {
            $r = [System.Windows.Forms.MessageBox]::Show("确认把本地提交推送到远程仓库?", "确认", "YesNo", "Question")
            if ($r -eq "Yes") { Invoke-AsyncCommand -Name "git" -Command "git push" -WorkingDir $ProjectRoot }
        } },
    @{ Text = "git diff 查看差异"; Desc = "查看当前工作区代码与上次提交的差异内容。"; Color = "225, 165, 80"; Width = $BTN_SMALL_W;
       OnClick = { Invoke-AsyncCommand -Name "git" -Command "git diff" -WorkingDir $ProjectRoot } },
    @{ Text = "CHANGELOG 变更日志"; Desc = "打开 CHANGELOG.md，查看项目历史版本的改动说明。"; Color = "120, 120, 140"; Width = $BTN_SMALL_W;
       OnClick = { Start-Process (Join-Path $ProjectRoot "CHANGELOG.md") } },
    @{ Text = "开发计划文档"; Desc = "打开 docs/development/development-plan.md，看项目开发计划。"; Color = "120, 120, 140"; Width = $BTN_SMALL_W;
       OnClick = { Start-Process (Join-Path $ProjectRoot "docs\development\development-plan.md") } },
    @{ Text = "税务计算规则"; Desc = "打开 docs/guides/tax-calculation-rules.md，查看计税规则。"; Color = "120, 120, 140"; Width = $BTN_SMALL_W;
       OnClick = { Start-Process (Join-Path $ProjectRoot "docs\guides\tax-calculation-rules.md") } }
)

Add-SectionCard -TabCtx $tab6bCtx `
    -Title "3. 账号 & 密码管理" `
    -Subtitle "所有需要登录/认证的账号密码统一列表（点击按钮可复制到剪贴板）" `
    -Description "详细说明：本项目开发环境涉及多种账号和密码，统一整理在此方便查阅。生产环境请自行替换为强密码。所有密码仅限本人使用，请勿外传。" `
    -AccentColor $C_PURPLE -ButtonsPerRow 3 -Buttons @(
    @{ Text = "👤 项目登录账号`ndev@example.com"; Desc = "前端登录用邮箱。启动后端后用此账号登录前端页面 http://localhost:3000/。点击复制。"; Color = "165, 105, 210"; Width = $BTN_WIDE_W;
       OnClick = { Set-Clipboard -Value "dev@example.com"; Write-Log "[账号] 已复制登录邮箱 dev@example.com 到剪贴板" "OK" } },
    @{ Text = "🔑 项目登录密码`npassword"; Desc = "前端登录用密码。默认测试密码为 password。可在 数据库→重置账号 功能重置。点击复制。"; Color = "165, 105, 210"; Width = $BTN_WIDE_W;
       OnClick = { Set-Clipboard -Value "password"; Write-Log "[账号] 已复制登录密码 password 到剪贴板" "OK" } },
    @{ Text = "📋 一键复制登录信息`n邮箱+密码"; Desc = "同时复制邮箱和密码，格式：dev@example.com / password，方便你直接粘贴。"; Color = "140, 90, 190"; Width = $BTN_WIDE_W;
       OnClick = { Set-Clipboard -Value "dev@example.com / password"; Write-Log "[账号] 已复制登录信息 dev@example.com / password 到剪贴板" "OK" } },
    @{ Text = "🔐 JWT Secret Key`ndev-secret-key..."; Desc = "后端 JWT 签名密钥，位于 server/.env。开发用：dev-secret-key-change-in-production。生产环境必须替换为强密钥！"; Color = "140, 90, 190"; Width = $BTN_WIDE_W;
       OnClick = { Start-Process (Join-Path $ServerDir ".env") } },
    @{ Text = "📧 QQ邮箱授权码`nSMTP邮件通知"; Desc = "看门狗邮件通知用的 QQ 邮箱授权码（非登录密码）。配置文件：tools/ops/notify.config.json。点击打开配置。"; Color = "140, 90, 190"; Width = $BTN_WIDE_W;
       OnClick = { Start-Process (Join-Path $ToolsDir "ops\notify.config.json") } },
    @{ Text = "🌐 Cpolar Token`n内网穿透授权"; Desc = "公网分享用的 cpolar authtoken。需自行注册 cpolar 账号获取。配置命令：cpolar authtoken <你的token>。"; Color = "140, 90, 190"; Width = $BTN_WIDE_W;
       OnClick = { Invoke-AsyncCommand -Name "cpolar" -Command "& '$CpolarDir\cpolar.exe' authtoken" -WorkingDir $CpolarDir } },
    @{ Text = "🔑 获取 Bearer Token`n登录API自动获取"; Desc = "自动用 dev@example.com/password 调用登录API获取JWT Token，复制到剪贴板并显示在输出区。Token有效期1小时，过期后重新点此按钮获取。"; Color = "165, 105, 210"; Width = $BTN_WIDE_W;
       OnClick = {
            Write-Log "[Token] 正在调用登录API获取 Bearer Token..." "INFO"
            try {
                $loginBody = @{ email = "dev@example.com"; password = "password" } | ConvertTo-Json
                $resp = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" -Method POST -ContentType "application/json" -Body $loginBody -TimeoutSec 10
                if ($resp.success -and $resp.data.token) {
                    $token = $resp.data.token
                    Set-Clipboard -Value $token
                    Write-Log "[Token] ✅ 获取成功！已复制到剪贴板" "OK"
                    Write-Log "[Token] 用户: $($resp.data.user.email)  ID: $($resp.data.user.id)" "GRAY"
                    Write-Log "[Token] Token (前50字符): $($token.Substring(0, [Math]::Min(50, $token.Length)))..." "GRAY"
                    Write-Log "[Token] 完整Token已复制到剪贴板，可直接粘贴到 Swagger Authorize 对话框" "INFO"
                    Write-Log "[Token] 用法: Bearer $token" "GRAY"
                    Write-Log "[Token] 有效期: 1小时，过期后重新点此按钮获取" "GRAY"
                } else {
                    Write-Log "[Token] ❌ 登录返回失败: $($resp | ConvertTo-Json)" "ERROR"
                }
            } catch {
                $errMsg = $_.Exception.Message
                if ($errMsg -match "Unable to connect|拒绝连接|Connection refused") {
                    Write-Log "[Token] ❌ 无法连接后端，请先在【启动管理】启动后端服务" "ERROR"
                } else {
                    Write-Log "[Token] ❌ 获取失败: $errMsg" "ERROR"
                }
            }
       } },
    @{ Text = "🚀 一键查看API文档（全自动）`n自动授权 · 直接Try it out`n⭐推荐"; Desc = "⭐真正的一键：检查后端→自动用dev@example.com登录→取JWT→生成自定义Swagger页面→浏览器打开→自动点Authorize+Close。打开后不用手动点任何授权按钮，直接展开接口就能点Try it out执行！（其他入口的API文档按钮都是这个全自动流程）"; Color = "85, 155, 95"; Width = $BTN_WIDE_W;
       OnClick = { Open-ApiDocsAuto } },
    @{ Text = "🖥 部署 SSH 配置`n远程服务器"; Desc = "正式部署时的 SSH 账号密码，配置文件：tools/ops/ops-deploy.config.json。从 ops-deploy.config.example.json 复制模板后填写。"; Color = "140, 90, 190"; Width = $BTN_WIDE_W;
       OnClick = { Start-Process (Join-Path $ToolsDir "ops\ops-deploy.config.example.json") } },
    @{ Text = "📖 查看完整账号文档`n账号管理说明"; Desc = "打开 docs/admin/account-credentials.md 查看所有账号的详细说明、获取方式、安全注意事项。"; Color = "120, 120, 140"; Width = $BTN_WIDE_W;
       OnClick = { Start-Process (Join-Path $ProjectRoot "docs\admin\account-credentials.md") } }
)

# ==============================================================================
# 连接标签页面板到操作区
# ==============================================================================
$tabHost = New-Object System.Windows.Forms.Panel
$tabHost.Dock = "Fill"
$tabHost.BackColor = $C_BG_FORM

$script:TabPanels = @{
    "启动管理"   = $tab1Ctx.Panel
    "数据库"     = $tab2Ctx.Panel
    "测试中心"   = $tab3Ctx.Panel
    "运维监控"   = $tab4Ctx.Panel
    "通知日志"   = $tab4bCtx.Panel
    "部署"       = $tab5Ctx.Panel
    "快捷入口"   = $tab6Ctx.Panel
    "Git & 账号" = $tab6bCtx.Panel
}
$script:TabCtxMap = @{
    "启动管理"   = $tab1Ctx
    "数据库"     = $tab2Ctx
    "测试中心"   = $tab3Ctx
    "运维监控"   = $tab4Ctx
    "通知日志"   = $tab4bCtx
    "部署"       = $tab5Ctx
    "快捷入口"   = $tab6Ctx
    "Git & 账号" = $tab6bCtx
}
foreach ($p in $script:TabPanels.Values) {
    $p.Visible = $false
    $tabHost.Controls.Add($p)
}
$script:TabPanels["启动管理"].Visible = $true
$rightSplit.Panel1.Controls.Add($tabHost)

# ==============================================================================
# 输出区 (底部)
# ==============================================================================
$outputOuter = New-Object System.Windows.Forms.Panel
$outputOuter.Dock = "Fill"
$outputOuter.BackColor = $C_BG_FORM
$outputOuter.Padding = New-Object System.Windows.Forms.Padding(2, 2, 2, 0)

$outputBox = New-Object System.Windows.Forms.RichTextBox
$outputBox.Dock = "Fill"
$outputBox.BackColor = $C_BG_DARK
$outputBox.ForeColor = $C_FG
$outputBox.Font = $F_LOG
$outputBox.ReadOnly = $true
$outputBox.BorderStyle = "None"
# 保留原生垂直滚动条（滚轮/键盘需要它生成滚动信号/能滚到底，视觉上由 7px overlay 细条盖在它上面）
$outputBox.ScrollBars = "ForcedVertical"
$script:OutputBox = $outputBox

$outputBar = New-Object System.Windows.Forms.FlowLayoutPanel
$outputBar.Dock = "Bottom"
$outputBar.Height = 48
# 工具栏背景色改为 $C_BG_L1
$outputBar.BackColor = $C_BG_L1
$outputBar.FlowDirection = "LeftToRight"
$outputBar.WrapContents = $true
$outputBar.Padding = New-Object System.Windows.Forms.Padding(8, 8, 8, 8)
$outputBar.AutoScroll = $true

function New-OutBtn {
    param([string]$Text, [string]$Color = "120, 120, 140", [scriptblock]$OnClick, [int]$W = 112)
    $b = New-Object System.Windows.Forms.Button
    $b.Text = $Text
    # 按钮高度统一 30px
    $b.Size = New-Object System.Drawing.Size($W, 30)
    $b.FlatStyle = "Flat"
    $b.FlatAppearance.BorderSize = 0
    $c = $Color.Split(',')
    $b.BackColor = [System.Drawing.Color]::FromArgb([int]$c[0], [int]$c[1], [int]$c[2])
    $b.ForeColor = $C_FG
    $b.Font = New-Object System.Drawing.Font("Microsoft YaHei UI", 9)
    $b.Cursor = "Hand"
    $b.Margin = New-Object System.Windows.Forms.Padding(0, 0, 6, 0)
    if ($OnClick) { $b.Add_Click($OnClick) }
    return $b
}

# 输出区自动滚动开关 (v3.4 新增)：OFF 时 outHandler/errHandler/Write-Log 不调 ScrollToCaret
$script:AutoScroll = $true

# "📋 输出日志" 标签 (工具栏左侧)
$obTitleLabel = New-Object System.Windows.Forms.Label
$obTitleLabel.Text = "📋 输出日志"
$obTitleLabel.Font = New-Object System.Drawing.Font("Microsoft YaHei UI", 9, [System.Drawing.FontStyle]::Bold)
$obTitleLabel.ForeColor = $C_FG_MUTED
$obTitleLabel.AutoSize = $true
$obTitleLabel.Margin = New-Object System.Windows.Forms.Padding(0, 6, 12, 0)

$obClear = New-OutBtn -Text "🗑 清空输出" -Color "125, 70, 70" -W 104 -OnClick { $script:OutputBox.Clear() }
$obSave  = New-OutBtn -Text "💾 保存日志" -Color "85, 85, 105" -W 104 -OnClick {
    $sfd = New-Object System.Windows.Forms.SaveFileDialog
    $sfd.Filter = "文本文件 (*.txt)|*.txt|所有文件 (*.*)|*.*"
    $sfd.FileName = "euriskotax-log-$(Get-Date -Format 'yyyyMMdd-HHmmss').txt"
    try {
        if ($sfd.ShowDialog() -eq "OK") {
            $script:OutputBox.SaveFile($sfd.FileName, [System.Windows.Forms.RichTextBoxStreamType]::PlainText)
            Write-Log "日志已保存到 $($sfd.FileName)" "OK"
        }
    } finally {
        $sfd.Dispose()
    }
}
$obCopy  = New-OutBtn -Text "📋 复制输出" -Color "85, 85, 105" -W 104 -OnClick {
    $script:OutputBox.SelectAll()
    $script:OutputBox.Copy()
    $script:OutputBox.SelectionLength = 0
    Write-Log "输出已复制到剪贴板" "OK"
}
$obFront = New-OutBtn -Text "🌐 打开前端" -Color "85, 180, 110" -W 104 -OnClick {
    Start-Process "http://localhost:3000/"
    Write-Log "已打开前端 http://localhost:3000/" "INFO"
}
$obApi   = New-OutBtn -Text "📚 API文档(自动)" -Color "85, 180, 110" -W 128 -OnClick {
    Open-ApiDocsAuto
}
$obGuide = New-OutBtn -Text "❓ 按钮说明" -Color "225, 165, 80" -W 104 -OnClick {
    $msg = "【快速启动项目怎么点？】`n`n" + `
           "① 第一次启动 / 升级代码后 → 点【第一次用：一键启动（安装依赖+重置账号）】`n" + `
           "   会自动装依赖并重置测试账号，启动会慢一点，但最稳。`n`n" + `
           "② 之前已经成功启动过 → 点【日常启动：跳过检查，快速启动】`n" + `
           "   跳过安装和重置，速度快很多。`n`n" + `
           "③ 启动成功后，底部状态会显示 ● 运行中，`n" + `
           "   然后点【打开前端 http://localhost:3000/】去玩！`n`n" + `
           "登录：dev@example.com  /  password`n`n" + `
           "鼠标悬停任何按钮都有详细说明。"
    [System.Windows.Forms.MessageBox]::Show($msg, "按钮使用说明", "OK", "Information")
}

# 自动滚动切换按钮 (v3.4 新增)
$obAutoScroll = New-OutBtn -Text "🔄 自动滚动: ON" -Color "85, 85, 105" -W 130 -OnClick {
    $script:AutoScroll = -not $script:AutoScroll
    if ($script:AutoScroll) {
        $obAutoScroll.Text = "🔄 自动滚动: ON"
        Write-Log "已开启自动滚动 (新输出会自动滚到底部)" "INFO"
    } else {
        $obAutoScroll.Text = "🔄 自动滚动: OFF"
        Write-Log "已关闭自动滚动 (可向上滚动查看历史，新输出不会强制拉到底部)" "WARN"
    }
}

# 输出区搜索框 (v3.4 新增)
$obSearchBox = New-Object System.Windows.Forms.TextBox
$obSearchBox.Size = New-Object System.Drawing.Size(160, 30)
$obSearchBox.Font = New-Object System.Drawing.Font("Microsoft YaHei UI", 9)
$obSearchBox.BackColor = $C_BG_DARK
$obSearchBox.ForeColor = $C_FG
$obSearchBox.BorderStyle = "FixedSingle"
$obSearchBox.Text = "搜索输出..."
$obSearchBox.Margin = New-Object System.Windows.Forms.Padding(0, 0, 6, 0)
$obSearchBox.Add_Enter({
    if ($obSearchBox.Text -eq "搜索输出...") { $obSearchBox.Text = "" }
})
$obSearchBox.Add_Leave({
    if ([string]::IsNullOrWhiteSpace($obSearchBox.Text)) { $obSearchBox.Text = "搜索输出..." }
})
$obSearchBox.Add_KeyDown({
    param($s, $e)
    if ($e.KeyCode -eq [System.Windows.Forms.Keys]::Enter) {
        $keyword = $obSearchBox.Text.Trim()
        if ([string]::IsNullOrWhiteSpace($keyword)) { return }
        $idx = $script:OutputBox.Find($keyword, $script:OutputBox.SelectionStart + 1, [System.Windows.Forms.RichTextBoxFinds]::None)
        if ($idx -ge 0) {
            $script:OutputBox.Select($idx, $keyword.Length)
            $script:OutputBox.ScrollToCaret()
            $script:OutputBox.SelectionBackColor = [System.Drawing.Color]::FromArgb(80, 80, 30)
            $script:OutputBox.SelectionColor = [System.Drawing.Color]::Yellow
        } else {
            # 从头搜索
            $idx2 = $script:OutputBox.Find($keyword, 0, [System.Windows.Forms.RichTextBoxFinds]::None)
            if ($idx2 -ge 0) {
                $script:OutputBox.Select($idx2, $keyword.Length)
                $script:OutputBox.ScrollToCaret()
            } else {
                [System.Windows.Forms.MessageBox]::Show("未找到匹配: $keyword", "搜索结果", "OK", "Information")
            }
        }
        $e.SuppressKeyPress = $true
    }
})

$outputBar.Controls.Add($obTitleLabel)
$outputBar.Controls.Add($obClear)
$outputBar.Controls.Add($obSave)
$outputBar.Controls.Add($obCopy)
$outputBar.Controls.Add($obFront)
$outputBar.Controls.Add($obApi)
$outputBar.Controls.Add($obGuide)
$outputBar.Controls.Add($obAutoScroll)
$outputBar.Controls.Add($obSearchBox)

$outputOuter.Controls.Add($outputBox)
$outputOuter.Controls.Add($outputBar)
# 为输出区添加覆盖式滚动条（outputBox 已加入 outputOuter，Parent 已就绪）
$null = New-ScrollbarOverlay -Target $outputBox -IsRichTextBox $true
$rightSplit.Panel2.Controls.Add($outputOuter)

# ==============================================================================
# 定时器 (每秒更新状态栏)
# ==============================================================================
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 1000
$timer.Add_Tick({
    Update-StatusBar
})
$timer.Start()

# ==============================================================================
# Ctrl+K 快捷搜索标签页 (v3.4 新增)
# 按 Ctrl+K 弹出输入框，输入关键词后切换到包含该关键词的第一个标签页
# ==============================================================================
$form.KeyPreview = $true
$form.Add_KeyDown({
    param($s, $e)
    if ($e.Control -and $e.KeyCode -eq [System.Windows.Forms.Keys]::K) {
        # 弹出自定义输入对话框
        $searchForm = New-Object System.Windows.Forms.Form
        $searchForm.Text = "快捷搜索标签页 (Ctrl+K)"
        $searchForm.Size = New-Object System.Drawing.Size(380, 180)
        $searchForm.StartPosition = "CenterParent"
        $searchForm.FormBorderStyle = "FixedDialog"
        $searchForm.MaximizeBox = $false
        $searchForm.MinimizeBox = $false
        $searchForm.BackColor = $C_BG_L2
        $searchForm.ForeColor = $C_FG
        $searchForm.KeyPreview = $true

        $promptLabel = New-Object System.Windows.Forms.Label
        $promptLabel.Text = "输入关键词 (匹配标签页名/图标)："
        $promptLabel.Font = $F_SUBTITLE
        $promptLabel.ForeColor = $C_FG_MUTED
        $promptLabel.Location = New-Object System.Drawing.Point(16, 16)
        $promptLabel.AutoSize = $true
        $searchForm.Controls.Add($promptLabel)

        $hintLabel = New-Object System.Windows.Forms.Label
        $hintLabel.Text = "可用标签：启动管理 / 数据库 / 测试中心 / 运维监控 / 通知日志 / 部署 / 快捷入口 / Git & 账号"
        $hintLabel.Font = New-Object System.Drawing.Font("Microsoft YaHei UI", 8.25)
        $hintLabel.ForeColor = $C_FG_DIM
        $hintLabel.Location = New-Object System.Drawing.Point(16, 130)
        $hintLabel.AutoSize = $true
        $searchForm.Controls.Add($hintLabel)

        $inputBox = New-Object System.Windows.Forms.TextBox
        $inputBox.Location = New-Object System.Drawing.Point(16, 44)
        $inputBox.Size = New-Object System.Drawing.Size(340, 28)
        $inputBox.Font = New-Object System.Drawing.Font("Microsoft YaHei UI", 11)
        $inputBox.BackColor = $C_BG_DARK
        $inputBox.ForeColor = $C_FG
        $inputBox.BorderStyle = "FixedSingle"
        $searchForm.Controls.Add($inputBox)

        $cancelBtn = New-Object System.Windows.Forms.Button
        $cancelBtn.Text = "取消 (Esc)"
        $cancelBtn.Location = New-Object System.Drawing.Point(16, 86)
        $cancelBtn.Size = New-Object System.Drawing.Size(160, 32)
        $cancelBtn.FlatStyle = "Flat"
        $cancelBtn.FlatAppearance.BorderSize = 1
        $cancelBtn.FlatAppearance.BorderColor = $C_BORDER
        $cancelBtn.BackColor = $C_BG_BTN
        $cancelBtn.ForeColor = $C_FG
        $cancelBtn.Cursor = "Hand"
        $searchForm.Controls.Add($cancelBtn)

        $okBtn = New-Object System.Windows.Forms.Button
        $okBtn.Text = "切换到匹配 (Enter)"
        $okBtn.Location = New-Object System.Drawing.Point(196, 86)
        $okBtn.Size = New-Object System.Drawing.Size(160, 32)
        $okBtn.FlatStyle = "Flat"
        $okBtn.FlatAppearance.BorderSize = 1
        $okBtn.FlatAppearance.BorderColor = $C_ACCENT
        $okBtn.BackColor = $C_ACCENT
        $okBtn.ForeColor = $C_FG
        $okBtn.Cursor = "Hand"
        $searchForm.Controls.Add($okBtn)

        # 用 hashtable 在闭包间传递结果
        $searchResult = @{ Keyword = ""; Confirmed = $false }

        $okAction = {
            $kw = $inputBox.Text.Trim()
            if (-not [string]::IsNullOrWhiteSpace($kw)) {
                $searchResult.Keyword = $kw
                $searchResult.Confirmed = $true
            }
            $searchForm.Close()
        }
        $okBtn.Add_Click($okAction)
        $cancelBtn.Add_Click({ $searchForm.Close() })

        # 输入框键盘事件：Enter 确认 / Esc 取消
        $inputBox.Add_KeyDown({
            param($s2, $e2)
            if ($e2.KeyCode -eq [System.Windows.Forms.Keys]::Enter) {
                $kw = $inputBox.Text.Trim()
                if (-not [string]::IsNullOrWhiteSpace($kw)) {
                    $searchResult.Keyword = $kw
                    $searchResult.Confirmed = $true
                }
                $searchForm.Close()
                $e2.SuppressKeyPress = $true
            } elseif ($e2.KeyCode -eq [System.Windows.Forms.Keys]::Escape) {
                $searchForm.Close()
                $e2.SuppressKeyPress = $true
            }
        })
        # 对话框级 Esc 处理
        $searchForm.Add_KeyDown({
            param($s2, $e2)
            if ($e2.KeyCode -eq [System.Windows.Forms.Keys]::Escape) {
                $searchForm.Close()
                $e2.SuppressKeyPress = $true
            }
        })

        $searchForm.AcceptButton = $okBtn
        $searchForm.CancelButton = $cancelBtn
        try {
            $searchForm.ShowDialog() | Out-Null

            # 用户确认后，搜索匹配的标签页
            if ($searchResult.Confirmed -and $searchResult.Keyword) {
                $kw = $searchResult.Keyword
                $matched = $null
                foreach ($b in $menuButtons) {
                    # -like 支持通配符且不区分大小写
                    if ($b.Text -like "*$kw*") { $matched = $b.Tag; break }
                }
                if ($matched) {
                    # 模拟点击该导航按钮 (会触发样式切换 + Switch-Tab)
                    foreach ($b in $menuButtons) {
                        if ($b.Tag -eq $matched) { $b.PerformClick(); break }
                    }
                    Write-Log "[Ctrl+K] 已切换到匹配的标签页：$matched" "OK"
                } else {
                    Write-Log "[Ctrl+K] 未找到包含 '$kw' 的标签页。可用：启动管理/数据库/测试中心/运维监控/通知日志/部署/快捷入口/Git & 账号" "WARN"
                }
            }
        } finally {
            $searchForm.Dispose()
        }
        $e.SuppressKeyPress = $true
    }
})

# ==============================================================================
# 关闭处理
# ==============================================================================
$form.Add_FormClosing({
    param($s, $e)
    $aliveCount = 0
    foreach ($kv in $script:RunningJobs.GetEnumerator()) {
        if ($kv.Value -and -not $kv.Value.HasExited) { $aliveCount++ }
    }
    if ($aliveCount -gt 0) {
        $r = [System.Windows.Forms.MessageBox]::Show("还有 $aliveCount 个任务在运行中。全部停止后退出?", "确认退出", "YesNoCancel", "Question")
        switch ($r) {
            "Yes"    { Stop-AllJobs; $e.Cancel = $false }
            "No"     { $e.Cancel = $false }
            "Cancel" { $e.Cancel = $true }
        }
    }
})

# ==============================================================================
# 初始化默认选中第一个标签
# ==============================================================================
$menuButtons[0].BackColor = $C_BG_NAV_SEL
$menuButtons[0].ForeColor = $C_FG
$menuButtons[0].Font = $F_MENU_SEL
$menuButtons[0].FlatAppearance.BorderColor = $C_ACCENT
# 启动管理左侧指示条设为选中色 (其余已经是 $C_BORDER 默认色)
$firstBar = $script:navAccentBars["启动管理"]
if ($firstBar) { $firstBar.BackColor = $C_ACCENT; $firstBar.BringToFront() }

# ==============================================================================
# 显示后触发首次布局 + 欢迎信息
# ==============================================================================
$form.Add_Shown({
    Invoke-FormLayout
    foreach ($name in @("启动管理", "数据库", "测试中心", "运维监控", "通知日志", "部署", "快捷入口", "Git & 账号")) {
        $ctx = $script:TabCtxMap[$name]
        Reflow-TabCards -Ctx $ctx
    }
    Reflow-TabCards -Ctx $script:TabCtxMap["启动管理"]
    Write-Log "================================================================" "CMD"
    Write-Log "  EuriskoTax 统一启动中心 v3.4  已就绪" "OK"
    Write-Log "  项目根目录 : $ProjectRoot" "GRAY"
    Write-Log "  server/    : $ServerDir" "GRAY"
    Write-Log "  tools/ops/ : $OpsDir" "GRAY"
    Write-Log "  tools/cpolar/: $CpolarDir" "GRAY"
    Write-Log "================================================================" "CMD"
    Write-Log "" "INFO"
    Write-Log "【快速启动：】" "OK"
    Write-Log "  👉 第一次用 / 升级后 → 点 【第一次用：一键启动（安装依赖+重置账号）】" "INFO"
    Write-Log "  👉 日常开发 → 点 【日常启动：跳过检查，快速启动】" "INFO"
    Write-Log "  👉 启动成功后 → 点 【打开前端 http://localhost:3000/】" "INFO"
    Write-Log ""
    Write-Log "【账号密码统一管理：】" "OK"
    Write-Log "  👉 左侧导航 → 【🔐 Git & 账号】 → 【2. 账号 & 密码管理】 查看所有账号" "INFO"
    Write-Log "  👉 一键复制登录邮箱 dev@example.com  /  密码 password" "GRAY"
    Write-Log "  👉 账号文档: docs/admin/account-credentials.md" "GRAY"
    Write-Log ""
    Write-Log "提示: 鼠标悬停任何按钮可查看详细说明。导航选中后左侧有蓝色指示条。" "INFO"
    Write-Log ""
}.GetNewClosure())

[void]$form.ShowDialog()
$timer.Stop()
$form.Dispose()
