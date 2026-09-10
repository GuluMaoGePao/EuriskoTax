# EuriskoTax API 参考文档

> **定位**: API 接口完整参考
> **适用**: 开发者集成、前端对接
> **版本**: v2.3
> **最后更新**: 2026年9月11日（同步 v1.7.1；v1.7.0：阶段10 免费/专业版体系——`User.plan` / `plan_expires_at` / `pro_granted_by`、种子期授权 `SEED_GRANT_PRO`、云端历史同步 `POST /api/calculations/sync`、政策内容端点 `GET /api/content/tax-policy`；运维后台用户端点 `GET /api/admin/users`、`GET /api/admin/users/:id`、`PATCH /api/admin/users/:id/plan`（见 §5.6-5.8）；反馈附图 `attachments` 校验与返回；v1.6.1：一键缓存清洗页 + 弹窗健壮性 + 表单校验优化）

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
| **X-Admin-Token** | 管理员接口 | 请求头 `X-Admin-Token: <ADMIN_TOKEN 环境变量值>`；用于 `/api/stats/overview`、`/api/invites`、`/api/feedback/admin`；未配置 `ADMIN_TOKEN` 返回 503 |
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
- `/api/auth/*` 全局限流：同 IP 15 分钟 10 次（`authLimiter`；`send-code` / `send-reset-code` 不计入）
- `/api/auth/send-code` 与 `/api/auth/send-reset-code` 合并限流：同 IP 15 分钟 5 次（`codeLimiter`）；同一邮箱 60 秒重发冷却（接口层 429）
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
| password | string | 是 | 密码（**至少 6 位**，服务端强制校验；注册/重置/改密一致） |
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

认证：JWT。响应：`{ id, username, email, phone, plan, plan_expires_at, pro_granted_by }`。

> 阶段10（v1.6.1+ 后端）：`plan` 为 `"free" | "pro"`；`plan_expires_at` 为 null 表示永久；`pro_granted_by` 标记授权来源（seed/invite/admin/purchase）。`SEED_GRANT_PRO=true` 时注册/登录即 pro（granted_by=seed）。

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

### 2.8 发送密码重置验证码（忘记密码）

**POST** `/api/auth/send-reset-code`（无需认证）

请求体：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| email | string | 是 | 注册邮箱 |

行为：仅对**已注册邮箱**发送 6 位数字重置验证码（10 分钟有效、60 秒重发冷却、同 IP 15 分钟最多 5 次，与注册验证码合并限流）。未注册邮箱返回 404 且**不发送邮件**（避免邮件轰炸）。
用途区分：验证码按 `register` / `reset` 两种用途独立存储，互不干扰。

典型错误：邮箱格式错误（400）、该邮箱未注册（404）、发送过于频繁（429）。

### 2.9 重置密码（忘记密码）

**POST** `/api/auth/reset-password`（无需认证）

请求体：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| email | string | 是 | 注册邮箱 |
| verificationCode | string | 是 | 2.8 发送的 6 位验证码（通过即作废） |
| newPassword | string | 是 | 新密码（**至少 6 位**，与注册校验一致） |

行为：校验邮箱已注册 → 校验重置验证码（一次性使用）→ 更新密码哈希。重置后原密码立即失效。

典型错误：参数缺失 / 密码过短 / 验证码无效或过期（400/429）、该邮箱未注册（404）。

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

### 3.8 计算历史云端同步（阶段10A · 专业版）

**POST** `/api/calculations/sync`

认证：JWT；**专业版**（`plan=pro`，`SEED_GRANT_PRO=true` 种子期注册/登录即 pro）。免费账号返回 403 `PRO_REQUIRED`（计税能力永不锁定，锁的仅是云端增值同步）。

设计：写主在本端（浏览器 localStorage），云端只是镜像。本端将增量 push 到云端，服务端按 `(user_id, client_id)` 幂等 upsert（`updatedAt` 新者胜，冲突不乱序），随后返回该账号全量活跃列表 + 已删 `clientId` 集合供本端 merge。

请求体：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| push | array | 是 | 本地增量条目，可为空数组（仅拉取） |

`push[]` 条目：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| clientId | string | 是 | 本地记录 id（幂等键，≤64 字符） |
| type | string | 是 | comprehensive / business / classification / reverse |
| data | object | 是* | 业务快照 `{ title, date, income, tax, results, ... }`（墓碑时可不填） |
| updatedAt | string | 是 | ISO 时间，本地最近变更时间（冲突新者胜依据） |
| deletedAt | string | 否 | 墓碑：非空表示该 clientId 已在本端删除 |

限制：单请求 ≤200 条、单条 ≤50KB、云端活跃历史 **500 条/账号**（超限 409 `HISTORY_LIMIT_REACHED`）、限流 20 次/分。

响应 `data`：`{ records: [{ clientId, type, data, updatedAt }], deletedClientIds: [...] }`

> 行为语义：幂等（同 clientId 重复推送不产生重复行）；冲突按 `updatedAt` 新者胜；删除先软删（墓碑）并广播 `deletedClientIds`，其它设备据此清除本地条目；墓碑 30 天后物理清理。

### 3.9 匿名计算埋点

**POST** `/api/stats/events`

认证：JWT。登录用户保存计算结果后，前端自动上报本次使用的计算类型（**匿名**，仅类型、不含任何收入/扣除等输入数据）：
body：`{ "type": "comprehensive" | "business" | "classification" | "reverse" }`

服务端按"北京时间日期 + 类型"日粒度聚合（`CalcEvent` 表），失败静默、不阻塞用户主流程。数据供 `GET /api/stats/overview` 计算统计使用；正常场景由前端自动触发，无需手动调用。

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
| attachments | string[] | 否 | 附图（选填）：前端压缩后的图片 data URL（png/jpeg/webp），最多 3 张、单张 ≤900K 字符 |

> 实现（v1.7.0）：反馈持久化到 `Feedback` 表（含附图），同时保留 `[FEEDBACK]` 日志便于实时提醒。category 白名单 bug/suggestion/other/general（非法值回退 general）；rating 仅接受 1-5 整数（非法传 null）；content ≤5000 字符；attachments 数量/类型/大小非法一律 400。

### 4.2 获取我的反馈列表

**GET** `/api/feedback`

认证：JWT。响应：`data: [{ id, category, rating, content, attachments, status, created_at }]`，按提交时间倒序。status 取值：open（待处理）/ resolved（已采纳）/ closed（已关闭）。

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
| calculations.total / today / byType | 计算总数 / 今日 / 按类型分布（读匿名埋点聚合表 CalcEvent；键 comprehensive/business/classification/reverse） |
| dailyTrend | 近 7 日趋势 `[{ date, newUsers, calculations }]` |

### 5.2 邀请码列表

**GET** `/api/invites`

响应：`{ total, availableCount, usedCount, available: [{ code, createdAt }], used: [{ code, usedBy, usedAt }] }`

### 5.3 生成邀请码

**POST** `/api/invites`

请求体：`{ "count": 1-100 }`（默认生成 20 个兜底码见 9.3）。响应（201）：`{ createdCount, codes: ["EURISKO-XXXX-XXXX", ...] }`。

### 5.4 反馈列表（管理员）

**GET** `/api/feedback/admin?status=open`

`status` 可选 open/resolved/closed（缺省返回全部）。响应：`data: [{ id, category, rating, content, status, created_at, user: { id, username, email } }]`，按提交时间倒序取最近 200 条。

### 5.5 更新反馈状态（管理员）

**PATCH** `/api/feedback/admin/:id`

请求体：`{ "status": "resolved" }`（open/resolved/closed）。用于跟进采纳状态与发放奶茶奖励。

### 5.6 用户列表（管理员）

**GET** `/api/admin/users?q=关键词&plan=free|pro&offset=0&limit=50`

`q` 匹配用户名或邮箱（子串、忽略大小写）；`plan` 可选 free/pro；`limit` 上限 100。响应：`{ total, offset, limit, items: [{ id, username, email, phone, plan, plan_expires_at, pro_granted_by, created_at, updated_at }] }`。

### 5.7 用户详情（管理员）

**GET** `/api/admin/users/:id`

响应：`{ user, counts: { feedback, calculations }, recentFeedback: [...], recentCalculations: [...] }`，用于判断数据规模与最近动态后调整权益。用户不存在返回 404。

### 5.8 调整用户计划（管理员）

**PATCH** `/api/admin/users/:id/plan`

请求体：`{ "plan": "pro" | "free", "expiresAt": "2026-10-01T00:00:00.000Z" | null, "grantedBy": "admin" }`

语义：`pro` + `expiresAt` 为空 → 永久专业版；`pro` + 未来时间 → 限时专业版（如补发 14 天体验）；`free` → 回落基础版（清空到期时间与来源）。`grantedBy` 默认 `admin`，取值范围 seed/invite/admin/purchase。响应返回更新后的用户信息。

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

### 6.2 忘记密码自助重置示例

```bash
# ① 向已注册邮箱发送重置验证码（未注册邮箱返回 404，不发送邮件）
curl -X POST https://euriskotax.zeabur.app/api/auth/send-reset-code \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com"}'
# → { "success": true, "data": { "cooldownMs": 60000 } }

# ② 提交新密码（verificationCode 为邮件中的 6 位数字）
curl -X POST https://euriskotax.zeabur.app/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","verificationCode":"123456","newPassword":"newsecret123"}'
# → { "success": true, "data": { "message": "Password reset successfully" } }

# ③ 用新密码登录
curl -X POST https://euriskotax.zeabur.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"newsecret123"}'
```

### 6.3 综合所得计算示例

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
| 重发验证码过快 | 429 | 同一邮箱 60 秒冷却（注册/重置共用） |
| 验证码尝试超限 | 429 | 同一码最多 5 次错误尝试 |
| 登录/验证码限流 | 429 | 15 分钟配额（10 次/5 次，两个发码端点合并计数） |
| 该邮箱未注册 | 404 | send-reset-code / reset-password（不发送邮件，防轰炸） |
| 密码少于 6 位 | 400 | register / reset-password / updateProfile 改密 |
| 邮箱或密码错误 | 401 | login |
| 当前密码错误 | 401 | verify-password / 改密 |
| 记录不存在 / 非本人 | 404 / 403 | calculations/:id |
| 参数校验失败 | 400 | 计算/反馈/邀请码 count 非法 |
| 免费版无云同步（code=PRO_REQUIRED） | 403 | calculations/sync |
| 云端历史上限 500 条（code=HISTORY_LIMIT_REACHED） | 409 | calculations/sync |
| 同步条目校验失败（code=INVALID_SYNC_ITEM） | 400 | calculations/sync |
| 同步请求过频 | 429 | calculations/sync（20 次/分） |
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
