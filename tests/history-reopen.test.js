/**
 * 历史记录「查看」守护（阶段18-2）
 *
 * 这个文件钉的是一件**只有点一遍才知道**的事：保存下来的记录还能不能打开。
 * 保存与导出在 v1.36.0 / v1.37.0 / 阶段17 里都已经有测试守着（速算器存进同一份
 * taxCalculationHistory、deep 的保存走 saveToHistory、导出带 compare 与 extras），
 * 但「存进去之后点『查看』会发生什么」从来没人测过 —— 历史列表里那个按钮是唯一的入口：
 *
 *     onclick="viewHistoryRecord('${item.id}')"
 *
 * 而 viewHistoryRecord 是按 record.type 分发的，只认 business / classification /
 * reverse / forward 这 4 个（阶段17 每次迁移页面式 deep 时就地加一个 else-if）。于是：
 *   · 20 个速算器保存的记录 type 是 'quick'（toolbox-ui.js 的 saveToHistory）→ 落到 else；
 *   · 21 个完整测算里除了那 4 个，其余 17 个保存时 type 就是自己的 tool.id
 *     （tax-calculator.js 的 saveToHistory 第二参）→ 同样落到 else；
 * 落到 else 的行为是弹「这条记录没有对应的测算入口，可能来自更新的版本。」——
 * 用户刚在当前版本保存的，却被告知"可能来自更新的版本"。
 *
 * 第二个洞更隐蔽：那 4 个能打开的 deep，打开的是**向导草稿**（localStorage 里最后一次编辑），
 * 不是这条记录的输入。只有一份输入时两者恰好一样，所以平时看不出来；一旦又算了别的场景，
 * 点历史里那条老记录看到的就是新场景的值 —— 历史记录成了假账。
 *
 * 所以这里的断言不只是「能打开」，而是「打开的是**这一条**记录」：每个用例都先塞一份
 * 不同的草稿，再看界面上的值来自谁。
 *
 * @jest-environment jsdom
 */
const fs = require('fs');
const path = require('path');
const { loadSource } = require('./helpers/load-source');

// 直接扫目录，不手写清单：spec 的 compute 是运行时才去取 quick 模块的全局对象的
// （var Q = window.EuriskoDonationQuick; if (!Q) return null;），漏加载一个的表现是「算出 null」
// —— 与「这个工具坏了」长得一模一样。手写过 20 个的清单在新增第 21、22 个时就漏了。
const QUICK_MODULES = fs.readdirSync(path.resolve(__dirname, '../src/js/calculation'))
    .filter((f) => f.endsWith('-quick.js'));

const NO_ENTRY_HINT = '没有对应的测算入口';

const R = () => window.EuriskoToolRegistry;
const W = () => window.EuriskoDeepWizard;
const TB = () => window.EuriskoToolbox;

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/tax-calculator.js');
    loadSource('src/js/calculation/tax-registry.js');
    loadSource('src/js/calculation/utils.js');
    QUICK_MODULES.forEach((f) => loadSource('src/js/calculation/' + f));
    loadSource('src/js/data/tool-registry.js');
    loadSource('src/js/ui/toolbox-ui.js');
    loadSource('src/js/ui/deep-wizard-ui.js');
    loadSource('src/js/data/data-management.js');
});

beforeEach(() => {
    localStorage.clear();
    window.showPage = jest.fn();
    window.showAlert = jest.fn();
    window.showConfirm = jest.fn();
    document.body.innerHTML = `
        <div id="mode-selection-page" class="page active"></div>
        <div id="tools-page" class="page hidden">
            <input id="toolbox-search" />
            <div id="toolbox-groups"></div>
            <div id="toolbox-deep"><div id="toolbox-deep-extra" class="hidden"></div></div>
        </div>
        <div id="quick-calculator-page" class="page hidden"></div>
        <div id="deep-wizard-page" class="page hidden"></div>
        <div id="profile-page" class="page hidden"></div>
        <div id="quick-title"></div>
        <div id="quick-subtitle"></div>
        <div id="quick-policy-badge"></div>
        <div id="quick-form"></div>
        <div id="quick-result"></div>
        <div id="quick-pitfalls"></div>
        <div id="quick-next" class="hidden"></div>
        <a id="quick-seo-link"></a>
        <details id="quick-policy-basis" class="hidden"><div id="quick-policy-basis-body"></div></details>
        <nav id="bottom-tabbar" class="hidden"></nav>
        <nav id="top-tabbar" class="hidden"></nav>
    `;
    TB().renderToolbox('', null);
});

// ---- 工具 ----
function alertsText() {
    return (window.showAlert.mock.calls || []).map((c) => String(c[0])).join(' | ');
}

function lastPage() {
    const calls = window.showPage.mock.calls || [];
    return calls.length ? calls[calls.length - 1][0] : null;
}

// 挑一个能直接塞数字、且会进 compute 的字段：select / switch 的回填另有讲究，repeater 的值
// 是数组（塞数字会把它拆坏），都不参与这次比对
function numericField(fields) {
    return (fields || []).filter((f) => f.type !== 'select' && f.type !== 'switch' && f.type !== 'repeater')[0] || null;
}

function defaultsOf(fields) {
    const v = {};
    (fields || []).forEach((f) => { v[f.key] = f.default; });
    return v;
}

const SENTINEL = 12345;      // 记录里的值
const DRAFT_SENTINEL = 999;  // 草稿里的值：界面上出现它，说明打开的是草稿而不是这条记录

function seed(record) {
    localStorage.setItem('taxCalculationHistory', JSON.stringify([record]));
    window.syncCalculationHistoryFromStorage();
}

function quickRecord(tool) {
    const f = numericField(tool.fields);
    const values = defaultsOf(tool.fields);
    values[f.key] = SENTINEL;
    return {
        id: 'q-' + tool.id,
        date: new Date().toISOString(),
        type: 'quick',
        title: tool.name,
        source: 'quick',
        toolId: tool.id,
        values: values,
        result_data: { totalTax: 0 }
    };
}

function deepRecord(tool) {
    const f = numericField(tool.fields);
    const base = defaultsOf(tool.fields);

    // 个别 spec 只有 repeater 字段（分类所得的 items 是一组所得条目），没有能塞数字的地方：
    // 这时记录与草稿同值，只能验证「能打开且渲染出结果」，区分不了两者（下面的比对会自动跳过）。
    let values = Object.assign({}, base);
    if (f) {
        values[f.key] = SENTINEL;
        // 哨兵塞进某些字段会让这份输入算不出结果（反向倒算的取值区间就是一例）。这次守护
        // 钉的是「能不能打开、打开的是不是这一条」，不是每个字段的取值范围 —— 算不出就退回默认值。
        if (primaryOf(tool, values) === null) values = Object.assign({}, base);
    }

    // 草稿：同一份输入，但字段换成另一个值 —— 界面上若出现按它算出的数，说明开的是草稿
    let draftValues = Object.assign({}, values);
    if (f) {
        draftValues[f.key] = DRAFT_SENTINEL;
        if (primaryOf(tool, draftValues) === null) draftValues = Object.assign({}, values);
    }
    localStorage.setItem('euriskoDeepDraft:' + tool.id,
        JSON.stringify({ stepIndex: 0, values: draftValues }));
    return {
        id: 'd-' + tool.id,
        type: tool.id,
        title: tool.name,
        date: new Date().toISOString(),
        results: {
            toolId: tool.id,
            values: values,
            primary: { label: '税额', value: 0, kind: 'money' },
            rows: []
        }
    };
}

function valueOnScreen(key) {
    const el = document.getElementById('qf-' + key);
    return el ? el.value : null;
}

// 界面上那个主结果怎么显示，是 TB().fmtValue 说了算 —— 比对必须走同一个格式化，
// 否则「12000」与「¥12,000.00」会被判成两个数
function primaryOf(tool, values) {
    try {
        const out = tool.compute(values);
        if (!out || !out.primary) return null;
        return TB().fmtValue(out.primary.value, out.primary.kind);
    } catch (e) {
        return null;
    }
}

describe('历史记录「查看」：速算器', () => {
    test('20 个速算器的保存记录都能打开，且回填的是记录里的输入', () => {
        const broken = [];
        R().all().forEach((tool) => {
            window.showPage.mockClear();
            window.showAlert.mockClear();
            const f = numericField(tool.fields);
            if (!f) { broken.push(tool.id + '：没有可用于比对的数字字段'); return; }

            const rec = quickRecord(tool);
            seed(rec);
            window.viewHistoryRecord(rec.id);

            if (lastPage() !== 'quick-calculator-page') {
                broken.push(tool.id + '：没有打开速算器页（showPage 收到 ' + lastPage() + '；提示「' + alertsText() + '」）');
                return;
            }
            if (String(valueOnScreen(f.key)) !== String(SENTINEL)) {
                broken.push(tool.id + '：字段 ' + f.key + ' 回填成了 ' + valueOnScreen(f.key) + '（应为 ' + SENTINEL + '）');
            }
        });
        expect(broken).toEqual([]);
    });
});

describe('历史记录「查看」：完整测算（deep）', () => {
    // 打开的是**结果步**（点历史记录是想看结果，不是想重填一遍），所以输入控件并不在 DOM 里 ——
    // 比对的是结果区那个数：它必须等于「按这条记录的输入算出来的数」，而不是「按草稿算出来的数」。
    test('21 个完整测算的保存记录都能打开，且结果算的是这条记录而不是向导草稿', () => {
        const broken = [];
        R().deep().forEach((tool) => {
            window.showPage.mockClear();
            window.showAlert.mockClear();

            const rec = deepRecord(tool);
            seed(rec);
            window.viewHistoryRecord(rec.id);

            if (lastPage() !== 'deep-wizard-page') {
                broken.push(tool.id + '：没有打开向导（showPage 收到 ' + lastPage() + '；提示「' + alertsText() + '」）');
                return;
            }
            const el = document.getElementById('dw-result-primary');
            const shown = el ? el.textContent : null;
            if (!shown) {
                broken.push(tool.id + '：结果区没有主结果（没有落到结果步？）');
                return;
            }
            const want = primaryOf(tool, rec.results.values);
            const draft = primaryOf(tool, JSON.parse(localStorage.getItem('euriskoDeepDraft:' + tool.id)).values);
            if (want === null) { broken.push(tool.id + '：按这条记录的输入算不出结果（compute 抛异常）'); return; }
            if (shown !== want) {
                broken.push(tool.id + '：结果区是 ' + shown + '，按这条记录算应为 ' + want);
                return;
            }
            // 草稿算出的数不同时，界面上绝不能是它 —— 出现即说明打开的是草稿
            if (draft !== null && draft !== want && shown === draft) {
                broken.push(tool.id + '：打开的是向导草稿（结果 ' + draft + '）而不是这条记录');
            }
        });
        expect(broken).toEqual([]);
    });

    // 阶段17 每次迁移都在 viewHistoryRecord 里加过一个 else-if（business / classification /
    // reverse / forward），老数据里 type 就是这些名字。改成统一分发后它们必须还能打开 ——
    // 历史是**存量数据**，改代码不能让老记录变成打不开的死数据。
    test('迁移前存下的老记录（type 为 business / classification / reverse / forward）仍然能打开', () => {
        const legacy = [
            { type: 'business', open: 'business' },
            { type: 'classification', open: 'classification' },
            { type: 'reverse', open: 'reverse' },
            { type: 'forward', open: 'forward' },
            { type: 'comprehensive', open: 'forward' }   // 云同步协议里的同一个类型
        ];
        const broken = [];
        legacy.forEach((c) => {
            window.showPage.mockClear();
            window.showAlert.mockClear();
            const tool = R().get(c.open);
            const rec = {
                id: 'old-' + c.type,
                type: c.type,
                title: tool.name,
                date: new Date().toISOString(),
                results: { toolId: tool.id, values: defaultsOf(tool.fields), primary: { label: '税额', value: 0, kind: 'money' }, rows: [] }
            };
            seed(rec);
            window.viewHistoryRecord(rec.id);
            if (lastPage() !== 'deep-wizard-page') {
                broken.push(c.type + '：没有打开向导（showPage 收到 ' + lastPage() + '；提示「' + alertsText() + '」）');
            }
        });
        expect(broken).toEqual([]);
    });
});

describe('历史记录「查看」：兜底', () => {
    // 反过来钉住另一半：真的不认识的记录（比如来自更新版本、或 toolId 已被下架）
    // 必须**说清楚**而不是把人扔到一个不相干的页面里 —— 这条是老代码的既有行为，别在
    // 统一分发时顺手改成"猜一个最近的打开"。
    test('认不出的记录给出明确提示，且不做任何跳转', () => {
        window.showPage.mockClear();
        window.showAlert.mockClear();
        const rec = { id: 'x-1', type: 'made-up-tool-from-the-future', title: '来自未来的测算', date: new Date().toISOString(), results: {} };
        seed(rec);
        window.viewHistoryRecord(rec.id);

        expect(alertsText()).toContain(NO_ENTRY_HINT);
        expect(window.showPage).not.toHaveBeenCalled();
    });
});
