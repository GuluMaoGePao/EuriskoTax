// 阶段10A：计算历史「云端同步」控制器
//
// 同步协议（设计见 docs/development/stage10-free-pro-plan.md §4）：
//   写主在本端，云端只是镜像。同步粒度为「登录设备全量快照 diff」而非实时每算一存。
//   POST /calculations/sync { push: [条目...] } → 服务端按 (user_id, client_id) upsert
//   （updatedAt 新者胜，幂等），随后返回该账号全量 active 列表 + 已删 clientId 集合。
//
// 条目结构（客户端 → 服务端）：
//   { clientId, type, data, updatedAt, deletedAt? }
//     clientId   本地记录 id（幂等键，≤64 字符）
//     type       comprehensive | business | classification | reverse
//     data       本地记录业务快照 JSON 对象 { title, date, income, tax, results, ... }
//     updatedAt  ISO 时间（本地最近一次变更时间，冲突时新者胜）
//     deletedAt  墓碑：非空表示该 clientId 已在本端删除
//
// 返回 data：
//   { records: [{ clientId, type, data, updatedAt }],   // active 记录（含本端刚上传的）
//     deletedClientIds: [clientId, ...] }               // 云端已删集合（其它设备据此清除）

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// 云端同步历史上限：默认 500 条/账号；可用 SYNC_MAX_RECORDS 覆盖（verify:local 用较小值做上限断言）
const MAX_RECORDS = (() => {
    const n = parseInt(process.env.SYNC_MAX_RECORDS, 10);
    return Number.isFinite(n) && n > 0 ? n : 500;
})();
const MAX_ITEM_BYTES = 50 * 1024; // 单条 ≤ 50KB
const MAX_PUSH_PER_REQ = 200; // 单请求推送条数上限（离线补传可分批）
const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 墓碑 30 天清理
const VALID_TYPES = new Set(['comprehensive', 'business', 'classification', 'reverse']);

const toMs = (value) => new Date(value).getTime();

// 专业版判定：plan=pro 且未过期（plan_expires_at 为 null 视为永久）
const isProActive = (user) =>
    user.plan === 'pro' && (!user.plan_expires_at || toMs(user.plan_expires_at) > Date.now());

const validateItem = (item) => {
    if (!item || typeof item !== 'object') return '条目必须是 JSON 对象';
    const { clientId, type, data, updatedAt, deletedAt } = item;

    if (typeof clientId !== 'string' || !clientId.trim() || clientId.length > 64) {
        return 'clientId 非法（需为非空字符串且 ≤64 字符）';
    }
    if (!VALID_TYPES.has(type)) {
        return `type 非法（需为 ${[...VALID_TYPES].join(' / ')}）`;
    }
    if (typeof updatedAt !== 'string' || !Number.isFinite(toMs(updatedAt))) {
        return 'updatedAt 非法（需为有效 ISO 时间）';
    }
    const isTombstone = deletedAt !== undefined && deletedAt !== null && String(deletedAt).length > 0;
    if (isTombstone && (typeof deletedAt !== 'string' || !Number.isFinite(toMs(deletedAt)))) {
        return 'deletedAt 非法（需为有效 ISO 时间）';
    }
    if (!isTombstone && (data === undefined || data === null || typeof data !== 'object')) {
        return '活跃条目缺少 data 业务快照';
    }
    if (Buffer.byteLength(JSON.stringify(item), 'utf8') > MAX_ITEM_BYTES) {
        return '单条数据超过 50KB 上限';
    }
    return null;
};

const syncHistory = async (req, res, next) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: { message: 'Authentication required', statusCode: 401 }
            });
        }

        // 免费版无云同步（计税能力永不锁定，锁的是云端增值）
        if (!isProActive(req.user)) {
            return res.status(403).json({
                success: false,
                error: {
                    message: '云端同步为专业版功能，请先升级后使用',
                    statusCode: 403,
                    code: 'PRO_REQUIRED'
                }
            });
        }

        if (req.body === undefined || req.body === null) {
            return res.status(400).json({
                success: false,
                error: { message: '请求体不能为空', statusCode: 400 }
            });
        }

        const push = Array.isArray(req.body.push) ? req.body.push : [];
        if (!Array.isArray(req.body.push) && req.body.push !== undefined) {
            return res.status(400).json({
                success: false,
                error: { message: 'push 必须为数组', statusCode: 400 }
            });
        }
        if (push.length > MAX_PUSH_PER_REQ) {
            return res.status(400).json({
                success: false,
                error: { message: `单次同步推送条数不能超过 ${MAX_PUSH_PER_REQ}`, statusCode: 400 }
            });
        }
        for (const item of push) {
            const reason = validateItem(item);
            if (reason) {
                return res.status(400).json({
                    success: false,
                    error: { message: `同步条目校验失败：${reason}`, statusCode: 400, code: 'INVALID_SYNC_ITEM' }
                });
            }
        }

        const userId = req.user.id;

        const result = await prisma.$transaction(async (tx) => {
            // 活跃（未删除）记录数，用于 500 条上限判定
            let activeCount = await tx.calculation.count({
                where: { user_id: userId, client_id: { not: null }, deleted_at: null }
            });

            const historyLimit = () => {
                const error = new Error('云端历史已达上限（500 条），请先导出备份并清理后再同步');
                error.statusCode = 409;
                error.code = 'HISTORY_LIMIT_REACHED';
                throw error;
            };

            for (const item of push) {
                const clientId = item.clientId.trim();
                const isTombstone = item.deletedAt !== undefined && item.deletedAt !== null && String(item.deletedAt).length > 0;
                const changedAtMs = isTombstone ? toMs(item.deletedAt) : toMs(item.updatedAt);

                const existing = await tx.calculation.findUnique({
                    where: { user_id_client_id: { user_id: userId, client_id: clientId } }
                });

                // 墓碑：本地删除需在云端软删，让其它设备同步后消失
                if (isTombstone) {
                    // 云端无此条或已是墓碑：无需重复处理
                    if (!existing || existing.deleted_at) continue;
                    // 新者胜：墓碑版本比云端现存内容更新才删
                    if (changedAtMs >= toMs(existing.updated_at)) {
                        await tx.calculation.update({
                            where: { id: existing.id },
                            data: { deleted_at: new Date(changedAtMs), updated_at: new Date(changedAtMs) }
                        });
                    }
                    continue;
                }

                // 活跃内容
                if (existing) {
                    // 云端已是墓碑但本端更新内容（恢复/复活）：或云端内容旧于本端 → 覆盖
                    const cloudIsNewer = !existing.deleted_at && toMs(existing.updated_at) > changedAtMs;
                    if (cloudIsNewer) continue; // 云端新者胜，跳过

                    if (existing.deleted_at) activeCount += 1; // 墓碑复活计入活跃数
                    if (existing.deleted_at && activeCount > MAX_RECORDS) historyLimit();

                    await tx.calculation.update({
                        where: { id: existing.id },
                        data: {
                            type: item.type,
                            input_data: JSON.stringify(item.data),
                            deleted_at: null,
                            updated_at: new Date(changedAtMs)
                        }
                    });
                } else {
                    if (activeCount >= MAX_RECORDS) historyLimit();

                    await tx.calculation.create({
                        data: {
                            user_id: userId,
                            client_id: clientId,
                            type: item.type,
                            input_data: JSON.stringify(item.data),
                            result_data: '{}',
                            deleted_at: null,
                            updated_at: new Date(changedAtMs)
                        }
                    });
                    activeCount += 1;
                }
            }

            // 墓碑超 30 天物理清理（软删行真正移除，不再向其它设备广播）
            await tx.calculation.deleteMany({
                where: {
                    user_id: userId,
                    deleted_at: { not: null },
                    updated_at: { lt: new Date(Date.now() - TOMBSTONE_TTL_MS) }
                }
            });

            // 全量拉取：active 列表 + 已删 clientId 集合
            const rows = await tx.calculation.findMany({
                where: { user_id: userId, client_id: { not: null } },
                orderBy: { updated_at: 'desc' }
            });

            const records = [];
            const deletedClientIds = [];
            for (const row of rows) {
                if (row.deleted_at) {
                    deletedClientIds.push(row.client_id);
                } else {
                    records.push({
                        clientId: row.client_id,
                        type: row.type,
                        data: JSON.parse(row.input_data),
                        updatedAt: row.updated_at
                    });
                }
            }
            return { records, deletedClientIds };
        });

        res.status(200).json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
};

module.exports = { syncHistory };
