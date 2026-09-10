const express = require('express');
const router = express.Router();
const contentController = require('../controllers/contentController');

/**
 * @swagger
 * tags:
 *   - name: 内容 Content
 *     description: 公开只读内容接口（政策要点等，无用户数据交互）
 */

/**
 * @swagger
 * /api/content/tax-policy:
 *   get:
 *     tags: [内容 Content]
 *     summary: 获取税务政策要点（阶段10B 专业版增量更新）
 *     description: >
 *       返回政策要点增量内容（内置 QA 快照之上的更新条目）。公开只读静态数据，无需登录。
 *       支持 ?since=<version>：当 since 与当前版本一致时返回空 items，供客户端判断"无更新"。
 *       免费版前端仅用内置快照；专业版在登录后静默拉取本端点做增量合并并提示"政策已更新"。
 *     security: []
 *     parameters:
 *       - in: query
 *         name: since
 *         required: false
 *         schema: { type: string }
 *         description: 本地已应用的版本号（与当前版本一致则 items 为空）
 *     responses:
 *       '200':
 *         description: 政策要点内容 { version, publishedAt, notice, items[] }
 *       '500': { description: 内容源不可用 }
 */
router.get('/tax-policy', contentController.getTaxPolicy);

module.exports = router;
