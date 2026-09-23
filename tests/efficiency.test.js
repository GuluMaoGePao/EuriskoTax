/**
 * 阶段19-8 · 效率层 E5（参数记忆 / 键盘 / 复制为表格 / 带参链接）守护测试
 *
 * 这一档做的事看着都是"小便利"，但每一条都有**一种静默的坏法**，肉眼看不出来：
 *   ① 参数记忆：静默把默认值换成上次的值 —— 用户以为是自己填的，算错了记在算法头上；
 *      更坏的是记下"算不出结果的那一次"，下次进来一屏都是错的。
 *   ② 复制为表格：金额带 ¥ / 千分位 → 粘进 Excel 变成文本，这个按钮等于白做（验收口径）。
 *   ③ 带参链接：链接是**外部输入**，放任它往 compute 里塞键，等于开一个任意参数注入的口子。
 *   ④ 键盘：回车若被接到"保存"上，用户只是想换行，却把一条结果存进了历史。
 *
 * 于是这里钉的四条：记忆只在算得出来时落、带出必须可清空、表格是裸数字、链接只收注册表声明过的键。
 *
 * @jest-environment jsdom
 */
const { loadSource } = require('./helpers/load-source');

const R = () => window.EuriskoToolRegistry;
const TB = () => window.EuriskoToolbox;
const MEM = () => window.EuriskoParamMemory;
const LINK = () => window.EuriskoParamLink;

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/tax-calculator.js');
    loadSource('src/js/calculation/utils.js');
    loadSource('src/js/calculation/tax-registry.js');
    loadSource('src/js/calculation/vat-quick.js');
    loadSource('src/js/calculation/surtax-stamp-quick.js');
    loadSource('src/js/data/tool-registry.js');
    loadSource('src/js/data/tax-profile.js');
    loadSource('src/js/ui/param-memory.js');
    loadSource('src/js/ui/param-link.js');
    loadSource('src/js/ui/toolbox-ui.js');
    loadSource('src/js/ui/deep-wizard-ui.js');
});

beforeEach(() => {
    localStorage.clear();
    window.showPage = jest.fn();
    document.body.innerHTML = `
        <div id="tools-page" class="page hidden"><div id="toolbox-groups"></div></div>
        <div id="quick-calculator-page" class="page hidden"></div>
        <div id="quick-title"></div>
        <div id="quick-subtitle"></div>
        <div id="quick-policy-badge"></div>
        <div id="quick-memory-hint" class="hidden"></div>
        <div id="quick-form"></div>
        <div id="quick-result-card"><div id="quick-result"></div></div>
        <div id="quick-actions"></div>
        <div id="quick-result-bar" class="hidden"></div>
        <div id="quick-pitfalls"></div>
        <details id="quick-policy-basis" class="hidden"><div id="quick-policy-basis-body"></div></details>
        <div id="deep-wizard-page" class="page hidden"></div>
    `;
    TB().renderToolbox('', null);
});

function openVat() {
    document.querySelector('[data-tool-id="vat"]').click();
}
function fieldDefault(id, key) {
    const f = (R().get(id).fields || []).filter((x) => x.key === key)[0];
    return f ? f.default : undefined;
}
function setValue(key, value) {
    const el = document.getElementById('qf-' + key);
    el.value = String(value);
    el.dispatchEvent(new window.Event('input', { bubbles: true }));
}

describe('阶段19-8 · 参数记忆', () => {
    test('第一次进工具：spec 默认值，没有记忆提示（不凭空变出一份"上次"）', () => {
        openVat();
        expect(document.getElementById('qf-sales').value).toBe(String(fieldDefault('vat', 'sales')));
        expect(document.getElementById('quick-memory-hint').classList.contains('hidden')).toBe(true);
    });

    test('算完一次再进：带出上次输入，并说明是哪一天的（不静默替换）', () => {
        openVat();
        setValue('sales', 20000);
        openVat();
        expect(document.getElementById('qf-sales').value).toBe('20000');
        const hint = document.getElementById('quick-memory-hint');
        expect(hint.classList.contains('hidden')).toBe(false);
        expect(hint.textContent).toContain('已带出上次输入');
        expect(hint.textContent).toContain('今天');
        expect(document.getElementById('quick-memory-clear')).toBeTruthy();
    });

    test('「清空」回到默认值，且记忆真的删掉了（不是只把提示藏起来）', () => {
        openVat();
        setValue('sales', 20000);
        openVat();
        document.getElementById('quick-memory-clear').click();
        expect(document.getElementById('qf-sales').value).toBe(String(fieldDefault('vat', 'sales')));
        expect(document.getElementById('quick-memory-hint').classList.contains('hidden')).toBe(true);
        expect(MEM().get('vat')).toBeNull();
        // 再开一次也不该又冒出来
        openVat();
        expect(document.getElementById('qf-sales').value).toBe(String(fieldDefault('vat', 'sales')));
    });

    // 病根：用户点的是"看那一条记录"，不是"看我上次填的"。带进来的那份必须赢，
    // 否则「保存 → 查看」看到的会是别的数字 —— 18-2 修过一次同样的错位，不能在这里再犯。
    test('历史记录带进来的输入赢过记忆（用户点的是那一条，不是上次）', () => {
        openVat();
        setValue('sales', 20000);
        TB().openTool('vat', { values: { sales: 555 } });
        expect(document.getElementById('qf-sales').value).toBe('555');
        expect(document.getElementById('quick-memory-hint').classList.contains('hidden')).toBe(true);
    });

    // 病根：记下"算不出结果的那一次"，下次进来一屏都是错的，而带出这件事是静默的。
    test('算不出来那一次不落盘（不然下次带出来的是一份算不出结果的参数）', () => {
        const tool = R().get('vat');
        const origin = tool.compute;
        tool.compute = () => { throw new Error('boom'); };
        try {
            openVat();
            setValue('sales', 20000);
        } finally {
            tool.compute = origin;
        }
        expect(MEM().get('vat')).toBeNull();
    });

    test('只记能原样还回去的值（NaN 不落盘 —— 还原出来是空框，等于记忆记错了）', () => {
        MEM().set('demo', { keep: 3, drop: NaN });
        expect(MEM().get('demo').values).toEqual({ keep: 3 });
        expect(MEM().set('demo2', { drop: NaN })).toBe(false);
        expect(MEM().get('demo2')).toBeNull();
    });
});

describe('阶段19-8 · 复制为表格', () => {
    function out() {
        openVat();
        return R().get('vat').compute({ sales: 100000, variant: 'small', period: 'month' });
    }

    test('是 TSV：每行两列，标题 + 表头 + 主结果 + 明细', () => {
        const o = out();
        const lines = TB().tableTextOf(R().get('vat'), o).split('\n');
        expect(lines[0]).toBe(R().get('vat').name);
        expect(lines[1]).toBe('项目\t数值');
        lines.slice(2).forEach((line) => {
            expect(line.split('\t')).toHaveLength(2);
        });
        expect(lines).toHaveLength(3 + (o.rows || []).length + (o.note ? 1 : 0));
    });

    // 验收口径就是"粘进 Excel 列对齐"：带 ¥ 与千分位会被 Excel 认成文本，贴进去不能求和
    test('金额列是裸数字：不带 ¥、不带千分位', () => {
        const o = out();
        const body = TB().tableTextOf(R().get('vat'), o);
        expect(body).not.toContain('¥');
        expect(body).not.toContain(',');
        const moneyLine = body.split('\n')[2];
        expect(Number(moneyLine.split('\t')[1])).not.toBeNaN();
    });

    test('百分比列保留 %（Excel 认得 "12.34%" 这种形状）', () => {
        const fake = { primary: { label: '税负率', value: 0.1234, kind: 'percent' }, rows: [] };
        expect(TB().tableTextOf(R().get('vat'), fake)).toContain('12.34%');
    });
});

describe('阶段19-8 · 带参链接', () => {
    test('生成 → 解析往返一致（链接能回到同一组输入）', () => {
        const url = LINK().build('vat', { sales: 20000, variant: 'small' });
        expect(url).toContain('t=vat');
        const p = LINK().parse(url);
        expect(p.toolId).toBe('vat');
        expect(p.values.sales).toBe(20000);
        expect(p.values.variant).toBe('small');
    });

    // 病根：链接是外部输入。不按注册表的字段表过滤，就等于允许任意键进 compute。
    test('只带注册表声明过的字段（多余 / 拼错的键丢掉）', () => {
        const url = LINK().build('vat', { sales: 20000, __evil: 1 });
        expect(LINK().parse(url).values.__evil).toBeUndefined();
        expect(LINK().parse(url).values.sales).toBe(20000);
    });

    test('没有参数时不带 p（链接只指工具，不带半截输入）', () => {
        expect(LINK().build('vat', {})).not.toContain('&p=');
    });

    test('未知工具不打开（过期 / 手改过的链接不该把人丢进空白页）', () => {
        expect(LINK().parse('?t=not-a-tool&p=%7B%7D')).not.toBeNull();
        window.history.replaceState({}, '', '/?t=not-a-tool');
        expect(LINK().open()).toBe(false);
        expect(window.showPage).not.toHaveBeenCalled();
        window.history.replaceState({}, '', '/');
    });

    test('命中即直达：地址栏带参数时打开对应工具', () => {
        window.history.replaceState({}, '', '/?t=vat&p=' + encodeURIComponent(JSON.stringify({ sales: 20000 })));
        expect(LINK().open()).toBe(true);
        expect(window.showPage).toHaveBeenCalledWith('quick-calculator-page');
        expect(document.getElementById('qf-sales').value).toBe('20000');
        window.history.replaceState({}, '', '/');
    });
});

describe('阶段19-8 · 键盘（无鼠标走完一次测算）', () => {
    test('数字框带 inputmode（手机上弹九宫格，不是全键盘）', () => {
        openVat();
        expect(document.getElementById('qf-sales').getAttribute('inputmode')).toBe('decimal');
    });

    test('速算器回车 = 跳到结果（结果在首屏之外时，不滚过去等于没算）', () => {
        openVat();
        const scrolled = jest.fn();
        document.getElementById('quick-result-card').scrollIntoView = scrolled;
        document.getElementById('qf-sales')
            .dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(scrolled).toHaveBeenCalled();
    });

    test('完整测算：回车 = 下一步（Tab 之后不用去找那颗按钮）', () => {
        window.EuriskoDeepWizard.open('surtax-stamp-deep', { fresh: true });
        document.getElementById('dw-next').click();     // 第二步：计税依据（有数字框）
        const titleOf = () => document.querySelector('#deep-wizard-page .step-title.active').textContent;
        const before = titleOf();
        const input = document.querySelector('#deep-wizard-page input[type="number"]');
        expect(input).toBeTruthy();
        input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(titleOf()).not.toBe(before);
    });

    // 病根：结果步没有输入框，回车若被接到「保存」上，用户只是想换行，却把结果存进了历史
    test('结果步不接管回车（那里没有下一步可走）', () => {
        window.EuriskoDeepWizard.open('surtax-stamp-deep', { fresh: true });
        let guard = 0;
        while (document.getElementById('dw-next') && guard++ < 10) document.getElementById('dw-next').click();
        expect(document.getElementById('dw-next')).toBeNull();
        expect(document.getElementById('dw-result-card')).toBeTruthy();
    });

    test('完整测算：输入框的回车键提示是"下一步"，不是默认符号', () => {
        window.EuriskoDeepWizard.open('surtax-stamp-deep', { fresh: true });
        document.getElementById('dw-next').click();
        const input = document.querySelector('#deep-wizard-page input[type="number"]');
        expect(input.getAttribute('enterkeyhint')).toBe('next');
    });
});
