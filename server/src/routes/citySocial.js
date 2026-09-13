const express = require('express');
const router = express.Router();
const citySocialController = require('../controllers/citySocialController');

/**
 * @swagger
 * tags:
 *   - name: 城市社保参数 CitySocial
 *     description: 公开只读城市社保/公积金缴费基数口径（管理台热改后的当前生效值；库中无自定义配置时为出厂基线）
 */

/**
 * @swagger
 * /api/config/city-social:
 *   get:
 *     tags: [城市社保参数 CitySocial]
 *     summary: 获取当前生效的城市社保参数库（阶段14 C2）
 *     description: >
 *       返回各参保城市的社保/公积金缴费基数上下限与公积金可选比例。
 *       公开只读，无需登录。支持 ?since=<revision>：与当前指纹一致时 config=null，供客户端跳过覆盖。
 *       未选择城市时前端使用 defaultCity 指定的城市；所选城市在新版本中被删除时回落到 national。
 *     security: []
 *     parameters:
 *       - in: query
 *         name: since
 *         required: false
 *         schema: { type: string }
 *         description: 本地已应用的配置指纹 revision（一致则 config 为 null）
 *     responses:
 *       '200':
 *         description: 城市社保参数 { version, revision, publishedAt, note, source, unchanged, config }
 *       '500': { description: 配置源不可用 }
 */
router.get('/city-social', citySocialController.getCitySocial);

module.exports = router;
