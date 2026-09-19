
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

### 技术文档

- API文档：http://localhost:3000/api/docs
- 数据库模型：`server/prisma/schema.prisma`
- 源代码：`server/src/`
- 计税规则：`docs/guides/tax-calculation-rules.md`

---

*文档创建时间：2026-05-25*
*最后更新：2026-09-19（**v1.66.0 当前基线**：门禁 **259/259**、单测 **86 套件 1631 例**（jest 实测 1280）、线上指纹 **37 项** —— 本版「阶段17 17D-1」：**劳务报酬预扣预缴的完整测算（个税场景完整度 4/16 → 5/16）** —— 它是第一个「自带 spec」的 `-deep`：速算器只认**一笔**收入，而预扣是**按次**的（两笔 2 万同月：合并为一次 4 万按 30% 档扣 7600、逐笔单独各按 20% 档共 6400，差 1200 元是**档位差**不是小数差），共享同一份 `fields` 等于把速算器复制一遍，故配对逻辑加「自带 `fields` / `compute` 的 `-deep` 不被孪生速算器覆盖」，口径同源改由「仍然调同一个 `withholding-quick.js`」+ 单笔输入的逐点对拍守护（`tests/withholding-deep.test.js` 17 例）；汇算用内核 `calculateTaxByTaxableIncome` 算**增量**而非速算器那种「收入额 × 边际税率」（跨档反例：其余综合所得 29 万 + 收入额 4.8 万 —— 按 20% 估 9600、按 25% 估 12000，真值 11500）；「属于同一项目连续性收入的以一个月内取得的收入为一次」这条法定口径做成界面开关并讲清「分着算更省但不是法定口径」，详见 CHANGELOG v1.52.0；**v1.53.0 另做 17D-2**：**年终奖择优**（个税场景 5/16 → 6/16）—— `bonus-tax` 收了「全年其他应纳税所得额」却在 `compute` 里一行没用到，subtitle 写着「单独计税还是并入综合所得更省」而实际只算了单独那一半；补齐两套口径真比一次、临界区给出「该定在多少」（36000→38567 等）、总额可切分时求最优分配点。详见 CHANGELOG v1.53.0；**v1.54.0 另做 17D-3**：**股权激励**（个税场景 6/16 → 7/16）—— `equity` 速算器只认**一个行权日、一个价差**，「一年内多次行权」只能靠标量 `ytdIncome` 手工先加好再填；完整测算按批次收（repeater）并合并成一个基数定档，量化「分次各自定档」少算的税（两批各 5 万：合并 7480 vs 分次 4960，**少算 2520**，那是汇算要补的数），补上 quick 里**没人用过**的递延纳税 20% 常量（非上市公司，财税〔2016〕101 号），并给出跨年度行权的切分（合并只在同一个纳税年度内成立）；另钉住一条反直觉知识点：年度表是超额累进，这里**没有**年终奖那种「多发 1 元到手变少」的雷区。口径仍走 `equity-incentive-quick.js`，新增 `tests/equity-deep.test.js`（20 例），详见 CHANGELOG v1.54.0；上一版 **v1.51.0**「17B-6」：**「方案对比」卡重建宿主** —— 页面式 deep 归零后它是唯一没跟着走的功能：取数靠 `collectTaxInputData()` / `collectDeductionInput()` 两个按 id 读表单的适配器，而那张表单随综合所得页面一起删了（第一个 `work-months` 就抛 TypeError，被 try/catch 吞成「读不到表单数据」）；改为**宿主注入**：forward spec 暴露 `toCalcInput`（与 `compute` 共用抽出的 `forwardCalc`，不为保存方案另写一份映射），渲染器见到钩子才挂卡片（其余 8 个 deep 没有）；顺手修掉「保存成功但方案是空的」（存进去的是 `input: null`）与「点完保存看到的是常驻文案」（`render()` 末尾那句盖掉了「已保存（1/2）」）；新增 `tests/scenario-rehost.test.js`（9 例），详见 CHANGELOG v1.51.0；上一版 **v1.50.0**「17B-4」：**分类所得由页面式迁到 spec 驱动的向导 —— 17B 收官，`index.html` 里不再有任何手写深度页**；先给渲染器补 `type:'repeater'`（动态增删所得条目，`itemFields` + 加/删按钮，控件 id `qf-<key>-<下标>-<子键>` 以复用既有 `fieldHtml` / 条件显隐，不另写一套类型转换），再写 classification spec（四类所得各自扣除口径 + **按次单独计税**，仍调 `calculateSingleClassificationTax` / `calculateClassificationTaxTotal`），最后删页面约 330 行 + `helper-functions.js` 706 行 + `draft-store.js` 345 行（含 270 行单测）+ 常驻预览条与 `field-hints` 的 `classification_*` 键（约 1,700 行）；**抓到的真问题**：`app.js` 里绑 `back-to-mode-selection-classification` 的那句随页面成了空指针 —— DOMContentLoaded 在它这一行抛错，**后面所有初始化（登录态、历史记录）全不执行**，界面看着正常、功能静默全残；另一处是修缮费每月 800 元封顶原先没解释，填 1500 看到 800 会被当成算错，现写进 hint 与 pitfalls（**超出部分结转以后月份**）；新增 `tests/classification-migration.test.js` 接住 `ui-result-compliance` 失去的页面条目（独立重算 + 端到端守免责 / `data-tool-id` / 分享图两个行标签 / repeater 增删）；**页面式 deep 归零**（`tests/tool-registry.test.js` 的 `pageBased` 断言等于空数组），详见 CHANGELOG v1.50.0；上一版 **v1.49.0**「17B-3」：**综合所得正向计税（forward）由页面式迁到 spec 驱动的向导**，旧页面 `forward-calculation-page`（index.html 约 970 行）连同 app.js 约 340 行接线、helper-functions 里 12 个页面私有函数（约 440 行）、data-management 的 `saveCalculationResult`（与 `saveToHistory` 重复实现）、draft-store 的 forward 草稿流、field-hints 的 `forward_*` 键、navigation-ui 的预览分支一并删除（约 1,900 行）；先把那份独有的**逐月预算表**抽成纯 tables 内核（`tests/budget-table.test.js` 先守），再由 `extras.table` 透传给 spec —— 第三步仍是「先抽内核再写 spec」这条路；27 个字段分三步，便利输入（婴幼儿分摊比例、学历/职业资格勾选）在删页**之前**就登记进 spec；`dw-result-card` 第三次带来认人问题（三个工具共用），加 `dw-result-card:forward` 一路 + `sourceKey()`；**页面式 deep 由 2 → 1**（只剩 classification），详见 CHANGELOG v1.49.0；上一版 **v1.48.0**「17B-2」：**反向倒算（谈薪）由页面式迁到 spec 驱动的向导**，旧页面 `reverse-calculation-page` 连同 app.js 约 400 行表单联动、helper-functions / utils / tax-calculator 里只读 DOM 的那一层、navigation-ui 的 `showReverseStep` 与预览分支、draft-store 的 reverse 草稿流一并删除（约 1,050 行）；迁移**前**先把「社保基数 × 比例 → 月缴额」这组便利输入登记进 reverse spec，并与 business 共用同一份钩子 —— 这次没让便利输入跟着页面一起消失；`dw-result-card` 被两个工具共用而模板不同（经营所得 income / 谈薪 negotiation），于是加 `dw-result-card:reverse` 一路 + `sourceKey()` 按 `data-tool-id` 认人；**页面式 deep 由 3 → 2**（剩 forward / classification），详见 CHANGELOG v1.48.0；上一版 **v1.47.0**「17B-1 收尾」：把经营所得旧页面（`business-calculation-page`）的**死代码清干净** —— index.html 853 行 + 计算层私有实现 + app.js 约 300 行表单逻辑 + 经营所得专业版报告，共约 1,150 行；对拍测试转为**按税法口径独立重算**的回归（页面版没了，左式不复存在），详见 CHANGELOG v1.47.0；更早 **v1.46.0**「17B-1 经营所得反向迁移」：**第一个由页面式迁到 spec 驱动的 deep**，抽内核 `calculateBusinessTaxCore` 让页面版与向导版共用同一份算法，并由逐点对拍证明口径未变，**页面式 deep 由 4 → 3**（剩 forward / classification / reverse）；更早 **v1.45.0**「17A-2 结果区与存量页面对等」（17B 的硬前置）（结论区带上「下一步动作」与「一句话理由」，层级重排为 金额 → 结论 → 理由 → 推导链（折叠）→ 注意点 → 明细（折叠，记住展开）→ 免责 → 操作；新增 `tests/result-narrative.test.js` 7 例锁死结论方向与 `#result-refund-tax` 同口径）；**同版另做 Phase 2.5 ① —— 通用单调求解器**（`src/js/calculation/solver.js`，详见 CHANGELOG v1.41.0 同名小节）：原来手写在 8 处的二分倒算（`tax-calculator.js` 6 处 + `net-salary-quick.js` / `employer-cost-quick.js` 各 1 处）统一走 `solveMonotone()` / `expandUpperBound()`，调用点只保留各自的判据与取整口径；此前 **v1.40.0**：推导链扩全流程（台账 C）：四个完整测算页推导链齐平（`utils.js` 抽出 `renderFormulaStepsHtml` / `showFormulaStepsPanel` **一套实现**，新增 `buildBusinessFormulaSteps` / `buildClassificationFormulaSteps` / `buildReverseFormulaSteps` 三个纯函数，`index.html` 三页各插一份折叠面板并由 `tax-calculator.js` / `helper-functions.js` 接线），速算器打样 1 个（月薪个税 `compute` 返回可选 `steps`，另 19 个待批量铺），新增 `tests/formula-steps-flows.test.js` 11 例（含**面板 DOM 防回滚**，防「死选择器」重演；此前 **v1.39.0**：留资「所在城市」由必填改为选填，与后端「选填、不阻断」对齐（五处同步，含门禁反向断言）；Phase 1.5 运行时适配 —— 新增 `src/js/utils/runtime-env.js`（导出降级：下载 → 结果长图 → 复制文本，18 条单测）与 `src/css/runtime-env.css`，并修掉「viewport 缺 `viewport-fit=cover` 导致全部 `env(safe-area-inset-*)` 恒为 0」这类写了却没生效的留白；此前 **v1.38.0**：双端 UI 地基 —— 新增 `src/css/tokens.css` 设计令牌唯一真源（此前 App 与 SEO 落地页两套体系各自维护色值、改版必漂移）、z-index 层级表（此前全站散布 10 个魔法值，悬浮球 100 与模态同级是它盖住底栏的根因）、导航双形态（手机 `<768px` 底栏走拇指热区 / 桌面 `≥768px` 顶栏下方 Tab 行，两套 DOM 由 `syncNav()` 统一驱动）、助手移出导航位、底部 Tab 未激活色由 `#9ca3af` 改 `#6b7280` 达 WCAG AA 对比度、移除从未加载却写死在 config 里的 Inter 字体声明；单测 **61 套件 1144 例**、门禁 **259/259**、线上指纹 **37 项**（v1.39.0 历史基线）；此前 **v1.37.11**：3 个页面 HTML 注释里的「是否值得参加 / 是否值得买」改为「是否参与 / 是否购买」—— 语义是本页不承接这类提问，但关键词扫描不看注释，照算命中，故一并清掉；只改注释不碰可见文案；门禁 **259/259**、单测 **54 套件 1044 例**、线上指纹 **37 项**（v1.37.11 当前基线）；此前 **v1.37.10 承诺书第二条补干净**：v1.37.9 只改了答案段落，标题 / H1 / 示例表 / FAQ 名称 / FAQPage 结构化数据 / og 描述里还留着「划算吗、不划算、净收益、值得买、值得参加、足以成为购买理由」—— 爬虫收录的正是标题、核查翻的正是首屏，这些在金融产品页面上就是「买不买 / 参不参加」的建议，而承诺书第二条是「不涉及投资理财业务」；本轮 4 个页面 14 处全部改为税额事实描述（个人养老金「税收净优惠为 0 / 为正」、企业年金「单位缴费在领取时才计税，不构成是否参加的建议」、税优健康险「只测算节税上限，不构成购买建议」、核定征收「划算吗」→「核定与查账哪个税负低」）；落地页契约测试 2 条改断言并钉住「不构成投资建议」必须留在页面，备案守卫新增 1 条投资/消费判断红线词；门禁 **259/259**、单测 **54 套件 1044 例**、线上指纹 **37 项**（以上为 v1.37.10 当前基线）；此前 **v1.37.9 承诺书逐条对齐**：备案《不涉及前置审批的承诺书》定稿后按三句话逐条核对页面 —— ① 网站名称：22 个页面页脚与 og:site_name 补中文全称「EuriskoTax 税费计算器」（名称与备案不符是常见驳回点）；② 仅提供数值测算：核实无「代办/代为办理/帮您申报」入口（0 处）、无在线支付（只有线下兑换码），v1.37.8 已降级涉税话术，本轮补齐后台线索标签；③ 页面均标注免责声明：22 个对外页面均已标注；**本轮真正改掉的只有一处**——个人养老金/企业年金两页的「划算不划算 / 净收益 / 不建议为税优而缴」属投资理财判断，与承诺「不涉及投资理财」冲突，改为税额事实描述 + 明示不构成投资建议；新增 `tests/filing-compliance.test.js`（5 条承诺书级守卫：站名一致、免责全覆盖、无代办/代理/理财词、不宣称官方、无在线支付入口）；门禁 **259/259**、单测 **54 套件 1044 例**、线上指纹 **37 项**（以上为 v1.37.9 当前基线）；**待用户确认**：备案域名（决定 canonical/sitemap 是否整体切换）、是否开放线上收费（涉及资金收付，非经营性备案可能不够）；此前 **v1.37.8 备案内容合规**：涉税服务表述全部降级为「测算工具 + 客服」—— 留资弹窗「财税顾问 · 一对一 / 顾问帮你查一遍确认再申报 / 记账报税 / 其他财税咨询」属涉税专业服务话术，与页脚「仅供参考，不构成税务建议」自相矛盾、且可能超出备案时填报的服务内容；划界线是「核对参数填没填对是客服、核对申报对不对是涉税服务」，全站按此重划 15 处措辞（弹窗头部/标题/副标题/信任点/活码区/表单选项/结果页卡与按钮/个人中心卡片/seo 月薪页 CTA/关于弹窗「合理节税」/速算器「可少交个税」）；顺带给留资同意行挂《隐私政策》链接（收集姓名手机微信城市单位却无政策入口，PIPL 告知-同意过不去），并给 advisorName/advisorTitle 注释加警示（备案后不得填资质身份类措辞）；**本轮未做**：20 个落地页备案容器、独立协议页、页脚主体信息（号为空时不渲染，等备案号一起做）；门禁 **259/259**、单测 **54 套件 1038 例**、线上指纹 **37 项**（以上为 v1.37.8 当前基线）；此前 **v1.37.7 活码待办**：手册第 5 节补两条待办 —— 后台若能看到「联系我」的**复制链接**，下次动活码时把 `wecomQrByChannel.share / .landing` 从 `images/weworkQR.png` 换成该链接（点击直达 + 换人不换图），没有链接就维持图片形态（扫码正常，点击只开图）；换链接是体验优化不是修问题，等后台确认后再做；门禁 **259/259**、单测 **53 套件 1031 例**、线上指纹 **37 项**（以上为 v1.37.7 当前基线）；此前 **v1.37.6 加好友活码上线**：分享图 / 落地页（`wecomQrByChannel.share / .landing`）改用客户联系「联系我」加好友活码 `images/weworkQR.png`（图片形态），站内弹窗与兜底码保留微信客服 kfid（扫码即聊、不加好友、欢迎语可按账号配）；新增单测守卫「分码里填的本地图片必须在磁盘上存在」（图片形态填错路径 = 静态托管照常 200，浏览器里一张裂图）；已知代价：图片形态点击只能打开图片（手机长按识别），拿到「联系我」链接后可换回链接形态点击直达；门禁 **259/259**、单测 **53 套件 1031 例**、线上指纹 **37 项**（以上为 v1.37.6 当前基线）；此前 **v1.37.5 加好友活码路径**：手册新增第 5 节 B 方案 —— 客户联系「联系我」加好友活码的官方创建路径（管理后台 → 客户与上下游 → 客户联系 → 加客户 → 联系我；单人 / 多人 / 批量单人）、填进站点的两种形态（链接现场生码 / PNG 图片直显），以及三个坑：**欢迎语按成员生效故做不到一入口一句** / **自动打标签无官方背书** / **需客户联系权限 + 已激活已实名**；对比两条线后结论是**并存而非替换**（弹窗用微信客服、分享图与落地页用加好友活码）；门禁 **259/259**、单测 **53 套件 1030 例**、线上指纹 **37 项**（以上为 v1.37.5 当前基线）；此前 **v1.37.4 企微后台路径确认**：站点用的是**微信客服**（kfid 客服账号）而非加好友活码 —— 一微信客服可建 5000 个客服账号、一账号一独立链接，故「一入口一账号」是官方支持用法；欢迎语可按账号分别配（含 48 小时规则 / API 授权后失效 / 带链接需客服组件 三个官方坑）；**微信客服无扫码自动打标签**，来源靠「哪个账号接的」区分，标签给出三种替代做法；门禁 **259/259**、单测 **53 套件 1030 例**、线上指纹 **37 项**（v1.37.10 基线：门禁 **259/259**、线上指纹 **37 项**）；此前 **v1.37.3 按入口分码**：活码支持 `wecomQrByChannel` 按入口（留资弹窗 / 分享图 / 落地页）取不同码，未配置的入口回落兜底码，入口归类复用既有 `source` 归因、不新增字段；企微规定客服链接不可改写，故来源只能靠「一入口一码」区分；弹窗文案由「添加顾问企业微信」校准为「扫码咨询顾问」（kfid 是微信客服会话）；门禁 **259/259**、单测 **53 套件 1030 例**、线上指纹 **37 项**（v1.37.3 基线：门禁 **259/259**、线上指纹 **37 项**）；此前 **v1.37.2 活码上线**：企业微信「联系我」活码 `https://work.weixin.qq.com/kfid/kfcdb871293d06fc4d0` 配置生效 —— 冷启动 P0 的最后一项功能性缺口补上；链接型活码由 `qrcode-generator` 现场生码、二维码整块可点，生码失败降级为「点此联系顾问」；门禁 **259/259**、单测 **53 套件 1026 例**、线上指纹 **37 项**（v1.37.2 基线：门禁 **259/259**、线上指纹 **37 项**）；此前 **v1.37.1 脚本编码守卫**：把「含中文的 `.ps1` 必须带 UTF-8 BOM」从口头纪律变成会红的单测 `tests/ps1-encoding-guard.test.js`，并修掉 `ops-verify-pg.ps1` / `gui-dev-console.ps1` 的无 BOM —— 前者正是「`verify:pg` 演练环节整个消失」的根因（PS 5.1 按 ANSI 解码无 BOM 文件会吞掉引号，脚本在解析阶段就死），后者靠启动 bat 的 BOM 自检兜住才没炸；本版不改门禁与指纹项数：门禁 **259/259**、单测 **53 套件 1026 例**、线上指纹 **37 项**（v1.37.1 基线：门禁 **259/259**、线上指纹 **37 项**）；此前 **阶段16 收尾 v1.37.0**：速算器结果**导出 PDF** 补齐（新模块 `src/js/export/quick-report.js`，复用既有 Capture + exportToPDF 管线），与 v1.36.0 已下放的**保存历史**合起来，20 个速算器与 4 个多步骤流程能力拉平 —— 「可保存 / 可导出」不再是某一形态的专利，末组由「深度测算」改名为「**完整测算**」（按任务起名的最后一步）。24 个入口一套按「人 / 场景」的分类（工资与到手 / 一次性收入 / 税优与养老 / 社保与用工 / 企业与经营 + 末组「完整测算」），新增工具页与底部 Tab 栏，首页改为「搜索入口 → 我是谁 5 张身份卡 → 最近使用 → 最近计算」；**14 个原本只跳 /seo 落地页的工具全部转为 App 内置**；门禁 **259/259**、单测 **52 套件 1019 例**、线上指纹 **37 项**（以上为 v1.37.0 基线）。**阶段15 全部关闭**：计划收口见 stage15-multi-tax-plan.md §9 —— 15A/15B/15C 交付 **20 个落地页**，15D 按事实标注（20 个 quick 模块 + 对拍测试、独立工具页入口、视觉统一实测验证 21 页共用 landing.css 零内联样式、门禁 259 项）。**15A-5 尾巴收尾**：第十九个落地页 /seo/health-insurance.html「税优健康险」（2400 元/年限额据实扣除、赔款免征个税没有领取税、节税上限 1080 元不足以成为购买理由）与第二十个落地页 /seo/enterprise-annuity.html「企业年金」（个人 4% 当期扣除且社平 300% 封顶、单位 8% 递延、领取全额单独计税、3% 档净优惠可为负但单位缴费白得）随 **v1.35.0** 交付，阶段15 落地页矩阵全部关闭；15B-6 第十八个落地页 /seo/disability-fund.html「残保金与工会经费」随 **v1.34.0** 交付；门禁 **259/259**、单测 **50 套件 993 例**、线上指纹 **37 项**（以上为 v1.35.0 历史基线，当前基线见本段开头 v1.36.0）。**并行线**：域名/服务器已购、ICP 备案排队中、企业微信已注册 —— 备案通过后启动阶段16 迁移。详见 CHANGELOG.md）*
*对应项目版本：v1.53.0*

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
