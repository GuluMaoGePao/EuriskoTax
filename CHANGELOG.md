# Changelog

所有对本项目的重要变更都将记录在本文件中。

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本（Semantic Versioning）](https://semver.org/lang/zh-CN/)。

---

## [1.50.0] - 2026-09-19（阶段17 17B-4：分类所得迁到 spec 驱动，**页面式 deep 归零**）

> 门禁基线：**verify:local 259 项**（本版不改项数）；单测 **70 套件 1248 例**（静态计数口径；jest 实测 1252，
> 差额来自 `test.each` 数据驱动用例）；线上指纹 **37 项**（不改动指纹覆盖点）。

### 最后一块拼图：先给渲染器补 repeater，再迁，最后删页

- **能力**：`deep-wizard-ui.js` 新增 `type:'repeater'`（`itemFields` + 「添加一条 / 删除」），
  值是一条数组 `[{ …itemFields }]`。它刻意**不新写一套类型转换** —— 条目的输入控件 id 沿用
  `qf-<字段>-<下标>-<子键>`，于是渲染继续走 `fieldHtml`、取值继续走 `readValues`、
  条件显隐继续走 `visibleFields`。为 repeater 再抄一份「空串归 0 / select 还原数字」，等于埋一个必将漂移的坑。
- **spec**（`tool-registry.js` 的 `classification`）：四类所得 × 各自扣除口径（租赁的费用与修缮费、
  转让的原值与合理费用），`compute` 仍调 `calculateSingleClassificationTax` /
  `calculateClassificationTaxTotal` —— 页面版 `addClassificationItem` 里内联的那份同形公式自此不再存在。
- **删除**：`classification-calculation-page`（index.html 约 330 行）、`helper-functions.js`
  （706 行，四个页面式 deep 的最后一批私有联动）、`draft-store.js`（345 行，连同 270 行单测）、
  app.js 的页面式按钮与初始化、field-hints 的 `classification_*` 六个键、
  navigation-ui 的常驻预览条（`showStepByPanes` 的最后一个调用者）、
  share-card / lead-touchpoints / funnel-tracking 里的 `calculate-classification-btn` 一路。
  `classification-mode-btn` **保留**：首页静态卡与工具箱兜底最终都点到它。

### 这一版抓到的两个真问题

- **`app.js` 的空指针**：`back-to-mode-selection-classification` 随页面删了，绑定它的那句
  `getElementById(...).addEventListener` 没删 —— DOMContentLoaded 里它在这一行抛 TypeError，
  **后面所有初始化（登录态、历史记录）全都不执行**。界面看着正常、功能静默全残，
  比少一个按钮严重得多。删页留下的空指针不会自己报错，只能靠扫「引用了 index.html 里不存在的 id」找。
- **修缮费 800 元的封顶没说清**：页面按 800 截断却一句话没解释，用户填 1500 看到 800 会以为算错了。
  这次写进 hint 与 pitfalls —— 超出的部分**结转以后月份**，不是作废。

### 测试怎么跟着改的

- **新增** `tests/classification-migration.test.js`：四类所得的扣除口径按税法**独立重算**
  （利息全额 / 租赁 ≤4000 减 800、>4000 减 20% / 修缮费封顶 800 / 转让减原值与费用）、
  「多项所得税额＝各自之和，不合并、不累进」、两笔租金不共享一次 800 元减除、
  空条目不进计税表、计税表的分隔线；再加端到端：免责声明、`data-tool-id=classification`、
  分享图依赖的两个行标签、repeater 的加一条 / 删一条 / 删空留一条 / 条目内条件字段。
- **接住缺口**：`tests/ui-result-compliance.test.js` 的 RESULT_PAGES 只剩速算器那个壳 ——
  分类所得的免责声明改由上面的端到端用例守；该文件同时新增一条反向断言：
  四个页面式 deep 的结果页不许以「半份」的形式回来。
- **随页面翻篇**：`showClassificationStep` 与 `formatPreviewNum` 的用例删了（它们测的是那张表单自己的
  显示接线，不是业务规则；数字格式化现在统一由 `toolbox-ui.fmtValue` 承担，别处已有用例）。
  `tests/formula-steps-flows.test.js` 的分类所得用例改成走 spec 的 compute（与 business 同款改法），
  并反过来钉：静态 HTML 里**不该再有**任一份推导链面板。

### 阶段17 17B 到此收官

四个页面式 deep（经营所得 v1.47.0 / 反向倒算 v1.48.0 / 综合所得 v1.49.0 / 分类所得 v1.50.0）
全部迁成了「一份 spec + 一套通用渲染器」，共约 3,400 行手写页面；
`tests/tool-registry.test.js` 那条 `pageBased` 断言等的就是这一天 —— **它现在等于空数组**。

---

## [1.49.0] - 2026-09-19（阶段17 17B-3：综合所得正向计税改由 spec 驱动，旧页面约 970 行删除）

> 门禁基线：**verify:local 259 项**（本版不改项数）；单测 **70 套件 1248 例**（静态计数口径；jest 实测 1265，
> 差额来自 `test.each` 数据驱动用例）；线上指纹 **37 项**（不改动指纹覆盖点）。

### 抽内核 → 写 spec → 删页面（约 1,900 行）

- **内核**：`performTaxCalculation` 本来就支持注入 `deductions`，这次把综合所得那份独有的
  **逐月预算表**抽成纯 tables 内核（`tests/budget-table.test.js` 先守）；spec 的 `extras.table`
  直接透传它的输出（含跨列标题行 `{ cells, spans }`，渲染器负责摊平）。
- **spec**（`tool-registry.js` 的 `forward`）：27 个字段按 基本参数 / 收入明细 / 扣除明细 三步，
  `specialDeductionCheckbox` / `specialAdditionalDeductionCheckbox` / `otherDeductionCheckbox` 三个
  switch 各带一组条件字段；**年终奖并入 vs 单独计税**用 `compare.scenarios` 给两行数让用户挑。
  便利输入（婴幼儿分摊比例 0~100、学历继续教育 / 职业资格的勾选）删页**之前**就登记进去了 ——
  这是 v1.47.0 删经营所得时的教训，第二次不再犯。
- **删除**：`forward-calculation-page`（index.html 约 970 行）、app.js 约 340 行接线、
  helper-functions 里 12 个只服务该页的联动/重置函数（约 440 行）、data-management 那份
  `saveCalculationResult`（与 `tax-calculator.saveToHistory` 重复实现，`updatedAt` / 变更信号各写一份）、
  draft-store 的 forward 草稿流、field-hints 的 `forward_*` 键、navigation-ui 的预览分支与 `goToStep`。
  `forward-mode-btn` **保留**（首页静态卡与工具箱兜底最终都点到它），点击即打开向导。

### `dw-result-card` 第三次带来「认不出工具」

同一张结果卡现在挂着 business / reverse / forward 三份配置，且**模板与行标签各不相同**：

- `share-card.js`：新增 `dw-result-card:forward` 一路，`sourceKey()` 按实时 `data-tool-id` 落配置。
- `lead-touchpoints.js` / `funnel-tracking.js`：改钩 `dw-next`，并按 `toolId: 'forward'` 归因。
- `lead-context.js`：三个结果锚点改成 `wizard:primary` / `wizard:refund` / `wizard:row:适用税率`；
  顺手修掉一个由此才暴露的 bug —— 向导的行节点把**标签和值渲染在同一个 div** 里，照 `textContent`
  整取会得到 `'适用税率20%'`，情境里出现「适用税率 适用税率20%」；现在取行内最后一个 `span`。
- `tax-assistant` 的 12 处 `related: { page: 'forward-calculation-page' }` 改为 `{ tool: 'forward' }`；
  `final-report.js` 那份专业版报告的截图主体改指向 `dw-result-card`。

### 测试怎么跟着改的

- **新增** `tests/forward-migration.test.js`：按税法口径**独立重算**（页面版没了，左式不复存在）——
  四类所得折算率 / 六档档位边界 ±0.01 / 年终奖双口径择优 / 退税补税的方向判定 /
  不足 12 个月时预算表的行数、劳务报酬并入后不再单独预扣的那一行；
  再加三条端到端：`result-disclaimer`、`data-tool-id=forward`、分享图赖以为生的三个行标签。
- **移了守护**：`tests/ui-result-compliance.test.js` 的 RESULT_PAGES 少掉 forward 那一条（= 少一处
  免责守护），由上面三条端到端**同版**接住；`lead-context` 的跨文件契约反过来钉「三个旧 id 不该还在」；
  两个 quick 落地页的「起征点与主站表单 #basic-deduction 一致」改为「第二份 5000 已随页面删除」。
- **守卫**：两条依赖页面 DOM 的（缴费比例输入框 / `normalizeRateInput`）改到 spec 侧断言
  （三个 spec 各一份 `housingFundRate` + `insuranceDerive` 的回落 + `deep-wizard-ui` 的失焦归一），
  原 `(data-management)` 那条改为「写历史的入口收敛为一处」，项数维持 259。

### 没做的

- classification（分类所得）是唯一含动态增删所得条目的页面，spec 要先有 repeater 能力才能迁。
  **17B 到这里只剩它一个页面式 deep** —— `tests/tool-registry.test.js` 那条 `pageBased` 断言
  就是在等它归零那天变红。
- `scenario-ui.js` 的「年终奖方案对比」卡片原先长在被删页面的结果区里，这次随页面失去宿主；
  它的纯逻辑（`pure.buildBonusScenarios`）与对应单测仍在，UI 出口待下一步决定去向。

---

## [1.48.0] - 2026-09-18（阶段17 17B-2：反向倒算（谈薪）改由 spec 驱动，旧页面约 1,050 行删除）

> 门禁基线：**verify:local 259 项**（本版不改项数）；单测 **70 套件 1261 例**（静态计数口径；jest 实测 1239，
> 差额来自 4 条 `test.each` 数据驱动用例）；线上指纹 **37 项**（不改动指纹覆盖点）。

### 先补再删：这次没让便利输入跟着页面走

v1.47.0 的教训是「删页面 → 门禁变红 → 才发现便利输入还在私有函数里」。所以这次**迁移前**就把
反向倒算那组「社保基数 × 比例 → 月缴额」登记进 reverse spec（社保/公积金基数 + 四项比例），并把它抽成
**两个完整测算共用的一份**：`INSURANCE_DERIVE_FROM` / `insuranceDerive()` / `socialBaseWarnings()`
（`tool-registry.js` 顶部）。抽共用不是洁癖 —— 两边逻辑本来就是同一份，抄两遍迟早只改其中一遍。

唯一**故意没补**的是页面版反向的那一路「手填月缴额 → 反算比例」：两个方向互相写对方的值，
在同一张表单上必然抖动（改额 → 改比例 → 再改额）。留单向的「基数 → 月缴额」，手填月缴额也照收。

### 删了什么（约 1,050 行）

- **页面**：index.html 的 `reverse-calculation-page`（含那段只服务于它的内联 `<script>`）。
- **接线**：app.js 约 400 行旧表单逻辑（三个逆推入口 × 三种口径的 DOM 联动）与导出 PDF/Word、
  保存、重置、新建的按钮绑定；`reverse-mode-btn` 与 `#reverse-mode-card` **保留**，点击即打开向导
  —— 首页静态卡片的点击最终落到它身上，删按钮等于让两处入口点空。
- **计算/渲染层**：helper-functions 的 7 个、utils 的 3 个（预算表 / 收入构成图）、tax-calculator 那几个
  只读表单的（`readReverseDeductionValues` / `collectReverseInputData` / `saveReverseCalculation*`）、
  navigation-ui 的 `showReverseStep` 与预览条分支、draft-store 的 reverse 草稿流、field-hints 的 `reverse_*` 键。
- **导出**：export-utils 的反向分支 —— `generateWordDocumentContent` 原本三选一（正向/经营所得/反向），
  三种结果的形状并不通用（反向那套 `incomeDetails` 里大半是为对齐结构补上去的 0），现在只剩正向；
  `generateMonthlyData` 同理；优化建议里每条都挂着的 `!isReverseCalculation &&` 一并摘掉。
- **历史回填**：data-management 不再把二十来个字段填回旧页面 DOM —— 页面没了，改为打开向导接着算。

### 同一个向导容器第二次出现「认不出工具」

`dw-result-card` 会被所有 spec 工具轮着用。17B-1 已经在 `business` 上踩过一次：不认的话，
算了增值税也会被记成一次经营所得 calc_done。这次它的形态稍微变了一点 ——
**同一张卡、两个工具、模板还不同**（经营所得 → income，谈薪 → negotiation）：

- `share-card.js`：新增 `dw-result-card:reverse` 一路 + `sourceKey()` 按此刻结果卡上的
  `data-tool-id` 落到对应配置；照 id 直接查，谈薪结果会被截成一张经营所得卡（数值来自别的口径，比空图更难发现）。
- `lead-touchpoints.js`：reverse 仍然显式挂钩、**仍然被 `BLOCKED_TYPES` 拦截**（谈薪受众是求职者，
  不该推企业服务）—— 转到向导下一步上；顺手修掉 business 那行随旧页面删除却没人改的 `containerId`
  （结果是经营所得走完向导，引导因为找不到容器而从不出现：静默失败，没人觉得不对）。
- `funnel-tracking.js`：reverse 的 calc_done 改认 `toolId: 'reverse'`。

### 测试怎么跟着改的

- `tests/reverse-migration.test.js` 的对拍留下，但**修了一条把两种口径看混的用例**：
  `conservative` 取的是「所在档位的下限」，它在扣除变化时**会跳档**，因此**不随扣除单调** ——
  钉「扣得多则所需税前少」必须用 `balanced`（解方程得到的那个值）。
  另补两条：到手目标低于扣除合计时回落到 0 税下界（二分求解器留了约 0.005 元的小数尾巴，
  别写成 `toBe(0)` —— 那是把精度要求说成了业务要求）；走向导的端到端（主结果 / 推导链 /
  免责声明 / `data-tool-id=reverse`），用来接住 ui-result-compliance 少掉的那个页面条目
  —— **少一个页面条目 = 少一处免责守护**，移动的守护必须与删除同版交付。
- `tests/interaction.test.js` 丢掉 5 条页面接线用例（步骤包装函数、扣除项 toggle、未算先保存的提示）；
  `tests/formula-steps-flows.test.js` 的「三个推导链面板」改为「剩一个静态面板 + 注册表接两条」。

### 没做的

classification（分类所得）是唯一含有动态增删所得条目列表的页面，spec 目前承载不了，
加 repeater 能力之前不能迁。**顺序仍是 reverse → forward → classification 殿后**。

---

## [1.47.0] - 2026-09-18（阶段17 17B-1 收尾：清理经营所得旧页面的死代码）

> 门禁基线：**verify:local 259 项**（本版不改项数）；单测 **69 套件 1235 例**；线上指纹 **37 项**（不改动指纹覆盖点）。

### 删了什么（约 1,150 行）

- **页面**：index.html 的 `business-calculation-page`（853 行 HTML，含那份 23 字段表单）。
- **计算层**：`readBusinessFormValues()` / `calculateBusinessTax()` / `saveBusinessCalculation()` 与
  `businessCalculationResults` 变量（tax-calculator.js）、`updateBusinessBudgetTable` /
  `updateBusinessCharts` / `updateBusinessCompositionChart`（utils.js）、经营所得的保险联动与
  `resetBusinessCalculation`（helper-functions.js）。**保留** `calculateBusinessTaxCore` —— 它是向导在用的内核。
- **接线**：navigation-ui 的经营所得预览分支与 `showBusinessStep`、draft-store 的 business 草稿流、
  app.js 里约 300 行旧页表单逻辑（含「填社保基数反推四险一金」那段纯前端辅助 —— 见下方「补回来」）。
- **导出**：export-utils.js 的经营所得文档生成（276 行）与其守卫、final-report.js 的 `business` kind
  （这份专业版报告经营性产出为零，随旧页一并下线）。

### 改造而非删除的部分

| 位置 | 原来 | 现在 |
| --- | --- | --- |
| data-management 查看历史 | 把 23 个字段回填回旧页面 DOM | 走向导（向导自带草稿，接着上次继续） |
| 历史列表取值 | 只读旧结构 `incomeDetails/taxDetails` | 两种结构都读：旧记录 + 向导的 `{values, primary, rows}` |
| tax-assistant 关联入口 | `related: { page: 'business-calculation-page' }` | `related: { tool: 'business' }`，渲染与点击都支持 tool 型跳转 |
| 留资情境 / 分享图 / 漏斗埋点 | `business-step-result` 等专属 id | 向导通用节点 + **`data-tool-id` 归因** |

最后一行是这次唯一「删不干净」的地方：向导是**通用渲染器**，`dw-result-card` 会被所有 spec 工具轮着用。
不加归属校验的话，用户算了增值税也会被记成一次经营所得 calc_done / 线索情境 —— 这类错误在线索表里
看不出来，打电话联系时才答非所问。所以给结果卡加了 `data-tool-id`、每行加 `data-dw-row`、主结果加
`dw-result-primary`，让 `lead-context / share-card / funnel-tracking / lead-touchpoints` 四个消费方按工具认人。

### 测试怎么跟着改的

- `tests/business-migration.test.js` → **`tests/business-income-core.test.js`**：页面版没了，对拍的左式
  也不存在了，于是改成**按税法口径独立重算**（自己写一份税率表与扣除规则）再去核内核输出。
  比起把三组数字固化成快照，这样将来改坏了会红在「公益性捐赠按应纳税所得额 30% 封顶」这条业务规则上，
  而不是一个不明所以的期望值 —— 用例反倒从 7 条涨到 8 条（新增「有/无综合所得的分水岭」）。
- 其余 6 个套件：删掉随页面消失的用例（interaction 的步骤包装函数、final-report 的 business kind），
  或改为在向导上验证。其中 share-card 与 lead-context 的「selector 必须在 index.html 存在」契约
  **演进**为：向导节点是运行时渲染的、静态 HTML 查不到，改由向导端到端用例守护。

### 顺带捞回来的：经营所得「基数 × 比例」便利输入

v1.46.0 把它记成「一处体验差异」——旧页面能「填社保缴费基数 × 缴费比例自动算出四险一金月缴额」。
用户手里有的是**基数**，不是「每月扣了多少养老金」，所以这组输入不是装饰品。这段联动当时写在
app.js + helper-functions.js 的私有函数里（`calculateBusinessInsurance` / `validateSocialSecurityBase('business')`），
删页面时必然连着一起删。做法不是跟着删，而是把它**沉淀成 spec 的通用钩子**，好让后面
reverse / forward / classification 三个迁移直接用：

- `tool-registry.js` 的 business 新增 `deriveFrom` / `derive()`：基数 × 比例 → 月缴额；比例留空或越界时
  回落**该险种自己的默认比例**（养老 8% / 医疗 2% / 失业 0.5% / 公积金 5%），不是统一回落 5%。
- 新增 `warnings()`：低于当前生效下限的基数**当场**在输入框下面就提示（下限仍读 tax-constants.js，
  管理台可热改 —— 注册表里不复制第二份常量）。
- `deep-wizard-ui.js` 补上渲染器侧的三件套 `applyDerived / bindDerivedSources / renderWarnings`：
  derive 挂在统一的收值入口 `collect()` 上（避免某条路径漏跑）；只对 `deriveFrom` 声明过的来源字段
  接线（用户改别的字，不该把他手改过的月缴额冲掉）；数字框失焦时先把比例归一写回输入框再收值 ——
  否则会出现「用户留了个空框，却按 0% 算出 0 元」，界面上看不出自己被当成 0 处理了。
- `verify:local` 那两条断言**没有删**：它们盯的能力还在（只是换了承载位置），改盯等价位置即可 ——
  首页 / 反向页仍在 index.html 里，经营所得那份改到 tool-registry.js + deep-wizard-ui.js 上，
  门禁仍是 259 项。**「门禁红了就删门禁」是最省事、也最贵的做法**：删掉的是将来唯一会再提醒你的人。

踩坑一处：第一版在 input 回调里写成 `if (applyDerived(...)) applyValues(...)` —— derive 已经在
`collect()` 里跑过一次，第二次必然返回 `false`，于是「派生值回写界面」被整段跳过（内存改了、DOM 没动），
测试表现为期望 800 却拿到 0。

### 没做的

- `business-income` **速算器**（核定 vs 查账对比）与 `business-income-quick` 页面不在本次范围，它们仍健在。
- `field-hints.js` 里那批旧页字段名没清 —— 只是静态数据表，留着无害，等 reverse / forward 迁移时一并清理。

## [1.46.0] - 2026-09-18（阶段17 17B-1：经营所得从页面式迁到 spec 驱动）

> 门禁基线：**verify:local 259 项**（本版不改项数）；单测 **67 套件 1217 例**（新增 9 例，其中 7 例在新的 `tests/business-migration.test.js`）；线上指纹 **37 项**（不改动指纹覆盖点）。

### 做了什么

- **抽内核**：`tax-calculator.js` 新增 `calculateBusinessTaxCore(values)`（纯函数）与 `readBusinessFormValues()`；
  原 `calculateBusinessTax()` 改为「读 23 个 DOM → 调内核 → 写结果区」，**渲染逻辑一处未动**。
  不抽而另抄一份的话，经营所得就会多出第 6 份同形实现（此前减半优惠公式已有 5 份 —— 那是口径漂移的源头）。
- **写 spec**：`tool-registry.js` 的 `business` 补齐 `fields`（2 步 23 字段）/ `steps` / `pitfalls` / `compute`，
  去掉 `pageId` → 由 `deep-wizard-ui.js` 接管。`compute` 调内核，推导链直接复用 `utils.js` 既有的
  `buildBusinessFormulaSteps`（页面版用的也是它 —— 不写第二套）。
- **切入口**：`toolbox-ui.js` 把 spec 驱动的判断提到 `mode-btn` **之前**（否则卡片点击会被 `business-mode-btn`
  带回旧页面）；`app.js` 的 `business-mode-btn` 也走向导。

### 口径没变（本版的重点）

新增 `tests/business-migration.test.js`：**页面版**（读 DOM，取它**渲染出来**的结果元素）与 **spec 版**（`compute`）
在 3 组输入下逐点比对 9 个口径字段，全部一致。3 组分别是：
① 有综合所得 + 捐赠按 30% 限额 + 预缴参与补退；② 无综合所得（5000×月数 与社保公积金进经营所得扣除）；
③ 高所得触发 200 万减半封顶。后 3 个待迁页面（reverse / forward / classification）照这个模板各写一份。

### 一处体验差异（不是口径差异）

旧页面能「填社保基数 × 缴费比例自动算出四险一金月缴额」，那是**纯前端辅助**（`calculateBusinessTax`
只读月度金额，基数和比例不参与计算）。spec 版改为直接填月度金额，并在字段提示里给出换算式
（养老＝基数×8%、医疗×2%、失业×0.5%）。

### 还没做

旧页面 `business-calculation-page`（`index.html` 约 390 行）与其私有逻辑**仍在**，但两条入口都走向导、
已无人可达；下一版 v1.47.0 清理死代码（页面 HTML + navigation / app / draft-store / tax-assistant /
data-management 里的引用 + 相关测试）。**页面式 deep 由 4 → 3**（剩 forward / classification / reverse）。

## [1.45.0] - 2026-09-18（阶段17 17A-2：结果区与存量页面对等 —— **17B 反向迁移的硬前置**）

> 门禁基线：**verify:local 259 项**（本版不改项数）；单测 **66 套件 1210 例**（新增 4 例，
> 全在 `tests/deep-wizard.test.js`）；线上指纹 **37 项**（不改动指纹覆盖点）。

### 为什么要发这一版

- 17B（把个税那 4 个页面式 deep 迁到 spec）开工前实测发现：**spec 驱动的向导结果区缺四件套** ——
  查看计算过程（推导链）、免责声明、保存计算结果、导出 PDF / Word。存量 4 页四样都有，
  照现状迁过去就是功能降级，所以**先补平再迁**。
- 这不是锦上添花：ui-design-spec §6.2 明文要求「每个 deep 必须可保存草稿、可导出 PDF，与现有 4 个等价」。

### 做了什么

- `src/js/ui/deep-wizard-ui.js`：结果区补
  ① 推导链 —— `compute` 返回 `steps`，渲染走 `utils.js` 的 `renderFormulaStepsHtml`，
  **与 20 个速算器同一套实现，不写第二份**；
  ② 免责声明 —— 与存量 4 页同一句话、同样就地展示（不藏在页脚）；
  ③ 保存 —— 走 `tax-calculator.js` 的 `saveToHistory`，**不开第二套历史**；
  ④ 导出 PDF / Word —— 自带报告内容，并 `skipResultCheck` 跳过存量页面的全局变量校验。
- `src/js/export/export-utils.js`：`exportToWord` 新增第三参 `opts`（`skipResultCheck` / `content`），
  **既有两参调用行为不变**。
- `src/js/data/tool-registry.js`：给 `vat` 的三个分支补真实推导链 —— 第一步一律是价税分离，
  因为小规模最常见的错误就是「拿含税价和 30 万比」。

### 验证

- 全量单测 **66 套件 1210 例全绿**；`verify:release` 版本五处一致、文档口径与实测一致。

### 下一步

17B 反向迁移（business → reverse → classification → forward），每个单独一个版本、单独可回滚。
注：`classification` 页含**动态增删的所得条目列表**，是 4 个里唯一 spec 当前承载不了的，排在最后处理。

## [1.44.0] - 2026-09-18（阶段17 17C-5：残保金与工会经费完整测算 —— **6 类已齐**）

> 门禁基线：**verify:local 259 项**（本版不改项数）；单测 **66 套件 1206 例**（本版新增 5 例：
> 3 例 `tests/deep-wizard.test.js` 残保金向导 + 1 例 `tests/tool-registry.test.js` 分档与临界对拍
> + 1 例 `tests/toolbox-ui.test.js`「搜到税种就该露出它的完整测算」）；线上指纹 **37 项**（不改动指纹覆盖点）。

### 为什么要发这一版

- 这是 §4.4 里**最后一个未交付的税种类别**（P2）。至此按 tax-registry 的 6 类计，
  **每类都有完整测算**（页面式 4 个 + spec 驱动 5 个）——「全税种完整测算」这条卖点才算兑现。
- 它也是唯一一个「**临界点比公式更要命**」的类别：分档减缴是边际递减的，30 人又是临界点不是起征点。
  这两件事光看一个应缴额都看不出来。

### 做了什么

- `src/js/data/tool-registry.js`：给 `disability-fund` 加 `steps` 分步声明与字段 `step` 分组。
  两步直接照抄 §4.4 给这类的形态（人数/工资总额 → 分档减缴 → 申报表，第三步是结果步）。
  顺序不能反：**规模没定就谈减免，等于拿 31 人的系数去套 300 人的盘子**。
- 结果侧补上「下一步该招几个人」：再招 1 名残疾人可省多少（分档减缴下第一个人最值钱，
  招到第 3 人可能一分钱都省不了）、补到免征还需招几人，以及 30 人以下时**超过 30 人后会跳出多少**。
  工会经费补「月均计提」—— 按年申报、按月计提，做预算要的是月均。
- `DEEP` 新增 `disability-fund-deep`（排在最后：§12.6 顺序 vat → cit → social → surtax/stamp → fee）。
- 修 1 例过时断言：`tests/toolbox-ui.test.js` 原用「残保金」测「搜索无命中时收起完整测算组」——
  现在它有了自己的完整测算会命中，改用「房产税」；并补一条守住「命中时必须露出」。

### 验证

- 全量单测 **66 套件 1205 例全绿**；`verify:release` 版本五处一致、文档口径与实测一致。
- 速算器行为不变：可见字段只是按步重排，值与口径不变。

## [1.43.0] - 2026-09-18（阶段17 17C-3：社保公积金完整测算 —— 第 4 类 spec 驱动的 deep）

> 门禁基线：**verify:local 259 项**（本版不改项数）；单测 **66 套件 1201 例**（本版新增 4 例：
> 3 例 `tests/deep-wizard.test.js` 社保公积金向导 + 1 例 `tests/tool-registry.test.js` 年度口径对拍）；
> 线上指纹 **37 项**（不改动指纹覆盖点）。

### 为什么要发这一版

- 社保公积金是 §4.4 的 P1、HR 最高频的一类，此前 App 内只有 4 个字段的速算器：
  **只出月度六行，没有逐项明细、没有全年汇总**。而社保本质是按年看的支出 ——
  「全年单位缴纳多少、员工全年到手多少」才是 HR 要拿去做预算的那一版。
- 它同时是「渲染器不依赖某个税种的字段形状」的验证：本税种**既没有 variant 选择器、
  也没有条件字段**，与前三个已交付的 deep 结构都不同。

### 做了什么

- `src/js/data/tool-registry.js`：给 `social-base` 加 `steps` 分步声明与字段 `step` 分组
  （核定缴费基数 → 缴纳比例与扣除）。顺序刻意是「先基数、后比例」：缴费基数不是工资
  （60% 保底 / 300% 封顶），基数错一格，后面每一项都跟着错。
- 结果侧扩成四段：① 缴费基数（带上下限区间）→ ② 五险一金**逐项明细**（个人 / 单位双列；
  **工伤、生育个人为 0 不是漏算**，hint 里写明比例与单位侧金额）→ ③ 月度小计 →
  ④ **全年汇总**（个人年缴、单位年缴、员工全年到手、企业全年用工成本）。
- `DEEP` 新增 `social-base-deep`（P1，排在 `corporate-income-tax-deep` 之后，符合 §12.6 的顺序）。
- 测试：3 例向导（第一步只问基数、分步填值不丢、结果步与同源速算器同口径）
  + 1 例年度口径对拍 —— **逐项明细合计必须等于月缴合计**：少一项或多一项，
  用户看到的年度数就是错的，而且不会有任何报错。

### 验证

- 全量单测 **66 套件 1201 例全绿**；`verify:release` 版本五处一致、文档口径与实测一致。
- 速算器行为不变：可见字段与改动前完全一致，只是结果行更细 —— 同一口径，不是两套。

## [1.42.0] - 2026-09-18（阶段17 17C-2：企业所得税完整测算 —— 第 3 类 spec 驱动的 deep）

> 门禁基线：**verify:local 259 项**（本版不改项数）；单测 **66 套件 1197 例**（本版新增 4 例：
> 3 例 `tests/deep-wizard.test.js` 企业所得税向导 + 1 例 `tests/tool-registry.test.js` 两种填法对拍）；
> 线上指纹 **37 项**（不改动指纹覆盖点）。

### 为什么要发这一版

- **App 内完整测算此前只覆盖 3 类税种**：`iit`（4 个切面）+ `vat` + `surtax/stamp`。
  企业所得税在 §4.4 里是与 vat 并列的 **P0**，App 内却仍只有 5 个字段的速算器 ——
  算不出「会计利润 → 纳税调整 → 应纳税所得额」这条申报表口径的链路。
- 17A 的测算描述符 `spec` 已就位，本版是「描述符真的通用、不是只适配 vat」的第二个证据：
  **全程没有改 `index.html`、没有碰 `tax-calculator.js`**，只在注册表里加了一条 spec 与一段分步声明。

### 做了什么

- `src/js/data/tool-registry.js`：给 `corporate-income-tax` 加 `steps` 分步声明与字段 `step` 分组
  （企业身份与规模 → 利润与纳税调整），新增 `mode` 切换「直接填应纳税所得额 / 从收入成本算」。
- `compute` 在调整路径下复用既有 `EuriskoCorporateQuick.deductionLimitOf()`：业务招待费（发生额 60%
  与收入 5‰ 孰低）、广宣费（收入 15%）、公益性捐赠（利润总额 12%）超限额部分**调增**回利润，
  再减可弥补以前年度亏损。限额比例仍取自 `tax-constants.js`，注册表不内置任何数字。
- `DEEP` 新增 `corporate-income-tax-deep`（P0，排在 `vat-deep` 之后）。按 17A-5 的硬约定，它与
  同名速算器**共用同一份 fields / steps / compute**（`toBe` 同对象引用，不是复制）—— 有单测钉住。
- 结果行顺序刻意是「会计利润 → 各项调增 → 调增合计 → 弥补亏损 → 应纳税所得额」**在前**、
  适用身份与税率**在后**：顺序反了会让人把调增误读成税率的一部分。
- 测试：3 例向导（第一步只问身份、`mode` 切换后字段跟随、结果步与同源速算器同口径）
  + 1 例「两种填法都能算」并钉住调增合计与应纳税所得额 ——
  **调增若写成调减，税额会变小且不报错**，这类符号错误只能靠固定数值兜住。

### 验证

- 全量单测 **66 套件 1197 例全绿**；`verify:release` 版本五处一致、文档口径与实测一致。
- 既有 20 个速算器行为不变：`mode` 默认 `direct`，速算器页可见字段与改动前完全一致。

## [1.41.1] - 2026-09-17（Phase 2 结果页样式从未生效 · 修 + 免责声明补齐全部结果页）

> 门禁基线：**verify:local 259 项**（本版不改项数）；单测 **66 套件 1193 例**（本版新增 7 例：
> 5 例 `tests/ui-result-compliance.test.js` + 2 例 `tests/docs-metrics.test.js` 文档登记守护）；
> 线上指纹 **37 项**（不改动指纹覆盖点）。

### 为什么要发这一版

- **Phase 2 的结果页视觉层级此前从未真正生效**：`result-conclusion` / `result-reason` /
  `result-disclaimer` 三个类写在 `tailwind.src.css` 里，Tailwind 构建产物 `tailwind.css`
  **却从来没有重新编译过** —— 类名挂在 DOM 上、控制台零报错，页面上完全没样式。
  这正是 UI 设计方案 §12.3 预警的那颗雷，且已经爆了。
- **结果页免责声明有缺口**：只有综合所得一页有，20 个速算器与另外 3 个完整测算的屏幕上没有 ——
  而导出报告与分享图**都有**。可带走的东西有免责、看得最久的那一屏反而没有。

### 做了什么

- `npm run build:css` 重建产物（95823 → 98677 字节），Phase 2 结果页类名全部进入产物。
- `index.html` 五处结果区（速算器壳 + 4 个完整测算）统一补齐 `result-disclaimer` 段落，
  文案与 SEO 落地页同源：「测算结果依据您填写的数据与现行政策估算，仅供参考，不构成税务建议；正式申报请以税务机关核定为准。」
- 新增 `tests/ui-result-compliance.test.js`（5 例）：① 五个结果页容器都还在（防「死选择器」重演）；
  ② 每个结果页都要就地有免责、不许藏页脚；③ 免责统一用 `result-disclaimer` 段落、不各写一套行内样式；
  ④ **index.html 用到的 `@apply` 自定义类必须真的编译进产物**（第二章所述那颗雷）；
  ⑤ ④ 的正则不能空转。
- `tests/docs-metrics.test.js` 新增「docs 索引登记不能有遗漏」守护（2 例）：
  `docs/` 下每个 .md 必须在 `docs/README.md` 里出现 —— 顺带补登了此前从没进过索引的
  `development/stage12-core-enhancement-plan.md` 与 `reports/performance-optimization-report.md`。

### 验证

- 全量单测 **65 套件 1181 例全绿**；`verify:release` 版本五处一致、文档口径与实测一致
  （新增用例后 7 处落点的套件/用例数已由 `--write` 自动同步）。
- **未跑 `verify:local`**：本机 `server/node_modules` 未安装（脚本首步 `prisma generate:dev` 即失败），
  该门禁需在有服务端依赖的环境或 CI 上跑。本版未改动服务端契约。

---

## [1.41.0] - 2026-09-17（结果页视觉层级 · Phase 2）

> 门禁基线：**verify:local 259 项**（本版不改项数）；单测 **65 套件 1181 例**（本版新增 19 例：
> `tests/result-narrative.test.js` 7 例 + `tests/solver.test.js` 12 例）；线上指纹 **37 项**（不改动指纹覆盖点）。

### 为什么做
- 结果页原来把「税后年收入、税率饼图、应纳税额、年终奖税额、优化建议」平铺在一起，
  用户第一眼分不清**该看哪个数**、**下一步该做什么**。
- 财务的真实习惯是**先看结论再核对明细**；原页面把明细和结论并列，等于让用户自己对账。

### 做了什么
- **结论带上「下一步动作」**：不再只有一个金额，补 / 退 / 不退不补各给出要做什么
  （补税须在汇算期 3 月 1 日—6 月 30 日内完成，逾期按日万分之五滞纳金）。
- **一句话理由**：说明结论怎么来的（预缴 vs 应纳税额 + 实际税负率），公式仍只在推导链展开。
- **层级重排**：金额 Hero → 结论 → 一句话理由 → 推导链（折叠）→ 注意点 → 明细（折叠）→ 免责 → 操作区。
- **明细默认折叠但记住展开状态**：核对的人展开一次后一直展开，不核对的人首屏不被明细挤掉。
- **注意点是「本结果触发的」**：补税才提滞纳金、有年终奖才提计税方式、退税才提银行卡核验。

### 行为不变（避免误判为破坏性改动）
- `#result-refund-tax` 的文本格式（`应补 / 应退 / 不退不补 ¥X`）**一个字未改**：
  `lead-context.js` 用它提取汇算结论方向、分享图也依赖它；本版只是把它从「两张并排小卡」
  升级为「结论区主行」，并新增 `tests/result-narrative.test.js` 锁死方向判据一致。
- 计算逻辑、导出内容、接口契约均未改动。

### Phase 2.5 ①：通用单调求解器（纯重构、零功能变化）

#### 为什么做
- 反向倒算（已知目标值 → 反推收入 / 工资）此前被手写了 **8 份**：`tax-calculator.js` 6 处
  （月度税后 / 目标税额 / 到手金额，综合所得与经营所得各一套），
  `net-salary-quick.js`、`employer-cost-quick.js` 各 1 处。
- 8 份**结构一字不差地同构**，差别只有中间那句「够不够」的判据。复制的代价从来不是行数，
  而是**口径漂移**：收敛方向或精度要修时改一处漏七处，而且出了问题没法一眼看清「是在哪个区间上二分」。

#### 做了什么
- 新增 `src/js/calculation/solver.js`：`solveMonotone()`（二分到分的骨架）+ `expandUpperBound()`
  （翻倍兜顶找上界）。文件内**零税务口径** —— 单调性、比较方向、边界处理全由调用方的回调表达，
  好处是正确性可以独立于税率表被测试（新增 `tests/solver.test.js`，含「判据写反→静默收敛到另一端」
  这条把约定钉死的用例）；代价是「判据必须是 f(x) < target」这条约定由调用方守住，求解器不检查。
- 8 处调用点改为只保留各自的**判据**与取整口径：
  - 谈薪报价（月薪反推）仍向上取整 —— 宁高勿低；
  - 用工预算（成本反推）仍向下取 `hi` —— 预算红线一毛都不能超。这两条是业务分歧，留在各页自己身上。
- 顺带抽出 `businessTaxOf()`：经营所得减半优惠（≤200 万那一段）原先在三处二分里各抄一份，现在只有一个实现。
- 接线：`index.html` 里 `solver.js` 排在 `tax-calculator.js` 与两个 quick 模块之前；
  `window.EuriskoEngine` 补上 `solveMonotone` / `expandUpperBound`，供方案对比中心 / B 端 API / 小程序复用。

#### 行为不变（这条是怎么证明的）
- 搜索区间、到分为止的精度、迭代上限、以及「取收敛中点 `(lo + hi) / 2`」的取值口径全部**沿用原实现**，
  所以既有那些断言具体金额的用例一个字都不用改 —— **1162 个既有用例原样通过**就是最硬的证据。
- 新增的只有求解器自身的算法用例；门禁 259 项与线上指纹 37 项均未改动。
- **遗留**（有意不做）：结果显示与经营所得正向计算路径里还剩 5 份同形的减半公式
  （guard 写法略有出入： `halvingTaxable > 0` vs `result.tax > 0`、税率取 `targetBracket` 还是 `taxResult`）。
  在当前税率结构下等价，但**没有测试证明这一点** —— 要统一得先补等价对拍用例，
  否则「看起来一样」的重构一旦真有差别，动的是用户看到的税额数字。

---

## [1.40.0] - 2026-09-17（推导链扩全流程 · 台账 C：四个完整测算齐平 + 速算器打样）

> 门禁基线：**verify:local 259 项**（本版不改项数）；单测 **63 套件 1162 例**（本版新增 11 例
> `tests/formula-steps-flows.test.js`）；线上指纹 **37 项**（不改动指纹覆盖点）。

### 为什么做
- 同为「完整测算」，**只有综合所得一页有计算过程**，经营所得 / 分类所得 / 反向倒算三页没有。
  在用户看来是「有的地方有、有的地方没有」的随机体验 —— 比「都没有」更伤信任。
- 我们要求用户相信一个影响真金白银的数字，财务的习惯是**对账**而不是信黑盒。

### 做了什么
- **一套渲染，四处复用**（不写第二套）：`utils.js` 从 `updateFormulaSteps` 抽出
  `renderFormulaStepsHtml(steps)`（纯字符串）+ `showFormulaStepsPanel(steps, panelId, bodyId)`（通用挂载），
  既有综合所得页行为完全不变。
- **三个新纯函数**：`buildBusinessFormulaSteps` / `buildClassificationFormulaSteps` / `buildReverseFormulaSteps`，
  结构沿用阶段12 已验证的 step schema（`title / rows / totalLabel / totalValue / footnote`）。
- **接线**：`index.html` 三页各插一份 `<details>` 折叠面板（默认折叠），
  `tax-calculator.js`（经营所得、反向倒算）与 `helper-functions.js`（分类所得）三处调用；
  未加载 `utils.js` 时跳过（保留现有「计算层可独立加载」的约定），但**不静默吞错**——
  `toolbox-ui.js` 走 `console.warn` 而非 `?.`（前车之鉴：`auth-ui.js` 死选择器靠 `?.` 抹错多年未发现）。
- **速算器打样 1 个**：`tool-registry.js` 月薪个税 `compute` 返回可选 `steps`，
  `toolbox-ui.js` `renderResult` 复用 `renderFormulaStepsHtml` 渲染。
  月薪低于起征点（无应纳税所得额）时不出面板，避免展示误导性的零值推导。
  **其余 19 个速算器待结构稳定后批量铺**（§5.5 ⑦「一次只打样一个税种」）。

### 验证
- 经营所得走**全链路**断言（真实跑 `calculateBusinessTax` → 面板 HTML），
  关键数值逐位可核对：利润 220000 → 弥补亏损 190000 → 扣除合计 98900 → 应纳税所得额 91100
  → 减半征收前 7720 → 税后 186140。
- 分类所得、反向倒算、月薪个税分别断言「面板数值 === 结果区数值」。
- **面板 DOM 防回滚**：`index.html` 六个面板 id 必须存在（缺一个即红）——
  防止接线在后续重构中静默失效。

---

## [1.39.0] - 2026-09-17（变现闭环：精装版报告版本选择 + 留资换权益钩子）

### 文档收口（台账 F/G/H/I 四项，纯文档零代码风险）
- **F（gtm 待办过期）**：`gtm-execution-plan.md` 待办 #7/#8 更正为已完成（social-base v1.29.0 / net-salary v1.30.0）；顺带修掉 `seo-landing-plan.md` 同表两行过期「待办」（与同表 ✅ 行自相矛盾）及已失效的「待办页推荐顺序」段。
- **G（活码术语不一致）**：gtm 文档 3 处「联系我」活码统一更正为「微信客服」活码（kfid 型客服账号链接），口径对齐 `wecom-channel-playbook.md` —— 术语错会把人引去企微后台错误的配置入口找不着的「客户联系」加好友那套。
- **H（stage10 DoD 与头部自相矛盾）**：七项按**可查证的验证载体**逐项勾销（authService `SEED_GRANT_PRO`、verify:local「上传/全量拉取、冲突新者胜、墓碑广播、SYNC_MAX_RECORDS、free 403 PRO_REQUIRED」、history-sync 单测、ops-check-prod.ps1 线上指纹）；双真机矩阵未单独留痕处如实标注、以引擎断言为准 —— 不盲勾。
- **I（stage13 漏 province/city）**：§4 Prisma 模型与 §5 字段表补齐两字段（≤20 字符，v1.17.0 增补），含「其他/海外」哨兵值出参剔除、幂等合并省市各自判断两条实现口径（出处 `schema.prisma:243-244` / `leadController.js:37-38,104-105`）。

> 门禁基线：**verify:local 259 项**（本版不改项数）；单测 **61 套件 1144 例**（本版累计新增 31 例：
> 变现闭环 13 例 + 本轮 Phase 1.5 兼容性 18 例）。
> 线上指纹 **37 项**（不改动指纹覆盖点）。
> ⚠️ 已重新执行 `npm run build:css`：Tailwind 是**构建期编译**，版本选择弹窗新增的 amber 系列类
> 不重新构建不会进入产物（已验证 `amber-50/200/300/700`、`max-w-md` 均在产物中）。

### 为什么做
- 「前期引流 → 后期自收费」两阶段之间缺一座桥：算完之后没有把高意图用户沉淀下来的出口。
  精装版报告对非专业版此前是**静默降级** —— 用户根本不知道有精装版存在，没预期就没有转化。

### 做了什么
- **导出改为「给两个版本，不给一道障碍」**：非专业版点导出 → 版本选择弹窗（标准版 / 精装版），
  不再静默降级。精装版价值说明在点导出后、选版前即可见 —— 即 Phase 3.5 的「付费预期」。
- **留资换权益钩子**：选精装版 → `LeadModal.open({ source: 'report_pro' })`。
- **后端归因**：`leadController.SOURCES` 新增 `report_pro`，与 `seo_*` 同级别独立归因，
  用于衡量这条链路是否真的带来线索，而不只是噪音。

- **③ 到期前提醒 + 续期入口**：修掉 `plan.js` 一处静默缺口 —— 专业版的 `daysLeft` **此前恒为 0**，
  付费一年的用户在到期前收不到任何提示也没法判断该不该给入口；改为按真实到期日计算，
  并抽出 `daysLeftUntil` 让体验版与专业版共用同一套天数口径（避免两处算法漂移）。
  `auth-ui.js` 专业版 hero 在**剩余 ≤ 7 天**时切换为倒计时提醒 + 「联系我们延续权益」按钮。
  续期走 `renew_pro` 归因，**同样由留资发码完成**，站内零购买语义 —— 与 ① 报告钩子共用同一条站外收款路径。

### 合规护栏（四条硬约束）
- **零购买语义**：「索取精装版报告」与「权益续期」两处入口均不出现「购买 / 支付 / 价格 / ¥ / 订阅」。
  收款发生在站外，站内只有「留资 → 发权益码」，因此不触发 iOS / 微信虚拟支付条款。
- **`BLOCKED_TYPES` 双保险**：`reverse`（谈薪）永不出钩子；`REPORT_ALLOWED_TYPES` / `REPORT_BLOCKED_TYPES`
  与 `lead-touchpoints.js` 同款，已暴露到 `window.EuriskoReport` 供门禁断言，防后续迭代失守。
- **绝不卡住导出**：`LeadModal` 不可用时兜底为标准版导出。**免费必须能导** —— 这是升级感与勒索感的分界线。
- **不另起线索表单**：复用 `lead-modal.js`，避免绕过「不采集任何收入金额」这条个保法基线。

- **已过期的付费用户拿到专属话术**（上一版留下的收尾项）：`getTier` 新增 `expiredPro` 分支——付费/兑换码
  权益过期后**保留 `expireAt`**（此前被丢弃），并与 `expiredTrial` 互斥。三处消费点同步认这个标记：
  徽标显示「专业版权益已于 X 到期」、云同步面板指明恢复位置、版本权益弹窗换成「联系我们恢复权益」。
  原来这类已付费用户看到的是一句「免费领取体验」，等于把他当用户重新养一遍。
  新增 4 条单测锁住「保留 expireAt」与「与 expiredTrial 互斥」。

- **gate 提示按档位取词**（上一版的收尾项）：此前 `PRO_FEATURE_HINT` 对所有非专业版都是同一句
  「基础版可免费领取 14 天体验」，对三类人是错的 —— 付费权益过期的人被降级、体验中的人被当成没在用、
  体验过期的人没被告知还能再领。现抽出 `GATE_CAPABILITIES` 作为能力描述的**单一来源**，四条提示只
  在「下一句该干什么」上分叉，并新增 `featureHintFor(user)` 统一取词；`auth-ui.js` / `scenario-ui.js` /
  `history-sync.js` 三处调用方全部改走它 —— 其中 `history-sync.js` 原先未留存 `pro_granted_by`，
  补上后才能区分「付费过期」与「体验过期」，否则前者会被当成后者。新增 9 条单测，含
  「四种身份对应四条话术」与「各身份均无购买语义」。

- **留资「所在城市」由必填改为选填（前后端口径对齐）**：后端 `leadController.buildLead` 一开始就写的是
  「选填（不阻断留资），只做长度约束」，前端却把它写进了 `validate()` —— 用户不填城市就提交不了，
  等于在北极星 `lead_submit` 上凭空丢弃线索；且行政区划不可能穷尽（县级市 / 境外），
  「其他」兜底之外仍有用户无解。现改为**只收不验**：控件位置与「便于按当地口径核对」的建议文案保留，
  星号与拦截去掉。同步点五处：`lead-modal.js` / `index.html` / `verify-local-auth.js` 门禁断言
  （原先连必填星号都断言了，等于把这条摩擦写进验收）/ `api-reference.md` / `README`；
  并改用**反向断言**（`!includes('请填写所在城市')`、「必填星号不得复活」）防止半吊子回滚。

- **Phase 1.5 微信 + PWA 可用性**（此前判定做的缺口 D）：新增 `src/js/utils/runtime-env.js`
  （判定逻辑为纯函数，配套 18 条单测）与 `src/css/runtime-env.css`。两项都直指「静默失效」：
  - **导出兜底**：微信 / 企微 / QQ 内置 / 微博 / 钉钉容器内 `doc.save()` 会被拦或静默失败，
    此前用户点导出的表现是「没反应」—— 而微信恰是当前唯一真实可达渠道，等于链路不闭环。
    现按「下载 → 结果长图（长按保存）→ 复制结果文本」降级，三者必有其一，并保留「仍然尝试下载」。
    判定不得误伤 QQBrowser / Chrome / Safari 这类真正支持下载的浏览器 —— 误判会让本可一键下载的
    用户绕远路，这类静默劣化只有测试拦得住（已锁 `QQ/8.x` 与 `MQQBrowser` 的区分）。
  - **安全区此前全是空操作**：`index.html` 的 viewport 缺 `viewport-fit=cover`，导致
    `env(safe-area-inset-*)` 恒为 0 —— 既有的 `.bottom-tabbar` padding-bottom、分享图 toast 的
    top 偏移都写了，但从没生效过。补上 cover + `runtime-env.css` 的统一留白；
    顶栏改用 body `padding-top`，因 `.compact-nav` 被写成固定 56px 高，给它加 padding 会挤压内部 logo 区。
    PWA standalone 另有 `@media (display-mode: standalone)` 与 `html[data-app-mode="standalone"]` 双路兜底。
  - **Phase 1「手机端算得完」：多步流程本地草稿 + 断点续算**（新增 `src/js/data/draft-store.js`，配套 22 条单测）：
    综合所得 / 反算 / 经营所得 / 分类所得四个多步流程，输入即自动暂存，下次进入同一流程时
    提示「上次填到第 N 步（25 分钟前）· 继续填写 / 清除重填」，并**连当前步一起回到原来那一步**。
    - **为什么做**：手机上从「基本参数 → 收入明细 → 扣除项」要填三屏，误触一次返回或接个电话
      就回到第一屏、刚才填的收入全丢 —— 这是 `calc_done` 分母最大的单点流失。
    - **敏感个人信息的三条边界**（收入 / 五险一金属个保法敏感个人信息，写错一次性质就变了）：
      ① **只存本机** —— 独立 `euriskoDraft:` 命名空间，云同步只认 `taxCalculationHistory`，草稿天然不进同步链路，
      文件内零网络调用（由单测盯住）；② **过期即弃** —— 默认 7 天，让上个季度的工资数悄悄回填比没有草稿更糟；
      ③ **明示 + 可一键清除** —— 恢复条写明「只存在这台手机，不会上传」，给「清除重填」，退出登录随本地数据一并清除。
    - **不改任何导航函数**：当前步直接读 DOM 里可见的 pane，跳跃仍走各流程原有的 `goToStep` 等入口；
      恢复时逐个派发 `input` / `change`，让「劳务报酬折算」这类联动真的重算 —— 否则界面上只是摆了个数。
    - **默认值不做数**：表单里大量缺省 `value="0"`，改成比对基线（registration 时的快照）而非「非空」，
      否则每个流程一进页面就算「有内容」，草稿删不掉、提示条赶不走；改回默认值也会自动抹掉草稿。
    - **切后台 / 离开页面先把待存落盘**（`pagehide` + `visibilitychange`）：少这一步，
      用户在 600ms 防抖窗口内被打断，丢的恰恰是最需要的最后那几个字。
  - **Phase 1 收口：手机端任务页固定层 27.7% → 14.5%**（新增 `src/js/ui/task-mode.js`，配套 8 条单测；
    改动：CSS 一段 ≤640px 媒体查询 + `showPage` 里一处 `TaskMode.sync` 调用）。
    - **这次不用目测**：先前文档里那句「任务页固定层约 22%」只有结论没有方法、无从复核；
      本轮改用本机 Chrome 无头（`playwright-cli` + 临时静态服务，`getBoundingClientRect` 取真值），
      先把改前的每一层量出来，改完再量一遍：

      | 视口 | 改前 | 改后 | 预算线 |
      |---|---|---|---|
      | 360×640 | 56+73+48 = **177px / 27.7%** | 0+45+48 = **93px / 14.5%** | ≤115px（18%） |
      | 390×844 | 同绝对高度 = 27.7% | **93px / 11.0%** | ≤152px（18%） |
      | 768 / 1280 | 208px | **208px（未动，形态零变化）** | — |

    - **两条手段都只对 ≤640px 生效**：① 进入任务页时隐藏全局顶栏 —— **不是丢导航**，任务页自带
      「返回工作台」按钮，填表过程中原本也用不到顶栏；② 步骤条并入标题行，省掉整整一行常驻高度。
      桌面端形态零变化，改坏了删掉这段 CSS 就能整块回滚。
    - **任务页判据看结构不看 id 白名单**（`page.querySelector('.calc-sticky-header')`），
      以后新增向导式页面自动继承同样的预算，不用回来改常量表。
    - **一个真实的接线坑**：`showPage` 的**分支A（初始导航 / 深链直达）会直接 `return`**，
      因此 `sync` 必须放在两个分支**之前** —— 否则首次进入与深链完全不生效，而常规点进又正常
      （最容易骗过手工验证的那种失效）。已把这条写成单测断言（sync 索引必须早于分支A）。
    - **顺带发现两个问题，均未擅自改**（详见 `ui-ux-master-plan.md` §13.2 的 J / K 行）：
      ① `auth-ui.js` 用 `document.querySelector('.app-container')?.` 开关主容器，但全库**没有**这个 class
      （`index.html:345` 只有 id），`?.` 抹掉了报错 ⇒ 这两行从未生效；而唯一真正在放行的 `showApp()`
      只在 `isLoggedIn()` 时被调用，意味着**未登录游客目前看不到任何计算器**。这是访问门槛的产品决定，
      改一行就能放开，但不该混在这次改动里；
      ② 桌面 / 平板任务页固定层 208px（20.3% / 23.1%），同样高于 18% —— Phase 1 的预算线写在手机端语境下，
      桌面要不要同标准待定。
  - **游客会话（免登录使用）：登录墙与文档口径对齐**（新增 `src/js/auth/guest-session.js`，配套 9 例单测）。这不是拍脑袋放开 ——
    stage10 功能矩阵明文「游客（未登录）= 免费版：全部计税功能、本地历史、基础截图导出」、
    ui-ux 主计划明文「❌ 绝不强制登录前置」，而代码实际是**未登录一律挡在登录页**。全部计算都在浏览器内完成、
    不需要服务端，登录本就该只承载「云同步 / 权益」而不是使用门槛。
    - **形态**：登录页新增克制的「免登录使用 →」入口；顶栏在游客会话时显示「登录」按钮（此前 index.html 里
      `auth-section` 从未存在过 —— 又一处引用了不存在节点的死代码，这次一并补上回路）。
    - **标记走 sessionStorage 而非 localStorage**：关掉标签页即失效，下次进入仍先给登录页 —— 注册转化入口不动。
      想改成「长期记住」是一行改动，但那是对注册转化有影响的产品决定，默认不做。
    - **顺带修掉那两行从没生效过的死代码**：`showPage` 里 `querySelector('.app-container')`（全库无此 class、
      `?.` 抹掉报错）改为按 id 取，且放行必须过 `canUseApp()`（已登录或游客会话）—— 登录墙的存在与否
      从此是**显式判断**，不再依赖一行匹配不到的选择器。
    - **登出 / 注销 / 登录成功三处都摘游客标记**：登出后「登录页重现」的反馈不变 ——
      换账号共用浏览器时等于没退出去（隐私，不是体验问题）。
    - **实测（Chrome 无头 390×844）**：初始态登录页在 → 点免登录 → 主应用可用、顶栏登录钮出现 →
      再次触发 updateAuthUI **不被踢回**（关键回归点）→ 综合所得四步走完，税后 ¥171,923.56 / 税 ¥8,076 →
      保存历史落本地 1 条（符合「本地历史」口径）→ 点顶栏登录 → 回登录页且标记清除 → 可再次免登录进入。
      控制台无 JS 运行时错误（仅静态服务无后端的 /api 404）。
  - **政策依据改为页内展开（不再外跳）**：结果页此前只有政策时效徽标，真正的依据一行都没渲染，
    想看「这个数按哪条政策算的」只能跳落地页 —— 而恰恰是这一句财务 HR 要带走给老板。
    现在就地折叠展开，数据源仍是 `registry.basisOf`（页面从不自己抄文号），
    并给「复制政策文号」而不是一条 `target="_blank"` 的外链：微信 / PWA standalone 里
    外链会跳出容器或直接打开失败。导出的 PDF 同步带上「政策依据」一节（`basisHtml()` 读同一份
    `basisOf`）；打印件里点不了链接，用户要的只是那一行文号 —— 测试已断言两者同源且报告内不含 `<a`。
  - **PWA standalone 里按返回不再一步退出应用**：站点切页只改 `hidden` 类，**一条 history 条目都不产生**，
    加到主屏幕后没有地址栏，安卓返回手势等于直接退出应用，填到一半的流程就此蒸发。
    新增 `src/js/utils/page-history.js`：前进一次建一条条目；UI 返回按钮与系统返回手势
    **共用同一个回到上一页的动作**（`applyBack`）—— 两条通路各记一半账正是
    「按了返回却跳到早已离开的页面」的根因，一来一回严格配对则无需额外对账。
    退到起点后不再劫持这一次返回（用户仍能正常退出应用）；受限容器里 `pushState` 抛
    `SecurityError` 时整体降级为不接管，行为与改造前一致。

### 文档
- 单测口径已随实测同步（`README` / `docs/README` / `development-workflow` / `development-plan` /
  `CHANGELOG` 共 7 处落点），由 `npm run verify:release -- --write` 完成 —— 上一版新增用例后漏了这一步，
  而我只跑了定向套件没跑全量，漂移一直没暴露。
- 补回 1.39.0 小节缺失的「线上指纹」一行：历史每个版本都有这条三段式基线，漏了会让
  `tests/docs-metrics.test.js` 解析不到指纹口径。

### 已知限制（不阻塞）
- 版本号已在本轮提到 **1.39.0** 并完成五处对齐（`package.json` / `version.json` 含 `releasedAt` /
  `index.html` 的 `__APP_VERSION__` / 关于弹窗 / CHANGELOG 标题）。此前 CHANGELOG 已先行写到 1.39.0、
  实际版本号却仍停在 1.38.0，
  `verify:release` 判「当前口径未标注当前版本」而红，现已通过。
- 经营许可证与 ICP 备案号仍为空（`site-filing-ui.js` 配置）：下证后只改这一个配置即可，不在本轮范围。

---

## [1.38.0] - 2026-09-16（UI 地基：Tailwind 本地构建 + 设计令牌 + 层级表 + 双端形态分工 + 屏幕预算回收）

> 门禁基线：**verify:local 259 项**。本版**不改项数**。
> 单测 **56 套件 1059 例**（新增 20 例：两端导航同步、助手不占导航位、`updateTabBar` 与 `syncNav` 等价、
> 悬浮球避让底栏、底栏切走后不额外留白；助手推开 3 例 —— 打开时打标记、三条关闭路径都摘标记、toggle 不残留；
> 落地页令牌 4 例 —— 每页都加载 tokens.css、共享色映射到令牌、引用的变量都有声明、零内联样式；
> 打印与分享图 6 例 —— 加载 print.css、打印样式表里不得有屏幕态规则、隐藏清单的 id 真实存在、
> 打印前摘深色模式且打印后还原、分享图模板内联样式不挂 class、全局 CSS 无裸元素选择器；
> 底栏避让锚点 2 例 —— 避让规则不锚在宽度工具类上、两个顶层页各自标出 `data-page-container`）。
> 线上指纹 **37 项**（不改动指纹覆盖点）。

### 为什么做
- 手机与桌面跑的是同一套页面，导致「手机不快、桌面不强」。本版先铺地基，不改任何计税逻辑。

### 做了什么
- **Tailwind 由 CDN 运行时改为构建期编译** —— 这不是顺手换加载方式，是修一个会「整页裸奔」的线上隐患：
  Play CDN 把 config 交给编译器那一步在本项目**实测失效**（运行时 `window.tailwind.config` 恒为 `{}`），
  于是 `src/css/tailwind.src.css` 里的 `@apply shadow-card` 解析不到主题扩展而抛 `CssSyntaxError`；
  而 Play CDN 一遇 `@apply` 失败就**整份样式表不注入** —— 用户看到的是「整页裸奔」而不是「少几条样式」，
  控制台只留一行，极难定位。
  - 改法：装本地 `tailwindcss@3.4.17`，config 落到仓库根 `tailwind.config.js`，
    `npm run build:css` 产出 `src/css/tailwind.css` 与 `src/css/admin.css`（`prebuild` 自动带跑），
    `index.html` / `admin.html` 换成同名 `<link>`、删掉页内 config `<script>`。**产物随源码入仓**，
    部署侧（Dockerfile / 静态托管）零改动。
  - 收益：不再依赖 `cdn.tailwindcss.com`（离线与弱网都稳、少一个跨境第三方）、
    样式表位置回到本仓库可控（上面 print.css 的覆盖次序才有确定答案）、
    省掉约 400KB 运行时 JS 与它带来的首屏样式抖动。
  - 代价：产物入仓意味着**改了类名必须 `npm run build:css` 并提交产物**，否则线上不生效 ——
    这是从「浏览器里现算」换「发布前算好」的确定性，代价落在流程上。
  - 连带：`cdn.tailwindcss.com` 从 Service Worker 的 CDN 白名单移除（同源产物走 network-first，
    本来就落运行缓存，离线能力不受影响）；
    动态拼接类名的写法从「会卡顿」升级为「直接失效」，已在 `auth-ui.js` 注释里写明。
- **新增 `src/css/tokens.css`** —— 设计令牌唯一真源。此前 App（Tailwind）与 SEO 落地页（`seo/landing.css`）
  两套体系各自维护色值，改版必漂移。下一步 `seo/landing.css` 接入同一份令牌。
- **z-index 层级表** —— 此前全站散布 10 个魔法值（10/45/50/99/100/200/201/9999/10000/10002），
  且悬浮球(100) 与模态同级，这是悬浮球盖住底部 Tab 栏的根因。现统一取 `--z-*` 变量，悬浮球降为 60。
- **导航双形态** —— 手机 `<768px` 走底部 Tab 栏（拇指热区），桌面 `≥768px` 走顶栏下方 Tab 行
  （桌面把 3 个 Tab 横贯通栏既浪费横向空间，也违背「导航在上」的惯例）。
  两套 DOM 由 `syncNav()` **统一驱动**：同一份状态的两种投影，不允许各自维护显隐逻辑（已加测试钉住）。
- **助手移出导航位** —— 它是情境动作（悬浮球 + 结果页情境入口），不是目的地；腾出的位置给真正的主目的地。
- **对比度修复** —— 底部 Tab 未激活色 `#9ca3af` 白底对比度仅约 2.6:1，不达 WCAG AA；改 `#6b7280`（约 4.8:1）。
- **去掉失效的 Inter 字体声明** —— config 里写了 Inter，但全站既无 `@font-face` 也无 Google Fonts 引用，
  实际一直在走 `system-ui` 兜底。改为显式写出真实生效的字体栈（含苹方 / 微软雅黑）。
- **手机端减固定层（计算页）** —— 计算页同时压着三层常驻占位（全局顶栏 56 + 紧凑顶栏约 99 + sticky 预览条），
  合计吃掉约四分之一可视高度，而这个战场恰恰是高价值线索的主战场。
  移动端改为「一次只显示当前步」：隐去连接线与已完成步骤圆圈，只留「当前步标题 + N/M」一行，
  并隐去填表过程中冗余的副标题；预览条 `py-2` → `py-1.5`。**不动任何 DOM**，
  步骤条仍由 `updateStepIndicator` 驱动、`tests/interaction.test.js` 的既有断言完全不受影响。
- **悬浮球避让底部 Tab 栏** —— 才修好层级还发现位置本身就有问题：球默认停在距底 24px，
  小于底栏的 52px，正好落在导航按钮上。现改为读 `#bottom-tabbar` 的 `offsetHeight` 实时预留，
  （默认位置 / 拖拽夹紧 / resize 重新约束三处统一），而不是写死 52px —— 底栏高度将来调整不会漂移。
- **桌面容器加宽（工具页）** —— 工具页容器 768px → 1024px（与首页同一栅格，换页时留白不跳），
  列数则交由网格按可用宽度自适应：容器加宽后若仍停在两列，每张卡会拉到约 490px，
  图标到箭头之间一大段空白，等于没省回来。20 个工具的纵向滚动随之减半。
  **未加单测**：jsdom 没有布局引擎，网格列数与容器宽度断言不到实处，硬写只会得到一条自我实现的假守卫。
- **修掉一处被上一条打断的旧规则** —— 底栏避让留白原先写在 `#tools-page .max-w-3xl` 上；
  容器一加宽到 `max-w-5xl`，这条选择器就**匹配不到任何元素**，工具页最后一张卡片会被底栏压住。
  这类失效 jsdom 完全看不出来（没有布局引擎，DOM 断言照常全绿），只有肉眼划到最后一屏才现形 ——
  这也是上面那条「未加单测」的代价：加宽是对的，但它顺手打断了另一条规则而没人报。
  现改为锚定语义属性 `[data-page-container]`（宽度是会被反复调的排版决策，不能当结构锚点），
  并补两条源码层断言钉住这个约定。
- **助手桌面改为推开式侧栏（≥1280px）** —— 桌面不再是「侧栏浮在内容之上」，而是把内容区挤窄。
  收益是同时能看见「政策问答」和「正在算的那张表」：对着答案改数字是税务场景的日常，
  覆盖式只能二选一，而这个宽度桌面屏本来就有。
  - 阈值为什么是 1280：侧栏 480 + 内容至少留 `--c-narrow`(720) = 1200，向上取标准断点 1280。
    低于它推开会把速算器表单挤到 720 以下、标签与输入框脱钩 —— 所以 1024–1279 与手机一样维持覆盖式 + 遮罩。
  - **形态由 CSS 决定，JS 只打一个 `assistant-open` 标记**：推不推开取决于「还剩多少宽度」，
    媒体查询天然跟着缩放走；改由 JS 判断就要再挂一个 resize 监听，两端形态还得各维护一遍。
  - 侧栏宽度收进令牌层（`--assistant-w`）：抽屉宽度与让出的内容宽度必须同源，
    否则推开后要么压掉内容一截、要么留出一条缝。
  - 推开态不压暗也不拦点击；计算页用 `50vw` 负边距做通栏的那几处不受影响 ——
    内容被 padding 推回可用区，多出来的通栏背景正好被抽屉盖住，不会露缝。
- **SEO 落地页接入设计令牌** —— 落地页此前自带一整套色值副本（品牌蓝、正文灰、边框、成功 / 告警），
  与 App 端同一个品牌色存在两份，改版必漂移。现在 21 个页面先加载 `src/css/tokens.css`，
  `landing.css` 只留一层别名映射。
  - 顺带往令牌层补了 5 个档位：`--c-success-text` / `--c-warning-text` / `--c-warning-bg` /
    `--c-warning-line` / `--c-brand-line`。**不能直接复用原本的 `--c-success` / `--c-warning`**：
    那是徽章**底色**用的饱和色，当文字色在白底只有约 2.5:1，不达 WCAG AA ——
    迁移不是换个引用就行，得先确认取的是「白底可读档」。
  - 品牌投影改用 `--c-brand-rgb` 三元组（`rgba(var(--c-brand-rgb), .08)`），品牌色仍只有一处定义。
  - **有意只迁颜色，不迁字号 / 圆角 / 间距**：落地页是阅读排版，H1 30px、卡片圆角 14px、小字 13.5px
    这些值在令牌阶梯里没有对应档，硬套等于改渲染 —— 在没有视觉回归的前提下不值得。
    落地页独有的「一次性色」（输入描边、焦点环、下凹面、新角标、CTA 渐变终点）也留在
    `landing.css` 顶部单独一段并写明理由：塞进全局令牌只会稀释那份表的含义。
    判定标准就一句 —— **换个产品也该跟着变的取令牌，只属于落地页版式的留在本地**。
  - 代价：每页多一个同域 CSS 请求（约 5KB 未压缩），换来改品牌色只改一处。
- **打印样式（S8）** —— 新增 `src/css/print.css`，只含 `@page` 与 `@media print` 两块，屏幕态零副作用：
  导航 / Tab 栏 / 悬浮球 / 助手抽屉 / 横幅 / 按钮不进纸面；被 `max-height` 与 `overflow` 折叠的内容全部摊开
  （纸没有滚动条，折叠等于直接丢内容）；`thead` 每页重复表头；结果行不跨页断开。
  - **深色模式不是 CSS 能兜的**：浏览器默认**不打印背景色**，深色模式的浅色文字会印成「白纸上的白字」。
    而 Tailwind 的 `dark:` 变体是 `.dark 后代`选择器，逐条覆盖既写不全也必然漏 ——
    所以在 `beforeprint` 里临时摘掉 `.dark`、`afterprint` 还原。
  - 覆盖规则一律带 `!important` 是刻意的：要盖的是 Tailwind 工具类（`sticky` / `max-height` / `overflow` …），
    而 `src/css/tailwind.css` 排在**本文件之后**加载，同为单类选择器时后者胜出 —— 只调顺序解决不了
    （把整份工具类压到打印样式之前，牵动的是全站样式次序）。
- **分享图未受影响（S8）** —— 结论来自静态确认而非「看着没问题」：分享图三个模板函数
  （`buildHtml` / `rowHtml` / `qrBlockHtml`）全部内联样式、不挂 class，且 `toolbox.css` / `tokens.css`
  不含裸元素选择器。这两条已固化成断言 —— 分享图容器挂在真实 `body` 上截图，全局样式一旦渗进去，
  表现是「某次改样式之后图变了」，而没人会把锅算到那次改动上。
  - **仍未验证的**：纸面观感与分享图像素层面需要你在浏览器里按一次 Ctrl+P、生成一次分享图对比。
    这是 §8 缺的视觉回归，自动化补不上 —— 本版只保证「不退回」与「不渗色」，不保证好看。

### 有意不做
- **速算器表单页没有跟着加宽** —— 列表宜宽、表单宜窄： monetary 输入框拉到 480px 会让标签与输入
  在视觉上脱钩，也不满足 65–75 字符的行宽原则（`--c-narrow` 令牌就是为此设的）。加宽只给列表类页面。
- 未在计算页隐藏全局顶栏：那能再省 56px（手机可达 ~13%），但顶栏上是登录 / 用户菜单 / 主题开关，
  在做不了视觉回归的前提下，为一个锦上添花的像素目标冒功能回退风险不划算。**留做后续决策项。**
- 未把 Tailwind config 变量化：全站大量使用透明度修饰符（`bg-primary/90`、`ring-primary/50`）。
  改成本地构建后 `<alpha-value>` 已确定可用（v3.4.17 原生支持），这条 blocker 已消失；
  但仍需视觉回归才能确认「改一处就全站生效」，本版没有这个条件 ——
  等具备视觉回归条件后再迁移，届时改色只需改 tokens.css 一处。

---

## [1.37.11] - 2026-09-16（源码注释里的「是否值得参加 / 值得买」一并清掉）

> 门禁基线：**verify:local 259 项，实跑 259/259 全绿**（快照 `tools/ops/.verify-local-last.json`）。本版**不改项数**。
> 单测 **54 套件 1044 例**（无新增用例）。
> 线上指纹 **37 项**（不改动指纹覆盖点）。

- v1.37.10 已把可见文案清干净，但 3 个页面的 HTML 注释里还留着「是否值得参加 / 是否值得买」字样；
  这些是自我限定语（意思是「本页不承接这类提问」），可关键词扫描不看注释、照算命中 —— 统一改成「是否参与 / 是否购买」，语义不变
- 线上逐页核验：4 个页面源码已**零命中**红线词；22 个对外页面站名与免责声明全覆盖

---

## [1.37.10] - 2026-09-16（承诺书第二条补干净：清掉页面上所有的投资 / 消费判断措辞）

> 门禁基线：**verify:local 259 项，实跑 259/259 全绿**。本版**不改项数**。
> 单测 **54 套件 1044 例**（跟改 2 条落地页契约 + 备案守卫新增 1 条）。
> 线上指纹 **37 项**。

### 为什么紧接着又发一版
v1.37.9 只改了**答案段落**，同一页面里更显眼的位置还留着旧话术 —— 标题、H1、示例表、FAQ 名称、FAQPage 结构化数据、og 描述。
爬虫收录的正是标题，核查翻的也是首屏：**「个人养老金划算吗」「值得买吗」「值得参加」在金融产品页面上，就是「买不买 / 参不参加」的建议**，
而承诺书第二条写的是「不涉及投资理财业务」。

### 本轮清掉的（4 个页面 · 14 处）

| 页面 | 原措辞 | 改后 |
|---|---|---|
| private-pension | title「划算不划算一算便知」 | 「缴费与领取两环节税额测算」 |
| private-pension | H1「到底划不划算」 | 「两环节的税额怎么算」 |
| private-pension | 示例表「不划算」/ 回本线「仍划算」 | 「税收净优惠为 0」/「税收净优惠仍为正」 |
| private-pension | FAQ 名称 + FAQPage 结构化数据 | 「什么情况下…税收净优惠为零」 |
| enterprise-annuity | 「有企业年金的单位值得参加」 | 「单位缴费部分在领取时才计税（本页不构成是否参加的建议）」 |
| enterprise-annuity | 「真正不划算的，只是…」 | 「单看税收差额为负的，只是…」 |
| health-insurance | 「节税 1080 元值得为此买一份保险吗？」 | 「税优健康险的节税上限是多少？」 |
| health-insurance | 「不足以成为购买理由」「锦上添花」 | 「本页只测算节税上限…本页不构成购买建议」 |
| business-income / seo 目录页 | 核定征收「划算吗」 | 「核定与查账哪个税负低」（两种计税方式的**税额**比较，属测算范围，仅降级措辞） |

### 顺带钉住的
- 落地页契约测试 2 条改为断言新措辞，并额外钉住「**不构成投资建议** / **不构成是否参加企业年金的建议**」必须留在页面上
- 备案合规守卫新增 1 条：对外页面不得出现 `不划算 / 划算吗 / 值得参加 / 值得买 / 值不值得 / 净收益 / 购买理由`

### 仍未处理（等备案号与域名，同 v1.37.9 清单）
`icpNumber` / `policeNumber`、20 个落地页备案容器、独立《隐私政策》《用户协议》页、页脚主体信息、canonical 与 sitemap 域名切换。

---

## [1.37.9] - 2026-09-16（承诺书逐条对齐：站名 / 免责声明全覆盖 / 去掉投资理财判断）

> 门禁基线：**verify:local 259 项，实跑 259/259 全绿**（快照 `tools/ops/.verify-local-last.json`）。本版**不改项数**。
> 单测 **54 套件 1038 例**（新增 `tests/filing-compliance.test.js`：5 条**承诺书级**守卫）。
> 线上指纹 **37 项**（不改动指纹覆盖点）。

### 背景：备案承诺书已定稿，之后是逐条比对，不是凭感觉
《不涉及前置审批的承诺书》对外承诺了三句话，核查时就拿这三句话对页面：
① 网站名称 = **EuriskoTax 税费计算器**；② **仅提供数值测算**，不代为办理纳税申报，不涉及资金收付、支付结算、税务代理及投资理财；③ **页面均标注**「本测算结果仅供参考，不构成税务建议」。

| 承诺 | 核对结果 | 处理 |
|---|---|---|
| ① 网站名称 | 首页 title 有中文名，**页脚与 og 只有英文 EuriskoTax** | 22 个页面补齐中文全称 + 加测试锁住 |
| ② 不代办申报 | 无「代办 / 代为办理 / 帮您申报」入口（0 处） | 已达标，加测试 |
| ② 不涉资金收付 | 只有线下兑换码，**无在线支付** | 已达标，加测试（将来开收款要先想资质） |
| ② 不涉税务代理 | v1.37.8 已降级；本轮补齐后台线索标签 | 已达标 |
| ② 不涉投资理财 | **个人养老金 / 企业年金两页有「划算不划算」「净收益」「不建议为税优而缴」** | 改为税额事实 + 明示不构成投资建议 |
| ③ 页面均标注 | 22 个对外页面均有免责声明 | 已达标，加测试锁住 |

### 变更清单
- **22 个 html**：`© 2026 EuriskoTax` → `© 2026 EuriskoTax 税费计算器`，`og:site_name` 同步（名称与备案不一致是常见驳回点）
- **seo/private-pension.html**：title「划算不划算一算便知」→「缴费与领取两环节税额测算」；正文、FAQ、FAQPage 结构化数据、速算器结论里的
  「不划算 / 划算 / 净收益 / 不建议为税优而缴」→「税收净优惠为零 / 为正（仅测算税额，不构成投资建议）」
- **seo/enterprise-annuity.html**：「参加依然是净收益 / 不划算」→ 税额事实 + 不构成是否参加的建议
- **src/js/admin/admin.js**：后台线索标签 记账报税 / 申报核对 / 财税咨询 → 社保基数口径 / 测算结果看不懂 / 其他使用问题（与对外表单一致）
- **新增 tests/filing-compliance.test.js（5 条）**：站名与备案一致、每个对外页面都有免责声明、无代办/代理/理财类词、不宣称官方、无在线支付入口

### 还差（拿到备案号后一次补齐）
- `src/js/ui/site-filing-ui.js` 填 `icpNumber`（改一处全站生效）+ 开通 30 日内补 `policeNumber`
- 20 个落地页补备案容器（现在无号不渲染，不影响线上，与域名一起做）
- 独立《隐私政策》《用户协议》页面 + 页脚与落地页入口
- 页脚主体：上海鑫惟商务咨询服务有限公司 + 经营地址 + 客服电话 / 企业邮箱
- `canonical` / `sitemap.xml` / `robots.txt` 现指向 `euriskotax.zeabur.app`，**若备案域名不是它需整体切换**

### 需要你拍板的两件事
1. **备案决定书上的域名到底是哪个**（决定 canonical / sitemap 是否要整体改）
2. **是否打算开放线上收费**：开了就真的涉及「资金收付」，非经营性备案可能不够用，先确认资质再接支付

---

## [1.37.8] - 2026-09-16（备案内容合规：涉税服务表述全部降级为「测算工具 + 客服」）

> 门禁基线：**verify:local 259 项，实跑 259/259 全绿**（快照 `tools/ops/.verify-local-last.json`）。本版**不改项数**。
> 单测 **53 套件 1033 例**（跟改 2 条留资文案契约 + 新增 2 条：涉税服务话术红线 / 留资同意行必须有隐私政策入口）。
> 线上指纹 **37 项**（不改动指纹覆盖点）。

### 为什么改
- 备案核查看的是**页面内容是否与备案时填报的服务内容一致**。留资弹窗原来的
  「财税顾问 · 一对一 / 顾问帮您逐项查一遍，确认没问题再申报 / 记账报税 / 其他财税咨询」
  属于**涉税专业服务**话术，且与页脚「仅供参考，不构成税务建议」自相矛盾 ——
  **一句话就够被认定为超备案范围**，比任何极限词都危险（极限词我们本来就没有）
- 划界线：**核对「参数填没填对」是客服，核对「申报对不对」是涉税服务** —— 全站按这条线重划

### 变更（线上可见措辞 15 处）

| 位置 | 原文 | 改后 |
|---|---|---|
| 弹窗头部 | 财税顾问 · 一对一 | 使用协助 · 有问必答 |
| 弹窗标题 | 申报前先核对，该退的税别漏掉 | 算完先自查，该退的税别漏掉 |
| 弹窗副标题 | 顾问帮您逐项查一遍，确认没问题再申报 | 这三项最容易填错 —— 协助您核对填写的参数 |
| 信任点 | 咨询免费 | 免费使用 |
| 活码区 ×4 | 咨询顾问 / 顾问二维码 / 点此联系顾问 / 给出核对意见 | 联系客服 / 客服二维码 / 点此联系客服 / 协助核对参数是否有误 |
| 表单选项 | 记账报税 / 申报核对 / 其他财税咨询 | 社保基数口径 / 测算结果看不懂 / 其他使用问题 |
| 结果页卡 | 申报前先核对，避免多缴或漏扣 | 算完先看这三项，参数别填错 |
| 结果页按钮 | 免费咨询 | 免费协助 |
| 个人中心卡 | 个税汇算核对 / 记账报税，由顾问免费评估（角标 顾问咨询） | 个税汇算测算与工具使用问题，由客服协助（角标 在线客服） |
| seo/月薪页 CTA | 可留资由顾问按当地标准核对 | 可在 App 内留资，由客服协助确认当地参数 |
| 关于弹窗 | 薪酬规划 · 合理节税 | 薪酬结构 · 税负测算 |
| 速算器结果 | 建议方案可少交个税 | 两种口径差额（测算值） |

### 顺带补的合规项
- 留资同意行挂上**《隐私政策》链接**：`我已阅读并同意《隐私政策》，并同意客服通过电话或微信与我联系`
  （原来只勾「同意顾问联系」，收集姓名/手机/微信/城市/单位却没有政策入口，PIPL 告知-同意这条过不去）
- `LEAD_CONFIG` 的 `advisorName / advisorTitle` 注释加警示：备案后**不要**填「注册税务师 / 税务师 /
  财税顾问 / 一对一」这类资质或身份措辞；真要提供涉税服务须先完成涉税专业服务实名并公示信用码

### 本轮没做（下一轮，与备案号一起）
- 20 个 seo 落地页补备案容器（号为空时不渲染，所以现在做不影响线上显示，可等备案号一起）
- 独立《隐私政策》《用户协议》页面 + 页脚与落地页入口
- 页脚公示主体全称 / 营业执照 / 客服电话；备案号与公安备案号下发后填 `src/js/ui/site-filing-ui.js`

---

## [1.37.7] - 2026-09-16（记一条待办：拿到「联系我」链接后换回链接形态）

> 门禁基线：**verify:local 259 项，实跑 259/259 全绿**（快照 `tools/ops/.verify-local-last.json`）。本版**不改项数**。
> 单测 **53 套件 1031 例**（无代码改动）。
> 线上指纹 **37 项**（不改动指纹覆盖点）。

### 变更
- `docs/marketing/wecom-channel-playbook.md`：第 5 节 B 方案补「待办」两条 ——
  后台若能看到「联系我」的**复制链接**，下次动活码时把 `wecomQrByChannel.share / .landing`
  从 `images/weworkQR.png` 换成该链接（点击直达 + 换人不换图）；
  没有链接就维持图片形态（扫码正常，点击只是打开这张图，手机长按可识别）

### 为什么现在不改
- 图片形态 v1.37.6 已上线且可用，**换链接是体验优化不是修问题**；
  等哪天在后台确认有「复制链接」按钮，再一次性换掉并做真人验收

---

## [1.37.6] - 2026-09-16（加好友活码上线：分享图 / 落地页走「联系我」，站内弹窗继续用微信客服）

> 门禁基线：**verify:local 259 项，实跑 259/259 全绿**（快照 `tools/ops/.verify-local-last.json`）。本版**不改项数**。
> 单测 **53 套件 1031 例**（新增 1 例：分码里填的本地图片必须真实存在）。
> 线上指纹 **37 项**（不改动指纹覆盖点）。

### 变更
- `index.html`：`wecomQrByChannel.share / .landing` 填 **`images/weworkQR.png`**（客户联系「联系我」**加好友**活码，图片形态）；
  `modal` 与兜底 `wecomQrUrl` 保留微信客服 kfid —— 扫码即聊、**不加好友**
- `tests/lead-wecom-qr.test.js`：新增守卫「分码里填的本地图片必须在磁盘上存在」
  —— 图片形态一旦填错路径，静态托管照常返回 200，浏览器里就是一张裂图，只能靠这条用例拦住

### 为什么这么分（两条线并存，取舍见 playbook 第 5 节）
- 站内弹窗 → 微信客服：门槛低、即时咨询，欢迎语**可按客服账号分别配**
- 分享图 / 落地页 → 加好友活码：沉淀长期关系、可打标签，代价是多一步「加好友」

### 已知代价（图片形态）
- 点击二维码只是**打开这张图**（手机上长按可识别），没有可跳转的加好友链接；
  哪天在企微后台看到「复制链接」，换回链接形态即可点击直达（换人不换图）

---

## [1.37.5] - 2026-09-16（B 方案：客户联系「联系我」加好友活码怎么弄 + 两条线怎么选）

> 门禁基线：**verify:local 259 项，实跑 259/259 全绿**（快照 `tools/ops/.verify-local-last.json`）。本版**不改项数**（纯文档新增一节，无代码改动）。
> 单测 **53 套件 1030 例**（无代码改动）。
> 线上指纹 **37 项**（不改动指纹覆盖点）。

### 变更
- `docs/marketing/wecom-channel-playbook.md` 新增**第 5 节 B 方案**（手册 v1.2）

### 加好友活码怎么弄（官方路径，出自《如何添加客户》《联系我》）
管理后台 → 客户与上下游 → 客户联系 → 加客户 → **联系我** → 新建联系方式
- 联系形式选**二维码**（另两种：工卡 / 小程序按钮）
- 类型：**单人**（一人接待，扫了就是你）／**多人**（活码，≤100 名成员，客户随机分到其中一位，以后加人不用换码）／**批量单人**
- 勾「**客户添加时无需经过确认自动成为好友**」（官方：默认勾选）→ 免确认，转化更高
- 备注写来源名（如 `来源-留资弹窗`）—— 后台里唯一好认的标识
- 建完**下载**二维码；官方文档只写下载，**后台同处一般还有「复制链接」**（以后台实际为准），有链接优先用链接

### 三个坑
- **欢迎语按成员生效**（官方：每个成员仅生效一条，上限 100 条 / 每条 1000 字）→ 三个码都指向你一个人的话，
  客户听到的都是同一句，**做不到"一入口一句"** —— 这是与微信客服「按账号配」最大的差别
- **自动打标签无官方背书**：《如何添加客户》《联系我》《客户标签》三篇官方页**都没写**「联系我」自动打标签 →
  表单里有就选上，没有就客户添加后手工打，或用不同接待人区分
- **前置权限**：成员需在「客户联系 → 配置 → 使用范围」内且**已激活 + 已实名**，否则客户加不上或没人接

### 结论
- 站点**两种形态都收**：链接现场生码 / PNG 或 `wework.qpic.cn` 图床直接显示（`lead-modal.js` 已识别）
- **建议并存而非替换**：留资弹窗继续用微信客服（不加好友、门槛低），分享图 / 落地页用加好友活码（沉淀长期关系、可打标签）；
  站点本来就按入口填不同的码，**两套可以同时填**

---

## [1.37.4] - 2026-09-16（企微后台那一半：确认是「微信客服」，按官方能力边界给出可执行路径）

> 门禁基线：**verify:local 259 项，实跑 259/259 全绿**（快照 `tools/ops/.verify-local-last.json`）。本版**不改项数**（纯文档修订，无代码改动）。
> 单测 **53 套件 1030 例**（无代码改动）。
> 线上指纹 **37 项**（不改动指纹覆盖点）。

### 变更
- 仅修订 `docs/marketing/wecom-channel-playbook.md` 至 v1.1（站点侧 v1.37.3 的分码机制**不需要改** —— 微信客服「一账号一链接」正好对上「一入口一码」）

### 核实到的四点（决定做法，均出自企微官方帮助中心）
- 这个 `kfid` 是**微信客服**的客服账号，不是「客户联系」的加好友活码 —— 两者能力不同，不能按加好友那套配
- 一个微信客服可建 **5000 个客服账号**、每个账号一条独立链接 → **一入口一账号**是官方支持的用法
- 欢迎语**能按客服账号分别配**（一账号同时只能关联一条）；三个官方坑已写入手册：48 小时规则（同微信号 48h 内不再发、改文案后需等 48h）／开了 API 或第三方授权后原生欢迎语失效／欢迎语带链接需客服组件支持
- **微信客服没有「扫码自动打标签」**（那是客户联系的能力）→ 来源靠「哪个账号接的」区分；标签给三种替代做法：不同接待人（人即标签）／顾问手工补／API 带 `scene` 的带参链接 + 回调回写自己的线索库

### 给你的下一步（二选一）
- **最省事**：只建 `share` 一个账号，现有账号继续当兜底码 —— 已发出的分享图与链接一个都不用动
- **一次性**：建齐 3 个，把链接发我填进 `wecomQrByChannel`

---

## [1.37.3] - 2026-09-16（按入口分码：让「留资弹窗 / 分享图 / 落地页」的来源真能区分）

> 门禁基线：**verify:local 259 项，实跑 259/259 全绿**（快照 `tools/ops/.verify-local-last.json`）。本版**不改项数**（只动活码分流、测试与文档）。
> 单测 **53 套件 1030 例**（`tests/lead-wecom-qr.test.js` 增 4 例：入口归类 / 专属码与回落 / 未知渠道不透传 / share 码渲染）。
> 线上指纹 **37 项**（本版不改动指纹覆盖点）。

### 变更
- **按入口分流活码**：新增 `wecomQrByChannel`（modal / share / landing），未配置的入口一律回落兜底码 —— 少配一个入口不会让通道消失
- **入口归类复用既有归因**：`channelOfSource()` 从现有 `source` 归类，**不新增归因字段**，管理台线索表与企微侧是同一套来源口径
- **埋点带渠道**：`euriskotax:lead-click` 的 detail 增加 `wecomChannel`
- **文案校准**：`kfid` 链接是**微信客服会话**而不是「添加好友」，弹窗文案由「扫码添加顾问企业微信」改为「扫码咨询顾问」

### 为什么只能是「一个入口一个码」
- 企微《获取客服账号链接》规定：客服链接**不可改写、参数不可复制到别的链接**，否则「进入会话事件」参数校验失败、回调拿不到来源 —— 手工拼 `?from=xxx` 是"页面照开、实际没数据"的假成功，比不做更糟

### 文档
- 新增 `docs/marketing/wecom-channel-playbook.md`：企微后台建码 / 欢迎语 / 打标签三步 + 验证清单 + 常见错误；未能核实的后台能力（微信客服能否自动打标签）明确标注为待确认项，不编造

---

## [1.37.2] - 2026-09-16（线索承接打通：企业微信「联系我」活码上线 —— 冷启动 P0 最后一项功能性缺口补上）

> 门禁基线：**verify:local 259 项，实跑 259/259 全绿**（快照 `tools/ops/.verify-local-last.json`）。本版**不改项数**（只动前端活码渲染、测试与文档）。
> 单测 **53 套件 1026 例**（新增 `tests/lead-wecom-qr.test.js`，7 例：配置是 kfid 链接 / 链接型不当图片 src / 现场生码 / 生码失败降级 / 图片型不回归 / 未配置降级）。
> 线上指纹 **37 项**（本版不改动指纹覆盖点）。

### 变更
- **企业微信活码配置生效**：`window.LEAD_CONFIG.wecomQrUrl = 'https://work.weixin.qq.com/kfid/kfcdb871293d06fc4d0'`，留资弹窗「立即通道」正式可用 —— 此前一直是空配置，承接只剩留言表单一条路
- **活码支持「链接型」**：企微「联系我」给的是**链接**而不是图片，直接塞进 `<img src>` 只会得到一张裂图；现在按形态分流 —— 图片直接用，链接用页面已有的 `qrcode-generator` 现场生码（换客服不换码，也不必维护一张会过期的 png）
- **二维码整块可点**：手机点一下直接进企微「添加顾问」页，桌面端扫码；生码或图片都拿不到时降级为「点此联系顾问」，不留裂图

### 文档
- 冷启动 P0 状态更新：`gtm-execution-plan.md`（Go/No-Go #1 与待办 #1 → ✅）、`business-plan-for-partners.md`、`stage13-acquisition-and-leads-plan.md`、`cold-start-materials.md`、`docs/README.md` 商业状态段

### 这一版钉住的口径（一条）
- **配错形态不报错，只会静默失效**：活码链接被当成图片用了，弹窗看起来一切正常、二维码位却是破图，而留资是冷启动唯一的即时承接通道。这类「不报错的坏」只能靠断言盯着，所以新套件里专门有一条判「kfid 链接不是图片」

---

## [1.37.1] - 2026-09-16（脚本编码守卫：把「含中文的 .ps1 必须带 UTF-8 BOM」从口头纪律变成会红的单测）

> 门禁基线：**verify:local 259 项，实跑 259/259 全绿**（快照 `tools/ops/.verify-local-last.json`）。本版**不改项数**（只动脚本编码、测试与文档，未碰服务端契约与前端产物）。
> 单测 **52 套件 1019 例**（新增 `tests/ps1-encoding-guard.test.js`，6 例：扫描覆盖下限 / 含中文的脚本必须带 BOM / 正文无重复 U+FEFF / 内容是合法 UTF-8 / 关键运维脚本仍在扫描范围 / GUI 启动 bat 的兜底仍在）。
> 线上指纹 **37 项**（本版不改动指纹覆盖点）。

### 修复
- **`ops-verify-pg.ps1` 与 `gui-dev-console.ps1` 被存成了 UTF-8 无 BOM**：Windows PowerShell 5.1 对无 BOM 文件按系统 ANSI(GBK) 解码，中文字节被误解码后会把后面的引号一起吞掉 —— 两个脚本都在前一百多行就「字符串缺少终止符」直接解析失败（`[Parser]::ParseFile` 复现，即 PS 执行脚本文件时的同一条编码判定）。后果不是断言失败，而是**脚本根本没跑**：`npm run verify:pg` 的「生产等价演练」环节整个消失（单测全绿、毫无征兆）；GUI 开发控制台则是一直靠 `EuriskoTax-Console.bat` 里的 BOM 自检每次启动补字节才没炸。两处补 BOM 后解析通过

### 新增
- **`tests/ps1-encoding-guard.test.js` 脚本编码守卫**（随 `npm test` 跑）：扫描仓库内所有 `.ps1`（排除 `node_modules` / `.git`），含非 ASCII 却无 BOM、正文出现重复 `U+FEFF`、或内容不是合法 UTF-8，都会红灯并**直接点名文件**
  - 断言非恒真：已反向验证 —— 临时放入一个「含中文无 BOM」的脚本，测试立刻红灯点名该文件；移除后转绿
  - 带扫描覆盖下限（脚本数 / 含中文脚本数 / 带 BOM 数），防「路径写错导致空跑全绿」；关键运维脚本名单（`ops-publish` / `ops-verify-pg` / `ops-check-prod` / `ops-start-dev` / `gui-dev-console`）改名或挪目录同样会红

### 变更
- `docs/development/file-management-policy.md`：§4.3 补记 v1.37.0 的两次复发（`ops-verify-pg.ps1` 真炸、`gui-dev-console.ps1` 被 bat 兜底），§4.4 明确这条纪律已由单测强制，不再依赖「记得手动 ParseFile」
- `docs/guides/development-workflow.md` §5 排障行指向新守护测试

### 这一版钉住的口径（一条）
- **兜底不算防线**：启动 bat 的 BOM 自检让一个本该打不开的脚本一直能用，于是没人去修根因。凡是有兜底的地方，都要补一条会红的检查 —— 否则「能用」会把「已经坏了」长期伪装成正常

---

## [1.37.0] - 2026-09-15（阶段16 收尾：速算器「保存 + 导出」补齐 —— 形态差异不再是卖点，「深度测算」组名退休）

> 门禁基线：**verify:local 259 项，实跑 259/259 全绿**（快照 `tools/ops/.verify-local-last.json`）。本版**不改项数**（纯前端能力下放，未动服务端契约）。
> 单测 **52 套件 1019 例**（新增 `tests/quick-report.test.js` 11 项：文件名 / 输入回显 / 文档编排 / 条件字段 / 转义 / 政策时效 / 导出入口；`tests/tool-registry.test.js` +1 项：组名不再叫「深度测算」且不再拿保存导出当卖点；`tests/toolbox-ui.test.js` +2 项：导出按钮接线、组件缺失时不假成功）。
> 线上指纹 **37 项**（本版不改动指纹覆盖点）。

### 新增
- **速算器结果导出 PDF**（新模块 `src/js/export/quick-report.js`）：20 个速算器算完都能带走一份 —— 主结果 + 结果拆解 + 测算输入 + 易错口径 + 政策时效 + 免责声明
  - 输入回显要说人话：select 回显**选项文字**（「单独计税」），不是内部值（`separate`）
  - 条件字段未生效时不进报告：小规模没有进项，报告里就不问进项
  - 政策时效只问 `tax-registry`，拿不到就整行不写（宁缺毋滥，不编日期）
- 结果页「下一步」新增「导出 PDF」按钮，与「保存到历史」并列

### 变更
- **「深度测算」组名退休 → 改叫「完整测算」**：保存历史（v1.36.0）与导出 PDF（本版）都已下放到速算器，「可保存 / 可导出」不再属于某一种实现形态；组名里也不该有「深度」—— 那是按实现起的名字，用户心里没有「深度」这回事。剩下的差别只有**填多填少**（按年填全、出完整预算表）
- 导出管线不复制：速算器导出复用既有 `Capture.captureHtml` + `navigation-ui.exportToPDF`（新增 `skipResultCheck` 选项跳过深度流程的「请先计算」守卫），**没有**第二份 A4 分页排版
- 工具页组说明、关于本站、CSS 注释同步改名

### 这一版钉住的口径（两条）
- **能力不按实现形态分配**：能存、能导出是所有工具的底线，不该是「多步骤流程」的专利
- **分组名按任务起，不按实现起**：「深度 / 多步骤 / 向导」都是我们内部的话，用户只关心「要填多少、最后出什么」

---

## [1.36.0] - 2026-09-15（阶段16：统一入口信息架构 —— 24 个入口一套分类，14 个「网页版」全部 App 内置）

> 门禁基线：**verify:local 259 项，实跑 259/259 全绿**（快照 `tools/ops/.verify-local-last.json`）。本版**不改项数**：分享落地 CTA 的两条静态断言只是跟着锚点改名（`#home-start-card` → `#home-scenarios`），仍是 259 项。
> 单测 **50 套件 995 例**（`tests/tool-registry.test.js` 新增 3 项：24 个入口全内置 / nextTools 不失效 / 完整测算组不混进场景组；`tests/toolbox-ui.test.js` 新增 8 项：场景卡与按身份筛选、结果页下一步、保存历史、Tab 栏只在顶层页；`tests/tax-assistant.test.js` 新增 2 项：快捷功能「全部工具」直达工具页 / 分类标签从 QA 数据推导）。
> 线上指纹 **37 项**（本版不改动指纹覆盖点）。

### 新增
- **新页工具页 `#tools-page`**：24 个入口只按「人 / 场景」分一套类 —— 工资与到手 / 一次性收入 / 税优与养老 / 社保与用工 / 企业与经营，最后一组「深度测算」
- **首页重排**：搜索入口（第一元素）→ 我是谁（5 张身份卡：上班族 / 自由职业 / 个体户 / 企业财务 / HR）→ 最近使用 → 最近计算 → 提醒 / 贴士
- **底部 Tab 栏**（首页 / 工具 / 助手 / 我的）：只在顶层页出现，计算页不显示（计算页有自己的预览条，两层底栏会打架）
- **结果页「下一步」**：相关工具 2–3 个（读 `nextTools`）+「保存到历史」（写入 `taxCalculationHistory`，与深度流程同源）
- **14 个工具由「网页版」转为 App 内置**（全部转为 `status:'native'`，全站 24 个入口再无跳站）：专项附加扣除 / 年度汇算 / 劳务报酬预扣 / 股权激励 / 离职补偿 / 提前退休 / 外籍津补贴 / 个人养老金 / 税优健康险 / 企业年金 / 用工成本 / 残保金 / 附加税印花税 / 个体户经营所得
- **速算器结果可进历史**：`home-ui` 类型映射新增 `quick`，速算器保存的结果出现在首页「最近计算」
- **税助手接上工具页**：快捷功能新增「全部工具」（直达工具页）；「年终奖测算」改为直开一屏速算器，不再把人推进多步骤向导；分类标签改为**从 QA 数据推导**（写死 list ∪ 数据里的 category），运营加新分类不用再改代码

### 变更
- 分享落地首屏锚点 `#home-start-card` → `#home-scenarios`（原「开始计算」卡片已移入工具页）
- 角标术语收敛：删掉 `App 内可算` / `网页版` 两个内部术语角标（`Quick` / `Deep` badge），深度组改用人话说明「多步骤填全 · 可保存历史 / 导出 PDF」
- 4 张深度 mode card 从首页移入工具页末尾（老入口不丢，只是换了个位置）

### 这一版钉住的口径（三条）
- **形态差异不该是一级分类**：「深度测算」独立成组排在最后，**不**打散进各场景组 —— 否则「工资与到手」里会出现「综合所得」和「月薪个税」两个都算工资的入口，用户更懵
- **结果不是终点**：每个结果都要给出去处（相关工具 + 保存）。这也是深度流程原本独有的能力第一次下放到速算器，两种形态开始收敛
- **≥20 个工具时搜索是主入口**：搜索放首页第一元素，分类只是兜底；分类 5±2 组、每组 ≤8 项

---

## [1.35.0] - 2026-09-15（阶段15 15A-5 尾巴收尾：第十九、二十个落地页「税优健康险 + 企业年金」，阶段15 落地页矩阵全部关闭）

> 门禁基线：**verify:local 259 项，实跑 259/259 全绿**（快照 `tools/ops/.verify-local-last.json`）。本版新增 8 项断言（每页 4 项：可访问与结构化数据 + 静态税率表逐档对账 + 规则表与示例表 + 易错口径与来源白名单；年金页静态表对账含年度 + 月度两张表）+ 1 项目录断言由 18 页更新为 20 页；项数 251 → 259，以实跑为准。
> 单测 **50 套件 993 例**（新增 `tests/health-insurance-quick.test.js` 18 例 + `tests/annuity-quick.test.js` 19 例）。
> 线上指纹 **37 项**（本版不改动指纹覆盖点）。

### 新增
- **新页 `/seo/health-insurance.html`** + `health-insurance-quick.js`：税优健康险节税速算（保费 2400 元/年内据实扣除、理赔免税）
- **新页 `/seo/enterprise-annuity.html`** + `annuity-quick.js`：企业年金三环节速算（个人 4% 当期扣除、单位 8% 递延、按月领取用月度税率表）
- 常量 `healthInsuranceRules`（2400 元/年 / 200 元/月、赔款免征个税）+ `annuityRules`（4% / 8% / 12%、社平 300% 封顶、领取全额单独计税）
- 注册表新增 2 条（`health-insurance` / `enterprise-annuity`）；线索来源新增 `seo_health_insurance` / `seo_annuity`；sitemap 收录；工具总目录第 19、20 张卡片；App 页脚入口 15 → 20 个
- 年金页静态表两张（年度税率表 + 月度税率表）均与常量逐档对账 —— 领取环节用的月度表是本页独有的第二张守护表

### 这一版钉住的口径（六条）
- **税优健康险没有领取税**：保险赔款依个税法第四条免征个人所得税 —— 与个人养老金「领取按 3%」是两套完全不同的机制，页面必须对照写清
- **节税上限 2400 × 45% = 1080 元/年**：10% 档每年只省 240 元 —— 节税本身**不足以成为购买一款保险产品的理由**，页面必须把这条写出来（只讲优点的税优页面不可信）
- **个人年金免税上限是「计税基数 × 4%」**，且计税基数按当地社平 **300% 封顶**：个人缴 6% 时超出 4% 的部分照常税后扣缴（钱照常进账户，只是没免税）
- **领取按「全额」单独计税**：本金 + 单位缴费 + 收益一起算，按月领取用月度税率表（与年终奖月度换算表同一张）、按年领取用综合所得税率表；不并入综合所得、不参与汇算
- **3% 档净优惠可能为负**：示例第四行（基数 1 万、缴 1 年、月领 1000）少交 144 元、领取交 420 元、净 **−276 元** —— 但单位缴费扣税后仍归你，参加依然划算，两面都要讲
- **单位缴费 8% 封顶递延**：单位缴 15% 也只按 8% 计入税优递延口径（单位 + 个人合计 ≤ 12%）

---

## [1.34.0] - 2026-09-15（阶段15 15B-6：第十八个落地页「残保金与工会经费」—— 30 人免征，31 人按全部人数算）

> 门禁基线：**verify:local 251 项，实跑 251/251 全绿**（快照 `tools/ops/.verify-local-last.json`）。本版新增 6 项断言：页面可访问与结构化数据 1 项 + 人数临界表 1 项 + 招残疾人表 1 项 + 工资封顶表 1 项 + 工会经费表 1 项 + 四条易错口径与来源白名单 1 项；项数 245 → 251，以实跑为准。
> 单测 **46 套件 928 例**（新增 `tests/disability-fund-quick.test.js` 20 例）。
> 线上指纹 **37 项**（本版不改动指纹覆盖点）。

### 新增
- **新页 `/seo/disability-fund.html`** + `disability-fund-quick.js`：残保金（差额人数 × 年平均工资）三个速算器 + 工会经费（工资总额 × 2%）
- 常量 `disabilityFundRules`（安排比例 1.5%、年平均工资按社平 **2 倍** 封顶、分档 90%/50%、**30 人（含）以下免征**）+ `unionFeeRules`（2% 拨缴、40% 上缴 60% 留存、企税扣除限额 2%）
- 注册表新增 3 条（`disability-fund` / `disability-fund-preferential` / `union-fee`）与**新分类 `fee`「用工规费」**—— 不是税，是跟着用工走的规费
- 四张静态表：人数临界表、招残疾人边际表、工资封顶表、工会经费表
- 线索来源新增 `seo_disabilityfund`；sitemap 收录；工具总目录第 18 张卡片

### 这一版钉住的口径（四条）
- **残保金不是「工资总额 × 1.5%」**，是「差额人数 × 年平均工资」：100 人、年平均 12 万、未安排残疾人 → 应安排 1.5 人 × 120000 = 180000 元，按 90% 征收实缴 **162000 元**。招残疾人省的是「一个人的年平均工资」，不是省工资总额的 1.5%
- **30 人是临界点**：30 人（含）以下暂免为 0 元；31 人按**全部 31 人**算（不是只对超出的 1 人算）→ 差额 0.465 人 × 10 万 × 90% = **41850 元**。差额人数保留小数 —— 先四舍五入成 0.47 再乘工资会凭空多算 500 元
- **年平均工资封顶社平 2 倍**（社平 8000 → 年 192000），**不是社保那个 300%**：年平均 30 万的公司实缴停在 259200 元，误按实际工资或不封顶会算成 405000 元
- **第一个残疾人最值钱，边际递减**：162000 → 30000（第 1 个省 **132000**，差额人数少 1 人且档位从 90% 跳到 50%），第 2 个只再省 30000，第 3 个一分不省
- **工会经费按工资总额 2%**（含奖金津贴、无上下限），**不是社保缴费基数**（60% 保底 / 300% 封顶在此都不适用）：月薪 5 万按 1000 元/月，不是按社保封顶基数算的 480 元；企税扣除限额同为 2%，超提部分不得扣除

---

## [1.33.0] - 2026-09-15（阶段15 15B-5：第十七个落地页「个体工商户经营所得：核定 vs 查账」—— 核定不等于少交税）

> 门禁基线：**verify:local 245 项，实跑 245/245 全绿**（快照 `tools/ops/.verify-local-last.json`）。本版新增 6 项断言：页面可访问与结构化数据 1 项 + 静态对比表 2 项（无/有综合所得）+ 临界速查表 1 项 + 减半表 1 项 + 四条易错口径与来源白名单 1 项；项数 239 → 245，以实跑为准。
> 单测 **45 套件 908 例**（新增 `tests/business-income-quick.test.js` 22 例）。
> 线上指纹 **37 项**（本版不改动指纹覆盖点）。

### 新增
- **新页 `/seo/business-income.html`** + `business-income-quick.js`：核定与查账并排速算，并直接给出**临界净利率**与临界利润
- 常量 `businessIncomeRules`：≤200 万减半（至 2027-12-31）、业主本人费用扣除 6 万元/年、核定应税所得率行业参考幅度（3%~30%）
- 注册表新增 3 条：`business-income`、`business-income-halve`、`business-income-assessed`（政策依据文号与到期状态由注册表维护，页面不自己写文号）
- 三张静态表：净利率对比表 ×2（无/有综合所得）、临界净利率速查表、减半效果表
- 线索来源新增 `seo_bizincome`；sitemap 收录；工具总目录第 17 张卡片

### 这一版钉住的口径（四条）
- **核定不等于少交税**：核定税额是**一条与利润无关的水平线**（收入 × 应税所得率），成本再大一分不变 —— 年营收 60 万、核定所得率 10% 时恒为 2250 元；而查账税额从 0 随利润爬升。两条线相交处才是分水岭
- **临界净利率 = 核定应税所得率 + 6 万元 ÷ 年营业收入**：60 万 / 10% → **20%**（净利率 15% 时查账反而省 1500 元；30% 时核定才省 4500 元）；120 万 → 15%；30 万 / 15% → 高达 35%。**若本人另有工资**（6 万已扣在工资侧），临界直接降回核定所得率本身（10%），与营收无关
- **核定征收的「三不」**：不扣成本费用、不扣业主 6 万费用与专项附加、核定期间亏损不得结转弥补
- **减半只减「不超过 200 万那部分」的税额**：减免额在 200 万处封顶为 **317250 元**，300 万实际省 32.2%、500 万只省 18.8%；核定与查账**都能**享受（财政部 税务总局公告 2023 年第 12 号，至 2027-12-31）。另：经营所得用的是自己的**五级表**（5%~35%，速算扣除 0/1500/10500/40500/65500），不是工资那张七级表

---

## [1.32.0] - 2026-09-15（阶段15 15C-3：第十六个落地页「企业用工成本」—— 用工成本倍数不是常数）

> 门禁基线：**verify:local 239 项，实跑 239/239 全绿**（快照 `tools/ops/.verify-local-last.json`）。本版新增 6 项断言：页面可访问与结构化数据 1 项 + 静态成本表 1 项 + 涨薪表 1 项 + 倒推表 1 项 + 三条易错口径 1 项 + 同源脚本与线索来源白名单 1 项；项数 233 → 239，以实跑为准。
> 单测 **44 套件 886 例**（新增 `tests/employer-cost-quick.test.js` 24 例）。
> 线上指纹 **37 项**（本版不改动指纹覆盖点）。

### 新增
- **新页 `/seo/employer-cost.html`** + `employer-cost-quick.js`（复用 `social-insurance-quick.js`，不复制费率）：三个速算器 —— 正算（税前工资 → 企业用工成本）、按人均预算倒推可开工资（二分求解）、涨薪成本与传递率
- 三张静态对照表：工资档位 → 用工成本（3000~50000）、涨薪 1000 元的企业成本与员工到手、人均预算 → 可开工资
- 人数维度：人均成本 × 人数 → 团队月/年成本
- 线索来源白名单新增 `seo_employercost`；sitemap 收录；工具总目录新增第 16 张卡片（断言同步 15 → 16）

### 变更
- 门禁新增 6 条断言，其中一条专门钉住**线索来源必须进白名单** —— 没进白名单的 `source` 会被 Lead 接口静默回落成 `unknown`，页面上看有归因参数、后台却分不清线索来自哪一页，这种错只在看数据时才会被发现

### 这一版钉住的口径（三条）
- **成本倍数不是常数：工资越低倍数越高**。单位与个人共用同一套缴费基数（60% 保底 / 300% 封顶），社平 8000 元时工资 3000 元也要按 4800 元缴，单位部分 1896 元一分不少 → 成本 4896 元、**倍数 1.63**；工资 10000 元 **1.395**；工资 50000 元因封顶只有 **1.19**。所以「按 1.4 倍估用工成本」在两端都会算错，低工资那端错得更狠
- **涨薪 1000 元 ≠ 企业多花 1000 元，员工更拿不到 1000 元**。未封顶时企业每月多付 1395 元（工资 1000 + 单位五险一金 395），全年多付 16740 元，员工全年到手只多 8370~9021 元 —— **传递率约 50%~54%**；已封顶后单位部分不再增加，企业每月只多付 1000 元，**传递率反而升到 70%~80%**（给高薪员工涨薪更"值"）
- **公积金是双边的，且本页只算法定五险一金**。谈「12% 公积金」意味着单位再出同比例的一份；本页不含招聘培训、补充公积金、商业保险、职工福利、工会经费、残保金等，真实用工成本通常更高

---

## [1.31.0] - 2026-09-15（阶段15 入口补齐：15 个落地页此前彼此是孤岛，App 里一个入口都没有）

> 门禁基线：**verify:local 233 项，实跑 233/233 全绿**（快照 `tools/ops/.verify-local-last.json`）。本版新增 3 项断言：落地页必须能回到总目录 1 项 + 总目录列出 15 个工具 1 项 + App 首页有总目录入口 1 项；项数 230 → 233，以实跑为准。
> 单测 **43 套件 862 例**（本版不改计算口径，未新增用例）。
> 线上指纹 **37 项**（本版不改动指纹覆盖点）。

### 新增
- **工具总目录 `/seo/index.html`**：15 个落地页按「工资个税与到手 / 离职劳务与特殊收入 / 企业与经营 / 社保公积金」分组列在一屏，卡片即入口；同时带 `ItemList` 结构化数据（15 项 URL），相当于给爬虫一张 HTML 版 sitemap
- **App 底部新增落地页入口**：`index.html` 页脚加「更多测算工具：年终奖 / 社保公积金 / 增值税…（15 个）→」，带 `?source=app_footer` 归因 —— 这是 App 内**唯一**通往 15 个落地页的路径，此前完全没有
- 15 个落地页页脚统一加「全部测算工具」链接，站内路径从「每页只链 2~3 个手挑邻居」变成「任意页 → 总目录 → 任意页」
- `sitemap.xml` 收录 `/seo/index.html`（priority 0.9，作为目录页）

### 变更
- 门禁新增 3 条**防回退**断言：① sitemap 内每个 `/seo/*.html` 必须链回总目录（否则判为孤岛并指名文件）；② 总目录卡片数必须等于 15 且 `numberOfItems` 一致；③ App 首页必须含总目录入口 —— 页面数还在涨，靠人肉记「新页面要加入口」迟早漏
- `seo/landing.css` 新增 `.tool-grid` / `.tool-card` / `.is-new` 三处卡片样式（追加在页脚段之前，不影响既有页面）

---

## [1.30.0] - 2026-09-15（阶段15 15C-2：第十五个落地页「税后工资 / 谈薪倒算」—— 倒算不能除以到手率）

> 门禁基线：**verify:local 230 项，实跑 230/230 全绿**（快照 `tools/ops/.verify-local-last.json`）。本版新增 5 项断言：页面可访问与政策依据 1 项 + 静态示例表数值 1 项 + 两口径对照表 1 项 + 三条易错口径 1 项 + 同源脚本与 CTA 归因 1 项；项数 225 → 230，以实跑为准。
> 单测 **43 套件 862 例**（新增 `tests/net-salary-quick.test.js` 19 例）。
> 线上指纹 **37 项**（本版不改动指纹覆盖点）。
> 规则读 `socialInsuranceRules`（常量）+ `comprehensiveTaxRates`，文号读注册表（`comprehensive` / `social-insurance` / `housing-fund`）。

### 新增
- **第十五个 SEO 落地页 `/seo/net-salary.html`（税后工资怎么倒推税前）**：瞄准「税后工资 计算器 / 到手 10000 税前多少 / 税前工资 反推 / 谈薪 倒算 / 加薪 到手 多多少」这一簇长尾词；页面带**两个**速算器
  - **谈薪倒算**：填期望每月到手 + 口径（全年平均 / 入职首月）+ 社平工资 + 公积金比例 + 专项附加扣除 → 需谈税前月薪（并给报价取整到百元）、个人五险一金、全年个税、月均与首月/12 月到手、到手率、企业月成本
  - **加薪试算**：填「税前再加多少」→ 加薪后税前、全年到手多多少、每月到手多多少、**边际到手率**
- **三条最容易踩的口径写进正文**：① 倒算**不能「除以到手率」** —— 到手率不是常数，甚至不单调（月到手 2 万时 73.7%，3 万时反而 75.3%，因为五险一金按社平 3 倍封顶后不再增加），只能二分逼近；② **涨薪 1000 元 ≠ 到手多 1000 元**（税前 13175 元附近加 1000 元，全年只多 8370 元 = 每月 697.5 元，边际到手率 69.75%；68077 元附近只多 7800 元 = 每月 650 元，65%）；③ 倒算**只对月薪负责**（年终奖另有单独计税口径），且想拿很低的到手时**保底会咬人**（目标月到手 3000 元 → 税前 4080 元，但社保按下限 4800 元缴 1080 元）
- 静态表：目标月到手 5000 / 10000 / 20000 / 30000 / 50000 的倒算对照表（税前、五险一金、全年个税、首月与 12 月到手、企业月成本、再加 1000 元全年多到手），以及同一句「月到手 X」在**两种口径**下的税前对照表（10000 → 13175.62 / 13062.86；30000 → 39853.33 / 36142.27，按首月口径定薪全年少拿 33554.16 元）

### 变更
- 新增 `src/js/calculation/net-salary-quick.js`（`solveOf` / `compareOf` / `marginalOf` / `monthlyNetAt`）：到手随税前单调不减，用二分法逼近到分（每次求解 80 次迭代）；五险一金与个税全部复用 `social-insurance-quick.js`，本文件不复制任何费率
- `sitemap.xml` 收录 `/seo/net-salary.html`；线索来源白名单新增 `seo_netsalary`；文档与运维脚本里的门禁项数 225 → 230

### 修复
- `net-salary-quick.js` 边际到手率的分母写错：全年多到手（8370）除以**单月**加薪（1000）得到 8.37 —— 应为全年新增税前（1000 × 12 = 12000），正确值 69.75%。页面 FAQ 与正文中随之出现的「83.7%」「78%」一并改为 69.75% / 65%

---

## [1.29.0] - 2026-09-15（阶段15 15C-1：第十四个落地页「社保公积金」—— 缴费基数不是工资，60% 保底 / 300% 封顶）

> 门禁基线：**verify:local 225 项，实跑 225/225 全绿**（快照 `tools/ops/.verify-local-last.json`）。本版新增 5 项断言：页面可访问与政策依据 1 项 + 静态费率表与常量逐项一致 1 项 + 静态示例表数值可读 1 项 + 三条易错口径 1 项 + 注册表登记与 CTA 归因 1 项；项数 220 → 225，以实跑为准。
> 单测 **42 套件 843 例**（新增 `tests/social-insurance-quick.test.js` 26 例）。
> 线上指纹 **37 项**（本版不改动指纹覆盖点）。
> 规则读 `socialInsuranceRules`（常量），文号读注册表（`social-insurance` / `housing-fund`，均长期有效）。

### 新增
- **第十四个 SEO 落地页 `/seo/social-base.html`（社保公积金怎么算）**：瞄准「社保缴费基数 怎么算 / 五险一金 比例 2026 / 社保 个人缴纳多少 / 到手工资 计算器 / 公积金 12% / 公积金 税前扣除 / 企业用工成本 测算」这一簇长尾词；页面带**三个**速算器
  - **五险一金**：填月工资 + 当地上年度月社平工资 + 公积金比例（单位医疗 / 工伤 / 生育费率可改）→ 缴费基数（是否触保底 / 封顶）、个人五项与单位五项、公积金、个人扣缴占工资比
  - **到手工资**：加专项附加扣除与公积金缴存基数 → 1 月 / 6 月 / 12 月到手、全年个税与到手、到手占工资比，并给出**逐月到手明细**（累计预扣档位爬升可见）
  - **企业用工成本**：加人数 → 企业月成本 / 人、月与年成本合计、成本 / 工资倍数、员工全年到手占企业成本比
- **三条最容易踩的口径写进正文**：① 缴费基数**不是工资**，按本人上年度月平均工资，但低于社平 60% 保底、高于 300% 封顶（社平 8000 时：工资 4000 按 4800 缴，工资 5 万只按 24000 缴 —— 与月薪 2.4 万缴得一样多）；② **工伤、生育个人不缴**（生育已并入职工医保），公积金则只有 **12% 且基数 ≤ 社平 3 倍**的部分免征个税，超出部分并回工资计税（按 10 万工资、12% 缴存测算，超标 9120 元/月，误按全额扣除全年会少算约 45024 元个税）；③ 到手工资**逐月变少是累计预扣**不是算错，企业用工成本是工资的 1.3~1.4 倍（月薪 1 万、公积金 12% 时企业月成本约 13950 元，员工全年到手约占企业成本 55%）
- 静态表：五险一金费率表（养老 8%/16%、医疗 2%/9.8%、失业 0.5%/0.5%、工伤与生育个人不缴、公积金 5%~12%）、月薪 4000 / 10000 / 20000 / 50000 四档示例表（基数、个人五险一金、首月与 12 月到手、全年个税、企业月成本）
- 注册表新增两条：`social-insurance`（社会保险法主席令第 35 号 + 国办发〔2019〕13 号，2011-07-01 起）、`housing-fund`（住房公积金管理条例国务院令第 262 号 2019 年修订 + 财税〔2006〕10 号免税口径）

### 变更
- 新增 `src/js/calculation/social-insurance-quick.js`（`baseOf` / `socialInsuranceOf` / `netSalaryOf` / `employerCostOf` / `scheduleOf`），费率与基数规则全部来自 `tax-constants.js` 的 `socialInsuranceRules`；到手工资走**累计预扣**，与 `salary-tax-quick.js` 和内核 `calculateCumulativePrepaidTax` 同口径（有对拍测试）
- `sitemap.xml` 收录 `/seo/social-base.html`；线索来源白名单新增 `seo_social`；文档与运维脚本里的门禁项数 220 → 225

### 修复
- `social-insurance-quick.js` 的比例解析：`Number('') === 0` 是有限数，空值会先被当成 0% —— 单位费率未填时算出「单位社保 0 元」。改为先判空再转换（未填退回默认费率）
- 缴费基数保底逻辑：工资未填（0）时不再按下限算出「五险一金 1080 元」—— 保底只对有工资的人有意义

---

## [1.28.0] - 2026-09-15（阶段15 15B-3：第十三个落地页「附加税与印花税」—— 附加跟增值税走，印花税看凭证）

> 门禁基线：**verify:local 220 项，实跑 220/220 全绿**（快照 `tools/ops/.verify-local-last.json`）。本版新增 5 项断言：页面可访问与政策依据 1 项 + 附加税静态税率表 7/5/1/3/2 与常量一致 1 项 + 印花税 17 个税目与常量逐行一致 1 项 + 三条易错口径 1 项 + 注册表登记与 CTA 归因 1 项；项数 215 → 220，以实跑为准。
> 单测 **41 套件 817 例**（新增 `tests/surtax-stamp-quick.test.js` 24 例）。
> 线上指纹 **37 项**（本版不改动指纹覆盖点）。
> 规则读 `surtaxRules` / `stampDutyRules`（常量），文号读注册表（`surtax` / `stamp-duty` 长期有效 + `surtax-stamp-halve` 减半至 2027-12-31）。

### 新增
- **第十三个 SEO 落地页 `/seo/surtax-stamp-duty.html`（城建税及附加、印花税怎么算）**：瞄准「城建税 怎么算 / 教育费附加 3% / 地方教育附加 2% / 附加税 12% / 印花税 怎么算 / 印花税 税率表 / 买卖合同 万分之三 / 租赁合同 千分之一 / 营业账簿 万分之二点五 / 六税两费 减半」这一簇长尾词；页面带**三个**速算器
  - **附加税**：填本期实际缴纳的增值税（+ 消费税）、纳税人所在地、是否享受六税两费减半 → 城建税 + 教育费附加 3% + 地方教育附加 2% 与合计，并给三档所在地对照（市区 12% / 县城 10% / 其他 6%，减半后 6% / 5% / 3%）
  - **印花税（单张凭证）**：选税目 + 填凭证所列金额 + 其中单独列明的增值税额 + 是否减半，输出计税依据、应纳税额，并对照「若未列明增值税」的全额口径
  - **多凭证合计**：买卖 / 租赁 / 借款 / 营业账簿增加额四类分别按各自税目计税后加总，并提示税率最高项（对应「未分别列明金额则从高适用税率」）
- **三条最容易踩的口径写进正文**：① 附加税计税依据是**实际缴纳的增值税、消费税**，不是收入（增值税免了附加跟着免，填 0 结果就是 0）；② 印花税按**每张应税凭证**的税目计税，计税依据**不包括列明的增值税税款**（同一份合同写与不写差一笔钱），混载未分别列明的**从高**适用税率；③ 营业账簿只对**增加部分**计税，不是每年按注册资本总额重贴
- 静态表：附加税税率表（7% / 5% / 1% + 3% + 2%）、印花税税目税率表（17 个税目全量）、本期缴 1 万增值税的附加税示例表、常见凭证印花税示例表
- 注册表新增三条：`surtax`（城建税法主席令第 51 号 + 国务院令第 60 号 + 财综〔2010〕98 号，2021-09-01 起）、`stamp-duty`（印花税法主席令第 89 号，2022-07-01 起，长期有效）、`surtax-stamp-halve`（六税两费减半：财政部 税务总局公告 2023 年第 12 号，执行至 **2027-12-31**）

### 变更
- 新增 `src/js/calculation/surtax-stamp-quick.js`（`surtaxOf` / `stampDutyOf` / `stampDutySumOf` / `rateText`），规则与税率全部来自 `tax-constants.js` 的 `surtaxRules` / `stampDutyRules`
- `sitemap.xml` 收录 `/seo/surtax-stamp-duty.html`；线索来源白名单新增 `seo_surtax`；文档与运维脚本里的门禁项数 215 → 220

---

## [1.27.0] - 2026-09-15（阶段15 15B-2：第十二个落地页「企业所得税」—— 5% 是乘出来的，300 万是悬崖）

> 门禁基线：**verify:local 215 项，实跑 215/215 全绿**（快照 `tools/ops/.verify-local-last.json`）。本版新增 5 项断言：页面可访问与政策依据 1 项 + 静态税率表 25/20/15/20 与常量逐档一致 1 项 + 静态示例表可读 1 项 + 三条易错口径（5% 是乘出来的 / 300 万是悬崖 / 分红再交 20%）1 项 + 注册表登记与 CTA 归因 1 项；项数 210 → 215，以实跑为准。
> 单测 **40 套件 793 例**（新增 `tests/corporate-income-tax-quick.test.js` 27 例）。
> 线上指纹 **37 项**（本版不改动指纹覆盖点）。
> 规则读 `corporateIncomeTaxRules`（常量），文号读注册表（`corporate-income-tax` 税法本体长期有效 + `corporate-small-low-profit` 小微优惠至 2027-12-31）。

### 新增
- **第十二个 SEO 落地页 `/seo/corporate-income-tax.html`（企业所得税怎么算）**：瞄准「企业所得税 怎么算 / 25% 税率 / 小型微利企业 5% 实际税负 / 高新技术企业 15% / 小微企业 300 万 300 人 5000 万 / 公司分红还要交个税吗 / 业务招待费 扣除限额」这一簇长尾词；页面带**三个**速算器
  - **企业所得税**：填应纳税所得额 + 从业人数 + 资产总额 + 企业类型 + 是否限制禁止行业，自动判定是否满足小型微利条件并输出适用税率、实际税负率、法定 25% 对照与优惠省下金额；给「距离 300 万门槛还有多少」与**踩过门槛多缴多少**的临界点提示
  - **税后利润分红到手**：利润 → 企业所得税 → 税后利润 → 分红个税 20% → 股东到手，并给出小微 / 高新 / 一般三档对照与综合税负率（一般企业 100 万利润到手 60 万、综合 40%）
  - **常见扣除限额**：业务招待费（发生额 60% 与收入 5‰ **孰低**）、广宣费（收入 15%，超出**结转以后年度**）、公益性捐赠（利润总额 12%，超出**结转三年**），输出当期调增额与调增后利润
- **两条最容易踩的口径写进正文**：① 小微实际税负 5% 是**乘出来的** —— 「减按 25% 计入应纳税所得额」再乘 20% 税率（0.25 × 0.20 = 0.05），动的政策变量是**计入比例**不是税率；② 300 万 / 300 人 / 5000 万三个门槛是「**且**」的关系且是**临界点不是累进** —— 任一超标即全额按 25%（示例表：300 万交 15 万，301 万交 75.25 万，**多 1 万元利润多缴 60.25 万元税**）
- 静态表：税率表（25% / 20% 小微 / 15% 高新 / 20% 非居民预提）、小微三门槛表、三类扣除限额表
- 注册表新增两条：`corporate-income-tax`（企业所得税法主席令第 63 号 + 实施条例国务院令第 512 号，长期有效）与 `corporate-small-low-profit`（小微优惠：财政部 税务总局公告 2023 年第 12 号 + 财税〔2019〕13 号，执行至 **2027-12-31**）

### 变更
- 新增 `src/js/calculation/corporate-income-tax-quick.js`（`enterpriseOf` / `dividendOf` / `deductionLimitOf`），规则与税率全部来自 `tax-constants.js#corporateIncomeTaxRules`
- `sitemap.xml` 收录 `/seo/corporate-income-tax.html`；线索来源白名单新增 `seo_cit`；文档与运维脚本里的门禁项数 210 → 215

---

## [1.26.0] - 2026-09-15（阶段15 15B-1：第十一个落地页「增值税」—— 企业税种开局，价外税先分离）

> 门禁基线：**verify:local 210 项，实跑 210/210 全绿**（快照 `tools/ops/.verify-local-last.json`）。本版新增 5 项断言：页面可访问与政策依据 1 项 + 静态税率表 13/9/6/0 与常量逐档一致 1 项 + 静态示例表可读 1 项 + 三条易错口径（价外税 / 30 万含本数与全额计税 / 进项留抵）1 项 + 注册表登记与 CTA 归因 1 项；项数 205 → 210，以实跑为准。
> 单测 **39 套件 766 例**（新增 `tests/vat-quick.test.js` 27 例）。
> 线上指纹 **37 项**（本版不改动指纹覆盖点）。
> 这是第一个**企业税种**页：与个税不同源，规则读 `vatRules`（税率档与优惠参数），文号读注册表（增值税法本体 + 小规模减免两条）。

### 新增
- **第十一个 SEO 落地页 `/seo/vat.html`（增值税怎么算）**：瞄准「增值税 怎么算 / 小规模纳税人 1% / 一般纳税人 销项 进项 / 含税价 不含税价 换算 / 小规模 30 万 免征」这一簇长尾词；页面带**三个**速算器
  - **小规模纳税人**：按不含税销售额 × 征收率（法定 3%，现行优惠**减按 1%**），可选按月（10 万）/ 按季（30 万）免征额度，可填「其中开具专票的不含税金额」—— 免征只覆盖普票部分，**专票不免税**；同时给出法定 3% 对照与「减按 1% 省了多少」
  - **一般纳税人**：应纳税额 = **销项税额 − 进项税额**，含税/不含税输入自动价税分离，进项大于销项时按 0 元列示并提示**留抵下期**（不是多缴、也不是欠税），附简易计税（3%、不得抵扣进项）对照与实际税负率
  - **价税分离**：含税价 ⇄ 不含税价双向换算，并直接点出「含税价 × 税率」的**多算差额**（含税 113000 @13%：正确 13000，天真算法 14690，多算 1690）
- **两条最容易踩的口径写进正文**：① 增值税是**价外税**，含税价必须先分离；② 小规模 30 万是**临界点不是起征点** —— 按**全部**销售额判断、**含本数**、超过即**全额**计税（示例表第 2、3 行只差一分钱，税额从 0 变约 3000 元）；③ 进项不是想抵就抵，抵不完的留抵下期、不倒欠
- 静态税率表：一般纳税人 13% / 9% / 6% / 0%（附适用范围），小规模征收率 3%（法定）/ 1%（现行优惠，至 2027-12-31）/ 0（月 10 万、季 30 万以下免征）
- 注册表新增两条：`vat`（增值税法本体，2026-01-01 起施行、长期有效）与 `vat-small-scale`（小规模减免，执行至 **2027-12-31**）—— 到期倒计时由 `statusOf` 给出，页面不自己算日期

### 变更
- 新增 `src/js/calculation/vat-quick.js`（`smallScaleOf` / `generalOf` / `priceSplitOf`），规则与税率全部来自 `tax-constants.js#vatRules`，页面不维护第二份口径
- `sitemap.xml` 收录 `/seo/vat.html`；线索来源白名单新增 `seo_vat`；文档与运维脚本里的门禁项数 205 → 210

---

## [1.25.0] - 2026-09-15（阶段15 15A-8：汇算页增强「多处任职 / 年中跳槽」—— 把「档位重置」与「重复扣 6 万」两个机制分开）

> 门禁基线：**verify:local 205 项，实跑 205/205 全绿**（快照 `tools/ops/.verify-local-last.json`）。本版新增 3 项断言：多处任职段落与四种典型场景示例表可读 1 项 + 两条关键口径（档位重置 / 减除费用全年定额 6 万 / 专项附加同一项目只能扣一份）1 项 + 三条新增常见问题 1 项；项数 202 → 205，以实跑为准。
> 单测 **38 套件 739 例**（`tests/annual-settlement-quick.test.js` 新增 10 例：多段速算器 7 例 + 页面静态示例表/口径/FAQ 3 例）。
> 线上指纹 **37 项**（本版不改动指纹覆盖点）。
> 本版不动单单位汇算算法：新增的是「多段独立累计预扣 + 汇算合并」的口径，税率仍读 `comprehensiveTaxRates`（与 App 同一张表）。

### 新增
- **汇算页新增「多处任职 / 年中跳槽」深度段落**：瞄准「年中跳槽 汇算 为什么要补税 / 两家公司 工资 汇算 补税 / 多处任职 重复扣 6 万」这一簇长尾词；页面带**多段速算器**（最多两段：月工资 × 月数 + 三险一金 + 专项附加，可手填已预缴税额）—— 各段**独立**按累计预扣法预扣（新单位从 0 重新开始），汇算时合并、减除费用按**全年定额 60000 元**，输出全年应纳税额、自动预缴合计、应退/应补，以及两个差额来源拆分：重复减除的基本减除费用、重复申报的专项附加扣除
- **四种典型场景示例表**（静态正文，数字由常量驱动并由单测逐点对账）：年中跳槽（两段各 6 个月、月薪均 2 万 → 补 2520，原因是**档位重置**而非多扣 6 万）、多处任职并行（1.2 万 + 0.8 万 → 补 7512，重复扣 6 万 + 档位重置）、跳槽带空档（1-6 月 2 万、10-12 月 2.5 万 → 补 1020）、年中入职（7-12 月 1.5 万 → 退 810，汇算减满 6 万、预扣只减了 3 万）
- **三条口径纠偏**：① 无缝跳槽（月数合计 12）基本减除费用一份没多扣，**照样会补税**，补的是档位重置的差额；② 汇算减除费用是**全年定额 60000 元**，不按任职月数折算；③ 专项附加扣除**同一项目只能扣一份**，两处都申报的要补回来
- 常见问题新增「年中跳槽为什么补税 / 同时在两家公司领工资会重复扣 6 万吗 / 年中入职 6 万怎么算」三条，JSON-LD `FAQPage` 同步到 8 问并与正文 `summary` 逐条对账

### 变更
- `annual-settlement-quick.js` 新增 `multiJobSettlementOf(input)` 与常量 `ANNUAL_BASIC_DEDUCTION = 60000`，供页面与单测共用同一份口径
- 门禁新增 3 条断言（见上行基线说明）；文档与运维脚本里的门禁项数 202 → 205

---

## [1.24.0] - 2026-09-15（阶段15 15A-7：第十个 SEO 落地页「提前退休 / 内部退养一次性收入」—— 三套一次性收入口径分开）

> 门禁基线：**verify:local 202 项，实跑 202/202 全绿**（快照 `tools/ops/.verify-local-last.json`）。本版新增 5 项断言：提前退休/内部退养页可访问性与结构化数据 1 项 + 静态年度与月度税率表与常量逐档对账 1 项 + 静态示例表可读 1 项 + CTA 归因 1 项 + 注册表「三套口径必须分开」1 项；项数 197 → 202，以实跑为准。
> 单测 **38 套件 728 例**（新增 `tests/early-retirement-quick.test.js` 18 例）。
> 线上指纹 **37 项**（本版不改动指纹覆盖点）。
> 本版不动税额算法：新增的是一个独立测算页，税率仍读 `comprehensiveTaxRates` / `bonusMonthlyTaxRates`（与 App 同一张表）。

### 新增
- **第十个 SEO 落地页 `/seo/early-retirement.html`（提前退休 / 内部退养一次性收入）**：瞄准「提前退休 一次性补贴 个税 / 内部退养 一次性收入 怎么交税 / 内退补偿金 个税计算」这一簇长尾词；页面带两个速算器 —— 提前退休（一次性补贴 + 实际年度数，支持按月份自动 ÷ 12）与内部退养（一次性收入 + 所属月份数 + 当月工资薪金），并给出月均额、定档基数、适用税率与应交税额
- **三套口径对照表**：提前退休**真分摊**（先按年减 6 万、算完乘回年数、年度表）、内部退养**平均只为定档**（税基是「当月工资 + 一次性收入」全额、月度表、与当月工资合并定档）、离职补偿金**3 倍社平工资免税 + 超额不分摊**（另一页）—— 页面明确写出「3 倍社平免税只能用于解除劳动关系的一次性补偿，不能套到提前退休与内部退养」
- 提前退休与内部退养各三行示例表，数字由常量驱动，并由单测与门禁逐点对账；其中「同为 12 万，只因所属月份从 60 变 24，税额从 3630 变 11890」这一行专门用来说明「平均只为定档」
- 常量新增 `earlyRetirementRules`（分摊口径、年度/月度两张表与费用扣除标准），税种注册表新增 `early-retirement` 条目（政策文号：财税〔2018〕164 号第五条、国税发〔1999〕58 号第一条）

### 变更
- `sitemap.xml` 收录 `/seo/early-retirement.html`；`leadController.js` 的 `SOURCES` 白名单新增 `seo_earlyretire`
- 门禁新增 5 条断言（见上行基线说明），「sitemap 收录全部落地页」扩为含第十个页面；文档与运维脚本里的门禁项数 197 → 202（自动同步 + 手工同步一致）

---

## [1.23.0] - 2026-09-15（阶段15 15A-6：第九个 SEO 落地页「外籍个人津补贴免税」—— 与专项附加扣除二选一 + 政策到期提醒接入注册表）

> 门禁基线：**verify:local 197 项，实跑 197/197 全绿**（快照 `tools/ops/.verify-local-last.json`）。本版新增 5 项断言：外籍个人页可访问性与结构化数据 1 项 + 静态年度税率表与常量逐档对账 1 项 + 八项免税项目表与静态示例表可读 1 项 + CTA 归因 1 项 + 注册表「二选一 + 到期日 2027-12-31 + 2028 年起衔接」1 项；项数 192 → 197，以实跑为准。
> 单测 **37 套件 710 例**（新增 `tests/expat-allowance-quick.test.js` 17 例）。
> 线上指纹 **37 项**（本版不改动指纹覆盖点）。
> 本版不动税额算法：新增的是一个独立测算页，税率仍读 `comprehensiveTaxRates`（与 App 同一张表）。

### 新增
- **第九个 SEO 落地页 `/seo/expat-allowance.html`（外籍个人津补贴免税）**：瞄准「外籍个人 津补贴 免税 / 住房补贴 免税 个税 / 外籍个人 专项附加扣除 二选一 / 外籍个人免税政策 2027」这一簇长尾词；页面自带速算器（优惠前全年应纳税所得额 + 全年可免税津补贴 + 全年专项附加扣除 → 两条路径各少交多少税、更划算的一条、相差多少、优惠后应纳税所得额、政策到期倒计时）
- **二选一纠偏**：津补贴免税与专项附加扣除**不得同时享受**，且**一经选择在一个纳税年度内不得变更**；页面两条都算只是为了比较，并明确提示只能选其一
- **政策到期提醒接入注册表**：本政策执行至 **2027-12-31**（财政部 税务总局公告 2023 年第 29 号），到期状态与倒计时只读 `tax-registry.js#statusOf`，页面不自己算日期；正文写明 **2028 年起若未延续，应改为享受专项附加扣除**（前一版过渡口径就曾于 2021-12-31 结束、再由 2023 年第 29 号公告延续）
- 八项免税津补贴表（住房 / 伙食 / 搬迁 / 洗衣费须非现金形式或实报实销；出差补贴按合理标准；探亲费每年不超过 2 次；语言训练费、子女教育费须经税务机关审核批准）与年度税率表、三行示例表均为静态正文，数字由常量驱动，并由单测与门禁逐项对账
- 常量新增 `expatAllowanceRules`（八项项目与条件 + 二选一 + 年度内不得变更 + 到期日），税种注册表新增 `expat-allowance` 条目（政策文号：财政部 税务总局公告 2023 年第 29 号、财税字〔1994〕020 号、国税发〔1997〕54 号、财税〔2004〕29 号）

### 变更
- `sitemap.xml` 收录 `/seo/expat-allowance.html`；`leadController.js` 的 `SOURCES` 白名单新增 `seo_expat`
- 门禁新增 5 条断言（见上行基线说明），「sitemap 收录全部落地页」扩为含第九个页面；文档与运维脚本里的门禁项数 192 → 197（自动同步 + 手工同步一致）

---

## [1.22.0] - 2026-09-15（阶段15 15A-5：第八个 SEO 落地页「个人养老金」—— 每年 12000 税前扣除 + 领取按 3% 单独计税）

> 门禁基线：**verify:local 192 项，实跑 192/192 全绿**（快照 `tools/ops/.verify-local-last.json`）。本版新增 5 项断言：个人养老金页可访问性与结构化数据 1 项 + 静态年度税率表与常量逐档对账 1 项 + 三环节处理表与静态示例表可读 1 项 + CTA 归因 1 项 + 注册表条目与「不是所有人都划算」声明 1 项；项数 187 → 192，以实跑为准。
> 单测 **36 套件 693 例**（新增 `tests/private-pension-quick.test.js` 19 例）。
> 线上指纹 **37 项**（本版不改动指纹覆盖点）。
> 本版不动税额算法：新增的是一个独立测算页，税率仍读 `comprehensiveTaxRates`（与 App 同一张表）。

### 新增
- **第八个 SEO 落地页 `/seo/private-pension.html`（个人养老金）**：瞄准「个人养老金能抵多少税 / 个人养老金每年 12000 / 个人养老金领取税率 3% / 个人养老金划算吗」这一簇长尾词；页面自带速算器（年缴费额 + 缴费当年应纳税所得额 + 缴费年数 + 预计领取总额 → 每年可扣、适用税率、每年少交与累计少交、领取时 3%、净优惠、回本线、天真算法对照）
- 三环节税务处理表（缴费按 12000 元/年限额据实扣除 / 投资收益暂不征税 / 领取按全额 3% 单独计税）+ 年度税率表 + 四行示例表，数字由常量驱动，并由单测与门禁逐点对账
- **能算出「不划算」**：适用税率不高于 3% 的人缴费省 3%、领取时再交 3%，净优惠为 0 —— 页面直接给出「不划算，等于白锁流动性」的判断并给出回本线（领取额低于「累计少交的税 ÷ 3%」时净优惠仍为正）
- 常量新增 `privatePensionRules`（年限额 12000 + 领取 3% 单独计税 + 投资收益暂不征税），税种注册表新增 `private-pension` 条目（政策文号：财政部 税务总局公告 2024 年第 21 号、2022 年第 34 号）

### 变更
- `sitemap.xml` 收录 `/seo/private-pension.html`；`leadController.js` 的 `SOURCES` 白名单新增 `seo_pension`
- 门禁新增 5 条断言（见上行基线说明），「sitemap 收录全部落地页」扩为含第八个页面；文档与运维脚本里的门禁项数 187 → 192（自动同步 + 手工同步一致）

---

## [1.21.0] - 2026-09-15（阶段15 15A-4：第七个 SEO 落地页「专项附加扣除」—— 七项标准 + 年度确认 + 多抵多少试算）

> 门禁基线：**verify:local 187 项，实跑 187/187 全绿**（快照 `tools/ops/.verify-local-last.json`）。本版新增 5 项断言：专项附加扣除页可访问性与结构化数据 1 项 + 静态年度税率表与常量逐档对账 1 项 + 静态示例表与对照表可读 1 项 + CTA 归因 1 项 + 注册表条目与「扣的是应纳税所得额」口径声明 1 项；项数 182 → 187，以实跑为准。
> 单测 **35 套件 674 例**（新增 `tests/special-deduction-quick.test.js` 23 例）。
> 线上指纹 **37 项**（本版不改动指纹覆盖点）。
> 本版不动税额算法：新增的是一个独立测算页，税率仍读 `comprehensiveTaxRates`（与 App 同一张表）。

### 新增
- **第七个 SEO 落地页 `/seo/special-deduction.html`（专项附加扣除）**：瞄准「专项附加扣除标准 2026 / 专项附加扣除能少交多少税 / 子女教育扣除 2000 / 赡养老人 3000 / 住房租金扣除标准」这一簇长尾词；页面自带速算器（七项逐项填写 + 分摊比例 + 享受月数 + 扣除前全年应纳税所得额 → 全年扣除合计、折合每月、扣除前后应纳税额、全年少交的税、天真算法对照）
- 纠偏全网最常见的一处错误：**专项附加扣除扣的是「应纳税所得额」，不是直接减「税额」** —— 少交的税 = 扣除前应纳税额 − 扣除后应纳税额；扣除跨过档位分界点时「扣除额 × 税率」必然高估（示例：扣除 6 万、扣除前应纳税所得额 20 万，正确 11600 元，天真算法 12000 元，高估 400 元）
- 七项标准表（婴幼儿照护与子女教育各 2000 元/月、继续教育 400 元/月与 3600 元/年、大病医疗超 15000 元据实且限额 80000 元、房贷利息 1000 元/月、住房租金 1500 / 1100 / 800 元/月、赡养老人 3000 元/月）与年度税率表均为静态正文，数字由常量驱动，并由单测与门禁逐点对账
- 四条口径单列成节：住房贷款利息与住房租金**同一纳税年度只能二选一**；大病医疗**有起扣线、有上限、且只能在汇算清缴时扣**；每年 **12 月确认**次年信息（未确认只是暂停按月扣除，汇算可补扣，不会少扣税）；分摊比例**一个纳税年度内不得变更**（非独生子女赡养分摊每人不超过 1500 元/月）
- 常量新增 `specialDeductionRules`（七项标准 + 分摊与互斥 + 每年 12 月确认），税种注册表新增 `special-deduction` 条目（政策文号：国发〔2018〕41 号、国发〔2023〕13 号、《个人所得税法》第六条第四款）

### 变更
- `sitemap.xml` 收录 `/seo/special-deduction.html`；`leadController.js` 的 `SOURCES` 白名单新增 `seo_special`
- 门禁新增 5 条断言（见上行基线说明），「sitemap 收录全部落地页」扩为含第七个页面；文档与运维脚本里的门禁项数 182 → 187（自动同步 + 手工同步一致）

---

## [1.20.0] - 2026-09-14（阶段15 15A-3：第六个 SEO 落地页「离职补偿金个税」—— 3 倍社平工资免税额度 + 单独计税）

> 门禁基线：**verify:local 182 项，实跑 182/182 全绿**（快照 `tools/ops/.verify-local-last.json`）。本版新增 5 项断言：离职补偿金页可访问性与结构化数据 1 项 + 静态年度税率表与常量逐档对账 1 项 + 静态示例表与对照表可读 1 项 + CTA 归因 1 项 + 注册表条目与「不并入 / 不再按年限平均」口径声明 1 项；项数 177 → 182，以实跑为准。
> 单测 **34 套件 651 例**（新增 `tests/severance-quick.test.js` 19 例）。
> 线上指纹 **37 项**（本版不改动指纹覆盖点）。
> 本版不动税额算法：新增的是一个独立税种测算页，税率仍读 `comprehensiveTaxRates`（与 App 同一张表）。

### 新增
- **第六个 SEO 落地页 `/seo/severance.html`（离职补偿金个税）**：瞄准「离职补偿金个税 / 经济补偿金怎么交税 / 经济补偿金免税额度」这一簇长尾词；页面自带速算器（经济补偿金 + 其他一次性补助 + 当地上年职工年平均工资 + 工作年限 + 离职前月平均工资 + 全年其他综合所得 → 法定经济补偿上限、3 倍社平免税额度、实际可免税金额、应纳税所得额、单独计税应纳税额、到手金额与实际税负率、并入对照与差额）
- 把全网最容易写错的一处讲准：**现行政策是不并入当年综合所得、超额部分直接单独适用综合所得年度税率表，不再按工作年限平均** —— 国税发〔1999〕178 号「÷ 工作年限（≤12）平均为月工资」的做法自 2019 年起**不再执行**；页面单列一节并用反例说明照抄旧算法会低估税负（同样 13 万元：旧算法几乎不交税，现行口径 **10480 元**）
- 「12 年 / 3 倍」到底管什么单独成表：《劳动合同法》第四十七条封的是**经济补偿金本身**（月工资按当地上年度职工月平均工资 3 倍封顶、年限不超过 12 年），个税免税额度是**当地上年职工年平均工资 × 3**，两者不是一回事
- **免税额度只能抵「符合法定标准的补偿」**：超出法定经济补偿标准发放的部分，无论是否超过 3 倍社平工资都不得免税 —— 因此页面把「经济补偿金」与「其他一次性补助」拆成两个输入框，并用两个公开实务案例对拍（应纳税所得额 7 万 → 4480 元、13 万 → 10480 元），该两条数字同时被单测与门禁断言钉住
- 常量新增 `severanceRules`（3 倍社平免税 / 不减除费用 / 不并入 / 不按年限平均 / 12 年与 3 倍月工资封顶 / 长期政策无到期日），税种注册表新增 `severance` 条目（政策文号：财税〔2018〕164 号第五条第一项、财税〔2001〕157 号、《劳动合同法》第四十七条）

### 变更
- `sitemap.xml` 收录 `/seo/severance.html`；`leadController.js` 的 `SOURCES` 白名单新增 `seo_severance`
- 门禁新增 5 条断言（见上行基线说明），「sitemap 收录全部落地页」扩为含第六个页面；文档与运维脚本里的门禁项数 177 → 182（自动同步 + 手工同步一致）

---

## [1.19.0] - 2026-09-14（阶段15 15A-2：第五个 SEO 落地页「股权激励个税」—— 股票期权 / 限制性股票 / 股票增值权 / 股权奖励）

> 门禁基线：**verify:local 177 项，实跑 177/177 全绿**（快照 `tools/ops/.verify-local-last.json`）。本版新增 5 项断言：股权激励页可访问性与结构化数据 1 项 + 静态年度税率表与常量逐档对账 1 项 + 示例表与并入对照表可读 1 项 + CTA 归因 1 项 + 注册表条目与「不并入」口径声明 1 项；项数 172 → 177，以实跑为准。
> 单测 **34 套件 651 例**（新增 `tests/equity-incentive-quick.test.js` 18 例 + `tests/api-client-network-errors.test.js` 5 例 + `tests/sensitive-file-guard.test.js` 14 例）。
> 线上指纹 **37 项**（本版不改动指纹覆盖点）。
> 本版不动税额算法：新增的是一个独立税种测算页，税率仍读 `comprehensiveTaxRates`（与 App 同一张表）。

### 新增
- **第五个 SEO 落地页 `/seo/equity-incentive.html`（股权激励个税）**：瞄准「股权激励个税怎么算 / 股票期权个税 / 限制性股票个税 / 股票增值权个税」这一簇长尾词；页面自带速算器（选激励类型 + 填数量 / 行权日价 / 每股成本 / 登记日市价 / 本年度已计入 + 全年其他综合所得 → 股权激励收入、合并计税基数、单独计税应纳税额、实际税负率、并入对照与差额）
- 把政策讲准而不是讲顺：**现行政策下股权激励是「不并入当年综合所得、全额单独适用综合所得税率表」**，与年终奖那种「可以选择并入」不同；页面给出的「并入综合所得」明确标为**假设 2028 年起政策不再延续**的对照值，用来判断到期影响，而不是让用户以为可以二选一
- 四种激励的「股权激励收入」公式各自列出（股票期权 =（行权日市价 − 施权价）× 数量；限制性股票 =（登记日市价 + 解禁日市价）÷ 2 × 份数 − 出资额；股票增值权 =（行权日价 − 授权日价）× 份数；股权奖励 =（公平市场价 − 出资额）× 数量），并说明**不减除任何费用**（6 万元基本减除与专项附加扣除都用不上）
- 两个易踩口径单独成节：**一年两次激励须合并计税**（合并后一次定档，分次行权不等于分次享受低档）、**非上市公司符合条件的可递延纳税**（行权时暂不缴，转让时按「财产转让所得」20%，财税〔2016〕101 号）
- 常量新增 `equityIncentiveRules`（不减除费用 / 同年内合并 / 到期日 2027-12-31 / 四种激励公式 / 递延纳税 20%），税种注册表新增 `equity-incentive` 条目（政策文号：财税〔2018〕164 号第二条、财政部 税务总局公告 2023 年第 25 号、财税〔2016〕101 号）

### 变更
- `sitemap.xml` 收录 `/seo/equity-incentive.html`；`leadController.js` 的 `SOURCES` 白名单新增 `seo_equity`
- 门禁新增 5 条断言（见上行基线说明），「sitemap 收录全部落地页」扩为含第五个页面

### 修复
- **登录失败弹英文 `Failed to fetch`**：本地预览若只起前端静态服务（或页面不是从 `:3000` 打开），`fetch` 会直接 reject，浏览器抛的是英文 `TypeError`，`api-client` 原先没拦，原样弹给用户 —— 看不懂，也看不出该干什么。现在网络失败与非 JSON 响应都换成中文可操作提示（「无法连接服务器：请确认后端已启动，并打开 http://localhost:3000 访问」），三种浏览器/Node 的网络错误文案也一并进映射表；新增 `tests/api-client-network-errors.test.js` 5 例守住「不许再露英文」，并覆盖「成功响应不受影响」

- **静态托管把仓库根整个对外开放（安全问题）**：`express.static` 托管的是仓库根，于是后端源码、本地数据库、`.git`、运维配置都成了可下载资源 —— 实测 `GET /server/prisma/dev.db` 直接返回 SQLite 全库（用户邮箱 + 密码哈希 + 计算记录）、`GET /.git/HEAD` 返回 `ref: refs/heads/main`（配合 `.git/objects` 可拖走源码历史）、`GET /server/src/app.js` 返回后端源码、`GET /dev-account.local.json` 返回本机测试账号的真实密码。开「启动 + 公网分享」（cpolar 穿透）或部署到公网后任何人可下载（注：`.env` 因 express.static 的 `dotfiles` 规则未被外发，但**该规则只挡最后一段是点文件的请求**，`.git/config` 挡不住）。新增 `server/src/middleware/sensitiveFileGuard.js`：**点文件段、`server/` `tools/` `docs/` 顶层目录、`.db`/`.sqlite`/`.pem`/`.key` 等后缀一律 404**；`*.local.json` 是唯一例外，仅环回地址可读（登录页「填入本地测试账号」行为不变）。新增 `tests/sensitive-file-guard.test.js` 14 例，含「普通静态资源不误伤」与「守卫须挂在 static 之前」

### 说明
- **对拍对象是内核的年度税率表计税函数**：股权激励「全额单独适用综合所得税率表」落在代码上就是 `equity-incentive-quick.taxSeparateOf ≡ 内核 calculateTaxByTaxableIncome`，测试在 36000 / 144000 / 300000 / 420000 / 660000 / 960000 六个分界点及其 ±1 元、档内采样、极值与非法输入上逐点比对，税率档与速算扣除数也逐项对齐 —— 页面与 App 用的是同一张表、同一条定档规则
- **到期日不再手抄**：页面正文「执行至 2027 年 12 月 31 日」由测试从注册表取值比对（与年终奖页同一做法），政策延续情况变化时改注册表即可，不会留下过期的页面文案
- **合并计税有证据**：测试断言「合并后税额 > 分次各自税额之和」，把「分次行权不能避税」这句话钉成可执行的事实

## [1.18.0] - 2026-09-14（阶段15 开局：15D-1 税种注册表 + 15A-1 第四个 SEO 落地页「劳务报酬 / 稿酬 / 特许权使用费预扣预缴」）

> 门禁基线：**verify:local 172 项，实跑 172/172 全绿**（快照 `tools/ops/.verify-local-last.json`）。本版新增 5 项断言：劳务报酬落地页可访问性与结构化数据 1 项 + 静态预扣率表与常量逐档对账 1 项 + 静态示例表与年度税率表可读 1 项 + CTA 归因 1 项 + 税种注册表登记页与政策文号 1 项；项数 167 → 172，以实跑为准。
> 单测 **30 套件 595 例**（新增 `tests/withholding-quick.test.js` 16 例 + `tests/tax-registry.test.js` 9 例）。
> 线上指纹 **37 项**（本版不改动指纹覆盖点）。
> 本版不动税额算法：把 20/30/40 三档预扣率与「≤4000 减 800」规则从内核搬进 `tax-constants.js` 后，由逐点对拍证明内核结果未变（见下方「说明」）。

### 新增
- **第四个 SEO 落地页 `/seo/labor-withholding.html`（劳务报酬 / 稿酬 / 特许权使用费预扣预缴）**：瞄准「劳务报酬个税怎么算 / 800 元扣除 / 20%30%40% 预扣率 / 稿酬 14%」这一簇高商业意图长尾词；页面自带速算器（选择所得类型 + 输入金额 + 选择全年综合所得适用税率档 → 应纳税所得额 / 预扣预缴税额 / 预扣后到手 / 并入综合所得后的估算税负与应退或应补）
- 把「预扣 vs 并入」讲成一道减法：**预扣预缴是支付方先扣的数，年度汇算时按收入额并入综合所得重新计税**，差额正应补、负应退；页面如实说明并入后的实际税负取决于全年收入与扣除，精确值需把全年收支填进 App（用「全年综合所得适用税率档」做估算，估算口径写在页面上而不是藏在代码里）
- **15D-1 税种注册表 `src/js/calculation/tax-registry.js`**：单点定义各税种的适用范围、生效期、**到期日**与政策依据文号（当前登记综合所得、劳务/稿酬/特许权预扣、全年一次性奖金、汇算清缴四条），提供 `get` / `basisOf` / `resolveParams` / `statusOf` / `expiringWithin`；**数值仍留在 `tax-constants.js`**（出厂基线 + 管理台热改），注册表只记「参数在哪个全局量里」，避免为统一口径而复制出第二份数字；到期提醒（`expiringWithin`）让「年终奖单独计税执行至 2027-12-31」这类会过期的口径不再靠人记
- 常量新增 `withholdingTaxRates`（20/30/40 三档 + 稿酬与特许权 20%）与 `otherIncomeRules`（费用扣除 + 稿酬七折 + 并入综合所得的收入额折算），供内核与落地页共用

### 变更
- 内核 `calculateOtherIncome` 改为读上述常量（原先硬编码 20% / 30% / 40% 与「≤4000 减 800」）；落地页走同源的 `withholding-quick.js` —— 两个页面从此不可能给出两种结论
- `sitemap.xml` 收录 `/seo/labor-withholding.html`；`server/src/controllers/leadController.js` 的 `SOURCES` 白名单新增 `seo_withholding`（进 App 的链接带 `?source=seo_withholding`，留资可在管理台按来源区分）
- 门禁新增 5 条断言（见上行基线说明），并把「sitemap 收录全部落地页」扩为含第四个页面；`verify:local` 的静态对账对象由「页面抄一份税率表」改为「页面表格 ←→ 常量文件」，抄错即红

### 说明
- **常量搬家以对拍证明等价**：`tests/withholding-quick.test.js` 在费用扣除临界点（800 / 4000）与预扣率分界（应纳税所得额 20000 / 50000，对应收入 25000 / 62500）及其 ±1 元、档内采样、非法输入上，把轻量实现与内核 `calculateOtherIncome` 逐点比对；三张静态表（预扣率表 / 年度税率表 / 示例表）也逐格回对常量与内核，页面不维护第二份口径
- **政策文号与到期日不再散落在页面里**：`tests/tax-registry.test.js` 钉住「注册表 → 常量（params 声明的全局量必须取得到，写错常量名不会静默变 0）」「注册表 → 页面（登记了落地页的条目，页面正文至少含一条注册表里的政策文号）」「注册表 → sitemap（登记页必须已收录）」，以及年终奖页正文的到期日与注册表一致
- 本次未把新常量纳入 `tax-rates-sync.js` 的后端热改字段（2019 年至今未调整，属长期稳定参数）；若调整，按 15D-3 多税种版本化扩进 `/api/config/tax-rates`

## [1.17.0] - 2026-09-13（产品方向调整：取消计算页「参保城市」选择，回到默认基数 + 用户自改；省市改由留资收集）

> 门禁基线：**verify:local 167 项，实跑 167/167 全绿**（快照 `tools/ops/.verify-local-last.json`）。本版新增：移除已下线前端模块的 6 项静态断言；新增「城市改在留资里」5 项 + 「省份随城市一起落库（采集剔除哨兵值 + 按省搜索命中）」2 项 + 「缴费比例可输入 / 留空越界兜底」2 项 + 「经营页基数 × 比例联动」1 项断言。**口径修正**：文档曾按「基线 + 新增项」推算为 164，与实跑不符（少 1 项），现按实跑值回填 —— 该项数一律以实跑快照为准，不做推算。
> 生产等价演练：本版动过 `schema.prisma` 与 `server/prisma/migrations/`，按 `docs/guides/development-workflow.md` 属**必跑** `npm run verify:pg` 的范围 —— 已于 2026-09-13 在本机装好 Docker Desktop（4.90.0 / 引擎 29.7.2 / Compose v5.5.1，WSL2 后端）并**实跑通过：167/167 全绿**（与线上容器同序：`generate` → `migrate deploy` → 内容种子 → 起服务），迁移 `20260913_add_lead_city` 与 `20260913_add_lead_province` 均已在生产等价 PostgreSQL 上验收；此前记的「本机未装 Docker、尚未执行」按实跑结果更正。同批做的离线等价核对：两份 schema 各自 `prisma validate` 通过（`schema.prisma` 需给 PG 形状的 `DATABASE_URL`，本地 `.env` 的 `file:./dev.db` 会触发 URL 协议不匹配，属既有约定）、两份 `Lead` 模型逐字段一致（`province String @default("")` + `city String @default("")`）、两条迁移 SQL 都是纯加列语句（`ALTER TABLE "Lead" ADD COLUMN "city"/"province" TEXT NOT NULL DEFAULT ''`，带非空默认值，PG 对存量行安全 —— 存量线索的 `province` 落到空串，顾问侧表现为「只知城市、不知省份」，不会误判成某个省）；SQLite 侧的省 / 市落库、按城市与按省份搜索、CSV 省市两列已由 `verify:local` 实跑覆盖。**改动迁移时随时可重跑 `npm run verify:pg`**（全新库首部署场景用 `verify:pg:fresh`；演练库端口 55432、容器 `euriskotax-pg-drill`，跑完只停容器、数据卷 `pg_drill_data` 保留，彻底清理用 `docker compose -f docker-compose.postgres.yml down -v`）。注意 `verify:pg` 会把 Prisma Client 切成 PG 形态，收尾若报「恢复 SQLite Client 失败」需手动 `cd server && npm run prisma:generate:dev`（本次已手动恢复）。
> 单测 **30 套件 595 例**（删除 `tests/city-social-sync.test.js` 32 例；`tests/leads.test.js` 新增省 / 市字段契约 4 例（城市 2 + 省份 2），搜索字段扩为五字段同步 1 例）。
> 线上指纹 **37 项**（本版不改动指纹覆盖点）。
> 本版不动税率与税额算法：只调整「谁来提供城市」与字段链路。

### 变更
- **取消计算页的「参保城市」选择**（回退阶段14 C2 的端上部分）：正向 / 反向 / 经营三页不再注入城市下拉，社保与公积金基数下限回到**全国口径兜底**（`tax-constants.js` 的 7546，仍可被管理台「税率」Tab 的全国口径热更新覆盖）—— 即「初始给一个默认值，用户按自身情况修改」的原设计。各地口径差异大，让用户在计算页先选城市既多一步操作，也容易因选错而给出误导性提示
- 删除 `src/js/data/city-social-sync.js` 与 `src/js/ui/city-social-ui.js`（含 `tests/city-social-sync.test.js`），`package.json` 覆盖率采集清单同步移除；`tax-constants.js` 的契约注释回退为 C1 口径并记下本版取舍
- **城市改由留资 / 咨询时收集**（顾问跟进必须知道当地口径）：`lead-modal.js` 表单新增「所在城市」（必填、20 字内；空值在 `validate()` 里拦截，未填不发请求 —— 首轮实跑门禁拦下过「只收集不校验、必填星号是假的」这一版）、`api-client.js` 透传 `city`、`leadController.js` 按 `CITY_MAX` 校验入库且幂等合并时以最新一次为准、`leadAdminController.js` 支持按城市搜索并新增 CSV 城市列、管理台线索列表展示城市
- **留资「所在城市」由自由文本框收紧为省 + 市级联下拉**：手输城市名五花八门（上海 / 上海市 / 魔都），顾问拿到线索没法对表当地缴费基数口径。新增 `src/js/data/china-regions.js`（省级行政区 → 各地级行政区，含直辖市单列与港澳台）、`index.html` 换成 `#lead-province` + `#lead-city` 两级下拉、`lead-modal.js` 做联动（`renderProvinces` / `setCities`）并在每次打开弹窗时 `resetRegions()` 复位。行政区划不可能穷尽（县级市 / 境外），故省侧留「其他 / 海外」、市侧留「其他（手动输入）」回落为手输，避免把用户卡在必填项上
- **省份不再只是「筛选城市的中间态」，与城市一起落库给顾问看**：省是分派的上一级收敛维度（顾问按「本地口径」派人，如江浙沪私域，先筛省比按市翻页快得多），且市名重名时（吉林省吉林市 / 青海省海南藏族自治州 vs 海南省）只有「省 + 市」组合才认得出是哪个统筹区。链路：`lead-modal.js` 采集 `province`（选「其他 / 海外」时该值是筛选用的哨兵常量 `PROVINCE_OTHER`，**不能透传**，否则顾问会看到一行 `__other` 占位符，故出参前剔除）、`api-client.js` 透传、`leadController.js` 按 `PROVINCE_MAX` 校验入库（幂等合并时省、市各自判断 —— 用户可能只改了城市而省份没重选）、`leadAdminController.js` 搜索扩为五字段并新增 CSV `省份` 列（排在 `城市` 前）、管理台线索卡片展示「省 · 市」（城市名已含省份的直辖市 / 港澳只显示一个，不出现「北京 · 北京市」）、`[LEAD]` 日志改用 `region="省·市"`（日志是「有新线索即知会」的转发源）
- 数据库新增 `Lead.city`（`TEXT NOT NULL DEFAULT ''`）：`server/prisma/schema.prisma` + `schema.dev.prisma` + 迁移 `20260913_add_lead_city`；同批新增 `Lead.province`（`TEXT NOT NULL DEFAULT ''`）+ 迁移 `20260913_add_lead_province`
- **三页「缴费比例」由固定两档下拉改为用户可输入的数字框**（默认 5% 只是初始值）：各地公积金比例 5%~12% 不等（上海 5/6/7、北京 5~12），固定档位会让用户选不到自己的比例；现在与同页其他「缴费比例」控件（`<input type="number">` + `%`）形态一致。正向 / 反向页由 `change` 改为 `input` 事件即时重算，并新增 `normalizeRateInput`（失焦时把留空 / 非数字 / 越界值回落默认 5%）—— 否则用户清空输入会按 `parseFloat('')||0` 静默算成 0，看起来像算错
- **修复经营所得页「缴费基数 / 缴费比例」从未接线**：社保基数、公积金基数、养老 / 医疗 / 失业 / 公积金比例这 6 个输入框此前改什么都不发生，连「低于下限」提示位（`business-social-security-base-warning`、`business-housing-fund-base-warning`）也没有人写入；现补齐 `基数 × 比例 → 月度金额` 联动（新增 `calculateBusinessInsurance` / `calculateBusinessSocialInsurance`）并接上 `validateSocialSecurityBase('business')` / `validateHousingFundBase('business')`，与正向页口径一致。注意各险种清空后回落的是**自己的**默认比例（养老 8 / 医疗 2 / 失业 0.5 / 公积金 5），不是统一 5%
- 门禁口径收口：`tools/ops/ops-verify-pg.ps1`、`tools/gui/gui-dev-console.ps1`、`docs/guides/development-workflow.md` 里遗留的旧口径「152 项 / 156 项」共 10 处统一回填为实跑值 **165 项**——`verify:release` 与 `tests/docs-metrics.test.js` 都以「文档声明＝实跑结果」为准，旧口径会让口径自检变红
- **口径守卫加固（旧口径残留防护）**：`tools/ops/release-metrics.js` 原先只校验「每份文件里数值最大的那一条」项数声明，同文件内其余出现既不校验、也不要求版本前缀 —— 上面那 10 处旧口径正是这么漏过去的。现改为**逐条校验 + 版本前缀约束**：非当前口径的每条命中都必须带 `vX.Y.Z` / `[X.Y.Z]`（同一行或所在 `## ` 小节标题）自证是历史基线，否则报「疑似旧口径残留」并指名 `文件:行号`（增量描述「新增 / 移除 / 少 N 项」不计入）；`history` 落点的当前口径还必须锚定当前版本，不再靠「取最大」猜（项数下降的版本里历史值会比当前值大）；`ops-verify-pg.ps1` / `gui-dev-console.ps1` 一并纳入扫描

### 说明
- **城市社保参数库保留，但不再被端上消费**：`GET /api/config/city-social`（公开只读）、管理端发布 / 回滚 / 版本唯一校验与「社保基数」Tab 全部保留原样，供后续「社保基数」SEO 落地页复用（该页需要真实城市口径）；日后要恢复端上分档，按 git 历史回滚那两个前端模块并在 `index.html` 重新引入即可
- **口径提示降级为「全国兜底」**：非全国口径城市的用户可能收到本不该出现的「低于最低标准」提示（如上海公积金下限远低于 7546），这类差异改由顾问在留资后人工核对 —— 属本期「前期缩小范围」的已知取舍
- 门禁断言同步改造：删掉 6 条已下线模块的静态断言，换成「回滚不残留（`index.html` 不得再引用这两个文件）+ 留资城市字段四处接线」断言，并给 e2e 加上城市落库 / 按城市搜索 / CSV 城市列的核对；省市两级一起下后端后又补了「采集时剔除 `PROVINCE_OTHER` 哨兵值」静态断言与「按省份搜索命中」e2e 断言，原 e2e 的落库 / CSV 核对同步扩为省市两列
- **本地测试账号改为「本机可覆盖，凭据不进版本库」**：开发用的测试账号不再把邮箱 / 密码写进代码 —— 仓库里只留一份任何机器都能跑通的默认账号（`dev@example.com` / `password`，门禁 / 重置脚本会自动创建），本机想用自己账号就在仓库根放一个 `dev-account.local.json`（已 gitignore，字段 `email` / `password`，可选 `username`）：新增 `server/scripts/dev-account.js` 与 `tools/ops/dev-account.ps1` 两个同源读取器，`reset-dev-user.js`、`verify-local-auth.js`、`get-token.ps1`、`debug-swagger*.ps1`、`ops-start-dev.ps1` 与 GUI 控制台的账号 / 密码 / 一键复制按钮、环境检查、取 Token 全部改为读它；登录页「开发环境：填入本地测试账号」预填也改为运行时拉 `/dev-account.local.json`（拿不到就回落默认账号），代码里不再内联任何真实凭据；对外分享邮件模板同步还原为占位账号，并在分享说明里补一句「对外测试账号另备，勿填本机凭据」。顺带修掉两个真问题：①「重置开发测试账号」原来是**删账号重建**，而 `Calculation` / `Feedback` 对 User 都是 `onDelete: Cascade` —— 本机测试账号若是使用者自己的账号，点一下会连带删掉名下的计算记录与反馈，已改为**原地重置密码**；②门禁 `GET /profile 身份校验` 原先拿用户名比对，但账号已存在时用户名是用户自设昵称（脚本只在新建时才写 `devuser`），会把「账号已存在」误判成链路故障 —— 改为按邮箱（账号标识）比对，昵称仅作输出展示；③开发/测试环境下「验证码邮件真发信失败」原先会让 `POST /send-code` 直接返回 500、把本地门禁整条挂掉（如 QQ 邮箱对 `example.com` 这类保留域名必然 550 反垃圾拦截，且因域名不可投递而**稳定复现**，并非瞬时风控），而此时验证码其实早已打印到后端控制台 —— 现改为开发/测试环境只告警不报错（本地链路不依赖真实投递），生产环境仍严格要求发信成功；④`docs/tech-reports/watchdog-deployment-guide.md` 里那条真实发信日志样例的收件人邮箱也一并脱敏为占位账号

## [1.16.0] - 2026-09-13（阶段14 剩余项：第三个 SEO 落地页「汇算清缴」+ 参保城市下拉两处修复）

> 门禁基线：**verify:local 162 项**（本次实跑 **162/162** 全绿；新增「汇算清缴」落地页断言 **4** 项 + 参保城市下拉断言 **2** 项，项数 156 → 162，其余分段明细见下方 1.13.0 行）。
> 单测 **29 套件 592 例**（新增 `tests/annual-settlement-quick.test.js` 16 例：与内核 `computeDeductions` + `performTaxCalculation` 逐点对拍；`tests/city-social-sync.test.js` +5 例：首访广播 2 例、公积金比例随城市联动 2 例、「未指定」文案 1 例）。
> 线上指纹 **37 项**（本版不改动指纹覆盖点）。
> 本版不动税率与税额算法：新增内容是独立的静态落地页，另有参保城市下拉的两处端上修复（见「修复」）。

### 新增
- **SEO 落地页第三个页面：`/seo/annual-settlement.html`（个税汇算清缴：你是退税还是补税）**
  - 瞄准汇算季（次年 3 月 1 日—6 月 30 日）意图最强的「汇算清缴怎么算 / 为什么会退税 / 应退应补多少」；页面自带速算器（输入月薪、任职月数、每月五险一金、每月专项附加扣除、已预缴税额 → 全年应纳税额 / 已预缴税额 / 应退或应补税额 / 适用年度税率）
  - 把汇算讲成一道减法：**应退/应补 = 全年应纳税额 − 全年已预缴税额**（正数应补、负数应退）；「已预缴税额」留空时按累计预扣法推演、填写则以填写为准 —— 与主站「已预缴税额」输入框同语义
  - 正文为静态 HTML（汇算公式与手算示例、七档年度税率表、三种典型情形示例表、退税/补税情形清单、办理时间与渠道、5 条 FAQ），配 `canonical` + JSON-LD（`WebApplication` + `FAQPage`，与正文问答逐条对应、由单测守护）
  - **口径同源**：走 `src/js/calculation/annual-settlement-quick.js`，与内核 `computeDeductions` + `performTaxCalculation` 等价（全年收入 = 月薪 × 任职月数；年度总扣除 =（5000 + 五险一金 + 专项附加扣除）× 任职月数；年度税额查 `window.comprehensiveTaxRates`），并与「月薪个税」页的 `salary-tax-quick.js` 互相对拍 —— 三个落地页与 App 不会给出两种结论
  - 正文如实说明「全年在同一单位领取、扣除均已申报时，推演预缴额就等于全年应纳税额（差额 0）」，差额来自多处工资薪金合并、年中入职/跳槽、扣除未及时填报、劳务报酬预扣率偏高等；示例表三行（差额 0 / 应补 9600 / 应退）覆盖三种结论方向
  - 进 App 的链接带 `?source=seo_settlement`，服务端 `SOURCES` 白名单同步登记：本页带来的留资可在管理台按来源区分
  - 正文注明政策依据《中华人民共和国个人所得税法》及其实施条例、**国家税务总局公告 2019 年第 44 号**（综合所得汇算清缴）与免责声明
- **`sitemap.xml` 收录 `/seo/annual-settlement.html`**

### 变更
- 门禁新增 4 条「汇算清缴」落地页断言：可访问且含 canonical/FAQPage 与政策依据（含「6 月 30 日」办理期）、**静态年度税率表与 `comprehensiveTaxRates` 逐档一致**、静态示例表可被读到（9480 / 3480 / 19080 / 9600）、CTA 带归因参数；`sitemap.xml` 断言由「收录首页与全部落地页」扩为含第三个页面
- `server/src/controllers/leadController.js` 的 `SOURCES` 白名单新增 `seo_settlement`

### 修复
- **首访（无缓存）时「参保城市」下拉卡在空态**（`src/js/data/city-social-sync.js`）：拿到配置后只在 `revision` 变化时才广播 `euriskotax:city-social-updated`，而首访没有旧指纹 → 广播被吞掉，`city-social-ui.js` 便永远停在 `init` 时的状态：下拉只剩一个「未指定（按默认城市）」且禁用，用户必须**手动刷新页面**才能选城市（1.13.0 起存在，本地已复现：新开无痕页发布城市参数后等待 5s，选项仍为 1 且 `disabled=true`）。现在「首次拿到配置」也广播（`detail.firstLoad = true`，仍不算版本变更、不误报「参数已更新」），`revision` 未变则不重复广播
- **公积金「缴费比例」下拉不随参保城市变化**（`src/js/ui/city-social-ui.js`）：城市参数里的 `housingFundRateOptions` 此前只出现在提示文案中，三页的「缴费比例」下拉永远是页面静态的 5% / 7% —— 提示写「公积金比例可选 5% / 12%」，控件里却选不到 12%，用户还可能选出当地并不允许的比例（提示与控制自相矛盾）。现在按所选城市重建三页比例下拉：原值仍合法则保留，否则回落到首个合法值并触发一次 `change`（借页面既有监听重算公积金与专项附加扣除，不耦合计算函数）；无城市口径时保持出厂选项
- **「未指定」与默认城市的说法统一**：选项文案由「未指定（按默认城市）」改为「未指定（按默认城市：全国平均）」，提示由「按『全国平均』口径」改为「未指定参保城市，按默认城市『全国平均』口径」，并注明可选比例已同步到上方「缴费比例」控件

### 说明
- 本版发布后，阶段14 的公开待办仅剩「其余关键词落地页」（社保基数 / 税后工资），优先级见 `seo-landing-plan.md` §3；其中「社保基数」页依赖管理台录入真实城市口径（当前库内只有兜底城市 `national`，下拉因此只有一个可选城市）
- 汇算页的流量高峰在次年 3—6 月，旺季前上线以便收录起飞；本页复用的仍是 App 的年度汇算口径（基本减除费用按任职月数累计），页面上已如实写明

---

## [1.15.0] - 2026-09-13（阶段14 剩余项：高商业意图 SEO 落地页 —— 第二个页面「月薪个税」）

> 门禁基线：**verify:local 156 项**（本次实跑 **156/156** 全绿；新增「月薪个税」落地页断言 **4** 项，项数 152 → 156，其余分段明细见下方 1.13.0 行）。
> 单测 **28 套件 571 例**（新增 `tests/salary-tax-quick.test.js` 13 例：与内核 `calculateCumulativePrepaidTax` 逐点对拍 7 例 + 落地页静态表与常量/内核逐档一致 6 例）。
> 线上指纹 **37 项**（本版不改动指纹覆盖点）。
> 本版不动税率与税额算法，也不动主站任何交互逻辑：新增内容是独立的静态落地页。

### 新增
- **SEO 落地页第二个页面：`/seo/salary-tax.html`（月薪个税计算器）**
  - 瞄准搜索量最大的「个税计算器 / 月薪个税怎么算 / 累计预扣法」；页面自带速算器（输入月薪、每月五险一金、每月专项附加扣除、计税月数 → 全年应纳税额 / 月均税额 / 税后月薪 / 适用预扣率），并用「首月 vs 末月」对比解释「下半年为什么扣得多」
  - 正文为静态 HTML（累计预扣两步公式、七档预扣率表、12 个月逐月预扣示例表、5 条 FAQ），爬虫不执行 JS 也能读到全部内容；配 `canonical` + `og` + JSON-LD（`WebApplication` + `FAQPage`，并与正文问答逐条对应、由单测守护）
  - **口径同源**：税额走 `src/js/calculation/salary-tax-quick.js`（与内核 `calculateCumulativePrepaidTax` 等价、有逐点对拍测试），税率表读 `window.comprehensiveTaxRates`（`tax-constants.js` 出厂值 + `tax-rates-sync.js` 拉取的运营热改值）——页面上不出现第二份税率口径
  - 累计应纳税所得额用**逐月相加**而非「单月额 × 月数」：二者在浮点下不恒等（2999.99 × 12 = 35999.88，逐月相加 = 35999.87999999999），逐月相加才与内核逐位一致，由对拍测试钉住
  - 进 App 的链接带 `?source=seo_salary`，服务端 `SOURCES` 白名单同步登记：落地页带来的留资可在管理台按来源区分
  - 正文注明政策依据《中华人民共和国个人所得税法》及其实施条例、**国家税务总局公告 2018 年第 61 号**（累计预扣法）与免责声明
- **`sitemap.xml` 收录 `/seo/salary-tax.html`**

### 变更
- 门禁新增 4 条「月薪个税」落地页断言：可访问且含 canonical/FAQPage 与政策依据、**静态预扣率表与 `comprehensiveTaxRates` 逐档一致**、静态逐月示例表可被读到（首月 300 / 第 4 月 580 / 全年 9480）、CTA 带归因参数；`sitemap.xml` 断言由「收录首页与年终奖页」改为「收录首页与全部落地页」

### 说明
- 本版发布后，阶段14 的公开待办仅剩「其余关键词落地页」（汇算清缴 / 社保基数 / 税后工资），优先级见 `seo-landing-plan.md` §3
- 落地页自然流量受收录周期影响，不适合衡量短期转化；转化看的是 `?source=seo_*` 归因回来的线索

---

## [1.14.0] - 2026-09-13（阶段14 剩余项：高商业意图 SEO 落地页 —— 首个页面「年终奖个税」）

> 门禁基线：**verify:local 152 项**（本次实跑 **152/152** 全绿；新增 SEO 落地页断言 **6** 项，项数 146 → 152，其余分段明细见下方 1.13.0 行）。
> 单测 **27 套件 558 例**（新增 `tests/bonus-tax-quick.test.js` 12 例：与内核逐点对拍 7 例 + 落地页静态表与常量/内核逐档一致 4 例 + 页面引用脚本加载不抛错 1 例）。
> 线上指纹 **37 项**（本版不改动指纹覆盖点）。
> 本版不动税率与税额算法，也不动主站任何交互逻辑：新增内容是独立的静态落地页。

### 新增
- **SEO 落地页首个页面：`/seo/bonus-tax.html`（年终奖个税计算器）**
  - 瞄准「年终奖个税 / 年终奖单独计税」；页面自带速算器（输入奖金 → 单独计税应纳税额 / 税后到手 / 适用档位），并按六个临界点给出跳档提示
  - 正文为静态 HTML（计税步骤、按月换算税率表、六个临界点对照表、5 条 FAQ），爬虫不执行 JS 也能读到全部内容；配 `canonical` + `og` + JSON-LD（`WebApplication` + `FAQPage`）
  - **口径同源**：税额走 `src/js/calculation/bonus-tax-quick.js`（与内核 `calculateBonusTax` 等价、有逐点对拍测试），税率表读 `window.bonusMonthlyTaxRates`（`tax-constants.js` 出厂值 + `tax-rates-sync.js` 拉取的运营热改值）——页面上不出现第二份税率口径
  - 进 App 的链接带 `?source=seo_bonus`，服务端 `SOURCES` 白名单同步登记：落地页带来的留资可在管理台按来源区分
  - 正文注明政策依据《财政部 税务总局公告 2023 年第 30 号》（执行至 2027-12-31）与免责声明
- **`robots.txt` + `sitemap.xml`**：允许抓取公开页，屏蔽 `/api/`、`/admin.html`、`/clean-cache.html`；站点地图收录首页与落地页
- **方案文档 `docs/development/seo-landing-plan.md`**：设计原则（页面自己有用 / 口径同源 / 静态可抓取 / 零 CDN / 一页一词 / 可归因）、关键词→页面映射表与后续待办页面

### 变更
- 门禁新增 6 条 SEO 落地页断言：robots 声明 sitemap、sitemap 收录首页与落地页、落地页含 canonical/FAQPage 与政策依据、**落地页静态税率表与 `tax-constants.js` 逐档一致**、CTA 带归因参数、**sitemap 内每条 URL 实测可访问**
- 新增「门禁实跑口径快照」：`verify:local` 每次本地实跑把真实项数写入 `tools/ops/.verify-local-last.json`（已 gitignore），`npm run verify:release` 与 `tests/docs-metrics.test.js` 据此对账 —— 从此「文档里的门禁项数是推算出来的」会在测试里直接红（即 1.13.0 发布时 142 vs 146 那一类问题）
- `verify:local` 结尾新增口径自检输出：文档声明项数 ≠ 本次实跑项数时，直接列出需要修改的文件与行号（只提示、不改退出码 —— 口径滞后由 `npm test` / `verify:release` 拦，门禁本身变红会掩盖真正的功能失败）
- `development-plan.md` 状态行回填：阶段11「🚧 进行中」更正为「✅ 已完成（v1.8.0 · 2026-09-11）」；阶段12 更正为「🟡 部分完成 / 已拆分」（A + C1 随 v1.11.0、C2 随 v1.13.0 已上线；支付体系与 B 端 API 仍因 ICP 备案阻塞顺延阶段15）—— 这两行自 v1.8.0 / v1.11.0 起一直没回填

### 说明
- 本版发布后，阶段14 的公开待办仅剩「更多关键词落地页」（个税计算器 / 汇算清缴 / 社保基数 / 税后工资），优先级见 `seo-landing-plan.md` §3
- 落地页在 ICP 备案完成前后都能工作，但自然流量要等收录周期，不宜用它衡量短期转化

---

## [1.13.0] - 2026-09-13（阶段14：变现与可信度 —— ProCode 专业版兑换码 + C2 城市社保参数库）

> 门禁基线：**verify:local 146 项**（发布前实跑 **146/146** 全绿）。**口径修正**：此前记录的 142 是按「阶段13 基线 100 + 阶段14 新增 35（兑换码端到端 11 / 前端静态断言 5 / Swagger 文档完整性 2 / C2 端到端 10 / C2 前端静态断言 6 / C2 指纹不变量 1）+ 阶段13 补强 7」**推算**出来的，与实跑不符（少 4 项，此前未登记归属）；本次起改为按**分段实测**登记：前端与 SW 冒烟 **60** / 内容中心公开端点 5 / 税制参数端点 9 / 城市社保参数 11（含兜底城市不变量与指纹增量）/ 转化线索 14 / 登录 2 / 反馈落库与匿名埋点 14 / 运维后台用户 5 / 云端历史同步 9 / 专业版兑换码 11 / 注册链路 6；单测 **26 套件 545 例**（新增文件 `tests/pro-code.test.js` 28 例 + `tests/city-social.test.js` 24 例 + `tests/city-social-sync.test.js` 27 例 + `tests/lead-context.test.js` 27 例 + `tests/plan.test.js` 7 例权益口径（含体验天数 / 对比库上限 / gate 清单交叉一致性）+ `tests/version-sync.test.js` 4 例版本五处同步 + `tests/docs-metrics.test.js` 5 例文档口径守护；既有 `tests/share-card.test.js` 补 4 例分享落地契约断言）；线上指纹 **37 项**（新增兑换码端点路径检查）。
> 本阶段不改动税率与税额算法。**注意**：C2 改动了「社保/公积金缴费基数下限」的取值口径（由全国平均值改为按参保城市取值），属产品语义修正，详见下节。
> 变现闭环：线下收款 → 运营发码 → 用户自助兑换开通专业版，全程无需人工改库。

### 新增
- **14A 后端地基：`ProCode` 兑换码**
  - `ProCode` 模型（`code` 唯一 / `duration_days` 可空=永久 / `batch` 批次对账 / `used_by`+`used_at` 兑换留痕 / `disabled` 作废），生产 PostgreSQL 与开发 SQLite 双 schema 一致；迁移 `20260913_add_pro_codes`
  - `POST /api/pro-codes/redeem`（需登录）：事务内「校验 → 原子占用（`used_by IS NULL` 条件的 `updateMany`）→ 发放权益（`plan=pro` / `pro_granted_by=purchase`）」要么全成要么全回滚；「一码一用」由原子占用保证并发安全（`count===0` 视为已被抢用）
  - 续期语义：限时码对未过期 pro 用户在现有到期日上**叠加**，否则自兑换时刻起算；永久码 `plan_expires_at=null`；已是永久专业版的账号直接拒绝且**不消耗**兑换码
  - `GET /api/pro-codes/mine`（我的兑换记录，客服核对用）；兑换接口挂 10 次/15 分钟/IP 限流（防枚举，纵深防御）
  - 兑换码格式 `PRO-XXXX-XXXX`（字符集排除易混字符 0/O、1/I/L、U/V），与注册邀请码前缀显式区分
- **14B 用户端自助兑换**
  - 「版本与权益」弹窗内新增兑换码输入框 + 兑换按钮（`api-client.redeemProCode` → 同步本地会话、权益徽标与到期日提示；输入框回车即兑换）
- **14C 管理台「兑换码」Tab（线下收款发码 + 对账）**
  - 生成表单（数量 1-200 / 天数留空=永久 / 批次 / 备注）+ 可用·已兑换·已作废三类计数 + 批次/状态筛选 + 列表（状态 / 有效期 / 批次 / 备注 / 兑换者 / 操作）
  - 行内作废/恢复（**已被兑换的码禁止作废**，保留收款凭证；退款走用户权益回收）；CSV 导出（UTF-8 BOM + 公式注入防护）
  - 原「兑换码」Tab 更名为「邀请码」（注册用），与新「兑换码」（付费授权用）语义区分
- **14D（C2）城市社保参数库：把「社保基数下限」从全国平均值改成按参保城市取值**
  - **问题**：`MIN_SOCIAL_SECURITY_BASE` 一直是全国平均 7546（`tax-constants.js` 留有 `TODO(C2)`）。但同一年度各城市缴费基数下限可相差一倍以上 —— 高基数城市的用户会被误告「基数合规」，低基数城市用户被误报「低于最低标准」，属**给用户错误结论**。
  - **C1 遗留 TODO 的落地**：`tax-constants.js` / `helper-functions.js` 的 `TODO(C2 社保地区政策库)` 已消除，改为写明分层生效契约（常量兜底 → C1 全国口径 → C2 城市口径）。
  - 后端：`CitySocialConfig` 模型（`version` 唯一 / `status` published·archived / `payload` JSON 快照），生产 PostgreSQL 与开发 SQLite 双 schema 一致；迁移 `20260913_add_city_social_config`
  - `GET /api/config/city-social`（公开只读，无需登录）：返回 `{ version, revision, publishedAt, note, source, unchanged, config }`；支持 `?since=<revision>` 增量（指纹一致时 `config=null`）
  - `GET/POST /api/admin/city-social` + `POST /api/admin/city-social/rollback`（需 `X-Admin-Token`）：版本化快照 + 回滚另存新版本 + 可选「同步发送更新公告」（复用内容中心，公告版本号加 `city-` 前缀，不与税率公告的 `tax-` 撞号）
  - **服务端校验是安全边界**：城市编码契约（小写字母开头、仅 `a-z0-9_-`、2-32 位、不可重复）、基数下限 ≥ 0、上限须 ≥ 下限（留空 = 不设上限，存 `null` 而非 `Infinity`）、公积金比例选项去重升序且落在 `(0,100]`、**`national` 兜底城市不可删除**（否则用户未选城市时基数回落链断裂）、默认城市必须在列表中、版本号唯一（防静默覆盖可回滚的历史）
  - **端上**：`src/js/data/city-social-sync.js`（`window.CitySocial`）按 C1 同构实现 —— 启动同步重放 localStorage 缓存（离线可用）→ 异步拉取并按所选城市覆盖 `MIN_SOCIAL_SECURITY_BASE` / `MIN_HOUSING_FUND_BASE`
  - **时序耦合（本次最易踩的坑）**：C1 与 C2 写同一对全局量，C1 在税率指纹变化时会重新 `applyRates` 把全局量写回全国口径。C2 因此监听 `euriskotax:tax-rates-updated` 事件并在其后重新施加城市口径，保证「城市口径」永远是最终生效值；`syncNow` 在 `since` 命中（`config=null`）路径下也重新施加一次，覆盖「C1 刚写回全国口径」的竞态
  - **端上 UI**：`src/js/ui/city-social-ui.js`（`window.CitySocialUI`）在正向 / 反向 / 经营三页的社保区块注入「参保城市」下拉，三处共享同一份选择（参保城市是用户属性而非页面属性）；切换后重跑 `validateSocialSecurityBase` / `validateHousingFundBase`，提示数值即为当前城市口径；所选城市在新版本中被删除时回落并标 `matched=false` 提示用户；参数不可用（离线且无缓存）时下拉禁用并明确「当前按全国平均口径」，**绝不静默给错口径**
  - 管理台新增「社保基数」Tab：一城一行的可增删表格（编码 / 城市 / 社保上下限 / 公积金上下限 / 公积金比例选项 / 备注）+ 默认城市选择 + 版本号与变更说明 + 出厂基线载入 + 公告联动 + 版本历史与一键回滚；前端预校验与后端同口径（错误在点击瞬间提示，后端仍会再校验一次）
  - 端上校验规则与后端 `citySocialService.prepareCitySocial` 严格对齐（同一套错误语义），坏配置一律回退出厂基线而非污染端上提示

### 修复
- **管理台批量发码可能「少发」**：`generateCodes` 原先用 `parseInt`，会把 `count: 1.5` 静默截断为 1（少发码且无任何提示）。改为 `Number` + `Number.isInteger` 显式校验，非整数直接 `400` 拒绝；单测与门禁均补断言守护。
- **管理台文案错位**：「邀请码」页标题误写为「兑换码（一机一码 · 专业版授权）」，与新增的付费兑换码页混淆。已更正为「注册邀请码」，并在两页互加交叉指引（注册准入码 vs 付费授权码）。
- **留资弹窗展示的「当前测算」实为编造信息**：`scene` 本是调用方硬编码的**入口标签**，却被弹窗当作「用户的当前测算」打印 —— 从个人中心进入会显示「当前测算：个人中心·财税服务」，而个人中心根本没有测算；从结果页进入也只是把「测算类型名」冒充成结果。改为由 `src/js/lead/lead-context.js` 从**可核实的数据**反推：结果页读已渲染结果得出「类型 + 汇算结论 + 适用税率」（**不含任何金额**，金额只在本地用于判断「是否真的算完了」）；个人中心改为列出本机已保存的测算记录、由用户主动选一条；两者都没有时整张情境卡隐藏。结果页触点同步由 `data-scene` 死标签改为 `data-type`。
- **「免费核对一次」是空承诺**：全代码库没有任何免费次数计数或核销逻辑，「首次免费」「首次沟通免费」同样无法兑现 —— 用户第 N 次来文案仍写「一次」，顾问端也无从判断该用户是否已享受过。本次统一去掉次数承诺（改为「免费核对」「咨询免费」），只保留「不采集收入金额」「1 个工作日内回复」两条可兑现的信任点。若日后确需收费，再引入真正的次数控制与核销，而不是先写文案后补实现。
- **`index.html` 里 `#app-container` 一直没闭合**：1987 行开标签后直到文件末尾都没有对应的 `</div>`，全靠浏览器在 `</body>` 处隐式闭合 —— 页面表现正常，但静态扫描永远报一处未闭合，改动其内部结构时也容易误判层级。已在 `</body>` 前补齐（DOM 树与隐式闭合完全一致，无行为变更）。
- **「版本与权益」的专业版权益有两项与实现不符**：① 「政策要点增量更新推送」自阶段11 起已改为**全体用户（含未登录游客）可见**（`tax-policy.js` 取消免费版短路），继续挂在专业版权益里等于卖已经免费的能力；② 「优先问题跟进与数据保障」全仓库无任何对应实现（`grep` 只命中 `index.html` 自身）。现已按事实改写 —— 政策要点与更新公告移入基础版权益，专业版只保留**真实生效的档位差异**（云端同步 · 多设备漫游 / 汇算清缴 PDF 完整报告 / 方案对比库 2 → 10 套 / 云端数据长期保留，末项与 FAQ「到期不删除数据」口径一致）。基础版权益同时补齐三项已免费的实得能力（参保城市社保 · 公积金基数校验、「政策要点与更新公告」、「结果分享图」），「预算结果 PDF」按实际功能改为「测算结果 PDF」。**顺带补上「版本」二字本该承载的信息**：弹窗标题旁显示当前版本号（取自 `window.__APP_VERSION__`，不新增第 6 个手工同步落点）；FAQ 修正「见下方输入框」的方位错误（输入框实在该 FAQ**上方**）并新增「政策要点和更新公告需要专业版吗？」一条，把口径直接写给用户；`plan.js` 的 `PRO_FEATURE_HINT` 去掉已过期的「正式专业版购买即将开放」，改为「可用兑换码在『版本与权益』中自助开通」并点明计税 / 社保口径 / 政策要点 / 更新公告对全体开放。

### 优化（UI 专业化重排，无功能变更）
- **管理台信息架构重做**：建立统一组件层（`panel / page-head / hint / field / btn / tbl`），9 个页签统一为「标题 → 一句话说明 → 使用指引（怎么用 / 注意）」三段式；导航按业务分组（概览 · 获客 · 用户与权益 · 内容与配置 · 支持）并补悬浮说明；表格表头、单元格间距与空态样式收口到一处，新增行不再需要重复写间距类。
- **「兑换码」页重排**：说明 → 生成表单（每个字段带标签与示例）→ 三类计数 → 列表，收款发码流程一目了然。
- **个人中心功能卡片重排与分组**：按「常用功能」（计算历史 / 税务档案 / 数据管理 / 税务日历）与「服务与支持」（财税服务 / 公告与更新 / 意见反馈 / 使用帮助 / 关于我们）分组展示；商业价值最高的「财税服务」从末位提到服务组首位并加「顾问咨询」标签；顶部新增「版本与权益」主入口，提升兑换码自助开通的发现率。
- **留资弹窗与触点文案专业化**：口语化的「让专业顾问免费核对一次」「把漏填项找出来」「发一句『汇算核对』即可」改为规范财税口径（「申报前建议先核对，避免多缴或漏扣」「顾问将逐项复核专项附加扣除、年终奖计税方式与汇算结论」）；承诺与交付对齐 —— 本次交付的是一次沟通，文案不再暗示由顾问代用户完成申报。
- **财税服务弹窗：文案去「公文腔」+ 排版重排**：收紧那版读起来像公文（「申报前置核对」「确认口径无误」「逐项复核」），本次回到「专业但像人说话」—— 标题给结论（「申报前先核对，该退的税别漏掉」），副标题点明具体查什么（专项附加扣除 / 年终奖算法 / 退税补税结论）；信任点由竖排文字改为三枚胶囊标签（咨询免费 · 不采集收入金额 · 1 个工作日内回复）。**排版**：表单两段改为带序号圆标的「1 联系方式 / 2 补充信息」（选填段用灰标弱化），底部操作区由「一行密集小字 + 右侧小按钮」改为「一句话同意 + 一行灰字说明 + 通栏主按钮」。触点 CTA 由「预约核对」改回「免费咨询」—— 承诺的是一次免费咨询，不是顾问代申报；个人中心入口描述与分享落地横幅同步回到自然口径。
- **财税服务弹窗：砍掉流程图与答疑，只留「填信息 → 等联系」**：先按同类产品做法补过「三步服务流程条」（`#lead-steps`）与「顾虑答疑」折叠块（`#lead-faq`），随后按要求**整体下线** —— 用户不需要先读懂流程，填完信息由后台顾问联系反馈就行。现在弹窗里只剩一句流程说明（按钮下方「提交后由后台顾问与您联系反馈，无需其他操作」），成功态也从「收到 + 两条步骤清单」收敛为「已收到您的信息」+ 一句 JS 填入的补充（提交完再读一段步骤清单，反而像没提交成功）；主按钮由「预约免费咨询」改为「提交信息」，只承诺把信息交出去，不暗示预约成功。保留项：**顾问背书**（`#lead-advisor`，由 `LEAD_CONFIG.advisorName / advisorTitle` 驱动，**未配置真实顾问就不显示**，宁可少一行也不编资质）、头部两枚装饰光晕、成功态入场动画（`success` 复位时重放，尊重 `prefers-reduced-motion`）、姓名 / 手机 / 单位 `autocomplete` 提升移动端填写效率。单测**反向守护**：`#lead-steps / #lead-faq` 被顺手加回来即失败。

- **分享图视觉收口**：新增通栏品牌渐变条（通栏需一层不参与 `padding` 的外层容器）、明细表末行去下边框、免责声明前加分隔线；`negotiation` 模板文案改为「谈薪前，先算清税前该谈多少」。
- **分享落地首屏引导（新增 `src/js/share/share-landing.js`）**：`?source=share` 落地时展示「这是朋友分享给你的个税测算」横幅 + 「算出我的结果」CTA（锚点 `#home-start-card`）且可关闭；归因仍由 `lead-modal` 读 `sessionStorage`、埋点仍由 `funnel-tracking` 负责，本模块可整体下线而不影响闭环。
- **「版本与权益」入口收敛为 2 处**：删除用户下拉菜单里与顶栏 pill 相邻的重复项（同屏两个入口互相稀释点击，且菜单项总被旁边的 pill 抢先），只保留 ① 顶栏 pill `#topbar-plan-badge`（档位常驻可见、顺带承担版本告知）与 ② 个人中心横幅 `#profile-nav-upgrade`（场景化入口）两处。
- **发版口径从「人肉手改 6 处」变为「不一致即红 + 一条命令自动同步」**：单测套件/用例数、门禁断言数、线上指纹数散落在 `README` / `docs/README` / `development-workflow` / `development-plan` / `CHANGELOG` / `tools` 下两份 README 共 6 处，此前改一次用例数就要手改 6 处 —— 漏改不报错，只是让**对外承诺的验证强度与实现对不上**（低报显得测试可疑，高报则是虚报门禁）。新增 `tools/ops/release-metrics.js` 作为口径定义单点（套件数 = `tests/**/*.test.js` 文件数、用例数 = 测试文件里行首 `test(` 个数，两者均已与 jest 实测逐一核对；门禁项数与线上指纹数无法离线推导，只夹逼「文档彼此一致 + 不超过脚本内文本断言数」），新增 `tests/docs-metrics.test.js`（5 例）随 `npm test` 守门；`npm run verify:release` 打印五处版本落点（含 `文件:行号`）与口径差异，`-- --write` 只改「当前声明值」（CHANGELOG 里「上一版基线 → 当前值」的历史值不动）。同时把 `version.json` 的 `releasedAt` 收口为**唯一权威发布日**：CHANGELOG 该版标题日期须与它同日、且不得晚于今天（此前该字段无任何消费方，属「写了没人看」）。修此工具时顺带发现并修掉一处真实漏改 —— `README` 命令区的「25 套件 537 个」因措辞（`个` 而非 `例`）一直没被同步。
- **版本号漏改从「上线后红灯」提前到「本地变红」**：版本号要同步**五处**（`package.json` / `index.html` 的 `__APP_VERSION__` / 关于弹窗 `版本 x.y.z` / 根目录 `version.json` / CHANGELOG 最新条目），此前唯一的拦截是 push 之后的线上指纹核对 —— 而漏改的表现不是报错，是**版本哨兵 `StaleGuard` 判定「本页落后于线上」，每次新会话都注销 SW + 清缓存 + 重载**，用户体感「每次进站都闪一下」，从反馈里几乎定位不到（排障表里那条就是它）。新增 `tests/version-sync.test.js`（4 例）把同一份纪律固化成断言：五处逐处与 `package.json` 比对、缺任一处即红，并校验 `version.json` 的 `releasedAt` 与 CHANGELOG 该版日期同日；同时修正 `index.html` 里那条**只提「两处」**的发版注释（照着它做必然漏 `package.json` / 关于弹窗 / CHANGELOG），改为列全五处并指向本条守护。已反向验证断言非恒真（模拟漏改哨兵、漏改关于弹窗、改写注释三种情形均能触发失败）。

### 文档
- `tools/ops/ops-check-prod.ps1` 线上指纹新增「兑换码端点已上线」（读 `/api/docs.json` 核对 5 个路径，只读零副作用 —— 不生成也不兑换任何真实码）；线上核对 **36 → 37 项**
- 门禁口径全量同步：`verify:local` 100 → **146 项**（**口径修正**：142 是「基线 100 + 新增项」的推算值，发布前实跑为 146/146 —— 已改为按分段实测登记，明细见本版基线行）、单测 20 套件 412 例 → **26 套件 545 例**（`tests/plan.test.js` 7 例守护权益口径与交叉一致性 + 新增 `tests/version-sync.test.js` 4 例守护版本号五处同步 + 新增 `tests/docs-metrics.test.js` 5 例守护文档口径，配套 `npm run verify:release` 一条命令核对并自动同步）、线上指纹 36 → **37 项**（`README.md` / `docs/guides/development-workflow.md` / `tools/ops/README.md` / `tools/gui/README.md` / `gui-dev-console.ps1` 按钮文案与 `ops-verify-pg.ps1` 提示）
- 阶段13 补强口径同步：`docs/development/stage13-acquisition-and-leads-plan.md` 新增「§3.4 咨询情境 —— 只展示能核实的信息」（含「为什么不直接上传历史记录完整数据」的取舍说明），并更新文件改动表（`lead-context.js`）与 13B/13D 的 DoD；`docs/api/api-reference.md` 的 `scene` 字段说明与请求/响应示例改为非金额摘要口径
- `docs/api/api-reference.md` 升 **v2.8**：新增 §10.4 城市社保参数（公开只读 + `since` 增量 + 兜底城市不变量）与 §5.15 城市社保参数管理（当前配置 / 发布 / 回滚 / 校验清单），目录补书；§5.11 补「此处为全国口径，用户已选城市时以城市口径为准」的交叉提示
- `docs/guides/support-playbook.md`：新增 §五.5「社保基数提示低于最低标准但用户认为合规」核对流程（先问参保城市 → 核对「社保基数」Tab 当地口径 → 城市下线回落 → 灰置下拉属离线非故障）+ 话术表补一条
- `docs/marketing/cold-start-materials.md`：管理台 Tab 说明补「社保基数」（用户被提示基数偏低时先来这里核对）
- `docs/guides/tax-calculation-rules.md` §8 重写：由「全国平均值 7546」改为**分层口径**说明（常量兜底 → C1 全国口径 → C2 参保城市口径）、各城市参数的表单默认值与校验提示、`window.CitySocial` / `CitySocialUI` 契约与端上回落规则
- `docs/development/development-plan.md`：阶段14 状态行更新为**已随 v1.13.0 上线**（14A/14B/14C/14D/C2 ✅ 已完成；仅剩「高商业意图 SEO 落地页」）

---

## [1.12.0] - 2026-09-13（阶段13：获客与转化 13A 后端地基 / 13B 前端触点 / 13C 管理台「线索」Tab / 13D 一键结果分享图 / 13E 漏斗埋点；生产凭据轮换整改）

> 门禁基线：**verify:local 100 项**（阶段13 累计新增 32 项：13A 线索端点 14 + 13B 前端触点 7 + 13C 管理台 2 + Swagger 文档完整性 1 + 13E 漏斗埋点 3 + 13D 分享图 5）；单测 **20 套件 412 例**（新增 `tests/leads.test.js` 20 例 + `tests/funnel.test.js` 9 例 + `tests/share-card.test.js` 22 例）；线上指纹 **36 项**（新增线索端点路径检查）。
> 本阶段不改动任何计税逻辑。`Lead` 是「工具 → 服务」的唯一转化枢纽，北极星指标 `lead_submit / calc_done`。

### 新增
- **13A 后端地基**
  - `Lead` 模型（`user_id` 可空 / `scene` 情境快照 / `consent` 同意留痕 / `status` 状态机），生产 PostgreSQL 与开发 SQLite 双 schema 一致；迁移 `20260912_add_leads`
  - 公开端点 `POST /api/leads`：游客可提交（登录态经 `optionalAuth` 自动关联账号）、`consent` 强校验、字段白名单归一化、10 次/IP/小时限流、同手机号 24h 幂等合并（返回 200 且不新建记录）
  - 管理端 `GET/PATCH /api/admin/leads`、`GET /api/admin/leads/stats`、`GET /api/admin/leads/export`（CSV 含 UTF-8 BOM + 公式注入防护，最多 5000 条）
- **13B 前端触点（工具 → 服务的转化入口）**
  - 结果页情境引导：分流白名单仅经营所得 / 汇算清缴 / 分类所得，谈薪（`reverse`）**永不出现**（`ALLOWED_TYPES` + `BLOCKED_TYPES` 双保险，门禁断言守护）
  - 留资弹窗 `#lead-modal` 双通道：企业微信活码（`window.LEAD_CONFIG.wecomQrUrl`，未配置自动降级为仅留言通道）+ 留言表单（称呼 / 手机号 / 微信号 / 主体 / 需求 / 备注 + 显式同意勾选；校验 → 提交 → 成功态 → 自动关闭）
  - 个人中心「财税服务」常驻卡片（`profile-card-lead`）；`api-client.submitLead`（`apiRequest` 新增末尾 `sendTokenIfPresent`）；触点事件 `euriskotax:lead-click` / `euriskotax:lead-submit`
- **13C 管理台「线索」Tab**
  - 漏斗条（线索总数 / 今日新增 / 待分配 / 已成交·转化率 + `new→contacted→qualified→converted` 进度条）
  - 列表（联系人含关联账号 / 公司·主体 / 需求 / 来源·情境·备注 / 状态 / 跟进人 / 提交时间）
  - 行内状态机即时保存（失败自动回滚为服务端真实值）、分配跟进人（清空即取消分配）、按当前筛选导出 CSV

- **13D 一键结果分享图（T4 触点：用户传播 → 扫码回流）**
  - 新增 `src/js/export/capture.js`（DOM 截图公共层）：PDF 导出与分享图共用同一套 html2canvas 配置与临时容器清理，从根上消除「PDF 清晰但分享图糊」这类配置漂移 —— `navigation-ui.exportToPDF` 已改为调用它，自身不再保留一份截图实现（单测守护）
  - 新增 `src/js/share/share-card.js`：2 个模板 —— `income` 正向结果卡（综合所得 / 经营所得 / 分类所得，主角「税后收入」）与 `negotiation` 谈薪卡（主角「税前该谈多少」，谈薪场景真正关心的事）；取数直接读结果页已渲染的 DOM，对计算模块零耦合
  - 生成前预览确认（可保存 PNG，手机端提示长按保存）；二维码指向 `?source=share` 完成 T4 归因（`lead-modal` 落地时读取，优先级低于调用方显式指定）
  - 每张图固定展示「本测算结果仅供参考，不构成税务建议」；文案不含「避税 / 节税 / 税筹」（单测 + 门禁双重守护）
  - 谈薪页被服务引导显式排除（13B 硬约束），分享图是它**唯一**的转化出口 —— 单测专门守护这一产品决策，避免以后有人「顺手」把它删掉
  - 二维码用 `qrcode-generator`（cdnjs + SW cache-first）；加载失败降级为「域名文字」，不阻断出图
  - 生成成功派发 `euriskotax:share` → 自动计入 13E 漏斗 `share` 步（埋点在「真的拿到图」之后才触发，避免生成失败被记成一次分享）
- **13E 漏斗埋点（visit → calc_done → share/save → lead_click → lead_submit）**
  - `FunnelEvent` 模型（`date` + `step` 复合唯一，日粒度聚合）+ 迁移 `20260913_add_funnel_events`
  - 公开端点 `POST /api/stats/funnel`（**无需登录**、step 白名单、600 次/10 分钟/IP、日粒度 upsert 自增）
  - `GET /api/admin/leads/funnel?days=7`：各步累计 + 今日 + 各步转化率 + 北极星（`lead_submit` 直接 count Lead 表，不进埋点表）
  - 前端 `src/js/stats/funnel-tracking.js`：visit 每会话一次（sessionStorage 去重）、calc_done 绑 4 个计算按钮（结果容器可见才计，避免校验失败误记）、save 复用 `euriskotax:calc-saved`、share 预留 `euriskotax:share`（13D 分享图派发即接入）、**lead_click 包装 `LeadModal.open` 唯一入口**（以后新增触点免再改埋点）
  - 管理台「线索」Tab 新增「转化漏斗」区块（4 步 + 每步转化率 + 北极星徽标），与既有「线索状态漏斗」并列且语义不同
  - **口径修正**：原 `calc_done` 只在「登录用户保存计算」时上报，游客与「算完未保存」的多数用户完全不计入 → 北极星分母严重偏低。13E 改为公开端点覆盖全量口径（`CalcEvent` 保留不动，两者口径差异已写明在 schema 注释与文档中）

### 修复
- **Swagger JSDoc 的 YAML 写坏，端点从文档「静默消失」**（`taxRateAdmin.js` / `supportAdmin.js` / `leads.js`）：在 flow map（单行 `{}`）的值里写了裸 `{` 或英文逗号，例如
  `'201': { description: 已创建，返回 { id, merged: false } }`、`description: 支持 {RESET_URL} 占位`。
  yaml 解析失败**只打服务端日志、不影响端点运行**，但 `/api/docs` 里这些端点与响应说明直接不可见；而 `/api/docs` 页面本身仍返回 200，
  因此人工目测「能打开就算好」根本发现不了。现改为自然语言描述 + 必要的单引号包裹（`{RESET_URL}` 作为功能占位符原样保留）。
- **新增门禁断言 `Swagger /api/docs.json 可解析且含线索端点`**：把「文档可见」从人工目测变成可回归检查。此前 13A 的 DoD 写了「Swagger 可见全部端点」却没有任何守护，这次缺陷正是从那个缺口漏过去的。

### 安全（2026-09-13 凭据轮换整改）
- **生产全部长期凭据完成轮换**（曾以明文形式出现在排障记录中，按最坏情况处置）：`ADMIN_TOKEN` / `JWT_SECRET` / `SMTP_PASS` / PostgreSQL 密码全部更换新值。每项都做了**独立探测验证**，而不是「改完就算」：
  - `ADMIN_TOKEN`：旧令牌 → `401`、新令牌 → `200`（实测 `/api/stats/overview`）
  - `JWT_SECRET`：用旧密钥签发的 token → `401 Token invalid`；用随机错误密钥做对照同样返回 `Token invalid`，先确认判别方法有效再下结论
  - `SMTP_PASS`：QQ 授权码三向验证 —— 原始码与中间码均 `INVALID`、当前码 `VALID`，`POST /api/auth/send-code` 恢复 `200`
  - PostgreSQL 密码：容器内 `psql -U root -d postgres` 可通过认证并返回 `current_user`
- **Zeabur 控制台移除明文变量**：删除 `INVITE_CODE`（代码中已无任何引用）与 `PASSWORD`，不再以明文形式留存在面板
- **澄清「QQ 授权码可并存」这一坑**：生成新授权码**不会**让旧码失效 —— 旧码必须到「设置 → 账号与安全 → 设备管理 → 授权码管理」手动点「失效」。首次换码时实测新旧码**同时可用**，属假整改；本次已确认旧码全部失效。这条已写入排障认知，避免以后重犯
- **本地持密文件同步**：`server/.env`（`ADMIN_TOKEN` / `JWT_SECRET` / `SMTP_PASS` / `ADMIN_TOKEN_PROD`）与 `tools/ops/notify.config.json` 全部换新；轮换前的明文备份 `backup/server.env.20260913.bak` 已删除
- **git 泄露面复核**：`.env` / `notify.config.json` / `backup/` 均在 `.gitignore` 覆盖范围内；`git grep` 确认新旧凭据均**未进入任何被跟踪文件**
- 附带影响（预期内、无需处理）：`JWT_SECRET` 轮换使**所有在线用户被登出**，重新登录即可。本次整改不改动任何业务逻辑、接口契约与计税结果

> 轮换后的值只存在于 Zeabur 控制台与本地 `.env`；本 CHANGELOG 不记录任何凭据明文。

### 文档
- 新增 `docs/development/stage13-acquisition-and-leads-plan.md`（四项决策、13A-13E 排期与 DoD、合规清单）
- `docs/api/api-reference.md` 升 **v2.6**：新增 §5.12 转化线索管理、§5.13 转化漏斗统计、§11 公开写入口（线索提交）、§12 公开埋点接口（漏斗上报）
- 门禁口径全量同步：`verify:local` 68 → **100 项**、单测 17 套件 361 例 → **20 套件 412 例**、线上指纹 35 → **36 项**（README / docs/README / development-workflow / ops / gui 文档与脚本）
- 订正 `server/src/routes/leads.js` 注释与 Swagger 的限流口径（3 → 10 次/IP/小时，与 `app.js` 实际一致）

### 待办输入
- 企业微信「联系我」活码 URL：生成后填入 `index.html` 的 `window.LEAD_CONFIG.wecomQrUrl`；未配置时仅留言通道生效

---

## [1.11.1] - 2026-09-12（管理台税率保存链路修复 + 缴费基数 7546 + 计算页样式打磨）

> 上线方式：`ops-publish.ps1` 安全发布流水线（verify:local 68 项门禁 → push → 线上 35 项指纹全绿 → 自动打 `v1.11.1`）。
> 测试基线：**17 套件 361 例**；发布门禁 **68 项**（无新增断言）。
> 本版为 1.11.0（阶段12 A + C1）的补丁版：修复管理台「税率」Tab 保存链路的三处缺陷、把两个缴费基数最低标准与表单默认基数对齐为 7546，并把一批已完成的工作区界面打磨（计算页/预算表样式）随本版一并上线归档。

### 修复
- **管理台「税率」Tab 保存失败时无任何反馈（用户表现为「点保存并发布没反应」）**：三处叠加，均已修复
  - **反馈位置不可见**：「保存并发布」位于超长编辑器最底部，而状态区只渲染在 Tab 顶部，校验失败/接口报错时用户在按钮附近看不到任何提示。现同步渲染到按钮上方，并在失败时追加 `toast`、自动滚动进视口
  - **版本号预填导致必然撞号**：编辑器此前把「当前生效版本」预填进版本号输入框，而 `TaxRateConfig.version` 在库中唯一 → 第二次保存必被 `400 版本号已存在` 拒绝。现版本号一律留空，由后端生成 `YYYY.MM.DD-N`
  - **「载入出厂基线」结构错配**：出厂基线是**扁平 rates 对象**（`comprehensiveTaxRates` / `MIN_*` 直接在顶层），此前被整体赋给编辑器 `model`，而编辑器按 `model.rates` 取值 → 取到空对象、4 张税率表被清空 → 保存时收集到空数组、必然报「不能为空」。现包一层 `rates` 后再渲染
- **`tests/engine.test.js` 偶发假红（发布门禁的「零回归核心证据」不可靠）**：「注入路径 vs 表单路径等价」用例对结果整对象 `toEqual`，而结果含每次调用新生成的时间戳 `calculationDate`，两次调用相差 1ms 即失败。现剔除该字段后逐字段比较，并单独断言两次时间戳均为合法 ISO 且间隔 < 1s

### 变更
- **社保/公积金缴费基数最低标准 4250 → 7546**：与 §8.2 的表单初始默认基数对齐——**默认值即最低标准**（输入等于 7546 不提示，低于 7546 才提示）。同步前端常量 `tax-constants.js` 与后端出厂基线 `DEFAULT_TAX_RATES`（`taxRateService.js`）；管理台「税率」Tab 的「社保/公积金缴费基数下限」即该值，可改后热发布
  > 部署注意：若线上库已存在**自定义税率配置**（公开端点 `source=custom`），其优先级高于出厂基线 → 需在管理台把这两个基数改为 7546 后重新「保存并发布」；库中无自定义配置时自动跟随新基线

### 界面（计算页 / 预算表样式打磨）
- **预算表可读性**：`#tax-budget-table` 最小宽度 850 → 900px（新增「税后到手」「累计收入」两列后需放宽）；表头 `whitespace-nowrap` 单行不折行；表头/数据行 `py-3` → `py-3.5` + `leading-relaxed`；数据单元格启用 `font-variant-numeric: tabular-nums`（等宽数字，金额列不再因字宽变化而错位跳动）
- **顶栏/底栏白底铺满视口**：`.calc-sticky-header` / `.calc-preview-bar` 此前白底只占容器宽度，比下方卡片宽出一截又夹着灰缝，视觉上像悬空的独立白块。改用负边距 + 补偿内边距铺满，内容位置保持不变；并以 `@supports (overflow-x: clip) { body { overflow-x: clip } }` 裁掉两侧溢出的几像素（`clip` 不产生滚动容器，不破坏 `position: sticky`，旧浏览器自动忽略）
- **步骤内容留白**：`.step-content` 增加 `pt-4`，与顶栏拉开呼吸感（底部避开预览条的 `pb-20` 保留）
- **宽屏边缘留白**：≥640px 时步骤条与卡片补 1.5rem 左右内边距，不再紧贴屏幕边缘

### 测试
- 单元测试 **17 套件 361 例全绿**；`tests/engine.test.js` 单独连续复跑 3 次全绿，验证时间戳偶发已消除
- 发布门禁 `verify:local` **68/68**：税率相关 9 项断言为**结构型**（`typeof === 'number'`、末级 `max` 为 `null` 等），不锁死基数量值，故本次改值无需改门禁；发布动作仍以「当前生效值原样」回填，跑完不改动任何计税结果

### 文档
- `docs/guides/tax-calculation-rules.md`：§8.1 常量值与说明、§8.3 警告文案同步为 7546；订正 §8.1「代码实现」指向（两个基数量已迁至 `tax-constants.js`，原指向 `helper-functions.js` 第 3-5 行已失效）
- `docs/api/api-reference.md`：税率配置请求/响应示例中的两个基数同步为 7546
- 历史计划文档（`development-plan.md` §社保缴费基数优化、`stage12-core-enhancement-plan.md`）保留当时口径，不改写历史

---

## [1.11.0] - 2026-09-12（阶段12：核心功能补强 + 税制参数配置化；发布流程加固）

> 上线方式：`ops-publish.ps1` 安全发布流水线（verify:local 68 项门禁 → push → 线上 35 项指纹全绿 → 自动打 `v1.11.0`）。
> 测试基线：12 套件 303 例 → **17 套件 361 例**；发布门禁 59 → **68 项**。
> 本版归档三个工作流：**阶段12 A**（前端核心功能补强）、**阶段12 C1**（税制参数配置化，跨端）、**发布流程加固**（`verify:pg` 演练门禁 + 回退 SOP）。

### 阶段12 A · 核心功能补强（常量版本化 / 月度明细增强 / 计算核心纯函数化 / 公式透明化 / 方案对比中心）

> 全部改动落在**前端 + 常量文件**：不触碰后端、不引入构建工具、不动 Service Worker 与静态缓存策略。
> 实施顺序：A5 → A3 → A1 → A2 → A4。

#### 新增
- **税法常量单一事实来源** `src/js/calculation/tax-constants.js`（`version = 2026.1`）：集中 4 组税率表（综合所得 / 年终奖月均 / 经营所得 / 分类所得）与 2 个缴费基数下限，供计算层统一消费，后续政策调整只需改一处
- **计算引擎命名空间** `src/js/calculation/engine.js`（`window.EuriskoEngine`）：聚合计算层纯函数（含 `version`），供方案对比与单测**脱离 DOM 复用**（仅引用、零逻辑搬移）
- **月度预算表新增两列**：「税后到手」= 月收入 − 当月税额、「累计收入」= 月收入 × 月序；正向主表列宽 `min-width` 上调至 850px（用 `#tax-budget-table` 限定，不影响其余 6 张共用 `.tax-budget-table` 的表）
- **计算过程透明化**：结果区新增 `<details>` 可折叠面板，逐步展示 收入额 → 扣除额 → 应纳税所得额 → 适用税率与税额 → 预缴与汇算 → 税后年收入，另附年终奖单独计税步骤
- **方案对比中心**：结果区新增通栏卡片，支持保存当前方案、一键生成「年终奖并入 / 单独计税 / 最优拆分」三方案并横向对比（税前年收入 / 税后年收入 / 年度应纳税额 / 实际税负率 / 月均到手 / 年终奖计税方式，最优值高亮）；本地方案库带 `ownerId` 账户隔离，免费 2 套 / 专业版 10 套（**计税能力不锁定**）

#### 变更
- `performTaxCalculation(inputData)` 支持**注入** `inputData.deductions`：注入时全链路纯计算，未注入时回退读表单，原有表单主链路行为逐位不变
- `calculateComprehensiveDeductions(workMonths)` 拆分为 `collectDeductionInput()`（DOM 适配器）+ `computeDeductions(input, workMonths)`（纯函数）+ 兼容包装，旧调用点零改动

#### 测试
- 单元测试 A 阶段收口 **341/341 通过**（**16 套件**；阶段起点为 303 例 / 12 套件）
- 新增 `tests/budget-table.test.js`（4 例，锁定 9 列不变量与新增列口径）
- 新增 `tests/engine.test.js`（8 例，锁定 `window.EuriskoEngine` 契约，并**在清空 DOM 后**证明「注入路径 vs 表单路径」结果等价）
- 新增 `tests/formula-steps.test.js`（9 例，公式步骤数值与结果区逐位一致）
- 新增 `tests/scenario.test.js`（17 例，方案库纯函数 + 付费上限 + 年终奖方案口径）

#### 文档
- 新增 `docs/development/stage12-core-enhancement-plan.md`（A 阶段实施方案与完成记录）
- 订正 `docs/development/development-plan.md`：原「前端计算改为调 API」记录与现状（前端本地计算）矛盾，已随本阶段修正

### 阶段12 C1 · 税制参数配置化（管理台热改税率 + 可选公告联动）

> 跨端改动：后端新增版本化配置模型与公开只读端点，管理台新增「税率」Tab，前端新增热更新同步层。
> 设计要点：**税率不再硬编码**——管理台保存后对所有用户即时生效；旧版本保留可回滚；改动可选复用内容中心发一条更新公告。
> 安全：税率错误会波及全站计税，故后端 `prepareTaxRates` 为最终校验边界，前端同规则预校验；公开端点只读。

#### 新增
- **税率配置模型 `TaxRateConfig`**（Prisma 双 schema + 迁移 `20260912_add_tax_rate_config`）：版本化快照（`version` 唯一 / `payload` JSON / `status` published|archived / `note` / `published_at`），每次保存写入新版本并归档旧的，天然支持审计与回滚
- **公开只读端点 `GET /api/config/tax-rates`**：返回当前生效税率（库中无自定义配置时回退**出厂基线**，与 `tax-constants.js` 对齐）；支持 `?since=<revision>` 增量（指纹一致时 `rates=null`）；独立限流 60 次/分/IP
- **管理端点 `GET/POST /api/admin/tax-rates` 与 `POST /api/admin/tax-rates/rollback`**（`requireAdmin`）：保存并发布新版本、列出版本历史、以历史版本为蓝本回滚；`POST` 支持 `notify` 字段，勾选后**在同一请求内联动发布一条公告**（`ContentItem` + `ContentRelease`，复用内容中心投放位）
- **服务层 `server/src/services/taxRateService.js`**：出厂基线 `DEFAULT_TAX_RATES`、纯函数校验/归一化 `prepareTaxRates`（阶梯表衔接、税率递增、上限规则、基数非负）、`revisionOf` 指纹
- **前端热更新同步层 `src/js/data/tax-rates-sync.js`**（`window.TaxRates`）：启动时**同步重放** localStorage 缓存（保证首屏计算即用最新值）→ 异步拉取最新配置 → 校验后覆盖全局税率变量并回写缓存；离线回退缓存/出厂基线；`pure.validate` / `pure.normalize` 供复用与单测
- **管理台「税率」Tab**（`admin.html` + `admin.js`）：4 张税率表（综合所得 / 月度 / 经营所得 / 分类所得）与 2 个缴费基数下限的可视化编辑，实时预校验，保存并发布、版本历史与一键回滚、「同步发送更新公告」勾选

#### 变更
- 税率事实来源由「前端代码常量」升级为「后端配置 + 端上同步覆盖」：`tax-constants.js` 保留为**离线兜底基线**，并在注释标注 C1 契约
- `admin.js` 的 `api()` 错误对象补 `details` 字段，管理台可一次展示后端返回的全部校验错误

#### 测试
- 新增 `tests/tax-rates.test.js`（20 例）：锁定 `window.TaxRates` 契约、校验规则与后端对齐、`applyRates` 覆盖全局并驱动 `calculateIncomeTax` / `calculateBonusTax` / `calculateSingleClassificationTax` 立即生效、缓存重放与 `syncNow` 增量/失败分支
- 全量 **17 套件 / 361 例通过**
- 发布门禁 `verify:local` 扩至 **68/68 通过**（新增 9 项税制参数断言：公开端点结构完整 + 末级无上限以 `null` 传输 / `since` 增量语义 / 管理端点无令牌 401 / 当前配置+出厂基线+历史 / 非法税率 400 + `details` / 发布 201 且公开端点转 `source=custom` / 回滚另存新版本。发布动作以「出厂基线原样」回填，跑完生效配置仍等价基线，不会改动任何计税结果）

#### 文档
- 新增 `docs/development/stage12-c1-tax-rate-config-plan.md`（C1 方案与实施记录）
- 文档口径收口：`README` / `docs/README` / `tools/ops/README` / `tools/gui/README` / `docs/guides/development-workflow` / `ops-verify-pg.ps1` 的单元测试套件数与门禁断言数同步至 **17 套件 361 例** 与 **68 项**；`docs/api/api-reference.md` 升版 **v2.4** 并补 §5.11（税制参数管理）与 §10.3（公开只读端点）

### 发布流程加固 · 本地 PostgreSQL 演练门禁 + 回退 SOP 固化

> 本段为工具链与文档加固（无产品行为变更），已先行推送至 main，随本次 `v1.11.0` 一并归档。

#### 新增
- **本地 PostgreSQL 演练门禁 `npm run verify:pg`**：新增根目录 `docker-compose.postgres.yml`（临时 PostgreSQL，端口 55432 / 独立数据卷）与 `tools/ops/ops-verify-pg.ps1`。按线上容器同序（`prisma generate` → `prisma migrate deploy` → 内容种子 → 起服务）把同一套 e2e 门禁（当前 **68 项**）再跑一遍，专门拦截「本地 SQLite 全绿、线上迁移/字段才炸」的一类问题；`npm run verify:pg:fresh` 为全新库首部署场景；未装 Docker 时优雅退出（退出码 2）不影响日常门禁
- `server/scripts/verify-local-auth.js` 支持 **`VERIFY_PG=1` 双模式**：迁移改为 `migrate deploy`（与线上同命令）、内容自动幂等种子化（内容端点断言依赖）、收尾自动恢复 SQLite Prisma Client；非 PG 模式行为与原先完全一致

#### 变更
- **移除未接线的状态红点**：`.assistant-fab-pulse` 自 1.10.0 起固定 `display:none`，且没有任何代码路径（含 `tax-assistant-ui.js`）会将其显示 —— 注释所述「有待办内容时显示」的数据源从未实现；已连同 `.assistant-fab.dock-left .assistant-fab-pulse` 定位规则和对应 `<span>` 元素一并删除，避免后续误判悬浮球具备未读提示能力
- **回退 SOP 固化为两级流程**（`docs/guides/development-workflow.md` §4、`docs/guides/branch-release-strategy.md` §6.1）：明确「tag = 稳定锚点」语义，先止血（Zeabur 部署历史重部署上一正常构建，约 1 分钟）→ 再修根（`git revert` → 安全发布），并给出可直接抄的命令（含 `git revert --no-commit vX.Y.Z..main` 批量回退）
- **排障速查表补 3 条新现象**：`verify:pg` 无 Docker（码 2）/ `migrate deploy` 失败（这正是上线会炸的点）/ 演练后 Client provider 不匹配如何恢复
- **GUI 接线**：控制台「🧪 测试中心」→「3. 发布门禁」卡片新增 **🐘 PostgreSQL 演练门禁**（`ops-verify-pg.ps1`）与 **🔄 全新库演练**（`-Fresh`）两个按钮，门禁不必再记命令行；未装 Docker 时按钮输出「已跳过 + 返回码 2」，并弹一次「是否打开 Docker Desktop 下载页」引导（同一提示 180s 内去重，连点两个按钮不会被弹两次），`tools/gui/README.md` 同步补按钮说明表
- **演练前置检查（点按钮前先看 `:3000`）**：本机有 Docker 且检测到本地 `:3000` 后端在监听时，两个演练按钮会先弹警告二次确认（可取消，取消时不执行任何命令），避免「跑到 `prisma generate` 才以 EPERM 失败」再回头排查；未装 Docker 时跳过该检查，直接让脚本走「返回码 2 → 装 Docker 引导」链路，不叠加多余弹窗
- `tools/ops/README.md` 补 `ops-verify-pg.ps1` 文件清单与「PostgreSQL 生产等价演练」用法段落
- **文档口径收口**：`README.md` / `docs/README.md` / `tools/gui/README.md` 补上 `verify:pg` 的触发时机说明与门禁按钮说明（版本号与门禁断言数的最终口径：单测 **17 套件 361 例**、门禁 **68 项**、线上指纹 **35 项**）

---

## [1.10.0] - 2026-09-12（悬浮税助手悬浮球：品牌图形圆球 + 默认半隐 + 可完全隐藏 + 边缘热区唤回）

> 上线方式：`ops-publish.ps1` 安全发布流水线（verify:local 门禁 → push → 线上 35 项指纹全绿 → 自动打 `v1.10.0`）。

### 新增
- **悬浮球默认半隐（peek）**：贴边停靠时只露出 18px 月牙（`--peek-x` 位移 + 0.5 不透明度弱化存在感）；桌面端鼠标移入即完整滑出，无操作 3s 后自动回缩，减少对页面内容的遮挡（`FAB_SIZE=44` / `FAB_MARGIN=12` / `PEEK_VISIBLE=18` / `COLLAPSE_DELAY=3000`）
- **完全隐藏 + 边缘热区唤回**：抽屉头部新增「隐藏助手」按钮（`#assistant-hide`），隐藏后悬浮球移出视线并把偏好写入 `localStorage`（`taxAssistantFabHidden`，下次进入仍保持隐藏），同时激活与停靠边对齐的透明热区 `#tax-assistant-hotzone`（宽 16px、高随球高、hover 淡蓝提示），鼠标靠近或点击即唤回并恢复半隐形态
- **触屏二次确认**：`(hover: none)` 设备上首次点击月牙只滑出悬浮球，第二次点击才打开抽屉，避免半隐态误触
- **拖拽与形态联动**：开始拖拽立即完整露出（半隐态抓不住），松手停靠完成后自动回到半隐
- **品牌图形图标**：悬浮球由 `fa-user-circle` 图标改为品牌图形圆球，启用 `images/EuriskoTaxLogo-zoomed.png`；新增构建脚本 `images/build-euriskotax-logo-zoomed.ps1`（扫描 `EuriskoTaxLogo.png` 的 alpha 内容包围盒 → 裁切 → 按 93% 填充率居中放大到 256×256，含产物填充率自检与非空校验，`-Size` 可调）
- 悬浮球形态控制 API 对外暴露：`collapseFab / expandFab / hideFab / showFab / isFabHidden`

### 变更
- **悬浮球尺寸与配色**：56px 蓝色渐变圆球 → 44px 白色圆球承载 32px 品牌图形（`44px` 兼顾触控最小可点目标）；阴影由蓝色投影改为中性阴影，抽屉标题图标 `fa-user-circle` → `fa-calculator`
- **transform 叠加方式统一**：`assistant-fab` 及其 hover/active/dragging/hidden 各态统一为 `translateX(var(--peek-x)) scale(...)`，避免缩放动画与半隐位移互相覆盖；半隐位移改由 JS 写入 CSS 变量
- **状态红点不再脉动**：`.assistant-fab-pulse` 移除 2s 无限脉动关键帧并默认不展示（HTML 内联 `display:none`），从「持续抢视线」改为按需显示

### 测试
- 单元测试 303/303 通过（12 套件；1.9.0 为 295 例）
- 新增 `tests/tax-assistant.test.js` 8 项：初始化默认半隐（带 `peek` 类且位移非 0）/ 展开后位移归零并带 `expanded` 类 / 隐藏写入偏好并激活热区 / 唤出清除隐藏态与偏好 / 隐藏偏好跨初始化保持 / 触屏首次点击只滑出第二次才开抽屉 / 抽屉内「隐藏助手」隐藏并关抽屉 / 关闭抽屉后恢复并回缩为半隐

### 文档
- `docs/guides/development-workflow.md` 单测口径 12 套件 295 例 → 303 例

---

## [1.9.0] - 2026-09-12（防旧版残留加固：版本哨兵自愈 + /reset 排障短链 + 排障话术库后台可管理；公积金默认基数对齐社保；汇算「税前收入」口径修正；个人中心/管理台样式修复）

> 上线方式：`ops-publish.ps1` 安全发布流水线（verify:local 门禁 → push → 线上 35 项指纹全绿 → 自动打 `v1.9.0`）。

### 新增
- **版本哨兵 `StaleGuard`**：`index.html` 启动时以 `cache: 'no-store'` 拉取根目录 `version.json`，与本页 `window.__APP_VERSION__` 比对；不一致即自动注销全部 Service Worker、清空 Cache Storage 并重载，用户无感自愈。用 `sessionStorage` 防抖（本次会话只自愈一次），本地开发（localhost/127.0.0.1）不启用以免打断热更新
- **排障短链 `GET /reset`**：302 跳转 `/clean-cache.html?auto=1`，用于口播、客服话术与群公告发放；定义在 SPA 回退之前，避免被 `index.html` 兜底吞掉
- **`version.json`**：新增版本哨兵基准文件（`server/src/app.js` 的 `setHeaders` 已对其下发 `Cache-Control: no-cache`；`service-worker.js` 对其放行，不缓存、不拦截）
- **排障话术库改为后端可管理（阶段12）**：新增 `SupportScript` 模型（迁移 `20260912_add_support_scripts`，随部署自动执行）与 `/api/admin/support` 接口（列表 / 新建 / 编辑 / 删除 / 恢复内置，均需 `X-Admin-Token`）；管理台新增 `support` Tab，支持增删改、一键复制话术、关键词检索与分类筛选，话术中的 `{RESET_URL}` 占位符自动替换为当前站点的 `/reset` 短链。内置 9 条高频问题在服务启动时幂等播种（**仅当表为空**，不覆盖后台编辑），此后改文案即时生效、无需发版；接口不可用时前端自动回退离线快照，面板不会空白
- **客服排障手册**：`docs/guides/support-playbook.md`

### 变更
- **住房公积金默认基数 4250 → 7546**：与社保默认基数保持一致，同步正向计税、反向倒算、经营所得三处表单默认值与重置逻辑，以及税务档案默认公积金基数；派生公积金金额随基数联动为 377.30（7546 × 5%）。最低基数校验常量 `MIN_HOUSING_FUND_BASE = 4250` 不变（仍作低于标准的提示阈值）
- **预算表汇总行「全年收入额」更名为「税前收入」**：正向汇算、反向单模式、反向多模式三处表格统一标签

### 修复
- **计算历史空态不显示**：`loadHistoryToList` 无记录时先清空列表容器，而 `#profile-history-empty` 是其子节点被一并移除，「暂无计算记录」永不显示；现改为清空后按需挂回
- **个人中心卡片样式统一**：用户横幅卡、底部操作卡、功能模块卡片不再混用 `.card` 自定义类，统一改为内联 Tailwind 工具类（`bg-white rounded-lg shadow-card`），消除 `.card` 自带 padding/flex 在个人中心造成的白边与对齐问题（`index.html`、`src/js/auth/auth-ui.js`）
- **「公告与更新」点击无响应 + 无限请求**：`ContentCenterUI.openNoticeList` 在内容为空时递归调用自身且条件恒成立，导致无限请求 `/content/feed`（实测 429）；现只重试一次，弹窗正常显示「暂无公告内容」
- **管理台 Tab 样式修复**：`admin.html` 中 `.tab-btn` 使用 `@apply` 但 `<style>` 未声明 `type="text/tailwindcss"`，导致 Tailwind Play CDN 未处理，Tab 按钮失去 padding/radius/font 等样式；已修正为 `<style type="text/tailwindcss">`
- **综合所得汇算汇总行「名称与真实计算不一致」**（`src/js/calculation/utils.js` `updateBudgetTable`）：
  - 「税前收入」原取 `incomeDetails.total`（即综合所得**收入额**——劳务报酬/稿酬/特许权使用费已按 80%/70% 折算），名不副实；现改为 `incomeDetails.preTaxTotal`（工资薪金 + 劳务报酬 + 稿酬 + 特许权使用费 + 年终奖的税前收入合计），与结果页「税前年收入」口径一致
  - 「应纳税所得额合计」原由「税前收入 − 年度扣除合计」反推，存在 20% 费用扣除时不成立；现直接取 `taxDetails.taxableIncome`
  - 「累计预缴税额」「应退/补税额」原自行重算（且把年终奖单独计税税额计入综合所得预缴），与结果区口径不符；现直接取 `taxDetails.prepaidTax` / `taxDetails.refundTax`，与结果区一致，并支持用户手动填写的预缴税额
- **计算器步骤按钮移动端排版拥挤**：综合所得（3 步）、反向倒算（2 步）、经营所得（2 步）、分类所得（1 步）共 8 处步骤操作按钮组原用 `flex justify-between`，窄屏下按钮相互挤压、文字换行、主次操作错位；现统一为响应式布局（`flex-col md:flex-row` + `gap-3` + `whitespace-nowrap` + `w-full md:w-auto`），小屏垂直堆叠全宽、中大屏水平排列（`index.html`）
- **发版后仍看到旧页面（旧 SW 滞留）**：注册 SW 补 `updateViaCache: 'none'` + 注册后 `reg.update()`

### 测试
- 单元测试 295/295 通过（12 套件）
- 新增 `tests/support-scripts.test.js`（19 项）：内置话术种子契约 6 项（分类合法 / `script_id` 唯一 / 必填非空 / `{RESET_URL}` 写法统一 / 各分类均有话术）+ 请求体归一化契约 13 项（`steps` 换行拆分含 CRLF 与封顶、`buildData` 新建校验、PATCH 部分更新语义——只改传入字段）
- `tests/profile-page.test.js` 税务档案默认公积金基数断言 4250 → 7546

### 文档
- **版本落点由「三处」升为「五处」**：哨兵带来 `index.html` 的 `window.__APP_VERSION__` 与根目录 `version.json` 两个新落点，`branch-release-strategy.md` §3.2 / §4 核对清单同步，并写明漏改的两种后果（不一致 → 每会话清一次缓存；一起漏改 → 自愈失效）
- **发布门禁补上哨兵覆盖**：`ops-check-prod.ps1` 新增 3 项线上校验 —— `__APP_VERSION__` 与本地 `package.json` 一致、`/version.json` 与本地一致、排障短链 `/reset` 命中清洗页而非被 SPA 回退吞成首页（线上指纹 32 → 35 项）；`development-workflow.md` 同步口径（单测 12 套件 295 例、线上 35 项指纹、版本五处）并在排障速查表加入 `/reset` 手法

---

## [1.8.0] - 2026-09-11（内容/公告中心：分层投放 + 定时上线 + 运维后台内容管理）

### 新增
- **内容/公告中心模型**：新增 `ContentItem`（`item_id` 幂等键、`type` = policy/announcement/operation、`audience` = all/free/pro、`placements` 展示位 JSON、`status` = draft/published/revoked、`publish_at`/`expire_at` 时间窗、`priority` 排序、`hot`、`link_url`/`link_text`、policy 专用 `question`/`answer`/`category`/`keywords`）与 `ContentRelease`（`version` 唯一、`notice` 端上提示文案）；生产 PostgreSQL 与本地 SQLite 双 schema 同步，迁移 `20260911_add_content_center`
- **内容分层投放（audience）**：游客仅 `all`；基础版 `all + free`；专业版/体验版 `all + free + pro`。**政策要点（policy）默认面向全体用户（含游客）**，运营内容（operation）/更新公告（announcement）按需逐条选择档位
- **生命周期（定时上线/自动过期）**：条目可预约 `publish_at`（未到时间自动隐藏）与 `expire_at`（到期自动下架），无需定时任务——由端上可见性判定实时生效
- **公开只读端点**：
  - `GET /api/content/tax-policy?since=<revision>`——政策要点（内置 QA 快照之上的增量覆盖层），返回可见条目 + 不可见条目的 `deleted` 墓碑供客户端摘除；`since` 与当前载荷指纹一致时返回空 `items`（增量语义）
  - `GET /api/content/feed?placement=home_banner|modal|notice_list|assistant_qa`——公告/运营内容，按展示位 + 登录态分层返回
  - 两端点均公开只读、可携带 `Authorization` 分层；响应 `revision` 为内容载荷指纹（md5 前 12 位），内容有实质变动才变化
- **`optionalAuth` 中间件**：有 token 挂 `req.user`，无/invalid token 静默放行，供公开但分层的端点使用
- **`contentService`**：audience 解析、时间窗可见性、policy/feed 载荷构建、`revision` 指纹
- **运维后台内容管理**：`admin.html` 新增「内容」Tab（筛选/列表/编辑器：类型、档位、展示位多选、时间窗、优先级、正文）；`admin.js` 提供 `loadContent/saveContent/deleteContentItem/publishContentItems`；管理端点 `GET/POST /api/admin/content`、`PATCH/DELETE /api/admin/content/:id`、`GET/POST /api/admin/content/releases`（全部要求 `X-Admin-Token`）
- **前端内容中心 UI**：新增 `src/js/ui/content-center-ui.js`（`window.ContentCenterUI`）——启动弹窗（`modal` 展示位，本地记已读）、首页公告条（`home_banner`，可关闭、按 `priority` 降序）、个人中心「公告与更新」列表（`notice_list`）
- **`seed-content.js`**：将仓库内 `server/data/content/tax-policy.json` 幂等导入 `ContentItem`，该 JSON 退役为纯种子源（运行时不再读盘）
- **测试**：新增 `tests/content-admin.test.js`（13 项）；重写 `tests/tax-policy.test.js` 为阶段11 语义；`tests/profile-page.test.js` 个人中心卡片 7 → 8（新增「公告与更新」）

### 变更
- **政策要点由「专业版功能」改为「全体用户（含游客）」可见**：`tax-policy.js` 取消免费版短路、游客也发起请求；`plan.js` 的 `PRO_FEATURE_HINT` 与 `auth-ui.js` 多处分层 CTA 文案移除「政策更新」表述
- **`tax-policy.js` 重写为内容中心同步模块**：新增 `syncFeed/getFeed/pendingModalNotices/markModalSeen/homeBannerItem/dismissHomeBanner/noticeList/triggerSync`；`auth-ui.js` 钩子 `triggerPolicySyncIfPro` → `triggerContentSync`（登录/恢复后无条件触发）
- **缓存头安全**：内容端点响应 `Cache-Control: private, no-store` + `Vary: Authorization`，避免 CDN/共享缓存把专业版内容串给游客
- 内容端点不占业务限流配额（`contentLimiter.skip` 覆盖 `/tax-policy`、`/feed`）

### 修复
- **阶段10B 内容缓存丢数据**：旧实现只把 `version`/`notice` 写入 `taxPolicyCache`，刷新后覆盖层内容丢失，且 `since` 恒等于缓存版本导致永不再拉。现改为持久化 `overrides` 并在启动时 `replay()` 重放，配合 `revision` 增量与新鲜期后强制全量，保证撤回/过期即时生效

### 文档 / 门禁
- `verify-local-auth.js` 更新阶段11 前端资源静态断言（内容中心 UI、DOM、auth-ui 钩子、plan.js 去专业版表述）与内容端点断言（`version+revision`、`since` 增量、`private/no-store` + `Vary`、feed、展示位过滤），`request()` 增加响应头回传
- `tools/ops/ops-check-prod.ps1` 线上指纹同步至阶段11（内容中心脚本/DOM、auth-ui `triggerContentSync` + `profile-card-notices`、`tax-policy.js` `syncFeed/triggerSync`、admin 内容 CRUD、`tax-policy` 端点 `revision` + `feed` 端点）
- 新增 `tools/ops/ops-seed-prod.js`：走运维后台 API（`X-Admin-Token`）把 `tax-policy.json` 幂等补种进**生产库**——阶段11 端点改读库后，换新库/重置生产库若不补种，内容端点会返回 `version` 空 + `items=0`，导致线上指纹门禁假失败。`ops-publish.ps1` 在线上核对轮询的间隙自动调用（Token 取 `ADMIN_TOKEN_PROD` 或 `server/.env`；拿不到自动跳过、补种失败只告警不阻断），并新增 `-NoSeedProd` 开关可临时关闭

---

## [1.7.2] - 2026-09-11（汇算清缴口径修正 + 社保基数默认值 + 反向倒算 0 元）

### 修复
- **税前 / 税后年收入口径不一致**：结果页「税前」原取「综合所得收入额」（劳务报酬/稿酬/特许权使用费已按 80%/70% 折算后的金额），而「税后年收入」按税前收入合计扣除税额计算，两者基数不同——含劳务等收入时甚至会算出税后 > 税前。现将「税前年收入」统一为税前收入合计，「税后年收入」扣除综合所得应纳税额与年终奖单独计税税额
- **综合所得汇算「应退/应补」错误**：预缴税额此前默认取输入框的 0，自动推演被跳过，任何场景都显示「应补 = 应纳税额」；且年终奖单独计税税额被误计入综合所得预缴，产生等额虚增退税。现修正为：
  - 预缴税额输入留空（或填 0）时按源泉扣缴规则自动推演：工资薪金累计预缴 + 劳务报酬/稿酬/特许权使用费预缴（这三类所得必然产生预缴税，无综合所得应纳税额时必然退税）
  - 年终奖单独计税税额不计入综合所得预缴，汇算「应退/应补」仅比较综合所得应纳税额与综合所得预缴
  - 「不退不补」改为按浮点容差（差值 < 0.005）判定，避免四舍五入误差误判为应退/应补
- **反向倒算最低档无法得到 0 元应纳税所得额**：3% 档位保守模式此前强制最小 1 元，现允许应纳税所得额为 0 元（0–36000 元均适用 3% 税率）

### 变更
- **社保缴费基数默认值 4250 → 7546**：同步正向计税、反向倒算、经营所得三处表单默认值与重置逻辑，以及税务档案默认社保基数；派生社保金额（养老/医疗/失业）随基数联动为 603.68 / 150.92 / 37.73
- 预缴税额字段提示补充「留空自动估算」说明；从历史记录恢复时不再把自动推演值写回输入框

### 测试
- 单元测试 252/252 通过（`determinePrepaidTax` 用例更新为新口径）

---

## [1.7.1] - 2026-09-11（本地 SQLite 搜索修复 + 门禁 52/52 + 文档口径收口）

### 修复
- **运维后台用户搜索 `GET /api/admin/users?q=` 在本地 SQLite 下 500**：Prisma 的 `mode: 'insensitive'` 不被 SQLite 连接器支持，带关键词的查询会被判为非法参数（生产 PostgreSQL 正常，仅本地开发库暴露）。改为按数据源协议构造查询条件：`file:`（本地 SQLite）走 `LIKE`（本身对 ASCII 不区分大小写），生产 PostgreSQL 保留 `mode: 'insensitive'`，两端搜索语义一致
- **发布脚本自动打标签失效**（`43d09cd`）：`node -p` 传 Windows 反斜杠路径被当转义、PS5.1 按 ANSI 读 UTF-8 导致中文吞引号，version 读不到 → 标签永远被跳过

### 变更
- `verify:local` 扩至 **52/52 通过**（新增 10 项断言）
  - 反馈附图链路：合法 data URL 落库、非图片与超 3 张被拒（400）、用户端与运维后台均能取回附图
  - 阶段10 运维后台用户端点：无令牌 401、列表搜索（大小写不敏感且响应不含密码字段）、详情（反馈/计算计数 + 最近动态）、权益授予限时专业版 → 回落基础版（小节结束时自动恢复 dev 账号种子授权）
- 同步修正 README / 开发工作流 / GUI 文档中已过期的门禁断言数（20/42 → 52）、单元测试套件数（203 → 252）与线上核对项数（10 → 22）
- 版本口径收口：README / 文档中心 / API 参考 / 开发计划 的版本与发布日期同步至 **1.7.1**（此前仍停留在 1.6.1）
- 分支收口：`feature/10a-cloud-sync` 按 [分支规范](./docs/guides/branch-release-strategy.md)「合完删除本地与远程分支」清理本地与远程分支（合入提交 `f33d694`，历史由 tag `v1.7.0` 承担）

---

## [1.7.0] - 2026-09-10（阶段10：免费/专业版体系 + 运维后台）

> 里程碑：M1 后端地基（a29bd12）→ M2 前端同步链路（8f3195a）→ 10B 政策要点与汇算清缴报告 → 运维管理后台 + 反馈附图。
> 核心原则：计税能力永不锁定，锁的是云端增值（历史同步）。

### 新增
- **账户分层模型（阶段10）**：`User` 增 `plan`（free/pro，默认 free）、`plan_expires_at`（null=永久）、`pro_granted_by`（seed/invite/admin/purchase）；生产 PostgreSQL 与开发 SQLite 双迁移
- **种子期专业版授权 `SEED_GRANT_PRO`**：开启后注册/登录即授予 `pro`（`pro_granted_by="seed"`），存量 free 账号登录自动升级；`GET /auth/profile` 返回 plan 相关字段
- **云端历史同步端点 `POST /api/calculations/sync`（专业版）**：按 `(user_id, client_id)` 幂等 upsert + 全量拉取；`updatedAt` 新者胜解决多端冲突；删除以墓碑（`deleted_at` 软删）广播到其它设备，30 天自动清理；云端活跃历史 500 条上限（超限 409 `HISTORY_LIMIT_REACHED`）；免费账号 403 `PRO_REQUIRED`（计税不锁）
- 同步端点限流（20 次/分/IP）、Swagger 文档注释、错误响应带业务 `code` 字段

### 新增 · 前端同步链路（里程碑 2/2）
- **`src/js/auth/plan.js`（PRO 判定模块）**：`window.EuriskoPlan.isPro(plan, planExpiresAt)`——`pro` 且未过期判定，`plan_expires_at` 为 null/畸形值按永久授权容错（种子期 `granted_by=seed`）
- **`src/js/data/history-sync.js`（云同步引擎）**：挂 `window.EuriskoSync`，提供 `restore/afterLogin/afterLogout/updateUser/syncNow/getState`；保存/删除后防抖（1.5s）自动同步；本地 `taxCalculationHistory` 仍为唯一数据源，云端仅镜像；`pure` 子对象暴露纯函数 `normalize/toPayload/mergeCloud`（单测）；墓碑仅对「云端已知 clientId」广播；401 自动登出回登录页、PRO_REQUIRED/HISTORY_LIMIT_REACHED 中文提示、离线失败保留本地自动重试；事件信号 `euriskotax:history-mutated/synced/sync-status`
- **保存/删除挂钩**：`data-management.js` 与 `tax-calculator.js` 保存时写入 `updatedAt` 并派发 `euriskotax:history-mutated`；删除时调 `EuriskoSync.recordLocalDelete`
- **UI 分层呈现（auth-ui.js / index.html）**：顶栏与个人中心 plan 徽标（专业版/免费版）、个人中心云同步状态卡片（免费 gate 提示 / 同步中 / 已同步 / 错误）+「立即同步」按钮；登录成功自动触发同步、登出清理同步元数据、页面恢复防抖拉取（换机/重装找回）；`current_user` 解析 `plan/plan_expires_at`，profile 刷新后更新引擎
- **可测性**：`window.__EURISKO_SYNC_API_BASE__` 覆盖同步 API 地址（沙箱/联调用）；引擎不依赖 DOM 的纯逻辑全部抽到 `pure`，Jest 直接单测

### 变更
- `verify:local` 升级为 6 步门禁：新增前端静态断言（plan/history-sync 脚本、云同步 DOM、保存信号）与**引擎沙箱 e2e**（`server/scripts/verify-cloud-sync-engine.js`：A 设备本端上传 → B 设备空本地拉回），本地 **35/35 通过**
- `npm test` 新增 `tests/plan.test.js`、`tests/history-sync.test.js` 单测套件（幂等/冲突/墓碑/合并/永久授权边界），全套 220/220 通过

### 修复
- `verify-cloud-sync-engine.js` 在 Windows 退出崩溃（退出码 3221226505）：沙箱内改用原生 `http` 轻量 fetch（`agent:false` 连接即用即关），规避 undici keep-alive socket 在 `process.exit` 时触发 libuv `UV_HANDLE_CLOSING` abort

### 新增 · 政策要点更新（阶段10B）
- **政策内容公开端点 `GET /api/content/tax-policy`**：只读静态数据、无需登录、不占业务限流配额（独立宽松 120 次/分限流）；内容源为仓库内 `server/data/content/tax-policy.json`（运维改文件随发布上线、免重启热更新）；`?since=<version>` 版本一致返回空 items（增量语义）；支持 5 分钟内容缓存
- **`src/js/data/tax-policy.js`（政策更新同步）**：专业版登录/恢复会话后静默拉取增量；内置 `window.TAX_ASSISTANT_QA` 快照仍为免费离线全量基准；按 id upsert 合并（覆盖更新 / 新增 / `deleted:true` 撤回），写 `taxPolicyCache` 缓存版本与通知文案；免费版不发起任何请求；触发 `euriskotax:policy-updated` 事件；`window.__EURISKO_SYNC_API_BASE__` 可覆盖 API 地址
- **UI 提示**：tax-assistant 悬浮抽屉顶部「政策要点已更新」提示条（版本前进且未读才显示，可手动关闭、登出/注销随会话清理），登录/恢复钩子（auth-ui `triggerPolicySyncIfPro`）

### 新增 · 专业版汇算清缴报告 PDF（阶段10B）
- **`src/js/export/final-report.js`（`EuriskoReport`）**：专业版报告编排 = 品牌封面（报告标题 + 期间 + 报告对象）→ 收入与税前扣除明细（复用现预算表明细核心）→ 税负对比图（Chart.js 柱状 + 柱顶数值标注，html2canvas 截图前绘制）→ 政策要点/注意事项（从政策库按计算类型挑选）→ 免责声明页；输出 `汇算清缴报告_YYYY-MM.pdf`
- **免费/专业分流**（同一导出按钮）：综合所得与经营所得「导出PDF报告」按钮经 `EuriskoReport.exportFinalReport` 分流——免费/未登录原样保留既有预算表 PDF（无能力倒退），专业版出汇算清缴报告；反向倒算/分类所得按钮保持原样
- `exportToPDF` 支持可选 `opts`（`contentBuilder/beforeCapture/filename`），默认行为完全不变
- `verify:local` 升级到 **42/42 通过**：新增 10B 前端静态断言（tax-policy/final-report 资源与脚本、auth-ui 钩子、tax-assistant 快照）与政策内容端点 e2e（公开内容 + since 增量语义）
- `npm test` 新增 `tests/tax-policy.test.js`、`tests/final-report.test.js`（免费不请求 / pro 增量 / 合并撤回 / 横幅状态 / 文件名规则 / 税负结构 / 政策挑选 / 报告编排冒烟），全套 **252/252 通过（10 套件）**

### 新增 · 账户设置改密改走邮箱验证码

- **账户设置页交互重构**：手机号改为「独立保存」即时生效（部分更新语义，不再依赖页面级提交）；修改密码不再输入「当前密码」，改为复用登录邮箱验证码链路（`POST /auth/send-reset-code` + `POST /auth/reset-password`，60 秒冷却、验证码一次性），与注册/找回密码体验统一
- 移除旧「手机号 + 密码统一提交」遗留的页面底部「取消 / 保存修改」全局条
- 登录成功、退出登录不再弹模态确认框（顶栏用户名/版本徽标、登录页重现即为反馈），减少无意义打断

### 新增 · 运维管理后台（`admin.html`）

- **`admin.html` + `src/js/admin/admin.js`**：独立运维后台页，全请求带 `X-Admin-Token`（= 环境变量 `ADMIN_TOKEN`）；四个 Tab：运营总览 / 反馈处理（含附图预览与状态跟进）/ 用户权益 / 兑换码
- **用户管理端点**：`GET /api/admin/users`（关键词 `q` 匹配用户名/邮箱 + `plan` 过滤 + 分页）、`GET /api/admin/users/:id`（含反馈/计算条数与最近动态）、`PATCH /api/admin/users/:id/plan`（补发 14 天体验 / 按天开通 / 授予永久 / 回落基础版，`grantedBy` 默认 `admin`）

### 新增 · 意见反馈支持附图

- **`Feedback.attachments`**（迁移 `20260909_add_feedback_attachments`）：存前端压缩后的图片 data URL（最多 3 张、仅 png/jpeg/webp、单张 ≤900K 字符），默认 `'[]'` 自动兼容旧数据行
- 提交侧强校验（数量超限 / 类型不符 / 过大一律 400，防脏数据与库容滥用）；反馈日志追加附图张数；管理员反馈列表返回该字段

---

## [1.6.1] - 2026-09-08

### 新增
- **一键缓存清洗页 `clean-cache.html`**：根治旧版 Service Worker / 页面缓存残留导致的"看不到新功能、旧 JS 反复命中缓存"问题；GUI 开发控制台"快速访问"新增一键打开入口
- **弹窗健壮性**：所有通用弹窗（帮助/确认/关于/反馈等）统一挂载到 `body` 顶层，并内联通用弹窗函数，登录页/任意容器隐藏下均可正常弹出

### 修复
- 弹窗嵌套时显示异常（help/confirm/about 等在隐藏的 `app-container` 内无法弹出的问题）
- `ops-check-prod` 修复函数内作用域解析失败导致的崩溃

### 变更
- **登录/注册/找回密码表单文案与校验优化**：注册页必填项标注（未填时标红提示、填写后恢复）；"记住我"等提示改为正式文案；弹窗提示文案统一为正式表述；隐藏尚未实现的微信/QQ 绑定登录 UI
- 用户协议/隐私政策/重置密码提示中的开发者联系邮箱更新为 2044781167@qq.com
- Dockerfile 默认改用 DaoCloud 镜像源，加速构建镜像拉取

---

## [1.6.0] - 2026-09-07

### 新增
- **意见反馈落库闭环**：新增 `Feedback` 表，`POST /api/feedback` 真正持久化（此前仅打日志）；个人中心新增"意见反馈"卡片（登录后可见）：Bug/建议分类 + 1-5 星评分 + 5000 字内容
- **管理员反馈跟进**：`GET /api/feedback/admin?status=` 列出反馈（含提交人信息）、`PATCH /api/feedback/admin/:id` 标记 open/resolved/closed，均走 `X-Admin-Token`
- **匿名计算埋点**：登录用户在保存计算后仅上报"计算类型"（comprehensive/business/classification/reverse），日粒度聚合入 `CalcEvent` 表；不含任何收入/扣除输入数据，失败静默不阻塞、离线不积压
- `GET /api/stats/overview` 的计算次数/今日/类型分布/近7日改读 `CalcEvent` 聚合表（v1.5.1 清理落库死代码后原恒 0），响应结构不变，冷启动每日 curl 观察即刻可用

### 变更
- `requireAdmin`（X-Admin-Token 校验）抽为独立中间件 `middleware/adminAuth.js`，统计/邀请码/反馈管理共用，避免从控制器互相引用
- 埋点接口 `POST /api/stats/events` 单独限流（300 次/10 分钟/IP）
- 隐私政策更正"使用数据"表述：计算记录本地优先、不自动上传；登录后仅匿名统计计算类型/次数（不含具体输入）
- 发布门禁 `verify:local` 扩展 6 项 e2e 断言：反馈落库、用户列表、管理员列表/状态跟进、埋点上报、聚合统计可读

---

## [1.5.2] - 2026-09-06

### 变更
- **SW 缓存策略重构为「网络优先瘦缓存」**（根治旧代码残留 / 需反复手动清缓存）：
  - 移除 install 阶段的应用壳预缓存（`index.html` + 全部自有 JS 不再被快照锁定），SW 不再是某次发布的内容快照
  - HTML 导航 network-first：在线一律返回服务器最新页面，仅真正断网时回退最近缓存的页面 → 解决「登录页点协议/隐私不弹、登录后才弹」等旧页面残留问题
  - 同源 JS/CSS/图片 network-first 并覆写运行缓存（弱网/离线兜底，`ignoreSearch` 兼容历史 `?v=` 请求）；CDN 资源 cache-first；`/api/*` 永不缓存
  - 发版不再需要递增 `CACHE_VERSION`；新 SW 激活时自动清理全部历史版本缓存（老用户无需手动 Unregister + Clear site data）
- `app.js` 动态 import 的 `auth-ui.js` 移除 `?v=3` 指纹：自有 JS 统一走服务器 ETag 协商缓存 + SW network-first（与 index.html 其余脚本一致）
- 发布门禁同步：`verify:local` 与 `ops-check-prod.ps1` 的 SW 断言由「版本号匹配」改为「新策略特征」（无 APP_SHELL 预缓存 / 导航 network-first / 协议守卫）

---

## [1.5.1] - 2026-09-06

### 修复
- **历史记录双轨不一致**：个人中心统计/历史列表原读空的服务端历史（统计恒 0、列表恒空），现与主页统一读本地 `taxCalculationHistory`（唯一数据源）；删除改为本地删除并尽力同步服务器残留；JSON/CSV 导出同源
- 登出/注销清理补 `taxCalculationHistory`（本地历史属当前会话，防换号共用浏览器串数据）；主页各历史视图渲染前统一从 localStorage 同步内存镜像，消除双份缓存展示不一致
- 登录限流仅针对凭证动作：`/profile` 等 JWT 接口豁免（防活跃用户被 10 次/15 分钟配额误锁 429）；限流响应结构与其余错误统一为 `success:false` + `error{message,statusCode}`
- 更新资料（username/email/phone）服务端补格式校验与查重（排除自身），冲突返回明确 400/409 中文提示而非 Prisma P2002→500；邮箱更新与注册一致做归一化存储
- 生产环境 500 不再裸透内部错误详情（日志仍保留堆栈），统一提示"服务器内部错误，请稍后重试"
- Swagger 修正 `verify-password` 请求字段名（`password` → `currentPassword`）
- 清理 `calculationController` 中永不触发的 `if(req.user)` 落库死代码（计算路由无认证中间件，历史数据源在前端本地）

### 变更
- **发布缓存策略根治**：自有 JS/CSS 去掉 1 年 `immutable` 强缓存，改为 ETag 协商缓存；`index.html`/`app.js` 全部脚本移除 `?v=` 指纹，修复无指纹的 ES module import 链路（如 `api-client.js`）被强缓存锁死、老用户长期拿不到新代码的问题（离线兜底由 SW 负责）
- Service Worker 升级 `euriskotax-v6`：同源 JS/CSS 离线回退改为 `ignoreSearch` 兜底（兼容旧带指纹请求）；`auth-ui.js`/`api-client.js` 纳入应用壳预缓存（保证离线可进入登录/个人中心）
- "关于"弹窗与 `package.json` 版本号同步为 1.5.1

---

## [1.5.0] - 2026-09-06

### 新增
- 忘记密码自助找回：登录卡片内嵌"重置密码"面板（验证注册邮箱 → 设置新密码）
  - 后端 `POST /api/auth/send-reset-code`、`POST /api/auth/reset-password`（Swagger 注释齐全）
  - 验证码按用途（register/reset）隔离；重置邮件独立文案；未注册邮箱不发信直接 404
  - 限流：`codeLimiter` 对两个发码端点合并计数（15 分钟 5 次/IP）
- 登录支持"记住我"：勾选 token 存 `localStorage`（跨会话），未勾选存 `sessionStorage`（关浏览器即失效）
- 注册新增协议勾选：必须勾选"我已阅读并同意《用户协议》《隐私政策》"后才能提交
- 协议/隐私弹窗点击即显（不依赖登录）；"关于"弹窗增加协议/隐私入口；ESC、点击遮罩关闭、背景滚动锁定

### 修复
- 协议/隐私弹窗开关统一走 `openModal/closeModal`（淡入淡出 + 滚动锁定 + 状态跟踪），消除旧缓存页面"点链接无反应、登录后才弹"的错乱
- 移除 `index.html` 冗余的静态 `api-client.js` / `auth-ui.js` 模块标签（此前双份加载、版本号不一致）；脚本版本统一为 `?v=4`，SW 缓存升级 `euriskotax-v5`
- `showAlert` 回调改为 `onclick` 直赋去重；补齐帮助/关于弹窗右上角关闭按钮
- 退出登录 / 注销账号时清理本地 `tax_profile`、`calculation_history`，避免换号串数据
- 微信 / QQ 登录按钮点击给出"暂未开放"提示
- 修改注册邮箱 / 重置邮箱后自动清空已填验证码并提示重新获取
- 注册手机号格式校验（`/^1[3-9]\d{9}$/`）
- 服务端补密码最少 6 位校验（注册 / 改密 / 重置），与前端一致

### 变更
- 删除主界面导航中永不显示的 `auth-section`（登录/注册死按钮）及对应空引用处理
- 退出登录后停留登录页（不再误切 `mode-selection-page`）
- 条款更新：用户协议新增"账号安全与注销"（自助找回、自助注销）；隐私政策更新"信息删除与账号注销"与本地存储说明
- "关于"弹窗版本号同步为 1.5.0

---

## [1.4.0] - 2026-09-06

### 新增

- **生产环境上线（v1.4.0 上线计划完成）**：Zeabur（Tencent Tokyo）+ PostgreSQL + HTTPS 正式对外，公网地址 `https://euriskotax.zeabur.app`
  - Prisma 迁移 PostgreSQL（迁移文件 `20260905_init_postgres`），生产 schema 与本地 `schema.dev.prisma`（SQLite）分离
  - 生产环境启动校验：`JWT_SECRET` 必须为强密钥、`DATABASE_URL` 必须指向 PostgreSQL，否则拒绝启动
  - Docker 部署链路：`Dockerfile`（node:22-slim + OpenSSL 修复 Prisma 引擎崩溃）、构建不再排除 images（修复线上 logo 丢失）、迁移锁 provider 修正为 postgresql（修复 P3019）、`index.html` 返回 no-cache（防新旧混搭）
  - 反向代理信任：`trust proxy` 修复 Zeabur 网关后限流把全站算作同一 IP 的问题
- **邀请码系统（一机一码）**：注册邀请码改为 `EURISKO-XXXX-XXXX` 格式（crypto 级随机），每个码仅可注册一个账号、事务内原子消耗
  - 服务启动时若 `InviteCode` 表为空自动兜底生成 20 个（幂等，重启不重复生成）
  - 管理员 API：`GET/POST /api/invites`（`X-Admin-Token` 认证，count 1-100）
  - GUI 开发控制台新增「一键邀请码管理」；生产令牌与本地令牌分离存储
- **注册邮箱验证码**：`POST /api/auth/send-code` 发送 6 位数字验证码（10 分钟有效、60 秒重发冷却、同 IP 15 分钟最多 5 次限流），数据库存哈希；注册需同时提供邮箱验证码 + 邀请码
- **运营统计概览**：`GET /api/stats/overview`（`X-Admin-Token` 认证）：注册数 / 计算次数 / 类型分布 / 近 7 日趋势
- **用户反馈接口**：`POST/GET /api/feedback`（登录后提交 bug/建议/评分）
- **PWA 离线化（阶段 9）**：`manifest.json`（standalone、192/512 + maskable 图标）+ `service-worker.js` v4
  - 应用壳预缓存（离线可打开）、CDN 资源 cache-first、同源 JS/CSS network-first、API 永不缓存
  - 离线检测顶部提示条；SW 更新提示 + 一键刷新；CDN 失败兜底
- **登录注册全流程完善**：用户协议与隐私政策弹窗（inline onclick）、UI 闪现修复、已注册邮箱发验证码时正确提示并引导登录、密码可见性切换图标、初始化遮罩修复
- **单元测试扩充**：新增 `home-page.test.js`（22）+ `profile-page.test.js`（38），总套件 6、总测试 203

### 修复

- fix(deploy): 限流在 Zeabur 反向代理下失效（全站共享配额）——`app.set('trust proxy', 1)`
- fix(deploy): `node:20` 镜像缺 OpenSSL 导致 Prisma 引擎崩溃——基础镜像换 `node:22-slim` + 安装 openssl
- fix(deploy): `.dockerignore` 排除 images 导致线上 logo/图标丢失
- fix(deploy): 迁移锁文件 provider 仍为 sqlite 触发 P3019
- fix(sw): JS/CSS 改为 network-first 策略，彻底解决强缓存导致的加载旧代码问题
- fix(auth): 初始化遮罩不消失、注册 UI 闪现、协议弹窗与事件重复绑定冲突
- fix(stats): 近 7 日趋势日期标签偏移一天
- fix(ops): 健康检查改用 `/health` 端点，避免被登录限流误判为宕机
- fix(gui): 邀请码生产令牌与本地令牌分离存储
- fix(test): `profile-page.test.js` fixture 缺少 auth 重构新增元素（forgot-password/send-code-btn/register-code/register-invite-code/user-name）导致 `setupAuthEventListeners` 抛错——补齐 fixture，203/203 恢复全绿

### 变更

- 注册入口不再接受固定邀请码，全部改为「向开发者获取一机一码」
- 健康检查端点从 `/api/health` 调整语义为根路径 `/health`（非 API，不受限流影响）
- 计算类 API（comprehensive/business/classification/reverse）当前未强制 JWT，历史记录类接口（history/:id）需 JWT

### 文档

- 全量文档同步至 v1.4.0 状态（2026-09-06）：README / docs 索引 / 开发计划 / API 参考 / 测试报告 / 交付清单 / 冷启动素材
- 修正营销素材邀请码文案（固定码 → 一机一码）

---

## [1.3.0] - 2026-08-15

### 新增

- **GUI 覆盖式滚动条 v3.2（精致 macOS 风）**：全面重构 GUI 滚动条，实现 Chromium/VSCode 级别的现代滚动体验
  - **超细**：常态视觉仅 5px，悬停/拖拽柔和增粗到 8px；命中区为完整原生条宽度（DPI 自适应），5px 细条也容易抓取
  - **高透明**：4 档 Alpha 不透明度（静止 0 完全隐藏 / 滚动中 85 / 悬停 155 / 拖拽 210），每帧 35% 收敛插值，无跳变
  - **精致**：胶囊圆角（两端半圆）+ 悬停双层柔光光晕（外层 0.35×alpha + 内层 1×alpha）+ 悬停宽度插值变粗
  - **智能隐藏**：macOS 风格，静止 1.1s 后自动淡出消失，画面干净；滚轮/拖拽/点击/翻页/键盘箭头均触发显示
  - **平滑动画**：60FPS 全局共享定时器，滑块位置 45%/帧收敛 + Alpha 35%/帧收敛 + 宽度 50%/帧收敛，三重插值
  - **白底覆盖**：主动画 Target.BackColor 填满 overlay 区域，彻底覆盖原生滚动条白底（根因修复）
  - **DPI 自适应**：使用 `SystemInformation.VerticalScrollBarWidth` 获取真实原生条宽度，125%/150% 缩放下不再漏白底
  - **滚轮转发**：overlay 捕获 MouseWheel 后直接计算目标滚动位置（跨 32/64 位无差异），避免原生滚轮事件被吞

- **GUI 桌面快捷方式图标优化**：logo 图片放大 1.5× 生成 `logo-zoomed.png`，多尺寸 ICO（256/128/64/48/32/24/16）独立缩放，小尺寸填充率最高 97%
  - 桌面快捷方式和任务栏图标视觉更饱满，不再因原图标空白边距导致显示过小
  - 新增 `Ensure-ZoomedIcoBuilt` 函数：源 PNG 更新后自动重建 ICO
  - 新增 `Invoke-IconCacheRefresh`：清理 `IconCache.db` + 广播 `SHChangeNotify`，强制 Windows 刷新图标缓存

- **GUI 启动器 UTF8 BOM 自动修复**：`EuriskoTax-Console.bat` 启动前自动检测并补充 UTF8 BOM
  - 解决 PowerShell 5.1 中文 Windows 环境下，Edit 工具保存后丢失 BOM 导致中文乱码、270 个连锁解析错误的问题

### 变更

- **GUI 滚动条架构**：从 Dock=Right 布局参与式改为绝对定位覆盖式（v2→v3.2），彻底消除与主内容面板的布局冲突
- **GUI 滚动条变量名规范化**：`$_overlayBgCache` → `$scrollBgBrush`（避免 `$_` 前缀在 scriptblock 中的解析歧义），`$HIT_W` → `$NATIVE_W`，`$THIN_W` → `$STRIP_W`，`$R_PAD` → `$STRIP_RPAD`

### 修复

- fix(gui): 滚动条底色为白色（非透明）的问题 —— 改为主动画 Target.BackColor 覆盖原生条区域
- fix(gui): `Panel.Selectable` 属性不存在（protected）导致运行时报错 —— 移除该行，`TabStop=false` 已足够
- fix(gui): 鼠标在滚动条区域滚轮无法滚动（事件被 overlay 吞掉）—— 直接计算滚动位置替代 SendMessage 转发
- fix(gui): `SystemInformation.VerticalScrollBarWidth` 在某些环境可能抛异常 —— 包裹 try/catch，异常时回退 17px
- fix(gui): `getScrollInfo`/`setScrollY` 在 Handle 未创建时崩溃 —— 增加 `IsHandleCreated` 检查
- fix(gui): 共享动画定时器无异常保护，单个 overlay 崩溃会影响所有滚动条 —— 包裹 try/catch + 自动清理已销毁的 overlay
- fix(gui): UTF8 BOM 缺失导致 PowerShell 5.1 中文乱码（270 个解析错误）—— 启动器自动补 BOM

---

## [1.2.0] - 2026-04-15

### 新增

- **GUI 公网地址速览卡片**：在「🚀 启动管理」Tab 顶部新增「🌐 公网地址速览」卡片
  - 每 3 秒自动刷新最新 cpolar 公网地址，从共享文件 `%TEMP%\euriskotax-last-cpolar-url.txt` 读取
  - 卡片支持一键复制到剪贴板（点击卡片主体即可）
  - 显示地址状态、刷新时间、操作提示（等待 / 已就绪 / 已变更）
  - 地址变更时颜色高亮 + 一键发送最新地址给朋友按钮

- **GUI 事件弹窗通知**：启动/分享期间以下 4 类关键事件会主动弹出 MessageBox 提醒
  1. URL_CREATED（公网地址首次生成）
  2. URL_CHANGED（公网地址变更）
  3. 邮件发送成功
  4. 邮件发送失败/未发送

- **邮件通知事件扩充**：在 notify-templates.json v3.2 中新增 **URL_CREATED** 模板
  - 标题：【EuriskoTax】公网分享地址已生成
  - 与 URL_CHANGED 同样附带新地址 + 测试账号信息
  - notifyOn 新增 `urlCreated` 开关，默认 true（首次分享时自动发邮件）

### 变更

- **cpolar 启动参数统一（临时隧道）**
  - 之前：`ops-start-dev.ps1` 使用 `http 3000 -region=cn`，`ops-watchdog.ps1` 使用 `start eurisko`（依赖用户预设命名隧道，若没配会启动失败）
  - 之后：**两个脚本都统一使用 `cpolar http 3000 -region=cn` 临时隧道**，无需任何 cpolar.yml 预设即可跑通
  - 避免了"GUI 启动分享不会启动 cpolar"的常见坑

- **GUI 弹窗全局 180s 去重（修复重复弹窗 N 次的问题）**
  - 新增 `$script:DedupPopup` + `Test-AllowPopup`：同一事件 key 在 180 秒内只允许弹 1 次
  - URL 首次弹窗的职责划归 `outHandler`；`Update-PublicUrlCard` 只负责"已变化"弹窗（通过 `UrlPopupMode` 与 `PublicUrlLastSeen` 互斥）
  - outHandler 命中 URL 事件后立即写 `PublicUrlLastSeen = $url`，避免后续定时器再误判为变化

- **GUI 子进程输出捕获增强：[GUI-EVENT] 双通道**
  - `ops-start-dev.ps1`、`ops-watchdog.ps1` 对关键事件（公网地址、邮件成功、邮件失败）除了 `Write-Host` 外额外 `Write-Output "[GUI-EVENT] ..."`
  - `RedirectStandardOutput` 与 `RedirectStandardError` 拆到独立文件，避免争用

### 修复

- fix(gui): 【启动 + 分享 + 自动重启 + 朋友联调推荐】按钮因 watchdog 使用命名隧道（eurisko）而 cpolar 起不来的问题（统一为临时隧道）
- fix(gui): URL 首次生成、地址变更、邮件成功/失败等事件重复弹窗 N 次的问题（全局 180s 去重 + 职责互斥）
- fix(gui): Write-Host 的关键信息 GUI 无法捕获的问题（全部改为同时 Write-Output [GUI-EVENT]）

---

## [1.1.0] - 2026-08-07

### 新增

- **悬浮税助手模块（Phase 4）**：全屏可拖拽的浮动按钮（FAB），点击展开半屏抽屉
  - 搜索框支持关键词模糊搜索（问题/关键词/分类/答案全文匹配），关键词高亮标注
  - 搜索联想下拉：focus 时显示历史，输入时实时匹配 Q&A，无匹配时显示空状态
  - 分类筛选：全部 / 综合所得 / 经营所得 / 分类所得 / 反向倒算 / 汇算清缴 / 政策法规，外加"我的收藏"
  - 28 条 Q&A 数据（综合所得 10 + 经营所得 5 + 分类所得 4 + 反向倒算 2 + 汇算清缴 4 + 政策法规 3）
  - 4 个快捷功能：税率表速查、年终奖测算、历史记录、使用帮助
  - 热门问题 chips：自动渲染标记为 hot 的 10 个条目，点击直达对应问答
  - 收藏 / 取消收藏：乐观更新本地 localStorage，后台异步同步到 MockApi
  - 反馈（有用/无用）：三态互斥记录，同类型再点取消，同步逻辑与收藏一致
  - 同步指示器：异步请求进行中按钮显示半透明 + 旋转动画，完成后自动消失
  - 失败回滚：MockApi 返回失败时自动撤销本地乐观更新，UI 恢复原状并打印 ERROR
  - 搜索历史持久化（最多 8 条），支持清空
  - FAB 拖拽支持：Pointer Events 统一点击/触摸，松手自动靠边停靠，位置存入 localStorage
  - 移动端全屏展示，PC 端右侧抽屉；深色模式自适应
  - 相关问题跳转：Q&A 展开后底部栏提供"去综合测算/去经营测算"等跳转入口
  - 键盘操作：Tab/方向键高亮联想项、Enter 执行搜索、ESC 关闭抽屉

- **通用 Mock 工具类（MockClient + Logger）**：封装为独立模块，所有业务模块可直接复用
  - `Logger`：级别过滤（0=DEBUG / 1=INFO / 2=WARN 默认 / 3=ERROR），带时间戳与分支标签
  - `MockClient`：可配置延迟范围（默认 80-200ms）、失败率（failRate）、强制失败次数（failNext）
  - 并发追踪：模块级全局递增 `reqId`，每次 request 发起瞬间分配，写入日志详情用于乱序场景溯源
  - 边界保护：`_latency()` 内置 `Math.max(0, ...)`，`latencyMin > latencyMax` 时不会产出负值
  - 统一请求日志：成功打 INFO、失败打 ERROR，均包含 reqId / payload / status / duration
  - 工厂 API：`Logger.create({ tag, level })` 与 `MockClient.create({ logger, latencyMin, latencyMax })`
  - 加载顺序：在 `index.html` 中放置于业务脚本（tax-assistant-ui.js）之前

- **单元测试扩充**：从 90 个增长到 143 个
  - `tests/tax-assistant.test.js`（35）：悬浮税助手全交互覆盖
  - `tests/tax-assistant-perf.test.js`（12）：高频点击、MockClient 复用、并发 reqId、延迟边界、搜索联想同步性
  - `tests/interaction.test.js`（45）：含参数提示初始化与交互专项
  - `tests/tax-calculator.test.js`（51）：计税核心逻辑（未变）

- **技术复盘报告**：`docs/tech-reports/mock-client-concurrent-logging-retrospective.md`
  - 并发日志乱序问题的成因分析、方案选型对比、最终实现、验证方式、可复用经验

### 变更

- `src/js/ui/tax-assistant-ui.js`：移除内联的 logger 与 MockApi 实现，改为消费全局 `window.Logger` 与 `window.MockClient` 工厂，对外暴露的 `window.TaxAssistant.mockApi` / `logger` 接口保持不变
- `index.html` 脚本加载顺序：新增 `src/js/data/tax-assistant.js`（Q&A 数据）→ `src/js/utils/mock-client.js`（Mock 工具）→ `src/js/ui/tax-assistant-ui.js`（UI 逻辑）
- 生产默认日志级别 `logger.level = 2`（WARN）：INFO 级高频日志静默，仅 WARN/ERROR 保留控制台输出
- 收藏/反馈同步指示器样式微调：`.api-syncing` 类按钮降低不透明度 + 旋转动画，视觉更柔和

### 修复

- 修复 MockClient 并发请求日志无标识导致的乱序溯源困难：引入模块级全局 `reqId`，每条请求发起瞬间分配，日志中清晰可追溯
- 修复 MockClient 延迟配置非法（`latencyMin > latencyMax`）时可能产出负值的边界问题，加入 `Math.max(0, ...)` 夹紧
- 修复 3 个源文件（auth-ui.js / helper-functions.js / app.js）缺少末尾换行的格式问题
- 修复 `src/js/utils/mock-client.js` 文件在某次写入时内容截断（仅剩 45 字节注释）的问题，重写完整文件并通过 `node --check` 语法验证 + 全量 143 测试通过

### 文档

- `docs/reports/test-report.md`：更新至 2026-08-05 / v1.1.0，4 套件 143 通过，新增税助手模块测试章节与浏览器交互验证结果
- `docs/reports/refactor-summary-report.md`：新增 Phase 4 悬浮税助手与 MockClient 工具封装章节
- `docs/reports/final-delivery-checklist.md`：版本升级为 1.1.0，质量验收标准 143/143

### 浏览器端实证（2026-08-05）

- 登录页 → 主页渲染正常：欢迎语 / 今日税感 / 4 种计税模式入口 / 税务提醒 / 小贴士
- 税助手浮按钮：点击展开抽屉，28 条 Q&A、分类标签、热门问题、快捷功能渲染完整
- 搜索联想：输入"年终"同步显示联想下拉 + 实时过滤 + 关键词高亮，不依赖任何异步延迟
- 收藏：乐观更新立即生效，MockApi 后台同步期间指示器动画流畅（80-200ms）
- 失败回滚：`failNext=1` 注入失败 → UI 自动回滚原状 → ERROR 日志含 `reqId`，链路完整
- 日志静默：`level=2` 高频点击控制台仅保留 WARN/ERROR，INFO 被正确抑制

### 已知问题 / 注意事项

- 性能测试用例中存在少量基于时间的断言（如 `< 200ms` / `< 500ms`），在机器高负载的 CI 环境下可能偶发抖动（flaky），非代码缺陷，可通过放宽阈值或稳定机器环境解决
- `backend-integration` 分支的真实登录流程依赖后端服务（localhost:3000），纯静态预览时快速登录会报 `ERR_CONNECTION_REFUSED`，可通过手动写入 `localStorage.auth_token` 等方式绕过以测试纯前端功能
- MockClient 不经过浏览器 Network 面板（非真实 XHR/fetch），排障需通过 Console 的 Assistant 日志 + reqId 追踪

---

## [1.0.0] - 2026-08-03

### 新增

- 综合所得正向计算：工资薪金 / 劳务报酬 / 稿酬 / 特许权使用费，含社保公积金、6 项专项附加扣除
- 经营所得计算：收入 - 成本费用 - 减除费用 6 万，200 万以下减半优惠
- 分类所得计算：利息股息 / 财产租赁 / 财产转让 / 偶然所得
- 反向倒算：三种模式（目标税率 / 目标月薪到手 / 目标税负均衡），二分法求解
- 预览条：每步输入实时更新关键数值（收入 / 扣除 / 税额）
- 步骤导航：进度条指示 + 步骤标题，支持回到指定步骤重算
- 深色模式切换、历史记录、用户鉴权（JWT）、前后端 API 客户端骨架
- 单元测试：3 套件 90 通过，带覆盖率报告
