
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

### 阶段4：前端改造与集成（预计1周）

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
- [x] 配置生产环境变量（zeabur.json 改为 `${VAR}` 引用）
- [x] 添加Swagger API文档（/api/docs + /api/docs.json）
- [x] 生产数据库迁移 PostgreSQL（迁移文件 `20260905_init_postgres` 已生成）
- ~~安装PM2进程管理器~~ → 由 ZeaburOS 托管替代
- ~~配置Nginx反向代理~~ → 由 Zeabur 平台替代
- ~~配置HTTPS（Let's Encrypt）~~ → 由 Zeabur 自动提供
- ~~编写部署脚本~~ → 由 Git 推送自动部署替代

**输出文件**：
- `zeabur.json` - Zeabur 部署配置（构建命令含 `prisma migrate deploy`）
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

## 🔄 数据库表设计

### users 表（用户表）

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT | 用户ID |
| username | VARCHAR(50) | UNIQUE, NOT NULL | 用户名 |
| email | VARCHAR(100) | UNIQUE, NOT NULL | 邮箱 |
| phone | VARCHAR(20) | - | 手机号 |
| password_hash | VARCHAR(255) | NOT NULL | 密码哈希 |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | ON UPDATE CURRENT_TIMESTAMP | 更新时间 |

### calculations 表（计算记录表）

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT | 记录ID |
| user_id | INT | FOREIGN KEY | 用户ID |
| type | VARCHAR(20) | NOT NULL | 计算类型（comprehensive/business/classification/reverse） |
| input_data | JSON | NOT NULL | 输入数据 |
| result_data | JSON | NOT NULL | 计算结果 |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | 创建时间 |

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
| 阶段7：云平台部署上线 | 🚧 进行中（服务器已购买，待部署服务） | 1天 | 预计 2026-09-06 |
| 阶段8：首批测试用户运营 | ⏳ 待开始 | 2周 | 预计 2026-09-20 |
| 阶段9：PWA 离线化改造 | ⏳ 待开始 | 3天 | 预计 2026-09-23 |
| 阶段10：免费/专业版体系 | ⏳ 待开始 | 1周 | 预计 2026-10 月初 |

### 当前状态

**生产环境（2026-09-05 已购买服务器）**：
- 平台：Zeabur（zeabur.cn）
- 服务器：Tencent - Tokyo，2 vCPU / 2 GB 内存 / 40 GB SSD / 0.5TB 流量（Max 30 Mbps）
- 系统：ZeaburOS（托管模式，开箱即部署，自动 HTTPS）
- 费用：$3/月（促销价，原价 $4.20）
- 待完成：部署 PostgreSQL 服务 → 从 GitHub 部署应用 → 配置 JWT_SECRET / CORS_ORIGIN → 绑定 `*.zeabur.app` 域名

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

**部署流程（阶段7剩余步骤）**：
1. 项目内部署 PostgreSQL 服务（选择已购服务器）
2. 从 GitHub 仓库部署应用（自动读取 [zeabur.json](../../zeabur.json)，构建时执行 `prisma migrate deploy`）
3. 手动设置环境变量：`JWT_SECRET`（强随机密钥）、`CORS_ORIGIN`（Zeabur 分配的域名）
4. 绑定 `*.zeabur.app` 免费域名（自动 HTTPS）
5. 自检：`/health` 返回 ok → Swagger 可见 → 注册接口带邀请码 `EURISKO2026BETA` 测试通过

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

## � 商业模式与产品路线（2026-09-05 定调）

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

1. **PWA 离线化改造（阶段9，优先）**
   - 新增 `manifest.json` + Service Worker（静态资源缓存策略）
   - 改造 [mock-client.js](../../src/js/utils/mock-client.js) 为"离线历史记录客户端"（localStorage 存取），未登录用户也可保留本地历史
   - 离线状态检测与 UI 提示（计算可用、同步暂缓）

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
*最后更新：2026-09-05（服务器购买完成、商业模式定调、新增阶段9/10）*
*版本：v1.20.0*

---

## ✨ 新增功能与优化（v1.19.0）

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

### v1.18.0 优化内容

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

## 🚀 v1.4.0 上线计划（2026-09-05 制定）

### 一、现状评估

**✅ 已具备（生产就绪）**：后端 Express（0.0.0.0:3000）、静态服务+SPA回退、安全HTTP头5项、请求体1MB限制、JWT+bcrypt、`/health`、Swagger、Prisma、143单元测试、zeabur.json。

**❌ 7 个关键阻塞点（2026-09-05 更新状态）**：

| # | 缺失项 | 严重度 | 状态 |
|---|--------|--------|------|
| 1 | 生产数据库用 SQLite | 🔴 致命 | ✅ 已解决（PostgreSQL 迁移文件已生成） |
| 2 | JWT_SECRET 占位符 | 🔴 致命 | ⏳ Zeabur 部署时设置强随机密钥 |
| 3 | CORS_ORIGIN = `*` | 🟡 高 | ⏳ 域名分配后填入实际值 |
| 4 | 无前端构建步骤 | 🟡 中 | ⏳ 暂缓（原生JS可直接部署，>100用户后再本地构建 Tailwind） |
| 5 | 无速率限制 | 🟡 中 | ✅ 已解决（express-rate-limit 已加入 app.js） |
| 6 | 无 HTTPS 强制跳转 | 🟡 中 | ✅ 由 Zeabur 平台自动提供 |
| 7 | 无日志持久化/告警 | 🟢 低 | ⏳ 后续（复用 ops-notify.ps1 邮件通知思路） |

### 二、MVP 形态

**定位**：个人税务预算规划工具（个人纳税人 / 个体工商户 / 自由职业者）
**架构**：前端SPA（Tailwind+原生JS） + Express API（REST+JWT） + PostgreSQL

### 三、推荐平台：Zeabur（首选）

**理由**：已有 [zeabur.json](../../zeabur.json) 零迁移；国内可访问；一键 Postgres；自动 HTTPS+Git 部署；有免费额度。

**环境变量**：`JWT_SECRET=<openssl rand -hex 32>` / `DATABASE_URL=<Zeabur注入>` / `CORS_ORIGIN=<域名>` / `NODE_ENV=production`

### 四、7 步上线流程

#### 阶段 A：代码层修复（Day 1-2）

**步骤 1**：迁移 Prisma 到 PostgreSQL
- [server/prisma/schema.prisma](../../server/prisma/schema.prisma) 中 `provider = "sqlite"` → `"postgresql"`
- 执行 `cd server && npx prisma migrate dev --name init-postgres`

**步骤 2**：修复 zeabur.json 环境变量为 `${VAR}` 引用（不再硬编码）

**步骤 3**：在 [app.js](../../server/src/app.js) L9 后增加生产校验 + rate-limit
```javascript
if (process.env.NODE_ENV === 'production') {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'your-random-secret-key') {
        console.error('FATAL: JWT_SECRET must be set in production'); process.exit(1);
    }
    if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('dev.db')) {
        console.error('FATAL: DATABASE_URL must be PostgreSQL in production'); process.exit(1);
    }
}
const rateLimit = require('express-rate-limit');
app.use('/api/auth/', rateLimit({ windowMs: 15*60*1000, max: 10 }));
```

#### 阶段 B：部署上线（Day 3）

**步骤 4**：GitHub 推送 + Zeabur 绑定 → 添加 PostgreSQL 服务 → 填 JWT_SECRET
**步骤 5**：域名 + HTTPS（Zeabur 自动提供 `*.zeabur.app`）
**步骤 6**：自检 → `/api/docs` 可见 + `/health` 返回 ok + dev 账号登录成功

#### 阶段 C：首批测试用户运营（Day 4起）

**步骤 7**：4 渠道冷启动
- 即刻/V2EX/少数派发帖 → 30-80 人
- 知乎税务话题 → 50-100 人
- 小红书实测笔记 → 100-300 人
- 微信社群裂变 → 50-200 人

**邀请码机制**：`/api/auth/register` 校验 `inviteCode === 'EURISKO2026BETA'`
**反馈闭环**：新增 `/api/feedback` 接口 + 复用 [ops-notify.ps1](../../tools/ops/ops-notify.ps1) 邮件转发

### 五、Definition of Done

**🔴 必做**：~~Prisma 迁 PostgreSQL~~ ✅ / ~~zeabur.json 改 `${VAR}`~~ ✅ / JWT_SECRET 强密钥 ⏳部署时 / CORS 限定域名 ⏳部署时 / 删除 reset-dev-user.js 自动调用 ⏳

**🟡 建议**：~~express-rate-limit~~ ✅ / ~~用户反馈接口~~ ✅ / ~~邀请码~~ ✅ / 错误日志聚合 ⏳

**🟢 后续（>100用户）**：Tailwind 本地构建 / 用户协议+隐私政策 / Cloudflare CDN / 数据库备份

### 六、2 周时间表（2026-09-05 更新）

```
Day 1-2：代码层修复（Prisma + 环境变量 + rate-limit + 自检）✅ 已完成
Day 3：  Zeabur 服务器购买 ✅ 已完成（Tencent Tokyo $3/月）→ 剩余：部署 PostgreSQL + 应用 + 环境变量 + 域名
Day 4：  邀请码机制 ✅ 已实现 + 反馈接口 ✅ 已实现 → 剩余：数据埋点
Day 5：  内测 5-10 个种子用户 + 修紧急 bug
Day 6-7：准备冷启动素材
Day 8-9：即刻/V2EX 发帖 + 邀请码放开
Day 10-11：观察数据 + 收集反馈
Day 12-14：迭代修复 + 准备第二轮推广
```

### 关键决策点

| 决策 | 结论 | 状态 |
|------|------|------|
| 数据库 | PostgreSQL | ✅ 已迁移（迁移文件已生成） |
| 部署平台 | Zeabur（Tencent Tokyo，$3/月，ZeaburOS） | ✅ 服务器已购买（2026-09-05） |
| 商业模式 | 前端离线计算免费 + 云端专业版 + B端API | ✅ 已定调（见商业模式章节） |
| 上线节奏 | 内测→公测 | 先找 5-10 种子用户 |
| 用户增长 | 邀请码裂变（EURISKO2026BETA） | ✅ 机制已实现 |

---

*v1.4.0 上线计划制定时间：2026-09-05*
