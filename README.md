# EuriskoTax

> 个人所得税预算规划与优化工具 —— 全部计税引擎在浏览器本地运行，云端提供账号、历史同步与增值能力。

---

## 当前状态（v1.4.0 · 2026-09-06）

| 项 | 状态 |
|---|---|
| 生产环境 | ✅ Zeabur（Tencent Tokyo）+ PostgreSQL + HTTPS，公网地址 **https://euriskotax.zeabur.app**（Dockerfile 构建部署，推 main 自动上线） |
| 版本 | `1.4.0`（详见 [CHANGELOG.md](CHANGELOG.md)） |
| PWA | ✅ 可安装、离线可打开应用壳 |
| 注册方式 | 邮箱验证码 + **一机一码邀请码**（公测期，需向开发者获取） |
| 测试 | ✅ 6 套件 203 个单元测试全通过（`npm test`） |

---

## 快速启动

### 生产部署（Zeabur，推荐对外使用）

```text
1. 推送 main 分支到 GitHub
2. Zeabur 关联仓库自动构建 Dockerfile
3. 构建完成自动执行 prisma migrate deploy（生产 PostgreSQL）
4. 配置环境变量后访问公网地址
```

环境变量清单见 [docs/development/development-plan.md](docs/development/development-plan.md) 阶段 6/7。

### 本地开发

```powershell
# 方式一：命令行
cd server
npm install
npx prisma migrate dev        # 本地 SQLite（schema.dev.prisma）
npm run dev                   # 或直接 node src/app.js，监听 :3000
```

```powershell
# 方式二：一键脚本（自动环境检查 + 依赖安装 + 重置 dev 用户 + 启动后端）
.\tools\ops\ops-start-dev.ps1

# 加公网分享（cpolar 临时隧道）与守护自动重启（本地好友联调模式）
.\tools\ops\ops-start-dev.ps1 -Share -Watchdog
```

> 💡 **图形化开发控制台（推荐）**：双击 `tools/gui/EuriskoTax-Console.bat`。在「🚀 启动管理」Tab 点击 **🔥 完整测试** 一键开启后端；另有数据库、API 文档、测试、Git 等 8 个 Tab / 110+ 按钮。详见 [tools/gui/README.md](tools/gui/README.md)。

**本地测试账号**：`dev@example.com` / `password`（由启动脚本自动重置）

> ⚠️ 生产环境不创建 dev 账号；公测注册一律走「邮箱验证码 + 一机一码邀请码」。

---

## 功能特性

- **四种计税模式**：综合所得年度汇算 / 反向倒算 / 经营所得 / 分类所得；公益捐赠限额、年终奖最优分配、月度预扣累计
- **悬浮税助手**：28 条常见税务问答 + 搜索联想 + 收藏 + 反馈（本地优先、离线可用）
- **云端账号**：注册/登录（邮箱验证码）、个人中心、计算历史同步（云端保存 + 本地兜底）
- **PWA**：可安装、离线打开应用壳、更新提示
- **响应式**：桌面 / 平板 / 移动端全覆盖（22 项规则）

架构核心原则：**计算永远在前端，云端只做增值**（免费版离线可用；云端为账号、同步、反馈运营与未来 B 端 API 服务）。

---

## 项目结构

```
EuriskoTax/
├── src/                # 前端源码（主项目）
├── server/             # 后端源码（主项目：Express + Prisma + 认证）
├── tests/              # 单元测试（203 个）
├── tools/              # 辅助工具（ops 运维脚本 / gui 开发控制台 / cpolar）
├── docs/               # 项目文档（索引见 docs/README.md）
├── images/             # 项目图片资源
├── index.html          # 前端入口
├── service-worker.js   # PWA Service Worker
├── manifest.json       # PWA Manifest
└── Dockerfile          # 生产部署（Zeabur）
```

> 主项目代码、运维脚本、GUI 工具、测试代码、文档职责分离。详见 [docs/README.md](docs/README.md) 与 [tools/ops/README.md](tools/ops/README.md)。

---

## 本地联调与守护（已非主要部署方式）

> Trae 本地开发时代的分享/守护体系仍保留，用于快速发给好友体验，但**正式公测以 Zeabur 生产为准**。

| 工具 | 作用 |
|------|------|
| [tools/ops/ops-start-dev.ps1](tools/ops/ops-start-dev.ps1) | 一键启动脚本（环境检查+依赖安装+重置 dev 用户+服务启动+守护） |
| [tools/ops/ops-watchdog.ps1](tools/ops/ops-watchdog.ps1) | 守护主脚本（每 20 秒监控 + 自动重启 + 事件记录） |
| [tools/ops/ops-notify.ps1](tools/ops/ops-notify.ps1) | 邮件通知模块（SMTP 发送 + 模板渲染） |
| [tools/ops/notify.config.json](tools/ops/notify.config.json) | SMTP 配置（邮箱+授权码+收件人，**已 gitignore**） |

启动本地分享后，URL_CREATED / URL_CHANGED 事件会自动给测试员发邮件（附地址 + 本地测试账号）。常用命令：

```powershell
.\tools\ops\ops-start-dev.ps1 -Share -Watchdog            # 全套（本地 + 分享 + 守护）
. .\tools\ops\ops-notify.ps1; Send-TestNotification       # 发送测试邮件
Get-Content .\tools\ops\events.log -Tail 20               # 查看事件日志
```

详见 [tools/ops/README.md](tools/ops/README.md) 与 [docs/tech-reports/watchdog-notification-and-event-log-spec.md](docs/tech-reports/watchdog-notification-and-event-log-spec.md)。

---

## 测试

```bash
npm test                    # 运行全部单元测试（6 套件 203 个，含覆盖率报告）
npm run test:watch          # 监听模式
npm run test:performance    # 计税性能基准
```

测试报告见 [docs/reports/test-report.md](docs/reports/test-report.md)。

---

## 安全说明

- `tools/ops/notify.config.json`（SMTP 授权码）、`server/.env`（JWT 密钥）均已 `.gitignore`，不入库
- 生产 `JWT_SECRET` / `DATABASE_URL` 通过 Zeabur 环境变量注入，启动时强校验，弱密钥拒绝启动
- 注册接口限流：登录 10 次/15 分、验证码 5 次/15 分/IP；验证码/邀请码存哈希、一次性使用
- 源代码无硬编码敏感信息；本地开发密钥仅限本地

---

## 更多文档

- [API 接口文档](docs/api/api-reference.md) · [开发计划](docs/development/development-plan.md)
- [计税规则手册](docs/guides/tax-calculation-rules.md) · [UI 组件复用指南](docs/guides/ui-component-reuse-guide.md)
- [冷启动推广素材](docs/marketing/cold-start-materials.md) · [测试报告](docs/reports/test-report.md)
- 文档中心索引：[docs/README.md](docs/README.md)
