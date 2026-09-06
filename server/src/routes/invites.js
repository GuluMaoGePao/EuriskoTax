const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../controllers/statsController');
const { listInvites, generateInvites } = require('../controllers/inviteController');

/**
 * @swagger
 * /api/invites:
 *   get:
 *     tags: [邀请码 Invites]
 *     summary: 列出全部邀请码（管理员）
 *     description: 按未使用/已使用分组返回所有邀请码，已使用项关联注册用户名。通过请求头 X-Admin-Token 认证（值为环境变量 ADMIN_TOKEN）
 *     security: []
 *     parameters:
 *       - in: header
 *         name: X-Admin-Token
 *         required: true
 *         schema: { type: string }
 *         description: 管理员令牌（环境变量 ADMIN_TOKEN 的值）
 *     responses:
 *       '200':
 *         description: 邀请码列表（total/availableCount/usedCount/available[]/used[]）
 *       '401': { description: 管理员令牌错误 }
 *       '503': { description: 服务端未配置 ADMIN_TOKEN }
 */
router.get('/', requireAdmin, listInvites);

/**
 * @swagger
 * /api/invites:
 *   post:
 *     tags: [邀请码 Invites]
 *     summary: 生成邀请码（管理员）
 *     description: 一机一码批量生成，count 范围 1-100。通过请求头 X-Admin-Token 认证
 *     security: []
 *     parameters:
 *       - in: header
 *         name: X-Admin-Token
 *         required: true
 *         schema: { type: string }
 *         description: 管理员令牌（环境变量 ADMIN_TOKEN 的值）
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [count]
 *             properties:
 *               count:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 100
 *                 example: 10
 *     responses:
 *       '201':
 *         description: 生成成功（createdCount/codes[]）
 *       '400': { description: count 不在 1-100 范围 }
 *       '401': { description: 管理员令牌错误 }
 *       '503': { description: 服务端未配置 ADMIN_TOKEN }
 */
router.post('/', requireAdmin, generateInvites);

module.exports = router;
