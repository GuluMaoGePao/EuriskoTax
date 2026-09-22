/**
 * v1.99.0 · 省钱卡接进完整测算（21 个 deep）结果步
 *
 * 背景：速算器那份省钱卡（阶段19-6a）只在速算器结果页挂着，21 个完整测算的结果步
 * 算完就到免责声明 —— 而真正会漏填专项附加扣除的恰恰是这些按年填全的测算。
 *
 * 这个文件钉的是「接进去」这件事的三条边界：
 *   ① **判定按字段表，不按工具名单** —— 「这次测算吃不吃专项附加扣除」由 spec 自己的
 *      fields 说了算（有「专项附加扣除」字段才算），不是由 id / group 白名单说了算。
 *      顺带钉住修正：bonus-tax（速算器）原先因为 group === 'salary' 会被误报
 *      「档案里有扣除这次没算进去」，可年终奖单独计税**根本不吃**专项附加扣除。
 *   ② **不编金额** —— 只说档案里勾了哪几项，不说能省多少（几个子女、怎么分摊都不知道）。
 *   ③ **出口真能用** —— 分步向导里是「回到那一步补上」；那一步此刻找不到
 *      （简明视图把 advanced 步合并了）就退回「核定能扣多少」，绝不摆一颗点了不跳的按钮。
 *
 * 不做的事也钉在这里（免得后人按 plan 字面 repeater）：
 *   年终奖择优**不在 deep 侧重复提示** —— bonus-tax-deep 本身就是在做择优，
 *   再告一遍「已为你选优」是噪音，且它算的是含最优拆分的口径，与速算器那份差额不是一回事。
 *
 * @jest-environment jsdom
 */
const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/tax-calculator.js');
    loadSource('src/js/calculation/utils.js');
    loadSource('src/js/calculation/tax-registry.js');
    loadSource('src/js/calculation/salary-tax-quick.js');
    loadSource('src/js/calculation/bonus-tax-quick.js');
    // compute 转调这些 quick 模块（没加载则结果步根本渲染不出来，宿主位也就不存在）
    loadSource('src/js/calculation/special-deduction-quick.js');
    loadSource('src/js/calculation/annual-settlement-quick.js');
    loadSource('src/js/data/tax-profile.js');            // 省钱卡的「档案里真有」来源
    loadSource('src/js/data/tool-registry.js');
    loadSource('src/js/ui/toolbox-ui.js');
    loadSource('src/js/ui/deep-wizard-ui.js');
});

const W = () => window.EuriskoDeepWizard;
const R = () => window.EuriskoToolRegistry;
const TB = () => window.EuriskoToolbox;

function box() { return document.getElementById('dw-saving-nudge'); }

// 档案里勾了扣除项：直接写存储（tax-profile.js 的 read 会读它）
function seedProfile(deductions) {
    localStorage.setItem('taxProfile', JSON.stringify({ deductions: deductions }));
}

function openAtResult(id, values) {
    W().open(id, { values: values || {} });
}

beforeEach(() => {
    localStorage.clear();
    window.showPage = jest.fn();
    document.body.innerHTML = '<div id="deep-wizard-page" class="page hidden"></div>';
});

afterEach(() => {
    window.EuriskoTaxProfile.reset();
    localStorage.removeItem('taxProfile');
});

// ====== ① 完整测算结果步也出卡 ======
describe('完整测算结果步：出卡', () => {
    test('档案勾了扣除、这次没带上 → 结果步出现省钱卡', () => {
        seedProfile(['rent', 'elderly']);
        openAtResult('forward', {
            specialAdditionalDeductionCheckbox: false      // 明确没享受
        });
        expect(box()).toBeTruthy();
        expect(box().classList.contains('hidden')).toBe(false);
        expect(box().textContent).toContain('档案里有扣除');
        expect(box().textContent).toContain('住房租金');
        expect(box().textContent).toContain('赡养老人');
    });

    test('不编金额：卡里一个 ¥ 都没有（几个子女、怎么分摊都不知道）', () => {
        seedProfile(['children', 'rent']);
        openAtResult('forward', { specialAdditionalDeductionCheckbox: false });
        expect(box().textContent).not.toContain('¥');
        expect(box().querySelector('.saving-nudge-amount')).toBeNull();
    });

    test('这次带上了就不出卡（默认就带：开关默认开、租金默认 1500）', () => {
        seedProfile(['rent']);
        openAtResult('forward', {});
        expect(box().classList.contains('hidden')).toBe(true);
        expect(box().innerHTML).toBe('');
    });

    test('档案没勾过扣除 → 不出卡（没填过 ≠ 忘了填）', () => {
        openAtResult('forward', { specialAdditionalDeductionCheckbox: false });
        expect(box().classList.contains('hidden')).toBe(true);
    });
});

// ====== ② 适用范围由字段表说了算 ======
describe('适用范围：按字段表，不按工具名单', () => {
    test('年终奖择优不重复提示（它本身就在做择优，且单独计税不吃专项附加扣除）', () => {
        seedProfile(['rent', 'children']);
        openAtResult('bonus-tax-deep', { otherTaxable: 0 });
        expect(box().classList.contains('hidden')).toBe(true);
    });

    test('核定额度那个自己不提醒（它的字段是逐项，没有「专项附加扣除」这一项）', () => {
        seedProfile(['rent']);
        openAtResult('special-deduction-deep', {});
        expect(box().classList.contains('hidden')).toBe(true);
    });

    test('速算器年终奖不再被误报「档案里有扣除」（原先按 group 判会误报）', () => {
        seedProfile(['rent', 'elderly']);
        // 它该出的是「还差一个数才能比并入」那条（focus 到那个输入框），不是档案那条
        const tip = TB().savingTipOf(R().get('bonus-tax'), { bonus: 36000, annualTaxable: 0 });
        expect(tip).toBeTruthy();
        expect(tip.focus).toBe('qf-annualTaxable');
        expect(tip.title).not.toContain('档案里有扣除');
    });

    test('吃专项附加扣除的速算器照旧出卡（判定放宽没有把老场景弄丢）', () => {
        seedProfile(['children']);
        expect(TB().savingTipOf(R().get('salary-tax'), {})).toBeTruthy();
        expect(TB().savingTipOf(R().get('annual-settlement'), {})).toBeTruthy();
    });
});

// ====== ③ 出口真能用 ======
describe('出口', () => {
    test('分步向导里是「回去补上」：点了真的回到扣除那一步', () => {
        seedProfile(['rent']);
        openAtResult('forward', { specialAdditionalDeductionCheckbox: false });
        const cta = box().querySelector('.saving-nudge-cta');
        expect(cta).toBeTruthy();
        expect(cta.getAttribute('data-kind')).toBe('step');
        expect(cta.textContent).toContain('回去补上');

        cta.click();
        // 回到的是输入步（能改那个开关），不是结果步
        expect(document.getElementById('dw-result-card')).toBeNull();
        expect(document.getElementById('qf-specialAdditionalDeductionCheckbox')).toBeTruthy();
    });

    test('那一步此刻找不到 → 退回「核定能扣多少」，不摆点了不跳的按钮', () => {
        seedProfile(['rent']);
        const host = document.createElement('div');
        host.id = 'x-saving';
        document.body.appendChild(host);
        const onStep = jest.fn();
        TB().mountSavingNudge('x-saving', R().get('forward'),
            { specialAdditionalDeductionCheckbox: false },
            { stepIndexOf: () => -1, onStep: onStep });
        const cta = host.querySelector('.saving-nudge-cta');
        expect(cta.getAttribute('data-kind')).toBe('tool');
        expect(cta.getAttribute('data-id')).toBe('special-deduction');
        expect(cta.textContent).toContain('核定能扣多少');
        expect(onStep).not.toHaveBeenCalled();
    });

    test('没有 opts 时走速算器那条老路（聚焦输入框 / 打开工具），不因为改了渲染就失灵', () => {
        seedProfile(['rent']);
        const host = document.createElement('div');
        host.id = 'q-saving';
        document.body.appendChild(host);
        TB().mountSavingNudge('q-saving', R().get('salary-tax'), {});
        const cta = host.querySelector('.saving-nudge-cta');
        expect(cta.getAttribute('data-kind')).toBe('tool');
        expect(cta.getAttribute('data-id')).toBe('special-deduction');
    });
});
