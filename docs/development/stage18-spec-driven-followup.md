# 阶段18：spec 驱动的配套链路收口（完整测算「能算」之后「能用」）

> 版本：v1.0 · 2026-09-20 ｜ 状态：🟢 **大部分完成，剩两项待定**（v1.71.0 → v1.76.0 已交付）
> 创建：2026-09-20（此前**无独立方案文件**，只在 CHANGELOG 里散记；本文件把根因与六个批次整合到一处）
> 关联：[stage17-full-tax-coverage-plan.md](./stage17-full-tax-coverage-plan.md)（§9 遗留）· [development-plan.md](./development-plan.md)（阶段状态表）

---

## 1. 为什么会有阶段18（一句话）

阶段17 每迁移一个页面式 deep，就**就地补一份「按工具认人」的配置或绑定**。于是 21 个 spec 驱动完整测算里
**只有 4 个**（`business` / `reverse` / `forward` / `classification`）被照顾到，**其余 17 个全漏**，
而且漏掉的表现全是**静默或半静默失败** —— 不算错、不报错，只是没反应、读到空、或者给了个张冠李戴的值。

阶段17 收官时「21 个 spec 驱动 + 90 个套件全绿」，全绿是因为**没有一个测试按用户真实路径走过一遍**。
阶段18 就是把这 17 个补齐，并补上"看得见"的守护。

**共性是五张表/绑定同一个病**：历史分发、分享图取数、留资情境、分享图入口、真机行名匹配 ——
都是 `switch/else-if` 或 `Map` 里写死 4 个 id 的映射。

---

## 2. 已交付批次

| 批次 | 版本 | 症状（用户视角） | 病灶 | 改法 |
|---|---|---|---|---|
| 18-1 加载顺序装配守护 | v1.71.0 | ——（无人验证过的缝） | `index.html` 靠 **62 个 `<script>` 书写顺序**表达依赖，而测试只 eval 自己需要的几个文件；`solver.js` 早于 `tax-calculator.js`、所有 `*-quick.js` 早于 `tool-registry.js` 三条错序都会整块失效而测试全绿 | 新增 `tests/index-assembly.test.js`（11 例）：按真实顺序在 jsdom 里 eval 全部经典脚本，断言无异常 + 注册表可用 + 每个工具 compute 真跑得出结果；清单侧守 src 存在 / 无重复 / 磁盘上 `*-quick.js` 不漏登记 |
| 18-2 历史查看 | v1.72.0 | 刚保存的记录点开弹「这条记录没有对应的测算入口，可能来自更新的版本」 | `viewHistoryRecord` 按 `record.type` 的 else-if 只认 4 个；20 个速算器存的 type 是 `'quick'`、其余 17 个 deep 存的是各自 `tool.id`，全落 else。**第二个洞**：那 4 个能打开的 deep 打开的是向导**草稿**而非该条记录的输入 → 历史成了假账 | 改**按注册表统一分发**：存时记 `toolId`，看时查注册表（deep → `open(id,{values})` 直达结果步；速算器 → `openTool(id,{values})` 回填；`comprehensive` 别名与老记录兼容，认不出时**说清楚而不猜**）。守护 `tests/history-reopen.test.js`（4 例，20+21 逐个跑） |
| 18-3 分享图取数 | v1.73.0 | 算完点分享弹「暂无可分享的结果」 | `share-card.SOURCES` 只 4 份，其余 17 个 `sourceKey()` 认不出就退裸键；selector 写死 `[data-tool-id="business"]` → 读到空 | 键名改 `'dw-result-card:business'`；新增 `genericConfig()` 按卡上 `data-tool-id` **现场取数**（主结果 `#dw-result-primary`、明细照 `data-dw-row` 抄前 3 行、标题取注册表 name、谈薪仍走 negotiation）；结果卡加 `id="dw-result-primary-label"`；明细行改 `readCell()` 取行内**最后一个 span** |
| 18-4 留资情境 | v1.74.0 | 留资后顾问看不出他算了什么；历史记录不进下拉 | `lead-context` 的 `TYPE_NAMES` / `SERVICE_TYPES` 只 4 个 → 17 个 deep 的 `current()` 返回空 | 新增 `nameOf()` 注册表兜底 + 通用锚点（税率行按「适用税率→实际税负率→税负率」试，**行名是什么就写什么**）；下拉过滤改「排除 `BLOCKED_TYPES` + 认得出名字」；谈薪硬约束用 `BLOCKED_TYPES` 显式挡三处 |
| 18-5 分享图**入口** | v1.75.0 | 21 个完整测算**一个都没有分享入口**（连那 4 个也没有） | `share-card.bindTriggers()` 在加载时 `getElementById('dw-next')` 绑那一颗；spec 驱动后每步重渲染、按钮每次都是新的 | 改**事件委托**：`e.target.closest('#dw-next')` |
| 18-6a 真机补跑 | v1.76.0 | 真机上顾问的情境里**税率整段消失**，只剩「增值税」 | `lead-context.readWizardText` 按行名**精确匹配** `[data-dw-row="实际税负率"]`，而真机行名是「实际税负率（占不含税销售额）」带括号后缀 | 精确匹配不到时**按前缀再找一次**（`[data-dw-row^=…]`） |

**未动的一项（有意为之）**：`lead-touchpoints.ALLOWED_TYPES` 留资引导投放白名单仍为 4 类 ——
这是**产品投放口径**（不是 bug），是否扩到更多 deep 属待拍板事项，见 §3。

---

## 3. 剩余待定两项（等输入，不要自行开工）

| # | 事项 | 卡在谁 | 说明 |
|---|---|---|---|
| ① | **18-6** 按用户反馈补具体税种场景 | **等用户输入** | 18-6a 只修了真机暴露出的行名匹配问题；"补哪些场景"取决于真实用户反馈，没有输入就容易做成自嗨 |
| ② | 留资引导投放白名单是否从 4 类扩到更多 deep | **等用户拍板** | 属投放策略：扩了会提高留资量但稀释线索质量；`BLOCKED_TYPES` 已挡住谈薪等不该引导的类型 |

---

## 4. 阶段18 留下的三条教训（比代码值钱）

1. **jsdom 全绿 ≠ 用户能用。** 18-3 的守卫直接调 `resolveConfig`/`collect`，绕过了「按钮挂没挂上」→ 单测全绿而真机全黑（18-5）。
2. **fixture 与真机形态不一致会再造一次「绿了但坏了」。** 18-4 的 fixture 行名不带括号后缀，真机带后缀 → 18-6a 才暴露。
3. **关键路径必须真机点一遍。** 真机验法：`cd server && node src/app.js`（本地 SQLite，端口 3000）→ 登录页「开发环境：填入本地测试账号」→ 关掉 alert → 登录；**最快是用 `agent-browser eval` 直接调 API**（如 `window.LeadContext.current('vat-deep')`、`viewHistoryRecord('<id>')`），历史存储键 `taxCalculationHistory`。真机点的必须是**最后一步那颗 `dw-next`**（文案「计算结果」，结果步里没有它）。

---

## 5. 变更记录

| 日期 | 版本 | 内容 |
|---|---|---|
| 2026-09-19 | v1.71.0 ~ v1.76.0 | 18-1 / 18-2 / 18-3 / 18-4 / 18-5 / 18-6a 六个批次交付（逐版明细见 [CHANGELOG.md](../../CHANGELOG.md)） |
| 2026-09-20 | 本文 v1.0 | 首次建档：此前无独立方案文件，进度只在 CHANGELOG 与 development-plan 阶段表里各写一处。本文件整合根因、六批次、待定两项与教训 |
