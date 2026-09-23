// 结果页「各项数额」条（阶段19-4 顺延 · v1.99.0）
//
// plan 原文（§3.5 · 4 结果可视化）：「引入 Chart.js 轻量图表（已在依赖里，final-report.js
// 已用）—— 速算器结果：横向条形『收入构成 → 扣除 → 应税 → 税额』四段瀑布（手机折叠）」。
//
// 落地时改了两处，理由写在这里，免得后人按字面 repeater：
//
//   ① **不引入 Chart.js**：它在仓库里根本不存在（全仓 0 处引用，plan 那句"已在依赖里"是错的，
//      `final-report.js` 也没用它）。为一张条引入一个 canvas 库的代价是：新增 CDN 依赖、
//      深色模式要重画、24 张截图基线全部重拍、jsdom 里测不到（canvas 画不出东西）。
//      这里用纯 CSS 横条（div + width%），颜色走 tokens.css 的 --c-brand 等令牌 ——
//      深色 / 响应式 / 降级全部自动跟随，且能被单测钉住。
//
//   ② **不做四段瀑布，做「各项数额」**：瀑布要靠语义认段（哪一段是减项、哪一段是基数），
//      41 个工具（20 个速算器 + 21 个完整测算）没法通用给出 —— 硬配一份就是每个工具一份
//      映射，那正是 19-5b 那条债的由来（一份映射迟早与界面上正在显示的那个数漂移，
//      v1.98.0 清的就是它）。所以这张条**不猜语义**：只画各项金额的相对大小
//      （最长一项 = 100%），主结果用品牌色标出来，其余中性灰。
//
// 两条纪律（与 v1.98.0 的方案库同一套）：
//   - 画不出就不画：少于两根没有"比"的对象，一根条除了占地方什么也没说；
//   - 不补数：负数与 0 画不出长度，直接不画，不拿 0 充一根条。

(function () {
    'use strict';

    var MAX_BARS = 5;

    function num(v) {
        var n = Number(v);
        return Number.isFinite(n) ? n : null;
    }

    function esc(s) {
        return String(s === undefined || s === null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // 兜底格式化：正常路径走 toolbox 那份 fmtValue（deep 与速算器都已加载它），
    // 这里只保证 toolbox 不在时（单测 / 脚本顺序异常）不至于把 undefined 画到页面上。
    function defaultFmt(value, kind) {
        var TB = (typeof window !== 'undefined') ? window.EuriskoToolbox : null;
        if (TB && typeof TB.fmtValue === 'function') return TB.fmtValue(value, kind);
        var n = num(value);
        if (n === null) return '-';
        return '¥' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    // 纯函数：结果对象 → 条形数据
    function buildBars(out, opts) {
        var o = out || {};
        var max = (opts && opts.max) || MAX_BARS;
        var cands = [];
        var seen = {};

        function push(label, value) {
            if (!label || seen[label]) return;
            var n = num(value);
            if (n === null || n <= 0) return;      // 负数与 0 画不出长度 —— 不画，不拿 0 充一根条
            seen[label] = true;
            cands.push({ label: String(label), value: n });
        }

        var primary = o.primary || {};
        var primaryLabel = '';
        // 主结果只在它是金额时才上条：把「实际税负率 13%」和「销项税额 ¥3,000」
        // 画在同一根尺子上比大小，是在制造一个不存在的比较。
        //
        // 但主结果**为 0 也要上条**：它是这一页的主角，「这个季度不用交税」本身就是一条结论，
        // 把它滤掉等于把结论藏起来（实测：增值税小规模默认入参下主结果就是 0，免征）。
        // 明细行里的 0 仍然不上条 —— 那里一堆空条只是噪音。
        if (primary.label && primary.kind === 'money') {
            var pn = num(primary.value);
            if (pn !== null && pn >= 0) {
                primaryLabel = String(primary.label);
                seen[primaryLabel] = true;
                cands.push({ label: primaryLabel, value: pn });
            }
        }
        (Array.isArray(o.rows) ? o.rows : []).forEach(function (r) {
            if (!r || r.kind !== 'money') return;   // 只取金额行：税率 / 月份数混进来没有刻度可言
            push(r.label, r.value);
        });

        if (cands.length < 2) return { bars: [], basis: 0, truncated: false };

        var basis = 0;
        cands.forEach(function (c) { if (c.value > basis) basis = c.value; });

        // 主结果固定排第一（它是这一页的主角），其余按金额从大到小
        var head = cands.filter(function (c) { return c.label === primaryLabel; });
        var rest = cands.filter(function (c) { return c.label !== primaryLabel; })
            .sort(function (a, b) { return b.value - a.value; });
        var list = head.concat(rest).slice(0, max);

        var bars = list.map(function (c) {
            return {
                label: c.label,
                value: c.value,
                // 最小 2%：极小的项不至于退化成"看起来没画"
                width: basis ? Math.max(2, Math.round(c.value / basis * 100)) : 0,
                primary: c.label === primaryLabel
            };
        });
        return { bars: bars, basis: basis, truncated: cands.length > list.length };
    }

    function barsHtml(out, opts) {
        var res = buildBars(out, opts);
        if (!res.bars.length) return '';
        var fmt = (opts && opts.fmt) || defaultFmt;

        var rows = res.bars.map(function (b) {
            return '<div class="result-bar">' +
                '<div class="result-bar__top">' +
                    '<span class="result-bar__label">' + esc(b.label) + '</span>' +
                    '<span class="result-bar__value">' + esc(fmt(b.value, 'money')) + '</span>' +
                '</div>' +
                '<div class="result-bar__line">' +
                    '<span class="result-bar__fill' + (b.primary ? '' : ' result-bar__fill--plain')
                        + '" style="width:' + b.width + '%"></span>' +
                '</div>' +
            '</div>';
        }).join('');

        // 默认展开、可收起：折叠的本意是别占地方，藏起来（默认收起）则是把信息拿走
        return '<details class="result-bars-box mt-4" open>' +
            '<summary class="result-bars__summary">' +
                '<span><i class="fa fa-bar-chart mr-2"></i>各项数额</span>' +
                '<span class="result-bars__hint">可收起</span>' +
            '</summary>' +
            '<div class="result-bars mt-3">' + rows + '</div>' +
            '<p class="result-bars__note">条形只比大小（最长一项 = 100%），各项之间不构成加减关系'
                + (res.truncated ? '；只列金额最大的 ' + res.bars.length + ' 项' : '') + '。</p>' +
        '</details>';
    }

    window.EuriskoResultBars = {
        pure: { buildBars: buildBars },
        html: barsHtml
    };
})();
