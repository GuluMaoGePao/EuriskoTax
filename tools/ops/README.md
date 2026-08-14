# EuriskoTax 运维脚本目录

> 本目录存放开发环境运维脚本、通知配置和部署脚本，与主项目代码（src/、server/）分离。

---

## 文件清单

| 文件 | 用途 | Git 跟踪 |
|------|------|---------|
| `ops-start-dev.ps1` | 一键启动脚本（环境检查+依赖+重置用户+启动服务+守护） | ✅ |
| `ops-watchdog.ps1` | 服务守护脚本（监控后端+cpolar，自动重启，事件记录） | ✅ |
| `ops-notify.ps1` | 邮件通知模块（模板渲染+SMTP发送+详细日志） | ✅ |
| `ops-deploy.ps1` | 一键部署脚本（打包+传输+安装+迁移+重启+健康检查+回滚） | ✅ |
| `ops-notify-templates.json` | 中文邮件模板 v3.1（URL_CHANGED + TEST） | ✅ |
| `ops-notify-reason-map.json` | reason 代码到中文描述的映射（14 种） | ✅ |
| `ops-deploy.config.example.json` | 部署配置模板（服务器信息+环境变量+hooks） | ✅ |
| `notify.config.json` | SMTP 配置+收件人+通知开关（含授权码） | ❌ 已 gitignore |
| `deploy.config.json` | 部署配置（服务器 IP/密钥/路径，含敏感信息） | ❌ 已 gitignore |
| `watchdog.log` | 守护脚本运行日志（运行时生成） | ❌ *.log 已 gitignore |
| `events.log` | 结构化事件日志（运行时生成） | ❌ *.log 已 gitignore |
| `notify.log` | 邮件发送详细日志（运行时生成） | ❌ *.log 已 gitignore |

---

## 相关工具

### EuriskoTax 开发控制台（GUI）

> 本地可视化 GUI 工具，双击即可执行常用开发指令，**完全不消耗 AI 积分**。

位置：[`tools/gui/`](../gui/)

| 文件 | 用途 |
|------|------|
| `tools/gui/gui-启动.bat` | 双击启动器 |
| `tools/gui/gui-创建快捷方式.bat` | 一次性创建桌面快捷方式 |
| `tools/gui/gui-dev-console.ps1` | GUI 主脚本（WinForms） |
| `tools/gui/README.md` | 详细使用说明 |

GUI 内置 6 大功能面板（共 40+ 按钮），调用本目录下的 `ops-start-dev.ps1`、`ops-deploy.ps1`、`ops-notify.ps1` 等脚本：
- 🚀 启动管理（标准/快速/cpolar/守护/nodemon 等启动模式）
- 🗄️ 数据库（重置用户/迁移/Prisma Studio/重置数据库）
- 🧪 测试（全部测试/监听/性能/覆盖率）
- 📋 日志查看（watchdog/events/notify 日志）
- 🚢 部署（DryRun/正式/回滚/InitEnv）
- 🛠️ 常用工具（目录浏览/PowerShell/Git 操作）

详细使用说明见 [tools/gui/README.md](../gui/README.md)。

---

## 快速使用

### 一键启动（推荐）

```powershell
# 在项目根目录执行
.\tools\ops\ops-start-dev.ps1 -Share -Watchdog
```

### 单独启动守护脚本

```powershell
.\tools\ops\ops-watchdog.ps1 -Share -IntervalSec 20
```

### 发送测试邮件

```powershell
. .\tools\ops\ops-notify.ps1
Send-TestNotification
```

### 一键部署到服务器

```powershell
# 1. 首次使用：复制配置模板并填入服务器信息
Copy-Item .\tools\ops\ops-deploy.config.example.json .\tools\ops\deploy.config.json
# 编辑 deploy.config.json 填入 host/user/privateKeyPath 等

# 2. 首次部署前：在服务器上初始化环境变量文件（敏感变量不经过本地）
.\tools\ops\ops-deploy.ps1 -InitEnv
#   交互式输入 JWT_SECRET 和 DATABASE_URL
#   自动生成 32 字符随机 JWT_SECRET（如留空）
#   文件权限设为 600，存储在服务器 /opt/euriskotax/.env.shared

# 3. DryRun 预览打包结果（不实际部署）
.\tools\ops\ops-deploy.ps1 -DryRun

# 4. 正式部署（自动跑测试 → 打包 → 传输 → 同步.env → 安装 → 迁移 → 重启 → 健康检查）
.\tools\ops\ops-deploy.ps1

# 5. 跳过测试快速部署
.\tools\ops\ops-deploy.ps1 -SkipTest

# 6. 回滚到上一版本
.\tools\ops\ops-deploy.ps1 -Rollback
```

### 查看日志

```powershell
# 守护脚本日志
Get-Content .\tools\ops\watchdog.log -Tail 20

# 事件日志
Get-Content .\tools\ops\events.log -Tail 20

# 邮件发送日志
Get-Content .\tools\ops\notify.log -Tail 30
```

---

## 路径机制

脚本内部通过 `$ScriptDir`（脚本所在目录）和 `$ProjectRoot`（上一级目录）定位文件：

```powershell
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir  # 项目根目录
```

- **配置文件**（ops-notify-*.json）→ 与脚本同目录（`$ScriptDir`）
- **日志文件**（*.log）→ 与脚本同目录（`$ScriptDir`）
- **后端服务**（server/）→ 项目根目录下（`$ProjectRoot\server`）
- **cpolar**（tools/cpolar/）→ 项目根目录下（`$ProjectRoot\cpolar`）

---

## 首次配置

### 本地开发

1. 编辑 `notify.config.json` 填入 SMTP 授权码和收件人
2. 配置 cpolar（如需公网分享）：`.\tools\cpolar\cpolar.exe authtoken <token>`
3. 详细步骤参考 [部署指南](../docs/tech-reports/watchdog-deployment-guide.md)

### 服务器部署

1. 复制部署配置模板：`Copy-Item .\tools\ops\ops-deploy.config.example.json .\tools\ops\deploy.config.json`
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

## 部署脚本详解（ops-deploy.ps1）

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
.\tools\ops\ops-deploy.ps1 -Rollback
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
