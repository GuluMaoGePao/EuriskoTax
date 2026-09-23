/**
 * 税务档案（阶段19-5 · 留存机制 §3.8 ②）单测
 *
 * 这个文件钉住三件容易悄悄坏掉的事：
 *   ① 完成度怎么算（百分比与"还缺什么"必须是同一份真相，不能 UI 里再算一遍）；
 *   ② **只吸收能确定的** —— 从一次测算输入里抽档案项时，看到一个「专项附加扣除 ¥3,000」
 *      的汇总金额**不许**猜是哪几项。猜出来的档案会让"下次更准"变成假承诺，
 *      这条用例的存在就是为了防止后人"顺手优化"掉这个克制；
 *   ③ 「暂不」必须真的永久收声 —— 引导靠重复弹窗刷存在感只会把人赶走。
 *
 * @jest-environment jsdom
 */
const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    loadSource('src/js/data/tax-profile.js');
});

beforeEach(() => {
    localStorage.clear();
    window.EuriskoTaxProfile.reset();
});

const P = () => window.EuriskoTaxProfile.pure;

describe('完成度', () => {
    test('空档案 0%，五项全缺', () => {
        const c = P().completeness(P().emptyProfile());
        expect(c.percent).toBe(0);
        expect(c.filled).toBe(0);
        expect(c.total).toBe(5);
        expect(c.missing.map((i) => i.key)).toEqual(['identity', 'city', 'social', 'deductions', 'bonus']);
    });

    test('逐项补齐，进度按项数走', () => {
        let p = P().emptyProfile();
        p = P().patchProfile(p, { identity: 'employee' });
        expect(P().completeness(p).percent).toBe(20);
        p = P().patchProfile(p, { city: '北京' });
        expect(P().completeness(p).percent).toBe(40);
        p = P().patchProfile(p, { social: 'yes' });
        expect(P().completeness(p).percent).toBe(60);
        p = P().patchProfile(p, { deductions: ['children'] });
        expect(P().completeness(p).percent).toBe(80);
        p = P().patchProfile(p, { bonus: 'no' });
        expect(P().completeness(p).percent).toBe(100);
    });

    // 空数组不算"填了"：没享受任何扣除与"还没填"是两件事，不能让用户靠跳过把进度刷满
    test('专项附加扣除为空数组时不算已填', () => {
        const p = P().patchProfile(P().emptyProfile(), { deductions: [] });
        expect(P().isFilled(p, 'deductions')).toBe(false);
        expect(P().completeness(p).percent).toBe(0);
    });

    test('缺失项的提问文案按固定顺序给出（引导每次只问一句）', () => {
        const p = P().patchProfile(P().emptyProfile(), { identity: 'owner' });
        const c = P().completeness(p);
        expect(c.missing[0].key).toBe('city');
        expect(c.missing[0].ask).toMatch(/城市/);
    });
});

describe('从测算输入吸收（只吸收能确定的）', () => {
    test('城市 + 社保基数 + 年终奖能被认出来', () => {
        const res = P().absorbFromValues(P().emptyProfile(), 'salary-tax', {
            city: '上海',
            socialBase: 12000,
            bonus: 30000
        });
        expect(res.profile.city).toBe('上海');
        expect(res.profile.social).toBe('yes');
        expect(res.profile.bonus).toBe('yes');
        expect(res.absorbed).toContain('city');
    });

    test('社保布尔 false 记为「没缴」（不是当作没填）', () => {
        const res = P().absorbFromValues(P().emptyProfile(), 'salary-tax', { hasSocial: false });
        expect(res.profile.social).toBe('no');
    });

    // 下面两条都传 'vat'（通用工具，不猜身份），这样 absorbed 为 [] 才真的说明"这笔输入没学到东西"
    test('社保金额为 0 时不写（0 只说明没缴基数，不说明身份）', () => {
        const res = P().absorbFromValues(P().emptyProfile(), 'vat', { socialBase: 0 });
        expect(res.profile.social).toBe('');
        expect(res.absorbed).toEqual([]);
    });

    // 核心克制：字段名认得出是哪一项才写；只看到一个汇总金额就写进去 = 编
    test('汇总的扣除金额不猜是哪几项', () => {
        const res = P().absorbFromValues(P().emptyProfile(), 'vat', { specialDeduction: 3000 });
        expect(res.profile.deductions).toEqual([]);
        expect(res.absorbed).toEqual([]);
    });

    test('字段名认得出的扣除项才写入，且去重', () => {
        const res = P().absorbFromValues(P().emptyProfile(), 'salary-tax', {
            childrenEducation: 2000,
            rentExpense: 1500
        });
        expect(res.profile.deductions.sort()).toEqual(['children', 'rent']);
    });

    test('工具本身说明身份时才写身份（经营所得 → 个体户/老板）', () => {
        const res = P().absorbFromValues(P().emptyProfile(), 'business-income', { revenue: 100000 });
        expect(res.profile.identity).toBe('owner');
    });

    test('通用工具不猜身份（增值税：老板和代账都会用，猜了必错一半）', () => {
        const res = P().absorbFromValues(P().emptyProfile(), 'vat', { sales: 100000 });
        expect(res.profile.identity).toBe('');
    });

    test('已填的项不被后来的测算覆盖（用户自己填的优先）', () => {
        const p = P().patchProfile(P().emptyProfile(), { city: '成都' });
        const res = P().absorbFromValues(p, 'salary-tax', { city: '上海' });
        expect(res.profile.city).toBe('成都');
        expect(res.absorbed).not.toContain('city');
    });
});

describe('存储与引导开关', () => {
    test('写入落盘，重读一致', () => {
        window.EuriskoTaxProfile.patch({ identity: 'freelance' });
        expect(JSON.parse(localStorage.getItem('taxProfile')).identity).toBe('freelance');
        expect(window.EuriskoTaxProfile.get().identity).toBe('freelance');
    });

    test('档案未满时该引导，满了就不该', () => {
        expect(window.EuriskoTaxProfile.shouldNudge()).toBe(true);
        window.EuriskoTaxProfile.patch({
            identity: 'employee', city: '北京', social: 'yes', deductions: ['rent'], bonus: 'no'
        });
        expect(window.EuriskoTaxProfile.shouldNudge()).toBe(false);
    });

    // 「暂不」是永久的：这两条一起才算把"不再自动弹"钉住
    test('「暂不」后不再引导，且落盘（刷新后也不再弹）', () => {
        window.EuriskoTaxProfile.dismissNudge();
        expect(window.EuriskoTaxProfile.shouldNudge()).toBe(false);
        expect(JSON.parse(localStorage.getItem('taxProfile')).nudgeDismissed).toBe(true);
    });

    test('补档案不会把「暂不」状态洗掉', () => {
        window.EuriskoTaxProfile.dismissNudge();
        window.EuriskoTaxProfile.patch({ city: '深圳' });
        expect(window.EuriskoTaxProfile.get().nudgeDismissed).toBe(true);
        expect(window.EuriskoTaxProfile.get().city).toBe('深圳');
    });

    test('档案更新会广播事件（首页/我的页据此刷新）', () => {
        const spy = jest.fn();
        document.addEventListener('euriskotax:profile-updated', spy);
        window.EuriskoTaxProfile.patch({ city: '广州' });
        expect(spy).toHaveBeenCalled();
    });

    test('存储被写坏（非 JSON）时降级为空档案，不抛错', () => {
        localStorage.setItem('taxProfile', '{not-json');
        expect(window.EuriskoTaxProfile.get().city).toBe('');
        expect(() => window.EuriskoTaxProfile.patch({ city: '杭州' })).not.toThrow();
    });
});
