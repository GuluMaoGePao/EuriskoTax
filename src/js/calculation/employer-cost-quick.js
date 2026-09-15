// 企业用工成本测算的轻量实现（阶段15 15C-3）
//
// 主线：**1 万元工资 ≠ 1 万元成本**。企业实际支出 = 税前工资 + 单位缴纳的五险一金，
// 而这个「倍数」不是常数 —— 这是本页要钉住的第一件事：
//   · 工资越低，倍数**越高**（缴费基数按社平 60% 保底，低工资也要按下限缴，单位部分跑不掉）；
//   · 工资越高，倍数**越低**（300% 封顶后单位部分不再增加，摊到高工资上占比变小）。
//
// 三件比算法更容易写错的事：
//   1. 单位缴纳与个人缴纳**共用同一套缴费基数**（本人上年度月平均工资，60% 保底 / 300% 封顶），
//      不是按当月工资原样算 —— 所以「工资 3000 元」的单位成本并不比「工资 4800 元」低多少；
//   2. 公积金是**双边**的：谈「12% 公积金」时企业还要再出同比例的一份（个人 12% + 单位 12%）；
//   3. 涨薪的成本不是涨薪额：未封顶时企业每月多付的 ≈ 涨薪额 × 1.395（工资 + 单位部分），
//      而员工全年到手只多一半左右 —— 中间的差额就是「涨薪传递率」。
//
// 口径全部复用 social-insurance-quick.js（费率与基数规则来自 tax-constants.js 的
// socialInsuranceRules，页面上不出现第二份口径；个税同样走累计预扣）。
(function () {
    'use strict';

    var Social = window.EuriskoSocialQuick;

    function num(value) {
        var n = Number(String(value === null || value === undefined ? '' : value).replace(/,/g, '').trim());
        return isFinite(n) && n > 0 ? n : 0;
    }

    function round(n) {
        return Math.round((Number(n) || 0) * 100 + Number.EPSILON) / 100;
    }

    // 正算：税前月薪 → 企业实际用工成本（含单位五险一金 + 人数放大）
    function costOf(input) {
        input = input || {};
        var s = Social.socialInsuranceOf(input);
        var headcount = Math.max(Math.floor(num(input.headcount)) || 1, 1);
        var wage = s.wage;
        var monthlyPerPerson = round(wage + s.employerTotal);
        var annualPerPerson = round(monthlyPerPerson * 12);
        var net = Social.netSalaryOf(input);
        var netAnnual = net.annualNet;

        return {
            social: s,
            wage: wage,
            base: s.base,
            baseMin: s.baseMin,
            baseMax: s.baseMax,
            clamped: s.clamped,
            headcount: headcount,
            employerInsurance: s.employerInsurance,
            employerHousing: s.housingEmployer,
            employerTotal: s.employerTotal,
            personalInsurance: s.personalInsurance,
            personalHousing: s.housingPersonal,
            personalTotal: s.personalTotal,
            monthlyPerPerson: monthlyPerPerson,
            monthlyTotal: round(monthlyPerPerson * headcount),
            annualPerPerson: annualPerPerson,
            annualTotal: round(monthlyPerPerson * headcount * 12),
            // 成本倍数 = 企业人均月成本 / 税前工资（不是常数：低工资更高）
            multiple: wage > 0 ? monthlyPerPerson / wage : 0,
            // 员工侧：到手（年人均）与个税
            netMonthly: round(netAnnual / 12),
            netAnnual: netAnnual,
            annualTax: net.annualTax,
            // 到手占比 = 员工真正拿到手的 / 企业实际花掉的（剩下的都是社保、公积金与个税）
            netShare: annualPerPerson > 0 ? netAnnual / annualPerPerson : 0,
            // 「中间差额」：企业花了但员工没拿到手的部分（单位五险一金 + 个人五险一金 + 个税）
            wedge: round(annualPerPerson - netAnnual),
            // 单位成本占工资比（不含个人部分）
            employerRate: wage > 0 ? s.employerTotal / wage : 0
        };
    }

    // 给定税前工资时的人均月成本（倒算的目标函数：随工资单调不减）
    function monthlyCostAt(wage, input) {
        return Social.employerCostOf(Object.assign({}, input, { wage: wage })).monthlyPerPerson;
    }

    // 倒算：给定人均用工预算（元/月），反推能开多少税前月薪
    //
    // 为什么能二分：成本(w) = w + 单位缴纳(w)，两项都随 w 单调不减，所以成本单调；
    // 又因成本(w) ≥ w，所以 w = 预算 天然是一个够用的上界（在预算处成本必然 ≥ 预算）。
    function solveOf(input) {
        input = input || {};
        var budget = num(input.budgetMonthly);
        var empty = {
            budgetMonthly: budget,
            wage: 0,
            wageHundred: 0,
            converged: false,
            gap: budget,
            iterations: 0
        };
        if (!Social || !budget) return empty;

        var lo = 0;
        var hi = budget;
        var iterations = 0;
        // 理论上 hi = budget 已够用；极端参数（自定义超高单位费率）下再翻倍兜底
        while (monthlyCostAt(hi, input) < budget && iterations < 40) {
            hi *= 2;
            iterations += 1;
        }
        if (monthlyCostAt(hi, input) < budget) return Object.assign(empty, { iterations: iterations });

        for (var i = 0; i < 80 && hi - lo > 0.01; i++) {
            var mid = (lo + hi) / 2;
            if (monthlyCostAt(mid, input) >= budget) {
                hi = mid;
            } else {
                lo = mid;
            }
            iterations += 1;
        }

        // 向下取整到分：保证「按这个工资发，成本不超过预算」
        var wage = round(Math.floor(hi * 100) / 100);
        var cost = costOf(Object.assign({}, input, { wage: wage }));

        return {
            budgetMonthly: budget,
            wage: wage,
            wageHundred: Math.floor(wage / 100) * 100,        // 取整到百元（定薪常用）
            social: cost.social,
            personalTotal: cost.personalTotal,
            monthlyPerPerson: cost.monthlyPerPerson,
            annualPerPerson: cost.annualPerPerson,
            multiple: cost.multiple,
            netMonthly: cost.netMonthly,
            netAnnual: cost.netAnnual,
            annualTax: cost.annualTax,
            netShare: cost.netShare,
            gap: round(budget - cost.monthlyPerPerson),        // 预算剩余（≥ 0）
            converged: true,
            iterations: iterations
        };
    }

    // 涨薪成本：税前多 step 元，企业每年多花多少、员工多拿到多少
    //
    // 两个方向都算，是因为它们差得很远：企业多付的钱里，只有一部分变成员工到手
    // （剩下的走了单位五险一金、个人五险一金与累进个税）—— 这个比值就是**传递率**。
    function raiseOf(input, step) {
        var delta = num(step) > 0 ? num(step) : 1000;
        var base = costOf(input);
        var wage = base.wage;
        var higher = costOf(Object.assign({}, input, { wage: wage + delta }));
        var extraCostMonthly = round(higher.monthlyPerPerson - base.monthlyPerPerson);
        var extraCostAnnual = round(extraCostMonthly * 12);
        var extraNetAnnual = round(higher.netAnnual - base.netAnnual);

        return {
            step: delta,
            wage: wage,
            gross: round(wage + delta),
            extraCostMonthly: extraCostMonthly,
            extraCostAnnual: extraCostAnnual,
            extraNetMonthly: round(extraNetAnnual / 12),
            extraNetAnnual: extraNetAnnual,
            // 成本放大倍数：企业涨薪 1 元，实际每月多付多少（未封顶 ≈ 1.395，封顶后 = 1）
            costMultiple: delta > 0 ? extraCostMonthly / delta : 0,
            // 传递率：企业多花的钱里，最终到员工手上的比例
            passThrough: extraCostAnnual > 0 ? extraNetAnnual / extraCostAnnual : 0
        };
    }

    // 对照表：同一套参数下不同工资档位的用工成本（页面静态表与测试共用同一份算法）
    function tableOf(wages, input) {
        var list = Array.isArray(wages) ? wages : [];
        return list.map(function (wage) {
            var r = costOf(Object.assign({}, input, { wage: wage, headcount: 1 }));
            return {
                wage: round(wage),
                base: r.base,
                clamped: r.clamped,
                employerTotal: r.employerTotal,
                monthlyPerPerson: r.monthlyPerPerson,
                annualPerPerson: r.annualPerPerson,
                multiple: r.multiple,
                netMonthly: r.netMonthly,
                netShare: r.netShare
            };
        });
    }

    window.EuriskoEmployerCostQuick = {
        costOf: costOf,
        solveOf: solveOf,
        raiseOf: raiseOf,
        tableOf: tableOf,
        monthlyCostAt: monthlyCostAt
    };
})();
