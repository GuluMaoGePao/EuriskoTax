// 政策手算对拍（运营前核对的第三层）
//
// 它守护的东西与前 130 套件不同：
//   其它测试断言的是「实现 == 期望」—— 期望写错了它照样绿；
//   本文件断言的是「**期望 == 国家政策**」—— 每一个数字都由政策条文**手算**得出，
//   演算过程写在每条断言上方的注释里。改动这些数字前，先改政策依据，不是改断言。
//
// 覆盖的是最容易算错、且错了金额最大的口径：
//   · 年终奖单独计税：÷12 定档、全额乘税率（临界点跳档）
//   · 劳务 / 稿酬 / 特许权预扣：4000 分界、稿酬再 ×70%
//   · 一次性补偿（离职 / 提前退休）：3 倍社平免税、按年分摊
//   · 个人养老金：12000 限额 × 适用税率
//   · 社保：三险一金 22.5%（工伤生育个人不缴）
//   · 残保金：缺口 × 计费工资 × 分档减缴
//   · 增值税：价外税分离、季 30 万全额跳变、销项 − 进项
//   · 附加税 / 印花税：7+3+2、万分之三、六税两费减半
//   · 经营所得：五级表（不是七级）+ 200 万以内减半
//   · 企业所得税：25%×20%=5%、300 万悬崖
//   · 卖房：转让所得 20%、满五唯一免征
//   · 汇算：年 6 万定额、累计预扣推演
//   · 捐赠：应纳税所得额 × 30% 限额
//
// 口径仍同源：一律走工具注册表的 compute（字段 → 计算全链路），不绕过字段直调内核。

const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/tax-calculator.js');
    ['salary-tax', 'net-salary', 'bonus-tax', 'special-deduction', 'annual-settlement', 'withholding',
        'equity-incentive', 'severance', 'early-retirement', 'expat-allowance', 'private-pension',
        'health-insurance', 'annuity', 'social-insurance', 'employer-cost', 'disability-fund',
        'vat', 'surtax-stamp', 'business-income', 'corporate-income-tax', 'donation',
        'property-transfer', 'non-resident'].forEach(function (m) {
        loadSource('src/js/calculation/' + m + '-quick.js');
    });
    loadSource('src/js/calculation/utils.js');
    loadSource('src/js/data/tool-registry.js');
});

function primaryOf(id, values) {
    const tool = window.EuriskoToolRegistry.get(id);
    const out = tool.compute(values);
    return out.primary.value;
}

function rowOf(id, values, label) {
    const out = window.EuriskoToolRegistry.get(id).compute(values);
    const r = (out.rows || []).find((x) => x.label === label);
    return r ? r.value : undefined;
}

describe('年终奖单独计税（财税〔2018〕164 号）：÷12 定档、全额乘税率', () => {
    test('36000：36000÷12=3000 落在 3% 档 → 36000×3% = 1080', () => {
        expect(primaryOf('bonus-tax', { bonus: 36000 })).toBe(1080);
    });

    test('36001：÷12=3000.08 跳到 10% 档 → 36001×10%−210 = 3390.1（多发 1 元多缴 2310）', () => {
        expect(primaryOf('bonus-tax', { bonus: 36001 })).toBeCloseTo(3390.1, 6);
    });

    test('144000：÷12=12000 仍在 10% 档 → 144000×10%−210 = 14190', () => {
        expect(primaryOf('bonus-tax', { bonus: 144000 })).toBe(14190);
    });

    test('144001：÷12=12000.08 跳到 20% 档 → 144001×20%−1410 = 27390.2', () => {
        expect(primaryOf('bonus-tax', { bonus: 144001 })).toBeCloseTo(27390.2, 6);
    });
});

describe('劳务 / 稿酬 / 特许权预扣（>4000 扣 20%，稿酬收入额再 ×70%）', () => {
    test('劳务 10000：(10000−2000)=8000 → 20% = 1600', () => {
        expect(primaryOf('withholding', { type: 'labor', amount: 10000, marginalRate: 20 })).toBe(1600);
    });

    test('劳务 30000：(30000−6000)=24000 → 30%−2000 = 5200', () => {
        expect(primaryOf('withholding', { type: 'labor', amount: 30000, marginalRate: 20 })).toBe(5200);
    });

    test('稿酬 10000：10000×0.8×0.7=5600 → 20% = 1120', () => {
        expect(primaryOf('withholding', { type: 'author', amount: 10000, marginalRate: 20 })).toBe(1120);
    });

    test('特许权 10000：10000×0.8=8000 → 20% = 1600', () => {
        expect(primaryOf('withholding', { type: 'royalty', amount: 10000, marginalRate: 20 })).toBe(1600);
    });
});

describe('一次性补偿：离职 3 倍社平免税、提前退休按年分摊（财税〔2018〕164 号）', () => {
    test('离职补偿 40 万、社平年工资 12 万：免税 36 万 → 应税 4 万 → 40000×10%−2520 = 1480', () => {
        const v = { economic: 400000, avgWage: 120000, monthlyWage: 0, years: 0 };
        expect(rowOf('severance', v, '免税额度（社平 ×3）')).toBe(360000);
        expect(primaryOf('severance', v)).toBe(1480);
    });

    test('提前退休补贴 20 万、提前 2 年：每年 10 万 − 6 万 = 4 万 → 1480×2 = 2960', () => {
        const v = { variant: 'early', subsidy: 200000, years: 2 };
        expect(rowOf('early-retirement', v, '每年分摊额')).toBe(100000);
        expect(primaryOf('early-retirement', v)).toBe(2960);
    });
});

describe('个人养老金：12000 限额 × 适用税率（财税〔2022〕34 号 / 2024 年全国实施）', () => {
    test('扣除前应税 20 万（20% 档）：少交 = 12000×20% = 2400', () => {
        const v = { annualContribution: 12000, taxableBefore: 200000 };
        expect(rowOf('private-pension', v, '实际可扣除')).toBe(12000);
        expect(primaryOf('private-pension', v)).toBe(2400);
    });
});

describe('社保：三险一金 22.5%，工伤与生育个人不缴', () => {
    test('月薪 1 万、社平 8000（基数落在 4800~24000 内）→ 养老 800 + 医疗 200 + 失业 50 + 公积金 1200 = 2250', () => {
        const v = { wage: 10000, socialAverage: 8000, housingRate: 12 };
        expect(rowOf('social-base', v, '缴费基数')).toBe(10000);
        expect(rowOf('social-base', v, '工伤保险（个人 / 月）')).toBe(0);
        expect(primaryOf('social-base', v)).toBe(2250);
    });
});

describe('残保金：缺口 × 计费工资 × 分档减缴（财税〔2015〕72 号）', () => {
    test('100 人、年均工资 10 万、安排 0 人：(100×1.5%−0)×100000=150000 → 比例 0% <1% 按 90% = 135000', () => {
        const v = { variant: 'levy', headcount: 100, avgAnnualWage: 100000, disabled: 0, socialAverageMonthly: 8000 };
        expect(rowOf('disability-fund', v, '应缴费额（缺口 × 计费工资）')).toBe(150000);
        expect(rowOf('disability-fund', v, '分档减缴系数')).toBe(0.9);
        expect(primaryOf('disability-fund', v)).toBe(135000);
    });

    test('安排 1 人（比例 1%，未达 1.5%）：(1.5−1)×100000=50000 → 按 50% = 25000', () => {
        const v = { variant: 'levy', headcount: 100, avgAnnualWage: 100000, disabled: 1, socialAverageMonthly: 8000 };
        expect(primaryOf('disability-fund', v)).toBe(25000);
    });
});

describe('增值税：价外税先分离、季 30 万全额跳变、销项 − 进项', () => {
    test('小规模季度不含税 30 万 = 免征线上 → 0', () => {
        expect(primaryOf('vat', { variant: 'small', sales: 300000, period: 'quarter', taxIncluded: false })).toBe(0);
    });

    test('超线 100 元 → 全额 ×1% = 3001（不是只对超出部分计税）', () => {
        expect(primaryOf('vat', { variant: 'small', sales: 300100, period: 'quarter', taxIncluded: false })).toBe(3001);
    });

    test('一般纳税人含税 113000、13%：113000÷1.13=100000 → 销项 13000 − 进项 8000 = 5000', () => {
        const v = { variant: 'general', output: 113000, inputTax: 8000, rate: 0.13, taxIncluded: true };
        expect(rowOf('vat', v, '销项税额')).toBeCloseTo(13000, 6);
        expect(primaryOf('vat', v)).toBeCloseTo(5000, 6);
    });

    // 2026-01-01 增值税法施行后，小规模优惠由财政部 税务总局公告 **2026 年第 10 号**衔接，
    // 其中一句最容易被漏：3% 减按 1% 只适用于「除销售、出租不动产或者转让土地使用权之外」的应税交易。
    test('出租不动产（5% 档）：季含税 40 万 → 380952.38 × 5% = 19047.62，且不减征', () => {
        // 400000 ÷ 1.05 = 380952.38（超过 30 万 → 全额计税）→ × 5% = 19047.62
        const v = { variant: 'small', sales: 400000, period: 'quarter', taxIncluded: true, levy: 'realestate' };
        expect(primaryOf('vat', v)).toBeCloseTo(19047.62, 2);
    });

    test('同一笔 40 万是一般应税交易时：÷1.01 → 396039.60 × 1% = 3960.40（与 5% 档差 1.5 万）', () => {
        const v = { variant: 'small', sales: 400000, period: 'quarter', taxIncluded: true, levy: 'general' };
        expect(primaryOf('vat', v)).toBeCloseTo(3960.4, 2);
    });
});

describe('附加税与印花税：7+3+2、万分之三、六税两费减半', () => {
    test('市区、实缴增值税 10 万：城建 7000 + 教育附加 3000 + 地方教育附加 2000 = 12000', () => {
        const v = { variant: 'surtax', location: 'urban', vat: 100000, halve: false };
        expect(rowOf('surtax-stamp', v, '城建税')).toBe(7000);
        expect(primaryOf('surtax-stamp', v)).toBe(12000);
    });

    test('六税两费减半：12000 → 6000', () => {
        const v = { variant: 'surtax', location: 'urban', vat: 100000, halve: true };
        expect(primaryOf('surtax-stamp', v)).toBe(6000);
    });

    test('买卖合同 100 万：1000000 × 万分之三 = 300', () => {
        expect(primaryOf('surtax-stamp', { variant: 'stamp', item: 'sale', amount: 1000000, halve: false })).toBe(300);
    });
});

describe('经营所得：五级超额累进（不是七级）+ 200 万以内减半', () => {
    test('核定利润率 10%、收入 100 万 → 应税 10 万 → 100000×20%−10500 = 9500', () => {
        expect(primaryOf('business-income', { revenue: 1000000, profitRatio: 10, cost: 0, halve: false })).toBe(9500);
    });

    test('减半优惠（2027-12-31 前，≤200 万部分）：9500 → 4750', () => {
        expect(primaryOf('business-income', { revenue: 1000000, profitRatio: 10, cost: 0, halve: true })).toBe(4750);
    });
});

describe('企业所得税：小微是 25%×20%=5%，300 万是悬崖', () => {
    test('应纳税所得额 300 万、80 人、资产 3000 万 → 小微 5% = 150000', () => {
        const v = { mode: 'direct', taxable: 3000000, staff: 80, assetsWan: 3000 };
        expect(rowOf('corporate-income-tax', v, '适用身份')).toBe('小型微利');
        expect(primaryOf('corporate-income-tax', v)).toBe(150000);
    });

    test('301 万：超出小微门槛 → 全额按 25% = 752500', () => {
        const v = { mode: 'direct', taxable: 3010000, staff: 80, assetsWan: 3000 };
        expect(primaryOf('corporate-income-tax', v)).toBe(752500);
    });
});

describe('卖房：转让所得 20%（国税发〔2006〕108 号）、满五唯一免征（财税字〔1999〕278 号）', () => {
    const base = { usage: 'residence', acquireType: 'purchase', salePrice: 5000000, originalValue: 3000000,
        hasValueProof: true, holdYears: 6, repurchase: false };

    test('非唯一住房：(500 万−300 万) = 200 万 → ×20% = 400000', () => {
        expect(primaryOf('property-transfer', Object.assign({}, base, { isOnlyHome: false }))).toBe(400000);
    });

    test('满五唯一：应纳税额 40 万，免征后净缴 0', () => {
        const v = Object.assign({}, base, { isOnlyHome: true });
        expect(rowOf('property-transfer', v, '应纳税额')).toBe(400000);
        expect(primaryOf('property-transfer', v)).toBe(0);
    });
});

describe('年度汇算：年定额 6 万、累计预扣推演已预缴', () => {
    test('月薪 15000 × 12、三险一金 1500、专项附加 1000：应税 9 万 → 90000×10%−2520 = 6480，均匀发放不补不退', () => {
        const v = { monthlyIncome: 15000, months: 12, monthlyInsurance: 1500, monthlySpecialAdditional: 1000, prepaidTax: 0 };
        expect(rowOf('annual-settlement', v, '全年应纳税所得额')).toBe(90000);
        expect(rowOf('annual-settlement', v, '全年应纳税额')).toBe(6480);
        expect(primaryOf('annual-settlement', v)).toBe(0);   // primary 是「应补个税」
    });
});

// 社保与公积金**没有全国统一费率**，所以出厂默认值必须钉在某个具体地区上 —— 项目选的是上海。
// 这一组断言的作用是：谁把默认值改回"常见值"、或误以为是全国统一的，这里会红。
describe('默认地区 = 上海（2026 年度口径，不是全国统一值）', () => {
    test('医疗保险单位 9%（含生育）、生育不单列、公积金标准档 7%', () => {
        const rules = window.socialInsuranceRules;
        const of = (key) => rules.items.find((i) => i.key === key);
        // 上海 2026 年度：职工医保单位 9%，生育已并入这 9%（所以 maternity 是 0，不是漏了）
        expect(of('medical').employerRate).toBe(0.09);
        expect(of('maternity').employerRate).toBe(0);
        expect(of('pension').employerRate).toBe(0.16);
        expect(of('unemployment').employerRate).toBe(0.005);
        // 上海住房公积金单位与个人各 7%（区间 5%~7%，另有补充公积金 1%~8%）
        expect(rules.housingFund.defaultRate).toBe(0.07);
        // 上海 2025 年度全口径社平 12577 元/月 → 缴费基数下限 7546、上限 37731
        expect(Math.round(12577 * rules.base.lowerRatio)).toBe(7546);
        expect(Math.round(12577 * rules.base.upperRatio)).toBe(37731);
    });
});

describe('公益捐赠：限额 = 应纳税所得额 × 30%（财政部 税务总局公告 2019 年第 99 号）', () => {
    test('现金捐赠 5 万、综合所得应税 36000：可扣 10800，超出的 39200 当年不能扣', () => {
        const v = { donateKind: 'cash', cashAmount: 50000, comprehensiveTaxable: 36000, comprehensiveBasis: 'year',
            fullDeduction: 'no', hasReceipt: 'yes' };
        expect(rowOf('donation', v, '扣除限额合计')).toBe(10800);
        expect(rowOf('donation', v, '实际可扣除')).toBe(10800);
    });
});

// ── 第三批对拍（2026-10-26 补）：把剩余速算器里「政策标准本身」钉住 ──────────────
// 这一批核的不是算法，而是**标准值有没有跟上政策**：专项附加 2023 年提标后的 2000 / 3000、
// 非居民的月度换算表与数月奖金 ÷6、股权激励单独计税、年金 4%、累计预扣法。

describe('专项附加扣除：七项定额（国发〔2023〕13 号）+ 少交的税 ≠ 扣除额 × 税率', () => {
    test('1 个子女 + 独生子女赡养老人：2000×12 + 3000×12 = 60000（2023-08 起的标准）', () => {
        const v = { taxableBefore: 200000, children: 1, elderly: 'only', housing: 'none' };
        expect(rowOf('special-deduction', v, '子女教育')).toBe(24000);
        expect(rowOf('special-deduction', v, '赡养老人')).toBe(36000);
        expect(rowOf('special-deduction', v, '七项年度扣除合计')).toBe(60000);
    });

    test('扣除前 20 万：23080 − 11480 = 11600；朴素「60000 × 20% = 12000」高估 400', () => {
        const v = { taxableBefore: 200000, children: 1, elderly: 'only', housing: 'none' };
        // 扣除前 200000 × 20% − 16920 = 23080；扣除后 140000 × 10% − 2520 = 11480
        expect(primaryOf('special-deduction', v)).toBe(11600);
        expect(rowOf('special-deduction', v, '朴素估算（扣除额 × 税率）')).toBe(12000);
        expect(rowOf('special-deduction', v, '朴素估算高估了')).toBe(400);
    });
});

describe('非居民个人：月度换算表 + 数月奖金 ÷6 定档（财政部 税务总局公告 2019 年第 35 号）', () => {
    test('居住 120 天 → 非居民；境内工作占比 20/30 → 当月收入额 20000', () => {
        const v = { role: 'staff', stayFullDays: 120, fullYearsBefore: 5, maxSingleAbsence: 0,
            monthlyTotal: 30000, monthlyPaidDomestic: 15000, calendarDays: 30, domesticWorkDays: 20,
            months: 12, bonus: 120000 };
        expect(rowOf('non-resident', v, '当月工资薪金收入额')).toBeCloseTo(20000, 6);
        // (20000 − 5000) × 20% − 1410 = 1590/月 × 12 = 19080
        expect(rowOf('non-resident', v, '工资薪金税额（12 个月）')).toBeCloseTo(19080, 6);
        // 数月奖金也要先按境内工作天数占比折算：120000 × 20/30 = 80000 → ÷6 = 13333.33
        // → 13333.33 × 20% − 1410 = 1256.67 × 6 = 7540
        expect(rowOf('non-resident', v, '数月奖金税额（÷ 6 定档后再 × 6）')).toBeCloseTo(7540, 2);
        expect(primaryOf('non-resident', v)).toBeCloseTo(26620, 2);
    });
});

describe('股权激励：2027 年底前单独计税、全额适用年度表（财政部 税务总局公告 2023 年第 25 号）', () => {
    test('期权 10000 股 ×（行权价 20 − 授予价 10）= 10 万 → 100000 × 10% − 2520 = 7480', () => {
        const v = { type: 'option', qty: 10000, price: 20, cost: 10 };
        expect(primaryOf('equity', v)).toBe(7480);
    });
});

describe('税优健康险 2400 限额、企业年金个人 4% 当期扣除（财税〔2013〕103 号）', () => {
    test('税优健康险：2400 限额 × 20% 税率 = 480（节税上限 2400 × 45% = 1080）', () => {
        const v = { annualPremium: 2400, taxableBefore: 200000 };
        expect(primaryOf('health-insurance', v)).toBe(480);
        expect(rowOf('health-insurance', v, '节税上限（2400 × 45%）')).toBe(1080);
    });

    test('企业年金：缴费基数 15000 × 4% = 600/月 → 7200/年 × 20% = 1440', () => {
        const v = { contributionBase: 15000, personalRate: 4, employerRate: 8,
            taxableBefore: 200000, years: 10, monthlyWithdraw: 2000 };
        expect(rowOf('annuity', v, '个人缴费月免税额')).toBe(600);
        expect(rowOf('annuity', v, '年度免税额')).toBe(7200);
        expect(primaryOf('annuity', v)).toBe(1440);
    });
});

describe('月薪个税：累计预扣法（国家税务总局公告 2018 年第 61 号）', () => {
    test('月薪 15000、三险一金 1500、专项附加 1000：年累计应税 90000 → 90000 × 10% − 2520 = 6480', () => {
        const v = { monthlyIncome: 15000, months: 12, monthlyInsurance: 1500, monthlySpecialAdditional: 1000 };
        expect(primaryOf('salary-tax', v)).toBe(6480);
        expect(rowOf('salary-tax', v, '第 1 月预扣')).toBe(225);      // 7500 × 3%
        expect(rowOf('salary-tax', v, '第 12 月预扣')).toBe(750);     // 6480 − (82500 × 10% − 2520)
        expect(rowOf('salary-tax', v, '到手合计')).toBe(155520);      // 180000 − 1500×12 − 6480
    });
});

// ── 第四批对拍（2026-10-26 补）：自己有 compute 的完整测算（deep）────────────
// 与同名速算器**共享 compute** 的 deep（forward / business / classification / donation /
// reverse / property-transfer / non-resident）不必重复对拍 —— 速算器那层已经钉住了。
// 这一批钉的是**自带 spec** 的那 14 个：它们多做的是「逐笔核定 / 多段并入 / 两套口径择优」。

describe('劳务报酬预扣预缴（deep）：并入汇算时，收入额得自己减 6 万', () => {
    test('全年只有一笔劳务 30000：预扣 5200，汇算应全额退回（差额 −5200）', () => {
        // 预扣：30000 ×（1 − 20%）= 24000 → 24000 × 30% − 2000 = 5200
        // 汇算：收入额 24000，全年无其他所得 → 6 万基本减除一次都没用过 → 应纳税所得额 0 → 汇算 0
        const v = { type: 'labor', mergeByMonth: true, payments: [{ month: 1, amount: 30000 }], otherTaxable: 0 };
        expect(primaryOf('withholding-deep', v)).toBe(5200);
        expect(rowOf('withholding-deep', v, '汇算差额')).toBe(-5200);
    });

    test('另有工资应税 60000：并入后 84000 → 增量 2400，预扣 5200 退 2800', () => {
        // T(84000) = 84000 × 10% − 2520 = 5880；T(60000) = 3480 → 增量 2400（6 万已被工资用掉）
        const v = { type: 'labor', mergeByMonth: true, payments: [{ month: 1, amount: 30000 }], otherTaxable: 60000 };
        expect(rowOf('withholding-deep', v, '汇算后的增量税负')).toBe(2400);
        expect(rowOf('withholding-deep', v, '汇算差额')).toBe(-2800);
    });
});

describe('年终奖择优与股权激励（deep）：两套口径都要给，不能只报一个数', () => {
    test('其他应税 60000 + 奖金 36000：单独 3480 + 1080 = 4560；并入 7080；差 2520', () => {
        const v = { otherTaxable: 60000, bonus: 36000, splittable: false };
        expect(rowOf('bonus-tax-deep', v, '单独计税：全年个税合计')).toBe(4560);
        expect(rowOf('bonus-tax-deep', v, '并入综合所得：全年个税合计')).toBe(7080);
        expect(primaryOf('bonus-tax-deep', v)).toBe(4560);
    });

    test('股权激励 10 万 + 其他应税 60000：7480 + 3480 = 10960；并入对照 15080', () => {
        const v = { otherTaxable: 60000, deferred: false, plannable: false,
            grants: [{ month: 3, type: 'option', qty: 10000, price: 20, cost: 10, grantPrice: 15 }] };
        expect(rowOf('equity-deep', v, '现行：股权激励应纳个税')).toBe(7480);
        expect(primaryOf('equity-deep', v)).toBe(10960);
        expect(rowOf('equity-deep', v, '若并入综合所得（对照）')).toBe(15080);
    });
});

describe('离职补偿（deep）：免税看社平 3 倍，不看《劳动合同法》的法定标准', () => {
    test('经济补偿 12 万在 3 倍社平 36 万以内 → 0；竞业限制 6 万并入 → 多出 6000', () => {
        const v = { avgWage: 120000, monthlyWage: 15000, years: 8, extraMonths: 0, socialDeduction: 0,
            otherTaxable: 60000, installments: false,
            items: [{ kind: 'economic', amount: 120000 }, { kind: 'noncompete', amount: 60000 }] };
        expect(rowOf('severance-deep', v, '一次性补偿应纳个税')).toBe(0);
        // 并入口径：60000 + 60000 = 120000 → 9480；其他所得 60000 → 3480；差额 6000
        expect(primaryOf('severance-deep', v)).toBe(6000);
    });

    test('补偿 50 万远超法定上限 20 万：免税仍按社平 3 倍 36 万 → 应税 14 万 → 11480', () => {
        // 财税〔2018〕164 号只按「社平 3 倍」划线，不区分发放金额是否符合《劳动合同法》法定标准。
        // 旧口径把超出法定标准的 30 万判为不免税 → 应税 30 万 → 300000 × 20% − 16920 = 43080，
        // 比政策原文口径多算 31600 元（往多算，谈离职包的人会被低估到手）。
        const v = { avgWage: 120000, monthlyWage: 20000, years: 10, extraMonths: 0, socialDeduction: 0,
            otherTaxable: 0, installments: false, items: [{ kind: 'economic', amount: 500000 }] };
        expect(rowOf('severance-deep', v, '一次性补偿应纳个税')).toBe(11480);
    });
});

describe('外籍津补贴（deep）：逐项核定后二选一，不是填多少免多少', () => {
    test('填 15 万核定后只有 8 万可免：现金 3 万、非八类 2 万、探亲超 2 次 2 万都被核减', () => {
        const v = { taxableBefore: 300000, children: 1, housing: 'rent', elderly: 'none', specialDirect: 0,
            items: [{ kind: 'housing', amount: 60000, form: 'reimburse', times: 0 },
                { kind: 'home', amount: 40000, form: 'reimburse', times: 4 },
                { kind: 'education', amount: 30000, form: 'cash', times: 0 },
                { kind: 'other', amount: 20000, form: 'reimburse', times: 0 }] };
        expect(primaryOf('expat-deep', v)).toBe(80000);
        // T(300000) − T(220000) = 43080 − 27080 = 16000；专项附加 42000 → 43080 − 34680 = 8400
        expect(rowOf('expat-deep', v, '选津补贴免税可省')).toBe(16000);
        expect(rowOf('expat-deep', v, '选专项附加扣除可省')).toBe(8400);
    });
});

describe('汇算与专项附加（deep）：同一口径在速算器与完整测算里要一致', () => {
    test('月薪 15000 全年：180000 − 6 万 − 三险一金 18000 − 专项附加 12000 = 90000 → 6480，不补不退', () => {
        const v = { labor: 0, author: 0, royalty: 0, specialOverride: 'auto', medicalSelfPay: 0,
            otherDeduction: 0, bonus: 0, bonusDeclared: 'separate', prepaidTax: 0,
            jobs: [{ monthlyIncome: 15000, months: 12, monthlyInsurance: 1500, monthlySpecial: 1000 }] };
        expect(rowOf('annual-settlement-deep', v, '全年应纳税额')).toBe(6480);
        expect(primaryOf('annual-settlement-deep', v)).toBe(0);
    });

    test('本人应税 102000、1 个子女：7680 − 5280 = 2400（这一例恰好不跨档）', () => {
        const v = { selfMonthlyIncome: 15000, selfMonthlyInsurance: 1500, selfOtherDeduction: 0,
            spouseMonthlyIncome: 0, spouseMonthlyInsurance: 0, spouseOtherDeduction: 0,
            children: 1, childMonths: 12, childShare: 'auto', infants: 0, infantMonths: 12, infantShare: 'auto',
            housing: 'none', elderly: 'none', elderlyMonths: 12, degreeMonths: 0, certCount: 0,
            medicalSelfPaid: 0, medicalShare: 'auto' };
        expect(primaryOf('special-deduction-deep', v)).toBe(2400);
    });
});

describe('个人养老金三件套（deep）：领取按 3% 计税，净优惠要扣掉这一段', () => {
    test('缴 12000 + 健康险 2400 = 14400 × 10% = 1440；领取 180000 × 3% = 5400；净优惠 6600', () => {
        const v = { selfMonthlyIncome: 15000, selfMonthlyInsurance: 1500, selfSpecialDeduction: 0, selfOtherDeduction: 0,
            spouseMonthlyIncome: 0, spouseMonthlyInsurance: 0, spouseSpecialDeduction: 0, spouseOtherDeduction: 0,
            pensionSelf: 12000, years: 10, growthMultiple: 1.5, healthPremium: 2400, joinAnnuity: 'no' };
        expect(rowOf('private-pension-deep', v, '三项合计可扣除')).toBe(14400);
        expect(primaryOf('private-pension-deep', v)).toBe(1440);
        expect(rowOf('private-pension-deep', v, '领取时按 3% 计税')).toBe(5400);
        expect(rowOf('private-pension-deep', v, '养老金净优惠')).toBe(6600);
    });
});

describe('增值税（deep）：进项逐笔核定 —— 普票与集体福利一律不能抵', () => {
    test('销项 146900 − 核定可抵 80000 = 66900（普票 12000、服务与福利 23000 被核减）', () => {
        const v = { taxpayer: 'general', sales: 1130000, taxIncluded: false, annualSales: 4800000,
            location: 'urban', halve: false,
            inputs: [{ voucher: 'special', usage: 'business', amount: 80000 },
                { voucher: 'normal', usage: 'business', amount: 12000 },
                { voucher: 'special', usage: 'service', amount: 15000 },
                { voucher: 'special', usage: 'welfare', amount: 8000 }] };
        expect(rowOf('vat-deep', v, '销项税额')).toBe(146900);
        expect(rowOf('vat-deep', v, '核定可抵的进项税额')).toBe(80000);
        expect(primaryOf('vat-deep', v)).toBe(66900);
    });
});

describe('企业所得税（deep）：三项限额调增 + 研发加计 + 亏损弥补期', () => {
    test('利润 320 万：招待费 4 万、广宣 20 万、捐赠 0 → 加计 100 万 → 244 万 → 小微 5% = 12.2 万', () => {
        const v = { highTech: false, smeTech: false, industry: 'general', restricted: false,
            revenue: 12000000, cost: 8800000, entertainment: 100000, advertising: 2000000,
            donation: 300000, rdExpense: 1000000, currentYear: 2026,
            quarters: [
                { staffBegin: 280, staffEnd: 280, assetsBegin: 3000, assetsEnd: 3000 },
                { staffBegin: 280, staffEnd: 280, assetsBegin: 3000, assetsEnd: 3000 },
                { staffBegin: 280, staffEnd: 280, assetsBegin: 3000, assetsEnd: 3000 },
                { staffBegin: 380, staffEnd: 250, assetsBegin: 3000, assetsEnd: 3000 }],
            losses: [{ year: 2019, amount: 1500000 }] };
        // 招待费：发生额 60% = 6 万 与 收入 5‰ = 6 万 取小 → 调增 4 万
        expect(rowOf('corporate-income-tax-deep', v, '业务招待费调增')).toBe(40000);
        // 广宣：限额 = 收入 15% = 180 万，发生 200 万 → 调增 20 万（可结转以后年度）
        expect(rowOf('corporate-income-tax-deep', v, '广宣费调增')).toBe(200000);
        // 捐赠：限额 = 利润总额 12% = 38.4 万，发生 30 万 → 不调增
        expect(rowOf('corporate-income-tax-deep', v, '公益性捐赠调增')).toBe(0);
        // 2019 年亏损：一般企业弥补期 5 年（只能补到 2024 年），2026 年已过弥补期
        expect(rowOf('corporate-income-tax-deep', v, '弥补以前年度亏损（在弥补期内）')).toBe(0);
        expect(primaryOf('corporate-income-tax-deep', v)).toBe(122000);
    });
});
