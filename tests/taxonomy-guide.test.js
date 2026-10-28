// 阶段22 M4：A 侧问句引导（taxonomy-guide）的渲染与交互守卫
//
// 为什么值得测：
//   弹窗里出现的**每一句判定文案都必须来自 person-taxonomy.js 的 question 字段**
//   （唯一文案来源）—— 在组件里抄一遍就是第二个真源，抄漏 / 抄旧就是引导错方向。
//   交互侧守三件事：待补入口不做成死链接、点工具直达 openTool、跨格子事件全部可达。
const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    global.window = global;
    // 浏览器里由 index.html 顺序保证，测试里复现同一顺序
    loadSource('src/js/data/tool-registry.js');
    loadSource('src/js/data/person-taxonomy.js');
    loadSource('src/js/ui/taxonomy-guide-ui.js');
});

const G = () => window.EuriskoTaxonomyGuide;
const P = () => window.EuriskoPersonTaxonomy;
const body = () => document.getElementById('taxonomy-guide-body');

beforeEach(() => {
    document.body.innerHTML = '';
    window.EuriskoToolbox = { openTool: jest.fn() };
});

describe('问句引导（阶段22 M4）', () => {
    test('open() 创建弹窗并显示首页视图（9 格 + 跨格组）', () => {
        G().open();
        const modal = document.getElementById('taxonomy-guide-modal');
        expect(modal).toBeTruthy();
        expect(modal.classList.contains('hidden')).toBe(false);
        // 9 格问句卡 + 1 张跨格组卡
        const cards = body().querySelectorAll('.guide-form-card[data-guide-form]');
        expect(cards.length).toBe(10);
    });

    test('判定文案全部来自 person-taxonomy 的 question（唯一文案来源，组件不抄）', () => {
        G().open();
        P().forms().forEach((f) => {
            const card = body().querySelector(`[data-guide-form="${f.id}"]`);
            expect(card).toBeTruthy();
            const q = card.querySelector('.guide-form-card__q').textContent;
            expect(q).toBe(f.question);
        });
    });

    test('格卡的事件数徽标与 eventsByForm 一致（F1 = 9，F7 = 1）', () => {
        G().open();
        const meta = (id) => body().querySelector(`[data-guide-form="${id}"] .guide-form-card__meta`).textContent;
        expect(meta('F1')).toContain('9 个事项');
        expect(meta('F7')).toContain('1 个事项');
        // 跨格组 5 个
        expect(body().querySelector('[data-guide-form="cross"] .guide-form-card__meta').textContent)
            .toContain('5 个事项');
    });

    test('点 F1 → 事件 9 行、withheldBy 白话提示、返回可用', () => {
        G().open();
        body().querySelector('[data-guide-form="F1"]').click();
        const rows = body().querySelectorAll('.guide-event-row');
        expect(rows.length).toBe(9);
        expect(body().textContent).toContain('发了工资');
        expect(body().textContent).toContain('单位按月代扣代缴');
        body().querySelector('#taxonomy-guide-back').click();
        expect(body().querySelectorAll('.guide-form-card').length).toBe(10);
    });

    test('点事件行直达第一个工具，点 chip 直达指定工具，弹窗都关闭', () => {
        G().open();
        body().querySelector('[data-guide-form="F1"]').click();
        // 点 E1 行 → tools[0] = salary-tax
        body().querySelector('[data-guide-event="E1"]').click();
        expect(window.EuriskoToolbox.openTool).toHaveBeenCalledWith('salary-tax');
        // 弹窗已关
        expect(document.getElementById('taxonomy-guide-modal').classList.contains('hidden')).toBe(true);
        // 点 net-salary chip → 指定工具
        G().open();
        body().querySelector('[data-guide-form="F1"]').click();
        const chips = body().querySelector('[data-guide-event="E1"]')
            .querySelectorAll('.guide-tool-chip');
        expect(chips.length).toBe(3); // salary-tax / net-salary / reverse
        chips[1].click();
        expect(window.EuriskoToolbox.openTool).toHaveBeenCalledWith('net-salary');
    });

    test('工具名从注册表查（含 deep 档），查不到也不空', () => {
        expect(G().toolName('salary-tax')).toBe('月薪个税');
        expect(G().toolName('withholding-deep')).toBe(
            window.EuriskoToolRegistry.deep().find((t) => t.id === 'withholding-deep').name);
        expect(G().toolName('不存在的工具')).toBe('不存在的工具');
    });

    test('待补入口不做成死链接：F7 只有一行、标 is-empty、点击不触发 openTool', () => {
        G().open();
        body().querySelector('[data-guide-form="F7"]').click();
        const rows = body().querySelectorAll('.guide-event-row');
        expect(rows.length).toBe(1);
        expect(rows[0].classList.contains('is-empty')).toBe(true);
        expect(body().textContent).toContain('工具待补');
        rows[0].click();
        expect(window.EuriskoToolbox.openTool).not.toHaveBeenCalled();
    });

    test('跨格子组：5 个事件全部可达，E13 有两个工具档', () => {
        G().open();
        body().querySelector('[data-guide-form="cross"]').click();
        const rows = body().querySelectorAll('.guide-event-row');
        expect(rows.length).toBe(5);
        // 可点的 3 个（有工具）：E13 / E14 / E24；待补的 2 个：E16 / E20
        const clickable = [...rows].filter((r) => r.hasAttribute('data-guide-event'))
            .map((r) => r.getAttribute('data-guide-event')).sort();
        expect(clickable).toEqual(['E13', 'E14', 'E24']);
        const empty = [...rows].filter((r) => r.hasAttribute('data-guide-empty'))
            .map((r) => r.getAttribute('data-guide-empty')).sort();
        expect(empty).toEqual(['E16', 'E20']);
        const chips = body().querySelector('[data-guide-event="E13"]').querySelectorAll('.guide-tool-chip');
        expect(chips.length).toBe(2); // private-pension / private-pension-deep
        expect(body().textContent).toContain('买房了');
    });

    test('close() 后 isOpen 为 false，重复 open 不重复建 DOM', () => {
        G().open();
        G().close();
        expect(G().isOpen()).toBe(false);
        G().open();
        G().open();
        expect(document.querySelectorAll('#taxonomy-guide-modal').length).toBe(1);
    });
});
