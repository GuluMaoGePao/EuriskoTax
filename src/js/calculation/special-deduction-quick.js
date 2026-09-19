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

    // ---------------------------------------------------------------------------
    // 阶段17 17D-8（v1.64.0）：专项附加扣除**完整测算**的可复用口径
    //
    // 与 compareOf 同源（同一份 specialDeductionRules、同一张 comprehensiveTaxRates、
    // 同一个内核计税函数），多出来的是速算器那个「扣除前全年应纳税所得额」输入框
    // 表达不出来的三层：
    //   ① **夫妻之间怎么分摊**：扣除抵的是**各自**的应纳税所得额，放在税率高的一方身上
    //      才省得多 —— 速算器只算一个人，于是「夫妻间怎么分」这个最值钱的问题它答不了；
    //   ② **按实际符合条件的月份累计**：年中满 3 岁 / 满 60 岁 / 毕业 / 贷款还清 / 年中起租
    //      都不是满 12 个月，速算器一律按 12 个月满算，直接多算扣除、少算税；
    //   ③ **逐项的边际节税**：跨档时各项「单独省」之和 ≠ 合计省，给出每一项实际贡献。

    function basicDeductionOf() {
        if (global.EuriskoSettlementQuick && global.EuriskoSettlementQuick.ANNUAL_BASIC_DEDUCTION) {
            return global.EuriskoSettlementQuick.ANNUAL_BASIC_DEDUCTION;
        }
        return (global.settlementRules && global.settlementRules.annualBasicDeduction) || 60000;
    }

    function taxOf(taxable) {
        return global.calculateTaxByTaxableIncome(Math.max(0, Number(taxable) || 0)).tax;
    }

    function clampMonths(v, max, fallback) {
        var n = toNumber(v, fallback);
        n = Math.max(0, Math.min(n, max));
        return n;
    }

    /** 扣除前应纳税所得额：全年工资薪金 − 6 万 − 五险一金 − 其他扣除（不含专项附加扣除） */
    function personOf(input, prefix) {
        var monthly = Math.max(0, toNumber(input[prefix + 'MonthlyIncome']));
        var insurance = Math.max(0, toNumber(input[prefix + 'MonthlyInsurance']));
        var other = Math.max(0, toNumber(input[prefix + 'OtherDeduction']));
        var income = monthly * 12;
        var taxableBefore = Math.max(0, income - basicDeductionOf() - insurance * 12 - other);
        return {
            monthlyIncome: monthly, monthlyInsurance: insurance, otherDeduction: other,
            income: income, insurance: insurance * 12, basicDeduction: basicDeductionOf(),
            taxableBefore: taxableBefore, taxBefore: taxOf(taxableBefore),
            bracket: bracketOf(taxableBefore)
        };
    }

    /** 七项逐项核定：标准读 specialDeductionRules，月数按用户填的实际享受月数 */
    function buildItemsOf(input) {
        var r = rules();
        var it = r.items;
        var list = [];

        function push(o) {
            if (!(o.annual > 0)) return;
            list.push(o);
        }

        // 子女教育：每个子女 2000 元/月 × 本年符合条件的月数；父母可 100% 一方 或 各 50%
        var childCount = toNumber(input.children);
        var childMonths = clampMonths(input.childMonths, it.childrenEducation.months, it.childrenEducation.months);
        push({
            key: 'childrenEducation', label: it.childrenEducation.label,
            monthly: it.childrenEducation.monthly, months: childMonths,
            annual: childCount * it.childrenEducation.monthly * childMonths,
            sharable: true, note: childCount + ' 个子女 × ' + it.childrenEducation.monthly + ' 元/月 × ' + childMonths + ' 个月'
        });

        // 3 岁以下婴幼儿照护：分摊规则与子女教育相同
        var infantCount = toNumber(input.infants);
        var infantMonths = clampMonths(input.infantMonths, it.infantCare.months, it.infantCare.months);
        push({
            key: 'infantCare', label: it.infantCare.label,
            monthly: it.infantCare.monthly, months: infantMonths,
            annual: infantCount * it.infantCare.monthly * infantMonths,
            sharable: true, note: infantCount + ' 个婴幼儿 × ' + it.infantCare.monthly + ' 元/月 × ' + infantMonths + ' 个月'
        });

        // 继续教育（学历 / 学位）：400 元/月，同一学历最长 48 个月；只能由本人扣除
        // 本年最多只能扣 12 个月；48 个月是**同一学历的累计**上限（提示用，不参与本年计算）
        var degreeMonths = clampMonths(input.degreeMonths, 12, 0);
        push({
            key: 'continuingEducationDegree', label: it.continuingEducationDegree.label,
            monthly: it.continuingEducationDegree.monthly, months: degreeMonths,
            annual: it.continuingEducationDegree.monthly * degreeMonths,
            sharable: false,
            note: it.continuingEducationDegree.monthly + ' 元/月 × ' + degreeMonths + ' 个月（同一学历累计不超过 ' + it.continuingEducationDegree.maxMonths + ' 个月）'
        });

        // 继续教育（职业资格）：取得证书**当年**一次性 3600 元
        var certCount = toNumber(input.certCount);
        push({
            key: 'continuingEducationCert', label: it.continuingEducationCert.label,
            monthly: 0, months: 0,
            annual: it.continuingEducationCert.annual * certCount,
            sharable: false, note: '取得证书当年一次性扣除 ' + it.continuingEducationCert.annual + ' 元 × ' + certCount + ' 本'
        });

        // 大病医疗：超起扣线的部分据实扣、限额封顶；可由本人或配偶扣除（只能汇算时办）
        var medicalSelfPaid = toNumber(input.medicalSelfPaid);
        var medical = Math.min(Math.max(0, medicalSelfPaid - it.seriousIllness.threshold), it.seriousIllness.annualCap);
        push({
            key: 'seriousIllness', label: it.seriousIllness.label,
            monthly: 0, months: 0, annual: medical, sharable: true,
            note: '自付 ' + Math.round(medicalSelfPaid) + ' 元 − 起扣线 ' + Math.round(it.seriousIllness.threshold)
                + ' 元，限额 ' + Math.round(it.seriousIllness.annualCap) + ' 元（只能在汇算时扣）'
        });

        var housing = input.housing === 'loan' ? 'loan' : (input.housing === 'rent' ? 'rent' : 'none');
        if (housing === 'loan') {
            // 同样：本年最多 12 个月，240 个月是**同一住房贷款的累计**上限
            var loanMonths = clampMonths(input.loanMonths, 12, 12);
            push({
                key: 'housingLoan', label: it.housingLoan.label,
                monthly: it.housingLoan.monthly, months: loanMonths,
                annual: it.housingLoan.monthly * loanMonths, sharable: true,
                note: it.housingLoan.monthly + ' 元/月 × ' + loanMonths + ' 个月（同一住房贷款累计不超过 ' + it.housingLoan.maxMonths + ' 个月）'
            });
        } else if (housing === 'rent') {
            var tier = Math.min(Math.max(Math.round(toNumber(input.rentTier, 1)), 1), it.housingRent.monthlyByCityTier.length);
            var rentMonthly = it.housingRent.monthlyByCityTier[tier - 1];
            var rentMonths = clampMonths(input.rentMonths, it.housingRent.months, it.housingRent.months);
            push({
                key: 'housingRent', label: it.housingRent.label,
                monthly: rentMonthly, months: rentMonths,
                annual: rentMonthly * rentMonths, sharable: false,
                note: '城市第 ' + tier + ' 档 ' + rentMonthly + ' 元/月 × ' + rentMonths + ' 个月（由签订租赁合同的承租人扣除）'
            });
        }

        // 赡养老人：独生子女 3000 元/月；非独生子女分摊每人不超过 1500 元/月
        var elderly = input.elderly === 'only' ? 'only' : (input.elderly === 'shared' ? 'shared' : 'none');
        var elderlyMonths = clampMonths(input.elderlyMonths, it.elderlySupport.months, it.elderlySupport.months);
        var elderlyMonthly = elderly === 'only'
            ? it.elderlySupport.monthly
            : (elderly === 'shared' ? Math.min(toNumber(input.elderlyMonthly), it.elderlySupport.monthlyCapPerPerson) : 0);
        push({
            key: 'elderlySupport', label: it.elderlySupport.label,
            monthly: elderlyMonthly, months: elderlyMonths,
            annual: elderlyMonthly * elderlyMonths, sharable: false,
            note: elderly === 'only'
                ? '独生子女 ' + it.elderlySupport.monthly + ' 元/月 × ' + elderlyMonths + ' 个月'
                : '非独生子女分摊 ' + Math.round(elderlyMonthly) + ' 元/月（每人不超过 ' + it.elderlySupport.monthlyCapPerPerson + ' 元/月）× ' + elderlyMonths + ' 个月'
        });

        return list;
    }

    /**
     * 完整测算：逐项核定 → 在夫妻之间枚举分摊方案 → 取家庭税负最低的那个。
     *
     * @param {Object} input
     *   selfMonthlyIncome / selfMonthlyInsurance / selfOtherDeduction      本人（A）
     *   spouseMonthlyIncome / spouseMonthlyInsurance / spouseOtherDeduction 配偶（B），为 0 即视为单身
     *   children / childMonths / childShare      子女个数 / 本年享受月数 / 分摊（auto|self|spouse|split）
     *   infants / infantMonths / infantShare     同上（3 岁以下婴幼儿）
     *   medicalSelfPaid / medicalShare           大病医疗自付累计 / 由谁扣
     *   housing / loanMonths / loanShare / rentTier / rentMonths
     *   elderly / elderlyMonths / elderlyMonthly
     *   degreeMonths / certCount
     */
    function fullOf(input) {
        input = input || {};
        var r = rules();
        var self = personOf(input, 'self');
        var spouse = personOf(input, 'spouse');
        var hasSpouse = spouse.income > 0;

        var items = buildItemsOf(input);
        var totalAnnual = 0;
        items.forEach(function (it) { totalAnnual += it.annual; });

        // 分摊选项：只有夫妻双方都有收入时才有「给谁」这个问题
        function optionsOf(item) {
            if (!item.sharable || !hasSpouse) return ['self'];
            var asked = input[(item.key === 'childrenEducation' ? 'childShare'
                : item.key === 'infantCare' ? 'infantShare'
                    : item.key === 'housingLoan' ? 'loanShare' : 'medicalShare')];
            if (asked === 'self' || asked === 'spouse' || asked === 'split') return [asked];
            return ['self', 'spouse', 'split'];
        }

        // 枚举全部组合（可分摊项最多 4 个 × 3 种 = 81 个方案，逐方案只做两次计税）
        var plans = [];
        (function walk(i, owners, dSelf, dSpouse) {
            if (i >= items.length) {
                var taxSelf = taxOf(self.taxableBefore - dSelf);
                var taxSpouse = taxOf(spouse.taxableBefore - dSpouse);
                plans.push({
                    owners: owners,
                    deductionSelf: dSelf, deductionSpouse: dSpouse,
                    taxSelf: taxSelf, taxSpouse: taxSpouse,
                    totalTax: taxSelf + taxSpouse,
                    wastedSelf: Math.max(0, dSelf - self.taxableBefore),
                    wastedSpouse: Math.max(0, dSpouse - spouse.taxableBefore)
                });
                return;
            }
            var item = items[i];
            optionsOf(item).forEach(function (opt) {
                var next = {};
                Object.keys(owners).forEach(function (k) { next[k] = owners[k]; });
                next[item.key] = opt;
                var a = item.annual, addSelf = 0, addSpouse = 0;
                if (opt === 'split') { addSelf = a / 2; addSpouse = a / 2; }
                else if (opt === 'spouse') { addSpouse = a; }
                else { addSelf = a; }
                walk(i + 1, next, dSelf + addSelf, dSpouse + addSpouse);
            });
        })(0, {}, 0, 0);

        var baselineTax = taxOf(self.taxableBefore) + taxOf(spouse.taxableBefore);
        plans.forEach(function (p) { p.saving = baselineTax - p.totalTax; });

        var best = plans.reduce(function (acc, p) {
            if (!acc) return p;
            return p.totalTax < acc.totalTax - 1e-9 ? p : acc;
        }, null);
        var allSelf = plans.filter(function (p) {
            return Object.keys(p.owners).every(function (k) { return p.owners[k] === 'self'; });
        })[0] || best;

        // 逐项边际贡献：从最优方案里**去掉这一项**后家庭税的增加额
        var marginal = items.map(function (item) {
            var dSelf = best.deductionSelf, dSpouse = best.deductionSpouse;
            var opt = best.owners[item.key];
            if (opt === 'split') { dSelf -= item.annual / 2; dSpouse -= item.annual / 2; }
            else if (opt === 'spouse') { dSpouse -= item.annual; }
            else { dSelf -= item.annual; }
            var taxWithout = taxOf(self.taxableBefore - dSelf) + taxOf(spouse.taxableBefore - dSpouse);
            return {
                key: item.key, label: item.label, annual: item.annual,
                owner: opt, contribution: taxWithout - best.totalTax
            };
        }).sort(function (a, b) { return b.contribution - a.contribution; });

        // 房贷 vs 租金：同一纳税年度只能二选一，给出另一个口径的对照（供判断，不可叠加）
        var housingCompare = null;
        var housing = input.housing;
        if (housing === 'loan' || housing === 'rent') {
            var tier = Math.min(Math.max(Math.round(toNumber(input.rentTier, 1)), 1), r.items.housingRent.monthlyByCityTier.length);
            var rentMonthly = r.items.housingRent.monthlyByCityTier[tier - 1];
            var rentAnnual = rentMonthly * clampMonths(housing === 'rent' ? input.rentMonths : 12, 12, 12);
            var loanAnnual = r.items.housingLoan.monthly * clampMonths(housing === 'loan' ? input.loanMonths : 12, 12, 12);
            housingCompare = {
                loan: loanAnnual, rent: rentAnnual,
                chosen: housing, better: rentAnnual > loanAnnual ? 'rent' : 'loan',
                gap: Math.abs(rentAnnual - loanAnnual)
            };
        }

        return {
            rules: r,
            self: self,
            spouse: spouse,
            hasSpouse: hasSpouse,
            items: items,
            totalAnnual: totalAnnual,
            plans: plans,
            best: best,
            allSelf: allSelf,
            splitGain: allSelf.totalTax - best.totalTax,   // 「全部给自己」比最优方案多交的税
            baselineTax: baselineTax,
            saving: best ? best.saving : 0,
            marginal: marginal,
            housingCompare: housingCompare,
            exclusive: r.exclusive
        };
    }

    function ownerTextOf(owner, hasSpouse) {
        if (!hasSpouse) return '本人';
        if (owner === 'spouse') return '配偶';
        if (owner === 'split') return '本人 50% + 配偶 50%';
        return '本人 100%';
    }

    global.EuriskoSpecialDeductionQuick = {
        rules: rules,
        rateTable: rateTable,
        bracketOf: bracketOf,
        annualOf: annualOf,
        savingOf: savingOf,
        compareOf: compareOf,
        // 阶段17 17D-8（v1.64.0）完整测算口径
        personOf: personOf,
        buildItemsOf: buildItemsOf,
        fullOf: fullOf,
        ownerTextOf: ownerTextOf
    };
})(typeof window !== 'undefined' ? window : globalThis);
