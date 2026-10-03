/**
 * 弹窗统一外壳（v1.130.0）
 *
 * 加这套断言前，16 个弹窗的外壳是 14 处**手抄**的 Tailwind 串：宽度 5 档、
 * 限高 4 档（还有 3 个压根没限高 —— about / alert / confirm），头尾没有一处
 * 写 shrink-0，滚动区没有一处写 min-h-0。抄漏的那一遍就是 bug：
 *   · v1.129.0 —— lead 页头被 flex 压扁，价值主张被拦腰裁掉
 *   · v1.130.0 —— about 弹窗在 375×680 下高 810px 顶出视口，备案号飞到屏幕外
 *
 * 这里守的是「以后新增弹窗不许再手抄外壳」：只能挑宽度档，其余由基类保证。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const HTML = read('index.html');
const CSS = read('src/css/ui-redesign.css');
const TOKENS = read('src/css/tokens.css');
// 4 处 JS 动态生成的弹窗模板
const JS_TPL = [
    'src/js/ui/tax-assistant-ui.js', // 税率表速查
    'src/js/ui/scenario-ui.js',      // 我的方案
    'src/js/ui/entity-ui.js',        // 主体 / 模板 / 台账 三个管理器
    'src/js/export/final-report.js'  // 导出版本选择
];

describe('弹窗统一外壳：基类与尺寸档', () => {
    test('基类定义了限高、圆角与纵向 flex', () => {
        const start = CSS.indexOf('.modal-shell {');
        expect(start).toBeGreaterThan(-1);
        const block = CSS.slice(start, CSS.indexOf('}', start));
        expect(block).toContain('max-height: var(--h-modal)');
        expect(block).toContain('flex-direction: column');
        expect(block).toContain('overflow: hidden');
        expect(block).toContain('border-radius: var(--r-sheet)');
    });

    // 头尾不许压：限高之后 flex 会先压缩没有 min-content 保护的那一层，
    // 被压的往往是最不能丢的标题条与操作区。
    test('头尾不许压（flex-shrink: 0）', () => {
        const start = CSS.indexOf('.modal-head,');
        expect(start).toBeGreaterThan(-1);
        const block = CSS.slice(start, CSS.indexOf('}', start));
        expect(block).toContain('.modal-foot');
        expect(block).toContain('flex-shrink: 0');
    });

    // 中间滚：flex 列布局里 flex-1 + overflow-y-auto 必须配 min-h-0，
    // 否则 min-height 默认 auto、滚动区被内容顶开，外面那层限高形同虚设。
    test('滚动区带 min-height: 0（否则限高形同虚设）', () => {
        const start = CSS.indexOf('.modal-body {');
        expect(start).toBeGreaterThan(-1);
        const block = CSS.slice(start, CSS.indexOf('}', start));
        expect(block).toContain('min-height: 0');
        expect(block).toContain('overflow-y: auto');
    });

    test('四档宽度都有令牌，且各档消费对应令牌', () => {
        ['sm', 'md', 'lg', 'xl'].forEach((k) => {
            expect(TOKENS).toContain(`--w-modal-${k}:`);
            expect(CSS).toContain(`.modal-shell--${k} { max-width: var(--w-modal-${k}); }`);
        });
        expect(TOKENS).toContain('--h-modal:');
    });

    // transform 若写进基类，openModal 摘掉 scale-95 类后弹窗永远缩着 ——
    // 入场动画是**靠类**在 HTML 上挂摘的，基类不能抢。
    test('基类不写 transform（入场动画靠外壳上的 scale-95 类挂摘）', () => {
        const start = CSS.indexOf('.modal-shell {');
        const block = CSS.slice(start, CSS.indexOf('}', start));
        expect(block).not.toContain('transform');
        expect(block).not.toContain('scale');
    });
});

describe('弹窗统一外壳：所有弹窗都接入', () => {
    test('10 个静态弹窗全部用上基类', () => {
        const ids = ['help-modal', 'feedback-modal', 'upgrade-modal', 'alert-modal', 'confirm-modal',
            'user-agreement-modal', 'privacy-policy-modal', 'about-modal', 'content-notice-modal', 'lead-modal'];
        ids.forEach((id) => {
            const at = HTML.indexOf(`id="${id}"`);
            expect(at).toBeGreaterThan(-1);
            // 从弹窗起始处取一段，里面必须出现 modal-shell
            expect(HTML.slice(at, at + 900)).toContain('modal-shell');
        });
    });

    test('每个外壳都挑了宽度档（不能只有基类没有档）', () => {
        const shells = (HTML.match(/modal-shell(?= |")/g) || []).length;
        const sized = (HTML.match(/modal-shell--(sm|md|lg|xl)/g) || []).length;
        expect(shells).toBeGreaterThan(0);
        expect(sized).toBe(shells);
    });

    test('4 处 JS 生成的弹窗模板也用上基类', () => {
        JS_TPL.forEach((p) => {
            const src = read(p);
            expect(src).toContain('modal-shell');
            expect(src).toMatch(/modal-shell--(sm|md|lg|xl)/);
        });
    });

    // 限高只走 --h-modal 一处：再有手写的 max-h-[85vh] / [88vh] / [90vh]，
    // 就是在重新制造「同一件事有四个值」。
    test('不再有限高手写字面值（统一走 --h-modal）', () => {
        const all = [HTML, ...JS_TPL.map(read)].join('\n');
        expect(all).not.toMatch(/max-h-\[8\d?vh\]/);
        expect(all).not.toMatch(/max-h-\[9\d?vh\]/);
    });

    test('外壳保留 scale-95（openModal 靠摘这个类做入场动画）', () => {
        // 抽查：每个 modal-shell 出现的同一串里应带 scale-95
        const re = /class="[^"]*modal-shell[^"]*"/g;
        const hits = HTML.match(re) || [];
        expect(hits.length).toBeGreaterThan(0);
        hits.forEach((h) => expect(h).toContain('scale-95'));
    });
});

describe('关于本程序：矮屏不再顶出视口', () => {
    test('头部与可滚区都接上了基类', () => {
        const at = HTML.indexOf('id="about-modal"');
        const block = HTML.slice(at, HTML.indexOf('</div>\n    </div>', at));
        expect(block).toContain('modal-head');
        expect(block).toContain('modal-body');
    });

    // 200px logo + 上下各 -40px 负边距是给「内容短、弹窗矮」的年代定的；
    // 内容排到 810px 之后，它成了把备案号顶出屏幕的主力。
    test('logo 收到 96px、去掉负边距', () => {
        const src = read('src/css/tailwind.src.css');
        const start = src.indexOf('.modal-logo {');
        expect(start).toBeGreaterThan(-1);
        const block = src.slice(start, src.indexOf('}', start));
        expect(block).toContain('width: 96px');
        expect(block).not.toContain('-40px');
    });

    // 数字只由 fillAboutBlurb() 现数（见 auth-ui.js）：这里再写一个「20 个税种」，
    // 加一个场景就得改两处，漏改的结果是弹窗里自己跟自己打架。
    test('副标题不再手写税种数', () => {
        const at = HTML.indexOf('id="about-modal"');
        const block = HTML.slice(at, at + 1200);
        expect(block).not.toMatch(/覆盖\s*\d+\s*个税种/);
    });
});
