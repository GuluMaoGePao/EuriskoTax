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
    var LEDGER_MODAL_ID = 'ledger-manager-modal';
    var MAX_ROWS = 3;            // 模板条一次铺开几份：超过的进「管理模板」

    var mountedBars = [];        // { hostId, toolId, onPick }：模板改一处，这里全部重画

    function E() { return (typeof window !== 'undefined') ? window.EuriskoEntities : null; }
    function T() { return (typeof window !== 'undefined') ? window.EuriskoTemplates : null; }
    function L() { return (typeof window !== 'undefined') ? window.EuriskoLedger : null; }
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

    // 文案单一真源（docs/guides/user-facing-copy-standard.md）：取不到常量时回落同义兜底
    var COPY = (typeof window !== 'undefined' && window.CopyStandard) ? window.CopyStandard : {};
    var LEAD_COPY = COPY.LEAD || {};
    var UPGRADE_COPY = COPY.UPGRADE || {};
    function txt(v, fallback) { return v || fallback; }

    // 反馈文案一处给出：两页各写一句，迟早有一处改成别的话术，那时用户就只剩猜。
    // PAY-06：额度提示不再提「专业版 / 升级入口」，只说当前额度 + 留资出口。
    function hintFor(res) {
        if (!res) return '存不了模板';
        if (res.ok) return '已存为模板「' + (res.template ? res.template.name : '') + '」· 下次进工具可一键带出';
        if (res.reason === 'limit') return '可保存的 ' + res.limit + ' 份模板已用完（一份没删）；'
            + txt(UPGRADE_COPY.needCode, '需升级码开通') + '更多';
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
        return '<p class="entity-form-note">已到当前可保存上限（' + count + '/' + limit + '）：旧的都不会删，' +
            '继续用也不影响任何测算。' + txt(LEAD_COPY.needMore, '需要更多？留资，由顾问协助 ›') + '</p>';
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
                        : '已到当前可保存上限（1 个主体），旧的不会删；'
                            + txt(LEAD_COPY.needMore, '需要更多？留资，由顾问协助 ›'));
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

    // ====== 阶段19-10 · E3 台账 ======
    //
    // 台账不是第二个历史：**历史是本体，台账是它的一层索引**（期间 / 主体 / 进度）。
    // 因此这里每一行的数据源都是 `EuriskoLedger.rows()` —— 它把历史记录与索引拼成一行；
    // 索引丢了行为还在（行照样列得出，只是没有主体与状态），历史删了行也跟着消失
    // （见 ledger-store.js 的 rowsFor：指向空气的索引不会变成空行）。
    //
    // 为什么「保存即入账」而不加一颗「加入台账」按钮：上一版刚把结果行动条上那个只 step-over
    // 回工具页的第四颗按钮撤掉 —— 这里再加回来就是自打脸。归档该跟着保存发生，
    // 用户要改期间/状态/主体，来这个弹窗改。
    function ledgerLead() {
        return '<p class="entity-modal-lead">台账 = 你的测算按月归档。它<b>不是第二份历史</b>：' +
            '记录本体还在「计算历史」里，台账只多记三样东西 —— 归到哪个月、归到哪个主体、办到哪一步。' +
            '每月重复的那件事，开工具前点一下「复制上月」就不用从零填一遍。</p>';
    }

    function ledgerRetentionNote() {
        var lib = L();
        if (!lib) return '';
        var hidden = typeof lib.hiddenCount === 'function' ? lib.hiddenCount() : 0;
        if (typeof lib.isPro === 'function' && lib.isPro()) return '';
        var months = lib.FREE_MONTHS;
        if (!hidden) {
            return '<p class="entity-form-note">当前可看最近 ' + months + ' 个月，'
                + txt(UPGRADE_COPY.needCode, '需升级码开通') + '更多。' +
                '更老的<b>一条都不会删</b>，只是暂时收起来 —— 视野之外，不是数据之外。</p>';
        }
        return '<p class="entity-form-note">另有 ' + hidden + ' 条更早的记录：当前只列最近 ' + months +
            ' 个月。它们一直在，' + txt(LEAD_COPY.needMore, '需要更多？留资，由顾问协助 ›') + '</p>';
    }

    function statusOptionsHtml(current) {
        var lib = L();
        var list = (lib && lib.STATUS) ? lib.STATUS : [];
        return (list || []).map(function (s) {
            return '<option value="' + esc(s.value) + '"' + (String(s.value) === String(current) ? ' selected' : '') +
                '>' + esc(s.label) + '</option>';
        }).join('');
    }

    function ledgerRowHtml(row, toolName, entityName, prevHit) {
        return '<div class="ledger-row">' +
            '<div class="ledger-row-main">' +
            '<span class="ledger-title">' + esc(row.title) + '</span>' +
            '<span class="ledger-meta">' + esc(toolName || '未登记的测算') +
            ' · ' + esc(entityName || '不按主体') +
            ' · ' + esc(String(row.date || '').slice(0, 10)) + '</span>' +
            '</div>' +
            '<div class="ledger-row-ops">' +
            // 期间：原生 month 输入 —— 键盘可用、手机上有自己的选择器，
            // 自己手写月份选择器十有八九忘了把「没有该月浏览器」这件事考虑进去。
            '<input type="month" class="ledger-period-input" data-ledger-period="' + esc(row.historyId) +
            '" value="' + esc(row.periodKey) + '" aria-label="归到哪个月">' +
            '<select class="ledger-status-select" data-ledger-status="' + esc(row.historyId) +
            '" aria-label="办到哪一步">' + statusOptionsHtml(row.status) + '</select>' +
            (toolName ? '<button type="button" class="entity-op" data-ledger-view="' + esc(row.historyId) +
                '">看这条</button>' : '') +
            (prevHit ? '<button type="button" class="entity-op" data-ledger-copy="' + esc(row.historyId) +
                '" title="' + esc(prevHit.periodKey) + ' 的记录">复制上月</button>' : '') +
            '</div></div>';
    }

    function drawLedgerBody() {
        var body = document.getElementById('ledger-manager-body');
        if (!body) return;
        var lib = L();
        if (!lib) { body.innerHTML = '<p class="entity-form-note">台账模块没加载，历史与导出不受影响。</p>'; return; }
        var rows = typeof lib.visibleRows === 'function' ? lib.visibleRows() : [];
        if (!rows.length) {
            body.innerHTML = ledgerLead() +
                '<p class="entity-form-note">还没有归档的测算：任一工具算出结果后点「保存到历史」，' +
                '它会自动进当月这一格。</p>';
            return;
        }
        var reg = R();
        var ent = E();
        var groups = typeof lib.groupByPeriod === 'function' ? lib.groupByPeriod(rows) : [];
        var html = groups.map(function (g) {
            return '<div class="ledger-period">' +
                '<div class="ledger-period-head"><span>' + esc(g.label) + '</span>' +
                '<span class="ledger-period-count">' + g.rows.length + ' 条</span></div>' +
                g.rows.map(function (row) {
                    var tool = (reg && typeof reg.get === 'function') ? reg.get(row.toolId) : null;
                    var owner = row.entityId && ent && typeof ent.byId === 'function' ? ent.byId(row.entityId) : null;
                    // 「复制上月」只对**这一格真有上月账**的行出现：给没有的行摆一颗点了没反应的
                    // 按钮，就是拿 UI 骗人。
                    var prevHit = typeof lib.prevMonthValues === 'function'
                        ? lib.prevMonthValues({ toolId: row.toolId, entityId: row.entityId, periodKey: row.periodKey })
                        : null;
                    return ledgerRowHtml(row, tool ? tool.name : '', owner ? owner.name : '', prevHit);
                }).join('') +
                '</div>';
        }).join('');
        body.innerHTML = ledgerLead() + html + ledgerRetentionNote();
        bindLedgerBody();
    }

    function bindLedgerBody() {
        var body = document.getElementById('ledger-manager-body');
        if (!body) return;
        var lib = L();
        if (!lib) return;
        body.querySelectorAll('[data-ledger-status]').forEach(function (sel) {
            sel.addEventListener('change', function () {
                lib.setStatus(sel.getAttribute('data-ledger-status'), sel.value);
                drawLedgerBody();
            });
        });
        body.querySelectorAll('[data-ledger-period]').forEach(function (inp) {
            inp.addEventListener('change', function () {
                var res = lib.setPeriod(inp.getAttribute('data-ledger-period'), inp.value);
                drawLedgerBody();
                if (!res.ok) return;      // 期间不合法：重画即回到原值，不再弹窗打扰
            });
        });
        body.querySelectorAll('[data-ledger-view]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var id = btn.getAttribute('data-ledger-view');
                var rec = (lib.historyRecords() || []).filter(function (r) {
                    return String(r.id) === String(id);
                })[0];
                if (!rec) return;
                reopenRecord(rec);
            });
        });
        body.querySelectorAll('[data-ledger-copy]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var id = btn.getAttribute('data-ledger-copy');
                var rowsNow = lib.visibleRows();
                var row = rowsNow.filter(function (r) { return r.historyId === id; })[0];
                if (!row) return;
                var hit = lib.prevMonthValues({ toolId: row.toolId, entityId: row.entityId, periodKey: row.periodKey });
                if (!hit || !hit.record) return;
                closeModal(LEDGER_MODAL_ID);
                reopenRecord(hit.record);
            });
        });
    }

    // 打开一条历史记录：走工具自己的入口而不是跳过表单直接显示结果 ——
    // 「跳到工具页、参数已经填好」才是"带出来"的意思，用户要看也能看到自己改过哪一处。
    function reopenRecord(rec) {
        var toolbox = (typeof window !== 'undefined') ? window.EuriskoToolbox : null;
        if (!toolbox || typeof toolbox.openTool !== 'function') return;
        var lib = L();
        var toolId = (lib && typeof lib.toolIdOf === 'function') ? lib.toolIdOf(rec) : '';
        if (!toolId) return;
        // 两种历史形态的值位置不同：速算器写在 values，完整测算写在 results.values。
        var values = rec && rec.values ? rec.values
            : (rec && rec.results && rec.results.values ? rec.results.values : null);
        toolbox.openTool(toolId, { values: values || undefined });
    }

    function openLedger() {
        ensureModal(LEDGER_MODAL_ID, '我的台账', '按月归档的测算 · 免费看最近 3 个月',
            'ledger-manager-body', 'close-ledger-manager');
        drawLedgerBody();
        openModal(LEDGER_MODAL_ID);
    }

    // ====== 初始化 ======
    function init() {
        renderSwitcher();
        // 两个 store 写了一处就重画全局：顶栏要跟着改名字，工具页的模板条也要跟着改可见范围
        ['eurisko:entity-changed', 'eurisko:template-changed'].forEach(function (name) {
            window.addEventListener(name, function () { renderSwitcher(); refreshBars(); });
        });
        // 台账索引改了：只在弹窗正开着时重画（弹窗是按需建的，关着的时候找 body 是空操作）
        window.addEventListener('eurisko:ledger-changed', function () {
            if (document.getElementById('ledger-manager-body')) drawLedgerBody();
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
        openLedger: openLedger,
        drawLedgerBody: drawLedgerBody,
        MODAL_IDS: { entity: ENTITY_MODAL_ID, template: TEMPLATE_MODAL_ID, ledger: LEDGER_MODAL_ID }
    };
})();
