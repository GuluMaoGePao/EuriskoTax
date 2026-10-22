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
    // C-02 / A 型：取自文案单一真源（copy-standard.js），与 index.html 结果区逐字一致（守护断言 2）。
    var DISCLAIMER = ((typeof window !== 'undefined' && window.CopyStandard && window.CopyStandard.DISCLAIMER)
        ? window.CopyStandard.DISCLAIMER.result
        : '') || '测算结果依据您填写的数据与现行政策估算，仅供参考，不构成税务建议；正式申报请以主管税务机关核定为准。';

    // touched：用户亲手改过的派生值键（详见 applyDerived）
    var state = { toolId: null, stepIndex: 0, values: {}, lastResult: null, compareKey: null, touched: {} };

    function R() { return window.EuriskoToolRegistry; }
    function TB() { return window.EuriskoToolbox; }

    // 阶段19-12（B3 + B4）：政策时效徽标 + 政策版本。
    // 21 个完整测算此前**一枚都没有**（速算器有）—— 而按年填全的这些恰恰是财务 / 代账的主力入口，
    // 他们最怕的就是「政策过期没」。这份 HTML 由 toolbox 出、deep 只管用，与速算器页面上那枚
    // 是同一个函数：两份措辞分家只是时间问题，不给自己这个机会。
    // 它是**可信标记**不是参数，所以简明视图下照样显示 —— 藏起来等于让用户不知道
    // 这次算里有没有已经过期的政策。
    function policyStampHtml() {
        var tb = TB();
        if (!tb) return '';
        var spec = R() ? R().get(state.toolId) : null;
        var html = '';
        if (typeof tb.policyBadgeOf === 'function') html += tb.policyBadgeOf(spec && spec.policyKey);
        if (typeof tb.policyVersionHtml === 'function') html += tb.policyVersionHtml();
        return html;
    }

    function esc(s) {
        return String(s === undefined || s === null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // 转义 + **加粗**：加粗渲染只有页面那一份实现（Toolbox.escRich），这里借过来。
    // compute 回的 note 里带加粗（如「按**全部不含税销售额**判断」），直接输出就是一对裸星号。
    function richEsc(s) {
        var tb = window.EuriskoToolbox;
        if (tb && typeof tb.escRich === 'function') return tb.escRich(s);
        return esc(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    }

    function showPageFn(pageId) {
        if (typeof window.showPage === 'function') window.showPage(pageId);
    }

    // 只接管 spec 驱动的工具：deep 且没有独立页面。
    function has(tool) {
        return !!tool && tool.status === 'deep' && !tool.pageId;
    }

    // ====== 进阶参数：步内折叠 ======
    // 只管**字段**（level:'advanced' 的字段收进「更多参数（可选）」），不再管步骤 ——
    // v1.142.0 之前它还会把 advanced 的整步甩到末尾，那是简明视图时代的规矩；
    // 现在步骤表就是 spec 声明的那一张（详见 stepsOf 那条注释）。
    function isAdvanced(x) { return !!x && x.level === 'advanced'; }

    function stepKeyOfField(tool, f) {
        var first = (tool.steps && tool.steps[0] && tool.steps[0].key) || 'main';
        return f.step || first;
    }

    // v1.142.0（第二轮）：**渲染器不再重排步骤**，spec 里怎么声明就怎么排。
    //
    // 「把 advanced 甩到最后」是简明视图时代的遗迹：换一档录取密度就换一套步骤条，
    // 用户在两屏之间认不出自己填到哪。而 1.17 那四个页面从头到尾只有一个顺序 ——
    // 基本参数 → 收入明细 → 扣除项明细 → 计算结果，那正是"先定口径、再录数、后扣除"的讲解顺序。
    // 参数一眼看不是"少填的那一档"，它是开工前要先定下的口径（工作几个月、去年预缴了多少），
    // 放在最前面才答得出来；等收入都录完了再回头问"总共工作几个月"就已经晚了 ——
    // 工作月数变了，前面录的那些数全要重算一遍。
    function stepsOf(tool) {
        var list = (tool.steps || [{ key: 'main', title: '填写数据', why: '' }]).slice();
        // 结果步由渲染器统一追加 —— 每个完整测算都有，不该在每个 spec 里重复声明
        return list.concat([{ key: '__result', title: '计算结果', result: true }]);
    }

    function fieldsOfStep(tool, stepKey) {
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

    // ====== 实时预览条（v1.142.0 补回来的东西）======
    // 这套向导一度**没有**它：填到第 4 步才知道自己在算多少钱。而 1.17 时代那 4 个整页顶上挂着
    // calc-preview-bar（收入 / 扣除 / 税），边填边变 —— 「计算流程看得见」就是靠它。
    // 这里用通用做法重做：**金额行由渲染器自己挑**，不要求第 22 个 spec 再声明一遍取哪几项。
    //   主指标（primary）排最后（它是这一屏的结论），前面最多补两项原料口径。
    // 挑不到就少显示一项 —— 半个数 deny 用户去核对，不如不显示。
    function previewPicks(tool) {
        var out = null;
        try {
            out = tool.compute(state.values);
        } catch (e) {
            return [];                      // 填到一半就抛错是常态：那就是"还没算出来"
        }
        if (!out) return [];
        var rows = out.rows || [];
        var moneyRows = rows.filter(function (r) {
            return r && (r.kind === 'currency' || r.kind === 'money') && isFinite(Number(r.value));
        });
        function pick(re, exclude) {
            for (var i = 0; i < moneyRows.length; i++) {
                var r = moneyRows[i];
                if (!re.test(r.label)) continue;
                if (exclude && exclude.test(r.label)) continue;
                return r;
            }
            return null;
        }
        var lead = [];
        // 「收入」与「扣除」是全套税的通用原料口径；应纳税所得额看着像收入，实则是半成品，排掉
        var income = pick(/收入/, /应纳税所得|不含税销售额/) || pick(/销售额/);
        var deduction = pick(/扣除/);
        if (income) lead.push(income);
        if (deduction && (!income || deduction.label !== income.label)) lead.push(deduction);

        var main = null;
        if (out.primary && isFinite(Number(out.primary.value))) main = out.primary;
        else main = pick(/税额|应纳|应纳税/) || moneyRows[moneyRows.length - 1] || null;
        if (!main) return [];               // 一个数都还没出来时不占这一行
        return lead.concat([main]).slice(0, 3);
    }

    // 金额格式化：页面上的金额差一位小数就是一份对不上的账，这里不自带实现，
    // 一律引用速算器那一侧的通用入口 TB().fmtValue。
    function fmt(value, kind) { return TB().fmtValue(value, kind); }

    // 预览条复用既有的 .calc-preview-bar（1.17 那 4 个整页用的就是这一条，它是**吸底**的），
    // 而 `.has-preview-bar .step-content { pb-20 }` 早就给它留好了位置 —— 不另造一套样式。
    // 三档语义色沿用既有令牌（income 蓝 / deduction 橙 / tax 红），因为这三个数就是这样排的。
    function pickClass(i, n, r) {
        // 主指标永远是最后一个：它就是这一屏要回答的那个数
        if (i === n - 1) return 'calc-preview-value calc-preview-tax';
        return r.label.indexOf('扣除') !== -1
            ? 'calc-preview-value calc-preview-deduction'
            : 'calc-preview-value calc-preview-income';
    }

    function previewGridHtml(tool) {
        var picks = previewPicks(tool);
        if (!picks.length) return '';
        var cols = 'grid-template-columns: repeat(' + picks.length + ', minmax(0, 1fr));';
        return '<div class="calc-preview-grid" style="' + cols + '">' +
            picks.map(function (r, i) {
                return '<div class="calc-preview-item">' +
                    '<div class="calc-preview-label">' + esc(r.label) + '</div>' +
                    '<div class="' + pickClass(i, picks.length, r) + '">' + esc(fmt(r.value, r.kind)) + '</div>' +
                    '</div>';
            }).join('') + '</div>';
    }

    function previewBarHtml(tool, steps) {
        // 结果步不显示：那一屏自己就是完整的数（老 CSS 里的 is-result-step 也是这个意思）
        if (steps[state.stepIndex] && steps[state.stepIndex].result) return '';
        return '<div id="dw-preview-bar" class="calc-preview-bar">' +
            '<div class="max-w-6xl mx-auto">' + previewGridHtml(tool) + '</div></div>';
    }

    // 输入过程中只刷新**这一条**（不整屏重画 —— 重画会把正在输入的光标甩掉）
    function refreshPreviewBar(tool) {
        var host = document.getElementById('dw-preview-bar');
        if (!host) return;             // 在结果步（没有这一条）时输入事件照旧来了：直接走人
        var grid = host.querySelector('.calc-preview-grid');
        var html = previewGridHtml(tool);
        if (!html) { host.classList.add('is-result-step'); return; }
        host.classList.remove('is-result-step');
        if (grid) grid.outerHTML = html;
        else host.querySelector('.max-w-6xl').innerHTML = html;
    }

    function headerHtml(tool, steps) {
        var ind = steps.map(function (s, i) {
            var on = i === state.stepIndex ? ' active' : '';
            // 步骤条本身可跳（data-dw-step）：完整测算动辄 4~5 屏，"回顾上一步改个数"不该
            // 只能一步步倒回去 —— 绑事件见 bindStepJump（整块 innerHTML 每次重画，委托到 #dw-body）
            return (i ? '<div class="step-line"></div>' : '') +
                '<div class="step dw-step-jump" data-dw-step="' + i + '" role="button" tabindex="0"' +
                ' title="' + esc(s.title) + '">' +
                '<div class="step-number' + on + '">' + (i + 1) + '</div>' +
                '<div class="step-title' + on + '">' + esc(s.title) + '</div></div>';
        }).join('');
        return '<div class="calc-sticky-header"><div class="max-w-6xl mx-auto">' +
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
            (out.note ? '<p style="margin-top:12px;font-size:12px;color:#6b7280">' + richEsc(out.note) + '</p>' : '') +
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

    // 标准版 PDF：原本就是这里自己的一串（contentBuilder + skipResultCheck），抽出来给
    // 版本弹窗的「标准版」用 —— 那是魔法般的第二轮调用，不能走 final-report 的 legacyPdf
    // （它读 meta.resultElId 且带结果校验，向导场景会被「请先进行计算」挡回来）。
    function standardPdf(title, html) {
        if (typeof exportToPDF !== 'function') {
            console.warn('[deep-wizard] exportToPDF 未加载，导出被跳过');
            return;
        }
        // skipResultCheck：导出函数默认校验存量 4 页的全局 results，spec 向导没有那些变量
        exportToPDF(null, title, { skipResultCheck: true, contentBuilder: function () { return html; } });
    }

    // YYYY-MM 后缀，与 final-report 的 proFilename 同一套补零规矩，只是前缀换成工具名
    function pdfStamp() {
        var d = new Date();
        var m = d.getMonth() + 1;
        return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m;
    }

    // 交付版报告的柱状图数据源。向导结果只有 rows/primary（label+value+kind），
    // 而那份报告原本读的是 window.calculationResults —— spec 向导永远没有这个全局量。
    // 挑法：**只要金额型**（percent / text 混进来会把税负率当金额画同一根轴），最多 6 项；
    // 凑不齐 2 项就返回 null —— 报告那边据此整段不画，而不是画一张全 0 的图。
    function structureFor(out) {
        var pick = [];
        if (out.primary && out.primary.kind === 'money' && Number(out.primary.value)) {
            pick.push(out.primary);
        }
        (out.rows || []).forEach(function (r) {
            if (pick.length >= 6) return;
            if (r.kind !== 'money') return;
            var n = Number(r.value);
            if (!isFinite(n) || n === 0) return;
            pick.push(r);
        });
        if (pick.length < 2) return null;
        return {
            labels: pick.map(function (r) { return String(r.label); }),
            values: pick.map(function (r) { return Number(r.value) || 0; }),
            note: '单位：元。按本次测算结果的关键金额项排序，用于横向比较各部分的量级。'
        };
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
            // 阶段20 P5（v1.107.0）：接回 final-report —— 精装版 PDF 是已收费权益
            // （business-plan 的 ProCode 权益表里的「汇算清缴 PDF 完整报告」），
            // 但阶段17 删旧页面时这条链路连同 UI 一起断开了，此后零调用：
            // Pro 用户拿到的是自拼 HTML 的标准版，承诺的封面/图表/政策要点一份都没给过。
            var rep = window.EuriskoReport;
            if (rep && typeof rep.exportFinalReport === 'function') {
                try {
                    rep.exportFinalReport({
                        kind: tool.id,
                        meta: {
                            resultElId: 'dw-result-card',
                            legacyTitle: title,
                            // 封面按工具名，21 个税种不再共用「综合所得汇算」这一个标题
                            reportTitle: function () { return tool.name + '交付版报告'; },
                            kindLabel: tool.name
                        },
                        // 文件名同样带工具名：默认那串「汇算清缴报告_YYYY-MM」会让
                        // 增值税 / 经营所得的报告在下载目录里长成一个名字，事后根本认不出
                        filename: tool.name + '交付版报告_' + pdfStamp() + '.pdf',
                        coreHtml: html,
                        structure: structureFor(out),
                        // 政策要点用这个税种**自己**的（spec.pitfalls）：含文号、口径、算错的后果。
                        // 修复前报告里那节是问答库的「综合所得/汇算清缴」条目 —— 增值税的报告里
                        // 写着子女教育专项附加扣除（真机截图实锤）。
                        policies: (tool.pitfalls || []).slice(0, 6),
                        onStandard: function () { standardPdf(title, html); }
                    });
                    return;
                } catch (e) {
                    console.warn('[deep-wizard] 交付版报告导出失败，回落标准 PDF', e);
                }
            }
            standardPdf(title, html);
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
        // v1.142.0 第四轮：① 每一行按语义着色（此前一律 `<span class="text-primary">`，
        // 二十多个数字一个颜色，眼睛没有任何落点 —— 用户原话「看起来会很疲惫」）；
        // ② 整体默认收起：结论先看一个主数字，要看分项再展开。
        // 语义只认三类字眼（税 / 扣除 / 其余），命中不到一律中性 —— 不猜剩下的半句。
        function toneOf(label) {
            var s = String(label || '');
            if (/税额|应纳|应补|应退|实缴|税负|已预缴/.test(s)) return 'tax';
            if (/扣除|减除|费用|免税/.test(s)) return 'deduct';
            if (/税后|到手|实发|净收入/.test(s)) return 'net';
            return 'plain';
        }
        // v1.142.0 第五轮：主数字下面补两个**关键数**（要交多少税 / 真正到手多少）。
        // 只有主数字时，用户看完「税后年收入 42 万」还得展开二十行才知道交了多少税 ——
        // 结论其实由三个数构成，全收起来等于把"结论"也给收了。
        // 只取两类各一项、取不到就少给：这是摘要不是明细，铺开就又变回一片数字。
        function keyFactsHtml() {
            var list = view.rows || [];
            function first(tone) {
                for (var i = 0; i < list.length; i++) {
                    if (toneOf(list[i].label) === tone) return list[i];
                }
                return null;
            }
            var picks = [first('tax'), first('net')].filter(Boolean);
            if (!picks.length) return '';
            return '<div class="dw-result-keyfacts">' + picks.map(function (r) {
                // 不挂 data-dw-row：那是**明细行**的取数锚点（分享图 / 留资归因按它认行），
                // 摘要再挂一个同名锚点，取数就会先撞上这一块 —— 两处值虽然相同，
                // 但"同一个行名有两个元素"迟早会把别人绕进去。
                return '<div class="dw-result-keyfact dw-result-row--' + toneOf(r.label) + '">' +
                    '<div class="dw-result-keyfact__label">' + richEsc(r.label) + '</div>' +
                    '<div class="dw-result-keyfact__value">' + esc(TB().fmtValue(r.value, r.kind)) + '</div>' +
                    '</div>';
            }).join('') + '</div>';
        }

        // 行说明与字段说明同一颗按钮（.tool-hint-btn，委托在 toolbox-ui 的 bindHintToggles）：
        // 此前它是 title 悬浮提示 —— 手机上没有 hover，等于这一行的解释根本不存在。
        // 面板挂在行的**后面**（不是行内）：行本身是 label 左 / 值右的 flex，塞进去会把值挤走。
        var rows = (view.rows || []).map(function (r, i) {
            var hid = 'dw-row-hint-' + i;
            var btn = r.hint
                ? '<button type="button" class="tool-hint-btn" data-hint-toggle="' + hid + '"'
                    + ' aria-expanded="false" aria-controls="' + hid + '"'
                    + ' aria-label="查看说明：' + esc(r.label) + '" title="查看说明">'
                    + '<i class="fa fa-question-circle" aria-hidden="true"></i></button>'
                : '';
            var panel = r.hint
                ? '<div class="dw-result-hint" id="' + hid + '" hidden>' + richEsc(r.hint) + '</div>'
                : '';
            return '<div class="dw-result-row dw-result-row--' + toneOf(r.label) + '" data-dw-row="' + esc(r.label) + '">' +
                '<span class="dw-result-row__label">' + richEsc(r.label) + btn + '</span>' +
                '<span class="dw-result-row__value">' + esc(TB().fmtValue(r.value, r.kind)) + '</span></div>' + panel;
        }).join('');

        // 阶段19-4 顺延（v1.99.0）：结果可视化 —— 各项数额条。与速算器共用 result-bars.js
        // 那一份（两边的结果对象都是 primary + rows 同一形状），不在这里另写一套条形。
        // 取的是 view（界面上正在显示的这份），与明细 / 保存同源，不会再算一遍。
        var barsBlock = '';
        if (window.EuriskoResultBars && typeof window.EuriskoResultBars.html === 'function') {
            // collapsed：结果页一进来不要铺一片条形 —— 主数字说完结论，要对照再展开
            barsBlock = window.EuriskoResultBars.html(view, { collapsed: true });
        } else {
            // 不静默吞掉（前车之鉴：auth-ui.js 死选择器靠 ?. 抹错而多年未发现）
            console.warn('[deep-wizard] EuriskoResultBars 未加载（result-bars.js），各项数额条被跳过');
        }

        // 推导链（台账 C）：与速算器**同一套约定** —— compute 返回 steps，渲染走 utils.js 的
        // renderFormulaStepsHtml。不写第二套：20 个速算器与存量 4 页都在用那一份，写第二份必然漂移。
        // 它是 17B 迁移的硬前置：存量 4 页都有「查看计算过程」，spec 向导没有就等于迁移即降级。
        var stepsHtml = '';
        if (view.steps && view.steps.length) {
            if (typeof renderFormulaStepsHtml === 'function') {
                // v1.142.0：推导链默认展开 —— 「每一步都可核对」是完整测算立身之本，
                // 收起来等于把"能核对"降级成"请相信我"。
                stepsHtml = '<details id="dw-formula-panel" class="mt-4" open>' +
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
                // 阶段19-12：政策时效 + 版本钉在结果卡最上面 —— 先知道这次算站不站得住，再看金额。
                '<div class="dw-policy-stamp mb-2" id="dw-policy-stamp">' + policyStampHtml() + '</div>' +
                // 阶段18-3：主结果的**含义**（如「应纳个人所得税」）此前只能靠第一个 .text-sm 去猜，
                // 分享图取数时没有锚点可用。给它一个 id，通用取数就能照抄真实口径，而不是写死文案。
                //
                // v1.142.0 第四轮：主数字独占一块 hero —— 此前它与下面那二十来行明细
                // 字号相同、颜色相同，用户一眼看不出「哪个才是答案」。
                '<div class="dw-result-hero" id="dw-result-hero">' +
                    '<div class="dw-result-hero__label" id="dw-result-primary-label">' + richEsc(view.primary.label) + '</div>' +
                    '<div class="dw-result-hero__value" id="dw-result-primary">' + esc(TB().fmtValue(view.primary.value, view.primary.kind)) + '</div>' +
                '</div>' +
                keyFactsHtml() +
                (view.compare ? compareHtml(view.compare) : '') +
                // 条形排在明细之前：先看各项的相对大小，再逐行核对 —— 两张图同一份 view
                barsBlock +
                // 明细默认收起（用户要求）：这一屏的任务是给结论，二十来行数字铺开只会把结论埋掉。
                // 它仍然可展开 —— 核对从来不是"藏起来"，是"先不给"。
                (rows ? '<details class="dw-detail-box mt-4">' +
                    '<summary class="dw-detail-box__summary">' +
                        '<span><i class="fa fa-list-ul mr-2"></i>计算明细（' + view.rows.length + ' 项）</span>' +
                        '<span class="dw-detail-box__hint">展开核对</span>' +
                    '</summary>' +
                    '<div class="dw-result-rows mt-2">' + rows + '</div>' +
                '</details>' : '') +
                (view.note ? '<p class="dw-result-note mt-4">' + richEsc(view.note) + '</p>' : '') +
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
                // 阶段19-8：报表之外还要有"带走一条数"的路 —— 保存到历史与导出是整份，
                // 而多数时候用户只是想把结果贴进自己的表或聊天框。做成一行小字链接：
                // 它们不是主行动，不能和上面三颗实心按钮抢重量。
                '<div class="dw-copy-row">' +
                    '<button type="button" id="dw-copy-result" class="dw-copy-link"><i class="fa fa-copy mr-1"></i>复制结果</button>' +
                    '<button type="button" id="dw-copy-table" class="dw-copy-link"><i class="fa fa-table mr-1"></i>复制为表格</button>' +
                    '<button type="button" id="dw-copy-link" class="dw-copy-link"><i class="fa fa-link mr-1"></i>复制链接</button>' +
                    // 阶段19-9：存为模板。它排在这一行而不是上面三颗实心按钮里 ——
                    // 每天用一次的东西才有资格占按钮位。
                    '<button type="button" id="dw-save-template" class="dw-copy-link"><i class="fa fa-clone mr-1"></i>存为模板</button>' +
                '</div>' +
                // 方案对比卡的宿主位（v1.51.0）：页面式时代这张卡长在综合所得页面的结果区，
                // 删页后宿主与数据源一起没了，现在由渲染器挂。
                // v1.98.0：不再只给声明了 toCalcInput 的工具 —— 方案库改成按工具自己的口径存指标
                // （不再只有综合所得那六项），任一完整测算的结果步都能存。
                '<div id="dw-scenario-host" class="mt-6"></div>' +
                // v1.100.0：省钱卡宿主位（阶段19-4 顺延 · 留存机制 §3.8 ④）。判定与文案都在
                // toolbox-ui 那一份里，这里只给容器 —— 与档案引导卡同一个套路。
                // 排在档案引导之前：先说这次测算还能省什么（与这一屏直接相关），再谈补全档案。
                '<div id="dw-saving-nudge" class="mt-6 hidden"></div>' +
                // 阶段19-5b：税务档案引导卡的宿主位。与速算器共用同一份渲染（toolbox-ui），
                // 不在这里抄第二份 —— 两处各长一套的话，「暂不」只在一处生效这种错迟早出现。
                '<div id="dw-profile-nudge" class="mt-6 hidden"></div>' +
                // 21 个完整测算的 nextTools 此前是**死数据**：数据写了、deep 这一侧从没渲染，
                // 于是「算完还能干什么」只有速算器有出口，填得更全的那 21 个反而没有。
                // 复用 toolbox-ui 那一份渲染（两处各长一套，推荐迟早分家）。
                // 宿主不叫 dw-next —— 那是导航区「下一步」按钮的 id（navHtml），撞名会让
                // getElementById 在两步之间拿到不同的东西。
                '<div id="dw-next-tools" class="mt-6 hidden"></div>' +
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

    // 阶段19-8：向导里的回车是「下一步」，所以键盘上那颗键要显示成"下一步"而不是默认符号。
    // 速算器那边是"看结果"（go），这里是"下一步"（next）—— 语义由各自的宿主决定，
    // fieldHtml 只负责把它写进控件，不猜用户要什么。
    //
    // v1.142.0 第四轮：wide 的字段自己占一行（见 toolbox.css 的 .dw-field-wide）——
    // 「社保缴费基数」后面跟着的是四个险种金额与比例，它跟它们并排就等于说"它也是险种之一"，
    // 而它是它们共同的来源。
    function drawField(f) {
        var html = f.type === 'repeater' ? repeaterHtml(f) : TB().fieldHtml(f, state.values, { enterkeyhint: 'next' });
        return f.wide ? '<div class="dw-field-wide">' + html + '</div>' : html;
    }

    // ====== 勾选式小节（v1.142.0 第二轮：回到 1.17 的页面结构）======
    //
    // 上一版的一个开关长成两件东西（标题一行 + 右边一颗「是 / 否」），而它管的那一片字段只是
    // 从屏幕上"出现"了 —— 看不出属于谁，也看不出勾与不勾的差别有多大。这正是用户说的
    // 「勾选显示有歧义」。
    //
    // 1.17 的四个页面里它没有这个毛病：勾选框自己就是小节的标题（「专项扣除」三个字直接跟着
    // 方框），它管的字段缩进挂在下面一块。一个动作、一块地方、看得见包含关系。
    //
    // 归属关系**不另写一张表**：a 字段的 when 指向谁，它就是谁的 —— 与渲染条件同一份事实，
    // 不会出现"表上写着归它、界面上却没跟着显隐"这种两处说法打架的错。
    // 牵头的不必是勾选框（「住房扣除方式」是个下拉，下面挂租金还是房贷由它说了算），
    // 所以这里一律按 when 归组，只有勾选框换标题式画法，下拉保持它本来的样子。
    function groupTree(fields) {
        var known = {};
        var kids = {};
        var roots = [];
        fields.forEach(function (f) { known[f.key] = true; });
        fields.forEach(function (f) {
            var owner = (f.when && f.when.key) || '';
            // 认不到爹的（when 指向别的步的字段）按顶层平铺 —— 宁多勿丢，绝不静默吞掉一个框
            if (owner && known[owner] && owner !== f.key) (kids[owner] = kids[owner] || []).push(f);
            else roots.push(f);
        });
        function node(f) {
            var own = kids[f.key] || [];
            return own.length ? { head: f, members: own.map(node) } : f;
        }
        return roots.map(node);
    }

    // 标题式勾选（1.17 的 `<label class="inline-flex items-center">` + 方框 + 名字）
    function switchHeadHtml(f) {
        var id = 'qf-' + f.key;
        var cur = !!state.values[f.key];
        return '<div class="dw-group-head">' +
            '<label class="dw-group-toggle" for="' + id + '">' +
            '<input type="checkbox" id="' + id + '" class="dw-group-checkbox"' + (cur ? ' checked' : '') + '>' +
            '<span class="dw-group-name">' + richEsc(f.label) + '</span>' +
            '</label>' +
            (f.hint ? '<div class="tool-field-hint">' + richEsc(f.hint) + '</div>' : '') +
            '</div>';
    }

    // 勾选框**一律**标题式（方框 + 名字），哪怕它眼下管不到任何字段：
    // ① 同一屏里一半是「☐ 专项附加扣除」一半是「享受…… 是/否」，两颗一样的东西长得不一样，
    //    用户会先怀疑自己点错了地方 —— 这正是「勾选显示有歧义」的另一种形态；
    // ② 它管的那一片是**勾上才出现**的，没勾时最需要它像个标题那样立着，而不是塌成一个开关。
    // 一组里再分类：专项附加扣除底下有七项法定分类（子女教育 / 继续教育 / 大病医疗 /
    // 住房 / 赡养老人），平铺成一串时用户看不出"我这五个数分别属于哪一类"，
    // 更看不出还漏了哪一类没填。spec 里给字段打个 group，这里按它归成小节。
    // 没有 group 的照旧平铺（分组是加分项，不是必须项）。
    function groupNameOf(n) {
        return (n && (n.head ? n.head.group : n.group)) || '';
    }

    // parentGroup：父节点自己的分类。子层与父同属一类时**不再分块** —— 否则
    // 「住房扣除方式 → 住房租金」会在住房这一块里再套一块同名的，看着像漏了一次归并。
    function drawMembers(list, parentGroup) {
        var byGroup = {};
        var order = [];
        list.forEach(function (n) {
            var g = groupNameOf(n);
            if (!g || g === parentGroup) return;
            if (!byGroup[g]) { byGroup[g] = []; order.push(g); }
            byGroup[g].push(n);
        });
        if (!order.length) return list.map(function (n) { return drawNode(n, parentGroup); }).join('');
        var done = {};
        var html = '';
        list.forEach(function (n) {
            var g = groupNameOf(n);
            if (!g || g === parentGroup) { html += drawNode(n, g || parentGroup); return; }
            if (done[g]) return;                 // 整组在它第一次出现的位置一次画完
            done[g] = true;
            html += '<div class="dw-subgroup">' +
                '<div class="dw-subgroup-title">' + esc(g) + '</div>' +
                '<div class="dw-subgroup-body">' +
                byGroup[g].map(function (m) { return drawNode(m, g); }).join('') +
                '</div>' +
                '</div>';
        });
        return html;
    }

    function drawNode(n, parentGroup) {
        if (!n || !n.head) return n && n.type === 'switch' ? switchHeadHtml(n) : drawField(n);
        var own = groupNameOf(n) || parentGroup;
        var members = drawMembers(n.members || [], own);
        if (!members) return n.head.type === 'switch' ? switchHeadHtml(n.head) : drawField(n.head);
        return '<div class="dw-group">' +
            (n.head.type === 'switch' ? switchHeadHtml(n.head) : drawField(n.head)) +
            '<div class="dw-group-body">' + members + '</div>' +
            '</div>';
    }

    // 步内 advanced 字段一样只折叠、不隐藏：与速算器共用同一个块和同一份措辞（不写第二套）
    function advancedBlock(fields) {
        if (!fields.length) return '';
        var tb = TB();
        if (tb && typeof tb.advancedBlockHtml === 'function') {
            return tb.advancedBlockHtml(fields, state.values, drawField, state.toolId);
        }
        return '<details class="tool-advanced-block mt-3"' +
            ' data-tool-id="' + String(state.toolId || '').replace(/"/g, '') + '">' +
            '<summary class="flex items-center justify-between cursor-pointer select-none px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm font-medium text-gray-700">' +
            '<span><i class="fa fa-sliders mr-2"></i>更多参数（可选）</span></summary>' +
            '<div class="mt-3">' + fields.map(drawField).join('') + '</div></details>';
    }

    function inputHtml(tool, step) {
        var fs = visibleIn(tool, fieldsOfStep(tool, step.key), state.values);
        var adv = fs.filter(isAdvanced);
        var basic = fs.filter(function (f) { return !isAdvanced(f); });
        // 按 when 归成「勾选 + 它管的一片」再画（详见 groupTree 的注释）
        var inputs = groupTree(basic).map(drawNode).join('') + advancedBlock(adv);
        // 阶段19-9：模板条只给第一步。走到第二步说明人已经开始填了，
        // 那时候它唯一的作用是把注意力从当前步挪走。
        var first = stepsOf(tool)[0];
        var isFirst = !!first && first.key === step.key;
        return '<div class="card">' +
            '<h3 class="text-lg font-bold text-primary mb-4">' + richEsc(step.title) + '</h3>' +
            (step.why ? '<p class="text-sm text-gray-600 mb-4">' + richEsc(step.why) + '</p>' : '') +
            (isFirst ? '<div id="dw-template-bar" class="hidden"></div>' : '') +
            // 同一层里两个框一行（详见 toolbox.css 的 .dw-field-grid）：这是 1.17 那四个页面的读法
            '<div class="dw-field-grid">' + inputs + '</div>' +
            navHtml(stepsOf(tool)) +
            '</div>';
    }

    // 阶段19-9：从模板填充 —— 20 个字段的完整测算才是模板的主战场，
    // 但点法与速算器页完全一致（两边调到同一份实现），否则用户会以为模板换了地方。
    function mountTemplateBar(tool) {
        var UI = window.EuriskoEntityUI;
        if (!UI || typeof UI.mountTemplateBar !== 'function') return;
        UI.mountTemplateBar('dw-template-bar', tool.id, function (values) {
            collect(tool);      // 先收回当前步已填的 —— 模板里没有的键不该被顺手抹掉
            Object.keys(values).forEach(function (k) { state.values[k] = values[k]; });
            saveDraft();
            render();
        });
    }

    // 反向互链：速算器 → 完整测算 那边早就有（速算器结果页行动条的「按年填全的完整版」），
    // 反过来一直缺 —— 用户进了按年填全的向导才发现自己只想估一个数，那时只能退出来重新找。
    // **只在第一步出现**：填到后面再来这句话，等于劝人扔掉已经填好的东西。
    // 组描述里那句「用上面的速算器更快」是泛指，这一行给的是**具体且可点**的那一个。
    function quickHintHtml(tool) {
        if (state.stepIndex !== 0) return '';
        var qid = (TB() && typeof TB().quickCounterpartOf === 'function') ? TB().quickCounterpartOf(tool) : '';
        var q = qid ? R().get(qid) : null;
        if (!q) return '';
        return '<div class="dw-quick-hint">只想快速估一个数？' +
            '<button type="button" id="dw-go-quick" data-quick-id="' + esc(qid) + '">用「' +
            esc(q.name) + '」速算版<i class="fa fa-angle-right"></i></button></div>';
    }

    function paneHtml(tool, steps) {
        var step = steps[state.stepIndex];
        var body = step.result ? resultHtml(tool) : inputHtml(tool, step);
        return '<div class="step-content max-w-6xl mx-auto"><div class="step-pane active">' +
            quickHintHtml(tool) + body + '</div></div>';
    }

    // 用 onclick 而不是 addEventListener：render 每次都换 innerHTML，加上去会一层层叠。
    function bindQuickHint() {
        var el = document.getElementById('dw-go-quick');
        if (!el || !TB()) return;
        el.onclick = function () { TB().openTool(this.getAttribute('data-quick-id')); };
    }

    function mountNextSteps(tool, steps) {
        var box = document.getElementById('dw-next-tools');
        if (!box) return;
        var step = steps[state.stepIndex];
        if (!step || !step.result) { box.classList.add('hidden'); box.innerHTML = ''; return; }
        if (TB() && typeof TB().renderNextSteps === 'function') {
            TB().renderNextSteps(tool, null, state.lastResult, 'dw-next-tools');
        }
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
        // 预览条排在 pane **之后**：它是吸底的（sticky bottom-0），顺序上要么在内容流最后、
        // 要么被 sticky 顶上去遮住底部的「下一步」。`.has-preview-bar .step-content`
        // 那条 pb-20 正是留给它的，不需要额外避让。
        host.innerHTML = headerHtml(tool, steps) + paneHtml(tool, steps) + previewBarHtml(tool, steps);
        // 回车推进只绑一次（host 长期存在，每次 render 只换 innerHTML）
        bindEnterNext(host);
        bind(tool, steps);
        mountScenarioCard(tool);
        mountSavingNudge(tool);
        mountProfileNudge(tool);
        mountTemplateBar(tool);
        bindQuickHint();
        mountNextSteps(tool, steps);
        // fieldHtml 写的是字段的 default（它是速算器与向导共用、只认 schema）。
        // 分步向导每次只渲染当前步，若不回填，用户「上一步 → 下一步」就会被打回默认值 ——
        // 这类丢值肉眼很难发现（值还在内存里、只是没显示出来），所以在这里统一回填。
        applyValues(state.values);
        renderWarnings(tool);
    }

    // 方案对比卡（v1.51.0 起）：取数与 compute 同源。
    // 不在渲染器里另写一份「向导值 → 计税入参」的映射 —— 那份映射一旦有两份，
    // 「保存的方案」与「界面上算的数」迟早对不上。
    //
    // v1.98.0：保存改用**结果对象**（state.lastResult，就是界面上正在显示的那一份）出指标，
    // 于是 21 个完整测算都能存方案；toCalcInput 那份只留给「生成年终奖方案」（它要按
    // base / deductions 重算两种口径，只有综合所得给得起）。
    function mountScenarioCard(tool) {
        var host = document.getElementById('dw-scenario-host');
        if (!host) return;                       // 非结果步
        var ui = window.EuriskoScenarioUI;
        if (!ui || typeof ui.mount !== 'function' || !window.EuriskoScenarios) return;
        var ctx = {
            toolId: tool.id,
            toolName: tool.name || '',
            values: Object.assign({}, state.values),
            out: state.lastResult || null
        };
        if (typeof tool.toCalcInput === 'function') {
            try {
                var legacy = tool.toCalcInput(state.values);
                if (legacy && legacy.results) {
                    ctx.base = legacy.base;
                    ctx.deductions = legacy.deductions;
                    ctx.results = legacy.results;
                }
            } catch (e) { /* 取不到就不给「生成年终奖方案」，保存照常可用 */ }
        }
        ui.mount(host, ctx);
    }

    // v1.100.0：省钱卡（阶段19-4 顺延 · §3.8 ④）。判定与文案走 toolbox-ui 那一份 ——
    // 「档案里勾了扣除、这次没算进去」这件事在速算器与完整测算是同一件事，
    // 写两套就等于允许两边对"什么算没带上"给出不同答案。
    //
    // 这里只补两件只有向导知道的事：
    //   ① stepIndexOf —— 那一步此刻在不在（简明视图会把 advanced 步合并，
    //      合并后找不到就由渲染层退回「核定能扣多少」，绝不摆一颗点了不跳的按钮）；
    //   ② onStep —— 回到那一步。走的是与「上一步」同一套 state.stepIndex + saveDraft + render，
    //      不为这张卡新开一条导航路径。
    function mountSavingNudge(tool) {
        var host = document.getElementById('dw-saving-nudge');
        var tb = window.EuriskoToolbox;
        if (!host || !tb || typeof tb.mountSavingNudge !== 'function') return;
        var steps = stepsOf(tool);
        tb.mountSavingNudge('dw-saving-nudge', tool, state.values, {
            stepIndexOf: function (key) {
                for (var i = 0; i < steps.length; i++) { if (steps[i].key === key) return i; }
                return -1;
            },
            onStep: function (index) {
                state.stepIndex = Math.max(0, Math.min(steps.length - 1, index));
                saveDraft();
                render();
            }
        });
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
    // stepKey 可选：跳步时由调用方指定「屏幕上刚才显示的是哪一步」（此时 state.stepIndex
    // 已经指向另一屏，收值就会收错一屏）
    function collect(tool, stepKey) {
        var dom = TB().readValues(tool);
        // fieldsOfStep 按 spec 归组，与当前显示哪一步无关，指定 key 就能稳定收那一组。
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
    // touched：用户**亲手改过**的派生值。社保那几个金额框最典型 —— 工资条上写的是
    // 「养老扣了 800」，用户手里根本没有缴费基数，只能直接填金额；而每次收值 derive 都会
    // 把它冲回「基数 × 比例」，改了等于没改。所以手改过的键，derive 不再覆盖，
    // 直到用户去动它的来源字段（那时才该重新自动算，见 bindDerivedSources 里的清空）。
    function applyDerived(tool) {
        if (typeof tool.derive !== 'function') return false;
        var patched;
        try { patched = tool.derive(state.values) || {}; }
        catch (e) { return false; }
        var changed = false;
        Object.keys(patched).forEach(function (k) {
            if (state.touched[k]) return;            // 手改优先
            if (state.values[k] === patched[k]) return;
            state.values[k] = patched[k];
            changed = true;
        });
        return changed;
    }

    // 派生字段**不另挂标记**：它在问号里的提示已经写了「这一栏不用填：按…自动算出」，
    // 界面上再来一行只是把同一句话再说一遍。字段的 derived 只当行为开关 ——
    // 决定哪些键享受「手改不被冲」的待遇（见 applyDerived / bindDerivedTargets）。

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
                state.touched = {};                 // 动了输入源：自动值该重新生效了
                collect(tool);
                applyValues(state.values, el);      // 跳过正在输入的框，别抢光标
                renderWarnings(tool);
            });
            el.addEventListener('change', function () {
                // 数字框失焦（页面版 normalizeRateInput 也是这个时机）：比例框留空 / 越界，
                // 先把它归一到**这个险种自己的默认比例**再收值。否则 readValues 会把空串读成 0，
                // derive 就按 0% 算 —— 用户留了个空框，看到的却是 0 元，会被当成算错了。
                if (meta && meta.type === 'percent' && !isRateOk(el.value)) el.value = meta.default;
                state.touched = {};                 // 同上：勾选 / 选定身份这类动作更要立刻重算
                collect(tool);
                applyValues(state.values);
                renderWarnings(tool);
            });
        });
    }

    // 派生值本身被手改时记一笔：之后 derive 不再覆盖它，直到用户去动它的来源字段。
    // 没有这一笔，「养老扣了 800，我就填 800」这种填法会在切步时悄无声息地被冲掉。
    function bindDerivedTargets(tool, step) {
        if (typeof tool.derive !== 'function' || !step || step.result) return;
        (tool.fields || []).forEach(function (f) {
            if (!f.derived) return;
            var el = document.getElementById('qf-' + f.key);
            if (!el) return;
            el.addEventListener('input', function () { state.touched[f.key] = true; });
            el.addEventListener('change', function () { state.touched[f.key] = true; });
        });
    }

    // 0 与 100 之间的有限数才算合法比例 —— 空串、负数、>100 都要回落
    function isRateOk(raw) {
        var n = parseFloat(raw);
        return String(raw).trim() !== '' && isFinite(n) && n >= 0 && n <= 100;
    }

    // ====== 阶段19-8：回车 = 下一步（键盘走完一次完整测算）======
    // 验收口径是「键盘可全程无鼠标完成一次测算」：Tab 顺序由 DOM 顺序天然给出，
    // 缺的就是这一下 —— 每填完一个框都要去找那颗「下一步」，等于键盘没用。
    // 结果步不接管回车：那里没有输入框，若把回车接到「保存」上，
    // 用户只是想换行，却把一条结果存进了历史。
    function bindEnterNext(host) {
        if (!host || host.getAttribute('data-dw-enter') === '1') return;
        host.setAttribute('data-dw-enter', '1');
        host.addEventListener('keydown', function (e) {
            if (e.key !== 'Enter') return;
            var t = e.target;
            if (!t || t.tagName !== 'INPUT') return;
            var next = document.getElementById('dw-next');
            if (!next) return;                      // 结果步：不抢任何按钮
            e.preventDefault();
            var tool = R() && R().get(state.toolId);
            // 先收值：下一步按钮的处理器自己也会收一次，但 repeater 的增删依赖"此刻"的值，
            // 这里收一次是为了让 state 与 DOM 在任何一条路径下都一致。
            if (tool) collect(tool);
            next.click();
        });
    }

    // 阶段19-8：结果页的三个「带走」动作（明文 / 表格 / 带参链接）。
    // 与速算器共用 toolbox-ui 的那份实现 —— 表格形状只有一种，"粘进 Excel 列对齐"才验得住。
    function bindCopyRow(tool) {
        var tb = TB();
        if (!tb || typeof tb.copyText !== 'function') return;
        function bindOne(id, textFn, busyText) {
            var btn = document.getElementById(id);
            if (!btn) return;
            var origin = btn.innerHTML;
            btn.addEventListener('click', function () {
                var text = '';
                try { text = textFn() || ''; } catch (e) { text = ''; }
                if (!text) {
                    btn.innerHTML = '<i class="fa fa-exclamation-circle"></i>生成失败';
                    setTimeout(function () { btn.innerHTML = origin; }, 1600);
                    return;
                }
                tb.copyText(text).then(function (ok) {
                    btn.innerHTML = ok ? '<i class="fa fa-check"></i>已复制' : '<i class="fa fa-exclamation-circle"></i>复制失败';
                    setTimeout(function () { btn.innerHTML = origin; }, 1600);
                });
            });
        }
        function out() {
            if (state.lastResult) return state.lastResult;
            try { return viewOut(tool.compute(state.values)); } catch (e) { return null; }
        }
        bindOne('dw-copy-result', function () {
            var o = out();
            return o ? tb.resultTextOf(tool, o) : '';
        });
        bindOne('dw-copy-table', function () {
            var o = out();
            return o ? tb.tableTextOf(tool, o) : '';
        });
        bindOne('dw-copy-link', function () {
            var l = window.EuriskoParamLink;
            return l && typeof l.build === 'function' ? l.build(state.toolId, state.values) : '';
        });

        // 阶段19-9：存为模板。失败必须把原因说出来 —— 不说，用户会以为存好了，
        // 下次进来找不到，那比没这个功能更糟（速算器那份是同一句话两处写，这里也一样）。
        var tplBtn = document.getElementById('dw-save-template');
        if (tplBtn) {
            var tplOrigin = tplBtn.innerHTML;
            tplBtn.addEventListener('click', function () {
                var UI = window.EuriskoEntityUI;
                var res = (UI && typeof UI.saveAsTemplate === 'function')
                    ? UI.saveAsTemplate(tool, state.values)
                    : { ok: false, reason: 'module' };
                tplBtn.innerHTML = res.ok
                    ? '<i class="fa fa-check"></i>已存为模板'
                    : '<i class="fa fa-info-circle"></i>' + esc(UI && UI.hintFor ? UI.hintFor(res) : '存不了模板');
                setTimeout(function () { tplBtn.innerHTML = tplOrigin; }, 2600);
            });
        }
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
            state.compareKey = null;
            render();
        });

        // 阶段19-8：结果页的一行「带走」动作（复制明文 / 表格 / 链接）
        if (steps[state.stepIndex] && steps[state.stepIndex].result) bindCopyRow(tool);

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
            bindStepJump(tool, steps);
            bindLivePreview(tool, steps);
            fieldsOfStep(tool, step.key).forEach(function (f) {
                if (f.type === 'repeater') { bindRepeater(tool, f); return; }
                if (!f.when) return;
                var el = document.getElementById('qf-' + f.when.key);
                if (!el) return;
                el.addEventListener('change', function () { collect(tool); render(); });
            });
        }
        bindDerivedSources(tool, step);
        bindDerivedTargets(tool, step);
        }

    // 步骤条可跳：逐个 .step 去绑会被下一次重画冲掉（整块 innerHTML 每次重画），委托到页面容器。
    // 跳之前**必须收值**：此刻屏幕上的东西还只在 DOM 里，不收就丢。
    // 往前跳不拦（值还不够时预览条会显示"算不出来"，不会报错）；结果步也允许直接跳 ——
    // 那等于"我想看看现在算出来是多少"，而读数本来就不该设门槛。
    function bindStepJump(tool, steps) {
        var host = document.getElementById(PAGE_ID);
        if (!host || host.getAttribute('data-dw-jump') === '1') return;
        host.setAttribute('data-dw-jump', '1');
        host.addEventListener('click', function (e) {
            var el = e.target.closest ? e.target.closest('.dw-step-jump') : null;
            if (!el) return;
            var i = Number(el.getAttribute('data-dw-step'));
            if (!isFinite(i) || i === state.stepIndex) return;
            collect(tool);
            state.stepIndex = Math.max(0, Math.min(steps.length - 1, i));
            saveDraft();
            render();
        });
    }

    // 输入过程中刷新预览条：debounce 到手停下来再算（每次按键都跑一遍完整测算没意义，
    // 而测算里有些是有反算迭代的）。这里**不**重画整屏 —— 重画会把光标从输入框里踢出去。
    function bindLivePreview(tool, steps) {
        var host = document.getElementById(PAGE_ID);
        if (!host || host.getAttribute('data-dw-live') === '1') return;
        host.setAttribute('data-dw-live', '1');
        var timer = null;
        function tick() {
            clearTimeout(timer);
            timer = setTimeout(function () {
                if (!state.toolId) return;
                var t = R() && R().get(state.toolId);
                if (!t) return;
                collect(t);
                refreshPreviewBar(t);
            }, 220);
        }
        host.addEventListener('input', tick);
        host.addEventListener('change', tick);
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


    window.EuriskoDeepWizard = {
        open: open,
        has: has,
        // 暴露给单测：断言「结果步自动追加」「字段按 step 归组」这类肉眼难守的约束
        stepsOf: stepsOf,
        fieldsOfStep: fieldsOfStep,
        // 暴露给单测：断言「切换视图不丢值」这类肉眼极难发现的回归
        values: function () { return state.values; },
        // 暴露给单测：交付版报告的柱状图取数要覆盖 21 个税种，而 UI 上只点得通
        // 有默认值的一部分（其余 spec 有必填项，走到结果步要靠用户填）。
        // 直接对 compute 的结果取数，才能把「21 个都取对」钉住而不是钉住 8 个。
        structureFor: structureFor,
        // 全量默认入参（含 repeater 的空条目）：单测要在 21 个税种上验报告取数，
        // 总不能手拼一份 —— 手拼的结果只是「我猜的入参」，要用向导自己填的那份。
        defaultsOf: defaultsOf
    };
})();
