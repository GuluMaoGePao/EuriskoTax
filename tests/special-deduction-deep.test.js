// 专项附加扣除完整测算（阶段17 17D-8，v1.64.0）的回归网
//
// 它守护的是速算器那个「扣除前全年应纳税所得额」输入框说不出来的三层：
//   ① **夫妻之间怎么分摊** —— 扣除抵的是**各自**的应纳税所得额，放在税率高的一方身上才省得多。
//      实测：夫月薪 6000（应纳税所得额 4800，3% 档）、妻月薪 3 万（26.4 万，20% 档），
//      子女教育 2.4 万全给夫只省 **144 元**（其余 1.92 万全浪费），给妻省 **4800 元**
//      —— **差 4656 元**，而速算器只算一个人，这个问题它根本答不了；
//   ② **按实际符合条件的月份累计** —— 孩子年中满 3 岁、老人年中满 60 岁都不是满 12 个月
//      （7 个月 = 14000 元而不是 24000 元），速算器一律按 12 个月满算；
//   ③ **逐项的边际节税** —— 跨档时各项单独贡献之和（1368）≠ 合计节税（1704）。
// 另外两条法定硬约束：赡养老人非独生子女**每人不超过 1500 元/月**（填 2000 也只认 1500）、
// 房贷利息与住房租金**同一年度只能二选一**（租金 1.8 万 vs 房贷 1.2 万，差 6000）。
//
// 口径仍同源：一切计算走 `EuriskoSpecialDeductionQuick.fullOf`，它自己又读
// `specialDeductionRules` 的七项标准、走内核 `calculateTaxByTaxableIncome` 计税 ——
// 单人 + 满 12 个月时与 `annualOf` / `savingOf` 逐点相等（第一个 describe 就钉这个）。

const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/tax-calculator.js');       // calculateTaxByTaxableIncome
    loadSource('src/js/calculation/tax-registry.js');         // policyKey 到期状态
    loadSource('src/js/calculation/special-deduction-quick.js');
    loadSource('src/js/calculation/utils.js');
    loadSource('src/js/data/tool-registry.js');
    loadSource('src/js/ui/toolbox-ui.js');
    loadSource('src/js/ui/deep-wizard-ui.js');
});

const R = () => window.EuriskoToolRegistry;
const W = () => window.EuriskoDeepWizard;
const Q = () => window.EuriskoSpecialDeductionQuick;

// 默认输入 = 速算器的默认形态：一个人、只申报子女教育 1 个孩子、满 12 个月
function compute(values) {
    return R().get('special-deduction-deep').compute(Object.assign({
        selfMonthlyIncome: 15000, selfMonthlyInsurance: 1500, selfOtherDeduction: 0,
        spouseMonthlyIncome: 0, spouseMonthlyInsurance: 0, spouseOtherDeduction: 0,
        children: 1, childMonths: 12, childShare: 'auto',
        infants: 0, infantMonths: 12, infantShare: 'auto',
        housing: 'none', loanMonths: 12, loanShare: 'auto', rentTier: '1', rentMonths: 12,
        elderly: 'none', elderlyMonths: 12, elderlyMonthly: 1500,
        degreeMonths: 0, certCount: 0,
        medicalSelfPaid: 0, medicalShare: 'auto'
    }, values || {}));
}

function full(values) {
    return Q().fullOf(Object.assign({
        selfMonthlyIncome: 15000, selfMonthlyInsurance: 1500, selfOtherDeduction: 0,
        spouseMonthlyIncome: 0, spouseMonthlyInsurance: 0, spouseOtherDeduction: 0,
        children: 1, childMonths: 12,
        infants: 0, infantMonths: 12,
        housing: 'none', loanMonths: 12, rentTier: '1', rentMonths: 12,
        elderly: 'none', elderlyMonths: 12, elderlyMonthly: 1500,
        degreeMonths: 0, certCount: 0, medicalSelfPaid: 0
    }, values || {}));
}

function row(out, label) {
    const r = out.rows.find((x) => x.label === label);
    return r ? r.value : undefined;
}

describe('与速算器同源：一个人、满 12 个月 ≡ annualOf / savingOf', () => {
    test('七项年度扣除额与 annualOf 完全一致', () => {
        const r = full({ children: 1, elderly: 'only' });
        const quick = Q().annualOf({ children: 1, elderly: 'only', housing: 'none' });
        expect(r.totalAnnual).toBe(quick.totalAnnual);       // 24000 + 36000
        expect(r.totalAnnual).toBe(60000);
    });

    test('节税额与 savingOf 完全一致（两段计税相减，不是「扣除额 × 税率」）', () => {
        const r = full({ children: 1 });
        const saving = Q().savingOf({ taxableBefore: r.self.taxableBefore, annualDeduction: r.totalAnnual });
        expect(r.self.taxableBefore).toBe(102000);
        expect(saving.taxBefore).toBe(7680);
        expect(saving.taxAfter).toBe(5280);
        expect(saving.saving).toBe(2400);
        expect(r.saving).toBe(saving.saving);
        expect(row(compute(), '七项年度扣除合计')).toBe(24000);
        expect(row(compute(), '家庭全年个税（按最省的分摊）')).toBe(5280);
        expect(compute().primary.value).toBe(2400);
    });

    test('扣除前应纳税所得额 = 全年工资 − 6 万 − 五险一金 − 其他扣除', () => {
        const r = full({ selfMonthlyIncome: 20000, selfMonthlyInsurance: 2000, selfOtherDeduction: 12000 });
        expect(r.self.income).toBe(240000);
        expect(r.self.taxableBefore).toBe(240000 - 60000 - 24000 - 12000);
        expect(r.self.taxableBefore).toBe(144000);
    });
});

describe('夫妻之间怎么分摊：扣除抵的是各自的应纳税所得额', () => {
    test('夫 3% 档、妻 20% 档：给妻省 4800、全给夫只省 144 → 差 4656', () => {
        const out = compute({
            selfMonthlyIncome: 6000, selfMonthlyInsurance: 600,
            spouseMonthlyIncome: 30000, spouseMonthlyInsurance: 3000
        });
        expect(row(out, '本人扣除前应纳税所得额')).toBe(4800);
        expect(row(out, '落在本人身上')).toBe(0);
        expect(row(out, '落在配偶身上')).toBe(24000);
        expect(row(out, '家庭全年个税（按最省的分摊）')).toBe(31224);   // 31080 + 144
        expect(row(out, '全给自己要多交')).toBe(4656);
        expect(out.primary.value).toBe(4800);
    });

    test('「全给自己」时扣除大部分用不上 → 给出没用上的金额', () => {
        const r = full({
            selfMonthlyIncome: 6000, selfMonthlyInsurance: 600,
            spouseMonthlyIncome: 30000, spouseMonthlyInsurance: 3000,
            childShare: 'self'
        });
        expect(r.best.deductionSelf).toBe(24000);
        expect(r.best.wastedSelf).toBe(19200);              // 应纳税所得额只有 4800
        expect(r.best.saving).toBe(144);
        expect(row(compute({
            selfMonthlyIncome: 6000, selfMonthlyInsurance: 600,
            spouseMonthlyIncome: 30000, spouseMonthlyInsurance: 3000,
            childShare: 'self'
        }), '扣除没用上的部分')).toBe(19200);
    });

    test('配偶无收入时不存在「给谁」这个问题：只有一个方案', () => {
        const r = full({ children: 1, infants: 1 });
        expect(r.hasSpouse).toBe(false);
        expect(r.plans).toHaveLength(1);
        expect(r.best.owners.childrenEducation).toBe('self');
    });

    test('两家都有收入时枚举全部组合（子女 + 婴幼儿各三种）', () => {
        const r = full({
            spouseMonthlyIncome: 20000, spouseMonthlyInsurance: 2000,
            children: 1, infants: 1
        });
        expect(r.hasSpouse).toBe(true);
        expect(r.plans).toHaveLength(9);                    // 3 × 3
    });
});

describe('按实际符合条件的月份累计，不是一律满 12 个月', () => {
    test('孩子年中满 3 岁（7 个月）：14000 元而不是 24000 元', () => {
        const out = compute({ childMonths: 7 });
        expect(row(out, '七项年度扣除合计')).toBe(14000);
        expect(out.primary.value).toBe(1400);
    });

    test('老人年中满 60 岁（5 个月）：独生子女 3000 × 5 = 15000', () => {
        const out = compute({ children: 0, elderly: 'only', elderlyMonths: 5 });
        expect(row(out, '七项年度扣除合计')).toBe(15000);
        expect(out.primary.value).toBe(1500);
    });

    test('房贷本年最多 12 个月：填 300 个月也只按 12 个月算（240 个月是累计上限）', () => {
        const out = compute({ children: 0, housing: 'loan', loanMonths: 300 });
        expect(row(out, '七项年度扣除合计')).toBe(12000);
    });

    test('租金按城市档 × 月数', () => {
        expect(row(compute({ children: 0, housing: 'rent', rentTier: '1', rentMonths: 12 }), '七项年度扣除合计')).toBe(18000);
        expect(row(compute({ children: 0, housing: 'rent', rentTier: '2', rentMonths: 6 }), '七项年度扣除合计')).toBe(6600);
    });
});

describe('两条硬约束：分摊上限与二选一', () => {
    test('赡养老人非独生子女每人不超过 1500 元/月：填 2000 也只认 1500', () => {
        const out = compute({ children: 0, elderly: 'shared', elderlyMonthly: 2000, elderlyMonths: 12 });
        expect(row(out, '七项年度扣除合计')).toBe(18000);
        expect(Q().fullOf({ selfMonthlyIncome: 15000, selfMonthlyInsurance: 1500,
            elderly: 'shared', elderlyMonthly: 2000, elderlyMonths: 12 }).items[0].monthly).toBe(1500);
        // 独生子女不受这个限制
        expect(row(compute({ children: 0, elderly: 'only', elderlyMonths: 12 }), '七项年度扣除合计')).toBe(36000);
    });

    test('房贷利息与住房租金同一年度只能二选一：给出另一个口径的对照', () => {
        const loan = compute({ housing: 'loan', loanMonths: 12 });
        expect(row(loan, '住房二选一的另一个口径')).toBe(18000);      // 租金 1 档估算
        expect(loan.extras.some((e) => e.title.indexOf('住房贷款利息 vs 住房租金') >= 0)).toBe(true);

        const rent = compute({ housing: 'rent', rentTier: '1', rentMonths: 12 });
        expect(row(rent, '住房二选一的另一个口径')).toBe(12000);      // 房贷估算

        expect(compute({ housing: 'none' }).housingCompare).toBeUndefined();
    });
});

describe('大病医疗只能在汇算时扣：超 1.5 万的部分、限额 8 万', () => {
    test('自付 10 万 → 可扣 8 万；1.4 万 → 一分不扣', () => {
        expect(row(compute({ children: 0, medicalSelfPaid: 100000 }), '七项年度扣除合计')).toBe(80000);
        // 1.4 万在起扣线以下 → 这一项根本不成立（没有别的扣除时整张核定表为空）
        const below = compute({ children: 0, medicalSelfPaid: 14000 });
        expect(below.rows).toHaveLength(0);
        expect(full({ children: 0, medicalSelfPaid: 14000 }).items).toHaveLength(0);
        expect(full({ children: 0, medicalSelfPaid: 15001 }).items[0].annual).toBe(1);

        const r = full({ children: 0, medicalSelfPaid: 100000 });
        expect(r.items[0].note).toContain('15000');
        expect(r.items[0].note).toContain('80000');
    });
});

describe('继续教育：学历按月累计、职业资格只在取得当年', () => {
    test('学历 400 × 12 + 职业资格 3600 可同时享受', () => {
        const out = compute({ children: 0, degreeMonths: 12, certCount: 1 });
        expect(row(out, '七项年度扣除合计')).toBe(4800 + 3600);
        expect(out.primary.value).toBe(840);
    });
});

describe('逐项边际节税：跨档时各项之和 ≠ 合计', () => {
    test('跨 10% → 3% 档：两项单独贡献 1224 + 144 = 1368，而合计省 1704', () => {
        const out = compute({ selfMonthlyIncome: 10000, selfMonthlyInsurance: 1000, degreeMonths: 12 });
        expect(row(out, '本人扣除前应纳税所得额')).toBe(48000);
        expect(out.primary.value).toBe(1704);

        const r = full({ selfMonthlyIncome: 10000, selfMonthlyInsurance: 1000, children: 1, degreeMonths: 12 });
        const sum = r.marginal.reduce((acc, m) => acc + m.contribution, 0);
        expect(sum).toBe(1368);
        expect(sum).not.toBe(r.saving);
        expect(r.marginal.map((m) => m.contribution)).toEqual([1224, 144]);
    });

    test('朴素估算（扣除额 × 税率）在跨档时高估', () => {
        const out = compute({ selfMonthlyIncome: 10000, selfMonthlyInsurance: 1000, degreeMonths: 12 });
        expect(row(out, '朴素估算（扣除额 × 税率）')).toBe(28800 * 0.1);   // 2880 > 实际 1704
    });
});

describe('结构与输入边界', () => {
    test('七项一项都没填时给出提示，不产出计税行', () => {
        const out = compute({ children: 0 });
        expect(out.rows).toHaveLength(0);
        expect(out.note).toContain('一项都没填');
        expect(out.primary.value).toBe(0);
    });

    test('推导链三步：逐项核定 → 落到各自的应纳税所得额 → 家庭税负与最省分摊（结果步由渲染器追加）', () => {
        const out = compute();
        expect(out.steps).toHaveLength(3);
        expect(out.steps.map((s) => s.title)).toEqual([
            '① 逐项核定：月标准 × 实际月数 × 分摊',
            '② 扣除落到各自的应纳税所得额上',
            '③ 家庭税负与最省的分摊'
        ]);
        expect(out.steps[2].footnote).toContain('1500 元/月');
        expect(out.steps[2].footnote).toContain('二选一');
    });

    test('三张明细表：逐项核定 / 分摊方案对照 / 逐项边际节税', () => {
        const out = compute({ spouseMonthlyIncome: 20000, spouseMonthlyInsurance: 2000, children: 1, infants: 1 });
        expect(out.extras.map((e) => e.title)).toEqual([
            '七项逐项核定（月数 × 标准 × 分摊）',
            '分摊方案对照（家庭全年个税）',
            '逐项边际节税（去掉这一项会多交多少）'
        ]);
        expect(out.extras[0].table.rows).toHaveLength(2);
        expect(out.extras[1].table.rows.length).toBeLessThanOrEqual(4);
    });
});

describe('走向导：由 spec 驱动', () => {
    beforeEach(() => {
        localStorage.clear();
        window.showPage = jest.fn();
        document.body.innerHTML = '<div id="deep-wizard-page" class="page hidden"></div>';
    });

    test('被通用向导接管：两个人的收入基础 → 子女与婴幼儿 → 住房与赡养老人 → 继续教育与大病医疗 → 结果', () => {
        const tool = R().get('special-deduction-deep');
        expect(W().has(tool)).toBe(true);
        expect(tool.pageId).toBeUndefined();
        expect(W().stepsOf(tool).map((s) => s.title)).toEqual([
            '两个人的收入基础', '子女与婴幼儿', '住房与赡养老人', '继续教育与大病医疗', '计算结果'
        ]);
    });

    test('自带 spec，没有被孪生速算器覆盖', () => {
        const deep = R().get('special-deduction-deep');
        const quick = R().get('special-deduction');
        expect(deep.compute).not.toBe(quick.compute);
        expect(deep.fields).not.toBe(quick.fields);
        expect(deep.fields.map((f) => f.key)).toEqual([
            'selfMonthlyIncome', 'selfMonthlyInsurance', 'selfOtherDeduction',
            'spouseMonthlyIncome', 'spouseMonthlyInsurance', 'spouseOtherDeduction',
            'children', 'childMonths', 'childShare', 'infants', 'infantMonths', 'infantShare',
            'housing', 'loanMonths', 'loanShare', 'rentTier', 'rentMonths',
            'elderly', 'elderlyMonths', 'elderlyMonthly',
            'degreeMonths', 'certCount', 'medicalSelfPaid', 'medicalShare'
        ]);
        expect(deep.steps).toHaveLength(4);
        expect(deep.policyKey).toBe('special-deduction');
    });

    test('走完向导：主结果、免责声明、结果归属都在', () => {
        W().open('special-deduction-deep', { fresh: true });
        for (let i = 0; i < 10; i++) {
            const next = document.getElementById('dw-next');
            if (!next) break;
            next.click();
            if (document.getElementById('dw-result-card')) break;
        }
        expect(document.getElementById('dw-result-primary')).toBeTruthy();
        expect(document.querySelector('.result-disclaimer').textContent).toContain('不构成税务建议');

        const card = document.getElementById('dw-result-card');
        expect(card.textContent).toContain('七项逐项核定');
        expect(card.getAttribute('data-tool-id')).toBe('special-deduction-deep');
    });

    test('住房类字段是条件字段：选了房贷才出现贷款月数，选了租金才出现城市档', () => {
        W().open('special-deduction-deep', { fresh: true });
        document.getElementById('dw-next').click();          // 走到「子女与婴幼儿」
        document.getElementById('dw-next').click();          // 走到「住房与赡养老人」
        expect(document.getElementById('qf-loanMonths')).toBeNull();
        expect(document.getElementById('qf-rentTier')).toBeNull();

        document.getElementById('qf-housing').value = 'loan';
        document.getElementById('qf-housing').dispatchEvent(new Event('change'));
        expect(document.getElementById('qf-loanMonths')).toBeTruthy();

        document.getElementById('qf-housing').value = 'rent';
        document.getElementById('qf-housing').dispatchEvent(new Event('change'));
        expect(document.getElementById('qf-rentTier')).toBeTruthy();
    });
});
