// 税法常量单一事实来源（税率表 / 缴费基数下限）
//
// 加载顺序硬约束：本文件必须先于所有消费者加载。
//   - index.html：紧随「引入分离的JavaScript文件」注释之后，为全部脚本中的第一个
//   - 测试：tests/helpers/load-source.js 以间接 eval 注入，任何加载
//     tax-calculator.js 的测试都必须先 loadSource 本文件
//   消费者：tax-calculator.js、helper-functions.js、utils.js
//
// 为什么用 var 而非 const（勿改）：
//   浏览器中顶层 const 会生成全局词法绑定，跨 <script> 可见；但测试用的间接
//   eval（(0, eval)(code)）会为 let/const 单独创建声明式环境，跨文件不可见，
//   而 var 在全局 eval 中会落到全局对象上。用 var 才能让两种环境行为一致。
//   这正是 history-sync.js 选择「挂 window.EuriskoSync」的同一原因。
//
// 阶段12 C1 契约（运行时热更新，勿破坏）：
//   本文件只是「出厂基线」。运行时会被 src/js/data/tax-rates-sync.js 用管理台发布的配置覆盖
//   （window.TaxRates.applyRates 会直接改写下列全局 var，并同步 window.EuriskoTaxConstants）。
//   因此计算层请始终「直接引用这些全局变量」，不要在模块顶层把它们缓存进局部常量。

// 常量版本号：税制调整时递增，便于排查“前端常量与政策不一致”类问题
var TAX_CONSTANTS_VERSION = '2026.1';

// 综合所得税率表
var comprehensiveTaxRates = [
    { min: 0, max: 36000, rate: 0.03, deduction: 0 },
    { min: 36000, max: 144000, rate: 0.10, deduction: 2520 },
    { min: 144000, max: 300000, rate: 0.20, deduction: 16920 },
    { min: 300000, max: 420000, rate: 0.25, deduction: 31920 },
    { min: 420000, max: 660000, rate: 0.30, deduction: 52920 },
    { min: 660000, max: 960000, rate: 0.35, deduction: 85920 },
    { min: 960000, max: Infinity, rate: 0.45, deduction: 181920 }
];

// 月度税率表（用于年终奖单独计税）
var bonusMonthlyTaxRates = [
    { max: 3000, rate: 0.03, deduction: 0 },
    { max: 12000, rate: 0.10, deduction: 210 },
    { max: 25000, rate: 0.20, deduction: 1410 },
    { max: 35000, rate: 0.25, deduction: 2660 },
    { max: 55000, rate: 0.30, deduction: 4410 },
    { max: 80000, rate: 0.35, deduction: 7160 },
    { max: Infinity, rate: 0.45, deduction: 15160 }
];

// 经营所得税率表
var businessTaxRates = [
    { max: 30000, rate: 0.05, deduction: 0 },
    { max: 90000, rate: 0.10, deduction: 1500 },
    { max: 300000, rate: 0.20, deduction: 10500 },
    { max: 500000, rate: 0.30, deduction: 40500 },
    { max: Infinity, rate: 0.35, deduction: 65500 }
];

// 分类所得税率表（比例税率20%）
var classificationTaxRates = {
    interest: { rate: 0.20, name: '利息、股息、红利所得' },
    rent: { rate: 0.20, name: '财产租赁所得' },
    transfer: { rate: 0.20, name: '财产转让所得' },
    accidental: { rate: 0.20, name: '偶然所得' }
};

// 劳务报酬 / 稿酬 / 特许权使用费 —— 预扣预缴税率表（阶段15 15A-1）
//
// 政策依据：《个人所得税扣缴申报管理办法（试行）》（国家税务总局公告 2018 年第 61 号）第八条、第九条
//   - 劳务报酬：按「应纳税所得额」适用 20% / 30% / 40% 三级超额累进（速算扣除数 0 / 2000 / 7000）
//   - 稿酬、特许权使用费：预扣率固定 20%（单档，便于与劳务共用同一套查表代码）
//
// 为什么把「20/30/40」从 tax-calculator.js 里搬出来：
//   阶段15 的落地页要在页面上算同一笔税，若页面抄一份、内核留一份，就是第二处口径。
//   搬到这里后，内核 calculateOtherIncome 与 withholding-quick.js 读同一份，
//   由 tests/withholding-quick.test.js 逐点对拍证明二者等价。
//   （未纳入 tax-rates-sync.js 的后端热改字段：这三个预扣率自 2019 年起未调整，
//     属「长期稳定参数」；若哪天调整，按 15D-3 的多税种版本化扩进 /api/config/tax-rates。）
var withholdingTaxRates = {
    labor: [
        { max: 20000, rate: 0.20, deduction: 0 },
        { max: 50000, rate: 0.30, deduction: 2000 },
        { max: Infinity, rate: 0.40, deduction: 7000 }
    ],
    author: [
        { max: Infinity, rate: 0.20, deduction: 0 }
    ],
    royalty: [
        { max: Infinity, rate: 0.20, deduction: 0 }
    ]
};

// 劳务报酬 / 稿酬 / 特许权使用费 —— 费用扣除与「并入综合所得」折算规则（阶段15 15A-1）
//
//   threshold / flat / ratio：预扣预缴阶段的费用扣除
//       收入 ≤ 4000 → 减除费用 800；收入 > 4000 → 减除 20%
//   postRatio：费用扣除后再打的折（稿酬再减按 70% 计算，即「打七折」）
//   incomeRatio：年度汇算并入综合所得时的收入额折算（劳务 / 特许权 80%，稿酬 80% × 70% = 56%）
//
// 字段刻意拆开而不是直接写死 0.56：三个所得的差别只在 postRatio，
//   拆分后内核与落地页共用同一个表达式，不会出现「页面按 56%、内核按 0.8×0.7」这类表述差异。
var otherIncomeRules = {
    labor: { name: '劳务报酬所得', threshold: 4000, flat: 800, ratio: 0.8, postRatio: 1, incomeRatio: 0.8 },
    author: { name: '稿酬所得', threshold: 4000, flat: 800, ratio: 0.8, postRatio: 0.7, incomeRatio: 0.8 },
    royalty: { name: '特许权使用费所得', threshold: 4000, flat: 800, ratio: 0.8, postRatio: 1, incomeRatio: 0.8 }
};

// 社保/公积金缴费基数最低标准 —— 全国口径兜底值，同时也是表单的初始默认基数。
//
// 阶段12 C1 契约（运行时热更新，勿破坏）：
//   这两个值是最终兜底，实际生效顺序为
//     tax-constants.js（本文件，全国兜底 7546）
//       → tax-rates-sync.js 覆盖为管理台「税率」Tab 维护的全国口径（最终生效值）
//   因此计算/校验层请始终「直接引用这两个全局变量」，不要缓存进局部常量。
//
// 设计取舍（2026-09 回退阶段14 C2 的「参保城市」分档）：
//   不按城市分档校验——统一按全国兜底口径提示「低于最低标准」，
//   城市改由留资/咨询时收集，由顾问核对当地口径后再给结论。
//   （城市参数库与 /api/config/city-social 仍在后台维护，端上暂不消费，
//     供后续「社保基数」SEO 落地页复用；需要恢复分档时按 git 历史回滚前端即可。）
//
// 取值与表单初始默认基数对齐：默认值即最低标准（默认 7546，输入低于 7546 才提示）
var MIN_SOCIAL_SECURITY_BASE = 7546;
var MIN_HOUSING_FUND_BASE = 7546;

// 对外聚合出口：供 engine.js / 后续税务参数配置化（C1）与单测使用
window.EuriskoTaxConstants = {
    version: TAX_CONSTANTS_VERSION,
    comprehensiveTaxRates: comprehensiveTaxRates,
    bonusMonthlyTaxRates: bonusMonthlyTaxRates,
    businessTaxRates: businessTaxRates,
    classificationTaxRates: classificationTaxRates,
    withholdingTaxRates: withholdingTaxRates,
    otherIncomeRules: otherIncomeRules,
    MIN_SOCIAL_SECURITY_BASE: MIN_SOCIAL_SECURITY_BASE,
    MIN_HOUSING_FUND_BASE: MIN_HOUSING_FUND_BASE
};
