/**
 * 完整测算向导：实时预览条 + 步骤条跳步（v1.142.0）
 *
 * 背景：这套向导是 1.17 时代四个整页（综合所得 / 经营所得 / 分类所得 / 反向倒算）的后继者。
 * 那四个页面顶上挂着一条 calc-preview-bar（收入 / 扣除 / 税），边填边变 —— 「计算流程看得见」
 * 就是靠它。迁移到通用向导之后这条不见了：**填到最后一屏才知道自己算的是多少钱**，
 * 而中间的每一步都在问收入、问扣除，屏幕上却一个数字都没有。
 *
 * 这个文件钉的就是那件被迁丢的东西回来了没有：
 *   ① 输入步必有预览条，且**与结果同源**（同一个 compute，不是另一套算术）；
 *   ② 填一个数预览条就得动，而不是要等主键回合完整屏重画；
 *   ③ 结果步不再重复显示这一条（那一屏本来就是完整的数）；
 *   ④ 步骤条可跳：4~5 屏的测算"回头改个数"不该只能一步步倒回去，而跳之前**必须收值**。
 *
 * 之所以单独一个文件：这类东西坏法是**静默**的 —— 函数都在、DOM 也不报错，
 * 只是那一栏永远显示着上一次的值，或者干脆一项都没有。它在单页这里一眼看得见。
 *
 * @jest-environment jsdom
 */
const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/tax-calculator.js');
    loadSource('src/js/calculation/utils.js');
    loadSource('src/js/calculation/tax-registry.js');
    loadSource('src/js/calculation/vat-quick.js');
    loadSource('src/js/calculation/surtax-stamp-quick.js');
    loadSource('src/js/calculation/property-rental-quick.js');   // 阶段22 M5：出租组合器
    loadSource('src/js/data/tool-registry.js');
    loadSource('src/js/ui/toolbox-ui.js');
    loadSource('src/js/ui/deep-wizard-ui.js');
});

const W = () => window.EuriskoDeepWizard;
const R = () => window.EuriskoToolRegistry;

beforeEach(() => {
    localStorage.clear();
    window.showPage = jest.fn();
    document.body.innerHTML = '<div id="deep-wizard-page" class="page hidden"></div>';
});

function bar() { return document.getElementById('dw-preview-bar'); }
function barTexts() {
    return Array.prototype.map.call(bar().querySelectorAll('.calc-preview-item'), (n) => n.textContent);
}
function openDeep(id) {
    W().open(id);
    return R().get(id);
}

// 跳到指定 key 的那一屏（写 clear semantic 而不是写"点几次下一步" —— 步序改动过两轮了）
function jumpToStep(tool, key) {
    const steps = W().stepsOf(tool);
    const i = steps.map((s) => s.key).indexOf(key);
    expect(i).toBeGreaterThanOrEqual(0);
    document.querySelector('.dw-step-jump[data-dw-step="' + i + '"]').click();
    return i;
}

describe('实时预览条', () => {
    test('输入步有预览条：签字的某一项 + 本次的结论（至少两项）', () => {
        openDeep('forward');
        expect(bar()).toBeTruthy();
        const items = bar().querySelectorAll('.calc-preview-item');
        expect(items.length).toBeGreaterThanOrEqual(2);
        // 每一项都得有名字和数字 —— 只有一个数不知道在说什么
        items.forEach((it) => {
            expect(it.querySelector('.calc-preview-label').textContent.trim()).not.toBe('');
            expect(it.querySelector('.calc-preview-value').textContent.trim()).not.toBe('');
        });
    });

    test('预览条与结果同源：预览的末项 = 结果步的主指标（不是另写一套算术）', () => {
        const tool = openDeep('forward');
        const preview = barTexts();
        // 跳到结果步，读主指标（#dw-result-primary 是向导结果步的主数字）
        const steps = W().stepsOf(tool);
        document.querySelector('.dw-step-jump[data-dw-step="' + (steps.length - 1) + '"]').click();
        const primaryLabel = document.getElementById('dw-result-primary-label').textContent.trim();
        const primaryValue = document.getElementById('dw-result-primary').textContent.trim();
        expect(preview[preview.length - 1]).toContain(primaryLabel);
        expect(preview[preview.length - 1]).toContain(primaryValue);
    });

    test('改一个输入，预览条随之改变（ui 上必须能看到"它在跟着算"）', () => {
        const tool = openDeep('forward');
        // 第一屏是「基本参数」（工作几个月 / 已预缴）：改这两个数**不会**让收入那三个数动，
        // 拿它们当"我在跟着算"的证据是不成立的 —— 要改就改这一屏要用户填的那个数（工资）。
        jumpToStep(tool, 'income');
        const before = barTexts().join(' | ');
        // 这一屏第一个可填的输入框（ #qf-* 是渲染器统一的控件 id 前缀）
        const el = document.querySelector('#deep-wizard-page input[id^="qf-"]');
        expect(el).toBeTruthy();
        el.value = '48000';
        el.dispatchEvent(new window.Event('input', { bubbles: true }));
        // live preview 是 debounce 220ms 的，等一轮
        return new Promise((resolve) => setTimeout(resolve, 320)).then(() => {
            expect(barTexts().join(' | ')).not.toBe(before);
        });
    });

    test('结果步不再挂预览条（那一屏自己就是完整的数）', () => {
        const tool = openDeep('forward');
        const steps = W().stepsOf(tool);
        document.querySelector('.dw-step-jump[data-dw-step="' + (steps.length - 1) + '"]').click();
        expect(bar()).toBeNull();
    });
});

describe('步骤条可跳', () => {
    test('每个步骤条节点都带 data-dw-step（可跳的前提），跳到第 2 步后渲染的是第 2 步的字段', () => {
        const tool = openDeep('forward');
        const steps = W().stepsOf(tool);
        const nodes = document.querySelectorAll('.dw-step-jump');
        expect(nodes.length).toBe(steps.length);
        expect(nodes[0].getAttribute('data-dw-step')).toBe('0');
        const targetKey = steps[1].key;
        nodes[1].click();
        // 标题必须跟着切换（停在第 2 步）
        expect(document.querySelector('.step-title.active').textContent).toContain(steps[1].title);
        // 且这一屏至少有一个第 2 步的控件 —— 多了不带参数的 when 字段是条件显隐（默认收起），
        // 不能拿「全部字段都在」当断言（deduction 那一屏大部分字段挂在一个开关后面）
        const shown = W().fieldsOfStep(tool, targetKey).filter((f) => document.getElementById('qf-' + f.key));
        expect(shown.length).toBeGreaterThan(0);
        expect(document.getElementById('dw-preview-bar')).toBeTruthy();
    });

    test('跳之前必须收值：在收入那一步填好再跳到最后一步，数不能被打回默认', () => {
        const tool = openDeep('forward');
        const steps = W().stepsOf(tool);
        jumpToStep(tool, 'income');
        const el = document.querySelector('#deep-wizard-page input[id^="qf-"]');
        expect(el).toBeTruthy();
        el.value = '30000';
        el.dispatchEvent(new window.Event('change', { bubbles: true }));
        // 跳到结果步
        document.querySelector('.dw-step-jump[data-dw-step="' + (steps.length - 1) + '"]').click();
        const primary = document.getElementById('dw-result-primary').textContent;
        expect(primary).toBeTruthy();
        expect(primary).not.toBe('¥0.00');    // 填了三万却算出零 —— 那就是值被偷偷打回默认了
    });

    test('跳回上一步，刚才填的值仍在输入框里', () => {
        const tool = openDeep('forward');
        const steps = W().stepsOf(tool);
        const jump = (i) => document.querySelector('.dw-step-jump[data-dw-step="' + i + '"]').click();
        jump(1);
        // 取这一屏实际渲染出来的第一个**数字输入框**：第一个 #qf-* 常常是开关（value='on'），
        // 而 WHEN 条件字段默认不显示 —— 按 spec 推断会扑空，只能按 DOM 里真的有的来取
        const el = document.querySelector(
            '#deep-wizard-page input[id^="qf-"][type="number"], #deep-wizard-page input[id^="qf-"][type="text"]'
        );
        expect(el).toBeTruthy();
        const key = el.id;
        el.value = '12345';
        el.dispatchEvent(new window.Event('change', { bubbles: true }));
        jump(0);
        jump(1);
        expect(document.getElementById(key).value).toBe('12345');
    });
});
