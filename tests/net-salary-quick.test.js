// 税后工资 / 谈薪倒算轻量实现与常量 / 注册表 / 正向口径的等价性测试（阶段15 15C-2）
//
// 倒算靠二分逼近，所以这个文件的价值不是「再算一遍同样的公式」，而是验证三件
// **抄公式看不出来**的事：
//   ① 解出来的税前**代回正向**确实能拿到目标到手（反算校验，误差 < 0.01 元）；
//   ② 解是**最小解** —— 少 1 分钱就拿不到目标（否则谈薪时会白让利）；
//   ③ 口径同源：五险一金与个税全部来自 social-insurance-quick / 常量，本文件不复制费率。
//
// 另有三件「算法测不出来、但错了会直接误导谈薪」的事，也在这里钉住：
//   ① 「每月到手 X」有两种口径（全年平均 / 首月），同一句话倒推出的税前能差上千元；
//   ② 到手率**不是常数**（社保公积金 300% 封顶后甚至不降略升），所以不能拿固定比例去除；
//   ③ 涨薪 1000 元 ≠ 到手多 1000 元，要看**边际到手率**。
const fs = require('fs');
const path = require('path');
const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/tax-registry.js');
    loadSource('src/js/calculation/tax-calculator.js');
    loadSource('src/js/calculation/salary-tax-quick.js');
    loadSource('src/js/calculation/social-insurance-quick.js');
    loadSource('src/js/calculation/net-salary-quick.js');
});

const html = fs.readFileSync(path.join(__dirname, '..', 'seo', 'net-salary.html'), 'utf8');

// 统一口径：社平工资 8000 → 下限 4800（60%）、上限 24000（300%）；公积金 12%；专项附加 1000
const BASE = { socialAverage: 8000, housingRate: 0.12, specialMonthly: 1000 };
const input = (target, extra) => Object.assign({}, BASE, { targetMonthly: target }, extra || {});

describe('谈薪倒算：口径来源单一（复用五险一金与累计预扣）', () => {
    test('倒算模块不自带费率：五险一金与个税全部走 social-insurance-quick', () => {
        expect(window.EuriskoNetSalaryQuick).toBeDefined();
        expect(window.EuriskoNetSalaryQuick.solveOf).toBeDefined();
        // 同源验证：倒算结果与正向实现在同一份常量上（注册表声明的全局量）
        expect(window.EuriskoTaxRegistry.resolveParams('social-insurance').rules).toBe(window.socialInsuranceRules);
        expect(window.EuriskoTaxRegistry.resolveParams('comprehensive').rates).toBe(window.comprehensiveTaxRates);
    });

    test('注册表三条：工资薪金累计预扣（长期有效）+ 社会保险 + 住房公积金', () => {
        const w = window.EuriskoTaxRegistry.get('comprehensive');
        expect(w.category).toBe('iit');
        expect(w.expiresOn).toBeNull();
        expect(window.EuriskoTaxRegistry.basisOf('comprehensive').some((b) => b.doc.includes('2018 年第 61 号'))).toBe(true);
        expect(window.EuriskoTaxRegistry.get('social-insurance').expiresOn).toBeNull();
        expect(window.EuriskoTaxRegistry.get('housing-fund').expiresOn).toBeNull();
    });
});

describe('倒算结果：代回正向能拿到目标（反算校验）', () => {
    test('目标月到手 10000（全年口径）→ 税前 13175.62，代回月均到手 10000', () => {
        const r = window.EuriskoNetSalaryQuick.solveOf(input(10000, { mode: 'annual' }));
        expect(r.converged).toBe(true);
        expect(r.gross).toBeCloseTo(13175.62, 2);
        expect(r.monthlyNetAverage).toBeCloseTo(10000, 2);
        expect(r.annualNet).toBeCloseTo(120000, 1);
        expect(r.annualTax).toBeCloseTo(2533.3, 2);
        expect(r.personalTotal).toBeCloseTo(2964.51, 2);
        expect(r.employerMonthly).toBeCloseTo(18379.98, 2);
        // 反算校验：正向重算一遍，误差必须在 1 分钱内
        expect(Math.abs(r.gap)).toBeLessThan(0.01);
    });

    test('多个目标值：解都是「最小解」—— 少 1 分就拿不到目标', () => {
        const quick = window.EuriskoNetSalaryQuick;
        [3000, 5000, 8000, 10000, 15000, 20000, 30000, 50000].forEach((target) => {
            const r = quick.solveOf(input(target, { mode: 'annual' }));
            expect(r.converged).toBe(true);
            const at = quick.monthlyNetAt(r.gross, input(target, { mode: 'annual' }), 'annual');
            const below = quick.monthlyNetAt(r.gross - 0.01, input(target, { mode: 'annual' }), 'annual');
            expect(at).toBeGreaterThanOrEqual(target - 0.01);
            expect(below).toBeLessThan(target);
        });
    });

    test('首月口径：目标 10000 → 税前 13062.86（比全年口径少 112.76）', () => {
        const quick = window.EuriskoNetSalaryQuick;
        const first = quick.solveOf(input(10000, { mode: 'first' }));
        expect(first.gross).toBeCloseTo(13062.86, 2);
        // 到手是「分」位网格上的值：解是最小解，所以只保证 ≥ 目标，误差不超过 1 分
        expect(first.net1).toBeGreaterThanOrEqual(10000);
        expect(first.gap).toBeGreaterThanOrEqual(0);
        expect(first.gap).toBeLessThan(0.02);
        // 首月口径定下来的税前，按全年口径算全年会少拿
        const cmp = quick.compareOf(input(10000));
        expect(cmp.grossGap).toBeCloseTo(112.76, 2);
        expect(Math.abs(cmp.annualNetGap)).toBeCloseTo(943.83, 2);
    });

    test('目标 20000：税前 27137.50 已超封顶线，五险一金固定在 5400', () => {
        const r = window.EuriskoNetSalaryQuick.solveOf(input(20000, { mode: 'annual' }));
        expect(r.gross).toBeCloseTo(27137.5, 2);
        expect(r.gross).toBeGreaterThan(24000);
        expect(r.social.base).toBeCloseTo(24000, 6);
        expect(r.social.clamped).toBe('above');
        expect(r.personalTotal).toBeCloseTo(5400, 6);
        expect(r.annualTax).toBeCloseTo(20850.01, 2);
        expect(r.net1).toBeCloseTo(21265.37, 2);
        expect(r.net12).toBeCloseTo(18590, 2);
    });

    test('目标 30000 / 50000：五险一金仍封顶在 5400（再涨也不增加）', () => {
        const quick = window.EuriskoNetSalaryQuick;
        const r30 = quick.solveOf(input(30000, { mode: 'annual' }));
        expect(r30.gross).toBeCloseTo(39853.33, 2);
        expect(r30.personalTotal).toBeCloseTo(5400, 6);
        expect(r30.annualTax).toBeCloseTo(53440, 2);
        const r50 = quick.solveOf(input(50000, { mode: 'annual' }));
        expect(r50.gross).toBeCloseTo(68076.92, 2);
        expect(r50.personalTotal).toBeCloseTo(5400, 6);
        expect(r50.annualTax).toBeCloseTo(152123.07, 2);
    });

    test('保底会咬人：目标 3000 → 税前 4080，但社保按下限 4800 缴', () => {
        const r = window.EuriskoNetSalaryQuick.solveOf(input(3000, { mode: 'annual' }));
        expect(r.gross).toBeCloseTo(4080, 2);
        expect(r.social.base).toBeCloseTo(4800, 6);
        expect(r.social.clamped).toBe('below');
        expect(r.personalTotal).toBeCloseTo(1080, 6);
        expect(r.annualTax).toBe(0);
    });

    test('目标 5000：应纳税所得额为 0，全年不交个税', () => {
        const r = window.EuriskoNetSalaryQuick.solveOf(input(5000, { mode: 'annual' }));
        expect(r.gross).toBeCloseTo(6451.61, 2);
        expect(r.annualTax).toBe(0);
        expect(r.net1).toBeCloseTo(5000, 2);
        expect(r.net12).toBeCloseTo(5000, 2);
    });
});

describe('加薪试算：边际到手率（涨 1000 元不等于到手多 1000 元）', () => {
    test('税前 13175 附近加 1000 → 全年多到手 8370（每月 697.5）', () => {
        const m = window.EuriskoNetSalaryQuick.marginalOf(input(10000, { mode: 'annual' }), 1000);
        expect(m.base.gross).toBeCloseTo(13175.62, 2);
        expect(m.extraNet).toBeCloseTo(8370, 2);
        expect(m.extraNetMonthly).toBeCloseTo(697.5, 2);
        // 分母是全年新增税前（1000 × 12 = 12000），不是单月：8370 / 12000 = 69.75%
        expect(m.marginalRate).toBeCloseTo(0.6975, 4);
        expect(m.gross).toBeCloseTo(14175.62, 2);
    });

    test('封顶区间加 1000 → 全年多 9600（每月 800，20% 档）；高档位只多 7800（每月 650）', () => {
        const quick = window.EuriskoNetSalaryQuick;
        const m20 = quick.marginalOf(input(20000, { mode: 'annual' }), 1000);
        expect(m20.extraNet).toBeCloseTo(9600, 2);
        expect(m20.marginalRate).toBeCloseTo(0.8, 4);
        const m50 = quick.marginalOf(input(50000, { mode: 'annual' }), 1000);
        expect(m50.extraNet).toBeCloseTo(7800, 2);
        expect(m50.marginalRate).toBeCloseTo(0.65, 4);
        // 边际到手率随工资递减（涨薪越往后越「不值」）
        expect(m20.marginalRate).toBeGreaterThan(m50.marginalRate);
    });

    test('到手率不是常数，且不单调（封顶后占比被摊薄）', () => {
        const quick = window.EuriskoNetSalaryQuick;
        const r20 = quick.solveOf(input(20000, { mode: 'annual' }));
        const r30 = quick.solveOf(input(30000, { mode: 'annual' }));
        expect(r20.netRate).toBeCloseTo(0.737, 3);
        expect(r30.netRate).toBeCloseTo(0.753, 3);
        expect(r30.netRate).toBeGreaterThan(r20.netRate);   // 五险一金封顶 → 到手率反而不降略升
    });
});

describe('边界与非法输入', () => {
    test('目标为 0 / 空 / 负数：不收敛，不产生负工资', () => {
        const quick = window.EuriskoNetSalaryQuick;
        [0, '', -100, 'abc', null, undefined].forEach((target) => {
            const r = quick.solveOf(input(target, { mode: 'annual' }));
            expect(r.converged).toBe(false);
            expect(r.gross).toBe(0);
        });
    });

    test('极高目标仍能收敛（45% 档，到手率约 55.8%）', () => {
        const r = window.EuriskoNetSalaryQuick.solveOf(input(1000000, { mode: 'annual' }));
        expect(r.converged).toBe(true);
        expect(r.gross).toBeCloseTo(1791109.09, 2);
        expect(Math.abs(r.gap)).toBeLessThan(1);
    });

    test('未填社平工资：不夹限，倒推出的税前更高（不封顶）', () => {
        const quick = window.EuriskoNetSalaryQuick;
        const withAvg = quick.solveOf(input(20000, { mode: 'annual' }));
        const noAvg = quick.solveOf({ targetMonthly: 20000, housingRate: 0.12, specialMonthly: 1000, mode: 'annual' });
        expect(noAvg.social.clamped).toBe('within');
        expect(noAvg.gross).toBeGreaterThan(withAvg.gross);
    });
});

describe('税后工资落地页：静态口径与页面声明（爬虫不执行 JS 也能读全）', () => {
    test('页面静态示例表可读：税前 13175.62 / 27137.50 / 39853.33 / 68076.92、边际 8370、企业成本 18379.98', () => {
        [
            '>5000.00<', '>6451.61<', '>1451.61<', '>9000.00<', '>9300.00<',
            '>10000.00<', '>13175.62<', '>2964.51<', '>2533.30<', '>10084.78<', '>9790.00<', '>18379.98<', '>8370.00<',
            '>20000.00<', '>27137.50<', '>5400.00<', '>20850.01<', '>21265.37<', '>18590.00<', '>36617.50<', '>9600.00<',
            '>30000.00<', '>39853.33<', '>53440.00<', '>33599.73<', '>27340.00<', '>49333.33<', '>8999.99<',
            '>50000.00<', '>68076.92<', '>152123.07<', '>59529.23<', '>44667.69<', '>77556.92<', '>7800.00<'
        ].forEach((n) => expect(html).toContain(n));
    });

    test('页面静态两口径对照表可读：13062.86 / 25833.00 / 36142.27 / 12523.19 / 33554.16', () => {
        const block = (html.split('id="mode-example-table"')[1] || '').split('</table>')[0];
        ['>13062.86<', '>112.76<', '>943.83<', '>25833.00<', '>1304.50<', '>12523.19<',
            '>36142.27<', '>3711.06<', '>33554.16<'].forEach((n) => expect(block).toContain(n));
    });

    test('页面写明三条易错口径：到手率不是常数、边际到手率、年终奖另算与保底', () => {
        expect(html).toContain('倒算不能「除以到手率」—— 到手率不是常数');
        expect(html).toContain('涨薪 1000 元不等于到手多 1000 元：看边际到手率');
        expect(html).toContain('倒算只对月薪负责：年终奖另算，保底也会咬人');
        expect(html).toContain('边际到手率');
        expect(html).toContain('二分');
    });

    test('页面含 canonical / FAQPage 结构化数据、政策文号、同源脚本与 CTA 归因参数', () => {
        expect(html).toContain('rel="canonical" href="https://euriskotax.zeabur.app/seo/net-salary.html"');
        expect(html).toContain('FAQPage');
        expect(html).toContain('主席令第九号');
        expect(html).toContain('2018 年第 61 号');
        expect(html).toContain('主席令第 35 号');
        expect(html).toContain('财税〔2006〕10 号');
        expect(html).toContain('/src/js/calculation/tax-constants.js');
        expect(html).toContain('/src/js/calculation/social-insurance-quick.js');
        expect(html).toContain('/src/js/calculation/net-salary-quick.js');
        expect(html).toContain('?source=seo_netsalary');
    });
});
