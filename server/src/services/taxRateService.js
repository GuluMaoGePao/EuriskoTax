// 阶段12 C1：税制参数配置化服务层（管理台热改税率）
//
// 职责：
//   1) 提供「出厂基线」DEFAULT_TAX_RATES —— 库中尚无自定义配置时公开端点的回退值，
//      同时也是管理台编辑器的初始值。数值须与前端 src/js/calculation/tax-constants.js 对齐
//      （该文件仍是断网离线时的最终兜底）。
//   2) 校验 + 归一化税率配置（纯函数，可单测）：防止管理台误填导致全站计税错误。
//   3) 读取最新 published 快照、生成 revision 指纹。
//
// 约定：
//   - 数组项统一为 { min?, max, rate, deduction }；无上限的 max 存 null（JSON 不支持 Infinity）。
//   - classificationTaxRates 为对象：{ [key]: { rate, name } }。
//   - payload 为 JSON 字符串，字段顺序经 normalize 固定，保证 revision 指纹稳定。
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const RATE_MAX = 1; // 个税税率上限（比例税率 100%）
const MAX_LEVELS = 15;

// 出厂基线：与 src/js/calculation/tax-constants.js 保持一致
const DEFAULT_TAX_RATES = {
    constantsVersion: '2026.1',
    comprehensiveTaxRates: [
        { min: 0, max: 36000, rate: 0.03, deduction: 0 },
        { min: 36000, max: 144000, rate: 0.10, deduction: 2520 },
        { min: 144000, max: 300000, rate: 0.20, deduction: 16920 },
        { min: 300000, max: 420000, rate: 0.25, deduction: 31920 },
        { min: 420000, max: 660000, rate: 0.30, deduction: 52920 },
        { min: 660000, max: 960000, rate: 0.35, deduction: 85920 },
        { min: 960000, max: null, rate: 0.45, deduction: 181920 }
    ],
    bonusMonthlyTaxRates: [
        { max: 3000, rate: 0.03, deduction: 0 },
        { max: 12000, rate: 0.10, deduction: 210 },
        { max: 25000, rate: 0.20, deduction: 1410 },
        { max: 35000, rate: 0.25, deduction: 2660 },
        { max: 55000, rate: 0.30, deduction: 4410 },
        { max: 80000, rate: 0.35, deduction: 7160 },
        { max: null, rate: 0.45, deduction: 15160 }
    ],
    businessTaxRates: [
        { max: 30000, rate: 0.05, deduction: 0 },
        { max: 90000, rate: 0.10, deduction: 1500 },
        { max: 300000, rate: 0.20, deduction: 10500 },
        { max: 500000, rate: 0.30, deduction: 40500 },
        { max: null, rate: 0.35, deduction: 65500 }
    ],
    classificationTaxRates: {
        interest: { rate: 0.20, name: '利息、股息、红利所得' },
        rent: { rate: 0.20, name: '财产租赁所得' },
        transfer: { rate: 0.20, name: '财产转让所得' },
        accidental: { rate: 0.20, name: '偶然所得' }
    },
    // 与前端 tax-constants.js 及表单初始默认基数一致：7546 元/月（默认值即最低标准）
    MIN_SOCIAL_SECURITY_BASE: 7546,
    MIN_HOUSING_FUND_BASE: 7546
};

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isBlank = (v) => v === null || v === undefined || v === '';
const toNum = (v) => (isBlank(v) ? NaN : Number(v));

// 阶梯型税率表（综合所得 / 月度 / 经营所得）校验 + 归一化
// hasMin=true 时要求每级有 min 且首级 min=0、相邻级严格衔接
function prepareBrackets(rows, label, { hasMin }) {
    const errors = [];
    if (!Array.isArray(rows) || rows.length === 0) {
        return { errors: [`${label}：不能为空`] };
    }
    if (rows.length > MAX_LEVELS) {
        return { errors: [`${label}：级数过多（≤${MAX_LEVELS}）`] };
    }

    const out = [];
    rows.forEach((raw, i) => {
        const tag = `${label} 第 ${i + 1} 级`;
        const item = raw || {};
        const rate = toNum(item.rate);
        const deduction = toNum(item.deduction);

        if (!isNum(rate) || rate <= 0 || rate > RATE_MAX) {
            errors.push(`${tag}：税率须在 (0, ${RATE_MAX}] 之间`);
        }
        if (!isNum(deduction) || deduction < 0) {
            errors.push(`${tag}：速算扣除数须 ≥ 0`);
        }

        let min = null;
        if (hasMin) {
            min = toNum(item.min);
            if (!isNum(min) || min < 0) errors.push(`${tag}：起征下限 min 须 ≥ 0`);
        }

        // 上限：最后一级允许 null（= 无上限）
        const isLast = i === rows.length - 1;
        let max = null;
        const noCap = isBlank(item.max); // 末级留空表示无上限（JSON 用 null；Infinity 无法序列化）
        if (isLast && noCap) {
            max = null;
        } else {
            max = toNum(item.max);
            if (!isNum(max) || max <= 0) {
                errors.push(`${tag}：上限 max 须为正数（仅最后一级可留空表示无上限）`);
            } else if (isNum(min) && max <= min) {
                errors.push(`${tag}：上限 max 须大于起征下限 min`);
            }
        }
        if (!isLast && noCap) {
            errors.push(`${tag}：仅最后一级可无上限`);
        }

        out.push(hasMin ? { min, max, rate, deduction } : { max, rate, deduction });
    });

    // 顺序 + 衔接 + 税率不降
    for (let i = 0; i < out.length; i++) {
        const cur = out[i];
        if (hasMin && i === 0 && cur.min !== 0) {
            errors.push(`${label}：第一级起征下限须为 0`);
        }
        if (i > 0) {
            const prev = out[i - 1];
            if (hasMin && isNum(prev.max) && prev.max !== cur.min) {
                errors.push(`${label} 第 ${i} 级与第 ${i + 1} 级不衔接（上一级上限应等于下一级起征下限）`);
            }
            if (!hasMin && isNum(prev.max) && isNum(cur.max) && cur.max <= prev.max) {
                errors.push(`${label}：第 ${i + 1} 级上限须大于上一级`);
            }
            if (isNum(prev.rate) && isNum(cur.rate) && cur.rate < prev.rate) {
                errors.push(`${label}：税率须随级数递增（第 ${i + 1} 级低于上一级）`);
            }
        }
    }

    return { errors, data: out };
}

// 校验并归一化整份税率配置
// 返回 { ok, errors, data }；ok=false 时 data 为 null
function prepareTaxRates(input) {
    const errors = [];
    const src = input || {};

    const comp = prepareBrackets(src.comprehensiveTaxRates, '综合所得税率表', { hasMin: true });
    errors.push(...comp.errors);
    const bonus = prepareBrackets(src.bonusMonthlyTaxRates, '月度税率表（年终奖单独计税）', { hasMin: false });
    errors.push(...bonus.errors);
    const biz = prepareBrackets(src.businessTaxRates, '经营所得税率表', { hasMin: false });
    errors.push(...biz.errors);

    // 分类所得（比例税率）
    let classOut = null;
    const cls = src.classificationTaxRates;
    if (!cls || typeof cls !== 'object' || Array.isArray(cls) || Object.keys(cls).length === 0) {
        errors.push('分类所得税率表：不能为空');
    } else {
        classOut = {};
        Object.keys(cls).forEach((key) => {
            const item = cls[key] || {};
            const rate = toNum(item.rate);
            if (!isNum(rate) || rate <= 0 || rate > RATE_MAX) {
                errors.push(`分类所得税率「${item.name || key}」：税率须在 (0, ${RATE_MAX}] 之间`);
            }
            classOut[key] = { rate, name: String(item.name || '').slice(0, 50) };
        });
    }

    const base = (v, label) => {
        const n = toNum(v);
        if (!isNum(n) || n < 0) {
            errors.push(`${label}：须为 ≥ 0 的数值`);
            return null;
        }
        return n;
    };
    const socialBase = base(src.MIN_SOCIAL_SECURITY_BASE, '社保缴费基数下限');
    const housingBase = base(src.MIN_HOUSING_FUND_BASE, '公积金缴费基数下限');

    if (errors.length) return { ok: false, errors, data: null };

    const constantsVersion = String(src.constantsVersion || '').trim().slice(0, 40) || DEFAULT_TAX_RATES.constantsVersion;

    // 固定字段顺序 → revision 指纹稳定
    const data = {
        constantsVersion,
        comprehensiveTaxRates: comp.data,
        bonusMonthlyTaxRates: bonus.data,
        businessTaxRates: biz.data,
        classificationTaxRates: classOut,
        MIN_SOCIAL_SECURITY_BASE: socialBase,
        MIN_HOUSING_FUND_BASE: housingBase
    };
    return { ok: true, errors: [], data };
}

// 解析 DB 行 → 配置对象（含旧版遗留的 Infinity 字符串兜底）
function parsePayload(row) {
    if (!row || !row.payload) return null;
    try {
        const parsed = JSON.parse(row.payload);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (err) {
        return null;
    }
}

// 指纹：配置有实质变动时变化（供客户端 since 增量判断）
function revisionOf(rates) {
    return crypto.createHash('md5').update(JSON.stringify(rates)).digest('hex').slice(0, 12);
}

// 最新一份 published 快照
function latestPublished() {
    return prisma.taxRateConfig.findFirst({
        where: { status: 'published' },
        orderBy: [{ published_at: 'desc' }, { id: 'desc' }]
    });
}

function listHistory(take) {
    return prisma.taxRateConfig.findMany({
        orderBy: [{ published_at: 'desc' }, { id: 'desc' }],
        take: take || 30
    });
}

// 构建公开载荷：库中无自定义配置时回退出厂基线
function buildPublicPayload(row) {
    const custom = parsePayload(row);
    const rates = custom || DEFAULT_TAX_RATES;
    return {
        version: row ? row.version : DEFAULT_TAX_RATES.constantsVersion,
        revision: revisionOf(rates),
        publishedAt: row ? row.published_at : null,
        note: row ? row.note : '',
        source: row ? 'custom' : 'default',
        rates
    };
}

module.exports = {
    DEFAULT_TAX_RATES,
    RATE_MAX,
    MAX_LEVELS,
    prepareTaxRates,
    parsePayload,
    revisionOf,
    latestPublished,
    listHistory,
    buildPublicPayload
};
