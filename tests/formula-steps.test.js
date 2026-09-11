// 阶段12 A2：公式透明化 一致性测试
//
// 核心目标（对应方案文档的验收门禁）：
//   计算过程面板中每一步的数值，必须与结果区数值逐位一致，
//   防止未来计算逻辑调整后「面板说明」与「结果」互相漂移。

const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/tax-calculator.js');
    loadSource('src/js/calculation/utils.js');
});

function buildForm(overrides = {}) {
    const values = Object.assign({
        'work-months': '12',
        'salary-income': '30000',
        'labor-income': '20000',
        'author-income': '10000',
        'royalty-income': '5000',
        'bonus-income': '60000',
        'bonus-include': false,
        'prepaid-tax': '',
        'basic-deduction': '5000',
        'pension-insurance': '2400',
        'medical-insurance': '600',
        'unemployment-insurance': '150',
        'housing-fund': '3000',
        'elderly-deduction': '3000',
        'children-infant-deduction': '2000',
        'housing-type': 'rent',
        'rent-deduction': '1500',
        'education-deduction': '4800',
        'education-professional-checkbox': false,
        'medical-deduction': '30000',
        'pension-deduction': '1000',
        'enterprise-annuity': '500',
        'insurance-other-deduction': '200',
        'tax-deferred-pension': '1000',
        'charitable-donation': '5000'
    }, overrides);

    const fields = Object.keys(values).map((id) => {
        const v = values[id];
        if (typeof v === 'boolean') {
            return `<input type="checkbox" id="${id}" ${v ? 'checked' : ''}>`;
        }
        return `<input id="${id}" value="${v}">`;
    }).join('');

    document.body.innerHTML = `<form>${fields}</form>`;
}

function calculateFromForm() {
    const input = collectTaxInputData();
    const deductions = computeDeductions(collectDeductionInput(), input.workMonths);
    return performTaxCalculation(Object.assign({}, input, { deductions: deductions }));
}

function mountPanel() {
    document.body.innerHTML = `
        <details id="formula-steps-panel" class="hidden">
            <div id="formula-steps-body"></div>
        </details>
    `;
}

describe('buildFormulaSteps 为纯函数', () => {
    test('不依赖 DOM：清空 document 后仍可构建步骤', () => {
        buildForm();
        const results = calculateFromForm();
        document.body.innerHTML = '';

        const steps = buildFormulaSteps(results);
        expect(Array.isArray(steps)).toBe(true);
        expect(steps.length).toBeGreaterThan(0);
        steps.forEach((step, idx) => {
            expect({ idx, hasTitle: typeof step.title === 'string' && step.title.length > 0 })
                .toEqual({ idx, hasTitle: true });
            expect(Array.isArray(step.rows)).toBe(true);
            expect(typeof step.totalValue).toBe('number');
        });
    });
});

describe('计算过程数值与结果区逐位一致', () => {
    test('各步骤合计分别对上收入额 / 扣除额 / 应纳税所得额 / 应纳税额 / 汇算 / 税后收入', () => {
        buildForm();
        const results = calculateFromForm();
        document.body.innerHTML = '';

        const steps = buildFormulaSteps(results);
        const byTitle = (kw) => steps.find((s) => s.title.indexOf(kw) !== -1);

        expect(byTitle('综合所得收入额').totalValue).toBe(results.incomeDetails.total);
        expect(byTitle('年度扣除额').totalValue).toBe(results.deductionDetails.total);
        expect(byTitle('应纳税所得额').totalValue).toBe(results.taxDetails.taxableIncome);
        expect(byTitle('适用税率').totalValue).toBe(results.taxDetails.totalTax);
        expect(byTitle('预缴税额').totalValue).toBe(Math.abs(results.taxDetails.refundTax));
        expect(byTitle('税后年收入').totalValue).toBe(results.taxDetails.netIncome);
    });

    test('第四步脚注复述的算式结果与实际税额一致', () => {
        buildForm();
        const results = calculateFromForm();
        document.body.innerHTML = '';

        const steps = buildFormulaSteps(results);
        const step = steps.find((s) => s.title.indexOf('适用税率') !== -1);
        const rate = steps.find((s) => s.title.indexOf('适用税率') !== -1)
            .rows.find((r) => r.label === '适用税率');
        const quickDeduction = step.rows.find((r) => r.label === '速算扣除数').value;

        // 应纳税额 = 应纳税所得额 × 税率 − 速算扣除数
        expect(rate.value * results.taxDetails.taxableIncome - quickDeduction)
            .toBeCloseTo(results.taxDetails.totalTax, 6);
        // 脚注中出现的算式字符串应与上述口径一致
        expect(step.footnote).toContain(results.taxDetails.totalTax.toFixed(2));
    });

    test('末步「税后年收入」可由税前收入依次扣减税额得到', () => {
        buildForm();
        const results = calculateFromForm();
        document.body.innerHTML = '';

        const steps = buildFormulaSteps(results);
        const last = steps[steps.length - 1];
        const preTax = last.rows.find((r) => r.label === '税前年收入').value;
        const totalTax = last.rows.find((r) => r.label === '减：综合所得应纳税额').value;
        const bonusTaxRow = last.rows.find((r) => r.label === '减：年终奖应纳税额');
        const bonusTax = bonusTaxRow ? bonusTaxRow.value : 0;

        expect(preTax - totalTax - bonusTax).toBeCloseTo(last.totalValue, 6);
        expect(preTax).toBe(results.incomeDetails.preTaxTotal);
    });
});

describe('年终奖展示口径', () => {
    test('单独计税时出现「附：年终奖单独计税」步骤，且税额对上', () => {
        buildForm({ 'bonus-income': '60000', 'bonus-include': false });
        const results = calculateFromForm();
        document.body.innerHTML = '';

        const steps = buildFormulaSteps(results);
        const bonusStep = steps.find((s) => s.title.indexOf('年终奖单独计税') !== -1);

        expect(bonusStep).toBeDefined();
        expect(bonusStep.totalValue).toBe(results.incomeDetails.bonusTax);
        // 折算月均 = 年终奖 / 12
        expect(bonusStep.rows.find((r) => r.label === '折算月均金额').value).toBe(60000 / 12);
        // 单独计税时不计入综合所得收入额，但应在脚注中说明
        const incomeStep = steps.find((s) => s.title.indexOf('综合所得收入额') !== -1);
        expect(incomeStep.footnote).toContain('单独计税');
    });

    test('并入综合所得时无单独计税步骤，且收入额包含年终奖', () => {
        buildForm({ 'bonus-income': '60000', 'bonus-include': true });
        const results = calculateFromForm();
        document.body.innerHTML = '';

        const steps = buildFormulaSteps(results);
        expect(steps.find((s) => s.title.indexOf('年终奖单独计税') !== -1)).toBeUndefined();

        const incomeStep = steps.find((s) => s.title.indexOf('综合所得收入额') !== -1);
        expect(incomeStep.rows.find((r) => r.label === '年终奖（并入综合所得）').value).toBe(60000);
    });
});

describe('面板渲染', () => {
    test('渲染后解除隐藏并展示与结果区一致的金额文案', () => {
        buildForm();
        const results = calculateFromForm();
        mountPanel();

        updateFormulaSteps(results);

        const panel = document.getElementById('formula-steps-panel');
        expect(panel.classList.contains('hidden')).toBe(false);

        const text = document.getElementById('formula-steps-body').textContent;
        expect(text).toContain('¥' + results.taxDetails.totalTax.toFixed(2));
        expect(text).toContain('¥' + results.taxDetails.taxableIncome.toFixed(2));
        expect(text).toContain('¥' + results.taxDetails.netIncome.toFixed(2));
        expect(text).toContain('第一步：计算综合所得收入额');
    });

    test('面板缺失时安全返回（不抛错）', () => {
        buildForm();
        const results = calculateFromForm();
        document.body.innerHTML = '';

        expect(() => updateFormulaSteps(results)).not.toThrow();
    });

    test('税率以百分比格式渲染，金额以两位小数渲染', () => {
        buildForm({ 'bonus-income': '0' });
        const results = calculateFromForm();
        mountPanel();

        updateFormulaSteps(results);

        const text = document.getElementById('formula-steps-body').textContent;
        const expectedRate = (results.taxDetails.applicableRate * 100).toFixed(0) + '%';
        expect(text).toContain(expectedRate);
        expect(formatFormulaValue(0.1, 'percent')).toBe('10%');
        expect(formatFormulaValue(1234.5)).toBe('¥1234.50');
        expect(formatFormulaValue(undefined)).toBe('¥0.00');
    });
});
