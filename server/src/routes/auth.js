const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     tags: [认证 Auth]
 *     summary: 用户注册（需邀请码）
 *     description: 注册新用户，公测期需提供有效邀请码
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, email, password, inviteCode]
 *             properties:
 *               username:   { type: string, example: devuser }
 *               email:      { type: string, format: email, example: dev@example.com }
 *               password:   { type: string, minLength: 6, example: password }
 *               phone:      { type: string, example: 13800138000 }
 *               inviteCode: { type: string, example: EURISKO2026BETA, description: 公测期邀请码 }
 *     responses:
 *       '201': { description: 注册成功 }
 *       '400': { description: 参数错误或邮箱已存在 }
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
