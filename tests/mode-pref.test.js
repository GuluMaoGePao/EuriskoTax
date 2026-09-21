/**
 * 视图密度（简明 / 完整）测试 — 阶段19-7
 *
 * 这个文件钉的是「一个产品不能长成两个」：
 *   ① 口径对拍   —— 同一组输入，两种视图下 compute 的结果必须逐项相等（单一真源是 tax-calculator.js）；
 *   ② 默认值一致 —— 简明视图收起来的 advanced 字段，参与计算的值必须就是 spec 的 default，
 *                   而不是「没了」（那会变成另一套算出来的税）；
 *   ③ 切换不丢数据 —— 简明 ↔ 完整来回切，已经填过的值必须还在（折叠 ≠ 删除）。
 *
 * 另外钉住偏好本身：默认简明、游客可用、非法值退回简明、订阅可退订、reset 供用例间隔离。
 *
 * @jest-environment jsdom
 */
const { loadSource } = require('./helpers/load-source');

// 阶段19-7 第一批打了 level:'advanced' 的 6 个高频完整测算（注册表是纯增量声明：没标的一律 basic）
const TAGGED = ['forward', 'business', 'bonus-tax-deep', 'annual-settlement-deep', 'vat-deep', 'social-base-deep'];

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
    // 视图偏好必须排在 toolbox-ui / deep-wizard-ui 之前（index.html 里的顺序也是这样）
    loadSource('src/js/ui/mode-pref.js');
    loadSource('src/js/data/tool-registry.js');
    loadSource('src/js/ui/toolbox-ui.js');
    loadSource('src/js/ui/deep-wizard-ui.js');
});

// 填值要按控件来：select 只能取选项里的值，硬赋 '12345' 会被 jsdom 静默忽略（测得像"没填"）
function fill(el, want) {
    if (el.tagName === 'SELECT') {
        const other = Array.from(el.options).map((o) => o.value).find((v) => v !== el.value);
        el.value = other === undefined ? el.value : other;
    } else {
        el.value = want;
    }
    return el.value;
}

const P = () => window.EuriskoModePref;
const W = () => window.EuriskoDeepWizard;
const R = () => window.EuriskoToolRegistry;
const TB = () => window.EuriskoToolbox;

beforeEach(() => {
    // 只清存储、不清订阅：两个渲染器在**模块加载时**挂的那次订阅没有重建的机会，
    // reset() 会把它们一起清掉，后面的用例就再也收不到变更（最后一条用例才调 reset）。
    localStorage.clear();
    window.showPage = jest.fn();
    document.body.innerHTML = '<div id="deep-wizard-page" class="page hidden"></div>';
});

describe('视图密度偏好', () => {
    test('默认简明：没设过偏好的人不该先撞上一屏参数', () => {
        expect(P().get()).toBe(P().SIMPLE);
        expect(P().label()).toBe('简明');
    });

    test('记住偏好：设过完整之后，重新读仍是完整', () => {
        expect(P().set(P().FULL)).toBe(P().FULL);
        expect(P().get()).toBe(P().FULL);
        expect(P().toggle()).toBe(P().SIMPLE);
        expect(P().get()).toBe(P().SIMPLE);
    });

    test('非法值一律退回简明 —— 存坏了也不该渲染出一个半吊子模式', () => {
        localStorage.setItem('euriskoPrefMode', 'pro');
        expect(P().get()).toBe(P().SIMPLE);
        expect(P().set('随便什么')).toBe(P().SIMPLE);
    });

    test('订阅：变更才通知，同值不重复通知，退订后不再通知', () => {
        const got = [];
        const off = P().onChange((m) => got.push(m));
        P().set(P().FULL);
        P().set(P().FULL);              // 同值：不该再通知一次（否则重画会白跑一遍）
        expect(got).toEqual([P().FULL]);
        off();
        P().set(P().SIMPLE);
        expect(got).toEqual([P().FULL]);
    });

    test('pill：两个分段常驻、当前档只有一个高亮', () => {
        const html = TB().modePillHtml();
        expect(html).toContain('data-mode="simple"');
        expect(html).toContain('data-mode="full"');
        P().set(P().SIMPLE);
        expect((TB().modePillHtml().match(/is-on/g) || []).length).toBe(1);
        expect(TB().modePillHtml().indexOf('data-mode="simple"')).toBeLessThan(
            TB().modePillHtml().indexOf('data-mode="full"')
        );
    });
});

describe('守护①：口径对拍（两种视图算出来的必须逐项相等）', () => {
    test.each(TAGGED)('%s：简明与完整走同一份 compute，结果逐项相等', (id) => {
        const t = R().get(id);
        expect(t).toBeTruthy();
        // 「同一组输入」取 spec 默认值：DOM 里一个控件都没有，readValues 给的正是 default
        const values = TB().readValues(t);
        P().set(P().SIMPLE);
        const inSimple = JSON.parse(JSON.stringify(t.compute(values)));
        P().set(P().FULL);
        const inFull = JSON.parse(JSON.stringify(t.compute(values)));
        expect(inFull).toEqual(inSimple);
    });
});

describe('守护②：默认值一致（收起来的字段按 default 参与计算，不是消失）', () => {
    test.each(TAGGED)('%s：简明视图把 advanced 步合并成一步，且字段仍在（带 default）', (id) => {
        const t = R().get(id);
        const advSteps = (t.steps || []).filter((s) => s.level === 'advanced');
        expect(advSteps.length).toBeGreaterThan(0);   // 这条用例只对打过标的 spec 有意义

        P().set(P().SIMPLE);
        const simpleSteps = W().stepsOf(t).filter((s) => !s.result);
        expect(simpleSteps.map((s) => s.key)).not.toContain(advSteps[0].key);
        // 合并的那一步能取到全部 advanced 步的字段 —— 收起来的是「放在哪一步」，不是「有没有」
        const merged = W().fieldsOfStep(t, simpleSteps[simpleSteps.length - 1].key);
        expect(merged.length).toBeGreaterThan(0);
        merged.forEach((f) => expect(f.default).not.toBeUndefined());
        // 合并只发生在简明视图：完整视图一步不少
        P().set(P().FULL);
        expect(W().stepsOf(t).filter((s) => !s.result)).toHaveLength((t.steps || []).length);
    });
});

describe('守护③：切换不丢数据', () => {
    test('advanced 字段收进折叠块后仍在 DOM 里 —— 值读得到，不是被 display:none 藏掉', () => {
        const adv = { key: 'zExtra', label: '附加项', type: 'number', default: 7, level: 'advanced' };
        const tool = { id: 'tmp', fields: [adv] };
        document.body.innerHTML = '<div id="tmp-form">' + TB().advancedBlockHtml([adv], {}) + '</div>';

        expect(document.getElementById('qf-zExtra')).toBeTruthy();         // 还在 DOM 里
        expect(document.body.innerHTML).not.toContain('display:none');     // 不是真的藏起来
        document.getElementById('qf-zExtra').value = '99';
        expect(TB().readValues(tool).zExtra).toBe(99);                     // 读得到 → 重画不会打成默认值
    });

    test('简明 → 完整：当前步已填的值不会被 default 盖掉', () => {
        P().set(P().SIMPLE);
        const t = R().get('forward');
        W().open('forward');
        // 优先取数字字段（select 的值只能取选项里的，随手赋 '12345' 会被 jsdom 静默忽略）；
        // repeater 的控件 id 带下标，不在 #qf-<key> 这条路上，排除掉。
        const stepFields = W().fieldsOfStep(t, W().stepsOf(t)[0].key).filter((f) => f.type !== 'repeater');
        const firstKey = (stepFields.find((f) => f.type === 'number') || stepFields[0]).key;
        const el = document.getElementById('qf-' + firstKey);
        expect(el).toBeTruthy();
        const filled = fill(el, '12345');

        P().set(P().FULL);                                   // 订阅里先 collect 再重画
        expect(String(W().values()[firstKey])).toBe(String(filled));
    });

    test('完整 → 简明：advanced 步收起来后，之前填的 advanced 值仍在 state 里', () => {
        P().set(P().FULL);
        const t = R().get('forward');
        W().open('forward');
        const advStep = (t.steps || []).find((s) => s.level === 'advanced');
        const advFields = W().fieldsOfStep(t, advStep.key);
        const k = (advFields.find((f) => f.type === 'number') || advFields[0]).key;
        const filled = fill(document.getElementById('qf-' + k), '321');

        P().set(P().SIMPLE);                                 // 收起 advanced 步
        expect(String(W().values()[k])).toBe(String(filled));
    });
});

// 放最后：reset() 会连两个渲染器在模块加载时挂的订阅一起清掉，后面的用例就收不到变更了
describe('reset（用例隔离用）', () => {
    test('清回默认并清空订阅', () => {
        P().set(P().FULL);
        const got = [];
        P().onChange((m) => got.push(m));
        P().reset();
        expect(P().get()).toBe(P().SIMPLE);
        P().set(P().FULL);
        expect(got).toEqual([]);
    });
});
