# EuriskoTax 账号与密码管理

> 本文档统一整理项目中涉及的所有账号、密码、密钥及其获取方式。请妥善保管，切勿外传。

---

## 1. 项目登录账号（前端）

| 项目 | 值 | 说明 |
|------|------|
| **登录邮箱** | `dev@example.com` | 前端登录用账号 |
| **登录密码** | `password` | 前端登录用密码 |
| **使用位置** | http://localhost:3000/ | 启动后端后登录前端页面 |
| **重置方式** | GUI → 数据库 → 重置开发测试账号 | 一键重置为默认值 |

⚠️ **安全警告**：此账号仅限开发环境使用，生产环境必须删除并创建强密码账号。

---

## 2. JWT 密钥（后端）

| 项目 | 值 | 说明 |
|------|------|
| **开发密钥** | `dev-secret-key-change-in-production` | 位于 `server/.env` |
| **作用** | 后端 JWT Token 签名 | 用户登录后签发 Token 的密钥 |
| **配置文件** | `server/.env` → `JWT_SECRET=xxx` | |

⚠️ **安全警告**：生产环境必须替换为 32 位以上随机强密钥，例如：
```
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

---

## 3. API 文档 Bearer Token（Swagger）

| 项目 | 说明 |
|------|------|
| **访问地址** | http://localhost:3000/api/docs |
| **认证方式** | Bearer Token |
| **获取方式** | ① 用 dev@example.com/password 登录前端 → ② 打开浏览器 DevTools → ③ 从 localStorage 复制 auth_token |
| **使用方法** | 在 Swagger 页面点击右上角 🔒 Authorize → 粘贴 `Bearer <token>` → 点 Authorize |

---

## 4. QQ 邮箱授权码（邮件通知）

| 项目 | 说明 |
|------|------|
| **用途** | 看门狗事件通知（崩溃重启、部署成功、URL变更等） |
| **配置文件** | `tools/ops/notify.config.json` |
| **获取方式** | QQ 邮箱 → 设置 → 账户 → 开启 SMTP → 获取授权码 |
| **格式** | 16 位随机字符串（如 `frjzykaituavehii`） |

⚠️ 注意：这是邮箱**授权码**，不是邮箱登录密码。QQ 邮箱需先在设置中开启 SMTP 服务。

---

## 5. Cpolar Token（内网穿透）

| 项目 | 说明 |
|------|------|
| **用途** | 将本地 3000 端口映射到公网，方便外网访问 |
| **获取方式** | 注册 https://www.cpolar.com → 登录后台 → 复制 authtoken |
| **配置命令** | `.\tools\cpolar\cpolar.exe authtoken <你的token>` |
| **配置文件** | `~/.cpolar/cpolar.yml`（首次运行后自动生成） |

⚠️ 免费版 cpolar 每次重启 URL 会变化，需重新分享。

---

## 6. 部署 SSH 配置（远程服务器）

| 项目 | 说明 |
|------|------|
| **用途** | 正式部署到远程服务器 |
| **配置文件** | `tools/ops/ops-deploy.config.json` |
| **模板文件** | `tools/ops/ops-deploy.config.example.json` |
| **需填写** | 服务器 IP、SSH 端口、用户名、密码/密钥、项目路径 |
| **认证方式** | `key`（推荐，需指定 privateKeyPath）或 `password` |

⚠️ 生产环境建议使用 SSH 密钥认证，不要用密码。

---

## 7. Prisma 数据库

| 项目 | 说明 |
|------|------|
| **数据库类型** | SQLite（开发）/ PostgreSQL（生产） |
| **开发库文件** | `server/dev.db` |
| **重置方式** | GUI → 数据库 → 重置开发测试账号 / 重建数据库 |
| **可视化** | GUI → 数据库 → 打开 Prisma Studio（http://localhost:5555） |
| **Schema** | `server/prisma/schema.prisma` |

---

## 快速参考卡片

```
┌─────────────────────────────────────────────────┐
│  EuriskoTax 快速登录信息                         │
│                                                   │
│  前端地址:  http://localhost:3000/               │
│  登录邮箱:  dev@example.com                       │
│  登录密码:  password                              │
│                                                   │
│  API文档:  http://localhost:3000/api/docs        │
│  (需先登录前端获取 Bearer Token)                  │
│                                                   │
│  数据库:   http://localhost:5555/ (Prisma Studio) │
│                                                   │
│  账号管理:  GUI → 常用工具 → 账号 & 密码管理       │
└─────────────────────────────────────────────────┘
```

---

## 安全须知

1. **开发账号 `dev@example.com / password`** 仅用于本地开发，不得用于生产环境
2. **JWT Secret** 开发用的弱密钥 `dev-secret-key-change-in-production` 必须在生产环境替换
3. **QQ 邮箱授权码** 一旦泄露可被他人冒用发送邮件，请妥善保管
4. **Cpolar Token** 泄露会导致他人冒用你的内网穿透额度
5. **SSH 密钥** 泄露会导致服务器被入侵，请使用密钥认证而非密码
6. 所有配置文件（notify.config.json、ops-deploy.config.json）中含有敏感信息，**切勿提交到 Git 仓库**
7. GUI 中的账号管理卡片可一键复制到剪贴板，使用后建议清空剪贴板
