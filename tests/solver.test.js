// 通用单调求解器测试（Phase 2.5 ①）
//
// 这里的用例全部**不碰税法**：只用 y = k·x 这类单调函数。
// 求解器是与税务口径无关的算法骨架，它的正确性也应该与税务知识无关——
// 一旦某个用例必须搬出税率表才讲得清楚，那说明这处逻辑该留在业务侧。
const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    loadSource('src/js/calculation/solver.js');
});

const S = () => window.EuriskoSolver;

test('默认精度到分', function () {
    expect(S().precision).toBe(0.01);
});

test('线性单调函数上收敛到真正的最小解', function () {
    var r = S().solveMonotone({
        lo: 0,
        hi: 1000,
        increase: function (x) { return 2 * x < 10; }
    });
    expect(r.converged).toBe(true);
    expect(Math.abs(r.value - 5)).toBeLessThanOrEqual(0.01);
});

test('收敛后区间宽度不超过精度，且 value 落在区间内', function () {
    var r = S().solveMonotone({
        lo: 0,
        hi: 1e7,
        increase: function (x) { return x < 123456.78; }
    });
    expect(r.hi - r.lo).toBeLessThanOrEqual(0.01);
    expect(r.value).toBeGreaterThanOrEqual(r.lo);
    expect(r.value).toBeLessThanOrEqual(r.hi);
});

test('increase 恒为真 → 收敛到上界侧（判据写反不会报错，只会收敛到另一端）', function () {
    var r = S().solveMonotone({ lo: 0, hi: 100, increase: function () { return true; } });
    expect(r.lo).toBeGreaterThan(99.98);
    expect(r.hi).toBe(100);
});

test('increase 恒为假 → 收敛到下界侧', function () {
    var r = S().solveMonotone({ lo: 10, hi: 100, increase: function () { return false; } });
    expect(r.lo).toBe(10);
    expect(r.hi).toBeLessThan(10.02);
});

test('iterations 与 increase 被调用次数一致', function () {
    var calls = 0;
    var r = S().solveMonotone({
        lo: 0,
        hi: 100000,
        increase: function (x) { calls += 1; return x < 4321; }
    });
    expect(r.iterations).toBe(calls);
    expect(calls).toBeGreaterThan(0);
});

test('maxIterations 触顶时不假称收敛', function () {
    var calls = 0;
    var r = S().solveMonotone({
        lo: 0,
        hi: 1e7,
        maxIterations: 5,
        increase: function (x) { calls += 1; return x < 5000000; }
    });
    expect(calls).toBe(5);
    expect(r.converged).toBe(false);
});

test('未给 increase（判据漏传）返回不收敛而不是抛错', function () {
    var r = S().solveMonotone({ lo: 0, hi: 100 });
    expect(r.converged).toBe(false);
    expect(r.value).toBe(0);
});

test('precision 可自定义', function () {
    var r = S().solveMonotone({
        lo: 0,
        hi: 1000,
        precision: 0.5,
        increase: function (x) { return x < 500; }
    });
    expect(r.hi - r.lo).toBeLessThanOrEqual(0.5);
});

test('expandUpperBound 翻倍到超过目标为止', function () {
    var r = S().expandUpperBound({ start: 1, target: 100, at: function (x) { return x; } });
    expect(r.hi).toBe(128);
    expect(r.iterations).toBe(7);
    expect(r.reached).toBe(true);
});

test('expandUpperBound 触到扩展上限时如实报告 reached = false', function () {
    var r = S().expandUpperBound({ start: 1, target: 100, maxExpansions: 2, at: function (x) { return x; } });
    expect(r.hi).toBe(4);
    expect(r.iterations).toBe(2);
    expect(r.reached).toBe(false);
});

test('起点已经够用时一次都不扩展', function () {
    var calls = 0;
    var r = S().expandUpperBound({
        start: 100,
        target: 10,
        at: function (x) { calls += 1; return x; }
    });
    expect(r.hi).toBe(100);
    expect(r.iterations).toBe(0);
    expect(r.reached).toBe(true);
    expect(calls).toBeGreaterThan(0);
});
