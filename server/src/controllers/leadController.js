const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// 字段白名单（与前端留资表单 / 分享图归因参数同步，非法值一律回落默认，避免脏数据）
const ENTITY_TYPES = ['individual', 'sole', 'small', 'other', 'unknown'];
const NEEDS = ['bookkeeping', 'settlement', 'declare_check', 'consult', 'other'];
const SOURCES = [
    'result_business', 'result_settlement', 'result_budget',
    'home_banner', 'modal', 'notice_list', 'profile', 'share', 'unknown',
    // 阶段14 剩余项：SEO 落地页（页面按页给独立来源，便于判断哪个关键词页真的带来线索）
    'seo_bonus', 'seo_salary', 'seo_settlement',
    // 阶段15 15A：个税纵深落地页（劳务报酬 / 稿酬 / 特许权使用费预扣预缴）
    'seo_withholding',
];

// 文本长度上限（防超长脏数据撑爆库容）
const NAME_MAX = 50;
const WECHAT_MAX = 64;
const COMPANY_MAX = 100;
const PROVINCE_MAX = 20;
const CITY_MAX = 20;
const SCENE_MAX = 100;
const NOTE_MAX = 1000;

// 手机号校验：与注册页保持一致
const PHONE_RE = /^1[3-9]\d{9}$/;

// 幂等去重窗口：同手机号 24h 内重复提交不新建记录（也避免暴露"该号码已提交"）
const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;

const pickEnum = (list, raw, fallback) => (typeof raw === 'string' && list.includes(raw) ? raw : fallback);

/**
 * 读取并校验一个选填文本字段
 * @returns {{value?: string, error?: string}} 未提供 → value: ''；超长/非字符串 → error
 */
const readText = (raw, max, label) => {
    if (raw === undefined || raw === null) return { value: '' };
    if (typeof raw !== 'string') return { error: `${label} must be a string` };
    const value = raw.trim();
    if (value.length > max) return { error: `${label} must be <= ${max} characters` };
    return { value };
};

/**
 * 归一化留资请求体（纯函数，不触碰数据库，便于单测）
 * @returns {{data?: object, error?: string}}
 */
const buildLead = (body) => {
    const src = body && typeof body === 'object' ? body : {};

    const name = typeof src.name === 'string' ? src.name.trim() : '';
    if (!name) return { error: 'name is required' };
    if (name.length > NAME_MAX) return { error: `name must be <= ${NAME_MAX} characters` };

    const phone = typeof src.phone === 'string' ? src.phone.trim() : '';
    const wechatRes = readText(src.wechat, WECHAT_MAX, 'wechat');
    if (wechatRes.error) return { error: wechatRes.error };

    // 至少留一种联系方式，否则线索无法跟进
    if (!phone && !wechatRes.value) return { error: 'phone or wechat is required' };
    if (phone && !PHONE_RE.test(phone)) return { error: 'Invalid phone number' };

    // 个保法：留资涉及收入相关敏感信息，必须显式同意
    if (src.consent !== true) return { error: 'consent is required' };

    const companyRes = readText(src.company, COMPANY_MAX, 'company');
    if (companyRes.error) return { error: companyRes.error };
    // 所在省 / 市：计算页不再让用户选参保城市（2026-09 回退），改由留资时收集，
    // 顾问据此核对当地社保/公积金缴费基数口径。选填（不阻断留资），后端只做长度约束。
    // 省份与城市分开存：市名重名时（吉林市 / 海南藏族自治州）只有市名会让顾问认错统筹区。
    const provinceRes = readText(src.province, PROVINCE_MAX, 'province');
    if (provinceRes.error) return { error: provinceRes.error };
    const cityRes = readText(src.city, CITY_MAX, 'city');
    if (cityRes.error) return { error: cityRes.error };
    const sceneRes = readText(src.scene, SCENE_MAX, 'scene');
    if (sceneRes.error) return { error: sceneRes.error };
    const noteRes = readText(src.note, NOTE_MAX, 'note');
    if (noteRes.error) return { error: noteRes.error };

    return {
        data: {
            name,
            phone: phone || null,
            wechat: wechatRes.value || null,
            company: companyRes.value || null,
            province: provinceRes.value,
            city: cityRes.value,
            entity_type: pickEnum(ENTITY_TYPES, src.entityType, 'unknown'),
            need: pickEnum(NEEDS, src.need, 'other'),
            source: pickEnum(SOURCES, src.source, 'unknown'),
            scene: sceneRes.value,
            note: noteRes.value,
            consent: true
        }
    };
};

/**
 * 提交转化线索（公开端点，游客亦可提交）
 * POST /api/leads
 * 无需登录；登录态可用时自动关联 user_id（便于顾问在管理台看到账号）。
 */
const submitLead = async (req, res, next) => {
    try {
        const { data, error } = buildLead(req.body);
        if (error) {
            return res.status(400).json({
                success: false,
                error: { message: error, statusCode: 400 }
            });
        }

        // 游客留 null；登录用户挂上 id（optionalAuth 未命中时 req.user 为 undefined）
        const userId = req.user && Number.isInteger(req.user.id) ? req.user.id : null;

        // 幂等去重：同手机号 24h 内已留资 → 合并到既有线索，不新建
        if (data.phone) {
            const since = new Date(Date.now() - DEDUPE_WINDOW_MS);
            const existing = await prisma.lead.findFirst({
                where: { phone: data.phone, created_at: { gte: since } },
                orderBy: { created_at: 'desc' }
            });
            if (existing) {
                const noteMerged = data.note
                    ? (existing.note ? `${existing.note}\n---\n${data.note}` : data.note).slice(0, NOTE_MAX)
                    : existing.note;
                const merged = await prisma.lead.update({
                    where: { id: existing.id },
                    data: {
                        // 情境/归因以最新一次为准；备注追加保留首次诉求
                        source: data.source !== 'unknown' ? data.source : existing.source,
                        scene: data.scene || existing.scene,
                        // 省 / 市同情境：本次填了就以本次为准（用户纠正/补充更准确）；
                        // 两项各自判断 —— 用户可能只改了城市而省份没重选
                        province: data.province || existing.province,
                        city: data.city || existing.city,
                        note: noteMerged,
                        user_id: existing.user_id || userId
                    }
                });
                console.log(`[LEAD] ${new Date().toISOString()} merged id=${merged.id} source=${merged.source} scene="${merged.scene}"`);
                return res.status(200).json({ success: true, data: { id: merged.id, merged: true } });
            }
        }

        const saved = await prisma.lead.create({
            data: { ...data, user_id: userId }
        });

        // 落日志：生产环境可经 ops-notify.ps1 邮件转发，实现"有新线索即知会"
        // 带上省·市：日志是「有新线索即知会」的转发源，顾问一眼就能看出该按哪套基数口径对接
        const region = [saved.province, saved.city].filter(Boolean).join('·');
        console.log(`[LEAD] ${new Date().toISOString()} id=${saved.id} user=${userId || 'guest'} entity=${saved.entity_type} need=${saved.need} source=${saved.source} region="${region}" scene="${saved.scene}"`);

        res.status(201).json({
            success: true,
            data: { id: saved.id, merged: false }
        });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    submitLead,
    _internal: {
        buildLead,
        ENTITY_TYPES,
        NEEDS,
        SOURCES,
        PHONE_RE,
        NAME_MAX,
        WECHAT_MAX,
        COMPANY_MAX,
        PROVINCE_MAX,
        CITY_MAX,
        SCENE_MAX,
        NOTE_MAX,
        DEDUPE_WINDOW_MS
    }
};
