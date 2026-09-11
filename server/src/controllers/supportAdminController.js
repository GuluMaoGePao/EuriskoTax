// 阶段12：排障话术库后台管理（运维后台「排障」Tab）
//
// 端点（全部要求 X-Admin-Token）：
//   GET    /api/admin/support           列表（category / q 筛选）
//   POST   /api/admin/support           新建条目
//   PATCH  /api/admin/support/:id       编辑条目
//   DELETE /api/admin/support/:id       删除条目
//   POST   /api/admin/support/restore   恢复内置条目（缺失则补种、已存在则还原为出厂内容）
//
// 说明：话术仅供内部客服使用，不参与用户端投放，故没有草稿/发布生命周期，改完即生效。
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { CATEGORIES, restoreBuiltinScripts } = require('../services/supportScriptService');

const prisma = new PrismaClient();

const CATEGORY_KEYS = Object.keys(CATEGORIES);

// Prisma `mode: 'insensitive'` 仅 PostgreSQL 系支持；本地 SQLite 传该参数会 500（见 contentAdminController 说明）
const DB_URL = process.env.DATABASE_URL || '';
const SUPPORTS_INSENSITIVE = DB_URL !== '' && !/^file:/i.test(DB_URL);
const kwContains = (kw) => (SUPPORTS_INSENSITIVE ? { contains: kw, mode: 'insensitive' } : { contains: kw });

const badRequest = (res, message) => res.status(400).json({
    success: false,
    error: { message, statusCode: 400 }
});

const notFound = (res, message) => res.status(404).json({
    success: false,
    error: { message, statusCode: 404 }
});

const parsePositiveInt = (raw, fallback, max) => {
    const n = parseInt(raw, 10);
    if (!Number.isInteger(n) || n < 0) return fallback;
    if (max && n > max) return max;
    return n;
};

// 处理步骤：后台按行输入（一行一步），也接受数组
const parseSteps = (raw) => {
    if (Array.isArray(raw)) return raw.map((s) => String(s).trim()).filter(Boolean).slice(0, 20);
    if (typeof raw === 'string' && raw.trim()) {
        return raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).slice(0, 20);
    }
    return [];
};

// 校验并归一化请求体；partial=true 时只处理出现的字段（PATCH 语义）
function buildData(body, { partial }) {
    const src = body || {};
    const data = {};
    const has = (k) => Object.prototype.hasOwnProperty.call(src, k);

    if (!partial || has('category')) {
        const category = src.category === undefined ? 'cache' : src.category;
        if (!CATEGORY_KEYS.includes(category)) return { error: `category 必须是 ${CATEGORY_KEYS.join(' / ')}` };
        data.category = category;
    }
    if (!partial || has('title')) {
        const title = String(src.title || '').trim();
        if (!partial && !title) return { error: 'title 不能为空' };
        if (has('title') && !title) return { error: 'title 不能为空' };
        data.title = title.slice(0, 200);
    }
    if (!partial || has('symptom')) data.symptom = String(src.symptom || '').slice(0, 1000);
    if (!partial || has('steps')) data.steps = JSON.stringify(parseSteps(src.steps));
    if (!partial || has('script')) {
        const script = String(src.script || '');
        if (!partial && !script.trim()) return { error: 'script 不能为空' };
        if (has('script') && !script.trim()) return { error: 'script 不能为空' };
        data.script = script.slice(0, 8000);
    }
    if (!partial || has('priority')) {
        const n = parseInt(src.priority, 10);
        data.priority = Number.isInteger(n) ? n : 0;
    }
    return { data };
}

const listScripts = async (req, res, next) => {
    try {
        const { category, q } = req.query;
        const where = {};
        if (CATEGORY_KEYS.includes(category)) where.category = category;
        if (q && String(q).trim()) {
            const kw = String(q).trim();
            where.OR = [
                { script_id: kwContains(kw) },
                { title: kwContains(kw) },
                { symptom: kwContains(kw) },
                { steps: kwContains(kw) },
                { script: kwContains(kw) }
            ];
        }
        const limit = parsePositiveInt(req.query.limit, 200, 500) || 200;
        const offset = parsePositiveInt(req.query.offset, 0, 100000) || 0;

        const [total, items] = await Promise.all([
            prisma.supportScript.count({ where }),
            prisma.supportScript.findMany({
                where,
                // 高频问题靠前；同优先级按最近更新倒序
                orderBy: [{ priority: 'desc' }, { updated_at: 'desc' }, { id: 'desc' }],
                skip: offset,
                take: limit
            })
        ]);

        res.status(200).json({
            success: true,
            data: { total, offset, limit, categories: CATEGORIES, items }
        });
    } catch (err) {
        next(err);
    }
};

const createScript = async (req, res, next) => {
    try {
        const { data, error } = buildData(req.body, { partial: false });
        if (error) return badRequest(res, error);

        let scriptId = String((req.body && req.body.script_id) || '').trim();
        if (!scriptId) scriptId = `s_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
        if (scriptId.length > 100) return badRequest(res, 'script_id 过长（≤100）');

        const exists = await prisma.supportScript.findUnique({ where: { script_id: scriptId }, select: { id: true } });
        if (exists) return badRequest(res, `script_id 已存在：${scriptId}`);

        const created = await prisma.supportScript.create({ data: { ...data, script_id: scriptId } });
        console.log(`[ADMIN] ${new Date().toISOString()} support create id=${created.id} script_id=${scriptId} category=${created.category}`);
        res.status(201).json({ success: true, data: created });
    } catch (err) {
        next(err);
    }
};

const updateScript = async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (!Number.isInteger(id)) return badRequest(res, 'Invalid support script id');

        const exists = await prisma.supportScript.findUnique({ where: { id }, select: { id: true, script_id: true } });
        if (!exists) return notFound(res, 'Support script not found');

        const { data, error } = buildData(req.body, { partial: true });
        if (error) return badRequest(res, error);
        if (!Object.keys(data).length) return badRequest(res, '没有可更新的字段');

        const updated = await prisma.supportScript.update({ where: { id }, data });
        console.log(`[ADMIN] ${new Date().toISOString()} support update id=${id} script_id=${exists.script_id}`);
        res.status(200).json({ success: true, data: updated });
    } catch (err) {
        next(err);
    }
};

const deleteScript = async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (!Number.isInteger(id)) return badRequest(res, 'Invalid support script id');

        const exists = await prisma.supportScript.findUnique({ where: { id }, select: { id: true, script_id: true } });
        if (!exists) return notFound(res, 'Support script not found');

        await prisma.supportScript.delete({ where: { id } });
        console.log(`[ADMIN] ${new Date().toISOString()} support delete id=${id} script_id=${exists.script_id}`);
        res.status(200).json({ success: true, data: { id, script_id: exists.script_id } });
    } catch (err) {
        next(err);
    }
};

const restoreBuiltin = async (req, res, next) => {
    try {
        const result = await restoreBuiltinScripts();
        console.log(`[ADMIN] ${new Date().toISOString()} support restore created=${result.created} restored=${result.restored}`);
        res.status(200).json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    listScripts,
    createScript,
    updateScript,
    deleteScript,
    restoreBuiltin,
    // 纯函数，导出供单测锁定前后端字段契约（steps 的换行拆分、PATCH 的部分更新语义）
    _internal: { parseSteps, buildData }
};
