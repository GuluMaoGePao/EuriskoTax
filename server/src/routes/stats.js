const express = require('express');
const router = express.Router();
const { requireAdmin, getOverview } = require('../controllers/statsController');

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

module.exports = router;
