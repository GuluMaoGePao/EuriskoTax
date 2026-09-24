// 年终奖单独计税「轻量实现」与内核的等价性测试（阶段14 SEO 落地页的配套断言）
//
// 这个文件的唯一价值：让「落地页自己算一遍」这件事**可被证明**是同一口径。
//   - 对拍对象：tax-calculator.js#calculateBonusTax（App 计算结果的真源）
//   - 对拍范围：六档临界点及其 ±1 元、档内随机点、极值与非法输入
//   - 若哪天内核改了规则而落地页没跟上，这里会红，而不是等用户发现两个页面数字不一样
const fs = require('fs');
const path = require('path');
const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/tax-calculator.js');
    loadSource('src/js/calculation/bonus-tax-quick.js');
});

// 六档临界点：月均档位上限 × 12
const THRESHOLDS = [36000, 144000, 300000, 420000, 660000, 960000];

describe('年终奖单独计税：落地页实现 ≡ App 内核', () => {
    test('内核与轻量实现的税率表同源（同一份 bonusMonthlyTaxRates）', () => {
        expect(window.EuriskoBonusQuick).toBeDefined();
        expect(window.bonusMonthlyTaxRates.length).toBe(7);
        expect(window.EuriskoTaxConstants.bonusMonthlyTaxRates.length).toBe(7);
    });

    test('六档临界点及 ±1 元：两个实现逐点相同', () => {
        const amounts = [];
        THRESHOLDS.forEach((t) => amounts.push(t - 1, t, t + 1));
        const diff = amounts
            .map((a) => ({ a, quick: window.EuriskoBonusQuick.taxOf(a), core: calculateBonusTax(a, false) }))
            .filter((r) => r.quick !== r.core);
        expect(diff).toEqual([]);
    });

    test('档内均匀采样与极值：两个实现逐点相同', () => {
        const amounts = [1, 2999.99, 12345.67, 60000, 100000.5, 999999.99, 1200000, 5000000];
        for (let a = 1000; a <= 2000000; a += 8888.88) amounts.push(Number(a.toFixed(2)));
        const diff = amounts
            .map((a) => ({ a, quick: window.EuriskoBonusQuick.taxOf(a), core: calculateBonusTax(a, false) }))
            .filter((r) => r.quick !== r.core);
        expect(diff).toEqual([]);
    });

    test('并入综合所得（bonusInclude=true）时税额为 0；轻量实现读取同一份表且可显式注入', () => {
        expect(calculateBonusTax(60000, true)).toBe(0);
        expect(window.EuriskoBonusQuick.taxOf(0)).toBe(0);
        const custom = [{ max: Infinity, rate: 0.1, deduction: 0 }];
        expect(window.EuriskoBonusQuick.taxOf(1000, custom)).toBe(100);
    });

    test('非法输入返回 0（不抛异常、不产生 NaN 渲染到页面上）', () => {
        [-1, 0, NaN, Infinity, 'abc', null, undefined].forEach((v) => {
            expect(window.EuriskoBonusQuick.taxOf(v)).toBe(0);
        });
    });

    test('临界点现象属实：36000 元多 1 元，多缴 2310.10 元（落地页表格口径）', () => {
        const at = window.EuriskoBonusQuick.taxOf(36000);
        const over = window.EuriskoBonusQuick.taxOf(36001);
        expect(at).toBe(1080);
        expect(Number((over - at).toFixed(2))).toBe(2310.1);
    });

    test('六档临界点「多 1 元多缴」金额与落地页表格一致', () => {
        const table = THRESHOLDS.map((t) => Number((window.EuriskoBonusQuick.taxOf(t + 1) - window.EuriskoBonusQuick.taxOf(t)).toFixed(2)));
        expect(table).toEqual([2310.1, 13200.2, 13750.25, 19250.3, 30250.35, 88000.45]);
    });
});

// 落地页的正文必须自带静态税率表与临界点表（爬虫不执行 JS），
// 但那是「为可抓取而存在的呈现层」，不能变成第二份口径 —— 这里把它逐档钉回常量与内核。
describe('落地页静态表格 ≡ 税率常量（页面不维护第二份口径）', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'seo', 'bonus-tax.html'), 'utf8');
    // 正文税率表：<tr><td>不超过 3000</td><td class="num">3%</td><td class="num">0</td></tr>
    const rateRows = Array.from(html.matchAll(/<td class="num">([\d.]+)%<\/td><td class="num">([\d,]+)<\/td>/g))
        .map((m) => ({ pct: Number(m[1]), deduction: Number(m[2].replace(/,/g, '')) }));
    // 临界点表：<tr><td>36000</td><td class="num">1080.00</td><td class="num">2310.10</td></tr>
    const thresholdRows = Array.from(html.matchAll(/<tr><td>(\d+)<\/td><td class="num">([\d.]+)<\/td><td class="num">([\d.]+)<\/td><\/tr>/g))
        .map((m) => ({ threshold: Number(m[1]), tax: Number(m[2]), jump: Number(m[3]) }));

    test('页面正文里能直接读到税率表与临界点表', () => {
        expect(rateRows.length).toBe(7);
        expect(thresholdRows.length).toBe(6);
    });

    test('税率表七档的税率与速算扣除数与常量文件逐档一致', () => {
        const fromConstants = window.bonusMonthlyTaxRates.map((r) => ({
            pct: Math.round(r.rate * 1000) / 10,   // 0.03 → 3（避开浮点 3.0000000000000004）
            deduction: r.deduction,
        }));
        expect(rateRows).toEqual(fromConstants);
    });

    test('临界点表三个数字由内核计算得出（改口径则本测试与门禁同时红）', () => {
        expect(thresholdRows.map((r) => r.threshold)).toEqual(THRESHOLDS);
        thresholdRows.forEach((row) => {
            const tax = window.EuriskoBonusQuick.taxOf(row.threshold);
            const jump = window.EuriskoBonusQuick.taxOf(row.threshold + 1) - tax;
            expect(Number(tax.toFixed(2))).toBe(row.tax);
            expect(Number(jump.toFixed(2))).toBe(row.jump);
        });
    });

    test('页面计算部分只调用同源模块，未自行实现档位查询', () => {
        expect(html).toContain('/src/js/calculation/bonus-tax-quick.js');
        expect(html).not.toMatch(/deduction\s*[=:]/);
    });

    test('页面引用的三个脚本按顺序加载均不抛错（避免落地页白屏）', () => {
        const scripts = Array.from(html.matchAll(/<script src="(\/src\/js\/[^"]+)"[^>]*><\/script>/g)).map((m) => m[1]);
        expect(scripts).toEqual([
            '/src/js/calculation/tax-constants.js',
            '/src/js/data/tax-rates-sync.js',
            '/src/js/calculation/bonus-tax-quick.js',
            // 阶段20 CP-5：备案位（两号皆空时不渲染，未备案同样违规）
            '/src/js/ui/site-filing-ui.js',
        ]);
        scripts.forEach((src) => expect(() => loadSource(src.replace(/^\//, ''))).not.toThrow());
        expect(window.TaxRates).toBeDefined();
        expect(window.EuriskoBonusQuick).toBeDefined();
    });
});
