// 阶段12 A4：方案对比中心 守护测试
//
// 覆盖两部分：
//   1. scenario-store.js —— 方案库纯函数（normalize / buildSummary / upsert /
//      removeById / filterByOwner / limitFor）+ 存储读写与付费上限边界
//   2. scenario-ui.js.pure —— 由表单数据推导年终奖方案的纯逻辑
//
// 设计背景：A4 复用 A1 抽出的「可注入 deductions」计算路径，
//   因此这里能脱离 DOM 直接跑多种情景，验证方案对比结果口径正确。

const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/tax-calculator.js');
    loadSource('src/js/calculation/utils.js');
    loadSource('src/js/calculation/engine.js');
    loadSource('src/js/data/scenario-store.js');
    loadSource('src/js/ui/scenario-ui.js');
});

beforeEach(() => {
    localStorage.clear();
});

// 最简扣除项：仅基本减除费用 5000/月，年度总扣除 60000
function simpleDeductionInput() {
    return {
        monthlyBasicDeduction: 5000,
        monthlyPensionInsurance: 0,
        monthlyMedicalInsurance: 0,
        monthlyUnemploymentInsurance: 0,
        monthlyHousingFund: 0,
        monthlyElderlyDeduction: 0,
        monthlyChildrenInfantDeduction: 0,
        monthlyHousingDeduction: 0,
        annualEducationDeduction: 0,
        annualMedicalDeduction: 0,
        annualProfessionalDeduction: 0,
        monthlyPensionDeduction: 0,
        monthlyEnterpriseAnnuity: 0,
        monthlyInsuranceOtherDeduction: 0,
        monthlyTaxDeferredPension: 0,
        annualCharitableDonation: 0
    };
}

describe('window.EuriskoScenarios 纯函数契约', () => {
    const pure = () => window.EuriskoScenarios.pure;

    test('normalize 丢弃脏数据与重复 id，并补全默认字段', () => {
        const out = pure().normalize([
            null,
            { name: '缺 id' },
            { id: 'a', name: 'A' },
            { id: 'a', name: '重复 A' },
            { id: 'b' }
        ]);

        expect(out.map((i) => i.id)).toEqual(['a', 'b']);
        expect(out[0].name).toBe('A');
        expect(out[1].name).toBe('未命名方案');
        expect(out[0].ownerId).toBe('local');
        expect(out[1].summary).toEqual({});
    });

    test('buildSummary 从计算结果推导对比指标', () => {
        const results = {
            workMonths: 12,
            incomeDetails: { preTaxTotal: 420000, bonus: 60000, bonusInclude: false, bonusTax: 5790 },
            taxDetails: { totalTax: 43080, netIncome: 371130 }
        };

        const s = pure().buildSummary(results);

        expect(s.preTaxTotal).toBe(420000);
        expect(s.taxTotal).toBe(43080 + 5790);   // 综合所得税 + 年终奖单独计税
        expect(s.effectiveRate).toBeCloseTo(48870 / 420000, 10);
        expect(s.monthlyNet).toBeCloseTo(371130 / 12, 6);
        expect(s.bonusMethod).toBe('单独计税');

        const included = pure().buildSummary({
            workMonths: 12,
            incomeDetails: { preTaxTotal: 420000, bonus: 60000, bonusInclude: true, bonusTax: 0 },
            taxDetails: { totalTax: 58080, netIncome: 361920 }
        });
        expect(included.bonusMethod).toBe('并入综合所得');
    });

    test('upsert 不修改入参：分别支持新增与按 id 覆盖', () => {
        const list = [{ id: 'a', name: 'A' }];

        const added = pure().upsert(list, { id: 'b', name: 'B' });
        expect(list.length).toBe(1);           // 入参未被修改
        expect(added.map((i) => i.id)).toEqual(['a', 'b']);

        const updated = pure().upsert(added, { id: 'a', name: 'A2' });
        expect(updated.length).toBe(2);        // 覆盖不新增
        expect(updated.find((i) => i.id === 'a').name).toBe('A2');
        expect(added.find((i) => i.id === 'a').name).toBe('A'); // 入参仍为旧值
    });

    test('removeById 只删除目标项且不修改入参', () => {
        const list = [{ id: 'a' }, { id: 'b' }];
        const next = pure().removeById(list, 'a');
        expect(next.map((i) => i.id)).toEqual(['b']);
        expect(list.length).toBe(2);
    });

    test('filterByOwner 按账户隔离方案', () => {
        const list = [
            { id: 'a', ownerId: 'u1' },
            { id: 'b', ownerId: 'u2' },
            { id: 'c', ownerId: 'u1' }
        ];
        expect(pure().filterByOwner(list, 'u1').map((i) => i.id)).toEqual(['a', 'c']);
        expect(pure().filterByOwner(list, 'nobody')).toEqual([]);
    });

    test('limitFor：基础版 2 套、专业版 10 套', () => {
        expect(pure().limitFor(false)).toBe(2);
        expect(pure().limitFor(true)).toBe(10);
    });

    test('makeId 生成的方案 id 唯一', () => {
        const ids = new Set();
        for (let i = 0; i < 200; i++) ids.add(pure().makeId());
        expect(ids.size).toBe(200);
    });
});

describe('方案库存储与付费边界', () => {
    test('基础版最多保存 2 套，第 3 套被 limit 拒绝', () => {
        const store = window.EuriskoScenarios;

        expect(store.save({ name: 'S1', summary: {} }, { isPro: false }).ok).toBe(true);
        expect(store.save({ name: 'S2', summary: {} }, { isPro: false }).ok).toBe(true);

        const third = store.save({ name: 'S3', summary: {} }, { isPro: false });
        expect(third.ok).toBe(false);
        expect(third.reason).toBe('limit');
        expect(third.needPro).toBe(true);
        expect(store.list().length).toBe(2);
    });

    test('专业版可保存至 10 套，超出同样被拒绝', () => {
        const store = window.EuriskoScenarios;
        for (let i = 0; i < 10; i++) {
            expect(store.save({ name: 'S' + i, summary: {} }, { isPro: true }).ok).toBe(true);
        }
        expect(store.list().length).toBe(10);
        expect(store.save({ name: 'S11', summary: {} }, { isPro: true }).reason).toBe('limit');
    });

    test('remove 删除指定方案后列表同步收窄', () => {
        const store = window.EuriskoScenarios;
        const saved = store.save({ name: 'S1', summary: {} }, { isPro: true });
        expect(store.list().length).toBe(1);

        expect(store.remove(saved.scenario.id).ok).toBe(true);
        expect(store.list()).toEqual([]);
    });

    test('保存内容跨读取保持一致（序列化往返不丢字段）', () => {
        const store = window.EuriskoScenarios;
        store.save({
            name: '带摘要',
            input: { monthlySalaryIncome: 30000 },
            summary: { preTaxTotal: 360000, monthlyNet: 25000 }
        }, { isPro: true });

        const first = store.list()[0];
        expect(first.name).toBe('带摘要');
        expect(first.input.monthlySalaryIncome).toBe(30000);
        expect(first.summary.preTaxTotal).toBe(360000);
        expect(first.ownerId).toBe('local');
        expect(typeof first.createdAt).toBe('string');
    });
});

describe('buildBonusScenarios 年终奖方案推导（纯逻辑）', () => {
    const base = {
        workMonths: 12,
        monthlySalaryIncome: 30000,
        annualLaborIncome: 0,
        annualAuthorIncome: 0,
        annualRoyaltyIncome: 0,
        bonusIncome: 60000,
        bonusInclude: false
    };

    let deductions;
    beforeAll(() => {
        deductions = computeDeductions(simpleDeductionInput(), 12);
    });

    test('未填写年终奖时返回 ok:false 并给出提示', () => {
        const r = window.EuriskoScenarioUI.pure.buildBonusScenarios(
            Object.assign({}, base, { bonusIncome: 0 }), deductions
        );
        expect(r.ok).toBe(false);
        expect(typeof r.message).toBe('string');
    });

    test('纯工资+年终奖：给出并入与单独两种口径，税额口径正确', () => {
        const r = window.EuriskoScenarioUI.pure.buildBonusScenarios(base, deductions);
        const names = r.scenarios.map((s) => s.name);

        expect(r.ok).toBe(true);
        expect(names).toContain('年终奖并入综合所得');
        expect(names).toContain('年终奖单独计税');

        const merge = r.scenarios.find((s) => s.name === '年终奖并入综合所得');
        const single = r.scenarios.find((s) => s.name === '年终奖单独计税');

        // 并入：应纳税所得额 = (360000 + 60000) - 60000 = 360000 → 25% 档，速算扣除 31920
        expect(merge.summary.taxTotal).toBeCloseTo(360000 * 0.25 - 31920, 6);
        // 单独：综合所得 300000 → 20% 档；年终奖 60000/12 = 5000 → 10% 档，速算扣除 210
        expect(single.summary.taxTotal).toBeCloseTo((300000 * 0.20 - 16920) + (60000 * 0.10 - 210), 6);
        // 单独计税更省税 → 税后年收入更高
        expect(single.summary.netIncome).toBeGreaterThan(merge.summary.netIncome);
    });

    test('含劳务等其他收入时降级为两种口径，不生成最优拆分', () => {
        const r = window.EuriskoScenarioUI.pure.buildBonusScenarios(
            Object.assign({}, base, { annualLaborIncome: 20000 }), deductions
        );
        expect(r.ok).toBe(true);
        expect(r.scenarios.map((s) => s.name)).not.toContain('年终奖与工资最优拆分');
        expect(r.note).toContain('不适用');
    });

    test('每个方案都附带可直接对比的 summary 指标', () => {
        const r = window.EuriskoScenarioUI.pure.buildBonusScenarios(base, deductions);
        ['preTaxTotal', 'netIncome', 'taxTotal', 'effectiveRate', 'monthlyNet', 'bonusMethod']
            .forEach((key) => {
                r.scenarios.forEach((s) => {
                    expect(s.summary).toHaveProperty(key);
                });
            });
    });
});

describe('对比辅助函数', () => {
    test('fmtValue 处理金额 / 百分比 / 文本格式', () => {
        const pure = window.EuriskoScenarioUI.pure;
        expect(pure.fmtValue(1234.5, 'money')).toBe('¥1234.50');
        expect(pure.fmtValue(0.1234, 'percent')).toBe('12.34%');
        expect(pure.fmtValue('单独计税', 'text')).toBe('单独计税');
        expect(pure.fmtValue('', 'text')).toBe('-');
        expect(pure.fmtValue(undefined, 'money')).toBe('¥0.00');
    });

    test('bestIndex 按 min/max 找出最优列下标', () => {
        const pure = window.EuriskoScenarioUI.pure;

        const byTax = [{ summary: { taxTotal: 100 } }, { summary: { taxTotal: 80 } }, { summary: { taxTotal: 120 } }];
        expect(pure.bestIndex(byTax, 'taxTotal', 'min')).toBe(1);

        const byNet = [{ summary: { netIncome: 100 } }, { summary: { netIncome: 180 } }, { summary: { netIncome: 150 } }];
        expect(pure.bestIndex(byNet, 'netIncome', 'max')).toBe(1);

        expect(pure.bestIndex([], 'taxTotal', 'min')).toBe(-1);
    });
});
