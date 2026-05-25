
# 个人所得税计算系统 - 后端化开发方案

## 📋 项目概述

当前项目是一个纯前端的个人所得税计算工具，为了支持用户登录管理、数据持久化和未来推广，需要进行后端化改造。

### 技术栈选择

| 分类 | 技术 | 版本 | 选择理由 |
|------|------|------|---------|
| 后端框架 | Node.js + Express | 20.x / 4.x | 轻量快速，与前端JS无缝衔接，学习成本低 |
| 数据库 | MySQL | 8.0+ | 成熟稳定，适合用户数据和计算记录存储 |
| ORM | Prisma | 5.x | 现代化ORM，类型安全，支持自动迁移 |
| 认证 | JWT + bcrypt | - | 无状态认证，安全可靠，易于实现 |
| API文档 | Swagger UI | 4.x | 便于前后端协作和API测试 |
| 前端 | 保持现状 | - | 现有HTML+JS，后续可升级为Vue/React |

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
- [ ] 添加登录/注册页面
- [ ] 添加用户信息展示区域
- [ ] 将前端计算调用改为API请求
- [ ] 集成JWT token管理
- [ ] 实现登录状态持久化
- [ ] 对接历史记录API

**修改文件**：
- `index.html` - 添加登录注册UI
- `js/app.js` - 添加API调用逻辑
- `js/data-management.js` - 修改数据存储逻辑

---

### 阶段5：部署与上线准备（预计1周）

**目标**：配置服务器环境，准备上线部署

**任务清单**：
- [ ] 配置生产环境变量
- [ ] 安装PM2进程管理器
- [ ] 配置Nginx反向代理
- [ ] 配置HTTPS（Let's Encrypt）
- [ ] 编写部署脚本
- [ ] 添加Swagger API文档

**输出文件**：
- `server/deploy.sh` - 部署脚本
- `server/Dockerfile`（可选）- Docker配置
- `server/swagger.json` - API文档配置

---

## 🗂️ 项目结构设计

```
EuriskoTax/
├── index.html                    # 主页面（前端）
├── README.md                     # 项目说明
├── DEVELOPMENT_PLAN.md           # 开发计划文档
├── js/                           # 前端JavaScript
│   ├── app.js                    # 应用主逻辑
│   ├── tax-calculator.js         # 前端计算逻辑（保留作为降级方案）
│   ├── utils.js                  # 工具函数
│   ├── export-utils.js           # 导出功能
│   ├── data-management.js        # 数据管理
│   └── navigation-ui.js          # 导航和UI
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

### 认证接口

| 接口 | 方法 | 路径 | 说明 |
|------|------|------|------|
| 用户注册 | POST | `/api/auth/register` | 创建新用户 |
| 用户登录 | POST | `/api/auth/login` | 用户登录，返回JWT |
| 用户登出 | POST | `/api/auth/logout` | 清除token（前端处理） |
| 获取用户信息 | GET | `/api/auth/profile` | 获取当前用户信息 |
| 更新用户信息 | PUT | `/api/auth/profile` | 更新用户信息 |
| 密码重置 | POST | `/api/auth/reset-password` | 重置密码 |

### 计算接口

| 接口 | 方法 | 路径 | 说明 |
|------|------|------|------|
| 综合所得计算 | POST | `/api/calculations/comprehensive` | 正向计税 |
| 经营所得计算 | POST | `/api/calculations/business` | 经营所得 |
| 分类所得计算 | POST | `/api/calculations/classification` | 分类所得 |
| 反向倒算 | POST | `/api/calculations/reverse` | 反向倒算 |
| 获取历史记录 | GET | `/api/calculations/history` | 获取用户计算历史 |
| 获取单条记录 | GET | `/api/calculations/:id` | 获取单个计算记录 |
| 删除记录 | DELETE | `/api/calculations/:id` | 删除计算记录 |

---

## 📊 开发进度追踪

| 阶段 | 状态 | 预计时间 | 负责人 |
|------|------|----------|--------|
| 阶段1：后端基础架构 | ✅ 已完成 | 1周 | - |
| 阶段2：用户认证系统 | ✅ 已完成 | 1周 | - |
| 阶段3：计算逻辑迁移 | ✅ 已完成 | 1.5周 | - |
| 阶段4：前端改造集成 | ✅ 已完成 | 1周 | - |
| 阶段5：数据库配置与测试 | ✅ 已完成 | 1周 | - |

---

## 🛡️ 安全注意事项

1. **密码安全**：使用bcrypt加密存储，禁止明文存储
2. **JWT安全**：设置合理过期时间（如1小时），使用refresh token机制
3. **输入验证**：服务端二次验证所有输入，防止SQL注入和XSS攻击
4. **HTTPS**：生产环境必须启用HTTPS
5. **日志脱敏**：日志中不记录密码等敏感信息

---

## 📝 下一步行动

1. **确认技术栈**：确认是否接受上述技术栈选择
2. **环境准备**：准备MySQL数据库环境
3. **开始实施**：从阶段1开始逐步实现

---

*文档创建时间：2026-05-25*
*版本：v1.0*
