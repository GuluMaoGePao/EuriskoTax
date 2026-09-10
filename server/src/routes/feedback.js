const express = require('express');
const router = express.Router();
const feedbackController = require('../controllers/feedbackController');
const { authenticateToken } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/adminAuth');

/**
 * @swagger
 * /api/feedback:
 *   post:
 *     tags: [反馈 Feedback]
 *     summary: 提交用户反馈
 *     description: 用户提交意见反馈，需登录认证。反馈会持久化到数据库，供开发者逐条跟进（采纳的改进会记录在更新日志并致谢）
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [content]
 *             properties:
 *               category: { type: string, example: bug, description: 反馈类型（bug/suggestion/other/general） }
 *               content:  { type: string, example: 计算综合所得时结果不准确, description: 反馈内容（最多5000字符） }
 *               rating:   { type: integer, minimum: 1, maximum: 5, example: 4, description: 评分1-5（选填） }
 *               attachments: { type: array, items: { type: string }, maxItems: 3, description: 附图（选填）：前端压缩后的图片 dataURL（png/jpeg/webp，单张 ≤900K 字符） }
 *     responses:
 *       '201': { description: 反馈已收到（data.id 为落库ID） }
 *       '400': { description: 内容为空或超长 }
 *       '401': { description: 未认证 }
 */
router.post('/', authenticateToken, feedbackController.submitFeedback);

/**
 * @swagger
 * /api/feedback:
 *   get:
 *     tags: [反馈 Feedback]
 *     summary: 获取当前用户的反馈列表
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       '200': { description: 反馈列表（按提交时间倒序） }
 *       '401': { description: 未认证 }
 */
router.get('/', authenticateToken, feedbackController.listFeedback);

/**
 * @swagger
 * /api/feedback/admin:
 *   get:
 *     tags: [反馈 Feedback]
 *     summary: 管理员查看全部反馈（可按状态过滤）
 *     description: 返回最近 200 条反馈，关联提交用户信息。通过请求头 X-Admin-Token 认证
 *     security: []
 *     parameters:
 *       - in: header
 *         name: X-Admin-Token
 *         required: true
 *         schema: { type: string }
 *         description: 管理员令牌（环境变量 ADMIN_TOKEN 的值）
 *       - in: query
 *         name: status
 *         required: false
 *         schema: { type: string, enum: [open, resolved, closed] }
 *         description: 按跟进状态过滤（不传返回全部）
 *     responses:
 *       '200': { description: 反馈列表 }
 *       '401': { description: 管理员令牌错误 }
 *       '503': { description: 服务端未配置 ADMIN_TOKEN }
 */
router.get('/admin', requireAdmin, feedbackController.adminListFeedback);

/**
 * @swagger
 * /api/feedback/admin/{id}:
 *   patch:
 *     tags: [反馈 Feedback]
 *     summary: 管理员更新反馈跟进状态
 *     description: 将反馈标记为 open/resolved/closed，用于跟进采纳状态。通过请求头 X-Admin-Token 认证
 *     security: []
 *     parameters:
 *       - in: header
 *         name: X-Admin-Token
 *         required: true
 *         schema: { type: string }
 *         description: 管理员令牌（环境变量 ADMIN_TOKEN 的值）
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: 反馈 ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [open, resolved, closed], example: resolved }
 *     responses:
 *       '200': { description: 更新成功 }
 *       '400': { description: 状态非法或 id 非法 }
 *       '401': { description: 管理员令牌错误 }
 *       '503': { description: 服务端未配置 ADMIN_TOKEN }
 */
router.patch('/admin/:id', requireAdmin, feedbackController.updateFeedbackStatus);

module.exports = router;
