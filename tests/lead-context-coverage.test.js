/**
 * 留资「咨询情境」的覆盖守护（阶段18-4）
 *
 * 留资弹窗打开时会带一句情境（「增值税测算 · 适用税率 13%」），顾问据此知道用户算了什么。
 * 这句情境由 `LeadContext.current(type)`（结果页实时）与 `summarize` / `historyOptions`
 * （本地历史下拉）产出，而它们的类型表只写了 4 个：forward / comprehensive / business /
 * classification —— 又是阶段17 逐个迁移时就地补的那 4 个。
 *
 * 于是其余 17 个完整测算（增值税、企业所得税、年终奖、股权激励、离职补偿、非居民……）：
 *   · 从结果页留资 → `current(type)` 认不出这个 type，返回空 —— 情境卡整块不显示；
 *   · 从本地历史下拉选 → `SERVICE_TYPES` 里没有，这条记录干脆不进下拉。
 * 顾问收到线索时只知道「有人留了资」，不知道他算的是什么税。阶段18-2 刚让这些记录
 * **打得开**，这里要让它们**说得清**。
 *
 * 反向的红线也要守住：谈薪（reverse）永远不投服务引导、不作咨询情境（服务错配），
 * 认不出的类型宁可留空也不编造 —— 这两条是产品硬约束，改代码不能顺手改掉。
 *
 * @jest-environment jsdom
 */
const fs = require('fs');
const path = require('path');
const { loadSource } = require('./helpers/load-source');

const QUICK_MODULES = fs.readdirSync(path.resolve(__dirname, '../src/js/calculation'))
    .filter((f) => f.endsWith('-quick.js'));

const R = () => window.EuriskoToolRegistry;
const W = () => window.EuriskoDeepWizard;
const TB = () => window.EuriskoToolbox;
const LC = () => window.LeadContext;

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/tax-calculator.js');
    loadSource('src/js/calculation/tax-registry.js');
    loadSource('src/js/calculation/utils.js');
    QUICK_MODULES.forEach((f) => loadSource('src/js/calculation/' + f));
    loadSource('src/js/data/tool-registry.js');
    loadSource('src/js/ui/toolbox-ui.js');
    loadSource('src/js/ui/deep-wizard-ui.js');
    loadSource('src/js/lead/lead-context.js');
});

beforeEach(() => {
    localStorage.clear();
    window.showPage = jest.fn();
    window.showAlert = jest.fn();
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

function defaultsOf(fields) {
    const v = {};
    (fields || []).forEach((f) => { v[f.key] = f.default; });
    return v;
}

function numericField(fields) {
    return (fields || []).filter((f) => f.type !== 'select' && f.type !== 'switch' && f.type !== 'repeater')[0] || null;
}

// 与 lead-context.js 同一判据：占位符 / 纯 0 视为「还没算出东西」
function isMeaningful(text) {
    const t = String(text || '').replace(/[\s¥￥,%]/g, '');
    return !!t && t !== '0' && !/^0\.0*$/.test(t) && t !== '-' && t !== '—' && t !== '--';
}

// 「算出 0」本来就没有情境可说（不编造），所以喂几组不同的输入，直到主结果真有值 ——
// 个别测算（增值税、印花税）默认输入算出来就是 0，那不是这次要钉的事
function renderResult(tool) {
    const base = defaultsOf(tool.fields);
    const numeric = (tool.fields || []).filter(
        (f) => f.type !== 'select' && f.type !== 'switch' && f.type !== 'repeater');
    const tries = [base].concat(numeric.map((f) => Object.assign({}, base, { [f.key]: 12345 })));

    for (let i = 0; i < tries.length; i++) {
        if (!W().open(tool.id, { values: tries[i] })) continue;
        const hero = document.getElementById('dw-result-primary');
        if (hero && isMeaningful(hero.textContent)) return true;
    }
    return false;
}

// 谈薪是主动不作情境的那一类（服务错配），它也是 deep 之一 —— 列表里要把它摘出去
const BLOCKED = ['reverse'];

// 合规红线是「不采集收入金额」，税率是设计内允许的（「适用税率 20%」）—— 所以禁的是
// **金额形态**：带币种符号、千分位、或四位以上的裸数字。
function hasAmount(text) {
    const s = String(text || '');
    return /[¥￥]/.test(s) || /\d{1,3}(,\d{3})+/.test(s) || /\d{4,}/.test(s);
}

describe('21 个完整测算的咨询情境', () => {
    test('每个完整测算算完之后都有一句说得清的情境（且不夹带金额）', () => {
        const broken = [];
        R().deep().filter((tool) => BLOCKED.indexOf(tool.id) === -1).forEach((tool) => {
            if (!renderResult(tool)) {
                broken.push(tool.id + '：走完向导没有渲染出结果');
                return;
            }
            const scene = LC().current(tool.id);
            if (!scene) {
                broken.push(tool.id + '：认不出这个测算（情境为空，顾问只知道「有人留了资」）');
                return;
            }
            // 名字必须是「认出来的」，不能把工具 id 直接摆在顾问面前
            if (String(scene).split(' · ')[0].trim() === tool.id) {
                broken.push(tool.id + '：情境写的是 ' + scene + '（把内部 id 当名字了）');
                return;
            }
            if (hasAmount(scene)) {
                broken.push(tool.id + '：情境里夹带了金额（' + scene + '）');
            }
        });
        expect(broken).toEqual([]);
    });

    test('保存过的记录都能在本地历史下拉里选到（阶段18-2 让它们打得开，这里让它们说得清）', () => {
        const broken = [];
        R().deep().filter((tool) => BLOCKED.indexOf(tool.id) === -1).forEach((tool) => {
            localStorage.clear();
            localStorage.setItem('taxCalculationHistory', JSON.stringify([{
                id: 'rec-' + tool.id,
                type: tool.id,
                date: '2026-09-19T10:00:00',
                results: { toolId: tool.id, values: {}, taxDetails: {} }
            }]));
            const options = LC().historyOptions();
            const hit = options.filter((o) => o.id === 'rec-' + tool.id)[0];
            if (!hit) {
                broken.push(tool.id + '：下拉里没有这条记录（顾问无从得知他算了什么）');
                return;
            }
            if (hasAmount(hit.scene)) {
                broken.push(tool.id + '：情境里夹带了金额（' + hit.scene + '）');
            }
        });
        expect(broken).toEqual([]);
    });

    test('行名带括号后缀（真机上就是这个形态）也认得出税率锚点', () => {
        // 真机结果区的行名是「实际税负率（占不含税销售额）」，按名字精确匹配取不到 ——
        // 情境就只剩「增值税」三个字，顾问依旧看不出税负率。
        document.body.insertAdjacentHTML('beforeend',
            '<div id="dw-result-card" data-tool-id="vat-deep">' +
            '<div id="dw-result-primary">¥54,900.00</div>' +
            '<div data-dw-row="实际税负率（占不含税销售额）">' +
            '<span>实际税负率（占不含税销售额）</span><span>4.88%</span></div>' +
            '</div>');

        const scene = LC().current('vat-deep');
        expect(scene).toContain('实际税负率 4.88%');
        expect(hasAmount(scene)).toBe(false);
    });

    test('红线仍然成立：谈薪不作咨询情境，认不出的类型宁可留空', () => {
        // 谈薪（reverse）是服务错配：既不能投服务引导，也不能拿它当留资情境
        renderResult(R().get('reverse'));
        expect(LC().current('reverse')).toBe('');

        localStorage.clear();
        localStorage.setItem('taxCalculationHistory', JSON.stringify([
            { id: 'r1', type: 'reverse', date: '2026-09-19T10:00:00', results: { taxDetails: { refundTax: -1 } } }
        ]));
        expect(LC().historyOptions()).toEqual([]);

        // 认不出的类型：不编造
        expect(LC().current('一个根本不存在的测算')).toBe('');
        expect(LC().summarize({ id: 'x', type: '一个根本不存在的测算' })).toBe('');
    });
});
