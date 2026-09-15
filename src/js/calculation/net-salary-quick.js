// 税后工资 / 谈薪倒算的轻量实现（阶段15 15C-2）
//
// 正向是「税前 → 到手」，这一页是反向：**已知想要每月到手多少，倒推要谈多少税前月薪**。
// 反向不能靠「除以到手率」近似 —— 到手率本身随工资变（累计预扣是分档的），
// 所以这里用**二分求解**：到手随税前单调不减，逐次逼近到分。
//
// 三条比算法更容易写错的口径：
//   1. **「月到手」要先定口径**：累计预扣使得到手逐月不同 —— 「每月到手 1 万」
//      既可能是「全年到手 12 万」（全年口径），也可能是「1 月到手 1 万」（首月口径）。
//      两者倒推出的税前月薪差几百元，谈薪前不先定口径就会谈错。
//   2. **五险一金按税前工资算，不按到手算**：涨薪 1000 元不等于到手多 1000 元 ——
//      社保按税前基数扣、个税分档爬坡，所以要有**边际到手率**（多 1000 元税前实际多到手多少）。
//   3. **倒算只对月薪负责**：年终奖另有单独计税口径（与月薪分两段算），
//      本页结果不含年终奖，谈「13 薪 / 年终奖」时要另算。
//
// 个税与五险一金口径全部复用 social-insurance-quick.js（同源：常量 + 累计预扣）。
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

    // 给定税前后「口径化」的月到手：
    //   annual —— 全年到手 ÷ 12（谈薪时最常用的「月平均到手」）
    //   first  —— 第 1 月到手（入职首月最低税率，同一数字倒推出的税前更低）
    function monthlyNetAt(wage, input, mode) {
        var net = Social.netSalaryOf(Object.assign({}, input, { wage: wage }));
        return mode === 'first' ? net.net1 : round(net.annualNet / 12);
    }

    // 二分求解：找**最小的**税前月薪，使得到手 ≥ 目标（到手随税前单调不减）
    function solveOf(input) {
        input = input || {};
        var target = num(input.targetMonthly);
        var mode = input.mode === 'first' ? 'first' : 'annual';
        var empty = {
            targetMonthly: target,
            mode: mode,
            gross: 0,
            grossCeil: 0,
            grossHundred: 0,
            converged: false,
            gap: target,
            iterations: 0
        };
        if (!Social || !target) return empty;

        // 上界：先按「到手率不会低于 50%」给个起点，不够就翻倍（覆盖 45% 档与封顶区间）
        var lo = 0;
        var hi = Math.max(target * 3, 10000);
        var iterations = 0;
        while (monthlyNetAt(hi, input, mode) < target && iterations < 60) {
            hi *= 2;
            iterations += 1;
        }
        if (monthlyNetAt(hi, input, mode) < target) {
            return Object.assign(empty, { iterations: iterations });
        }

        // 二分到分（80 次足够覆盖 1e20 量级区间）
        for (var i = 0; i < 80 && hi - lo > 0.01; i++) {
            var mid = (lo + hi) / 2;
            if (monthlyNetAt(mid, input, mode) >= target) {
                hi = mid;
            } else {
                lo = mid;
            }
            iterations += 1;
        }

        var gross = round(Math.ceil(hi * 100) / 100);
        var net = Social.netSalaryOf(Object.assign({}, input, { wage: gross }));
        var employer = Social.employerCostOf(Object.assign({}, input, { wage: gross }));

        return {
            targetMonthly: target,
            mode: mode,
            wage: gross,
            gross: gross,
            grossCeil: Math.ceil(gross),                       // 取整到元（报价常用）
            grossHundred: Math.ceil(gross / 100) * 100,        // 取整到百元（谈薪常用）
            social: net.social,
            personalTotal: net.personalTotal,
            housingRate: net.housingRate,
            housingTaxFree: net.housingTaxFree,
            housingTaxable: net.housingTaxable,
            monthlyTaxable: net.monthlyTaxable,
            schedule: net.schedule,
            net1: net.net1,
            net6: net.net6,
            net12: net.net12,
            annualTax: net.annualTax,
            annualNet: net.annualNet,
            annualGross: net.annualGross,
            monthlyNetAverage: round(net.annualNet / 12),
            netRate: net.netRate,
            taxRate: net.taxRate,
            employer: employer,
            employerMonthly: employer.monthlyPerPerson,
            employerAnnual: employer.annual,
            netShare: employer.netShare,
            gap: round(monthlyNetAt(gross, input, mode) - target),
            converged: true,
            iterations: iterations
        };
    }

    // 两种口径并排：同一句「月到手 1 万」倒推出的税前差多少
    function compareOf(input) {
        var annual = solveOf(Object.assign({}, input, { mode: 'annual' }));
        var first = solveOf(Object.assign({}, input, { mode: 'first' }));
        return {
            annual: annual,
            first: first,
            grossGap: round(annual.gross - first.gross),                 // 全年口径比首月口径多要多少税前
            annualNetGap: annual.converged && first.converged
                ? round(annual.annualNet - first.annualNet)              // 反过来：按首月口径定薪全年少拿多少
                : 0
        };
    }

    // 边际到手率：税前再多 step 元，全年到手多多少（涨薪谈判时最该看的数）
    function marginalOf(input, step) {
        var delta = num(step) > 0 ? num(step) : 1000;
        var base = solveOf(input);
        if (!base.converged) return { step: delta, extraNet: 0, marginalRate: 0, base: base };
        var higher = Social.netSalaryOf(Object.assign({}, input, { wage: base.gross + delta }));
        var extraNet = round(higher.annualNet - base.annualNet);
        return {
            step: delta,
            base: base,
            gross: round(base.gross + delta),
            extraNet: extraNet,
            // 分母是**全年**新增税前（每月 delta × 12）—— 少乘 12 会得到 8.37 这种荒唐值
            marginalRate: extraNet / (delta * 12),
            extraNetMonthly: round(extraNet / 12)
        };
    }

    window.EuriskoNetSalaryQuick = {
        monthlyNetAt: monthlyNetAt,
        solveOf: solveOf,
        compareOf: compareOf,
        marginalOf: marginalOf
    };
})();
