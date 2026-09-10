const express = require('express');
const router = express.Router();
const userAdminController = require('../controllers/userAdminController');
const { requireAdmin } = require('../middleware/adminAuth');

/**
 * 用户管理（运维后台）：查询用户、调整专业版权益（体验补发/永久/回落基础版）
 * 全部端点要求 X-Admin-Token（= ADMIN_TOKEN 环境变量）。
 */

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     tags: [管理后台 Admin]
 *     summary: 用户列表/搜索（运维后台）
 *     security: [{ adminToken: [] }]
 *     parameters:
 *       - { name: q, in: query, schema: { type: string }, description: 用户名或邮箱关键词 }
 *       - { name: plan, in: query, schema: { type: string, enum: [free, pro] }, description: 按计划筛选 }
 *       - { name: offset, in: query, schema: { type: integer }, description: 偏移，默认 0 }
 *       - { name: limit, in: query, schema: { type: integer, maximum: 200 }, description: 条数，默认 50 }
 *     responses:
 *       '200':
 *         description: 分页列表（含 total / offset / limit / items）
 *       '401': { description: 未认证或 Admin Token 无效 }
 */
router.get('/', requireAdmin, userAdminController.listUsers);

/**
 * @swagger
 * /api/admin/users/{id}:
 *   get:
 *     tags: [管理后台 Admin]
 *     summary: 用户详情（含反馈/计算条数与最近动态）
 *     security: [{ adminToken: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       '200':
 *         description: 详情 data 结构
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               description: 包含 user、counts（feedback/calculations 条数）、recentFeedback、recentCalculations
 *       '404': { description: 用户不存在 }
 */
router.get('/:id', requireAdmin, userAdminController.getUserDetail);

/**
 * @swagger
 * /api/admin/users/{id}/plan:
 *   patch:
 *     tags: [管理后台 Admin]
 *     summary: 调整用户计划（授予专业版体验/永久 / 回落基础版）
 *     security: [{ adminToken: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               plan: { type: string, enum: [free, pro], description: pro=授予专业版，free=回落基础版 }
 *               expiresAt: { type: string, nullable: true, format: date-time, description: pro 时：null=永久，日期=限时生效；free 时忽略 }
 *               grantedBy: { type: string, enum: [seed, invite, admin, purchase], description: 授权来源，默认 admin }
 *     responses:
 *       '200': { description: 更新后的用户信息 }
 *       '404': { description: 用户不存在 }
 */
router.patch('/:id/plan', requireAdmin, userAdminController.setUserPlan);

module.exports = router;
