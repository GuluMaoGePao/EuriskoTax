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
    // 上一次 syncNav 看到的页面：用来判断「是不是刚切进工具页」（避免反复抢焦点）
    var lastNavPage = null;

    // 聚焦工具页搜索框（仅桌面；手机弹键盘会顶掉半屏）
    function focusSearchIfDesktop() {
        // jsdom 与无布局环境下 innerWidth 可能是 0 —— 这时按桌面处理，别把功能整个关掉
        var w = window.innerWidth || 0;
        if (w > 0 && w < 768) return;
        var el = document.getElementById('toolbox-search');
        if (el && typeof el.focus === 'function') el.focus();
    }

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

    // ====== 阶段19-8：效率层 E5（参数记忆 / 带参链接）======
    // 两个模块都是**可选**的：取不到就整块功能不出现（速算器照常用），
    // 绝不因为"记忆读不出来"把测算本身拖挂 —— 那是用便利换可用，不划算。
    function memoryLib() { return window.EuriskoParamMemory; }
    function linkLib() { return window.EuriskoParamLink; }

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

    // ====== 政策依据（页内展开，不外跳）======
    // 为什么这里一条 <a> 都不给：微信 / PWA standalone 里外链要么被拦、要么把用户带出应用，
    // 结果页自证其说的最后一环就断了。改成就地展开 + 一键复制文号 —— 文号能直接粘进
    // 报告或微信对话（这正是「给老板看」的场景），也不依赖网络跳转。
    // 口径仍然单一来源：只问 tax-registry 的 basisOf，页面从不自己抄文号。
    function policyBasisOf(tool) {
        var reg = window.EuriskoTaxRegistry;
        if (!tool || !tool.policyKey || !reg || typeof reg.basisOf !== 'function') return [];
        try {
            return reg.basisOf(tool.policyKey) || [];
        } catch (e) {
            return [];
        }
    }

    // 复制出去的形状：一行一条，「文号 —— 标题」（顾问与 HR 直接可读）
    function policyBasisText(basis) {
        return (basis || []).map(function (b) {
            var doc = b.doc || '';
            var title = b.title || '';
            if (doc && title) return doc + ' —— ' + title;
            return doc || title;
        }).filter(Boolean).join('\n');
    }

    function renderPolicyBasis(tool) {
        var wrap = document.getElementById('quick-policy-basis');
        var body = document.getElementById('quick-policy-basis-body');
        var copyBtn = document.getElementById('quick-basis-copy');
        if (!wrap || !body) return;

        var basis = policyBasisOf(tool);
        if (!basis.length) {
            wrap.classList.add('hidden');
            return;
        }
        wrap.classList.remove('hidden');
        body.innerHTML = basis.map(function (b) {
            return '<div class="tool-basis-item">' +
                (b.doc ? '<div class="text-gray-700 font-medium">' + esc(b.doc) + '</div>' : '') +
                (b.title ? '<div>' + esc(b.title) + '</div>' : '') +
                '</div>';
        }).join('');

        if (copyBtn) {
            copyBtn.onclick = function () {
                var lib = window.EuriskoEnv;
                var ok = lib && typeof lib.copyToClipboard === 'function'
                    ? lib.copyToClipboard(policyBasisText(basis))
                    : false;
                var old = copyBtn.textContent;
                copyBtn.textContent = ok ? '已复制文号' : '复制失败，请长按选择';
                setTimeout(function () { copyBtn.textContent = old; }, 2000);
            };
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

    // ====== 分组展开状态（阶段19-3：场景组默认折叠 + 记忆）======
    // 41 个入口一次全铺开，等于没有目录。折叠**只加 class 不重建 DOM** —— 入口始终在文档里
    // （可达性不受影响），重建则会把「最近使用」这类动态区已经绑好的事件一起冲掉。
    var GROUP_OPEN_KEY = 'euriskoToolGroupOpen';

    function readGroupOpen() {
        try { return JSON.parse(localStorage.getItem(GROUP_OPEN_KEY) || '{}') || {}; } catch (e) { return {}; }
    }

    // 记忆优先；没记过的按 defaultOpen（场景组默认折叠，「最近使用」默认展开 —— 它只有几条，
    // 是回访用户的快捷通道，收起来等于把这层价值也收掉了）。
    function isGroupOpen(id, defaultOpen) {
        if (!id) return !!defaultOpen;
        var m = readGroupOpen();
        if (Object.prototype.hasOwnProperty.call(m, id)) return m[id] === true;
        return !!defaultOpen;
    }

    function setGroupOpen(id, open) {
        if (!id) return;
        try {
            var m = readGroupOpen();
            m[id] = !!open;
            localStorage.setItem(GROUP_OPEN_KEY, JSON.stringify(m));
        } catch (e) { /* 隐私模式忽略 */ }
    }

    function applyGroupOpen(groupEl, open) {
        if (!groupEl) return;
        if (open) groupEl.classList.remove('is-collapsed');
        else groupEl.classList.add('is-collapsed');
        var head = groupEl.querySelector ? groupEl.querySelector('[data-group-toggle]') : null;
        if (head) head.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    function bindGroupToggles(scope) {
        if (!scope || !scope.querySelectorAll) return;
        scope.querySelectorAll('[data-group-toggle]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var group = btn.closest ? btn.closest('.tool-group') : btn.parentNode;
                var open = group ? group.classList.contains('is-collapsed') : false;
                setGroupOpen(btn.getAttribute('data-group-toggle'), open);
                applyGroupOpen(group, open);
            });
        });
    }

    // ====== 卡片状态微标签（阶段19-3）======
    // 判据全部来自真源，这里不猜：算过读 taxCalculationHistory（与首页「最近计算」同一份），
    // 热门 / 可对比读注册表标记（tool.hot / tool.comparable）。
    var flagIndexCache = null;

    function refreshFlags() { flagIndexCache = null; }

    function flagIndex() {
        if (flagIndexCache) return flagIndexCache;
        var map = {};
        try {
            (JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') || []).forEach(function (r) {
                if (!r || !r.toolId) return;
                var t = Date.parse(r.date || '') || 0;
                if (!map[r.toolId] || t > map[r.toolId]) map[r.toolId] = t;
            });
        } catch (e) { /* 忽略坏数据 */ }
        flagIndexCache = map;
        return map;
    }

    function flagHtml(tool) {
        var out = '';
        var ts = flagIndex()[tool.id] || 0;
        if (ts) {
            var days = Math.floor((Date.now() - ts) / 86400000);
            var text = '算过';
            if (days <= 0) text = '今天算过';
            else if (days === 1) text = '昨天算过';
            else if (days <= 30) text = '算过 · ' + days + ' 天前';
            out += '<span class="tool-entry-flag tool-entry-flag-done">' + text + '</span>';
        }
        if (tool.hot) out += '<span class="tool-entry-flag tool-entry-flag-hot">热门</span>';
        if (tool.comparable) out += '<span class="tool-entry-flag">可对比</span>';
        return out ? '<div class="tool-entry-flags">' + out + '</div>' : '';
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
            flagHtml(tool) +
            '</div>' +
            '<i class="fa fa-angle-right tool-entry-arrow"></i>' +
            '</div>';
    }

    function groupSectionHtml(title, desc, tools, isDeep, opts) {
        if (!tools.length) return '';
        opts = opts || {};
        var gid = opts.id || '';
        // 搜索 / 按身份筛选时**一律展开**：这时候用户就是要看结果，折叠是纯粹的障碍。
        // 强制展开不写进记忆（否则搜一次就把所有组的默认状态改掉了）。
        var open = !!opts.forceOpen || isGroupOpen(gid, !!opts.defaultOpen);
        return '' +
            '<div class="tool-group' + (open ? '' : ' is-collapsed') + '" data-group="' + esc(gid) + '">' +
            '<button type="button" class="tool-group-head" data-group-toggle="' + esc(gid) + '"' +
            ' aria-expanded="' + (open ? 'true' : 'false') + '">' +
            '<i class="fa fa-angle-down tool-group-caret" aria-hidden="true"></i>' +
            '<span class="tool-group-title">' + esc(title) + '</span>' +
            '<span class="tool-group-count">' + tools.length + ' 个</span>' +
            (desc ? '<span class="tool-group-desc">' + esc(desc) + '</span>' : '') +
            '</button>' +
            '<div class="tool-group-body">' +
            '<div class="tool-grid-1">' + tools.map(function (t) { return cardHtml(t, isDeep); }).join('') + '</div>' +
            '</div>' +
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
        refreshFlags();
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
        // 微标签读的是历史：每次重渲染都重新取一次，否则刚算完的那一条不显示「今天算过」
        refreshFlags();
        var forceOpen = !!currentScenario || !!result.matched;

        if (currentScenario) {
            var scen = R().scenarios().filter(function (s) { return s.id === currentScenario; })[0];
            if (scen) html += groupSectionHtml('为你推荐（' + scen.name + '）', scen.desc, R().byScenario(currentScenario), false,
                { id: 'scenario', forceOpen: forceOpen, defaultOpen: true });
        } else if (result.matched) {
            R().groups().forEach(function (g) {
                var tools = (result.tools || []).filter(function (t) { return t.group === g.id; });
                html += groupSectionHtml(g.name, g.desc, tools, false, { id: g.id, forceOpen: forceOpen });
            });
        } else {
            var recent = recentTools();
            if (recent.length) html += groupSectionHtml('最近使用', '', recent, false,
                { id: 'recent', forceOpen: forceOpen, defaultOpen: true });
            R().groups().forEach(function (g) {
                var tools = R().byGroup(g.id);
                html += groupSectionHtml(g.name, g.desc, tools, false, { id: g.id, forceOpen: forceOpen });
            });
        }

        container.innerHTML = html || '<div class="tool-empty">没有匹配的工具，试试「年终奖」「增值税」「社保」</div>';
        bindEntries(container);
        bindGroupToggles(container);

        // 深度测算组是静态 HTML（4 张 mode card，带既有隐藏按钮与 info 按钮），
        // 这里只控制显隐：按身份筛选或搜索无命中时收起，避免与搜索结果互相干扰。
        var deepBox = document.getElementById('toolbox-deep');
        if (deepBox) {
            var hideDeep = !!currentScenario || (result.matched && (!result.deep || result.deep.length === 0));
            if (hideDeep) deepBox.classList.add('hidden');
            else deepBox.classList.remove('hidden');
            // 完整测算组是静态 HTML（4 张 mode card 的事件在别处绑定），这里只补折叠与计数，
            // 绝不重建它的 DOM —— 重建会让那 4 颗隐藏按钮的初始化逻辑全部失效。
            applyGroupOpen(deepBox, forceOpen || isGroupOpen('deep', false));
            var deepCount = document.getElementById('toolbox-deep-count');
            if (deepCount) deepCount.textContent = (R().deep() || []).length + ' 个';
            if (deepBox.getAttribute('data-group-bound') !== '1') {
                bindGroupToggles(deepBox);
                deepBox.setAttribute('data-group-bound', '1');
            }
        }
        renderDeepEntries();
        renderScenarioChip();
    }

    // ====== 完整测算：增量接线（为阶段17「deep 工具 > 4 个」铺路） ======
    // 既有 4 张 mode-card 是静态 HTML，卡片内的隐藏按钮（${id}-mode-btn）在 app.js / home-ui.js
    // 已被绑定了一整套页面初始化逻辑 —— 绝不能用 innerHTML 重建它们，否则事件会全部丢失。
    // 因此这里**只对注册表中尚无静态卡片的 deep 工具做追加式渲染**：
    //   现在 deep 恰好 4 个且全都有静态卡 → 动态区渲染 0 张且容器 hidden，所见与改动前完全一致；
    //   阶段17 新增 deep 税种后 → 自动出现在「完整测算」组，不必再改 index.html。
    function renderDeepEntries() {
        var host = document.getElementById('toolbox-deep-extra');
        if (!host || !R()) return;
        var extra = (R().deep() || []).filter(function (t) {
            return !document.getElementById(t.id + '-mode-card');
        });
        if (!extra.length) {
            host.innerHTML = '';
            host.classList.add('hidden');
            return;
        }
        host.classList.remove('hidden');
        host.innerHTML = extra.map(function (t) { return cardHtml(t, true); }).join('');
        bindEntries(host);
    }

    function openScenario(id) {
        currentScenario = id;
        showPageFn(TOOLS_PAGE);
        renderToolbox('', id);
    }

    // ====== 打开工具 ======
    function openTool(id, opts) {
        var tool = R().get(id);
        if (!tool) return;
        opts = opts || {};
        pushRecent(id);

        if (tool.status === 'deep') {
            // 阶段17：spec 驱动的完整测算（没有独立页面）—— 交给通用向导按注册表渲染。
            // 放在 mode-btn 分支**之前**（17B-1）：这类工具的入口就是 spec，不该再复用到页面式的
            // mode-btn —— business 迁移后若仍走 business-mode-btn，卡片点下去会被带回旧页面。
            // W.has 只对 spec 驱动的返回 true（其余 3 个 deep 有 pageId，不受影响）。
            var W = window.EuriskoDeepWizard;
            if (W && W.has(tool) && W.open(tool.id, { values: opts.values })) return;
            // 原有深度流程：复用工具页那张卡片里的隐藏按钮，保证与既有初始化逻辑完全一致
            var btn = document.getElementById(tool.id + '-mode-btn');
            if (btn) { btn.click(); return; }
            // 目标页面若尚未落地则**不跳转**：否则 showPage 会切到一个不存在的 DOM，留下白屏。
            if (tool.pageId && document.getElementById(tool.pageId)) showPageFn(tool.pageId);
            return;
        }
        if (tool.status === 'seo') {
            // 兜底：注册表里若还有未内置的工具，跳落地页（同一份 quick 实现，口径一致）
            window.open(tool.seoPath + '?source=app_toolbox', '_blank');
            return;
        }
        renderQuickPage(tool, opts.values);
        showPageFn('quick-calculator-page');
    }

    // ====== 通用速算器页 ======
    // 从历史记录打开时带进来的那一份输入（阶段18-2）：只服务于速算器这一页，换工具即作废
    var quickSeed = null;
    // 阶段19-7：视图偏好变更时用来重画当前速算器表单（换工具时指向新那份 build）
    var modeRebuild = null;
    // 阶段19-8：「清空」那一瞬间要按 spec 默认值重画，并**停掉一次记忆写入** ——
    // 否则重画触发的重算会立刻把默认值又记回去，等于清空了个寂寞（用户点一下，提示马上回来）。
    var memorySuppressed = false;

    function specDefaults(tool) {
        var d = {};
        (tool.fields || []).forEach(function (f) { d[f.key] = f.default; });
        return d;
    }

    function visibleFields(tool, values) {
        return (tool.fields || []).filter(function (f) {
            if (!f.when) return true;
            return f.when.in.indexOf(values[f.when.key]) !== -1;
        });
    }

    // ====== 阶段19-7：视图密度（简明 / 完整）======
    // 模式只在这里读一次，渲染层不各自判断 localStorage —— 否则两份默认值迟早分家。
    function modeLib() { return window.EuriskoModePref; }

    // 偏好模块不在时按**完整**渲染：宁可多显示一组参数，也绝不在用户不知情时把它们收起来。
    // （index.html 里 mode-pref.js 排在 toolbox-ui.js 之前，正常情况下它一定在。）
    function isFullMode() {
        var p = modeLib();
        return !p || p.get() === p.FULL;
    }

    // 未声明 level 的字段一律 basic（注册表是纯增量声明，存量 20 个速算器不必逐个改）
    function isAdvanced(f) { return f && f.level === 'advanced'; }

    function partitionFields(fields) {
        var basic = [], advanced = [];
        (fields || []).forEach(function (f) { (isAdvanced(f) ? advanced : basic).push(f); });
        return { basic: basic, advanced: advanced };
    }

    // advanced 字段**永远留在 DOM 里**（收进可展开的折叠块），从不 display:none：
    // ① 简明视图下用户也能临时展开用一次，不必为了一个参数去改全局偏好；
    // ② readValues 始终能读到它们，切换视图不会丢已填的值（三条守护测试之三）。
    // renderFn 可选：完整测算向导有 repeater 字段，得用自己的渲染器（默认就是速算器这份 fieldHtml）
    function advancedBlockHtml(fields, values, renderFn) {
        if (!fields.length) return '';
        var draw = typeof renderFn === 'function' ? renderFn : function (f) { return fieldHtml(f, values); };
        var open = isFullMode() ? ' open' : '';
        return '<details class="tool-advanced-block mt-3"' + open + '>' +
            '<summary class="flex items-center justify-between cursor-pointer select-none px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm font-medium text-gray-700">' +
            '<span><i class="fa fa-sliders mr-2"></i>更多参数（可选）</span>' +
            '<span class="text-xs text-gray-500">' + fields.length + ' 项 · 不填按默认值</span>' +
            '</summary>' +
            '<div class="mt-3">' + fields.map(draw).join('') + '</div>' +
            '</details>';
    }

    // 页头那颗 pill：就地切换、即时生效。两个分段都常驻，当前档高亮 ——
    // 不做成「点一下切换」的单按钮：那样用户看不出下一次点击会发生什么。
    function modePillHtml() {
        var p = modeLib();
        if (!p) return '';
        var full = p.get() === p.FULL;
        function seg(mode, label, on) {
            return '<button type="button" class="mode-pill-seg' + (on ? ' is-on' : '') + '" data-mode="' + mode + '"' +
                ' aria-pressed="' + (on ? 'true' : 'false') + '">' + label + '</button>';
        }
        return '<div class="mode-pill" role="group" aria-label="视图密度" title="简明：只填必填项，直接出结论 ｜ 完整：可调全部参数，看逐项推导">' +
            seg(p.SIMPLE, '简明', !full) + seg(p.FULL, '完整', full) +
            '</div>';
    }

    // onSwitch 留给需要「先收值再重画」的宿主（完整测算向导的 pill 就用它）
    function renderModePillIn(hostId, onSwitch) {
        var host = document.getElementById(hostId);
        if (!host) return;
        host.innerHTML = modePillHtml();
        host.querySelectorAll('.mode-pill-seg').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var p = modeLib();
                if (!p) return;
                // 值不用重读：advanced 字段始终在 DOM 里，重画时会自己读一遍当前值
                p.set(btn.getAttribute('data-mode') === p.FULL ? p.FULL : p.SIMPLE);
                if (typeof onSwitch === 'function') onSwitch();
            });
        });
    }

    function renderModePill() { renderModePillIn('quick-mode-pill'); }

    // values 可选：给「回填一份已有输入」用（阶段18-2 从历史记录打开）。不传就是原行为 ——
    // 用 spec 声明的 default。deep-wizard-ui.js 复用这一个函数渲染字段，第二参缺省即不受影响。
    // opts 可选（阶段19-8 键盘走查）：
    //   · inputmode：数字键盘（手机上 type=number 只保证能输数字，不保证弹出九宫格）
    //   · enterkeyhint：告诉手机键盘这颗回车键该显示「前往 / 下一步」，
    //     速算器是"看结果"、向导是"下一步" —— 由调用方按自己的语义传，这里不猜。
    function fieldHtml(f, values, opts) {
        var cur = values && values[f.key] !== undefined ? values[f.key] : f.default;
        var id = 'qf-' + f.key;
        var hint = f.hint ? '<div class="tool-field-hint">' + esc(f.hint) + '</div>' : '';
        var ekh = opts && opts.enterkeyhint ? ' enterkeyhint="' + esc(opts.enterkeyhint) + '"' : '';
        var input = '';
        if (f.type === 'select') {
            input = '<select id="' + id + '" class="tool-input"' + ekh + '>' + f.options.map(function (o) {
                return '<option value="' + esc(o.value) + '"' + (String(o.value) === String(cur) ? ' selected' : '') + '>' + esc(o.label) + '</option>';
            }).join('') + '</select>';
        } else if (f.type === 'switch') {
            input = '<label class="tool-switch"><input type="checkbox" id="' + id + '"' + (cur ? ' checked' : '') + '><span>' + (cur ? '是' : '否') + '</span></label>';
        } else if (f.type === 'percent') {
            input = '<div class="tool-input-wrap"><input type="number" id="' + id + '" class="tool-input" value="' + esc(cur) + '" step="0.1" min="0" inputmode="decimal"' + ekh + '><span class="tool-input-unit">%</span></div>';
        } else {
            input = '<div class="tool-input-wrap"><input type="number" id="' + id + '" class="tool-input" value="' + esc(cur) + '" inputmode="decimal"' + ekh +
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

    // ====== 结果页行动条（阶段19-4：四按钮常驻）======
    // 与「相关工具」解耦：那一整块只在有 nextTools 时才渲染，而保存 / 导出是每次测算都要有的出口 ——
    // 挂在它下面等于把出口交给了别人的数据（没有相关工具的速算器算完连保存都没有）。
    function deepCounterpartOf(tool) {
        var list = (R() && typeof R().deep === 'function') ? R().deep() : [];
        var id = tool.id + '-deep';
        for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return id;
        return '';
    }

    function resultTextOf(tool, out) {
        var lines = [tool.name, out.primary.label + '：' + fmtValue(out.primary.value, out.primary.kind)];
        (out.rows || []).forEach(function (r) {
            lines.push('· ' + r.label + '：' + fmtValue(r.value, r.kind));
        });
        if (out.note) lines.push('注：' + out.note);
        lines.push('（由 EuriskoTax 测算，仅供参考；正式申报以税务机关核定为准）');
        return lines.join('\n');
    }

    // ====== 阶段19-8：复制为表格（TSV）======
    // 与「复制结果」是两种去处：明文是贴进聊天框给人读的，表格是贴进 Excel 接着算的。
    // 金额列刻意输出**裸数字**（不带 ¥、不带千分位）—— 带符号会被 Excel 认成文本，
    // 贴进去不能求和，那这个按钮就白做了（验收口径就是"粘进 Excel 列对齐"）。
    function tableCellOf(value, kind) {
        if (kind === 'percent') {
            var v = Number(value) || 0;
            return (v * 100).toFixed(2) + '%';
        }
        if (kind === 'money') {
            var n = Number(value);
            return isFinite(n) ? n.toFixed(2) : '';
        }
        return value === undefined || value === null ? '' : String(value);
    }

    function tableTextOf(tool, out) {
        var lines = [tool.name, '项目\t数值'];
        lines.push(out.primary.label.replace(/\t/g, ' ') + '\t' + tableCellOf(out.primary.value, out.primary.kind));
        (out.rows || []).forEach(function (r) {
            lines.push(String(r.label).replace(/\t/g, ' ') + '\t' + tableCellOf(r.value, r.kind));
        });
        if (out.note) lines.push('注\t' + String(out.note).replace(/\t/g, ' '));
        return lines.join('\n');
    }

    function legacyCopy(text) {
        try {
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            var ok = document.execCommand('copy');
            document.body.removeChild(ta);
            return ok;
        } catch (e) { return false; }
    }

    // 微信内置浏览器 / 非安全上下文里 navigator.clipboard 常常不存在或直接抛错 ——
    // 必须有降级路径，否则按钮点了没反应（用户只会以为"这个功能坏了"）。
    function copyText(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text).then(
                function () { return true; },
                function () { return legacyCopy(text); }
            );
        }
        return Promise.resolve(legacyCopy(text));
    }

    // 次级复制动作（表格 / 链接）共用一套反馈：成功与失败都要说出来，且都回到原样 ——
    // 复制是「带走」的动作，不像保存那样一次性，按钮不该变成"已完成"的死状态。
    function bindCopyButton(id, textFn) {
        var btn = document.getElementById(id);
        if (!btn) return;
        var origin = btn.innerHTML;
        function restore() { btn.innerHTML = origin; }
        btn.addEventListener('click', function () {
            var text = '';
            try { text = textFn() || ''; } catch (e) { text = ''; }
            if (!text) {
                btn.innerHTML = '<i class="fa fa-exclamation-circle"></i>生成失败';
                setTimeout(restore, 1600);
                return;
            }
            copyText(text).then(function (ok) {
                btn.innerHTML = ok ? '<i class="fa fa-check"></i>已复制' : '<i class="fa fa-exclamation-circle"></i>复制失败';
                setTimeout(restore, 1600);
            });
        });
    }

    function renderQuickActions(tool, values, out) {
        var box = document.getElementById('quick-actions');
        if (!box) return;
        // 第四个按钮 = 下一步：有同名的完整测算就进完整版（速算器与完整测算本就是同一件事的
        // 两种深度，§3.9.2），没有就回工具页 —— 恒为四按钮，不留空位也不临时变三按钮。
        var deepId = deepCounterpartOf(tool);
        var fourth = deepId
            ? '<button type="button" id="quick-open-deep" class="quick-action-btn" data-deep-id="' + esc(deepId) + '"><i class="fa fa-list-ol"></i>按年填全的完整版</button>'
            : '<button type="button" id="quick-back-tools" class="quick-action-btn"><i class="fa fa-th"></i>换个工具</button>';

        box.innerHTML = '' +
            '<button type="button" id="quick-save-history" class="quick-action-btn quick-action-btn-primary"><i class="fa fa-bookmark-o"></i>保存到历史</button>' +
            '<button type="button" id="quick-export-pdf" class="quick-action-btn"><i class="fa fa-file-pdf-o"></i>导出 PDF</button>' +
            '<button type="button" id="quick-copy-result" class="quick-action-btn"><i class="fa fa-copy"></i>复制结果</button>' +
            fourth +
            // 阶段19-8：表格与链接是「带走」的两种形状，做成一行小字链接而不是第五颗按钮 ——
            // 行动条是四按钮常驻（19-4 的规矩），加按钮会把它撑成五颗，主次关系反而散了。
            '<div class="quick-copy-row">' +
            '<button type="button" id="quick-copy-table" class="quick-copy-link"><i class="fa fa-table mr-1"></i>复制为表格（贴进 Excel）</button>' +
            '<button type="button" id="quick-copy-link" class="quick-copy-link"><i class="fa fa-link mr-1"></i>复制链接（带参数，数据不出本机）</button>' +
            // 阶段19-9：存为模板属于「带走」这一族，也做成小字链接 —— 它不像复制那样每天点，
            // 但天天摆在按钮位上会挤掉真正每天点的那四颗。
            '<button type="button" id="quick-save-template" class="quick-copy-link"><i class="fa fa-clone mr-1"></i>存为模板</button>' +
            '</div>';

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

        var copyBtn = document.getElementById('quick-copy-result');
        if (copyBtn) {
            copyBtn.addEventListener('click', function () {
                var btn = this;
                copyText(resultTextOf(tool, out)).then(function (ok) {
                    btn.innerHTML = ok ? '<i class="fa fa-check"></i>已复制' : '<i class="fa fa-exclamation-circle"></i>复制失败';
                    // 成功也回到原样：复制是带走的动作，不像保存那样一次性
                    setTimeout(function () {
                        btn.innerHTML = '<i class="fa fa-copy"></i>复制结果';
                    }, 1600);
                });
            });
        }

        bindCopyButton('quick-copy-table', function () { return tableTextOf(tool, out); });
        bindCopyButton('quick-copy-link', function () {
            var l = linkLib();
            return l && typeof l.build === 'function' ? l.build(tool.id, values) : '';
        });

        // 存了之后原样回来，但**失败要把原因说出来**：不说，用户会以为模板存好了，
        // 下次进来找不到 —— 那比不给这个功能更糟。
        var tplBtn = document.getElementById('quick-save-template');
        if (tplBtn) {
            var tplOrigin = tplBtn.innerHTML;
            tplBtn.addEventListener('click', function () {
                var UI = window.EuriskoEntityUI;
                var res = (UI && typeof UI.saveAsTemplate === 'function')
                    ? UI.saveAsTemplate(tool, readValues(tool))
                    : { ok: false, reason: 'module' };
                tplBtn.innerHTML = res.ok
                    ? '<i class="fa fa-check"></i>已存为模板'
                    : '<i class="fa fa-info-circle"></i>' + esc(UI && UI.hintFor ? UI.hintFor(res) : '存不了模板');
                setTimeout(function () { tplBtn.innerHTML = tplOrigin; }, 2600);
            });
        }

        var deepBtn = document.getElementById('quick-open-deep');
        if (deepBtn) {
            deepBtn.addEventListener('click', function () {
                // 带上已经填好的参数：用户不必把同样的数字再输一遍
                openTool(this.getAttribute('data-deep-id'), { values: values });
            });
        }

        var toolsBtn = document.getElementById('quick-back-tools');
        if (toolsBtn) {
            toolsBtn.addEventListener('click', function () { showPageFn(TOOLS_PAGE); });
        }
    }

    // ====== 结果吸底条（阶段19-4：手机滚动时主金额常驻）======
    // 桌面双栏下结果就在旁边，不需要 —— 由 CSS 在 ≥1024px 隐藏。这里**不判宽度**：
    // JS 判断点会与 CSS 漂移，且 resize 时还得重算，两份真相迟早打架。
    function renderResultBar(tool, out) {
        // 幂等地补绑一次：DOM 若被整体替换过（如从别的页面重建），元素上的标记会随之丢失，
        // 这里会重新绑 —— 只依赖 init 时绑一次的话，那种情况下点击就静默失效。
        bindResultBar();
        var bar = document.getElementById('quick-result-bar');
        if (!bar) return;
        var labelEl = document.getElementById('quick-result-bar-label');
        var valueEl = document.getElementById('quick-result-bar-value');
        if (labelEl) labelEl.textContent = out.primary.label || tool.name;
        if (valueEl) valueEl.textContent = fmtValue(out.primary.value, out.primary.kind);
        bar.classList.remove('hidden');
    }

    // 算不出来时必须把吸底条与行动条收掉：留着上一次的金额是最坏的一种"看起来成功"。
    function hideResultExtras() {
        var bar = document.getElementById('quick-result-bar');
        if (bar) bar.classList.add('hidden');
        var actions = document.getElementById('quick-actions');
        if (actions) actions.innerHTML = '';
        hideProfileNudge();
        var saving = document.getElementById('quick-saving-nudge');
        if (saving) { saving.classList.add('hidden'); saving.innerHTML = ''; }
        var compare = document.getElementById('quick-compare-nudge');
        if (compare) { compare.classList.add('hidden'); compare.innerHTML = ''; }
    }

    function bindResultBar() {
        var bar = document.getElementById('quick-result-bar');
        var card = document.getElementById('quick-result-card');
        if (!bar || !card || bar.getAttribute('data-bar-bound') === '1') return;
        bar.setAttribute('data-bar-bound', '1');
        function jump() {
            if (card.scrollIntoView) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        bar.addEventListener('click', jump);
        bar.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); jump(); }
        });
    }

    // ====== 税务档案完成度引导（阶段19-5 · 留存机制 §3.8 ②）======
    // 「补全过一次自己的情况」= 沉没成本 = 换设备成本变高，这是竞品集体放弃的那一块（plan §2.1）。
    // 三条边界：
    //   ① 算完才出现，且排在行动条之后 —— 先给结果和出口，再谈补全；顺序反了引导就是路障。
    //   ② 一次「暂不」永久收声（nudgeDismissed 落盘），不靠重复弹窗刷存在感。
    //   ③ 每次只问**一句**（缺的第一项），不摆一张五项的表格让人填 —— 那是注册页，不是测算后。
    var profileJustCompleted = false;

    function profileLib() { return window.EuriskoTaxProfile; }

    function hideProfileNudge(box) {
        var el = box || document.getElementById('quick-profile-nudge');
        if (el) { el.classList.add('hidden'); el.innerHTML = ''; }
    }

    function profileControlsHtml(item) {
        if (item.kind === 'text') {
            return '<div class="profile-nudge-ctrl">' +
                '<input class="profile-nudge-input" type="text" maxlength="20" placeholder="如 北京">' +
                '<button type="button" class="profile-chip profile-chip-primary profile-save">保存</button>' +
                '</div>';
        }
        if (item.kind === 'multi') {
            return '<div class="profile-nudge-ctrl">' +
                item.options.map(function (o) {
                    return '<button type="button" class="profile-chip" data-profile-pick="' + esc(o.value) + '">' + esc(o.label) + '</button>';
                }).join('') +
                '<button type="button" class="profile-chip profile-chip-primary profile-save">保存</button>' +
                '</div>';
        }
        return '<div class="profile-nudge-ctrl">' +
            item.options.map(function (o) {
                return '<button type="button" class="profile-chip" data-profile-set="' + esc(o.value) + '">' + esc(o.label) + '</button>';
            }).join('') +
            '</div>';
    }

    // 卡内一律按 class 在**容器作用域**内定位：19-5b 起这张卡同时挂在速算器与完整测算结果步上，
    // 用全局 id 的话第二张卡会写到第一张上去（scenario-ui.js 早年被这个坑过一次）。
    function bindProfileNudge(box, tool, values) {
        var lib = profileLib();
        if (!box || !lib) return;

        // 当前正在问哪一项：单选项没有「保存」按钮，靠它知道该写哪个 key
        var nudgeKey = box.getAttribute('data-nudge-key') || '';
        box.querySelectorAll('[data-profile-set]').forEach(function (el) {
            el.addEventListener('click', function () {
                var obj = {};
                obj[nudgeKey] = this.getAttribute('data-profile-set');
                profileAfterPatch(tool, values, obj);
            });
        });

        box.querySelectorAll('[data-profile-pick]').forEach(function (el) {
            el.addEventListener('click', function () {
                this.classList.toggle('is-on');
            });
        });

        var save = box.querySelector('.profile-save');
        if (save) {
            save.addEventListener('click', function () {
                var key = nudgeKey;
                var obj = {};
                if (key === 'city') {
                    var input = box.querySelector('.profile-nudge-input');
                    var v = input ? String(input.value || '').trim() : '';
                    if (!v) { if (input) input.focus(); return; }
                    obj.city = v;
                } else if (key === 'deductions') {
                    var picks = box.querySelectorAll('[data-profile-pick].is-on');
                    if (!picks.length) return; // 没选就什么都不写：空数组不算"填了"，写了也没意义
                    obj.deductions = Array.prototype.map.call(picks, function (p) {
                        return p.getAttribute('data-profile-pick');
                    });
                } else {
                    return;
                }
                profileAfterPatch(tool, values, obj);
            });
        }

        var skip = box.querySelector('.profile-skip');
        if (skip) {
            skip.addEventListener('click', function () {
                lib.dismissNudge();
                hideProfileNudge(box);
            });
        }

        // 19-6a：卡片只能一项项补，改已有内容要有个去处 —— 否则用户改个城市都无处下手
        var manage = box.querySelector('.profile-manage');
        if (manage) {
            manage.addEventListener('click', function () {
                showPageFn('profile-tax-page');
            });
        }
    }

    // 补完一项后重画：进度条要走动，否则用户不知道自己刚才那一下生效了。
    // 重画**画回刚才那一张卡**（速算器 / 完整测算各一台）—— 写死回速算器那台的话，
    // 在完整测算里点一下选项会毫无反应。
    var lastNudgeBox = null;

    function profileAfterPatch(tool, values, obj) {
        var lib = profileLib();
        if (!lib) return;
        var next = lib.patch(obj);
        if (lib.pure.completeness(next).percent >= 100) profileJustCompleted = true;
        var box = (lastNudgeBox && document.body.contains(lastNudgeBox))
            ? lastNudgeBox
            : document.getElementById('quick-profile-nudge');
        renderProfileNudgeInto(box, tool, values);
    }

    function renderProfileNudge(tool, values) {
        renderProfileNudgeInto(document.getElementById('quick-profile-nudge'), tool, values);
    }

    // 容器由调用方给：速算器传 #quick-profile-nudge，完整测算结果步传 #dw-profile-nudge
    // （19-5b 起两处共用同一份渲染与绑定 —— 引导的口径只有一处，不会两边各长一套）。
    // 引导卡一次只问一项，改已经填过的东西要有个去处（19-6a：我的 → 税务档案）
    function manageLinkHtml() {
        return '<div class="profile-nudge-manage">' +
            '<button type="button" class="profile-manage">在「我的 → 税务档案」里查看 / 修改</button>' +
            '</div>';
    }

    function renderProfileNudgeInto(box, tool, values) {
        if (!box) return;
        lastNudgeBox = box;
        var lib = profileLib();
        if (!lib || typeof lib.absorb !== 'function') {
            // 不静默吞掉（前车之鉴：auth-ui.js 死选择器靠 ?. 抹错而多年未发现）
            console.warn('[toolbox] EuriskoTaxProfile 未加载（data/tax-profile.js），档案引导跳过');
            hideProfileNudge();
            return;
        }

        // 先吸收这次输入的**确定部分**：算了月薪个税就已经说明"有社保基数"，不必再问一遍
        lib.absorb(tool.id, values);
        var profile = lib.get();
        var c = lib.pure.completeness(profile);

        if (profile.nudgeDismissed) { hideProfileNudge(); return; }
        if (c.percent >= 100 && !profileJustCompleted) { hideProfileNudge(); return; }

        box.classList.remove('hidden');
        if (c.percent >= 100) {
            box.removeAttribute('data-nudge-key');
            box.innerHTML = '' +
                '<div class="profile-nudge-head">' +
                '<span class="profile-nudge-title"><i class="fa fa-id-card-o"></i>税务档案</span>' +
                '<span class="profile-nudge-pct">100%</span>' +
                '</div>' +
                '<div class="profile-nudge-bar"><span class="profile-nudge-bar-fill" style="width:100%"></span></div>' +
                '<div class="profile-nudge-done"><i class="fa fa-check-circle"></i>已补全 —— 下次测算会带上你的情况，不必重新解释一遍。</div>' +
                manageLinkHtml();
            return;
        }

        var first = c.missing[0];
        box.setAttribute('data-nudge-key', first.key);
        box.innerHTML = '' +
            '<div class="profile-nudge-head">' +
            '<span class="profile-nudge-title"><i class="fa fa-id-card-o"></i>税务档案</span>' +
            '<span class="profile-nudge-pct">' + c.percent + '%</span>' +
            '</div>' +
            '<div class="profile-nudge-bar"><span class="profile-nudge-bar-fill" style="width:' + c.percent + '%"></span></div>' +
            '<div class="profile-nudge-ask">' + esc(first.ask) + '</div>' +
            profileControlsHtml(first) +
            '<button type="button" class="profile-nudge-skip profile-skip">暂不，先算别的</button>' +
            manageLinkHtml();
        bindProfileNudge(box, tool, values);
    }

    // ====== 省钱卡（阶段19-6a · 留存机制 §3.8 ④）======
    // plan 要的是「确定性文案」。所以两个场景都必须**算得出来**或**档案里真有**：
    // ① 年终奖择优 —— 速算器本来就收了「全年其他应纳税所得额」，两套口径都是真算的差额；
    // ② 专项附加扣除漏填 —— 档案里勾过、这次没算进去，只说"漏了什么"，
    //    **不编金额**（几个子女、是否分摊都不知道，硬算出来的 ¥1,200 是假的）。
    // 比不出来就不显示 —— 与「与上次对比」同一条规矩。
    function taxOfComprehensive(x) {
        if (typeof window.calculateTaxByTaxableIncome !== 'function') return null;
        var r = window.calculateTaxByTaxableIncome(Math.max(0, Number(x) || 0));
        var t = r && Number(r.tax);
        return Number.isFinite(t) ? t : null;
    }

    function bonusSavingTip(tool, values) {
        var Q = window.EuriskoBonusQuick;
        if (!Q || tool.id !== 'bonus-tax') return null;
        var bonus = Number(values.bonus);
        var other = Number(values.annualTaxable);
        if (!(bonus > 0)) return null;
        // 没填「全年其他应纳税所得额」就比不了并入 —— 这时提示他去填，而不是给个编出来的差额
        if (!(other > 0)) {
            return {
                title: '还差一个数才能比「并入综合所得」',
                body: '填了「全年其他应纳税所得额」才能比较两种口径 —— 年终奖单独计税不一定更省。',
                ctaText: '去填这个数',
                focus: 'qf-annualTaxable'
            };
        }
        var tOther = taxOfComprehensive(other);
        var tAll = taxOfComprehensive(other + bonus);
        if (tOther === null || tAll === null) return null;
        var gap = tAll - (tOther + Q.taxOf(bonus));   // 正数 = 并入更贵 = 单独计税更省
        if (Math.abs(gap) <= 0.005) return null;      // 两种口径一样：没有"还能再省"，不占位
        return {
            title: gap > 0 ? '单独计税更省' : '并入综合所得更省',
            amount: Math.abs(gap),
            body: gap > 0
                ? '当前结果就是单独计税口径 —— 已按更省的那个给你（一年只能用一次单独计税）。'
                : '这笔奖金并入全年综合所得更省 —— 去「年终奖择优」按全年填一遍，它会连最优拆分一起给。',
            ctaText: '算两种口径的差额',
            toolId: 'bonus-tax-deep'
        };
    }

    // 本次输入里到底有没有带专项附加扣除：有值才算填了（填 0 等于没享受，不是"忘了"）
    var DEDUCTION_INPUT_RE = /(children|infant|elderly|housing|loan|rent|degreeMonths|certCount|medical|deduction|special)/i;

    function deductionMissTip(tool, values) {
        if (tool.id === 'special-deduction') return null;   // 它本身就是在核定额度的
        if (tool.group !== 'salary') return null;
        var lib = profileLib();
        if (!lib) return null;
        var picked = (lib.get().deductions || []).slice();
        if (!picked.length) return null;
        var filled = Object.keys(values || {}).some(function (k) {
            return DEDUCTION_INPUT_RE.test(k) && Number(values[k]) > 0;
        });
        if (filled) return null;
        var item = lib.pure.itemOf('deductions');
        var labels = picked.map(function (v) {
            var opt = (item ? item.options : []).filter(function (o) { return o.value === v; })[0];
            return opt ? opt.label : v;
        }).join('、');
        return {
            title: '档案里有扣除，这次没算进去',
            body: '你的档案里勾选了：' + labels + '。这次测算没带上 —— 补上能少缴，' +
                '具体额度跟你的适用税率有关，这里不替你估。',
            ctaText: '核定能扣多少',
            toolId: 'special-deduction'
        };
    }

    function savingTipOf(tool, values) {
        return bonusSavingTip(tool, values) || deductionMissTip(tool, values);
    }

    function renderSavingNudge(tool, values) {
        var box = document.getElementById('quick-saving-nudge');
        if (!box) return;
        var tip = savingTipOf(tool, values);
        if (!tip) {
            box.classList.add('hidden');
            box.innerHTML = '';
            return;
        }
        box.classList.remove('hidden');
        box.innerHTML = '' +
            '<div class="saving-nudge-head">' +
            '<span class="saving-nudge-title"><i class="fa fa-bolt"></i>还能少缴</span>' +
            (Number.isFinite(tip.amount)
                ? '<span class="saving-nudge-amount">' + esc(fmtValue(tip.amount, 'money')) + '</span>'
                : '') +
            '</div>' +
            '<div class="saving-nudge-lead">' + esc(tip.title) + '</div>' +
            '<div class="saving-nudge-body">' + esc(tip.body) + '</div>' +
            '<button type="button" class="saving-nudge-cta"' +
            (tip.toolId ? ' data-tool-id="' + esc(tip.toolId) + '"' : '') +
            (tip.focus ? ' data-focus="' + esc(tip.focus) + '"' : '') + '>' +
            '<i class="fa fa-arrow-right"></i>' + esc(tip.ctaText) + '</button>';

        var cta = box.querySelector('.saving-nudge-cta');
        if (!cta) return;
        cta.addEventListener('click', function () {
            var focusId = this.getAttribute('data-focus');
            if (focusId) {
                var el = document.getElementById(focusId);
                if (el) {
                    el.focus();
                    if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center' });
                    return;
                }
            }
            var toolId = this.getAttribute('data-tool-id');
            if (toolId) openTool(toolId, { values: values });
        });
    }

    // ====== 与上次对比（阶段19-5b · 留存机制 §3.8 ③）======
    // plan 原文是「结果页存为方案 A → 第二次自动提示『与 A 对比』」。方案库（scenario-store）
    // 那张对比表只覆盖综合所得口径，速算器若存进去，缺的指标会被 fmtValue 补成 ¥0.00 ——
    // 那是假数据，比没有更糟。所以速算器侧改为跟**同工具的上一次测算**比：
    // 那份数据本来就在 taxCalculationHistory 里，两次是同一口径同一个 compute，差额是真算出来的。
    var lastSavedHistoryId = null;

    function readHistory() {
        try {
            var list = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
            return Array.isArray(list) ? list : [];
        } catch (e) {
            return [];
        }
    }

    // 取上一次同工具的记录（排除刚保存的那条自己，否则「这次」会跟「这次」比）
    function previousSameToolRecord(toolId) {
        var list = readHistory();
        for (var i = list.length - 1; i >= 0; i--) {
            var r = list[i];
            if (!r || r.toolId !== toolId) continue;
            if (lastSavedHistoryId && r.id === lastSavedHistoryId) continue;
            return r;
        }
        return null;
    }

    // 历史里税额的落点有两种（速算器写 result_data.totalTax，完整测算写 results.primary.value）；
    // 取不到就返回 null —— 不猜、不补 0。
    function taxAmountOf(record) {
        if (!record) return null;
        var v = record.result_data ? Number(record.result_data.totalTax) : NaN;
        if (!Number.isFinite(v) && record.results) {
            v = record.results.taxDetails ? Number(record.results.taxDetails.totalTax) : NaN;
            if (!Number.isFinite(v) && record.results.primary) v = Number(record.results.primary.value);
        }
        return Number.isFinite(v) ? v : null;
    }

    function dateLabelOf(iso) {
        var d = new Date(iso);
        if (isNaN(d.getTime())) return '上次';
        return (d.getMonth() + 1) + '月' + d.getDate() + '日';
    }

    // 挂到指定容器（deep 向导结果步走这一条入口）
    function mountProfileNudge(containerId, tool, values) {
        var box = document.getElementById(containerId);
        if (!box || !tool) return;
        renderProfileNudgeInto(box, tool, values || {});
    }

    function renderCompareNudge(tool, values, out) {
        var box = document.getElementById('quick-compare-nudge');
        if (!box) return;
        var prev = previousSameToolRecord(tool.id);
        var prevTax = taxAmountOf(prev);
        var nowTax = Number(out && out.primary ? out.primary.value : NaN);
        // 比不出来就不显示：第一次测算没有「上次」，口径不同也不硬凑
        if (!prev || prevTax === null || !Number.isFinite(nowTax)) {
            box.classList.add('hidden');
            box.innerHTML = '';
            return;
        }

        var diff = nowTax - prevTax;
        var diffText = Math.abs(diff) < 0.005
            ? '与上次一样'
            : (diff < 0 ? '少缴 ' : '多缴 ') + fmtValue(Math.abs(diff), 'money');
        var deepId = deepCounterpartOf(tool);

        box.classList.remove('hidden');
        box.innerHTML = '' +
            '<div class="compare-nudge-head">' +
            '<span class="compare-nudge-title"><i class="fa fa-balance-scale"></i>和上次比</span>' +
            '<span class="compare-nudge-diff' + (Math.abs(diff) < 0.005 ? '' : (diff < 0 ? ' is-lower' : ' is-higher')) + '">' + esc(diffText) + '</span>' +
            '</div>' +
            '<div class="compare-nudge-body">' +
            '<span>上次（' + esc(dateLabelOf(prev.date)) + '）<b>' + esc(fmtValue(prevTax, 'money')) + '</b></span>' +
            '<span>这次 <b>' + esc(fmtValue(nowTax, 'money')) + '</b></span>' +
            '</div>' +
            (deepId
                ? '<button type="button" class="compare-nudge-cta" data-deep-id="' + esc(deepId) + '">按年填全做多方案对比<i class="fa fa-angle-right"></i></button>'
                : '<div class="compare-nudge-tip">想留着以后比，就点上面的「保存到历史」。</div>');

        var cta = box.querySelector('.compare-nudge-cta');
        if (cta) {
            cta.addEventListener('click', function () {
                openTool(this.getAttribute('data-deep-id'), { values: values });
            });
        }
    }

    function renderResult(tool, values) {
        var box = document.getElementById('quick-result');
        if (!box) return null;
        var out;
        try {
            out = tool.compute(values);
        } catch (e) {
            box.innerHTML = '<div class="tool-empty">计算失败：' + esc(e.message || e) + '</div>';
            hideResultExtras();
            return null;
        }
        if (!out) {
            box.innerHTML = '<div class="tool-empty">计算模块未加载，请刷新页面后重试</div>';
            hideResultExtras();
            return null;
        }
        if (out.error) {
            box.innerHTML = '<div class="tool-empty">' + esc(out.error) + '</div>';
            hideResultExtras();
            return null;
        }

        var rowsHtml = (out.rows || []).map(function (r) {
            return '<div class="tool-result-row">' +
                '<span class="tool-result-label">' + esc(r.label) + (r.hint ? '<i class="fa fa-question-circle tool-result-hint" title="' + esc(r.hint) + '"></i>' : '') + '</span>' +
                '<span class="tool-result-value">' + fmtValue(r.value, r.kind) + '</span>' +
                '</div>';
        }).join('');

        // 台账 C：速算器推导链（compute 返回可选 steps；渲染复用 utils.js 的同一套实现，不写第二套）
        var stepsHtml = '';
        if (out.steps && out.steps.length) {
            if (typeof renderFormulaStepsHtml === 'function') {
                // 完整视图：推导链默认展开（简明视图保持折叠，结论先给用户）
                stepsHtml = '<details class="mt-4 tool-formula-panel"' + (isFullMode() ? ' open' : '') + '>' +
                    '<summary class="flex items-center justify-between cursor-pointer select-none px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm font-medium text-gray-800">' +
                    '<span><i class="fa fa-calculator mr-2"></i>查看计算过程</span>' +
                    '<span class="text-xs text-gray-500">每一步都可核对</span>' +
                    '</summary>' +
                    '<div class="mt-3">' + renderFormulaStepsHtml(out.steps) + '</div>' +
                    '</details>';
            } else {
                // 不静默吞掉（前车之鉴：auth-ui.js 死选择器靠 ?. 抹错而多年未发现）
                console.warn('[toolbox] renderFormulaStepsHtml 未加载（utils.js），推导链面板被跳过');
            }
        }

        box.innerHTML = '' +
            '<div class="tool-result-primary">' +
            '<div class="tool-result-primary-label">' + esc(out.primary.label) + '</div>' +
            '<div class="tool-result-primary-value">' + fmtValue(out.primary.value, out.primary.kind) + '</div>' +
            '</div>' +
            '<div class="tool-result-rows">' + rowsHtml + '</div>' +
            stepsHtml +
            (out.note ? '<div class="tool-result-note"><i class="fa fa-info-circle mr-1"></i>' + esc(out.note) + '</div>' : '');

        // 阶段19-8：只在**算得出来**时记参数。记一份算不出结果的参数，下次带出来就是
        // "页面坏了" —— 而带出这件事本身是静默的，用户只会把账算在算法头上。
        var memo = memoryLib();
        if (!memorySuppressed && memo && typeof memo.set === 'function') memo.set(tool.id, values);

        renderNextSteps(tool, values, out);
        renderQuickActions(tool, values, out);
        renderResultBar(tool, out);
        renderSavingNudge(tool, values);
        renderProfileNudge(tool, values);
        renderCompareNudge(tool, values, out);
        renderModeHint(tool);
        return out;
    }

    // ====== 阶段19-7：算满 3 次才问一次的「要不要看更多参数」======
    // 阈值定在 3 次：第 1 次就问是在教用户用产品（他连结果长什么样都还没看熟），
    // 3 次说明他已经知道这里能算出什么，此时「还有参数可调」才是信息而不是打扰。
    var MODE_HINT_KEY = 'euriskoPrefModeHint';
    var MODE_HINT_TIMES = 3;

    function calcCount() {
        if (window.EuriskoLocalData && typeof window.EuriskoLocalData.getData === 'function') {
            var h = window.EuriskoLocalData.getData('taxCalculationHistory');
            if (Array.isArray(h)) return h.length;
        }
        try { return (JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') || []).length; }
        catch (e) { return 0; }
    }

    function renderModeHint(tool) {
        var box = document.getElementById('quick-mode-hint');
        if (!box) return;
        var dismissed = false;
        try { dismissed = localStorage.getItem(MODE_HINT_KEY) === '1'; } catch (e) { /* ignore */ }
        if (isFullMode() || dismissed || calcCount() < MODE_HINT_TIMES) {
            box.classList.add('hidden'); box.innerHTML = ''; return;
        }
        box.classList.remove('hidden');
        box.innerHTML = '' +
            '<div class="p-4">' +
            '<div class="flex items-start gap-2">' +
            '<i class="fa fa-sliders text-primary mt-0.5"></i>' +
            '<div class="flex-1">' +
            '<div class="text-sm font-medium text-gray-800">还有参数可调</div>' +
            '<div class="text-xs text-gray-500 mt-1">切到「完整」能看到' + esc(tool && tool.name || '') +
            '的全部可调项与逐项推导 —— 计算口径不变，只是显示更多。</div>' +
            '</div>' +
            '</div>' +
            '<div class="mt-3 flex items-center gap-2">' +
            '<button type="button" id="mode-hint-switch" class="btn bg-primary text-white text-xs px-3 py-1.5">切换</button>' +
            '<button type="button" id="mode-hint-dismiss" class="text-xs text-gray-500 px-2 py-1.5">不用了</button>' +
            '</div>' +
            '</div>';
        var sw = document.getElementById('mode-hint-switch');
        var no = document.getElementById('mode-hint-dismiss');
        var p = modeLib();
        if (sw && p) sw.addEventListener('click', function () { p.set(p.FULL); });
        if (no) no.addEventListener('click', function () {
            try { localStorage.setItem(MODE_HINT_KEY, '1'); } catch (e) { /* ignore */ }
            box.classList.add('hidden'); box.innerHTML = '';
        });
    }

    // ====== 结果页「下一步」======
    // 结果不该是终点：给出相关工具（互链），把一次测算接成一条动线。
    // 阶段19-4：保存 / 导出 / 复制 / 完整版这四个动作从这里搬到了常驻的 #quick-actions ——
    // 它们挂在"有没有相关工具"上是本末倒置（没有相关工具就一个出口都没有）。
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
            }).join('') + '</div>';

        box.querySelectorAll('.tool-next-item').forEach(function (el) {
            el.addEventListener('click', function () { openTool(this.getAttribute('data-tool-id')); });
        });
    }

    // 写入与首页「最近计算」同一份存储（taxCalculationHistory），
    // 让速算器结果也进历史 —— 这是深度流程原本独有的能力，现在两种形态收敛。
    function saveToHistory(tool, values, out) {
        try {
            var list = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
            var id = 'quick-' + Date.now();
            // 记住刚存的这条：「与上次对比」要拿它之外的最近一条，否则这次会跟这次比
            lastSavedHistoryId = id;
            list.push({
                id: id,
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

    // 阶段19-8：带出上次输入必须**说出来**，并给一个「清空」。
    // 静默地把默认值换成上次的值，用户会以为那是自己填的 —— 于是"算出来的数不对"
    // 这笔账会记在算法头上，那是让 UI 的锅由计算背。
    function renderMemoryHint(tool, mem, onClear) {
        var box = document.getElementById('quick-memory-hint');
        if (!box) return;
        if (!mem || !mem.values) { box.classList.add('hidden'); box.innerHTML = ''; return; }
        var m = memoryLib();
        var age = m && typeof m.ageLabel === 'function' ? m.ageLabel(mem.at) : '';
        box.classList.remove('hidden');
        box.innerHTML = '<span class="tool-memory-text"><i class="fa fa-history mr-1"></i>已带出上次输入' +
            (age ? '（' + esc(age) + '）' : '') + '</span>' +
            '<button type="button" id="quick-memory-clear" class="tool-memory-clear">清空</button>';
        var btn = document.getElementById('quick-memory-clear');
        if (btn) {
            btn.addEventListener('click', function () {
                if (m && typeof m.clear === 'function') m.clear(tool.id);
                box.classList.add('hidden');
                box.innerHTML = '';
                if (typeof onClear === 'function') onClear();
            });
        }
    }

    // 阶段19-8：回车 = 跳到结果。速算器本来就是「改动即时重算」，回车不需要再算一遍，
    // 它要做的是把视口带到结果上 —— 键盘走完一次测算差的正是这一下（手机上尤其：结果在
    // 首屏之外，不滚过去等于没算）。绑在 #quick-form 上（它长期存在，换工具只换 innerHTML），
    // 所以这里用标记防重复绑，而不是每次 build 都绑一遍。
    function bindEnterToResult(formEl) {
        if (!formEl || formEl.getAttribute('data-enter-bound') === '1') return;
        formEl.setAttribute('data-enter-bound', '1');
        formEl.addEventListener('keydown', function (e) {
            if (e.key !== 'Enter') return;
            var tag = e.target && e.target.tagName;
            if (tag !== 'INPUT' && tag !== 'SELECT') return;
            e.preventDefault();
            var card = document.getElementById('quick-result-card');
            if (card && typeof card.scrollIntoView === 'function') {
                card.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    }

    // seed 可选：一份已有输入（阶段18-2 从历史记录打开时带来）。表单按它渲染而不是按 default，
    // 否则「保存 → 查看」这条路上，用户看到的是一份全新的默认值 —— 保存等于白存。
    function renderQuickPage(tool, seed) {
        // 优先级：调用方明确带进来的（历史「查看」/ 带参链接）> 上次输入 > spec 默认值。
        // 带进来的那份必须赢：用户点的是"看那一条"，不是"看我上次填的"。
        var m = memoryLib();
        var mem = seed ? null : (m && typeof m.get === 'function' ? m.get(tool.id) : null);
        quickSeed = seed || (mem && mem.values) || null;
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

        // 换工具时先收掉上一份结果的吸底条与行动条：留着上一个工具的金额是最坏的一种"看起来成功"
        // 同时清掉"刚补完档案"的一次性状态 —— 它只对刚才那次补全负责，换工具就翻篇。
        profileJustCompleted = false;
        hideResultExtras();

        if (pitEl) {
            pitEl.innerHTML = (tool.pitfalls || []).length
                ? '<div class="tool-pitfall-head"><i class="fa fa-exclamation-triangle mr-1"></i>易错口径</div><ul>' +
                tool.pitfalls.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul>'
                : '';
        }

        // 政策依据与结果同屏出现（默认折叠，展开与否由用户决定），不外跳
        renderPolicyBasis(tool);

        if (!formEl) return;
        bindEnterToResult(formEl);

        // 清空那一瞬间按 spec 默认值重画（而不是读 DOM —— DOM 里正是刚被带出来的那些值）
        var forceDefaults = false;

        // 上一次画到 DOM 上的值（阶段19-9 修正）。为什么必须有它：
        //   种子（记忆 / 模板 / 历史查看）里有些字段此刻并不显示（条件字段没满足条件），
        //   readValues 会把它们填成 spec 默认值 —— 若每次 build 都整体重跑一遍种子，
        //   用户在别处敲进去的数字就跟着一起被盖回去了：改一下计税场景，刚填的金额就没了，
        //   而且是**静默**的。反过来只信 DOM 也不行：隐藏字段一冒出来就变回默认值，
        //   等于带了个寂寞。
        // 结论：只有「DOM 与上次渲染不一致」的那些项才是用户真改过的，其余维持当前值。
        var curValues = null;
        var painted = null;
        var paintedKeys = [];

        function build() {
            var values;
            if (!painted) {
                // 首次：读 DOM（可能是上一颗工具留下的空表单）再用种子覆盖，含此刻没显示的字段
                values = forceDefaults ? specDefaults(tool) : readValues(tool);
                if (quickSeed) {
                    Object.keys(quickSeed).forEach(function (k) { values[k] = quickSeed[k]; });
                }
            } else {
                values = {};
                Object.keys(curValues).forEach(function (k) { values[k] = curValues[k]; });
                var dom = forceDefaults ? specDefaults(tool) : readValues(tool);
                Object.keys(dom).forEach(function (k) {
                    // 只比较**上一次真的画出来了**的字段：没画出来的 readValues 给的是默认值，
                    // 拿它跟带出来的值比，等于把带出来的那部分误判成「用户改过」。
                    if (paintedKeys.indexOf(k) === -1) return;
                    if (String(dom[k]) !== String(painted[k])) values[k] = dom[k];
                });
            }
            curValues = values;
            var parts = partitionFields(visibleFields(tool, values));
            formEl.innerHTML = parts.basic.map(function (f) { return fieldHtml(f, values); }).join('') +
                advancedBlockHtml(parts.advanced, values);
            paintedKeys = parts.basic.concat(parts.advanced).map(function (f) { return f.key; });
            painted = {};
            paintedKeys.forEach(function (k) { painted[k] = values[k]; });
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

        // 用一整份新值重画表单（清空 / 套用模板都走这里）。必须先丢掉 painted：
        // 否则 build 会走进"只认用户改过的项"那条分支，把这份新值判成没改动，点了没反应。
        function adoptValues(vals, opts) {
            painted = null;
            paintedKeys = [];
            quickSeed = vals || null;
            forceDefaults = !!(opts && opts.forceDefaults);
            build();
            forceDefaults = false;
        }

        // 清空过就别再冒出来：切换视图会重画表单，提示要跟着这个开关走一次
        var memOn = !!(mem && mem.values);
        function drawMemoryHint() {
            renderMemoryHint(tool, memOn ? mem : null, function () {
                memOn = false;
                memorySuppressed = true;    // 重画会触发一次重算，别让它把默认值又记回去
                adoptValues(specDefaults(tool), { forceDefaults: true });
                memorySuppressed = false;
            });
        }

        // 阶段19-9：从模板填充。它跟「带出上次输入」是两件事 —— 那是自动的一份，
        // 这是用户点名要的那一份。注意**不说"已填充"的提示**：这一次是用户的动作，
        // 不是页面自作主张，再弹一条提示是替用户复述他刚做的事。
        mountQuickTemplateBar(tool, function (values) { adoptValues(values); });

        renderModePill();
        build();
        drawMemoryHint();
        // 偏好一变就地重画：记住本次的 build，换工具时它自然指向新工具那份
        modeRebuild = function () { build(); drawMemoryHint(); };
    }

    // 阶段19-9：速算器页那条「从模板填充」—— 没有模板就整条不出现（连折叠箭头都不留）。
    // 由 entity-ui 统一画：完整测算页用的是同一份实现，两处的点法是同一种手感，
    // 否则用户会以为「模板在另一个工具里丢了」。
    function mountQuickTemplateBar(tool, onPick) {
        var UI = window.EuriskoEntityUI;
        if (!UI || typeof UI.mountTemplateBar !== 'function' || !tool) return;
        UI.mountTemplateBar('quick-template-bar', tool.id, onPick);
    }

    // ====== 导航：底部 Tab 栏（手机）+ 顶部 Tab 行（桌面） ======
    // 两套 DOM 是**同一份状态的两种投影**，由 syncNav() 统一驱动，
    // 绝不各自维护显隐逻辑 —— 否则两端迟早不同步。
    function syncNav() {
        var activeEl = document.querySelector('.page.active');
        var activeId = activeEl ? activeEl.id : null;
        var visible = TAB_PAGES.indexOf(activeId) !== -1;

        // 阶段19-3：进工具页就聚焦搜索框 —— 41 个入口靠翻不如靠搜。
        // 只在「刚切进来」的那一次聚焦：页面内反复同步时不抢用户的焦点。
        // 手机不聚焦：键盘一上来顶掉半屏，而用户还没决定搜什么。
        if (activeId === TOOLS_PAGE && lastNavPage !== TOOLS_PAGE) focusSearchIfDesktop();
        lastNavPage = activeId;

        // 底部 Tab 栏（<768px）：显式切 hidden 类，不只依赖 media query ——
        // tests/toolbox-ui.test.js 断言的正是这个类，只靠 CSS 控制会让测试失去意义。
        var bar = document.getElementById('bottom-tabbar');
        if (bar) {
            if (visible) bar.classList.remove('hidden');
            else bar.classList.add('hidden');
            bar.querySelectorAll('.bottom-tab').forEach(function (btn) {
                var t = btn.getAttribute('data-tab');
                if (t === activeId) btn.classList.add('active');
                else btn.classList.remove('active');
            });
        }

        // 顶部 Tab 行（≥768px）：小屏形态由 CSS 折叠，这里只管「该不该出现」
        var top = document.getElementById('top-tabbar');
        if (top) {
            if (visible) top.classList.remove('hidden');
            else top.classList.add('hidden');
            top.querySelectorAll('.top-tab').forEach(function (btn) {
                var t = btn.getAttribute('data-tab');
                if (t === activeId) btn.classList.add('active');
                else btn.classList.remove('active');
            });
        }

        // 让页面底部留出 Tab 栏的高度，避免遮住最后一张卡片（仅手机形态生效）
        if (visible) document.body.classList.add('has-tabbar');
        else document.body.classList.remove('has-tabbar');
    }

    // 兼容旧调用点与 tests/toolbox-ui.test.js 的既有入口
    var updateTabBar = syncNav;

    function initTabBar() {
        // 两端同一个选择器集合：新增/删 Tab 只改这里，不用记着改两处
        ['#bottom-tabbar .bottom-tab', '#top-tabbar .top-tab'].forEach(function (sel) {
            document.querySelectorAll(sel).forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var t = this.getAttribute('data-tab');
                    if (t === 'assistant') {
                        // 助手是抽屉不是页面：唤起悬浮球即可，不切换页面。
                        // 助手 Tab 已从两端导航移除（它是情境动作，不是目的地），
                        // 这里保留该分支仅为兼容历史 DOM 残留。
                        var fab = document.getElementById('tax-assistant-fab');
                        if (fab) fab.click();
                        return;
                    }
                    showPageFn(t);
                    syncNav();
                });
            });
        });
        // showPage 是全局唯一的路由实现（auth-ui.js），这里不侵入它，
        // 改为观察 .page 的 class 变化统一刷新 Tab 栏状态。
        if (typeof window.MutationObserver === 'function') {
            var timer = null;
            var observer = new window.MutationObserver(function () {
                if (timer) return;
                timer = setTimeout(function () { timer = null; syncNav(); }, 30);
            });
            observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
        }
        syncNav();
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
                focusSearchIfDesktop();
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

        // 吸底条的点击 / 键盘跳转只绑一次：它不在 renderResult 重建的范围内，
        // 每次重算都绑一遍会让监听器越堆越多（点一下滚多次）。
        bindResultBar();

        initTabBar();

        // 阶段19-8：地址栏带了参数就直达（分享 / 书签 / 换设备）。放在 init 最后 ——
        // 此时注册表与向导都已就位，open() 里才查得到工具；命中失败就照常停在首页。
        var link = linkLib();
        if (link && typeof link.open === 'function') {
            try { link.open(); } catch (e) { console.warn('[toolbox] 带参链接打开失败:', e); }
        }
    }

    // 阶段19-7：偏好一变就地重画两处 pill 与当前速算器表单。
    // 订阅挂在模块上、只挂一次 —— 挂进 renderQuickPage 里的话，每渲染一个工具就多一个监听。
    if (modeLib() && typeof modeLib().onChange === 'function') {
        modeLib().onChange(function () {
            renderModePillIn('quick-mode-pill');
            renderModePillIn('settings-mode-pill');
            if (modeRebuild) modeRebuild();
        });
    }
    // 账户设置页那颗是静态 HTML 里的容器，进页面前先画一次（之后由订阅跟上）
    renderModePillIn('settings-mode-pill');

    window.EuriskoToolbox = {
        init: init,
        // 阶段17 17A-5：字段渲染 / 读值 / 条件显隐是速算器与多步向导的**公共部分**。
        // 暴露给 deep-wizard-ui.js 复用 —— 明令不许再抄一份（抄了必漂移；
        // 20 个既有工具的字段渲染单测就是防它退化的回归网）。
        fieldHtml: fieldHtml,
        readValues: readValues,
        visibleFields: visibleFields,
        // 阶段19-7：视图密度 —— 两块 UI（pill 与「更多参数」折叠块）由速算器出，
        // deep 向导复用同一份（两份措辞分家只是时间问题，不给自己这个机会）。
        modePillHtml: modePillHtml,
        renderModePillIn: renderModePillIn,
        advancedBlockHtml: advancedBlockHtml,
        partitionFields: partitionFields,
        isFullMode: isFullMode,
        fmtValue: fmtValue,
        renderToolbox: renderToolbox,
        renderScenarios: renderScenarios,
        openTool: openTool,
        openScenario: openScenario,
        updateTabBar: updateTabBar,   // 兼容旧名，等价于 syncNav
        syncNav: syncNav,
        // 阶段19-4：暴露给单测 —— 双栏是 CSS 管的事，JS 这一侧可断言的是「算完有常驻出口」与
        // 「算不出来时旧金额立刻收掉」，单测钉这两条就能防住最常见的两类回归。
        renderQuickActions: renderQuickActions,
        renderResultBar: renderResultBar,
        hideResultExtras: hideResultExtras,
        deepCounterpartOf: deepCounterpartOf,
        resultTextOf: resultTextOf,
        // 阶段19-8：效率层 —— 复制（明文 / 表格）由速算器出，deep 向导复用同一份
        // （两处各写一种表格形状，"粘进 Excel 列对齐"就没法只验一次）。
        tableTextOf: tableTextOf,
        copyText: copyText,
        renderMemoryHint: renderMemoryHint,
        // 阶段19-5b：档案引导卡与「与上次对比」卡都挂到别处去（deep 向导结果步用前者）；
        // 同一份实现两处复用，引导口径只有一处。
        mountProfileNudge: mountProfileNudge,
        renderCompareNudge: renderCompareNudge,
        // 阶段19-6a：省钱卡（§3.8 ④）。导出 savingTipOf 是为了单测能直接问「这个场景该不该出卡」
        renderSavingNudge: renderSavingNudge,
        savingTipOf: savingTipOf,
        // 政策依据：暴露给单测，好断言「不外跳」这类肉眼难守的约束
        policyBasisOf: policyBasisOf,
        policyBasisText: policyBasisText,
        renderPolicyBasis: renderPolicyBasis
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
