# EuriskoTax API 参考文档

> **定位**: API 接口完整参考
> **适用**: 开发者集成、前端对接
> **版本**: v2.0
> **最后更新**: 2026年9月6日（同步 v1.4.0：注册改为邮箱验证码 + 一机一码邀请码，新增反馈/运营统计/邀请码管理端点）

---

## 目录

1. [基础信息](#1-基础信息)
2. [认证接口](#2-认证接口)
3. [计算接口](#3-计算接口)
4. [用户反馈](#4-用户反馈)
5. [管理员运营接口](#5-管理员运营接口)
6. [请求/响应示例](#6-请求响应示例)
7. [错误码](#7-错误码)
8. [环境变量配置](#8-环境变量配置)
9. [附录：注册流程与邀请码](#9-附录注册流程与邀请码)

---

## 1. 基础信息

### 1.1 访问地址

| 环境 | 地址 |
|------|------|
| 生产环境 | https://euriskotax.zeabur.app |
| 本地开发 | http://localhost:3000 |
| Swagger UI | http://localhost:3000/api/docs |
| OpenAPI JSON | http://localhost:3000/api/docs.json |

### 1.2 认证方式

| 方式 | 使用位置 | 说明 |
|------|---------|------|
| **JWT Bearer** | 用户接口 | 请求头 `Authorization: Bearer <token>`；登录返回，默认 7 天有效（`JWT_EXPIRES_IN` 可调） |
| **X-Admin-Token** | 管理员接口 | 请求头 `X-Admin-Token: <ADMIN_TOKEN 环境变量值>`；用于 `/api/stats`、`/api/invites` |
| 无认证 | 计算类 / 健康检查 | 见各接口标注 |

### 1.3 通用响应格式

成功：

```json
{ "success": true, "data": { } }
```

失败：

```json
{ "success": false, "error": { "message": "错误描述", "statusCode": 400 } }
```

### 1.4 通用限制

- 请求体上限 1MB
- `/api/auth/*` 全局限流：同 IP 15 分钟 10 次（`authLimiter`）
- `/api/auth/send-code` 额外限流：同 IP 15 分钟 5 次（`codeLimiter`）；同一邮箱 60 秒重发冷却（接口层 429）
- 邮箱统一小写化存储与匹配

---

## 2. 认证接口

### 2.1 发送注册邮箱验证码

**POST** `/api/auth/send-code`

请求体：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| email | string | 是 | 注册邮箱（未注册过的邮箱） |

行为：发送 6 位数字验证码邮件，10 分钟有效，60 秒重发冷却，每邮箱+用途仅保留最新一条（旧码自动作废）。**已注册邮箱直接拦截并提示登录**，不消耗验证码。

响应：

| 字段 | 类型 | 说明 |
|------|------|------|
| cooldownMs | number | 重发冷却毫秒数（60000），供前端倒计时 |

### 2.2 用户注册

**POST** `/api/auth/register`

请求体：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| username | string | 是 | 用户名（唯一） |
| email | string | 是 | 邮箱（唯一，小写归一化） |
| password | string | 是 | 密码（服务端不强制复杂度，建议 ≥6 位） |
| phone | string | 否 | 手机号 |
| inviteCode | string | 是 | **一机一码邀请码**（`EURISKO-XXXX-XXXX`，需向开发者获取） |
| verificationCode | string | 是 | 邮箱验证码（先调 2.1 发送） |

校验顺序：必填 → 查重（避免浪费一次性验证码）→ 邮箱验证码校验（通过即作废）→ **事务内**创建用户 + 原子消耗邀请码。

响应（201）：注册返回用户对象（**不含 token**，注册成功后引导走登录）：

| 字段 | 类型 | 说明 |
|------|------|------|
| id | number | 用户ID |
| username | string | 用户名 |
| email | string | 邮箱 |
| phone | string/null | 手机号 |
| created_at | string | 创建时间 |

典型错误：用户名/邮箱已存在（400）、验证码无效/过期/尝试超限（400/429）、邀请码不存在或已被使用（403）、验证码发送过于频繁（429）。

### 2.3 用户登录

**POST** `/api/auth/login`

请求体：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| email | string | 是 | 邮箱 |
| password | string | 是 | 密码 |

响应：

| 字段 | 类型 | 说明 |
|------|------|------|
| token | string | JWT（Bearer） |
| user | object | `{ id, username, email, phone }` |

### 2.4 获取用户信息

**GET** `/api/auth/profile`

认证：JWT。响应：`{ id, username, email, phone }`。

### 2.5 更新用户信息

**PUT** `/api/auth/profile`

认证：JWT。请求体（部分更新）：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| username | string | 否 | 用户名 |
| email | string | 否 | 邮箱 |
| phone | string | 否 | 手机号 |
| password | string | 否 | 新密码（此时必须带 currentPassword） |
| currentPassword | string | 条件 | 修改密码时必填，校验原密码 |

### 2.6 删除账号

**DELETE** `/api/auth/profile`

认证：JWT。级联删除该用户计算历史。响应：`{ message }`。

### 2.7 校验当前密码

**POST** `/api/auth/verify-password`

认证：JWT。请求体：`{ currentPassword }`。响应：`{ valid: boolean }`（用于个人中心"修改密码前验证当前密码"）。

---

## 3. 计算接口

> 注意：当前路由实现中，**四个计算端点（comprehensive/reverse/business/classification）未强制 JWT**（云端只做透传计算，前端本地已完成校验与渲染）；历史记录相关接口（history/:id）需要 JWT。若后续需要服务端留痕/防滥用，可统一收敛为需认证。

### 3.1 综合所得计算

**POST** `/api/calculations/comprehensive`

请求体：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| workMonths | number | 是 | 工作月数（1-12） |
| salaryIncome | number | 是 | 工资薪金（元/月） |
| laborIncome | number | 否 | 劳务报酬（元/年） |
| authorIncome | number | 否 | 稿酬所得（元/年） |
| royaltyIncome | number | 否 | 特许权使用费（元/年） |
| bonusIncome | number | 否 | 年终奖（元/年） |
| bonusInclude | boolean | 否 | 年终奖是否并入综合所得 |
| prepaidTax | number | 否 | 已预缴税额 |
| specialDeduction | object | 是 | 专项扣除（社保/公积金，元/月） |
| specialAdditional | object | 是 | 专项附加扣除（元/月） |
| otherDeduction | object | 是 | 其他扣除（元/年） |

**specialDeduction**：`pensionInsurance / medicalInsurance / unemploymentInsurance / housingFund`（元/月）
**specialAdditional**：`elderly / childrenInfant / housing / education / medical / professional`（元/月，medical 为元/年）
**otherDeduction**：`pension / enterpriseAnnuity / insuranceOther / taxDeferredPension / charitableDonation`（元/年）

### 3.2 经营所得计算

**POST** `/api/calculations/business`

请求体：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| businessIncome | number | 是 | 经营收入（元/年） |
| businessCost | number | 是 | 成本（元/年） |
| businessExpenses | number | 是 | 费用（元/年） |
| businessTaxes | number | 否 | 税金（元/年） |
| businessLosses | number | 否 | 损失（元/年） |
| businessOtherExpenses | number | 否 | 其他支出（元/年） |
| businessPreviousLosses | number | 否 | 以前年度亏损（元/年） |
| hasComprehensiveIncome | boolean | 是 | 是否有综合所得 |
| workMonths | number | 是 | 年工作总月数（1-12） |
| investorDeduction | number | 否 | 投资者减除费用 |
| specialDeduction | object | 否 | 专项扣除（元/月） |
| specialAdditionalDeduction | object | 否 | 专项附加扣除 |
| otherDeduction | object | 否 | 其他扣除 |

### 3.3 分类所得计算

**POST** `/api/calculations/classification`

请求体：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| interestIncome | number | 否 | 利息、股息、红利所得（元） |
| rentIncome | number | 否 | 财产租赁所得（元） |
| transferIncome | number | 否 | 财产转让所得（元） |
| transferCost | number | 否 | 财产原值（元） |
| accidentalIncome | number | 否 | 偶然所得（元） |

### 3.4 反向倒算

**POST** `/api/calculations/reverse`

请求体（四个目标至少一个）：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| targetTax | number | 否 | 目标税额（元/年） |
| targetNet | number | 否 | 目标到手金额（元/年） |
| targetRate | number | 否 | 目标税率（0-1） |
| targetMonthlyNet | number | 否 | 目标月度到手金额（元） |
| workMonths | number | 是 | 工作月数 |
| specialDeduction / specialAdditional / otherDeduction | object | 是 | 同 3.1 结构 |
| bonusIncome | number | 否 | 年终奖 |
| bonusInclude | boolean | 否 | 是否并入综合所得 |

### 3.5 获取计算历史

**GET** `/api/calculations/history`

认证：JWT。查询参数：`limit`（默认 20）、`offset`（默认 0）。响应按时间倒序的 `{ id, type, input_data, result_data, created_at }[]`。

### 3.6 获取单条记录 / 3.7 删除记录

**GET** `/api/calculations/:id` · **DELETE** `/api/calculations/:id`

认证：JWT。仅可访问/删除自己的记录；不存在或非本人返回 404/403。

---

## 4. 用户反馈

### 4.1 提交反馈

**POST** `/api/feedback`

认证：JWT。请求体：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| category | string | 否 | 分类（general/bug/suggestion） |
| content | string | 是 | 内容（≤5000 字符） |
| rating | number | 否 | 评分 |

> 当前实现：反馈记录到服务端日志（`[FEEDBACK]` 前缀，生产可用 Zeabur 日志/邮件转发跟进）。**尚未落库**（代码留 TODO：schema 新增 Feedback 模型后持久化）。GET 当前返回空列表。

### 4.2 获取我的反馈列表

**GET** `/api/feedback`

认证：JWT。响应：`data: []`（待持久化后返回真实列表）。

---

## 5. 管理员运营接口

> 全部需要请求头 `X-Admin-Token` = 环境变量 `ADMIN_TOKEN` 的值；未配置 `ADMIN_TOKEN` 时返回 503。

### 5.1 运营统计概览

**GET** `/api/stats/overview`

响应：

| 字段 | 说明 |
|------|------|
| generatedAt | 生成时间 |
| users.total / newToday | 注册总数 / 今日新增（按北京时间划分日期） |
| calculations.total / today / byType | 计算总数 / 今日 / 按类型分布 `{type: count}` |
| dailyTrend | 近 7 日趋势 `[{ date, newUsers, calculations }]` |

### 5.2 邀请码列表

**GET** `/api/invites`

响应：`{ total, availableCount, usedCount, available: [{ code, createdAt }], used: [{ code, usedBy, usedAt }] }`

### 5.3 生成邀请码

**POST** `/api/invites`

请求体：`{ "count": 1-100 }`（默认生成 20 个兜底码见 9.3）。响应（201）：`{ createdCount, codes: ["EURISKO-XXXX-XXXX", ...] }`。

---

## 6. 请求/响应示例

### 6.1 完整注册流程

```bash
# ① 发送验证码
curl -X POST https://euriskotax.zeabur.app/api/auth/send-code \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com"}'
# → { "success": true, "data": { "cooldownMs": 60000 } }

# ② 注册（verificationCode 为邮件中的 6 位数字，inviteCode 向开发者获取）
curl -X POST https://euriskotax.zeabur.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"zhangsan","email":"user@example.com","password":"secret123","inviteCode":"EURISKO-XXXX-XXXX","verificationCode":"123456"}'

# ③ 登录拿 token
curl -X POST https://euriskotax.zeabur.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"secret123"}'
```

### 6.2 综合所得计算示例

请求：

```json
{
    "workMonths": 12,
    "salaryIncome": 10000,
    "specialDeduction": { "pensionInsurance": 800, "medicalInsurance": 200, "unemploymentInsurance": 50, "housingFund": 500 },
    "specialAdditional": { "elderly": 1000, "childrenInfant": 1000, "housing": 1500 },
    "otherDeduction": {}
}
```

响应（节选）：

```json
{
    "success": true,
    "data": {
        "workMonths": 12,
        "incomeDetails": { "salary": 10000, "total": 120000 },
        "deductionDetails": { "specialDeductionTotal": 18600, "specialAdditionalTotal": 42000, "total": 120600 },
        "taxDetails": { "taxableIncome": 3400, "totalTax": 102, "applicableRate": 0.03, "netIncome": 119898 }
    }
}
```

---

## 7. 错误码

| 错误码/场景 | HTTP 状态码 | 说明 |
|--------|-----------|------|
| 未登录 / Token 无效 / 过期 | 401 | 携带有效 Bearer token |
| 用户名或邮箱已存在 | 400 | register / updateProfile |
| 验证码未请求 / 已过期 / 错误 | 400 | register / send-code |
| 邀请码不存在 | 403 | register |
| 邀请码已被使用 | 403 | register（一机一码） |
| 重发验证码过快 | 429 | 同一邮箱 60 秒冷却 |
| 验证码尝试超限 | 429 | 同一码最多 5 次错误尝试 |
| 登录/验证码限流 | 429 | 15 分钟配额（10 次/5 次） |
| 邮箱或密码错误 | 401 | login |
| 当前密码错误 | 401 | verify-password / 改密 |
| 记录不存在 / 非本人 | 404 / 403 | calculations/:id |
| 参数校验失败 | 400 | 计算/反馈/邀请码 count 非法 |
| 管理员令牌缺失/错误 | 401 / 503 | stats、invites |

---

## 8. 环境变量配置

### 8.1 必填变量（生产）

| 变量名 | 说明 |
|--------|------|
| `JWT_SECRET` | JWT 签名密钥（生产启动强校验，弱密钥直接退出） |
| `DATABASE_URL` | PostgreSQL 连接串（生产启动校验必须非 dev.db） |
| `NODE_ENV` | `production` 触发生产校验 |

### 8.2 必填变量（启用邮箱验证码注册时）

| 变量名 | 说明 |
|--------|------|
| `SMTP_HOST` | SMTP 服务器（如 smtp.qq.com） |
| `SMTP_USER` | 发件邮箱 |
| `SMTP_PASS` | 授权码 |
| `SMTP_PORT` | 可选，默认 465（465 走 SSL，587 走 STARTTLS） |
| `SMTP_SECURE` | 可选，`true/false`（缺省按端口推断） |
| `SMTP_FROM_NAME` | 可选，发件显示名，默认 EuriskoTax |

> ⚠️ 未配置 SMTP 时 send-code 返回失败，注册无法完成。生产环境务必在 Zeabur 面板配置。

### 8.3 可选变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `PORT` | 服务端口 | `3000` |
| `CORS_ORIGIN` | 允许的前端来源（逗号分隔？当前单值） | `*`（生产务必限定） |
| `ADMIN_TOKEN` | 管理员令牌（stats/invites 用） | 未配置则管理员接口 503 |
| `JWT_EXPIRES_IN` | token 有效期 | `7d` |
| `BCRYPT_ROUNDS` | bcrypt 轮数 | `10` |
| `DATABASE_URL` | 本地开发为 SQLite（schema.dev.prisma） | `file:./dev.db` |

---

## 9. 附录：注册流程与邀请码

1. **获取邀请码**：公测期间每码仅可注册一个账号。开发者通过 Zeabur 面板执行 `POST /api/invites`（带 `X-Admin-Token`）或本地 GUI「邀请码管理」一键生成后分发。
2. **用户注册路径**：输入邮箱 → 点「发送验证码」（60s 冷却倒计时）→ 收到 6 位数字邮件 → 填入验证码 + 邀请码 + 用户名密码 → 注册成功 → 自动跳转登录。
3. **兜底机制**：服务启动时若 `InviteCode` 表为空，自动批量生成 20 个并打印到启动日志（幂等，非空不生成），防止"无码可用"。
4. 历史固定邀请码 `EURISKO2026BETA` 已废弃，不再接受。
