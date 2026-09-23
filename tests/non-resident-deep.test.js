// 非居民个人 / 无住所个人 17D-13 纵深（v1.69.0）的回归网
//
// 这是第 16 个个税场景（15/16 → **16/16**），也是第三个**没有同名速算器**的完整测算
// （前两个是 donation、property-transfer）。即便同属个税，「月薪 + 五险一金 + 专项附加」
// 那五个框默认这位是**中国税收居民**：一个里每一项 Quantity 都假定「年度汇算 / 累计预扣 /
// 专项附加扣除」适用，而这一类人进门要解决的第一个问题根本不是「扣多少」，而是
// 「**这笔钱要不要在中国缴**」。要补齐的四层：
//
//   ① 居住天数 → 纳税义务四档（个税法第一条 + 财政部 税务总局公告 2019 年第 34 号）：
//      ≤ 90 天只对「境内工作 + 境内雇主支付或者负担」的重叠部分计税（公式一）；
//      90~183 天境内工作期间的**不论谁支付**都要缴（公式二）；满 183 天成为居民但连续不满
//      六年，境外所得中由境外单位或者个人支付的免税（公式三）；连续满六年且无单次离境超过
//      30 天 → 境内境外**全部**所得都要缴。同一批工资实测 **0 / 6220 / 53080 / 73080**；
//   ② 收入额先过一道乘法（35 号第二条）—— 不是工资总额；
//   ③ 非居民按**按月换算后的综合所得税率表逐月单独计税**：同一笔 24 万年薪，均匀发放 19080、
//      集中到一个月发 **44280**，差 **25200**；而居民那张年度表根本不看发放节奏；
//   ④ 数月奖金单独按 **6 个月**分摊、**不减除费用**、一年只能用一次（公式五）：
//      法定 26620，把它并入发放当月会算出 **89580**（虚增 **62960**）。
//
// 口径同源：全部公式落在 non-resident-quick.js；183 天 / 90 天 / 六年 / 30 天 / 5000 / 6 个月
// 读注册表声明的 nonResidentRules，月度税率表**复用** bonusMonthlyTaxRates（与年终奖同一张，
// 不复制第二份），年度表走内核 calculateTaxByTaxableIncome —— 本文件只钉「数字」与「接线」。

const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');          // nonResidentRules / bonusMonthlyTaxRates
    loadSource('src/js/calculation/tax-registry.js');
    loadSource('src/js/calculation/tax-calculator.js');         // 年度表由内核出
    loadSource('src/js/calculation/non-resident-quick.js');
    loadSource('src/js/calculation/utils.js');
    loadSource('src/js/data/tool-registry.js');
    loadSource('src/js/ui/toolbox-ui.js');
    loadSource('src/js/ui/deep-wizard-ui.js');
});

const R = () => window.EuriskoToolRegistry;
const W = () => window.EuriskoDeepWizard;
const Q = () => window.EuriskoNonResidentQuick;

// 默认形态：本年内累计居住 120 天（90~183 天档）的普通员工，月领 3 万其中境内支付 1.5 万，
// 当月 30 天里境内工作 20 天，另有数月奖金 12 万
function values(extra) {
    const base = {};
    R().get('non-resident').fields.forEach((f) => { base[f.key] = f.default; });
    return Object.assign(base, extra || {});
}

function compute(extra) {
    return R().get('non-resident').compute(values(extra));
}

function row(out, label) {
    const r = out.rows.find((x) => x.label === label);
    return r ? r.value : undefined;
}

function tableOf(out, keyword) {
    const e = out.extras.filter((x) => x.title.indexOf(keyword) >= 0)[0];
    return e ? e.table.rows : [];
}

describe('所得税：四档里的第一件事不是「扣多少」，是「要不要缴」', () => {
    test('默认（120 天）→ 非居民；00~183 天档适用公式二', () => {
        const s = Q().stackOf(values());
        expect(s.status.days).toBe(120);
        expect(s.status.isResident).toBe(false);
        expect(s.status.tier).toBe('mid');
        expect(s.income.formula).toBe('公式二');
        expect(s.tax).toBeCloseTo(26620, 6);
    });

    test('公式一（≤90 天）：3 万 × 境内支付 50% × 境内工作 20/30 = 1 万', () => {
        const ic = Q().incomeOf(values({ stayFullDays: 60 }));
        expect(ic.formula).toBe('公式一');
        expect(ic.amount).toBeCloseTo(10000, 6);
        expect(ic.ratio).toBeCloseTo(1 / 3, 6);
    });

    test('公式二（90~183 天）：不看谁付钱，只看在境内干了几天 —— 3 万 × 20/30 = 2 万', () => {
        const ic = Q().incomeOf(values());
        expect(ic.payRatio).toBeCloseTo(0.5, 6);
        expect(ic.dayRatio).toBeCloseTo(2 / 3, 6);
        expect(ic.amount).toBeCloseTo(20000, 6);
        // 同一批工资全部改由境外母公司支付，90 天档是 0，这里还是 2 万
        expect(Q().incomeOf(values({ stayFullDays: 60, monthlyPaidDomestic: 0 })).amount).toBeCloseTo(0, 6);
        expect(Q().incomeOf(values({ monthlyPaidDomestic: 0 })).amount).toBeCloseTo(20000, 6);
    });

    test('最关键的一组对照：同样由境外老板发工资，住 60 天缴 0、住 120 天缴 26620', () => {
        const shortStay = Q().stackOf(values({ stayFullDays: 60, monthlyPaidDomestic: 0 }));
        const midStay = Q().stackOf(values({ monthlyPaidDomestic: 0 }));
        expect(shortStay.tax).toBeCloseTo(0, 6);
        expect(midStay.tax).toBeCloseTo(26620, 6);
    });

    test('满 183 天成为居民：此后六年规则接管，多少而定', () => {
        const s = Q().statusOf(values({ stayFullDays: 183 }));
        expect(s.isResident).toBe(true);
        expect(Q().statusOf(values({ stayFullDays: 182 })).isResident).toBe(false);
    });

    test('六年规则：连续满六年且无单次离境超过 30 天 → 全额（公式换成「全额」）', () => {
        const six = Q().sixYearOf(values({ stayFullDays: 200, fullYearsBefore: 6 }));
        expect(six.applicable).toBe(true);
        expect(six.sixYearsMet).toBe(true);
        expect(six.worldwide).toBe(true);
        expect(Q().incomeOf(values({ stayFullDays: 200, fullYearsBefore: 6 })).formula).toBe('全额');
        expect(Q().incomeOf(values({ stayFullDays: 200, fullYearsBefore: 6 })).amount).toBeCloseTo(30000, 6);
    });

    test('六年被打断：连续满六年但有单次离境 40 天 → 退回公式三，73080 变 53080（差 2 万）', () => {
        const broken = Q().stackOf(values({ stayFullDays: 200, fullYearsBefore: 6, maxSingleAbsence: 40 }));
        expect(broken.sixYear.sixYearsMet).toBe(false);
        expect(broken.income.formula).toBe('公式三');
        expect(broken.tax).toBeCloseTo(53080, 6);
        const intact = Q().stackOf(values({ stayFullDays: 200, fullYearsBefore: 6 }));
        expect(intact.tax).toBeCloseTo(73080, 6);
        expect(intact.tax - broken.tax).toBeCloseTo(20000, 6);
    });

    test('不是居民时六年规则根本不适用**（不出现「全球征税」的误导）', () => {
        const six = Q().sixYearOf(values({ stayFullDays: 120, fullYearsBefore: 6 }));
        expect(six.applicable).toBe(false);
        expect(six.sixYearsMet).toBe(false);
        expect(six.reasons.join('')).toContain('非居民');
    });

    test('四档对照表五行：默认口径 6220 / 26620 / 53080 / 73080（最后一行被 40 天离境打断）', () => {
        const rows = Q().scenarioTableOf(values());
        expect(rows).toHaveLength(5);
        expect(rows[0].tax).toBeCloseTo(6220, 4);
        expect(rows[1].tax).toBeCloseTo(26620, 4);
        expect(rows[2].tax).toBeCloseTo(53080, 4);
        expect(rows[3].tax).toBeCloseTo(73080, 4);
        expect(rows[4].tax).toBeCloseTo(53080, 4);
        expect(rows.map((r) => r.formula)).toEqual(['公式一', '公式二', '公式三', '全额', '公式三']);
        expect(rows[3].sixYearsMet).toBe(true);
        expect(rows[4].sixYearsMet).toBe(false);
    });

    test('全部由境外支付的同一批工资：0 / 26620 / 35080 / 73080 / 35080', () => {
        const rows = Q().scenarioTableOf(values({ monthlyPaidDomestic: 0 }));
        expect(rows[0].tax).toBeCloseTo(0, 4);
        expect(rows[1].tax).toBeCloseTo(26620, 4);
        expect(rows[2].tax).toBeCloseTo(35080, 4);
        expect(rows[3].tax).toBeCloseTo(73080, 4);
        expect(rows[4].tax).toBeCloseTo(35080, 4);
        // 60 天档：收入额直接被归 0 —— 这才是「要不要缴」的答案，而不是「扣多少」
        expect(rows[0].monthlyIncome).toBeCloseTo(0, 6);
        // 120 天档：同一笔境外支付的工资一分钱都跑不掉
        expect(rows[1].monthlyIncome).toBeCloseTo(20000, 6);
    });
});

describe('高管：由境内居民企业支付或者负担的报酬不按天数分摊', () => {
    test('≤90 天档：普通员工 1 万（两道相乘），高管 1.5 万（只看支付占比）', () => {
        const staff = Q().incomeOf(values({ stayFullDays: 60 }));
        const exec = Q().incomeOf(values({ stayFullDays: 60, role: 'executive' }));
        expect(staff.amount).toBeCloseTo(10000, 6);
        expect(exec.amount).toBeCloseTo(15000, 6);
        expect(exec.formula).toBe('高管（≤90 天）');
    });

    test('90~183 天档：员工用公式二（只看天数），高管改用公式三（扣掉境外支付且境外工作的那一段）', () => {
        const staff = Q().incomeOf(values());
        const exec = Q().incomeOf(values({ role: 'executive' }));
        expect(staff.formula).toBe('公式二');
        expect(exec.formula).toBe('公式三');
        expect(exec.amount).toBeCloseTo(25000, 6);   // 3 万 ×〔1 − 50% × (1 − 20/30)〕
    });
});

describe('非居民按月换算税率表：一个月算一次', () => {
    test('当月收入额 2 万 − 5000 → 月度表 20%（速算扣除 1410）→ 每月 1590，12 个月 19080', () => {
        const sal = Q().salaryTaxOf(values());
        expect(sal.monthlyIncome).toBeCloseTo(20000, 6);
        expect(sal.taxablePerMonth).toBeCloseTo(15000, 6);
        expect(sal.rate).toBeCloseTo(0.2, 6);
        expect(sal.deduction).toBeCloseTo(1410, 6);
        expect(sal.taxPerMonth).toBeCloseTo(1590, 6);
        expect(sal.tax).toBeCloseTo(19080, 6);
    });

    test('月度税率表就是同一张 bonusMonthlyTaxRates（与年终奖单独计税共用，不复制第二份）', () => {
        expect(Q().monthlyTaxOf(20000).tax).toBeCloseTo(20000 * 0.2 - 1410, 6);
        expect(Q().monthlyTaxOf(3000).tax).toBeCloseTo(90, 6);
        expect(Q().monthlyTaxOf(25000).tax).toBeCloseTo(25000 * 0.2 - 1410, 6);
        expect(Q().monthlyTaxOf(125000).tax).toBeCloseTo(125000 * 0.45 - 15160, 6);
    });

    test('发放节奏：同一笔 24 万，均匀发放 19080、集中到一个月发 44280，差 25200', () => {
        const vol = Q().volatilitySampleOf(values());
        expect(vol.total).toBeCloseTo(240000, 6);
        expect(vol.flatEach).toBeCloseTo(20000, 6);
        expect(vol.flatTax).toBeCloseTo(19080, 6);
        expect(vol.lumpEach).toBeCloseTo(10000, 6);
        expect(vol.lumpLast).toBeCloseTo(130000, 6);
        expect(vol.lumpTax).toBeCloseTo(44280, 6);
        expect(vol.gap).toBeCloseTo(25200, 6);
        // 居民那张年度表根本不看发放节奏
        expect(vol.residentSame).toBeCloseTo(19080, 6);
    });

    test('居民对照：同一批收入按年度表算出来是 35080（比非居民高 —— 数月奖金口径不同）', () => {
        const s = Q().stackOf(values());
        expect(s.resident).toBeCloseTo(35080, 6);
        expect(s.tax).toBeCloseTo(26620, 6);
    });
});

describe('数月奖金：÷ 6 定档、不减费用、一年只能用一次', () => {
    test('12 万奖金 → 收入额 8 万（乘来源地比例 2/3），÷ 6 = 13333 → 7540', () => {
        const b = Q().bonusTaxOf(values());
        expect(b.inScope).toBeCloseTo(80000, 6);
        expect(b.spreadMonths).toBe(6);
        expect(b.perMonth).toBeCloseTo(80000 / 6, 6);
        expect(b.rate).toBeCloseTo(0.2, 6);
        expect(b.tax).toBeCloseTo(7540, 6);
        expect(b.noDeduction).toBe(true);
        expect(b.oncePerYear).toBe(true);
    });

    test('最常见的错法「并入发放当月」：算出 89580，虚增 62960', () => {
        const s = Q().stackOf(values());
        expect(s.naive).toBeCloseTo(89580, 6);
        expect(s.naiveGap).toBeCloseTo(62960, 6);
        expect(row(compute(), '若把奖金并入发放当月（错误算法）')).toBeCloseTo(89580, 6);
    });

    test('奖金为 0 时不出现这一行，且收入额不受影响', () => {
        const s = Q().stackOf(values({ bonus: 0 }));
        expect(s.bonus.tax).toBeCloseTo(0, 6);
        expect(s.tax).toBeCloseTo(19080, 6);
    });
});

describe('居住天数：当天满 24 小时才算一天', () => {
    test('不足 24 小时的停留不计入居住天数（90 / 183 的临界点由此而定）', () => {
        const s = Q().statusOf(values({ stayFullDays: 182, stayPartialDays: 20, dualRole: true }));
        expect(s.days).toBe(182);
        expect(s.isResident).toBe(false);
        expect(s.workDays).toBeCloseTo(192, 6);      // 工作天数口径：境内停留不足 24 小时按半天计
    });

    test('同时对境外单位任职时，不足 24 小时按半天计入境内工作天数', () => {
        expect(Q().stayOf({ stayFullDays: 20, stayPartialDays: 8, dualRole: true }).workDays)
            .toBeCloseTo(24, 6);
        expect(Q().stayOf({ stayFullDays: 20, stayPartialDays: 8, dualRole: false }).workDays)
            .toBeCloseTo(20, 6);
    });
});

describe('spec 接线：结果区、对照表与推导链', () => {
    test('primary / rows / note / extras / steps 五件套齐全', () => {
        const out = compute();
        expect(out.primary.label).toContain('应缴个人所得税');
        expect(out.primary.value).toBeCloseTo(26620, 6);
        expect(out.rows.length).toBeGreaterThan(6);
        expect(out.note).toContain('非居民个人');
        expect(out.extras).toHaveLength(3);
        expect(out.steps).toHaveLength(3);
    });

    test('主结果主row：收入额 2 万、工资 19080、奖金 7540、合计 26620', () => {
        const out = compute();
        expect(row(out, '当月工资薪金收入额')).toBeCloseTo(20000, 6);
        expect(row(out, '每月减除费用')).toBeCloseTo(5000, 6);
        expect(row(out, '工资薪金税额（12 个月）')).toBeCloseTo(19080, 6);
        expect(row(out, '数月奖金税额（÷ 6 定档后再 × 6）')).toBeCloseTo(7540, 6);
        expect(row(out, '应缴个人所得税')).toBeCloseTo(26620, 6);
        expect(row(out, '留在征税范围外（由所得来源地规则切出去）')).toBeCloseTo(10000, 6);
    });

    test('三张对照表：四档 / 数月奖金两种算法 / 发放节奏', () => {
        const out = compute();
        expect(tableOf(out, '四档')).toHaveLength(5);
        expect(tableOf(out, '数月奖金')).toHaveLength(2);
        const volRows = tableOf(out, '发放节奏');
        expect(volRows).toHaveLength(2);
        expect(volRows[0][0]).toContain('均匀');
        expect(volRows[1][1]).toContain('10000');   // Excel 单元格是字符串，不是对象拼接
    });

    test('推导链三段：纳税义务 → 收入额公式 → 税款计算', () => {
        const out = compute();
        expect(out.steps.map((s) => s.title)).toEqual([
            '① 纳税义务四个档（个税法第一条 + 34 号）',
            '② 当月工资薪金收入额（35 号第二条）',
            '③ 税款计算（35 号第三条）'
        ]);
        expect(JSON.stringify(out.steps[1].rows)).toContain('境内支付占比');
        expect(out.steps[2].footnote).toContain('年度汇算');
    });

    test('居民形态：推导链最后一段换成年度口径（4 行而非 9 行）', () => {
        const out = compute({ stayFullDays: 200, fullYearsBefore: 6 });
        expect(out.steps[2].rows).toHaveLength(4);
        expect(out.primary.label).toContain('按年累计');
        expect(out.primary.value).toBeCloseTo(73080, 6);
        expect(row(out, '六年规则')).toContain('全球所得');
    });

    test('月度税率表与年度表同一层级：2 万月薪与 24 万年薪藏着同一张表的一部分', () => {
        // 非居民：24 万均匀发放 → 19080
        expect(Q().volatilitySampleOf(values()).flatTax).toBeCloseTo(19080, 6);
        // 居民：同样的 24 万按年累计 → 也是 19080（两套算法在均匀时相等，差只来自分配节奏）
        expect(Q().annualTaxOf(240000 - 60000)).toBeCloseTo(19080, 6);
    });
});

describe('走向导：由 spec 驱动', () => {
    beforeEach(() => {
        localStorage.clear();
        window.showPage = jest.fn();
        document.body.innerHTML = '<div id="deep-wizard-page" class="page hidden"></div>';
    });

    test('被通用向导接管：身份与居住天数 → 钱从哪来、人在哪干活 → 数月奖金 → 结果', () => {
        const tool = R().get('non-resident');
        expect(W().has(tool)).toBe(true);
        expect(W().stepsOf(tool).map((s) => s.title)).toEqual([
            '身份与居住天数', '钱从哪来、人在哪干活', '数月奖金', '计算结果'
        ]);
    });

    test('走完四步：主结果、免责声明、结果归属都在', () => {
        W().open('non-resident', { fresh: true });
        for (let i = 0; i < 10; i++) {
            const next = document.getElementById('dw-next');
            if (!next) break;
            next.click();
            if (document.getElementById('dw-result-card')) break;
        }
        expect(document.getElementById('dw-result-primary')).toBeTruthy();
        expect(document.querySelector('.result-disclaimer').textContent).toContain('不构成税务建议');
        const card = document.getElementById('dw-result-card');
        expect(card.getAttribute('data-tool-id')).toBe('non-resident');
        expect(card.textContent).toContain('公式二');
    });
});
