#!/usr/bin/env node
/**
 * 对比度审计（tools/ops/ui-contrast-audit.js）—— 阶段19-1 验收项「对比度仍达 AA」
 *
 * 为什么要有这个脚本：
 *   阶段19 的验收口径是「对比度仍达 AA」，但此前**没有任何手段能回答这个问题**：
 *   全站几十处 /50 /90 透明度修饰符 + 深浅两套主题，靠读 CSS 推不出实际渲染色，
 *   pure-DOM 断言也看不出颜色（这也是 tokens.css 注释里写的"没有视觉回归"的同一块短板）。
 *   本脚本走真机：把页面切到目标状态，用 getComputedStyle 取**实际渲染**的前景色与
 *   有效背景色（含祖先 alpha 合成），按 WCAG 2.1 算对比度，列出不达 AA 的文本。
 *
 * 判定口径（WCAG 2.1 AA）：
 *   正文 4.5:1；大字 3:1（大字 = ≥24px，或 ≥18.66px 且 font-weight ≥700）。
 *   这是"仍达 AA"里唯一需要守的两条线，不高不低，别自己加码。
 *
 * 为什么必须真机取而不是静态解析 CSS：
 *   ① 实际背景是**祖先链合成**出来的（半透明卡片叠在半透明底上），静态解析要自己实现层叠；
 *   ② 深色档的令牌值在 .dark 作用域下是另一套（tokens.css），静态解析要自己模拟作用域；
 *   ③ 元素是否可见（display / visibility / 断点隐藏）直接决定它算不算数。
 *   真机取 = 浏览器已经把这些都算好了，我们只读结果。
 *
 * 已知边界（不是 bug）：
 *   **背景图（url()）取不到色** —— 这类元素（白字压在插图上）合成出来的是父级底色，
 *   比值会假性偏低，脚本单独标记为「待人工确认」，不混进确定失败项。
 *   **渐变是可以判定的**（v1.81.0 起）：取 linear-gradient 的所有色停点逐点算、取最差值，
 *   这是保守下界（真实插值不会比色停更极端），所以渐变项已并入确定失败项，不再丢给人工。
 *
 * 用法：
 *   node tools/ops/ui-contrast-audit.js                     # 浅色 + 深色，6 页 × 2 断点
 *   node tools/ops/ui-contrast-audit.js --theme dark
 *   node tools/ops/ui-contrast-audit.js --only home,tools
 *   node tools/ops/ui-contrast-audit.js --json report.json  # 导出明细
 *   node tools/ops/ui-contrast-audit.js --strict            # 有确定失败项则退出码 1（供门禁用）
 *
 * 产物：默认只打印报告；--json 时写出结构化明细（不入仓，属体检结果不是基线）。
 */

const fs = require('fs');
const path = require('path');

const kit = require('./ui-lib/screenshot-kit');

// ============================ 参数 ============================

const argv = process.argv.slice(2);
const onlyArg = (() => {
    const i = argv.indexOf('--only');
    return i >= 0 && argv[i + 1] ? argv[i + 1].split(',').map(s => s.trim()).filter(Boolean) : null;
})();
const portArg = (() => {
    const i = argv.indexOf('--port');
    return i >= 0 && argv[i + 1] ? parseInt(argv[i + 1], 10) : 4174;
})();
const themeArg = (() => {
    const i = argv.indexOf('--theme');
    const v = i >= 0 && argv[i + 1] ? argv[i + 1].toLowerCase() : null;
    return v === 'dark' || v === 'light' ? v : null;      // null = 两套都跑
})();
const jsonArg = (() => {
    const i = argv.indexOf('--json');
    return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
})();
const strict = argv.includes('--strict');

const themes = themeArg ? [themeArg] : ['light', 'dark'];
const targets = onlyArg ? kit.TARGETS.filter(t => onlyArg.includes(t.id)) : kit.TARGETS;
const { ab, waitForReady } = kit.createBrowser('ui-a11y');

// ============================ 页面内扫描脚本 ============================

/**
 * 在页面里执行：遍历所有含直接文本的元素，算实际渲染对比度。
 *
 * 几个必须这样做的地方：
 *   1. **只取有直接文本子节点的元素**（childNodes 里的 Text 节点）—— 容器元素
 *      （如 div.card）自身没有文本，它的 color 不参与渲染，算它只会产生噪声。
 *   2. **有效背景要沿祖先链合成**：半透明卡片叠在半透明底上是本项目的常态
 *      （全站几十处 /50 /90），只读元素自己的 backgroundColor 会拿到 transparent。
 *      合成顺序必须从最外层往内（source-over 不满足交换律，反着合是错的）。
 *   3. **前景色也要合成元素的累计 opacity**：一个 opacity:.6 的次要说明文字，
 *      视觉对比度就是比纯色低，如实算进去（而不是一刀切跳过）。
 *   4. **只返回前 40 项**：agent-browser 的 eval 是命令行回传，返回体过长会被截断，
 *      而这里要的是"最差的那些" —— 先排序再截断，既够用又稳。
 */
const SCAN_JS = `(function(){
    function parse(c){
        var m = String(c).match(/rgba?\\(([^)]+)\\)/);
        if (!m) return null;
        var p = m[1].split(',').map(function(x){ return parseFloat(x); });
        return { r:p[0], g:p[1], b:p[2], a:(p.length>3 ? p[3] : 1) };
    }
    function over(fg, bg){
        var a = fg.a;
        return { r: fg.r*a + bg.r*(1-a), g: fg.g*a + bg.g*(1-a), b: fg.b*a + bg.b*(1-a), a:1 };
    }
    function lum(c){
        function f(v){ v/=255; return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); }
        return 0.2126*f(c.r) + 0.7152*f(c.g) + 0.0722*f(c.b);
    }
    function ratio(a, b){
        var l1 = lum(a), l2 = lum(b);
        var hi = Math.max(l1, l2), lo = Math.min(l1, l2);
        return (hi + 0.05) / (lo + 0.05);
    }
    /** 元素自身+祖先的累计不透明度（CSS opacity 是逐层相乘的） */
    function totalOpacity(el){
        var n = el, op = 1;
        while (n && n.nodeType === 1) {
            var o = parseFloat(getComputedStyle(n).opacity);
            op *= isFinite(o) ? o : 1;
            n = n.parentElement;
        }
        return op;
    }
    /** 把 chain（内层→外层顺序）逐层压到 base 上：先画最外层，再往内压（source-over 不服从交换律） */
    function composite(chain, base){
        var acc = base;
        for (var i = chain.length - 1; i >= 0; i--) acc = over(chain[i], acc);
        return acc;
    }
    var CANVAS = { r:255, g:255, b:255, a:1 };      // 画布兜底（html 没设背景时）
    /**
     * 元素"实际看得见的那层背景"是什么。
     *
     * 关键：**由内向外走，遇到不透明的一层就停**。
     *   踩过（第二版只找"第一个 background-image"就开算）：助手头里的按钮自带 bg-white、
     *   分享图 CTA 里的按钮自带 bg-blue-600 —— 它们自己就是不透明的，**上面那层渐变根本看不见**，
     *   却被当成背景，白字对白底算出 1.05:1 的假警报。CSS 的绘制顺序是"近的盖住远的"，
     *   不透明层一出现，它下面的一切（含渐变）都不参与最终颜色。
     *
     * 渐变为什么仍可判定：线性渐变的颜色只在色停之间插值，取**最差色停**即保守下界 ——
     *   宁可多报，不可放过（助手头 from-blue-500 那端白字 3.68:1 就是这么抓出来的）。
     *   只有 url() 背景图真的取不到色，那才留给人工。
     *
     * @returns {{kind:'solid'|'gradient'|'image', chain:Array, stops:Array}}
     *          chain 是**内层→外层**的半透明底色层（都压在渐变之上，合成顺序见 composite），
     *          调用方负责把它们压到渐变色停 / 画布上 —— 层级关系只有调用方知道该以谁为底。
     */
    function backdrop(el){
        var chain = [], n = el, grad = null;
        while (n && n.nodeType === 1) {
            var s = getComputedStyle(n);
            var bi = s.backgroundImage;
            if (bi && bi !== 'none') { grad = bi; break; }   // 渐变在更外层且未被不透明色盖住 → 它参与背景
            var c = parse(s.backgroundColor);
            if (c && c.a > 0) {
                chain.push(c);
                if (c.a >= 1) break;                          // 不透明 → 到此为止，下面的都看不见
            }
            n = n.parentElement;
        }
        if (!grad) return { kind:'solid', chain: chain, stops: [] };
        if (grad.indexOf('url(') >= 0) return { kind:'image', chain: chain, stops: [] };
        var stops = [], re = /rgba?\\(([^)]+)\\)/g, m;
        while ((m = re.exec(grad))) {
            var sc = parse('rgba(' + m[1] + ')');
            if (sc) stops.push(sc);
        }
        return { kind: stops.length ? 'gradient' : 'image', chain: chain, stops: stops };
    }
    function pathOf(el){
        var parts = [], n = el, k = 0;
        while (n && n.nodeType === 1 && k < 4) {
            var s = n.tagName.toLowerCase();
            if (n.id) s += '#' + n.id;
            else if (n.className && typeof n.className === 'string' && n.className.trim()) {
                s += '.' + n.className.trim().split(/\\s+/).slice(0, 3).join('.');
            }
            parts.unshift(s);
            n = n.parentElement;
            k++;
        }
        return parts.join(' > ');
    }
    var items = [], all = document.querySelectorAll('body *');
    for (var i = 0; i < all.length; i++) {
        var el = all[i];
        var txt = '';
        for (var j = 0; j < el.childNodes.length; j++) {
            var nd = el.childNodes[j];
            if (nd.nodeType === 3) txt += nd.nodeValue;
        }
        if (!txt.trim()) continue;                       // 容器自身无文本，跳过
        var s = getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden') continue;
        var r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        var op = totalOpacity(el);
        if (op <= 0.01) continue;                        // 完全透明 = 不可见
        var fgRaw = parse(s.color);
        if (!fgRaw) continue;
        var bd = backdrop(el);
        var fs = parseFloat(s.fontSize) || 16;
        var fw = parseInt(s.fontWeight, 10) || 400;
        var large = fs >= 24 || (fs >= 18.66 && fw >= 700);
        var need = large ? 3 : 4.5;

        function rgbStr(c){ return 'rgb(' + Math.round(c.r) + ',' + Math.round(c.g) + ',' + Math.round(c.b) + ')'; }
        var cr, bgi = false, bgShown;
        if (bd.kind === 'gradient') {
            // 渐变：逐色停算背景（色停在外、半透明内层压在其上），取**最差**的那个
            cr = Infinity;
            for (var si = 0; si < bd.stops.length; si++) {
                var base = bd.stops[si].a >= 1 ? bd.stops[si] : over(bd.stops[si], CANVAS);
                var sb = composite(bd.chain, base);
                var f2 = over({ r:fgRaw.r, g:fgRaw.g, b:fgRaw.b, a:fgRaw.a * op }, sb);
                var c2 = ratio(f2, sb);
                if (c2 < cr) { cr = c2; bgShown = '渐变' + bd.stops.length + '停最差 ' + rgbStr(sb); }
            }
        } else {
            var bg = composite(bd.chain, CANVAS);
            var fg = over({ r:fgRaw.r, g:fgRaw.g, b:fgRaw.b, a:fgRaw.a * op }, bg);
            cr = ratio(fg, bg);
            bgShown = rgbStr(bg);
            bgi = (bd.kind === 'image');     // 有背景图但取不到色 = 待人工
        }
        if (cr < need - 0.005) {
            items.push({
                p: pathOf(el),
                t: txt.trim().slice(0, 24),
                fg: s.color,
                bg: bgShown,
                cr: Math.round(cr * 100) / 100,
                need: need,
                fs: fs, fw: fw,
                bgi: bgi
            });
        }
    }
    items.sort(function(a, b){ return a.cr - b.cr; });
    // 去重（同一处样式在页面上重复几十次，只留一条并计数）
    var seen = {}, uniq = [];
    for (var k = 0; k < items.length; k++) {
        var key = items[k].p + '|' + items[k].fg + '|' + items[k].bg;
        if (seen[key]) { seen[key].n++; continue; }
        items[k].n = 1;
        seen[key] = items[k];
        uniq.push(items[k]);
    }
    return JSON.stringify({ total: items.length, shown: uniq.slice(0, 40), count: uniq.length });
})()`;

// ============================ 执行 ============================

/**
 * eval 的返回值可能被 CLI 再包一层引号（与截图脚本里 replace(/"/g,'') 处理的现象同源），
 * 这里不能简单 strip 双引号 —— JSON 里全是双引号，strip 掉就解析不了。
 * 做法：先整体 JSON.parse 一次（外层是字符串字面量时会成功还原成内部字符串），失败就当裸字符串用。
 */
function parseEval(raw) {
    let s = String(raw || '').trim();
    if (s.startsWith('"')) {
        try { s = JSON.parse(s); } catch (e) { /* 不是合法字符串字面量，按原样往下走 */ }
    }
    return JSON.parse(s);
}

async function auditOne(url, vp, target, theme) {
    await ab(['open', url]);
    await ab(['eval', 'try{localStorage.clear();sessionStorage.clear();' +
        'sessionStorage.setItem("euriskoGuestSession","1");}catch(e){} "ok";']);
    // 视口先于 reload（与截图脚本同一坑）：悬浮球纵坐标按初始化时的 innerHeight 算，
    // 后设视口它不重算。审计虽不看球的位置，但保持两脚本同一时序，结论才对得上图。
    await ab(['set', 'viewport', String(vp.w), String(vp.h)]);
    await ab(['reload']);
    await ab(['eval', kit.themeJs(theme)]);
    await ab(['set', 'viewport', String(vp.w), String(vp.h)]);
    const ready = await waitForReady(6);
    await ab(['eval', kit.themeJs(theme)]);
    await ab(['wait', '2500']);
    await ab(['eval', '(function(){' + target.prepare + '\nreturn "ok";})()']);
    await ab(['wait', '1200']);
    await ab(['eval', kit.FREEZE_JS]);       // 冻结过渡：否则读到的是动画中途的半透明色
    await ab(['wait', '600']);
    const raw = await ab(['eval', SCAN_JS], 60000);
    const data = parseEval(raw);
    // 回读值带引号（CLI 原样回传字符串字面量），不 strip 会永远判定"主题未生效"
    const themeState = String(await ab(['eval',
        '(function(){return document.documentElement.classList.contains("dark")?"dark":"light"})()']))
        .replace(/"/g, '').trim();
    return { data, ready, themeState };
}

(async function main() {
    const server = await kit.startServer(portArg);
    const url = 'http://127.0.0.1:' + portArg + '/';
    console.log('静态服务器已启动：' + url);
    console.log('主题：' + themes.join(', ') + ' · 页面：' + targets.map(t => t.id).join(', '));
    console.log('');

    const report = { at: new Date().toISOString(), runs: [] };
    let hardFail = 0, softFail = 0, notReady = 0, themeWrong = 0;

    for (const theme of themes) {
        for (const t of targets) {
            for (const vp of kit.VIEWPORTS) {
                const label = theme + ' / ' + t.id + ' / ' + vp.w;
                process.stdout.write('  审计 ' + label + ' … ');
                try {
                    const r = await auditOne(url, vp, t, theme);
                    const d = r.data;
                    const hard = (d.shown || []).filter(x => !x.bgi);
                    const soft = (d.shown || []).filter(x => x.bgi);
                    hardFail += hard.length;
                    softFail += soft.length;
                    if (!r.ready) notReady++;
                    if (r.themeState !== theme) themeWrong++;
                    report.runs.push({
                        theme, page: t.id, pageName: t.name, width: vp.w,
                        ready: r.ready, themeState: r.themeState,
                        total: d.total, unique: d.count, items: d.shown || []
                    });
                    console.log('不达标 ' + d.count + ' 处（确定 ' + hard.length +
                        ' / 待人工 ' + soft.length + '）' +
                        (r.ready ? '' : ' [资源未就绪]') +
                        (r.themeState === theme ? '' : ' [主题未生效:' + r.themeState + ']'));
                    for (const x of hard.slice(0, 5)) {
                        console.log('      ' + x.cr + ':1 (需 ' + x.need + ')  ' + x.p);
                        console.log('        「' + x.t + '」  fg=' + x.fg + '  bg=' + x.bg +
                            '  ' + x.fs + 'px/' + x.fw + (x.n > 1 ? '  ×' + x.n : ''));
                    }
                } catch (e) {
                    console.log('失败：' + String(e.message || e).split('\n')[0]);
                }
            }
        }
    }

    server.close();

    console.log('\n===== 对比度审计汇总 =====');
    console.log('确定不达 AA：' + hardFail + ' 处（已扣除渐变背景等取色不可靠项）');
    console.log('待人工确认：' + softFail + ' 处（背景含渐变/图片，脚本取色不可靠）');
    if (notReady) console.log('[警告] ' + notReady + ' 次是在 CDN 资源未就绪时审计的，颜色可能受字体缺席影响');
    if (themeWrong) console.log('[错误] ' + themeWrong + ' 次主题未生效（.dark 没挂上），对应结果不可信');

    if (jsonArg) {
        fs.writeFileSync(path.resolve(jsonArg), JSON.stringify(report, null, 2), 'utf8');
        console.log('明细已写出：' + path.resolve(jsonArg));
    }

    if (hardFail > 0) {
        console.log('\n[FAIL] 存在确定不达 AA 的文本' + (strict ? '（--strict）' : '（未加 --strict，退出码仍为 0）'));
        if (strict) process.exit(1);
    } else {
        console.log('\n[OK] 未发现确定不达 AA 的文本。');
    }
})().catch(e => {
    console.error('\n[FATAL] ' + (e && e.stack || e));
    process.exit(1);
});
