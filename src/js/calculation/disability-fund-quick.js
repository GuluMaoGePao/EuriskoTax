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
        unionTableOf: unionTableOf
    };
})();
