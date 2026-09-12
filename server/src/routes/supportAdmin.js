const express = require('express');
const router = express.Router();
const supportAdminController = require('../controllers/supportAdminController');
const { requireAdmin } = require('../middleware/adminAuth');

/**
 * 排障话术库管理（运维后台「排障」Tab）：客服处理用户问题的「症状 → 步骤 → 话术」增删改
 * 全部端点要求 X-Admin-Token（= ADMIN_TOKEN 环境变量）。
 * 话术中的 {RESET_URL} 占位符由端上替换为当前站点的 /reset 短链。
 */

/**
 * @swagger
 * /api/admin/support:
 *   get:
 *     tags: [管理后台 Admin]
 *     summary: 排障话术列表（运维后台）
 *     security: [{ adminToken: [] }]
 *     parameters:
 *       - { name: category, in: query, schema: { type: string, enum: [cache, account, data, pay, usage] } }
 *       - { name: q, in: query, schema: { type: string }, description: 关键词（script_id/标题/症状/步骤/话术） }
 *       - { name: offset, in: query, schema: { type: integer } }
 *       - { name: limit, in: query, schema: { type: integer, maximum: 500 } }
 *     responses:
 *       '200': { description: 列表（含 total / offset / limit / categories / items） }
 *       '401': { description: 未认证或 Admin Token 无效 }
 */
router.get('/', requireAdmin, supportAdminController.listScripts);

/**
 * @swagger
 * /api/admin/support:
 *   post:
 *     tags: [管理后台 Admin]
 *     summary: 新建排障话术
 *     security: [{ adminToken: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, script]
 *             properties:
 *               script_id: { type: string, description: 幂等键；留空自动生成 }
 *               category: { type: string, enum: [cache, account, data, pay, usage], description: 默认 cache }
 *               title: { type: string, description: 问题标题 }
 *               symptom: { type: string, description: 典型症状 }
 *               steps: { type: array, items: { type: string }, description: 处理步骤；也可传换行分隔的字符串（一行一步） }
 *               script: { type: string, description: '可直接复制给用户的话术；支持 {RESET_URL} 占位符（端上替换为 /reset 短链）' }
 *               priority: { type: integer, description: 排序，值大的靠前 }
 *     responses:
 *       '201': { description: 已创建 }
 *       '400': { description: 参数非法或 script_id 重复 }
 */
router.post('/', requireAdmin, supportAdminController.createScript);

/**
 * @swagger
 * /api/admin/support/restore:
 *   post:
 *     tags: [管理后台 Admin]
 *     summary: 恢复内置话术（缺失则补种、已存在则还原为出厂内容；不影响自建条目）
 *     security: [{ adminToken: [] }]
 *     responses:
 *       '200': { description: 恢复完成：created 为新建条数，restored 为还原条数 }
 */
router.post('/restore', requireAdmin, supportAdminController.restoreBuiltin);

/**
 * @swagger
 * /api/admin/support/{id}:
 *   patch:
 *     tags: [管理后台 Admin]
 *     summary: 编辑排障话术
 *     security: [{ adminToken: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       '200': { description: 更新后的条目 }
 *       '400': { description: 参数非法 }
 *       '404': { description: 条目不存在 }
 */
router.patch('/:id', requireAdmin, supportAdminController.updateScript);

/**
 * @swagger
 * /api/admin/support/{id}:
 *   delete:
 *     tags: [管理后台 Admin]
 *     summary: 删除排障话术
 *     security: [{ adminToken: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       '200': { description: 删除成功 }
 *       '404': { description: 条目不存在 }
 */
router.delete('/:id', requireAdmin, supportAdminController.deleteScript);

module.exports = router;
