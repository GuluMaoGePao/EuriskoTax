const { PrismaClient } = require('@prisma/client');
const { requireAdmin } = require('./statsController');

const prisma = new PrismaClient();

// 与 scripts/generate-invite-codes.js 保持一致：排除易混淆字符 0/O、1/I/L、U/V
const INVITE_CHARSET = 'ABCDEFGHJKMNPQRSTWXYZ23456789';

const generateCode = () => {
    const bytes = require('crypto').randomBytes(8);
    const pick = (offset) => Array.from(
        { length: 4 },
        (_, i) => INVITE_CHARSET[bytes[offset * 4 + i] % INVITE_CHARSET.length]
    ).join('');
    return `EURISKO-${pick(0)}-${pick(1)}`;
};

/**
 * 列出全部邀请码（按未使用/已使用分组，已使用关联用户名）
 * GET /api/invites
 */
const listInvites = async (req, res, next) => {
    try {
        const invites = await prisma.inviteCode.findMany({
            orderBy: { id: 'asc' }
        });

        // 手动关联用户名（InviteCode 未声明 Prisma relation，仅存 used_by 裸外键）
        const usedIds = [...new Set(invites.filter(i => i.used_by !== null).map(i => i.used_by))];
        const users = usedIds.length
            ? await prisma.user.findMany({ where: { id: { in: usedIds } }, select: { id: true, username: true } })
            : [];
        const nameById = new Map(users.map(u => [u.id, u.username]));

        const available = [];
        const used = [];
        for (const inv of invites) {
            if (inv.used_by === null) {
                available.push({ code: inv.code, createdAt: inv.created_at });
            } else {
                used.push({
                    code: inv.code,
                    usedBy: nameById.get(inv.used_by) || `#${inv.used_by}`,
                    usedAt: inv.used_at
                });
            }
        }

        res.status(200).json({
            success: true,
            data: {
                total: invites.length,
                availableCount: available.length,
                usedCount: used.length,
                available,
                used
            }
        });
    } catch (err) {
        next(err);
    }
};

/**
 * 生成邀请码（一机一码）
 * POST /api/invites  body: { count: 1-100 }
 */
const generateInvites = async (req, res, next) => {
    try {
        const count = parseInt(req.body.count);
        if (!Number.isInteger(count) || count < 1 || count > 100) {
            return res.status(400).json({
                success: false,
                error: {
                    message: 'Count must be an integer between 1 and 100',
                    statusCode: 400
                }
            });
        }

        const created = [];
        for (let i = 0; i < count; i++) {
            // 碰撞重试：unique 冲突时重新生成
            for (let retry = 0; retry < 5; retry++) {
                try {
                    const code = generateCode();
                    await prisma.inviteCode.create({ data: { code } });
                    created.push(code);
                    break;
                } catch (err) {
                    if (err.code !== 'P2002') throw err;
                }
            }
        }

        res.status(201).json({
            success: true,
            data: { createdCount: created.length, codes: created }
        });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    listInvites,
    generateInvites
};
