# EuriskoTax 运维脚本目录

> 本目录存放开发环境运维脚本、通知配置和部署脚本，与主项目代码（src/、server/）分离。

---

## 文件清单

| 文件 | 用途 | Git 跟踪 |
|------|------|---------|
| `start-dev.ps1` | 一键启动脚本（环境检查+依赖+重置用户+启动服务+守护） | ✅ |
| `watchdog.ps1` | 服务守护脚本（监控后端+cpolar，自动重启，事件记录） | ✅ |
| `notify.ps1` | 邮件通知模块（模板渲染+SMTP发送+详细日志） | ✅ |
| `deploy.ps1` | 一键部署脚本（打包+传输+安装+迁移+重启+健康检查+回滚） | ✅ |
| `notify-templates.json` | 中文邮件模板 v3.1（URL_CHANGED + TEST） | ✅ |
| `notify-reason-map.json` | reason 代码到中文描述的映射（14 种） | ✅ |
| `deploy.config.example.json` | 部署配置模板（服务器信息+环境变量+hooks） | ✅ |
| `notify.config.json` | SMTP 配置+收件人+通知开关（含授权码） | ❌ 已 gitignore |
| `deploy.config.json` | 部署配置（服务器 IP/密钥/路径，含敏感信息） | ❌ 已 gitignore |
| `watchdog.log` | 守护脚本运行日志（运行时生成） | ❌ *.log 已 gitignore |
| `events.log` | 结构化事件日志（运行时生成） | ❌ *.log 已 gitignore |
| `notify.log` | 邮件发送详细日志（运行时生成） | ❌ *.log 已 gitignore |

---

## 快速使用

### 一键启动（推荐）

```powershell
# 在项目根目录执行
.\scripts\start-dev.ps1 -Share -Watchdog
```

### 单独启动守护脚本

```powershell
.\scripts\watchdog.ps1 -Share -IntervalSec 20
```

### 发送测试邮件

```powershell
. .\scripts\notify.ps1
Send-TestNotification
```

### 一键部署到服务器

```powershell
# 1. 首次使用：复制配置模板并填入服务器信息
Copy-Item .\scripts\deploy.config.example.json .\scripts\deploy.config.json
# 编辑 deploy.config.json 填入 host/user/privateKeyPath 等

# 2. 首次部署前：在服务器上初始化环境变量文件（敏感变量不经过本地）
.\scripts\deploy.ps1 -InitEnv
#   交互式输入 JWT_SECRET 和 DATABASE_URL
#   自动生成 32 字符随机 JWT_SECRET（如留空）
#   文件权限设为 600，存储在服务器 /opt/euriskotax/.env.shared

# 3. DryRun 预览打包结果（不实际部署）
.\scripts\deploy.ps1 -DryRun

# 4. 正式部署（自动跑测试 → 打包 → 传输 → 同步.env → 安装 → 迁移 → 重启 → 健康检查）
.\scripts\deploy.ps1

# 5. 跳过测试快速部署
.\scripts\deploy.ps1 -SkipTest

# 6. 回滚到上一版本
.\scripts\deploy.ps1 -Rollback
```

### 查看日志

```powershell
# 守护脚本日志
Get-Content .\scripts\watchdog.log -Tail 20

# 事件日志
Get-Content .\scripts\events.log -Tail 20

# 邮件发送日志
Get-Content .\scripts\notify.log -Tail 30
```

---

## 路径机制

脚本内部通过 `$ScriptDir`（脚本所在目录）和 `$ProjectRoot`（上一级目录）定位文件：

```powershell
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir  # 项目根目录
```

- **配置文件**（notify-*.json）→ 与脚本同目录（`$ScriptDir`）
- **日志文件**（*.log）→ 与脚本同目录（`$ScriptDir`）
- **后端服务**（server/）→ 项目根目录下（`$ProjectRoot\server`）
- **cpolar**（cpolar/）→ 项目根目录下（`$ProjectRoot\cpolar`）

---

## 首次配置

### 本地开发

1. 编辑 `notify.config.json` 填入 SMTP 授权码和收件人
2. 配置 cpolar（如需公网分享）：`.\cpolar\cpolar.exe authtoken <token>`
3. 详细步骤参考 [部署指南](../docs/tech-reports/watchdog-deployment-guide.md)

### 服务器部署

1. 复制部署配置模板：`Copy-Item .\scripts\deploy.config.example.json .\scripts\deploy.config.json`
2. 编辑 `deploy.config.json` 填入：
   - `server.host` — 服务器 IP
   - `server.user` — SSH 用户名
   - `server.authMethod` — 认证方式（key 或 password）
   - `server.privateKeyPath` — SSH 密钥路径（如使用 key 认证）
   - `env.JWT_SECRET` — 生产环境密钥（**务必修改**）
3. 服务器前置条件：
   - 已安装 Node.js 18+
   - 已安装 npm
   - SSH 可访问（端口 22 或自定义）
   - 如使用 PM2，脚本会自动安装

---

## 部署脚本详解（deploy.ps1）

### 部署流程

```
本地检查 → 测试套件 → 打包项目 → 服务器检查 → 远程部署 → 健康检查
   ↓           ↓          ↓          ↓           ↓          ↓
 Node/SSH   npm test   tar.gz    Node/PM2    安装+迁移   HTTP 验证
```

### 服务器目录结构

```
/opt/euriskotax/               # 部署根目录（可在配置中修改）
├── current -> releases/...    # 软链接，指向当前版本
└── releases/
    ├── 20260810-220139/       # 每次发布一个时间戳目录
    │   ├── server/
    │   ├── src/
    │   ├── index.html
    │   └── package.json
    └── 20260810-210000/       # 旧版本（保留最近 5 个）
```

### 进程管理

| 方式 | 配置值 | 特点 |
|------|--------|------|
| PM2 | `"processManager": "pm2"` | 自动重启、日志管理、开机自启（推荐） |
| systemd | `"processManager": "systemd"` | 系统级服务管理，适合生产 |
| 直接运行 | `"processManager": "direct"` | nohup 后台运行，无自动重启 |

### 回滚机制

```powershell
# 回滚到上一版本（切换 current 软链接 + 重启进程）
.\scripts\deploy.ps1 -Rollback
```

### 自定义 Hooks

在 `deploy.config.json` 中配置：

```json
"hooks": {
  "preDeploy": "echo '部署开始' >> /var/log/deploy.log",
  "postDeploy": "curl -s https://your-webhook.com/deploy-ok",
  "healthCheckPath": "/api/auth/profile",
  "healthCheckTimeout": 30
}
```

---

## 相关文档

- [部署指南](../docs/tech-reports/watchdog-deployment-guide.md) — 完整部署流程（本地开发）
- [通知与事件日志规范](../docs/tech-reports/watchdog-notification-and-event-log-spec.md) — 通知策略与日志格式
- [故障排查 SOP 模板](../docs/tech-reports/troubleshooting-sop-template.md) — 故障排查标准流程
