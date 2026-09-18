# EuriskoTax 编码约定速查（coding-rules-reference）

> **2026-09-17 建立**
>
> 本文件的每条约定都**标注出处**（`文件:行` 或既有文档）。没有出处的约定不写进来 ——
> 这既是它的编写原则，也是它存在的理由：**约定一旦脱离真实代码，就只是一句没人遵守的口号。**

---

## 一、管什么、不管什么

按 [file-management-policy.md](../development/file-management-policy.md) §2.3 的唯一真源原则（❌ 一份文档两个副本），
本文件**只收录跨模块复用的工程约定**，其余领域一律跳链，不复制、不转述：

| 领域 | 唯一真源 |
|------|---------|
| 目录结构 / 日志 / 脚本 / .gitignore | [file-management-policy.md](../development/file-management-policy.md) |
| 启动 / 验证 / 发布 / 回滚 / 排障 | [development-workflow.md](development-workflow.md) |
| 版本号五处同步 / 分支 / tag | [branch-release-strategy.md](branch-release-strategy.md) |
| 响应式断点与按钮命名 | [responsive-rules-reference.md](responsive-rules-reference.md) |
| UI 组件复用（导航 / 卡片 / 事件委托） | [ui-component-reuse-guide.md](ui-component-reuse-guide.md) |
| **计税口径本身** | [tax-calculation-rules.md](tax-calculation-rules.md) |
| SEO / 落地页结构与文案基线 | [../marketing/](../marketing/) |

---

## 二、作用域：用全局函数声明，不用 IIFE 包

**约定**：`src/js/**` 的模块在顶层用 `function` 声明，末尾导出一个聚合对象。

**出处**：`src/js/calculation/solver.js:22-24` —— `engine.js` 的聚合表约定是「直接用函数声明名引用」，
漏加载或改名会**立刻报错**；而包成 IIFE 会让聚合表拿不到标识符，
「等于把这里的可靠性校验悄悄换成了静默失败」。

- ❌ 不要把现有模块改包成 IIFE —— 「看起来更现代」是收益为零、风险为正的改动
- ✅ 新模块：内部逻辑用 `function` 声明 → 末尾只导出**一个** `window.EuriskoXxx` 对象

### 全局命名：只能挂在 `window.Eurisko*` 下

不要发明第二个命名空间。以下是当前实际存在的分组（依 `src/js/**` 实测）：

| 命名 | 用途 | 例子 |
|------|------|------|
| `EuriskoEngine` / `EuriskoTaxRegistry` | 计算入口聚合 | `calculation/engine.js` |
| `EuriskoSolver` | **通用算法**（刻意不含任何税务口径） | `calculation/solver.js` |
| `EuriskoXxxQuick` | 速算器 | `net-salary-quick.js`、`employer-cost-quick.js` |
| `EuriskoToolRegistry` / `EuriskoToolbox` | 工具箱与工具注册表 | `data/tool-registry.js` |
| `EuriskoDraft` / `EuriskoGuestSession` | 草稿与游客态 | `data/draft-store.js` |
| `EuriskoReport` / `EuriskoQuickReport` | 报告导出 | `export/` |
| `EuriskoPlan` / `EuriskoSync` / `EuriskoEnv` | 套餐 / 同步 / 运行时环境 | `auth/plan.js`、`utils/runtime-env.js` |

---

## 三、加载顺序是依赖的一部分

**约定**：新模块的 `<script>` 在 `index.html` 中的位置，要按依赖排列；被依赖者在前。

**出处**：`src/js/calculation/solver.js:20` —— 「必须先于 `tax-calculator.js` 与两个 quick 模块（见 `index.html`）」。
`src/js` 是传统加载，没有打包器替你拓扑排序，**顺序错了不会报错，只会拿到 `undefined`**。

- ✅ 新增计算模块 → 在 `index.html` 里显式引入，放在调用方之前
- ✅ 改完用 §五 的「接线守卫」用例兜住，别靠肉眼 review

---

## 四、不静默吞错

**约定**：可选依赖缺失时，要么显式报错，要么 `console.warn` 说明后果；**不要用 `?.` 把失败抹平**。

**出处**：`src/js/ui/toolbox-ui.js:399`

```
// 不静默吞掉（前车之鉴：auth-ui.js 死选择器靠 ?. 抹错而多年未发现）
console.warn('[toolbox] renderFormulaStepsHtml 未加载（utils.js），推导链面板被跳过');
```

同一条原则在 §二 也出现过：IIFE 包起来的模块，聚合表拿不到标识符时同样是静默失败。
**判断标准**：如果某种接错方式会让功能「照跑不报错、只是悄悄不对」，那它就是 bug 的温床。

---

## 五、跨文件接线必须写契约测试

**约定**：凡是「A 文件的函数在 B 文件 / `index.html` 里被调用」的接线，都要有用例钉死。

**出处与范式**：

| 守什么 | 出处 | 做法 |
|--------|------|------|
| DOM id 不能被重构改掉 | `tests/formula-steps-flows.test.js:277` (`面板 DOM 防回滚`) | 直接读 `index.html` 源码断言 `id="..."` 存在 |
| 导出不能变成死代码 | `tests/formula-steps-flows.test.js:288` | 断言调用方源码里含 `showFormulaStepsPanel(` 等调用串 |
| 草稿/面板 id 漂移 | `tests/draft-store.test.js:226` (`跨文件契约`) | 遍历 `_FLOWS`，逐个断言 `index.html` 含 `id="..."` |

`tests/draft-store.test.js:227` 把动机写得最清楚，值得照抄：

> 这一组防的是**静默失效**：一次 UI 重构把面板 id 或导航函数改名，
> 草稿功能照跑不报错，只是再也不弹出「继续填写」—— 没人会在日常点点里发现。

---

## 六、算法骨架与业务口径分离

**约定**：结构同构的重复代码 ≥ 3 份才抽象；抽象出的模块**零业务口径**，只留算法骨架，业务判据留给调用方。

**出处**：`src/js/calculation/solver.js:3-18`（Phase 2.5 ① 提炼通用求解器的动机与两条约定）：

> 复制的代价从来不是行数，而是**口径漂移**：某处的收敛方向要修时，另外 7 份不会跟着改。

抽象后必须把**约定写进模块头注释**，并配契约测试 —— `solver.js:14-16` 的「约定 1」就是模板：

> `increase(x)` 必须等价于 `f(x) < target`。
> 求解器不会检查单调性 —— **判据写反不会报错，只会静默收敛到另一侧。**

配套：`tests/solver.test.js` 用纯数学函数把这钉死（含「判据写反」用例）。
好处是正确性可以**独立于税率表**被验证；代价是约定只能靠注释 + 测试守，这就是契约测试存在的理由。

---

## 七、「零功能变化」怎么证明，遗留怎么标注

**约定**：声称纯重构时，证据是**既有用例一个字不改、全部原样通过**，而不是「我觉得没动」。

**出处**：`CHANGELOG.md` v1.41.0「Phase 2.5 ①」章节 —— 8 处二分倒算统一走 `solveMonotone()` 时，
搜索区间、精度、迭代上限、取中点口径全部沿用原实现，
所以那些断言具体金额的用例无需修改就全部通过。

**遗留必须如实写出来**，不得假装完成。同一章节的做法：

> **遗留**（有意不做）：结果显示与经营所得正向计算路径里还剩 5 份同形的减半公式
> （guard 写法略有出入）……在当前税率结构下等价，但**没有测试证明这一点**。

即：**「看起来一样」不能作为等价的依据**，统一前要先补等价对拍用例 —— 否则一旦真有差别，
动的是用户看到的税额数字。

---

## 八、命名与落位允许名单

| 对象 | 约定 | 出处 |
|------|------|------|
| 源码目录 | 按职责分 `src/js/{calculation,ui,data,export,lead,auth,utils}`，不得堆在 `src/js/` 根 | `file-management-policy.md` §1 |
| 速算器模块 | `<主题>-quick.js` → 导出 `window.Eurisko<主题PascalCase>Quick` | `net-salary-quick.js` 等现存 10 个同类导出 |
| 单元测试 | `tests/<被测模块>.test.js`，与 `src/js/**/<被测模块>.js` 同名 | 现存 64 个 `*.test.js`（= 64 套件） |
| 跨模块契约测试 | 用 `describe('…跨文件契约')` 单独分组，读源码文本断言 | `tests/draft-store.test.js:226` |
| 加载非模块化源码 | 走 `tests/helpers/load-source.js`（eval 方式加载 `src/js`） | `tests/helpers/load-source.js` |
| 文档落位 | 分类归属见 `file-management-policy.md` §2.1，并登记到 [docs/README.md](../README.md) 索引 | §2.1 |

---

## 九、改完顺手做的事

1. `CHANGELOG.md` 对应版本补条目；涉及**数量词**（套件/例/项）的数字必须与实际一致 ——
   有 `tools/ops/release-metrics.js` 的 `checkMetrics()` 做文档口径自检，会红。
2. 动到基线的，同步 `docs/development/development-plan.md` 的「当前基线」注。
3. push 前跑 `npm run verify:local`（本地 `server/` 依赖未装时加 `VERIFY_SKIP_GENERATE=1`）+ `npx jest`。
