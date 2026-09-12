const express = require('express');
const router = express.Router();
const leadController = require('../controllers/leadController');
const { optionalAuth } = require('../middleware/auth');

/**
 * 转化线索（阶段13）：工具 → 服务。
 * 公开端点，**无需登录**（游客亦可留资，游客占多数）；
 * 登录态可用时经 optionalAuth 挂载 user_id，便于顾问在管理台看到账号。
 * 限流由 app.js 的 leadLimiter（10 次 / IP / 小时）统一施加
 * （上限取 10 而非更严的 3：大陆移动网络存在运营商 NAT，过严会误伤正常留资；真正的防刷量靠同手机号 24h 幂等去重）。
 */

/**
 * @swagger
 * /api/leads:
 *   post:
 *     tags: [线索 Leads]
 *     summary: 提交转化线索（游客亦可，无需登录）
 *     description: |
 *       留资入口：结果页情境引导 / 内容中心投放 / 个人中心卡片 / 分享图落地页。
 *       - name 必填；phone 与 wechat 至少提供一个；consent 必须为 true（个保法显式同意）
 *       - 同手机号 24h 内重复提交为幂等：不新建记录，合并情境/归因/备注并返回 200
 *       - 非法枚举值（entityType/need/source）自动回落默认，不报错
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, consent]
 *             properties:
 *               name: { type: string, maxLength: 50, description: 联系人姓名 }
 *               phone: { type: string, description: 手机号（与 wechat 至少一个） }
 *               wechat: { type: string, maxLength: 64 }
 *               company: { type: string, maxLength: 100, description: 公司 / 个体户名称 }
 *               entityType: { type: string, enum: [individual, sole, small, other, unknown] }
 *               need: { type: string, enum: [bookkeeping, settlement, declare_check, consult, other] }
 *               source: { type: string, description: 触点归因 }
 *               scene: { type: string, maxLength: 100, description: 情境快照，如「经营所得·汇算清缴」 }
 *               note: { type: string, maxLength: 1000 }
 *               consent: { type: boolean, description: 必须为 true }
 *     responses:
 *       '201': { description: 已创建（响应 data 含 id 与 merged=false） }
 *       '200': { description: 24h 内同手机号重复 → 已合并（响应 data 含 id 与 merged=true） }
 *       '400': { description: 参数非法（缺 name / 无联系方式 / 手机号格式错 / consent 非 true） }
 *       '429': { description: 提交过于频繁（10 次 / IP / 小时） }
 */
router.post('/', optionalAuth, leadController.submitLead);

module.exports = router;
