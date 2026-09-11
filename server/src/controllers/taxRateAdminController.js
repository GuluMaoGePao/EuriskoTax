// 阶段12 C1：税制参数配置后台管理（运维后台「税率」Tab）
//
// 端点（全部要求 X-Admin-Token）：
//   GET    /api/admin/tax-rates            当前配置 + 出厂基线 + 历史版本
//   POST   /api/admin/tax-rates            保存并发布新版本（含可选公告联动）
//   POST   /api/admin/tax-rates/rollback   回滚：以历史版本为蓝本另存为新版本
//
// 安全：税率错误会波及全站计税，故 POST 一律先过服务端校验（prepareTaxRates）；
//       版本化快照不覆盖历史，误改可回滚；每次保存写审计日志。
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const taxRateService = require('../services/taxRateService');

const PLACEMENTS = ['assistant_qa', 'home_banner', 'modal', 'notice_list'];

const badRequest = (res, message, details) => res.status(400).json({
    success: false,
    error: { message, statusCode: 400, ...(details ? { details } : {}) }
});
const notFound = (res, message) => res.status(404).json({
    success: false,
    error: { message, statusCode: 404 }
});

// 生成当日默认版本号 YYYY.MM.DD-N
async function defaultVersion() {
    const d = new Date();
    const day = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const n = await prisma.taxRateConfig.count({ where: { created_at: { gte: start } } });
    return `${day}-${n + 1}`;
}

const listTaxRates = async (req, res, next) => {
    try {
        const [row, history] = await Promise.all([
            taxRateService.latestPublished(),
            taxRateService.listHistory(30)
        ]);
        const current = row ? {
            id: row.id,
            version: row.version,
            note: row.note,
            publishedAt: row.published_at,
            payload: taxRateService.parsePayload(row)
        } : null;

        res.status(200).json({
            success: true,
            data: {
                current,
                defaults: taxRateService.DEFAULT_TAX_RATES,
                history: history.map((h) => ({
                    id: h.id,
                    version: h.version,
                    status: h.status,
                    note: h.note,
                    publishedAt: h.published_at,
                    createdAt: h.created_at
                }))
            }
        });
    } catch (err) {
        next(err);
    }
};

// 写入一份新的 published 快照（旧 published 归档）
async function commitConfig({ version, note, data }) {
    const payloadStr = JSON.stringify(data);
    return prisma.$transaction(async (tx) => {
        await tx.taxRateConfig.updateMany({
            where: { status: 'published' },
            data: { status: 'archived' }
        });
        return tx.taxRateConfig.create({
            data: {
                version,
                status: 'published',
                payload: payloadStr,
                note: String(note || '').slice(0, 500),
                created_by: 'admin'
            }
        });
    });
}

// 可选：税率变更后联动发布一条公告（复用内容中心，端上下次同步即弹窗/公告条展示）
async function publishNotice(rateVersion, noteStr, notify) {
    const rawPlacements = Array.isArray(notify && notify.placements) ? notify.placements : [];
    const placements = rawPlacements.filter((p) => PLACEMENTS.includes(p));
    const finalPlacements = placements.length ? placements : ['modal', 'notice_list'];

    const title = String((notify && notify.title) || '').trim().slice(0, 200)
        || `计税参数已更新至 ${rateVersion}`;
    const summary = String((notify && notify.summary) || '').trim().slice(0, 500)
        || String(noteStr || '').trim().slice(0, 500)
        || '本次税率参数已按最新政策口径更新，计算结果以最新版本为准。';
    const body = String((notify && notify.body) || '').slice(0, 20000) || summary;

    const itemId = `taxrate_${rateVersion}`;
    const data = {
        item_id: itemId,
        type: 'announcement',
        audience: 'all',
        placements: JSON.stringify(finalPlacements),
        title,
        summary,
        body,
        status: 'published',
        publish_at: new Date(),
        priority: 50,
        hot: false,
        link_url: null,
        link_text: null,
        category: null,
        question: null,
        answer: '',
        keywords: '[]'
    };

    const dup = await prisma.contentItem.findUnique({ where: { item_id: itemId }, select: { id: true } });
    const item = dup
        ? await prisma.contentItem.update({ where: { id: dup.id }, data })
        : await prisma.contentItem.create({ data });

    // 发布批次版本号加 tax- 前缀，避免与内容中心 YYYY.MM.DD-N 撞号
    const release = await prisma.contentRelease.upsert({
        where: { version: `tax-${rateVersion}` },
        create: { version: `tax-${rateVersion}`, notice: summary },
        update: { notice: summary, published_at: new Date() }
    });

    return {
        version: release.version,
        notice: release.notice,
        itemId: item.item_id,
        placements: finalPlacements
    };
}

const createTaxRateConfig = async (req, res, next) => {
    try {
        const body = req.body || {};
        const { ok, errors, data } = taxRateService.prepareTaxRates(body.rates);
        if (!ok) return badRequest(res, errors[0] || '税率配置非法', errors);

        let ver = String(body.version || '').trim();
        if (ver.length > 40) return badRequest(res, '版本号过长（≤40）');
        if (!ver) ver = await defaultVersion();

        const exists = await prisma.taxRateConfig.findUnique({ where: { version: ver }, select: { id: true } });
        if (exists) return badRequest(res, `版本号已存在：${ver}（请更换，如追加日期后缀）`);

        const created = await commitConfig({ version: ver, note: body.note, data });

        let release = null;
        const notify = body.notify;
        if (notify && notify.enabled) {
            release = await publishNotice(ver, body.note, notify);
        }

        console.log(`[ADMIN] ${new Date().toISOString()} taxrate publish version=${ver} notify=${!!(notify && notify.enabled)}`);
        res.status(201).json({
            success: true,
            data: {
                config: {
                    id: created.id,
                    version: created.version,
                    note: created.note,
                    publishedAt: created.published_at
                },
                release
            }
        });
    } catch (err) {
        next(err);
    }
};

const rollbackTaxRates = async (req, res, next) => {
    try {
        const body = req.body || {};
        const id = parseInt(body.id, 10);
        if (!Number.isInteger(id)) return badRequest(res, 'id 非法');

        const row = await prisma.taxRateConfig.findUnique({ where: { id } });
        if (!row) return notFound(res, '配置版本不存在');

        const parsed = taxRateService.parsePayload(row);
        if (!parsed) return badRequest(res, '该版本配置已损坏，无法回滚');

        const { ok, errors, data } = taxRateService.prepareTaxRates(parsed);
        if (!ok) return badRequest(res, errors[0] || '历史配置非法', errors);

        let ver = String(body.version || '').trim();
        if (ver.length > 40) return badRequest(res, '版本号过长（≤40）');
        if (!ver) ver = await defaultVersion();

        const exists = await prisma.taxRateConfig.findUnique({ where: { version: ver }, select: { id: true } });
        if (exists) return badRequest(res, `版本号已存在：${ver}（请更换）`);

        const note = String(body.note || '').trim() || `回滚至 ${row.version}`;
        const created = await commitConfig({ version: ver, note, data });

        console.log(`[ADMIN] ${new Date().toISOString()} taxrate rollback from=${row.version} to=${ver}`);
        res.status(201).json({
            success: true,
            data: {
                config: {
                    id: created.id,
                    version: created.version,
                    note: created.note,
                    publishedAt: created.published_at,
                    from: row.version
                }
            }
        });
    } catch (err) {
        next(err);
    }
};

module.exports = { listTaxRates, createTaxRateConfig, rollbackTaxRates };
