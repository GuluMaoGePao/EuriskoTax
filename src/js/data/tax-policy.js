// === 阶段10B：税务政策要点「更新同步」 ===
//
// 数据模型（与 stage10 计划 §5.2 对齐）：
//   tax-assistant.js 内置快照 window.TAX_ASSISTANT_QA 是离线全量基准（免费版仅用它）；
//   本模块负责"专业版增量更新"：登录后静默拉取 GET /api/content/tax-policy，
//   服务端返回同结构的更新条目（id 与内置条目一一对应 or 全新条目），客户端按 id upsert：
//     - id 已存在 → 覆盖更新字段（新增的 tag/updatedAt 等透传）
//     - id 不存在 → push 到末尾
//     - deleted:true → 撤回内置条目（从数组中移除）
//   合并结果写本地缓存 taxPolicyCache（版本 + notice），供「政策已更新」提示条读取。
//
// 加载顺序：需在 tax-assistant.js 之后（运行时才读写 window.TAX_ASSISTANT_QA，不依赖加载时机）。
// 可测性：与 history-sync.js 一致——不直接依赖 DOM；fetch / window.apiClient 缺失时静默跳过。

(function () {
    'use strict';

    var CACHE_KEY = 'taxPolicyCache';
    var SEEN_KEY = 'taxPolicyBannerSeen';
    var EVENT_UPDATED = 'euriskotax:policy-updated';
    var ENDPOINT = '/api/content/tax-policy';

    // 内部状态
    var busy = false;
    var memoryCache = null; // 会话内缓存（避免每次读 localStorage）

    // 与云同步引擎共用 API 基址覆盖开关（沙箱 / 联调注入）
    function apiBase() {
        var override = (typeof window !== 'undefined' && window.__EURISKO_SYNC_API_BASE__) || '';
        return override;
    }

    function readStore(key, fallback) {
        try {
            if (typeof localStorage === 'undefined') return fallback;
            var raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch (e) {
            return fallback;
        }
    }

    function writeStore(key, val) {
        try {
            if (typeof localStorage === 'undefined') return;
            localStorage.setItem(key, JSON.stringify(val));
        } catch (e) {
            /* 隐私模式/配额满时静默 */
        }
    }

    // 当前登录用户是否专业版（无 apiClient 时回退读存储，仍不可得则 false）
    function getCurrentUser() {
        try {
            if (typeof window !== 'undefined' && window.apiClient && typeof window.apiClient.getCurrentUser === 'function') {
                return window.apiClient.getCurrentUser() || null;
            }
            return readStore('current_user', null);
        } catch (e) {
            return null;
        }
    }

    function isProActive() {
        var user = getCurrentUser();
        if (!user) return false;
        var planLib = (typeof window !== 'undefined') ? window.EuriskoPlan : null;
        if (!planLib || typeof planLib.isPro !== 'function') return false;
        return planLib.isPro(user.plan, user.plan_expires_at);
    }

    function nowISO() {
        return new Date().toISOString();
    }

    function readCache() {
        if (memoryCache) return memoryCache;
        memoryCache = readStore(CACHE_KEY, null);
        return memoryCache;
    }

    function setCache(cache) {
        memoryCache = cache;
        writeStore(CACHE_KEY, cache);
    }

    function getItems() {
        return (typeof window !== 'undefined' && window.TAX_ASSISTANT_QA) || null;
    }

    // 合并远端更新条目到内置快照。返回合并条数。
    function applyUpdates(updates) {
        var qa = getItems();
        if (!qa || !Array.isArray(qa) || !Array.isArray(updates)) return 0;
        var index = {};
        for (var i = 0; i < qa.length; i++) {
            if (qa[i] && qa[i].id) index[qa[i].id] = i;
        }
        var count = 0;
        updates.forEach(function (u) {
            if (!u || !u.id) return;
            if (u.deleted === true) {
                if (typeof index[u.id] === 'number') {
                    qa.splice(index[u.id], 1);
                    delete index[u.id];
                    count++;
                }
                return;
            }
            var at = index[u.id];
            if (typeof at === 'number') {
                // 已存在：覆盖更新字段（远端为准）
                var target = qa[at];
                Object.keys(u).forEach(function (k) { target[k] = u[k]; });
            } else {
                qa.push(u);
                index[u.id] = qa.length - 1;
            }
            count++;
        });
        return count;
    }

    // 远端拉取并合并（静默失败）。免费版直接返回 resolved（不用内置快照以外的数据）。
    function syncNow() {
        if (!isProActive()) {
            return Promise.resolve({ updated: false, reason: 'free' });
        }
        if (busy) return Promise.resolve({ updated: false, reason: 'busy' });
        busy = true;

        var cache = readCache() || {};
        var url = apiBase() + ENDPOINT;
        if (cache.version) {
            url += (url.indexOf('?') === -1 ? '?' : '&') + 'since=' + encodeURIComponent(cache.version);
        }

        var result;
        return fetch(url, { cache: 'no-store' })
            .then(function (res) {
                if (!res.ok) {
                    var err = new Error('政策内容请求失败 HTTP ' + res.status);
                    err.status = res.status;
                    throw err;
                }
                return res.json();
            })
            .then(function (payload) {
                var data = payload && payload.data;
                if (!data || typeof data.version !== 'string') {
                    throw new Error('政策内容格式异常');
                }
                var items = Array.isArray(data.items) ? data.items : [];
                var prevVersion = cache.version || null;
                var prevNotice = cache.notice || '';
                if (items.length === 0) {
                    // 与本地版本一致 → 无更新，仅刷新 checkedAt
                    setCache({
                        version: data.version,
                        notice: data.notice || prevNotice,
                        publishedAt: data.publishedAt || cache.publishedAt || null,
                        checkedAt: nowISO()
                    });
                    return { updated: false, version: data.version, reason: 'no-change' };
                }
                var count = applyUpdates(items);
                var cacheEntry = {
                    version: data.version,
                    notice: data.notice || '',
                    publishedAt: data.publishedAt || null,
                    checkedAt: nowISO(),
                    updatedAt: nowISO(),
                    updatedCount: count
                };
                setCache(cacheEntry);
                // 版本前进且确实有新增/变更时通知 UI（横幅/测试监听）
                var fresh = (!prevVersion || prevVersion !== data.version);
                if (typeof document !== 'undefined' && typeof CustomEvent === 'function' && fresh) {
                    document.dispatchEvent(new CustomEvent(EVENT_UPDATED, {
                        detail: { version: data.version, notice: cacheEntry.notice, count: count }
                    }));
                }
                return { updated: true, version: data.version, count: count, notice: cacheEntry.notice, fresh: fresh };
            })
            .catch(function (err) {
                if (typeof console !== 'undefined') {
                    console.warn('[policy] 政策更新拉取失败（静默）:', err && err.message ? err.message : err);
                }
                return { updated: false, reason: 'network', error: err };
            })
            .then(function (r) {
                busy = false;
                return r;
            });
    }

    // === 横幅「政策已更新」状态 ===
    function getCache() { return readCache(); }

    // 是否有尚未关闭的更新提示（版本高于上次 seen，且同步确实落过地）
    function needsBanner() {
        var cache = readCache();
        if (!cache || !cache.version) return false;
        var seen = readStore(SEEN_KEY, null);
        if (seen && seen === cache.version) return false;
        return true;
    }

    function setBannerSeen() {
        var cache = readCache();
        if (cache && cache.version) writeStore(SEEN_KEY, cache.version);
    }

    // 登出/注销时清理（退出后横幅不再显示当前会话的更新）
    function clearState() {
        memoryCache = null;
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.removeItem(CACHE_KEY);
                localStorage.removeItem(SEEN_KEY);
            }
        } catch (e) { /* ignore */ }
    }

    window.TaxPolicy = {
        EVENT_UPDATED: EVENT_UPDATED,
        syncNow: syncNow,
        applyUpdates: applyUpdates,
        isProActive: isProActive,
        getCurrentUser: getCurrentUser,
        getCache: getCache,
        needsBanner: needsBanner,
        setBannerSeen: setBannerSeen,
        clearState: clearState,
        CACHE_KEY: CACHE_KEY
    };
})();
