// 阶段10：账户分层（free/pro）纯逻辑单测
const { loadSource } = require('./helpers/load-source.js');

loadSource('src/js/auth/plan.js');

const planLib = () => window.EuriskoPlan;

describe('EuriskoPlan 账户分层判定', () => {
    test('free / 未定义 plan 均不是专业版', () => {
        expect(planLib().isPro('free', null)).toBe(false);
        expect(planLib().isPro(undefined, null)).toBe(false);
        expect(planLib().isPro('', null)).toBe(false);
    });

    test('pro 且无过期时间 = 永久专业版（种子期授权）', () => {
        expect(planLib().isPro('pro', null)).toBe(true);
        expect(planLib().isPro('pro', '')).toBe(true);
    });

    test('pro 未过期 = true', () => {
        const future = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
        expect(planLib().isPro('pro', future)).toBe(true);
    });

    test('pro 已过期 = false', () => {
        const past = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
        expect(planLib().isPro('pro', past)).toBe(false);
    });

    test('非法过期时间按永久处理（容错）', () => {
        expect(planLib().isPro('pro', 'not-a-date')).toBe(true);
    });

    test('常量和 PRO gate 文案存在', () => {
        expect(planLib().PLAN_FREE).toBe('free');
        expect(planLib().PLAN_PRO).toBe('pro');
        expect(typeof planLib().PRO_FEATURE_HINT).toBe('string');
        expect(planLib().PRO_FEATURE_HINT.length).toBeGreaterThan(0);
    });
});
