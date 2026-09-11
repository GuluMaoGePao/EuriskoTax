// 阶段12 A1：计算核心纯函数化 验证测试
//
// 目标：
//   1. 锁定 window.EuriskoEngine 的对外契约（聚合了哪些纯函数）
//   2. 证明扣除项计算可脱离 DOM 运行（computeDeductions 为纯函数）
//   3. 证明 performTaxCalculation 的「注入扣除项」路径与「读表单」路径结果完全等价
//      —— 这是本次重构零回归的核心证据，也是未来 A4 方案对比 / D1 B 端 API 的基础

const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/tax-calculator.js');
    loadSource('src/js/calculation/utils.js');
    loadSource('src/js/calculation/engine.js');
});

// 构造一份完整的综合所得表单，覆盖所有条件分支：
// 住房走「租金」分支、学历教育勾选在职（+3600）、有大病医疗（触发 15000/80000 规则）
function buildForm(overrides = {}) {
    const values = Object.assign({
        'work-months': '12',
        'salary-income': '30000',
        'labor-income': '20000',
        'author-income': '10000',
        'royalty-income': '5000',
        'bonus-income': '60000',
        'bonus-include': false,
        'prepaid-tax': '',          // 留空 → 走自动推演
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

describe('window.EuriskoEngine 对外契约', () => {
    test('挂载了计算层纯函数集合，且携带常量版本', () => {
        expect(window.EuriskoEngine).toBeDefined();
        expect(window.EuriskoEngine.version).toBe(window.EuriskoTaxConstants.version);

        [
            'computeDeductions', 'collectDeductionInput', 'calculateComprehensiveDeductions',
            'collectTaxInputData', 'performTaxCalculation',
            'calculateOtherIncome', 'calculateTotalIncome', 'calculateIncomeTax',
            'calculateCumulativePrepaidTax', 'calculateBonusTax', 'calculatePreTaxIncome',
            'determinePrepaidTax', 'checkTaxBracketThreshold',
            'calculateOptimalBonusAllocation', 'calculateReverseDeductions',
            'calculateSingleClassificationTax', 'calculateClassificationTaxTotal',
            'getTaxRate', 'calculateRegularIncome', 'generateOptimizationTips'
        ].forEach((name) => {
            expect({ name, type: typeof window.EuriskoEngine[name] })
                .toEqual({ name, type: 'function' });
        });
    });
});

describe('computeDeductions 纯函数特性', () => {
    const pureInput = {
        monthlyBasicDeduction: 5000,
        monthlyPensionInsurance: 2400,
        monthlyMedicalInsurance: 600,
        monthlyUnemploymentInsurance: 150,
        monthlyHousingFund: 3000,
        monthlyElderlyDeduction: 3000,
        monthlyChildrenInfantDeduction: 2000,
        monthlyHousingDeduction: 1500,
        annualEducationDeduction: 4800,
        annualMedicalDeduction: 30000,
        annualProfessionalDeduction: 0,
        monthlyPensionDeduction: 1000,
        monthlyEnterpriseAnnuity: 500,
        monthlyInsuranceOtherDeduction: 200,
        monthlyTaxDeferredPension: 1000,
        annualCharitableDonation: 5000
    };

    test('不依赖 DOM 即可完成计算（清空 document 后仍可运行）', () => {
        document.body.innerHTML = '';

        const d = computeDeductions(pureInput, 12);

        // 大病医疗：30000 > 15000 → min(30000 - 15000, 80000) = 15000
        expect(d.actualMedicalDeduction).toBe(15000);
        // 专项扣除（三险一金）：(2400 + 600 + 150 + 3000) * 12 = 73800
        expect(d.monthlyInsuranceDeduction).toBe(6150);
        expect(d.annualSpecialDeductionTotal).toBe(73800);
        // 月度专项附加扣除：3000 + 2000 + 1500 + (4800 - 0)/12 = 6900
        expect(d.monthlySpecialAdditionalTotal).toBe(6900);
        // 年度专项附加扣除：6900 * 12 + 0 + 15000 = 97800
        expect(d.annualSpecialAdditionalTotal).toBe(97800);
        // 年度其他扣除：(1000 + 500 + 200 + 1000) * 12 + 5000 = 37400
        expect(d.annualOtherDeductionTotal).toBe(37400);
        // 年度总扣除：5000 * 12 + 73800 + 97800 + 37400 = 269000
        expect(d.totalDeduction).toBe(269000);
    });

    test('学历教育在职勾选通过 annualProfessionalDeduction 影响学历教育扣除', () => {
        const withProfessional = Object.assign({}, pureInput, {
            annualProfessionalDeduction: 3600
        });
        const a = computeDeductions(pureInput, 12);
        const b = computeDeductions(withProfessional, 12);

        // 学历教育扣除 = (4800 - 3600) / 12 = 100（原为 4800 / 12 = 400），故月度专项附加少 300/月
        expect(b.educationDegreeAmount).toBe(1200);
        expect(b.monthlySpecialAdditionalTotal).toBe(a.monthlySpecialAdditionalTotal - 300);
    });

    test('大病医疗未超过 15000 起付线时不可扣除', () => {
        const d = computeDeductions(Object.assign({}, pureInput, { annualMedicalDeduction: 12000 }), 12);
        expect(d.actualMedicalDeduction).toBe(0);
    });

    test('大病医疗超过 80000 上限时按上限扣除', () => {
        const d = computeDeductions(Object.assign({}, pureInput, { annualMedicalDeduction: 200000 }), 12);
        expect(d.actualMedicalDeduction).toBe(80000);
    });
});

describe('performTaxCalculation 注入路径与表单路径等价（零回归核心证据）', () => {
    test('注入 deductions 的结果与读取表单的结果完全一致', () => {
        buildForm();

        // 路径 A：原表单主链路（内部回退读取 DOM）
        const formInput = collectTaxInputData();
        const resultFromForm = performTaxCalculation(formInput);

        // 路径 B：显式注入纯计算的扣除项，全程不读 DOM
        const workMonths = formInput.workMonths;
        const deductionInput = collectDeductionInput();
        const injectedInput = Object.assign({}, formInput, {
            deductions: computeDeductions(deductionInput, workMonths)
        });
        // 清空 DOM，确保路径 B 不可能偷偷读表单
        document.body.innerHTML = '';
        const resultInjected = performTaxCalculation(injectedInput);

        // calculationDate 由每次调用各自 new Date() 生成，两次调用相差 1ms 就会让 toEqual 失败
        // （与本用例要证明的「两条路径等价」无关）。剔除后再逐字段比较，时间戳单独断言。
        const stripCalculationDate = (r) => {
            const copy = Object.assign({}, r);
            delete copy.calculationDate;
            return copy;
        };
        expect(stripCalculationDate(resultInjected)).toEqual(stripCalculationDate(resultFromForm));

        const tInjected = Date.parse(resultInjected.calculationDate);
        const tForm = Date.parse(resultFromForm.calculationDate);
        expect(Number.isNaN(tInjected)).toBe(false);
        expect(Number.isNaN(tForm)).toBe(false);
        expect(Math.abs(tInjected - tForm)).toBeLessThan(1000);
    });

    test('注入路径产出的关键指标符合手算口径', () => {
        buildForm();
        const formInput = collectTaxInputData();
        const deductions = computeDeductions(collectDeductionInput(), formInput.workMonths);
        document.body.innerHTML = '';

        const r = performTaxCalculation(Object.assign({}, formInput, { deductions: deductions }));

        // 综合所得收入额 = 30000*12 + 劳务 20000*0.8 + 稿酬 10000*0.8*0.7 + 特许权 5000*0.8
        //   = 360000 + 16000 + 5600 + 4000 = 385600
        expect(r.incomeDetails.total).toBe(385600);
        // 应纳税所得额 = 385600 - 269000 = 116600（年终奖单独计税，不并入）
        expect(r.taxDetails.taxableIncome).toBe(116600);
        // 116600 落在 36000-144000 档 → 10%，速算扣除 2520
        expect(r.taxDetails.applicableRate).toBe(0.10);
        expect(r.taxDetails.totalTax).toBeCloseTo(116600 * 0.10 - 2520, 6);
        // 年终奖 60000 单独计税：60000/12 = 5000 → 10% 档，速算扣除 210
        expect(r.incomeDetails.bonusTax).toBeCloseTo(60000 * 0.10 - 210, 6);
    });

    test('未注入 deductions 时仍按表单取值（向后兼容）', () => {
        buildForm({ 'salary-income': '12000', 'bonus-income': '0', 'labor-income': '0',
                    'author-income': '0', 'royalty-income': '0' });

        const r = performTaxCalculation(collectTaxInputData());

        // 年收入 144000，扣除仍取表单值 269000 → 应纳税所得额归零
        expect(r.taxDetails.taxableIncome).toBe(0);
        expect(r.taxDetails.totalTax).toBe(0);
    });
});
