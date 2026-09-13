// 阶段14 C2：城市社保参数库服务层（管理台热改各城市缴费基数口径）
//
// 职责（与阶段12 C1 的 taxRateService 同构，复用「版本化快照 + 热更新」模式）：
//   1) 提供「出厂基线」DEFAULT_CITY_SOCIAL —— 库中尚无自定义配置时公开端点的回退值，
//      同时也是管理台编辑器的初始值。数值须与前端 src/js/calculation/tax-constants.js 对齐
//      （该文件仍是断网离线时的最终兜底）。
//   2) 校验 + 归一化城市社保配置（纯函数，可单测）：防止管理台误填导致全站基数告警口径错误。
//   3) 读取最新 published 快照、生成 revision 指纹。
//
// 为什么要有 C2：C1 只解决了「税率 + 全国平均基数下限」的热改，社保/公积金缴费基数
// 下限各城市差异极大（同一政策年份下可相差一倍以上），此前全站统一用全国平均 7546，
// 会让高基数城市的用户被告知「基数合规」、低基数城市用户被误报「低于最低标准」。
// C2 把基数口径拆到城市维度，由管理台按城市维护并热更；未选择城市时仍回落到 C1 的全局值。
//
// 约定：
//   - 城市项固定字段顺序 { code, name, socialBaseMin, socialBaseMax, housingBaseMin, housingBaseMax, housingFundRateOptions, note }
//   - 无上限的基数存 null（JSON 不支持 Infinity）
//   - 必须保留 code = 'national' 的兜底城市，否则前端无城市可选时会失去回落锚点
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const MAX_CITIES = 200;
const MAX_RATE_OPTIONS = 6;
// 城市编码：小写字母开头，允许小写字母/数字/下划线/连字符（如 national、beijing、shenzhen-sz）
// 大写与中文一律拒绝：编码是前后端契约与 localStorage 键的一部分，必须稳定可比
const CITY_CODE_RE = /^[a-z][a-z0-9_-]{1,31}$/;
// 兜底城市编码：前端在用户未选择城市、或所选城市在新版本中被删除时回落于此
const FALLBACK_CITY = 'national';

// 出厂基线：与 src/js/calculation/tax-constants.js 的 MIN_SOCIAL_SECURITY_BASE / MIN_HOUSING_FUND_BASE 一致
const DEFAULT_CITY_SOCIAL = {
    constantsVersion: '2026.1',
    defaultCity: FALLBACK_CITY,
    cities: [
        {
            code: FALLBACK_CITY,
            name: '全国平均',
            socialBaseMin: 7546,
            socialBaseMax: null,
            housingBaseMin: 7546,
            housingBaseMax: null,
            housingFundRateOptions: [5, 7],
            note: '出厂基线：未按参保城市细化时的兜底口径'
        }
    ]
};

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isBlank = (v) => v === null || v === undefined || v === '';
const toNum = (v) => (isBlank(v) ? NaN : Number(v));

// 缴费基数：下限必填且 ≥ 0；上限可留空（= 无上限，存 null），填了则必须 ≥ 下限
function prepareBase(item, field, label, errors) {
    const raw = toNum(item[field]);
    if (!isNum(raw) || raw < 0) {
        errors.push(`${label}：须为 ≥ 0 的数值`);
        return null;
    }
    return raw;
}

function prepareBaseMax(item, field, label, minValue, errors) {
    // 上限留空表示「无上限」（如部分地区公积金不设上限）
    if (isBlank(item[field])) return null;
    const raw = toNum(item[field]);
    if (!isNum(raw) || raw < 0) {
        errors.push(`${label}：须为 ≥ 0 的数值（留空表示无上限）`);
        return null;
    }
    if (isNum(minValue) && raw < minValue) {
        errors.push(`${label}：上限不得低于下限（当前 ${raw} < ${minValue}）`);
    }
    return raw;
}

// 公积金可选比例：去重升序，取值 (0, 100]
function prepareRateOptions(raw, label, errors) {
    if (isBlank(raw)) return [5, 7];
    if (!Array.isArray(raw) || raw.length === 0) {
        errors.push(`${label}：须为非空数组（如 [5,7]），留空则默认 [5,7]`);
        return [5, 7];
    }
    if (raw.length > MAX_RATE_OPTIONS) {
        errors.push(`${label}：最多 ${MAX_RATE_OPTIONS} 项`);
    }
    const out = [];
    raw.forEach((v) => {
        const n = toNum(v);
        if (!isNum(n) || n <= 0 || n > 100) {
            errors.push(`${label}：比例须在 (0, 100] 之间（百分比数值）`);
            return;
        }
        out.push(n);
    });
    const uniq = [...new Set(out)].sort((a, b) => a - b);
    if (uniq.length === 0) errors.push(`${label}：至少保留一项合法比例`);
    return uniq.length ? uniq : [5, 7];
}

// 校验并归一化整份城市社保配置
// 返回 { ok, errors, data }；ok=false 时 data 为 null
function prepareCitySocial(input) {
    const errors = [];
    const src = input || {};

    const rawCities = src.cities;
    let cities = [];
    if (!Array.isArray(rawCities) || rawCities.length === 0) {
        errors.push('城市列表：不能为空（至少保留一个城市）');
    } else if (rawCities.length > MAX_CITIES) {
        errors.push(`城市列表：城市过多（≤${MAX_CITIES}）`);
    } else {
        const seen = new Set();
        rawCities.forEach((raw, i) => {
            const item = raw || {};
            const tag = `城市 第 ${i + 1} 项`;
            const code = String(item.code || '').trim();
            if (!CITY_CODE_RE.test(code)) {
                errors.push(`${tag}：编码须为小写字母开头、仅含小写字母/数字/_/-，长度 2-32（当前「${code}」）`);
            } else if (seen.has(code)) {
                errors.push(`${tag}：编码重复「${code}」`);
            }
            seen.add(code);

            const name = String(item.name || '').trim().slice(0, 50);
            if (!name) errors.push(`${tag}：城市名称不能为空`);

            const socialMin = prepareBase(item, 'socialBaseMin', `${name || code} 社保基数下限`, errors);
            const socialMax = prepareBaseMax(item, 'socialBaseMax', `${name || code} 社保基数上限`, socialMin, errors);
            const housingMin = prepareBase(item, 'housingBaseMin', `${name || code} 公积金基数下限`, errors);
            const housingMax = prepareBaseMax(item, 'housingBaseMax', `${name || code} 公积金基数上限`, housingMin, errors);
            const rateOptions = prepareRateOptions(item.housingFundRateOptions, `${name || code} 公积金比例选项`, errors);

            cities.push({
                code,
                name,
                socialBaseMin: socialMin,
                socialBaseMax: socialMax,
                housingBaseMin: housingMin,
                housingBaseMax: housingMax,
                housingFundRateOptions: rateOptions,
                note: String(item.note || '').trim().slice(0, 200)
            });
        });
    }

    const codes = cities.map((c) => c.code);
    // 兜底城市不可删除：前端在未选择/所选城市被删时回落于此，缺失会让基数回落链断掉
    if (codes.length && !codes.includes(FALLBACK_CITY)) {
        errors.push(`城市列表：必须保留编码为 ${FALLBACK_CITY} 的兜底城市（未选择城市时的回落口径）`);
    }

    let defaultCity = String(src.defaultCity || '').trim();
    if (!defaultCity) {
        defaultCity = codes.includes(FALLBACK_CITY) ? FALLBACK_CITY : (codes[0] || FALLBACK_CITY);
    } else if (codes.length && !codes.includes(defaultCity)) {
        errors.push(`默认城市「${defaultCity}」不在城市列表中`);
    }

    if (errors.length) return { ok: false, errors, data: null };

    const constantsVersion = String(src.constantsVersion || '').trim().slice(0, 40)
        || DEFAULT_CITY_SOCIAL.constantsVersion;

    // 固定字段顺序 → revision 指纹稳定
    return {
        ok: true,
        errors: [],
        data: { constantsVersion, defaultCity, cities }
    };
}

// 解析 DB 行 → 配置对象
function parsePayload(row) {
    if (!row || !row.payload) return null;
    try {
        const parsed = JSON.parse(row.payload);
        return parsed && typeof parsed === 'object' && Array.isArray(parsed.cities) ? parsed : null;
    } catch (err) {
        return null;
    }
}

// 指纹：配置有实质变动时变化（供客户端 since 增量判断）
function revisionOf(config) {
    return crypto.createHash('md5').update(JSON.stringify(config)).digest('hex').slice(0, 12);
}

// 最新一份 published 快照
function latestPublished() {
    return prisma.citySocialConfig.findFirst({
        where: { status: 'published' },
        orderBy: [{ published_at: 'desc' }, { id: 'desc' }]
    });
}

function listHistory(take) {
    return prisma.citySocialConfig.findMany({
        orderBy: [{ published_at: 'desc' }, { id: 'desc' }],
        take: take || 30
    });
}

// 按编码取城市；未命中时回落兜底城市，再回落列表首项（保证调用方总能拿到一个可用口径）
function resolveCity(config, code) {
    const cities = (config && config.cities) || [];
    const wanted = String(code || '').trim();
    return cities.find((c) => c.code === wanted)
        || cities.find((c) => c.code === (config && config.defaultCity))
        || cities.find((c) => c.code === FALLBACK_CITY)
        || cities[0]
        || null;
}

// 构建公开载荷：库中无自定义配置（或配置已损坏无法解析）时回退出厂基线
// source 反映「实际下发的口径来源」而非「库里有没有行」：配置损坏时若仍标 custom，
// 会把「正拿出厂基线算账」这件事掩盖掉；运维可据 version 与 source 不一致定位损坏版本。
function buildPublicPayload(row) {
    const custom = parsePayload(row);
    const config = custom || DEFAULT_CITY_SOCIAL;
    return {
        version: row ? row.version : DEFAULT_CITY_SOCIAL.constantsVersion,
        revision: revisionOf(config),
        publishedAt: row ? row.published_at : null,
        note: row ? row.note : '',
        source: custom ? 'custom' : 'default',
        config
    };
}

module.exports = {
    DEFAULT_CITY_SOCIAL,
    FALLBACK_CITY,
    MAX_CITIES,
    MAX_RATE_OPTIONS,
    prepareCitySocial,
    parsePayload,
    revisionOf,
    latestPublished,
    listHistory,
    resolveCity,
    buildPublicPayload
};
