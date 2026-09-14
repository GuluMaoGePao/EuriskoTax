// 股权激励个税轻量实现与内核的等价性测试（阶段15 15A-2）
//
// 对拍对象：tax-calculator.js#calculateTaxByTaxableIncome —— App 用年度综合所得税率表计税的真源。
//   股权激励「全额单独适用综合所得税率表」这句话落在代码上，就是
//     equity-quick.taxSeparateOf(x) ≡ 内核 calculateTaxByTaxableIncome(x)
//   所以这里在档位分界点（36000 / 144000 / 300000 / 420000 / 660000 / 960000）及其 ±1 元、
//   档内采样、极值与非法输入上逐点比对 —— 只要两边用的是同一张表与同一条定档规则，就必须完全相等。
//
// 另有两件「算法对拍抓不到、但错了就会慢慢误导人」的事，也在这里钉住：
//   ① 四种激励的「股权激励收入」公式（页面正文与常量里的描述必须一致）；
//   ② 政策到期日 2027-12-31：页面上那句「执行至 2027 年 12 月 31 日」必须来自注册表，
//      不能是手抄的（与 tests/tax-registry.test.js 的年终奖断言同一思路）。
const fs = require('fs');
const path = require('path');
const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/tax-calculator.js');
    loadSource('src/js/calculation/tax-registry.js');
    loadSource('src/js/calculation/equity-incentive-quick.js');
});

const html = fs.readFileSync(path.join(__dirname, '..', 'seo', 'equity-incentive.html'), 'utf8');
const BOUNDARIES = [36000, 144000, 300000, 420000, 660000, 960000];
const SAMPLES = [0, 1, 1000, 36000, 36001, 143999, 144000, 200000, 299999, 500000, 960001, 5000000];

describe('股权激励：口径来源单一（常量 + 注册表）', () => {
    test('税率表与规则来自注册表声明的全局量（不复制第二份）', () => {
        expect(window.EuriskoEquityQuick).toBeDefined();
        const params = window.EuriskoTaxRegistry.resolveParams('equity-incentive');
        expect(params.rates).toBe(window.comprehensiveTaxRates);
        expect(params.rules).toBe(window.equityIncentiveRules);
        expect(window.EuriskoEquityQuick.rateTable()).toBe(window.comprehensiveTaxRates);
    });

    test('规则字段齐全：不减除费用、同年内合并、有到期日、四种激励都有公式', () => {
        const rules = window.EuriskoEquityQuick.rules();
        expect(rules.noDeduction).toBe(true);
        expect(rules.combineWithinYear).toBe(true);
        expect(rules.expiresOn).toBe('2027-12-31');
        window.EuriskoEquityQuick.TYPES.forEach((t) => {
            expect(typeof rules.types[t].name).toBe('string');
            expect(typeof rules.types[t].formula).toBe('string');
        });
        // 页面正文必须把四种公式都呈现出来（不能只讲股票期权一种）
        window.EuriskoEquityQuick.TYPES.forEach((t) => {
            expect({ type: t, inPage: html.includes(rules.types[t].formula) }).toEqual({ type: t, inPage: true });
        });
    });
});

describe('股权激励收入（四种类型的公式）', () => {
    const q = () => window.EuriskoEquityQuick;

    test('股票期权 / 股票增值权 / 股权奖励：（价差）× 数量', () => {
        expect(q().incomeOf('option', { qty: 10000, price: 15, cost: 5 })).toBe(100000);
        expect(q().incomeOf('appreciation', { qty: 50000, price: 20, cost: 8 })).toBe(600000);
        expect(q().incomeOf('award', { qty: 10000, price: 8, cost: 0 })).toBe(80000);
    });

    test('限制性股票：（登记日市价 + 解禁日市价）÷ 2 × 份数 − 出资额', () => {
        expect(q().incomeOf('restricted', { qty: 20000, grantPrice: 10, price: 20, cost: 5 })).toBe(200000);
        // 只给解禁日价格（漏填登记日）时按「解禁日价的一半 − 出资」计，不得静默按 0 算
        expect(q().incomeOf('restricted', { qty: 1000, price: 20, cost: 5 })).toBe(5000);
    });

    test('价差为负或入参非法时钳制为 0（不出现负税）', () => {
        expect(q().incomeOf('option', { qty: 1000, price: 5, cost: 15 })).toBe(0);
        expect(q().incomeOf('option', { qty: -100, price: 15, cost: 5 })).toBe(0);
        expect(q().incomeOf('option', { qty: 'abc', price: 15, cost: 5 })).toBe(0);
        expect(q().incomeOf('not-a-type', { qty: 1000, price: 15, cost: 5 })).toBe(0);
        expect(q().incomeOf('option', null)).toBe(0);
    });
});

describe('单独计税 ≡ 内核按年度税率表计税', () => {
    test('分界点及其 ±1 元、档内采样、极值全部逐点相同', () => {
        const amounts = [];
        BOUNDARIES.forEach((b) => amounts.push(b - 1, b, b + 1));
        amounts.push(...SAMPLES);
        const diff = [];
        amounts.forEach((a) => {
            const quick = window.EuriskoEquityQuick.taxSeparateOf(a);
            const core = calculateTaxByTaxableIncome(a).tax;
            if (quick !== core) diff.push({ amount: a, quick, core });
        });
        expect(diff).toEqual([]);
    });

    test('命中的税率档与内核一致（税率与速算扣除数都对得上）', () => {
        BOUNDARIES.forEach((b) => {
            [b - 1, b, b + 1].forEach((a) => {
                const qb = window.EuriskoEquityQuick.bracketOf(a);
                const core = calculateTaxByTaxableIncome(a);
                expect({ amount: a, rate: qb.rate, deduction: qb.deduction })
                    .toEqual({ amount: a, rate: core.rate, deduction: core.deduction });
            });
        });
    });

    test('不减除费用：同样 10 万元，股权激励税负高于「并入后扣除 6 万元」的综合所得', () => {
        // 单独计税：100000 × 10% − 2520 = 7480
        expect(window.EuriskoEquityQuick.taxSeparateOf(100000)).toBe(7480);
        // 若按综合所得口径先扣 6 万元基本减除：40000 × 10% − 2520 … 只有 1480
        expect(calculateTaxByTaxableIncome(100000 - 60000).tax).toBe(1480);
        expect(window.EuriskoEquityQuick.taxSeparateOf(100000)).toBeGreaterThan(
            calculateTaxByTaxableIncome(100000 - 60000).tax
        );
    });
});

describe('同年内多次激励合并计税', () => {
    const q = () => window.EuriskoEquityQuick;

    test('合并后一次性定档：等于对合计额计税，而不是两次各自计税之和', () => {
        const first = q().incomeOf('option', { qty: 6000, price: 15, cost: 5 });   // 60000
        const second = q().incomeOf('option', { qty: 6000, price: 15, cost: 5 });  // 60000
        const merged = q().taxSeparateOf(first + second);
        const separate = q().taxSeparateOf(first) + q().taxSeparateOf(second);
        expect(first + second).toBe(120000);
        expect(merged).toBe(calculateTaxByTaxableIncome(120000).tax);
        // 合并把基数推到 20% 档，故合并计税 ≥ 分次计税（这是「分次不能避税」的证据）
        expect(merged).toBeGreaterThan(separate);
    });

    test('compareOf 把「本年度已计入」并入计税基数', () => {
        const withYtd = q().compareOf({ type: 'option', qty: 10000, price: 15, cost: 5, ytdIncome: 100000 });
        expect(withYtd.income).toBe(100000);
        expect(withYtd.base).toBe(200000);
        // 合并后落 20% 档：200000 × 20% − 16920 = 23080
        expect(withYtd.separate).toBe(23080);
        expect(withYtd.separate).toBe(q().taxSeparateOf(200000));
    });
});

describe('并入综合所得的对照口径', () => {
    const q = () => window.EuriskoEquityQuick;

    test('otherTaxable = 0 时，并入与单独计税结果相同（差额为 0）', () => {
        const r = q().compareOf({ type: 'option', qty: 10000, price: 15, cost: 5, otherTaxable: 0 });
        expect(r.mergedTotal).toBe(r.separate);
        expect(r.gap).toBe(0);
        expect(r.direction).toBe('持平');
    });

    test('其他综合所得较高时，并入会把全年推到更高档（差额 > 0 表示并入更多交）', () => {
        // 其他 100000 → 7480；激励 100000 → 7480；合计 14960
        // 并入：200000 × 20% − 16920 = 23080，差额 +8120
        const r = q().compareOf({ type: 'option', qty: 10000, price: 15, cost: 5, otherTaxable: 100000 });
        expect(r.otherTax).toBe(7480);
        expect(r.separate).toBe(7480);
        expect(r.separateTotal).toBe(14960);
        expect(r.mergedTotal).toBe(23080);
        expect(r.gap).toBe(8120);
        expect(r.direction).toBe('并入更多交');
        expect(html).toContain('>14960.00<');
        expect(html).toContain('>23080.00<');
        expect(html).toContain('>8120.00<');
    });

    test('并入对照值与内核对拍（同一张年度表、同一条定档规则）', () => {
        const r = q().compareOf({ type: 'restricted', qty: 20000, grantPrice: 10, price: 20, cost: 5, otherTaxable: 50000 });
        expect(r.mergedTotal).toBe(calculateTaxByTaxableIncome(r.base + 50000).tax);
        expect(r.otherTax).toBe(calculateTaxByTaxableIncome(50000).tax);
    });

    test('实际税负率 = 税额 ÷ 计税基数（页面据此展示）', () => {
        const r = q().compareOf({ type: 'option', qty: 10000, price: 15, cost: 5 });
        expect(r.effectiveRate).toBeCloseTo(7480 / 100000, 12);
    });
});

describe('页面静态表与常量/模块逐格对账（页面只呈现、不拥有数字）', () => {
    test('年度税率表与常量文件逐档一致', () => {
        const block = (html.split('id="annual-rate-table"')[1] || '').split('</table>')[0];
        const rows = Array.from(block.matchAll(/<td>([^<]+)<\/td><td class="num">([\d.]+)%<\/td><td class="num">([\d,]+)<\/td>/g))
            .map((m) => ({ pct: Number(m[2]), deduction: Number(m[3].replace(/,/g, '')) }));
        const fromConstants = window.comprehensiveTaxRates.map((r) => ({
            pct: Math.round(r.rate * 1000) / 10,
            deduction: r.deduction
        }));
        expect(rows.length).toBe(7);
        expect(rows).toEqual(fromConstants);
    });

    test('示例表三行数字由模块算出（改口径则本测试与门禁同时红）', () => {
        const q = window.EuriskoEquityQuick;
        const cases = [
            { label: '股票期权', input: { type: 'option', qty: 10000, price: 15, cost: 5 } },
            { label: '限制性股票', input: { type: 'restricted', qty: 20000, grantPrice: 10, price: 20, cost: 5 } },
            { label: '股票增值权', input: { type: 'appreciation', qty: 50000, price: 20, cost: 8 } }
        ];
        cases.forEach((c) => {
            const income = q.incomeOf(c.input.type, c.input);
            const tax = q.taxSeparateOf(income);
            expect({ label: c.label, income, tax }).toEqual({
                label: c.label,
                income: expect.any(Number),
                tax: expect.any(Number)
            });
            expect(html).toContain(`>${income.toFixed(2)}<`);
            expect(html).toContain(`>${tax.toFixed(2)}<`);
        });
    });

    test('页面正文的到期日与注册表一致（不是手抄的 2027 年 12 月 31 日）', () => {
        const item = window.EuriskoTaxRegistry.get('equity-incentive');
        expect(item.expiresOn).toBe('2027-12-31');
        const asChinese = `${item.expiresOn.slice(0, 4)} 年 ${Number(item.expiresOn.slice(5, 7))} 月 ${Number(item.expiresOn.slice(8, 10))} 日`;
        expect(html).toContain(asChinese);
    });

    test('页面脚本只引用同源模块（不内联税率表）', () => {
        ['/src/js/calculation/tax-constants.js', '/src/js/calculation/tax-registry.js',
            '/src/js/data/tax-rates-sync.js', '/src/js/calculation/equity-incentive-quick.js']
            .forEach((src) => expect(html).toContain(src));
    });
});
