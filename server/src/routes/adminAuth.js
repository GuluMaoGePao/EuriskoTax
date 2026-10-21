/**
 * 管理台会话路由（/api/admin）
 *
 * v1.145.0：管理台从「一把静态令牌」改为「邮箱 + 密码登录，后端签短期令牌」。
 *
 * 设计要点：
 *   - 管理员 = `role = 'admin'` 的 User，复用 App 已有的 bcrypt 哈希与
 *     token_version 吊销机制 —— 不新造一套账号体系，也就不会有两套密码规则。
 *   - 签发的 JWT 带 `scope: 'admin'`，有效期默认 **2 小时**（App 是 7 天）。
 *     两者互不通用：App 令牌进不了管理台，管理台令牌也不该拿去当 App 令牌用。
 *   - 登录失败的三种情况（无此邮箱 / 不是管理员 / 密码错）**返回同一句话**，
 *     并用 dummy 哈希补齐比对耗时，避免接口变成「枚举管理员邮箱」的探针。
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { requireAdmin } = require('../middleware/adminAuth');

const router = express.Router();
const prisma = new PrismaClient();

// 管理台会话默认 2 小时：比 App 的 7 天短两个数量级 —— 管理台能改税率、发兑换码、
// 看所有用户，令牌落在公用电脑上的代价远大于「多登录一次」的麻烦。
const ADMIN_TTL = process.env.ADMIN_JWT_EXPIRES_IN || '2h';

// 与真哈希同量级的比对目标（对应 "invalid-password-placeholder"）。
// 邮箱不存在时也要跑一次 bcrypt.compare：否则「命中账号走哈希、未命中直接返回」
// 的耗时差会暴露哪些邮箱存在 —— 对管理台尤其要命，那等于把管理员名单递出去。
const DUMMY_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

const fail = (res, message, statusCode) => res.status(statusCode).json({
    success: false,
    error: { message, statusCode }
});

// 签发管理台令牌：payload 里的 scope 是「这把钥匙能开哪扇门」的唯一依据，
// tv 沿用 App 的登录态版本号 —— 改密 / 退出后管理台会话一并吊销。
const signAdminToken = (user) => jwt.sign(
    { userId: user.id, tv: user.token_version ?? 0, role: 'admin', scope: 'admin' },
    process.env.JWT_SECRET,
    { expiresIn: ADMIN_TTL }
);

/**
 * @swagger
 * /api/admin/login:
 *   post:
 *     summary: 管理台登录（邮箱 + 密码）
 *     tags: [管理台 Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string }
 *               password: { type: string }
 *     responses:
 *       '200': { description: 登录成功，返回短期 JWT（默认 2h） }
 *       '400': { description: 邮箱或密码为空 }
 *       '401': { description: 邮箱或密码错误，或该账号不是管理员 }
 */
router.post('/login', async (req, res) => {
    try {
        const email = String(req.body?.email || '').trim().toLowerCase();
        const password = String(req.body?.password || '');
        if (!email || !password) return fail(res, '邮箱和密码不能为空', 400);

        const user = await prisma.user.findUnique({
            where: { email },
            select: { id: true, username: true, email: true, role: true, password_hash: true, token_version: true }
        });

        // 三种失败同一句提示，且无论命中与否都做一次 bcrypt 比对
        const hash = user && user.role === 'admin' ? user.password_hash : DUMMY_HASH;
        const passwordOk = await bcrypt.compare(password, hash);
        if (!user || user.role !== 'admin' || !passwordOk) {
            return fail(res, '邮箱或密码错误，或该账号不是管理员', 401);
        }

        res.json({
            success: true,
            data: {
                token: signAdminToken(user),
                expiresIn: ADMIN_TTL,
                user: { id: user.id, email: user.email, username: user.username }
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: '登录失败', statusCode: 500 } });
    }
});

/**
 * @swagger
 * /api/admin/me:
 *   get:
 *     summary: 当前管理员信息（同时用于校验令牌是否仍有效）
 *     tags: [管理台 Admin]
 *     responses:
 *       '200': { description: 当前管理员 }
 *       '401': { description: 未认证或会话已失效 }
 */
router.get('/me', requireAdmin, (req, res) => {
    res.json({ success: true, data: { admin: req.admin } });
});

/**
 * @swagger
 * /api/admin/refresh:
 *   post:
 *     summary: 续期管理台会话（在旧令牌过期前换取新令牌）
 *     tags: [管理台 Admin]
 *     responses:
 *       '200': { description: 新的短期 JWT }
 *       '401': { description: 旧会话已失效，需重新登录 }
 */
router.post('/refresh', requireAdmin, async (req, res) => {
    try {
        if (!req.admin.id) {
            return fail(res, '静态令牌不支持续期，请使用邮箱密码登录', 400);
        }
        const user = await prisma.user.findUnique({
            where: { id: req.admin.id },
            select: { id: true, username: true, email: true, token_version: true }
        });
        if (!user) return fail(res, '账号不存在', 401);
        res.json({
            success: true,
            data: {
                token: signAdminToken(user),
                expiresIn: ADMIN_TTL,
                user: { id: user.id, email: user.email, username: user.username }
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: '续期失败', statusCode: 500 } });
    }
});

/**
 * @swagger
 * /api/admin/logout:
 *   post:
 *     summary: 退出管理台并吊销该账号的所有会话
 *     tags: [管理台 Admin]
 *     responses:
 *       '200': { description: 已退出（含 App 会话，见说明） }
 */
router.post('/logout', requireAdmin, async (req, res) => {
    try {
        if (!req.admin.id) {
            return res.json({ success: true, data: { revoked: false } });
        }
        // 推高登录态版本号：这一刻之前签出的所有令牌（管理台 + App）一次性失效。
        // 不是「只退管理台」—— 同一个 User 共用一份 tv，而管理台退出按最严的来更稳妥。
        await prisma.user.update({
            where: { id: req.admin.id },
            data: { token_version: { increment: 1 } }
        });
        res.json({ success: true, data: { revoked: true } });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: '退出失败', statusCode: 500 } });
    }
});

module.exports = router;
