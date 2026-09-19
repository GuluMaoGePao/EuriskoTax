# EuriskoTax

> 个人所得税预算规划与优化工具 —— 全部计税引擎在浏览器本地运行，云端提供账号、历史同步与增值能力。

---

## 当前状态（v1.17.0 · 2026-09-13 ｜ ⚠️ 版本号滞后，实际最新见下方）

> ⚠️ 本节写于 v1.17.0，之后未逐版更新。**实际最新版本以 [CHANGELOG.md](CHANGELOG.md) 为准**
> —— 截至 2026-09-17 为 **v1.41.0**（UI 结果页视觉层级 Phase 2 + 通用单调求解器）。
> 本节保留作为当时的工程状态快照，不要拿它查版本号。

| 项 | 状态 |
|---|---|
| 生产环境 | ✅ Zeabur（Tencent Tokyo）+ PostgreSQL + HTTPS，公网地址 **https://euriskotax.zeabur.app**（Dockerfile 构建部署，推 main 自动上线） |
| 版本 | CHANGELOG 最新 **1.34.0**（阶段15 15B-6：第十八个 SEO 落地页 `/seo/disability-fund.html`「残保金与工会经费」—— 30 人免征、31 人按全部人数算、封顶社平 2 倍不是 300%、第一个残疾人最值钱；上一版 1.33.0 = `/seo/business-income.html`「个体工商户经营所得：核定 vs 查账」「多处任职 / 年中跳槽」深度版（多段独立累计预扣 + 汇算合并，把「档位重置」与「重复扣 6 万」两个补税机制分开），1.24.0 = 第十个 SEO 落地页 `/seo/early-retirement.html`「提前退休 / 内部退养一次性收入」，1.23.0 = 第九个页面「外籍个人津补贴免税」，1.22.0 = 第八个页面「个人养老金」，1.21.0 = 第七个页面「专项附加扣除」，1.20.0 = 第六个页面「离职补偿金个税」；更早 1.19.0 产品方向调整：计算页取消「参保城市」选择，回到「默认基数 + 用户自改」，城市改由留资时收集、顾问核对当地口径；上一版 1.16.0 = 第三个 SEO 落地页 `/seo/annual-settlement.html`「汇算清缴计算器」，1.15.0 = `/seo/salary-tax.html`「月薪个税计算器」，1.14.0 = `/seo/bonus-tax.html`「年终奖个税计算器」，1.13.0 = 阶段14 变现与可信度：`ProCode` 专业版兑换码 —— 线下收款发码 → 用户自助兑换 → 权益即时生效，C2 城市社保参数库（参数库保留，端上分档已回退）；详见 [CHANGELOG.md](CHANGELOG.md)；版本号**五处同步**：`package.json` / 关于弹窗 / `index.html` 的 `window.__APP_VERSION__` / `version.json` / CHANGELOG） |
| 免费/专业版 | ✅ 阶段10 已上线（v1.7.0）：计税能力永不锁定，登录仅解锁云端历史同步；运维后台（`admin.html`）可调用户权益 |
| PWA | ✅ 可安装、离线可打开应用壳（网络优先瘦缓存，发版无需手动清缓存） |
| 注册方式 | 邮箱验证码 + **一机一码邀请码**（公测期，需向开发者获取） |
| 登录/找回 | 邮箱登录（可勾选"保持登录状态"）、注册勾选协议、忘记密码**邮箱验证码自助找回** |
| 运营闭环 | ✅ 意见反馈落库 + 管理员跟进；计算完成即进入「工具 → 服务」转化闭环（留资线索 + 顾问跟进状态机 + 转化漏斗，北极星 `lead_submit / calc_done`）；登录用户保存计算仅匿名上报"计算类型"，支撑运营统计 |
| SEO 落地页 | ✅ v1.14.0 [年终奖个税计算器](https://euriskotax.zeabur.app/seo/bonus-tax.html)（静态正文 + 同源口径速算器 + 六个临界点跳档提示）· ✅ v1.15.0 [月薪个税计算器](https://euriskotax.zeabur.app/seo/salary-tax.html)（累计预扣口径 + 七档预扣率表 + 12 个月逐月预扣示例表）· ✅ v1.16.0 [个税汇算清缴计算器](https://euriskotax.zeabur.app/seo/annual-settlement.html)（应退/应补 = 全年应纳税额 − 已预缴税额 + 七档年度税率表 + 三种典型情形示例表），配 `robots.txt` / `sitemap.xml`；方案与后续词条见 [docs/development/seo-landing-plan.md](docs/development/seo-landing-plan.md) |
| 下一阶段 | ⏳ **阶段15 税务计算能力扩展（多税种）**（先 15A 个税纵深 → 后 15B 企业税种；纯前端、不依赖 ICP 备案）→ **阶段16 迁移与合规升级**（前置 ICP 备案；16D B 端 API 依赖 15B）；并行线：ICP 备案。方案见 [stage15-multi-tax-plan.md](docs/development/stage15-multi-tax-plan.md) / [stage16-migration-and-compliance-plan.md](docs/development/stage16-migration-and-compliance-plan.md) |
| 测试 | ✅ 85 套件 1610 个单元测试全通过（`npm test`，2026-09-13 复跑，含阶段13 线索契约 24 例 + 漏斗埋点 9 例 + 分享卡与落地 32 例 + 咨询情境契约 27 例 + 阶段14 专业版兑换码 28 例 + 城市社保参数 24 例 + 版本号五处同步 4 例 + 文档口径守护 5 例 + 阶段14 剩余项 SEO 落地页 41 例）；发布门禁 `verify:local` **259 项**全绿；动过 schema/迁移时另跑 `verify:pg`（生产等价 PostgreSQL 演练） |

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

> 💡 **图形化开发控制台（推荐）**：双击 `tools/gui/EuriskoTax-Console.bat`。在「🚀 启动管理」Tab 点击 **「第一次用：一键启动」**（新环境/刚拉代码）或 **「日常启动：快速启动」**（日常开发）开启后端；另有数据库、API 文档、测试、Git 等 8 个 Tab / 110+ 按钮。详见 [tools/gui/README.md](tools/gui/README.md) 与 [开发工作流总览](docs/guides/development-workflow.md)。

**本地测试账号**：默认 `dev@example.com` / `password`（由启动脚本自动重置）。本机想用自己账号，就在仓库根放一个 `dev-account.local.json`（已在 .gitignore，字段 `email` / `password`，可选 `username`）——登录页预填、GUI 复制按钮、门禁脚本都读它，**凭据不进版本库**；登录页在 localhost 下会自动出现「开发环境：填入本地测试账号」入口（生产不显示）

> ⚠️ 生产环境不创建 dev 账号；公测注册一律走「邮箱验证码 + 一机一码邀请码」。本地未配置 SMTP 时，注册验证码会打印到后端控制台（开发模式兜底）。

**发布纪律（先本地验证，再部署）**：
1. 改代码后先跑 `npm test`（单元测试）与 `npm run verify:local`（本地真实后端 e2e，共 259 项断言：前端与 SW 网络优先策略冒烟 / 登录 dev 账号 / 反馈落库+附图+用户与管理员列表+状态跟进 / 匿名埋点+聚合统计可读 / 运维后台用户列表·详情·权益调档 / 税制参数公开只读+版本化发布/回滚 / 城市社保参数公开只读（兜底城市不变量+指纹增量）+管理端发布·回滚·版本号唯一（端上已回退：不再让用户选参保城市）/ 回滚不残留（`index.html` 不得再引用已下线模块）/ 留资「所在城市」（省 + 市级联下拉，省市两项都提交后端：表单选填 + 透传 + 列表展示/按省市搜索/CSV 省市列）静态与 e2e 核对 / 三页「缴费比例」可输入（默认 5% 初始值，留空/越界回落默认值）+ 经营页「基数 × 比例」联动与低于下限提示静态接线 / 邀请码+验证码注册新号登录 / 线索留资+管理端列表·统计·导出 / 前端转化触点（结果页分流·留资弹窗·个人中心卡片）静态指纹 / 运维后台「线索」Tab（漏斗·状态机·分配·导出）静态指纹 / SEO 落地页六页（年终奖 / 月薪 / 汇算清缴 / 劳务报酬预扣预缴 / 股权激励 / 离职补偿金：可访问性 + canonical/FAQPage 结构化数据 + 静态税率表逐档对账 + 示例表可读 + CTA 归因 + 税种注册表登记政策文号）/ 专业版兑换码端到端（生成·兑换·叠加续期·作废·导出）+ 兑换入口静态指纹）。**动过 `server/prisma/schema.prisma` 或 `server/prisma/migrations/` 时，还必须加跑 `npm run verify:pg`**——用本地 PostgreSQL 演练同一套断言（`generate` → `migrate deploy` → 起服务，与线上容器同序），专门拦「本地 SQLite 全绿、线上迁移才炸」的问题（需 Docker Desktop + WSL2 后端；本机已装并实跑 251/251 全绿，未装则优雅跳过）。
2. **上线只走安全发布流水线**（本地门禁不过就物理上推不出去）：
   - 命令行：`.\tools\ops\ops-publish.ps1`（内部 = verify:local 全绿 → git commit → push origin main → 自动轮询核对线上指纹）；
   - GUI：控制台「🔐 Git & 账号」→「🚀 安全发布」（或先点「🧪 安全发布试运行」零风险预演一次）。
3. 线上核对项由 `.\tools\ops\ops-check-prod.ps1` 完成（**37 项**指纹：页面/登录表单、无 quick-login 残留、auth-ui 含 dev 入口与 409 提示、SW 无应用壳预缓存 + 协议守卫 + HTML 导航 network-first、app.js 无 `?v=` 指纹、版本三处线上比对、排障短链 `/reset`、内容端点、线索端点、专业版兑换码端点等）。
4. 老用户浏览器若仍显示旧版：`Application → Service Workers → Unregister` + `Clear site data` 后刷新。

---

## 功能特性

- **四种计税模式**：综合所得年度汇算 / 反向倒算 / 经营所得 / 分类所得；公益捐赠限额、年终奖最优分配、月度预扣累计
- **悬浮税助手**：28 条常见税务问答 + 搜索联想 + 收藏 + 反馈（本地优先、离线可用）
- **云端账号**：注册/登录（邮箱验证码）、个人中心、计算历史同步（云端保存 + 本地兜底）
- **PWA**：可安装、离线打开应用壳、更新提示
- **运营闭环（v1.6.0）**：个人中心「意见反馈」落库（Bug/建议 + 评分，管理员可列表跟进）；登录用户保存计算仅上报"计算类型"的匿名埋点（不含任何收入/扣除输入），支撑运营统计
- **响应式**：桌面 / 平板 / 移动端全覆盖（22 项规则）

架构核心原则：**计算永远在前端，云端只做增值**（免费版离线可用；云端为账号、同步、反馈运营与未来 B 端 API 服务）。

---

## 项目结构

```
EuriskoTax/
├── src/                # 前端源码（主项目）
├── server/             # 后端源码（主项目：Express + Prisma + 认证）
├── tests/              # 单元测试（492 个）
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
npm test                    # 运行全部单元测试（85 套件 1610 个，含覆盖率报告）
npm run test:watch          # 监听模式
npm run test:performance    # 计税性能基准
npm run verify:local        # 本地登录链路验证门禁（259 项断言，push 前必跑，见上文"发布纪律"）
npm run verify:pg           # 生产等价演练：同一套断言跑在本地 PostgreSQL（改了 schema/迁移后必跑）
npm run verify:release      # 发版前自检：版本号五处 + 文档口径 vs 实测（不一致退出码 1；加 `-- --write` 自动同步数字）
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

- **[UI 设计方案（确定性版本 · 开发唯一执行依据）](docs/guides/ui-design-spec.md)** —— 商业模式 / 目标群体 / 核心功能 · 导航架构 · 层级架构 · 24 个页面逐页内容与排版 · 结果页八段模板 · 后期开发注意事项与准入清单
- [UI/UX 上位方案论证过程稿](docs/guides/ui-ux-master-plan.md) · [Phase 0 实施记录](docs/guides/dual-end-ui-plan.md)（结论已收敛到上面那篇，这两篇只回溯用）
- [API 接口文档](docs/api/api-reference.md) · [开发计划](docs/development/development-plan.md)
- [计税规则手册](docs/guides/tax-calculation-rules.md) · [UI 组件复用指南](docs/guides/ui-component-reuse-guide.md)
- [开发工作流总览](docs/guides/development-workflow.md)（启动/验证/发布/回滚/排障，GUI 按钮命名权威）
- [冷启动推广素材](docs/marketing/cold-start-materials.md) · [测试报告](docs/reports/test-report.md)
- 文档中心索引：[docs/README.md](docs/README.md)
