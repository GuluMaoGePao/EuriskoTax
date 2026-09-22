// 首页「我是谁」= 设置默认视角（阶段19-2 遗留清偿③ · plan §3.3.4）
// 钉的是三条最容易被人改回去的规矩：
//   1. 身份**不是筛选** —— 点卡不跳页、不藏入口；「看这类工具」才跳，且其余入口照常在；
//   2. 身份**不写计税档案** —— 档案 identity 是计税口径（3 个值），身份卡有 6 张，
//      拿导航选择去改计税口径，将来算错没人查得到；
//   3. 身份**不推翻用户的显式选择** —— 用户亲手切过视图之后，身份卡只记住标签，不再改密度。
// 另外一条：plan 没给默认密度的身份（高管 / 股东）**不编**，只记标签。

const { loadSource } = require('./helpers/load-source');

global.showPage = jest.fn();
global.showAlert = jest.fn();

const FIXTURE = `
    <div id="home-scenarios" class="scenario-grid"></div>
    <div id="home-identity-note" class="identity-note hidden"></div>
    <div id="tools-page" class="page hidden">
        <input id="toolbox-search" />
        <div id="toolbox-scenario-chip" class="hidden"></div>
        <div id="toolbox-groups"></div>
        <div id="toolbox-deep"><div id="toolbox-deep-extra" class="hidden"></div></div>
    </div>
`;

beforeAll(() => {
    global.window = global;
});

beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = FIXTURE;
    window.showPage = global.showPage;
    loadSource('src/js/data/tool-registry.js');
    loadSource('src/js/data/tax-profile.js');
    loadSource('src/js/ui/mode-pref.js');
    loadSource('src/js/ui/identity-pref.js');
    loadSource('src/js/ui/toolbox-ui.js');
    window.EuriskoModePref.reset();
    window.EuriskoIdentityPref.reset();
    global.showPage.mockClear();
});

afterEach(() => {
    delete global.window.EuriskoIdentityPref;
    delete global.window.EuriskoModePref;
});

const P = () => window.EuriskoIdentityPref;
const note = () => document.getElementById('home-identity-note');
const draw = () => window.EuriskoToolbox.renderScenarios();
const cardOf = (id) => document.querySelector('#home-scenarios .scenario-card[data-scenario="' + id + '"]');

// ====== 偏好层 ======
describe('身份视角偏好 · 存储', () => {
    test('默认没有身份；set 后能读回（重复 set 同一个 = 幂等）', () => {
        expect(P().get()).toBe('');
        P().set('finance');
        expect(P().get()).toBe('finance');
        P().set('finance');
        expect(P().get()).toBe('finance');
    });

    test('clear 后回到没选过（可随时改，不做成注册流程）', () => {
        P().set('owner');
        P().clear();
        expect(P().get()).toBe('');
    });

    test('onChange 能收到变更，退订后不再收到', () => {
        const cb = jest.fn();
        const off = P().onChange(cb);
        P().set('hr');
        expect(cb).toHaveBeenCalledWith('hr');
        off();
        P().set('owner');
        expect(cb).toHaveBeenCalledTimes(1);
    });

    test('localStorage 不可用时读写都不抛错（无痕 / 隐私模式）', () => {
        const real = window.localStorage;
        Object.defineProperty(window, 'localStorage', {
            value: { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); }, removeItem: () => { throw new Error('denied'); } },
            configurable: true
        });
        expect(() => P().set('employee')).not.toThrow();
        expect(P().get()).toBe('');
        Object.defineProperty(window, 'localStorage', { value: real, configurable: true });
    });
});

// ====== 默认密度：带出，但不推翻用户 ======
describe('身份视角 · 默认视图密度', () => {
    test('plan 表给了的按表带出：老板 / 财务 → 完整；上班族 / 自由职业 / HR → 简明', () => {
        expect(P().modeOf('owner')).toBe('full');
        expect(P().modeOf('finance')).toBe('full');
        expect(P().modeOf('employee')).toBe('simple');
        expect(P().modeOf('freelance')).toBe('simple');
        expect(P().modeOf('hr')).toBe('simple');
    });

    test('plan 没给答案的（高管 / 股东）不编：不登记，选它不动密度', () => {
        expect(P().modeOf('executive')).toBe(null);
        P().set('executive');
        expect(window.EuriskoModePref.get()).toBe(window.EuriskoModePref.SIMPLE);
    });

    test('没切过视图时，选身份会带出该身份的默认密度', () => {
        P().set('finance');
        expect(window.EuriskoModePref.get()).toBe(window.EuriskoModePref.FULL);
        expect(window.EuriskoModePref.isExplicit()).toBe(false);
    });

    test('用户亲手切过视图之后，身份不再改密度（只记住标签）', () => {
        window.EuriskoModePref.set(window.EuriskoModePref.SIMPLE);   // 用户显式选简明
        expect(window.EuriskoModePref.isExplicit()).toBe(true);
        P().set('finance');                                          // 这个身份默认是完整
        expect(P().get()).toBe('finance');
        expect(window.EuriskoModePref.get()).toBe(window.EuriskoModePref.SIMPLE);
    });

    test('取消默认**不动**已生效的密度（撤销身份 ≠ 撤销视图）', () => {
        P().set('owner');
        expect(window.EuriskoModePref.get()).toBe(window.EuriskoModePref.FULL);
        P().clear();
        expect(window.EuriskoModePref.get()).toBe(window.EuriskoModePref.FULL);
    });
});

// ====== 边界：身份不写计税档案 ======
describe('身份视角 · 不碰计税档案', () => {
    test('选身份不写档案 identity（6 张卡 vs 3 个计税口径，值域对不上）', () => {
        P().set('hr');
        expect(window.EuriskoTaxProfile.get().identity).toBe('');
        P().set('employee');
        expect(window.EuriskoTaxProfile.get().identity).toBe('');
    });

    test('档案里的计税身份也不反向替用户选卡（两个真源不互通）', () => {
        window.EuriskoTaxProfile.patch({ identity: 'employee' });
        draw();
        expect(P().get()).toBe('');
        expect(document.querySelector('#home-scenarios .scenario-card.is-on')).toBeNull();
    });
});

// ====== 卡片层 ======
describe('身份卡 · 设为默认视角', () => {
    test('没选过时：没有标记，反馈行整行不出现', () => {
        draw();
        expect(document.querySelectorAll('#home-scenarios .scenario-card')).toHaveLength(6);
        expect(document.querySelector('.scenario-badge')).toBeNull();
        expect(note().classList.contains('hidden')).toBe(true);
    });

    test('点卡 = 设为默认（就地，不跳页、不筛选），标记换到这张卡上', () => {
        draw();
        cardOf('finance').querySelector('.scenario-pick').click();
        expect(P().get()).toBe('finance');
        expect(global.showPage).not.toHaveBeenCalled();          // 设默认不跳走
        expect(cardOf('finance').classList.contains('is-on')).toBe(true);
        expect(cardOf('finance').querySelector('.scenario-badge').textContent).toBe('当前默认');
        expect(cardOf('employee').classList.contains('is-on')).toBe(false);
    });

    test('反馈行说明生效了什么，并给「取消默认」的退路', () => {
        draw();
        cardOf('owner').querySelector('.scenario-pick').click();
        expect(note().classList.contains('hidden')).toBe(false);
        expect(note().textContent).toContain('个体户 / 小店');
        expect(note().textContent).toContain('当前视图：完整');
        // 入口总数从注册表算（20 速算 + 21 deep），不写死 41
        expect(note().textContent).toContain('共 41 个入口仍然都能用');
        note().querySelector('.identity-note-clear').click();
        expect(P().get()).toBe('');
        expect(note().classList.contains('hidden')).toBe(true);
    });

    test('「看这类工具 ›」才跳工具页：推荐组置顶，其余入口照常在', () => {
        draw();
        cardOf('employee').querySelector('.scenario-tools').click();
        expect(global.showPage).toHaveBeenCalled();
        const ids = Array.from(document.querySelectorAll('#toolbox-groups .tool-entry'))
            .map((el) => el.getAttribute('data-tool-id'));
        expect(ids).toContain('salary-tax');   // 推荐的
        expect(ids).toContain('vat');          // 不属于上班族，但仍能进 —— 身份不是筛选
        expect(ids.length).toBeGreaterThan(5);
    });

    test('点「看这类工具」不会顺手把身份设成默认（两个动作各管一件事）', () => {
        draw();
        cardOf('hr').querySelector('.scenario-tools').click();
        expect(P().get()).toBe('');
    });

    test('未知身份 id：不抛错，也能取消（偏好层不认识注册表）', () => {
        expect(() => P().set('不存在的身份')).not.toThrow();
        expect(P().get()).toBe('不存在的身份');
        draw();
        expect(document.querySelector('#home-scenarios .scenario-card.is-on')).toBeNull();
        expect(note().classList.contains('hidden')).toBe(true);
        P().clear();
        expect(P().get()).toBe('');
    });

    test('偏好模块 / 容器缺失都不抛错（首页精简 fixture 与真实页面都可能没有）', () => {
        document.body.innerHTML = '<div id="home-scenarios"></div>';
        const backup = window.EuriskoIdentityPref;
        delete window.EuriskoIdentityPref;
        expect(() => draw()).not.toThrow();
        window.EuriskoIdentityPref = backup;

        document.body.innerHTML = '<div id="home-identity-note"></div>';
        expect(() => draw()).not.toThrow();
    });
});
