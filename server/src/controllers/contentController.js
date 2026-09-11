// 阶段11：内容中心公开只读端点
//
// 内容源自阶段11 起改为数据库（ContentItem / ContentRelease），由运维后台维护；
// server/data/content/tax-policy.json 退役为「种子源」（scripts/seed-content.js 导入后不再运行时读盘）。
//
// 两个端点均为公开只读、无用户数据写入，但**响应按请求方登录态分层**（audience = all/free/pro）：
//   - 未携带 token（游客）→ 仅 all
//   - 基础版              → all + free
//   - 专业版/体验版        → all + free + pro
// 因响应随 Authorization 变化，必须 private/no-store（禁止 CDN 或共享缓存跨档串内容）。
const contentService = require('../services/contentService');

// GET /api/content/tax-policy?since=<revision>
// 政策要点（进税助手问答库）：返回可见条目 + 不可见条目的 deleted 墓碑，客户端按 id upsert/摘除。
const getTaxPolicy = async (req, res, next) => {
    try {
        const items = await contentService.buildPolicyPayload(req.user);
        const revision = contentService.revisionOf(items);
        const release = await contentService.latestRelease();

        // 增量语义：客户端回传的 revision 与当前一致 → 无变化，items 置空
        const since = String(req.query.since || '').trim();
        const payloadItems = (since && since === revision) ? [] : items;

        res.setHeader('Cache-Control', 'private, no-store');
        res.setHeader('Vary', 'Authorization');
        res.json({
            success: true,
            data: {
                version: release ? release.version : null,
                revision,
                publishedAt: release ? release.published_at : null,
                notice: release ? release.notice : '',
                items: payloadItems,
                total: payloadItems.length
            }
        });
    } catch (err) {
        next(err);
    }
};

// GET /api/content/feed?placement=<home_banner|modal|notice_list|assistant_qa>
// 公告 / 运营内容：按展示位 + 登录态分层返回可见列表（条目量小，始终返回全量，便于自动过期即时生效）。
const getFeed = async (req, res, next) => {
    try {
        const placement = String(req.query.placement || '').trim() || null;
        const items = await contentService.buildFeedPayload(req.user, placement);
        const release = await contentService.latestRelease();

        res.setHeader('Cache-Control', 'private, no-store');
        res.setHeader('Vary', 'Authorization');
        res.json({
            success: true,
            data: {
                version: release ? release.version : null,
                revision: contentService.revisionOf(items),
                placement,
                items,
                total: items.length
            }
        });
    } catch (err) {
        next(err);
    }
};

module.exports = { getTaxPolicy, getFeed };
