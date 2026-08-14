# ==============================================================================
# EuriskoTax 开发控制台 v3.3 (统一启动中心)
# 双击 gui-启动.bat 即可运行，无需消耗 AI 积分
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
[System.Windows.Forms.Application]::EnableVisualStyles()
[System.Windows.Forms.Application]::SetCompatibleTextRenderingDefault($false)

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
# 布局参数 (v3.2 更宽松)
# ==============================================================================
$PADDING       = 18        # 外边距
$CARD_PAD      = 14        # 卡片内边距
$BTN_H         = 60        # 按钮高度
$BTN_W         = 220       # 标准按钮宽度 (加宽)
$BTN_WIDE_W    = 290       # 宽按钮 (推荐操作)
$BTN_SMALL_W   = 170       # 小按钮宽度
$BTN_GAP       = 10        # 按钮间距
$CARD_GAP_V    = 18        # 卡片垂直间距 (加大)
$SCROLL_W      = 20        # 滚动条宽度
$CARD_TITLE_H  = 30        # 卡片标题高度
$CARD_SUB_H    = 20        # 卡片副标题高度
$CARD_DESC_H   = 38        # 卡片描述高度 (支持2行换行)

# ==============================================================================
# 配色方案 (柔和 + 高对比)
# ==============================================================================
$C_BG_FORM     = [System.Drawing.Color]::FromArgb(30, 30, 38)
$C_BG_L1       = [System.Drawing.Color]::FromArgb(38, 38, 48)
$C_BG_L2       = [System.Drawing.Color]::FromArgb(48, 48, 60)
$C_BG_L3       = [System.Drawing.Color]::FromArgb(60, 60, 74)
$C_BG_BTN      = [System.Drawing.Color]::FromArgb(64, 64, 80)
$C_BG_DARK     = [System.Drawing.Color]::FromArgb(24, 24, 32)
$C_BG_GUIDE    = [System.Drawing.Color]::FromArgb(52, 62, 84)    # 指引卡片背景 (蓝调深色)
$C_FG          = [System.Drawing.Color]::FromArgb(245, 245, 252)
$C_FG_MUTED    = [System.Drawing.Color]::FromArgb(200, 200, 215)
$C_FG_DIM      = [System.Drawing.Color]::FromArgb(150, 150, 170)
$C_ACCENT      = [System.Drawing.Color]::FromArgb(75, 140, 230)
$C_ACCENT_HOT  = [System.Drawing.Color]::FromArgb(100, 165, 250)
$C_DANGER      = [System.Drawing.Color]::FromArgb(225, 90, 90)
$C_SUCCESS     = [System.Drawing.Color]::FromArgb(85, 180, 110)
$C_WARN        = [System.Drawing.Color]::FromArgb(225, 165, 80)
$C_PURPLE      = [System.Drawing.Color]::FromArgb(165, 105, 210)
$C_CYAN        = [System.Drawing.Color]::FromArgb(75, 180, 190)
$C_GRAY        = [System.Drawing.Color]::FromArgb(120, 120, 140)
$C_BORDER      = [System.Drawing.Color]::FromArgb(65, 65, 82)
$C_GUIDE_ACCENT = [System.Drawing.Color]::FromArgb(255, 215, 120)  # 指引金 (推荐提示)

# ==============================================================================
# 字体 (中文使用微软雅黑更清晰)
# ==============================================================================
$F_TITLE       = New-Object System.Drawing.Font("Microsoft YaHei UI", 15, [System.Drawing.FontStyle]::Bold)
$F_SUBTITLE    = New-Object System.Drawing.Font("Microsoft YaHei UI", 9)
$F_MENU        = New-Object System.Drawing.Font("Microsoft YaHei UI", 10.5)
$F_MENU_SEL    = New-Object System.Drawing.Font("Microsoft YaHei UI", 10.5, [System.Drawing.FontStyle]::Bold)
$F_TAB_HEAD    = New-Object System.Drawing.Font("Microsoft YaHei UI", 14, [System.Drawing.FontStyle]::Bold)
$F_TAB_DESC    = New-Object System.Drawing.Font("Microsoft YaHei UI", 9.5)
$F_CARD_HEAD   = New-Object System.Drawing.Font("Microsoft YaHei UI", 11.5, [System.Drawing.FontStyle]::Bold)
$F_CARD_SUB    = New-Object System.Drawing.Font("Microsoft YaHei UI", 9)
$F_CARD_DESC   = New-Object System.Drawing.Font("Microsoft YaHei UI", 9)
$F_BTN_MAIN    = New-Object System.Drawing.Font("Microsoft YaHei UI", 9.5, [System.Drawing.FontStyle]::Bold)
$F_STATUS      = New-Object System.Drawing.Font("Microsoft YaHei UI", 9)
$F_LOG         = New-Object System.Drawing.Font("Consolas", 9.5)
$F_GUIDE_HEAD  = New-Object System.Drawing.Font("Microsoft YaHei UI", 12, [System.Drawing.FontStyle]::Bold)
$F_GUIDE_ITEM  = New-Object System.Drawing.Font("Microsoft YaHei UI", 9.5)

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
    $script:OutputBox.ScrollToCaret()
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
    if (-not $script:PublicUrlCardLabel) { return }
    $urlFile = Join-Path $env:TEMP "euriskotax-last-cpolar-url.txt"
    $url = $null
    $fileTs = $null
    if (Test-Path $urlFile) {
        try {
            $url = (Get-Content $urlFile -Raw -Encoding UTF8 -ErrorAction SilentlyContinue).Trim()
            $fileTs = (Get-Item $urlFile -ErrorAction SilentlyContinue).LastWriteTime
        } catch { }
    }

    $tsText = if ($fileTs) { $fileTs.ToString("yyyy-MM-dd HH:mm:ss") } else { "-" }

    if ([string]::IsNullOrWhiteSpace($url)) {
        $script:PublicUrlCardLabel.Text = "（暂无公网地址）→ 点下方紫色或红色【启动+公网分享】按钮"
        $script:PublicUrlCardLabel.ForeColor = $C_FG_DIM
        $script:PublicUrlCardLabel.Font = New-Object System.Drawing.Font("Microsoft YaHei UI", 10)
        $script:PublicUrlCardHint.Text = "  未检测到 cpolar 隧道。点【启动 + 分享 + 自动重启】后会自动刷新，地址生成后会自动复制并发送邮件。  |  共享文件：$urlFile  |  更新：$tsText"
        $script:PublicUrlCardLabel.Cursor = [System.Windows.Forms.Cursors]::Default
        $script:PublicUrlLastSeen = ""
    } else {
        $script:PublicUrlCardLabel.Text = "🌐  $url"
        $script:PublicUrlCardLabel.ForeColor = [System.Drawing.Color]::FromArgb(255, 185, 120)
        $script:PublicUrlCardLabel.Font = New-Object System.Drawing.Font("Consolas", 13.5, [System.Drawing.FontStyle]::Bold)
        $script:PublicUrlCardLabel.Cursor = [System.Windows.Forms.Cursors]::Hand
        $script:PublicUrlCardHint.Text = "  ✅ 点击上面链接复制到剪贴板  |  打开 cpolar 仪表盘：http://127.0.0.1:4040/  |  地址来源：共享文件  |  最近更新：$tsText"

        $isFirstTime = ([string]::IsNullOrWhiteSpace($script:PublicUrlLastSeen))
        $isChanged   = (-not $isFirstTime) -and ($script:PublicUrlLastSeen -ne $url)

        # 首次出现：不弹窗（首次弹窗由 outHandler 的"公网地址已生成"负责，避免重复）
        # URL 变更：只弹 1 次，180 秒内同 URL 不重复弹
        if ($isChanged) {
            $key = "URL_CHANGED::$url"
            if (Test-AllowPopup -Key $key) {
                try { Set-Clipboard -Value $url } catch { }
                $msg = "公网地址已更新！已自动复制到剪贴板：`n`n  新地址：$url`n  上次地址：$script:PublicUrlLastSeen`n`n如果开启了邮件通知，收件箱也会收到变更邮件。"
                [System.Windows.Forms.MessageBox]::Show($msg, "公网地址变更", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Information) | Out-Null
                $script:UrlPopupMode = "change"
            }
        } elseif ($isFirstTime) {
            # 首次：只做 剪贴板 同步（如果 outHandler 之前没执行过），不弹窗
            # (outHandler 会负责首次弹窗，Update-PublicUrlCard 只是 UI 刷新辅助)
            try {
                $curr = Get-Clipboard -ErrorAction SilentlyContinue
                if ($curr -ne $url) { Set-Clipboard -Value $url -ErrorAction SilentlyContinue }
            } catch { }
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
                        "邮件发送出现问题，没有发出。`n`n可能原因：`n  ① notify.config.json 中 enabled=false`n  ② QQ 邮箱授权码已过期或填错`n  ③ SMTP 服务器无法连接`n`n👉 排查方式：到【🛠 运维辅助】→ 邮件通知配置 → 查看通知日志 tools/ops/notify.log",
                        "⚠️ 邮件通知未发送",
                        [System.Windows.Forms.MessageBoxButtons]::OK,
                        [System.Windows.Forms.MessageBoxIcon]::Warning) | Out-Null
                }
            }
            # 4) 每次关键输出都立即刷新公网地址卡片（仅刷新显示，不再重复弹窗）
            try { Update-PublicUrlCard } catch { }

            $script:OutputBox.SelectionStart = $script:OutputBox.TextLength
            $script:OutputBox.SelectionLength = 0
            $script:OutputBox.SelectionColor = $C_FG_MUTED
            $script:OutputBox.AppendText($line + "`r`n")
            $script:OutputBox.ScrollToCaret()
        }
    }
    $errHandler = {
        if ($EventArgs.Data) {
            if (-not $script:OutputBox) { return }
            $script:OutputBox.SelectionStart = $script:OutputBox.TextLength
            $script:OutputBox.SelectionLength = 0
            $script:OutputBox.SelectionColor = [System.Drawing.Color]::Yellow
            $script:OutputBox.AppendText($EventArgs.Data + "`r`n")
            $script:OutputBox.ScrollToCaret()
            try { Update-PublicUrlCard } catch { }
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
    if ($script:RunningJobs.ContainsKey($Name)) {
        $proc = $script:RunningJobs[$Name]
        if ($proc -and -not $proc.HasExited) {
            try {
                taskkill /PID $proc.Id /T /F 2>&1 | Out-Null
                Write-Log "[STOP] 已停止 '$Name' (PID: $($proc.Id))" "WARN"
            } catch { Write-Log "停止失败: $_" "ERROR" }
        }
        $script:RunningJobs.Remove($Name)
        if ($Name -eq "backend") { $script:BackendProcess = $null; $script:StartTime = $null }
        if ($Name -eq "watchdog") { $script:WatchdogProcess = $null }
        Update-StatusBar
    } else { Write-Log "任务 '$Name' 未在运行" "GRAY" }
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

# 全局布局参数（硬编码坐标，彻底解决Dock遮挡问题）
$H_HEADER = 60
$H_STATUS = 30
$W_LEFT   = 240

# ==============================================================================
# 顶部标题栏
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
$subtitleLabel.ForeColor = [System.Drawing.Color]::FromArgb(145, 195, 255)
$subtitleLabel.AutoSize = $true
$subtitleLabel.Location = New-Object System.Drawing.Point(380, 20)
$headerPanel.Controls.Add($subtitleLabel)

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
    @{ Name = "启动管理"; Icon = "🚀"; Desc = "启动/停止后端 · 端口管理 · 快速访问 (12个功能)";   Color = $C_SUCCESS },
    @{ Name = "数据库";   Icon = "💾"; Desc = "迁移 · 生成 · 重置账号 · 可视化管理 (6个功能)";     Color = $C_ACCENT   },
    @{ Name = "测试中心"; Icon = "🧪"; Desc = "单元测试 · 覆盖率 · 性能基准 (9个功能)";           Color = $C_PURPLE   },
    @{ Name = "运维辅助"; Icon = "🛠"; Desc = "看门狗 · 内网穿透 · 邮件 · 日志 (19个功能)";       Color = $C_WARN     },
    @{ Name = "部署";     Icon = "📦"; Desc = "远程部署 · 回滚 · 服务器初始化 (11个功能)";        Color = $C_ACCENT   },
    @{ Name = "常用工具"; Icon = "📂"; Desc = "目录 · 终端 · 浏览器 · Git · 文档 (24个功能)";     Color = $C_GRAY     }
)

$yPos = 18
$script:navAccentBars = @{}
foreach ($tab in $tabs) {
    $tabName = $tab.Name
    $btn = New-Object System.Windows.Forms.Button
    $btn.Text = "  $($tab.Icon)   $($tab.Name)"
    $btn.Font = $F_MENU
    $btn.Size = New-Object System.Drawing.Size(212, 46)
    $btn.Location = New-Object System.Drawing.Point(10, $yPos)
    $btn.FlatStyle = "Flat"
    $btn.FlatAppearance.BorderSize = 1
    $btn.FlatAppearance.BorderColor = $C_BORDER
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

    # 左侧彩色指示条（选中时显示）
    $bar = New-Object System.Windows.Forms.Panel
    $bar.Size = New-Object System.Drawing.Size(4, 46)
    $bar.Location = New-Object System.Drawing.Point(10, $yPos)
    $bar.BackColor = $C_ACCENT
    $bar.Visible = $false
    $bar.BringToFront()
    $script:navAccentBars[$tabName] = $bar

    $btn.Add_Click({
        param($s, $e)
        foreach ($b in $menuButtons) {
            if ($b.Tag -eq $tabName) {
                $b.BackColor = $C_ACCENT
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
        # 显示/隐藏左侧指示条
        foreach ($n in $script:navAccentBars.Keys) {
            $barCtrl = $script:navAccentBars[$n]
            if ($n -eq $tabName) {
                $barCtrl.Visible = $true
                $barCtrl.BringToFront()
            } else {
                $barCtrl.Visible = $false
            }
        }
        Switch-Tab -TabName $tabName
    }.GetNewClosure())
    $menuButtons += $btn
    $leftPanel.Controls.Add($bar)
    $leftPanel.Controls.Add($btn)
    $yPos += 50
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
        [switch]$IsGuide
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
                $cardInfo.Controls['Card'] = $card
                # 左侧色条
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
            $cardInfo.Controls['Accent'].Location = New-Object System.Drawing.Point(0, 0)
            $cardInfo.Controls['Accent'].Size = New-Object System.Drawing.Size(5, $guideH)
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
                $btn.FlatAppearance.BorderSize = 0
                $btn.ForeColor = $C_FG
                $btn.TextAlign = "MiddleCenter"
                $btn.Cursor = "Hand"
                $colorParts = ($b.Color -replace ' ', '').Split(',')
                if ($colorParts.Count -eq 3) {
                    $btn.BackColor = [System.Drawing.Color]::FromArgb([int]$colorParts[0], [int]$colorParts[1], [int]$colorParts[2])
                    $btn.FlatAppearance.MouseOverBackColor = [System.Drawing.Color]::FromArgb(
                        ([Math]::Min(255, [int]$colorParts[0] + 32)),
                        ([Math]::Min(255, [int]$colorParts[1] + 32)),
                        ([Math]::Min(255, [int]$colorParts[2] + 32))
                    )
                } else {
                    $btn.BackColor = $C_BG_BTN
                    $btn.FlatAppearance.MouseOverBackColor = $C_BG_L3
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

        $actualCardH = $actualTopOffset + ($rows * $BTN_H) + ([Math]::Max(0, $rows - 1) * $gap) + $cpad
        $cardInfo.Card.Size = New-Object System.Drawing.Size($availW, $actualCardH)
        $cardInfo.Controls['Accent'].Size = New-Object System.Drawing.Size(5, $actualCardH)
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
           OnClick = { try { Update-PublicUrlCard } catch { } Show-GuiAlert -Title "已刷新" -Message "公网地址卡片已刷新。若仍为空，请稍等 5~15 秒（cpolar 建立隧道需要时间）。" }
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
$tab2Ctx = New-TabPanel -HeaderText "💾  数据库" -HeaderTagline "Prisma 数据库迁移 · 客户端生成 · 数据重置 · 可视化管理" -HeaderDesc "本页包含 1 个功能区：① 数据库常用操作（重置账号/迁移/生成客户端/Prisma Studio/编辑schema/重建数据库）。所有命令在 server/ 目录执行。"

Add-SectionCard -TabCtx $tab2Ctx `
    -Title "1. 数据库常用操作" `
    -Subtitle "所有命令在 server/ 目录下执行" `
    -Description "详细说明：改完 server/prisma/schema.prisma 文件后，要先 运行数据库迁移，再 生成Prisma客户端，代码才能识别新表结构。" `
    -AccentColor $C_ACCENT -Buttons @(
    @{ Text = "重置开发测试账号`ndev@example.com"; Desc = "执行 server/scripts/reset-dev-user.js，重置开发环境的测试用户账号（邮箱 dev@example.com，密码 password）。"; Color = "85, 180, 110";
       OnClick = { Invoke-AsyncCommand -Name "resetuser" -Command "node scripts/reset-dev-user.js" -WorkingDir $ServerDir } },
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
       OnClick = { Start-Process "notepad.exe" (Join-Path $ServerDir "prisma\schema.prisma") } },
    @{ Text = "⚠ 强制重建数据库`n所有数据将清空丢失"; Desc = "执行 prisma migrate reset --force，删除当前数据库并重建！！！所有数据会被清空，不可恢复。点前请三思。"; Color = "200, 85, 85";
       OnClick = {
            $r = [System.Windows.Forms.MessageBox]::Show("这将删除并重建数据库! 所有数据将永久丢失! 确定继续?", "危险操作", "YesNo", "Warning")
            if ($r -eq "Yes") { Invoke-AsyncCommand -Name "resetdb" -Command "npx prisma migrate reset --force" -WorkingDir $ServerDir }
        } }
)

# ==============================================================================
# ============ 标签页 3: 测试中心 ============
# ==============================================================================
$tab3Ctx = New-TabPanel -HeaderText "🧪  测试中心" -HeaderTagline "Jest 单元测试 · 覆盖率报告 · 性能基准测试" -HeaderDesc "本页包含 2 个功能区：① Jest 单元测试（全部测试/监视模式/覆盖率/打开报告）  ② 性能基准测试（基准测试/优化报告/性能单测）"

Add-SectionCard -TabCtx $tab3Ctx `
    -Title "1. Jest 单元测试" `
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
    -Title "2. 性能基准测试" `
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
# ============ 标签页 4: 运维辅助 ============
# ==============================================================================
$tab4Ctx = New-TabPanel -HeaderText "🛠  运维辅助" -HeaderTagline "看门狗守护 · cpolar 内网穿透 · 邮件通知 · 日志查看" -HeaderDesc "本页包含 4 个功能区：① 看门狗守护（启动/停止/编辑脚本）  ② Cpolar 内网穿透（启动隧道/查看面板/停止）  ③ 邮件通知配置（测试/编辑配置/模板/原因映射）  ④ 日志查看（看门狗/事件/通知日志）"

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
    @{ Text = "启动 HTTP 隧道`n映射 3000 端口到公网"; Desc = "执行 cpolar http 3000，将本地 3000 端口映射为 cpolar 提供的公网地址。启动后在下方打开面板查看URL。"; Color = "75, 180, 190";
       OnClick = {
            $cp = Join-Path $CpolarDir "cpolar.exe"
            if (-not (Test-Path $cp)) { Write-Log "未找到 cpolar.exe: $cp，请确认 cpolar 目录完整。" "ERROR"; return }
            Invoke-AsyncCommand -Name "cpolar-http" -Command "http 3000" -FileName $cp -WorkingDir $CpolarDir
            Write-Log "Cpolar HTTP 隧道已启动。点下面的 Cpolar 面板按钮查看公网 URL (http://localhost:9200/)" "INFO"
        } },
    @{ Text = "打开 Cpolar 面板`n查看公网 URL"; Desc = "在浏览器打开 http://localhost:9200/，这是 cpolar 本地面板，可查看隧道状态和分配的公网链接。"; Color = "120, 120, 140";
       OnClick = { Start-Process "http://localhost:9200/" } },
    @{ Text = "停止所有 Cpolar 隧道"; Desc = "停止所有 cpolar 相关的进程，关闭隧道。"; Color = "180, 95, 95";
       OnClick = { Stop-Job -Name "cpolar-http"; Stop-Job -Name "cpolar-other" } }
)

Add-SectionCard -TabCtx $tab4Ctx `
    -Title "3. 邮件通知配置" `
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

Add-SectionCard -TabCtx $tab4Ctx `
    -Title "4. 日志查看" `
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
# ============ 标签页 6: 常用工具 ============
# ==============================================================================
$tab6Ctx = New-TabPanel -HeaderText "📂  常用工具" -HeaderTagline "文件夹 · 终端 · 浏览器 · Git · 文档 · 账号管理" -HeaderDesc "本页包含 4 个功能区：① 打开项目目录（8个目录快捷入口）  ② 终端和浏览器（PowerShell/前端/API/Prisma Studio）  ③ Git 操作和文档（status/log/pull/push/diff + 项目文档）  ④ 账号密码管理（所有账号统一列表+一键复制）"

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

Add-SectionCard -TabCtx $tab6Ctx `
    -Title "3. Git 操作 & 项目文档" `
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

Add-SectionCard -TabCtx $tab6Ctx `
    -Title "4. 账号 & 密码管理" `
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
    @{ Text = "📖 查看完整账号文档`n账号管理说明"; Desc = "打开 docs/account-credentials.md 查看所有账号的详细说明、获取方式、安全注意事项。"; Color = "120, 120, 140"; Width = $BTN_WIDE_W;
       OnClick = { Start-Process (Join-Path $ProjectRoot "docs\account-credentials.md") } }
)

# ==============================================================================
# 连接标签页面板到操作区
# ==============================================================================
$tabHost = New-Object System.Windows.Forms.Panel
$tabHost.Dock = "Fill"
$tabHost.BackColor = $C_BG_FORM

$script:TabPanels = @{
    "启动管理" = $tab1Ctx.Panel
    "数据库"   = $tab2Ctx.Panel
    "测试中心" = $tab3Ctx.Panel
    "运维辅助" = $tab4Ctx.Panel
    "部署"     = $tab5Ctx.Panel
    "常用工具" = $tab6Ctx.Panel
}
$script:TabCtxMap = @{
    "启动管理" = $tab1Ctx
    "数据库"   = $tab2Ctx
    "测试中心" = $tab3Ctx
    "运维辅助" = $tab4Ctx
    "部署"     = $tab5Ctx
    "常用工具" = $tab6Ctx
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
$outputBox.ScrollBars = "Vertical"
$script:OutputBox = $outputBox

$outputBar = New-Object System.Windows.Forms.FlowLayoutPanel
$outputBar.Dock = "Bottom"
$outputBar.Height = 48
$outputBar.BackColor = $C_BG_L2
$outputBar.FlowDirection = "LeftToRight"
$outputBar.WrapContents = $true
$outputBar.Padding = New-Object System.Windows.Forms.Padding(8, 8, 8, 8)
$outputBar.AutoScroll = $true

function New-OutBtn {
    param([string]$Text, [string]$Color = "120, 120, 140", [scriptblock]$OnClick, [int]$W = 112)
    $b = New-Object System.Windows.Forms.Button
    $b.Text = $Text
    $b.Size = New-Object System.Drawing.Size($W, 32)
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

$obClear = New-OutBtn -Text "🗑 清空输出" -Color "125, 70, 70" -W 104 -OnClick { $script:OutputBox.Clear() }
$obSave  = New-OutBtn -Text "💾 保存日志" -Color "85, 85, 105" -W 104 -OnClick {
    $sfd = New-Object System.Windows.Forms.SaveFileDialog
    $sfd.Filter = "文本文件 (*.txt)|*.txt|所有文件 (*.*)|*.*"
    $sfd.FileName = "euriskotax-log-$(Get-Date -Format 'yyyyMMdd-HHmmss').txt"
    if ($sfd.ShowDialog() -eq "OK") {
        $script:OutputBox.SaveFile($sfd.FileName, [System.Windows.Forms.RichTextBoxStreamType]::PlainText)
        Write-Log "日志已保存到 $($sfd.FileName)" "OK"
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

$outputBar.Controls.Add($obClear)
$outputBar.Controls.Add($obSave)
$outputBar.Controls.Add($obCopy)
$outputBar.Controls.Add($obFront)
$outputBar.Controls.Add($obApi)
$outputBar.Controls.Add($obGuide)

$outputOuter.Controls.Add($outputBox)
$outputOuter.Controls.Add($outputBar)
$rightSplit.Panel2.Controls.Add($outputOuter)

# ==============================================================================
# 定时器 (每秒更新状态栏)
# ==============================================================================
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 1000
$timer.Add_Tick({
    Update-StatusBar
    # 每 3 秒刷新一次公网地址卡片（看门狗变 URL 后不用手动点刷新）
    if (([DateTime]::Now.Second % 3) -eq 0) {
        try { Update-PublicUrlCard } catch { }
    }
})
$timer.Start()

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
$menuButtons[0].BackColor = $C_ACCENT
$menuButtons[0].ForeColor = $C_FG
$menuButtons[0].Font = $F_MENU_SEL
$menuButtons[0].FlatAppearance.BorderColor = $C_ACCENT
# 显示启动管理的左侧指示条
$firstBar = $script:navAccentBars["启动管理"]
if ($firstBar) { $firstBar.Visible = $true; $firstBar.BringToFront() }

# ==============================================================================
# 显示后触发首次布局 + 欢迎信息
# ==============================================================================
$form.Add_Shown({
    Invoke-FormLayout
    foreach ($name in @("启动管理", "数据库", "测试中心", "运维辅助", "部署", "常用工具")) {
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
    Write-Log "  👉 左侧导航 → 【📂 常用工具】 → 【4. 账号 & 密码管理】 查看所有账号" "INFO"
    Write-Log "  👉 一键复制登录邮箱 dev@example.com  /  密码 password" "GRAY"
    Write-Log "  👉 账号文档: docs/account-credentials.md" "GRAY"
    Write-Log ""
    Write-Log "提示: 鼠标悬停任何按钮可查看详细说明。导航选中后左侧有蓝色指示条。" "INFO"
    Write-Log ""
}.GetNewClosure())

[void]$form.ShowDialog()
$timer.Stop()
$form.Dispose()
