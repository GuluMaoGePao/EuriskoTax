
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
| 阶段16：迁移与合规升级 | ⏳ 待开始（**前置：ICP 备案通过**；16D B 端 API 另依赖阶段15 的 15B 企业税种）迁腾讯云国内节点（Zeabur 转预发）+ 官方支付（微信/支付宝）+ 微信小程序 + B 端 API。方案见 [stage16-migration-and-compliance-plan.md](./stage16-migration-and-compliance-plan.md) | 3周+ | 预计 —
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

4. **迁移与合规升级（阶段16）** ⏳ 待开始（前置：ICP 备案通过）
   - **已拍板（2026-09-16）**：备案域名 = `euriskotax.com`（canonical / sitemap / robots 届时从 `euriskotax.zeabur.app` 一次切换，切换脚本已备好：`tools/ops/set-canonical-domain.ps1 -Apply`，85 处）；**暂不开线上收费**，官方支付（微信/支付宝）继续顺延，兑换码线下发放模式不变（`tests/filing-compliance.test.js` 有「无在线支付入口」守卫）
   - **迁移执行包已就绪（2026-09-16）**，位于 `deploy/lighthouse/` + `tools/ops/deploy-lighthouse.ps1`，操作手册见 [../tech-reports/lighthouse-deployment-guide.md](../tech-reports/lighthouse-deployment-guide.md)：
     - `deploy/lighthouse/docker-compose.yml`：生产三件套（PostgreSQL 仅内网 / 应用容器启动自动 `prisma migrate deploy` / nginx 反代 80，443 块预写注释）
     - `deploy/lighthouse/nginx/default.conf`：反代 + gzip + 安全头；签发证书后取消 443 注释
     - `deploy/lighthouse/.env.example`：`POSTGRES_PASSWORD` / `JWT_SECRET`（`openssl rand -hex 32` 生成）/ `ADMIN_TOKEN`（**与 Zeabur 现值一致**）/ `CORS_ORIGIN`（IP 测试期 `*`，切域名日收紧为 `https://euriskotax.com`）
     - 部署命令：`powershell -File tools/ops/deploy-lighthouse.ps1 -ServerIp <公网IP>`（打包 → scp → 构建 → `/health` 健康检查；服务器需先备好 `.env`）
     - ⚠️ 脚本为中文内容，已按仓库规范带 UTF-8 BOM（Windows PowerShell 5.1 无 BOM 读中文脚本会乱码炸）
   - **待执行时间线**（备案通过为切换日）：
     1. 备案通过当天：备案号填入 `src/js/ui/site-filing-ui.js` 的 `icpNumber`（页脚全站生效）→ 发版
     2. 轻量服务器首次部署（IP 直连测试）+ 数据迁移：Zeabur PostgreSQL `pg_dump -Fc` → `pg_restore --clean --if-exists`，核对兑换码/留资数量（手册第 3 节）
     3. 腾讯云 DNS 加 A 记录 `@ → 轻量公网IP` → certbot webroot 签发证书 → 启用 443 → 收紧 CORS
     4. 本机 `set-canonical-domain.ps1 -Apply` 全站切域名 → 全量测试 → 发布 → 旧域名 301（Zeabur 设 primary domain）
     5. 上线 30 日内：公安备案（主动办理）；稳定 1–2 周后再决定 Zeabur 去留
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
   - 已交付：19-0 样式沙箱层 + 视觉回归截图基线（24 张）/ 19-1a 令牌迁回真源 / 19-1b Tailwind 产物纯重建 / 19-1c 全站阴影收口到 `--sh-*` 五角色 / 19-1 验收（对比度达 AA，含 admin.html）/ 19-2 首页双轴重构（v1.82.0）/ 19-3 工具页降载（v1.83.0）/ **19-4 速算器结果页双栏（v1.84.0）** / **19-9 效率层 E1 主体 + E2 参数模板（v1.91.0）** / **19-10 效率层 E3 台账（v1.93.0）**
   - 19-2 遗留：「最近计算 → 我的方案 / 台账」的**模板与台账两半都已落地**（19-8 记忆 + 19-9 模板 + 19-10 台账）；
     「漏填提醒」仍依赖后续人对账的判断，未随台账一起上；身份卡真正「设置默认视图」依赖 19-7 双视图
   - ⚠️ 施工约束：`src/css/admin.css` 仍不可复现 → **不要整条跑 `build:css`**（只跑 `tailwindcss -i src/css/tailwind.src.css -o src/css/tailwind.css --minify`）；改样式后先用截图 `--check` 定位变化区域，确认后再固化基线
   - 详见 [stage19-ui-redesign-plan.md](stage19-ui-redesign-plan.md)

### 技术文档

- API文档：http://localhost:3000/api/docs
- 数据库模型：`server/prisma/schema.prisma`
- 源代码：`server/src/`
- 计税规则：`docs/guides/tax-calculation-rules.md`

---

*文档创建时间：2026-05-25*
*最后更新：2026-09-22（**v1.93.0 当前基线**：门禁 **259/259**、单测 **102 套件 1927 例**、线上指纹 **37 项**）——本版「阶段19-10 效率层 E3 台账」：重复报税的真实形态是一件事**每月做一遍**（同一工具、同一口径、同一主体），历史能留住每条流水，却答不了"这个月还有哪件事没办"、也说不了"跟上个月一样的参数再来一遍"。台账补的就是**期间 × 主体 × 进度**这一层。**做成第二份存储是最容易走的那条路，这一版刻意没走**：历史是本体，`ledger-store.js` 是它之上的索引，索引里只存历史自身查不出来的三样东西 —— ① 期间默认从记录自己的 `date` 推（它本来就写着"什么时候算的"，再抄一份两边迟早不一致：改了期间后索引说这个月、date 说上个月，听谁的？），**只有用户显式改过**才写覆盖值；② 主体只能存索引（`attach` 默认取当前主体）；③ 状态（已算 / 已导出 / 已申报）是"办到哪一步"，不是测算的一部分。这么分工的收益碰上线才知道：索引读坏了期间能从 `date` 重建、主体与状态丢了只是少一层标注，**历史一条不少、一个数都没改**。写入点只有两处（速算器与 `tax-calculator.js` 的 `saveToHistory`）—— **保存即入账**，这是**有意偏离 plan 原文**的一处：原话是"结果页行动条改为「存为模板 · 加入台账」"，但上一版刚把行动条上那颗只负责回工具页的第四颗撤掉，再加回来就是自打脸；归档跟着保存发生，要改期间 / 状态 / 归属去台账弹窗改。`data-management.deleteHistoryRecord` 也连了线：历史删了台账那行跟着走 —— 留下来就是一排"点进去什么都没有"的幽灵行。界面 = 工作台组第三张卡「我的台账」→ 台账弹窗（按月分组、每行的期间与状态就地改、**有上月账的行才给「复制上月」**），权益只影响**看几个月**（免费近 3 个月、专业版不限），更老的一条都不删 —— 门槛设在视野上而不是数据上，因为删掉的数据用户没法自己变回来。不做：往申报台再走一步（申报表 / 回执 / 对接税局是另一个产品，`status` 只是用户给自己看的标记，系统不根据它做任何事也不催任何人）、跨设备同步台账（要后端）、**首页「台账待办」小卡**（plan 原文"台账未申报项 × 税务日历"那一环留到下一版 —— 它得先答清"什么算待办"，现在做等于替用户判定，会把记账变成瞎催）。上一版 **v1.92.0**（门禁 **259/259**、单测 **101 套件 1913 例**、线上指纹 **37 项**）——「入口清理」：**同一份数据不摆两处，行动条不放复制品** —— ① 撤掉首页「最近使用」卡：它与工具页第一组「最近使用」读的是**同一份 localStorage**，等于同一份数据在两个地方各显示一遍，而首页紧接着还有「最近计算」卡，连着三张都在讲"你最近算过的"；回访入口保留在工具页那一组（要找下一个工具本来就要进工具页），**「清空」跟着搬到组内** `#toolbox-recent-clear` —— 挂在组内而不是组头上，因为组头本身是颗 `<button>`，往里面塞按钮会变成嵌套 button、键盘与读屏都会错乱；不补回来的话列表只能靠新记录挤掉旧的，那不是收敛入口，是丢功能。② 结果行动条第 4 位不再放纯导航：原先"没有同名完整测算"时这一位是「换个工具」，点下去 `showPage(TOOLS_PAGE)`，与页面左上角那颗返回箭头**同一个目的地**、同屏出现两次；现在这一位只承认"再往前一步"的内容（有同名完整测算 → 「按年填全的完整版」／有相关工具 → 「算完还能干什么」跳到下文推荐区／都没有 → **这一位空着**，宁可三按钮是真的三个出口，也不要第四颗来复制左上角）。③ 删掉一条假接线：`home-ui.js` 里的 `refreshRecentTools()` **全仓没有定义**，`typeof` 判空让它永远安静地跳过，那条礼貌的 `try/catch` 掩盖了一个从不执行的分支。动刀前先把"是不是真重复"钉清楚：顶部 Tab 与底部 Tab 是**同一状态的两种投影**（手机拇指区 vs 桌面导航在上）；工具页 4 张静态 mode card 与动态追加的 21 个 spec 入口由 `renderDeepEntries()` 按 `t.id + '-mode-card'` 排重、两边不重叠；升级入口仍只有顶栏 pill 与权益进度条两处 —— 这些看着像重复其实不是，一律没动。上一版 **v1.91.0**（门禁 **259/259**、单测 **101 套件 1912 例**、线上指纹 **37 项**）——「阶段19-9 效率层 E1 主体 + E2 参数模板」：新增 `src/js/data/entity-store.js` + `src/js/data/template-store.js` + `src/js/ui/entity-ui.js` —— 19-8 的参数记忆解决的是「**上一次**填的值」，但重复报税的真实形态是「**同一批人对好几份不同的参数**」（自己 + 代账的几家客户 / 公司 + 个体户），那些值不是「上一次」而是「**某一份**」，所以记忆之外还需要两件事：给这批参数**起名字存下来**（模板）与给它们**归个类**（主体）。主体刻意钉死成**只有名字 + 备注的标签** —— 不参与计算、不注入任何字段、没建主体时顶栏那块 DOM 一个字都不留；一旦给它带上属性（税号 / 征收方式），它就必须参与默认值推导，「为什么默认这样算」就有了第二个答案。两条硬边界：① 模板**存入与取出都按注册表字段表白名单过滤**（跨版本字段会变，留着未知键就是给未来的自己埋雷）；② 模板记的是**此刻表单全量**，含当前没显示出来的条件字段（显示层按口径收起，存储层不收）。接入三处：顶栏主体切换器（无主体整块隐藏）/ 工具页「从模板填充」折叠条（没模板整条不出现，用原生 `<details>` 自带键盘）/ 结果行「存为模板」（**失败必须把原因说出来**，静默失败等于让用户以为存了、下次来看不见）。踩坑三条：① **套用模板不能整表单重建** —— 原 `build()` 每次按 seed 重画，用户改个 select 就把旁边已填的数字冲掉了，加 paint-diff（`curValues / painted / paintedKeys`）只重画「上一次真画到 DOM 且被用户改过」的项；② **删主体不能顺手删模板** —— 会变成「还在但界面永远看不到」，detach 放进数据层（`entity-store.remove` 内调 `templates.detachEntity` 转回全局）而不是 UI 里，凡是「换个入口改这块数据」的路径，UI 层的调用者都会忘；③ **Pro 判定在测试里假红** —— 只 mock `EuriskoPlan.isPro` 不够，`apiClient.getCurrentUser()` 拿不到用户会走到本地 owner 分支把 ownerId 串到下一个用例，`beforeEach` 必须连 `window.apiClient` 一起删。守护测试 `tests/entity-template.test.js` 12 条（零感知 4 / 对拍 2 / 界面 2 / 额度 3 / 挂载 1）。不做：主体业务化、跨设备同步（要后端）、台账与批量（留给 19-10 / 19-11，也不在个人中心留占位卡 —— 占位卡点了没反应比没有更糟）。上一版 **v1.90.0**（门禁 **259/259**、单测 **100 套件 1900 例**、线上指纹 **37 项**）——「阶段19-8 效率层 E5：参数记忆 / 键盘 / 复制为表格 / 带参链接」：新增 `src/js/ui/param-memory.js` —— 进工具自动带出上次输入，三条边界是「只在**算得出来**时记」（记一份算不出结果的参数，下次带出来就是页面坏了）、「只记能原样还回去的值」（NaN 一律丢，还原出来是空框等于记忆记错了）、「带出必须说出来 + 给一个清空」（静默替换默认值，用户会以为是自己填的，最后把账算在算法头上）；优先级 = 调用方带进来的（历史查看 / 带参链接）> 上次输入 > spec 默认值；完整测算那份「草稿」记的是**没算完的半截 + 走到第几步**，两者分工不混（速算器一屏算完，没有半截这回事）。新增 `src/js/ui/param-link.js` —— `?t=<工具>&p=<参数>` 零后端把「这个工具 + 这组输入」变成一串 URL（发同事复核 / 存书签当月度模板 / 换设备继续），边界是未知工具不打开、只收注册表声明过的字段（链接是外部输入，不按字段表过滤等于开一个任意参数注入的口子）、不改地址栏。键盘可全程无鼠标：速算器回车跳结果、向导回车下一步、数字框 `inputmode="decimal"` 弹九宫格、**结果步不接管回车**（接到保存上，会让只想换行的用户把一条结果存进历史）。「复制为表格」输出 TSV 且金额是**裸数字** （带 ¥ 会被 Excel 认成文本，贴进去不能求和，那这个按钮就白做了）。常用置顶**不做** —— 工具页第一组「最近使用」已按使用顺序给出 6 个（19-3；阶段19-10a 起只此一处，首页那张同名卡已撤），再叠一层置顶就是两套排序。上一版 **v1.89.0**（门禁 **259/259**、单测 **99 套件 1881 例**、线上指纹 **37 项**）——「阶段19-7 视图密度（简明 / 完整）§3.9 ①②」：新增 `src/js/ui/mode-pref.js`（`window.EuriskoModePref`）：默认简明、游客可用、就地切换即时生效并记住偏好；命名只描述**内容密度**（不叫「新手模式」—— 那个叫法会让 80% 的人为自尊直接关掉，从而永远看不到自己需要的参数）；模式只影响 3 件事（字段可见性 / 结果展开深度 / 完整测算步骤），**绝不影响**计算口径与可用工具范围 —— 这是防止一个产品长成两个产品的护栏。registry 只增 `level` 字段（默认 basic），先给 6 个高频完整测算各标 1 个 advanced **步**（速算器一个都没标 —— 它们只有 2~5 个字段且全部必填，分级只会把必填项藏起来）；简明视图把 advanced 步**合并**成一步「补充参数（可选）」而不是删掉，advanced 字段收进「⚙ 更多参数（可选）」折叠块且**永远留在 DOM 里**（折叠 ≠ 删除，所以切换视图不丢已填的值）；入口是速算器页 / 完整测算页右上角那颗 pill（两处共用同一份 HTML，不写第二套措辞）+ 我的 → 账户设置 + 算满 3 次才问一次的轻提示。再上一版 **v1.88.0**（门禁 **259/259**、单测 **98 套件 1872 例**、线上指纹 **37 项**）——「阶段19-6b 我的页：权益进度条 + 资产概览 + 功能按场景分组（§3.6 ①②③）」：权益进度条 `#profile-benefits-card` 把"我是什么版本"换成"我用到了哪一步" —— 三格阶梯点亮到当前档，下面两行是真数（已用 N/M 套方案、云同步开没开 + 上次同步时间）；**进度条只表达档位在阶梯上的位置**，不表达"距离专业版还差百分之几"（基础版到专业版之间没有分母，任何百分比都是编出来的），取不到的整行不出现（不补 0 —— "已存 0 套" 会被读成"你一套都没存"），升级入口**未新增**（就是横幅那颗 `#profile-nav-upgrade` 搬了下来，全局仍只有 2 处）；资产概览四格全换 —— 原「计算次数 / 档案数量 / 历史记录 / 本月提醒」里两格**永远同一个数**（都读 `taxCalculationHistory.length`）、一格只有 0/1、一格只由当前月份决定，现为测算次数（本月 N 次）/ 已存方案 / 覆盖税种 / 上次测算，取不到一律「—」，最近一次按**时间**取最大（云同步合并后顺序不保证），「本月提醒」改挂税务日历卡的 badge；功能卡按场景分三组（我的数据 / 我的税务 / 服务与支持）。*对应项目版本：v1.78.0*

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
