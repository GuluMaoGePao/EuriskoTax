// === 阶段16：速算器结果导出 PDF（把深度流程独享的能力下放） ===
//
// 为什么值得做：「可保存历史 / 可导出 PDF」原先只属于 4 个多步骤流程 —— 20 个速算器算完
// 只能看，用户想把结果交给同事或留存，只能自己截图。保存历史已随工具页下放
// （toolbox-ui.saveToHistory），导出 PDF 是最后一块。两块补齐之后，按实现形态命名的
// 「深度测算」分组名就该退休了 —— 剩下的差别只是填多填少，不是能不能存、能不能导出。
//
// 与既有管线同源，不另起炉灶：
//   截图走 Capture.captureHtml（与分享图、专业版报告共用一份 html2canvas 配置），
//   排版走 navigation-ui.exportToPDF 的 contentBuilder 通道（同一套 A4 分页与错误提示）。
//   这里的职责只有一件：把 tool / values / out 编成一份能看的文档。
//
// 可测性：pure 子对象暴露纯逻辑（文件名 / 文档 HTML / 输入回显 / 转义），Jest 直接测；
// DOM 与 jsPDF 只在 exportQuickResult 的真实导出路径执行。

(function () {
    'use strict';

    function pad(n) { return n < 10 ? '0' + n : '' + n; }

    function num(v) {
        var n = Number(v);
        return isFinite(n) ? n : 0;
    }

    function money(n) {
        return '¥' + Math.round(num(n)).toLocaleString('zh-CN');
    }

    // 与工具箱结果区同一套显示口径（money / percent / 原样），避免「页面 ¥1,234 报告里 1234」
    function fmtValue(value, kind) {
        if (kind === 'money') return money(value);
        if (kind === 'percent') return (num(value) * 100).toFixed(2) + '%';
        return (value === undefined || value === null || value === '') ? '—' : String(value);
    }

    // 输入回显：select 必须回显**选项文字**而不是内部值 —— 用户看 'general' 不知道自己选了什么
    function fmtInput(field, raw) {
        if (!field) return '—';
        if (field.type === 'select') {
            var opts = field.options || [];
            for (var i = 0; i < opts.length; i += 1) {
                if (String(opts[i].value) === String(raw)) return opts[i].label;
            }
            return String(raw);
        }
        if (field.type === 'switch') return raw ? '是' : '否';
        if (field.type === 'percent') return num(raw) + '%';
        if (field.type === 'money') return money(raw);
        return String(raw);
    }

    function esc(s) {
        return String(s === undefined || s === null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function filename(tool, now) {
        var d = now || new Date();
        var name = (tool && tool.name) ? String(tool.name).replace(/[\\/:*?"<>|]/g, '') : '测算结果';
        return name + '_测算结果_' + d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + '.pdf';
    }

    // 政策时效：只问 tax-registry，不自己算日期（阶段15 原则 6）
    function policyLine(tool) {
        var key = tool && tool.policyKey;
        if (!key || !window.EuriskoTaxRegistry || typeof window.EuriskoTaxRegistry.statusOf !== 'function') return '';
        try {
            var s = window.EuriskoTaxRegistry.statusOf(key);
            if (!s) return '';
            if (s.expired) return '政策已过期 · 结果仅供参考';
            if (s.expiresOn) return '政策有效期至 ' + s.expiresOn;
            return '长期有效';
        } catch (e) {
            return '';
        }
    }

    function styles() {
        return '<style>' +
            '.qr{width:760px;padding:24px 28px;background:#fff;color:#111827;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;}' +
            '.qr-bd{display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid #1e40af;padding-bottom:10px;margin-bottom:18px;}' +
            '.qr-logo{font-size:15px;font-weight:700;color:#1e40af;}' +
            '.qr-date{font-size:12px;color:#6b7280;}' +
            '.qr-title{font-size:20px;font-weight:700;margin:0 0 4px;}' +
            '.qr-sub{font-size:13px;color:#6b7280;margin-bottom:16px;}' +
            '.qr-main{background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:14px 16px;margin-bottom:16px;}' +
            '.qr-main-k{font-size:12px;color:#1e40af;}' +
            '.qr-main-v{font-size:26px;font-weight:700;color:#1e3a8a;margin-top:4px;}' +
            '.qr-h{font-size:14px;font-weight:700;margin:18px 0 8px;padding-left:8px;border-left:3px solid #1e40af;}' +
            'table{width:100%;border-collapse:collapse;font-size:13px;}' +
            'td{padding:7px 8px;border-bottom:1px solid #e5e7eb;}' +
            'td.qr-k{color:#6b7280;width:52%;}' +
            'td.qr-v{text-align:right;font-weight:600;}' +
            '.qr-note{font-size:12.5px;color:#374151;background:#f9fafb;border-radius:8px;padding:10px 12px;margin-top:10px;}' +
            'ul{margin:0;padding-left:18px;font-size:12.5px;color:#374151;}' +
            'li{margin:4px 0;}' +
            '.qr-foot{margin-top:20px;padding-top:10px;border-top:1px solid #e5e7eb;font-size:11.5px;color:#9ca3af;line-height:1.7;}' +
            '</style>';
    }

    // 政策依据：与结果页同一份数据源（registry.basisOf），页面绝不自己写文号。
    // 同样不给外链 —— 打印出来的 PDF 点不了链接，用户要的只是「按哪条政策算的」这一行文号。
    function basisHtml(tool) {
        var reg = window.EuriskoTaxRegistry;
        var key = tool && tool.policyKey;
        if (!key || !reg || typeof reg.basisOf !== 'function') return '';
        try {
            var list = reg.basisOf(key) || [];
            if (!list.length) return '';
            return '<div class="qr-h">政策依据</div><ul>' + list.map(function (b) {
                return '<li>' + esc([b.doc, b.title].filter(Boolean).join(' —— ')) + '</li>';
            }).join('') + '</ul>';
        } catch (e) {
            return '';
        }
    }

    function buildDocHtml(tool, values, out, now) {
        if (!tool || !out) return '';
        var d = now || new Date();
        var dateStr = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
        var vals = values || {};

        var rowsHtml = (out.rows || []).map(function (r) {
            return '<tr><td class="qr-k">' + esc(r.label) + '</td>' +
                '<td class="qr-v">' + esc(fmtValue(r.value, r.kind)) + '</td></tr>';
        }).join('');

        // 只回显**当前可见**的字段：条件字段隐藏时（如小规模没有进项），报告里也不该出现
        var fields = (tool.fields || []).filter(function (f) {
            if (!f.when) return true;
            return f.when.in.indexOf(vals[f.when.key]) !== -1;
        });
        var inputsHtml = fields.map(function (f) {
            return '<tr><td class="qr-k">' + esc(f.label) + '</td>' +
                '<td class="qr-v">' + esc(fmtInput(f, vals[f.key])) + '</td></tr>';
        }).join('');

        var pitfalls = (tool.pitfalls || []).length
            ? '<div class="qr-h">易错口径</div><ul>' +
                tool.pitfalls.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul>'
            : '';

        var policy = policyLine(tool);
        var basis = basisHtml(tool);

        return styles() +
            '<div class="qr">' +
            '<div class="qr-bd"><span class="qr-logo">EuriskoTax 税费计算器</span>' +
            '<span class="qr-date">生成日期：' + esc(dateStr) + '</span></div>' +
            '<h1 class="qr-title">' + esc(tool.name) + '</h1>' +
            (tool.subtitle ? '<div class="qr-sub">' + esc(tool.subtitle) + '</div>' : '') +
            '<div class="qr-main">' +
            '<div class="qr-main-k">' + esc(out.primary ? out.primary.label : '测算结果') + '</div>' +
            '<div class="qr-main-v">' + esc(out.primary ? fmtValue(out.primary.value, out.primary.kind) : '—') + '</div>' +
            '</div>' +
            (rowsHtml ? '<div class="qr-h">结果拆解</div><table>' + rowsHtml + '</table>' : '') +
            (inputsHtml ? '<div class="qr-h">测算输入</div><table>' + inputsHtml + '</table>' : '') +
            (out.note ? '<div class="qr-note">' + esc(out.note) + '</div>' : '') +
            pitfalls +
            basis +
            (policy ? '<div class="qr-note">政策时效：' + esc(policy) + '</div>' : '') +
            '<div class="qr-foot">本报告由 EuriskoTax 在本地浏览器完成计算并生成，计算过程不上传任何数据；' +
            '结果为测算参考，实际纳税请以税务机关核算为准。</div>' +
            '</div>';
    }

    function notify(msg) {
        if (typeof showAlert === 'function') showAlert(msg);
        else if (typeof window !== 'undefined' && window.console) console.warn('[QuickReport] ' + msg);
    }

    // 导出入口：返回 true 表示已交给导出管线（异步落盘），false 表示没导出成
    function exportQuickResult(tool, values, out) {
        if (!tool || !out || !out.primary) {
            notify('请先算出结果，再导出 PDF');
            return false;
        }
        if (typeof window.Capture === 'undefined' || typeof window.Capture.captureHtml !== 'function') {
            notify('导出组件未就绪，请刷新页面后重试');
            return false;
        }
        if (typeof exportToPDF !== 'function') {
            notify('导出组件未就绪，请刷新页面后重试');
            return false;
        }
        try {
            exportToPDF(null, tool.name, {
                contentBuilder: function () { return buildDocHtml(tool, values, out); },
                filename: filename(tool),
                skipResultCheck: true
            });
            return true;
        } catch (e) {
            notify('导出失败，请稍后重试');
            return false;
        }
    }

    window.EuriskoQuickReport = {
        buildDocHtml: buildDocHtml,
        exportQuickResult: exportQuickResult,
        filename: filename,
        fmtInput: fmtInput,
        fmtValue: fmtValue,
        policyLine: policyLine,
        basisHtml: basisHtml,
        pure: {
            buildDocHtml: buildDocHtml,
            basisHtml: basisHtml,
            filename: filename,
            fmtInput: fmtInput,
            fmtValue: fmtValue,
            money: money,
            esc: esc
        }
    };
})();
