# EuriskoTax 守护脚本邮件通知与事件日志规范

> 文档版本：v1.0 | 更新日期：2026-08-07
> 适用范围：EuriskoTax 开发环境 watchdog 守护脚本（watchdog.ps1 + notify.ps1）

---

## 一、架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                    watchdog.ps1（守护主进程）                 │
│                                                             │
│  每 20 秒轮询                                                │
│  ├─ 检查后端服务（:3000 端口 + HTTP 响应）                    │
│  └─ 检查 cpolar 隧道（进程存活 + 公网 URL 可达）              │
│                                                             │
│  异常时 ──→ 诊断原因 ──→ 自动重启 ──→ 记录事件 ──→ 发送邮件   │
└──────────────────────────┬──────────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
    ┌─────────────────┐       ┌─────────────────────┐
    │   events.log    │       │     notify.ps1      │
    │  （结构化事件）  │       │  （邮件发送模块）    │
    │                 │       │                     │
    │ BACKEND_RESTART │       │  读取配置            │
    │ CPOLAR_RESTART  │       │  notify.config.json │
    │ URL_CHANGED     │       │                     │
    │ RESTART_FAILED  │       │  读取模板            │
    │                 │       │  notify-templates   │
    │ 含：时间/原因/  │       │  .json（中文）      │
    │ 恢复耗时/新旧URL│       │                     │
    └─────────────────┘       │  SMTP 发送           │
                              │  smtp.qq.com:587    │
                              └─────────────────────┘
```

### 文件清单

| 文件 | 用途 |
|------|------|
| [watchdog.ps1](../../watchdog.ps1) | 守护主脚本，监控+重启+事件记录 |
| [notify.ps1](../../notify.ps1) | 邮件发送模块，模板加载+SMTP发送 |
| [notify.config.json](../../notify.config.json) | SMTP配置（邮箱、授权码、收件人） |
| [notify-templates.json](../../notify-templates.json) | 中文邮件模板（6种事件） |
| watchdog.log | 守护脚本运行日志（心跳+状态） |
| events.log | 重启事件日志（结构化） |

---

## 二、事件类型

### 事件分类

| 事件类型 | 触发条件 | 严重级别 | 邮件标题前缀 |
|---------|---------|---------|-------------|
| `BACKEND_RESTART` | 后端服务异常 → 自动重启成功 | 通知 | 【EuriskoTax】 |
| `CPOLAR_RESTART` | cpolar 隧道异常 → 自动重启成功 | 通知 | 【EuriskoTax】 |
| `URL_CHANGED` | 公网 URL 发生变化（重启或自动重连） | 重要通知 | 【EuriskoTax】 |
| `RESTART_FAILED` | 自动重启失败（超时/异常） | 告警 | 【EuriskoTax 告警】 |
| `MAX_RESTARTS_REACHED` | 重启次数达上限，守护放弃 | 严重告警 | 【EuriskoTax 告警】 |
| `TEST` | 测试邮件 | 测试 | 【EuriskoTax】 |

### 事件开关配置

在 [notify.config.json](../../notify.config.json) 的 `notifyOn` 节点控制：

```json
"notifyOn": {
    "backendRestart": true,    // BACKEND_RESTART
    "cpolarRestart": true,     // CPOLAR_RESTART
    "urlChanged": true,        // URL_CHANGED
    "restartFailed": true      // RESTART_FAILED + MAX_RESTARTS_REACHED
}
```

---

## 三、邮件通知模板

所有模板定义在 [notify-templates.json](../../notify-templates.json)，使用 `{占位符}` 语法，由 `notify.ps1` 的 `Format-Template` 函数在发送时替换。

### 3.1 BACKEND_RESTART — 后端重启通知

**邮件标题**：`【EuriskoTax】后端服务已自动重启`

**邮件正文**：

```
后端服务出现异常，守护脚本已自动重启恢复。

━━━ 故障信息 ━━━
故障原因：{reason}
恢复耗时：{recoveryMs} 毫秒
新进程 PID：{newPid}
发生时间：{timestamp}

━━━ 当前状态 ━━━
服务已恢复正常，测试可继续进行。
如有疑问请查看 events.log 了解详情。
```

**占位符**：

| 占位符 | 说明 | 示例值 |
|--------|------|--------|
| `{reason}` | 故障原因诊断 | `port_3000_not_listening` |
| `{recoveryMs}` | 恢复耗时（毫秒） | `12000` |
| `{newPid}` | 新进程 PID | `45678` |
| `{timestamp}` | 发生时间 | `2026-08-07 01:35:50` |

---

### 3.2 CPOLAR_RESTART — 隧道重启通知

**邮件标题**：`【EuriskoTax】cpolar 隧道已自动重启`

**邮件正文**：

```
cpolar 公网隧道出现异常，守护脚本已自动重启恢复。

━━━ 故障信息 ━━━
故障原因：{reason}
恢复耗时：{recoveryMs} 毫秒
当前公网地址：{newUrl}
发生时间：{timestamp}

━━━ 当前状态 ━━━
隧道已恢复正常，测试可继续进行。
如有疑问请查看 events.log 了解详情。
```

**占位符**：

| 占位符 | 说明 | 示例值 |
|--------|------|--------|
| `{reason}` | 故障原因诊断 | `cpolar_process_dead` |
| `{recoveryMs}` | 恢复耗时（毫秒） | `8000` |
| `{newUrl}` | 当前公网地址 | `https://5c7b962d.r8.cpolar.cn` |
| `{timestamp}` | 发生时间 | `2026-08-07 01:36:30` |

---

### 3.3 URL_CHANGED — 公网地址变更通知（重要）

**邮件标题**：`【EuriskoTax】公网测试地址已变更`

**邮件正文**：

```
cpolar 公网地址已发生变化，请通知测试员使用新地址。

━━━ 地址变更 ━━━
旧地址：{oldUrl}
新地址：{newUrl}
变更原因：{reason}
发生时间：{timestamp}

━━━ 重要提醒 ━━━
旧地址已失效，请将新地址发送给测试员！
测试账号：dev@example.com / password
如有疑问请查看 events.log 了解详情。
```

**占位符**：

| 占位符 | 说明 | 示例值 |
|--------|------|--------|
| `{oldUrl}` | 旧公网地址 | `https://abc.r8.cpolar.cn` |
| `{newUrl}` | 新公网地址 | `https://xyz.r8.cpolar.cn` |
| `{reason}` | 变更原因 | `cpolar_restart_new_url` / `auto_reconnect_new_url` |
| `{timestamp}` | 发生时间 | `2026-08-07 01:37:00` |

---

### 3.4 RESTART_FAILED — 重启失败告警

**邮件标题**：`【EuriskoTax 告警】服务重启失败，需人工介入`

**邮件正文**：

```
服务自动重启失败，需要人工介入处理。

━━━ 告警信息 ━━━
故障对象：{target}
故障原因：{reason}
已重启次数：{restartCount}
错误详情：{details}
发生时间：{timestamp}

━━━ 处理建议 ━━━
请尽快检查服务状态并手动处理。
后端日志：{logPath}
cpolar 日志：{cpolarLogPath}
事件日志：events.log

如多次失败，可尝试运行 .\start-dev.ps1 -Share -Watchdog 重新启动全套服务。
```

**占位符**：

| 占位符 | 说明 | 示例值 |
|--------|------|--------|
| `{target}` | 故障对象 | `backend` / `cpolar` |
| `{reason}` | 故障原因 | `backend_timeout_30s` |
| `{restartCount}` | 已重启次数 | `3` |
| `{details}` | 错误详情 | `timeout 30s, attempted_pid=12345` |
| `{timestamp}` | 发生时间 | `2026-08-07 01:38:00` |
| `{logPath}` | 后端日志路径 | `%TEMP%\eurisko-server-watchdog.log` |
| `{cpolarLogPath}` | cpolar日志路径 | `%TEMP%\cpolar-euriskotax-watchdog.log` |

---

### 3.5 MAX_RESTARTS_REACHED — 重启上限告警

**邮件标题**：`【EuriskoTax 告警】重启次数已达上限，守护停止`

**邮件正文**：

```
服务持续异常，重启次数已达配置上限，守护脚本放弃自动恢复。

━━━ 告警信息 ━━━
故障对象：{target}
最大重启次数：{maxRestarts}
发生时间：{timestamp}

━━━ 处理建议 ━━━
需要人工介入！请检查服务状态并手动重启。
可运行 .\start-dev.ps1 -Share -Watchdog 重新启动全套服务。
```

**占位符**：

| 占位符 | 说明 | 示例值 |
|--------|------|--------|
| `{target}` | 故障对象 | `backend` / `cpolar` |
| `{maxRestarts}` | 最大重启次数 | `10` |
| `{timestamp}` | 发生时间 | `2026-08-07 01:39:00` |

---

### 3.6 TEST — 测试邮件

**邮件标题**：`【EuriskoTax】邮件通知测试`

**邮件正文**：

```
这是一封来自 EuriskoTax 守护脚本的测试邮件。

如果您收到了这封邮件，说明 SMTP 邮件通知功能已正常工作。

━━━ 配置信息 ━━━
发件邮箱：{from}
收件邮箱：{recipients}
SMTP 服务器：{smtpHost}:{smtpPort} (SSL)

━━━ 通知事件类型 ━━━
1. 后端服务自动重启（BACKEND_RESTART）
2. cpolar 隧道自动重启（CPOLAR_RESTART）
3. 公网地址变更（URL_CHANGED）
4. 重启失败告警（RESTART_FAILED）
5. 重启次数达上限告警（MAX_RESTARTS_REACHED）

发生时间：{timestamp}
```

**发送方式**：

```powershell
. .\notify.ps1
Send-TestNotification
```

---

## 四、事件日志格式（events.log）

### 4.1 文件位置

```
e:\WorkPrograms\Trae\EuriskoTax\events.log
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
| 事件类型 | 枚举 | 是 | `BACKEND_RESTART` / `CPOLAR_RESTART` / `URL_CHANGED` / `RESTART_FAILED` |
| `reason` | 字符串 | 是 | 故障原因诊断结果（见下表） |
| `recovery_ms` | 整数 | 否 | 恢复耗时（毫秒），仅重启事件 |
| `new_url` | URL | 否 | 新公网地址，仅 cpolar 相关事件 |
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

```
[2026-08-07 01:35:50] [BACKEND_RESTART] event=BACKEND_RESTART | reason=port_3000_not_listening | recovery_ms=12000 | details=new_pid=45678
[2026-08-07 01:36:30] [CPOLAR_RESTART] event=CPOLAR_RESTART | reason=cpolar_process_dead | recovery_ms=8000 | new_url=https://xyz.r8.cpolar.cn | old_url=https://abc.r8.cpolar.cn
[2026-08-07 01:36:30] [URL_CHANGED] event=URL_CHANGED | reason=cpolar_restart_new_url | new_url=https://xyz.r8.cpolar.cn | old_url=https://abc.r8.cpolar.cn
[2026-08-07 01:37:00] [URL_CHANGED] event=URL_CHANGED | reason=auto_reconnect_new_url | new_url=https://new.r8.cpolar.cn | old_url=https://xyz.r8.cpolar.cn
[2026-08-07 01:38:00] [RESTART_FAILED] event=RESTART_FAILED | reason=backend_timeout_30s | recovery_ms=30000 | details=attempted_pid=12345
[2026-08-07 01:39:00] [RESTART_FAILED] event=RESTART_FAILED | reason=max_restarts_reached | details=target=backend count=10
```

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
  "recipients": ["xxx@qq.com"],   // 收件人列表（可多个）
  "enabled": true,                // 总开关
  "notifyOn": {
    "backendRestart": true,
    "cpolarRestart": true,
    "urlChanged": true,
    "restartFailed": true
  }
}
```

### 5.2 notify-templates.json

模板文件使用 JSON 格式，每个事件类型包含 `subject`（标题）和 `body`（正文）。

- 换行符：JSON 中用 `\n`，发送时自动转换为真实换行
- 占位符：`{name}` 格式，由 `Format-Template` 函数替换
- 编码：UTF-8，支持中文直接书写

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
# 方式一：通过 start-dev.ps1 一键启动（推荐）
.\start-dev.ps1 -Share -Watchdog

# 方式二：单独启动 watchdog
.\watchdog.ps1 -Share -IntervalSec 20
```

### 6.2 发送测试邮件

```powershell
. .\notify.ps1
Send-TestNotification
```

### 6.3 查看事件日志

```powershell
# 查看最近 20 条事件
Get-Content .\events.log -Tail 20

# 筛选特定类型事件
Select-String -Path .\events.log -Pattern "URL_CHANGED"
Select-String -Path .\events.log -Pattern "RESTART_FAILED"
```

### 6.4 自定义模板

编辑 [notify-templates.json](../../notify-templates.json)，修改对应事件的 `subject` 或 `body`。无需重启 watchdog，下次触发事件时自动读取最新模板。

### 6.5 新增事件类型

1. 在 `notify-templates.json` 中添加新的事件模板
2. 在 `notify.ps1` 的 `Should-Notify` 函数中添加开关判断
3. 在 `notify.config.json` 的 `notifyOn` 中添加开关配置
4. 在 `watchdog.ps1` 中触发通知：`Invoke-Notification -EventType "NEW_EVENT" -TemplateData @{ ... }`

---

## 七、注意事项

1. **授权码安全**：`notify.config.json` 包含敏感信息，请勿提交到 Git 仓库（建议加入 `.gitignore`）
2. **PowerShell 编码**：`watchdog.ps1` 和 `notify.ps1` 使用英文注释避免 PS5 编码问题，中文内容通过 JSON 模板加载
3. **邮件频率**：watchdog 每 20 秒检查一次，频繁崩溃可能导致邮件轰炸。建议设置 `MaxRestarts` 限制
4. **免费版 cpolar**：公网 URL 每次重启都会变化，URL_CHANGED 邮件会包含新旧地址对比
5. **QQ邮箱限制**：每日发信量有上限（通常 500 封），开发环境足够使用
