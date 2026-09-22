/**
 * 阶段19-9 · 效率层 E1（主体）/ E2（模板）守护测试
 *
 * 这一档的东西**看不见错别字** —— 它们坏了的表现是"数字悄悄不对"和"东西悄悄消失"：
 *
 *   ① 守护 1：不建主体时，全局行为必须与改动前逐字一致（历史 / 方案 / 导出同理）。
 *      主体是给模板归类的头，它一旦开始往工具里塞默认值，就等于替用户改口径 ——
 *      注册表里同一个 key 在不同工具里是不同含义（mode 在经营所得是征收方式、在倒算工具是到手口径），
 *      所以这里钉死：**主体不参与任何计算、不注入任何字段**。
 *   ② 守护 2：模板对拍。模板里填出来的结果必须**逐项等于**手工填同样参数算出来的结果。
 *      最容易错的是"存少了"：只存了 basic 字段，advanced 那份没落地，于是同一份模板
 *      在简明 / 完整两个视图下算出两个数 —— 那才是真的把产品做成了两个。
 *   ③ 只收注册表声明过的键：模板可能被手改、可能来自删了字段的旧版本，
 *      不过滤等于给 compute 开一个任意参数注入的口子（与 19-8 带参链接同一个口径）。
 *   ④ 权益只拦新增：免费 1 主体 / 2 模板，超限**不许删旧的**、也不许静默失败。
 *
 * @jest-environment jsdom
 */
const { loadSource } = require('./helpers/load-source');

const R = () => window.EuriskoToolRegistry;
const TB = () => window.EuriskoToolbox;
const ENT = () => window.EuriskoEntities;
const TPL = () => window.EuriskoTemplates;
const UI = () => window.EuriskoEntityUI;

beforeAll(() => {
    // solver.js 必须排在 tax-calculator 与 quick 模块之前（既有约定）：倒算工具缺了它不报错，
    // 只是**永远返回 null**（net-salary 就是这样被发现的）
    loadSource('src/js/calculation/solver.js');
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/tax-calculator.js');
    loadSource('src/js/calculation/utils.js');
    loadSource('src/js/calculation/tax-registry.js');
    // 全套 quick 模块：compute 里 `if (!window.EuriskoXxxQuick) return null` ——
    // 少加载一个，那个工具就是**静默返回 null**，对拍会变成在拿 null 比 null。
    // social-insurance-quick 必须先于依赖它的模块：那些模块在 IIFE 里就把
    // `var Social = window.EuriskoSocialQuick` 抄成局部变量了，后加载的它根本看不见。
    loadSource('src/js/calculation/social-insurance-quick.js');
    loadSource('src/js/calculation/salary-tax-quick.js');
    loadSource('src/js/calculation/net-salary-quick.js');
    loadSource('src/js/calculation/bonus-tax-quick.js');
    loadSource('src/js/calculation/special-deduction-quick.js');
    loadSource('src/js/calculation/annual-settlement-quick.js');
    loadSource('src/js/calculation/withholding-quick.js');
    loadSource('src/js/calculation/equity-incentive-quick.js');
    loadSource('src/js/calculation/severance-quick.js');
    loadSource('src/js/calculation/early-retirement-quick.js');
    loadSource('src/js/calculation/expat-allowance-quick.js');
    loadSource('src/js/calculation/private-pension-quick.js');
    loadSource('src/js/calculation/health-insurance-quick.js');
    loadSource('src/js/calculation/annuity-quick.js');
    loadSource('src/js/calculation/employer-cost-quick.js');
    loadSource('src/js/calculation/disability-fund-quick.js');
    loadSource('src/js/calculation/vat-quick.js');
    loadSource('src/js/calculation/corporate-income-tax-quick.js');
    loadSource('src/js/calculation/surtax-stamp-quick.js');
    loadSource('src/js/calculation/business-income-quick.js');
    loadSource('src/js/data/tool-registry.js');
    loadSource('src/js/data/tax-profile.js');
    loadSource('src/js/ui/param-memory.js');
    loadSource('src/js/ui/param-link.js');
    loadSource('src/js/data/entity-store.js');
    loadSource('src/js/data/template-store.js');
    loadSource('src/js/ui/toolbox-ui.js');
    loadSource('src/js/ui/entity-ui.js');
});

beforeEach(() => {
    localStorage.clear();
    delete window.EuriskoPlan;
    delete window.apiClient;   // 不清掉的话，上一个用例造的 Pro 用户会把 ownerId 换成另一个账号
    window.showPage = jest.fn();
    document.body.innerHTML = `
        <div id="entity-switcher" class="hidden"></div>
        <div id="tools-page" class="page hidden"><div id="toolbox-groups"></div></div>
        <div id="quick-calculator-page" class="page hidden"></div>
        <div id="quick-title"></div>
        <div id="quick-subtitle"></div>
        <div id="quick-policy-badge"></div>
        <div id="quick-memory-hint" class="hidden"></div>
        <div id="quick-template-bar" class="hidden"></div>
        <div id="quick-form"></div>
        <div id="quick-result-card"><div id="quick-result"></div></div>
        <div id="quick-actions"></div>
        <div id="quick-result-bar" class="hidden"></div>
        <div id="quick-pitfalls"></div>
        <details id="quick-policy-basis" class="hidden"><div id="quick-policy-basis-body"></div></details>
    `;
    TB().renderToolbox('', null);
});

function openTool(id) {
    document.querySelector(`[data-tool-id="${id}"]`).click();
}

function firstToolId() {
    return R().all()[0].id;
}

// 一份"用户真的会填的输入"。注意**不能随手乱造**：多数工具对自己的输入有守卫，
// 越界就返回 null（不是报错），于是"对拍"就变成在拿 null 比 null，什么都没测到。
// 所以以该工具自己的 spec 默认值为底（它们一定是合法的），再尽量扰动一下：
//   ① 数字字段按比例改一改；② 有 select 的换到第二个选项（换口径后仍是同一份模板的证据）。
// 扰动后算不出结果就退回纯默认值 —— 这不影响要验证的东西：存入—取回必须是同一份输入。
function validInput(tool) {
    const base = {};
    (tool.fields || []).forEach((f) => { base[f.key] = f.default; });
    const tries = [];
    const moneyKeys = (tool.fields || []).filter((f) => f.type === 'money' || f.type === 'number')
        .map((f) => f.key);
    if (moneyKeys.length) {
        const c = Object.assign({}, base);
        moneyKeys.forEach((k) => { c[k] = Number(base[k]) * 1.5 + 7; });
        tries.push(c);
    }
    const sel = (tool.fields || []).filter((f) => f.type === 'select' && f.options && f.options.length > 1)[0];
    if (sel) {
        const c = Object.assign({}, base);
        c[sel.key] = sel.options[1].value;
        tries.push(c);
    }
    tries.push(base);
    for (let i = 0; i < tries.length; i++) {
        let r = null;
        try { r = tool.compute(tries[i]); } catch (e) { r = null; }
        if (r && r.primary) return { values: tries[i], reference: r };
    }
    return null;
}

// ==========================================================================
describe('守护 1：不建主体时全局零感知', () => {
    test('没主体时顶栏那块 DOM 一个字都不留', () => {
        UI().renderSwitcher();
        const host = document.getElementById('entity-switcher');
        expect(host.classList.contains('hidden')).toBe(true);
        expect(host.innerHTML).toBe('');
    });

    test('有主体时才出现，并显示当前主体名', () => {
        const res = ENT().save({ name: '杭州某某科技' });
        expect(res.ok).toBe(true);
        UI().renderSwitcher();
        const host = document.getElementById('entity-switcher');
        expect(host.classList.contains('hidden')).toBe(false);
        expect(host.textContent).toContain('杭州某某科技');
    });

    test('主体不参与计算也不注入任何字段：工具默认值仍等于 spec 默认值', () => {
        // 特意建一个「核定征收」的主体：它若按 key 同名注入，那些工具里也叫 mode 的
        // 「到手口径 / 利润怎么填」就会被静默改成另一个意思 —— 那是最难发现的一类 bug。
        ENT().save({ name: '核定主体', levyMode: 'assessed', taxpayerType: 'general' });
        const tool = R().all()[0];
        openTool(tool.id);
        const spec = {};
        tool.fields.forEach((f) => { spec[f.key] = f.default; });
        const rendered = TB().readValues(tool);
        expect(JSON.stringify(rendered)).toEqual(JSON.stringify(spec));
    });

    test('没模板时工具页那条「从模板填充」整条不出现', () => {
        openTool(firstToolId());
        const bar = document.getElementById('quick-template-bar');
        expect(bar.classList.contains('hidden')).toBe(true);
        expect(bar.innerHTML).toBe('');
    });
});

// ==========================================================================
describe('守护 2：模板对拍（填充后算出的数 = 手工填同样参数算出的数）', () => {
    test('每个工具：存了回填的原值算出的结果逐项相等', () => {
        const tools = R().all();
        const tpl = TPL();
        let checked = 0;
        tools.forEach((tool) => {
            tpl.clearAll();      // 免费额度只有 2 份，不逐个清就变成在测额度本身
            const probe = validInput(tool);
            expect(probe ? 'ok' : tool.id).toEqual('ok');   // 前提：这个工具用它的合法输入算得出来
            const values = probe.values;
            const reference = probe.reference;

            // 夹带两个**注册表没声明过**的键：它们必须被丢掉，否则等于给 compute 开后门
            const dirty = Object.assign({}, values, { __evil__: 999, 注入: 'x' });
            const saved = TPL().save({ toolId: tool.id, values: dirty });
            expect(saved.ok).toBe(true);
            expect(saved.template.values.__evil__).toBeUndefined();

            const back = TPL().valuesOf(saved.template.id);
            const after = tool.compute(back);
            expect(JSON.stringify(after.rows || [])).toEqual(JSON.stringify(reference.rows || []));
            expect(JSON.stringify(after.primary)).toEqual(JSON.stringify(reference.primary));
            checked++;
        });
        expect(checked).toBe(20);   // 覆盖面：20 个速算器逐个对拍过，没有一个被跳过
    });

    // 「存少了」最可能出在**此刻没显示的条件字段**上：它们由 when 决定显隐，
    // 取值的若只收屏幕上的控件，这份模板换一个口径打开就少一半参数 ——
    // 而且界面上一个字都不会说。（advanced 字段同理，但速算器眼下全是必填基础字段。）
    test('模板把此刻隐藏的条件字段也存了下来：换口径打开仍是同一份模板', () => {
        const tool = R().get('vat');
        const values = validInput(tool).values;
        const hidden = (tool.fields || []).filter(
            (f) => f.when && f.when.in.indexOf(values[f.when.key]) === -1
        );
        expect(hidden.length).toBeGreaterThan(0);   // 前提：这组参数下确实有隐藏字段

        const reference = tool.compute(values);
        const saved = TPL().save({ toolId: tool.id, values: values });
        hidden.forEach((f) => {
            expect(Object.prototype.hasOwnProperty.call(saved.template.values, f.key)).toBe(true);
            expect(saved.template.values[f.key]).toEqual(values[f.key]);
        });
        const back = TPL().valuesOf(saved.template.id);
        expect(JSON.stringify(tool.compute(back).rows || []))
            .toEqual(JSON.stringify(reference.rows || []));
        expect(tool.compute(back).primary.value).toEqual(reference.primary.value);
    });
});

// ==========================================================================
describe('模板接入界面：填充真的落到表单里', () => {
    test('点模板名 → 表单里的值就是那份模板的值', () => {
        const tool = R().get('vat');
        openTool('vat');
        const values = validInput(tool).values;
        TPL().save({ toolId: 'vat', values: values, name: '月度台账口径' });
        // 换工具再回来，重画一次模板条（真实路径就是"重开这个工具"）
        openTool('vat');
        const bar = document.getElementById('quick-template-bar');
        expect(bar.classList.contains('hidden')).toBe(false);
        expect(bar.textContent).toContain('月度台账口径');

        bar.querySelector('[data-tpl-id]').click();
        // 只比对**此刻真的显示在屏上**的字段：条件没满足而隐藏的那些，DOM 里没有控件，
        // readValues 会对它们返回 spec 默认值 —— 那是结果计算的老口径（见 toolbox-ui 注释），
        // 不是模板没存住。真要保证「照样参与计算」的是上面那条对拍用例。
        const rendered = TB().readValues(tool);
        let visibleCount = 0;
        Object.keys(values).forEach((k) => {
            if (!document.getElementById('qf-' + k)) return;
            visibleCount++;
            expect(String(rendered[k])).toEqual(String(values[k]));
        });
        expect(visibleCount).toBeGreaterThan(3);
    });

    test('「存为模板」按钮：成功说存好了，超限把原因说出来', () => {
        openTool('vat');
        document.getElementById('quick-save-template').click();
        expect(document.getElementById('quick-save-template').textContent).toContain('已存为模板');

        TPL().save({ toolId: 'vat', values: validInput(R().get('vat')).values });
        openTool('vat');
        const btn = document.getElementById('quick-save-template');
        btn.click();
        expect(btn.textContent).toContain('已用完');
        expect(TPL().count()).toBe(2);      // 旧的还在（权益只拦新增，不许删数据）
    });
});

// ==========================================================================
describe('权益刻度：免费 1 主体 / 2 模板，Pro 不限', () => {
    test('第二个主体被拦住，但改第一个照样能改', () => {
        expect(ENT().save({ name: '甲公司' }).ok).toBe(true);
        expect(ENT().save({ name: '乙公司' }).reason).toBe('limit');
        expect(ENT().save({ id: ENT().current().id, name: '甲公司（改名）' }).ok).toBe(true);
        expect(ENT().count()).toBe(1);
        expect(ENT().current().name).toBe('甲公司（改名）');
    });

    test('第三份模板被拦住，前两份一份不少', () => {
        const tool = R().get('vat');
        expect(TPL().save({ toolId: 'vat', values: validInput(tool).values }).ok).toBe(true);
        expect(TPL().save({ toolId: 'bonus-tax', values: validInput(R().get('bonus-tax')).values }).ok).toBe(true);
        expect(TPL().save({ toolId: 'vat', values: validInput(tool).values }).reason).toBe('limit');
        expect(TPL().count()).toBe(2);
    });

    test('Pro 不受限', () => {
        // Pro 判定要求"有登录用户"：游客再怎么也不可能 Pro（这本身就是权益口径的一部分）
        window.EuriskoPlan = { isPro: () => true };
        window.apiClient = { getCurrentUser: () => ({ id: 'u1', plan: 'pro' }) };
        expect(ENT().save({ name: '甲' }).ok).toBe(true);
        expect(ENT().save({ name: '乙' }).ok).toBe(true);
        expect(TPL().save({ toolId: 'vat', values: validInput(R().get('vat')).values }).ok).toBe(true);
        expect(TPL().save({ toolId: 'vat', values: validInput(R().get('vat')).values }).ok).toBe(true);
        expect(TPL().save({ toolId: 'vat', values: validInput(R().get('vat')).values }).ok).toBe(true);
        expect(TPL().count()).toBe(3);
    });
});

// ==========================================================================
describe('挂载主体的模板：可见范围与「删主体不删模板」', () => {
    test('没选主体时只看得到全局模板；删掉主体后它的模板转回全局而不是凭空消失', () => {
        const tool = R().get('vat');
        TPL().save({ toolId: 'vat', values: validInput(tool).values, name: '全局模板' });

        ENT().save({ name: '甲公司' });
        const eid = ENT().current().id;
        TPL().save({ toolId: 'vat', values: validInput(tool).values, name: '甲的模板', entityId: eid });

        expect(TPL().listOf('vat').map((t) => t.name)).toEqual(['全局模板', '甲的模板']);

        ENT().setCurrent('');
        expect(TPL().listOf('vat').map((t) => t.name)).toEqual(['全局模板']);

        ENT().remove(eid);
        const names = TPL().listOf('vat').map((t) => t.name);
        expect(names).toContain('甲的模板');          // 转成全局，而不是跟着主体一起没了
        expect(TPL().byId(TPL().listOf('vat')[1].id).entityId).toBeNull();
    });
});
