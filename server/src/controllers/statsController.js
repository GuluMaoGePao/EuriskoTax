const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// 北京时间（UTC+8）偏移量，用于按国内用户习惯计算"今日"边界
const CST_OFFSET_MS = 8 * 60 * 60 * 1000;

/**
 * 获取北京时间某日 0 点对应的 UTC 时间
 * @param {number} daysAgo - 距今天的天数（0=今天）
 * @returns {{start: Date, end: Date}} 该日的 [start, end) UTC 边界
 */
const getCstDayRange = (daysAgo) => {
    // 把当前时间平移到北京时间视角后取本地 0 点，再平移回 UTC
    const cstNow = new Date(Date.now() + CST_OFFSET_MS);
    const cstMidnight = new Date(cstNow.getUTCFullYear(), cstNow.getUTCMonth(), cstNow.getUTCDate() - daysAgo);
    const start = new Date(cstMidnight.getTime() - CST_OFFSET_MS);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    return { start, end };
};

/**
 * 管理员认证中间件
 * 通过请求头 X-Admin-Token 与环境变量 ADMIN_TOKEN 比对
 * 未配置 ADMIN_TOKEN 时拒绝访问，防止统计接口裸奔
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

/**
 * 获取运营统计概览
 * GET /api/stats/overview
 * 汇总注册数、计算次数、类型分布、近7日趋势，用于冷启动增长观察
 */
const getOverview = async (req, res, next) => {
    try {
        const today = getCstDayRange(0);

        const [totalUsers, newUsersToday, totalCalculations, calculationsToday, groupByType] = await Promise.all([
            prisma.user.count(),
            prisma.user.count({ where: { created_at: { gte: today.start, lt: today.end } } }),
            prisma.calculation.count(),
            prisma.calculation.count({ where: { created_at: { gte: today.start, lt: today.end } } }),
            prisma.calculation.groupBy({ by: ['type'], _count: { _all: true } })
        ]);

        // 近7日趋势（含今日，按北京时间划分日期）
        const dailyTrend = await Promise.all(
            Array.from({ length: 7 }, (_, idx) => {
                const daysAgo = 6 - idx;
                const range = getCstDayRange(daysAgo);
                return Promise.all([
                    prisma.user.count({ where: { created_at: { gte: range.start, lt: range.end } } }),
                    prisma.calculation.count({ where: { created_at: { gte: range.start, lt: range.end } } })
                ]).then(([newUsers, calculations]) => ({
                    date: range.start.toISOString().slice(0, 10),
                    newUsers,
                    calculations
                }));
            })
        );

        // 类型分布转为 { type: count } 映射，便于前端直接使用
        const calculationsByType = {};
        for (const item of groupByType) {
            calculationsByType[item.type] = item._count._all;
        }

        res.status(200).json({
            success: true,
            data: {
                generatedAt: new Date().toISOString(),
                users: {
                    total: totalUsers,
                    newToday: newUsersToday
                },
                calculations: {
                    total: totalCalculations,
                    today: calculationsToday,
                    byType: calculationsByType
                },
                dailyTrend
            }
        });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    requireAdmin,
    getOverview
};
