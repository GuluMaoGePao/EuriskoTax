// Phase 2：结果页叙述（结论 / 一句话理由 / 注意点）测试
const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/tax-calculator.js');
    loadSource('src/js/calculation/utils.js');
});

function nested(obj, key, patch) {
    const copy = JSON.parse(JSON.stringify(obj));
    Object.keys(patch).forEach(function (k) { copy[key][k] = patch[k]; });
    return copy;
}

const BASE = {
    incomeDetails: { preTaxTotal: 420000, bonus: 0, bonusInclude: false },
    deductionDetails: { total: 60000 },
    taxDetails: { totalTax: 43080, prepaidTax: 38080, refundTax: 5000, taxableIncome: 300000 }
};

test('应补：refundTax > 0 → owe', function () {
    expect(buildResultNarrative(BASE).direction).toBe('owe');
});

test('应退：refundTax < 0 → refund', function () {
    const r = nested(BASE, 'taxDetails', { refundTax: -3200 });
    expect(buildResultNarrative(r).direction).toBe('refund');
});

test('不退不补：0.004 元尾差与显示口径一致判为 even', function () {
    const r = nested(BASE, 'taxDetails', { refundTax: 0.004 });
    expect(buildResultNarrative(r).direction).toBe('even');
});

test('三种结论都必须给出「下一步动作」，不能只有金额', function () {
    ['owe', 'refund', 'even'].forEach(function (d) {
        const map = { owe: 5000, refund: -5000, even: 0 };
        const r = nested(BASE, 'taxDetails', { refundTax: map[d] });
        expect(buildResultNarrative(r).action).toBeTruthy();
    });
});

test('一句话理由包含税额与税负率，且与结果区同值', function () {
    const reason = buildResultNarrative(BASE).reason;
    expect(reason).toContain('¥43080.00');
    expect(reason).toContain('10.3%');
});

test('注意点：只有补税才提醒滞纳金', function () {
    expect(buildResultNarrative(BASE).pitfalls.join('')).toContain('滞纳金');
    const refund = nested(BASE, 'taxDetails', { refundTax: -3200 });
    expect(buildResultNarrative(refund).pitfalls.join('')).not.toContain('滞纳金');
});

test('注意点：只有存在年终奖才提示计税方式', function () {
    const withBonus = nested(BASE, 'incomeDetails', { bonus: 60000, bonusInclude: false });
    expect(buildResultNarrative(withBonus).pitfalls.join('')).toContain('单独计税');
    expect(buildResultNarrative(BASE).pitfalls.join('')).not.toContain('单独计税');
});
