const express = require('express');
const router = express.Router();
const leadAdminController = require('../controllers/leadAdminController');
const { requireAdmin } = require('../middleware/adminAuth');

/**
 * 转化线索管理（运维后台「线索」Tab）：列表 → 分配顾问 → 状态机跟进 → CSV 导出。
 * 全部端点要求 X-Admin-Token（= ADMIN_TOKEN 环境变量）。
 * 顾问跟进话术中的 {NAME} / {SCENE} 占位符由管理台替换为线索姓名与情境快照。
 */

/**
 * @swagger
 * /api/admin/leads:
 *   get:
 *     tags: [管理后台 Admin]
 *     summary: 线索列表（运维后台）
 *     security: [{ adminToken: [] }]
 *     parameters:
 *       - { name: status, in: query, schema: { type: string, enum: [new, contacted, qualified, converted, dropped] } }
 *       - { name: source, in: query, schema: { type: string }, description: 触点归因（result_business / home_banner / share ...） }
 *       - { name: q, in: query, schema: { type: string }, description: 关键词（姓名 / 手机号 / 公司） }
 *       - { name: offset, in: query, schema: { type: integer } }
 *       - { name: limit, in: query, schema: { type: integer, maximum: 200 } }
 *     responses:
 *       '200': { description: 列表（含 total / offset / limit / byStatus / items，items 关联 user） }
 *       '401': { description: 未认证或 Admin Token 无效 }
 */
router.get('/', requireAdmin, leadAdminController.listLeads);

/**
 * @swagger
 * /api/admin/leads/stats:
 *   get:
 *     tags: [管理后台 Admin]
 *     summary: 线索漏斗统计
 *     description: 各状态计数 + 今日新增 + 待分配 + 按来源分布。配合 /api/stats/overview 的计算数可算北极星指标 lead_submit / calc_done。
 *     security: [{ adminToken: [] }]
 *     responses:
 *       '200': { description: { total, newToday, unassigned, byStatus, bySource, dateLabel } }
 *       '401': { description: 未认证或 Admin Token 无效 }
 */
router.get('/stats', requireAdmin, leadAdminController.leadStats);

/**
 * @swagger
 * /api/admin/leads/funnel:
 *   get:
 *     tags: [管理后台 Admin]
 *     summary: 转化漏斗统计（visit → calc_done → lead_click → lead_submit）
 *     description: |
 *       visit / calc_done / share / save / lead_click 取自 FunnelEvent 日聚合（公开端点上报，含游客）；
 *       lead_submit 直接统计 Lead 表（唯一真相，避免两处存储对不上）。
 *       北极星 northStar = lead_submit / calc_done（不用 visit 作分母：未完成测算的流量不算转化机会）。
 *     security: [{ adminToken: [] }]
 *     parameters:
 *       - { name: days, in: query, schema: { type: integer, maximum: 90 }, description: 统计近 N 天（含今日），默认 7 }
 *     responses:
 *       '200': { description: 各步累计 steps + 今日 today + 转化率 rates + 北极星 northStar }
 *       '401': { description: 未认证或 Admin Token 无效 }
 */
router.get('/funnel', requireAdmin, leadAdminController.funnelStats);

/**
 * @swagger
 * /api/admin/leads/export:
 *   get:
 *     tags: [管理后台 Admin]
 *     summary: 线索 CSV 导出
 *     description: 含 UTF-8 BOM（Excel 中文不乱码）；备注字段做了公式注入防护。与列表筛选条件一致，最多 5000 条。
 *     security: [{ adminToken: [] }]
 *     parameters:
 *       - { name: status, in: query, schema: { type: string } }
 *       - { name: source, in: query, schema: { type: string } }
 *       - { name: q, in: query, schema: { type: string } }
 *     responses:
 *       '200': { description: text/csv 文件流 }
 *       '401': { description: 未认证或 Admin Token 无效 }
 */
router.get('/export', requireAdmin, leadAdminController.exportLeads);

/**
 * @swagger
 * /api/admin/leads/{id}:
 *   patch:
 *     tags: [管理后台 Admin]
 *     summary: 更新线索（部分更新）
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
 *               status: { type: string, enum: [new, contacted, qualified, converted, dropped] }
 *               owner: { type: string, nullable: true, description: 跟进顾问；传 null/'' 取消分配 }
 *               note: { type: string, description: 跟进备注 }
 *     responses:
 *       '200': { description: 更新后的线索 }
 *       '400': { description: 参数非法或未提供任何可更新字段 }
 *       '404': { description: 线索不存在 }
 */
router.patch('/:id', requireAdmin, leadAdminController.updateLead);

module.exports = router;
