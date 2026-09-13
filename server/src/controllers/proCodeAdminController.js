const proCodeService = require('../services/proCodeService');

const parseNonNegativeInt = (raw, fallback, max) => {
    const n = parseInt(raw, 10);
    if (!Number.isInteger(n) || n < 0) return fallback;
    if (max && n > max) return max;
    return n;
};

const STATUSES = ['available', 'used', 'disabled'];

/**
 * 兑换码列表（运维后台）
 * GET /api/admin/pro-codes?batch=&status=available|used|disabled&offset=0&limit=50
 */
const list = async (req, res, next) => {
    try {
        const { batch, status } = req.query;
        const limit = parseNonNegativeInt(req.query.limit, 50, 200) || 50;
        const offset = parseNonNegativeInt(req.query.offset, 0, 100000);
        const normalizedStatus = STATUSES.includes(status) ? status : undefined;

        const data = await proCodeService.listCodes({
            batch,
            status: normalizedStatus,
            offset,
            limit
        });
        res.status(200).json({ success: true, data });
    } catch (err) {
        next(err);
    }
};

/**
 * 批量生成兑换码（运维后台）
 * POST /api/admin/pro-codes  body: { count: 1-200, durationDays?: null|1-3650, batch?, note? }
 * durationDays 省略或传 null → 永久授权
 */
const generate = async (req, res, next) => {
    try {
        const { count, durationDays, batch, note } = req.body || {};
        const data = await proCodeService.generateCodes({ count, durationDays, batch, note });
        const at = new Date().toISOString();
        console.log(
            `[ADMIN] ${at} pro-codes generated count=${data.createdCount} `
            + `duration=${data.durationDays === null ? 'permanent' : data.durationDays + 'd'} batch=${data.batch || 'null'}`
        );
        res.status(201).json({ success: true, data });
    } catch (err) {
        next(err);
    }
};

/**
 * 作废 / 恢复兑换码（运维后台）
 * PATCH /api/admin/pro-codes/:id  body: { disabled: boolean }
 * 已兑换的码不允许作废（收款凭证留痕；退款请走用户权益调整）
 */
const patch = async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (!Number.isInteger(id)) {
            return res.status(400).json({
                success: false,
                error: { message: 'Invalid pro code id', statusCode: 400 }
            });
        }
        const { disabled } = req.body || {};
        if (typeof disabled !== 'boolean') {
            return res.status(400).json({
                success: false,
                error: { message: 'disabled must be a boolean', statusCode: 400 }
            });
        }

        const data = await proCodeService.setCodeDisabled(id, disabled);
        const at = new Date().toISOString();
        console.log(`[ADMIN] ${at} pro-code id=${id} disabled=${data.disabled}`);
        res.status(200).json({ success: true, data });
    } catch (err) {
        next(err);
    }
};

/**
 * 导出兑换码 CSV（运维后台对账）
 * GET /api/admin/pro-codes/export?batch=
 */
const exportCsv = async (req, res, next) => {
    try {
        const csv = await proCodeService.exportCodesCsv({ batch: req.query.batch });
        const stamp = new Date().toISOString().slice(0, 10);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="pro-codes-${stamp}.csv"`);
        res.status(200).send(csv);
    } catch (err) {
        next(err);
    }
};

module.exports = {
    list,
    generate,
    patch,
    exportCsv
};
