// 企业年金 / 职业年金轻量实现与内核的等价性测试（阶段15 15A-5 尾巴）
//
// 对拍对象：tax-calculator.js#calculateTaxByTaxableIncome —— App 用年度综合所得税率表计税的真源。
//   个人缴费 ≤ 计税基数 × 4% 的部分扣的也是**应纳税所得额**，所以「少交的税」必须写成
//   两段计税之差：
//     annuity-quick.contributionOf({ contributionBase, personalRate, taxableBefore }).taxSaved
//       ≡ 内核 calculateTaxByTaxableIncome(x).tax
//         − calculateTaxByTaxableIncome(max(0, x − min(月基数×4%, 月基数×个人比例)×12)).tax
//
// 另有四件「算法对拍抓不到、但错了就会慢慢误导人」的事，也在这里钉住：
//   ① 4%/8%/12% 与 300% 封顶必须来自常量 annuityRules（页面不维护第二份）；
//   ② 个人缴费超 4% 的部分照常税后扣缴（不免税，但照常进账户）；
//   ③ 领取环节按**全额**单独计税、不并入综合所得 —— 按月领取用月度税率表（与年终奖同一张），
//      按年领取用综合所得税率表；
//   ④ 本页必须能算出「净优惠为负」的情形：3% 档缴费者少交 3%、领取再交 3%，
//      且领取税覆盖的是全额（含单位缴费）—— 一个只讲优点的页面不可信。
const fs = require('fs');
const path = require('path');
const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/tax-calculator.js');
    loadSource('src/js/calculation/tax-registry.js');
    loadSource('src/js/calculation/annuity-quick.js');
});

const html = fs.readFileSync(path.join(__dirname, '..', 'seo', 'enterprise-annuity.html'), 'utf8');
const BOUNDARIES = [36000, 144000, 300000, 420000, 660000, 960000];
const BASES = [5000, 10000, 20000, 50000];

// 页面示例表的四种典型情形（改常量就必须改页面示例，示例对不上测试就红）
const CASE_20PCT = { contributionBase: 20000, personalRate: 0.04, employerRate: 0.08, taxableBefore: 300000, years: 10, monthlyWithdraw: 3000 }; // 净 10560
const CASE_10PCT = { contributionBase: 15000, personalRate: 0.04, employerRate: 0.08, taxableBefore: 100000, years: 10, monthlyWithdraw: 2500 }; // 净 750
const CASE_OVER = { contributionBase: 20000, personalRate: 0.06, employerRate: 0.08, taxableBefore: 300000, years: 1, monthlyWithdraw: 3000 };   // 超 4% 部分 400/月
const CASE_3PCT = { contributionBase: 10000, personalRate: 0.04, employerRate: 0.08, taxableBefore: 30000, years: 1, monthlyWithdraw: 1000 };    // 净 -276

describe('企业年金：口径来源单一（常量 + 注册表）', () => {
    test('4%/8%/12% 与月度表声明来自注册表声明的全局量（不复制第二份）', () => {
        expect(window.EuriskoAnnuityQuick).toBeDefined();
        const params = window.EuriskoTaxRegistry.resolveParams('enterprise-annuity');
        expect(params.rates).toBe(window.comprehensiveTaxRates);
        expect(params.rules).toBe(window.annuityRules);
        expect(window.EuriskoAnnuityQuick.rules()).toBe(window.annuityRules);
        expect(window.EuriskoAnnuityQuick.rateTable()).toBe(window.comprehensiveTaxRates);
        expect(window.EuriskoAnnuityQuick.monthlyTable()).toBe(window.bonusMonthlyTaxRates);
    });

    test('规则字段齐全：个人 4%、单位 8%、合计 12%、社平 300% 封顶、领取全额单独计税', () => {
        const rules = window.EuriskoAnnuityQuick.rules();
        expect(rules.personalRateCap).toBe(0.04);
        expect(rules.employerRateCap).toBe(0.08);
        expect(rules.combinedRateCap).toBe(0.12);
        expect(rules.baseCapMultiplier).toBe(3);
        expect(rules.investmentTaxFree).toBe(true);
        expect(rules.withdrawTaxOnFull).toBe(true);
        expect(rules.withdrawNotCombined).toBe(true);
        expect(rules.monthlyRateTable).toBe('bonusMonthlyTaxRates');
    });

    test('长期制度：注册表无到期日，政策依据含财税〔2013〕103 号，页面登记指向本页', () => {
        const tax = window.EuriskoTaxRegistry.get('enterprise-annuity');
        expect(tax).toBeDefined();
        expect(tax.expiresOn).toBeNull();
        expect(tax.effectiveFrom).toBe('2014-01-01');
        expect(tax.page).toBe('/seo/enterprise-annuity.html');
        expect(window.EuriskoTaxRegistry.statusOf('enterprise-annuity').expired).toBe(false);
        const basis = window.EuriskoTaxRegistry.basisOf('enterprise-annuity');
        expect(basis.some((b) => b.doc.includes('财税〔2013〕103 号'))).toBe(true);
    });
});

describe('企业年金：缴费环节与内核对拍（少交的税 = 两段计税之差）', () => {
    test('档位分界点及其 ±1 元：缴费环节少交的税与内核两段计税完全相等', () => {
        const q = window.EuriskoAnnuityQuick;
        for (const b of BOUNDARIES) {
            for (const x of [b - 1, b, b + 1]) {
                for (const base of [10000, 20000]) {
                    for (const rate of [0.04, 0.06]) {
                        const r = q.contributionOf({ contributionBase: base, personalRate: rate, employerRate: 0.08, taxableBefore: x });
                        const exempt = Math.min(base * rate, base * 0.04) * 12;
                        const expected = window.calculateTaxByTaxableIncome(x).tax
                            - window.calculateTaxByTaxableIncome(Math.max(0, x - exempt)).tax;
                        expect(r.taxSaved).toBeCloseTo(expected, 10);
                        expect(r.annualExempt).toBeCloseTo(exempt, 10);
                    }
                }
            }
        }
    });

    test('采样点逐点相等，且少交的税不小于 0、不超过「年扣除额 × 最高档税率」', () => {
        const q = window.EuriskoAnnuityQuick;
        for (const x of [0, 1, 80000, 200000, 500000, 5000000]) {
            for (const base of BASES) {
                const r = q.contributionOf({ contributionBase: base, personalRate: 0.04, employerRate: 0.08, taxableBefore: x });
                const expected = window.calculateTaxByTaxableIncome(x).tax
                    - window.calculateTaxByTaxableIncome(Math.max(0, x - base * 0.04 * 12)).tax;
                expect(r.taxSaved).toBeCloseTo(expected, 10);
                expect(r.taxSaved).toBeGreaterThanOrEqual(0);
                expect(r.taxSaved).toBeLessThanOrEqual(r.annualExempt * 0.45 + 1e-9);
            }
        }
    });

    test('示例① 20% 档：月免 800、年扣 9600、年少交 1920（T(300000) − T(290400)）', () => {
        const r = window.EuriskoAnnuityQuick.contributionOf({
            contributionBase: 20000, personalRate: 0.04, employerRate: 0.08, taxableBefore: 300000
        });
        expect(r.exemptMonthly).toBe(800);
        expect(r.annualExempt).toBe(9600);
        expect(r.taxBefore).toBe(43080);
        expect(r.taxAfter).toBe(41160);
        expect(r.taxSaved).toBe(1920);
        expect(r.naiveGap).toBeCloseTo(0, 10);   // 300000 与 290400 同在 20% 档
    });

    test('个人缴费超 4%：超出部分税后扣缴但照常进账户（月缴 1200 只免 800）', () => {
        const r = window.EuriskoAnnuityQuick.contributionOf({
            contributionBase: 20000, personalRate: 0.06, employerRate: 0.08, taxableBefore: 300000
        });
        expect(r.personalMonthly).toBe(1200);
        expect(r.exemptMonthly).toBe(800);
        expect(r.taxablePersonalMonthly).toBe(400);   // 超 4% 部分：不免税
        expect(r.taxSaved).toBe(1920);                // 免税口径不变
        expect(r.annualPersonal).toBe(14400);         // 1200 × 12 照常全部进账户
    });

    test('单位缴费 8% 封顶且递延进账户（月基数 20000 × 8% = 1600/月）', () => {
        const r = window.EuriskoAnnuityQuick.contributionOf({
            contributionBase: 20000, personalRate: 0.04, employerRate: 0.15, taxableBefore: 300000
        });
        expect(r.employerMonthly).toBe(1600);         // 15% 也只按 8% 计（税优口径）
        expect(r.annualEmployer).toBe(19200);
        expect(r.annualDeferred).toBe(28800);         // 1600 + 800 合计递延
    });
});

describe('企业年金：领取环节按月度税率表与净优惠', () => {
    test('按月领取按月度税率表逐月单独计税（与年终奖同一张表）', () => {
        const q = window.EuriskoAnnuityQuick;
        expect(q.monthlyWithdrawTax(3000).tax).toBe(90);     // 3000 × 3%
        expect(q.monthlyWithdrawTax(3001).rate).toBe(0.1);
        expect(q.monthlyWithdrawTax(5000).tax).toBe(290);    // 5000 × 10% − 210
        expect(q.monthlyWithdrawTax(0).tax).toBe(0);
        const w = q.monthlyWithdrawTax(1000);
        expect(w.rate).toBe(0.03);
        expect(w.deduction).toBe(0);
    });

    test('示例① 20% 档缴 10 年：年免 9600/少交 1920、账户 288000、领取税 8640、净 10560', () => {
        const r = window.EuriskoAnnuityQuick.compareOf(CASE_20PCT);
        expect(r.taxSaved).toBeCloseTo(1920, 6);
        expect(r.totalTaxSaved).toBeCloseTo(19200, 6);
        expect(r.accountTotal).toBeCloseTo(288000, 6);
        expect(r.monthlyWithdrawRate).toBe(0.03);
        expect(r.months).toBe(96);
        expect(r.withdrawTaxTotal).toBeCloseTo(8640, 6);
        expect(r.netBenefit).toBeCloseTo(10560, 6);
        expect(r.worthIt).toBe(true);
    });

    test('示例② 10% 档缴 10 年：年少交 720、账户 216000、领取税 6450、净 750', () => {
        const r = window.EuriskoAnnuityQuick.compareOf(CASE_10PCT);
        expect(r.taxSaved).toBeCloseTo(720, 6);
        expect(r.accountTotal).toBeCloseTo(216000, 6);
        expect(r.withdrawTaxTotal).toBeCloseTo(6450, 6);   // 75 × 86 个月
        expect(r.netBenefit).toBeCloseTo(750, 6);
    });

    test('示例③ 个人缴 6%：月缴 1200 只免 800，超出的 400/月税后进账户', () => {
        const r = window.EuriskoAnnuityQuick.compareOf(CASE_OVER);
        expect(r.exemptMonthly).toBe(800);
        expect(r.taxSaved).toBeCloseTo(1920, 6);
        expect(r.months).toBe(11);                          // 33600 ÷ 3000
        expect(r.withdrawTaxTotal).toBeCloseTo(990, 6);
        expect(r.netBenefit).toBeCloseTo(930, 6);
    });

    test('示例④ 3% 档：省 3% 交 3%，且领取税覆盖全额 —— 净优惠为负，判定不划算', () => {
        const r = window.EuriskoAnnuityQuick.compareOf(CASE_3PCT);
        expect(r.rate).toBe(0.03);
        expect(r.taxSaved).toBeCloseTo(144, 6);             // T(30000) − T(25200)
        expect(r.withdrawTaxTotal).toBeCloseTo(420, 6);     // 30 × 14 个月（含单位缴费部分）
        expect(r.netBenefit).toBeCloseTo(-276, 6);
        expect(r.worthIt).toBe(false);
    });

    test('缺省每月领取额按「每年进账户本金 ÷ 12」估算；非法输入按 0 或 1 处理', () => {
        const q = window.EuriskoAnnuityQuick;
        const d = q.compareOf({ contributionBase: 20000, personalRate: 0.04, employerRate: 0.08, taxableBefore: 300000, years: 1 });
        expect(d.monthlyWithdraw).toBeCloseTo(2400, 6);     // (9600 + 19200) ÷ 12
        const bad = q.compareOf({ contributionBase: -1, personalRate: 'abc', employerRate: null, taxableBefore: 'x', years: -3, monthlyWithdraw: '' });
        expect(bad.exemptMonthly).toBe(0);
        expect(bad.years).toBe(1);
        expect(bad.monthlyWithdraw).toBe(0);
        expect(bad.netBenefit).toBe(0);
    });
});

describe('企业年金落地页：静态口径与页面声明（爬虫不执行 JS 也能读全）', () => {
    test('页面静态年度税率表与常量逐档一致（页面不维护第二份税率表）', () => {
        const block = (html.split('id="annual-rate-table"')[1] || '').split('</table>')[0];
        const rows = Array.from(block.matchAll(/<td>([^<]+)<\/td><td class="num">([\d.]+)%<\/td><td class="num">([\d,]+)<\/td>/g))
            .map((m) => ({ pct: Number(m[2]), deduction: Number(m[3].replace(/,/g, '')) }));
        expect(rows.length).toBe(window.comprehensiveTaxRates.length);
        rows.forEach((row, i) => {
            expect(row.pct).toBeCloseTo(window.comprehensiveTaxRates[i].rate * 100, 6);
            expect(row.deduction).toBe(window.comprehensiveTaxRates[i].deduction);
        });
    });

    test('页面静态月度税率表（按月领取用）与常量逐档一致', () => {
        const block = (html.split('id="monthly-rate-table"')[1] || '').split('</table>')[0];
        const rows = Array.from(block.matchAll(/<td>([^<]+)<\/td><td class="num">([\d.]+)%<\/td><td class="num">([\d,]+)<\/td>/g))
            .map((m) => ({ pct: Number(m[2]), deduction: Number(m[3].replace(/,/g, '')) }));
        expect(rows.length).toBe(window.bonusMonthlyTaxRates.filter((r) => r.max !== Infinity).length + 1);
        rows.forEach((row, i) => {
            expect(row.pct).toBeCloseTo(window.bonusMonthlyTaxRates[i].rate * 100, 6);
            expect(row.deduction).toBe(window.bonusMonthlyTaxRates[i].deduction);
        });
    });

    test('页面三环节处理表写明 4% / 8% / 12%、300% 封顶与全额单独计税', () => {
        const block = (html.split('id="annuity-rule-table"')[1] || '').split('</table>')[0];
        expect(block).toContain('4%');
        expect(block).toContain('8%');
        expect(block).toContain('12%');
        expect(block).toContain('300%');
        expect(block).toContain('全额');
        expect(block).toContain('不并入综合所得');
    });

    test('页面静态示例表数字可读（1920 / 10560 / 720 / 750 / −276 / 930）', () => {
        ['>9600.00<', '>1920.00<', '>288000.00<', '>8640.00<', '>10560.00<',
            '>7200.00<', '>720.00<', '>216000.00<', '>6450.00<', '>750.00<',
            '>930.00<', '>144.00<', '>420.00<', '>-276.00<'].forEach((n) => {
            expect(html).toContain(n);
        });
    });

    test('页面写明「税收净优惠为负」的情形与「单位缴费递延计税」的另一面', () => {
        expect(html).toContain('税收净优惠为负');
        expect(html).toContain('单位缴费');
        expect(html).toContain('不构成是否参加企业年金的建议');
    });

    test('页面含 canonical / FAQPage 结构化数据、政策文号、同源脚本与 CTA 归因参数', () => {
        expect(html).toContain('rel="canonical" href="https://euriskotax.zeabur.app/seo/enterprise-annuity.html"');
        expect(html).toContain('FAQPage');
        expect(html).toContain('财税〔2013〕103 号');
        expect(html).toContain('/src/js/calculation/tax-constants.js');
        expect(html).toContain('/src/js/calculation/tax-registry.js');
        expect(html).toContain('/src/js/calculation/annuity-quick.js');
        expect(html).toContain('?source=seo_annuity');
    });
});
