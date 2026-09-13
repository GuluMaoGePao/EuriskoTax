/**
 * 综合所得年度汇算（应退/应补）—— 轻量实现，供 SEO 落地页使用（阶段14 剩余项 · 汇算清缴页）
 *
 * 与 bonus-tax-quick.js / salary-tax-quick.js 同一套思路（见 docs/development/seo-landing-plan.md §2）：
 *   - 逻辑写在可测试的代码里，由 tests/annual-settlement-quick.test.js 与内核
 *     computeDeductions + performTaxCalculation（App 综合所得汇算的真源）逐点对拍；
 *   - 税率表**不复制**：直接读 window.comprehensiveTaxRates —— tax-constants.js 的出厂值，
 *     或被 tax-rates-sync.js 从 /api/config/tax-rates 覆盖后的运营热改值，与 App 同一份。
 *
 * 汇算口径（与内核完全一致，逐字对齐 tax-calculator.js#performTaxCalculation）：
 *   全年收入       = 月薪 × 任职月数
 *   年度总扣除     =（5000 + 五险一金 + 专项附加扣除）× 任职月数
 *   应纳税所得额   = max(0, 全年收入 − 年度总扣除)
 *   年度应纳税额   = 应纳税所得额 × 年度税率 − 速算扣除数
 *   已预缴税额     = 用户按个税 App 实际已缴税额填写优先；未填写则按累计预扣法推演
 *   应退/应补      = 年度应纳税额 − 已预缴税额   （正数 = 应补，负数 = 应退）
 *
 * 注意 1：基本减除费用按**任职月数**累计（与 App 一致，即 5000 × 任职月数），
 *         不是固定 60000 —— 与 App 不同口径会让同一个用户在落地页与首页看到两个结论。
 * 注意 2：累计额用**逐月相加**而非「单月额 × 月数」，二者在浮点下不恒等
 *         （如 2999.99 × 12 = 35999.88，而逐月相加为 35999.87999999999）；
 *         年收入与总扣除沿用内核的乘法写法，累计预扣沿用内核的逐月累加写法。
 *
 * 对外接口：window.EuriskoSettlementQuick = {
 *   BASIC_DEDUCTION, annualIncomeOf, annualDeductionOf, annualTaxableOf,
 *   bracketOf, annualTaxOf, prepaidOf, settlementOf
 * }
 */
(function () {
    'use strict';

    // 基本减除费用（起征点）。与主站表单 #basic-deduction 的固定值一致
    // （该输入框 min=max=5000 且 disabled），tests/annual-settlement-quick.test.js 会把它钉回 index.html。
    var BASIC_DEDUCTION = 5000;

    function resolveTable(table) {
        if (Array.isArray(table) && table.length) return table;
        if (Array.isArray(window.comprehensiveTaxRates)) return window.comprehensiveTaxRates;
        if (window.EuriskoTaxConstants && Array.isArray(window.EuriskoTaxConstants.comprehensiveTaxRates)) {
            return window.EuriskoTaxConstants.comprehensiveTaxRates;
        }
        return [];
    }

    // 任职月数：非法/非正一律按 0 处理（调用方据此返回 0 而不是 NaN）
    function monthsOf(months) {
        var m = Math.floor(Number(months));
        return (Number.isFinite(m) && m > 0) ? m : 0;
    }

    // 全年收入 = 月薪 × 任职月数（与内核 totalIncome 同写法）
    function annualIncomeOf(monthlyIncome, months) {
        var income = Number(monthlyIncome);
        var m = monthsOf(months);
        if (!Number.isFinite(income) || income <= 0 || m <= 0) return 0;
        return income * m;
    }

    // 年度总扣除 =（5000 + 五险一金 + 专项附加扣除）× 任职月数（与内核 totalDeduction 同写法）
    function annualDeductionOf(months, monthlyInsurance, monthlySpecialAdditional) {
        var m = monthsOf(months);
        if (m <= 0) return 0;
        return BASIC_DEDUCTION * m + (Number(monthlyInsurance) || 0) * m + (Number(monthlySpecialAdditional) || 0) * m;
    }

    // 应纳税所得额 = max(0, 全年收入 − 年度总扣除)
    function annualTaxableOf(monthlyIncome, months, monthlyInsurance, monthlySpecialAdditional) {
        var income = annualIncomeOf(monthlyIncome, months);
        if (income <= 0) return 0;
        var taxable = income - annualDeductionOf(months, monthlyInsurance, monthlySpecialAdditional);
        return taxable > 0 ? taxable : 0;
    }

    // 命中的年度税率档（按应纳税所得额定档）
    function bracketOf(taxableIncome, table) {
        var rows = resolveTable(table);
        var amount = Number(taxableIncome);
        if (!Number.isFinite(amount) || amount <= 0 || !rows.length) return null;
        for (var i = 0; i < rows.length; i++) {
            if (amount <= rows[i].max) return rows[i];
        }
        return rows[rows.length - 1];
    }

    // 年度应纳税额（对年度应纳税所得额查表：全额 × 税率 − 速算扣除数）
    function annualTaxOf(monthlyIncome, months, monthlyInsurance, monthlySpecialAdditional, table) {
        var taxable = annualTaxableOf(monthlyIncome, months, monthlyInsurance, monthlySpecialAdditional);
        var bracket = bracketOf(taxable, table);
        if (!bracket) return 0;
        return taxable * bracket.rate - bracket.deduction;
    }

    // 按累计预扣法推演的已预缴税额：逐月累加应纳税所得额后查同一张年度税率表。
    // 与内核 calculateCumulativePrepaidTax 同构（五险一金/专项附加以外的扣除项传 0），
    // 也与落地页 salary-tax-quick.js 的 taxOf 结果一致 —— 两处都由测试对拍钉住。
    function prepaidOf(monthlyIncome, months, monthlyInsurance, monthlySpecialAdditional, table) {
        var income = Number(monthlyIncome);
        var m = monthsOf(months);
        if (!Number.isFinite(income) || income <= 0 || m <= 0) return 0;
        var perMonth = income - BASIC_DEDUCTION - (Number(monthlyInsurance) || 0) - (Number(monthlySpecialAdditional) || 0);
        if (perMonth < 0) perMonth = 0;
        var cumulativeTaxable = 0;
        for (var i = 0; i < m; i++) cumulativeTaxable += perMonth;
        var bracket = bracketOf(cumulativeTaxable, table);
        if (!bracket) return 0;
        return cumulativeTaxable * bracket.rate - bracket.deduction;
    }

    // 汇算结果：应退/应补 = 年度应纳税额 − 已预缴税额（正数 = 应补，负数 = 应退）
    // prepaidTax 留空（或非正数）时按累计预扣法推演 —— 与主站「已预缴税额」输入框语义一致
    function settlementOf(monthlyIncome, months, monthlyInsurance, monthlySpecialAdditional, prepaidTax) {
        var annualTaxable = annualTaxableOf(monthlyIncome, months, monthlyInsurance, monthlySpecialAdditional);
        var table = resolveTable();
        var bracket = bracketOf(annualTaxable, table);
        var annualTax = bracket ? annualTaxable * bracket.rate - bracket.deduction : 0;
        var autoPrepaid = prepaidOf(monthlyIncome, months, monthlyInsurance, monthlySpecialAdditional, table);
        var provided = Number(prepaidTax);
        var useProvided = Number.isFinite(provided) && provided > 0;
        var prepaid = useProvided ? provided : autoPrepaid;
        return {
            annualIncome: annualIncomeOf(monthlyIncome, months),
            annualDeduction: annualDeductionOf(months, monthlyInsurance, monthlySpecialAdditional),
            annualTaxable: annualTaxable,
            bracket: bracket,
            annualTax: annualTax,
            autoPrepaid: autoPrepaid,
            prepaidTax: prepaid,
            providedPrepaid: useProvided,
            diff: annualTax - prepaid
        };
    }

    window.EuriskoSettlementQuick = {
        BASIC_DEDUCTION: BASIC_DEDUCTION,
        annualIncomeOf: annualIncomeOf,
        annualDeductionOf: annualDeductionOf,
        annualTaxableOf: annualTaxableOf,
        bracketOf: bracketOf,
        annualTaxOf: annualTaxOf,
        prepaidOf: prepaidOf,
        settlementOf: settlementOf
    };
})();
