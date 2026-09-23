// 企业所得税轻量实现与常量 / 注册表的等价性测试（阶段15 15B-2）
//
// 对拍对象（这一档与个税、增值税都不同源，没有内核可对拍，改为**口径自洽**对拍）：
//   · 一般企业 —— 应纳税所得额 × 25%；
//   · 高新技术企业 —— 减按 15%；
//   · 小型微利企业 —— **减按 25% 计入**应纳税所得额，再按 20% 税率 → 实际税负 5%（两档相乘）；
//     三个门槛（300 万 / 300 人 / 5000 万）是「且」的关系，且是**临界点**不是超额累进。
//
// 另有三件「算法对拍抓不到、但错了就会慢慢误导人」的事，也在这里钉住：
//   ① 规则必须来自常量 + 注册表（页面不维护第二份税率）；
//   ② 「5% 是乘出来的」必须是可复现的计算（0.25 × 0.20），不能只写在文案里；
//   ③ 300 万门槛的悬崖必须可复现（300 万交 15 万，301 万交 75.25 万，多 1 万利润多缴 60.25 万）；
//   ④ 小微优惠是**阶段性**的（至 2027-12-31），到期状态由注册表 statusOf 给出 ——
//      到期了没人知道比写错数字更危险。
const fs = require('fs');
const path = require('path');
const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/tax-registry.js');
    loadSource('src/js/calculation/corporate-income-tax-quick.js');
});

const html = fs.readFileSync(path.join(__dirname, '..', 'seo', 'corporate-income-tax.html'), 'utf8');

describe('企业所得税：口径来源单一（常量 + 注册表）', () => {
    test('规则来自注册表声明的全局量（不复制第二份）', () => {
        expect(window.EuriskoCorporateQuick).toBeDefined();
        const params = window.EuriskoTaxRegistry.resolveParams('corporate-income-tax');
        expect(params.rules).toBe(window.corporateIncomeTaxRules);
        expect(window.EuriskoCorporateQuick.rules()).toBe(window.corporateIncomeTaxRules);
    });

    test('法定 25% / 高新 15%；小微是「25% 计入 × 20% 税率」，实际税负 5%', () => {
        const rules = window.EuriskoCorporateQuick.rules();
        expect(rules.statutoryRate).toBe(0.25);
        expect(rules.highTechRate).toBe(0.15);
        expect(rules.small.includedRatio).toBe(0.25);
        expect(rules.small.rate).toBe(0.2);
        expect(rules.small.effectiveRate).toBeCloseTo(rules.small.includedRatio * rules.small.rate, 10);
        expect(rules.small.requireAll).toBe(true);
    });

    test('小微三个门槛：300 万应纳税所得额 / 300 人 / 5000 万资产，且须非限制禁止行业', () => {
        const s = window.EuriskoCorporateQuick.rules().small;
        expect(s.taxableCap).toBe(3000000);
        expect(s.staffCap).toBe(300);
        expect(s.assetsCap).toBe(50000000);
        expect(s.needNotRestricted).toBe(true);
    });

    test('扣除限额：业务招待费 60% 与 5‰ 孰低、广宣费 15%（可结转）、公益捐赠 12%（结转三年）', () => {
        const l = window.EuriskoCorporateQuick.rules().limits;
        expect(l.entertainment.ratioOfAmount).toBe(0.6);
        expect(l.entertainment.capOfRevenue).toBe(0.005);
        expect(l.entertainment.carryForward).toBe(false);
        expect(l.advertising.capOfRevenue).toBe(0.15);
        expect(l.advertising.carryForward).toBe(true);
        expect(l.donation.capOfProfit).toBe(0.12);
        expect(l.donation.carryForwardYears).toBe(3);
        expect(window.EuriskoCorporateQuick.rules().dividend.rate).toBe(0.2);
    });

    test('注册表登记两条：税法本体长期有效，小微优惠到 2027-12-31', () => {
        const cit = window.EuriskoTaxRegistry.get('corporate-income-tax');
        expect(cit.category).toBe('cit');
        expect(cit.effectiveFrom).toBe('2008-01-01');
        expect(cit.expiresOn).toBeNull();
        expect(cit.page).toBe('/seo/corporate-income-tax.html');
        const basis = window.EuriskoTaxRegistry.basisOf('corporate-income-tax');
        expect(basis.some((b) => b.doc.includes('主席令第 63 号'))).toBe(true);
        expect(basis.some((b) => b.doc.includes('国务院令第 512 号'))).toBe(true);

        const small = window.EuriskoTaxRegistry.get('corporate-small-low-profit');
        expect(small.expiresOn).toBe('2027-12-31');
        const smallBasis = window.EuriskoTaxRegistry.basisOf('corporate-small-low-profit');
        expect(smallBasis.some((b) => b.doc.includes('财政部 税务总局公告 2023 年第 12 号'))).toBe(true);
        expect(smallBasis.some((b) => b.doc.includes('财税〔2019〕13 号'))).toBe(true);
        expect(window.EuriskoTaxRegistry.statusOf('corporate-small-low-profit', '2027-12-30')).toMatchObject({ active: true, daysLeft: 1 });
        expect(window.EuriskoTaxRegistry.statusOf('corporate-small-low-profit', '2028-01-01')).toMatchObject({ active: false, expired: true });
    });
});

describe('企业所得税：三档税率与门槛判定', () => {
    test('示例：应纳税所得额 100 万 —— 小微 5 万 / 高新 15 万 / 一般 25 万', () => {
        const q = window.EuriskoCorporateQuick;
        expect(q.enterpriseOf({ taxable: 1000000, staff: 50, assets: 3000000 }).tax).toBeCloseTo(50000, 6);
        expect(q.enterpriseOf({ taxable: 1000000, highTech: true, staff: 500, assets: 90000000 }).tax).toBeCloseTo(150000, 6);
        expect(q.enterpriseOf({ taxable: 1000000, staff: 500, assets: 90000000 }).tax).toBeCloseTo(250000, 6);
    });

    test('5% 是乘出来的：应纳税额 = 应纳税所得额 × 25%（计入比例）× 20%（税率）', () => {
        const q = window.EuriskoCorporateQuick;
        for (const taxable of [1, 100000, 1000000, 2999999, 3000000]) {
            const r = q.enterpriseOf({ taxable: taxable, staff: 10, assets: 1000000 });
            expect(r.tax).toBeCloseTo(taxable * 0.25 * 0.2, 6);
            expect(r.effectiveRate).toBeCloseTo(0.05, 10);
        }
    });

    test('三个门槛是「且」的关系：任一超标即全额按 25%', () => {
        const q = window.EuriskoCorporateQuick;
        expect(q.enterpriseOf({ taxable: 3000000, staff: 300, assets: 50000000 }).qualified).toBe(true);
        expect(q.enterpriseOf({ taxable: 3000001, staff: 300, assets: 50000000 }).qualified).toBe(false);
        expect(q.enterpriseOf({ taxable: 100000, staff: 301, assets: 500000 }).qualified).toBe(false);
        expect(q.enterpriseOf({ taxable: 100000, staff: 10, assets: 50000001 }).qualified).toBe(false);
        expect(q.enterpriseOf({ taxable: 100000, staff: 10, assets: 100000, restricted: true }).qualified).toBe(false);
        // 超标后不是只对超出部分计税，而是全额 25%
        const over = q.enterpriseOf({ taxable: 100000, staff: 301, assets: 100000 });
        expect(over.tax).toBeCloseTo(25000, 6);
        expect(over.effectiveRate).toBeCloseTo(0.25, 10);
    });

    test('300 万是悬崖：300 万交 15 万、301 万交 75.25 万（多 1 万利润多缴 60.25 万）', () => {
        const q = window.EuriskoCorporateQuick;
        const at = q.enterpriseOf({ taxable: 3000000, staff: 10, assets: 100000 });
        expect(at.qualified).toBe(true);
        expect(at.tax).toBeCloseTo(150000, 6);
        const over = q.enterpriseOf({ taxable: 3010000, staff: 10, assets: 100000 });
        expect(over.qualified).toBe(false);
        expect(over.tax).toBeCloseTo(752500, 6);
        expect(over.tax - at.tax).toBeCloseTo(602500, 6);
        // 临界点提示：踩过门槛那一刻（多 1 元）
        expect(at.cliff.over).toBe(3000001);
        expect(at.cliff.tax).toBeCloseTo(750000.25, 6);
        expect(at.cliff.gap).toBeCloseTo(600000.25, 6);
    });

    test('高新 15% 与小微 5% 不叠加：按孰优（税额更低者）', () => {
        const q = window.EuriskoCorporateQuick;
        const both = q.enterpriseOf({ taxable: 1000000, staff: 50, assets: 3000000, highTech: true });
        expect(both.regime).toBe('small');
        expect(both.tax).toBeCloseTo(50000, 6);
        const onlyHigh = q.enterpriseOf({ taxable: 1000000, staff: 500, assets: 90000000, highTech: true });
        expect(onlyHigh.regime).toBe('highTech');
        expect(onlyHigh.tax).toBeCloseTo(150000, 6);
    });

    test('法定 25% 对照与优惠省下金额', () => {
        const r = window.EuriskoCorporateQuick.enterpriseOf({ taxable: 1000000, staff: 50, assets: 3000000 });
        expect(r.statutoryTax).toBeCloseTo(250000, 6);
        expect(r.saving).toBeCloseTo(200000, 6);
        expect(r.headroom.taxable).toBe(2000000);
        expect(r.headroom.staff).toBe(250);
        expect(r.headroom.assets).toBe(47000000);
    });

    test('非法输入按 0 处理：不报错、不产生负税额', () => {
        const r = window.EuriskoCorporateQuick.enterpriseOf({ taxable: 'abc', staff: -5, assets: 'x' });
        expect(r.taxable).toBe(0);
        expect(r.staff).toBe(0);
        expect(r.assets).toBe(0);
        expect(r.tax).toBe(0);
        expect(r.effectiveRate).toBe(0);
    });
});

describe('税后利润分红到手：企业与个人两层税负', () => {
    test('示例：100 万利润 —— 小微到手 76 万 / 高新 68 万 / 一般 60 万', () => {
        const q = window.EuriskoCorporateQuick;
        const small = q.dividendOf({ profit: 1000000, staff: 50, assets: 3000000 });
        expect(small.cit).toBeCloseTo(50000, 6);
        expect(small.afterTax).toBeCloseTo(950000, 6);
        expect(small.dividendTax).toBeCloseTo(190000, 6);
        expect(small.net).toBeCloseTo(760000, 6);
        expect(small.burden).toBeCloseTo(0.24, 10);
        expect(small.compare.general.net).toBeCloseTo(600000, 6);
        expect(small.compare.general.burden).toBeCloseTo(0.4, 10);
        expect(small.compare.highTech.net).toBeCloseTo(680000, 6);
        expect(small.compare.highTech.burden).toBeCloseTo(0.32, 10);
    });

    test('到手 = 利润 ×（1 − 企税实际税负）× 80%（分红个税 20%）', () => {
        const q = window.EuriskoCorporateQuick;
        for (const profit of [0, 500000, 1000000, 3000000]) {
            const r = q.dividendOf({ profit: profit, staff: 50, assets: 3000000 });
            expect(r.net).toBeCloseTo((profit - r.cit) * 0.8, 6);
            expect(r.totalTax).toBeCloseTo(profit - r.net, 6);
        }
    });

    test('一般企业的综合税负恒为 40%（25% 企税 + 税后 20% 个税）', () => {
        const r = window.EuriskoCorporateQuick.dividendOf({ profit: 2000000, staff: 500, assets: 90000000 });
        expect(r.burden).toBeCloseTo(0.4, 10);
    });
});

describe('常见扣除限额：孰低与结转', () => {
    test('业务招待费：60% 与收入 5‰ 孰低（20 万 → 扣 5 万，调增 15 万）', () => {
        const r = window.EuriskoCorporateQuick.deductionLimitOf({
            revenue: 10000000, profit: 1000000, entertainment: 200000
        });
        expect(r.entertainment.byAmount).toBeCloseTo(120000, 6);
        expect(r.entertainment.byRevenue).toBeCloseTo(50000, 6);
        expect(r.entertainment.deductible).toBeCloseTo(50000, 6);
        expect(r.entertainment.addBack).toBeCloseTo(150000, 6);
        expect(r.entertainment.carryForward).toBe(false);
    });

    test('两个上限都不超：60% 更低时按 60% 扣', () => {
        const r = window.EuriskoCorporateQuick.deductionLimitOf({
            revenue: 100000000, profit: 1000000, entertainment: 100000
        });
        expect(r.entertainment.deductible).toBeCloseTo(60000, 6);
        expect(r.entertainment.addBack).toBeCloseTo(40000, 6);
    });

    test('广宣费 15% 可结转、公益捐赠 12% 结转三年；调增进入应纳税所得额', () => {
        const r = window.EuriskoCorporateQuick.deductionLimitOf({
            revenue: 10000000, profit: 1000000, advertising: 2000000, donation: 200000
        });
        expect(r.advertising.deductible).toBeCloseTo(1500000, 6);
        expect(r.advertising.addBack).toBeCloseTo(500000, 6);
        expect(r.advertising.carryForward).toBe(true);
        expect(r.donation.deductible).toBeCloseTo(120000, 6);
        expect(r.donation.addBack).toBeCloseTo(80000, 6);
        expect(r.donation.carryForwardYears).toBe(3);
        expect(r.totalAddBack).toBeCloseTo(580000, 6);
        expect(r.adjustedProfit).toBeCloseTo(1580000, 6);
    });

    test('非法输入按 0 处理：不报错、不产生负数', () => {
        const r = window.EuriskoCorporateQuick.deductionLimitOf({
            revenue: 'abc', profit: -1, entertainment: -5, advertising: 'x', donation: null
        });
        expect(r.revenue).toBe(0);
        expect(r.totalAddBack).toBe(0);
        expect(r.adjustedProfit).toBe(0);
    });
});

describe('企业所得税落地页：静态口径与页面声明（爬虫不执行 JS 也能读全）', () => {
    test('页面静态税率表与常量逐档一致（25% / 20% / 15% / 20%）', () => {
        const block = (html.split('id="cit-rate-table"')[1] || '').split('</table>')[0];
        const rows = Array.from(block.matchAll(/<td class="num">([\d.]+)%<\/td>/g)).map((m) => Number(m[1]));
        const rates = window.corporateIncomeTaxRules.rates;
        expect(rows.length).toBe(rates.length);
        rows.forEach((p, i) => expect(p).toBeCloseTo(rates[i].rate * 100, 6));
    });

    test('页面静态门槛表与常量一致（300 万 / 300 人 / 5000 万）', () => {
        const block = (html.split('id="small-condition-table"')[1] || '').split('</table>')[0];
        const s = window.corporateIncomeTaxRules.small;
        expect(block).toContain(`≤ ${(s.taxableCap / 10000).toFixed(0)} 万元`);
        expect(block).toContain(`≤ ${s.staffCap} 人`);
        expect(block).toContain(`≤ ${(s.assetsCap / 10000).toFixed(0)} 万元`);
    });

    test('页面静态三档示例表可读（50000.00 / 150000.00 / 250000.00）', () => {
        ['>50000.00<', '>150000.00<', '>250000.00<'].forEach((n) => expect(html).toContain(n));
        const block = (html.split('id="cit-example-table"')[1] || '').split('</table>')[0];
        expect(block).toContain('5.0%');
        expect(block).toContain('15.0%');
        expect(block).toContain('25.0%');
    });

    test('页面静态临界点示例表可读（300 万 → 15 万；301 万 → 752500.00；750000.25）', () => {
        ['>2000000.00<', '>100000.00<', '>3000000.00<', '>150000.00<',
            '>3000001.00<', '>750000.25<', '>3010000.00<', '>752500.00<'].forEach((n) => expect(html).toContain(n));
        // 说明列里的两个差额（多 1 元 / 多 1 万元分别多缴多少）
        ['600000.25', '602500.00'].forEach((n) => expect(html).toContain(n));
    });

    test('页面静态分红示例表可读（950000.00 / 760000.00、680000.00、600000.00）', () => {
        ['>950000.00<', '>190000.00<', '>760000.00<',
            '>850000.00<', '>170000.00<', '>680000.00<',
            '>750000.00<', '>150000.00<', '>600000.00<'].forEach((n) => expect(html).toContain(n));
        const block = (html.split('id="dividend-example-table"')[1] || '').split('</table>')[0];
        expect(block).toContain('24.0%');
        expect(block).toContain('32.0%');
        expect(block).toContain('40.0%');
    });

    test('页面写明三条易错口径：5% 是乘出来的、300 万是悬崖不累进、分红还要再交 20%', () => {
        expect(html).toContain('5% 是乘出来的，不是税率');
        expect(html).toContain('300 万是悬崖，不是累进');
        expect(html).toContain('企业交完税，分红还要再交一次');
        expect(html).toContain('0.25 × 0.20 = 0.05');
        expect(html).toContain('全额');
        expect(html).toContain('孰低');
    });

    test('页面写明优惠到期日 2027 年 12 月 31 日，与注册表一致', () => {
        const expiresOn = window.EuriskoTaxRegistry.get('corporate-small-low-profit').expiresOn;
        const asChinese = `${expiresOn.slice(0, 4)} 年 ${Number(expiresOn.slice(5, 7))} 月 ${Number(expiresOn.slice(8, 10))} 日`;
        expect(html).toContain(asChinese);
    });

    test('页面含 canonical / FAQPage 结构化数据、政策文号、同源脚本与 CTA 归因参数', () => {
        expect(html).toContain('rel="canonical" href="https://euriskotax.zeabur.app/seo/corporate-income-tax.html"');
        expect(html).toContain('FAQPage');
        expect(html).toContain('主席令第 63 号');
        expect(html).toContain('国务院令第 512 号');
        expect(html).toContain('财政部 税务总局公告 2023 年第 12 号');
        expect(html).toContain('财税〔2019〕13 号');
        expect(html).toContain('/src/js/calculation/tax-constants.js');
        expect(html).toContain('/src/js/calculation/tax-registry.js');
        expect(html).toContain('/src/js/calculation/corporate-income-tax-quick.js');
        expect(html).toContain('?source=seo_cit');
    });
});
