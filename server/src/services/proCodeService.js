const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// 与邀请码保持同一字符集（排除易混淆字符 0/O、1/I/L、U/V），降低用户手抄出错率
const CODE_CHARSET = 'ABCDEFGHJKMNPQRSTWXYZ23456789';
const CODE_PREFIX = 'PRO';

// 兑换码随机体长度：8 位（29^8 ≈ 5.0e11 组合）。
// 前缀 PRO- 与邀请码 EURISKO- 显式区分，避免用户在注册框里误填兑换码。
// 配合「必须登录 + 兑换接口限流」，暴力枚举在成本上不可行。
const generateCode = () => {
    const bytes = crypto.randomBytes(8);
    const pick = (offset) => Array.from(
        { length: 4 },
        (_, i) => CODE_CHARSET[bytes[offset * 4 + i] % CODE_CHARSET.length]
    ).join('');
    return `${CODE_PREFIX}-${pick(0)}-${pick(1)}`;
};

// 用户输入归一化：去首尾空白与分隔空格、转大写。
// 容忍用户粘贴时带入的空格（如 "PRO-ABCD-EFGH " 或 "pro abcd efgh"）。
const normalizeCode = (raw) => String(raw || '').trim().toUpperCase().replace(/\s+/g, '');

const DAY_MS = 24 * 60 * 60 * 1000;

// 公开字段（与 adminUsersController.USER_SELECT 一致，绝不外泄 password_hash）
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

const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const badRequest = (message) => httpError(400, message);
const forbidden = (message) => httpError(403, message);
const conflict = (message) => httpError(409, message);

// 计算兑换后的到期时间（决策集中在此处，便于单测覆盖）：
//   - 永久码（duration_days = null）→ null（永久授权）
//   - 限时码 + 当前专业版仍在有效期内 → 在现有到期日上叠加（续期不清零，用户不吃亏）
//   - 限时码 + 基础版 / 专业版已过期 → 自兑换时刻起算
const computeExpiry = (user, durationDays, now) => {
    if (durationDays === null || durationDays === undefined) return null;
    const current = user.plan_expires_at ? new Date(user.plan_expires_at).getTime() : null;
    const stillValid = user.plan === 'pro'
        && current !== null
        && Number.isFinite(current)
        && current > now;
    const base = stillValid ? current : now;
    return new Date(base + durationDays * DAY_MS);
};

/**
 * 兑换专业版兑换码（已登录用户）
 * 语义与安全要点：
 *   1. 全部校验 + 占用 + 发权益在同一事务内，要么全成要么全回滚
 *   2. 「一码一用」由 updateMany 的 used_by IS NULL 条件保证原子性 ——
 *      并发下 updateMany 返回 count=0 的请求视为失败，不会出现一码两人
 *   3. 已是永久专业版的账号直接拒绝且不消耗码（避免用户白买一个用不上的码）
 *   4. 失败按原因返回 400/403/409，便于前端给出可操作的提示
 */
const redeemCode = async (userId, rawCode) => {
    const code = normalizeCode(rawCode);
    if (!code) throw badRequest('请输入兑换码');

    return await prisma.$transaction(async (tx) => {
        const record = await tx.proCode.findUnique({ where: { code } });
        if (!record) throw forbidden('兑换码不存在，请核对后重试');
        if (record.disabled) throw forbidden('该兑换码已被作废，请联系客服');
        if (record.used_by !== null) throw conflict('该兑换码已被使用，每个兑换码仅限一次');

        const user = await tx.user.findUnique({ where: { id: userId } });
        if (!user) throw httpError(404, 'User not found');

        // 永久专业版无需兑换：不消耗兑换码，让它留给真正需要的账号
        if (user.plan === 'pro' && !user.plan_expires_at) {
            throw conflict('当前账号已是永久专业版，无需兑换');
        }

        // 原子占用：并发下只有一个请求能把 used_by 从 NULL 写成自己
        const claimed = await tx.proCode.updateMany({
            where: { id: record.id, used_by: null, disabled: false },
            data: { used_by: userId, used_at: new Date() }
        });
        if (claimed.count === 0) throw conflict('该兑换码已被使用，每个兑换码仅限一次');

        return tx.user.update({
            where: { id: userId },
            data: {
                plan: 'pro',
                plan_expires_at: computeExpiry(user, record.duration_days, Date.now()),
                pro_granted_by: 'purchase'
            },
            select: USER_SELECT
        });
    });
};

/**
 * 批量生成兑换码（运维后台）
 * count: 1-200；durationDays: null=永久 或 1-3650 的整数
 */
const generateCodes = async ({ count, durationDays, batch, note }) => {
    // 用 Number + isInteger 而非 parseInt：parseInt 会把 1.5 静默截断成 1，
    // 管理台传入非整数时会导致「少发码」这类无声事故，必须显式拒绝。
    const n = Number(count);
    if (!Number.isInteger(n) || n < 1 || n > 200) {
        throw badRequest('Count must be an integer between 1 and 200');
    }

    let days = null;
    if (durationDays !== null && durationDays !== undefined && durationDays !== '') {
        days = Number(durationDays);
        if (!Number.isInteger(days) || days < 1 || days > 3650) {
            throw badRequest('durationDays must be an integer between 1 and 3650, or null for permanent');
        }
    }

    const batchName = batch === undefined || batch === null ? null : String(batch).trim().slice(0, 64) || null;
    const remark = note === undefined || note === null ? '' : String(note).trim().slice(0, 200);

    const created = [];
    for (let i = 0; i < n; i++) {
        // 碰撞重试：撞 unique 约束（P2002）说明随机撞号，重新生成即可
        for (let retry = 0; retry < 5; retry++) {
            try {
                const code = generateCode();
                await prisma.proCode.create({
                    data: { code, duration_days: days, batch: batchName, note: remark }
                });
                created.push(code);
                break;
            } catch (err) {
                if (err.code !== 'P2002') throw err;
            }
        }
    }

    return { createdCount: created.length, durationDays: days, batch: batchName, codes: created };
};

/**
 * 兑换码列表（运维后台）
 * status: 'available' | 'used' | 'disabled' | 不传 = 全部
 */
const listCodes = async ({ batch, status, offset = 0, limit = 50 }) => {
    const where = {};
    if (batch && String(batch).trim()) where.batch = String(batch).trim();
    if (status === 'available') {
        where.used_by = null;
        where.disabled = false;
    } else if (status === 'used') {
        where.used_by = { not: null };
    } else if (status === 'disabled') {
        where.disabled = true;
    }

    const [total, rows] = await Promise.all([
        prisma.proCode.count({ where }),
        prisma.proCode.findMany({
            where,
            orderBy: { id: 'desc' },
            skip: offset,
            take: limit
        })
    ]);

    // 手动关联用户名（used_by 为裸外键，与 InviteCode 的处理一致）
    const usedIds = [...new Set(rows.filter((r) => r.used_by !== null).map((r) => r.used_by))];
    const users = usedIds.length
        ? await prisma.user.findMany({
            where: { id: { in: usedIds } },
            select: { id: true, username: true, email: true }
        })
        : [];
    const userById = new Map(users.map((u) => [u.id, u]));

    const items = rows.map((r) => {
        const owner = r.used_by !== null ? userById.get(r.used_by) : null;
        return {
            id: r.id,
            code: r.code,
            durationDays: r.duration_days,
            permanent: r.duration_days === null,
            batch: r.batch,
            note: r.note,
            disabled: r.disabled,
            status: r.disabled ? 'disabled' : (r.used_by !== null ? 'used' : 'available'),
            usedBy: r.used_by,
            usedByName: owner ? owner.username : null,
            usedByEmail: owner ? owner.email : null,
            usedAt: r.used_at,
            createdAt: r.created_at
        };
    });

    const [availableCount, usedCount, disabledCount] = await Promise.all([
        prisma.proCode.count({ where: { used_by: null, disabled: false } }),
        prisma.proCode.count({ where: { used_by: { not: null } } }),
        prisma.proCode.count({ where: { disabled: true } })
    ]);

    return { total, offset, limit, items, availableCount, usedCount, disabledCount };
};

/**
 * 作废 / 恢复兑换码（运维后台）
 * 已兑换的码不允许作废（收款凭证需留痕，退款走管理员回收权益）
 */
const setCodeDisabled = async (id, disabled) => {
    const record = await prisma.proCode.findUnique({ where: { id } });
    if (!record) throw httpError(404, 'ProCode not found');
    if (disabled && record.used_by !== null) {
        throw conflict('该兑换码已被兑换，无法作废；如需回收权益请调整用户计划');
    }
    const updated = await prisma.proCode.update({
        where: { id },
        data: { disabled: Boolean(disabled) }
    });
    return {
        id: updated.id,
        code: updated.code,
        disabled: updated.disabled,
        status: updated.disabled ? 'disabled' : (updated.used_by !== null ? 'used' : 'available')
    };
};

/**
 * 导出兑换码 CSV（运维后台对账）
 * 全部字段导出；注意 CSV 注入防护（以 = + - @ 开头的单元格前置单引号）
 */
const exportCodesCsv = async ({ batch }) => {
    const where = batch && String(batch).trim() ? { batch: String(batch).trim() } : {};
    const rows = await prisma.proCode.findMany({ where, orderBy: { id: 'asc' } });

    const usedIds = [...new Set(rows.filter((r) => r.used_by !== null).map((r) => r.used_by))];
    const users = usedIds.length
        ? await prisma.user.findMany({ where: { id: { in: usedIds } }, select: { id: true, username: true } })
        : [];
    const nameById = new Map(users.map((u) => [u.id, u.username]));

    const cell = (value) => {
        const s = value === null || value === undefined ? '' : String(value);
        const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
        return `"${safe.replace(/"/g, '""')}"`;
    };

    const header = ['code', 'status', 'duration_days', 'batch', 'note', 'used_by', 'used_by_name', 'used_at', 'created_at'];
    const lines = rows.map((r) => [
        r.code,
        r.disabled ? 'disabled' : (r.used_by !== null ? 'used' : 'available'),
        r.duration_days === null ? 'permanent' : r.duration_days,
        r.batch,
        r.note,
        r.used_by,
        r.used_by !== null ? (nameById.get(r.used_by) || `#${r.used_by}`) : '',
        r.used_at ? new Date(r.used_at).toISOString() : '',
        new Date(r.created_at).toISOString()
    ].map(cell).join(','));

    // BOM 让 Excel 正确识别 UTF-8（否则中文备注乱码）
    return '\uFEFF' + [header.map(cell).join(','), ...lines].join('\r\n') + '\r\n';
};

/**
 * 列出某用户已兑换的兑换码（客服核对用）
 */
const listUserCodes = async (userId) => {
    const rows = await prisma.proCode.findMany({
        where: { used_by: userId },
        orderBy: { used_at: 'desc' },
        select: { code: true, duration_days: true, batch: true, note: true, used_at: true }
    });
    return rows.map((r) => ({
        code: r.code,
        durationDays: r.duration_days,
        permanent: r.duration_days === null,
        batch: r.batch,
        note: r.note,
        usedAt: r.used_at
    }));
};

module.exports = {
    normalizeCode,
    computeExpiry,
    redeemCode,
    generateCodes,
    listCodes,
    setCodeDisabled,
    exportCodesCsv,
    listUserCodes
};
