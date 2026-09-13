const express = require('express');
const router = express.Router();
const proCodeAdminController = require('../controllers/proCodeAdminController');
const { requireAdmin } = require('../middleware/adminAuth');

/**
 * 兑换码管理（运维后台）：生成批次 / 查询 / 作废 / 导出对账
 * 全部端点要求 X-Admin-Token（= ADMIN_TOKEN 环境变量）。
 * 线下收款场景：运营生成一批码 → 交付客户 → 客户端自助兑换 → 导出 CSV 对账。
 */

/**
 * @swagger
 * /api/admin/pro-codes:
 *   get:
 *     tags: [管理后台 Admin]
 *     summary: 兑换码列表（运维后台）
 *     security: [{ adminToken: [] }]
 *     parameters:
 *       - { name: batch, in: query, schema: { type: string }, description: 按批次筛选 }
 *       - { name: status, in: query, schema: { type: string, enum: [available, used, disabled] }, description: 按状态筛选 }
 *       - { name: offset, in: query, schema: { type: integer }, description: 偏移，默认 0 }
 *       - { name: limit, in: query, schema: { type: integer, maximum: 200 }, description: 条数，默认 50 }
 *     responses:
 *       '200': { description: 分页列表（含 total / availableCount / usedCount / disabledCount / items） }
 *       '401': { description: 未认证或 Admin Token 无效 }
 */
router.get('/', requireAdmin, proCodeAdminController.list);

/**
 * @swagger
 * /api/admin/pro-codes:
 *   post:
 *     tags: [管理后台 Admin]
 *     summary: 批量生成兑换码（运维后台）
 *     security: [{ adminToken: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [count]
 *             properties:
 *               count: { type: integer, minimum: 1, maximum: 200, description: 生成数量 }
 *               durationDays: { type: integer, nullable: true, minimum: 1, maximum: 3650, description: null/省略 = 永久授权；否则为天数 }
 *               batch: { type: string, description: 批次标识（如 2026.09-线下收款），便于对账 }
 *               note: { type: string, description: 备注（如客户名称） }
 *     responses:
 *       '201': { description: 生成成功（data.createdCount / data.codes） }
 *       '400': { description: count 或 durationDays 非法 }
 *       '401': { description: 未认证或 Admin Token 无效 }
 */
router.post('/', requireAdmin, proCodeAdminController.generate);

/**
 * @swagger
 * /api/admin/pro-codes/export:
 *   get:
 *     tags: [管理后台 Admin]
 *     summary: 导出兑换码 CSV（运维后台对账）
 *     security: [{ adminToken: [] }]
 *     parameters:
 *       - { name: batch, in: query, schema: { type: string }, description: 按批次导出，省略为全部 }
 *     responses:
 *       '200': { description: CSV 文件（text/csv，含 UTF-8 BOM 便于 Excel 打开） }
 *       '401': { description: 未认证或 Admin Token 无效 }
 */
router.get('/export', requireAdmin, proCodeAdminController.exportCsv);

/**
 * @swagger
 * /api/admin/pro-codes/{id}:
 *   patch:
 *     tags: [管理后台 Admin]
 *     summary: 作废 / 恢复兑换码（运维后台）
 *     security: [{ adminToken: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [disabled]
 *             properties:
 *               disabled: { type: boolean, description: true=作废，false=恢复 }
 *     responses:
 *       '200': { description: 更新后的状态 }
 *       '400': { description: id 或 disabled 非法 }
 *       '404': { description: 兑换码不存在 }
 *       '409': { description: 该码已被兑换，无法作废 }
 */
router.patch('/:id', requireAdmin, proCodeAdminController.patch);

module.exports = router;
