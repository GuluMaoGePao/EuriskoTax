/**
 * 管理台会话路由（/api/admin）
 *
 * 登录的是**工作人员**（AdminUser 表），不是客户（User 表）。两张表完全分开：
 * 工作人员没有 plan / 兑换码 / 计算记录这些客户字段，也登录不了客户端 App。
 *
 * 设计要点：
 *   - 密码用 bcrypt，吊销沿用 AdminUser.token_version（与客户端同款机制）。
 *   - 签发的 JWT 带 `scope: 'admin'` 与 `staffId`，有效期默认 **2 小时**。
 *     客户端令牌签的是 `userId`，查另一张表 —— 天然不通用，不靠约定挡。
 *   - 三种失败（无此邮箱 / 已禁用 / 密码错）**返回同一句话**，并用 dummy 哈希
 *     补齐比对耗时，否则接口就是「枚举哪些邮箱是工作人员」的探针。
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { requireAdmin, STAFF_ROLES } = require('../middleware/adminAuth');

const router = express.Router();
const prisma = new PrismaClient();

// 管理台会话默认 2 小时：它能改税率、发兑换码、看所有客户，
// 令牌落在公用电脑上的代价远大于「多登录一次」的麻烦。
const ADMIN_TTL = process.env.ADMIN_JWT_EXPIRES_IN || '2h';

// 与真哈希同量级的比对目标（对应 "invalid-password-placeholder"）。
// 邮箱不存在时也要跑一次 bcrypt.compare：否则「命中账号走哈希、未命中直接返回」
// 的耗时差会暴露哪些邮箱存在 —— 对管理台尤其要命，那等于把工作人员名单递出去。
const DUMMY_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

const fail = (res, message, statusCode) => res.status(statusCode).json({
    success: false,
    error: { message, statusCode }
});

const signAdminToken = (staff) => jwt.sign(
    { staffId: staff.id, tv: staff.token_version ?? 0, role: staff.role, scope: 'admin' },
    process.env.JWT_SECRET,
    { expiresIn: ADMIN_TTL }
);

const publicStaff = (s) => ({ id: s.id, email: s.email, username: s.username, role: s.role, last_login_at: s.last_login_at });

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
 *       '401': { description: 邮箱或密码错误，或该账号不可用 }
 */
router.post('/login', async (req, res) => {
    try {
        const email = String(req.body?.email || '').trim().toLowerCase();
        const password = String(req.body?.password || '');
        if (!email || !password) return fail(res, '邮箱和密码不能为空', 400);

        const staff = await prisma.adminUser.findUnique({
            where: { email },
            select: { id: true, username: true, email: true, role: true, status: true, password_hash: true, token_version: true, last_login_at: true }
        });

        // 三种失败同一句提示，且无论命中与否都做一次 bcrypt 比对
        const usable = staff && staff.status === 'active' && STAFF_ROLES.includes(staff.role);
        const hash = usable ? staff.password_hash : DUMMY_HASH;
        const passwordOk = await bcrypt.compare(password, hash);
        if (!usable || !passwordOk) {
            return fail(res, '邮箱或密码错误，或该账号不可用', 401);
        }

        // 记录最后登录时间：多人协作时，「这个账号最近有没有人在用」是排查第一步
        await prisma.adminUser.update({ where: { id: staff.id }, data: { last_login_at: new Date() } });

        res.json({
            success: true,
            data: { token: signAdminToken(staff), expiresIn: ADMIN_TTL, user: publicStaff(staff) }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: '登录失败', statusCode: 500 } });
    }
});

/**
 * @swagger
 * /api/admin/me:
 *   get:
 *     summary: 当前工作人员信息（同时用于校验令牌是否仍有效）
 *     tags: [管理台 Admin]
 *     responses:
 *       '200': { description: 当前工作人员（含角色，前端据此决定哪些 Tab 可见） }
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
        if (!req.admin.id) return fail(res, '静态令牌不支持续期，请使用邮箱密码登录', 400);
        const staff = await prisma.adminUser.findUnique({
            where: { id: req.admin.id },
            select: { id: true, username: true, email: true, role: true, status: true, token_version: true, last_login_at: true }
        });
        if (!staff) return fail(res, '账号不存在', 401);
        res.json({
            success: true,
            data: { token: signAdminToken(staff), expiresIn: ADMIN_TTL, user: publicStaff(staff) }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: '续期失败', statusCode: 500 } });
    }
});

/**
 * @swagger
 * /api/admin/logout:
 *   post:
 *     summary: 退出管理台并吊销该账号已签发的令牌
 *     tags: [管理台 Admin]
 *     responses:
 *       '200': { description: 已退出 }
 */
router.post('/logout', requireAdmin, async (req, res) => {
    try {
        if (!req.admin.id) return res.json({ success: true, data: { revoked: false } });
        // 推高登录态版本号：这一刻之前签出的令牌全部作废。
        // 不做这一步，复制走的令牌在剩下的时间里照样能改税率、发兑换码。
        // 与客户端互不影响 —— 吊销的是 AdminUser，客户的 User 会话不受牵连
        // （v1.145.0 用 User.role 时这两者会互相踢，分表后不再有这个问题）。
        await prisma.adminUser.update({
            where: { id: req.admin.id },
            data: { token_version: { increment: 1 } }
        });
        res.json({ success: true, data: { revoked: true } });
    } catch (err) {
        res.status(500).json({ success: false, error: { message: '退出失败', statusCode: 500 } });
    }
});

module.exports = router;
