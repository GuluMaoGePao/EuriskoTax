#!/usr/bin/env node
/**
 * 真机冒烟：41 个工具逐个走一遍（阶段19 收官）
 *
 * 为什么要有这个脚本：
 *   阶段19 一路踩的都是同一类坑 —— 「jsdom 全绿 → 真机点开一看不对」（18-6a 行名带括号后缀、
 *   19-12 政策徽标把标题压成一字一行、18-2 点老记录看到最近一次算的东西）。单测钉的是
 *   「函数在给定输入下返回什么」，钉不住「41 个入口在真机上是不是都出得来数」：
 *   deep 侧尤其如此 —— 21 个完整测算的结果卡由渲染器按 spec **现拼**，任何一处 spec 缺字段、
 *   compute 抛错、渲染器少判空，在单测里都是绿的那一格（测试只挑两三个代表跑）。
 *
 * 所以这里把**全部 41 个工具**在真机上各算一次，只问三件事：
 *   ① 出不出得来结果（结果区在不在、主结果有没有数）；
 *   ② 有没有抛异常（页面级 error 一并收，不只看 try/catch）；
 *   ③ deep 侧那枚政策时效徽标在不在（19-12 刚铺到 21 个 spec，逐个人肉看不完）。
 *
 * 三条边界（改这个文件前先读）：
 *   - **不写留痕**：跑之前拍 localStorage 快照、跑之后**整份还原** —— 41 次测算如果灌进历史，
 *     这个会话的历史就不再是「我算过什么」，后面拍基线也会被污染（历史卡、最近测算都在首页）。
 *   - **只报不修**：它不做任何修正动作，失败就退出码 1 交给人判断。自动化改代码 = 埋雷。
 *   - **复用基线底座**（ui-lib/screenshot-kit 的服务器与浏览器调用），不另起一套。
 *
 * 用法：
 *   node tools/ops/ui-smoke-all-tools.js            # 打印报告，有失败则退出码 1
 *   node tools/ops/ui-smoke-all-tools.js --json     # 打印完整 JSON（给别的脚本消费）
 */

const kit = require('./ui-lib/screenshot-kit');

const PORT = Number(process.argv.filter((a) => /^\d{4,5}$/.test(a))[0]) || 4181;
// 与视觉基线共用同一个浏览器会话：**新会话冷启动要拉 6 个外网 CDN**（字体是图标，
// 没到就是空白方块），实测全新 session 能卡到 7 分钟以上（agent-browser 冷启动挂死）。
// 冒烟不截图、不改视口、跑完还原 localStorage，与基线互不影响。
const SESSION = 'ui-baseline';
const wantJson = process.argv.includes('--json');

/** 登录态：deep 页与批量页对游客是另一副样子，冒烟要站在**登录用户**的位置看 */
const INJECT_JS = `(() => {
    try {
        localStorage.setItem('auth_token', 'smoke-fake-token');
        localStorage.setItem('current_user', JSON.stringify({ id: 1, username: 'smoke', email: 's@e.com', plan: 'pro' }));
        return 'injected';
    } catch (e) { return String(e); }
})()`;

const SMOKE_JS = `(() => {
    // 快照：跑完原样还原，41 次测算不留痕
    var snap = {};
    try {
        for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); snap[k] = localStorage.getItem(k); }
    } catch (e) {}

    var errs = [];
    window.addEventListener('error', function (e) { errs.push(String((e && e.message) || e)); });

    function hasNum(s) { return /[0-9]/.test(String(s || '')); }
    function txt(el) { return el ? String(el.textContent || '').replace(/\\s+/g, ' ').trim() : ''; }

    var rows = [];
    var reg = window.EuriskoToolRegistry;
    var TB = window.EuriskoToolbox;
    var W = window.EuriskoDeepWizard;
    if (!reg) return JSON.stringify({ fatal: 'no-registry' });

    // ---- 20 个速算器：openTool 打开即用默认值算一次（toolbox-ui 的 build 末尾）----
    (reg.all() || []).forEach(function (t) {
        var r = { id: t.id, name: t.name, kind: 'quick' };
        try {
            if (!TB || typeof TB.openTool !== 'function') { r.ok = false; r.why = 'no-toolbox'; rows.push(r); return; }
            TB.openTool(t.id);
            var box = document.getElementById('quick-result');
            r.box = !!box;
            r.value = txt(box ? box.querySelector('.tool-result-primary-value') : null);
            r.ok = r.box && hasNum(r.value);
            if (!r.ok) r.why = !r.box ? 'no-result-box' : 'no-number';
        } catch (e) { r.ok = false; r.why = 'throw'; r.err = String(e); }
        rows.push(r);
    });

    // ---- 21 个完整测算：带 values 直落结果步（与「从历史查看」同一条路径）----
    (reg.deep() || []).forEach(function (t) {
        var r = { id: t.id, name: t.name, kind: 'deep' };
        try {
            if (!W || typeof W.open !== 'function') { r.ok = false; r.why = 'no-wizard'; rows.push(r); return; }
            W.open(t.id, { values: {} });
            var card = document.getElementById('dw-result-card');
            var stamp = document.getElementById('dw-policy-stamp');
            r.card = !!card;
            r.text = txt(card).slice(0, 80);
            r.stamp = txt(stamp);
            r.ok = r.card && hasNum(card ? card.textContent : '');
            if (!r.ok) r.why = !r.card ? 'no-card' : 'no-number';
            // 徽标缺席**不算失败**（分类所得刻意不挂，见 tool-registry 注释），只记下来给人看
            if (!r.stamp) r.noStamp = true;
        } catch (e) { r.ok = false; r.why = 'throw'; r.err = String(e); }
        rows.push(r);
    });

    try {
        localStorage.clear();
        Object.keys(snap).forEach(function (k) { localStorage.setItem(k, snap[k]); });
    } catch (e) {}

    return JSON.stringify({ rows: rows, errors: errs });
})()`;

/**
 * agent-browser 的 eval 输出是**双层**：它把页面里 return 的那个 JSON 字符串
 * 又整体 JSON 序列化了一遍（输出形如 "{\"rows\":[…]}"，里面的引号全带反斜杠）。
 * 只按最外层 {} 截取会截到转义后的文本，JSON.parse 必然失败 —— 必须先剥掉外层那对引号。
 */
function parseJson(s) {
    let t = String(s || '').trim();
    if (t.charAt(0) === '"') {
        try {
            t = String(JSON.parse(t));
        } catch (e) { /* 外层不是合法 JSON 串：落回截取分支 */ }
    }
    const i = t.indexOf('{');
    const j = t.lastIndexOf('}');
    if (i < 0 || j <= i) return null;
    try {
        return JSON.parse(t.slice(i, j + 1));
    } catch (e) {
        return null;
    }
}

(async function main() {
    const server = await kit.startServer(PORT);
    const browser = kit.createBrowser(SESSION);
    const url = 'http://127.0.0.1:' + PORT + '/';

    // 每一步都打点：这个脚本卡住时（agent-browser 冷启动、CDN 不通）必须先知道卡在哪一步，
    // 否则只能对着一行「真机冒烟：url」干等十几分钟。
    const step = (s) => process.stdout.write('  · ' + s + ' … ' + new Date().toTimeString().slice(0, 8) + '\n');

    process.stdout.write('真机冒烟：' + url + '\n');
    step('打开页面');
    await browser.ab(['open', url]);
    step('等资源就绪');
    await browser.waitForReady();
    step('注入登录态');
    await browser.ab(['eval', INJECT_JS]);
    await browser.ab(['reload']);
    await browser.waitForReady();
    step('遍历 41 个工具（真机计算）');
    const raw = await browser.ab(['eval', SMOKE_JS], 180000);
    step('取回结果');
    const data = parseJson(raw);

    if (!data) {
        process.stdout.write('解析失败，原始输出：\n' + String(raw).slice(0, 2000) + '\n');
        process.exit(2);
    }
    if (data.fatal) {
        process.stdout.write('致命：' + data.fatal + '\n');
        process.exit(2);
    }

    const rows = data.rows || [];
    const failed = rows.filter((r) => !r.ok);
    const noStamp = rows.filter((r) => r.noStamp);
    const quick = rows.filter((r) => r.kind === 'quick');
    const deep = rows.filter((r) => r.kind === 'deep');

    if (wantJson) {
        process.stdout.write(JSON.stringify(data, null, 2) + '\n');
    } else {
        process.stdout.write('\n速算器 ' + quick.length + ' 个 · 完整测算 ' + deep.length + ' 个\n');
        process.stdout.write('出数：' + (rows.length - failed.length) + '/' + rows.length + '\n');
        if (failed.length) {
            process.stdout.write('\n—— 没出数的 ——\n');
            failed.forEach((r) => {
                process.stdout.write('  [' + r.kind + '] ' + r.id + '（' + r.name + '）' + (r.why || '')
                    + (r.err ? ' :: ' + r.err : '') + (r.value ? ' :: 主结果="' + r.value + '"' : '')
                    + (r.text ? ' :: 卡="' + r.text + '"' : '') + '\n');
            });
        }
        if (noStamp.length) {
            process.stdout.write('\n—— 结果卡连政策版本都没有（stamp 整段为空）——\n');
            noStamp.forEach((r) => process.stdout.write('  ' + r.id + '（' + r.name + '）\n'));
        }
        // 有版本但**没有时效**是另一回事：19-12 的已知缺口（政策库里没有「分类所得」条目，
        // 所以 classification 刻意不挂 policyKey）。它不算失败，但必须每次都看得见 ——
        // 缺口一旦悄悄多出几个，说明有人新增 spec 时忘了挂。
        const noFreshness = deep.filter((r) => r.stamp && !/有效|过期|优惠至/.test(r.stamp));
        if (noFreshness.length) {
            process.stdout.write('\n—— 有政策版本但无时效徽标（19-12 已知：分类所得无政策条目）——\n');
            noFreshness.forEach((r) => process.stdout.write('  ' + r.id + '（' + r.name + '）徽标="' + r.stamp + '"\n'));
        }
        if ((data.errors || []).length) {
            process.stdout.write('\n—— 页面级异常 ——\n');
            data.errors.forEach((e) => process.stdout.write('  ' + e + '\n'));
        }
        process.stdout.write('\n' + (failed.length ? '结论：失败 ' + failed.length + ' 个' : '结论：全部出数') + '\n');
    }

    process.exit(failed.length ? 1 : 0);
})().catch((e) => {
    process.stdout.write('冒烟脚本自身出错：' + (e && e.message ? e.message : String(e)) + '\n');
    process.exit(2);
});
