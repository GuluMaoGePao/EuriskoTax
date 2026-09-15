// 提前退休 / 内部退养一次性收入轻量实现与内核的等价性测试（阶段15 15A-7）
//
// 对拍对象：
//   · 提前退休 —— tax-calculator.js#calculateTaxByTaxableIncome（年度综合所得税率表）：
//       每年应纳税额 ≡ 内核 calculateTaxByTaxableIncome(分摊后每年 − 60000).tax，
//       总税额 ≡ 每年税额 × 实际年度数。**真分摊**（算完每年再乘回年数）。
//   · 内部退养 —— bonus-tax-quick.js#bracketOf（月度税率表，与年终奖单独计税同一张表）：
//       定档基数 = 月均额 + 当月工资 − 5000；档位 ≡ EuriskoBonusQuick.bracketOf(base × 12)；
//       税额 = (当月工资 + 一次性收入 − 5000) × 税率 − 速算扣除数。**平均只为定档**，税基是全额。
//   在档位分界点及其 ±1（元/分）与采样点上逐点比对 —— 两边同一张表、同一条定档规则，就必须完全相等。
//
// 另有三件「算法对拍抓不到、但错了就会慢慢误导人」的事，也在这里钉住：
//   ① 规则与两张税率表必须来自常量 + 注册表（页面不维护第二份）；
//   ② 内部退养的「平均」**不是**分摊计税 —— 页面必须能算出这个差额（naiveGap > 0），
//      否则读者会照着「月均额 × 月数」算出一个明显偏小的数；
//   ③ 这三套口径（提前退休 / 内部退养 / 离职补偿）必须写清楚区别 ——
//      尤其要写明「3 倍社平工资免税」**只属于**离职补偿，不能套到前两者上。
const fs = require('fs');
const path = require('path');
const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/tax-calculator.js');
    loadSource('src/js/calculation/tax-registry.js');
    loadSource('src/js/calculation/bonus-tax-quick.js');
    loadSource('src/js/calculation/early-retirement-quick.js');
});

const html = fs.readFileSync(path.join(__dirname, '..', 'seo', 'early-retirement.html'), 'utf8');
const BOUNDARIES = [36000, 144000, 300000, 420000, 660000, 960000];      // 年度表分界点
const MONTHLY_BOUNDARIES = [3000, 12000, 25000, 35000, 55000, 80000];    // 月度表分界点

describe('提前退休 / 内部退养：口径来源单一（常量 + 注册表）', () => {
    test('规则与两张税率表来自注册表声明的全局量（不复制第二份）', () => {
        expect(window.EuriskoEarlyRetirementQuick).toBeDefined();
        expect(window.EuriskoBonusQuick).toBeDefined();
        const params = window.EuriskoTaxRegistry.resolveParams('early-retirement');
        expect(params.rules).toBe(window.earlyRetirementRules);
        expect(params.rates).toBe(window.comprehensiveTaxRates);
        expect(params.monthlyRates).toBe(window.bonusMonthlyTaxRates);
        expect(window.EuriskoEarlyRetirementQuick.rules()).toBe(window.earlyRetirementRules);
    });

    test('提前退休：年度表 + 每年减 6 万 + 真分摊；内部退养：月度表 + 每月减 5000 + 只定档', () => {
        const rules = window.EuriskoEarlyRetirementQuick.rules();
        expect(rules.early.rateTable).toBe('comprehensiveTaxRates');
        expect(rules.early.annualDeduction).toBe(60000);
        expect(rules.early.spread).toBe(true);
        expect(rules.internal.rateTable).toBe('bonusMonthlyTaxRates');
        expect(rules.internal.monthlyDeduction).toBe(5000);
        expect(rules.internal.averageOnlyForRate).toBe(true);
        expect(rules.internal.mergeWithMonthlySalary).toBe(true);
    });

    test('长期政策：注册表无到期日，政策依据含 164 号与国税发〔1999〕58 号', () => {
        const tax = window.EuriskoTaxRegistry.get('early-retirement');
        expect(tax).toBeDefined();
        expect(tax.expiresOn).toBeNull();
        expect(tax.effectiveFrom).toBe('2019-01-01');
        expect(tax.page).toBe('/seo/early-retirement.html');
        expect(window.EuriskoTaxRegistry.statusOf('early-retirement').expired).toBe(false);
        const basis = window.EuriskoTaxRegistry.basisOf('early-retirement');
        expect(basis.some((b) => b.doc.includes('财税〔2018〕164 号'))).toBe(true);
        expect(basis.some((b) => b.doc.includes('国税发〔1999〕58 号'))).toBe(true);
    });
});

describe('提前退休：与内核对拍（真分摊，先按年减 6 万再乘回年数）', () => {
    test('档位分界点及其 ±1 元：每年税额与内核计算结果完全相等', () => {
        const q = window.EuriskoEarlyRetirementQuick;
        for (const b of BOUNDARIES) {
            for (const taxable of [b - 1, b, b + 1]) {
                for (const years of [1, 2, 5.5]) {
                    // 反推一次性补贴，使分摊后每年的应纳税所得额正好落在分界点附近
                    const subsidy = (taxable + 60000) * years;
                    const r = q.earlyOf({ subsidy: subsidy, years: years });
                    expect(r.taxablePerYear).toBeCloseTo(taxable, 6);
                    expect(r.taxPerYear).toBeCloseTo(window.calculateTaxByTaxableIncome(taxable).tax, 8);
                    expect(r.tax).toBeCloseTo(window.calculateTaxByTaxableIncome(taxable).tax * years, 6);
                }
            }
        }
    });

    test('采样点逐点相等，且分摊口径的税额不超过「不摊」的税额', () => {
        const q = window.EuriskoEarlyRetirementQuick;
        for (const subsidy of [0, 60000, 180000, 500000, 1200000]) {
            for (const years of [1, 2, 3, 10]) {
                const r = q.earlyOf({ subsidy: subsidy, years: years });
                expect(r.taxPerYear).toBeCloseTo(window.calculateTaxByTaxableIncome(r.taxablePerYear).tax, 8);
                expect(r.tax).toBeCloseTo(r.taxPerYear * years, 8);
                expect(r.tax).toBeLessThanOrEqual(r.naiveTax + 1e-9);
                expect(r.spreadSaving).toBeGreaterThanOrEqual(-1e-9);
            }
        }
    });

    test('示例三例：18 万摊 2 年 1800 元、30 万摊 3 年 4440 元、60 万摊 5 年 17400 元', () => {
        const q = window.EuriskoEarlyRetirementQuick;
        expect(q.earlyOf({ subsidy: 180000, years: 2 }).tax).toBeCloseTo(1800, 6);
        expect(q.earlyOf({ subsidy: 300000, years: 3 }).tax).toBeCloseTo(4440, 6);
        expect(q.earlyOf({ subsidy: 600000, years: 5 }).tax).toBeCloseTo(17400, 6);
    });

    test('年度数可为小数（月份 ÷ 12）；非法输入按 0 / 1 处理', () => {
        const q = window.EuriskoEarlyRetirementQuick;
        const r = q.earlyOf({ subsidy: 200000, years: 65 / 12 });
        expect(r.years).toBeCloseTo(65 / 12, 10);
        expect(r.tax).toBeCloseTo(window.calculateTaxByTaxableIncome(r.taxablePerYear).tax * (65 / 12), 6);

        const bad = q.earlyOf({ subsidy: 'abc', years: 0 });
        expect(bad.subsidy).toBe(0);
        expect(bad.years).toBe(1);
        expect(bad.tax).toBe(0);
    });
});

describe('内部退养：与月度表对拍（平均只为定档，税基是全额）', () => {
    test('定档档位与月度税率表逐档一致（分界点及其 ±0.01 元），并与年终奖取档实现同源', () => {
        const q = window.EuriskoEarlyRetirementQuick;
        for (const b of MONTHLY_BOUNDARIES) {
            for (const base of [b - 0.01, b, b + 0.01]) {
                // 让定档基数正好落在分界点附近：月均额 = base − 当月工资 + 5000
                const salary = 6000;
                const monthly = Math.max(0, base - salary + 5000);
                const r = q.internalOf({ lumpSum: monthly * 24, months: 24, monthlySalary: salary });
                expect(r.base).toBeCloseTo(base, 6);
                const expected = window.EuriskoBonusQuick.bracketOf(base * 12, window.bonusMonthlyTaxRates);
                expect(r.rate).toBe(expected.rate);
                expect(r.deductionForBracket).toBe(expected.deduction);
            }
        }
    });

    test('税额 = (当月工资 + 一次性收入 − 5000) × 税率 − 速算扣除数（税基不摊）', () => {
        const q = window.EuriskoEarlyRetirementQuick;
        for (const lump of [0, 50000, 120000, 400000]) {
            for (const months of [1, 12, 24, 60]) {
                for (const salary of [0, 5000, 6000, 20000]) {
                    const r = q.internalOf({ lumpSum: lump, months: months, monthlySalary: salary });
                    const taxable = Math.max(0, salary + lump - 5000);
                    expect(r.taxable).toBeCloseTo(taxable, 8);
                    expect(r.tax).toBeCloseTo(Math.max(0, taxable * r.rate - r.deductionForBracket), 8);
                }
            }
        }
    });

    test('示例三例：3630 / 11890 / 20090（同为 12 万，只因月份不同税率档就不同）', () => {
        const q = window.EuriskoEarlyRetirementQuick;
        expect(q.internalOf({ lumpSum: 120000, months: 60, monthlySalary: 6000 }).tax).toBeCloseTo(3630, 6);
        expect(q.internalOf({ lumpSum: 120000, months: 24, monthlySalary: 6000 }).tax).toBeCloseTo(11890, 6);
        expect(q.internalOf({ lumpSum: 200000, months: 60, monthlySalary: 8000 }).tax).toBeCloseTo(20090, 6);
    });

    test('误把「平均」当分摊计税会明显少算：naiveGap > 0（页面用这个差异做纠偏）', () => {
        const r = window.EuriskoEarlyRetirementQuick.internalOf({
            lumpSum: 120000, months: 24, monthlySalary: 6000
        });
        expect(r.naiveGap).toBeGreaterThan(0);
        expect(r.naiveTax).toBeLessThan(r.tax);
    });

    test('当月工资参与定档：同一笔一次性收入，当月工资越高适用税率可能越高', () => {
        const q = window.EuriskoEarlyRetirementQuick;
        const low = q.internalOf({ lumpSum: 120000, months: 60, monthlySalary: 0 });
        const high = q.internalOf({ lumpSum: 120000, months: 60, monthlySalary: 20000 });
        expect(high.base).toBeGreaterThan(low.base);
        expect(high.rate).toBeGreaterThanOrEqual(low.rate);
        expect(high.tax).toBeGreaterThan(low.tax);
    });

    test('非法输入按 0 / 1 处理：不报错、不产生负税额', () => {
        const r = window.EuriskoEarlyRetirementQuick.internalOf({
            lumpSum: -1, months: 0, monthlySalary: 'abc'
        });
        expect(r.lumpSum).toBe(0);
        expect(r.months).toBe(1);
        expect(r.monthlySalary).toBe(0);
        expect(r.tax).toBe(0);
    });
});

describe('提前退休 / 内部退养落地页：静态口径与页面声明（爬虫不执行 JS 也能读全）', () => {
    test('页面静态月度税率表与常量逐档一致（内部退养定档用）', () => {
        const block = (html.split('id="monthly-rate-table"')[1] || '').split('</table>')[0];
        const rows = Array.from(block.matchAll(/<td>([^<]+)<\/td><td class="num">([\d.]+)%<\/td><td class="num">([\d,]+)<\/td>/g))
            .map((m) => ({ pct: Number(m[2]), deduction: Number(m[3].replace(/,/g, '')) }));
        expect(rows.length).toBe(window.bonusMonthlyTaxRates.length);
        rows.forEach((row, i) => {
            expect(row.pct).toBeCloseTo(window.bonusMonthlyTaxRates[i].rate * 100, 6);
            expect(row.deduction).toBe(window.bonusMonthlyTaxRates[i].deduction);
        });
    });

    test('页面静态年度税率表与常量逐档一致（提前退休分摊后定档用）', () => {
        const block = (html.split('id="annual-rate-table"')[1] || '').split('</table>')[0];
        const rows = Array.from(block.matchAll(/<td>([^<]+)<\/td><td class="num">([\d.]+)%<\/td><td class="num">([\d,]+)<\/td>/g))
            .map((m) => ({ pct: Number(m[2]), deduction: Number(m[3].replace(/,/g, '')) }));
        expect(rows.length).toBe(window.comprehensiveTaxRates.length);
        rows.forEach((row, i) => {
            expect(row.pct).toBeCloseTo(window.comprehensiveTaxRates[i].rate * 100, 6);
            expect(row.deduction).toBe(window.comprehensiveTaxRates[i].deduction);
        });
    });

    test('页面静态示例表与六行示例数字可读（1800/4440/17400、3630/11890/20090）', () => {
        ['>180000.00<', '>90000.00<', '>30000.00<', '>1800.00<',
            '>100000.00<', '>40000.00<', '>4440.00<',
            '>120000.00<', '>60000.00<', '>17400.00<',
            '>2000.00<', '>3000.00<', '>3630.00<',
            '>5000.00<', '>11890.00<',
            '>3333.33<', '>6333.33<', '>20090.00<'].forEach((n) => {
            expect(html).toContain(n);
        });
    });

    test('页面三套口径对照表写明区别：分摊 / 只定档 / 3 倍社平免税只属于离职补偿', () => {
        const block = (html.split('id="compare-table"')[1] || '').split('</table>')[0];
        expect(block).toContain('真分摊');
        expect(block).toContain('只定档');
        expect(block).toContain('3 倍');
        expect(block).toContain('不分摊');
        expect(html).toContain('只适用于与用人单位解除劳动关系取得的一次性补偿收入');
        expect(html).toContain('平均只为定档');
    });

    test('页面含 canonical / FAQPage 结构化数据、政策文号、同源脚本与 CTA 归因参数', () => {
        expect(html).toContain('rel="canonical" href="https://euriskotax.zeabur.app/seo/early-retirement.html"');
        expect(html).toContain('FAQPage');
        expect(html).toContain('财税〔2018〕164 号');
        expect(html).toContain('国税发〔1999〕58 号');
        expect(html).toContain('/src/js/calculation/tax-constants.js');
        expect(html).toContain('/src/js/calculation/tax-registry.js');
        expect(html).toContain('/src/js/calculation/bonus-tax-quick.js');
        expect(html).toContain('/src/js/calculation/early-retirement-quick.js');
        expect(html).toContain('?source=seo_earlyretire');
    });
});
