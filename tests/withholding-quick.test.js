// 劳务报酬 / 稿酬 / 特许权使用费「预扣预缴」轻量实现与内核的等价性测试（阶段15 15A-1）
//
// 这个文件的价值与 bonus/salary/annual-settlement 三个 quick 的对拍测试一致：
//   让「落地页自己算一遍」这件事**可被证明**是同一口径。
//   - 对拍对象：tax-calculator.js#calculateOtherIncome（App 计算结果的真源）
//   - 对拍范围：费用扣除临界点（800 / 4000）与预扣率分界（应纳税所得额 20000 / 50000，
//     对应收入 25000 / 62500）及其 ±1 元、档内采样、极值与非法输入
//   - 若哪天内核改了规则而落地页没跟上，这里会红，而不是等用户发现两个页面数字不一样
//
// 15D-1 的额外一层：常量搬家（20/30/40 三档与「≤4000 减 800」规则从内核搬进 tax-constants.js）
//   本身就是一次「改口径」风险，所以这里同时钉住「注册表元数据 → 常量 → 内核 → 页面」这条链：
//   注册表声明的参数名必须能在全局量里取到，页面正文呈现的政策文号必须来自注册表。
const fs = require('fs');
const path = require('path');
const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/tax-calculator.js');
    loadSource('src/js/calculation/tax-registry.js');
    loadSource('src/js/calculation/withholding-quick.js');
});

const TYPES = ['labor', 'author', 'royalty'];
const KERNEL_KEY = { labor: 'labor', author: 'author', royalty: 'royalty' };

// 内核一次算三项，这里按 type 取对应字段
function kernelOf(type, amount) {
    const args = { labor: 0, author: 0, royalty: 0 };
    args[KERNEL_KEY[type]] = amount;
    const r = calculateOtherIncome(args.labor, args.author, args.royalty);
    return { taxable: r[type + 'TaxableIncome'], tax: r[type + 'Tax'] };
}

const AMOUNTS = [
    0, 1, 799, 800, 801, 1000, 3999, 4000, 4001, 5000, 10000, 20000,
    24999, 25000, 25001, 30000, 50000, 62499, 62500, 62501, 80000, 100000, 999999.99, 5000000,
];

describe('劳务/稿酬/特许权预扣预缴：落地页实现 ≡ App 内核', () => {
    test('三种所得的税率表与费用扣除规则与常量同源（注册表声明的参数取得到）', () => {
        expect(window.EuriskoWithholdingQuick).toBeDefined();
        const params = window.EuriskoTaxRegistry.resolveParams('withholding');
        expect(params.rates).toBe(window.withholdingTaxRates);
        expect(params.rules).toBe(window.otherIncomeRules);
        expect(Object.keys(params.rates).sort()).toEqual(['author', 'labor', 'royalty']);
        expect(window.withholdingTaxRates.labor.length).toBe(3);
        expect(window.withholdingTaxRates.author.length).toBe(1);
    });

    test('应纳税所得额与预扣税额：三种所得在临界点及其 ±1 元上逐点相同', () => {
        const amounts = [];
        [800, 4000, 25000, 62500].forEach((t) => amounts.push(t - 1, t, t + 1));
        amounts.push(...AMOUNTS);
        const diff = [];
        TYPES.forEach((type) => {
            amounts.forEach((a) => {
                const quick = { taxable: window.EuriskoWithholdingQuick.taxableOf(type, a), tax: window.EuriskoWithholdingQuick.taxOf(type, a) };
                const core = kernelOf(type, a);
                if (quick.taxable !== core.taxable || quick.tax !== core.tax) {
                    diff.push({ type, a, quick, core });
                }
            });
        });
        expect(diff).toEqual([]);
    });

    test('档内均匀采样：三种所得与内核逐点相同', () => {
        const diff = [];
        for (let a = 100; a <= 200000; a += 1777.77) {
            const amount = Number(a.toFixed(2));
            TYPES.forEach((type) => {
                const quick = window.EuriskoWithholdingQuick.taxOf(type, amount);
                const core = kernelOf(type, amount).tax;
                if (quick !== core) diff.push({ type, amount, quick, core });
            });
        }
        expect(diff).toEqual([]);
    });

    test('临界点现象属实：劳务报酬 25000 元多 1 元，预扣税额跳档', () => {
        const q = window.EuriskoWithholdingQuick;
        // 25000 → 应纳税所得额 20000（20% 档顶），25001 → 20000.8 落入 30% 档
        expect(q.taxableOf('labor', 25000)).toBe(20000);
        expect(q.taxOf('labor', 25000)).toBe(4000);
        const over = q.taxOf('labor', 25001);
        expect(Number((over - 4000).toFixed(2))).toBe(0.24);
        // 应纳税所得额 50000 的档顶：收入 62500 → 50000 × 30% − 2000 = 13000
        expect(q.taxableOf('labor', 62500)).toBe(50000);
        expect(q.taxOf('labor', 62500)).toBe(13000);
    });

    test('费用扣除规则：≤4000 减 800、>4000 减 20%；稿酬再打七折', () => {
        const q = window.EuriskoWithholdingQuick;
        expect(q.expenseOf('labor', 4000)).toBe(3200);
        expect(q.expenseOf('labor', 4001)).toBe(3200.8);
        expect(q.taxableOf('author', 10000)).toBe(5600);      // 10000 × 80% × 70%
        expect(q.taxableOf('author', 3000)).toBe(1540);       // (3000 − 800) × 70%
        expect(q.taxableOf('royalty', 10000)).toBe(8000);
        expect(q.taxOf('author', 10000)).toBe(1120);          // 5600 × 20%
        expect(q.taxOf('labor', 10000)).toBe(1600);           // 8000 × 20%
    });

    test('并入综合所得的收入额折算：劳务/特许权 80%、稿酬 56%', () => {
        const q = window.EuriskoWithholdingQuick;
        expect(q.incomeOf('labor', 10000)).toBe(8000);
        expect(q.incomeOf('author', 10000)).toBe(5600);
        expect(q.incomeOf('royalty', 10000)).toBe(8000);
        // 内核本次同步产出的收入额与轻量实现一致（同源于 otherIncomeRules）
        const r = calculateOtherIncome(10000, 10000, 10000);
        expect(r.laborIncomeAmount).toBe(q.incomeOf('labor', 10000));
        expect(r.authorIncomeAmount).toBe(q.incomeOf('author', 10000));
        expect(r.royaltyIncomeAmount).toBe(q.incomeOf('royalty', 10000));
    });

    test('并入综合所得 vs 预扣预缴：差额方向与金额（正应补、负应退）', () => {
        const q = window.EuriskoWithholdingQuick;
        const low = q.compareOf('labor', 10000, 0.03);        // 全年档位 3%：并入后 240，预扣 1600 → 应退 1360
        expect(Number(low.settled.toFixed(2))).toBe(240);
        expect(Number(low.gap.toFixed(2))).toBe(-1360);
        expect(low.direction).toBe('退税');
        const high = q.compareOf('labor', 10000, 0.45);       // 全年档位 45%：并入后 3600 → 应补 2000
        expect(Number(high.settled.toFixed(2))).toBe(3600);
        expect(Number(high.gap.toFixed(2))).toBe(2000);
        expect(high.direction).toBe('补税');
        expect(q.compareOf('labor', 10000, 0.2).direction).toBe('持平');
    });

    test('非法输入返回 0（不抛异常、不产生 NaN 渲染到页面上）', () => {
        const q = window.EuriskoWithholdingQuick;
        [-1, 0, NaN, Infinity, 'abc', null, undefined, {}].forEach((v) => {
            TYPES.concat(['unknown', '']).forEach((type) => {
                expect(q.taxableOf(type, v)).toBe(0);
                expect(q.taxOf(type, v)).toBe(0);
                expect(q.incomeOf(type, v)).toBe(0);
                expect(q.settledTaxOf(type, v, 0.1)).toBe(0);
            });
        });
        expect(q.ruleOf('unknown')).toBe(null);
        expect(q.ratesOf('unknown')).toEqual([]);
        expect(q.bracketOf('labor', 0)).toBe(null);
    });

    test('注册表元数据：政策依据文号与到期日单点定义（页面不自己写口径）', () => {
        const reg = window.EuriskoTaxRegistry;
        const entry = reg.get('withholding');
        expect(entry.page).toBe('/seo/labor-withholding.html');
        expect(entry.basis.map((b) => b.doc)).toContain('国家税务总局公告 2018 年第 61 号');
        expect(reg.statusOf('withholding').expiresOn).toBe(null);
    });
});

// 落地页正文必须自带静态税率表与示例表（爬虫不执行 JS），
// 但那是「为可抓取而存在的呈现层」，不能变成第二份口径 —— 这里把它逐档钉回常量与内核。
describe('劳务报酬落地页静态表格 ≡ 税率常量（页面不维护第二份口径）', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'seo', 'labor-withholding.html'), 'utf8');
    // 只看「预扣率表」这一张（页面另有一张年度税率表，形状相同但不能混入逐档对账）
    const rateTableBlock = (html.split('id="rate-table"')[1] || '').split('</table>')[0];
    // 预扣率表：<tr><td>不超过 20000</td><td class="num">20%</td><td class="num">0</td></tr>
    const rateRows = Array.from(rateTableBlock.matchAll(/<td>([^<]+)<\/td><td class="num">([\d.]+)%<\/td><td class="num">([\d,]+)<\/td>/g))
        .map((m) => ({ range: m[1], pct: Number(m[2]), deduction: Number(m[3].replace(/,/g, '')) }));
    // 示例表：<tr><td>劳务报酬</td><td class="num">10000.00</td><td class="num">8000.00</td><td class="num">1600.00</td></tr>
    const exampleRows = Array.from(html.matchAll(/<tr><td>(劳务报酬|稿酬|特许权使用费)<\/td><td class="num">([\d.]+)<\/td><td class="num">([\d.]+)<\/td><td class="num">([\d.]+)<\/td><\/tr>/g))
        .map((m) => ({ type: m[1], amount: Number(m[2]), taxable: Number(m[3]), tax: Number(m[4]) }));

    test('页面正文里能直接读到预扣率表与示例表', () => {
        expect(rateRows.length).toBe(3);
        expect(exampleRows.length).toBe(3);
    });

    test('预扣率表三档的税率与速算扣除数与常量文件逐档一致', () => {
        const fromConstants = window.withholdingTaxRates.labor.map((r) => ({
            pct: Math.round(r.rate * 1000) / 10,
            deduction: r.deduction,
        }));
        expect(rateRows.map((r) => ({ pct: r.pct, deduction: r.deduction }))).toEqual(fromConstants);
    });

    test('年度税率表（并入综合所得对比用）与常量文件逐档一致', () => {
        const annualBlock = (html.split('id="annual-rate-table"')[1] || '').split('</table>')[0];
        const annualRows = Array.from(annualBlock.matchAll(/<td>([^<]+)<\/td><td class="num">([\d.]+)%<\/td><td class="num">([\d,]+)<\/td>/g))
            .map((m) => ({ pct: Number(m[2]), deduction: Number(m[3].replace(/,/g, '')) }));
        const fromConstants = window.comprehensiveTaxRates.map((r) => ({
            pct: Math.round(r.rate * 1000) / 10,
            deduction: r.deduction,
        }));
        expect(annualRows.length).toBe(7);
        expect(annualRows).toEqual(fromConstants);
    });

    test('示例表三个数字由内核计算得出（改口径则本测试与门禁同时红）', () => {
        const byType = { 劳务报酬: 'labor', 稿酬: 'author', 特许权使用费: 'royalty' };
        exampleRows.forEach((row) => {
            const type = byType[row.type];
            const core = kernelOf(type, row.amount);
            expect(core.taxable).toBe(row.taxable);
            expect(core.tax).toBe(row.tax);
        });
    });

    test('页面计算部分只调用同源模块，未自行实现档位查询', () => {
        expect(html).toContain('/src/js/calculation/withholding-quick.js');
        expect(html).not.toMatch(/0\.4\s*-\s*7000/);
        expect(html).not.toMatch(/deduction\s*[=:]/);
    });

    test('页面引用的四个脚本按顺序加载均不抛错（避免落地页白屏）', () => {
        const scripts = Array.from(html.matchAll(/<script src="(\/src\/js\/[^"]+)"[^>]*><\/script>/g)).map((m) => m[1]);
        expect(scripts).toEqual([
            '/src/js/calculation/tax-constants.js',
            '/src/js/calculation/tax-registry.js',
            '/src/js/data/tax-rates-sync.js',
            '/src/js/calculation/withholding-quick.js',
        ]);
        scripts.forEach((src) => expect(() => loadSource(src.replace(/^\//, ''))).not.toThrow());
        expect(window.TaxRates).toBeDefined();
        expect(window.EuriskoTaxRegistry).toBeDefined();
        expect(window.EuriskoWithholdingQuick).toBeDefined();
    });

    test('页面 CTA 与免责声明齐备（归因可回流 + 只算不报）', () => {
        expect(html).toContain('?source=seo_withholding');
        expect(html).toContain('本测算结果仅供参考，不构成税务建议');
    });
});
