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
        <div id="quick-result"></div>
        <div id="quick-pitfalls"></div>
        <details id="quick-policy-basis" class="hidden">
            <div id="quick-policy-basis-body"></div>
            <button type="button" id="quick-basis-copy">复制政策文号</button>
        </details>
        <div id="quick-next" class="hidden"></div>
        <a id="quick-seo-link"></a>
        <button id="quick-back-btn"></button>
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
    test('渲染 5 张身份卡', () => {
        window.EuriskoToolbox.renderScenarios();
        expect(document.querySelectorAll('#home-scenarios .scenario-card')).toHaveLength(5);
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
