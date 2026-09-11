// === 阶段12 C1：税制参数「热更新」同步层 ===
//
// 背景：税率原本硬编码在 src/js/calculation/tax-constants.js（全局 var）。管理台热改税率后，
//       端上必须在「计算发生前」把这些全局变量替换为最新值。
//
// 数据流：
//   tax-constants.js（出厂基线，离线兜底）
//     → 本模块启动时「同步重放」localStorage 缓存（保证首屏计算即用最新值）
//     → 再异步 GET /api/config/tax-rates 拉取最新配置，校验后覆盖全局变量并回写缓存
//
// 约定：
//   - 后端 JSON 无法表达 Infinity，无上限用 null；本模块 normalize 时还原为 Infinity
//     （消费方以 `taxableIncome <= bracket.max` 匹配，末级必须为 Infinity）。
//   - 校验规则与 server/src/services/taxRateService.js 的 prepareTaxRates 保持一致：
//     后端是安全边界，这里做同一套预校验，避免坏数据污染端上计算。
//   - Service Worker 不拦截 /api，离线时只能靠 localStorage 缓存（本模块已落盘）。
//
// 加载顺序：必须在 tax-constants.js 之后、任何一次计算发生之前加载（index.html 紧随其后）。
(function () {
    'use strict';

    var CACHE_KEY = 'taxRatesCache';
    var ENDPOINT = '/api/config/tax-rates';
    var EVENT_UPDATED = 'euriskotax:tax-rates-updated';

    // 缓存新鲜期：超期则丢弃 since 指纹强制全量刷新
    var STALE_MS = 10 * 60 * 1000;
    var RATE_MAX = 1;
    var MAX_LEVELS = 15;

    var busy = false;
    var builtinSnapshot = null; // tax-constants.js 的出厂基线，供 clearState() 还原

    // ---------- 存储 ----------
    function readStore(key, fallback) {
        try {
            if (typeof localStorage === 'undefined') return fallback;
            var raw = localStorage.getItem(key);
            if (!raw) return fallback;
            var parsed = JSON.parse(raw);
            return parsed === null || parsed === undefined ? fallback : parsed;
        } catch (e) {
            return fallback;
        }
    }

    function writeStore(key, value) {
        try {
            if (typeof localStorage !== 'undefined') localStorage.setItem(key, JSON.stringify(value));
        } catch (e) { /* 隐私模式/配额不足时静默降级为内存态 */ }
    }

    function removeStore(key) {
        try {
            if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
        } catch (e) { /* ignore */ }
    }

    function nowISO() {
        try { return new Date().toISOString(); } catch (e) { return null; }
    }

    function emit(name, detail) {
        try {
            if (typeof document !== 'undefined' && typeof CustomEvent === 'function') {
                document.dispatchEvent(new CustomEvent(name, { detail: detail }));
            }
        } catch (e) { /* ignore */ }
    }

    function apiBase() {
        if (typeof window !== 'undefined' && window.__EURISKO_SYNC_API_BASE__) {
            return String(window.__EURISKO_SYNC_API_BASE__).replace(/\/+$/, '');
        }
        return '';
    }

    // ---------- 校验（与后端 prepareTaxRates 语义一致） ----------
    function isNum(v) { return typeof v === 'number' && isFinite(v); }
    function isBlank(v) { return v === null || v === undefined || v === ''; }
    function toNum(v) { return isBlank(v) ? NaN : Number(v); }

    // 阶梯型税率表校验 + 归一化：hasMin=true 用于综合所得（需 min 且首级为 0、相邻衔接）
    function prepareBrackets(rows, label, hasMin) {
        var errors = [];
        if (!Array.isArray(rows) || rows.length === 0) return { errors: [label + '：不能为空'] };
        if (rows.length > MAX_LEVELS) return { errors: [label + '：级数过多（≤' + MAX_LEVELS + '）'] };

        var out = [];
        rows.forEach(function (raw, i) {
            var tag = label + ' 第 ' + (i + 1) + ' 级';
            var item = raw || {};
            var rate = toNum(item.rate);
            var deduction = toNum(item.deduction);

            if (!isNum(rate) || rate <= 0 || rate > RATE_MAX) errors.push(tag + '：税率须在 (0, ' + RATE_MAX + '] 之间');
            if (!isNum(deduction) || deduction < 0) errors.push(tag + '：速算扣除数须 ≥ 0');

            var min = null;
            if (hasMin) {
                min = toNum(item.min);
                if (!isNum(min) || min < 0) errors.push(tag + '：起征下限 min 须 ≥ 0');
            }

            var isLast = i === rows.length - 1;
            var max = null;
            var noCap = isBlank(item.max) || item.max === Infinity; // 末级可用 Infinity 表示无上限
            if (isLast && noCap) {
                max = null;
            } else {
                max = toNum(item.max);
                if (!isNum(max) || max <= 0) {
                    errors.push(tag + '：上限 max 须为正数（仅最后一级可留空表示无上限）');
                } else if (isNum(min) && max <= min) {
                    errors.push(tag + '：上限 max 须大于起征下限 min');
                }
            }
            if (!isLast && noCap) errors.push(tag + '：仅最后一级可无上限');

            out.push(hasMin ? { min: min, max: max, rate: rate, deduction: deduction }
                : { max: max, rate: rate, deduction: deduction });
        });

        for (var i = 0; i < out.length; i++) {
            var cur = out[i];
            if (hasMin && i === 0 && cur.min !== 0) errors.push(label + '：第一级起征下限须为 0');
            if (i > 0) {
                var prev = out[i - 1];
                if (hasMin && isNum(prev.max) && prev.max !== cur.min) {
                    errors.push(label + ' 第 ' + i + ' 级与第 ' + (i + 1) + ' 级不衔接');
                }
                if (!hasMin && isNum(prev.max) && isNum(cur.max) && cur.max <= prev.max) {
                    errors.push(label + '：第 ' + (i + 1) + ' 级上限须大于上一级');
                }
                if (isNum(prev.rate) && isNum(cur.rate) && cur.rate < prev.rate) {
                    errors.push(label + '：税率须随级数递增（第 ' + (i + 1) + ' 级低于上一级）');
                }
            }
        }
        return { errors: errors, data: out };
    }

    // 校验 + 归一化：返回 { ok, errors, data }；data 中含 Infinity（已还原无上限）
    function prepare(rates) {
        var errors = [];
        var src = rates || {};

        var comp = prepareBrackets(src.comprehensiveTaxRates, '综合所得税率表', true);
        errors = errors.concat(comp.errors);
        var bonus = prepareBrackets(src.bonusMonthlyTaxRates, '月度税率表（年终奖单独计税）', false);
        errors = errors.concat(bonus.errors);
        var biz = prepareBrackets(src.businessTaxRates, '经营所得税率表', false);
        errors = errors.concat(biz.errors);

        var classOut = null;
        var cls = src.classificationTaxRates;
        if (!cls || typeof cls !== 'object' || Array.isArray(cls) || Object.keys(cls).length === 0) {
            errors.push('分类所得税率表：不能为空');
        } else {
            classOut = {};
            Object.keys(cls).forEach(function (key) {
                var item = cls[key] || {};
                var rate = toNum(item.rate);
                if (!isNum(rate) || rate <= 0 || rate > RATE_MAX) {
                    errors.push('分类所得税率「' + (item.name || key) + '」：税率须在 (0, ' + RATE_MAX + '] 之间');
                }
                classOut[key] = { rate: rate, name: String(item.name || '').slice(0, 50) };
            });
        }

        function base(v, label) {
            var n = toNum(v);
            if (!isNum(n) || n < 0) { errors.push(label + '：须为 ≥ 0 的数值'); return null; }
            return n;
        }
        var socialBase = base(src.MIN_SOCIAL_SECURITY_BASE, '社保缴费基数下限');
        var housingBase = base(src.MIN_HOUSING_FUND_BASE, '公积金缴费基数下限');

        if (errors.length) return { ok: false, errors: errors, data: null };

        var toBracket = function (b) { return { max: b.max === null ? Infinity : b.max, rate: b.rate, deduction: b.deduction }; };
        var compNorm = comp.data.map(function (b) { return { min: b.min, max: b.max === null ? Infinity : b.max, rate: b.rate, deduction: b.deduction }; });
        var bonusNorm = bonus.data.map(toBracket);
        var bizNorm = biz.data.map(toBracket);

        return {
            ok: true,
            errors: [],
            data: {
                constantsVersion: String(src.constantsVersion || '').trim().slice(0, 40) || undefined,
                comprehensiveTaxRates: compNorm,
                bonusMonthlyTaxRates: bonusNorm,
                businessTaxRates: bizNorm,
                classificationTaxRates: classOut,
                MIN_SOCIAL_SECURITY_BASE: socialBase,
                MIN_HOUSING_FUND_BASE: housingBase
            }
        };
    }

    function validate(rates) { return prepare(rates); }

    // 归一化：校验失败返回 null
    function normalize(rates) {
        var r = prepare(rates);
        return r.ok ? r.data : null;
    }

    // 还原为 JSON 安全形式（Infinity → null），用于写入 localStorage 缓存
    function toStorageRates(rates) {
        var clone = JSON.parse(JSON.stringify(rates, function (k, v) {
            return v === Infinity ? null : v;
        }));
        return clone;
    }

    // ---------- 应用到全局（计算事实来源） ----------
    function applyRates(rates) {
        var data = normalize(rates);
        if (!data || typeof window === 'undefined') return { ok: false, applied: 0 };

        window.comprehensiveTaxRates = data.comprehensiveTaxRates;
        window.bonusMonthlyTaxRates = data.bonusMonthlyTaxRates;
        window.businessTaxRates = data.businessTaxRates;
        window.classificationTaxRates = data.classificationTaxRates;
        window.MIN_SOCIAL_SECURITY_BASE = data.MIN_SOCIAL_SECURITY_BASE;
        window.MIN_HOUSING_FUND_BASE = data.MIN_HOUSING_FUND_BASE;
        if (data.constantsVersion) window.TAX_CONSTANTS_VERSION = data.constantsVersion;

        // 同步聚合出口（engine.js 读 .version；其余消费者用裸全局，保持两者一致）
        var C = window.EuriskoTaxConstants;
        if (C) {
            if (data.constantsVersion) C.version = data.constantsVersion;
            C.comprehensiveTaxRates = data.comprehensiveTaxRates;
            C.bonusMonthlyTaxRates = data.bonusMonthlyTaxRates;
            C.businessTaxRates = data.businessTaxRates;
            C.classificationTaxRates = data.classificationTaxRates;
            C.MIN_SOCIAL_SECURITY_BASE = data.MIN_SOCIAL_SECURITY_BASE;
            C.MIN_HOUSING_FUND_BASE = data.MIN_HOUSING_FUND_BASE;
        }
        return { ok: true, applied: 1, rates: data };
    }

    // 捕获出厂基线（仅首次，供还原）
    function captureBuiltin() {
        if (builtinSnapshot || typeof window === 'undefined') return;
        try {
            builtinSnapshot = {
                constantsVersion: window.TAX_CONSTANTS_VERSION,
                comprehensiveTaxRates: window.comprehensiveTaxRates,
                bonusMonthlyTaxRates: window.bonusMonthlyTaxRates,
                businessTaxRates: window.businessTaxRates,
                classificationTaxRates: window.classificationTaxRates,
                MIN_SOCIAL_SECURITY_BASE: window.MIN_SOCIAL_SECURITY_BASE,
                MIN_HOUSING_FUND_BASE: window.MIN_HOUSING_FUND_BASE
            };
        } catch (e) { builtinSnapshot = null; }
    }

    function getCache() {
        var cache = readStore(CACHE_KEY, null);
        return cache && typeof cache === 'object' ? cache : null;
    }

    // ---------- 同步 ----------
    function syncNow(opts) {
        opts = opts || {};
        if (busy) return Promise.resolve({ updated: false, reason: 'busy' });
        if (typeof fetch !== 'function') return Promise.resolve({ updated: false, reason: 'no-fetch' });

        var cache = getCache() || {};
        var url = apiBase() + ENDPOINT;
        if (!opts.force && cache.revision && isFresh(cache.checkedAt)) {
            url += (url.indexOf('?') === -1 ? '?' : '&') + 'since=' + encodeURIComponent(cache.revision);
        }

        busy = true;
        return fetch(url, { cache: 'no-store' })
            .then(function (res) {
                if (!res || !res.ok) throw new Error('tax-rates sync failed: ' + (res ? res.status : 'no-response'));
                return res.json();
            })
            .then(function (payload) {
                var data = payload && payload.data;
                if (!data) throw new Error('tax-rates payload malformed');

                var prevRevision = cache.revision || null;
                var nextRevision = data.revision || null;
                // 仅「已缓存过且指纹变化」才算真正的更新（首载不算变更，避免误报提示）
                var changed = !!prevRevision && prevRevision !== nextRevision;

                // since 命中 → rates 为 null，仅刷新时间戳
                var rates = data.rates;
                var applied = null;
                if (rates) {
                    applied = applyRates(rates);
                    if (!applied.ok) throw new Error('tax-rates payload invalid');
                }

                var entry = {
                    version: data.version || null,
                    revision: nextRevision,
                    publishedAt: data.publishedAt || null,
                    note: data.note || '',
                    source: data.source || 'custom',
                    checkedAt: nowISO(),
                    updatedAt: changed ? nowISO() : (cache.updatedAt || null),
                    rates: rates ? toStorageRates(applied.rates) : (cache.rates || null)
                };
                writeStore(CACHE_KEY, entry);

                if (rates && changed) {
                    emit(EVENT_UPDATED, { version: entry.version, note: entry.note, revision: entry.revision });
                }
                return { updated: changed, version: entry.version, revision: entry.revision, note: entry.note };
            })
            .catch(function (err) {
                return { updated: false, reason: 'error', error: err && err.message };
            })
            .then(function (result) {
                busy = false;
                return result;
            });
    }

    function isFresh(iso) {
        if (!iso) return false;
        var t = new Date(iso).getTime();
        if (!isFinite(t)) return false;
        return (Date.now() - t) < STALE_MS;
    }

    // 启动时重放缓存（同步执行，保证首屏计算即用最新税率）
    function replay() {
        var cache = getCache();
        if (!cache || !cache.rates) return 0;
        var r = applyRates(cache.rates);
        return r.ok ? 1 : 0;
    }

    // 排障：清除缓存并还原出厂基线
    function clearState() {
        removeStore(CACHE_KEY);
        if (builtinSnapshot) {
            try { applyRates(builtinSnapshot); } catch (e) { /* ignore */ }
        }
    }

    function getState() {
        var cache = getCache();
        if (!cache) return { source: 'builtin', version: (typeof window !== 'undefined' ? window.TAX_CONSTANTS_VERSION : null) };
        return {
            source: cache.source || 'custom',
            version: cache.version || null,
            revision: cache.revision || null,
            publishedAt: cache.publishedAt || null,
            note: cache.note || '',
            checkedAt: cache.checkedAt || null
        };
    }

    var api = {
        ENDPOINT: ENDPOINT,
        CACHE_KEY: CACHE_KEY,
        EVENT_UPDATED: EVENT_UPDATED,
        STALE_MS: STALE_MS,
        pure: { validate: validate, normalize: normalize, prepare: prepare, prepareBrackets: prepareBrackets },
        applyRates: applyRates,
        syncNow: syncNow,
        triggerSync: syncNow,
        replay: replay,
        clearState: clearState,
        getState: getState,
        getCache: getCache
    };

    if (typeof window !== 'undefined') window.TaxRates = api;

    captureBuiltin();
    replay();

    // 启动自动同步：load 后拉取最新配置（失败静默，缓存/基线兜底）
    (function boot() {
        if (typeof window === 'undefined' || typeof fetch !== 'function') return;
        if (typeof document !== 'undefined' && document.readyState === 'complete') {
            setTimeout(function () { syncNow(); }, 0);
        } else if (typeof window.addEventListener === 'function') {
            window.addEventListener('load', function () { syncNow(); });
        }
    })();
})();
