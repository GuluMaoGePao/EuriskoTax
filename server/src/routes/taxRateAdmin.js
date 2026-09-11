const express = require('express');
const router = express.Router();
const taxRateAdminController = require('../controllers/taxRateAdminController');
const { requireAdmin } = require('../middleware/adminAuth');

/**
 * 税制参数管理（运维后台「税率」Tab）：热改税率 + 版本化 + 可选公告联动
 * 全部端点要求 X-Admin-Token（= ADMIN_TOKEN 环境变量）。
 */

/**
 * @swagger
 * /api/admin/tax-rates:
 *   get:
 *     tags: [管理后台 Admin]
 *     summary: 当前税率配置 + 出厂基线 + 历史版本（运维后台）
 *     security: [{ adminToken: [] }]
 *     responses:
 *       '200': { description: { current, defaults, history[] } }
 *       '401': { description: 未认证或 Admin Token 无效 }
 */
router.get('/', requireAdmin, taxRateAdminController.listTaxRates);

/**
 * @swagger
 * /api/admin/tax-rates:
 *   post:
 *     tags: [管理后台 Admin]
 *     summary: 保存并发布新的税率配置版本
 *     security: [{ adminToken: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               version: { type: string, description: 版本号；留空自动生成 YYYY.MM.DD-N }
 *               note: { type: string, description: 变更说明 }
 *               rates: { type: object, description: 全量税率配置（prepareTaxRates 校验） }
 *               notify:
 *                 type: object
 *                 description: 可选——保存后同步发布一条公告
 *                 properties:
 *                   enabled: { type: boolean }
 *                   title: { type: string }
 *                   summary: { type: string }
 *                   body: { type: string }
 *                   placements:
 *                     type: array
 *                     items: { type: string, enum: [assistant_qa, home_banner, modal, notice_list] }
 *     responses:
 *       '201': { description: { config, release|null } }
 *       '400': { description: 税率校验失败或版本号重复 }
 */
router.post('/', requireAdmin, taxRateAdminController.createTaxRateConfig);

/**
 * @swagger
 * /api/admin/tax-rates/rollback:
 *   post:
 *     tags: [管理后台 Admin]
 *     summary: 回滚到历史版本（以历史配置为蓝本另存为新版本）
 *     security: [{ adminToken: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id: { type: integer, description: 历史配置记录 id }
 *               version: { type: string, description: 新版本号；留空自动生成 }
 *               note: { type: string }
 *     responses:
 *       '201': { description: { config } }
 *       '400': { description: 参数非法 }
 *       '404': { description: 配置版本不存在 }
 */
router.post('/rollback', requireAdmin, taxRateAdminController.rollbackTaxRates);

module.exports = router;
