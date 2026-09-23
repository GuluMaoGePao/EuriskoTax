// 税优健康险轻量实现与内核的等价性测试（阶段15 15A-5 尾巴）
//
// 对拍对象：tax-calculator.js#calculateTaxByTaxableIncome —— App 用年度综合所得税率表计税的真源。
//   保费扣的也是**应纳税所得额**，所以「少交的税」必须写成两段计税之差：
//     health-insurance-quick.premiumOf({ annualPremium: c, taxableBefore: x }).taxSaved
//       ≡ 内核 calculateTaxByTaxableIncome(x).tax − calculateTaxByTaxableIncome(max(0, x − min(c, 2400))).tax
//   在档位分界点及其 ±1 元、保费超过年限额、极值与非法输入上逐点比对。
//
// 另有三件「算法对拍抓不到、但错了就会慢慢误导人」的事，也在这里钉住：
//   ① 年限额 2400（200/月）必须来自常量 healthInsuranceRules（页面不维护第二份），
//      且注册表能解析到同一对象；
//   ② 保险赔款免征个税 —— **没有领取税**，净优惠就是缴费环节少交的税（与个人养老金的 3% 对照）；
//   ③ 节税上限 2400 × 45% = 1080 元/年 —— 本页必须写明「节税不足以成为购买理由」。
const fs = require('fs');
const path = require('path');
const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/tax-calculator.js');
    loadSource('src/js/calculation/tax-registry.js');
    loadSource('src/js/calculation/health-insurance-quick.js');
});

const html = fs.readFileSync(path.join(__dirname, '..', 'seo', 'health-insurance.html'), 'utf8');
const BOUNDARIES = [36000, 144000, 300000, 420000, 660000, 960000];
const SAMPLES = [0, 1, 36000, 36001, 80000, 144000, 200000, 500000, 960001, 5000000];

// 页面示例表的四种典型情形（改常量就必须改页面示例，示例对不上测试就红）
const CASE_10PCT = { annualPremium: 2400, taxableBefore: 80000 };      // 省 240
const CASE_20PCT = { annualPremium: 2400, taxableBefore: 200000 };     // 省 480
const CASE_45PCT = { annualPremium: 2400, taxableBefore: 1000000 };    // 省 1080（顶格）
const CASE_SPAN = { annualPremium: 2400, taxableBefore: 36100 };       // 跨档：省 79，天真算法 240

describe('税优健康险：口径来源单一（常量 + 注册表）', () => {
    test('年限额与免税口径来自注册表声明的全局量（不复制第二份）', () => {
        expect(window.EuriskoHealthInsuranceQuick).toBeDefined();
        const params = window.EuriskoTaxRegistry.resolveParams('health-insurance');
        expect(params.rates).toBe(window.comprehensiveTaxRates);
        expect(params.rules).toBe(window.healthInsuranceRules);
        expect(window.EuriskoHealthInsuranceQuick.rateTable()).toBe(window.comprehensiveTaxRates);
        expect(window.EuriskoHealthInsuranceQuick.rules()).toBe(window.healthInsuranceRules);
    });

    test('规则字段齐全：2400 元/年（200/月）、保险赔款免征个税、2017-07-01 起全国实施', () => {
        const rules = window.EuriskoHealthInsuranceQuick.rules();
        expect(rules.annualLimit).toBe(2400);
        expect(rules.monthlyLimit).toBe(200);
        expect(rules.payoutTaxFree).toBe(true);
        expect(rules.rateTable).toBe('comprehensiveTaxRates');
    });

    test('长期政策：注册表无到期日，政策依据含财税〔2017〕39 号，页面登记指向本页', () => {
        const tax = window.EuriskoTaxRegistry.get('health-insurance');
        expect(tax).toBeDefined();
        expect(tax.expiresOn).toBeNull();
        expect(tax.effectiveFrom).toBe('2017-07-01');
        expect(tax.page).toBe('/seo/health-insurance.html');
        expect(window.EuriskoTaxRegistry.statusOf('health-insurance').expired).toBe(false);
        const basis = window.EuriskoTaxRegistry.basisOf('health-insurance');
        expect(basis.some((b) => b.doc.includes('财税〔2017〕39 号'))).toBe(true);
    });
});

describe('税优健康险：与内核对拍（少交的税 = 两段计税之差）', () => {
    test('档位分界点及其 ±1 元：缴费环节少交的税与内核两段计税完全相等', () => {
        const q = window.EuriskoHealthInsuranceQuick;
        for (const b of BOUNDARIES) {
            for (const x of [b - 1, b, b + 1]) {
                for (const c of [0, 2400, 5000]) {
                    const r = q.premiumOf({ annualPremium: c, taxableBefore: x });
                    const expected = window.calculateTaxByTaxableIncome(x).tax
                        - window.calculateTaxByTaxableIncome(Math.max(0, x - Math.min(c, 2400))).tax;
                    expect(r.taxSaved).toBeCloseTo(expected, 10);
                    expect(r.taxBefore).toBe(window.calculateTaxByTaxableIncome(x).tax);
                    expect(r.taxAfter).toBe(window.calculateTaxByTaxableIncome(Math.max(0, x - r.deductible)).tax);
                }
            }
        }
    });

    test('采样点逐点相等，且少交的税不小于 0、不超过「扣除额 × 最高档税率」', () => {
        const q = window.EuriskoHealthInsuranceQuick;
        for (const x of SAMPLES) {
            for (const c of [0, 1200, 2400, 8000]) {
                const r = q.premiumOf({ annualPremium: c, taxableBefore: x });
                const expected = window.calculateTaxByTaxableIncome(x).tax
                    - window.calculateTaxByTaxableIncome(Math.max(0, x - Math.min(c, 2400))).tax;
                expect(r.taxSaved).toBeCloseTo(expected, 10);
                expect(r.taxSaved).toBeGreaterThanOrEqual(0);
                expect(r.taxSaved).toBeLessThanOrEqual(r.deductible * 0.45 + 1e-9);
            }
        }
    });

    test('超过年限额的部分当年不可扣（缴 5000 只扣 2400）', () => {
        const r = window.EuriskoHealthInsuranceQuick.premiumOf({
            annualPremium: 5000, taxableBefore: 200000
        });
        expect(r.deductible).toBe(2400);
        expect(r.overLimit).toBe(2600);
        expect(r.taxSaved).toBe(480);       // T(200000) − T(197600) = 23080 − 22600
    });

    test('跨档缴费：「保费 × 税率」会高估节税额（页面用这个差异做纠偏）', () => {
        const r = window.EuriskoHealthInsuranceQuick.premiumOf(CASE_SPAN);
        expect(r.rate).toBe(0.1);
        expect(r.taxSaved).toBe(79);        // T(36100) − T(33700) = 1090 − 1011
        expect(r.naiveSaved).toBe(240);     // 2400 × 10%
        expect(r.naiveGap).toBeCloseTo(161, 10);
    });
});

describe('税优健康险：赔付环节免税与净优惠', () => {
    test('保险赔款免征个人所得税 —— 领取税恒为 0（与个人养老金的 3% 对照）', () => {
        const q = window.EuriskoHealthInsuranceQuick;
        expect(q.payoutTaxOf(50000).tax).toBe(0);
        expect(q.payoutTaxOf(0).tax).toBe(0);
        expect(q.payoutTaxOf(100000).payoutTaxFree).toBe(true);
    });

    test('示例① 10% 档：缴 2400 少交 240，净优惠即 240（无领取税）', () => {
        const r = window.EuriskoHealthInsuranceQuick.compareOf(CASE_10PCT);
        expect(r.deductible).toBe(2400);
        expect(r.taxSaved).toBeCloseTo(240, 6);
        expect(r.payoutTax).toBe(0);
        expect(r.netBenefit).toBeCloseTo(240, 6);
    });

    test('示例② 20% 档：缴 2400 少交 480', () => {
        const r = window.EuriskoHealthInsuranceQuick.compareOf(CASE_20PCT);
        expect(r.taxBefore).toBeCloseTo(23080, 6);
        expect(r.taxAfter).toBeCloseTo(22600, 6);
        expect(r.taxSaved).toBeCloseTo(480, 6);
    });

    test('示例③ 45% 档顶格：缴 2400 少交 1080 —— 这就是制度上限', () => {
        const r = window.EuriskoHealthInsuranceQuick.compareOf(CASE_45PCT);
        expect(r.taxSaved).toBeCloseTo(1080, 6);
        expect(r.netBenefit).toBeCloseTo(1080, 6);
        expect(r.maxYearlySaving).toBeCloseTo(2400 * 0.45, 6);   // 2400 × 45%
    });

    test('非法输入按 0 处理，净优惠不出现负数', () => {
        const bad = window.EuriskoHealthInsuranceQuick.compareOf({ annualPremium: -1, taxableBefore: 'abc' });
        expect(bad.deductible).toBe(0);
        expect(bad.taxSaved).toBe(0);
        expect(bad.netBenefit).toBe(0);
    });
});

describe('税优健康险落地页：静态口径与页面声明（爬虫不执行 JS 也能读全）', () => {
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

    test('页面限额处理表写明 2400 元/年（200 元/月）与保险赔款免征个税', () => {
        const block = (html.split('id="hi-rule-table"')[1] || '').split('</table>')[0];
        expect(block).toContain('2400 元/年');
        expect(block).toContain('200 元/月');
        expect(block).toContain('免征个人所得税');
    });

    test('页面静态示例表数字可读（240 / 480 / 1080 / 79 与两段税额）', () => {
        ['>2400.00<', '>5480.00<', '>5240.00<', '>240.00<',
            '>23080.00<', '>22600.00<', '>480.00<',
            '>268080.00<', '>267000.00<', '>1080.00<',
            '>1090.00<', '>1011.00<', '>79.00<', '>240.00<'].forEach((n) => {
            expect(html).toContain(n);
        });
    });

    test('页面写明「扣的是应纳税所得额」与「节税不足以成为购买理由」两处纠偏', () => {
        expect(html).toContain('少交的税 = 扣除前的应纳税额 − 扣除后的应纳税额');
        expect(html).toContain('节税');
        expect(html).toContain('不足以');
        expect(html).toContain('1080');
    });

    test('页面含 canonical / FAQPage 结构化数据、政策文号、同源脚本与 CTA 归因参数', () => {
        expect(html).toContain('rel="canonical" href="https://euriskotax.zeabur.app/seo/health-insurance.html"');
        expect(html).toContain('FAQPage');
        expect(html).toContain('财税〔2017〕39 号');
        expect(html).toContain('/src/js/calculation/tax-constants.js');
        expect(html).toContain('/src/js/calculation/tax-registry.js');
        expect(html).toContain('/src/js/calculation/health-insurance-quick.js');
        expect(html).toContain('?source=seo_health_insurance');
    });
});
