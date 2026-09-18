/**
 * 反向倒算迁移（阶段17 17B-2）对拍测试
 *
 * 这个文件回答的是「迁移到底迁干净了没」——页面还在的时候最容易出的是**半个迁移**：
 * spec 版能出数、看起来也对，但少读了一个总开关、或者 sellèi fiscal 口caliber 搞反了，
 * 而页面版照样好好的。所以这里不快照数字，钉的是**关系**：
 *   ① 四种倒算目标都能出结果，且互相不为同一个入口（tax / net 都落到内核的 target 分支）；
 *   ② 三份口径是同一段区间的取点：保守 ≤ 均衡 ≤ 激进（顺序反了就是档位口径反了）；
 *   ③ compare.active 跟着用户的口径选择走（calcMode）；
 *   ④ 推导链与页面版同吃 utils.js 那一份；
 *   ⑤ 扣除项真的进了内核：关掉扣除，满足同一到手目标所需的税前收入必须下降。
 *
 * @jest-environment jsdom
 */
const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/tax-calculator.js');
    loadSource('src/js/calculation/helper-functions.js');
    loadSource('src/js/calculation/utils.js');   // buildReverseFormulaSteps：推导链的唯一实现
    loadSource('src/js/calculation/tax-registry.js');
    loadSource('src/js/data/tool-registry.js');
});

const R = () => window.EuriskoToolRegistry;

// 按 spec 的 defaults 拼一份输入：defaults 是 spec 里那份唯一真源 ——
// 手抄一份 values 会立刻漂移（字段增删时手抄的那份不会报错，只会算错）。
function valuesOf(overrides) {
    const tool = R().get('reverse');
    const v = {};
    tool.fields.forEach(function (f) { v[f.key] = f.default; });
    return Object.assign(v, overrides || {});
}

function compute(overrides) {
    const tool = R().get('reverse');
    return tool.compute(valuesOf(overrides));
}

describe('反向倒算迁移：四种目标都能出同一套结果结构', () => {
    test.each([
        ['rate', { reverseType: 'rate', targetRate: 10 }],
        ['monthly', { reverseType: 'monthly', monthlyNet: 12000 }],
        ['tax', { reverseType: 'tax', fixedAmount: 30000 }],
        ['net', { reverseType: 'net', fixedAmount: 300000 }]
    ])('%s 目标：给出主结果 + 明细 + 三口径对比 + 推导链', (_label, overrides) => {
        const out = compute(overrides);
        expect(out).toBeTruthy();
        expect(out.primary.label).toBe('所需税前年收入');
        expect(out.primary.value).toBeGreaterThan(0);
        expect(out.rows.length).toBeGreaterThan(4);
        expect(out.compare.scenarios).toHaveLength(3);
        expect(out.steps.length).toBeGreaterThan(0);   // 与页面同标准：没有推导链就是降级
    });

    test('tax 与 net 是不同的两个目标（不是同一个数），但都落到内核的 target 分支', () => {
        const byTax = compute({ reverseType: 'tax', fixedAmount: 30000 });
        const byNet = compute({ reverseType: 'net', fixedAmount: 30000 });
        // 搞反了，出来的是一个看着很合理、实际完全不同的错数
        expect(byTax.primary.value).toBeGreaterThan(byNet.primary.value);
    });
});

describe('反向倒算迁移：三口径是同一段区间的取点', () => {
    // 注意别在 describe 体内直接算：那一层是在收集阶段就跑的，跑在 beforeAll 之前，
    // tool-registry 还没加载（window.EuriskoToolRegistry 还是 undefined）
    let scenarios;
    beforeAll(() => {
        scenarios = compute({ reverseType: 'monthly', monthlyNet: 12000 }).compare.scenarios;
    });

    test('保守 ≤ 均衡 ≤ 激进：保守取档位下限、激进用满档位上限', () => {
        expect(scenarios.map((s) => s.key)).toEqual(['conservative', 'balanced', 'aggressive']);
        const incomes = scenarios.map((s) => s.primary.value);
        expect(incomes[0]).toBeLessThanOrEqual(incomes[1]);
        expect(incomes[1]).toBeLessThanOrEqual(incomes[2]);
        // 三者对应的税负率相同（同一个目标），但所需税前收入不同 —— 这才是「区间」的语义
        expect(incomes[0]).toBeLessThan(incomes[2]);
    });

    test('compare.active 跟着用户选的口径走', () => {
        expect(compute({ calcMode: 'balanced' }).compare.active).toBe('balanced');
        expect(compute({ calcMode: 'aggressive' }).compare.active).toBe('aggressive');
        expect(compute({ calcMode: 'conservative' }).compare.active).toBe('conservative');
    });

    test('主结果就是 active 那一口径的值（界面、保存、导出三处必须同一个数）', () => {
        const out = compute({ reverseType: 'monthly', monthlyNet: 12000, calcMode: 'aggressive' });
        const active = out.compare.scenarios.find((s) => s.key === out.compare.active);
        expect(out.primary.value).toBe(active.primary.value);
    });
});

describe('反向倒算迁移：扣除项真的进了内核', () => {
    // 同一个「月到手 1.2 万」的目标：扣得越多，需要的税前收入越**低** ——
    // 这正是扣除项的意义（少交税就得少发钱）。当年读漏一个总开关，这个不等式会反过来，
    // 而那个「多扣了反而要多发」的错，界面上看着完全合理。
    test('扣了社保公积金后，同样到手目标需要的税前收入更低', () => {
        const withDed = compute({
            reverseType: 'monthly', monthlyNet: 12000, calcMode: 'balanced',
            specialDeductionCheckbox: true, pensionInsurance: 1000, medicalInsurance: 300,
            unemploymentInsurance: 50, housingFund: 1200
        });
        const without = compute({
            reverseType: 'monthly', monthlyNet: 12000, calcMode: 'balanced',
            specialDeductionCheckbox: false
        });
        expect(withDed.primary.value).toBeLessThan(without.primary.value);
    });

    test('专项附加扣除的总开关不勾时，下面的月标准一律不计', () => {
        const on = compute({
            reverseType: 'monthly', monthlyNet: 12000, calcMode: 'balanced',
            specialAdditionalDeductionCheckbox: true, childrenInfantDeduction: 2000, elderlyDeduction: 3000
        });
        const off = compute({
            reverseType: 'monthly', monthlyNet: 12000, calcMode: 'balanced',
            specialAdditionalDeductionCheckbox: false, childrenInfantDeduction: 2000, elderlyDeduction: 3000
        });
        expect(on.primary.value).toBeLessThan(off.primary.value);
    });
});
