/**
 * 税优健康险 —— 轻量实现（阶段15 15A-5 尾巴）
 *
 * 为什么单独做一个 quick 文件：
 *   /seo/health-insurance.html 只需要「一年最多扣 2400、能少交多少税」这一个结论，
 *   不值得为此引一遍完整年度汇算内核。但标准与税率表必须同源 —— 本文件不复制任何数字：
 *   年限额取注册表声明的 healthInsuranceRules，税率表取 comprehensiveTaxRates，
 *   少交的税直接调内核 calculateTaxByTaxableIncome。
 *   （对拍见 tests/health-insurance-quick.test.js：少交的税 ≡ 内核两段计税之差。）
 *
 * 口径要点（错了就是把「保费」当「减税额」，或忘了赔付环节本来就免税）：
 *   1. 扣的是**应纳税所得额**：少交的税 = T(x) − T(x − min(年保费, 2400))；
 *      2400 元/年（200 元/月）之外的保费部分照常税后支出，不结转；
 *   2. **没有领取税**：保险赔款依个税法第四条免征个人所得税 —— 这是与个人养老金
 *      「领取按 3%」最大的差别，节税额是确定的（扣除额 × 适用税率）；
 *   3. 节税上限就是 2400 × 45% = 1080 元/年 —— 节税本身**不足以构成购买理由**，
 *      页面必须把这条写出来（只讲优点的税优页面不可信）。
 */
(function (global) {
    'use strict';

    var registry = global.EuriskoTaxRegistry;

    function rules() {
        return (registry && registry.resolveParams('health-insurance').rules) || global.healthInsuranceRules;
    }

    function rateTable() {
        return (registry && registry.resolveParams('health-insurance').rates) || global.comprehensiveTaxRates;
    }

    function toNumber(v, fallback) {
        var n = Number(v);
        if (!isFinite(n) || n < 0) return fallback || 0;
        return n;
    }

    /** 应纳税所得额 → 年度税率表档位（与 App 内核同一张表、同一条定档规则） */
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
     *   annualPremium    今年实际保费支出（元）
     *   taxableBefore    扣除前全年应纳税所得额（元）
     */
    function premiumOf(input) {
        input = input || {};
        var r = rules();
        var premium = toNumber(input.annualPremium);
        var deductible = Math.min(premium, r.annualLimit);
        var taxableBefore = Math.max(0, toNumber(input.taxableBefore));
        var taxableAfter = Math.max(0, taxableBefore - deductible);

        var taxBefore = global.calculateTaxByTaxableIncome(taxableBefore).tax;
        var taxAfter = global.calculateTaxByTaxableIncome(taxableAfter).tax;
        var bracket = bracketOf(taxableBefore);

        return {
            annualLimit: r.annualLimit,
            monthlyLimit: r.monthlyLimit,
            premium: premium,
            deductible: deductible,
            overLimit: Math.max(0, premium - r.annualLimit),   // 超限部分税后支出，不结转
            taxableBefore: taxableBefore,
            taxableAfter: taxableAfter,
            taxBefore: taxBefore,
            taxAfter: taxAfter,
            taxSaved: taxBefore - taxAfter,
            rate: bracket.rate,
            deductionForBracket: bracket.deduction,
            bracket: bracket,
            naiveSaved: deductible * bracket.rate,             // 「保费 × 税率」的天真算法（跨档时高估）
            naiveGap: deductible * bracket.rate - (taxBefore - taxAfter)
        };
    }

    /** 赔付环节：保险赔款免征个人所得税 —— 领取税恒为 0（与个人养老金的 3% 对照） */
    function payoutTaxOf(payoutTotal) {
        var r = rules();
        var total = Math.max(0, toNumber(payoutTotal));
        return {
            payoutTotal: total,
            payoutTaxFree: r.payoutTaxFree,
            tax: r.payoutTaxFree ? 0 : total * 0
        };
    }

    /**
     * 主计算：净优惠 = 缴费环节少交的税（赔付环节免税，无领取税）。
     * 与个人养老金不同，这里没有「回本线」 —— 节税不因赔付金额而减少。
     */
    function compareOf(input) {
        input = input || {};
        var r = rules();
        var yearly = premiumOf(input);
        var payout = payoutTaxOf(input.payoutTotal || 0);
        // 顶层节税上限：2400 × 最高档税率（用来提醒「这本来就是一笔小钱」）
        var maxYearlySaving = r.annualLimit * rateTable()[rateTable().length - 1].rate;

        return {
            rules: r,
            rateTable: rateTable(),
            annualLimit: yearly.annualLimit,
            monthlyLimit: yearly.monthlyLimit,
            premium: yearly.premium,
            deductible: yearly.deductible,
            overLimit: yearly.overLimit,
            taxableBefore: yearly.taxableBefore,
            taxableAfter: yearly.taxableAfter,
            taxBefore: yearly.taxBefore,
            taxAfter: yearly.taxAfter,
            taxSaved: yearly.taxSaved,
            rate: yearly.rate,
            deductionForBracket: yearly.deductionForBracket,
            naiveSaved: yearly.naiveSaved,
            naiveGap: yearly.naiveGap,
            payoutTax: payout.tax,
            payoutTaxFree: payout.payoutTaxFree,
            netBenefit: yearly.taxSaved,          // 赔付免税 → 净优惠就是少交的税
            maxYearlySaving: maxYearlySaving
        };
    }

    global.EuriskoHealthInsuranceQuick = {
        rules: rules,
        rateTable: rateTable,
        bracketOf: bracketOf,
        premiumOf: premiumOf,
        payoutTaxOf: payoutTaxOf,
        compareOf: compareOf
    };
})(typeof window !== 'undefined' ? window : globalThis);
