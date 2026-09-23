/**
 * 政策时效与政策版本（阶段19-12，v1.103.0）
 *
 * 病：`tax-registry.js` 里 `effectiveFrom` / `expiresOn` / `statusOf` / `expiringWithin`
 * **早就全都有**，但 UI 上只在速算器页渲染了一枚徽标 —— 21 个完整测算（财务 / 代账的
 * 主力入口，他们最怕的就是「政策过期没」）一枚都没有。这不是「少一个功能」，
 * 而是**同一个产品在两个入口上给了两套可信度口径**：同一个 policyKey，
 * 在速算器页看得到有效期，在完整测算页什么都看不到。
 *
 * 这个文件钉三件事：
 *   ① 数据没有洞 —— 每个完整测算都挂了 policyKey（没挂就永远出不了徽标，且不会报错）；
 *   ② 两类入口同一枚 —— deep 结果卡里的徽标必须就是 toolbox 出的那一枚（不是另写一份）；
 *   ③ 三种时效状态的措辞（已过期 / 快到期 / 长期有效），以及拿不到 registry 时静默不出
 *      —— 那是「不确定」，绝不能装作有效。
 *
 * 顺带钉 B4（结果标政策版本）：版本号只问 registry，渲染层不自带数字。
 *
 * @jest-environment jsdom
 */
const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/tax-calculator.js');
    loadSource('src/js/calculation/utils.js');
    loadSource('src/js/calculation/tax-registry.js');
    loadSource('src/js/calculation/vat-quick.js');
    loadSource('src/js/calculation/business-income-quick.js');
    loadSource('src/js/calculation/bonus-tax-quick.js');
    loadSource('src/js/calculation/annual-settlement-quick.js');
    loadSource('src/js/calculation/social-insurance-quick.js');
    loadSource('src/js/ui/mode-pref.js');
    loadSource('src/js/data/tool-registry.js');
    loadSource('src/js/ui/toolbox-ui.js');
    loadSource('src/js/ui/deep-wizard-ui.js');
});

const R = () => window.EuriskoToolRegistry;
const TB = () => window.EuriskoToolbox;
const W = () => window.EuriskoDeepWizard;
const P = () => window.EuriskoModePref;

// 打开某个完整测算并直达结果步（带 values = 「从历史记录看那一条」的同一条路径）
function openResult(toolId) {
    W().open(toolId, { values: {} });
    return document.getElementById('dw-result-card');
}

beforeEach(() => {
    localStorage.clear();
    window.showPage = jest.fn();
    document.body.innerHTML = '<div id="deep-wizard-page" class="page hidden"></div>';
});

// 已知缺口（**显式白名单**，不许默默变多）：政策库里没有「分类所得」条目，
// 所以 classification 刻意不挂 policyKey —— 为凑齐徽标而编一条政策（文号与有效期会印进
// 导出的「政策依据」）比不挂更糟：不挂只是没徽标，挂错是给用户一个错的有效期。
// 补了政策条目就把它从这里删掉，下面的测试会逼着把 policyKey 挂上。
const NO_POLICY_YET = ['classification'];

describe('19-12 政策时效：数据没有洞', () => {
    test('每个完整测算都挂了 policyKey：没挂就永远出不了徽标，而且不会报错', () => {
        const missing = R().deep()
            .filter((t) => !t.policyKey && NO_POLICY_YET.indexOf(t.id) === -1)
            .map((t) => t.id);
        expect(missing).toEqual([]);
    });

    test('缺口不许默默变多（新增 spec 忘挂 policyKey 会立刻红）', () => {
        const stillMissing = R().deep().filter((t) => !t.policyKey).map((t) => t.id);
        stillMissing.forEach((id) => expect(NO_POLICY_YET).toContain(id));
    });

    test('白名单里写的 id 真的存在（拼错或条目已删却留着，这条会红）', () => {
        NO_POLICY_YET.forEach((id) => expect(R().get(id)).toBeTruthy());
    });

    test('挂的 policyKey 都真在政策库里（挂了个不存在的 id 同样静默不出徽标）', () => {
        const reg = window.EuriskoTaxRegistry;
        const bad = R().deep()
            .filter((t) => t.policyKey && !(reg && typeof reg.get === 'function' && reg.get(t.policyKey)))
            .map((t) => t.id + '→' + t.policyKey);
        expect(bad).toEqual([]);
    });
});

describe('19-12 政策时效：两类入口同一枚', () => {
    test('完整测算结果卡里有徽标（此前一枚都没有）', () => {
        const card = openResult('annual-settlement-deep');
        expect(card).toBeTruthy();
        const stamp = document.getElementById('dw-policy-stamp');
        expect(stamp).toBeTruthy();
        expect(stamp.innerHTML.trim()).not.toBe('');
    });

    test('卡的徽标就是速算器那一枚（同一函数出的同一段 HTML，不是另写一份）', () => {
        const card = openResult('annual-settlement-deep');
        expect(card).toBeTruthy();
        const spec = R().get('annual-settlement-deep');
        const expected = TB().policyBadgeOf(spec.policyKey);
        expect(expected).not.toBe('');
        expect(document.getElementById('dw-policy-stamp').innerHTML).toContain(expected);
    });

    test('简明视图下也显示：它是可信标记，不是参数（藏起来等于让用户不知道这次算有没有过期政策）', () => {
        P().set(P().SIMPLE);
        openResult('annual-settlement-deep');
        const stamp = document.getElementById('dw-policy-stamp');
        expect(stamp.innerHTML).toContain(TB().policyBadgeOf(R().get('annual-settlement-deep').policyKey));
    });
});

describe('19-12 三种时效状态的措辞', () => {
    let real;
    beforeEach(() => {
        real = window.EuriskoTaxRegistry;
    });
    afterEach(() => {
        window.EuriskoTaxRegistry = real;
    });

    test('已过期 → 明说结果仅供参考（不能让用户拿一个过期政策的结果去报税）', () => {
        window.EuriskoTaxRegistry = { statusOf: () => ({ expired: true, daysLeft: -5, expiresOn: '2020-01-01' }) };
        expect(TB().policyBadgeOf('x')).toContain('已过期');
    });

    test('180 天内到期 → 给出到期日与剩余天数（这才叫提醒）', () => {
        window.EuriskoTaxRegistry = { statusOf: () => ({ expired: false, daysLeft: 30, expiresOn: '2026-10-23' }) };
        const html = TB().policyBadgeOf('x');
        expect(html).toContain('2026-10-23');
        expect(html).toContain('剩 30 天');
    });

    test('长期有效 / 远期政策 → 只说有效期，不吓唬人', () => {
        window.EuriskoTaxRegistry = { statusOf: () => ({ expired: false, daysLeft: null, expiresOn: null }) };
        expect(TB().policyBadgeOf('x')).toContain('长期有效');
    });

    test('拿不到政策库 → 静默不出（不确定就说不确定，绝不装作长期有效）', () => {
        window.EuriskoTaxRegistry = undefined;
        expect(TB().policyBadgeOf('x')).toBe('');
    });
});

describe('19-12 B4 结果标政策版本', () => {
    let real;
    beforeEach(() => {
        real = window.EuriskoTaxRegistry;
    });
    afterEach(() => {
        window.EuriskoTaxRegistry = real;
    });

    test('版本来自政策库，渲染层不自带数字（自带就一定会在改口径时忘同步）', () => {
        window.EuriskoTaxRegistry = Object.assign({}, real, { VERSION: '2026.3' });
        expect(TB().policyVersionHtml()).toContain('2026.3');
    });

    test('政策库不给版本 → 不标，也不编一个', () => {
        window.EuriskoTaxRegistry = { VERSION: '' };
        expect(TB().policyVersionHtml()).toBe('');
    });

    test('完整测算结果卡里也有版本（报告要能交代「按哪年政策算的」）', () => {
        openResult('annual-settlement-deep');
        expect(document.getElementById('dw-policy-stamp').innerHTML).toContain('政策版本');
    });
});
