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
// 注释剥除：撤下来的旧文案常被留在注释里解释"为什么删"，文案类断言必须看去掉注释后的样子
const stripComments = (s) => s.replace(/<!--[\s\S]*?-->/g, '');

describe('首页动线顺序（阶段20 P1 · ①~⑤，v1.139.0 撤身份卡、呼吸卡并入 Hero 后为五块）', () => {
    test('五块的先后顺序：搜索条 → Hero → 事件卡 → 接下来要办 → 继续上次', () => {
        const order = [
            'id="toolbox-search-entry"',   // ① 常驻搜索条
            'id="home-mission"',           // ② Hero（问候 + 今日税感 + 小贴士）
            'id="home-event-rail"',        // ③ 我遇到了什么事
            'id="home-todo-card"',         // ④ 接下来要办
            'id="home-recent-list"'        // ⑤ 继续上次
            // 原⑤「我是谁」chip 一行已于 v1.139.0 撤出首页 —— 身份改在登录弹窗与个人中心
            // 原⑦「今日税感 · 小贴士」呼吸卡同版并入 Hero —— 不再单独立一张卡
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

describe('② Hero 与「今日税感 · 小贴士」合一（v1.139.0）', () => {
    test('今日税感与小贴士都装在 Hero 里，不再各立一张卡', () => {
        const start = at('id="home-mission"');
        const end = REGION.indexOf('id="home-event-rail"');
        expect(start).toBeGreaterThan(-1);
        expect(end).toBeGreaterThan(start);
        const hero = REGION.slice(start, end);
        ['id="home-greeting"', 'id="home-tax-feel-content"', 'id="home-tip-content"', 'id="home-next-tip"']
            .forEach((id) => {
                expect({ id, inside: hero.includes(id) }).toEqual({ id, inside: true });
            });
        // 呼吸卡的壳（#home-tax-feel）与它那个「今日税感 · 小贴士」卡头都不该还在
        expect(REGION).not.toContain('id="home-tax-feel"');
        expect(REGION).not.toContain('>今日税感 · 小贴士<');
    });

    test('Hero 不再讲三态文案、也不再有主 CTA（动手靠搜索条与事件卡）', () => {
        // 文案类断言一律看**去掉注释后**的 HTML：撤卡注释里会引用旧文案说明来龙去脉，
        // 不剥掉注释的话，"删掉了"反而被注释里的那句旧文案命中。
        const region = stripComments(REGION);
        expect(region).not.toContain('home-mission-title');
        expect(region).not.toContain('home-mission-subtitle');
        expect(region).not.toContain('home-mission-cta');
        expect(region).not.toContain('home-mission-alt');
        expect(region).not.toContain('开始测算');
        // 那句自我介绍（含手写的场景数）随文案一起走
        expect(region).not.toContain('你今年要交多少税');
        expect(region).not.toContain('计税输入不上云');
    });
});

describe('⑤ 身份已撤出首页 / 继续上次', () => {
    test('首页不再摆身份 chip（身份改在登录弹窗与个人中心，不再拦在首屏第五张卡上）', () => {
        // 断言带 id= 前缀：撤卡那段注释里提到过这两个 id，裸字符串会被注释本身命中
        expect(REGION).not.toContain('id="home-scenarios"');
        expect(REGION).not.toContain('id="home-identity-note"');
        expect(REGION).not.toContain('>我是谁<');
        // 撤走 ≠ 删掉：弹窗与「我的」页身份卡必须还在（REGION 只截首页主区，弹窗在全文里）
        expect(HTML).toContain('id="identity-modal"');
        expect(HTML).toContain('id="profile-identity-card"');
        expect(HTML).toContain('id="identity-settings-summary"');
    });

    test('继续上次取代「我的方案与台账」，清单出口仍在卡头', () => {
        expect(REGION).toContain('>继续上次<');
        expect(REGION).not.toContain('>我的方案与台账<');
        expect(REGION).toContain('id="home-view-all-history"');
        // 卡名已经说了「继续上次」，那行「最近算过」小标签不再重复一遍
        expect(REGION).not.toContain('home-plans-recent-label');
    });
});
