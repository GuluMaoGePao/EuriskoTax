// 阶段22 M4：双视角引导（taxonomy-guide）的渲染与交互守卫
//
// 为什么值得测：
//   弹窗里出现的**每一句判定文案都必须来自字典**（person-taxonomy 的 question /
//   tax-taxonomy 的 note，唯一文案来源）—— 在组件里抄一遍就是第二个真源。
//   交互侧守四件事：待补入口不做成死链接、点工具直达 openTool、跨格子事件全部可达、
//   企业侧 iit 不混入 A 侧 30 个个税工具（工具集按挂载点 at('B/C*') 取）。
const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    global.window = global;
    // 浏览器里由 index.html 顺序保证，测试里复现同一顺序
    loadSource('src/js/data/tool-registry.js');
    loadSource('src/js/data/tax-taxonomy.js');
    loadSource('src/js/data/person-taxonomy.js');
    loadSource('src/js/data/tool-taxonomy.js');
    loadSource('src/js/ui/taxonomy-guide-ui.js');
});

const G = () => window.EuriskoTaxonomyGuide;
const P = () => window.EuriskoPersonTaxonomy;
const body = () => document.getElementById('taxonomy-guide-body');

beforeEach(() => {
    document.body.innerHTML = '';
    window.EuriskoToolbox = { openTool: jest.fn() };
});

describe('问句引导（阶段22 M4）', () => {
    test('open() 创建弹窗并显示首页视图（9 格 + 跨格组）', () => {
        G().open();
        const modal = document.getElementById('taxonomy-guide-modal');
        expect(modal).toBeTruthy();
        expect(modal.classList.contains('hidden')).toBe(false);
        // 9 格问句卡 + 1 张跨格组卡
        const cards = body().querySelectorAll('.guide-form-card[data-guide-form]');
        expect(cards.length).toBe(10);
    });

    test('判定文案全部来自 person-taxonomy 的 question（唯一文案来源，组件不抄）', () => {
        G().open();
        P().forms().forEach((f) => {
            const card = body().querySelector(`[data-guide-form="${f.id}"]`);
            expect(card).toBeTruthy();
            const q = card.querySelector('.guide-form-card__q').textContent;
            expect(q).toBe(f.question);
        });
    });

    test('格卡的事件数徽标与 eventsByForm 一致（F1 = 9，F7 = 1）', () => {
        G().open();
        const meta = (id) => body().querySelector(`[data-guide-form="${id}"] .guide-form-card__meta`).textContent;
        expect(meta('F1')).toContain('9 个事项');
        expect(meta('F7')).toContain('1 个事项');
        // 跨格组 5 个
        expect(body().querySelector('[data-guide-form="cross"] .guide-form-card__meta').textContent)
            .toContain('5 个事项');
    });

    test('点 F1 → 事件 9 行、withheldBy 白话提示、返回可用', () => {
        G().open();
        body().querySelector('[data-guide-form="F1"]').click();
        const rows = body().querySelectorAll('.guide-event-row');
        expect(rows.length).toBe(9);
        expect(body().textContent).toContain('发了工资');
        expect(body().textContent).toContain('单位按月代扣代缴');
        body().querySelector('#taxonomy-guide-back').click();
        expect(body().querySelectorAll('.guide-form-card').length).toBe(10);
    });

    test('点事件行直达第一个工具，点 chip 直达指定工具，弹窗都关闭', () => {
        G().open();
        body().querySelector('[data-guide-form="F1"]').click();
        // 点 E1 行 → tools[0] = salary-tax
        body().querySelector('[data-guide-event="E1"]').click();
        expect(window.EuriskoToolbox.openTool).toHaveBeenCalledWith('salary-tax');
        // 弹窗已关
        expect(document.getElementById('taxonomy-guide-modal').classList.contains('hidden')).toBe(true);
        // 点 net-salary chip → 指定工具
        G().open();
        body().querySelector('[data-guide-form="F1"]').click();
        const chips = body().querySelector('[data-guide-event="E1"]')
            .querySelectorAll('.guide-tool-chip');
        expect(chips.length).toBe(3); // salary-tax / net-salary / reverse
        chips[1].click();
        expect(window.EuriskoToolbox.openTool).toHaveBeenCalledWith('net-salary');
    });

    test('工具名从注册表查（含 deep 档），查不到也不空', () => {
        expect(G().toolName('salary-tax')).toBe('月薪个税');
        expect(G().toolName('withholding-deep')).toBe(
            window.EuriskoToolRegistry.deep().find((t) => t.id === 'withholding-deep').name);
        expect(G().toolName('不存在的工具')).toBe('不存在的工具');
    });

    test('待补入口不做成死链接：F7 只有一行、标 is-empty、点击不触发 openTool', () => {
        G().open();
        body().querySelector('[data-guide-form="F7"]').click();
        const rows = body().querySelectorAll('.guide-event-row');
        expect(rows.length).toBe(1);
        expect(rows[0].classList.contains('is-empty')).toBe(true);
        expect(body().textContent).toContain('工具待补');
        rows[0].click();
        expect(window.EuriskoToolbox.openTool).not.toHaveBeenCalled();
    });

    test('跨格子组：5 个事件全部可达，E13 有两个工具档', () => {
        G().open();
        body().querySelector('[data-guide-form="cross"]').click();
        const rows = body().querySelectorAll('.guide-event-row');
        expect(rows.length).toBe(5);
        // 可点的 3 个（有工具）：E13 / E14 / E24；待补的 2 个：E16 / E20
        const clickable = [...rows].filter((r) => r.hasAttribute('data-guide-event'))
            .map((r) => r.getAttribute('data-guide-event')).sort();
        expect(clickable).toEqual(['E13', 'E14', 'E24']);
        const empty = [...rows].filter((r) => r.hasAttribute('data-guide-empty'))
            .map((r) => r.getAttribute('data-guide-empty')).sort();
        expect(empty).toEqual(['E16', 'E20']);
        const chips = body().querySelector('[data-guide-event="E13"]').querySelectorAll('.guide-tool-chip');
        expect(chips.length).toBe(2); // private-pension / private-pension-deep
        expect(body().textContent).toContain('买房了');
    });

    test('close() 后 isOpen 为 false，重复 open 不重复建 DOM', () => {
        G().open();
        G().close();
        expect(G().isOpen()).toBe(false);
        G().open();
        G().open();
        expect(document.querySelectorAll('#taxonomy-guide-modal').length).toBe(1);
    });

    test('首页两颗入口各自直达对应视角（上次视角不串台）', () => {
        // 先把会话状态切到企业侧：个人入口再点开时仍应是个人侧（入口显式指定，不沿用残留）
        G().setMode('enterprise');
        document.body.insertAdjacentHTML('beforeend',
            '<button type="button" id="home-guide-entry"></button>' +
            '<button type="button" id="home-guide-entry-tax"></button>');
        // init 在模块求值时跑过一次（那时按钮还不存在），组件暴露了 init 供补绑（也供将来动态注入入口）
        G().init();
        document.getElementById('home-guide-entry').click();
        expect(G().mode()).toBe('person');
        document.getElementById('home-guide-entry-tax').click();
        expect(G().mode()).toBe('enterprise');
        expect(G().isOpen()).toBe(true);
    });
});

describe('企业视角（按税种，阶段22 M4 第二步）', () => {
    const T = () => window.EuriskoTaxTaxonomy;
    const M = () => window.EuriskoToolTaxonomy;

    beforeEach(() => {
        window.EuriskoToolbox = { openTool: jest.fn() };
        // 视角是会话内状态：上个用例切到企业侧会残留，这里统一拨回个人侧
        G().setMode('person');
    });

    test('open() 默认个人侧；切到企业侧出 5 税类卡，C4 特定目的降级但可点', () => {
        G().open();
        expect(G().mode()).toBe('person');
        // 视角切换条在壳层（modal-body 之外），从 document 查
        document.querySelector('#taxonomy-guide-mode-enterprise').click();
        expect(G().mode()).toBe('enterprise');
        // 弹窗标题随视角切换：两句话各自说清自己的分类依据
        expect(document.getElementById('taxonomy-guide-head-title').textContent)
            .toBe('替公司办税，从哪类入手？');
        const cards = body().querySelectorAll('.guide-form-card[data-guide-taxcat]');
        expect(cards.length).toBe(5);
        expect(body().textContent).toContain('替公司或客户办税');
        // 特定目的与资源环境税：defaultOpen=false → is-minor（降级不隐藏）
        const purpose = body().querySelector('[data-guide-taxcat="purpose"]');
        expect(purpose.classList.contains('is-minor')).toBe(true);
        const turnover = body().querySelector('[data-guide-taxcat="turnover"]');
        expect(turnover.classList.contains('is-minor')).toBe(false);
    });

    test('税类文案与计数来自字典 / 挂载点表（不抄第二份）', () => {
        G().open('enterprise');
        T().categories().forEach((c) => {
            const card = body().querySelector(`[data-guide-taxcat="${c.id}"]`);
            expect(card.querySelector('.guide-form-card__q').textContent).toBe(c.note);
            const toolN = M().at('B/' + { turnover: 'C1', income: 'C2', property: 'C3', purpose: 'C4', levy: 'C5' }[c.id]).length;
            expect(card.querySelector('.guide-form-card__meta').textContent).toContain(toolN + ' 个工具');
        });
    });

    test('流转税详情：增值税两个档、城建税挂 surtax-stamp 两档、消费税关税标暂无', () => {
        G().open('enterprise');
        body().querySelector('[data-guide-taxcat="turnover"]').click();
        const rows = [...body().querySelectorAll('.guide-event-row')];
        expect(rows.length).toBe(4);   // 增值税 / 城建税 / 消费税 / 关税
        // 按行名精确匹配（城建税 note 里也写着「消费税」，indexOf 会串行）
        const chipsOf = (name) => {
            const row = rows.find((r) => r.querySelector('.guide-event-row__name').textContent === name);
            return row ? [...row.querySelectorAll('.guide-tool-chip')].map((c) => c.getAttribute('data-guide-tool')) : null;
        };
        expect(chipsOf('增值税')).toEqual(['vat', 'vat-deep']);
        expect(chipsOf('城市维护建设税')).toEqual(['surtax-stamp', 'surtax-stamp-deep']);
        expect(chipsOf('消费税')).toEqual([]);
        expect(chipsOf('关税')).toEqual([]);
        expect(body().querySelector('[data-guide-empty="tax-consumption"]')).toBeTruthy();
        // 申报节奏白话来自 frequency
        expect(body().textContent).toContain('随增值税附征');
    });

    test('所得税详情：个税只列 B 侧挂载（代扣 4 档 + 经营所得 2 档），不混入 A 侧 30 个', () => {
        G().open('enterprise');
        body().querySelector('[data-guide-taxcat="income"]').click();
        const iitRow = [...body().querySelectorAll('.guide-event-row')]
            .find((r) => r.querySelector('.guide-event-row__name').textContent === '个人所得税');
        const chipIds = [...iitRow.querySelectorAll('.guide-tool-chip')]
            .map((c) => c.getAttribute('data-guide-tool'));
        expect(chipIds.sort()).toEqual(['bonus-tax', 'business', 'business-income',
            'salary-tax', 'withholding', 'withholding-deep']);
        expect(body().querySelector('[data-guide-empty="tax-iit"]')).toBeNull();
        // 企业所得税是另一行，两档
        const citRow = [...body().querySelectorAll('.guide-event-row')]
            .find((r) => r.querySelector('.guide-event-row__name').textContent === '企业所得税');
        expect([...citRow.querySelectorAll('.guide-tool-chip')].map((c) => c.getAttribute('data-guide-tool')))
            .toEqual(['corporate-income-tax', 'corporate-income-tax-deep']);
    });

    test('费与用工：4 项费 + 「相关工具」兜底行收 employer-cost（not-a-tax）', () => {
        G().open('enterprise');
        body().querySelector('[data-guide-taxcat="levy"]').click();
        const empties = [...body().querySelectorAll('[data-guide-empty]')].map((r) => r.getAttribute('data-guide-empty'));
        expect(empties.sort()).toEqual(['tax-culture', 'tax-union']);   // 工会经费 / 文化事业建设费
        const orphanRow = [...body().querySelectorAll('.guide-event-row')]
            .find((r) => r.querySelector('.guide-event-row__name').textContent === '相关工具');
        expect(orphanRow.querySelector('[data-guide-tool="employer-cost"]')).toBeTruthy();
        // 点社保 chip 直达 openTool
        body().querySelector('[data-guide-tool="social-base"]').click();
        expect(window.EuriskoToolbox.openTool).toHaveBeenCalledWith('social-base');
    });

    test('企业侧点工具 chip 直达并关闭弹窗；返回按钮回税类首页；切回个人侧恢复 9 格', () => {
        G().open('enterprise');
        body().querySelector('[data-guide-taxcat="turnover"]').click();
        body().querySelector('[data-guide-tool="vat"]').click();
        expect(window.EuriskoToolbox.openTool).toHaveBeenCalledWith('vat');
        expect(document.getElementById('taxonomy-guide-modal').classList.contains('hidden')).toBe(true);
        G().open('enterprise');
        body().querySelector('[data-guide-taxcat="turnover"]').click();
        body().querySelector('#taxonomy-guide-back').click();
        expect(body().querySelectorAll('[data-guide-taxcat]').length).toBe(5);
        document.querySelector('#taxonomy-guide-mode-person').click();
        expect(body().querySelectorAll('.guide-form-card[data-guide-form]').length).toBe(10);
    });
});
