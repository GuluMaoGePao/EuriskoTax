/**
 * 面向用户展示文案 · 守护断言（docs/guides/user-facing-copy-standard.md §7.2）
 *
 * 为什么需要这一份测试：
 *   文案规范是**文档**，而文档没有执行力。此前同一句免责声明在 index.html / deep-wizard-ui.js /
 *   share-card.js / export-utils.js / 21 个落地页里各写一遍（免责后缀曾有 8 种写法），
 *   改一处漏一处是常态。现在 src/js/** 一律引用 window.CopyStandard，
 *   静态 HTML（index.html 与 seo/*.html）引用不了 JS 常量 —— 那两处就靠这里的断言兜住。
 *
 * 守的是「改回去就失败」的那几条：
 *   ① 免责主句被改字；② 结果区两处文案漂移；③ 广告法极限词回潮；
 *   ④ 付费营销词回潮（本期定位：不做付费，全部留资）；⑤ 备案位漏页；
 *   ⑥ 报告免责四条被改；⑦ 术语不统一（税务部门 / 主管税务机关）；
 *   ⑧ 做不到的留资时效承诺回潮（1 个工作日做不到，见 §2.5）。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { loadSource } = require('./helpers/load-source.js');

loadSource('src/js/copy/copy-standard.js');

const COPY = () => window.CopyStandard;

const readSrc = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** src/js 下面向用户的脚本（排除内部管理台 admin/：它不是给用户看的界面） */
function uiSourceFiles() {
    const out = [];
    const walk = (dir) => {
        fs.readdirSync(dir, { withFileTypes: true }).forEach((d) => {
            const p = path.join(dir, d.name);
            if (d.isDirectory()) {
                if (d.name === 'admin') return;      // 管理台文案不受面向用户规范约束
                walk(p);
            } else if (d.name.endsWith('.js')) {
                out.push(path.relative(ROOT, p).split(path.sep).join('/'));
            }
        });
    };
    walk(path.join(ROOT, 'src', 'js'));
    return out;
}

const seoFiles = () => fs.readdirSync(path.join(ROOT, 'seo'))
    .filter((f) => f.endsWith('.html'))
    .map((f) => 'seo/' + f);

/**
 * 剥掉注释：注释里常引用「已下线的措辞」做说明（例如「原写『了解专业版』，现改为留资」），
 * 那不是给用户看的文案，不剥就会永远误报。
 * HTML 里还嵌着 <script>，所以 HTML 除了剥 <!-- -->，还要接着剥 JS 的 // 与 /* *\/。
 */
function stripJsComments(text) {
    return text
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}
function stripComments(text, kind) {
    if (kind === 'html') return stripJsComments(text.replace(/<!--[\s\S]*?-->/g, ''));
    return stripJsComments(text);
}

// 规范文件自己就是「黑名单」的存放处，扫它等于自己命中自己
const UI_FILES = uiSourceFiles()
    .filter((f) => f !== 'src/js/copy/copy-standard.js')
    .concat(['index.html']);
const UI_TEXT = () => UI_FILES.map((f) => stripComments(readSrc(f), f.endsWith('.html') ? 'html' : 'js')).join('\n');
const SEO_TEXT = () => seoFiles().map((f) => stripComments(readSrc(f), 'html')).join('\n');

describe('CopyStandard 常量本身', () => {
    test('导出齐全：免责 / 隐私 / 留资 / 升级码 / gate / 黑名单', () => {
        ['DISCLAIMER', 'PRIVACY', 'LEAD', 'UPGRADE', 'GATE', 'BLACKLIST'].forEach((k) => {
            expect(COPY()[k]).toBeTruthy();
        });
    });

    test('断言 1：B 型主句字面量固定，不得改字', () => {
        expect(COPY().DISCLAIMER.shortMain).toBe('本测算结果仅供参考，不构成税务建议；');
    });

    test('断言 1b：后缀只能 5 选 1，不得自造', () => {
        expect(Object.keys(COPY().DISCLAIMER.suffix).sort()).toEqual(
            ['annuity', 'disability', 'pension', 'social', 'tax']
        );
        expect(COPY().DISCLAIMER.short('不存在的后缀')).toBe(
            COPY().DISCLAIMER.shortMain + COPY().DISCLAIMER.suffix.tax
        );
    });

    test('断言 6：报告免责四条逐字固定（与 final-report.js 渲染结果同源）', () => {
        expect(COPY().DISCLAIMER.report).toEqual([
            '1. 本报告由 EuriskoTax 根据您填写的测算参数自动生成，结果仅供参考，不构成任何税务、法律或投资建议。',
            '2. 测算基于当前已收录的税收政策与税率表，政策如有调整以国家税务总局及主管税务机关发布为准。',
            '3. 如用于年度汇算清缴申报，请以「个人所得税」APP 或税务机关申报系统核定结果为准；如有疑问请咨询专业税务人员或 12366。',
            '4. 本工具不替代法定申报义务，测算误差导致的任何损失，工具提供方不承担责任。'
        ]);
    });

    test('留资文案不含任何时效（§2.5 时效铁律）', () => {
        const sla = COPY().BLACKLIST.sla;
        ['success', 'consent', 'banner', 'cta', 'badge', 'needMore', 'needMoreSync'].forEach((k) => {
            sla.forEach((w) => {
                expect({ k, w, hit: String(COPY().LEAD[k]).includes(w) }).toEqual({ k, w, hit: false });
            });
        });
    });
});

describe('断言 2：结果区免责两处一致（index.html 与 deep-wizard-ui.js）', () => {
    test('两处都等于 DISCLAIMER.result', () => {
        const html = readSrc('index.html');
        const wizard = readSrc('src/js/ui/deep-wizard-ui.js');
        const line = COPY().DISCLAIMER.result;
        expect(html).toContain(line);
        expect(wizard).toContain(line);
    });
});

describe('断言 3 / 4：面向用户文案的黑名单', () => {
    test('广告法极限词与绝对化承诺不出现', () => {
        const words = COPY().BLACKLIST.absolute;
        const hits = [];
        [UI_TEXT(), SEO_TEXT()].forEach((text, idx) => {
            words.forEach((w) => { if (text.includes(w)) hits.push((idx === 0 ? '站内' : '落地页') + '：' + w); });
        });
        expect(hits).toEqual([]);
    });

    test('付费营销词不出现（本期定位：不做付费，全部留资）', () => {
        const words = COPY().BLACKLIST.paid;
        const hits = [];
        [UI_TEXT(), SEO_TEXT()].forEach((text, idx) => {
            words.forEach((w) => { if (text.includes(w)) hits.push((idx === 0 ? '站内' : '落地页') + '：' + w); });
        });
        expect(hits).toEqual([]);
    });

    test('断言 8：留资时效承诺不出现（1 个工作日做不到）', () => {
        const words = COPY().BLACKLIST.sla;
        const hits = [];
        [UI_TEXT(), SEO_TEXT()].forEach((text, idx) => {
            words.forEach((w) => { if (text.includes(w)) hits.push((idx === 0 ? '站内' : '落地页') + '：' + w); });
        });
        expect(hits).toEqual([]);
    });
});

describe('断言 5：备案位一页都不能漏', () => {
    test('index.html 与 21 个落地页都具备 #site-filing 容器', () => {
        const missing = ['index.html'].concat(seoFiles()).filter((f) => {
            return !readSrc(f).includes('id="site-filing"');
        });
        expect(missing).toEqual([]);
    });

    test('落地页都挂了同一份渲染脚本（否则容器永远是空的）', () => {
        const missing = seoFiles().filter((f) => !readSrc(f).includes('/src/js/ui/site-filing-ui.js'));
        expect(missing).toEqual([]);
    });
});

describe('断言 7：术语统一', () => {
    test('全站「税务部门」出现次数为 0（法定表述是「主管税务机关」）', () => {
        const hits = [];
        UI_FILES.concat(seoFiles()).forEach((f) => {
            const text = stripComments(readSrc(f), f.endsWith('.html') ? 'html' : 'js');
            if (text.includes('税务部门')) hits.push(f);
        });
        expect(hits).toEqual([]);
    });

    test('留资链路一律称「顾问」，不称「客服」', () => {
        const leadFiles = [
            'index.html',
            'src/js/lead/lead-modal.js',
            'src/js/lead/lead-touchpoints.js',
            'src/js/lead/lead-context.js'
        ];
        const hits = leadFiles.filter((f) => {
            const text = stripComments(readSrc(f), f.endsWith('.html') ? 'html' : 'js');
            return text.includes('客服');
        });
        expect(hits).toEqual([]);
    });
});
