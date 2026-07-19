# EuriskoTax API 参考文档

> **定位**: API接口完整参考  
> **适用**: 开发者集成、前端对接  
> **版本**: v1.2  
> **最后更新**: 2026年7月20日

---

## 目录

1. [基础信息](#1-基础信息)
2. [认证接口](#2-认证接口)
3. [计算接口](#3-计算接口)
4. [请求/响应示例](#4-请求响应示例)
5. [错误码](#5-错误码)
6. [环境变量配置](#6-环境变量配置)

---

## 1. 基础信息

### 1.1 访问地址

| 环境 | 地址 |
|------|------|
| 本地开发 | http://localhost:3000 |
| Swagger UI | http://localhost:3000/api/docs |
| OpenAPI JSON | http://localhost:3000/api/docs.json |

### 1.2 认证方式

- **JWT Token**: 在请求头中携带 `Authorization: Bearer <token>`
- **无认证接口**: `/api/health`

### 1.3 通用响应格式

```json
{
    "success": true,
    "data": {},
    "message": "操作成功"
}
```

---

## 2. 认证接口

### 2.1 用户注册

**POST** `/api/auth/register`

**请求体**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| username | string | 是 | 用户名 |
| email | string | 是 | 邮箱 |
| password | string | 是 | 密码（6-20位） |

**响应**:

| 字段 | 类型 | 说明 |
|------|------|------|
| id | number | 用户ID |
| username | string | 用户名 |
| email | string | 邮箱 |
| created_at | string | 创建时间 |

### 2.2 用户登录

**POST** `/api/auth/login`

**请求体**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| email | string | 是 | 邮箱 |
| password | string | 是 | 密码 |

**响应**:

| 字段 | 类型 | 说明 |
|------|------|------|
| token | string | JWT Token |
| user | object | 用户信息 |

### 2.3 获取用户信息

**GET** `/api/auth/profile`

**认证**: 需要JWT Token

**响应**:

| 字段 | 类型 | 说明 |
|------|------|------|
| id | number | 用户ID |
| username | string | 用户名 |
| email | string | 邮箱 |

### 2.4 更新用户信息

**PUT** `/api/auth/profile`

**认证**: 需要JWT Token

**请求体**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| username | string | 否 | 用户名 |
| email | string | 否 | 邮箱 |

### 2.5 密码重置

**POST** `/api/auth/reset-password`

**请求体**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| email | string | 是 | 邮箱 |

---

## 3. 计算接口

### 3.1 综合所得计算

**POST** `/api/calculations/comprehensive`

**认证**: 需要JWT Token

**请求体**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| workMonths | number | 是 | 工作月数（1-12） |
| salaryIncome | number | 是 | 工资薪金（元/月） |
| laborIncome | number | 否 | 劳务报酬（元/年） |
| authorIncome | number | 否 | 稿酬所得（元/年） |
| royaltyIncome | number | 否 | 特许权使用费（元/年） |
| bonusIncome | number | 否 | 年终奖（元/年） |
| bonusInclude | boolean | 否 | 是否并入综合所得 |
| prepaidTax | number | 否 | 已预缴税额 |
| specialDeduction | object | 是 | 专项扣除 |
| specialAdditional | object | 是 | 专项附加扣除 |
| otherDeduction | object | 是 | 其他扣除 |

**specialDeduction 结构**:

| 字段 | 类型 | 说明 |
|------|------|------|
| pensionInsurance | number | 养老保险（元/月） |
| medicalInsurance | number | 医疗保险（元/月） |
| unemploymentInsurance | number | 失业保险（元/月） |
| housingFund | number | 住房公积金（元/月） |

**specialAdditional 结构**:

| 字段 | 类型 | 说明 |
|------|------|------|
| elderly | number | 赡养老人（元/月） |
| childrenInfant | number | 子女教育/婴幼儿照护（元/月） |
| housing | number | 住房租金/贷款利息（元/月） |
| education | number | 继续教育（元/月） |
| medical | number | 大病医疗（元/年） |
| professional | boolean | 是否有职业资格继续教育 |

**otherDeduction 结构**:

| 字段 | 类型 | 说明 |
|------|------|------|
| pension | number | 个人养老金（元/年） |
| enterpriseAnnuity | number | 企业年金（元/年） |
| insuranceOther | number | 商业健康保险（元/年） |
| taxDeferredPension | number | 税延型养老保险（元/年） |
| charitableDonation | number | 慈善捐赠（元/年） |

### 3.2 经营所得计算

**POST** `/api/calculations/business`

**认证**: 需要JWT Token

**请求体**:

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
| specialDeduction | object | 否 | 专项扣除（社保/公积金） |
| specialAdditionalDeduction | object | 否 | 专项附加扣除 |
| otherDeduction | object | 否 | 其他扣除 |

**specialDeduction 结构**:

| 字段 | 类型 | 说明 |
|------|------|------|
| pensionInsurance | number | 养老保险（元/月） |
| medicalInsurance | number | 医疗保险（元/月） |
| unemploymentInsurance | number | 失业保险（元/月） |
| housingFund | number | 住房公积金（元/月） |

### 3.3 分类所得计算

**POST** `/api/calculations/classification`

**认证**: 需要JWT Token

**请求体**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| interestIncome | number | 否 | 利息、股息、红利所得（元） |
| rentIncome | number | 否 | 财产租赁所得（元） |
| transferIncome | number | 否 | 财产转让所得（元） |
| transferCost | number | 否 | 财产原值（元） |
| accidentalIncome | number | 否 | 偶然所得（元） |

### 3.4 反向倒算

**POST** `/api/calculations/reverse`

**认证**: 需要JWT Token

**请求体**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| targetTax | number | 否 | 目标税额（元/年） |
| targetNet | number | 否 | 目标到手金额（元/年） |
| targetRate | number | 否 | 目标税率（0-1） |
| targetMonthlyNet | number | 否 | 目标月度到手金额（元） |
| workMonths | number | 是 | 工作月数 |
| specialDeduction | object | 是 | 专项扣除 |
| specialAdditional | object | 是 | 专项附加扣除 |
| otherDeduction | object | 是 | 其他扣除 |
| bonusIncome | number | 否 | 年终奖 |
| bonusInclude | boolean | 否 | 是否并入综合所得 |

### 3.5 获取计算历史

**GET** `/api/calculations/history`

**认证**: 需要JWT Token

**查询参数**:

| 参数 | 类型 | 说明 |
|------|------|------|
| type | string | 计算类型过滤（comprehensive/business/classification/reverse） |

### 3.6 获取单条记录

**GET** `/api/calculations/:id`

**认证**: 需要JWT Token

### 3.7 更新记录

**PUT** `/api/calculations/:id`

**认证**: 需要JWT Token

### 3.8 删除记录

**DELETE** `/api/calculations/:id`

**认证**: 需要JWT Token

---

## 4. 请求/响应示例

### 4.1 综合所得计算示例

**请求**:
```json
{
    "workMonths": 12,
    "salaryIncome": 10000,
    "specialDeduction": {
        "pensionInsurance": 800,
        "medicalInsurance": 200,
        "unemploymentInsurance": 50,
        "housingFund": 500
    },
    "specialAdditional": {
        "elderly": 1000,
        "childrenInfant": 1000,
        "housing": 1500
    },
    "otherDeduction": {}
}
```

**响应**:
```json
{
    "success": true,
    "data": {
        "workMonths": 12,
        "incomeDetails": {
            "salary": 10000,
            "total": 120000
        },
        "deductionDetails": {
            "specialDeductionTotal": 18600,
            "specialAdditionalTotal": 42000,
            "total": 120600
        },
        "taxDetails": {
            "taxableIncome": 3400,
            "totalTax": 102,
            "applicableRate": 0.03,
            "netIncome": 119898
        }
    }
}
```

---

## 5. 错误码

| 错误码 | HTTP状态码 | 说明 |
|--------|-----------|------|
| AUTH_001 | 401 | 未授权，请登录 |
| AUTH_002 | 401 | Token已过期 |
| AUTH_003 | 401 | Token无效 |
| AUTH_004 | 400 | 用户已存在 |
| AUTH_005 | 400 | 邮箱或密码错误 |
| CALC_001 | 400 | 参数验证失败 |
| CALC_002 | 500 | 计算错误 |
| CALC_003 | 404 | 计算记录不存在 |
| DB_001 | 500 | 数据库操作失败 |

---

## 6. 环境变量配置

### 6.1 必填变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `JWT_SECRET` | JWT签名密钥 | 必需 |

### 6.2 可选变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `DATABASE_URL` | 数据库连接地址 | `file:./dev.db` |
| `NODE_ENV` | 运行环境 | `development` |
| `PORT` | 服务端口 | `3000` |
