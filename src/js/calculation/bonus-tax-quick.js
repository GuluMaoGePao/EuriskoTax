/**
 * 年终奖（全年一次性奖金）单独计税 —— 轻量实现，供 SEO 落地页使用（阶段14 剩余项）
 *
 * 为什么单独有这么一个文件：
 *   落地页只需要一个能跑的小算器，但为调用一个 6 行的函数而给它加载整个计算层
 *   （tax-calculator.js 116KB + utils.js 64KB）会把首屏性能拖垮；
 *   而把那 6 行抄进 HTML，又会变成「税率逻辑的第二处实现」——
 *   App 侧改了、页面不改，同一个人在首页与落地页看到的两个数字不一样。
 *
 * 折中方案：
 *   - 逻辑写在可测试的代码里（这里），并用 tests/bonus-tax-quick.test.js 与内核
 *     calculateBonusTax 在临界点、档内、随机点上逐点对拍 → 等价性有断言，不靠口头约定；
 *   - 税率表**不复制**：直接读 window.bonusMonthlyTaxRates —— tax-constants.js 的出厂值，
 *     或被 tax-rates-sync.js 从 /api/config/tax-rates 覆盖后的运营热改值，
 *     与 App 用的是同一份（避免「页面按旧税率、App 按新税率」）。
 *
 * 对外接口：window.EuriskoBonusQuick = { taxOf(bonus, brackets), bracketOf(bonus, brackets) }
 */
(function () {
    'use strict';

    function defaultBrackets() {
        if (Array.isArray(window.bonusMonthlyTaxRates)) return window.bonusMonthlyTaxRates;
        if (window.EuriskoTaxConstants && Array.isArray(window.EuriskoTaxConstants.bonusMonthlyTaxRates)) {
            return window.EuriskoTaxConstants.bonusMonthlyTaxRates;
        }
        return [];
    }

    function resolve(table) {
        return Array.isArray(table) && table.length ? table : defaultBrackets();
    }

    // 命中的税率档（奖金 ÷ 12 定位月均档位）
    function bracketOf(bonus, table) {
        var rows = resolve(table);
        var amount = Number(bonus);
        if (!Number.isFinite(amount) || amount <= 0 || !rows.length) return null;
        var monthly = amount / 12;
        for (var i = 0; i < rows.length; i++) {
            if (monthly <= rows[i].max) return rows[i];
        }
        return null;
    }

    // 与 tax-calculator.js#calculateBonusTax 同口径：
    //   全额（而非月均）乘税率，再减速算扣除数 —— 这是「临界点跳档」现象的根源
    function taxOf(bonus, table) {
        var bracket = bracketOf(bonus, table);
        if (!bracket) return 0;
        return Number(bonus) * bracket.rate - bracket.deduction;
    }

    window.EuriskoBonusQuick = { taxOf: taxOf, bracketOf: bracketOf };
})();
