/**
 * 企业年金 / 职业年金 —— 轻量实现（阶段15 15A-5 尾巴）
 *
 * 为什么单独做一个 quick 文件：
 *   /seo/enterprise-annuity.html 只需要「个人缴费 4% 免税能少交多少、单位缴费 8% 递延
 *   进账户、退休按月领取要交多少税」这一个全景结论，不值得为此引一遍完整年度汇算内核。
 *   但标准与税率表必须同源 —— 本文件不复制任何数字：
 *   4%/8%/12% 与 300% 封顶取注册表声明的 annuityRules，缴费环节税率表取
 *   comprehensiveTaxRates，按月领取税率表取 bonusMonthlyTaxRates，
 *   少交的税直接调内核 calculateTaxByTaxableIncome。
 *   （对拍见 tests/annuity-quick.test.js：少交的税 ≡ 内核两段计税之差。）
 *
 * 口径要点（错了就是把「免税比例」当「免费年金」，或把领取税算到综合所得里）：
 *   1. 个人缴费当期免税上限 = min(计税基数 × 4%, 实际个人缴费)；计税基数按本人上年度
 *      月平均工资、当地社平工资 300% 封顶（页面要求用户填**封顶后**的基数）；
 *      超过 4% 的部分照常从税后工资扣，账户里一样有这笔钱但税已交过；
 *   2. 单位缴费 ≤ 工资总额 8%（单位 + 个人合计 ≤ 12%）计入个人账户时个人暂不纳税 ——
 *      这是**递延**而非免税，领取时全额单独计税；
 *   3. 领取环节：按月领取的按**月度税率表**（与年终奖月度换算表同一张）逐月单独计税，
 *      不并入综合所得、不参与汇算；按年领取的按综合所得税率表（本页以按月领取演示）；
 *   4. 缴费环节少交的税 = T(x) − T(x − 年扣除额)，不是「缴费额 × 税率」的简单乘法。
 */
(function (global) {
    'use strict';

    var registry = global.EuriskoTaxRegistry;

    function rules() {
        return (registry && registry.resolveParams('enterprise-annuity').rules) || global.annuityRules;
    }

    function rateTable() {
        return (registry && registry.resolveParams('enterprise-annuity').rates) || global.comprehensiveTaxRates;
    }

    function monthlyTable() {
        return (registry && registry.resolveParams('enterprise-annuity').rules)
            ? (global[registry.resolveParams('enterprise-annuity').rules.monthlyRateTable] || global.bonusMonthlyTaxRates)
            : global.bonusMonthlyTaxRates;
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

    /** 每月领取额 → 月度税率表应纳税（与年终奖月度换算同一张表） */
    function monthlyWithdrawTax(monthlyAmount) {
        var rates = monthlyTable();
        var m = Math.max(0, Number(monthlyAmount) || 0);
        var row = rates[rates.length - 1];
        for (var i = 0; i < rates.length; i++) {
            if (m <= rates[i].max) { row = rates[i]; break; }
        }
        return { rate: row.rate, deduction: row.deduction, tax: Math.max(0, m * row.rate - row.deduction) };
    }

    /**
     * 缴费环节：每月能免多少、每年能少交多少税。
     *
     * @param {Object} input
     *   contributionBase   个人缴费工资计税基数（月，须已按当地社平 300% 封顶）
     *   personalRate       个人缴费比例（如 0.04）
     *   employerRate       单位缴费比例（如 0.08）
     *   taxableBefore      扣除前全年应纳税所得额（元）
     */
    function contributionOf(input) {
        input = input || {};
        var r = rules();
        var base = toNumber(input.contributionBase);
        var personalRate = Math.min(toNumber(input.personalRate), 1);
        var employerRate = Math.min(toNumber(input.employerRate), 1);

        // 个人缴费：≤ 计税基数 × 4% 的部分当期免税，超出部分税后扣缴（照常进账户）
        var personalMonthly = base * personalRate;
        var exemptMonthly = Math.min(personalMonthly, base * r.personalRateCap);
        var taxablePersonalMonthly = personalMonthly - exemptMonthly;

        // 单位缴费：≤ 计税基数 × 8% 的部分计入个人账户时个人暂不纳税（递延）；
        // 单位 + 个人合计 ≤ 12% 的税优部分同样递延
        var employerMonthly = base * Math.min(employerRate, r.employerRateCap);
        var deferredMonthly = employerMonthly + Math.min(personalMonthly, base * (r.combinedRateCap - r.employerRateCap));

        var annualExempt = exemptMonthly * 12;
        var taxableBefore = Math.max(0, toNumber(input.taxableBefore));
        var taxableAfter = Math.max(0, taxableBefore - annualExempt);

        var taxBefore = global.calculateTaxByTaxableIncome(taxableBefore).tax;
        var taxAfter = global.calculateTaxByTaxableIncome(taxableAfter).tax;
        var bracket = bracketOf(taxableBefore);

        return {
            rules: r,
            contributionBase: base,
            personalRate: personalRate,
            employerRate: employerRate,
            personalMonthly: personalMonthly,
            exemptMonthly: exemptMonthly,
            taxablePersonalMonthly: taxablePersonalMonthly,   // 超 4% 部分：税后扣缴，照常进账户
            employerMonthly: employerMonthly,
            deferredMonthly: deferredMonthly,                 // 单位缴费 + 税优个人缴费：递延进账户
            annualExempt: annualExempt,
            annualPersonal: personalMonthly * 12,
            annualEmployer: employerMonthly * 12,
            annualDeferred: deferredMonthly * 12,             // 每年递延进账户的本金（不含投资收益）
            taxableBefore: taxableBefore,
            taxableAfter: taxableAfter,
            taxBefore: taxBefore,
            taxAfter: taxAfter,
            taxSaved: taxBefore - taxAfter,                   // 缴费环节每年少交的税
            rate: bracket.rate,
            deductionForBracket: bracket.deduction,
            bracket: bracket,
            naiveSaved: annualExempt * bracket.rate,          // 「年扣除额 × 税率」的天真算法（跨档时高估）
            naiveGap: annualExempt * bracket.rate - (taxBefore - taxAfter)
        };
    }

    /**
     * 主计算：缴费少交的税 × 年数 − 按月领取的税 = 净优惠。
     *
     * @param {Object} input
     *   contributionBase   个人缴费工资计税基数（月）
     *   personalRate       个人缴费比例
     *   employerRate       单位缴费比例
     *   taxableBefore      扣除前全年应纳税所得额（元）
     *   years              缴费年数（默认 1）
     *   monthlyWithdraw    退休后每月领取额（元）；缺省按「每年进账户本金 ÷ 12」估算
     */
    function compareOf(input) {
        input = input || {};
        var r = rules();
        var years = Math.max(1, Math.round(toNumber(input.years, 1)));
        var yearly = contributionOf(input);

        // 账户累计（只算本金，投资收益暂不征税但实际通常更高）
        var accountTotal = (yearly.annualPersonal + yearly.annualEmployer) * years;

        // 缺省按「每年进账户本金 ÷ 12」按月领取
        var monthlyWithdraw = input.monthlyWithdraw === undefined || input.monthlyWithdraw === null || input.monthlyWithdraw === ''
            ? (yearly.annualPersonal + yearly.annualEmployer) / 12
            : toNumber(input.monthlyWithdraw);
        var perMonth = monthlyWithdrawTax(monthlyWithdraw);
        var months = monthlyWithdraw > 0 ? Math.floor(accountTotal / monthlyWithdraw) : 0;
        var withdrawTaxTotal = perMonth.tax * months;

        return {
            rules: r,
            rateTable: rateTable(),
            monthlyTable: monthlyTable(),
            years: years,
            contributionBase: yearly.contributionBase,
            personalRate: yearly.personalRate,
            employerRate: yearly.employerRate,
            exemptMonthly: yearly.exemptMonthly,
            taxablePersonalMonthly: yearly.taxablePersonalMonthly,
            employerMonthly: yearly.employerMonthly,
            annualExempt: yearly.annualExempt,
            annualDeferred: yearly.annualDeferred,
            accountTotal: accountTotal,
            taxableBefore: yearly.taxableBefore,
            taxableAfter: yearly.taxableAfter,
            taxBefore: yearly.taxBefore,
            taxAfter: yearly.taxAfter,
            taxSaved: yearly.taxSaved,
            totalTaxSaved: yearly.taxSaved * years,
            rate: yearly.rate,
            naiveSaved: yearly.naiveSaved,
            naiveGap: yearly.naiveGap,
            monthlyWithdraw: monthlyWithdraw,
            monthlyWithdrawRate: perMonth.rate,
            months: months,
            withdrawTaxTotal: withdrawTaxTotal,
            netBenefit: yearly.taxSaved * years - withdrawTaxTotal,
            worthIt: yearly.rate > perMonth.rate
        };
    }

    global.EuriskoAnnuityQuick = {
        rules: rules,
        rateTable: rateTable,
        monthlyTable: monthlyTable,
        bracketOf: bracketOf,
        monthlyWithdrawTax: monthlyWithdrawTax,
        contributionOf: contributionOf,
        compareOf: compareOf
    };
})(typeof window !== 'undefined' ? window : globalThis);
