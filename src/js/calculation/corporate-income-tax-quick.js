/**
 * 企业所得税轻量实现（阶段15 15B-2）
 *
 * 与个税、增值税都不同源：这一档算的是企业**利润**（应纳税所得额），不是收入。
 * 规则（税率档、小微门槛、扣除限额比例）全部来自 tax-constants.js#corporateIncomeTaxRules，
 * 本文件不内置任何税率数字 —— 前台运营在后台改税率后，页面与本模块同口径生效。
 *
 * 三件必须口径正确、否则会误导人的事：
 *   1. 小型微利企业优惠是「**减按 25% 计入应纳税所得额**再按 20% 税率」，
 *      两档相乘 = 实际税负 5%，**不是**直接给了 5% 的税率；
 *   2. 小微三个条件（300 万 / 300 人 / 5000 万）是**且**的关系，且是**临界点**：
 *      任一超标即**全额**按 25% 计税，不是只对超出部分；
 *   3. 高新 15% 与小微 5% **不叠加**，符合条件时按孰优（本模块取税额最低者）。
 *
 * 暴露（同时挂 window，供内网后台/落地页/单测直接取用）：
 *   window.EuriskoCorporateQuick.{rules, enterpriseOf, dividendOf, deductionLimitOf}
 */
(function (global) {
    'use strict';

    function rulesOf() {
        if (global.EuriskoTaxConstants && global.EuriskoTaxConstants.corporateIncomeTaxRules) {
            return global.EuriskoTaxConstants.corporateIncomeTaxRules;
        }
        return global.corporateIncomeTaxRules || {};
    }

    function num(v, fallback) {
        var n = Number(v);
        if (!isFinite(n) || n < 0) return (fallback === undefined ? 0 : fallback);
        return n;
    }

    function round2(n) {
        return Math.round((n + Number.EPSILON) * 100) / 100;
    }

    /**
     * 企业所得税测算（含小型微利门槛判定与临界点提示）
     * @param {Object} input
     * @param {number} input.taxable  年应纳税所得额（元）
     * @param {number} input.staff    从业人数（人）
     * @param {number} input.assets   资产总额（元）
     * @param {boolean} input.highTech 是否高新技术企业
     * @param {boolean} input.restricted 是否属于国家限制和禁止行业
     */
    function enterpriseOf(input) {
        var rules = rulesOf();
        var small = rules.small || {};
        var statutoryRate = rules.statutoryRate === undefined ? 0.25 : rules.statutoryRate;
        input = input || {};

        var taxable = num(input.taxable);
        var staff = num(input.staff);
        var assets = num(input.assets);
        var highTech = !!input.highTech;
        var restricted = !!input.restricted;

        var taxableCap = small.taxableCap === undefined ? 3000000 : small.taxableCap;
        var staffCap = small.staffCap === undefined ? 300 : small.staffCap;
        var assetsCap = small.assetsCap === undefined ? 50000000 : small.assetsCap;
        var includedRatio = small.includedRatio === undefined ? 0.25 : small.includedRatio;
        var smallRate = small.rate === undefined ? 0.2 : small.rate;
        var highTechRate = rules.highTechRate === undefined ? 0.15 : rules.highTechRate;

        // 三个条件须同时满足（且非限制/禁止行业）—— 任一不满足即全额按法定税率
        var fails = [];
        if (taxable > taxableCap) fails.push('taxable');
        if (staff > staffCap) fails.push('staff');
        if (assets > assetsCap) fails.push('assets');
        if (restricted) fails.push('restricted');
        var qualified = fails.length === 0;

        var statutoryTax = round2(taxable * statutoryRate);
        var smallTax = qualified ? round2(taxable * includedRatio * smallRate) : null;
        var highTechTax = highTech ? round2(taxable * highTechRate) : null;

        // 择优：税额最低者（高新与小微不叠加）
        var regime = 'general';
        var tax = statutoryTax;
        var rate = statutoryRate;
        if (smallTax !== null && smallTax < tax) {
            regime = 'small';
            tax = smallTax;
            rate = smallRate;
        }
        if (highTechTax !== null && highTechTax < tax) {
            regime = 'highTech';
            tax = highTechTax;
            rate = highTechRate;
        }

        // 临界点：踩过 300 万那一刻（超出 1 元即全额按 25%）
        var cliffTax = round2((taxableCap + 1) * statutoryRate);
        var saving = round2(statutoryTax - tax);

        return {
            taxable: taxable,
            staff: staff,
            assets: assets,
            highTech: highTech,
            restricted: restricted,
            qualified: qualified,
            fails: fails,
            regime: regime,
            rate: rate,
            effectiveRate: taxable > 0 ? tax / taxable : 0,
            tax: tax,
            statutoryTax: statutoryTax,
            smallTax: smallTax,
            highTechTax: highTechTax,
            saving: saving,
            headroom: {
                taxable: taxableCap - taxable,   // 负数表示已超门槛
                staff: staffCap - staff,
                assets: assetsCap - assets
            },
            cliff: {
                over: taxableCap + 1,
                tax: cliffTax,
                gap: round2(cliffTax - tax)
            }
        };
    }

    /**
     * 税后利润分红到手（企业所得税 + 股息红利个税 20% 的两层税负）
     * @param {Object} input 同 enterpriseOf，但 taxable 位置传 profit（税前利润）
     */
    function dividendOf(input) {
        var rules = rulesOf();
        var dividendRate = (rules.dividend && rules.dividend.rate) || 0.2;
        input = input || {};
        var profit = num(input.profit !== undefined ? input.profit : input.taxable);
        var base = enterpriseOf({
            taxable: profit, staff: input.staff, assets: input.assets,
            highTech: input.highTech, restricted: input.restricted
        });
        var afterTax = round2(profit - base.tax);
        var dividendTax = round2(afterTax * dividendRate);
        var net = round2(afterTax - dividendTax);
        var totalTax = round2(base.tax + dividendTax);

        // 三档对照：假设分别按小微 / 高新 / 一般计税（高新与小微不叠加，这里只做对照展示）
        function compareWith(cit) {
            var at = round2(profit - cit);
            var dt = round2(at * dividendRate);
            return {
                cit: cit,
                afterTax: at,
                dividendTax: dt,
                net: round2(at - dt),
                burden: profit > 0 ? (cit + dt) / profit : 0
            };
        }
        var smallCit = round2(profit * (rules.small ? rules.small.includedRatio * rules.small.rate : 0.05));
        return {
            profit: profit,
            cit: base.tax,
            afterTax: afterTax,
            dividendTax: dividendTax,
            net: net,
            totalTax: totalTax,
            burden: profit > 0 ? totalTax / profit : 0,
            regime: base.regime,
            compare: {
                small: compareWith(base.qualified ? smallCit : null),
                highTech: compareWith(round2(profit * (rules.highTechRate || 0.15))),
                general: compareWith(round2(profit * (rules.statutoryRate || 0.25)))
            }
        };
    }

    /**
     * 常见扣除限额（税前扣除的三大「限额陷阱」）
     * @param {Object} input
     * @param {number} input.revenue      当年销售（营业）收入
     * @param {number} input.profit       年度利润总额（公益性捐赠以此为基数）
     * @param {number} input.entertainment 业务招待费发生额
     * @param {number} input.advertising   广告费和业务宣传费发生额
     * @param {number} input.donation      公益性捐赠支出
     */
    function deductionLimitOf(input) {
        var rules = rulesOf();
        var limits = rules.limits || {};
        input = input || {};
        var revenue = num(input.revenue);
        var profit = num(input.profit);
        var ent = num(input.entertainment);
        var ad = num(input.advertising);
        var don = num(input.donation);

        var entRule = limits.entertainment || { ratioOfAmount: 0.6, capOfRevenue: 0.005 };
        var adRule = limits.advertising || { capOfRevenue: 0.15 };
        var donRule = limits.donation || { capOfProfit: 0.12 };

        // 业务招待费：发生额的 60% 与收入 5‰ 孰低（两个上限都要过）
        var entDeductible = round2(Math.min(ent * entRule.ratioOfAmount, revenue * entRule.capOfRevenue));
        // 广宣费：收入 15% 以内，超出部分结转以后年度
        var adDeductible = round2(Math.min(ad, revenue * adRule.capOfRevenue));
        // 公益性捐赠：年度利润总额 12% 以内，超出部分结转以后三年
        var donDeductible = round2(Math.min(don, profit * donRule.capOfProfit));

        var addBack = round2((ent - entDeductible) + (ad - adDeductible) + (don - donDeductible));
        return {
            revenue: revenue,
            profit: profit,
            entertainment: {
                amount: ent,
                byAmount: round2(ent * entRule.ratioOfAmount),
                byRevenue: round2(revenue * entRule.capOfRevenue),
                deductible: entDeductible,
                addBack: round2(ent - entDeductible),
                carryForward: false
            },
            advertising: {
                amount: ad,
                byRevenue: round2(revenue * adRule.capOfRevenue),
                deductible: adDeductible,
                addBack: round2(ad - adDeductible),
                carryForward: true
            },
            donation: {
                amount: don,
                byProfit: round2(profit * donRule.capOfProfit),
                deductible: donDeductible,
                addBack: round2(don - donDeductible),
                carryForwardYears: donRule.carryForwardYears || 3
            },
            totalAddBack: addBack,
            adjustedProfit: round2(profit + addBack)
        };
    }

    var api = {
        rules: rulesOf,
        enterpriseOf: enterpriseOf,
        dividendOf: dividendOf,
        deductionLimitOf: deductionLimitOf
    };

    global.EuriskoCorporateQuick = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : this);
