# 阶段12：核心功能补强 实施方案（A 阶段）

> 对应 [development-plan.md](./development-plan.md) 的后续演进。
> 规划日期：2026-09-12 · 项目版本基线：v1.10.0（含悬浮税助手悬浮球、发布流程加固、`verify:pg` 演练门禁）
> 状态：**A5 / A3 / A1 / A2 / A4 全部已完成**（执行序：A5 → A3 → A1 → A2 → A4）
> 测试基线：**16 套件 341 例全绿**（起点为 12 套件 303 例）
> 前置参考：[stage10-free-pro-plan.md](./stage10-free-pro-plan.md)（免费/专业版分层与云同步）

---

## 0. 结论先行（TL;DR）

本阶段聚焦**核心功能补强**，以「先补齐用户能感知的价值，再解开技术耦合」为主线，全部改动落在**前端 + 常量文件**，不触碰后端、不引入构建工具、不改动 Service Worker 与静态缓存策略，把回归风险压到最低。

| 序 | 任务 | 工期 | 性质 | 核心交付物 |
|---|------|------|------|-----------|
| 1 | **A5** 税法常量抽离 + 版本化 | 0.5-1 天 | 结构改造（零回归） | `src/js/calculation/tax-constants.js` |
| 2 | **A3** 月度明细增强 | 1 天 | 最小可见收益 | 预算表新增「累计收入」「税后到手」 |
| 3 | **A1** 计算核心纯函数化 | 2-3 天 | 解开耦合（关键） | `src/js/calculation/engine.js` + DOM 适配层 |
| 4 | **A2** 公式透明化 | 2 天 | 信任感 | 计算过程可折叠面板 |
| 5 | **A4** 方案对比中心 | 3-4 天 | **专业版卖点** | 方案库 + 多方案对比 |

**总工期：约 8.5-11 人日（含回归缓冲约 2 周）。**

**排序逻辑**：先用 A5 + A3 这两个「小而结构化」的改动跑通「改 → 测试 → 手动验证」闭环，确认管道通畅后再动核心（A1）；A2 与 A4 均依赖 A1 暴露的纯函数入口，必须排在其后。

**设计铁律（沿袭商业定调）**：计税能力永不锁定；本次新增的付费点仅涉及**方案数量上限与云同步**。

---

## 1. 现状盘点与关键发现

### 1.1 本次分析新增的三个关键事实

**发现 1：存在两套并行的计税引擎，其中一套已与前端「事实漂移」。**

| | 位置 | 体积 | 状态 |
|---|---|---|---|
| 引擎 A（实际使用） | `src/js/calculation/tax-calculator.js` | 115 KB | 前端本地计算，用户所见结果的唯一来源 |
| 引擎 B（遗留） | `server/src/services/taxCalculator.js` | 36 KB | 服务端计算，经 4 个 JWT 端点暴露 |

`src/js/api/api-client.js:211-224` 中的 4 个封装函数（`calculateComprehensive` / `calculateReverse` / `calculateBusiness` / `calculateClassification`）**全项目无任何调用方**；而 `docs/development/development-plan.md:97` 将「前端计算调用改为 API 请求」标记为已完成，与实际架构（前端本地计算）矛盾。

→ **本阶段不处理**（属 D 阶段「双引擎统一 + B 端 API」），但需在文档中记录该隐患。

**发现 2：前端是 20 个全局脚本，非 ES Module，全量工程化成本被严重低估。**

`index.html:5878-5901` 按固定顺序加载 20 个 `<script src>`，依赖**隐式全局变量**互相引用（如 `utils.js:51` 直接使用 `tax-calculator.js:7` 声明的 `comprehensiveTaxRates`）。

→ 因此「Vite/ESM 全量迁移」不属于本阶段；本阶段只做**常量抽离**这一低风险结构改造。

**发现 3：`performTaxCalculation` 是「伪纯函数」。**

```javascript
// src/js/calculation/tax-calculator.js:393
function performTaxCalculation(inputData) {
    // 第 398 行内部调用了读 DOM 的 calculateComprehensiveDeductions
    const deductions = calculateComprehensiveDeductions(workMonths);
```

它接受 `inputData` 入参，看似纯净，实际在内部读取 `document.getElementById`。**这是 A1 唯一真正的接缝**，也是本次重构成本可控的根本原因。

### 1.2 计算层可复用资产（无需重写）

以下函数**本来就是纯函数**，A1 只需聚合暴露，不需搬移逻辑：

`checkTaxBracketThreshold`(:46)、`calculateOptimalBonusAllocation`(:67)、`calculateOtherIncome`(:168)、`calculateBonusTax`(:293)、`calculateCumulativePrepaidTax`(:306)、`calculateTotalIncome`(:348)、`calculateIncomeTax`(:359)、`determinePrepaidTax`(:381)、`calculatePreTaxIncome`(:388)、`calculateReverseDeductions`(:656)、`calculateFromTargetRate`(:876)、`calculateFromMonthlyNet`(:1007)、`calculateFromTargetTax`(:1144)、`calculateSingleClassificationTax`(:2563)、`calculateClassificationTaxTotal`(:2590)、`calculateRegularIncome`(`utils.js`:2)。

### 1.3 既有约定（沿用，不引入新范式）

`src/js/data/history-sync.js:11-15` 已确立「普通全局 script 挂 `window.Xxx.pure` 暴露纯函数供 jest 单测」的模式。A1 仅是**把同一模式推广到计算层**。

### 1.4 测试基建约束（必须遵守）

```javascript
// tests/helpers/load-source.js:8-13
function loadSource(relativePath) {
    const fullPath = path.join(__dirname, '..', '..', relativePath);
    const code = fs.readFileSync(fullPath, 'utf8');
    // 使用间接 eval 在全局作用域执行
    (0, eval)(code);
}
```

测试通过**间接 eval 注入全局作用域**。实测结论：间接 eval 中 `const`/`let` **不会**成为跨 `loadSource` 调用可见的全局绑定，只有 `var`（以及函数声明、挂 `window.` 的赋值）才能跨文件共享。因此 `tax-constants.js` 内的常量一律使用 `var` 声明。由此得出硬约束：

> **`tax-constants.js` 的加载顺序必须先于所有消费者**，且 `index.html` 与所有测试文件必须保持一致。

当前需同步调整的加载点：`index.html:5880` 前、`tests/tax-calculator.test.js:8` 前、`tests/interaction.test.js:25` 前。

---

## 2. 范围决策（已拍板）

| # | 决策项 | 结论 | 理由 |
|---|--------|------|------|
| D1 | A3 改动范围 | **只改正向主表** | 反向表(`utils.js:229`)、单/多模式表(`260`/`410`)、经营表(`566`)、分类表(`652`)列语义各不相同，强行统一会引入解读歧义 |
| D2 | A4 数据存储 | **先本地，按云同步预留结构，本期不接后端** | 一次设计到位，省 1-2 天且不阻塞 B 阶段 |
| D3 | A4 付费门控 | **免费 2 套本地方案 / 专业版无限 + 云同步** | 与 stage10「锁定云端增值、不锁计税能力」铁律一致 |

---

## 3. 任务分解

### A5 — 税法常量抽离 + 版本化 ✅ 已完成

**目标**：消除散落的硬编码税法常量，为后续政策调整建立单一事实来源。

| 文件 | 动作 |
|------|------|
| `src/js/calculation/tax-constants.js` | **新建**：搬入 `tax-calculator.js:7-45` 的 4 组税率表、`helper-functions.js:4-5` 的 2 个基数常量，附 `version` |
| `src/js/calculation/tax-calculator.js` | 删除 `7:45` |
| `src/js/calculation/helper-functions.js` | 删除 `4:5` |
| `index.html` | `5880` 前插入常量脚本标签 |
| `tests/tax-calculator.test.js` | `8` 前补 `loadSource` |
| `tests/interaction.test.js` | `25` 前补 `loadSource` |
| `package.json` | `23:28` 的 `collectCoverageFrom` 纳入新文件 |

**零回归手法**：新文件**沿用完全相同的变量名**，所有调用点无需改动。

```javascript
// src/js/calculation/tax-constants.js
// ⚠️ 必须用 var 声明（而非 const）：测试用间接 eval 注入全局作用域时，
//    const 不会成为跨 loadSource 调用可见的全局绑定，会导致常量「找不到」。
var TAX_CONSTANTS_VERSION = '2026.1';

var comprehensiveTaxRates = [ /* 原样搬入 */ ];
var bonusMonthlyTaxRates  = [ /* 原样搬入 */ ];
var businessTaxRates      = [ /* 原样搬入 */ ];
var classificationTaxRates = { /* 原样搬入 */ };

var MIN_SOCIAL_SECURITY_BASE = 4250;  // TODO(C2): 应为城市参数
var MIN_HOUSING_FUND_BASE    = 4250;  // TODO(C2): 应为城市参数

window.EuriskoTaxConstants = {
    version: TAX_CONSTANTS_VERSION,
    comprehensiveTaxRates, bonusMonthlyTaxRates,
    businessTaxRates, classificationTaxRates,
    MIN_SOCIAL_SECURITY_BASE, MIN_HOUSING_FUND_BASE
};
```

**验收**：`npm test` 全绿；固定输入下计税结果与改前逐位一致。

**实施结果**：`tax-calculator.js:7-45` 与 `helper-functions.js:4-5` 的常量已搬入，`package.json` 的 `collectCoverageFrom` 已纳入新文件；测试全绿。

> 注 1：`MIN_SOCIAL_SECURITY_BASE = 4250` 是**城市特定**的社保基数下限，硬编码本身隐含正确性风险，属 C2「社保地区政策库」范围，本次仅搬移并标记 TODO。
> 注 2（踩坑记录）：「间接 eval 中 `const` 不产生跨调用全局绑定」这一约束在 1.4 节被误述为「`const` 会形成全局词法绑定、跨文件可见」——实测恰恰相反，只能改用 `var`。1.4 节描述已订正。

---

### A3 — 月度明细增强 ✅ 已完成

**现状**：正向预算表 7 列，缺「累计收入」与「税后到手」。

**最终列序（9 列）**：月份 · 月工资收入 · 扣除 · 应纳税所得额 · 税率 · 月工资应纳税额 · **税后到手** · **累计收入** · 累计应缴

新增两列插入在「累计应缴」之前，使月度口径指标（收入→扣除→应税→税率→税额→到手）连续排列，累计口径指标（累计收入、累计应缴）收尾，阅读顺序更自然。

| 文件 | 动作 |
|------|------|
| `index.html` 表头 | 在「月工资应纳税额」与「累计应缴」之间插入 `<th>税后到手</th>`、`<th>累计收入</th>` |
| `utils.js` `updateBudgetTable` 月度行 | 行模板由 7 个 `<td>` 扩为 9 个 |
| `utils.js` 空行 / 汇算标题行 | `colspan="7"` → `colspan="9"` |
| `utils.js` 类型子表行（类型/劳务/稿酬/特许权/年终奖） | 行尾填充格 `<td></td>` → `<td colspan="3"></td>`，保持 6 + 3 = 9 对齐 |
| `utils.js` 汇算汇总行（2 行） | 首格改 `colspan="3"`，使「应退/补税额」右对齐到最后一列 |
| `index.html` 样式 | 新增 `#tax-budget-table { min-width: 850px }` |

> ⚠️ **实现要点**：`.tax-budget-table` 被 **7 张表共用**，因此最小宽度必须用 `#tax-budget-table` 限定到正向主表，直接改共享类会连带影响反向/经营/分类等表。

两个新列**零新增计算**，复用循环内已有变量：

- 税后到手 = `monthlyIncome - Math.max(0, monthTax)`
- 累计收入 = `monthlyIncome * month`

**守护测试**：新增 `tests/budget-table.test.js`（4 例），锁定
1. 每一行的**有效列数均为 9**（按 `colspan` 求和，防止未来加列时漏改某一行）；
2. 首月「税后到手 = 30000 - 750 = 29250」、「累计收入 = 30000」；
3. 末月「累计收入 = 30000 × 12 = 360000」、累计应缴 = 43080（同时交叉校验税率档与速算扣除）；
4. `workMonths = 6` 时行数与累计收入口径同步收窄。

**结果**：测试套件由 12 套件 303 例 → **13 套件 307 例，全绿**。

---

### A1 — 计算核心纯函数化（关键） ✅ 已完成

**接缝唯一**：`calculateComprehensiveDeductions`（`tax-calculator.js:205`）读取 DOM，被 `tax-calculator.js:398` 与 `helper-functions.js:554` 两处调用。

**改法（保留旧签名，调用方零改动）：**

```javascript
// 1) 纯核心：原 206-262 逻辑原样搬移，DOM 读取替换为入参
function computeDeductions(input, workMonths) { /* ... */ }

// 2) 输入适配器：原 206-230 的 DOM 读取集中到一处
function collectDeductionInput() { /* ... */ }

// 3) 兼容包装：旧调用点无需修改
function calculateComprehensiveDeductions(workMonths) {
    return computeDeductions(collectDeductionInput(), workMonths);
}

// 4) performTaxCalculation 支持注入，同时完全保留原行为
const deductions = (inputData && inputData.deductions)
    ? inputData.deductions
    : calculateComprehensiveDeductions(workMonths);
```

**5) 新建 `src/js/calculation/engine.js`**（加载于 `tax-calculator.js` 之后），**只做命名空间聚合、不搬任何逻辑**：

```javascript
window.EuriskoEngine = {
    version: window.EuriskoTaxConstants.version,
    computeDeductions,
    performTaxCalculation,
    calculateReverseDeductions,
    calculateSingleClassificationTax,
    calculateClassificationTaxTotal,
    calculateOptimalBonusAllocation,
    calculateIncomeTax,
    getTaxRate
};
```

**验收**：
- `npm test` 全绿（`tax-calculator.test.js` + `interaction.test.js` 为主要保护网）
- 新增纯函数单测：脱离 `document` 直接调用 `performTaxCalculation({ ..., deductions })` 结果正确
- 页面四种模式（正向/反向/经营/分类）结果与改前一致

**实施结果**：
- `calculateComprehensiveDeductions(workMonths)` 已拆为 `collectDeductionInput()`（DOM 适配器）+ `computeDeductions(input, workMonths)`（纯函数）+ 兼容包装，旧调用点零改动。
- `performTaxCalculation` 已支持 `inputData.deductions` 注入，未注入时回退读表单。
- 新建 `src/js/calculation/engine.js`（纯命名空间聚合，含 `version`），已挂 `window.EuriskoEngine`。
- 新增 `tests/engine.test.js`（8 例），其中「注入路径 vs 表单路径等价」在**清空 DOM 后**验证——证明注入路径不可能偷偷读表单，是本次重构零回归的核心证据。
- 测试基线：14 套件 315 例全绿。

---

### A2 — 公式透明化 ✅ 已完成

**插入点**：结果卡片次要指标区之后（`index.html:2844-2861`）。

- 新增纯函数 `buildFormulaSteps(result)` 生成步骤数组（可单测）
- `performTaxCalculation` 返回值**已包含** `deductions` / `totalIncome` / `taxableIncome` / `taxResult` 等中间量，无需新增计算
- 用 `<details>` 折叠区块呈现，复用 `.tax-budget-table` 的 `.section-title` / `.highlight` 样式
- 每步标注**数据来源**：用户输入 / 法定标准 / 自动推演

**验收**：展开后每个数值与结果区**逐位一致**（写成测试断言，防止未来漂移）。

**实施结果**：
- 新增纯函数 `buildFormulaSteps(results)` / `formatFormulaValue(value, format)` / `updateFormulaSteps(results)`，全部落在 `utils.js`。
- `updateTaxResultsUI` 末尾条件调用 `updateFormulaSteps`（`typeof === 'function'` 守卫）。
- `index.html` 结果卡片次要指标区后新增 `<details id="formula-steps-panel">` + `<div id="formula-steps-body">`（默认 `hidden`，计算后展示）。
- 步骤：收入额 → 扣除额 → 应纳税所得额 → 适用税率与税额 → 预缴与汇算 → 税后年收入，另附年终奖单独计税步骤。
- 新增 `tests/formula-steps.test.js`（9 例），断言各步骤数值与结果区逐位一致。
- 测试基线：15 套件 324 例全绿。

---

### A4 — 方案对比中心（专业版卖点） ✅ 已完成

**依赖**：A1 暴露的 `window.EuriskoEngine` 纯函数入口。

- 新建 `src/js/data/scenario-store.js`：localStorage `taxScenarios`，**数据结构按云同步预留**（`id` / `updatedAt` / `ownerId`），本期不写后端
- 对比列：税前年收入 / 税后年收入 / 年度应纳税额 / 实际税负率 / 月均到手 / 年终奖计税方式，差异高亮
- **年终奖三方案一键生成**：复用 `calculateOptimalBonusAllocation`（`tax-calculator.js:67`）产出「全部并入 / 单独计税 / 最优拆分」
- 入口按钮置于结果区「开始新的计算」按钮上方（`lg:col-span-3` 通栏卡片）
- **账户隔离**：方案带 `ownerId`，`list()` 按当前账户过滤；未登录归入 `local` 分组（登出不清数据、切回可见）
- **付费边界**：沿用铁律，仅限制**方案数量**（免费 2 套 / 专业版 10 套），计税能力本身不锁定

| 文件 | 动作 |
|------|------|
| `src/js/data/scenario-store.js` | **新建**：`STORAGE_KEY='taxScenarios'`、`MAX_FREE=2`、`MAX_PRO=10`、`LOCAL_OWNER='local'`；纯函数出口 `window.EuriskoScenarios.pure`（`normalize` / `buildSummary` / `upsert` / `removeById` / `filterByOwner` / `limitFor` / `makeId`） |
| `src/js/ui/scenario-ui.js` | **新建**：对比表渲染 + 保存当前方案 + 一键生成年终奖方案；纯逻辑出口 `pure.buildBonusScenarios(base, deductions)` / `fmtValue` / `bestIndex` |
| `index.html` | 结果区插入「方案对比」通栏卡片；脚本区加载 `scenario-store.js` → `scenario-ui.js` |
| `tests/scenario.test.js` | **新建**（17 例）：纯函数契约 + 存储/付费上限 + 年终奖方案推导口径 |

**实现要点**：
1. `buildBonusScenarios` 复用 A1 的 `performTaxCalculation({ ..., deductions })` 注入路径，**脱离 DOM 即可跑多种情景**——这是 A1 与 A4 的耦合点，也是纯函数化投入的直接回报。
2. 仅当收入结构为「工资薪金 + 年终奖」（无劳务/稿酬/特许权）时才生成「最优拆分」方案，因为 `calculateOptimalBonusAllocation` 的模型只覆盖这两部分；含其他收入时自动降级为「并入 / 单独」两种口径并给出说明，避免给出不严谨的建议。
3. 免费档超限时按钮不会静默失败，而是提示升级（复用 `window.EuriskoPlan.PRO_FEATURE_HINT`）。

**验收**：三方案切换无残留状态；刷新后方案仍在；账号切换不串数据。

**实施结果**：测试套件 16 套件 341 例全绿；`read_lints` 无新增错误。

---

## 4. 执行顺序与工期

```
A5 (0.5-1d)  →  A3 (1d)  →  A1 (2-3d)  →  A2 (2d)  →  A4 (3-4d)
   结构改造       可见收益      解开耦合        信任感      专业版卖点
```

| 里程碑 | 提交粒度建议 | 状态 |
|--------|-------------|------|
| M1 | A5 + A3（含测试加载点调整） | ✅ 完成 |
| M2 | A1（含新增纯函数单测） | ✅ 完成 |
| M3 | A2 | ✅ 完成 |
| M4 | A4 | ✅ 完成 |

---

## 5. 验收门禁

| 门禁 | 标准 |
|------|------|
| 单元测试 | `npm test` 全绿（起点基线 12 套件 303 例 → 收口基线 **16 套件 341 例**） |
| 数值一致性 | 固定输入下，改前/改后所有模式结果**逐位一致** |
| 纯函数验证 | 脱离 `document` 调用 `performTaxCalculation({ ..., deductions })` 结果正确 |
| A2 自洽 | 公式面板每个数值与结果区逐位一致（断言化） |
| 界面 | 深色模式与窄屏无错位 |
| 后端 | `npm run verify:local` 通过 |

---

## 6. 风险与对策

| 风险 | 对策 |
|------|------|
| 常量文件加载顺序错位导致全局绑定缺失 | `index.html` 与两处测试同步调整，常量文件永远排第一 |
| A1 拆分改变扣除计算边界（大病医疗 15000 起付、80000 上限；学历教育扣减在职 3600） | 拆分前后对同一输入做**逐位比对测试**，重点覆盖 `actualMedicalDeduction`、`educationDegreeAmount` 分支 |
| A3 新列在窄屏挤压 | 表格外层已有 `.overflow-x-auto`，同步上调 `min-width` 至 850px |
| A4 方案数据串号 | 存储 key 绑定账户标识，沿用 `history-sync.js` 账号切换清理逻辑 |

---

## 7. 本期明确不做

- ❌ 全量 Vite/ESM 迁移（20 个全局脚本 + SW/缓存联动，回归面过大）
- ❌ 税务参数远程覆盖（税制 1-2 年才变，过度工程且算错为事故级）
- ❌ 服务端遗留引擎处理（属 D 阶段，需先确认是否有外部调用方）
- ❌ 支付、分享、邀请（属 B 阶段）

---

## 8. 决策记录

| 日期 | 事项 | 结论 |
|------|------|------|
| 2026-09-12 | 阶段范围 | 聚焦核心功能补强（A1-A5），不做工程化与后端改造 |
| 2026-09-12 | A3 范围 | 只改正向主表，其余预算表列语义不同，本期不动 |
| 2026-09-12 | A4 存储 | 本地方案库，数据结构按云同步预留，本期不接后端 |
| 2026-09-12 | A4 门控 | 免费 2 套 / 专业版无限 + 云同步 |
| 2026-09-12 | 文档订正 | `development-plan.md:97` 的「已完成」记录与现状矛盾，随 A5 提交一并订正 |
| 2026-09-12 | 遗留隐患记录 | 服务端遗留计税引擎（`server/src/services/taxCalculator.js` + 4 个计算端点）无调用方，与前端引擎存在漂移风险，留待 D 阶段统一 |
| 2026-09-12 | 测试约束订正 | 实测间接 eval 中 `const` 不跨 `loadSource` 可见，`tax-constants.js` 改用 `var` 声明；1.4 节描述同步订正 |
| 2026-09-12 | A 阶段完成 | 方案对比中心上线：本地方案库（免费 2 / 专业 10）+ 年终奖三方案一键对比；收口测试 16 套件 341 例全绿 |
