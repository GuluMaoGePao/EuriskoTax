// 经营所得「减半公式只有一个真身」的跨路径对拍（阶段17 17E，v1.70.0）
//
// 这份守卫的由来是一条**写着 TODO 的注释**：`tax-calculator.js` 里「≤200 万部分减半」
// 这同一条政策被抄了 6 份 —— 经营所得税率倒算的结果段、月度税后倒算、税额倒算、到手
// 金额倒算、正向内核 `calculateBusinessTaxCore`，加上被 Phase 2.5 ① 抽出来的
// `businessTaxOf`。它们的 guard 写法互不相同：
//
//   · `halvingTaxable > 0` vs `result.tax > 0` vs `totalTaxBeforeHalving > 0`；
//   · 税率取 `targetBracket`（**用户选的目标税率那一档**）还是 `taxResult`（实际应纳税
//     所得额所在的那一档）—— 税率倒算那条路径用的是**前者**，差一个档就差一整档税；
//   · 有的写了 `Math.max(0, ...)` 兜底，有的没有。
//
// 「在实际税率结构下等价」是**推断**，不是**证明**。而统一的收益恰恰来自不确定性消失：
// 有了这份对拍，把 6 处替换成同一个函数时，任何一处真实的口径差都会在 CI 里炸出来，
// 而不是悄悄改掉用户看到的税额数字 —— 这是这个项目对「看起来一样的重构」的一贯做法
// （参见 business-income-core.test.js 里刻意另写一份税率表的注释）。
//
// 三条纪律：
//   ① 参考实现 `recompute()` **不调用被测代码**，税率表也在本文件另写一份；
//   ② 每条路径都用它**自己返回的 taxableIncome** 去喂参考实现 —— 这样断言的是
//      「这条路径的税额 == 真身算出来的税额」，而不是某个编造的输入；
//   ③ 先补齐对拍、再统一 —— 顺序不能反。

const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/tax-calculator.js');          // 6 份实现都在这里
    loadSource('src/js/calculation/business-income-quick.js');   // 第 7 份：quick 的 taxOf / halveOf
});

const Q = () => window.EuriskoBusinessIncomeQuick;

// 参考实现：完全按政策口径独立重算（不调用被测代码）
// 政策：财政部 税务总局公告 2023 年第 12 号 —— 年应纳税所得额不超过 200 万元的部分，
//       **减半征收**；执行至 2027-12-31。
// 关键：减的是「200 万那一段**对应的税额**」的一半，不是全额应纳税额的一半。
const BUSINESS_RATES = [
    { max: 30000, rate: 0.05, deduction: 0 },
    { max: 90000, rate: 0.10, deduction: 1500 },
    { max: 300000, rate: 0.20, deduction: 10500 },
    { max: 500000, rate: 0.30, deduction: 40500 },
    { max: Infinity, rate: 0.35, deduction: 65500 }
];
const HALVING_CAP = 2000000;

function recompute(taxable) {
    const t = Math.max(0, Number(taxable) || 0);
    const b = BUSINESS_RATES.find((x) => t <= x.max);
    const before = Math.max(0, t * b.rate - b.deduction);
    const reduction = before > 0
        ? (Math.min(t, HALVING_CAP) * b.rate - b.deduction) * 0.5
        : 0;
    return {
        taxable: t, before: before, reduction: reduction,
        tax: Math.max(0, before - reduction),
        rate: b.rate, deduction: b.deduction
    };
}

// 五个档位的边界 ±1 元、200 万封顶 ±1 元，以及 0 与负数（后者只要求不出 NaN）
const TAXABLES = [
    0, -50000, 1, 12000, 29999, 30000, 30001,
    89999, 90000, 90001, 299999, 300000, 300001,
    499999, 500000, 500001, 1999999, 2000000, 2000001, 3000000, 5000000, 35000000
];

const MODES = ['conservative', 'balanced', 'aggressive'];
const TARGET_RATES = [5, 10, 20, 30, 35];

function near(actual, expected, what) {
    // 税额单位到分就够了：这里比的是「同一个公式的两种写法」，不是「算得准不准」
    expect({ [what]: Number.isFinite(actual) ? Math.round(actual * 100) / 100 : actual })
        .toEqual({ [what]: Math.round(expected * 100) / 100 });
}

describe('参考实现先自检：政策口径本身没被抄错', () => {
    test('200 万：before 634500、reduction 317250、tax 317250', () => {
        const r = recompute(2000000);
        expect(r.before).toBe(634500);
        expect(r.reduction).toBe(317250);
        expect(r.tax).toBe(317250);
    });

    test('300 万：只有 200 万那一段减半 —— 「应纳税额打五折」会少算 175000', () => {
        const r = recompute(3000000);
        expect(r.before).toBe(984500);
        expect(r.reduction).toBe(317250);      // 与 200 万时**完全相同**（封顶的意义）
        expect(r.tax).toBe(667250);
        expect(r.tax - r.before * 0.5).toBe(175000);
    });

    test('200 万 +1 元：减免额不再增加（封顶）', () => {
        expect(recompute(2000001).reduction).toBe(recompute(2000000).reduction);
    });

    test('≤200 万时减免额随所得线性增长；>200 万后完全不动', () => {
        expect(recompute(1000000).reduction).toBeCloseTo((1000000 * 0.35 - 65500) * 0.5, 6);
        expect(recompute(5000000).reduction).toBe(recompute(2000000).reduction);
    });
});

describe('七份实现与参考实现逐点对拍（22 个应纳税所得额）', () => {
    test('businessTaxOf(t) ≡ 参考实现', () => {
        TAXABLES.forEach((t) => {
            const ref = recompute(t);
            near(window.businessTaxOf(t), ref.tax, 'businessTaxOf(' + t + ')');
        });
    });

    test('quick 的 taxOf(t).tax / halveOf(t) ≡ 参考实现', () => {
        TAXABLES.forEach((t) => {
            const ref = recompute(t);
            const s = Q().taxOf(t);
            near(s.tax, ref.tax, 'Q.taxOf(' + t + ').tax');
            near(s.beforeHalve, ref.before, 'Q.taxOf(' + t + ').beforeHalve');
            near(s.halve, ref.reduction, 'Q.taxOf(' + t + ').halve');
        });
    });

    test('内核 calculateBusinessTaxCore 的 totalTax / taxReduction ≡ 参考实现', () => {
        // hasComprehensiveIncome=true 时投资者费用与社保都不另扣 → 应纳税所得额 = 收入
        TAXABLES.forEach((t) => {
            const core = window.calculateBusinessTaxCore({
                income: t, cost: 0, expenses: 0, taxes: 0, losses: 0, otherExpenses: 0,
                previousLosses: 0, hasComprehensiveIncome: true, workMonths: 12, prepaidTax: 0
            });
            const ref = recompute(core.taxDetails.taxableIncome);
            near(core.taxDetails.totalTax, ref.tax, 'core.totalTax@' + t);
            near(core.taxDetails.taxReduction, ref.reduction, 'core.taxReduction@' + t);
            near(core.taxDetails.totalTaxBeforeHalving, ref.before, 'core.totalTaxBeforeHalving@' + t);
        });
    });
});

describe('四条倒算路径：用自己的 taxableIncome 喂真身', () => {
    // 每条倒算都先从输入解出一个 taxableIncome，再算税额 —— 断言的就是「后半段」
    // 与 businessTaxOf 完全一致，且 hasHalvingDiscount / halvingTaxAmount 也是同一个数。
    const DEDUCTION = { totalDeduction: 0 };

    test('经营所得税率倒算 calculateBusinessFromTargetRate（税率取自目标档的那份）', () => {
        TARGET_RATES.forEach((rate) => {
            MODES.forEach((mode) => {
                const r = window.calculateBusinessFromTargetRate({ targetRate: rate }, DEDUCTION, mode);
                const ref = recompute(r.taxableIncome);
                near(r.finalTotalTax, ref.tax, 'targetRate' + rate + '/' + mode);
                near(r.halvingTaxAmount, ref.reduction, 'halvingAmount' + rate + '/' + mode);
                expect(r.hasHalvingDiscount).toBe(ref.reduction > 0);
            });
        });
    });

    test('月度税后倒算 calculateBusinessFromMonthlyNet', () => {
        [5000, 20000, 80000, 200000].forEach((monthlyNet) => {
            MODES.forEach((mode) => {
                const r = window.calculateBusinessFromMonthlyNet(
                    { monthlyNet: monthlyNet, workMonths: 12 }, DEDUCTION, mode);
                const ref = recompute(r.taxableIncome);
                near(r.finalTotalTax, ref.tax, 'monthlyNet' + monthlyNet + '/' + mode);
                near(r.halvingTaxAmount, ref.reduction, 'halvingAmount' + monthlyNet + '/' + mode);
            });
        });
    });

    test('目标税额倒算 calculateBusinessFromTargetTax（fixedTax 分支）', () => {
        [0, 10000, 200000, 600000].forEach((fixedTax) => {
            MODES.forEach((mode) => {
                const r = window.calculateBusinessFromTargetTax(
                    { fixedTax: fixedTax, fixedNet: -1 }, DEDUCTION, mode);
                const ref = recompute(r.taxableIncome);
                near(r.finalTotalTax, ref.tax, 'fixedTax' + fixedTax + '/' + mode);
                near(r.halvingTaxAmount, ref.reduction, 'halvingAmount' + fixedTax + '/' + mode);
            });
        });
    });

    test('到手金额倒算 calculateBusinessFromTargetTax（fixedNet 分支）', () => {
        [60000, 240000, 960000, 3000000].forEach((fixedNet) => {
            MODES.forEach((mode) => {
                const r = window.calculateBusinessFromTargetTax(
                    { fixedTax: -1, fixedNet: fixedNet }, DEDUCTION, mode);
                const ref = recompute(r.taxableIncome);
                near(r.finalTotalTax, ref.tax, 'fixedNet' + fixedNet + '/' + mode);
                near(r.halvingTaxAmount, ref.reduction, 'halvingAmount' + fixedNet + '/' + mode);
            });
        });
    });
});

describe('17E 顺手修掉的那处真 bug：目标税率倒算要真落在所选那一档', () => {
    // 这个 bug 是**统一过程中**被发现的，不是事先列的工作项：
    // `businessTaxRates` 只有 `max` 没有 `min`，而 `calculateBusinessFromTargetRate` 写的是
    // `targetBracket.min || 0` → 恒等于 0 → 「保守」模式无论选哪档都落到最低档的 12000 元；
    // 接着它**拿用户选的目标税率那一级的税率与速算扣除数**去乘这 12000 元，得到一个**负数**
    // 的减免额，再把负数减出去 —— 于是选的税率越高、算出来的税越多（选 35% 时税额比所得额本身还高）。
    test('保守模式选 30% → 应纳税所得额必须 > 30 万（老写法给 12000）', () => {
        const r = window.calculateBusinessFromTargetRate({ targetRate: 30 }, { totalDeduction: 0 }, 'conservative');
        expect(r.taxableIncome).toBeGreaterThan(300000);
        expect(r.applicableRate).toBeCloseTo(0.30, 6);
        expect(r.finalTotalTax).toBeCloseTo(recompute(r.taxableIncome).tax, 6);
    });

    test('选的目标税率越高，税额必须单调递增（老写法里 35% 那档的税额比所得额还高）', () => {
        const taxes = TARGET_RATES.map((rate) =>
            window.calculateBusinessFromTargetRate({ targetRate: rate }, { totalDeduction: 0 }, 'conservative').finalTotalTax);
        for (let i = 1; i < taxes.length; i++) {
            expect(taxes[i]).toBeGreaterThan(taxes[i - 1]);
        }
        // 修完之后：5% → 300（12000×5%÷2），35% → 500001 那一段减半后的数
        expect(taxes[0]).toBeCloseTo(300, 6);
        expect(taxes[taxes.length - 1]).toBeCloseTo(54750.175, 6);
    });

    test('三模式 × 五档：返回结果的**适用税率**必须就是用户选的那一档', () => {
        // 第二处 bug（同样是统一时才发现的）：最高档的 `max` 在表里是 **null** 不是 Infinity，
        // 于是 35% 档的均衡模式算成 (下界 + null)/2 = 下界的一半 → 落进 20% 档；
        // 进取模式直接给 null → 应纳税所得额 0。用户明明选了 35%，拿到的却是另一个档的结果。
        // 这类 bug 不会被「self-consistency」型断言发现（结果对自己一致），得直接查目标。
        MODES.forEach((mode) => {
            TARGET_RATES.forEach((rate) => {
                const r = window.calculateBusinessFromTargetRate({ targetRate: rate }, { totalDeduction: 0 }, mode);
                expect({
                    rate: rate, mode: mode,
                    taxableIncome: r.taxableIncome,
                    applicable: recompute(r.taxableIncome).rate
                }).toEqual({
                    rate: rate, mode: mode,
                    taxableIncome: expect.any(Number),
                    applicable: rate / 100
                });
                expect(r.taxableIncome).toBeGreaterThan(0);
            });
        });
    });

    test('减免额永远非负 —— 这是所有 6 份旧实现里只有 2 份守住的规矩', () => {
        TAXABLES.forEach((t) => {
            expect(recompute(t).reduction).toBeGreaterThanOrEqual(0);
        });
        MODES.forEach((mode) => {
            TARGET_RATES.forEach((rate) => {
                const r = window.calculateBusinessFromTargetRate({ targetRate: rate }, { totalDeduction: 0 }, mode);
                expect(r.halvingTaxAmount).toBeGreaterThanOrEqual(0);
                expect(r.halvingTaxAmount).toBeLessThanOrEqual(recompute(r.taxableIncome).before + 1e-9);
            });
        });
    });
});

describe('七份实现彼此等价（不经参考实现，直接互对）', () => {
    test('倒算路径的 finalTotalTax ≡ businessTaxOf(同一 taxableIncome)', () => {
        const cases = [
            { name: 'targetRate', run: (mode) => window.calculateBusinessFromTargetRate({ targetRate: 35 }, { totalDeduction: 0 }, mode) },
            { name: 'monthlyNet', run: (mode) => window.calculateBusinessFromMonthlyNet({ monthlyNet: 20000, workMonths: 12 }, { totalDeduction: 0 }, mode) },
            { name: 'fixedTax', run: (mode) => window.calculateBusinessFromTargetTax({ fixedTax: 100000, fixedNet: -1 }, { totalDeduction: 0 }, mode) },
            { name: 'fixedNet', run: (mode) => window.calculateBusinessFromTargetTax({ fixedTax: -1, fixedNet: 240000 }, { totalDeduction: 0 }, mode) }
        ];
        cases.forEach((c) => {
            MODES.forEach((mode) => {
                const r = c.run(mode);
                near(r.finalTotalTax, window.businessTaxOf(r.taxableIncome), c.name + '/' + mode);
                near(r.finalTotalTax, Q().taxOf(r.taxableIncome).tax, c.name + '/' + mode + '/quick');
            });
        });
    });

    test('同一应纳税所得额，七条路径给同一个数（含 200 万封顶两侧）', () => {
        [100000, 2000000, 2000001, 3000000].forEach((t) => {
            const ref = recompute(t).tax;
            near(window.businessTaxOf(t), ref, 'businessTaxOf@' + t);
            near(Q().taxOf(t).tax, ref, 'quick@' + t);
            near(window.calculateBusinessTaxCore({
                income: t, cost: 0, expenses: 0, taxes: 0, losses: 0, otherExpenses: 0,
                previousLosses: 0, hasComprehensiveIncome: true, workMonths: 12, prepaidTax: 0
            }).taxDetails.totalTax, ref, 'core@' + t);
        });
    });
});
