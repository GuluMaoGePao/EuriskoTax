const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// 北京时间（UTC+8）偏移量，用于按国内用户习惯计算"今日"边界
const CST_OFFSET_MS = 8 * 60 * 60 * 1000;

// 合法计算类型白名单（与前端埋点约定一致）
const VALID_CALC_TYPES = ['comprehensive', 'business', 'classification', 'reverse'];

// 阶段13E：转化漏斗步骤白名单（与前端 api-client.reportFunnelEvent 约定一致）
// lead_submit 不在这里 —— 它的唯一真相是 Lead 表，由 /api/admin/leads/funnel 直接统计
const FUNNEL_STEPS = ['visit', 'calc_done', 'share', 'save', 'lead_click'];

/**
 * 获取北京时间某日 0 点对应的 UTC 时间
 * @param {number} daysAgo - 距今天的天数（0=今天）
 * @returns {{start: Date, end: Date, label: string}} 该日的 [start, end) UTC 边界及北京时间日期标签
 */
const getCstDayRange = (daysAgo) => {
    // 把当前时间平移到北京时间视角后取当日 0 点（用 Date.UTC 避免依赖服务器时区），再平移回 UTC
    // Date.UTC(y,m,d) 生成的时刻毫秒恒为 0，可稳定命中 CalcEvent 的 (date,type) 复合唯一键
    const cstNow = new Date(Date.now() + CST_OFFSET_MS);
    const cstMidnight = new Date(Date.UTC(cstNow.getUTCFullYear(), cstNow.getUTCMonth(), cstNow.getUTCDate() - daysAgo));
    const start = new Date(cstMidnight.getTime() - CST_OFFSET_MS);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    return { start, end, label: cstMidnight.toISOString().slice(0, 10) };
};

/**
 * 匿名计算埋点
 * POST /api/stats/events
 * 需要登录认证（Bearer Token）。
 * 仅接收计算类型并做日粒度聚合计数，不含任何收入/扣除等输入数据；
 * 失败由调用方静默处理，不阻塞计算保存主流程。
 */
const trackCalculationEvent = async (req, res, next) => {
    try {
        const { type } = req.body || {};
        if (!VALID_CALC_TYPES.includes(type)) {
            return res.status(400).json({
                success: false,
                error: {
                    message: 'Invalid calculation type',
                    statusCode: 400
                }
            });
        }
        // date 存北京时间今日 0 点的 UTC 时刻（毫秒恒 0，可稳定 equals 命中复合唯一键）
        const { start } = getCstDayRange(0);
        const event = await prisma.calcEvent.upsert({
            where: { date_type: { date: start, type } },
            update: { count: { increment: 1 } },
            create: { date: start, type, count: 1 }
        });

        res.status(201).json({
            success: true,
            data: {
                type,
                count: event.count
            }
        });
    } catch (err) {
        next(err);
    }
};

/**
 * 转化漏斗埋点（阶段13E）
 * POST /api/stats/funnel
 * 公开端点（**无需登录**）：漏斗的 visit 与 calc_done 大多发生在未登录状态，
 * 若要求登录，分母只剩登录用户，北极星指标会系统性偏高 —— 这正是 13E 要修的旧口径缺陷。
 * 仅记录「哪一步 + 次数」并做日粒度 upsert 聚合：
 *   - 不落 IP / 设备 ID / user_id，结构上无个人标识，规避个保法风险与数据清理成本；
 *   - 失败由调用方静默处理，绝不阻塞计算与留资主流程。
 */
const trackFunnelEvent = async (req, res, next) => {
    try {
        const { step } = req.body || {};
        if (!FUNNEL_STEPS.includes(step)) {
            return res.status(400).json({
                success: false,
                error: {
                    message: `Invalid funnel step. Must be one of: ${FUNNEL_STEPS.join(', ')}`,
                    statusCode: 400
                }
            });
        }
        // date 存北京时间今日 0 点的 UTC 时刻（毫秒恒 0，可稳定命中 (date, step) 复合唯一键）
        const { start } = getCstDayRange(0);
        const event = await prisma.funnelEvent.upsert({
            where: { date_step: { date: start, step } },
            update: { count: { increment: 1 } },
            create: { date: start, step, count: 1 }
        });

        res.status(201).json({
            success: true,
            data: {
                step,
                count: event.count
            }
        });
    } catch (err) {
        next(err);
    }
};

/**
 * 获取运营统计概览
 * GET /api/stats/overview
 * 汇总注册数、计算次数（读 CalcEvent 聚合表）、类型分布、近7日趋势，用于冷启动增长观察。
 * 响应结构保持兼容：计算侧字段仍为 { total, today, byType }，仅数据源从已废弃的 Calculation 表切换为 CalcEvent。
 */
const getOverview = async (req, res, next) => {
    try {
        const today = getCstDayRange(0);

        const [totalUsers, newUsersToday, totalCalcAgg, todayCalcAgg, typeGroups, dailyTrend] = await Promise.all([
            prisma.user.count(),
            prisma.user.count({ where: { created_at: { gte: today.start, lt: today.end } } }),
            prisma.calcEvent.aggregate({ _sum: { count: true } }),
            prisma.calcEvent.aggregate({
                where: { date: { gte: today.start, lt: today.end } },
                _sum: { count: true }
            }),
            prisma.calcEvent.groupBy({ by: ['type'], _sum: { count: true } }),
            // 近7日趋势（含今日，按北京时间划分日期）
            Promise.all(
                Array.from({ length: 7 }, (_, idx) => {
                    const daysAgo = 6 - idx;
                    const range = getCstDayRange(daysAgo);
                    return Promise.all([
                        prisma.user.count({ where: { created_at: { gte: range.start, lt: range.end } } }),
                        prisma.calcEvent.aggregate({
                            where: { date: { gte: range.start, lt: range.end } },
                            _sum: { count: true }
                        })
                    ]).then(([newUsers, agg]) => ({
                        date: range.label,
                        newUsers,
                        calculations: agg._sum.count || 0
                    }));
                })
            )
        ]);

        // 类型分布转为 { type: count } 映射，便于运营直接查看
        const calculationsByType = {};
        for (const item of typeGroups) {
            calculationsByType[item.type] = item._sum.count || 0;
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
                    total: totalCalcAgg._sum.count || 0,
                    today: todayCalcAgg._sum.count || 0,
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
    getOverview,
    trackCalculationEvent,
    trackFunnelEvent
};
