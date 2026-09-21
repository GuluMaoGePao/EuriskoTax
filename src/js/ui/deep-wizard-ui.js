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

    var state = { toolId: null, stepIndex: 0, values: {}, lastResult: null, compareKey: null };

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

    // ====== 阶段19-7：视图密度（简明 / 完整）======
    // 与速算器共用同一份偏好（window.EuriskoModePref），只读、不自己存一份 —— 两份默认值必然分家。
    var ADV_STEP = '__advanced';

    function modeLib() { return window.EuriskoModePref; }

    // 偏好模块不在时（index.html 脚本顺序排错 / 只用渲染器的老测试）按**完整**渲染：
    // 宁可多显示一步，也绝不在用户不知情时把参数收起来 —— 藏参数是这个特性唯一不可逆的风险。
    function isFullMode() {
        var p = modeLib();
        return !p || p.get() === p.FULL;
    }

    function isAdvanced(x) { return !!x && x.level === 'advanced'; }

    function stepKeyOfField(tool, f) {
        var first = (tool.steps && tool.steps[0] && tool.steps[0].key) || 'main';
        return f.step || first;
    }

    // full 参数化：切换视图时要能拿到**切换前**那份步骤表（否则收值会收错一步）
    function stepsOfWith(tool, full) {
        var list = (tool.steps || [{ key: 'main', title: '填写数据', why: '' }]).slice();
        // 简明视图：advanced 步**合并**成一步，而不是删掉 —— 删掉等于把这些参数藏起来，
        // 用户既看不见也改不了；合并后它们仍以 spec 的 default 参与计算（口径不变）。
        if (!full && list.some(isAdvanced)) {
            list = list.filter(function (s) { return !isAdvanced(s); }).concat([{
                key: ADV_STEP, title: '补充参数（可选）',
                why: '不填也能算：以下参数按默认值参与测算，改了才用你的数'
            }]);
        }
        // 结果步由渲染器统一追加 —— 每个完整测算都有，不该在每个 spec 里重复声明
        list.push({ key: '__result', title: '计算结果', result: true });
        return list;
    }

    function stepsOf(tool) { return stepsOfWith(tool, isFullMode()); }

    function fieldsOfStep(tool, stepKey) {
        if (stepKey === ADV_STEP) {
            var advKeys = (tool.steps || []).filter(isAdvanced).map(function (s) { return s.key; });
            return (tool.fields || []).filter(function (f) {
                return advKeys.indexOf(stepKeyOfField(tool, f)) !== -1;
            });
        }
        return (tool.fields || []).filter(function (f) {
            return stepKeyOfField(tool, f) === stepKey;
        });
    }

    function defaultsOf(tool) {
        var v = {};
        (tool.fields || []).forEach(function (f) {
            // repeater 的默认值是一条数组（可以是空)：取不到就给一条空条目，别给 undefined
            if (f.type === 'repeater') {
                v[f.key] = (Array.isArray(f.default) && f.default.length) ? f.default : [repBlank(f)];
            } else {
                v[f.key] = f.default;
            }
        });
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
                        // 阶段19-7：视图密度 pill（与速算器同一颗、同一份措辞，内容在 bind() 里填）
                        '<div id="dw-mode-pill"></div>' +
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

    // ====== 多方案对比（compare）======
    // 有些测算天然要给好几份答案 —— 反向倒算就是典型：同样的到手目标，「保守 / 均衡 / 激进」
    // 三种口径给出三个税前数，用户要的是横向比着挑，不是一个孤零零的数。
    // 交给渲染器承担，spec 只声明结果：compute 返回 compare.scenarios，每行 billboard 同一个 label，
    // 渲染器负责「切换主口径 + 拼对比表 + 导出带上对比表」。
    //   compare = { label, active, scenarios: [{ key, label, why?, primary, rows, steps? }] }
    // 约定：被选中的那一份就是「当前结果」—— 保存 / 导出都跟着它走，不许出现「界面看 A、导出 B」。
    function activeScenario(cmp) {
        if (!cmp) return null;
        var key = state.compareKey || cmp.active;
        return (cmp.scenarios || []).filter(function (s) { return s.key === key; })[0] || null;
    }

    // 以**当前口径**重新出一份 out：值的替换在渲染层完成，compute 不必知道自己被切换了
    function viewOut(out) {
        var cmp = out.compare;
        var sc = activeScenario(cmp);
        if (!sc) return out;
        return {
            primary: sc.primary || out.primary,
            rows: sc.rows || out.rows,
            steps: sc.steps || out.steps,
            extras: sc.extras || out.extras,
            note: sc.note === undefined ? out.note : sc.note,
            compare: cmp
        };
    }

    // 对比表行集：**主指标自动成为首行**。
    // 各口径最重要的那个数（primary）正是用户要比的东西，要求每个 spec 记得把它再抄进 rows 是
    // 个陷阱 —— 抄漏了，界面上卡片还在、导出报告里却只剩明细。所以这里兜底，除非 spec 自己
    // 已经把主指标写进 rows（那时不再重复加一行，按原样走）。
    function compareRowSet(cmp) {
        var scenarios = cmp.scenarios || [];
        var first = scenarios[0];
        if (!first) return [];
        var already = (first.rows || []).some(function (r) { return r.label === first.primary.label; });
        var labels = (already ? [] : [first.primary.label])
            .concat((first.rows || []).map(function (r) { return r.label; }));
        return labels.map(function (label) {
            var cells = scenarios.map(function (s) {
                if (s.primary && s.primary.label === label) return s.primary;
                return (s.rows || []).filter(function (x) { return x.label === label; })[0] || null;
            });
            var kind = null;
            cells.forEach(function (c) { if (!kind && c) kind = c.kind; });
            return { label: label, kind: kind, cells: cells };
        });
    }

    function compareRowHtml(cmp) {
        var scenarios = cmp.scenarios || [];
        var active = state.compareKey || cmp.active;
        // 行序以第一个方案为准：同一次 compute 出来的各方案共用同一套行，
        // 缺项显示「—」而不是报错 —— 少一个口径不该让整张表消失。
        return compareRowSet(cmp).map(function (row) {
            var tds = row.cells.map(function (cell, i) {
                var on = scenarios[i] && scenarios[i].key === active;
                return '<td class="px-2 py-2 text-right' + (on ? ' bg-blue-50 font-semibold' : '') + '">' +
                    (cell ? esc(TB().fmtValue(cell.value, cell.kind || row.kind)) : '—') + '</td>';
            }).join('');
            return '<tr class="border-t border-gray-100">' +
                '<td class="px-2 py-2 text-gray-600">' + esc(row.label) + '</td>' + tds + '</tr>';
        }).join('');
    }

    function compareHtml(cmp) {
        var scenarios = cmp.scenarios || [];
        if (scenarios.length < 2) return '';
        var active = state.compareKey || cmp.active;
        var heads = scenarios.map(function (s) {
            return '<th class="px-2 py-2 text-right' + (s.key === active ? ' text-primary' : ' text-gray-500') + '">' +
                esc(s.label) + '</th>';
        }).join('');
        var cards = scenarios.map(function (s) {
            var on = s.key === active;
            return '<button id="dw-cmp-' + esc(s.key) + '" data-dw-compare="' + esc(s.key) + '"' +
                ' class="flex-1 min-w-0 text-left px-3 py-2 rounded-lg border ' +
                (on ? 'border-primary bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50') + '">' +
                '<div class="text-xs ' + (on ? 'text-primary font-semibold' : 'text-gray-500') + '">' +
                    esc(s.label) + (on ? ' · 当前口径' : '') + '</div>' +
                '<div class="text-lg font-bold ' + (on ? 'text-primary' : 'text-gray-800') + '">' +
                    esc(TB().fmtValue(s.primary.value, s.primary.kind)) + '</div>' +
                '<div class="text-xs text-gray-500">' + esc(s.primary.label) + '</div>' +
                (s.why ? '<div class="text-xs text-gray-500 mt-1">' + esc(s.why) + '</div>' : '') +
                '</button>';
        }).join('');
        return '<div class="mt-5">' +
                '<div class="text-sm font-medium text-gray-800 mb-2">' + esc(cmp.label || '测算口径对比') + '</div>' +
                '<div class="flex flex-col md:flex-row gap-2">' + cards + '</div>' +
                '<div class="overflow-x-auto mt-3">' +
                    '<table class="w-full text-sm">' +
                        '<thead><tr class="text-xs"><th class="px-2 py-2 text-left text-gray-500">对比项</th>' + heads + '</tr></thead>' +
                        '<tbody>' + compareRowHtml(cmp) + '</tbody>' +
                    '</table>' +
                '</div>' +
            '</div>';
    }

    // 导出要走另一套 markup（邮件正文 / Word 不吃 tailwind 类名），所以对比表也有一份简版
    function compareExportHtml(cmp) {
        var scenarios = cmp.scenarios || [];
        if (!scenarios.length) return '';
        var heads = scenarios.map(function (s) {
            return '<th style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;color:#4b5563">' + esc(s.label) + '</th>';
        }).join('');
        var rows = compareRowSet(cmp).map(function (row) {
            var tds = row.cells.map(function (cell) {
                return '<td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">' +
                    (cell ? esc(TB().fmtValue(cell.value, cell.kind || row.kind)) : '—') + '</td>';
            }).join('');
            return '<tr><td style="padding:6px 8px;border-bottom:1px solid #eee;color:#4b5563">' + esc(row.label) + '</td>' + tds + '</tr>';
        }).join('');
        return '<h3 style="margin:16px 0 8px;font-size:14px">' + esc(cmp.label || '测算口径对比') + '</h3>' +
            '<table style="width:100%;border-collapse:collapse;font-size:13px">' +
                '<thead><tr><th style="padding:6px 8px;border-bottom:1px solid #eee;text-align:left;color:#4b5563">对比项</th>' + heads + '</tr></thead>' +
                '<tbody>' + rows + '</tbody>' +
            '</table>';
    }

    // ====== 结果附加块（extras）======
    // 有些「完整测算」的答案不是「一个数 + 一排明细」，而是一张**表**：正向计税要按年摊开
    // 12 个月（累计预扣法下同年收入、不同发放节奏，每月到手并不一样），那才是它比速算器
    // 多出来的东西。这种东西塞不进 rows（一个 label 一个值），删掉它又是实打实的降级 ——
    // 所以渲染器加一块通用容器：spec 只出**数据**，怎么排版由渲染器负责，导出各有各的 markup。
    //
    // 契约：extras = [{ title, note?, table?: { head: [], rows: [[cell]] }, list?: [] }]
    //   cell 可以是 { value, kind }（走统一的格式化），也可以是 spec 自己拼好的字符串。
    function cellText(c) {
        if (c === null || c === undefined) return '—';
        if (typeof c === 'object') return TB().fmtValue(c.value, c.kind);
        return String(c);
    }

    // 行有两种写法：裸数组 [cell]，或 utils.js 那种带 spans（跨列标题）的行模型 { cells, spans }。
    // 后者先按 spans 摊平成同样长度的数组 —— 合并单元格在通用小表格里意义不大，
    // 而**列数不齐**会让数字串到隔壁列去，那才是一眼看不出来的错。
    function flattenRow(tr) {
        if (Array.isArray(tr)) return tr;
        var cells = [];
        (tr.cells || []).forEach(function (c, i) {
            cells.push(c);
            var span = Number((tr.spans || [])[i]) || 1;
            for (var k = 1; k < span; k++) cells.push('');
        });
        return cells;
    }

    function tableRowsHtml(t) {
        return (t.rows || []).map(function (tr) {
            var row = flattenRow(tr);
            var tds = row.map(function (c) {
                // 第一列按行首处理（通常是月份 / 类型），其余右对齐 —— 数字列不对齐就看不出趋势
                var align = (row.indexOf(c) === 0) ? 'text-left text-gray-600' : 'text-right';
                return '<td class="px-2 py-1.5 border-t border-gray-100 ' + align + '">' + esc(cellText(c)) + '</td>';
            }).join('');
            return '<tr>' + tds + '</tr>';
        }).join('');
    }

    function extrasHtml(list) {
        if (!list || !list.length) return '';
        return list.map(function (ex) {
            return '<div class="mt-5">' +
                '<div class="text-sm font-medium text-gray-800 mb-2">' + esc(ex.title) + '</div>' +
                (ex.table ? '<div class="overflow-x-auto"><table class="w-full text-sm">' +
                    '<thead><tr class="text-xs">' +
                    (ex.table.head || []).map(function (h, i) {
                        return '<th class="px-2 py-1.5 ' + (i === 0 ? 'text-left' : 'text-right') +
                            ' text-gray-500 font-normal">' + esc(h) + '</th>';
                    }).join('') +
                    '</tr></thead><tbody>' + tableRowsHtml(ex.table) + '</tbody></table></div>' : '') +
                (ex.list ? '<ul class="text-sm text-gray-600 space-y-1 list-disc pl-5">' +
                    ex.list.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' : '') +
                (ex.note ? '<p class="text-xs text-gray-500 mt-2">' + esc(ex.note) + '</p>' : '') +
                '</div>';
        }).join('');
    }

    // 导出版：邮件正文 / Word 不吃 tailwind 类名，同一份数据在用 inline style 再排一遍
    function extrasExportHtml(list) {
        if (!list || !list.length) return '';
        return list.map(function (ex) {
            var blocks = '';
            if (ex.table) {
                var head = (ex.table.head || []).map(function (h, i) {
                    return '<th style="padding:6px 8px;border-bottom:1px solid #eee;color:#4b5563;' +
                        (i === 0 ? 'text-align:left' : 'text-align:right') + ';font-weight:500">' + esc(h) + '</th>';
                }).join('');
                var body = (ex.table.rows || []).map(function (tr) {
                    return '<tr>' + flattenRow(tr).map(function (c, i) {
                        return '<td style="padding:6px 8px;border-bottom:1px solid #eee;' +
                            (i === 0 ? 'color:#4b5563;text-align:left' : 'text-align:right') + '">' +
                            esc(cellText(c)) + '</td>';
                    }).join('') + '</tr>';
                }).join('');
                blocks += '<table style="width:100%;border-collapse:collapse;font-size:13px">' +
                    '<thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table>';
            }
            if (ex.list) {
                blocks += '<ul style="margin:8px 0;padding-left:18px;font-size:13px;color:#4b5563">' +
                    ex.list.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>';
            }
            if (ex.note) {
                blocks += '<p style="margin:6px 0;font-size:12px;color:#6b7280">' + esc(ex.note) + '</p>';
            }
            return '<h3 style="margin:16px 0 8px;font-size:14px">' + esc(ex.title) + '</h3>' + blocks;
        }).join('');
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
            // 附加块（如逐月预算表）跟着一起走：它是「完整测算」比速算器多出来的那部分，
            // 导出里没有它，报告就退化成速算器的水平
            extrasExportHtml(out.extras) +
            // 多口径测算必须连对比表一起导出：只看一个数就签字，正是这类工具最容易踩的坑
            (out.compare ? compareExportHtml(out.compare) : '') +
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
        // 有 compare 时按当前口径取一份视图：保存 / 导出必须跟着界面上这份走
        var view = viewOut(out);
        state.lastResult = view;     // 保存 / 导出按钮要用，避免再算一遍（口径也不会走岔）

        // 17B-1：spec 驱动的向导是**通用渲染器** —— 结果节点的 id 不按工具区分（dw-result-card
        // 会被所有 spec 工具复用）。所以这次把「结果属于谁」写进 data-tool-id、把「每一行是什么」
        // 写进 data-dw-row：留资归因 / 分享卡 / 埋点都靠这两个锚点认人，避免把增值税的测算
        // 归成因经营所得算过 —— 那是会写进线索表的数据质量问题。
        var rows = (view.rows || []).map(function (r) {
            return '<div class="flex items-center justify-between py-2 border-b border-gray-100" data-dw-row="' + esc(r.label) + '">' +
                '<span class="text-sm text-gray-600">' + esc(r.label) +
                (r.hint ? '<i class="fa fa-question-circle ml-1 text-gray-500" title="' + esc(r.hint) + '"></i>' : '') +
                '</span>' +
                '<span class="font-medium">' + esc(TB().fmtValue(r.value, r.kind)) + '</span></div>';
        }).join('');

        // 推导链（台账 C）：与速算器**同一套约定** —— compute 返回 steps，渲染走 utils.js 的
        // renderFormulaStepsHtml。不写第二套：20 个速算器与存量 4 页都在用那一份，写第二份必然漂移。
        // 它是 17B 迁移的硬前置：存量 4 页都有「查看计算过程」，spec 向导没有就等于迁移即降级。
        var stepsHtml = '';
        if (view.steps && view.steps.length) {
            if (typeof renderFormulaStepsHtml === 'function') {
                // 完整视图：推导链默认展开（简明视图保持折叠 —— 先给结论，想核对再展开）
                stepsHtml = '<details id="dw-formula-panel" class="mt-4"' + (isFullMode() ? ' open' : '') + '>' +
                    '<summary class="flex items-center justify-between cursor-pointer select-none px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm font-medium text-gray-800">' +
                    '<span><i class="fa fa-calculator mr-2"></i>查看计算过程</span>' +
                    '<span class="text-xs text-gray-500">每一步都可核对</span>' +
                    '</summary>' +
                    '<div class="mt-3">' + renderFormulaStepsHtml(view.steps) + '</div>' +
                    '</details>';
            } else {
                // 不静默吞掉（前车之鉴：auth-ui.js 死选择器靠 ?. 抹错而多年未发现）
                console.warn('[deep-wizard] renderFormulaStepsHtml 未加载（utils.js），推导链面板被跳过');
            }
        }

        return '<div class="card" id="dw-result-card" data-tool-id="' + esc(state.toolId) + '">' +
                // 阶段18-3：主结果的**含义**（如「应纳个人所得税」）此前只能靠第一个 .text-sm 去猜，
                // 分享图取数时没有锚点可用。给它一个 id，通用取数就能照抄真实口径，而不是写死文案。
                '<div class="text-sm text-gray-600" id="dw-result-primary-label">' + esc(view.primary.label) + '</div>' +
                '<div class="text-3xl font-bold text-primary my-2" id="dw-result-primary">' + esc(TB().fmtValue(view.primary.value, view.primary.kind)) + '</div>' +
                (view.compare ? compareHtml(view.compare) : '') +
                '<div class="mt-4">' + rows + '</div>' +
                (view.note ? '<p class="text-sm text-gray-600 mt-4">' + esc(view.note) + '</p>' : '') +
                stepsHtml +
                extrasHtml(view.extras) +
                // 免责声明：与存量 4 页同一句话、同样就地展示（不藏在页脚）
                '<p class="result-disclaimer">' + DISCLAIMER + '</p>' +
                '<div class="mt-6">' +
                    // bg-green-600 上的白字只有 3.30:1，不达 AA；green-700 为 5.02:1。
                // hover 同步降一档（700 → 800），保持「按下更深」的观感不变。
                '<button id="dw-save" class="btn bg-green-700 text-white hover:bg-green-800 w-full mb-3">' +
                    '<i class="fa fa-save mr-2"></i>保存计算结果</button>' +
                    '<button id="dw-export-pdf" class="btn btn-secondary w-full mb-3">' +
                    '<i class="fa fa-download mr-2"></i>导出PDF报告</button>' +
                    '<button id="dw-export-word" class="btn bg-purple-600 text-white hover:bg-purple-700 w-full">' +
                    '<i class="fa fa-file-word-o mr-2"></i>导出Word报告</button>' +
                '</div>' +
                // 方案对比卡的宿主位（v1.51.0）：只有声明了 toCalcInput 的工具才有。
                // 页面式时代这张卡长在综合所得页面的结果区，删页后宿主与数据源一起没了 ——
                // 现在由渲染器按 spec 有没有取数钩子决定挂不挂，index.html 不必再为它留一块静态 HTML。
                (typeof tool.toCalcInput === 'function' ? '<div id="dw-scenario-host" class="mt-6"></div>' : '') +
                // 阶段19-5b：税务档案引导卡的宿主位。与速算器共用同一份渲染（toolbox-ui），
                // 不在这里抄第二份 —— 两处各长一套的话，「暂不」只在一处生效这种错迟早出现。
                '<div id="dw-profile-nudge" class="mt-6 hidden"></div>' +
                '<div class="mt-6"><button id="dw-prev" class="btn bg-gray-200 text-gray-700 hover:bg-gray-300">' +
                '<i class="fa fa-arrow-left mr-2"></i>返回上一步</button></div>' +
            '</div>';
    }

    // ====== repeater：可增删的条目列表（17B-4：为分类所得的动态所得条目加的）======
    //
    // 为什么非它不可：一次测算里**条数不定**的输入没法用扁平字段表达 ——
    // 「一笔利息 + 两套房租」写成三组固定字段，缺一组不够用、多一组又用不上。
    // 这也是四次迁移里 classification 排在最后的原因：前面那套 steps / when / compare / extras / derive
    // 谁都表达不了「N 条、每条还各自有条件字段」。
    //
    // 契约（写在 spec 里）：
    //   { key, type: 'repeater', itemFields: [ …常规字段 ], addLabel?, default?: [ { … } ] }
    // 值：state.values[key] = [ { <itemFields 的 key>: value } ]
    //
    // 实现上刻意**不新写一套类型转换**：每个条目的输入控件 id 沿用 `qf-<字段名>-<下标>-<子键>`，
    // 于是渲染继续走 fieldHtml、取值继续走 readValues、显隐继续走 visibleFields ——
    // 为了支持 repeater 再抄一份「空串归 0 / select 还原数字」，等于埋一个必将漂移的坑。
    function repItemFields(f) { return f.itemFields || []; }
    function repKey(fkey, index, key) { return fkey + '-' + index + '-' + key; }

    function repBlank(f) {
        var blank = {};
        repItemFields(f).forEach(function (it) { blank[it.key] = it.default; });
        return blank;
    }

    // state 里没有就拿 spec 的 default，连 default 都没有就给一条空条目 ——
    // 空着让用户找「添加」按钮，不如直接有一条可以开始填。
    function repList(f) {
        var list = state.values[f.key];
        if (Array.isArray(list) && list.length) return list;
        if (Array.isArray(f.default) && f.default.length) return f.default;
        return [repBlank(f)];
    }

    function repRowHtml(f, index, item) {
        var vals = {};
        repItemFields(f).forEach(function (it) { vals[it.key] = item[it.key]; });
        var inputs = TB().visibleFields({ fields: repItemFields(f) }, vals).map(function (it) {
            // 渲染即时回填：default 位置塞当前值（而不是 spec 的默认），否则「上一步 → 下一步」会丢
            return TB().fieldHtml({
                key: repKey(f.key, index, it.key), label: it.label, type: it.type, hint: it.hint,
                options: it.options, min: it.min, max: it.max, default: item[it.key]
            });
        }).join('');
        return '<div class="border border-gray-200 rounded-lg p-3 mb-3" data-dw-rep-of="' + esc(f.key) +
                '" data-dw-rep-index="' + index + '">' +
            '<div class="flex items-center justify-between mb-2">' +
                '<span class="text-sm font-medium text-gray-800">第 ' + (index + 1) + ' 条</span>' +
                '<button type="button" class="text-xs text-red-600 hover:text-red-700" data-dw-rep-remove="' + index + '">' +
                    '<i class="fa fa-trash mr-1"></i>删除' +
                '</button>' +
            '</div>' + inputs + '</div>';
    }

    function repeaterHtml(f) {
        return '<div class="tool-field" data-dw-repeater="' + esc(f.key) + '">' +
            '<label class="tool-label">' + esc(f.label) + '</label>' +
            repList(f).map(function (item, i) { return repRowHtml(f, i, item); }).join('') +
            '<button type="button" class="btn bg-gray-100 text-gray-700 hover:bg-gray-200 text-sm"' +
                ' id="dw-rep-add-' + esc(f.key) + '">' +
                '<i class="fa fa-plus mr-2"></i>' + esc(f.addLabel || '添加一条') +
            '</button>' +
            (f.hint ? '<div class="tool-field-hint">' + esc(f.hint) + '</div>' : '') +
            '</div>';
    }

    // 把整份列表从 DOM 读回：行序与 repList 一致（渲染就是按它画的），每条复用 readValues
    function repCollect(f) {
        return repList(f).map(function (_, i) {
            var prefixed = repItemFields(f).map(function (it) {
                var clone = { key: repKey(f.key, i, it.key), label: it.label, type: it.type,
                    options: it.options, min: it.min, max: it.max, default: it.default };
                return clone;
            });
            var read = TB().readValues({ fields: prefixed });
            var out = {};
            repItemFields(f).forEach(function (it) { out[it.key] = read[repKey(f.key, i, it.key)]; });
            return out;
        });
    }

    function bindRepeater(tool, f) {
        var host = document.getElementById(PAGE_ID);
        if (!host) return;

        var addBtn = document.getElementById('dw-rep-add-' + f.key);
        if (addBtn) {
            addBtn.addEventListener('click', function () {
                // 先把屏幕上正在填的那几条收干净，再往下加一条空的 —— 否则用户填了一半点「添加」
                // 会发现刚才的字没了（它是被 repBlank 那条覆盖的）
                state.values[f.key] = repCollect(f).concat([repBlank(f)]);
                render();
            });
        }

        Array.prototype.forEach.call(host.querySelectorAll('[data-dw-rep-of="' + f.key + '"]'), function (row) {
            var rm = row.querySelector('[data-dw-rep-remove]');
            if (rm) {
                rm.addEventListener('click', function () {
                    var list = repCollect(f);
                    list.splice(Number(rm.getAttribute('data-dw-rep-remove')) || 0, 1);
                    // 删空留一条：条目列表没了会让「添加」按钮也变得没着落
                    state.values[f.key] = list.length ? list : [repBlank(f)];
                    render();
                });
            }
            // 条目内的 select（多为「所得类型」）决定这一条要不要露出该类型专属的扣除字段 —— 得即时重画；
            // 数字框只收值：一边敲一边重绘会抢光标（根源与 applyValues 的 skipEl 是同一个）
            Array.prototype.forEach.call(row.querySelectorAll('select, input'), function (el) {
                el.addEventListener('input', function () {
                    state.values[f.key] = repCollect(f);
                    applyDerived(tool);
                });
                el.addEventListener('change', function () {
                    state.values[f.key] = repCollect(f);
                    applyDerived(tool);
                    render();
                });
            });
        });
    }

    function drawField(f) {
        return f.type === 'repeater' ? repeaterHtml(f) : TB().fieldHtml(f);
    }

    // 步内 advanced 字段一样只折叠、不隐藏：与速算器共用同一个块和同一份措辞（不写第二套）
    function advancedBlock(fields) {
        if (!fields.length) return '';
        var tb = TB();
        if (tb && typeof tb.advancedBlockHtml === 'function') {
            return tb.advancedBlockHtml(fields, state.values, drawField);
        }
        return '<details class="tool-advanced-block mt-3"' + (isFullMode() ? ' open' : '') + '>' +
            '<summary class="flex items-center justify-between cursor-pointer select-none px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm font-medium text-gray-700">' +
            '<span><i class="fa fa-sliders mr-2"></i>更多参数（可选）</span></summary>' +
            '<div class="mt-3">' + fields.map(drawField).join('') + '</div></details>';
    }

    function inputHtml(tool, step) {
        var fs = visibleIn(tool, fieldsOfStep(tool, step.key), state.values);
        var adv = fs.filter(isAdvanced);
        var basic = fs.filter(function (f) { return !isAdvanced(f); });
        var inputs = basic.map(drawField).join('') + advancedBlock(adv);
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
        // 采纳联动结果再渲染：这里**只能算不能收**（collect 会按「当前步」整表读 DOM，
        // 而此刻 DOM 还是上一步的样子，会在渲染前把当前步的值冲回默认）。
        applyDerived(tool);
        host.innerHTML = headerHtml(tool, steps) + paneHtml(tool, steps);
        bind(tool, steps);
        mountScenarioCard(tool);
        mountProfileNudge(tool);
        // fieldHtml 写的是字段的 default（它是速算器与向导共用、只认 schema）。
        // 分步向导每次只渲染当前步，若不回填，用户「上一步 → 下一步」就会被打回默认值 ——
        // 这类丢值肉眼很难发现（值还在内存里、只是没显示出来），所以在这里统一回填。
        applyValues(state.values);
        renderWarnings(tool);
        // 简明 ↔ 完整会改变步数：记下「此刻是否停在结果步」，切换后好把用户放回结果步
        state.atResult = !!(steps[state.stepIndex] && steps[state.stepIndex].result);
    }

    // 方案对比卡（v1.51.0）：spec 声明了 toCalcInput 才挂，取数与 compute 同源。
    // 不在渲染器里另写一份「向导值 → 计税入参」的映射 —— 那份映射一旦有两份，
    // 「保存的方案」与「界面上算的数」迟早对不上。
    function mountScenarioCard(tool) {
        var host = document.getElementById('dw-scenario-host');
        if (!host) return;                       // 非结果步，或该工具没有这张卡
        var ui = window.EuriskoScenarioUI;
        if (!ui || typeof ui.mount !== 'function' || !window.EuriskoScenarios) return;
        var ctx = null;
        try { ctx = tool.toCalcInput(state.values); } catch (e) { ctx = null; }
        if (!ctx || !ctx.results) return;
        ui.mount(host, ctx);
    }

    // 阶段19-5b：档案引导卡宿主由渲染器建，内容交给 toolbox-ui 那份实现填（口径只有一处）。
    // 「暂不」是落盘的（taxProfile.nudgeDismissed），所以两处都关掉一次就都闭嘴。
    function mountProfileNudge(tool) {
        var host = document.getElementById('dw-profile-nudge');
        var tb = window.EuriskoToolbox;
        if (!host || !tb || typeof tb.mountProfileNudge !== 'function') return;
        tb.mountProfileNudge('dw-profile-nudge', tool, state.values);
    }

    // skipEl：正在输入的那个控件不回写 —— 否则用户敲到一半，光标会被自己刚触发的联动重置
    function applyValues(values, skipEl) {
        Object.keys(values || {}).forEach(function (k) {
            var el = document.getElementById('qf-' + k);
            if (!el || el === skipEl) return;
            if (el.type === 'checkbox') el.checked = !!values[k];
            else el.value = values[k];
        });
    }

    // 只把**当前步**的字段写回 state.values：分步渲染时其他步的字段不在 DOM 里，
    // 若按整表覆盖，readValues 会把缺失项填回 default —— 切一次步骤，前面填的值全丢。
    // stepKey 可选：切换视图时由调用方指定「屏幕上刚才显示的是哪一步」（此时模式已变，
    // 光看 state.stepIndex 会指向新步骤表里的另一步，收值就收错了）
    function collect(tool, stepKey) {
        var dom = TB().readValues(tool);
        // 注意：stepKey 可能是**切换前**那一步 —— 它在新的步骤表里已经不存在了（被合并进
        // 「补充参数」），所以不能拿 stepKey 去 stepsOf() 里找（找不到就会静默不收值 = 丢数据）。
        // fieldsOfStep 是按 spec 归组的，与当前视图无关，这里直接用它。
        var step = stepKey ? { key: stepKey } : stepsOf(tool)[state.stepIndex];
        if (!step) return;
        fieldsOfStep(tool, step.key).forEach(function (f) {
            // repeater 不在 readValues 的管辖范围内（它的控件 id 带下标），走自己的收值
            if (f.type === 'repeater') { state.values[f.key] = repCollect(f); return; }
            state.values[f.key] = dom[f.key];
        });
        // 统一入口：任何一次收值都跑一次联动，避免某条路径忘了跑（切步 / 返回 / 条件字段变更）
        applyDerived(tool);
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

    // ====== 字段联动（derive）与行内提示（warnings）======
    // 迁移到 spec 之后，页面里那些写在 page 私有逻辑里的便利能力必须有个去处 ——
    // 「社保缴费基数 × 缴费比例 → 每月扣缴额」就是典型：用户手里有的是基数，不是月缴额，
    // 这类联动要是每个迁移都丢一次，17B 后面三个页面的迁移会一路丢下去。
    // 交给渲染器承担，spec 只声明规则：derive(values) 回写派生值，warnings(values) 给字段提示。
    function applyDerived(tool) {
        if (typeof tool.derive !== 'function') return false;
        var patched;
        try { patched = tool.derive(state.values) || {}; }
        catch (e) { return false; }
        var changed = false;
        Object.keys(patched).forEach(function (k) {
            if (state.values[k] === patched[k]) return;
            state.values[k] = patched[k];
            changed = true;
        });
        return changed;
    }

    function renderWarnings(tool) {
        if (typeof tool.warnings !== 'function') return;
        var host = document.getElementById(PAGE_ID);
        if (!host) return;
        // 先清所有旧提示：只按本次 map 逐个贴的话，条件不再成立的提示会一直挂着
        Array.prototype.forEach.call(host.querySelectorAll('.dw-field-warning'), function (n) { n.remove(); });
        var map;
        try { map = tool.warnings(state.values) || {}; }
        catch (e) { return; }
        Object.keys(map).forEach(function (k) {
            if (!map[k]) return;
            var el = document.getElementById('qf-' + k);
            var field = el && el.closest ? el.closest('.tool-field') : null;
            if (!field) return;
            var node = document.createElement('div');
            node.className = 'dw-field-warning text-xs text-red-600 mt-1';
            node.textContent = map[k];
            field.appendChild(node);
        });
    }

    // 联动源字段要「按键即时」反应 —— 页面版把这些写在各自 page 的 input 事件里。
    // 只对 spec 声明过的来源字段（deriveFrom）接线：用户在别处敲字时不该把他手动改过的
    // 派生值又冲一遍（页面版也是只认基数 / 比例两个输入框的 change）。
    function bindDerivedSources(tool, step) {
        if (typeof tool.derive !== 'function' || !step || step.result) return;
        (tool.deriveFrom || []).forEach(function (k) {
            var el = document.getElementById('qf-' + k);
            if (!el) return;
            var meta = (tool.fields || []).filter(function (f) { return f.key === k; })[0];
            // 注意别在这里再判 changed：derive 已经挂在 collect 里跑过了，第二次调用必然返回 false，
            // 一判就把「派生值回写到界面」这一步跳过了（DOM 不更新，只有内存变了）
            el.addEventListener('input', function () {
                collect(tool);
                applyValues(state.values, el);      // 跳过正在输入的框，别抢光标
                renderWarnings(tool);
            });
            el.addEventListener('change', function () {
                // 数字框失焦（页面版 normalizeRateInput 也是这个时机）：比例框留空 / 越界，
                // 先把它归一到**这个险种自己的默认比例**再收值。否则 readValues 会把空串读成 0，
                // derive 就按 0% 算 —— 用户留了个空框，看到的却是 0 元，会被当成算错了。
                if (meta && meta.type === 'percent' && !isRateOk(el.value)) el.value = meta.default;
                collect(tool);
                applyValues(state.values);
                renderWarnings(tool);
            });
        });
    }

    // 0 与 100 之间的有限数才算合法比例 —— 空串、负数、>100 都要回落
    function isRateOk(raw) {
        var n = parseFloat(raw);
        return String(raw).trim() !== '' && isFinite(n) && n >= 0 && n <= 100;
    }

    function bind(tool, steps) {
        var back = document.getElementById('dw-back');
        if (back) back.addEventListener('click', function () {
            collect(tool);      // 退出前收值：下次进来才是完整草稿，而不是半截
            saveDraft();
            showPageFn('tools-page');
        });

        // 阶段19-7：视图密度 pill —— 切换后就地重画。先收值再切：
        // 当前步填的东西此刻只在 DOM 里，不收就会在重画时被 default 盖掉。
        var pill = document.getElementById('dw-mode-pill');
        if (pill) {
            var tb = TB();
            if (tb && typeof tb.modePillHtml === 'function') {
                pill.innerHTML = tb.modePillHtml();
                pill.querySelectorAll('.mode-pill-seg').forEach(function (btn) {
                    btn.addEventListener('click', function () {
                        var p = modeLib();
                        if (!p) return;
                        collect(tool);
                        p.set(btn.getAttribute('data-mode') === p.FULL ? p.FULL : p.SIMPLE);
                    });
                });
            }
        }

        var reset = document.getElementById('dw-reset');
        if (reset) reset.addEventListener('click', function () {
            state.values = defaultsOf(tool);
            state.stepIndex = 0;
            state.compareKey = null;
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

        // 切换对比口径：只改 state.compareKey 重画结果步 —— 输入值不动（不算收值，DOM 里没有那些框）
        var hostNode = document.getElementById(PAGE_ID);
        if (hostNode) {
            Array.prototype.forEach.call(hostNode.querySelectorAll('[id^="dw-cmp-"]'), function (btn) {
                btn.addEventListener('click', function () {
                    state.compareKey = btn.getAttribute('data-dw-compare');
                    render();
                });
            });
        }

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
                if (f.type === 'repeater') { bindRepeater(tool, f); return; }
                if (!f.when) return;
                var el = document.getElementById('qf-' + f.when.key);
                if (!el) return;
                el.addEventListener('change', function () { collect(tool); render(); });
            });
        }
        bindDerivedSources(tool, step);
    }

    function open(toolId, opts) {
        var tool = R() && R().get(toolId);
        if (!has(tool)) return false;
        opts = opts || {};
        state.toolId = toolId;
        state.values = defaultsOf(tool);
        state.stepIndex = 0;
        state.compareKey = null;   // 换工具就是换测算，不该沿用上一次挑的口径
        if (opts.values) {
            // 阶段18-2（v1.72.0）：从历史记录「查看」进来 —— 带进来的是**那一条记录**的输入，
            // 不是草稿。此前只能打开向导、由草稿决定显示什么，于是「点一条老记录看到的是
            // 最近一次算的东西」—— 只有一份输入时两者恰好一样，所以一直没被发现。
            // 传了 values 就直接落到结果步：点历史记录是想看结果，不是想重新填一遍。
            state.values = {};
            Object.keys(defaultsOf(tool)).forEach(function (k) { state.values[k] = defaultsOf(tool)[k]; });
            Object.keys(opts.values).forEach(function (k) { state.values[k] = opts.values[k]; });
            state.stepIndex = Math.max(0, stepsOf(tool).length - 1);
        } else if (!opts.fresh) {
            // 断点续算：有没填完的草稿就接着填，不让用户从头再来
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

    // 阶段19-7：偏好一变就地重画（向导没开时 state.toolId 为空，直接跳过）
    if (modeLib() && typeof modeLib().onChange === 'function') {
        modeLib().onChange(function (mode, prev) {
            if (!state.toolId) return;
            var tool = R() && R().get(state.toolId);
            if (!tool) return;
            // 先收值再重画：当前步填的东西此刻只在 DOM 里，不收就会被 default 盖掉（切换 = 丢数据）。
            // 用 prev 那份步骤表定位「刚才显示的是哪一步」—— 模式已经切了，stepIndex 已指向别处。
            var prevSteps = stepsOfWith(tool, prev === modeLib().FULL);
            var prevStep = prevSteps[Math.min(state.stepIndex, prevSteps.length - 1)];
            if (prevStep && !prevStep.result) collect(tool, prevStep.key);
            // 简明 → 完整会凭空多出几步：原本在看结果的，切换后仍应看结果，而不是被挤回中间某步
            if (state.atResult) state.stepIndex = stepsOf(tool).length - 1;
            render();
        });
    }

    window.EuriskoDeepWizard = {
        open: open,
        has: has,
        // 暴露给单测：断言「结果步自动追加」「字段按 step 归组」这类肉眼难守的约束
        stepsOf: stepsOf,
        fieldsOfStep: fieldsOfStep,
        // 暴露给单测：断言「切换视图不丢值」这类肉眼极难发现的回归
        values: function () { return state.values; }
    };
})();
