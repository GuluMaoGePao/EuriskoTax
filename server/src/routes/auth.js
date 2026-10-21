const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');

/**
 * @swagger
 * /api/auth/send-code:
 *   post:
 *     tags: [认证 Auth]
 *     summary: 发送注册验证码到邮箱
 *     description: 向指定邮箱发送 6 位数字验证码（10 分钟有效，60 秒重发冷却，同一 IP 15 分钟内最多 5 次）
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email, example: dev@example.com }
 *     responses:
 *       '200': { description: 发送成功 }
 *       '400': { description: 邮箱格式错误 }
 *       '429': { description: 发送过于频繁 }
 */
router.post('/send-code', authController.sendCode);

/**
 * @swagger
 * /api/auth/send-reset-code:
 *   post:
 *     tags: [认证 Auth]
 *     summary: 发送密码重置验证码到邮箱（忘记密码）
 *     description: 向已注册邮箱发送 6 位数字重置验证码（10 分钟有效，60 秒重发冷却，同一 IP 15 分钟内最多 5 次）。未注册邮箱返回 404 且不发送邮件 —— 先查注册状态再校验格式，所以格式非法的邮箱同样落到 404（不对未注册地址泄露"格式对不对"以外的信息）。
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email, example: dev@example.com }
 *     responses:
 *       '200': { description: 发送成功 }
 *       '404': { description: 该邮箱未注册（含邮箱格式非法） }
 *       '429': { description: 发送过于频繁 }
 */
router.post('/send-reset-code', authController.sendResetCode);

/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     tags: [认证 Auth]
 *     summary: 重置密码（需邮箱重置验证码）
 *     description: 先调用 /api/auth/send-reset-code 获取验证码，校验通过后将该邮箱账号密码更新为新密码。v1.144.0 起：新密码不能与当前密码相同；重置成功后**已签发的旧 token 全部失效**（token_version 自增），并返回新 token 直接登录，无需再走一次 /login。
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, verificationCode, newPassword]
 *             properties:
 *               email:            { type: string, format: email, example: dev@example.com }
 *               verificationCode: { type: string, example: "123456", description: 邮箱重置验证码（6位数字） }
 *               newPassword:      { type: string, minLength: 6, example: "newpassword123", description: 新密码（至少6位，不能与当前密码相同） }
 *     responses:
 *       '200': { description: 密码重置成功，data 返回 { token, user } }
 *       '400': { description: 参数错误 / 验证码无效或过期 / 新密码过短或与当前密码相同 }
 *       '404': { description: 该邮箱未注册 }
 *       '429': { description: 验证码尝试次数超限 }
 */
router.post('/reset-password', authController.resetPassword);

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     tags: [认证 Auth]
 *     summary: 用户注册（需邮箱验证码，邀请码选填）
 *     description: 注册新用户；需先调用 /api/auth/send-code 获取邮箱验证码。v1.144.0 起邀请码**选填**（不填则跳过校验与消耗），且注册成功直接返回 token（无需再走 /login）。邀请码在验证码之前校验，填错不会消耗验证码。
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, email, password, verificationCode]
 *             properties:
 *               username:         { type: string, example: devuser }
 *               email:            { type: string, format: email, example: dev@example.com }
 *               password:         { type: string, minLength: 6, example: password }
 *               phone:            { type: string, example: 13800138000 }
 *               inviteCode:       { type: string, example: EURISKO-ABCD-EFGH, description: 邀请码（选填；填了才校验，每码仅可注册一次） }
 *               verificationCode: { type: string, example: "123456", description: 邮箱验证码（6位数字） }
 *     responses:
 *       '201': { description: 注册成功，data 返回 { token, user } }
 *       '400': { description: 参数错误 / 验证码无效或过期 / 邮箱已存在 }
 *       '403': { description: 邀请码无效或已被使用 }
 */
router.post('/register', authController.register);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     tags: [认证 Auth]
 *     summary: 用户登录，获取 JWT
 *     description: 用**注册邮箱** + 密码登录（v1.144.0 起为邮箱唯一，不再支持用户名登录）。邮箱大小写不敏感。手机号不可作为登录凭据（未验证字段）。非邮箱格式直接 401，不查库。
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:    { type: string, format: email, example: dev@example.com, description: 注册邮箱（字段名沿用 email 以兼容既有客户端） }
 *               password: { type: string, example: password }
 *     responses:
 *       '200': { description: 登录成功，返回 JWT token }
 *       '400': { description: 参数缺失 }
 *       '401': { description: 邮箱或密码错误 }
 */
router.post('/login', authController.login);

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     tags: [认证 Auth]
 *     summary: 退出登录（吊销该用户已签发的全部 JWT）
 *     description: v1.144.0 新增。把 User.token_version 自增，使该用户此前签出的所有 token 立即失效（JWT 本身无状态、无法删除，版本号是唯一能"收回"它的手段）。前端无论本端点成功与否都要清本地会话 —— 离线或后端不可用时也要能退出。
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       '200': { description: 已退出，旧 token 全部失效 }
 *       '401': { description: 未认证或 Token 无效/过期 }
 */
router.post('/logout', authenticateToken, authController.logout);

/**
 * @swagger
 * /api/auth/claim-trial:
 *   post:
 *     tags: [认证 Auth]
 *     summary: 领取 14 天专业版体验（登录，三档体系：基础版 → 体验版）
 *     description: 基础版/已过期体验账号领取后立即开通 14 天专业版（plan=pro + plan_expires_at，granted_by=trial），到期自动回落基础版；公测期不限次数。已处于有效专业版/体验（seed 永久、正式授权或体验进行中）时幂等返回当前状态，不叠加时长。
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       '200':
 *         description: 领取成功/当前状态，data 返回更新后的用户信息（含 plan/plan_expires_at/pro_granted_by）
 *       '401': { description: 未认证或 Token 无效/过期 }
 */
router.post('/claim-trial', authenticateToken, authController.claimTrial);

/**
 * @swagger
 * /api/auth/profile:
 *   get:
 *     tags: [认证 Auth]
 *     summary: 获取当前用户资料
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       '200': { description: 用户资料 }
 *       '401': { description: 未认证或 Token 无效/过期 }
 */
router.get('/profile', authenticateToken, authController.profile);

/**
 * @swagger
 * /api/auth/profile:
 *   put:
 *     tags: [认证 Auth]
 *     summary: 更新当前用户资料
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username: { type: string }
 *               email:    { type: string, format: email }
 *               phone:    { type: string }
 *     responses:
 *       '200': { description: 更新成功 }
 *       '401': { description: 未认证 }
 */
router.put('/profile', authenticateToken, authController.updateProfile);

/**
 * @swagger
 * /api/auth/profile:
 *   delete:
 *     tags: [认证 Auth]
 *     summary: 注销当前用户账号
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       '200': { description: 注销成功 }
 *       '401': { description: 未认证 }
 */
router.delete('/profile', authenticateToken, authController.deleteProfile);

/**
 * @swagger
 * /api/auth/verify-password:
 *   post:
 *     tags: [认证 Auth]
 *     summary: 验证当前用户密码（用于敏感操作前二次确认）
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword]
 *             properties:
 *               currentPassword: { type: string, example: password, description: 当前登录密码 }
 *     responses:
 *       '200': { description: 校验完成，data.valid 为 true / false }
 *       '400': { description: 未提供当前密码 }
 *       '401': { description: Token 无效或过期 }
 */
router.post('/verify-password', authenticateToken, authController.verifyPassword);

module.exports = router;
