/**
 * Phase 1：多步计税流程的本地草稿（断点续算）
 *
 * 为什么要有它：手机端从「基本参数 → 收入明细 → 扣除项 → 结果」要填三屏，
 * 一次误触返回 / 接个电话就被打回第一屏、刚才填的收入全丢 —— 这是 Phase 1
 * 「算得完」的唯一实质缺口，也是编年史里 `calc_done` 分母最大的单点流失。
 *
 * 敏感个人信息的边界（收入 / 五险一金属个保法敏感个人信息，写错一次性质就变了）：
 *   1. **只存本机**：键名 `euriskoDraft:*`，独立命名空间；
 *      云同步（history-sync）只认 `taxCalculationHistory`，草稿天然不进同步链路；
 *      此文件内**没有任何网络调用**，新增一行都不许有。
 *   2. **过期即弃**：默认 7 天。让上个季度的工资数悄悄回填给 HR，比没有草稿更糟。
 *   3. **明示 + 可一键清除**：恢复条上写清「只存在这台手机，不会上传」，给「清除重填」，
 *      退出登录随其它本地数据一并清除。
 *
 * 对外：window.EuriskoDraft = { save, load, clear, clearAll, hasDraft, restore, registerFlow, pure }
 */
(function () {
    'use strict';

    var PREFIX = 'euriskoDraft:';
    var VERSION = 1;
    var DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;   // 7 天
    var DEBOUNCE_MS = 600;

    var FLOWS = [
        {
            id: 'forward', containerId: 'forward-calculation-page', title: '综合所得计税',
            paneIds: ['step-parameters', 'step-income', 'step-deductions', 'step-result'],
            gotoName: 'goToStep'
        },
        {
            id: 'reverse', containerId: 'reverse-calculation-page', title: '税后工资反算',
            paneIds: ['reverse-step-parameters', 'reverse-step-deductions', 'reverse-step-result'],
            gotoName: 'showReverseStep'
        },
        {
            id: 'classification', containerId: 'classification-calculation-page', title: '分类所得计税',
            paneIds: ['classification-step-info', 'classification-step-result'],
            gotoName: 'showClassificationStep'
        }
    ];

    // ==================== 纯函数（单测直接打这里）====================

    function storageKey(flowId) {
        return PREFIX + flowId;
    }

    /** 收集容器内所有带 id 的输入项。file / password 一律跳过 —— 不碰凭证类字段 */
    function collect(container) {
        var out = {};
        if (!container || !container.querySelectorAll) return out;
        var els = container.querySelectorAll('input[id], select[id], textarea[id]');
        for (var i = 0; i < els.length; i++) {
            var el = els[i];
            if (el.type === 'file' || el.type === 'password') continue;
            out[el.id] = (el.type === 'checkbox' || el.type === 'radio') ? !!el.checked : el.value;
        }
        return out;
    }

    /**
     * 与基线不同的项。表单里大量缺省 value="0"，若按「非空」判断，
     * 每个流程一进页面就算「有内容」—— 恢复条会一直弹，草稿也永远删不掉。
     */
    function changedKeys(values, baseline) {
        var keys = Object.keys(values || {});
        var out = [];
        for (var i = 0; i < keys.length; i++) {
            var k = keys[i];
            if (String(values[k]) !== String(baseline ? baseline[k] : undefined)) out.push(k);
        }
        return out;
    }

    function isExpired(savedAt, now, ttl) {
        if (typeof savedAt !== 'number' || !isFinite(savedAt) || savedAt <= 0) return true;
        return (now - savedAt) > (ttl || DEFAULT_TTL_MS);
    }

    /** 宽容解析：localStorage 里的内容可能被手改、被旧版本写过、或者写到一半被掐断 */
    function readDraft(raw, now, ttl) {
        if (!raw) return null;
        var d;
        try { d = JSON.parse(raw); } catch (e) { return null; }
        if (!d || d.v !== VERSION || typeof d.values !== 'object' || !d.values) return null;
        if (isExpired(d.ts, now, ttl || DEFAULT_TTL_MS)) return null;
        return { values: d.values, step: d.step || 1, savedAt: d.ts };
    }

    function serialize(values, step, now) {
        return JSON.stringify({ v: VERSION, ts: now, step: step, values: values });
    }

    function relativeTime(savedAt, now) {
        var diff = now - savedAt;
        if (!(diff >= 0)) return '刚刚';
        var min = Math.floor(diff / 60000);
        if (min < 1) return '刚刚';
        if (min < 60) return min + ' 分钟前';
        var hour = Math.floor(min / 60);
        if (hour < 24) return hour + ' 小时前';
        return Math.floor(hour / 24) + ' 天前';
    }

    /** 当前展示到第几步：直接读 DOM 里的 visible pane，不必去改各流程的导航函数 */
    function visibleStep(container, paneIds, doc) {
        if (!paneIds || !paneIds.length) return 1;
        for (var i = 0; i < paneIds.length; i++) {
            var el = (doc || document).getElementById(paneIds[i]);
            if (el && !el.classList.contains('hidden')) return i + 1;
        }
        return 1;
    }

    // ==================== 副作用区 ====================

    function ls() {
        try { return window.localStorage; } catch (e) { return null; }   // 隐私模式
    }

    var ctxs = {};   // flowId → { flow, container, baseline, bar, timer }

    function showBar(ctx, draft, now) {
        removeBar(ctx);
        var bar = document.createElement('div');
        bar.className = 'draft-resume-bar';
        bar.setAttribute('data-draft-bar', ctx.flow.id);
        // 只拼静态文案与数字，绝不拼草稿里的值 —— 那里面是用户输入
        bar.innerHTML =
            '<div class="flex items-start gap-2">' +
            '<i class="fa fa-history text-primary mt-[2px]"></i>' +
            '<div class="flex-1 text-xs leading-relaxed">' +
            '<div class="font-medium">上次填到<strong>第 ' + draft.step + ' 步</strong>' +
            '（' + relativeTime(draft.savedAt, now) + '）</div>' +
            '<div class="text-gray-500">草稿只存在这台手机，不会上传；可在下方一键清除</div>' +
            '</div>' +
            '<div class="flex items-center gap-2 shrink-0">' +
            '<button type="button" data-draft-act="resume" class="px-3 py-1.5 text-xs rounded bg-primary text-white">继续填写</button>' +
            '<button type="button" data-draft-act="discard" class="px-3 py-1.5 text-xs rounded border border-gray-300 text-gray-600">清除重填</button>' +
            '</div>' +
            '</div>';
        bar.addEventListener('click', function (ev) {
            var btn = ev.target.closest ? ev.target.closest('[data-draft-act]') : null;
            if (!btn) return;
            if (btn.getAttribute('data-draft-act') === 'resume') restore(ctx.flow.id);
            else clear(ctx.flow.id);
        });
        ctx.container.insertBefore(bar, ctx.container.firstChild);
        ctx.bar = bar;
    }

    function removeBar(ctx) {
        if (ctx.bar && ctx.bar.parentNode) ctx.bar.parentNode.removeChild(ctx.bar);
        ctx.bar = null;
    }

    function load(flowId) {
        var store = ls();
        if (!store) return null;
        var ctx = ctxs[flowId];
        if (!ctx) return null;
        var raw;
        try { raw = store.getItem(storageKey(flowId)); } catch (e) { return null; }
        return readDraft(raw, Date.now());
    }

    /** 立刻落盘；无改动则清掉（用户把数改回默认就该当作没填过） */
    function save(flowId) {
        var ctx = ctxs[flowId];
        var store = ls();
        if (!ctx || !store) return false;
        var values = collect(ctx.container);
        if (!changedKeys(values, ctx.baseline).length) {
            try { store.removeItem(storageKey(flowId)); } catch (e) { /* ignore */ }
            return false;
        }
        var step = visibleStep(ctx.container, ctx.flow.paneIds);
        try {
            store.setItem(storageKey(flowId), serialize(values, step, Date.now()));
            return true;
        } catch (e) {
            return false;   // 配额满了不该让填写本身失败
        }
    }

    function scheduleSave(flowId) {
        var ctx = ctxs[flowId];
        if (!ctx) return;
        if (ctx.timer) clearTimeout(ctx.timer);
        ctx.timer = setTimeout(function () { save(flowId); }, DEBOUNCE_MS);
    }

    /**
     * 把待存的草稿立刻落盘。
     * 缺了它，用户在 600ms 防抖窗口内切走 / 被电话打断，最后那几个字就丢了 ——
     * 而这恰恰是最需要草稿的那个瞬间（谈不上「算得完」）。
     */
    function flushPending() {
        var n = 0;
        Object.keys(ctxs).forEach(function (id) {
            var ctx = ctxs[id];
            if (!ctx || !ctx.timer) return;
            clearTimeout(ctx.timer);
            ctx.timer = null;
            if (save(id)) n++;
        });
        return n;
    }

    function clear(flowId) {
        var ctx = ctxs[flowId];
        var store = ls();
        if (store) {
            try { store.removeItem(storageKey(flowId)); } catch (e) { /* ignore */ }
        }
        if (ctx) {
            removeBar(ctx);
            if (ctx.timer) { clearTimeout(ctx.timer); ctx.timer = null; }
        }
        return true;
    }

    function clearAll() {
        FLOWS.forEach(function (f) { clear(f.id); });
        return true;
    }

    /** 把值写回表单：dispatch 事件让「劳务报酬折算」这类联动重算，而不是只在界面上摆个数 */
    function restore(flowId) {
        var ctx = ctxs[flowId];
        var draft = load(flowId);
        if (!ctx || !draft) return 0;
        var n = 0;
        Object.keys(draft.values).forEach(function (id) {
            var el = document.getElementById(id);
            // 只认本流程内的元素：宁可少恢复一项，也不能跨页一个同 id 给写串
            if (!el || !ctx.container.contains(el)) return;
            if (el.type === 'checkbox' || el.type === 'radio') el.checked = !!draft.values[id];
            else el.value = draft.values[id];
            fire(el, 'input');
            fire(el, 'change');
            n++;
        });
        removeBar(ctx);
        var gotoFn = window[ctx.flow.gotoName];
        if (typeof gotoFn === 'function') gotoFn(draft.step);
        return n;
    }

    function fire(el, type) {
        var ev;
        try {
            ev = new Event(type, { bubbles: true });
        } catch (e) {
            ev = document.createEvent('Event');
            ev.initEvent(type, true, true);
        }
        el.dispatchEvent(ev);
    }

    /** 进入页面时判断要不要给恢复条。已在填写的不打扰 —— 那是最招烦的一种提示 */
    function offerIfUseful(flowId) {
        var ctx = ctxs[flowId];
        if (!ctx) return false;
        var draft = load(flowId);
        if (!draft) { removeBar(ctx); return false; }
        if (changedKeys(collect(ctx.container), ctx.baseline).length) return false;
        showBar(ctx, draft, Date.now());
        return true;
    }

    function registerFlow(flow) {
        if (!flow || ctxs[flow.id]) return false;
        var container = document.getElementById(flow.containerId);
        if (!container) return false;
        var ctx = { flow: flow, container: container, baseline: null, bar: null, timer: null };
        ctxs[flow.id] = ctx;
        ctx.baseline = collect(container);

        // 输入即存。input 覆盖文本框与勾选框的实时编辑，change 兜 select 与部分输入法场景
        ['input', 'change'].forEach(function (type) {
            container.addEventListener(type, function () {
                removeBar(ctx);
                scheduleSave(flow.id);
            });
        });
        return true;
    }

    function init() {
        var registered = 0;
        FLOWS.forEach(function (f) { if (registerFlow(f)) registered++; });
        if (!registered) return;

        // 切后台 / 离开页面必须先把待存落盘：pagehide 是移动浏览器唯一可靠的时机
        window.addEventListener('pagehide', flushPending);
        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'hidden') flushPending();
        });

        // 进入页面才提示：靠 page 容器的 hidden 类切换，不去耦合 showPage 的实现
        Object.keys(ctxs).forEach(function (id) {
            var ctx = ctxs[id];
            if (!window.MutationObserver) return;
            new MutationObserver(function () {
                if (!ctx.container.classList.contains('hidden')) offerIfUseful(id);
            }).observe(ctx.container, { attributes: true, attributeFilter: ['class'] });
            if (!ctx.container.classList.contains('hidden')) offerIfUseful(id);
        });
    }

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
    }

    window.EuriskoDraft = {
        registerFlow: registerFlow,
        save: save,
        load: load,
        clear: clear,
        clearAll: clearAll,
        restore: restore,
        offerIfUseful: offerIfUseful,
        flushPending: flushPending,
        hasDraft: function (flowId) { return !!load(flowId); },
        _ctxs: ctxs,
        _FLOWS: FLOWS,
        DEFAULT_TTL_MS: DEFAULT_TTL_MS,
        pure: {
            DEFAULT_TTL_MS: DEFAULT_TTL_MS,
            storageKey: storageKey,
            collect: collect,
            changedKeys: changedKeys,
            isExpired: isExpired,
            readDraft: readDraft,
            serialize: serialize,
            relativeTime: relativeTime,
            visibleStep: visibleStep
        }
    };
})();
