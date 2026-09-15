// 个体工商户经营所得「核定 vs 查账」轻量实现与内核 / 常量 / 页面的一致性测试（阶段15 15B-5）
//
// 对拍对象：
//   · 五级累进税额与档位 —— 内核 calculateBusinessTaxByTaxableIncome（本模块不复制税率表）；
//   · 税率表 —— tax-constants.js#businessTaxRates（5%~35% 五级，不是综合所得那张七级表）；
//   · 减半上限与业主费用扣除 —— tax-constants.js#businessIncomeRules（出厂基线，可被运营热改）。
//
// 另有三件「算法对拍抓不到、但错了就会慢慢误导人」的事，也在这里钉住：
//   ① **核定不等于少交税**：核定税额是一条与利润无关的水平线，只有实际净利率高于临界点
//      时才划算 —— 所以「成本再大，核定税额不变」这条必须写成断言（它是本页全部结论的来源）；
//   ② **临界净利率 = 核定应税所得率 + 6 万 ÷ 年营收**（查账还能扣业主 6 万）；
//      若本人另有工资，6 万已在工资侧扣掉，临界就降回核定所得率本身；
//   ③ **减半只减「不超过 200 万那部分」的税额**，减免额在 200 万处封顶为 317250 元，
//      不是「全额减半」—— 规模越大，这项优惠越薄。
const fs = require('fs');
const path = require('path');
const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/tax-registry.js');
    loadSource('src/js/calculation/tax-calculator.js');
    loadSource('src/js/calculation/business-income-quick.js');
});

const html = fs.readFileSync(path.join(__dirname, '..', 'seo', 'business-income.html'), 'utf8');
const Q = () => window.EuriskoBusinessIncomeQuick;

describe('经营所得：口径来源单一（不复制税率表与优惠参数）', () => {
    test('五级累进与内核逐点同值（不是综合所得那张七级表）', () => {
        [30000, 90000, 120000, 300000, 500000, 800000, 2000000].forEach((t) => {
            const kernel = window.calculateBusinessTaxByTaxableIncome(t);
            const quick = Q().taxBeforeHalveOf(t);
            expect(quick.tax).toBe(kernel.tax);
            expect(quick.rate).toBe(kernel.rate);
            expect(quick.deduction).toBe(kernel.deduction);
        });
        // 档位校验：90000 → 1500 + 6000 = 7500（速算扣除 1500，不是七级表的 2520）
        expect(Q().taxBeforeHalveOf(90000).tax).toBe(7500);
        // 300000 → 7500 + 210000 × 20% = 49500（速算扣除 10500，不是七级表的 16920）
        expect(Q().taxBeforeHalveOf(300000).tax).toBe(49500);
        // 最高档 35% 与速算扣除 65500
        expect(Q().taxBeforeHalveOf(800000).rate).toBe(0.35);
        expect(Q().taxBeforeHalveOf(800000).deduction).toBe(65500);
    });

    test('规则来自常量 + 注册表（改常量即改结果，不存在硬编码的第二份参数）', () => {
        const rules = window.businessIncomeRules;
        expect(Q().rules()).toBe(rules);
        expect(Q().rates()).toBe(window.businessTaxRates);
        expect(rules.halve.threshold).toBe(2000000);
        expect(rules.halve.expiresOn).toBe('2027-12-31');
        expect(rules.audited.investorAnnualCap).toBe(60000);
        // 注册表声明的参数与常量一致
        const params = window.EuriskoTaxRegistry.resolveParams('business-income');
        expect(params.rules).toBe(rules);
        expect(params.rates).toBe(window.businessTaxRates);
    });

    test('政策依据与到期状态来自注册表（页面不自己维护文号）', () => {
        const basis = window.EuriskoTaxRegistry.basisOf('business-income');
        expect(basis.some((b) => b.doc === '主席令第九号（2018 年修正）')).toBe(true);
        expect(basis.some((b) => b.doc === '国家税务总局令第 35 号')).toBe(true);
        const halve = window.EuriskoTaxRegistry.statusOf('business-income-halve');
        expect(halve.expiresOn).toBe('2027-12-31');
        expect(halve.expired).toBe(false);
        expect(window.EuriskoTaxRegistry.basisOf('business-income-halve')
            .some((b) => b.doc === '财政部 税务总局公告 2023 年第 12 号')).toBe(true);
    });
});

describe('经营所得：减半只减「不超过 200 万那部分」', () => {
    test('200 万以内：实缴 = 未减半的一半', () => {
        [200000, 500000, 1000000, 2000000].forEach((t) => {
            const r = Q().taxOf(t);
            expect(r.halve).toBeCloseTo(r.beforeHalve * 0.5, 2);
            expect(r.tax).toBeCloseTo(r.beforeHalve * 0.5, 2);
        });
        expect(Q().taxOf(200000).tax).toBeCloseTo(14750, 2);
        expect(Q().taxOf(1000000).tax).toBeCloseTo(142250, 2);
    });

    test('超过 200 万：减免额封顶在 317250 元，实际省下的比例被摊薄', () => {
        const r3 = Q().taxOf(3000000);
        const r5 = Q().taxOf(5000000);
        expect(r3.halve).toBeCloseTo(317250, 2);
        expect(r5.halve).toBeCloseTo(317250, 2);
        expect(r3.tax).toBeCloseTo(667250, 2);
        expect(r5.tax).toBeCloseTo(1367250, 2);
        // 实际省下的比例：300 万 32.2%、500 万 18.8%
        expect(r3.halve / r3.beforeHalve).toBeCloseTo(0.322, 3);
        expect(r5.halve / r5.beforeHalve).toBeCloseTo(0.188, 3);
    });

    test('不享受减半时（halve: false）两种征收方式都按全额计税', () => {
        const a = Q().assessedOf({ revenue: 600000, profitRatio: 0.1, halve: false });
        expect(a.halve).toBe(0);
        expect(a.tax).toBe(4500);
        expect(a.tax).toBe(Q().taxBeforeHalveOf(60000).tax);
    });
});

describe('经营所得：核定是一条与利润无关的水平线（本页全部结论的来源）', () => {
    test('核定应纳税所得额 = 收入 × 应税所得率，与成本费用无关', () => {
        const base = Q().assessedOf({ revenue: 600000, profitRatio: 0.1 });
        expect(base.taxable).toBe(60000);
        expect(base.tax).toBeCloseTo(2250, 2);
        // 成本再大，核定税额一分不变
        [0, 200000, 480000, 540000, 599999].forEach((cost) => {
            const r = Q().assessedOf({ revenue: 600000, cost: cost, profitRatio: 0.1 });
            expect(r.taxable).toBe(60000);
            expect(r.tax).toBeCloseTo(2250, 2);
        });
    });

    test('核定不扣业主 6 万、不扣专项附加、不弥补亏损', () => {
        const plain = Q().assessedOf({ revenue: 600000, profitRatio: 0.1 });
        const rich = Q().assessedOf({
            revenue: 600000,
            profitRatio: 0.1,
            previousLoss: 300000,
            specialAdditional: 48000,
            specialDeduction: 20000
        });
        expect(rich.taxable).toBe(plain.taxable);
        expect(rich.tax).toBe(plain.tax);
    });

    test('查账：扣除链完整（利润 − 亏损 − 6 万 − 社保 − 专项附加），可以为 0', () => {
        const r = Q().auditedOf({ revenue: 600000, cost: 540000 }); // 利润 6 万
        expect(r.profit).toBe(60000);
        expect(r.investorDeduction).toBe(60000);
        expect(r.taxable).toBe(0);
        expect(r.tax).toBe(0);

        const r2 = Q().auditedOf({
            revenue: 600000,
            cost: 480000,       // 利润 12 万
            previousLoss: 10000,
            specialDeduction: 10000,
            specialAdditional: 40000
        });
        expect(r2.taxable).toBe(120000 - 10000 - 60000 - 10000 - 40000);
        expect(r2.taxable).toBe(0);
    });

    test('6 万只能扣一次：有综合所得时经营所得侧不再扣（临界因此降回核定所得率）', () => {
        const noComp = Q().auditedOf({ revenue: 600000, cost: 540000 });
        const withComp = Q().auditedOf({ revenue: 600000, cost: 540000, hasComprehensiveIncome: true });
        expect(noComp.investorDeduction).toBe(60000);
        expect(withComp.investorDeduction).toBe(0);
        expect(withComp.taxable).toBe(60000);
        expect(withComp.tax).toBeCloseTo(2250, 2);
    });

    test('净利率 15%：查账省 1500 元；净利率 30%：核定省 4500 元', () => {
        const low = Q().compareOf({ revenue: 600000, cost: 510000, profitRatio: 0.1 });
        expect(low.actualProfitRatio).toBeCloseTo(0.15, 6);
        expect(low.audited.tax).toBeCloseTo(750, 2);
        expect(low.assessed.tax).toBeCloseTo(2250, 2);
        expect(low.cheaper).toBe('audited');
        expect(low.diff).toBeCloseTo(1500, 2);

        const high = Q().compareOf({ revenue: 600000, cost: 420000, profitRatio: 0.1 });
        expect(high.actualProfitRatio).toBeCloseTo(0.3, 6);
        expect(high.audited.tax).toBeCloseTo(6750, 2);
        expect(high.cheaper).toBe('assessed');
        expect(high.diff).toBeCloseTo(-4500, 2);
    });
});

describe('经营所得：临界净利率 = 核定所得率 + 6 万 ÷ 年营收', () => {
    test('60 万 / 10% → 20.00%；临界点处两者税额相同', () => {
        const bk = Q().breakevenProfitRatioOf({ revenue: 600000, profitRatio: 0.1 });
        expect(bk.ratio).toBeCloseTo(0.2, 4);
        expect(bk.profitAtRatio).toBeCloseTo(120000, 2);
        expect(bk.auditedTax).toBeCloseTo(bk.assessedTax, 2);
        expect(bk.assessedTax).toBeCloseTo(2250, 2);
    });

    test('临界两侧：低于临界查账省，高于临界核定省', () => {
        const ratio = Q().breakevenProfitRatioOf({ revenue: 600000, profitRatio: 0.1 }).ratio;
        const below = Q().compareOf({ revenue: 600000, cost: 600000 * (1 - (ratio - 0.05)), profitRatio: 0.1 });
        const above = Q().compareOf({ revenue: 600000, cost: 600000 * (1 - (ratio + 0.05)), profitRatio: 0.1 });
        expect(below.cheaper).toBe('audited');
        expect(above.cheaper).toBe('assessed');
        // 恰好落在临界上
        expect(Q().compareOf({ revenue: 600000, cost: 600000 * (1 - ratio), profitRatio: 0.1 }).cheaper).toBe('same');
    });

    test('营收越大临界越低：30 万 → 25%、60 万 → 20%、120 万 → 15%、240 万 → 12.5%（所得率 10% 一侧）', () => {
        expect(Q().breakevenProfitRatioOf({ revenue: 300000, profitRatio: 0.05 }).ratio).toBeCloseTo(0.25, 4);
        expect(Q().breakevenProfitRatioOf({ revenue: 600000, profitRatio: 0.10 }).ratio).toBeCloseTo(0.20, 4);
        expect(Q().breakevenProfitRatioOf({ revenue: 1200000, profitRatio: 0.10 }).ratio).toBeCloseTo(0.15, 4);
        expect(Q().breakevenProfitRatioOf({ revenue: 2400000, profitRatio: 0.10 }).ratio).toBeCloseTo(0.125, 4);
        expect(Q().breakevenProfitRatioOf({ revenue: 300000, profitRatio: 0.15 }).ratio).toBeCloseTo(0.35, 4);
    });

    test('有综合所得时临界就等于核定应税所得率本身（与营收无关）', () => {
        [300000, 600000, 1200000, 2400000].forEach((rev) => {
            const bk = Q().breakevenProfitRatioOf({
                revenue: rev,
                profitRatio: 0.1,
                hasComprehensiveIncome: true
            });
            expect(bk.ratio).toBeCloseTo(0.1, 4);
        });
    });

    test('非法输入（0 / 空 / 负数营收）不崩且不谎报', () => {
        [0, '', -100, undefined].forEach((v) => {
            const r = Q().compareOf({ revenue: v, cost: 1000, profitRatio: 0.1 });
            expect(r.assessed.tax).toBe(0);
            expect(r.audited.tax).toBe(0);
            expect(r.cheaper).toBe('same');
        });
    });
});

describe('个体工商户经营所得落地页：正文与算法一致（静态表不是手填的）', () => {
    const input = { revenue: 600000, profitRatio: 0.1 };

    test('静态对比表（无综合所得）与 quick 实算逐档一致', () => {
        Q().profitRatioTableOf([0.03, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.40], input).forEach((r) => {
            expect(html).toContain(`>${r.profit.toFixed(2)}<`);
            expect(html).toContain(`>${r.audited.tax.toFixed(2)}<`);
        });
    });

    test('静态对比表（有综合所得）与 quick 实算逐档一致', () => {
        Q().profitRatioTableOf([0.03, 0.05, 0.10, 0.15, 0.20, 0.30, 0.40],
            Object.assign({ hasComprehensiveIncome: true }, input)).forEach((r) => {
            expect(html).toContain(`>${r.audited.tax.toFixed(2)}<`);
        });
    });

    test('静态减半表与 quick 实算一致（14750.00 / 54750.00 / 317250.00 / 667250.00 / 1367250.00）', () => {
        Q().halveTableOf([200000, 500000, 1000000, 2000000, 3000000, 5000000]).forEach((r) => {
            expect(html).toContain(`>${r.beforeHalve.toFixed(2)}<`);
            expect(html).toContain(`>${r.halve.toFixed(2)}<`);
            expect(html).toContain(`>${r.tax.toFixed(2)}<`);
        });
    });

    test('页面写明四条易错口径：核定不等于少交税、三不、减半不是全额、五级表不是七级表', () => {
        expect(html).toContain('核定不等于少交税');
        expect(html).toContain('临界净利率 = 核定应税所得率 + 6 万元 ÷ 年营业收入');
        expect(html).toContain('不扣成本、不扣 6 万、不弥补亏损');
        expect(html).toContain('只减「不超过 200 万那部分」的税额');
        expect(html).toContain('不是工资那张七级表');
        expect(html).toContain('65500');
        expect(html).toContain('2027-12-31');
    });

    test('页面含 canonical / FAQPage 与政策依据文号，CTA 带归因参数', () => {
        expect(html).toContain('rel="canonical"');
        expect(html).toContain('FAQPage');
        expect(html).toContain('主席令第九号');
        expect(html).toContain('国务院令第 707 号');
        expect(html).toContain('国家税务总局令第 35 号');
        expect(html).toContain('财政部 税务总局公告 2023 年第 12 号');
        expect(html).toContain('?source=seo_bizincome');
    });

    test('页面复用同源脚本（常量 + 注册表 + 经营所得模块），并链回工具总目录', () => {
        expect(html).toContain('/src/js/calculation/tax-constants.js');
        expect(html).toContain('/src/js/calculation/tax-registry.js');
        expect(html).toContain('/src/js/calculation/business-income-quick.js');
        expect(html).toContain('href="/seo/index.html"');
        expect(html).toContain('本测算结果仅供参考，不构成税务建议');
    });
});
