// 阶段10B：税务政策内容只读端点
//
// 内容源为 server/data/content/tax-policy.json（运维/内容同学修改后随发布上线，重启即生效，
// 本控制器每次请求读盘以保证免重启热更新——文件仅 KB 级，代价可忽略）。
// 公开只读静态数据：无用户数据交互、无 DB 访问、不占登录/验证码/同步等业务限流配额，
// 独立宽松限流仅用于防批量刷取。

const fs = require('fs');
const path = require('path');

const CONTENT_FILE = path.resolve(__dirname, '..', '..', 'data', 'content', 'tax-policy.json');

// 每次请求读盘并做最小校验；内容文件缺失或损坏时返回 null（由控制器转 500）
const loadContent = () => {
    try {
        const raw = fs.readFileSync(CONTENT_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || !parsed.version) return null;
        if (!Array.isArray(parsed.items)) parsed.items = [];
        return parsed;
    } catch (err) {
        console.error('[content] 读取政策内容失败:', err.message);
        return null;
    }
};

const getTaxPolicy = (req, res, next) => {
    try {
        const content = loadContent();
        if (!content) {
            return res.status(500).json({
                success: false,
                error: { message: '政策内容暂不可用，请稍后重试', statusCode: 500 }
            });
        }

        // 增量语义：?since=<version> 且与当前版本一致 → items 为空数组（客户端无需再合并）
        const since = String(req.query.since || '').trim();
        const items = (since && since === content.version) ? [] : content.items;

        // 内容为公开静态数据，允许 CDN/浏览器缓存 5 分钟
        res.setHeader('Cache-Control', 'public, max-age=300');
        res.json({
            success: true,
            data: {
                version: content.version,
                publishedAt: content.publishedAt || null,
                notice: content.notice || '',
                items: items,
                total: items.length
            }
        });
    } catch (err) {
        next(err);
    }
};

module.exports = { getTaxPolicy };
