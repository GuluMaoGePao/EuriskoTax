// 社保公积金完整测算（阶段17 17C-3 纵深，v1.60.0）的回归网
//
// 17C-3 在 v1.48.0 交付的是「铺齐」—— social-base-deep 当时只有元数据，
// 字段与计算**共享 social-base 速算器**。而速算器的字段就叫「**税前月薪**」，
// compute 直接拿它当缴费基数 —— 法定的缴费基数却是「**本人上年度月平均工资**」，
// 工资总额里**含奖金、津贴补贴、加班工资**。于是「月薪 1 万 + 年终奖 12 万」的人，
// 基数被算成 1 万，法定是 2 万：个人侧一年差 **2.7 万**、单位侧差 **4.74 万**。
//
// 四处具体的口径差：
//   ① **基数是上年度月平均工资，不是本月工资**（国家统计局《关于工资总额组成的规定》）；
//      上年度工作不满 12 个月的按**实际计薪月数**平均；基数**一年一调**，不是每月跟着工资变。
//   ② **公积金免税的两个上限是「且」的关系**（财税〔2006〕10 号）：比例 ≤12% **且**
//      基数 ≤ 社平 3 倍。公积金基数可与社保基数不同，超出的部分**并入工资计税** ——
//      速算器内部算了这个数，却没有暴露「公积金基数」这一栏，用户填不了。
//   ③ **申报基数不足额的代价**（社保费 2019 年起由税务部门征收）：补缴 + 按日万分之五
//      滞纳金（年化 18.25%）+ 欠缴数额 1~3 倍罚款（《社会保险法》第八十六条）。
//   ④ **灵活就业是另一套制度**，不是「单位职工的简化版」：养老按 20% 缴且**全部个人承担**，
//      其中 8% 进个人账户、12% 进统筹；基数在社平 60%~300% 之间**自选**；
//      而且**统筹部分不退还** —— 断缴 / 身故 / 出国定居只退个人账户那 8%。
//
// 口径仍同源：基数上下限、五项费率、公积金免税额、累计预扣一律走 `EuriskoSocialQuick`；
// 新增的四个口径函数同样读 tax-constants。

const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/social-insurance-quick.js');
    loadSource('src/js/calculation/utils.js');
    loadSource('src/js/data/tool-registry.js');
    loadSource('src/js/ui/toolbox-ui.js');
    loadSource('src/js/ui/deep-wizard-ui.js');
});

const R = () => window.EuriskoToolRegistry;
const W = () => window.EuriskoDeepWizard;
const S = () => window.EuriskoSocialQuick;

// 单位职工默认场景：月薪 1 万 + 年终奖 12 万 → 上年度月平均 2 万（速算器只按 1 万）
function compute(values) {
    return R().get('social-base-deep').compute(Object.assign({
        identity: 'employee',
        socialAverage: 8000,
        monthlyWage: 10000,
        annualBonus: 120000,
        monthlyAllowance: 0,
        monthlyOvertime: 0,
        paidMonths: 12,
        housingRate: 12,
        housingBaseMode: 'same',
        housingBase: 30000,
        specialMonthly: 0,
        declaredBase: 4800,
        auditYears: 1
    }, values || {}));
}

// 没有奖金津贴加班时，上年度月平均 = 本月工资 —— 此时 deep 必须与速算器逐点相等
const NO_EXTRA = { annualBonus: 0, monthlyAllowance: 0, monthlyOvertime: 0, paidMonths: 12 };

function row(out, label) {
    const r = out.rows.find((x) => x.label === label);
    return r ? r.value : undefined;
}

describe('与速算器同源：核定后的数传给 quick，逐点相等', () => {
    test('没有奖金津贴加班时 ≡ social-base 速算器直达', () => {
        const out = compute(NO_EXTRA);
        const s = S().socialInsuranceOf({ wage: 10000, socialAverage: 8000, housingRate: 0.12 });
        expect(out.primary.value).toBe(s.personalTotal);
        expect(out.primary.value).toBe(2250);              // 10000 × 10.5% + 10000 × 12%
        expect(row(out, '速算器口径（只按本月固定工资）')).toBe(10000);
        expect(row(out, '缴费基数（法定：本人上年度月平均工资）')).toBe(10000);
    });

    test('逐项社保明细走 socialInsuranceOf，一个数都不自己算', () => {
        const out = compute(NO_EXTRA);
        const s = S().socialInsuranceOf({ wage: 10000, socialAverage: 8000, housingRate: 0.12 });
        s.items.forEach((it) => {
            expect(row(out, it.name + '（个人 / 月）')).toBe(it.personal);
        });
        expect(row(out, '个人五险一金 / 月')).toBe(s.personalTotal);
        expect(row(out, '单位缴纳 / 月')).toBe(s.employerTotal);
    });

    test('到手与全年汇总走 netSalaryOf（累计预扣，逐月相加）', () => {
        const out = compute(NO_EXTRA);
        const n = S().netSalaryOf({ wage: 10000, socialAverage: 8000, housingRate: 0.12 });
        expect(row(out, '到手（第 1 月）')).toBe(n.net1);
        expect(row(out, '到手（第 12 月）')).toBe(n.net12);
        expect(row(out, '全年个税')).toBe(n.annualTax);
    });
});

describe('① 缴费基数是「本人上年度月平均工资」，不是本月工资', () => {
    test('公式：上年度工资总额 ÷ 实际计薪月数', () => {
        const wb = S().wageBaseOf({
            monthlyWage: 10000, annualBonus: 120000, monthlyAllowance: 0,
            monthlyOvertime: 0, paidMonths: 12, socialAverage: 8000
        });
        expect(wb.annualTotal).toBe(240000);               // 10000 × 12 + 120000
        expect(wb.monthlyAverage).toBe(20000);             // 240000 ÷ 12
        expect(wb.base).toBe(20000);                       // 未触及上下限（4800 ~ 24000）
    });

    test('月薪 1 万 + 年终奖 12 万 → 基数是 2 万，不是 1 万', () => {
        const out = compute();
        expect(row(out, '上年度工资总额')).toBe(240000);
        expect(row(out, '上年度月平均工资')).toBe(20000);
        expect(row(out, '缴费基数（法定：本人上年度月平均工资）')).toBe(20000);
        expect(row(out, '速算器口径（只按本月固定工资）')).toBe(10000);
        expect(out.note).toContain('少算');
    });

    test('少算 1 万基数：个人侧一年差 2.7 万、单位侧差 4.74 万', () => {
        const legal = compute();
        const naive = compute(NO_EXTRA);                   // 速算器口径（只按本月工资）
        expect(legal.primary.value - naive.primary.value).toBe(2250);          // 4500 − 2250
        expect((legal.primary.value - naive.primary.value) * 12).toBe(27000);  // 个人侧一年
        const unitGap = row(legal, '单位缴纳 / 月') - row(naive, '单位缴纳 / 月');
        expect(unitGap).toBe(3950);                                           // 10000 × 39.5%
        expect(unitGap * 12).toBe(47400);                                     // 单位侧一年
    });

    test('津贴补贴与加班工资也属于工资总额，都要进基数', () => {
        const out = compute({ monthlyAllowance: 2000, monthlyOvertime: 1000 });
        expect(row(out, '上年度工资总额')).toBe(276000);    // (10000+2000+1000) × 12 + 120000
        expect(row(out, '上年度月平均工资')).toBe(23000);
    });

    test('上年度工作不满 12 个月的按**实际计薪月数**平均（年中入职）', () => {
        const out = compute({ paidMonths: 6, annualBonus: 0 });
        expect(row(out, '上年度工资总额')).toBe(60000);     // 10000 × 6
        expect(row(out, '上年度月平均工资')).toBe(10000);   // 60000 ÷ 6，不是 ÷ 12
    });

    test('60% 保底 / 300% 封顶仍然生效（基数不是工资）', () => {
        const low = compute({ monthlyWage: 3000, annualBonus: 0 });
        expect(row(low, '缴费基数（法定：本人上年度月平均工资）')).toBe(4800);      // 社平 60%
        const high = compute({ monthlyWage: 50000, annualBonus: 0 });
        expect(row(high, '缴费基数（法定：本人上年度月平均工资）')).toBe(24000);    // 社平 300%
    });

    test('工资总额口径取自常量：奖金、津贴、加班都计入', () => {
        const wc = S().rules().wageComposition;
        const labels = wc.included.map((x) => x.label).join('\n');
        expect(labels).toContain('奖金');
        expect(labels).toContain('津贴和补贴');
        expect(labels).toContain('加班加点工资');
        expect(wc.excluded.join('\n')).toContain('出差伙食补助费');
        expect(wc.note).toContain('上年度月平均工资');
        expect(wc.adjustNote).toContain('一年一调');
    });
});

describe('② 公积金免税的两个上限是「且」的关系', () => {
    test('与社保基数一致时：2 万 ≤ 社平 3 倍 2.4 万，不超标', () => {
        const out = compute();
        expect(row(out, '公积金缴存基数')).toBe(20000);
        expect(row(out, '住房公积金（个人 / 月）')).toBe(2400);
        expect(row(out, '公积金免税部分')).toBe(2400);
        expect(row(out, '公积金超标并入工资计税')).toBe(0);
    });

    test('公积金基数单独填 3 万 → 超社平 3 倍，超标 720 元并入工资计税', () => {
        const out = compute({ housingBaseMode: 'separate', housingBase: 30000 });
        expect(row(out, '公积金缴存基数')).toBe(30000);
        expect(row(out, '住房公积金（个人 / 月）')).toBe(3600);    // 30000 × 12%
        expect(row(out, '公积金免税部分')).toBe(2880);             // 24000 × 12%
        expect(row(out, '公积金超标并入工资计税')).toBe(720);
        expect(out.note).toContain('并入工资计税');
    });

    test('两个上限都从常量读，改常量后前台同口径生效', () => {
        const fund = S().rules().housingFund;
        expect(fund.taxFreeRateCap).toBe(0.12);
        expect(fund.taxFreeBaseCapRatio).toBe(3);
        expect(fund.minRate).toBe(0.05);
        expect(fund.maxRate).toBe(0.12);
    });

    test('比例被法定夹在 5%~12%：填 20% 也按 12% 算，超不出免税比例上限', () => {
        const hf = S().housingTaxFreeOf({ housingBase: 20000, housingRate: 0.2, socialAverage: 8000 });
        expect(hf.housingRate).toBe(0.12);
        expect(hf.taxable).toBe(0);
    });
});

describe('③ 申报基数不足额的代价（社保法第八十六条）', () => {
    test('核定 2 万却按 4800 申报：一年少缴 6.93 万，代价 14.5 万 ~ 28.4 万', () => {
        const out = compute();
        const c = S().complianceGapOf({ actualBase: 20000, declaredBase: 4800, years: 1 });
        expect(c.gapBase).toBe(15200);
        expect(c.annualGap).toBe(69312);
        expect(c.totalArrears).toBe(69312);
        expect(c.lateFee).toBeCloseTo(6324.72, 2);
        expect(c.totalMin).toBeCloseTo(144948.72, 2);
        expect(c.totalMax).toBeCloseTo(283572.72, 2);
        expect(row(out, '一年少缴（单位 + 个人）')).toBe(69312);
        expect(row(out, '合计代价')).toBe('144948.72 ~ 283572.72');
    });

    test('滞纳金按日万分之五 = 年化 18.25%', () => {
        const c = S().complianceGapOf({ actualBase: 20000, declaredBase: 4800, years: 1 });
        expect(c.lateFeeDailyRate).toBe(0.0005);
        expect(c.lateFeeDailyRate * 365).toBeCloseTo(0.1825, 6);
        expect(S().rules().compliance.penaltyMin).toBe(1);
        expect(S().rules().compliance.penaltyMax).toBe(3);
    });

    test('足额申报（填 0）就没有代价，也不刷代价行', () => {
        const out = compute({ declaredBase: 0 });
        expect(row(out, '一年少缴（单位 + 个人）')).toBeUndefined();
        expect(row(out, '合计代价')).toBeUndefined();
        expect(out.note).not.toContain('少缴');
    });

    test('追溯年数越长，欠缴额线性放大、滞纳金超线性放大', () => {
        const one = S().complianceGapOf({ actualBase: 20000, declaredBase: 4800, years: 1 });
        const three = S().complianceGapOf({ actualBase: 20000, declaredBase: 4800, years: 3 });
        expect(three.totalArrears).toBe(one.totalArrears * 3);
        // 滞纳金按「平均欠缴时长 = 年数 ÷ 2」估算，所以是年数的平方倍
        expect(three.lateFee / one.lateFee).toBeCloseTo(9, 6);
    });
});

describe('④ 灵活就业是另一套制度，不是「单位职工的简化版」', () => {
    function flex(values) {
        return R().get('social-base-deep').compute(Object.assign({
            identity: 'flexible', socialAverage: 8000, level: 0.6, withMedical: true
        }, values || {}));
    }

    test('养老 20% 全额自付，只有 8% 进个人账户、12% 进统筹', () => {
        const f = S().flexibleOf({ socialAverage: 8000, level: 0.6, withMedical: true });
        expect(f.base).toBe(4800);
        expect(f.pensionMonthly).toBe(960);                 // 4800 × 20%
        expect(f.personalAccountMonthly).toBe(384);         // 4800 × 8%
        expect(f.poolMonthly).toBe(576);                    // 4800 × 12%
        expect(f.annualPension).toBe(11520);
        expect(f.annualPersonalAccount).toBe(4608);
        expect(f.annualPool).toBe(6912);
    });

    test('缴一年 11520 元，其中只有 4608 元（40%）是「自己的」', () => {
        const out = flex();
        expect(row(out, '全年记入个人账户')).toBe(4608);
        expect(row(out, '全年记入统筹基金')).toBe(6912);
        expect(row(out, '若当年退保 / 身故可退还')).toBe(4608);
        expect(out.note).toContain('统筹部分不退还');
        expect(S().rules().flexible.refundNote).toContain('不退还');
    });

    test('基数在 60%~300% 之间**自选**，与单位职工「按实际工资定」不同', () => {
        expect(S().rules().flexible.levels).toEqual([0.6, 0.8, 1, 2, 3]);
        expect(flex({ level: 0.6 }).primary.value).toBe(1392);   // 960 + 432
        expect(flex({ level: 3 }).primary.value).toBe(6960);     // 24000 × (20% + 9%)
    });

    test('不勾选职工医保则不计医保', () => {
        expect(flex({ withMedical: false }).primary.value).toBe(960);
        expect(row(flex({ withMedical: false }), '职工医疗保险（个人 / 月）')).toBe(0);
    });

    test('档次对照表覆盖全部档次，并给出个人账户与统筹的拆分', () => {
        const table = flex().extras[0].table;
        expect(table.head.join()).toContain('全年统筹（不退还）');
        expect(table.rows).toHaveLength(5);
        expect(JSON.stringify(table.rows)).toContain('300%');
    });

    test('灵活就业没有单位侧与公积金，结果里也不出现这些行', () => {
        const out = flex();
        expect(row(out, '单位缴纳 / 月')).toBeUndefined();
        expect(row(out, '住房公积金（个人 / 月）')).toBeUndefined();
        expect(row(out, '企业全年用工成本（1 人）')).toBeUndefined();
    });
});

describe('规格：自带 spec，且与速算器口径同源', () => {
    test('social-base-deep 自带 fields / compute（不再与速算器共享）', () => {
        const deep = R().get('social-base-deep');
        const quick = R().get('social-base');
        expect(deep.fields).toBeTruthy();
        expect(deep.fields).not.toBe(quick.fields);
        expect(deep.compute).not.toBe(quick.compute);
        expect(deep.policyKey).toBe('social-insurance');
    });

    test('3 步 + 自动追加的结果步', () => {
        const steps = W().stepsOf(R().get('social-base-deep'));
        expect(steps).toHaveLength(4);
        expect(steps.map((s) => s.title)).toEqual([
            '参保身份与社平工资', '缴费基数核定', '缴纳比例与申报基数', '计算结果'
        ]);
        expect(steps[3].result).toBe(true);
    });

    test('坑位清单覆盖四层口径差', () => {
        const p = R().get('social-base-deep').pitfalls.join('\n');
        expect(p).toContain('上年度月平均工资');
        expect(p).toContain('2.7 万');
        expect(p).toContain('18.25%');
        expect(p).toContain('1~3 倍');
        expect(p).toContain('20%');
        expect(p).toContain('统筹部分不退还');
        expect(p).toContain('60%~300%');
    });

    test('结果带推导链（与速算器同一套 steps 约定）', () => {
        const out = compute();
        expect(out.steps).toHaveLength(4);
        expect(out.steps[0].title).toContain('上年度月平均工资');
        expect(out.steps[2].title).toContain('公积金免税');
        expect(JSON.stringify(out.steps)).toContain('申报基数差额');
    });
});

describe('走向导：条件字段与结果都能走通', () => {
    beforeEach(() => {
        localStorage.clear();
        window.showPage = jest.fn();
        document.body.innerHTML = '<div id="deep-wizard-page" class="page hidden"></div>';
    });

    test('打开向导：步骤条与第一步渲染出来', () => {
        expect(W().open('social-base-deep', { fresh: true })).toBe(true);
        const host = document.getElementById('deep-wizard-page');
        expect(host.querySelectorAll('.step-number')).toHaveLength(4);
        expect(host.querySelector('.step-title.active').textContent).toBe('参保身份与社平工资');
        expect(host.querySelector('#qf-identity')).toBeTruthy();
    });

    test('选「单位职工」才出现工资总额四项，选「灵活就业」换成自选档次', () => {
        W().open('social-base-deep', { fresh: true });
        document.getElementById('qf-identity').value = 'flexible';
        document.getElementById('qf-identity').dispatchEvent(new Event('change'));
        document.getElementById('dw-next').click();                       // → 缴费基数核定
        expect(document.getElementById('qf-level')).toBeTruthy();
        expect(document.getElementById('qf-monthlyWage')).toBeFalsy();

        document.getElementById('dw-prev').click();
        document.getElementById('qf-identity').value = 'employee';
        document.getElementById('qf-identity').dispatchEvent(new Event('change'));
        document.getElementById('dw-next').click();
        expect(document.getElementById('qf-monthlyWage')).toBeTruthy();
        expect(document.getElementById('qf-annualBonus')).toBeTruthy();
        expect(document.getElementById('qf-level')).toBeFalsy();
    });

    test('公积金基数「单独填写」才出现基数框', () => {
        W().open('social-base-deep', { fresh: true });
        document.getElementById('dw-next').click();
        document.getElementById('dw-next').click();                       // → 缴纳比例与申报基数
        expect(document.getElementById('qf-housingBase')).toBeFalsy();
        document.getElementById('qf-housingBaseMode').value = 'separate';
        document.getElementById('qf-housingBaseMode').dispatchEvent(new Event('change'));
        expect(document.getElementById('qf-housingBase')).toBeTruthy();
    });

    test('走到结果步，算出的数与直接调 compute 一致', () => {
        W().open('social-base-deep', { fresh: true });
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
});
