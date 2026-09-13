// 阶段14 C2：城市社保参数库公开只读端点
//
// GET /api/config/city-social?since=<revision>
//   - 返回当前生效的城市社保参数（管理台热改后自动生效；库中无自定义配置时为出厂基线）。
//   - 支持 since 增量：客户端 revision 与当前一致时 config=null，减少传输。
//   - 参数对全体用户一致（不按登录态分层），但仍用 no-store 保证改动即时可见。
const citySocialService = require('../services/citySocialService');

const getCitySocial = async (req, res, next) => {
    try {
        const row = await citySocialService.latestPublished();
        const payload = citySocialService.buildPublicPayload(row);

        const since = String(req.query.since || '').trim();
        const unchanged = !!(since && since === payload.revision);

        res.setHeader('Cache-Control', 'no-store');
        res.json({
            success: true,
            data: {
                version: payload.version,
                revision: payload.revision,
                publishedAt: payload.publishedAt,
                note: payload.note,
                source: payload.source,
                unchanged,
                config: unchanged ? null : payload.config
            }
        });
    } catch (err) {
        next(err);
    }
};

module.exports = { getCitySocial };
