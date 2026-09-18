// UI 合规守护 —— 两条容易被后来人悄悄摘掉的东西：
//   ① 结果页免责声明（ui-design-spec.md §2.4 / §12.6 / §9.1 第 ⑧ 段）
//   ② Tailwind 自定义类有没有真编译进产物（ui-design-spec.md §12.3）
//
// ① 免责：补齐之前，20 个速算器的**屏幕上没有免责声明**，而导出报告与分享图都有 ——
//    可带走的东西有免责、看得最久的那一屏反而没有（www.example.com 型合规预防针），
//    补齐后不钉住，后续重构删掉一个是零成本且无人发现的。
//
// ② 产物：`tailwind.src.css` 里用 `@apply` 写出来的自定义类，**必须**被 `npm run build:css`
//    编译进 `src/css/tailwind.css`。这是本仓库最容易真发生的一类事故：
//    改了源码没跑构建（或跑了没把产物提交），类名还挂在 DOM 上、控制台零报错，
//    页面却是完全没样式的 —— 2026-09-17 实测发现 Phase 2 的 `result-conclusion` /
//    `result-reason` / `result-disclaimer` 三个类就是这样缺着的。
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const INDEX_HTML = read('index.html');
const SRC_CSS = read('src/css/tailwind.src.css');
const OUT_CSS = read('src/css/tailwind.css');
const OTHER_CSS = ['src/css/tokens.css', 'src/css/toolbox.css'].map(read).join('\n');

// index.html 里「会展示测算结果」的顶层页容器：20 个速算器共用一个壳 + 剩余的完整测算页
// 17B-1（v1.47.0）：经营所得的旧页面整页删除了，它的结果区改由 spec 驱动的向导渲染 ——
// 向导的免责声明不在静态 HTML 里，由 tests/business-income-core.test.js 的端到端用例守护。
// 17B-2（v1.48.0）：反向倒算同此 —— 由 tests/reverse-migration.test.js 走端到端守护。
// 这里每少一个条目都要**有对应的替代守护**，否则免责声明就多了一个零成本删得掉的缺口。
const RESULT_PAGES = [
    'quick-calculator-page',
    'forward-calculation-page',
    'classification-calculation-page'
];

function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 按顶层 `.page` 容器切分 HTML —— 不切片的话，某页缺免责会被「另一页里有」掩盖过去
function pageSlices(html) {
    const starts = [];
    const re = /<div id="([a-z-]+)" class="page[^"]*"/g;
    let m;
    while ((m = re.exec(html))) starts.push({ id: m[1], start: m.index });
    return starts.map((s, i) => ({
        id: s.id,
        body: html.slice(s.start, i + 1 < starts.length ? starts[i + 1].start : html.length)
    }));
}

// tailwind.src.css 里「用 @apply 定义出来的」自定义类名
function customClasses(css) {
    const found = [];
    const re = /^\s*\.([a-zA-Z0-9_-]+)\s*\{[^}]*@apply/gm;
    let m;
    while ((m = re.exec(css))) found.push(m[1]);
    return Array.from(new Set(found));
}

describe('结果页免责不能有缺口', () => {
    test('四个结果页容器都还在（防「死选择器」重演：容器改名后断言先红）', () => {
        const ids = pageSlices(INDEX_HTML).map((s) => s.id);
        RESULT_PAGES.forEach((id) => expect(ids).toContain(id));
    });

    test('每个结果页都就地给出免责声明，而不是把它藏在页脚', () => {
        const missing = pageSlices(INDEX_HTML)
            .filter((s) => RESULT_PAGES.includes(s.id))
            .filter((s) => !s.body.includes('不构成税务建议'))
            .map((s) => s.id);
        expect(missing).toEqual([]);
    });

    test('免责声明用统一的 result-disclaimer 段落，不各写一套行内样式', () => {
        const bad = pageSlices(INDEX_HTML)
            .filter((s) => RESULT_PAGES.includes(s.id))
            .filter((s) => s.body.includes('不构成税务建议'))
            .filter((s) => !s.body.includes('class="result-disclaimer"'))
            .map((s) => s.id);
        expect(bad).toEqual([]);
    });
});

describe('Tailwind 自定义类必须真的编译进产物', () => {
    test('index.html 用到的 @apply 自定义类，tailwind.css 里都要有对应规则', () => {
        const missing = customClasses(SRC_CSS).filter((cls) => {
            if (!new RegExp('class="[^"]*\\b' + escapeRe(cls) + '\\b').test(INDEX_HTML)) return false; // 没用到就不要求
            if (new RegExp('\\.' + escapeRe(cls) + '\\s*\\{').test(OTHER_CSS)) return false;            // 别处独立定义了，不依赖 Tailwind
            return !OUT_CSS.includes('.' + cls + '{');
        });
        expect(missing).toEqual([]);
    });

    test('至少确实扫到了自定义类（防正则失效后断言空转）', () => {
        expect(customClasses(SRC_CSS).length).toBeGreaterThan(20);
    });
});
