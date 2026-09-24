/**
 * 首页信息架构（阶段20 P1）的守护断言
 *
 * 守的是**顺序与归属**，不是文案：
 *   首页按「这个用户此刻最可能推进的动作」排序（plan §4.1），顺序一旦被打乱，
 *   用户读到的是「一堆都跟我有关、但不知道先点哪个」—— 这正是重排要解决的病。
 *   而顺序是 index.html 里 div 的**位置**，改 HTML 时最容易顺手把某一块挪到别处，
 *   界面看着没坏，动线却断了，所以钉成断言。
 *
 * 另一组守的是「同一件事只有一处」：
 *   搜索入口、税务提醒、漏填提醒都在这轮被合并过，留下的旧壳一旦复辟，
 *   首页就又变回 10 个区块。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// 只取首页主内容区（#mode-selection-page 到工具页之间），避免页脚/顶栏的同名 id 干扰顺序判断
function homeRegion() {
    const start = HTML.indexOf('id="mode-selection-page"');
    const end = HTML.indexOf('id="tools-page"');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    return HTML.slice(start, end);
}
const REGION = homeRegion();
const at = (needle) => REGION.indexOf(needle);

describe('首页动线顺序（阶段20 P1 · ①~⑦）', () => {
    test('七块的先后顺序：搜索条 → Hero → 事件卡 → 接下来要办 → 身份 chip → 继续上次 → 呼吸区', () => {
        const order = [
            'id="toolbox-search-entry"',   // ① 常驻搜索条
            'id="home-mission"',           // ② Mission Hero
            'id="home-event-rail"',        // ③ 我遇到了什么事
            'id="home-todo-card"',         // ④ 接下来要办
            'id="home-scenarios"',         // ⑤ 身份 chip 一行
            'id="home-recent-list"',       // ⑥ 继续上次
            'id="home-tax-feel"'           // ⑦ 呼吸区
        ];
        const pos = order.map(at);
        pos.forEach((p, i) => {
            expect(p).toBeGreaterThan(-1);   // -1 = 这一块不在首页里（被删或被挪走了）
        });
        for (let i = 1; i < pos.length; i++) {
            // 谁在前谁在后写清楚，红的时候能直接看出是哪两块被调换了
            expect({ before: order[i - 1], after: order[i], ok: pos[i - 1] < pos[i] })
                .toEqual({ before: order[i - 1], after: order[i], ok: true });
        }
    });

    test('搜索条是全站唯一的首页搜索入口（不再留第二颗）', () => {
        const hits = (REGION.match(/toolbox-search-entry/g) || []).length;
        expect(hits).toBe(1);
        // 也不该再出现旧的那张「搜索入口卡」（.tool-search-entry 是它专属的皮）
        expect(REGION).not.toContain('tool-search-entry');
    });
});

describe('④ 接下来要办：三段合一，没有旧卡残留', () => {
    test('三段都在同一张壳里', () => {
        const start = at('id="home-todo-card"');
        const end = REGION.indexOf('/#home-todo-card');
        expect(start).toBeGreaterThan(-1);
        expect(end).toBeGreaterThan(start);
        const card = REGION.slice(start, end);
        ['id="home-assets-list"', 'id="home-calendar-list"', 'id="home-missing-body"'].forEach((id) => {
            expect({ id, inside: card.includes(id) }).toEqual({ id, inside: true });
        });
    });

    test('旧的「税务提醒」卡与「我的税务资产」卡标题已不复存在', () => {
        // 标题留在页面上 = 又变回三张卡；卡壳必须是唯一的那张
        expect(REGION).not.toContain('>税务提醒<');
        expect(REGION).not.toContain('>我的税务资产<');
        // #home-calendar-year 随旧卡一起删（renderTaxCalendar 对它是判空取用，删了不炸）
        expect(REGION).not.toContain('home-calendar-year');
    });
});

describe('⑤ 身份 chip / ⑥ 继续上次', () => {
    test('身份容器挂 chip 行的 class（渲染分支靠它判定，改回 scenario-grid 就变回整卡）', () => {
        expect(REGION).toContain('id="home-scenarios" class="identity-chip-row"');
    });

    test('继续上次取代「我的方案与台账」，清单出口仍在卡头', () => {
        expect(REGION).toContain('>继续上次<');
        expect(REGION).not.toContain('>我的方案与台账<');
        expect(REGION).toContain('id="home-view-all-history"');
        // 卡名已经说了「继续上次」，那行「最近算过」小标签不再重复一遍
        expect(REGION).not.toContain('home-plans-recent-label');
    });
});
