const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// 授权来源白名单（与 User.pro_granted_by 约定一致）
const GRANT_SOURCES = ['seed', 'invite', 'admin', 'purchase'];
// 计划白名单
const PLANS = ['free', 'pro'];

// 公开字段（绝不外泄 password_hash）
const USER_SELECT = {
    id: true,
    username: true,
    email: true,
    phone: true,
    plan: true,
    plan_expires_at: true,
    pro_granted_by: true,
    created_at: true,
    updated_at: true
};

const parsePositiveInt = (raw, fallback, max) => {
    const n = parseInt(raw, 10);
    if (!Number.isInteger(n) || n < 1) return fallback;
    if (max && n > max) return max;
    return n;
};

/**
 * 用户列表/搜索
 * GET /api/admin/users?q=关键词&plan=free|pro&offset=0&limit=50
 * q 匹配用户名或邮箱（子串，忽略大小写）
 */
const listUsers = async (req, res, next) => {
    try {
        const { q, plan } = req.query;
        const where = {};
        if (q && q.trim()) {
            const kw = q.trim();
            where.OR = [
                { username: { contains: kw, mode: 'insensitive' } },
                { email: { contains: kw, mode: 'insensitive' } }
            ];
        }
        if (plan === 'free' || plan === 'pro') {
            where.plan = plan;
        }
        const limit = parsePositiveInt(req.query.limit, 50, 200);
        const offset = parsePositiveInt(req.query.offset, 0, 100000);

        const [total, users] = await Promise.all([
            prisma.user.count({ where }),
            prisma.user.findMany({
                where,
                select: USER_SELECT,
                orderBy: { created_at: 'desc' },
                skip: offset,
                take: limit
            })
        ]);

        res.status(200).json({
            success: true,
            data: { total, offset, limit, items: users }
        });
    } catch (err) {
        next(err);
    }
};

/**
 * 用户详情（含数据规模与最近活动摘要，便于运维判断后调整权益）
 * GET /api/admin/users/:id
 */
const getUserDetail = async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (!Number.isInteger(id)) {
            return res.status(400).json({
                success: false,
                error: { message: 'Invalid user id', statusCode: 400 }
            });
        }
        const user = await prisma.user.findUnique({
            where: { id },
            select: USER_SELECT
        });
        if (!user) {
            return res.status(404).json({
                success: false,
                error: { message: 'User not found', statusCode: 404 }
            });
        }

        const [feedbackCount, calculationCount, recentFeedback, recentCalculations] = await Promise.all([
            prisma.feedback.count({ where: { user_id: id } }),
            prisma.calculation.count({ where: { user_id: id, deleted_at: null } }),
            prisma.feedback.findMany({
                where: { user_id: id },
                orderBy: { created_at: 'desc' },
                take: 5,
                select: { id: true, category: true, content: true, status: true, created_at: true }
            }),
            prisma.calculation.findMany({
                where: { user_id: id, deleted_at: null },
                orderBy: { updated_at: 'desc' },
                take: 5,
                select: { id: true, type: true, updated_at: true }
            })
        ]);

        res.status(200).json({
            success: true,
            data: {
                user,
                counts: { feedback: feedbackCount, calculations: calculationCount },
                recentFeedback,
                recentCalculations
            }
        });
    } catch (err) {
        next(err);
    }
};

/**
 * 调整用户计划（权益发放/回收）
 * PATCH /api/admin/users/:id/plan  body: { plan: 'pro'|'free', expiresAt?: ISO|null, grantedBy?: 来源 }
 * 语义：
 *   - plan=pro + expiresAt=null → 永久专业版（管理员手动开通，grantedBy=admin）
 *   - plan=pro + expiresAt=未来时间 → 限时专业版（如 14 天体验补发）
 *   - plan=free → 回落基础版（清空过期时间与来源）
 * 参数白名单校验后入库，操作记录到服务器日志便于审计。
 */
const setUserPlan = async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (!Number.isInteger(id)) {
            return res.status(400).json({
                success: false,
                error: { message: 'Invalid user id', statusCode: 400 }
            });
        }
        const { plan, expiresAt, grantedBy } = req.body || {};
        if (!PLANS.includes(plan)) {
            return res.status(400).json({
                success: false,
                error: { message: 'Invalid plan. Must be "free" or "pro"', statusCode: 400 }
            });
        }

        const exists = await prisma.user.findUnique({ where: { id }, select: { id: true } });
        if (!exists) {
            return res.status(404).json({
                success: false,
                error: { message: 'User not found', statusCode: 404 }
            });
        }

        let data;
        if (plan === 'free') {
            data = {
                plan: 'free',
                plan_expires_at: null,
                pro_granted_by: null
            };
        } else {
            // expiresAt：null/''/undefined → 永久；否则必须是合法日期
            let exp = null;
            if (expiresAt !== null && expiresAt !== undefined && expiresAt !== '') {
                const parsed = new Date(expiresAt);
                if (Number.isNaN(parsed.getTime())) {
                    return res.status(400).json({
                        success: false,
                        error: { message: 'Invalid expiresAt date', statusCode: 400 }
                    });
                }
                exp = parsed;
            }
            const source = GRANT_SOURCES.includes(grantedBy) ? grantedBy : 'admin';
            data = {
                plan: 'pro',
                plan_expires_at: exp,
                pro_granted_by: source
            };
        }

        const updated = await prisma.user.update({
            where: { id },
            data,
            select: USER_SELECT
        });

        const at = new Date().toISOString();
        console.log(`[ADMIN] ${at} user=${id} plan→${updated.plan} expires_at=${updated.plan_expires_at || 'null'} granted_by=${updated.pro_granted_by || 'null'}`);

        res.status(200).json({
            success: true,
            data: updated
        });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    listUsers,
    getUserDetail,
    setUserPlan
};
