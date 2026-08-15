# EuriskoTax GUI 按钮功能与实现参考手册

> **最后审计基线**：2026-08-16 · 全量按钮 **110 个**（含 8 标签页 + 顶部导航 + 底部输出工具栏）
> **审计结论**：100% 按钮有真实实现（无空壳/占位），其中 3 项 Bug 已于 2026-08-16 修复完毕

---

## 总体架构

- **入口**：`tools/gui/EuriskoTax-Console.bat` → `powershell -STA -WindowStyle Hidden -File tools/gui/gui-dev-console.ps1`
- **桌面快捷方式**：`tools/gui/_create_shortcut.ps1` 生成，TargetPath 直接指向 `powershell.exe`（单窗口无 cmd.exe）
- **UI 框架**：PowerShell 5.1 + System.Windows.Forms（WinForms）
- **日志管线**：全部按钮事件 → `Write-Log` → GUI 内 RichTextBox `$script:OutputBox`（不依赖外部控制台窗口）
- **异步进程启动**：`Invoke-AsyncCommand` → `System.Diagnostics.ProcessStartInfo`，登记到 `$script:RunningJobs[name]`
- **外部子进程跨进程通知协议**：`[GUI-EVENT] [<EVENT-NAME>] <ARGS>`（经 stdout 传递，GUI outHandler 捕获并绑定状态）

---

## Tab 1：启动管理（Start / Share / Watchdog / Health）

| 行号 | 按钮文字 | 实现路径 | 关键行为 | 修复记录 |
|------|---------|---------|---------|---------|
| L2396 | 🔍 **一键全面体检** | 内嵌 scriptblock | 5 步：后端服务(PID+端口) → cpolar 隧道 → 看门狗 → 数据库(环境变量) → 依赖包（node_modules 存在性）；结果 ✅/❌ 弹窗汇总 | |
| L2339 | 🔄 刷新公网地址卡 | `Update-PublicUrlCard -Force` | 重新解析 `%TEMP%/euriskotax-last-cpolar-url.txt` + cpolar API `:4040/api/tunnels`，同步更新 GUI 橙色卡片 + 按钮状态 | |
| L2523 | 第一次用 · 一键启动 | `ops-start-dev.ps1` (无参数) | 含 npm install / prisma migrate dev / reset-dev-user.js 全量初始化 | |
| L2525 | 日常启动 · 快速启动 | `ops-start-dev.ps1 -SkipInstall -SkipResetUser` | 跳过依赖安装与账号重置，仅拉起 server + cpolar | |
| L2527 | 启动 + 公网分享 | `ops-start-dev.ps1 -Share` | 同快速启动 + 临时隧道 `cpolar http 3000 -region=cn` | |
| L2529 | 启动 + 崩溃自动重启 | `ops-start-dev.ps1 -Watchdog` | 同快速启动 + 内部 `Start-Process` 拉起 `ops-watchdog.ps1`，**并输出 `[GUI-EVENT] [WATCHDOG-STARTED] PID=<n>`** 让 GUI 接管绑定 | ✅ 2026-08-16：新增 stdout 事件协议，解决 GUI 无法感知看门狗 |
| L2531 | ⭐ 启动+分享+自动重启 | `ops-start-dev.ps1 -Share -Watchdog` | 三项合并 + **朋友联调推荐默认按钮** | ✅ 同上（用户主投诉 Bug） |
| L2533 | Nodemon 开发模式 | `npm run dev` (server/) | 代码变更自动重启 node，适合开发调试 | |
| L2543 | 停止后端服务（含看门狗） | `Stop-Job backend` → `Stop-Job watchdog` | `taskkill /PID <Id> /T /F` 强制杀进程树；**RunningJobs 未登记时会 fallback 到 `$script:BackendProcess/WatchdogProcess`** | ✅ 2026-08-16：新增 fallback 杀半绑定进程 |
| L2545 | 强制释放 3000 端口 | `Get-NetTCPConnection LocalPort=3000` → `Stop-Process` | 二次确认弹窗（Yes/No），列占用 PID 与进程名 | |
| L2547 | 查看 3000 端口状态 | `Get-NetTCPConnection` + `OwningProcess` 详细 | 输出监听/已建立连接清单，含进程归属 | |
| L2569 | 打开前端首页 | `Start-Process http://localhost:3000/` | | |
| L2571 | 📚 一键查看 API 文档 | `Open-ApiDocsAuto` 5 步流程 | ① 获取 Bearer Token → ② 写入 %TEMP%\swagger-auth.js → ③ 启动 server(若死) → ④ 等待 /api 就绪 → ⑤ 打开 `/api/docs?preloadAuth=1` | |
| L2573 | 打开 Prisma Studio | `npx prisma studio` + 开 `:5555` | 启动 4 秒后浏览器打开 Studio | |

---

## Tab 2：数据库（DB & Migration）

| 行号 | 按钮文字 | 实现路径 | 关键行为 |
|------|---------|---------|---------|
| L2591 | 运行数据库迁移 | `npx prisma migrate dev` | 开发环境交互式迁移 |
| L2593 | 生成 Prisma 客户端 | `npx prisma generate` | 重新生成 PrismaClient 类型 |
| L2595 | 打开 Prisma Studio（db2） | `npx prisma studio` 独立进程 | |
| L2601 | 编辑 schema.prisma | `Start-Process notepad.exe server/prisma/schema.prisma` | |
| L2610 | 重置开发测试账号 | `node server/scripts/reset-dev-user.js` | 恢复 dev@example.com / password |
| L2612 | ⚠ 强制重建数据库 | `prisma migrate reset --force` + YesNo 确认 | 清空所有数据重放迁移，生产禁用 |

---

## Tab 3：测试中心（Test + Coverage + Perf）

| 行号 | 按钮文字 | 实现路径 | 关键行为 |
|------|---------|---------|---------|
| L2629 | 全部测试 + 覆盖率 | `npm test`（项目根 package.json） | 默认跑 jest + coverage 输出到 coverage/ |
| L2631 | 监视模式 · 改代码自动测 | `npm run test:watch` | 后台运行，Stop-Job testwatch 可停 |
| L2633 | 停止测试监视 | `Stop-Job testwatch` | taskkill 对应进程树 |
| L2635 | 打开覆盖率报告 | 检查 `coverage/index.html` 存在后 `Start-Process` | 不存在时提示先跑「全部测试」 |
| L2641 | 打开 tests 目录 | `explorer.exe $ProjectRoot/tests` | |
| L2643 | 查看测试报告文档 | `Start-Process docs/reports/test-report.md` | |
| L2689 | 运行性能基准测试 | `npm run test:performance` | tests/performance/benchmark.js |
| L2691 | 查看性能优化报告 | `Start-Process docs/reports/performance-optimization-report.md` | |
| L2693 | Jest 性能单测（tax-assistant） | `npx jest tests/tax-assistant-perf.test.js` | |

---

## Tab 4：运维监控（Watchdog + Cpolar）

| 行号 | 按钮文字 | 实现路径 | 关键行为 | 修复记录 |
|------|---------|---------|---------|---------|
| L2670 | 启动看门狗守护 | `Invoke-AsyncCommand -IsWatchdog ops-watchdog.ps1` | 每 20 秒检测后端 + cpolar + 邮件通知；**由 GUI 直接启动时 RunningJobs["watchdog"] 登记** | |
| L2672 | 停止看门狗守护 | `Stop-Job watchdog` + fallback 到 `$script:WatchdogProcess` | | ✅ 2026-08-16 fallback |
| L2674 | 查看/编辑看门狗脚本 | `notepad tools/ops/ops-watchdog.ps1` | | |
| L2719 | 启动 HTTP 隧道（映射 3000→公网） | `cpolar.exe http 3000 -region=cn` | cpolar 二进制 | ✅ 2026-08-16：`-region=cn` 国内加速 |
| L2727 | 打开 Cpolar 面板 · 查看公网 URL | `Start-Process http://localhost:4040/` | cpolar 默认 Web 面板 | ✅ 2026-08-16：9200→4040（原端口是 ES） |
| L2729 | 停止所有 Cpolar 隧道 | `Stop-Job cpolar-http; Stop-Job cpolar-other` | | |

---

## Tab 4b：通知日志（Notify + 日志查看）

| 行号 | 按钮文字 | 实现路径 | 关键行为 |
|------|---------|---------|---------|
| L2706 | 发送测试邮件 | `&ops-notify.ps1 → Send-TestNotification` | 使用 `tools/ops/notify.config.json` 配置 + 模板 `ops-notify-templates.json` |
| L2708 | 编辑通知配置 | `notepad tools/ops/ops-deploy.config.example.json` 风格（notify.config.json） | 不存在则从 example 复制后开 |
| L2710 | 查看邮件模板 | `notepad ops-notify-templates.json` | URL_CREATED / URL_CHANGED 等事件模板 |
| L2712 | 查看原因映射表 | `notepad ops-notify-reason-map.json` | 去重 key → 人类可读原因映射 |
| L2714 | 编辑通知脚本源码 | `notepad ops-notify.ps1` | |
| L2716 | 打开通知规范文档 | `Start-Process docs/tech-reports/watchdog-notification-and-event-log-spec.md` | |
| L2781 | 查看看门狗日志 · 最近 100 行 | `Get-Content $OpsDir/watchdog.log -Tail 100` | 写入 GUI OutputBox |
| L2787 | 查看事件日志 · 最近 100 行 | `Get-Content $OpsDir/events.log -Tail 100` | 结构化事件 |
| L2793 | 查看通知日志 · 最近 100 行 | `Get-Content $OpsDir/notify.log -Tail 100` | SMTP 交互 + 发送结果 |
| L2743 | 在资源管理器打开 ops 目录 | `explorer $OpsDir` | |
| L2745 | ⚠ 清空所有日志文件 | YesNo 确认 → `Clear-Content` watchdog/events/notify.log | 不可逆 |
| L2755 | 打开 ops README | `Start-Process tools/ops/README.md` | |

---

## Tab 5：部署（Deploy / Rollback / Init）

| 行号 | 按钮文字 | 实现路径 | 关键行为 |
|------|---------|---------|---------|
| L2769 | 试运行预览（DryRun） | `ops-deploy.ps1 -DryRun` | 不实际执行，输出部署计划 |
| L2771 | 正式部署到生产 | YesNo 确认 → `ops-deploy.ps1` | 打包 → 上传 → 切换 |
| L2777 | 跳过测试紧急部署 | YesNo → `ops-deploy.ps1 -SkipTest` | 极端情况使用 |
| L2783 | 回滚到上一版本 | YesNo → `ops-deploy.ps1 -Rollback` | |
| L2787 | 初始化服务器环境 | `ops-deploy.ps1 -InitEnv` | node/prisma/nginx 全套安装 |
| L2789 | 停止当前部署任务 | `Stop-Job deploy; Stop-Job rollback; Stop-Job initenv` | |
| L2798 | 编辑部署配置 | `notepad ops-deploy.config.json`（不存在从 example 复制） | |
| L2807 | 查看配置示例文件 | `notepad ops-deploy.config.example.json` | |
| L2809 | 编辑部署脚本源码 | `notepad ops-deploy.ps1` | |
| L2811 | 查看部署指南文档 | `Start-Process docs/reports/final-delivery-checklist.md` | |
| L2813 | 查看交付检查清单 | `Start-Process docs/reports/final-delivery-checklist.md` | |
| L2815 | 打开 ops README | `Start-Process tools/ops/README.md` | |

---

## Tab 6：快捷入口（Explorer + Editor + Browser）

### 6.1 资源管理器

| 行号 | 按钮 | 路径 |
|------|-----|------|
| L2829 | 项目根目录 | `$ProjectRoot` |
| L2831 | server 后端目录 | `$ServerDir` |
| L2833 | src 前端源码目录 | `$FrontDir/src` |
| L2835 | tools 工具总目录 | `$ToolsDir` |
| L2837 | tests 测试目录 | `$FrontDir/tests` |
| L2839 | docs 文档目录 | `$FrontDir/docs` |
| L2841 | cpolar 穿透工具目录 | `$CpolarDir` |
| L2843 | images 图片资源目录 | `$FrontDir/images` |

### 6.2 启动工具

| 行号 | 按钮 | 实现 |
|------|-----|------|
| L2852 | PowerShell（项目根） | `Start-Process powershell.exe -WorkingDir $ProjectRoot` |
| L2854 | PowerShell（server） | `Start-Process powershell.exe -WorkingDir $ServerDir` |
| L2856 | 浏览器 · 前端 :3000 | `Start-Process http://localhost:3000` |
| L2858 | 浏览器 · API文档(自动) | `Open-ApiDocsAuto` |
| L2860 | 浏览器 · Prisma Studio | `Start-Process http://localhost:5555` |
| L2862 | 前端入口 index.html | `Start-Process index.html`（本地 file://） |
| L2864 | Markdown · API 参考 | `Start-Process docs/api/api-reference.md` |
| L2866 | Markdown · README | `Start-Process README.md` |

---

## Tab 6b：Git & 账号密码

### 6b.1 Git 分支

| 行号 | 按钮文字 | 实现路径 | 关键行为 |
|------|---------|---------|---------|
| L2880 | 🔍 查看所有分支 | `git branch -a` → 解析 → Show-BranchPicker 弹窗（local/remote 分组 + 当前分支高亮）→ 确认后可切换 |
| L2892 | 📋 当前分支详情 | `git branch -vv` | 含 upstream / 最后提交哈希 |
| L2894 | 🏷️ 查看所有标签版本 | `git tag -l -n5` | tag message 摘要 |
| L2897 | 🔀 切换分支（下拉选择） | Show-BranchPicker → `Assert-WorkingTreeClean`（脏分支 3 选 1：取消/暂存/强制）→ `git checkout <branch>` | |
| L2920 | 🌿 快速切回 main | assert-clean → confirm → `git checkout main` | 强制场景可跳过脏检查 |
| L2946 | 🔄 刷新当前分支显示 | `Update-BranchCardLabel` + `Get-GitBranches` 摘要（刷新卡片顶部彩色分支名） | |
| L2957 | 📦 查看 v1.0 存档版 | `git checkout archive/v1.0`（同 assert-clean + confirm） |
| L2979 | 📦 查看 v1.2 存档版 | `git checkout archive/v1.2` |
| L3001 | ➕ 新建功能分支并切换 | Show-InputBox 取分支名 → `git checkout -b <name>` | |

### 6b.2 Git 操作

| 行号 | 按钮 | 命令 |
|------|-----|------|
| L3031 | git status | `git status` |
| L3033 | git log 最近 10 条 | `git log -n10 --stat --oneline` |
| L3035 | git pull | `git pull` |
| L3037 | git push | YesNo 确认 → `git push` |
| L3042 | git diff | `git diff` |
| L3044 | CHANGELOG | `Start-Process CHANGELOG.md` |
| L3046 | 开发计划文档 | `Start-Process docs/development/development-plan.md` |
| L3048 | 税务计算规则 | `Start-Process docs/guides/tax-calculation-rules.md` |

### 6b.3 账号 & 密码 & Token

| 行号 | 按钮文字 | 实现路径 | 关键行为 |
|------|---------|---------|---------|
| L3057 | 👤 项目登录账号复制 | `Set-Clipboard dev@example.com` | 默认账号 |
| L3059 | 🔑 项目登录密码复制 | `Set-Clipboard password` | 默认密码 |
| L3061 | 📋 一键复制邮箱+密码 | `Set-Clipboard "账号:\tdev@example.com`n密码:\tpassword"` | 排版好直接粘贴 |
| L3063 | 🔐 JWT Secret Key | `Start-Process server/.env` | JWT_SECRET 变量 |
| L3065 | 📧 QQ 邮箱授权码 | `Start-Process tools/ops/notify.config.json` | SMTP/AUTH_CODE |
| L3067 | 🌐 Cpolar Token | `&cpolar.exe authtoken`（交互式输入）| |
| L3069 | 🔑 获取 Bearer Token | `POST /api/auth/login` → 解析 JWT → 自动复制到剪贴板 + 显示剩余有效时间（秒） | |
| L3096 | 🚀 一键查看 API 文档 | `Open-ApiDocsAuto` | 同上 Tab1 定义 |
| L3098 | 🖥 部署 SSH 配置 | `Start-Process tools/ops/ops-deploy.config.example.json` | ssh / targetHost / remoteDir |
| L3100 | 📖 查看完整账号文档 | `Start-Process docs/admin/account-credentials.md` | 全部凭证一览 |

---

## 底部输出工具栏（RichTextBox OutputBar）

| 行号 | 按钮 | 实现 | 关键行为 |
|------|-----|------|---------|
| L3195 | 🗑 清空输出 | `$script:OutputBox.Clear()` | 也清空搜索结果 |
| L3196 | 💾 保存日志 | `SaveFileDialog` → `RichTextBox.SaveFile(PlainText)` → **try/finally 强制 Dispose()** 防 GDI 泄漏 |
| L3209 | 📋 复制输出 | `SelectAll()` → `Copy()` | 保留换行/颜色的纯文本 |
| L3216 | 🌐 打开前端 | `Start-Process :3000` + `Write-Log` 反馈 | |
| L3220 | 📚 API 文档(自动) | `Open-ApiDocsAuto` | |
| L3222 | ❓ 按钮说明 | MessageBox 显示 3 步快速指南（启动→获取 Bearer→打开 API 文档）| |
| L3236 | 🔄 自动滚动 ON/OFF 切换 | 切换 `$script:AutoScroll = $false/$true` + 动态按钮文字 | 高频日志时可关 |
| L3262 | 🔍 搜索输出（Enter 搜索） | `RichTextBox.Find(keyword, options)` → 找到后设为黄底黄字高亮 + 滚动到可见区 | |

---

## 顶部导航（侧边卡）

8 个 Tab 切换按钮（TabPages[0..7]）+ 4 项状态条

| 组件 | 说明 |
|------|------|
| 🌱 快速启动 / 🗄 数据库 / 🧪 测试中心 / 🔧 运维监控 / 📧 通知日志 / 🚀 部署 / 📂 快捷入口 / 🔀 Git & 账号 | 蓝色背景 + 左侧蓝色竖条双高亮激活态 |
| `StatusBackendLabel` / `StatusCpolarLabel` / `StatusWatchdogLabel` / `StatusTimeLabel` | 4 格状态栏，`Update-StatusBar` 每 10 秒自动刷新，按钮操作后即时刷新 |

---

## 关键全局函数（按钮背后的实现支柱）

| 函数 | 行号 | 作用 |
|------|------|------|
| `Write-Log` | L897 | 追加到 OutputBox RichTextBox（支持 8 种颜色级别） |
| `Invoke-AsyncCommand` | L1386 | 启动异步进程 + 注册 stdout/stderr 监听 + 登记 RunningJobs + `Exited` 事件回调 |
| `outHandler` (内嵌) | L1416-L1513 | 过滤 stdout 行 → 解析 [URL_CREATED/URL_CHANGED/BEARER-TOKEN/WATCHDOG-STARTED] 等 GUI-EVENT |
| `Stop-Job` | L1583 | RunningJobs[name].Kill → fallback `$script:BackendProcess/WatchdogProcess` → taskkill /T /F |
| `Update-StatusBar` | L1558 | 刷新 4 项状态标签 + Runtime 计时 |
| `Update-PublicUrlCard` | L1623 | 刷新公网地址卡（URL、8 个快捷按钮 Enable、cpolar API fallback） |
| `Open-ApiDocsAuto` | L714 | 5 步全自动：获取 Token → 写 js → 启动 server(死时) → 等 /api → 开浏览器 |
| `Get-GitBranches` | L1054 | 实时读 `refs/heads/` 和 `refs/remotes/`（空 catch 带说明注释） |
| `Show-BranchPicker` | L1086 | 分组（local/remote）弹窗 ListBox + 当前分支高亮 |
| `Assert-WorkingTreeClean` | L1130 | 脏检测 → 取消/暂存/强制 3 选 1 |
| `Show-GuiAlert` | L1130 附近 | 弹框封装（Info/Warn/Error 图标） |
| `Show-YesNo` / `Show-InputBox` | L1114-L1128 | 通用确认/输入弹窗，try/finally Dispose |

---

## Bug 修复历史

| 日期 | Bug | 影响按钮 | 修复方式 |
|------|-----|---------|---------|
| 2026-08-16 | 看门狗在 ops-start-dev 内启动后 GUI 无法感知 | 启动+分享+自动重启 · 一键全面体检 · 停止后端服务 | 新增 `[GUI-EVENT] [WATCHDOG-STARTED] PID=<n>` 协议；outHandler 解析并同时绑定 `RunningJobs["watchdog"]` + `$script:WatchdogProcess` + `Exited` 事件（-MessageData 传参） |
| 2026-08-16 | cpolar 面板端口 9200 打不开 | 打开 Cpolar 面板按钮 | 改为 4040（cpolar 默认端口，9200 是 Elasticsearch） |
| 2026-08-16 | standalone cpolar 隧道速度慢 | 启动 HTTP 隧道按钮 | 追加 `-region=cn`（国内加速节点） |
| 2026-08-16 | Stop-Job 杀不掉半绑定进程 | 停止后端服务 · 停止看门狗守护 | 新增 fallback：RunningJobs 没登记时从 `$script:BackendProcess/WatchdogProcess` 直接 taskkill |

---

## 下次新增按钮的 Checklist

1. ✅ 按钮 `.Text` 中文直述功能，不缩写
2. ✅ `.Desc` 有详细说明（Tooltip + 卡片解释）
3. ✅ `OnClick` 内部实现无空 block（无 `# TODO` 占位）
4. ✅ 若启动子进程：用 `Invoke-AsyncCommand` 登记 RunningJobs
5. ✅ 若进程由外部 .ps1 的 `Start-Process` 启动：输出 `[GUI-EVENT] [<NAME>-STARTED] PID=<n>` 并加到 outHandler
6. ✅ 若需要停止功能：`Stop-Job` 中要有对应分支 + fallback 路径
7. ✅ 运行中输出：用 `Write-Log` 写 GUI 内部 OutputBox，不用 `Write-Host`
8. ✅ 涉及端口：核对默认端口（cpolar=4040, prisma=5555, server=3000, 前端=3000）
9. ✅ 审计完成后：把按钮文字 + 行号 + 实现路径追加到本手册
