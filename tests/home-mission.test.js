// 首页 Mission 层单元测试（阶段19-2）
// home-mission.js 是纯逻辑（节点倒计时 / 事件卡数据 / 待办 / 概览），
// 不碰 DOM —— 所以这里全部走**给定 now 的确定性断言**：时间是最容易造出偶发红的输入。
//
// (v1.139.0) 原「Mission 三态」那一组用例随 Hero 的三态文案一起删：首页不再判定
// 「你现在该办的事」，那句话与主 CTA 都没有了 —— 钉住旧判定的断言只会阻止新设计落地。
// 节点倒计时与排序的口径仍要守：今日税感（Hero 内）与「接下来要办」的截止段都读它。

const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    global.window = global;
    loadSource('src/js/ui/home-mission.js');
});

beforeEach(() => {
    localStorage.clear();
});

const M = () => global.window.EuriskoHomeMission;

// 造一条历史记录（结构照 toolbox-ui.js 写入 taxCalculationHistory 的形态）
function rec(over = {}) {
    return {
        id: 'h-1',
        type: 'quick',
        toolId: 'salary-tax',
        title: '月薪个税',
        date: '2026-09-10T10:00:00.000Z',
        results: { taxDetails: { totalTax: 1234.56 } },
        ...over
    };
}

// ====== 1. 节点排序（今日税感与「接下来要办」共用的口径）======
describe('节点排序', () => {
    test('例行申报（月度预缴）：距下次永远 ≤ 一个月 —— 所以它不制造紧迫感', () => {
        // 9/10：距本月 15 日的月度预缴只剩 5 天
        const nodes = M().upcomingNodes(new Date('2026-09-10T10:00:00'));
        const monthly = nodes.find(n => n.id === 'monthly-prepaid');
        expect(monthly.daysLeft).toBe(5);
    });

    test('政策到期排在申报类之后：它不制造紧迫感', () => {
        const nodes = M().upcomingNodes(new Date('2026-09-21T10:00:00'));
        const firstPolicyIdx = nodes.findIndex(n => n.isPolicy);
        expect(firstPolicyIdx).toBeGreaterThan(0);
        expect(nodes.slice(0, firstPolicyIdx).every(n => !n.isPolicy)).toBe(true);
    });
});

// ====== 2. 节点倒计时口径 ======
describe('节点倒计时', () => {
    test('汇算区间内：截止日 = 区间末尾，且标记进行中', () => {
        const node = M().nodes.find(n => n.id === 'comprehensive-settlement');
        const dl = M().nodeDeadline(node, new Date('2026-05-10T10:00:00'));
        expect(dl.deadlineLabel).toBe('6/30');
        expect(dl.daysLeft).toBe(51);
        expect(dl.ongoing).toBe(true);
    });

    test('汇算区间外：滚动到明年同一截止日', () => {
        const node = M().nodes.find(n => n.id === 'comprehensive-settlement');
        const dl = M().nodeDeadline(node, new Date('2026-09-21T10:00:00'));
        expect(dl.daysLeft).toBeGreaterThan(200); // 明年 6/30
        expect(dl.ongoing).toBe(false);
    });

    test('月度预缴：15 日前算本月，过了算下月', () => {
        const node = M().nodes.find(n => n.id === 'monthly-prepaid');
        expect(M().nodeDeadline(node, new Date('2026-09-10T10:00:00')).daysLeft).toBe(5);
        expect(M().nodeDeadline(node, new Date('2026-09-20T10:00:00')).deadlineLabel).toBe('10/15');
    });

    test('季度预缴：只在 1/4/7/10 月的 15 日前，其余滚到下一个申报月', () => {
        const node = M().nodes.find(n => n.id === 'business-quarterly-prepaid');
        expect(M().nodeDeadline(node, new Date('2026-04-10T10:00:00')).daysLeft).toBe(5);
        expect(M().nodeDeadline(node, new Date('2026-05-01T10:00:00')).deadlineLabel).toBe('7/15');
        // 10 月之后滚到明年 1 月
        expect(M().nodeDeadline(node, new Date('2026-12-01T10:00:00')).deadlineLabel).toBe('1/15');
    });

    test('upcomingNodes 按剩余天数升序', () => {
        const list = M().upcomingNodes(new Date('2026-06-10T10:00:00'));
        for (let i = 1; i < list.length; i++) {
            if (list[i].isPolicy === list[i - 1].isPolicy) {
                expect(list[i].daysLeft).toBeGreaterThanOrEqual(list[i - 1].daysLeft);
            }
        }
    });
});

// ====== 3. 事件卡 ======
describe('事件卡数据', () => {
    const cards = () => M().eventCards;

    test('9 张，每张都有 大白话标题 + 一行说明 + 落点', () => {
        expect(cards()).toHaveLength(9);
        cards().forEach(c => {
            expect(c.title).toBeTruthy();
            expect(c.desc).toBeTruthy();
            expect(c.target).toBeTruthy();
            expect(c.icon).toBeTruthy();
        });
    });

    test('标题用生活语言：不出现税言（所得 / 税率 / 计税 / 预扣 / 汇算 / 申报）', () => {
        const terms = ['所得', '税率', '计税', '预扣', '汇算', '申报', '扣除'];
        cards().forEach(c => {
            terms.forEach(t => expect(c.title).not.toContain(t));
        });
    });

    test('第 8 张（开店/私活）先进判定再进工具；第 9 张是工作台入口', () => {
        const side = cards().find(c => c.id === 'side-hustle');
        expect(side.decide).toBe(true);
        expect(side.altTarget).toBe('business'); // 判定后另一条路：经营所得
        expect(cards().find(c => c.id === 'pay-salary').workbench).toBe(true);
    });

    test('每张卡的落点都真的存在于工具注册表', () => {
        loadSource('src/js/data/tool-registry.js');
        const registry = global.window.EuriskoToolRegistry;
        expect(registry).toBeTruthy();
        const ids = new Set([
            ...registry.all().map(t => t.id),
            ...registry.deep().map(t => t.id)
        ]);
        cards().forEach(c => {
            expect(ids.has(c.target)).toBe(true);
            if (c.altTarget) expect(ids.has(c.altTarget)).toBe(true);
        });
    });
});

// ====== 4. 待办与截止 ======
describe('待办与截止（税务日历 × 已保存测算）', () => {
    test('没有测算 → 不给待办（避免空状态劝退）', () => {
        expect(M().buildTodos({ history: [], now: new Date('2026-06-10T10:00:00') })).toEqual([]);
    });

    test('只提示与已算过的东西有关的节点', () => {
        const history = [rec({ type: 'business', toolId: 'business' })];
        const todos = M().buildTodos({ history, now: new Date('2026-02-10T10:00:00') });
        const ids = todos.map(t => t.id);
        // 经营所得：汇算 + 季度预缴 + 减半政策；不含综合所得月度预缴
        expect(ids).toContain('business-settlement');
        expect(ids).not.toContain('comprehensive-settlement');
        expect(ids).not.toContain('monthly-prepaid');
    });

    test('待办按剩余天数升序，且最多 3 条', () => {
        const history = [
            rec({ type: 'business', toolId: 'business' }),
            rec({ id: 'h-2', type: 'comprehensive', toolId: 'salary-tax' })
        ];
        const todos = M().buildTodos({ history, now: new Date('2026-03-10T10:00:00') });
        expect(todos.length).toBeLessThanOrEqual(3);
        for (let i = 1; i < todos.length; i++) {
            if (todos[i].isPolicy === todos[i - 1].isPolicy) {
                expect(todos[i].daysLeft).toBeGreaterThanOrEqual(todos[i - 1].daysLeft);
            }
        }
    });

    test('速算器记录靠 toolId 认领（type 统一是 quick 也能推出经营所得待办）', () => {
        const history = [rec({ type: 'quick', toolId: 'business' })];
        const todos = M().buildTodos({ history, now: new Date('2026-02-10T10:00:00') });
        expect(todos.map(t => t.id)).toContain('business-settlement');
    });
});

// ====== 5. 今年税负概览 ======
describe('今年税负概览', () => {
    test('不足 2 次测算 → 不可见（1 条数据画「构成」是自欺欺人）', () => {
        const o = M().buildYearOverview([rec()], { now: new Date('2026-09-21T10:00:00') });
        expect(o.visible).toBe(false);
        expect(o.count).toBe(1);
    });

    test('≥2 次测算 → 可见，并按税额降序给出占比', () => {
        const history = [
            rec({ id: 'a', title: '月薪个税', results: { taxDetails: { totalTax: 3000 } } }),
            rec({ id: 'b', title: '年终奖个税', results: { taxDetails: { totalTax: 1000 } } })
        ];
        const o = M().buildYearOverview(history, { now: new Date('2026-09-21T10:00:00') });
        expect(o.visible).toBe(true);
        expect(o.total).toBe(4000);
        expect(o.items[0].name).toBe('月薪个税');
        expect(o.items[0].pct).toBe(75);
        expect(o.items[1].pct).toBe(25);
    });

    test('只统计今年；跨年的旧记录不计入', () => {
        const history = [
            rec({ id: 'a', date: '2025-09-10T10:00:00.000Z' }),
            rec({ id: 'b', date: '2026-09-10T10:00:00.000Z' })
        ];
        const o = M().buildYearOverview(history, { now: new Date('2026-09-21T10:00:00') });
        expect(o.count).toBe(1);
        expect(o.visible).toBe(false);
    });

    test('税额为 0（如倒算类）也算一次测算，但概览不显示', () => {
        const history = [
            rec({ id: 'a', results: { taxDetails: { totalTax: 0 } } }),
            rec({ id: 'b', results: { taxDetails: { totalTax: 0 } } })
        ];
        const o = M().buildYearOverview(history, { now: new Date('2026-09-21T10:00:00') });
        expect(o.count).toBe(2);
        expect(o.visible).toBe(false); // total=0，没有可画的构成
    });
});

// ====== 6. 相对时间 ======
describe('相对时间口径', () => {
    const now = new Date('2026-09-21T12:00:00');
    test('跨天按天，不跨天按小时', () => {
        expect(M().relativeTime('2026-09-20T12:00:00', now)).toBe('昨天');
        expect(M().relativeTime('2026-09-18T12:00:00', now)).toBe('3 天前');
        expect(M().relativeTime('2026-09-21T09:00:00', now)).toBe('3 小时前');
        expect(M().relativeTime('2026-09-21T11:58:00', now)).toBe('刚刚');
    });
});
