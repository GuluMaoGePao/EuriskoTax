// 首页「我的方案与台账」（阶段19-2 遗留清偿④ · plan §3.3.5 ①）
// 钉的是四条容易被改回去的规矩：
//   1. **零感知** —— 没存方案、没有台账行，这两段整段不出现（新客看到的还是原来那张流水卡）；
//   2. **出口必须真能打开** —— 方案 → 方案库弹窗（不再只有结果页能看），台账 → 已有台账弹窗；
//   3. **不编数** —— 差额来自已存方案的 summary，取不到就不说差额；"未申报"是办到哪一步，不是逾期；
//   4. **不新增升级入口** —— 上限照实说（已存 2/2 套），但不挂第三颗升级按钮。

const { loadSource } = require('./helpers/load-source');

const CARD_HTML = `
    <div id="home-plans-box" class="plans-box hidden"></div>
    <div id="home-plans-recent-label" class="hidden"></div>
    <div id="home-recent-list"></div>
`;

global.showPage = jest.fn();
global.showAlert = jest.fn();

beforeAll(() => {
    global.window = global;
});

beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = CARD_HTML;
    loadSource('src/js/data/scenario-store.js');
    loadSource('src/js/data/entity-store.js');
    loadSource('src/js/data/ledger-store.js');
    loadSource('src/js/ui/home-mission.js');
    loadSource('src/js/ui/scenario-ui.js');
    loadSource('src/js/ui/home-ui.js');
});

afterEach(() => {
    ['EuriskoScenarios', 'EuriskoEntities', 'EuriskoLedger', 'EuriskoScenarioUI', 'EuriskoHomePlans']
        .forEach((k) => { delete global.window[k]; });
    delete global.window.renderPlans;
});

const P = () => window.EuriskoHomePlans.pure;
const box = () => document.getElementById('home-plans-box');
const label = () => document.getElementById('home-plans-recent-label');
const render = () => window.EuriskoHomePlans.render();
const monthKey = () => new Date().toISOString().slice(0, 7);

function savePlan(name, taxTotal) {
    return window.EuriskoScenarios.save({
        name: name,
        input: {},
        summary: { taxTotal: taxTotal, totalTax: taxTotal, preTaxTotal: 300000, netIncome: 260000, effectiveRate: 0.13 }
    });
}

function seedLedger(rows) {
    // rows: [{ id, periodKey, status, entityId }]
    const history = rows.map((r) => ({
        id: r.id, title: '测算 ' + r.id, date: r.periodKey + '-05T10:00:00.000Z',
        type: 'quick', toolId: 'salary-tax'
    }));
    localStorage.setItem('taxCalculationHistory', JSON.stringify(history));
    rows.forEach((r) => window.EuriskoLedger.attach(r.id, {
        periodKey: r.periodKey, status: r.status, entityId: r.entityId || null
    }));
}

// ====== 零感知 ======
describe('我的方案与台账 · 零感知', () => {
    test('没存方案、没有台账行：两段都不出现，「最近算过」小标题也不出现', () => {
        render();
        expect(box().classList.contains('hidden')).toBe(true);
        expect(box().innerHTML).toBe('');
        expect(label().classList.contains('hidden')).toBe(true);
    });

    test('任一模块缺失都不抛错（偏好 / 存储都不可用时首页照常渲染）', () => {
        delete window.EuriskoScenarios;
        expect(() => render()).not.toThrow();
        delete window.EuriskoLedger;
        expect(() => render()).not.toThrow();
    });

    test('容器不在 DOM 里（别的页面形态）也不抛错', () => {
        document.body.innerHTML = '';
        expect(() => render()).not.toThrow();
    });
});

// ====== 方案段建模 ======
describe('方案段 · 建模', () => {
    test('存了 1 套：出段，没有差额（1 套没什么可比的）', () => {
        savePlan('方案 1', 12000);
        const m = P().buildPlanModel(window.EuriskoScenarios.list(), false);
        expect(m.visible).toBe(true);
        expect(m.count).toBe(1);
        expect(m.limit).toBe(2);
        expect(m.full).toBe(false);
        expect(m.diff).toBeNull();
    });

    test('存了 2 套：差额 = 税额最高与最低两套之差（¥2,180 的形态）', () => {
        savePlan('并入工资', 15420);
        savePlan('单独计税', 13240);
        const m = P().buildPlanModel(window.EuriskoScenarios.list(), false);
        expect(m.diff.hi).toBe('并入工资');
        expect(m.diff.lo).toBe('单独计税');
        expect(m.diff.amount).toBe(2180);
        expect(m.diff.same).toBe(false);
        expect(P().money(m.diff.amount)).toBe('2,180');
    });

    test('两套税额一样：说「税额相同」而不是「差 ¥0」（那句听着像坏了）', () => {
        savePlan('A', 9000);
        savePlan('B', 9000);
        const m = P().buildPlanModel(window.EuriskoScenarios.list(), false);
        expect(m.diff.same).toBe(true);
        expect(m.diff.amount).toBe(0);
    });

    test('方案没带 summary（取不到税额）：不说差额，不猜一个', () => {
        window.EuriskoScenarios.save({ name: '空方案', input: {} });
        window.EuriskoScenarios.save({ name: '另一个', input: {} });
        const m = P().buildPlanModel(window.EuriskoScenarios.list(), false);
        expect(m.visible).toBe(true);
        expect(m.diff).toBeNull();
    });

    test('免费 2 套 / 专业版 10 套：满额标记照实给（上限不是首页编的，来自 limitFor）', () => {
        savePlan('方案 1', 100);
        savePlan('方案 2', 200);
        const free = P().buildPlanModel(window.EuriskoScenarios.list(), false);
        expect(free.limit).toBe(2);
        expect(free.full).toBe(true);
        const pro = P().buildPlanModel(window.EuriskoScenarios.list(), true);
        expect(pro.limit).toBe(10);
        expect(pro.full).toBe(false);
    });
});

// ====== 台账段建模 ======
describe('台账段 · 建模', () => {
    test('没有台账行：不出段', () => {
        seedLedger([]);
        const groups = window.EuriskoLedger.groupByPeriod(window.EuriskoLedger.visibleRows());
        expect(P().buildLedgerModel(groups, () => '').visible).toBe(false);
    });

    test('最近一个月：已算 2 条、1 条未申报（未申报 = 状态没走到"已申报"）', () => {
        seedLedger([
            { id: 'h1', periodKey: monthKey(), status: 'computed' },
            { id: 'h2', periodKey: monthKey(), status: 'filed' }
        ]);
        const groups = window.EuriskoLedger.groupByPeriod(window.EuriskoLedger.visibleRows());
        const m = P().buildLedgerModel(groups, () => '');
        expect(m.visible).toBe(true);
        expect(m.total).toBe(2);
        expect(m.undeclared).toBe(1);
    });

    test('整格同一主体才报主体名：混着多个主体时报一个名字是假的', () => {
        const e1 = window.EuriskoEntities.save({ name: '甲公司' });
        seedLedger([
            { id: 'h1', periodKey: monthKey(), status: 'computed', entityId: e1.entity.id },
            { id: 'h2', periodKey: monthKey(), status: 'computed', entityId: e1.entity.id }
        ]);
        const groups = window.EuriskoLedger.groupByPeriod(window.EuriskoLedger.visibleRows());
        const one = P().buildLedgerModel(groups, (id) => {
            const e = window.EuriskoEntities.byId(id);
            return e ? e.name : '';
        });
        expect(one.entityName).toBe('甲公司');

        seedLedger([
            { id: 'h3', periodKey: monthKey(), status: 'computed', entityId: e1.entity.id },
            { id: 'h4', periodKey: monthKey(), status: 'computed', entityId: null }
        ]);
        const groups2 = window.EuriskoLedger.groupByPeriod(window.EuriskoLedger.visibleRows());
        const mixed = P().buildLedgerModel(groups2, (id) => {
            const e = window.EuriskoEntities.byId(id);
            return e ? e.name : '';
        });
        expect(mixed.entityName).toBe('');
    });

    test('说的是最近一个期间，不是硬编码"本月"（这个月还没算就报上个月那一格）', () => {
        const last = (function () {
            const d = new Date();
            d.setMonth(d.getMonth() - 1);
            return d.toISOString().slice(0, 7);
        })();
        seedLedger([{ id: 'h1', periodKey: last, status: 'computed' }]);
        const groups = window.EuriskoLedger.groupByPeriod(window.EuriskoLedger.visibleRows());
        const m = P().buildLedgerModel(groups, () => '');
        expect(m.visible).toBe(true);
        expect(m.label).toContain(String(Number(last.slice(5, 7))));
        expect(m.total).toBe(1);
    });
});

// ====== 渲染与出口 ======
describe('我的方案与台账 · 渲染', () => {
    test('方案段：上限与差额都写出来，「看对比」开方案库弹窗', () => {
        savePlan('并入工资', 15420);
        savePlan('单独计税', 13240);
        render();
        expect(box().classList.contains('hidden')).toBe(false);
        expect(box().textContent).toContain('已存 2/2 套');
        expect(box().textContent).toContain('并入工资 / 单独计税 差 ¥2,180');
        expect(label().classList.contains('hidden')).toBe(false);   // 有分段了才需要那句「最近算过」

        const spy = jest.spyOn(window.EuriskoScenarioUI, 'openLibrary').mockImplementation(() => {});
        box().querySelector('[data-plans-open="library"]').click();
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    test('满了只说上限，不挂升级按钮（升级入口全局仍只有两处）', () => {
        savePlan('方案 1', 100);
        savePlan('方案 2', 200);
        render();
        expect(box().textContent).toContain('（专业版 10 套）');
        expect(box().querySelector('a[href*="upgrade"], [data-plans-open="upgrade"]')).toBeNull();
    });

    test('台账段：月份 + 条数 + 未申报，「我的台账」开台账弹窗', () => {
        seedLedger([
            { id: 'h1', periodKey: monthKey(), status: 'computed' },
            { id: 'h2', periodKey: monthKey(), status: 'filed' }
        ]);
        render();
        expect(box().textContent).toContain('已算 2 条');
        expect(box().textContent).toContain('1 条未申报');

        window.EuriskoEntityUI = { openLedger: jest.fn() };
        box().querySelector('[data-plans-open="ledger"]').click();
        expect(window.EuriskoEntityUI.openLedger).toHaveBeenCalled();
        delete window.EuriskoEntityUI;
    });

    test('「看对比」真的弹出方案库：表里有那两套，删一套后表里只剩一套', () => {
        savePlan('并入工资', 15420);
        savePlan('单独计税', 13240);
        window.EuriskoScenarioUI.openLibrary();
        const modal = document.getElementById('scenario-library-modal');
        expect(modal).not.toBeNull();
        const body = document.getElementById('scenario-library-body');
        expect(body.textContent).toContain('并入工资');
        expect(body.textContent).toContain('单独计税');

        const target = window.EuriskoScenarios.list().filter((s) => s.name === '单独计税')[0];
        body.querySelector('.scenario-delete-btn[data-id="' + target.id + '"]').click();
        expect(window.EuriskoScenarios.list()).toHaveLength(1);
        expect(document.getElementById('scenario-library-body').textContent).toContain('并入工资');
        expect(document.getElementById('scenario-library-body').textContent).not.toContain('单独计税');
    });

    test('方案名里的尖括号不被当成标签（名字是用户自己起的）', () => {
        window.EuriskoScenarios.save({
            name: '<img src=x onerror=alert(1)>', input: {},
            summary: { taxTotal: 300, totalTax: 300 }
        });
        window.EuriskoScenarios.save({
            name: '另一套', input: {},
            summary: { taxTotal: 100, totalTax: 100 }
        });
        render();
        expect(box().querySelector('img')).toBeNull();
        expect(box().textContent).toContain('<img src=x onerror=alert(1)>');
    });

    test('顺序：方案段在前、台账段在后（先说存了什么，再说办到哪一步）', () => {
        savePlan('方案 1', 100);
        seedLedger([{ id: 'h1', periodKey: monthKey(), status: 'computed' }]);
        render();
        const titles = Array.from(box().querySelectorAll('.plans-title')).map((el) => el.textContent.replace(/\s/g, ''));
        expect(titles).toEqual(['方案对比', '台账']);
    });
});
