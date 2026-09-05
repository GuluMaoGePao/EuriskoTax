# EuriskoTax Watchdog 监控与邮件通知系统部署指南

> 文档版本：v1.2 | 更新日期：2026-04-15
> 适用范围：EuriskoTax 开发环境完整监控与通知系统部署

---

## 一、系统概述

EuriskoTax Watchdog 是一套完整的开发环境守护系统，包含以下核心能力：

1. **后端服务监控** — 每 20 秒检查 Node.js 后端是否存活，崩溃时自动重启
2. **cpolar 隧道监控** — 检查公网隧道是否正常，断连时自动重启（使用临时隧道，无需预设命名隧道）
3. **公网地址变更检测** — 当 cpolar 分配新的公网 URL 时自动检测
4. **邮件通知** — 首次生成地址（URL_CREATED）与地址变更（URL_CHANGED）均会发送中文邮件通知给测试员
5. **结构化事件日志** — 所有重启/变更事件记录到 events.log 便于排查
6. **GUI 可视化与主动弹窗** — EuriskoTax 开发控制台（WinForms GUI）提供「🌐 公网地址速览」卡片，并对 URL 首次生成 / URL 变更 / 邮件成功 / 邮件失败 4 类事件弹 MessageBox；所有弹窗均带 180s 全局去重，不会重复弹出

### 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    watchdog.ps1（守护主进程）                 │
│                                                             │
│  每 20 秒轮询                                                │
│  ├─ 检查后端服务（:3000 端口 + HTTP 响应）                    │
│  └─ 检查 cpolar 隧道（进程存活 + 公网 URL 可达）              │
│                                                             │
│  异常时 ──→ 诊断原因 ──→ 自动重启 ──→ 记录事件 ──→ 判断是否   │
│                                    │              发送邮件   │
│                         ┌──────────┘              │        │
│                         ▼                         ▼        │
│              ┌─────────────────┐       ┌────────────────┐   │
│              │   events.log    │       │  仅 URL_CHANGED │   │
│              │  （全部事件）   │       │  发送邮件通知   │   │
│              │                 │       │                │   │
│              │ BACKEND_RESTART │       │  notify.ps1    │   │
│              │ CPOLAR_RESTART  │       │  ├ 加载模板     │   │
│              │ URL_CHANGED     │       │  ├ reason转中文│   │
│              │ RESTART_FAILED  │       │  ├ HTML渲染    │   │
│              └─────────────────┘       │  └ SMTP发送    │   │
│                                        │    ↓           │   │
│                                        │  notify.log    │   │
│                                        │  （详细日志）  │   │
│                                        └────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、文件清单

### 核心脚本

| 文件 | 用途 | 必需 |
|------|------|------|
| [ops-watchdog.ps1](../../tools/ops/ops-watchdog.ps1) | 守护主脚本，监控+重启+事件记录+公网URL文件持久化+[GUI-EVENT]输出 | 是 |
| [ops-notify.ps1](../../tools/ops/ops-notify.ps1) | 邮件发送模块，模板加载+SMTP发送+日志 | 是 |
| [ops-start-dev.ps1](../../tools/ops/ops-start-dev.ps1) | 一键启动脚本（环境检查+依赖+重置用户+启动服务+守护，输出[GUI-EVENT]） | 是 |
| [gui-dev-console.ps1](../../tools/gui/gui-dev-console.ps1) | GUI 开发控制台（公网卡片+180s去重弹窗） | 否（但推荐） |

### 配置文件

| 文件 | 用途 | 必需 | Git跟踪 |
|------|------|------|---------|
| [notify.config.json](../../tools/ops/notify.config.json) | SMTP配置、收件人列表、通知开关（**新增notifyOn.urlCreated**） | 是 | ❌ 已gitignore |
| [ops-notify-templates.json](../../tools/ops/ops-notify-templates.json) | 中文邮件模板 v3.2（URL_CREATED + URL_CHANGED + TEST） | 是 | ✅ |
| [ops-notify-reason-map.json](../../tools/ops/ops-notify-reason-map.json) | reason代码到中文描述的映射（14种） | 是 | ✅ |
| `%TEMP%\euriskotax-last-cpolar-url.txt` | 共享公网地址持久化文件（GUI/启动脚本/守护脚本互通） | 运行时生成 | — |
| `~/.cpolar/cpolar.yml` | cpolar authtoken 配置（*无需*配置 named tunnels） | 仅 authtoken 必需 | — |

> 💡 **v1.2+ 变更**：cpolar 启动已从 `cpolar start eurisko`（命名隧道，需要用户 cpolar.yml 配置 eurisko 隧道）统一为 **`cpolar http 3000 -region=cn`（临时隧道）**。用户只需执行一次 `cpolar authtoken <token>` 即可，无需任何 tunnels 段配置。

### 日志文件（自动生成）

| 文件 | 用途 | 查看命令 |
|------|------|---------|
| watchdog.log | 守护脚本运行日志（心跳+状态） | `Get-Content .\tools\ops\watchdog.log -Tail 20` |
| events.log | 结构化重启事件日志 | `Get-Content .\tools\ops\events.log -Tail 20` |
| notify.log | 邮件发送详细日志（排查用） | `Get-Content .\tools\ops\notify.log -Tail 30` |
| `%TEMP%\eurisko-server-watchdog.log` | 后端服务stdout | 按需查看 |
| `%TEMP%\eurisko-server-watchdog.err` | 后端服务stderr | 按需查看 |
| `%TEMP%\cpolar-euriskotax-watchdog.log` | cpolar stdout（watchdog启动时） | 按需查看 |

---

## 三、环境要求

### 必需软件

| 软件 | 版本 | 验证命令 |
|------|------|---------|
| Node.js | 16+ | `node --version` |
| npm | 8+ | `npm --version` |
| PowerShell | 5.1+（Windows自带） | `$PSVersionTable.PSVersion` |
| cpolar | 最新版 | `cpolar version` |

### 可选软件（用于公网分享）

| 软件 | 用途 | 下载 |
|------|------|------|
| cpolar | 内网穿透，生成公网测试地址 | https://www.cpolar.com/ |

### QQ邮箱授权码（用于邮件通知）

1. 登录 [mail.qq.com](https://mail.qq.com)
2. 进入 **设置** → **账户**
3. 找到 **POP3/SMTP服务**，点击 **开启**
4. 按提示用手机发送短信获取授权码（16位字符）
5. 保存授权码，后面填入配置文件

---

## 四、安装步骤

### 4.1 克隆项目

```powershell
git clone <repository-url>
cd EuriskoTax
```

### 4.2 安装后端依赖

```powershell
cd server
npm install
npx prisma migrate dev
cd ..
```

### 4.3 配置环境变量

编辑 [server/.env](../../server/.env)：

```env
PORT=3000
JWT_SECRET=your-strong-secret-here
JWT_EXPIRES_IN=1h
DATABASE_URL="file:./dev.db"
```

### 4.4 配置 cpolar（如需公网分享）

> **自 v1.2 起不再需要配置 named tunnels（eurisko 段）**，只需执行 1 次 authtoken，所有脚本（ops-start-dev / ops-watchdog / GUI）均使用临时命令 `cpolar http 3000 -region=cn`。

```powershell
# 执行 1 次即可（把 <your-token> 换成 cpolar 控制台获取到的 authtoken）
.\tools\cpolar\cpolar.exe authtoken <your-token>
```

执行后 `~/.cpolar/cpolar.yml` 会自动生成 authtoken 字段，无需再手工添加 `tunnels:` 段。

### 4.5 配置邮件通知

创建 [notify.config.json](../../tools/ops/notify.config.json)：

```json
{
  "smtp": {
    "host": "smtp.qq.com",
    "port": 587,
    "useSsl": true,
    "from": "你的QQ邮箱@qq.com",
    "password": "你的QQ邮箱授权码",
    "displayName": "EuriskoTax Watchdog"
  },
  "recipients": [
    "收件人1@qq.com",
    "收件人2@qq.com"
  ],
  "enabled": true,
  "notifyOn": {
    "backendRestart": false,
    "cpolarRestart": false,
    "urlCreated": true,
    "urlChanged": true,
    "restartFailed": false
  }
}
```

> **通知策略**：默认 `urlCreated` 与 `urlChanged` 为 `true`，其他事件仅记录到 events.log。`urlCreated=true` 时每次点击「启动+分享」或「🔥 完整测试」首次生成公网地址也会立即发邮件，不用等地址变更。调整开关无需重启 watchdog。

### 4.6 重置开发用户

```powershell
cd server
node scripts/reset-dev-user.js
cd ..
```

测试账号：`dev@example.com` / `password`

### 4.7 验证安装

```powershell
# 发送测试邮件
. .\tools\ops\ops-notify.ps1
Send-TestNotification
```

如果两个收件人都收到测试邮件，说明配置成功。

---

## 五、启动方式

### 5.1 一键启动（推荐）

#### 方式 A：图形化（给"朋友联调"时最省事）—— GUI

双击 `tools/gui/EuriskoTax-Console.bat` 打开 EuriskoTax 开发控制台 → 进入「🚀 启动管理」Tab → 点击 **🔥 完整测试**（= `-Share -Watchdog`）。GUI 会：
- 捕获子进程的 `[GUI-EVENT]` 行；
- 在 Tab 顶部显示「🌐 公网地址速览」卡片（点一下复制，每 3s 刷新）；
- 对 4 类事件弹 1 次 MessageBox（180s 去重，不会重复弹）：URL 首次生成 / URL 变更 / 邮件成功 / 邮件失败。

#### 方式 B：命令行

```powershell
# 完整启动：环境检查 + 依赖安装 + 重置用户 + 启动后端 + cpolar 临时隧道 + 守护
.\tools\ops\ops-start-dev.ps1 -Share -Watchdog

# 跳过依赖安装和用户重置（快速启动）
.\tools\ops\ops-start-dev.ps1 -Share -Watchdog -SkipInstall -SkipResetUser
```

### 5.2 单独启动 watchdog

```powershell
# 带公网分享（临时隧道 http 3000 -region=cn）
.\tools\ops\ops-watchdog.ps1 -Share -IntervalSec 20

# 不带公网分享（仅监控后端）
.\tools\ops\ops-watchdog.ps1 -IntervalSec 20
```

### 5.3 启动参数说明

| 参数 | 脚本 | 说明 |
|------|------|------|
| `-Share` | ops-start-dev.ps1, ops-watchdog.ps1 | 启用 cpolar 公网隧道监控（临时命令 `cpolar http 3000 -region=cn`） |
| `-Watchdog` | ops-start-dev.ps1 | 启动后自动拉起 ops-watchdog 守护进程 |
| `-SkipInstall` | ops-start-dev.ps1 | 跳过 npm install |
| `-SkipResetUser` | ops-start-dev.ps1 | 跳过用户重置 |
| `-IntervalSec` | ops-watchdog.ps1 | 轮询间隔秒数（默认20） |
| `-MaxRestarts` | ops-watchdog.ps1 | 最大重启次数（默认0=无限） |

> 🔁 **GUI 与命令行共享 URL**：无论哪种方式启动，最新公网地址都会写入 `%TEMP%\euriskotax-last-cpolar-url.txt`，GUI 读这个文件刷新卡片，无需猜测"到底哪个端口在跑 cpolar"。

---

## 六、日志系统

### 6.1 三种日志文件

#### watchdog.log — 守护脚本运行日志

记录心跳、服务状态、重启动作。

```
[2026-08-10 21:11:49] [INFO] Watchdog started (notify_available=True)
[2026-08-10 21:11:49] [INFO] Initial cpolar URL: https://550478c0.r8.cpolar.cn
[2026-08-10 21:12:09] [WARN] Backend service down, diagnosing...
[2026-08-10 21:12:10] [OK] Backend restarted OK (PID: 41072) in 5022ms
[2026-08-10 21:12:49] [INFO] Heartbeat [3]: backend=OK | cpolar=OK | restarts=1 | url=https://550478c0.r8.cpolar.cn
```

查看命令：
```powershell
Get-Content .\tools\ops\watchdog.log -Tail 20
Get-Content .\tools\ops\watchdog.log -Wait -Tail 10  # 实时跟踪
```

#### events.log — 结构化事件日志

记录所有重启/变更事件，管道符分隔字段。

```
[2026-08-10 21:12:10] [BACKEND_RESTART] event=BACKEND_RESTART | reason=port_3000_not_listening | recovery_ms=5022 | details=new_pid=41072
[2026-08-10 21:13:30] [URL_CHANGED] event=URL_CHANGED | reason=auto_reconnect_new_url | new_url=https://abc.r8.cpolar.cn | old_url=https://old.r8.cpolar.cn
```

查看命令：
```powershell
# 最近20条事件
Get-Content .\tools\ops\events.log -Tail 20

# 筛选特定类型
Select-String -Path .\tools\ops\events.log -Pattern "URL_CHANGED"
Select-String -Path .\tools\ops\events.log -Pattern "RESTART_FAILED"

# 筛选今天的日志
Select-String -Path .\tools\ops\events.log -Pattern "2026-08-10"
```

#### notify.log — 邮件发送详细日志

记录邮件发送的完整流程，用于排查发送失败问题。

```
[2026-08-10 21:18:36] [INFO] ===== Send-WatchdogNotification start (event=URL_CHANGED) =====
[2026-08-10 21:18:36] [INFO] Config loaded OK (enabled=True, recipients=2, smtp=smtp.qq.com:587)
[2026-08-10 21:18:36] [INFO] Rendering template for event: URL_CHANGED
[2026-08-10 21:18:36] [DEBUG]   replaced {newUrl} -> https://abc.r8.cpolar.cn
[2026-08-10 21:18:36] [DEBUG]   replaced {reason} -> 隧道重启后分配了新的公网地址
[2026-08-10 21:18:36] [INFO] Connecting to SMTP: smtp.qq.com:587 (SSL=True, timeout=15s)
[2026-08-10 21:18:37] [INFO] Email sent OK in 1140ms -> 2649719969@qq.com, 971699503@qq.com
```

查看命令：
```powershell
# 最近30条
Get-Content .\tools\ops\notify.log -Tail 30

# 只看错误
Select-String -Path .\tools\ops\notify.log -Pattern "\[ERROR\]"

# 只看发送结果
Select-String -Path .\tools\ops\notify.log -Pattern "Email sent OK|FAILED"
```

### 6.2 日志级别

notify.log 使用4个级别：

| 级别 | 颜色 | 用途 | 示例 |
|------|------|------|------|
| INFO | 灰色 | 正常流程节点 | 配置加载、模板渲染、SMTP连接 |
| WARN | 黄色 | 跳过/降级 | 事件被mute、配置缺失 |
| ERROR | 红色 | 失败 | SMTP发送失败、配置解析错误 |
| DEBUG | 深灰 | 详细调试 | 每个占位符替换、资源释放 |

### 6.3 日志轮转

日志文件会持续增长，建议定期清理：

```powershell
# 清空所有日志（保留文件）
Clear-Content .\tools\ops\watchdog.log, .\tools\ops\events.log, .\tools\ops\notify.log

# 只清空 notify.log
Clear-Content .\tools\ops\notify.log
```

---

## 七、监控和通知机制

### 7.1 监控范围

| 监控对象 | 检查方式 | 检查间隔 | 异常动作 |
|---------|---------|---------|---------|
| 后端服务 | 3000端口监听 + HTTP响应 | 20秒 | 自动重启 node src/app.js |
| cpolar隧道 | 进程存活 + 公网URL可达 | 20秒 | 自动重启 cpolar（命令：`cpolar http 3000 -region=cn` 临时隧道） |
| 公网URL | 对比当前URL与上次记录（持久化到 `%TEMP%\euriskotax-last-cpolar-url.txt`） | 20秒 | 记录URL_CREATED / URL_CHANGED + 发邮件 + GUI 弹窗（180s去重） |

### 7.2 通知策略

**URL_CREATED（首次生成）与 URL_CHANGED（地址变更）都会发邮件 + GUI 弹窗；其他事件仅记录到 events.log。**

| 事件 | 邮件（notifyOn 开关） | GUI 弹窗（180s 去重） | 日志 | 理由 |
|------|------|------|------|------|
| BACKEND_RESTART | ❌ `backendRestart=false` | ❌ | ✅ | 自动恢复，无需人工干预 |
| CPOLAR_RESTART | ❌ `cpolarRestart=false` | ❌ | ✅ | 自动恢复，无需人工干预 |
| **URL_CREATED** | **✅ `urlCreated=true`（默认）** | **✅ URL_FIRST 弹 1 次** | ✅ | 启动分享时立即发地址给测试员 |
| **URL_CHANGED** | **✅ `urlChanged=true`（默认）** | **✅ URL_CHANGED 弹 1 次** | ✅ | 旧地址失效，必须通知测试员更换 |
| RESTART_FAILED | ❌ `restartFailed=false` | ❌ | ✅ | 查看 events.log |
| MAX_RESTARTS_REACHED | ❌ `restartFailed=false` | ❌ | ✅ | 查看 events.log |
| **邮件发送成功** | — | **✅ EMAIL_OK 弹 1 次** | ✅ notify.log | 提示"已发出，叫朋友查收" |
| **邮件未发送/失败** | — | **✅ EMAIL_FAIL 弹 1 次** | ✅ notify.log | 提示排查 notify.config.json |

> 如需启用其他事件通知，编辑 `notify.config.json` 的 `notifyOn` 节点。

### 7.3 邮件模板

模板定义在 [ops-notify-templates.json](../../tools/ops/ops-notify-templates.json)，v3.2 包含 3 种：

- **URL_CREATED** — 首次公网地址生成通知（含新地址+测试账号）
- **URL_CHANGED** — 公网地址变更通知（含新地址+旧地址+测试账号）
- **TEST** — 邮件通知测试

模板中的 `{reason}` 占位符会自动转换为中文描述（通过 [ops-notify-reason-map.json](../../tools/ops/ops-notify-reason-map.json)）。

> 🔁 **GUI 弹窗去重机制（为什么不会重复弹）**：`gui-dev-console.ps1` 维护 `$script:DedupPopup` 字典和 `Test-AllowPopup` 函数。4 类事件分别用独立 key：`URL_FIRST::<url>`、`URL_CHANGED::<newUrl>`、`EMAIL_OK::SENT`、`EMAIL_FAIL::NOT_SENT`，同一 key 180s 内只允许弹 1 次。并且：
> - URL 首次弹窗**只由 outHandler** 负责，弹出后立即写 `PublicUrlLastSeen=$url`，让 3s 定时器里的 `Update-PublicUrlCard` 不会再把同一个 URL 判成"变化"；
> - URL 变更弹窗只在 `PublicUrlLastSeen` 真的不同时触发，且同样走 180s 去重。
> 因此不会出现"一个地址连续弹 N 次"的情况。

### 7.4 reason 中文映射

| 英文代码 | 中文描述 |
|---------|---------|
| `cpolar_restart_new_url` | 隧道重启后分配了新的公网地址 |
| `auto_reconnect_new_url` | cpolar 自动重连后分配了新的公网地址 |
| `cpolar_process_dead` | cpolar 进程意外退出 |
| `port_3000_not_listening` | 后端服务端口 3000 未监听，进程已崩溃 |
| `connection_refused_or_timeout` | 后端服务连接被拒绝或请求超时 |
| `http_error_500` | 后端服务返回 HTTP 500 内部错误 |
| `backend_timeout_30s` | 后端服务在 30 秒内未能恢复 |
| `max_restarts_reached` | 自动重启次数已达上限，守护停止 |
| `public_url_timeout` | 公网地址访问超时（隧道可能已断开） |
| `public_url_unreachable` | 公网地址不可达（DNS 或连接问题） |
| `public_url_http_502` | 公网地址返回 502（后端服务不可达） |
| `cpolar_exe_not_found` | 未找到 cpolar.exe，文件路径可能有误 |

---

## 八、故障排查

### 8.1 邮件发送失败

**排查步骤**：

1. 查看 notify.log 最近的 ERROR 条目：
   ```powershell
   Select-String -Path .\tools\ops\notify.log -Pattern "\[ERROR\]" | Select-Object -Last 5
   ```

2. 根据错误信息对照下表：

| 错误信息 | 可能原因 | 解决方案 |
|---------|---------|---------|
| `SMTP authentication failed` / `535` | 授权码错误或未开启SMTP服务 | 重新获取QQ邮箱授权码，确认POP3/SMTP服务已开启 |
| `mailbox not available` / `reject` | 发件人或收件人地址错误 | 检查 notify.config.json 中的 from 和 recipients |
| `timeout` / `timed out` | 网络问题或防火墙拦截 | 检查网络连接，确认 smtp.qq.com:587 可达 |
| `SSL/TLS` / `certificate` | SSL配置错误 | 确认 useSsl=true，port=587（STARTTLS）|
| `placeholder detected` | 配置未填写 | 替换 notify.config.json 中的占位符 |
| `Config file not found` | 配置文件路径错误 | 确认 notify.config.json 在 scripts/ 目录 |

3. 手动发送测试邮件验证：
   ```powershell
   . .\tools\ops\ops-notify.ps1
   Send-TestNotification
   ```

### 8.2 watchdog 未检测到服务异常

**排查步骤**：

1. 确认 watchdog 正在运行：
   ```powershell
   Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -match "watchdog.ps1" }
   ```

2. 查看 watchdog.log 心跳：
   ```powershell
   Get-Content .\tools\ops\watchdog.log -Tail 10
   ```

3. 确认检查间隔（默认20秒），如果心跳间隔异常长，可能是有阻塞。

### 8.3 公网URL未检测到变更

**排查步骤**：

1. 查看 watchdog.log 中 `Initial cpolar URL` 和心跳中的 `url=` 字段：
   ```powershell
   Select-String -Path .\tools\ops\watchdog.log -Pattern "url="
   ```

2. 如果 `url=` 为空，说明 Get-CpolarUrl 函数无法获取URL：
   - 确认 cpolar dashboard 可访问：`http://127.0.0.1:4040`
   - 确认 cpolar 进程正在运行

3. 手动获取当前URL验证：
   ```powershell
   try { $r = Invoke-WebRequest "http://127.0.0.1:4040" -UseBasicParsing; if ($r.Content -match 'https://[a-z0-9]+\.r8\.cpolar\.cn') { $matches[0] } } catch { "cpolar dashboard not accessible" }
   ```

### 8.4 后端服务频繁重启

**排查步骤**：

1. 查看 events.log 中的 BACKEND_RESTART 频率：
   ```powershell
   Select-String -Path .\tools\ops\events.log -Pattern "BACKEND_RESTART" | Select-Object -Last 10
   ```

2. 查看后端错误日志：
   ```powershell
   Get-Content "$env:TEMP\eurisko-server-watchdog.err" -Tail 30
   ```

3. 常见原因：端口被占用、数据库连接失败、代码语法错误。

### 8.5 cpolar 隧道频繁断连

**排查步骤**：

1. 查看 events.log 中的 CPOLAR_RESTART 频率：
   ```powershell
   Select-String -Path .\tools\ops\events.log -Pattern "CPOLAR_RESTART" | Select-Object -Last 10
   ```

2. 确认 cpolar authtoken 有效，网络稳定。

3. 检查 cpolar 版本是否过旧，建议升级到最新版。

### 8.6 SMTP 端口被防火墙拦截

**典型症状**：

- notify.log 中出现 `timeout` / `timed out` 或 `Unable to read data from the transport connection` 错误
- 邮件发送耗时接近 15 秒（SMTP 超时阈值）后失败
- Hint 日志提示 `SMTP connection timed out. Check network/firewall`
- 同一网络下其他设备可以正常发送，本机却不行

**排查步骤**：

1. **查看 notify.log 错误详情**，确认是否为超时类错误：
   ```powershell
   Select-String -Path .\tools\ops\notify.log -Pattern "timeout|timed out|transport connection" | Select-Object -Last 5
   ```

2. **测试 SMTP 服务器连通性**（TCP 层面）：
   ```powershell
   # 测试 587 端口（STARTTLS）
   Test-NetConnection -ComputerName smtp.qq.com -Port 587

   # 测试 465 端口（SSL）
   Test-NetConnection -ComputerName smtp.qq.com -Port 465
   ```
   - 如果 `TcpTestSucceeded : False`，说明端口被拦截
   - 如果 `TcpTestSucceeded : True` 但邮件仍失败，可能是应用层问题，回到 8.1 排查

3. **检查 Windows 防火墙出站规则**：
   ```powershell
   # 查看是否有阻止 SMTP 端口的规则
   Get-NetFirewallRule -Direction Outbound -Action Block | `
       Get-NetFirewallPortFilter | `
       Where-Object { $_.RemotePort -in @("25","465","587") -or $_.LocalPort -in @("25","465","587") }
   ```

4. **临时关闭防火墙验证**（仅用于诊断，确认后请重新开启）：
   ```powershell
   # 临时关闭（需管理员权限）
   Set-NetFirewallProfile -Profile Domain,Public,Private -Enabled False

   # 发送测试邮件验证
   . .\tools\ops\ops-notify.ps1; Send-TestNotification

   # 确认后立即重新开启
   Set-NetFirewallProfile -Profile Domain,Public,Private -Enabled True
   ```

5. **为 SMTP 添加入站/出站放行规则**（推荐做法）：
   ```powershell
   # 放行 SMTP 出站（587 端口）
   New-NetFirewallRule -DisplayName "EuriskoTax SMTP Outbound 587" `
       -Direction Outbound -Action Allow `
       -Protocol TCP -RemotePort 587 `
       -Profile Any

   # 如使用 465 端口，再添加一条
   New-NetFirewallRule -DisplayName "EuriskoTax SMTP Outbound 465" `
       -Direction Outbound -Action Allow `
       -Protocol TCP -RemotePort 465 `
       -Profile Any
   ```

6. **检查第三方安全软件**：
   - 360 安全卫士、火绒、腾讯电脑管家等可能拦截 SMTP 连接
   - 临时关闭或为 `powershell.exe` / `node.exe` 添加信任白名单
   - 企业网络可能由网关防火墙拦截，需联系 IT 管理员放行 `smtp.qq.com:587`

7. **尝试备用端口**：
   - 如果 587 被拦截，可在 [notify.config.json](../../tools/ops/notify.config.json) 中改用 465（SSL）：
     ```json
     "smtp": {
       "host": "smtp.qq.com",
       "port": 465,
       "useSsl": true
     }
     ```
   - 修改后运行 `Send-TestNotification` 验证

8. **验证 ISP 未封锁端口**：
   ```powershell
   # 使用 telnet 测试（需先启用 Telnet Client 功能）
   telnet smtp.qq.com 587
   ```
   - 如果连接立即失败且提示"连接失败"，可能是 ISP 封锁了 25/465/587 端口
   - 部分运营商默认封锁 25 端口防止垃圾邮件，587/465 通常不受影响

---

## 九、维护操作

### 9.1 重启 watchdog

```powershell
# 停止
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -match "watchdog.ps1" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }

# 启动
.\tools\ops\ops-watchdog.ps1 -Share -IntervalSec 20
```

或直接使用 start-dev.ps1：
```powershell
.\tools\ops\ops-start-dev.ps1 -Share -Watchdog -SkipInstall -SkipResetUser
```

### 9.2 修改邮件模板

编辑 [notify-templates.json](../../tools/ops/ops-notify-templates.json)，修改对应事件的 `subject` 或 `body`。**无需重启 watchdog**，下次触发事件时自动读取最新配置。

### 9.3 添加收件人

编辑 [notify.config.json](../../tools/ops/notify.config.json) 的 `recipients` 数组：

```json
"recipients": [
    "existing@qq.com",
    "new_tester@qq.com"
]
```

**无需重启 watchdog**，下次发送邮件时自动读取。

### 9.4 添加 reason 中文映射

编辑 [notify-reason-map.json](../../tools/ops/ops-notify-reason-map.json)，添加新的键值对：

```json
{
  "new_reason_code": "新的中文描述"
}
```

**需要重启 watchdog** 才能生效（ReasonMap 在首次加载后缓存）。

### 9.5 临时启用所有事件通知

编辑 [notify.config.json](../../tools/ops/notify.config.json)：

```json
"notifyOn": {
    "backendRestart": true,
    "cpolarRestart": true,
    "urlChanged": true,
    "restartFailed": true
}
```

**无需重启 watchdog**，下次触发事件时自动读取。调试完毕后改回 `false` 即可。

### 9.6 清理日志

```powershell
# 清空所有日志
Clear-Content .\tools\ops\watchdog.log, .\tools\ops\events.log, .\tools\ops\notify.log

# 删除7天前的日志行（示例）
$ cutoff = (Get-Date).AddDays(-7).ToString("yyyy-MM-dd")
Get-Content .\tools\ops\events.log | Where-Object { $_ -notmatch $cutoff } | Set-Content .\tools\ops\events.log
```

### 9.7 完全停止所有服务

```powershell
# 停止 watchdog
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -match "watchdog.ps1" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }

# 停止后端
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match "src/app.js" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }

# 停止 cpolar
Get-Process -Name "cpolar" -ErrorAction SilentlyContinue | Stop-Process -Force
```

---

## 十、安全注意事项

1. **notify.config.json 含敏感信息**：包含SMTP授权码，已加入 [.gitignore](../../.gitignore)，不会提交到Git仓库
2. **server/.env 含JWT密钥**：同样已gitignore
3. **开发配置不用于生产**：`JWT_SECRET=dev-secret-key-change-in-production` 仅限开发使用
4. **QQ邮箱每日发信限制**：通常500封/天，开发环境足够
5. **cpolar免费版限制**：公网URL每次重启都会变化，带宽有限制
6. **测试账号密码明文**：`dev@example.com / password` 仅限开发环境

---

## 十一、快速参考

### 常用命令速查

```powershell
# 一键启动
.\tools\ops\ops-start-dev.ps1 -Share -Watchdog

# 发送测试邮件
. .\tools\ops\ops-notify.ps1; Send-TestNotification

# 查看最近事件
Get-Content .\tools\ops\events.log -Tail 20

# 查看邮件发送日志
Get-Content .\tools\ops\notify.log -Tail 30

# 查看 watchdog 心跳
Get-Content .\tools\ops\watchdog.log -Tail 10

# 查看 URL 变更记录
Select-String -Path .\tools\ops\events.log -Pattern "URL_CHANGED"

# 查看邮件错误
Select-String -Path .\tools\ops\notify.log -Pattern "\[ERROR\]"

# 停止所有服务
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -match "watchdog.ps1" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```

### 测试账号

| 项目 | 值 |
|------|-----|
| 访问地址 | http://localhost:3000/ 或 cpolar公网地址 |
| 测试账号 | dev@example.com |
| 测试密码 | password |

### 默认配置值

| 配置项 | 默认值 |
|--------|--------|
| 轮询间隔 | 20秒 |
| SMTP超时 | 15秒 |
| 最大重启次数 | 0（无限） |
| SMTP服务器 | smtp.qq.com:587 |
| 通知策略 | 仅URL_CHANGED发邮件 |
| 日志级别 | INFO+WARN+ERROR（DEBUG也记录） |
