// 阶段12 A3：正向月度预算表列结构守护测试
//
// 背景：该表由 utils.js 的 updateBudgetTable 动态生成，且混合使用 colspan
// 表达「类型子表」「汇算汇总」等特殊行。新增列时必须同步调整所有行的列数，
// 否则表格会错位。此测试锁定 9 列不变量与新增两列的口径。

const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/tax-calculator.js');
    loadSource('src/js/calculation/utils.js');
});

beforeEach(() => {
    document.body.innerHTML = '<table><tbody id="budget-table-body"></tbody></table>';
});

// 仅工资薪金场景：月薪 30000、月扣除 5000（基本减除费用），12 个月
// 累计应纳税所得额 = (30000 - 5000) * 12 = 300000
function setupResults(overrides = {}) {
    global.calculationResults = Object.assign({
        workMonths: 12,
        incomeDetails: {
            salary: 30000,
            bonus: 0, bonusInclude: false, bonusTax: 0,
            labor: 0, laborCalculated: 0, laborTax: 0,
            author: 0, authorCalculated: 0, authorTax: 0,
            royalty: 0, royaltyCalculated: 0, royaltyTax: 0,
            preTaxTotal: 360000
        },
        deductionDetails: {
            basic: 5000,
            pensionInsurance: 0, medicalInsurance: 0,
            unemploymentInsurance: 0, housingFund: 0,
            elderly: 0, childrenInfant: 0, housing: 0, educationDegree: 0,
            otherTotal: 0, charitableDonation: 0,
            total: 60000
        },
        taxDetails: {
            taxableIncome: 300000,
            applicableRate: 0.20,
            totalTax: 43080,
            prepaidTax: 0,
            refundTax: 0
        }
    }, overrides);
}

// 有效列数 = 各行 colspan 之和（无 colspan 记为 1）
function effectiveColumns(row) {
    return Array.from(row.querySelectorAll('td'))
        .reduce((sum, td) => sum + (parseInt(td.getAttribute('colspan'), 10) || 1), 0);
}

function bodyRows() {
    return Array.from(document.querySelectorAll('#budget-table-body tr'));
}

describe('updateBudgetTable 列结构不变量', () => {
    test('每一行的有效列数均为 9', () => {
        setupResults();
        updateBudgetTable();

        const rows = bodyRows();
        expect(rows.length).toBeGreaterThan(0);
        rows.forEach((row, idx) => {
            expect({ rowIndex: idx, columns: effectiveColumns(row) })
                .toEqual({ rowIndex: idx, columns: 9 });
        });
    });
});

describe('updateBudgetTable 新增列口径', () => {
    test('首月：税后到手 = 月收入 - 当月税额；累计收入 = 月收入', () => {
        setupResults();
        updateBudgetTable();

        const cells = Array.from(bodyRows()[0].querySelectorAll('td'))
            .map((td) => td.textContent.trim());

        // 月薪 30000、扣除 5000 → 应纳税所得额 25000，适用 3% 档，税额 750
        expect(cells[0]).toBe('1月');
        expect(cells[5]).toBe('750.00');   // 月工资应纳税额
        expect(cells[6]).toBe('29250.00'); // 税后到手 = 30000 - 750
        expect(cells[7]).toBe('30000.00'); // 累计收入 = 30000 * 1
        expect(cells[8]).toBe('750.00');   // 累计应缴
    });

    test('末月：累计收入 = 月收入 × 月数，累计应缴 = 年度应纳税额', () => {
        setupResults();
        updateBudgetTable();

        const rows = bodyRows();
        const cells = Array.from(rows[11].querySelectorAll('td'))
            .map((td) => td.textContent.trim());

        expect(cells[0]).toBe('12月');
        // 累计应纳税所得额 300000 → 20% 档，速算扣除 16920 → 43080
        expect(cells[7]).toBe('360000.00'); // 累计收入 = 30000 * 12
        expect(cells[8]).toBe('43080.00');  // 累计应缴
    });

    test('工作月数不足 12 时行数与累计收入口径同步收窄', () => {
        setupResults({
            workMonths: 6,
            incomeDetails: Object.assign({}, global.calculationResults.incomeDetails, { preTaxTotal: 180000 })
        });
        updateBudgetTable();

        const monthRows = bodyRows().filter((row) => /月$/.test(row.querySelector('td').textContent.trim()));
        expect(monthRows.length).toBe(6);

        const lastCells = Array.from(monthRows[5].querySelectorAll('td'))
            .map((td) => td.textContent.trim());
        expect(lastCells[7]).toBe('180000.00'); // 30000 * 6
    });
});
