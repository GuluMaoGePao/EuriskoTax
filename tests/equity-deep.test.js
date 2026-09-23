// 股权激励的完整测算（阶段17 17D-3）的回归网
//
// 它守护的是四件速算器做不到、而用户真正需要的事：
//   ① **多批次明细**：速算器 `equity` 只认一个行权日、一个价差，「一年内多次行权」只能靠
//      一个标量 `ytdIncome` 手工先加好再填进来。完整测算按批次收，合并成一个基数一次性定档；
//   ② **分次各自定档 vs 合并定档的差额**：法定是合并（`combineWithinYear: true`），而
//      「每批各从低档起算」会**少算税** —— 那个差额就是汇算要补（还可能加滞纳金）的数。
//      速算器永远只算合并，这一层它根本表达不出来；
//   ③ **递延纳税 20%**（非上市公司，财税〔2016〕101 号）：`equityIncentiveRules.deferred`
//      这个常量一直存在，quick 模块里却没有任何函数用它 —— 这里补上「行权时不缴、转让时按
//      财产转让所得 20%」的对照，税率读常量不写死；
//   ④ **跨年度行权**：合并只在同一个纳税年度内成立，分到两个年度各自定档 —— 行权窗口还能
//      自选时这是唯一合法的降档路径。枚举「前 k 批当年、其余次年」即可，不需搜索。
//
// 另有一条**反直觉**的知识点被钉住：这里适用的是**超额累进的年度税率表**，
// 所以**没有**年终奖那种「多发 1 元到手反而变少」的雷区（年终奖的雷区来自
// 「÷ 12 定档、全额乘税率」的月度换算表）。

const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/tax-calculator.js');       // 综合所得部分走内核
    loadSource('src/js/calculation/equity-incentive-quick.js');
    loadSource('src/js/calculation/utils.js');
    loadSource('src/js/data/tool-registry.js');
    loadSource('src/js/ui/toolbox-ui.js');
    loadSource('src/js/ui/deep-wizard-ui.js');
});

const R = () => window.EuriskoToolRegistry;
const W = () => window.EuriskoDeepWizard;
const Q = () => window.EuriskoEquityQuick;

const ONE = [{ month: 3, type: 'option', qty: 10000, price: 20, cost: 10, grantPrice: 15 }];

function compute(values) {
    return R().get('equity-deep').compute(Object.assign({
        otherTaxable: 60000, grants: ONE, deferred: false, plannable: false
    }, values || {}));
}

function row(out, label) {
    const r = out.rows.find((x) => x.label === label);
    return r ? r.value : undefined;
}

describe('与速算器同源：单批输入下逐点相等', () => {
    test('primary / 税额 / 税率 —— 一律调同一个 quick 模块', () => {
        const out = compute({});
        expect(out.primary.value).toBe(7480 + 3480);                 // 单独计税 7480 + 其他所得 3480
        expect(row(out, '现行：股权激励应纳个税')).toBe(Q().taxSeparateOf(100000));
        expect(row(out, '合并后适用税率')).toBe(Q().bracketOf(100000).rate);
    });

    test('与速算器 compareOf 逐字段对拍（四种形式各一次）', () => {
        [
            { type: 'option', qty: 10000, price: 20, cost: 10 },
            { type: 'restricted', qty: 20000, price: 20, cost: 5, grantPrice: 10 },
            { type: 'appreciation', qty: 50000, price: 20, cost: 8 },
            { type: 'award', qty: 10000, price: 8, cost: 0 }
        ].forEach((g) => {
            const out = compute({ grants: [Object.assign({ month: 5 }, g)] });
            const quick = Q().compareOf(Object.assign({ ytdIncome: 0, otherTaxable: 60000 }, g));
            expect(row(out, '股权激励收入合计（合并基数）')).toBe(quick.income);
            expect(row(out, '现行：股权激励应纳个税')).toBe(quick.separate);
            expect(row(out, '现行：全年个税合计')).toBe(quick.separateTotal);
            expect(row(out, '若并入综合所得（对照）')).toBe(quick.mergedTotal);
            expect(row(out, '并入差额')).toBe(quick.gap);
            expect(out.primary.value).toBe(quick.separateTotal);
        });
    });

    // 四种形式的公式不复制：收入额逐点对拍 quick（限制性股票是登记日与解禁日的均价）
    test('收入额走 quick.incomeOf，四种形式一个公式都没抄', () => {
        expect(row(compute({ grants: [{ month: 1, type: 'restricted', qty: 20000, price: 20, cost: 5, grantPrice: 10 }] }),
            '股权激励收入合计（合并基数）')).toBe(200000);        // ((10+20)/2 − 5) × 20000
        expect(row(compute({ grants: [{ month: 1, type: 'option', qty: 10000, price: 15, cost: 5 }] }),
            '股权激励收入合计（合并基数）')).toBe(100000);
    });
});

describe('分次各自定档会少算税：速算器表达不出来的那一层', () => {
    const TWO = [
        { month: 3, type: 'option', qty: 5000, price: 20, cost: 10 },
        { month: 10, type: 'option', qty: 5000, price: 20, cost: 10 }
    ];

    test('两批各 5 万：合并 7480、分次 4960 → 少算 2520', () => {
        const out = compute({ grants: TWO });
        expect(row(out, '股权激励收入合计（合并基数）')).toBe(100000);
        expect(row(out, '现行：股权激励应纳个税')).toBe(100000 * 0.1 - 2520);      // 7480
        expect(row(out, '若按批各自定档（错误口径）')).toBe(2 * (50000 * 0.1 - 2520)); // 4960
        expect(row(out, '分次算会少算（汇算要补）')).toBe(2520);
    });

    test('只有一批时：两个口径自然相等，不误报差额', () => {
        const out = compute({ grants: ONE });
        expect(row(out, '分次算会少算（汇算要补）')).toBe(0);
        expect(out.note).not.toContain('少算');
        expect(out.note).toContain('没有');   // 顺带讲清「这里没有雷区」
    });

    test('结论区点名「要补多少」', () => {
        const out = compute({ grants: TWO });
        expect(out.note).toContain('少算');
        expect(out.note).toContain('2520');
    });

    test('批次明细表：按月份排序，逐批给出「若单独定档」', () => {
        const table = compute({ grants: TWO }).extras[0].table;
        expect(table.head).toEqual(['月份', '形式', '数量', '股权激励收入', '若单独定档的税', '占合并基数']);
        expect(table.rows.map((r) => r[0])).toEqual(['3 月', '10 月']);
        expect(table.rows[0][3].value).toBe(50000);
        expect(table.rows[0][4].value).toBe(50000 * 0.1 - 2520);
        expect(table.rows[0][5].value).toBeCloseTo(0.5, 9);
    });
});

describe('没有雷区：超额累进的年度表不会「多发 1 元到手变少」', () => {
    test('六个分界点处多发 1 元，税的增加都小于 1 元（边际税率恒 < 100%）', () => {
        [36000, 144000, 300000, 420000, 660000, 960000].forEach((t) => {
            const jump = Q().taxSeparateOf(t + 1) - Q().taxSeparateOf(t);
            expect(jump).toBeGreaterThan(0);
            expect(jump).toBeLessThan(1);
            // 到手金额因此单调递增 —— 与年终奖（36000 处跳 2310 元、到手倒挂）是两回事
            expect((t + 1) - Q().taxSeparateOf(t + 1)).toBeGreaterThan(t - Q().taxSeparateOf(t));
        });
    });

    test('与年终奖那张月度换算表对照：同样 3.6 万，年终奖有雷区、股权激励没有', () => {
        loadSource('src/js/calculation/bonus-tax-quick.js');
        const bonusJump = window.EuriskoBonusQuick.taxOf(36001) - window.EuriskoBonusQuick.taxOf(36000);
        expect(bonusJump).toBeGreaterThan(2000);                       // 年终奖：跳档 2310 元
        expect(Q().taxSeparateOf(36001) - Q().taxSeparateOf(36000)).toBeLessThan(1);
    });
});

describe('递延纳税 20%（非上市公司）：常量一直在，quick 里没人用', () => {
    test('转让价高时递延更贵（税基是转让价减取得成本，不是行权价差）', () => {
        const out = compute({ deferred: true, exitPrice: 30 });
        expect(row(out, '递延：转让时应纳税额（20%）')).toBe((30 - 10) * 10000 * 0.2);   // 40000
        expect(row(out, '递延相对单独计税')).toBe(40000 - 7480);
        expect(out.extras[1].table.rows).toHaveLength(4);              // 多一行「递延」
    });

    test('转让价贴着成本时递延更省 —— 两种口径都可能占优', () => {
        const out = compute({ deferred: true, exitPrice: 11 });
        expect(row(out, '递延：转让时应纳税额（20%）')).toBe((11 - 10) * 10000 * 0.2);   // 2000
        expect(row(out, '递延相对单独计税')).toBe(2000 - 7480);        // 负数 = 递延更省
    });

    test('税率读常量而不是写死 0.2', () => {
        expect(Q().rules().deferred.rate).toBe(0.2);
        const out = compute({ deferred: true, exitPrice: 20 });
        expect(row(out, '递延：转让时应纳税额（20%）')).toBe((20 - 10) * 10000 * Q().rules().deferred.rate);
    });

    test('不开开关就没有递延那两行', () => {
        const out = compute({ deferred: false });
        expect(row(out, '递延：转让时应纳税额（20%）')).toBeUndefined();
        expect(out.extras[1].table.rows).toHaveLength(3);
    });
});

describe('跨年度行权：合并只在同一纳税年度内成立', () => {
    const TWO = [
        { month: 3, type: 'option', qty: 5000, price: 20, cost: 10 },
        { month: 10, type: 'option', qty: 5000, price: 20, cost: 10 }
    ];

    test('两批各 5 万：分到两个年度 4960，比全在当年 7480 省 2520', () => {
        const out = compute({ grants: TWO, plannable: true });
        expect(row(out, '最优：当年行权批次')).toBe('1 / 2');
        expect(row(out, '最优：股权激励个税合计')).toBe(2 * (50000 * 0.1 - 2520));
        expect(row(out, '相对全部在当年可省')).toBe(2520);
    });

    test('候选表按税额升序，三种切法都在（全当年 / 全次年 / 一前一后）', () => {
        const table = compute({ grants: TWO, plannable: true }).extras[2].table;
        expect(table.rows).toHaveLength(3);
        expect(table.rows[0][4]).toBe('最优');
        for (let i = 1; i < table.rows.length; i++) {
            expect(table.rows[i][3].value).toBeGreaterThanOrEqual(table.rows[i - 1][3].value - 1e-9);
        }
        const descs = table.rows.map((r) => r[0]);
        expect(descs.some((d) => d.indexOf('全部在当年') >= 0)).toBe(true);
        expect(descs.some((d) => d.indexOf('全部推到次年') >= 0)).toBe(true);
    });

    test('最优一定不劣于「全部在当年」', () => {
        [[5000, 5000], [20000, 3000], [1000, 1000, 1000]].map((qs) => qs.map((q) => ({
            month: 1, type: 'option', qty: q, price: 20, cost: 10
        }))).forEach((grants) => {
            const out = compute({ grants: grants, plannable: true });
            expect(row(out, '最优：股权激励个税合计'))
                .toBeLessThanOrEqual(row(out, '现行：股权激励应纳个税') + 1e-9);
            expect(row(out, '相对全部在当年可省')).toBeGreaterThanOrEqual(-1e-9);
        });
    });

    test('不开开关 / 只有一批时：不给候选表', () => {
        expect(compute({ grants: TWO, plannable: false }).extras).toHaveLength(2);
        expect(compute({ grants: ONE, plannable: true }).extras).toHaveLength(2);
    });
});

describe('走向导：由 spec 驱动', () => {
    beforeEach(() => {
        localStorage.clear();
        window.showPage = jest.fn();
        document.body.innerHTML = '<div id="deep-wizard-page" class="page hidden"></div>';
    });

    test('被通用向导接管：全年口径 → 激励批次 → 递延与行权安排 → 结果', () => {
        const tool = R().get('equity-deep');
        expect(W().has(tool)).toBe(true);
        expect(tool.pageId).toBeUndefined();
        expect(W().stepsOf(tool).map((s) => s.title))
            .toEqual(['全年口径', '激励批次', '递延与行权安排', '计算结果']);
    });

    test('自带 spec，没有被孪生速算器覆盖', () => {
        const deep = R().get('equity-deep');
        const quick = R().get('equity');
        expect(deep.compute).not.toBe(quick.compute);
        expect(deep.fields).not.toBe(quick.fields);
        expect(deep.fields.map((f) => f.key))
            .toEqual(['otherTaxable', 'grants', 'deferred', 'exitPrice', 'plannable']);
        expect(deep.fields.find((f) => f.key === 'grants').type).toBe('repeater');
        expect(deep.steps).toHaveLength(3);
        expect(deep.policyKey).toBe('equity-incentive');   // 时效提醒仍指向同一条登记
    });

    test('走完向导：主结果、批次明细表、免责声明、结果归属都在', () => {
        W().open('equity-deep', { fresh: true });
        for (let i = 0; i < 10; i++) {
            const next = document.getElementById('dw-next');
            if (!next) break;
            next.click();
            if (document.getElementById('dw-result-card')) break;
        }
        expect(document.getElementById('dw-result-primary')).toBeTruthy();
        expect(document.querySelector('.result-disclaimer').textContent).toContain('不构成税务建议');

        const card = document.getElementById('dw-result-card');
        expect(card.textContent).toContain('本年批次明细');
        expect(card.textContent).toContain('四种口径逐项对比');
        expect(card.getAttribute('data-tool-id')).toBe('equity-deep');
    });
});
