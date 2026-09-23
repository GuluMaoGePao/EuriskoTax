// 税种注册表（阶段15 15D-1）的守护测试
//
// 注册表里最容易错、且错了不报错的三件事：
//   1. params 里写了常量名但拼错（页面读出来是 undefined，静默按 0 算）；
//   2. 政策到期日写错或漏写（页面上的「执行至 X」变成装饰，到期了没人知道）；
//   3. 页面正文自己写了一句政策依据，与注册表里登记的文号不是同一份（口径分裂的起点）。
// 这里把它们各自钉成断言：注册表 → 常量 / 注册表 → 页面 / 注册表 → sitemap 三向自洽。
const fs = require('fs');
const path = require('path');
const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/tax-registry.js');
});

const readRepoFile = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

describe('税种注册表结构与参数解析', () => {
    test('每个条目结构完整（id / 名称 / 合法类别 / 政策依据 / 生效期）', () => {
        const list = window.EuriskoTaxRegistry.list();
        expect(list.length).toBeGreaterThanOrEqual(4);
        list.forEach((t) => {
            expect(t.id).toMatch(/^[a-z-]+$/);
            expect(typeof t.name).toBe('string');
            expect(Object.keys(window.EuriskoTaxRegistry.CATEGORIES)).toContain(t.category);
            expect(Array.isArray(t.basis) && t.basis.length > 0).toBe(true);
            t.basis.forEach((b) => {
                expect(typeof b.title).toBe('string');
                expect(typeof b.doc).toBe('string');
                expect(b.doc.length).toBeGreaterThan(0);
            });
            expect(t.effectiveFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
            expect(t.expiresOn === null || /^\d{4}-\d{2}-\d{2}$/.test(t.expiresOn)).toBe(true);
        });
    });

    test('params 声明的全局量都取得到（写错常量名不会静默变 0）', () => {
        window.EuriskoTaxRegistry.list().forEach((t) => {
            const params = window.EuriskoTaxRegistry.resolveParams(t.id);
            Object.keys(t.params || {}).forEach((key) => {
                expect({ id: t.id, key, value: params[key] }).toEqual({ id: t.id, key, value: expect.anything() });
            });
        });
        expect(window.EuriskoTaxRegistry.resolveParams('withholding').rates).toBe(window.withholdingTaxRates);
        expect(window.EuriskoTaxRegistry.resolveParams('bonus').rates).toBe(window.bonusMonthlyTaxRates);
        expect(window.EuriskoTaxRegistry.resolveParams('comprehensive').rates).toBe(window.comprehensiveTaxRates);
    });

    test('未登记的税种查询返回空值（页面不会拿到 undefined 去渲染）', () => {
        const reg = window.EuriskoTaxRegistry;
        expect(reg.get('not-exist')).toBe(null);
        expect(reg.has('not-exist')).toBe(false);
        expect(reg.basisOf('not-exist')).toEqual([]);
        expect(reg.statusOf('not-exist')).toBe(null);
        expect(reg.resolveParams('not-exist')).toEqual({});
    });
});

describe('政策时效（到期提醒是注册表存在的理由之一）', () => {
    test('长期有效条目：active 且无到期日', () => {
        const s = window.EuriskoTaxRegistry.statusOf('withholding', '2026-09-14');
        expect(s).toMatchObject({ active: true, expired: false, expiresOn: null, daysLeft: null });
    });

    test('年终奖单独计税：到期日 2027-12-31，到期前一天剩 1 天、次日即过期', () => {
        const reg = window.EuriskoTaxRegistry;
        expect(reg.statusOf('bonus', '2027-12-31')).toMatchObject({ active: true, expired: false, daysLeft: 0 });
        expect(reg.statusOf('bonus', '2027-12-30')).toMatchObject({ active: true, daysLeft: 1 });
        expect(reg.statusOf('bonus', '2028-01-01')).toMatchObject({ active: false, expired: true, daysLeft: -1 });
    });

    test('expiringWithin：一年内的到期项会被列出，三十天内没有则不列', () => {
        const reg = window.EuriskoTaxRegistry;
        const withinYear = reg.expiringWithin(365, '2027-06-01');
        expect(withinYear.map((s) => s.id)).toContain('bonus');
        expect(reg.expiringWithin(30, '2026-09-14')).toEqual([]);
        // 已过期的也算「需要复核」，不能因为过了日子就不提醒
        expect(reg.expiringWithin(365, '2028-06-01').map((s) => s.id)).toContain('bonus');
    });
});

describe('注册表 ↔ 页面 ↔ sitemap 三向自洽', () => {
    const sitemap = readRepoFile('sitemap.xml');

    test('登记了落地页的条目：页面正文至少含一条注册表里的政策文号', () => {
        window.EuriskoTaxRegistry.list().filter((t) => t.page).forEach((t) => {
            const html = readRepoFile(t.page.replace(/^\//, ''));
            const hits = t.basis.filter((b) => html.includes(b.doc));
            expect({ id: t.id, page: t.page, hits: hits.length }).toEqual({ id: t.id, page: t.page, hits: expect.any(Number) });
            expect(hits.length).toBeGreaterThan(0);
        });
    });

    test('登记了落地页的条目：页面都在 sitemap 里（口径与门禁一致）', () => {
        window.EuriskoTaxRegistry.list().filter((t) => t.page).forEach((t) => {
            expect({ page: t.page, inSitemap: sitemap.includes(t.page) }).toEqual({ page: t.page, inSitemap: true });
        });
    });

    test('页面正文呈现的到期日与注册表一致（年终奖页「2027 年 12 月 31 日」）', () => {
        const bonus = window.EuriskoTaxRegistry.get('bonus');
        const html = readRepoFile('seo/bonus-tax.html');
        const asChinese = `${bonus.expiresOn.slice(0, 4)} 年 ${Number(bonus.expiresOn.slice(5, 7))} 月 ${Number(bonus.expiresOn.slice(8, 10))} 日`;
        expect(html).toContain(asChinese);
    });
});
