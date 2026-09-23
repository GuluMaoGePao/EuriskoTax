// 专项附加扣除轻量实现与内核的等价性测试（阶段15 15A-4）
//
// 对拍对象：tax-calculator.js#calculateTaxByTaxableIncome —— App 用年度综合所得税率表计税的真源。
//   专项附加扣除扣的是**应纳税所得额**，所以「少交的税」必须写成两段计税之差：
//     special-deduction-quick.savingOf({ taxableBefore: x, annualDeduction: d }).saving
//       ≡ 内核 calculateTaxByTaxableIncome(x).tax − calculateTaxByTaxableIncome(max(0, x − d)).tax
//   在档位分界点（36000 / 144000 / 300000 / 420000 / 660000 / 960000）及其 ±1 元、跨档扣除、
//   极值与非法输入上逐点比对 —— 两边同一张表、同一条定档规则，就必须完全相等。
//
// 另有三件「算法对拍抓不到、但错了就会慢慢误导人」的事，也在这里钉住：
//   ① 七项标准必须来自常量 specialDeductionRules（页面不维护第二份），且注册表能解析到同一对象；
//   ② 「扣除额 × 税率」是错的：跨档时会高估，页面必须写明「扣的是应纳税所得额」；
//   ③ 这是一项长期制度（注册表 expiresOn 为 null），且页面必须提示每年 12 月确认次年的信息。
const fs = require('fs');
const path = require('path');
const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/tax-calculator.js');
    loadSource('src/js/calculation/tax-registry.js');
    loadSource('src/js/calculation/special-deduction-quick.js');
});

const html = fs.readFileSync(path.join(__dirname, '..', 'seo', 'special-deduction.html'), 'utf8');
const BOUNDARIES = [36000, 144000, 300000, 420000, 660000, 960000];
const SAMPLES = [0, 1, 1000, 36000, 36001, 143999, 144000, 200000, 299999, 500000, 960001, 5000000];

// 页面示例表的三种典型情形（改常量就必须改页面示例，示例对不上测试就红）
const CASE_RENT_YOUTH = {
    housing: 'rent', rentTier: 1, rentMonths: 12,
    elderly: 'shared', elderlyMonthly: 1500,
    taxableBefore: 80000
};                                                        // 18000 + 18000 = 36000
const CASE_LOAN_FAMILY = {
    children: 1, childShare: 50,
    housing: 'loan', loanMonths: 12,
    elderly: 'only',
    taxableBefore: 200000
};                                                        // 12000 + 12000 + 36000 = 60000
const CASE_MEDICAL = {
    infants: 1, infantShare: 100,
    degreeMonths: 8,
    medicalSelfPaid: 60000,
    taxableBefore: 300000
};                                                        // 24000 + 3200 + 45000 = 72200

describe('专项附加扣除：口径来源单一（常量 + 注册表）', () => {
    test('七项标准与税率表来自注册表声明的全局量（不复制第二份）', () => {
        expect(window.EuriskoSpecialDeductionQuick).toBeDefined();
        const params = window.EuriskoTaxRegistry.resolveParams('special-deduction');
        expect(params.rates).toBe(window.comprehensiveTaxRates);
        expect(params.rules).toBe(window.specialDeductionRules);
        expect(window.EuriskoSpecialDeductionQuick.rateTable()).toBe(window.comprehensiveTaxRates);
        expect(window.EuriskoSpecialDeductionQuick.rules()).toBe(window.specialDeductionRules);
    });

    test('七项标准齐全：2000/2000/400/3600/15000/80000/1000/1500-1100-800/3000（赡养分摊上限 1500）', () => {
        const items = window.EuriskoSpecialDeductionQuick.rules().items;
        expect(items.infantCare.monthly).toBe(2000);
        expect(items.childrenEducation.monthly).toBe(2000);
        expect(items.continuingEducationDegree.monthly).toBe(400);
        expect(items.continuingEducationDegree.maxMonths).toBe(48);
        expect(items.continuingEducationCert.annual).toBe(3600);
        expect(items.seriousIllness.threshold).toBe(15000);
        expect(items.seriousIllness.annualCap).toBe(80000);
        expect(items.housingLoan.monthly).toBe(1000);
        expect(items.housingLoan.maxMonths).toBe(240);
        expect(items.housingRent.monthlyByCityTier).toEqual([1500, 1100, 800]);
        expect(items.elderlySupport.monthly).toBe(3000);
        expect(items.elderlySupport.monthlyCapPerPerson).toBe(1500);
    });

    test('住房贷款利息与住房租金互斥：同一纳税年度只能二选一', () => {
        const rules = window.EuriskoSpecialDeductionQuick.rules();
        expect(rules.exclusive).toEqual([['housingLoan', 'housingRent']]);
        const r = window.EuriskoSpecialDeductionQuick.annualOf({
            housing: 'loan', loanMonths: 12
        });
        expect(r.items.housingLoan).toBe(12000);
        expect(r.items.housingRent).toBe(0);
    });

    test('长期制度：注册表无到期日，政策依据含 41 号与 13 号', () => {
        const tax = window.EuriskoTaxRegistry.get('special-deduction');
        expect(tax).toBeDefined();
        expect(tax.expiresOn).toBeNull();
        expect(tax.page).toBe('/seo/special-deduction.html');
        const status = window.EuriskoTaxRegistry.statusOf('special-deduction');
        expect(status.expired).toBe(false);
        expect(html.includes('国发〔2018〕41 号')).toBe(true);
        expect(html.includes('国发〔2023〕13 号')).toBe(true);
    });
});

describe('专项附加扣除：七项年度扣除额', () => {
    test('示例① 单身租房青年：房租 1500×12 + 赡养分摊 1500×12 = 36000', () => {
        const r = window.EuriskoSpecialDeductionQuick.annualOf(CASE_RENT_YOUTH);
        expect(r.items.housingRent).toBe(18000);
        expect(r.items.elderlySupport).toBe(18000);
        expect(r.totalAnnual).toBe(36000);
        expect(r.totalMonthly).toBe(3000);
    });

    test('示例② 房贷 + 1 娃（各扣 50%）+ 独生子女赡养 = 60000', () => {
        const r = window.EuriskoSpecialDeductionQuick.annualOf(CASE_LOAN_FAMILY);
        expect(r.items.childrenEducation).toBe(12000);
        expect(r.items.housingLoan).toBe(12000);
        expect(r.items.elderlySupport).toBe(36000);
        expect(r.totalAnnual).toBe(60000);
    });

    test('示例③ 婴幼儿 + 继续教育 8 个月 + 大病自付 6 万（扣 4.5 万）= 72200', () => {
        const r = window.EuriskoSpecialDeductionQuick.annualOf(CASE_MEDICAL);
        expect(r.items.infantCare).toBe(24000);
        expect(r.items.continuingEducationDegree).toBe(3200);
        expect(r.items.seriousIllness).toBe(45000);      // 60000 − 15000 起扣线
        expect(r.totalAnnual).toBe(72200);
    });

    test('分摊比例只有 100% / 50% 两种：填 70 按 50% 处理，非独生分摊封顶 1500', () => {
        const half = window.EuriskoSpecialDeductionQuick.annualOf({ infants: 1, infantShare: 70 });
        expect(half.items.infantCare).toBe(12000);       // 2000 × 12 × 50%
        const capped = window.EuriskoSpecialDeductionQuick.annualOf({ elderly: 'shared', elderlyMonthly: 3000 });
        expect(capped.items.elderlySupport).toBe(18000); // 封顶 1500 × 12
    });

    test('月数与次数上限：学历继续教育封顶 48 个月、房贷封顶 240 个月、房租封顶 12 个月', () => {
        const r = window.EuriskoSpecialDeductionQuick.annualOf({
            degreeMonths: 60, housing: 'loan', loanMonths: 300, rentMonths: 15
        });
        expect(r.items.continuingEducationDegree).toBe(400 * 48);
        expect(r.items.housingLoan).toBe(1000 * 240);
        expect(r.items.housingRent).toBe(0);             // 选了 loan 就不计房租
    });

    test('大病医疗：未超起扣线为 0、超过起扣线按超额、超额部分封顶 8 万', () => {
        const q = window.EuriskoSpecialDeductionQuick;
        expect(q.annualOf({ medicalSelfPaid: 15000 }).items.seriousIllness).toBe(0);
        expect(q.annualOf({ medicalSelfPaid: 15001 }).items.seriousIllness).toBe(1);
        expect(q.annualOf({ medicalSelfPaid: 200000 }).items.seriousIllness).toBe(80000);
    });

    test('非法输入按 0 处理：负数、空串、字符串数字均不报错', () => {
        const r = window.EuriskoSpecialDeductionQuick.annualOf({
            infants: -2, children: '', degreeMonths: 'abc', medicalSelfPaid: null, certCount: '2'
        });
        expect(r.items.infantCare).toBe(0);
        expect(r.items.childrenEducation).toBe(0);
        expect(r.items.continuingEducationDegree).toBe(0);
        expect(r.items.seriousIllness).toBe(0);
        expect(r.items.continuingEducationCert).toBe(7200);   // '2' 是合法数字：3600 × 2
        expect(r.totalAnnual).toBe(7200);
    });
});

describe('专项附加扣除：与内核对拍（少交的税 = 两段计税之差）', () => {
    test('档位分界点及其 ±1 元：节税额与内核两段计税完全相等', () => {
        const q = window.EuriskoSpecialDeductionQuick;
        for (const b of BOUNDARIES) {
            for (const x of [b - 1, b, b + 1]) {
                for (const d of [0, 1, 36000, 60000, 200000]) {
                    const s = q.savingOf({ taxableBefore: x, annualDeduction: d });
                    const expected = window.calculateTaxByTaxableIncome(x).tax
                        - window.calculateTaxByTaxableIncome(Math.max(0, x - d)).tax;
                    expect(s.saving).toBeCloseTo(expected, 10);
                    expect(s.taxBefore).toBe(window.calculateTaxByTaxableIncome(x).tax);
                    expect(s.taxAfter).toBe(window.calculateTaxByTaxableIncome(Math.max(0, x - d)).tax);
                }
            }
        }
    });

    test('采样点逐点相等，且节税额不小于 0、不超过「扣除额 × 最高档税率」', () => {
        const q = window.EuriskoSpecialDeductionQuick;
        for (const x of SAMPLES) {
            for (const d of [0, 12000, 36000, 72200, 150000]) {
                const s = q.savingOf({ taxableBefore: x, annualDeduction: d });
                const expected = window.calculateTaxByTaxableIncome(x).tax
                    - window.calculateTaxByTaxableIncome(Math.max(0, x - d)).tax;
                expect(s.saving).toBeCloseTo(expected, 10);
                expect(s.saving).toBeGreaterThanOrEqual(0);
                expect(s.saving).toBeLessThanOrEqual(d * 0.45 + 1e-9);
            }
        }
    });

    test('扣除额大于应纳税所得额时：超出部分用不上（usedDeduction 小于扣除额）', () => {
        const s = window.EuriskoSpecialDeductionQuick.savingOf({ taxableBefore: 20000, annualDeduction: 60000 });
        expect(s.taxableAfter).toBe(0);
        expect(s.usedDeduction).toBe(20000);
        expect(s.taxAfter).toBe(0);
        expect(s.saving).toBe(window.calculateTaxByTaxableIncome(20000).tax);
    });

    test('跨档扣除：「扣除额 × 税率」会高估节税额（页面用这个差异做纠偏）', () => {
        const r = window.EuriskoSpecialDeductionQuick.compareOf(CASE_LOAN_FAMILY);
        expect(r.totalAnnual).toBe(60000);
        expect(r.rate).toBe(0.2);
        expect(r.naiveSaving).toBe(12000);      // 60000 × 20%
        expect(r.saving).toBe(11600);           // T(200000) − T(140000)
        expect(r.naiveGap).toBeCloseTo(400, 10);
    });

    test('不跨档扣除时两种算法相等（天真算法只在跨档时出错）', () => {
        const r = window.EuriskoSpecialDeductionQuick.compareOf({
            housing: 'rent', rentTier: 1, rentMonths: 12, taxableBefore: 100000
        });
        expect(r.taxableAfter).toBe(82000);
        expect(r.naiveGap).toBeCloseTo(0, 10);   // 82000 与 100000 同在 10% 档
    });

    test('三种示例的节税额与页面示例表一致：3600 / 11600 / 14440', () => {
        const q = window.EuriskoSpecialDeductionQuick;
        expect(q.compareOf(CASE_RENT_YOUTH).saving).toBeCloseTo(3600, 6);
        expect(q.compareOf(CASE_LOAN_FAMILY).saving).toBeCloseTo(11600, 6);
        expect(q.compareOf(CASE_MEDICAL).saving).toBeCloseTo(14440, 6);
    });
});

describe('专项附加扣除落地页：静态口径与页面声明（爬虫不执行 JS 也能读全）', () => {
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

    test('页面七项标准表包含全部现行标准数字（改常量必须改页面）', () => {
        const block = (html.split('id="deduction-standard-table"')[1] || '').split('</table>')[0];
        expect(block).toContain('2000 元/月 · 每个婴幼儿');
        expect(block).toContain('2000 元/月 · 每个子女');
        expect(block).toContain('400 元/月');
        expect(block).toContain('3600 元/年');
        expect(block).toContain('15000');
        expect(block).toContain('80000');
        expect(block).toContain('1000 元/月');
        expect(block).toContain('1500 / 1100 / 800 元/月');
        expect(block).toContain('3000 元/月');
        expect(block).toContain('1500 元/月');
    });

    test('页面静态示例表与对照表可读（36000/5480/1880/3600、60000/23080/11480/11600、72200/43080/28640/14440）', () => {
        ['>36000.00<', '>5480.00<', '>1880.00<', '>3600.00<',
            '>60000.00<', '>23080.00<', '>11480.00<', '>11600.00<',
            '>72200.00<', '>43080.00<', '>28640.00<', '>14440.00<',
            '>12000.00<', '>400.00<'].forEach((n) => {
            expect(html).toContain(n);
        });
    });

    test('页面写明「扣的是应纳税所得额」，而不是直接减税额', () => {
        expect(html).toContain('扣的是「应纳税所得额」');
        expect(html).toContain('扣除额 ≠ 减税额');
        expect(html).toContain('两段计税相减');
    });

    test('页面写明每年 12 月确认，且未确认只是暂停扣除、汇算可补扣', () => {
        expect(html).toContain('12 月');
        expect(html).toContain('补充扣除');
        expect(html).toContain('暂停');
    });

    test('页面含 canonical / FAQPage 结构化数据、同源脚本与 CTA 归因参数', () => {
        expect(html).toContain('rel="canonical" href="https://euriskotax.zeabur.app/seo/special-deduction.html"');
        expect(html).toContain('FAQPage');
        expect(html).toContain('/src/js/calculation/tax-constants.js');
        expect(html).toContain('/src/js/calculation/tax-registry.js');
        expect(html).toContain('/src/js/calculation/special-deduction-quick.js');
        expect(html).toContain('?source=seo_special');
    });
});
