const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/tax-calculator.js');
    // 17B-4（v1.50.0）：helper-functions.js 随分类所得页面删除（它是最后一个页面式 deep）。
    loadSource('src/js/calculation/utils.js');   // buildForwardBudgetTable / buildFormulaSteps
    loadSource('src/js/calculation/tax-registry.js');
    loadSource('src/js/data/tool-registry.js');
    loadSource('src/js/ui/toolbox-ui.js');
    loadSource('src/js/ui/deep-wizard-ui.js');
});

const R = () => window.EuriskoToolRegistry;
const W = () => window.EuriskoDeepWizard;

// 按 spec 的 defaults 拼输入：defaults 是唯一真源 —— 手抄一份 values 会在字段增删后静默算错
function valuesOf(overrides) {
    const tool = R().get('forward');
    const v = {};
    tool.fields.forEach(function (f) { v[f.key] = f.default; });
    return Object.assign(v, overrides || {});
}

function compute(overrides) {
    return R().get('forward').compute(valuesOf(overrides));
}

// 干净口径：三个总开关全关、其它所得全 0 —— 对拍用例都从这里起，避免被 defaults 里的
// 社保金额与房租搅进方差（那些是给人看的默认值，不是测算前提）
function base(overrides) {
    return valuesOf(Object.assign({
        specialDeductionCheckbox: false,
        specialAdditionalDeductionCheckbox: false,
        otherDeductionCheckbox: false,
        annualLaborIncome: 0, annualAuthorIncome: 0, annualRoyaltyIncome: 0, bonusIncome: 0,
        bonusInclude: true, prepaidTax: 0
    }, overrides || {}));
}

// ====== 按税法口径独立重算的一份应当 equals 的数（不 import 内核）======
// 对拍的意义就在「两条路各算各的」：万一哪天内核改了口径，这里会先红，而不是界面上一个看着合理的错数。
const COMPREHENSIVE_RATES = [
    [36000, 0.03, 0], [144000, 0.10, 2520], [300000, 0.20, 16920], [420000, 0.25, 31920],
    [660000, 0.30, 52920], [960000, 0.35, 85920], [Infinity, 0.45, 181920]
];
function annualTax(taxable) {
    if (taxable <= 0) return { tax: 0, rate: 0, quick: 0 };
    for (const [cap, rate, quick] of COMPREHENSIVE_RATES) {
        if (taxable <= cap) return { tax: taxable * rate - quick, rate, quick };
    }
    return { tax: 0, rate: 0, quick: 0 };
}

describe('正向计税迁移：结果结构与口径', () => {
    test('主结果 + 明细 + 推导链都在（迁移不许丢东西）', () => {
        const out = compute();
        expect(out).toBeTruthy();
        expect(out.primary.label).toBe('税后年收入');
        expect(out.primary.value).toBeGreaterThan(0);

        const labels = out.rows.map((r) => r.label);
        ['税前年收入', '扣除合计', '应纳税所得额', '适用税率', '综合所得应纳税额', '全年已预缴税额']
            .forEach((l) => expect(labels).toContain(l));
        expect(out.steps.length).toBeGreaterThan(0);   // 推导链
        expect(Array.isArray(R().get('forward').pitfalls)).toBe(true);
    });

    // 最简单的场景：只有工资、没有任何扣除项。这时的数人可以自己核一遍 ——
    // 如果这条红了，说明 SYS 层面改了税率表或扣除口径，而不是「界面排版」的问题。
    test('只有工资（无任何扣除）：30 万应纳税所得额 → 2 档 20%、速算扣除 16920', () => {
        const v = base({ monthlySalaryIncome: 30000, workMonths: 12 });
        const out = R().get('forward').compute(v);

        const row = (label) => out.rows.find((r) => r.label === label).value;
        expect(row('税前年收入')).toBe(360000);
        expect(row('扣除合计')).toBe(60000);              // 5000 × 12
        expect(row('应纳税所得额')).toBe(300000);

        const expectTax = annualTax(300000);
        expect(row('适用税率')).toBe(expectTax.rate);
        expect(row('速算扣除数')).toBe(expectTax.quick);
        expect(row('综合所得应纳税额')).toBeCloseTo(expectTax.tax, 2);   // 43080
        expect(row('综合所得应纳税额')).toBe(43080);

        // 全年只此一份所得、按月均衡发放 —— 累计预扣累计到年末，正好等于年度应纳税额，故不退不补
        expect(row('全年已预缴税额')).toBe(43080);
        expect(out.rows.filter((r) => /^应(退|补)税额$/.test(r.label))[0].value).toBe(0);
        expect(out.primary.value).toBe(360000 - 43080);
    });

    test('扣了社保公积金后应纳税所得额下降（扣除项真的进了内核）', () => {
        const on = R().get('forward').compute(base({
            monthlySalaryIncome: 30000, specialDeductionCheckbox: true,
            pensionInsurance: 1000, medicalInsurance: 300, unemploymentInsurance: 50, housingFund: 1200
        }));
        const off = R().get('forward').compute(base({ monthlySalaryIncome: 30000 }));

        const deductibleTotal = (1000 + 300 + 50 + 1200) * 12;
        expect(on.rows.find((r) => r.label === '扣除合计').value).toBe(60000 + deductibleTotal);
        expect(on.rows.find((r) => r.label === '应纳税所得额').value)
            .toBe(300000 - deductibleTotal);
        expect(on.rows.find((r) => r.label === '综合所得应纳税额').value)
            .toBeLessThan(off.rows.find((r) => r.label === '综合所得应纳税额').value);
        expect(on.primary.value).toBeGreaterThan(off.primary.value);   // 扣得多，到手多
    });

    // 三个总开关是页面上那三个「展开 / 收起」的 checkbox：UI 上它可以只管显隐，
    // 计算上必须是**硬置 0** —— 否则用户收起了那一栏，界面看着像没扣，结果却照扣。
    test('专项附加扣除总开关不勾时，那一栏的月标准一律不计', () => {
        const args = {
            monthlySalaryIncome: 30000,
            childrenInfantDeduction: 2000, elderlyDeduction: 3000, rentDeduction: 1500
        };
        const on = R().get('forward').compute(base({ specialAdditionalDeductionCheckbox: true, ...args }));
        const off = R().get('forward').compute(base({ specialAdditionalDeductionCheckbox: false, ...args }));

        const diff = on.rows.find((r) => r.label === '扣除合计').value -
            off.rows.find((r) => r.label === '扣除合计').value;
        expect(diff).toBe((2000 + 3000 + 1500) * 12);
    });

    test('大病医疗只扣超 1.5 万的部分（2 万自付 → 只扣 5 千）', () => {
        const small = R().get('forward').compute(base({
            monthlySalaryIncome: 30000, specialAdditionalDeductionCheckbox: true, medicalDeduction: 10000
        }));
        const big = R().get('forward').compute(base({
            monthlySalaryIncome: 30000, specialAdditionalDeductionCheckbox: true, medicalDeduction: 20000
        }));

        // 1.5 万起扣线以下一分不扣；超出的部分才进年度扣除 —— 差恰好 5000
        expect(big.rows.find((r) => r.label === '扣除合计').value -
            small.rows.find((r) => r.label === '扣除合计').value).toBe(5000);
    });
});

describe('正向计税迁移：年终奖两种计税口径', () => {
    const withBonus = { monthlySalaryIncome: 20000, bonusIncome: 60000 };

    test('有年终奖时给出两张方案卡；并入 vs 单独的税后年收入不同', () => {
        const out = R().get('forward').compute(base(withBonus));
        expect(out.compare).toBeTruthy();
        expect(out.compare.label).toBe('年终奖计税方式对比');
        expect(out.compare.scenarios.map((s) => s.key)).toEqual(['include', 'separate']);

        const inc = out.compare.scenarios.find((s) => s.key === 'include');
        const sep = out.compare.scenarios.find((s) => s.key === 'separate');
        expect(inc.rows.find((r) => r.label === '综合所得应纳税额').value)
            .not.toBe(sep.rows.find((r) => r.label === '综合所得应纳税额').value);
        expect(sep.rows.find((r) => r.label === '年终奖税额').value).toBeGreaterThan(0);   // 单独计税才单列一笔
        expect(inc.rows.find((r) => r.label === '年终奖税额').value).toBe(0);
    });

    test('compare.active 与主结果都跟着用户选的口径走（界面 / 保存 / 导出必须同一个数）', () => {
        const include = R().get('forward').compute(base(Object.assign({}, withBonus, { bonusInclude: true })));
        const separate = R().get('forward').compute(base(Object.assign({}, withBonus, { bonusInclude: false })));

        expect(include.compare.active).toBe('include');
        expect(separate.compare.active).toBe('separate');
        const active = separate.compare.scenarios.find((s) => s.key === 'separate');
        expect(separate.primary.value).toBe(active.primary.value);
        // 单独计税下年终奖那笔税单列：主结果与并入口径的结果不是同一个数
        expect(separate.primary.value).not.toBe(include.primary.value);
        // 结果的年终奖税额行标注了当前用的是哪条路径
        expect(separate.rows.find((r) => r.label === '年终奖税额').hint).toContain('单独计税');
    });

    test('没有年终奖就不摆对比表（两张一样的卡是拿「看起来专业」骗人）', () => {
        const out = R().get('forward').compute(base({ monthlySalaryIncome: 20000, bonusIncome: 0 }));
        expect(out.compare).toBeNull();
    });
});

describe('正向计税迁移：逐月预算表', () => {
    // 行有两种写法：裸数组 [cell]，或 utils.js 那种带 spans（合并单元格标题）的行模型 { cells, spans }。
    // spec 直接透传 utils 的行模型（**跨列怎么画各自负责**，渲染器负责摊平），这里读的时候统一取 cells。
    const cells = (row) => (Array.isArray(row) ? row : (row.cells || []));
    // 这张表是「完整测算」比「月薪个税速算器」多出来的全部意义：累计预扣法下同为年薪 36 万，
    // 逐月发与一次性发的每月到手并不一样。它是 17B-3 先从页面里抽出来、再迁进 spec 的第一件东西。
    test('12 个月的明细都在，且年末累计应缴＝年度应纳税额', () => {
        const out = R().get('forward').compute(base({ monthlySalaryIncome: 30000, workMonths: 12 }));
        const budget = out.extras.find((e) => e.title === '个人年度个税预算表');
        expect(budget).toBeTruthy();
        expect(budget.table.head.length).toBe(9);

        const monthRows = budget.table.rows.slice(0, 12).map(cells);
        expect(monthRows[0][0]).toBe('1月');
        expect(monthRows[11][0]).toBe('12月');
        // 8 列「累计应缴」= 年度应纳税额（工资是唯一所得时）
        const totalTax = out.rows.find((r) => r.label === '综合所得应纳税额').value;
        expect(monthRows[11][8]).toBe(totalTax.toFixed(2));

        // 累计预扣法：越往后累计应纳税所得额越高，档位也随之抬升 —— 1 月在 3% 档、12 月已到 20% 档
        expect(monthRows[0][4]).toBe('3%');
        expect(monthRows[11][4]).toBe('20%');
        // 每月应纳税额单调不减：这是累计预扣法的形状，掉了就是算错了
        const monthly = monthRows.map((r) => Number(r[5]));
        monthly.forEach((t, i) => { if (i) expect(t).toBeGreaterThanOrEqual(monthly[i - 1]); });
    });

    test('工作月数改变 budget 行数（不是写死的 12）', () => {
        const out = R().get('forward').compute(base({ monthlySalaryIncome: 30000, workMonths: 6 }));
        const budget = out.extras.find((e) => e.title === '个人年度个税预算表');
        const rows = budget.table.rows.map(cells);
        expect(rows[5][0]).toBe('6月');
        expect(rows[6][0]).not.toBe('7月');
    });

    test('劳务报酬另成一节（不与工资同源），并给出预扣税额', () => {
        const out = R().get('forward').compute(base({
            monthlySalaryIncome: 20000, annualLaborIncome: 50000
        }));
        const budget = out.extras.find((e) => e.title === '个人年度个税预算表');
        const laborRow = budget.table.rows.map(cells).find((r) => r[0] === '劳务所得');
        expect(laborRow).toBeTruthy();
        expect(laborRow[1]).toBe('50000.00');       // 收入额
        expect(Number(laborRow[5])).toBeGreaterThan(0);   // 预扣税额
    });
});

describe('正向计税迁移：私有便利输入（专项附加扣除那一批）', () => {
    // app.js 里那三个 addEventListener（人数 / 赡养老人身份 / 继续教育勾选）是这些「便利输入」的
    // 唯一实现 —— 页面删了就没了。v1.47.0 的教训（社保联动丢了靠 verify:local 才发现）第二次出现，
    // 所以这次是**删页之前**先把它们登记进 spec.derive，并用这组用例钉住。
    function derive(overrides) {
        return R().get('forward').derive(valuesOf(overrides));
    }

    test('子女数 × 2000 × 分摊比例 → 月扣除额', () => {
        expect(derive({ childrenInfantCount: 2, childrenInfantDeductionRate: 100 }).childrenInfantDeduction)
            .toBe(4000);
        expect(derive({ childrenInfantCount: 2, childrenInfantDeductionRate: 50 }).childrenInfantDeduction)
            .toBe(2000);
        expect(derive({ childrenInfantCount: 0 }).childrenInfantDeduction).toBe(0);
    });

    test('分摊比例留空 / 越界要落回 100（让用户看到空框按 0% 算是陷阱）', () => {
        expect(derive({ childrenInfantDeductionRate: '' }).childrenInfantDeductionRate).toBe(100);
        expect(derive({ childrenInfantDeductionRate: 150 }).childrenInfantDeductionRate).toBe(100);
    });

    test('赡养老人：独生子女 3000、非独生分摊上限 1500、不适用 0', () => {
        expect(derive({ elderlyType: 'only' }).elderlyDeduction).toBe(3000);
        expect(derive({ elderlyType: 'non-only' }).elderlyDeduction).toBe(1500);
        expect(derive({ elderlyType: 'none' }).elderlyDeduction).toBe(0);
    });

    test('继续教育＝学历 400/月（按工作月数）＋ 职业资格 3600/年', () => {
        expect(derive({
            educationDegreeCheckbox: true, educationProfessionalCheckbox: false, workMonths: 12
        }).educationDeduction).toBe(4800);
        expect(derive({
            educationDegreeCheckbox: false, educationProfessionalCheckbox: true, workMonths: 12
        }).educationDeduction).toBe(3600);
        expect(derive({
            educationDegreeCheckbox: true, educationProfessionalCheckbox: true, workMonths: 6
        }).educationDeduction).toBe(2400 + 3600);
    });

    test('社保那份联动也还在（基数 × 比例 → 月缴额，与 business / reverse 同一份钩子）', () => {
        const out = derive({ socialBase: 10000, pensionRate: 8, housingFundBase: 10000, housingFundRate: 5 });
        expect(out.pensionInsurance).toBe(800);
        expect(out.housingFund).toBe(500);
        // 没填基数时不许把手填的月缴额冲成 0（页面版都没犯这个错）
        expect(derive({ socialBase: 0, pensionInsurance: 123 }).pensionInsurance).toBeUndefined();
    });
});

// 旧页面删掉以后（17B-3 v1.49.0），tests/ui-result-compliance.test.js 的 RESULT_PAGES 少了一个条目：
// 综合所得的免责声明不再位于静态 HTML 里 —— 那一处缺口由下面这三条**端到端**用例接住
// （免责声明、结果归属 data-tool-id、以及分享图赖以为生的那几个行标签）。
// business → tests/business-migration.test.js，reverse → tests/reverse-migration.test.js，
// 三处口径一致：删页面的那一版里，必须先把守护换成一个同样会红的替代者。
describe('正向计税走向导：forward 由 spec 驱动', () => {
    beforeEach(() => {
        localStorage.clear();
        document.body.innerHTML = '<div id="deep-wizard-page" class="page hidden"></div>';
    });

    test('forward 被通用向导接管（不再是页面式）', () => {
        expect(W().has(R().get('forward'))).toBe(true);
        const steps = W().stepsOf(R().get('forward'));
        expect(steps[0].title).toBe('计算参数');
        expect(steps[steps.length - 1].result).toBe(true);
        expect(R().get('forward').pageId).toBeUndefined();
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

    test('走完向导：主结果、推导链、免责声明、预算表都在', () => {
        toResult();
        expect(document.getElementById('dw-result-primary')).toBeTruthy();
        expect(document.getElementById('dw-formula-panel')).toBeTruthy();
        expect(document.querySelector('.result-disclaimer').textContent).toContain('不构成税务建议');

        const card = document.getElementById('dw-result-card');
        expect(card.textContent).toContain('个人年度个税预算表');
        expect(card.querySelectorAll('tbody tr').length).toBeGreaterThanOrEqual(12);
        // 留资归因 / 分享图 / 埋点都靠它认人：通用渲染器不认人，forward 的结果会算到别人头上
        expect(card.getAttribute('data-tool-id')).toBe('forward');
    });

    test('分享图赖以为生的那几个行标签都在结果卡上（改名会让分享图静默截空）', () => {
        toResult();
        const card = document.getElementById('dw-result-card');
        // SOURCES['dw-result-card:forward'] 的 selector 写的是这三个行标签 —— 它们不在静态
        // HTML 里（向导运行时生成），tests/share-card.test.js 的契约用例因此覆盖不到。
        ['税前年收入', '综合所得应纳税额', '适用税率'].forEach((label) => {
            expect(card.querySelector('[data-dw-row="' + label + '"]')).toBeTruthy();
        });
    });

    test('条件字段：住房方式切成房贷后，租金那一项消失', () => {
        W().open('forward', { fresh: true });
        document.getElementById('dw-next').click();            // → 各项所得
        document.getElementById('dw-next').click();            // → 扣除项明细
        expect(document.getElementById('qf-rentDeduction')).toBeTruthy();

        const select = document.getElementById('qf-housingType');
        select.value = 'loan';
        select.dispatchEvent(new Event('change'));
        expect(document.getElementById('qf-rentDeduction')).toBeFalsy();
        expect(document.getElementById('qf-housingLoanDeduction')).toBeTruthy();
    });
});
