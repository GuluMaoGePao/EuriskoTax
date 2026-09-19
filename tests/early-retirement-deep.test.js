// 提前退休 / 内部退养一次性收入（阶段17 17D-5）的回归网
//
// 它守护的是四件速算器做不到、而用户真正需要的事：
//   ① **分摊年数 / 所属月份数是法定的**：速算器把 `years` / `months` 当成两个自由填写的框（min:1），
//      而 164 号文写的是「办理提前退休手续至法定离退休年龄之间的**实际年度数**」。多填年数就能
//      少交税（56 万按法定 7 年交 4200，按 10 年交 0）—— 这是这条政策最容易被钻的空子；
//   ② **免税额度三种三种都不同**：提前退休 = 6 万 × 分摊年数（**随年数线性增长**）、
//      离职补偿 = 社平年工资 × 3（**固定**）、内部退养 = **没有**（只减一次 5000）。
//      同一笔 56 万：提前退休 4200、内退 55890、离职补偿 23080 —— 差出一个数量级；
//   ③ **内部退养有巨大的临界区**：它与年终奖共用**月度**表定档，但税基是「当月工资 + 一次性收入
//      **全额**」—— 定档基数跨档时多发 1 元可能多交上万元税（84 个月、工资 6000 时，
//      一次性收入从 168000 加到 168001，税从 5070 跳到 16690，**多交 11620**）；
//      提前退休用连续的年度累进表，**没有**雷区（与股权激励同理）；
//   ④ 提前退休的补贴**不并入**当年综合所得（56 万并入会多交 125400）。
// 口径仍同源：两种情形一律调 `EuriskoEarlyRetirementQuick`，横向对照的「离职补偿口径」调
// `EuriskoSeveranceQuick`（复用 17D-4 那条「法定上限恰好等于免税额度」的恒等式）。

const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/tax-calculator.js');       // 年度表由内核出
    loadSource('src/js/calculation/bonus-tax-quick.js');      // 月度表定档（internalOf 内部要用）
    loadSource('src/js/calculation/severance-quick.js');      // 横向对照里的第三口径
    loadSource('src/js/calculation/early-retirement-quick.js');
    loadSource('src/js/calculation/utils.js');
    loadSource('src/js/data/tool-registry.js');
    loadSource('src/js/ui/toolbox-ui.js');
    loadSource('src/js/ui/deep-wizard-ui.js');
});

const R = () => window.EuriskoToolRegistry;
const W = () => window.EuriskoDeepWizard;
const Q = () => window.EuriskoEarlyRetirementQuick;

function compute(values) {
    return R().get('early-retirement-deep').compute(Object.assign({
        variant: 'early', age: 53, legalAge: 60,
        subsidy: 560000, lumpSum: 300000, monthlySalary: 6000,
        otherTaxable: 60000, claimedYears: 10, avgWage: 120000
    }, values || {}));
}

function row(out, label) {
    const r = out.rows.find((x) => x.label === label);
    return r ? r.value : undefined;
}

describe('与速算器同源：折算出的年数传给 quick，逐点相等', () => {
    test('提前退休：法定 55 → 60 是 5 年，与速算器直接填 years=5 完全一致', () => {
        const out = compute({ variant: 'early', age: 55, legalAge: 60, subsidy: 560000 });
        const quick = Q().earlyOf({ subsidy: 560000, years: 5 });
        expect(quick.perYear).toBe(112000);
        expect(quick.taxPerYear).toBe(2680);          // (112000 − 60000) × 10% − 2520
        expect(quick.tax).toBe(13400);                // 2680 × 5
        expect(row(out, '每年分摊额')).toBe(quick.perYear);
        expect(row(out, '分摊后年应纳税所得额')).toBe(quick.taxablePerYear);
        expect(row(out, '适用税率')).toBe(quick.rate);
        expect(row(out, '每年税额')).toBe(quick.taxPerYear);
        expect(row(out, '应纳个税合计')).toBe(quick.tax);
        expect(row(out, '若不分摊（错误算法）')).toBe(quick.naiveTax);
        expect(row(out, '分摊省下的税')).toBe(quick.spreadSaving);
        expect(out.primary.value).toBe(quick.tax);
    });

    test('内部退养：法定 55 → 60 是 60 个月，与速算器直接填 months=60 完全一致', () => {
        const out = compute({ variant: 'internal', age: 55, legalAge: 60, lumpSum: 300000, monthlySalary: 6000 });
        const quick = Q().internalOf({ lumpSum: 300000, months: 60, monthlySalary: 6000 });
        expect(quick.monthly).toBe(5000);
        expect(quick.base).toBe(6000);                // 5000 + 6000 − 5000
        expect(quick.taxable).toBe(301000);           // 全额不摊
        expect(quick.tax).toBe(29890);                // 301000 × 10% − 210
        expect(row(out, '月均额（仅用于定档）')).toBe(quick.monthly);
        expect(row(out, '定档基数（月均 + 当月工资 − 5000）')).toBe(quick.base);
        expect(row(out, '计税基数（全额不摊）')).toBe(quick.taxable);
        expect(row(out, '应纳个税')).toBe(quick.tax);
        expect(row(out, '若误按「月均 × 月数」算')).toBe(quick.naiveTax);
        expect(row(out, '少算的税额')).toBe(quick.naiveGap);
        expect(out.primary.value).toBe(quick.tax);
    });

    test('含小数的年龄也能折算：52.5 岁 → 60 岁是 7.5 年 / 90 个月', () => {
        const out = compute({ variant: 'internal', age: 52.5, legalAge: 60 });
        expect(row(out, '所属月份数（法定折算）')).toBe(90);
        expect(row(out, '月均额（仅用于定档）')).toBe(300000 / 90);
    });
});

describe('分摊年数按法定实际期间算，不能自己选', () => {
    test('56 万按法定 7 年交 4200；自行填 10 年算出 0 —— 少算 4200', () => {
        const out = compute({ variant: 'early', age: 53, legalAge: 60, subsidy: 560000, claimedYears: 10 });
        expect(row(out, '分摊年度数（法定实际年度数）')).toBe(7);
        expect(row(out, '每年分摊额')).toBe(80000);
        expect(row(out, '分摊后年应纳税所得额')).toBe(20000);
        expect(row(out, '应纳个税合计')).toBe(4200);        // (80000 − 60000) × 3% × 7
        expect(row(out, '若不分摊（错误算法）')).toBe(97080); // T(50 万)
        expect(row(out, '分摊省下的税')).toBe(92880);
        expect(row(out, '若按你填的 10 年分摊')).toBe(0);    // 56000 < 6 万
        expect(row(out, '自行填年数的差额')).toBe(4200);
        expect(out.note).toContain('不能自己选');
        expect(out.note).toContain('少算 4200');
    });

    test('填的年数比法定短，则多算税（差额为负）', () => {
        const out = compute({ variant: 'early', age: 53, legalAge: 60, subsidy: 560000, claimedYears: 5 });
        expect(row(out, '若按你填的 5 年分摊')).toBe(13400);
        expect(row(out, '自行填年数的差额')).toBe(4200 - 13400);
    });

    test('办理时已满法定退休年龄 → 不构成提前退休，直接点出来', () => {
        const out = compute({ variant: 'early', age: 61, legalAge: 60, subsidy: 560000 });
        expect(out.note).toContain('不构成');
    });
});

describe('免税额度三种三种都不同：同一笔 56 万差出一个数量级', () => {
    test('提前退休 4200 / 内部退养 55890 / 离职补偿 23080', () => {
        const table = compute({ variant: 'early', age: 53, legalAge: 60, subsidy: 560000 }).extras[0].table;
        expect(table.head).toEqual(['口径', '应纳税额', '免税额度', '计税方法']);
        expect(table.rows[0][1].value).toBe(4200);        // 6 万 × 7 以内免，超额按年分摊
        expect(table.rows[1][1].value).toBe(55890);       // 561000 × 10% − 210
        expect(table.rows[2][1].value).toBe(23080);       // (56 万 − 36 万) × 20% − 16920
        // 免税额度：一个随年数线性增长、一个没有、一个是固定的
        expect(table.rows[0][2].value).toBe(420000);      // 6 万 × 7
        expect(table.rows[1][2]).toBe('无（只减一次 5000）');
        expect(table.rows[2][2].value).toBe(360000);      // 社平年工资 × 3
    });

    test('提前退休的免税额度 = 6 万 × 分摊年数：补贴不超过它就一分钱税都不用交', () => {
        const out = compute({ variant: 'early', age: 53, legalAge: 60, subsidy: 420000, claimedYears: 7 });
        expect(row(out, '免税额度（6 万 × 分摊年数）')).toBe(420000);
        expect(row(out, '应纳个税合计')).toBe(0);
        expect(out.note).toContain('免税额度 = 6 万 × 7');
    });

    test('内部退养没有免税额度：即便月均额很低，税基仍是全额', () => {
        const out = compute({ variant: 'internal', age: 53, legalAge: 60, lumpSum: 84000, monthlySalary: 6000 });
        expect(row(out, '免税额度')).toBe('无（只减一次 5000）');
        expect(row(out, '月均额（仅用于定档）')).toBe(1000);
        expect(row(out, '计税基数（全额不摊）')).toBe(85000);    // 6000 + 84000 − 5000
        expect(row(out, '应纳个税')).toBeGreaterThan(0);
    });
});

describe('内部退养的临界区：多发 1 元可能多交上万元', () => {
    test('84 个月、工资 6000：一次性收入 168000 → 168001，税从 5070 跳到 16690', () => {
        const at = compute({ variant: 'internal', age: 53, legalAge: 60, lumpSum: 168000, monthlySalary: 6000 });
        const over = compute({ variant: 'internal', age: 53, legalAge: 60, lumpSum: 168001, monthlySalary: 6000 });
        expect(row(at, '应纳个税')).toBe(169000 * 0.03);
        expect(row(over, '应纳个税')).toBeCloseTo(169001 * 0.1 - 210, 6);
        expect(row(over, '应纳个税') - row(at, '应纳个税')).toBeGreaterThan(11619);
        // 到手反而更少
        expect((168001 - row(over, '应纳个税'))).toBeLessThan(168000 - row(at, '应纳个税'));
    });

    test('临界区表给出「一次性收入临界」与「建议定在」', () => {
        const table = compute({ variant: 'internal', age: 53, legalAge: 60, lumpSum: 300000 }).extras[1].table;
        expect(table.head).toEqual(['月度档上限', '一次性收入临界', '多发 1 元多交', '建议定在']);
        expect(table.rows).toHaveLength(6);
        expect(table.rows[0][1].value).toBe(168000);     // (3000 − 6000 + 5000) × 84
        expect(table.rows[0][3].value).toBe(168000);
        expect(table.rows[1][1].value).toBe(924000);     // (12000 − 1000) × 84
    });

    test('刚跨过临界点时，结论区直接点名「该定在多少」', () => {
        const out = compute({ variant: 'internal', age: 53, legalAge: 60, lumpSum: 170000, monthlySalary: 6000 });
        expect(out.note).toContain('刚跨过');
        expect(out.note).toContain('168000');
    });
});

describe('提前退休用连续的年度表，没有雷区（与内部退养相反）', () => {
    test('补贴每多 1 元，税额的增量不超过 1 元 —— 不存在跳档', () => {
        const base = compute({ variant: 'early', age: 53, legalAge: 60, subsidy: 560000 });
        let prev = row(base, '应纳个税合计');
        for (let s = 560001; s <= 560200; s++) {
            const tax = row(compute({ variant: 'early', age: 53, legalAge: 60, subsidy: s }), '应纳个税合计');
            expect(tax - prev).toBeGreaterThanOrEqual(0);
            expect(tax - prev).toBeLessThanOrEqual(1);
            prev = tax;
        }
    });

    test('内部退养在同样的扫描里就会跳（对照）', () => {
        let jumped = false;
        let prev = row(compute({ variant: 'internal', age: 53, legalAge: 60, lumpSum: 168000 - 100 }), '应纳个税');
        for (let s = 168000 - 99; s <= 168000 + 2; s++) {
            const tax = row(compute({ variant: 'internal', age: 53, legalAge: 60, lumpSum: s }), '应纳个税');
            if (tax - prev > 1) jumped = true;
            prev = tax;
        }
        expect(jumped).toBe(true);
    });
});

describe('提前退休的补贴不并入当年综合所得', () => {
    test('56 万并入会多交 125400', () => {
        const out = compute({ variant: 'early', age: 53, legalAge: 60, subsidy: 560000, otherTaxable: 60000 });
        expect(row(out, '若并入当年综合所得（错误口径）')).toBe(133080 - 3480);   // T(62 万) − T(6 万)
        expect(row(out, '并入会多交')).toBe(125400);
        expect(out.note).toContain('不并入');
    });
});

describe('走向导：由 spec 驱动', () => {
    beforeEach(() => {
        localStorage.clear();
        window.showPage = jest.fn();
        document.body.innerHTML = '<div id="deep-wizard-page" class="page hidden"></div>';
    });

    test('被通用向导接管：情形与时间点 → 一次性收入 → 对照 → 结果', () => {
        const tool = R().get('early-retirement-deep');
        expect(W().has(tool)).toBe(true);
        expect(tool.pageId).toBeUndefined();
        expect(W().stepsOf(tool).map((s) => s.title))
            .toEqual(['情形与时间点', '一次性收入', '对照', '计算结果']);
    });

    test('自带 spec，没有被孪生速算器覆盖', () => {
        const deep = R().get('early-retirement-deep');
        const quick = R().get('early-retirement');
        expect(deep.compute).not.toBe(quick.compute);
        expect(deep.fields).not.toBe(quick.fields);
        expect(deep.fields.map((f) => f.key)).toEqual([
            'variant', 'age', 'legalAge', 'subsidy', 'lumpSum',
            'monthlySalary', 'otherTaxable', 'claimedYears', 'avgWage'
        ]);
        expect(deep.steps).toHaveLength(3);
        expect(deep.policyKey).toBe('early-retirement');    // 时效提醒仍指向同一条登记
    });

    test('走完向导：主结果、三口径对照、免责声明、结果归属都在', () => {
        W().open('early-retirement-deep', { fresh: true });
        for (let i = 0; i < 10; i++) {
            const next = document.getElementById('dw-next');
            if (!next) break;
            next.click();
            if (document.getElementById('dw-result-card')) break;
        }
        expect(document.getElementById('dw-result-primary')).toBeTruthy();
        expect(document.querySelector('.result-disclaimer').textContent).toContain('不构成税务建议');

        const card = document.getElementById('dw-result-card');
        expect(card.textContent).toContain('同一笔一次性收入的三种口径');
        expect(card.getAttribute('data-tool-id')).toBe('early-retirement-deep');
    });

    test('切到内部退养后，临界区表出现', () => {
        W().open('early-retirement-deep', { fresh: true });
        document.getElementById('qf-variant').value = 'internal';
        document.getElementById('qf-variant').dispatchEvent(new Event('change'));
        for (let i = 0; i < 10; i++) {
            const next = document.getElementById('dw-next');
            if (!next) break;
            next.click();
            if (document.getElementById('dw-result-card')) break;
        }
        expect(document.getElementById('dw-result-card').textContent).toContain('内部退养的临界区');
    });
});
