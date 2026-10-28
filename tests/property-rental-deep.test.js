// 个人出租不动产（阶段22 M5，v2.1.0）的回归网
//
// 分类总表 §1.2.4 点出的那一格：F7 财产租赁是全表**唯一一个 0 工具**的所得形态，
// 而它对应的恰恰是「买房出租」这个最普遍的个人投资行为。它既不是工资也不是劳务 ——
// 一笔房租要同时过**五个税种**，而且互相咬合。本文件钉四件事：
//
//   ① **增值税是价外税**：住房的法定表述是「按 5% 征收率减按 1.5%」，
//      公式 = 含税租金 ÷ (1 + 5%) × 1.5% —— 分离用 5%、计税用 1.5%，两步不同率
//      （月租 12 万：1714.29 元；直接拿 12 万乘 1.5% 是 1800，按 1.5% 分离则是 1773.40 —— 都不对）；
//   ② **一次性收租可以分摊**：分摊后月租金 ≤ 10 万元免征（一次性收 12 万：分摊 0、不分摊 1714.29）；
//   ③ **修缮费每月最多 800 元、扣不完结转以后月份**：一次性修 5000 元 → 800×6 + 200 逐月扣完，
//      不是当月扣 800 剩下作废，也不是一次性全扣（一次性全扣会少算 400 元个税）；
//   ④ **住房与非住房是两套税**（财税〔2008〕24 号二整包优惠）：月租 1 万收 1 年，
//      住房 11245.80、非住房 24096.12，差 12850.32。
//
// 口径同源：所有税率与免征线落在 tax-constants.js 的 rentalRules，增值税的价税分离调
// vat-quick、附加与印花税调 surtax-stamp-quick —— 本文件只钉「数字」与「接线」，
// 并额外钉住「这些数字确实是从别处引用来的，不是抄第二份」。

const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');          // rentalRules
    loadSource('src/js/calculation/tax-registry.js');           // 政策条目 property-rental
    loadSource('src/js/calculation/vat-quick.js');              // priceSplitOf（价税分离）
    loadSource('src/js/calculation/surtax-stamp-quick.js');     // surtaxOf / stampDutyOf
    loadSource('src/js/calculation/property-rental-quick.js');
    loadSource('src/js/calculation/utils.js');
    loadSource('src/js/data/tax-taxonomy.js');
    loadSource('src/js/data/person-taxonomy.js');
    loadSource('src/js/data/tool-taxonomy.js');
    loadSource('src/js/data/tool-registry.js');
    loadSource('src/js/ui/toolbox-ui.js');
    loadSource('src/js/ui/deep-wizard-ui.js');
});

const R = () => window.EuriskoToolRegistry;
const Q = () => window.EuriskoPropertyRentalQuick;

// 默认形态：住房、月租 5000（sample）、按月收、市区、未勾减半、无修缮
function values(extra) {
    const base = {};
    R().get('property-rental').fields.forEach((f) => {
        base[f.key] = (f.sample !== undefined ? f.sample : f.default);
    });
    return Object.assign(base, extra || {});
}

function compute(extra) {
    return R().get('property-rental').compute(values(extra));
}

function row(out, label) {
    const r = out.rows.find((x) => x.label === label);
    return r ? r.value : undefined;
}

function tableOf(out, keyword) {
    const e = out.extras.filter((x) => x.title.indexOf(keyword) >= 0)[0];
    return e ? e.table.rows : [];
}

describe('增值税：价外税，分离用 5%、计税用减按后的征收率', () => {
    test('住房月租 5000：分摊后未超过 10 万 → 免征（附加税跟着免）', () => {
        const s = Q().stackOf({ usage: 'housing', monthlyRent: 5000, payMode: 'month' });
        expect(s.vat.exclusive).toBeCloseTo(5000 / 1.05, 6);
        expect(s.vat.exempt).toBe(true);
        expect(s.vat.tax).toBe(0);
        expect(s.surtax.total).toBe(0);
    });

    // 12 万 / 1.05 = 114285.714… × 1.5% = 1714.286…
    test('住房月租 120000（超过免征线）：1714.29 元', () => {
        const v = Q().vatOf({ usage: 'housing', monthlyRent: 120000, payMode: 'month' });
        expect(v.exclusive).toBeCloseTo(114285.7142857, 4);
        expect(v.tax).toBeCloseTo(1714.29, 2);
        // 法定对照（不减按）是 5%：这一行说明减按省了多少
        expect(v.statutoryTax).toBeCloseTo(5714.29, 2);
        expect(v.saving).toBeCloseTo(4000, 2);
    });

    test('非住房没有 1.5% 那一档：按 5% 全额（同样 12 万是 5714.29）', () => {
        const v = Q().vatOf({ usage: 'nonHousing', monthlyRent: 120000, payMode: 'month' });
        expect(v.tax).toBeCloseTo(5714.29, 2);
        expect(v.statutoryTax).toBeCloseTo(5714.29, 2);
    });

    // 这一步错了就是「把含税租金直接乘 1.5%」或「按 1.5% 分离」两种错法
    test('两步不同率：既不是 120000 × 1.5%，也不是 120000 ÷ 1.015 × 1.5%', () => {
        const v = Q().vatOf({ usage: 'housing', monthlyRent: 120000, payMode: 'month' });
        expect(v.tax).not.toBeCloseTo(120000 * 0.015, 2);
        expect(v.tax).not.toBeCloseTo((120000 / 1.015) * 0.015, 2);
    });
});

describe('一次性收租：分摊与不分摊差 1714.29', () => {
    test('分摊后月租金 1 万 → 免征；不分摊（12 万算一期）→ 1714.29', () => {
        const cmp = Q().spreadCompareOf({
            usage: 'housing', monthlyRent: 10000, payMode: 'once', months: 12
        });
        expect(cmp.spread.exempt).toBe(true);
        expect(cmp.unspread.exempt).toBe(false);
        expect(cmp.spread.tax).toBe(0);
        expect(cmp.unspread.tax).toBeCloseTo(1714.29, 2);
        expect(cmp.gap).toBeCloseTo(1714.29, 2);
    });

    test('分摊只改增值税的计税依据，不改全年租金总额', () => {
        const cmp = Q().spreadCompareOf({
            usage: 'housing', monthlyRent: 10000, payMode: 'once', months: 12
        });
        expect(cmp.spread.totalIncome).toBe(120000);
        expect(cmp.unspread.totalIncome).toBe(120000);
    });
});

describe('一屏总额：住房月租 1 万收 1 年', () => {
    function stack() {
        return Q().stackOf({
            usage: 'housing', monthlyRent: 10000, payMode: 'once', months: 12,
            location: 'urban', halve: true, repair: 0
        });
    }

    // 月不含税 9523.81 → 房产税 190.48/月（减半）× 12 = 2285.76
    // 个税：(9523.81 − 190.48) × 80% = 7466.67 × 10% = 746.67/月 × 12 = 8960.04
    test('增值税免征 → 附加 0；房产税 2285.76；个税 8960.04；合计 11245.80', () => {
        const s = stack();
        expect(s.vat.tax).toBe(0);
        expect(s.surtax.total).toBe(0);
        expect(s.propertyTax.tax).toBeCloseTo(2285.76, 2);
        expect(s.stamp.tax).toBe(0);
        expect(s.iit.tax).toBeCloseTo(8960.04, 2);
        expect(s.total).toBeCloseTo(11245.80, 2);
        expect(s.netIncome).toBeCloseTo(108754.20, 2);
    });

    test('到手 = 租金 − 各项税，税负率约 9.37%', () => {
        const s = stack();
        expect(s.netIncome).toBeCloseTo(s.grossIncome - s.total, 2);
        expect(s.effectiveRate).toBeCloseTo(s.total / s.grossIncome, 6);
        expect(s.effectiveRate).toBeGreaterThan(0.09);
        expect(s.effectiveRate).toBeLessThan(0.10);
    });

    test('五个税种都出现在 rows 里（一屏能看见每一条）', () => {
        const out = compute({ monthlyRent: 10000, payMode: 'once', months: 12, halve: true });
        ['增值税', '城市维护建设税', '教育费附加', '地方教育附加', '房产税', '印花税', '个人所得税']
            .forEach((label) => expect(row(out, label)).toBeDefined());
    });
});

describe('修缮费：每月最多 800 元，扣不完结转以后月份', () => {
    test('一次性 5000 元 → 800×6 + 200 逐月扣完，不是当月作废', () => {
        const s = Q().stackOf({
            usage: 'housing', monthlyRent: 10000, payMode: 'once', months: 12,
            location: 'urban', halve: true, repair: 5000
        });
        const perMonth = s.iit.rows.map((r) => r.repair);
        expect(perMonth.slice(0, 6)).toEqual([800, 800, 800, 800, 800, 800]);
        expect(perMonth[6]).toBe(200);
        expect(perMonth[7]).toBe(0);
        expect(s.iit.repairDeducted).toBe(5000);
        expect(s.iit.repairCarried).toBe(0);
    });

    // 修缮 5000 × 80%（费用扣除后）× 10% = 400
    test('扣 5000 元修缮费，个税少 400 元（不是一次性少 500）', () => {
        const base = Q().stackOf({
            usage: 'housing', monthlyRent: 10000, payMode: 'once', months: 12,
            location: 'urban', halve: true, repair: 0
        });
        const fixed = Q().stackOf({
            usage: 'housing', monthlyRent: 10000, payMode: 'once', months: 12,
            location: 'urban', halve: true, repair: 5000
        });
        expect(base.iit.tax - fixed.iit.tax).toBeCloseTo(400, 2);
        expect(fixed.total).toBeCloseTo(10845.80, 2);   // 11245.80 − 400
    });

    test('修缮费花到一半就收 3 个月的：剩 2600 结转，结果页要说清楚', () => {
        const s = Q().stackOf({
            usage: 'housing', monthlyRent: 10000, payMode: 'once', months: 3,
            location: 'urban', halve: true, repair: 5000
        });
        expect(s.iit.repairDeducted).toBe(2400);
        expect(s.iit.repairCarried).toBe(2600);
        expect(s.notes.join('')).toContain('结转');
    });
});

describe('住房 vs 非住房：一整包优惠差 12850.32', () => {
    function stackOf(usage) {
        return Q().stackOf({
            usage: usage, monthlyRent: 10000, payMode: 'once', months: 12,
            location: 'urban', halve: true, repair: 0
        });
    }

    test('住房 11245.80 / 非住房 24096.12（月租 1 万收 1 年）', () => {
        const h = stackOf('housing');
        const n = stackOf('nonHousing');
        expect(h.total).toBeCloseTo(11245.80, 2);
        expect(n.total).toBeCloseTo(24096.12, 2);
        const cmp = Q().usageCompareOf({
            monthlyRent: 10000, payMode: 'once', months: 12, location: 'urban', halve: true, repair: 0
        });
        expect(cmp.gap).toBeCloseTo(12850.32, 2);
    });

    test('非住房要贴印花税（12 万 × 1‰ 减半 = 60），住房免征', () => {
        expect(stackOf('housing').stamp.tax).toBe(0);
        expect(stackOf('nonHousing').stamp.tax).toBeCloseTo(60, 2);
        // 住房免征的那一刻要有出处，不是「算出来是 0」
        expect(stackOf('housing').stamp.note).toContain('财税〔2008〕24 号');
    });

    test('房产税：住房 4%、非住房 12%；个税：住房 10%、非住房 20%', () => {
        expect(stackOf('housing').propertyTax.rate).toBe(0.04);
        expect(stackOf('nonHousing').propertyTax.rate).toBe(0.12);
        expect(stackOf('housing').iit.rate).toBe(0.10);
        expect(stackOf('nonHousing').iit.rate).toBe(0.20);
    });
});

describe('口径同源：税率是从别处引用来的，不是抄第二份', () => {
    const C = () => window.EuriskoTaxConstants;

    test('增值税 5% 与免征线 10 万来自 vatRules（不是本文件自己写的数）', () => {
        const rules = Q().rules();
        const tiers = C().vatRules.smallScale.levyRates;
        const realestate = tiers.filter((t) => t.key === 'realestate')[0];
        expect(rules.vat.levyRate).toBe(realestate.rate);
        expect(rules.vat.monthlyThreshold).toBe(C().vatRules.smallScale.monthlyThreshold);
    });

    test('财产租赁所得 20% 来自 classificationTaxRates', () => {
        expect(Q().rules().iit.rate).toBe(C().classificationTaxRates.rent.rate);
    });

    test('减半比例来自 surtaxRules.halve（六税两费）', () => {
        const withHalve = Q().stackOf({
            usage: 'housing', monthlyRent: 5000, payMode: 'month', halve: true
        });
        const without = Q().stackOf({
            usage: 'housing', monthlyRent: 5000, payMode: 'month', halve: false
        });
        // 5000/1.05 × 4% = 190.48 → 减半 95.24
        expect(without.propertyTax.monthlyTax).toBeCloseTo(190.48, 2);
        expect(withHalve.propertyTax.monthlyTax).toBeCloseTo(95.24, 2);
    });

    test('附加税由 surtax-stamp-quick 作答（计税依据是实缴增值税）', () => {
        const s = Q().stackOf({
            usage: 'housing', monthlyRent: 120000, payMode: 'month', location: 'urban', halve: true
        });
        // 1714.29 × 12% × 50% = 102.85（市区 7% + 3% + 2%，减半）
        expect(s.surtax.base).toBeCloseTo(1714.29, 2);
        expect(s.surtax.total).toBeCloseTo(102.85, 2);
    });
});

describe('接线：结果页与推导链', () => {
    test('主结果是一屏总额，不是某一个税种', () => {
        // 显式把修缮费压回 0：values() 会用 sample（5000），这里要的就是「无修缮」的基准数
        const out = compute({ monthlyRent: 10000, payMode: 'once', months: 12, halve: true, repair: 0 });
        expect(out.primary.label).toContain('合计');
        expect(out.primary.value).toBeCloseTo(11245.80, 2);
        expect(row(out, '本期合计税额')).toBeCloseTo(11245.80, 2);
    });

    test('两张对照表：住房 vs 非住房、分摊 vs 不分摊', () => {
        const out = compute({ monthlyRent: 10000, payMode: 'once', months: 12, halve: true, repair: 0 });
        const usage = tableOf(out, '住房 vs 非住房');
        const spread = tableOf(out, '一次性收租');
        expect(usage.length).toBe(2);
        expect(spread.length).toBe(2);
        expect(usage[0][1].value).toBe(0);
        expect(usage[1][1].value).toBe(0);
        expect(spread[0][3].value).toBe(0);
        expect(spread[1][3].value).toBeCloseTo(1714.29, 2);
    });

    test('推导链三段：增值税 → 附加与房产税 → 个税', () => {
        const out = compute({ monthlyRent: 120000, payMode: 'month', halve: true });
        expect(out.steps.length).toBe(3);
        expect(out.steps[0].title).toContain('增值税');
        expect(out.steps[1].title).toContain('房产税');
        expect(out.steps[2].title).toContain('个人所得税');
        // 修缮费跨月结转，推导链取首月（修缮费扣得最多的那个月）
        const out2 = compute({ monthlyRent: 10000, payMode: 'once', months: 12, halve: true, repair: 5000 });
        const repairRow = out2.steps[2].rows.filter((r) => r.label.indexOf('修缮') >= 0)[0];
        expect(repairRow.value).toBe(800);
    });

    test('结果说明里写清增值税口径、房产税与个税三个月度数', () => {
        // 月租 12 万（超线）：增值税应税，说明里要出现应征口径
        const taxable = compute({ monthlyRent: 120000, payMode: 'month', halve: true });
        expect(taxable.note).toContain('减按 1.5%');
        expect(taxable.note).toContain('房产税');
        expect(taxable.note).toContain('个人所得税');
        // 月租 1 万（未超线）：说明里要出现免征，并连带说清附加同时为 0
        const exempt = compute({ monthlyRent: 10000, payMode: 'month', halve: true, repair: 0 });
        expect(exempt.note).toContain('免征增值税');
        expect(exempt.note).toContain('附加的计税依据同时为 0');
    });

    test('政策条目已登记（结果页出得了时效徽标）', () => {
        expect(R().get('property-rental').policyKey).toBe('property-rental');
        const policy = window.EuriskoTaxRegistry.get('property-rental');
        expect(policy).toBeTruthy();
        expect(policy.category).toBe('iit');
        // 五个税种的政策依据都在，少一份就会有人在「增值税免了附加也免吗」上搞错
        expect(policy.basis.length).toBeGreaterThanOrEqual(7);
    });

    test('挂在 F7 财产租赁 / E17（分类总表 §1.2.4 的那一格）', () => {
        const M = window.EuriskoToolTaxonomy;
        expect(M.get('property-rental').primary).toBe('F7/E17');
        expect(M.get('property-rental').branch).toBe('A');
        expect(window.EuriskoPersonTaxonomy.getEvent('E17').tools).toContain('property-rental');
    });
});
