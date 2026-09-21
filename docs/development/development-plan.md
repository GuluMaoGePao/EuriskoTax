
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
   - 已交付：19-0 样式沙箱层 + 视觉回归截图基线（24 张）/ 19-1a 令牌迁回真源 / 19-1b Tailwind 产物纯重建 / 19-1c 全站阴影收口到 `--sh-*` 五角色 / 19-1 验收（对比度达 AA，含 admin.html）/ 19-2 首页双轴重构（v1.82.0）/ 19-3 工具页降载（v1.83.0）/ **19-4 速算器结果页双栏（v1.84.0）**
   - 19-2 遗留：「最近计算 → 我的方案 / 台账」与「漏填提醒」依赖 19-9 主体 / 19-10 台账；身份卡真正「设置默认视图」依赖 19-7 双视图
   - ⚠️ 施工约束：`src/css/admin.css` 仍不可复现 → **不要整条跑 `build:css`**（只跑 `tailwindcss -i src/css/tailwind.src.css -o src/css/tailwind.css --minify`）；改样式后先用截图 `--check` 定位变化区域，确认后再固化基线
   - 详见 [stage19-ui-redesign-plan.md](stage19-ui-redesign-plan.md)

### 技术文档

- API文档：http://localhost:3000/api/docs
- 数据库模型：`server/prisma/schema.prisma`
- 源代码：`server/src/`
- 计税规则：`docs/guides/tax-calculation-rules.md`

---

*文档创建时间：2026-05-25*
*最后更新：2026-09-21（**v1.86.0 当前基线**：门禁 **259/259**、单测 **96 套件 1841 例**、线上指纹 **37 项** ——本版「阶段19-5b 与上次对比 + 完整测算接入档案引导（留存机制 §3.8 ③）」：同工具算到第二次，结果页出现对比卡（上次 ¥X · 这次 ¥Y · 少缴 / 多缴 ¥Z，取自 taxCalculationHistory —— 两次是同一口径同一个 compute，差额是真算出来的）；**比不出来就不显示**（没有上次 / 上次是别的工具 / 取不到税额），摆一张比不出差额的对比卡，用户会以为这里有过结论，那比没有更糟。没做成 plan 原文的「存为方案 A」是刻意的：方案库那张对比表只覆盖综合所得口径，速算器存进去后缺的指标会被 fmtValue 补成 ¥0.00 —— 那是假数据，宁可少一个入口。deep 结果步新增 #dw-profile-nudge，复用速算器那一份档案引导渲染（不抄第二份），卡内元素一律改成 class + 容器作用域定位（同页两张卡用全局 id 会互相覆盖 —— scenario-ui.js 早年被这个坑过）。上一版 **v1.85.0**（门禁 **259/259**、单测 **96 套件 1836 例**、线上指纹 **37 项**）——「阶段19-5a 税务档案完成度引导（留存机制 §3.8 ②）」：新增 `src/js/data/tax-profile.js`（身份 / 城市 / 社保 /专项附加扣除 / 年终奖 5 项，key `taxProfile`，存储写坏时降级为空档案不抛错），测算输入自动吸收但**只吸能确定的**（汇总的扣除金额不猜是哪几项、通用工具不猜身份 —— 猜出来的档案比没有档案更糟）；引导卡排在行动条之后、**每次只问缺的第一项**、点选即写入且进度条当场走动，「暂不」落盘后永久收声；目前只接速算器，deep 向导与「查看 / 修改」入口顺延到 19-5b / 19-6。再上一版 **v1.84.0**（门禁 **259/259**、单测 **95 套件 1813 例**、线上指纹 **37 项**）——「阶段19-4 速算器结果页双栏」：桌面 ≥1024px 左输入 sticky / 右结果（输入列 ≤420px，结果列取 `minmax(0,1fr)` —— 用 `auto` 的话长数字会把栅格撑破），**只做一份 DOM**、单列与双栏由 CSS 断点切换（两套结构必然有一套先烂），所有既有 id 原样保留（`share-card` / `quick-report` 都按 id 取数）；手机单列 + 结果吸底条（底部常驻主金额，点击 / Enter 回结果卡，只在 <1024px 出现，**算不出来时与行动条一起收掉** —— 留着上一次的金额是最坏的一种「看起来成功」）；行动条四按钮常驻（保存 / 导出 PDF / 复制结果 / 下一步），从「算完还能干什么」里搬出来独立成 `#quick-actions` —— 原先那一整块只在 `nextTools` 非空时才渲染，出口被别人的数据决定；「复制结果」给的是可带走的明文，并保留 `execCommand` 降级（微信内置浏览器没有 `navigator.clipboard`）。对比度审计 `main` scope 24 组 **0 处**（深色「保存到历史」白字 2.54:1 已修：实心底不能取 `--c-brand`，深色档它是文字色浅蓝，新增 `--c-btn-primary-bg` / `--c-btn-primary-ink` 两档同值）；截图基线 quick 四张重拍、其余 20 张零变化。上一版 **v1.83.0**（门禁 **259/259**、单测 **95 套件 1801 例**、线上指纹 **37 项**）——「阶段19-3 工具页降载」：41 个入口一次全铺开等于没有目录，故 6 个组（5 个场景组 + 完整测算）默认折叠、**只加 class 不重建 DOM**（重建会冲掉「最近使用」等动态区已绑好的事件，也会让静态 HTML 组的 4 张 mode card 全部失效），点组头展开并逐组记住（`euriskoToolGroupOpen`），「最近使用」组默认展开（只有几条，收起来等于把这层价值也收掉），组头由 div 改 button 并在折叠时写明「N 个」与干什么用，搜索命中或选中场景时强制展开（搜索结果与折叠状态不打架）；② 卡片状态微标签：算过 · N 天前 / 今天算过（读 `taxCalculationHistory`，与首页「最近计算」同一份）/ 热门 / 可对比（读注册表 `tool.hot` / `tool.comparable`），**刻意不做重排**以免每次位置都变、肌肉记忆作废，索引缓存在保存历史后失效；③ 进工具页就在桌面端聚焦搜索框（只在刚切进来那一次聚焦、手机不聚焦 —— 键盘一上来顶掉半屏而用户还没决定搜什么）；④ 截图基线 tools 四张重拍 —— `screenshot-kit.js` 的 prepare 补一步展开全部组（只摘 class、不写 localStorage），否则画面里只有 6 行组头、41 个入口与微标签一个都拍不到，等于把这张基线的价值也折叠掉了。对比度审计 `main` scope 24 组 **0 处**；截图基线 tools 4 张重拍、其余 20 张零变化。上一版 **v1.82.0**（门禁 **259/259**、单测 **95 套件 1787 例**、线上指纹 **37 项**）——「阶段19-2 首页双轴重构」：首屏从「我是谁」改为「你现在该办的事」—— ① Mission Hero 三态（首访 / 有历史 / 临近节点，判定在新增的 `home-mission.js`，只有年度汇算能升级成倒计时，否则月度预缴会让 deadline 态永久命中）；② 上轴 9 张事件卡用生活语言（发了年终奖 / 要卖房 / 被裁了…），第 8 张「开店 / 私活」先判定劳务报酬 vs 经营所得再进工具，任何断点都不折叠；③ 「我的税务资产」只给回访用户（待办 = 税务日历 × 已保存测算，年度概览 ≥2 次测算才出现，新客整卡隐藏）；④ 身份卡 5 → 6（「企业财务 / HR」拆成「财务 / 会计」与「HR / 薪酬」）。Hero 的底与字新增 `--c-hero-from/to/cta-ink` 三个令牌且**深色档取同一组深蓝**：深色档的 `--c-brand` 是**文字色**浅蓝，拿去当底白字只有 **2.34:1**，换 accent 底副文案也只有 **3.68:1**，CTA 跟着变浅蓝则成「白底浅蓝字」**2.54:1** —— 深色模式不等于把品牌色反色。对比度审计 `main` scope 24 组 **0 处**；截图基线首页 4 张重拍、其余 20 张零变化。上一版 **v1.81.1**（门禁 **259/259**、单测 **94 套件 1754 例**、线上指纹 **37 项**）——「补漏：admin.html 纳入对比度审计并修到达 AA」：`ui-contrast-audit.js` 新增 `--scope admin`（22 组 = 登录页 + 10 视图 × 2 断点 × 浅色；admin 无深色主题、`.dark` 挂上去也无对应 CSS 生效，跑了也是全同结果；静态服务无 `/api`，prepare 只做 DOM 显隐、不走 `switchTab()`，避开「加载失败」错误 toast 的噪声），首跑确定不达标 **83 处 / 去重 19 处**、修完复跑 **0**。三类根因：① `text-gray-400` 压浅底（2.31~2.54:1，7 处唯一 + admin.js 渲染模板 74 处 → 统一 `text-gray-600`）；② `.page-desc` 的 gray-500 压 bg-gray-100（4.39:1，12 处 → 内联 `#4b5563` —— **入仓 admin.css 产物里组件类排在工具类之后**，与标准 Tailwind 输出顺序相反，同 specificity 时后者胜，想用工具类覆盖组件类**压不过**，实测复跑仍是 4.39 才发现）；③ 内容页「发布」按钮白字压 `bg-success`(emerald-500)（2.54:1 → 内联 green-700 `#15803d`：产物没有更深的绿实底类，且 admin.css 受 19-2 遗留限制不能重建）。**工具链两个坑**：强杀审计脚本会把 agent-browser 会话卡死（`open` 请求未收尾，同会话重跑挂在第一组、CPU 归零 —— 处置：连守护进程与无头 Chrome 一起清、再 `open about:blank` 预热）；长跑脚本用 `Start-Process` 重定向到文件收输出（走管道会假死）。此前 **v1.81.0**（门禁 **259/259**、单测 **94 套件 1754 例**、线上指纹 **37 项**）——「阶段19-1 验收」：**全站文字对比度达 WCAG AA** —— 新增 	ools/ops/ui-contrast-audit.js 走真机（复用截图基线的页面状态，getComputedStyle 取前景色 + 沿祖先链合成背景色，按正文 4.5:1 / 大字 3:1 判定），确定不达标 **45 处 → 0**、待人工 22 → 0（24 组 = 6 页 × 2 断点 × 2 主题）。三类根因：① 	ext-primary 的 hex 写死在 	ailwind.config.js，吃不到 	okens.css 的 .dark 换色（深色档 1.68:1，占 35 处）→ 只在 extend.textColor 里把它接到 gba(var(--c-brand-rgb,…), <alpha-value>)，**只换文字类**（bg / border / gradient 保持 hex：它们上面的白字若跟着变浅蓝会新造一批不达标）；② 深色档写死的浅蓝底（g-blue-50 等）配浅灰字 1.35:1 → 补 .dark 兜底表；③ 白字压在过浅的实色 / 渐变上（3.10~3.97:1）→ 逐处降一档或改不透明底（副色 blue-500→600、#dw-save green-600→700、助手头与结果区渐变起点 blue-500→600、深色 .mode-card-* 渐变起点由半透明改不透明、.dark .tip-card gray-700→800/900、个人中心半透明白底改 g-blue-900/…、分享图 CTA 补 dark: 变体、.mode-card-subtitle gray-500→600、.empty-hint 去掉 /70）。**两个必读的坑**：gb(var(--c-brand-rgb)/<alpha-value>) 与逗号码混写会**整条声明无效**并静默退回继承色（必须用旧式 gba(var(…), <alpha-value>)）；审计判定背景必须**由内向外、遇不透明层即停**（否则自带 g-white 的按钮会误报白字对白底 1.05:1）。**验收**：截图基线补齐**深色档**（24 张 = 6 页 × 2 断点 × 2 主题），浅色 12 张经像素差分确认变化均为预期换色（0.03%~4.6%，无布局位移）后重新固化；jest 1750 例 + 门禁 259/259。此前 **v1.80.0**：门禁 **259/259**、单测 **94 套件 1750 例**、线上指纹 **37 项** —— 该版「阶段19-3」：**全站阴影收口到 --sh-\* 令牌，焦点环统一** —— `tailwind.src.css` 里 **26 处硬编码 `box-shadow`（去重 22 种值）全部收口到 5 个角色**：`sh-1` 静态卡片 / `sh-2` 可点卡片与 hover / `sh-3` 抽屉、下拉、浮层、浮动球 / `sh-focus` 焦点环（原 `.12/.15/.2` 三种弱环统一到 `.35`）/ 新增 `sh-up`（吸底条**向上**投影——三档层次表达不了"方向"这一个维度，与 `sh-focus` 同理属特殊用途角色，不破坏"层次只有三档"）；`.profile-avatar-tile` 的 **inset 内阴影**是全站唯一"向内"，保留字面量并登记进 tokens.css 的「已知字面值」清单。令牌化顺带删掉四类重复代码：`.dark .input-field:focus` 重复规则、`.dark` 段逐条手写的深色阴影 ×6、移动端深色减影 `@media` 整段 ×4 条、`.dark .assistant-fab` 的投影重定义。**验收**：类级差分 **633 = 633**（零增零删，本次只改声明值没动任何样式挂钩）；jest 1750 例 + 门禁 259/259；截图 **12/12 有变化但像素差分定位到全部集中在右缘悬浮球的投影**（≤0.02% 像素，3 倍放大确认边界依旧清晰）——这是浅色模式唯一可感知的变化（浮动球投影归一到 sh-2）；**深色档的变化截图覆盖不到，深色模式需逐页人工过一遍**（19-1 计划的验收要求：深色阴影统一取 .dark 档"更黑"值，焦点环深色下自动换浅蓝，选中步骤光环并入 sh-focus 后更醒目）。基线已按新视觉重新固化（`--check` 确认改动区域后执行，非盲拍）。上一版 **v1.79.0**（**Tailwind 产物纯重建 —— 构建链路修对了** —— 入仓的 `src/css/tailwind.css` 是**过期产物**（本地重建不可复现），本轮**不改一行源码**，只把产物换成"当前源码的真实产出"，让后续动 `tailwind.src.css` 时 diff 里只剩自己的改动。**为什么不能只看 diff**：minified 是单行文件，diff 永远只有一行，什么都看不出来 —— 改用**类级差分**（抽类名集合 → 取差集 → 逐回查 content 是否被裸用）：将被删除的 **36 个类全部零裸用**（`result-hero*` `result-metric*` `result-pitfall*` `calc-preview*` `mt-[2px]` `h-64` `bg-accent` …），新增 6 个中 4 个是**文本扫描假阳性**（真身是 JS 取反表达式 `if (!step)` / `if (!label)`，被当成 `!` important 修饰的类名）、另 2 个 `list-disc`/`pl-5` 虽属真实渲染代码，但**目前没有任何 spec 提供 `extras.list`**，该分支从未渲染过 —— 故**零视觉变化**。**两条差点判错的坑**（下次照做）：回查的**左边界必须排除 `:` 与 `!`**，否则 `sm:gap-6` 会被当成用了裸 `gap-6`、`!pl-3` 当成裸 `pl-3`（第一版脚本因此误报 6 个，差点把安全重建判成危险）；`result-tax-bar-fill` 是 `getElementById` 的**参数**不是 class，Tailwind 照样扫到，别误删。**验收**：截图 **12/12 一致** + jest 1754 例 + 门禁 259/259 —— 三重证据指向同一结论。**剩一半没做**：`src/css/admin.css` 同样不可复现（52539 vs 51614 B），管理后台视觉验证成本更高，下一轮处理；在此之前**不要整条跑 `build:css`**（会把两条链路的变更混进同一次提交）。详见 CHANGELOG v1.79.0 与 `tools/ops/README.md`；上一版 **v1.78.0**（**令牌层收口与接线**，同样零视觉变化）—— §3.7 令牌从沙箱层迁回 `tokens.css` **真源**（它是 App 与 21 个落地页的唯一取值来源，令牌留在只对 App 可见的沙箱层则取两处必然漂移）；新增表面分层 / 结果语义 bg-line / 阴影三档 + 焦点环 / 画布色板四组，`--sh-focus` 刻意不在 `.dark` 重定义 —— 它取 `rgba(var(--c-brand-rgb),.35)`，深色早已把品牌色换成浅蓝三元组，焦点环自动跟随。接线从 `toolbox.css` 开始：4 类可点卡 hover 的字面品牌蓝辉光 → `--sh-2`；输入框聚焦 `rgba(30,64,175,.12)` → `--sh-focus`，透明度 .12 浅到看不见（**这一处是有意的视觉变化**，属交互态、不在截图里，需深色模式人工确认一次）；另 `runtime-env.js` 的 Webview 降级浮层取 `--sh-3`。**故意没动**三处：`seo/landing.css`（那处阴影早已 token 化，且落地页有意保留自己的版式 token）、`clean-cache.html`（独立单页、内联全部样式、不依赖 tokens.css）、`share-card.js`（那是长图**内容**不是 UI，且 html2canvas 对 CSS 变量支持不可靠）。**顺手补掉了基线的第五类噪声**：复查时两张 home 对不上，不是变丑而是问候语「上午好」→「中午好」—— 时间相关内容现在一同冻结（占位结构照抄真实渲染），冻结的是确定性不是真实性。**验收**：截图 **12/12 一致**，即这一版对静态页面**零像素影响**。**⛔ 挡路的发现（已于 v1.79.0 解除）**：入仓的 `src/css/tailwind.css` 是**过期产物**，本地重建不可复现（93664 B vs 98677 B）—— 入仓产物含 23 个当前源码已完全不存在的类，且缺 14 个新增的类，Tailwind 版本一致（3.4.17）不是原因；此刻重跑 `build:css` 会把产物整体换成真实产出，而 minified 单行文件的 diff 近乎全量、不可逐行审查。故 19-1 剩余部分（全站剩余 18 处阴影 / 深色档重调）暂缓，先单独立一轮做**纯重建**并对照三组列表审查，过真机 + 截图基线后再动实质内容，步骤见 `tools/ops/README.md`；详见 CHANGELOG v1.78.0；上一版 **v1.77.0**（基线：门禁 **259/259**、单测 **94 套件 1750 例**、线上指纹 **37 项**）：**给 UI 重构先装安全网** —— 阶段19 要动首页结构 / 结果页布局 / 令牌层，而本项目此前**没有视觉回归**（`tokens.css` 注释里写着这是 Tailwind 未变量化的阻力），故这一版不改任何视觉，只做三件事：① 新增 `src/css/ui-redesign.css` 样式沙箱层（排在 `tailwind.css` 之后引入，只增不改，出问题删一行 link 即可整体回滚，19-1 之前对页面**零作用**）；② 修正关于本站的过期文案「24 个」→「20 速算器 + 21 多步骤完整测算 = 共 41 个入口」（与首页搜索入口的「41 个 ›」打平）；③ 建视觉回归基线 `tools/ops/ui-screenshot-baseline.js` —— 6 个关键页面 × 2 个断点（375 / 1280）= **12 张入仓**，`--check` 重拍比对、变了才需要人眼确认。基线之所以能靠 sha256 比对（不引 pixelmatch 这类像素库），是因为截图前掐掉了四类时序噪声，每条都记在脚本注释里：动画 / 插入符 / 滚动位置；**跨轮次 storage 泄漏**（「最近使用」让首页 baseline 只在第一次是对的）；**滚动条**（只有 `home-375` 对不上、稳差 85B —— 差异全部落在右侧 x 357~374 这条窄带上，因为 1280 断点首页不超高、压根没有滚动条）；**外网 CDN 未就绪**（`index.html` 引了 6 个 CDN，图标是**字体**，字体没到就是空白方块）。已知限制：**浏览器冷启动会挂在第一张**（`open` 在等外网 CDN，实测 7 分钟不出图）—— 先用 agent-browser 把会话浏览器热起来再跑，已写进脚本头注释与 `tools/ops/README.md`。详见 CHANGELOG v1.77.0；上一版 **v1.76.0**（基线：门禁 **259/259**、单测 **94 套件 1750 例**、线上指纹 **37 项**）：**真机验收补跑 —— 顾问的情境里税率整段消失** —— 18-2 / 18-4 / 18-5 里唯一还没在真实浏览器上走过的两条路径补跑了一遍：18-2 真机通过（调 `viewHistoryRecord('1789829141241')`，记录 `type='vat-deep'` → 直接打开增值税结果步并载入输入，无「可能来自更新的版本」）；18-4 露出一个**jsdom 照不出来**的洞 —— `LeadContext.current('vat-deep')` 只返回「增值税」三个字，税率段没了：取行用的是 `[data-dw-row="实际税负率"]` **精确匹配**，而真机结果区的行名是**「实际税负率（占不含税销售额）」**（带括号后缀），三个候选行名全落空；jsdom fixture 用的都是不带后缀的行名，所以单测全绿 —— 阶段18 里第二次「单测绿、真机黑」（上次是 18-5 入口没挂上）。改法：精确匹配不到时**按前缀再找一次**（`[data-dw-row^="实际税负率"]`）。真机复跑：`current('vat-deep')` → **「增值税 · 实际税负率 4.86%」**，谈薪 `current('negotiation')` 仍为空（硬约束没被顺手改掉），`historyOptions()` 那条显示「增值税 · 2026-09-19」。守护 `tests/lead-context-coverage.test.js` 补第 5 条（手工造带后缀行名的结果卡，断言情境含「实际税负率 4.88%」且不夹带金额），变异（删掉前缀兜底）→ 该条红、其余绿。详见 CHANGELOG v1.76.0；上一版 **v1.75.0**「阶段18-5」：**21 个完整测算的分享图入口，一个都没挂上过** —— 上一版把「取数」修好（17 个完整测算算完能出图），但那是在 jsdom 里验的：测试直接调 `resolveConfig` / `collect`，**绕过了「按钮挂没挂上」这一步**。把应用真正跑起来（本地后端 + 真实 Chromium）一路点完增值税的完整测算，结果区**根本没有「生成分享图」按钮**。根因在触发器绑定：`bindTriggers()` 在页面加载时 `getElementById('dw-next')` 拿那一颗按钮 `addEventListener` —— 页面式时代 `dw-next` 是**静态 DOM**，绑一次管一辈子；阶段17 迁到 spec 驱动后向导每步都重新渲染，那颗按钮每次都是新的，加载时绑的那一颗早被替换掉，于是**连手写了取数配置的那 4 个也没有入口**（结果区只有保存 / 导出 PDF / 导出 Word）。改法与 `bindCtaClick` 同构：**事件委托**（认 id 不认节点）。守护 `tests/deep-share-coverage.test.js` 补第 4 条：21 个逐个**真的去点**「下一步」点到结果步，断言挂出了 `.share-card-btn`（每个等 180ms 注入，默认 5s 超时不够，放宽到 30s）；变异（把委托改成永远认不出按钮）该条红、前三条仍绿 —— 说明这条测的确实是「挂没挂上」而不是「取数对不对」，且它是**唯一**能拦住这个洞的守卫。真机验收（阶段18-5 的本来目的，顺带完成部分视觉回归）：后端（SQLite 开发库，`express.static` 一并托管前端）+ 真实 Chromium 走完增值税完整测算 →「生成分享图」→「分享图已生成」长图，标题**「增值税」**、主结果 ¥54,900.00、三行明细与结果区逐字一致（不含税销售额 / 销项税额 / 核定可抵扣的进项税额）；验收用的服务与浏览器全部停掉，工作区无残留。详见 CHANGELOG v1.75.0；上一版 **v1.74.0**「阶段18-4」：**17 个完整测算留资后，顾问看不出他算了什么** —— 留资弹窗会带一句「咨询情境」（如「企业所得税 · 实际税负率 5%」），顾问据此知道线索背后是哪一个测算；这句情境由 `LeadContext.current(type)`（结果页实时）与 `summarize` / `historyOptions`（本地历史下拉）产出，而它们的类型表**只写了 4 个**（forward / comprehensive / business / classification，又是阶段17 逐个迁移时就地补的那 4 个）。于是其余 17 个：**从结果页留资 → 认不出 type，情境卡整块不显示；从历史下拉选 → `SERVICE_TYPES` 白名单里没有，这条记录干脆不进下拉** —— 顾问只知道「有人留了资」。阶段18-2 刚让这些记录**打得开**，这一版让它们**说得清**。改法同构（名字与锚点由注册表兜底）：`nameOf(type)` 手写优先、注册表兜底、都没有就返回空（不编造）；缺锚点的照样取数（主结果一律 `wizard:primary`，税率行按「适用税率 → 实际税负率 → 税负率」试，**行名是什么就写什么**）；历史下拉的过滤从「白名单放行」改为「排除谈薪 + 认得出名字」（下拉是用户自己选的情境，不是推送引导）。顺带把一条**靠巧合撑着的硬约束**变成显式：谈薪此前 `current()` 返回空其实是「没给它配锚点」，通用锚点一加那个巧合就没了 —— 现由 `BLOCKED_TYPES` 显式挡在三处。**未改动**：`lead-touchpoints.js` 的引导投放白名单仍是 4 类（谈薪永不出，服务错配）——「算完要不要弹一次免费协助」是投放口径，是否扩到更多测算待你定。守护 `tests/lead-context-coverage.test.js`（3 例）+ 变异检验（三处均红）。详见 CHANGELOG v1.74.0；上一版 **v1.73.0**「阶段18-3」：**17 个完整测算算完也出不了分享图** —— 分享图是「用户即分发节点」的转化出口（阶段13D）：入口是通用的（`TRIGGERS` 里那颗 `dw-next` 是 21 个完整测算共用的「下一步」，所以每个都挂得出「生成分享图」按钮），但取数配置 `SOURCES` **只写了阶段17 逐个迁移的 4 份**（business / reverse / forward / classification）。其余 17 个点它时 `sourceKey()` 认不出就**退回裸键**（business 那份），而 selector 写死 `[data-tool-id="business"]` —— 卡上挂的是增值税，读到的自然是空，用户看到「暂无可分享的结果…请先完成一次测算」，**明明刚算完却被告知没算**。与上一版同一个病：按名字认人的配置表，每加一种形态就漏一批。改法同样是不再逐工具补配置（漏一个就静默），而是按卡上的 `data-tool-id` **现场取数**（`genericConfig()`：主结果取 `#dw-result-primary`、明细照 `data-dw-row` 抄前几行、标题取注册表里的工具名、谈薪仍走 negotiation 模板）；主结果的**含义**原先只能靠第一个 `.text-sm` 去猜，给结果卡加了 `id="dw-result-primary-label"`；明细行原先照 `textContent` 整取会把行标签一起抄进图上（「适用税率20%」），改为取行内最后一个 `span`（与 `lead-context.js` 同一处坑）。手写那 4 份仍在（它们是挑过行的，分类所得取的是实际税负率而非适用税率），只是不再兜底。守护 `tests/deep-share-coverage.test.js`（3 例：取数规则属于当前工具 / 写进图上的值不带行标签 / 明细行带归属锚点），并经变异检验（去掉通用取数、通用取数不认人、明细行改回整取 三处均如期变红）。详见 CHANGELOG v1.73.0；上一版 **v1.72.0**「阶段18-2」：**保存的记录打不开 —— 历史「查看」改为按注册表统一分发** —— 保存与导出早有测试守着，但「存进去之后点『查看』会发生什么」从来没测过：`viewHistoryRecord` 是按 `record.type` 分发的 else-if 链，只认阶段17 每次迁移就地加的 4 个（business / classification / reverse / forward），于是 **20 个速算器（type='quick'）与其余 17 个完整测算（type=tool.id）点开都弹「这条记录没有对应的测算入口，可能来自更新的版本」** —— 用户刚在本版保存的，却被告知可能来自更新的版本；更隐蔽的是那 4 个打开的是**向导草稿**而不是这条记录，又算了别的场景之后点老记录看到的是新场景的值。改法：按 `toolId` 查注册表统一分发（deep 交给向导并带上记录的输入、速算器交给 `openTool` 回填），`EuriskoDeepWizard.open` 支持 `{ values }` 并直达结果步，`fieldHtml` / `renderQuickPage` 支持按已有输入渲染；`comprehensive` 与老记录一并兼容，认不出时仍**说清楚而不猜**。守护 `tests/history-reopen.test.js`（4 例：先塞一份不同的草稿，再看界面上的数属于谁），并经变异检验。详见 CHANGELOG v1.72.0；上一版 **v1.71.0**「阶段18-1」：**index.html 的脚本装配守护** —— 页面靠 62 个 `<script>` 的**书写顺序**表达依赖，而此前没有一个测试按真实顺序装配过（每个测试只 eval 自己需要的那几个文件，`tests/helpers/load-source.js` 里只登记了 `solver → tax-calculator` 三条前置），v1.67~v1.70 新插的两个 `-quick.js` 是否装对位置无人验证。新增 `tests/index-assembly.test.js`（11 例）：按 index.html 的顺序在 jsdom 里 eval 全部经典脚本 → 断言无异常、注册表可用、**每个工具的 compute 在装配环境里真跑得出结果**（spec 的 `compute` 是运行时才取 quick 全局对象 `if (!Q) return null`，漏插 `-quick.js` 的表现是页面能开、卡片也在、点进去结果区是空的，而现有测试在自己 eval 好了全部 quick 的环境里永远绿）；守护自身经变异检验（删掉 `non-resident-quick.js` / `solver.js` 的 script 标签均如期变红）。详见 CHANGELOG v1.71.0；上一版 **v1.70.0**「阶段17 17E」：**经营所得减半公式的遗留清偿** —— 同一条政策（2023 年第 12 号，应纳税所得额 ≤200 万部分减半）此前在内核里被抄了 6 份，guard 写法各不相同、「等价」只是推断。严格按注释要求「**先补对拍、再统一**」：新增 `tests/business-halve-consistency.test.js`（17 例，独立参考实现 × 22 个应纳税所得额 × 7 条路径比对到分），再收敛为内核唯一入口 `businessHalveOf()`（200 万 / 50% 改读注册表 `businessIncomeRules.halve`），正向内核的五级定档也一并收敛到 `calculateBusinessTaxByTaxableIncome`。**主张先补网是对的 —— 网一撒上去就捞到两条真 bug**：① 税率表只有 `max` 没有 `min`，`targetBracket.min || 0` 恒为 0 → 税率倒算的保守模式无论选哪一档都落到最低档的 12000 元，还拿目标档税率算出**负数减免额**再减出去（选 35% 时税额 **31250 元**，比应纳税所得额本身还高）；② 最高档 `max` 是 `null` 不是 `Infinity` → 均衡模式算成下界的一半（落进 20% 档）、进取模式给 0 —— 这条是靠「返回结果的适用税率必须等于用户选的那一档」才咬住的，自洽型断言拦不住它。详见 CHANGELOG v1.70.0；上一版 **v1.69.0**「17D-13」：**非居民 / 无住所个人的完整测算（个税场景完整度 15/16 → 16/16，个税场景收官）** —— 它是**第三个没有同名速算器的完整测算**（id 直接用 `non-resident`）：即便同属个税，「月薪 + 五险一金 + 专项附加」那五个框默认这位是**中国税收居民**，而无住所个人进门要解决的第一个问题根本不是「扣多少」，而是「**这笔钱要不要在中国缴**」—— ≤ 90 天只对「境内工作 + 境内雇主支付或者负担」的重叠部分计税、90~183 天境内工作期间的**不论谁支付**都要缴、满 183 天但连续不满六年时境外支付的境外所得免税、连续满六年且无单次离境超过 **30 天**才全球征税（同一批工资实测 **6220 / 26620 / 53080 / 73080**）；非居民按**按月换算后的综合所得税率表逐月单独计税**（同一笔 24 万年收入额按月均匀发放 19080、集中到一个月发 **44280**，差 **25200**，而居民那张年度表根本不看发放节奏），数月奖金单独 ÷ 6 定档且不减费用（错把它并入发放当月会算出 **89580**，虚增 **62960**）。新增 `src/js/calculation/non-resident-quick.js`，门槛与参数读注册表声明的 `nonResidentRules`，月度税率表**复用**既有的 `bonusMonthlyTaxRates`（与年终奖单独计税同一张，不复制第二份），年度表走内核 `calculateTaxByTaxableIncome`；守护 `tests/non-resident-deep.test.js`（29 例），详见 CHANGELOG v1.69.0；上一版 **v1.52.0**「17D-1」：**劳务报酬预扣预缴的完整测算（个税场景完整度 4/16 → 5/16）** —— 它是第一个「自带 spec」的 `-deep`：速算器只认**一笔**收入，而预扣是**按次**的（两笔 2 万同月：合并为一次 4 万按 30% 档扣 7600、逐笔单独各按 20% 档共 6400，差 1200 元是**档位差**不是小数差），共享同一份 `fields` 等于把速算器复制一遍，故配对逻辑加「自带 `fields` / `compute` 的 `-deep` 不被孪生速算器覆盖」，口径同源改由「仍然调同一个 `withholding-quick.js`」+ 单笔输入的逐点对拍守护（`tests/withholding-deep.test.js` 17 例）；汇算用内核 `calculateTaxByTaxableIncome` 算**增量**而非速算器那种「收入额 × 边际税率」（跨档反例：其余综合所得 29 万 + 收入额 4.8 万 —— 按 20% 估 9600、按 25% 估 12000，真值 11500）；「属于同一项目连续性收入的以一个月内取得的收入为一次」这条法定口径做成界面开关并讲清「分着算更省但不是法定口径」，详见 CHANGELOG v1.52.0；**v1.53.0 另做 17D-2**：**年终奖择优**（个税场景 5/16 → 6/16）—— `bonus-tax` 收了「全年其他应纳税所得额」却在 `compute` 里一行没用到，subtitle 写着「单独计税还是并入综合所得更省」而实际只算了单独那一半；补齐两套口径真比一次、临界区给出「该定在多少」（36000→38567 等）、总额可切分时求最优分配点。详见 CHANGELOG v1.53.0；**v1.54.0 另做 17D-3**：**股权激励**（个税场景 6/16 → 7/16）—— `equity` 速算器只认**一个行权日、一个价差**，「一年内多次行权」只能靠标量 `ytdIncome` 手工先加好再填；完整测算按批次收（repeater）并合并成一个基数定档，量化「分次各自定档」少算的税（两批各 5 万：合并 7480 vs 分次 4960，**少算 2520**，那是汇算要补的数），补上 quick 里**没人用过**的递延纳税 20% 常量（非上市公司，财税〔2016〕101 号），并给出跨年度行权的切分（合并只在同一个纳税年度内成立）；另钉住一条反直觉知识点：年度表是超额累进，这里**没有**年终奖那种「多发 1 元到手变少」的雷区。口径仍走 `equity-incentive-quick.js`，新增 `tests/equity-deep.test.js`（20 例），详见 CHANGELOG v1.54.0；上一版 **v1.51.0**「17B-6」：**「方案对比」卡重建宿主** —— 页面式 deep 归零后它是唯一没跟着走的功能：取数靠 `collectTaxInputData()` / `collectDeductionInput()` 两个按 id 读表单的适配器，而那张表单随综合所得页面一起删了（第一个 `work-months` 就抛 TypeError，被 try/catch 吞成「读不到表单数据」）；改为**宿主注入**：forward spec 暴露 `toCalcInput`（与 `compute` 共用抽出的 `forwardCalc`，不为保存方案另写一份映射），渲染器见到钩子才挂卡片（其余 8 个 deep 没有）；顺手修掉「保存成功但方案是空的」（存进去的是 `input: null`）与「点完保存看到的是常驻文案」（`render()` 末尾那句盖掉了「已保存（1/2）」）；新增 `tests/scenario-rehost.test.js`（9 例），详见 CHANGELOG v1.51.0；上一版 **v1.50.0**「17B-4」：**分类所得由页面式迁到 spec 驱动的向导 —— 17B 收官，`index.html` 里不再有任何手写深度页**；先给渲染器补 `type:'repeater'`（动态增删所得条目，`itemFields` + 加/删按钮，控件 id `qf-<key>-<下标>-<子键>` 以复用既有 `fieldHtml` / 条件显隐，不另写一套类型转换），再写 classification spec（四类所得各自扣除口径 + **按次单独计税**，仍调 `calculateSingleClassificationTax` / `calculateClassificationTaxTotal`），最后删页面约 330 行 + `helper-functions.js` 706 行 + `draft-store.js` 345 行（含 270 行单测）+ 常驻预览条与 `field-hints` 的 `classification_*` 键（约 1,700 行）；**抓到的真问题**：`app.js` 里绑 `back-to-mode-selection-classification` 的那句随页面成了空指针 —— DOMContentLoaded 在它这一行抛错，**后面所有初始化（登录态、历史记录）全不执行**，界面看着正常、功能静默全残；另一处是修缮费每月 800 元封顶原先没解释，填 1500 看到 800 会被当成算错，现写进 hint 与 pitfalls（**超出部分结转以后月份**）；新增 `tests/classification-migration.test.js` 接住 `ui-result-compliance` 失去的页面条目（独立重算 + 端到端守免责 / `data-tool-id` / 分享图两个行标签 / repeater 增删）；**页面式 deep 归零**（`tests/tool-registry.test.js` 的 `pageBased` 断言等于空数组），详见 CHANGELOG v1.50.0；上一版 **v1.49.0**「17B-3」：**综合所得正向计税（forward）由页面式迁到 spec 驱动的向导**，旧页面 `forward-calculation-page`（index.html 约 970 行）连同 app.js 约 340 行接线、helper-functions 里 12 个页面私有函数（约 440 行）、data-management 的 `saveCalculationResult`（与 `saveToHistory` 重复实现）、draft-store 的 forward 草稿流、field-hints 的 `forward_*` 键、navigation-ui 的预览分支一并删除（约 1,900 行）；先把那份独有的**逐月预算表**抽成纯 tables 内核（`tests/budget-table.test.js` 先守），再由 `extras.table` 透传给 spec —— 第三步仍是「先抽内核再写 spec」这条路；27 个字段分三步，便利输入（婴幼儿分摊比例、学历/职业资格勾选）在删页**之前**就登记进 spec；`dw-result-card` 第三次带来认人问题（三个工具共用），加 `dw-result-card:forward` 一路 + `sourceKey()`；**页面式 deep 由 2 → 1**（只剩 classification），详见 CHANGELOG v1.49.0；上一版 **v1.48.0**「17B-2」：**反向倒算（谈薪）由页面式迁到 spec 驱动的向导**，旧页面 `reverse-calculation-page` 连同 app.js 约 400 行表单联动、helper-functions / utils / tax-calculator 里只读 DOM 的那一层、navigation-ui 的 `showReverseStep` 与预览分支、draft-store 的 reverse 草稿流一并删除（约 1,050 行）；迁移**前**先把「社保基数 × 比例 → 月缴额」这组便利输入登记进 reverse spec，并与 business 共用同一份钩子 —— 这次没让便利输入跟着页面一起消失；`dw-result-card` 被两个工具共用而模板不同（经营所得 income / 谈薪 negotiation），于是加 `dw-result-card:reverse` 一路 + `sourceKey()` 按 `data-tool-id` 认人；**页面式 deep 由 3 → 2**（剩 forward / classification），详见 CHANGELOG v1.48.0；上一版 **v1.47.0**「17B-1 收尾」：把经营所得旧页面（`business-calculation-page`）的**死代码清干净** —— index.html 853 行 + 计算层私有实现 + app.js 约 300 行表单逻辑 + 经营所得专业版报告，共约 1,150 行；对拍测试转为**按税法口径独立重算**的回归（页面版没了，左式不复存在），详见 CHANGELOG v1.47.0；更早 **v1.46.0**「17B-1 经营所得反向迁移」：**第一个由页面式迁到 spec 驱动的 deep**，抽内核 `calculateBusinessTaxCore` 让页面版与向导版共用同一份算法，并由逐点对拍证明口径未变，**页面式 deep 由 4 → 3**（剩 forward / classification / reverse）；更早 **v1.45.0**「17A-2 结果区与存量页面对等」（17B 的硬前置）（结论区带上「下一步动作」与「一句话理由」，层级重排为 金额 → 结论 → 理由 → 推导链（折叠）→ 注意点 → 明细（折叠，记住展开）→ 免责 → 操作；新增 `tests/result-narrative.test.js` 7 例锁死结论方向与 `#result-refund-tax` 同口径）；**同版另做 Phase 2.5 ① —— 通用单调求解器**（`src/js/calculation/solver.js`，详见 CHANGELOG v1.41.0 同名小节）：原来手写在 8 处的二分倒算（`tax-calculator.js` 6 处 + `net-salary-quick.js` / `employer-cost-quick.js` 各 1 处）统一走 `solveMonotone()` / `expandUpperBound()`，调用点只保留各自的判据与取整口径；此前 **v1.40.0**：推导链扩全流程（台账 C）：四个完整测算页推导链齐平（`utils.js` 抽出 `renderFormulaStepsHtml` / `showFormulaStepsPanel` **一套实现**，新增 `buildBusinessFormulaSteps` / `buildClassificationFormulaSteps` / `buildReverseFormulaSteps` 三个纯函数，`index.html` 三页各插一份折叠面板并由 `tax-calculator.js` / `helper-functions.js` 接线），速算器打样 1 个（月薪个税 `compute` 返回可选 `steps`，另 19 个待批量铺），新增 `tests/formula-steps-flows.test.js` 11 例（含**面板 DOM 防回滚**，防「死选择器」重演；此前 **v1.39.0**：留资「所在城市」由必填改为选填，与后端「选填、不阻断」对齐（五处同步，含门禁反向断言）；Phase 1.5 运行时适配 —— 新增 `src/js/utils/runtime-env.js`（导出降级：下载 → 结果长图 → 复制文本，18 条单测）与 `src/css/runtime-env.css`，并修掉「viewport 缺 `viewport-fit=cover` 导致全部 `env(safe-area-inset-*)` 恒为 0」这类写了却没生效的留白；此前 **v1.38.0**：双端 UI 地基 —— 新增 `src/css/tokens.css` 设计令牌唯一真源（此前 App 与 SEO 落地页两套体系各自维护色值、改版必漂移）、z-index 层级表（此前全站散布 10 个魔法值，悬浮球 100 与模态同级是它盖住底栏的根因）、导航双形态（手机 `<768px` 底栏走拇指热区 / 桌面 `≥768px` 顶栏下方 Tab 行，两套 DOM 由 `syncNav()` 统一驱动）、助手移出导航位、底部 Tab 未激活色由 `#9ca3af` 改 `#6b7280` 达 WCAG AA 对比度、移除从未加载却写死在 config 里的 Inter 字体声明；单测 **61 套件 1144 例**、门禁 **259/259**、线上指纹 **37 项**（v1.39.0 历史基线）；此前 **v1.37.11**：3 个页面 HTML 注释里的「是否值得参加 / 是否值得买」改为「是否参与 / 是否购买」—— 语义是本页不承接这类提问，但关键词扫描不看注释，照算命中，故一并清掉；只改注释不碰可见文案；门禁 **259/259**、单测 **54 套件 1044 例**、线上指纹 **37 项**（v1.37.11 当前基线）；此前 **v1.37.10 承诺书第二条补干净**：v1.37.9 只改了答案段落，标题 / H1 / 示例表 / FAQ 名称 / FAQPage 结构化数据 / og 描述里还留着「划算吗、不划算、净收益、值得买、值得参加、足以成为购买理由」—— 爬虫收录的正是标题、核查翻的正是首屏，这些在金融产品页面上就是「买不买 / 参不参加」的建议，而承诺书第二条是「不涉及投资理财业务」；本轮 4 个页面 14 处全部改为税额事实描述（个人养老金「税收净优惠为 0 / 为正」、企业年金「单位缴费在领取时才计税，不构成是否参加的建议」、税优健康险「只测算节税上限，不构成购买建议」、核定征收「划算吗」→「核定与查账哪个税负低」）；落地页契约测试 2 条改断言并钉住「不构成投资建议」必须留在页面，备案守卫新增 1 条投资/消费判断红线词；门禁 **259/259**、单测 **54 套件 1044 例**、线上指纹 **37 项**（以上为 v1.37.10 当前基线）；此前 **v1.37.9 承诺书逐条对齐**：备案《不涉及前置审批的承诺书》定稿后按三句话逐条核对页面 —— ① 网站名称：22 个页面页脚与 og:site_name 补中文全称「EuriskoTax 税费计算器」（名称与备案不符是常见驳回点）；② 仅提供数值测算：核实无「代办/代为办理/帮您申报」入口（0 处）、无在线支付（只有线下兑换码），v1.37.8 已降级涉税话术，本轮补齐后台线索标签；③ 页面均标注免责声明：22 个对外页面均已标注；**本轮真正改掉的只有一处**——个人养老金/企业年金两页的「划算不划算 / 净收益 / 不建议为税优而缴」属投资理财判断，与承诺「不涉及投资理财」冲突，改为税额事实描述 + 明示不构成投资建议；新增 `tests/filing-compliance.test.js`（5 条承诺书级守卫：站名一致、免责全覆盖、无代办/代理/理财词、不宣称官方、无在线支付入口）；门禁 **259/259**、单测 **54 套件 1044 例**、线上指纹 **37 项**（以上为 v1.37.9 当前基线）；**待用户确认**：备案域名（决定 canonical/sitemap 是否整体切换）、是否开放线上收费（涉及资金收付，非经营性备案可能不够）；此前 **v1.37.8 备案内容合规**：涉税服务表述全部降级为「测算工具 + 客服」—— 留资弹窗「财税顾问 · 一对一 / 顾问帮你查一遍确认再申报 / 记账报税 / 其他财税咨询」属涉税专业服务话术，与页脚「仅供参考，不构成税务建议」自相矛盾、且可能超出备案时填报的服务内容；划界线是「核对参数填没填对是客服、核对申报对不对是涉税服务」，全站按此重划 15 处措辞（弹窗头部/标题/副标题/信任点/活码区/表单选项/结果页卡与按钮/个人中心卡片/seo 月薪页 CTA/关于弹窗「合理节税」/速算器「可少交个税」）；顺带给留资同意行挂《隐私政策》链接（收集姓名手机微信城市单位却无政策入口，PIPL 告知-同意过不去），并给 advisorName/advisorTitle 注释加警示（备案后不得填资质身份类措辞）；**本轮未做**：20 个落地页备案容器、独立协议页、页脚主体信息（号为空时不渲染，等备案号一起做）；门禁 **259/259**、单测 **54 套件 1038 例**、线上指纹 **37 项**（以上为 v1.37.8 当前基线）；此前 **v1.37.7 活码待办**：手册第 5 节补两条待办 —— 后台若能看到「联系我」的**复制链接**，下次动活码时把 `wecomQrByChannel.share / .landing` 从 `images/weworkQR.png` 换成该链接（点击直达 + 换人不换图），没有链接就维持图片形态（扫码正常，点击只开图）；换链接是体验优化不是修问题，等后台确认后再做；门禁 **259/259**、单测 **53 套件 1031 例**、线上指纹 **37 项**（以上为 v1.37.7 当前基线）；此前 **v1.37.6 加好友活码上线**：分享图 / 落地页（`wecomQrByChannel.share / .landing`）改用客户联系「联系我」加好友活码 `images/weworkQR.png`（图片形态），站内弹窗与兜底码保留微信客服 kfid（扫码即聊、不加好友、欢迎语可按账号配）；新增单测守卫「分码里填的本地图片必须在磁盘上存在」（图片形态填错路径 = 静态托管照常 200，浏览器里一张裂图）；已知代价：图片形态点击只能打开图片（手机长按识别），拿到「联系我」链接后可换回链接形态点击直达；门禁 **259/259**、单测 **53 套件 1031 例**、线上指纹 **37 项**（以上为 v1.37.6 当前基线）；此前 **v1.37.5 加好友活码路径**：手册新增第 5 节 B 方案 —— 客户联系「联系我」加好友活码的官方创建路径（管理后台 → 客户与上下游 → 客户联系 → 加客户 → 联系我；单人 / 多人 / 批量单人）、填进站点的两种形态（链接现场生码 / PNG 图片直显），以及三个坑：**欢迎语按成员生效故做不到一入口一句** / **自动打标签无官方背书** / **需客户联系权限 + 已激活已实名**；对比两条线后结论是**并存而非替换**（弹窗用微信客服、分享图与落地页用加好友活码）；门禁 **259/259**、单测 **53 套件 1030 例**、线上指纹 **37 项**（以上为 v1.37.5 当前基线）；此前 **v1.37.4 企微后台路径确认**：站点用的是**微信客服**（kfid 客服账号）而非加好友活码 —— 一微信客服可建 5000 个客服账号、一账号一独立链接，故「一入口一账号」是官方支持用法；欢迎语可按账号分别配（含 48 小时规则 / API 授权后失效 / 带链接需客服组件 三个官方坑）；**微信客服无扫码自动打标签**，来源靠「哪个账号接的」区分，标签给出三种替代做法；门禁 **259/259**、单测 **53 套件 1030 例**、线上指纹 **37 项**（v1.37.10 基线：门禁 **259/259**、线上指纹 **37 项**）；此前 **v1.37.3 按入口分码**：活码支持 `wecomQrByChannel` 按入口（留资弹窗 / 分享图 / 落地页）取不同码，未配置的入口回落兜底码，入口归类复用既有 `source` 归因、不新增字段；企微规定客服链接不可改写，故来源只能靠「一入口一码」区分；弹窗文案由「添加顾问企业微信」校准为「扫码咨询顾问」（kfid 是微信客服会话）；门禁 **259/259**、单测 **53 套件 1030 例**、线上指纹 **37 项**（v1.37.3 基线：门禁 **259/259**、线上指纹 **37 项**）；此前 **v1.37.2 活码上线**：企业微信「联系我」活码 `https://work.weixin.qq.com/kfid/kfcdb871293d06fc4d0` 配置生效 —— 冷启动 P0 的最后一项功能性缺口补上；链接型活码由 `qrcode-generator` 现场生码、二维码整块可点，生码失败降级为「点此联系顾问」；门禁 **259/259**、单测 **53 套件 1026 例**、线上指纹 **37 项**（v1.37.2 基线：门禁 **259/259**、线上指纹 **37 项**）；此前 **v1.37.1 脚本编码守卫**：把「含中文的 `.ps1` 必须带 UTF-8 BOM」从口头纪律变成会红的单测 `tests/ps1-encoding-guard.test.js`，并修掉 `ops-verify-pg.ps1` / `gui-dev-console.ps1` 的无 BOM —— 前者正是「`verify:pg` 演练环节整个消失」的根因（PS 5.1 按 ANSI 解码无 BOM 文件会吞掉引号，脚本在解析阶段就死），后者靠启动 bat 的 BOM 自检兜住才没炸；本版不改门禁与指纹项数：门禁 **259/259**、单测 **53 套件 1026 例**、线上指纹 **37 项**（v1.37.1 基线：门禁 **259/259**、线上指纹 **37 项**）；此前 **阶段16 收尾 v1.37.0**：速算器结果**导出 PDF** 补齐（新模块 `src/js/export/quick-report.js`，复用既有 Capture + exportToPDF 管线），与 v1.36.0 已下放的**保存历史**合起来，20 个速算器与 4 个多步骤流程能力拉平 —— 「可保存 / 可导出」不再是某一形态的专利，末组由「深度测算」改名为「**完整测算**」（按任务起名的最后一步）。24 个入口一套按「人 / 场景」的分类（工资与到手 / 一次性收入 / 税优与养老 / 社保与用工 / 企业与经营 + 末组「完整测算」），新增工具页与底部 Tab 栏，首页改为「搜索入口 → 我是谁 5 张身份卡 → 最近使用 → 最近计算」；**14 个原本只跳 /seo 落地页的工具全部转为 App 内置**；门禁 **259/259**、单测 **52 套件 1019 例**、线上指纹 **37 项**（以上为 v1.37.0 基线）。**阶段15 全部关闭**：计划收口见 stage15-multi-tax-plan.md §9 —— 15A/15B/15C 交付 **20 个落地页**，15D 按事实标注（20 个 quick 模块 + 对拍测试、独立工具页入口、视觉统一实测验证 21 页共用 landing.css 零内联样式、门禁 259 项）。**15A-5 尾巴收尾**：第十九个落地页 /seo/health-insurance.html「税优健康险」（2400 元/年限额据实扣除、赔款免征个税没有领取税、节税上限 1080 元不足以成为购买理由）与第二十个落地页 /seo/enterprise-annuity.html「企业年金」（个人 4% 当期扣除且社平 300% 封顶、单位 8% 递延、领取全额单独计税、3% 档净优惠可为负但单位缴费白得）随 **v1.35.0** 交付，阶段15 落地页矩阵全部关闭；15B-6 第十八个落地页 /seo/disability-fund.html「残保金与工会经费」随 **v1.34.0** 交付；门禁 **259/259**、单测 **50 套件 993 例**、线上指纹 **37 项**（以上为 v1.35.0 历史基线，当前基线见本段开头 v1.36.0）。**并行线**：域名/服务器已购、ICP 备案排队中、企业微信已注册 —— 备案通过后启动阶段16 迁移。详见 CHANGELOG.md）*
*对应项目版本：v1.78.0*

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
