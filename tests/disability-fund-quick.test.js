// 残保金与工会经费轻量实现与常量 / 注册表 / 页面的一致性测试（阶段15 15B-6）
//
// 这一页要钉住的是**两个「不是」**：
//   ① 残保金**不是**「工资总额 × 1.5%」，而是「差额人数 × 在职职工年平均工资」——
//      招 1 个残疾人省下的是一个人的年平均工资，所以「招几个人划算」的答案是边际递减的；
//   ② 残保金的封顶是社平 **2 倍**，工会经费的基数是**工资总额**——
//      社保缴费基数的 300% 封顶与 60% 保底在这里一个都不适用，混用就系统性算错。
//
// 另有三件「算法对拍抓不到、但错了就会慢慢误导人」的事：
//   ① **30 人是临界点**：31 人时按全部 31 人算（不是只对超出的 1 人算），
//      多招一个人的当年会凭空多出一笔钱；
//   ② **差额人数不能先四舍五入**：31 × 1.5% = 0.465 人，先 round 成 0.47 再乘工资
//      会凭空多出几百元（31 人、10 万年薪时差 500 元）；
//   ③ 工会经费的企税扣除限额同为工资薪金总额 2%，按规定拨缴可全额扣除、超提不得扣除。
const fs = require('fs');
const path = require('path');
const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/tax-registry.js');
    loadSource('src/js/calculation/disability-fund-quick.js');
});

const html = fs.readFileSync(path.join(__dirname, '..', 'seo', 'disability-fund.html'), 'utf8');
const Q = () => window.EuriskoDisabilityFundQuick;

describe('残保金：口径来源单一（不复制公式参数）', () => {
    test('规则来自常量 + 注册表（改常量即改结果，不存在硬编码的第二份参数）', () => {
        expect(Q().rules()).toBe(window.disabilityFundRules);
        expect(Q().unionRules()).toBe(window.unionFeeRules);
        const params = window.EuriskoTaxRegistry.resolveParams('disability-fund');
        expect(params.rules).toBe(window.disabilityFundRules);
        expect(window.EuriskoTaxRegistry.resolveParams('union-fee').rules).toBe(window.unionFeeRules);
        expect(window.disabilityFundRules.wageCapMultiple).toBe(2);
        expect(window.disabilityFundRules.ratio).toBe(0.015);
        expect(window.unionFeeRules.rate).toBe(0.02);
    });

    test('政策依据与到期状态来自注册表（页面不自己维护文号）', () => {
        const basis = window.EuriskoTaxRegistry.basisOf('disability-fund');
        expect(basis.some((b) => b.doc === '财税〔2015〕72 号')).toBe(true);
        expect(basis.some((b) => b.doc === '发改价格规〔2019〕2015 号')).toBe(true);
        const preferential = window.EuriskoTaxRegistry.statusOf('disability-fund-preferential');
        expect(preferential.expiresOn).toBe('2027-12-31');
        expect(preferential.expired).toBe(false);
        expect(window.EuriskoTaxRegistry.basisOf('union-fee')
            .some((b) => b.doc === '国务院令第 512 号')).toBe(true);
        // 新分类必须登记在 CATEGORIES 上（tax-registry.test.js 会校验每个条目的 category）
        expect(Object.keys(window.EuriskoTaxRegistry.CATEGORIES)).toContain('fee');
    });
});

describe('残保金：差额人数 × 年平均工资（分档 + 30 人免征 + 2 倍封顶）', () => {
    const base = { headcount: 100, disabled: 0, avgAnnualWage: 120000, socialAverageMonthly: 8000 };

    test('应缴费额 =（人数 × 1.5% − 已安排）× 年平均工资，差额人数不四舍五入', () => {
        const r = Q().levyOf(base);
        expect(r.required).toBeCloseTo(1.5, 9);
        expect(r.gap).toBeCloseTo(1.5, 9);
        expect(r.base).toBeCloseTo(180000, 2);
        // 31 人：0.465 人（先 round 成 0.47 会多出 500 元 —— 这是本页特意不 round 的理由）
        const r31 = Q().levyOf({ headcount: 31, disabled: 0, avgAnnualWage: 100000, socialAverageMonthly: 8000 });
        expect(r31.required).toBeCloseTo(0.465, 9);
        expect(r31.base).toBeCloseTo(46500, 2);
    });

    test('分档按实际安排比例：1% 以下 ×90%、1%（含）以上 ×50%、达到 1.5% 不缴', () => {
        expect(Q().levyOf(base).multiplier).toBe(0.9);
        expect(Q().levyOf(Object.assign({}, base, { disabled: 1 })).multiplier).toBe(0.5);
        expect(Q().levyOf(Object.assign({}, base, { disabled: 2 })).multiplier).toBe(0);
        expect(Q().levyOf(Object.assign({}, base, { disabled: 2 })).payable).toBe(0);
        // 实缴：162000 / 30000 / 0
        expect(Q().levyOf(base).payable).toBeCloseTo(162000, 2);
        expect(Q().levyOf(Object.assign({}, base, { disabled: 1 })).payable).toBeCloseTo(30000, 2);
    });

    test('30 人是临界点：30 人免征、31 人按全部 31 人算（不是只对超出的 1 人算）', () => {
        const input30 = { headcount: 30, disabled: 0, avgAnnualWage: 100000, socialAverageMonthly: 8000 };
        const input31 = { headcount: 31, disabled: 0, avgAnnualWage: 100000, socialAverageMonthly: 8000 };
        const r30 = Q().levyOf(input30);
        const r31 = Q().levyOf(input31);
        expect(r30.smallExempt).toBe(true);
        expect(r30.payable).toBe(0);
        expect(r30.base).toBeCloseTo(45000, 2);   // 免征前的应缴费额仍在（页面要写出来）
        expect(r31.smallExempt).toBe(false);
        expect(r31.payable).toBeCloseTo(41850, 2);
        expect(r31.payable).toBeGreaterThan(0);
    });

    test('年平均工资按社平 2 倍封顶（社平 8000 → 192000），不是社保那个 300%', () => {
        const capped = Q().levyOf({ headcount: 100, disabled: 0, avgAnnualWage: 300000, socialAverageMonthly: 8000 });
        expect(capped.wageCap).toBeCloseTo(192000, 2);
        expect(capped.avgWageUsed).toBeCloseTo(192000, 2);
        expect(capped.capped).toBe(true);
        expect(capped.base).toBeCloseTo(288000, 2);
        expect(capped.payable).toBeCloseTo(259200, 2);
        // 未超上限时不封顶
        const free = Q().levyOf({ headcount: 100, disabled: 0, avgAnnualWage: 150000, socialAverageMonthly: 8000 });
        expect(free.capped).toBe(false);
        expect(free.avgWageUsed).toBeCloseTo(150000, 2);
    });

    test('招残疾人边际递减：第 1 个省 132000、第 2 个省 30000、第 3 个省 0', () => {
        const input = { headcount: 100, avgAnnualWage: 120000, socialAverageMonthly: 8000 };
        expect(Q().savingOf(input, 1).saving).toBeCloseTo(132000, 2);
        expect(Q().savingOf(input, 2).saving).toBeCloseTo(30000, 2);
        expect(Q().savingOf(input, 3).saving).toBeCloseTo(0, 2);
        // 第 1 个同时改变差额人数与档位：162000 → 30000
        expect(Q().savingOf(input, 1).before).toBeCloseTo(162000, 2);
        expect(Q().savingOf(input, 1).after).toBeCloseTo(30000, 2);
    });

    test('法定安排比例可调（各省 1.5%~1.7%）', () => {
        const r = Q().levyOf({ headcount: 100, disabled: 0, avgAnnualWage: 120000, socialAverageMonthly: 8000, ratio: 0.017 });
        expect(r.required).toBeCloseTo(1.7, 9);
        expect(r.base).toBeCloseTo(204000, 2);
    });

    test('非法输入（0 / 空 / 负数人数）不崩且不谎报', () => {
        [0, '', -10, undefined].forEach((v) => {
            const r = Q().levyOf({ headcount: v, disabled: 2, avgAnnualWage: 100000, socialAverageMonthly: 8000 });
            expect(r.headcount).toBe(0);
            expect(r.gap).toBe(0);
            expect(r.payable).toBe(0);
        });
    });
});

describe('工会经费：工资总额 × 2%（不是社保缴费基数）', () => {
    test('2% 拨缴：40% 上缴、60% 留存，企税可全额扣除', () => {
        const r = Q().unionFeeOf({ wageTotal: 12000000, hasUnion: true });
        expect(r.fee).toBeCloseTo(240000, 2);
        expect(r.remitted).toBeCloseTo(96000, 2);
        expect(r.retained).toBeCloseTo(144000, 2);
        expect(r.limit).toBeCloseTo(240000, 2);
        expect(r.deductible).toBeCloseTo(240000, 2);
        expect(r.overDeduction).toBe(0);
    });

    test('未建会：筹备金全额上缴、基层无留存', () => {
        const r = Q().unionFeeOf({ wageTotal: 12000000, hasUnion: false });
        expect(r.fee).toBeCloseTo(240000, 2);
        expect(r.remitted).toBeCloseTo(240000, 2);
        expect(r.retained).toBe(0);
    });

    test('超提部分企税不得扣除（限额是工资薪金总额 2%）', () => {
        const r = Q().unionFeeOf({ wageTotal: 5000000, actual: 150000 });
        expect(r.fee).toBeCloseTo(100000, 2);
        expect(r.limit).toBeCloseTo(100000, 2);
        expect(r.deductible).toBeCloseTo(100000, 2);
        expect(r.overDeduction).toBeCloseTo(50000, 2);
    });

    test('基数没有上下限：工资总额 5 万/月按 1000 元/月，不是社保封顶的 480 元', () => {
        // 月薪 5 万、社平 8000：社保基数封顶 24000（300%），工会经费按 50000 计
        const bySocial = 8000 * 3 * 0.02;
        const byWageTotal = 50000 * 0.02;
        expect(bySocial).toBe(480);
        expect(byWageTotal).toBe(1000);
        expect(Q().unionFeeOf({ wageTotal: 600000 }).fee).toBeCloseTo(12000, 2);
    });
});

describe('残保金落地页：正文与算法一致（静态表不是手填的）', () => {
    const levyInput = { disabled: 0, avgAnnualWage: 100000, socialAverageMonthly: 8000 };

    test('静态人数临界表与 quick 实算逐行一致（30 人 0.00 / 31 人 41850.00）', () => {
        Q().headcountTableOf([25, 30, 31, 40, 50, 100, 200], levyInput).forEach((r) => {
            expect(html).toContain(`>${r.headcount}<`);
            expect(html).toContain(`>${r.gap.toFixed(2)}<`);
            expect(html).toContain(`>${r.base.toFixed(2)}<`);
            expect(html).toContain(`>${r.payable.toFixed(2)}<`);
        });
    });

    test('静态「招残疾人」表与 quick 实算逐行一致（162000.00 / 30000.00 / 0.00）', () => {
        Q().disabledTableOf([0, 1, 2, 3],
            { headcount: 100, avgAnnualWage: 120000, socialAverageMonthly: 8000 }).forEach((r) => {
            expect(html).toContain(`>${r.disabled}<`);
            expect(html).toContain(`>${r.gap.toFixed(2)}<`);
            expect(html).toContain(`>${r.base.toFixed(2)}<`);
            expect(html).toContain(`>${r.payable.toFixed(2)}<`);
        });
    });

    test('静态工资封顶表与 quick 实算逐行一致（192000.00 封顶后实缴都是 259200.00）', () => {
        Q().wageTableOf([60000, 100000, 150000, 192000, 240000, 300000, 500000],
            { headcount: 100, disabled: 0, socialAverageMonthly: 8000 }).forEach((r) => {
            expect(html).toContain(`>${r.avgWageInput.toFixed(2)}<`);
            expect(html).toContain(`>${r.avgWageUsed.toFixed(2)}<`);
            expect(html).toContain(`>${r.payable.toFixed(2)}<`);
        });
    });

    test('静态工会经费表与 quick 实算逐行一致（20000.00 / 8000.00 / 12000.00 …）', () => {
        Q().unionTableOf([1000000, 3000000, 5000000, 10000000, 30000000], {}).forEach((r) => {
            expect(html).toContain(`>${r.wageTotal.toFixed(2)}<`);
            expect(html).toContain(`>${r.fee.toFixed(2)}<`);
            expect(html).toContain(`>${r.remitted.toFixed(2)}<`);
            expect(html).toContain(`>${r.retained.toFixed(2)}<`);
        });
    });

    test('页面写明四条易错口径：不是工资总额乘比例、30 人临界、2 倍不是 300%、按工资总额不是社保基数', () => {
        expect(html).toContain('不是「工资总额 × 1.5%」');
        expect(html).toContain('30 人是临界点');
        expect(html).toContain('不是只对超出的 1 人算');
        expect(html).toContain('残保金是 <strong>2 倍</strong>');
        expect(html).toContain('社保缴费基数的上限是社平 300%');
        expect(html).toContain('41850.00');
        expect(html).toContain('132000.00');
        expect(html).toContain('2027-12-31');
    });

    test('页面含 canonical / FAQPage 与政策依据文号，CTA 带归因参数', () => {
        expect(html).toContain('rel="canonical"');
        expect(html).toContain('FAQPage');
        expect(html).toContain('财税〔2015〕72 号');
        expect(html).toContain('发改价格规〔2019〕2015 号');
        expect(html).toContain('财政部公告 2019 年第 98 号');
        expect(html).toContain('工会法第四十三条');
        expect(html).toContain('?source=seo_disabilityfund');
    });

    test('页面复用同源脚本（常量 + 注册表 + 残保金模块），并链回工具总目录与用工成本页', () => {
        expect(html).toContain('/src/js/calculation/tax-constants.js');
        expect(html).toContain('/src/js/calculation/tax-registry.js');
        expect(html).toContain('/src/js/calculation/disability-fund-quick.js');
        expect(html).toContain('href="/seo/index.html"');
        expect(html).toContain('href="/seo/employer-cost.html"');
        expect(html).toContain('本测算结果仅供参考，不构成税务建议');
    });
});
