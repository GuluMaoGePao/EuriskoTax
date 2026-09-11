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

// 社保缴费基数最低标准（根据国家规定，各城市略有不同，这里使用全国平均值）
// TODO(C2 社保地区政策库)：应改为按参保城市参数化，现为全国平均值兜底
var MIN_SOCIAL_SECURITY_BASE = 4250;
var MIN_HOUSING_FUND_BASE = 4250;

// 对外聚合出口：供 engine.js / 后续税务参数配置化（C1）与单测使用
window.EuriskoTaxConstants = {
    version: TAX_CONSTANTS_VERSION,
    comprehensiveTaxRates: comprehensiveTaxRates,
    bonusMonthlyTaxRates: bonusMonthlyTaxRates,
    businessTaxRates: businessTaxRates,
    classificationTaxRates: classificationTaxRates,
    MIN_SOCIAL_SECURITY_BASE: MIN_SOCIAL_SECURITY_BASE,
    MIN_HOUSING_FUND_BASE: MIN_HOUSING_FUND_BASE
};
