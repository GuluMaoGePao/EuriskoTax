/**
 * 工具箱 UI（工具页 + 首页场景入口 + 通用速算器页 + 底部 Tab 栏）
 *
 * 分工：
 *   - tool-registry.js：工具元数据（分组 / 场景 / 字段 / 口径 / 政策依据 / 相关工具）
 *   - 本文件：渲染与交互，**不做任何税务计算**（计算一律调用 *-quick.js）
 *
 * 为什么速算器页是「通用」的：
 *   20 个税种的输入字段各不相同，但如果每个工具写一个页面，就又回到「复制粘贴」的老路。
 *   这里用注册表里的 fields schema 渲染表单，用 compute() 拿到统一视图模型
 *   （primary + rows + note）再渲染结果 —— 新增一个税种只需在注册表里加一条。
 *
 * 信息架构（阶段16 重构）：
 *   早期首页是「深度测算」+「税务工具箱」两个并列卡片 —— 那是**实现形态**的分界
 *   （多步骤向导 vs 一屏算完），不是用户心智的分界。现在入口层只有一套按「人/场景」
 *   组织的分类，形态差异降为工具页最后那组「完整测算」的一行说明：
 *     · 首页：搜索入口 → 我是谁（5 张身份卡）→ 最近使用 → 最近计算
 *     · 工具页：搜索 → 5 个场景组 → 完整测算（原 4 张 mode card，按年填全 · 出完整预算表）
 *     · 速算器结果页：结果 + 易错口径 + **下一步**（相关工具 / 保存历史 / 导出 PDF）
 *   保存与导出不再是多步骤流程的专利（阶段16 下放）：差别只剩「填多填少」，不是「能不能存」。
 *   底部 Tab 只在顶层页出现：计算页有自己的预览条，两层底栏会打架。
 */
(function () {
    'use strict';

    var RECENT_KEY = 'euriskoToolRecent';
    var RECENT_MAX = 6;
    var HISTORY_KEY = 'taxCalculationHistory';
    var TOOLS_PAGE = 'tools-page';
    var HOME_PAGE = 'mode-selection-page';
    var PROFILE_PAGE = 'profile-page';
    // 哪些页面显示底部 Tab 栏：顶层页才显示，计算页（含 4 个深度流程与速算器页）不显示
    var TAB_PAGES = [HOME_PAGE, TOOLS_PAGE, PROFILE_PAGE];

    var currentScenario = null;

    function R() { return window.EuriskoToolRegistry; }

    // ====== 工具函数 ======
    function fmtMoney(n) {
        var v = Number(n) || 0;
        return '¥' + v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function fmtPercent(n) {
        var v = Number(n) || 0;
        return (v * 100).toFixed(2) + '%';
    }

    function fmtValue(value, kind) {
        if (kind === 'money') return fmtMoney(value);
        if (kind === 'percent') return fmtPercent(value);
        return value === undefined || value === null || value === '' ? '—' : String(value);
    }

    function esc(s) {
        return String(s === undefined || s === null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    }

    function showPageFn(pageId) {
        if (typeof window.showPage === 'function') window.showPage(pageId);
    }

    // 政策时效徽标：只问 tax-registry，不自己算日期（阶段15 原则 6）
    function policyBadgeOf(policyKey) {
        if (!policyKey || !window.EuriskoTaxRegistry || typeof window.EuriskoTaxRegistry.statusOf !== 'function') return '';
        try {
            var s = window.EuriskoTaxRegistry.statusOf(policyKey);
            if (!s) return '';
            if (s.expired) return '<span class="tool-badge tool-badge-danger">政策已过期 · 结果仅供参考</span>';
            if (s.daysLeft !== null && s.daysLeft <= 180) {
                return '<span class="tool-badge tool-badge-warn">优惠至 ' + esc(s.expiresOn) + ' · 剩 ' + s.daysLeft + ' 天</span>';
            }
            if (s.expiresOn) return '<span class="tool-badge tool-badge-ok">政策有效期至 ' + esc(s.expiresOn) + '</span>';
            return '<span class="tool-badge tool-badge-ok">长期有效</span>';
        } catch (e) {
            return '';
        }
    }

    // ====== 最近使用 ======
    function pushRecent(id) {
        try {
            var list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
            list = list.filter(function (x) { return x !== id; });
            list.unshift(id);
            localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
        } catch (e) { /* 隐私模式忽略 */ }
    }

    function recentTools() {
        try {
            return (JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') || [])
                .map(function (id) { return R().get(id); })
                .filter(Boolean);
        } catch (e) { return []; }
    }

    // ====== 卡片渲染 ======
    // 角标只说用户听得懂的话：曾经用过「App 内可算 / 网页版 / 深度」这类内部术语，
    // 用户不知道什么是「深度」，也不知道为什么有的工具会跳走 —— 现在全部内置，角标即可省略。
    function cardHtml(tool, isDeep) {
        var badge = isDeep ? '<span class="tool-badge tool-badge-deep">多步骤</span>' : '';
        return '' +
            '<div class="tool-entry" data-tool-id="' + esc(tool.id) + '">' +
            '<div class="tool-entry-icon"><i class="fa ' + esc(tool.icon || 'fa-calculator') + '"></i></div>' +
            '<div class="tool-entry-body">' +
            '<div class="tool-entry-title">' + esc(tool.name) + badge + '</div>' +
            '<div class="tool-entry-desc">' + esc(tool.subtitle || '') + '</div>' +
            '</div>' +
            '<i class="fa fa-angle-right tool-entry-arrow"></i>' +
            '</div>';
    }

    function groupSectionHtml(title, desc, tools, isDeep) {
        if (!tools.length) return '';
        return '' +
            '<div class="tool-group">' +
            '<div class="tool-group-head">' +
            '<span class="tool-group-title">' + esc(title) + '</span>' +
            (desc ? '<span class="tool-group-desc">' + esc(desc) + '</span>' : '') +
            '</div>' +
            '<div class="tool-grid-1">' + tools.map(function (t) { return cardHtml(t, isDeep); }).join('') + '</div>' +
            '</div>';
    }

    function bindEntries(scope) {
        scope.querySelectorAll('.tool-entry').forEach(function (el) {
            el.addEventListener('click', function () {
                openTool(this.getAttribute('data-tool-id'));
            });
        });
    }

    // ====== 首页：我是谁（场景入口） ======
    function renderScenarios() {
        var box = document.getElementById('home-scenarios');
        if (!box || !R()) return;
        box.innerHTML = R().scenarios().map(function (s) {
            return '' +
                '<button type="button" class="scenario-card" data-scenario="' + esc(s.id) + '">' +
                '<i class="fa ' + esc(s.icon || 'fa-user') + '"></i>' +
                '<span class="scenario-name">' + esc(s.name) + '</span>' +
                '<span class="scenario-desc">' + esc(s.desc) + '</span>' +
                '</button>';
        }).join('');
        box.querySelectorAll('.scenario-card').forEach(function (el) {
            el.addEventListener('click', function () {
                openScenario(this.getAttribute('data-scenario'));
            });
        });
    }

    // ====== 首页：最近使用 ======
    function renderRecentTools() {
        var card = document.getElementById('home-recent-tools-card');
        var box = document.getElementById('home-recent-tools');
        if (!box) return;
        var list = recentTools();
        if (!list.length) {
            if (card) card.classList.add('hidden');
            return;
        }
        if (card) card.classList.remove('hidden');
        box.innerHTML = list.map(function (t) { return cardHtml(t, t.status === 'deep'); }).join('');
        bindEntries(box);
    }

    // ====== 工具页 ======
    function renderScenarioChip() {
        var chip = document.getElementById('toolbox-scenario-chip');
        if (!chip) return;
        if (!currentScenario) { chip.classList.add('hidden'); chip.innerHTML = ''; return; }
        var scen = R().scenarios().filter(function (s) { return s.id === currentScenario; })[0];
        if (!scen) { chip.classList.add('hidden'); return; }
        chip.classList.remove('hidden');
        chip.innerHTML = '<span class="tool-chip-label">按身份筛选：' + esc(scen.name) + '</span>' +
            '<button type="button" id="toolbox-scenario-clear" class="tool-chip-clear">清除 ›</button>';
        var clear = document.getElementById('toolbox-scenario-clear');
        if (clear) {
            clear.addEventListener('click', function () {
                currentScenario = null;
                renderToolbox(document.getElementById('toolbox-search') ? document.getElementById('toolbox-search').value : '');
            });
        }
    }

    function renderToolbox(keyword, scenarioId) {
        var container = document.getElementById('toolbox-groups');
        if (!container || !R()) return;
        if (scenarioId !== undefined) currentScenario = scenarioId || null;

        var result = R().search(keyword);
        var html = '';

        if (currentScenario) {
            var scen = R().scenarios().filter(function (s) { return s.id === currentScenario; })[0];
            if (scen) html += groupSectionHtml('为你推荐（' + scen.name + '）', scen.desc, R().byScenario(currentScenario), false);
        } else if (result.matched) {
            R().groups().forEach(function (g) {
                var tools = (result.tools || []).filter(function (t) { return t.group === g.id; });
                html += groupSectionHtml(g.name, g.desc, tools, false);
            });
        } else {
            var recent = recentTools();
            if (recent.length) html += groupSectionHtml('最近使用', '', recent, false);
            R().groups().forEach(function (g) {
                var tools = R().byGroup(g.id);
                html += groupSectionHtml(g.name, g.desc, tools, false);
            });
        }

        container.innerHTML = html || '<div class="tool-empty">没有匹配的工具，试试「年终奖」「增值税」「社保」</div>';
        bindEntries(container);

        // 深度测算组是静态 HTML（4 张 mode card，带既有隐藏按钮与 info 按钮），
        // 这里只控制显隐：按身份筛选或搜索无命中时收起，避免与搜索结果互相干扰。
        var deepBox = document.getElementById('toolbox-deep');
        if (deepBox) {
            var hideDeep = !!currentScenario || (result.matched && (!result.deep || result.deep.length === 0));
            if (hideDeep) deepBox.classList.add('hidden');
            else deepBox.classList.remove('hidden');
        }
        renderScenarioChip();
    }

    function openScenario(id) {
        currentScenario = id;
        showPageFn(TOOLS_PAGE);
        renderToolbox('', id);
    }

    // ====== 打开工具 ======
    function openTool(id) {
        var tool = R().get(id);
        if (!tool) return;
        pushRecent(id);

        if (tool.status === 'deep') {
            // 原有深度流程：复用工具页那张卡片里的隐藏按钮，保证与既有初始化逻辑完全一致
            var btn = document.getElementById(tool.id + '-mode-btn');
            if (btn) btn.click();
            else showPageFn(tool.pageId);
            return;
        }
        if (tool.status === 'seo') {
            // 兜底：注册表里若还有未内置的工具，跳落地页（同一份 quick 实现，口径一致）
            window.open(tool.seoPath + '?source=app_toolbox', '_blank');
            return;
        }
        renderQuickPage(tool);
        showPageFn('quick-calculator-page');
    }

    // ====== 通用速算器页 ======
    function visibleFields(tool, values) {
        return (tool.fields || []).filter(function (f) {
            if (!f.when) return true;
            return f.when.in.indexOf(values[f.when.key]) !== -1;
        });
    }

    function fieldHtml(f) {
        var id = 'qf-' + f.key;
        var hint = f.hint ? '<div class="tool-field-hint">' + esc(f.hint) + '</div>' : '';
        var input = '';
        if (f.type === 'select') {
            input = '<select id="' + id + '" class="tool-input">' + f.options.map(function (o) {
                return '<option value="' + esc(o.value) + '"' + (String(o.value) === String(f.default) ? ' selected' : '') + '>' + esc(o.label) + '</option>';
            }).join('') + '</select>';
        } else if (f.type === 'switch') {
            input = '<label class="tool-switch"><input type="checkbox" id="' + id + '"' + (f.default ? ' checked' : '') + '><span>' + (f.default ? '是' : '否') + '</span></label>';
        } else if (f.type === 'percent') {
            input = '<div class="tool-input-wrap"><input type="number" id="' + id + '" class="tool-input" value="' + esc(f.default) + '" step="0.1" min="0"><span class="tool-input-unit">%</span></div>';
        } else {
            input = '<div class="tool-input-wrap"><input type="number" id="' + id + '" class="tool-input" value="' + esc(f.default) + '"' +
                (f.min !== undefined ? ' min="' + f.min + '"' : '') + (f.max !== undefined ? ' max="' + f.max + '"' : '') + '>' +
                '<span class="tool-input-unit">' + (f.type === 'money' ? '元' : '') + '</span></div>';
        }
        return '<div class="tool-field"><label class="tool-label" for="' + id + '">' + esc(f.label) + '</label>' + input + hint + '</div>';
    }

    function readValues(tool) {
        var values = {};
        (tool.fields || []).forEach(function (f) {
            var el = document.getElementById('qf-' + f.key);
            if (!el) { values[f.key] = f.default; return; }
            if (f.type === 'switch') {
                values[f.key] = el.checked;
            } else if (f.type === 'select') {
                // 选项值可能是字符串（如 'general'）也可能是数字（如税率 0.13）：
                // 只有**默认值是数字**的 select 才还原成数字，否则保留原字符串。
                // （曾在这里统一过 isFinite 校验，结果 'general' 被判为非法归零，
                //   增值税切换计税场景后条件字段全部消失 —— 该 bug 由 tests/toolbox-ui.test.js 钉住）
                values[f.key] = typeof f.default === 'number' ? Number(el.value) : el.value;
            } else {
                values[f.key] = parseFloat(el.value);
                if (!isFinite(values[f.key])) values[f.key] = 0;
            }
        });
        return values;
    }

    function renderResult(tool, values) {
        var box = document.getElementById('quick-result');
        if (!box) return null;
        var out;
        try {
            out = tool.compute(values);
        } catch (e) {
            box.innerHTML = '<div class="tool-empty">计算失败：' + esc(e.message || e) + '</div>';
            return null;
        }
        if (!out) {
            box.innerHTML = '<div class="tool-empty">计算模块未加载，请刷新页面后重试</div>';
            return null;
        }
        if (out.error) {
            box.innerHTML = '<div class="tool-empty">' + esc(out.error) + '</div>';
            return null;
        }

        var rowsHtml = (out.rows || []).map(function (r) {
            return '<div class="tool-result-row">' +
                '<span class="tool-result-label">' + esc(r.label) + (r.hint ? '<i class="fa fa-question-circle tool-result-hint" title="' + esc(r.hint) + '"></i>' : '') + '</span>' +
                '<span class="tool-result-value">' + fmtValue(r.value, r.kind) + '</span>' +
                '</div>';
        }).join('');

        box.innerHTML = '' +
            '<div class="tool-result-primary">' +
            '<div class="tool-result-primary-label">' + esc(out.primary.label) + '</div>' +
            '<div class="tool-result-primary-value">' + fmtValue(out.primary.value, out.primary.kind) + '</div>' +
            '</div>' +
            '<div class="tool-result-rows">' + rowsHtml + '</div>' +
            (out.note ? '<div class="tool-result-note"><i class="fa fa-info-circle mr-1"></i>' + esc(out.note) + '</div>' : '');

        renderNextSteps(tool, values, out);
        return out;
    }

    // ====== 结果页「下一步」======
    // 结果不该是终点：给出相关工具（互链）、保存历史、导出 PDF，把一次测算接成一条动线。
    function renderNextSteps(tool, values, out) {
        var box = document.getElementById('quick-next');
        if (!box) return;
        var next = (tool.nextTools || []).map(function (id) { return R().get(id); }).filter(Boolean);
        if (!next.length) { box.classList.add('hidden'); box.innerHTML = ''; return; }
        box.classList.remove('hidden');
        box.innerHTML = '' +
            '<div class="tool-next-head">算完还能干什么</div>' +
            '<div class="tool-next-list">' + next.map(function (t) {
                return '<button type="button" class="tool-next-item" data-tool-id="' + esc(t.id) + '">' +
                    '<i class="fa ' + esc(t.icon || 'fa-calculator') + '"></i>' +
                    '<span>' + esc(t.name) + '</span>' +
                    '<i class="fa fa-angle-right"></i>' +
                    '</button>';
            }).join('') + '</div>' +
            '<div class="tool-next-actions">' +
            '<button type="button" id="quick-save-history" class="tool-next-btn"><i class="fa fa-bookmark-o"></i>保存到历史</button>' +
            // 阶段16：导出 PDF 不再是多步骤流程的专利 —— 速算器算完同样能带走一份
            '<button type="button" id="quick-export-pdf" class="tool-next-btn"><i class="fa fa-file-pdf-o"></i>导出 PDF</button>' +
            '</div>';

        box.querySelectorAll('.tool-next-item').forEach(function (el) {
            el.addEventListener('click', function () { openTool(this.getAttribute('data-tool-id')); });
        });

        var saveBtn = document.getElementById('quick-save-history');
        if (saveBtn) {
            saveBtn.addEventListener('click', function () {
                var ok = saveToHistory(tool, values, out);
                this.innerHTML = ok ? '<i class="fa fa-check"></i>已保存到历史' : '<i class="fa fa-exclamation-circle"></i>保存失败';
                this.disabled = true;
            });
        }

        var pdfBtn = document.getElementById('quick-export-pdf');
        if (pdfBtn) {
            pdfBtn.addEventListener('click', function () {
                var lib = window.EuriskoQuickReport;
                var ok = lib && typeof lib.exportQuickResult === 'function'
                    ? lib.exportQuickResult(tool, values, out)
                    : false;
                // 失败时保持按钮可点：提示已由导出模块给出，用户修好环境可再来一次
                if (ok) {
                    this.innerHTML = '<i class="fa fa-check"></i>已导出 PDF';
                    this.disabled = true;
                }
            });
        }
    }

    // 写入与首页「最近计算」同一份存储（taxCalculationHistory），
    // 让速算器结果也进历史 —— 这是深度流程原本独有的能力，现在两种形态收敛。
    function saveToHistory(tool, values, out) {
        try {
            var list = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
            list.push({
                id: 'quick-' + Date.now(),
                date: new Date().toISOString(),
                type: 'quick',
                title: tool.name,
                source: 'quick',
                toolId: tool.id,
                values: values,
                result_data: { totalTax: Number(out.primary.value) || 0 }
            });
            localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
            if (typeof window.refreshHomeRecent === 'function') window.refreshHomeRecent();
            return true;
        } catch (e) {
            return false;
        }
    }

    function renderQuickPage(tool) {
        var titleEl = document.getElementById('quick-title');
        var subEl = document.getElementById('quick-subtitle');
        var badgeEl = document.getElementById('quick-policy-badge');
        var formEl = document.getElementById('quick-form');
        var pitEl = document.getElementById('quick-pitfalls');
        var linkEl = document.getElementById('quick-seo-link');

        if (titleEl) titleEl.textContent = tool.name;
        if (subEl) subEl.textContent = tool.subtitle || '';
        if (badgeEl) badgeEl.innerHTML = policyBadgeOf(tool.policyKey);
        if (linkEl) linkEl.href = (tool.seoPath || '/seo/index.html') + '?source=app_quick';

        if (pitEl) {
            pitEl.innerHTML = (tool.pitfalls || []).length
                ? '<div class="tool-pitfall-head"><i class="fa fa-exclamation-triangle mr-1"></i>易错口径</div><ul>' +
                tool.pitfalls.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul>'
                : '';
        }

        if (!formEl) return;

        function build() {
            var values = readValues(tool);
            formEl.innerHTML = visibleFields(tool, values).map(fieldHtml).join('');
            formEl.querySelectorAll('input, select').forEach(function (el) {
                el.addEventListener('input', function () {
                    // 条件字段变化时需要重建表单（如切换增值税计税场景）
                    if (el.tagName === 'SELECT') { build(); return; }
                    renderResult(tool, readValues(tool));
                });
                el.addEventListener('change', function () {
                    if (el.tagName === 'SELECT' || el.type === 'checkbox') { build(); return; }
                    renderResult(tool, readValues(tool));
                });
            });
            renderResult(tool, readValues(tool));
        }

        build();
    }

    // ====== 底部 Tab 栏 ======
    function updateTabBar() {
        var bar = document.getElementById('bottom-tabbar');
        if (!bar) return;
        var activeEl = document.querySelector('.page.active');
        var activeId = activeEl ? activeEl.id : null;
        var visible = TAB_PAGES.indexOf(activeId) !== -1;
        if (visible) bar.classList.remove('hidden');
        else bar.classList.add('hidden');
        // 让页面底部留出 Tab 栏的高度，避免遮住最后一张卡片
        if (visible) document.body.classList.add('has-tabbar');
        else document.body.classList.remove('has-tabbar');
        bar.querySelectorAll('.bottom-tab').forEach(function (btn) {
            var t = btn.getAttribute('data-tab');
            if (t === activeId) btn.classList.add('active');
            else btn.classList.remove('active');
        });
    }

    function initTabBar() {
        var bar = document.getElementById('bottom-tabbar');
        if (!bar) return;
        bar.querySelectorAll('.bottom-tab').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var t = this.getAttribute('data-tab');
                if (t === 'assistant') {
                    // 助手是抽屉不是页面：唤起悬浮球即可，不切换页面
                    var fab = document.getElementById('tax-assistant-fab');
                    if (fab) fab.click();
                    return;
                }
                showPageFn(t);
                updateTabBar();
            });
        });
        // showPage 是全局唯一的路由实现（auth-ui.js），这里不侵入它，
        // 改为观察 .page 的 class 变化统一刷新 Tab 栏状态。
        if (typeof window.MutationObserver === 'function') {
            var timer = null;
            var observer = new window.MutationObserver(function () {
                if (timer) return;
                timer = setTimeout(function () { timer = null; updateTabBar(); }, 30);
            });
            observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
        }
        updateTabBar();
    }

    // ====== 初始化 ======
    function init() {
        renderScenarios();
        renderRecentTools();
        renderToolbox('');

        // 首页搜索入口：进入工具页并聚焦搜索框（24 个工具时，搜索比浏览快）
        var entry = document.getElementById('toolbox-search-entry');
        if (entry) {
            entry.addEventListener('click', function () {
                // 从搜索入口进工具页 = 重新找工具，清掉上一次的身份筛选
                currentScenario = null;
                renderToolbox('');
                showPageFn(TOOLS_PAGE);
                var input = document.getElementById('toolbox-search');
                if (input) input.focus();
            });
        }

        // 首页「最近使用」清空
        var clearRecent = document.getElementById('home-recent-tools-clear');
        if (clearRecent) {
            clearRecent.addEventListener('click', function () {
                try { localStorage.removeItem(RECENT_KEY); } catch (e) { /* ignore */ }
                renderRecentTools();
                renderToolbox('');
            });
        }

        var searchEl = document.getElementById('toolbox-search');
        if (searchEl) {
            var timer = null;
            searchEl.addEventListener('input', function () {
                var kw = this.value;
                clearTimeout(timer);
                timer = setTimeout(function () { renderToolbox(kw, null); }, 150);
            });
        }

        var backBtn = document.getElementById('quick-back-btn');
        if (backBtn) {
            backBtn.addEventListener('click', function () {
                // 速算器页总是从工具页进来，返回工具页而不是首页（回到列表更好找下一个工具）
                showPageFn(TOOLS_PAGE);
            });
        }

        initTabBar();
    }

    window.EuriskoToolbox = {
        init: init,
        renderToolbox: renderToolbox,
        renderScenarios: renderScenarios,
        openTool: openTool,
        openScenario: openScenario,
        updateTabBar: updateTabBar
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
