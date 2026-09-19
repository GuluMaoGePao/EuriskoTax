# 通用多步测算向导 UI 排版规范

<!-- subtitle: 阶段17 的 UI 前置 —— 先把排版钉死，再写通用渲染器 -->

> 版本：v1.0 · 2026-09-18 ｜ 状态：**待评审**（先规划后开工，本文件通过前不写渲染器代码）
> 上游：[`ui-design-spec.md`](ui-design-spec.md) §8 页型 D（多步向导）/ §4.2（覆盖矩阵）
> 下游：[`../development/stage17-full-tax-coverage-plan.md`](../development/stage17-full-tax-coverage-plan.md) 17A-1 ~ 17A-4
> 设计令牌真源：`src/css/tokens.css` ｜ Tailwind 配置：`tailwind.config.js`

> ## ⚠️ 本文不是独立 UI 规范 —— 它是一份**子文档**
>
> 全站 UI 的**唯一权威**是 [`ui-design-spec.md`](ui-design-spec.md)（状态：**✅ 已定稿，开发唯一执行依据**）。
> **本文只负责一件事**：多步测算向导**内部**的排版与区块规格（＝母规范 §8 页型 D 的落地细则）。
>
> 以下议题一律**以母规范为准**，本文不涉及、不覆盖、不重述：
>
> | 议题 | 归属 |
> |---|---|
> | **双端策略**（手机/桌面形态、**768 / 1024 两条解耦断点**、两端定义） | 母规范 §5.1 / §5.2、`ui-ux-master-plan.md` §3.3 / §4.3 —— **本文 §6.0 仅作继承性引用** |
> | 商业模式、客群分层、产品铁律 | 母规范 §2 / §3 |
> | 竞品取舍依据（个税 App / TurboTax / 代账 SaaS / 记账 App 等） | `ui-ux-master-plan.md` §2 |
> | 结果页八段顺序 | 母规范 §9.1 —— 本文 §5.4 是其细化 |
> | 设计取值 | `src/css/tokens.css` |
> | 落地顺序与强制依赖（含「spec 描述符是当前卡点」） | 母规范 §12.7 / §12.8 |
>
> **判据：凡本文与母规范冲突，一律以母规范为准。**
> 已据此订正：§5.4 结果区块顺序（原违反八段）、§6.0 补回双端形态（原被抹平）、§5.7 补录遗漏的硬约束。

---

## 1. 为什么必须先写这份文档

阶段17 要把 App 内多步完整测算从 **4 个扩到 15+ 个**。实测发现两件事，决定了「不能直接开工」：

### 1.1 现有 4 个页面彼此不一致

4 个已上线的完整测算页（`forward` / `reverse` / `business` / `classification`）是从各自版本迭代出来的，**排版是漂移的**：

| 维度 | forward | reverse | business | classification | 结论 |
|---|---|---|---|---|---|
| 步骤条 DOM/类名 | 圆点+连线 | 同 | 同 | 同 | 一致 |
| **步骤切换 JS** | `goToStep` 手写 4 分支 | `showStepByPanes` | 同左 | 同左 | **两套实现** |
| 结果区块总数 | **7** | **4** | **5** | **5** | **不一致** |
| 结果 Hero 区 | 有 | **无** | 有 | 有 | reverse 缺失 |
| 税负进度条 / metric 卡 | 有 | **无** | 有 | 有 | reverse 缺失 |
| 结论/原因/避坑 | 有 | 无 | 无 | 无 | forward 独有 |
| 明细容器 | `<details>` 折叠 | **裸 `flex row`** | `.result-detail-list` | `.result-detail-list` | **4 种写法** |
| **「下一步」配色** | `btn-primary` | `btn-primary` | **`bg-accent`** | **`bg-success`** | **三页三色** |
| 明细表列数 | 9 列 | 7 列 ×4 张 | 3 列 | 3 列 | 无统一 schema |
| 表格是否用 `tax-budget-table` | 用 | **另有一张手写表** | 用 | 用 | reverse 绕开规范 |
| 结果区栅格 span | 图 1+1 / 表 3 | 图 2 / 表 3 | 次卡 2 | 次卡 2 | 各自为政 |
| checkbox 折叠组写法 | 传统 A | 传统 A | **平级 B** | 无 | 两种 |
| 推导链 DOM | 逐字复制一份 | 同 | 同 | 同 | **4 份复制** |
| 推导链生成器 | `buildFormulaSteps` | `build…Reverse…` | `build…Business…` | `build…Classification…` | **4 份手写** |

> 如果照现状再写 11 个页面，这些不一致会变成 **11 倍的债**。

### 1.2 入口层在扩容时会崩

> **本节已于 2026-09-18 逐条对照源码复核**（初版基于二手调研，有 3 处描述不准，已纠正）。

**先说好消息 —— 数据层与渲染函数 100% 就绪**，`tool-registry.js` 已是刻意的**双轨设计**：

| 已具备 | 位置 | 说明 |
|---|---|---|
| `DEEP` 独立数组 | `tool-registry.js`（`deep()` / `deepGroup()` 已导出） | 与 `TOOLS`（20 个 native）**分开存放** |
| `search()` 返回 `{deep, tools, matched}` | `tool-registry.js:1186-1194` | deep 的命中结果**已经算出来了** |
| 每个 deep 已配搜索别名 | `tool-registry.js:1180-1183` | `forward` → 综合所得 正向 年度预算 … |
| `cardHtml(tool, isDeep)` 支持 deep 徽章 | `toolbox-ui.js:159-160` | `<span class="tool-badge tool-badge-deep">` |
| `groupSectionHtml(..., isDeep)` 透传 | `toolbox-ui.js:172-182` | 分组容器已支持 deep 模式 |

**坏消息 —— 唯一断点在 `renderToolbox()`**（`toolbox-ui.js:245-282）：deep 从未进入渲染流。

| # | 问题 | 位置 | 扩容后果 |
|---|---|---|---|
| 1 | deep 组是**静态 HTML**（4 张 `.mode-card`），不参与任何渲染函数 | `index.html:558` 容器 / `566-611` 卡片 | 新增一个 deep 要手写一张卡 + 一个隐藏按钮 |
| 2 | 只遍历 `result.tools` 与 `byGroup()`，**从不渲染 `result.deep`** | `toolbox-ui.js:256-267` | 完整测算**永远不出现在搜索结果与分组里** |
| 3 | `#toolbox-deep` 只做整体显隐，`result.deep` 被当布尔量用 | `toolbox-ui.js:273-280` | 命中 1 个也展示全部静态卡；扩容后要用户自己找 |
| 4 | **切换身份场景时 deep 组强制隐藏**（`!!currentScenario` 短路） | `toolbox-ui.js:277` | 用户一选身份，完整测算集体不可见 |
| 5 | 路由靠隐藏按钮 `tool.id + '-mode-btn'` 反向 click | `toolbox-ui.js:296-301` | 漏写则**静默跳空**（已有 `showPageFn(tool.pageId)` 兜底） |

> **修正说明（相对初版）**：原表述「搜索态完整测算集体消失」不准确。真实行为是：**搜索命中 deep 时整组静态卡全显示（不过滤不高亮），未命中则整组隐藏**；
> 真正更严重的是第 4 条 —— **一切换身份场景，deep 无条件隐藏**，与搜索无关。
> 另外 `toolbox-ui.js` 里调用 `showPageFn(tool.pageId)` 的兜底已存在，所以第 5 条不是致命缺陷，而是「双路并存的坏味道」。

**结论：这一层不需要重写，只需要「接线」** —— 把 `DEEP` 接进 `renderToolbox` 的渲染流（详见 §3.2）。

---

## 2. 设计原则

| # | 原则 | 说明 |
|---|---|---|
| 1 | **一套区域词典** | 结果页的区块必须有固定名字与固定顺序，可选区块只能「缺」不能「改名」 |
| 2 | **复用既有类，不造第三套** | `.card` / `.home-card` / `.form-group` / `.input-field` / `.tax-budget-table` / `.step-indicator` 全部沿用 |
| 3 | **视觉一律服从 token** | 颜色只用 Tailwind 语义类（`bg-primary` / `text-danger`…），禁止裸 hex；z-index 只取 `--z-*` |
| 4 | **先迁移旧页统一，再铺新页** | 与阶段17 的 17B 反向迁移同节奏，UI 规范与迁移**一对一开始** |
| 5 | **每个区块都给出一个确定的 class 串** | 本文件不写「大致如此」，实现时直接抄串 |
| 6 | **移动端表格必须有降级** | 现有唯一的「横向滚动」不足以承载 9 列月度宽表 |
| 7 | **新增样式必须同时写 `.dark`** | 既有约定，`responsive-rules-reference.md` 检查清单第 466 行 |

---

## 3. 信息架构：入口与导航（优先施工项）

### 3.1 目标结构

```
工具页 tools-page
├─ 搜索框（现有，扩展见 3.2）
├─ 身份场景 chip（现有 5 个）
└─ 分区一：完整测算（多步向导）        ← 新增二级导航（按税种 tab）
├─ 分区二：快速计算（原 5 组 + 最近使用）  ← 现有 renderToolbox
```

### 3.2 施工项：改动集中在 `renderToolbox`（对应 §1.2，已按源码复核）

**这是「接线」，不是重写。** 所有渲染函数已就绪，只需在 `toolbox-ui.js:245-282` 动刀：

| # | 现状 | 目标 | 具体改动 |
|---|---|---|---|
| 1 | `#toolbox-deep` 里 4 张静态 `.mode-card` | 删除静态卡，改由 `renderToolbox` 渲染 | 删 `index.html:566-611`；在常规态分支调用 `groupSectionHtml(DEEP_GROUP.name, DEEP_GROUP.desc, R().deep(), true)` |
| 2 | 常规态与搜索态都丢掉 `result.deep` | `result.deep` 进入渲染流 | `toolbox-ui.js:256-267` 两个分支**各补一段 deep 分组渲染**，卡片直接复用 `cardHtml(t, true)` |
| 3 | **切换身份场景时 deep 强制隐藏** | 场景筛选也要过滤 deep | `toolbox-ui.js:277` 删掉 `!!currentScenario` 短路；改为按 scenario 过滤 `result.deep` |
| 4 | 路由反向 click 隐藏按钮 | 不再依赖隐藏按钮 | 确认每个 deep 条目都有 `pageId`，删掉 `${id}-mode-btn`；`openTool` 走 `showPageFn(tool.pageId)` 分支 |
| 5 | 无税种维度 | 新增二级 tab | 新增 `DEEP_CATEGORIES`（映射自 `tax-registry.js` 的 `category`）：全部 / 个税 / 增值税 / 企业所得税 / 附加税印花税 / 社保公积金 / 残保金工会经费 |

**关于二级 tab 的取舍（新出现的问题）**：一旦 deep 涨到 10+ 个，单层分组会变成超长滚动。
但**过早加 tab 是过度设计** —— 现只有 4 个。**建议**：第 5 项**推迟到 deep ≥7 个时再做**，本期只做 1-4 项（接线），让 4 个 deep 先具备可扩展的基础。

### 3.3 卡片排版规范

完整测算卡片（`cardHtml(tool, isDeep=true)`）与速算器卡片**同构**，仅多一枚徽章：

```html
<div class="tool-entry" data-tool-id="vat">
  <div class="tool-entry-icon"><i class="fa fa-shopping-cart"></i></div>
  <div class="tool-entry-body">
    <div class="tool-entry-title">增值税测算<span class="tool-badge tool-badge-deep">多步骤</span></div>
    <div class="tool-entry-desc">一般纳税人 / 小规模三分支</div>
  </div>
  <i class="fa fa-angle-right tool-entry-arrow"></i>
</div>
```

**徽章文案存在历史争议，列为待定决策 D6**（见 §7）—— `cardHtml` 上方注释明确记载：

> 曾经用过「App 内可算 / 网页版 / 深度」这类内部术语，**用户不知道什么是「深度」**，也不知道为什么有的工具会跳走 —— 现在全部内置，角标即可省略。

即项目**已经踩过「用内部术语做徽章」的坑**并有过一次回退。因此「多步骤」徽章**不是可以随手定死的**，需要重新拍板。

`.mode-card` 大方卡（首页推荐位）与 `tool-entry` 列表卡（工具箱）**可以并存** —— 前者是推荐区，后者是列表区，是两个不同的容器，不必二选一。

### 3.4 布局

沿用 `.tool-grid-1`（`toolbox.css:59-76`）：手机单列、`≥768px` 为 `repeat(auto-fill, minmax(260px, 1fr))`。
二级 tab 容器类名 `.tool-tabrow`（新建），`≤640px` 横向可滚、`overflow-x-auto` + `whitespace-nowrap`。

---

## 4. 页面骨架：六区结构

所有多步测算页面统一为六区，**顺序固定**：

```
① 顶栏      .calc-sticky-header  （返回 + 标题 + 保存/重置）
② 步骤条    .step-indicator
③ 表单区    .step-content > .step-pane > .card
④ 预览条    .calc-preview-bar     （阶段性数值，随表单实时更新）
⑤ 结果区    #xx-result  （见 §5.4 区块词典）
⑥ 免责区    .result-disclaimer    （必须有，受 ui-result-compliance.test.js 守护）
```

> **层级澄清**：以上六区是**页面级**容器骨架；结果区（⑤）**内部**另有自己的段落顺序，
> 那一段以 `ui-design-spec.md` §9.1 **八段**为准（本文 §5.4 是其细化）。
> 其中免责声明在母规范里是八段之 **⑧**（位于结果区内部），本文 §4 把它单列为 ⑥ 仅为强调其不可省 ——
> **归属以 §5.4 为准**。

骨架串（以原 `forward-calculation-page` 为基准写下的，其余各页向其对齐；
**v1.46.0 → v1.50.0 四次迁移后四个页面式 deep 全删了** ——
本文保留这段，是因为 P15 通用向导仍在沿用同一套 class 而不是另写一套
（`has-preview-bar` / `.calc-preview-bar` 随最后一张常驻预览条在 v1.50.0 一并删除）：

```html
<div id="xxx-calculation-page" class="page hidden has-preview-bar">
  <div class="calc-sticky-header"><div class="max-w-5xl mx-auto">
      <div class="calc-top-row">…<button class="calc-back-btn"></button></div>
      <div class="step-indicator"><!-- ② --></div>
  </div></div>
  <div class="calc-preview-bar"><!-- ④ --></div>
  <div class="step-content max-w-5xl mx-auto"><!-- ③ 与 ⑤⑥ 并列 --></div>
</div>
```

**卡片之争**：`.card`（向导正文，`px-6 pt-6 pb-4 rounded-lg`）与 `.home-card`（列表页，`px-4 sm:px-5 rounded-xl`）。
→ **决策：向导页正文统一 `.card`**，速算器继续用 `.home-card`。

> ⚠️ 初版本行误称「`.card` 缺 `.dark` 变体、需补」—— 实为**已存在**（`tailwind.src.css:809-811`）。
> 该错误在同一文件里出现过 3 处，上一轮只修了 §7-D2 与 §8-⑩，**此处为漏改**，现已订正。

---

## 5. 分区排版规格

### 5.1 步骤条

**沿用** `.step-indicator / .step / .step-number / .step-title / .step-line` + `.active / .completed` 三态（`tailwind.src.css:138-177`），**不另写一套**。

- 步数 ≤5 时全显；>5 时改为「当前步 N/总步数 + 右侧下拉跳步」。
- ~~**禁止直接删除 `goToStep`**~~ → **已于 v1.49.0 删除**（原初版表述有误，下面两稿也是）：
  `goToStep` 是**不带 pageId** 的综合所得专用函数，随该页删除；在此之前 `showStepByPanes`
  已先落地，上面列的三个依赖方（草稿 / Tax助手 / 页面联动）逐个迁走后才动手删的：

  | 依赖方 | 结局 |
  |---|---|
  | `draft-store.js` 的 `gotoName: 'goToStep'` | forward 条目随页面摘掉（留一个指向不存在容器的条目只会静默 return false） |
  | `app.js` 的 `goToStep(1..4)` | 6 处随页面接线一并删除 |
  | `helper-functions.js` / `data-management.js` / `tax-assistant-ui.js` | 分别改为向导入口（`EuriskoDeepWizard.open`） |

  **新增 deep 页面一律用带 `pageId` 的统一入口**：`showStepByPanes`（页面式）或 spec 的 `steps`（向导）。
- `≤640px` 隐藏非当前步标题（既有规则，保留）。

### 5.2 表单区

沿用 `.form-group` + `.label` + `.input-field`，**保留单位后缀写在 label 文本里**（如 `劳务报酬所得 (元/年)`）—— 这是 4 页仅有的完全一致的约定，**不为改而改**。

```html
<div class="form-group">
  <label for="labor-income" class="label">劳务报酬所得 (元/年)
    <span class="tooltip ml-1" data-hint="forward_labor">
      <i class="fa fa-info-circle text-gray-400"></i><span class="tooltip-text"></span>
    </span></label>
  <input type="number" id="labor-income" class="input-field" value="0" min="0" step="1000">
</div>
```

清理项：`mb-5` 不再散写在 `form-group` 上（间距由 `.form-group` 自身负责）。

### 5.3 复合控件（现状两种写法，须二选一）

| 控件 | 现状 | 统一为 |
|---|---|---|
| checkbox 折叠组 | forward/reverse 用 `label > input + span`；business 用平级兄弟 + `text-accent` | **统一 `label.inline-flex > input.form-checkbox.text-primary + span.ml-2`**，即 forward 写法 |
| 结果区外挂卡（方案对比） | 曾仅综合所得页有（页面里的静态 HTML） | ✅ **v1.51.0 已统一**：spec 声明 `toCalcInput` 的工具才由渲染器挂卡片（宿主位 `#dw-scenario-host`，在 `result-actions` 之后）；**取数由 spec 提供**（forward 与 `compute` 共用 `forwardCalc`），渲染器不另写一份「向导值 → 计税入参」；卡片内部只用容器内的 class 定位，不占全局 id |
| 动态条目列表 | 曾仅 classification 有（`#classification-items-list`） | ✅ **v1.50.0 已统一**：`data-dw-repeater` 容器，由 spec 的 `type:'repeater'` + `itemFields` 驱动（`deep-wizard-ui.js`：`repeaterHtml` / `bindRepeater` / `repCollect`，加删按钮 `#dw-rep-add-<key>` 与 `[data-dw-rep-remove]`；控件 id `qf-<key>-<下标>-<子键>`，仍复用 `fieldHtml` 与条件显隐，**不另写一套类型转换**；默认值走 `default: [ { … } ]`） |

### 5.4 结果区区块词典（本文件的核心）

> ⚠️ **本节是 `ui-design-spec.md` §9.1「八段顺序（不许调整）」的细化，不是替代。**
> 母规范八段是**全站结果页模板**（涵盖速算器与向导页）；本节只允许在八段的**槽位之间**插入 deep 专属增强区块。
> **两者如有冲突，一律以母规范 §9.1 为准。**

**母规范八段 ⇄ 本词典映射（八段相对顺序不可改变）**

| 母 §9.1 | 段名 | 本词典区块 id | 必选 | 默认状态 | 现状 / 说明 |
|---|---|---|---|---|---|
| ① | 金额 Hero | `result-hero` | ✅ | 展开 | reverse **缺**，必须补；手机须第一屏可见 |
| ② | 结论（应退/应补/不退不补） | `result-conclusion` | ✅ | 展开 | **♿ 必须带文字，禁止只靠红绿区分**（约 8% 男性色觉障碍，母 §9.2 / §13） |
| ③ | 一句话理由 | `result-reason` | ✅ | 展开 | 「为什么会这样」 |
| ↳ | *deep 增强槽 A* | `result-taxbar` / `result-metrics` | 可选 | 展开 | 插在 ③ 之后、④ 之前 |
| ④ | 推导链 | `formula-steps` | ✅ | **手机**折叠 / **桌面**展开 | 4 页 DOM 四份复制，必须抽共用渲染；分端依据见 §6.0 |
| ⑤ | pitfalls 易错口径 | `result-pitfall` | ✅ | **不折叠**（两端皆然） | 信任来源 + 传播素材；现仅 forward 有 |
| ⑥ | 明细 | `result-detail` | ✅ | **手机**折叠 + 记住展开状态 / **桌面不折叠** | reverse 用裸 flex，须改 `.result-detail-list`；分端依据见 §6.0 |
| ↳ | *deep 增强槽 B* | `result-chart` / `result-budget-table` / `result-advice` / `result-threshold` / `result-compare` | 可选 | 视区块 | 插在 ⑥ 之后、⑦ 之前 |
| ⑦ | 下一步（互链 / 保存 / 导出） | `result-actions` | ✅ | 展开 | 4 页完全一致 |
| ⑧ | 免责声明 | `result-disclaimer` | ✅ | 展开 | 受 `ui-result-compliance.test.js` 守护；文案统一见母 §12.6 |

**必选 8 项（＝母规范八段，缺一不可）**：`result-hero` `result-conclusion` `result-reason` `formula-steps` `result-pitfall` `result-detail` `result-actions` `result-disclaimer`
（原「必选 5 项」口径作废 —— 见下方修正说明）

> **相对初版的三处修正（重要）**：
> **① 顺序违反母规范** —— 初版把 `result-detail` 排在第 4 位、`conclusion/reason/pitfall` 排在其后，
> 而母规范是「④推导链 → ⑤pitfalls → ⑥明细」。若照初版实现，并用本文 §8 断言②「顺序必须递增」钉住，
> **等于用自动化守护把一个违反母规范的顺序固化下来** —— 这是本次审查发现的最危险的一处。现改为上表顺序。
> **② 误降为可选** —— `conclusion` / `reason` / `pitfall` 在母规范里是八段之一，初版标「可选」不当，
> 且 §9.2 明确 ②结论是**无障碍硬约束**。现升级为必选，其余三个 deep 页需按 17B 节奏补齐。
> **③ 缺默认展开状态** —— 初版未规定折叠行为；现按母规范补齐（推导链折叠 / pitfalls 不折叠 / 明细折叠且记住状态）。

### 5.5 结果区栅格（消灭 span 混乱）

统一三档，**只允许这三个值**：

```html
<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
  <div class="lg:col-span-1"><!-- 主结果卡：hero + taxbar + metrics + detail + conclusion --></div>
  <div class="lg:col-span-2"><!-- 辅助区：chart / advice / threshold / compare --></div>
  <div class="lg:col-span-3"><!-- 全宽：预算表 --></div>
</div>
```

现状偏离（迁移时对齐）：reverse 的图表卡 `col-span-2` → 并入辅助区；business / classification 的次卡 `col-span-2` → 同上；forward 的两张图卡 `col-span-1 ×2` → 改为辅助区内两卡纵向堆叠。

### 5.6 明细表

统一 `.tax-budget-table` 包在 `.overflow-x-auto` 内（`tailwind.src.css:186-208`）。
**reverse 那张绕开规范的手写表（`index.html:2514`）必须改回来。**

定义三种标准表，由 spec 的 `tables[]` 声明 `kind`：

| kind | 说明 | 样例 |
|---|---|---|
| `ledger` | 月度/按期累计表，首列为主标题列 | forward 9 列月度表 |
| `matrix` | 多方案对照表，首列为行标签、各列为一个方案 | reverse 的保守/均衡/进取三方案 |
| `keyvalue` | 项目/金额/说明 键值表 | business / classification 的 3 列表 |

### 5.7 推导链

DOM **只保留一份**（由渲染器生成，删掉 4 份逐字复制的 `details`）。
渲染继续走 `utils.js:1547 showFormulaStepsPanel()` + step schema（`title / rows[{label,note,value,format}] / totalLabel / totalValue / footnote`）—— **这部分已经在复用，是好设计，保留**。
4 个手写 builder（`buildBusinessFormulaSteps` 等）改为由 spec 的 `derivation[]` 数据驱动。

### 5.8 操作栏

```html
<div class="mt-6 flex flex-col md:flex-row gap-3 justify-between items-stretch md:items-center">
  <button class="btn bg-gray-200 text-gray-700 hover:bg-gray-300 whitespace-nowrap w-full md:w-auto">
    <i class="fa fa-arrow-left mr-2"></i>上一步</button>
  <div class="flex flex-col md:flex-row gap-3 w-full md:w-auto">
    <button class="btn bg-gray-200 text-gray-700 hover:bg-gray-300 whitespace-nowrap w-full md:w-auto">重置</button>
    <button class="btn btn-primary whitespace-nowrap w-full md:w-auto">下一步 <i class="fa fa-arrow-right ml-2"></i></button>
  </div>
</div>
```

> **「下一步」统一 `btn btn-primary`**。现状 business 用 `bg-accent`、classification 用 `bg-success` —— 同一产品的同一动作三种颜色，属于明确的视觉缺陷，本次统一。

结果页三按钮（保存 / 导出 PDF / 导出 Word）**现状 4 页已完全一致**，作为不变项保留。

### 5.7 从母规范继承的硬约束（初版**全部遗漏**，现补录）

以下出自 `ui-design-spec.md`，本文必须服从，**不在此重述实现方式**：

| # | 约束 | 出处 | 落地要求 |
|---|---|---|---|
| 1 | **History 策略**：`history.pushState` 使「上一步」与系统返回语义一致；**绝不允许系统返回 = 退出应用** | 母 §8 页型D 配套 3 | 每个向导必须注册返回栈 → 列为新页准入项 |
| 2 | **草稿三项合规**：明示 + 可一键清除 + **未登录态不上传**（草稿含收入/五险一金，属个保法敏感个人信息） | 母 §8 页型D 🔒 | `draft-store` 必须对外提供一键清除入口 |
| 3 | **降输入成本**：合理默认值 + 上年结转预填 + 非必填可跳过 | 母 §8 页型D 配套 1 | spec 字段须声明 `default` / `optional` |
| 4 | **♿ 退/补禁止只靠红绿区分**，须同时有「应退 / 应补」文字 | 母 §9.2 / §12.6 / §13 | 已并入 §5.4 第②段，`result-conclusion` 因此升为必选 |
| 5 | 金额建议用 `<output>` 或带 `aria-live` | 母 §12.6 | Hero 区块实现要求 |
| 6 | 免责文案统一为「本测算结果仅供参考，不构成税务建议；实际纳税请以税务部门核算为准。」 | 母 §12.6 | `result-disclaimer` 固定文案 |
| 7 | **分步必须允许跳到目标字段**（弃 TurboTax 的强制顺序） | 母 §8 页型D「❌ 弃」 | §5.1 的下拉跳步即为此服务，**不许退化成线性向导** |
| 8 | 进度用**点位**，不用百分比 | 母 §8 页型D | §5.1 的「N/总步数」仅是 >5 步时的**次要补充**，主形态仍为点位 |

**母规范验收口径（§13）同样适用于本文**：触摸区 ≥44px（＝本文 §6.2②，两边口径一致）、设备矩阵 6 档、
PWA standalone 无死胡同、任取一工具须能沿推导链逐级核对到政策依据、退/补不只靠颜色。

---

## 6. 响应式与暗色

### 6.0 双端硬边界（**本节优先级高于 6.1–6.3，凡冲突以此为准**）

> ⚠️ **本节为 2026-09-18 补录。** 上一版把响应式写成了「一套 UI + `≤640px` 降级清单」，
> **把桌面端的形态差异抹平了** —— 这违背了项目早已定稿的**双端设计**。
> 来源：`ui-ux-master-plan.md` §3.3 / §4.2 / §4.3 / §5.3；`ui-design-spec.md` §5.1 / §5.2。

**两条解耦的断点**（不是传统的三段式）：

| 维度 | 断点 | 切换什么 |
|---|---|---|
| **导航形态** | **768px** | 底部 3 Tab ⇄ 顶部 Tab 行 |
| **内容形态** | **1024px** | 单列全宽 ⇄ 多列网格 / 1024px 限宽 |

**两端形态矩阵（硬边界，不许交叉）**：

| 维度 | 手机端 | 桌面端 |
|---|---|---|
| 导航 | 底部 3 Tab + FAB 悬浮助手 | 顶部 Tab 行（≥768）+ 助手推开式侧栏（≥1280） |
| 输入 | **引导式分步，一次一问** | **完整表单，同屏可见** |
| 结果 | **结论优先 + 明细折叠** | **输入与结果同屏** |
| 容器 | 单列，全宽 | `--c-default` 1024px 限宽 |
| 输出 | 分享图（传播） | 导出 CSV / PDF、打印（交付） |

**两端共享三件事**（防漂移锚，与 §4.2「设计取值」同脉）：
1. **同一份导航状态** —— `syncNav()` 一份状态驱动两端 DOM，新增导航项**只改一处**，不许两端各写一套；
2. **同一套设计令牌** —— `tokens.css`；
3. **同一套内容** —— 桌面**不提供手机没有的功能**，只提供手机**做不好**的呈现方式。
   > 一旦桌面开始长手机没有的功能，就等于在养第二套产品。

**由此修正本文前述规定**：

| 项 | 上一版（错） | 现在（正确） |
|---|---|---|
| `result-detail` 明细 | 一律默认折叠 | 手机折叠 + 记住状态；**桌面不折叠**（§4.2「信息密度」要求结果表不折叠） |
| `formula-steps` 推导链 | 一律默认折叠 | 手机折叠；**桌面默认展开**（满足「输入与结果同屏」） |
| 表单区 §5.2 | 只给一套写法 | **手机一次一问；桌面完整表单同屏** |
| 结果区栅格 §5.5 | 只说 `lg:` 三档 | `lg:` 档承载的正是桌面三要素，须与 §4.2 对齐 |

> 🚫 **已明确否决、不许复活的形态**：桌面「左输入 / 右结果」主从双栏。
> 很多人看到「桌面输入与结果同屏」会立刻去做左右分栏 —— **那条已被否决**（过不了商业筛子、改动面过大、收益可被局部对照替代），
> 理由见 `ui-ux-master-plan.md:505-511`。正确做法是**结果区整体下移但仍在一屏内**，不是左右分栏。

### 6.1 沿用既有硬规则（`responsive-rules-reference.md`）

| 规则 | 出处 | 向导落地方式 |
|---|---|---|
| 步骤按钮组 `≤640` 竖排、`md:` 横排 | 规则 5.1（:387-398） | §5.8 的 class 串即为标准答案，`flex-col → md:flex-row` + `w-full md:w-auto` + `whitespace-nowrap` |
| 移动端 input `min-height: 40px` | 规则 2.5（:82-89） | 沿用 `.input-field`，不额外写高 |
| iOS 防缩放：input 字号 **16px** | 规则 4.7（:283-293） | 所有 `input-field` 不得被覆盖为更小字号 |
| `≤640` 卡片圆角收紧为 8px | 规则 2.6（:91-98） | 对应 `--r-card-sm` |
| z-index 只取 `--z-*` | `tokens.css:112-120` | 步骤条/预览条用 `--z-sticky: 30` |
| 静态类名不许用 `${}` 拼接 | 检查清单 :465 | 渲染器拼 class 时只能整串拼接，不许拼具名类名片段 |

### 6.2 需要本次**新定**的两条

**① 宽表移动端降级（现有项目无此约定）**

现状唯一手段是横向滚动 + `min-width`（forward 的 9 列表甚至放宽到 900px）。新规范分档处理：

| 情况 | `≤640px` 方案 |
|---|---|
| `ledger` / `matrix` 表（列多） | **冻结首列**（`position: sticky; left: 0` + 背景不透明）+ 横向滚动 |
| `keyvalue` 表（3 列，窄） | 直接横向滚动即可，无需冻结 |
| 任意表，若行数 ≤6 且列数 ≤4 | 允许降级为 `.repeat-card-list`（每行一张 mini 卡），由 spec 声明 `mobileCard: true` |

> 这条要**同步写进 `responsive-rules-reference.md` 第 5 节**，否则又是「文档没有、实现先跑」。

**② 触摸目标高度**

文档写「≥44×44」，实际实现到处是 36px（`w-9 h-9`）。本次明确：**向导内的主操作按钮（上一步 / 下一步 / 保存）`min-height: 44px`**；图标类次要按钮维持 36px。**以 44 为准，不再含糊。**

### 6.3 暗色模式

机制沿用（`html.dark` + localStorage，非 media query）。新增两条硬约束：

1. **每新增一条样式必须同时写 `.dark` 前缀**（既有约定）；
2. ~~「给 `.card` 补 `.dark` 变体」~~ —— **本条作废**：`.dark .card` **已存在**（`tailwind.src.css:809-811`），初版误判。
   该误判在本文件共出现 **3 处**（§4、§6.3、§7-D2），现已全部订正；此处保留删除线而非直接抹去，避免日后又被当成待办捡回来。

---

## 7. 待定决策点（需要拍板，默认结论已给出）

| # | 议题 | 现状 | **默认结论** |
|---|---|---|---|
| D1 | `tokens.css` 的 `--c-*` 是否接入 Tailwind | 未接（`tokens.css:13` 标 ⏳），与 `tailwind.config.js` 的 hex 是**两份镜像**，且 `tokens.css:20` 自陈要求「改色必须两边同步」 | **本次不接**。但真实原因需更正 —— 不是「成本高」，而是 `tokens.css:18-19` 的自陈：**没有视觉回归**。全站几十处 `/50 /90` 透明度修饰符一旦颜色不对，**纯 DOM 断言看不出来，只能靠人眼翻**。<br>⇒ 因此 §8 断言⑨（双源 hex 一致）只能防「忘记同步」，**防不住「视觉错位」** —— 这是本次必须显式承担的残留风险 |
| D2 | `.card` vs `.home-card` 两套卡片 | 并存。**初版误判「`.card` 无暗色变体」，实为已有**（`tailwind.src.css:809-811`），已修正 | **向导用 `.card`，速算器用 `.home-card`**，各司其职；**无需补暗色** |
| D3 | 移动端宽表 | 只有横向滚动 | 冻结首列 + 可选卡片降级（§6.2①） |
| D4 | 触摸高度 | 文档 44 / 实现 36 | 主操作 44，次要图标 36（§6.2②） |
| D5 | 视觉回归 | 全项目无（`tokens.css:18-19` 自陈） | 补最小守护（见 §8），不追求截图级回归 |
| **D6** | **deep 卡片要不要徽章、写什么** | `cardHtml` 的 isDeep 分支当前输出「多步骤」，但**函数上方注释记载团队曾因「用户不懂内部术语」而废除过类似角标** | **默认：本期沿用「多步骤」**（需制作更多信息层级时再议），但**必须先把这段历史争议写进代码注释**，否则下次又会有人改回去 |

---

## 8. 验收与守护（要新增的静态断言）

`responsive-rules-reference.md` 的规则 2.5 / 2.6 / 2.10 / 5.1 **目前全部无测试守护**，只有 `tests/task-mode.test.js` 守了 `≤640` 边界。本次随 UI 规范落成同时补齐：

| 新增断言 | 守护内容 |
|---|---|
| ① 结果页区块字典 | 每个 deep 页必须含 **8 个**必选区块 id（＝母规范 §9.1 八段）：`result-hero` / `result-conclusion` / `result-reason` / `formula-steps` / `result-pitfall` / `result-detail` / `result-actions` / `result-disclaimer` |
| ② 区块顺序 | 上述 8 项的出现顺序必须递增，**且须与母规范 §9.1 同序**。特别地：`result-detail` 必须排在 `formula-steps` 与 `result-pitfall` **之后**、并位于 `result-actions` 之前 —— 初版该顺序是反的，本条专防复辟 |
| ③ 「下一步」配色 | 所有向导的下一步按钮 class 必须含 `btn-primary`，出现 `bg-accent` / `bg-success` 即红 |
| ④ 明细容器 | 明细区必须含 `.result-detail-list`，出现裸 `flex justify-between` 明细写法即红 |
| ⑤ 宽表封装 | `tax-budget-table` 必须被 `.overflow-x-auto` 包裹；出现非 `tax-budget-table` 的结果表格即红 |
| ⑥ 推导链去重 | `index.html` 里只允许存在一处 `formula-steps-panel` 模板（现 4 份） |
| ⑦ step 切换单一实现 | 只允许 `showStepByPanes` 一处实现，`goToStep` 内不许再有针对 pageId 的分支 |
| ⑧ 步骤按钮组响应式 | 每个向导不少于 1 处 `flex-col md:flex-row` + `whitespace-nowrap` |
| ⑨ 色值双源一致 | `tailwind.config.js` 的 hex 集合必须与 `tokens.css` 的 `--c-*` 取值一致 |
| ⑩ **入口层接线守卫**（本次新增，针对 §1.2 的核心 bug） | `renderToolbox` 函数体内必须出现对 `result.deep` 或 `R().deep()` 的**渲染调用**（仅做 `classList` 判定不算），防止 deep 再次掉出渲染流 |
| ⑪ `goToStep` 兼容层 | `draft-store.js` 的 `gotoName` 若变为函数名以外的形式，`goToStep` 必须仍作为全局函数存在——断言 `window.goToStep` 可导出且 `draft-store` 引用同名字符串 |

> 说明：项目缺视觉回归（`tokens.css:18-19` 已自陈），所以**只能靠 DOM/源码断言**。这组断言是本次 UI 规范能被长期遵守的唯一机械保障 —— 没有它，规范文档三个月内就会漂。

---

## 9. 迁移清单：现有 4 页 → 新规范

| 页面 | 必改项 |
|---|---|
| `forward` | ① 两图卡由 `col-span-1 ×2` 改为辅助区 `col-span-2` 内堆叠；② `goToStep` 改调 `showStepByPanes`；③ 推导链 DOM 改由渲染器生成 |
| `reverse` | ① **补 `result-hero` / 税负条 / metric 卡**（现无）；② 裸 flex 明细改 `.result-detail-list`；③ 手写对比表（`:2514`）改 `tax-budget-table` 的 `matrix` 型；④ 图表卡 `col-span-2` 并入辅助区 |
| `business` | ① checkbox 组改统一写法；② 次卡 `col-span-2` 并入辅助区；③ 下一步由 `bg-accent` 改 `btn-primary` |
| `classification` | ① 动态条目列表升为通用 `.repeat-list`；② 次卡并入辅助区；③ 下一步由 `bg-success` 改 `btn-primary`；④ 推导链 builder 改数据驱动 |

**入口层**：`index.html:564-613` 的 4 张静态卡 → 由 `renderToolbox` 渲染 + 税种二级 tab；修正 §1.2 的 5 个必炸点。

---

## 10. 变更记录

| 日期 | 变更 | 决策 |
|---|---|---|
| 2026-09-18 | 新增《通用多步测算向导 UI 排版规范》，状态：待评审 | 用户要求「先把 UI 设计排版都规划好再开工」。起因：核心战略确认为「App 内多步完整测算扩到 6 类税种 + 个税做深」，而现有 4 个 deep 页面排版彼此漂移（结果区块数 7/4/5/5、下一步按钮三页三色、推导链 DOM 四份复制），入口层的 deep 组还是 4 张手写静态卡、搜索态会集体消失 —— 直接照现状扩写会放大成 11 倍技术债 |
| 2026-09-18 | **源码复核纠偏（评审产出）** | 初版有 6 处断言基于二手调研、未经源码验证，逐条复核后修正：<br>**①** 「搜索态完整测算集体消失」表述不准 → 实为 `renderToolbox` 从不渲染 `result.deep`，且**切换身份场景时 deep 无条件隐藏**（后者更严重）；<br>**②** 误判 `.card` 无暗色变体 → `tailwind.src.css:809` **已存在**，删除对应改进项；<br>**③** 「删掉 `goToStep` 改调 `showStepByPanes`」→ **危险**：`draft-store.js:30` 按函数名字符串恢复草稿，`app.js` 等 9 处调用均不带 pageId；改为**保留兼容层**；<br>**④** D1 不接 tokens 的理由「成本高」→ 应为 `tokens.css:18-19` 自陈的**没有视觉回归**；<br>**⑤** 徽章定「多步骤」→ 与 `cardHtml` 注释记载的历史争议冲突，降级为 **D6 待定**；<br>**⑥** 发现 **数据层与渲染函数 100% 就绪**（`DEEP` 数组 / `search` 返回 / `cardHtml(t,true)` / `ALIASES`），§3.2 因此从「五处必修」改为「**接线手术**，集中改 `renderToolbox` 一处」，并建议二级 tab **推迟到 deep ≥7 个时再做** |
| 2026-09-18 | 移动端宽表定为「冻结首列 + 可选卡片降级」，触摸高度明确取 44px | 原项目这两处**无约定**（只有横向滚动；文档写 44 而实现到处 36），属本次新定，须同步回写 `responsive-rules-reference.md` |
| 2026-09-18 | **与母规范 `ui-design-spec.md` 对齐（第二次评审产出）** | 发现母规范 §14 已把本文登记为「§8 页型 D 的落地排版规格」，故本文是**子文档**，冲突一律由母规范裁决。据此修订：<br>**① 最高危 —— 结果区块顺序违反母规范 §9.1 八段**：初版把 `result-detail` 排在第 4 位、`conclusion/reason/pitfall` 排其后；母规范为「④推导链→⑤pitfalls→⑥明细」。若照初版实现并用本文断言②「顺序递增」钉住，**等于用自动化固化违反母规范的顺序** → 已改为八段映射表，断言②改为专防复辟；<br>**②** `conclusion`/`reason`/`pitfall` 由「可选」升为**必选**（②③ 是八段，且结论「退/补不只靠颜色」是 ♿ 硬约束）→ 必选数 5 → **8**；<br>**③ 补录初版完全遗漏的 8 条母规范硬约束**（新增 §5.7）：History pushState 禁「返回=退出应用」/ 草稿三项合规（个保法敏感信息）/ 降输入成本 / ♿ 退补不只靠颜色 / `<output>`+`aria-live` / 免责统一文案 / 允许跳步 / 进度用点位；<br>**④** `.card` 缺暗色的误判在同一文件实为 **3 处**（§4 / §6.3 / §7-D2），上一轮只修了 2 处 → 已全部订正，§6.3 保留删除线以免日后捡回；<br>**⑤** §4 增加层级澄清：六区是页面级，八段是结果区内部，免责归属以 §5.4 为准；<br>**⑥** 校验 §6.2② 的 44px 与母规范 §13 验收口径一致 ✓ |
| 2026-09-19 | **新增「结果区外挂卡」的挂载约定（v1.51.0）** | 页面式 deep 归零后，「方案对比」卡是唯一**宿主与数据源一起没了**的功能：它靠 `collectTaxInputData()` / `collectDeductionInput()` 按 id 读那张已删的表单取数。约定改为**宿主注入** —— spec 声明 `toCalcInput` 才挂（宿主位 `#dw-scenario-host`），取数与 `compute` 同源，**渲染器不得另写一份「向导值 → 计税入参」**（两份映射的下场是「方案库里的数 ≠ 界面上算出来的数」，且没有任何一处会报错）；卡片内部一律用容器内 class 定位，规避向导重渲染导致的全局 id 撞车 |
| 2026-09-18 | **双端设计回归 + 确立唯一权威（第三次评审产出）** | 用户指出「之前定的是手机端+电脑端双端设计，怎么变样了」——经查证**用户记忆正确，双端方案从未丢失**：`ui-ux-master-plan.md` §3.3（两端定义）/ §4.2（桌面三要素）/ §4.3（两端形态硬边界）/ §5.3（顶部 Tab + 1024 限宽）与 `ui-design-spec.md` §5.1 / §5.2（768/1024 双断点）均完好。<br>**真正的问题是本文引起的错觉**：上一版把响应式写成「一套 UI + ≤640px 降级清单」，**抹平了桌面端差异**，具体违背三处：<br>**①** 明细 `result-detail` 一律折叠 —— 违反 §4.3「桌面输入与结果同屏」与 §4.2「结果表不折叠」；<br>**②** 推导链 `formula-steps` 一律折叠 —— 同上；<br>**③** 表单区只给一套写法 —— 违反「手机一次一问 / 桌面完整表单同屏」。<br>现已补写 **§6.0 双端硬边界**（优先级高于 6.1–6.3），含两端形态矩阵、两条解耦断点、两端共享三件事，并标注 **「桌面左右双栏已被否决、不许复活」**（见 `ui-ux-master-plan.md:505-511`）—— 防止有人看到「同屏」就去分栏。<br>另：用户要求「一份权威唯一的 UI 设计规范」。经确认**唯一权威早已存在且已声明**（`ui-design-spec.md` 第 3–17 行「开发唯一执行依据」），本文从未是它。为消除歧义，已在**两处**显式登记：本文开头新增「本文不是独立 UI 规范，它是一份子文档」声明块（列明不覆盖的议题与「冲突以母规范为准」判据）；母规范「与旧文档的关系」同步登记本文的子文档身份 |
