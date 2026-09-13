const express = require('express');
const router = express.Router();
const proCodeController = require('../controllers/proCodeController');
const { authenticateToken } = require('../middleware/auth');

/**
 * 专业版兑换码（阶段14 变现）：线下收款后由运营发放，用户在「版本与权益」弹窗内自助兑换。
 * 需登录 —— 兑换行为必须绑定账号以发放权益，同时让限流可按人计数（防猜码）。
 * 本组路由在 app.js 挂 redeemLimiter。
 */

/**
 * @swagger
 * /api/pro-codes/redeem:
 *   post:
 *     tags: [权益 ProCode]
 *     summary: 兑换专业版兑换码
 *     description: |
 *       一码一用：兑换成功即占用该码并发放专业版权益（pro_granted_by=purchase）。
 *       限时码若当前专业版仍在有效期内，则在现有到期日上叠加续期（不清零）。
 *       已是永久专业版的账号会被拒绝且不消耗兑换码。
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code]
 *             properties:
 *               code: { type: string, example: PRO-ABCD-EFGH, description: 运营发放的兑换码（大小写与空格不敏感） }
 *     responses:
 *       '200':
 *         description: 兑换成功，data 返回更新后的用户信息（含 plan / plan_expires_at / pro_granted_by）
 *       '400': { description: 未提供兑换码 }
 *       '401': { description: 未登录或 Token 无效/过期 }
 *       '403': { description: 兑换码不存在 / 已被作废 }
 *       '409': { description: 兑换码已被使用 / 当前已是永久专业版 }
 *       '429': { description: 尝试过于频繁（防猜码限流） }
 */
router.post('/redeem', authenticateToken, proCodeController.redeem);

/**
 * @swagger
 * /api/pro-codes/mine:
 *   get:
 *     tags: [权益 ProCode]
 *     summary: 我的兑换记录
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       '200': { description: 兑换记录列表（data.total / data.items） }
 *       '401': { description: 未登录或 Token 无效/过期 }
 */
router.get('/mine', authenticateToken, proCodeController.myCodes);

module.exports = router;
