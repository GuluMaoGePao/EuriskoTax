// 企业用工成本轻量实现与社保模块 / 常量 / 页面的一致性测试（阶段15 15C-3）
//
// 对拍对象：
//   · 单位五险一金与到手工资 —— social-insurance-quick.js（本模块不复制费率，只做成本侧组装）；
//   · 费率与基数规则 —— tax-constants.js#socialInsuranceRules（出厂基线，可被运营热改）；
//   · 缴费基数 —— 60% 保底 / 300% 封顶。
//
// 另有三件「算法对拍抓不到、但错了就会慢慢误导人」的事，也在这里钉住：
//   ① **成本倍数不是常数**：工资越低倍数越高（保底），工资越高倍数越低（封顶）——
//      「按 1.4 倍估用工成本」在两端都会算错；
//   ② 倒算要**二分**：单位五险一金随工资分段变化，不能拿预算除以固定倍数；
//   ③ **涨薪传递率**：企业多付的钱里只有约一半落到员工手上，且封顶后反而更高
//      （这条最反直觉，页面把它单列成一张表）。
const fs = require('fs');
const path = require('path');
const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/tax-registry.js');
    loadSource('src/js/calculation/tax-calculator.js');
    loadSource('src/js/calculation/salary-tax-quick.js');
    loadSource('src/js/calculation/social-insurance-quick.js');
    loadSource('src/js/calculation/employer-cost-quick.js');
});

const html = fs.readFileSync(path.join(__dirname, '..', 'seo', 'employer-cost.html'), 'utf8');
const Q = () => window.EuriskoEmployerCostQuick;

// 统一口径：社平工资 8000 → 下限 4800（60%）、上限 24000（300%）
const AVG = 8000;
const input = (extra) => Object.assign({
    socialAverage: AVG,
    housingRate: 0.12,
    specialMonthly: 1000,
    headcount: 1
}, extra || {});

describe('企业用工成本：口径来源单一（复用社保模块，不复制费率）', () => {
    test('单位五险一金与社保模块同值（成本侧不写第二份）', () => {
        const s = window.EuriskoSocialQuick.socialInsuranceOf(input({ wage: 10000 }));
        const r = Q().costOf(input({ wage: 10000 }));
        expect(r.employerTotal).toBe(s.employerTotal);
        expect(r.employerInsurance).toBe(s.employerInsurance);
        expect(r.employerHousing).toBe(s.housingEmployer);
        expect(r.personalTotal).toBe(s.personalTotal);
        // 成本 = 工资 + 单位部分（定义式）
        expect(r.monthlyPerPerson).toBe(10000 + s.employerTotal);
    });

    test('员工到手与税后工资模块同源（累计预扣，不是单月 × 12）', () => {
        const net = window.EuriskoSocialQuick.netSalaryOf(input({ wage: 10000 }));
        const r = Q().costOf(input({ wage: 10000 }));
        expect(r.netAnnual).toBe(net.annualNet);
        expect(r.annualTax).toBe(net.annualTax);
    });

    test('费率来自常量：改常量即改结果（不存在硬编码的第二份费率）', () => {
        const rules = window.socialInsuranceRules;
        const of = (key) => rules.items.find((i) => i.key === key);
        expect(of('pension').employerRate).toBe(0.16);
        expect(of('maternity').personalRate).toBe(0);
        const r = Q().costOf(input({ wage: 10000 }));
        // 单位部分 = 基数 × (16 + 9 + 0.5 + 0.4 + 0)% + 公积金 12%
        // 默认地区 = 上海：职工医保单位 9% 已含生育，生育不再单列，所以五项合计 25.9% 而不是 27.5%
        expect(r.employerInsurance).toBeCloseTo(10000 * 0.259, 6);
        expect(r.employerHousing).toBeCloseTo(1200, 6);
        expect(r.employerTotal).toBeCloseTo(3790, 6);
    });
});

describe('企业用工成本：成本倍数不是常数（保底让低工资更贵，封顶让高工资更便宜）', () => {
    test('工资 3000 元按下限 4800 元缴：成本 4819.2 元、倍数 1.61', () => {
        const r = Q().costOf(input({ wage: 3000 }));
        expect(r.clamped).toBe('below');
        expect(r.base).toBe(4800);
        expect(r.employerTotal).toBeCloseTo(4800 * 0.379, 6);   // 1819.2 = 下限 × 25.9% + 公积金 12%×4800
        expect(r.monthlyPerPerson).toBeCloseTo(4819.2, 6);
        expect(r.multiple).toBeCloseTo(1.6064, 3);
    });

    test('工资 10000 元：成本 13790 元、倍数 1.379、到手占 55.8%', () => {
        const r = Q().costOf(input({ wage: 10000 }));
        expect(r.clamped).toBe('within');
        expect(r.employerTotal).toBe(3790);
        expect(r.monthlyPerPerson).toBe(13790);
        expect(r.multiple).toBeCloseTo(1.379, 6);
        // 个人侧没变（三险 10.5% + 公积金 12%），到手不变；占比上升是因为企业那一份变小了
        expect(r.netMonthly).toBeCloseTo(7697.5, 2);
        expect(r.netShare).toBeCloseTo(0.5582, 4);
    });

    test('工资 50000 元按上限 24000 元缴：成本 59096 元、倍数 1.18', () => {
        const r = Q().costOf(input({ wage: 50000 }));
        expect(r.clamped).toBe('above');
        expect(r.base).toBe(24000);
        expect(r.employerTotal).toBe(9096);
        expect(r.monthlyPerPerson).toBe(59096);
        expect(r.multiple).toBeCloseTo(1.1819, 4);
    });

    test('倍数随工资单调下降：1.61（3000）> 1.379（10000）> 1.18（50000）', () => {
        const low = Q().costOf(input({ wage: 3000 })).multiple;
        const mid = Q().costOf(input({ wage: 10000 })).multiple;
        const high = Q().costOf(input({ wage: 50000 })).multiple;
        expect(low).toBeGreaterThan(mid);
        expect(mid).toBeGreaterThan(high);
        // 保底区间内，工资涨了但成本不变 → 倍数下降更快
        expect(Q().costOf(input({ wage: 3000 })).monthlyPerPerson)
            .toBeGreaterThan(Q().costOf(input({ wage: 2900 })).monthlyPerPerson);
    });

    test('到手占比：企业每花 100 元，员工拿到约 55 元（其余是五险一金与个税）', () => {
        const r = Q().costOf(input({ wage: 10000 }));
        expect(r.wedge + r.netAnnual).toBeCloseTo(r.annualPerPerson, 2);
        expect(r.netShare).toBeLessThan(0.6);
        expect(r.netShare).toBeGreaterThan(0.5);
    });

    test('人数放大：团队成本 = 人均 × 人数（10 人 × 10000 → 月 137900、年 1654800）', () => {
        const r = Q().costOf(input({ wage: 10000, headcount: 10 }));
        expect(r.headcount).toBe(10);
        expect(r.monthlyTotal).toBe(137900);
        expect(r.annualTotal).toBe(1654800);
        // 人数不影响人均指标
        expect(r.multiple).toBeCloseTo(1.379, 6);
        expect(r.monthlyPerPerson).toBe(13790);
    });
});

describe('企业用工成本：按预算倒推工资（二分，不是除以固定倍数）', () => {
    test('预算 13790 元 → 工资 10000 元（回代吻合）', () => {
        const r = Q().solveOf(input({ budgetMonthly: 13790 }));
        expect(r.converged).toBe(true);
        expect(r.wage).toBeCloseTo(10000, 1);      // 二分有步长，落在 9999.99 也认
        expect(r.monthlyPerPerson).toBeCloseTo(13790, 1);      // 二分步长在分位
    });

    test('预算 20000 元 → 工资 14503.26 元；整除到百元 14500', () => {
        const r = Q().solveOf(input({ budgetMonthly: 20000 }));
        expect(r.wage).toBeCloseTo(14503.26, 2);
        expect(r.wageHundred).toBe(14500);
    });

    test('解是「不超过预算的最大工资」：再加 1 分就超预算', () => {
        const budget = 20000;
        const r = Q().solveOf(input({ budgetMonthly: budget }));
        expect(Q().monthlyCostAt(r.wage, input())).toBeLessThanOrEqual(budget);
        // 二分步长在分位，所以「加 1 分」可能仍不超；加 1 元必然超
        expect(Q().monthlyCostAt(r.wage + 1, input())).toBeGreaterThan(budget);
    });

    test('预算 50000 元时工资 40904 元（已封顶，倍数只剩 1.22）', () => {
        const r = Q().solveOf(input({ budgetMonthly: 50000 }));
        // 封顶后单位部分固定 = 上限 24000 × 37.9% = 9096，预算减去它就是工资
        expect(r.wage).toBeCloseTo(40903.99, 2);
        expect(r.multiple).toBeCloseTo(1.2224, 3);
        expect(r.social.clamped).toBe('above');
    });

    test('非法预算（0 / 空 / 负数）不崩且不谎报', () => {
        [0, '', -100, undefined].forEach((v) => {
            const r = Q().solveOf(input({ budgetMonthly: v }));
            expect(r.converged).toBe(false);
            expect(r.wage).toBe(0);
        });
    });
});

describe('企业用工成本：涨薪成本与传递率', () => {
    test('未封顶：涨 1000 元企业月多付 1379 元，员工全年只多拿 9021 元（传递率 54.5%）', () => {
        const r = Q().raiseOf(input({ wage: 10000 }), 1000);
        expect(r.extraCostMonthly).toBe(1379);
        expect(r.extraCostAnnual).toBe(16548);
        // 员工多拿 9021 元：涨薪 12000 − 个人三险一金 2700 − 多出的个税 279（个人侧费率没变，所以这个数不变）
        expect(r.extraNetAnnual).toBe(9021);
        expect(r.costMultiple).toBeCloseTo(1.379, 6);
        expect(r.passThrough).toBeCloseTo(0.5451, 3);
    });

    test('已封顶：涨 1000 元企业只多付 1000 元（单位部分不再增加），传递率升到 80%', () => {
        const r = Q().raiseOf(input({ wage: 30000 }), 1000);
        expect(r.extraCostMonthly).toBe(1000);
        expect(r.extraCostAnnual).toBe(12000);
        expect(r.extraNetAnnual).toBe(9600);
        expect(r.costMultiple).toBeCloseTo(1, 6);
        expect(r.passThrough).toBeCloseTo(0.8, 3);
    });

    test('传递率随工资先降后升：20000 元处 50%，30000 元处 80%', () => {
        const mid = Q().raiseOf(input({ wage: 20000 }), 1000);
        const high = Q().raiseOf(input({ wage: 30000 }), 1000);
        expect(mid.passThrough).toBeCloseTo(0.5058, 3);   // 企业多付的少了，传递率因此抬升一点
        expect(high.passThrough).toBeGreaterThan(mid.passThrough);
    });

    test('涨薪额默认 1000 元，且企业多付 ≥ 涨薪额、员工多拿 ≤ 企业多付', () => {
        const r = Q().raiseOf(input({ wage: 10000 }), undefined);
        expect(r.step).toBe(1000);
        expect(r.extraCostMonthly).toBeGreaterThanOrEqual(r.step);
        expect(r.extraNetAnnual).toBeLessThan(r.extraCostAnnual);
    });
});

describe('企业用工成本落地页：正文与算法一致（静态表不是手填的）', () => {
    test('静态成本表数字与 quick 实算逐档一致', () => {
        const rows = Q().tableOf([3000, 10000, 24000, 50000], input());
        rows.forEach((r) => {
            expect(html).toContain(`>${r.monthlyPerPerson.toFixed(2)}<`);
            expect(html).toContain(`>${r.employerTotal.toFixed(2)}<`);
        });
    });

    test('静态涨薪表数字与 quick 实算一致（1395.00 / 16740.00 / 9021.00 / 9600.00 / 8370.00）', () => {
        const low = Q().raiseOf(input({ wage: 8000 }), 1000);
        const mid = Q().raiseOf(input({ wage: 20000 }), 1000);
        const high = Q().raiseOf(input({ wage: 30000 }), 1000);
        expect(html).toContain(`>${low.extraCostMonthly.toFixed(2)}<`);
        expect(html).toContain(`>${low.extraCostAnnual.toFixed(2)}<`);
        expect(html).toContain(`>${low.extraNetAnnual.toFixed(2)}<`);
        expect(html).toContain(`>${mid.extraNetAnnual.toFixed(2)}<`);
        expect(html).toContain(`>${high.extraNetAnnual.toFixed(2)}<`);
    });

    test('静态倒推表数字与 quick 实算一致（14336.91 / 40520.00 / 5734.77）', () => {
        [20000, 50000, 8000].forEach((b) => {
            const r = Q().solveOf(input({ budgetMonthly: b }));
            expect(html).toContain(`>${r.wage.toFixed(2)}<`);
        });
    });

    test('页面写明三条主口径：倍数不是常数、涨薪传递率、只算法定五险一金', () => {
        expect(html).toContain('成本倍数不是常数：工资越低，倍数越高');
        expect(html).toContain('涨薪 1000 元 ≠ 企业多花 1000 元，员工更拿不到 1000 元');
        expect(html).toContain('公积金是双边的，且这一页只算法定五险一金');
        expect(html).toContain('传递率');
        expect(html).toContain('保底');
        expect(html).toContain('封顶');
    });

    test('页面含 canonical / FAQPage 与政策依据文号，CTA 带归因参数', () => {
        expect(html).toContain('rel="canonical"');
        expect(html).toContain('FAQPage');
        expect(html).toContain('主席令第 35 号');
        expect(html).toContain('国务院令第 262 号');
        expect(html).toContain('国办发〔2019〕13 号');
        expect(html).toContain('财税〔2006〕10 号');
        expect(html).toContain('?source=seo_employercost');
    });

    test('页面复用同源脚本（常量 + 五险一金 + 用工成本），并链回工具总目录', () => {
        expect(html).toContain('/src/js/calculation/tax-constants.js');
        expect(html).toContain('/src/js/calculation/social-insurance-quick.js');
        expect(html).toContain('/src/js/calculation/employer-cost-quick.js');
        expect(html).toContain('href="/seo/index.html"');
        expect(html).toContain('本测算结果仅供参考，不构成税务建议');
    });
});
