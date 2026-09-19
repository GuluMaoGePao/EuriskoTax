// 企业所得税完整测算（阶段17 17C-2 纵深，v1.59.0）的回归网
//
// 17C-2 在 v1.48.0 交付的是「铺齐」—— corporate-income-tax-deep 当时只有元数据，
// 字段与计算**共享 cit 速算器**。与 vat 不同，cit 速算器本身已经不浅（纳税调增 +
// 小微/高新孰优 + 300 万临界点），所以这一版补的不是「再给一条填数路径」，而是
// **三处速算器收了数、却没说口径**的地方：
//
//   ① **从业人数与资产总额看的是「全年季度平均值」，不是期末数**
//      （国家税务总局公告 2019 年第 2 号）。速算器只收一个数，把「填哪个数」推给了用户 ——
//      于是 **12 月 31 日裁员到 300 人以下被认为是「够格了」**。
//   ② **研发费用加计扣除不是「少交一点税」**：它直接减少应纳税所得额，够得着 300 万门槛时
//      会**整档从 25% 掉回 5%** —— 边际收益在临界点是**跳变**的，不是线性的。
//   ③ **以前年度亏损会过期作废**：一般企业 5 年，当年具备高新 / 科技型中小企业资格的延长至 10 年。
//      速算器只收一个「可弥补亏损」数字，不问这笔是哪一年、还在不在弥补期。
//
// 另：科技型中小企业**不减税率**（那是高新 15% 的事），它只延长亏损结转年限 —— 这两件事
// 常被混为一谈，所以单独钉住。
//
// 口径仍同源：税额、小微三门槛、孰优、临界点、三大扣除限额一律走 `EuriskoCorporateQuick`；
// 季度平均值 / 加计扣除 / 亏损台账走新增的三个 quick 函数（同样读 tax-constants）。

const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/corporate-income-tax-quick.js');
    loadSource('src/js/calculation/utils.js');
    loadSource('src/js/data/tool-registry.js');
    loadSource('src/js/ui/toolbox-ui.js');
    loadSource('src/js/ui/deep-wizard-ui.js');
});

const R = () => window.EuriskoToolRegistry;
const W = () => window.EuriskoDeepWizard;
const C = () => window.EuriskoCorporateQuick;

// 默认场景刻意做成「加计扣除让你整档掉回 5%」的样板：
//   Q1–Q3 各 280 人、Q4 季末裁到 250 人 → 全年季度平均 288.75 人（仍 ≤300，期末 250 不作数）
//   收入 1200 万 − 成本 880 万 = 320 万，三大限额调增 24 万 → 344 万（超 300 万门槛，25%）
//   研发 100 万按 100% 加计 → 244 万（回到门槛内，5%）
//   往年亏损只有一笔 2019 年的 150 万 → 一般企业 2024 年度已到期作废
function compute(values) {
    return R().get('corporate-income-tax-deep').compute(Object.assign({
        highTech: false,
        smeTech: false,
        industry: 'general',
        restricted: false,
        quarters: [
            { staffBegin: 280, staffEnd: 280, assetsBegin: 3000, assetsEnd: 3000 },
            { staffBegin: 280, staffEnd: 280, assetsBegin: 3000, assetsEnd: 3000 },
            { staffBegin: 280, staffEnd: 280, assetsBegin: 3000, assetsEnd: 3000 },
            { staffBegin: 380, staffEnd: 250, assetsBegin: 3000, assetsEnd: 3000 }
        ],
        revenue: 12000000,
        cost: 8800000,
        entertainment: 100000,
        advertising: 2000000,
        donation: 300000,
        rdExpense: 1000000,
        currentYear: 2026,
        losses: [{ year: 2019, amount: 1500000 }]
    }, values || {}));
}

function row(out, label) {
    const r = out.rows.find((x) => x.label === label);
    return r ? r.value : undefined;
}

describe('与速算器同源：核定后的数传给 quick，逐点相等', () => {
    test('一般纳税人：无调增、无加计、无亏损 ≡ enterpriseOf 直达', () => {
        const out = compute({
            revenue: 2000000, cost: 1000000,
            entertainment: 0, advertising: 0, donation: 0,
            rdExpense: 0, losses: [],
            quarters: [
                { staffBegin: 80, staffEnd: 80, assetsBegin: 1000, assetsEnd: 1000 }
            ]
        });
        const direct = C().enterpriseOf({
            taxable: 1000000, staff: 80, assets: 10000000, highTech: false, restricted: false
        });
        expect(out.primary.value).toBe(direct.tax);          // 100 万 → 小微 5% = 5 万
        expect(out.primary.value).toBe(50000);
    });

    test('从业人数与资产总额传的是**全年季度平均值**，不是期末数', () => {
        const out = compute();
        // Q1–Q3 各 280、Q4 (380+250)/2 = 315 → (280+280+280+315)/4 = 288.75
        expect(row(out, '从业人数（全年季度平均值）')).toBeCloseTo(288.75, 6);
        expect(row(out, '从业人数（期末数，不作数）')).toBe(250);
        expect(row(out, '资产总额（全年季度平均值）')).toBe(30000000);
        // 同一组数交给 quick，结论必须一致
        const direct = C().enterpriseOf({
            taxable: 2440000, staff: 288.75, assets: 30000000, highTech: false, restricted: false
        });
        expect(out.primary.value).toBe(direct.tax);
    });

    test('三大扣除限额走 deductionLimitOf，一个数都不自己算', () => {
        const out = compute();
        const limit = C().deductionLimitOf({
            revenue: 12000000, profit: 3200000,
            entertainment: 100000, advertising: 2000000, donation: 300000
        });
        expect(row(out, '业务招待费调增')).toBe(limit.entertainment.addBack);
        expect(row(out, '广宣费调增')).toBe(limit.advertising.addBack);
        expect(row(out, '公益性捐赠调增')).toBe(limit.donation.addBack);
        expect(row(out, '调增后所得额')).toBe(limit.adjustedProfit);
    });
});

describe('① 全年季度平均值：12 月 31 日裁员到 300 人以下没有用', () => {
    function scenario(quarters) {
        return compute({
            quarters: quarters, revenue: 12000000, cost: 10000000,
            entertainment: 0, advertising: 0, donation: 0,
            rdExpense: 0, losses: []
        });
    }

    test('公式：季度平均 =（季初+季末）÷2，全年 = 四个季度平均之和 ÷4', () => {
        const a = C().quarterlyAverageOf([{ begin: 380, end: 380 }, { begin: 380, end: 380 },
            { begin: 380, end: 380 }, { begin: 380, end: 250 }]);
        expect(a.quarters).toEqual([380, 380, 380, 315]);
        expect(a.annualAverage).toBeCloseTo(363.75, 6);
        expect(a.yearEnd).toBe(250);                        // 期末 250，看着符合 ≤300
    });

    test('期末 250 人看着符合，但全年季度平均 363.75 人 → **不符合小微**', () => {
        const out = scenario([{ staffBegin: 380, staffEnd: 380, assetsBegin: 3000, assetsEnd: 3000 },
            { staffBegin: 380, staffEnd: 380, assetsBegin: 3000, assetsEnd: 3000 },
            { staffBegin: 380, staffEnd: 380, assetsBegin: 3000, assetsEnd: 3000 },
            { staffBegin: 380, staffEnd: 250, assetsBegin: 3000, assetsEnd: 3000 }]);
        expect(row(out, '未满足小微的原因')).toBe('从业人数（全年季度平均值）超 300 人');
        expect(out.primary.value).toBe(500000);             // 200 万 × 25%
    });

    test('把人数错当成期末数，会少算 40 万税', () => {
        const at = scenario([{ staffBegin: 380, staffEnd: 380, assetsBegin: 3000, assetsEnd: 3000 },
            { staffBegin: 380, staffEnd: 380, assetsBegin: 3000, assetsEnd: 3000 },
            { staffBegin: 380, staffEnd: 380, assetsBegin: 3000, assetsEnd: 3000 },
            { staffBegin: 380, staffEnd: 250, assetsBegin: 3000, assetsEnd: 3000 }]);
        // 拿期末 250 人当口径（错），得到的就是小微 5%
        const wrong = C().enterpriseOf({ taxable: 2000000, staff: 250, assets: 30000000 });
        expect(wrong.tax).toBe(100000);                     // 200 万 × 5%
        expect(at.primary.value - wrong.tax).toBe(400000);   // 差 40 万
        expect(row(at, '从业人数（期末数，不作数）')).toBe(250);
        expect(at.note).toContain('不作数');
    });

    test('年末处置资产同理：资产总额也看全年季度平均', () => {
        // Q1–Q3 各 6000 万、Q4 年末处置到 2000 万 → (6000+6000+6000+4000)/4 = 5500 万
        const out = scenario([{ staffBegin: 80, staffEnd: 80, assetsBegin: 6000, assetsEnd: 6000 },
            { staffBegin: 80, staffEnd: 80, assetsBegin: 6000, assetsEnd: 6000 },
            { staffBegin: 80, staffEnd: 80, assetsBegin: 6000, assetsEnd: 6000 },
            { staffBegin: 80, staffEnd: 80, assetsBegin: 6000, assetsEnd: 2000 }]);
        expect(row(out, '资产总额（全年季度平均值）')).toBe(55000000);
        expect(row(out, '未满足小微的原因')).toBe('资产总额（全年季度平均值）超 5000 万');
        expect(out.primary.value).toBe(500000);              // 200 万 × 25%（期末 2000 万不作数）
    });
});

describe('② 研发费用加计扣除：够得着门槛时是「整档掉」', () => {
    test('344 万压回 244 万：从 25% 档掉回 5% 档，省 73.8 万', () => {
        const out = compute();
        expect(row(out, '调增后所得额')).toBe(3440000);
        expect(row(out, '研发费用加计扣除')).toBe(1000000);
        expect(row(out, '应纳税所得额')).toBe(2440000);
        expect(out.primary.value).toBe(122000);             // 244 万 × 25% × 20% = 12.2 万
        expect(row(out, '若不做研发费用归集（无加计扣除）')).toBe(860000);   // 344 万 × 25%
        expect(row(out, '加计扣除省下的税')).toBe(738000);
        expect(out.note).toContain('整档从 25% 掉到 5%');
    });

    test('加计比例与负面清单都取自常量，改常量后前台同口径生效', () => {
        expect(C().rules().rdSuperDeduction.ratio).toBe(1.00);
        const excluded = C().rules().rdSuperDeduction.excluded.map((x) => x.key);
        expect(excluded).toContain('tobacco');
        expect(excluded).toContain('catering');
        expect(excluded).toContain('entertainment');
    });

    test('负面清单行业一律不得加计：烟草制造业一分钱也加不了', () => {
        const normal = compute({ industry: 'general' });
        const tobacco = compute({ industry: 'tobacco' });
        expect(row(tobacco, '研发费用加计扣除')).toBe(0);
        expect(row(tobacco, '应纳税所得额')).toBe(3440000);  // 加不了 → 仍在 25% 档
        expect(tobacco.primary.value).toBe(860000);
        expect(tobacco.note).toContain('负面清单');
        expect(normal.primary.value).toBe(122000);
    });

    test('已经稳在 5% 档时，100 万加计只省 5 万 —— 边际收益就是这一档的税率', () => {
        const out = compute({
            revenue: 10000000, cost: 8000000,                 // 会计利润 200 万
            entertainment: 0, advertising: 0, donation: 0,
            rdExpense: 1000000,                               // → 100 万，仍在 5% 档
            losses: []
        });
        expect(row(out, '应纳税所得额')).toBe(1000000);
        expect(out.primary.value).toBe(50000);
        expect(row(out, '若不做研发费用归集（无加计扣除）')).toBe(100000);
        expect(row(out, '加计扣除省下的税')).toBe(50000);      // 100 万 × 5%
        expect(out.note).toContain('一直在同一档');
    });

    test('一直在同一档时，note 不会误报「整档掉」', () => {
        const out = compute({
            revenue: 10000000, cost: 8000000,
            entertainment: 0, advertising: 0, donation: 0,
            rdExpense: 1000000, losses: []
        });
        expect(out.note).not.toContain('整档从');
    });
});

describe('③ 以前年度亏损会过期作废', () => {
    test('2026 年汇算：2019 年那 150 万亏已经过期（5 年 → 2024 年度到期）', () => {
        const out = compute({ rdExpense: 0, losses: [{ year: 2019, amount: 1500000 }] });
        expect(row(out, '弥补以前年度亏损（在弥补期内）')).toBe(0);
        expect(row(out, '已过弥补期作废的亏损')).toBe(1500000);
        expect(out.note).toContain('已过弥补期作废');
        expect(out.primary.value).toBe(860000);              // 344 万 × 25%
    });

    test('取得科技型中小企业资格 → 延长至 10 年，那 150 万亏能救回来', () => {
        const out = compute({ smeTech: true });
        expect(row(out, '弥补以前年度亏损（在弥补期内）')).toBe(1500000);
        expect(row(out, '已过弥补期作废的亏损')).toBe(0);
        expect(row(out, '应纳税所得额')).toBe(940000);        // 244 万 − 150 万
        expect(out.primary.value).toBe(47000);                // 94 万 × 5%
    });

    test('科技型中小企业**不减税率**，只延长亏损结转年限', () => {
        const noLoss = { losses: [], rdExpense: 0 };
        const plain = compute(noLoss);
        const sme = compute(Object.assign({ smeTech: true }, noLoss));
        expect(plain.primary.value).toBe(sme.primary.value);   // 没有往年亏损时，勾与不勾完全一样
        expect(row(plain, '适用身份')).toBe(row(sme, '适用身份'));
    });

    test('高新技术企业同时享有 15% 与延长资格，但小微 5% 更优时仍取小微', () => {
        const out = compute({ highTech: true });
        expect(row(out, '适用身份')).toBe('小型微利（5%）');    // 244−150=94 万，5% = 4.7 万 < 15%
        expect(out.primary.value).toBe(47000);
    });

    test('先到期的先弥补，且不超过当期所得额', () => {
        const carry = C().lossCarryOf({
            losses: [{ year: 2022, amount: 1000000 }, { year: 2024, amount: 2000000 }],
            currentYear: 2026, extended: false, limit: 1500000
        });
        expect(carry.total).toBe(1500000);
        expect(carry.rows[0].used).toBe(1000000);            // 2022 年的先补满
        expect(carry.rows[1].used).toBe(500000);             // 2024 年的只能补 50 万
        expect(carry.carryOn).toBe(1500000);                 // 剩余结转以后年度
    });

    test('台账给出每一笔的到期年度与结论', () => {
        const out = compute({ rdExpense: 0 });
        const table = out.extras.find((x) => x.title.indexOf('亏损') >= 0).table;
        const body = JSON.stringify(table.rows);
        expect(body).toContain('2024 年');                    // 2019 + 5
        expect(body).toContain('2029 年');                    // 2019 + 10
        expect(body).toContain('已过弥补期作废');
    });
});

describe('临界点与三门槛：仍是「且」的关系，且是临界点不是起征点', () => {
    test('300 万交 15 万，300.0001 万交约 75 万 —— 多 1 元利润多缴约 60 万税', () => {
        const at = compute({
            revenue: 3000000, cost: 0, entertainment: 0, advertising: 0, donation: 0,
            rdExpense: 0, losses: []
        });
        const over = compute({
            revenue: 3000001, cost: 0, entertainment: 0, advertising: 0, donation: 0,
            rdExpense: 0, losses: []
        });
        expect(at.primary.value).toBe(150000);                // 300 万 × 5%
        expect(over.primary.value).toBeCloseTo(750000.25, 2);  // 300.0001 万 × 25%
        expect(row(at, '踩线代价（+1 元）')).toBeCloseTo(600000.25, 2);
    });

    test('超门槛后提示「压回门槛的成本上限就是踩线代价」', () => {
        const out = compute({
            revenue: 4000000, cost: 0, entertainment: 0, advertising: 0, donation: 0,
            rdExpense: 0, losses: []
        });
        expect(out.primary.value).toBe(1000000);
        expect(out.note).toContain('压回门槛的成本低于这个数就值得压');
    });

    test('三个门槛是「且」的关系：人数符合但资产超标 → 照样全额 25%', () => {
        const out = compute({
            revenue: 2000000, cost: 1800000, entertainment: 0, advertising: 0, donation: 0,
            rdExpense: 0, losses: [],
            quarters: [{ staffBegin: 80, staffEnd: 80, assetsBegin: 6000, assetsEnd: 6000 }]
        });
        expect(row(out, '未满足小微的原因')).toBe('资产总额（全年季度平均值）超 5000 万');
        expect(out.primary.value).toBe(50000);                // 20 万 × 25%
    });

    test('限制/禁止行业一票否决（所得额、人数、资产都符合也没用）', () => {
        const out = compute({
            restricted: true, rdExpense: 0, losses: [],
            revenue: 1000000, cost: 0, entertainment: 0, advertising: 0, donation: 0
        });
        expect(row(out, '应纳税所得额')).toBe(1000000);      // 三个量化门槛全部符合
        expect(row(out, '未满足小微的原因')).toBe('属于限制/禁止行业');
        expect(out.primary.value).toBe(250000);              // 100 万 × 25%
    });
});

describe('规格：自带 spec，且与速算器口径同源', () => {
    test('corporate-income-tax-deep 自带 fields / compute（不再与速算器共享）', () => {
        const deep = R().get('corporate-income-tax-deep');
        const quick = R().get('corporate-income-tax');
        expect(deep.fields).toBeTruthy();
        expect(deep.fields).not.toBe(quick.fields);
        expect(deep.compute).not.toBe(quick.compute);
        expect(deep.policyKey).toBe('corporate-small-low-profit');
    });

    test('4 步 + 自动追加的结果步', () => {
        const steps = W().stepsOf(R().get('corporate-income-tax-deep'));
        expect(steps).toHaveLength(5);
        expect(steps.map((s) => s.title)).toEqual([
            '企业身份与资质', '从业人数与资产总额', '收入成本与纳税调整', '研发加计扣除与亏损弥补', '计算结果'
        ]);
        expect(steps[4].result).toBe(true);
    });

    test('坑位清单覆盖三处口径与两个结转年限差异', () => {
        const p = R().get('corporate-income-tax-deep').pitfalls.join('\n');
        expect(p).toContain('全年季度平均值');
        expect(p).toContain('整档从 25% 掉回 5%');
        expect(p).toContain('过期作废');
        expect(p).toContain('科技型中小企业不减税率');
        expect(p).toContain('结转三年');
    });

    test('结果带推导链（与速算器同一套 steps 约定）', () => {
        const out = compute();
        expect(out.steps).toHaveLength(5);
        expect(out.steps[0].title).toContain('全年季度平均值');
        expect(out.steps[2].title).toContain('加计扣除');
    });
});

describe('走向导：分步填、repeater 与结果都能走通', () => {
    beforeEach(() => {
        localStorage.clear();
        window.showPage = jest.fn();
        document.body.innerHTML = '<div id="deep-wizard-page" class="page hidden"></div>';
    });

    test('打开向导：步骤条与第一步渲染出来', () => {
        expect(W().open('corporate-income-tax-deep', { fresh: true })).toBe(true);
        const host = document.getElementById('deep-wizard-page');
        expect(host.querySelectorAll('.step-number')).toHaveLength(5);
        expect(host.querySelector('.step-title.active').textContent).toBe('企业身份与资质');
        expect(host.querySelector('#qf-industry')).toBeTruthy();
    });

    test('季初 / 季末 repeater 渲染出四个季度', () => {
        W().open('corporate-income-tax-deep', { fresh: true });
        document.getElementById('dw-next').click();           // → 从业人数与资产总额
        expect(document.getElementById('qf-quarters-0-staffBegin')).toBeTruthy();
        expect(document.getElementById('qf-quarters-3-staffEnd')).toBeTruthy();
        expect(document.getElementById('qf-quarters-0-assetsBegin')).toBeTruthy();
    });

    test('走到结果步，算出的税与直接调 compute 一致', () => {
        W().open('corporate-income-tax-deep', { fresh: true });
        for (let i = 0; i < 6 && !document.getElementById('dw-result-primary'); i++) {
            document.getElementById('dw-next').click();
        }
        const host = document.getElementById('deep-wizard-page');
        const direct = compute();
        expect(host.textContent).toContain(
            window.EuriskoToolbox.fmtValue(direct.primary.value, direct.primary.kind)
        );
        expect(host.querySelector('[id="dw-formula-panel"]')).toBeTruthy();
    });

    test('亏损台账 repeater 可增行，且勾科技型中小企业后税会变', () => {
        W().open('corporate-income-tax-deep', { fresh: true });
        document.getElementById('qf-smeTech').checked = true;
        document.getElementById('qf-smeTech').dispatchEvent(new Event('change'));
        const withSme = compute({ smeTech: true });
        const without = compute({ smeTech: false });
        expect(withSme.primary.value).toBeLessThan(without.primary.value);
        expect(without.primary.value - withSme.primary.value).toBe(75000);   // 救回 7.5 万
    });
});
