# EuriskoTax 文档中心

> 最后更新：2026-09-18
> 维护原则：按用途分类存放，本文件为统一入口索引
> 2026-09-18 新增：**「文档层级总图」章节**（下面的表格是平的，只回答「有哪些」；新增这一节回答「什么关系、我要做的事该读哪一份」）；登记 `docs/guides/site-structure-map.md`（全站现状测绘）
> 2026-09-14 新增：`docs/marketing/business-plan-for-partners.md`（合伙人版商业企划）与 `docs/marketing/gtm-execution-plan.md`（90 天落地执行手册）
> 2026-09-17 新增：**`docs/guides/ui-design-spec.md`（UI 设计方案 · 确定性版本 · 开发唯一执行依据）**；登记此前漏收的 `ui-ux-master-plan.md`（论证过程稿）与 `dual-end-ui-plan.md`（Phase 0 实施记录）

---

## 当前状态（v1.17.0 · 2026-09-13 ｜ ⚠️ 版本号滞后）

> ⚠️ **本节写于 v1.17.0，之后未逐版更新。**
> **实际最新版本以 [`CHANGELOG.md`](../CHANGELOG.md) 为准 —— 截至 2026-09-17 为 `v1.41.0`**（结果页视觉层级 Phase 2）。
> 本节保留作为当时的工程状态快照，不要拿它查版本号。

- **生产环境**：Zeabur（Tencent Tokyo）+ PostgreSQL + HTTPS，公网地址 `https://euriskotax.zeabur.app`（Dockerfile 构建部署）
- **主版本**：CHANGELOG 最新 **1.34.0**（阶段15 15B-6：第十八个 SEO 落地页 `/seo/disability-fund.html`「残保金与工会经费」；上一版 1.33.0 = `/seo/business-income.html`「个体工商户经营所得：核定 vs 查账」，1.32.0 = `/seo/employer-cost.html`「企业用工成本」「多处任职 / 年中跳槽」深度版 —— 多段独立累计预扣 + 汇算合并，把「档位重置」与「重复扣 6 万」两个补税机制分开；上一版 1.24.0 = 第十个页面 `/seo/early-retirement.html` 提前退休 / 内部退养一次性收入；上一版 1.23.0 = 第九个页面「外籍个人津补贴免税」，1.22.0 = 第八个页面「个人养老金」，1.21.0 = 第七个页面「专项附加扣除」，1.20.0 = 第六个页面「离职补偿金个税」；更早 1.19.0 产品方向调整：计算页取消「参保城市」选择，回到「默认基数 + 用户自改」，城市改由留资时收集、顾问核对当地口径；上一版 1.16.0 = 阶段14 剩余项：高商业意图 SEO 落地页 —— 第三个页面 `/seo/annual-settlement.html` 个税汇算清缴：静态正文（汇算公式与手算示例 / 七档年度税率表 / 三种典型情形示例表 / 退税与补税情形清单 / 办理时间与渠道 / 5 条 FAQ）+ 同源口径速算器（与内核 `computeDeductions` + `performTaxCalculation` 逐点对拍，并与月薪页互相对拍），把汇算讲成「应退/应补 = 全年应纳税额 − 已预缴税额」一道减法；上一版 1.15.0 = 第二个页面 `/seo/salary-tax.html` 月薪个税，1.14.0 = 首个页面 `/seo/bonus-tax.html` 年终奖个税，1.13.0 = 阶段14 变现与可信度：`ProCode` 专业版兑换码 + C2 城市社保参数库）。线上正式发布锚点见 [分支与版本发布策略 §5.3](guides/branch-release-strategy.md)：本地标签最新 `v1.15.0`，1.16.0 / 1.17.0 的标签尚未登记
- **测试**：78 套件 1397 个单元测试全部通过（`npm test`，2026-09-13 复跑，含阶段12 C1 税率热更新守护 20 例 + 阶段13 线索契约 24 例 + 漏斗埋点 9 例 + 分享卡与落地 32 例 + 咨询情境契约 27 例 + 阶段14 兑换码 28 例 + 城市社保参数 24 例 + 版本号五处同步 4 例 + 文档口径守护 5 例 + 阶段14 剩余项 SEO 落地页 41 例）；发布门禁 `verify:local` **259/259** 全绿；动了 schema/迁移时另跑 `verify:pg`（生产等价 PostgreSQL 演练；本机 Docker 已就绪，2026-09-13 实跑 259/259 全绿）
- **开发阶段**：阶段 8（首批测试用户运营）、阶段 9（PWA）、阶段 10（免费/专业版 ✅ v1.7.0 已上线）、阶段 11（内容/公告中心 ✅ v1.8.0 已上线）、阶段12 A + C1 ✅ 已完成（支付体系与 B 端 API 因 ICP 备案阻塞移至阶段16）、阶段13 获客与转化 ✅ 已完成（v1.12.0）、阶段14 变现与可信度 ✅ **已全部完成并上线**（14A–14D/C2 随 v1.13.0；剩余项「高商业意图 SEO 落地页」随 v1.14.0 / v1.15.0 / v1.16.0 陆续交付三页「年终奖个税」「月薪个税」「汇算清缴」，第四页「劳务报酬预扣预缴」随 v1.18.0 交付（阶段15 15A-1），第五页「股权激励个税」随 v1.19.0 交付（15A-2），第六页「离职补偿金个税」随 v1.20.0 交付（15A-3），第七页「专项附加扣除」随 v1.21.0 交付（15A-4），第八页「个人养老金」随 v1.22.0 交付（15A-5），第九页「外籍个人津补贴免税」随 v1.23.0 交付（15A-6），第十页「提前退休 / 内部退养一次性收入」随 v1.24.0 交付（15A-7），汇算页「多处任职 / 年中跳槽」深度版随 v1.25.0 交付（15A-8），第十一个页面 `/seo/vat.html`「增值税」随 v1.26.0 交付（15B-1，企业税种开局），第十二个页面 `/seo/corporate-income-tax.html`「企业所得税」随 v1.27.0 交付（15B-2），第十三个页面 `/seo/surtax-stamp-duty.html`「附加税与印花税」随 v1.28.0 交付（15B-3），第十四个页面 `/seo/social-base.html`「社保公积金」随 v1.29.0 交付（15C-1），第十五个页面 `/seo/net-salary.html`「税后工资 / 谈薪倒算」随 v1.30.0 交付（15C-2），工具总目录 `/seo/index.html` 随 v1.31.0 交付，第十六个页面 `/seo/employer-cost.html`「企业用工成本」随 v1.32.0 交付（15C-3），第十七个页面 `/seo/business-income.html`「个体工商户经营所得：核定 vs 查账」随 v1.33.0 交付（15B-5），第十八个页面 `/seo/disability-fund.html`「残保金与工会经费」随 v1.34.0 交付（15B-6））—— 14A/14B/14C `ProCode` 兑换码 + 14D/C2 城市社保参数库（端上「参保城市」下拉已于 v1.17.0 回退为「默认基数 + 用户自改」，参数库保留待 SEO 落地页复用）+ `/seo/bonus-tax.html` + `/seo/salary-tax.html` + `/seo/annual-settlement.html`（`verify:local` 259/259、单测 78 套件 1397 例）→ **阶段15 税务计算能力扩展（多税种）✅ 已全部关闭**（v1.18.0 → v1.35.0：20 个 SEO 落地页 + 20 个 quick 模块与对拍测试 + 税种注册表 27 条目），见 [development/stage15-multi-tax-plan.md](development/stage15-multi-tax-plan.md) —— ⚠️ 注意其交付的是**速算器与落地页**层；**阶段17 全税种完整测算** ⏳ 待开工（**核心卖点**：App 内多步完整测算目前只覆盖个人所得税 **1/6**，目标 6/6），见 [development/stage17-full-tax-coverage-plan.md](development/stage17-full-tax-coverage-plan.md)；**阶段16 迁移与合规升级** ⏳ 仍阻塞于 ICP 备案（16D B 端 API 依赖阶段17 补齐企业税种 deep），见 [development/stage16-migration-and-compliance-plan.md](development/stage16-migration-and-compliance-plan.md)；并行线：ICP 备案（3–5 周排队）

- **商业与冷启动状态（2026-09-14 补记）**：产品已具备获客条件（转化链路 + 线索管理 + 兑换码收款 + 3 个 SEO 落地页），**尚未开始推广（0 用户 / 0 收入）**；三个点火动作已完成前两项并补齐第三项 —— 注册 `.com` 域名（✅ 公司名下）→ 提交 ICP 备案（✅ 企业主体 · 有限责任公司，排队 3–5 周）→ 配置企业微信「联系我」活码（✅ 2026-09-16 已配置 `https://work.weixin.qq.com/kfid/kfcdb871293d06fc4d0`，留资弹窗现场生码且可点）；**P0 仅剩「顾问值班人与响应时限」**。战略与财务测算见 [marketing/business-plan-for-partners.md](marketing/business-plan-for-partners.md)，执行清单见 [marketing/gtm-execution-plan.md](marketing/gtm-execution-plan.md)

---

## 目录结构

```
EuriskoTax/
├── src/                               # 前端源码（主项目）
├── server/                            # 后端源码（主项目）
│   ├── prisma/                        # Prisma schema + 迁移
│   │   ├── schema.prisma              # 生产 PostgreSQL
│   │   ├── schema.dev.prisma          # 本地 SQLite（开发用）
│   │   └── migrations/               # 生产迁移 SQL
│   ├── scripts/                       # 后端脚本（生成邀请码 / 重置 dev 用户）
│   └── src/                           # Express + Prisma + 认证 + 路由
├── tests/                             # 测试代码
├── tools/                             # 辅助工具集中目录
│   ├── ops/                           # 运维脚本（ops-start-dev / ops-watchdog / ops-notify + 通知配置）
│   ├── gui/                           # GUI 开发控制台（WinForms，8 Tab / 110+ 按钮）
│   └── cpolar/                        # cpolar 内网穿透工具
├── docs/                              # 项目文档
│   ├── README.md                      # 本文件（文档索引）
│   ├── api/                           # API 接口文档
│   ├── development/                   # 开发规划
│   ├── guides/                        # 使用与开发指南
│   ├── marketing/                     # 市场推广素材
│   ├── reports/                       # 项目报告（交付/重构/测试）
│   └── tech-reports/                  # 技术报告（规范/复盘/部署/SOP）
├── images/                            # 项目图片资源
├── index.html                         # 前端入口
├── service-worker.js                  # PWA Service Worker
├── manifest.json                      # PWA Manifest
├── Dockerfile                         # Docker 镜像构建配置（Zeabur 生产部署）
├── package.json                       # npm 配置
├── README.md                          # 项目入口
└── CHANGELOG.md                       # 变更记录
```

> **职责分离原则**：主项目代码（src/、server/）与辅助工具（tools/）分离，测试代码（tests/）独立，文档统一归档在 docs/。辅助工具按类型加前缀（ops- 运维、gui- GUI）。

---

## 文档层级总图（先读这张，再看下面的清单）

> 下面的「文档清单」是**平的表格**，只回答「有哪些」；这一节回答「它们之间什么关系、我要做的事该读哪一份」。
> 2026-09-18 加。起因：UI 三件套互相引用却没人画层级，结果「想要的东西存在，但必须一层层点链接才找得到」——
> 这与 2026-09-17 为 `docs-metrics.test.js` 补「新增文档必须登记」断言是同一个病根的两次发作。

### 分层

```
第 0 层  入口
└── docs/README.md（本文件＝唯一索引）

第 1 层  权威规范（SSOT）——「该怎么做」以此层为准，下级不得推翻上级
├── guides/ui-design-spec.md        ★ UI 唯一权威（导航/层级/逐页排版/准入清单）
│   ├── guides/deep-wizard-ui-spec.md    子文档：多步向导的排版细则（不持有策略）
│   └── guides/site-structure-map.md     子文档：现状测绘 as-is（不持有决策）
├── guides/tax-calculation-rules.md     计税规则权威
└── api/api-reference.md                接口契约权威

第 2 层  现状测绘（as-is）——「现在是什么样」
└── guides/site-structure-map.md（画面清单 / 双端 UI 结构图 / IA 内容图 / 三条主流程 / 逐页入口去向，全部附代码行号）

第 3 层  方案与进度——「接下来做什么」
├── development/development-plan.md      总进度与里程碑
├── development/stage17-full-tax-coverage-plan.md   核心卖点（全税种完整测算），**进行中**：17A 已落地，vat / 附加税印花税已交付
├── development/stage16-migration-and-compliance-plan.md   迁移合规，阻塞于 ICP 备案
└── development/stage10 / 12 / 13 / 15-*             已关闭阶段的实施记录（只回查；阶段14 无独立方案文件）

第 4 层  论证过程稿——只在追问「为什么这么定」时回溯，日常开发不必读
├── guides/ui-ux-master-plan.md   90KB，含「前稿判断有误」的自我修订记录
└── guides/dual-end-ui-plan.md    Phase 0 实施记录（结论已并入第 1 层）

第 5 层  报告 / 技术报告 / 市场素材（reports / tech-reports / marketing）
```

### 按任务找文档（只读这一份起步）

| 我要做的事 | 该读哪一份 |
|---|---|
| 动任何一处 UI | `guides/ui-design-spec.md` |
| 改多步测算向导的排版 | `guides/deep-wizard-ui-spec.md` |
| 想知道有多少页面 / 用户怎么走 / 入口在哪 | `guides/site-structure-map.md` |
| 想知道当前做到哪一步 | 本文「当前状态」+ `development/development-plan.md` |
| 开工阶段17（全税种完整测算） | `development/stage17-full-tax-coverage-plan.md` |
| 追问「当时为什么这么定」 | `guides/ui-ux-master-plan.md`（过程稿；结论以第 1 层为准） |

### 两条硬规则

1. **新增文档必须登记进本文件** —— 由 `tests/docs-metrics.test.js`（2026-09-17 加）断言守护，不登记会红。
2. **第 1 层是唯一决策源** —— 第 1 层的子文档与第 4 层的过程稿都不得反向推翻它；冲突时以 `ui-design-spec.md` 为准。

---

## 文档清单

### API 接口

| 文档 | 用途 | 更新日期 |
|------|------|---------|
| [api/api-reference.md](api/api-reference.md) | 后端 REST API 接口规范 v2.8（认证含邮箱验证码/邀请码、计税、历史记录、反馈、内容中心、税制参数、城市社保参数、转化线索、专业版兑换码、管理员、运营统计） | 2026-09-13 |

### 开发规划

| 文档 | 用途 | 更新日期 |
|------|------|---------|
| [development/development-plan.md](development/development-plan.md) | 项目开发计划、里程碑、技术选型、阶段状态表 | 2026-09-13 |
| [development/file-management-policy.md](development/file-management-policy.md) | 文件管理规范（目录归属/命名/编码/变更流程） | 2026-09-07 |
| [development/stage10-free-pro-plan.md](development/stage10-free-pro-plan.md) | 阶段10 免费/专业版实施方案（已确认 · 待命执行） | 2026-09-07 |
| [development/stage12-core-enhancement-plan.md](development/stage12-core-enhancement-plan.md) | 阶段12 核心功能补强实施方案（A5/A3/A1/A2/A4 **全部已完成**：税法常量抽离与版本化、月度明细增强等；只动前端与常量，不碰后端） | 2026-09-12 |
| [development/stage12-c1-tax-rate-config-plan.md](development/stage12-c1-tax-rate-config-plan.md) | 阶段12 C1 税制参数配置化方案与实施记录 | 2026-09-12 |
| [development/stage13-acquisition-and-leads-plan.md](development/stage13-acquisition-and-leads-plan.md) | 阶段13 获客与转化（引流 → 线索）方案（13A 后端地基 ✅ / 13B 前端触点 ✅ / 13C 管理台「线索」Tab ✅ / 13D 一键结果分享图 ✅ / 13E 漏斗埋点 ✅，阶段13 已全部交付） | 2026-09-13 |
| [development/seo-landing-plan.md](development/seo-landing-plan.md) | 高商业意图 SEO 落地页方案（阶段14 剩余项：设计原则 / 关键词→页面映射 / 守护断言；已交付三页「年终奖个税」✅ v1.14.0、「月薪个税」✅ v1.15.0、「汇算清缴」✅ v1.16.0，其余词条并入阶段15） | 2026-09-13 |
| [development/stage15-multi-tax-plan.md](development/stage15-multi-tax-plan.md) | 阶段15 税务计算能力扩展（多税种）方案（15A 个税纵深 / 15B 企业税种 / 15C 社保薪酬 / 15D 架构与守护；含竞品对标与取舍） | 2026-09-13 |
| [development/stage16-migration-and-compliance-plan.md](development/stage16-migration-and-compliance-plan.md) | 阶段16 迁移与合规升级方案（16A 迁腾讯云国内节点 / 16B 官方支付 / 16C 微信小程序 / 16D B 端 API；含 ICP 备案 checklist） | 2026-09-13 |
| [development/stage17-full-tax-coverage-plan.md](development/stage17-full-tax-coverage-plan.md) | **阶段17 全税种完整测算方案（核心卖点兑现）** —— UI 排版前置 → 17A spec 扩展 / 17B 反向迁移已有 4 个 deep / **17D 个税纵深补齐（P0）** / 17C 铺齐 5 类税种；目标覆盖 6/6 类 + 个税场景完整度 10/16（现状 1/6、4/16） | 2026-09-18 |
| [guides/deep-wizard-ui-spec.md](guides/deep-wizard-ui-spec.md) | **通用多步测算向导 UI 排版规范**（阶段17 的开工前置）—— 结果页「区域词典」（15 区块 / 5 必选 / 顺序固定）、统一栅格三档、明细表三型、入口层 5 处必修、响应式与暗色约定、10 条新增守护断言、现有 4 页迁移清单 | 2026-09-18 |
| [guides/site-structure-map.md](guides/site-structure-map.md) | **站点结构图（现状测绘 as-is）**：画面清单（14 个 App 视图 / 12 个页内步骤 / 21 个 SEO 落地页 / 20 个浮层）、UI 结构图（双端）、内容结构图（IA）、三条用户主流程、逐页结构图 + 功能入口去向表（全部附代码行号） | 2026-09-18 |

### 使用与开发指南

| 文档 | 用途 | 更新日期 |
|------|------|---------|
| [guides/ui-design-spec.md](guides/ui-design-spec.md) | **UI 设计方案（确定性版本 · 开发唯一执行依据）**：商业模式/目标群体/核心功能 · 导航架构 · 层级架构 · 24 页逐页内容与排版 · 结果页八段模板 · 后期开发注意事项与准入清单 | **2026-09-17** |
| [guides/ui-ux-master-plan.md](guides/ui-ux-master-plan.md) | UI/UX 上位方案 **论证过程稿**（90KB，含取舍修订记录；**结论已收敛到 `ui-design-spec.md`**，日常开发不必读） | 2026-09-17 |
| [guides/dual-end-ui-plan.md](guides/dual-end-ui-plan.md) | **Phase 0 实施记录**（设计令牌/z 层级/断点/屏幕预算/容器加宽/助手推开/打印，S0–S8 ✅ 全完成） | 2026-09-17 |
| [guides/tax-calculation-rules.md](guides/tax-calculation-rules.md) | 计税规则手册（综合所得/经营所得/反向倒算等） | 2026-09-13 |
| [guides/ui-component-reuse-guide.md](guides/ui-component-reuse-guide.md) | 前端 UI 组件复用指南（Sticky 导航/卡片渲染/事件委托等） | 2026-08-05 |
| [guides/responsive-rules-reference.md](guides/responsive-rules-reference.md) | 响应式规则维护手册（规则+性能数据+验证方法） | 2026-09-07 |
| [guides/development-workflow.md](guides/development-workflow.md) | 开发工作流总览（启动/验证/发布/回滚/排障，按钮命名权威定义） | 2026-09-13 |
| [guides/branch-release-strategy.md](guides/branch-release-strategy.md) | 分支与版本发布策略（主干模型/命名/版本号五处同步/自动打 tag/回滚） | 2026-09-08 |
| [guides/gui-button-reference.md](guides/gui-button-reference.md) | GUI 开发控制台按钮速查（110 按钮基线 + 邀请码管理增量） | 2026-08-16 |
| [guides/coding-rules-reference.md](guides/coding-rules-reference.md) | **编码约定速查**：作用域（不用 IIFE）/ 加载顺序 / 不静默吞错 / 接线契约测试 / 重构「零功能变化」怎么证明 / 命名允许名单 —— **每条均标注出处** | **2026-09-17** |
| [guides/support-playbook.md](guides/support-playbook.md) | 客服排障手册（发布后用户问题的处理路径与话术，配套管理台「排障」Tab） | 2026-09-13 |

### 项目报告

| 文档 | 用途 | 更新日期 |
|------|------|---------|
| [reports/final-delivery-checklist.md](reports/final-delivery-checklist.md) | 最终交付清单（交付物总览/质量验收） | 2026-09-07 |
| [reports/refactor-summary-report.md](reports/refactor-summary-report.md) | 重构成果汇总报告（三批次+Phase 4） | 2026-08-05 |
| [reports/performance-optimization-report.md](reports/performance-optimization-report.md) | 前端渲染性能优化报告（主页 / 个人中心 / 税务助手的渲染测量点与优化手段） | 2026-08-10 |
| [reports/test-report.md](reports/test-report.md) | 测试报告（单元测试 203/203 全通过） | 2026-09-07 |

### 市场推广

| 文档 | 用途 | 更新日期 |
|------|------|---------|
| [marketing/cold-start-materials.md](marketing/cold-start-materials.md) | 首批测试用户冷启动素材（文案/渠道/注册指引/反馈观察） | 2026-09-14 |
| [marketing/business-plan-for-partners.md](marketing/business-plan-for-partners.md) | **合伙人版商业企划**（商业定位 / 目标客户分层 / 三层盈利模式 / 三驾马车获客 / 路线图 / 财务假设与敏感性 / 待拍板事项） | 2026-09-14 |
| [marketing/gtm-execution-plan.md](marketing/gtm-execution-plan.md) | **商业模式落地执行手册**（Go/No-Go 检查表 · 第 0 周逐日点火 · 90 天周节奏 · 指标看板 · 线索跟进 SOP · 待办登记 · 单位经济学实测口径） | 2026-09-14 |
| [marketing/wecom-channel-playbook.md](marketing/wecom-channel-playbook.md) | **企业微信按入口分码操作手册**（一入口一码 / 欢迎语 / 打标签 / 验证清单；含「客服链接不可手工拼参数」的官方依据） | 2026-09-16 |
| [marketing/business-plan-for-partners.docx](marketing/business-plan-for-partners.docx) | 企划书 **Word 发送版**（导出件 · 非真源，由 `tools/ops/ops-md2docx.py` 从同名 .md 导出） | 2026-09-14 |
| [marketing/gtm-execution-plan.docx](marketing/gtm-execution-plan.docx) | 执行手册 **Word 发送版**（导出件 · 非真源，导出方式同上） | 2026-09-14 |

### 技术报告

| 文档 | 用途 | 更新日期 |
|------|------|---------|
| [tech-reports/watchdog-deployment-guide.md](tech-reports/watchdog-deployment-guide.md) | Watchdog 监控与邮件通知系统部署指南 v1.3（本地运维） | 2026-09-07 |
| [tech-reports/lighthouse-deployment-guide.md](tech-reports/lighthouse-deployment-guide.md) | 腾讯云轻量服务器部署与迁移手册（Zeabur → 上海轻量；迁移包 `deploy/lighthouse/`，含数据迁移/证书/切换日流程/回滚/核对清单） | 2026-09-16 |
| [tech-reports/watchdog-notification-and-event-log-spec.md](tech-reports/watchdog-notification-and-event-log-spec.md) | 守护脚本邮件通知与事件日志规范 v4.0（通知/日志唯一真源；§8 含 URL 邮件密集发送排查会话，OPEN） | 2026-09-07 |
| [tech-reports/troubleshooting-sop-template.md](tech-reports/troubleshooting-sop-template.md) | 故障排查 SOP 标准模板 v1.0（复用模板） | 2026-08-10 |
| [tech-reports/health-check-report-template.md](tech-reports/health-check-report-template.md) | 部署后健康检查报告模板 v1.0（含一键检查脚本） | 2026-08-10 |
| [tech-reports/mock-client-concurrent-logging-retrospective.md](tech-reports/mock-client-concurrent-logging-retrospective.md) | MockClient 并发日志乱序问题技术复盘 | 2026-08-05 |

---

## 快速导航

### 项目概览与启动

1. 阅读 [项目根 README](../README.md) 了解架构与快速启动
2. 参考 [开发计划](development/development-plan.md) 了解阶段进度
3. 按 [API 接口文档](api/api-reference.md) 对接前后端
4. 版本变更见 [CHANGELOG.md](../CHANGELOG.md)

### 日常开发

- **UI 设计（先读这里）**：[UI 设计方案 · 确定性版本](guides/ui-design-spec.md)（导航/层级/逐页排版/开发注意事项）
  - **站点全貌（想知道有多少页面 / 用户怎么走 / 入口在哪，看这份）**：[站点结构图](guides/site-structure-map.md) —— 画面清单 + 双端 UI 结构图 + IA 内容图 + 三条主流程 + 逐页入口去向
- 计税逻辑：[计税规则手册](guides/tax-calculation-rules.md)
- 前端复用：[UI 组件复用指南](guides/ui-component-reuse-guide.md)
- 响应式适配：[响应式规则维护手册](guides/responsive-rules-reference.md)
- GUI 按钮：[GUI 按钮速查](guides/gui-button-reference.md)
- 全流程：[开发工作流总览](guides/development-workflow.md)（启动/验证/发布/回滚/排障）
- 分支/版本/回滚：[分支与版本发布策略](guides/branch-release-strategy.md)
- 接口联调：[API 接口文档](api/api-reference.md)

### 部署

- **生产（Zeabur）**：推送 main 分支自动构建 `Dockerfile` → Prisma migrate deploy → 启动服务；详见 [开发计划 阶段 5/6/7](development/development-plan.md) 与 [部署健康检查模板](tech-reports/health-check-report-template.md)。**迁移中（阶段16）**：ICP 备案通过后切至腾讯云轻量（上海），执行包与手册见 [lighthouse-deployment-guide.md](tech-reports/lighthouse-deployment-guide.md)
- **本地开发**：`npm run dev`（SQLite + 内网穿透 + watchdog，详见 [运维脚本目录](../tools/ops/README.md)）

### 故障排查

| 场景 | 参考文档 |
|------|---------|
| 邮件发送失败 | [部署指南 8.1](tech-reports/watchdog-deployment-guide.md#八故障排查) |
| SMTP 端口被防火墙拦截 | [部署指南 8.6](tech-reports/watchdog-deployment-guide.md#86-smtp-端口被防火墙拦截) |
| watchdog 未检测到异常 | [部署指南 8.2](tech-reports/watchdog-deployment-guide.md#八故障排查) |
| 公网 URL 未检测到变更 | [部署指南 8.3](tech-reports/watchdog-deployment-guide.md#八故障排查) |
| 后端服务频繁重启 | [部署指南 8.4](tech-reports/watchdog-deployment-guide.md#八故障排查) |
| cpolar 隧道频繁断连 | [部署指南 8.5](tech-reports/watchdog-deployment-guide.md#八故障排查) |
| 通用故障排查流程 | [SOP 模板](tech-reports/troubleshooting-sop-template.md) |

### 监控运维（本地开发环境）

| 任务 | 参考文档 |
|------|---------|
| 启动 watchdog | [部署指南 第五章](tech-reports/watchdog-deployment-guide.md#五启动方式) |
| 查看日志 | [部署指南 6.1](tech-reports/watchdog-deployment-guide.md#六日志系统) |
| 修改邮件模板 | [部署指南 9.2](tech-reports/watchdog-deployment-guide.md#九维护操作) |
| 添加收件人 | [部署指南 9.3](tech-reports/watchdog-deployment-guide.md#九维护操作) |
| 通知与日志规范 | [通知与事件日志规范](tech-reports/watchdog-notification-and-event-log-spec.md) |

---

## 故障排查档案

> 每次完成故障排查后，在此表格登记一行，并在 `tech-reports/` 下归档完整 SOP 文档。

| 日期 | 故障名称 | 等级 | 状态 | 归档文档 |
|------|---------|------|------|---------|
| 2026-08-15 | 公网 URL_CREATED/URL_CHANGED 邮件密集发送 | 中 | 会话记录 OPEN（并入规范 §8） | [通知与事件日志规范 §8](tech-reports/watchdog-notification-and-event-log-spec.md#八已知问题与排查记录) |

> 归档文档命名规范：`troubleshooting-<故障简称>-<YYYYMMDD>.md`，基于 [SOP 模板](tech-reports/troubleshooting-sop-template.md) 填写。

---

## 文档维护规范

### 新增文档

1. 确定文档类型，放入对应子目录：
   - 接口规范 → `api/`
   - 开发计划 → `development/`
   - 使用指南 → `guides/`
   - 市场推广 → `marketing/`
   - 项目报告 → `reports/`
   - 技术规范/复盘/部署 → `tech-reports/`
2. 在本文件的"文档清单"对应分类下添加一行
3. 如涉及故障排查，同步更新"故障排查档案"表格

### 文档命名规范

- 使用小写字母 + 连字符（kebab-case）
- 技术报告以模块名开头：`watchdog-xxx.md`、`troubleshooting-xxx.md`
- 版本号写在文档头部，不在文件名中体现

### 文档版本管理

- 每次修改更新文档头部的"最后更新"日期
- 重大修改提升版本号（v1.0 → v1.1）
- 保留变更说明在文档末尾或 CHANGELOG.md 中

---

## 相关资源

- [项目根 README](../README.md) — 项目简介与快速启动
- [GUI 开发控制台说明](../tools/gui/README.md) — GUI 工具使用说明（含覆盖式滚动条 v3.2 技术细节）
- [运维脚本目录](../tools/ops/README.md) — watchdog/notify/start-dev 脚本说明
- [CHANGELOG.md](../CHANGELOG.md) — 版本变更记录
- [项目 .trae/rules](../.trae/rules/) — 工程规范（Git 提交信息等）
