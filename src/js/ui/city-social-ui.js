// === 阶段14 C2：参保城市选择器 UI ===
//
// 职责：把「社保基数下限」从全国平均值变成按参保城市取值后，用户需要能表达「我在哪个城市参保」。
//       本模块在正向/反向/经营三个页面的「社保缴费基数」字段下方各注入一个城市下拉，
//       三处下拉共享同一份选择（参保城市是用户属性，不是页面属性）。
//
// 为什么用注入而不是写死在三处 HTML：
//   三个页面的社保区块结构一致，注入可以让「选项来源、回落提示、联动重算」只有一份实现，
//   避免三处标记各自漂移；index.html 也不必新增 3 段近似重复的标记。
//
// 联动行为：
//   - 切换城市 → CitySocial.selectCity()（写 localStorage + 覆盖 MIN_* 全局量）
//     → 刷新三处下拉 → 重新跑基数合规提示（validate*Base）
//   - 城市参数异步同步完成（'euriskotax:city-social-updated'）→ 重建选项并重新提示
//   - 参数不可用（离线且无缓存）→ 下拉禁用并说明「按全国口径」，绝不静默给错口径
(function () {
    'use strict';

    // 三个页面：prefix 与 helper-functions.js 的 validateSocialSecurityBase(prefix) 对应
    var PAGES = [
        { prefix: '', baseId: 'social-security-base', selectId: 'social-city-select' },
        { prefix: 'reverse', baseId: 'reverse-social-security-base', selectId: 'reverse-social-city-select' },
        { prefix: 'business', baseId: 'business-social-security-base', selectId: 'business-social-city-select' }
    ];

    var GROUP_CLASS = 'form-group';
    var SELECT_CLASS = 'input-field';

    function $(id) {
        return typeof document !== 'undefined' ? document.getElementById(id) : null;
    }

    function sync() {
        return (typeof window !== 'undefined' && window.CitySocial) || null;
    }

    function esc(s) {
        return String(s === null || s === undefined ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function money(v) {
        if (v === null || v === undefined || !isFinite(Number(v))) return '不限';
        return Number(v).toLocaleString('zh-CN') + ' 元/月';
    }

    // 兜底文案：没有城市参数时明确告知用户当前是「全国口径」，而不是假装已按城市计算
    var GLOBAL_NOTE = '当前按全国平均口径校验。联网后可选择参保城市，按当地缴费基数下限校验。';

    function buildGroup(page) {
        var baseEl = $(page.baseId);
        if (!baseEl) return null;
        // 锚点：基数输入所在的 form-group，把城市选择器插在它之后
        var anchor = baseEl.closest ? baseEl.closest('.' + GROUP_CLASS) : null;
        if (!anchor || !anchor.parentNode) return null;
        if ($(page.selectId)) return $(page.selectId).closest('.' + GROUP_CLASS);

        var group = document.createElement('div');
        group.className = GROUP_CLASS;
        group.setAttribute('data-city-social-group', page.prefix || 'forward');
        group.innerHTML = '<label class="label" for="' + page.selectId + '">参保城市</label>'
            + '<div class="flex items-center space-x-2">'
            + '<select id="' + page.selectId + '" class="' + SELECT_CLASS + '"></select>'
            + '</div>'
            + '<div id="' + page.selectId + '-hint" class="text-xs text-gray-500 mt-1"></div>';
        anchor.parentNode.insertBefore(group, anchor.nextSibling);
        return group;
    }

    function renderOptions(select, cities, selected) {
        var html = '<option value="">未指定（按默认城市）</option>';
        cities.forEach(function (c) {
            html += '<option value="' + esc(c.code) + '"'
                + (c.code === selected ? ' selected' : '')
                + '>' + esc(c.name) + '（' + esc(c.code) + '）</option>';
        });
        select.innerHTML = html;
        select.value = selected || '';
    }

    function renderHint(page, cities) {
        var hint = $(page.selectId + '-hint');
        if (!hint) return;
        if (!cities.length) {
            hint.className = 'text-xs text-gray-500 mt-1';
            hint.textContent = GLOBAL_NOTE;
            return;
        }
        var active = (typeof window !== 'undefined' && window.CITY_SOCIAL_ACTIVE) || null;
        if (!active) {
            hint.className = 'text-xs text-gray-500 mt-1';
            hint.textContent = GLOBAL_NOTE;
            return;
        }
        var text = '按「' + active.name + '」口径：社保基数下限 ' + money(active.socialBaseMin)
            + '，公积金基数下限 ' + money(active.housingBaseMin) + '。';
        var opts = active.housingFundRateOptions || [];
        if (opts.length) text += '公积金比例可选 ' + opts.join('% / ') + '%。';

        var dropped = active.requested && !active.matched;
        hint.className = dropped ? 'text-xs text-amber-600 mt-1' : 'text-xs text-gray-500 mt-1';
        if (dropped) {
            text = '所选城市「' + active.requested + '」已不在最新参数中，' + text;
        }
        hint.textContent = text;
    }

    // 参数变化后重跑合规提示：基数不变但下限可能变了（例如切到高基数城市）
    function revalidate() {
        PAGES.forEach(function (page) {
            try {
                if (typeof validateSocialSecurityBase === 'function') validateSocialSecurityBase(page.prefix);
                if (typeof validateHousingFundBase === 'function') validateHousingFundBase(page.prefix);
            } catch (e) { /* 页面未加载对应元素时忽略 */ }
        });
    }

    function render() {
        var api = sync();
        if (!api) return;
        var cities = api.getCities();
        var selected = api.getSelectedCode();
        PAGES.forEach(function (page) {
            var select = $(page.selectId);
            if (!select) return;
            renderOptions(select, cities, selected);
            select.disabled = !cities.length;
            renderHint(page, cities);
        });
    }

    function onChange(event) {
        var api = sync();
        if (!api) return;
        var code = event && event.target ? event.target.value : '';
        api.selectCity(code);
        render();
        revalidate();
    }

    function init() {
        if (typeof document === 'undefined') return;
        var api = sync();
        PAGES.forEach(function (page) {
            var group = buildGroup(page);
            if (!group) return;
            var select = $(page.selectId);
            if (select && !select.getAttribute('data-bound')) {
                select.setAttribute('data-bound', '1');
                select.addEventListener('change', onChange);
            }
        });
        if (!api) return;
        render();
        revalidate();
        if (typeof document.addEventListener === 'function') {
            document.addEventListener(api.EVENT_UPDATED, function () { render(); revalidate(); });
            document.addEventListener(api.EVENT_CITY_CHANGED, function () { render(); revalidate(); });
        }
    }

    if (typeof window !== 'undefined') {
        window.CitySocialUI = { init: init, render: render, revalidate: revalidate, PAGES: PAGES };
    }

    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
        else init();
    }
})();
