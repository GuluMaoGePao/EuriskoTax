const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({
            success: false,
            error: {
                message: 'Access token is missing',
                statusCode: 401
            }
        });
    }
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await prisma.user.findUnique({
            where: { id: decoded.userId },
            select: {
                id: true,
                username: true,
                email: true,
                phone: true,
                plan: true,
                plan_expires_at: true
            }
        });
        
        if (!user) {
            return res.status(401).json({
                success: false,
                error: {
                    message: 'Invalid token',
                    statusCode: 401
                }
            });
        }
        
        req.user = user;
        next();
    } catch (err) {
        // 区分 token 过期和无效，便于前端处理
        const message = err.name === 'TokenExpiredError'
            ? 'Token expired'
            : 'Token invalid';
        return res.status(401).json({
            success: false,
            error: {
                message: message,
                statusCode: 401
            }
        });
    }
};

// 可选认证（阶段11 内容中心）：带有效 token 则挂载 req.user；无 token 或 token 无效一律放行（不 401）。
// 用于「按登录态返回不同内容」的公开端点（audience = all / free / pro 分层投放）。
const optionalAuth = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return next();

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await prisma.user.findUnique({
            where: { id: decoded.userId },
            select: { id: true, plan: true, plan_expires_at: true }
        });
        if (user) req.user = user;
    } catch (err) {
        // 静默降级为游客：过期/无效 token 不应阻断公开内容读取
    }
    return next();
};

module.exports = { authenticateToken, optionalAuth };
