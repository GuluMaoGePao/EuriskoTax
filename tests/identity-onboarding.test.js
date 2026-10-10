/**
 * 「我是谁」—— 弹窗 + 两处身份卡（v1.139.0）
 *
 * 这里守的是三条**改错了没人报错**的边界，所以每条用例都写明它替谁挡刀：
 *   1. **入口绑定不依赖脚本加载顺序**（首条三例）：identity-onboarding.js 在 index.html
 *      约 2011 行引入并执行，而它要绑的 #profile-identity-card（约 2190 行）与
 *      #identity-settings-edit 都在它**后面**才解析。当初直接 getElementById 绑，
 *      一律拿到 null —— 表现是"点了没弹窗"，控制台一声不响，最容易一路带到线上。
 *   2. **只有「下一步」落盘**（第 5~10 例）：点 × 、点遮罩、点「暂时不填」都不算数，
 *      否则"顺手点了一下"就被记成身份，而身份会带出默认视图密度。
 *   3. **身份不写计税档案**（第 17 例）：6 张身份卡 vs 档案 3 个计税口径，值域对不上，
 *      拿导航选择改计税口径，将来算错没人查得到（identity-pref.js 文件头第 1 条）。
 */
const fs = require('fs');
const path = require('path');

const INDEX_HTML = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

// 6 张身份卡用桩而不是真加载 tool-registry：这里测的是弹窗行为，
// 数据源换一份不至于让整套用例跟着改（卡片数量与字段由 tool-registry.test.js 守）。
const SCENARIOS = [
    { id: 'employee', name: '上班族', desc: '领工资、算年终奖、看汇算退税', icon: 'fa-user' },
    { id: 'freelance', name: '自由职业', desc: '接私活、按次结算', icon: 'fa-briefcase' },
    { id: 'owner', name: '个体户 / 小店', desc: '经营所得与核定征收', icon: 'fa-shop' },
    { id: 'finance', name: '企业财务', desc: '算工资、算用工成本', icon: 'fa-building' },
    { id: 'executive', name: '高管 / 股东', desc: '股权、期权与分红', icon: 'fa-line-chart' },
    { id: 'hr', name: 'HR / 薪酬', desc: '薪酬结构与社保基数', icon: 'fa-users' }
];

function evalFile(rel) {
    const code = fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');
    // eslint-disable-next-line no-eval
    (0, eval)(code);
}

function setup() {
    document.documentElement.innerHTML = '<head></head><body>' +
        '<div id="identity-modal" class="modal-mask hidden opacity-0">' +
        '<div class="modal-shell modal-shell--lg">' +
        '<div id="identity-modal-list"></div>' +
        '<input id="identity-modal-job"><input id="identity-modal-company">' +
        '<button id="identity-modal-close"></button>' +
        '<button id="identity-modal-next"></button>' +
        '<button id="identity-modal-skip"></button>' +
        '</div></div>' +
        '</body>';
    window.openModal = jest.fn();
    window.closeModal = jest.fn();
    window.EuriskoToolRegistry = { scenarios: () => SCENARIOS };
    evalFile('src/js/ui/identity-pref.js');
    evalFile('src/js/ui/identity-onboarding.js');
}

function picks() {
    return [...document.querySelectorAll('#identity-modal-list .identity-pick')];
}

function pickById(id) {
    return document.querySelector('#identity-modal-list .identity-pick[data-identity="' + id + '"]');
}

beforeEach(() => {
    jest.resetModules();
    delete window.EuriskoIdentityPref;
    delete window.EuriskoIdentityOnboarding;
    // 不清 identityEntryBound：真实页面只加载一次脚本，这里若清掉，
    // 每个 test 的 setup 会再挂一份委托，点击次数就被重复计上（不是产品问题，是测试假象）。
    window.localStorage.clear();
    setup();
});

describe('两处入口的绑定（不能依赖脚本与 DOM 的先后）', () => {
    test('身份卡在脚本之后才进入 DOM，点击仍能开弹窗（真实 HTML 就是这个顺序）', () => {
        const card = document.createElement('div');
        card.id = 'profile-identity-card';
        document.body.appendChild(card);

        card.click();
        expect(window.openModal).toHaveBeenCalledTimes(1);
        expect(window.openModal.mock.calls[0][0].id).toBe('identity-modal');
    });

    test('个人中心「修改身份」按钮同样在脚本之后进入 DOM，点击开同一个弹窗', () => {
        const edit = document.createElement('button');
        edit.id = 'identity-settings-edit';
        document.body.appendChild(edit);

        edit.click();
        expect(window.openModal).toHaveBeenCalledTimes(1);
        expect(window.openModal.mock.calls[0][0].id).toBe('identity-modal');
    });

    test('点卡片内部的子元素（图标 / 文案 / 箭头）也算点中卡片', () => {
        const card = document.createElement('div');
        card.id = 'profile-identity-card';
        const inner = document.createElement('span');
        card.appendChild(inner);
        document.body.appendChild(card);

        inner.click();
        expect(window.openModal).toHaveBeenCalledTimes(1);
    });
});

describe('弹窗内容', () => {
    test('6 张身份卡全渲染，且每张都带一句话说明（不写说明就选不动）', () => {
        window.EuriskoIdentityOnboarding.open();
        expect(picks()).toHaveLength(6);
        picks().forEach((btn, i) => {
            const s = SCENARIOS[i];
            expect(btn.getAttribute('data-identity')).toBe(s.id);
            expect(btn.textContent).toContain(s.name);
            expect(btn.textContent).toContain(s.desc);
        });
    });

    test('选中态是 is-on + aria-pressed（勾换到这张卡上，不关弹窗还能接着填）', () => {
        window.EuriskoIdentityOnboarding.open();
        expect(pickById('employee').classList.contains('is-on')).toBe(false);

        pickById('owner').click();
        expect(pickById('owner').classList.contains('is-on')).toBe(true);
        expect(pickById('owner').getAttribute('aria-pressed')).toBe('true');
        expect(pickById('employee').classList.contains('is-on')).toBe(false);
        expect(window.closeModal).not.toHaveBeenCalled();
    });

    test('「暂时不填」只在首访那次出现：从个人中心进来的人不需要一颗「算了」', () => {
        const skip = document.getElementById('identity-modal-skip');
        window.EuriskoIdentityOnboarding.open({ firstTime: true });
        expect(skip.classList.contains('hidden')).toBe(false);

        window.EuriskoIdentityOnboarding.open();
        expect(skip.classList.contains('hidden')).toBe(true);
    });
});

describe('只有「下一步」落盘', () => {
    test('点身份卡只是选中，不落盘（关掉之前 localStorage 一个字节都没变）', () => {
        window.EuriskoIdentityOnboarding.open();
        pickById('owner').click();

        expect(window.EuriskoIdentityPref.get()).toBe('');
        expect(window.EuriskoIdentityPref.onboarded()).toBe(false);
    });

    test('点 × 关闭：不落盘（顺手点了一下不该被记成身份）', () => {
        window.EuriskoIdentityOnboarding.open();
        pickById('owner').click();
        document.getElementById('identity-modal-close').click();

        expect(window.closeModal).toHaveBeenCalledTimes(1);
        expect(window.EuriskoIdentityPref.get()).toBe('');
        expect(window.EuriskoIdentityPref.onboarded()).toBe(false);
    });

    test('点遮罩关闭：同样不落盘（e.target 是遮罩本身才算点在外面）', () => {
        window.EuriskoIdentityOnboarding.open();
        pickById('owner').click();
        const mask = document.getElementById('identity-modal');
        mask.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

        expect(window.EuriskoIdentityPref.get()).toBe('');
        // 弹窗内部点一下不算点在外面
        document.getElementById('identity-modal-list')
            .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
        expect(window.closeModal).toHaveBeenCalledTimes(1);
    });

    test('「下一步」是唯一落盘口：身份 + 职务 + 公司一次写完，然后关窗', () => {
        document.body.insertAdjacentHTML('beforeend', '<div id="identity-settings-summary"></div>');
        window.EuriskoIdentityOnboarding.open();
        pickById('finance').click();
        document.getElementById('identity-modal-job').value = '财务经理';
        document.getElementById('identity-modal-company').value = '某某科技';
        document.getElementById('identity-modal-next').click();

        const p = window.EuriskoIdentityPref.profile();
        expect(p.id).toBe('finance');
        expect(p.title).toBe('财务经理');
        expect(p.company).toBe('某某科技');
        expect(p.onboarded).toBe(true);
        expect(window.closeModal).toHaveBeenCalledTimes(1);
        expect(document.getElementById('identity-settings-summary').innerHTML).toContain('财务经理');
    });

    test('「暂时不填」只记"引导看过了"，不写身份（下次登录不再追问，身份仍是没选过）', () => {
        window.EuriskoIdentityOnboarding.open({ firstTime: true });
        pickById('owner').click();
        document.getElementById('identity-modal-skip').click();

        expect(window.EuriskoIdentityPref.onboarded()).toBe(true);
        expect(window.EuriskoIdentityPref.get()).toBe('');
        expect(window.EuriskoIdentityPref.profile().id).toBe('');
    });

    test('职务 / 公司留空完全合法（它们不是登录资料，不校验）', () => {
        window.EuriskoIdentityOnboarding.open();
        pickById('employee').click();
        document.getElementById('identity-modal-next').click();

        expect(window.EuriskoIdentityPref.profile()).toEqual({
            id: 'employee', title: '', company: '', onboarded: true
        });
    });

    test('只改详情不改身份（个人中心里改公司名不该顺手改身份）', () => {
        window.EuriskoIdentityPref.set('hr');
        window.EuriskoIdentityPref.save({ company: '新公司' });

        const p = window.EuriskoIdentityPref.profile();
        expect(p.id).toBe('hr');
        expect(p.company).toBe('新公司');
    });
});

describe('首次登录弹一次', () => {
    test('没走过引导 → 延后一拍弹（登录后的切页与同步还在跑，立刻弹会被重绘盖掉）', () => {
        jest.useFakeTimers();
        const opened = window.EuriskoIdentityOnboarding.maybeOpenAfterLogin();
        expect(opened).toBe(true);
        expect(window.openModal).not.toHaveBeenCalled();

        jest.advanceTimersByTime(400);
        expect(window.openModal).toHaveBeenCalledTimes(1);
        jest.useRealTimers();
    });

    test('走过引导 → 不再弹（点过「暂时不填」的人不该被追问第二次）', () => {
        jest.useFakeTimers();
        window.EuriskoIdentityPref.markOnboarded();
        const opened = window.EuriskoIdentityOnboarding.maybeOpenAfterLogin();

        jest.advanceTimersByTime(400);
        expect(opened).toBe(false);
        expect(window.openModal).not.toHaveBeenCalled();
        jest.useRealTimers();
    });
});

describe('两处身份卡的显示', () => {
    test('「我的」页身份卡：没选过是「我是谁」，选过是「我是 XX」，有职务公司就补在下面', () => {
        document.body.insertAdjacentHTML('beforeend',
            '<div id="profile-identity-card">' +
            '<h3 id="profile-identity-title"></h3><p id="profile-identity-sub"></p></div>');
        const title = () => document.getElementById('profile-identity-title').textContent;
        const sub = () => document.getElementById('profile-identity-sub').textContent;

        window.EuriskoIdentityOnboarding.syncIdentityCard();
        expect(title()).toBe('我是谁');

        window.EuriskoIdentityPref.save({ id: 'owner' });
        window.EuriskoIdentityOnboarding.syncIdentityCard();
        expect(title()).toBe('我是个体户 / 小店');
        expect(sub()).toContain('补上职务');

        window.EuriskoIdentityPref.save({ id: 'owner', title: '店主', company: '某某店' });
        window.EuriskoIdentityOnboarding.syncIdentityCard();
        expect(sub()).toBe('店主 · 某某店');
    });

    test('个人中心摘要三行，没填的显示「未填写」并不加粗（既不写「无」，也不留白）', () => {
        document.body.insertAdjacentHTML('beforeend', '<div id="identity-settings-summary"></div>');
        window.EuriskoIdentityOnboarding.syncSettingsCard();

        const html = document.getElementById('identity-settings-summary').innerHTML;
        expect(html).toContain('未选择');
        expect(html).toContain('未填写');
        expect(document.querySelectorAll('#identity-settings-summary .identity-settings-row'))
            .toHaveLength(3);

        window.EuriskoIdentityPref.save({ id: 'finance', title: '会计' });
        window.EuriskoIdentityOnboarding.syncSettingsCard();
        const rows = document.getElementById('identity-settings-summary').textContent;
        expect(rows).toContain('企业财务');
        expect(rows).toContain('会计');
        expect(rows).toContain('未填写');   // 公司没填
    });
});

describe('三条硬边界', () => {
    test('身份不写计税档案：save 之后档案一次都没被碰过', () => {
        window.EuriskoTaxProfile = { patch: jest.fn(), get: () => ({}) };
        window.EuriskoIdentityOnboarding.open();
        pickById('executive').click();
        document.getElementById('identity-modal-next').click();

        expect(window.EuriskoTaxProfile.patch).not.toHaveBeenCalled();
        expect(window.EuriskoIdentityPref.profile().id).toBe('executive');
    });

    test('index.html 三处落点都在，且首页已无身份 chip（撤走 ≠ 删掉）', () => {
        expect(INDEX_HTML).toContain('id="identity-modal"');
        expect(INDEX_HTML).toContain('id="profile-identity-card"');
        expect(INDEX_HTML).toContain('id="identity-settings-edit"');
        expect(INDEX_HTML).toContain('id="identity-settings-summary"');
        expect(INDEX_HTML).not.toContain('id="home-scenarios"');
        expect(INDEX_HTML).not.toContain('id="home-identity-note"');
    });

    test('弹窗走内容型档（--lg）：6 张卡各带说明才选得动，--sm 塞不下', () => {
        const i = INDEX_HTML.indexOf('id="identity-modal"');
        const block = INDEX_HTML.slice(i, i + 400);
        expect(block).toContain('modal-shell--lg');
    });
});
