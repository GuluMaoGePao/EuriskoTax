/**
 * 我的 → 权益进度条（阶段19-6b，v1.88.0）
 *
 * 不测样式，钉的是三件「肉眼点一遍才知道」的事：
 *   ① 进度条只表达**档位在阶梯上的位置**（三格各一档），不编"距离专业版还差百分之几"；
 *   ② 取不到的数据整行不出现（方案库 / 同步引擎不在时不补 0 —— 0 会被读成"你一套都没存"）；
 *   ③ 升级入口仍是原来那颗 #profile-nav-upgrade（只是从横幅搬进卡里），
 *      文案随档位变，数量与 id 都没变（阶段14「入口只允许两处」）。
 *
 * @jest-environment jsdom
 */
const path = require('path');
const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    loadSource('src/js/ui/profile-benefits.js');
});

const CARD_HTML = `
    <div id="profile-benefits-card" class="hidden">
        <h4 id="profile-benefits-title"></h4>
        <span id="profile-benefits-tier"></span>
        <div id="profile-benefits-steps"></div>
        <p id="profile-benefits-usage" class="hidden"></p>
        <p id="profile-benefits-sync" class="hidden"></p>
        <button type="button" id="profile-nav-upgrade"><i class="fa fa-crown"></i><span>需要更多协助？留资，顾问联系您</span></button>
    </div>`;

// §8-6：前端对未开通用户停用「专业版」（后端档位仍叫 pro），已开通的人必须看得见自己有什么
const TIER_LABELS = { free: '未开通', trial: '体验版', pro: '已开通' };

function fakePlan(key) {
    window.EuriskoPlan = {
        describe: () => ({ key: key, label: TIER_LABELS[key] }),
        isPro: () => key !== 'free'
    };
}
function fakeScenarios(count, limit) {
    window.EuriskoScenarios = {
        list: () => new Array(count).fill({ id: 'x' }),
        limitFor: () => limit
    };
}
function fakeSync(state) {
    window.EuriskoSync = { getState: () => state };
}
const daysAgoIso = (d) => new Date(Date.now() - d * 86400000).toISOString();

const card = () => document.getElementById('profile-benefits-card');
const line = (id) => document.getElementById(id);
const cta = () => document.querySelector('#profile-nav-upgrade span').textContent;

beforeEach(() => {
    delete window.EuriskoPlan;
    delete window.EuriskoScenarios;
    delete window.EuriskoSync;
    document.body.innerHTML = CARD_HTML;
});

describe('权益进度条 · 档位刻度', () => {
    test('未开通：刻度停在第一格，前无「已完成」格', () => {
        fakePlan('free');
        window.EuriskoProfileBenefits.render({ username: 'u' });
        expect(card().classList.contains('hidden')).toBe(false);
        const steps = card().querySelectorAll('.benefit-step');
        expect(steps).toHaveLength(3);
        expect(steps[0].className).toContain('is-current');
        expect(steps[1].className).toContain('is-todo');
        expect(steps[2].className).toContain('is-todo');
        expect(card().textContent).toContain('未开通（当前）');
        // M-02：未开通的人整卡讲的是额度，不是权益
        expect(line('profile-benefits-title').textContent).toBe('我的额度');
    });

    test('体验版：第一格已完成，体验版是当前档', () => {
        fakePlan('trial');
        window.EuriskoProfileBenefits.render({ username: 'u' });
        const steps = card().querySelectorAll('.benefit-step');
        expect(steps[0].className).toContain('is-done');
        expect(steps[1].className).toContain('is-current');
        expect(steps[2].className).toContain('is-todo');
    });

    test('已开通：三格全点亮，当前档是最右那格', () => {
        fakePlan('pro');
        window.EuriskoProfileBenefits.render({ username: 'u' });
        const steps = card().querySelectorAll('.benefit-step');
        expect(steps[0].className).toContain('is-done');
        expect(steps[1].className).toContain('is-done');
        expect(steps[2].className).toContain('is-current');
        expect(line('profile-benefits-title').textContent).toBe('我的权益');
    });

    test('未登录（拿不到档位）：整卡隐藏，不摆一个空壳进度条', () => {
        fakePlan('free');
        window.EuriskoPlan.describe = () => null;
        window.EuriskoProfileBenefits.render(null);
        expect(card().classList.contains('hidden')).toBe(true);
    });
});

describe('权益进度条 · 只说算得出来的', () => {
    test('方案用量写真的：已用 2/2 套方案', () => {
        fakePlan('free');
        fakeScenarios(2, 2);
        window.EuriskoProfileBenefits.render({ username: 'u' });
        expect(line('profile-benefits-usage').classList.contains('hidden')).toBe(false);
        expect(line('profile-benefits-usage').textContent).toBe('已用 2/2 套方案 · 再存需先删一套');
    });

    test('还没用满：只报用量，不多说', () => {
        fakePlan('pro');
        fakeScenarios(3, 10);
        window.EuriskoProfileBenefits.render({ username: 'u' });
        expect(line('profile-benefits-usage').textContent).toBe('已用 3/10 套方案');
    });

    test('方案库不在：这一行整行消失，不补 0', () => {
        fakePlan('free');
        window.EuriskoProfileBenefits.render({ username: 'u' });
        expect(line('profile-benefits-usage').classList.contains('hidden')).toBe(true);
        expect(card().textContent).not.toContain('0 套');
    });

    test('云同步未开启（PAY-05）：说清开通方式，不提档位营销', () => {
        fakePlan('free');
        fakeSync({ proActive: false, lastSyncAt: null });
        window.EuriskoProfileBenefits.render({ username: 'u' });
        expect(line('profile-benefits-sync').textContent).toBe('云同步未开启（需升级码开通）');
        expect(line('profile-benefits-sync').textContent).not.toContain('专业版');
    });

    test('云同步已开启：报上次同步时间', () => {
        fakePlan('pro');
        fakeSync({ proActive: true, lastSyncAt: daysAgoIso(3) });
        window.EuriskoProfileBenefits.render({ username: 'u' });
        expect(line('profile-benefits-sync').textContent).toContain('云同步已开启');
        expect(line('profile-benefits-sync').textContent).toContain('3 天前');
    });

    test('同步引擎不在：这一行整行消失', () => {
        fakePlan('pro');
        window.EuriskoProfileBenefits.render({ username: 'u' });
        expect(line('profile-benefits-sync').classList.contains('hidden')).toBe(true);
    });
});

describe('升级入口（阶段14 约束）', () => {
    test('PAY-03：未开通给留资出口，已开通给「查看我的权益」', () => {
        fakePlan('free');
        window.EuriskoProfileBenefits.render({ username: 'u' });
        expect(cta()).toBe('需要更多协助？留资，顾问联系您');
        expect(cta()).not.toContain('专业版');

        fakePlan('pro');
        window.EuriskoProfileBenefits.render({ username: 'u' });
        expect(cta()).toBe('查看我的权益');
    });

    test('按钮还是原来那一颗（id 不变、全局仍只有一处）', () => {
        fakePlan('free');
        window.EuriskoProfileBenefits.render({ username: 'u' });
        expect(document.querySelectorAll('#profile-nav-upgrade')).toHaveLength(1);
    });
});

describe('健壮性', () => {
    test('容器不存在（游客态 / 我的页未渲染）：不抛错', () => {
        document.body.innerHTML = '';
        fakePlan('free');
        expect(() => window.EuriskoProfileBenefits.render({ username: 'u' })).not.toThrow();
    });

    test('plan 库不在（脚本未加载）：整卡隐藏，不抛错', () => {
        expect(() => window.EuriskoProfileBenefits.render({ username: 'u' })).not.toThrow();
        expect(card().classList.contains('hidden')).toBe(true);
    });
});

describe('相对时间（纯函数）', () => {
    test('今天 / 昨天 / N 天前 / N 个月前', () => {
        const { agoText } = window.EuriskoProfileBenefits.pure;
        const now = new Date('2026-09-21T12:00:00.000Z');
        expect(agoText('2026-09-21T02:00:00.000Z', now)).toBe('今天');
        expect(agoText('2026-09-20T02:00:00.000Z', now)).toBe('昨天');
        expect(agoText('2026-09-11T02:00:00.000Z', now)).toBe('10 天前');
        expect(agoText('2026-07-21T02:00:00.000Z', now)).toBe('2 个月前');
    });
    test('空值与非法值返回空串（不显示 NaN 天前）', () => {
        const { agoText } = window.EuriskoProfileBenefits.pure;
        expect(agoText('', new Date())).toBe('');
        expect(agoText('不是日期', new Date())).toBe('');
    });
});
