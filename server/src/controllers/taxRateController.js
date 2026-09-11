// 阶段12 C1：税制参数配置公开只读端点
//
// GET /api/config/tax-rates?since=<revision>
//   - 返回当前生效的税率配置（管理台热改后自动生效；库中无自定义配置时为出厂基线）。
//   - 支持 since 增量：客户端 revision 与当前一致时 rates=null，减少传输。
//   - 速率配置对全体用户一致（不按登录态分层），但仍用 no-store 保证改动即时可见。
const taxRateService = require('../services/taxRateService');

const getTaxRates = async (req, res, next) => {
    try {
        const row = await taxRateService.latestPublished();
        const payload = taxRateService.buildPublicPayload(row);

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
                rates: unchanged ? null : payload.rates
            }
        });
    } catch (err) {
        next(err);
    }
};

module.exports = { getTaxRates };
