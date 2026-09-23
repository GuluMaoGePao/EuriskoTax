// 外籍个人津补贴免税（阶段17 17D-6）的回归网
//
// 它守护的是四件速算器做不到、而用户真正需要的事：
//   ① **核定「哪些钱真的能免」**—— 速算器只收一个标量 `allowanceAnnual`「全年可免税的津补贴合计」，
//      于是这件事被推给了用户，而它恰恰是这条政策最容易错的地方：八类里的前四类要求
//      「以**非现金形式或实报实销形式**取得」，外企最常发的随工资走的**现金住房补贴**根本不能免；
//   ② **八类之外一律不免**（车辆补贴 / 司机、俱乐部会员费、税务平衡款……），速算器一个框，
//      用户自然会一股脑全填进去；
//   ③ **探亲费每年不超过 2 次**：填 4 次只能免一半 —— 可以量化的一条；
//   ④ **只需比金额，不用比税率**：两条路径降的是**同一个**应纳税所得额，T(x) − T(x − a) 随 a
//      单调不减 —— 金额大的那条一定更省。速算器算出两个 saved 再比，等价于比金额却没讲明，
//      于是用户以为难点在算税，其实难点全在**核定金额**。
//   ⑤ **二选一且年度内不得变更** → 误以为可叠加会少算税（56 万那档实测：叠加 24400 vs 正确 16000）。
//   ⑥ 政策**执行至 2027-12-31**，2028 年起津补贴全额并入计税。
// 口径仍同源：两条路径一律走 `EuriskoExpatAllowanceQuick`（税率表与到期日取注册表声明的常量），
// 专项附加扣除那一侧走 `EuriskoSpecialDeductionQuick`（七项标准取自 specialDeductionRules）。

const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/tax-calculator.js');       // 年度表由内核出
    loadSource('src/js/calculation/tax-registry.js');         // 到期状态 statusOf
    loadSource('src/js/calculation/special-deduction-quick.js');
    loadSource('src/js/calculation/expat-allowance-quick.js');
    loadSource('src/js/calculation/utils.js');
    loadSource('src/js/data/tool-registry.js');
    loadSource('src/js/ui/toolbox-ui.js');
    loadSource('src/js/ui/deep-wizard-ui.js');
});

const R = () => window.EuriskoToolRegistry;
const W = () => window.EuriskoDeepWizard;
const Q = () => window.EuriskoExpatAllowanceQuick;
const S = () => window.EuriskoSpecialDeductionQuick;

function compute(values) {
    return R().get('expat-deep').compute(Object.assign({
        taxableBefore: 300000,
        items: [
            { kind: 'housing', amount: 60000, form: 'reimburse', times: 0 },
            { kind: 'home', amount: 40000, form: 'reimburse', times: 4 },
            { kind: 'education', amount: 30000, form: 'cash', times: 0 },
            { kind: 'other', amount: 20000, form: 'reimburse', times: 0 }
        ],
        children: 1, housing: 'rent', rentTier: 1, elderly: 'none', specialDirect: 0
    }, values || {}));
}

function row(out, label) {
    const r = out.rows.find((x) => x.label === label);
    return r ? r.value : undefined;
}

describe('与速算器同源：核定后的金额传给 quick，逐点相等', () => {
    test('一项 6 万实报实销的住房补贴 + 3.6 万专项附加扣除 ≡ quick.compareOf 直达', () => {
        const out = compute({
            items: [{ kind: 'housing', amount: 60000, form: 'reimburse', times: 0 }],
            children: 1, housing: 'none', specialDirect: 12000
        });
        // 专项附加扣除：子女教育 1 个 = 2000×12 = 24000，加「其他」12000 → 36000
        expect(S().annualOf({ children: 1, childShare: 100, housing: 'none' }).totalAnnual).toBe(24000);

        const quick = Q().compareOf({ taxableBefore: 300000, allowanceAnnual: 60000, specialAnnual: 36000 });
        expect(quick.allowance.saved).toBe(12000);        // T(30 万) − T(24 万)
        expect(quick.special.saved).toBe(7200);           // T(30 万) − T(26.4 万)
        expect(quick.diff).toBe(4800);
        expect(quick.better).toBe('allowance');

        expect(row(out, '核定后可免合计')).toBe(60000);
        expect(row(out, '专项附加扣除合计（法定）')).toBe(36000);
        expect(row(out, '选津补贴免税可省')).toBe(quick.allowance.saved);
        expect(row(out, '选专项附加扣除可省')).toBe(quick.special.saved);
        expect(row(out, '两者差额')).toBe(quick.diff);
        expect(row(out, '建议')).toBe('选津补贴免税');
        expect(out.primary.value).toBe(60000);
    });

    test('税率表与规则都取自注册表声明的常量（不复制第二份）', () => {
        const out = compute();
        expect(out.rows.length).toBeGreaterThan(0);
        const rules = Q().rules();
        expect(rules.exclusiveWithSpecialDeduction).toBe(true);
        expect(rules.items).toHaveLength(8);
        expect(rules.expiresOn).toBe('2027-12-31');
    });
});

describe('现金发放的补贴不能免（最大的坑）', () => {
    test('6 万现金住房补贴 → 核定可免 0', () => {
        const out = compute({
            items: [{ kind: 'housing', amount: 60000, form: 'cash', times: 0 }]
        });
        expect(row(out, '填进来的津补贴合计')).toBe(60000);
        expect(row(out, '核定后可免合计')).toBe(0);
        expect(row(out, '核减：现金发放')).toBe(60000);
        expect(row(out, '选津补贴免税可省')).toBe(0);
        expect(out.extras[0].table.rows[0][3]).toContain('现金发放');
    });

    test('同样的 6 万改成实报实销 → 全额可免；一年差 12000 元税', () => {
        const cash = compute({ items: [{ kind: 'housing', amount: 60000, form: 'cash', times: 0 }] });
        const reimb = compute({ items: [{ kind: 'housing', amount: 60000, form: 'reimburse', times: 0 }] });
        expect(row(reimb, '核定后可免合计')).toBe(60000);
        expect(row(reimb, '选津补贴免税可省') - row(cash, '选津补贴免税可省')).toBe(12000);
    });

    test('非现金形式同样合规', () => {
        const out = compute({ items: [{ kind: 'housing', amount: 60000, form: 'inkind', times: 0 }] });
        expect(row(out, '核定后可免合计')).toBe(60000);
    });
});

describe('八类之外一律不免', () => {
    test('车辆补贴 / 俱乐部会员费等填 5 万 → 核定可免 0', () => {
        const out = compute({ items: [{ kind: 'other', amount: 50000, form: 'reimburse', times: 0 }] });
        expect(row(out, '填进来的津补贴合计')).toBe(50000);
        expect(row(out, '核定后可免合计')).toBe(0);
        expect(row(out, '核减：不在八类之内')).toBe(50000);
        expect(out.extras[0].table.rows[0][0]).toBe('其他');
        expect(out.extras[0].table.rows[0][3]).toContain('不在八类之内');
    });

    test('八类的名字取自常量，不复制文案', () => {
        const table = compute().extras[0].table;
        expect(table.head).toEqual(['项目', '填的金额', '核定可免', '依据']);
        const labels = table.rows.map((r) => r[0]);
        expect(labels).toContain('住房补贴');
        expect(labels).toContain('探亲费');
        expect(labels).toContain('子女教育费');
    });
});

describe('探亲费每年不超过 2 次', () => {
    test('4 次 4 万 → 只能免 2 万；改成 2 次则全额可免', () => {
        const four = compute({ items: [{ kind: 'home', amount: 40000, form: 'reimburse', times: 4 }] });
        expect(row(four, '核定后可免合计')).toBe(20000);
        expect(row(four, '核减：探亲超过 2 次')).toBe(20000);

        const two = compute({ items: [{ kind: 'home', amount: 40000, form: 'reimburse', times: 2 }] });
        expect(row(two, '核定后可免合计')).toBe(40000);
        expect(row(two, '核减：探亲超过 2 次')).toBe(0);
    });

    test('探亲费 / 语言训练费 / 子女教育费须经税务机关审核批准 —— 明细里标出来', () => {
        const table = compute().extras[0].table;
        const home = table.rows.find((r) => r[0] === '探亲费');
        expect(home[3]).toContain('税务机关审核批准');
    });
});

describe('默认场景：填进来 15 万，核定可免 8 万', () => {
    test('三项核减各就各位 —— 速算器口径会少算 14000 元税', () => {
        const out = compute();
        expect(row(out, '填进来的津补贴合计')).toBe(150000);
        expect(row(out, '核定后可免合计')).toBe(80000);          // 6 万住房 + 2 万探亲
        expect(row(out, '核减：不在八类之内')).toBe(20000);
        expect(row(out, '核减：现金发放')).toBe(30000);
        expect(row(out, '核减：探亲超过 2 次')).toBe(20000);
        // 专项附加扣除：子女 1 个 24000 + 租房一档 1500×12 = 18000
        expect(row(out, '专项附加扣除合计（法定）')).toBe(42000);
        expect(row(out, '选津补贴免税可省')).toBe(16000);        // T(30 万) − T(22 万)
        expect(row(out, '选专项附加扣除可省')).toBe(8400);       // T(30 万) − T(25.8 万)
        expect(row(out, '建议')).toBe('选津补贴免税');
        // 速算器把 15 万当成全部可免
        expect(row(out, '若按填进来的金额全免（速算器口径）')).toBe(30000);
        expect(row(out, '速算器口径少算的税')).toBe(14000);
        expect(out.note).toContain('少算税 14000');
    });
});

describe('只需比金额，不用比税率（金额大的那条一定更省）', () => {
    test('免税金额扫描：少交的税随金额单调不减', () => {
        let prev = -1;
        for (let a = 0; a <= 120000; a += 5000) {
            const out = compute({
                items: [{ kind: 'housing', amount: a, form: 'reimburse', times: 0 }],
                children: 0, housing: 'none', specialDirect: 0
            });
            const saved = row(out, '选津补贴免税可省');
            expect(saved).toBeGreaterThanOrEqual(prev);
            prev = saved;
        }
    });

    test('于是「选哪条」只看金额：金额大的那条就是建议', () => {
        const bigger = compute({
            items: [{ kind: 'housing', amount: 90000, form: 'reimburse', times: 0 }],
            children: 1, housing: 'none', specialDirect: 0       // 专项附加扣除 24000
        });
        const smaller = compute({
            items: [{ kind: 'housing', amount: 12000, form: 'reimburse', times: 0 }],
            children: 1, housing: 'none', specialDirect: 0
        });
        expect(row(bigger, '建议')).toBe('选津补贴免税');
        expect(row(smaller, '建议')).toBe('选专项附加扣除');
    });
});

describe('二选一不可叠加', () => {
    test('误以为可叠加会少算税：叠加 24400 vs 正确 16000', () => {
        const out = compute();
        expect(row(out, '若误以为可叠加（错误口径）')).toBe(24400);   // T(30 万) − T(17.8 万)
        expect(row(out, '叠加口径少算的税')).toBe(8400);
        expect(out.note).toContain('互斥');
    });
});

describe('政策执行至 2027-12-31，2028 年起全额并入', () => {
    test('给出剩余天数与到期后的影响', () => {
        const out = compute();
        const days = window.EuriskoTaxRegistry.statusOf('expat-allowance').daysLeft;
        expect(days).toBeGreaterThan(365);
        expect(days).toBeLessThan(600);
        expect(row(out, '距政策到期')).toBe(days + ' 天');

        // 到期后津补贴全额并入 → 多交的正是现在免掉的那部分
        expect(row(out, '政策到期后（2028 起）多交')).toBe(16000);
        expect(row(out, '政策到期影响')).toBe(7600);
        expect(out.note).toContain('2028 年起');
    });

    test('到期日与状态一律问注册表，不自己算日期', () => {
        const status = window.EuriskoTaxRegistry.statusOf('expat-allowance');
        expect(status.expired).toBe(false);
        expect(status.expiresOn).toBe('2027-12-31');
        expect(Q().rules().expiresOn).toBe('2027-12-31');
    });
});

describe('走向导：由 spec 驱动', () => {
    beforeEach(() => {
        localStorage.clear();
        window.showPage = jest.fn();
        document.body.innerHTML = '<div id="deep-wizard-page" class="page hidden"></div>';
    });

    test('被通用向导接管：税基 → 津补贴逐项 → 专项附加扣除对照 → 结果', () => {
        const tool = R().get('expat-deep');
        expect(W().has(tool)).toBe(true);
        expect(tool.pageId).toBeUndefined();
        expect(W().stepsOf(tool).map((s) => s.title))
            .toEqual(['税基', '津补贴逐项', '专项附加扣除对照', '计算结果']);
    });

    test('自带 spec，没有被孪生速算器覆盖', () => {
        const deep = R().get('expat-deep');
        const quick = R().get('expat');
        expect(deep.compute).not.toBe(quick.compute);
        expect(deep.fields).not.toBe(quick.fields);
        expect(deep.fields.map((f) => f.key)).toEqual([
            'taxableBefore', 'items', 'children', 'housing', 'rentTier', 'elderly', 'specialDirect'
        ]);
        expect(deep.steps).toHaveLength(3);
        expect(deep.policyKey).toBe('expat-allowance');    // 时效提醒仍指向同一条登记
    });

    test('走完向导：主结果、逐项核定明细、免责声明、结果归属都在', () => {
        W().open('expat-deep', { fresh: true });
        for (let i = 0; i < 10; i++) {
            const next = document.getElementById('dw-next');
            if (!next) break;
            next.click();
            if (document.getElementById('dw-result-card')) break;
        }
        expect(document.getElementById('dw-result-primary')).toBeTruthy();
        expect(document.querySelector('.result-disclaimer').textContent).toContain('不构成税务建议');

        const card = document.getElementById('dw-result-card');
        expect(card.textContent).toContain('逐项核定明细');
        expect(card.getAttribute('data-tool-id')).toBe('expat-deep');
    });

    test('租房城市档是条件字段：选「都不享受」时它不出现', () => {
        W().open('expat-deep', { fresh: true });
        // 走到第三步（专项附加扣除对照）
        for (let i = 0; i < 2; i++) document.getElementById('dw-next').click();
        expect(document.getElementById('qf-rentTier')).toBeTruthy();

        document.getElementById('qf-housing').value = 'none';
        document.getElementById('qf-housing').dispatchEvent(new Event('change'));
        expect(document.getElementById('qf-rentTier')).toBeNull();
    });
});
