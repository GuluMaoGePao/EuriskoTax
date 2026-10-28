// === 阶段22 M4：双视角引导（taxonomy-guide）===
//
// 为什么需要这一步：
//   事件轨道（home-mission.js 的 9 张卡）用的是**生活语言**，覆盖高发场景；但两套专业分类
//   （阶段22 的核心交付）此前只存在于数据层，页面上没有任何入口。本组件一颗弹窗承载两个视角：
//     A 我自己（person）：按「钱的性质」—— 3 组 9 格判定问句 → 格内事件 → 直达工具
//     B 企业（enterprise）：按「征税对象」—— 5 税类 → 类内税种 / 费 → 直达工具
//   两侧各自吃各自的真源，切换是会话内状态（不落存储，与工具页分类选择器同一条纪律）。
//
// 数据依赖（只读，不抄）：
//   person-taxonomy：格（question / withheldBy / name）、事件（name / question / note / tools）
//   tax-taxonomy：税类（CATEGORIES 的 name / note / defaultOpen）、条目（name / frequency / scope / note）
//   tool-taxonomy：企业侧工具集（at('B/C*')，**不用 byTaxCode**——它会混入 A 侧 30 个个税工具）
//   tool-registry：工具显示名（all + deep）
//   Toolbox.openTool：打开工具的唯一入口（判空调用，测试里 mock）
//
// 边界纪律：
//   - 本文件**不出现任何税率、公式、金额**；文案一律来自字典的 question / note
//   - tools 为空的事件 / 税种显示「工具待补 / 暂无工具」，不做成死链接
//   - 弹窗外壳沿用统一体系（内容型宽度档 / modal-mask / openModal / closeModal 兜底），
//     与 entity-ui 同 family —— 见 tests/modal-shell.test.js 的登记
(function () {
    'use strict';

    var MODAL_ID = 'taxonomy-guide-modal';
    var BODY_ID = 'taxonomy-guide-body';

    // 视角（阶段22「双视角导航」）：person = 我自己 · 按钱的性质；enterprise = 企业 · 按税种
    var mode = 'person';

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
            '<div><h3 class="text-lg font-bold" id="taxonomy-guide-head-title">这笔钱属于哪一格？</h3>' +
            '<p class="text-white/80 text-xs mt-0.5" id="taxonomy-guide-head-sub">按《个人所得税法》第二条的 9 格判定 · 不用先懂税</p></div>' +
            '<button type="button" id="taxonomy-guide-close"' +
            ' class="w-8 h-8 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-colors"' +
            ' aria-label="关闭">' +
            '<i class="fa fa-times"></i></button>' +
            '</div></div>' +
            // 双视角切换：同一颗弹窗、两个真源 —— person 走 person-taxonomy（判定问句），
            // enterprise 走 tax-taxonomy（专业税类）。切换是会话内状态，不落存储。
            '<div class="guide-mode-tabs" role="tablist">' +
            '<button type="button" id="taxonomy-guide-mode-person" class="guide-mode-tab is-on"' +
            ' role="tab" aria-selected="true">我自己 · 按钱的性质</button>' +
            '<button type="button" id="taxonomy-guide-mode-enterprise" class="guide-mode-tab"' +
            ' role="tab" aria-selected="false">企业 · 按税种</button>' +
            '</div>' +
            '<div class="modal-body p-5" id="' + BODY_ID + '"></div>' +
            '</div>';
        document.body.appendChild(div);
        document.getElementById('taxonomy-guide-close').addEventListener('click', function () {
            window.EuriskoTaxonomyGuide.close();
        });
        document.getElementById('taxonomy-guide-mode-person').addEventListener('click', function () {
            setMode('person');
        });
        document.getElementById('taxonomy-guide-mode-enterprise').addEventListener('click', function () {
            setMode('enterprise');
        });
        bindBody();
    }

    // 两个视角的标题各自说清自己的真源（文案里的分类依据不写死数字以外的东西）
    var HEAD_TEXT = {
        person: ['这笔钱属于哪一格？', '按《个人所得税法》第二条的 9 格判定 · 不用先懂税'],
        enterprise: ['替公司办税，从哪类入手？', '按征税对象分五类 · 现行 18 个法定税种与 4 项费']
    };

    function setMode(m) {
        if (m !== 'person' && m !== 'enterprise') return;
        mode = m;
        var mp = document.getElementById('taxonomy-guide-mode-person');
        var me = document.getElementById('taxonomy-guide-mode-enterprise');
        if (mp) { mp.classList.toggle('is-on', m === 'person'); mp.setAttribute('aria-selected', m === 'person' ? 'true' : 'false'); }
        if (me) { me.classList.toggle('is-on', m === 'enterprise'); me.setAttribute('aria-selected', m === 'enterprise' ? 'true' : 'false'); }
        var title = document.getElementById('taxonomy-guide-head-title');
        var sub = document.getElementById('taxonomy-guide-head-sub');
        if (title) title.textContent = HEAD_TEXT[m][0];
        if (sub) sub.textContent = HEAD_TEXT[m][1];
        render('home');
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
            tools.map(function (tid) { return chipHtml(tid); }).join('') +
            '</div></div>';
    }

    function chipHtml(tid) {
        return '<button type="button" class="guide-tool-chip" data-guide-tool="' + esc(tid) + '"' +
            ' title="' + esc(tid) + '">' + esc(toolName(tid)) + '</button>';
    }

    // ---------- 企业视图 ①：5 税类（tax-taxonomy 的 CATEGORIES 是唯一真源） ----------
    // 工具计数从挂载点表 at('B/C*') 取 —— 不用 byTaxCode：它会混入 A 侧 30 个个税工具。
    var CAT_CODES = { turnover: 'C1', income: 'C2', property: 'C3', purpose: 'C4', levy: 'C5' };
    var FREQ_TEXT = { month: '按月', quarter: '按季', year: '按年', onetime: '按次', withVat: '随增值税附征' };
    var SCOPE_TEXT = { all: '普适', conditional: '有条件才涉及', industry: '特定行业' };

    function taxHomeHtml() {
        var T = window.EuriskoTaxTaxonomy;
        var M = window.EuriskoToolTaxonomy;
        if (!T) return '<p class="text-sm text-gray-500">税种字典未加载。</p>';
        var html = '<p class="guide-step-title">替公司或客户办税？按征税对象选一类：</p>' +
            '<div class="guide-group guide-forms">';
        T.categories().forEach(function (c) {
            var items = T.byCategory(c.id);
            var toolN = M ? M.at('B/' + (CAT_CODES[c.id] || '')).length : 0;
            // defaultOpen=false 的类（特定目的，95% 企业为零）样式降级但依然可点 ——
            // 折叠是「不值得优先」，不是「不存在」
            html += '<button type="button" class="guide-form-card' + (c.defaultOpen ? '' : ' is-minor') +
                '" data-guide-taxcat="' + esc(c.id) + '">' +
                '<span class="guide-form-card__name">' + esc(c.name) + '</span>' +
                '<span class="guide-form-card__q">' + esc(c.note || '') + '</span>' +
                '<span class="guide-form-card__meta">' + items.length + ' 项 · ' + toolN + ' 个工具 ›</span>' +
                '</button>';
        });
        return html + '</div>';
    }

    // ---------- 企业视图 ②：税类详情（条目 + 工具直达） ----------
    function taxCatHtml(catId) {
        var T = window.EuriskoTaxTaxonomy;
        var M = window.EuriskoToolTaxonomy;
        var c = T && T.categories().filter(function (x) { return x.id === catId; })[0];
        if (!c) return taxHomeHtml();
        var mounts = M ? M.at('B/' + (CAT_CODES[catId] || '')) : [];
        var html = '<button type="button" id="taxonomy-guide-back" class="guide-back">‹ 换一类</button>' +
            '<div class="guide-form-head">' +
            '<div class="guide-form-head__group">企业侧 · 按税种</div>' +
            '<h4 class="guide-form-head__name">' + esc(c.name) + '</h4>' +
            '<p class="guide-form-head__q">' + esc(c.note || '') + '</p>' +
            '</div><div class="guide-events">';
        T.byCategory(catId).forEach(function (item) {
            var sub = ((FREQ_TEXT[item.frequency] || '') +
                ((FREQ_TEXT[item.frequency] && SCOPE_TEXT[item.scope]) ? ' · ' : '') +
                (SCOPE_TEXT[item.scope] || '')) || '口径见工具页';
            var tools = mounts.filter(function (m) { return m.taxCode === item.id; });
            var name = esc(item.name) + (item.kind !== 'tax' ? '（费）' : '');
            if (!tools.length) {
                html += '<div class="guide-event-row is-empty" data-guide-empty="tax-' + esc(item.id) + '">' +
                    '<div class="guide-event-row__name">' + name + '</div>' +
                    '<div class="guide-event-row__sub">' + esc(sub) + ' · 暂无工具</div></div>';
            } else {
                html += '<div class="guide-event-row">' +
                    '<div class="guide-event-row__name">' + name + '</div>' +
                    (item.note ? '<div class="guide-event-row__sub">' + esc(item.note) + '</div>'
                        : '<div class="guide-event-row__sub">' + esc(sub) + '</div>') +
                    '<div class="guide-event-row__tools">' +
                    tools.map(function (m) { return chipHtml(m.id); }).join('') +
                    '</div></div>';
            }
        });
        // 挂在这一类下、但不对应任何税种的工具（如 employer-cost 是成本测算 not-a-tax）
        var orphans = mounts.filter(function (m) { return m.taxCode == null; });
        if (orphans.length) {
            html += '<div class="guide-event-row">' +
                '<div class="guide-event-row__name">相关工具</div>' +
                '<div class="guide-event-row__sub">挂在「' + esc(c.name) + '」下，但不是税种（成本测算等）</div>' +
                '<div class="guide-event-row__tools">' +
                orphans.map(function (m) { return chipHtml(m.id); }).join('') +
                '</div></div>';
        }
        return html + '</div>';
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
            var taxcard = t.closest ? t.closest('[data-guide-taxcat]') : null;
            if (taxcard) { render('tax:' + taxcard.getAttribute('data-guide-taxcat')); return; }
            var row = t.closest ? t.closest('[data-guide-event]') : null;
            if (row) { openTool(row.getAttribute('data-guide-first')); }
        });
    }

    function render(view) {
        var body = document.getElementById(BODY_ID);
        if (!body) return;
        if (!view || view === 'home') {
            body.innerHTML = (mode === 'enterprise') ? taxHomeHtml() : homeHtml();
            return;
        }
        if (view.indexOf('tax:') === 0) { body.innerHTML = taxCatHtml(view.slice(4)); return; }
        body.innerHTML = (view === 'cross') ? crossHtml() : formHtml(view);
    }

    // open(mode)：默认 person；身份卡等入口可传 'enterprise' 直接落到企业侧
    function open(m) {
        ensureModal();
        if (m === 'enterprise' || m === 'person') setMode(m);
        else render('home');
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

    // 首页入口按钮（index.html 提供；缺省时静默，测试直接调 open()）。
    // 两颗入口各自显式指定视角 —— open() 不带参数会沿用上次视角：
    // 企业用户上次用企业侧，从个人语境的入口点进来不该被弹回个人侧（反之亦然）。
    // 幂等（data-guide-bound）：模块求值时绑一次，将来动态注入入口或测试补绑不重复挂监听。
    function bindEntry(btnId, m) {
        var btn = document.getElementById(btnId);
        if (!btn || btn.getAttribute('data-guide-bound') === '1') return;
        btn.setAttribute('data-guide-bound', '1');
        btn.addEventListener('click', function () { open(m); });
    }

    function init() {
        bindEntry('home-guide-entry', 'person');
        bindEntry('home-guide-entry-tax', 'enterprise');
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
        setMode: setMode,
        mode: function () { return mode; },
        init: init,
        toolName: toolName
    };
})();
