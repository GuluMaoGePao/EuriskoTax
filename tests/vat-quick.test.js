// 增值税轻量实现与常量 / 注册表的等价性测试（阶段15 15B-1）
//
// 对拍对象（增值税与个税不同源，这里没有内核可对拍，改为**口径自洽**对拍）：
//   · 小规模纳税人 —— 不含税销售额 × 征收率（现行 1%，法定 3% 只作对照）；
//       免征额度按**全部**不含税销售额判断、**含本数**、超过即**全额**计税。
//   · 一般纳税人 —— 销项税额 − 进项税额，销项 = 不含税销售额 × 税率，进项抵不完留抵下期。
//   · 价税分离 —— 含税价 ÷（1 + 税率）；含税价直接乘税率必然**多算**，这个差额页面必须算得出。
//
// 另有三件「算法对拍抓不到、但错了就会慢慢误导人」的事，也在这里钉住：
//   ① 规则必须来自常量 + 注册表（页面不维护第二份税率）；
//   ② 「30 万是临界点」必须是可复现的计算（多 1 分钱多缴约 3000 元），不能只写在文案里；
//   ③ 小规模的「减按 1%」是**阶段性优惠**（至 2027-12-31），到期状态由注册表 statusOf 给出，
//      页面写明到期日 —— 到期了没人知道比写错数字更危险。
const fs = require('fs');
const path = require('path');
const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/tax-registry.js');
    loadSource('src/js/calculation/vat-quick.js');
});

const html = fs.readFileSync(path.join(__dirname, '..', 'seo', 'vat.html'), 'utf8');

describe('增值税：口径来源单一（常量 + 注册表）', () => {
    test('规则来自注册表声明的全局量（不复制第二份）', () => {
        expect(window.EuriskoVatQuick).toBeDefined();
        const params = window.EuriskoTaxRegistry.resolveParams('vat');
        expect(params.rules).toBe(window.vatRules);
        expect(window.EuriskoVatQuick.rules()).toBe(window.vatRules);
    });

    test('小规模：法定 3% / 优惠 1%，月 10 万、季 30 万免征且含本数', () => {
        const r = window.EuriskoVatQuick.rules().smallScale;
        expect(r.levyRate).toBe(0.03);
        expect(r.reducedRate).toBe(0.01);
        expect(r.monthlyThreshold).toBe(100000);
        expect(r.quarterlyThreshold).toBe(300000);
        expect(r.annualSalesCap).toBe(5000000);
        expect(r.thresholdInclusive).toBe(true);
        expect(r.thresholdBasis).toBe('exclusive');
    });

    test('一般纳税人：税率档 13/9/6/0%，简易计税 3%，进项可抵扣', () => {
        const g = window.EuriskoVatQuick.rules().general;
        expect(g.rates.map((x) => x.rate)).toEqual([0.13, 0.09, 0.06, 0]);
        expect(g.simplifiedRate).toBe(0.03);
        expect(g.inputCredit).toBe(true);
    });

    test('注册表登记两个条目：增值税法本体长期有效，小规模减免到 2027-12-31', () => {
        const vat = window.EuriskoTaxRegistry.get('vat');
        expect(vat.category).toBe('vat');
        expect(vat.effectiveFrom).toBe('2026-01-01');
        expect(vat.expiresOn).toBeNull();
        expect(vat.page).toBe('/seo/vat.html');
        const basis = window.EuriskoTaxRegistry.basisOf('vat');
        expect(basis.some((b) => b.doc.includes('主席令第四十一号'))).toBe(true);
        expect(basis.some((b) => b.doc.includes('国务院令第 826 号'))).toBe(true);

        const small = window.EuriskoTaxRegistry.get('vat-small-scale');
        expect(small.expiresOn).toBe('2027-12-31');
        expect(window.EuriskoTaxRegistry.basisOf('vat-small-scale')
            .some((b) => b.doc.includes('财政部 税务总局公告 2023 年第 19 号'))).toBe(true);
        // 到期前 1 天仍有效、次日即过期（倒计时由 statusOf 统一给出）
        expect(window.EuriskoTaxRegistry.statusOf('vat-small-scale', '2027-12-30')).toMatchObject({ active: true, daysLeft: 1 });
        expect(window.EuriskoTaxRegistry.statusOf('vat-small-scale', '2028-01-01')).toMatchObject({ active: false, expired: true });
    });
});

describe('小规模纳税人：免征额度与临界点', () => {
    test('未超过额度（含本数）即免征：20 万 / 30 万都是 0 元', () => {
        const q = window.EuriskoVatQuick;
        expect(q.smallScaleOf({ sales: 200000 }).exempt).toBe(true);
        expect(q.smallScaleOf({ sales: 200000 }).tax).toBe(0);
        const at = q.smallScaleOf({ sales: 300000 });
        expect(at.exempt).toBe(true);          // 「含本数」：刚好 30 万仍免征
        expect(at.tax).toBe(0);
    });

    test('30 万是临界点：多 1 分钱即全额按 1% 计税（多缴约 3000 元）', () => {
        const q = window.EuriskoVatQuick;
        const over = q.smallScaleOf({ sales: 300000.01 });
        expect(over.exempt).toBe(false);
        expect(over.tax).toBeCloseTo(3000.0001, 6);
        expect(q.smallScaleOf({ sales: 300000 }).tax).toBe(0);
        expect(over.tax - q.smallScaleOf({ sales: 300000 }).tax).toBeGreaterThan(2999);
        // 临界点提示：免征状态下再多 1 分钱就要缴的金额
        const at = q.smallScaleOf({ sales: 300000 });
        expect(at.cliffTax).toBeCloseTo(3000.0001, 6);
    });

    test('超过额度按**全额**计税，不是只对超出部分：50 万 → 5000 元', () => {
        const q = window.EuriskoVatQuick;
        const r = q.smallScaleOf({ sales: 500000 });
        expect(r.tax).toBeCloseTo(5000, 6);
        expect(r.statutoryTax).toBeCloseTo(15000, 6);
        expect(r.saving).toBeCloseTo(10000, 6);
    });

    test('按月纳税用 10 万元额度；按季用 30 万元额度', () => {
        const q = window.EuriskoVatQuick;
        expect(q.smallScaleOf({ sales: 100000, period: 'month' }).exempt).toBe(true);
        expect(q.smallScaleOf({ sales: 100001, period: 'month' }).exempt).toBe(false);
        expect(q.smallScaleOf({ sales: 100001, period: 'quarter' }).exempt).toBe(true);
        expect(q.thresholdOf('month')).toBe(100000);
        expect(q.thresholdOf('quarter')).toBe(300000);
    });

    test('含税价先分离再判断：含税 303000 元（1%）= 不含税 30 万，仍免征', () => {
        const q = window.EuriskoVatQuick;
        const r = q.smallScaleOf({ sales: 303000, taxIncluded: true });
        expect(r.exclusive).toBeCloseTo(300000, 6);
        expect(r.exempt).toBe(true);
        expect(r.tax).toBe(0);
    });

    test('开专票的部分不享受免征：未超额度但开专票 5 万 → 缴 500 元', () => {
        const q = window.EuriskoVatQuick;
        const r = q.smallScaleOf({ sales: 200000, specialInvoice: 50000 });
        expect(r.exempt).toBe(true);
        expect(r.tax).toBeCloseTo(500, 6);
        // 专票金额不得超过销售额
        const capped = q.smallScaleOf({ sales: 200000, specialInvoice: 999999 });
        expect(capped.specialInvoice).toBe(200000);
    });

    test('非法输入按 0 处理：不报错、不产生负税额', () => {
        const r = window.EuriskoVatQuick.smallScaleOf({ sales: 'abc', specialInvoice: -1 });
        expect(r.sales).toBe(0);
        expect(r.exclusive).toBe(0);
        expect(r.exempt).toBe(true);
        expect(r.tax).toBe(0);
    });
});

describe('一般纳税人：销项 − 进项，留抵不倒欠', () => {
    test('税额 = 不含税销售额 × 税率 − 进项税额（示例三行）', () => {
        const q = window.EuriskoVatQuick;
        const a = q.generalOf({ output: 113000, rate: 0.13, taxIncluded: true, input: 8000 });
        expect(a.exclusive).toBeCloseTo(100000, 6);
        expect(a.outputTax).toBeCloseTo(13000, 6);
        expect(a.tax).toBeCloseTo(5000, 6);

        const b = q.generalOf({ output: 109000, rate: 0.09, taxIncluded: true, input: 3000 });
        expect(b.exclusive).toBeCloseTo(100000, 6);
        expect(b.outputTax).toBeCloseTo(9000, 6);
        expect(b.tax).toBeCloseTo(6000, 6);

        const c = q.generalOf({ output: 106000, rate: 0.06, taxIncluded: true, input: 9000 });
        expect(c.outputTax).toBeCloseTo(6000, 6);
        expect(c.tax).toBe(0);
    });

    test('进项大于销项时留抵下期：应纳税额为 0，credit = 差额（不是欠税）', () => {
        const r = window.EuriskoVatQuick.generalOf({ output: 100000, rate: 0.06, input: 9000 });
        expect(r.outputTax).toBeCloseTo(6000, 6);
        expect(r.tax).toBe(0);
        expect(r.credit).toBeCloseTo(3000, 6);
    });

    test('实际税负率 = 应纳税额 ÷ 不含税销售额；简易计税对照不得抵扣进项', () => {
        const q = window.EuriskoVatQuick;
        const r = q.generalOf({ output: 100000, rate: 0.13, input: 8000 });
        expect(r.burden).toBeCloseTo(0.05, 10);
        expect(r.simplifiedTax).toBeCloseTo(3000, 6);   // 简易计税：100000 × 3%，与进项无关
        const noInput = q.generalOf({ output: 100000, rate: 0.13, input: 0 });
        expect(noInput.simplifiedTax).toBeCloseTo(3000, 6);
    });

    test('0% 税率（出口）：销项为 0，进项全部留抵', () => {
        const r = window.EuriskoVatQuick.generalOf({ output: 100000, rate: 0, input: 5000 });
        expect(r.outputTax).toBe(0);
        expect(r.tax).toBe(0);
        expect(r.credit).toBeCloseTo(5000, 6);
    });

    test('不含税输入不重复分离；非法输入按 0 处理', () => {
        const q = window.EuriskoVatQuick;
        expect(q.generalOf({ output: 100000, rate: 0.13 }).exclusive).toBeCloseTo(100000, 6);
        const bad = q.generalOf({ output: 'abc', rate: 'x', input: -5 });
        expect(bad.exclusive).toBe(0);
        expect(bad.tax).toBe(0);
    });
});

describe('价税分离：含税价直接乘税率必然多算', () => {
    test('含税 → 不含税：113000 @13% = 100000 + 13000', () => {
        const r = window.EuriskoVatQuick.priceSplitOf({ amount: 113000, rate: 0.13, taxIncluded: true });
        expect(r.exclusive).toBeCloseTo(100000, 6);
        expect(r.tax).toBeCloseTo(13000, 6);
        expect(r.inclusive).toBeCloseTo(113000, 6);
    });

    test('不含税 → 含税：100000 @13% = 113000', () => {
        const r = window.EuriskoVatQuick.priceSplitOf({ amount: 100000, rate: 0.13, taxIncluded: false });
        expect(r.tax).toBeCloseTo(13000, 6);
        expect(r.inclusive).toBeCloseTo(113000, 6);
    });

    test('天真算法（含税价 × 税率）多算 1690 元 —— 页面用这个差额纠偏', () => {
        const r = window.EuriskoVatQuick.priceSplitOf({ amount: 113000, rate: 0.13, taxIncluded: true });
        const naive = r.amount * r.rate;
        expect(naive).toBeCloseTo(14690, 6);
        expect(naive - r.tax).toBeCloseTo(1690, 6);
    });

    test('往返一致：含税 → 不含税 → 含税回到原值', () => {
        const q = window.EuriskoVatQuick;
        const a = q.priceSplitOf({ amount: 56789, rate: 0.09, taxIncluded: true });
        const b = q.priceSplitOf({ amount: a.exclusive, rate: 0.09, taxIncluded: false });
        expect(b.inclusive).toBeCloseTo(56789, 6);
    });
});

describe('增值税落地页：静态口径与页面声明（爬虫不执行 JS 也能读全）', () => {
    test('页面静态一般纳税人税率表与常量逐档一致（13 / 9 / 6 / 0）', () => {
        const block = (html.split('id="vat-rate-table"')[1] || '').split('</table>')[0];
        const rows = Array.from(block.matchAll(/<td class="num">([\d.]+)%<\/td><td>([^<]+)<\/td>/g))
            .map((m) => Number(m[1]));
        const rates = window.vatRules.general.rates;
        expect(rows.length).toBe(rates.length);
        rows.forEach((p, i) => expect(p).toBeCloseTo(rates[i].rate * 100, 6));
    });

    test('页面静态征收率表与常量一致（3% 法定 / 1% 优惠 / 0 免征）', () => {
        const block = (html.split('id="small-rate-table"')[1] || '').split('</table>')[0];
        const rows = Array.from(block.matchAll(/<td class="num">([\d.]+)%?<\/td>/g)).map((m) => Number(m[1]));
        expect(rows[0]).toBeCloseTo(window.vatRules.smallScale.levyRate * 100, 6);
        expect(rows[1]).toBeCloseTo(window.vatRules.smallScale.reducedRate * 100, 6);
        expect(rows[2]).toBe(0);
    });

    test('页面静态示例表可读：小规模 6000.00 / 9000.00 / 3000.00 / 5000.00 / 15000.00 / 10000.00', () => {
        ['>200000.00<', '>6000.00<', '>300000.00<', '>9000.00<',
            '>300000.01<', '>3000.00<', '>500000.00<', '>5000.00<',
            '>15000.00<', '>10000.00<'].forEach((n) => expect(html).toContain(n));
    });

    test('页面静态示例表可读：一般纳税人 113000 / 13000 / 5000、109000 / 6000、106000 / 留抵', () => {
        ['>113000.00<', '>100000.00<', '>13000.00<', '>8000.00<', '>5000.00<',
            '>109000.00<', '>9000.00<', '>6000.00<',
            '>106000.00<', '>0.00<'].forEach((n) => expect(html).toContain(n));
    });

    test('页面写明三条易错口径：价外税分离、30 万是临界点且含本数、进项留抵', () => {
        expect(html).toContain('价外税');
        expect(html).toContain('含本数');
        expect(html).toContain('全额');
        expect(html).toContain('留抵');
        expect(html).toContain('不得抵扣进项');
        expect(html).toContain('30 万是临界点，不是起征点');
    });

    test('页面写明优惠到期日 2027 年 12 月 31 日，与注册表一致', () => {
        const expiresOn = window.EuriskoTaxRegistry.get('vat-small-scale').expiresOn;
        const asChinese = `${expiresOn.slice(0, 4)} 年 ${Number(expiresOn.slice(5, 7))} 月 ${Number(expiresOn.slice(8, 10))} 日`;
        expect(html).toContain(asChinese);
    });

    test('页面含 canonical / FAQPage 结构化数据、政策文号、同源脚本与 CTA 归因参数', () => {
        expect(html).toContain('rel="canonical" href="https://euriskotax.zeabur.app/seo/vat.html"');
        expect(html).toContain('FAQPage');
        expect(html).toContain('主席令第四十一号');
        expect(html).toContain('国务院令第 826 号');
        expect(html).toContain('财政部 税务总局公告 2023 年第 19 号');
        expect(html).toContain('/src/js/calculation/tax-constants.js');
        expect(html).toContain('/src/js/calculation/tax-registry.js');
        expect(html).toContain('/src/js/calculation/vat-quick.js');
        expect(html).toContain('?source=seo_vat');
    });
});
