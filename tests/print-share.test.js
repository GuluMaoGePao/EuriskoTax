/**
 * 打印样式与分享图自洽性（双端 UI 地基 S8）
 *
 * 守的两件事：
 *   1) 打印样式不能悄悄失效 —— 它平时完全不生效（只在 print 媒体下），
 *      所以「导航 id 改了名，打印时又印出来了」这类回归，日常点页面永远发现不了，
 *      只能靠断言把「隐藏清单里的 id 必须真实存在」钉住。
 *   2) 分享图必须与全局样式隔离 —— 分享图是把 HTML 塞进挂在 body 上的离屏容器再截图
 *      （src/js/export/capture.js），它活在真实文档里，任何全局元素选择器都会渗进图里。
 *      所以约定：被截图的 HTML 一律内联样式，不挂 class；全局 CSS 也不写裸元素选择器。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function read(rel) {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

const html = read('index.html');
const printCss = read('src/css/print.css');

/** 全部前端 JS 合起来：有些 id 是脚本运行期创建的（如分享图入口块），不在 index.html 里 */
function allJs() {
    const files = [];
    (function walk(dir) {
        fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.name.endsWith('.js')) files.push(full);
        });
    })(path.join(ROOT, 'src'));
    return files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
}

function stripComments(css) {
    return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** 取某个顶层函数的函数体文本（4 空格缩进，结束于行首 4 空格的 `}`） */
function functionBody(source, name) {
    const start = source.indexOf('function ' + name);
    if (start < 0) return null;
    const end = source.indexOf('\n    }', start);
    return end < 0 ? null : source.slice(start, end);
}

describe('打印样式（S8）', () => {
    test('index.html 加载了 print.css', () => {
        expect(html).toContain('src/css/print.css');
    });

    test('print.css 只有 @page 与 @media print 两块 —— 屏幕态零副作用', () => {
        const css = stripComments(printCss).trim();

        expect(css.startsWith('@page')).toBe(true);

        // @page 块之后，剩下的必须整个是 @media print 块：
        // 漏在块外的规则会直接作用于屏幕，而这份文件平时没人会去看一眼。
        const afterPage = css.slice(css.indexOf('}') + 1).trim();
        expect(afterPage.startsWith('@media print {')).toBe(true);
        expect(afterPage.endsWith('}')).toBe(true);
    });

    test('打印隐藏清单里的每个 id 都真实存在 —— 改名即静默失效', () => {
        const ids = [...printCss.matchAll(/#([a-zA-Z0-9_-]+)/g)].map((m) => m[1]);
        expect(ids.length).toBeGreaterThan(5); // 防读空文件导致的假通过

        const corpus = html + allJs();
        const orphan = ids.filter((id) => !corpus.includes('id="' + id + '"') && !corpus.includes("'" + id + "'"));

        expect(orphan).toEqual([]);
    });

    test('打印前摘掉深色模式、打印后还原 —— 少了它，深色模式的纸面是白纸白字', () => {
        const start = html.indexOf('var wasDark');
        expect(start).toBeGreaterThan(-1);

        const block = html.slice(start, start + 600);
        expect(block).toContain("addEventListener('beforeprint'");
        expect(block).toContain("classList.remove('dark')");
        expect(block).toContain("addEventListener('afterprint'");
        expect(block).toContain("classList.add('dark')");
    });
});

describe('分享图与全局样式隔离（S8）', () => {
    test('被截图的三个模板函数全部内联样式，不挂 class', () => {
        const share = read('src/js/share/share-card.js');

        // 分享图容器挂在真实 document.body 上再截图，一旦用了 class，
        // 全局 CSS 就会渗进图里 —— 而且只在「有人改了全局样式」之后才显现。
        ['buildHtml', 'rowHtml', 'qrBlockHtml'].forEach((name) => {
            const body = functionBody(share, name);
            expect(body).not.toBe(null);
            expect(body).not.toContain('class=');
        });
    });

    test('全局 CSS 不写裸元素选择器 —— 元素选择器会渗进分享图容器', () => {
        // 分享图用的是 table / img / td 这些裸标签（内联样式 + table 布局是刻意的：
        // html2canvas 对 flexbox 还原度不稳），所以全局样式里任何 table{} / img{} 都会改图。
        const bare = /^(table|img|div|p|ul|ol|li|h1|h2|h3|h4|h5|span|a|input|select|textarea|button|tr|td|th|section|header|footer|nav|main|label)\s*\{/gm;

        ['src/css/toolbox.css', 'src/css/tokens.css'].forEach((file) => {
            expect(stripComments(read(file)).match(bare)).toBe(null);
        });
    });
});
