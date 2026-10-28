// === 阶段22 M4：A 侧问句引导（taxonomy-guide）===
//
// 为什么需要这一步：
//   事件轨道（home-mission.js 的 9 张卡）用的是**生活语言**，覆盖高发场景；但 9 格分类
//   （《个人所得税法》第二条）此前只存在于数据层（person-taxonomy.js），页面上没有任何入口。
//   本组件把「这笔钱在法律上属于哪一格」的判定问句变成可见的引导：
//     ① 3 组 9 格，每格一张问句卡（question 是 person-taxonomy 的唯一文案来源，本文件不抄文案）
//     ② 点格 → 该格的事件（生活语言）→ 点事件 / 工具直达 openTool
//     ③ 跨格子事项（E13 E14 E16 E20 E24）单独一组，24 个事件全部可达
//
// 数据依赖（只读，不抄）：
//   person-taxonomy：格（question / withheldBy / name）、事件（name / question / note / tools）
//   tool-registry：工具显示名（all + deep）
//   Toolbox.openTool：打开工具的唯一入口（判空调用，测试里 mock）
//
// 边界纪律：
//   - 本文件**不出现任何税率、公式、金额**；判定文案一律来自字典的 question
//   - tools 为空的事件（E10 E16 E17 E22）显示「工具待补」与 note，不做成死链接
//   - 弹窗外壳沿用统一体系（内容型宽度档 / modal-mask / openModal / closeModal 兜底），
//     与 entity-ui 同 family —— 见 tests/modal-shell.test.js 的登记
(function () {
    'use strict';

    var MODAL_ID = 'taxonomy-guide-modal';
    var BODY_ID = 'taxonomy-guide-body';

    // withheldBy 的白话提示（这是「谁来扣税」的产品形态差异，属于分类元数据不算口径）
    var WITHHELD_HINTS = {
        employer: '单位按月代扣代缴，你核对工资条就行',
        payer: '对方支付时代扣，年度并入综合所得汇算',
        self: '没人替你扣，需要自行申报',
        none: ''
    };

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function P() { return window.EuriskoPersonTaxonomy; }

    // 工具显示名：速算器与完整测算两档都查；查不到显示 id（绝不让按钮空着）
    function toolName(id) {
        var R = window.EuriskoToolRegistry;
        if (!R) return id;
        var all = (R.all && R.all()) || [];
        var deep = (R.deep && R.deep()) || [];
        for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i].name || id;
        for (var j = 0; j < deep.length; j++) if (deep[j].id === id) return deep[j].name || id;
        return id;
    }

    function formCount(fid) {
        var p = P();
        return p ? p.eventsByForm(fid).length : 0;
    }

    // ---------- 弹窗外壳（与 entity-ui 的 ensureModal 同款） ----------
    function ensureModal() {
        if (document.getElementById(MODAL_ID)) return;
        var div = document.createElement('div');
        div.id = MODAL_ID;
        div.className = 'modal-mask hidden opacity-0 transition-opacity duration-300';
        div.setAttribute('onclick', 'if(event.target===this)EuriskoTaxonomyGuide.close()');
        div.innerHTML = '<div class="modal-shell modal-shell--lg bg-white dark:bg-gray-800 transform scale-95' +
            ' transition-transform duration-300">' +
            '<div class="modal-head bg-gradient-to-r from-primary to-blue-600 text-white p-5 rounded-t-xl">' +
            '<div class="flex justify-between items-center">' +
            '<div><h3 class="text-lg font-bold">这笔钱属于哪一格？</h3>' +
            '<p class="text-white/80 text-xs mt-0.5">按《个人所得税法》第二条的 9 格判定 · 不用先懂税</p></div>' +
            '<button type="button" id="taxonomy-guide-close"' +
            ' class="w-8 h-8 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-colors"' +
            ' aria-label="关闭">' +
            '<i class="fa fa-times"></i></button>' +
            '</div></div>' +
            '<div class="modal-body p-5" id="' + BODY_ID + '"></div>' +
            '</div>';
        document.body.appendChild(div);
        document.getElementById('taxonomy-guide-close').addEventListener('click', function () {
            window.EuriskoTaxonomyGuide.close();
        });
        bindBody();
    }

    // ---------- 视图 ①：3 组 9 格 + 跨格子事项 ----------
    function homeHtml() {
        var p = P();
        if (!p) return '<p class="text-sm text-gray-500">分类字典未加载。</p>';
        var html = '<p class="guide-step-title">先答一个问题：这笔钱在法律上属于哪一格？</p>';
        p.groups().forEach(function (g) {
            var forms = p.formsByGroup(g.id);
            html += '<div class="guide-group">' +
                '<div class="guide-group-title">' + esc(g.name) +
                '<span>' + esc(g.note || '') + '</span></div>' +
                '<div class="guide-forms">' +
                forms.map(function (f) {
                    return '<button type="button" class="guide-form-card" data-guide-form="' + esc(f.id) + '">' +
                        '<span class="guide-form-card__name">' + esc(f.name) + '</span>' +
                        '<span class="guide-form-card__q">' + esc(f.question) + '</span>' +
                        '<span class="guide-form-card__meta">' + formCount(f.id) + ' 个事项 ›</span>' +
                        '</button>';
                }).join('') +
                '</div></div>';
        });
        // 跨格子事项（第 4 组）：买房 / 存养老金 / 捐款 —— 不是一笔「收入」，是跨格的动作
        html += '<div class="guide-group">' +
            '<div class="guide-group-title">跨格子事项' +
            '<span>不是一笔收入，是跨格的动作</span></div>' +
            '<div class="guide-forms">' +
            '<button type="button" class="guide-form-card" data-guide-form="cross">' +
            '<span class="guide-form-card__name">跨格子事项</span>' +
            '<span class="guide-form-card__q">存养老金 / 买房 / 捐款 / 职业多形态</span>' +
            '<span class="guide-form-card__meta">' + p.events().filter(function (e) {
                return e.form === 'cross';
            }).length + ' 个事项 ›</span>' +
            '</button></div></div>';
        return html;
    }

    // ---------- 视图 ②：格详情 + 事件列表 ----------
    function formHtml(fid) {
        var p = P();
        var f = p && p.getForm(fid);
        if (!f) return homeHtml();
        var group = p.groups().filter(function (g) { return g.id === f.group; })[0];
        var events = p.eventsByForm(fid);
        var html = '<button type="button" id="taxonomy-guide-back" class="guide-back">' +
            '‹ 换一格</button>' +
            '<div class="guide-form-head">' +
            '<div class="guide-form-head__group">' + esc(group ? group.name : '') + ' · ' + esc(f.id) + '</div>' +
            '<h4 class="guide-form-head__name">' + esc(f.name) + '</h4>' +
            '<p class="guide-form-head__q">' + esc(f.question) + '</p>' +
            (WITHHELD_HINTS[f.withheldBy] ?
                '<p class="guide-form-head__hint">' + esc(WITHHELD_HINTS[f.withheldBy]) + '</p>' : '') +
            '</div><div class="guide-events">' +
            events.map(eventRowHtml).join('') +
            '</div>';
        return html;
    }

    // ---------- 视图 ②′：跨格子事项 ----------
    function crossHtml() {
        var p = P();
        var events = p ? p.events().filter(function (e) { return e.form === 'cross'; }) : [];
        return '<button type="button" id="taxonomy-guide-back" class="guide-back">‹ 换一格</button>' +
            '<div class="guide-form-head">' +
            '<div class="guide-form-head__group">跨格子事项</div>' +
            '<h4 class="guide-form-head__name">不是一笔收入，是跨格的动作</h4>' +
            '<p class="guide-form-head__q">这些事跨多个格子，先说清楚动作再落工具</p>' +
            '</div><div class="guide-events">' +
            events.map(eventRowHtml).join('') +
            '</div>';
    }

    // 事件行：名 + 补充文案（question 优先，其次 note）+ 工具 chips
    function eventRowHtml(e) {
        var sub = e.question || e.note || '';
        var tools = e.tools || [];
        if (!tools.length) {
            // 待补入口（E10 E16 E17 E20 E22）：不做成死链接，把「为什么还没有」说清楚
            // data-guide-empty：与可点行的 data-guide-event 区分，测试与埋点都能认出「待补」
            return '<div class="guide-event-row is-empty" data-guide-empty="' + esc(e.id) + '">' +
                '<div class="guide-event-row__name">' + esc(e.name) + '</div>' +
                '<div class="guide-event-row__sub">' + esc(sub || '工具待补') +
                (sub ? ' · 工具待补' : '') + '</div>' +
                '</div>';
        }
        return '<div class="guide-event-row" data-guide-event="' + esc(e.id) + '"' +
            ' data-guide-first="' + esc(tools[0]) + '">' +
            '<div class="guide-event-row__name">' + esc(e.name) + '</div>' +
            (sub ? '<div class="guide-event-row__sub">' + esc(sub) + '</div>' : '') +
            '<div class="guide-event-row__tools">' +
            tools.map(function (tid) {
                return '<button type="button" class="guide-tool-chip" data-guide-tool="' + esc(tid) + '"' +
                    ' title="' + esc(tid) + '">' + esc(toolName(tid)) + '</button>';
            }).join('') +
            '</div></div>';
    }

    // ---------- 交互 ----------
    function bindBody() {
        var body = document.getElementById(BODY_ID);
        if (!body) return;
        body.addEventListener('click', function (e) {
            var t = e.target;
            if (t.closest && t.closest('#taxonomy-guide-back')) { render('home'); return; }
            var chip = t.closest ? t.closest('[data-guide-tool]') : null;
            if (chip) { openTool(chip.getAttribute('data-guide-tool')); return; }
            var card = t.closest ? t.closest('[data-guide-form]') : null;
            if (card) {
                var fid = card.getAttribute('data-guide-form');
                render(fid === 'cross' ? 'cross' : fid);
                return;
            }
            var row = t.closest ? t.closest('[data-guide-event]') : null;
            if (row) { openTool(row.getAttribute('data-guide-first')); }
        });
    }

    function render(view) {
        var body = document.getElementById(BODY_ID);
        if (!body) return;
        body.innerHTML = view === 'home' || !view ? homeHtml()
            : (view === 'cross' ? crossHtml() : formHtml(view));
    }

    function open() {
        ensureModal();
        render('home');
        var modal = document.getElementById(MODAL_ID);
        if (typeof window.openModal === 'function') window.openModal(modal);
        else { modal.classList.remove('hidden'); modal.classList.remove('opacity-0'); }
    }

    function close() {
        var modal = document.getElementById(MODAL_ID);
        if (!modal) return;
        if (typeof window.closeModal === 'function') { window.closeModal(modal); return; }
        modal.classList.add('hidden');
    }

    function isOpen() {
        var modal = document.getElementById(MODAL_ID);
        return !!modal && !modal.classList.contains('hidden');
    }

    function openTool(id) {
        if (!id) return;
        close();
        if (window.EuriskoToolbox && typeof window.EuriskoToolbox.openTool === 'function') {
            window.EuriskoToolbox.openTool(id);
        }
    }

    // 首页入口按钮（#home-guide-entry，由 index.html 提供；缺省时静默，测试直接调 open()）
    function init() {
        var entry = document.getElementById('home-guide-entry');
        if (entry) entry.addEventListener('click', function () { open(); });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.EuriskoTaxonomyGuide = {
        open: open,
        close: close,
        isOpen: isOpen,
        render: render,
        toolName: toolName
    };
})();
