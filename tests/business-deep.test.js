// 经营所得 17D-11 纵深（v1.67.0）的回归网
//
// 原来的 business spec 只认「一家个体户、成本费用逐项扣」—— 经营所得最贵的三层它一层都没碰：
//
//   ① **一人兴办两家以上企业必须汇总定档**（财税〔2000〕91号 第十二条）：年度终了汇总
//      所有企业的应纳税所得额，据此确定适用税率 —— 分别各自申报会把速算扣除数扣两次、
//      档位还偏低，实测少交 **28250 元**（那是漏报，不是筹划）；
//   ② **年度经营亏损不能跨企业弥补**（第十四条第二款）：亏损企业当年计 0，亏损留在本企业
//      用以后年度所得逐年弥补、**最长 5 年** —— 误按「盈利 − 亏损」互抵，实测少算 **70000 元**；
//   ③ **投资者的工资不得税前扣除**（第六条（一））：给业主本人发的工资已计入成本费用的，
//      汇算时一律调增；投资者本人 6 万费用扣除**只能选其中一家企业**扣（第十三条）；
//      合伙企业按**分配比例**归属（第五条）。
//
// 另外把「减半到底减的是什么」钉死：**减的是「不超过 200 万那部分对应的税额」**，不是
// 全额应纳税额打五折 —— 后者在应纳税所得额 > 200 万时才现形（300 万时差 175000 元）。
//
// 口径同源：三条新口径都落在 business-income-quick.js（multiEntityOf / halveCompareOf），
// 内核 calculateBusinessTaxCore 只加了两个**默认不生效**的可选参数（ownerSalaryAddBack /
// profitShareRatio）—— 关掉它们必须回到内核那一个数，这条由本文件与
// tests/business-income-core.test.js 的「关掉＝原样」共同守护。
//
// 顺带清偿一个遗留：经营所得减半优惠公式原先散在结果展示与正向计算路径里有多份同形实现，
// 现在统一到 quick 的 taxOf / halveOf，第一个 describe 用「与内核逐点对拍」证明它们等价。

const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');           // businessTaxRates / businessIncomeRules
    loadSource('src/js/calculation/tax-calculator.js');          // calculateBusinessTaxCore
    loadSource('src/js/calculation/tax-registry.js');
    loadSource('src/js/calculation/business-income-quick.js');
    loadSource('src/js/calculation/utils.js');
    loadSource('src/js/data/tool-registry.js');
    loadSource('src/js/ui/toolbox-ui.js');
    loadSource('src/js/ui/deep-wizard-ui.js');
});

const R = () => window.EuriskoToolRegistry;
const W = () => window.EuriskoDeepWizard;
const Q = () => window.EuriskoBusinessIncomeQuick;

// 默认形态：本企业 32 万（利润 20 万 + 业主工资调增 12 万），另有乙企业 +80 万、丙企业 −40 万
function values(extra) {
    const base = {};
    R().get('business').fields.forEach((f) => { base[f.key] = f.default; });
    return Object.assign(base, extra || {});
}

function compute(extra) {
    return R().get('business').compute(values(extra));
}

function row(out, label) {
    const r = out.rows.find((x) => x.label === label);
    return r ? r.value : undefined;
}

function tableOf(out, keyword) {
    const e = out.extras.filter((x) => x.title.indexOf(keyword) >= 0)[0];
    return e ? e.table.rows : [];
}

describe('减半公式只有一个真身：quick 与内核逐点对拍', () => {
    test('taxOf(t).tax ≡ 内核 totalTax（30 万 ~ 500 万逐点）', () => {
        const v = values({ hasOtherEntities: false, ownerSalary: 0, hasComprehensiveIncome: true,
            income: 0, cost: 0, expenses: 0, previousLosses: 0, charitableDonation: 0, prepaidTax: 0 });
        [300000, 500000, 900000, 1000000, 2000000, 3000000, 5000000].forEach((t) => {
            // 用「收入 = t、成本 = 0」构造出应税所得额恰好为 t 的输入
            const core = window.calculateBusinessTaxCore(Object.assign({}, v, { income: t }));
            expect(core.taxDetails.taxableIncome).toBeCloseTo(t, 6);
            expect(Q().taxOf(t).tax).toBeCloseTo(core.taxDetails.totalTax, 6);
        });
    });

    test('halveOf(t) ≡ 内核 taxReduction，且减的是「200 万那部分对应的税额」', () => {
        const v = values({ hasOtherEntities: false, ownerSalary: 0, hasComprehensiveIncome: true,
            income: 0, cost: 0, expenses: 0, previousLosses: 0, charitableDonation: 0, prepaidTax: 0 });
        [1000000, 3000000].forEach((t) => {
            const core = window.calculateBusinessTaxCore(Object.assign({}, v, { income: t }));
            expect(Q().taxOf(t).halve).toBeCloseTo(core.taxDetails.taxReduction, 6);
            expect(Q().halveOf(t)).toBeCloseTo(core.taxDetails.taxReduction, 6);
        });
        // 300 万：减免 = min(300 万, 200 万) 部分对应的税额 × 50% = (2000000×35% − 65500) × 50%
        expect(Q().halveOf(3000000)).toBeCloseTo((2000000 * 0.35 - 65500) * 0.5, 6);
        expect(Q().taxOf(3000000).halve).toBeCloseTo(317250, 6);
    });

    test('单企业时 multiEntityOf 与 taxOf 是同一个数', () => {
        [320000, 800000, 2000000].forEach((t) => {
            expect(Q().multiEntityOf({ own: t, others: [] }).legal).toBeCloseTo(Q().taxOf(t).tax, 6);
        });
    });
});

describe('一人多家企业：汇总定档 + 亏损不能跨企业弥补', () => {
    test('分别申报会少交 28250（漏报，不是筹划）', () => {
        const out = compute();
        expect(row(out, '汇总应纳税所得额')).toBe(1120000);      // 32 万 + 80 万 + 0
        expect(row(out, '比“分别申报”多交')).toBeCloseTo(28250, 6);
        expect(out.primary.value).toBe(163250);
    });

    test('把亏损拿去互抵会少算 70000（第十四条第二款）', () => {
        const out = compute();
        expect(row(out, '比“亏损互抵”多交')).toBeCloseTo(70000, 6);
        expect(row(out, '留在原企业结转的亏损')).toBe(400000);
        expect(out.note).toContain('不能跨企业弥补');
    });

    test('亏损企业当年计 0，不是把汇总数冲抵掉', () => {
        const m = Q().multiEntityOf({ own: 500000, others: [{ taxable: -200000 }] });
        expect(m.aggregateTaxable).toBe(500000);      // 不是 30 万
        expect(m.nettingTaxable).toBe(300000);
        expect(m.netting).toBeGreaterThan(0);
        expect(m.nettingGap).toBeGreaterThan(0);
        expect(m.lossCarriedForward).toBe(200000);
        expect(m.lossCarryYears).toBe(5);
    });

    test('不享受减半时，三种口径的差依然成立', () => {
        const m = Q().multiEntityOf({ own: 320000, others: [{ taxable: 800000 }, { taxable: -400000 }], halve: false });
        expect(m.legal).toBeCloseTo(1120000 * 0.35 - 65500, 6);
        expect(m.separate).toBeLessThan(m.legal);
        expect(m.netting).toBeLessThan(m.legal);
        expect(m.halveApplied).toBe(false);
    });
});

describe('投资者的工资不得扣除（第六条（一））与合伙企业分配比例（第五条）', () => {
    test('给业主发 12 万工资并计入成本 → 应纳税所得额调增 12 万', () => {
        const withSalary = compute({ hasOtherEntities: false, ownerSalary: 120000 });
        const without = compute({ hasOtherEntities: false, ownerSalary: 0 });
        expect(row(withSalary, '本企业应纳税所得额') - row(without, '本企业应纳税所得额')).toBe(120000);
        expect(window.calculateBusinessTaxCore(values({ ownerSalary: 120000 }), { ownerSalaryAddBack: 120000 })
            .taxDetails.ownerSalaryAddBack).toBe(120000);
    });

    test('合伙企业按分配比例归属：50% 时所得减半（不是按谁拿了多少钱）', () => {
        const own = Q().multiEntityOf({ own: 800000, others: [] }).legal;
        const half = compute({
            hasOtherEntities: false, ownerSalary: 0, entityType: 'partnership', partnershipRatio: 50,
            income: 1200000, cost: 400000
        });
        // 利润 80 万 × 50% = 40 万（本例无综合所得时还要扣 6 万，故取 34 万或 40 万视默认而定）
        expect(half.primary.value).toBeLessThan(own);
        const core = window.calculateBusinessTaxCore(
            values({ entityType: 'partnership', partnershipRatio: 50, income: 1200000, cost: 400000 }),
            { profitShareRatio: 0.5 });
        expect(core.taxDetails.profitShareRatio).toBeCloseTo(0.5, 6);
    });

    test('不传 options 时内核行为与之前完全一致（新参数是增量）', () => {
        const v = values({ ownerSalary: 0 });
        const core = window.calculateBusinessTaxCore(v);
        expect(core.taxDetails.ownerSalaryAddBack).toBe(0);
        expect(core.taxDetails.profitShareRatio).toBe(1);
    });

    test('6 万费用扣除只能选其中一家（第十三条）：已在别家扣过 → 本企业不再扣', () => {
        // 开着「还有别的企业」但清单为空：这样只切换 6 万扣在哪，汇总数不受干扰
        const atSelf = compute({ hasOtherEntities: true, otherEntities: [], hasComprehensiveIncome: false, ownerSalary: 0 });
        const atOther = compute({ hasOtherEntities: true, otherEntities: [], hasComprehensiveIncome: false, ownerSalary: 0,
            ownerDeductionAt: 'other' });
        expect(row(atOther, '本企业应纳税所得额') - row(atSelf, '本企业应纳税所得额')).toBe(60000);
    });
});

describe('减半到底减的是什么（三种算法对照）', () => {
    test('超过 200 万时「应纳税额打五折」少算 175000（300 万）', () => {
        const c = Q().halveCompareOf(3000000);
        expect(c.before).toBe(984500);
        expect(c.correct).toBe(667250);
        expect(c.byTax).toBe(492250);
        expect(c.gapByTax).toBeCloseTo(175000, 6);
        expect(c.gapByTaxable).toBeCloseTo(207750, 6);
    });

    test('不超过 200 万时两种算法恰好相等 —— 坑只在超过 200 万时才现形', () => {
        [500000, 1000000, 2000000].forEach((t) => {
            const c = Q().halveCompareOf(t);
            expect(c.byTax).toBeCloseTo(c.correct, 6);
            expect(c.byTaxable).toBeLessThan(c.correct);
        });
    });

    test('结果区把三种算法并排列出来（不是只给一个数）', () => {
        const rows = tableOf(compute(), '减半到底减的是什么');
        expect(rows).toHaveLength(5);
        expect(rows[0][0].value).toBe(500000);
        expect(rows[4][0].value).toBe(5000000);
    });
});

describe('结构与边界', () => {
    test('推导链三步：本企业所得 → 汇总定档 → 减半与补退（结果步由渲染器追加）', () => {
        const out = compute();
        expect(out.steps).toHaveLength(3);
        expect(out.steps.map((s) => s.title)).toEqual([
            '① 本企业应纳税所得额',
            '② 汇总定档（第十二 ~ 十四条）',
            '③ 减半与补退'
        ]);
        expect(out.steps[1].footnote).toContain('不能跨企业弥补');
        expect(out.steps[1].rows).toHaveLength(3 + 3);   // 三家企业 + 汇总数/税率/速算扣除数
    });

    test('三张明细表：多家企业汇总、减半三种算法、查账 vs 核定', () => {
        const out = compute();
        expect(out.extras).toHaveLength(3);
        expect(tableOf(out, '各家企业的所得')).toHaveLength(4);      // 三家企业 + 合计
    });

    test('核定征收时不再给「改核定」那张表（已经是核定了），且不扣成本费用', () => {
        const assessed = compute({ mode: 'assessed', profitRatio: 10 });
        expect(assessed.extras).toHaveLength(2);
        expect(tableOf(assessed, '如果改成核定征收')).toHaveLength(0);
        expect(row(assessed, '本企业应纳税所得额')).toBeCloseTo(600000 * 0.1, 6);   // 收入 60 万 × 10%
        expect(row(assessed, '扣除合计')).toBeUndefined();
    });

    test('确定性：同一输入两次计算结果一致（不含随机数 / 时间戳）', () => {
        const a = compute();
        const b = compute();
        expect(a.primary.value).toBe(b.primary.value);
        expect(a.note).toBe(b.note);
        expect(JSON.stringify(a.rows)).toBe(JSON.stringify(b.rows));
    });
});

describe('走向导：由 spec 驱动', () => {
    beforeEach(() => {
        localStorage.clear();
        window.showPage = jest.fn();
        document.body.innerHTML = '<div id="deep-wizard-page" class="page hidden"></div>';
    });

    test('被通用向导接管：身份与征收方式 → 经营收入与成本 → 扣除项明细 → 结果', () => {
        const tool = R().get('business');
        expect(W().has(tool)).toBe(true);
        expect(W().stepsOf(tool).map((s) => s.title)).toEqual([
            '身份与征收方式', '经营收入与成本', '扣除项明细', '计算结果'
        ]);
    });

    test('走完四步：主结果、免责声明、结果归属都在', () => {
        W().open('business', { fresh: true });
        for (let i = 0; i < 10; i++) {
            const next = document.getElementById('dw-next');
            if (!next) break;
            next.click();
            if (document.getElementById('dw-result-card')) break;
        }
        expect(document.getElementById('dw-result-primary')).toBeTruthy();
        expect(document.querySelector('.result-disclaimer').textContent).toContain('不构成税务建议');
        const card = document.getElementById('dw-result-card');
        expect(card.textContent).toContain('汇总应纳税所得额');
        expect(card.getAttribute('data-tool-id')).toBe('business');
    });

    test('条件字段：合伙才问分配比例、核定才问应税所得率、开了多家才出现企业清单', () => {
        W().open('business', { fresh: true });
        expect(document.getElementById('qf-partnershipRatio')).toBeNull();
        expect(document.getElementById('qf-profitRatio')).toBeNull();

        document.getElementById('qf-entityType').value = 'partnership';
        document.getElementById('qf-entityType').dispatchEvent(new Event('change'));
        expect(document.getElementById('qf-partnershipRatio')).toBeTruthy();

        document.getElementById('qf-mode').value = 'assessed';
        document.getElementById('qf-mode').dispatchEvent(new Event('change'));
        expect(document.getElementById('qf-profitRatio')).toBeTruthy();
    });

    test('关掉「还有别的企业」后，企业清单消失（repeater 是条件字段）', () => {
        W().open('business', { fresh: true });
        expect(document.getElementById('qf-otherEntities-0-taxable')).toBeTruthy();
        expect(document.getElementById('qf-otherEntities-1-taxable')).toBeTruthy();

        const sw = document.getElementById('qf-hasOtherEntities');
        sw.checked = false;
        sw.dispatchEvent(new Event('change'));
        expect(document.getElementById('qf-otherEntities-0-taxable')).toBeNull();
    });
});
