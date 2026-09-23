# EuriskoTax 文档中心

> 最后更新：**2026-09-20**（v1.80.0）
> 维护原则：按用途分类存放，本文件为统一入口索引
> 2026-09-20 清理：删除散落产物与零引用文件（根目录 `server-dev.log`、空目录 `backup/`、`coverage/`、`.playwright-cli/` 87 张临时截图、`tools/dup_reg_alert.png`）与从未使用过的 `tech-reports/health-check-report-template.md`（上线自检以 `ops-check-prod.ps1` 的 37 项指纹为准）；`clean-browser-cache.bat` 归位 `tools/ops/`；`logs/README.md` 恢复入库（`.gitignore` 写 `logs/` 会让 `!` 例外失效的坑见 [file-management-policy.md §6](development/file-management-policy.md)）
> 2026-09-20 更新：「当前状态」重写为 v1.80.0 事实（原为 v1.17.0 过期快照）；层级总图补阶段17/18/19；新增「文档新鲜度分级」（🟢活 / 🟡历史快照 / 🔵过程稿）；文档清单刷新更新日期并逐份标注状态；新增「新增文档该放哪 / 该改哪」的硬规则
> 2026-09-18 新增：**「文档层级总图」章节**（下面的表格是平的，只回答「有哪些」；新增这一节回答「什么关系、我要做的事该读哪一份」）；登记 `docs/guides/site-structure-map.md`（全站现状测绘）
> 2026-09-14 新增：`docs/marketing/business-plan-for-partners.md`（合伙人版商业企划）与 `docs/marketing/gtm-execution-plan.md`（90 天落地执行手册）
> 2026-09-17 新增：**`docs/guides/ui-design-spec.md`（UI 设计方案 · 确定性版本 · 开发唯一执行依据）**；登记此前漏收的 `ui-ux-master-plan.md`（论证过程稿）与 `dual-end-ui-plan.md`（Phase 0 实施记录）

---

## 当前状态（v1.80.0 · 2026-09-20）

> 版本号以 [`CHANGELOG.md`](../CHANGELOG.md) 为准；本节在每个阶段收口时更新一次。
> 2026-09-20 重写：上一版是「v1.17.0 快照 + ⚠️ 滞后」的写法，与事实差 60 多个版本 ——
> **快照式写法本身就是问题**（读了还要自己判断过期没有），现改为「当前事实 + 逐阶段状态」，不再保留过期快照。

- **当前版本**：**v1.80.0**（2026-09-20，阶段19-3：全站阴影收口到 `--sh-*` 令牌 + 焦点环统一）。**开发分支 `feature/stage15-17-wip`** —— v1.18.0 起的所有版本都在这条分支上，**尚未合回 main**；main 与公网线上停在 **v1.17.0**（合回路径见 [branch-release-strategy.md](guides/branch-release-strategy.md)）
- **生产环境**：Zeabur（Tencent Tokyo）+ PostgreSQL + HTTPS，`https://euriskotax.zeabur.app`；ICP 备案通过后迁腾讯云轻量（上海），执行包与手册见 [lighthouse-deployment-guide.md](tech-reports/lighthouse-deployment-guide.md)
- **测试**：111 套件 2078 个单元测试全部通过（`npm test`）；发布门禁 `verify:local` **259/259** 全绿；线上指纹 **37 项**（`tools/ops/ops-check-prod.ps1`）；动过 schema/迁移另跑 `verify:pg`
- **阶段进度**（逐阶段明细与交付版本见 [development-plan.md](development/development-plan.md) 的阶段状态表）：
  - ✅ **阶段 1–15 已全部关闭**：后端化 / PWA / 免费·专业版 / 内容中心 / 获客与转化 / 变现与可信度 / 多税种扩展（20 个 SEO 落地页）
  - ⏳ **阶段16 迁移与合规** —— 阻塞于 ICP 备案（域名 `euriskotax.com` 已购、企业主体备案已提交排队中）
  - ✅ **阶段17 全税种完整测算（核心卖点）已收官**：21 个 spec 驱动完整测算 + 20 个速算器，税种覆盖 **6/6 类**、个税场景完整度 **16/16**
  - 🟡 **阶段18 配套链路收口** 大部分完成：18-1 ~ 18-6a 已交付；**剩两项待定** —— ① 18-6 按用户反馈补具体税种场景（待用户输入）；② 留资引导投放白名单是否从 4 类扩到更多 deep（待拍板）
  - 🚧 **阶段19 UI 重构与留存设计** 进行中：19-0（样式沙箱层 + 截图基线 12 张）/ 19-1a（设计令牌迁回真源）/ 19-2（Tailwind 产物纯重建）/ 19-3（全站阴影收口）已交付
- **商业与冷启动**：转化链路 + 线索管理 + 兑换码收款 + 20 个 SEO 落地页均已就绪，**尚未开始推广（0 用户 / 0 收入）**；三个点火动作已完成（域名 ✅ / ICP 备案 ✅ 已提交 / 企业微信活码 ✅ 2026-09-16 已配置），**P0 仅剩「顾问值班人与响应时限」**。战略与财务测算见 [business-plan-for-partners.md](marketing/business-plan-for-partners.md)，执行清单见 [gtm-execution-plan.md](marketing/gtm-execution-plan.md)

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
│   ├── ops/                           # 运维脚本（ops-start-dev / ops-watchdog / ops-notify + 通知配置 + ui-screenshot-baseline.js 视觉回归基线 + screenshots/ 基线图）
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
├── seo/                               # 21 个 SEO 落地页 + 共用 landing.css
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
├── development/development-plan.md      总进度与里程碑（**阶段状态表已含 17 / 18 / 19**）
├── development/stage19-ui-redesign-plan.md         UI 重构与留存设计（功能全景 / 竞品对标 / 五断点诊断 / 11 类 persona 旅程 / 双轴导航首页 / 效率层 / 19-0~19-11 落地路线），**🚧 进行中：19-0 ~ 19-3 已交付**
├── development/stage17-full-tax-coverage-plan.md   核心卖点（全税种完整测算）**✅ 已收官**：21 个 spec 驱动完整测算 / 6 类税种 / 个税场景 16/16
├── development/stage16-migration-and-compliance-plan.md   ⏳ 迁移合规，阻塞于 ICP 备案
├── development/stage18-spec-driven-followup.md   🟡 大部分完成：21 个完整测算里 17 个被漏掉的**静默失败**收口，**剩两项待定**（见该文 §3）
└── development/stage10 / 12 / 13 / 15-* + seo-landing-plan   已关闭阶段的实施记录（只回查；阶段14 无独立方案文件）

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
| 想知道当前做到哪一步 | 本文「当前状态」+ `development/development-plan.md` 的阶段状态表 |
| 开工阶段19（UI 重构 / 动 CSS） | `development/stage19-ui-redesign-plan.md`（动 CSS 前先读它的施工约束） |
| 回查全税种完整测算怎么落地的 | `development/stage17-full-tax-coverage-plan.md`（✅ 已收官） |
| 新增 / 移动 / 删除文档或脚本 | `development/file-management-policy.md`（目录归属 / 命名 / 编码 / 变更清单） |
| 追问「当时为什么这么定」 | `guides/ui-ux-master-plan.md`（🔵 过程稿；结论以第 1 层为准） |

### 文档新鲜度分级（2026-09-20 加）

文档越攒越多，「哪份还能信」必须一眼看出。下面清单里每份文档带一个状态标记：

| 标记 | 含义 | 怎么用 |
|---|---|---|
| 🟢 活文档 | 随代码同步更新，是当前的唯一真源 | 照它做 |
| 🔵 过程稿 | 论证 / 实施记录，结论已并入第 1 层 | 只在追问「为什么这么定」时读 |
| 🟡 历史快照 | 某个时点的交付 / 测试 / 性能记录，数字已过期 | 只回查，**不要拿它的数字当现状** |

现状数字（版本号 / 套件数 / 门禁项数 / 税种覆盖度）一律以 `CHANGELOG.md` 与本文「当前状态」为准。
`docs/reports/` 四份报告与已关闭阶段的方案文件均属 🟡 —— 里面写的用例数、性能指标、交付清单都是当时快照，不是现状。

### 三条硬规则

1. **新增文档必须登记进本文件** —— 由 `tests/docs-metrics.test.js`（2026-09-17 加）断言守护，不登记会红。
2. **第 1 层是唯一决策源** —— 第 1 层的子文档与第 4 层的过程稿都不得反向推翻它；冲突时以 `ui-design-spec.md` 为准。
3. **每份文档要能被判断新鲜度** —— 新增文档时在下面清单标注 🟢 / 🔵 / 🟡；阶段收口时把该阶段方案从 🟢 改标 🟡，并同步一次本文「当前状态」的阶段进度（进度更新是**唯一真源**在此，别在各阶段方案里各写一份）。

---

## 文档清单

### API 接口

| 文档 | 用途 | 更新日期 |
|------|------|---------|
| [api/api-reference.md](api/api-reference.md) | 🟢 后端 REST API 接口规范 v2.8（认证含邮箱验证码/邀请码、计税、历史记录、反馈、内容中心、税制参数、城市社保参数、转化线索、专业版兑换码、管理员、运营统计） | 2026-09-18 |

### 开发规划

| 文档 | 用途 | 更新日期 |
|------|------|---------|
| [development/development-plan.md](development/development-plan.md) | 🟢 项目开发计划、里程碑、技术选型、阶段状态表 | 2026-09-20 |
| [development/file-management-policy.md](development/file-management-policy.md) | 🟢 文件管理规范（目录归属/命名/编码/变更流程） | 2026-09-18 |
| [development/stage10-free-pro-plan.md](development/stage10-free-pro-plan.md) | 🟡 阶段10 免费/专业版实施方案（**已上线** v1.7.0：计税能力永不锁定，登录仅解锁云端历史同步；只作回查） | 2026-09-18 |
| [development/stage12-core-enhancement-plan.md](development/stage12-core-enhancement-plan.md) | 🟡 阶段12 核心功能补强实施方案（A5/A3/A1/A2/A4 **全部已完成**：税法常量抽离与版本化、月度明细增强等；只动前端与常量，不碰后端） | 2026-09-14 |
| [development/stage12-c1-tax-rate-config-plan.md](development/stage12-c1-tax-rate-config-plan.md) | 🟡 阶段12 C1 税制参数配置化方案与实施记录 | 2026-09-14 |
| [development/stage13-acquisition-and-leads-plan.md](development/stage13-acquisition-and-leads-plan.md) | 🟡 阶段13 获客与转化（引流 → 线索）方案（13A 后端地基 ✅ / 13B 前端触点 ✅ / 13C 管理台「线索」Tab ✅ / 13D 一键结果分享图 ✅ / 13E 漏斗埋点 ✅，阶段13 已全部交付） | 2026-09-18 |
| [development/seo-landing-plan.md](development/seo-landing-plan.md) | 🟡 高商业意图 SEO 落地页方案（阶段14 剩余项：设计原则 / 关键词→页面映射 / 守护断言；已交付三页「年终奖个税」✅ v1.14.0、「月薪个税」✅ v1.15.0、「汇算清缴」✅ v1.16.0，其余词条并入阶段15） | 2026-09-18 |
| [development/stage15-multi-tax-plan.md](development/stage15-multi-tax-plan.md) | 🟡 阶段15 税务计算能力扩展（多税种）方案（15A 个税纵深 / 15B 企业税种 / 15C 社保薪酬 / 15D 架构与守护；含竞品对标与取舍） | 2026-09-18 |
| [development/stage16-migration-and-compliance-plan.md](development/stage16-migration-and-compliance-plan.md) | 🟢 阶段16 迁移与合规升级方案（16A 迁腾讯云国内节点 / 16B 官方支付 / 16C 微信小程序 / 16D B 端 API；含 ICP 备案 checklist） | 2026-09-14 |
| [development/stage17-full-tax-coverage-plan.md](development/stage17-full-tax-coverage-plan.md) | 🟡 **阶段17 全税种完整测算方案（核心卖点兑现）** —— UI 排版前置 → 17A spec 扩展 / 17B 反向迁移已有 4 个 deep / **17D 个税纵深补齐（P0）** / 17C 铺齐 5 类税种；目标覆盖 6/6 类 + 个税场景完整度 10/16（现状 6/6、**16/16 收官**） | 2026-09-19 |
| [development/stage18-spec-driven-followup.md](development/stage18-spec-driven-followup.md) | 🟢 **阶段18 spec 驱动配套链路收口**（修的是「21 个完整测算里只有 4 个被照顾到、其余 17 个静默失败」）：18-1 加载顺序装配守护 / 18-2 历史查看按注册表统一分发 / 18-3+18-5 分享图取数与入口（改事件委托）/ 18-4 留资情境兜底 / 18-6a 真机补跑；**剩两项待定**（18-6 补场景待用户输入、留资引导白名单待拍板） | 2026-09-20 |
| [development/stage19-ui-redesign-plan.md](development/stage19-ui-redesign-plan.md) | 🟢 **阶段19 UI 重构与留存设计方案** —— 现有核心功能全景（L0–L5 分层）/ 竞品对标（TurboTax·NerdWallet·国内工具站）/ 五个留存断点诊断 / **11 类 persona 完整使用旅程（§2.5，含常态×事件双轴模型）** / **首页双轴导航（事件卡组 × 身份卡组，§3.3）** / 工具页降载 · 结果页双栏与省钱卡 · 我的页权益可视化 / **效率层（§3.10：主体 E1→模板 E2→台账 E3→快捷 E5→批量 E4）** / 设计令牌增补（只增不改）/ 19-0~19-11 落地路线与门禁 | 2026-09-19 |
| [guides/deep-wizard-ui-spec.md](guides/deep-wizard-ui-spec.md) | 🟢 **通用多步测算向导 UI 排版规范**（阶段17 的开工前置）—— 结果页「区域词典」（15 区块 / 5 必选 / 顺序固定）、统一栅格三档、明细表三型、入口层 5 处必修、响应式与暗色约定、10 条新增守护断言、现有 4 页迁移清单 | 2026-09-19 |
| [guides/site-structure-map.md](guides/site-structure-map.md) | 🟢 **站点结构图（现状测绘 as-is）**：画面清单（14 个 App 视图 / 12 个页内步骤 / 21 个 SEO 落地页 / 20 个浮层）、UI 结构图（双端）、内容结构图（IA）、三条用户主流程、逐页结构图 + 功能入口去向表（全部附代码行号） | 2026-09-19 |

### 使用与开发指南

| 文档 | 用途 | 更新日期 |
|------|------|---------|
| [guides/ui-design-spec.md](guides/ui-design-spec.md) | 🟢 **UI 设计方案（确定性版本 · 开发唯一执行依据）**：商业模式/目标群体/核心功能 · 导航架构 · 层级架构 · 24 页逐页内容与排版 · 结果页八段模板 · 后期开发注意事项与准入清单 | 2026-09-19 |
| [guides/ui-ux-master-plan.md](guides/ui-ux-master-plan.md) | 🔵 UI/UX 上位方案 **论证过程稿**（90KB，含取舍修订记录；**结论已收敛到 `ui-design-spec.md`**，日常开发不必读） | 2026-09-18 |
| [guides/dual-end-ui-plan.md](guides/dual-end-ui-plan.md) | 🔵 **Phase 0 实施记录**（设计令牌/z 层级/断点/屏幕预算/容器加宽/助手推开/打印，S0–S8 ✅ 全完成） | 2026-09-18 |
| [guides/tax-calculation-rules.md](guides/tax-calculation-rules.md) | 🟢 计税规则手册（综合所得/经营所得/反向倒算等） | 2026-09-19 |
| [guides/ui-component-reuse-guide.md](guides/ui-component-reuse-guide.md) | 🟢 前端 UI 组件复用指南（Sticky 导航/卡片渲染/事件委托等） | 2026-09-14 |
| [guides/responsive-rules-reference.md](guides/responsive-rules-reference.md) | 🟢 响应式规则维护手册（规则+性能数据+验证方法） | 2026-09-19 |
| [guides/development-workflow.md](guides/development-workflow.md) | 🟢 开发工作流总览（启动/验证/发布/回滚/排障，按钮命名权威定义） | 2026-09-19 |
| [guides/branch-release-strategy.md](guides/branch-release-strategy.md) | 🟢 分支与版本发布策略（主干模型/命名/版本号五处同步/自动打 tag/回滚） | 2026-09-14 |
| [guides/gui-button-reference.md](guides/gui-button-reference.md) | 🟢 GUI 开发控制台按钮速查（110 按钮基线 + 邀请码管理增量） | 2026-09-14 |
| [guides/coding-rules-reference.md](guides/coding-rules-reference.md) | 🟢 **编码约定速查**：作用域（不用 IIFE）/ 加载顺序 / 不静默吞错 / 接线契约测试 / 重构「零功能变化」怎么证明 / 命名允许名单 —— **每条均标注出处** | 2026-09-18 |
| [guides/support-playbook.md](guides/support-playbook.md) | 🟢 客服排障手册（发布后用户问题的处理路径与话术，配套管理台「排障」Tab） | 2026-09-19 |

### 项目报告

| 文档 | 用途 | 更新日期 |
|------|------|---------|
| [reports/final-delivery-checklist.md](reports/final-delivery-checklist.md) | 🟡 最终交付清单（交付物总览/质量验收） | 2026-09-14 |
| [reports/refactor-summary-report.md](reports/refactor-summary-report.md) | 🟡 重构成果汇总报告（三批次+Phase 4） | 2026-09-14 |
| [reports/performance-optimization-report.md](reports/performance-optimization-report.md) | 🟡 前端渲染性能优化报告（主页 / 个人中心 / 税务助手的渲染测量点与优化手段） | 2026-09-14 |
| [reports/test-report.md](reports/test-report.md) | 🟡 测试报告（**历史快照**：里面记的是当时的用例数，已不是现状） | 2026-09-14 |

### 市场推广

| 文档 | 用途 | 更新日期 |
|------|------|---------|
| [marketing/cold-start-materials.md](marketing/cold-start-materials.md) | 🟢 首批测试用户冷启动素材（文案/渠道/注册指引/反馈观察） | 2026-09-18 |
| [marketing/business-plan-for-partners.md](marketing/business-plan-for-partners.md) | 🟢 **合伙人版商业企划**（商业定位 / 目标客户分层 / 三层盈利模式 / 三驾马车获客 / 路线图 / 财务假设与敏感性 / 待拍板事项） | 2026-09-18 |
| [marketing/gtm-execution-plan.md](marketing/gtm-execution-plan.md) | 🟢 **商业模式落地执行手册**（Go/No-Go 检查表 · 第 0 周逐日点火 · 90 天周节奏 · 指标看板 · 线索跟进 SOP · 待办登记 · 单位经济学实测口径） | 2026-09-18 |
| [marketing/wecom-channel-playbook.md](marketing/wecom-channel-playbook.md) | 🟢 **企业微信按入口分码操作手册**（一入口一码 / 欢迎语 / 打标签 / 验证清单；含「客服链接不可手工拼参数」的官方依据） | 2026-09-18 |
| [marketing/business-plan-for-partners.docx](marketing/business-plan-for-partners.docx) | 企划书 **Word 发送版**（导出件 · 非真源，由 `tools/ops/ops-md2docx.py` 从同名 .md 导出） | 2026-09-14 |
| [marketing/gtm-execution-plan.docx](marketing/gtm-execution-plan.docx) | 执行手册 **Word 发送版**（导出件 · 非真源，导出方式同上） | 2026-09-14 |

### 技术报告

| 文档 | 用途 | 更新日期 |
|------|------|---------|
| [tech-reports/watchdog-deployment-guide.md](tech-reports/watchdog-deployment-guide.md) | 🟢 Watchdog 监控与邮件通知系统部署指南 v1.3（本地运维） | 2026-09-14 |
| [tech-reports/lighthouse-deployment-guide.md](tech-reports/lighthouse-deployment-guide.md) | 🟢 腾讯云轻量服务器部署与迁移手册（Zeabur → 上海轻量；迁移包 `deploy/lighthouse/`，含数据迁移/证书/切换日流程/回滚/核对清单） | 2026-09-18 |
| [tech-reports/watchdog-notification-and-event-log-spec.md](tech-reports/watchdog-notification-and-event-log-spec.md) | 🟢 守护脚本邮件通知与事件日志规范 v4.0（通知/日志唯一真源；§8 含 URL 邮件密集发送排查会话，OPEN） | 2026-09-14 |
| [tech-reports/troubleshooting-sop-template.md](tech-reports/troubleshooting-sop-template.md) | 🟢 故障排查 SOP 标准模板 v1.0（复用模板） | 2026-09-14 |
| [tech-reports/mock-client-concurrent-logging-retrospective.md](tech-reports/mock-client-concurrent-logging-retrospective.md) | 🟡 MockClient 并发日志乱序问题技术复盘 | 2026-09-14 |

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

- **生产（Zeabur）**：推送 main 分支自动构建 `Dockerfile` → Prisma migrate deploy → 启动服务；详见 [开发计划 阶段 5/6/7](development/development-plan.md)；上线后自检跑 `tools/ops/ops-check-prod.ps1`（**37 项线上指纹**）。**迁移中（阶段16）**：ICP 备案通过后切至腾讯云轻量（上海），执行包与手册见 [lighthouse-deployment-guide.md](tech-reports/lighthouse-deployment-guide.md)
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
2. 在本文件的"文档清单"对应分类下添加一行，**用途列开头带新鲜度标记**（🟢 活文档 / 🔵 过程稿 / 🟡 历史快照）
3. 如涉及故障排查，同步更新"故障排查档案"表格
4. 若属 🔵 / 🟡，还要在该文档**头部**加一行同名标记块指回唯一真源（见「文档新鲜度分级」）

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
