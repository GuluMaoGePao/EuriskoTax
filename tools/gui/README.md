# EuriskoTax 开发控制台 - 使用说明

> 一个基于 Windows Forms 的本地 GUI 工具，可视化执行常用开发指令。
> **完全本地运行，不消耗任何 AI 积分。**

---

## 一、快速开始

### 方式 1：双击启动（推荐）

1. 打开项目根目录 `e:\WorkPrograms\Trae\EuriskoTax\`
2. 双击 `tools/gui/EuriskoTax-Console.bat`
3. 控制台窗口打开后即可使用

### 方式 2：创建桌面快捷方式（一劳永逸）

1. 双击 `tools/gui/EuriskoTax-创建桌面快捷方式.bat`
2. 桌面会出现 `EuriskoTax 开发控制台` 快捷方式
3. 之后每次直接双击桌面快捷方式即可打开

### 方式 3：命令行启动

```powershell
powershell -ExecutionPolicy Bypass -STA -File .\tools\gui\gui-dev-console.ps1
```

---

## 二、界面布局说明

```
┌──────────────────────────────────────────────────────────────────┐
│  EuriskoTax  开发控制台              本地运行 · 不消耗积分       │ ← 顶部标题栏
├──────────┬───────────────────────────────────────────────────────┤
│ 🚀 启动管理 │  启动管理 - 选择启动模式                          │
│ 🗄️ 数据库  │  ┌────────────────────────────────────────────┐  │
│ 🧪 测试    │  │ 🌐 公网地址速览（仅 -Share 启动后显示）        │  │ ← 公网卡片
│ 📋 日志查看│  │  https://xxx.cpolar.cn   [复制] [发邮件]  │  │
│ 🚢 部署    │  └────────────────────────────────────────────┘  │
│ 🛠️ 常用工具│  ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│            │  │ ▶ 标准启动│ │⚡快速启动│ │🌐公网分享│         │
│            │  └──────────┘ └──────────┘ └──────────┘         │
│            │  ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│            │  │🛡️启动+守护│ │🔥完整测试│ │🔄开发模式│         │ ← 操作按钮区
│            │  └──────────┘ └──────────┘ └──────────┘         │
│            │  ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│            │  │🛑停止后端│ │🔒释放端口│ │📊查看端口│         │
│            │  └──────────┘ └──────────┘ └──────────┘         │
│            │  ─────────────────────────────────────────────  │
│ ⏹ 紧急停止│  │ 实时输出                                       │
│   所有任务 │  │ [12:30:00] ▶ 执行: ...                         │ ← 输出区
│            │  │ [12:30:01] ✓ 后端服务已启动                    │   (彩色显示)
│            │  │ ...                                            │
│            │  └────────────────────────────────────────────  │
│            │  [🧹清空] [💾保存] [📋复制] [🌐浏览器] [📚API文档]│ ← 输出工具栏
├──────────┴───────────────────────────────────────────────────────┤
│ ● 运行中 | PID: 12345 | 端口: 3000 | 时长: 00:05:30 | Tab: 启动管理│ ← 状态栏
└──────────────────────────────────────────────────────────────────┘
```

### 主要区域

| 区域 | 位置 | 功能 |
|------|------|------|
| **顶部标题栏** | 上方 60px | 显示应用名称和标语 |
| **左侧菜单** | 左侧 220px | 7 个功能 Tab（启动/数据库/测试/日志/部署/常用工具/Git&账号）+ 紧急停止按钮 |
| **公网地址速览卡片** | 启动管理 Tab 顶部（仅 -Share 模式出现） | 显示最新 cpolar 公网地址 + 一键复制 + 一键发邮件 + 自动刷新（3s） |
| **右侧操作区** | 右侧上半部 | 当前 Tab 对应的按钮组（每 Tab 6-9 个按钮） |
| **右侧输出区** | 右侧下半部 | RichTextBox，实时显示命令输出（彩色）；通过 `[GUI-EVENT]` 前缀捕获关键事件触发弹窗 |
| **输出工具栏** | 输出区底部 | 清空、保存、复制、打开浏览器、打开 API 文档 |
| **状态栏** | 最底部 | 服务状态、PID、端口、运行时长、当前 Tab |

### 颜色含义

| 颜色 | 含义 | 示例 |
|------|------|------|
| 🟩 浅绿 | 成功信息 | `✓ 后端服务已启动` |
| 🟨 黄色 | 警告信息 | `■ 已停止任务: backend` |
| 🟥 红色 | 错误信息 | `✗ 启动失败` |
| 🟦 青色 | 命令调用 | `▶ 执行: npm test` |
| ⬜ 白色 | 普通信息 | `[12:30:00] 服务器运行中...` |
| ⬛ 灰色 | 次要信息 | 路径、时间戳等 |
| 🟪 浅灰 | 命令输出 | 子进程的 stdout |
| 🟧 橙黄 | 命令错误 | 子进程的 stderr |

---

## 三、7 大功能面板详解（🚀 启动管理 · 🗄️ 数据库 · 🧪 测试 · 📋 日志查看 · 🚢 部署 · 🛠️ 常用工具 · 🔐 Git & 账号；另有左下角 ⏹ 紧急停止）

### 1. 🚀 启动管理

| 按钮 | 执行命令 | 适用场景 |
|------|---------|---------|
| **▶ 标准启动** | `ops-start-dev.ps1` | 首次启动、改动较大后启动（含环境检查、依赖、重置用户） |
| **⚡ 快速启动** | `ops-start-dev.ps1 -SkipInstall -SkipResetUser` | 日常调试，跳过依赖和用户重置，启动最快 |
| **🌐 公网分享启动** | `ops-start-dev.ps1 -Share` | 启动 + cpolar 公网隧道（临时 `http 3000 -region=cn`，无需预设命名隧道），给好友远程测试 |
| **🛡️ 启动 + 守护脚本** | `ops-start-dev.ps1 -Watchdog` | 启动 + watchdog 守护，进程异常自动重启 |
| **🔥 一键完整测试** | `ops-start-dev.ps1 -Share -Watchdog` | 后端 + cpolar 临时隧道 + watchdog，长期给好友测试时推荐（GUI 会显示公网卡片并弹窗通知） |
| **🔄 开发模式 (nodemon)** | `npm run dev` (server/) | 后端开发时使用，改后端代码自动重启 |
| **🛑 停止后端服务** | `Stop-Job backend` | 停止当前后端服务（含子进程） |
| **🔒 释放 3000 端口** | `Stop-Process` | 端口被占用时强制释放（找到并杀掉占用进程） |
| **📊 查看端口占用** | `Get-NetTCPConnection` | 查看 3000 端口的占用详情（PID、进程名、路径） |

### 2. 🗄️ 数据库

| 按钮 | 执行命令 | 适用场景 |
|------|---------|---------|
| **👤 重置 dev 用户** | `node tools/ops/reset-dev-user.js` | 重新创建 dev 测试用户（密码重置为 password） |
| **🔧 运行迁移** | `npx prisma migrate dev` | 修改 `schema.prisma` 后应用变更到数据库 |
| **🎨 Prisma Studio** | `npx prisma studio` | 浏览器可视化查看/编辑数据库（端口 5555） |
| **⚙️ 生成 Prisma Client** | `npx prisma generate` | 修改 schema 后必须执行，重新生成 Client |
| **📄 查看 schema.prisma** | `notepad schema.prisma` | 用记事本打开 schema 文件 |
| **🔄 重置数据库** | `npx prisma migrate reset --force` | ⚠️ 危险：清空并重建数据库，会丢失所有数据 |

> 数据库 Tab 自 v1.4.0 起含 **3 个功能区**：① Schema 管理（迁移/Studio/生成客户端/编辑 schema） ② 数据管理（重置 dev/强制重建） ③ **邀请码管理（一机一码，2026-09-06 新增）**：

| 按钮 | 执行命令 | 适用场景 |
|------|---------|---------|
| **🟪 生成邀请码到生产** | `POST {prod}/api/invites`（X-Admin-Token） | 输入数量（1-100）生成到生产，自动复制到剪贴板 |
| **🟪 生成邀请码到本地** | `POST {local}/api/invites` | 写入本地开发库（需本地后端已启动） |
| **🔵 查看生产/本地邀请码** | `GET /api/invites` | 拉取列表，按未使用/已使用分组展示（已使用显示注册用户名+时间） |
| **🟢 复制生产未使用邀请码** | `GET /api/invites` | 整批复制到剪贴板（一行一个），便于直接发给用户 |

> 邀请码按钮通过管理员令牌认证：优先读 `server/.env` 的 `ADMIN_TOKEN`，缺失时弹窗输入一次并自动保存。生产地址 `https://euriskotax.zeabur.app`，本地 `http://localhost:3000`。

### 3. 🧪 测试

| 按钮 | 执行命令 | 适用场景 |
|------|---------|---------|
| **🧪 运行所有测试** | `npm test` (项目根) | 跑全部 Jest 测试套件（含覆盖率） |
| **👁️ 监听模式** | `npm run test:watch` | 开发时使用，文件变更自动跑相关测试 |
| **⚡ 性能基准测试** | `npm run test:performance` | 运行 `tests/performance/benchmark.js` |
| **📊 打开覆盖率报告** | 打开 `coverage/index.html` | 浏览器查看 HTML 覆盖率报告 |
| **🛑 停止监听模式** | `Stop-Job testwatch` | 停止 test:watch 任务 |
| **📁 打开 tests 目录** | 资源管理器 | 在文件管理器中打开 tests 目录 |

> **发布门禁卡片**：本面板底部还含 **✅ 本地登录链路验证（verify:local）** = `npm run verify:local`（`server/scripts/verify-local-auth.js`）。部署前**必须跑绿**：真实起本地后端验证 登录 dev 账号 → 邀请码+验证码注册新号 → 新号登录 全链路，并核对前端/SW 指纹。失败显示红字，此时**禁止发布**。

### 4. 📋 日志查看

| 按钮 | 功能 | 适用场景 |
|------|------|---------|
| **📋 watchdog.log 末尾 100 行** | 显示守护脚本日志 | 排查守护脚本运行问题 |
| **📋 events.log 末尾 100 行** | 显示事件日志 | 查看重启、URL 变更等事件 |
| **📋 notify.log 末尾 100 行** | 显示邮件发送日志 | 排查邮件通知失败 |
| **📂 打开日志目录** | 资源管理器打开 tools/ops/ | 手动查看/编辑日志文件 |
| **📮 发送测试邮件** | `Send-TestNotification` | 测试邮件通知是否正常 |
| **🗑️ 清空所有日志** | 清空 3 个 .log 文件 | 日志过大时清理（需确认） |

### 5. 🚢 部署

| 按钮 | 执行命令 | 适用场景 |
|------|---------|---------|
| **🧪 DryRun 预览部署** | `ops-deploy.ps1 -DryRun` | 预览打包结果但不实际部署 |
| **🚀 正式部署** | `ops-deploy.ps1` | 完整部署流程（测试→打包→传输→重启→健康检查） |
| **⚡ 跳过测试部署** | `ops-deploy.ps1 -SkipTest` | 紧急修复直接部署（跳过测试） |
| **↩️ 回滚到上一版本** | `ops-deploy.ps1 -Rollback` | 回滚到上一发布版本 |
| **🔧 初始化服务器环境变量** | `ops-deploy.ps1 -InitEnv` | 首次部署时在服务器初始化 .env |
| **📝 编辑 deploy.config.json** | 记事本 | 编辑部署配置（不存在则从模板创建） |

### 6. 🛠️ 常用工具

| 按钮 | 功能 |
|------|------|
| **📁 项目根目录** | 资源管理器打开 `e:\WorkPrograms\Trae\EuriskoTax\` |
| **📁 server 目录** | 资源管理器打开后端目录 |
| **📁 src 前端目录** | 资源管理器打开前端代码目录 |
| **📁 tools/ops 目录** | 资源管理器打开脚本目录 |
| **📁 tests 测试目录** | 资源管理器打开 Jest 测试套件目录 |
| **📁 docs 文档目录** | 资源管理器打开技术报告/文档目录 |
| **💻 PowerShell (项目根)** | 在项目根打开新 PowerShell 窗口 |
| **💻 PowerShell (server)** | 在 server 目录打开新 PowerShell 窗口 |
| **🌐 打开前端** | 浏览器打开 http://localhost:3000/ |
| **📚 打开 API 文档（自动）** | 自定义 Swagger + 一键取 Token 授权，直接 Try it out |

### 7. 🔐 Git & 账号

> 本面板包含 **4 个功能卡片**：① 分支管理与版本切换  ② Git 操作与项目文档  ③ 账号密码管理  ④ 🚀 安全发布（Zeabur 唯一上线入口）

#### 7.1 分支管理 & 版本切换 ⭐新增

**分支说明**：当前主分支为 `main`（全栈版本，日常开发用）；`archive/*` 为只读存档分支，用于查阅历史版本。

**🎯 当前分支显示**：本卡片顶部有一个醒目的彩色大标签实时显示当前分支（颜色区分类型：main=绿 / feature=紫 / fix=红 / archive=灰 / 其他=蓝；脏状态会变橙色并标注未提交改动数）。切换分支后自动刷新；也可点【🔄 刷新当前分支显示】手动同步。

| 按钮 | 执行命令 | 适用场景 |
|------|---------|---------|
| **🔍 查看所有分支** | `git branch -a` | ✅ **弹窗+输出区双通道显示**：弹窗分组展示本地/远程分支列表（当前分支 ⭐ 高亮），同时在下方输出区显示 `git branch -a` 详细结果 |
| **📋 当前分支详情** | `git branch -vv` | 每个分支的跟踪远程分支 + 最后提交哈希 + 说明（输出在下方输出区） |
| **🏷️ 查看所有标签** | `git tag -l -n5` | 显示所有版本标签（v1.0.0 静态版、v1.2.0 全栈版等，对应 GitHub Releases） |
| **🔀 切换分支（下拉选择）** ⭐推荐 | `git checkout <分支名>` | ✅ **下拉框直接选择**，不再手动输入！列出所有本地+远程分支（当前分支 ✅ 标记），切换前自动脏检查保护代码 |
| **🌿 快速切回 main 主分支** | `git checkout main` | ⭐ 一键回到日常开发主线（全栈版本），切换前自动脏检查 |
| **🔄 刷新当前分支显示** | (内部刷新) | 手动同步卡片顶部当前分支大标签状态 |
| **📦 查看 v1.0 存档版** | `git checkout archive/v1.0-static-frontend` | 只读历史版本：项目初期纯前端静态网页（无后端），切换前自动脏检查 |
| **📦 查看 v1.2 存档版** | `git checkout archive/v1.2-fullstack-gui` | 只读历史版本：v1.2 全栈版永久存档快照，切换前自动脏检查 |
| **➕ 新建功能分支** | `git checkout -b <分支名>` | 基于当前分支新建 `feature/xxx` 或 `fix/xxx` 分支（输入分支名），新建后自动出现在下拉选项中 |

> 🛡️ **代码安全保护（三重防护）**：所有切换分支操作前会自动调用 `Assert-WorkingTreeClean` 脏检查，检测到未提交改动时弹窗三选一：
> - 🛑 **取消操作（推荐）**：不切换，先去处理改动
> - 📦 **自动暂存**：执行 `git stash push` 后切换，以后可用 `git stash pop` 恢复
> - ⚠️ **强制尝试**：直接调用 `git checkout`，若有冲突 Git 自身会拒绝切换
>
> ✅ **下拉选项自动包含新建分支**：`Show-BranchPicker` 每次打开都会实时调用 `git for-each-ref` 读取最新分支列表，不缓存、不硬编码。无论是 GUI 中新建、命令行新建、还是 `git pull` 拉取的远程新分支，下次打开下拉框都会自动出现。
>
> ⚠️ **存档分支只读**：`archive/*` 分支仅供查阅代码，不要在此分支做修改或提交！看完记得点【🌿 快速切回 main 主分支】回到开发主线。

##### 🔬 资源泄漏测试（开发自检）

为确保对话框连续打开关闭不会泄漏 GDI 句柄，本工具附带自动化测试脚本：

```bash
# 在 PowerShell 中运行（默认 100 次迭代）
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/gui/tests/test-dialog-resource-leak.ps1

# 自定义迭代次数（建议 200 次以放大对比效果）
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/gui/tests/test-dialog-resource-leak.ps1 -Iterations 200
```

**测试原理**：通过 Win32 API `GetGuiResources` 读取进程的 GDI Objects 计数，对比「旧实现（不 Dispose）」和「新实现（try/finally 保证 Dispose）」各迭代 N 次后的 GDI 增量。新实现增量应为 0（无泄漏）。

**最近一次测试结果**（Iterations=100）：

| 测试项 | 旧实现 ΔGDI | 新实现 ΔGDI | 结果 |
|--------|-----------|-----------|------|
| Show-BranchPicker (分支下拉对话框) | +6 | +0 | ✅ PASS |
| SaveFileDialog (保存日志对话框) | +0 | +0 | ✅ PASS |
| searchForm (Ctrl+K 搜索对话框) | +0 | +0 | ✅ PASS |

测试覆盖的对话框与修复点：

| 文件位置 | 对话框类型 | 修复方式 |
|---------|----------|---------|
| `Show-BranchPicker` 函数 | 自定义 Form | `try { ShowDialog; return } finally { Dispose }` |
| 「💾 保存日志」按钮回调 | SaveFileDialog | `try { ShowDialog } finally { Dispose }` |
| Ctrl+K 搜索快捷键回调 | 自定义 Form | `try { ShowDialog } finally { Dispose }` |

#### 7.2 Git 操作 & 项目文档

| 按钮 | 执行命令 | 适用场景 |
|------|---------|---------|
| **📊 Git 状态** | `git status` | 查看文件修改状态、当前分支名等 |
| **📜 Git 日志** | `git log -n 10 --stat` | 最近 10 条提交记录（含变更文件统计） |
| **🔄 Git Pull** | `git pull` | 从远程仓库拉取最新提交 |
| **📤 Git Push** | `git push` | 推送本地提交（弹窗确认，防误操作） |
| **📝 Git Diff** | `git diff` | 工作区代码 vs 上次提交的差异 |
| **📄 CHANGELOG 变更日志** | 打开 `CHANGELOG.md` | 查看项目历史版本改动说明 |
| **📄 开发计划文档** | 打开 `docs/development/development-plan.md` | 查阅开发计划与路线图 |
| **📄 税务计算规则** | 打开 `docs/guides/tax-calculation-rules.md` | 计税规则详细参考手册 |

#### 7.3 账号 & 密码管理

> 所有账号密码统一列表，点击按钮可一键复制到剪贴板。生产环境请自行替换为强密码。

| 按钮 | 账号 / 用途 | 默认值 |
|------|-------------|--------|
| **👤 项目登录账号** | 前端登录用邮箱 | `dev@example.com` |
| **🔑 项目登录密码** | 前端登录密码（可重置） | `password` |
| **📋 一键复制登录信息** | 邮箱 + 密码一次复制 | `dev@example.com / password` |
| **🔐 JWT Secret Key** | 后端 JWT 签名密钥（server/.env） | `dev-secret-key-change-in-production` |
| **📧 QQ邮箱授权码** | 看门狗邮件通知（tools/ops/notify.config.json） | 自行配置 |

#### 7.4 安全发布（Zeabur 云端 · 唯一上线入口）⭐

> **正式上线只走这里**，替代"裸 git push"。内部流水线（`tools/ops/ops-publish.ps1`）：
> ① 本地登录链路门禁 `verify:local`（**不过立刻中止**，不会 push）→ ② `git add -A` + `commit`（提交说明弹窗填写，可留空自动生成）→ ③ `git push origin main`（触发 Zeabur 构建部署）→ ④ 自动轮询线上资源指纹（`ops-check-prod.ps1`）直至核对为新版本。

| 按钮 | 执行脚本 | 说明 |
|------|---------|------|
| **🚀 安全发布** | `ops-publish.ps1 -CommitMsg "..."` | 一键受控上线：本地全绿 → commit → push → 线上核对。执行前弹窗确认提交说明，点【取消】则中止 |
| **🧪 安全发布试运行** | `ops-publish.ps1 -DryRun` | 零风险预演：只跑本地 verify:local 门禁，不 commit、不 push。正式发布前建议先点它确认能全绿 |

> 🛡️ **发布纪律**：本地门禁不过 → 脚本直接退出，代码不会进入远程 main → 不会触发 Zeabur 自动部署。只有"本地验证全绿"的代码才能被发布上线。
| **🌐 Cpolar Token** | 内网穿透授权 | 自行注册配置 |
| **🔑 获取 Bearer Token** | 自动调用登录 API 获取 JWT（1小时有效） | 自动生成并复制到剪贴板 |
| **🖥 部署 SSH 配置** | 生产服务器 SSH 账号（ops-deploy.config.json） | 自行配置 |
| **🚀 一键查看 API 文档** | 全自动：登录 → 取 Token → 生成 Swagger → 自动授权 | 直接调试接口 |

---

## 四、输出区工具栏

| 按钮 | 功能 |
|------|------|
| **🧹 清空输出** | 清空当前 RichTextBox 中的所有内容 |
| **💾 保存日志** | 将当前输出保存为 txt 文件（自动带时间戳命名） |
| **📋 复制输出** | 全选并复制到剪贴板 |
| **🌐 打开浏览器** | 打开 http://localhost:3000/ |
| **📚 API 文档** | 打开 http://localhost:3000/api/docs |

---

## 五、状态栏说明

状态栏实时显示后端服务状态：

```
● 运行中  |  PID: 12345  |  端口: 3000  |  时长: 00:05:30  |  Tab: 启动管理
```

- **● 运行中** / **○ 未运行**：后端服务进程状态
- **PID: 12345**：后端进程的 Windows 进程 ID（用于任务管理器查找）
- **端口: 3000**：固定监听端口
- **时长: 00:05:30**：自后端启动以来经过的时间（每秒更新）
- **Tab: 启动管理**：当前选中的功能 Tab 名称

---

## 六、紧急停止

- **左下角 [⏹ 紧急停止所有]**：弹窗确认后，停止所有正在运行的任务，并释放 3000 端口
- **关闭窗口**：若有任务在运行，会询问「停止 / 不停止 / 取消退出」

---

## 七、典型使用场景

### 场景 1：日常调试启动

1. 双击 `tools/gui/EuriskoTax-Console.bat`
2. 在「启动管理」Tab 点击 **⚡ 快速启动**（跳过依赖和用户重置）
3. 等待输出区显示 `服务器运行在 http://localhost:3000`
4. 点击 **🌐 打开浏览器** 或直接在浏览器访问 `http://localhost:3000/`
5. 用 `dev@example.com / password` 登录
6. 调试完毕点击 **🛑 停止后端服务**

### 场景 2：改了后端代码后调试

1. 双击 `tools/gui/EuriskoTax-Console.bat`
2. 在「启动管理」Tab 点击 **🔄 开发模式 (nodemon)**
3. 修改 `server/src/` 下的代码，nodemon 会自动重启后端
4. 输出区实时看到重启日志

### 场景 3：给好友远程测试

1. 双击 `tools/gui/EuriskoTax-Console.bat`
2. 在「启动管理」Tab 点击 **🔥 一键完整测试**（后端 + cpolar 临时隧道 + 守护脚本）
3. GUI 顶部会出现「🌐 公网地址速览」卡片，**首次生成公网地址时会弹出 MessageBox（仅 1 次，180s 内去重）**，同时地址自动写入剪贴板
4. 卡片中也可随时点「复制」按钮 / 点卡片主体再次复制；点「📮 发邮件」按钮把新地址手动发给收件人
5. 邮件**成功发送** / **失败/未发送**也会分别弹 1 个 MessageBox（各带 180s 去重）
6. 守护脚本会自动重启异常进程；**地址变更**会再弹 1 个 MessageBox，并触发 URL_CHANGED 邮件
7. 测试账号仍是 `dev@example.com / password`

> 🔁 **关于"为什么不重复弹窗"**：GUI 对 4 类事件（URL 首次 / URL 变更 / 邮件成功 / 邮件失败）均内置 180s 全局去重，且 outHandler 与公网卡片刷新函数通过 `PublicUrlLastSeen`、`UrlPopupMode` 做了职责互斥，同一件事不会被多个入口重复弹窗。如果你在 180s 内确实需要再看一次，可切换到「📋 日志查看」→ 看 events.log / notify.log，或直接点「🌐 公网地址速览」卡片即可重新复制。

### 场景 4：跑测试

1. 双击 `tools/gui/EuriskoTax-Console.bat`
2. 在「测试」Tab 点击 **🧪 运行所有测试**
3. 输出区实时显示测试结果
4. 测试完成后点击 **📊 打开覆盖率报告** 查看详细覆盖率

### 场景 5：修改了数据库 schema

1. 双击 `tools/gui/EuriskoTax-Console.bat`
2. 在「数据库」Tab 点击 **📄 查看 schema.prisma** 编辑 schema
3. 保存后点击 **🔧 运行迁移** 应用变更
4. 再点击 **⚙️ 生成 Prisma Client** 更新 Client

### 场景 6：部署到生产服务器

1. 双击 `tools/gui/EuriskoTax-Console.bat`
2. 在「部署」Tab 点击 **🧪 DryRun 预览部署** 检查打包
3. 确认无误后点击 **🚀 正式部署**
4. 弹窗确认后开始部署，输出区显示完整流程
5. 若部署出问题，点击 **↩️ 回滚到上一版本**

### 场景 7：端口被占用

1. 双击 `tools/gui/EuriskoTax-Console.bat`
2. 在「启动管理」Tab 点击 **📊 查看端口占用** 看是谁占了 3000
3. 确认后点击 **🔒 释放 3000 端口** 强制释放
4. 重新启动服务

---

## 八、文件清单

| 文件 | 用途 |
|------|------|
| `tools/gui/EuriskoTax-Console.bat` | 双击启动器（含 UTF8 BOM 自动修复） |
| `tools/gui/EuriskoTax-创建桌面快捷方式.bat` | 一次性创建桌面快捷方式（含图标缓存刷新） |
| `tools/gui/gui-dev-console.ps1` | GUI 主脚本（含覆盖式滚动条 v3.2） |
| `tools/gui/_create_shortcut.ps1` | 桌面快捷方式创建脚本（含 ICO 自动重建） |
| `tools/gui/tests/test-dialog-resource-leak.ps1` | 对话框 GDI 资源泄漏自动化测试（验证 try/finally Dispose 修复有效） |
| `tools/gui/README.md` | 本说明文档 |

---

## 九、常见问题

### Q1：双击 .bat 文件后窗口一闪而过

**原因**：可能是 PowerShell 执行策略限制或脚本错误。

**解决**：
1. 右键 `tools/gui/EuriskoTax-Console.bat` → 用 PowerShell 运行
2. 或打开 PowerShell 执行：
   ```powershell
   Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy Bypass
   ```

### Q2：中文显示乱码

**原因**：系统编码问题。

**解决**：本工具已强制 UTF-8 编码，正常情况下不会乱码。如仍乱码，可在 PowerShell 中先执行 `chcp 65001` 后再启动。

### Q3：按钮点击没反应

**原因**：可能有同名任务正在运行（如多次点击「标准启动」）。

**解决**：
- 查看输出区是否有「任务 'xxx' 已在运行，请先停止」提示
- 点击「🛑 停止后端服务」或「⏹ 紧急停止所有」后重试

### Q4：命令输出迟迟不显示

**原因**：部分命令（如 npm install）执行较慢，且 PowerShell 缓冲可能延迟。

**解决**：等待几秒，输出会以流式方式逐步显示。也可点击其他按钮执行新命令（异步执行，不会阻塞）。

### Q5：关闭窗口后端口还被占用

**原因**：子进程未完全退出。

**解决**：重新打开控制台 → 启动管理 → **🔒 释放 3000 端口**。

### Q6：cpolar 公网地址获取失败

**原因**：cpolar 未配置 authtoken、网络问题或 watchdog 尝试启动命名隧道（eurisko）但用户 cpolar.yml 中无此预设。

> 自 v1.2.0 起，`ops-start-dev.ps1 -Share` 与 `ops-watchdog.ps1` 已**统一使用临时隧道 `cpolar http 3000 -region=cn`**，不再依赖命名隧道。若你仍遇到问题，按以下步骤排查：

**解决**：
1. 打开终端执行 `.\tools\cpolar\cpolar.exe authtoken <你的token>`（只需一次）
2. 确认无需配置 `~/.cpolar/cpolar.yml` 的 named tunnels，直接使用临时命令即可
3. 或访问 cpolar 仪表盘 `http://127.0.0.1:4040/` 手动查看
4. 如 watchdog 之前仍在用旧脚本，重启 GUI 后重新点击 **🔥 一键完整测试**

---

## 十、设计理念

### 为什么用 PowerShell + Windows Forms？

| 方案 | 优势 | 劣势 | 是否选用 |
|------|------|------|---------|
| **PowerShell + WinForms** | Windows 原生支持，零依赖，可直接调用现有 .ps1 脚本 | 仅 Windows | ✅ |
| Electron | 跨平台，UI 漂亮 | 体积 200MB+，需安装 Node | ❌ |
| Tauri | 体积小 | 需 Rust 环境 | ❌ |
| HTA | 极轻量 | 已过时，安全限制多 | ❌ |

### 为什么不消耗积分？

- 所有命令在本地 PowerShell 进程中执行
- 输出实时显示在 GUI 中
- 不调用任何 AI 接口
- 你可以反复点击按钮、查看输出、调试问题，**0 积分消耗**

### 异步执行机制

每个按钮点击会创建独立的 `System.Diagnostics.Process` 进程：
- 主 UI 线程不阻塞，可同时执行多个命令
- 通过 `OutputDataReceived` / `ErrorDataReceived` 事件流式读取输出
- 任务名（如 `backend`、`test`、`git`）作为唯一标识，便于停止

---

## 十一、扩展与自定义

### 添加新按钮

编辑 `tools/gui/gui-dev-console.ps1`，在对应 Tab 的 `btnPanel*.Controls.Add(...)` 后添加：

```powershell
$btnPanel1.Controls.Add((New-ActionButton -Text "🎁 我的新功能" -X 10 -Y 220 -W 240 -H 60 `
    -Desc "新功能的说明文字" `
    -Color "60, 140, 80" `
    -OnClick {
        Invoke-AsyncCommand -Name "mytask" -Command "your-command-here" -WorkingDir $ProjectRoot
    }))
```

**参数说明**：
- `-Text`：按钮文字（`` `n `` 换行）
- `-X -Y`：按钮位置（每行高度 70）
- `-W -H`：宽高（默认 175×60，建议宽按钮用 240×60）
- `-Color`：RGB 三色，逗号分隔
- `-Desc`：Tooltip 描述
- `-OnClick`：点击执行的脚本块

### 修改主题色

搜索 `[System.Drawing.Color]::FromArgb(...)` 修改全局配色：
- 主背景：`FromArgb(30, 30, 30)` 深灰
- 面板背景：`FromArgb(35, 35, 35)`
- 标题栏：`FromArgb(45, 45, 48)`
- 选中 Tab：`FromArgb(70, 110, 200)` 蓝色

---

## 十二、技术细节

### 进程管理

- `$script:RunningJobs` 哈希表保存所有运行中的进程
- `$script:BackendProcess` 单独跟踪后端服务（用于状态栏显示）
- 停止时使用 `taskkill /T /F` 杀掉整个进程树（包括子进程）
- `Exited` 事件自动清理状态并更新状态栏

### 输出渲染

- 使用 `RichTextBox` 而非 `TextBox`，支持彩色文字
- 通过 `SelectionStart` + `SelectionColor` 实现按颜色追加
- `ScrollToCaret()` 自动滚动到最新行
- UTF-8 编码确保中文正常显示

### 覆盖式滚动条 v3.2（macOS 风）

GUI 输出区和滚动面板使用自定义覆盖式滚动条替代原生 Windows 滚动条，实现 Chromium/VSCode 级别的现代滚动体验。

**核心原理**：创建一个与原生滚动条同宽的透明 Panel 覆盖在原生条上方，主动画 Target 背景色填满 overlay（彻底覆盖原生条白底），再在上面绘制 5/8px 视觉胶囊滑块。

| 特性 | 实现细节 |
|------|---------|
| **超细** | 常态 5px，悬停/拖拽插值增粗到 8px |
| **高透明** | 4 档 Alpha：静止 0（完全隐藏）/ 滚动中 85 / 悬停 155 / 拖拽 210 |
| **精致** | 胶囊圆角（两端半圆）+ 悬停双层柔光光晕 |
| **智能隐藏** | 静止 1.1s 后淡出消失（macOS 风） |
| **平滑动画** | 60FPS 全局共享定时器，位置/Alpha/宽度三重插值 |
| **DPI 自适应** | `SystemInformation.VerticalScrollBarWidth` 获取真实原生条宽度 |
| **滚轮转发** | overlay 捕获 MouseWheel 后直接计算滚动位置 |

**几何参数**（位于 `New-ScrollbarOverlay` 函数顶部，调观感只需改这几个数字）：

```powershell
[int]$NATIVE_W = 17  # 默认值，实际从 SystemInformation 获取
[int]$STRIP_W  = 5   # 常态视觉宽
[int]$FAT_W    = 8   # 悬停/拖拽视觉宽
[int]$MIN_H    = 26  # 滑块最小高度
[int]$STRIP_RPAD = 4 # 右侧留白
```

### UTF8 BOM 自动修复

`EuriskoTax-Console.bat` 启动前会自动检测 `gui-dev-console.ps1` 是否有 UTF8 BOM，缺失时自动补充。这是为了解决 PowerShell 5.1 在中文 Windows 环境下，使用 GBK 编码读取无 BOM 的 UTF8 文件导致中文乱码的问题。

### 路径解析

```powershell
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path   # tools/gui/
$ProjectRoot = Split-Path -Parent $ScriptDir                   # 项目根
$ServerDir = Join-Path $ProjectRoot "server"                   # server/
```

脚本可在任何位置调用，路径自适应。

---

## 十三、版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.3 | 2026-08-15 | 覆盖式滚动条 v3.2（超细5px+高透明+macOS风智能隐藏）；桌面图标放大1.5×；UTF8 BOM 自动修复；多项健壮性修复 |
| v1.2 | 2026-04-15 | 公网地址速览卡片；事件弹窗通知（180s 去重）；cpolar 临时隧道统一；[GUI-EVENT] 双通道输出捕获 |
| v1.0 | 2026-08-14 | 初始版本：6 大面板、30+ 按钮、实时输出、进程管理 |

---

## 十四、反馈与改进

如需新增功能按钮或修改行为：
1. 编辑 `tools/gui/gui-dev-console.ps1`
2. 参考第十一节「添加新按钮」
3. 保存后重新双击 `tools/gui/EuriskoTax-Console.bat` 即可生效

或者，把需求告诉 AI（一次性消耗积分），让 AI 帮你扩展功能后，后续使用就完全不消耗积分了。
