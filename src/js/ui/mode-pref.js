/**
 * 视图密度偏好（阶段19-7）
 *
 * 命名是「简明 / 完整」而不是「新手 / 专业」：它描述**内容密度**，不描述人的水平 ——
 * 「新手模式」这种叫法会让 80% 的人为了自尊直接关掉，从而永远看不到自己需要的那几个参数。
 *
 * 模式只影响 3 件事（边界写死在这里，别在渲染层各自发挥）：
 *   1. 输入字段可见性 —— 简明只显示 level:'basic'，其余收进「⚙ 更多参数（可选）」折叠块；
 *   2. 结果展开深度   —— 简明：推导链默认折叠；完整：默认展开；
 *   3. 完整测算步骤   —— 简明把 level:'advanced' 的步合并为一步「补充参数（可选）」。
 *
 * 模式绝不影响 4 件事（防止长成两个产品）：
 *   计算口径（单一真源是 tax-calculator.js）/ 可用工具范围（41 个永远都能进）/
 *   保存·导出·分享·对比 / 价格与权益。
 *
 * 默认简明、**游客可用**（登录不是前提 —— 保住免登录优势）；就地切换、即时生效、记住偏好。
 */
(function () {
    'use strict';

    var KEY = 'euriskoPrefMode';
    // 「用户自己切过视图」的标记（阶段19-2 遗留清偿③）：身份卡要带出该身份的默认密度，
    // 但只能在用户**没表达过**的时候带 —— 用户亲手切过一次之后，身份卡再改就是推翻他的选择。
    // 没有这个标记，两个偏好会互相覆盖，且覆盖顺序取决于谁先加载（那就是玄学）。
    var KEY_EXPLICIT = 'euriskoPrefModeExplicit';
    var SIMPLE = 'simple';
    var FULL = 'full';
    var subs = [];

    // localStorage 在无痕/被禁用时会直接抛异常：偏好读不到就退回简明，绝不让整页挂掉
    function read() {
        try {
            var v = window.localStorage.getItem(KEY);
            return v === FULL ? FULL : SIMPLE;
        } catch (e) {
            return SIMPLE;
        }
    }

    function write(mode) {
        try {
            window.localStorage.setItem(KEY, mode);
        } catch (e) { /* 存不下就只是这次不记住，不影响当前会话 */ }
    }

    // 第二个参数是**切换前**的模式：渲染器要靠它知道「此刻屏幕上显示的是哪一步」——
    // 变更已经写进存储了，光看当前模式收值会收错一步（等于把用户刚填的丢掉）。
    function readExplicit() {
        try {
            return window.localStorage.getItem(KEY_EXPLICIT) === '1';
        } catch (e) {
            return false;
        }
    }

    function writeExplicit(on) {
        try {
            if (on) window.localStorage.setItem(KEY_EXPLICIT, '1');
            else window.localStorage.removeItem(KEY_EXPLICIT);
        } catch (e) { /* 存不下就只影响"是否记住"，不影响本次会话 */ }
    }

    function emit(mode, prev) {
        subs.slice().forEach(function (cb) {
            try { cb(mode, prev); } catch (e) { console.warn('[mode-pref] 订阅回调抛错', e); }
        });
    }

    var api = {
        SIMPLE: SIMPLE,
        FULL: FULL,
        get: function () { return read(); },
        /** 用户显式选择：写模式 + 打标记（此后身份卡不再带出默认密度） */
        set: function (mode) {
            var next = mode === FULL ? FULL : SIMPLE;
            var prev = read();
            writeExplicit(true);
            if (next === prev) return next;
            write(next);
            emit(next, prev);
            return next;
        },
        /** 身份卡带出的默认值：用户已显式选过就一个字都不改（返回当前值） */
        applyDefault: function (mode) {
            var next = mode === FULL ? FULL : SIMPLE;
            var prev = read();
            if (readExplicit() || next === prev) return prev;
            write(next);
            emit(next, prev);
            return next;
        },
        /** 用户是否亲手切过视图（身份卡靠它决定能不能带出默认） */
        isExplicit: function () { return readExplicit(); },
        toggle: function () { return api.set(read() === FULL ? SIMPLE : FULL); },
        /** 订阅变更，返回退订函数 */
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
            try {
                window.localStorage.removeItem(KEY);
                window.localStorage.removeItem(KEY_EXPLICIT);
            } catch (e) { /* ignore */ }
        },
        label: function (mode) { return (mode || read()) === FULL ? '完整' : '简明'; }
    };

    window.EuriskoModePref = api;
})();
