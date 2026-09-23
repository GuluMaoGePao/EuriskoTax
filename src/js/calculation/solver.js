// 通用单调求解器（Phase 2.5 ① —— 提炼通用求解器，纯重构、零功能变化）
//
// 为什么要有这个文件：反向倒算（已知目标值 → 反推收入 / 工资）此前被手写了 8 份，
//   分散在 tax-calculator.js（6 处：月度税后 / 目标税额 / 到手金额，综合所得与经营所得各一套）
//   与 net-salary-quick.js、employer-cost-quick.js（各 1 处）。
//   它们的结构一字不差地同构 —— 差别只有中间那句「够不够」的判据。
//   复制的代价从来不是行数，而是口径漂移：某处的收敛方向要修时，另外 7 处不会跟着改；
//   而且它们连「在什么区间上二分」都不一致，出问题时没法一眼看清对不对。
//
// 本文件不含任何税法口径，只提供算法骨架：
//   单调性、比较方向、边界处理全部由调用方的回调表达。
//   好处是它能独立于税率表被测试；代价是下面两条约定必须由调用方守住。
//
// 约定 1（最重要）：increase(x) 的语义必须是「x 还不够大，要往大了找」，
//   即目标函数单调不减、且 increase(x) 等价于 f(x) < target。
//   求解器不会检查单调性 —— 判据写反不会报错，只会静默收敛到另一侧。
// 约定 2：返回的 value 是「刚好够」的近似值，但它是浮点数。
//   谈薪报价宁高勿低要向上取整、用工预算不能超要向下取整 —— 那是各页自己的业务口径，留在外面决定。
//
// 加载顺序：必须先于 tax-calculator.js 与两个 quick 模块（见 index.html）。
//
// 作用域：与 tax-calculator.js / utils.js 一样走全局函数声明，而不是 IIFE ——
//   因为 engine.js 的聚合表约定就是「直接用函数声明名引用，漏加载或改名立刻报错」。
//   包成 IIFE 会让聚合表拿不到标识符，等于把这里的可靠性校验悄悄换成了静默失败。

// 到分为止：税法金额的最小展示单位就是分，再往下逼近是在制造假精确
var SOLVER_PRECISION = 0.01;

// 在 [lo, hi] 上二分，找最小的 x 使 increase(x) 为假（等价于 f(x) >= target）
//
// 返回值给的是「区间 + 中点」而不是单个数字：
//   value —— 历史代码用收敛后的中点 (lo + hi) / 2，保留它以保证重构逐位等价
//   lo / hi —— 给需要端点语义的调用方（如「预算剩余」必须取下侧才能保证不超支）
//   iterations / converged —— 供测试与排障，业务上不依赖
function solveMonotone(options) {
    options = options || {};
    var precision = options.precision > 0 ? options.precision : SOLVER_PRECISION;
    var maxIterations = options.maxIterations;
    var increase = options.increase;
    var lo = Number(options.lo) || 0;
    var hi = Number(options.hi) || 0;
    var iterations = 0;

    if (typeof increase !== 'function') {
        return { value: lo, lo: lo, hi: hi, iterations: 0, converged: false };
    }

    while (hi - lo > precision) {
        if (typeof maxIterations === 'number' && iterations >= maxIterations) break;
        var mid = (lo + hi) / 2;
        if (increase(mid, iterations)) {
            lo = mid;
        } else {
            hi = mid;
        }
        iterations += 1;
    }

    return {
        value: (lo + hi) / 2,
        lo: lo,
        hi: hi,
        iterations: iterations,
        converged: hi - lo <= precision
    };
}

// 二分需要一个「上界确实已经超过目标」的 hi。
// 理论上界（如「用工成本必然 ≥ 税前工资」）在极端自定义费率下会失效，所以惯例是先翻倍兜顶，再二分。
function expandUpperBound(options) {
    options = options || {};
    var start = Number(options.start) || 0;
    var target = Number(options.target) || 0;
    var factor = options.factor > 1 ? options.factor : 2;
    var maxExpansions = typeof options.maxExpansions === 'number' ? options.maxExpansions : 60;
    var at = options.at;
    var hi = start;
    var iterations = 0;

    if (typeof at !== 'function') {
        return { hi: hi, iterations: 0, reached: false };
    }

    while (at(hi) < target && iterations < maxExpansions) {
        hi *= factor;
        iterations += 1;
    }

    return { hi: hi, iterations: iterations, reached: !(at(hi) < target) };
}

window.EuriskoSolver = {
    precision: SOLVER_PRECISION,
    solveMonotone: solveMonotone,
    expandUpperBound: expandUpperBound
};
