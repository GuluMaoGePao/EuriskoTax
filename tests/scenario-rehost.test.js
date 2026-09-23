// v1.51.0：「方案对比」卡重建宿主 守护测试
//
// 背景：17B-3 删掉综合所得页面后，这张卡**宿主与数据源一起没了** ——
//   它取数靠 `collectTaxInputData()` / `collectDeductionInput()` 两个按 id 读表单的适配器，
//   而那些输入框随页面一起被删（`work-months` 那一行就抛 TypeError）。
//   页面式 deep 归零时它是唯一没跟着走的功能：纯逻辑与单测都还在，就是没人能点得到。
//
// 现在改成「宿主注入」：综合所得 spec 暴露 `toCalcInput`（与 `compute` 同一个 `forwardCalc`），
//   渲染器见到这个钩子才在结果区挂卡片。这里钉三件事：
//   ① 取数同源 —— 卡片存下的方案，与界面上算出来的那个数是同一个数（不许有第二份映射）；
//   ② 不静默存脏数据 —— 没有上下文时保存必须被拒绝，不许存一条 input 为 null 的方案；
//   ③ 卡片不再依赖任何页面表单 —— 源码里不许再出现已删页面的字段 id。

const fs = require('fs');
const path = require('path');
const { loadSource } = require('./helpers/load-source');

const ROOT = path.join(__dirname, '..');

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/tax-calculator.js');
    loadSource('src/js/data/tool-registry.js');
    loadSource('src/js/data/scenario-store.js');
    loadSource('src/js/ui/scenario-ui.js');
});

beforeEach(() => {
    localStorage.clear();
});

// 最小可用入参：forwardCalc 对缺失项一律按 0 / 默认口径处理，
// 三个总开关（special / additional / other）未声明时按「展开」计。
function baseValues(overrides) {
    return Object.assign({
        workMonths: 12,
        monthlySalaryIncome: 30000,
        annualLaborIncome: 0,
        annualAuthorIncome: 0,
        annualRoyaltyIncome: 0,
        bonusIncome: 60000,
        bonusInclude: false
    }, overrides || {});
}

function forwardTool() {
    return window.EuriskoToolRegistry.get('forward');
}

describe('综合所得 spec 的取数钩子 toCalcInput', () => {
    test('forward 声明了 toCalcInput，其余 deep 工具没有（卡片不是默认件）', () => {
        expect(typeof forwardTool().toCalcInput).toBe('function');

        const others = window.EuriskoToolRegistry.deep()
            .filter((t) => t.id !== 'forward');
        expect(others.length).toBeGreaterThan(0);
        others.forEach((t) => {
            expect(t.toCalcInput).toBeUndefined();
        });
    });

    test('toCalcInput 与 compute 同源：方案里存的数＝结果区显示的数', () => {
        const tool = forwardTool();
        const values = baseValues();

        const ctx = tool.toCalcInput(values);
        const view = tool.compute(values);

        expect(ctx.results && ctx.results.taxDetails).toBeTruthy();
        // 结果区主指标是税后年收入 —— 「保存当前方案」存的就是这一份结果的摘要
        expect(ctx.results.taxDetails.netIncome).toBeCloseTo(view.primary.value, 6);
        expect(ctx.base.workMonths).toBe(12);
        expect(typeof ctx.deductions.totalDeduction).toBe('number');
    });

    test('年终奖方案与结果区「并入 / 单独」对比是同一套数（不是第二份口径）', () => {
        const tool = forwardTool();
        const values = baseValues();

        const ctx = tool.toCalcInput(values);
        const view = tool.compute(values);
        const built = window.EuriskoScenarioUI.pure.buildBonusScenarios(ctx.base, ctx.deductions);

        expect(built.ok).toBe(true);
        expect(view.compare).toBeTruthy();          // 有年终奖 → 结果区给了两套账
        // 两边都是「先并入、后单独」的顺序
        expect(built.scenarios[0].summary.netIncome).toBeCloseTo(view.compare.scenarios[0].primary.value, 6);
        expect(built.scenarios[1].summary.netIncome).toBeCloseTo(view.compare.scenarios[1].primary.value, 6);
        // 单独计税在这个收入结构下更省税 —— 若两列完全一样，说明某一边根本没按年终奖算
        expect(built.scenarios[1].summary.netIncome).not.toBeCloseTo(built.scenarios[0].summary.netIncome, 2);
    });

    test('没有年终奖时结果区不给对比，方案生成也随之拒绝', () => {
        const tool = forwardTool();
        const ctx = tool.toCalcInput(baseValues({ bonusIncome: 0 }));

        expect(tool.compute(baseValues({ bonusIncome: 0 })).compare).toBeNull();
        expect(window.EuriskoScenarioUI.pure.buildBonusScenarios(ctx.base, ctx.deductions).ok).toBe(false);
    });
});

describe('方案对比卡的挂载与保存', () => {
    function mountCard(ctx) {
        const host = document.createElement('div');
        document.body.appendChild(host);
        window.EuriskoScenarioUI.mount(host, ctx);
        return host;
    }

    test('挂载后卡片自带两个按钮，保存即写入方案库', () => {
        const ctx = forwardTool().toCalcInput(baseValues());
        const host = mountCard(ctx);

        expect(host.querySelector('.dw-sc-save-btn')).toBeTruthy();
        expect(host.querySelector('.dw-sc-generate-btn')).toBeTruthy();

        host.querySelector('.dw-sc-save-btn').click();

        const list = window.EuriskoScenarios.list();
        expect(list.length).toBe(1);
        expect(list[0].input.monthlySalaryIncome).toBe(30000);
        expect(list[0].input.bonusIncome).toBe(60000);
        // 存盘不留 deductions：它由入参重算得出来，带进去只是一份必然过期的副本
        expect(list[0].input.deductions).toBeUndefined();
        // 存完表格就该露出来（空状态收起）
        expect(host.querySelector('.dw-sc-wrap').classList.contains('hidden')).toBe(false);
        expect(host.querySelector('.dw-sc-empty').classList.contains('hidden')).toBe(true);
    });

    test('「生成年终奖方案」按当前入参落库，并给出结论', () => {
        const ctx = forwardTool().toCalcInput(baseValues());
        const host = mountCard(ctx);

        host.querySelector('.dw-sc-generate-btn').click();

        const list = window.EuriskoScenarios.list();
        expect(list.length).toBeGreaterThanOrEqual(2);      // 至少并入 + 单独两种口径
        expect(host.querySelector('.dw-sc-hint').textContent.length).toBeGreaterThan(0);
    });

    test('没有上下文时保存被拒绝：绝不静默存一条 input 为 null 的方案', () => {
        mountCard(null);

        const res = window.EuriskoScenarioUI.saveCurrent();

        expect(res.ok).toBe(false);
        expect(res.reason).toBe('no-result');
        expect(window.EuriskoScenarios.list()).toEqual([]);
    });

    test('提示行反复改写仍找得到（className 覆盖后选择器不许失效）', () => {
        const ctx = forwardTool().toCalcInput(baseValues());
        const host = mountCard(ctx);

        const hint = host.querySelector('.dw-sc-hint');
        window.EuriskoScenarioUI.saveCurrent();          // 第一次提示：写入成功
        expect(hint.textContent).toContain('已保存');
        window.EuriskoScenarioUI.saveCurrent();          // 第二次：仍然写在这行上
        expect(host.querySelector('.dw-sc-hint').textContent).toContain('已保存');
    });
});

describe('端到端：综合所得向导结果区自动挂上方案对比卡', () => {
    const R = () => window.EuriskoToolRegistry;
    const W = () => window.EuriskoDeepWizard;

    beforeAll(() => {
        loadSource('src/js/calculation/utils.js');      // buildForwardBudgetTable / buildFormulaSteps
        loadSource('src/js/calculation/tax-registry.js');
        loadSource('src/js/ui/toolbox-ui.js');
        loadSource('src/js/ui/deep-wizard-ui.js');
    });

    beforeEach(() => {
        localStorage.clear();
        document.body.innerHTML = '<div id="deep-wizard-page" class="page hidden"></div>';
    });

    function toResult() {
        W().open('forward', { fresh: true });
        for (let i = 0; i < 10; i++) {
            const next = document.getElementById('dw-next');
            if (!next) break;
            next.click();
            if (document.getElementById('dw-result-card')) break;
        }
    }

    test('走完向导：结果区自带方案对比卡，点保存即入方案库', () => {
        toResult();
        expect(document.getElementById('dw-result-card')).toBeTruthy();

        const host = document.getElementById('dw-scenario-host');
        expect(host).toBeTruthy();
        expect(host.querySelector('.dw-sc-save-btn')).toBeTruthy();
        expect(host.querySelector('.dw-sc-generate-btn')).toBeTruthy();

        host.querySelector('.dw-sc-save-btn').click();
        const list = window.EuriskoScenarios.list();
        expect(list.length).toBe(1);

        // 存进方案库的数 ＝ 结果区主指标上显示的那个数（默认入参下税后年收入）。
        // 这是「方案库里的数 ≠ 界面上算出来的数」这条静默故障的机器防线。
        const shown = Number(
            document.getElementById('dw-result-primary').textContent.replace(/[^0-9.\-]/g, '')
        );
        expect(shown).toBeGreaterThan(0);
        // v1.98.0：方案按工具自己的口径存指标（metrics），不再只写综合所得那套 summary ——
        // 守护的仍是同一件事（存进去的数 = 界面上显示的数），只是取数落点换了。
        expect(list[0].toolId).toBe('forward');
        expect(list[0].metrics[0].label).toBe(document.getElementById('dw-result-primary-label').textContent);
        expect(list[0].metrics[0].value).toBeCloseTo(shown, 1);
    });

    test('卡片只在结果步出现：回退到第一步时宿主位不存在', () => {
        W().open('forward', { fresh: true });
        expect(document.getElementById('dw-scenario-host')).toBeNull();

        toResult();
        expect(document.getElementById('dw-scenario-host')).toBeTruthy();

        document.getElementById('dw-prev').click();
        expect(document.getElementById('dw-scenario-host')).toBeNull();
    });
});

describe('卡片不再依赖已删页面的表单', () => {
    test('scenario-ui.js 里不许再出现那张表单的字段 id', () => {
        // 只查代码：注释里会点名这些旧 id（那是留给后来人的说明，不是依赖）
        const src = fs.readFileSync(path.join(ROOT, 'src/js/ui/scenario-ui.js'), 'utf8')
            .split('\n')
            .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
            .join('\n');
        ['work-months', 'salary-income', 'bonus-income', 'bonus-include', 'housing-type',
            'basic-deduction', 'prepaid-tax'].forEach((id) => {
            expect(src).not.toContain("'" + id + "'");
        });
        // 也不许再回去依赖页面式那两个适配器与全局结果变量
        expect(src).not.toContain('collectTaxInputData');
        expect(src).not.toContain('collectDeductionInput');
        expect(src).not.toContain('calculationResults');
    });
});
