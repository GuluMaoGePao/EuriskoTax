/**
 * 通用多步测算向导（阶段17 17A-4）
 *
 * 为什么要有这个文件：
 *   此前 4 个「完整测算」（综合所得 / 经营所得 / 分类所得 / 反向倒算）各自有一页 HTML 与一套私有
 *   分步逻辑 —— 每加一个税种就要再写一页。这正是阶段17 要终结的老路：stage17 方案 §4.1 的原话是
 *   「每个税种变成**写一页 HTML**，而不是**写一份 spec**」。本文件按注册表里的 steps / fields
 *   渲染任意税种的多步向导 —— **新增一个完整测算 = 在 tool-registry.js 里加一条 spec。**
 *
 * 与速算器页的关系（17A-5 的硬约束，有单测守着）：
 *   字段渲染（fieldHtml）、读值（readValues）、条件显隐（visibleFields）、结果格式化（fmtValue）
 *   一律复用 toolbox-ui.js 的既有实现，**不复制一份** —— 复制必然漂移，漂移在增值税上尤其贵，
 *   因为它是 surtax / stamp（附加税印花税）的计税依据，会顺着依赖链放大。
 *
 * 接管范围：
 *   只接管 status:'deep' 且**没有 pageId** 的工具。有 pageId 的 4 个原有 deep 仍走各自页面，
 *   行为零变化；等 17B 反向迁移完成后再逐个切过来。
 */
(function () {
    'use strict';

    var PAGE_ID = 'deep-wizard-page';
    var DRAFT_PREFIX = 'euriskoDeepDraft:';

    var state = { toolId: null, stepIndex: 0, values: {} };

    function R() { return window.EuriskoToolRegistry; }
    function TB() { return window.EuriskoToolbox; }

    function esc(s) {
        return String(s === undefined || s === null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function showPageFn(pageId) {
        if (typeof window.showPage === 'function') window.showPage(pageId);
    }

    // 只接管 spec 驱动的工具：deep 且没有独立页面。
    function has(tool) {
        return !!tool && tool.status === 'deep' && !tool.pageId;
    }

    function stepsOf(tool) {
        var list = (tool.steps || [{ key: 'main', title: '填写数据', why: '' }]).slice();
        // 结果步由渲染器统一追加 —— 每个完整测算都有，不该在每个 spec 里重复声明
        list.push({ key: '__result', title: '计算结果', result: true });
        return list;
    }

    function fieldsOfStep(tool, stepKey) {
        var first = (tool.steps && tool.steps[0] && tool.steps[0].key) || 'main';
        return (tool.fields || []).filter(function (f) {
            return (f.step || first) === stepKey;
        });
    }

    function defaultsOf(tool) {
        var v = {};
        (tool.fields || []).forEach(function (f) { v[f.key] = f.default; });
        return v;
    }

    function visibleIn(tool, fields, values) {
        // 复用速算器的条件显隐判定（同一个函数，不重新实现 when 语义）
        return TB().visibleFields({ fields: fields }, values);
    }

    function headerHtml(tool, steps) {
        var ind = steps.map(function (s, i) {
            var on = i === state.stepIndex ? ' active' : '';
            return (i ? '<div class="step-line"></div>' : '') +
                '<div class="step"><div class="step-number' + on + '">' + (i + 1) + '</div>' +
                '<div class="step-title' + on + '">' + esc(s.title) + '</div></div>';
        }).join('');
        return '<div class="calc-sticky-header"><div class="max-w-5xl mx-auto">' +
                '<div class="calc-top-row">' +
                    '<div class="flex items-center min-w-0 flex-1">' +
                        '<button id="dw-back" class="calc-back-btn" title="返回工具箱"><i class="fa fa-arrow-left"></i></button>' +
                        '<div class="calc-title-wrap">' +
                            '<h2 class="calc-page-title">' + esc(tool.name) + '</h2>' +
                            '<p class="calc-page-subtitle">' + esc(tool.subtitle || '') + '</p>' +
                        '</div>' +
                    '</div>' +
                    '<div class="flex items-center space-x-1">' +
                        '<button id="dw-reset" class="calc-action-btn" title="重置"><i class="fa fa-refresh"></i></button>' +
                    '</div>' +
                '</div>' +
                '<div class="step-indicator">' + ind + '</div>' +
            '</div></div>';
    }

    function navHtml(steps) {
        var isFirst = state.stepIndex === 0;
        var next = steps[state.stepIndex + 1];
        var label = next && next.result ? '计算结果' : '下一步：' + esc(next ? next.title : '');
        return '<div class="mt-6 flex flex-col md:flex-row gap-3 justify-between items-stretch md:items-center">' +
            (isFirst ? '<span></span>' :
                '<button id="dw-prev" class="btn bg-gray-200 text-gray-700 hover:bg-gray-300 whitespace-nowrap w-full md:w-auto">' +
                '<i class="fa fa-arrow-left mr-2"></i>上一步</button>') +
            '<button id="dw-next" class="btn btn-primary whitespace-nowrap w-full md:w-auto">' +
            label + '<i class="fa fa-arrow-right ml-2"></i></button>' +
            '</div>';
    }

    function resultHtml(tool) {
        var out = null;
        try { out = tool.compute(state.values); } catch (e) { out = null; }
        if (!out || !out.primary) {
            return '<div class="card"><p class="text-sm text-gray-600">暂无结果，请返回检查输入。</p></div>';
        }
        var rows = (out.rows || []).map(function (r) {
            return '<div class="flex items-center justify-between py-2 border-b border-gray-100">' +
                '<span class="text-sm text-gray-600">' + esc(r.label) + '</span>' +
                '<span class="font-medium">' + esc(TB().fmtValue(r.value, r.kind)) + '</span></div>';
        }).join('');
        return '<div class="card">' +
                '<div class="text-sm text-gray-600">' + esc(out.primary.label) + '</div>' +
                '<div class="text-3xl font-bold text-primary my-2">' + esc(TB().fmtValue(out.primary.value, out.primary.kind)) + '</div>' +
                '<div class="mt-4">' + rows + '</div>' +
                (out.note ? '<p class="text-sm text-gray-600 mt-4">' + esc(out.note) + '</p>' : '') +
                '<div class="mt-6"><button id="dw-prev" class="btn bg-gray-200 text-gray-700 hover:bg-gray-300">' +
                '<i class="fa fa-arrow-left mr-2"></i>返回上一步</button></div>' +
            '</div>';
    }

    function inputHtml(tool, step) {
        var fs = visibleIn(tool, fieldsOfStep(tool, step.key), state.values);
        var inputs = fs.map(function (f) { return TB().fieldHtml(f); }).join('');
        return '<div class="card">' +
            '<h3 class="text-lg font-bold text-primary mb-4">' + esc(step.title) + '</h3>' +
            (step.why ? '<p class="text-sm text-gray-600 mb-4">' + esc(step.why) + '</p>' : '') +
            inputs + navHtml(stepsOf(tool)) +
            '</div>';
    }

    function paneHtml(tool, steps) {
        var step = steps[state.stepIndex];
        var body = step.result ? resultHtml(tool) : inputHtml(tool, step);
        return '<div class="step-content max-w-5xl mx-auto"><div class="step-pane active">' + body + '</div></div>';
    }

    function render() {
        var tool = R() && R().get(state.toolId);
        var host = document.getElementById(PAGE_ID);
        if (!tool || !host) return;
        var steps = stepsOf(tool);
        if (state.stepIndex >= steps.length) state.stepIndex = steps.length - 1;
        host.innerHTML = headerHtml(tool, steps) + paneHtml(tool, steps);
        bind(tool, steps);
        // fieldHtml 写的是字段的 default（它是速算器与向导共用、只认 schema）。
        // 分步向导每次只渲染当前步，若不回填，用户「上一步 → 下一步」就会被打回默认值 ——
        // 这类丢值肉眼很难发现（值还在内存里、只是没显示出来），所以在这里统一回填。
        applyValues(state.values);
    }

    function applyValues(values) {
        Object.keys(values || {}).forEach(function (k) {
            var el = document.getElementById('qf-' + k);
            if (!el) return;
            if (el.type === 'checkbox') el.checked = !!values[k];
            else el.value = values[k];
        });
    }

    // 只把**当前步**的字段写回 state.values：分步渲染时其他步的字段不在 DOM 里，
    // 若按整表覆盖，readValues 会把缺失项填回 default —— 切一次步骤，前面填的值全丢。
    function collect(tool) {
        var dom = TB().readValues(tool);
        var step = stepsOf(tool)[state.stepIndex];
        if (!step) return;
        fieldsOfStep(tool, step.key).forEach(function (f) {
            state.values[f.key] = dom[f.key];
        });
        // 不在这里落盘：草稿要记的是**移动后**停在哪一步，由调用方在改完 stepIndex 后再 saveDraft
    }

    function saveDraft() {
        try {
            localStorage.setItem(DRAFT_PREFIX + state.toolId,
                JSON.stringify({ stepIndex: state.stepIndex, values: state.values }));
        } catch (e) { /* 隐私模式 / 配额满：草稿丢了也不该影响测算本身 */ }
    }

    function loadDraft(toolId) {
        try { return JSON.parse(localStorage.getItem(DRAFT_PREFIX + toolId) || 'null'); }
        catch (e) { return null; }
    }

    function bind(tool, steps) {
        var back = document.getElementById('dw-back');
        if (back) back.addEventListener('click', function () {
            collect(tool);      // 退出前收值：下次进来才是完整草稿，而不是半截
            saveDraft();
            showPageFn('tools-page');
        });

        var reset = document.getElementById('dw-reset');
        if (reset) reset.addEventListener('click', function () {
            state.values = defaultsOf(tool);
            state.stepIndex = 0;
            render();
        });

        var prev = document.getElementById('dw-prev');
        if (prev) prev.addEventListener('click', function () {
            collect(tool);      // 先收值再退 —— 否则「改完点上一步」等于把这次修改扔掉
            state.stepIndex = Math.max(0, state.stepIndex - 1);
            saveDraft();
            render();
        });

        var next = document.getElementById('dw-next');
        if (next) next.addEventListener('click', function () {
            collect(tool);
            state.stepIndex = Math.min(steps.length - 1, state.stepIndex + 1);
            saveDraft();
            render();
        });

        // 条件字段（when）所依赖的控件变化后重渲染当前步，让该出现 / 该隐藏的字段立刻跟上
        var step = steps[state.stepIndex];
        if (step && !step.result) {
            fieldsOfStep(tool, step.key).forEach(function (f) {
                if (!f.when) return;
                var el = document.getElementById('qf-' + f.when.key);
                if (!el) return;
                el.addEventListener('change', function () { collect(tool); render(); });
            });
        }
    }

    function open(toolId, opts) {
        var tool = R() && R().get(toolId);
        if (!has(tool)) return false;
        opts = opts || {};
        state.toolId = toolId;
        state.values = defaultsOf(tool);
        state.stepIndex = 0;
        // 断点续算：有没填完的草稿就接着填，不让用户从头再来
        if (!opts.fresh) {
            var d = loadDraft(toolId);
            if (d && d.values) {
                state.values = d.values;
                state.stepIndex = Math.min(d.stepIndex || 0, stepsOf(tool).length - 1);
            }
        }
        render();
        showPageFn(PAGE_ID);
        return true;
    }

    window.EuriskoDeepWizard = {
        open: open,
        has: has,
        // 暴露给单测：断言「结果步自动追加」「字段按 step 归组」这类肉眼难守的约束
        stepsOf: stepsOf,
        fieldsOfStep: fieldsOfStep
    };
})();
