'use strict';
/**
 * CSS 级联守卫：抓「组件类声明被更高优先级规则静默吃掉」。
 *
 * 背景（这坑在本项目已经踩过两次，两次都是肉眼看出来的）：
 *   - v1.117.0：`.auth-form` 的 display:flex 压过 tailwind 的 `.hidden`；
 *   - v1.120.0：`.auth-alt button`（0,1,1）压过组件类 `.auth-btn-outline`（0,1,0），
 *     游客按钮的描边和底色被吃掉。
 * 根因是 ui-redesign.css 排在 tailwind.css 之后：任何比组件类 (0,1,0) 更高的上下文
 * 选择器都会赢，而且不报任何错。这里用浏览器真实的 cascade 把这类冲突一次性扫出来。
 *
 * 用法：node tools/ops/ui-lib/cascade-guard.js（本机无 playwright 依赖时会 SKIP，不算失败）
 *
 * 踩坑记录（写这段 resetting 重写了 4 遍才跑对，都别再踩）：
 *   ① CSSStyleDeclaration / StyleSheetList / CSSRuleList 都不能可靠地 for...of 迭代
 *      （一条都拿不到），必须按索引取；
 *   ② Chrome 的 CSSStyleRule 上 cssRules 是「空但为真值」的对象 ——
 *      用 `if (r.cssRules) 递归` 会把样式规则当容器递归掉，必须按 r.type === 1 判定；
 *   ③ 优先级必须按逗号拆开逐段算 —— 整串算会把 tailwind preflight 的
 *      `*,::before,::after` 估成高优先级，`button{background:transparent}` 全是误报；
 *   ④ 转义类名（.py-2\.5）要先把 `\.` 占位再计数，否则被当成两个类。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');

// 需要保护的组件类（工具类/布局类不在保护范围 —— 它们被覆盖通常是有意的）
const COMPONENT_CLASSES = [
    'btn', 'btn-primary', 'btn-secondary', 'input-field', 'label', 'card-elevated',
    'auth-submit', 'auth-btn-outline', 'auth-alt__btn', 'auth-tab', 'field-error',
    'pwd-strength', 'switch', 'badge', 'chip'
];

function resolvePlaywright() {
    for (const m of ['playwright-core', 'playwright']) {
        try { return require(m); } catch (e) { /* 继续找 */ }
    }
    // 本机可能只装了 @playwright/cli（playwright-core 在它下面）
    const appData = process.env.APPDATA || '';
    const candidate = path.join(appData, 'npm', 'node_modules', '@playwright', 'cli', 'node_modules', 'playwright-core');
    try { return require(candidate); } catch (e) { return null; }
}

function startStaticServer() {
    const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
    const server = http.createServer((req, res) => {
        const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
        const file = path.resolve(ROOT, rel);
        if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
            res.writeHead(404); res.end('not found'); return;
        }
        res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
        fs.createReadStream(file).pipe(res);
    });
    return new Promise(r => server.listen(0, '127.0.0.1', () => r({ server, port: server.address().port })));
}

// 页面里跑的扫描器（同源，可读 CSSOM）
function scanner() {
    const KEY = window.__GUARD_KEY__;
    const rules = [];
    const walk = (list) => {
        for (let i = 0; i < list.length; i++) {
            const r = list[i];
            if (r.type === 1) rules.push(r);
            else if (r.cssRules) walk(r.cssRules);
        }
    };
    for (let s = 0; s < document.styleSheets.length; s++) {
        try { walk(document.styleSheets[s].cssRules); } catch (e) { /* 跨域 CDN 表，读不到就跳过 */ }
    }

    const cache = {};
    function specOf(sel) {
        if (cache[sel] !== undefined) return cache[sel];
        // 转义点号先占位（.py-2\.5 不能被当成两个类），且**还原不得早于计数**
        const s = sel.replace(/\\\./g, '@').replace(/\\/g, '').replace(/:not\([^)]*\)/g, (m) => m.slice(5, -1));
        const ids = (s.match(/#[\w-]+/g) || []).length;
        const cls = (s.match(/\.[\w-]+/g) || []).length + (s.match(/\[[^\]]+\]/g) || []).length +
            (s.match(/:(?!:)[\w-]+/g) || []).length;
        const tags = (s.replace(/[\.#][\w-]+/g, '').match(/(?:^|[\s>+~])[a-zA-Z][\w-]*/g) || []).length;
        return cache[sel] = ids * 10000 + cls * 100 + tags;
    }
    function maxSpec(sel, el) {
        let best = -1;
        sel.split(',').forEach(p => {
            p = p.trim();
            if (!p) return;
            let ok = false;
            try { ok = el.matches(p); } catch (e) { ok = false; }
            if (ok) best = Math.max(best, specOf(p));
        });
        return best;
    }

    const hits = [];
    document.querySelectorAll(KEY.map(k => '.' + k).join(',')).forEach(el => {
        [...el.classList].filter(c => KEY.includes(c)).forEach(cls => {
            const compRules = rules.filter(r =>
                r.selectorText.split(',').map(x => x.trim()).some(p => p === '.' + cls));
            if (!compRules.length) return;
            const props = new Set();
            compRules.forEach(r => {
                for (let i = 0; i < r.style.length; i++) props.add(r.style[i]);
            });
            if (!props.size) return;
            const compSpec = Math.max(...compRules.map(r => maxSpec(r.selectorText, el)));
            rules.forEach(r => {
                const own = [];
                for (let i = 0; i < r.style.length; i++) if (props.has(r.style[i])) own.push(r.style[i]);
                if (!own.length) return;
                if (maxSpec(r.selectorText, el) <= compSpec) return;
                const parts = r.selectorText.split(',').map(x => x.trim()).filter(p => {
                    try { return el.matches(p); } catch (e) { return false; }
                });
                if (!parts.length) return;
                // 合法的只有「组件自身的单段修饰」：`.cls:disabled`、`.cls[hidden]`、
                // `select.cls` 这种同一元素上的加固。一旦出现组合符（后代/子/兄弟），
                // 权重就是从外部上下文借来的 —— 那正是 v1.120.0 `.auth-alt button` 的形态
                if (parts.every(p => !/[\s>+~]/.test(p))) return;
                hits.push({
                    winner: parts.join(' , '),
                    component: cls,
                    props: own.slice(0, 6).join(','),
                    where: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '.' + el.className.split(' ')[0]),
                    actual: own.slice(0, 3).map(p => p + '=' + getComputedStyle(el)[p]).join(' ')
                });
            });
        });
    });
    return { rulesTotal: rules.length, hits };
}

(async () => {
    const pw = resolvePlaywright();
    if (!pw) {
        console.log('SKIP：本机找不到 playwright（依赖 @playwright/cli 或 npm i -D playwright-core）');
        process.exit(0);
    }
    const { server, port } = await startStaticServer();
    const base = `http://127.0.0.1:${port}/`;
    let failed = false;
    try {
        const browser = await pw.chromium.launch();
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        await page.goto(base, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction('!!window.__APP_VERSION__', null, { timeout: 15000 }).catch(() => { });
        await page.addScriptTag({ content: 'window.__GUARD_KEY__ = ' + JSON.stringify(COMPONENT_CLASSES) + ';' });

        // 自检：故意插一条「外部上下文压组件类」的规则，扫描器必须抓到 ——
        // 否则它退化成瞎子，报 0 反而让人以为存量干净（本地 sr Russelys 就是这样）
        await page.evaluate(() => {
            const s = document.createElement('style');
            s.id = '__guard_selfcheck__';
            s.textContent = 'div .auth-btn-outline { background-color: rgb(255,0,0); }';
            document.head.appendChild(s);
        });
        const self = await page.evaluate(`(${scanner.toString()})()`);
        await page.evaluate(() => document.getElementById('__guard_selfcheck__').remove());
        if (!self.hits.some(h => h.winner.indexOf('div .auth-btn-outline') >= 0)) {
            console.log('[FAIL] 自检未命中 —— 扫描器本身失效，结果不可信，请修 tools/ops/ui-lib/cascade-guard.js');
            failed = true;
        } else {
            console.log(`[OK] 自检通过（规则总数 ${self.rulesTotal}，自检用例被正确抓出）`);
        }

        const clean = await page.evaluate(`(${scanner.toString()})()`);
        console.log(`\n扫描：${clean.rulesTotal} 条 CSS 规则 / ${COMPONENT_CLASSES.length} 个受保护组件类`);
        if (!clean.hits.length) {
            console.log('[OK] 存量干净：没有「外部上下文选择器压过组件类」的情况');
        } else {
            failed = true;
            console.log(`[FAIL] 发现 ${clean.hits.length} 处组件类被更高优先级规则覆盖：`);
            clean.hits.slice(0, 25).forEach(h => {
                console.log(`  ${h.winner}  >>  .${h.component}  (${h.props})`);
                console.log(`      发生于 ${h.where} ；当前生效值 ${h.actual}`);
            });
            console.log('\n  修复思路（v1.120.0 的教训）：把上下文选择器收窄成 :not(.组件类)，');
            console.log('  或降低选择器权重到 (0,1,0) 以下 —— 不要靠!important盖;\n');
        }
        await browser.close();
    } finally {
        server.close();
    }
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error('守卫运行失败：', e.message); process.exit(1); });
