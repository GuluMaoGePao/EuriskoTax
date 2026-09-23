/**
 * 阶段19-6a（v1.87.0）：我的 → 税务档案 → 「我的情况」可查看 / 修改。
 *
 * 为什么必须补这个入口：19-5 的引导卡是**单向**的 —— 一次问一项，补完就没出口了。
 * 用户改了城市、不再享受房贷利息、想看看自己到底填过什么，全都无处下手。
 * 一份只有「写」没有「读改」的档案，用户只会觉得它在偷自己的数据。
 *
 * 三条约束（与 tax-profile.js 同源，别各写一套）：
 *   1) 只读 / 写 tax-profile.js 的 API，**不自己解析 localStorage** ——
 *      存储降级（隐私模式走内存）那一套逻辑在里面，绕过去就等于在隐私模式下丢数据。
 *   2) 元素一律用 class + 容器作用域定位：这张卡与速算器引导卡可能同页存在，
 *      用全局 id 会互相覆盖（scenario-ui.js 早年被这坑过一次）。
 *   3) 「清空」会把 nudgeDismissed 一起清掉 → 引导卡重新开口。这是刻意的：
 *      档案清空了还接着装哑，等于把"补全"这条路彻底堵死。
 */
(function () {
    'use strict';

    function lib() { return window.EuriskoTaxProfile; }

    function esc(s) {
        return String(s === null || s === undefined ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function boolText(v) { return v === 'yes' ? '有' : (v === 'no' ? '没有' : ''); }

    // 档案里某一项当前值的「人话」：卡片顶部那句"目前填了什么"要用
    function valueTextOf(item, profile) {
        var v = profile[item.key];
        if (item.kind === 'multi') {
            if (!Array.isArray(v) || !v.length) return '';
            return v.map(function (val) {
                var opt = item.options.filter(function (o) { return o.value === val; })[0];
                return opt ? opt.label : val;
            }).join('、');
        }
        if (item.key === 'social' || item.key === 'bonus') {
            var t = boolText(v);
            return t ? (item.key === 'social' ? t + '缴社保公积金' : '今年' + t + '年终奖') : '';
        }
        if (item.kind === 'single') {
            var o2 = item.options.filter(function (o) { return o.value === v; })[0];
            return o2 ? o2.label : '';
        }
        return v ? String(v) : '';
    }

    function controlHtml(item, profile) {
        var v = profile[item.key];
        if (item.kind === 'multi') {
            var picked = Array.isArray(v) ? v : [];
            return '<div class="whoami-deductions">' + item.options.map(function (o) {
                var on = picked.indexOf(o.value) >= 0;
                return '<label class="whoami-chip' + (on ? ' is-on' : '') + '">' +
                    '<input type="checkbox" class="whoami-ded" value="' + esc(o.value) + '"' + (on ? ' checked' : '') + ' />' +
                    '<span>' + esc(o.label) + '</span></label>';
            }).join('') + '</div>';
        }
        if (item.kind === 'text') {
            return '<input type="text" class="whoami-input input-field" data-key="' + esc(item.key) +
                '" value="' + esc(v || '') + '" placeholder="' + esc(item.ask) + '" />';
        }
        return '<select class="whoami-select input-field" data-key="' + esc(item.key) + '">' +
            '<option value="">未填</option>' +
            item.options.map(function (o) {
                return '<option value="' + esc(o.value) + '"' + (o.value === v ? ' selected' : '') + '>' +
                    esc(o.label) + '</option>';
            }).join('') +
            '</select>';
    }

    function render() {
        var box = document.getElementById('profile-whoami-card');
        if (!box) return;
        var L = lib();
        if (!L || typeof L.get !== 'function') {
            console.warn('[whoami] EuriskoTaxProfile 未加载（data/tax-profile.js），档案编辑卡跳过');
            box.classList.add('hidden');
            return;
        }

        var profile = L.get();
        var c = L.pure.completeness(profile);
        box.classList.remove('hidden');

        box.innerHTML = '' +
            '<div class="profile-nudge-head">' +
            '<span class="profile-nudge-title"><i class="fa fa-id-card-o"></i>我的情况</span>' +
            '<span class="profile-nudge-pct">' + c.percent + '%</span>' +
            '</div>' +
            '<div class="profile-nudge-bar"><span class="profile-nudge-bar-fill" style="width:' + c.percent + '%"></span></div>' +
            '<p class="whoami-hint">补全后，测算会带上你的情况 —— 不必每次重新解释一遍自己是上班族还是个体户。' +
            '随时可以改，改完下次测算就按新的来。</p>' +
            '<div class="whoami-form">' + L.pure.ITEMS.map(function (item) {
                var txt = valueTextOf(item, profile);
                return '<div class="whoami-row">' +
                    '<div class="whoami-label">' + esc(item.label) +
                    (txt ? '<span class="whoami-now">目前：' + esc(txt) + '</span>' : '<span class="whoami-now is-empty">未填</span>') +
                    '</div>' +
                    controlHtml(item, profile) +
                    '</div>';
            }).join('') + '</div>' +
            '<div class="whoami-actions">' +
            '<button type="button" class="btn btn-primary whoami-save">保存</button>' +
            '<button type="button" class="btn bg-gray-200 text-gray-700 hover:bg-gray-300 whoami-clear">清空档案</button>' +
            '</div>';

        bind(box);
    }

    // 事件委托：卡片内容会被整体重渲染，绑在具体元素上会随重渲染丢失
    function bind(box) {
        if (box.getAttribute('data-bound') === '1') return;
        box.setAttribute('data-bound', '1');

        box.addEventListener('click', function (e) {
            var save = e.target.closest('.whoami-save');
            if (save) { saveInto(save); return; }
            var clear = e.target.closest('.whoami-clear');
            if (clear) { clearAll(clear); return; }
            var chip = e.target.closest('.whoami-chip');
            if (chip) chip.classList.toggle('is-on');  // 勾选态要看得见，不能只靠 checkbox 那一个小方块
        });
    }

    function collect(box) {
        var patch = {};
        var L = lib();
        L.pure.ITEMS.forEach(function (item) {
            if (item.kind === 'multi') {
                patch[item.key] = Array.prototype.slice.call(box.querySelectorAll('.whoami-ded'))
                    .filter(function (cb) { return cb.checked; })
                    .map(function (cb) { return cb.value; });
                return;
            }
            var el = box.querySelector('[data-key="' + item.key + '"]');
            patch[item.key] = el ? String(el.value || '').trim() : '';
        });
        return patch;
    }

    function saveInto(btn) {
        var box = document.getElementById('profile-whoami-card');
        var L = lib();
        if (!box || !L) return;
        L.patch(collect(box));
        // 改完当场给回执：点保存没反应，用户会以为没写进去（然后连点十次）
        btn.textContent = '已保存';
        setTimeout(function () { btn.textContent = '保存'; }, 1600);
        render();
    }

    function clearAll(btn) {
        var L = lib();
        if (!L) return;
        if (typeof window.confirm === 'function' && !window.confirm('清空「我的情况」？测算将不再自动带上这些信息。')) return;
        L.reset();
        btn.textContent = '已清空';
        setTimeout(function () { btn.textContent = '清空档案'; }, 1600);
        render();
    }

    window.EuriskoTaxProfileEditor = {
        render: render,
        refresh: render
    };
})();
