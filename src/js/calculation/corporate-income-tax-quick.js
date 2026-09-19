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

    /**
     * 阶段17 17C-2（v1.59.0）：小微三条件的**全年季度平均值**
     *
     * 从业人数与资产总额不是「期末数」而是全年季度平均值（国家税务总局公告 2019 年第 2 号）：
     *   季度平均值 =（季初值 + 季末值）÷ 2
     *   全年季度平均值 = 全年各季度平均值之和 ÷ 4
     * 所以 12 月 31 日裁员到 300 人以下**不改变**判定结果 —— 速算器只收一个数，
     * 把「填哪个数」推给了用户，而这里正是最容易踩空的一处。
     *
     * @param {Array<{begin:number,end:number}>} quarters 四个季度的季初 / 季末值
     */
    function quarterlyAverageOf(quarters) {
        var list = Array.isArray(quarters) ? quarters.filter(function (q) { return q && isFinite(Number(q.begin)) && isFinite(Number(q.end)); }) : [];
        var per = list.map(function (q) { return (num(q.begin) + num(q.end)) / 2; });
        var annual = per.length ? per.reduce(function (a, b) { return a + b; }, 0) / per.length : 0;
        return {
            quarters: per,
            annualAverage: annual,
            yearEnd: list.length ? num(list[list.length - 1].end) : 0,   // 期末数：看着符合，其实不算数
            count: per.length
        };
    }

    /**
     * 研发费用加计扣除（财税〔2015〕119 号 + 后续提高比例的文件）
     *
     * 加计扣除直接**减少应纳税所得额**，所以够得着 300 万门槛时会**整档掉到 5%** ——
     * 边际收益在临界点是跳变的，不是线性的：同样是 100 万研发费，25% 档省 25 万，
     * 5% 档只省 5 万，但把 344 万压回 244 万时省的是 73.8 万。
     *
     * @param {Object} input
     * @param {number} input.expense     可归集的研发费用
     * @param {boolean} input.capitalized 是否形成无形资产（按成本 200% 摊销，不是当期 100% 加计）
     * @param {string} input.industry    行业（负面清单行业不得加计）
     * @param {boolean} input.advanced   集成电路 / 工业母机企业（120%）
     */
    function rdSuperDeductionOf(input) {
        var rules = rulesOf();
        var rd = rules.rdSuperDeduction || {};
        input = input || {};

        var excluded = (rd.excluded || []).some(function (x) { return x.key === input.industry; });
        var expense = num(input.expense);
        var ratio = input.advanced ? (rd.advancedRatio === undefined ? 1.2 : rd.advancedRatio)
            : (rd.ratio === undefined ? 1 : rd.ratio);
        var capitalizedRatio = rd.capitalizedRatio === undefined ? 2 : rd.capitalizedRatio;

        // 形成无形资产：按成本的 200% 摊销（当期不额外加计，口径不同，这里给的是年度摊销额的口径）
        var superDeduction = excluded ? 0 : round2(expense * ratio);
        return {
            expense: expense,
            ratio: excluded ? 0 : ratio,
            capitalized: !!input.capitalized,
            capitalizedRatio: capitalizedRatio,
            excluded: excluded,
            excludedLabel: excluded ? ((rd.excluded || []).filter(function (x) { return x.key === input.industry; })[0] || {}).label : '',
            superDeduction: superDeduction,
            note: excluded ? '负面清单行业不得加计扣除' : '按 ' + Math.round(ratio * 100) + '% 加计扣除'
        };
    }

    /**
     * 以前年度亏损弥补台账 —— 亏损**会过期作废**
     *
     * 一般企业结转年限 5 年；当年具备高新技术企业或科技型中小企业资格的延长至 10 年
     * （精确口径：限于具备资格年度**之前 5 个年度**发生的尚未弥补完的亏损）。
     * 速算器只收一个「可弥补以前年度亏损」数字，不问这笔亏损是哪一年、还在不在弥补期 ——
     * 于是「十年前那笔巨亏」常被当成今天还能抵的税盾。
     *
     * @param {Object} input
     * @param {Array<{year:number,amount:number}>} input.losses 亏损台账（往年亏损年度 + 金额）
     * @param {number} input.currentYear  当前汇算年度
     * @param {boolean} input.extended    是否具备延长资格（高新 / 科技型中小企业）
     * @param {number} input.limit        当期可用于弥补的所得额上限（应纳税所得额）
     */
    function lossCarryOf(input) {
        var rules = rulesOf();
        var lc = rules.lossCarryForward || {};
        input = input || {};

        var years = lc.years === undefined ? 5 : lc.years;
        var extendedYears = lc.extendedYears === undefined ? 10 : lc.extendedYears;
        var currentYear = num(input.currentYear, new Date().getFullYear());
        var extended = !!input.extended;
        var limit = num(input.limit);

        // 先到期的先弥补（到期年度升序）
        var items = (Array.isArray(input.losses) ? input.losses : [])
            .filter(function (x) { return x && isFinite(Number(x.year)) && num(x.amount) > 0; })
            .map(function (x) { return { year: Math.round(num(x.year)), amount: num(x.amount) }; })
            .sort(function (a, b) { return a.year - b.year; });

        var remaining = limit;
        var usableTotal = 0, expiredTotal = 0;
        var rows = items.map(function (x) {
            var deadline = x.year + years;
            var deadlineExtended = x.year + extendedYears;
            var alive = currentYear <= deadline;
            var aliveIfExtended = currentYear <= deadlineExtended;
            var ok = extended ? aliveIfExtended : alive;
            var used = ok ? Math.min(x.amount, remaining) : 0;
            remaining = round2(remaining - used);
            if (ok) usableTotal += used; else expiredTotal += x.amount;
            return {
                year: x.year,
                amount: x.amount,
                deadline: deadline,
                deadlineExtended: deadlineExtended,
                alive: alive,
                aliveIfExtended: aliveIfExtended,
                usable: ok,
                used: used,
                remainingUnused: round2(ok ? x.amount - used : x.amount)
            };
        });

        return {
            currentYear: currentYear,
            years: years,
            extendedYears: extendedYears,
            extended: extended,
            rows: rows,
            total: round2(usableTotal),
            expired: round2(expiredTotal),
            carryOn: round2(rows.reduce(function (a, x) { return a + (x.usable ? x.remainingUnused : 0); }, 0)),
            // 延长资格能救回多少（勾选前后的差额）—— 这是「要不要去申请科技型中小企业」的答案
            rescuable: round2(rows.reduce(function (a, x) { return a + (!x.alive && x.aliveIfExtended ? x.amount : 0); }, 0))
        };
    }

    var api = {
        rules: rulesOf,
        enterpriseOf: enterpriseOf,
        dividendOf: dividendOf,
        deductionLimitOf: deductionLimitOf,
        quarterlyAverageOf: quarterlyAverageOf,
        rdSuperDeductionOf: rdSuperDeductionOf,
        lossCarryOf: lossCarryOf
    };

    global.EuriskoCorporateQuick = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : this);
