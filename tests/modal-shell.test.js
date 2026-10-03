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

    // v1.131.0：初版分了四档（28 / 32 / 36 / 48rem），其中 32 与 36 只差 64px ——
    // 反馈、公告、三个管理器是 512，留资是 576，挨着用的两个弹窗一宽一窄，看着就是没统一。
    // 收敛为三档后**默认档只有一个宽度**，弹窗要么「标准」要么「宽」。
    // v1.134.0 再并一次：36（标准）与 48（宽）差 192px —— 挨着用的弹窗（留资 576 →
    // 使用帮助 768）一个窄一个宽，用户眼里还是「没统一」。内容型只剩一个宽度，
    // 取原来更宽的那档（= 使用帮助），窄档留给一句话决策。
    test('只有两档宽度（sm 一句话决策 / lg 内容型）', () => {
        ['sm', 'lg'].forEach((k) => {
            expect(TOKENS).toContain(`--w-modal-${k}:`);
            expect(CSS).toContain(`.modal-shell--${k} { max-width: var(--w-modal-${k}); }`);
        });
        expect(TOKENS).toContain('--h-modal:');
        // 被并掉的两档不许再冒出来
        expect(TOKENS).not.toContain('--w-modal-md');
        expect(TOKENS).not.toContain('--w-modal-xl');
        expect(CSS).not.toContain('.modal-shell--md');
        expect(CSS).not.toContain('.modal-shell--xl');
    });

    test('内容型档 = 48rem（与使用帮助同宽）', () => {
        expect(TOKENS).toMatch(/--w-modal-lg:\s*48rem/);
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
        const sized = (HTML.match(/modal-shell--(sm|lg)/g) || []).length;
        expect(shells).toBeGreaterThan(0);
        expect(sized).toBe(shells);
    });

    test('4 处 JS 生成的弹窗模板也用上基类', () => {
        JS_TPL.forEach((p) => {
            const src = read(p);
            expect(src).toContain('modal-shell');
            expect(src).toMatch(/modal-shell--(sm|lg)/);
        });
    });

    // 「宽度统一」的可度量表达：绝大多数弹窗落在**同一个**默认档上。
    // 只有内容本身需要（长文要少换行、一句话决策要窄）才离开默认档。
    test('内容型档覆盖除决策型外的全部弹窗', () => {
        const all = [HTML, ...JS_TPL.map(read)].join('\n');
        const lg = (all.match(/modal-shell--lg/g) || []).length;
        const sm = (all.match(/modal-shell--sm/g) || []).length;
        // 11 = 反馈 / 升级码 / 公告 / 关于 / 留资 / 协议×2 / 帮助 + 三处 JS 模板
        //       （三个管理器共用一处 / 税率表 / 我的方案）
        expect(lg).toBe(11);
        expect(sm).toBe(3);                   // alert / confirm / 导出版本：一句话决策
        expect(lg + sm).toBe(14);             // 与「所有外壳都挑了档」那条的总数对齐
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

describe('遮罩层：底色与层级走令牌', () => {
    test('遮罩类存在，且用 --z-modal / --c-mask', () => {
        const start = CSS.indexOf('.modal-mask {');
        expect(start).toBeGreaterThan(-1);
        const block = CSS.slice(start, CSS.indexOf('}', start));
        expect(block).toContain('z-index: var(--z-modal)');
        expect(block).toContain('background: var(--c-mask)');
        expect(TOKENS).toContain('--c-mask:');
    });

    // 这条守的是「弹窗关不掉」：本文件在 tailwind.css 之后引入，同为单类选择器时
    // 后引入者胜 —— 若直接写 display: flex，会压过 `.hidden{display:none}`。
    test('display 只在 :not(.hidden) 时给（否则弹窗永远关不掉）', () => {
        const start = CSS.indexOf('.modal-mask {');
        const block = CSS.slice(start, CSS.indexOf('}', start));
        expect(block).not.toContain('display: flex');
        expect(CSS).toContain('.modal-mask:not(.hidden)');
        const shown = CSS.slice(CSS.indexOf('.modal-mask:not(.hidden) {'), CSS.indexOf('}', CSS.indexOf('.modal-mask:not(.hidden) {')));
        expect(shown).toContain('display: flex');
    });

    test('不再有遮罩底色与 z-50 字面量', () => {
        const all = [HTML, ...JS_TPL.map(read)].join('\n');
        expect(all).not.toContain('bg-black/50 flex items-center justify-center z-50');
        expect(all).not.toContain('bg-slate-900/60 flex items-center justify-center z-50');
    });

    test('14 处背景层都换成 modal-mask', () => {
        const all = [HTML, ...JS_TPL.map(read)].join('\n');
        expect((all.match(/modal-mask/g) || []).length).toBe(14);
    });
});

describe('手机端：内容型弹窗铺满全屏', () => {
    // 这条守的是「伪全屏」：只改 width 不改 max-height，弹窗仍是 85vh，底部留一条遮罩；
    // 只改外壳不改 head 的圆角，方形外壳里会露出两个圆角，四角像缺了一块。
    const mqStart = () => CSS.indexOf('@media (max-width: 639.98px), (max-height: 480px)');

    test('有窄屏/矮屏的全屏规则，且只作用于 --lg', () => {
        const at = mqStart();
        expect(at).toBeGreaterThan(-1);
        const block = CSS.slice(at, CSS.indexOf('\n}', at));
        expect(block).toContain('.modal-shell--lg');
        expect(block).not.toContain('.modal-shell--sm');   // 一句话决策不全屏
        expect(block).toContain('max-width: none');
        expect(block).toContain('max-height: none');       // ① 摘掉 85vh，否则不是全屏
        expect(block).toContain('border-radius: 0');       // ② 外壳圆角归零
    });

    test('高度用 100dvh（vh 不跟地址栏伸缩，iOS 上会漏一条白边）', () => {
        const block = CSS.slice(mqStart(), CSS.indexOf('\n}', mqStart()));
        expect(block).toMatch(/height:\s*100vh;/);         // 老浏览器兜底
        expect(block).toMatch(/height:\s*100dvh;/);
    });

    test('头尾补了安全区（刘海压标题 / 小黑条压按钮）', () => {
        const block = CSS.slice(mqStart(), CSS.indexOf('\n}', mqStart()));
        expect(block).toContain('env(safe-area-inset-top');
        expect(block).toContain('env(safe-area-inset-bottom');
        // head 自己的 rounded-t-xl 也得跟着归零
        expect(block).toContain('.modal-shell--lg > .modal-head');
        expect(block).toContain('.modal-shell--lg > .modal-foot');
    });
});

describe('滚动条粗细统一', () => {
    test('细滚动条规格挂在 .modal-body 上（不再只有两个弹窗有）', () => {
        const start = CSS.indexOf('.modal-body::-webkit-scrollbar {');
        expect(start).toBeGreaterThan(-1);
        const block = CSS.slice(start, CSS.indexOf('.modal-body::-webkit-scrollbar-track'));
        expect(block).toContain('width: 6px');
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

describe('表单型弹窗（意见反馈 / 留资 / 升级码）：宽度与内部度量统一', () => {
    // 为什么要单拎这一组（v1.133.0）：宽度档位早就统一了（三颗都是 md，实测桌面 547px），
    // 但打开起来仍不像一家 —— 差的是**内部度量**：body 内距各写各的、控件宽度少一个
    // w-full、控件字号一个靠容器收口一个逐个补。这些"每个弹窗自己写一遍"的东西，
    // 写漏一遍就对不齐，所以收口成 .modal-form 一处 + 下面这组断言。
    const FORM_MODALS = ['feedback-modal', 'lead-modal', 'upgrade-modal'];

    const blockOf = (id) => {
        const at = HTML.indexOf(`id="${id}"`);
        expect(at).toBeGreaterThan(-1);
        return HTML.slice(at, HTML.indexOf('id="alert-modal"') > at ? HTML.indexOf('id="alert-modal"') : at + 12000);
    };

    test('三颗都在同一个宽度档（md）—— 宽度同源', () => {
        FORM_MODALS.forEach((id) => {
            const shell = blockOf(id).match(/class="[^"]*modal-shell[^"]*"/);
            expect(shell).not.toBeNull();
            expect(shell[0]).toContain('modal-shell--lg');
        });
    });

    test('三颗 body 都挂 .modal-form（内距与控件字号一处收口）', () => {
        FORM_MODALS.forEach((id) => {
            const body = blockOf(id).match(/class="[^"]*modal-body[^"]*"/);
            expect(body).not.toBeNull();
            expect(body[0]).toContain('modal-form');
        });
    });

    // 本文件在 tailwind.css 之后引入：body 上若还留着 p-6 / px-5，会被 .modal-form 盖掉，
    // 留着只是让人误以为内距由那几个类决定 —— 两处写同一件事，改一处看起来没生效。
    test('body 上不再留手写内距类（内距只由 .modal-form 一处决定）', () => {
        FORM_MODALS.forEach((id) => {
            const body = blockOf(id).match(/class="[^"]*modal-body[^"]*"/)[0];
            expect(body).not.toMatch(/\b(p|px|py|pt|pb)-\d/);
        });
    });

    // 「整体评分」原先没写宽度，按内容自适应，比上面「反馈类型」窄一截 ——
    // 两颗上下挨着却不对齐，是这颗弹窗最扎眼的宽度不一致。
    test('意见反馈的控件全部 w-full（下拉与文本框同宽）', () => {
        const block = blockOf('feedback-modal');
        const controls = block.match(/<(select|textarea)[^>]*class="([^"]*)"/g) || [];
        expect(controls.length).toBe(3); // 反馈类型 / 整体评分 / 反馈内容
        controls.forEach((c) => {
            expect(c).toMatch(/class="[^"]*\bw-full\b/);
            expect(c).toMatch(/class="[^"]*\btext-sm\b/);
        });
    });

    // 50 多字的副标题在 576px 头部里折三行，把头顶到 110px（同类 76~80px）——
    // 同一类弹窗的「头」不一样高。后半句已挪到 body 顶部提示条。
    test('意见反馈头部副标题保持一行（不许再把长文案塞回头顶）', () => {
        const head = blockOf('feedback-modal').match(/<div class="modal-head[\s\S]*?<\/div>\s*<\/div>/);
        expect(head).not.toBeNull();
        const paras = head[0].match(/<p[^>]*>([^<]+)<\/p>/g) || [];
        paras.forEach((p) => {
            expect(p.replace(/<[^>]+>/g, '').length).toBeLessThanOrEqual(30);
        });
    });

    test('.modal-form 收口了控件字号，且旧的那条 #lead-modal 规则已收编', () => {
        const start = CSS.indexOf('.modal-form {');
        expect(start).toBeGreaterThan(-1);
        expect(CSS).toContain('.modal-form .input-field');
        // 收编前是 #lead-modal .input-field —— 只有留资生效，新增表单弹窗吃不到
        expect(CSS).not.toMatch(/#lead-modal \.input-field/);
    });
});
