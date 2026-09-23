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

    // 距到期还剩几天（向上取整、最少 0 天）；非法/缺失日期返回 0。
    // 通用实现：体验版与正式专业版共用同一套天数口径，避免两处算法各写一遍而漂移。
    function daysLeftUntil(planExpiresAt) {
        if (!planExpiresAt) return 0;
        const expiresAt = new Date(planExpiresAt).getTime();
        if (!Number.isFinite(expiresAt)) return 0;
        return Math.max(0, Math.ceil((expiresAt - Date.now()) / DAY_MS));
    }

    // 体验剩余天数（语义别名：对外契约早已存在，内部统一走 daysLeftUntil）
    function trialDaysLeft(planExpiresAt) {
        return daysLeftUntil(planExpiresAt);
    }

    // 把 plan 三字段归一为"用户可见档位"：
    //   { key: 'free' | 'trial' | 'pro',
    //     label: '基础版' | '体验版' | '专业版',
    //     daysLeft, expireAt, grantedBy, permanent?, expiredTrial?, expiredPro?
    //     expiredTrial = 免费体验已到期；expiredPro = 付费/兑换码权益已到期（两者话术不同，不可混用） }
    function getTier(plan, planExpiresAt, grantedBy) {
        const active = isPro(plan, planExpiresAt);
        if (plan === PLAN_PRO && grantedBy === 'trial' && active) {
            return { key: 'trial', label: '体验版', daysLeft: daysLeftUntil(planExpiresAt), expireAt: planExpiresAt, grantedBy };
        }
        if (plan === PLAN_PRO && active) {
            // pro：种子期/正式授权均为永久或未过期；种子授权无过期时间 → permanent
            // daysLeft 此前恒为 0 —— 付费一年的用户在到期前因此收不到任何提醒，
            // 也无法判断该不该给续期入口（Phase 3.5 缺口 3）。改为按真实到期时间计算。
            return { key: 'pro', label: '专业版', daysLeft: daysLeftUntil(planExpiresAt), expireAt: planExpiresAt, grantedBy, permanent: !planExpiresAt };
        }
        if (plan === PLAN_PRO && grantedBy === 'trial') {
            // 体验已过期：仍属基础版，但保留来源信息用于"可再次领取"引导
            return { key: 'free', label: '基础版', daysLeft: 0, expireAt: planExpiresAt, grantedBy, expiredTrial: true };
        }
        if (plan === PLAN_PRO) {
            // 付费/兑换码开通的专业版已过期：权限上确实是基础版，但这是**意向最强的复购对象**——
            // 此前落到这里只剩一句「免费领取体验」，等于把已经证明愿意付费的人当用户重新养一遍。
            // 保留 expireAt 并标记 expiredPro，让 UI 能说清「权益已于 X 到期」而不是装作没见过他。
            // ⚠️ 合规：这里只标记事实；话术与入口统一在 UI 侧走「留资 → 运营发码」，站内零购买语义。
            return { key: 'free', label: '基础版', daysLeft: 0, expireAt: planExpiresAt, grantedBy, expiredPro: true };
        }
        return { key: 'free', label: '基础版', daysLeft: 0, expireAt: null, grantedBy };
    }

    // 传入 apiClient.getCurrentUser() 的 user 对象，返回上述档位描述（未登录返回 null）
    function describe(user) {
        if (!user) return null;
        return getTier(user.plan, user.plan_expires_at, user.pro_granted_by);
    }

    // 阶段10/11 UI 文案：Pro 专属功能 gate 提示（三档体系：基础版可免费领取 14 天体验）
    // 「正式专业版购买即将开放」已过期：阶段14 的兑换码自助开通就是当前的正式开通路径。
    // 同时只列真实生效的档位差异（云同步 / 完整 PDF 报告 / 方案对比库上限），
    // 并显式说明「政策要点与更新公告对所有用户开放」—— 这句以前写在专业版权益里，属于卖免费能力。
    // 前半段（哪些付费 / 哪些全员开放）必须对所有档位一致，故抽成单一来源复用 ——
    // 「同一份能力清单散落在多条文案里」正是本仓库反复踩过的漂移坑，改一处漏三处就自我矛盾。
    const GATE_CAPABILITIES = '云端同步、汇算清缴 PDF 完整报告与更大的方案对比库为专业版（PRO）功能；计税、社保口径、政策要点与更新公告对所有用户开放。';

    // 四条 gate 提示共用 GATE_CAPABILITIES，只在「下一句该干什么」上分叉：
    const PRO_FEATURE_HINT = GATE_CAPABILITIES + '基础版可免费领取 14 天专业版体验（公测期不限次数，到期后随时可再次领取），正式专业版可用兑换码在「版本与权益」中自助开通。';
    const TRIAL_ACTIVE_HINT = GATE_CAPABILITIES + '您当前仍处于专业版体验期内，上述专业功能均可使用；到期后可用兑换码在「版本与权益」中自助开通正式专业版。';
    const EXPIRED_TRIAL_HINT = GATE_CAPABILITIES + '您的专业版体验已到期，可再次免费领取 14 天体验（公测期不限次数），也可用兑换码在「版本与权益」中自助开通正式专业版。';
    const EXPIRED_PRO_HINT = GATE_CAPABILITIES + '您的专业版权益已到期，可在「版本与权益」中留下联系方式恢复权益。';

    // 同一个 gate 提示，对不同身份的人要说不同的下一句。
    // 此前所有人共用 PRO_FEATURE_HINT 里的「基础版可免费领取 14 天体验」，对三类人是错的：
    //   · 付费权益已到期（expiredPro）—— 他付过钱，该给恢复入口，而不是请他回去领免费体验
    //   · 体验进行中(trial) —— 他已经在体验了，再叫他去领等于暗示他没在用
    //   · 体验已到期(expiredTrial) —— 该明确告诉他还能再领一轮
    // 未登录 / 拿不到会话时用默认文案兜底，保证任何情况下文案都不会退化成空或错版。
    function featureHintFor(user) {
        const tier = describe(user);
        if (!tier) return PRO_FEATURE_HINT;
        if (tier.key === 'trial') return TRIAL_ACTIVE_HINT;
        if (tier.expiredTrial) return EXPIRED_TRIAL_HINT;
        if (tier.expiredPro) return EXPIRED_PRO_HINT;
        return PRO_FEATURE_HINT;
    }

    window.EuriskoPlan = {
        PLAN_FREE,
        PLAN_PRO,
        TRIAL_DAYS,
        isPro,
        getTier,
        describe,
        trialDaysLeft,
        daysLeftUntil,
        featureHintFor,
        PRO_FEATURE_HINT,
        GATE_CAPABILITIES,
        TRIAL_ACTIVE_HINT,
        EXPIRED_TRIAL_HINT,
        EXPIRED_PRO_HINT
    };
})();
