// 个人养老金轻量实现与内核的等价性测试（阶段15 15A-5）
//
// 对拍对象：tax-calculator.js#calculateTaxByTaxableIncome —— App 用年度综合所得税率表计税的真源。
//   缴费环节扣的是**应纳税所得额**，所以「少交的税」必须写成两段计税之差：
//     private-pension-quick.contributionOf({ annualContribution: c, taxableBefore: x }).taxSaved
//       ≡ 内核 calculateTaxByTaxableIncome(x).tax − calculateTaxByTaxableIncome(max(0, x − 可扣额)).tax
//   在档位分界点及其 ±1 元、缴费超过年限额、极值与非法输入上逐点比对 —— 两边同一张表、
//   同一条定档规则，就必须完全相等。
//
// 另有三件「算法对拍抓不到、但错了就会慢慢误导人」的事，也在这里钉住：
//   ① 年限额与 3% 领取税率必须来自常量 privatePensionRules（页面不维护第二份），
//      且注册表能解析到同一对象；
//   ② 领取环节按**领取额全额 × 3%**（本金与收益一起计），不是只对收益计税；
//   ③ 本页必须能算出「不划算」的结论：适用税率 3% 的人省 3%、领时再交 3%，净优惠为 0 ——
//      一个只讲优点的税优页面不可信，这条断言就是为此而写。
const fs = require('fs');
const path = require('path');
const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/tax-calculator.js');
    loadSource('src/js/calculation/tax-registry.js');
    loadSource('src/js/calculation/private-pension-quick.js');
});

const html = fs.readFileSync(path.join(__dirname, '..', 'seo', 'private-pension.html'), 'utf8');
const BOUNDARIES = [36000, 144000, 300000, 420000, 660000, 960000];
const SAMPLES = [0, 1, 36000, 36001, 80000, 144000, 200000, 500000, 960001, 5000000];

// 页面示例表的四种典型情形（改常量就必须改页面示例，示例对不上测试就红）
const CASE_10PCT = { annualContribution: 12000, taxableBefore: 80000, years: 1, withdrawTotal: 12000 };   // 840
const CASE_20PCT = { annualContribution: 12000, taxableBefore: 200000, years: 10, withdrawTotal: 120000 }; // 20400
const CASE_3PCT = { annualContribution: 12000, taxableBefore: 20000, years: 1, withdrawTotal: 12000 };     // 0，不划算
const CASE_OVER = { annualContribution: 20000, taxableBefore: 500000, years: 1, withdrawTotal: 12000 };    // 3240

describe('个人养老金：口径来源单一（常量 + 注册表）', () => {
    test('年限额与领取税率来自注册表声明的全局量（不复制第二份）', () => {
        expect(window.EuriskoPrivatePensionQuick).toBeDefined();
        const params = window.EuriskoTaxRegistry.resolveParams('private-pension');
        expect(params.rates).toBe(window.comprehensiveTaxRates);
        expect(params.rules).toBe(window.privatePensionRules);
        expect(window.EuriskoPrivatePensionQuick.rateTable()).toBe(window.comprehensiveTaxRates);
        expect(window.EuriskoPrivatePensionQuick.rules()).toBe(window.privatePensionRules);
    });

    test('规则字段齐全：年限额 12000、领取按 3% 单独计税、投资收益暂不征税', () => {
        const rules = window.EuriskoPrivatePensionQuick.rules();
        expect(rules.annualLimit).toBe(12000);
        expect(rules.withdrawRate).toBe(0.03);
        expect(rules.withdrawIsSeparate).toBe(true);
        expect(rules.investmentTaxFree).toBe(true);
        expect(rules.rateTable).toBe('comprehensiveTaxRates');
    });

    test('长期制度：注册表无到期日，政策依据含 2024 年第 21 号与 2022 年第 34 号', () => {
        const tax = window.EuriskoTaxRegistry.get('private-pension');
        expect(tax).toBeDefined();
        expect(tax.expiresOn).toBeNull();
        expect(tax.effectiveFrom).toBe('2024-01-01');
        expect(tax.page).toBe('/seo/private-pension.html');
        expect(window.EuriskoTaxRegistry.statusOf('private-pension').expired).toBe(false);
        const basis = window.EuriskoTaxRegistry.basisOf('private-pension');
        expect(basis.some((b) => b.doc.includes('2024 年第 21 号'))).toBe(true);
        expect(basis.some((b) => b.doc.includes('2022 年第 34 号'))).toBe(true);
    });
});

describe('个人养老金：与内核对拍（少交的税 = 两段计税之差）', () => {
    test('档位分界点及其 ±1 元：缴费环节少交的税与内核两段计税完全相等', () => {
        const q = window.EuriskoPrivatePensionQuick;
        for (const b of BOUNDARIES) {
            for (const x of [b - 1, b, b + 1]) {
                for (const c of [0, 12000, 20000]) {
                    const r = q.contributionOf({ annualContribution: c, taxableBefore: x });
                    const expected = window.calculateTaxByTaxableIncome(x).tax
                        - window.calculateTaxByTaxableIncome(Math.max(0, x - Math.min(c, 12000))).tax;
                    expect(r.taxSaved).toBeCloseTo(expected, 10);
                    expect(r.taxBefore).toBe(window.calculateTaxByTaxableIncome(x).tax);
                    expect(r.taxAfter).toBe(window.calculateTaxByTaxableIncome(Math.max(0, x - r.deductible)).tax);
                }
            }
        }
    });

    test('采样点逐点相等，且少交的税不小于 0、不超过「可扣额 × 最高档税率」', () => {
        const q = window.EuriskoPrivatePensionQuick;
        for (const x of SAMPLES) {
            for (const c of [0, 6000, 12000, 50000]) {
                const r = q.contributionOf({ annualContribution: c, taxableBefore: x });
                const expected = window.calculateTaxByTaxableIncome(x).tax
                    - window.calculateTaxByTaxableIncome(Math.max(0, x - Math.min(c, 12000))).tax;
                expect(r.taxSaved).toBeCloseTo(expected, 10);
                expect(r.taxSaved).toBeGreaterThanOrEqual(0);
                expect(r.taxSaved).toBeLessThanOrEqual(r.deductible * 0.45 + 1e-9);
            }
        }
    });

    test('超过年限额的部分当年不可扣、也不能结转（缴 2 万只扣 1.2 万）', () => {
        const r = window.EuriskoPrivatePensionQuick.contributionOf({
            annualContribution: 20000, taxableBefore: 500000
        });
        expect(r.deductible).toBe(12000);
        expect(r.overLimit).toBe(8000);
        expect(r.taxSaved).toBe(3600);       // T(500000) − T(488000) = 97080 − 93480
    });

    test('跨档缴费：「扣除额 × 税率」会高估节税额（页面用这个差异做纠偏）', () => {
        const r = window.EuriskoPrivatePensionQuick.contributionOf({
            annualContribution: 12000, taxableBefore: 150000
        });
        expect(r.rate).toBe(0.2);
        expect(r.taxSaved).toBe(1800);       // T(150000) − T(138000) = 13080 − 11280
        expect(r.naiveSaved).toBe(2400);     // 12000 × 20%
        expect(r.naiveGap).toBeCloseTo(600, 10);
    });
});

describe('个人养老金：领取环节 3% 与净优惠', () => {
    test('领取税按领取额全额 × 3%（本金与收益一起计，不并入综合所得）', () => {
        const q = window.EuriskoPrivatePensionQuick;
        expect(q.withdrawTaxOf(12000).tax).toBe(360);
        expect(q.withdrawTaxOf(120000).tax).toBe(3600);
        expect(q.withdrawTaxOf(0).tax).toBe(0);
        const w = q.withdrawTaxOf(12000);
        expect(w.withdrawRate).toBe(0.03);
        expect(w.isSeparate).toBe(true);
    });

    test('示例① 10% 档缴 1 年：少交 1200、领取交 360、净优惠 840', () => {
        const r = window.EuriskoPrivatePensionQuick.compareOf(CASE_10PCT);
        expect(r.taxSaved).toBeCloseTo(1200, 6);
        expect(r.withdrawTax).toBeCloseTo(360, 6);
        expect(r.netBenefit).toBeCloseTo(840, 6);
        expect(r.worthIt).toBe(true);
    });

    test('示例② 20% 档缴 10 年：累计少交 24000、领取交 3600、净优惠 20400', () => {
        const r = window.EuriskoPrivatePensionQuick.compareOf(CASE_20PCT);
        expect(r.taxSaved).toBeCloseTo(2400, 6);
        expect(r.totalTaxSaved).toBeCloseTo(24000, 6);
        expect(r.withdrawTax).toBeCloseTo(3600, 6);
        expect(r.netBenefit).toBeCloseTo(20400, 6);
    });

    test('示例③ 3% 档：省 3% 交 3%，净优惠为 0 —— 必须判定为「不划算」', () => {
        const r = window.EuriskoPrivatePensionQuick.compareOf(CASE_3PCT);
        expect(r.rate).toBe(0.03);
        expect(r.taxSaved).toBeCloseTo(360, 6);
        expect(r.withdrawTax).toBeCloseTo(360, 6);
        expect(r.netBenefit).toBeCloseTo(0, 6);
        expect(r.worthIt).toBe(false);
    });

    test('示例④ 超额缴费：可扣 12000、少交 3600、净优惠 3240，同档时天真算法不偏高', () => {
        const r = window.EuriskoPrivatePensionQuick.compareOf(CASE_OVER);
        expect(r.deductible).toBe(12000);
        expect(r.taxSaved).toBeCloseTo(3600, 6);
        expect(r.netBenefit).toBeCloseTo(3240, 6);
        expect(r.naiveGap).toBeCloseTo(0, 10);   // 500000 与 488000 同在 30% 档
    });

    test('回本线：领取额低于「累计少交的税 ÷ 3%」时净优惠仍为正', () => {
        const r = window.EuriskoPrivatePensionQuick.compareOf(CASE_20PCT);
        expect(r.breakEvenWithdraw).toBeCloseTo(24000 / 0.03, 6);   // 800000
        const below = window.EuriskoPrivatePensionQuick.compareOf({
            annualContribution: 12000, taxableBefore: 200000, years: 10, withdrawTotal: 500000
        });
        expect(below.netBenefit).toBeCloseTo(24000 - 15000, 6);      // 高于回本线前仍为正
        const above = window.EuriskoPrivatePensionQuick.compareOf({
            annualContribution: 12000, taxableBefore: 200000, years: 10, withdrawTotal: 900000
        });
        expect(above.netBenefit).toBeLessThan(0);                    // 超过回本线后为负
    });

    test('缺省领取额按「只回本金」估算；非法输入按 0 或 1 处理', () => {
        const q = window.EuriskoPrivatePensionQuick;
        expect(q.compareOf({ annualContribution: 12000, taxableBefore: 80000, years: 5 }).withdrawTotal).toBe(60000);
        const bad = q.compareOf({ annualContribution: -1, taxableBefore: 'abc', years: -3, withdrawTotal: null });
        expect(bad.deductible).toBe(0);
        expect(bad.years).toBe(1);
        expect(bad.withdrawTotal).toBe(0);
        expect(bad.netBenefit).toBe(0);
    });
});

describe('个人养老金落地页：静态口径与页面声明（爬虫不执行 JS 也能读全）', () => {
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

    test('页面三环节处理表写明 12000 元/年限额、3% 单独计税、投资收益暂不征税', () => {
        const block = (html.split('id="pension-rule-table"')[1] || '').split('</table>')[0];
        expect(block).toContain('12000 元/年');
        expect(block).toContain('3%');
        expect(block).toContain('暂不征收个人所得税');
        expect(block).toContain('不并入综合所得');
    });

    test('页面静态示例表与四行示例数字可读（840 / 20400 / 0.00 / 3240）', () => {
        ['>12000.00<', '>5480.00<', '>4280.00<', '>1200.00<', '>360.00<', '>840.00<',
            '>23080.00<', '>20680.00<', '>2400.00<', '>3600.00<', '>20400.00<',
            '>600.00<', '>240.00<', '>97080.00<', '>93480.00<', '>3240.00<', '>0.00<'].forEach((n) => {
            expect(html).toContain(n);
        });
    });

    test('页面写明「扣的是应纳税所得额」与「不是所有人都划算」两处纠偏', () => {
        expect(html).toContain('少交的税 = 扣除前的应纳税额 − 扣除后的应纳税额');
        expect(html).toContain('不划算');
        expect(html).toContain('净优惠为 0');
        expect(html).toContain('不超过 36000 元');
    });

    test('页面含 canonical / FAQPage 结构化数据、政策文号、同源脚本与 CTA 归因参数', () => {
        expect(html).toContain('rel="canonical" href="https://euriskotax.zeabur.app/seo/private-pension.html"');
        expect(html).toContain('FAQPage');
        expect(html).toContain('2024 年第 21 号');
        expect(html).toContain('2022 年第 34 号');
        expect(html).toContain('/src/js/calculation/tax-constants.js');
        expect(html).toContain('/src/js/calculation/tax-registry.js');
        expect(html).toContain('/src/js/calculation/private-pension-quick.js');
        expect(html).toContain('?source=seo_pension');
    });
});
