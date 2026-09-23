// v1.98.0 · 方案库口径补齐（清偿 19-5b 遗留）
//
// 19-5b 交付说明里的原话：方案库那张对比表只覆盖综合所得口径，速算器存进去后缺的指标
// 会被 fmtValue 补成 ¥0.00 —— 那是假数据，比没有更糟。所以当时速算器没接方案库，
// 改成跟同工具的上一次测算比（taxCalculationHistory）。
//
// 现在方案按**工具自己的口径**存指标（主结果 + 明细行），对比时取交集。这里钉四条：
//   ① 不编数 —— 取不到的指标显示 -，绝不补 ¥0.00；
//   ② 跨工具不硬凑 —— 指标对不上就各列各的，不摆一张"看起来能比"的表，也不猜哪头更好
//      （新指标一律不打「最优」：应退税额越大越好、应纳增值税越小越好，猜错就是把错的标成最优）；
//   ③ 老方案照旧 —— v1.98.0 前存的（只有 summary）照样显示、照样可比，不写迁移脚本；
//   ④ 存了要能拿回来 —— 载入把那份输入带回对应测算，分发复用 18-2 那条（不新写一份 if）。

const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    global.window = global;
    loadSource('src/js/calculation/solver.js');
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/tax-calculator.js');
    loadSource('src/js/calculation/tax-registry.js');   // 速算器的 compute 读这里的常量
    loadSource('src/js/calculation/utils.js');
    loadSource('src/js/calculation/salary-tax-quick.js');  // 见 quickFixture：速算器的 compute 转调它
    loadSource('src/js/data/tool-registry.js');
    loadSource('src/js/data/scenario-store.js');
    loadSource('src/js/ui/scenario-ui.js');
});

beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
});

const P = () => window.EuriskoScenarioUI.pure;
const S = () => window.EuriskoScenarios;

function outOf(primaryLabel, rows) {
    return {
        primary: { label: primaryLabel, value: 1200, kind: 'money' },
        rows: rows || [],
        note: ''
    };
}

function saveTool(toolId, out, values) {
    return S().save({
        name: '方案',
        toolId: toolId,
        toolName: toolId,
        input: values || {},
        metrics: S().pure.buildMetrics(out)
    }, { isPro: true });
}

// 一个真算得出来的速算器（月薪个税）。
// 为什么点名这一个：速算器的 compute 转调 window.EuriskoSalaryQuick 那批模块，测试环境得
// 显式加载（上面 loadSource 了 salary-tax-quick.js）—— 别的速算器要各自的 quick 模块，
// 为了这一条断言把 20 个全加载不划算。入参取 tests/batch.test.js 对拍用的那一组。
function quickFixture() {
    const t = window.EuriskoToolRegistry.get('salary-tax');
    const values = { monthlyIncome: 18000, months: 6, monthlyInsurance: 2200, monthlySpecialAdditional: 1500 };
    let out = null;
    try { out = t.compute(values); } catch (e) { out = null; }
    if (!out || !out.primary) return null;
    return { tool: t, values: values, out: out };
}

// ====== ① 不编数 ======
describe('指标生成：取不到就是取不到', () => {
    test('主结果排第一，明细行按原序跟在后面', () => {
        const ms = S().pure.buildMetrics(outOf('应纳增值税', [
            { label: '销项税额', value: 3000, kind: 'money' },
            { label: '税率', value: 0.13, kind: 'percent' }
        ]));
        expect(ms.map((m) => m.label)).toEqual(['应纳增值税', '销项税额', '税率']);
        expect(ms[0].value).toBe(1200);
    });

    test('取不到值是 null（界面画 -），不是补一个 0', () => {
        const ms = S().pure.buildMetrics({
            primary: { label: '应纳增值税', value: 100, kind: 'money' },
            rows: [{ label: '进项税额', value: null, kind: 'money' }]
        });
        expect(ms[1].value).toBeNull();
        // 这一行就是本次要治的病：老 fmtValue 会把 undefined 的金额画成 ¥0.00
        expect(P().cellText(ms[1].value, 'money')).toBe('-');
    });

    test('文本行原样保留（计税方式这种不是数字，但也有对比价值）', () => {
        const ms = S().pure.buildMetrics(outOf('应纳增值税', [
            { label: '计税方法', value: '一般计税', kind: 'text' }
        ]));
        expect(ms[1]).toEqual({ label: '计税方法', kind: 'text', value: '一般计税' });
    });

    test('主结果与明细行同名只留一行（不重复占一行）', () => {
        const ms = S().pure.buildMetrics(outOf('应纳增值税', [
            { label: '应纳增值税', value: 1200, kind: 'money' }
        ]));
        expect(ms.length).toBe(1);
    });
});

// ====== ② 跨工具不硬凑 ======
describe('对比：对得上才横着比', () => {
    test('同一个工具的两套：共有指标都摆出来', () => {
        const a = saveTool('vat-deep', outOf('应纳增值税', [{ label: '销项税额', value: 3000, kind: 'money' }]));
        const b = saveTool('vat-deep', outOf('应纳增值税', [{ label: '销项税额', value: 2500, kind: 'money' }]));
        expect(a.ok && b.ok).toBe(true);

        const cmp = P().compareRows(S().list());
        expect(cmp.comparable).toBe(true);
        expect(cmp.sameTool).toBe(true);
        expect(cmp.rows.map((r) => r.label)).toEqual(['应纳增值税', '销项税额']);
        expect(cmp.rows[1].cells).toEqual([3000, 2500]);
    });

    test('跨工具（指标对不上）：不硬凑，comparable = false', () => {
        saveTool('vat-deep', outOf('应纳增值税', [{ label: '销项税额', value: 3000, kind: 'money' }]));
        saveTool('social-base-deep', outOf('月缴合计', [{ label: '养老（个人）', value: 800, kind: 'money' }]));
        expect(P().compareRows(S().list()).comparable).toBe(false);
    });

    test('单套方案：没有"跟谁比"，就把自己的指标全列出来', () => {
        saveTool('vat-deep', outOf('应纳增值税', [{ label: '销项税额', value: 3000, kind: 'money' }]));
        const cmp = P().compareRows(S().list());
        expect(cmp.comparable).toBe(true);
        expect(cmp.rows.length).toBe(2);
    });

    test('新指标不打「最优」：哪头更好猜不出来，猜错就是把错的标成最优', () => {
        saveTool('vat-deep', outOf('应纳增值税'));
        saveTool('vat-deep', outOf('应纳增值税', []));
        const cmp = P().compareRows(S().list());
        cmp.rows.forEach((r) => expect(r.best).toBeNull());
        expect(P().bestCellIndex(cmp.rows[0].cells, null)).toBe(-1);
    });
});

describe('方案库弹窗：跨工具时不摆一张"看起来能比"的表', () => {
    test('指标对不上 → 各列各的，且一个 ¥0.00 都没有', () => {
        saveTool('vat-deep', outOf('应纳增值税', [{ label: '销项税额', value: 3000, kind: 'money' }]));
        saveTool('social-base-deep', outOf('月缴合计', [{ label: '养老（个人）', value: 800, kind: 'money' }]));

        window.EuriskoScenarioUI.openLibrary();
        const body = document.getElementById('scenario-library-body');
        expect(body).toBeTruthy();
        expect(body.textContent).toContain('各列各的');
        // 这正是 19-5b 那句"会被 fmtValue 补成 ¥0.00"的机器防线
        expect(body.textContent).not.toContain('¥0.00');
    });

    test('同工具：正常横着比，列头写出是哪个工具的方案', () => {
        saveTool('vat-deep', outOf('应纳增值税', [{ label: '销项税额', value: 3000, kind: 'money' }]));
        saveTool('vat-deep', outOf('应纳增值税', [{ label: '销项税额', value: 2500, kind: 'money' }]));

        window.EuriskoScenarioUI.openLibrary();
        const body = document.getElementById('scenario-library-body');
        expect(body.textContent).not.toContain('各列各的');
        // 名字里带工具名（「方案 1 / 方案 2」本身不告诉你这列是哪个测算）
        expect(body.textContent).toContain('增值税');
        expect(body.querySelector('.scenario-load-btn')).toBeTruthy();
    });
});

// ====== ③ 老方案照旧 ======
describe('v1.98.0 之前存的方案（只有 summary）', () => {
    function saveLegacy(name, taxTotal) {
        return S().save({
            name: name,
            input: {},
            summary: { taxTotal: taxTotal, totalTax: taxTotal, preTaxTotal: 300000, netIncome: 260000, effectiveRate: 0.13 }
        }, { isPro: true });
    }

    test('照样显示：老六项摊成指标行', () => {
        saveLegacy('并入工资', 15420);
        const ms = P().metricsOf(S().list()[0]);
        const labels = ms.map((m) => m.label);
        expect(labels).toContain('年度应纳税额');
        expect(labels).toContain('税前年收入');
        expect(ms.filter((m) => m.label === '年度应纳税额')[0].value).toBe(15420);
    });

    test('两套老方案照样可比，且「年度应纳税额」带 best（老口径那六项才标最优）', () => {
        saveLegacy('并入工资', 15420);
        saveLegacy('单独计税', 13240);
        const cmp = P().compareRows(S().list());
        expect(cmp.comparable).toBe(true);
        const taxRow = cmp.rows.filter((r) => r.label === '年度应纳税额')[0];
        expect(taxRow.cells).toEqual([15420, 13240]);
        expect(taxRow.best).toBe('min');
        expect(P().bestCellIndex(taxRow.cells, 'min')).toBe(1);
    });

    test('老方案配一套别的工具的新方案 → 对不上就各列各的（不拿老口径去套新工具）', () => {
        saveLegacy('并入工资', 15420);
        saveTool('vat-deep', outOf('应纳增值税', [{ label: '销项税额', value: 3000, kind: 'money' }]));
        expect(P().compareRows(S().list()).comparable).toBe(false);
    });
});

// ====== 保存入口 ======
describe('任一工具都能存（不再只有综合所得）', () => {
    test('saveFrom：非综合所得工具存进去，带 toolId 与自己的指标，不编一份 summary', () => {
        const res = window.EuriskoScenarioUI.saveFrom({
            toolId: 'vat-deep', toolName: '增值税', values: { a: 1 }, out: outOf('应纳增值税')
        });
        expect(res.ok).toBe(true);
        const item = S().list()[0];
        expect(item.toolId).toBe('vat-deep');
        expect(item.input).toEqual({ a: 1 });
        expect(item.metrics.length).toBeGreaterThan(0);
        // 不再给非综合所得的方案编一套综合所得的 summary：normalize 会补一个空壳，
        // 但里面一项综合所得的数都没有（从前的毛病就是拿这个空壳去补 ¥0.00）
        expect(item.summary).toEqual({});
    });

    test('没算出结果就存 → 明确拒绝（不许静默存一条空方案）', () => {
        expect(window.EuriskoScenarioUI.saveFrom({ toolId: 'vat-deep', values: {}, out: null }).reason)
            .toBe('no-result');
        expect(window.EuriskoScenarioUI.saveFrom(null).reason).toBe('no-result');
        expect(S().list()).toEqual([]);
    });

    test('真速算器：存进去的指标就是它自己结果区那几行', () => {
        const f = quickFixture();
        expect(f).toBeTruthy();

        const res = window.EuriskoScenarioUI.saveFrom({
            toolId: f.tool.id, toolName: f.tool.name, values: f.values, out: f.out
        });
        expect(res.ok).toBe(true);
        const item = S().list()[0];
        expect(item.metrics[0].label).toBe(f.out.primary.label);
        expect(item.metrics[0].value).toBeCloseTo(Number(f.out.primary.value), 6);
    });
});

// ====== ④ 载入 ======
describe('载入：把方案里那份输入带回去', () => {
    let opened = null;
    beforeEach(() => {
        opened = [];
        window.EuriskoToolbox = {
            openTool: function (id, opts) { opened.push({ id: id, opts: opts }); }
        };
    });
    afterEach(() => { delete window.EuriskoToolbox; });

    test('按方案自带的 toolId 打开，并把存的那份输入带进去', () => {
        saveTool('vat-deep', outOf('应纳增值税'), { sales: 100000 });
        const id = S().list()[0].id;

        const res = window.EuriskoScenarioUI.loadScenario(id);
        expect(res.ok).toBe(true);
        expect(opened.length).toBe(1);
        expect(opened[0].id).toBe('vat-deep');
        expect(opened[0].opts.values).toEqual({ sales: 100000 });
    });

    test('老方案没有 toolId：那时只有综合所得能存，按 forward 打开', () => {
        S().save({ name: '老方案', input: { workMonths: 12 } }, { isPro: true });
        const id = S().list()[0].id;

        expect(window.EuriskoScenarioUI.loadScenario(id).ok).toBe(true);
        expect(opened[0].id).toBe('forward');
    });

    test('这个测算已经不在注册表里：不开（说了没有的入口比点了没反应更糟），方案也不动', () => {
        saveTool('gone-tool', outOf('应纳增值税'));
        const id = S().list()[0].id;

        const res = window.EuriskoScenarioUI.loadScenario(id);
        expect(res.ok).toBe(false);
        expect(res.reason).toBe('no-tool');
        expect(opened.length).toBe(0);
        expect(S().list().length).toBe(1);
    });

    test('方案已经被删掉：说清楚而不是打开一个空表单', () => {
        expect(window.EuriskoScenarioUI.loadScenario('不存在的 id').reason).toBe('missing');
        expect(opened.length).toBe(0);
    });
});
