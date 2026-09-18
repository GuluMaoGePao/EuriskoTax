// 台账 C：推导链扩全流程 一致性测试
//
// 核心目标（延续 formula-steps.test.js 的验收门禁）：
//   经营所得 / 分类所得 / 反向倒算 / 月薪个税速算器的推导链，
//   每一步数值必须与计算结果逐位一致 —— 防止「面板说明」与「结果」互相漂移。
//
// 另有防回滚断言：三个完整测算页的面板 DOM 必须存在于 index.html
//（前车之鉴：auth-ui.js 曾用死选择器 + ?. 抹错，两行代码从未生效多年未发现）。

const fs = require('fs');
const path = require('path');
const { loadSource } = require('./helpers/load-source');

const ROOT = path.join(__dirname, '..');

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/tax-calculator.js');
    loadSource('src/js/calculation/helper-functions.js');
    loadSource('src/js/calculation/utils.js');
    loadSource('src/js/calculation/salary-tax-quick.js');
    loadSource('src/js/data/tool-registry.js');
});

function setInput(id, value) {
    let el = document.getElementById(id);
    if (!el) {
        el = document.createElement('input');
        el.id = id;
        document.body.appendChild(el);
    }
    el.value = String(value);
    return el;
}

// ==================================================================
// 经营所得：DOM 全链路（真实跑 calculateBusinessTax，断言面板渲染结果）
// 说明：businessCalculationResults 是 tax-calculator.js 的 let 变量，
//       跨 eval 不可直接读取 —— 故用「计算 → 接线 → 面板 HTML」端到端断言，
//       数值先手工核算（利润 220000 − 亏损 30000 = 190000；投资者减除 60000；
//       专项扣除 21000；专附 6900；其他扣前 1000；捐赠按 101100×30% 限额内扣 10000；
//       应纳税所得额 91100 → 20% − 10500 = 7720；减半 3860；税后 186140）。
// ==================================================================
describe('经营所得推导链（全链路）', () => {
    function injectBusinessForm(overrides = {}) {
        const values = Object.assign({
            'business-income': 500000,
            'business-cost': 200000,
            'business-expenses': 50000,
            'business-taxes': 10000,
            'business-losses': 0,
            'business-other-expenses': 20000,
            'business-previous-losses': 30000,
            'business-has-comprehensive-income': false,
            'business-work-months': 12,
            'business-pension-insurance': 1000,
            'business-medical-insurance': 200,
            'business-unemployment-insurance': 50,
            'business-housing-fund': 500,
            'business-children-infant-deduction': 2000,
            'business-elderly-deduction': 3000,
            'business-housing-deduction': 1500,
            'business-education-deduction': 400,
            'business-medical-deduction': 0,
            'business-pension-deduction': 1000,
            'business-enterprise-annuity': 0,
            'business-insurance-deduction': 0,
            'business-charitable-donation': 10000,
            'business-prepaid-tax': 5000
        }, overrides);

        Object.keys(values).forEach((id) => {
            const el = setInput(id, values[id]);
            if (id === 'business-has-comprehensive-income') {
                el.type = 'checkbox';
                el.checked = Boolean(values[id]);
            }
        });
    }

    function injectBusinessPanel() {
        // 不用 innerHTML +=（会重建 DOM、丢掉已注入 input 的 value property）
        const panel = document.createElement('details');
        panel.id = 'formula-steps-panel-business';
        panel.className = 'hidden';
        const body = document.createElement('div');
        body.id = 'formula-steps-body-business';
        panel.appendChild(body);
        document.body.appendChild(panel);
    }

    test('计算后面板点亮，关键数值逐位可核对', () => {
        injectBusinessForm();
        injectBusinessPanel();
        calculateBusinessTax();

        const panel = document.getElementById('formula-steps-panel-business');
        const body = document.getElementById('formula-steps-body-business');
        expect(panel.classList.contains('hidden')).toBe(false);

        expect(body.innerHTML).toContain('220000.00');   // 第一步：经营利润
        expect(body.innerHTML).toContain('190000.00');   // 第二步：弥补亏损后所得
        expect(body.innerHTML).toContain('98900.00');    // 第三步：扣除额合计（60000+21000+6900+11000）
        expect(body.innerHTML).toContain('91100.00');    // 第四步：应纳税所得额
        expect(body.innerHTML).toContain('7720.00');     // 第五步：减半征收前应纳税额
        expect(body.innerHTML).toContain('186140.00');   // 最后一步：税后经营所得
        // 政策依据脚注
        expect(body.innerHTML).toContain('200 万元');
    });

    test('无综合所得时投资者减除费用出现在扣除步', () => {
        injectBusinessForm();
        injectBusinessPanel();
        calculateBusinessTax();
        const body = document.getElementById('formula-steps-body-business');
        expect(body.innerHTML).toContain('投资者减除费用');
        expect(body.innerHTML).toContain('60000.00'); // 5000 × 12
    });

    test('有综合所得时不扣投资者减除费用与专项扣除', () => {
        injectBusinessForm({ 'business-has-comprehensive-income': true });
        injectBusinessPanel();
        calculateBusinessTax();
        const body = document.getElementById('formula-steps-body-business');
        expect(body.innerHTML).not.toContain('投资者减除费用');
        expect(body.innerHTML).not.toContain('专项扣除（三险一金）');
    });
});

// ==================================================================
// 分类所得：真实跑 calculateClassificationTaxTotal
// ==================================================================
describe('分类所得推导链', () => {
    test('每个条目一步，汇总步与 results 逐位一致', () => {
        const rentItem = calculateSingleClassificationTax('rent', 60000, 5000);
        expect(rentItem.taxableIncome).toBe(60000 * 0.8 - 5000); // 43000

        const interestItem = calculateSingleClassificationTax('interest', 10000, 0);
        const results = calculateClassificationTaxTotal([rentItem, interestItem]);

        const steps = buildClassificationFormulaSteps(results);
        // 2 个条目 + 1 个汇总
        expect(steps).toHaveLength(3);

        expect(steps[0].totalValue).toBe(rentItem.totalTax);
        expect(steps[1].totalValue).toBe(interestItem.totalTax);

        const summary = steps[2];
        expect(summary.totalLabel).toBe('应纳税额合计');
        expect(summary.totalValue).toBe(results.totalTax);
        expect(summary.rows[0].value).toBe(results.totalIncome);
        expect(summary.rows[1].value).toBe(results.totalTaxableIncome);
    });

    test('updateClassificationResultDisplay 会点亮面板（渲染接线防回滚）', () => {
        // addClassificationItem 走 UI 路径填充内部 let 数组（跨 eval 不可直接赋值）
        document.body.innerHTML += '<details id="formula-steps-panel-classification" class="hidden">' +
            '<div id="formula-steps-body-classification"></div></details>' +
            '<select id="classification-type"><option value="rent" selected>财产租赁</option></select>' +
            '<input id="classification-income" value="60000">' +
            '<input id="rent-deductions" value="5000">' +
            '<input id="rent-repair" value="0">' +
            '<input id="transfer-original" value="0">' +
            '<input id="transfer-expenses" value="0">' +
            '<div id="rent-fields"></div><div id="transfer-fields"></div><div id="accidental-hint"></div>' +
            '<div id="classification-items-list"></div>';
        // resetClassificationCalculation 尾部依赖的步骤切换（navigation-ui.js 提供），此处 stub
        global.showClassificationStep = () => {};

        addClassificationItem();          // rent 60000 − 5000 修缮 → taxable 43000
        calculateClassificationTax();     // 全链路：计算 → 保存 → 渲染 → 接线点亮面板

        const panel = document.getElementById('formula-steps-panel-classification');
        const body = document.getElementById('formula-steps-body-classification');
        expect(panel.classList.contains('hidden')).toBe(false);
        expect(body.innerHTML).toContain('财产租赁所得');
        expect(body.innerHTML).toContain('43000.00');
        expect(body.innerHTML).toContain('8600.00');    // 43000 × 20%
    });
});

// ==================================================================
// 反向倒算：构造 results 对象，断言映射一致（结构同 saveReverseCalculationResult 产出）
// ==================================================================
describe('反向倒算推导链', () => {
    const reverseResults = {
        incomeType: 'comprehensive',
        reverseType: 'monthly',
        workMonths: 12,
        calcMode: 'all',
        totalIncome: 263736,
        totalDeduction: 108000,
        totalTax: 32736,
        incomeDetails: { total: 263736, monthly: 21978 },
        deductionDetails: {
            basic: 5000, specialDeductionTotal: 24000, specialAdditionalTotal: 18000,
            otherTotal: 6000, total: 108000
        },
        taxDetails: {
            totalTax: 32736, netIncome: 231000, monthlyNet: 19250,
            taxableIncome: 155736, applicableRate: 0.2, applicableDeduction: 16920
        },
        bonusIncome: 0,
        bonusTax: 0
    };

    test('反推收入与验算步与 results 逐位一致', () => {
        const steps = buildReverseFormulaSteps(reverseResults);
        expect(steps.length).toBe(6);

        // 第一步：月度税后目标
        expect(steps[0].rows[1].value).toBe(reverseResults.taxDetails.monthlyNet);

        // 扣除合计步
        const deductionStep = steps.find((s) => s.totalLabel === '年度扣除额合计');
        expect(deductionStep.totalValue).toBe(reverseResults.totalDeduction);

        // 应纳税所得额步
        const taxableStep = steps.find((s) => s.totalLabel === '应纳税所得额');
        expect(taxableStep.totalValue).toBe(reverseResults.taxDetails.taxableIncome);

        // 反推所需税前收入（核心结果）
        const incomeStep = steps.find((s) => s.totalLabel === '所需税前收入');
        expect(incomeStep.totalValue).toBe(reverseResults.incomeDetails.total);

        // 最后一步：正向验算
        const lastStep = steps[steps.length - 1];
        expect(lastStep.totalValue).toBe(reverseResults.taxDetails.netIncome);

        steps.forEach((s) => expect(Number.isFinite(s.totalValue)).toBe(true));
    });

    test('按目标税率倒算时第一步展示税率档且有区间脚注', () => {
        const rateResults = Object.assign({}, reverseResults, {
            reverseType: 'rate',
            taxDetails: Object.assign({}, reverseResults.taxDetails, { applicableRate: 0.1 })
        });
        const steps = buildReverseFormulaSteps(rateResults);
        expect(steps[0].rows[1].label).toBe('目标税率档');
        expect(steps[0].rows[1].value).toBe(0.1);
        expect(steps[0].rows[1].format).toBe('percent');
        expect(steps.find((s) => s.totalLabel === '所需税前收入').footnote).toContain('区间');
    });
});

// ==================================================================
// 月薪个税速算器（台账 C 打样）：compute 返回 steps，与 primary 逐位一致
// ==================================================================
describe('月薪个税速算器推导链（打样）', () => {
    const R = () => window.EuriskoToolRegistry;

    test('默认输入：三步推导，累计税额与 primary 一致', () => {
        const out = R().get('salary-tax').compute({
            monthlyIncome: 15000, months: 12, monthlyInsurance: 1500, monthlySpecialAdditional: 1000
        });
        expect(out.steps).toHaveLength(3);

        expect(out.steps[0].totalValue).toBe(7500);                       // 15000 − 5000 − 1500 − 1000
        expect(out.steps[1].totalValue).toBe(90000);                      // 7500 × 12
        expect(out.steps[2].totalValue).toBe(90000 * 0.1 - 2520);         // 90000 × 10% − 2520 = 6480
        expect(out.steps[2].totalValue).toBe(out.primary.value);          // 面板与主结果逐位一致
        expect(out.steps[2].footnote).toContain('90000.00');
    });

    test('月薪低于起征点时不出推导链（避免零除与误导）', () => {
        const out = R().get('salary-tax').compute({
            monthlyIncome: 4000, months: 12, monthlyInsurance: 0, monthlySpecialAdditional: 0
        });
        expect(out.primary.value).toBe(0);
        expect(out.steps).toBeUndefined();
    });
});

// ==================================================================
// 防回滚：三个面板 DOM 必须在 index.html（接线不因重构漂移）
// ==================================================================
describe('面板 DOM 防回滚（index.html）', () => {
    test('经营 / 分类 / 反向三个推导链面板存在', () => {
        const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
        ['formula-steps-panel-business', 'formula-steps-body-business',
            'formula-steps-panel-classification', 'formula-steps-body-classification',
            'formula-steps-panel-reverse', 'formula-steps-body-reverse'
        ].forEach((id) => {
            expect(html).toContain('id="' + id + '"');
        });
    });

    test('utils.js 导出的渲染被三处流程接线引用（不是死代码）', () => {
        const calc = fs.readFileSync(path.join(ROOT, 'src/js/calculation/tax-calculator.js'), 'utf8');
        const helper = fs.readFileSync(path.join(ROOT, 'src/js/calculation/helper-functions.js'), 'utf8');
        expect(calc).toContain('showFormulaStepsPanel(');
        expect(calc).toContain("buildBusinessFormulaSteps(");
        expect(calc).toContain("buildReverseFormulaSteps(");
        expect(helper).toContain("buildClassificationFormulaSteps(");
    });
});
