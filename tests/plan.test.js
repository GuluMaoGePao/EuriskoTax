// 阶段10/11：账户分层（三档：基础版/体验版/专业版）纯逻辑单测
const { loadSource } = require('./helpers/load-source.js');

loadSource('src/js/auth/plan.js');

const planLib = () => window.EuriskoPlan;
const futureISO = (days) => new Date(Date.now() + days * 24 * 3600 * 1000).toISOString();
const pastISO = (days) => new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();

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
        expect(planLib().TRIAL_DAYS).toBe(14);
        expect(typeof planLib().PRO_FEATURE_HINT).toBe('string');
        expect(planLib().PRO_FEATURE_HINT.length).toBeGreaterThan(0);
    });
});

describe('EuriskoPlan 三档体系（基础版/体验版/专业版）档位描述', () => {
    test('未登录/无用户 → 无档位', () => {
        expect(planLib().describe(null)).toBeNull();
    });

    test('免费用户 = 基础版', () => {
        const t = planLib().getTier('free', null, null);
        expect(t.key).toBe('free');
        expect(t.label).toBe('基础版');
        expect(t.expiredTrial).toBeFalsy();
    });

    test('种子永久授权 = 专业版（无过期）', () => {
        const t = planLib().getTier('pro', null, 'seed');
        expect(t.key).toBe('pro');
        expect(t.label).toBe('专业版');
        expect(t.permanent).toBe(true);
        expect(t.expireAt).toBeNull();
    });

    test('正式授权未过期 = 专业版（有有效期）', () => {
        const iso = futureISO(90);
        const t = planLib().getTier('pro', iso, 'purchase');
        expect(t.key).toBe('pro');
        expect(t.permanent).toBe(false);
        expect(t.expireAt).toBe(iso);
    });

    test('体验进行中（pro + trial + 未过期）= 体验版并计算剩余天数', () => {
        const iso = futureISO(15);
        const t = planLib().getTier('pro', iso, 'trial');
        expect(t.key).toBe('trial');
        expect(t.label).toBe('体验版');
        expect(t.daysLeft).toBe(15);
        expect(t.expireAt).toBe(iso);
    });

    test('体验已到期（pro + trial + 过期）= 回落基础版且可再次领取', () => {
        const iso = pastISO(2);
        const t = planLib().getTier('pro', iso, 'trial');
        expect(t.key).toBe('free');
        expect(t.label).toBe('基础版');
        expect(t.expiredTrial).toBe(true);
        expect(t.expireAt).toBe(iso);
    });

    test('体验版剩余天数边界：不足 1 天按 1 天、永久/免费为 0', () => {
        const t1 = planLib().getTier('pro', new Date(Date.now() + 30 * 60 * 1000).toISOString(), 'trial');
        expect(t1.daysLeft).toBe(1);
        expect(planLib().trialDaysLeft(null)).toBe(0);
        expect(planLib().trialDaysLeft('not-a-date')).toBe(0);
        expect(planLib().trialDaysLeft(pastISO(1))).toBe(0);
    });

    test('describe 接收完整 user 对象（前端会话形态）', () => {
        const t = planLib().describe({ plan: 'pro', plan_expires_at: futureISO(10), pro_granted_by: 'trial' });
        expect(t.key).toBe('trial');
        expect(t.label).toBe('体验版');
        expect(t.daysLeft).toBeGreaterThanOrEqual(9);
    });
});
