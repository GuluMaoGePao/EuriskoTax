/**
 * 工具箱 UI 冒烟测试（jsdom）
 *
 * 这个文件不测算法（算法由各 *-quick.test.js 对拍），只钉住「页面到底能不能用」：
 *   ① 工具页渲染出 20 个入口、分组齐全；
 *   ② 搜索能过滤（用户找不到入口 = 白做）；
 *   ③ 首页「我是谁」场景入口能按身份筛选；
 *   ④ 点开一个 App 内速算器：表单渲染出来、主结果算出来、易错口径渲染出来、下一步有出口；
 *   ⑤ 点开深度流程：走的是原有隐藏按钮（与既有初始化逻辑同源，不会两条路走岔）；
 *   ⑥ 底部 Tab 栏只在顶层页出现（计算页有自己的预览条，两层底栏会打架）。
 * 这些都是「肉眼点一遍才知道」的事，一旦回归就没人再点第二遍，所以固化成断言。
 *
 * @jest-environment jsdom
 */
const fs = require('fs');
const path = require('path');
const { loadSource } = require('./helpers/load-source');

const PROJECT_ROOT = path.resolve(__dirname, '..');

const QUICK_MODULES = [
    'social-insurance-quick.js',
    'salary-tax-quick.js',
    'bonus-tax-quick.js',
    'net-salary-quick.js',
    'special-deduction-quick.js',
    'annual-settlement-quick.js',
    'withholding-quick.js',
    'equity-incentive-quick.js',
    'severance-quick.js',
    'early-retirement-quick.js',
    'expat-allowance-quick.js',
    'private-pension-quick.js',
    'health-insurance-quick.js',
    'annuity-quick.js',
    'employer-cost-quick.js',
    'disability-fund-quick.js',
    'surtax-stamp-quick.js',
    'business-income-quick.js',
    'vat-quick.js',
    'corporate-income-tax-quick.js'
];

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/tax-calculator.js');
    // 17B-4（v1.50.0）：helper-functions.js 随分类所得页面删除（它是最后一个页面式 deep）。
    loadSource('src/js/calculation/tax-registry.js');
    QUICK_MODULES.forEach((f) => loadSource('src/js/calculation/' + f));
    loadSource('src/js/data/tool-registry.js');
    loadSource('src/js/ui/toolbox-ui.js');
});

beforeEach(() => {
    localStorage.removeItem('euriskoToolRecent');
    document.body.innerHTML = `
        <button id="toolbox-search-entry"></button>
        <div id="home-scenarios"></div>
        <div id="home-recent-tools-card" class="hidden"><div id="home-recent-tools"></div></div>
        <div id="mode-selection-page" class="page active"></div>
        <div id="tools-page" class="page hidden">
            <input id="toolbox-search" />
            <div id="toolbox-scenario-chip" class="hidden"></div>
            <div id="toolbox-groups"></div>
            <div id="toolbox-deep">
                <div class="mode-card" id="forward-mode-card"><button id="forward-mode-btn"></button></div>
                <div id="toolbox-deep-extra" class="hidden"></div>
            </div>
        </div>
        <div id="quick-calculator-page" class="page hidden"></div>
        <div id="profile-page" class="page hidden"></div>
        <div id="quick-title"></div>
        <div id="quick-subtitle"></div>
        <div id="quick-policy-badge"></div>
        <div id="quick-form"></div>
        <div id="quick-result-card"><div id="quick-result"></div></div>
        <div id="quick-actions"></div>
        <div id="quick-pitfalls"></div>
        <details id="quick-policy-basis" class="hidden">
            <div id="quick-policy-basis-body"></div>
            <button type="button" id="quick-basis-copy">复制政策文号</button>
        </details>
        <div id="quick-next" class="hidden"></div>
        <a id="quick-seo-link"></a>
        <button id="quick-back-btn"></button>
        <div id="quick-result-bar" class="hidden">
            <span id="quick-result-bar-label"></span>
            <span id="quick-result-bar-value"></span>
        </div>
        <nav id="bottom-tabbar" class="hidden">
            <button class="bottom-tab" data-tab="mode-selection-page"></button>
            <button class="bottom-tab" data-tab="tools-page"></button>
            <button class="bottom-tab" data-tab="profile-page"></button>
        </nav>
        <nav id="top-tabbar" class="hidden">
            <button class="top-tab" data-tab="mode-selection-page"></button>
            <button class="top-tab" data-tab="tools-page"></button>
            <button class="top-tab" data-tab="profile-page"></button>
        </nav>
    `;
    // 显式传 null：清掉上一个用例可能设置的身份筛选，保证每个用例都从完整工具页开始
    window.EuriskoToolbox.renderToolbox('', null);
});

describe('工具页', () => {
    test('默认渲染 20 个速算器入口，并给出 5 个分组标题', () => {
        expect(document.querySelectorAll('#toolbox-groups .tool-entry')).toHaveLength(20);
        expect(document.querySelectorAll('#toolbox-groups .tool-group')).toHaveLength(5);
    });

    test('搜索能过滤到唯一工具', () => {
        window.EuriskoToolbox.renderToolbox('增值税');
        const entries = document.querySelectorAll('#toolbox-groups .tool-entry');
        expect(entries).toHaveLength(1);
        expect(entries[0].getAttribute('data-tool-id')).toBe('vat');
    });

    test('搜索别名也能命中（用户不会打政策术语）', () => {
        window.EuriskoToolbox.renderToolbox('谈薪');
        const ids = Array.from(document.querySelectorAll('#toolbox-groups .tool-entry')).map((el) => el.getAttribute('data-tool-id'));
        expect(ids).toContain('net-salary');
    });

    // 注意关键词：17C-5 之后「残保金」已有自己的完整测算，会命中 deep 组，不能再用它测「无命中」。
    test('搜索无命中时收起完整测算组（不把无关入口留在结果里）', () => {
        window.EuriskoToolbox.renderToolbox('房产税');
        expect(document.getElementById('toolbox-deep').classList.contains('hidden')).toBe(true);
    });

    // 反过来的那条：deep 命中时必须露出，否则用户搜到了税种却看不到它的完整测算入口。
    // spec 驱动的 deep 是动态渲染进 #toolbox-deep-extra 的（不在 index.html 里写死），
    // 这条用例同时守住「新增 deep 不需要改 HTML 就能被搜到」这件事。
    test('搜索命中完整测算时露出该组（残保金 → 残保金与工会经费）', () => {
        window.EuriskoToolbox.renderToolbox('残保金');
        expect(document.getElementById('toolbox-deep').classList.contains('hidden')).toBe(false);
        const ids = Array.from(document.querySelectorAll('#toolbox-deep [data-tool-id]'))
            .map((el) => el.getAttribute('data-tool-id'));
        expect(ids).toContain('disability-fund-deep');
    });
});

describe('首页「我是谁」场景入口', () => {
    // 阶段19-2：原「企业财务 / HR」拆成「企业财务 / 会计」与「HR / 薪酬」两张 —— 会计关心企税与附加，
    // HR 关心用工成本与社保，塞在一张卡里默认视图给谁都不对。身份卡 5 → 6，工具可达性不受影响。
    test('渲染 6 张身份卡', () => {
        window.EuriskoToolbox.renderScenarios();
        expect(document.querySelectorAll('#home-scenarios .scenario-card')).toHaveLength(6);
    });

    test('按身份筛选：只出该身份的工具，并显示可清除的筛选条', () => {
        window.EuriskoToolbox.openScenario('employee');
        const ids = Array.from(document.querySelectorAll('#toolbox-groups .tool-entry')).map((el) => el.getAttribute('data-tool-id'));
        expect(ids).toHaveLength(5);
        expect(ids).toContain('salary-tax');
        expect(ids).toContain('bonus-tax');
        expect(document.getElementById('toolbox-scenario-chip').classList.contains('hidden')).toBe(false);
        // 筛选态下不混入多步骤流程（形态差异不该出现在按身份挑的工具里）
        expect(document.getElementById('toolbox-deep').classList.contains('hidden')).toBe(true);
    });
});

describe('通用速算器页', () => {
    test('点开 App 内速算器：标题 / 表单 / 结果 / 易错口径都渲染出来', () => {
        document.querySelector('[data-tool-id="vat"]').click();
        expect(document.getElementById('quick-title').textContent).toBe('增值税');
        expect(document.querySelectorAll('#quick-form .tool-field').length).toBeGreaterThan(0);
        expect(document.querySelector('#quick-result .tool-result-primary-value').textContent).toMatch(/¥/);
        expect(document.querySelectorAll('#quick-pitfalls li').length).toBeGreaterThan(0);
        // 政策时效徽标（增值税小规模减按是阶段性优惠，必须显示到期日）
        expect(document.getElementById('quick-policy-badge').textContent).toMatch(/\d{4}-\d{2}-\d{2}/);
    });

    test('改动输入即时重算（不是再点一次按钮才算）', () => {
        document.querySelector('[data-tool-id="bonus-tax"]').click();
        const read = () => document.querySelector('#quick-result .tool-result-primary-value').textContent;
        const before = read();
        const input = document.getElementById('qf-bonus');
        input.value = '36001';
        input.dispatchEvent(new window.Event('input', { bubbles: true }));
        expect(read()).not.toBe(before);
    });

    test('切换计税场景会重建表单（条件字段）', () => {
        document.querySelector('[data-tool-id="vat"]').click();
        // 小规模：销售额 / 纳税期 / 专票销售额
        expect(document.getElementById('qf-sales')).toBeTruthy();
        expect(document.getElementById('qf-inputTax')).toBeNull();

        const sel = document.getElementById('qf-variant');
        sel.value = 'general';
        sel.dispatchEvent(new window.Event('change', { bubbles: true }));

        // 一般纳税人：销项 / 进项 / 税率，小规模的字段要消失
        expect(document.getElementById('qf-inputTax')).toBeTruthy();
        expect(document.getElementById('qf-sales')).toBeNull();
    });
});

describe('结果页「下一步」', () => {
    test('给出相关工具与保存入口（结果不该是终点）', () => {
        document.querySelector('[data-tool-id="vat"]').click();
        const box = document.getElementById('quick-next');
        expect(box.classList.contains('hidden')).toBe(false);
        expect(box.querySelectorAll('.tool-next-item').length).toBeGreaterThan(0);
        expect(document.getElementById('quick-save-history')).toBeTruthy();
    });

    test('保存到历史写入 taxCalculationHistory（与首页「最近计算」同源）', () => {
        localStorage.removeItem('taxCalculationHistory');
        document.querySelector('[data-tool-id="vat"]').click();
        document.getElementById('quick-save-history').click();
        const list = JSON.parse(localStorage.getItem('taxCalculationHistory') || '[]');
        expect(list).toHaveLength(1);
        expect(list[0].type).toBe('quick');
        expect(list[0].toolId).toBe('vat');
    });

    test('导出 PDF：速算器结果也能带走一份（不再是多步骤流程的专利）', () => {
        const exported = [];
        window.EuriskoQuickReport = {
            exportQuickResult: function (tool) { exported.push(tool.id); return true; }
        };
        try {
            document.querySelector('[data-tool-id="vat"]').click();
            const btn = document.getElementById('quick-export-pdf');
            expect(btn).toBeTruthy();
            btn.click();
            expect(exported).toEqual(['vat']);
            expect(btn.disabled).toBe(true);
        } finally {
            delete window.EuriskoQuickReport;
        }
    });

    test('导出组件缺失时按钮不假成功（留着让用户再来一次）', () => {
        document.querySelector('[data-tool-id="vat"]').click();
        const btn = document.getElementById('quick-export-pdf');
        btn.click(); // window.EuriskoQuickReport 未定义
        expect(btn.disabled).toBe(false);
        expect(btn.textContent).toContain('导出 PDF');
    });
});

describe('深度流程入口', () => {
    test('点开深度工具走的是原有无素（与既有初始化逻辑同源）', () => {
        const clicked = jest.fn();
        document.getElementById('forward-mode-btn').addEventListener('click', clicked);
        window.EuriskoToolbox.openTool('forward');
        expect(clicked).toHaveBeenCalled();
    });
});

describe('导航双形态（手机底栏 + 桌面顶栏）', () => {
    test('顶层页显示，计算页隐藏（计算页有自己的预览条）', () => {
        window.EuriskoToolbox.updateTabBar();
        expect(document.getElementById('bottom-tabbar').classList.contains('hidden')).toBe(false);

        document.getElementById('mode-selection-page').classList.remove('active');
        document.getElementById('quick-calculator-page').classList.add('active');
        window.EuriskoToolbox.updateTabBar();
        expect(document.getElementById('bottom-tabbar').classList.contains('hidden')).toBe(true);
    });

    // 两端各有一套 DOM，但是**同一份状态**的两种投影。这条断言防止日后两端各自维护
    // 显隐逻辑、出现「手机上高亮首页、桌面上却没收起」这类不同步。
    test('两端同步：底栏与顶栏的显隐和激活态始终一致', () => {
        window.EuriskoToolbox.syncNav();
        const bar = document.getElementById('bottom-tabbar');
        const top = document.getElementById('top-tabbar');
        expect(bar.classList.contains('hidden')).toBe(false);
        expect(top.classList.contains('hidden')).toBe(false);
        expect(document.querySelector('#bottom-tabbar .bottom-tab.active').dataset.tab).toBe('mode-selection-page');
        expect(document.querySelector('#top-tabbar .top-tab.active').dataset.tab).toBe('mode-selection-page');

        document.getElementById('mode-selection-page').classList.remove('active');
        document.getElementById('profile-page').classList.add('active');
        window.EuriskoToolbox.syncNav();
        expect(document.querySelector('#bottom-tabbar .bottom-tab.active').dataset.tab).toBe('profile-page');
        expect(document.querySelector('#top-tabbar .top-tab.active').dataset.tab).toBe('profile-page');

        document.getElementById('profile-page').classList.remove('active');
        document.getElementById('quick-calculator-page').classList.add('active');
        window.EuriskoToolbox.syncNav();
        expect(bar.classList.contains('hidden')).toBe(true);
        expect(top.classList.contains('hidden')).toBe(true);
    });

    // 助手是情境动作而非目的地，不占导航位 —— 两个 Tab 位给真正的主目的地。
    test('助手不再占导航位（情境入口由悬浮球与结果页承担）', () => {
        expect(document.querySelector('.bottom-tab[data-tab="assistant"]')).toBeNull();
        expect(document.querySelector('.top-tab[data-tab="assistant"]')).toBeNull();
    });

    test('updateTabBar 与 syncNav 等价（兼容旧调用点）', () => {
        expect(window.EuriskoToolbox.updateTabBar).toBe(window.EuriskoToolbox.syncNav);
    });
});

// S2（底栏避让）与 S5（容器加宽）的交叉点。这条 padding 原本写在 `#tools-page .max-w-3xl` 上，
// S5 把容器加宽到 max-w-5xl 之后它立刻匹配不到任何元素，工具页最后一张卡被底栏压住。
// jsdom 没有布局引擎，纯 DOM 断言发现不了这种「选择器静默失效」，只能钉在源码层面。
describe('底栏避让 padding 的锚点', () => {
    const css = fs.readFileSync(path.join(PROJECT_ROOT, 'src/css/toolbox.css'), 'utf8');
    const html = fs.readFileSync(path.join(PROJECT_ROOT, 'index.html'), 'utf8');

    test('避让规则锚在结构上，不锚在宽度工具类上', () => {
        // 剥掉注释再查：本文件用注释记着这次踩坑的经过，那段文字里必然出现 `.max-w-3xl`
        const declarationsOnly = css.replace(/\/\*[\s\S]*?\*\//g, '');
        expect(declarationsOnly).toContain('body.has-tabbar [data-page-container]');
        // 宽度是会被反复调的排版决策：它一旦出现在选择器里，就是下一颗同样的雷
        expect(declarationsOnly).not.toMatch(/\.max-w-/);
    });

    test('两个顶层页各自标出一个 data-page-container', () => {
        ['mode-selection-page', 'tools-page'].forEach((id) => {
            const fromPage = html.slice(html.indexOf(`id="${id}"`));
            expect(fromPage.slice(0, 600)).toContain('data-page-container');
        });
    });
});

describe('最近使用', () => {
    test('点过的工具会进最近使用，并在无搜索时出现', () => {
        localStorage.removeItem('euriskoToolRecent');
        document.querySelector('[data-tool-id="salary-tax"]').click();
        window.EuriskoToolbox.renderToolbox('');
        const titles = Array.from(document.querySelectorAll('#toolbox-groups .tool-group-title')).map((el) => el.textContent);
        expect(titles).toContain('最近使用');
    });
});

// ====== 阶段19-3：工具页降载 ======
// 41 个入口一次全铺开等于没有目录：场景组默认折叠、记忆展开、卡片带状态微标签、
// 进页面就聚焦搜索。三条验收都钉在这儿：**入口可达性不能因为降载而变差**。
describe('阶段19-3：41 个入口全部可达', () => {
    test('20 个速算器 + 21 个完整测算，每个都有落点', () => {
        const R = window.EuriskoToolRegistry;
        const quick = R.all().map((t) => t.id);
        const deep = R.deep().map((t) => t.id);
        expect(quick).toHaveLength(20);
        expect(deep).toHaveLength(21);

        const inGroups = new Set(Array.from(document.querySelectorAll('#toolbox-groups [data-tool-id]'))
            .map((el) => el.getAttribute('data-tool-id')));
        quick.forEach((id) => expect(inGroups.has(id)).toBe(true));

        // 完整测算有两种落点：静态 mode card（4 个）/ 动态渲染进 #toolbox-deep-extra
        deep.forEach((id) => {
            const byCard = !!document.getElementById(id + '-mode-card');
            const byEntry = !!document.querySelector('#toolbox-deep-extra [data-tool-id="' + id + '"]');
            expect(byCard || byEntry).toBe(true);
        });
    });

    test('折叠不删 DOM：入口始终在文档里（降载不能降掉可达性）', () => {
        expect(document.querySelectorAll('#toolbox-groups .tool-entry')).toHaveLength(20);
        expect(document.querySelectorAll('#toolbox-groups .tool-group.is-collapsed')).toHaveLength(5);
    });
});

describe('阶段19-3：场景组折叠与记忆', () => {
    beforeEach(() => {
        localStorage.removeItem('euriskoToolGroupOpen');
        window.EuriskoToolbox.renderToolbox('', null);
    });

    test('默认折叠 5 个场景组（41 个入口不该一次全铺开）', () => {
        const groups = document.querySelectorAll('#toolbox-groups .tool-group');
        expect(groups).toHaveLength(5);
        Array.from(groups).forEach((g) => expect(g.classList.contains('is-collapsed')).toBe(true));
        // 折叠时组头要写明里面有几个，否则用户不知道该不该展开
        expect(document.querySelector('#toolbox-groups .tool-group-count').textContent).toMatch(/\d+ 个/);
    });

    test('点组头展开，并记住展开状态（下次进来还是展开的）', () => {
        const head = document.querySelector('#toolbox-groups [data-group-toggle="salary"]');
        head.click();
        expect(document.getElementById('toolbox-groups').querySelector('[data-group="salary"]')
            .classList.contains('is-collapsed')).toBe(false);
        expect(head.getAttribute('aria-expanded')).toBe('true');
        expect(JSON.parse(localStorage.getItem('euriskoToolGroupOpen') || '{}').salary).toBe(true);

        // 重新渲染 = 下次进页面：记忆生效
        window.EuriskoToolbox.renderToolbox('', null);
        expect(document.querySelector('#toolbox-groups [data-group="salary"]')
            .classList.contains('is-collapsed')).toBe(false);
        // 没点过的组仍然折叠
        expect(document.querySelector('#toolbox-groups [data-group="corp"]')
            .classList.contains('is-collapsed')).toBe(true);
    });

    test('再点一次收起，记忆随之改回', () => {
        const head = document.querySelector('#toolbox-groups [data-group-toggle="salary"]');
        head.click();
        document.querySelector('#toolbox-groups [data-group-toggle="salary"]').click();
        expect(JSON.parse(localStorage.getItem('euriskoToolGroupOpen') || '{}').salary).toBe(false);
    });

    // 搜索时折叠毫无意义：用户就是要看结果 —— 且强制展开**不写进记忆**，
    // 否则搜一次就把所有组的默认状态改掉了。
    test('搜索态强制展开，且不污染记忆', () => {
        window.EuriskoToolbox.renderToolbox('增值税');
        const groups = document.querySelectorAll('#toolbox-groups .tool-group');
        expect(groups.length).toBeGreaterThan(0);
        Array.from(groups).forEach((g) => expect(g.classList.contains('is-collapsed')).toBe(false));
        expect(localStorage.getItem('euriskoToolGroupOpen')).toBeNull();
    });

    test('按身份筛选同样展开（挑完身份还要再点开一层，等于没筛）', () => {
        window.EuriskoToolbox.openScenario('employee');
        expect(document.querySelector('#toolbox-groups [data-group="scenario"]')
            .classList.contains('is-collapsed')).toBe(false);
    });
});

describe('阶段19-3：卡片状态微标签', () => {
    beforeEach(() => {
        localStorage.removeItem('taxCalculationHistory');
        window.EuriskoToolbox.renderToolbox('', null);
    });

    test('算过：读 taxCalculationHistory，写明天数（与首页「最近计算」同源）', () => {
        localStorage.setItem('taxCalculationHistory', JSON.stringify([
            { id: 'h1', toolId: 'vat', type: 'quick', date: new Date(Date.now() - 3 * 86400000).toISOString() },
            { id: 'h2', toolId: 'vat', type: 'quick', date: new Date(Date.now() - 10 * 86400000).toISOString() }
        ]));
        window.EuriskoToolbox.renderToolbox('', null);
        const card = document.querySelectorAll('#toolbox-groups [data-tool-id="vat"]')[0];
        // 两条历史取**最近**那一条：3 天前，不是 10 天前
        expect(card.textContent).toContain('算过 · 3 天前');
    });

    test('今天算过的说「今天算过」，超过 30 天只说「算过」（不吓人也不假精确）', () => {
        localStorage.setItem('taxCalculationHistory', JSON.stringify([
            { id: 'h1', toolId: 'salary-tax', type: 'quick', date: new Date().toISOString() },
            { id: 'h2', toolId: 'vat', type: 'quick', date: new Date(Date.now() - 90 * 86400000).toISOString() }
        ]));
        window.EuriskoToolbox.renderToolbox('', null);
        expect(document.querySelector('#toolbox-groups [data-tool-id="salary-tax"]').textContent).toContain('今天算过');
        expect(document.querySelector('#toolbox-groups [data-tool-id="vat"]').textContent).toContain('算过');
        expect(document.querySelector('#toolbox-groups [data-tool-id="vat"]').textContent).not.toContain('天前');
    });

    test('没算过的工具不带「算过」标签（不编造痕迹）', () => {
        expect(document.querySelector('#toolbox-groups [data-tool-id="vat"]').textContent).not.toContain('算过');
    });

    // 热门 / 可对比的判据在注册表（tool.hot / tool.comparable），UI 不许自己猜 —— 无埋点期间
    // 热门是人工维护的名单，接了埋点应换成真实热度。
    test('热门 / 可对比来自注册表标记', () => {
        expect(document.querySelector('#toolbox-groups [data-tool-id="salary-tax"]').textContent).toContain('热门');
        expect(document.querySelector('#toolbox-groups [data-tool-id="bonus-tax"]').textContent).toContain('可对比');
        expect(document.querySelector('#toolbox-groups [data-tool-id="vat"]').textContent).not.toContain('热门');
    });
});

describe('阶段19-3：进入工具页自动聚焦搜索框', () => {
    const goto = (pageId) => {
        document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
        document.getElementById(pageId).classList.add('active');
    };

    test('桌面（≥768px）：切进工具页就聚焦，41 个入口靠搜比靠翻快', () => {
        window.innerWidth = 1024;
        goto('mode-selection-page');
        window.EuriskoToolbox.syncNav();
        goto('tools-page');
        window.EuriskoToolbox.syncNav();
        expect(document.activeElement).toBe(document.getElementById('toolbox-search'));
    });

    test('手机（<768px）：不聚焦 —— 键盘一上来顶掉半屏，用户还没决定搜什么', () => {
        window.innerWidth = 375;
        document.getElementById('toolbox-search').blur();
        goto('profile-page');
        window.EuriskoToolbox.syncNav();
        goto('tools-page');
        window.EuriskoToolbox.syncNav();
        expect(document.activeElement).not.toBe(document.getElementById('toolbox-search'));
    });

    test('只在「刚切进来」时聚焦一次，页面内反复同步不抢焦点', () => {
        window.innerWidth = 1024;
        goto('mode-selection-page');
        window.EuriskoToolbox.syncNav();
        goto('tools-page');
        window.EuriskoToolbox.syncNav();
        expect(document.activeElement).toBe(document.getElementById('toolbox-search'));
        // 用户已经在别处操作：再同步不该把焦点抢回搜索框
        document.getElementById('quick-back-btn').focus();
        window.EuriskoToolbox.syncNav();
        expect(document.activeElement).toBe(document.getElementById('quick-back-btn'));
    });
});

describe('政策依据：页内展开，不外跳', () => {
    // 微信 / PWA standalone 里外链会被拦或直接跳出应用 —— 结果页自证其说的最后一环就断了。
    // 这类约束改一次 UI 就可能悄悄退回去，只能钉成断言。
    test('有登记政策的工具渲染出依据，且默认折叠（不抢结果区的视线）', () => {
        document.querySelector('[data-tool-id="vat"]').click();
        const wrap = document.getElementById('quick-policy-basis');
        expect(wrap.classList.contains('hidden')).toBe(false);
        expect(wrap.open).toBe(false);
        expect(document.querySelectorAll('#quick-policy-basis-body .tool-basis-item').length).toBeGreaterThan(0);
        // 文号里必有阿拉伯数字：整块没有数字基本就是渲染空了（数据没取到却又不报错）
        expect(wrap.textContent).toMatch(/\d/);
    });

    test('一条 <a> 都不许给：外链在这两个容器里等于流失', () => {
        document.querySelector('[data-tool-id="vat"]').click();
        expect(document.querySelectorAll('#quick-policy-basis a')).toHaveLength(0);
        expect(document.getElementById('quick-policy-basis').innerHTML).not.toMatch(/target\s*=\s*["']_blank/);
    });

    test('数据源只有一处：取的就是 registry 的 basisOf', () => {
        const viaUi = window.EuriskoToolbox.policyBasisOf({ policyKey: 'vat' });
        expect(viaUi).toEqual(window.EuriskoTaxRegistry.basisOf('vat'));
    });

    test('复制文本是「文号 —— 标题」的可读形状（可直接粘进报告或聊天）', () => {
        const basis = [{ doc: '财政部 税务总局公告 2023 年第 19 号', title: '增值税小规模纳税人减免' }];
        expect(window.EuriskoToolbox.policyBasisText(basis))
            .toBe('财政部 税务总局公告 2023 年第 19 号 —— 增值税小规模纳税人减免');
    });

    test('registry 缺失 / 工具没登记政策：不渲染也不炸，不拖累计算与导出', () => {
        const saved = window.EuriskoTaxRegistry;
        try {
            delete window.EuriskoTaxRegistry;
            expect(window.EuriskoToolbox.policyBasisOf({ policyKey: 'vat' })).toEqual([]);
        } finally {
            window.EuriskoTaxRegistry = saved;
        }
        expect(window.EuriskoToolbox.policyBasisOf({})).toEqual([]);
        expect(window.EuriskoToolbox.policyBasisOf(null)).toEqual([]);
        expect(() => window.EuriskoToolbox.policyBasisText([])).not.toThrow();
    });
});

// ====== 阶段19-4：结果页双栏 + 行动条 ======
// 双栏本身是 CSS 的事（jsdom 没有布局引擎），所以这里钉两类东西：
// ① **结构**：输入与结果被分进两个列容器，且所有既有 id 都还在（share-card / lead-context /
//    quick-report 都按 id 取数，结构一动就整条链断）；② **行为**：算完必有常驻出口、
//    算不出来时旧金额立刻收掉。
describe('阶段19-4：速算器页双栏结构', () => {
    const html = fs.readFileSync(path.join(PROJECT_ROOT, 'index.html'), 'utf8');
    const css = fs.readFileSync(path.join(PROJECT_ROOT, 'src/css/ui-redesign.css'), 'utf8');

    const pageOf = (id) => html.slice(html.indexOf(`id="${id}"`));

    test('输入与结果各占一列，且列的顺序是「先输入、后结果」', () => {
        const page = pageOf('quick-calculator-page').slice(0, 3000);
        expect(page).toContain('class="quick-layout"');
        expect(page).toContain('quick-col-input');
        expect(page).toContain('quick-col-result');
        expect(page.indexOf('quick-col-input')).toBeLessThan(page.indexOf('id="quick-form"'));
        expect(page.indexOf('id="quick-form"')).toBeLessThan(page.indexOf('quick-col-result'));
        expect(page.indexOf('quick-col-result')).toBeLessThan(page.indexOf('id="quick-result"'));
    });

    // 只做一份 DOM：两套结构（手机一套 / 桌面一套）必然有一套先烂 —— 这是 18-x 那批静默失败的通病。
    test('双栏由 CSS 断点决定，不做两份 DOM', () => {
        const declarationsOnly = css.replace(/\/\*[\s\S]*?\*\//g, '');
        expect(declarationsOnly).toMatch(/@media \(min-width: 1024px\)[\s\S]*\.quick-layout/);
        expect(declarationsOnly).toMatch(/\.quick-col-input\s*\{[^}]*position:\s*sticky/);
        // 输入栏 ≤420px（§3.7「列表宜宽、表单宜窄」是硬约束，不是建议）
        expect(declarationsOnly).toContain('minmax(0, 420px)');
        // 桌面下结果就在视野里，吸底条必须让位
        expect(declarationsOnly).toMatch(/@media \(min-width: 1024px\)[\s\S]*\.quick-result-bar\s*\{[^}]*display:\s*none/);
    });

    test('吸底条只写一份，且默认 hidden（算出结果才出现）', () => {
        const page = pageOf('quick-calculator-page');
        expect(page.match(/id="quick-result-bar"/g)).toHaveLength(1);
        expect(page).toMatch(/id="quick-result-bar"[^>]*class="quick-result-bar hidden"/);
        // 键盘可达：它是个按钮，不是装饰
        expect(page).toMatch(/id="quick-result-bar"[^>]*role="button"/);
    });
});

describe('阶段19-4：行动条四按钮常驻', () => {
    test('算完就有四个出口（保存 / 导出 / 复制 / 下一步）', () => {
        document.querySelector('[data-tool-id="vat"]').click();
        const btns = document.querySelectorAll('#quick-actions .quick-action-btn');
        expect(btns).toHaveLength(4);
        ['quick-save-history', 'quick-export-pdf', 'quick-copy-result'].forEach((id) => {
            expect(document.getElementById(id)).toBeTruthy();
        });
        // 一屏一主行动：只有「保存」是实心，其余是次级
        expect(document.querySelectorAll('#quick-actions .quick-action-btn-primary')).toHaveLength(1);
        expect(document.getElementById('quick-save-history').classList.contains('quick-action-btn-primary')).toBe(true);
    });

    // 病根：这四个按钮原本挂在「算完还能干什么」里，而那一块只在有相关工具时才渲染 ——
    // 出口被别人的数据决定。这里直接把那块拿掉，四个出口必须还在。
    test('与「相关工具」解耦：那一块不在了，出口照样在', () => {
        document.getElementById('quick-next').remove();
        document.querySelector('[data-tool-id="vat"]').click();
        expect(document.querySelectorAll('#quick-actions .quick-action-btn')).toHaveLength(4);
    });

    test('有同名完整测算时第四步是「按年填全的完整版」（速算器是同一件事的浅版）', () => {
        expect(window.EuriskoToolbox.deepCounterpartOf({ id: 'vat' })).toBe('vat-deep');
        document.querySelector('[data-tool-id="vat"]').click();
        expect(document.getElementById('quick-open-deep')).toBeTruthy();
        expect(document.getElementById('quick-open-deep').getAttribute('data-deep-id')).toBe('vat-deep');
    });

    test('没有完整测算时第四步回工具页，不留空位也不临时变三按钮', () => {
        expect(window.EuriskoToolbox.deepCounterpartOf({ id: 'net-salary' })).toBe('');
        document.querySelector('[data-tool-id="net-salary"]').click();
        expect(document.getElementById('quick-open-deep')).toBeNull();
        expect(document.getElementById('quick-back-tools')).toBeTruthy();
        expect(document.querySelectorAll('#quick-actions .quick-action-btn')).toHaveLength(4);
    });
});

describe('阶段19-4：结果吸底条', () => {
    test('手机滚到哪儿都能看到主金额，且与结果卡上的数是同一个', () => {
        document.querySelector('[data-tool-id="salary-tax"]').click();
        const bar = document.getElementById('quick-result-bar');
        expect(bar.classList.contains('hidden')).toBe(false);
        const primary = document.querySelector('#quick-result .tool-result-primary-value').textContent;
        expect(document.getElementById('quick-result-bar-value').textContent).toBe(primary);
        // 标签是结果口径（"应纳个税"之类），不是工具名 —— 用户要看的是这个数是什么
        expect(document.getElementById('quick-result-bar-label').textContent)
            .toBe(document.querySelector('#quick-result .tool-result-primary-label').textContent);
    });

    // 留着上一次的金额是最坏的一种"看起来成功"：算不出来时必须一起收掉。
    test('算不出来时吸底条与行动条一起收掉（不留上一次的金额）', () => {
        document.querySelector('[data-tool-id="vat"]').click();
        expect(document.getElementById('quick-result-bar').classList.contains('hidden')).toBe(false);

        const tool = window.EuriskoToolRegistry.get('vat');
        const origin = tool.compute;
        tool.compute = () => { throw new Error('boom'); };
        try {
            document.querySelector('[data-tool-id="vat"]').click();
            expect(document.getElementById('quick-result-bar').classList.contains('hidden')).toBe(true);
            expect(document.getElementById('quick-actions').innerHTML).toBe('');
        } finally {
            tool.compute = origin;
        }
    });

    test('点吸底条回到结果卡（键盘 Enter 同样生效）', () => {
        document.querySelector('[data-tool-id="vat"]').click();
        const bar = document.getElementById('quick-result-bar');
        const card = document.getElementById('quick-result-card');
        const scrolled = jest.fn();
        card.scrollIntoView = scrolled;
        bar.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
        expect(scrolled).toHaveBeenCalled();
        scrolled.mockClear();
        bar.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(scrolled).toHaveBeenCalled();
    });
});

describe('阶段19-4：复制结果', () => {
    test('复制的是明文：工具名 + 主结果 + 明细，带一句免责', () => {
        document.querySelector('[data-tool-id="vat"]').click();
        const text = window.EuriskoToolbox.resultTextOf(
            window.EuriskoToolRegistry.get('vat'),
            { primary: { label: '应纳增值税', value: 3000, kind: 'money' }, rows: [{ label: '不含税销售额', value: 100000, kind: 'money' }] }
        );
        expect(text).toContain('增值税');
        expect(text).toContain('应纳增值税');
        expect(text).toContain('不含税销售额');
        // 可带走的东西必须有声明（与导出报告 / 分享图同一口径）
        expect(text).toContain('仅供参考');
    });

    test('复制失败也不假成功（按钮回到原样，让用户再来一次）', () => {
        const written = [];
        Object.defineProperty(window.navigator, 'clipboard', {
            configurable: true,
            value: { writeText: (t) => { written.push(t); return Promise.reject(new Error('denied')); } }
        });
        document.querySelector('[data-tool-id="vat"]').click();
        const btn = document.getElementById('quick-copy-result');
        btn.click();
        expect(written).toHaveLength(1);
        // 走降级路径：execCommand 在 jsdom 里不存在，故最终是「失败」而不是静默装作成功
        return Promise.resolve().then(() => {
            expect(btn.disabled).toBe(false);
        });
    });
});
