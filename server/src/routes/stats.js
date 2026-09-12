const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/adminAuth');
const { authenticateToken } = require('../middleware/auth');
const { getOverview, trackCalculationEvent, trackFunnelEvent } = require('../controllers/statsController');

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

/**
 * @swagger
 * /api/stats/funnel:
 *   post:
 *     tags: [统计 Stats]
 *     summary: 转化漏斗埋点（公开，无需登录）
 *     description: |
 *       链路 visit → calc_done → share / save → lead_click。
 *       公开端点：漏斗前两步大多发生在未登录状态，若要求登录，北极星分母只剩登录用户、指标会虚高。
 *       仅记录「步骤 + 次数」并做日粒度聚合，不落 IP / 设备 ID / user_id。
 *       lead_submit 不上报 —— 其唯一真相是 Lead 表，由 /api/admin/leads/funnel 直接统计。
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [step]
 *             properties:
 *               step:
 *                 type: string
 *                 enum: [visit, calc_done, share, save, lead_click]
 *                 example: calc_done
 *                 description: 漏斗步骤
 *     responses:
 *       '201': { description: 记录成功（data.count 为该步骤当日累计次数） }
 *       '400': { description: step 非法（不在白名单内） }
 *       '429': { description: 上报过于频繁 }
 */
router.post('/funnel', trackFunnelEvent);

module.exports = router;
