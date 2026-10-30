// 首页「我是谁」= 设置默认视角（阶段19-2 遗留清偿③ · plan §3.3.4 · v1.142.0 收敛 · v1.143.0 改写落点）
// 钉的是三条最容易被人改回去的规矩：
//   1. 身份**不是筛选** —— 点卡不跳页、不藏入口；「看这类工具」才跳。
//      v1.143.0 起推荐从「置顶一组」变成「一条默认分类」：进工具页先落在「为你推荐」那一屏，
//      其余 41 个入口在别的分类里一个不少 —— 可达性没变，变的是不必先从 41 项里挑。
//   2. 身份**不写计税档案** —— 档案 identity 是计税口径（3 个值），身份卡有 6 张，
//      拿导航选择去改计税口径，将来算错没人查得到；
//   3. 身份**必须看得见** —— v1.142.0 之前它还兼带出「简明 / 完整」视图密度，那层取消后
//      身份一度变成"选完什么都没发生"。现在它决定默认落在哪一类，且有 chip 可查可调。

const { loadSource } = require('./helpers/load-source');

global.showPage = jest.fn();
global.showAlert = jest.fn();

const FIXTURE = `
    <div id="home-scenarios" class="scenario-grid"></div>
    <div id="home-identity-note" class="identity-note hidden"></div>
    <div id="tools-page" class="page hidden">
        <input id="toolbox-search" />
        <div id="toolbox-categories"></div>
        <div id="toolbox-scenario-chip" class="hidden"></div>
        <div id="toolbox-groups"></div>
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
    loadSource('src/js/ui/identity-pref.js');
    loadSource('src/js/ui/toolbox-ui.js');
    window.EuriskoIdentityPref.reset();
    global.showPage.mockClear();
});

afterEach(() => {
    delete global.window.EuriskoIdentityPref;
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

// ====== v1.142.0：默认密度这一层已删除 ======
// 身份曾经兼职「带出简明 / 完整」，而视图本身已经取消 —— 一个看不见的东西带不出来，
// 于是身份在很长一段时间里等于「选完什么都没发生」。这里钉住的是**别把它接回来**：
// 身份只剩推荐排序这一个可见效果（下面的用例守），不再有第二个模块被它改写。
describe('身份视角 · 只剩推荐排序这一个效果', () => {
    test('set / clear 都不再触碰任何"视图"产物（局部存储里只剩身份自身两个键）', () => {
        P().set('finance');
        const keys = Object.keys(localStorage).filter((k) => /eurisko/i.test(k)).sort();
        expect(keys).toEqual(['euriskoPrefIdentity']);
        P().save({ id: 'finance', title: '财务经理', company: '某公司' });
        const keys2 = Object.keys(localStorage).filter((k) => /eurisko/i.test(k)).sort();
        expect(keys2).toEqual(['euriskoIdentityProfile', 'euriskoPrefIdentity']);
    });
});

// ====== v1.142.0：身份必须"选完就有动静" ======
// 这些用例的存在理由：身份一度等于"存了一行字符串"。当时它唯一的动作是带出视图密度，
// 而视图取消了以后，选完身份什么都看不见 —— 没人提，直到用户问「选我是谁有什么用」。
// 所以下面每条断言的都是**屏幕上出现的东西**，不是又一处 localStorage 的读写。
describe('身份视角 · 选完必须看得见', () => {
    test('选过身份后，再打开工具页自动带出「为你推荐」组（不必再去点一次「看这类工具」）', () => {
        P().set('employee');
        window.EuriskoToolbox.renderToolbox('');
        const html = document.getElementById('toolbox-groups').innerHTML;
        expect(html).toContain('为你推荐');
        // 并且标记芯片也不隐藏：用户看得见"这是按谁推荐的"
        expect(document.getElementById('toolbox-scenario-chip').classList.contains('hidden')).toBe(false);
    });

    // v1.143.0：推荐从「置顶一组」改为「默认一屏」。可达性的判据随之变化 ——
    // 不再是"推荐组下面还挂着别的组"，而是"切到别的分类，41 个入口一个不少"。
    // 这两件事不等价，但**守的东西是同一个**：身份决定先看什么，不决定能看什么。
    test('推荐是默认一屏，其余入口在别的分类里照样在（身份不是筛选）', () => {
        P().set('employee');
        window.EuriskoToolbox.renderToolbox('');
        expect(document.getElementById('gp-scenario')).not.toBeNull();

        document.querySelector('#toolbox-categories .tool-cat-chip[data-cat="all"]').click();
        const heads = Array.from(document.querySelectorAll('#toolbox-groups .tool-group'))
            .map((g) => g.getAttribute('data-group'));
        expect(heads.length).toBeGreaterThan(3);
        expect(heads).toContain('salary');      // 与上班族推荐无关的分类，照常在那
        expect(document.querySelectorAll('#toolbox-groups .tool-entry').length)
            .toBeGreaterThan(5);
    });

    test('清掉推荐组（点 chip 的「清除」）后本次会话不再自动回来，但身份本身还在', () => {
        P().set('owner');
        window.EuriskoToolbox.renderToolbox('');
        document.getElementById('toolbox-scenario-clear').click();
        expect(document.getElementById('toolbox-groups').innerHTML).not.toContain('为你推荐');
        expect(P().get()).toBe('owner');            // 不改身份，只是这次不想被推荐
        window.EuriskoToolbox.renderToolbox('');
        expect(document.getElementById('toolbox-groups').innerHTML).not.toContain('为你推荐');
    });

    test('结果页「下一步」按身份排序：推荐的那一件排在前面，工具一个都没少', () => {
        document.body.insertAdjacentHTML('beforeend', '<div id="quick-next" class="hidden"></div>');
        // 挑一组「这个工具的下一步里有一部分属于某身份的推荐组、但不全属于」——
        // 全属于（或全不属于）都证明不了排序发生过，所以这里按数据现挑，
        // 不写死具体哪一 tool × 哪一身份：改注册表不会让这条守护静默失效。
        const scenarios = window.EuriskoToolRegistry.scenarios();
        let picked = null;
        window.EuriskoToolRegistry.all().concat(window.EuriskoToolRegistry.deep()).some(function (t) {
            if (!t.nextTools || t.nextTools.length < 2) return false;
            return scenarios.some(function (s) {
                const sg = window.EuriskoToolRegistry.byScenario(s.id).map((x) => x.id);
                const hit = t.nextTools.filter((id) => sg.indexOf(id) >= 0);
                if (hit.length && hit.length < t.nextTools.length) { picked = { tool: t, scen: s.id }; return true; }
                return false;
            });
        });
        expect(picked).toBeTruthy();
        const tool = picked.tool;
        const idsOf = () => Array.from(document.querySelectorAll('#quick-next .tool-next-item'))
            .map((el) => el.getAttribute('data-tool-id'));

        window.EuriskoToolbox.renderNextSteps(tool, {}, null);
        const plain = idsOf();
        expect(plain).toEqual(tool.nextTools);            // 没选身份时保持 spec 的原顺序

        P().set(picked.scen);
        window.EuriskoToolbox.renderNextSteps(tool, {}, null);
        const sorted = idsOf();
        expect(sorted.slice().sort()).toEqual(plain.slice().sort());   // 一件不多一件不少
        // 推荐的必须整体排在**前面**（不是混排）：最后一件推荐的早于第一件非推荐的
        const suggested = window.EuriskoToolRegistry.byScenario(picked.scen).map((t) => t.id);
        const flags = sorted.map((id) => suggested.indexOf(id) >= 0);
        expect(flags.lastIndexOf(true)).toBeLessThan(flags.indexOf(false));
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
        expect(note().textContent).toContain('默认视角');
        // 入口总数从注册表算（20 速算 + 23 deep），不写死 43
        expect(note().textContent).toContain('共 44 个入口仍然都能用');
        note().querySelector('.identity-note-clear').click();
        expect(P().get()).toBe('');
        expect(note().classList.contains('hidden')).toBe(true);
    });

    test('「看这类工具 ›」才跳工具页：落在推荐那一屏，其余入口换分类就能到', () => {
        draw();
        cardOf('employee').querySelector('.scenario-tools').click();
        expect(global.showPage).toHaveBeenCalled();
        const ids = Array.from(document.querySelectorAll('#toolbox-groups .tool-entry'))
            .map((el) => el.getAttribute('data-tool-id'));
        expect(ids).toContain('salary-tax');   // 推荐的

        document.querySelector('#toolbox-categories .tool-cat-chip[data-cat="all"]').click();
        const allIds = Array.from(document.querySelectorAll('#toolbox-groups .tool-entry'))
            .map((el) => el.getAttribute('data-tool-id'));
        expect(allIds).toContain('vat');       // 不属于上班族，但仍然能进 —— 身份不是筛选
        expect(allIds.length).toBeGreaterThan(5);
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
