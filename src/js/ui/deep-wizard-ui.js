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
    // 与存量 4 页同一句话、同样就地展示（不藏在页脚）—— 测算 ≠ 申报，这句话必须跟着结果走。
    var DISCLAIMER = '测算结果依据您填写的数据与现行政策估算，仅供参考，不构成税务建议；正式申报请以税务机关核定为准。';

    var state = { toolId: null, stepIndex: 0, values: {}, lastResult: null };

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

    // 导出用内容：两个导出函数默认读的是存量 4 页的**全局 results**（spec 向导没有这些全局变量，
    // 不跳过校验就会被「请先进行计算」挡回来），所以这里按同一份 out 自己拼一份报告。
    function exportHtml(tool, out) {
        var rows = (out.rows || []).map(function (r) {
            return '<tr><td style="padding:6px 8px;border-bottom:1px solid #eee;color:#4b5563">' + esc(r.label) +
                '</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;font-weight:600">' +
                esc(TB().fmtValue(r.value, r.kind)) + '</td></tr>';
        }).join('');
        return '<div style="padding:24px;font-family:-apple-system,\'Segoe UI\',\'Microsoft YaHei\',sans-serif;color:#1f2937">' +
            '<h2 style="margin:0 0 4px;font-size:18px">' + esc(tool.name) + '</h2>' +
            '<div style="color:#6b7280;font-size:12px">' + esc(tool.subtitle || '') + '</div>' +
            '<div style="margin:16px 0;padding:12px;background:#f3f4f6;border-radius:8px">' +
                '<div style="font-size:12px;color:#6b7280">' + esc(out.primary.label) + '</div>' +
                '<div style="font-size:24px;font-weight:700">' + esc(TB().fmtValue(out.primary.value, out.primary.kind)) + '</div>' +
            '</div>' +
            '<table style="width:100%;border-collapse:collapse;font-size:13px">' + rows + '</table>' +
            (out.note ? '<p style="margin-top:12px;font-size:12px;color:#6b7280">' + esc(out.note) + '</p>' : '') +
            '<p style="margin-top:16px;font-size:11px;color:#9ca3af">' + DISCLAIMER + '</p>' +
            '</div>';
    }

    // 保存到历史：与存量 4 页**同一处**（tax-calculator.js 的 saveToHistory → calculationHistory），
    // 这样历史记录页不必为 spec 驱动的向导开特例 —— 17B 迁移后入口换了、历史还是那一条。
    function saveResult(tool) {
        var out = state.lastResult;
        if (!out) {
            if (typeof showAlert === 'function') showAlert('请先完成计算后再保存');
            return;
        }
        if (typeof saveToHistory !== 'function') {
            console.warn('[deep-wizard] saveToHistory 未加载，保存被跳过');
            return;
        }
        saveToHistory({
            toolId: tool.id,
            values: state.values,
            primary: out.primary,
            rows: out.rows || [],
            note: out.note || ''
        }, tool.id, tool.name);
    }

    function exportResult(tool, kind) {
        var out = state.lastResult;
        if (!out) {
            if (typeof showAlert === 'function') showAlert('请先完成计算后再导出');
            return;
        }
        var html = exportHtml(tool, out);
        var title = tool.name + '测算表';
        if (kind === 'pdf') {
            if (typeof exportToPDF !== 'function') {
                console.warn('[deep-wizard] exportToPDF 未加载，导出被跳过');
                return;
            }
            // skipResultCheck：导出函数默认校验存量 4 页的全局 results，spec 向导没有那些变量
            exportToPDF(null, title, { skipResultCheck: true, contentBuilder: function () { return html; } });
            return;
        }
        if (typeof exportToWord !== 'function') {
            console.warn('[deep-wizard] exportToWord 未加载，导出被跳过');
            return;
        }
        exportToWord(null, title, { skipResultCheck: true, content: html });
    }

    function resultHtml(tool) {
        var out = null;
        try { out = tool.compute(state.values); } catch (e) { out = null; }
        if (!out || !out.primary) {
            return '<div class="card"><p class="text-sm text-gray-600">暂无结果，请返回检查输入。</p></div>';
        }
        state.lastResult = out;     // 保存 / 导出按钮要用，避免再算一遍（口径也不会走岔）

        var rows = (out.rows || []).map(function (r) {
            return '<div class="flex items-center justify-between py-2 border-b border-gray-100">' +
                '<span class="text-sm text-gray-600">' + esc(r.label) +
                (r.hint ? '<i class="fa fa-question-circle ml-1 text-gray-400" title="' + esc(r.hint) + '"></i>' : '') +
                '</span>' +
                '<span class="font-medium">' + esc(TB().fmtValue(r.value, r.kind)) + '</span></div>';
        }).join('');

        // 推导链（台账 C）：与速算器**同一套约定** —— compute 返回 steps，渲染走 utils.js 的
        // renderFormulaStepsHtml。不写第二套：20 个速算器与存量 4 页都在用那一份，写第二份必然漂移。
        // 它是 17B 迁移的硬前置：存量 4 页都有「查看计算过程」，spec 向导没有就等于迁移即降级。
        var stepsHtml = '';
        if (out.steps && out.steps.length) {
            if (typeof renderFormulaStepsHtml === 'function') {
                stepsHtml = '<details id="dw-formula-panel" class="mt-4">' +
                    '<summary class="flex items-center justify-between cursor-pointer select-none px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm font-medium text-gray-800">' +
                    '<span><i class="fa fa-calculator mr-2"></i>查看计算过程</span>' +
                    '<span class="text-xs text-gray-500">每一步都可核对</span>' +
                    '</summary>' +
                    '<div class="mt-3">' + renderFormulaStepsHtml(out.steps) + '</div>' +
                    '</details>';
            } else {
                // 不静默吞掉（前车之鉴：auth-ui.js 死选择器靠 ?. 抹错而多年未发现）
                console.warn('[deep-wizard] renderFormulaStepsHtml 未加载（utils.js），推导链面板被跳过');
            }
        }

        return '<div class="card" id="dw-result-card">' +
                '<div class="text-sm text-gray-600">' + esc(out.primary.label) + '</div>' +
                '<div class="text-3xl font-bold text-primary my-2">' + esc(TB().fmtValue(out.primary.value, out.primary.kind)) + '</div>' +
                '<div class="mt-4">' + rows + '</div>' +
                (out.note ? '<p class="text-sm text-gray-600 mt-4">' + esc(out.note) + '</p>' : '') +
                stepsHtml +
                // 免责声明：与存量 4 页同一句话、同样就地展示（不藏在页脚）
                '<p class="result-disclaimer">' + DISCLAIMER + '</p>' +
                '<div class="mt-6">' +
                    '<button id="dw-save" class="btn bg-green-600 text-white hover:bg-green-700 w-full mb-3">' +
                    '<i class="fa fa-save mr-2"></i>保存计算结果</button>' +
                    '<button id="dw-export-pdf" class="btn btn-secondary w-full mb-3">' +
                    '<i class="fa fa-download mr-2"></i>导出PDF报告</button>' +
                    '<button id="dw-export-word" class="btn bg-purple-600 text-white hover:bg-purple-700 w-full">' +
                    '<i class="fa fa-file-word-o mr-2"></i>导出Word报告</button>' +
                '</div>' +
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

        var saveBtn = document.getElementById('dw-save');
        if (saveBtn) saveBtn.addEventListener('click', function () { saveResult(tool); });

        var pdfBtn = document.getElementById('dw-export-pdf');
        if (pdfBtn) pdfBtn.addEventListener('click', function () { exportResult(tool, 'pdf'); });

        var wordBtn = document.getElementById('dw-export-word');
        if (wordBtn) wordBtn.addEventListener('click', function () { exportResult(tool, 'word'); });

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
