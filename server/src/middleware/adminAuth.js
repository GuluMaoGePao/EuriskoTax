/**
 * 管理员认证中间件（X-Admin-Token）
 * 供统计概览、邀请码管理、反馈管理共用
 * 通过请求头 X-Admin-Token 与环境变量 ADMIN_TOKEN 比对
 * 未配置 ADMIN_TOKEN 时拒绝访问，防止管理接口裸奔
 */
const requireAdmin = (req, res, next) => {
    const adminToken = process.env.ADMIN_TOKEN;
    if (!adminToken) {
        return res.status(503).json({
            success: false,
            error: {
                message: 'Stats endpoint is not configured. Set ADMIN_TOKEN environment variable first.',
                statusCode: 503
            }
        });
    }
    const token = req.get('X-Admin-Token');
    if (token !== adminToken) {
        return res.status(401).json({
            success: false,
            error: {
                message: 'Invalid admin token',
                statusCode: 401
            }
        });
    }
    next();
};

module.exports = { requireAdmin };
