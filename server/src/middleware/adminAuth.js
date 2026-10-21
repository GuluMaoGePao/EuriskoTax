/**
 * 管理员认证中间件
 *
 * 认两种凭证：
 *   ① `Authorization: Bearer <JWT>` —— 管理台「邮箱 + 密码」登录签发的**短期**令牌，
 *      payload 带 `scope: 'admin'`，且库里该用户 `role = 'admin'`、`token_version` 未变。
 *   ② `X-Admin-Token: <ADMIN_TOKEN>` —— 环境变量里的静态令牌（应急通道）。
 *
 * 为什么留着 ②：① 依赖数据库里存在管理员账号。万一管理员账号被误删、或密码忘了又
 * 走不通邮件找回，静态令牌是最后的入口 —— 删掉它等于把唯一钥匙也扔了。
 * 但它只在**没带 Bearer** 时才检查，日常登录不该走这条路。
 *
 * 与 App 令牌的关系：App 登录签发的是 7 天令牌、不带 scope，**进不了管理台**。
 * 同一个人是同一个 User，但两处会话的权限与有效期是分开的。
 */
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

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

            // 关键：App 登录签发的令牌没有 scope —— 凭它绝不能进管理台。
            // 否则任一普通用户拿自己的 7 天令牌就能读写税制参数、发兑换码。
            if (decoded.scope !== 'admin' || !decoded.userId) {
                return deny(res, 'Not an admin credential');
            }

            const user = await prisma.user.findUnique({
                where: { id: decoded.userId },
                select: { id: true, email: true, username: true, role: true, token_version: true }
            });

            // 角色每次请求都查库，**不只信 token 里的声明**：管理员被降权之后，
            // 已签发的令牌必须立刻失效 —— 否则撤销要等令牌自己过期（2 小时）。
            if (!user || user.role !== 'admin') {
                return deny(res, 'Not an administrator');
            }

            // 与 App 同一套吊销机制：改密 / 重置 / 退出后 tv 推高，旧令牌立即失效
            const issuedTv = Number.isInteger(decoded.tv) ? decoded.tv : 0;
            const currentTv = Number.isInteger(user.token_version) ? user.token_version : 0;
            if (issuedTv !== currentTv) {
                return deny(res, 'Admin session revoked');
            }

            req.admin = { id: user.id, email: user.email, username: user.username, via: 'jwt' };
            return next();
        } catch (err) {
            if (err.name === 'TokenExpiredError') return deny(res, 'Admin session expired');
            return deny(res, 'Invalid admin credential');
        }
    }

    // ② 静态令牌：未配置时拒绝访问，防止管理接口裸奔
    const adminToken = process.env.ADMIN_TOKEN;
    if (!adminToken) {
        return deny(res, 'Admin access is not configured. Set ADMIN_TOKEN or create an admin user.', 503);
    }
    if (req.get('X-Admin-Token') !== adminToken) {
        return deny(res, 'Invalid admin token');
    }
    req.admin = { id: null, email: null, username: null, via: 'static-token' };
    next();
};

module.exports = { requireAdmin };
