/**
 * 17D-13（v1.69.0）：非居民个人 / 无住所个人 —— 90 天 · 183 天 · 满六年，
 * 以及那张「按月换算后的综合所得税率表」。
 *
 * 这是第 16 个个税场景（15/16 → 16/16），也是第三个**没有同名速算器**的完整测算：
 * 20 个速算器里没有一个能收它 —— 「月薪 + 五险一金 + 专项附加」那五个框**默认是给中国税收居民
 * 设计的**，而这一类人进门要解决的第一个问题根本不是「扣多少」，而是「**这笔钱要不要在中国缴**」。
 *
 * 四层（全部读 nonResidentRules，一个税率、一条公式都没复制）：
 *
 *   ① **居住天数 → 纳税义务四个档**（个税法第一条 + 财政部 税务总局公告 2019 年第 34 号）：
 *      累计居住 ≤ 90 天 / 90 天以上不满 183 天 / 满 183 天但不满六年 / 满六年 ——
 *      同样一笔工资，在四档里要缴的完全不同：老板境外交钱、人在境外干活的那部分，
 *      在前三档里**免税**，最后一档全额征；
 *   ② **收入额不是「工资」，是先过一道乘法**（35 号第二条）：
 *      公式一（≤90 天）= 当月境内外工资 ×（境内支付占比）×（境内工作天数占比）；
 *      公式二（90~183 天）= 当月境内外工资 ×（境内工作天数占比）；
 *      公式三（无住所居民不满六年 / 90~183 天的高管）= 当月境内外工资 ×〔1 − 境外支付占比 × 境外天数占比〕；
 *      高管（董事、监事、高层管理职务）另有一套 —— **无论是否在境内履行职务**，
 *      由境内居民企业支付或者负担的报酬一律属于境内所得；
 *   ③ **非居民按月换算后的综合所得税率表逐月单独计税**（35 号第三条（二）1）：
 *      当月收入额 − 5000 → 月度税率表，**一个月算一次**，不像居民那样按年累计；
 *      正因为逐年累进被切成 12 段，**收入越不均匀越吃亏**；
 *   ④ **数月奖金单独按 6 个月分摊、且不减除费用**（公式五）：
 *      〔（奖金收入额 ÷ 6）× 税率 − 速算扣除数〕× 6，**一个公历年度内每人只能适用一次** ——
 *      这和居民的「全年一次性奖金 ÷ 12 定档」是两张写法很像、结果未必相同的算法，不能互相套用。
 *
 * 另外两条最容易被忽略：
 *   - **居住天数按「当天满 24 小时」计**，而**工作天数**在与境外单位同时任职（或仅在境外单位任职）时，
 *     境内停留当天不足 24 小时的按**半天**算 —— 两个口径同一个场景结果不同；
 *   - **六年的判定只看「有没有任何一年单次离境超过 30 天」**（34 号一），
 *     不是老黄历里那句「累计离境 90 天作废」（财税字〔1995〕98 号已于 2019 年废止）。
 */
(function (global) {
    'use strict';

    function rules() {
        return global.nonResidentRules || {};
    }

    /** 月度税率表：与年终奖单独计税**同一张**（bonusMonthlyTaxRates），不复制第二份 */
    function monthlyTable() {
        return global.bonusMonthlyTaxRates || [];
    }

    function toNumber(v, fallback) {
        var n = Number(v);
        if (!isFinite(n) || n < 0) return fallback || 0;
        return n;
    }

    function clamp(n, lo, hi) {
        return Math.min(hi, Math.max(lo, n));
    }

    /** 月度税率表定档：应纳税所得额 → 税率 / 速算扣除数 / 税额 */
    function monthlyTaxOf(amount) {
        var rates = monthlyTable();
        var m = Math.max(0, Number(amount) || 0);
        if (!rates.length) return { rate: 0, deduction: 0, tax: 0, index: -1 };
        var row = rates[rates.length - 1];
        var index = rates.length - 1;
        for (var i = 0; i < rates.length; i++) {
            if (m <= rates[i].max) { row = rates[i]; index = i; break; }
        }
        return { rate: row.rate, deduction: row.deduction, tax: Math.max(0, m * row.rate - row.deduction), index: index };
    }

    /** 年度综合所得税率表（居民口径）：走内核，一条公式都不自己写 */
    function annualTaxOf(taxable) {
        var t = Math.max(0, Number(taxable) || 0);
        if (typeof global.calculateTaxByTaxableIncome === 'function') {
            return global.calculateTaxByTaxableIncome(t).tax;
        }
        var rates = global.comprehensiveTaxRates || [];
        for (var i = 0; i < rates.length; i++) {
            if (t <= rates[i].max) return Math.max(0, t * rates[i].rate - rates[i].deduction);
        }
        return 0;
    }

    /**
     * ① 居住天数 —— 「当天满 24 小时」才算一天；当天不足 24 小时的工作天数按半天算。
     *    两个口径都用天数，但**规则不同**，混着用是这里最常见的低级错误。
     */
    function stayOf(input) {
        input = input || {};
        var r = rules();
        var full = toNumber(input.stayFullDays);
        var partial = toNumber(input.stayPartialDays);
        var dual = !!input.dualRole;   // 在境内、境外单位同时担任职务，或仅在境外单位任职
        return {
            residentDays: Math.round(full),                       // 居住天数：只数满 24 小时的当天
            workDays: dual ? full + partial * (r.partialDayWeight || 0.5) : full,  // 工作天数：不足 24 小时按半天
            partialDays: partial,
            dualRole: dual
        };
    }

    /** ② 居民 / 非居民与四档 —— 一个纳税年度内累计居住是否满 183 天 */
    function statusOf(input) {
        input = input || {};
        var r = rules();
        var s = stayOf(input);
        var days = s.residentDays;
        var isResident = days >= (r.residentDays || 183);
        var tier = isResident ? 'resident' : (days <= (r.shortStayDays || 90) ? 'short' : 'mid');
        return {
            days: days,
            workDays: s.workDays,
            partialDays: s.partialDays,
            dualRole: s.dualRole,
            isResident: isResident,
            tier: tier,
            tierLabel: tier === 'resident' ? '居民个人（满 183 天）'
                : (tier === 'short' ? '非居民个人（累计居住 ≤ 90 天）' : '非居民个人（90 天以上不满 183 天）')
        };
    }

    /**
     * ③ 六年规则（34 号一）：本年满 183 天 **且** 此前六年每年都满 183 天 **且**
     *    没有任何一年单次离境超过 30 天 → 境内境外全部所得缴税。
     */
    function sixYearOf(input) {
        input = input || {};
        var r = rules();
        var s = statusOf(input);
        var prev = clamp(Math.round(toNumber(input.fullYearsBefore)), 0, (r.sixYears || 6));
        var absence = toNumber(input.maxSingleAbsence);
        var out = {
            applicable: s.isResident,
            fullYearsBefore: prev,
            needYears: r.sixYears || 6,
            maxSingleAbsence: absence,
            sixYearsMet: false,
            worldwide: false,
            reasons: []
        };
        if (!s.isResident) {
            out.reasons.push('本年未住满 ' + (r.residentDays || 183) + ' 天 → 是非居民个人，六年规则与本例无关');
            return out;
        }
        if (prev < (r.sixYears || 6)) out.reasons.push('此前连续住满 183 天的年度只有 ' + prev + ' 年（要有 ' + (r.sixYears || 6) + ' 年）');
        if (absence > (r.singleTripMaxAbsence || 30)) out.reasons.push('此前六年中有年度单次离境 ' + absence + ' 天，超过 ' + (r.singleTripMaxAbsence || 30) + ' 天');
        out.sixYearsMet = prev >= (r.sixYears || 6) && absence <= (r.singleTripMaxAbsence || 30);
        out.worldwide = out.sixYearsMet;
        if (out.sixYearsMet) out.reasons.push('已连续满六年且无单次离境超过 ' + (r.singleTripMaxAbsence || 30) + ' 天 → 境内境外全部所得都要缴');
        else out.reasons.push('享受实施条例第四条优惠：境外所得中**由境外单位或者个人支付**的部分免税');
        return out;
    }

    /**
     * ④ 当月工资薪金**收入额**（35 号第二条）—— 不是工资总额，是先按所得来源地过一道乘法。
     *
     * @param total              当月境内外工资薪金总额
     * @param paidDomestic       其中由境内雇主支付或者负担的部分
     * @param calendarDays       当月工资薪金所属工作期间的公历天数
     * @param domesticWorkDays   其中境内工作天数（同时对境外单位任职的可含半天）
     */
    function incomeOf(input) {
        input = input || {};
        var s = statusOf(input);
        var six = sixYearOf(input);
        var isExec = input.role === 'executive';

        var total = toNumber(input.monthlyTotal);
        var paidDomestic = Math.min(toNumber(input.monthlyPaidDomestic), total);
        var calendarDays = Math.max(1, toNumber(input.calendarDays, 30));
        var domesticDays = clamp(toNumber(input.domesticWorkDays, calendarDays), 0, calendarDays);

        var payRatio = total > 0 ? paidDomestic / total : 0;
        var dayRatio = domesticDays / calendarDays;
        var overseasPayRatio = 1 - payRatio;
        var overseasDayRatio = 1 - dayRatio;

        var out = {
            tier: s.tier, isResident: s.isResident, sixYearsMet: six.sixYearsMet,
            total: total, paidDomestic: paidDomestic, calendarDays: calendarDays,
            domesticDays: domesticDays, payRatio: payRatio, dayRatio: dayRatio,
            amount: 0, ratio: 0, formula: '', label: '', note: ''
        };

        if (s.tier === 'short') {
            if (isExec) {
                // 高管 ≤90 天：由境内雇主支付或者负担的部分全额计税，**不再按天数分摊**
                out.amount = paidDomestic;
                out.formula = '高管（≤90 天）';
                out.label = '当月境内雇主支付或者负担的工资薪金';
                out.note = '担任境内居民企业董事、监事、高层管理职务的个人，无论是否在境内履行职务，'
                    + '由该境内企业支付或者负担的报酬一律属于境内所得（35 号第一条（三））';
            } else {
                out.amount = total * payRatio * dayRatio;
                out.formula = '公式一';
                out.label = '当月境内外工资 × 境内支付占比 × 境内工作天数占比';
                out.note = '仅就归属于境内工作期间**并由境内雇主支付或者负担**的部分计税（35 号第二条（一）1）';
            }
        } else if (s.tier === 'mid') {
            if (isExec) {
                out.amount = total * (1 - overseasPayRatio * overseasDayRatio);
                out.formula = '公式三';
                out.label = '当月境内外工资 ×〔1 − 境外支付占比 × 境外工作天数占比〕';
                out.note = '除归属于境外工作期间**且**不是由境内雇主支付或者负担的部分外，都要缴（35 号第二条（三）2）';
            } else {
                out.amount = total * dayRatio;
                out.formula = '公式二';
                out.label = '当月境内外工资 × 境内工作天数占比';
                out.note = '归属于境内工作期间的工资薪金**不论由谁支付**都要缴（35 号第二条（一）2）';
            }
        } else if (six.sixYearsMet) {
            out.amount = total;
            out.formula = '全额';
            out.label = '境内、境外全部所得';
            out.note = '已连续住满 ' + (six.needYears) + ' 年 → 从境内、境外取得的全部工资薪金都要缴（34 号一）';
        } else {
            out.amount = total * (1 - overseasPayRatio * overseasDayRatio);
            out.formula = '公式三';
            out.label = '当月境内外工资 ×〔1 − 境外支付占比 × 境外工作天数占比〕';
            out.note = '除归属于境外工作期间且由境外单位或者个人支付的部分外，都要缴（35 号第二条（二）1）';
        }

        out.ratio = total > 0 ? out.amount / total : 0;
        return out;
    }

    /** ⑤ 数月奖金：单独、不与当月工资合并，**按 6 个月分摊且不减除费用**，一年只能用一次（公式五） */
    function bonusTaxOf(input) {
        input = input || {};
        var r = rules();
        var ic = incomeOf(input);
        var bonus = toNumber(input.bonus);
        var spread = r.bonusSpreadMonths || 6;
        var inScope = bonus * ic.ratio;
        var perMonth = inScope / spread;
        var mt = monthlyTaxOf(perMonth);
        return {
            bonus: bonus, ratio: ic.ratio, inScope: inScope, spreadMonths: spread,
            perMonth: perMonth, rate: mt.rate, deduction: mt.deduction,
            tax: Math.round(mt.tax * spread * 100) / 100,
            noDeduction: true,
            oncePerYear: true,
            note: '〔（数月奖金收入额 ÷ ' + spread + '）× 税率 − 速算扣除数〕× ' + spread
                + ' —— 不与当月工资合并、**不减除 5000 元**，一个公历年度内每人只能适用一次（35 号第三条（二）2）'
        };
    }

    /** ⑥ 非居民工资：当月收入额 − 5000 → 月度税率表，一个月算一次（第三条（二）1） */
    function salaryTaxOf(input) {
        input = input || {};
        var r = rules();
        var ic = incomeOf(input);
        var months = clamp(Math.round(toNumber(input.months, 12)), 0, 12);
        var ded = r.monthlyDeduction || 5000;
        var perMonth = Math.max(0, ic.amount - ded);
        var mt = monthlyTaxOf(perMonth);
        return {
            status: statusOf(input),
            income: ic,
            months: months,
            monthlyDeduction: ded,
            monthlyIncome: ic.amount,
            taxablePerMonth: perMonth,
            rate: mt.rate,
            deduction: mt.deduction,
            taxPerMonth: mt.tax,
            salaryIncome: ic.amount * months,
            tax: mt.tax * months
        };
    }

    /**
     * ⑦ 法定口径 / 居民口径 / 「公司里最常见的错误算法」三条对照。
     *    naive = 不分所得来源地，**奖金并入发放当月**，再套月度税率表 —— 这是把大笔奖金
     *    推进最高档的写法，也是实际最常被 HR 默认的写法。
     */
    function compareOf(input) {
        input = input || {};
        var r = rules();
        var s = statusOf(input);
        var sal = salaryTaxOf(input);
        var bonus = bonusTaxOf(input);
        var legal = s.isResident ? residentTaxOf(input) : (sal.tax + bonus.tax);

        // 居民对照：把全部收入额按年度并入（收入额仍按所得来源地口径）
        var resident = residentTaxOf(input);

        // 错误算法：全额（不分来源地）+ 奖金并入发放当月 + 月度税率表
        var months = sal.months;
        var ded = r.monthlyDeduction || 5000;
        var fullMonthly = toNumber(input.monthlyTotal);
        var naive = monthlyTaxOf(Math.max(0, fullMonthly + bonus.bonus - ded)).tax
            + monthlyTaxOf(Math.max(0, fullMonthly - ded)).tax * Math.max(0, months - 1);

        return {
            legal: legal,
            legalTax: legal,
            naive: naive,
            naiveGap: naive - legal,
            resident: resident,
            residentGap: resident - legal,
            isResident: s.isResident,
            salary: sal,
            bonus: bonus
        };
    }

    /** 居民口径：年度收入额合计 − 6 万 → 年度税率表（内核） */
    function residentTaxOf(input) {
        input = input || {};
        var r = rules();
        var sal = salaryTaxOf(input);
        var bonus = bonusTaxOf(input);
        var annualIncome = sal.salaryIncome + bonus.inScope;
        var taxable = Math.max(0, annualIncome - (r.annualDeduction || 60000));
        return annualTaxOf(taxable);
    }

    /** ⑧ 四档对照：同样是这批收入，居住天数不同 → 要缴的税完全不同 */
    function scenarioTableOf(input) {
        input = input || {};
        var r = rules();
        var presets = [
            { label: '累计居住 60 天（≤ 90 天）', stayFullDays: 60, fullYearsBefore: 0, maxSingleAbsence: 0 },
            { label: '累计居住 120 天（90 ~ 183 天）', stayFullDays: 120, fullYearsBefore: 0, maxSingleAbsence: 0 },
            { label: '累计居住 200 天（满 183 天，不满六年）', stayFullDays: 200, fullYearsBefore: 4, maxSingleAbsence: 0 },
            { label: '累计居住 200 天（连续满六年）', stayFullDays: 200, fullYearsBefore: 6, maxSingleAbsence: 0 },
            { label: '累计居住 200 天（连续满六年但有单次离境 40 天）', stayFullDays: 200, fullYearsBefore: 6, maxSingleAbsence: 40 }
        ];
        return presets.map(function (p) {
            var merged = Object.assign({}, input, p);
            return {
                label: p.label,
                days: p.stayFullDays,
                tier: statusOf(merged).tier,
                sixYearsMet: sixYearOf(merged).sixYearsMet,
                formula: incomeOf(merged).formula,
                monthlyIncome: incomeOf(merged).amount,
                tax: statusOf(merged).isResident ? residentTaxOf(merged)
                    : (salaryTaxOf(merged).tax + bonusTaxOf(merged).tax)
            };
        });
    }

    /**
     * ⑧-bis **同一笔年收入，发放节奏不同 → 非居民的税完全不同**（月度表逐月独立的直接后果）。
     *     取「均匀发放」与「前 m−1 个月各发 1/(2m)、最后一个月发 (m+1)/(2m)」两种分布对比；
     *     居民按年累计的那张年度表**不受发放节奏影响**，两条路塑出来的差额就是纯损失。
     */
    function volatilitySampleOf(input) {
        input = input || {};
        var r = rules();
        var sal = salaryTaxOf(input);
        var months = Math.max(1, sal.months);
        var total = sal.monthlyIncome * months;          // 工资部分的年收入额
        var ded = r.monthlyDeduction || 5000;

        var flatEach = total / months;
        var lumpEach = months > 1 ? total / (2 * months) : total;
        var lumpLast = total - lumpEach * Math.max(0, months - 1);

        var flatTax = monthlyTaxOf(Math.max(0, flatEach - ded)).tax * months;
        var lumpTax = monthlyTaxOf(Math.max(0, lumpEach - ded)).tax * Math.max(0, months - 1)
            + monthlyTaxOf(Math.max(0, lumpLast - ded)).tax;
        var residentSame = annualTaxOf(Math.max(0, total - (r.annualDeduction || 60000) * 1));

        return {
            total: total, months: months,
            flatEach: flatEach, flatTax: flatTax,
            lumpEach: lumpEach, lumpLast: lumpLast, lumpTax: lumpTax,
            gap: lumpTax - flatTax,
            residentSame: residentSame,
            note: '同一笔 ' + Math.round(total) + ' 元的年收入额：均匀发放时月度表与年度表算出来'
                + '完全一样，集中到某个月发就会被推进最高档 —— 而居民按年累计的那张表'
                + '根本不看发放节奏'
        };
    }

    /** ⑨ 汇总：一次算齐，给 spec 的 compute 用 */
    function stackOf(input) {
        input = input || {};
        var r = rules();
        var s = statusOf(input);
        var six = sixYearOf(input);
        var ic = incomeOf(input);
        var sal = salaryTaxOf(input);
        var bonus = bonusTaxOf(input);
        var cmp = compareOf(input);

        var tax = s.isResident ? residentTaxOf(input) : (sal.tax + bonus.tax);
        var totalPay = toNumber(input.monthlyTotal) * sal.months + toNumber(input.bonus);

        return {
            rules: r,
            status: s,
            sixYear: six,
            income: ic,
            salary: sal,
            bonus: bonus,
            compare: cmp,
            months: sal.months,
            totalPay: totalPay,
            inScopeIncome: ic.amount * sal.months + bonus.inScope,
            tax: tax,
            naive: cmp.naive,
            naiveGap: cmp.naiveGap,
            resident: cmp.resident,
            isResident: s.isResident
        };
    }

    global.EuriskoNonResidentQuick = {
        rules: rules,
        monthlyTaxOf: monthlyTaxOf,
        annualTaxOf: annualTaxOf,
        stayOf: stayOf,
        statusOf: statusOf,
        sixYearOf: sixYearOf,
        incomeOf: incomeOf,
        bonusTaxOf: bonusTaxOf,
        salaryTaxOf: salaryTaxOf,
        residentTaxOf: residentTaxOf,
        compareOf: compareOf,
        scenarioTableOf: scenarioTableOf,
        volatilitySampleOf: volatilitySampleOf,
        stackOf: stackOf
    };
})(typeof window !== 'undefined' ? window : this);
