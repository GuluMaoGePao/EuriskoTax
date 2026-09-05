const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * 提交用户反馈
 * POST /api/feedback
 * 需要登录认证，反馈内容会记录到数据库
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

        // 记录到日志（生产环境可通过 ops-notify.ps1 邮件转发）
        const timestamp = new Date().toISOString();
        console.log(`[FEEDBACK] ${timestamp} user=${userId} category=${category || 'general'} rating=${rating || 'N/A'}`);
        console.log(`[FEEDBACK] content: ${content.substring(0, 200)}${content.length > 200 ? '...' : ''}`);

        // TODO: 如果需要在数据库持久化，可在 schema.prisma 新增 Feedback 模型
        // 当前阶段先用日志记录，后续迭代时加表

        res.status(201).json({
            success: true,
            data: {
                message: 'Feedback received. Thank you!',
                timestamp
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
        // 当前阶段未持久化，返回空列表
        res.status(200).json({
            success: true,
            data: []
        });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    submitFeedback,
    listFeedback
};
