# EuriskoTax

> 个人所得税计算工具 — 开发环境守护与通知系统说明

---

## 快速启动

```powershell
# 标准启动（本地开发）
.\scripts\start-dev.ps1

# 公网分享 + 守护脚本（给好友测试时推荐）
.\scripts\start-dev.ps1 -Share -Watchdog
```

启动后会自动：检查环境 → 安装依赖 → 重置 dev 用户 → 启动后端 → (可选)启动 cpolar 公网隧道 → (可选)启动守护脚本

**测试账号**：`dev@example.com` / `password`

---

## 项目结构

```
EuriskoTax/
├── src/                # 前端源码（主项目）
├── server/             # 后端源码（主项目）
├── tests/              # 测试代码
├── scripts/            # 运维脚本（watchdog/notify/start-dev + 通知配置）
├── docs/               # 项目文档（索引见 docs/README.md）
├── images/             # 项目图片资源
├── cpolar/             # cpolar 内网穿透工具
└── index.html          # 前端入口
```

> 主项目代码、运维脚本、测试代码、文档职责分离。详见 [docs/README.md](docs/README.md)。

---

## 守护脚本系统

### 核心文件

| 文件 | 作用 |
|------|------|
| [scripts/start-dev.ps1](scripts/start-dev.ps1) | 一键启动脚本（环境检查+依赖安装+服务启动） |
| [scripts/watchdog.ps1](scripts/watchdog.ps1) | 守护主脚本（每20秒监控+自动重启+事件记录） |
| [scripts/notify.ps1](scripts/notify.ps1) | 邮件通知模块（SMTP发送+模板渲染） |
| [scripts/notify.config.json](scripts/notify.config.json) | SMTP配置（邮箱+授权码+收件人，**已加入.gitignore**） |
| [scripts/notify-templates.json](scripts/notify-templates.json) | 中文邮件模板（URL_CHANGED + TEST） |
| scripts/watchdog.log | 守护运行日志 |
| scripts/events.log | 重启事件日志（结构化） |

### 监控范围

| 监控对象 | 健康判定 | 异常处理 |
|---------|---------|---------|
| 后端服务（:3000） | 端口监听 + HTTP 200/401 响应 | 杀旧进程 → `node src/app.js` → 30秒等待就绪 |
| cpolar 隧道 | 进程存活 + 公网URL可达 | 杀旧进程 → `cpolar start eurisko` → 30秒等待URL |

---

## 邮件通知

### 配置方法

1. 编辑 [notify.config.json](scripts/notify.config.json)，填写QQ邮箱和授权码
2. 将 `enabled` 设为 `true`
3. 发送测试邮件验证：

```powershell
. .\notify.ps1
Send-TestNotification
```

> **QQ邮箱授权码获取**：登录 mail.qq.com → 设置 → 账户 → POP3/SMTP服务 → 开启 → 获取授权码

### 通知策略

**仅公网地址变更（URL_CHANGED）通过邮件通知**，其他事件仅记录到 events.log。

| 事件 | 邮件通知 | 记录日志 | 说明 |
|------|---------|---------|------|
| 后端重启 | ❌ 不通知 | ✅ events.log | 自动恢复，无需人工干预 |
| 隧道重启 | ❌ 不通知 | ✅ events.log | 自动恢复，无需人工干预 |
| **地址变更** | **✅ 发送邮件** | ✅ events.log | **含新地址+测试账号，需通知测试员** |
| 重启失败 | ❌ 不通知 | ✅ events.log | 查看 events.log 了解详情 |
| 重启上限 | ❌ 不通知 | ✅ events.log | 查看 events.log 了解详情 |
| 测试邮件 | ✅ 手动触发 | — | 验证 SMTP 配置 |

> 如需启用其他事件的邮件通知，编辑 [notify.config.json](scripts/notify.config.json) 的 `notifyOn` 节点，将对应开关设为 `true`。

### 邮件模板

中文邮件模板（v3.0），定义在 [notify-templates.json](scripts/notify-templates.json)，仅包含 2 种模板：

- **URL_CHANGED** — 公网地址变更通知
- **TEST** — 邮件通知测试

URL_CHANGED 模板使用 `★★★ 新公网地址 ★★★` 醒目标记新地址，并包含测试员登录信息：

```
★★★ 新公网地址 ★★★

  {newUrl}

【地址变更详情】
  旧地址：{oldUrl}
  新地址：{newUrl}
  变更原因：{reason}
  发生时间：{timestamp}

【测试员登录信息】
  访问地址：{newUrl}
  测试账号：dev@example.com
  测试密码：password
```

修改模板无需重启 watchdog，下次触发事件时自动读取最新配置。

### 收件人配置

在 [notify.config.json](scripts/notify.config.json) 的 `recipients` 数组中添加多个收件人：

```json
"recipients": [
    "your_qq@qq.com",
    "tester1@qq.com",
    "tester2@qq.com"
]
```

公网地址变更邮件会同时发送给全部收件人。

---

## 事件日志

### 查看日志

```powershell
# 查看最近20条重启事件
Get-Content .\scripts\events.log -Tail 20

# 筛选地址变更事件
Select-String -Path .\scripts\events.log -Pattern "URL_CHANGED"

# 筛选重启失败事件
Select-String -Path .\scripts\events.log -Pattern "RESTART_FAILED"
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
.\scripts\start-dev.ps1

# 启动全套服务 + 公网分享 + 守护
.\scripts\start-dev.ps1 -Share -Watchdog

# 单独启动守护脚本
.\watchdog.ps1 -Share -IntervalSec 20

# 发送测试邮件
. .\notify.ps1; Send-TestNotification

# 查看事件日志
Get-Content .\scripts\events.log -Tail 20

# 查看守护心跳日志
Get-Content .\scripts\watchdog.log -Tail 20
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
