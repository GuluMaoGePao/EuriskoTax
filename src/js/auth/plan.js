// 阶段10/11：账户分层（free/pro）纯逻辑 + 三档体系（基础版/体验版/专业版）UI 描述
// 普通全局 script（无 DOM / 无 import 依赖），挂 window.EuriskoPlan，便于单元测试与 module 桥接调用
(function () {
    'use strict';

    const PLAN_FREE = 'free';
    const PLAN_PRO = 'pro';

    // 体验版时长（天）：领取后账号为 plan=pro + plan_expires_at=+14 天 + pro_granted_by='trial'，
    // 到期后 isPro=false 自动回落基础版（公测期不限次数，到期后随时可再次领取）。
    const TRIAL_DAYS = 14;
    const DAY_MS = 24 * 60 * 60 * 1000;

    // 专业版权益判定：plan=pro 且未过期；plan_expires_at 为 null/空 表示永久授权（种子期 granted_by=seed）
    // 过期时间无法解析时按永久授权容错（服务端正常不会下发畸形值）
    function isPro(plan, planExpiresAt) {
        if (plan !== PLAN_PRO) return false;
        if (!planExpiresAt) return true;
        const expiresAt = new Date(planExpiresAt).getTime();
        if (!Number.isFinite(expiresAt)) return true;
        return expiresAt > Date.now();
    }

    // 体验剩余天数（向上取整、最少 0 天）；非法/缺失日期返回 0
    function trialDaysLeft(planExpiresAt) {
        if (!planExpiresAt) return 0;
        const expiresAt = new Date(planExpiresAt).getTime();
        if (!Number.isFinite(expiresAt)) return 0;
        return Math.max(0, Math.ceil((expiresAt - Date.now()) / DAY_MS));
    }

    // 把 plan 三字段归一为"用户可见档位"：
    //   { key: 'free' | 'trial' | 'pro',
    //     label: '基础版' | '体验版' | '专业版',
    //     daysLeft, expireAt, grantedBy, permanent?, expiredTrial? }
    function getTier(plan, planExpiresAt, grantedBy) {
        const active = isPro(plan, planExpiresAt);
        if (plan === PLAN_PRO && grantedBy === 'trial' && active) {
            return { key: 'trial', label: '体验版', daysLeft: trialDaysLeft(planExpiresAt), expireAt: planExpiresAt, grantedBy };
        }
        if (plan === PLAN_PRO && active) {
            // pro：种子期/正式授权均为永久或未过期；种子授权无过期时间 → permanent
            return { key: 'pro', label: '专业版', daysLeft: 0, expireAt: planExpiresAt, grantedBy, permanent: !planExpiresAt };
        }
        if (plan === PLAN_PRO && grantedBy === 'trial') {
            // 体验已过期：仍属基础版，但保留来源信息用于"可再次领取"引导
            return { key: 'free', label: '基础版', daysLeft: 0, expireAt: planExpiresAt, grantedBy, expiredTrial: true };
        }
        return { key: 'free', label: '基础版', daysLeft: 0, expireAt: null, grantedBy };
    }

    // 传入 apiClient.getCurrentUser() 的 user 对象，返回上述档位描述（未登录返回 null）
    function describe(user) {
        if (!user) return null;
        return getTier(user.plan, user.plan_expires_at, user.pro_granted_by);
    }

    // 阶段10/11 UI 文案：Pro 专属功能 gate 提示（三档体系：基础版可免费领取 14 天体验）
    const PRO_FEATURE_HINT = '云端同步与汇算清缴 PDF 报告为专业版（PRO）功能。基础版可免费领取 14 天专业版体验（公测期不限次数，到期后随时可再次领取）；正式专业版购买即将开放。';

    window.EuriskoPlan = {
        PLAN_FREE,
        PLAN_PRO,
        TRIAL_DAYS,
        isPro,
        getTier,
        describe,
        trialDaysLeft,
        PRO_FEATURE_HINT
    };
})();
