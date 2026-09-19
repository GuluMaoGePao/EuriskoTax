/**
 * 个人养老金 —— 轻量实现（阶段15 15A-5）
 *
 * 为什么单独做一个 quick 文件：
 *   /seo/private-pension.html 只需要「缴 12000 当年能少交多少税、将来领取时要交多少 3%、
 *   合起来是赚还是亏」这一个结论，不值得为此引一遍完整年度汇算内核。
 *   但标准与税率表必须同源 —— 所以本文件不复制任何数字：
 *   年限额与领取税率取注册表声明的 privatePensionRules，税率表取 comprehensiveTaxRates，
 *   缴费环节少交的税直接调内核 calculateTaxByTaxableIncome。
 *   （对拍见 tests/private-pension-quick.test.js：少交的税 ≡ 内核两段计税之差。）
 *
 * 口径要点（错了就是把「扣除额」当「减税额」，或把「3%」当成只对收益收）：
 *   1. 缴费扣的是**应纳税所得额**：少交的税 = T(x) − T(x − min(缴费额, 年限额))；
 *      超过年限额的部分当年不可扣，也不能结转到以后年度；
 *   2. 领取环节按**领取额全额 × 3%** 计税 —— 本金与投资收益一起计，
 *      不扣任何费用、不与当年综合所得合并、不参与汇算；
 *   3. 净优惠 = 缴费环节少交的税 − 领取环节交的税。所以只有适用税率**高于 3%** 才划算；
 *   4. 缴费上限由人社部与财政部适时调整，本页按现行 12000 元/年（月均 1000 元）计算。
 */
(function (global) {
    'use strict';

    var registry = global.EuriskoTaxRegistry;

    function rules() {
        return (registry && registry.resolveParams('private-pension').rules) || global.privatePensionRules;
    }

    function rateTable() {
        return (registry && registry.resolveParams('private-pension').rates) || global.comprehensiveTaxRates;
    }

    function toNumber(v, fallback) {
        var n = Number(v);
        if (!isFinite(n) || n < 0) return fallback || 0;
        return n;
    }

    /**
     * 应纳税所得额 → 年度税率表档位（与 App 内核同一张表、同一条定档规则）
     */
    function bracketOf(taxableIncome) {
        var rates = rateTable();
        var t = Math.max(0, Number(taxableIncome) || 0);
        for (var i = 0; i < rates.length; i++) {
            if (t <= rates[i].max) return rates[i];
        }
        return rates[rates.length - 1];
    }

    /**
     * 缴费环节：今年能扣多少、能少交多少税。
     *
     * @param {Object} input
     *   annualContribution   今年实际缴费额（元）
     *   taxableBefore        扣除前全年应纳税所得额（元）
     */
    function contributionOf(input) {
        input = input || {};
        var r = rules();
        var contribution = toNumber(input.annualContribution);
        var deductible = Math.min(contribution, r.annualLimit);
        var taxableBefore = Math.max(0, toNumber(input.taxableBefore));
        var taxableAfter = Math.max(0, taxableBefore - deductible);

        var taxBefore = global.calculateTaxByTaxableIncome(taxableBefore).tax;
        var taxAfter = global.calculateTaxByTaxableIncome(taxableAfter).tax;
        var bracket = bracketOf(taxableBefore);

        return {
            annualLimit: r.annualLimit,
            contribution: contribution,
            deductible: deductible,
            overLimit: Math.max(0, contribution - r.annualLimit),   // 超额部分当年不可扣、不能结转
            taxableBefore: taxableBefore,
            taxableAfter: taxableAfter,
            taxBefore: taxBefore,
            taxAfter: taxAfter,
            taxSaved: taxBefore - taxAfter,
            rate: bracket.rate,
            deductionForBracket: bracket.deduction,
            bracket: bracket,
            naiveSaved: deductible * bracket.rate,                  // 「扣除额 × 税率」的天真算法（跨档时高估）
            naiveGap: deductible * bracket.rate - (taxBefore - taxAfter)
        };
    }

    /**
     * 领取环节：按领取额全额 × withdrawRate 单独计税（不并入综合所得、不参与汇算）。
     */
    function withdrawTaxOf(withdrawTotal) {
        var r = rules();
        var total = Math.max(0, toNumber(withdrawTotal));
        return {
            withdrawTotal: total,
            withdrawRate: r.withdrawRate,
            tax: total * r.withdrawRate,
            isSeparate: r.withdrawIsSeparate
        };
    }

    /**
     * 主计算：缴费少交的税 − 领取交的税 = 净优惠，并给出「回本线」（领取额低于该值时净优惠仍为正）。
     *
     * @param {Object} input
     *   annualContribution   每年缴费额（元）
     *   years                缴费年数（默认 1）
     *   taxableBefore        缴费当年的全年应纳税所得额（元）
     *   withdrawTotal        预计领取总额（元）；缺省按「每年可扣额度 × 年数」即只回本金估算
     */
    function compareOf(input) {
        input = input || {};
        var r = rules();
        var years = Math.max(1, Math.round(toNumber(input.years, 1)));
        var yearly = contributionOf(input);

        // 缺省按「只回本金」估算：累计可扣额度 × 年数（投资收益不征税，实际领取额通常更高）
        var withdrawTotal = input.withdrawTotal === undefined || input.withdrawTotal === null || input.withdrawTotal === ''
            ? yearly.deductible * years
            : toNumber(input.withdrawTotal);
        var withdraw = withdrawTaxOf(withdrawTotal);

        return {
            rules: r,
            rateTable: rateTable(),
            years: years,
            annualLimit: yearly.annualLimit,
            contribution: yearly.contribution,
            deductible: yearly.deductible,
            overLimit: yearly.overLimit,
            totalDeductible: yearly.deductible * years,
            taxableBefore: yearly.taxableBefore,
            taxableAfter: yearly.taxableAfter,
            taxBefore: yearly.taxBefore,
            taxAfter: yearly.taxAfter,
            taxSaved: yearly.taxSaved,
            totalTaxSaved: yearly.taxSaved * years,
            rate: yearly.rate,
            deductionForBracket: yearly.deductionForBracket,
            naiveSaved: yearly.naiveSaved,
            naiveGap: yearly.naiveGap,
            withdrawTotal: withdraw.withdrawTotal,
            withdrawTax: withdraw.tax,
            netBenefit: yearly.taxSaved * years - withdraw.tax,
            // 净优惠归零的领取额：低于这个数就划算（3% 税率下 = 累计少交的税 ÷ 3%）
            breakEvenWithdraw: r.withdrawRate > 0 ? (yearly.taxSaved * years) / r.withdrawRate : 0,
            worthIt: yearly.rate > r.withdrawRate
        };
    }

    // ---------------------------------------------------------------------------
    // 阶段17 17D-9（v1.65.0）：税优三件套**完整测算**的可复用口径
    //
    // 三个速算器各自只算自己那一项：个人养老金算 12000、税优健康险算 2400、
    // 企业年金算个人 4%。但**它们扣的是同一份应纳税所得额** —— 于是下面三层
    // 三个速算器一个都表达不出来：
    //   ① **叠加会跨档**：三项「各自单独省」之和 ≠ 合起来省（实测 2160 vs **1628**，差 532）；
    //   ② **年金 4% 的基数不是月薪**：是**本人上年度月平均工资**（含奖金），
    //      且超过当地社平 300% 的部分**不计入**基数（与社保基数同源的两个坑）；
    //   ③ **领取环节的税各不相同**：养老金按**领取额全额 3%**（本金 + 收益一起计）、
    //      年金按月领走**月度**税率表、税优健康险**赔付免税**。

    function basicDeductionOf() {
        if (global.EuriskoSettlementQuick && global.EuriskoSettlementQuick.ANNUAL_BASIC_DEDUCTION) {
            return global.EuriskoSettlementQuick.ANNUAL_BASIC_DEDUCTION;
        }
        return (global.settlementRules && global.settlementRules.annualBasicDeduction) || 60000;
    }

    function taxOf(taxable) {
        return global.calculateTaxByTaxableIncome(Math.max(0, Number(taxable) || 0)).tax;
    }

    /** 扣除前应纳税所得额：全年工资 − 6 万 − 五险一金 − 专项附加扣除 − 其他扣除 */
    function personOf(input, prefix) {
        var monthly = Math.max(0, toNumber(input[prefix + 'MonthlyIncome']));
        var insurance = Math.max(0, toNumber(input[prefix + 'MonthlyInsurance']));
        var special = Math.max(0, toNumber(input[prefix + 'SpecialDeduction']));
        var other = Math.max(0, toNumber(input[prefix + 'OtherDeduction']));
        var taxableBefore = Math.max(0, monthly * 12 - basicDeductionOf() - insurance * 12 - special - other);
        return {
            monthlyIncome: monthly, monthlyInsurance: insurance,
            specialDeduction: special, otherDeduction: other,
            income: monthly * 12,
            taxableBefore: taxableBefore,
            bracket: bracketOf(taxableBefore)
        };
    }

    /**
     * 三项逐项核定：限额读各自 rules，计税走内核；年金基数按「上年度月平均工资、
     * 不超过社平 300%」自己算（速算器把这个换算推给了用户）。
     */
    function itemsOf(input) {
        var r = rules();
        var H = global.EuriskoHealthInsuranceQuick;
        var A = global.EuriskoAnnuityQuick;
        var taxableBefore = Math.max(0, toNumber(input.taxableBefore));
        var list = [];

        // ① 个人养老金：年限额 12000，超限部分当年不可扣、不结转
        var pension = toNumber(input.pensionSelf);
        var pensionCut = Math.min(pension, r.annualLimit);
        if (pension > 0) {
            list.push({
                key: 'pension', label: '个人养老金',
                limit: r.annualLimit, contribution: pension, deductible: pensionCut,
                overLimit: Math.max(0, pension - r.annualLimit),
                addBack: 0,
                note: '缴费 ' + Math.round(pension) + ' 元，年限额 ' + r.annualLimit + ' 元，超额部分当年不可扣、不结转',
                withdrawNote: '领取时按领取额全额 × ' + (r.withdrawRate * 100) + '%（本金 + 收益一起计）'
            });
        }

        // ② 税优健康险：年限额 2400（200 元/月），赔付环节免税
        var premium = toNumber(input.healthPremium);
        if (premium > 0 && H) {
            var hp = H.premiumOf({ annualPremium: premium, taxableBefore: taxableBefore });
            list.push({
                key: 'health', label: '税优健康险',
                limit: hp.annualLimit, contribution: premium, deductible: hp.deductible,
                overLimit: hp.overLimit, addBack: 0,
                note: '保费 ' + Math.round(premium) + ' 元，年限额 ' + hp.annualLimit + ' 元（' + hp.monthlyLimit + ' 元/月）',
                withdrawNote: '保险赔款**免征**个税，无领取环节税'
            });
        }

        // ③ 企业年金：个人缴费 ≤ 基数 4% 当期免税，超 4% 部分要并入工资计税
        if (input.joinAnnuity === 'yes' && A) {
            var wage = Math.max(0, toNumber(input.annuityPrevMonthlyWage));
            var socialAverage = Math.max(0, toNumber(input.annuitySocialAverage));
            var baseCap = socialAverage * A.rules().baseCapMultiplier;
            var base = Math.min(wage, baseCap > 0 ? baseCap : wage);
            var personalRate = Math.min(toNumber(input.personalRate), 1);
            var employerRate = Math.min(toNumber(input.employerRate), 1);
            var ac = A.contributionOf({
                contributionBase: base, personalRate: personalRate, employerRate: employerRate,
                taxableBefore: taxableBefore
            });
            list.push({
                key: 'annuity', label: '企业年金 / 职业年金',
                limit: base * A.rules().personalRateCap * 12,
                contribution: ac.annualPersonal,
                deductible: ac.annualExempt,
                overLimit: 0,
                addBack: ac.taxablePersonalMonthly * 12,       // 超 4% 部分：并入工资计税
                base: base, baseCap: baseCap, baseCapped: wage > baseCap && baseCap > 0,
                personalRate: personalRate, employerRate: employerRate,
                annualEmployer: ac.annualEmployer,
                note: '基数 ' + Math.round(base) + ' 元/月（上年度月平均工资，封顶社平 3 倍 '
                    + Math.round(baseCap) + '）× ' + (personalRate * 100).toFixed(1) + '% × 12',
                withdrawNote: '领取时按**月度**税率表单独计税（不并入综合所得）'
            });
        }

        return list;
    }

    /**
     * 完整测算：三项逐项核定 → 从同一份应纳税所得额里**合并**扣除 → 与「各自单独算」
     * 对照 → 养老金额度在夫妻之间怎么分 → 领取环节三件套各交多少。
     *
     * @param {Object} input
     *   selfMonthlyIncome / selfMonthlyInsurance / selfSpecialDeduction / selfOtherDeduction
     *   spouseMonthlyIncome / spouseMonthlyInsurance / spouseSpecialDeduction / spouseOtherDeduction
     *   pensionSelf / pensionSpouse / years / growthMultiple
     *   healthPremium / joinAnnuity / annuityPrevMonthlyWage / annuitySocialAverage
     *   personalRate / employerRate / monthlyWithdraw
     */
    function stackOf(input) {
        input = input || {};
        var r = rules();
        var self = personOf(input, 'self');
        var spouse = personOf(input, 'spouse');
        var hasSpouse = spouse.income > 0;

        var items = itemsOf({
            taxableBefore: self.taxableBefore,
            pensionSelf: input.pensionSelf, healthPremium: input.healthPremium,
            joinAnnuity: input.joinAnnuity, annuityPrevMonthlyWage: input.annuityPrevMonthlyWage,
            annuitySocialAverage: input.annuitySocialAverage,
            personalRate: input.personalRate, employerRate: input.employerRate
        });

        var totalDeductible = 0, totalAddBack = 0;
        items.forEach(function (it) { totalDeductible += it.deductible; totalAddBack += it.addBack; });

        var taxableAfter = Math.max(0, self.taxableBefore - totalDeductible + totalAddBack);
        var taxBefore = taxOf(self.taxableBefore);
        var taxAfter = taxOf(taxableAfter);
        var savingCombined = taxBefore - taxAfter;

        // 三项各自单独算（三个速算器各自的口径）之和
        var separate = items.map(function (it) {
            return {
                key: it.key, label: it.label, deductible: it.deductible,
                saving: taxOf(self.taxableBefore) - taxOf(Math.max(0, self.taxableBefore - it.deductible))
            };
        });
        var separateSum = separate.reduce(function (a, x) { return a + x.saving; }, 0);

        // 逐项边际：在合并方案里去掉这一项，家庭税增加多少
        var marginal = items.map(function (it) {
            var rest = totalDeductible - it.deductible;
            var back = totalAddBack - it.addBack;
            var taxWithout = taxOf(Math.max(0, self.taxableBefore - rest + back));
            return { key: it.key, label: it.label, deductible: it.deductible, contribution: taxWithout - taxAfter };
        }).sort(function (a, b) { return b.contribution - a.contribution; });

        // 养老金：家庭额度给谁缴更省（每人各 12000，本人只能扣本人的）
        var years = Math.max(1, Math.round(toNumber(input.years, 1)));
        var spouseItems = hasSpouse ? itemsOf({
            taxableBefore: spouse.taxableBefore,
            pensionSelf: 0, healthPremium: 0, joinAnnuity: 'no'
        }) : [];
        var spouseOther = 0;
        spouseItems.forEach(function (it) { spouseOther += it.deductible; });

        var limit = r.annualLimit;
        var selfOther = totalDeductible - Math.min(toNumber(input.pensionSelf), limit);   // 除养老金外的其他扣除
        var plans = [];
        function pushPlan(key, label, ps, pp) {
            var taxSelf = taxOf(Math.max(0, self.taxableBefore - selfOther - Math.min(ps, limit) + totalAddBack));
            var taxSpouse = taxOf(Math.max(0, spouse.taxableBefore - spouseOther - Math.min(pp, limit)));
            plans.push({
                key: key, label: label, pensionSelf: Math.min(ps, limit), pensionSpouse: Math.min(pp, limit),
                taxSelf: taxSelf, taxSpouse: taxSpouse,
                totalTax: taxSelf + taxSpouse,
                saving: taxBefore + taxOf(spouse.taxableBefore) - (taxSelf + taxSpouse)
            });
        }
        // 基线（谁都不缴养老金）已在 taxBefore 里；这里比的是「这三种投法谁家省得多」
        pushPlan('self', '只给本人缴满 ' + limit + ' 元', limit, 0);
        if (hasSpouse) {
            pushPlan('spouse', '只给配偶缴满 ' + limit + ' 元', 0, limit);
            pushPlan('both', '两人都缴满（各 ' + limit + ' 元）', limit, limit);
        }
        var bestPlan = plans.reduce(function (acc, p) { return (!acc || p.totalTax < acc.totalTax) ? p : acc; }, null);
        var worstPlan = plans.reduce(function (acc, p) { return (!acc || p.totalTax > acc.totalTax) ? p : acc; }, null);

        // 领取环节：养老金按领取额全额 3%（本金 + 收益），年金按月领走月度税率表，健康险免税
        var A = global.EuriskoAnnuityQuick;
        var principal = Math.min(toNumber(input.pensionSelf), limit) * years;
        var multiple = Math.max(1, toNumber(input.growthMultiple, 1));
        var withdrawTotal = principal * multiple;
        var pensionWithdrawTax = withdrawTotal * r.withdrawRate;
        var pensionSaved = taxOf(self.taxableBefore) - taxOf(Math.max(0, self.taxableBefore - Math.min(toNumber(input.pensionSelf), limit)));
        var pensionSavedYears = pensionSaved * years;
        var breakEvenWithdraw = r.withdrawRate > 0 ? pensionSavedYears / r.withdrawRate : 0;

        var annuity = null;
        var annuityItem = items.filter(function (it) { return it.key === 'annuity'; })[0];
        if (annuityItem && A) {
            var acmp = A.compareOf({
                contributionBase: annuityItem.base,
                personalRate: annuityItem.personalRate,
                employerRate: annuityItem.employerRate,
                taxableBefore: self.taxableBefore,
                years: years,
                monthlyWithdraw: input.monthlyWithdraw
            });
            annuity = {
                accountTotal: acmp.accountTotal, months: acmp.months,
                monthlyWithdraw: acmp.monthlyWithdraw, monthlyWithdrawRate: acmp.monthlyWithdrawRate,
                withdrawTaxTotal: acmp.withdrawTaxTotal,
                taxSaved: acmp.taxSaved, netBenefit: acmp.netBenefit
            };
        }

        return {
            rules: r,
            self: self, spouse: spouse, hasSpouse: hasSpouse,
            items: items, separate: separate,
            totalDeductible: totalDeductible, totalAddBack: totalAddBack,
            taxableAfter: taxableAfter,
            taxBefore: taxBefore, taxAfter: taxAfter,
            savingCombined: savingCombined,
            separateSum: separateSum,
            stackingGap: separateSum - savingCombined,    // 叠加后跨档：单独之和 − 合并实际
            marginal: marginal,
            plans: plans, bestPlan: bestPlan, worstPlan: worstPlan,
            years: years, multiple: multiple,
            pensionPrincipal: principal, pensionWithdrawTotal: withdrawTotal,
            pensionWithdrawTax: pensionWithdrawTax,
            pensionSaved: pensionSaved, pensionSavedYears: pensionSavedYears,
            pensionNetBenefit: pensionSavedYears - pensionWithdrawTax,
            breakEvenWithdraw: breakEvenWithdraw,
            breakEvenMultiple: principal > 0 ? breakEvenWithdraw / principal : 0,
            annuity: annuity,
            worthIt: self.bracket ? self.bracket.rate > r.withdrawRate : false
        };
    }

    global.EuriskoPrivatePensionQuick = {
        rules: rules,
        rateTable: rateTable,
        bracketOf: bracketOf,
        contributionOf: contributionOf,
        withdrawTaxOf: withdrawTaxOf,
        compareOf: compareOf,
        // 阶段17 17D-9（v1.65.0）税优三件套完整测算口径
        personOf: personOf,
        itemsOf: itemsOf,
        stackOf: stackOf
    };
})(typeof window !== 'undefined' ? window : globalThis);
