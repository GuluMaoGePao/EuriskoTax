// 个人养老金与税优三件套（阶段17 17D-9，v1.65.0）的回归网
//
// 它守护的是三个速算器各自只算自己那一项、却答不出来的三层：
//   ① **三项扣的是同一份应纳税所得额，叠加会跨档** —— 各自单独省之和 ≠ 合起来省。
//      实测月薪 1 万（扣除前 4.8 万）+ 三件套满额 2.59 万：单独之和 **2592**、
//      合并 **1617.6** —— **差 974**；
//   ② **年金 4% 的基数不是月薪** —— 是本人**上年度月平均工资**（含奖金），且超过当地
//      社平 **300%** 的部分不计入。月薪 1.5 万 + 年终奖 12 万 → 上年月均 2.5 万、
//      社平 8000 → 基数封顶 **2.4 万**，年免税 **11520** 而不是按月薪算的 7200；
//   ③ **领取环节三件套各不相同** —— 养老金按领取额**全额 3%**（本金 + 收益一起计）、
//      年金按月领走**月度**税率表、税优健康险**赔付免税**。所以 3% 税率档的人缴个人养老金
//      净收益为 0，账户一旦有收益就是净亏（领 1.8 万缴 5400 > 省 3600）。
//
// 口径仍同源：一切计算走 `EuriskoPrivatePensionQuick.stackOf`，限额读各自 rules、
// 计税走内核 `calculateTaxByTaxableIncome`，年金与领取侧复用 annuity-quick /
// health-insurance-quick；只填一项时与 `compareOf` 逐点相等（第一个 describe 钉这个）。

const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/tax-calculator.js');       // calculateTaxByTaxableIncome
    loadSource('src/js/calculation/tax-registry.js');         // policyKey 到期状态
    loadSource('src/js/calculation/private-pension-quick.js');
    loadSource('src/js/calculation/health-insurance-quick.js');
    loadSource('src/js/calculation/annuity-quick.js');
    loadSource('src/js/calculation/utils.js');
    loadSource('src/js/data/tool-registry.js');
    loadSource('src/js/ui/toolbox-ui.js');
    loadSource('src/js/ui/deep-wizard-ui.js');
});

const R = () => window.EuriskoToolRegistry;
const W = () => window.EuriskoDeepWizard;
const Q = () => window.EuriskoPrivatePensionQuick;

// 默认输入 = 速算器的默认形态：一个人、只缴满个人养老金 12000
function compute(values) {
    return R().get('private-pension-deep').compute(Object.assign({
        selfMonthlyIncome: 10000, selfMonthlyInsurance: 1000,
        selfSpecialDeduction: 0, selfOtherDeduction: 0,
        spouseMonthlyIncome: 0, spouseMonthlyInsurance: 0,
        spouseSpecialDeduction: 0, spouseOtherDeduction: 0,
        pensionSelf: 12000, years: 10, growthMultiple: 1.5,
        healthPremium: 0, joinAnnuity: 'no',
        annuityPrevMonthlyWage: 15000, annuitySocialAverage: 8000,
        personalRate: 4, employerRate: 8, monthlyWithdraw: 2000
    }, values || {}));
}

function stack(values) {
    return Q().stackOf(Object.assign({
        selfMonthlyIncome: 10000, selfMonthlyInsurance: 1000,
        selfSpecialDeduction: 0, selfOtherDeduction: 0,
        spouseMonthlyIncome: 0, spouseMonthlyInsurance: 0,
        spouseSpecialDeduction: 0, spouseOtherDeduction: 0,
        pensionSelf: 12000, years: 10, growthMultiple: 1.5,
        healthPremium: 0, joinAnnuity: 'no',
        annuityPrevMonthlyWage: 15000, annuitySocialAverage: 8000,
        personalRate: 0.04, employerRate: 0.08, monthlyWithdraw: 2000
    }, values || {}));
}

function row(out, label) {
    const r = out.rows.find((x) => x.label === label);
    return r ? r.value : undefined;
}

describe('与速算器同源：只填一项 ≡ compareOf', () => {
    test('只缴个人养老金时，合并节税 ≡ 速算器的 taxSaved', () => {
        const r = stack({ pensionSelf: 12000 });
        const quick = Q().compareOf({ annualContribution: 12000, taxableBefore: r.self.taxableBefore, years: 1 });
        expect(r.self.taxableBefore).toBe(48000);            // 120000 − 60000 − 12000
        expect(quick.taxSaved).toBe(1200);
        expect(r.savingCombined).toBe(quick.taxSaved);
        expect(r.separateSum).toBe(quick.taxSaved);          // 只有一项时两者相等
        expect(compute().primary.value).toBe(1200);
    });

    test('只买税优健康险时 ≡ health-insurance-quick', () => {
        const r = stack({ pensionSelf: 0, healthPremium: 2400 });
        const h = window.EuriskoHealthInsuranceQuick.compareOf({
            annualPremium: 2400, taxableBefore: r.self.taxableBefore
        });
        expect(r.savingCombined).toBe(h.taxSaved);
        expect(r.totalDeductible).toBe(2400);
    });

    test('只参加年金且比例 4% 时，可扣除额 ≡ annuity-quick', () => {
        const r = stack({
            pensionSelf: 0, joinAnnuity: 'yes',
            annuityPrevMonthlyWage: 15000, annuitySocialAverage: 8000,
            personalRate: 0.04, employerRate: 0.08
        });
        const a = window.EuriskoAnnuityQuick.contributionOf({
            contributionBase: 15000, personalRate: 0.04, employerRate: 0.08,
            taxableBefore: r.self.taxableBefore
        });
        expect(r.totalDeductible).toBe(a.annualExempt);
        expect(r.totalDeductible).toBe(7200);
        expect(r.savingCombined).toBe(a.taxSaved);
    });
});

describe('三项扣的是同一份应纳税所得额：叠加会跨档', () => {
    test('三件套满额：单独之和 2592、合并 1617.6，差 974.4', () => {
        const out = compute({
            healthPremium: 2400, joinAnnuity: 'yes',
            annuityPrevMonthlyWage: 25000, annuitySocialAverage: 8000
        });
        expect(row(out, '三项合计可扣除')).toBe(12000 + 2400 + 11520);
        expect(row(out, '三项各自单算之和')).toBe(2592);
        expect(row(out, '三项合计少交')).toBeCloseTo(1617.6, 2);
        expect(row(out, '叠加跨档的差额')).toBeCloseTo(974.4, 2);
        expect(out.primary.value).toBeCloseTo(1617.6, 2);
    });

    test('养老金 + 健康险（不参加年金）：单独 1440、合并 1272，差 168', () => {
        const out = compute({ healthPremium: 2400 });
        expect(row(out, '三项合计可扣除')).toBe(14400);
        expect(row(out, '三项各自单算之和')).toBe(1440);
        expect(row(out, '三项合计少交')).toBe(1272);
        expect(row(out, '叠加跨档的差额')).toBe(168);
        expect(row(out, '扣除后应纳税所得额')).toBe(33600);   // 跨过 3.6 万的 3% 档
    });

    test('扣除额没跨档时两者相等（月薪 1.5 万，扣除前 10.2 万）', () => {
        const r = stack({
            selfMonthlyIncome: 15000, selfMonthlyInsurance: 1500,
            pensionSelf: 12000, healthPremium: 2400
        });
        expect(r.self.taxableBefore).toBe(102000);
        expect(r.stackingGap).toBeCloseTo(0, 6);
        expect(r.separateSum).toBeCloseTo(r.savingCombined, 6);
    });
});

describe('年金 4% 的基数不是月薪：上年度月平均工资、封顶社平 3 倍', () => {
    test('月薪 1.5 万 + 年终奖 12 万 → 上年月均 2.5 万、封顶 2.4 万 → 年免税 11520', () => {
        const r = stack({
            pensionSelf: 0, joinAnnuity: 'yes',
            annuityPrevMonthlyWage: 25000, annuitySocialAverage: 8000
        });
        expect(r.items[0].base).toBe(24000);                 // 25000 > 8000 × 3
        expect(r.items[0].baseCapped).toBe(true);
        expect(r.totalDeductible).toBe(11520);
        expect(row(compute({ pensionSelf: 0, joinAnnuity: 'yes', annuityPrevMonthlyWage: 25000 }),
            '年金缴费基数（月）')).toBe(24000);
    });

    test('未超过封顶线时按实际月均工资：1.5 万 → 7200', () => {
        const r = stack({ pensionSelf: 0, joinAnnuity: 'yes', annuityPrevMonthlyWage: 15000 });
        expect(r.items[0].base).toBe(15000);
        expect(r.items[0].baseCapped).toBe(false);
        expect(r.totalDeductible).toBe(7200);
    });

    test('超过 4% 的部分要并回工资计税', () => {
        const r = stack({ pensionSelf: 0, joinAnnuity: 'yes', personalRate: 0.05 });
        expect(r.totalDeductible).toBe(7200);                 // 只有 4% 免税
        expect(r.totalAddBack).toBe(15000 * 0.01 * 12);       // 超出的 1% 并入工资
        expect(row(compute({ pensionSelf: 0, joinAnnuity: 'yes', personalRate: 5 }),
            '年金超 4% 并入工资')).toBe(1800);
    });
});

describe('领取环节：3% 按领取额全额、年金走月度表、健康险免税', () => {
    test('3% 税率档的人缴养老金：只回本金时净收益 0', () => {
        const out = compute({
            selfMonthlyIncome: 8000, selfMonthlyInsurance: 800,
            pensionSelf: 12000, years: 10, growthMultiple: 1
        });
        expect(row(out, '本人扣除前应纳税所得额')).toBe(26400);
        expect(row(out, '养老金缴费期累计节税')).toBe(3600);   // 360 × 10
        expect(row(out, '领取时按 3% 计税')).toBe(3600);       // 12 万 × 3%
        expect(row(out, '养老金净优惠')).toBe(0);
        expect(row(out, '是否划算')).toBe('不划算（当前税率 ≤ 3%）');
    });

    test('账户有收益就转亏：1.5 倍领取 → 缴 5400 > 省 3600，净亏 1800', () => {
        const out = compute({
            selfMonthlyIncome: 8000, selfMonthlyInsurance: 800, growthMultiple: 1.5
        });
        expect(row(out, '领取时按 3% 计税')).toBe(5400);
        expect(row(out, '养老金净优惠')).toBe(-1800);
    });

    test('10% 税率档：领取额涨到 3.33 倍才不划算', () => {
        const r = stack({ pensionSelf: 12000, years: 10, growthMultiple: 1 });
        expect(r.pensionSavedYears).toBe(12000);              // 1200 × 10
        expect(r.breakEvenWithdraw).toBe(400000);             // 12000 ÷ 3%
        expect(r.breakEvenMultiple).toBeCloseTo(3.33, 2);
        expect(r.pensionNetBenefit).toBe(8400);
    });

    test('年金领取按月走月度税率表，健康险赔付免税', () => {
        const r = stack({
            pensionSelf: 0, joinAnnuity: 'yes', healthPremium: 2400,
            annuityPrevMonthlyWage: 25000, annuitySocialAverage: 8000,
            monthlyWithdraw: 2000, years: 10
        });
        expect(r.annuity.monthlyWithdrawRate).toBe(0.03);     // 月领 2000，月度表 3% 档
        expect(r.annuity.withdrawTaxTotal).toBeGreaterThan(0);
        expect(r.items.filter((it) => it.key === 'health')[0].withdrawNote).toContain('免征');
    });
});

describe('12000 是每个人的额度：家里的钱该给谁缴', () => {
    test('本人 3% 档、配偶 20% 档：给配偶缴省 2400，全给本人只省 360', () => {
        const out = compute({
            selfMonthlyIncome: 8000, selfMonthlyInsurance: 800,
            spouseMonthlyIncome: 30000, spouseMonthlyInsurance: 3000
        });
        const plans = out.extras.filter((e) => e.title.indexOf('该给谁缴') >= 0)[0].table.rows;
        expect(plans).toHaveLength(3);
        // 两人都缴满最省；只给本人缴的家庭税最高
        expect(row(out, '三项合计少交')).toBe(360);
        const family = stack({
            selfMonthlyIncome: 8000, selfMonthlyInsurance: 800,
            spouseMonthlyIncome: 30000, spouseMonthlyInsurance: 3000
        });
        expect(family.bestPlan.key).toBe('both');
        expect(family.plans.filter((p) => p.key === 'self')[0].saving).toBe(360);
        expect(family.plans.filter((p) => p.key === 'spouse')[0].saving).toBe(2400);
        expect(family.plans.filter((p) => p.key === 'both')[0].saving).toBe(2760);
    });

    test('超额部分当年不可扣、也不结转', () => {
        const r = stack({ pensionSelf: 20000 });
        expect(r.items[0].deductible).toBe(12000);
        expect(r.items[0].overLimit).toBe(8000);
        expect(r.totalDeductible).toBe(12000);
    });
});

describe('结构与输入边界', () => {
    test('三项一项都没填时给出提示，不产出计税行', () => {
        const out = compute({ pensionSelf: 0, healthPremium: 0 });
        expect(out.rows).toHaveLength(0);
        expect(out.note).toContain('一项都没填');
        expect(out.primary.value).toBe(0);
    });

    test('推导链三步：逐项核定 → 合并扣除 → 领取环节（结果步由渲染器追加）', () => {
        const out = compute();
        expect(out.steps).toHaveLength(3);
        expect(out.steps.map((s) => s.title)).toEqual([
            '① 三项各自核定（限额内的部分才可扣）',
            '② 从同一份应纳税所得额里合并扣除',
            '③ 领取环节与净优惠'
        ]);
        expect(out.steps[1].footnote).toContain('跨档');
        expect(out.steps[2].footnote).toContain('全额');
    });

    test('三张明细表，填了配偶时追加第四张「该给谁缴」', () => {
        expect(compute().extras).toHaveLength(3);
        const withSpouse = compute({ spouseMonthlyIncome: 30000, spouseMonthlyInsurance: 3000 });
        expect(withSpouse.extras).toHaveLength(4);
        expect(withSpouse.extras.map((e) => e.title)).toEqual([
            '三件套逐项核定（限额 / 可扣 / 领取环节）',
            '叠加 vs 各自单算（跨档时两者不等）',
            '领取环节三件套对照',
            '家里的 12000 该给谁缴（每人各 12000，本人只能扣本人的）'
        ]);
    });
});

describe('走向导：由 spec 驱动', () => {
    beforeEach(() => {
        localStorage.clear();
        window.showPage = jest.fn();
        document.body.innerHTML = '<div id="deep-wizard-page" class="page hidden"></div>';
    });

    test('被通用向导接管：应纳税所得额 → 个人养老金 → 健康险与年金 → 结果', () => {
        const tool = R().get('private-pension-deep');
        expect(W().has(tool)).toBe(true);
        expect(tool.pageId).toBeUndefined();
        expect(W().stepsOf(tool).map((s) => s.title)).toEqual([
            '两个人的应纳税所得额', '个人养老金', '税优健康险与企业年金', '计算结果'
        ]);
    });

    test('自带 spec，没有被孪生速算器覆盖', () => {
        const deep = R().get('private-pension-deep');
        const quick = R().get('private-pension');
        expect(deep.compute).not.toBe(quick.compute);
        expect(deep.fields).not.toBe(quick.fields);
        expect(deep.policyKey).toBe('private-pension');
        expect(deep.fields.map((f) => f.key)).toEqual([
            'selfMonthlyIncome', 'selfMonthlyInsurance', 'selfSpecialDeduction', 'selfOtherDeduction',
            'spouseMonthlyIncome', 'spouseMonthlyInsurance', 'spouseSpecialDeduction', 'spouseOtherDeduction',
            'pensionSelf', 'years', 'growthMultiple',
            'healthPremium', 'joinAnnuity', 'annuityPrevMonthlyWage', 'annuitySocialAverage',
            'personalRate', 'employerRate', 'monthlyWithdraw'
        ]);
        expect(deep.steps).toHaveLength(3);
    });

    test('走完向导：主结果、免责声明、结果归属都在', () => {
        W().open('private-pension-deep', { fresh: true });
        for (let i = 0; i < 10; i++) {
            const next = document.getElementById('dw-next');
            if (!next) break;
            next.click();
            if (document.getElementById('dw-result-card')) break;
        }
        expect(document.getElementById('dw-result-primary')).toBeTruthy();
        expect(document.querySelector('.result-disclaimer').textContent).toContain('不构成税务建议');

        const card = document.getElementById('dw-result-card');
        expect(card.textContent).toContain('三件套逐项核定');
        expect(card.getAttribute('data-tool-id')).toBe('private-pension-deep');
    });

    test('年金那组是条件字段：参加才出现基数与比例', () => {
        W().open('private-pension-deep', { fresh: true });
        document.getElementById('dw-next').click();          // 走到「个人养老金」
        document.getElementById('dw-next').click();          // 走到「税优健康险与企业年金」
        expect(document.getElementById('qf-annuityPrevMonthlyWage')).toBeNull();
        expect(document.getElementById('qf-personalRate')).toBeNull();

        document.getElementById('qf-joinAnnuity').value = 'yes';
        document.getElementById('qf-joinAnnuity').dispatchEvent(new Event('change'));
        expect(document.getElementById('qf-annuityPrevMonthlyWage')).toBeTruthy();
        expect(document.getElementById('qf-personalRate')).toBeTruthy();
    });
});
