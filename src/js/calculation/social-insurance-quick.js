// 社保公积金（五险一金）的轻量实现（阶段15 15C-1）
//
// 与 vat-quick.js / surtax-stamp-quick.js 同一套做法：**不复制费率**，
// 费率与基数规则全部来自 tax-constants.js 的 socialInsuranceRules，页面读本文件。
//
// 这一页要钉住的三件事（比费率的数字更容易写错）：
//   1. **缴费基数不是工资**：本人上年度月平均工资，低于当地社平工资 **60%** 的按 60% 保底、
//      高于 **300%** 的按 300% 封顶 —— 工资 3000 元按下限缴，工资 5 万元只按 3 倍封顶数缴；
//   2. **工伤、生育个人不缴**（生育已并入职工医保）：算「到手工资」时不能把这两项扣掉；
//   3. **公积金不是缴多少都免税**：比例 ≤ 12% 且基数 ≤ 社平 3 倍的部分才免征个税
//      （财税〔2006〕10 号），超出部分要并回工资计税。
//
// 个税部分复用工资薪金的**累计预扣**口径（与 salary-tax-quick.js / 内核同构）：
// 逐月累加应纳税所得额后查年度表，本月税额 = 截至本月累计 − 截至上月累计 ——
// 这正是「到手工资逐月变少」的来源，tests/social-insurance-quick.test.js 与内核对拍。
(function () {
    'use strict';

    var C = window.EuriskoTaxConstants;
    var R = C.socialInsuranceRules;

    function num(value) {
        var n = Number(String(value === null || value === undefined ? '' : value).replace(/,/g, '').trim());
        return isFinite(n) && n > 0 ? n : 0;
    }

    function round(n) {
        return Math.round((Number(n) || 0) * 100 + Number.EPSILON) / 100;
    }

    // 比例：空值/非法值退回默认，并夹在 [min, max] 内（公积金 5%~12% 是硬约束）
    // 注意：Number('') === 0 是有限数，所以空值必须先判空再转换，否则「未填」会被当成 0%
    function resolveRate(value, fallback, min, max) {
        var s = String(value === null || value === undefined ? '' : value).replace(/,/g, '').trim();
        var n = s === '' ? fallback : Number(s);
        if (!isFinite(n) || n < 0) n = fallback;
        if (typeof min === 'number' && n < min) n = min;
        if (typeof max === 'number' && n > max) n = max;
        return n;
    }

    // 缴费基数：60% 保底 / 300% 封顶（社平工资未知时按本人工资原样）
    function baseOf(input) {
        input = input || {};
        var wage = num(input.wage);
        var average = num(input.socialAverage);
        var min = round(average * R.base.lowerRatio);
        var max = round(average * R.base.upperRatio);
        var base = wage;
        var clamped = 'within';
        if (wage <= 0) {
            // 没填工资就不该算出「按下限缴 1080 元」这种结论：保底只对有工资的人有意义
            base = 0;
            clamped = 'none';
        } else if (average > 0) {
            if (base < min) {
                base = min;
                clamped = 'below';
            } else if (base > max) {
                base = max;
                clamped = 'above';
            }
        }
        return {
            wage: wage,
            socialAverage: average,
            min: min,
            max: max,
            base: round(base),
            clamped: clamped,
            note: R.base.note
        };
    }

    // 五险一金：个人与单位分项 + 公积金免税额度（超出部分要并回工资计税）
    function socialInsuranceOf(input) {
        input = input || {};
        var baseInfo = baseOf(input);
        var base = baseInfo.base;
        var fund = R.housingFund;
        var rate = resolveRate(input.housingRate, fund.defaultRate, fund.minRate, fund.maxRate);
        // 公积金基数多数地区与社保基数一致，允许单独指定（部分地区上下限不同）
        var housingBase = num(input.housingBase) > 0 ? num(input.housingBase) : base;
        var overrides = input.employerRates || {};

        var items = R.items.map(function (it) {
            var employerRate = resolveRate(overrides[it.key], it.employerRate, 0, 1);
            return {
                key: it.key,
                name: it.name,
                personalRate: it.personalRate,
                employerRate: employerRate,
                personal: round(base * it.personalRate),
                employer: round(base * employerRate),
                note: it.note
            };
        });

        var personalInsurance = round(items.reduce(function (s, it) { return s + it.personal; }, 0));
        var employerInsurance = round(items.reduce(function (s, it) { return s + it.employer; }, 0));
        var housingPersonal = round(housingBase * rate);
        var housingEmployer = round(housingBase * rate);

        // 免税上限：比例 12% 与「社平 3 倍」两个条件同时满足（社平未知时不封顶）
        var taxFreeBase = baseInfo.socialAverage > 0
            ? Math.min(housingBase, round(fund.taxFreeBaseCapRatio * baseInfo.socialAverage))
            : housingBase;
        var housingTaxFree = round(Math.min(rate, fund.taxFreeRateCap) * taxFreeBase);
        var housingTaxable = Math.max(round(housingPersonal - housingTaxFree), 0);

        var personalTotal = round(personalInsurance + housingPersonal);
        var employerTotal = round(employerInsurance + housingEmployer);

        return {
            wage: baseInfo.wage,
            socialAverage: baseInfo.socialAverage,
            baseMin: baseInfo.min,
            baseMax: baseInfo.max,
            base: base,
            clamped: baseInfo.clamped,
            baseNote: baseInfo.note,
            housingBase: housingBase,
            housingRate: rate,
            items: items,
            personalInsurance: personalInsurance,
            employerInsurance: employerInsurance,
            housingPersonal: housingPersonal,
            housingEmployer: housingEmployer,
            personalTotal: personalTotal,
            employerTotal: employerTotal,
            housingTaxFree: housingTaxFree,
            housingTaxable: housingTaxable,
            personalRate: baseInfo.wage > 0 ? personalTotal / baseInfo.wage : 0,   // 个人扣缴占工资
            employerRate: baseInfo.wage > 0 ? employerTotal / baseInfo.wage : 0,   // 单位缴纳占工资
            statutoryPersonalRate: items.reduce(function (s, it) { return s + it.personalRate; }, 0) + rate
        };
    }

    function resolveTable(table) {
        if (Array.isArray(table) && table.length) return table;
        if (Array.isArray(window.comprehensiveTaxRates)) return window.comprehensiveTaxRates;
        if (C && Array.isArray(C.comprehensiveTaxRates)) return C.comprehensiveTaxRates;
        return [];
    }

    function monthlyTaxableOf(income, deduction, special, basic) {
        var v = income - basic - deduction - special;
        return v > 0 ? v : 0;
    }

    function bracketOf(cumulativeTaxable, rows) {
        var amount = Number(cumulativeTaxable);
        if (!isFinite(amount) || amount <= 0 || !rows.length) return null;
        for (var i = 0; i < rows.length; i++) {
            if (amount <= rows[i].max) return rows[i];
        }
        return null;
    }

    function cumulativeTaxOf(cumulativeTaxable, rows) {
        var bracket = bracketOf(cumulativeTaxable, rows);
        if (!bracket) return 0;
        return cumulativeTaxable * bracket.rate - bracket.deduction;
    }

    // 逐月预扣明细（与 salary-tax-quick.js 同构：逐月相加而非「单月 × 月数」）
    function scheduleOf(perMonthTaxable, months, rows) {
        var m = Math.floor(Number(months));
        if (!isFinite(m) || m <= 0) return [];
        var out = [];
        var prev = 0;
        var cumulativeTaxable = 0;
        for (var k = 1; k <= m; k++) {
            cumulativeTaxable += perMonthTaxable;
            var cumulative = cumulativeTaxOf(cumulativeTaxable, rows);
            out.push(round(cumulative - prev));
            prev = cumulative;
        }
        return out;
    }

    // 到手工资：工资 − 个人五险一金 − 个税（累计预扣）
    function netSalaryOf(input) {
        input = input || {};
        var s = socialInsuranceOf(input);
        var special = num(input.specialMonthly);
        var table = resolveTable(input.table);
        // 税前扣除只含「免税部分」的公积金，超标部分随工资计税
        var perMonth = monthlyTaxableOf(s.wage, round(s.personalInsurance + s.housingTaxFree), special, R.basicDeduction);
        var schedule = scheduleOf(perMonth, 12, table);
        var annualTax = round(schedule.reduce(function (a, b) { return a + b; }, 0));
        var wage = s.wage;

        var netOf = function (month) {
            var tax = schedule[month - 1] || 0;
            return round(wage - s.personalTotal - tax);
        };

        return {
            social: s,
            wage: wage,
            base: s.base,
            clamped: s.clamped,
            personalTotal: s.personalTotal,
            housingRate: s.housingRate,
            housingTaxFree: s.housingTaxFree,
            housingTaxable: s.housingTaxable,
            specialMonthly: special,
            basicDeduction: R.basicDeduction,
            monthlyTaxable: perMonth,
            schedule: schedule,
            tax1: schedule[0] || 0,
            tax6: schedule[5] || 0,
            tax12: schedule[11] || 0,
            net1: netOf(1),
            net6: netOf(6),
            net12: netOf(12),
            annualTax: annualTax,
            annualNet: round(wage * 12 - s.personalTotal * 12 - annualTax),
            annualGross: round(wage * 12),
            taxRate: wage > 0 ? annualTax / (wage * 12) : 0,
            netRate: wage > 0 ? (wage * 12 - s.personalTotal * 12 - annualTax) / (wage * 12) : 0
        };
    }

    // 企业用工成本：工资 + 单位五险一金（员工到手只占其中一部分）
    function employerCostOf(input) {
        input = input || {};
        var s = socialInsuranceOf(input);
        var headcount = Math.max(Math.floor(num(input.headcount)) || 1, 1);
        var monthlyPerPerson = round(s.wage + s.employerTotal);
        var monthly = round(monthlyPerPerson * headcount);
        var annual = round(monthly * 12);
        var net = netSalaryOf(input);

        return {
            social: s,
            wage: s.wage,
            headcount: headcount,
            employerTotal: s.employerTotal,
            personalTotal: s.personalTotal,
            monthlyPerPerson: monthlyPerPerson,
            monthly: monthly,
            annual: annual,
            multiple: s.wage > 0 ? monthlyPerPerson / s.wage : 0,        // 企业成本 / 工资
            netShare: annual > 0 ? (net.annualNet * headcount) / annual : 0, // 员工到手 / 企业成本
            annualNetPerPerson: net.annualNet,
            annualTaxPerPerson: net.annualTax
        };
    }

    window.EuriskoSocialQuick = {
        rules: function () { return R; },
        baseOf: baseOf,
        socialInsuranceOf: socialInsuranceOf,
        netSalaryOf: netSalaryOf,
        employerCostOf: employerCostOf,
        scheduleOf: scheduleOf
    };
})();
