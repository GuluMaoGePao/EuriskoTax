// 工资薪金个税「轻量实现」与内核的等价性测试（阶段14 SEO 落地页的配套断言）
//
// 这个文件的唯一价值：让「落地页自己算一遍」这件事**可被证明**是同一口径。
//   - 对拍对象：tax-calculator.js#calculateCumulativePrepaidTax（App 计算结果的真源）
//   - 对拍范围：六档分界点及 ±0.01 元、月数 1/2/6/7/11/12、不足起征点与非法输入
//   - 若哪天内核改了规则（或税率表被运营热改）而落地页没跟上，这里会红，
//     而不是等用户发现两个页面数字不一样
const fs = require('fs');
const path = require('path');
const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/tax-calculator.js');
    loadSource('src/js/calculation/salary-tax-quick.js');
});

// 12 个月下的每月应纳税所得额分界（= 年度累计档位上限 ÷ 12）
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
});

describe('工资个税累计预扣：落地页实现 ≡ App 内核', () => {
    test('内核与轻量实现的税率表同源（同一份 comprehensiveTaxRates）', () => {
        expect(window.EuriskoSalaryQuick).toBeDefined();
        expect(window.comprehensiveTaxRates.length).toBe(7);
        expect(window.EuriskoTaxConstants.comprehensiveTaxRates.length).toBe(7);
    });

    test('起征点与内核同源（主站表单那份已随综合所得页删除）', () => {
        const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
        // 17B-3（v1.49.0）：主站表单那个只读的 #basic-deduction 输入框随综合所得页删了 ——
        // 它原先是「两处各写一份 5000」的另一半（删它之前，这一条就是在给两份常量对账）。
        // 现在 5000 只在 tax-constants.basicDeduction 与速算器里各出现一次，
        // 口径同源改由「速算器与内核共读同一份 comprehensiveTaxRates」这类对拍守住。
        expect(indexHtml).not.toContain('id="basic-deduction"');
        expect(window.EuriskoSalaryQuick.BASIC_DEDUCTION).toBe(5000);
    });

    test('六档分界点 ±0.01 元、多个月数：两个实现逐点相同', () => {
        const diff = CASES
            .map((c) => ({
                c,
                quick: window.EuriskoSalaryQuick.taxOf(c.income, c.months, c.insurance, c.special),
                // 内核：其余扣除项（年金/商业险/税延养老）传 0
                core: calculateCumulativePrepaidTax(c.months, c.income, 5000, c.insurance, c.special, 0, 0, 0, 0),
            }))
            .filter((r) => r.quick !== r.core);
        expect(diff).toEqual([]);
    });

    test('逐月预扣明细 ≡ 内核「截至本月累计 − 截至上月累计」', () => {
        CASES.forEach((c) => {
            const quick = window.EuriskoSalaryQuick.monthlyScheduleOf(c.income, c.months, c.insurance, c.special);
            const core = [];
            let prev = 0;
            for (let k = 1; k <= c.months; k++) {
                const cumulative = calculateCumulativePrepaidTax(k, c.income, 5000, c.insurance, c.special, 0, 0, 0, 0);
                core.push(cumulative - prev);
                prev = cumulative;
            }
            expect(quick).toEqual(core);
            // 逐月相加即全年，与 taxOf 自洽
            expect(Number(quick.reduce((a, b) => a + b, 0).toFixed(6)))
                .toBe(Number(window.EuriskoSalaryQuick.taxOf(c.income, c.months, c.insurance, c.special).toFixed(6)));
        });
    });

    test('每月应纳税所得额不足 0 按 0，负值不抵后续月份', () => {
        expect(window.EuriskoSalaryQuick.monthlyTaxableOf(4000, 0, 0)).toBe(0);
        expect(window.EuriskoSalaryQuick.monthlyTaxableOf(5000, 0, 0)).toBe(0);
        expect(window.EuriskoSalaryQuick.monthlyTaxableOf(6000, 0, 0)).toBe(1000);
        expect(window.EuriskoSalaryQuick.cumulativeTaxableOf(4000, 12, 0, 0)).toBe(0);
        expect(window.EuriskoSalaryQuick.taxOf(4000, 12, 0, 0)).toBe(0);
    });

    test('非法输入返回 0 / 空表（不抛异常、不产生 NaN 渲染到页面上）', () => {
        [-1, 0, NaN, Infinity, 'abc', null, undefined].forEach((v) => {
            expect(window.EuriskoSalaryQuick.taxOf(v)).toBe(0);
            expect(window.EuriskoSalaryQuick.cumulativeTaxableOf(v, 12, 0, 0)).toBe(0);
        });
        expect(window.EuriskoSalaryQuick.monthlyScheduleOf(20000, 0, 0, 0)).toEqual([]);
        expect(window.EuriskoSalaryQuick.monthlyScheduleOf(20000, NaN, 0, 0)).toEqual([]);
        expect(window.EuriskoSalaryQuick.bracketOf(0)).toBeNull();
    });

    test('累计预扣现象属实：月薪 20000 元时首月 300 元、第 4 月起跳档', () => {
        const schedule = window.EuriskoSalaryQuick.monthlyScheduleOf(20000, 12, INSURANCE, SPECIAL);
        expect(schedule).toEqual([300, 300, 300, 580, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000]);
        expect(schedule[0]).toBeLessThan(schedule[11]);
        expect(window.EuriskoSalaryQuick.taxOf(20000, 12, INSURANCE, SPECIAL)).toBe(9480);
    });
});

// 落地页的正文必须自带静态预扣率表与逐月示例表（爬虫不执行 JS），
// 但那是「为可抓取而存在的呈现层」，不能变成第二份口径 —— 这里把它逐档钉回常量与内核。
describe('落地页静态表格 ≡ 税率常量（页面不维护第二份口径）', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'seo', 'salary-tax.html'), 'utf8');
    // 只取带 id 的表格内部，避免误伤页面其它表格
    const blockOf = (id) => {
        const m = html.match(new RegExp('<table id="' + id + '">([\\s\\S]*?)</table>'));
        return m ? m[1] : '';
    };
    const rateRows = Array.from(
        blockOf('rate-table').matchAll(/<td class="num">([\d.]+)%<\/td><td class="num">([\d,]+)<\/td>/g)
    ).map((m) => ({ pct: Number(m[1]), deduction: Number(m[2].replace(/,/g, '')) }));
    const scheduleRows = Array.from(
        blockOf('example-schedule').matchAll(/<tr><td>第 \d+ 月<\/td><td class="num">([\d.]+)<\/td><td class="num">([\d.]+)<\/td><\/tr>/g)
    ).map((m) => ({ tax: Number(m[1]), cumulative: Number(m[2]) }));

    test('页面正文里能直接读到预扣率表与逐月示例表', () => {
        expect(rateRows.length).toBe(7);
        expect(scheduleRows.length).toBe(12);
    });

    test('预扣率表七档与 comprehensiveTaxRates 逐档一致', () => {
        const fromConstants = window.comprehensiveTaxRates.map((r) => ({
            pct: Math.round(r.rate * 1000) / 10,   // 0.03 → 3（避开浮点 3.0000000000000004）
            deduction: r.deduction,
        }));
        expect(rateRows).toEqual(fromConstants);
    });

    test('逐月示例表由同源计算得出（改口径则本测试与门禁同时红）', () => {
        const schedule = window.EuriskoSalaryQuick.monthlyScheduleOf(20000, 12, INSURANCE, SPECIAL);
        let cumulative = 0;
        const expected = schedule.map((t) => {
            cumulative += t;
            return { tax: Number(t.toFixed(2)), cumulative: Number(cumulative.toFixed(2)) };
        });
        expect(scheduleRows).toEqual(expected);
    });

    test('JSON-LD 的 FAQ 与页面正文问答一一对应（避免结构化数据与正文漂移）', () => {
        const questions = Array.from(html.matchAll(/<summary>([^<]+)<\/summary>/g)).map((m) => m[1].trim());
        const ldQuestions = Array.from(html.matchAll(/"name":\s*"([^"]+)",\s*"acceptedAnswer"/g)).map((m) => m[1].trim());
        expect(questions.length).toBe(5);
        expect(ldQuestions).toEqual(questions);
    });

    test('页面计算部分只调用同源模块，未把税率或速算扣除数写进页面', () => {
        expect(html).toContain('/src/js/calculation/salary-tax-quick.js');
        expect(html).not.toMatch(/rate\s*[=:]\s*0\./);
        expect(html).not.toMatch(/deduction\s*[=:]\s*\d/);
    });

    test('页面引用的三个脚本按顺序加载均不抛错（避免落地页白屏）', () => {
        const scripts = Array.from(html.matchAll(/<script src="(\/src\/js\/[^"]+)"[^>]*><\/script>/g)).map((m) => m[1]);
        expect(scripts).toEqual([
            '/src/js/calculation/tax-constants.js',
            '/src/js/data/tax-rates-sync.js',
            '/src/js/calculation/salary-tax-quick.js',
            // 阶段20 CP-5：备案位（两号皆空时不渲染，未备案同样违规）
            '/src/js/ui/site-filing-ui.js',
        ]);
        scripts.forEach((src) => expect(() => loadSource(src.replace(/^\//, ''))).not.toThrow());
        expect(window.TaxRates).toBeDefined();
        expect(window.EuriskoSalaryQuick).toBeDefined();
    });
});
