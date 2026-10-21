/**
 * 工作人员账号管理（/api/admin/staff）—— 只有 owner 能进
 *
 * 这道「谁能管人」的门禁是多人体系的地基：少了它，一个 support 就能把自己提成
 * owner，前面分三级角色等于白分。所以整组端点都挂 requireOwner。
 *
 * 三条自保规则（都是踩过才知道要加的）：
 *   ① **不能改自己的角色与状态** —— 否则 owner 一键把自己降成 support，
 *      全场再没人能管账号，只能上服务器改库；也堵掉「改完别人再改自己」的绕行。
 *   ② **不能把最后一个 owner 降权或禁用** —— 那等于把管理台锁死。
 *   ③ **降权/禁用时推高 token_version** —— 否则对方手里那把令牌要到 2 小时后才失效，
 *      「已撤销的人」在这两小时里照样是工作人员。
 *
 * 只禁用不删除：工作人员的操作要能追溯到具体的人，删行等于抹掉痕迹。
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { requireAdmin, requireOwner, STAFF_ROLES } = require('../middleware/adminAuth');

const router = express.Router();
const prisma = new PrismaClient();

const MIN_PASSWORD_LENGTH = 12;
const ROUNDS = parseInt(process.env.BCRYPT_ROUNDS) || 10;
const SELECT = { id: true, email: true, username: true, role: true, status: true, last_login_at: true, created_at: true };

const fail = (res, message, statusCode = 400) => res.status(statusCode).json({
    success: false,
    error: { message, statusCode }
});

const audit = (actor, action, target) => {
    console.log(`[STAFF] ${new Date().toISOString()} by=${actor || 'unknown'} ${action} target=${target}`);
};

// 当前还有几个可用的 owner —— 用于拦住「把最后一个 owner 干掉」
async function countActiveOwners() {
    return prisma.adminUser.count({ where: { role: 'owner', status: 'active' } });
}

/**
 * @swagger
 * /api/admin/staff:
 *   get:
 *     summary: 工作人员列表（仅 owner）
 *     tags: [管理台 Admin]
 *     responses:
 *       '200': { description: 列表 }
 *       '403': { description: 非所有者 }
 */
router.get('/', requireAdmin, requireOwner, async (req, res) => {
    try {
        const items = await prisma.adminUser.findMany({ select: SELECT, orderBy: { created_at: 'asc' } });
        res.json({ success: true, data: { items, roles: STAFF_ROLES } });
    } catch (err) {
        fail(res, '读取失败', 500);
    }
});

/**
 * @swagger
 * /api/admin/staff:
 *   post:
 *     summary: 新建工作人员（仅 owner）
 *     tags: [管理台 Admin]
 *     responses:
 *       '201': { description: 已创建 }
 *       '403': { description: 非所有者 }
 */
router.post('/', requireAdmin, requireOwner, async (req, res) => {
    try {
        const email = String(req.body?.email || '').trim().toLowerCase();
        const password = String(req.body?.password || '');
        const role = String(req.body?.role || 'support');
        const username = String(req.body?.username || '').trim() || email.split('@')[0];

        if (!email || !password) return fail(res, '邮箱和密码不能为空');
        if (password.length < MIN_PASSWORD_LENGTH) {
            return fail(res, `密码至少 ${MIN_PASSWORD_LENGTH} 位 —— 这个账号能碰客户数据与站点配置，短密码扛不住撞库`);
        }
        if (!STAFF_ROLES.includes(role)) return fail(res, `角色只能是 ${STAFF_ROLES.join(' / ')}`);

        if (await prisma.adminUser.findUnique({ where: { email } })) {
            return fail(res, '该邮箱已是工作人员', 409);
        }

        const created = await prisma.adminUser.create({
            data: { email, username, role, password_hash: await bcrypt.hash(password, ROUNDS) },
            select: SELECT
        });
        audit(req.admin.email, `create role=${role}`, created.email);
        res.status(201).json({ success: true, data: created });
    } catch (err) {
        fail(res, '创建失败', 500);
    }
});

/**
 * @swagger
 * /api/admin/staff/{id}:
 *   patch:
 *     summary: 改角色 / 禁用 / 启用（仅 owner，且不能改自己）
 *     tags: [管理台 Admin]
 *     responses:
 *       '200': { description: 已更新 }
 *       '403': { description: 非所有者，或试图修改自己 / 最后一个 owner }
 */
router.patch('/:id', requireAdmin, requireOwner, async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (!Number.isInteger(id)) return fail(res, 'id 非法');
        // ① 不能改自己
        if (req.admin.id === id) return fail(res, '不能修改自己的角色或状态 —— 请由另一位所有者操作', 403);

        const target = await prisma.adminUser.findUnique({ where: { id }, select: { id: true, email: true, role: true, status: true } });
        if (!target) return fail(res, '账号不存在', 404);

        const data = {};
        if (req.body?.role !== undefined) {
            if (!STAFF_ROLES.includes(req.body.role)) return fail(res, `角色只能是 ${STAFF_ROLES.join(' / ')}`);
            data.role = req.body.role;
        }
        if (req.body?.status !== undefined) {
            if (!['active', 'disabled'].includes(req.body.status)) return fail(res, '状态只能是 active / disabled');
            data.status = req.body.status;
        }
        if (Object.keys(data).length === 0) return fail(res, '没有要更新的字段');

        // ② 不能把最后一个 owner 降权或禁用
        const demotingOwner = target.role === 'owner' && (data.role && data.role !== 'owner');
        const disablingOwner = target.role === 'owner' && data.status === 'disabled';
        if (demotingOwner || disablingOwner) {
            const owners = await countActiveOwners();
            if (owners <= 1) return fail(res, '至少要保留一名所有者，否则管理台将无人可管', 403);
        }

        // ③ 降权 / 禁用立即吊销其令牌
        if (data.status === 'disabled' || (data.role && data.role !== target.role)) {
            data.token_version = { increment: 1 };
        }

        const updated = await prisma.adminUser.update({ where: { id }, data, select: SELECT });
        audit(req.admin.email, `patch ${JSON.stringify(data)}`, target.email);
        res.json({ success: true, data: updated });
    } catch (err) {
        fail(res, '更新失败', 500);
    }
});

/**
 * @swagger
 * /api/admin/staff/{id}/password:
 *   post:
 *     summary: 重置工作人员密码（仅 owner）
 *     tags: [管理台 Admin]
 *     responses:
 *       '200': { description: 已重置，该账号现有会话全部失效 }
 *       '403': { description: 非所有者 }
 */
router.post('/:id/password', requireAdmin, requireOwner, async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (!Number.isInteger(id)) return fail(res, 'id 非法');
        const password = String(req.body?.password || '');
        if (password.length < MIN_PASSWORD_LENGTH) return fail(res, `密码至少 ${MIN_PASSWORD_LENGTH} 位`);

        const target = await prisma.adminUser.findUnique({ where: { id }, select: { id: true, email: true, password_hash: true } });
        if (!target) return fail(res, '账号不存在', 404);
        if (await bcrypt.compare(password, target.password_hash)) return fail(res, '新密码不能与当前密码相同');

        await prisma.adminUser.update({
            where: { id },
            data: { password_hash: await bcrypt.hash(password, ROUNDS), token_version: { increment: 1 } }
        });
        audit(req.admin.email, 'reset-password', target.email);
        res.json({ success: true, data: { id, revoked: true } });
    } catch (err) {
        fail(res, '重置失败', 500);
    }
});

module.exports = router;
