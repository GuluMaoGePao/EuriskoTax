/**
 * 外籍个人津补贴免税 vs 专项附加扣除 —— 轻量实现（阶段15 15A-6）
 *
 * 为什么单独做一个 quick 文件：
 *   /seo/expat-allowance.html 只需要「这两条路哪条少交税、差多少」这一个结论，
 *   不值得为此引一遍完整年度汇算内核。但标准与税率表必须同源 ——
 *   所以本文件不复制任何数字：免税项目与到期日取注册表声明的 expatAllowanceRules，
 *   税率表取 comprehensiveTaxRates，两条路径的「少交的税」都直接调内核
 *   calculateTaxByTaxableIncome；政策剩余天数取注册表 statusOf（不自己算日期）。
 *   （对拍见 tests/expat-allowance-quick.test.js：少交的税 ≡ 内核两段计税之差。）
 *
 * 口径要点（错了就是把「二选一」算成叠加）：
 *   1. 两条路**只能选一条**：享受津补贴免税就不能同时扣专项附加扣除，反之亦然；
 *      一经选择，在一个纳税年度内不得变更；
 *   2. 免税与扣除都一样：降的是**应纳税所得额**，少交的税 = T(x) − T(x − 金额)，
 *      不是「金额 × 税率」—— 跨档时后者必然高估；
 *   3. 免税补贴须以**非现金形式或实报实销形式**取得（或按合理标准、经税务机关审核批准）；
 *   4. **本政策执行至 2027-12-31**：到期后（若未延续）只能走专项附加扣除。
 *      到期状态一律问注册表 statusOf，页面与速算都不自己算日期。
 */
(function (global) {
    'use strict';

    var registry = global.EuriskoTaxRegistry;

    function rules() {
        return (registry && registry.resolveParams('expat-allowance').rules) || global.expatAllowanceRules;
    }

    function rateTable() {
        return (registry && registry.resolveParams('expat-allowance').rates) || global.comprehensiveTaxRates;
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
     * 单条路径：降应纳税所得额后少交多少税（与 App 内核同一张表、同一条定档规则）。
     */
    function planOf(taxableBefore, amount) {
        var x = Math.max(0, toNumber(taxableBefore));
        var a = Math.max(0, toNumber(amount));
        var after = Math.max(0, x - a);
        var taxBefore = global.calculateTaxByTaxableIncome(x).tax;
        var taxAfter = global.calculateTaxByTaxableIncome(after).tax;
        var bracket = bracketOf(x);
        return {
            amount: a,
            taxableBefore: x,
            taxableAfter: after,
            usedAmount: x - after,
            taxBefore: taxBefore,
            taxAfter: taxAfter,
            saved: taxBefore - taxAfter,
            rate: bracket.rate,
            deductionForBracket: bracket.deduction,
            bracket: bracket,
            naiveSaved: a * bracket.rate,
            naiveGap: a * bracket.rate - (taxBefore - taxAfter)
        };
    }

    /**
     * 主计算：两条路径各算一次，给出更优方案与差额。
     *
     * @param {Object} input
     *   taxableBefore      扣除/免税前的全年应纳税所得额（元）
     *   allowanceAnnual    全年可免税的津补贴合计（元）
     *   specialAnnual      全年专项附加扣除合计（元）
     */
    function compareOf(input) {
        input = input || {};
        var r = rules();
        var taxableBefore = Math.max(0, toNumber(input.taxableBefore));
        var allowance = planOf(taxableBefore, input.allowanceAnnual);
        var special = planOf(taxableBefore, input.specialAnnual);
        var diff = allowance.saved - special.saved;
        var status = registry && registry.statusOf ? registry.statusOf('expat-allowance') : null;

        return {
            rules: r,
            rateTable: rateTable(),
            taxableBefore: taxableBefore,
            allowance: allowance,
            special: special,
            diff: diff,
            better: diff > 0 ? 'allowance' : (diff < 0 ? 'special' : 'same'),
            monthlyDiff: diff / 12,
            status: status,
            expiresOn: r.expiresOn,
            // 到期后（若未延续）只能走专项附加扣除，此时「少交的税」就是 special 这一条
            afterExpirySaved: special.saved,
            afterExpiryGap: allowance.saved - special.saved
        };
    }

    global.EuriskoExpatAllowanceQuick = {
        rules: rules,
        rateTable: rateTable,
        bracketOf: bracketOf,
        planOf: planOf,
        compareOf: compareOf
    };
})(typeof window !== 'undefined' ? window : globalThis);
