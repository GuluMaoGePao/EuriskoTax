// 附加税（城建税及两项教育附加）与印花税轻量实现与常量 / 注册表的等价性测试（阶段15 15B-3）
//
// 对拍对象（这一档与个税、增值税、企业所得税都不同源，没有内核可对拍，改为**口径自洽**对拍）：
//   · 城建税 —— 依法实际缴纳的增值税、消费税税额 × 所在地档位（市区 7% / 县城、镇 5% / 其他 1%）；
//   · 教育费附加 3% + 地方教育附加 2% —— 同一计税依据；
//   · 印花税 —— 计税依据 × 税目税率，计税依据**不包括列明的增值税税款**。
//
// 另有三件「算法对拍抓不到、但错了就会慢慢误导人」的事，也在这里钉住：
//   ① 规则必须来自常量 + 注册表（页面不维护第二份税率）；
//   ② 附加税的计税依据是**实际缴纳的增值税**，增值税为 0 时附加税必须是 0（不是按收入算）；
//   ③ 印花税「列明增值税才扣、未列明按全额」必须是可复现的计算，营业账簿只对增加部分；
//   ④ 六税两费减半是**阶段性**的（至 2027-12-31），且证券交易印花税**不减半** ——
//      到期了没人知道、或把不该减半的减了，比写错数字更危险。
const fs = require('fs');
const path = require('path');
const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/tax-registry.js');
    loadSource('src/js/calculation/surtax-stamp-quick.js');
});

const html = fs.readFileSync(path.join(__dirname, '..', 'seo', 'surtax-stamp-duty.html'), 'utf8');

describe('附加税与印花税：口径来源单一（常量 + 注册表）', () => {
    test('规则来自注册表声明的全局量（不复制第二份）', () => {
        expect(window.EuriskoSurtaxQuick).toBeDefined();
        expect(window.EuriskoTaxRegistry.resolveParams('surtax').rules).toBe(window.surtaxRules);
        expect(window.EuriskoTaxRegistry.resolveParams('stamp-duty').rules).toBe(window.stampDutyRules);
        expect(window.EuriskoSurtaxQuick.rules()).toBe(window.surtaxRules);
        expect(window.EuriskoSurtaxQuick.stampRules()).toBe(window.stampDutyRules);
    });

    test('城建税三档按所在地：市区 7% / 县城、镇 5% / 其他 1%；两项附加 3% 与 2%', () => {
        const rules = window.EuriskoSurtaxQuick.rules();
        const rates = rules.city.rates.map((r) => r.rate);
        expect(rates).toEqual([0.07, 0.05, 0.01]);
        expect(rules.city.rates.map((r) => r.key)).toEqual(['urban', 'county', 'other']);
        expect(rules.education.rate).toBe(0.03);
        expect(rules.localEducation.rate).toBe(0.02);
        expect(rules.city.baseNote).toContain('实际缴纳的增值税、消费税');
    });

    test('六税两费减半：减按 50%，排除证券交易印花税，至 2027-12-31', () => {
        const halve = window.EuriskoSurtaxQuick.rules().halve;
        expect(halve.ratio).toBe(0.5);
        expect(halve.excludeSecurities).toBe(true);
        expect(halve.expiresOn).toBe('2027-12-31');
        expect(window.EuriskoSurtaxQuick.stampRules().securitiesKey).toBe('securities');
    });

    test('印花税：计税依据不含列明增值税、混载从高、营业账簿只对增加部分', () => {
        const stamp = window.EuriskoSurtaxQuick.stampRules();
        expect(stamp.excludeVat).toBe(true);
        expect(stamp.fromHigherWhenMixed).toBe(true);
        expect(stamp.accountBookOnlyIncrement).toBe(true);
        expect(stamp.effectiveFrom).toBe('2022-07-01');
        const of = (key) => stamp.items.find((i) => i.key === key);
        expect(of('loan').rate).toBe(0.00005);
        expect(of('sale').rate).toBe(0.0003);
        expect(of('lease').rate).toBe(0.001);
        expect(of('equityTransfer').rate).toBe(0.0005);
        expect(of('accountBook').rate).toBe(0.00025);
        expect(of('securities').rate).toBe(0.001);
        expect(stamp.items.length).toBe(17);
    });

    test('注册表登记三条：城建税法 / 印花税法长期有效，六税两费减半至 2027-12-31', () => {
        const surtax = window.EuriskoTaxRegistry.get('surtax');
        expect(surtax.category).toBe('surtax');
        expect(surtax.effectiveFrom).toBe('2021-09-01');
        expect(surtax.expiresOn).toBeNull();
        expect(surtax.page).toBe('/seo/surtax-stamp-duty.html');
        expect(window.EuriskoTaxRegistry.basisOf('surtax').some((b) => b.doc.includes('主席令第 51 号'))).toBe(true);
        expect(window.EuriskoTaxRegistry.basisOf('surtax').some((b) => b.doc.includes('国务院令第 60 号'))).toBe(true);

        const stamp = window.EuriskoTaxRegistry.get('stamp-duty');
        expect(stamp.category).toBe('stamp');
        expect(stamp.effectiveFrom).toBe('2022-07-01');
        expect(stamp.expiresOn).toBeNull();
        expect(window.EuriskoTaxRegistry.basisOf('stamp-duty').some((b) => b.doc.includes('主席令第 89 号'))).toBe(true);

        const halve = window.EuriskoTaxRegistry.get('surtax-stamp-halve');
        expect(halve.expiresOn).toBe('2027-12-31');
        expect(window.EuriskoTaxRegistry.basisOf('surtax-stamp-halve')
            .some((b) => b.doc.includes('财政部 税务总局公告 2023 年第 12 号'))).toBe(true);
        expect(window.EuriskoTaxRegistry.statusOf('surtax-stamp-halve', '2027-12-30')).toMatchObject({ active: true, daysLeft: 1 });
        expect(window.EuriskoTaxRegistry.statusOf('surtax-stamp-halve', '2028-01-01')).toMatchObject({ active: false, expired: true });
    });
});

describe('附加税：跟着实际缴纳的增值税走', () => {
    test('示例：缴增值税 1 万元 —— 市区 1200 / 县城 1000 / 其他 600', () => {
        const q = window.EuriskoSurtaxQuick;
        expect(q.surtaxOf({ vat: 10000, location: 'urban' }).total).toBeCloseTo(1200, 6);
        expect(q.surtaxOf({ vat: 10000, location: 'county' }).total).toBeCloseTo(1000, 6);
        expect(q.surtaxOf({ vat: 10000, location: 'other' }).total).toBeCloseTo(600, 6);
        const r = q.surtaxOf({ vat: 10000, location: 'urban' });
        expect(r.cityTax).toBeCloseTo(700, 6);
        expect(r.educationTax).toBeCloseTo(300, 6);
        expect(r.localEducationTax).toBeCloseTo(200, 6);
        expect(r.statutoryRate).toBeCloseTo(0.12, 10);
    });

    test('减半后市区合计 6%（1200 → 600）', () => {
        const q = window.EuriskoSurtaxQuick;
        expect(q.surtaxOf({ vat: 10000, location: 'urban', halve: true }).total).toBeCloseTo(600, 6);
        const r = q.surtaxOf({ vat: 10000, location: 'urban', halve: true });
        expect(r.saved).toBeCloseTo(600, 6);
        expect(r.effectiveRate).toBeCloseTo(0.06, 10);
    });

    test('增值税为 0 时附加税为 0（免征增值税 → 附加税跟着免）', () => {
        const r = window.EuriskoSurtaxQuick.surtaxOf({ vat: 0, location: 'urban' });
        expect(r.base).toBe(0);
        expect(r.total).toBe(0);
        expect(r.cityTax).toBe(0);
        expect(r.educationTax).toBe(0);
        expect(r.localEducationTax).toBe(0);
    });

    test('计税依据含消费税：增值税 + 消费税', () => {
        const r = window.EuriskoSurtaxQuick.surtaxOf({ vat: 10000, consumption: 5000, location: 'urban' });
        expect(r.base).toBe(15000);
        expect(r.total).toBeCloseTo(1800, 6);
    });

    test('合计 = 计税依据 ×（城建税档位 + 3% + 2%）', () => {
        const q = window.EuriskoSurtaxQuick;
        ['urban', 'county', 'other'].forEach((loc) => {
            const r = q.surtaxOf({ vat: 12345.67, location: loc });
            expect(r.total).toBeCloseTo(r.cityTax + r.educationTax + r.localEducationTax, 6);
            expect(r.total).toBeCloseTo(12345.67 * r.statutoryRate, 1);
        });
    });

    test('非法输入按 0 处理：不报错、不产生负税额', () => {
        const r = window.EuriskoSurtaxQuick.surtaxOf({ vat: 'abc', consumption: -100, location: '不存在' });
        expect(r.base).toBe(0);
        expect(r.total).toBe(0);
        expect(r.locationKey).toBe('urban'); // 档位非法时退回市区
    });
});

describe('印花税：按税目、按列明金额', () => {
    test('示例：买卖 100 万 → 300 元；租赁 100 万 → 1000 元', () => {
        const q = window.EuriskoSurtaxQuick;
        expect(q.stampDutyOf({ item: 'sale', amount: 1000000 }).tax).toBeCloseTo(300, 6);
        expect(q.stampDutyOf({ item: 'lease', amount: 1000000 }).tax).toBeCloseTo(1000, 6);
    });

    test('示例：借款 1000 万 → 500 元；营业账簿增加 1000 万 → 2500 元；股权转让 500 万 → 2500 元', () => {
        const q = window.EuriskoSurtaxQuick;
        expect(q.stampDutyOf({ item: 'loan', amount: 10000000 }).tax).toBeCloseTo(500, 6);
        expect(q.stampDutyOf({ item: 'accountBook', amount: 10000000 }).tax).toBeCloseTo(2500, 6);
        expect(q.stampDutyOf({ item: 'equityTransfer', amount: 5000000 }).tax).toBeCloseTo(2500, 6);
    });

    test('计税依据不含列明的增值税：列明 11.5 万时按 88.5 万计税（省 34.5 元）', () => {
        const q = window.EuriskoSurtaxQuick;
        const listed = q.stampDutyOf({ item: 'sale', amount: 1000000, vat: 115000 });
        expect(listed.base).toBe(885000);
        expect(listed.tax).toBeCloseTo(265.5, 6);
        const full = q.stampDutyOf({ item: 'sale', amount: 1000000, vat: 0 });
        expect(full.tax).toBeCloseTo(300, 6);
        expect(full.tax - listed.tax).toBeCloseTo(34.5, 6);
    });

    test('减半：买卖合同 300 → 150 元；证券交易印花税不减半', () => {
        const q = window.EuriskoSurtaxQuick;
        const halved = q.stampDutyOf({ item: 'sale', amount: 1000000, halve: true });
        expect(halved.tax).toBeCloseTo(150, 6);
        expect(halved.saved).toBeCloseTo(150, 6);
        const sec = q.stampDutyOf({ item: 'securities', amount: 1000000, halve: true });
        expect(sec.halveApplicable).toBe(false);
        expect(sec.tax).toBeCloseTo(1000, 6);
        expect(sec.saved).toBe(0);
        expect(sec.onlySeller).toBe(true);
    });

    test('税率读法：万分之零点五 / 万分之三 / 千分之一 / 万分之二点五', () => {
        const t = window.EuriskoSurtaxQuick.rateText;
        expect(t(0.00005)).toBe('万分之零点五');
        expect(t(0.0003)).toBe('万分之三');
        expect(t(0.0005)).toBe('万分之五');
        expect(t(0.00025)).toBe('万分之二点五');
        expect(t(0.001)).toBe('千分之一');
    });

    test('多凭证合计：各按自己的税目分别计税后加总，并给出最高税率提示', () => {
        const q = window.EuriskoSurtaxQuick;
        const r = q.stampDutySumOf({
            entries: [
                { item: 'sale', amount: 1000000 },
                { item: 'lease', amount: 300000 },
                { item: 'loan', amount: 5000000 },
                { item: 'accountBook', amount: 2000000 }
            ]
        });
        const of = (key) => r.rows.find((x) => x.key === key);
        expect(of('sale').tax).toBeCloseTo(300, 6);
        expect(of('lease').tax).toBeCloseTo(300, 6);
        expect(of('loan').tax).toBeCloseTo(250, 6);
        expect(of('accountBook').tax).toBeCloseTo(500, 6);
        expect(r.total).toBeCloseTo(1350, 6);
        expect(r.highest.key).toBe('lease'); // 租赁合同 1‰ 最高
        const halved = q.stampDutySumOf({
            halve: true,
            entries: [{ item: 'sale', amount: 1000000 }, { item: 'lease', amount: 1000000 }]
        });
        expect(halved.total).toBeCloseTo(650, 6);
        expect(halved.saved).toBeCloseTo(650, 6);
    });

    test('非法输入按 0 处理：不报错、不产生负数', () => {
        const q = window.EuriskoSurtaxQuick;
        const r = q.stampDutyOf({ item: 'sale', amount: 'abc', vat: -100 });
        expect(r.base).toBe(0);
        expect(r.tax).toBe(0);
        expect(q.stampDutySumOf({ entries: [] }).total).toBe(0);
        // 未知税目退回买卖合同
        expect(q.stampDutyOf({ item: 'unknown', amount: 1000000 }).key).toBe('sale');
    });
});

describe('附加税与印花税落地页：静态口径与页面声明（爬虫不执行 JS 也能读全）', () => {
    test('页面静态附加税税率表与常量逐档一致（7% / 5% / 1% / 3% / 2%）', () => {
        const block = (html.split('id="surtax-rate-table"')[1] || '').split('</table>')[0];
        const rows = Array.from(block.matchAll(/<td class="num">([\d.]+)%<\/td>/g)).map((m) => Number(m[1]));
        const rules = window.EuriskoSurtaxQuick.rules();
        const asPercent = (rate) => Math.round(rate * 1000) / 10;   // 0.07 → 7（避开浮点尾差）
        expect(rows).toEqual([
            ...rules.city.rates.map((r) => asPercent(r.rate)),
            asPercent(rules.education.rate),
            asPercent(rules.localEducation.rate)
        ]);
    });

    test('页面静态印花税税目税率表与常量逐行一致（17 行）', () => {
        const block = (html.split('id="stamp-rate-table"')[1] || '').split('</table>')[0];
        const rows = Array.from(block.matchAll(/<td class="num">([\d.]+)‰<\/td>/g)).map((m) => Number(m[1]) / 1000);
        const items = window.EuriskoSurtaxQuick.stampRules().items;
        expect(rows.length).toBe(items.length);
        rows.forEach((rate, i) => expect(rate).toBeCloseTo(items[i].rate, 10));
    });

    test('页面静态示例表可读（附加税 1200/1000/600 与减半 600/500/300；印花税 300/1000/500/2500）', () => {
        ['>700.00<', '>300.00<', '>200.00<', '>1200.00<', '>600.00<',
            '>500.00<', '>1000.00<', '>250.00<', '>2500.00<', '>1250.00<',
            '>10000000.00<', '>5000000.00<'].forEach((n) => expect(html).toContain(n));
    });

    test('页面写明三条易错口径：附加税跟增值税走、看凭证与列明金额、账簿只对增加部分', () => {
        expect(html).toContain('附加税跟着增值税走，不是跟着收入走');
        expect(html).toContain('印花税看的是「凭证」和「列明的金额」');
        expect(html).toContain('营业账簿只对「增加部分」计税');
        expect(html).toContain('不包括列明的增值税税款');
        expect(html).toContain('从高');
    });

    test('页面写明减半到期日 2027 年 12 月 31 日，与注册表一致', () => {
        const expiresOn = window.EuriskoTaxRegistry.get('surtax-stamp-halve').expiresOn;
        const asChinese = `${expiresOn.slice(0, 4)} 年 ${Number(expiresOn.slice(5, 7))} 月 ${Number(expiresOn.slice(8, 10))} 日`;
        expect(html).toContain(asChinese);
    });

    test('页面含 canonical / FAQPage 结构化数据、政策文号、同源脚本与 CTA 归因参数', () => {
        expect(html).toContain('rel="canonical" href="https://euriskotax.zeabur.app/seo/surtax-stamp-duty.html"');
        expect(html).toContain('FAQPage');
        expect(html).toContain('主席令第 51 号');
        expect(html).toContain('国务院令第 60 号');
        expect(html).toContain('财综〔2010〕98 号');
        expect(html).toContain('主席令第 89 号');
        expect(html).toContain('财政部 税务总局公告 2023 年第 12 号');
        expect(html).toContain('/src/js/calculation/tax-constants.js');
        expect(html).toContain('/src/js/calculation/tax-registry.js');
        expect(html).toContain('/src/js/calculation/surtax-stamp-quick.js');
        expect(html).toContain('?source=seo_surtax');
    });
});
