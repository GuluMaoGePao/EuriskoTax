/**
 * 劳务报酬 / 稿酬 / 特许权使用费「预扣预缴」—— 轻量实现，供 SEO 落地页使用（阶段15 15A-1）
 *
 * 与 bonus / salary / annual-settlement 三个 quick 同一套思路（见 docs/development/seo-landing-plan.md §2）：
 *   - 逻辑写在可测试的代码里，由 tests/withholding-quick.test.js 与内核 calculateOtherIncome
 *     在临界点（800 / 4000 / 20000 / 50000）及其 ±1 元、档内采样、非法输入上逐点对拍；
 *   - 税率与费用扣除规则**不复制**：直接读 window.withholdingTaxRates / window.otherIncomeRules
 *     —— tax-constants.js 的出厂值，内核 calculateOtherIncome 读的也是这两份，App 与落地页同源。
 *
 * 口径（国家税务总局公告 2018 年第 61 号）：
 *   费用扣除：单次收入 ≤ 4000 → 减 800；> 4000 → 减 20%
 *   稿酬：费用扣除后再减按 70% 计算（即 80% × 70% = 56%）
 *   预扣率：劳务 20% / 30%（速算扣除 2000）/ 40%（速算扣除 7000），按「应纳税所得额」定档；
 *           稿酬与特许权使用费固定 20%
 *   年度汇算：按收入额（劳务 / 特许权 80%、稿酬 56%）并入综合所得，多退少补
 *
 * 「并入综合所得 vs 单独」对比的口径说明（页面上也如此声明）：
 *   预扣预缴是支付方先扣的数；并入综合所得后的**实际税负**取决于全年综合所得所处档位。
 *   本模块用「全年综合所得适用税率（边际税率）」估算并入后的税负 ——
 *   settledTax = 收入额 × 边际税率，差额 > 0 应补、< 0 应退。精确值需把全年收支填进 App。
 *
 * 对外接口：window.EuriskoWithholdingQuick = {
 *   TYPES, ruleOf, ratesOf, taxableOf, bracketOf, taxOf, incomeOf, settledTaxOf, compareOf
 * }
 */
(function () {
    'use strict';

    var TYPES = ['labor', 'author', 'royalty'];

    function constants() {
        return (typeof window !== 'undefined' && window.EuriskoTaxConstants) || {};
    }

    function rules() {
        if (typeof window !== 'undefined' && window.otherIncomeRules) return window.otherIncomeRules;
        return constants().otherIncomeRules || {};
    }

    function rates() {
        if (typeof window !== 'undefined' && window.withholdingTaxRates) return window.withholdingTaxRates;
        return constants().withholdingTaxRates || {};
    }

    function ruleOf(type) {
        var r = rules();
        return TYPES.indexOf(type) === -1 ? null : (r[type] || null);
    }

    function ratesOf(type) {
        var t = rates();
        var rows = TYPES.indexOf(type) === -1 ? null : t[type];
        return Array.isArray(rows) ? rows : [];
    }

    // 费用扣除（预扣预缴阶段）：≤ 4000 减 800；> 4000 减 20%
    function expenseOf(type, amount) {
        var rule = ruleOf(type);
        var income = Number(amount);
        if (!rule || !Number.isFinite(income) || income <= 0) return 0;
        return income <= rule.threshold
            ? Math.max(0, income - rule.flat)
            : Math.max(0, income * rule.ratio);
    }

    // 预扣预缴应纳税所得额：费用扣除后再乘 postRatio（稿酬 0.7，其余 1）
    function taxableOf(type, amount) {
        var rule = ruleOf(type);
        if (!rule) return 0;
        var expense = expenseOf(type, amount);
        if (!(expense > 0)) return 0;
        return Math.max(0, expense * (rule.postRatio || 1));
    }

    // 命中的预扣率档
    function bracketOf(type, amount) {
        var rows = ratesOf(type);
        var taxable = taxableOf(type, amount);
        if (!rows.length || taxable <= 0) return null;
        for (var i = 0; i < rows.length; i++) {
            if (taxable <= rows[i].max) return rows[i];
        }
        return null;
    }

    // 预扣预缴税额（支付方先扣的数）
    function taxOf(type, amount) {
        var bracket = bracketOf(type, amount);
        if (!bracket) return 0;
        return Math.max(0, taxableOf(type, amount) * bracket.rate - bracket.deduction);
    }

    // 年度汇算并入综合所得的「收入额」：劳务 / 特许权 80%，稿酬 80% × 70% = 56%
    function incomeOf(type, amount) {
        var rule = ruleOf(type);
        var income = Number(amount);
        if (!rule || !Number.isFinite(income) || income <= 0) return 0;
        return income * (rule.incomeRatio || 0.8) * (rule.postRatio || 1);
    }

    // 并入综合所得后的税负（按全年综合所得所处档位的边际税率估算）
    function settledTaxOf(type, amount, marginalRate) {
        var rate = Number(marginalRate);
        if (!Number.isFinite(rate) || rate <= 0) return 0;
        return incomeOf(type, amount) * rate;
    }

    // 预扣预缴 vs 并入综合所得：gap > 0 应补，< 0 应退
    function compareOf(type, amount, marginalRate) {
        var prepaid = taxOf(type, amount);
        var settled = settledTaxOf(type, amount, marginalRate);
        var gap = settled - prepaid;
        return {
            type: type,
            amount: Number(amount) || 0,
            taxable: taxableOf(type, amount),
            income: incomeOf(type, amount),
            prepaid: prepaid,
            settled: settled,
            gap: gap,
            direction: gap > 0 ? '补税' : (gap < 0 ? '退税' : '持平')
        };
    }

    window.EuriskoWithholdingQuick = {
        TYPES: TYPES,
        ruleOf: ruleOf,
        ratesOf: ratesOf,
        expenseOf: expenseOf,
        taxableOf: taxableOf,
        bracketOf: bracketOf,
        taxOf: taxOf,
        incomeOf: incomeOf,
        settledTaxOf: settledTaxOf,
        compareOf: compareOf
    };
})();
