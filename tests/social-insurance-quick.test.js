// 社保公积金（五险一金）轻量实现与常量 / 注册表 / 内核的等价性测试（阶段15 15C-1）
//
// 对拍对象：
//   · 费率与基数规则 —— tax-constants.js#socialInsuranceRules（出厂基线，可被运营热改）；
//   · 到手工资 —— 内核 tax-calculator.js#calculateCumulativePrepaidTax 与 salary-tax-quick.js
//     （社保页自己不写第二份累计预扣，改了税率表这里会红）；
//   · 缴费基数 —— 60% 保底 / 300% 封顶（这一条算法对拍抓不到，只能由用例显式钉住）。
//
// 另有三件「算法对拍抓不到、但错了就会慢慢误导人」的事，也在这里钉住：
//   ① 规则必须来自常量 + 注册表（页面不维护第二份费率）；
//   ② 工伤、生育**个人不缴**（算到手工资时扣掉就多扣了）；
//   ③ 公积金只有「12% 且基数 ≤ 社平 3 倍」的部分免税，超出部分并回工资计税（财税〔2006〕10 号）。
const fs = require('fs');
const path = require('path');
const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/tax-registry.js');
    loadSource('src/js/calculation/tax-calculator.js');
    loadSource('src/js/calculation/salary-tax-quick.js');
    loadSource('src/js/calculation/social-insurance-quick.js');
});

const html = fs.readFileSync(path.join(__dirname, '..', 'seo', 'social-base.html'), 'utf8');

// 统一口径：社平工资 8000 → 下限 4800（60%）、上限 24000（300%）
const AVG = 8000;
const pct = (rate) => String(Math.round(rate * 1000) / 10);

describe('社保公积金：口径来源单一（常量 + 注册表）', () => {
    test('规则来自注册表声明的全局量（不复制第二份）', () => {
        expect(window.EuriskoSocialQuick).toBeDefined();
        expect(window.EuriskoTaxRegistry.resolveParams('social-insurance').rules).toBe(window.socialInsuranceRules);
        expect(window.EuriskoTaxRegistry.resolveParams('housing-fund').rules).toBe(window.socialInsuranceRules);
        expect(window.EuriskoSocialQuick.rules()).toBe(window.socialInsuranceRules);
    });

    test('五项费率：养老 8/16、医疗 2/9.8、失业 0.5/0.5、工伤与生育个人不缴', () => {
        const rules = window.EuriskoSocialQuick.rules();
        const of = (key) => rules.items.find((i) => i.key === key);
        expect(of('pension').personalRate).toBe(0.08);
        expect(of('pension').employerRate).toBe(0.16);
        expect(of('medical').personalRate).toBe(0.02);
        expect(of('unemployment').personalRate).toBe(0.005);
        expect(of('unemployment').employerRate).toBe(0.005);
        expect(of('injury').personalRate).toBe(0);
        expect(of('maternity').personalRate).toBe(0);
        // 个人实际承担：养老 8% + 医疗 2% + 失业 0.5% = 10.5%
        expect(rules.items.reduce((s, i) => s + i.personalRate, 0)).toBeCloseTo(0.105, 10);
    });

    test('缴费基数：60% 保底 / 300% 封顶；公积金 5%~12% 且免税上限 12% 与社平 3 倍', () => {
        const rules = window.EuriskoSocialQuick.rules();
        expect(rules.base.lowerRatio).toBe(0.6);
        expect(rules.base.upperRatio).toBe(3);
        expect(rules.housingFund.minRate).toBe(0.05);
        expect(rules.housingFund.maxRate).toBe(0.12);
        expect(rules.housingFund.taxFreeRateCap).toBe(0.12);
        expect(rules.housingFund.taxFreeBaseCapRatio).toBe(3);
        // 起征点与工资薪金累计预扣同源
        expect(rules.basicDeduction).toBe(window.EuriskoSalaryQuick.BASIC_DEDUCTION);
    });

    test('注册表登记两条：社会保险法 / 公积金管理条例，均长期有效', () => {
        const social = window.EuriskoTaxRegistry.get('social-insurance');
        expect(social.category).toBe('social');
        expect(social.expiresOn).toBeNull();
        expect(social.page).toBe('/seo/social-base.html');
        expect(window.EuriskoTaxRegistry.basisOf('social-insurance').some((b) => b.doc.includes('主席令第 35 号'))).toBe(true);
        expect(window.EuriskoTaxRegistry.basisOf('social-insurance').some((b) => b.doc.includes('国办发〔2019〕13 号'))).toBe(true);

        const fund = window.EuriskoTaxRegistry.get('housing-fund');
        expect(fund.category).toBe('social');
        expect(fund.expiresOn).toBeNull();
        expect(window.EuriskoTaxRegistry.basisOf('housing-fund').some((b) => b.doc.includes('国务院令第 262 号'))).toBe(true);
        expect(window.EuriskoTaxRegistry.basisOf('housing-fund').some((b) => b.doc.includes('财税〔2006〕10 号'))).toBe(true);
    });
});

describe('缴费基数：不是工资，60% 保底 / 300% 封顶', () => {
    test('工资 4000 低于下限 4800 → 按 4800 保底', () => {
        const b = window.EuriskoSocialQuick.baseOf({ wage: 4000, socialAverage: AVG });
        expect(b.min).toBeCloseTo(4800, 6);
        expect(b.max).toBeCloseTo(24000, 6);
        expect(b.base).toBeCloseTo(4800, 6);
        expect(b.clamped).toBe('below');
    });

    test('工资 50000 高于上限 24000 → 按 24000 封顶（与 24000 工资缴得一样多）', () => {
        const b = window.EuriskoSocialQuick.baseOf({ wage: 50000, socialAverage: AVG });
        expect(b.base).toBeCloseTo(24000, 6);
        expect(b.clamped).toBe('above');
        const r1 = window.EuriskoSocialQuick.socialInsuranceOf({ wage: 50000, socialAverage: AVG, housingRate: 0.12 });
        const r2 = window.EuriskoSocialQuick.socialInsuranceOf({ wage: 24000, socialAverage: AVG, housingRate: 0.12 });
        expect(r1.personalInsurance).toBe(r2.personalInsurance);
        expect(r1.employerInsurance).toBe(r2.employerInsurance);
    });

    test('区间内按本人工资：10000 → 10000', () => {
        const b = window.EuriskoSocialQuick.baseOf({ wage: 10000, socialAverage: AVG });
        expect(b.base).toBeCloseTo(10000, 6);
        expect(b.clamped).toBe('within');
    });

    test('社平工资未填时不夹限（按本人工资原样），非法输入按 0 处理', () => {
        expect(window.EuriskoSocialQuick.baseOf({ wage: 10000 }).base).toBeCloseTo(10000, 6);
        const r = window.EuriskoSocialQuick.socialInsuranceOf({ wage: 'abc', socialAverage: -1, housingRate: 0.12 });
        expect(r.wage).toBe(0);
        expect(r.base).toBe(0);
        expect(r.personalTotal).toBe(0);
    });
});

describe('五险一金：个人与单位分项', () => {
    test('工资 10000 / 社平 8000 / 公积金 12%：个人 1050 + 1200 = 2250，单位 2750 + 1200 = 3950', () => {
        const r = window.EuriskoSocialQuick.socialInsuranceOf({ wage: 10000, socialAverage: AVG, housingRate: 0.12 });
        expect(r.base).toBeCloseTo(10000, 6);
        expect(r.personalInsurance).toBeCloseTo(1050, 6);   // 10000 × 10.5%
        expect(r.housingPersonal).toBeCloseTo(1200, 6);
        expect(r.personalTotal).toBeCloseTo(2250, 6);
        expect(r.employerInsurance).toBeCloseTo(2750, 6);   // 10000 × 27.5%
        expect(r.employerTotal).toBeCloseTo(3950, 6);
        expect(r.personalRate).toBeCloseTo(0.225, 10);
    });

    test('工伤与生育个人不缴：合计只含养老 8% + 医疗 2% + 失业 0.5%', () => {
        const r = window.EuriskoSocialQuick.socialInsuranceOf({ wage: 20000, socialAverage: AVG, housingRate: 0.12 });
        const of = (key) => r.items.find((i) => i.key === key);
        expect(of('injury').personal).toBe(0);
        expect(of('maternity').personal).toBe(0);
        expect(of('injury').employer).toBeCloseTo(80, 6);      // 20000 × 0.4%
        expect(of('maternity').employer).toBeCloseTo(160, 6);  // 20000 × 0.8%
        expect(r.personalInsurance).toBeCloseTo(2100, 6);      // 20000 × 10.5%
    });

    test('公积金比例夹在 5%~12%：填 3% 按 5%、填 20% 按 12%', () => {
        const q = window.EuriskoSocialQuick;
        const low = q.socialInsuranceOf({ wage: 10000, socialAverage: AVG, housingRate: 0.03 });
        expect(low.housingRate).toBe(0.05);
        expect(low.housingPersonal).toBeCloseTo(500, 6);
        const high = q.socialInsuranceOf({ wage: 10000, socialAverage: AVG, housingRate: 0.2 });
        expect(high.housingRate).toBe(0.12);
        expect(high.housingPersonal).toBeCloseTo(1200, 6);
        // 非法输入退回默认 12%
        expect(q.socialInsuranceOf({ wage: 10000, socialAverage: AVG }).housingPersonal).toBeCloseTo(1200, 6);
    });

    test('单位费率可按当地口径覆盖（医疗 / 工伤 / 生育各地不同）', () => {
        const r = window.EuriskoSocialQuick.socialInsuranceOf({
            wage: 10000,
            socialAverage: AVG,
            housingRate: 0.12,
            employerRates: { medical: 0.06, injury: 0.002, maternity: 0.005 }
        });
        const of = (key) => r.items.find((i) => i.key === key);
        expect(of('medical').employer).toBeCloseTo(600, 6);
        expect(of('injury').employer).toBeCloseTo(20, 6);
        expect(of('maternity').employer).toBeCloseTo(50, 6);
        expect(r.employerInsurance).toBeCloseTo(10000 * (0.16 + 0.06 + 0.005 + 0.002 + 0.005), 6);
    });

    test('公积金免税：12% 与社平 3 倍以内全额免税；超出部分并回工资计税', () => {
        const q = window.EuriskoSocialQuick;
        const normal = q.socialInsuranceOf({ wage: 10000, socialAverage: AVG, housingRate: 0.12 });
        expect(normal.housingTaxFree).toBeCloseTo(1200, 6);
        expect(normal.housingTaxable).toBe(0);
        // 缴存基数高于社平 3 倍（部分地区公积金上下限口径与社保不同）：只有 12% × 24000 免税
        const over = q.socialInsuranceOf({ wage: 100000, socialAverage: AVG, housingRate: 0.12, housingBase: 100000 });
        expect(over.housingPersonal).toBeCloseTo(12000, 6);
        expect(over.housingTaxFree).toBeCloseTo(2880, 6);
        expect(over.housingTaxable).toBeCloseTo(9120, 6);
    });
});

describe('到手工资：与内核 / 工资薪金累计预扣同源', () => {
    test('工资 10000 / 专项 1000：全年个税 630，到手全年 92370', () => {
        const r = window.EuriskoSocialQuick.netSalaryOf({
            wage: 10000, socialAverage: AVG, housingRate: 0.12, specialMonthly: 1000
        });
        expect(r.monthlyTaxable).toBeCloseTo(1750, 6);      // 10000 − 5000 − 1050 − 1200 − 1000
        expect(r.tax1).toBeCloseTo(52.5, 6);
        expect(r.annualTax).toBeCloseTo(630, 6);
        expect(r.net1).toBeCloseTo(7697.5, 6);
        expect(r.annualNet).toBeCloseTo(92370, 6);
    });

    test('累计预扣：档位爬升后到手逐月变少（20000 → 首月 15215、之后 14550）', () => {
        const r = window.EuriskoSocialQuick.netSalaryOf({
            wage: 20000, socialAverage: AVG, housingRate: 0.12, specialMonthly: 1000
        });
        expect(r.tax1).toBeCloseTo(285, 6);
        expect(r.tax6).toBeCloseTo(950, 6);
        expect(r.annualTax).toBeCloseTo(8880, 6);
        expect(r.net1).toBeCloseTo(15215, 6);
        expect(r.net12).toBeCloseTo(14550, 6);
        expect(r.net1).toBeGreaterThan(r.net12);
    });

    test('封顶后工资 50000：首月 43260 → 12 月 33020（累计档位 45%）', () => {
        const r = window.EuriskoSocialQuick.netSalaryOf({
            wage: 50000, socialAverage: AVG, housingRate: 0.12, specialMonthly: 1000
        });
        expect(r.net1).toBeCloseTo(43260, 6);
        expect(r.net12).toBeCloseTo(33020, 6);
        expect(r.annualTax).toBeCloseTo(86040, 6);
    });

    test('保底档工资 4000：应纳税所得额为 0，全年不交个税', () => {
        const r = window.EuriskoSocialQuick.netSalaryOf({
            wage: 4000, socialAverage: AVG, housingRate: 0.12, specialMonthly: 1000
        });
        expect(r.monthlyTaxable).toBe(0);
        expect(r.annualTax).toBe(0);
        expect(r.net1).toBeCloseTo(2920, 6);
    });

    test('与内核 calculateCumulativePrepaidTax 逐月对拍（分界点 ±0.01、多个月数）', () => {
        const quick = window.EuriskoSocialQuick;
        const core = window.calculateCumulativePrepaidTax;
        const cases = [];
        [1, 2, 6, 7, 11, 12].forEach((months) => {
            [3000, 12000, 25000, 35000, 55000, 80000].forEach((T) => {
                [-0.01, 0, 0.01].forEach((delta) => {
                    cases.push({ months, taxable: T + delta });
                });
            });
        });
        const diff = cases.filter((c) => {
            const schedule = quick.scheduleOf(c.taxable, c.months, window.comprehensiveTaxRates);
            let prev = 0;
            let coreLast = 0;
            for (let k = 1; k <= c.months; k++) {
                // 内核只接受固定月度值：把「每月应纳税所得额」换算成月薪后逐月取累计
                const cumulative = core(k, c.taxable + 5000, 5000, 0, 0, 0, 0, 0, 0);
                coreLast = cumulative - prev;
                prev = cumulative;
            }
            return Math.abs(schedule[c.months - 1] - coreLast) > 0.01;
        });
        expect(diff).toEqual([]);
    });

    test('与 salary-tax-quick 同口径：五险一金作为扣除项时结果一致', () => {
        const quick = window.EuriskoSocialQuick;
        const salary = window.EuriskoSalaryQuick;
        const r = quick.netSalaryOf({ wage: 20000, socialAverage: AVG, housingRate: 0.12, specialMonthly: 2000 });
        const deduction = r.personalTotal; // 本例公积金全额免税，个人扣缴即税前扣除
        expect(r.housingTaxable).toBe(0);
        [1, 6, 12].forEach((m) => {
            const schedule = salary.monthlyScheduleOf(20000, m, deduction, 2000);
            expect(r.schedule[m - 1]).toBeCloseTo(schedule[m - 1], 6);
        });
    });

    test('非法输入按 0 处理：不报错、不产生负数', () => {
        const r = window.EuriskoSocialQuick.netSalaryOf({
            wage: 'abc', socialAverage: AVG, housingRate: 0.12, specialMonthly: -100
        });
        expect(r.wage).toBe(0);
        expect(r.annualTax).toBe(0);
        expect(r.annualNet).toBe(0);
    });
});

describe('企业用工成本：工资 + 单位五险一金', () => {
    test('工资 10000 / 公积金 12%：企业月成本 13950（1.395 倍）', () => {
        const r = window.EuriskoSocialQuick.employerCostOf({
            wage: 10000, socialAverage: AVG, housingRate: 0.12, specialMonthly: 1000, headcount: 1
        });
        expect(r.employerTotal).toBeCloseTo(3950, 6);
        expect(r.monthlyPerPerson).toBeCloseTo(13950, 6);
        expect(r.monthly).toBeCloseTo(13950, 6);
        expect(r.annual).toBeCloseTo(167400, 6);
        expect(r.multiple).toBeCloseTo(1.395, 6);
        expect(r.netShare).toBeCloseTo(92370 / 167400, 6);
    });

    test('人数按整数处理：3 人月成本 = 单人 × 3；非法人数按 1 人', () => {
        const q = window.EuriskoSocialQuick;
        const one = q.employerCostOf({ wage: 20000, socialAverage: AVG, housingRate: 0.12, specialMonthly: 1000, headcount: 1 });
        const three = q.employerCostOf({ wage: 20000, socialAverage: AVG, housingRate: 0.12, specialMonthly: 1000, headcount: 3 });
        expect(three.headcount).toBe(3);
        expect(three.monthly).toBeCloseTo(one.monthlyPerPerson * 3, 6);
        expect(one.monthlyPerPerson).toBeCloseTo(27900, 6);
        expect(q.employerCostOf({ wage: 20000, socialAverage: AVG, headcount: 'abc' }).headcount).toBe(1);
    });
});

describe('社保公积金落地页：静态口径与页面声明（爬虫不执行 JS 也能读全）', () => {
    test('页面静态费率表与常量逐项一致（个人 / 单位两列）', () => {
        const block = (html.split('id="social-rate-table"')[1] || '').split('</table>')[0];
        const rules = window.EuriskoSocialQuick.rules();
        rules.items.forEach((item) => {
            expect(block).toContain(item.name);
            const personal = item.personalRate > 0 ? pct(item.personalRate) + '%' : '不缴';
            expect(block).toContain('>' + personal + '<');
            expect(block).toContain('>' + pct(item.employerRate) + '%<');
        });
        // 公积金一行：比例区间与免税上限
        expect(block).toContain(rules.housingFund.name);
        expect(block).toContain('5%~12%');
        expect(block).toContain('12%');
    });

    test('页面静态示例表可读（保底 4800/1080/2920、封顶 24000/5400/33020、企业成本 13950）', () => {
        [
            '>4000.00<', '>4800.00<', '>1080.00<', '>2920.00<',
            '>10000.00<', '>2250.00<', '>7697.50<', '>630.00<', '>13950.00<',
            '>20000.00<', '>4500.00<', '>15215.00<', '>14550.00<', '>8880.00<', '>27900.00<',
            '>50000.00<', '>24000.00<', '>5400.00<', '>43260.00<', '>33020.00<', '>86040.00<', '>59480.00<'
        ].forEach((n) => expect(html).toContain(n));
    });

    test('页面写明三条易错口径：60% 保底 300% 封顶、工伤生育不缴与公积金免税上限、累计预扣逐月变少', () => {
        expect(html).toContain('缴费基数不是工资：60% 保底、300% 封顶');
        expect(html).toContain('工伤、生育个人不缴；公积金不是缴多少都免税');
        expect(html).toContain('到手工资逐月变少是累计预扣，企业成本是工资的 1.3~1.4 倍');
        expect(html).toContain('12%');
        expect(html).toContain('45024');
        expect(html).toContain('累计预扣法');
    });

    test('页面含 canonical / FAQPage 结构化数据、政策文号、同源脚本与 CTA 归因参数', () => {
        expect(html).toContain('rel="canonical" href="https://euriskotax.zeabur.app/seo/social-base.html"');
        expect(html).toContain('FAQPage');
        expect(html).toContain('主席令第 35 号');
        expect(html).toContain('国务院令第 262 号');
        expect(html).toContain('国办发〔2019〕13 号');
        expect(html).toContain('财税〔2006〕10 号');
        expect(html).toContain('/src/js/calculation/tax-constants.js');
        expect(html).toContain('/src/js/calculation/tax-registry.js');
        expect(html).toContain('/src/js/calculation/social-insurance-quick.js');
        expect(html).toContain('?source=seo_social');
    });
});
