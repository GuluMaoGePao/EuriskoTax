// 阶段10：账户分层（free/pro）纯逻辑
// 普通全局 script（无 DOM / 无 import 依赖），挂 window.EuriskoPlan，便于单元测试与 module 桥接调用
(function () {
    'use strict';

    const PLAN_FREE = 'free';
    const PLAN_PRO = 'pro';

    // 专业版判定：plan=pro 且未过期；plan_expires_at 为 null/空 表示永久授权（种子期 granted_by=seed）
    // 过期时间无法解析时按永久授权容错（服务端正常不会下发畸形值）
    function isPro(plan, planExpiresAt) {
        if (plan !== PLAN_PRO) return false;
        if (!planExpiresAt) return true;
        const expiresAt = new Date(planExpiresAt).getTime();
        if (!Number.isFinite(expiresAt)) return true;
        return expiresAt > Date.now();
    }

    // 阶段10 UI 文案：Pro 专属功能 gate 提示（公测种子期注册即赠专业版，登录后自动开启）
    const PRO_FEATURE_HINT = '云同步为专业版（PRO）专属功能。公测种子期内注册即赠专业版，登录后自动开启；专业版外所有计税功能始终免费可用。';

    window.EuriskoPlan = {
        PLAN_FREE,
        PLAN_PRO,
        isPro,
        PRO_FEATURE_HINT
    };
})();
