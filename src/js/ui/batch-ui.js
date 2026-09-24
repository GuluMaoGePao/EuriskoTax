/**
 * 阶段19-11 · 效率层 E4：批量计算
 *
 * 「同一件事做 N 遍」的终点形态：HR 手里是一份**表**（每人一行），不是一个表单。
 * 这一版做的是：把那份表粘进来 → 认出哪一列是什麼 → 一次算出 N 行 → 导出一张能交出去的表。
 *
 * 三条边界（改这个文件前先读，它们一旦破了，这个功能的性质就变了）：
 *
 *   ① **批量不另起一套算法**：每一行都走 `tool.compute(values)`，与速算器逐个手填**同一个入口**。
 *      这是防两套口径的唯一办法 —— 一旦为了"跑得快"给批量写一份求和/取整逻辑，
 *      就会出现"表里第 7 行与单独算第 7 个人不一样"，而这种错没有任何人会当场发现。
 *      守护方式：tests/batch.test.js 的守护测试 3（批量 N 行 = 单行逐个算，逐项相等）。
 *   ② **数据不出本机**：没有上传、没有落库、批量结果**不写计算历史**。
 *      后者是刻意的：200 行一次灌进历史，历史就不再是"我算过什么"而是"程序跑过什么"；
 *      要留痕就导出那张表 —— 表才是批量结果该有的形态。
 *   ③ **免费 5 行/次，超限拒绝整批而不是截前 5 行**：半份工资表看起来跟一份完整的表一模一样，
 *      发出去就是事故；宁可一行都不算、把话说清楚（升级入口仍只有顶栏与个人中心两处，不新造第三处）。
 *
 * 只做**速算器**（注册表里 status 为 native 的 20 个）：完整测算（deep）是分步向导，
 * 字段之间有依赖（前一步选了什么，后一步才有哪一列），一次性按列喂进去会缺字段 ——
 * 那不是"批量算得不准"，那是把这个语境（填到哪一步了）整个丢了。
 */
(function () {
    'use strict';

    var FREE_ROWS = 5;
    var PREVIEW_ROWS = 20;        // 预览只画前 20 行：它是给人**核对列认对了没有**的，不是给人读数据的
    var DISCLAIMER = '（由 EuriskoTax 批量测算，仅供参考；正式申报以主管税务机关核定为准）';

    // 文案单一真源（docs/guides/user-facing-copy-standard.md）：取不到常量时回落同义兜底
    var COPY = (typeof window !== 'undefined' && window.CopyStandard) ? window.CopyStandard : {};
    var LEAD_COPY = COPY.LEAD || {};
    function txt(v, fallback) { return v || fallback; }

    function R() { return (typeof window !== 'undefined') ? window.EuriskoToolRegistry : null; }

    function isPro() {
        var P = (typeof window !== 'undefined') ? (window.EuriskoPlan || window.EuriskoSubscription) : null;
        if (!P) return false;
        try {
            var u = (window.apiClient && typeof window.apiClient.getCurrentUser === 'function')
                ? window.apiClient.getCurrentUser() : null;
            if (typeof P.isPro === 'function') return u ? !!P.isPro(u.plan, u.plan_expires_at) : false;
            if (typeof P.getCurrentPlan === 'function') {
                var plan = P.getCurrentPlan(u || null);
                return !!plan && String(plan.code || plan.name || '').toLowerCase().indexOf('pro') >= 0;
            }
        } catch (e) { /* ignore */ }
        return false;
    }

    // ====== 粘贴 → 表 ======
    // Excel / WPS / 飞书复制出来的是 TSV；从 csv 文件里贴出来的是逗号；
    // 中文表格里还常见全角逗号与分号。分隔符按**出现次数**选，不写死：
    // 写死 TSV 的后果是"我这明明是从 Excel 贴的" —— 而实际上用户贴的是另存过的 csv。
    function splitLines(text) {
        return String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
            .filter(function (line, i, arr) { return !(i === arr.length - 1 && !line.trim()); });
    }

    function pickDelimiter(sample) {
        var cands = ['\t', ',', '，', ';', '；'];
        var best = '\t', bestCount = 0;
        cands.forEach(function (d) {
            var n = sample.split(d).length - 1;
            if (n > bestCount) { bestCount = n; best = d; }
        });
        return best;
    }

    // 引号感知的切分：Excel 另存出来的 csv 里 "12,000" 是**一个单元格**，
    // 直接按逗号切会把它切成两列，于是后面所有列整体右移一位 ——
    // 那是"看着认对了、其实全错位"的一类错，批量里最难发现。
    function splitLine(line, delim) {
        var out = [], cur = '', inQ = false;
        for (var i = 0; i < line.length; i++) {
            var ch = line.charAt(i);
            if (inQ) {
                if (ch === '"') {
                    if (line.charAt(i + 1) === '"') { cur += '"'; i++; } else { inQ = false; }
                } else { cur += ch; }
            } else if (ch === '"') { inQ = true; }
            else if (ch === delim) { out.push(cur.trim()); cur = ''; }
            else { cur += ch; }
        }
        out.push(cur.trim());
        return out;
    }

    function parseTable(text) {
        var lines = splitLines(text);
        if (!lines.length) return [];
        var delim = pickDelimiter(lines[0]);
        return lines.map(function (line) { return splitLine(line, delim); });
    }

    // ====== 列识别 ======
    // 归一化只做"人看得懂的同一列"该做的收敛：去空白、去括号里的单位/口径说明、去冒号。
    // 不去"元/万元"这类前缀 —— 那是**口径**，把它抹掉等于替用户换了单位。
    function norm(s) {
        return String(s === undefined || s === null ? '' : s)
            .replace(/[\s\u3000]/g, '')
            .replace(/[（(][^（()）]*[)）]/g, '')
            .replace(/[:：]$/, '')
            .toLowerCase();
    }

    function detectMapping(tool, headerCells) {
        var fields = tool.fields || [];
        var mapping = (headerCells || []).map(function () { return ''; });
        var used = {};
        (headerCells || []).forEach(function (raw, i) {
            var nh = norm(raw);
            if (!nh) return;
            var hit = null;
            // ① 完全等于字段名的（"税前月薪" / "monthlyIncome"）
            for (var a = 0; a < fields.length && !hit; a++) {
                var f = fields[a];
                if (used[f.key]) continue;
                if (nh === norm(f.label) || nh === norm(f.key)) hit = f;
            }
            // ② 互相包含（"月薪" ⊂ "税前月薪"、"五险一金个人" ⊃ "五险一金（个人/月）"）
            for (var b = 0; b < fields.length && !hit; b++) {
                var g = fields[b];
                if (used[g.key]) continue;
                var ng = norm(g.label);
                if (!ng) continue;
                if (nh.indexOf(ng) >= 0 || ng.indexOf(nh) >= 0) hit = g;
            }
            if (!hit) return;
            mapping[i] = hit.key;
            used[hit.key] = true;
        });
        return { mapping: mapping, matched: mapping.filter(Boolean).length };
    }

    // 没有表头（或表头一个字都没认出来）：按字段声明顺序对号入座。
    // 这是"最后一招"而不是默认路径 —— 它假设列的顺序与工具一致，错了不会有任何提示，
    // 所以 header 认出**至少一列**就走表头路径。
    function positionalMapping(tool, colCount) {
        var fields = tool.fields || [];
        var mapping = [];
        for (var i = 0; i < colCount; i++) mapping.push(i < fields.length ? fields[i].key : '');
        return mapping;
    }

    // ====== 单元格 → 值 ======
    function toHalfWidth(s) {
        return String(s || '')
            .replace(/[\uFF10-\uFF19]/g, function (ch) { return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0); })
            .replace(/\uFF0E/g, '.').replace(/\uFF0D/g, '-').replace(/\uFF0B/g, '+');
    }

    // 金额列在真表里的长相：¥12,000 / 12,000.00 / 1.2万（不认）/ 空 / "-"
    function cleanNumber(s) {
        var t = toHalfWidth(s).replace(/[¥￥$,\s，元]/g, '').trim();
        if (!t || t === '-' || t === '—') return NaN;
        if (t.charAt(t.length - 1) === '%') {
            var p = parseFloat(t.slice(0, -1));
            return isFinite(p) ? p / 100 : NaN;
        }
        return parseFloat(t);
    }

    function optionOf(field, raw) {
        var opts = field.options || [];
        var nh = norm(raw);
        if (!nh) return null;
        for (var i = 0; i < opts.length; i++) {
            var o = opts[i];
            if (nh === norm(o.label) || nh === norm(o.value)) return o.value;
        }
        return null;
    }

    // 与速算器 readValues 同一口径（toolbox-ui.js）：
    //   · select：默认值为数字的字段才转数字，否则保留字符串（'general' 被归零的 bug 就是这么来的）
    //   · 其余：非法/空 → 0（不是回默认值 —— 表里这一格空着就是"这项没有"，不是"用工具的示例值"）
    function cellToValue(field, raw) {
        if (!field) return raw;
        if (field.type === 'switch') {
            var t = norm(raw);
            return t === '是' || t === 'y' || t === 'yes' || t === 'true' || t === '1' || t === '✓' || t === '√';
        }
        if (field.type === 'select') {
            var hit = optionOf(field, raw);
            if (hit !== null) return hit;
            // 认不出的口径**原样传下去**（不替它选默认值）：选默认值等于静默换口径
            // （"小规模" 被当成 "一般计税" 算出来的数也是个数，只是不对），
            // 而原样传让 compute 有机会拒绝 —— 那一行会被标出来（见 isUnparsable）。
            if (!String(raw || '').trim()) return field.default;
            return typeof field.default === 'number'
                ? Number(toHalfWidth(raw).replace(/[^\d.\-]/g, '')) : String(raw).trim();
        }
        var n = cleanNumber(raw);
        return isFinite(n) ? n : 0;
    }

    // "这一格写了东西但读不懂" ≠ "这一格空着"：
    //   · 空着 = 这项没有（0，合法，照算）；
    //   · 写了却读不懂（"面议" / 手滑多打一个字）= 脏数据，**标出来**而不是当 0。
    //     当 0 的后果是"这个人不用交税" —— 一份表里有这么一行，没人会回头查。
    function isUnparsable(field, raw) {
        if (!field) return false;
        var s = String(raw === undefined || raw === null ? '' : raw).trim();
        if (!s) return false;
        if (field.type === 'switch') return false;
        if (field.type === 'select') return optionOf(field, s) === null;
        return !isFinite(cleanNumber(s));
    }

    function fieldOf(tool, key) {
        var list = tool.fields || [];
        for (var i = 0; i < list.length; i++) if (list[i].key === key) return list[i];
        return null;
    }

    // ====== 权益闸 ======
    function canRun(count) {
        if (isPro()) return { ok: true, limit: 0, count: count };
        if (count > FREE_ROWS) return { ok: false, reason: 'limit', limit: FREE_ROWS, count: count };
        return { ok: true, limit: FREE_ROWS, count: count };
    }

    // ====== 计算 ======
    // 一次算一整批。**一行算不出来不中断**（记下来，最后一起说）：
    // 一份 200 行的表里有一个人的月薪写成了"面议"，剩下 199 人照样要能发工资。
    function computeRows(tool, matrix, mapping) {
        var rows = [];
        var failed = 0;
        (matrix || []).forEach(function (cells, idx) {
            var values = {};
            var dirty = false;
            (tool.fields || []).forEach(function (f) { values[f.key] = f.default; });
            (mapping || []).forEach(function (key, ci) {
                if (!key) return;
                var f = fieldOf(tool, key);
                if (isUnparsable(f, cells[ci])) dirty = true;
                values[key] = cellToValue(f, cells[ci]);
            });
            var out = null;
            try { out = dirty ? null : tool.compute(values); } catch (e) { out = null; }
            if (!out || !out.primary) { failed++; out = null; }
            rows.push({ index: idx, cells: cells || [], values: values, out: out, dirty: dirty });
        });
        return { rows: rows, failed: failed };
    }

    function run(opts) {
        opts = opts || {};
        var reg = R();
        if (!reg || typeof reg.get !== 'function') return { ok: false, reason: 'no-registry' };
        var tool = reg.get(opts.toolId);
        if (!tool) return { ok: false, reason: 'no-tool' };
        var table = parseTable(opts.text);
        if (!table.length) return { ok: false, reason: 'empty' };

        var det = detectMapping(tool, table[0]);
        var hasHeader = det.matched > 0;
        var header = hasHeader ? table[0] : (tool.fields || []).map(function (f) { return f.label; });
        var matrix = hasHeader ? table.slice(1) : table;
        if (!matrix.length) return { ok: false, reason: 'empty' };

        var mapping = opts.mapping || (hasHeader ? det.mapping : positionalMapping(tool, header.length));
        var gate = canRun(matrix.length);
        var res = { ok: true, tool: tool, header: header, mapping: mapping, hasHeader: hasHeader, rows: [], failed: 0 };
        // 超限时**一行都不算**（理由见文件头 ③）：半份表比没有更危险
        if (!gate.ok) {
            res.ok = false; res.reason = 'limit'; res.limit = gate.limit; res.count = gate.count;
            return res;
        }
        var computed = computeRows(tool, matrix, mapping);
        res.rows = computed.rows;
        res.failed = computed.failed;
        return res;
    }

    // ====== 导出 ======
    // 未识别的列**原样带出**（通常就是姓名 / 工号）：导出的表要对得上人，
    // 只留字段列的那张表没人知道第 7 行是谁。
    function resultColumns(res) {
        var cols = [];
        (res.header || []).forEach(function (h, i) {
            var key = (res.mapping || [])[i];
            var f = key ? fieldOf(res.tool, key) : null;
            cols.push({ label: (f ? f.label : (String(h || '').trim() || ('第 ' + (i + 1) + ' 列'))), key: key || '', raw: true });
        });
        var sample = null;
        (res.rows || []).forEach(function (r) { if (!sample && r.out) sample = r.out; });
        cols.push({ label: sample ? sample.primary.label : '测算结果', raw: false, primary: true });
        if (sample) {
            (sample.rows || []).forEach(function (rr) { cols.push({ label: rr.label, raw: false }); });
        }
        return cols;
    }

    function rowCells(res, row, cols) {
        var out = [];
        var sample = null;
        (res.rows || []).forEach(function (r) { if (!sample && r.out) sample = r.out; });
        cols.forEach(function (c, i) {
            if (c.raw) {
                out.push(row.cells[i] === undefined ? '' : String(row.cells[i]));
                return;
            }
            if (!row.out) { out.push(''); return; }
            if (c.primary) { out.push(tableCellOf(row.out.primary.value, row.out.primary.kind)); return; }
            var hit = null;
            var list = (sample && sample.rows) || [];
            for (var k = 0; k < list.length; k++) if (list[k].label === c.label) { hit = list[k]; break; }
            out.push(hit ? tableCellOf(hit.value, hit.kind) : '');
        });
        return out;
    }

    // 与速算器「复制为表格」同一口径（toolbox-ui.js 的 tableCellOf）：金额列输出**裸数字**，
    // 带 ¥ 或千分位会被 Excel 认成文本、贴进去不能求和 —— 那这个导出就白做了。
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

    function csvCell(s) {
        var t = String(s === undefined || s === null ? '' : s).replace(/"/g, '""');
        return /[",\n]/.test(t) ? '"' + t + '"' : t;
    }

    function csvOf(res) {
        var cols = resultColumns(res);
        var lines = [cols.map(function (c) { return csvCell(c.label); }).join(',')];
        (res.rows || []).forEach(function (r) {
            lines.push(rowCells(res, r, cols).map(csvCell).join(','));
        });
        // 可带走的结果必须带免责声明（tests/ui-result-compliance.test.js 的口径）：
        // 这张表会被贴进工资条、发进群，声明跟着表走，不能只留在页面上。
        lines.push(csvCell(DISCLAIMER));
        return '\uFEFF' + lines.join('\n');       // BOM：不加 Excel 打开是乱码
    }

    function tsvOf(res) {
        var cols = resultColumns(res);
        var lines = [cols.map(function (c) { return String(c.label).replace(/\t/g, ' '); }).join('\t')];
        (res.rows || []).forEach(function (r) {
            lines.push(rowCells(res, r, cols).join('\t'));
        });
        return lines.join('\n');
    }

    function todayStamp() {
        var d = new Date();
        var p = function (n) { return String(n).length < 2 ? '0' + n : String(n); };
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    }

    function downloadCsv(res) {
        var name = 'euriskotax-batch-' + (res.tool ? res.tool.id : 'result') + '-' + todayStamp() + '.csv';
        try {
            var blob = new Blob([csvOf(res)], { type: 'text/csv;charset=utf-8' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url; a.download = name;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
            return true;
        } catch (e) { return false; }
    }

    function copyTsv(res) {
        var text = tsvOf(res);
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text);
                return true;
            }
        } catch (e) { /* 非安全上下文：走下面的兜底 */ }
        try {
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta); ta.select();
            var ok = document.execCommand('copy');
            document.body.removeChild(ta);
            return !!ok;
        } catch (e) { return false; }
    }

    // ====== 界面 ======
    var state = { toolId: '', text: '', mapping: null, result: null };

    function esc(s) {
        return String(s === undefined || s === null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function $(id) { return document.getElementById(id); }

    function batchTools() {
        var reg = R();
        if (!reg || typeof reg.all !== 'function') return [];
        // 只列速算器（理由见文件头最后一段）：deep 是分步向导，批量喂不进"填到哪一步"这件事
        return (reg.all() || []).filter(function (t) { return t && t.status !== 'deep' && (t.fields || []).length; });
    }

    function fillToolSelect() {
        var sel = $('batch-tool');
        if (!sel) return;
        var list = batchTools();
        sel.innerHTML = list.map(function (t) {
            return '<option value="' + esc(t.id) + '"' + (t.id === state.toolId ? ' selected' : '') +
                '>' + esc(t.name) + '</option>';
        }).join('');
        if (!state.toolId && list.length) state.toolId = list[0].id;
    }

    function currentTool() {
        var reg = R();
        return (reg && typeof reg.get === 'function') ? reg.get(state.toolId) : null;
    }

    function noteOf(html, isError) {
        return '<p class="entity-form-note' + (isError ? ' is-error' : '') + '">' + html + '</p>';
    }

    // 预览：只回答"列认对了没有"。它不算数 —— 用户这时候还没说要算。
    function drawPreview() {
        var host = $('batch-preview');
        if (!host) return;
        var tool = currentTool();
        var text = $('batch-paste') ? $('batch-paste').value : '';
        state.text = text;
        var table = parseTable(text);
        state.result = null;
        var exportBar = $('batch-export-bar');
        if (exportBar) exportBar.style.display = 'none';

        if (!tool) { host.innerHTML = ''; return; }
        if (!table.length) {
            host.innerHTML = noteOf('把表粘进上面的框（从 Excel / WPS / 飞书直接复制，带表头最好）。' +
                '先看到这里认出的列，再点「批量计算」 —— 认错了改一下就成，算错了要重发一遍工资条。');
            return;
        }
        var det = detectMapping(tool, table[0]);
        var hasHeader = det.matched > 0;
        var header = hasHeader ? table[0] : (tool.fields || []).map(function (f) { return f.label; });
        var matrix = hasHeader ? table.slice(1) : table;
        var mapping = state.mapping && state.mapping.length === header.length
            ? state.mapping : (hasHeader ? det.mapping : positionalMapping(tool, header.length));
        state.mapping = mapping;

        var rowsHtml = matrix.slice(0, PREVIEW_ROWS).map(function (cells) {
            return '<tr>' + header.map(function (_, i) {
                return '<td>' + esc(cells[i] === undefined ? '' : cells[i]) + '</td>';
            }).join('') + '</tr>';
        }).join('');

        var headHtml = '<tr>' + header.map(function (h, i) {
            return '<th>' +
                '<select class="ledger-status-select" data-batch-col="' + i + '" aria-label="第 ' + (i + 1) + ' 列是哪一项">' +
                '<option value=""' + (!mapping[i] ? ' selected' : '') + '>（不算）</option>' +
                (tool.fields || []).map(function (f) {
                    return '<option value="' + esc(f.key) + '"' + (mapping[i] === f.key ? ' selected' : '') +
                        '>' + esc(f.label) + '</option>';
                }).join('') +
                '</select>' +
                '<div class="ledger-meta">' + esc(String(h || '').trim() || ('第 ' + (i + 1) + ' 列')) + '</div>' +
                '</th>';
        }).join('') + '</tr>';

        var more = matrix.length > PREVIEW_ROWS
            ? noteOf('只预览前 ' + PREVIEW_ROWS + ' 行（共 ' + matrix.length + ' 行）：这一屏是用来核对列认对了没有的。')
            : '';
        var headNote = hasHeader
            ? ''
            : noteOf('表头一个字都没认出来，已按字段顺序对号入座 —— <b>请核对一遍</b>，' +
                '认错了不会有任何提示，最好在表里补一行表头（如「税前月薪」）。');
        var gate = canRun(matrix.length);
        var gateNote = gate.ok
            ? noteOf('共 ' + matrix.length + ' 行' + (gate.limit ? ' · 一次最多 ' + gate.limit + ' 行' : '') + '。')
            : noteOf('共 ' + matrix.length + ' 行，超过一次最多 ' + gate.limit + ' 行 —— ' +
                '这一版<b>不会替你只算前 ' + gate.limit + ' 行</b>：半份工资表看起来跟完整的一份一模一样，' +
                '发出去就是事故。删到 ' + gate.limit + ' 行以内再算，或'
                + txt(LEAD_COPY.needMore, '需要更多？留资，由顾问协助 ›'), true);

        host.innerHTML = headNote + gateNote +
            '<div style="overflow-x:auto"><table class="ledger-table"><thead>' + headHtml +
            '</thead><tbody>' + rowsHtml + '</tbody></table></div>' + more;
        bindPreview();
    }

    function bindPreview() {
        var host = $('batch-preview');
        if (!host) return;
        host.querySelectorAll('[data-batch-col]').forEach(function (sel) {
            sel.addEventListener('change', function () {
                var i = Number(sel.getAttribute('data-batch-col'));
                if (!state.mapping) return;
                state.mapping[i] = sel.value;
                // 改了映射就把映射到的旧占用清掉：两列都指着同一个字段，
                // 后写的那个赢，用户看到的是"我刚改的那列生效了"，另一列变回（不算）。
                state.mapping.forEach(function (v, j) { if (j !== i && v === sel.value && sel.value) state.mapping[j] = ''; });
                drawPreview();
            });
        });
    }

    function drawResult(res) {
        var host = $('batch-result');
        var status = $('batch-status');
        if (!host) return;
        if (!res.ok) {
            if (status) {
                status.innerHTML = res.reason === 'limit'
                    ? noteOf('本批 ' + res.count + ' 行，一次最多 ' + res.limit + ' 行 —— 一行都没算。' +
                        '<b>不会只算前 ' + res.limit + ' 行</b>：半份工资表与完整的一份长得一样，' +
                        '发出去就是事故。删到 ' + res.limit + ' 行以内再算，或'
                        + txt(LEAD_COPY.needMore, '需要更多？留资，由顾问协助 ›'), true)
                    : noteOf('没能算：' + (res.reason === 'empty' ? '没读到表格内容。' : '这个工具暂时不支持批量。'));
            }
            host.innerHTML = '';
            var bar = $('batch-export-bar');
            if (bar) bar.style.display = 'none';
            return;
        }
        var cols = resultColumns(res);
        var head = '<tr>' + cols.map(function (c) {
            return '<th class="' + (c.raw ? '' : 'num') + '">' + esc(c.label) + '</th>';
        }).join('') + '</tr>';
        var body = res.rows.map(function (r) {
            return '<tr' + (r.out ? '' : ' class="is-bad"') + '>' + rowCells(res, r, cols).map(function (cell, i) {
                return '<td class="' + (cols[i].raw ? '' : 'num') + '">' + esc(cell) + '</td>';
            }).join('') + '</tr>';
        }).join('');

        if (status) {
            status.innerHTML = noteOf('算完 ' + res.rows.length + ' 行' +
                (res.failed ? '，其中 <b>' + res.failed + ' 行算不出来</b>（表里那一行缺数或写成了文字）—— ' +
                    '它们原样留在表里，不会被悄悄跳过。' : '，全部算出来了。') +
                '本批结果<b>不写进计算历史</b>：要留痕就导出这张表。');
        }
        host.innerHTML = '<div style="overflow-x:auto"><table class="ledger-table"><thead>' + head +
            '</thead><tbody>' + body + '</tbody></table></div>';
        var bar = $('batch-export-bar');
        if (bar) bar.style.display = '';
    }

    function doRun() {
        var res = run({ toolId: state.toolId, text: state.text, mapping: state.mapping });
        state.result = res;
        state.mapping = res.mapping;    // run 可能补了默认映射（无表头时）：界面跟着对齐，不另存一份
        drawResult(res);
    }

    function init() {
        if (!$('batch-paste')) return;      // 没有这个页面（如未登录的精简 DOM）：整块不初始化
        fillToolSelect();
        var sel = $('batch-tool');
        if (sel) sel.addEventListener('change', function () {
            state.toolId = sel.value;
            state.mapping = null;           // 换工具 = 换字段，旧映射一条都不留
            drawPreview();
        });
        var paste = $('batch-paste');
        var timer = null;
        paste.addEventListener('input', function () {
            // 轻防抖：整表重画不算贵，但每敲一个字符都重画会让人觉得卡
            if (timer) clearTimeout(timer);
            timer = setTimeout(function () { state.mapping = null; drawPreview(); }, 250);
        });
        var runBtn = $('batch-run');
        if (runBtn) runBtn.addEventListener('click', function () { doRun(); });
        var exp = $('batch-export');
        if (exp) exp.addEventListener('click', function () {
            if (!state.result || !state.result.ok) return;
            downloadCsv(state.result);
        });
        var cp = $('batch-copy');
        if (cp) cp.addEventListener('click', function () {
            if (!state.result || !state.result.ok) return;
            copyTsv(state.result);
        });
        drawPreview();
    }

    // 自注册（与 entity-ui.js 同一套写法）：这个模块只在批量页存在时才有意义，
    // 找不到 `#batch-paste` 就是整块不初始化 —— 别的页面不为它付任何代价。
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
        else init();
    }

    window.EuriskoBatch = {
        FREE_ROWS: FREE_ROWS,
        DISCLAIMER: DISCLAIMER,
        // 纯函数层：守护测试 3 直接对这些做断言（它们不碰 DOM）
        parseTable: parseTable,
        detectMapping: detectMapping,
        positionalMapping: positionalMapping,
        cellToValue: cellToValue,
        isUnparsable: isUnparsable,
        cleanNumber: cleanNumber,
        canRun: canRun,
        computeRows: computeRows,
        run: run,
        resultColumns: resultColumns,
        csvOf: csvOf,
        tsvOf: tsvOf,
        // 界面层
        init: init,
        render: drawPreview
    };
})();
