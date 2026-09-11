const express = require('express');
const router = express.Router();
const contentAdminController = require('../controllers/contentAdminController');
const { requireAdmin } = require('../middleware/adminAuth');

/**
 * 内容中心管理（运维后台）：政策要点 / 更新公告 / 运营内容的增删改与发布
 * 全部端点要求 X-Admin-Token（= ADMIN_TOKEN 环境变量）。
 */

/**
 * @swagger
 * /api/admin/content:
 *   get:
 *     tags: [管理后台 Admin]
 *     summary: 内容条目列表/筛选（运维后台）
 *     security: [{ adminToken: [] }]
 *     parameters:
 *       - { name: type, in: query, schema: { type: string, enum: [policy, announcement, operation] } }
 *       - { name: status, in: query, schema: { type: string, enum: [draft, published, revoked] } }
 *       - { name: audience, in: query, schema: { type: string, enum: [all, free, pro] } }
 *       - { name: q, in: query, schema: { type: string }, description: 关键词（item_id/标题/问题/正文） }
 *       - { name: offset, in: query, schema: { type: integer } }
 *       - { name: limit, in: query, schema: { type: integer, maximum: 200 } }
 *     responses:
 *       '200': { description: 分页列表（含 total / offset / limit / items） }
 *       '401': { description: 未认证或 Admin Token 无效 }
 */
router.get('/', requireAdmin, contentAdminController.listContent);

/**
 * @swagger
 * /api/admin/content:
 *   post:
 *     tags: [管理后台 Admin]
 *     summary: 新建内容条目
 *     security: [{ adminToken: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               item_id: { type: string, description: 幂等键；policy 覆盖内置条目时须与内置 id 一致；留空自动生成 }
 *               type: { type: string, enum: [policy, announcement, operation] }
 *               audience: { type: string, enum: [all, free, pro], description: 默认 all }
 *               placements: { type: array, items: { type: string, enum: [assistant_qa, home_banner, modal, notice_list] } }
 *               title: { type: string }
 *               summary: { type: string }
 *               body: { type: string }
 *               question: { type: string, description: policy 用 }
 *               answer: { type: string, description: policy 用 }
 *               category: { type: string, description: policy 用 }
 *               keywords: { type: array, items: { type: string } }
 *               hot: { type: boolean }
 *               link_url: { type: string }
 *               link_text: { type: string }
 *               priority: { type: integer }
 *               status: { type: string, enum: [draft, published, revoked], description: 默认 draft }
 *               publish_at: { type: string, format: date-time, description: 预约上线时间 }
 *               expire_at: { type: string, format: date-time, nullable: true, description: 自动下架时间 }
 *     responses:
 *       '201': { description: 已创建 }
 *       '400': { description: 参数非法或 item_id 重复 }
 */
router.post('/', requireAdmin, contentAdminController.createContent);

/**
 * @swagger
 * /api/admin/content/releases:
 *   get:
 *     tags: [管理后台 Admin]
 *     summary: 发布批次列表
 *     security: [{ adminToken: [] }]
 *     responses:
 *       '200': { description: 最近 50 条发布记录 }
 */
router.get('/releases', requireAdmin, contentAdminController.listReleases);

/**
 * @swagger
 * /api/admin/content/releases:
 *   post:
 *     tags: [管理后台 Admin]
 *     summary: 发布内容（草稿转已发布 + 登记版本号）
 *     security: [{ adminToken: [] }]
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               version: { type: string, description: 留空自动生成 YYYY.MM.DD-N }
 *               notice: { type: string, description: 端上"内容已更新"提示文案 }
 *     responses:
 *       '200': { description: { version, notice, promotedCount } }
 */
router.post('/releases', requireAdmin, contentAdminController.publishContent);

/**
 * @swagger
 * /api/admin/content/{id}:
 *   patch:
 *     tags: [管理后台 Admin]
 *     summary: 编辑内容条目（含草稿/发布/撤回状态切换）
 *     security: [{ adminToken: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       '200': { description: 更新后的条目 }
 *       '400': { description: 参数非法 }
 *       '404': { description: 条目不存在 }
 */
router.patch('/:id', requireAdmin, contentAdminController.updateContent);

/**
 * @swagger
 * /api/admin/content/{id}:
 *   delete:
 *     tags: [管理后台 Admin]
 *     summary: 删除内容条目
 *     security: [{ adminToken: [] }]
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       '200': { description: 删除成功 }
 *       '404': { description: 条目不存在 }
 */
router.delete('/:id', requireAdmin, contentAdminController.deleteContent);

module.exports = router;
