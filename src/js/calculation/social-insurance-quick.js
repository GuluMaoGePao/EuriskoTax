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

    /**
     * 阶段17 17C-3（v1.60.0）①：缴费基数 = **本人上年度月平均工资**，不是本月工资
     *
     * 速算器 `social-base` 的字段就叫「税前月薪」，compute 直接拿它当基数 ——
     * 于是「月薪 1 万 + 年终奖 12 万」的人基数被算成 1 万，而法定是 2 万：
     * 奖金、津贴补贴、加班工资都属于**工资总额**（国家统计局《关于工资总额组成的规定》），
     * 都要进缴费基数口径。上年度工作不满 12 个月的按**实际计薪月数**平均。
     *
     * 返回值里同时给出 `naiveBase`（只按本月固定工资核定的基数）——
     * 那正是速算器口径，两者的差就是「少缴了多少」。
     */
    function wageBaseOf(input) {
        input = input || {};
        var months = Math.max(Math.floor(num(input.paidMonths)) || 12, 1);
        var monthlyWage = num(input.monthlyWage);
        var allowance = num(input.monthlyAllowance);
        var overtime = num(input.monthlyOvertime);
        var bonus = num(input.annualBonus);

        var annualTotal = round((monthlyWage + allowance + overtime) * months + bonus);
        var monthlyAverage = round(annualTotal / months);

        var legal = baseOf({ wage: monthlyAverage, socialAverage: input.socialAverage });
        var naive = baseOf({ wage: monthlyWage, socialAverage: input.socialAverage });

        return {
            months: months,
            monthlyWage: monthlyWage,
            monthlyAllowance: allowance,
            monthlyOvertime: overtime,
            annualBonus: bonus,
            annualTotal: annualTotal,
            monthlyAverage: monthlyAverage,
            socialAverage: legal.socialAverage,
            base: legal.base,
            baseMin: legal.min,
            baseMax: legal.max,
            clamped: legal.clamped,
            // 速算器口径：只按本月固定工资核定（用于「差多少」的对照）
            naiveBase: naive.base,
            naiveClamped: naive.clamped,
            gap: round(legal.base - naive.base)
        };
    }

    /**
     * ② 住房公积金免税的**两个上限是「且」的关系**（财税〔2006〕10 号）
     *
     * 免税要同时满足：缴存比例 ≤ 12% **且** 缴存基数 ≤ 设区城市上年度职工月平均工资 × 3。
     * 公积金基数可与社保基数不同（部分地区另行公布上下限），所以这里单独收 ——
     * 速算器内部算了这个数，但**没有暴露公积金基数这一栏**，用户填不了。
     */
    function housingTaxFreeOf(input) {
        input = input || {};
        var fund = R.housingFund;
        var base = num(input.housingBase);
        var rate = resolveRate(input.housingRate, fund.defaultRate, fund.minRate, fund.maxRate);
        var socialAverage = num(input.socialAverage);
        var personal = round(base * rate);

        var capBase = socialAverage > 0
            ? Math.min(base, round(fund.taxFreeBaseCapRatio * socialAverage))
            : base;
        var taxFree = round(Math.min(rate, fund.taxFreeRateCap) * capBase);

        return {
            housingBase: base,
            housingRate: rate,
            personal: personal,
            capBase: capBase,
            capRate: fund.taxFreeRateCap,
            capRatio: fund.taxFreeBaseCapRatio,
            taxFree: taxFree,
            taxable: Math.max(round(personal - taxFree), 0),
            // 超标的来源：基数超社平 3 倍就会超标（比例被法定夹在 12% 以内，超不了）
            exceededBase: Math.max(round(base - capBase), 0),
            note: fund.taxFreeNote
        };
    }

    /**
     * ④ 灵活就业人员参保 —— 与单位职工是**两套制度**
     *
     * 养老保险按 20% 缴纳，全部由个人承担（单位职工是单位 16% + 个人 8%）；
     * 其中 8% 记入个人账户、12% 记入统筹基金。基数在当地社平 60%~300% 之间**自选** ——
     * 这与单位职工「按本人上年度月平均工资定」根本不同。
     * 最该说清的是：**统筹部分不退还**，断缴 / 身故 / 出国定居只退个人账户那 8%。
     */
    function flexibleOf(input) {
        input = input || {};
        var f = R.flexible || {};
        var average = num(input.socialAverage);
        var level = num(input.level) || 0.6;
        var base = round(average * level);

        var pensionRate = f.pensionRate === undefined ? 0.2 : f.pensionRate;
        var accountRate = f.personalAccountRate === undefined ? 0.08 : f.personalAccountRate;
        var poolRate = f.poolRate === undefined ? 0.12 : f.poolRate;
        var medicalRate = f.medicalRate === undefined ? 0.09 : f.medicalRate;

        var pensionMonthly = round(base * pensionRate);
        var accountMonthly = round(base * accountRate);
        var poolMonthly = round(base * poolRate);
        var medicalMonthly = input.withMedical === false ? 0 : round(base * medicalRate);

        return {
            socialAverage: average,
            level: level,
            base: base,
            pensionRate: pensionRate,
            personalAccountRate: accountRate,
            poolRate: poolRate,
            medicalRate: input.withMedical === false ? 0 : medicalRate,
            withMedical: input.withMedical !== false,
            pensionMonthly: pensionMonthly,
            personalAccountMonthly: accountMonthly,
            poolMonthly: poolMonthly,
            medicalMonthly: medicalMonthly,
            monthlyTotal: round(pensionMonthly + medicalMonthly),
            annualTotal: round((pensionMonthly + medicalMonthly) * 12),
            annualPension: round(pensionMonthly * 12),
            annualPersonalAccount: round(accountMonthly * 12),
            annualPool: round(poolMonthly * 12),
            annualMedical: round(medicalMonthly * 12),
            // 「缴了 11520，只有 3840 是自己的」—— 断缴 / 身故 / 出国定居只退这一部分
            refundableRate: pensionRate > 0 ? accountRate / pensionRate : 0,
            note: f.note || '',
            refundNote: f.refundNote || ''
        };
    }

    /**
     * ③ 申报基数不足额的代价（《社会保险法》第八十六条）
     *
     * 用人单位未按时足额缴纳的：责令限期补缴 + 自欠缴之日起按日加收**万分之五**滞纳金
     * （年化 18.25%）+ 逾期仍不缴的处欠缴数额 **1 倍以上 3 倍以下**罚款。
     * 滞纳金按「平均欠缴时长 = 追溯年数 ÷ 2」估算（每月欠缴的时长不同，取中值）。
     */
    function complianceGapOf(input) {
        input = input || {};
        var c = R.compliance || {};
        var actual = num(input.actualBase);
        var declared = num(input.declaredBase);
        var years = Math.max(num(input.years), 1);
        var months = Math.round(years * 12);
        // 申报基数填 0 / 留空 = 按核定基数足额申报，此时没有差额
        var gapBase = declared > 0 ? Math.max(round(actual - declared), 0) : 0;

        var items = R.items || [];
        var employerRate = items.reduce(function (s, it) { return s + it.employerRate; }, 0);
        var personalRate = items.reduce(function (s, it) { return s + it.personalRate; }, 0);

        var monthlyEmployerGap = round(gapBase * employerRate);
        var monthlyPersonalGap = round(gapBase * personalRate);
        var annualGap = round((monthlyEmployerGap + monthlyPersonalGap) * 12);

        var dailyRate = c.lateFeeDailyRate === undefined ? 0.0005 : c.lateFeeDailyRate;
        // 按「平均欠缴时长 = 追溯年数 ÷ 2 年」估算：欠缴总额 × 日万分之五 × 平均天数
        var totalArrears = round(annualGap * years);
        var lateFee = round(totalArrears * dailyRate * 365 * (years / 2));
        var penaltyMin = round(totalArrears * (c.penaltyMin === undefined ? 1 : c.penaltyMin));
        var penaltyMax = round(totalArrears * (c.penaltyMax === undefined ? 3 : c.penaltyMax));

        return {
            actualBase: actual,
            declaredBase: declared,
            gapBase: gapBase,
            years: years,
            months: months,
            employerRate: employerRate,
            personalRate: personalRate,
            monthlyEmployerGap: monthlyEmployerGap,
            monthlyPersonalGap: monthlyPersonalGap,
            monthlyGap: round(monthlyEmployerGap + monthlyPersonalGap),
            annualGap: annualGap,
            totalArrears: totalArrears,
            lateFeeDailyRate: dailyRate,
            lateFee: lateFee,
            penaltyMin: penaltyMin,
            penaltyMax: penaltyMax,
            totalMin: round(totalArrears + lateFee + penaltyMin),
            totalMax: round(totalArrears + lateFee + penaltyMax),
            compliant: gapBase <= 0,
            note: c.note || ''
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
        var hf = housingTaxFreeOf({
            housingBase: housingBase, housingRate: input.housingRate,
            socialAverage: baseInfo.socialAverage
        });
        var housingTaxFree = hf.taxFree;
        var housingTaxable = hf.taxable;

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
        scheduleOf: scheduleOf,
        wageBaseOf: wageBaseOf,
        housingTaxFreeOf: housingTaxFreeOf,
        flexibleOf: flexibleOf,
        complianceGapOf: complianceGapOf
    };
})();
