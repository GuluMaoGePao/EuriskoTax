/**
 * 个人养老金 —— 轻量实现（阶段15 15A-5）
 *
 * 为什么单独做一个 quick 文件：
 *   /seo/private-pension.html 只需要「缴 12000 当年能少交多少税、将来领取时要交多少 3%、
 *   合起来是赚还是亏」这一个结论，不值得为此引一遍完整年度汇算内核。
 *   但标准与税率表必须同源 —— 所以本文件不复制任何数字：
 *   年限额与领取税率取注册表声明的 privatePensionRules，税率表取 comprehensiveTaxRates，
 *   缴费环节少交的税直接调内核 calculateTaxByTaxableIncome。
 *   （对拍见 tests/private-pension-quick.test.js：少交的税 ≡ 内核两段计税之差。）
 *
 * 口径要点（错了就是把「扣除额」当「减税额」，或把「3%」当成只对收益收）：
 *   1. 缴费扣的是**应纳税所得额**：少交的税 = T(x) − T(x − min(缴费额, 年限额))；
 *      超过年限额的部分当年不可扣，也不能结转到以后年度；
 *   2. 领取环节按**领取额全额 × 3%** 计税 —— 本金与投资收益一起计，
 *      不扣任何费用、不与当年综合所得合并、不参与汇算；
 *   3. 净优惠 = 缴费环节少交的税 − 领取环节交的税。所以只有适用税率**高于 3%** 才划算；
 *   4. 缴费上限由人社部与财政部适时调整，本页按现行 12000 元/年（月均 1000 元）计算。
 */
(function (global) {
    'use strict';

    var registry = global.EuriskoTaxRegistry;

    function rules() {
        return (registry && registry.resolveParams('private-pension').rules) || global.privatePensionRules;
    }

    function rateTable() {
        return (registry && registry.resolveParams('private-pension').rates) || global.comprehensiveTaxRates;
    }

    function toNumber(v, fallback) {
        var n = Number(v);
        if (!isFinite(n) || n < 0) return fallback || 0;
        return n;
    }

    /**
     * 应纳税所得额 → 年度税率表档位（与 App 内核同一张表、同一条定档规则）
     */
    function bracketOf(taxableIncome) {
        var rates = rateTable();
        var t = Math.max(0, Number(taxableIncome) || 0);
        for (var i = 0; i < rates.length; i++) {
            if (t <= rates[i].max) return rates[i];
        }
        return rates[rates.length - 1];
    }

    /**
     * 缴费环节：今年能扣多少、能少交多少税。
     *
     * @param {Object} input
     *   annualContribution   今年实际缴费额（元）
     *   taxableBefore        扣除前全年应纳税所得额（元）
     */
    function contributionOf(input) {
        input = input || {};
        var r = rules();
        var contribution = toNumber(input.annualContribution);
        var deductible = Math.min(contribution, r.annualLimit);
        var taxableBefore = Math.max(0, toNumber(input.taxableBefore));
        var taxableAfter = Math.max(0, taxableBefore - deductible);

        var taxBefore = global.calculateTaxByTaxableIncome(taxableBefore).tax;
        var taxAfter = global.calculateTaxByTaxableIncome(taxableAfter).tax;
        var bracket = bracketOf(taxableBefore);

        return {
            annualLimit: r.annualLimit,
            contribution: contribution,
            deductible: deductible,
            overLimit: Math.max(0, contribution - r.annualLimit),   // 超额部分当年不可扣、不能结转
            taxableBefore: taxableBefore,
            taxableAfter: taxableAfter,
            taxBefore: taxBefore,
            taxAfter: taxAfter,
            taxSaved: taxBefore - taxAfter,
            rate: bracket.rate,
            deductionForBracket: bracket.deduction,
            bracket: bracket,
            naiveSaved: deductible * bracket.rate,                  // 「扣除额 × 税率」的天真算法（跨档时高估）
            naiveGap: deductible * bracket.rate - (taxBefore - taxAfter)
        };
    }

    /**
     * 领取环节：按领取额全额 × withdrawRate 单独计税（不并入综合所得、不参与汇算）。
     */
    function withdrawTaxOf(withdrawTotal) {
        var r = rules();
        var total = Math.max(0, toNumber(withdrawTotal));
        return {
            withdrawTotal: total,
            withdrawRate: r.withdrawRate,
            tax: total * r.withdrawRate,
            isSeparate: r.withdrawIsSeparate
        };
    }

    /**
     * 主计算：缴费少交的税 − 领取交的税 = 净优惠，并给出「回本线」（领取额低于该值时净优惠仍为正）。
     *
     * @param {Object} input
     *   annualContribution   每年缴费额（元）
     *   years                缴费年数（默认 1）
     *   taxableBefore        缴费当年的全年应纳税所得额（元）
     *   withdrawTotal        预计领取总额（元）；缺省按「每年可扣额度 × 年数」即只回本金估算
     */
    function compareOf(input) {
        input = input || {};
        var r = rules();
        var years = Math.max(1, Math.round(toNumber(input.years, 1)));
        var yearly = contributionOf(input);

        // 缺省按「只回本金」估算：累计可扣额度 × 年数（投资收益不征税，实际领取额通常更高）
        var withdrawTotal = input.withdrawTotal === undefined || input.withdrawTotal === null || input.withdrawTotal === ''
            ? yearly.deductible * years
            : toNumber(input.withdrawTotal);
        var withdraw = withdrawTaxOf(withdrawTotal);

        return {
            rules: r,
            rateTable: rateTable(),
            years: years,
            annualLimit: yearly.annualLimit,
            contribution: yearly.contribution,
            deductible: yearly.deductible,
            overLimit: yearly.overLimit,
            totalDeductible: yearly.deductible * years,
            taxableBefore: yearly.taxableBefore,
            taxableAfter: yearly.taxableAfter,
            taxBefore: yearly.taxBefore,
            taxAfter: yearly.taxAfter,
            taxSaved: yearly.taxSaved,
            totalTaxSaved: yearly.taxSaved * years,
            rate: yearly.rate,
            deductionForBracket: yearly.deductionForBracket,
            naiveSaved: yearly.naiveSaved,
            naiveGap: yearly.naiveGap,
            withdrawTotal: withdraw.withdrawTotal,
            withdrawTax: withdraw.tax,
            netBenefit: yearly.taxSaved * years - withdraw.tax,
            // 净优惠归零的领取额：低于这个数就划算（3% 税率下 = 累计少交的税 ÷ 3%）
            breakEvenWithdraw: r.withdrawRate > 0 ? (yearly.taxSaved * years) / r.withdrawRate : 0,
            worthIt: yearly.rate > r.withdrawRate
        };
    }

    global.EuriskoPrivatePensionQuick = {
        rules: rules,
        rateTable: rateTable,
        bracketOf: bracketOf,
        contributionOf: contributionOf,
        withdrawTaxOf: withdrawTaxOf,
        compareOf: compareOf
    };
})(typeof window !== 'undefined' ? window : globalThis);
