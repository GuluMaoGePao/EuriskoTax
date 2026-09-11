# 阶段12 C1：税制参数配置化（管理台热改税率 + 可选公告联动）

> 状态：**已完成**（测试基线 17 套件 / 361 例全绿）
> 关联：`docs/development/stage12-core-enhancement-plan.md`（A 阶段）、`src/js/calculation/tax-constants.js`（注释中预留的 C1 契约）

---

## 1. 背景与目标

阶段12 A5 把税率表收敛为 `src/js/calculation/tax-constants.js` 的**代码常量**，解决了「散落多处、改一处漏一处」的问题，但政策调整仍需**改代码 → 重新发布**。

C1 目标：让税率成为**可运营配置**，做到

1. **管理台热改**：税务参数在运维后台可视化编辑，保存后对所有用户即时生效，无需发版；
2. **可选公告联动**：改动后可选择同步发一条更新公告（复用既有内容中心，不新增通知系统）；
3. **可审计可回滚**：每次保存即一个版本快照，历史保留、一键回滚；
4. **不牺牲离线**：断网 / 未联网仍能用最近一次配置（或出厂基线）完成计算。

## 2. 事实来源分层

| 层级 | 载体 | 角色 |
|------|------|------|
| 出厂基线 | `tax-constants.js` + 后端 `DEFAULT_TAX_RATES` | 离线兜底；库中无自定义配置时公开端点回退值 |
| 生效配置 | `TaxRateConfig`（最新 `published` 快照） | 管理台热改后的**唯一事实来源** |
| 端上缓存 | `localStorage.taxRatesCache` | 首屏同步重放 + 离线回退 |

> 三者字段结构一致，公开端点返回的 `source` 字段标注当前来源是 `custom` 还是 `default`。

## 3. 数据模型

`server/prisma/schema.prisma` 与 `schema.dev.prisma` 同步新增；PostgreSQL 迁移：`server/prisma/migrations/20260912_add_tax_rate_config/migration.sql`。

```prisma
model TaxRateConfig {
  id           Int      @id @default(autoincrement())
  version      String   @unique                 // 如 2026.2 / 2026.09.12-1
  status       String   @default("published")   // published / archived
  payload      String   @default("{}")          // JSON 全量税率配置
  note         String   @default("")            // 变更说明
  created_by   String   @default("admin")
  published_at DateTime @default(now())
  created_at   DateTime @default(now())

  @@index([status, published_at])
}
```

**payload 约定**：数组项为 `{ min?, max, rate, deduction }`；`classificationTaxRates` 为 `{ [key]: { rate, name } }`。
JSON 无法表达 `Infinity`，故**无上限的末级 `max` 存 `null`**；前端 `normalize` 时还原为 `Infinity`（消费方以 `taxableIncome <= bracket.max` 匹配，末级必须为无穷大）。

## 4. 端点契约

### 4.1 公开只读（无需登录）

`GET /api/config/tax-rates?since=<revision>`

```jsonc
{
  "success": true,
  "data": {
    "version": "2026.2",
    "revision": "a1b2c3d4e5f6",   // md5(payload) 前 12 位
    "publishedAt": "2026-09-12T...",
    "note": "按新政调整综合所得第 3 档税率",
    "source": "custom",            // custom | default
    "unchanged": false,            // since 命中时为 true
    "rates": { /* payload，unchanged 时为 null */ }
  }
}
```

- `Cache-Control: no-store`，改完即生效；
- 独立限流 `configLimiter`（60 次/分/IP）——端上仅启动/登录拉取一次并落盘，宽松上限只挡批量刷取。

### 4.2 管理端点（`X-Admin-Token`）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/tax-rates` | 当前配置 + 出厂基线 + 历史（近 30 条） |
| POST | `/api/admin/tax-rates` | 保存并发布新版本；body `{ version?, note?, rates, notify? }` |
| POST | `/api/admin/tax-rates/rollback` | `{ id, version?, note? }` 以历史版本为蓝本另存为新版本 |

`notify`（可选）结构：`{ enabled, title?, summary?, body?, placements? }`。
`enabled=true` 时在**同一请求内**联动：

1. 写入一条 `ContentItem`（`type=announcement`、`audience=all`、`item_id=taxrate_<version>`，默认投放 `modal` + `notice_list`）；
2. upsert 一条 `ContentRelease`（版本号加 `tax-` 前缀，避免与内容中心 `YYYY.MM.DD-N` 撞号）。

端上下次 `syncFeed` 即按既有内容中心机制展示弹窗/公告条——**不新增通知系统**。

## 5. 服务层校验（安全边界）

`server/src/services/taxRateService.js` 的 `prepareTaxRates(input)` 为**最终校验边界**，规则：

- 阶梯表（综合所得 / 月度 / 经营所得）：非空、级数 ≤ 15；
- 每级 `rate ∈ (0, 1]`、`deduction ≥ 0`；综合所得各级 `min ≥ 0`；
- 仅**末级**可无上限（留空或 `Infinity`）；
- 综合所得首级 `min = 0`，且**相邻级严格衔接**（上一级 `max` = 下一级 `min`）；
- 月度/经营所得各级 `max` 严格递增；
- 各级 `rate` **单调不减**（保持累进性）；
- 分类所得非空，各项 `rate ∈ (0, 1]`；
- 两个缴费基数下限 `≥ 0`。

校验失败返回 `400` + `error.details[]`（全部错误）。管理台 `api()` 已透传 `details`，可一次列全。

## 6. 前端数据流

```
tax-constants.js（出厂基线）
   │  模块加载时：captureBuiltin()
   ▼
tax-rates-sync.js  IIFE
   ├─ replay()      读 localStorage 缓存 → applyRates()  ← 同步执行，保证首屏计算即用最新值
   ├─ applyRates()  覆盖全局 comprehensiveTaxRates / bonusMonthlyTaxRates / businessTaxRates /
   │                classificationTaxRates / MIN_* / TAX_CONSTANTS_VERSION，并同步 EuriskoTaxConstants
   └─ load 事件 → syncNow(opts)
                    ├─ 带 since（指纹 + 新鲜期内）→ 服务端 unchanged 时 rates=null，仅刷新时间戳
                    ├─ 否则全量 → validate → applyRates → 写缓存
                    └─ 指纹变化时 emit 'euriskotax:tax-rates-updated'（首载不触发，避免误报）
```

**加载顺序**：`tax-rates-sync.js` 必须紧随 `tax-constants.js`（`index.html` 已如此安排），且在任何一次计算发生之前执行。

## 7. 管理台交互（「税率」Tab）

- 4 张税率表 + 2 个缴费基数下限的可视化编辑（税率以**百分数**编辑，提交前转小数）；
- 实时预校验（`trCheckBrackets`，规则与后端一致，仅为即时反馈）；
- 「保存并发布」→ 二次确认 → 后端为准，失败时展示 `details`；
- 「载入当前生效值」/「载入出厂基线」；
- 版本历史列表 + 一键回滚（`published` 版本的按钮禁用）；
- 「同步发送更新公告」勾选后展开标题 / 摘要 / 正文 / 投放位（`modal` / `notice_list` / `home_banner` / `assistant_qa`）。

## 8. 部署与迁移

```bash
# 1) 生成 Prisma Client（双 schema）
cd server && npx prisma generate

# 2) 应用迁移（生产 PostgreSQL；本地 SQLite 走 db push）
npx prisma migrate deploy

# 3) 校验：首次访问公开端点应返回 source=default（尚未发布过自定义配置）
curl https://<host>/api/config/tax-rates
```

> 首次发布前，公开端点回退出厂基线，端上行为与改造前**完全一致**，因此可以「先发版、再改参数」。

## 9. 验收与测试

- `tests/tax-rates.test.js`（20 例）：
  - `window.TaxRates` 契约（`applyRates` / `syncNow` / `replay` / `clearState` / `getState` / `pure.*`）；
  - 校验规则与后端对齐（坏配置被拒、基线通过、`Infinity` ≡ `null`）；
  - **热改生效**：`applyRates` 后 `calculateIncomeTax` / `calculateBonusTax` / `calculateSingleClassificationTax` 立即使用新税率；
  - 非法配置**不覆盖**全局；
  - 缓存重放与 `syncNow` 增量命中 / 网络失败静默。
- 全量 **17 套件 / 361 例通过**。

## 10. 已知取舍与后续可选

- 分类所得的**键增删**暂未在管理台开放（键为计算逻辑标识，固定 4 项），如需新增分类所得类型需同步改计算层；
- 公告送达依赖端上下次同步（与既有内容中心一致），非实时推送；
- 若后续需要「多地区/多政策版本并行」，可在 `TaxRateConfig` 增 `region` 维度并让公开端点按请求方选择——当前为**全局单版本**。
