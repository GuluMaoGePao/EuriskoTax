/* 功能开关（Feature Flags）—— 新功能先在小范围真机验证，再全量放开。
 *
 * 为什么需要它：本项目只有一套生产环境（腾讯云正式站），没有预发/灰度环境，
 * 所有验证此前都发生在本机（jsdom 单测 + 本地 e2e），「真机第一次见光」就是正式域名。
 * 历史教训（阶段18-6a、v1.144.0）：本地全绿不等于真机可用，而**发布即全量**意味着
 * 一旦判断失误就是全体用户受影响。开关让「先给自己开、验完再全量」成为可能。
 *
 * 使用方式（业务侧只有一行判断）：
 *     if (window.EuriskoFlags.enabled('my.newThing')) { renderNewThing(); }
 *
 * 打开途径（后者覆盖前者）：
 *   ① REGISTRY 里的默认态（新功能一律 false = 默认关闭）
 *   ② localStorage `euriskoFeatureFlags`（内部自测常开，换浏览器/清缓存即失效）
 *   ③ URL `?ff=a,b`（临时开指定开关，可发给别人复现）
 *   ④ URL `?beta=1` 或 channel='beta'（一次打开**所有** beta 通道开关）
 *
 * channel 由部署侧注入：beta 站会在页面里置 `window.__APP_CHANNEL__` 为 `'beta'`
 * （见 ops-deploy.ps1 的 beta 配置 hooks.postDeploy，只对 beta 目录生效）；
 * 源码里**不得**给它赋值，正式站读不到它就是正式站。
 *
 * 纪律：
 *   - 开关名只能取 REGISTRY 里登记过的（拼错不会被静默忽略，而是 console.warn，方便早发现）；
 *   - 开关是**过渡态**，不是配置：功能全量后要删掉判断与 REGISTRY 条目，别让死分支堆积；
 *   - 开关只用来挡「新功能的入口」，不要拿它长期承载产品差异（那应走 ProCode/套餐体系）。
 */
(function (global) {
    'use strict';

    var STORAGE_KEY = 'euriskoFeatureFlags';

    // 开关注册表。新增开关 = 在这里加一行 + 业务侧 enabled() 判断 + 单测补一条。
    // beta: true 表示它属于「尚未全量」通道，会被 ?beta=1 / channel=beta 一起打开。
    var REGISTRY = {
        // 预发环境角标（beta 站自动开；正式站永不出现）
        'env.betaBadge': {
            beta: true,
            desc: '预发环境角标：提醒当前不是正式站，数据非生产'
        }
    };

    var sessionOverrides = {}; // enable()/disable() 的会话级覆盖（不落盘）

    function readJson(raw) {
        try {
            var parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (e) {
            return {};
        }
    }

    // localStorage 在隐私模式 / 禁用 Cookie 时会抛异常，一律降级为空
    function readStored() {
        try {
            return readJson(global.localStorage.getItem(STORAGE_KEY) || '{}');
        } catch (e) {
            return {};
        }
    }

    function writeStored(next) {
        try {
            global.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch (e) { /* 隐私模式：忽略，退化为会话级 */ }
    }

    function queryParams() {
        try {
            return new URLSearchParams(global.location.search);
        } catch (e) {
            return null;
        }
    }

    // URL 允许开哪些：?ff=a,b,c
    function namesFromQuery() {
        var params = queryParams();
        if (!params) return [];
        var raw = params.get('ff') || '';
        return raw.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    }

    function betaFromQuery() {
        var params = queryParams();
        if (!params) return false;
        var v = (params.get('beta') || '').toLowerCase();
        return v === '1' || v === 'true' || v === 'on';
    }

    // 当前环境通道：'beta' = 预发站（部署时注入），其余一律视为正式站
    function channel() {
        var c = global.__APP_CHANNEL__;
        return (typeof c === 'string' && c.toLowerCase() === 'beta') ? 'beta' : 'production';
    }

    function isBeta() {
        return channel() === 'beta';
    }

    // 开关最终态：默认 → localStorage → URL(?ff) → beta 通道(?beta=1 或 channel=beta)
    function enabled(name) {
        var def = REGISTRY[name];
        if (!def) {
            // 未登记的名字一律关，但要喊一声 —— 否则「拼错开关名」会伪装成「功能没开」
            if (typeof global.console !== 'undefined' && global.console.warn) {
                global.console.warn('[EuriskoFlags] 未登记的开关名: ' + name + '（请先在 REGISTRY 登记）');
            }
            return false;
        }

        var on = !!def.default;
        var stored = readStored();
        if (typeof stored[name] === 'boolean') on = stored[name];
        if (namesFromQuery().indexOf(name) !== -1) on = true;
        if (typeof sessionOverrides[name] === 'boolean') on = sessionOverrides[name];
        if (def.beta && (betaFromQuery() || isBeta())) on = true;
        return on;
    }

    // 会话级 + 持久化打开（自测用；发版全量请改 REGISTRY 的 default，不是调它）
    function enable(name) {
        if (!REGISTRY[name]) return false;
        sessionOverrides[name] = true;
        var stored = readStored();
        stored[name] = true;
        writeStored(stored);
        return true;
    }

    function disable(name) {
        if (!REGISTRY[name]) return false;
        sessionOverrides[name] = false;
        var stored = readStored();
        stored[name] = false;
        writeStored(stored);
        return true;
    }

    // 清掉 localStorage 里的持久化（保留会话级覆盖），便于回归「默认关闭」的真实用户视角
    function reset() {
        try {
            global.localStorage.removeItem(STORAGE_KEY);
        } catch (e) { /* ignore */ }
        sessionOverrides = {};
    }

    function list() {
        return Object.keys(REGISTRY).map(function (name) {
            return {
                name: name,
                beta: !!REGISTRY[name].beta,
                desc: REGISTRY[name].desc || '',
                on: enabled(name)
            };
        });
    }

    // ---------- 预发环境角标（本期唯一自带用例） ----------
    // 目的：beta 站与正式站长得几乎一样，光看界面分不清在哪个环境，
    // 误把 beta 当正式站去点「留资/兑换码」会污染数据。角标是 cheapest 的防呆。
    var BADGE_ID = 'eurisko-beta-badge';

    function renderBadge() {
        if (document.getElementById(BADGE_ID)) return;
        if (!isBeta() && !enabled('env.betaBadge')) return;

        var badge = document.createElement('div');
        badge.id = BADGE_ID;
        badge.setAttribute('role', 'status');
        badge.setAttribute('aria-live', 'polite');
        // 行内样式：不引 Tailwind 类，避免改类后忘记 build:css 导致角标样式丢失
        badge.style.cssText = [
            'position:fixed', 'right:12px', 'bottom:12px', 'z-index:2147483000',
            'padding:6px 12px', 'border-radius:999px',
            'background:#b45309', 'color:#fff',
            'font-size:12px', 'line-height:1.4', 'font-weight:600',
            'box-shadow:0 2px 8px rgba(0,0,0,.28)',
            'pointer-events:none', 'user-select:none'
        ].join(';');
        badge.textContent = '预发环境 · 数据非生产';
        (document.body || document.documentElement).appendChild(badge);
    }

    function scheduleBadge() {
        if (document.body) {
            renderBadge();
        } else {
            document.addEventListener('DOMContentLoaded', renderBadge);
        }
    }

    var api = {
        enabled: enabled,
        enable: enable,
        disable: disable,
        reset: reset,
        list: list,
        channel: channel,
        isBeta: isBeta,
        registry: REGISTRY,
        renderBadge: renderBadge,
        // 测试与调试：不开后门改注册表，避免线上被随意改写
        STORAGE_KEY: STORAGE_KEY
    };

    global.EuriskoFlags = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;

    scheduleBadge();
})(typeof window !== 'undefined' ? window : globalThis);
