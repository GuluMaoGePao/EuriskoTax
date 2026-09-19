// 综合所得汇算（应退/应补）「轻量实现」与内核的等价性测试（阶段14 SEO 落地页的配套断言）
//
// 这个文件的唯一价值：让「落地页自己算一遍汇算」这件事**可被证明**是同一口径。
//   - 对拍对象：tax-calculator.js#computeDeductions + #performTaxCalculation（App 汇算结果的真源）
//   - 对拍范围：六档分界点及 ±0.01 元、月数 1/2/6/7/11/12、不足起征点与非法输入、
//               「已预缴税额」手填优先与留空推演两条分支
//   - 若哪天内核改了汇算口径（或税率表被运营热改）而落地页没跟上，这里会红，
//     而不是等用户发现两个页面给出两个结论
const fs = require('fs');
const path = require('path');
const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/tax-calculator.js');
    loadSource('src/js/calculation/salary-tax-quick.js');
    loadSource('src/js/calculation/annual-settlement-quick.js');
});

// 12 个月下的每月应纳税所得额分界（= 年度档位上限 ÷ 12）
const MONTHLY_THRESHOLDS = [3000, 12000, 25000, 35000, 55000, 80000];
const INSURANCE = 3000;
const SPECIAL = 2000;

// 构造对拍用例：把「每月应纳税所得额」换算成月薪（加回起征点与各项扣除）
const CASES = [];
[1, 2, 6, 7, 11, 12].forEach((months) => {
    MONTHLY_THRESHOLDS.forEach((T) => {
        [-0.01, 0, 0.01].forEach((delta) => {
            CASES.push({ months, insurance: INSURANCE, special: SPECIAL, income: T + delta + 5000 + INSURANCE + SPECIAL });
        });
    });
    // 不足起征点 / 恰好等于起征点：应纳税所得额被夹到 0
    CASES.push({ months, insurance: INSURANCE, special: SPECIAL, income: 4000 });
    CASES.push({ months, insurance: INSURANCE, special: SPECIAL, income: 5000 + INSURANCE + SPECIAL });
    // 无五险一金、无专项附加扣除（扣除项为 0 时也必须同口径）
    CASES.push({ months, insurance: 0, special: 0, income: 30000 });
});

// 把内核变成「同一份输入 → 同一份输出」的纯函数调用：
// 扣除项走内核自己的 computeDeductions，主链路走内核自己的 performTaxCalculation
function coreOf(c, userInputPrepaidTax) {
    const deductions = computeDeductions({
        monthlyBasicDeduction: 5000,
        monthlyPensionInsurance: c.insurance,
        monthlyMedicalInsurance: 0,
        monthlyUnemploymentInsurance: 0,
        monthlyHousingFund: 0,
        monthlyElderlyDeduction: c.special,
        monthlyChildrenInfantDeduction: 0,
        monthlyHousingDeduction: 0,
        annualEducationDeduction: 0,
        annualMedicalDeduction: 0,
        annualProfessionalDeduction: 0,
        monthlyPensionDeduction: 0,
        monthlyEnterpriseAnnuity: 0,
        monthlyInsuranceOtherDeduction: 0,
        monthlyTaxDeferredPension: 0,
        annualCharitableDonation: 0,
    }, c.months);
    return performTaxCalculation({
        workMonths: c.months,
        monthlySalaryIncome: c.income,
        annualLaborIncome: 0,
        annualAuthorIncome: 0,
        annualRoyaltyIncome: 0,
        bonusIncome: 0,
        bonusInclude: false,
        userInputPrepaidTax,
        deductions,
    });
}

describe('年度汇算：落地页实现 ≡ App 内核', () => {
    test('内核与轻量实现的税率表同源（同一份 comprehensiveTaxRates）', () => {
        expect(window.EuriskoSettlementQuick).toBeDefined();
        expect(window.comprehensiveTaxRates.length).toBe(7);
        expect(window.EuriskoTaxConstants.comprehensiveTaxRates.length).toBe(7);
    });

    test('起征点与内核同源（主站表单那份已随综合所得页删除）', () => {
        const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
        // 17B-3（v1.49.0）：主站表单那个只读的 #basic-deduction 输入框随综合所得页删了 ——
        // 它原先是「两处各写一份 5000」的另一半（删它之前，这一条就是在给两份常量对账）。
        // 现在年度汇算的 60000（= 5000 × 12）与月度 5000 只在速算器里各出现一次，
        // 同源由 tax-constants 与逐点对拍守住。
        expect(indexHtml).not.toContain('id="basic-deduction"');
        expect(window.EuriskoSettlementQuick.BASIC_DEDUCTION).toBe(5000);
        expect(window.EuriskoSettlementQuick.ANNUAL_BASIC_DEDUCTION).toBe(5000 * 12);
    });

    test('六档分界点 ±0.01 元、多个月数：应纳税所得额/年度税额/已预缴/应退应补逐点相同', () => {
        const diff = CASES
            .map((c) => {
                const core = coreOf(c);
                const quick = window.EuriskoSettlementQuick.settlementOf(c.income, c.months, c.insurance, c.special);
                return {
                    c,
                    taxable: [quick.annualTaxable, core.taxDetails.taxableIncome],
                    tax: [quick.annualTax, core.taxDetails.totalTax],
                    prepaid: [quick.prepaidTax, core.taxDetails.prepaidTax],
                    refund: [quick.diff, core.taxDetails.refundTax],
                };
            })
            .filter((r) => JSON.stringify([r.taxable, r.tax, r.prepaid, r.refund].map((p) => p[0]))
                !== JSON.stringify([r.taxable, r.tax, r.prepaid, r.refund].map((p) => p[1])));
        expect(diff).toEqual([]);
    });

    test('「已预缴税额」手填优先（与主站输入框同语义：填写则以填写为准）', () => {
        const c = { months: 12, insurance: INSURANCE, special: SPECIAL, income: 20000 };
        // 内核：填写 12000 时 refundTax = 9480 - 12000 = -2520（负数 = 应退）
        const core = coreOf(c, 12000);
        const quick = window.EuriskoSettlementQuick.settlementOf(c.income, c.months, c.insurance, c.special, 12000);
        expect(quick.providedPrepaid).toBe(true);
        expect(quick.prepaidTax).toBe(core.taxDetails.prepaidTax);
        expect(quick.diff).toBe(core.taxDetails.refundTax);
        expect(quick.diff).toBe(-2520);
        expect(quick.annualTax).toBe(9480);
        // 留空（或 0）回落到累计预扣推演
        expect(window.EuriskoSettlementQuick.settlementOf(c.income, c.months, c.insurance, c.special).providedPrepaid).toBe(false);
        expect(window.EuriskoSettlementQuick.settlementOf(c.income, c.months, c.insurance, c.special, 0).providedPrepaid).toBe(false);
        expect(window.EuriskoSettlementQuick.settlementOf(c.income, c.months, c.insurance, c.special).prepaidTax).toBe(9480);
    });

    test('已预缴推演 ≡ 内核 calculateCumulativePrepaidTax ≡ 月薪页 salary-tax-quick', () => {
        CASES.forEach((c) => {
            const mine = window.EuriskoSettlementQuick.prepaidOf(c.income, c.months, c.insurance, c.special);
            const kernel = calculateCumulativePrepaidTax(c.months, c.income, 5000, c.insurance, c.special, 0, 0, 0, 0);
            const salaryPage = window.EuriskoSalaryQuick.taxOf(c.income, c.months, c.insurance, c.special);
            expect(mine).toBe(kernel);
            expect(mine).toBe(salaryPage);
        });
    });

    test('月数换算成年度口径：全年收入与全年扣除与内核一致（逐点）', () => {
        CASES.forEach((c) => {
            const core = coreOf(c);
            const quick = window.EuriskoSettlementQuick;
            expect(quick.annualIncomeOf(c.income, c.months)).toBe(core.incomeDetails.total);
            expect(quick.annualDeductionOf(c.months, c.insurance, c.special)).toBe(core.deductionDetails.total);
        });
    });

    test('应纳税所得额不足 0 按 0，负值不产生负税', () => {
        const quick = window.EuriskoSettlementQuick;
        expect(quick.annualTaxableOf(4000, 12, 0, 0)).toBe(0);
        expect(quick.annualTaxOf(4000, 12, 0, 0)).toBe(0);
        expect(quick.settlementOf(4000, 12, 0, 0).diff).toBe(0);
        expect(quick.bracketOf(0)).toBeNull();
    });

    test('非法输入返回 0 / null（不抛异常、不产生 NaN 渲染到页面上）', () => {
        const quick = window.EuriskoSettlementQuick;
        [-1, 0, NaN, Infinity, 'abc', null, undefined].forEach((v) => {
            expect(quick.annualTaxOf(v)).toBe(0);
            expect(quick.annualTaxableOf(v, 12, 0, 0)).toBe(0);
            expect(quick.prepaidOf(v, 12, 0, 0)).toBe(0);
        });
        expect(quick.settlementOf(20000, 0).annualTax).toBe(0);
        expect(quick.settlementOf(20000, NaN).diff).toBe(0);
        expect(quick.annualIncomeOf(20000, 'abc')).toBe(0);
    });

    test('典型场景数值属实：两处工资薪金合并后应补 9600 元', () => {
        const quick = window.EuriskoSettlementQuick;
        // 折算月薪 25000、12 个月 → 应纳税所得额 180000 → 20% 档（速算扣除数 16920）
        expect(quick.annualTaxableOf(25000, 12, INSURANCE, SPECIAL)).toBe(180000);
        expect(quick.annualTaxOf(25000, 12, INSURANCE, SPECIAL)).toBe(19080);
        expect(quick.settlementOf(25000, 12, INSURANCE, SPECIAL, 9480).diff).toBe(9600);
        // 年中入职 6 个月：全年收入与扣除同比例缩小，差额为 0
        expect(quick.settlementOf(20000, 6, INSURANCE, SPECIAL).diff).toBe(0);
    });
});

// 落地页的正文必须自带静态年度税率表与示例表（爬虫不执行 JS），
// 但那是「为可抓取而存在的呈现层」，不能变成第二份口径 —— 这里把它逐档/逐行钉回常量与内核。
describe('落地页静态表格 ≡ 税率常量与内核（页面不维护第二份口径）', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'seo', 'annual-settlement.html'), 'utf8');
    // 只取带 id 的表格内部，避免误伤页面其它表格
    const blockOf = (id) => {
        const m = html.match(new RegExp('<table id="' + id + '">([\\s\\S]*?)</table>'));
        return m ? m[1] : '';
    };
    const rateRows = Array.from(
        blockOf('rate-table').matchAll(/<td class="num">([\d.]+)%<\/td><td class="num">([\d,]+)<\/td>/g)
    ).map((m) => ({ pct: Number(m[1]), deduction: Number(m[2].replace(/,/g, '')) }));
    const exampleRows = Array.from(
        blockOf('example-table').matchAll(
            /<tr><td>([^<]+)<\/td><td class="num">([\d.]+)<\/td><td class="num">(\d+)<\/td><td class="num">([\d.]+)<\/td><td class="num">([\d.]+)<\/td><td class="num">(-?[\d.]+)<\/td><\/tr>/g
        )
    ).map((m) => ({
        label: m[1],
        income: Number(m[2]),
        months: Number(m[3]),
        annualTax: Number(m[4]),
        prepaid: Number(m[5]),
        diff: Number(m[6]),
    }));

    test('页面正文里能直接读到年度税率表与示例表', () => {
        expect(rateRows.length).toBe(7);
        expect(exampleRows.length).toBe(3);
    });

    test('年度税率表七档与 comprehensiveTaxRates 逐档一致', () => {
        const fromConstants = window.comprehensiveTaxRates.map((r) => ({
            pct: Math.round(r.rate * 1000) / 10,   // 0.03 → 3（避开浮点 3.0000000000000004）
            deduction: r.deduction,
        }));
        expect(rateRows).toEqual(fromConstants);
    });

    test('示例表三行由同源计算得出，且差额 = 年度应纳税额 − 已预缴税额（改口径则本测试与门禁同时红）', () => {
        const quick = window.EuriskoSettlementQuick;
        exampleRows.forEach((row) => {
            expect(row.annualTax)
                .toBe(Number(quick.annualTaxOf(row.income, row.months, INSURANCE, SPECIAL).toFixed(2)));
            expect(row.diff).toBe(Number((row.annualTax - row.prepaid).toFixed(2)));
        });
    });

    test('示例表覆盖「差额 0」「应退（负）」「应补（正）」三种方向（否则说明页面只演示了一种结论）', () => {
        const quick = window.EuriskoSettlementQuick;
        // 手填已预缴税额高于年度应纳税额 → 应退（负数）
        const refund = quick.settlementOf(exampleRows[0].income, exampleRows[0].months, INSURANCE, SPECIAL, 12000);
        expect(refund.diff).toBeLessThan(0);
        expect(exampleRows.some((r) => r.diff === 0)).toBe(true);
        expect(exampleRows.some((r) => r.diff > 0)).toBe(true);
    });

    test('JSON-LD 的 FAQ 与页面正文问答一一对应（避免结构化数据与正文漂移）', () => {
        const questions = Array.from(html.matchAll(/<summary>([^<]+)<\/summary>/g)).map((m) => m[1].trim());
        const ldQuestions = Array.from(html.matchAll(/"name":\s*"([^"]+)",\s*"acceptedAnswer"/g)).map((m) => m[1].trim());
        // 阶段15 15A-8：正文新增「多处任职 / 年中跳槽」三条问答后由 5 条变 8 条
        expect(questions.length).toBe(8);
        expect(ldQuestions).toEqual(questions);
    });

    test('页面计算部分只调用同源模块，未把税率或速算扣除数写进页面', () => {
        expect(html).toContain('/src/js/calculation/annual-settlement-quick.js');
        expect(html).not.toMatch(/rate\s*[=:]\s*0\./);
        expect(html).not.toMatch(/deduction\s*[=:]\s*\d/);
    });

    test('页面引用的三个脚本按顺序加载均不抛错（避免落地页白屏）', () => {
        const scripts = Array.from(html.matchAll(/<script src="(\/src\/js\/[^"]+)"[^>]*><\/script>/g)).map((m) => m[1]);
        expect(scripts).toEqual([
            '/src/js/calculation/tax-constants.js',
            '/src/js/data/tax-rates-sync.js',
            '/src/js/calculation/annual-settlement-quick.js',
        ]);
        scripts.forEach((src) => expect(() => loadSource(src.replace(/^\//, ''))).not.toThrow());
        expect(window.TaxRates).toBeDefined();
        expect(window.EuriskoSettlementQuick).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// 多处任职 / 年中跳槽（阶段15 15A-8）：覆盖「差额 ≠ 0」的典型场景
//
// 对拍逻辑：本段与上方单单位速算器**唯一**的口径差异是减除费用 ——
// 汇算清缴按**全年定额 60000 元**，单单位速算器按 5000 × 任职月数估算预扣。
// 因此两者在「任职满 12 个月」时必须完全一致，这构成干净的对拍点：
//   · 单段 12 个月 → 年度应纳税额 / 已预缴 / 差额 三者都相等；
//   · 多段月数合计 12 且月薪相同 → 年度应纳税额相等，但**已预缴更少**（档位重置），差额 > 0。
// 后者正是这一页存在的理由：同一个人在一家单位干满全年不补税，拆成两段就要补。
const MULTI_BOUNDARIES = [36000, 144000, 300000, 420000, 660000, 960000];

describe('多处任职 / 年中跳槽：与单单位口径对拍（减除费用 6 万定额）', () => {
    test('单段 12 个月：多段实现与单单位实现在年度税额、预缴、差额上完全一致', () => {
        const q = window.EuriskoSettlementQuick;
        for (const b of MULTI_BOUNDARIES) {
            for (const taxable of [b - 1, b, b + 1]) {
                // 反推：月薪 × 12 − (60000 + 五险一金 × 12 + 专项附加 × 12) = 目标应纳税所得额
                const insurance = 3000;
                const special = 2000;
                const salary = (taxable + 60000 + insurance * 12 + special * 12) / 12;
                const multi = q.multiJobSettlementOf({
                    jobs: [{ monthlyIncome: salary, months: 12, monthlyInsurance: insurance, monthlySpecial: special }]
                });
                const single = q.settlementOf(salary, 12, insurance, special, null);
                expect(multi.annualTaxable).toBeCloseTo(taxable, 6);
                expect(multi.annualTax).toBeCloseTo(single.annualTax, 8);
                expect(multi.autoPrepaid).toBeCloseTo(single.autoPrepaid, 8);
                expect(multi.diff).toBeCloseTo(single.diff, 8);
            }
        }
    });

    test('月薪相同、拆成两段（月数合计 12）：年度税额不变，但预缴更少 → 必须补税', () => {
        const q = window.EuriskoSettlementQuick;
        const salary = 20000;
        const insurance = 3000;
        const special = 2000;
        const single = q.settlementOf(salary, 12, insurance, special, null);
        const multi = q.multiJobSettlementOf({
            jobs: [
                { monthlyIncome: salary, months: 6, monthlyInsurance: insurance, monthlySpecial: special },
                { monthlyIncome: salary, months: 6, monthlyInsurance: insurance, monthlySpecial: special }
            ]
        });
        expect(multi.annualTax).toBeCloseTo(single.annualTax, 8);          // 汇算时合并，年度税额不变
        expect(multi.autoPrepaid).toBeLessThan(single.autoPrepaid);         // 预扣被拆成两段，速算扣除数扣了两次
        expect(multi.diff).toBeGreaterThan(0);                              // 于是要补税
        expect(multi.duplicatedBasic).toBe(0);                              // 但基本减除费用没有重复扣
    });

    test('示例① 年中跳槽：两段各 6 个月、月薪均 2 万 → 年度 9480、预缴 6960、补 2520', () => {
        const r = window.EuriskoSettlementQuick.multiJobSettlementOf({
            jobs: [
                { monthlyIncome: 20000, months: 6, monthlyInsurance: 3000, monthlySpecial: 2000 },
                { monthlyIncome: 20000, months: 6, monthlyInsurance: 3000, monthlySpecial: 2000 }
            ]
        });
        expect(r.totalIncome).toBeCloseTo(240000, 6);
        expect(r.annualTax).toBeCloseTo(9480, 6);
        expect(r.autoPrepaid).toBeCloseTo(6960, 6);
        expect(r.diff).toBeCloseTo(2520, 6);
    });

    test('示例② 多处任职：两处并行 12 个月（1.2 万 + 0.8 万）→ 补 7512，基本减除费用重复扣 6 万', () => {
        const r = window.EuriskoSettlementQuick.multiJobSettlementOf({
            jobs: [
                { monthlyIncome: 12000, months: 12, monthlyInsurance: 1800, monthlySpecial: 2000 },
                { monthlyIncome: 8000, months: 12, monthlyInsurance: 1200, monthlySpecial: 0 }
            ]
        });
        expect(r.totalIncome).toBeCloseTo(240000, 6);
        expect(r.annualTax).toBeCloseTo(9480, 6);
        expect(r.autoPrepaid).toBeCloseTo(1968, 6);
        expect(r.diff).toBeCloseTo(7512, 6);
        expect(r.duplicatedBasic).toBeCloseTo(60000, 6);
    });

    test('示例③ 跳槽 + 空档：1-6 月 2 万、10-12 月 2.5 万 → 补 1020（汇算仍减 6 万定额）', () => {
        const r = window.EuriskoSettlementQuick.multiJobSettlementOf({
            jobs: [
                { monthlyIncome: 20000, months: 6, monthlyInsurance: 3000, monthlySpecial: 2000 },
                { monthlyIncome: 25000, months: 3, monthlyInsurance: 3000, monthlySpecial: 2000 }
            ]
        });
        expect(r.totalIncome).toBeCloseTo(195000, 6);
        expect(r.annualTax).toBeCloseTo(6480, 6);
        expect(r.autoPrepaid).toBeCloseTo(5460, 6);
        expect(r.diff).toBeCloseTo(1020, 6);
        expect(r.basicDeduction).toBe(60000);
    });

    test('示例④ 年中入职：7-12 月 1.5 万 → 年度税额 0、预缴 810、**退税 810**（定额 6 万 vs 预扣只减 3 万）', () => {
        const r = window.EuriskoSettlementQuick.multiJobSettlementOf({
            jobs: [{ monthlyIncome: 15000, months: 6, monthlyInsurance: 2500, monthlySpecial: 3000 }]
        });
        expect(r.annualTax).toBeCloseTo(0, 6);
        expect(r.autoPrepaid).toBeCloseTo(810, 6);
        expect(r.diff).toBeCloseTo(-810, 6);
        // 对照：按「5000 × 任职月数」折算减除费用的口径会算出 810 元税、差额 0 —— 汇算口径才是 6 万定额
        const byMonths = window.EuriskoSettlementQuick.settlementOf(15000, 6, 2500, 3000, null);
        expect(byMonths.annualTax).toBeCloseTo(810, 6);
        expect(byMonths.diff).toBeCloseTo(0, 8);
    });

    test('专项附加扣除重复申报：填「全年只能扣一份」后给出被重复的金额', () => {
        const q = window.EuriskoSettlementQuick;
        const jobs = [
            { monthlyIncome: 12000, months: 12, monthlyInsurance: 1800, monthlySpecial: 2000 },
            { monthlyIncome: 8000, months: 12, monthlyInsurance: 1200, monthlySpecial: 2000 }
        ];
        const dup = q.multiJobSettlementOf({ jobs: jobs });
        expect(dup.duplicatedSpecial).toBe(0);                       // 不填则按各段申报合计扣
        const fixed = q.multiJobSettlementOf({ jobs: jobs, annualSpecial: 24000 });
        expect(fixed.duplicatedSpecial).toBeCloseTo(24000, 6);       // 两处都申报 → 多申报 24000
        expect(fixed.annualTax).toBeGreaterThan(dup.annualTax);
    });

    test('手填已预缴税额优先；非法输入按 0 处理', () => {
        const q = window.EuriskoSettlementQuick;
        const r = q.multiJobSettlementOf({
            jobs: [{ monthlyIncome: 20000, months: 6, monthlyInsurance: 3000, monthlySpecial: 2000 }],
            prepaidTax: 5000
        });
        expect(r.providedPrepaid).toBe(true);
        expect(r.prepaidTax).toBe(5000);

        const bad = q.multiJobSettlementOf({ jobs: [{ monthlyIncome: 'abc', months: -3 }] });
        expect(bad.totalIncome).toBe(0);
        expect(bad.annualTax).toBe(0);
        expect(bad.diff).toBe(0);

        const empty = q.multiJobSettlementOf({});
        expect(empty.totalIncome).toBe(0);
        expect(empty.jobs).toEqual([]);
    });
});

describe('汇算页「多处任职 / 年中跳槽」段落：页面声明（爬虫不执行 JS 也能读全）', () => {
    const multiHtml = fs.readFileSync(path.join(__dirname, '..', 'seo', 'annual-settlement.html'), 'utf8');

    test('页面新增多段速算器与四种典型情形示例表（2520 / 7512 / 1020 / 810）', () => {
        expect(multiHtml).toContain('id="multi-title"');
        expect(multiHtml).toContain('id="multi-example-table"');
        expect(multiHtml).toContain('>9480.00<');
        expect(multiHtml).toContain('>6960.00<');
        expect(multiHtml).toContain('>1968.00<');
        expect(multiHtml).toContain('>6480.00<');
        expect(multiHtml).toContain('>5460.00<');
        expect(multiHtml).toContain('>810.00<');
        expect(multiHtml).toContain('补 2520.00');
        expect(multiHtml).toContain('补 7512.00');
        expect(multiHtml).toContain('补 1020.00');
        expect(multiHtml).toContain('退 810.00');
    });

    test('页面写明两种补税机制与「减除费用按全年 6 万定额、不按任职月数折算」', () => {
        expect(multiHtml).toContain('档位重置');
        expect(multiHtml).toContain('速算扣除数被扣了两次');
        expect(multiHtml).toContain('全年定额 60000 元');
        expect(multiHtml).toContain('不按任职月数折算');
        expect(multiHtml).toContain('专项附加扣除同一项目只能扣一份');
        expect(multiHtml).toContain('只能扣一份');
    });

    test('新增三条常见问题：跳槽补税原因、两处任职重复扣 6 万、年中入职 6 万定额', () => {
        expect(multiHtml).toContain('一年内在两家公司上过班（年中跳槽），为什么汇算要补税？');
        expect(multiHtml).toContain('同时在两家公司领工资，会重复扣 6 万元吗？');
        expect(multiHtml).toContain('年中入职只上了半年，6 万元减除费用怎么算？');
    });
});
