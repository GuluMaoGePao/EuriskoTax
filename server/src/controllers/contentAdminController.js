// 阶段11：内容中心后台管理（运维后台「内容」Tab）
//
// 端点（全部要求 X-Admin-Token）：
//   GET    /api/admin/content            列表/筛选/分页
//   POST   /api/admin/content            新建条目
//   PATCH  /api/admin/content/:id        编辑条目（含草稿/发布/撤回状态切换）
//   DELETE /api/admin/content/:id        删除条目
//   GET    /api/admin/content/releases   发布批次列表
//   POST   /api/admin/content/releases   发布（草稿转已发布 + 写版本号与通知文案）
//
// 生命周期语义：status 表示"是否上线"，publish_at/expire_at 表示"上线时间窗"。
// 发布动作只负责把草稿置为 published；未到 publish_at 的条目由端上可见性判定自动隐藏（无需定时任务）。
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const TYPES = ['policy', 'announcement', 'operation'];
const AUDIENCES = ['all', 'free', 'pro'];
const PLACEMENTS = ['assistant_qa', 'home_banner', 'modal', 'notice_list'];
const STATUSES = ['draft', 'published', 'revoked'];

// Prisma `mode: 'insensitive'` 仅 PostgreSQL 系支持；本地 SQLite 传该参数会 500（见 userAdminController 说明）
const DB_URL = process.env.DATABASE_URL || '';
const SUPPORTS_INSENSITIVE = DB_URL !== '' && !/^file:/i.test(DB_URL);
const kwContains = (kw) => (SUPPORTS_INSENSITIVE ? { contains: kw, mode: 'insensitive' } : { contains: kw });

const parsePositiveInt = (raw, fallback, max) => {
    const n = parseInt(raw, 10);
    if (!Number.isInteger(n) || n < 0) return fallback;
    if (max && n > max) return max;
    return n;
};

const badRequest = (res, message) => res.status(400).json({
    success: false,
    error: { message, statusCode: 400 }
});

const notFound = (res, message) => res.status(404).json({
    success: false,
    error: { message, statusCode: 404 }
});

const parsePlacements = (raw) => {
    if (Array.isArray(raw)) return raw.filter((p) => PLACEMENTS.includes(p));
    if (typeof raw === 'string' && raw.trim()) {
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed.filter((p) => PLACEMENTS.includes(p));
        } catch (err) { /* 忽略非法 JSON */ }
    }
    return [];
};

const parseKeywords = (raw) => {
    if (Array.isArray(raw)) return raw.map((k) => String(k)).filter(Boolean).slice(0, 20);
    if (typeof raw === 'string' && raw.trim()) {
        // 支持后台输入逗号分隔关键词
        return raw.split(/[,，]/).map((k) => k.trim()).filter(Boolean).slice(0, 20);
    }
    return [];
};

const toDateOrNull = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? NaN : d;
};

// 校验并归一化请求体；partial=true 时只处理出现的字段（PATCH 语义）
function buildData(body, { partial }) {
    const src = body || {};
    const data = {};
    const has = (k) => Object.prototype.hasOwnProperty.call(src, k);

    if (!partial || has('type')) {
        if (!TYPES.includes(src.type)) return { error: `type 必须是 ${TYPES.join(' / ')}` };
        data.type = src.type;
    }
    if (!partial || has('audience')) {
        const audience = src.audience === undefined ? 'all' : src.audience;
        if (!AUDIENCES.includes(audience)) return { error: `audience 必须是 ${AUDIENCES.join(' / ')}` };
        data.audience = audience;
    }
    if (!partial || has('placements')) {
        const placements = parsePlacements(src.placements);
        if (!placements.length) return { error: `placements 至少选择一个展示位（${PLACEMENTS.join(' / ')}）` };
        data.placements = JSON.stringify(placements);
    }
    if (!partial || has('status')) {
        if (has('status') || !partial) {
            const status = src.status === undefined ? 'draft' : src.status;
            if (!STATUSES.includes(status)) return { error: `status 必须是 ${STATUSES.join(' / ')}` };
            data.status = status;
        }
    }
    if (!partial || has('title')) data.title = String(src.title || '').slice(0, 200);
    if (!partial || has('summary')) data.summary = String(src.summary || '').slice(0, 500);
    if (!partial || has('body')) data.body = String(src.body || '').slice(0, 20000);
    if (!partial || has('category')) data.category = src.category ? String(src.category).slice(0, 50) : null;
    if (!partial || has('question')) data.question = src.question ? String(src.question).slice(0, 300) : null;
    if (!partial || has('answer')) data.answer = String(src.answer || '').slice(0, 20000);
    if (!partial || has('keywords')) data.keywords = JSON.stringify(parseKeywords(src.keywords));
    if (!partial || has('hot')) data.hot = src.hot === true;
    if (!partial || has('link_url')) data.link_url = src.link_url ? String(src.link_url).slice(0, 500) : null;
    if (!partial || has('link_text')) data.link_text = src.link_text ? String(src.link_text).slice(0, 50) : null;
    if (!partial || has('priority')) {
        const n = parseInt(src.priority, 10);
        data.priority = Number.isInteger(n) ? n : 0;
    }
    if (!partial || has('publish_at')) {
        const d = toDateOrNull(src.publish_at);
        if (Number.isNaN(d)) return { error: 'publish_at 不是合法日期' };
        data.publish_at = d || new Date();
    }
    if (!partial || has('expire_at')) {
        const d = toDateOrNull(src.expire_at);
        if (Number.isNaN(d)) return { error: 'expire_at 不是合法日期' };
        data.expire_at = d;
    }
    return { data };
}

const listContent = async (req, res, next) => {
    try {
        const { type, status, audience, q } = req.query;
        const where = {};
        if (TYPES.includes(type)) where.type = type;
        if (STATUSES.includes(status)) where.status = status;
        if (AUDIENCES.includes(audience)) where.audience = audience;
        if (q && String(q).trim()) {
            const kw = String(q).trim();
            where.OR = [
                { item_id: kwContains(kw) },
                { title: kwContains(kw) },
                { question: kwContains(kw) },
                { body: kwContains(kw) }
            ];
        }
        const limit = parsePositiveInt(req.query.limit, 50, 200) || 50;
        const offset = parsePositiveInt(req.query.offset, 0, 100000) || 0;

        const [total, items] = await Promise.all([
            prisma.contentItem.count({ where }),
            prisma.contentItem.findMany({
                where,
                orderBy: [{ updated_at: 'desc' }, { id: 'desc' }],
                skip: offset,
                take: limit
            })
        ]);

        res.status(200).json({ success: true, data: { total, offset, limit, items } });
    } catch (err) {
        next(err);
    }
};

const createContent = async (req, res, next) => {
    try {
        const { data, error } = buildData(req.body, { partial: false });
        if (error) return badRequest(res, error);

        let itemId = String((req.body && req.body.item_id) || '').trim();
        if (!itemId) itemId = `c_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
        if (itemId.length > 100) return badRequest(res, 'item_id 过长（≤100）');

        const exists = await prisma.contentItem.findUnique({ where: { item_id: itemId }, select: { id: true } });
        if (exists) return badRequest(res, `item_id 已存在：${itemId}`);

        const created = await prisma.contentItem.create({ data: { ...data, item_id: itemId } });
        console.log(`[ADMIN] ${new Date().toISOString()} content create id=${created.id} item_id=${itemId} type=${created.type}`);
        res.status(201).json({ success: true, data: created });
    } catch (err) {
        next(err);
    }
};

const updateContent = async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (!Number.isInteger(id)) return badRequest(res, 'Invalid content id');

        const exists = await prisma.contentItem.findUnique({ where: { id }, select: { id: true, item_id: true } });
        if (!exists) return notFound(res, 'Content not found');

        const { data, error } = buildData(req.body, { partial: true });
        if (error) return badRequest(res, error);
        if (!Object.keys(data).length) return badRequest(res, '没有可更新的字段');

        const updated = await prisma.contentItem.update({ where: { id }, data });
        console.log(`[ADMIN] ${new Date().toISOString()} content update id=${id} item_id=${exists.item_id} status=${updated.status}`);
        res.status(200).json({ success: true, data: updated });
    } catch (err) {
        next(err);
    }
};

const deleteContent = async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (!Number.isInteger(id)) return badRequest(res, 'Invalid content id');

        const exists = await prisma.contentItem.findUnique({ where: { id }, select: { id: true, item_id: true } });
        if (!exists) return notFound(res, 'Content not found');

        await prisma.contentItem.delete({ where: { id } });
        console.log(`[ADMIN] ${new Date().toISOString()} content delete id=${id} item_id=${exists.item_id}`);
        res.status(200).json({ success: true, data: { id, item_id: exists.item_id } });
    } catch (err) {
        next(err);
    }
};

const listReleases = async (req, res, next) => {
    try {
        const items = await prisma.contentRelease.findMany({ orderBy: { id: 'desc' }, take: 50 });
        res.status(200).json({ success: true, data: { items } });
    } catch (err) {
        next(err);
    }
};

// 生成当日默认版本号 YYYY.MM.DD-N
async function defaultVersion() {
    const d = new Date();
    const day = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const n = await prisma.contentRelease.count({ where: { published_at: { gte: start } } });
    return `${day}-${n + 1}`;
}

// 发布：草稿 → 已发布（时间窗由端上可见性判定，无需定时任务），并登记版本号与通知文案
const publishContent = async (req, res, next) => {
    try {
        const { version, notice } = req.body || {};
        const promoted = await prisma.contentItem.updateMany({
            where: { status: 'draft' },
            data: { status: 'published' }
        });

        const ver = String(version || '').trim() || await defaultVersion();
        const release = await prisma.contentRelease.upsert({
            where: { version: ver },
            create: { version: ver, notice: String(notice || '').slice(0, 500) },
            update: { notice: String(notice || '').slice(0, 500), published_at: new Date() }
        });

        console.log(`[ADMIN] ${new Date().toISOString()} content publish version=${ver} promoted=${promoted.count}`);
        res.status(200).json({
            success: true,
            data: { version: release.version, notice: release.notice, promotedCount: promoted.count }
        });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    listContent,
    createContent,
    updateContent,
    deleteContent,
    listReleases,
    publishContent
};
