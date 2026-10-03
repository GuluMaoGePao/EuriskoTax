
# EuriskoTax - 个人所得税计算系统后端化开发方案

## 📋 项目概述

**EuriskoTax** 是一个专注于个人所得税预算规划的专业工具品牌。当前项目是一个纯前端的个人所得税计算工具，为了支持用户登录管理、数据持久化和未来推广，需要进行后端化改造。

### 品牌说明

- **品牌名称**：EuriskoTax
- **产品定位**：个人所得税预算规划工具
- **核心价值**：帮助用户科学规划税务，合理优化税负
- **目标用户**：个人用户（薪酬规划）、企业HR（成本预算）

### 技术栈选择

| 分类 | 技术 | 版本 | 选择理由 |
|------|------|------|---------|
| 后端框架 | Node.js + Express | 20.x / 4.x | 轻量快速，与前端JS无缝衔接，学习成本低 |
| 数据库 | SQLite（开发）/ PostgreSQL（生产） | 15+ | 开发期零配置；生产环境承载并发写入与云托管（2026-09-05 已迁移） |
| ORM | Prisma | 5.x | 现代化ORM，类型安全，支持自动迁移 |
| 认证 | JWT + bcrypt | - | 无状态认证，安全可靠，易于实现 |
| API文档 | Swagger UI | 4.x | 便于前后端协作和API测试 |
| 前端 | 保持现状 | - | 现有HTML+JS；计税引擎保留在前端本地运行（离线可用，见商业模式章节） |

---

## 🎯 分阶段开发计划

### 阶段1：后端基础架构搭建（预计1周）✅ **已完成**

**目标**：搭建后端开发环境，配置数据库连接

**任务清单**：
- [x] 初始化Node.js项目
- [x] 安装依赖（express, prisma, jsonwebtoken, bcrypt等）
- [x] 配置Prisma ORM
- [x] 设计数据库表结构
- [x] 创建基础中间件（日志、错误处理、CORS）
- [x] 配置环境变量

**输出文件**：
- `server/package.json` - 项目依赖配置
- `server/prisma/schema.prisma` - 数据库模型定义
- `server/.env` - 环境变量配置
- `server/src/middleware/` - 中间件目录（logger.js, error.js）

---

### 阶段2：用户认证系统开发（预计1周）✅ **已完成**

**目标**：实现完整的用户注册、登录、认证功能

**任务清单**：
- [x] 创建用户表（users）模型
- [x] 实现用户注册接口
- [x] 实现用户登录接口（账号密码 + JWT）
- [x] 添加JWT认证中间件
- [x] 实现用户信息查询和修改接口
- [x] 实现用户删除接口

**输出文件**：
- `server/src/routes/auth.js` - 认证路由
- `server/src/controllers/authController.js` - 认证控制器
- `server/src/services/authService.js` - 认证服务
- `server/src/middleware/auth.js` - JWT验证中间件

---

### 阶段3：计算逻辑迁移（预计1.5周）✅ **已完成**

**目标**：将前端计算逻辑迁移到服务端，提供计算API

**任务清单**：
- [x] 创建计算记录表（calculations）模型
- [x] 将tax-calculator.js逻辑迁移到服务端
- [x] 实现综合所得计算API
- [x] 实现经营所得计算API
- [x] 实现分类所得计算API
- [x] 实现反向倒算API
- [x] 实现计算历史记录接口

**输出文件**：
- `server/src/routes/calculations.js` - 计算路由
- `server/src/controllers/calculationController.js` - 计算控制器
- `server/src/services/taxCalculator.js` - 个税计算服务

---

### 阶段4：前端改造与集成（预计1周）✅ **已完成**

**目标**：修改前端代码，对接后端API

**任务清单**：
- [x] 添加登录/注册页面（src/js/auth/auth-ui.js + index.html 登录/注册模态框）
- [x] 添加用户信息展示区域（个人中心仪表盘，含账户设置/税务档案/数据管理/税务日历）
- [x] ~~将前端计算调用改为API请求（src/js/api/api-client.js → /api/calculations/*）~~ **（2026-09-12 订正：该路线已废弃）** 计算主链路实际保持**前端本地执行**（`src/js/calculation/tax-calculator.js`）；`api-client.js` 中对应 4 个计算封装无任何调用方，服务端 `/api/calculations/*` 仅 `/sync` 在用。遗留服务端引擎与前端引擎的漂移风险见 [stage12-core-enhancement-plan.md](./stage12-core-enhancement-plan.md) §1.1
- [x] 集成JWT token管理（getAuthToken/setAuthToken/removeAuthToken + Bearer 头注入）
- [x] 实现登录状态持久化（localStorage.auth_token + localStorage.current_user）
- [x] 对接历史记录API（src/js/auth/auth-ui.js loadHistoryToList + GET /api/calculations/history）

**修改文件**：
- `index.html` - 添加登录注册UI
- `js/app.js` - 添加API调用逻辑
- `js/data-management.js` - 修改数据存储逻辑

---

### 阶段5：部署与上线准备（预计1周）✅ **已完成（方案调整）**

**目标**：配置服务器环境，准备上线部署

> **方案调整说明（2026-09-05）**：原 PM2 + Nginx + Let's Encrypt 的自建运维路线已被 **Zeabur 托管部署**替代（ZeaburOS 自动提供进程管理、反向代理与 HTTPS 证书），无需自行配置。

**任务清单**：
- [x] 配置生产环境变量（早期 zeabur.json `${VAR}` 引用，后统一为 Zeabur 面板环境变量 + Dockerfile 部署）
- [x] 添加Swagger API文档（/api/docs + /api/docs.json）
- [x] 生产数据库迁移 PostgreSQL（迁移文件 `20260905_init_postgres` 已生成）
- ~~安装PM2进程管理器~~ → 由 ZeaburOS 托管替代
- ~~配置Nginx反向代理~~ → 由 Zeabur 平台替代
- ~~配置HTTPS（Let's Encrypt）~~ → 由 Zeabur 自动提供
- ~~编写部署脚本~~ → 由 Git 推送自动部署替代

**输出文件**：
- `Dockerfile` - Zeabur 生产部署入口（构建阶段安装 OpenSSL 保证 Prisma 引擎可用；运行阶段 `CMD` 先执行 `prisma migrate deploy` 再 `node src/app.js`）
- ~~`zeabur.json`~~ - 早期产物，仓库中已移除；Zeabur 直接识别根目录 `Dockerfile` 构建部署
- `server/src/app.js` - 新增生产环境校验（JWT_SECRET/DATABASE_URL）与 express-rate-limit

---

## 🗂️ 项目结构设计

```
EuriskoTax/
├── index.html                    # 主页面（前端）
├── README.md                     # 项目说明
├── docs/                         # 文档目录
│   ├── development/              # 开发相关文档
│   │   └── development-plan.md # 开发计划文档
│   ├── guides/                   # 使用指南和规则文档
│   │   └── tax-calculation-rules.md # 计税规则手册
│   └── api/                      # API文档
│       └── api-reference.md   # API参考文档
├── src/                          # 前端源代码
│   └── js/                       # 前端JavaScript
│       ├── app.js                # 应用主逻辑
│       ├── api/                  # API客户端
│       │   └── api-client.js
│       ├── auth/                 # 认证相关
│       │   └── auth-ui.js
│       ├── calculation/          # 计算相关
│       │   ├── tax-calculator.js # 税务计算核心
│       │   ├── helper-functions.js
│       │   └── utils.js
│       ├── data/                 # 数据管理
│       │   └── data-management.js
│       ├── export/               # 导出功能
│       │   └── export-utils.js
│       └── ui/                   # UI组件
│           └── navigation-ui.js
└── server/                       # 后端服务
    ├── package.json              # 后端依赖
    ├── .env                      # 环境变量
    ├── prisma/
    │   └── schema.prisma         # 数据库模型
    └── src/
        ├── app.js                # Express应用入口
        ├── middleware/           # 中间件
        │   ├── auth.js           # JWT认证
        │   ├── error.js          # 错误处理
        │   └── logger.js         # 日志记录
        ├── routes/               # 路由
        │   ├── auth.js           # 认证路由
        │   └── calculations.js   # 计算路由
        ├── controllers/          # 控制器
        │   ├── authController.js
        │   └── calculationController.js
        └── services/             # 服务层
            ├── authService.js
            └── taxCalculator.js
```

---

## 🔄 数据库表设计（当前生产 schema · Prisma / PostgreSQL）

> 📌 **真源在代码**：`server/prisma/schema.prisma`（生产 PostgreSQL）/ `schema.dev.prisma`（本地 SQLite 开发用）。
> 本节是**立项时的设计快照**，改表结构请改 schema 并走迁移（`server/prisma/migrations/`），不要在本文改。

> 完整模型与迁移见 [server/prisma/schema.prisma](../../server/prisma/schema.prisma)；本地开发使用同构的 `schema.dev.prisma`（SQLite）。当前共 **8 张表**（阶段8 新增 feedbacks / calc_events，迁移 `20260907_add_feedback_and_calcevent`；阶段10A 为 users 增 plan 分层与 calculations 增同步字段，迁移 `20260908_add_plan_tier_and_calc_sync`；阶段10A-补 为 feedbacks 增 attachments，迁移 `20260909_add_feedback_attachments`；阶段11 新增 content_items / content_releases，迁移 `20260911_add_content_center`）：

### users（用户）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT PK 自增 | 用户ID |
| username | STRING UNIQUE | 用户名 |
| email | STRING UNIQUE | 邮箱（唯一，登录标识） |
| phone | STRING? 可空 | 手机号 |
| password_hash | STRING | bcrypt 密码哈希 |
| plan | STRING（默认 free） | 账号分层：free / pro（迁移 `20260908_add_plan_tier_and_calc_sync`） |
| plan_expires_at | DateTime? 可空 | null = 永久授权 |
| pro_granted_by | STRING? 可空 | 授权来源：seed / invite / admin / purchase |
| created_at / updated_at | DateTime | 时间戳 |

### calculations（计算记录）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT PK 自增 | 记录ID |
| user_id | INT FK（用户级联删除） | 归属用户 |
| type | STRING | comprehensive / business / classification / reverse |
| input_data / result_data | STRING(JSON) | 输入与结果快照 |
| created_at | DateTime | 时间戳 |

### invite_codes（邀请码 · 一机一码）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT PK 自增 | ID |
| code | STRING UNIQUE | 邀请码（EURISKO-XXXX-XXXX） |
| used_by / used_at | INT? / DateTime? | 已使用用户与时间（一次性） |
| created_at | DateTime | 时间戳 |

### verification_codes（邮箱验证码）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT PK 自增 | ID |
| email | STRING | 目标邮箱 |
| code_hash | STRING | 验证码哈希（不存明文） |
| purpose | STRING（默认 register） | 用途 |
| attempts | INT（默认 0） | 错误尝试计数 |
| expires_at / created_at | DateTime | 过期与创建时间 |

### feedbacks（用户意见反馈 · 阶段8 新增）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT PK 自增 | ID |
| user_id | INT FK（用户级联删除） | 提交用户 |
| category | STRING（默认 general） | bug / suggestion / other / general |
| rating | INT? | 评分 1-5，选填 |
| content | STRING | 内容（≤5000 字符） |
| attachments | STRING（JSON 数组，默认 `[]`） | 反馈附图（≤3 张压缩图 data URL，迁移 `20260909_add_feedback_attachments`） |
| status | STRING（默认 open） | open / resolved / closed |
| created_at | DateTime | 提交时间 |

### calc_events（匿名计算埋点聚合 · 阶段8 新增）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT PK 自增 | ID |
| date | DateTime | 北京时间当日 0 点对应 UTC 时刻 |
| type | STRING | comprehensive / business / classification / reverse |
| count | INT（默认 0） | 当日该类计算次数 |

> 说明：`(date, type)` 唯一，按日聚合。仅记录计算类型，**不含任何收入/扣除输入数据**；数据供运营统计 `overview` 使用。

### content_items（内容/公告中心 · 阶段11 新增）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT PK 自增 | ID |
| item_id | STRING UNIQUE | 幂等键；policy 覆盖内置问答时与内置 id 一致 |
| type | STRING | policy（政策要点）/ announcement（更新公告）/ operation（运营内容） |
| audience | STRING（默认 all） | 投放档位：all / free / pro |
| placements | STRING（JSON 数组） | 展示位：assistant_qa / home_banner / modal / notice_list |
| title / summary / body | STRING | 标题 / 摘要 / 正文 |
| category | STRING? | policy 分类 |
| question / answer | STRING? | policy 问答（进税助手问答库） |
| keywords | STRING（JSON 数组） | 关键词 |
| hot | BOOLEAN（默认 false） | 热门标记 |
| link_url / link_text | STRING? | 外链与文案 |
| priority | INT（默认 0） | 排序权重（降序） |
| status | STRING（默认 draft） | draft / published / revoked |
| publish_at | DateTime? | 预约上线时间（未到自动隐藏） |
| expire_at | DateTime? | 自动过期时间（到期下架，null 表示不过期） |
| created_at / updated_at | DateTime | 时间戳 |

> 索引：`(type, status)`、`(status, audience)`。内容表是内置 QA 快照之上的**增量覆盖层**，运行时不再读仓库 JSON（`tax-policy.json` 退役为种子源，由 `server/scripts/seed-content.js` 导入）。

### content_releases（内容发布批次 · 阶段11 新增）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT PK 自增 | ID |
| version | STRING UNIQUE | 版本号（如 `2026.09.11-1`） |
| notice | STRING | 端上「内容已更新」提示文案 |
| published_at | DateTime | 发布时间 |

### leads（转化线索 · 阶段13 新增）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT PK 自增 | ID |
| user_id | INT? | 关联用户；**可空**（游客不登录也能留资）；用户注销时 `SET NULL`，线索作为业务资产保留 |
| name | STRING | 联系人姓名（必填） |
| phone / wechat | STRING? | 手机号 / 微信号（**至少提供一个**，否则无法跟进） |
| company | STRING? | 公司 / 个体户名称 |
| entity_type | STRING（默认 unknown） | 主体类型：individual / sole / small / other / unknown |
| need | STRING（默认 ''） | 需求：bookkeeping / settlement / declare_check / consult / other |
| source | STRING（默认 unknown） | 触点归因：result_business / result_settlement / result_budget / home_banner / modal / notice_list / profile / share / unknown |
| scene | STRING（默认 ''） | **情境快照**（如「经营所得·汇算清缴」），顾问跟进精准开场 |
| note | STRING（默认 ''） | 用户补充描述 / 顾问跟进备注 |
| consent | BOOLEAN（默认 false） | **个保法显式同意留痕**；服务端强制要求为 true 才受理 |
| status | STRING（默认 new） | 状态机：new / contacted / qualified / converted / dropped |
| owner | STRING? | 跟进顾问 |
| created_at / updated_at | DateTime | 时间戳 |

> 索引：`(status, created_at)`、`(source)`、`(phone)`。
> 写入侧限流 10 次/小时/IP（容忍运营商 NAT 共享出口）+ 同手机号 24h 幂等合并（真正的防刷量机制）。
> 该表是「工具 → 服务」的唯一转化枢纽，对应北极星指标 `lead_submit / calc_done`。

---

## 🔌 API接口设计

> 📌 **真源在 [api-reference.md](../api/api-reference.md)**（接口契约唯一真源）。本节是**早期设计快照**，
> 改接口契约改那份；两边冲突时以 `api-reference.md` 为准。

完整的API接口文档请参考：[docs/api/api-reference.md](../api/api-reference.md)

---

## 📊 开发进度追踪

| 阶段 | 状态 | 预计时间 | 实际完成时间 |
|------|------|----------|--------------|
| 阶段1：后端基础架构 | ✅ 已完成 | 1周 | 2026-05-25 |
| 阶段2：用户认证系统 | ✅ 已完成 | 1周 | 2026-05-26 |
| 阶段3：计算逻辑迁移 | ✅ 已完成 | 1.5周 | 2026-05-27 |
| 阶段4：前端改造集成 | ✅ 已完成 | 1周 | 2026-05-28 |
| 阶段5：部署与上线准备 | ✅ 已完成（方案调整为Zeabur托管） | 1周 | 2026-07-05 |
| 阶段6：生产环境硬化（v1.4.0） | ✅ 已完成 | 2天 | 2026-09-05 |
| 阶段7：云平台部署上线 | ✅ 已完成 | 1天 | 2026-09-05 |
| 阶段8：首批测试用户运营 | 🚧 进行中（素材已备好；匿名埋点 + 反馈落库 + 管理员跟进收尾 ✅ 2026-09-07） | 2周 | 预计 2026-09-20 |
| 阶段9：PWA 离线化改造 | ✅ 已完成（2026-09-06 上线；缓存策略精简为网络优先瘦缓存） | 3天 | 2026-09-06 |
| 阶段10：免费/专业版体系 | ✅ 已完成（v1.7.0 已发布 2026-09-10 —— 10A 后端地基 a29bd12 + 前端同步链路 8f3195a；10B 政策要点更新（`GET /api/content/tax-policy` + `tax-policy.js` 增量合并/提示）与专业版汇算清缴报告（`final-report.js`）；同批上线运维管理后台（`admin.html` + `/api/admin/users`）与反馈附图；`verify:local` + Jest 全绿） | 1周+ | 2026-09-10 |
| 阶段11：内容/公告中心 | ✅ 已完成（v1.8.0 已上线 2026-09-11；后端地基 `5a52776`；`ContentItem`/`ContentRelease` 分层投放 audience(all/free/pro) + 时间窗 publish_at/expire_at；公开端点 `GET /api/content/tax-policy`（改读库、全体用户可见、增量 revision）与 `GET /api/content/feed`；运维后台内容 CRUD + 发布批次；前端 `content-center-ui.js` 四展示位；支付体系顺延阶段12） | 3天 | 2026-09-11 |
| 阶段12：支付体系与 B 端 API | 🟡 部分完成 / 已拆分（**A ✅** 四项核心功能补强：公式透明化 / 方案对比中心 / 计算核心纯函数化 / 常量版本化；**C1 ✅** 税制参数配置化（v1.11.0 · 2026-09-12）—— `TaxRateConfig` 版本化快照 + 运维后台「税率」Tab 热改（保存即生效、可回滚、可选联动公告）+ 公开只读端点 `GET /api/config/tax-rates` + 端上 `tax-rates-sync.js` 离线兜底；**范围调整**：支付体系与 B 端 API 被 ICP 备案阻塞，移出本阶段顺延至阶段16；C2 城市社保参数库已移入阶段14 并随 v1.13.0 上线） | 3周+ | 已拆分 |
| 阶段13：获客与转化（引流 → 线索） | ✅ 已完成（**随 v1.12.0 上线**；**13A ✅ 后端地基 2026-09-12**：`Lead` 模型（`user_id` 可空 / `scene` 情境快照 / `consent` 同意留痕 / `status` 状态机）+ 迁移 `20260912_add_leads` + 公开端点 `POST /api/leads`（游客可提交、10 次/小时/IP 限流、同手机号 24h 幂等合并）+ 管理端 `GET/PATCH /api/admin/leads`、`/stats`、`/export`（CSV 含 BOM + 公式注入防护）；`verify:local` 82/82 全绿（新增 14 项线索断言）+ `tests/leads.test.js` 20 项。**13B ✅ 前端触点 2026-09-12**：结果页情境引导（分流白名单 `business`/`forward`/`comprehensive`/`classification`，显式排除谈薪 `reverse`）+ 留资弹窗 `lead-modal`（企业微信活码 + 留言表单双通道；活码经 `window.LEAD_CONFIG.wecomQrUrl` 注入，未配置自动降级为仅留言通道）+ 个人中心「财税服务」卡片 + `api-client.submitLead`（游客可用 / 登录则关联账号）；`verify:local` 89/89 全绿（13A 14 项 + 13B 新增 7 项前端触点断言）。**13C ✅ 管理台「线索」Tab 2026-09-12**：运维后台新增「线索」Tab —— 漏斗条（总数/今日新增/待分配/已成交·转化率）+ 列表（联系人·来源·情境·备注）+ 行内状态机即时保存 + 分配跟进人 + 按筛选导出 CSV；`verify:local` 92/92 全绿（13A 14 项 + 13B 7 项 + 13C 2 项 + Swagger 文档完整性 1 项）。**13E ✅ 漏斗埋点 2026-09-13**：`FunnelEvent`（日粒度聚合）+ 公开端点 `POST /api/stats/funnel`（无需登录、白名单、限流）+ `GET /api/admin/leads/funnel`（各步转化率 + 北极星）+ 前端 `funnel-tracking.js`（visit / calc_done / save / share / lead_click，其中 lead_click 包装 `LeadModal.open` 唯一入口）+ 管理台「转化漏斗」区块；**口径修正**：原 calc_done 只统计登录用户保存动作，游客与算完未保存者全不计入，北极星分母失真 → 改公开端点全量口径；`verify:local` 95/95 全绿（+13E 3 项）、单测 **20 套件 412 例**（+`tests/funnel.test.js` 9 例）。**13D ✅ 一键结果分享图 2026-09-13**：新增公共截图层 `Capture.captureHtml`（统一 html2canvas 配置 + 临时容器清理），PDF 导出与分享图共用同一层、消除配置漂移；`share-card.js` 结果页→模板路由（`income` 正向结果卡 / `negotiation` 谈薪卡，谈薪页唯一转化出口）+ 二维码（`qrcode-generator` CDN，离线可用）+ 预生成预览确认（保存/关闭）+ 固定免责声明「本测算结果仅供参考，不构成税务建议」；分享链接带 `?source=share` 回填 `Lead.source`，构成 T4 归因闭环；`verify:local` 100/100 全绿（阶段13 累计 +32 项：13A 14 / 13B 7 / 13C 2 / Swagger 1 / 13E 3 / 13D 5）、单测 **20 套件 412 例**（+`tests/share-card.test.js` 22 例）—— 阶段13 子项已全部完成）详见 [stage13-acquisition-and-leads-plan.md](./stage13-acquisition-and-leads-plan.md) | 1-2周 | 2026-09-13 |
| 阶段14：变现与可信度 | ✅ 已完成并上线（v1.13.0 · 2026-09-13）（**14A/14B/14C ✅ ProCode 兑换码**：`ProCode` 模型（`code` 唯一 / `duration_days` 空=永久 / `batch` 批次 / `used_by` 兑换留痕 / `disabled` 作废）+ 迁移 `20260913_add_pro_codes`；用户端 `POST /api/pro-codes/redeem`（登录 + 事务原子占用，一码一用；限时码对未过期 pro 叠加续期；永久码 `plan_expires_at=null`；已是永久 pro 拒绝且不消耗码）+ `GET /api/pro-codes/mine`；管理端 `GET/POST /api/admin/pro-codes`、`PATCH /:id`（已兑换码禁止作废）、`GET /export`（CSV 含 BOM + 公式注入防护）；前端「版本与权益」弹窗自助兑换入口 + 管理台「兑换码」Tab（生成 / 计数 / 筛选 / 作废 / 导出，原 Tab 更名「邀请码」）；`verify:local` 117/117 全绿（新增 17 项）+ `tests/pro-code.test.js` 28 例。**14D/C2 ✅ 城市社保参数库 2026-09-13**：`CitySocialConfig` 模型（`version` 唯一 / `status` published·archived / `payload` JSON 快照）+ 迁移 `20260913_add_city_social_config`；公开只读 `GET /api/config/city-social`（`since` 增量指纹）+ 管理端 `GET/POST /api/admin/city-social`、`POST /rollback`（版本化快照 / 回滚另存 / 可选公告联动，公告版本号加 `city-` 前缀避免与税率公告互相覆盖）；**服务端校验即安全边界**（城市编码契约 / 上限 ≥ 下限（留空 = 不设上限）/ 公积金比例 `(0,100]` / `national` 兜底城市不可删除 / 默认城市须在列表中 / 版本号唯一）；端上 `city-social-sync.js` / `city-social-ui.js`（**v1.17.0 已回退**：两个前端模块删除、三页不再注入「参保城市」下拉，回到「默认基数 + 用户自改」，城市改由留资表单收集并由顾问人工核对；参数库与公开端点保留供 SEO 落地页复用）；管理台新增「社保基数」Tab（一城一行可增删表格 / 出厂基线载入 / 版本历史回滚 / 前端与后端同口径预校验）；`verify:local` **146/146** 全绿（**口径修正**：此前记的 142/142 是「基线 100 + 本阶段新增 35 + 阶段13 补强 7」的推算值，发布前实跑为 **146/146**，缺口 4 项此前未登记归属 —— 已按实跑回填，分段明细见 CHANGELOG）+ `tests/city-social.test.js` 24 例 + `tests/city-social-sync.test.js` 27 例。**阶段14 剩余项已陆续交付**：高商业意图 SEO 落地页 —— 首个页面 `/seo/bonus-tax.html`（年终奖个税）随 v1.14.0 上线（门禁 152/152），第二个页面 `/seo/salary-tax.html`（月薪个税）随 v1.15.0 上线（门禁 156/156），第三个页面 `/seo/annual-settlement.html`（汇算清缴：应退/应补 = 全年应纳税额 − 已预缴税额）随 v1.16.0 上线（门禁 **162/162**）；**待办**：其余关键词落地页（社保基数 / 税后工资），方案见 `docs/development/seo-landing-plan.md`） | 2周 | 2026-09-13 |
| 阶段15：税务计算能力扩展（多税种） | ✅ 已完成并全部关闭（**v1.18.0 → v1.35.0 陆续交付，最后一批随 v1.35.0 收口 · 2026-09-15**；计划收口见 stage15-multi-tax-plan.md §9）：15A/15B/15C 共交付 **20 个 SEO 落地页**（个税纵深 8 + 企业税种 4 + 社保薪酬 3 + 用工/残保金 3 + 养老年金健康险税优 2），15D 按事实标注（20 个 quick 模块 + 内核对拍测试、独立工具页入口 /seo/index.html、视觉统一实测验证 21 页共用 landing.css 零内联样式、门禁 259/259）；15A-5 尾巴「税优健康险（2400 元/年限额 + 赔款免税）」与「企业年金（个人 4% 当期扣除 + 领取全额单独计税）」随 v1.35.0 补齐。方案见 [stage15-multi-tax-plan.md](./stage15-multi-tax-plan.md) | 3周+ | 2026-09-15 |
| 阶段16：迁移与合规升级 | 🟡 **进行中**：**16A ✅ 已上线**（ICP 备案 2026-10-01 通过 · 沪ICP备2026049608号-1；2026-10-01 切流至腾讯云北京轻量 `101.42.89.184`，站点跑在 `https://euriskotax.com`，`ops-check-prod` **37/37**；107 处 canonical / sitemap / robots 换主域、Caddy 自动 HTTPS、`www` 与 `.cn` 301 到主域；每日备份 + pm2 开机自启已补，v1.116.0 / v1.116.1）。**⏳ 公安备案待办**：网站开通起 30 日内（**10-31 前**）到 `beian.mps.gov.cn` 办理，拿到号后只改 `site-filing-ui.js` 的 `policeNumber` 一行。**16B 官方支付 / 16C 微信小程序 / 16D B 端 API** 前置均已齐（ICP ✅、企业主体 ✅、域名已备案 ✅、15B 企业税种 ✅），待拍板启动顺序。方案见 [stage16-migration-and-compliance-plan.md](./stage16-migration-and-compliance-plan.md) | 3周+ | 16A：2026-10-01 |
| 阶段17：全税种完整测算（**核心卖点**） | ✅ 已完成并收官（**v1.42.0 → v1.70.0 · 2026-09-19**）：17A 测算描述符 spec（`tool-registry` 加 `step` 分组 + `steps` 分步声明 + 通用渲染器 `src/js/ui/deep-wizard-ui.js`）→ 17B 反向迁移（原有 4 个**页面式** deep 全部迁到 spec 驱动，页面式归零）→ 17C-1~5 铺齐 **6/6 类**税种 → 17D-1~13 个税纵深（场景完整度 6/16 → **16/16**）→ 17E 遗留清偿。现况：`EuriskoToolRegistry.deep()` **21 个 spec 驱动完整测算**、`.all()` 20 个速算器（约定：`X-deep` 复用同名速算器的 fields/steps/compute/pitfalls/policyKey）。方案见 [stage17-full-tax-coverage-plan.md](./stage17-full-tax-coverage-plan.md) | 3周+ | 2026-09-19 |
| 阶段18：spec 驱动的配套链路收口 | 🟡 **大部分完成**（**v1.71.0 → v1.76.0 · 2026-09-19**）：修的是阶段17「每迁移一个页面式 deep 就地补一份按工具认人的配置」留下的**静默失败** —— 21 个 spec 驱动 deep 里只有 4 个被照顾到，其余 17 个全漏且表现为静默/半静默失败。18-1 加载顺序装配守护 / 18-2 历史查看按注册表统一分发 / 18-3 + 18-5 分享图取数与入口（改事件委托）/ 18-4 留资情境注册表兜底 / 18-6a 真机验收补跑。**剩余两项待定**：① 18-6 按用户反馈补具体税种场景（待用户输入）；② 留资引导投放白名单（`lead-touchpoints.ALLOWED_TYPES`）是否从 4 类扩到更多 deep（产品投放口径，待用户定）。方案见 [stage18-spec-driven-followup.md](./stage18-spec-driven-followup.md) | 1周 | 进行中 |
| 阶段19：UI 重构与留存设计 | 🚧 **进行中**（**v1.77.0 起 · 2026-09-20**）：19-0 样式沙箱层 `src/css/ui-redesign.css` + **视觉回归截图基线**（`tools/ops/ui-screenshot-baseline.js`，6 页 × 375/1280 × 浅色/深色 = 24 张，入仓）✅ v1.77.0；19-1a 设计令牌迁回 `tokens.css` 真源（零像素变化）✅ v1.78.0；19-1b Tailwind 产物**纯重建**（修好构建链路，零视觉变化）✅ v1.79.0；19-1c **全站阴影收口**到 `--sh-*` 5 个角色（26 处字面值收口、焦点环统一）✅ v1.80.0；19-1 验收：全站文字对比度达 WCAG AA ✅ v1.81.0 / v1.81.1（补 admin.html）；**19-2 首页双轴重构**（Mission 三态 Hero + 事件卡上轴 9 张 + 我的税务资产 + 身份卡 5→6）✅ v1.82.0；**19-3 工具页降载**（6 组默认折叠 + 逐组记忆 + 卡片状态微标签 + 进页聚焦搜索；改动如有两边：折叠只加 class 不重建 DOM、「最近使用」组默认展开）✅ v1.83.0；**19-4 速算器结果页双栏**（桌面 ≥1024px 左输入 sticky / 右结果，手机单列 + 结果吸底条 + 行动条四按钮常驻；**只做一份 DOM**，单列与双栏由 CSS 断点切换）✅ v1.84.0。**编号口径**：v1.79.0 / v1.80.0 的标题里写作 19-2 / 19-3，实为方案 §4 中 19-1 的两个子步骤（施工顺序编号，与方案撞号），已提交标题不回改，后续以 [stage19-ui-redesign-plan.md](./stage19-ui-redesign-plan.md) §4 为准。**遗留**：`src/css/admin.css` 仍不可复现（`build:css` 不要整条跑）；深色档**变化**截图覆盖不到（只有像素比对），深色模式需逐页人工过一遍 | 进行中 | 进行中 |
| 🟡 并行线：ICP 备案 | 🟡 进行中（2026-09-15：**域名已购、腾讯云服务器已购、ICP 备案已提交排队中、企业微信已注册**；阶段15 已关闭，备案通过后即可启动阶段16 迁移） | 3-5周 | 进行中 |

### 当前状态

**生产环境（2026-09-05 已上线运行）**：
- 平台：Zeabur
- 服务器：Tencent - Tokyo，2 vCPU / 2 GB 内存 / 40 GB SSD / 0.5TB 流量（Max 30 Mbps）
- 系统：ZeaburOS（托管模式，根目录 `Dockerfile` 构建部署，自动 HTTPS）
- 费用：$3/月（促销价，原价 $4.20）
- 公网地址：https://euriskotax.zeabur.app（HTTPS 已生效）
- 数据库：PostgreSQL（Zeabur 托管服务；Dockerfile 内 `prisma migrate deploy` 启动时自动迁移）
- 环境变量：DATABASE_URL / JWT_SECRET / NODE_ENV=production / PORT / CORS_ORIGIN / ADMIN_TOKEN 已全部配置（注：早期 `INVITE_CODE` 固定邀请码环境变量已随「一机一码」机制废弃）
- 邮件配置（注册邮箱验证码依赖，缺配置则注册不可用）：SMTP_HOST / SMTP_USER / SMTP_PASS / SMTP_PORT（465 或 587）/ SMTP_SECURE / SMTP_FROM_NAME —— 已在 Zeabur 面板配置，见 [api-reference 8.2](../api/api-reference.md)
- 2026-09-05 全链路验证通过：注册（邮箱验证码 + 一机一码邀请码）→ 登录 → JWT 受保护接口 → CORS 限制 → 安全响应头
- 注册机制（2026-09-06）：**邮箱验证码 + 一机一码邀请码**（`EURISKO-XXXX-XXXX`，表内校验、一次性、事务原子消耗；服务启动表空时自动兜底生成 20 个）。固定码 `EURISKO2026BETA` 已不再接受
- 运营统计（v1.6.0）：GET /api/stats/overview（X-Admin-Token 认证）计算指标改读 `CalcEvent` 聚合表；计算次数由登录用户保存计算时的匿名埋点（POST /api/stats/events，仅上报类型）驱动，冷启动即可观察（2026-09-07 起不再恒 0）
- 反馈闭环（v1.6.0）：POST/GET /api/feedback 提交落库（`Feedback` 表）+ 个人中心"意见反馈"卡片；管理员 GET/PATCH /api/feedback/admin 列表与状态跟进（X-Admin-Token，`middleware/adminAuth.js` 共享校验）
- PWA（阶段 9）：manifest + service-worker 已上线；SW 为网络优先「瘦缓存」策略（不预缓存整壳、在线永远最新、访问过后离线可算、发版无需手动清缓存），详见 CHANGELOG 1.5.2

**商业与冷启动状态（2026-09-14 补记）**：
- 产品已具备获客条件：转化链路（结果页引导 → 留资落库 → 顾问状态机 → 转化漏斗）+ 兑换码收款 + 三个 SEO 落地页均已上线，**尚未开始推广（0 用户 / 0 收入）**
- 三个点火动作进展（2026-09-16 更新）：① `.com` 域名 ✅ 已注册（`euriskotax.com`，公司名下）；② ICP 备案 ✅ 已提交（2026-09-15，腾讯云接入，审核中，一般 1–3 周）；③ 企业微信「联系我」活码 ✅ 已配置（见 gtm-execution-plan 1.2）
- **备案审核期间纪律**：`euriskotax.com` 在备案通过前**不加任何解析**（无解析是正确状态）；接入商为腾讯云，备案通过后解析指向腾讯云境内服务器
- 迁移目标已购：腾讯云轻量服务器 euriskotax-sh（上海 · Docker CE 镜像 · 65 元/月 · SSH 密钥 `euriskoTax_ssh`）；Zeabur（东京）保留为过渡/预览环境
- 战略与财务测算见 [../marketing/business-plan-for-partners.md](../marketing/business-plan-for-partners.md)；90 天执行清单 / Go-NoGo / 线索 SOP 见 [../marketing/gtm-execution-plan.md](../marketing/gtm-execution-plan.md)

**本地开发环境**：
- 后端服务：http://localhost:3000
- API文档：http://localhost:3000/api/docs
- 数据库：开发 SQLite（dev.db）/ 生产 PostgreSQL（迁移文件已生成）
- 认证方式：JWT Token
- 前端：HTML5 + CSS3 + JavaScript（原生技术，计税引擎全本地运行）

### 开发账号

- 用户名：devuser
- 邮箱：dev@example.com（本机可用仓库根 `dev-account.local.json` 覆盖成自己的账号）
- 密码：password（同上；凭据不进版本库）

> 凭据以 [server/scripts/reset-dev-user.js](../../server/scripts/reset-dev-user.js) 为准，`ops-start-dev.ps1` 启动时会自动重置。**注意**：生产环境严禁保留此账号与 reset 脚本自动调用。

---

## 🚀 部署方案

> 📌 **真源在代码与部署手册**：`Dockerfile`（Zeabur 生产镜像）+ [lighthouse-deployment-guide.md](../tech-reports/lighthouse-deployment-guide.md)
> （ICP 备案通过后迁腾讯云轻量上海）。本节是**立项时的方案快照**。

### 本地开发
```bash
cd server
npm install
npx prisma migrate dev
npm start
```

### 云平台部署（已选定：Zeabur）

> **2026-09-05 已购买**：Tencent - Tokyo 服务器（2 vCPU / 2GB / 40GB / ZeaburOS，$3/月）。
> 选型结论：比香港 $6 档便宜一半且带宽更大（30 vs 20 Mbps）；ZeaburOS 托管免去自装 Docker/Nginx；PostgreSQL 作为服务部署到同一台机器不额外收费。

**部署流程（阶段 6/7 已完成，实际执行记录）**：
1. 在 Zeabur 创建 PostgreSQL 服务（绑定已购服务器）
2. 从 GitHub 仓库部署应用：Zeabur 自动识别根目录 `Dockerfile` 构建（无需 `zeabur.json`），镜像运行时 `CMD` 自动执行 `prisma migrate deploy` 后启动服务
3. 在 Zeabur 面板设置环境变量：`JWT_SECRET`（强随机密钥）、`DATABASE_URL`、`CORS_ORIGIN`（分配域名）、`NODE_ENV=production`、`ADMIN_TOKEN`（运营统计/邀请码管理用）
4. 绑定 `*.zeabur.app` 免费域名（自动 HTTPS）
5. 自检：`/health` 返回 ok → `/api/docs`（Swagger）可见 → 发送邮箱验证码注册（管理员通过 GUI/API 生成一机一码）测试通过

### cpolar内网穿透（本地开发联调用）
```bash
# 项目规范：必须带 -region=cn 走国内节点，否则默认路由到海外节点速度慢
cpolar http 3000 -region=cn
```

> **推荐方案**：项目使用**临时隧道模式**，无需预设 `cpolar.yml`。运行 `cpolar http 3000 -region=cn` 即可获取临时公网地址（必须带 `-region=cn` 走国内节点）。
> 配合 `tools\ops\ops-start-dev.ps1 -Share -Watchdog` 可一键启动后端 + cpolar + 守护脚本，支持自动重启和邮件通知。
> GUI 控制台（[tools/gui/EuriskoTax-Console.bat](../../tools/gui/EuriskoTax-Console.bat)）提供「🔥完整测试」按钮一键开启全套。
> 详见 [README.md](../../README.md) 和 [守护脚本邮件通知与事件日志规范](../tech-reports/watchdog-notification-and-event-log-spec.md)。

---

## 🛡️ 安全注意事项

1. **密码安全**：使用bcrypt加密存储，禁止明文存储
2. **JWT安全**：设置合理过期时间（如1小时），使用refresh token机制
3. **输入验证**：服务端二次验证所有输入，防止SQL注入和XSS攻击
4. **HTTPS**：生产环境必须启用HTTPS
5. **日志脱敏**：日志中不记录密码等敏感信息
6. **环境变量**：敏感配置（如JWT_SECRET）通过环境变量管理，不提交到代码仓库

---

## 💼 商业模式与产品路线（2026-09-05 定调）

### 核心架构原则

> **计算永远在前端，云端只做增值。**

计税引擎（[tax-calculator.js](../../src/js/calculation/tax-calculator.js)，2586行）已在浏览器本地完整实现，计算过程不经过服务器。这带来三个天然优势：

1. **免费版服务器成本≈0**：计算零带宽消耗，$3/月的服务器只承载登录请求与几 KB 的历史记录 JSON
2. **隐私即卖点**：收入数据不出浏览器，符合财务工具的信任要求
3. **离线可用**：PWA 改造后无网也能算，覆盖移动/弱网场景

后端（Express + PostgreSQL）的职责收敛为四件事：**账号认证、云端同步、反馈运营、B端API**。

### 免费 / 专业版划分

| 功能 | 免费版（离线可用） | 专业版（需登录云服务） |
|------|------------------|---------------------|
| 计税能力 | **全部开放**（综合/经营/分类/反向倒算/年终奖最优分配） | 不锁定计算能力（锁定会毁口碑） |
| 历史记录 | 本地保存（localStorage，改造 [mock-client.js](../../src/js/utils/mock-client.js) 为离线历史客户端） | 云端同步、多设备漫游 |
| 导出 | 截图/基础导出 | 汇算清缴 PDF 报告、批量测算（HR/代账场景） |
| 税务助手 | 基础问答（数据已内置 [tax-assistant.js](../../src/js/data/tax-assistant.js)） | 政策更新推送、个性化筹划建议 |

### 收入路径（按优先级）

1. **B端 API 授权**（第二增长曲线，真正的钱）：`server/src/services/taxCalculator.js` 已具备服务端计算能力，未来改造为对外计税 API，面向代账公司、财务 SaaS、HR 系统按次/按年收费
2. **C端专业版订阅**：汇算季（3-6月流量高峰）推年度订阅，参考定价 9.9-19.9 元/年，主打"云端历史 + PDF 报告"
3. **服务导流**：对接税务师/代账服务拿分成
4. ❌ **不做广告**：财务工具的信任就是产品本身

### 发布形态演进

| 阶段 | 形态 | 说明 |
|------|------|------|
| 第一步（阶段9） | **PWA 网站** | 加 `manifest.json` + Service Worker，可"添加到主屏幕"，离线可算；零审核、URL 直接传播，配合邀请码公测 |
| 第二步 | **微信小程序** | "个税计算"有真实搜索流量；计税逻辑复用前端 JS（Taro 跨端改造），云端复用现有 API |
| 可选 | **桌面端（Tauri）** | 面向代账等 B 端用户的原生体验 |

---

## 📝 下一步行动

### 已完成的后端化开发

✅ **所有阶段已成功完成！** 后端服务已上线运行，支持以下功能：

**用户认证**：
- 用户注册：`POST /api/auth/register`
- 用户登录：`POST /api/auth/login`
- 获取用户信息：`GET /api/auth/profile`
- 更新用户信息：`PUT /api/auth/profile`

**税务计算API**：
- 综合所得计算：`POST /api/calculations/comprehensive`
- 经营所得计算：`POST /api/calculations/business`
- 分类所得计算：`POST /api/calculations/classification`
- 反向倒算：`POST /api/calculations/reverse`
- 历史记录查询：`GET /api/calculations/history`

### 后续可持续开发方向（按商业模式定调重排）

1. **PWA 离线化改造（阶段9）** ✅ 已完成（2026-09-06 上线；缓存策略精简为网络优先瘦缓存）
   - ✅ 新增 `manifest.json`（应用清单：standalone 模式、主题色 #1e40af、192/512 图标含 maskable）
   - ✅ 新增 `service-worker.js`：网络优先「瘦缓存」策略 —— 不预缓存应用壳，HTML/JS/CSS 在线一律走网络拿最新，仅断网时回退最近缓存（离线计税可用）；CDN 资源 cache-first；`/api/*` 永不缓存
   - ✅ `index.html` 引入 manifest / theme-color / favicon / apple-touch-icon，注册 Service Worker
   - ✅ 后端差异化缓存策略：index.html/manifest/service-worker.js → no-cache；JS/CSS → ETag 协商缓存（max-age=0, must-revalidate）；图片/字体 → 7 天
   - ✅ 离线体验：更新提示条 + 安装按钮 + CDN 资源失败兜底
   - ✅ 离线状态检测与 UI 提示（顶部 amber 提示条，计税可用、数据本地保存）
   - ✅ 本地验证通过：SW 激活、在线导航始终网络返回、断网回退缓存命中
   - ✅ 发版不再需要递增缓存版本号、用户无需手动清缓存（2026-09-06 重构，根治旧 HTML/旧脚本残留）

2. **免费/专业版体系（阶段10）** ✅ 已完成并随 v1.7.0 上线（2026-09-10）；支付体系顺延至阶段12，详见 [stage10-free-pro-plan.md](stage10-free-pro-plan.md)
   - ✅ 未登录 = 免费版全功能；登录 = 解锁云端同步（10A：`/api/calculations/sync` + `history-sync.js`）
   - ✅ 历史记录"本地 ↔ 云端"合并策略（登录后上传本地记录，多端冲突以 updatedAt 新者胜）
   - ✅ PDF 报告导出（专业版汇算清缴报告）、政策要点增量推送（10B）
   - ✅ 运维管理后台（用户权益调整 / 反馈跟进 / 兑换码）与意见反馈附图

3. **税务计算能力扩展（多税种，阶段15）** ✅ 已完成并全部关闭（v1.18.0 → v1.35.0，20 个落地页）
   - 个税纵深：劳务报酬/稿酬预扣、股权激励、离职补偿金、专项附加扣除确认、个人养老金、外籍优惠、汇算深度
   - 企业税种：增值税、企业所得税、附加税费、印花税
   - 架构守护：税种注册表单点定义 + 多税种版本化热更新 + SEO 落地页矩阵
   - 详见 [stage15-multi-tax-plan.md](stage15-multi-tax-plan.md)

4. **迁移与合规升级（阶段16）** 🟡 **进行中**：16A ✅ 已上线（2026-10-01 切流），公安备案 ⏳ 待办
   - **已完成（2026-10-01 · v1.116.0）**：ICP 备案通过（**沪ICP备2026049608号-1**，主体在上海）→ 备案号填入 `src/js/ui/site-filing-ui.js` 的 `icpNumber`（页脚全站生效）→ 腾讯云**北京**轻量 `101.42.89.184` 部署完成 → 数据迁移（源库精确 `count(*)` 后仅 4 张表有数据：`User`=3 / `InviteCode`=30 / `ContentItem`=6 / `ContentRelease`=1，`Lead` / `ProCode` / `Calculation` 均为 0）→ DNSPod 加 A 记录 → Caddy 自动 HTTPS → `swap-canonical-domain.js` 换 **107 处** canonical / sitemap / robots → 补首页 canonical + `og:url`、`www` 与 `.cn` 全部 301 到主域 → 全量测试发布，`ops-check-prod` **37/37**
   - **已完成（2026-10-02 · v1.116.1，切流后巡检补漏）**：pm2 开机自启（此前机器重启会造成「Caddy 起来了、后端没起来」的全站 502）+ 每日数据库备份（此前 crontab 为空，系统里只有迁移前那份手动备份）
   - **当前决策（2026-09-16 拍板，仍有效）**：**暂不开线上收费**，官方支付（微信/支付宝）继续顺延，兑换码线下发放模式不变（`tests/filing-compliance.test.js` 有「无在线支付入口」守卫）
   - **⏳ 待办**：**公安备案** —— 网站开通起 30 日内（**10-31 前**）到 `beian.mps.gov.cn` 办理；主体所在地填**上海**、服务器所在地填**北京**（IP 实际地域）、IP `101.42.89.184`、接入商腾讯云、服务类型选**交互式** → 拿到 `沪公网安备 XXXXXXXXXXXX号` 后只改 `site-filing-ui.js` 的 `policeNumber` 一行，22 页自动生效。Zeabur 保留至 **10-09 之后**再下线（回滚路径）
   - **⏳ 待拍板**：16B 官方支付 / 16C 微信小程序 / 16D B 端 API 的启动顺序 —— 前置均已齐（ICP ✅、企业主体 ✅、域名已备案 ✅、15B 企业税种 ✅）
   - 注：`deploy/lighthouse/` + `tools/ops/deploy-lighthouse.ps1` 是 2026-09-16 的准备产物（docker-compose + nginx 路线）；实际落地走的是 `tools/ops/ops-deploy.ps1`（SSH + pm2 + releases 版本目录 + `-Rollback` 回滚、Caddy 自动 HTTPS），**以实际为准**
   - 微信小程序（Taro 复用前端计税 JS）→ 桌面端（Tauri，可选）
   - B端 API 开放：将服务端计税能力封装为独立版本化端点（如 `/api/v1/calc/*`）+ API Key 授权 + 按次计费 + 限流配额（复用 express-rate-limit 经验），面向代账公司/财务 SaaS 输出，Swagger 文档即销售材料（**依赖阶段15 的 15B 企业税种**）
   - 数据管理与多端支持：多设备登录与云端同步、数据导入导出、备份机制
   - 详见 [stage16-migration-and-compliance-plan.md](stage16-migration-and-compliance-plan.md)

5. **全税种完整测算（阶段17 · 核心卖点）** ✅ 已完成并收官（v1.42.0 → v1.70.0 · 2026-09-19）
   - 17A 描述符 spec + 通用多步向导渲染器（`deep-wizard-ui.js`）；17B 把原有 4 个页面式 deep 反向迁到 spec 驱动，**页面式 deep 归零**
   - 17C-1~5：增值税 / 企业所得税 / 社保公积金 / 附加税印花税 / 残保金工会经费 —— **6/6 类税种齐**
   - 17D-1~13 个税纵深：个税场景完整度 **6/16 → 16/16**
   - 现况：21 个 spec 驱动完整测算 + 20 个速算器；详见 [stage17-full-tax-coverage-plan.md](stage17-full-tax-coverage-plan.md)

6. **spec 驱动的配套链路收口（阶段18）** 🟡 大部分完成（v1.71.0 → v1.76.0 · 2026-09-19）
   - 已交付：18-1 加载顺序装配守护 / 18-2 历史查看按注册表统一分发 / 18-3 + 18-5 分享图取数与入口 / 18-4 留资情境兜底 / 18-6a 真机验收补跑
   - ⏳ 待定两项：① 18-6 按用户反馈补具体税种场景（**待用户输入**）；② 留资引导投放白名单是否从 4 类扩到更多 deep（**待用户拍板**）
   - 详见 [stage18-spec-driven-followup.md](stage18-spec-driven-followup.md)（根因 / 六批次 / 待定两项 / 教训）

7. **UI 重构与留存设计（阶段19）** 🚧 进行中（v1.77.0 起 · 2026-09-20）
   - 已交付：19-0 样式沙箱层 + 视觉回归截图基线（24 张）/ 19-1a 令牌迁回真源 / 19-1b Tailwind 产物纯重建 / 19-1c 全站阴影收口到 `--sh-*` 五角色 / 19-1 验收（对比度达 AA，含 admin.html）/ 19-2 首页双轴重构（v1.82.0）/ 19-3 工具页降载（v1.83.0）/ **19-4 速算器结果页双栏（v1.84.0）** / **19-9 效率层 E1 主体 + E2 参数模板（v1.91.0）** / **19-10 效率层 E3 台账（v1.93.0）** / **19-11 效率层 E4 批量（v1.94.0）** / **19-5b 遗留清偿：方案库口径补齐（v1.98.0，任一工具都能存方案）** / **19-4 顺延清偿：结果页「各项数额」条（v1.99.0，速算器与 21 个完整测算共用一份）** / **19-4 顺延清偿：省钱卡接进 21 个完整测算结果步（v1.100.0，判定由字段表说了算）**
   - 19-2 遗留：四条已全部清偿 —— 漏填提醒（v1.95.0）/ 身份卡设默认视图（v1.96.0）/ 我的方案与台账（v1.97.0）；
     19-5b 遗留（方案库只认综合所得口径，速算器存进去会被补成 ¥0.00）亦已清偿（v1.98.0）
   - ⚠️ 施工约束：`src/css/admin.css` 仍不可复现 → **不要整条跑 `build:css`**（只跑 `tailwindcss -i src/css/tailwind.src.css -o src/css/tailwind.css --minify`）；改样式后先用截图 `--check` 定位变化区域，确认后再固化基线
   - 详见 [stage19-ui-redesign-plan.md](stage19-ui-redesign-plan.md)

### 技术文档

- API文档：http://localhost:3000/api/docs
- 数据库模型：`server/prisma/schema.prisma`
- 源代码：`server/src/`
- 计税规则：`docs/guides/tax-calculation-rules.md`

---

*文档创建时间：2026-05-25*
*最后更新：2026-10-03（**v1.129.0 当前基线**：门禁 **259/259**、单测 **116 套件 2184 例**、线上指纹 **37 项**、视觉基线 **tools / profile 各两张重拍**）——本版**留资弹窗自适应修**：弹窗容器 `flex flex-col max-h-[90vh]` 里头部/底部没写 `shrink-0`，内容超高时 flex 先压说服层 → 页头被拦腰裁掉（用户截图）。补 `shrink-0` ×2 + 滚动区 `min-h-0`；页头说明句与信任 chips 重复的半句收掉（46→38 字）。**上一版（v1.128.0）留资弹窗表单统一 14px + 游客态撤重复登录卡**：`.input-field` 不带字号（继承 16px），意见反馈逐控件补了 text-sm 而留资弹窗 8 个控件没补 —— 按 `#lead-modal .input-field` 容器收口一条规则管全部；`profile-card-account` 的游客态「登录 / 注册」卡与顶栏游客登录按钮是同一屏两条一样的路，改 `guestHidden` 整卡不渲染（改名只解决文案、解决不了路径重复），`guestFn` 一并撤。**上一版（v1.127.0）弹窗字号与排版统一**：全站 16 个弹窗盘点后收掉「没写字号、继承 body 16px」的一档（alert/confirm 消息体与按钮、help 的 13 个 h4、导出版本卡片标题），标题统一 text-lg（help/税率表从 text-xl 降、更新公告从 text-base 升），help 的 4 个 tab 补 `shrink-0 whitespace-nowrap`（375px 下被 flex 压缩成一字一行竖排——排版 bug 顺带修掉）。lead-modal 整窗 11–12px 的密排是营销弹窗自有设计语言，不拉齐。**上一版（v1.126.0）修「第一次点工具，页面进去了、底栏还亮着首页」**：`showPage` 的「初始导航」分支只加 `hidden` 不动 `active`（隐含"初始只有一页 active"），而**游客进入不走 showPage**，于是 `isInitialNavigation` 留到用户第一次点 Tab 才被消耗 → 那一次点击走初始导航分支 → 首页留着 `active+hidden`、目标页也有 `active`，双 active；`syncNav` 用 `querySelector('.page.active')` 取 DOM 里靠前的首页 → 高亮错位。改两处：初始导航分支连 active 一起清（治本）+ syncNav 取 `.page.active:not(.hidden)`、无则退回 `.active`（高亮跟**看得见的那一页**，兼容切换动画那 200ms）。守卫两条 + 修掉一条固定 900 字符窗口切函数体的脆弱断言。**上一版（v1.125.0）首页信任标签收口**：删重复（同一句 hero 说过一遍、底部标签再说一遍 → 底部删除，并到 hero 一处；这也顺带解决它自己的处境：v1.124.0 删掉全站页尾后，它独自挂在首页最后一个元素上，看着像页尾残留）+ 改口径（「数据不出本机」对登录用户是**半假**的 —— 测算**记录**会镜像到云端，改说真正成立的那条「计税输入不上云」）+ 数字不再手写（`41` 曾写在 hero / 底部标签 / 测试断言三处，加一个工具就得改三处；现由 `EuriskoToolRegistry.all() + deep()` 现数，**取不到就不提数字** —— HTML 里留不带数字的兜底）+ 捎带修关于弹窗那句「20 个速算器与 21 个完整测算」（同为手写数字，且 `login-identifier.test.js:167` 早已判属**开发口径**、不该出现在用户可见处）→ 由 `fillAboutBlurb()` 运行时注入用户视角的「41 个测算场景」，并在全额承诺旁补上云同步例外。上一版（v1.124.0）**删掉主应用页尾**（推翻 v1.123.0 刚做的"全站统一"—— 那正是问题：App 形态的界面里每个页面底部压一条 157px，其中 64px 是为避开固定 Tab 栏垫的空白）。页尾是内容型网站的产物：Gmail/Notion/Figma 主界面没有页脚，版权合规进「关于」。删后合规由登录页（=域名首页，工信部口径的"首页底部"）+ 21 个落地页承载，App 内由「关于我们」弹窗承载（site-filing-ui 改 querySelectorAll 渲染全部容器，getElementById 只命中第一个且不报错 —— 静默漏备案位最阴）。连带修门禁过时断言（死盯页尾时代的 `?source=app_footer`，改查首页 `quick-seo-link` 通路本身）。守卫三条：页尾不许原样加回、弹窗备案容器不许搬走、渲染必须覆盖全部容器。上一版（v1.123.0）修「我的页六个子页全都打不开 + 页尾全站统一 + 个人中心入列」：**`#profile-page` 源码里一直没闭合**，浏览器在 app-container 结尾兜底关它 → 六个子页与全站 `<footer>` 全被嵌套进去，① 子页随父隐藏（点了没反应，且子元素 computed display 仍是 block，**只有 getClientRects/offsetParent 判得出来**）② 备案号只有「我的」页有。补一个 `</div>` 后六子页与首页/工具页同级；footer 提到 app-container 直接子级，内容收敛为版权+免责+备案号（撤「测算工具总目录」链接），手机端给页尾留 fixed 底栏高度。IA：撤「我的」页头（返回按钮+「个人中心」标题）—— 顶层 Tab 页不该有返回；「个人中心」成为服务组一张卡（原横幅「账户设置」按钮撤掉），游客态换「登录/注册」文案，卡片列表记 `dataset.identityState` 在登录态变化时重渲染；自制「底部操作」块（含退出登录）一并撤，退出登录归顶栏菜单。删元素必须同步删绑定（`#profile-nav-settings`/`#profile-logout-link`）。上一版（v1.122.0）为「游客的我的页」：两个问题叠在一起 —— ①**进「我的」页根本不渲染**（统计卡/四宫格/模块卡只长在 `loadProfile()` 里，而它只在点「账户设置」时才被调用，直接点 Tab 进来三段全空；视觉基线能拍到是因为截图脚本手动调 `window.renderProfile*`，等于早有人绕过它却没人问为什么真机要补）→ 渲染**按页挂载**：`showPage('profile-page')` 触发幂等的 `prepareProfilePage()`；②**游客看到假账号**（`getProfile()` 在游客态 401 → 整条渲染链跳过，横幅停在 HTML 写死的「用户名 / email@example.com」，外加「账户设置」「退出登录」两个对游客不成立的按钮）→ 服务端身份只在登录态取，横幅由 `renderProfileIdentity(user)` 同时写两种状态（藏/显同一处，不留"藏了不恢复"的缝）。**保留「我的」给游客**（不藏 Tab）：四宫格四项全是本地数据，藏掉等于删掉游客本就该用的入口，与"绝不强制登录前置"相悖。上一版（v1.121.0）为修「主页内容出现在登录页」：`#login-page` 的 `.hidden` 被 `.auth-page` 的 display:flex 压掉（优先级反转家族第三爆），登录页在登录后永不消失、与主应用叠放；桌面 `top-tabbar`（`hidden md:block`）同样压不住 —— **v1.119 的「Tab 行浮在登录页」桌面端一直没修干净**。修复 = 逐类反制（`.auth-page/.identity-note/.plans-box/.card` 的 `.hidden` + `.top-tabbar.hidden` 用 !important 表达「JS 说藏就藏」）；**不能用全局 `.hidden{display:none!important}` 兜底** —— `hidden sm:inline`/`hidden md:block` 是响应式组合，桌面显示是有意的（brand-name/user-name 会被误伤）。守卫检测 B（带 .hidden 而 computed display≠none 即 FAIL）补了响应式豁免。真机四态回归全互斥正确。上一版（v1.120.1）为「级联守卫工具」：logo 放大到整栏三分之一并竖排居中（坑：logo 百分比宽度的参考是父容器，mark 不给 `width:100%` 会退化为 min-width）；品牌主张换为「个税 / 企业税 / 社保在线测算」（陈述事实不喊口号）；游客入口由裸链接升为整宽描边按钮（坑：`.auth-alt button` (0,1,1) 压过组件类 `.auth-btn-outline` (0,1,0)，须 `:not()` 收窄 —— 优先级反转坑第二次出现）；复验 1280/720/375 三视口滚动到底均无主应用内容。上一版（v1.119.0）为「登录页收敛为独立一屏」：修「下滑进主页」——初始 DOM 的 `mode-selection-page` 自带 `.active`，`syncNav()` 误判在首页，把 fixed 底部 Tab 栏放到了登录页上，根治是 syncNav 判登录页可见即不放行导航；按用户视角精简：品牌面板删内部口径的功能清单、表单删重复说明行、游客入口改「游客登录」、页脚删运维排障入口并**补上备案号容器**（登录页也是 22 页之一，页脚展示备案号是法定义务，与主应用共用 `site-filing-ui.js` 同一份配置）。上一版（v1.118.0）为「登录支持邮箱或用户名 + 定死手机号口径」：登录标识由只认邮箱扩到「邮箱 或 用户名」（用户名注册时即唯一校验，无需任何新验证手段，零成本）；前端登录框 `type` 由 `email` 改 `text` 并同步文案，重置密码面板只在形似邮箱时回填；**决策留档：不做短信验证码，手机号不作为登录凭据**（`User.phone` 未验证，当凭据会串号/冒领；真要支持须四步一个包：接短信 → `phone` 唯一索引 + `phone_verified_at` → 个人中心短信绑定 → 登录框才支持）；手机号保持选填，注册页与个人中心统一标注「联系手机号（选填）…不用于登录」。上一版（v1.117.0）为「登录/注册页正式化」：左右分栏 + 分段 Tab + 注册表单双列化 + 密码强度提示，游客入口从重置面板移到三面板共用卡内页脚。上一版（v1.116.2）为「公安备案提交前收尾 + 修掉两处过时的阶段状态」：① 手册新增 §2.6.1「公安联网备案提交前收尾」——时限 10-31 前、从腾讯云控制台「公安联网备案」入口进（会预填主体与接入信息）、填表口径表、材料清单、拿到号后只改 `policeNumber` 一行的回填步骤、三个坑；② 定死一个会反复纠结的口径：**主体在上海、服务器在北京** —— ICP 已下发沪ICP备2026049608号-1，证明管局按**主办单位所在地**管，公安备案则「主体所在地填上海 / 服务器所在地填北京（IP 实际地域）」，两个「所在地」**本来就不一样**，填反才是不一致；腾讯云轻量不支持换地域，不动；③ 修掉两处**过时状态**：阶段16 仍写「⏳ 待开始（前置：ICP 备案通过）」（ICP 10-01 已通过、16A 已上线）→ 改「🟡 进行中：16A ✅ 已上线 + 公安备案 ⏳ 待办」；下一步行动整段仍停在 2026-09-16 的「迁移执行包已就绪 / 暂不开线上收费」→ 改为已完成事实，并把「暂不开线上收费」保留为**当前决策**（它不是待办），另注明实际落地走 `ops-deploy.ps1` 而非 `deploy/lighthouse` 那套，避免后人照着准备产物去部署。上一版（v1.116.1）为「切流后巡检补两项运维加固」：站点已在 https://euriskotax.com 稳定运行；巡检发现并补齐两项**看不见的**隐患（站点跑得好好的、37/37 全绿，问题只在「机器重启」或「要恢复数据」那一刻暴露）——① **pm2 开机自启未启用**：Caddy 的 systemd 是 `enabled`，容易误以为都配好了，实际机器重启后就是「Caddy 起来了、后端没起来」，站点全 502 → 补 `pm2 startup` + `pm2 save`，验证 `systemctl is-enabled pm2-ubuntu` = `enabled`；② **完全没有每日备份**：crontab 是空的，系统里只有迁移前那份手动备份 → 加 `scripts/pg-backup.sh`（custom 格式、保留 7 天、避免撑满 40G 盘）+ cron 每天 03:00，并**手工跑通**验证（51K / 15 张表数据），配完不实跑一次，真要恢复时发现脚本是坏的就晚了。坑：注册 cron 若写成 `( crontab -l | grep -v 旧行; echo 新行) | crontab -` 且脚本开了 `set -e`，`grep` 无匹配返回非 0 会中断管道 —— 结果是 **crontab 被清空**（不是没加上，是把已有的也抹了），改用 `printf '%s\n' "$LINE" | crontab -`。另排掉一个假警：pm2 日志里 63 行 error 全是**旧 release**（`20261001-192937`）`index.html` 缺失的历史记录，当前 release 正常（37/37 已证）——**别一看到 error 就去改代码**，先看它属于哪个 release。**下一步**：公安备案（IP 与接入商此时才对得上）→ 拿 `沪公网安备 XXXXXXXXXXXX号` → 只改 `site-filing-ui.js` 的 `policeNumber` 一行，22 页自动生效。上一版（v1.116.0）为「16A 切流完成：域名解析 + HTTPS + 107 处 canonical 换域」：站点正式跑在 **https://euriskotax.com**（`ops-check-prod -BaseUrl https://euriskotax.com` **37/37**）。**数据迁移**：源库（Zeabur **PG 18**）精确 count 后 `User=3`、`InviteCode=30`、`ContentItem=6`、`ContentRelease=1`、`FunnelEvent=14`，而 **Lead=0 / ProCode=0 / Calculation=0** —— 最担心的「线索是买来的、ProCode 是花钱买的」一条都不存在；两个坑：① **别用 `n_live_tup` 判断表是否为空**（估算值，没 ANALYZE 的表一律 0，差点据此判定不用迁、丢了 3 个用户），必须 `count(*)`；② 主键是 `Int autoincrement`，导入后**必须 setval**（现 User 3/3、InviteCode 50/50、FunnelEvent 73/73）；源库 PG18 而服务器 PG16、pg_dump 版本倒退用不了 → 数据量仅几十行，改走 `psql \copy CSV` 同机中转（数据不出服务器）。**密钥**：`JWT_SECRET`/`ADMIN_TOKEN` 已换 Zeabur 真值，但**改 `.env.shared` 不等于生效**（ops-deploy 只在部署那一刻复制到新 release 的 `server/.env`，已在跑的 `current` 不同步，且 health 200、日志正常，**看不出来**）→ 补 `cp .env.shared current/server/.env && pm2 restart`，已写进手册 §3.1。**换域**：`swap-canonical-domain.js` 换 107 处（21 落地页 + index + robots，sitemap 本就是 com），仓库 `zeabur.app` 归零；红了 10 个测试——它们把 canonical **完整 URL 写死在断言里**，属状态过期非缺陷，但**不该逐个改成新域名**（下次换域还要改）→ 统一改为「指向本页面路径」的正则，域名交给断言 9。**顺带补的**：21 个落地页都有 canonical/og:url，**首页（权重最高）反而一个都没有**，且 www 与主域都 200 → 首页两个相同入口；已补首页 canonical + og:url，Caddy 把 `www.euriskotax.com` 与 `.cn`（含 www）全部 **301 到主域**。运维：外网 80/443 在**轻量控制台防火墙**（服务器侧 Caddy `*:80`、ufw inactive、INPUT 挂在云厂商 `YJ-FIREWALL-INPUT`）；DNSPod 免费版 **TTL 下限 600**（填不了 300）；443 在 IP 模式下不通是预期的（无域名签不了证）。**下一步**：公安备案（IP 与接入商此时才对得上）→ 拿 `沪公网安备` 号 → 只改 `site-filing-ui.js` 的 `policeNumber` 一行。上一版（v1.115.0）为「16A 实发：境内节点已在腾讯云跑通（IP 直连验证全绿）」：**应用已在 `101.42.89.184` 运行 v1.115.0**——SSH 密钥连通、PostgreSQL 16.15（apt 版，比 Docker 省 ~150M 内存）+ 16 个 Prisma 迁移全部应用、.env.shared 就位（DATABASE_URL 本地 PG、SMTP 复用 notify.config、**JWT_SECRET/ADMIN_TOKEN 随机占位**）、PM2 跑 euriskotax（101MB）、Caddy 反代 80→3000（IP 验证模式）、验证全绿（首页/版本/落地页/静态 JS/SW/manifest/留资 400/登录 400，内存余量 1.2G）。`ops-deploy.ps1` 首次实发踩出**四个 bug 全修**：① PM2 全局装 EACCES（手动 sudo 装）；② serverEnvFile 相对路径永远找不到（config 改绝对）；③ **数组弱匹配**——$result.Output 是行数组，-notmatch 对数组返回"所有不匹配行"（非空即真），ENV_SYNCED/INSTALL_OK 明明输出仍连环假红 10 处（统一 Out-String 再匹配）；④ **最险**：清理用 ls -dt（mtime）而 **tar 解压会恢复归档里的目录 mtime**，排序全乱 → 把 current 正指向的最新 release 删掉，悬空软链 + PM2 从已删目录跑进程（进程活着、API 正常、静态文件全 404——一半绿一半红极具迷惑性）；改按目录名排序（时间戳天然有序）+ current 永不删。**切 DNS 前两件事**：JWT_SECRET 换 Zeabur 真值（占位直接切 = 全员掉线不可逆）、迁五张表历史数据（等 Zeabur PG 公网串，ops-seed-prod 只能补内容补不出线索）。上一版（v1.114.0）为「16A 落到真机：服务器与备案信息填实，换域脚本就位」：用户发来腾讯云控制台截图，核实了服务器（北京轻量 2核2G/40GB，IP `101.42.89.184`，2027-09 到期）、双域名（com + cn 均在 DNSPod、公司名下）、且 **ICP 备案云资源绑的就是这台**（-1 → com、-2 → cn），接入关系已对上。据此**数据库定案**：2G 内存配 TencentDB 撑不起当前留资量 → 自建（Docker 跑 PG，与 verify:pg 同构）+ 每日 pg_dump cron 保留 14 天 + 2G swap 防 OOM，16B 收费后再评估迁托管。部署路线定走**仓库现成的 `ops-deploy.ps1`**（打包→传输→迁移→健康检查→回滚，早已写好但 deploy.config.json 从未创建），服务器装 Node+PM2、PG 用 Docker、Caddy 反代自动 HTTPS、cn 301 → 主域；轻量机防火墙在**轻量控制台**配（不是 CVM 安全组）。换域做成脚本 `tools/ops/swap-canonical-domain.js`（--check 预览 / 幂等 / 只换带协议 URL，DNS 未解析不许执行），已跑 --check 与手工统计 107 处/23 文件完全一致。上一版（v1.113.0）为「阶段16A 开工：迁境内节点执行手册 + canonical 换域坑」：域名与腾讯云服务器已就位、ICP 已过，把 16A 从一张目标表补成**能照着执行的手册**（§16A.1 九节：开工前三件事、顺序、数据库、环境变量逐项、部署与 HTTPS、切流同批换 canonical、切换窗口、验证、回滚、切完办公安备案）。顺序按「**先迁数据、后切流，验证阶段用 IP 直连不动 DNS**」—— 这样切流只是改一条 A 记录、秒级可回滚。三条照抄不会错、自己想会漏的：`JWT_SECRET` 必须与 Zeabur 完全一致（否则全体老用户 token 验签失败、集体掉线且不可逆）、`SEED_GRANT_PRO` 收费后必须 false（忘了 = 人人白得专业版）、**腾讯云出方向封禁 25 端口**（SMTP 用 465，切完实测验证码能收到）。数据侧 14 张表分三档、**整库 dump 最不容易漏**；丢了是事故的一档是 User / **Lead（线索是买来的）** / **ProCode（用户花钱买的权益）** / InviteCode / Calculation，切换窗口还要按 createdAt 补增量。**顺带排掉的坑**：21 个落地页 + index.html 的 canonical 与 og:url **全指向 zeabur.app（107 处 / 23 文件）**，切了正式域名不改 → 权重归旧域、**21 个落地页白做**，而 sitemap.xml 已是 com，两边不一致比不改更糟；不能提前改（未解析就指向 = 抓取失败），也不能忘（107 处手工替换）→ 新增**断言 9**（全站 canonical 只允许一个域名，现在同一旧域所以绿，切换那天漏一批就分裂成两个、立刻红）。写断言时踩了自己的坑：host 正则要求 host 后紧跟引号、但后面还有路径斜杠 → **两条断言全空跑（0 匹配也绿）**，已修正。上一版（v1.112.0）为「ICP 备案号下发 + 公安备案准备」：备案号 **沪ICP备2026049608号-1** 下发（网站名称「EuriskoTax税费计算器」），改 `site-filing-ui.js` 的 icpNumber **一行**，全站 22 页页脚自动带正式号与工信部链接、占位行自动消失；真机复验主站 + seo/vat + seo/annual-settlement 三处。顺带查到并钉住三处「号下来了才需要看」的事：① **网站名称一致性**（管局核验项）——备案填报名不带空格、title 带空格，断言按去空格后比对（改 title 的人不会想到备案订单里还挂着一个名字）；② **备案号格式** `^沪ICP备\d{6,}号-\d+$`（少一位多一位在页脚上都看不出来，只能靠断言）；③ **公安号位仍空**，不得出现形似公安号的假号（与未备案不写假号是同一条纪律的两个阶段）。测试里有两处**化石**按当前状态改写而非删掉：「占位不得出现数字串」现改为只查公安那一路（ICP 号自身含 10 位连续数字，对整段文本查 /\d{10,}/ 会误伤自己 —— 断言要指名查什么）、「pendingText 置空只剩主体名」改为「有号优先，状态语不叠加」。**公安备案**（合规文档 §6.5）：代码侧 policeNumber 一位已预留、号下来只改一行；但**顺序有坑** —— 公安备案要填 IP 与接入商，而生产仍在境外（euriskotax.zeabur.app）、euriskotax.com 尚未解析，须**先切境内节点（阶段16A）再提交**；本站属交互式（留资 / 意见反馈 / 注册登录 / 云同步）应如实勾选；投诉举报入口待拍板（会改页脚版式、触发 28 张视觉基线重拍）。上一版（v1.111.0）为「按备案口径拍板 + 补留资告知」：用户把两项待决交回来拍板、条件是符合 ICP 备案标准；拍板前先读现状，撞上一个比两项待决更硬的问题 —— 留资弹窗收手机号/微信号/单位/省市并 POST /leads 上报服务端，隐私政策里却只写了注册信息与本机数据，**收了却没告知**（连运营主体是谁都没写，保存期限与撤回同意也缺），对照《个保法》第 17 条属法定告知缺项，留资一扩围暴露面就放大数倍。故先补告知再拍板：隐私政策补处理者名称（与页脚备案主体同源）、留资收什么/不收什么/做什么、保存期限、查阅复制更正删除与撤回同意；新增 copy-standard 断言 8 四条钉住，其中一条钉**主体名与 site-filing-ui.js 的 owner 同源**（各写一份必然漂移，而「备案主体与隐私政策运营主体对不上」正是备案连带检查项）。两项拍板：① **留资白名单不扩到 21 个税种** —— 留资是服务承诺不是流量位，挂上去等于承诺接得住，接不住是《广告法》第 28 条虚假宣传；涉税专业服务受《涉税专业服务监管办法》约束（实名报送、不得承诺结果），越界到「代理」还需财政许可，主体经营范围未必覆盖。② **「我的产出」三卡不立项** —— 真痛点是「产出过什么找不回来」（分享图 canvas 直出不落存储、报告无留痕），不是缺三张卡；改走本机留痕 + 接进已落地的历史页（与 taxCalculationHistory / taxScenarios 同款，零新增合规面），若做云端产出等于在服务端新增个人信息处理场景，备案未下发前不扩张服务端数据面。另把比备案更硬的两条写进合规文档 §6.4：**非经营性备案 ≠ 可以收费**（专业版属经营性信息服务，官方支付的硬前置是经营性 ICP 许可证）、**涉税服务边界**（文案只能落在「咨询解答」，出现代办/代理申报/代理记账/包过即越界）。同批修正 §6.1「落地页主体名 ❌」（CP-5 补容器前的旧状态，现 21 页共用同一份 owner 常量，已 ✅）。上一版（v1.110.0）为「裸星号收口」：给 v1.109.0 的政策要点补覆盖面断言时发现 `**加粗**` 标记有**六种渲染结局**——页面易错口径与政策依据、速算器 PDF、deep 结果卡、精装报告图注各渲染一遍，三处忘渲染（屏幕与 PDF 上都是裸星号）、一处硬剥掉（donation-quick）、一处取整金额顺手把「页面 ¥180,000.00 报告 ¥180,000」的口径分家也带了出来（其注释还自称与工具箱同口径）。根因是**一段格式化抄了六份**：收口为唯一实现（`Toolbox.strongify / escRich / pitfallHtml`），金额同理归一到页面 `fmtValue`。守门：速算器 PDF 与页面两条 **20/20 覆盖面**断言（PDF 按「全文无 `**`」总闸断言，不指定来源；页面用例放文件末尾，因为它会写档案状态、插中间污染别的用例）；两条把取整口径钉成预期的旧断言是被修缺陷自己留下的化石，一并改正。教训：断言要查内容不是查容器（上一版只数 `li` 个数，星号照样漏网）；兜底分支不是生产路径，覆盖面必须加载真源跑真实链路。上一版（v1.109.0）为「阶段20 P5 预览走查」：把站点在预览里逐页点了一遍（首页 / 工具页 / 向导结果步 / 导出弹窗 / 精装报告渲染稿），抓出两处真缺陷与一颗时间炸弹。① **内容级**：增值税精装报告的政策要点写着「子女教育专项附加扣除」—— `pickPolicyItems(kind)` 收了 kind 没用，21 个税种共用问答库里综合所得的条目；真源改为向导注入 spec 自己的 `pitfalls`（41 组，含文号/口径/算错的后果），无注入才回落；`**加粗**` 转 `<strong>`（原来 PDF 里是裸星号）。**同型病第二次**：`exportFinalReport` 组装 docOpts 逐字段抄写又丢了 policies（v1.108.0 丢过 meta），已补全链路透传断言（只测 buildProDocHtml 抓不到这类丢字段）。② **体验级**：留资白名单外的税种点「精装版」被静默降级成标准版下载（无一字解释），弹窗精装版副文案改为按 `hookAllowed(kind)` 动态切换、点击前讲清。③ **时间炸弹 ×2**：`renderTaxCalendar` 内部 `new Date()` 让截止段用例依赖真实日期，10/1 一过自己红了（now 改可注入，测试显式钉日期）；门禁 `sync 墓碑删除广播` 的 fixture 钉死 2026-09-01，被服务端 30 天 TTL 清理命中（fixture 改相对 `Date.now()`）。教训：日期驱动的测试不许钉死绝对日期。上一版（v1.108.0）为「阶段20 P5 交付版报告覆盖面」：v1.107.0 把链路接上了，但真机只点了增值税 1 个税种；覆盖面铺到 21 个后抓出真缺陷 —— `buildProDocHtml` 只认直接给 `reportTitle` 的 opts，而 `exportFinalReport` 传的是 `{ meta }`，于是 meta 被静默丢掉、封面回落到 comprehensive，**21 个税种的精装报告封面全写着「综合所得汇算清缴报告」**（文件名与标题是对的，从文件名上看不出异常）。两边都漏掉它的原因相同：单测断言「有封面」（`pro-cover` 这个类名，默认封面也有）、真机回读的也是这个类名 —— 谁都没去读封面上的**文字**。改法：三种调用形态都认；新增 21 个税种逐个取数的覆盖面断言（入参用向导自己的 `defaultsOf`）；13 个 spec 必需入参无默认值（repeater 空条目等，用户填了才有结果）登记在案且只减不增。教训：① 断言要查内容不是查容器；② 覆盖面要铺满，点 1 个代表碰不到 repeater 空条目 / primary 非 money / rows 全 percent 这些差异。再上一版（v1.107.0）为「阶段20 P5 交付版报告接线」：专业版权益表承诺的「汇算清缴 PDF 完整报告」从来没有兑现过 —— `final-report.js` 自阶段17 删旧页面起**零调用**（模块留下了、调用方没了），用户交了钱拿到的仍是自拼 HTML 的标准版，弹窗里那句留资钩子也再没被任何人看见过；单测全绿是因为既有断言测的是「模块内部对不对」，不是「按钮有没有接到模块」。改法：明细 / 税负结构图 / 封面标题三处数据源改为由向导注入（原先读的全是已删页面的全局量，只接按钮会导出假报告），六项全 0 时整段不画柱状图；专业版直出精装，未付费先给版本选择且「标准版」回到原来的自拼导出；留资行只在钩子真挂得上的税种显示，不做不实承诺。验收：真机双路径各点一遍（专业版封面/明细/图表/政策四项齐全、文件名带税种；未付费弹窗可见且点标准版确实回到原链路）。上一版（v1.106.0）为「阶段20 P1 首页重排 + P2 工具页筛选 + 备案位预留」：首页 10 个区块按「功能有什么」堆，用户不知道先点哪个；三条「现在有个截止 / 有个没填」的事被拆成三张卡（我的税务资产 / 税务提醒 / 漏填提醒），只是三种分类视角。改法：合并为「接下来要办」一张（三段各自判定不动，新增 `syncTodoCard()` 只管整卡显隐；截止段加**90 天窗口**、判定抽成纯函数 `buildCalendarItems(now)`，原先那条 2027/12/31 远期节点让卡片永远在、也永远没人看）；搜索入口卡升级为顶部常驻条并上移；身份整卡降为一行 chip（不渲染描述与「看这类工具 ›」，身份是设置默认视角不是导航）；最近计算降为「继续上次」最多 3 条。工具页：加「全部 41 / 速算 20 / 完整测算 21」三个**互斥视图**（计数由注册表算、状态会话级不落 localStorage）+ 桌面 sticky 组头与一行锚点 chip 条（手机都不加）。备案位：未备案时**先渲染占位行**（主体名 + 「ICP 备案办理中」，位置先占住、等号不跳版），绝不写形似备案号的假号；号下发后只改 `site-filing-ui.js` 的 `icpNumber` / `policeNumber` 两行，全站 22 页同生效。上一版（v1.105.0）为「面向用户文案收敛：单一真源 + 去掉做不到的时效承诺」：同一句免责声明此前散落在结果区 / 助手回答 / 速算器报告页脚 / Word 报告 / 分享图 / 21 个落地页（后缀曾有 8 种写法），且留资弹窗承诺了做不到的「1 个工作日内联系您」。改法：新增 `src/js/copy/copy-standard.js` 作为文案单一真源（src/js/** 一律引用常量）、`tests/copy-standard.test.js` 8 条守护断言兜住静态 HTML、`tools/ops/seo-copy-batch.js` 批量对齐 21 个落地页；留资去掉全部时效（统一「顾问会尽快与您联系」）；升级码弹窗由「基础版 vs 专业版」权益对比重做为「有码就开通 / 没码就留资」，14 天体验领取链路与 handleClaimTrial 一并下线。验收：单测 113 套件 2104 例全绿、verify:release 五处版本号一致；升级码弹窗布局变更，**需重拍该弹窗视觉基线**。上一版（v1.104.0）为「41 个工具真机冒烟（阶段19 收官验证）」：阶段19 一路踩的都是同一类坑 —— jsdom 全绿、真机点开一看不对（18-6a 行名带括号后缀匹配不到、19-12 政策徽标把标题压成一字一行、18-2 点老记录看到最近一次算的东西）。单测钉的是「函数在给定输入下返回什么」，钉不住「41 个入口在真机上出不出数」—— deep 侧 21 个结果卡按 spec 现拼，spec 缺字段 / compute 抛错 / 渲染少判空，在单测里都是绿的那一格（测试只挑两三个代表跑）。改法：新增 `tools/ops/ui-smoke-all-tools.js`（`npm run smoke:ui`），真机上把 20 个速算器 + 21 个完整测算各算一次，只问三件事：出不出数 / 抛没抛异常（页面级 error 一并收） / deep 那枚时效徽标在不在。三条边界：不写留痕（跑前拍 localStorage 快照、跑后整份还原 —— 41 次测算灌进历史，历史就不再是「我算过什么」，后面拍基线也会被污染）、只报不修（失败退出码 1）、复用基线底座与浏览器会话（全新会话要拉 6 个外网 CDN，冷启动实测卡 7 分钟以上）。验收：41/41 出数、零页面级异常；唯一「有政策版本但无时效徽标」的是 classification（19-12 已知缺口，政策库无分类所得条目），缺口每次冒烟都列出 —— 悄悄多出几个就说明有人新增 spec 忘了挂 policyKey。**盘点结论（防再误判）**：效率层早已全部交付 —— 模板 / 台账 / 批量 / 参数记忆与草稿 / 「与上次差 ¥X」/ 税务日历与首页待办 / 首页台账卡；批量也不是「只算工资表」（工具下拉已放开到全部 20 个速算器，每行都走同一个 tool.compute）。plan 里剩下的要么**刻意不做**（常用置顶；待办 × 台账 —— 拿用户自己标的 status 去催人会变成瞎催），要么**要后端**（主体跨设备同步、登录后随档案同步）：都不该由前端单方面拍板。本版只加脚本、文档与 npm script，不动产品代码，视觉基线无需重拍。

---

## 📜 前端功能演进记录（历史 · 对应发布版本 v1.1.0 → v1.3.0 期间，详见 CHANGELOG.md）

### 个人中心仪表盘化

**布局重构**:
- 将个人中心从单页布局改为仪表盘模式
- 各功能模块作为独立卡片入口（计算历史、税务档案、数据管理、税务日历、使用帮助、关于我们）
- 添加数据统计卡片（计算次数、档案数量、历史记录、本月提醒）
- 卡片悬停效果和页面过渡动画

**独立页面**:
- 账户设置页面：个人信息、修改密码、注销账号
- 税务档案页面：设置常用扣除配置
- 数据管理页面：JSON/CSV导出
- 税务日历页面：关键时间节点提醒

### 弹窗系统统一

**动画效果**:
- 所有弹窗统一使用淡入+缩放动画（300ms过渡）
- 打开：`opacity-0` → `opacity-100`，`scale-95` → `scale-100`
- 关闭：`opacity-100` → `opacity-0`，`scale-100` → `scale-95`

**样式区分**:
- Alert弹窗：白色背景，四种类型图标（✅/⚠️/❌/ℹ️）
- Confirm弹窗：白色背景，确认/取消操作
- About弹窗：蓝色渐变头部，品牌展示
- Help弹窗：蓝色渐变头部，标签页切换，自定义滚动条
- Login/Register弹窗：蓝色渐变头部，用户认证

**全局函数**:
- `openModal(modal)`：打开弹窗（带动画）
- `closeModal(modal)`：关闭弹窗（带动画）
- `showAlert(message, type, callback)`：显示提示弹窗
- `showConfirm(message, onConfirm, onCancel)`：显示确认弹窗

### 入口统一优化

**删除的入口**:
- 底部导航栏的历史记录按钮
- 底部导航栏的关于按钮
- 导航栏下拉菜单中的计算历史链接
- 导航栏下拉菜单中的退出登录链接

**保留的入口**:
- 个人中心仪表盘的所有功能入口
- 个人中心的退出登录按钮

### 性能与稳定性

**性能优化**:
- 合并重复的历史加载函数
- 添加API缓存机制
- 使用DOM Fragment优化渲染性能

**稳定性修复**:
- 修复函数作用域问题，弹窗函数暴露到全局
- 修复空输入的Number parsing vulnerability
- 修复JWT中间件未区分token过期和无效
- 添加个人中心加载状态10秒超时机制

### 历史：社保与倒算优化（原内部版本 v1.18.0 记录）

### 社保缴费基数优化

**默认值设置**：
- 所有社保缴费基数和住房公积金基数默认值改为4250元/月（国家最低标准）
- 页面加载时自动使用默认基数计算社保金额
- 重置函数重置后自动计算社保金额，确保数据一致性

**验证功能**：
- 新增基数验证函数 `validateSocialSecurityBase()` 和 `validateHousingFundBase()`
- 当输入的社保/公积金基数低于4250元时，显示红色警告提示
- 支持正向计算和反向倒算两个页面

### 反向倒算目标选择优化

**交互改进**：
- 将"希望缴纳的税额"和"希望到手的金额"改为下拉选项切换
- 默认选中"希望缴纳的税额"
- 选中一个选项时，自动隐藏另一个输入框
- 添加前端验证，确保用户只填写一项

**计算逻辑修复**：
- 按目标税额倒算均衡模式使用二分法计算的基准值，而非档位中间值
- 修复经营所得同样的均衡模式问题
- 修复 `taxDifference` 字段在到手金额模式下显示无意义值的问题

### 经营所得工作月数功能

**新增功能**：
- 经营所得计税页面新增"年工作总月数"下拉选择框（1-12个月）
- 默认选中12个月
- 投资者减除费用按实际工作月数计算（5000元/月）
- 专项扣除（社保/公积金）按实际工作月数计算

**计算公式**：
- 投资者减除费用 = 5000 × 工作月数
- 专项扣除年度金额 = 月度金额 × 工作月数

---

## 🚀 v1.4.0 上线执行记录（计划制定于 2026-09-05，已于 2026-09-05/06 全部执行完成）

> 本节保留为上线计划存档。存档快照版本 **1.5.0**（2026-09-06：忘记密码自助找回、注册协议勾选、登录记住我、协议/隐私弹窗交互重构）；截至 2026-09-07 已演进至 **v1.6.0**（1.5.2 SW 瘦缓存 + 1.6.0 反馈/埋点/管理员接口），全量变更见 [CHANGELOG.md](../../CHANGELOG.md)。

### 一、现状评估

**✅ 已具备（生产就绪）**：后端 Express（0.0.0.0:3000）、静态服务+SPA回退、安全HTTP头5项、请求体1MB限制、JWT+bcrypt、`/health`、Swagger、Prisma、203 单元测试、Dockerfile。

**7 个关键阻塞点（2026-09-06 全部闭环）**：

| # | 缺失项 | 严重度 | 状态 |
|---|--------|--------|------|
| 1 | 生产数据库用 SQLite | 🔴 致命 | ✅ 已解决（PostgreSQL 迁移 `20260905_init_postgres`，Dockerfile 启动自动 migrate deploy） |
| 2 | JWT_SECRET 占位符 | 🔴 致命 | ✅ 已解决（Zeabur 环境变量强随机密钥，生产校验拒绝弱密钥） |
| 3 | CORS_ORIGIN = `*` | 🟡 高 | ✅ 已解决（Zeabur 面板配置 CORS_ORIGIN 限定域名） |
| 4 | 无前端构建步骤 | 🟡 中 | ⏳ 暂缓（原生JS可直接部署，>100用户后再本地构建 Tailwind） |
| 5 | 无速率限制 | 🟡 中 | ✅ 已解决（express-rate-limit：登录 10 次/15分、验证码 5 次/15分/IP） |
| 6 | 无 HTTPS 强制跳转 | 🟡 中 | ✅ 由 Zeabur 平台自动提供 |
| 7 | 无日志持久化/告警 | 🟢 低 | ⏳ 后续（复用 ops-notify.ps1 邮件通知思路；Zeabur 面板已有运行日志） |

### 二、MVP 形态

**定位**：个人税务预算规划工具（个人纳税人 / 个体工商户 / 自由职业者）
**架构**：前端SPA（Tailwind+原生JS） + Express API（REST+JWT） + PostgreSQL

### 三、推荐平台：Zeabur（首选）

**理由**：原生 Node 服务零改动即可部署（根目录 `Dockerfile` 构建）；国内可访问；一键 Postgres；自动 HTTPS+Git 部署。

**环境变量（已全部配置）**：`JWT_SECRET=<强随机>` / `DATABASE_URL=<Zeabur 注入>` / `CORS_ORIGIN=<分配域名>` / `NODE_ENV=production` / `ADMIN_TOKEN=<运营后台令牌>`

### 四、7 步上线流程（执行记录）

#### 阶段 A：代码层修复 ✅ 已完成

**步骤 1**：迁移 Prisma 到 PostgreSQL ✅
- [server/prisma/schema.prisma](../../server/prisma/schema.prisma) 生产 `provider = "postgresql"`；本地开发保留 `schema.dev.prisma`（SQLite）
- 生产迁移文件 `20260905_init_postgres` 已入库，Dockerfile 运行时自动 `prisma migrate deploy`

**步骤 2**：部署入口 ✅ —— 早期 `zeabur.json`（`${VAR}` 引用）已废弃并从仓库移除，改为根目录 `Dockerfile`（Zeabur 自动识别）

**步骤 3**：生产校验 + rate-limit ✅（已落地于 [app.js](../../server/src/app.js)）
```javascript
if (process.env.NODE_ENV === 'production') {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'your-random-secret-key') { ... exit(1); }
    if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('dev.db')) { ... exit(1); }
}
app.use('/api/auth/send-code', codeLimiter);   // 5 次/15分/IP
app.use('/api/auth/', authLimiter);            // 10 次/15分
```

#### 阶段 B：部署上线 ✅ 已完成（2026-09-05）

**步骤 4**：GitHub 推送 + Zeabur 绑定 → 添加 PostgreSQL 服务 → 填 JWT_SECRET ✅
**步骤 5**：域名 + HTTPS（`https://euriskotax.zeabur.app` 已生效）✅
**步骤 6**：自检 → `/api/docs` 可见 + `/health` 返回 ok + 注册/登录/受保护接口全链路通过 ✅

#### 阶段 C：首批测试用户运营（进行中，阶段 8 —— 发放前置已就绪 2026-09-11）

**步骤 7**：4 渠道冷启动（素材已备，见 [marketing/cold-start-materials.md](../marketing/cold-start-materials.md)）
- 即刻/V2EX/少数派发帖 → 30-80 人
- 知乎税务话题 → 50-100 人
- 小红书实测笔记 → 100-300 人
- 微信社群裂变 → 50-200 人

**邀请码机制（2026-09-06 升级为「一机一码」）**：~~固定码 `EURISKO2026BETA`~~ → `EURISKO-XXXX-XXXX` 随机码，表内校验、一次性使用、事务原子消耗；服务启动表空自动生成 20 个兜底
**反馈闭环** ✅（v1.6.0）：`POST/GET /api/feedback` 落库 + 个人中心"意见反馈"卡片；管理员 `GET/PATCH /api/feedback/admin` 列表与状态跟进（X-Admin-Token）；GUI 一键邀请码管理

**发放前置核对（2026-09-11）**：线上 `v1.7.1`（`ops-check-prod` 23/23 指纹全绿）· 本地门禁 `verify:local` 52/52 · 生产可用邀请码 **30 个（已用 0）** · 注册用户 2 个（均为 09-05 早期号）· 计算埋点 0 · 反馈 0 条 → 注册（邮箱验证码 + 一机一码）、反馈落库、运维后台四条链路均已验证可用，邀请码余量充足，**可直接开始发放种子用户**；发放后转入 Day 10-11「观察数据 + 收集反馈」

### 五、Definition of Done

**🔴 必做**：~~Prisma 迁 PostgreSQL~~ ✅ / ~~部署入口（Dockerfile 替代 zeabur.json）~~ ✅ / JWT_SECRET 强密钥 ✅（Zeabur 环境变量已配）/ CORS 限定域名 ✅ / 生产不触发 reset-dev-user.js ✅（生产走 Dockerfile `CMD`，reset 仅本地启动脚本使用）

**🟡 建议**：~~express-rate-limit~~ ✅ / ~~用户反馈接口~~ ✅ / ~~邀请码~~ ✅（一机一码）/ ~~用户协议 + 隐私政策~~ ✅（2026-09-06 注册弹窗已实现）/ 错误日志聚合 ⏳ 后续

**🟢 后续（>100用户）**：Tailwind 本地构建 / Cloudflare CDN / 数据库备份

### 六、2 周时间表（执行进度 2026-09-06）

```
Day 1-2：代码层修复（Prisma + 部署入口 + rate-limit + 自检）✅ 已完成
Day 3：  Zeabur 服务器购买 + 部署 PostgreSQL + 应用 + 环境变量 + 域名 ✅ 已完成
Day 4：  邀请码机制 ✅ + 反馈接口 ✅ → 数据埋点 ✅（2026-09-07：匿名计算埋点 + 反馈落库 + overview 改读聚合表 + 管理员反馈跟进接口）
Day 5：  注册全流程完善（邮箱验证码 + 一机一码）✅ 已完成（2026-09-06）
Day 5-6：PWA 离线化改造（阶段9）✅ 代码完成，本地验证通过
Day 6-7：准备冷启动素材 ✅ 已备（marketing/cold-start-materials.md）
Day 8-9：内测 5-10 种子用户 → 即刻/V2EX 发帖 + 放开邀请码发放  （阶段8 进行中；2026-09-11 前置就绪 → 发放中）
Day 10-11：观察数据 + 收集反馈
Day 12-14：迭代修复 + 准备第二轮推广
```

### 关键决策点

| 决策 | 结论 | 状态 |
|------|------|------|
| 数据库 | PostgreSQL（本地开发 SQLite） | ✅ 已上线（迁移文件已入库） |
| 部署平台 | Zeabur（Tencent Tokyo，$3/月，ZeaburOS，Dockerfile） | ✅ 已上线（2026-09-05） |
| 商业模式 | 前端离线计算免费 + 云端专业版 + B端API | ✅ 已定调（见商业模式章节） |
| 上线节奏 | 内测→公测 | 进行中（阶段8） |
| 用户增长 | 邀请码裂变（一机一码） | ✅ 机制已实现（2026-09-06） |

---

*v1.4.0 上线计划制定时间：2026-09-05 · 执行完成：2026-09-06*
