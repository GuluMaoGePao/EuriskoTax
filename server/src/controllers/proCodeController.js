const proCodeService = require('../services/proCodeService');

/**
 * 兑换专业版兑换码（需登录）
 * POST /api/pro-codes/redeem  body: { code }
 * 成功返回更新后的账户信息（含 plan / plan_expires_at / pro_granted_by），前端据此刷新本地会话
 */
const redeem = async (req, res, next) => {
    try {
        const user = await proCodeService.redeemCode(req.user.id, (req.body || {}).code);
        const at = new Date().toISOString();
        console.log(
            `[PRO-CODE] ${at} user=${user.id} redeem ok → plan=${user.plan} `
            + `expires_at=${user.plan_expires_at ? user.plan_expires_at.toISOString() : 'permanent'} `
            + `granted_by=${user.pro_granted_by}`
        );
        res.status(200).json({ success: true, data: user });
    } catch (err) {
        next(err);
    }
};

/**
 * 我的兑换记录（用户自查 / 客服核对）
 * GET /api/pro-codes/mine
 */
const myCodes = async (req, res, next) => {
    try {
        const items = await proCodeService.listUserCodes(req.user.id);
        res.status(200).json({ success: true, data: { total: items.length, items } });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    redeem,
    myCodes
};
