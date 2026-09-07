const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// 反馈分类白名单（前端意见反馈表单同步）
const FEEDBACK_CATEGORIES = ['bug', 'suggestion', 'other', 'general'];
// 反馈跟进状态白名单
const FEEDBACK_STATUSES = ['open', 'resolved', 'closed'];

/**
 * 提交用户反馈
 * POST /api/feedback
 * 需要登录认证，反馈内容持久化到 Feedback 表
 */
const submitFeedback = async (req, res, next) => {
    try {
        const { category, content, rating } = req.body;
        const userId = req.user.id;

        if (!content || content.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: {
                    message: 'Feedback content is required',
                    statusCode: 400
                }
            });
        }

        if (content.length > 5000) {
            return res.status(400).json({
                success: false,
                error: {
                    message: 'Feedback content must be less than 5000 characters',
                    statusCode: 400
                }
            });
        }

        // 分类与评分规范化：非法值回退默认，避免脏数据
        const normalizedCategory = FEEDBACK_CATEGORIES.includes(category) ? category : 'general';
        const normalizedRating = Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null;

        const saved = await prisma.feedback.create({
            data: {
                user_id: userId,
                category: normalizedCategory,
                content: content.trim(),
                rating: normalizedRating
            }
        });

        // 记录到日志（生产环境可通过 ops-notify.ps1 邮件转发）
        const timestamp = new Date().toISOString();
        console.log(`[FEEDBACK] ${timestamp} id=${saved.id} user=${userId} category=${normalizedCategory} rating=${normalizedRating || 'N/A'}`);
        console.log(`[FEEDBACK] content: ${content.substring(0, 200)}${content.length > 200 ? '...' : ''}`);

        res.status(201).json({
            success: true,
            data: {
                id: saved.id,
                message: 'Feedback received. Thank you!'
            }
        });
    } catch (err) {
        next(err);
    }
};

/**
 * 获取用户自己的反馈列表
 * GET /api/feedback
 */
const listFeedback = async (req, res, next) => {
    try {
        const items = await prisma.feedback.findMany({
            where: { user_id: req.user.id },
            orderBy: { created_at: 'desc' },
            select: {
                id: true,
                category: true,
                rating: true,
                content: true,
                status: true,
                created_at: true
            }
        });

        res.status(200).json({
            success: true,
            data: items
        });
    } catch (err) {
        next(err);
    }
};

/**
 * 管理员查看全部反馈（可按 status 过滤，默认最近 200 条）
 * GET /api/feedback/admin?status=open
 * 走 X-Admin-Token 认证（requireAdmin）
 */
const adminListFeedback = async (req, res, next) => {
    try {
        const { status } = req.query;
        const where = {};
        if (status && FEEDBACK_STATUSES.includes(status)) {
            where.status = status;
        }

        const items = await prisma.feedback.findMany({
            where,
            orderBy: { created_at: 'desc' },
            take: 200,
            include: {
                user: { select: { id: true, username: true, email: true } }
            }
        });

        res.status(200).json({
            success: true,
            data: items
        });
    } catch (err) {
        next(err);
    }
};

/**
 * 管理员更新反馈跟进状态
 * PATCH /api/feedback/admin/:id
 * body { status: 'open' | 'resolved' | 'closed' }
 */
const updateFeedbackStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!FEEDBACK_STATUSES.includes(status)) {
            return res.status(400).json({
                success: false,
                error: {
                    message: 'Invalid feedback status',
                    statusCode: 400
                }
            });
        }

        const parsedId = parseInt(id, 10);
        if (!Number.isInteger(parsedId)) {
            return res.status(400).json({
                success: false,
                error: {
                    message: 'Invalid feedback id',
                    statusCode: 400
                }
            });
        }

        const updated = await prisma.feedback.update({
            where: { id: parsedId },
            data: { status }
        });

        res.status(200).json({
            success: true,
            data: { id: updated.id, status: updated.status }
        });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    submitFeedback,
    listFeedback,
    adminListFeedback,
    updateFeedbackStatus
};
