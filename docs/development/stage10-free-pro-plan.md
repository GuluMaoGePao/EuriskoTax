# 阶段10：免费 / 专业版体系 实施方案（v0.1 · 已确认待命）

> 对应 [development-plan.md](./development-plan.md)「阶段10：免费/专业版体系」。
> 规划日期：2026-09-07 · 项目版本基线：v1.6.0（含 SW 网络优先瘦缓存、反馈落库闭环、匿名计算埋点）
> 状态：**已确认 · 待命执行**（2026-09-07 决策评审通过，见文末决策记录）
> **执行优先级：暂缓** —— 当前聚焦阶段8（冷启动/反馈运营），本方案存档待阶段8 收官后开工。

---

## 0. 结论先行（TL;DR）

阶段10 的目标是**把"免费版"从隐性状态变成产品分层机制**，并为将来收费预留开关。结合公测期现状（注册仍需邀请码一机一码、用户是种子用户），本方案建议：

- **10A（先做，≈4-5 天）**：账户分层数据模型 + 云端历史同步（专业版核心卖点）+ 免费/专业 gate UI。种子用户"登录即专业版"。
- **10B（后置，≈2-3 天）**：汇算清缴 PDF 完整报告（升级现有 `exportToPDF`）、政策更新推送。
- **支付不进入本次范围**：收费体系（支付网关/兑换码）单列阶段11，待种子期验证 PMF 后开通。本阶段所有分层 gate 一次做对，收费时只"翻转开关 + 加支付后端"。

**设计铁律（沿袭商业定调）**：计税能力永不锁定；锁定的是**云端增值**（多设备同步、PDF 报告、政策推送）。

---

## 1. 现状盘点（基于 v1.6.0 代码）

| 能力 | 现状 | 对阶段10 的意义 |
|------|------|-----------------|
| 计算引擎 | 全前端本地（`tax-calculator.js` 2586 行），`/api/calculations/*` 已不再落库 | 免费版成本≈0 的前提，**保持不动** |
| 本地历史 | `localStorage['taxCalculationHistory']` 唯一数据源；`data-management.js` 提供 `saveCalculationResult` / `loadHistoryRecords` / `deleteHistoryRecord`；条目结构 `{id, type, title, date, results, income, tax}` | 同步引擎挂接点已清晰 |
| 云端历史 API | `GET/POST /api/calculations/history`、`GET/DELETE /:id` 存在但前端基本不再调用（1.5.1 后"尽力删残留"） | 需改造为**同步协议**（见 §4），而非逐个 CRUD |
| 认证/会话 | JWT + 记住我；`current_user` 存本地；`isLoggedIn()` | 分层判定的基础 |
| 离线 | `EuriskoTaxNet.isOnline` + SW 网络优先瘦缓存 + `tax-assistant` 反馈"离线本地成功"模式 | 同步队列的离线挂起/恢复思路可复用 |
| 导出 | 结果页 `exportToPDF()`（jsPDF+html2canvas 分页截图，`navigation-ui.js`）已有完整实现；JSON/CSV 导出已有 | PDF 报告是**升级**不是从零 |
| 图表/PDF 库 | Chart.js / jsPDF / autotable / html2canvas 均已 CDN 引入 | 10B 无需新增依赖 |
| 税务助手 | 数据内置 `tax-assistant.js`；基于本地历史给建议 | 10B 政策推送做"内置 + 增量更新" |
| 反馈 | `POST/GET /api/feedback` 落库 + 管理员 `GET/PATCH /api/feedback/admin` 跟进（v1.6.0） | 复用，不改 |

**关键缺口**（10A 要补）：
1. `users` 表无 plan 字段 —— 无法表达"专业版"身份；
2. 没有真正可用的"云端写回 + 多设备拉取"闭环；
3. 前端无"功能级 gate"（免费/专业判定层）。

---

## 2. 待决策产品问题（先确认再排期）

> **D1｜收费节奏（影响 10A 是否做支付层）**
> - 选项 A（推荐）：种子公测期"登录即专业版"，机制先跑通；收费整体后置到阶段11。
> - 选项 B：本次就做兑换码体系（管理员发码/邀请码附带 pro 授权），仍不接支付网关。
> - 选项 C：直接接微信/支付宝支付（工作量 +3~5 天，公测期不划算，不推荐）。

> **D2｜PDF 报告模板优先面向谁（影响 10B 模板编排）**
> - 选项 A：C 端个人汇算报告（封面 + 收入/扣除明细 + 税负对比 + 政策提示）。
> - 选项 B：HR/代账批量测算表（含多员工汇总，偏 B 端，与"B端 API"呼应）。

> **D3｜云历史上限**
> 建议专业版 500 条/账号、单条 ≤ 50KB（body 1MB 限流已兜底）。是否调整？

---

## 3. 产品分层设计

### 3.1 分层定义

| 状态 | 定义 | 能力 |
|------|------|------|
| 游客（未登录） | 免费版 | 全部计税功能、本地历史、基础截图导出 —— **与今天完全一致** |
| 免费用户（已登录 free） | 免费版 | 同游客 + 账号权益；**无云同步**（生产默认态，未启用前均为 pro） |
| 专业用户（已登录 pro） | 专业版 | 云端同步/多设备漫游、汇算清缴 PDF 报告、政策更新推送 |

### 3.2 账户模型最小改动

`users` 表新增（`schema.prisma` + dev schema + 迁移）：

```prisma
plan            String   @default("free")   // "free" | "pro"
plan_expires_at DateTime?                    // null = 永久
pro_granted_by  String?                      // "seed" | "invite" | "admin" | "purchase"
```

- 种子期（10A 默认）：`SEED_GRANT_PRO=true` 环境变量开启时，注册/登录即授予 `pro`（granted_by="seed"）；生产切收费时置 false。
- 管理端：邀请码发放接口可带 `pro=1`（`granted_by="invite"`），管理员 API 可直接授予/吊销。
- `GET /api/auth/profile` 返回 `plan` + `planExpiresAt`；前端 `current_user` 同步携带。

### 3.3 前端 gate 统一出口

新增 `src/js/auth/plan.js`（可复用模块，最终 `window.PlanGate` 全局）：

```js
// 对外 API
PlanGate.isPro()            // 登录 && plan==='pro'（且未过期）
PlanGate.requirePro(feature) // 非 pro 时弹登录/升级引导 → 返回 false
PlanGate.getLabel()         // "专业版" / "免费版" / "登录解锁云同步"
```

**锁定面**（`index.html` 按钮 + 各模块调用点加 gate）：
- 云同步开关入口（个人中心 → 数据管理）
- PDF 完整报告按钮（区分免费"结果截图 PDF"与专业"汇算报告 PDF"）
- 政策更新入口（10B）

**铁律**：`tax-calculator.js` 计算链路、四个计算页、本地历史读写一律**不 gate**。

---

## 4. 云端历史同步协议（10A 核心工程）

### 4.1 设计取舍

- **写主在本端**：计算永远发生在本机（离线也可用），云端只是镜像。
- **同步粒度为"登录设备全量快照"而非实时每算一存**：计算不动网、不因限流失败，登录后/联网后一次 flush。用户量小、单账号记录 <500 条，全量 diff 足够快且**正确性易证明**，代码量最小。记录量增长后再升级增量游标（预留扩展位）。
- **幂等键**：本地记录已有 `id`（现为时间戳/随机串），改造为可选 `clientId`（原 id 即为 clientId，无需新生成）+ 新增 `serverId`/`updatedAt`/`deletedAt`。

### 4.2 同步流程

```
本地记录结构扩展：
{ id(clientId), serverId?, type, title, date, input, result, income, tax,
  updatedAt, deletedAt? }

1) 触发点：登录成功后 / 页面可见时 / EuriskoTaxNet.online 恢复时
2) SyncEngine.upload()：
   POST /api/calculations/sync  { push: [ 本地 updatedAt>lastSyncAt 且未同步 的条目(含墓碑) ] }
3) 服务端处理（事务）：
   - upsert by (user_id, clientId)：push 条目与云端按 updatedAt 比较，新者胜（幂等）
   - 返回该账号全量云端列表 pull: [...]
4) 客户端 merge：
   - 逐条比 clientId：云端 updatedAt > 本地 → 覆盖；本地有墓碑且云端已删 → 忽略
   - 云端含本地无的 clientId → 写入本地
   - 记录 lastSyncAt、清除已合并墓碑
5) 失败/离线：标记 pending，等下个触发点重试（指数退避，上限 N 次后静默保留本地）
```

- 服务端同步端点限流（复用 rate-limit，如 20 次/账号/分），请求体沿用 1MB 上限。
- 删除：本地删除产生墓碑（`deletedAt`）上传，云删后返回已删 `serverId` 集合给其他设备；墓碑与云记录超 30 天清理。
- 历史上限：>500 条时服务端拒绝写入并返回 `HISTORY_LIMIT_REACHED`（中文提示），前端引导导出后清理。

### 4.3 服务端改动面

| 文件 | 改动 |
|------|------|
| `server/prisma/schema.prisma`（+ dev schema） | users 加 3 字段；calculations 加 `client_id`(unique scoped)、`updated_at`、`deleted_at` |
| 迁移文件 | 生产/开发各一 |
| `server/src/routes/calculations.js` | 新增 `POST /calculations/sync`（批量 upsert + pull）；保留旧 GET/DELETE 兼容（管理清理用） |
| `server/src/controllers/calculationController.js` | 新增 sync 控制器（事务、条数/大小校验、限流） |
| `server/src/services/authService.js` / authController | profile 返回 plan；注册/登录按 `SEED_GRANT_PRO` 授予 |
| `server/src/app.js` | sync 端点挂限流 |

### 4.4 前端改动面

| 文件 | 改动 |
|------|------|
| `src/js/data/history-sync.js`（新增） | SyncEngine：markDirty/upload/merge/墓碑/离线重试 |
| `src/js/data/data-management.js` | `saveCalculationResult` / `deleteHistoryRecord` 挂钩 markDirty；记录带 clientId/updatedAt |
| `src/js/api/api-client.js` | 新增 `syncHistory(push)`；profile 解析 plan |
| `src/js/auth/auth-ui.js` | 登录成功 → 调 SyncEngine.upload()；个人中心显示 plan + 同步状态 |
| `index.html` | 引入 plan.js / history-sync.js；个人中心同步入口 + gate 按钮；同步状态点 |
| `src/js/auth/plan.js`（新增） | gate 工具（§3.3） |

---

## 5. 10B：专业版增值能力

### 5.1 汇算清缴 PDF 报告
- 复用 `navigation-ui.js::exportToPDF` 的基础能力（jsPDF + autotable 已就位），新增专业版报告编排：
  - 封面（品牌 + 日期）→ 收入与税前扣除明细表 → 税率适用与测算 → 税负对比图（Chart.js 截取）→ 政策要点/注意事项 → 免责声明页。
  - 免费版保留现"结果页截图 PDF"；专业版按钮出完整报告（同一入口分流，`PlanGate.requirePro('pdf-report')`）。
- 输出文件名 `汇算清缴报告_YYYY-MM.pdf`。

### 5.2 政策更新推送
- `tax-assistant.js` 数据改为"内置快照 + 启动静默请求 `GET /api/content/tax-policy?since=<version>`"：
  - 免费版：仅用内置数据；专业版：增量更新缓存 + 登录后提示"政策已更新"。
  - 服务端新增只读静态数据端点（内容发布走运维脚本/管理 API），无用户数据交互，不占限流。

---

## 6. 里程碑与排期（单人或双人）

```
10A（≈4-5 天）           10B（≈2-3 天）
Day1  users/calculations 模型 + 迁移 + SEED_GRANT_PRO   （可 10B 与 10A 并行开工）
Day2  POST /calculations/sync + 控制器 + 限流/上限
Day3  history-sync.js（SyncEngine）+ data-management 挂钩
Day4  登录同步链路 + UI（plan 徽标/同步状态/入口 gate）
Day5  联调 + 扩展单测/冒烟断言 + 双端手工验收矩阵
      ───────────────────────────
                                Day6   PDF 汇算报告编排 + 免费/专业分流
                                Day7   政策增量端点 + 前端拉取 + 收尾回归
```

### Definition of Done（10A）
- [ ] 注册/登录按 `SEED_GRANT_PRO` 自动 pro，profile 返回 plan
- [ ] A 设备离线算 3 条 → 登录自动上传成功；B 设备登录拉取到 3 条（含结果可打开回看）
- [ ] 双端同一条冲突：updatedAt 新者胜；一端删除，另一端同步后消失（墓碑生效）
- [ ] 离线计算 → 联网后自动补齐同步；连续失败不丢本地数据
- [ ] 免费 gate：模拟 `free` 账号点云同步/PDF 入口 → 出现登录/升级引导，计算功能完全不受影响
- [ ] 历史 >500 条拒绝并中文提示；同步端点在 `GET /api/docs` 有 Swagger
- [ ] 新冒烟断言入 `verify:local` 与 `ops-check-prod.ps1`

### 测试与回归
- 新增：sync upsert 幂等/冲突、墓碑、上限、free 账号拒绝同步（`tests/` 沿用既有框架）
- 回归：注册（邮箱码+邀请码）、登录记住我、忘记密码、协议/隐私、导出、税务助手、离线可用、发布门禁

---

## 7. 风险与对策

| 风险 | 对策 |
|------|------|
| 全量同步在记录量大后膨胀 | 设 500 条上限；协议预留 `since` 游标位 |
| 同步引发隐私担忧（收入数据上云） | 隐私政策"专业版云同步"专条 + 同步前勾选告知；游客计算永不触网 |
| 合并 bug 造成本地历史错乱 | 同步前先本地整体备份到 `taxCalculationHistory.bak`，出错一键回滚 |
| 收费切换期误伤种子用户 | `pro_granted_by` 记录来源，正式收费时 seed 用户保留 pro 到期日 |
| SW/缓存旧版本干扰新功能 | 已在 1.5.2 根治（网络优先瘦缓存），本阶段无需处理 |

---

## 8. 与后续规划的关系

- **阶段11 收费体系**：在本阶段 gate/plan 字段之上做兑换码或支付，无需改架构。
- **微信小程序**：同步 API 直接复用，前端计税 JS（`tax-calculator.js`）Taro 复用不变。
- **B端 API**：`POST /calculations/sync` 的限流/配额模式与 `express-rate-limit` 经验可平移到 `/api/v1/*`。

---

*文档创建：2026-09-07 · 2026-09-07 决策评审通过（D1/D2/D3 全部确认），状态**已确认 · 待命执行**；编号保留 v0.1，正式排期开工时更新为 v1.0*

---

## 决策记录

| 日期 | 决策 | 结论 |
|------|------|------|
| 2026-09-07 | D1：阶段10 范围 = 账户分层 + 云端同步 + gate（10A），PDF 报告/推送（10B）；支付单列阶段11 | 确认 |
| 2026-09-07 | D2：计税能力永不锁定，仅锁定云端增值；种子用户"登录即专业版" | 确认 |
| 2026-09-07 | D3：执行优先级暂缓，待阶段8（冷启动/反馈运营）收官后开工 | 确认 |
