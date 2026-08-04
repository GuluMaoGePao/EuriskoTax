// === 悬浮税助手：交互逻辑 ===
// 功能：
// 1. 全屏可拖拽浮动按钮（FAB），松手自动靠边停靠
// 2. 点击展开半屏抽屉
// 3. 抽屉内含搜索框、分类筛选、问答列表、快捷功能
// 4. 支持关键词模糊搜索（匹配问题和关键词）
// 5. 深色模式自适应
// 6. 移动端全屏展示，PC端右侧抽屉

(function () {
    'use strict';

    const InteractionLog = window.InteractionLog || {
        log: function () {}
    };

    // ====== 状态 ======
    let isOpen = false;
    let currentCategory = 'all';
    let currentKeyword = '';

    // ====== 拖拽相关常量与状态 ======
    var FAB_SIZE = 56;
    var FAB_MARGIN = 14; // 靠边停靠时与屏幕边的距离
    var DRAG_THRESHOLD = 5; // 判定为拖拽的最小位移（px）
    var STORAGE_KEY = 'taxAssistantFabPos';
    var dragState = {
        dragging: false,
        moved: false,
        startX: 0,
        startY: 0,
        origLeft: 0,
        origTop: 0,
        pointerId: null
    };
    var suppressNextClick = false;

    // ====== 收藏 / 反馈 / 搜索历史 状态与存储键 ======
    var FAV_KEY = 'taxAssistantFavorites';     // 收藏的 Q&A id 数组
    var FB_KEY = 'taxAssistantFeedback';        // 反馈统计 { id: { good, bad, mine } }
    var HISTORY_KEY = 'taxAssistantHistory';    // 搜索词数组
    var HISTORY_MAX = 8;
    var favMode = false;                        // 是否"只看收藏"
    var suggestActiveIndex = -1;                // 联想下拉当前高亮项
    var syncingFav = {};                        // { id: count } 收藏同步中计数
    var syncingFb = {};                         // { id: count } 反馈同步中计数

    // ====== 日志器 & Mock 客户端（复用通用工具，避免重复实现） ======
    // 工具定义见 src/js/utils/mock-client.js，需在加载本文件前先加载
    // 调试时可手动 window.TaxAssistant.logger.level = 1 临时打开 INFO
    var logger = window.Logger.create({ tag: 'Assistant', level: 2 });

    // ====== MockApi：基于通用 MockClient 的业务封装（收藏 / 反馈同步） ======
    // 本地 localStorage 做乐观更新，后台异步"同步"到模拟服务端
    // 延迟 80-200ms 模拟真实快速网络；支持失败注入（failRate / failNext）验证 UI 回滚
    var MockApi = window.MockClient.create({ logger: logger, tag: 'API' });
    // 业务方法：在通用 request 之上补充语义化接口
    MockApi.saveFavorite = function (id, action) {
        return this.request('POST', '/api/assistant/favorite', { id: id, action: action })
            .then(function () { return { success: true, id: id, action: action }; });
    };
    MockApi.saveFeedback = function (id, type, counts) {
        return this.request('POST', '/api/assistant/feedback', { id: id, type: type, counts: counts })
            .then(function () { return { success: true, id: id, type: type }; });
    };

    // ====== 工具函数 ======
    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function highlightKeyword(text, keyword) {
        if (!keyword) return escapeHtml(text);
        const escaped = escapeHtml(text);
        const safeKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const reg = new RegExp(safeKeyword, 'gi');
        return escaped.replace(reg, function (match) {
            return '<mark class="assistant-mark">' + match + '</mark>';
        });
    }

    // ====== 本地存储读写（收藏 / 反馈 / 搜索历史） ======
    function readJSON(key, fallback) {
        try {
            var raw = localStorage.getItem(key);
            if (!raw) return fallback;
            return JSON.parse(raw);
        } catch (e) {
            logger.warn('STORAGE', '读取失败 ' + key, { error: String(e) });
            return fallback;
        }
    }
    function writeJSON(key, val) {
        try {
            localStorage.setItem(key, JSON.stringify(val));
        } catch (e) {
            logger.warn('STORAGE', '写入失败 ' + key, { error: String(e) });
        }
    }

    // 收藏
    function getFavorites() { return readJSON(FAV_KEY, []); }
    function isFavorited(id) { return getFavorites().indexOf(id) !== -1; }
    function toggleFavorite(id) {
        var favs = getFavorites();
        var i = favs.indexOf(id);
        var added;
        if (i === -1) { favs.push(id); added = true; }
        else { favs.splice(i, 1); added = false; }
        writeJSON(FAV_KEY, favs);
        logger.info('FAV', added ? '收藏问题' : '取消收藏', { id: id, total: favs.length });
        return added;
    }

    // 反馈
    function getFeedback() { return readJSON(FB_KEY, {}); }
    function recordFeedback(id, type) {
        var all = getFeedback();
        var rec = all[id] || { good: 0, bad: 0, mine: null };
        if (rec.mine === type) {
            // 再次点击同类型 = 取消
            rec[type] = Math.max(0, rec[type] - 1);
            rec.mine = null;
        } else {
            if (rec.mine) { rec[rec.mine] = Math.max(0, rec[rec.mine] - 1); }
            rec[type] = (rec[type] || 0) + 1;
            rec.mine = type;
        }
        all[id] = rec;
        writeJSON(FB_KEY, all);
        logger.info('FEEDBACK', '反馈记录', { id: id, type: type, mine: rec.mine, good: rec.good, bad: rec.bad });
        return rec;
    }

    // 搜索历史
    function getHistory() { return readJSON(HISTORY_KEY, []); }
    function pushHistory(keyword) {
        keyword = (keyword || '').trim();
        if (!keyword) return;
        var hist = getHistory().filter(function (h) { return h !== keyword; });
        hist.unshift(keyword);
        if (hist.length > HISTORY_MAX) hist = hist.slice(0, HISTORY_MAX);
        writeJSON(HISTORY_KEY, hist);
        logger.info('SEARCH', '记录搜索历史', { keyword: keyword, total: hist.length });
    }
    function clearHistory() {
        writeJSON(HISTORY_KEY, []);
        logger.info('SEARCH', '清空搜索历史', null);
    }

    // ====== 搜索匹配 ======
    function matchItem(item, keyword) {
        if (!keyword) return true;
        const kw = keyword.toLowerCase();
        // 匹配问题
        if (item.question.toLowerCase().indexOf(kw) !== -1) return true;
        // 匹配关键词数组
        if (item.keywords && item.keywords.some(function (k) {
            return k.toLowerCase().indexOf(kw) !== -1;
        })) return true;
        // 匹配分类
        if (item.category.toLowerCase().indexOf(kw) !== -1) return true;
        // 匹配答案
        if (item.answer.toLowerCase().indexOf(kw) !== -1) return true;
        return false;
    }

    // ====== 渲染：分类标签（含"我的收藏"筛选） ======
    function renderCategories() {
        const container = document.getElementById('assistant-categories');
        if (!container) return;

        const categories = ['all', '综合所得', '经营所得', '分类所得', '反向倒算', '汇算清缴', '政策法规'];
        const labels = {
            'all': '全部',
            '综合所得': '综合所得',
            '经营所得': '经营所得',
            '分类所得': '分类所得',
            '反向倒算': '反向倒算',
            '汇算清缴': '汇算清缴',
            '政策法规': '政策法规'
        };

        let html = categories.map(function (cat) {
            const active = (!favMode && cat === currentCategory) ? 'assistant-cat-active' : '';
            return '<button class="assistant-cat ' + active + '" data-cat="' + cat + '">' + labels[cat] + '</button>';
        }).join('');

        // 追加"我的收藏"筛选 chip（靠右）
        var favCount = getFavorites().length;
        var favActive = favMode ? 'assistant-cat-active' : '';
        html += '<button class="assistant-cat assistant-cat-fav ' + favActive + '" data-cat="__fav__">' +
                '<i class="fa fa-star"></i><span>收藏' + (favCount ? '(' + favCount + ')' : '') + '</span></button>';

        container.innerHTML = html;

        // 绑定点击
        container.querySelectorAll('.assistant-cat').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var cat = this.getAttribute('data-cat');
                if (cat === '__fav__') {
                    favMode = !favMode;
                    logger.info('FAV', '切换收藏筛选', { favMode: favMode });
                } else {
                    favMode = false;
                    currentCategory = cat;
                }
                renderCategories();
                renderQAList();
            });
        });
    }

    // ====== 渲染：问答列表（含收藏/反馈/关联跳转底部栏） ======
    function renderQAList() {
        const container = document.getElementById('assistant-qa-list');
        if (!container) return;

        const qaData = window.TAX_ASSISTANT_QA || [];
        const favs = getFavorites();
        let filtered = qaData.filter(function (item) {
            if (favMode && favs.indexOf(item.id) === -1) return false;
            if (!favMode && currentCategory !== 'all' && item.category !== currentCategory) return false;
            return matchItem(item, currentKeyword);
        });

        if (filtered.length === 0) {
            container.innerHTML =
                '<div class="assistant-empty">' +
                '<i class="fa ' + (favMode ? 'fa-star-o' : 'fa-search') + '"></i>' +
                '<p>' + (favMode ? '还没有收藏的问题' : '未找到相关问题') + '</p>' +
                '<span class="assistant-empty-hint">' + (favMode ? '点击问答答案中的星标即可收藏' : '试试其他关键词') + '</span>' +
                '</div>';
            return;
        }

        var feedbacks = getFeedback();
        container.innerHTML = filtered.map(function (item) {
            const q = highlightKeyword(item.question, currentKeyword);
            const a = highlightKeyword(item.answer, currentKeyword);
            const isFav = favs.indexOf(item.id) !== -1;
            const fb = feedbacks[item.id] || { good: 0, bad: 0, mine: null };
            const favSyncing = syncingFav[item.id] > 0;
            const fbSyncing = syncingFb[item.id] > 0;
            const favCls = (isFav ? 'assistant-fav-btn fav-active' : 'assistant-fav-btn') + (favSyncing ? ' api-syncing' : '');
            const favIcon = isFav ? 'fa-star' : 'fa-star-o';
            const favText = isFav ? '已收藏' : '收藏';
            const goodCls = (fb.mine === 'good' ? 'assistant-fb-btn fb-clicked' : 'assistant-fb-btn') + (fbSyncing ? ' api-syncing' : '');
            const badCls = (fb.mine === 'bad' ? 'assistant-fb-btn fb-clicked fb-bad' : 'assistant-fb-btn') + (fbSyncing ? ' api-syncing' : '');

            // 关联跳转按钮
            var relatedBtn = '';
            if (item.related && item.related.page) {
                relatedBtn = '<button class="assistant-related-btn" data-related-page="' + item.related.page + '">' +
                             '<i class="fa fa-calculator"></i> ' + escapeHtml(item.related.label || '去测算') +
                             ' <i class="fa fa-arrow-right"></i></button>';
            }

            return (
                '<div class="assistant-qa-item" data-qa-id="' + item.id + '">' +
                '<div class="assistant-qa-q" data-expanded="false">' +
                '<i class="fa fa-question-circle assistant-qa-icon"></i>' +
                '<span class="assistant-qa-q-text">' + q + '</span>' +
                (isFav ? '<i class="fa fa-star assistant-qa-fav-mark" style="color:#f59e0b;font-size:11px;flex-shrink:0;"></i>' : '') +
                '<i class="fa fa-chevron-down assistant-qa-arrow"></i>' +
                '</div>' +
                '<div class="assistant-qa-a" style="display:none;">' +
                '<div class="assistant-qa-a-text">' + a.replace(/\n/g, '<br>') + '</div>' +
                '<div class="assistant-qa-footer">' +
                '<button class="' + favCls + '" data-fav-id="' + item.id + '"><i class="fa ' + favIcon + '"></i> ' + favText + '</button>' +
                '<span class="assistant-feedback">' +
                '<button class="' + goodCls + '" data-fb-id="' + item.id + '" data-fb-type="good"><i class="fa fa-thumbs-up"></i> 有用 ' + fb.good + '</button>' +
                '<button class="' + badCls + '" data-fb-id="' + item.id + '" data-fb-type="bad"><i class="fa fa-thumbs-down"></i> 无用 ' + fb.bad + '</button>' +
                '</span>' +
                relatedBtn +
                '</div>' +
                '</div>' +
                '</div>'
            );
        }).join('');

        // 绑定点击展开/收起
        container.querySelectorAll('.assistant-qa-q').forEach(function (qEl) {
            qEl.addEventListener('click', function () {
                const item = this.parentElement;
                const answer = item.querySelector('.assistant-qa-a');
                const arrow = this.querySelector('.assistant-qa-arrow');
                const isExpanded = this.getAttribute('data-expanded') === 'true';

                if (isExpanded) {
                    answer.style.display = 'none';
                    arrow.classList.remove('fa-chevron-up');
                    arrow.classList.add('fa-chevron-down');
                    this.setAttribute('data-expanded', 'false');
                } else {
                    answer.style.display = 'block';
                    arrow.classList.remove('fa-chevron-down');
                    arrow.classList.add('fa-chevron-up');
                    this.setAttribute('data-expanded', 'true');
                }
            });
        });

        // 绑定收藏按钮（本地乐观更新 + 后台 MockApi 同步）
        container.querySelectorAll('.assistant-fav-btn').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                var id = this.getAttribute('data-fav-id');
                var wasFav = isFavorited(id);
                logger.info('FAV', '点击收藏按钮', {
                    id: id,
                    wasFavorited: wasFav,
                    favMode: favMode
                });
                toggleFavorite(id);
                // 标记同步中 + 重渲染
                syncingFav[id] = (syncingFav[id] || 0) + 1;
                renderQAList();
                renderCategories();
                // 后台同步到模拟服务端
                MockApi.saveFavorite(id, wasFav ? 'remove' : 'add').then(function (res) {
                    syncingFav[id] = Math.max(0, (syncingFav[id] || 1) - 1);
                    // 同步完成后移除同步态（直接操作 DOM，避免整体重渲染折叠展开项）
                    var b = container.querySelector('.assistant-fav-btn[data-fav-id="' + id + '"]');
                    if (b && syncingFav[id] === 0) b.classList.remove('api-syncing');
                    logger.info('FAV', '服务端同步完成', { id: id, action: res.action });
                }).catch(function (err) {
                    syncingFav[id] = Math.max(0, (syncingFav[id] || 1) - 1);
                    // 回滚：撤销本地乐观更新（再次 toggle 恢复原状）
                    toggleFavorite(id);
                    renderQAList();
                    renderCategories();
                    logger.error('FAV', '服务端同步失败，已回滚本地状态', { id: id, error: err.message || String(err) });
                });
            });
        });

        // 绑定反馈按钮（本地乐观更新 + 后台 MockApi 同步）
        container.querySelectorAll('.assistant-fb-btn').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                var id = this.getAttribute('data-fb-id');
                var type = this.getAttribute('data-fb-type');
                var rec = recordFeedback(id, type);
                syncingFb[id] = (syncingFb[id] || 0) + 1;
                renderQAList();
                // 后台同步到模拟服务端
                MockApi.saveFeedback(id, type, { good: rec.good, bad: rec.bad }).then(function (res) {
                    syncingFb[id] = Math.max(0, (syncingFb[id] || 1) - 1);
                    var btns = container.querySelectorAll('.assistant-fb-btn[data-fb-id="' + id + '"]');
                    if (syncingFb[id] === 0) btns.forEach(function (b) { b.classList.remove('api-syncing'); });
                    logger.info('FEEDBACK', '服务端同步完成', { id: id, type: res.type, good: rec.good, bad: rec.bad });
                }).catch(function (err) {
                    syncingFb[id] = Math.max(0, (syncingFb[id] || 1) - 1);
                    // 回滚：撤销本地反馈（再次 recordFeedback 恢复原状）
                    recordFeedback(id, type);
                    renderQAList();
                    logger.error('FEEDBACK', '服务端同步失败，已回滚本地状态', { id: id, error: err.message || String(err) });
                });
            });
        });

        // 绑定关联跳转按钮
        container.querySelectorAll('.assistant-related-btn').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                var pageId = this.getAttribute('data-related-page');
                goToRelatedPage(pageId);
            });
        });
    }

    // 通过 id 展开某条问答（热门问题点击后定位展开）
    function expandQaById(id) {
        var container = document.getElementById('assistant-qa-list');
        if (!container) return;
        var target = container.querySelector('.assistant-qa-item[data-qa-id="' + id + '"]');
        if (!target) {
            logger.warn('HOT', '未找到目标问答项', { id: id });
            return;
        }
        var qEl = target.querySelector('.assistant-qa-q');
        if (qEl && qEl.getAttribute('data-expanded') !== 'true') {
            qEl.click();
        }
        try { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
        logger.info('HOT', '展开热门问题', { id: id });
    }

    // 关联计算页跳转
    function goToRelatedPage(pageId) {
        logger.info('NAV', '关联跳转', { page: pageId });
        closeAssistant();
        setTimeout(function () {
            if (typeof showPage === 'function') {
                showPage(pageId);
            } else {
                logger.warn('NAV', 'showPage 不可用，无法跳转', { page: pageId });
            }
        }, 300);
    }

    // ====== 渲染：快捷功能 ======
    function renderShortcuts() {
        const container = document.getElementById('assistant-shortcuts');
        if (!container) return;

        const shortcuts = window.TAX_ASSISTANT_SHORTCUTS || [];
        container.innerHTML = shortcuts.map(function (s) {
            return (
                '<button class="assistant-shortcut" data-action="' + s.action + '">' +
                '<i class="fa ' + s.icon + '"></i>' +
                '<span>' + s.label + '</span>' +
                '</button>'
            );
        }).join('');

        // 绑定点击
        container.querySelectorAll('.assistant-shortcut').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var action = this.getAttribute('data-action');
                handleShortcutAction(action);
            });
        });
    }

    // ====== 快捷功能动作处理 ======
    function handleShortcutAction(action) {
        InteractionLog.log('ASSISTANT', '快捷功能: ' + action);
        closeAssistant();

        // 延迟执行，让抽屉先关闭
        setTimeout(function () {
            switch (action) {
                case 'showRateTable':
                    // 滚动到帮助弹窗或显示税率表
                    if (typeof showHelpModal === 'function') {
                        showHelpModal();
                    }
                    break;
                case 'goBonusCalc':
                    // 跳转到综合所得计算页面
                    if (typeof goToStep === 'function') {
                        goToStep('forward');
                    }
                    break;
                case 'goHistory':
                    // 跳转到历史记录
                    if (typeof showPage === 'function') {
                        showPage('profile-history-page');
                    } else if (typeof viewHistory === 'function') {
                        viewHistory();
                    }
                    break;
                case 'showHelp':
                    if (typeof showHelpModal === 'function') {
                        showHelpModal();
                    }
                    break;
            }
        }, 300);
    }

    // ====== 渲染：热门问题 ======
    function renderHot() {
        var container = document.getElementById('assistant-hot');
        if (!container) return;
        var hotItems = (window.TAX_ASSISTANT_QA || []).filter(function (it) { return it.hot; });
        if (hotItems.length === 0) { container.innerHTML = ''; return; }
        container.innerHTML =
            '<div class="assistant-hot-title"><i class="fa fa-fire"></i>热门问题</div>' +
            '<div class="assistant-hot-chips">' +
            hotItems.map(function (it) {
                return '<button class="assistant-hot-chip" data-qa-id="' + it.id + '" title="' + escapeHtml(it.question) + '">' +
                       escapeHtml(it.question) + '</button>';
            }).join('') +
            '</div>';
        container.querySelectorAll('.assistant-hot-chip').forEach(function (chip) {
            chip.addEventListener('click', function () {
                var id = this.getAttribute('data-qa-id');
                var needReset = favMode || currentCategory !== 'all' || currentKeyword;
                logger.info('HOT', '点击热门问题', {
                    id: id,
                    question: this.textContent,
                    needReset: needReset,
                    favMode: favMode,
                    category: currentCategory,
                    keyword: currentKeyword
                });
                // 若处于收藏模式或非全部分类，先重置再展开
                if (needReset) {
                    favMode = false;
                    currentCategory = 'all';
                    currentKeyword = '';
                    var si = document.getElementById('assistant-search');
                    if (si) si.value = '';
                    toggleClearBtn('');
                    renderCategories();
                    renderQAList();
                    logger.info('HOT', '已重置筛选并回到全部', { id: id });
                }
                // renderQAList 同步执行，目标项已存在，直接展开
                expandQaById(id);
            });
        });
    }

    // ====== 搜索历史 / 联想下拉 ======
    function hideSuggest() {
        var box = document.getElementById('assistant-suggest');
        if (box) { box.style.display = 'none'; box.innerHTML = ''; }
        suggestActiveIndex = -1;
    }

    function renderSuggest(items, isHistory) {
        var box = document.getElementById('assistant-suggest');
        if (!box) return;
        if (items.length === 0) { hideSuggest(); return; }
        var head = isHistory
            ? '<div class="assistant-suggest-head"><span>搜索历史</span>' +
              '<button class="assistant-suggest-clear" id="assistant-suggest-clear">清空历史</button></div>'
            : '<div class="assistant-suggest-head"><span>相关问题</span></div>';
        var icon = isHistory ? 'fa-history' : 'fa-search';
        var body = items.map(function (text, i) {
            return '<div class="assistant-suggest-item" data-sg-idx="' + i + '" data-sg-text="' + escapeHtml(text) + '">' +
                   '<i class="fa ' + icon + '"></i><span class="sg-text">' + escapeHtml(text) + '</span></div>';
        }).join('');
        box.innerHTML = head + body;
        box.style.display = 'block';

        // 绑定点击
        box.querySelectorAll('.assistant-suggest-item').forEach(function (el) {
            el.addEventListener('click', function () {
                var text = this.getAttribute('data-sg-text');
                selectSuggest(text);
            });
        });
        var clearBtn = document.getElementById('assistant-suggest-clear');
        if (clearBtn) {
            clearBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                clearHistory();
                hideSuggest();
            });
        }
    }

    var lastSuggestCount = -1; // 上次联想结果数，用于去冗日志
    function handleSuggest(keyword) {
        keyword = (keyword || '').trim();
        if (!keyword) {
            // 输入为空时显示历史
            var hist = getHistory();
            if (hist.length > 0) {
                if (hist.length !== lastSuggestCount) {
                    logger.info('SEARCH', '显示搜索历史', { count: hist.length });
                    lastSuggestCount = hist.length;
                }
                renderSuggest(hist, true);
            } else {
                hideSuggest();
            }
            return;
        }
        // 联想：匹配问题/关键词
        var qaData = window.TAX_ASSISTANT_QA || [];
        var kw = keyword.toLowerCase();
        var matched = [];
        for (var i = 0; i < qaData.length && matched.length < 8; i++) {
            var it = qaData[i];
            if (it.question.toLowerCase().indexOf(kw) !== -1 ||
                (it.keywords && it.keywords.some(function (k) { return k.toLowerCase().indexOf(kw) !== -1; }))) {
                matched.push(it.question);
            }
        }
        // 仅当结果数变化时才打日志，避免高频输入下日志刷屏
        if (matched.length !== lastSuggestCount) {
            logger.info('SEARCH', '生成搜索联想', { keyword: keyword, matched: matched.length });
            lastSuggestCount = matched.length;
        }
        renderSuggest(matched, false);
    }

    function selectSuggest(text) {
        var si = document.getElementById('assistant-search');
        if (si) si.value = text;
        currentKeyword = text;
        pushHistory(text);
        hideSuggest();
        renderQAList();
        toggleClearBtn(text);
        logger.info('SEARCH', '选择联想项', { text: text });
    }

    // 上下键导航联想项
    function navigateSuggest(delta) {
        var box = document.getElementById('assistant-suggest');
        if (!box || box.style.display === 'none') return;
        var items = box.querySelectorAll('.assistant-suggest-item');
        if (items.length === 0) return;
        suggestActiveIndex = (suggestActiveIndex + delta + items.length) % items.length;
        items.forEach(function (el, i) {
            if (i === suggestActiveIndex) el.classList.add('suggest-active');
            else el.classList.remove('suggest-active');
        });
    }

    function toggleClearBtn(value) {
        var btn = document.getElementById('assistant-search-clear');
        if (!btn) return;
        btn.style.display = value ? 'block' : 'none';
    }

    // ====== 打开/关闭抽屉 ======
    function openAssistant() {
        var drawer = document.getElementById('tax-assistant-drawer');
        var fab = document.getElementById('tax-assistant-fab');
        var overlay = document.getElementById('tax-assistant-overlay');
        logger.info('CLICK_OPEN', '触发 openAssistant', {
            hasDrawer: !!drawer,
            hasFab: !!fab,
            hasOverlay: !!overlay,
            wasOpen: isOpen
        });
        if (!drawer) {
            logger.error('CLICK_OPEN', '抽屉 DOM 不存在，终止打开', null);
            return;
        }

        isOpen = true;
        drawer.classList.add('assistant-drawer-open');
        drawer.classList.remove('assistant-drawer-closed');
        if (fab) fab.style.display = 'none';
        if (overlay) overlay.classList.add('assistant-overlay-visible');
        logger.info('CLICK_OPEN', '抽屉已展开 / FAB 已隐藏 / 遮罩已显示', {
            isOpen: isOpen,
            drawerClass: drawer.className
        });

        // 重置搜索与筛选
        var searchInput = document.getElementById('assistant-search');
        if (searchInput) searchInput.value = '';
        currentKeyword = '';
        currentCategory = 'all';
        favMode = false;
        hideSuggest();
        toggleClearBtn('');

        renderCategories();
        renderHot();
        renderQAList();
        renderShortcuts();
        logger.info('CLICK_OPEN', '渲染完成（分类 / 热门 / 问答 / 快捷功能）', {
            category: currentCategory,
            keyword: currentKeyword,
            favMode: favMode
        });

        // 聚焦搜索框
        setTimeout(function () {
            if (searchInput) {
                try { searchInput.focus(); } catch (e) {
                    logger.warn('CLICK_OPEN', '搜索框聚焦失败', { error: String(e) });
                }
            }
        }, 300);

        InteractionLog.log('ASSISTANT', '打开悬浮税助手');
    }

    function closeAssistant() {
        var drawer = document.getElementById('tax-assistant-drawer');
        var fab = document.getElementById('tax-assistant-fab');
        var overlay = document.getElementById('tax-assistant-overlay');
        logger.info('CLICK_CLOSE', '触发 closeAssistant', {
            hasDrawer: !!drawer,
            wasOpen: isOpen
        });
        if (!drawer) {
            logger.error('CLICK_CLOSE', '抽屉 DOM 不存在，终止关闭', null);
            return;
        }

        isOpen = false;
        drawer.classList.remove('assistant-drawer-open');
        drawer.classList.add('assistant-drawer-closed');
        if (fab) fab.style.display = 'flex';
        if (overlay) overlay.classList.remove('assistant-overlay-visible');
        hideSuggest();
        logger.info('CLICK_CLOSE', '抽屉已收起 / FAB 已恢复 / 遮罩已隐藏', {
            isOpen: isOpen,
            fabDisplay: fab ? fab.style.display : null
        });

        InteractionLog.log('ASSISTANT', '关闭悬浮税助手');
    }

    function toggleAssistant() {
        if (isOpen) {
            closeAssistant();
        } else {
            openAssistant();
        }
    }

    // ====== 搜索防抖（带历史记录与联想） ======
    var searchTimer = null;
    function handleSearch(keyword) {
        if (searchTimer) clearTimeout(searchTimer);
        // 联想下拉实时更新（不防抖，保证响应灵敏）
        handleSuggest(keyword);
        searchTimer = setTimeout(function () {
            currentKeyword = (keyword || '').trim();
            renderQAList();
        }, 200);
    }

    // 提交搜索（Enter 时记录历史）
    function submitSearch(keyword) {
        var kw = (keyword || '').trim();
        if (!kw) return;
        currentKeyword = kw;
        pushHistory(kw);
        hideSuggest();
        renderQAList();
        logger.info('SEARCH', '提交搜索', { keyword: kw });
    }

    // ====== 初始化 ======
    function initTaxAssistant() {
        var fab = document.getElementById('tax-assistant-fab');
        var closeBtn = document.getElementById('assistant-close');
        var overlay = document.getElementById('tax-assistant-overlay');
        var searchInput = document.getElementById('assistant-search');

        logger.info('INIT', '开始初始化悬浮税助手', {
            hasFab: !!fab,
            hasCloseBtn: !!closeBtn,
            hasOverlay: !!overlay,
            hasSearchInput: !!searchInput,
            readyState: document.readyState
        });

        if (fab) {
            // 恢复上次停靠位置，否则默认右下角
            restoreFabPosition(fab);
            // 启用拖拽
            initFabDrag(fab);
            fab.addEventListener('click', function (e) {
                logger.info('CLICK_OPEN', 'FAB click 事件触发', {
                    suppressNextClick: suppressNextClick,
                    clientX: e.clientX,
                    clientY: e.clientY
                });
                // 拖拽后立即抑制误触的点击
                if (suppressNextClick) {
                    logger.info('CLICK_OPEN', '检测到 suppressNextClick=true，判定为拖拽尾随点击，已拦截', null);
                    suppressNextClick = false;
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }
                logger.info('CLICK_OPEN', '判定为正常点击，调用 openAssistant()', null);
                e.stopPropagation();
                openAssistant();
            });
        } else {
            logger.error('INIT', '未找到 #tax-assistant-fab，拖拽与点击逻辑未绑定', null);
        }

        if (closeBtn) {
            closeBtn.addEventListener('click', closeAssistant);
        } else {
            logger.warn('INIT', '未找到 #assistant-close，关闭按钮未绑定', null);
        }

        if (overlay) {
            overlay.addEventListener('click', closeAssistant);
        } else {
            logger.warn('INIT', '未找到 #tax-assistant-overlay，遮罩点击未绑定', null);
        }

        if (searchInput) {
            searchInput.addEventListener('input', function () {
                handleSearch(this.value);
                toggleClearBtn(this.value);
            });
            // 聚焦时：输入为空显示历史，有值显示联想
            searchInput.addEventListener('focus', function () {
                handleSuggest(this.value);
            });
            // 失焦时延迟关闭联想（让点击事件先触发）
            searchInput.addEventListener('blur', function () {
                setTimeout(hideSuggest, 180);
            });
            // 键盘导航：↑↓ 选择联想，Enter 提交，Esc 关闭联想
            searchInput.addEventListener('keydown', function (e) {
                var box = document.getElementById('assistant-suggest');
                var suggestOpen = box && box.style.display !== 'none';
                if (e.key === 'ArrowDown' && suggestOpen) {
                    e.preventDefault();
                    navigateSuggest(1);
                } else if (e.key === 'ArrowUp' && suggestOpen) {
                    e.preventDefault();
                    navigateSuggest(-1);
                } else if (e.key === 'Enter') {
                    if (suggestOpen && suggestActiveIndex >= 0) {
                        // 选中当前高亮联想项
                        var active = box.querySelector('.suggest-active');
                        if (active) {
                            e.preventDefault();
                            selectSuggest(active.getAttribute('data-sg-text'));
                            return;
                        }
                    }
                    submitSearch(this.value);
                } else if (e.key === 'Escape' && suggestOpen) {
                    e.preventDefault();
                    hideSuggest();
                }
            });
        }

        // 搜索清空按钮
        var clearBtn = document.getElementById('assistant-search-clear');
        if (clearBtn) {
            clearBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                if (searchInput) {
                    searchInput.value = '';
                    currentKeyword = '';
                    handleSearch('');
                    toggleClearBtn('');
                    renderQAList();
                    try { searchInput.focus(); } catch (err) {}
                }
                logger.info('SEARCH', '点击清空搜索', null);
            });
        }

        // ESC 键关闭
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && isOpen) {
                logger.info('CLICK_CLOSE', 'ESC 键触发关闭', { key: e.key });
                closeAssistant();
            }
        });

        // 阻止抽屉内点击冒泡到 overlay
        var drawer = document.getElementById('tax-assistant-drawer');
        if (drawer) {
            drawer.addEventListener('click', function (e) {
                e.stopPropagation();
            });
        }

        // 窗口尺寸变化时重新约束 FAB 位置
        window.addEventListener('resize', function () {
            if (fab) handleFabResize(fab);
        });

        logger.info('INIT', '悬浮税助手初始化完成', { listenerBound: !!fab });
        InteractionLog.log('ASSISTANT', '悬浮税助手已初始化');
    }

    // ====== FAB 位置：恢复 / 保存 / 应用 ======
    function applyFabPosition(fab, side, offsetTop) {
        var maxTop = window.innerHeight - FAB_SIZE - FAB_MARGIN;
        var minTop = FAB_MARGIN;
        var rawTop = offsetTop;
        var top = Math.max(minTop, Math.min(maxTop, offsetTop));

        fab.style.top = top + 'px';
        if (side === 'left') {
            fab.style.left = FAB_MARGIN + 'px';
            fab.style.right = 'auto';
            fab.classList.add('dock-left');
        } else {
            fab.style.right = FAB_MARGIN + 'px';
            fab.style.left = 'auto';
            fab.classList.remove('dock-left');
        }
        fab.style.bottom = 'auto';

        logger.info('DOCK', '应用停靠位置', {
            side: side,
            rawOffsetTop: rawTop,
            clampedTop: top,
            minTop: minTop,
            maxTop: maxTop,
            viewportH: window.innerHeight,
            viewportW: window.innerWidth,
            dockLeftClass: fab.classList.contains('dock-left')
        });
    }

    function restoreFabPosition(fab) {
        var side = 'right';
        var offsetTop = window.innerHeight - FAB_SIZE - 24; // 默认右下角
        var source = 'default';
        try {
            var saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                var pos = JSON.parse(saved);
                if (pos && (pos.side === 'left' || pos.side === 'right') && typeof pos.offsetTop === 'number') {
                    side = pos.side;
                    offsetTop = pos.offsetTop;
                    source = 'localStorage';
                } else {
                    logger.warn('DOCK', 'localStorage 中位置数据格式异常，回退默认', { raw: saved });
                }
            }
        } catch (e) {
            logger.error('DOCK', '读取 localStorage 失败，回退默认', { error: String(e) });
        }
        logger.info('DOCK', '恢复停靠位置', {
            source: source,
            side: side,
            offsetTop: offsetTop
        });
        applyFabPosition(fab, side, offsetTop);
    }

    function saveFabPosition(side, offsetTop) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ side: side, offsetTop: offsetTop }));
            logger.info('DOCK', '停靠位置已写入 localStorage', { side: side, offsetTop: offsetTop });
        } catch (e) {
            logger.error('DOCK', '写入 localStorage 失败', { error: String(e), side: side, offsetTop: offsetTop });
        }
    }

    function handleFabResize(fab) {
        var rect = fab.getBoundingClientRect();
        var side = (fab.classList.contains('dock-left')) ? 'left' : 'right';
        logger.info('DOCK', '窗口 resize，重新约束 FAB 位置', {
            currentSide: side,
            currentTop: rect.top,
            viewportW: window.innerWidth,
            viewportH: window.innerHeight
        });
        applyFabPosition(fab, side, rect.top);
    }

    // ====== FAB 拖拽逻辑 ======
    function initFabDrag(fab) {
        fab.addEventListener('pointerdown', function (e) {
            // 仅主键响应拖拽，避免右键干扰
            if (e.button !== 0 && e.pointerType === 'mouse') {
                logger.info('DRAG', '非主键 pointerdown，忽略（避免右键干扰）', { button: e.button, pointerType: e.pointerType });
                return;
            }
            dragState.dragging = true;
            dragState.moved = false;
            dragState.startX = e.clientX;
            dragState.startY = e.clientY;
            var rect = fab.getBoundingClientRect();
            dragState.origLeft = rect.left;
            dragState.origTop = rect.top;
            dragState.pointerId = e.pointerId;
            var captured = true;
            try { fab.setPointerCapture(e.pointerId); } catch (err) { captured = false; }
            fab.classList.add('dragging');
            fab.addEventListener('pointermove', onFabPointerMove);
            fab.addEventListener('pointerup', onFabPointerUp);
            fab.addEventListener('pointercancel', onFabPointerUp);

            logger.info('DRAG', 'pointerdown - 拖拽开始', {
                pointerType: e.pointerType,
                button: e.button,
                pointerId: e.pointerId,
                startClientX: e.clientX,
                startClientY: e.clientY,
                origLeft: rect.left,
                origTop: rect.top,
                pointerCapture: captured
            });
        });
    }

    function onFabPointerMove(e) {
        if (!dragState.dragging) return;
        var fab = document.getElementById('tax-assistant-fab');
        if (!fab) {
            logger.error('DRAG', 'pointermove 期间 FAB DOM 丢失', null);
            return;
        }

        var dx = e.clientX - dragState.startX;
        var dy = e.clientY - dragState.startY;
        // 仅在首次越过阈值时记录一次，避免高频 pointermove 日志刷屏
        if (!dragState.moved && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
            dragState.moved = true;
            logger.info('DRAG', '越过拖拽阈值，进入拖拽态', {
                dx: dx,
                dy: dy,
                threshold: DRAG_THRESHOLD,
                clientX: e.clientX,
                clientY: e.clientY
            });
        }
        if (!dragState.moved) return;

        // 切换为 left/top 定位
        var newLeft = dragState.origLeft + dx;
        var newTop = dragState.origTop + dy;
        var clampedLeft = Math.max(FAB_MARGIN, Math.min(window.innerWidth - FAB_SIZE - FAB_MARGIN, newLeft));
        var clampedTop = Math.max(FAB_MARGIN, Math.min(window.innerHeight - FAB_SIZE - FAB_MARGIN, newTop));

        fab.style.left = clampedLeft + 'px';
        fab.style.top = clampedTop + 'px';
        fab.style.right = 'auto';
        fab.style.bottom = 'auto';
    }

    function onFabPointerUp(e) {
        if (!dragState.dragging) return;
        var fab = document.getElementById('tax-assistant-fab');
        dragState.dragging = false;
        if (fab) {
            fab.removeEventListener('pointermove', onFabPointerMove);
            fab.removeEventListener('pointerup', onFabPointerUp);
            fab.removeEventListener('pointercancel', onFabPointerUp);
            fab.classList.remove('dragging');
            try { fab.releasePointerCapture(dragState.pointerId); } catch (err) {}
        }

        logger.info('DRAG', 'pointerup - 拖拽结束', {
            moved: dragState.moved,
            hasFab: !!fab,
            clientX: e.clientX,
            clientY: e.clientY
        });

        if (!dragState.moved) {
            logger.info('DRAG', '未越过阈值，视为点击，交由 click 处理器处理', null);
            return;
        }

        suppressNextClick = true; // 抑制松手后的 click 误触
        logger.info('DRAG', '已设置 suppressNextClick=true 拦截尾随 click', null);

        if (!fab) {
            logger.error('DOCK', '松手时 FAB DOM 丢失，无法停靠', null);
            return;
        }
        var rect = fab.getBoundingClientRect();
        var centerX = rect.left + rect.width / 2;
        var viewportCenterX = window.innerWidth / 2;
        var side = centerX < viewportCenterX ? 'left' : 'right';
        logger.info('DOCK', '计算停靠方向', {
            fabLeft: rect.left,
            fabWidth: rect.width,
            centerX: centerX,
            viewportWidth: window.innerWidth,
            viewportCenterX: viewportCenterX,
            decidedSide: side
        });
        applyFabPosition(fab, side, rect.top);
        saveFabPosition(side, rect.top);

        InteractionLog.log('ASSISTANT', 'FAB 停靠到 ' + side + ' 侧', { top: rect.top });
    }

    // 暴露到全局
    window.TaxAssistant = {
        open: openAssistant,
        close: closeAssistant,
        toggle: toggleAssistant,
        search: handleSearch,
        submitSearch: submitSearch,
        toggleFavorite: toggleFavorite,
        isFavorited: isFavorited,
        recordFeedback: recordFeedback,
        expandQaById: expandQaById,
        goToRelatedPage: goToRelatedPage,
        mockApi: MockApi,   // 暴露 MockApi 便于测试注入失败
        logger: logger      // 暴露 logger 便于动态调级别
    };

    // 自动初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTaxAssistant);
    } else {
        initTaxAssistant();
    }
})();
