/**
 * 阶段19-8 · 效率层 E5：URL 携带参数（src/js/ui/param-link.js）
 *
 * 一句话职责：把「这个工具 + 这组输入」变成一个链接，零后端成本。
 *
 * 它解决的是参数记忆够不到的那半边：
 *   记忆解决「我自己下次进来」，链接解决「让别人 / 另一台设备 / 书签回到这一屏」——
 *   发给同事复核、存进浏览器书签当月度模板、贴进工单备注，都只需要一串 URL。
 *   数据仍然不出本机（参数在 URL 里，不上传任何地方），这一点要在按钮旁边说清楚。
 *
 * 形状：`?<base>?t=<toolId>&p=<encodeURIComponent(JSON)>`（t = tool，p = params）。
 *   为什么用短键名而不是 ?toolId=&values=：链接是要被人复制、贴进聊天框与二维码的，
 *   短一点就少一次被客户端截断的机会。
 *
 * 三条边界：
 *   ① **未知工具不打开**：链接里的 id 在注册表里查不到就直接返回 false。
 *      过期 / 手改过的链接把人丢进空白页，比不打开更糟。
 *   ② **只收注册表声明过的字段**：链接是外部输入，不能让它往 compute 里塞
 *      注册表没声明过的键（那等于开了个"任意参数注入"的口子）。
 *   ③ **不改地址栏**：只在用户点「复制链接」时生成。自动 replaceState 会
 *      污染用户的前进/后退，而这件事的收益只是"刷新后还在"——参数记忆已经覆盖。
 *
 * 对外接口：window.EuriskoParamLink = { build, parse, open }
 */
(function () {
    'use strict';

    var P_TOOL = 't';
    var P_DATA = 'p';

    function reg() { return window.EuriskoToolRegistry; }

    function keepable(v) {
        if (typeof v === 'number') return isFinite(v);
        if (typeof v === 'string' || typeof v === 'boolean') return true;
        return Array.isArray(v);
    }

    function baseUrl() {
        var l = window.location || {};
        var origin = (l.origin && l.origin !== 'null') ? l.origin : '';
        return origin + (l.pathname || '/');
    }

    // 见文件头边界 ②：只留注册表声明过的字段，且值必须能被 JSON 原样还原
    function filterValues(tool, values) {
        var out = {};
        if (!values || typeof values !== 'object') return out;
        var spec = (tool && tool.fields) || [];
        if (!spec.length) return out;      // 没有字段表就不敢放行任何键
        spec.forEach(function (f) {
            if (!f || !f.key) return;
            if (values[f.key] === undefined) return;
            if (!keepable(values[f.key])) return;
            out[f.key] = values[f.key];
        });
        return out;
    }

    function encodeValues(values) {
        try { return encodeURIComponent(JSON.stringify(values || {})); }
        catch (e) { return ''; }
    }

    function decodeValues(raw) {
        if (!raw) return null;
        try {
            var o = JSON.parse(decodeURIComponent(raw));
            return (o && typeof o === 'object' && !Array.isArray(o)) ? o : null;
        } catch (e) { return null; }
    }

    function build(toolId, values) {
        if (!toolId) return '';
        var r = reg();
        var tool = r && typeof r.get === 'function' ? r.get(toolId) : null;
        var vals = tool ? filterValues(tool, values) : {};
        // 一个参数都没留下来就不带 p：只指工具的链接比带一份空参数的链接更不容易被截断
        var enc = Object.keys(vals).length ? encodeValues(vals) : '';
        return baseUrl() + '?' + P_TOOL + '=' + encodeURIComponent(toolId) + (enc ? '&' + P_DATA + '=' + enc : '');
    }

    // search 缺省读当前地址栏；可传 '?t=vat&p=…' 或 't=vat&p=…'
    function parse(search) {
        var q = String(search === undefined ? ((window.location && window.location.search) || '') : (search || ''));
        var i = q.indexOf('?');
        if (i >= 0) q = q.slice(i + 1);
        if (!q) return null;
        var toolId = '';
        var data = '';
        q.split('&').forEach(function (part) {
            if (!part) return;
            var kv = part.split('=');
            var k = kv[0] || '';
            var v = kv.slice(1).join('=');
            try { k = decodeURIComponent(k.replace(/\+/g, ' ')); v = decodeURIComponent(v.replace(/\+/g, ' ')); }
            catch (e) { return; }
            if (k === P_TOOL) toolId = v;
            else if (k === P_DATA) data = v;
        });
        if (!toolId) return null;
        return { toolId: toolId, values: decodeValues(data) || {} };
    }

    // 命中即打开；返回是否打开（未命中 / 未知工具 = false，调用方照常走原流程）
    function open() {
        var p = parse();
        if (!p) return false;
        var r = reg();
        var tool = r && typeof r.get === 'function' ? r.get(p.toolId) : null;
        if (!tool) return false;
        var tb = window.EuriskoToolbox;
        if (!tb || typeof tb.openTool !== 'function') return false;
        var vals = filterValues(tool, p.values);
        // 没有参数也要打开：链接只带工具 id 时（手写的 / 被截断的），
        // 打开工具本身仍然是对的 —— 用户点的是"回到这个工具"。
        tb.openTool(p.toolId, Object.keys(vals).length ? { values: vals } : {});
        return true;
    }

    window.EuriskoParamLink = {
        build: build,
        parse: parse,
        open: open,
        PARAM_TOOL: P_TOOL,
        PARAM_DATA: P_DATA
    };
})();
