// 年度汇算清缴（阶段17 17D-7，v1.63.0）的回归网
//
// 它守护的是三件速算器那五个输入框做不到、而用户真正需要的事：
//   ① **基本减除费用在汇算时是年定额 6 万元，不按任职月数折算**（个税法第六条）——
//      速算器用「5000 × 任职月数」当汇算扣除，那是**预扣**口径。年中入职 6 个月、
//      月薪 2 万的人：汇算应纳税额 2580、已预缴 5580 → **退 3000**，速算器算出「不补不退」；
//   ② **劳务报酬 / 稿酬 / 特许权使用费按「收入额」并入**（劳务、特许权 80%，稿酬 56%），
//      预扣却最高按 40% 扣。全年劳务 10 万：预扣 25000、汇算应纳税额 600 → **退 24400**，
//      速算器根本没有这几个框，这笔钱在它眼里不存在；
//   ③ **大病医疗只能在汇算时扣**（超 1.5 万的部分、限额 8 万），平时预扣一分钱也扣不到
//      —— 同样一笔 10 万自付，汇算能退 6180，不办汇算就等于放弃。
// 另外两件速算器给不出的结论：**免办判定**（补税 ≤ 400 元，或综合所得收入 ≤ 12 万元）
// 与**年终奖两口径对照**（低收入者并入往往全退：3 万年终奖单独计税 900 元 vs 并入 0 元）。
//
// 口径仍同源：一切计算走 `EuriskoSettlementQuick.settlementFullOf`，它自己又调
// withholding-quick（收入额与预扣率）、bonus-quick（单独计税）与 specialDeductionRules
// （大病医疗限额）—— 一个税率、一条公式都没复制。

const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/tax-calculator.js');       // 年度表由内核出
    loadSource('src/js/calculation/tax-registry.js');         // policyKey 到期状态
    loadSource('src/js/calculation/withholding-quick.js');
    loadSource('src/js/calculation/bonus-tax-quick.js');
    loadSource('src/js/calculation/annual-settlement-quick.js');
    loadSource('src/js/calculation/utils.js');
    loadSource('src/js/data/tool-registry.js');
    loadSource('src/js/ui/toolbox-ui.js');
    loadSource('src/js/ui/deep-wizard-ui.js');
});

const R = () => window.EuriskoToolRegistry;
const W = () => window.EuriskoDeepWizard;
const Q = () => window.EuriskoSettlementQuick;

// 默认输入 = 速算器的默认形态：一处任职、全年 12 个月、只有工资、没有劳务稿酬与年终奖
function compute(values) {
    return R().get('annual-settlement-deep').compute(Object.assign({
        jobs: [{ monthlyIncome: 15000, months: 12, monthlyInsurance: 1500, monthlySpecial: 1000 }],
        labor: 0, author: 0, royalty: 0,
        specialOverride: 'auto', annualSpecial: 24000,
        medicalSelfPay: 0, otherDeduction: 0,
        bonus: 0, bonusDeclared: 'separate',
        prepaidTax: 0
    }, values || {}));
}

function row(out, label) {
    const r = out.rows.find((x) => x.label === label);
    return r ? r.value : undefined;
}

function full(values) {
    return Q().settlementFullOf(Object.assign({
        jobs: [{ monthlyIncome: 15000, months: 12, monthlyInsurance: 1500, monthlySpecial: 1000 }],
        labor: 0, author: 0, royalty: 0,
        medicalSelfPay: 0, otherDeduction: 0,
        bonus: 0, bonusDeclared: 'separate'
    }, values || {}));
}

describe('与速算器同源：一处任职、全年 12 个月 ≡ settlementOf 逐点相等', () => {
    test('默认输入：收入额 18 万 − 扣除 9 万 = 应纳税所得额 9 万，不补不退', () => {
        const out = compute();
        const quick = Q().settlementOf(15000, 12, 1500, 1000, 0);

        expect(quick.annualIncome).toBe(180000);
        expect(quick.annualTaxable).toBe(90000);
        expect(quick.annualTax).toBe(6480);
        expect(quick.diff).toBe(0);

        expect(row(out, '汇算收入额合计')).toBe(180000);
        expect(row(out, '扣除合计')).toBe(90000);
        expect(row(out, '应纳税所得额')).toBe(90000);
        expect(row(out, '全年应纳税额')).toBe(6480);
        expect(row(out, '全年已预缴')).toBe(6480);
        expect(out.primary.label).toBe('不补不退');
        expect(out.primary.value).toBe(0);
    });

    test('速算器口径（naive）在 12 个月时与汇算口径完全一致 —— 差异只来自任职不足 12 个月', () => {
        const r = full({});
        expect(r.naive.diff).toBe(r.diff);
        expect(r.naiveGap).toBe(0);
        expect(row(compute(), '与速算器口径的差')).toBe(0);
    });

    test('填了实际已预缴就按填的值走，不再推演', () => {
        const out = compute({ prepaidTax: 5000 });
        expect(row(out, '全年已预缴')).toBe(5000);
        expect(row(out, '全年应纳税额')).toBe(6480);
        expect(out.primary.label).toBe('应补个税');
        expect(out.primary.value).toBe(1480);
    });
});

describe('减除费用是年定额 6 万，不按任职月数折算', () => {
    test('年中入职 6 个月（月薪 2 万）：退 3000，速算器算成不补不退', () => {
        const out = compute({ jobs: [{ monthlyIncome: 20000, months: 6, monthlyInsurance: 1500, monthlySpecial: 0 }] });

        expect(row(out, '汇算收入额合计')).toBe(120000);
        // 扣除 = 6 万定额 + 五险一金 9000（1500 × 6），专项附加未申报
        expect(row(out, '扣除合计')).toBe(69000);
        expect(row(out, '应纳税所得额')).toBe(51000);
        expect(row(out, '全年应纳税额')).toBe(2580);
        // 预扣：每月 20000 − 5000 − 1500 = 13500，累计 6 个月 = 81000 → 81000 × 10% − 2520
        expect(row(out, '全年已预缴')).toBe(5580);
        expect(out.primary.label).toBe('应退个税');
        expect(out.primary.value).toBe(3000);

        // 速算器按「5000 × 6 = 3 万」当减除费用 → 应纳税所得额 81000、应纳税额 5580 ≡ 已预缴 → 0
        expect(row(out, '速算器口径算出的退补')).toBe(0);
        expect(row(out, '与速算器口径的差')).toBe(-3000);
    });

    test('速算器的 naive 口径只有一处任职：两段被当成一段连续任职 → 补税被算没了', () => {
        // 前 6 个月月薪 1 万、后 6 个月涨到 1.5 万（跳槽），两段各自从 0 开始累计预扣
        const out = compute({
            jobs: [
                { monthlyIncome: 10000, months: 6, monthlyInsurance: 1000, monthlySpecial: 0 },
                { monthlyIncome: 15000, months: 6, monthlyInsurance: 1000, monthlySpecial: 0 }
            ]
        });
        expect(row(out, '汇算收入额合计')).toBe(150000);
        expect(row(out, '全年应纳税额')).toBe(5280);
        expect(row(out, '全年已预缴')).toBe(3600);     // 720 + 2880
        expect(out.primary.label).toBe('应补个税');
        expect(out.primary.value).toBe(1680);
        // 速算器把两段拼成「月薪 12500 × 12」→ 应纳税额 5280 ≡ 已预缴 5280 → 0
        expect(row(out, '速算器口径算出的退补')).toBe(0);
        expect(row(out, '与速算器口径的差')).toBe(1680);
    });
});

describe('劳务报酬 / 稿酬 / 特许权：按收入额并入，预扣率与汇算口径不同', () => {
    test('全年劳务报酬 10 万：预扣 25000、汇算应纳税额 600 → 退 24400', () => {
        const out = compute({ jobs: [], labor: 100000 });

        // 收入额 = 10 万 × 80% = 8 万；扣除只有 6 万定额 → 应纳税所得额 2 万
        expect(row(out, '汇算收入额合计')).toBe(80000);
        expect(row(out, '应纳税所得额')).toBe(20000);
        expect(row(out, '全年应纳税额')).toBe(600);
        // 预扣：应纳税所得额 8 万 → 40% 档 → 80000 × 40% − 7000
        expect(row(out, '全年已预缴')).toBe(25000);
        expect(out.primary.label).toBe('应退个税');
        expect(out.primary.value).toBe(24400);
        expect(row(out, '要不要办理')).toContain('退税是权利');
    });

    test('全年稿酬 5 万：收入额 56%（2.8 万），预扣按 20% → 退 5600', () => {
        const out = compute({ jobs: [], author: 50000 });
        expect(row(out, '汇算收入额合计')).toBe(28000);
        expect(row(out, '全年已预缴')).toBe(5600);      // 5 万 × 80% × 70% × 20%
        expect(out.primary.value).toBe(5600);
        expect(out.primary.label).toBe('应退个税');
    });

    test('折算率与预扣率都取自 otherIncomeRules / withholdingTaxRates，不复制', () => {
        const Wq = window.EuriskoWithholdingQuick;
        expect(Wq.incomeOf('labor', 100000)).toBe(80000);
        expect(Wq.incomeOf('author', 50000)).toBe(28000);
        expect(Wq.taxOf('labor', 100000)).toBe(25000);

        const r = full({ jobs: [], labor: 100000, author: 50000, royalty: 20000 });
        expect(r.otherIncomeTotal).toBe(80000 + 28000 + 16000);
        expect(r.otherPrepaid).toBe(25000 + 5600 + 3200);
        expect(r.other).toHaveLength(3);
    });

    test('有工资也有劳务：合并后档位抬高，退税被吃掉一部分', () => {
        // 月薪 1 万 × 12 + 劳务 10 万：收入额 = 12 万 + 8 万 = 20 万，扣除 6 万 + 五险一金 1.8 万
        const out = compute({
            jobs: [{ monthlyIncome: 10000, months: 12, monthlyInsurance: 1500, monthlySpecial: 0 }],
            labor: 100000
        });
        expect(row(out, '汇算收入额合计')).toBe(200000);
        expect(row(out, '扣除合计')).toBe(78000);
        expect(row(out, '应纳税所得额')).toBe(122000);
        expect(row(out, '全年应纳税额')).toBe(9680);    // 12.2 万仍在 10% 档：122000 × 10% − 2520
        // 工资：每月 10000 − 5000 − 1500 = 3500，累计 42000 → 42000 × 10% − 2520 = 1680
        expect(row(out, '全年已预缴')).toBe(25000 + 1680);
        expect(out.primary.value).toBe(17000);          // 劳务那 25000 预扣只退回 17000，档位抬高了
        expect(out.primary.label).toBe('应退个税');
    });
});

describe('大病医疗：只能在汇算时扣，超 1.5 万的部分限额 8 万', () => {
    test('自付 10 万 → 可扣 8 万，退税 6180（原本不补不退）', () => {
        const out = compute({ medicalSelfPay: 100000 });
        expect(row(out, '专项附加扣除')).toBe(92000);     // 各段申报 1.2 万 + 大病 8 万
        expect(row(out, '扣除合计')).toBe(170000);
        expect(row(out, '全年应纳税额')).toBe(300);
        expect(out.primary.label).toBe('应退个税');
        expect(out.primary.value).toBe(6180);
    });

    test('起扣线以下一分不扣；超过 8 万的部分也不扣', () => {
        expect(Q().medicalDeductionOf(12000).deduction).toBe(0);
        expect(Q().medicalDeductionOf(15000).deduction).toBe(0);
        expect(Q().medicalDeductionOf(15001).deduction).toBe(1);
        expect(Q().medicalDeductionOf(95000).deduction).toBe(80000);

        const m = Q().medicalDeductionOf(100000);
        expect(m.cutBelowThreshold).toBe(15000);
        expect(m.cutOverCap).toBe(5000);
    });

    test('扣除核定明细表给出三段：起扣线以下 / 超限额 / 汇算可扣', () => {
        const out = compute({ medicalSelfPay: 100000 });
        const tbl = out.extras.find((e) => e.title === '大病医疗扣除核定');
        expect(tbl).toBeTruthy();
        expect(tbl.table.rows.map((r) => r[r.length - 1].value)).toEqual([100000, 15000, 5000, 80000]);
    });
});

describe('年终奖：汇算时还能改一次口径', () => {
    test('低收入者并入更省：3 万年终奖单独计税 900 元，并入后 0 元', () => {
        const out = compute({
            jobs: [{ monthlyIncome: 5000, months: 12, monthlyInsurance: 1500, monthlySpecial: 2000 }],
            bonus: 30000
        });
        expect(row(out, '年终奖：单独计税')).toBe(900);
        expect(row(out, '年终奖：并入综合所得')).toBe(0);
        expect(row(out, '年终奖怎么算更省')).toBe('并入综合所得');
        expect(row(out, '两种口径差额')).toBe(900);
    });

    test('高收入者单独计税更省：月薪 3 万 + 奖金 10 万，差 12210 元', () => {
        const out = compute({
            jobs: [{ monthlyIncome: 30000, months: 12, monthlyInsurance: 3000, monthlySpecial: 2000 }],
            bonus: 100000
        });
        expect(row(out, '年终奖：单独计税')).toBe(40870);     // 31080 + 9790
        expect(row(out, '年终奖：并入综合所得')).toBe(53080);
        expect(row(out, '年终奖怎么算更省')).toBe('单独计税');
        expect(row(out, '两种口径差额')).toBe(12210);
    });

    test('单独计税时年终奖不并入收入额；改选并入后收入额里才出现这笔奖金', () => {
        const separate = full({ bonus: 30000, bonusDeclared: 'separate' });
        const merged = full({ bonus: 30000, bonusDeclared: 'merged' });
        expect(separate.incomeAmountTotal).toBe(180000);
        expect(merged.incomeAmountTotal).toBe(210000);
        // 并入时，单位先前按单独计税扣的 900 元参与清算
        expect(merged.prepaidTax).toBe(separate.prepaidTax + 900);
    });

    test('没有奖金时不出现年终奖那几行，也不出现对照表', () => {
        const out = compute({ bonus: 0 });
        expect(row(out, '年终奖：单独计税')).toBeUndefined();
        expect(out.extras.some((e) => e.title.indexOf('年终奖') >= 0)).toBe(false);
    });
});

describe('免办判定（国家税务总局公告 2019 年第 44 号）与滞纳金', () => {
    test('补税 ≤ 400 元无需办理；401 元就要办', () => {
        expect(Q().exemptOf(200000, 400).needFile).toBe(false);
        expect(Q().exemptOf(200000, 400).kind).toBe('smallDiff');
        expect(Q().exemptOf(200000, 401).needFile).toBe(true);
        expect(Q().exemptOf(200000, 401).kind).toBe('must');
    });

    test('综合所得收入 ≤ 12 万元无需办理；12.0001 万元就要办', () => {
        expect(Q().exemptOf(120000, 5000).needFile).toBe(false);
        expect(Q().exemptOf(120000, 5000).kind).toBe('smallIncome');
        expect(Q().exemptOf(120001, 5000).needFile).toBe(true);
    });

    test('退税是权利不是义务：不办理视为放弃，不加收滞纳金', () => {
        const ex = Q().exemptOf(200000, -100);
        expect(ex.needFile).toBe(false);
        expect(ex.optional).toBe(true);
        expect(ex.reason).toContain('放弃退税');
    });

    test('必须补税的给出滞纳金：补 1680 元逾期 30 天 = 25.2 元', () => {
        const out = compute({
            jobs: [
                { monthlyIncome: 10000, months: 6, monthlyInsurance: 1000, monthlySpecial: 0 },
                { monthlyIncome: 15000, months: 6, monthlyInsurance: 1000, monthlySpecial: 0 }
            ]
        });
        expect(row(out, '要不要办理')).toContain('次年 6 月 30 日');
        expect(row(out, '若逾期 30 天办理')).toBeCloseTo(25.2, 2);
        expect(Q().lateFeeOf(1680, 30).fee).toBeCloseTo(25.2, 2);
        expect(Q().lateFeeOf(1680, 365).fee).toBeCloseTo(1680 * 0.0005 * 365, 2);
    });

    test('不补不退时没有滞纳金那一行', () => {
        expect(row(compute(), '若逾期 30 天办理')).toBeUndefined();
    });
});

describe('多处任职并行：重复扣除 6 万是补税的另一个来源', () => {
    test('两处各干满 12 个月、月薪 6000：补 4320（速算器算不出来）', () => {
        const out = compute({
            jobs: [
                { monthlyIncome: 6000, months: 12, monthlyInsurance: 500, monthlySpecial: 0 },
                { monthlyIncome: 6000, months: 12, monthlyInsurance: 500, monthlySpecial: 0 }
            ]
        });
        expect(row(out, '汇算收入额合计')).toBe(144000);
        expect(row(out, '扣除合计')).toBe(72000);          // 6 万 + 五险一金 1.2 万（只减一份 6 万）
        expect(row(out, '全年应纳税额')).toBe(4680);        // 72000 × 10% − 2520
        expect(row(out, '全年已预缴')).toBe(360);           // 两处各 180：累计都是 6000，按 3%
        expect(out.primary.value).toBe(4320);
        // 速算器只有一处任职：月数封顶 12，收入被算成 72000 → 应纳税所得额 0 → 税 0
        expect(row(out, '速算器口径算出的退补')).toBe(0);
    });
});

describe('结构与输入边界', () => {
    test('没有收入时给出提示，不产出计税行', () => {
        const out = compute({ jobs: [] });
        expect(out.rows).toHaveLength(0);
        expect(out.note).toContain('还没有收入');
        expect(out.primary.value).toBe(0);
    });

    test('专项附加扣除默认按各段申报合计，改 manual 才用另填的数', () => {
        const auto = full({ jobs: [{ monthlyIncome: 15000, months: 12, monthlyInsurance: 1500, monthlySpecial: 1000 }] });
        expect(auto.specialDeclared).toBe(12000);
        expect(auto.specialTotal).toBe(12000);

        const manual = full({
            jobs: [{ monthlyIncome: 15000, months: 12, monthlyInsurance: 1500, monthlySpecial: 1000 }],
            annualSpecial: 24000
        });
        expect(manual.specialTotal).toBe(24000);
    });

    test('推导链三步：收入额 → 扣除 → 应退应补（结果步由渲染器追加）', () => {
        const out = compute();
        expect(out.steps).toHaveLength(3);
        expect(out.steps.map((s) => s.title)).toEqual([
            '① 收入额：四项综合所得怎么折算',
            '② 扣除：6 万定额 + 三项扣除',
            '③ 应退 / 应补 = 应纳税额 − 已预缴'
        ]);
        expect(out.steps[2].footnote).toContain('12 万元');
        expect(out.steps[2].footnote).toContain('400 元');
    });

    test('任职段明细表按段给出收入与已预缴', () => {
        const out = compute({
            jobs: [
                { monthlyIncome: 10000, months: 6, monthlyInsurance: 1000, monthlySpecial: 0 },
                { monthlyIncome: 15000, months: 6, monthlyInsurance: 1000, monthlySpecial: 0 }
            ]
        });
        const tbl = out.extras.find((e) => e.title.indexOf('任职段明细') >= 0);
        expect(tbl.table.rows).toHaveLength(2);
        expect(tbl.table.rows.map((r) => r[6].value)).toEqual([720, 2880]);
    });
});

describe('走向导：由 spec 驱动', () => {
    beforeEach(() => {
        localStorage.clear();
        window.showPage = jest.fn();
        document.body.innerHTML = '<div id="deep-wizard-page" class="page hidden"></div>';
    });

    test('被通用向导接管：全年综合所得 → 全年扣除 → 年终奖口径 → 已预缴 → 结果', () => {
        const tool = R().get('annual-settlement-deep');
        expect(W().has(tool)).toBe(true);
        expect(tool.pageId).toBeUndefined();
        expect(W().stepsOf(tool).map((s) => s.title)).toEqual([
            '全年综合所得', '全年扣除', '年终奖口径', '已预缴', '计算结果'
        ]);
    });

    test('自带 spec，没有被孪生速算器覆盖', () => {
        const deep = R().get('annual-settlement-deep');
        const quick = R().get('annual-settlement');
        expect(deep.compute).not.toBe(quick.compute);
        expect(deep.fields).not.toBe(quick.fields);
        expect(deep.fields.map((f) => f.key)).toEqual([
            'jobs', 'labor', 'author', 'royalty',
            'specialOverride', 'annualSpecial', 'medicalSelfPay', 'otherDeduction',
            'bonus', 'bonusDeclared', 'prepaidTax'
        ]);
        expect(deep.steps).toHaveLength(4);
        expect(deep.policyKey).toBe('settlement');    // 时效提醒仍指向同一条登记
    });

    test('走完向导：主结果、免责声明、结果归属都在', () => {
        W().open('annual-settlement-deep', { fresh: true });
        for (let i = 0; i < 10; i++) {
            const next = document.getElementById('dw-next');
            if (!next) break;
            next.click();
            if (document.getElementById('dw-result-card')) break;
        }
        expect(document.getElementById('dw-result-primary')).toBeTruthy();
        expect(document.querySelector('.result-disclaimer').textContent).toContain('不构成税务建议');

        const card = document.getElementById('dw-result-card');
        expect(card.textContent).toContain('任职段明细');
        expect(card.getAttribute('data-tool-id')).toBe('annual-settlement-deep');
    });

    test('「全年专项附加扣除」是条件字段：只有选了「我要另填」才出现', () => {
        W().open('annual-settlement-deep', { fresh: true });
        document.getElementById('dw-next').click();          // 走到「全年扣除」
        expect(document.getElementById('qf-annualSpecial')).toBeNull();

        document.getElementById('qf-specialOverride').value = 'manual';
        document.getElementById('qf-specialOverride').dispatchEvent(new Event('change'));
        expect(document.getElementById('qf-annualSpecial')).toBeTruthy();
    });
});
