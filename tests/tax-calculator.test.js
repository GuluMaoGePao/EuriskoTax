// 核心计算逻辑单元测试
// 覆盖 tax-calculator.js 中的纯函数和关键计算路径

const { loadSource } = require('./helpers/load-source');

// 加载源文件（注入到全局作用域）
beforeAll(() => {
    loadSource('src/js/calculation/tax-calculator.js');
});

describe('checkTaxBracketThreshold - 临界点提醒', () => {
    test('应纳税所得额接近 36000 临界点时应触发警告', () => {
        const result = checkTaxBracketThreshold(35000);
        expect(result.warning).toBe(true);
        expect(result.currentRate).toBe(0.03);
        expect(result.nextRate).toBe(0.10);
        expect(result.threshold).toBe(36000);
        expect(result.remaining).toBe(1000);
    });

    test('应纳税所得额接近 144000 临界点时应触发警告', () => {
        const result = checkTaxBracketThreshold(140000);
        expect(result.warning).toBe(true);
        expect(result.currentRate).toBe(0.10);
        expect(result.nextRate).toBe(0.20);
        expect(result.threshold).toBe(144000);
    });

    test('应纳税所得额远离临界点时不应触发警告', () => {
        const result = checkTaxBracketThreshold(100000);
        expect(result.warning).toBe(false);
    });

    test('应纳税所得额处于最低档时不触发警告', () => {
        const result = checkTaxBracketThreshold(10000);
        expect(result.warning).toBe(false);
    });

    test('应纳税所得额处于最高档时不触发警告', () => {
        const result = checkTaxBracketThreshold(1000000);
        expect(result.warning).toBe(false);
    });

    test('临界点 10000 元范围内才触发（边界测试）', () => {
        // 距临界点 10001 元 - 不触发
        expect(checkTaxBracketThreshold(25999).warning).toBe(false);
        // 距临界点 10000 元 - 不触发（严格大于）
        expect(checkTaxBracketThreshold(26000).warning).toBe(false);
        // 距临界点 9999 元 - 触发
        expect(checkTaxBracketThreshold(26001).warning).toBe(true);
    });
});

describe('calculateOptimalBonusAllocation - 年终奖最优分配', () => {
    test('收入等于扣除额时全部并入方案税额为 0', () => {
        // 应纳税所得额 = 60000 - 60000 = 0，全部并入税额为 0，必为最优
        const result = calculateOptimalBonusAllocation(60000, 60000);
        expect(result.allInTax).toBe(0);
        expect(result.minTax).toBeGreaterThanOrEqual(0);
        expect(result.minTax).toBeLessThanOrEqual(result.allInTax);
    });

    test('单独计税更优时应选择 separate 模式', () => {
        // 高收入场景：单独计税通常更优
        const result = calculateOptimalBonusAllocation(500000, 60000);
        expect(result.optimalMethod).toBe('separate');
        expect(result.optimalBonus).toBeGreaterThan(0);
        expect(result.optimalSalary).toBe(500000 - result.optimalBonus);
        expect(result.taxSavings).toBeGreaterThanOrEqual(0);
        expect(result.minTax).toBeLessThanOrEqual(result.allInTax);
    });

    test('最优方案的税额不应高于全部并入方案', () => {
        const result = calculateOptimalBonusAllocation(300000, 60000);
        expect(result.minTax).toBeLessThanOrEqual(result.allInTax);
    });

    test('零收入场景应正确处理', () => {
        const result = calculateOptimalBonusAllocation(0, 60000);
        expect(result.optimalBonus).toBe(0);
        expect(result.minTax).toBe(0);
    });

    test('最优年终奖应为税率表临界点之一', () => {
        const criticalPoints = [0, 36000, 144000, 300000, 420000, 660000, 960000];
        const result = calculateOptimalBonusAllocation(800000, 60000);
        if (result.optimalMethod === 'separate') {
            expect(criticalPoints).toContain(result.optimalBonus);
        }
    });

    test('返回结果应包含所有必要字段', () => {
        const result = calculateOptimalBonusAllocation(200000, 60000);
        expect(result).toHaveProperty('optimalBonus');
        expect(result).toHaveProperty('optimalSalary');
        expect(result).toHaveProperty('minTax');
        expect(result).toHaveProperty('taxSavings');
        expect(result).toHaveProperty('allInTax');
        expect(result).toHaveProperty('optimalMethod');
        expect(['include', 'separate']).toContain(result.optimalMethod);
    });
});

describe('validateCharitableDonation - 公益捐赠限额校验', () => {
    test('捐赠额在 30% 限额内应全额扣除', () => {
        const result = validateCharitableDonation(5000, 100000);
        expect(result.actualDeduction).toBe(5000);
        expect(result.excessAmount).toBe(0);
        expect(result.isExcess).toBe(false);
        expect(result.maxDeduction).toBe(30000);
        expect(result.message).toContain('允许扣除范围内');
    });

    test('捐赠额超过 30% 限额应部分扣除', () => {
        const result = validateCharitableDonation(50000, 100000);
        expect(result.actualDeduction).toBe(30000);
        expect(result.excessAmount).toBe(20000);
        expect(result.isExcess).toBe(true);
        expect(result.maxDeduction).toBe(30000);
        expect(result.message).toContain('20000.00');
    });

    test('捐赠额等于 30% 限额应全额扣除', () => {
        const result = validateCharitableDonation(30000, 100000);
        expect(result.actualDeduction).toBe(30000);
        expect(result.excessAmount).toBe(0);
        expect(result.isExcess).toBe(false);
    });

    test('零捐赠应正确处理', () => {
        const result = validateCharitableDonation(0, 100000);
        expect(result.actualDeduction).toBe(0);
        expect(result.excessAmount).toBe(0);
        expect(result.isExcess).toBe(false);
    });

    test('零应纳税所得额应正确处理', () => {
        const result = validateCharitableDonation(1000, 0);
        expect(result.actualDeduction).toBe(0);
        expect(result.excessAmount).toBe(1000);
        expect(result.isExcess).toBe(true);
    });
});

describe('calculateOtherIncome - 劳务/稿酬/特许权使用费所得', () => {
    test('劳务报酬不超过 4000 元应扣减 800 元', () => {
        const result = calculateOtherIncome(3000, 0, 0);
        expect(result.laborTaxableIncome).toBe(2200); // 3000 - 800
        expect(result.laborTax).toBe(440); // 2200 * 0.2
    });

    test('劳务报酬超过 4000 元应按 80% 计算', () => {
        const result = calculateOtherIncome(10000, 0, 0);
        expect(result.laborTaxableIncome).toBe(8000); // 10000 * 0.8
        expect(result.laborTax).toBe(1600); // 8000 * 0.2
    });

    test('劳务报酬应纳税所得额超过 20000 适用 30% 税率', () => {
        const result = calculateOtherIncome(50000, 0, 0);
        expect(result.laborTaxableIncome).toBe(40000); // 50000 * 0.8
        expect(result.laborTax).toBe(10000); // 40000 * 0.3 - 2000
    });

    test('劳务报酬应纳税所得额超过 50000 适用 40% 税率', () => {
        const result = calculateOtherIncome(100000, 0, 0);
        expect(result.laborTaxableIncome).toBe(80000); // 100000 * 0.8
        expect(result.laborTax).toBe(25000); // 80000 * 0.4 - 7000
    });

    test('稿酬所得不超过 4000 元应扣减 800 后按 70% 计算', () => {
        const result = calculateOtherIncome(0, 3000, 0);
        expect(result.authorTaxableIncome).toBe(1540); // (3000 - 800) * 0.7
        expect(result.authorTax).toBe(308); // 1540 * 0.2
    });

    test('稿酬所得超过 4000 元应按 80% 后再按 70% 计算', () => {
        const result = calculateOtherIncome(0, 10000, 0);
        expect(result.authorTaxableIncome).toBe(5600); // 10000 * 0.8 * 0.7
        expect(result.authorTax).toBe(1120); // 5600 * 0.2
    });

    test('特许权使用费不超过 4000 元应扣减 800 元', () => {
        const result = calculateOtherIncome(0, 0, 3000);
        expect(result.royaltyTaxableIncome).toBe(2200); // 3000 - 800
        expect(result.royaltyTax).toBe(440); // 2200 * 0.2
    });

    test('特许权使用费超过 4000 元应按 80% 计算', () => {
        const result = calculateOtherIncome(0, 0, 10000);
        expect(result.royaltyTaxableIncome).toBe(8000); // 10000 * 0.8
        expect(result.royaltyTax).toBe(1600); // 8000 * 0.2
    });

    test('零收入应全部返回 0', () => {
        const result = calculateOtherIncome(0, 0, 0);
        expect(result.laborTaxableIncome).toBe(0);
        expect(result.laborTax).toBe(0);
        expect(result.authorTaxableIncome).toBe(0);
        expect(result.authorTax).toBe(0);
        expect(result.royaltyTaxableIncome).toBe(0);
        expect(result.royaltyTax).toBe(0);
    });
});

describe('calculateBonusTax - 年终奖单独计税', () => {
    test('年终奖 36000 元适用 3% 税率', () => {
        const result = calculateBonusTax(36000, false);
        expect(result).toBe(1080); // 36000 * 0.03 - 0
    });

    test('年终奖 36001 元适用 10% 税率（临界点跳档）', () => {
        const result = calculateBonusTax(36001, false);
        // 36001 * 0.10 - 210 = 3390.1（使用 toBeCloseTo 避免浮点精度问题）
        expect(result).toBeCloseTo(3390.1, 5);
    });

    test('年终奖 0 元应返回 0', () => {
        expect(calculateBonusTax(0, false)).toBe(0);
    });

    test('负数年终奖应返回 0', () => {
        expect(calculateBonusTax(-1000, false)).toBe(0);
    });

    test('并入综合所得时应返回 0', () => {
        expect(calculateBonusTax(50000, true)).toBe(0);
    });

    test('年终奖 144000 元适用 10% 税率', () => {
        const result = calculateBonusTax(144000, false);
        expect(result).toBe(14190); // 144000 * 0.10 - 210
    });

    test('年终奖 144001 元适用 20% 税率', () => {
        const result = calculateBonusTax(144001, false);
        // 144001 * 0.20 - 1410 = 27390.2
        expect(result).toBeCloseTo(27390.2, 5);
    });
});

describe('calculateCumulativePrepaidTax - 累计预缴税额', () => {
    test('12 个月累计应正确计算', () => {
        // 月应纳税所得额 = 20000 - 5000 - 3000 - 2000 - 1000 - 500 - 200 - 100 = 8200
        // 年累计 = 8200 * 12 = 98400
        // 适用 10% 税率：98400 * 0.10 - 2520 = 7320
        const result = calculateCumulativePrepaidTax(12, 20000, 5000, 3000, 2000, 1000, 500, 200, 100);
        expect(result).toBe(7320);
    });

    test('月度应纳税所得额为负时按 0 累计', () => {
        // 月应纳税所得额 = 3000 - 5000 - 3000 - 2000 - 1000 - 500 - 200 - 100 = -8800 → 0
        const result = calculateCumulativePrepaidTax(12, 3000, 5000, 3000, 2000, 1000, 500, 200, 100);
        expect(result).toBe(0);
    });

    test('高收入应适用最高税率 45%', () => {
        // 月应纳税所得额 = 100000 - 5000 - 3000 - 2000 - 1000 - 500 - 200 - 100 = 88200
        // 年累计 = 88200 * 12 = 1058400 > 960000 → 适用 45%
        // 税额 = 1058400 * 0.45 - 181920 = 294360
        const result = calculateCumulativePrepaidTax(12, 100000, 5000, 3000, 2000, 1000, 500, 200, 100);
        expect(result).toBe(294360);
    });

    test('工作月数为 1 时应正确计算', () => {
        const result = calculateCumulativePrepaidTax(1, 20000, 5000, 0, 0, 0, 0, 0, 0);
        // 月应纳税 = 20000 - 5000 = 15000
        // 适用 3%：15000 * 0.03 = 450
        expect(result).toBe(450);
    });
});

describe('calculateTotalIncome - 综合所得总额', () => {
    test('应包含工资、劳务、稿酬、特许权使用费', () => {
        const otherIncome = {
            laborTaxableIncome: 40000,
            authorTaxableIncome: 20000,
            royaltyTaxableIncome: 15000
        };
        // 20000 * 12 + 40000 + 20000 + 15000 = 315000
        const result = calculateTotalIncome(20000, 12, otherIncome, 0, false);
        expect(result).toBe(315000);
    });

    test('年终奖并入综合所得时应加入总额', () => {
        const otherIncome = {
            laborTaxableIncome: 0,
            authorTaxableIncome: 0,
            royaltyTaxableIncome: 0
        };
        // 10000 * 12 + 50000 = 170000
        const result = calculateTotalIncome(10000, 12, otherIncome, 50000, true);
        expect(result).toBe(170000);
    });

    test('年终奖不并入综合所得时不应加入总额', () => {
        const otherIncome = {
            laborTaxableIncome: 0,
            authorTaxableIncome: 0,
            royaltyTaxableIncome: 0
        };
        // 10000 * 12 = 120000
        const result = calculateTotalIncome(10000, 12, otherIncome, 50000, false);
        expect(result).toBe(120000);
    });

    test('零收入场景应返回 0', () => {
        const otherIncome = {
            laborTaxableIncome: 0,
            authorTaxableIncome: 0,
            royaltyTaxableIncome: 0
        };
        expect(calculateTotalIncome(0, 12, otherIncome, 0, true)).toBe(0);
    });
});

describe('calculateIncomeTax - 综合所得税额计算', () => {
    test('应纳税所得额 36000 适用 3% 税率', () => {
        const result = calculateIncomeTax(36000);
        expect(result.totalTax).toBe(1080); // 36000 * 0.03 - 0
        expect(result.applicableRate).toBe(0.03);
        expect(result.applicableDeduction).toBe(0);
    });

    test('应纳税所得额 144000 适用 10% 税率', () => {
        const result = calculateIncomeTax(144000);
        expect(result.totalTax).toBe(11880); // 144000 * 0.10 - 2520
        expect(result.applicableRate).toBe(0.10);
    });

    test('应纳税所得额 300000 适用 20% 税率', () => {
        const result = calculateIncomeTax(300000);
        expect(result.totalTax).toBe(43080); // 300000 * 0.20 - 16920
        expect(result.applicableRate).toBe(0.20);
    });

    test('应纳税所得额 1000000 适用最高 45% 税率', () => {
        const result = calculateIncomeTax(1000000);
        // 1000000 * 0.45 - 181920 = 268080
        expect(result.totalTax).toBe(268080);
        expect(result.applicableRate).toBe(0.45);
    });

    test('应纳税所得额 0 应返回 0 税额', () => {
        const result = calculateIncomeTax(0);
        expect(result.totalTax).toBe(0);
        expect(result.applicableRate).toBe(0.03);
    });
});

describe('determinePrepaidTax - 预缴税额判定', () => {
    test('用户输入预缴税额时应优先使用', () => {
        const otherIncome = { laborTax: 1000, authorTax: 500, royaltyTax: 300 };
        const result = determinePrepaidTax(8000, 5000, otherIncome, 1200);
        expect(result).toBe(8000);
    });

    test('用户未输入预缴税额时应自动计算', () => {
        const otherIncome = { laborTax: 1000, authorTax: 500, royaltyTax: 300 };
        // 5000 + 1000 + 500 + 300 + 1200 = 8000
        const result = determinePrepaidTax(undefined, 5000, otherIncome, 1200);
        expect(result).toBe(8000);
    });

    test('用户输入 NaN 时应回退到自动计算', () => {
        const otherIncome = { laborTax: 1000, authorTax: 500, royaltyTax: 300 };
        const result = determinePrepaidTax(NaN, 5000, otherIncome, 1200);
        expect(result).toBe(8000);
    });
});

describe('calculatePreTaxIncome - 税前收入总额', () => {
    test('应正确计算所有收入项总和', () => {
        // 20000 * 12 + 50000 + 30000 + 20000 + 40000 = 380000
        const result = calculatePreTaxIncome(20000, 12, 50000, 30000, 20000, 40000);
        expect(result).toBe(380000);
    });

    test('零收入应返回 0', () => {
        expect(calculatePreTaxIncome(0, 12, 0, 0, 0, 0)).toBe(0);
    });
});
