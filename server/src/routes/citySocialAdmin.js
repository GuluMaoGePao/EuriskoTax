const express = require('express');
const router = express.Router();
const citySocialAdminController = require('../controllers/citySocialAdminController');
const { requireAdmin } = require('../middleware/adminAuth');

/**
 * 城市社保参数管理（运维后台「社保基数」Tab）：热改各城市缴费基数口径 + 版本化 + 可选公告联动
 * 全部端点要求 X-Admin-Token（= ADMIN_TOKEN 环境变量）。
 */

/**
 * @swagger
 * /api/admin/city-social:
 *   get:
 *     tags: [管理后台 Admin]
 *     summary: 当前城市社保参数 + 出厂基线 + 历史版本（运维后台）
 *     security: [{ adminToken: [] }]
 *     responses:
 *       '200': { description: 当前配置 current + 出厂基线 defaults + 历史版本 history }
 *       '401': { description: 未认证或 Admin Token 无效 }
 */
router.get('/', requireAdmin, citySocialAdminController.listCitySocial);

/**
 * @swagger
 * /api/admin/city-social:
 *   post:
 *     tags: [管理后台 Admin]
 *     summary: 保存并发布新的城市社保参数版本
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
 *               config:
 *                 type: object
 *                 description: 全量城市社保配置（prepareCitySocial 校验；必须保留 national 兜底城市）
 *                 properties:
 *                   constantsVersion: { type: string }
 *                   defaultCity: { type: string }
 *                   cities:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         code: { type: string, description: 小写字母开头，仅含小写字母/数字/_/- }
 *                         name: { type: string }
 *                         socialBaseMin: { type: number }
 *                         socialBaseMax: { type: number, nullable: true, description: 留空=无上限 }
 *                         housingBaseMin: { type: number }
 *                         housingBaseMax: { type: number, nullable: true }
 *                         housingFundRateOptions: { type: array, items: { type: number }, description: '公积金可选比例，默认 [5,7]' }
 *                         note: { type: string }
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
 *       '201': { description: 发布成功：config 为新配置，公告联动时 release 为公告结果（未联动为 null） }
 *       '400': { description: 参数校验失败或版本号重复 }
 */
router.post('/', requireAdmin, citySocialAdminController.createCitySocialConfig);

/**
 * @swagger
 * /api/admin/city-social/rollback:
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
 *       '201': { description: 回滚成功，返回新配置 config }
 *       '400': { description: 参数非法 }
 *       '404': { description: 配置版本不存在 }
 */
router.post('/rollback', requireAdmin, citySocialAdminController.rollbackCitySocial);

module.exports = router;
