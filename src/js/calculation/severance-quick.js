/**
 * 解除劳动关系一次性补偿收入（经济补偿金 / 生活补助费等）—— 轻量实现（阶段15 15A-3）
 *
 * 为什么单独做一个 quick 文件：
 *   /seo/severance.html 只需要「免税额度 + 单独计税」这一个结论，不值得为此再引一遍
 *   完整的年度汇算内核与它的十余个入参。但**税率表与定档规则必须同源** ——
 *   所以本文件不复制任何数字：税率表取注册表声明的 comprehensiveTaxRates，
 *   税额直接调内核 calculateTaxByTaxableIncome，规则取 severanceRules。
 *   改档位时只需改常量一处，落地页与 App 不会各说一套。
 *   （对拍见 tests/severance-quick.test.js：税额 ≡ 内核，逐点相等。）
 *
 * 口径要点（错了就是全网最普遍的错误）：
 *   1. 免税额度 = 当地上年职工**年平均工资 × 3**（财税〔2018〕164 号第五条第一项）；
 *   2. 超过部分**不并入**当年综合所得，单独适用**年度**综合所得税率表，且不减除任何费用；
 *   3. 「12 年」是《劳动合同法》第四十七条对经济补偿金**本身**的封顶（月工资也按 3 倍封顶），
 *      不是计税方法 —— 国税发〔1999〕178 号「÷ 工作年限平均为月工资」的做法已不再执行；
 *   4. 免税额度只能抵「符合法定标准的补偿」：超出法定标准发放的部分不享受免税。
 */
(function (global) {
    'use strict';

    var registry = global.EuriskoTaxRegistry;

    /**
     * 规则与税率表来自注册表声明的全局量（不复制第二份）
     */
    function rules() {
        return (registry && registry.resolveParams('severance').rules) || global.severanceRules;
    }

    function rateTable() {
        return (registry && registry.resolveParams('severance').rates) || global.comprehensiveTaxRates;
    }

    function toNumber(v) {
        var n = Number(v);
        return isFinite(n) && n > 0 ? n : 0;
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
     * 一次性补偿收入的应纳税额 = 应纳税所得额 × 年度税率 − 速算扣除数（不减除费用）
     * 等价于内核 calculateTaxByTaxableIncome，只是这里返回数字，方便落地页直接用。
     */
    function taxSeparateOf(taxableIncome) {
        return global.calculateTaxByTaxableIncome(Math.max(0, Number(taxableIncome) || 0)).tax;
    }

    /**
     * 《劳动合同法》第四十七条下的「法定经济补偿上限」：
     *   月工资高于当地上年度职工月平均工资 3 倍的按 3 倍计，支付年限不超过 12 年。
     * 这是「能合法拿多少」的上限，只用于判断哪部分补偿可以享受免税额度；
     * 计算税额时不按年限做任何平均。
     *
     * 缺少社平工资或月工资入参时返回 null，表示「不校验法定上限」（此时全额补偿视为符合法定标准）。
     */
    function legalCapOf(input) {
        input = input || {};
        var avgWage = toNumber(input.avgWage);
        var monthlyWage = toNumber(input.monthlyWage);
        var years = toNumber(input.years);
        if (avgWage <= 0 || monthlyWage <= 0) return null;

        var monthlyAverageWage = avgWage / 12;
        var cappedMonthlyWage = Math.min(monthlyWage, monthlyAverageWage * rules().capMonthlyWageMultiple);
        // 每满一年支付一个月工资；超过 12 年的部分《劳动合同法》不再计付
        var cappedYears = Math.min(years, rules().capYears);
        return {
            avgWage: avgWage,
            monthlyAverageWage: monthlyAverageWage,
            monthlyWage: monthlyWage,
            cappedMonthlyWage: cappedMonthlyWage,
            years: years,
            cappedYears: cappedYears,
            months: cappedYears,
            amount: cappedMonthlyWage * cappedYears
        };
    }

    /**
     * 主计算：免税额度 + 单独计税，并给出「若并入当年综合所得」的口径对照。
     *
     * @param {Object} input 字段均为元 / 年：
     *   economic        经济补偿金（元）
     *   other           其他一次性补助：医疗补助费、生活补助费等（元）
     *   avgWage         当地上年职工年平均工资（元/年）
     *   monthlyWage     离职前 12 个月月平均工资（元）
     *   years           在本单位工作年限（年）
     *   otherTaxable    当年其他综合所得的应纳税所得额（元，仅用于「并入」对照）
     */
    function compareOf(input) {
        input = input || {};
        var economic = toNumber(input.economic);
        var other = toNumber(input.other);
        var amount = economic + other;
        var avgWage = toNumber(input.avgWage);
        var otherTaxable = toNumber(input.otherTaxable);

        var cap = legalCapOf(input);
        var legalPart;   // 符合法定标准的补偿（这部分才能享受免税额度）
        var overLegal;   // 超出法定标准发放的部分（不享受免税，全额计税）
        if (cap) {
            var legalEconomic = Math.min(economic, cap.amount);
            legalPart = legalEconomic + other;   // 其他补助费按实际支付数认可（法定只设下限）
            overLegal = economic - legalEconomic;
        } else {
            legalPart = amount;
            overLegal = 0;
        }

        // 免税额度 = 当地上年职工年平均工资 × 3；只能抵「符合法定标准」的那部分
        var exemptCap = avgWage * rules().exemptMultipleOfAverageWage;
        var exemptUsed = Math.min(legalPart, exemptCap);
        var taxable = Math.max(0, amount - exemptUsed);

        var bracket = bracketOf(taxable);
        var tax = taxSeparateOf(taxable);        // 不并入综合所得、不减除费用
        var otherTax = taxSeparateOf(otherTaxable);
        var mergedTotal = taxSeparateOf(Math.max(0, otherTaxable + taxable));
        var separateTotal = tax + otherTax;
        var gap = mergedTotal - separateTotal;

        return {
            rules: rules(),
            rateTable: rateTable(),
            economic: economic,
            other: other,
            amount: amount,
            avgWage: avgWage,
            otherTaxable: otherTaxable,
            legalCap: cap ? cap.amount : null,
            capDetail: cap,
            legalPart: legalPart,
            overLegal: overLegal,
            exemptCap: exemptCap,
            exemptUsed: exemptUsed,
            taxable: taxable,
            tax: tax,
            rate: bracket.rate,
            deduction: bracket.deduction,
            bracket: bracket,
            net: amount - tax,
            effectiveRate: amount > 0 ? tax / amount : 0,
            // 口径对照：现行政策是不并入，并入只是帮助理解差异的假设计算
            otherTax: otherTax,
            separateTotal: separateTotal,
            mergedTotal: mergedTotal,
            gap: gap,
            direction: Math.abs(gap) < 1e-9 ? 'same' : (gap > 0 ? 'separate-cheaper' : 'merge-cheaper')
        };
    }

    global.EuriskoSeveranceQuick = {
        rules: rules,
        rateTable: rateTable,
        bracketOf: bracketOf,
        taxSeparateOf: taxSeparateOf,
        legalCapOf: legalCapOf,
        compareOf: compareOf
    };
})(typeof window !== 'undefined' ? window : globalThis);
