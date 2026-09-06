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
 *     description: 向已注册邮箱发送 6 位数字重置验证码（10 分钟有效，60 秒重发冷却，同一 IP 15 分钟内最多 5 次）。未注册邮箱返回 404 且不发送邮件。
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
 *       '400': { description: 邮箱格式错误 }
 *       '404': { description: 该邮箱未注册 }
 *       '429': { description: 发送过于频繁 }
 */
router.post('/send-reset-code', authController.sendResetCode);

/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     tags: [认证 Auth]
 *     summary: 重置密码（需邮箱重置验证码）
 *     description: 先调用 /api/auth/send-reset-code 获取验证码，校验通过后将该邮箱账号密码更新为新密码。成功后原密码立即失效，旧登录态 token 不受影响。
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
 *               newPassword:      { type: string, minLength: 6, example: "newpassword123", description: 新密码（至少6位） }
 *     responses:
 *       '200': { description: 密码重置成功 }
 *       '400': { description: 参数错误 / 验证码无效或过期 / 新密码过短 }
 *       '404': { description: 该邮箱未注册 }
 *       '429': { description: 验证码尝试次数超限 }
 */
router.post('/reset-password', authController.resetPassword);

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     tags: [认证 Auth]
 *     summary: 用户注册（需邮箱验证码 + 邀请码）
 *     description: 注册新用户；需先调用 /api/auth/send-code 获取邮箱验证码，公测期还需提供有效邀请码
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, email, password, inviteCode, verificationCode]
 *             properties:
 *               username:         { type: string, example: devuser }
 *               email:            { type: string, format: email, example: dev@example.com }
 *               password:         { type: string, minLength: 6, example: password }
 *               phone:            { type: string, example: 13800138000 }
 *               inviteCode:       { type: string, example: EURISKO-ABCD-EFGH, description: 一机一码邀请码（向开发者获取，每码仅可注册一次） }
 *               verificationCode: { type: string, example: "123456", description: 邮箱验证码（6位数字） }
 *     responses:
 *       '201': { description: 注册成功 }
 *       '400': { description: 参数错误 / 验证码无效或过期 / 邮箱已存在 }
 *       '403': { description: 邀请码无效 }
 */
router.post('/register', authController.register);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     tags: [认证 Auth]
 *     summary: 用户登录，获取 JWT
 *     description: 用邮箱密码登录，成功返回 access_token（JWT）
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:    { type: string, format: email, example: dev@example.com }
 *               password: { type: string, example: password }
 *     responses:
 *       '200': { description: 登录成功，返回 JWT token }
 *       '400': { description: 邮箱或密码错误 }
 */
router.post('/login', authController.login);

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
 *             required: [password]
 *             properties:
 *               password: { type: string, example: password }
 *     responses:
 *       '200': { description: 密码正确 }
 *       '401': { description: Token 无效或密码错误 }
 */
router.post('/verify-password', authenticateToken, authController.verifyPassword);

module.exports = router;
