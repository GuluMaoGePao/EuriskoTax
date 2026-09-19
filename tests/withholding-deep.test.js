// 劳务报酬预扣预缴的完整测算（阶段17 17D-1）的回归网
//
// 它守护的是三件事：
//   ① 与速算器**同源**：单笔输入下，完整测算算出的预扣税额 / 应纳税所得额 / 收入额
//      必须与 withholding-quick.js 逐点相等。这是「自带 spec 的 -deep」唯一的安全绳 ——
//      它不再与速算器共用同一个 compute 对象，同口径就只能靠对拍证明；
//   ② 「一次」的口径：预扣是**按次**的，同月合并与逐笔单独差出一档税。速算器表达不了
//      这一层，它是这个完整测算存在的理由，也是最容易被「顺手改成按总额算」的地方；
//   ③ 汇算算的是**增量**（合并找档后的年度税额之差），不是「收入额 × 边际税率」的线性估算 ——
//      后者在跨档时会整段算错，而「次年退不退得回来」全靠这个数。

const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/tax-calculator.js');       // 汇算增量走内核的 calculateTaxByTaxableIncome
    loadSource('src/js/calculation/withholding-quick.js');
    loadSource('src/js/calculation/utils.js');
    loadSource('src/js/data/tool-registry.js');
    loadSource('src/js/ui/toolbox-ui.js');
    loadSource('src/js/ui/deep-wizard-ui.js');
});

const R = () => window.EuriskoToolRegistry;
const W = () => window.EuriskoDeepWizard;
const Q = () => window.EuriskoWithholdingQuick;

function compute(values) {
    return R().get('withholding-deep').compute(Object.assign({
        type: 'labor',
        mergeByMonth: true,
        payments: [{ month: 1, amount: 30000 }],
        otherTaxable: 0
    }, values || {}));
}

function row(out, label) {
    const r = out.rows.find((x) => x.label === label);
    return r ? r.value : undefined;
}

describe('劳务报酬预扣预缴：与速算器同源（自带 spec 的对拍）', () => {
    test('单笔输入：预扣税额 / 应纳税所得额 / 收入额与速算器逐点相等', () => {
        const mirror = Q().compareOf('labor', 30000, 0.2);
        const out = compute({ payments: [{ month: 1, amount: 30000 }] });

        expect(out.primary.value).toBe(mirror.prepaid);                              // 5200
        expect(row(out, '全年预扣预缴个税合计')).toBe(mirror.prepaid);
        expect(row(out, '预扣应纳税所得额合计')).toBe(mirror.taxable);                // 24000
        expect(row(out, '并入综合所得的收入额')).toBe(mirror.income);                 // 24000
    });

    test('三类所得 × 多档金额：一律调同一个 quick 模块（税率表一改这里就红）', () => {
        const amounts = [800, 1000, 3000, 4000, 4001, 20000, 25000, 50000, 80000];
        Q().TYPES.forEach((type) => {
            amounts.forEach((amount) => {
                const out = compute({ type: type, payments: [{ month: 1, amount: amount }] });
                expect(row(out, '全年预扣预缴个税合计')).toBe(Q().taxOf(type, amount));
                expect(row(out, '预扣应纳税所得额合计')).toBe(Q().taxableOf(type, amount));
                expect(row(out, '并入综合所得的收入额')).toBe(Q().incomeOf(type, amount));
            });
        });
    });

    // 独立手算的一份（不 import quick）：防止「两边一起改」时对拍失去意义
    test('劳务报酬 3 万：减 20% 费用后 2.4 万，落 30% 档减 2000 = 5200', () => {
        const out = compute({ payments: [{ month: 1, amount: 30000 }] });
        expect(row(out, '收入合计')).toBe(30000);
        expect(row(out, '费用扣除合计')).toBe(6000);
        expect(row(out, '预扣应纳税所得额合计')).toBe(24000);
        expect(row(out, '全年预扣预缴个税合计')).toBe(24000 * 0.3 - 2000);
    });

    test('费用扣除是分档的：≤4000 减 800，>4000 减 20%', () => {
        expect(row(compute({ payments: [{ month: 1, amount: 4000 }] }), '预扣应纳税所得额合计')).toBe(3200);
        expect(row(compute({ payments: [{ month: 1, amount: 4000 }] }), '费用扣除合计')).toBe(800);
        expect(row(compute({ payments: [{ month: 1, amount: 4001 }] }), '预扣应纳税所得额合计')).toBeCloseTo(3200.8, 6);
    });

    test('稿酬：费用扣除后再减按 70%（实际按收入的 56% 并入）', () => {
        const out = compute({ type: 'author', payments: [{ month: 1, amount: 10000 }] });
        expect(row(out, '预扣应纳税所得额合计')).toBe(5600);       // (10000 − 2000) × 70%
        expect(row(out, '全年预扣预缴个税合计')).toBe(1120);       // × 20%
        expect(row(out, '并入综合所得的收入额')).toBe(5600);       // 10000 × 80% × 70%
        expect(row(out, '所得类型')).toBe('稿酬所得');
    });
});

describe('「一次」的口径：同月合并 vs 逐笔单独', () => {
    test('默认同月合并：两笔 2 万合成一次 4 万，按 30% 档预扣', () => {
        const out = compute({ payments: [{ month: 1, amount: 20000 }, { month: 1, amount: 20000 }] });
        expect(row(out, '计税次数')).toBe('1 次');
        expect(row(out, '收入合计')).toBe(40000);
        expect(row(out, '全年预扣预缴个税合计')).toBe(32000 * 0.3 - 2000);       // 7600
    });

    test('关掉合并：逐笔单独预扣 —— 多扣一次费用、多用一次低档税率', () => {
        const out = compute({
            mergeByMonth: false,
            payments: [{ month: 1, amount: 20000 }, { month: 1, amount: 20000 }]
        });
        expect(row(out, '计税次数')).toBe('2 次');
        expect(row(out, '全年预扣预缴个税合计')).toBe(3200 * 2);                 // 6400
        // 分着算更省，但**不是法定口径** —— 这个差就是「合并开关」存在的意义，别把它关成默认
        expect(6400).toBeLessThan(7600);
        // 收入额与汇算口径不受分次影响：汇算看的是全年收入额合计
        expect(row(out, '并入综合所得的收入额')).toBe(32000);
    });

    test('不同月份各算一次（同月才合并）', () => {
        const out = compute({ payments: [{ month: 1, amount: 20000 }, { month: 2, amount: 20000 }] });
        expect(row(out, '计税次数')).toBe('2 次');
        expect(row(out, '全年预扣预缴个税合计')).toBe(6400);
    });

    test('明细表逐次一行：收入 / 减除费用后 / 预扣率 / 速算扣除 / 预扣税额', () => {
        const out = compute({ payments: [{ month: 3, amount: 20000 }, { month: 5, amount: 30000 }] });
        const table = out.extras[0].table;
        expect(table.rows).toHaveLength(2);
        expect(table.rows[0][0]).toBe('第 3 月');
        expect(table.rows[1][5]).toEqual({ value: 5200, kind: 'money' });
    });

    test('填了一半的空条目不进预扣表', () => {
        const out = compute({ payments: [{ month: 1, amount: 0 }] });
        expect(out.primary.value).toBe(0);
        expect(out.rows).toEqual([]);
        expect(out.note).toContain('还没有有效条目');
    });
});

describe('汇算：并入综合所得后的补退税', () => {
    test('全年只有这笔收入：预扣 30% 档，汇算落在 3%，能退一笔', () => {
        const out = compute({ payments: [{ month: 1, amount: 30000 }], otherTaxable: 0 });
        expect(row(out, '汇算后的增量税负')).toBe(24000 * 0.03);       // 720
        expect(row(out, '汇算差额')).toBe(720 - 5200);                 // −4480
        expect(row(out, '汇算方向')).toBe('汇算可退税');
    });

    test('已有其他综合所得：按合并后的档位算增量，不是「收入额 × 边际税率」', () => {
        // 29 万落 20% 档（减 16920），并入 2.4 万后 31.4 万跨到 25% 档（减 31920）——
        // 增量 5500，既不是 24000 × 20%（4800）也不是 24000 × 25%（6000）
        const out = compute({ payments: [{ month: 1, amount: 30000 }], otherTaxable: 290000 });
        expect(row(out, '汇算后的增量税负')).toBe(5500);
        expect(row(out, '汇算差额')).toBe(300);
        expect(row(out, '汇算方向')).toBe('汇算需补税');
    });

    test('汇算差额 = 增量税负 − 预扣合计（符号不能反）', () => {
        const out = compute({
            payments: [{ month: 1, amount: 30000 }, { month: 2, amount: 30000 }],
            otherTaxable: 290000
        });
        expect(row(out, '全年预扣预缴个税合计')).toBe(10400);
        // 收入额 48000 → 29 万 + 4.8 万 = 33.8 万，**跨了档**：1 万留在 20% 档、3.8 万进 25% 档
        //   → 10000 × 20% + 38000 × 25% = 11500。
        //   线性估算在这道题上两头不靠：按 20% 得 9600、按 25% 得 12000，真值 11500 ——
        //   这正是「汇算必须算增量」的反例，别把它改回收入额 × 边际税率
        expect(row(out, '汇算后的增量税负')).toBe(11500);
        expect(row(out, '汇算差额')).toBe(1100);
    });
});

describe('走向导：由 spec 驱动（不是页面、也不是速算器的复制品）', () => {
    beforeEach(() => {
        localStorage.clear();
        window.showPage = jest.fn();
        document.body.innerHTML = '<div id="deep-wizard-page" class="page hidden"></div>';
    });

    test('被通用向导接管：所得类型 → 发放明细 → 汇算口径 → 结果', () => {
        const tool = R().get('withholding-deep');
        expect(W().has(tool)).toBe(true);
        expect(tool.pageId).toBeUndefined();
        const titles = W().stepsOf(tool).map((s) => s.title);
        expect(titles).toEqual(['所得类型', '发放明细', '汇算口径', '计算结果']);
    });

    test('自带 spec，没有被同名速算器的 fields / compute 覆盖', () => {
        const deep = R().get('withholding-deep');
        const quick = R().get('withholding');
        expect(deep.compute).not.toBe(quick.compute);
        expect(deep.fields).not.toBe(quick.fields);
        expect(deep.fields.map((f) => f.key)).toEqual(['type', 'mergeByMonth', 'payments', 'otherTaxable']);
        expect(deep.steps).toHaveLength(3);
        // 政策时效仍然指向同一条登记（到期提醒不能因为另写了一份 spec 就丢）
        expect(deep.policyKey).toBe('withholding');
    });

    function toResult() {
        W().open('withholding-deep', { fresh: true });
        for (let i = 0; i < 10; i++) {
            const next = document.getElementById('dw-next');
            if (!next) break;
            next.click();
            if (document.getElementById('dw-result-card')) break;
        }
    }

    test('走完向导：主结果、逐次明细表、免责声明与结果归属都在', () => {
        toResult();
        expect(document.getElementById('dw-result-primary')).toBeTruthy();
        expect(document.querySelector('.result-disclaimer').textContent).toContain('不构成税务建议');

        const card = document.getElementById('dw-result-card');
        expect(card.textContent).toContain('逐次预扣预缴明细');
        // 留资归因 / 分享图 / 埋点都靠它认人：认错了会算到别的工具头上
        expect(card.getAttribute('data-tool-id')).toBe('withholding-deep');
    });

    test('发放明细是 repeater：默认一笔，能加也能删', () => {
        W().open('withholding-deep', { fresh: true });
        // 第一步是所得类型，先走到第二步
        document.getElementById('dw-next').click();
        const rows = () => document.querySelectorAll('[data-dw-rep-of="payments"]');
        expect(rows()).toHaveLength(1);

        document.getElementById('qf-payments-0-amount').value = '12345';
        document.getElementById('dw-rep-add-payments').click();
        expect(rows()).toHaveLength(2);
        expect(document.getElementById('qf-payments-0-amount').value).toBe('12345');

        document.querySelector('[data-dw-rep-of="payments"] [data-dw-rep-remove]').click();
        expect(rows()).toHaveLength(1);
    });
});
