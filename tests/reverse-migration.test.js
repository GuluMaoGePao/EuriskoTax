/**
 * 反向倒算迁移（阶段17 17B-2）对拍测试
 *
 * 这个文件回答的是「迁移到底迁干净了没」——页面还在的时候最容易出的是**半个迁移**：
 * spec 版能出数、看起来也对，但少读了一个总开关、或者把三种口径的先后搞反了，
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
    // 17B-4（v1.50.0）：helper-functions.js 随分类所得页面删除（它是最后一个页面式 deep）。
    loadSource('src/js/calculation/utils.js');   // buildReverseFormulaSteps：推导链的唯一实现
    loadSource('src/js/calculation/tax-registry.js');
    loadSource('src/js/data/tool-registry.js');
    loadSource('src/js/ui/toolbox-ui.js');
    loadSource('src/js/ui/deep-wizard-ui.js');
});

const R = () => window.EuriskoToolRegistry;
const W = () => window.EuriskoDeepWizard;

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

    // 必须拿 **balanced**（解方程得到的那个值）来比：conservative 取的是「所在档位的下限」，
    // 它不是解、会跳档，扣得多反而可能落到一个下限更高的档位上去。
    // 另外到手目标要**高于扣除合计**：否则解被夹在下界（详见下面那条「目标低于扣除合计」）。
    test('专项附加扣除的总开关不勾时，下面的月标准一律不计', () => {
        const base = { reverseType: 'monthly', monthlyNet: 20000, calcMode: 'balanced' };
        const on = compute(Object.assign({}, base, {
            specialAdditionalDeductionCheckbox: true, childrenInfantDeduction: 2000, elderlyDeduction: 3000
        }));
        const off = compute(Object.assign({}, base, {
            specialAdditionalDeductionCheckbox: false, childrenInfantDeduction: 2000, elderlyDeduction: 3000
        }));
        expect(on.primary.value).toBeLessThan(off.primary.value);
    });

    // 这个边界是 diagnose 时才看见的：默认的那一整套扣除（社保 + 房租）合计可能超过用户填的到手目标，
    // 此时方程在下边界上就已经满足 —— 内核夹住它，给出「0 税、所需税前＝扣除合计」。
    // 这不是错误，但它意味着「所需税前收入」有个**下界**，写在这儿是提醒后来人别把夹界当 bug 改。
    test('到手目标低于扣除合计时，回落到「0 税」下界（所需税前＝扣除合计）', () => {
        const out = compute({
            reverseType: 'monthly', monthlyNet: 12000, calcMode: 'balanced',
            childrenInfantDeduction: 2000, elderlyDeduction: 3000
        });
        const dedTotal = out.rows.find((r) => r.label === '全年扣除合计').value;
        expect(dedTotal).toBeGreaterThan(12000 * 12);
        // 二分求解器留了小数尾巴（约 0.005 元），别写 toBe(0) —— 那是把精度要求说成了业务要求
        expect(out.rows.find((r) => r.label === '年应纳税所得额').value).toBeLessThan(1);
        expect(out.rows.find((r) => r.label === '全年个人所得税').value).toBeLessThan(1);
        expect(Math.abs(out.primary.value - dedTotal)).toBeLessThan(1);
    });
});

// 旧页面删掉以后（17B-2 v1.48.0），tests/ui-result-compliance.test.js 的 RESULT_PAGES 少了一个条目：
// 反向倒算的免责声明不再位于静态 HTML 里 —— 那一处缺口由下面这两条**端到端**用例接住。
// 免责声明的性质决定了它必须有人盯着：可带走的导出报告与分享图都有，看得最久的那一屏没有，
// 就是 www.example.com 型合规预防针。
describe('反向倒算走向导：reverse 由 spec 驱动', () => {
    beforeEach(() => {
        localStorage.clear();
        document.body.innerHTML = '<div id="deep-wizard-page" class="page hidden"></div>';
    });

    test('reverse 被通用向导接管（不再是页面式）', () => {
        expect(W().has(R().get('reverse'))).toBe(true);
        const steps = W().stepsOf(R().get('reverse'));
        expect(steps.length).toBeGreaterThan(1);
        expect(steps[steps.length - 1].result).toBe(true);
        expect(steps[0].title).toBe('倒算目标');
    });

    test('走完向导出结果：主结果、推导链、免责声明都在', () => {
        W().open('reverse', { fresh: true });
        // 走到最后一步：翻到最后一步之前一直点下一步
        for (let i = 0; i < 10; i++) {
            document.getElementById('dw-next').click();
            if (document.getElementById('dw-result-card')) break;
        }
        expect(document.getElementById('dw-formula-panel')).toBeTruthy();     // 推导链
        expect(document.querySelector('.result-disclaimer').textContent).toContain('不构成税务建议');
        // 结果卡带 data-tool-id：留资归因 / 分享图 / 埋点都靠它认人（向导是通用渲染器，
        // 不认人的话 reverse 的结果会算到别的工具头上）
        expect(document.getElementById('dw-result-card').getAttribute('data-tool-id')).toBe('reverse');
    });
});
