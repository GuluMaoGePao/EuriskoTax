// 残保金与工会经费完整测算（阶段17 17C-5 纵深，v1.61.0）的回归网
//
// 17C-5 在 v1.48.0 交付的是「铺齐」—— disability-fund-deep 当时只有元数据，
// 字段与计算**共享 disability-fund 速算器**。速算器已经算到了「30 人临界点 +
// 分档减缴 + 边际节省」—— 但它的字段就叫「**在职职工人数**」，HR 手上那个数通常是
// **常年正式在册**的 25 人，而法定要的是「**上年各月在职人数之和 ÷ 12**」
// （季节性用工折算、劳务派遣择一计入）。实测：常年 25 人看着「30 人以下免征」，
// 法定月平均 **45 人** → 一年差 **7.29 万**。
//
// 四处具体的口径差：
//   ① **在职职工人数是上年月平均，不是年末在册**（财税〔2015〕72 号）：季节性用工
//      **折算年平均人数**，劳务派遣由派遣单位与用工单位**协商计入一方**（不得重复）。
//      与 17C-2 企业所得税的「从业人数看全年季度平均值」是同一类错，但**公式不同**：
//      cit 是（季初 + 季末）÷ 2 再 ÷ 4，残保金是各月之和 ÷ 12。
//   ② **「招几个才免征」取决于人数**（100 人是第二个临界点）：1 名残疾人达到 1.5%
//      需在职 ≤ **66 人**、达到 1% 需 ≤ **100 人**；67~100 人招 1 个人**只能减半**，
//      101 人以上招 1 个人连 1% 都够不着。
//   ③ **招残疾人 vs 缴残保金的成本对照**（「要不要招一个人」的定价）：岗位本来就要
//      招人 → 净省全额残保金减少额；专为省残保金增设岗位 → 净亏（雇一个人要付
//      1.395 倍工资）。盈亏平衡年薪 = 残保金减少额 ÷ 1.395。
//   ④ **工会经费的基数是工资总额，与社保缴费基数两个方向都不同**：社保有 60% 保底
//      与 300% 封顶，工资总额两头都不夹。另：**计提 ≠ 扣除**，要凭《工会经费收入
//      专用收据》；未建会按 2% 收筹备金且**全额上缴**。
//
// 口径仍同源：人数折算、招人对照、工资总额口径一律走 `EuriskoDisabilityFundQuick`；
// 单位社保公积金费率读 `socialInsuranceRules`（与 17C-3 同一个源）。

const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/social-insurance-quick.js');
    loadSource('src/js/calculation/disability-fund-quick.js');
    loadSource('src/js/calculation/utils.js');
    loadSource('src/js/data/tool-registry.js');
    loadSource('src/js/ui/toolbox-ui.js');
    loadSource('src/js/ui/deep-wizard-ui.js');
});

const R = () => window.EuriskoToolRegistry;
const W = () => window.EuriskoDeepWizard;
const Q = () => window.EuriskoDisabilityFundQuick;

// 默认场景：常年 25 人 + 季节性 24 人×4 月（折算 8）+ 派遣 12 人 → 月平均 45 人
function compute(values) {
    return R().get('disability-fund-deep').compute(Object.assign({
        variant: 'levy',
        socialAverage: 8000,
        regularCount: 25,
        seasonalCount: 24,
        seasonalMonths: 4,
        dispatchCount: 12,
        dispatchHere: true,
        avgAnnualWage: 120000,
        disabled: 0,
        hireAnnualWage: 120000,
        monthlyWage: 30000,
        monthlyAllowance: 0,
        annualBonus: 0,
        paidMonths: 12,
        hasUnion: true,
        actual: 0
    }, values || {}));
}

function row(out, label) {
    const r = out.rows.find((x) => x.label === label);
    return r ? r.value : undefined;
}

describe('与速算器同源：核定后的数传给 quick，逐点相等', () => {
    // 只填常年人数、没有季节性用工与派遣时，月平均 = 常年人数 —— 此时必须与速算器同口径
    const NO_EXTRA = { seasonalCount: 0, seasonalMonths: 0, dispatchCount: 0 };

    test('没有季节性用工与派遣时 ≡ disability-fund 速算器直达', () => {
        const out = compute(Object.assign({ regularCount: 50 }, NO_EXTRA));
        const direct = R().get('disability-fund').compute({
            variant: 'levy', headcount: 50, disabled: 0, socialAverageMonthly: 8000, avgAnnualWage: 120000
        });
        expect(out.primary.value).toBe(direct.primary.value);
        expect(out.primary.value).toBe(81000);        // 50 × 1.5% = 0.75 人 × 12 万 × 90%
    });

    test('逐项走 levyOf，一个数都不自己算', () => {
        const out = compute();
        const r = Q().levyOf({ headcount: 45, disabled: 0, socialAverageMonthly: 8000, avgAnnualWage: 120000 });
        expect(out.primary.value).toBe(r.payable);
        expect(row(out, '计费工资（社平 2 倍封顶）')).toBe(r.avgWageUsed);
        expect(row(out, '分档减缴系数')).toBe(r.multiplier);
    });

    test('工会经费走 unionFeeOf，扣除与速算器同口径', () => {
        const out = compute({ variant: 'union' });
        const direct = R().get('disability-fund').compute({ variant: 'union', wageTotal: 360000, hasUnion: true });
        expect(out.primary.value).toBe(direct.primary.value);
        expect(out.primary.value).toBe(7200);          // 360000 × 2%
    });
});

describe('① 在职职工人数是上年月平均，不是年末在册', () => {
    test('常年 25 + 季节折算 8 + 派遣 12 = 45 人', () => {
        const h = Q().headcountOf({
            regularCount: 25, seasonalCount: 24, seasonalMonths: 4,
            dispatchCount: 12, dispatchHere: true
        });
        expect(h.seasonalEquivalent).toBe(8);          // 24 × 4 ÷ 12
        expect(h.dispatchEquivalent).toBe(12);
        expect(h.monthlyAverage).toBe(45);
        expect(h.naive).toBe(25);                      // 速算器口径：只填常年正式在册
        expect(h.gap).toBe(20);
    });

    test('常年 25 人看着免征，法定 45 人 → 一年差 7.29 万', () => {
        const out = compute();
        expect(row(out, '上年在职职工人数（月平均）')).toBe(45);
        expect(row(out, '速算器口径（只填常年正式在册）')).toBe(25);
        expect(row(out, '30 人以下暂免（按月平均判断）')).toContain('否');
        expect(row(out, '按速算器口径（25 人）是否免征')).toBe('是（免征）');   // ⚠️ 错的结果
        expect(row(out, '少算人数导致的差额')).toBe(72900);
        expect(out.primary.value).toBe(72900);         // 0.675 × 12 万 × 90%
    });

    test('劳务派遣择一计入：改由派遣单位计就把人数整段降下来', () => {
        const here = Q().headcountOf({ regularCount: 25, seasonalCount: 24, seasonalMonths: 4, dispatchCount: 12, dispatchHere: true });
        const away = Q().headcountOf({ regularCount: 25, seasonalCount: 24, seasonalMonths: 4, dispatchCount: 12, dispatchHere: false });
        expect(here.monthlyAverage).toBe(45);
        expect(away.monthlyAverage).toBe(33);
        const a = Q().levyOf({ headcount: here.monthlyAverage, socialAverageMonthly: 8000, avgAnnualWage: 120000 });
        const b = Q().levyOf({ headcount: away.monthlyAverage, socialAverageMonthly: 8000, avgAnnualWage: 120000 });
        expect(a.payable - b.payable).toBe(19440);     // 一年差 1.944 万
    });

    test('这个「年度平均」与 17C-2 企业所得税的公式不同（各月之和 ÷ 12，不是季初季末平均）', () => {
        const cit = window.corporateIncomeTaxRules.quarterlyAverage;
        expect(cit.formula).toContain('季初');
        // 残保金这条没有 quarterlyAverage，口径就是「上年各月之和 ÷ 12」
        expect(Q().rules().headcountNote).toContain('÷ 12');
        expect(Q().rules().headcountNote).toContain('季节性用工折算年平均人数');
        expect(Q().rules().headcountNote).toContain('不得重复计算');
    });
});

describe('② 「招几个才免征」取决于人数（100 人是第二个临界点）', () => {
    test('1 名残疾人达到 1.5% 需 ≤ 66 人、达到 1% 需 ≤ 100 人', () => {
        const p = Q().exemptPlanOf({ headcount: 45, disabled: 0 });
        expect(p.onePersonExemptUpTo).toBe(66);        // floor(1 ÷ 1.5%)
        expect(p.onePersonHalfUpTo).toBe(100);         // floor(1 ÷ 1%)
        expect(p.ratio).toBe(0.015);
        expect(p.halfRatio).toBe(0.01);
    });

    test('67 人是分界：66 人招 1 人免征，67 人招 1 人只能减半', () => {
        const ladder = Q().exemptPlanOf({ headcount: 45, disabled: 0 }).ladder;
        const at = (n) => ladder.find((o) => o.headcount === n);
        expect(at(50).needExempt).toBe(1);
        expect(at(66).needExempt).toBe(1);
        expect(at(67).needExempt).toBe(2);             // 67 × 1.5% = 1.005 → 要 2 人
        expect(at(67).needHalf).toBe(1);
        expect(at(100).needExempt).toBe(2);
        expect(at(101).needHalf).toBe(2);              // 101 人招 1 人连减半档都够不着
    });

    test('减半档的 1% 从 tiers 里认，不写死', () => {
        expect(Q().halfTierOf().minRatio).toBe(0.01);
        expect(Q().halfTierOf().multiplier).toBe(0.5);
    });
});

describe('③ 招残疾人 vs 缴残保金（「要不要招一个人」的定价）', () => {
    test('100 人公司：招第 1 人省 13.2 万，而雇一个人要付 16.74 万', () => {
        const c = Q().hireCompareOf({
            headcount: 100, disabled: 0, socialAverageMonthly: 8000,
            avgAnnualWage: 120000, hireAnnualWage: 120000
        });
        expect(c.totalRate).toBe(0.395);               // 27.5% 五项 + 12% 公积金
        expect(c.saving).toBe(132000);                 // 1.35W → 0.25W
        expect(c.hireCost).toBe(167400);               // 12 万 × 1.395
        expect(c.netReplace).toBe(132000);             // 情形 A：净省全额
        expect(c.netAdd).toBe(35400);                  // 情形 B：净亏 3.54 万
        expect(c.breakEvenWage).toBe(94623.66);        // 盈亏平衡年薪 9.46 万
        expect(c.worthIt).toBe(false);
    });

    test('费率保留 4 位小数：0.395 不能被舍成 0.40（否则用工成本凭空多 600 元）', () => {
        const c = Q().hireCompareOf({ headcount: 100, socialAverageMonthly: 8000, avgAnnualWage: 120000, hireAnnualWage: 120000 });
        expect(c.totalRate).toBe(0.395);
        expect(c.hireCost).toBe(167400);
        expect(c.hireCost).not.toBe(168000);
    });

    test('岗位年薪压到盈亏平衡以下，情形 B 才划算', () => {
        const cheap = Q().hireCompareOf({
            headcount: 100, disabled: 0, socialAverageMonthly: 8000,
            avgAnnualWage: 120000, hireAnnualWage: 90000
        });
        expect(cheap.worthIt).toBe(true);
        expect(cheap.netAdd).toBeLessThan(0);          // 净赚
        expect(cheap.breakEvenWage).toBe(94623.66);
    });

    test('第一个残疾人最值钱：45 人公司第 1 人省 7.29 万、第 2 人一分钱都省不了', () => {
        const first = Q().hireCompareOf({ headcount: 45, disabled: 0, socialAverageMonthly: 8000, avgAnnualWage: 120000 });
        const second = Q().hireCompareOf({ headcount: 45, disabled: 1, socialAverageMonthly: 8000, avgAnnualWage: 120000 });
        expect(first.saving).toBe(72900);
        expect(second.saving).toBe(0);                 // 1 ÷ 45 = 2.22% ≥ 1.5%，已经免征
    });

    test('结果里两种情形分行给出，不混成一个数', () => {
        const out = compute();
        expect(row(out, '情形 A：岗位本来就要招人 → 净省')).toBe(72900);
        expect(row(out, '情形 B：专为省残保金增设岗位 → 净支出')).toBe(94500);
        expect(row(out, '盈亏平衡年薪')).toBe(52258.06);
        expect(out.note).toContain('不划算');
    });
});

describe('④ 工会经费的基数是工资总额，与社保缴费基数两个方向都不同', () => {
    test('月薪 3 万：社保按 2.4 万封顶、工会经费按 3 万（少估 1440 元）', () => {
        const ub = Q().unionBaseOf({ monthlyWage: 30000, paidMonths: 12, socialAverage: 8000 });
        expect(ub.wageTotal).toBe(360000);
        expect(ub.socialMonthlyBase).toBe(24000);      // 社平 3 倍封顶
        expect(ub.feeOnWage).toBe(7200);
        expect(ub.feeOnSocialBase).toBe(5760);
        expect(ub.feeGap).toBe(1440);
    });

    test('月薪 3000：社保按 4800 保底、工会经费按 3000（多估 432 元）', () => {
        const ub = Q().unionBaseOf({ monthlyWage: 3000, paidMonths: 12, socialAverage: 8000 });
        expect(ub.wageTotal).toBe(36000);
        expect(ub.socialMonthlyBase).toBe(4800);       // 社平 60% 保底
        expect(ub.gapAnnual).toBe(-21600);
        expect(ub.feeGap).toBe(-432);
    });

    test('奖金与津贴也要进工资总额（与 17C-3 同一个 wageComposition 口径）', () => {
        const ub = Q().unionBaseOf({ monthlyWage: 10000, monthlyAllowance: 1000, annualBonus: 120000, paidMonths: 12, socialAverage: 8000 });
        expect(ub.wageTotal).toBe(252000);             // (10000 + 1000) × 12 + 120000
        expect(Q().unionRules().wageBaseNote).toContain('没有社保那样的 60% 保底与 300% 封顶');
    });

    test('计提 ≠ 扣除：凭《工会经费收入专用收据》，超提部分调增', () => {
        const ok = compute({ variant: 'union' });
        expect(row(ok, '超限额需纳税调增')).toBe(0);
        const over = compute({ variant: 'union', actual: 9000 });
        expect(row(over, '超限额需纳税调增')).toBe(1800);      // 9000 − 7200
        expect(Q().unionRules().deductionNote).toContain('专用收据');
    });

    test('未建会：筹备金全额上缴，没有 60% 留存', () => {
        const out = compute({ variant: 'union', hasUnion: false });
        expect(row(out, '本单位留存')).toBe(0);
        expect(row(out, '上缴上级工会')).toBe(7200);
        expect(out.note).toContain('全额上缴');
    });

    test('月薪阶梯表两头都要有（保底与封顶各一档）', () => {
        const ladder = compute({ variant: 'union' }).extras[0].table.rows;
        expect(ladder).toHaveLength(6);
        expect(JSON.stringify(ladder)).toContain('3000');
        expect(JSON.stringify(ladder)).toContain('50000');
    });
});

describe('⑤ 现行减缴与 30 人免征均至 2027-12-31', () => {
    test('到期后恢复按 100% 征收，结果里给出对照', () => {
        const out = compute();
        expect(row(out, '政策到期后（2028 起按 100%）')).toBe(81000);   // 应缴费额 × 100%
        expect(out.primary.value).toBe(72900);                          // 现按 90%
        expect(Q().rules().tiersExpiresOn).toBe('2027-12-31');
        expect(Q().rules().tiersExpiryNote).toContain('100%');
    });
});

describe('规格：自带 spec，且与速算器口径同源', () => {
    test('disability-fund-deep 自带 fields / compute（不再与速算器共享）', () => {
        const deep = R().get('disability-fund-deep');
        const quick = R().get('disability-fund');
        expect(deep.fields).toBeTruthy();
        expect(deep.fields).not.toBe(quick.fields);
        expect(deep.compute).not.toBe(quick.compute);
        expect(deep.policyKey).toBe('disability-fund');
    });

    test('3 步 + 自动追加的结果步', () => {
        const steps = W().stepsOf(R().get('disability-fund-deep'));
        expect(steps).toHaveLength(4);
        expect(steps.map((s) => s.title)).toEqual([
            '算哪一项与社平工资', '上年月平均在职人数 / 全年工资总额',
            '分档减缴与招人定价 / 拨缴与扣除', '计算结果'
        ]);
        expect(steps[3].result).toBe(true);
    });

    test('坑位清单覆盖五层口径差', () => {
        const p = R().get('disability-fund-deep').pitfalls.join('\n');
        expect(p).toContain('上年各月在职人数之和 ÷ 12');
        expect(p).toContain('7.29 万');
        expect(p).toContain('100 人是第二个临界点');
        expect(p).toContain('1.395');
        expect(p).toContain('9.46 万');
        expect(p).toContain('两个方向都不同');
        expect(p).toContain('计提 ≠ 扣除');
        expect(p).toContain('2027-12-31');
    });

    test('结果带推导链（与速算器同一套 steps 约定）', () => {
        expect(compute().steps).toHaveLength(5);
        expect(compute({ variant: 'union' }).steps).toHaveLength(4);
        expect(JSON.stringify(compute().steps)).toContain('上年月平均在职人数');
        expect(JSON.stringify(compute({ variant: 'union' }).steps)).toContain('计提 ≠ 扣除');
    });
});

describe('走向导：条件字段与结果都能走通', () => {
    beforeEach(() => {
        localStorage.clear();
        window.showPage = jest.fn();
        document.body.innerHTML = '<div id="deep-wizard-page" class="page hidden"></div>';
    });

    test('打开向导：步骤条与第一步渲染出来', () => {
        expect(W().open('disability-fund-deep', { fresh: true })).toBe(true);
        const host = document.getElementById('deep-wizard-page');
        expect(host.querySelectorAll('.step-number')).toHaveLength(4);
        expect(host.querySelector('.step-title.active').textContent).toBe('算哪一项与社平工资');
        expect(host.querySelector('#qf-variant')).toBeTruthy();
    });

    test('选「工会经费」后，人数类字段换成工资总额类字段', () => {
        W().open('disability-fund-deep', { fresh: true });
        document.getElementById('dw-next').click();                       // → 上年月平均在职人数 / 工资总额
        expect(document.getElementById('qf-regularCount')).toBeTruthy();
        expect(document.getElementById('qf-monthlyWage')).toBeFalsy();

        document.getElementById('dw-prev').click();
        document.getElementById('qf-variant').value = 'union';
        document.getElementById('qf-variant').dispatchEvent(new Event('change'));
        document.getElementById('dw-next').click();
        expect(document.getElementById('qf-monthlyWage')).toBeTruthy();
        expect(document.getElementById('qf-annualBonus')).toBeTruthy();
        expect(document.getElementById('qf-regularCount')).toBeFalsy();
    });

    test('走到结果步，算出的数与直接调 compute 一致', () => {
        W().open('disability-fund-deep', { fresh: true });
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
