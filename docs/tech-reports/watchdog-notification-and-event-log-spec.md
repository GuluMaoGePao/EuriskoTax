# EuriskoTax 守护脚本邮件通知与事件日志规范

> 文档版本：v3.2 | 更新日期：2026-04-15
> 适用范围：EuriskoTax 开发环境 watchdog 守护脚本（ops-watchdog.ps1 + ops-notify.ps1） + GUI 开发控制台（gui-dev-console.ps1）

---

## 一、架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│              ops-start-dev.ps1（启动入口）/ GUI 启动按钮         │
│  stdout 同时输出 [GUI-EVENT] 前缀行，让 GUI 能捕获关键事件       │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│            ops-watchdog.ps1（守护主进程）                         │
│                                                                   │
│  每 20 秒轮询                                                      │
│  ├─ 检查后端服务（:3000 端口 + HTTP 响应）                          │
│  └─ 检查 cpolar 隧道（进程存活 + 公网 URL 可达）                    │
│       └─ 异常时自动重启 cpolar 临时隧道: cpolar http 3000 -region=cn │
│                                                                   │
│  异常时 ──→ 诊断原因 ──→ 自动重启 ──→ 记录事件 ──→ 判断是否        │
│                                    │              发送邮件        │
│                         ┌──────────┘              │              │
│                         ▼                         ▼              │
│              ┌─────────────────┐       ┌──────────────────┐      │
│              │   events.log    │       │ URL_CREATED +    │      │
│              │  （全部事件）   │       │ URL_CHANGED      │      │
│              │                 │       │ 发送邮件通知     │      │
│              │ BACKEND_RESTART │       │                  │      │
│              │ CPOLAR_RESTART  │       │  ops-notify.ps1  │      │
│              │ URL_CREATED(*新增*)│    │  读取模板 v3.2   │      │
│              │ URL_CHANGED     │       │  SMTP 发送       │      │
│              │ RESTART_FAILED  │       │  → 多收件人      │      │
│              └─────────────────┘       └──────────────────┘      │
│                               │                                   │
│                               ▼                                   │
│         %TEMP%\euriskotax-last-cpolar-url.txt  ← 共享 URL 文件    │
│                               │                                   │
└───────────────────────────────┼───────────────────────────────────┘
                                │
                                ▼
          ┌───────────────────────────────────────────────┐
          │ gui-dev-console.ps1（GUI 开发控制台）          │
          │  🌐 公网地址速览卡片（3s刷新，点卡片复制）      │
          │  🔁 4 类事件弹窗：URL_FIRST/URL_CHANGED/       │
          │     EMAIL_OK/EMAIL_FAIL，统一 180s 去重        │
          └───────────────────────────────────────────────┘
```

### 文件清单

| 文件 | 用途 |
|------|------|
| [ops-watchdog.ps1](../../tools/ops/ops-watchdog.ps1) | 守护主脚本，监控+重启+事件记录+[GUI-EVENT]输出+URL持久化 |
| [ops-start-dev.ps1](../../tools/ops/ops-start-dev.ps1) | 一键启动脚本（环境检查+依赖+重置用户+启动服务+守护+[GUI-EVENT]） |
| [ops-notify.ps1](../../tools/ops/ops-notify.ps1) | 邮件发送模块，模板加载+SMTP发送 |
| [notify.config.json](../../tools/ops/notify.config.json) | SMTP配置（邮箱、授权码、多收件人、通知开关，**新增urlCreated**） |
| [ops-notify-templates.json](../../tools/ops/ops-notify-templates.json) | 中文邮件模板 v3.2（URL_CREATED + URL_CHANGED + TEST） |
| [gui-dev-console.ps1](../../tools/gui/gui-dev-console.ps1) | GUI 主脚本（公网卡片 + 180s 去重弹窗） |
| watchdog.log | 守护脚本运行日志（心跳+状态） |
| events.log | 全部重启事件日志（结构化，新增 URL_CREATED 类型） |
| notify.log | 邮件发送详细日志 |
| `%TEMP%\euriskotax-last-cpolar-url.txt` | 共享 URL 持久化文件（GUI/脚本互通） |

---

## 二、通知策略

### 核心原则

**URL_CREATED（首次生成公网地址）与 URL_CHANGED（地址变更）都会通过邮件通知；GUI 会对 4 类关键事件各弹 1 次 MessageBox（180s 内去重，不会重复）。其他所有事件仅记录到 events.log。**

### 事件处理方式

| 事件类型 | 邮件通知 | GUI 弹窗（180s 去重 key） | 记录 events.log | 理由 |
|---------|---------|--------------------------|----------------|------|
| `BACKEND_RESTART` | ❌ 不通知 | ❌ | ✅ 记录 | 守护脚本自动恢复，无需人工干预 |
| `CPOLAR_RESTART` | ❌ 不通知 | ❌ | ✅ 记录 | 守护脚本自动恢复，无需人工干预 |
| `URL_CREATED`（**新增**）| **✅ urlCreated=true 时** | **✅ URL_FIRST::<url>** | ✅ 记录 | 启动分享时立即把地址+账号发给测试员 |
| `URL_CHANGED` | **✅ urlChanged=true 时** | **✅ URL_CHANGED::<newUrl>** | ✅ 记录 | **旧地址已失效，需通知测试员更换** |
| `RESTART_FAILED` | ❌ 不通知 | ❌ | ✅ 记录 | 查看 events.log 了解详情 |
| `MAX_RESTARTS_REACHED` | ❌ 不通知 | ❌ | ✅ 记录 | 查看 events.log 了解详情 |
| **邮件发送成功** | — | **✅ EMAIL_OK::SENT** | ✅ notify.log | 提示"邮件已发出，叫朋友查收收件箱/垃圾箱" |
| **邮件未发送/失败** | — | **✅ EMAIL_FAIL::NOT_SENT** | ✅ notify.log | 提示排查 notify.config.json（授权码/SMTP/开关） |
| `TEST` | ✅ 手动触发 | ❌ | — | 验证 SMTP 配置是否正常 |

### 通知开关配置

在 [notify.config.json](../../tools/ops/notify.config.json) 的 `notifyOn` 节点控制：

```json
"notifyOn": {
    "backendRestart": false,   // 后端重启 — 不通知
    "cpolarRestart": false,    // 隧道重启 — 不通知
    "urlCreated": true,        // ✨ 首次生成公网地址 — 发送邮件（默认）
    "urlChanged": true,        // 地址变更 — 发送邮件
    "restartFailed": false     // 重启失败/上限 — 不通知
}
```

> 如需临时启用其他事件的邮件通知，将对应开关设为 `true` 即可，无需重启 watchdog。

### GUI 弹窗去重机制（为什么只弹 1 次？）

```powershell
# gui-dev-console.ps1 内部
$script:DedupPopup = @{}
function Test-AllowPopup {
    param([string]$Key)
    $now = Get-Date
    $last = $script:DedupPopup[$Key]
    if ($last -and ($now - $last).TotalSeconds -lt 180) { return $false }
    $script:DedupPopup[$Key] = $now
    return $true
}
```

关键分工（避免 outHandler / Update-PublicUrlCard / 定时器三处重复弹）：
1. **URL 首次弹窗** → 只在 `outHandler`（收到 stdout 里"公网分享地址:"那一行）里触发；弹出后立即写 `$script:PublicUrlLastSeen = $url`，让定时器里的 `Update-PublicUrlCard` 不再判成变化。
2. **URL 变更弹窗** → 只在 `$script:PublicUrlLastSeen` 真的与当前 URL 不同时触发，且同样走 `Test-AllowPopup`（key=URL_CHANGED::<newUrl>）。
3. **邮件成功 / 邮件失败** → 只在 `outHandler` 里捕获 `[GUI-EVENT]`，走各自固定 key。
4. **窗口去重**：同一个 key（比如同 URL 首次）180 秒内无论被几条日志触发，最多只弹 1 次。

---

## 三、邮件通知模板（v3.2）

所有模板定义在 [ops-notify-templates.json](../../tools/ops/ops-notify-templates.json)，使用 `{占位符}` 语法，由 `ops-notify.ps1` 的 `Format-Template` 函数在发送时替换。

### 3.0 URL_CREATED — 首次生成公网地址通知（v3.2 新增）

**邮件标题**：`【EuriskoTax】公网分享地址已生成，请转给测试员`

**邮件正文**：
```
═══════════════════════════════════
  ★ 公网分享地址已生成  ★
═══════════════════════════════════

★★★ 新公网地址 ★★★

  {newUrl}

───────────────────────────────────

【详情】
  生成时间：{timestamp}

【测试员登录信息】
  访问地址：{newUrl}
  测试账号：dev@example.com
  测试密码：password

───────────────────────────────────
EuriskoTax Watchdog | 自动发送
───────────────────────────────────
```

**触发时机**：ops-start-dev.ps1 `-Share` 或 GUI「🌐 公网分享」「🔥 完整测试」按钮启动 cpolar 拿到首个公网 URL 后立即触发一次，对应 `notifyOn.urlCreated` 开关。

---

### 3.1 URL_CHANGED — 公网地址变更通知

**邮件标题**：`【EuriskoTax 重要】公网测试地址已变更，请通知测试员`

**邮件正文**：

```
═══════════════════════════════════
  ⚠  公网测试地址已变更  ⚠
═══════════════════════════════════

★★★ 新公网地址 ★★★

  {newUrl}

───────────────────────────────────

【地址变更详情】
  旧地址：{oldUrl}
  新地址：{newUrl}
  变更原因：{reason}
  发生时间：{timestamp}

【需要采取的行动】
  ❗ 旧地址已失效，请立即将新地址发送给测试员
  ❗ 请通知所有正在测试的人员更换访问地址

【测试员登录信息】
  访问地址：{newUrl}
  测试账号：dev@example.com
  测试密码：password

【说明】
  cpolar 免费版公网地址在隧道重启或自动重连后可能发生变化。
  守护脚本检测到地址变化后自动发送此通知。
  其他事件（后端重启、隧道重启等）仅记录到 events.log，不发送邮件。

───────────────────────────────────
EuriskoTax Watchdog | 自动发送
───────────────────────────────────
```

**占位符**：

| 占位符 | 说明 | 示例值 |
|--------|------|--------|
| `{oldUrl}` | 旧公网地址 | `https://abc.r8.cpolar.cn` |
| `{newUrl}` | 新公网地址 | `https://xyz.r8.cpolar.cn` |
| `{reason}` | 变更原因 | `cpolar_restart_new_url` / `auto_reconnect_new_url` |
| `{timestamp}` | 发生时间 | `2026-08-07 01:37:00` |

**触发场景**：

| 场景 | reason 值 | 说明 |
|------|-----------|------|
| 守护脚本重启 cpolar 后 URL 变化 | `cpolar_restart_new_url` | 同时记录 CPOLAR_RESTART + URL_CHANGED |
| cpolar 内部自动重连产生新 URL | `auto_reconnect_new_url` | 仅记录 URL_CHANGED（无需重启） |

---

### 3.2 TEST — 邮件通知测试

**邮件标题**：`【EuriskoTax】邮件通知测试`

**邮件正文**：

```
═══════════════════════════════════
  EuriskoTax Watchdog 邮件通知测试
═══════════════════════════════════

如果您收到了这封邮件，说明 SMTP 邮件通知功能已正常工作。

【配置信息】
  发件邮箱：{from}
  收件邮箱：{recipients}
  SMTP 服务器：{smtpHost}:{smtpPort} (SSL)

【通知策略】
  以下两种事件默认会发送邮件通知（可在 notifyOn 中调整）：
    ① URL_CREATED — 每次启动分享拿到第一个公网地址时发出
    ② URL_CHANGED — 公网地址发生变更时发出
  其他事件（后端重启、隧道重启、重启失败等）仅记录到 events.log。

【收件人列表】
  上述收件邮箱将在 URL_CREATED / URL_CHANGED 时收到通知邮件，
  邮件中包含新的访问地址和测试账号信息。

发生时间：{timestamp}

───────────────────────────────────
EuriskoTax Watchdog | 自动发送
───────────────────────────────────
```

**发送方式**：

```powershell
. .\tools\ops\ops-notify.ps1
Send-TestNotification
```

---

## 四、事件日志格式（events.log）

### 4.1 文件位置

```
e:\WorkPrograms\Trae\EuriskoTax\tools\ops\events.log
```

### 4.2 日志格式

每行一条事件，管道符 `|` 分隔字段：

```
[时间戳] [事件类型] event=事件类型 | reason=故障原因 | recovery_ms=恢复耗时 | new_url=新URL | old_url=旧URL | details=详情
```

### 4.3 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| 时间戳 | `yyyy-MM-dd HH:mm:ss` | 是 | 事件发生时间 |
| 事件类型 | 枚举 | 是 | `BACKEND_RESTART` / `CPOLAR_RESTART` / **`URL_CREATED`（v3.2 新增）** / `URL_CHANGED` / `RESTART_FAILED` / `MAX_RESTARTS_REACHED` |
| `reason` | 字符串 | 是 | 故障原因诊断结果（见下表） |
| `recovery_ms` | 整数 | 否 | 恢复耗时（毫秒），仅重启事件 |
| `new_url` | URL | 否 | 新公网地址，cpolar 相关事件 |
| `old_url` | URL | 否 | 旧公网地址，仅 URL_CHANGED 事件 |
| `details` | 字符串 | 否 | 补充详情（PID、错误信息等） |

### 4.4 故障原因（reason）字典

#### 后端故障原因

| reason 值 | 含义 | 触发场景 |
|-----------|------|---------|
| `port_3000_not_listening` | 3000 端口未监听 | node 进程崩溃/未启动 |
| `connection_refused_or_timeout` | 连接被拒绝或超时 | 服务假死/网络问题 |
| `http_error_500` | HTTP 500 错误 | 服务内部异常 |
| `http_unexpected_status_200` | 意外的 200 状态 | 不应返回 200 的接口返回了 200 |

#### cpolar 故障原因

| reason 值 | 含义 | 触发场景 |
|-----------|------|---------|
| `cpolar_process_dead` | cpolar 进程不存在 | 进程崩溃/被杀 |
| `public_url_timeout` | 公网 URL 访问超时 | 隧道断开/网络问题 |
| `public_url_unreachable` | 公网 URL 不可达 | DNS 解析失败/连接拒绝 |
| `public_url_http_502` | 公网返回 502 | 后端服务不可达 |
| `cpolar_exe_not_found` | cpolar.exe 未找到 | 文件被删除/路径错误 |

#### URL 变更原因

| reason 值 | 含义 | 触发场景 |
|-----------|------|---------|
| `cpolar_restart_new_url` | 重启后获得新 URL | 守护脚本重启 cpolar |
| `auto_reconnect_new_url` | 自动重连产生新 URL | cpolar 内部重连（无需重启） |

### 4.5 日志示例

以下为崩溃测试中产生的真实日志记录：

```
[2026-08-07 02:12:10] [BACKEND_RESTART] event=BACKEND_RESTART | reason=port_3000_not_listening | recovery_ms=5022 | details=new_pid=41072
[2026-04-15 11:00:10] [URL_CREATED] event=URL_CREATED | reason=share_started | new_url=https://abc.r8.cpolar.cn | details=ops-start-dev -Share
[2026-08-07 01:36:30] [CPOLAR_RESTART] event=CPOLAR_RESTART | reason=cpolar_process_dead | recovery_ms=8000 | new_url=https://xyz.r8.cpolar.cn | old_url=https://abc.r8.cpolar.cn
[2026-08-07 01:36:30] [URL_CHANGED] event=URL_CHANGED | reason=cpolar_restart_new_url | new_url=https://xyz.r8.cpolar.cn | old_url=https://abc.r8.cpolar.cn
[2026-08-07 01:37:00] [URL_CHANGED] event=URL_CHANGED | reason=auto_reconnect_new_url | new_url=https://new.r8.cpolar.cn | old_url=https://xyz.r8.cpolar.cn
[2026-08-07 01:38:00] [RESTART_FAILED] event=RESTART_FAILED | reason=backend_timeout_30s | recovery_ms=30000 | details=attempted_pid=12345
[2026-08-07 01:39:00] [RESTART_FAILED] event=RESTART_FAILED | reason=max_restarts_reached | details=target=backend count=10
```

> **说明**：以上事件均记录到 events.log；只有 URL_CREATED 与 URL_CHANGED 事件会触发邮件通知；GUI 还会在此基础上额外弹窗（180s 去重）。

---

## 五、配置说明

### 5.1 notify.config.json

```json
{
  "smtp": {
    "host": "smtp.qq.com",       // QQ邮箱 SMTP 服务器
    "port": 587,                  // STARTTLS 端口
    "useSsl": true,               // 启用 SSL/TLS
    "from": "xxx@qq.com",         // 发件邮箱
    "password": "授权码",          // QQ邮箱授权码（非登录密码）
    "displayName": "EuriskoTax Watchdog"
  },
  "recipients": [                 // 收件人列表（支持多个）
    "your_qq@qq.com",
    "tester1@qq.com",
    "tester2@qq.com"
  ],
  "enabled": true,                // 总开关
  "notifyOn": {
    "backendRestart": false,      // 后端重启 — 不通知（仅记录日志）
    "cpolarRestart": false,       // 隧道重启 — 不通知（仅记录日志）
    "urlCreated": true,           // ✨ 首次生成公网地址 — 发送邮件（默认开启）
    "urlChanged": true,           // 地址变更 — 发送邮件
    "restartFailed": false        // 重启失败/上限 — 不通知（仅记录日志）
  }
}
```

> **多收件人说明**：URL_CREATED / URL_CHANGED 邮件会同时发送给 `recipients` 数组中的全部收件人。新增收件人只需在数组中添加邮箱地址，无需重启 watchdog。

### 5.2 ops-notify-templates.json

模板文件使用 JSON 格式，v3.2 包含 3 种模板：

| 模板 | 用途 |
|------|------|
| `URL_CREATED`（v3.2 新增）| 首次生成公网地址通知（启动 -Share 时自动触发） |
| `URL_CHANGED` | 公网地址变更通知（自动触发） |
| `TEST` | 邮件通知测试（手动触发） |

- 换行符：JSON 中用 `\n`，发送时自动转换为真实换行
- 占位符：`{name}` 格式，由 `Format-Template` 函数替换
- 编码：UTF-8，支持中文直接书写
- 修改模板无需重启 watchdog，下次触发事件时自动读取最新配置

### 5.3 QQ邮箱授权码获取

1. 登录 [mail.qq.com](https://mail.qq.com)
2. 进入 **设置** → **账户**
3. 找到 **POP3/SMTP服务**，点击 **开启**
4. 按提示用手机发送短信获取授权码
5. 将授权码填入 `notify.config.json` 的 `smtp.password` 字段

---

## 六、使用方法

### 6.1 启动守护脚本

```powershell
# 方式一：通过 ops-start-dev.ps1 一键启动（推荐）
.\tools\ops\ops-start-dev.ps1 -Share -Watchdog

# 方式二：单独启动 watchdog
.\tools\ops\ops-watchdog.ps1 -Share -IntervalSec 20
```

### 6.2 发送测试邮件

```powershell
. .\tools\ops\ops-notify.ps1
Send-TestNotification
```

### 6.3 模拟公网地址变更邮件（调试用）

```powershell
. .\tools\ops\ops-notify.ps1

# 模拟 URL_CREATED（首次生成公网地址）
$tplCreated = @{ newUrl="https://new.r8.cpolar.cn"; timestamp=(Get-Date -Format "yyyy-MM-dd HH:mm:ss") }
Send-WatchdogNotification -EventType "URL_CREATED" -TemplateData $tplCreated

# 模拟 URL_CHANGED（公网地址变更）
$tplChanged = @{ oldUrl="https://old.r8.cpolar.cn"; newUrl="https://new.r8.cpolar.cn"; reason="cpolar_restart_new_url"; recoveryMs="8000"; timestamp=(Get-Date -Format "yyyy-MM-dd HH:mm:ss") }
Send-WatchdogNotification -EventType "URL_CHANGED" -TemplateData $tplChanged
```

### 6.4 查看事件日志

```powershell
# 查看最近 20 条事件
Get-Content .\tools\ops\events.log -Tail 20

# 筛选特定类型事件
Select-String -Path .\tools\ops\events.log -Pattern "URL_CREATED|URL_CHANGED"
Select-String -Path .\tools\ops\events.log -Pattern "RESTART_FAILED"
```

### 6.5 自定义模板

编辑 [ops-notify-templates.json](../../tools/ops/ops-notify-templates.json)，修改对应事件的 `subject` 或 `body`。无需重启 watchdog，下次触发事件时自动读取最新模板。

### 6.6 临时启用其他事件通知

编辑 [notify.config.json](../../tools/ops/notify.config.json) 的 `notifyOn` 节点，将需要启用的事件开关设为 `true`：

```json
"notifyOn": {
    "backendRestart": true,   // 临时启用后端重启通知
    "cpolarRestart": false,
    "urlCreated": true,
    "urlChanged": true,
    "restartFailed": true     // 临时启用重启失败告警
}
```

无需重启 watchdog，下次触发事件时自动读取最新配置。

---

## 七、注意事项

1. **通知策略**：默认 `urlCreated` 与 `urlChanged` 为 `true`，其他事件仅记录到 events.log。如需调整，修改 `notifyOn` 配置即可
2. **授权码安全**：`notify.config.json` 包含敏感信息，已加入 `.gitignore`，不会提交到 Git 仓库
3. **PowerShell 编码**：`ops-watchdog.ps1` 和 `ops-notify.ps1` 使用英文注释避免 PS5 编码问题，中文内容通过 JSON 模板加载
4. **免费版 cpolar**：公网 URL 每次重启都会变化，URL_CREATED / URL_CHANGED 邮件中会用 `★★★` 醒目标记新地址，并附测试账号信息
5. **QQ邮箱限制**：每日发信量有上限（通常 500 封），仅 URL_CREATED / URL_CHANGED 发邮件可有效避免频繁轰炸
6. **多收件人**：支持在 `recipients` 数组中配置多个收件人，地址变更邮件会同时推送
7. **Start-Process 限制**：PowerShell 的 `Start-Process` 不允许 `-RedirectStandardOutput` 和 `-RedirectStandardError` 指向同一文件，需使用不同路径
8. **GUI 与脚本共享 URL**：`%TEMP%\euriskotax-last-cpolar-url.txt` 是 GUI / ops-start-dev / ops-watchdog 三方互通的共享文件，最新 URL 会实时写在这里
9. **GUI 弹窗 180s 去重**：同一事件 key 180 秒内最多只弹 1 次。如果你确实需要反复查看，直接点「🌐 公网地址速览」卡片或看 notify.log / events.log，不需要等冷却

---

## 八、变更记录

| 版本 | 日期 | 变更内容 |
|------|------|---------|
| v1.0 | 2026-08-07 | 初始版本，6种邮件模板，全部事件发邮件 |
| v2.0 | 2026-08-10 | 模板全面重制为中文：统一视觉风格、URL_CHANGED 新增 ★★★ 醒目标记和测试员登录信息、多收件人支持、修复 Start-Process 重定向 bug |
| v3.0 | 2026-08-10 | **通知策略调整**：仅 URL_CHANGED 发送邮件，其他事件仅记录到 events.log。模板精简为 2 种（URL_CHANGED + TEST），减少邮件轰炸 |
| v3.2 | 2026-04-15 | **新增 URL_CREATED 事件 + GUI 公网卡片 + 180s 去重弹窗**：模板 3 种；邮件开关新增 urlCreated；cpolar 启动统一为临时隧道 `http 3000 -region=cn`；新增 GUI-EVENT 双通道输出；新增 %TEMP% 共享 URL 文件；events.log 新增 URL_CREATED 类型；修复 GUI 重复弹窗 N 次问题 |
