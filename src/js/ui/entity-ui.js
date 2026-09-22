/**
 * 阶段19-9 · 效率层 UI：主体切换器（E1）+ 模板条 / 模板管理（E2）
 *
 * 这个文件只做「入口与容器」，不含任何税务计算，也不改任何既有 DOM 的语义：
 *   · 顶栏 `#entity-switcher`：**没建主体就完全不出现**（守护测试 1 的另一半）。
 *     它不是导航栏的常驻件 —— 90% 的个人用户没有第二个纳税主体，给他们一颗常年显示的
 *     下拉，等于用 10% 的场景给所有人加一个没用的控件。
 *   · 速算器页 / 完整测算页的「从模板填充」条：有模板才显形，没有就留空。
 *   · 两个管理弹窗（主体 / 模板）按需建到 body 上 —— 不把它们塞进已经 171KB 的 index.html。
 *
 * 三条纪律：
 *   ① **拿不到 store 就整块不出现**：EuriskoEntities / EuriskoTemplates 缺席时（脚本顺序排错、
 *      隐私模式下 localStorage 不可用）页面照常测算，只是没有效率层 —— 用便利换可用是不划算的。
 *   ② **升级入口不增加第三处**：额度满了只给一句带出处的说明文字，
 *      绝不新造一颗升级按钮（阶段14：入口只有顶栏 pill 与个人中心横幅两处）。
 *   ③ **不自动替用户选主体**：见 entity-store.js current() 的注释。
 *
 * 对外接口：window.EuriskoEntityUI
 */
(function () {
    'use strict';

    var SWITCHER_ID = 'entity-switcher';
    var ENTITY_MODAL_ID = 'entity-manager-modal';
    var TEMPLATE_MODAL_ID = 'template-manager-modal';
    var MAX_ROWS = 3;            // 模板条一次铺开几份：超过的进「管理模板」

    var mountedBars = [];        // { hostId, toolId, onPick }：模板改一处，这里全部重画

    function E() { return (typeof window !== 'undefined') ? window.EuriskoEntities : null; }
    function T() { return (typeof window !== 'undefined') ? window.EuriskoTemplates : null; }
    function R() { return (typeof window !== 'undefined') ? window.EuriskoToolRegistry : null; }

    function esc(s) {
        return String(s === undefined || s === null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function openModal(id) {
        var modal = document.getElementById(id);
        if (!modal) return;
        if (typeof window.openModal === 'function') window.openModal(modal);
        else { modal.classList.remove('hidden'); modal.classList.remove('opacity-0'); }
    }

    function closeModal(id) {
        var modal = document.getElementById(id);
        if (!modal) return;
        if (typeof window.closeModal === 'function') window.closeModal(modal);
        else { modal.classList.add('hidden'); }
    }

    function optionsHtml(list, current) {
        return (list || []).map(function (o) {
            return '<option value="' + esc(o.value) + '"' + (String(o.value) === String(current) ? ' selected' : '') +
                '>' + esc(o.label) + '</option>';
        }).join('');
    }

    // 一句「为什么要有它」的空态文案：主体这个词没人天然懂，不说清楚它就是导航栏上的装饰
    function entityEmptyHint() {
        return '<p class="entity-modal-lead">主体 = 一个你要反复算的纳税实体（自己这家公司、代账的客户）。' +
            '它可以给模板归类 —— 「甲主体的社保比例」与「乙主体的征收方式」各存各的。' +
            '不建主体也完全不影响测算，历史、方案、导出一切照旧。</p>';
    }

    function entityRowHtml(item, isCurrent) {
        var ent = E();
        var tags = [];
        if (ent && typeof ent.labelOfKind === 'function') tags.push(ent.labelOfKind(item.kind));
        if (ent && typeof ent.labelOfTaxpayerType === 'function') tags.push(ent.labelOfTaxpayerType(item.taxpayerType));
        if (ent && typeof ent.labelOfLevyMode === 'function') tags.push(ent.labelOfLevyMode(item.levyMode));
        if (item.city) tags.push(item.city);
        return '<div class="entity-row' + (isCurrent ? ' is-current' : '') + '">' +
            '<div class="entity-row-main">' +
            '<span class="entity-row-name"><i class="fa fa-building-o mr-1.5"></i>' + esc(item.name) + '</span>' +
            (isCurrent ? '<span class="entity-row-badge">当前</span>' : '') +
            '<span class="entity-row-tags">' + esc(tags.filter(Boolean).join(' · ')) + '</span>' +
            '</div>' +
            '<div class="entity-row-ops">' +
            '<button type="button" class="entity-op" data-entity-use="' + esc(item.id) + '">' +
            (isCurrent ? '取消使用' : '用它') + '</button>' +
            '<button type="button" class="entity-op" data-entity-edit="' + esc(item.id) + '">修改</button>' +
            '<button type="button" class="entity-op entity-op-danger" data-entity-del="' + esc(item.id) + '">删除</button>' +
            '</div></div>';
    }

    // ====== 顶栏主体切换器（有主体才显示）======
    function panelItemHtml(item, isCurrent) {
        var ent = E();
        var tags = [];
        if (ent && typeof ent.labelOfKind === 'function') tags.push(ent.labelOfKind(item.kind));
        if (item.city) tags.push(item.city);
        return '<button type="button" class="entity-panel-item' + (isCurrent ? ' is-on' : '') + '"' +
            ' data-entity-id="' + esc(item.id) + '">' +
            '<span class="entity-panel-name">' + esc(item.name) + '</span>' +
            (isCurrent ? '<span class="entity-panel-tick"><i class="fa fa-check"></i></span>' : '') +
            '<span class="entity-panel-tags">' + esc(tags.filter(Boolean).join(' · ')) + '</span>' +
            '</button>';
    }

    function closeSwitcherPanel() {
        var panel = document.getElementById('entity-switcher-panel');
        var btn = document.getElementById('entity-switcher-btn');
        if (panel) panel.classList.add('hidden');
        if (btn) btn.setAttribute('aria-expanded', 'false');
    }

    var docBound = false;
    function bindSwitcherOnce() {
        if (docBound) return;
        docBound = true;
        document.addEventListener('click', function (e) {
            if (e.target && e.target.closest && e.target.closest('#' + SWITCHER_ID)) return;
            closeSwitcherPanel();
        });
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSwitcherPanel(); });
    }

    function renderSwitcher() {
        var host = document.getElementById(SWITCHER_ID);
        if (!host) return;
        var ent = E();
        var list = (ent && typeof ent.all === 'function') ? ent.all() : [];
        // 没建主体就彻底不出现：不是「显示一个空下拉」，而是这块 DOM 都不留
        if (!list.length) { host.innerHTML = ''; host.classList.add('hidden'); return; }
        var cur = ent && typeof ent.current === 'function' ? ent.current() : null;
        var items = list.map(function (it) { return panelItemHtml(it, !!cur && cur.id === it.id); }).join('') +
            '<button type="button" class="entity-panel-item' + (cur ? '' : ' is-on') + '" data-entity-id="">' +
            '<span class="entity-panel-name">不按主体（只用全局模板）</span>' +
            (cur ? '' : '<span class="entity-panel-tick"><i class="fa fa-check"></i></span>') +
            '</button>' +
            '<div class="entity-panel-sep"></div>' +
            '<button type="button" class="entity-panel-manage" data-entity-manage="1">' +
            '<i class="fa fa-cog mr-1.5"></i>管理主体</button>';

        host.classList.remove('hidden');
        host.innerHTML =
            '<button type="button" id="entity-switcher-btn" class="entity-switcher-btn"' +
            ' aria-haspopup="true" aria-expanded="false" title="切换主体：模板按主体归类">' +
            '<i class="fa fa-building-o"></i>' +
            '<span class="entity-switcher-name">' + esc(cur ? cur.name : '不按主体') + '</span>' +
            '<i class="fa fa-chevron-down entity-switcher-caret"></i></button>' +
            '<div id="entity-switcher-panel" class="entity-panel hidden">' + items + '</div>';

        bindSwitcherOnce();
        var btn = document.getElementById('entity-switcher-btn');
        var panel = document.getElementById('entity-switcher-panel');
        if (btn) {
            btn.addEventListener('click', function () {
                var willShow = panel && panel.classList.contains('hidden');
                if (panel) panel.classList.toggle('hidden', !willShow);
                btn.setAttribute('aria-expanded', willShow ? 'true' : 'false');
            });
        }
        if (panel) {
            panel.addEventListener('click', function (e) {
                var pick = e.target.closest('[data-entity-id]');
                if (pick) {
                    if (ent && typeof ent.setCurrent === 'function') ent.setCurrent(pick.getAttribute('data-entity-id') || '');
                    closeSwitcherPanel();
                    renderSwitcher();
                    refreshBars();
                    return;
                }
                if (e.target.closest('[data-entity-manage]')) {
                    closeSwitcherPanel();
                    openEntityManager();
                }
            });
        }
    }

    // ====== 工具页「从模板填充」条 ======
    // 做成原生 details 折叠：一行 summary + 几颗按钮。不自己写下拉是刻意的 ——
    // 键盘能到的控件不需要 JS 才有焦点，而自己写的下拉十有八九忘了 Escape。
    function drawBar(m) {
        var host = document.getElementById(m.hostId);
        if (!host) return;
        var lib = T();
        var list = (lib && typeof lib.listOf === 'function') ? lib.listOf(m.toolId) : [];
        if (!list.length) { host.innerHTML = ''; host.classList.add('hidden'); return; }
        var shown = list.slice(0, MAX_ROWS);
        var rest = list.length - shown.length;
        var rows = shown.map(function (t) {
            var scope = t.entityId ? '' : '<span class="tool-template-scope">全局</span>';
            return '<button type="button" class="tool-template-item" data-tpl-id="' + esc(t.id) + '">' +
                '<i class="fa fa-clone mr-1.5"></i>' + esc(t.name) + scope + '</button>';
        }).join('');
        host.classList.remove('hidden');
        host.innerHTML = '<details class="tool-template-bar"><summary class="tool-template-summary">' +
            '<i class="fa fa-clone mr-1.5"></i>从模板填充（' + list.length + '）</summary>' +
            '<div class="tool-template-body">' + rows +
            (rest > 0 ? '<span class="tool-template-more">另有 ' + rest + ' 份 · </span>' : '') +
            '<button type="button" class="tool-template-manage" data-tpl-manage="1">管理模板</button>' +
            '</div></details>';

        var details = host.querySelector('details');
        host.querySelectorAll('[data-tpl-id]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var id = btn.getAttribute('data-tpl-id');
                var values = lib && typeof lib.valuesOf === 'function' ? lib.valuesOf(id) : null;
                if (values && typeof m.onPick === 'function') m.onPick(values, id);
                if (details) details.open = false;
            });
        });
        var manage = host.querySelector('[data-tpl-manage]');
        if (manage) manage.addEventListener('click', function () { openTemplateManager(); });
    }

    // 宿主不存在时不报错（单测 fixture 里没有这条就当作不出现这个功能）
    function mountTemplateBar(hostId, toolId, onPick) {
        var found = null;
        mountedBars = mountedBars.filter(function (m) {
            if (m.hostId === hostId) { found = m; return false; }
            return true;
        });
        var m = found || { hostId: hostId, toolId: toolId, onPick: onPick };
        m.toolId = toolId;
        m.onPick = onPick;
        mountedBars.push(m);
        drawBar(m);
    }

    function refreshBars() { mountedBars.forEach(drawBar); }

    // ====== 「存为模板」（速算器与完整测算共用同一份实现）======
    function saveAsTemplate(tool, values) {
        var lib = T();
        if (!lib || typeof lib.save !== 'function' || !tool) return { ok: false, reason: 'module' };
        var res = lib.save({ toolId: tool.id, values: values });
        if (res.ok) refreshBars();
        return res;
    }

    // 反馈文案一处给出：两页各写一句，迟早有一处改成别的话术，那时用户就只剩猜。
    function hintFor(res) {
        if (!res) return '存不了模板';
        if (res.ok) return '已存为模板「' + (res.template ? res.template.name : '') + '」· 下次进工具可一键带出';
        if (res.reason === 'limit') return '免费 ' + res.limit + ' 份模板已用完（一份没删）；专业版不限';
        if (res.reason === 'empty') return '这份参数里没有可复用的字段';
        return '存不了模板';
    }

    // ====== 管理弹窗（主体 / 模板）：按需建 DOM，不把它们塞进 171KB 的 index.html ======
    // 样式沿用既有模态框那一套（同一组 tailwind 类已存在于构建产物里），
    // 保证两个弹窗打开起来与「意见反馈」「关于」是同一个 family，不像第三方塞进来的东西。
    var editingId = null;

    function ensureModal(id, title, subtitle, bodyId, closeId) {
        if (document.getElementById(id)) return;
        var div = document.createElement('div');
        div.id = id;
        div.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 hidden opacity-0 transition-opacity duration-300';
        div.setAttribute('onclick', 'if(event.target===this)closeModal(this)');
        div.innerHTML = '<div class="bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4 transform scale-95' +
            ' transition-transform duration-300 max-h-[85vh] overflow-hidden flex flex-col">' +
            '<div class="bg-gradient-to-r from-primary to-blue-600 text-white p-5 rounded-t-xl">' +
            '<div class="flex justify-between items-center">' +
            '<div><h3 class="text-lg font-bold">' + esc(title) + '</h3>' +
            '<p class="text-white/80 text-xs mt-0.5">' + esc(subtitle) + '</p></div>' +
            '<button type="button" id="' + esc(closeId) + '"' +
            ' class="w-8 h-8 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-colors">' +
            '<i class="fa fa-times"></i></button>' +
            '</div></div>' +
            '<div class="p-5 overflow-y-auto" id="' + esc(bodyId) + '"></div>' +
            '</div>';
        document.body.appendChild(div);
        document.getElementById(closeId).addEventListener('click', function () { closeModal(id); });
    }

    // 额度满了只说一句话，不新增第三颗升级按钮（见文件头纪律 ②）
    function limitNote(count, isPro, limit) {
        if (isPro || count < limit) return '';
        return '<p class="entity-form-note">已到免费上限（' + count + '/' + limit + '）：旧的都不会删，' +
            '继续用也不影响任何测算。专业版不限数量，升级入口见顶栏与个人中心。</p>';
    }

    function quotaOf(store) {
        if (!store || typeof store.limitFor !== 'function') return { count: 0, limit: Infinity, isPro: false };
        var isPro = typeof store.isPro === 'function' ? !!store.isPro() : false;
        var count = typeof store.count === 'function' ? store.count() : 0;
        return { count: count, limit: store.limitFor(isPro), isPro: isPro };
    }

    function entityFormHtml(id) {
        var ent = E();
        var it = (id && ent && typeof ent.byId === 'function') ? ent.byId(id) : null;
        return '<div class="entity-form">' +
            '<div class="entity-form-title">' + (it ? '修改「' + esc(it.name) + '」' : '新建主体') + '</div>' +
            '<div class="entity-form-grid">' +
            '<label class="entity-field"><span>名称</span>' +
            '<input id="entity-form-name" class="tool-input" value="' + esc(it ? it.name : '') +
            '" placeholder="例：杭州某某科技有限公司"></label>' +
            '<label class="entity-field"><span>类型</span>' +
            '<select id="entity-form-kind" class="tool-input">' +
            optionsHtml(ent ? ent.KINDS : [], it ? it.kind : 'company') + '</select></label>' +
            '<label class="entity-field"><span>纳税人类型</span>' +
            '<select id="entity-form-taxpayer" class="tool-input">' +
            optionsHtml(ent ? ent.TAXPAYER_TYPES : [], it ? it.taxpayerType : 'small') + '</select></label>' +
            '<label class="entity-field"><span>征收方式</span>' +
            '<select id="entity-form-levy" class="tool-input">' +
            optionsHtml(ent ? ent.LEVY_MODES : [], it ? it.levyMode : 'audited') + '</select></label>' +
            '<label class="entity-field"><span>城市</span>' +
            '<input id="entity-form-city" class="tool-input" value="' + esc(it ? it.city : '') +
            '" placeholder="影响社保基数口径"></label>' +
            '</div>' +
            '<div class="entity-form-ops">' +
            '<button type="button" id="entity-form-save" class="entity-save">' +
            (it ? '保存修改' : '保存主体') + '</button>' +
            (it ? '<button type="button" id="entity-form-cancel" class="entity-cancel">取消修改</button>' : '') +
            '</div>' +
            '<p class="entity-form-note">主体只用来给模板归类：它<b>不参与任何计算</b>，' +
            '也不会自动替你改工具里的口径 —— 同一批参数跨工具同名的字段往往是两回事。</p>' +
            '</div>';
    }

    function drawEntityBody() {
        var body = document.getElementById('entity-manager-body');
        if (!body) return;
        var ent = E();
        var list = ent ? ent.all() : [];
        var cur = ent ? ent.current() : null;
        var q = quotaOf(ent);
        body.innerHTML = entityEmptyHint() +
            list.map(function (it) { return entityRowHtml(it, !!cur && cur.id === it.id); }).join('') +
            limitNote(q.count, q.isPro, q.limit) +
            entityFormHtml(editingId);
        bindEntityBody();
    }

    function openEntityManager() {
        ensureModal(ENTITY_MODAL_ID, '主体管理', '给模板归类用的纳税实体 · 免费 1 个',
            'entity-manager-body', 'close-entity-manager');
        drawEntityBody();
        openModal(ENTITY_MODAL_ID);
    }

    function val(id) {
        var el = document.getElementById(id);
        return el ? el.value : '';
    }

    function flashError(msg) {
        var body = document.getElementById('entity-manager-body');
        if (!body) return;
        var p = document.createElement('p');
        p.className = 'entity-form-note is-error';
        p.textContent = msg;
        var ops = body.querySelector('.entity-form-ops');
        (ops ? ops.parentNode.insertBefore(p, ops.nextSibling) : body).appendChild(p);
    }

    function bindEntityBody() {
        var body = document.getElementById('entity-manager-body');
        if (!body) return;
        var ent = E();
        if (!ent) return;

        body.querySelectorAll('[data-entity-use]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var id = btn.getAttribute('data-entity-use');
                var cur = ent.current();
                ent.setCurrent(cur && cur.id === id ? '' : id);   // 再点一次「取消使用」
                drawEntityBody(); renderSwitcher(); refreshBars();
            });
        });
        body.querySelectorAll('[data-entity-edit]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                editingId = btn.getAttribute('data-entity-edit');
                drawEntityBody();
            });
        });
        body.querySelectorAll('[data-entity-del]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var id = btn.getAttribute('data-entity-del');
                var it = ent.byId(id);
                if (!it) return;
                // 删主体不删模板： entity-store.remove 会把它的模板转回全局 ——
                // 否则这批模板会「还在存储里、但界面哪儿都看不到」，用户没法解释它去哪了
                ent.remove(id);
                if (editingId === id) editingId = null;
                drawEntityBody(); renderSwitcher(); refreshBars();
            });
        });
        var cancelBtn = document.getElementById('entity-form-cancel');
        if (cancelBtn) cancelBtn.addEventListener('click', function () { editingId = null; drawEntityBody(); });
        var saveBtn = document.getElementById('entity-form-save');
        if (saveBtn) {
            saveBtn.addEventListener('click', function () {
                var payload = {
                    name: val('entity-form-name'),
                    kind: val('entity-form-kind'),
                    taxpayerType: val('entity-form-taxpayer'),
                    levyMode: val('entity-form-levy'),
                    city: val('entity-form-city')
                };
                if (editingId) payload.id = editingId;
                var res = ent.save(payload);
                if (!res.ok) {
                    flashError(res.reason === 'name' ? '名称不能为空'
                        : '已到免费上限（免费版 1 个主体），旧的不会删；专业版不限');
                    return;
                }
                editingId = null;
                drawEntityBody(); renderSwitcher(); refreshBars();
            });
        }
    }

    // ====== 模板管理 ======
    function drawTemplateBody() {
        var body = document.getElementById('template-manager-body');
        if (!body) return;
        var lib = T();
        var list = lib ? lib.all() : [];
        var lead = '<p class="entity-modal-lead">模板 = 某个工具的一套已填参数，下次进工具一键带出。' +
            '它跟「参数记忆」不是一回事：记忆每工具只留一份上次输入且不用你管，' +
            '模板你可以存很多份、有名字、能挂到不同主体上。</p>';
        if (!list.length) {
            body.innerHTML = lead + '<p class="entity-form-note">还没有模板：在任一工具算出结果后，' +
                '点结果下方的「存为模板」即可。</p>';
            return;
        }
        var reg = R();
        var ent = E();
        var rows = list.map(function (t) {
            var tool = (reg && typeof reg.get === 'function') ? reg.get(t.toolId) : null;
            var owner = t.entityId && ent && typeof ent.byId === 'function' ? ent.byId(t.entityId) : null;
            var scope = t.entityId ? (owner ? owner.name : '（主体已删）') : '全局';
            return '<div class="tpl-row">' +
                '<div class="tpl-row-main">' +
                '<input class="tpl-name-input" data-tpl-rename="' + esc(t.id) + '" value="' + esc(t.name) +
                '" aria-label="模板名称">' +
                '<span class="tpl-row-meta">' + esc(tool ? tool.name : t.toolId) + ' · ' + esc(scope) +
                ' · ' + Object.keys(t.values || {}).length + ' 项参数</span></div>' +
                '<button type="button" class="entity-op entity-op-danger" data-tpl-del="' + esc(t.id) + '">删除</button>' +
                '</div>';
        }).join('');
        var q = quotaOf(lib);
        body.innerHTML = lead + rows + limitNote(q.count, q.isPro, q.limit);
        bindTemplateBody();
    }

    function bindTemplateBody() {
        var body = document.getElementById('template-manager-body');
        if (!body) return;
        var lib = T();
        if (!lib) return;
        body.querySelectorAll('[data-tpl-rename]').forEach(function (inp) {
            // change 而不是 input：每敲一个字写一次 localStorage，是给手机的磁盘找事做
            inp.addEventListener('change', function () {
                var id = inp.getAttribute('data-tpl-rename');
                var res = lib.rename(id, inp.value);
                if (!res.ok) inp.value = (lib.byId(id) || {}).name || inp.value;
                refreshBars();
            });
        });
        body.querySelectorAll('[data-tpl-del]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                lib.remove(btn.getAttribute('data-tpl-del'));
                drawTemplateBody();
                refreshBars();
            });
        });
    }

    function openTemplateManager() {
        ensureModal(TEMPLATE_MODAL_ID, '模板管理', '每个工具的一套参数 · 免费 2 份',
            'template-manager-body', 'close-template-manager');
        drawTemplateBody();
        openModal(TEMPLATE_MODAL_ID);
    }

    // ====== 初始化 ======
    function init() {
        renderSwitcher();
        // 两个 store 写了一处就重画全局：顶栏要跟着改名字，工具页的模板条也要跟着改可见范围
        ['eurisko:entity-changed', 'eurisko:template-changed'].forEach(function (name) {
            window.addEventListener(name, function () { renderSwitcher(); refreshBars(); });
        });
    }

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
        else init();
    }

    window.EuriskoEntityUI = {
        renderSwitcher: renderSwitcher,
        refreshBars: refreshBars,
        mountTemplateBar: mountTemplateBar,
        saveAsTemplate: saveAsTemplate,
        hintFor: hintFor,
        quotaOf: quotaOf,
        openEntityManager: openEntityManager,
        openTemplateManager: openTemplateManager,
        MODAL_IDS: { entity: ENTITY_MODAL_ID, template: TEMPLATE_MODAL_ID }
    };
})();
