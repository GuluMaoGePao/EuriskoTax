/**
 * 阶段19-8 · 效率层 E5：参数记忆（src/js/ui/param-memory.js）
 *
 * 一句话职责：同一个工具，第二次进来时把上一次的输入带出来。
 *
 * 为什么值得做（E5 里收益最稳的一项）：
 *   B/C/D 三类用户用我们不是为了「一次性疑问」，是**周期性重复同一件事**
 *   （每月算工资个税、每季算增值税）。让他们每次从 0 开始填，是把产品的
 *   使用成本转嫁给用户 —— 而这件事零后端、零算法风险。
 *
 * 三条边界（越界就会从"贴心"变成"添乱"）：
 *   ① **只在算得出来时记**：计算失败 / 返回 error 的那一次不落盘。
 *      否则用户下次进来看到的是一份"算不出结果的参数"，还以为是产品坏了。
 *   ② **只记能原样还回去的值**：数字（含 0）/ 字符串 / 布尔 / 数组（repeater）。
 *      NaN 与 undefined 一律丢 —— 它们还原出来是空框，用户看到的是"记忆记错了"。
 *   ③ **永远给用户一句交代 + 一个出口**：带出的同时显示「已带出上次输入（N 天前）」
 *      和「清空」。静默替换默认值是最坏的一种"自作主张"—— 用户会以为是自己填的。
 *
 * 与「草稿」的分工（别混）：
 *   deep 向导的 `euriskoDeepDraft:` 记的是**没算完的半截输入 + 走到第几步**；
 *   本文件记的是**算完的那一次**。前者是断点续算，后者是参数记忆。
 *   速算器一屏算完、没有"半截"这回事，所以它只有后者。
 *
 * 对外接口：window.EuriskoParamMemory = { get, set, clear, clearAll, ageLabel }
 */
(function () {
    'use strict';

    var PREFIX = 'euriskoParamMemory:';
    var DAY = 24 * 60 * 60 * 1000;

    function store() {
        try { return window.localStorage || null; }
        catch (e) { return null; }      // 隐私模式：取不到就当没有记忆，绝不因此阻断测算
    }

    // 只记能原样还回去的值（见文件头边界 ②）
    function keepable(v) {
        if (typeof v === 'number') return isFinite(v);
        if (typeof v === 'string' || typeof v === 'boolean') return true;
        return Array.isArray(v);
    }

    function sanitize(values) {
        var out = {};
        if (!values || typeof values !== 'object') return out;
        Object.keys(values).forEach(function (k) {
            if (keepable(values[k])) out[k] = values[k];
        });
        return out;
    }

    // 返回 { values, at } 或 null。读坏了（手改过 localStorage / 旧格式）一律当作没有记忆：
    // 兜底到默认值只是少一点便利，读坏的东西直接进 compute 才是事故。
    function get(toolId) {
        var s = store();
        if (!s || !toolId) return null;
        var raw;
        try { raw = s.getItem(PREFIX + toolId); } catch (e) { return null; }
        if (!raw) return null;
        var rec;
        try { rec = JSON.parse(raw); } catch (e) { return null; }
        if (!rec || typeof rec !== 'object') return null;
        if (!rec.values || typeof rec.values !== 'object') return null;
        return rec;
    }

    function set(toolId, values) {
        var s = store();
        if (!s || !toolId) return false;
        var clean = sanitize(values);
        if (!Object.keys(clean).length) return false;
        try {
            s.setItem(PREFIX + toolId, JSON.stringify({ values: clean, at: new Date().toISOString() }));
            return true;
        } catch (e) { return false; }   // 配额满：记忆丢了不影响测算本身
    }

    function clear(toolId) {
        var s = store();
        if (!s || !toolId) return false;
        try { s.removeItem(PREFIX + toolId); return true; } catch (e) { return false; }
    }

    // 单测用：每个用例之间必须清干净，否则上一个用例填的值会当成"上次输入"带进下一个用例
    function clearAll() {
        var s = store();
        if (!s) return false;
        try {
            var keys = [];
            for (var i = 0; i < s.length; i++) {
                var k = s.key(i);
                if (k && k.indexOf(PREFIX) === 0) keys.push(k);
            }
            keys.forEach(function (k) { s.removeItem(k); });
            return true;
        } catch (e) { return false; }
    }

    // 「上次」要说人话：今天 / N 天前 / N 个月前，超过一年只说年份长度没意义，回落到天数
    function ageLabel(at) {
        if (!at) return '';
        var then = new Date(at).getTime();
        if (!isFinite(then)) return '';
        var days = Math.floor((Date.now() - then) / DAY);
        if (days <= 0) return '今天';
        if (days === 1) return '昨天';
        if (days < 30) return days + ' 天前';
        var months = Math.floor(days / 30);
        if (months < 12) return months + ' 个月前';
        return Math.floor(days / 365) + ' 年前';
    }

    window.EuriskoParamMemory = {
        get: get,
        set: set,
        clear: clear,
        clearAll: clearAll,
        ageLabel: ageLabel,
        PREFIX: PREFIX
    };
})();
