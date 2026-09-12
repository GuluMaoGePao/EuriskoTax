const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// 跟进状态机（与前端管理台下拉一致）
const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'converted', 'dropped'];

// 备注编辑上限（与 leadController.NOTE_MAX 保持一致）
const NOTE_MAX = 1000;
const OWNER_MAX = 50;

// 阶段13E：转化漏斗步骤（与前端 api-client.reportFunnelEvent 的 step 约定一致）
// lead_submit 不在其中 —— 它取自 Lead 表（唯一真相），不由埋点上报
const FUNNEL_STEPS = ['visit', 'calc_done', 'share', 'save', 'lead_click'];
const FUNNEL_DAYS_MAX = 90;

// 北京时间（UTC+8）偏移量：按国内用户习惯计算"今日"边界
const CST_OFFSET_MS = 8 * 60 * 60 * 1000;

/**
 * 获取北京时间某日 0 点对应的 UTC 区间
 * @param {number} daysAgo - 距今天的天数（0=今天）
 */
const getCstDayRange = (daysAgo) => {
    const cstNow = new Date(Date.now() + CST_OFFSET_MS);
    const cstMidnight = new Date(Date.UTC(cstNow.getUTCFullYear(), cstNow.getUTCMonth(), cstNow.getUTCDate() - daysAgo));
    const start = new Date(cstMidnight.getTime() - CST_OFFSET_MS);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    return { start, end, label: cstMidnight.toISOString().slice(0, 10) };
};

// 北京时间格式化（CSV 导出可读性）
const toCstText = (d) => (d ? new Date(d.getTime() + CST_OFFSET_MS).toISOString().replace('T', ' ').slice(0, 19) : '');

// 关键词包含匹配：Prisma 的 `mode: 'insensitive'` 仅 PostgreSQL 等连接器支持，
// 本地 SQLite（file: 协议）传该参数会被判为非法查询而 500；
// SQLite 的 LIKE 对 ASCII 本身不区分大小写，故按数据源协议分别构造，保证两端语义一致。
const DB_URL = process.env.DATABASE_URL || '';
const SUPPORTS_INSENSITIVE = DB_URL !== '' && !/^file:/i.test(DB_URL);
const kwContains = (kw) => (SUPPORTS_INSENSITIVE ? { contains: kw, mode: 'insensitive' } : { contains: kw });

const parsePositiveInt = (raw, fallback, max) => {
    const n = parseInt(raw, 10);
    if (!Number.isInteger(n) || n < 1) return fallback;
    if (max && n > max) return max;
    return n;
};

// 列表与导出共用筛选条件
const buildWhere = (query = {}) => {
    const where = {};
    const status = typeof query.status === 'string' ? query.status : '';
    const source = typeof query.source === 'string' ? query.source : '';
    const q = typeof query.q === 'string' ? query.q.trim() : '';

    if (LEAD_STATUSES.includes(status)) where.status = status;
    if (source) where.source = source;
    if (q) {
        where.OR = [
            { name: kwContains(q) },
            { phone: kwContains(q) },
            { company: kwContains(q) }
        ];
    }
    return where;
};

// CSV 单元格：转义双引号 + 防公式注入（= + - @ 开头前置单引号，避免 Excel 执行）
const csvCell = (value) => {
    const s = value === null || value === undefined ? '' : String(value);
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return `"${safe.replace(/"/g, '""')}"`;
};

/**
 * 线索列表
 * GET /api/admin/leads?status=&source=&q=&limit=50&offset=0
 * q 匹配姓名 / 手机号 / 公司（子串，忽略大小写）；默认按创建时间倒序
 */
const listLeads = async (req, res, next) => {
    try {
        const where = buildWhere(req.query);
        const limit = parsePositiveInt(req.query.limit, 50, 200);
        const offset = parsePositiveInt(req.query.offset, 0, 100000);

        const [total, items, statusGroups] = await Promise.all([
            prisma.lead.count({ where }),
            prisma.lead.findMany({
                where,
                orderBy: { created_at: 'desc' },
                skip: offset,
                take: limit,
                include: { user: { select: { id: true, username: true, email: true, plan: true } } }
            }),
            prisma.lead.groupBy({ by: ['status'], _count: { _all: true } })
        ]);

        const byStatus = {};
        LEAD_STATUSES.forEach((s) => { byStatus[s] = 0; });
        statusGroups.forEach((g) => { byStatus[g.status] = g._count._all; });

        res.status(200).json({
            success: true,
            data: { total, offset, limit, byStatus, items }
        });
    } catch (err) {
        next(err);
    }
};

/**
 * 更新线索（部分更新：仅更新请求体出现的字段）
 * PATCH /api/admin/leads/:id  body: { status?, owner?, note? }
 * 语义：owner 传 null/'' → 置空（取消分配）；status 必须在状态机白名单内。
 */
const updateLead = async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (!Number.isInteger(id)) {
            return res.status(400).json({
                success: false,
                error: { message: 'Invalid lead id', statusCode: 400 }
            });
        }

        const body = req.body || {};
        const data = {};

        if (body.status !== undefined) {
            if (!LEAD_STATUSES.includes(body.status)) {
                return res.status(400).json({
                    success: false,
                    error: { message: `Invalid status. Must be one of: ${LEAD_STATUSES.join(', ')}`, statusCode: 400 }
                });
            }
            data.status = body.status;
        }

        if (body.owner !== undefined) {
            if (body.owner !== null && typeof body.owner !== 'string') {
                return res.status(400).json({
                    success: false,
                    error: { message: 'owner must be a string or null', statusCode: 400 }
                });
            }
            const owner = body.owner === null ? '' : body.owner.trim().slice(0, OWNER_MAX);
            data.owner = owner || null;
        }

        if (body.note !== undefined) {
            if (typeof body.note !== 'string') {
                return res.status(400).json({
                    success: false,
                    error: { message: 'note must be a string', statusCode: 400 }
                });
            }
            data.note = body.note.trim().slice(0, NOTE_MAX);
        }

        if (Object.keys(data).length === 0) {
            return res.status(400).json({
                success: false,
                error: { message: 'No updatable field provided (status / owner / note)', statusCode: 400 }
            });
        }

        const exists = await prisma.lead.findUnique({ where: { id }, select: { id: true } });
        if (!exists) {
            return res.status(404).json({
                success: false,
                error: { message: 'Lead not found', statusCode: 404 }
            });
        }

        const updated = await prisma.lead.update({ where: { id }, data });

        const at = new Date().toISOString();
        console.log(`[ADMIN] ${at} lead=${id} status=${updated.status} owner=${updated.owner || 'null'}`);

        res.status(200).json({ success: true, data: updated });
    } catch (err) {
        next(err);
    }
};

/**
 * 线索漏斗统计
 * GET /api/admin/leads/stats
 * 返回各状态计数、今日新增、待分配（new 且未指定 owner）、按来源分布。
 * 北极星指标 lead_submit / calc_done 的分子即 total（配合 /api/stats/overview 的计算数计算）。
 */
const leadStats = async (req, res, next) => {
    try {
        const today = getCstDayRange(0);

        const [total, newToday, unassigned, statusGroups, sourceGroups] = await Promise.all([
            prisma.lead.count(),
            prisma.lead.count({ where: { created_at: { gte: today.start, lt: today.end } } }),
            prisma.lead.count({ where: { status: 'new', owner: null } }),
            prisma.lead.groupBy({ by: ['status'], _count: { _all: true } }),
            prisma.lead.groupBy({ by: ['source'], _count: { _all: true } })
        ]);

        const byStatus = {};
        LEAD_STATUSES.forEach((s) => { byStatus[s] = 0; });
        statusGroups.forEach((g) => { byStatus[g.status] = g._count._all; });

        const bySource = {};
        sourceGroups.forEach((g) => { bySource[g.source || 'unknown'] = g._count._all; });

        res.status(200).json({
            success: true,
            data: {
                total,
                newToday,
                unassigned,
                byStatus,
                bySource,
                dateLabel: today.label
            }
        });
    } catch (err) {
        next(err);
    }
};

// 转化率（百分比，保留 1 位小数）。分母为 0 返回 null → 前端显示「—」：
// 0% 会被误读成「转化极差」，实际是「还没有样本」，这个区别直接影响投放判断，故单独提出便于守护。
function funnelRate(num, den) {
    return den > 0 ? Math.round((num / den) * 1000) / 10 : null;
}

/**
 * 转化漏斗统计（阶段13E）
 * GET /api/admin/leads/funnel?days=7
 * 返回近 N 天（含今日）各步骤累计、今日值，以及各步转化率与北极星。
 *
 * 口径（重要，避免看数时误判）：
 *   - visit / calc_done / share / save / lead_click 取自 FunnelEvent 日聚合（公开端点上报，**含游客**）；
 *   - lead_submit **不取 FunnelEvent**，直接 count Lead 表 —— 同一事实只存一处，杜绝两个数对不上；
 *   - 北极星 = lead_submit / calc_done，**分母不是 visit**：没算完的流量不可能转化，
 *     拿 visit 当分母会把「进来就走」也算成机会，虚高转化率、误导投放判断。
 */
const funnelStats = async (req, res, next) => {
    try {
        const days = parsePositiveInt(req.query.days, 7, FUNNEL_DAYS_MAX);
        const today = getCstDayRange(0);
        const from = getCstDayRange(days - 1); // 含今日共 days 天

        const [rangeGroups, todayGroups, submitInRange, submitToday] = await Promise.all([
            prisma.funnelEvent.groupBy({
                by: ['step'],
                where: { date: { gte: from.start, lt: today.end } },
                _sum: { count: true }
            }),
            prisma.funnelEvent.groupBy({
                by: ['step'],
                where: { date: { gte: today.start, lt: today.end } },
                _sum: { count: true }
            }),
            prisma.lead.count({ where: { created_at: { gte: from.start, lt: today.end } } }),
            prisma.lead.count({ where: { created_at: { gte: today.start, lt: today.end } } })
        ]);

        // 未知 step（历史脏数据）直接忽略，保证返回结构恒定、前端无需兜空
        const collect = (groups) => {
            const out = {};
            FUNNEL_STEPS.forEach((s) => { out[s] = 0; });
            groups.forEach((g) => { if (g.step in out) out[g.step] = g._sum.count || 0; });
            return out;
        };

        const steps = collect(rangeGroups);
        const todaySteps = collect(todayGroups);
        steps.lead_submit = submitInRange;
        todaySteps.lead_submit = submitToday;

        // 分母为 0 时返回 null，让前端显示「—」而不是误导性的 0%
        const rate = funnelRate;

        res.status(200).json({
            success: true,
            data: {
                days,
                fromLabel: from.label,
                toLabel: today.label,
                steps,
                today: todaySteps,
                rates: {
                    visitToCalc: rate(steps.calc_done, steps.visit),
                    calcToLeadClick: rate(steps.lead_click, steps.calc_done),
                    calcToSubmit: rate(steps.lead_submit, steps.calc_done),
                    visitToSubmit: rate(steps.lead_submit, steps.visit)
                },
                northStar: rate(steps.lead_submit, steps.calc_done)
            }
        });
    } catch (err) {
        next(err);
    }
};

/**
 * 线索 CSV 导出（销售导入自有 CRM 用）
 * GET /api/admin/leads/export?status=&source=&q=
 * 含 UTF-8 BOM，保证 Excel 打开中文不乱码。
 */
const exportLeads = async (req, res, next) => {
    try {
        const where = buildWhere(req.query);
        const items = await prisma.lead.findMany({
            where,
            orderBy: { created_at: 'desc' },
            take: 5000
        });

        const header = [
            'ID', '提交时间(北京)', '姓名', '手机号', '微信号', '公司/个体户', '主体类型',
            '需求', '来源', '情境', '状态', '跟进人', '备注', '同意隐私'
        ];
        const lines = [header.map(csvCell).join(',')];
        items.forEach((it) => {
            lines.push([
                it.id,
                toCstText(it.created_at),
                it.name,
                it.phone,
                it.wechat,
                it.company,
                it.entity_type,
                it.need,
                it.source,
                it.scene,
                it.status,
                it.owner,
                it.note,
                it.consent ? '是' : '否'
            ].map(csvCell).join(','));
        });

        const csv = '\uFEFF' + lines.join('\r\n');
        const stamp = getCstDayRange(0).label.replace(/-/g, '');

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="leads-${stamp}.csv"`);
        res.status(200).send(csv);
    } catch (err) {
        next(err);
    }
};

module.exports = {
    listLeads,
    funnelStats,
    updateLead,
    leadStats,
    exportLeads,
    _internal: { buildWhere, csvCell, getCstDayRange, toCstText, LEAD_STATUSES, FUNNEL_STEPS, funnelRate }
};
