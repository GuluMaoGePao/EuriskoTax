const express = require('express');
const router = express.Router();
const feedbackController = require('../controllers/feedbackController');
const { authenticateToken } = require('../middleware/auth');

/**
 * @swagger
 * /api/feedback:
 *   post:
 *     tags: [反馈 Feedback]
 *     summary: 提交用户反馈
 *     description: 用户提交意见反馈，需登录认证
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [content]
 *             properties:
 *               category: { type: string, example: bug, description: 反馈类型（bug/suggestion/other） }
 *               content:  { type: string, example: 计算综合所得时结果不准确, description: 反馈内容（最多5000字符） }
 *               rating:   { type: integer, minimum: 1, maximum: 5, example: 4, description: 评分1-5 }
 *     responses:
 *       '201': { description: 反馈已收到 }
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
 *       '200': { description: 反馈列表 }
 *       '401': { description: 未认证 }
 */
router.get('/', authenticateToken, feedbackController.listFeedback);

module.exports = router;
