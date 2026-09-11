// 计算引擎命名空间聚合（阶段12 A1）
//
// 设计意图：把计算层的纯函数集中挂到 window.EuriskoEngine，供
//   - 方案对比中心（A4）：脱离表单直接跑多种情景
//   - 单元测试：无需构造完整 DOM fixture
//   - 未来 B 端 API（D1）与微信小程序（D2）：复用同一套计算口径
//
// 重要：本文件**只做命名空间聚合，不承载任何计算逻辑**。
//   所有函数仍在 tax-calculator.js / utils.js 的全局作用域中定义，此处仅引用。
//   零逻辑搬移 = 零回归风险；同时沿用 history-sync.js
//   「挂 window.Xxx.pure 暴露纯函数」的既有约定（见该文件 11-15 行注释）。
//
// 加载顺序：必须位于 tax-calculator.js 与 utils.js 之后（见 index.html）。
// 注意：此处直接用函数声明名引用，而非 window[name] 动态取，
//   以保证改名/漏加载时能被 linter 与人工审阅立刻发现，而不是静默变成 undefined。

window.EuriskoEngine = {
    // 税法常量版本，便于排查「前端常量与政策不一致」类问题
    version: (typeof window.EuriskoTaxConstants !== 'undefined')
        ? window.EuriskoTaxConstants.version
        : undefined,

    // 扣除项：纯函数 + DOM 适配器
    computeDeductions: computeDeductions,
    collectDeductionInput: collectDeductionInput,
    calculateComprehensiveDeductions: calculateComprehensiveDeductions,

    // 综合所得主链路
    collectTaxInputData: collectTaxInputData,
    performTaxCalculation: performTaxCalculation,
    calculateOtherIncome: calculateOtherIncome,
    calculateTotalIncome: calculateTotalIncome,
    calculateIncomeTax: calculateIncomeTax,
    calculateCumulativePrepaidTax: calculateCumulativePrepaidTax,
    calculateBonusTax: calculateBonusTax,
    calculatePreTaxIncome: calculatePreTaxIncome,
    determinePrepaidTax: determinePrepaidTax,
    checkTaxBracketThreshold: checkTaxBracketThreshold,

    // 年终奖最优拆分
    calculateOptimalBonusAllocation: calculateOptimalBonusAllocation,

    // 反向测算
    calculateReverseDeductions: calculateReverseDeductions,

    // 分类所得
    calculateSingleClassificationTax: calculateSingleClassificationTax,
    calculateClassificationTaxTotal: calculateClassificationTaxTotal,

    // 通用工具（utils.js）
    getTaxRate: getTaxRate,
    calculateRegularIncome: calculateRegularIncome,
    generateOptimizationTips: generateOptimizationTips
};
