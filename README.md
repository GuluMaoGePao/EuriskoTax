# EuriskoTax

> 个人所得税计算工具 — 开发环境守护与通知系统说明

---

## 快速启动

```powershell
# 标准启动（本地开发）
.\start-dev.ps1

# 公网分享 + 守护脚本（给好友测试时推荐）
.\start-dev.ps1 -Share -Watchdog
```

启动后会自动：检查环境 → 安装依赖 → 重置 dev 用户 → 启动后端 → (可选)启动 cpolar 公网隧道 → (可选)启动守护脚本

**测试账号**：`dev@example.com` / `password`

---

## 守护脚本系统

### 核心文件

| 文件 | 作用 |
|------|------|
| [start-dev.ps1](start-dev.ps1) | 一键启动脚本（环境检查+依赖安装+服务启动） |
| [watchdog.ps1](watchdog.ps1) | 守护主脚本（每20秒监控+自动重启+事件记录） |
| [notify.ps1](notify.ps1) | 邮件通知模块（SMTP发送+模板渲染） |
| [notify.config.json](notify.config.json) | SMTP配置（邮箱+授权码+收件人，**已加入.gitignore**） |
| [notify-templates.json](notify-templates.json) | 中文邮件模板（6种事件） |
| watchdog.log | 守护运行日志 |
| events.log | 重启事件日志（结构化） |

### 监控范围

| 监控对象 | 健康判定 | 异常处理 |
|---------|---------|---------|
| 后端服务（:3000） | 端口监听 + HTTP 200/401 响应 | 杀旧进程 → `node src/app.js` → 30秒等待就绪 |
| cpolar 隧道 | 进程存活 + 公网URL可达 | 杀旧进程 → `cpolar start eurisko` → 30秒等待URL |

---

## 邮件通知

### 配置方法

1. 编辑 [notify.config.json](notify.config.json)，填写QQ邮箱和授权码
2. 将 `enabled` 设为 `true`
3. 发送测试邮件验证：

```powershell
. .\notify.ps1
Send-TestNotification
```

> **QQ邮箱授权码获取**：登录 mail.qq.com → 设置 → 账户 → POP3/SMTP服务 → 开启 → 获取授权码

### 通知事件类型

| 事件 | 标题 | 触发条件 |
|------|------|---------|
| 后端重启 | 【EuriskoTax】后端服务已自动重启 | 后端崩溃后自动重启成功 |
| 隧道重启 | 【EuriskoTax】cpolar 隧道已自动重启 | 隧道断连后自动重启成功 |
| 地址变更 | 【EuriskoTax】公网测试地址已变更 | 公网URL变化（含新旧对比） |
| 重启失败 | 【EuriskoTax 告警】服务重启失败，需人工介入 | 自动重启超时或异常 |
| 重启上限 | 【EuriskoTax 告警】重启次数已达上限，守护停止 | 达到MaxRestarts限制 |
| 测试邮件 | 【EuriskoTax】邮件通知测试 | 手动调用 Send-TestNotification |

### 邮件模板

所有邮件内容使用中文模板，定义在 [notify-templates.json](notify-templates.json)。

模板使用 `{占位符}` 语法，例如：

```
故障原因：{reason}
恢复耗时：{recoveryMs} 毫秒
新进程 PID：{newPid}
发生时间：{timestamp}
```

修改模板无需重启 watchdog，下次触发事件时自动读取最新配置。

---

## 事件日志

### 查看日志

```powershell
# 查看最近20条重启事件
Get-Content .\events.log -Tail 20

# 筛选地址变更事件
Select-String -Path .\events.log -Pattern "URL_CHANGED"

# 筛选重启失败事件
Select-String -Path .\events.log -Pattern "RESTART_FAILED"
```

### 日志格式

```
[时间戳] [事件类型] event=类型 | reason=原因 | recovery_ms=耗时 | new_url=新地址 | old_url=旧地址 | details=详情
```

### 常见故障原因

| reason 值 | 含义 |
|-----------|------|
| `port_3000_not_listening` | 后端端口未监听（进程崩溃） |
| `connection_refused_or_timeout` | 后端连接被拒绝或超时 |
| `cpolar_process_dead` | cpolar 进程不存在 |
| `public_url_timeout` | 公网URL访问超时 |
| `cpolar_restart_new_url` | 重启后获得新URL |
| `auto_reconnect_new_url` | cpolar自动重连产生新URL |

### 日志示例

```
[2026-08-07 01:35:50] [BACKEND_RESTART] event=BACKEND_RESTART | reason=port_3000_not_listening | recovery_ms=12000 | details=new_pid=45678
[2026-08-07 01:36:30] [URL_CHANGED] event=URL_CHANGED | reason=cpolar_restart_new_url | new_url=https://xyz.r8.cpolar.cn | old_url=https://abc.r8.cpolar.cn
[2026-08-07 01:38:00] [RESTART_FAILED] event=RESTART_FAILED | reason=backend_timeout_30s | recovery_ms=30000 | details=attempted_pid=12345
```

---

## 常用命令

```powershell
# 启动全套服务（本地）
.\start-dev.ps1

# 启动全套服务 + 公网分享 + 守护
.\start-dev.ps1 -Share -Watchdog

# 单独启动守护脚本
.\watchdog.ps1 -Share -IntervalSec 20

# 发送测试邮件
. .\notify.ps1; Send-TestNotification

# 查看事件日志
Get-Content .\events.log -Tail 20

# 查看守护心跳日志
Get-Content .\watchdog.log -Tail 20
```

---

## 安全说明

- `notify.config.json` 包含SMTP授权码，已加入 `.gitignore`，不会提交到Git
- `server/.env` 包含JWT密钥，已加入 `.gitignore`
- 源代码中无硬编码敏感信息
- 开发环境JWT密钥（`dev-secret-key-change-in-production`）仅限本地使用，生产环境需替换

---

## 更多文档

- [邮件通知与事件日志完整规范](docs/tech-reports/watchdog-notification-and-event-log-spec.md)
- [API 接口文档](docs/api/api-reference.md)
- [开发计划](docs/development/development-plan.md)
- [计税规则手册](docs/guides/tax-calculation-rules.md)
- [并发日志问题复盘](docs/tech-reports/mock-client-concurrent-logging-retrospective.md)
