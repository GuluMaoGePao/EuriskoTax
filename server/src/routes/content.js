const express = require('express');
const router = express.Router();
const contentController = require('../controllers/contentController');
const { optionalAuth } = require('../middleware/auth');

/**
 * @swagger
 * tags:
 *   - name: 内容 Content
 *     description: 公开只读内容接口（政策要点 / 更新公告 / 运营内容，无用户数据交互；按登录态分层返回）
 */

/**
 * @swagger
 * /api/content/tax-policy:
 *   get:
 *     tags: [内容 Content]
 *     summary: 获取税务政策要点（阶段11：全体用户可见，按登录态分层）
 *     description: >
 *       返回政策要点条目（内置 QA 快照之上的增量覆盖层）。公开只读，无需登录。
 *       携带 Authorization 时按账号档位返回：游客=all；基础版=all+free；专业版/体验版=all+free+pro。
 *       支持 ?since=<revision>：与当前内容指纹一致时返回空 items，供客户端判断"无更新"。
 *     security: []
 *     parameters:
 *       - in: query
 *         name: since
 *         required: false
 *         schema: { type: string }
 *         description: 本地已应用的内容指纹 revision（一致则 items 为空）
 *     responses:
 *       '200':
 *         description: 政策要点内容 { version, revision, publishedAt, notice, items[] }
 *       '500': { description: 内容源不可用 }
 */
router.get('/tax-policy', optionalAuth, contentController.getTaxPolicy);

/**
 * @swagger
 * /api/content/feed:
 *   get:
 *     tags: [内容 Content]
 *     summary: 获取更新公告 / 运营内容（阶段11，按展示位与登录态分层）
 *     description: >
 *       返回公告与运营内容列表，供启动弹窗 / 首页公告条 / 个人中心公告列表等展示位消费。
 *       公开只读，无需登录；携带 Authorization 时按账号档位分层（同 tax-policy）。
 *       自动过滤未到发布时间的预约条目与已过期条目。
 *     security: []
 *     parameters:
 *       - in: query
 *         name: placement
 *         required: false
 *         schema: { type: string, enum: [home_banner, modal, notice_list, assistant_qa] }
 *         description: 仅返回包含该展示位的条目
 *     responses:
 *       '200':
 *         description: 内容列表 { version, revision, placement, items[] }
 */
router.get('/feed', optionalAuth, contentController.getFeed);

module.exports = router;
