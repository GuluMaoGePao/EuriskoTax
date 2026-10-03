/**
 * 内页容器宽度统一（v1.135.0）
 *
 * 加这套断言前的实测（1280 / 390 双视口，内容净宽 —— 盒子宽减去左右内距）：
 *   首页 1024 / 326 · 工具页 992 / 326 · 我的 992 / 358
 *   六个「我的」二级页：672 / 768 / 896 三种混着写
 * 也就是说：同一个 App 的顶层页有三条栅格，二级页有三种宽度，切页时留白来回跳。
 *
 * 根因不是「忘了写宽度」，是两件事没人管：
 *   ① 容器该不该自带左右内距 —— 首页不带（靠父级 .container）、另两页带，同是
 *      max-w-5xl 却差 32px；
 *   ② 谁在父级 .container 里 —— 首页 / 工具 / 深度测算 / 速算器在，七个「我的」
 *      系列页不在，手机上就少一层 16px。
 *
 * 这里守的是「以后新增内页不许自己挑一个 max-w-*」：顶层跟首页、二级跟设置页。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const HTML = read('index.html');
const SRC_CSS = read('src/css/tailwind.src.css');

// 顶层内页：首页 / 工具页 / 我的（深度测算与速算器页的容器在 JS 与组件类里，见下方各自断言）
const TOP_PAGES = ['mode-selection-page', 'tools-page', 'profile-page'];
// 「我的」的六个二级页
const SUB_PAGES = ['profile-settings-page', 'profile-tax-page', 'profile-data-page',
    'profile-calendar-page', 'profile-history-page', 'profile-batch-page'];

// 取某一页的**第一个子容器**的 class 串（各页内容都装在它里面）
const containerClassOf = (id) => {
    const at = HTML.indexOf(`id="${id}"`);
    expect(at).toBeGreaterThan(-1);
    const open = HTML.indexOf('<div', HTML.indexOf('>', at));   // 跳过本页 <div id=...>
    return HTML.slice(open, HTML.indexOf('>', open));
};

describe('顶层内页：同一条栅格', () => {
    test('首页 / 工具页 / 我的 容器同宽（max-w-5xl）', () => {
        TOP_PAGES.forEach((id) => {
            expect(containerClassOf(id)).toContain('max-w-5xl');
        });
    });

    // 这条守的是「同是 max-w-5xl 却差 32px」：首页原先不带 px-4（左右内距靠父级
    // .container 给），另两页自带 —— 桌面 1024 vs 992，手机 326 vs 358。
    test('三个容器都自带 px-4（左右内距不许推给父级）', () => {
        TOP_PAGES.forEach((id) => {
            expect(containerClassOf(id)).toContain('px-4');
        });
    });

    // 根因②：七个「我的」系列页原先直接挂在 #app-container 下，不在 .container 里，
    // 手机上比其余内页少一层 16px。补包裹比给每页补 padding 可靠 —— padding 只在
    // 某个断点对得上，跨断点又会错开。
    test('「我的」系列页与其余内页在同一个 .container 里', () => {
        const at = HTML.indexOf('id="profile-page"');
        expect(HTML.slice(Math.max(0, at - 1200), at)).toContain('<div class="container mx-auto px-4">');
        // 闭合：最后一个二级页（批量）之后要收口
        const last = HTML.indexOf('id="profile-batch-page"');
        expect(HTML.slice(last, last + 6000)).toMatch(/<\/div><!-- \/\.container/);
    });

    // share-landing.js 用 `#mode-selection-page .max-w-5xl` 定位首页容器挂载分享落地引导：
    // 类名摘了，分享落地首屏引导就挂不上（静默失效，不报错）。
    test('首页容器的 max-w-5xl 类名保留（share-landing.js 按它定位）', () => {
        expect(read('src/js/share/share-landing.js')).toContain('#mode-selection-page .max-w-5xl');
        expect(containerClassOf('mode-selection-page')).toContain('max-w-5xl');
    });
});

describe('「我的」二级页：同宽 + 面包屑对齐', () => {
    test('六个二级页容器同宽（max-w-3xl + px-4）', () => {
        SUB_PAGES.forEach((id) => {
            const cls = containerClassOf(id);
            expect(cls).toContain('max-w-3xl');
            expect(cls).toContain('px-4');
        });
    });

    // 二级页比顶层窄一档（768 vs 1024）是层级表达，不是随手写的 —— 只要六个之间
    // 没有第三种值即可。672(2xl) / 896(4xl) 是并掉的两档，不许再冒出来。
    test('二级页容器不再出现 2xl / 4xl（已并到 3xl）', () => {
        SUB_PAGES.forEach((id) => {
            const cls = containerClassOf(id);
            expect(cls).not.toContain('max-w-2xl');
            expect(cls).not.toContain('max-w-4xl');
        });
    });

    // 面包屑条就长在二级页的内容容器**里面**，inner 再限一次 max-w、再补一次 px-4
    // 是双重缩进 —— 返回按钮的左边缘比下面内容右移 16px（实测 704 vs 736）。
    test('.profile-sub-nav-inner 不再重复限宽与内距', () => {
        const start = SRC_CSS.indexOf('.profile-sub-nav-inner {');
        expect(start).toBeGreaterThan(-1);
        const block = SRC_CSS.slice(start, SRC_CSS.indexOf('}', start));
        expect(block).not.toContain('max-w-');
        expect(block).not.toContain('px-');
        expect(block).not.toContain('mx-auto');
    });

    // 条是全宽 sticky，左右内距压在条上会让 inner 比内容区窄 —— 内距交给 inner 那层。
    test('.profile-sub-nav 自身不带左右内距', () => {
        // 行首匹配：跳过 `.dark .profile-sub-nav { ... }`（那条只换背景色，没有 padding）
        const re = /^\s*\.profile-sub-nav \{[^}]*\}/gm;
        const blocks = SRC_CSS.match(re) || [];
        expect(blocks.length).toBeGreaterThan(0);
        blocks.forEach((b) => expect(b).toMatch(/padding:\s*[\d.]+rem\s+0/));
    });
});
