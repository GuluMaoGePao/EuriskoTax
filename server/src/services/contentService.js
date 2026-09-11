// 阶段11：内容中心服务层
//
// 职责：
//   1) 按请求方登录态解析可消费的 audience 集合（游客=all；基础版=all+free；专业版/体验版=all+free+pro）
//   2) 时间窗可见性判定（published + publish_at<=now + 未过期）
//   3) 构建两类端点载荷：
//      - policy（进税助手问答库）：可见条目完整字段 + 不可见条目的 deleted 墓碑（供客户端摘除）
//      - feed（公告/运营内容）：按展示位过滤的可见列表
//
// 设计要点：本表是「增量覆盖层」，内置 QA 快照仍作离线兜底；policy 条目按 item_id 与内置条目对齐。
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const AUDIENCE_ALL = 'all';
const AUDIENCE_FREE = 'free';
const AUDIENCE_PRO = 'pro';

const PLACEMENT_ASSISTANT = 'assistant_qa';

const FEED_TYPES = ['announcement', 'operation'];

// 与前端 plan.js isPro() 语义保持一致：plan='pro' 且（无过期时间 或 未过期）
const isProUser = (user) => {
    if (!user || user.plan !== AUDIENCE_PRO) return false;
    if (!user.plan_expires_at) return true;
    const expiresAt = new Date(user.plan_expires_at).getTime();
    if (!Number.isFinite(expiresAt)) return true;
    return expiresAt > Date.now();
};

// 请求方可消费的 audience 集合
const allowedAudiences = (user) => {
    if (!user) return [AUDIENCE_ALL];
    if (isProUser(user)) return [AUDIENCE_ALL, AUDIENCE_FREE, AUDIENCE_PRO];
    return [AUDIENCE_ALL, AUDIENCE_FREE];
};

const parseJsonArray = (raw) => {
    try {
        const parsed = JSON.parse(raw || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
        return [];
    }
};

// 时间窗可见性：草稿/已撤回、未到发布时间、已过期 均不可见
const isWithinWindow = (item, now) => {
    const ts = now === undefined ? Date.now() : now;
    if (item.status !== 'published') return false;
    if (item.publish_at && new Date(item.publish_at).getTime() > ts) return false;
    if (item.expire_at && new Date(item.expire_at).getTime() <= ts) return false;
    return true;
};

// 条目是否对当前请求方可见（时间窗 + audience + 展示位）
const isVisible = (item, allowed, placement, now) => (
    isWithinWindow(item, now)
    && allowed.includes(item.audience)
    && (!placement || parseJsonArray(item.placements).includes(placement))
);

const toISO = (d) => (d ? new Date(d).toISOString() : null);

// policy 条目 → 内置 QA 快照同构结构（供 tax-policy.js applyUpdates 直接 upsert）
const toPolicyItem = (row) => ({
    id: row.item_id,
    category: row.category || undefined,
    keywords: parseJsonArray(row.keywords),
    question: row.question || row.title || '',
    answer: row.answer || row.body || '',
    hot: row.hot === true,
    effectiveAt: row.publish_at ? toISO(row.publish_at).slice(0, 10) : undefined,
    tag: 'policy-point', // final-report.js pickPolicyItems 依赖该标记
    updatedAt: toISO(row.updated_at)
});

// feed 条目 → 前端展示结构
const toFeedItem = (row) => ({
    id: row.item_id,
    type: row.type,
    audience: row.audience,
    placements: parseJsonArray(row.placements),
    title: row.title || '',
    summary: row.summary || '',
    body: row.body || '',
    linkUrl: row.link_url || null,
    linkText: row.link_text || null,
    priority: row.priority || 0,
    publishedAt: toISO(row.publish_at),
    expireAt: toISO(row.expire_at),
    updatedAt: toISO(row.updated_at)
});

const latestRelease = () => prisma.contentRelease.findFirst({ orderBy: { id: 'desc' } });

// 内容版本号（发布批次）+ 载荷指纹（revision）：revision 变化即代表内容有实质变动
const revisionOf = (items) => crypto.createHash('md5').update(JSON.stringify(items)).digest('hex').slice(0, 12);

// 构建 policy 载荷（含墓碑）
async function buildPolicyPayload(user) {
    const allowed = allowedAudiences(user);
    const rows = await prisma.contentItem.findMany({
        where: { type: 'policy' },
        orderBy: [{ priority: 'desc' }, { publish_at: 'desc' }, { id: 'desc' }]
    });

    const now = Date.now();
    const items = [];
    for (const row of rows) {
        if (isVisible(row, allowed, PLACEMENT_ASSISTANT, now)) {
            items.push(toPolicyItem(row));
        } else {
            // 不可见 → 发墓碑：对内置条目意味着「撤回覆盖」，对新增条目客户端为无操作（幂等）
            items.push({ id: row.item_id, deleted: true });
        }
    }
    return items;
}

// 构建 feed 载荷（公告 / 运营内容），可选按展示位过滤
async function buildFeedPayload(user, placement) {
    const allowed = allowedAudiences(user);
    const rows = await prisma.contentItem.findMany({
        where: { type: { in: FEED_TYPES } },
        orderBy: [{ priority: 'desc' }, { publish_at: 'desc' }, { id: 'desc' }]
    });

    const now = Date.now();
    return rows
        .filter((row) => isVisible(row, allowed, placement, now))
        .map(toFeedItem);
}

module.exports = {
    AUDIENCE_ALL,
    AUDIENCE_FREE,
    AUDIENCE_PRO,
    PLACEMENT_ASSISTANT,
    FEED_TYPES,
    isProUser,
    allowedAudiences,
    parseJsonArray,
    isWithinWindow,
    latestRelease,
    revisionOf,
    buildPolicyPayload,
    buildFeedPayload
};
