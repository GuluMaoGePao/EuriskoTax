// 外籍个人津补贴免税轻量实现与内核的等价性测试（阶段15 15A-6）
//
// 对拍对象：tax-calculator.js#calculateTaxByTaxableIncome —— App 用年度综合所得税率表计税的真源。
//   两条路径（津补贴免税 / 专项附加扣除）降的都是**应纳税所得额**，所以各自的「少交的税」必须写成：
//     saved ≡ 内核 calculateTaxByTaxableIncome(x).tax − calculateTaxByTaxableIncome(max(0, x − 金额)).tax
//   在档位分界点及其 ±1 元、两条路径金额相同/不等、极值与非法输入上逐点比对 ——
//   两边同一张表、同一条定档规则，就必须完全相等。
//
// 另有三件「算法对拍抓不到、但错了就会慢慢误导人」的事，也在这里钉住：
//   ① 免税项目与**到期日**必须来自常量 expatAllowanceRules + 注册表（页面不维护第二份），
//      到期状态只能问注册表 statusOf，不允许页面自己算日期；
//   ② 「二选一」不是叠加：本页两条都算只是为了比较，页面必须写明「只能选一条、年度内不得变更」；
//   ③ 政策到期后（2028 年起）只能走专项附加扣除 —— 页面必须写明衔接方式，
//      否则到期那天页面就成了误导。
const fs = require('fs');
const path = require('path');
const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/tax-calculator.js');
    loadSource('src/js/calculation/tax-registry.js');
    loadSource('src/js/calculation/expat-allowance-quick.js');
});

const html = fs.readFileSync(path.join(__dirname, '..', 'seo', 'expat-allowance.html'), 'utf8');
const BOUNDARIES = [36000, 144000, 300000, 420000, 660000, 960000];
const SAMPLES = [0, 1, 36000, 80000, 144000, 200000, 500000, 960001, 5000000];

// 页面示例表的三种典型情形（改常量就必须改页面示例，示例对不上测试就红）
const CASE_MORE_ALLOWANCE = { taxableBefore: 200000, allowanceAnnual: 60000, specialAnnual: 36000 };  // 11600 vs 7200
const CASE_MORE_SPECIAL = { taxableBefore: 80000, allowanceAnnual: 12000, specialAnnual: 60000 };     // 1200 vs 4880
const CASE_SAME = { taxableBefore: 500000, allowanceAnnual: 100000, specialAnnual: 100000 };          // 两者相等

describe('外籍个人津补贴免税：口径来源单一（常量 + 注册表）', () => {
    test('免税项目与税率表来自注册表声明的全局量（不复制第二份）', () => {
        expect(window.EuriskoExpatAllowanceQuick).toBeDefined();
        const params = window.EuriskoTaxRegistry.resolveParams('expat-allowance');
        expect(params.rates).toBe(window.comprehensiveTaxRates);
        expect(params.rules).toBe(window.expatAllowanceRules);
        expect(window.EuriskoExpatAllowanceQuick.rateTable()).toBe(window.comprehensiveTaxRates);
        expect(window.EuriskoExpatAllowanceQuick.rules()).toBe(window.expatAllowanceRules);
    });

    test('八项免税津补贴齐全，且明确「与专项附加扣除二选一、年度内不得变更」', () => {
        const rules = window.EuriskoExpatAllowanceQuick.rules();
        expect(rules.items.length).toBe(8);
        expect(rules.items.map((i) => i.label)).toEqual([
            '住房补贴', '伙食补贴', '搬迁费', '洗衣费',
            '境内、外出差补贴', '探亲费', '语言训练费', '子女教育费'
        ]);
        expect(rules.exclusiveWithSpecialDeduction).toBe(true);
        expect(rules.changeNotAllowedInYear).toBe(true);
        expect(rules.items.every((i) => !!i.condition)).toBe(true);
    });

    test('有到期日 2027-12-31：当前未过期，2028-01-01 起判定为已过期', () => {
        const rules = window.EuriskoExpatAllowanceQuick.rules();
        expect(rules.expiresOn).toBe('2027-12-31');
        const tax = window.EuriskoTaxRegistry.get('expat-allowance');
        expect(tax.expiresOn).toBe('2027-12-31');

        const now = window.EuriskoTaxRegistry.statusOf('expat-allowance');
        expect(now.expired).toBe(false);
        expect(now.daysLeft).toBeGreaterThan(0);

        const future = window.EuriskoTaxRegistry.statusOf('expat-allowance', new Date('2028-01-01T00:00:00Z'));
        expect(future.expired).toBe(true);
        expect(future.daysLeft).toBeLessThan(0);
    });

    test('政策依据含 2023 年第 29 号、财税字〔1994〕020 号、国税发〔1997〕54 号、财税〔2004〕29 号', () => {
        const basis = window.EuriskoTaxRegistry.basisOf('expat-allowance');
        ['2023 年第 29 号', '财税字〔1994〕020 号', '国税发〔1997〕54 号', '财税〔2004〕29 号'].forEach((doc) => {
            expect(basis.some((b) => b.doc.includes(doc))).toBe(true);
        });
        expect(window.EuriskoTaxRegistry.get('expat-allowance').page).toBe('/seo/expat-allowance.html');
    });
});

describe('外籍个人津补贴免税：与内核对拍（两条路径各算各的）', () => {
    test('档位分界点及其 ±1 元：两条路径少交的税都与内核两段计税完全相等', () => {
        const q = window.EuriskoExpatAllowanceQuick;
        for (const b of BOUNDARIES) {
            for (const x of [b - 1, b, b + 1]) {
                for (const a of [0, 12000, 60000, 150000]) {
                    const r = q.compareOf({ taxableBefore: x, allowanceAnnual: a, specialAnnual: a / 2 });
                    [r.allowance, r.special].forEach((plan) => {
                        const expected = window.calculateTaxByTaxableIncome(x).tax
                            - window.calculateTaxByTaxableIncome(Math.max(0, x - plan.amount)).tax;
                        expect(plan.saved).toBeCloseTo(expected, 10);
                        expect(plan.taxBefore).toBe(window.calculateTaxByTaxableIncome(x).tax);
                        expect(plan.taxAfter).toBe(window.calculateTaxByTaxableIncome(plan.taxableAfter).tax);
                    });
                }
            }
        }
    });

    test('采样点逐点相等，且少交的税不小于 0、不超过「金额 × 最高档税率」', () => {
        const q = window.EuriskoExpatAllowanceQuick;
        for (const x of SAMPLES) {
            for (const a of [0, 12000, 100000]) {
                const r = q.compareOf({ taxableBefore: x, allowanceAnnual: a, specialAnnual: a });
                [r.allowance, r.special].forEach((plan) => {
                    const expected = window.calculateTaxByTaxableIncome(x).tax
                        - window.calculateTaxByTaxableIncome(Math.max(0, x - plan.amount)).tax;
                    expect(plan.saved).toBeCloseTo(expected, 10);
                    expect(plan.saved).toBeGreaterThanOrEqual(0);
                    expect(plan.saved).toBeLessThanOrEqual(plan.amount * 0.45 + 1e-9);
                });
                // 金额相同时两条路径必然相等（页面第三种示例）
                expect(r.allowance.saved).toBeCloseTo(r.special.saved, 10);
                expect(r.better).toBe('same');
            }
        }
    });

    test('示例① 津补贴多：11600 vs 7200，选津补贴免税，相差 4400', () => {
        const r = window.EuriskoExpatAllowanceQuick.compareOf(CASE_MORE_ALLOWANCE);
        expect(r.allowance.saved).toBeCloseTo(11600, 6);
        expect(r.special.saved).toBeCloseTo(7200, 6);
        expect(r.better).toBe('allowance');
        expect(r.diff).toBeCloseTo(4400, 6);
    });

    test('示例② 扣除多：1200 vs 4880，选专项附加扣除，相差 3680', () => {
        const r = window.EuriskoExpatAllowanceQuick.compareOf(CASE_MORE_SPECIAL);
        expect(r.allowance.saved).toBeCloseTo(1200, 6);
        expect(r.special.saved).toBeCloseTo(4880, 6);
        expect(r.better).toBe('special');
        expect(r.diff).toBeCloseTo(-3680, 6);
    });

    test('示例③ 金额相同：两条都少交 29000，判定为「两者相同」', () => {
        const r = window.EuriskoExpatAllowanceQuick.compareOf(CASE_SAME);
        expect(r.allowance.saved).toBeCloseTo(29000, 6);
        expect(r.special.saved).toBeCloseTo(29000, 6);
        expect(r.better).toBe('same');
        expect(r.diff).toBeCloseTo(0, 10);
    });

    test('跨档时「金额 × 税率」会高估节税额（两条路径都可能踩这个坑）', () => {
        const r = window.EuriskoExpatAllowanceQuick.compareOf({
            taxableBefore: 150000, allowanceAnnual: 12000, specialAnnual: 0
        });
        expect(r.allowance.rate).toBe(0.2);
        expect(r.allowance.saved).toBeCloseTo(1800, 6);    // T(150000) − T(138000) = 13080 − 11280
        expect(r.allowance.naiveSaved).toBe(2400);
        expect(r.allowance.naiveGap).toBeCloseTo(600, 10);
    });

    test('到期后（若未延续）只剩专项附加扣除一条路：afterExpirySaved = 方案 B', () => {
        const r = window.EuriskoExpatAllowanceQuick.compareOf(CASE_MORE_ALLOWANCE);
        expect(r.afterExpirySaved).toBeCloseTo(r.special.saved, 10);
        expect(r.afterExpiryGap).toBeCloseTo(r.allowance.saved - r.special.saved, 10);
    });

    test('非法输入按 0 处理：负数、空串、字符串数字均不报错', () => {
        const r = window.EuriskoExpatAllowanceQuick.compareOf({
            taxableBefore: 'abc', allowanceAnnual: -100, specialAnnual: ''
        });
        expect(r.taxableBefore).toBe(0);
        expect(r.allowance.amount).toBe(0);
        expect(r.special.amount).toBe(0);
        expect(r.allowance.saved).toBe(0);
        expect(r.better).toBe('same');
    });
});

describe('外籍个人津补贴免税落地页：静态口径与页面声明（爬虫不执行 JS 也能读全）', () => {
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

    test('页面八项免税津补贴表与常量逐项一致（改常量必须改页面）', () => {
        const block = (html.split('id="expat-item-table"')[1] || '').split('</table>')[0];
        const rows = Array.from(block.matchAll(/<tr><td>([^<]+)<\/td><td>([^<]+)<\/td><\/tr>/g))
            .map((m) => ({ label: m[1], condition: m[2] }));
        expect(rows.length).toBe(8);
        window.EuriskoExpatAllowanceQuick.rules().items.forEach((item, i) => {
            expect(rows[i].label).toBe(item.label);
            expect(rows[i].condition).toBe(item.condition);
        });
    });

    test('页面静态示例表与三行示例数字可读（11600/7200/4400、1200/4880/3680、29000）', () => {
        ['>60000.00<', '>11600.00<', '>7200.00<', '>4400.00<',
            '>12000.00<', '>1200.00<', '>4880.00<', '>3680.00<',
            '>100000.00<', '>29000.00<', '>0.00<'].forEach((n) => {
            expect(html).toContain(n);
        });
    });

    test('页面写明「二选一、不得同时享受、年度内不得变更」与到期衔接（2028 年起）', () => {
        expect(html).toContain('不得同时享受');
        expect(html).toContain('一个纳税年度内不得变更');
        expect(html).toContain('2027-12-31');
        expect(html).toContain('2028 年起');
        expect(html).toContain('改为享受专项附加扣除');
    });

    test('页面含 canonical / FAQPage 结构化数据、政策文号、同源脚本与 CTA 归因参数', () => {
        expect(html).toContain('rel="canonical" href="https://euriskotax.zeabur.app/seo/expat-allowance.html"');
        expect(html).toContain('FAQPage');
        expect(html).toContain('2023 年第 29 号');
        expect(html).toContain('财税字〔1994〕020 号');
        expect(html).toContain('国税发〔1997〕54 号');
        expect(html).toContain('财税〔2004〕29 号');
        expect(html).toContain('/src/js/calculation/tax-constants.js');
        expect(html).toContain('/src/js/calculation/tax-registry.js');
        expect(html).toContain('/src/js/calculation/expat-allowance-quick.js');
        expect(html).toContain('?source=seo_expat');
    });
});
