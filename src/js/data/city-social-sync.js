// === 阶段14 C2：城市社保参数库「热更新」同步层 ===
//
// 背景：社保/公积金缴费基数下限各城市差异极大（同一政策年份下可相差一倍以上），
//       此前全站统一用全国平均 7546（tax-constants.js 的 TODO(C2)），
//       会让高基数城市的用户被告知「基数合规」、低基数城市用户被误报「低于最低标准」。
//
// 数据流（与阶段12 C1 的 tax-rates-sync.js 同构）：
//   tax-constants.js（出厂基线，离线兜底）
//     → tax-rates-sync.js 覆盖全局 MIN_SOCIAL_SECURITY_BASE / MIN_HOUSING_FUND_BASE（全国口径）
//     → 本模块启动时「同步重放」localStorage 缓存 → 按用户所选城市覆盖上面两个全局量
//     → 再异步 GET /api/config/city-social 拉取最新配置，校验后覆盖并回写缓存
//
// 与 C1 的关键耦合（改这里前务必看懂）：
//   C1 与 C2 写的是同一对全局量（MIN_*）。C1 会在「税率配置指纹变化」时重新 applyRates，
//   从而把全局量写回全国口径。因此本模块监听 'euriskotax:tax-rates-updated' 事件并重新施加城市覆盖，
//   保证「城市口径」永远是最终生效值。脚本加载顺序也依赖这一点：
//     tax-constants.js → tax-rates-sync.js → city-social-sync.js（index.html 已如此安排）。
//
// 约定：
//   - 用户未选择城市 / 所选城市在新版本中被删除 → 回落 defaultCity → national → 保持 C1 的全国口径。
//   - 校验规则与 server/src/services/citySocialService.js 的 prepareCitySocial 保持一致：
//     后端是安全边界，这里做同一套预校验，避免坏数据污染端上校验提示。
//   - Service Worker 不拦截 /api，离线时只能靠 localStorage 缓存（本模块已落盘）。
//   - 「当前生效口径」通过 window.CITY_SOCIAL_ACTIVE 暴露（含 city 对象与 label），供 UI 展示。
(function () {
    'use strict';

    var CACHE_KEY = 'citySocialCache';
    var SELECTED_KEY = 'euriskotax_social_city';
    var ENDPOINT = '/api/config/city-social';
    var EVENT_UPDATED = 'euriskotax:city-social-updated';
    var EVENT_CITY_CHANGED = 'euriskotax:social-city-changed';
    // C1 税率配置更新事件：C1 会把 MIN_* 写回全国口径，本模块需在之后重新施加城市覆盖
    var TAX_RATES_UPDATED = 'euriskotax:tax-rates-updated';

    var STALE_MS = 10 * 60 * 1000;
    var MAX_CITIES = 200;
    var MAX_RATE_OPTIONS = 6;
    var CITY_CODE_RE = /^[a-z][a-z0-9_-]{1,31}$/;
    var FALLBACK_CITY = 'national';

    var busy = false;
    var activeConfig = null;      // 已校验的城市配置
    var activeRevision = null;    // 已应用配置的指纹
    var builtinBaselines = null;  // C1 施加后的全国口径基数，供 clearState() 还原

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

    // ---------- 校验（与后端 prepareCitySocial 语义一致） ----------
    function isNum(v) { return typeof v === 'number' && isFinite(v); }
    function isBlank(v) { return v === null || v === undefined || v === ''; }
    function toNum(v) { return isBlank(v) ? NaN : Number(v); }

    function prepareCities(rows) {
        var errors = [];
        if (!Array.isArray(rows) || rows.length === 0) return { errors: ['城市列表：不能为空'], data: null };
        if (rows.length > MAX_CITIES) return { errors: ['城市列表：城市过多（≤' + MAX_CITIES + '）'], data: null };

        var out = [];
        var seen = {};
        rows.forEach(function (raw, i) {
            var item = raw || {};
            var tag = '城市 第 ' + (i + 1) + ' 项';
            var code = String(item.code || '').trim();
            if (!CITY_CODE_RE.test(code)) {
                errors.push(tag + '：编码非法（须为小写字母开头，仅含小写字母/数字/_/-，长度 2-32）');
            } else if (seen[code]) {
                errors.push(tag + '：编码重复「' + code + '」');
            }
            seen[code] = true;

            var name = String(item.name || '').trim().slice(0, 50);
            if (!name) errors.push(tag + '：城市名称不能为空');

            function readBase(field, label, floor) {
                var n = toNum(item[field]);
                if (!isNum(n) || n < 0) { errors.push(label + '：须为 ≥ 0 的数值'); return null; }
                if (floor !== null && isNum(floor) && n < floor) errors.push(label + '：上限不得低于下限');
                return n;
            }
            // 上限留空 = 无上限；端上不参与比较，统一存 null
            function readMax(field, label, floor) {
                if (isBlank(item[field]) || item[field] === Infinity) return null;
                return readBase(field, label, floor);
            }
            var socialMin = readBase('socialBaseMin', (name || code) + ' 社保基数下限', null);
            var socialMax = readMax('socialBaseMax', (name || code) + ' 社保基数上限', socialMin);
            var housingMin = readBase('housingBaseMin', (name || code) + ' 公积金基数下限', null);
            var housingMax = readMax('housingBaseMax', (name || code) + ' 公积金基数上限', housingMin);

            var options = [5, 7];
            if (!isBlank(item.housingFundRateOptions)) {
                if (!Array.isArray(item.housingFundRateOptions) || item.housingFundRateOptions.length === 0) {
                    errors.push((name || code) + ' 公积金比例选项：须为非空数组');
                } else {
                    if (item.housingFundRateOptions.length > MAX_RATE_OPTIONS) {
                        errors.push((name || code) + ' 公积金比例选项：最多 ' + MAX_RATE_OPTIONS + ' 项');
                    }
                    var seenRate = [];
                    item.housingFundRateOptions.forEach(function (r) {
                        var n = toNum(r);
                        if (!isNum(n) || n <= 0 || n > 100) {
                            errors.push((name || code) + ' 公积金比例选项：比例须在 (0, 100] 之间');
                            return;
                        }
                        if (seenRate.indexOf(n) === -1) seenRate.push(n);
                    });
                    if (seenRate.length) options = seenRate.sort(function (a, b) { return a - b; });
                    else errors.push((name || code) + ' 公积金比例选项：至少保留一项合法比例');
                }
            }

            out.push({
                code: code,
                name: name,
                socialBaseMin: socialMin,
                socialBaseMax: socialMax,
                housingBaseMin: housingMin,
                housingBaseMax: housingMax,
                housingFundRateOptions: options,
                note: String(item.note || '').trim().slice(0, 200)
            });
        });

        var codes = out.map(function (c) { return c.code; });
        if (codes.length && codes.indexOf(FALLBACK_CITY) === -1) {
            errors.push('城市列表：必须保留编码为 ' + FALLBACK_CITY + ' 的兜底城市');
        }

        return { errors: errors, data: out, codes: codes };
    }

    // 校验 + 归一化：返回 { ok, errors, data }
    function prepare(config) {
        var src = config || {};
        var result = prepareCities(src.cities);
        var errors = result.errors.slice();
        var codes = result.codes || [];

        var defaultCity = String(src.defaultCity || '').trim();
        if (!defaultCity) {
            defaultCity = codes.indexOf(FALLBACK_CITY) !== -1 ? FALLBACK_CITY : (codes[0] || FALLBACK_CITY);
        } else if (codes.length && codes.indexOf(defaultCity) === -1) {
            errors.push('默认城市「' + defaultCity + '」不在城市列表中');
        }

        if (errors.length) return { ok: false, errors: errors, data: null };

        return {
            ok: true,
            errors: [],
            data: {
                constantsVersion: String(src.constantsVersion || '').trim().slice(0, 40) || undefined,
                defaultCity: defaultCity,
                cities: result.data
            }
        };
    }

    function validate(config) { return prepare(config); }
    function normalize(config) {
        var r = prepare(config);
        return r.ok ? r.data : null;
    }

    // 按编码取城市；未命中 → defaultCity → national → 列表首项（保证调用方总能拿到口径）
    function resolveCity(config, code) {
        if (!config || !Array.isArray(config.cities) || config.cities.length === 0) return null;
        var wanted = String(code || '').trim();
        function find(c) { return c.code === wanted; }
        var hit = wanted ? config.cities.filter(find)[0] : null;
        if (hit) return hit;
        hit = config.cities.filter(function (c) { return c.code === config.defaultCity; })[0];
        if (hit) return hit;
        hit = config.cities.filter(function (c) { return c.code === FALLBACK_CITY; })[0];
        return hit || config.cities[0];
    }

    // ---------- 城市选择 ----------
    function getSelectedCode() {
        var saved = readStore(SELECTED_KEY, null);
        return saved && typeof saved === 'string' ? saved : '';
    }

    // 用户显式选择参保城市（传空字符串 = 恢复「未选择」）
    function selectCity(code) {
        var next = String(code || '').trim();
        if (next) writeStore(SELECTED_KEY, next);
        else removeStore(SELECTED_KEY);
        var applied = applyCityBaselines();
        emit(EVENT_CITY_CHANGED, applied);
        return applied;
    }

    // ---------- 应用到全局（计算事实来源） ----------
    // 把「选中城市」的基数下限写入 C1 的全局量（helper-functions.js 的合规提示直接读它们）
    function applyCityBaselines() {
        if (typeof window === 'undefined') return { ok: false, city: null, source: 'none' };
        var code = getSelectedCode();
        var city = resolveCity(activeConfig, code);

        if (!city) {
            // 无城市配置（或配置损坏）→ 保持 C1 的全国口径
            window.CITY_SOCIAL_ACTIVE = null;
            return { ok: true, city: null, source: 'global', matched: false };
        }

        var matched = !!code && city.code === code;
        if (isNum(city.socialBaseMin)) window.MIN_SOCIAL_SECURITY_BASE = city.socialBaseMin;
        if (isNum(city.housingBaseMin)) window.MIN_HOUSING_FUND_BASE = city.housingBaseMin;

        var C = window.EuriskoTaxConstants;
        if (C) {
            if (isNum(city.socialBaseMin)) C.MIN_SOCIAL_SECURITY_BASE = city.socialBaseMin;
            if (isNum(city.housingBaseMin)) C.MIN_HOUSING_FUND_BASE = city.housingBaseMin;
        }

        window.CITY_SOCIAL_ACTIVE = {
            code: city.code,
            name: city.name,
            socialBaseMin: city.socialBaseMin,
            socialBaseMax: city.socialBaseMax,
            housingBaseMin: city.housingBaseMin,
            housingBaseMax: city.housingBaseMax,
            housingFundRateOptions: city.housingFundRateOptions,
            // matched=false 表示「用户所选城市已不存在，已回落」，UI 可据此提示
            matched: matched,
            requested: code || null
        };
        return { ok: true, city: city, source: city.code === FALLBACK_CITY ? 'fallback' : 'city', matched: matched };
    }

    function applyConfig(config) {
        var data = normalize(config);
        if (!data) return { ok: false, applied: 0 };
        activeConfig = data;
        applyCityBaselines();
        return { ok: true, applied: 1, config: data };
    }

    // 捕获 C1 施加后的全国口径基数（仅首次，供还原）
    function captureBuiltin() {
        if (builtinBaselines || typeof window === 'undefined') return;
        try {
            builtinBaselines = {
                MIN_SOCIAL_SECURITY_BASE: window.MIN_SOCIAL_SECURITY_BASE,
                MIN_HOUSING_FUND_BASE: window.MIN_HOUSING_FUND_BASE
            };
        } catch (e) { builtinBaselines = null; }
    }

    function getCache() {
        var cache = readStore(CACHE_KEY, null);
        return cache && typeof cache === 'object' ? cache : null;
    }

    function isFresh(iso) {
        if (!iso) return false;
        var t = new Date(iso).getTime();
        if (!isFinite(t)) return false;
        return (Date.now() - t) < STALE_MS;
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
                if (!res || !res.ok) throw new Error('city-social sync failed: ' + (res ? res.status : 'no-response'));
                return res.json();
            })
            .then(function (payload) {
                var data = payload && payload.data;
                if (!data) throw new Error('city-social payload malformed');

                var prevRevision = cache.revision || null;
                var nextRevision = data.revision || null;
                // 仅「已缓存过且指纹变化」才算真正的更新（首载不算变更，避免误报提示）
                var changed = !!prevRevision && prevRevision !== nextRevision;

                // since 命中 → config 为 null，仅刷新时间戳
                var config = data.config;
                var applied = null;
                if (config) {
                    applied = applyConfig(config);
                    if (!applied.ok) throw new Error('city-social payload invalid');
                } else if (activeConfig) {
                    // 已缓存过配置：即便本轮未下发，也要重新施加一次城市覆盖
                    // （C1 的税率同步可能刚刚把 MIN_* 写回全国口径）
                    applied = { ok: true, applied: 0 };
                    applyCityBaselines();
                }

                var entry = {
                    version: data.version || null,
                    revision: nextRevision,
                    publishedAt: data.publishedAt || null,
                    note: data.note || '',
                    source: data.source || 'custom',
                    checkedAt: nowISO(),
                    updatedAt: changed ? nowISO() : (cache.updatedAt || null),
                    config: config ? applied.config : (cache.config || null)
                };
                writeStore(CACHE_KEY, entry);

                if (config && changed) {
                    emit(EVENT_UPDATED, {
                        version: entry.version,
                        note: entry.note,
                        revision: entry.revision,
                        active: window.CITY_SOCIAL_ACTIVE || null
                    });
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

    // 启动时重放缓存（同步执行，保证首屏计算即用所选城市口径）
    function replay() {
        var cache = getCache();
        if (cache && cache.config) {
            var r = applyConfig(cache.config);
            if (r.ok) {
                activeRevision = cache.revision || null;
                return 1;
            }
        }
        // 无缓存：仍要按已保存的城市选择施加一次（可能只有选择、没有配置）
        applyCityBaselines();
        return 0;
    }

    // 重新施加当前城市口径（供 C1 更新后、或 UI 主动刷新时调用）
    function reapply() {
        return applyCityBaselines();
    }

    // 排障：清除缓存与城市选择并还原 C1 的全国口径
    function clearState() {
        removeStore(CACHE_KEY);
        removeStore(SELECTED_KEY);
        activeConfig = null;
        activeRevision = null;
        if (typeof window !== 'undefined') window.CITY_SOCIAL_ACTIVE = null;
        if (builtinBaselines && typeof window !== 'undefined') {
            window.MIN_SOCIAL_SECURITY_BASE = builtinBaselines.MIN_SOCIAL_SECURITY_BASE;
            window.MIN_HOUSING_FUND_BASE = builtinBaselines.MIN_HOUSING_FUND_BASE;
            var C = window.EuriskoTaxConstants;
            if (C) {
                C.MIN_SOCIAL_SECURITY_BASE = builtinBaselines.MIN_SOCIAL_SECURITY_BASE;
                C.MIN_HOUSING_FUND_BASE = builtinBaselines.MIN_HOUSING_FUND_BASE;
            }
        }
    }

    function getCities() {
        return activeConfig ? activeConfig.cities.slice(0) : [];
    }

    function getCity(code) {
        return resolveCity(activeConfig, code);
    }

    function getState() {
        var cache = getCache();
        return {
            source: cache ? (cache.source || 'custom') : 'builtin',
            version: cache ? (cache.version || null) : null,
            revision: cache ? (cache.revision || null) : null,
            publishedAt: cache ? (cache.publishedAt || null) : null,
            note: cache ? (cache.note || '') : '',
            checkedAt: cache ? (cache.checkedAt || null) : null,
            selectedCity: getSelectedCode() || null,
            activeCity: (typeof window !== 'undefined' && window.CITY_SOCIAL_ACTIVE) || null,
            cityCount: activeConfig ? activeConfig.cities.length : 0
        };
    }

    var api = {
        ENDPOINT: ENDPOINT,
        CACHE_KEY: CACHE_KEY,
        SELECTED_KEY: SELECTED_KEY,
        EVENT_UPDATED: EVENT_UPDATED,
        EVENT_CITY_CHANGED: EVENT_CITY_CHANGED,
        STALE_MS: STALE_MS,
        FALLBACK_CITY: FALLBACK_CITY,
        pure: { validate: validate, normalize: normalize, prepare: prepare, resolveCity: resolveCity },
        applyConfig: applyConfig,
        syncNow: syncNow,
        triggerSync: syncNow,
        replay: replay,
        reapply: reapply,
        selectCity: selectCity,
        getSelectedCode: getSelectedCode,
        getCities: getCities,
        getCity: getCity,
        clearState: clearState,
        getState: getState,
        getCache: getCache
    };

    if (typeof window !== 'undefined') window.CitySocial = api;

    captureBuiltin();
    replay();

    // C1 更新税率后会重写 MIN_*（全国口径），必须在其之后重新施加城市覆盖，
    // 保证「城市口径」始终是最终生效值（否则高基数城市用户会看到全国平均的误报）
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
        document.addEventListener(TAX_RATES_UPDATED, function () {
            reapply();
        });
    }

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
