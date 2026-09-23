/**
 * 经营所得口径回归（前身：17B-1 迁移对拍）
 *
 * v1.46.0 迁移时，这个文件的任务是「页面版 vs spec 版」逐点对拍 —— 证明迁移没改数字。
 * v1.47.0 把旧页面（`business-calculation-page`，那个读 23 个 DOM 的页面版）整页删掉之后，
 * 对拍的左式已经不存在了，于是它换了任务：**按税法口径独立重算一遍关键值**，再回头核
 * `calculateBusinessTaxCore`（也就是向导在用的那份内核）。
 *
 * 为什么不是把三组数字固化成快照：那样将来改坏了只会跳出一个不明所以的期望值。
 * 这里每条断言都能说出「为什么是这个数」—— 比如改了捐赠限额的口径，红的会是下面那条
 * 「公益性捐赠按应纳税所得额 30% 封顶」，而不是一个孤零零的数字。
 *
 * @jest-environment jsdom
 */
const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/utils.js');           // buildBusinessFormulaSteps：推导链
    loadSource('src/js/calculation/tax-calculator.js');  // calculateBusinessTaxCore
    loadSource('src/js/calculation/tax-registry.js');    // business spec 的 policyKey / params
    // 17D-11（v1.67.0）：business spec 的 compute 现在要走 quick 的 taxOf / multiEntityOf，
    // 少了这个模块 compute 会返回 null（它拒绝在没有 quick 的情况下静默算出别的结果）
    loadSource('src/js/calculation/business-income-quick.js');
    loadSource('src/js/data/tool-registry.js');
    loadSource('src/js/ui/toolbox-ui.js');
    loadSource('src/js/ui/deep-wizard-ui.js');
});

const R = () => window.EuriskoToolRegistry;
const W = () => window.EuriskoDeepWizard;

// 经营所得税率表。**刻意在这里单独写一份**（不 import tax-constants）—— 复用内联常量的话，
// 税率表改错了这条测试会跟着错，等于什么也没验。
const BUSINESS_RATES = [
    { max: 30000, rate: 0.05, deduction: 0 },
    { max: 90000, rate: 0.10, deduction: 1500 },
    { max: 300000, rate: 0.20, deduction: 10500 },
    { max: 500000, rate: 0.30, deduction: 40500 },
    { max: Infinity, rate: 0.35, deduction: 65500 }
];

// 减半征收的封顶线：年应纳税所得额 200 万以内的部分减半
const HALVING_CAP = 2000000;

// 独立实现：完全按政策口径重算一遍，不调用被测代码
function recompute(v) {
    const n = (k) => Number(v[k]) || 0;
    const months = parseInt(v.workMonths, 10) || 12;
    const hasCI = v.hasComprehensiveIncome !== false && !!v.hasComprehensiveIncome;

    const profit = Math.max(0, n('income') - n('cost') - n('expenses') - n('taxes') - n('losses') - n('otherExpenses'));
    const netAfterLoss = Math.max(0, profit - n('previousLosses'));

    // 专项扣除（社保/公积金）：填的是**月缴额**，按工作月数折成年
    const sd = (n('pensionInsurance') + n('medicalInsurance') + n('unemploymentInsurance') + n('housingFund')) * months;
    // 大病医疗：只扣超过 1.5 万的部分，限额 8 万
    const medical = n('medicalDeduction') > 15000 ? Math.min(n('medicalDeduction') - 15000, 80000) : 0;
    const sad = n('childrenInfantDeduction') + n('elderlyDeduction') + n('housingDeduction') + n('educationDeduction') + medical;
    // 投资者本人减除费用：5000 元/月 × 工作月数（有综合所得时不在这里扣）
    const investor = hasCI ? 0 : 5000 * months;
    const otherBeforeDonation = n('pensionDeduction') + n('enterpriseAnnuity') + n('insuranceDeduction');

    const beforeDonation = Math.max(0, netAfterLoss - investor - (hasCI ? 0 : sd) - sad - otherBeforeDonation);
    const donateLimit = beforeDonation * 0.3;                       // 公益性捐赠扣除限额
    const donate = Math.min(n('charitableDonation'), donateLimit);
    const taxable = Math.max(0, beforeDonation - donate);

    const bracket = BUSINESS_RATES.find((b) => taxable <= b.max);
    const before = taxable * bracket.rate - bracket.deduction;      // 减半前的应纳税额
    const reduction = before > 0 ? (Math.min(taxable, HALVING_CAP) * bracket.rate - bracket.deduction) * 0.5 : 0;
    const total = Math.max(0, before - reduction);

    return {
        profit, netAfterLoss, sd, sad, medical, investor, beforeDonation, donateLimit, donate,
        taxable, rate: bracket.rate, deduction: bracket.deduction, before, reduction, total,
        refund: total - n('prepaidTax')
    };
}

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

describe('经营所得口径回归：独立重算 vs 内核输出', () => {
    function core(values) {
        return window.calculateBusinessTaxCore(values);
    }

    // 三组输入的断言体是一份，但 test 必须显式写三遍：
    // docs-metrics 是**静态扫行数**（数 `^\s*test\(`），写在 forEach 里只会被算成 1 个，
    // 而 jest 实际跑 3 个 —— 声明数 < 实测数，文档口径守卫会红。
    function runCase(idx) {
        const c = CASES[idx];
        const R0 = recompute(c.values);
        const out = core(c.values);
        const t = out.taxDetails;
        const d = out.deductionDetails;

        // —— 收入侧 ——
        expect(out.incomeDetails.businessProfit).toBeCloseTo(R0.profit, 6);
        expect(t.netIncome).toBeCloseTo(R0.netAfterLoss, 6);

        // —— 扣除侧 ——
        expect(d.investorDeduction).toBeCloseTo(R0.investor, 6);
        expect(d.specialDeduction.total).toBeCloseTo(R0.sd, 6);
        expect(d.specialAdditionalDeduction.actualMedical).toBeCloseTo(R0.medical, 6);
        expect(d.specialAdditionalDeduction.total).toBeCloseTo(R0.sad, 6);
        expect(d.otherDeduction.charitableDonationLimit).toBeCloseTo(R0.donateLimit, 6);
        expect(d.otherDeduction.actualCharitableDonation).toBeCloseTo(R0.donate, 6);

        // —— 税额侧 ——
        expect(t.taxableIncome).toBeCloseTo(R0.taxable, 6);
        expect(t.applicableRate).toBeCloseTo(R0.rate, 6);
        expect(t.applicableDeduction).toBeCloseTo(R0.deduction, 6);
        expect(t.totalTaxBeforeHalving).toBeCloseTo(R0.before, 6);
        expect(t.taxReduction).toBeCloseTo(R0.reduction, 6);
        expect(t.totalTax).toBeCloseTo(R0.total, 6);
        expect(t.refundTax).toBeCloseTo(R0.refund, 6);

        // 每组都得真算出税来，否则这组等于没覆盖（3 组全 0 的话上面的断言也全是 0 == 0）
        expect(t.totalTax).toBeGreaterThan(0);

        // 第三组专门踩 200 万减半封顶：减免额应等于「200 万那一档算出来的税的一半」
        if (idx === 2) {
            expect(R0.taxable).toBeGreaterThan(HALVING_CAP);
            expect(t.taxReduction).toBeCloseTo((HALVING_CAP * R0.rate - R0.deduction) * 0.5, 6);
        }
    }

    test('有综合所得：捐赠按 30% 限额、预缴参与补退', () => {
        runCase(0);
    });

    test('无综合所得：5000×月数 与社保公积金都进经营所得扣除', () => {
        runCase(1);
    });

    test('高所得：触发 200 万减半封顶', () => {
        runCase(2);
    });

    test('有/无综合所得的分水岭：6 万减除与社保公积金两边不能重复扣', () => {
        const base = Object.assign({}, CASES[1].values);
        const withoutCI = window.calculateBusinessTaxCore(base).taxDetails;
        const withCI = window.calculateBusinessTaxCore(Object.assign({}, base, { hasComprehensiveIncome: true })).taxDetails;

        // 有综合所得时，这几项改在综合所得那边扣，经营所得这边的应纳税所得额必然更高
        expect(withCI.taxableIncome).toBeGreaterThan(withoutCI.taxableIncome);
        expect(window.calculateBusinessTaxCore(base).deductionDetails.investorDeduction)
            .toBeCloseTo(5000 * base.workMonths, 6);
        expect(window.calculateBusinessTaxCore(Object.assign({}, base, { hasComprehensiveIncome: true }))
            .deductionDetails.investorDeduction).toBe(0);
    });

    test('公益性捐赠按应纳税所得额 30% 封顶（超限额部分不扣）', () => {
        // 捐赠给到远超限额，实际扣除额应恰好等于 30% 限额
        const values = Object.assign({}, CASES[0].values, { charitableDonation: 99999999 });
        const d = window.calculateBusinessTaxCore(values).deductionDetails.otherDeduction;
        expect(d.actualCharitableDonation).toBeCloseTo(d.charitableDonationLimit, 6);
    });
});

describe('经营所得走向导：business 由 spec 驱动', () => {
    beforeEach(() => {
        localStorage.clear();
        document.body.innerHTML = '<div id="deep-wizard-page" class="page hidden"></div>';
    });

    test('business 被通用向导接管（不再是页面式）', () => {
        expect(W().has(R().get('business'))).toBe(true);
        const steps = W().stepsOf(R().get('business'));
        // 17D-11（v1.67.0）：最前面多了一步「身份与征收方式」—— 企业类型（合伙按分配比例）、
        // 征收方式（查账 / 核定）与「还有没有别的企业」（有就必须汇总定档）都在这一步
        expect(steps).toHaveLength(4);           // 身份 + 收入成本 + 扣除项 + 结果
        expect(steps[0].title).toBe('身份与征收方式');
        expect(steps[1].title).toBe('经营收入与成本');
        expect(steps[2].title).toBe('扣除项明细');
        expect(steps[steps.length - 1].result).toBe(true);
    });

    test('三步走完出结果：主结果、推导链、免责声明都在', () => {
        W().open('business', { fresh: true });
        document.getElementById('dw-next').click();
        document.getElementById('dw-next').click();
        document.getElementById('dw-next').click();
        const host = document.getElementById('deep-wizard-page');

        expect(host.textContent).toContain('应纳个人所得税');
        expect(document.getElementById('dw-formula-panel')).toBeTruthy();     // 推导链
        expect(document.querySelector('.result-disclaimer').textContent).toContain('不构成税务建议');
        // 结果卡带 data-tool-id：留资归因 / 分享图 / 埋点都靠它认人（向导是通用渲染器）
        expect(document.getElementById('dw-result-card').getAttribute('data-tool-id')).toBe('business');
    });

    // 下面三例是 v1.47.0 抓回来的：删旧页面时连带删了 app.js / helper-functions.js 里的
    // 「基数 × 比例 → 月缴额」私有联动，spec 迁移后由向导的 derive / warnings 通用钩子承担。
    // 少了这几条，迁移会悄悄把一个用户天天用的便利输入丢掉（用户手里有的是基数，不是月缴额）。
    function setField(key, value) {
        const el = document.getElementById('qf-' + key);
        el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
    }

    test('缴费基数 × 缴费比例 → 月缴额：改基数即时重算三项', () => {
        W().open('business', { fresh: true });
        document.getElementById('dw-next').click();          // 17D-11：先过「身份与征收方式」
        document.getElementById('dw-next').click();          // 进「扣除项明细」步

        setField('socialBase', 10000);
        expect(document.getElementById('qf-pensionInsurance').value).toBe('800');        // 8%
        expect(document.getElementById('qf-medicalInsurance').value).toBe('200');        // 2%
        expect(document.getElementById('qf-unemploymentInsurance').value).toBe('50');    // 0.5%

        // 公积金基数独立一项：只动它时三项社保险金额不受影响
        const pension = document.getElementById('qf-pensionInsurance').value;
        setField('housingFundBase', 8000);
        expect(document.getElementById('qf-housingFund').value).toBe('400');             // 5%
        expect(document.getElementById('qf-pensionInsurance').value).toBe(pension);
    });

    test('比例清空/越界回落的是该险种自己的默认值，不是统一 5%', () => {
        W().open('business', { fresh: true });
        document.getElementById('dw-next').click();
        document.getElementById('dw-next').click();
        setField('socialBase', 10000);

        const rate = document.getElementById('qf-pensionRate');
        rate.value = '';
        rate.dispatchEvent(new Event('change', { bubbles: true }));      // 失焦归一

        expect(document.getElementById('qf-pensionRate').value).toBe('8');
        expect(document.getElementById('qf-pensionInsurance').value).toBe('800');
    });

    test('低于最低标准的缴费基数当场给出提示', () => {
        W().open('business', { fresh: true });
        document.getElementById('dw-next').click();
        document.getElementById('dw-next').click();
        setField('socialBase', 1000);

        const warn = document.querySelector('.dw-field-warning');
        expect(warn).toBeTruthy();
        expect(warn.textContent).toContain('低于最低标准');
        expect(warn.closest('.tool-field')).toBe(document.getElementById('qf-socialBase').closest('.tool-field'));

        // 合规值挂上去的提示要会自己消失 —— 只按本次结果贴新提示，旧提示会一直挂着
        setField('socialBase', 10000);
        expect(document.querySelector('.dw-field-warning')).toBeNull();
    });

    test('向导默认值算出的数，与独立重算一致（端到端口径闭环）', () => {
        W().open('business', { fresh: true });
        document.getElementById('dw-next').click();
        document.getElementById('dw-next').click();
        document.getElementById('dw-next').click();

        const tool = R().get('business');
        const values = {};
        tool.fields.forEach((f) => { values[f.key] = f.default; });

        // 17D-11（v1.67.0）：spec 新增的三个口径（投资者工资调增 / 合伙企业分配比例 /
        // 多家企业汇总定档）都是**增量** —— 把它们关掉，主结果必须仍等于内核那一个数。
        // 这条就钉这个「关掉＝原样」：新增口径不能悄悄改掉原来那一条链路的答案
        // （三家新口径各自的数字由 tests/business-deep.test.js 单独守护）。
        values.ownerSalary = 0;
        values.hasOtherEntities = false;

        expect(tool.compute(values).primary.value).toBeCloseTo(recompute(values).total, 6);
    });
});
