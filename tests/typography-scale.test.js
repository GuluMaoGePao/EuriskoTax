/**
 * 字号阶梯（v1.141.0）
 *
 * 加这套断言前的实测：全站字号是「Tailwind 默认档 + 三处任意值」混着写 ——
 *   text-[11px] 54 处 · text-[10px] 25 处 · text-[15px] 2 处
 * 同一个「次级说明」在相邻两个弹窗里可能一个是 11px、一个是 12px；输入框更混乱：
 *   .input-field 不带字号（继承 body 16px），.modal-form 里又被单独收口到 14px，
 *   于是弹窗内外的输入框是两个字号，新控件还得逐个补 text-sm 才知道该多大。
 *
 * 这里的边界：
 *   ① 任意值字号不是「值错了」，是**它绕过了阶梯** —— 54 处里改漏 3 处就又是三种字号。
 *      所以不许再写 text-[Npx]，11px 那档在 tailwind.config.js 里叫 text-micro。
 *   ② 控件字号必须由**控件类自己**声明，不能靠父容器继承 —— 继承的后果是
 *      「同一个 .btn 在留资是 16px、在意见反馈是 14px」。
 *   ③ iOS 的那条约束（聚焦字号 < 16px 会整页缩放）是**聚焦态**的事，不是静态字号的事。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// 会用到 Tailwind 类名的源文件（src/lib 是第三方压缩产物，不算）
function collectSources() {
    const out = [];
    const walk = (dir) => {
        fs.readdirSync(dir, { withFileTypes: true }).forEach((d) => {
            if (d.name === 'node_modules' || d.name === '.git' || d.name === 'dist' || d.name === 'lib') return;
            const p = path.join(dir, d.name);
            if (d.isDirectory()) walk(p);
            else if (/\.(html|js)$/.test(d.name) && !/\.min\./.test(d.name)) out.push(p);
        });
    };
    ['index.html', 'admin.html', 'clean-cache.html', 'src/js'].forEach((t) => {
        const p = path.join(ROOT, t);
        if (!fs.existsSync(p)) return;
        if (fs.statSync(p).isDirectory()) walk(p); else out.push(p);
    });
    return out;
}

const SOURCES = collectSources();
const APP_CSS = read('src/css/tailwind.src.css');
const HTML = read('index.html');
const TAILWIND_CONFIG = read('tailwind.config.js');

// 取 CSS 里某个类的声明块（到第一个 } 为止）
const blockOf = (css, selector) => {
    const start = css.indexOf(selector);
    if (start === -1) return '';
    return css.slice(start, css.indexOf('}', start));
};

describe('字号：不许绕开阶梯', () => {
    test('全站不再出现任意值字号（text-[Npx]）', () => {
        const hits = [];
        SOURCES.forEach((f) => {
            read(path.relative(ROOT, f)).split(/\r?\n/).forEach((line, i) => {
                const m = line.match(/text-\[\d+px\]/g);
                if (m) hits.push(`${path.relative(ROOT, f)}:${i + 1} ${m.join(',')}`);
            });
        });
        expect(hits).toEqual([]);
    });

    // 11px 是规范写明的**下限**（--fs-micro），更小的字在中文小屏上不可辨认。
    // 缺了工具类，写的人就只好写 text-[11px] —— 那正是上一轮 54 处的来源。
    test('11px 档在 Tailwind 里有对应工具类（text-micro），且带 admin 兜底', () => {
        expect(TAILWIND_CONFIG).toContain('micro');
        expect(TAILWIND_CONFIG).toMatch(/micro:\s*'var\(--fs-micro,\s*11px\)'/);
    });
});

describe('控件字号：由控件类自己声明，不靠继承', () => {
    test('.input-field 自己声明字号（静态 14px，与正文同档）', () => {
        expect(blockOf(APP_CSS, '.input-field {')).toMatch(/font-size:\s*var\(--fs-sm/);
    });

    // 静态 14px 会踩 iOS 那条：聚焦字号 < 16px 时 Safari 整页缩放。
    // 解法是**只在聚焦态**补回 16px（站内已有前例 .assistant-search），
    // 而不是让静态字号为它让路 —— 后者会让输入框在弹窗里比正文大一档。
    test('窄屏下 .input-field 聚焦回到 16px（防 iOS 聚焦缩放）', () => {
        const mobile = APP_CSS.slice(APP_CSS.indexOf('@media (max-width: 640px)'));
        expect(mobile).toMatch(/\.input-field:focus[\s\S]{0,200}font-size:\s*var\(--fs-base/);
    });

    // 这条守的是「哪个是准的有两个答案」：弹窗内 14px、弹窗外 16px，
    // 新增控件时到底要不要补 text-sm？—— 不用补，一处收口。
    test('.modal-form 不再单独给控件定字号（已上移到 .input-field）', () => {
        expect(APP_CSS).not.toMatch(/\.modal-form\s+\.input-field\s*\{[^}]*font-size/);
    });

    test('.btn 自己声明字号（弹窗按钮不再随容器继承 16px）', () => {
        expect(blockOf(APP_CSS, '.btn {')).toMatch(/font-size:\s*var\(--fs-sm/);
    });

    // 字段标签要比**输入内容**小一档，否则标签与内容只靠颜色区分，主次分不开。
    test('.label 是次级档（12px），比输入内容小一档', () => {
        expect(blockOf(APP_CSS, '.label {')).toContain('text-xs');
    });
});

describe('工具域二级页：字号落在六档上', () => {
    const TOOLBOX = read('src/css/toolbox.css');
    const REDESIGN = read('src/css/ui-redesign.css');
    // 取某个类定义块的文本（从 `.类名 {` 到下一个 `}`）
    const blockOf = (css, cls) => {
        const at = css.indexOf(cls + ' {');
        expect(at).toBeGreaterThan(-1);
        return css.slice(at, css.indexOf('}', at));
    };

    // 工具域此前有一套自己长出来的字号：**13 / 11 / 11.5 / 12.5 / 10** —— 没有一档在
    // 全站阶梯上（24-30 数值 / 18 标题 / 16 页面名 / 14 正文 / 12 说明 / 11 徽章），
    // 于是工具页与「我的」/ 弹窗虽然同屏，字的大小却各说各话。这里逐类钉住归档结果：
    // 标题与正文 14（--fs-sm）· 说明 12（--fs-xs）· 徽章 11（--fs-micro）。
    test('工具箱文字类只取六档里的字号', () => {
        const EXPECT = [
            ['.tool-search', '--fs-sm'],          // 搜索框是输入，不是说明
            ['.tool-group-title', '--fs-sm'],     // 组标题 = 小节标题
            ['.tool-group-desc', '--fs-xs'],      // 组说明
            ['.tool-entry-title', '--fs-sm'],     // 工具卡标题 = 列表项标题
            ['.tool-entry-desc', '--fs-xs'],
            ['.tool-switch', '--fs-sm'],          // 开关标签是正文
            ['.tool-field-hint', '--fs-xs'],
            ['.tool-result-row', '--fs-sm'],      // 结果行是正文（数字与名目）
            ['.tool-result-note', '--fs-xs'],     // 原 11.5px（半像素档位）
            ['.tool-search-entry-text', '--fs-sm'],
            ['.scenario-name', '--fs-sm'],
            ['.scenario-desc', '--fs-xs'],
            ['.tool-next-item', '--fs-sm'],       // 原 12.5px：可点的正文
            ['.tool-next-btn', '--fs-sm'],        // 按钮一律 14
            ['.tool-badge', '--fs-micro']         // 原 10px：比全站最小档还小
        ];
        EXPECT.forEach(([cls, token]) => {
            expect(`${cls}:${blockOf(TOOLBOX, cls)}`).toContain(`font-size: var(${token})`);
        });
    });

    test('工具域的说明文字不落在装饰性下限档（结果条备注 / 档案补全输入框）', () => {
        expect(blockOf(REDESIGN, '.result-bars__note')).toContain('font-size: var(--fs-xs)');
        // 输入框装的是用户填进去的字，不是说明 —— 原为 12（说明档）
        expect(blockOf(REDESIGN, '.profile-nudge-input')).toContain('font-size: var(--fs-sm)');
    });

    // 工具页三个手填入口（搜索框 / 档案补全 / 参数输入）都是静态 14px，
    // iOS 聚焦 <16px 会整页缩放 —— 与 .input-field / .tool-input 同一条规矩，一个都不能漏。
    test('工具域的输入框都有 iOS 聚焦兜底（窄屏聚焦回 16px）', () => {
        expect(TOOLBOX).toMatch(/\.tool-search:focus\s*\{[\s\S]{0,40}font-size:\s*16px/);
        expect(TOOLBOX).toMatch(/\.tool-input:focus\s*\{[\s\S]{0,40}font-size:\s*16px/);
        expect(REDESIGN).toMatch(/\.profile-nudge-input:focus\s*\{[\s\S]{0,40}font-size:\s*16px/);
    });

    // 速算器页：页面标题 18（与二级页卡片标题同档）· 副标题 12 · 卡内小节标题 14
    test('速算器页的三级：标题 18 · 副标题 12 · 卡内小节 14', () => {
        const at = HTML.indexOf('id="quick-calculator-page"');
        const seg = HTML.slice(at, at + 2500);
        expect(seg).toMatch(/id="quick-title"[^>]*text-lg/);
        expect(seg).toMatch(/id="quick-subtitle"[^>]*text-xs/);
        expect(REDESIGN + read('src/css/tailwind.src.css')).toMatch(/\.home-card-title[\s\S]{0,120}text-sm/);
    });
});

describe('二级页：主次顺序', () => {
    // 「我的」的六个二级页（与 page-width.test.js 的 SUB_PAGES 同一组）
    const SUB_PAGES = ['profile-settings-page', 'profile-tax-page', 'profile-data-page',
        'profile-calendar-page', 'profile-history-page', 'profile-batch-page'];
    const bounds = SUB_PAGES.map((id) => HTML.indexOf(`id="${id}"`));
    const sliceOf = (i) => HTML.slice(bounds[i], i + 1 < bounds.length ? bounds[i + 1] : HTML.length);
    const firstH3Class = (i) => {
        const m = sliceOf(i).match(/<h3[^>]*class="([^"]*)"/);
        return m ? m[1] : null;
    };

    // 收口前：设置页卡片标题 18，默认参数 / 数据管理 / 税务日历却是 20 ——
    // 同一层级的四个页面三种标题感；而顶栏页面名只有 14，卡片标题反倒压过它两档。
    test('二级页卡片标题一律 18（text-lg），不许出现 20（text-xl）', () => {
        const withTitle = SUB_PAGES.map((id, i) => ({ id, cls: firstH3Class(i) })).filter((x) => x.cls);
        expect(withTitle.length).toBeGreaterThanOrEqual(4);
        withTitle.forEach(({ id, cls }) => {
            expect(`${id}:${cls}`).toMatch(/text-lg/);
            expect(cls).not.toMatch(/text-(xl|2xl)/);
        });
    });

    // 顶栏那行是二级页的**页面名**（主标题），此前是 text-sm(14) —— 与卡片正文同档，
    // 页面名叫不动。提到 16：低于卡片标题 18，高于正文 14。
    test('二级页顶栏页面名是主标题档（text-base 16）', () => {
        const block = APP_CSS.slice(APP_CSS.indexOf('.profile-sub-nav-title {'));
        expect(block.slice(0, block.indexOf('}'))).toContain('text-base');
    });

    // 批量页的状态说明（「本批 32 行，一次最多 20 行」）原本用 --fs-micro(11) ——
    // 11px 是装饰性下限，给要读完才懂的句子用会读漏。
    test('说明类文字不落在装饰性下限档（.entity-form-note 用 xs 不用 micro）', () => {
        const REDESIGN = read('src/css/ui-redesign.css');
        const line = REDESIGN.split(/\r?\n/).find((l) => l.startsWith('.entity-form-note {'));
        expect(line).toMatch(/--fs-xs/);
        expect(line).not.toMatch(/--fs-micro/);
    });

    // 这条模板里四个文字原本只有两个写了字号：标题与金额靠继承（16），
    // 日期与删除是 14 —— 一张卡里两种正文，且金额比标题还抢。
    test('历史卡片模板的四个文字都显式归档（14 / 12 / 14 / 12）', () => {
        const AUTH = read('src/js/auth/auth-ui.js');
        const at = AUTH.indexOf('function renderHistoryItems');
        expect(at).toBeGreaterThan(-1);
        const tpl = AUTH.slice(at, AUTH.indexOf('\n}', at));
        expect(tpl).toMatch(/text-sm font-medium text-gray-800/);   // 标题 14
        expect(tpl).toMatch(/text-xs text-gray-500/);               // 日期 12
        expect(tpl).toMatch(/text-sm font-bold text-primary/);      // 金额 14
        expect(tpl).toMatch(/text-xs text-danger/);                 // 删除 12
    });
});

describe('弹窗：标题同一档', () => {
    // 弹窗标题此前大体是 text-lg，只有留资那一个写了 sm:text-xl ——
    // 打开时像另一种层级的窗口。靠眉标 / 说明的层级差强调，不是靠字号更大。
    test('每个弹窗的头部标题都是 text-lg，且不出现更大的档', () => {
        const lines = HTML.split(/\r?\n/);
        const titles = [];
        lines.forEach((l, i) => {
            if (!/class="modal-mask/.test(l)) return;
            for (let j = i; j < Math.min(i + 45, lines.length); j++) {
                const h = lines[j].match(/<h3[^>]*class="([^"]*)"/);
                if (!h) continue;
                titles.push(h[1]);
                break;
            }
        });
        expect(titles.length).toBeGreaterThan(0);
        titles.forEach((cls) => {
            expect(cls).toContain('text-lg');
            expect(cls).not.toMatch(/text-(xl|2xl)/);
        });
    });
});
