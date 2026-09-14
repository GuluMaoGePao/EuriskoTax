// 解除劳动关系一次性补偿收入轻量实现与内核的等价性测试（阶段15 15A-3）
//
// 对拍对象：tax-calculator.js#calculateTaxByTaxableIncome —— App 用年度综合所得税率表计税的真源。
//   「超过 3 倍社平工资的部分，不并入当年综合所得、单独适用综合所得税率表」这句话落在代码上，就是
//     severance-quick.taxSeparateOf(x) ≡ 内核 calculateTaxByTaxableIncome(x).tax
//   在档位分界点（36000 / 144000 / 300000 / 420000 / 660000 / 960000）及其 ±1 元、档内采样、
//   极值与非法输入上逐点比对 —— 两边同一张表、同一条定档规则，就必须完全相等。
//
// 另有三件「算法对拍抓不到、但错了就会慢慢误导人」的事，也在这里钉住：
//   ① 免税额度只认「当地上年职工**年平均工资 × 3**」，且只能抵符合法定标准的补偿；
//   ② 「12 年」是《劳动合同法》对经济补偿金本身的封顶，不是计税方法 ——
//      国税发〔1999〕178 号的「÷ 工作年限平均」做法已不再执行，页面必须写明、且不得再按年限平均；
//   ③ 这是一项长期政策（注册表 expiresOn 为 null），页面不得写成「执行至 2027 年 12 月 31 日」。
const fs = require('fs');
const path = require('path');
const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/tax-calculator.js');
    loadSource('src/js/calculation/tax-registry.js');
    loadSource('src/js/calculation/severance-quick.js');
});

const html = fs.readFileSync(path.join(__dirname, '..', 'seo', 'severance.html'), 'utf8');
const BOUNDARIES = [36000, 144000, 300000, 420000, 660000, 960000];
const SAMPLES = [0, 1, 1000, 36000, 36001, 143999, 144000, 200000, 299999, 500000, 960001, 5000000];

// 已公开的官方口径案例（税屋刊载的实务案例），用来钉住「免税额度只能抵法定补偿」这条规则：
//   案例① 经济补偿金 12 万 + 医疗补助 10 万，当地上年社平 5 万，月薪 6000，工龄 20 年
//          → 法定经济补偿上限 6000×12=7.2 万，免税 15 万，应纳税所得额 7 万，税 4480 元
//   案例② 经济补偿金 28 万，当地上年社平 5 万，月薪 2 万，工龄 14 年
//          → 月工资封顶 12500、年限封顶 12 → 法定上限 15 万，免税 15 万，应纳税所得额 13 万，税 10480 元
const CASE_LEGAL_CAP = { economic: 120000, other: 100000, avgWage: 50000, monthlyWage: 6000, years: 20 };
const CASE_WAGE_CAP = { economic: 280000, other: 0, avgWage: 50000, monthlyWage: 20000, years: 14 };

describe('一次性补偿：口径来源单一（常量 + 注册表）', () => {
    test('税率表与规则来自注册表声明的全局量（不复制第二份）', () => {
        expect(window.EuriskoSeveranceQuick).toBeDefined();
        const params = window.EuriskoTaxRegistry.resolveParams('severance');
        expect(params.rates).toBe(window.comprehensiveTaxRates);
        expect(params.rules).toBe(window.severanceRules);
        expect(window.EuriskoSeveranceQuick.rateTable()).toBe(window.comprehensiveTaxRates);
    });

    test('规则字段齐全：不减除费用、不并入综合所得、不按年限平均、免税额度按 3 倍社平', () => {
        const rules = window.EuriskoSeveranceQuick.rules();
        expect(rules.rateTable).toBe('comprehensiveTaxRates');
        expect(rules.exemptMultipleOfAverageWage).toBe(3);
        expect(rules.capYears).toBe(12);
        expect(rules.capMonthlyWageMultiple).toBe(3);
        expect(rules.noDeduction).toBe(true);
        expect(rules.notMergedIntoComprehensive).toBe(true);
        expect(rules.noAveraging).toBe(true);
    });

    test('长期政策：注册表无到期日，页面不得写成「执行至 2027 年 12 月 31 日」', () => {
        const tax = window.EuriskoTaxRegistry.get('severance');
        expect(tax).toBeDefined();
        expect(tax.expiresOn).toBeNull();
        const status = window.EuriskoTaxRegistry.statusOf('severance');
        expect(status.expired).toBe(false);
        expect(status.daysLeft).toBeNull();
        expect(html.includes('执行至 2027 年 12 月 31 日')).toBe(false);
    });

    test('页面必须写明「平均法已不再执行」，避免照抄旧算法', () => {
        expect(html.includes('国税发〔1999〕178 号')).toBe(true);
        expect(html.includes('不再执行')).toBe(true);
        expect(html.includes('不并入当年综合所得')).toBe(true);
    });
});

describe('一次性补偿：与内核对拍（同一张年度税率表）', () => {
    test('档位分界点及其 ±1 元：税额与内核完全相等', () => {
        BOUNDARIES.forEach((line) => {
            [line - 1, line, line + 1].forEach((amount) => {
                const kernel = window.calculateTaxByTaxableIncome(amount).tax;
                expect({ amount, quick: window.EuriskoSeveranceQuick.taxSeparateOf(amount) })
                    .toEqual({ amount, quick: kernel });
            });
        });
    });

    test('档内采样与极值：与内核完全相等，且不会出现负税', () => {
        SAMPLES.forEach((amount) => {
            const kernel = window.calculateTaxByTaxableIncome(amount).tax;
            expect(window.EuriskoSeveranceQuick.taxSeparateOf(amount)).toBe(kernel);
        });
        expect(window.EuriskoSeveranceQuick.taxSeparateOf(0)).toBe(0);
        expect(window.EuriskoSeveranceQuick.taxSeparateOf(-5000)).toBe(0);
        expect(window.EuriskoSeveranceQuick.taxSeparateOf(Number.NaN)).toBe(0);
        expect(window.EuriskoSeveranceQuick.taxSeparateOf(undefined)).toBe(0);
    });

    test('定档与内核一致：税率、速算扣除数取同一档', () => {
        // 内核对 ≤0 直接短路返回 {0,0,0}（不是「第一档」），这是它的保护分支，不是定档结果；
        // 页面在 taxable 为 0 时只展示税额 0，所以这里对正数逐点比对定档、对 0 只比对税额。
        SAMPLES.filter((a) => a > 0).forEach((amount) => {
            const k = window.calculateTaxByTaxableIncome(amount);
            const b = window.EuriskoSeveranceQuick.bracketOf(amount);
            expect({ amount, rate: b.rate, deduction: b.deduction }).toEqual({ amount, rate: k.rate, deduction: k.deduction });
        });
        expect(window.EuriskoSeveranceQuick.taxSeparateOf(0)).toBe(window.calculateTaxByTaxableIncome(0).tax);
    });
});

describe('一次性补偿：免税额度（3 倍社平工资）', () => {
    test('补偿不超过 3 倍社平工资时全额免税；超出 1 元即按 3% 起算', () => {
        const justUnder = window.EuriskoSeveranceQuick.compareOf({ economic: 150000, other: 0, avgWage: 50000 });
        expect(justUnder.exemptCap).toBe(150000);
        expect(justUnder.taxable).toBe(0);
        expect(justUnder.tax).toBe(0);

        const justOver = window.EuriskoSeveranceQuick.compareOf({ economic: 150001, other: 0, avgWage: 50000 });
        expect(justOver.exemptUsed).toBe(150000);
        expect(justOver.taxable).toBe(1);
        expect(justOver.tax).toBe(0.03);
    });

    test('未填社平工资时无法定免税额度，全额计税而非静默免税', () => {
        const r = window.EuriskoSeveranceQuick.compareOf({ economic: 100000, other: 0 });
        expect(r.exemptCap).toBe(0);
        expect(r.taxable).toBe(100000);
        expect(r.tax).toBe(100000 * 0.1 - 2520);
    });
});

describe('一次性补偿：12 年 / 3 倍月工资的封顶（只管补偿本身，不是计税方法）', () => {
    test('工龄超过 12 年按 12 年、月工资超过 3 倍社平按 3 倍计', () => {
        const cap = window.EuriskoSeveranceQuick.legalCapOf(CASE_WAGE_CAP);
        expect(cap.cappedYears).toBe(12);
        expect(cap.cappedMonthlyWage).toBe(12500);
        expect(cap.amount).toBe(150000);
    });

    test('缺社平工资或月工资时不校验法定上限（返回 null，全额视为符合法定标准）', () => {
        expect(window.EuriskoSeveranceQuick.legalCapOf({ avgWage: 50000 })).toBeNull();
        expect(window.EuriskoSeveranceQuick.legalCapOf({ monthlyWage: 20000 })).toBeNull();
        const r = window.EuriskoSeveranceQuick.compareOf({ economic: 80000, other: 0, avgWage: 50000 });
        expect(r.legalCap).toBeNull();
        expect(r.overLegal).toBe(0);
        expect(r.exemptUsed).toBe(80000);
    });

    test('公开案例①：法定经济补偿 7.2 万 + 医疗补助 10 万 → 应纳税所得额 7 万、税 4480 元', () => {
        const r = window.EuriskoSeveranceQuick.compareOf(CASE_LEGAL_CAP);
        expect(r.legalCap).toBe(72000);
        expect(r.legalPart).toBe(172000);
        expect(r.overLegal).toBe(48000);
        expect(r.exemptUsed).toBe(150000);
        expect(r.taxable).toBe(70000);
        expect(r.rate).toBe(0.1);
        expect(Math.round(r.tax)).toBe(4480);
    });

    test('公开案例②：月工资与年限双封顶 → 应纳税所得额 13 万、税 10480 元', () => {
        const r = window.EuriskoSeveranceQuick.compareOf(CASE_WAGE_CAP);
        expect(r.legalCap).toBe(150000);
        expect(r.overLegal).toBe(130000);
        expect(r.taxable).toBe(130000);
        expect(Math.round(r.tax)).toBe(10480);
    });

    test('超出法定标准发放的部分不享受免税（全额并入应纳税所得额）', () => {
        // 同样 30 万补偿，但法定上限只有 15 万：免税额度再高也只能抵 15 万
        const r = window.EuriskoSeveranceQuick.compareOf({ economic: 300000, other: 0, avgWage: 50000, monthlyWage: 20000, years: 14 });
        expect(r.legalPart).toBe(150000);
        expect(r.overLegal).toBe(150000);
        expect(r.exemptUsed).toBe(150000);
        expect(r.taxable).toBe(150000);
        expect(Math.round(r.tax)).toBe(150000 * 0.2 - 16920);
    });
});

describe('一次性补偿：口径对照与非法输入', () => {
    test('现行政策下「不并入」不会比「并入」更贵（并入只作对照）', () => {
        const grid = [0, 50000, 150000, 400000, 900000];
        grid.forEach((amount) => {
            [0, 30000, 120000].forEach((otherTaxable) => {
                const r = window.EuriskoSeveranceQuick.compareOf({
                    economic: amount, other: 0, avgWage: 50000, otherTaxable
                });
                expect(r.separateTotal).toBeLessThanOrEqual(r.mergedTotal + 1e-9);
                expect(r.gap).toBeGreaterThanOrEqual(-1e-9);
            });
        });
    });

    test('公开案例②在「并入」对照下的三个数字都被页面呈现', () => {
        const r = window.EuriskoSeveranceQuick.compareOf(Object.assign({}, CASE_WAGE_CAP, { otherTaxable: 100000 }));
        expect(Math.round(r.tax)).toBe(10480);
        expect(Math.round(r.otherTax)).toBe(7480);
        expect(Math.round(r.separateTotal)).toBe(17960);
        expect(Math.round(r.mergedTotal)).toBe(29080);
        expect(Math.round(r.gap)).toBe(11120);
        expect(r.direction).toBe('separate-cheaper');
        expect(html).toContain('>17960.00<');
        expect(html).toContain('>29080.00<');
        expect(html).toContain('>11120.00<');
    });

    test('示例表数字由模块算出（改口径则本测试与门禁同时红）', () => {
        const q = window.EuriskoSeveranceQuick;
        const cases = [
            { economic: 60000, other: 0, avgWage: 50000, monthlyWage: 6000, years: 10 },
            CASE_LEGAL_CAP,
            CASE_WAGE_CAP
        ];
        cases.forEach((c) => {
            const r = q.compareOf(c);
            expect(html).toContain('>' + r.amount.toFixed(2) + '<');
            expect(html).toContain('>' + r.taxable.toFixed(2) + '<');
            expect(html).toContain('>' + r.tax.toFixed(2) + '<');
        });
    });

    test('入参非法时钳制为 0，不出现 NaN 或负税', () => {
        const r = window.EuriskoSeveranceQuick.compareOf({ economic: -10000, other: Number.NaN, avgWage: -1, years: -5, monthlyWage: 'abc' });
        expect(r.amount).toBe(0);
        expect(r.taxable).toBe(0);
        expect(r.tax).toBe(0);
        expect(Number.isFinite(r.effectiveRate)).toBe(true);
        expect(r.effectiveRate).toBe(0);
    });

    test('页面静态表逐档对账：7 档年度税率表与常量完全一致', () => {
        // 页面只呈现、不拥有数字：税率与速算扣除数必须逐档等于 comprehensiveTaxRates
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
});
