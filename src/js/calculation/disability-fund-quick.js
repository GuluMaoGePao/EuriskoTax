// 残保金（残疾人就业保障金）与工会经费的轻量实现（阶段15 15B-6）
//
// 主线：**这两个都不是「工资总额乘个比例」，而且都和社保用的不是同一个口径**。
//   · 残保金 = **差额人数 × 在职职工年平均工资** —— 招 1 名残疾人省下的是「一个人的年平均工资」，
//     不是省 1.5% 的工资总额；年平均工资按当地社平工资 **2 倍** 封顶（社保封顶是 300%，两个数不同）；
//   · 工会经费 = **工资总额 × 2%** —— 工资总额含奖金津贴且**没有上下限**，
//     所以高薪员工的工会经费远高于拿社保缴费基数估出来的数。
//
// 三件比算法更容易写错的事：
//   1. **30 人是临界点**：30 人（含）以下暂免，31 人就要按**全部 31 人**算 ——
//      不是只对超出的那 1 个人算，所以多招一个人的当年可能凭空多出一笔钱；
//   2. **分档减缴按「实际安排比例」分三档**：≥规定比例不缴、1%（含）以上按 50%、1% 以下按 90%，
//      于是**第一个残疾人最值钱，边际递减**（第三个人可能一分钱都省不了）；
//   3. 残保金的封顶是社平 **2 倍**（2020 年起，此前 3 倍），与社保缴费基数 300% 的上限无关 ——
//      同一家公司，工资高到一定程度后残保金先封顶、社保后封顶，两条线不是一起停的。
//
// 参数全部来自 tax-constants.js（disabilityFundRules / unionFeeRules），页面不出现第二份口径。
(function () {
    'use strict';

    function num(value) {
        var n = Number(String(value === null || value === undefined ? '' : value).replace(/,/g, '').trim());
        return isFinite(n) && n > 0 ? n : 0;
    }

    function round(n) {
        return Math.round((Number(n) || 0) * 100 + Number.EPSILON) / 100;
    }

    function rules() {
        return window.disabilityFundRules;
    }

    function unionRules() {
        return window.unionFeeRules;
    }

    // 分档：按「实际安排比例」从高到低匹配第一条满足的档（tiers 本身按 minRatio 降序）
    function tierOf(arrangedRatio, list) {
        var tiers = (list || rules().tiers);
        for (var i = 0; i < tiers.length; i++) {
            if (arrangedRatio >= tiers[i].minRatio - 1e-9) return tiers[i];
        }
        return tiers[tiers.length - 1];
    }

    // 分档减缴里「1%（含）以上减半」那一档 —— 从 tiers 里认，不写死 0.01
    function halfTierOf(list) {
        var tiers = (list || rules().tiers);
        for (var i = 0; i < tiers.length; i++) {
            if (tiers[i].multiplier > 0 && tiers[i].multiplier < 1) return tiers[i];
        }
        return null;
    }

    /**
     * 阶段17 17C-5（v1.61.0）①：在职职工人数是「**上年各月在职人数之和 ÷ 12**」，不是年末在册
     *
     * 速算器的字段就叫「在职职工人数」，HR 手上那个数通常是**常年正式在册**的 25 人 ——
     * 但季节性用工要**折算年平均人数**、劳务派遣由派遣单位与用工单位**协商计入一方**（不得重复）。
     * 实测：常年 25 人看着「30 人以下免征」，法定月平均 **45 人** → 不免征，一年差 **7.29 万**。
     */
    function headcountOf(input) {
        input = input || {};
        var r = rules();
        var regular = Math.max(Math.floor(num(input.regularCount)), 0);
        var seasonal = Math.max(Math.floor(num(input.seasonalCount)), 0);
        var months = Math.min(Math.max(Math.floor(num(input.seasonalMonths)), 0), 12);
        var dispatch = Math.max(Math.floor(num(input.dispatchCount)), 0);
        var dispatchHere = input.dispatchHere !== false;

        var seasonalEquivalent = round(seasonal * months / 12);
        var dispatchEquivalent = dispatchHere ? dispatch : 0;
        var monthlyAverage = round(regular + seasonalEquivalent + dispatchEquivalent);
        var upTo = r.smallExempt.headcountUpTo;

        return {
            regularCount: regular,
            seasonalCount: seasonal,
            seasonalMonths: months,
            seasonalEquivalent: seasonalEquivalent,
            dispatchCount: dispatch,
            dispatchHere: dispatchHere,
            dispatchEquivalent: dispatchEquivalent,
            monthlyAverage: monthlyAverage,
            // 速算器口径：HR 手上那个「常年正式在册人数」，漏了季节性折算与劳务派遣
            naive: regular,
            gap: round(monthlyAverage - regular),
            headcount: monthlyAverage,
            exempt: monthlyAverage > 0 && monthlyAverage <= upTo,
            naiveExempt: regular > 0 && regular <= upTo,
            smallExemptUpTo: upTo,
            note: r.headcountNote || ''
        };
    }

    /**
     * ② 「招几个残疾人才能免征」取决于**人数**，不是固定的一个比例
     *
     * 1 名残疾人达到 1.5% 需要公司在职 ≤ **66 人**（1 ÷ 1.5% = 66.67）；
     * 达到 1%（减半档）需要 ≤ **100 人**。所以 67~100 人的公司招 1 个人**只能减半、不能免征**，
     * 101 人以上招 1 个人连 1% 都够不着 —— 100 人是第二个临界点。
     */
    function exemptPlanOf(input) {
        input = input || {};
        var r = rules();
        var headcount = num(input.headcount);
        var disabled = Math.max(Math.floor(num(input.disabled)), 0);
        var ratio = num(input.ratio) > 0 ? num(input.ratio) : r.ratio;
        var half = halfTierOf(r.tiers);
        var halfRatio = half ? half.minRatio : 0.01;

        return {
            headcount: headcount,
            disabled: disabled,
            ratio: ratio,
            halfRatio: halfRatio,
            needExempt: Math.max(0, Math.ceil(headcount * ratio - disabled - 1e-9)),
            needHalf: Math.max(0, Math.ceil(headcount * halfRatio - disabled - 1e-9)),
            // 「1 个人够不够」的公司规模上限
            onePersonExemptUpTo: Math.floor(1 / ratio),
            onePersonHalfUpTo: Math.floor(1 / halfRatio),
            ladder: [31, 50, 66, 67, 100, 101, 200, 500].map(function (n) {
                return {
                    headcount: n,
                    needExempt: Math.max(0, Math.ceil(n * ratio - 1e-9)),
                    needHalf: Math.max(0, Math.ceil(n * halfRatio - 1e-9))
                };
            })
        };
    }

    /**
     * ③ 招残疾人 vs 缴残保金 —— 这是「要不要招一个人」的**定价**，速算器完全没有
     *
     * 两种情形必须分开答，否则一定被当成算错：
     *   A **岗位本来就要招人**：招残疾人 vs 招非残疾人，用工成本一样，净省 = 残保金减少额；
     *   B **专为省残保金增设岗位**：净成本 = 年薪 ×（1 + 单位社保公积金费率）− 残保金减少额。
     * 盈亏平衡：拟招岗位年薪 ≤ 残保金减少额 ÷（1 + 单位社保公积金费率）时才划算。
     * 实测：100 人公司招第 1 人省 13.2 万，而雇一个人的用工成本是 16.74 万 ——
     * **专门招一个人不划算**（除非岗位年薪压到 9.46 万以下）。
     */
    function hireCompareOf(input) {
        input = input || {};
        var social = window.socialInsuranceRules || {};
        var employerRate = (social.items || []).reduce(function (s, it) { return s + it.employerRate; }, 0);
        var housingRate = (social.housingFund && social.housingFund.defaultRate) || 0;
        // 27.5% + 12% = 39.5% —— 保留 4 位小数：round() 取 2 位会把 0.395 舍成 0.40，
        // 用工成本就凭空多出 600 元（120000 × 0.005）
        var totalRate = Math.round((employerRate + housingRate) * 10000 + Number.EPSILON) / 10000;

        var before = levyOf(input);
        var after = levyOf(Object.assign({}, input, { disabled: before.disabled + 1 }));
        var saving = round(before.payable - after.payable);

        var hireWage = num(input.hireAnnualWage) > 0 ? num(input.hireAnnualWage) : num(input.avgAnnualWage);
        var hireCost = round(hireWage * (1 + totalRate));
        var breakEvenWage = round(saving / (1 + totalRate));

        return {
            headcount: before.headcount,
            disabled: before.disabled,
            before: before.payable,
            after: after.payable,
            saving: saving,
            hireAnnualWage: hireWage,
            employerRate: employerRate,
            housingRate: housingRate,
            totalRate: totalRate,
            hireCost: hireCost,
            netReplace: saving,                          // 情形 A：岗位本来就要招人
            netAdd: round(hireCost - saving),            // 情形 B：专为省残保金增设岗位
            breakEvenWage: breakEvenWage,
            worthIt: hireWage <= breakEvenWage + 1e-9
        };
    }

    /**
     * ④ 工会经费的基数是**工资总额**，与社保缴费基数**两个方向都不同**
     *
     * 社保缴费基数有 60% 保底与 300% 封顶，工会经费的工资总额**两头都不夹**：
     * 月薪 3 万 → 社保按 2.4 万封顶、工会经费按 3 万；月薪 3000 → 社保按 4800 保底、
     * 工会经费按 3000。所以拿社保基数估工会经费，**两头都会估错**。
     */
    function unionBaseOf(input) {
        input = input || {};
        var u = unionRules();
        var social = window.socialInsuranceRules || {};
        var b = social.base || {};
        var average = num(input.socialAverage);
        var months = Math.max(Math.floor(num(input.paidMonths)) || 12, 1);
        var monthlyWage = num(input.monthlyWage);
        var allowance = num(input.monthlyAllowance);
        var bonus = num(input.annualBonus);

        var wageTotal = round((monthlyWage + allowance) * months + bonus);
        var min = round(average * (b.lowerRatio === undefined ? 0.6 : b.lowerRatio));
        var max = round(average * (b.upperRatio === undefined ? 3 : b.upperRatio));
        var socialMonthly = monthlyWage <= 0 ? 0
            : (average > 0 ? Math.min(Math.max(monthlyWage, min), max) : monthlyWage);
        var socialAnnual = round(socialMonthly * months);

        return {
            wageTotal: wageTotal,
            avgMonthly: round(wageTotal / months),
            months: months,
            socialMonthlyBase: socialMonthly,
            socialAnnual: socialAnnual,
            gapAnnual: round(wageTotal - socialAnnual),
            feeOnWage: round(wageTotal * u.rate),
            feeOnSocialBase: round(socialAnnual * u.rate),
            feeGap: round((wageTotal - socialAnnual) * u.rate),
            limit: round(wageTotal * u.corporateDeductionRate),
            wageBaseNote: u.wageBaseNote || ''
        };
    }

    // 残保金：差额人数 × 年平均工资（封顶）× 分档比例
    function levyOf(input) {
        input = input || {};
        var r = rules();
        var headcount = Math.max(Math.floor(num(input.headcount)), 0);
        var disabled = Math.max(Math.floor(num(input.disabled)), 0);
        var ratio = num(input.ratio) > 0 ? num(input.ratio) : r.ratio;

        // 年平均工资上限 = 当地月社平工资 × 12 × 2（2 倍，不是社保那个 300%）
        var socialMonthly = num(input.socialAverageMonthly);
        var wageCap = round(socialMonthly * 12 * r.wageCapMultiple);
        var avgWageInput = num(input.avgAnnualWage);
        var avgWageUsed = wageCap > 0 ? Math.min(avgWageInput, wageCap) : avgWageInput;
        var capped = wageCap > 0 && avgWageInput > wageCap;

        // 应安排人数 = 在职职工人数 × 规定比例：**保留小数**（差额人数本就可以是小数，
        // 先四舍五入再乘工资会把 31 人的 0.465 变成 0.47，凭空多出几百元）
        var required = headcount * ratio;
        var gap = Math.max(required - disabled, 0);
        var arrangedRatio = headcount > 0 ? disabled / headcount : 0;
        var tier = tierOf(arrangedRatio, r.tiers);
        var base = round(gap * avgWageUsed);                     // 应缴费额（未考虑分档）
        var payableBeforeExempt = round(base * tier.multiplier); // 分档后（未考虑 30 人免征）
        var smallExempt = headcount > 0 && headcount <= r.smallExempt.headcountUpTo;

        return {
            headcount: headcount,
            disabled: disabled,
            ratio: ratio,
            required: required,
            gap: gap,
            arrangedRatio: arrangedRatio,
            avgWageInput: avgWageInput,
            wageCap: wageCap,
            avgWageUsed: avgWageUsed,
            capped: capped,
            base: base,
            tier: tier,
            multiplier: tier.multiplier,
            payableBeforeExempt: payableBeforeExempt,
            smallExempt: smallExempt,
            payable: smallExempt ? 0 : payableBeforeExempt
        };
    }

    // 再招 1 名残疾人能省多少（边际）：招第 n 人 vs 招第 n−1 人
    function savingOf(input, at) {
        var n = Math.max(Math.floor(num(at)), 1);
        var before = levyOf(Object.assign({}, input, { disabled: n - 1 }));
        var after = levyOf(Object.assign({}, input, { disabled: n }));
        return {
            index: n,
            before: before.payable,
            after: after.payable,
            saving: round(before.payable - after.payable)
        };
    }

    // 工会经费：工资总额 × 2%（40% 上缴、60% 留存；企税扣除限额同为 2%）
    function unionFeeOf(input) {
        input = input || {};
        var r = unionRules();
        var wageTotal = num(input.wageTotal);
        var hasUnion = input.hasUnion !== false;
        var fee = round(wageTotal * r.rate);
        var limit = round(wageTotal * r.corporateDeductionRate);
        // 实际拨缴额：默认按法定 2% 拨缴（可全额扣除）；多提的部分企税不得扣除
        var actual = input.actual === undefined || input.actual === null || input.actual === ''
            ? fee
            : num(input.actual);

        return {
            wageTotal: wageTotal,
            rate: r.rate,
            hasUnion: hasUnion,
            fee: fee,
            remitted: hasUnion ? round(fee * r.remittedRatio) : fee,   // 未建会：筹备金全额上缴
            retained: hasUnion ? round(fee * r.retainedRatio) : 0,
            limit: limit,
            actual: actual,
            deductible: Math.min(actual, limit),
            overDeduction: round(Math.max(0, actual - limit))
        };
    }

    // 同参数下换一个变量的表（页面静态表与测试共用同一份算法）
    function headcountTableOf(headcounts, input) {
        var list = Array.isArray(headcounts) ? headcounts : [];
        return list.map(function (headcount) {
            var r = levyOf(Object.assign({}, input, { headcount: headcount }));
            return {
                headcount: r.headcount,
                required: r.required,
                gap: r.gap,
                base: r.base,
                smallExempt: r.smallExempt,
                payable: r.payable
            };
        });
    }

    function disabledTableOf(disabledList, input) {
        var list = Array.isArray(disabledList) ? disabledList : [];
        return list.map(function (disabled) {
            var r = levyOf(Object.assign({}, input, { disabled: disabled }));
            return {
                disabled: r.disabled,
                arrangedRatio: r.arrangedRatio,
                gap: r.gap,
                base: r.base,
                multiplier: r.multiplier,
                payable: r.payable
            };
        });
    }

    function wageTableOf(wages, input) {
        var list = Array.isArray(wages) ? wages : [];
        return list.map(function (wage) {
            var r = levyOf(Object.assign({}, input, { avgAnnualWage: wage }));
            return {
                avgWageInput: r.avgWageInput,
                avgWageUsed: r.avgWageUsed,
                capped: r.capped,
                base: r.base,
                payable: r.payable
            };
        });
    }

    function unionTableOf(totals, input) {
        var list = Array.isArray(totals) ? totals : [];
        return list.map(function (total) {
            var r = unionFeeOf(Object.assign({}, input, { wageTotal: total }));
            return {
                wageTotal: r.wageTotal,
                fee: r.fee,
                remitted: r.remitted,
                retained: r.retained
            };
        });
    }

    window.EuriskoDisabilityFundQuick = {
        rules: rules,
        unionRules: unionRules,
        tierOf: tierOf,
        levyOf: levyOf,
        savingOf: savingOf,
        unionFeeOf: unionFeeOf,
        headcountTableOf: headcountTableOf,
        disabledTableOf: disabledTableOf,
        wageTableOf: wageTableOf,
        unionTableOf: unionTableOf,
        halfTierOf: halfTierOf,
        headcountOf: headcountOf,
        exemptPlanOf: exemptPlanOf,
        hireCompareOf: hireCompareOf,
        unionBaseOf: unionBaseOf
    };
})();
