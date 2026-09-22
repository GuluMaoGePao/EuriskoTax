/**
 * 身份视角偏好（阶段19-2 遗留清偿③）
 *
 * plan §3.3.4 的原话：身份卡「作用是设置默认视图，**不是筛选工具**」——
 * 41 个入口永远都能进，身份只改默认的视图密度与推荐排序。
 * 但落地时这张卡做的是 `openScenario()`：跳到工具页后**只渲染那一个推荐组**，
 * 其余 36 个入口当场消失。那不是"挑身份"，是筛选，且违反 §3.9 的硬边界。
 * 所以这一版把两件事拆开：记住身份（这里）→ 卡片主行为改为"设为默认视角"（toolbox-ui.js）。
 *
 * 三条边界（改之前先看这里）：
 *   1. **只管视图，不管计税**。这个偏好**绝不写进税务档案**（tax-profile 的 identity）——
 *      档案里那一项是计税口径（企业员工 / 个体户 / 自由职业，三个值），
 *      身份卡有 6 张（含财务 / HR / 高管），值域对不上：选了「HR / 薪酬」往档案里写什么？
 *      写了就是拿一个导航选择去改计税口径，将来算错没人查得到。两条线各管一件事。
 *   2. **不替用户推翻显式选择**。身份可以带出该身份的默认密度（老板 → 完整、上班族 → 简明），
 *      但用户自己切过视图之后就只听用户的 —— 走 mode-pref 的 `applyDefault()`，
 *      它只在「用户从未显式设过」时才写。
 *   3. **plan 没给答案的就不编**。表格里没有「高管 / 股东」的默认密度，那就**不登记** ——
 *      选它只记住身份标签，不动密度，界面上也不显示那句"当前视图"（不显示取不到的东西）。
 *
 * 游客可用（与 mode-pref 同一口径：偏好不是登录后才有的特权）。
 */
(function () {
    'use strict';

    var KEY = 'euriskoPrefIdentity';

    // 默认视图密度：依据是 plan §3.3.4 身份卡表格（上班族 / 自由职业 / HR 简明；
    // 老板个体户 / 企业财务 完整）。executive 与 agent 未登记 —— 见文件头第 3 条。
    var DEFAULT_MODE_OF = {
        employee: 'simple',
        freelance: 'simple',
        hr: 'simple',
        owner: 'full',
        finance: 'full'
    };

    var subs = [];

    function read() {
        try {
            return window.localStorage.getItem(KEY) || '';
        } catch (e) {
            return '';   // 无痕 / 禁用存储：只是这次不记住，绝不让整页挂掉
        }
    }

    function write(id) {
        try {
            if (id) window.localStorage.setItem(KEY, id);
            else window.localStorage.removeItem(KEY);
        } catch (e) { /* 存不下就只是这次不记住 */ }
    }

    function emit(id) {
        subs.slice().forEach(function (cb) {
            try { cb(id); } catch (e) { console.warn('[identity-pref] 订阅回调抛错', e); }
        });
    }

    function modePref() { return window.EuriskoModePref; }

    /** 该身份的默认密度；plan 没登记的返回 null（调用方据此决定显不显示那句话） */
    function modeOf(id) {
        var m = DEFAULT_MODE_OF[id];
        return m === 'full' || m === 'simple' ? m : null;
    }

    // 带出默认密度：只有用户**没自己切过**视图时才写（mode-pref.applyDefault 内部判断）。
    // 反过来不做 —— 身份不该推翻用户已经表达过的选择。
    function applyDefaultMode(id) {
        var p = modePref();
        var m = modeOf(id);
        if (!p || !m || typeof p.applyDefault !== 'function') return;
        p.applyDefault(m);
    }

    var api = {
        DEFAULT_MODE_OF: DEFAULT_MODE_OF,
        get: function () { return read(); },
        /** 设为默认视角（重复点同一张 = 幂等，不再广播） */
        set: function (id) {
            id = id || '';
            var prev = read();
            write(id);
            applyDefaultMode(id);
            if (id !== prev) emit(id);
            return id;
        },
        /** 取消默认：只清身份，**不动**已生效的视图密度（撤销身份不等于撤销视图） */
        clear: function () {
            var prev = read();
            if (!prev) return '';
            write('');
            emit('');
            return '';
        },
        modeOf: modeOf,
        onChange: function (cb) {
            if (typeof cb !== 'function') return function () {};
            subs.push(cb);
            return function () {
                var i = subs.indexOf(cb);
                if (i >= 0) subs.splice(i, 1);
            };
        },
        /** 测试用：退回默认并清空订阅（用例之间不串味） */
        reset: function () {
            subs.length = 0;
            try { window.localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
        }
    };

    window.EuriskoIdentityPref = api;
})();
