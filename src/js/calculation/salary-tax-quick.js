/**
 * 工资薪金个税（累计预扣预缴）—— 轻量实现，供 SEO 落地页使用（阶段14 剩余项 · 工资个税页）
 *
 * 与 bonus-tax-quick.js 同一套思路（见 docs/development/seo-landing-plan.md §2）：
 *   - 逻辑写在可测试的代码里，由 tests/salary-tax-quick.test.js 与内核
 *     calculateCumulativePrepaidTax 逐点对拍 → 等价性有断言，不靠口头约定；
 *   - 税率表**不复制**：直接读 window.comprehensiveTaxRates —— tax-constants.js 的出厂值，
 *     或被 tax-rates-sync.js 从 /api/config/tax-rates 覆盖后的运营热改值，与 App 同一份。
 *
 * 累计预扣预缴口径（与内核一致）：
 *   每月应纳税所得额 = 月薪 − 5000 − 五险一金 − 专项附加扣除 − 其他扣除（不足 0 按 0）
 *   累计应纳税所得额 = Σ 每月应纳税所得额
 *   累计应纳税额     = 累计应纳税所得额 × 预扣率 − 速算扣除数
 *   本月应预扣税额   = 截至本月的累计应纳税额 − 截至上月的累计应纳税额
 *   ↑ 这条「累计」特性，正是「下半年到手比上半年少」的原因：累计所得越高，适用档位越高。
 *
 * 注意：累计额用**逐月相加**而非「单月额 × 月数」，因为二者在浮点下不恒等
 * （如 2999.99 × 12 为 35999.88，而逐月相加为 35999.87999999999），
 * 逐月相加才是与内核逐位一致的口径。
 *
 * 对外接口：window.EuriskoSalaryQuick = {
 *   BASIC_DEDUCTION, monthlyTaxableOf, cumulativeTaxableOf, bracketOf, taxOf, monthlyScheduleOf
 * }
 */
(function () {
    'use strict';

    // 基本减除费用（起征点）。与主站表单 #basic-deduction 的固定值一致
    // （该输入框 min=max=5000 且 disabled），tests/salary-tax-quick.test.js 会把它钉回 index.html。
    var BASIC_DEDUCTION = 5000;

    function resolveTable(table) {
        if (Array.isArray(table) && table.length) return table;
        if (Array.isArray(window.comprehensiveTaxRates)) return window.comprehensiveTaxRates;
        if (window.EuriskoTaxConstants && Array.isArray(window.EuriskoTaxConstants.comprehensiveTaxRates)) {
            return window.EuriskoTaxConstants.comprehensiveTaxRates;
        }
        return [];
    }

    // 每月应纳税所得额：扣完起征点/五险一金/专项附加后，不足 0 按 0（负值不抵后续月份）
    function monthlyTaxableOf(monthlyIncome, monthlyInsurance, monthlySpecialAdditional) {
        var income = Number(monthlyIncome);
        if (!Number.isFinite(income)) return 0;
        var v = income - BASIC_DEDUCTION - (Number(monthlyInsurance) || 0) - (Number(monthlySpecialAdditional) || 0);
        return v > 0 ? v : 0;
    }

    // 累计预扣预缴应纳税所得额：逐月累加（与内核同构，保证浮点逐位一致）
    function cumulativeTaxableOf(monthlyIncome, months, monthlyInsurance, monthlySpecialAdditional) {
        var m = Math.floor(Number(months));
        if (!Number.isFinite(m) || m <= 0) return 0;
        var perMonth = monthlyTaxableOf(monthlyIncome, monthlyInsurance, monthlySpecialAdditional);
        var cumulative = 0;
        for (var i = 0; i < m; i++) cumulative += perMonth;
        return cumulative;
    }

    // 命中的预扣率档（按累计应纳税所得额定档）
    function bracketOf(cumulativeTaxable, table) {
        var rows = resolveTable(table);
        var amount = Number(cumulativeTaxable);
        if (!Number.isFinite(amount) || amount <= 0 || !rows.length) return null;
        for (var i = 0; i < rows.length; i++) {
            if (amount <= rows[i].max) return rows[i];
        }
        return null;
    }

    // 累计应纳税额（对累计应纳税所得额查表：全额 × 预扣率 − 速算扣除数）
    function cumulativeTaxOf(cumulativeTaxable, table) {
        var bracket = bracketOf(cumulativeTaxable, table);
        if (!bracket) return 0;
        return cumulativeTaxable * bracket.rate - bracket.deduction;
    }

    // 全年（累计口径）应纳税额
    function taxOf(monthlyIncome, months, monthlyInsurance, monthlySpecialAdditional, table) {
        var cumulative = cumulativeTaxableOf(monthlyIncome, months, monthlyInsurance, monthlySpecialAdditional);
        return cumulativeTaxOf(cumulative, table);
    }

    // 逐月预扣明细：第 k 月税额 = 截至 k 月累计税额 − 截至 k−1 月累计税额
    // 恒等于内核按月累加的语义（内核只接受固定月度值，因此可直接对拍）
    function monthlyScheduleOf(monthlyIncome, months, monthlyInsurance, monthlySpecialAdditional, table) {
        var m = Math.floor(Number(months));
        if (!Number.isFinite(m) || m <= 0) return [];
        var perMonth = monthlyTaxableOf(monthlyIncome, monthlyInsurance, monthlySpecialAdditional);
        var rows = resolveTable(table);
        var out = [];
        var prev = 0;
        var cumulativeTaxable = 0;
        for (var k = 1; k <= m; k++) {
            cumulativeTaxable += perMonth;
            var cumulative = cumulativeTaxOf(cumulativeTaxable, rows);
            out.push(cumulative - prev);
            prev = cumulative;
        }
        return out;
    }

    window.EuriskoSalaryQuick = {
        BASIC_DEDUCTION: BASIC_DEDUCTION,
        monthlyTaxableOf: monthlyTaxableOf,
        cumulativeTaxableOf: cumulativeTaxableOf,
        bracketOf: bracketOf,
        taxOf: taxOf,
        monthlyScheduleOf: monthlyScheduleOf
    };
})();
