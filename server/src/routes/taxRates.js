const express = require('express');
const router = express.Router();
const taxRateController = require('../controllers/taxRateController');

/**
 * @swagger
 * tags:
 *   - name: 税制参数 TaxRates
 *     description: 公开只读税率配置（管理台热改后的当前生效值；库中无自定义配置时为出厂基线）
 */

/**
 * @swagger
 * /api/config/tax-rates:
 *   get:
 *     tags: [税制参数 TaxRates]
 *     summary: 获取当前生效的税率配置（阶段12 C1）
 *     description: >
 *       返回综合所得/月度（年终奖单独计税）/经营所得/分类所得税率表与缴费基数下限。
 *       公开只读，无需登录。支持 ?since=<revision>：与当前指纹一致时 rates=null，供客户端跳过覆盖。
 *     security: []
 *     parameters:
 *       - in: query
 *         name: since
 *         required: false
 *         schema: { type: string }
 *         description: 本地已应用的配置指纹 revision（一致则 rates 为 null）
 *     responses:
 *       '200':
 *         description: 税率配置 { version, revision, publishedAt, note, source, unchanged, rates }
 *       '500': { description: 配置源不可用 }
 */
router.get('/tax-rates', taxRateController.getTaxRates);

module.exports = router;
