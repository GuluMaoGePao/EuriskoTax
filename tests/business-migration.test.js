/**
 * 17B-1：经营所得从「页面式」迁到「spec 驱动」的**口径对拍**
 *
 * 这个文件钉的是迁移的第一原则：**改入口不改数字**。同一个输入，
 *   旧路径 = 页面版 calculateBusinessTax（读 23 个 DOM，写 businessCalculationResults）
 *   新路径 = tool-registry 的 business.compute（走抽出来的 calculateBusinessTaxCore）
 * 必须逐点算出同一个数。
 *
 * 17B 一共要迁 4 个页面（business → reverse → forward → classification），这是第一个；
 * 后 3 个照这个模板各写一份。没有对拍的话，「迁完了功能还在、但数字悄悄变了」
 * 这类回归只能靠肉眼 —— 而税务口径的错误恰恰是最难被肉眼发现的那一类。
 *
 * @jest-environment jsdom
 */
const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/utils.js');           // buildBusinessFormulaSteps：推导链
    loadSource('src/js/calculation/tax-calculator.js');  // calculateBusinessTax / Core
    loadSource('src/js/calculation/helper-functions.js');
    loadSource('src/js/data/tool-registry.js');
    loadSource('src/js/ui/toolbox-ui.js');
    loadSource('src/js/ui/deep-wizard-ui.js');
});

const R = () => window.EuriskoToolRegistry;
const W = () => window.EuriskoDeepWizard;

// 页面版读的 DOM id ←→ 内核 / spec 用的 values key（23 项，一一对应）
const FIELD_IDS = {
    income: 'business-income',
    cost: 'business-cost',
    expenses: 'business-expenses',
    taxes: 'business-taxes',
    losses: 'business-losses',
    otherExpenses: 'business-other-expenses',
    previousLosses: 'business-previous-losses',
    hasComprehensiveIncome: 'business-has-comprehensive-income',
    workMonths: 'business-work-months',
    pensionInsurance: 'business-pension-insurance',
    medicalInsurance: 'business-medical-insurance',
    unemploymentInsurance: 'business-unemployment-insurance',
    housingFund: 'business-housing-fund',
    childrenInfantDeduction: 'business-children-infant-deduction',
    elderlyDeduction: 'business-elderly-deduction',
    housingDeduction: 'business-housing-deduction',
    educationDeduction: 'business-education-deduction',
    medicalDeduction: 'business-medical-deduction',
    pensionDeduction: 'business-pension-deduction',
    enterpriseAnnuity: 'business-enterprise-annuity',
    insuranceDeduction: 'business-insurance-deduction',
    charitableDonation: 'business-charitable-donation',
    prepaidTax: 'business-prepaid-tax'
};

beforeEach(() => {
    localStorage.clear();
    window.showAlert = jest.fn();       // 页面版出错时会调它；正常路径不该出现
    // 两条路径的容器都得在：#deep-wizard-page 给新路径（向导），#business-calculation-page 给旧路径（页面版）
    document.body.innerHTML = '<div id="deep-wizard-page" class="page hidden"></div>' +
        '<div id="business-calculation-page"></div>';
});

// 页面版把结果写进这些元素（safeSetTextContent）。对拍读的是**用户实际看到的数** ——
// 比读内部变量更贴近真实：变量改了但没渲染出来，或渲染串了位，都能被抓到。
const RESULT_IDS = {
    netIncome: 'business-result-net-income',
    taxableIncome: 'business-result-taxable-income',
    applicableRate: 'business-result-tax-rate',
    applicableDeduction: 'business-result-deduction',
    totalTax: 'business-result-total-tax',
    prepaidTax: 'business-result-prepaid-tax',
    refundTax: 'business-result-refund-tax',
    taxReduction: 'business-result-tax-reduction',
    totalDeduction: 'business-result-deductions'
};

function mountBusinessForm(values) {
    const host = document.getElementById('business-calculation-page');
    host.innerHTML = '';
    Object.keys(RESULT_IDS).forEach((k) => {
        const span = document.createElement('span');
        span.id = RESULT_IDS[k];
        host.appendChild(span);
    });
    Object.keys(FIELD_IDS).forEach((key) => {
        const raw = values[key];
        const el = document.createElement('input');
        el.id = FIELD_IDS[key];
        if (key === 'hasComprehensiveIncome') {
            el.type = 'checkbox';
            el.checked = raw !== false;
        } else {
            el.type = 'number';
            el.value = String(raw == null ? 0 : raw);
        }
        host.appendChild(el);
    });
}

// 旧路径：跑真实的页面版计算函数
// 页面版是「let businessCalculationResults」—— 间接 eval 里的 let 不会泄漏到全局，
// 外部读不到那个变量，所以这里读**页面渲染出来的结果元素**。
function readMoney(id) {
    const el = document.getElementById(id);
    if (!el) return null;
    const m = String(el.textContent).replace(/[¥,\s]/g, '').match(/-?\d+(?:\.\d+)?/);
    return m ? parseFloat(m[0]) : null;
}

function pageVersion(values) {
    mountBusinessForm(values);
    window.calculateBusinessTax();
    const out = {};
    Object.keys(RESULT_IDS).forEach((k) => { out[k] = readMoney(RESULT_IDS[k]); });
    out.applicableRate = out.applicableRate / 100;      // 页面显示的是百分比整数
    const refundEl = document.getElementById('business-result-refund-tax');
    if (refundEl && /应退/.test(refundEl.textContent)) out.refundTax = -Math.abs(out.refundTax);
    return out;
}

// 新路径：跑 spec 的 compute
function specVersion(values) {
    const tool = R().get('business');
    const out = tool.compute(values);
    return { out, core: window.calculateBusinessTaxCore(values) };
}

// 对拍要逐点比对的口径字段（页面版渲染出来的那几项；未渲染的 internal 字段不在此列）
const TAX_KEYS = ['netIncome', 'taxableIncome', 'applicableRate', 'applicableDeduction',
    'taxReduction', 'totalTax', 'prepaidTax', 'refundTax', 'totalDeduction'];

const CASES = [
    {
        name: '有综合所得：捐赠按 30% 限额、预缴参与补退',
        values: {
            income: 600000, cost: 350000, expenses: 50000, taxes: 0, losses: 0,
            otherExpenses: 0, previousLosses: 0, hasComprehensiveIncome: true, workMonths: 12,
            pensionInsurance: 800, medicalInsurance: 200, unemploymentInsurance: 50, housingFund: 600,
            childrenInfantDeduction: 12000, elderlyDeduction: 12000, housingDeduction: 12000,
            educationDeduction: 0, medicalDeduction: 20000,
            pensionDeduction: 0, enterpriseAnnuity: 0, insuranceDeduction: 0,
            charitableDonation: 20000, prepaidTax: 5000
        }
    },
    {
        name: '无综合所得：5000×月数 与社保公积金都进经营所得扣除',
        values: {
            income: 800000, cost: 400000, expenses: 60000, taxes: 5000, losses: 10000,
            otherExpenses: 5000, previousLosses: 20000, hasComprehensiveIncome: false, workMonths: 9,
            pensionInsurance: 900, medicalInsurance: 220, unemploymentInsurance: 60, housingFund: 700,
            childrenInfantDeduction: 24000, elderlyDeduction: 0, housingDeduction: 0,
            educationDeduction: 3600, medicalDeduction: 40000,
            pensionDeduction: 2400, enterpriseAnnuity: 3000, insuranceDeduction: 1000,
            charitableDonation: 10000, prepaidTax: 0
        }
    },
    {
        name: '高所得：触发 200 万减半封顶',
        values: {
            income: 5000000, cost: 1000000, expenses: 200000, taxes: 0, losses: 0,
            otherExpenses: 0, previousLosses: 0, hasComprehensiveIncome: true, workMonths: 12,
            pensionInsurance: 0, medicalInsurance: 0, unemploymentInsurance: 0, housingFund: 0,
            childrenInfantDeduction: 0, elderlyDeduction: 0, housingDeduction: 0,
            educationDeduction: 0, medicalDeduction: 0,
            pensionDeduction: 0, enterpriseAnnuity: 0, insuranceDeduction: 0,
            charitableDonation: 0, prepaidTax: 0
        }
    }
];

// 三组用例共用这一份断言。
// 注意别写成 `CASES.forEach(c => test(...))`：项目统计用例数是**扫测试文件里 test( 的个数**
// （见 tests/docs-metrics.test.js 的说明），数据驱动的动态用例会被少算 —— 3 组只算成 1 个，
// 文档口径就会比 jest 实测少 2 而变红。所以这里显式写三个 test。
function assertSameAsPage(values) {
    const page = pageVersion(values);
    const { out, core } = specVersion(values);

    // 页面版没抛错（它出错会走 showAlert）
    expect(window.showAlert).not.toHaveBeenCalled();

    TAX_KEYS.forEach((k) => {
        const expected = (k === 'totalDeduction') ? core.deductionDetails.total : core.taxDetails[k];
        expect(expected).toBeCloseTo(page[k], 6);
    });

    // spec 版对外展示的主结果 = 页面版渲染出来的应纳税额
    expect(out.primary.value).toBeCloseTo(page.totalTax, 6);
}

describe('17B-1 对拍：迁移前后必须算出同一个数', () => {
    test(CASES[0].name, () => assertSameAsPage(CASES[0].values));
    test(CASES[1].name, () => assertSameAsPage(CASES[1].values));
    test(CASES[2].name, () => assertSameAsPage(CASES[2].values));

    test('对拍覆盖到关键分支：减半与捐赠限额真的被触发过（不是三组都算出 0）', () => {
        const taxes = CASES.map((c) => pageVersion(c.values).totalTax);
        expect(taxes.every((t) => t > 0)).toBe(true);
        // 减半减免：高所得那组必须真的享到减免（否则这一组对拍等于没覆盖到减半分支）
        const high = pageVersion(CASES[2].values);
        expect(high.taxReduction).toBeGreaterThan(0);
    });
});

describe('17B-1 向导端到端：business 由 spec 驱动', () => {
    test('business 被通用向导接管（不再是页面式）', () => {
        expect(W().has(R().get('business'))).toBe(true);
        const steps = W().stepsOf(R().get('business'));
        expect(steps).toHaveLength(3);                     // 收入成本 + 扣除项 + 结果
        expect(steps[0].title).toBe('经营收入与成本');
        expect(steps[1].title).toBe('扣除项明细');
        expect(steps[steps.length - 1].result).toBe(true);
    });

    test('两步走完出结果：主结果、推导链、免责声明都在', () => {
        W().open('business', { fresh: true });
        document.getElementById('dw-next').click();
        document.getElementById('dw-next').click();
        const host = document.getElementById('deep-wizard-page');

        expect(host.textContent).toContain('应纳个人所得税');
        expect(document.getElementById('dw-formula-panel')).toBeTruthy();     // 推导链（复用 utils.js 那份）
        expect(document.querySelector('.result-disclaimer').textContent).toContain('不构成税务建议');
    });

    test('向导默认值算出的数，与页面版同一组输入一致（端到端口径闭环）', () => {
        // 走向导到第 3 步（用 spec 默认值），再拿同一份 values 跑页面版做对拍
        W().open('business', { fresh: true });
        document.getElementById('dw-next').click();
        document.getElementById('dw-next').click();

        const tool = R().get('business');
        const values = {};
        tool.fields.forEach((f) => { values[f.key] = f.default; });
        const page = pageVersion(values);

        expect(tool.compute(values).primary.value).toBeCloseTo(page.totalTax, 6);
    });
});
