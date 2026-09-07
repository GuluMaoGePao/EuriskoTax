const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/adminAuth');
const { authenticateToken } = require('../middleware/auth');
const { getOverview, trackCalculationEvent } = require('../controllers/statsController');

/**
 * @swagger
 * /api/stats/overview:
 *   get:
 *     tags: [统计 Stats]
 *     summary: 运营统计概览（管理员）
 *     description: 返回注册数、计算次数、类型分布、近7日趋势。通过请求头 X-Admin-Token 认证（值为环境变量 ADMIN_TOKEN），不走 Bearer 认证
 *     security: []
 *     parameters:
 *       - in: header
 *         name: X-Admin-Token
 *         required: true
 *         schema: { type: string }
 *         description: 管理员令牌（环境变量 ADMIN_TOKEN 的值）
 *     responses:
 *       '200':
 *         description: 统计概览数据（用户总数/今日新增/计算总数/今日次数/类型分布/近7日趋势）
 *       '401': { description: 管理员令牌错误 }
 *       '503': { description: 服务端未配置 ADMIN_TOKEN }
 */
router.get('/overview', requireAdmin, getOverview);

/**
 * @swagger
 * /api/stats/events:
 *   post:
 *     tags: [统计 Stats]
 *     summary: 匿名计算埋点（登录用户）
 *     description: 登录用户在保存计算结果后上报计算类型（comprehensive/business/classification/reverse），做日粒度聚合。仅记录类型，不含任何收入/扣除等输入数据。失败应静默，不阻塞主流程
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [type]
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [comprehensive, business, classification, reverse]
 *                 example: comprehensive
 *                 description: 计算类型（综合所得/经营所得/分类所得/反向倒算）
 *     responses:
 *       '201':
 *         description: 记录成功（data.count 为该类型当日累计次数）
 *       '400': { description: type 非法 }
 *       '401': { description: 未认证 }
 */
router.post('/events', authenticateToken, trackCalculationEvent);

module.exports = router;
