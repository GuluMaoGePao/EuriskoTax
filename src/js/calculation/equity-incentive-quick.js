/**
 * 股权激励个税（股票期权 / 限制性股票 / 股票增值权 / 股权奖励）—— 轻量实现（阶段15 15A-2）
 *
 * 与 bonus / salary / annual-settlement / withholding 四个 quick 同一套思路
 * （见 docs/development/seo-landing-plan.md §2，阶段15 沿用同一套）：
 *   - 税率不复制：直接读 window.comprehensiveTaxRates（年度综合所得税率表），
 *     App 内核 calculateTaxByTaxableIncome 读的也是这张表；
 *   - 规则不复制：读 window.equityIncentiveRules（政策口径与到期日），
 *     由 tests/tax-registry.test.js 钉住「注册表 → 常量」这条链；
 *   - 由 tests/equity-incentive-quick.test.js 与内核在档位分界点及其 ±1 元、
 *     合并计税、非法输入上逐点对拍。
 *
 * 口径（财税〔2018〕164 号第二条 + 财政部 税务总局公告 2023 年第 25 号）：
 *   2027-12-31 前，居民个人取得符合条件的股权激励**不并入当年综合所得**，
 *   全额单独适用综合所得税率表：应纳税额 = 股权激励收入 × 适用税率 − 速算扣除数，
 *   且**不减除任何费用**（不扣 6 万元基本减除费用，也不扣专项附加扣除）。
 *   一个纳税年度内取得两次以上股权激励的，应**合并计算**。
 *
 * 页面上的「并入综合所得」为什么只是对照：
 *   现行政策下股权激励是「不并入」（与年终奖那种「可以选择并入」不同），
 *   所以本模块给出的 merged 是**假设政策到期后并入**的对照值 —— 用来判断
 *   「如果 2028 年起不再延续，会多交多少」。这一点在页面正文里也如实声明。
 *
 * 对外接口：window.EuriskoEquityQuick = {
 *   TYPES, rules, rateTable, incomeOf, bracketOf, taxSeparateOf, taxMergedOf, compareOf
 * }
 */
(function () {
    'use strict';

    var TYPES = ['option', 'restricted', 'appreciation', 'award'];

    function constants() {
        return (typeof window !== 'undefined' && window.EuriskoTaxConstants) || {};
    }

    function rules() {
        if (typeof window !== 'undefined' && window.equityIncentiveRules) return window.equityIncentiveRules;
        return constants().equityIncentiveRules || {};
    }

    // 税率表：按注册表声明的名字取（改表名仍只有一处要改），兜底年度综合所得税率表
    function rateTable() {
        var name = rules().rateTable || 'comprehensiveTaxRates';
        var table = (typeof window !== 'undefined' && window[name]) || constants()[name];
        return Array.isArray(table) && table.length ? table : (window.comprehensiveTaxRates || []);
    }

    function num(v) {
        var n = Number(v);
        return Number.isFinite(n) ? n : 0;
    }

    // 股权激励收入（= 应纳税所得额）
    //
    // input: { type, qty, price, cost, grantPrice }
    //   price       行权日 / 解禁日 / 取得日的每股公允价
    //   cost        每股施权价 / 每股出资额（股票增值权为「授权日每股价格」）
    //   grantPrice  限制性股票专用：股票登记日每股市价（与解禁日均价后再减出资）
    function incomeOf(type, input) {
        var args = input || {};
        if (TYPES.indexOf(type) === -1) return 0;
        var qty = Math.max(0, num(args.qty));
        var price = num(args.price);
        var cost = num(args.cost);
        var spread = 0;
        if (type === 'restricted') {
            // （登记日市价 + 解禁日市价）÷ 2 × 解禁份数 − 该批次出资额
            var grantPrice = num(args.grantPrice);
            spread = (grantPrice + price) / 2 - cost;
        } else {
            spread = price - cost;
        }
        return Math.max(0, spread * qty);
    }

    // 命中的税率档（合并后的计税基数全额单独适用年度表）
    function bracketOf(amount) {
        var rows = rateTable();
        var base = Math.max(0, num(amount));
        for (var i = 0; i < rows.length; i++) {
            if (base <= rows[i].max) return rows[i];
        }
        return rows.length ? rows[rows.length - 1] : null;
    }

    // 单独计税：应纳税额 = 计税基数（合并后）× 适用税率 − 速算扣除数，不减除费用
    function taxSeparateOf(amount) {
        var bracket = bracketOf(amount);
        if (!bracket) return 0;
        return Math.max(0, Math.max(0, num(amount)) * bracket.rate - bracket.deduction);
    }

    // 对照：假设并入综合所得（政策到期后）时的全年应纳税额
    //   otherTaxable = 全年其他综合所得的应纳税所得额（已扣 6 万元与各项扣除）
    function taxMergedOf(amount, otherTaxable) {
        var base = Math.max(0, num(amount)) + Math.max(0, num(otherTaxable));
        return taxSeparateOf(base);
    }

    // 一次性给出结论
    // input: { type, qty, price, cost, grantPrice, ytdIncome, otherTaxable }
    //   ytdIncome    本年度已计入的股权激励收入（两次以上须合并计算）
    function compareOf(input) {
        var args = input || {};
        var type = TYPES.indexOf(args.type) === -1 ? 'option' : args.type;
        var income = incomeOf(type, args);
        var ytd = Math.max(0, num(args.ytdIncome));
        var other = Math.max(0, num(args.otherTaxable));
        var base = income + ytd;

        var separate = taxSeparateOf(base);          // 现行：股权激励单独计税
        var otherTax = taxSeparateOf(other);         // 其他综合所得按年度表计税
        var mergedTotal = taxMergedOf(base, other);  // 假设并入后的全年应纳税额
        var separateTotal = separate + otherTax;
        var gap = mergedTotal - separateTotal;       // > 0：并入会多交（现行单独计税更省）

        return {
            type: type,
            income: income,
            ytd: ytd,
            base: base,
            separate: separate,
            otherTax: otherTax,
            separateTotal: separateTotal,
            mergedTotal: mergedTotal,
            gap: gap,
            effectiveRate: base > 0 ? separate / base : 0,
            direction: gap > 0 ? '并入更多交' : (gap < 0 ? '并入更省' : '持平')
        };
    }

    window.EuriskoEquityQuick = {
        TYPES: TYPES,
        rules: rules,
        rateTable: rateTable,
        incomeOf: incomeOf,
        bracketOf: bracketOf,
        taxSeparateOf: taxSeparateOf,
        taxMergedOf: taxMergedOf,
        compareOf: compareOf
    };
})();
