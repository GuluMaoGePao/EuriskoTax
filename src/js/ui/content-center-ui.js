// === 阶段11：内容中心 UI ===
//
// 消费 window.TaxPolicy（tax-policy.js）同步到的公告 / 运营内容，落地三个展示位：
//   1) 启动弹窗   —— placements 含 modal 且未读（关闭后按「id:updatedAt」标记已读）
//   2) 首页公告条 —— placements 含 home_banner 的优先级最高一条，可关闭
//   3) 个人中心列表 —— 由个人中心「公告与更新」卡片调用 openNoticeList() 打开
// 另：税助手悬浮抽屉的「政策要点已更新」提示条仍由 tax-assistant-ui.js 复用 TaxPolicy.needsBanner()。
//
// 依赖：仅在 window.TaxPolicy 存在时工作；openModal/closeModal 由 auth-ui.js 提供（此处做降级兜底）。
(function () {
    'use strict';

    var MODAL_ID = 'content-notice-modal';
    var HOME_BANNER_ID = 'content-home-banner';
    var STARTUP_DELAY_MS = 1500;
    var READY_POLL_MS = 400;
    var READY_MAX_TRIES = 25;

    var ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    function esc(value) {
        return String(value === null || value === undefined ? '' : value)
            .replace(/[&<>"']/g, function (c) { return ESCAPE_MAP[c]; });
    }

    function fmtDate(iso) {
        if (!iso) return '';
        var d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        var p = function (n) { return n < 10 ? '0' + n : '' + n; };
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    }

    function tp() {
        return (typeof window !== 'undefined' && window.TaxPolicy) || null;
    }

    function openModalSafe(modal) {
        if (!modal) return;
        if (typeof window.openModal === 'function') { window.openModal(modal); return; }
        modal.classList.remove('hidden');
        if (modal.parentNode && modal.parentNode !== document.body) document.body.appendChild(modal);
        setTimeout(function () { modal.classList.remove('opacity-0'); }, 10);
    }

    function closeModalSafe(modal) {
        if (!modal) return;
        if (typeof window.closeModal === 'function') { window.closeModal(modal); return; }
        modal.classList.add('opacity-0');
        setTimeout(function () { modal.classList.add('hidden'); }, 300);
    }

    // ---------- 公告弹窗 ----------
    function noticeCardHTML(item) {
        var title = item.title || item.summary || '更新公告';
        var meta = [];
        if (item.publishedAt) meta.push(fmtDate(item.publishedAt));
        if (item.type === 'operation') meta.push('运营活动');
        else if (item.type === 'announcement') meta.push('版本公告');

        var link = '';
        if (item.linkUrl) {
            link = '<a href="' + esc(item.linkUrl) + '" target="_blank" rel="noopener" ' +
                'class="inline-flex items-center text-xs text-primary hover:underline mt-2">' +
                esc(item.linkText || '查看详情') + '<i class="fa fa-angle-right ml-1"></i></a>';
        }

        return '<div class="border border-gray-200 rounded-lg p-3.5 bg-gray-50/60">' +
            '<div class="flex items-start justify-between gap-2">' +
            '<h4 class="text-sm font-semibold text-gray-800 flex-1">' + esc(title) + '</h4>' +
            (meta.length ? '<span class="text-[11px] text-gray-400 shrink-0">' + esc(meta.join(' · ')) + '</span>' : '') +
            '</div>' +
            (item.summary && item.summary !== title ? '<p class="text-xs text-gray-600 mt-1.5 leading-relaxed">' + esc(item.summary) + '</p>' : '') +
            (item.body ? '<p class="text-xs text-gray-500 mt-1.5 leading-relaxed whitespace-pre-wrap">' + esc(item.body) + '</p>' : '') +
            link +
            '</div>';
    }

    function ensureModalBindings(modal) {
        if (!modal || modal.dataset.ccBound === '1') return;
        modal.dataset.ccBound = '1';

        var close = function () { closeModalSafe(modal); };
        var backdrop = modal;
        backdrop.addEventListener('click', function (e) { if (e.target === backdrop) close(); });

        var closeBtn = modal.querySelector('#' + MODAL_ID + '-close');
        var okBtn = modal.querySelector('#' + MODAL_ID + '-ok');
        if (closeBtn) closeBtn.addEventListener('click', close);
        if (okBtn) okBtn.addEventListener('click', close);
    }

    var modalMarkSeenItems = [];

    function openNoticeModal(items, opts) {
        opts = opts || {};
        var modal = document.getElementById(MODAL_ID);
        if (!modal) return;
        var list = modal.querySelector('#' + MODAL_ID + '-list');
        var titleEl = modal.querySelector('#' + MODAL_ID + '-title');
        if (!list) return;

        if (titleEl) titleEl.innerHTML = '<i class="fa fa-bullhorn mr-2"></i>' + esc(opts.title || '更新公告');

        var sorted = (Array.isArray(items) ? items.slice() : []).sort(function (a, b) {
            var ta = a && a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
            var tb = b && b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
            return tb - ta;
        });

        list.innerHTML = sorted.length
            ? sorted.map(noticeCardHTML).join('')
            : '<p class="text-sm text-gray-400 text-center py-8">暂无公告内容</p>';

        modalMarkSeenItems = opts.markSeen ? sorted : [];
        // 关闭时标记已读（覆盖点关闭按钮 / 点遮罩 / 点确定三条路径）
        modal.addEventListener('click', function onAnyClick(e) {
            if (e.target === modal) { flushSeen(); modal.removeEventListener('click', onAnyClick); }
        });
        var closeBtn = modal.querySelector('#' + MODAL_ID + '-close');
        var okBtn = modal.querySelector('#' + MODAL_ID + '-ok');
        if (closeBtn) closeBtn.addEventListener('click', flushSeen, { once: true });
        if (okBtn) okBtn.addEventListener('click', flushSeen, { once: true });

        ensureModalBindings(modal);
        openModalSafe(modal);
    }

    function flushSeen() {
        var api = tp();
        if (api && api.markModalSeen && modalMarkSeenItems.length) {
            api.markModalSeen(modalMarkSeenItems);
        }
        modalMarkSeenItems = [];
    }

    // ---------- 启动弹窗 ----------
    var startupDone = false;

    function appReady() {
        var container = document.getElementById('app-container');
        if (!container || container.classList.contains('hidden')) return false;
        if (typeof document.body.classList.contains === 'function' && !document.body.classList.contains('auth-ready')) return false;
        return true;
    }

    function maybeShowStartupModal() {
        if (startupDone) return;
        var api = tp();
        if (!api || !api.pendingModalNotices) return;
        if (!appReady()) return;

        var items = api.pendingModalNotices();
        if (!items.length) { startupDone = true; return; }

        startupDone = true;
        openNoticeModal(items, { title: '更新公告', markSeen: true });
    }

    function scheduleStartupModal() {
        setTimeout(function () {
            maybeShowStartupModal();
            if (startupDone) return;
            // 未就绪（仍在登录页 / auth-ui 未挂载）则轮询若干次
            var tries = 0;
            var timer = setInterval(function () {
                tries++;
                maybeShowStartupModal();
                if (startupDone || tries >= READY_MAX_TRIES) clearInterval(timer);
            }, READY_POLL_MS);
        }, STARTUP_DELAY_MS);
    }

    // ---------- 首页公告条 ----------
    function renderHomeBanner() {
        var host = document.getElementById(HOME_BANNER_ID);
        if (!host) return;

        var api = tp();
        var item = api && api.homeBannerItem ? api.homeBannerItem() : null;
        if (!item) {
            host.innerHTML = '';
            host.classList.add('hidden');
            return;
        }

        var title = item.title || item.summary || '更新公告';
        host.classList.remove('hidden');
        host.innerHTML =
            '<div class="mb-3 flex items-start gap-3 rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-3.5">' +
            '<div class="w-9 h-9 rounded-lg bg-amber-500 flex items-center justify-center shrink-0">' +
            '<i class="fa fa-bullhorn text-white"></i></div>' +
            '<div class="flex-1 min-w-0 cursor-pointer" data-content-banner-open>' +
            '<p class="text-sm font-semibold text-amber-900">' + esc(title) + '</p>' +
            (item.summary && item.summary !== title
                ? '<p class="text-xs text-amber-700 mt-0.5 leading-relaxed">' + esc(item.summary) + '</p>'
                : '') +
            '</div>' +
            '<button type="button" data-content-banner-close class="w-7 h-7 rounded-full text-amber-500 hover:bg-amber-100 flex items-center justify-center shrink-0" aria-label="关闭公告">' +
            '<i class="fa fa-times text-xs"></i></button>' +
            '</div>';

        var dismiss = host.querySelector('[data-content-banner-close]');
        if (dismiss) {
            dismiss.addEventListener('click', function (e) {
                e.stopPropagation();
                if (api && api.dismissHomeBanner) api.dismissHomeBanner(item);
                host.innerHTML = '';
                host.classList.add('hidden');
            });
        }

        var open = host.querySelector('[data-content-banner-open]');
        if (open) {
            open.addEventListener('click', function () {
                openNoticeModal([item], { title: '更新公告', markSeen: false });
            });
        }
    }

    // ---------- 个人中心公告列表 ----------
    function openNoticeList(retried) {
        var api = tp();
        var items = api && api.noticeList ? api.noticeList() : [];
        if (!items.length && !retried && api && typeof api.syncFeed === 'function') {
            // 尚未同步过（如刚登录）→ 先拉一次再展示；只重试一次，
            // 否则服务端确实无内容时会无限递归发起 /content/feed 请求
            api.syncFeed().then(function () { openNoticeList(true); });
            return;
        }
        openNoticeModal(items, { title: '公告与更新', markSeen: false });
    }

    // ---------- 事件绑定与初始化 ----------
    function bind() {
        document.addEventListener('euriskotax:content-feed-updated', function () {
            renderHomeBanner();
            maybeShowStartupModal();
        });
        document.addEventListener('euriskotax:policy-updated', function () {
            renderHomeBanner();
        });
    }

    function init() {
        if (!tp()) return;
        bind();
        renderHomeBanner();
        scheduleStartupModal();
        // 游客也要拉取（服务端只返回 all 档内容）；已登录时 auth-ui 会再次触发，busy 标志去重
        try {
            if (typeof tp().triggerSync === 'function') tp().triggerSync();
        } catch (e) { /* 静默：内容同步失败不影响主流程 */ }
    }

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
    }

    if (typeof window !== 'undefined') {
        window.ContentCenterUI = {
            MODAL_ID: MODAL_ID,
            HOME_BANNER_ID: HOME_BANNER_ID,
            openNoticeModal: openNoticeModal,
            openNoticeList: openNoticeList,
            renderHomeBanner: renderHomeBanner,
            maybeShowStartupModal: maybeShowStartupModal
        };
    }
})();
