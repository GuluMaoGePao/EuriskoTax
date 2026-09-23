/**
 * 提前退休 / 内部退养一次性收入 —— 轻量实现（阶段15 15A-7）
 *
 * 为什么单独做一个 quick 文件：
 *   /seo/early-retirement.html 只需要「这两笔一次性收入各交多少税」，不值得为此引一遍
 *   完整年度汇算内核。但标准与税率表必须同源 —— 所以本文件不复制任何数字：
 *   规则取注册表声明的 earlyRetirementRules，年度表取 comprehensiveTaxRates、
 *   月度表取 bonusMonthlyTaxRates，分摊计税直接调内核 calculateTaxByTaxableIncome，
 *   内部退养的定档与年终奖单独计税共用 EuriskoBonusQuick#bracketOf（同一张月度表）。
 *   （对拍见 tests/early-retirement-quick.test.js。）
 *
 * 三套口径不能混（这是本页存在的全部理由）：
 *   1. 提前退休（财税〔2018〕164 号第五条第二项）—— **真分摊**：
 *      应纳税额 = {〔(一次性补贴 ÷ 实际年度数) − 60000〕× 税率 − 速算扣除数} × 实际年度数
 *      即「分摊后每年的应纳税额 × 年数」，单独适用**年度**综合所得税率表，不并入综合所得。
 *   2. 内部退养（164 号第五条第三项 + 国税发〔1999〕58 号第一条）—— **平均只为定档**：
 *      月均额 = 一次性收入 ÷ 所属月份数；
 *      定档基数 = 月均额 + 领取当月工资薪金 − 5000；按**月度**税率表定档；
 *      应纳税额 = (当月工资薪金 + 一次性收入 − 5000) × 适用税率 − 速算扣除数
 *      —— 注意税基是**当月工资 + 一次性收入全额**，不是月均额：分摊只是用来找税率。
 *   3. 离职补偿金（15A-3，另一页）—— **有 3 倍社平工资免税额度**，超额部分单独适用年度表，
 *      且**不做分摊**。三者互不通用，页面必须写明区别。
 */
(function (global) {
    'use strict';

    var registry = global.EuriskoTaxRegistry;

    function params() {
        return (registry && registry.resolveParams('early-retirement')) || {};
    }

    function rules() {
        return params().rules || global.earlyRetirementRules;
    }

    function annualRates() {
        return params().rates || global.comprehensiveTaxRates;
    }

    function monthlyRates() {
        return params().monthlyRates || global.bonusMonthlyTaxRates;
    }

    function toNumber(v, fallback) {
        var n = Number(v);
        if (!isFinite(n) || n < 0) return fallback || 0;
        return n;
    }

    /**
     * 提前退休：按实际年度数分摊计税（分摊后的每年应纳税额 × 年数）。
     *
     * @param {Object} input
     *   subsidy   一次性补贴收入（元）
     *   years     办理提前退休手续至法定退休年龄的**实际年度数**（可含小数，= 实际月份数 ÷ 12）
     */
    function earlyOf(input) {
        input = input || {};
        var r = rules().early;
        var subsidy = toNumber(input.subsidy);
        var years = toNumber(input.years, 1) || 1;
        var perYear = subsidy / years;
        var taxablePerYear = Math.max(0, perYear - r.annualDeduction);
        // 定档用的是分摊后的年应纳税所得额 —— 直接用内核算，不自己查表
        var bracket = null;
        for (var i = 0; i < annualRates().length; i++) {
            if (taxablePerYear <= annualRates()[i].max) { bracket = annualRates()[i]; break; }
        }
        bracket = bracket || annualRates()[annualRates().length - 1];
        var taxPerYear = global.calculateTaxByTaxableIncome(taxablePerYear).tax;
        return {
            subsidy: subsidy,
            years: years,
            perYear: perYear,
            annualDeduction: r.annualDeduction,
            taxablePerYear: taxablePerYear,
            rate: bracket.rate,
            deductionForBracket: bracket.deduction,
            taxPerYear: taxPerYear,
            tax: taxPerYear * years,
            // 天真算法：不摊、直接按总额减 6 万单独计税 —— 用来说明「分摊」到底省了多少
            naiveTax: global.calculateTaxByTaxableIncome(Math.max(0, subsidy - r.annualDeduction)).tax,
            spreadSaving: global.calculateTaxByTaxableIncome(Math.max(0, subsidy - r.annualDeduction)).tax - taxPerYear * years
        };
    }

    /**
     * 内部退养：按月平均只为定档，税基是「当月工资 + 一次性收入全额」。
     *
     * @param {Object} input
     *   lumpSum        一次性收入（元）
     *   months         办理内退手续至法定离退休年龄之间的**所属月份数**
     *   monthlySalary  领取当月的工资薪金（元）
     */
    function internalOf(input) {
        input = input || {};
        var r = rules().internal;
        var lumpSum = toNumber(input.lumpSum);
        var months = Math.max(1, toNumber(input.months, 1) || 1);
        var salary = toNumber(input.monthlySalary);
        var monthly = lumpSum / months;
        // 定档基数：月均额 + 当月工资 − 5000（与当月工资合并是这个口径的关键）
        var base = Math.max(0, monthly + salary - r.monthlyDeduction);
        // 与年终奖单独计税共用同一张月度表的取档实现（EuriskoBonusQuick 按 amount/12 定位月档）
        var bonusQuick = global.EuriskoBonusQuick;
        var bracket = bonusQuick && bonusQuick.bracketOf
            ? bonusQuick.bracketOf(Math.max(0, base) * 12, monthlyRates())
            : null;
        if (!bracket) {
            for (var i = 0; i < monthlyRates().length; i++) {
                if (base <= monthlyRates()[i].max) { bracket = monthlyRates()[i]; break; }
            }
            bracket = bracket || monthlyRates()[monthlyRates().length - 1];
        }
        var taxable = Math.max(0, salary + lumpSum - r.monthlyDeduction);
        var tax = taxable * bracket.rate - bracket.deduction;
        return {
            lumpSum: lumpSum,
            months: months,
            monthlySalary: salary,
            monthly: monthly,
            monthlyDeduction: r.monthlyDeduction,
            base: base,
            rate: bracket.rate,
            deductionForBracket: bracket.deduction,
            taxable: taxable,
            tax: Math.max(0, tax),
            // 天真算法：误以为「平均」是分摊计税（按月均额乘月数）—— 必然少算，用来纠偏
            naiveTax: Math.max(0, (monthly * bracket.rate - bracket.deduction) * months),
            naiveGap: Math.max(0, tax) - Math.max(0, (monthly * bracket.rate - bracket.deduction) * months)
        };
    }

    function compareOf(input) {
        input = input || {};
        return {
            rules: rules(),
            early: earlyOf(input),
            internal: internalOf(input)
        };
    }

    global.EuriskoEarlyRetirementQuick = {
        rules: rules,
        earlyOf: earlyOf,
        internalOf: internalOf,
        compareOf: compareOf
    };
})(typeof window !== 'undefined' ? window : globalThis);
