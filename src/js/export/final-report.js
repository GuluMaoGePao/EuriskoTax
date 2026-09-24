// === 阶段10B：专业版「汇算清缴报告」PDF 完整编排 ===
//
// 与阶段10 计划 §5.1 对齐：复用 exportToPDF（html2canvas 分页截图 + jsPDF）的管线，
// 通过 options 注入自定义内容与截图前回调，产出专业版报告：
//   封面（品牌 + 报告标题 + 期间/生成日期）→ 收入与税前扣除明细（复用现预算表明细）
//   → 税负对比图（Chart.js 柱状，截图前绘制）→ 政策要点/注意事项 → 免责声明尾页
// 输出文件名：汇算清缴报告_YYYY-MM.pdf
//
// 免费/未登录分流：点击导出时若 not pro → 原样调用 exportToPDF（保留免费版既有能力，无倒退）。
//
// 可测性：pure 子对象暴露纯逻辑（文件名规则 / 税负结构 / 政策条目挑选 / 转义），Jest 直接测；
// DOM/Chart 渲染只在真实浏览器 exportFinalReport 路径执行。

(function () {
    'use strict';

    // 阶段17 17B-1（v1.47.0）：经营所得那份「专业版报告」随旧页面一并删除。
    // 向导有自己的导出路径（deep-wizard-ui 的 exportResult → exportToPDF/Word），不需要这条 kind。
    const KIND_COMPREHENSIVE = 'comprehensive';

    const META = {
        comprehensive: {
            legacyTitle: '个人年度个税预算表',
            // 17B-3（v1.49.0）：'step-result' 随综合所得旧页面删除，改为向导的结果卡 ——
            // 换过的旧 id 会让 exportToPDF 静默丢掉截图主体：报告只剩封面和免责页，且不报错。
            resultElId: 'dw-result-card',
            reportTitle: () => `${new Date().getFullYear()}年度综合所得汇算清缴报告`,
            kindLabel: '综合所得年度汇算测算'
        }
    };

    function pad(n) { return n < 10 ? '0' + n : '' + n; }

    // 文件名：汇算清缴报告_YYYY-MM.pdf
    function proFilename(now) {
        const d = now || new Date();
        return `汇算清缴报告_${d.getFullYear()}-${pad(d.getMonth() + 1)}.pdf`;
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function num(v) {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
    }

    function money(n) {
        return '¥' + Math.round(num(n)).toLocaleString('zh-CN');
    }

    // === 免费分流：当前用户是否专业版 ===
    function getCurrentUser() {
        try {
            if (typeof window !== 'undefined' && window.apiClient && typeof window.apiClient.getCurrentUser === 'function') {
                return window.apiClient.getCurrentUser() || null;
            }
            // fallback（apiClient 未暴露到 window 时）：双级读取——「保持登录状态」
            // 勾选写 localStorage，未勾选写 sessionStorage
            const raw = (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('current_user') : null)
                || (typeof localStorage !== 'undefined' ? localStorage.getItem('current_user') : null);
            return raw ? JSON.parse(raw) : null;
        } catch (e) { /* ignore */ }
        return null;
    }

    function isProUser() {
        const user = getCurrentUser();
        if (!user) return false;
        const planLib = (typeof window !== 'undefined') ? window.EuriskoPlan : null;
        if (!planLib || typeof planLib.isPro !== 'function') return false;
        return planLib.isPro(user.plan, user.plan_expires_at);
    }

    // === 纯数据：税负结构（柱状图数据源） ===
    function taxStructure(kind) {

        const R = (typeof window !== 'undefined' && window.calculationResults) || {};
        const id = R.incomeDetails || {};
        const dd = R.deductionDetails || {};
        const td = R.taxDetails || {};
        return {
            kind: KIND_COMPREHENSIVE,
            labels: ['年度收入总额', '减除费用与扣除', '应纳税所得额', '已预缴税额', '应纳税额', '税后净收入'],
            values: [num(id.total), num(dd.total), num(td.taxableIncome), num(td.prepaidTax), num(td.totalTax), num(td.netIncome)],
            note: '应纳税额含年终奖/劳务报酬等全部综合所得合并结果；若已预缴税额更大则年度汇算可退税。'
        };
    }

    // === 纯数据：政策要点挑选（报告「政策要点与注意事项」章节素材） ===
    // 优先级：1) 远端同步进来的 policy-point 条目（tag 标记）→ 2) 「政策法规」「汇算清缴」分类
    //        → 3) 分类相关的政策条目（id 以 policy_ 开头）。避免把普通计税问答误当政策。
    function pickPolicyItems(kind, limit) {
        const qa = (typeof window !== 'undefined' && window.TAX_ASSISTANT_QA) || [];
        if (!Array.isArray(qa)) return [];
        const max = limit || 6;
        const preferred = ['汇算清缴', '政策法规', '综合所得'];
        const result = [];
        const seen = {};

        function take(it) {
            if (result.length >= max) return false;
            if (!it || !it.id || !it.question || !it.answer) return false;
            if (seen[it.id]) return false;
            seen[it.id] = true;
            result.push(it);
            return true;
        }

        qa.forEach(function (it) {
            if (it && it.tag === 'policy-point' && preferred.indexOf(it.category) !== -1) take(it);
        });
        qa.forEach(function (it) {
            if (result.length >= max) return;
            if (!it || !it.category) return;
            if (it.category === '政策法规' || it.category === '汇算清缴') take(it);
        });
        qa.forEach(function (it) {
            if (result.length >= max) return;
            if (!it || !it.id || !it.category) return;
            if (preferred.indexOf(it.category) === -1) return;
            if (it.id.indexOf('policy_') === 0 || it.tag === 'policy-point') take(it);
        });
        return result;
    }

    // === HTML 片段构建 ===
    function coverHtml(meta, email) {
        const now = new Date();
        const dateLine = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
        return '<div class="pro-cover">' +
            '<div class="pro-cover-head">' +
            '<span class="pro-cover-logo">EuriskoTax 个税管家</span>' +
            '<span class="pro-cover-badge">专业版</span>' +
            '</div>' +
            '<div class="pro-cover-title">' + escapeHtml(meta.reportTitle()) + '</div>' +
            '<div class="pro-cover-sub">' + escapeHtml(meta.kindLabel) + '</div>' +
            '<div class="pro-cover-meta">' +
            '测算期间：' + now.getFullYear() + ' 年度&nbsp;&nbsp;·&nbsp;&nbsp;生成日期：' + dateLine +
            (email ? '&nbsp;&nbsp;·&nbsp;&nbsp;报告对象：' + escapeHtml(email) : '') +
            '</div>' +
            '<div class="pro-cover-foot">本报告由 EuriskoTax 根据输入参数自动测算生成，仅供个人税务规划参考</div>' +
            '</div>';
    }

    function renderAnswerText(answer) {
        // answer 内 \n• 条目 → 换行圆点列表
        return escapeHtml(answer).replace(/\n•/g, '<br>•').replace(/\n/g, '<br>');
    }

    function policySectionHtml(kind) {
        const items = pickPolicyItems(kind, 6);
        if (!items.length) {
            return '<div class="pro-section">' +
                '<div class="pro-section-title">政策要点与注意事项</div>' +
                '<p class="pro-policy-a">暂无可展示政策要点。请以税务机关最新公告与申报界面提示为准。</p>' +
                '</div>';
        }
        let list = '';
        items.forEach(function (it) {
            list += '<div class="pro-policy-item">' +
                '<div class="pro-policy-q">' + escapeHtml(it.question) + '</div>' +
                '<div class="pro-policy-a">' + renderAnswerText(it.answer) + '</div>' +
                '</div>';
        });
        return '<div class="pro-section">' +
            '<div class="pro-section-title">政策要点与注意事项</div>' +
            list +
            // S-05：去掉「（专业版）」与「官方」—— 政策要点对所有用户开放，写专业版等于卖免费能力；
            // 「官方」属暗示背书。文案取自单一真源（copy-standard.js）。
            '<p class="pro-policy-src">' + escapeHtml(policySourceText()) + '</p>' +
            '</div>';
    }

    // 文案单一真源（docs/guides/user-facing-copy-standard.md）：取不到常量时回落同义兜底
    var COPY = (typeof window !== 'undefined' && window.CopyStandard) ? window.CopyStandard : {};
    var DISCLAIMER_COPY = COPY.DISCLAIMER || {};
    function copyText(v, fallback) { return v || fallback; }

    function policySourceText() {
        return copyText(DISCLAIMER_COPY.policySource,
            '以上要点来源于内置政策知识库，以国家税务总局及主管税务机关最新发布为准。');
    }

    // E 型 · 报告四条：现状即标准，逐字不得改（守护断言 6）
    function disclaimerHtml() {
        var lines = DISCLAIMER_COPY.report || [
            '1. 本报告由 EuriskoTax 根据您填写的测算参数自动生成，结果仅供参考，不构成任何税务、法律或投资建议。',
            '2. 测算基于当前已收录的税收政策与税率表，政策如有调整以国家税务总局及主管税务机关发布为准。',
            '3. 如用于年度汇算清缴申报，请以「个人所得税」APP 或税务机关申报系统核定结果为准；如有疑问请咨询专业税务人员或 12366。',
            '4. 本工具不替代法定申报义务，测算误差导致的任何损失，工具提供方不承担责任。'
        ];
        return '<div class="pro-disclaimer">' +
            '<div class="pro-section-title">免责声明</div>' +
            lines.map(function (t) { return '<p>' + t + '</p>'; }).join('') +
            '</div>';
    }

    function proStyles() {
        return '<style>' +
            '.pro-cover{height:1040px;box-sizing:border-box;padding:64px 56px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;color:#111827;}' +
            '.pro-cover-head{width:100%;display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #2b6cb0;padding-bottom:16px;margin-bottom:80px;}' +
            '.pro-cover-logo{font-size:18px;font-weight:bold;color:#2b6cb0;}' +
            '.pro-cover-badge{font-size:12px;color:#b45309;border:1px solid #fcd34d;background:#fef3c7;padding:3px 10px;border-radius:12px;}' +
            '.pro-cover-title{font-size:34px;font-weight:bold;line-height:1.5;margin-bottom:16px;}' +
            '.pro-cover-sub{font-size:16px;color:#6b7280;margin-bottom:48px;}' +
            '.pro-cover-meta{font-size:13px;color:#4b5563;line-height:1.8;}' +
            '.pro-cover-foot{margin-top:96px;font-size:11px;color:#9ca3af;}' +
            '.pro-section{margin-top:36px;}' +
            '.pro-section-title{font-size:18px;font-weight:bold;color:#111827;border-bottom:2px solid #2b6cb0;padding-bottom:6px;margin-bottom:14px;}' +
            '.pro-policy-item{margin-bottom:12px;}' +
            '.pro-policy-q{font-weight:bold;color:#111827;margin-bottom:4px;font-size:13px;}' +
            '.pro-policy-a{font-size:12px;line-height:1.8;color:#374151;}' +
            '.pro-policy-src{margin-top:10px;font-size:11px;color:#9ca3af;}' +
            '.pro-chart-box{width:740px;height:330px;margin:16px 0;}' +
            '.pro-chart-note{font-size:11px;color:#6b7280;line-height:1.7;}' +
            '.pro-disclaimer{margin-top:44px;padding-top:4px;font-size:11px;color:#6b7280;line-height:1.9;}' +
            '</style>';
    }

    // 专业报告 HTML：封面 + 复用明细核心 + 政策要点 + 免责声明
    // meta 可省略（默认按 kind 解析），便于单测直接构造
    function buildProDocHtml(kind, meta) {
        meta = meta || META[kind] || META.comprehensive;
        const email = (getCurrentUser() || {}).email || '';
        const core = (typeof generateWordDocumentContent === 'function')
            ? generateWordDocumentContent(meta.legacyTitle)
            : '<p>（明细内容生成失败）</p>';
        return proStyles() +
            coverHtml(meta, email) +
            core +
            '<div class="pro-section"><div class="pro-section-title">税负结构对比</div>' +
            '<div class="pro-chart-box"><canvas id="pro-tax-chart" width="740" height="320"></canvas></div>' +
            '<p class="pro-chart-note">' + escapeHtml(taxStructure(kind).note) + '</p>' +
            '</div>' +
            policySectionHtml(kind) +
            disclaimerHtml();
    }

    // === 截图前回调：绘制税负对比图 ===
    function renderProChart(kind, container) {
        if (typeof window === 'undefined' || !window.Chart) return; // Chart.js 未加载时跳过（不阻塞导出）
        const canvas = container && container.querySelector ? container.querySelector('#pro-tax-chart') : null;
        if (!canvas) return;
        const structure = taxStructure(kind);

        // 在每个柱上方标注数值（Chart.js 未内置 datalabels）
        const valueLabel = {
            id: 'valueLabel',
            afterDatasetsDraw: function (chart) {
                const ctx = chart.ctx;
                const meta = chart.getDatasetMeta(0);
                ctx.save();
                ctx.font = '11px sans-serif';
                ctx.fillStyle = '#374151';
                ctx.textAlign = 'center';
                meta.data.forEach(function (bar, i) {
                    ctx.fillText(Math.round(chart.data.datasets[0].data[i]).toLocaleString('zh-CN'), bar.x, bar.y - 6);
                });
                ctx.restore();
            }
        };

        // 一次创建可能残留旧实例（重复导出），先销毁
        const key = '__proChart';
        if (container[key] && typeof container[key].destroy === 'function') container[key].destroy();
        container[key] = new window.Chart(canvas, {
            type: 'bar',
            data: {
                labels: structure.labels,
                datasets: [{
                    label: '金额（元）',
                    data: structure.values,
                    backgroundColor: '#3b82f6',
                    hoverBackgroundColor: '#1d4ed8',
                    borderRadius: 4,
                    barPercentage: 0.62,
                    categoryPercentage: 0.7
                }]
            },
            options: {
                responsive: false,
                animation: false,
                layout: { padding: { top: 22 } },
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: false }
                },
                scales: {
                    y: { beginAtZero: true, ticks: { callback: function (v) { return Math.round(v / 10000) + '万'; } } },
                    x: { grid: { display: false } }
                }
            },
            plugins: [valueLabel]
        });
    }

    // === 导出入口（免费/专业分流） ===
    function legacyPdf(kind) {
        const meta = META[kind] || META.comprehensive;
        exportToPDF(meta.resultElId, meta.legacyTitle);
    }

    // === 合规护栏：与 lead-touchpoints.js 同款双保险 ===
    // 谈薪（reverse）永不出现「留资换权益」钩子；白名单之外一律回落标准导出。
    var REPORT_ALLOWED_TYPES = ['comprehensive'];
    var REPORT_BLOCKED_TYPES = ['reverse'];

    function hookAllowed(kind) {
        return REPORT_BLOCKED_TYPES.indexOf(kind) === -1
            && REPORT_ALLOWED_TYPES.indexOf(kind) !== -1;
    }

    // === 版本选择弹窗（Phase 3.5）：给「两个版本」，不给一道障碍 ===
    // 合规：弹窗内**零购买语义**（不出现 购买 / 支付 / 价格 / ¥ / 订阅），
    //      收款发生在站外，站内只有「留资 → 发权益码」（§1.5⑨）。
    var DIALOG_ID = 'report-version-dialog';

    function dialogEl() {
        var dlg = document.getElementById(DIALOG_ID);
        if (dlg) return dlg;
        dlg = document.createElement('div');
        dlg.id = DIALOG_ID;
        dlg.className = 'fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 hidden opacity-0 transition-opacity duration-300';
        dlg.innerHTML = [
            '<div role="dialog" aria-modal="true" aria-labelledby="report-version-title"',
            ' class="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden transform scale-95 transition-transform duration-300">',
            '  <div class="px-6 pt-6 pb-3">',
            '    <h3 id="report-version-title" class="text-lg font-bold text-slate-900">选择导出版本</h3>',
            '  </div>',
            '  <div class="px-6 space-y-3">',
            '    <button type="button" data-rv="standard" class="w-full text-left rounded-xl border border-slate-200 p-4 transition-colors hover:border-slate-300">',
            '      <div class="font-semibold text-slate-900">标准版</div>',
            '      <div class="mt-1 text-sm text-slate-600">你正在看的完整测算结果，PDF 格式，现在即可导出。</div>',
            '    </button>',
            '    <button type="button" data-rv="pro" class="w-full text-left rounded-xl border border-amber-200 bg-amber-50/60 p-4 transition-colors hover:border-amber-300">',
            '      <div class="font-semibold text-slate-900">精装版</div>',
            '      <div class="mt-1 text-sm text-slate-600">封面 + 政策要点 + 税负结构图表，可直接交付给他人。</div>',
            // PAY-13：不再说「属专业版权益」—— 那是档位营销；交付版的获取方式只有留资一条
            '      <div class="mt-2 text-xs text-amber-700">需要交付版？留资，由顾问协助 ›</div>',
            '    </button>',
            '  </div>',
            '  <div class="px-6 py-4">',
            '    <button type="button" data-rv="cancel" class="w-full py-2 text-sm text-slate-500">取消</button>',
            '  </div>',
            '</div>'
        ].join('');
        document.body.appendChild(dlg);
        return dlg;
    }

    function closeDialog(dlg) {
        if (typeof window.closeModal === 'function') { window.closeModal(dlg); return; }
        dlg.classList.add('opacity-0');
        dlg.classList.add('hidden');
    }

    // 留资换权益（钩子）。LeadModal 不可用时兜底为标准导出 —— **免费必须能导**。
    function openEntitlement(kind) {
        if (!hookAllowed(kind)) { legacyPdf(kind); return; }
        if (window.LeadModal && typeof window.LeadModal.open === 'function') {
            window.LeadModal.open({ source: 'report_pro', type: kind });
            return;
        }
        legacyPdf(kind);
    }

    function openVersionDialog(kind) {
        var dlg = dialogEl();
        dlg.dataset.kind = kind;
        if (dlg.dataset.rvBound !== '1') {
            dlg.dataset.rvBound = '1';
            dlg.addEventListener('click', function (e) { if (e.target === dlg) closeDialog(dlg); });
            var btns = dlg.querySelectorAll('[data-rv]');
            for (var i = 0; i < btns.length; i++) {
                btns[i].addEventListener('click', function () {
                    var v = this.getAttribute('data-rv');
                    var k = dlg.dataset.kind || 'comprehensive';
                    closeDialog(dlg);
                    if (v === 'standard') legacyPdf(k);
                    else if (v === 'pro') openEntitlement(k);
                });
            }
        }
        if (typeof window.openModal === 'function') window.openModal(dlg);
        else {
            dlg.classList.remove('hidden');
            setTimeout(function () { dlg.classList.remove('opacity-0'); }, 10);
        }
    }

    function exportFinalReport(kind) {
        const meta = META[kind] || META.comprehensive;
        if (isProUser()) {
            exportToPDF(meta.resultElId, meta.reportTitle(), {
                filename: proFilename(),
                contentBuilder: function () { return buildProDocHtml(kind, meta); },
                beforeCapture: function (container) { renderProChart(kind, container); }
            });
            return;
        }
        // 非专业版：给「两个版本」的选择，而不是一道障碍（§1.5⑨）。
        // 精装版的价值说明在点导出「之后、选版之前」就可见 —— 即 Phase 3.5 的「付费预期」。
        openVersionDialog(kind);
    }

    window.EuriskoReport = {
        proFilename: proFilename,
        taxStructure: taxStructure,
        pickPolicyItems: pickPolicyItems,
        isProUser: isProUser,
        buildProDocHtml: buildProDocHtml,
        exportFinalReport: exportFinalReport,
        // 合规护栏对外暴露：与 lead-touchpoints.js 的 ALLOWED/BLOCKED 同款，
        // 供 verify:local 与 jest 断言「reverse 永不出现钩子」，防止后续迭代失守。
        REPORT_ALLOWED_TYPES: REPORT_ALLOWED_TYPES,
        REPORT_BLOCKED_TYPES: REPORT_BLOCKED_TYPES,
        hookAllowed: hookAllowed,
        pure: {
            proFilename: proFilename,
            taxStructure: taxStructure,
            pickPolicyItems: pickPolicyItems,
            escapeHtml: escapeHtml,
            num: num,
            money: money,
            isProUser: isProUser,
            hookAllowed: hookAllowed
        }
    };
})();
