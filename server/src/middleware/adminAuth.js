/**
 * 工作人员（管理台）鉴权
 *
 * 认两种凭证：
 *   ① `Authorization: Bearer <JWT>` —— 管理台「邮箱 + 密码」登录签发的**短期**令牌，
 *      payload 是 `{ staffId, tv, role, scope: 'admin' }`，查的是 **AdminUser 表**。
 *   ② `X-Admin-Token: <ADMIN_TOKEN>` —— 环境变量里的静态令牌（应急通道）。
 *
 * 为什么留着 ②：① 依赖数据库里存在工作人员账号。万一账号被误删、或密码忘了又
 * 走不通邮件找回，静态令牌是最后的入口 —— 删掉它等于把唯一钥匙也扔了。
 * 但它只在**没带 Bearer** 时才检查，日常登录不该走这条路。
 *
 * 与客户端令牌的关系：App 登录签的是 `{ userId }`（查 User 表），管理台签的是
 * `{ staffId }`（查 AdminUser 表）。**两张表、两个字段名**，所以客户的令牌天然
 * 进不了管理台 —— 不需要靠 scope 这一层约定去挡，查表就查不到。
 */
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// owner   ：全部权限，且**唯一能管理工作人员账号**的角色
// admin   ：业务全部（客户权益 / 兑换码 / 内容 / 税制 / 社保 / 线索），不能管人
// support ：只处理用户反馈与排障话术
const STAFF_ROLES = ['owner', 'admin', 'support'];

// 能改动「客户权益与站点配置」的角色 —— support 不在其中
const BUSINESS_ROLES = ['owner', 'admin'];

const deny = (res, message, statusCode = 401) => res.status(statusCode).json({
    success: false,
    error: { message, statusCode }
});

const requireAdmin = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const bearer = authHeader && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7).trim()
        : '';

    if (bearer) {
        try {
            const decoded = jwt.verify(bearer, process.env.JWT_SECRET);

            if (decoded.scope !== 'admin' || !decoded.staffId) {
                return deny(res, 'Not an admin credential');
            }

            const staff = await prisma.adminUser.findUnique({
                where: { id: decoded.staffId },
                select: { id: true, email: true, username: true, role: true, status: true, token_version: true }
            });

            if (!staff) return deny(res, 'Not an administrator');

            // 角色与状态**每次请求都回库核对**，不只信令牌里的声明：
            // 一个被降权或禁用的工作人员，不该握着旧令牌继续用到过期（2 小时）。
            if (staff.status !== 'active') return deny(res, 'Account disabled');
            if (!STAFF_ROLES.includes(staff.role)) return deny(res, 'Invalid staff role');

            const issuedTv = Number.isInteger(decoded.tv) ? decoded.tv : 0;
            const currentTv = Number.isInteger(staff.token_version) ? staff.token_version : 0;
            if (issuedTv !== currentTv) return deny(res, 'Admin session revoked');

            req.admin = { id: staff.id, email: staff.email, username: staff.username, role: staff.role, via: 'jwt' };
            return next();
        } catch (err) {
            if (err.name === 'TokenExpiredError') return deny(res, 'Admin session expired');
            return deny(res, 'Invalid admin credential');
        }
    }

    // ② 静态令牌：未配置时拒绝访问，防止管理接口裸奔
    const adminToken = process.env.ADMIN_TOKEN;
    if (!adminToken) {
        return deny(res, 'Admin access is not configured. Set ADMIN_TOKEN or create a staff account.', 503);
    }
    if (req.get('X-Admin-Token') !== adminToken) {
        return deny(res, 'Invalid admin token');
    }
    // 静态令牌等同 owner：它是最后一把钥匙，权限低于 owner 会在应急时反而够不着
    req.admin = { id: null, email: null, username: null, role: 'owner', via: 'static-token' };
    next();
};

/**
 * 只有 owner 能管理工作人员账号。
 * 这道门禁是多人体系的**地基** —— 少了它，一个 support 就能把自己提成 owner，
 * 上面分了三级角色也等于没分。
 */
const requireOwner = (req, res, next) => {
    if (!req.admin || req.admin.role !== 'owner') {
        return deny(res, '仅所有者可管理工作人员账号', 403);
    }
    next();
};

/** 限定角色的工厂：用于「客户权益与站点配置」这类不该让 support 碰的端点 */
const requireRoles = (roles) => (req, res, next) => {
    if (!req.admin || !roles.includes(req.admin.role)) {
        return deny(res, `当前角色无权执行此操作（需要 ${roles.join(' 或 ')}）`, 403);
    }
    next();
};

/**
 * 「客户权益与站点配置」类端点的组合门禁：先认人，再认角色。
 * 用数组而不是让调用方写两个中间件，是为了避免哪天有人漏写第二项 ——
 * 漏了就变成 support 也能改税率、发兑换码，而且看不出来是漏的。
 */
const requireBusinessAdmin = [requireAdmin, requireRoles(BUSINESS_ROLES)];

module.exports = { requireAdmin, requireOwner, requireRoles, requireBusinessAdmin, STAFF_ROLES, BUSINESS_ROLES };
