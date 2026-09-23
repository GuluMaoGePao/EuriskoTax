// 首页「漏填提醒」卡（阶段19-2 遗留 · §3.3 ④）
// 钉的不是"卡片长得对不对"，而是三条容易被人改坏的规矩：
//   1. 判定复用 tax-profile 的 completeness / shouldNudge —— 首页不自己判断"什么算漏了"；
//   2. **不编金额** —— 漏项能省多少取决于几个子女、怎么分摊，不知道还硬算就是假的；
//   3. 出口要能真的补上 —— 开对应速算器（免登录可补，算完由 absorb 写回档案），
//      不是跳一张要登录才能看见的编辑卡。

const { loadSource } = require('./helpers/load-source');

const CARD_HTML = `
    <div id="home-missing-card" class="home-card hidden">
        <div class="home-card-header">
            <div class="home-card-title"><span>漏填提醒</span></div>
            <span id="home-missing-progress" class="text-xs text-gray-500"></span>
        </div>
        <div id="home-missing-body"></div>
    </div>
    <div id="home-scenarios"></div>
`;

global.showPage = jest.fn();
global.showAlert = jest.fn();

beforeAll(() => {
    global.window = global;
});

beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = CARD_HTML;
    // openTool 的桩要在 home-ui.js 加载前挂好：initHome 会把卡片的点击委托绑上去
    window.EuriskoToolbox = { openTool: jest.fn() };

    loadSource('src/js/data/tax-profile.js');
    if (window.EuriskoTaxProfile && window.EuriskoTaxProfile.reset) window.EuriskoTaxProfile.reset();
    loadSource('src/js/ui/home-mission.js');
    loadSource('src/js/ui/home-ui.js');
});

afterEach(() => {
    delete global.window.initHome;
    delete global.window.refreshHomeRecent;
    delete global.window.renderMissing;
    delete global.window.EuriskoHomeMissing;
});

const model = () => window.EuriskoHomeMissing.pure.buildMissingModel(window.EuriskoTaxProfile.get());
const card = () => document.getElementById('home-missing-card');
const body = () => document.getElementById('home-missing-body');
const render = () => window.EuriskoHomeMissing.render();

// ====== 该不该出卡 ======
describe('漏填提醒 · 可见性', () => {
    test('档案一项都没填：不出卡（"你漏了 5 项"是噪音，那是结果页引导卡的活）', () => {
        render();
        expect(card().classList.contains('hidden')).toBe(true);
        expect(body().innerHTML).toBe('');
        expect(document.getElementById('home-missing-progress').textContent).toBe('');
    });

    test('填了一项、还有漏：出卡，进度显示 1/5', () => {
        window.EuriskoTaxProfile.patch({ identity: 'employee' });
        render();
        expect(card().classList.contains('hidden')).toBe(false);
        expect(document.getElementById('home-missing-progress').textContent).toBe('我的情况 1/5');
        expect(model().missing.map(m => m.key)).toEqual(['city', 'social', 'deductions', 'bonus']);
    });

    test('全填完：不出卡（没有"还能再省"还占位就是噪音）', () => {
        window.EuriskoTaxProfile.patch({
            identity: 'employee', city: '上海', social: 'yes', deductions: ['children'], bonus: 'no'
        });
        render();
        expect(card().classList.contains('hidden')).toBe(true);
        expect(model().visible).toBe(false);
    });

    test('点过「暂不」：不出卡（19-5 定的规矩 —— 说过别再提，首页换个地方再提就是骚扰）', () => {
        window.EuriskoTaxProfile.patch({ identity: 'employee' });
        window.EuriskoTaxProfile.dismissNudge();
        render();
        expect(card().classList.contains('hidden')).toBe(true);
    });

    test('档案库没加载：不抛错，卡保持隐藏', () => {
        const backup = window.EuriskoTaxProfile;
        delete window.EuriskoTaxProfile;
        expect(() => render()).not.toThrow();
        expect(card().classList.contains('hidden')).toBe(true);
        window.EuriskoTaxProfile = backup;
    });

    test('DOM 里没有这张卡：不抛错（首页精简 fixture 与真实页面都可能没有）', () => {
        document.body.innerHTML = '<div id="home-scenarios"></div>';
        window.EuriskoTaxProfile.patch({ identity: 'employee' });
        expect(() => render()).not.toThrow();
    });
});

// ====== 只说漏了什么，不编金额 ======
describe('漏填提醒 · 不编金额', () => {
    test('模型里不含任何金额字段', () => {
        window.EuriskoTaxProfile.patch({ identity: 'employee', city: '上海', social: 'yes' });
        const m = model();
        expect(JSON.stringify(m)).not.toMatch(/¥|amount|money|tax/);
    });

    test('卡片正文里不出现金额（漏项能省多少是算不出来的，硬算就是假数）', () => {
        window.EuriskoTaxProfile.patch({ identity: 'employee', city: '上海', social: 'yes' });
        render();
        expect(body().textContent).not.toContain('¥');
        expect(body().textContent).toContain('专项附加扣除');
        expect(body().textContent).toContain('可能多缴');
    });

    test('漏了专项附加扣除：多给一句它为什么最容易漏', () => {
        window.EuriskoTaxProfile.patch({ identity: 'employee', city: '上海', social: 'yes', bonus: 'no' });
        render();
        expect(body().textContent).toContain('应纳税所得额');
    });
});

// ====== 出口：点了真能补上 ======
describe('漏填提醒 · 出口', () => {
    test('漏的第一项是专项附加扣除 → 打开专项附加扣除速算器', () => {
        window.EuriskoTaxProfile.patch({ identity: 'employee', city: '上海', social: 'yes' });
        render();
        expect(model().cta).toEqual({ action: 'tool', target: 'special-deduction', text: '去补填：专项附加扣除' });
        document.querySelector('.home-missing-cta').click();
        expect(window.EuriskoToolbox.openTool).toHaveBeenCalledWith('special-deduction');
    });

    test('漏的第一项是社保 / 城市 → 社保公积金；年终奖 → 年终奖', () => {
        window.EuriskoTaxProfile.patch({ identity: 'employee' });
        expect(model().cta.target).toBe('social-base');   // city 先漏
        window.EuriskoTaxProfile.patch({ city: '上海' });
        expect(model().cta.target).toBe('social-base');   // 接着 social
        window.EuriskoTaxProfile.patch({ social: 'yes', deductions: ['children'] });
        expect(model().cta.target).toBe('bonus-tax');     // 最后 bonus
    });

    test('漏的第一项是身份 → 没有对应工具，滚到首页身份卡组', () => {
        const scroll = jest.fn();
        document.getElementById('home-scenarios').scrollIntoView = scroll;
        window.EuriskoTaxProfile.patch({ city: '上海' });   // 只填了城市，identity 仍是漏的第一项
        render();
        expect(model().cta).toEqual({ action: 'scroll', target: 'home-scenarios', text: '挑一个身份当默认视角' });
        document.querySelector('.home-missing-cta').click();
        expect(scroll).toHaveBeenCalled();
        expect(window.EuriskoToolbox.openTool).not.toHaveBeenCalled();
    });

    test('档案每一项都有去处：加档案项而忘了给出路会被这条拦下', () => {
        window.EuriskoTaxProfile.pure.ITEMS.forEach(it => {
            expect(Object.prototype.hasOwnProperty.call(
                window.EuriskoHomeMissing.pure.MISSING_TOOL_OF, it.key
            )).toBe(true);
        });
    });
});

// ====== 补完一项，卡要跟着变 ======
describe('漏填提醒 · 补完就少一项', () => {
    test('补完一项后重渲染：漏项少一个，进度走动', () => {
        window.EuriskoTaxProfile.patch({ identity: 'employee' });
        render();
        expect(body().querySelectorAll('.home-missing-chip').length).toBe(4);

        window.EuriskoTaxProfile.patch({ city: '上海' });
        render();
        expect(body().querySelectorAll('.home-missing-chip').length).toBe(3);
        expect(document.getElementById('home-missing-progress').textContent).toBe('我的情况 2/5');
        expect(body().textContent).not.toContain('城市');
    });

    test('档案在别处改了（onChange）：卡自己重画，不挂着已经补上的项', () => {
        window.EuriskoTaxProfile.patch({ identity: 'employee' });
        render();
        expect(body().textContent).toContain('城市');

        // 档案变更广播（tax-profile.patch 会派发）—— 首页订阅后应自动重画
        window.EuriskoTaxProfile.patch({ city: '上海', social: 'yes' });
        expect(body().textContent).not.toContain('城市');
        expect(body().querySelectorAll('.home-missing-chip').length).toBe(2);
    });

    test('refreshHomeRecent 也带着刷这张卡（算完刚补上一项的场景）', () => {
        window.EuriskoTaxProfile.patch({ identity: 'employee' });
        render();
        window.EuriskoTaxProfile.patch({ city: '上海' });
        window.refreshHomeRecent();
        expect(body().textContent).not.toContain('城市');
    });
});
