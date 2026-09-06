
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
- [x] 将前端计算调用改为API请求（src/js/api/api-client.js → /api/calculations/*）
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

> 完整模型与迁移见 [server/prisma/schema.prisma](../../server/prisma/schema.prisma)；本地开发使用同构的 `schema.dev.prisma`（SQLite）。当前共 **4 张表**：

### users（用户）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT PK 自增 | 用户ID |
| username | STRING UNIQUE | 用户名 |
| email | STRING UNIQUE | 邮箱（唯一，登录标识） |
| phone | STRING? 可空 | 手机号 |
| password_hash | STRING | bcrypt 密码哈希 |
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
| 阶段8：首批测试用户运营 | 🚧 进行中（冷启动推广素材已备好） | 2周 | 预计 2026-09-20 |
| 阶段9：PWA 离线化改造 | ✅ 代码完成（2026-09-06 本地验证通过；随 Git 推送部署生产后需清缓存终验） | 3天 | 2026-09-06 |
| 阶段10：免费/专业版体系 | ⏳ 待开始 | 1周 | 预计 2026-10 月初 |

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
- 运营统计：GET /api/stats/overview（X-Admin-Token 认证），注册数/计算次数/近7日趋势
- PWA（阶段 9）：manifest + service-worker v4 已随代码就绪，离线应用壳本地验证通过（2026-09-06）

**本地开发环境**：
- 后端服务：http://localhost:3000
- API文档：http://localhost:3000/api/docs
- 数据库：开发 SQLite（dev.db）/ 生产 PostgreSQL（迁移文件已生成）
- 认证方式：JWT Token
- 前端：HTML5 + CSS3 + JavaScript（原生技术，计税引擎全本地运行）

### 开发账号

- 用户名：devuser
- 邮箱：dev@example.com
- 密码：password

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

1. **PWA 离线化改造（阶段9）** ✅ 代码完成（2026-09-06 本地验证通过）
   - ✅ 新增 `manifest.json`（应用清单：standalone 模式、主题色 #1e40af、192/512 图标含 maskable）
   - ✅ 新增 `service-worker.js` v4（应用壳预缓存 + CDN cache-first + 同源 JS/CSS network-first 确保新代码即时生效 + API 永不缓存）
   - ✅ `index.html` 引入 manifest / theme-color / favicon / apple-touch-icon，注册 Service Worker
   - ✅ 后端差异化缓存策略：index.html/manifest/sw.js → no-cache；JS/CSS → immutable 1年（配合 SW network-first 覆盖失效）；图片 → 7天
   - ✅ 离线体验：更新提示条 + 安装按钮 + CDN 资源失败兜底
   - ✅ 离线状态检测与 UI 提示（顶部 amber 提示条，计税可用、数据本地保存）
   - ✅ 本地验证通过：SW 激活、应用壳预缓存命中（index.html/manifest/app.js/logo 均 200）
   - ⏳ 随 Git 推送部署到生产后，需清缓存终验（该步骤以 Zeabur 线上部署结果为准）

2. **免费/专业版体系（阶段10）**
   - 未登录 = 免费版全功能；登录 = 解锁云端同步
   - 历史记录"本地 ↔ 云端"合并策略（登录后上传本地记录）
   - PDF 报告导出（专业版）、反馈入口复用 `/api/feedback`

3. **B端 API 开放（中长期）**
   - 将服务端计税能力封装为独立版本化端点（如 `/api/v1/calc/*`）
   - API Key 授权、按次计费、限流配额（复用 express-rate-limit 经验）
   - 面向代账公司/财务 SaaS 输出，Swagger 文档即销售材料

4. **数据管理与多端支持**
   - 多设备登录与云端同步、数据导入导出、备份机制
   - 微信小程序（Taro 复用前端计税 JS）→ 桌面端（Tauri，可选）

### 技术文档

- API文档：http://localhost:3000/api/docs
- 数据库模型：`server/prisma/schema.prisma`
- 源代码：`server/src/`
- 计税规则：`docs/guides/tax-calculation-rules.md`

---

*文档创建时间：2026-05-25*
*最后更新：2026-09-06（v1.5.0：忘记密码自助找回、协议合规交互、会话记忆化，详见 CHANGELOG.md）*
*对应项目版本：v1.5.0*

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

> 本节保留为上线计划存档。当前项目版本 **1.5.0**（2026-09-06：忘记密码自助找回、注册协议勾选、登录记住我、协议/隐私弹窗交互重构），变更明细见 [CHANGELOG.md](../../CHANGELOG.md)。

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

#### 阶段 C：首批测试用户运营（进行中，阶段 8）

**步骤 7**：4 渠道冷启动（素材已备，见 [marketing/cold-start-materials.md](../marketing/cold-start-materials.md)）
- 即刻/V2EX/少数派发帖 → 30-80 人
- 知乎税务话题 → 50-100 人
- 小红书实测笔记 → 100-300 人
- 微信社群裂变 → 50-200 人

**邀请码机制（2026-09-06 升级为「一机一码」）**：~~固定码 `EURISKO2026BETA`~~ → `EURISKO-XXXX-XXXX` 随机码，表内校验、一次性使用、事务原子消耗；服务启动表空自动生成 20 个兜底
**反馈闭环** ✅：`POST/GET /api/feedback` + 管理员经统计概览跟进；GUI 一键邀请码管理

### 五、Definition of Done

**🔴 必做**：~~Prisma 迁 PostgreSQL~~ ✅ / ~~部署入口（Dockerfile 替代 zeabur.json）~~ ✅ / JWT_SECRET 强密钥 ✅（Zeabur 环境变量已配）/ CORS 限定域名 ✅ / 生产不触发 reset-dev-user.js ✅（生产走 Dockerfile `CMD`，reset 仅本地启动脚本使用）

**🟡 建议**：~~express-rate-limit~~ ✅ / ~~用户反馈接口~~ ✅ / ~~邀请码~~ ✅（一机一码）/ ~~用户协议 + 隐私政策~~ ✅（2026-09-06 注册弹窗已实现）/ 错误日志聚合 ⏳ 后续

**🟢 后续（>100用户）**：Tailwind 本地构建 / Cloudflare CDN / 数据库备份

### 六、2 周时间表（执行进度 2026-09-06）

```
Day 1-2：代码层修复（Prisma + 部署入口 + rate-limit + 自检）✅ 已完成
Day 3：  Zeabur 服务器购买 + 部署 PostgreSQL + 应用 + 环境变量 + 域名 ✅ 已完成
Day 4：  邀请码机制 ✅ + 反馈接口 ✅ → 剩余：数据埋点（阶段8 收尾项）
Day 5：  注册全流程完善（邮箱验证码 + 一机一码）✅ 已完成（2026-09-06）
Day 5-6：PWA 离线化改造（阶段9）✅ 代码完成，本地验证通过
Day 6-7：准备冷启动素材 ✅ 已备（marketing/cold-start-materials.md）
Day 8-9：内测 5-10 种子用户 → 即刻/V2EX 发帖 + 放开邀请码发放  （阶段8 进行中）
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
