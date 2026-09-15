/**
 * 专项附加扣除（七项）—— 轻量实现（阶段15 15A-4）
 *
 * 为什么单独做一个 quick 文件：
 *   /seo/special-deduction.html 只需要「这七项一年能扣多少、能少交多少税」这一个结论，
 *   不值得为此再引一遍完整年度汇算内核。但**标准与税率表必须同源** ——
 *   所以本文件不复制任何数字：七项标准取注册表声明的 specialDeductionRules，
 *   税率表取 comprehensiveTaxRates，节税额直接调内核 calculateTaxByTaxableIncome。
 *   改标准或改档位时只改常量一处，落地页与 App 不会各说一套。
 *   （对拍见 tests/special-deduction-quick.test.js：节税额 ≡ 内核两段计税之差。）
 *
 * 口径要点（错了就是把「扣除额」当「减税额」）：
 *   1. 专项附加扣除扣的是**应纳税所得额**，不是直接减税额 ——
 *      少交的税 = 扣除前应纳税额 − 扣除后应纳税额，落在哪几档税率上就按哪几档省；
 *   2. 住房贷款利息与住房租金**同一纳税年度只能二选一**，不可叠加（exclusive）；
 *   3. 大病医疗是**年度据实**扣除：医保目录内个人自付累计超过 threshold 的部分，
 *      限额 annualCap，且只能在汇算清缴时办理（平时预扣不扣）；
 *   4. 继续教育学历（学位）按月扣 400 元、同一学历最长 48 个月；职业资格继续教育
 *      在取得证书当年一次性扣 3600 元；
 *   5. 每年 12 月需确认次年信息；未确认只是「暂停按月扣除」，汇算时可补扣，不会少扣税。
 */
(function (global) {
    'use strict';

    var registry = global.EuriskoTaxRegistry;

    /**
     * 规则与税率表来自注册表声明的全局量（不复制第二份）
     */
    function rules() {
        return (registry && registry.resolveParams('special-deduction').rules) || global.specialDeductionRules;
    }

    function rateTable() {
        return (registry && registry.resolveParams('special-deduction').rates) || global.comprehensiveTaxRates;
    }

    function toNumber(v, fallback) {
        var n = Number(v);
        if (!isFinite(n) || n < 0) return fallback || 0;
        return n;
    }

    /**
     * 分摊比例只允许 100%（由一方全额扣除）或 50%（双方各扣一半），
     * 这是《暂行办法》给的两个选项，选定后一个纳税年度内不得变更。
     */
    function sharePercentOf(v) {
        var n = toNumber(v, 100);
        return n >= 100 ? 1 : 0.5;
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
     * 七项各自的年度扣除额（单位：元）。
     *
     * @param {Object} input 字段说明（缺省即 0 / 不享受）：
     *   infants                3 岁以下婴幼儿个数
     *   infantShare            婴幼儿照护分摊比例（100 或 50）
     *   children               子女教育：符合条件的子女个数
     *   childShare             子女教育分摊比例（100 或 50）
     *   degreeMonths           学历（学位）继续教育享受月数（同一学历最长 48 个月）
     *   certCount              当年取得职业资格继续教育证书数（每张 3600 元，一次性）
     *   medicalSelfPaid        大病医疗：医保目录内个人自付累计（元）
     *   housing                'loan' 住房贷款利息 / 'rent' 住房租金 / 其他值视为不享受
     *   loanMonths             住房贷款利息享受月数（最长 240 个月）
     *   rentTier               住房租金城市档：1 = 1500、2 = 1100、3 = 800（元/月）
     *   rentMonths             住房租金享受月数（一年最多 12 个月）
     *   elderly                'only' 独生子女 / 'shared' 非独生子女分摊 / 其他值视为不享受
     *   elderlyMonthly         非独生子女分摊的月扣除额（每人不超过 1500 元/月）
     */
    function annualOf(input) {
        input = input || {};
        var r = rules().items;

        var infantCount = toNumber(input.infants);
        var infantShare = sharePercentOf(input.infantShare);
        var childCount = toNumber(input.children);
        var childShare = sharePercentOf(input.childShare);

        var degreeMonths = Math.min(toNumber(input.degreeMonths), r.continuingEducationDegree.maxMonths);
        var certCount = toNumber(input.certCount);

        // 大病医疗：超过起扣线的部分才可扣，且不超过年度限额
        var medicalSelfPaid = toNumber(input.medicalSelfPaid);
        var medical = Math.min(
            Math.max(0, medicalSelfPaid - r.seriousIllness.threshold),
            r.seriousIllness.annualCap
        );

        var housing = input.housing === 'loan' ? 'loan' : (input.housing === 'rent' ? 'rent' : 'none');
        var loanMonths = housing === 'loan' ? Math.min(toNumber(input.loanMonths), r.housingLoan.maxMonths) : 0;
        var rentTier = Math.min(Math.max(Math.round(toNumber(input.rentTier, 1)), 1), r.housingRent.monthlyByCityTier.length);
        var rentMonthly = r.housingRent.monthlyByCityTier[rentTier - 1];
        var rentMonths = housing === 'rent' ? Math.min(toNumber(input.rentMonths), r.housingRent.months) : 0;

        var elderly = input.elderly === 'only' ? 'only' : (input.elderly === 'shared' ? 'shared' : 'none');
        var elderlyMonthly = elderly === 'only'
            ? r.elderlySupport.monthly
            : (elderly === 'shared' ? Math.min(toNumber(input.elderlyMonthly), r.elderlySupport.monthlyCapPerPerson) : 0);

        var items = {
            infantCare: infantCount * r.infantCare.monthly * r.infantCare.months * infantShare,
            childrenEducation: childCount * r.childrenEducation.monthly * r.childrenEducation.months * childShare,
            continuingEducationDegree: r.continuingEducationDegree.monthly * degreeMonths,
            continuingEducationCert: r.continuingEducationCert.annual * certCount,
            seriousIllness: medical,
            housingLoan: r.housingLoan.monthly * loanMonths,
            housingRent: rentMonthly * rentMonths,
            elderlySupport: elderlyMonthly * r.elderlySupport.months
        };

        var totalAnnual = 0;
        var keys = Object.keys(items);
        for (var i = 0; i < keys.length; i++) totalAnnual += items[keys[i]];

        return {
            rules: rules(),
            input: input,
            items: items,
            detail: {
                infantCount: infantCount,
                infantShare: infantShare,
                childCount: childCount,
                childShare: childShare,
                degreeMonths: degreeMonths,
                certCount: certCount,
                medicalSelfPaid: medicalSelfPaid,
                medicalThreshold: r.seriousIllness.threshold,
                medicalCap: r.seriousIllness.annualCap,
                housing: housing,
                loanMonths: loanMonths,
                rentTier: rentTier,
                rentMonthly: rentMonthly,
                rentMonths: rentMonths,
                elderly: elderly,
                elderlyMonthly: elderlyMonthly,
                elderlyCap: r.elderlySupport.monthlyCapPerPerson
            },
            totalAnnual: totalAnnual,
            totalMonthly: totalAnnual / 12
        };
    }

    /**
     * 节税额：扣除降低的是应纳税所得额，所以必须「两段计税相减」，
     * 而不是「扣除额 × 税率」（跨档时会算多）。
     *
     * @param {Object} input
     *   taxableBefore     扣除前的全年应纳税所得额（元）
     *   annualDeduction   全年专项附加扣除合计（元）
     */
    function savingOf(input) {
        input = input || {};
        var taxableBefore = Math.max(0, toNumber(input.taxableBefore));
        var deduction = Math.max(0, toNumber(input.annualDeduction));
        var taxableAfter = Math.max(0, taxableBefore - deduction);

        var taxBefore = global.calculateTaxByTaxableIncome(taxableBefore).tax;
        var taxAfter = global.calculateTaxByTaxableIncome(taxableAfter).tax;
        var bracket = bracketOf(taxableBefore);

        return {
            taxableBefore: taxableBefore,
            taxableAfter: taxableAfter,
            deduction: deduction,
            usedDeduction: taxableBefore - taxableAfter,     // 扣除额超过应纳税所得额时，超出部分「用不上」
            taxBefore: taxBefore,
            taxAfter: taxAfter,
            saving: taxBefore - taxAfter,
            rate: bracket.rate,
            deductionForBracket: bracket.deduction,
            bracket: bracket,
            effectiveRate: taxableBefore > 0 ? (taxBefore - taxAfter) / taxableBefore : 0
        };
    }

    /**
     * 主计算：七项年度扣除合计 + 节税额（并给出「扣除额 × 适用税率」的天真算法作为对照，
     * 跨档时两者不同，页面用这个差异解释「为什么不是简单相乘」）。
     */
    function compareOf(input) {
        input = input || {};
        var annual = annualOf(input);
        var saving = savingOf({ taxableBefore: input.taxableBefore, annualDeduction: annual.totalAnnual });
        var naive = saving.deduction * saving.rate;

        return {
            rules: annual.rules,
            rateTable: rateTable(),
            items: annual.items,
            detail: annual.detail,
            totalAnnual: annual.totalAnnual,
            totalMonthly: annual.totalMonthly,
            taxableBefore: saving.taxableBefore,
            taxableAfter: saving.taxableAfter,
            taxBefore: saving.taxBefore,
            taxAfter: saving.taxAfter,
            saving: saving.saving,
            rate: saving.rate,
            deductionForBracket: saving.deductionForBracket,
            bracket: saving.bracket,
            naiveSaving: naive,
            naiveGap: naive - saving.saving,     // > 0 说明「扣除额 × 税率」高估了节税
            effectiveRate: saving.effectiveRate,
            monthlySaving: saving.saving / 12
        };
    }

    global.EuriskoSpecialDeductionQuick = {
        rules: rules,
        rateTable: rateTable,
        bracketOf: bracketOf,
        annualOf: annualOf,
        savingOf: savingOf,
        compareOf: compareOf
    };
})(typeof window !== 'undefined' ? window : globalThis);
