const express = require('express');
const router = express.Router();
const calculationController = require('../controllers/calculationController');
const syncController = require('../controllers/calcSyncController');
const { authenticateToken } = require('../middleware/auth');

/**
 * @swagger
 * tags:
 *   - name: 计算 Calculations
 *     description: 个税计算相关接口
 */

/**
 * @swagger
 * /api/calculations/comprehensive:
 *   post:
 *     tags: [计算 Calculations]
 *     summary: 综合所得计算
 *     description: 计算工资薪金、劳务报酬、稿酬、特许权使用费四项综合所得的应纳税额
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             example: { salary: 30000, socialInsurance: 3500, specialDeduction: 4000, months: 12 }
 *     responses:
 *       '200': { description: 计算结果 }
 *       '400': { description: 参数错误 }
 *       '401': { description: 未认证 }
 */
router.post('/comprehensive', calculationController.calculateComprehensive);

/**
 * @swagger
 * /api/calculations/reverse:
 *   post:
 *     tags: [计算 Calculations]
 *     summary: 反向倒算（按目标税额/到手金额倒算）
 *     description: 根据目标税后到手金额或目标税额，反向推导应发工资
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             example: { mode: target_net, targetAmount: 25000, socialInsurance: 3500, specialDeduction: 4000 }
 *     responses:
 *       '200': { description: 倒算结果 }
 *       '400': { description: 参数错误 }
 *       '401': { description: 未认证 }
 */
router.post('/reverse', calculationController.calculateReverse);

/**
 * @swagger
 * /api/calculations/business:
 *   post:
 *     tags: [计算 Calculations]
 *     summary: 经营所得计算
 *     description: 计算个体工商户、个人独资企业等经营所得的应纳税额
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             example: { revenue: 500000, costs: 200000, expenses: 80000 }
 *     responses:
 *       '200': { description: 计算结果 }
 *       '400': { description: 参数错误 }
 *       '401': { description: 未认证 }
 */
router.post('/business', calculationController.calculateBusiness);

/**
 * @swagger
 * /api/calculations/classification:
 *   post:
 *     tags: [计算 Calculations]
 *     summary: 分类所得计算（利息/股息/财产租赁/转让/偶然所得）
 *     description: 计算财产租赁、财产转让、利息股息红利、偶然所得等分类所得
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             example: { type: dividend, amount: 10000 }
 *     responses:
 *       '200': { description: 计算结果 }
 *       '400': { description: 参数错误 }
 *       '401': { description: 未认证 }
 */
router.post('/classification', calculationController.calculateClassification);

/**
 * @swagger
 * /api/calculations/sync:
 *   post:
 *     tags: [计算 Calculations]
 *     summary: 计算历史云端同步（专业版）——批量推送 + 全量拉取
 *     description: >
 *       将本端增量（含墓碑）push 到云端，按 (user_id, clientId) 幂等 upsert、updatedAt 新者胜；
 *       返回该账号全量活跃记录与已删 clientId 集合，供本端 merge。免费版返回 403 PRO_REQUIRED。
 *       云端活跃历史上限 500 条，超出返回 409 HISTORY_LIMIT_REACHED。单请求 ≤200 条、单条 ≤50KB。
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             example:
 *               push:
 *                 - clientId: "1715000000000_ab12cd"
 *                   type: comprehensive
 *                   data: { title: "2026年1月", date: "2026-01-15", income: 30000, tax: 3210, results: {} }
 *                   updatedAt: "2026-09-08T10:00:00.000Z"
 *                 - clientId: "1715000000123_ef34"
 *                   type: comprehensive
 *                   updatedAt: "2026-09-08T10:05:00.000Z"
 *                   deletedAt: "2026-09-08T10:05:00.000Z"
 *     responses:
 *       '200':
 *         description: 同步成功，返回 records + deletedClientIds
 *       '400': { description: 同步条目校验失败 }
 *       '401': { description: 未认证 }
 *       '403': { description: 免费版无云同步（code=PRO_REQUIRED） }
 *       '409': { description: 云端历史上限（code=HISTORY_LIMIT_REACHED） }
 */
router.post('/sync', authenticateToken, syncController.syncHistory);

/**
 * @swagger
 * /api/calculations/history:
 *   get:
 *     tags: [计算 Calculations]
 *     summary: 获取当前用户的计算历史
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *         description: 分页数量
 *       - in: query
 *         name: offset
 *         schema: { type: integer, default: 0 }
 *         description: 偏移量
 *     responses:
 *       '200': { description: 历史计算记录数组 }
 *       '401': { description: 未认证 }
 */
router.get('/history', authenticateToken, calculationController.getHistory);

/**
 * @swagger
 * /api/calculations/{id}:
 *   get:
 *     tags: [计算 Calculations]
 *     summary: 根据ID获取单条计算记录详情
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: 计算记录ID
 *     responses:
 *       '200': { description: 计算记录详情 }
 *       '401': { description: 未认证 }
 *       '404': { description: 记录不存在 }
 */
router.get('/:id', authenticateToken, calculationController.getCalculationById);

/**
 * @swagger
 * /api/calculations/{id}:
 *   delete:
 *     tags: [计算 Calculations]
 *     summary: 删除指定ID的计算记录
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: 计算记录ID
 *     responses:
 *       '200': { description: 删除成功 }
 *       '401': { description: 未认证 }
 *       '404': { description: 记录不存在 }
 */
router.delete('/:id', authenticateToken, calculationController.deleteCalculation);

module.exports = router;
