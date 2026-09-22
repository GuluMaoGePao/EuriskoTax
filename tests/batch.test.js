/**
 * 阶段19-11 · 效率层 E4（批量）守护测试
 *
 * 批量是效率层里**最容易悄悄算错**的一环：一次算 200 行，没有任何人会逐行核对，
 * 而它的输入来自一份别人做的表（列名千奇百怪、数字带 ¥ 带千分位、还有整列空着）。
 * 所以这一档的坏法全是"看起来对"：
 *
 *   ① 守护 3（plan 原文点名的那道闸）：**批量 N 行 = 单行逐个算，逐项相等**。
 *      这是防两套口径的最后一道闸 —— 一旦有人为了跑得快给批量另写一份求和/取整，
 *      就会出现"表里第 7 行与单独算第 7 个人不一样"，而这种错当场没人会发现。
 *      这里对**每一个**速算器做对拍，不是挑两个代表。
 *   ② 列认错了不会有提示：表头带单位（"税前月薪（元）"）、带空格、写别名都要认出来；
 *      一个字都认不出时才退到"按顺序对号入座"，而且必须在界面上明说（测试钉住 hasHeader=false）。
 *   ③ 单元格的脏样子：¥12,000 / 全角数字 / 空 / "面议" —— 空要当 0（表里这格空着就是这项没有），
 *      "面议"这种算不出来要**单独标出来**而不是悄悄变成 0（0 会让人以为"这个人不用交税"）。
 *   ④ 权益在**整批**上，不在行数上：免费 5 行/次，超了**一行都不算** ——
 *      半份工资表与完整的一份长得一样，发出去就是事故。
 *   ⑤ 导出的表要能对人：未识别的列（姓名 / 工号）必须原样带出，免责声明跟着表走。
 *
 * @jest-environment jsdom
 */
const { loadSource } = require('./helpers/load-source');

const R = () => window.EuriskoToolRegistry;
const B = () => window.EuriskoBatch;

beforeAll(() => {
    // 与 entity-template 同一套加载顺序：solver 必须排在最前（缺了它倒算工具是**静默 null**），
    // quick 全家必须齐（少一个就是对拍在拿 null 比 null）
    loadSource('src/js/calculation/solver.js');
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/tax-calculator.js');
    loadSource('src/js/calculation/utils.js');
    loadSource('src/js/calculation/tax-registry.js');
    loadSource('src/js/calculation/social-insurance-quick.js');
    loadSource('src/js/calculation/salary-tax-quick.js');
    loadSource('src/js/calculation/net-salary-quick.js');
    loadSource('src/js/calculation/bonus-tax-quick.js');
    loadSource('src/js/calculation/special-deduction-quick.js');
    loadSource('src/js/calculation/annual-settlement-quick.js');
    loadSource('src/js/calculation/withholding-quick.js');
    loadSource('src/js/calculation/equity-incentive-quick.js');
    loadSource('src/js/calculation/severance-quick.js');
    loadSource('src/js/calculation/early-retirement-quick.js');
    loadSource('src/js/calculation/expat-allowance-quick.js');
    loadSource('src/js/calculation/private-pension-quick.js');
    loadSource('src/js/calculation/health-insurance-quick.js');
    loadSource('src/js/calculation/annuity-quick.js');
    loadSource('src/js/calculation/employer-cost-quick.js');
    loadSource('src/js/calculation/disability-fund-quick.js');
    loadSource('src/js/calculation/vat-quick.js');
    loadSource('src/js/calculation/corporate-income-tax-quick.js');
    loadSource('src/js/calculation/surtax-stamp-quick.js');
    loadSource('src/js/calculation/business-income-quick.js');
    loadSource('src/js/data/tool-registry.js');
    loadSource('src/js/ui/batch-ui.js');
});

beforeEach(() => {
    localStorage.clear();
    delete window.EuriskoPlan;
    delete window.apiClient;   // 上一个用例造的 Pro 用户会串到下一个
    document.body.innerHTML = '';
});

// 一份"用户真的会填的输入"：以 spec 默认值为底（一定合法）再扰动，
// 否则对拍就变成在拿 null 比 null（理由见 entity-template.test.js）
function validInput(tool) {
    const base = {};
    (tool.fields || []).forEach((f) => { base[f.key] = f.default; });
    const tries = [];
    const numKeys = (tool.fields || []).filter((f) => f.type === 'money' || f.type === 'number').map((f) => f.key);
    if (numKeys.length) {
        const c = Object.assign({}, base);
        numKeys.forEach((k) => { c[k] = Number(base[k]) * 1.5 + 7; });
        tries.push(c);
    }
    const sel = (tool.fields || []).filter((f) => f.type === 'select' && f.options && f.options.length > 1)[0];
    if (sel) {
        const c = Object.assign({}, base);
        c[sel.key] = sel.options[1].value;
        tries.push(c);
    }
    tries.push(base);
    for (let i = 0; i < tries.length; i++) {
        let r = null;
        try { r = tool.compute(tries[i]); } catch (e) { r = null; }
        if (r && r.primary) return tries[i];
    }
    return null;
}

// 把一份 values 变成"用户从 Excel 粘出来的那一行"：数字照抄，select 写**标签**（表里都是中文标签）
function cellsOf(tool, values) {
    return (tool.fields || []).map((f) => {
        if (f.type === 'select') {
            const opt = (f.options || []).filter((o) => o.value === values[f.key])[0];
            return opt ? opt.label : String(values[f.key]);
        }
        if (f.type === 'switch') return values[f.key] ? '是' : '否';
        return String(values[f.key]);
    });
}

const headerOf = (tool) => (tool.fields || []).map((f) => f.label);
const batchTools = () => (R().all() || []).filter((t) => t && t.status !== 'deep' && (t.fields || []).length);

// ==========================================================================
describe('守护 3：批量 N 行 = 单行逐个算（防两套口径的最后一道闸）', () => {
    test('每一个速算器：表里的第 i 行 与 单独算同参数 逐项相等', () => {
        const tools = batchTools();
        expect(tools.length).toBeGreaterThan(10);      // 别让它悄悄变成只测一两个工具
        tools.forEach((tool) => {
            const rows = [validInput(tool), validInput(tool), validInput(tool)];
            if (rows.some((v) => !v)) return;          // 这个工具连默认值都算不出来：不是批量的问题
            const text = [headerOf(tool)].concat(rows.map((v) => cellsOf(tool, v))).map((r) => r.join('\t')).join('\n');
            const res = B().run({ toolId: tool.id, text });
            expect(res.ok).toBe(true);
            expect(res.rows.length).toBe(3);

            rows.forEach((values, i) => {
                const direct = tool.compute(values);
                const got = res.rows[i].out;
                expect(!!got).toBe(true);
                // 主结果
                expect(got.primary.label).toBe(direct.primary.label);
                expect(got.primary.value).toBeCloseTo(direct.primary.value, 8);
                // 每一行明细：label / value / kind 三项逐项对 —— 少比一项就留了个缝
                expect((got.rows || []).length).toBe((direct.rows || []).length);
                (direct.rows || []).forEach((d, k) => {
                    expect(got.rows[k].label).toBe(d.label);
                    expect(got.rows[k].kind).toBe(d.kind);
                    if (typeof d.value === 'number') expect(got.rows[k].value).toBeCloseTo(d.value, 8);
                    else expect(got.rows[k].value).toBe(d.value);
                });
            });
        });
    });

    test('批量喂进去的参数与手工构造的完全一致（对拍的前提：先确认输入没被加工）', () => {
        const tool = R().get('salary-tax');
        const v = { monthlyIncome: 18000, months: 6, monthlyInsurance: 2200, monthlySpecialAdditional: 1500 };
        const res = B().run({ toolId: 'salary-tax', text: [headerOf(tool), cellsOf(tool, v)].map((r) => r.join('\t')).join('\n') });
        expect(res.rows[0].values).toEqual(v);
        // 单独算同参数：两个数必须一样（不是"差不多"）
        expect(res.rows[0].out.primary.value).toBe(tool.compute(v).primary.value);
    });
});

// ==========================================================================
describe('列识别：认错了不会有任何提示，所以这一档必须钉死', () => {
    test('表头带单位/空格/括号照样认出来', () => {
        const tool = R().get('salary-tax');
        const header = ['姓名', '税前月薪（元）', ' 五险一金（个人 / 月） ', '专项附加扣除(月)'];
        const det = B().detectMapping(tool, header);
        expect(det.matched).toBe(3);
        expect(det.mapping.slice(1)).toEqual(['monthlyIncome', 'monthlyInsurance', 'monthlySpecialAdditional']);
        expect(det.mapping[0]).toBe('');      // 「姓名」不是任何字段 —— 留空，但它要原样带出（见导出那组）
    });

    test('一个字都没认出来 → 按顺序对号入座，并把这件事说出来', () => {
        const tool = R().get('salary-tax');
        const text = '张三\t18000\t2200\t1500\n李四\t9000\t1200\t1000';
        const res = B().run({ toolId: 'salary-tax', text });
        expect(res.ok).toBe(true);
        expect(res.hasHeader).toBe(false);
        expect(res.mapping).toEqual(['monthlyIncome', 'months', 'monthlyInsurance', 'monthlySpecialAdditional']);
        expect(res.rows.length).toBe(2);       // 第一行是数据不是表头，不能被吃掉
    });

    test('两列都写着同一个字段 → 只有一列算数（后写的那列不会静默覆盖）', () => {
        const tool = R().get('salary-tax');
        const det = B().detectMapping(tool, ['税前月薪', '税前月薪']);
        expect(det.mapping).toEqual(['monthlyIncome', '']);
    });

    test('select 字段：写标签还是写值都能对上', () => {
        // 找一个有 select 的工具（增值税的计税方式）：表里这两种写法都会遇到
        const tool = batchTools().filter((t) => (t.fields || []).some((f) => f.type === 'select' && f.options && f.options.length > 1))[0];
        expect(tool).toBeTruthy();
        const f = (tool.fields || []).filter((x) => x.type === 'select' && x.options && x.options.length > 1)[0];
        expect(B().cellToValue(f, f.options[0].label)).toBe(f.options[0].value);
        expect(B().cellToValue(f, String(f.options[0].value))).toBe(f.options[0].value);
        // 认不出来时**不替它选默认值、也不归零**：换口径比算不出来危险得多 ——
        // 算出来的数也是个数，只是不对（'general' 被归零的 bug 就是这类静默加工的后果）。
        // 原样传下去，让这一行被标成"算不出来"（见 isUnparsable）。
        expect(B().cellToValue(f, '不知道')).toBe('不知道');
        expect(B().isUnparsable(f, '不知道')).toBe(true);
        expect(B().isUnparsable(f, f.options[0].label)).toBe(false);
        expect(B().isUnparsable(f, '')).toBe(false);   // 空着是"这项没有"，不是脏数据
    });
});

// ==========================================================================
describe('单元格的脏样子：空 = 0，算不出来的要标出来', () => {
    test('¥ / 千分位 / 全角数字 / 负号都能吃', () => {
        expect(B().cleanNumber('¥12,000')).toBe(12000);
        expect(B().cleanNumber('１２０００')).toBe(12000);
        expect(B().cleanNumber(' 8,500.50 ')).toBe(8500.5);
        expect(B().cleanNumber('-300')).toBe(-300);
        expect(B().cleanNumber('13%')).toBeCloseTo(0.13, 8);
    });

    test('空格 = 这项没有（0）；"面议" 这种算不出来要单独标，不能悄悄当 0', () => {
        const tool = R().get('salary-tax');
        const text = [
            ['姓名'].concat(headerOf(tool)).join('\t'),
            ['张三', '18000', '12', '2200', '1500'].join('\t'),
            ['李四', '9000', '12', '', ''].join('\t'),       // 后两列空着 → 0，照样算得出
            ['王五', '面议', '12', '1200', '1000'].join('\t') // 月薪写成了文字 → 标出来（不是"不用交税"）
        ].join('\n');
        const res = B().run({ toolId: 'salary-tax', text });
        expect(res.ok).toBe(true);
        expect(res.rows[1].values.monthlyInsurance).toBe(0);
        expect(res.rows[1].values.monthlySpecialAdditional).toBe(0);
        expect(!!res.rows[1].out).toBe(true);
        expect(res.failed).toBe(1);
        expect(res.rows[2].out).toBeNull();     // 明确标记，不是给一个 0 让人以为不用交税
        // 一行坏不代表整批坏：剩下的人照样要能发工资
        expect(res.rows.filter((r) => r.out).length).toBe(2);
    });

    test('表里没有的字段列 → 用工具自己的默认值（不是归零）', () => {
        const tool = R().get('salary-tax');
        const text = ['税前月薪', '18000'].join('\n');    // 只有一列
        const res = B().run({ toolId: 'salary-tax', text });
        expect(res.rows[0].values.months).toBe(12);       // spec 默认 12 个月
    });
});

// ==========================================================================
describe('权益：整批通过才算，绝不截前 5 行', () => {
    const manyRows = (n) => ['税前月薪\t五险一金（个人/月）'].concat(
        Array.from({ length: n }, (_, i) => `${9000 + i * 100}\t1500`)
    ).join('\n');

    test('免费 6 行 → 一行都不算（半份表比没有更危险）', () => {
        const res = B().run({ toolId: 'salary-tax', text: manyRows(6) });
        expect(res.ok).toBe(false);
        expect(res.reason).toBe('limit');
        expect(res.limit).toBe(B().FREE_ROWS);
        expect(res.count).toBe(6);
        expect(res.rows.length).toBe(0);       // 不是"算了 5 行"
    });

    test('免费 5 行 → 照算；专业版不限', () => {
        expect(B().run({ toolId: 'salary-tax', text: manyRows(5) }).ok).toBe(true);
        window.EuriskoPlan = { isPro: () => true };
        window.apiClient = { getCurrentUser: () => ({ id: 'u1', plan: 'pro' }) };
        const res = B().run({ toolId: 'salary-tax', text: manyRows(9) });
        expect(res.ok).toBe(true);
        expect(res.rows.length).toBe(9);
    });
});

// ==========================================================================
describe('导出：要能对人，也要能接着算', () => {
    const salaryTable = () => {
        const tool = R().get('salary-tax');
        return [
            ['姓名'].concat(headerOf(tool)).join('\t'),
            ['张三', '18000', '12', '2200', '1500'].join('\t'),
            ['李四', '9000', '12', '1200', '1000'].join('\t')
        ].join('\n');
    };

    test('未识别的列（姓名）原样带出 —— 对不上人的表没法用', () => {
        const res = B().run({ toolId: 'salary-tax', text: salaryTable() });
        const csv = B().csvOf(res);
        const lines = csv.replace(/^\uFEFF/, '').split('\n');
        expect(lines[0]).toContain('姓名');
        expect(lines[1]).toContain('张三');
        expect(lines[2]).toContain('李四');
        expect(lines.length).toBe(4);          // 表头 + 2 行 + 免责声明
        expect(lines[3]).toContain('仅供参考');  // 可带走的结果必须带免责声明
        expect(csv.charCodeAt(0)).toBe(0xFEFF);  // BOM：不加 Excel 打开是乱码
    });

    test('TSV 金额是裸数字（贴进 Excel 能求和），且列数对齐', () => {
        const res = B().run({ toolId: 'salary-tax', text: salaryTable() });
        const lines = B().tsvOf(res).split('\n');
        expect(lines.length).toBe(3);
        lines.forEach((l) => { expect(l.split('\t').length).toBe(lines[0].split('\t').length); });
        expect(lines[1]).toMatch(/\t\d+\.\d{2}/);      // 有两位小数的裸数字
        expect(lines[1]).not.toContain('¥');
        expect(lines[1]).not.toMatch(/\t\d{1,3},\d{3}/); // 没有千分位
    });

    test('算不出来的那一行：原样留在表里，结果列留空（不填 0）', () => {
        const text = [
            ['姓名'].concat(headerOf(R().get('salary-tax'))).join('\t'),
            ['张三', '面议', '12', '1200', '1000'].join('\t')
        ].join('\n');
        const res = B().run({ toolId: 'salary-tax', text });
        expect(res.failed).toBe(1);
        const lines = B().csvOf(res).replace(/^\uFEFF/, '').split('\n');
        expect(lines[1]).toContain('张三');           // 人还在
        expect(lines[1].trim().endsWith(',')).toBe(true);  // 结果列空着，不是 0
    });
});

// ==========================================================================
// 这一段补的是 jsdom 也能覆盖的接线：id 对不对、按钮点了有没有反应、导出条什么时候出现。
// 它盖不住样式与布局（那部分只能真机点），但至少能挡住"改了个 id 页面就死了"这类事。
describe('界面接线', () => {
    const SKELETON = `
        <select id="batch-tool"></select>
        <textarea id="batch-paste"></textarea>
        <button id="batch-run"></button>
        <div id="batch-preview"></div>
        <div id="batch-status"></div>
        <div id="batch-result"></div>
        <div id="batch-export-bar" style="display:none"><button id="batch-export"></button><button id="batch-copy"></button></div>`;

    beforeEach(() => {
        document.body.innerHTML = SKELETON;
        B().init();
    });

    test('工具下拉列出所有速算器，默认选中第一个', () => {
        const sel = document.getElementById('batch-tool');
        expect(sel.options.length).toBe(batchTools().length);
        expect(sel.value).toBe(batchTools()[0].id);
        // 完整测算（deep）不在这里：它是分步向导，批量喂不进"填到哪一步"
        expect([...sel.options].map((o) => o.value)).not.toContain('business-income-deep');
    });

    test('粘贴 → 预览（表头 + 列映射）；计算 → 结果表 + 导出条出现', () => {
        const tool = R().get('salary-tax');
        const paste = document.getElementById('batch-paste');
        paste.value = [
            ['姓名'].concat(headerOf(tool)).join('\t'),
            ['张三', '18000', '12', '2200', '1500'].join('\t'),
            ['李四', '9000', '12', '1200', '1000'].join('\t')
        ].join('\n');
        B().render();
        const preview = document.getElementById('batch-preview');
        expect(preview.querySelectorAll('[data-batch-col]').length).toBe(5);   // 每列一个映射下拉
        expect(preview.textContent).toContain('共 2 行');

        document.getElementById('batch-run').click();
        const result = document.getElementById('batch-result');
        expect(result.textContent).toContain('张三');
        expect(result.textContent).toContain('李四');
        expect(document.getElementById('batch-status').textContent).toContain('不写进计算历史');
        expect(document.getElementById('batch-export-bar').style.display).not.toBe('none');
    });

    test('超限时界面把话说出来，且导出条不出现（没有结果就没有导出）', () => {
        const paste = document.getElementById('batch-paste');
        paste.value = ['税前月薪'].concat(Array.from({ length: 6 }, (_, i) => String(9000 + i))).join('\n');
        B().render();
        document.getElementById('batch-run').click();
        const status = document.getElementById('batch-status');
        expect(status.textContent).toContain('一行都没算');
        expect(document.getElementById('batch-result').innerHTML).toBe('');
        expect(document.getElementById('batch-export-bar').style.display).toBe('none');
    });
});

// ==========================================================================
describe('粘贴解析：分隔符不写死', () => {
    test('TSV / 逗号 / 全角逗号都能切开', () => {
        expect(B().parseTable('a\tb\tc')[0]).toEqual(['a', 'b', 'c']);
        expect(B().parseTable('a,b,c')[0]).toEqual(['a', 'b', 'c']);
        expect(B().parseTable('a，b，c')[0]).toEqual(['a', 'b', 'c']);
    });

    test('csv 的引号包裹（"12,000"）不会被逗号切成两列', () => {
        const rows = B().parseTable('姓名,税前月薪\n张三,"12,000"');
        expect(rows[1]).toEqual(['张三', '12,000']);
    });

    test('末尾空行不算一行数据', () => {
        expect(B().parseTable('a\tb\n').length).toBe(1);
        expect(B().parseTable('').length).toBe(0);
    });
});
