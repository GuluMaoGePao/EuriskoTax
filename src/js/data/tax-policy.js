// === 阶段11：内容中心「更新同步」 ===
//
// 数据模型：
//   tax-assistant.js 内置快照 window.TAX_ASSISTANT_QA 是离线全量基准（断网兜底）；
//   本模块维护服务端内容（ContentItem）作为「增量覆盖层」，按 id upsert：
//     - id 已存在 → 覆盖字段（远端为准）
//     - id 不存在 → push 到末尾
//     - deleted:true → 撤回条目（从数组移除）
//   合并结果连同「已应用条目快照」一起写入本地缓存，刷新页面后重放（阶段10B 仅缓存版本号，
//   导致刷新后内容丢失且 since 版本一致后再不拉取——阶段11 修复）。
//
// 阶段11 变更：
//   1) 政策要点对所有用户开放（含未登录游客），不再专业版专属；携带 token 时服务端按档位分层返回。
//   2) 新增 feed 同步：GET /api/content/feed（更新公告 / 运营内容），按展示位投放到启动弹窗、
//      首页公告条与个人中心公告列表。
//   3) 以 revision（内容指纹）替代 version 做增量判断；超过 STALE_MS 强制全量刷新，
//      保证「预约上线 / 到期自动下架 / 撤回」在下次拉取时即时生效。
//
// 加载顺序：需在 tax-assistant.js 之后（模块初始化时会重放缓存覆盖层）。
// 可测性：与 history-sync.js 一致——不直接依赖 DOM；fetch / window.apiClient 缺失时静默跳过。
(function () {
    'use strict';

    var CACHE_KEY = 'taxPolicyCache';
    var FEED_CACHE_KEY = 'contentFeedCache';
    var BANNER_SEEN_KEY = 'taxPolicyBannerSeen';
    var HOME_BANNER_SEEN_KEY = 'contentHomeBannerSeen';
    var MODAL_SEEN_KEY = 'contentModalSeen';

    var EVENT_UPDATED = 'euriskotax:policy-updated';
    var EVENT_FEED = 'euriskotax:content-feed-updated';

    var ENDPOINT = '/api/content/tax-policy';
    var FEED_ENDPOINT = '/api/content/feed';

    // 缓存的新鲜期：超过则丢弃 since 指纹强制全量刷新（自动过期/撤回才能落地）
    var STALE_MS = 10 * 60 * 1000;
    var MAX_SEEN_KEYS = 60;

    var busy = false;
    var feedBusy = false;
    var feedMemory = null;
    var baseSnapshot = null; // 内置快照基准（仅首次重建时捕获，用于幂等重放）

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
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(key, JSON.stringify(value));
            }
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

    function readCache() {
        var cache = readStore(CACHE_KEY, null);
        return cache && typeof cache === 'object' ? cache : null;
    }

    function readFeedCache() {
        if (feedMemory) return feedMemory;
        var cache = readStore(FEED_CACHE_KEY, null);
        return cache && typeof cache === 'object' ? cache : null;
    }

    function emit(name, detail) {
        try {
            if (typeof document !== 'undefined' && typeof CustomEvent === 'function') {
                document.dispatchEvent(new CustomEvent(name, { detail: detail }));
            }
        } catch (e) { /* ignore */ }
    }

    // ---------- 运行环境 ----------
    function getItems() {
        return (typeof window !== 'undefined' && window.TAX_ASSISTANT_QA) || null;
    }

    function apiBase() {
        if (typeof window !== 'undefined' && window.__EURISKO_SYNC_API_BASE__) {
            return String(window.__EURISKO_SYNC_API_BASE__).replace(/\/+$/, '');
        }
        return '';
    }

    function getToken() {
        try {
            if (typeof sessionStorage !== 'undefined') {
                var s = sessionStorage.getItem('auth_token');
                if (s) return s;
            }
        } catch (e) { /* ignore */ }
        try {
            if (typeof localStorage !== 'undefined') {
                var l = localStorage.getItem('auth_token');
                if (l) return l;
            }
        } catch (e) { /* ignore */ }
        return null;
    }

    function buildHeaders() {
        var headers = {};
        var token = getToken();
        if (token) headers['Authorization'] = 'Bearer ' + token;
        return headers;
    }

    function hasFetch() {
        return typeof fetch === 'function';
    }

    function isFresh(iso) {
        if (!iso) return false;
        var t = new Date(iso).getTime();
        if (!isFinite(t)) return false;
        return (Date.now() - t) < STALE_MS;
    }

    // ---------- 覆盖层应用 ----------
    function applyUpdates(items) {
        var qa = getItems();
        if (!Array.isArray(qa) || !Array.isArray(items)) return 0;

        var count = 0;
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            if (!item || !item.id) continue;

            var idx = -1;
            for (var j = 0; j < qa.length; j++) {
                if (qa[j] && qa[j].id === item.id) { idx = j; break; }
            }

            if (item.deleted) {
                if (idx !== -1) { qa.splice(idx, 1); count++; }
                continue;
            }

            if (idx === -1) {
                var clone = {};
                for (var k in item) { if (Object.prototype.hasOwnProperty.call(item, k)) clone[k] = item[k]; }
                delete clone.deleted;
                qa.push(clone);
                count++;
            } else {
                for (var key in item) {
                    if (!Object.prototype.hasOwnProperty.call(item, key)) continue;
                    if (key === 'deleted') continue;
                    qa[idx][key] = item[key];
                }
                count++;
            }
        }
        return count;
    }

    // 捕获内置快照基准（在应用任何覆盖层之前调用）
    function captureBase() {
        if (baseSnapshot) return;
        var qa = getItems();
        if (!Array.isArray(qa) || qa.length === 0) return;
        try {
            baseSnapshot = JSON.parse(JSON.stringify(qa));
        } catch (e) {
            baseSnapshot = null;
        }
    }

    // 以内置快照为基准重建，再应用覆盖层 → 幂等（重复重放/远端删条目都能得到正确结果）
    function rebuild(overrides) {
        captureBase();
        var qa = getItems();
        if (!baseSnapshot || !Array.isArray(qa)) return 0;
        qa.length = 0;
        for (var i = 0; i < baseSnapshot.length; i++) {
            qa.push(JSON.parse(JSON.stringify(baseSnapshot[i])));
        }
        return applyUpdates(overrides);
    }

    // ---------- 同步：政策要点 ----------
    function syncNow(opts) {
        opts = opts || {};
        if (busy) return Promise.resolve({ updated: false, reason: 'busy' });
        if (!hasFetch()) return Promise.resolve({ updated: false, reason: 'no-fetch' });

        var cache = readCache() || {};
        var url = apiBase() + ENDPOINT;
        // 指纹新鲜才做增量；否则强制全量（保证自动过期/撤回生效）
        if (!opts.force && cache.revision && isFresh(cache.checkedAt)) {
            url += (url.indexOf('?') === -1 ? '?' : '&') + 'since=' + encodeURIComponent(cache.revision);
        }

        busy = true;
        return fetch(url, { cache: 'no-store', headers: buildHeaders() })
            .then(function (res) {
                if (!res || !res.ok) throw new Error('policy sync failed: ' + (res ? res.status : 'no-response'));
                return res.json();
            })
            .then(function (payload) {
                var data = payload && payload.data;
                if (!data || typeof data.version !== 'string') throw new Error('policy payload malformed');

                var items = Array.isArray(data.items) ? data.items : [];
                var prevVersion = cache.version || null;
                var prevNotice = cache.notice || '';

                if (items.length === 0) {
                    // 与本地指纹一致 → 无变化，仅刷新时间戳
                    var next = {
                        version: data.version,
                        revision: data.revision || cache.revision || null,
                        notice: data.notice || prevNotice,
                        publishedAt: data.publishedAt || cache.publishedAt || null,
                        checkedAt: nowISO(),
                        updatedAt: cache.updatedAt || null,
                        updatedCount: cache.updatedCount || 0,
                        overrides: Array.isArray(cache.overrides) ? cache.overrides : []
                    };
                    writeStore(CACHE_KEY, next);
                    return { updated: false, version: data.version, reason: 'no-change' };
                }

                // 服务端每次返回「完整生效集合」→ 直接替换覆盖层（远端删条目也能被摘除）
                var overrides = items;
                var count = rebuild(overrides);
                var entry = {
                    version: data.version,
                    revision: data.revision || null,
                    notice: data.notice || '',
                    publishedAt: data.publishedAt || null,
                    checkedAt: nowISO(),
                    updatedAt: nowISO(),
                    updatedCount: count,
                    overrides: overrides
                };
                writeStore(CACHE_KEY, entry);

                var isNewVersion = (!prevVersion || prevVersion !== data.version);
                if (isNewVersion) {
                    emit(EVENT_UPDATED, { version: data.version, notice: entry.notice, count: count });
                }
                return { updated: true, version: data.version, count: count, notice: entry.notice, fresh: isNewVersion };
            })
            .catch(function (err) {
                return { updated: false, reason: 'error', error: err && err.message };
            })
            .then(function (result) {
                busy = false;
                return result;
            });
    }

    // ---------- 同步：公告 / 运营内容 ----------
    function syncFeed() {
        if (feedBusy) return Promise.resolve({ updated: false, reason: 'busy' });
        if (!hasFetch()) return Promise.resolve({ updated: false, reason: 'no-fetch' });

        feedBusy = true;
        return fetch(apiBase() + FEED_ENDPOINT, { cache: 'no-store', headers: buildHeaders() })
            .then(function (res) {
                if (!res || !res.ok) throw new Error('feed sync failed: ' + (res ? res.status : 'no-response'));
                return res.json();
            })
            .then(function (payload) {
                var data = payload && payload.data;
                if (!data) throw new Error('feed payload malformed');

                var items = Array.isArray(data.items) ? data.items : [];
                var prev = readFeedCache() || {};
                var changed = !prev.revision || prev.revision !== (data.revision || null) || !items.length === !(prev.items || []).length;

                var entry = {
                    version: data.version || null,
                    revision: data.revision || null,
                    checkedAt: nowISO(),
                    items: items
                };
                feedMemory = entry;
                writeStore(FEED_CACHE_KEY, entry);

                if (changed) {
                    emit(EVENT_FEED, { version: entry.version, count: items.length });
                }
                return { updated: changed, count: items.length, items: items };
            })
            .catch(function (err) {
                return { updated: false, reason: 'error', error: err && err.message };
            })
            .then(function (result) {
                feedBusy = false;
                return result;
            });
    }

    // 按展示位取本地已同步的公告/运营内容
    function getFeed(placement) {
        var cache = readFeedCache();
        var items = (cache && Array.isArray(cache.items)) ? cache.items : [];
        if (!placement) return items.slice();
        return items.filter(function (it) {
            return it && Array.isArray(it.placements) && it.placements.indexOf(placement) !== -1;
        });
    }

    // ---------- 未读 / 已读 ----------
    function isSeen(key, storeKey) {
        var seen = readStore(storeKey, []);
        return Array.isArray(seen) && seen.indexOf(key) !== -1;
    }

    function markSeen(key, storeKey) {
        var seen = readStore(storeKey, []);
        if (!Array.isArray(seen)) seen = [];
        if (seen.indexOf(key) === -1) seen.push(key);
        if (seen.length > MAX_SEEN_KEYS) seen = seen.slice(-MAX_SEEN_KEYS);
        writeStore(storeKey, seen);
    }

    var itemKey = function (it) {
        return it && it.id ? (it.id + ':' + (it.updatedAt || '')) : '';
    };

    // 启动弹窗待展示内容（modal 展示位且未读）
    function pendingModalNotices() {
        return getFeed('modal').filter(function (it) {
            var key = itemKey(it);
            return key && !isSeen(key, MODAL_SEEN_KEY);
        });
    }

    function markModalSeen(items) {
        (Array.isArray(items) ? items : []).forEach(function (it) {
            var key = itemKey(it);
            if (key) markSeen(key, MODAL_SEEN_KEY);
        });
    }

    // 首页公告条：取优先级最高且未关闭的一条（不依赖服务端排序）
    function homeBannerItem() {
        var list = getFeed('home_banner').filter(function (it) {
            var key = itemKey(it);
            return key && !isSeen(key, HOME_BANNER_SEEN_KEY) && (it.title || it.summary);
        });
        if (!list.length) return null;
        list.sort(function (a, b) {
            var pa = a && a.priority ? a.priority : 0;
            var pb = b && b.priority ? b.priority : 0;
            if (pb !== pa) return pb - pa;
            var ta = a && a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
            var tb = b && b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
            return tb - ta;
        });
        return list[0];
    }

    function dismissHomeBanner(item) {
        var key = itemKey(item);
        if (key) markSeen(key, HOME_BANNER_SEEN_KEY);
    }

    // 个人中心公告列表（含全部展示位的公告/运营内容，按发布时间倒序）
    function noticeList() {
        var cache = readFeedCache();
        var items = (cache && Array.isArray(cache.items)) ? cache.items.slice() : [];
        return items.sort(function (a, b) {
            var ta = a && a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
            var tb = b && b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
            if (tb !== ta) return tb - ta;
            return (b && b.priority ? b.priority : 0) - (a && a.priority ? a.priority : 0);
        });
    }

    // ---------- 提示条（税助手悬浮抽屉） ----------
    function needsBanner() {
        var cache = readCache();
        if (!cache || !cache.version) return false;
        var seen = readStore(BANNER_SEEN_KEY, null);
        return seen !== cache.version;
    }

    function markBannerSeen() {
        var cache = readCache();
        if (cache && cache.version) writeStore(BANNER_SEEN_KEY, cache.version);
    }

    function getCache() {
        return readCache();
    }

    function clearState() {
        [CACHE_KEY, FEED_CACHE_KEY, BANNER_SEEN_KEY, HOME_BANNER_SEEN_KEY, MODAL_SEEN_KEY, 'taxPolicyBannerSeen']
            .forEach(removeStore);
        baseSnapshot = null;
        feedMemory = null;
    }

    // 登录 / 恢复会话 / 启动时触发（游客亦同步，服务端只返回 all 档内容）
    function triggerSync() {
        syncFeed();
        return syncNow();
    }

    // 模块初始化：重放上次已应用的覆盖层（修复阶段10B「刷新后内容丢失」）
    (function replay() {
        var cache = readCache();
        if (!cache || !Array.isArray(cache.overrides) || cache.overrides.length === 0) return;
        try { rebuild(cache.overrides); } catch (e) { /* 快照不可用时跳过 */ }
    })();

    var api = {
        ENDPOINT: ENDPOINT,
        FEED_ENDPOINT: FEED_ENDPOINT,
        CACHE_KEY: CACHE_KEY,
        FEED_CACHE_KEY: FEED_CACHE_KEY,
        EVENT_UPDATED: EVENT_UPDATED,
        EVENT_FEED: EVENT_FEED,
        STALE_MS: STALE_MS,
        syncNow: syncNow,
        syncFeed: syncFeed,
        triggerSync: triggerSync,
        getFeed: getFeed,
        noticeList: noticeList,
        pendingModalNotices: pendingModalNotices,
        markModalSeen: markModalSeen,
        homeBannerItem: homeBannerItem,
        dismissHomeBanner: dismissHomeBanner,
        applyUpdates: applyUpdates,
        needsBanner: needsBanner,
        markBannerSeen: markBannerSeen,
        setBannerSeen: markBannerSeen, // 兼容旧调用（tax-assistant-ui.js 关闭横幅）
        getCache: getCache,
        clearState: clearState
    };

    if (typeof window !== 'undefined') window.TaxPolicy = api;
})();
