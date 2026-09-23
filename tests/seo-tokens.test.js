/**
 * 设计令牌在 SEO 落地页的接入契约（双端 UI 地基 S7）
 *
 * 守的是哪件事：
 *   App 端（Tailwind + tokens.css）与 SEO 落地页（seo/landing.css）曾经是两套各自维护的样式体系，
 *   同一个品牌色存在两份 hex，改版必然漂移。现在落地页的**共享语义色**一律取自 src/css/tokens.css，
 *   本文件把这条契约钉住 —— 否则「接了一次」会在半年内悄悄退回成两份。
 *
 * 为什么不断言「tokens.css 必须在 landing.css 之前加载」：
 *   CSS 变量在**计算值阶段**解析，两个样式表都挂在 :root 上时与链接顺序无关。
 *   断言顺序只会得到一条看起来严谨、实际不成立的假守卫。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SEO_DIR = path.join(ROOT, 'seo');
const LANDING_CSS = path.join(SEO_DIR, 'landing.css');
const TOKENS_CSS = path.join(ROOT, 'src', 'css', 'tokens.css');

const landing = () => fs.readFileSync(LANDING_CSS, 'utf8');
const tokens = () => fs.readFileSync(TOKENS_CSS, 'utf8');
const seoPages = () => fs.readdirSync(SEO_DIR).filter((f) => f.endsWith('.html'));

/** 文件里「声明过」的自定义属性名（含注释里的，够用：宁可放宽，不可漏报） */
function declaredVars(css) {
    const set = new Set();
    const re = /(--[a-z0-9-]+)\s*:/gi;
    let m;
    while ((m = re.exec(css)) !== null) set.add(m[1]);
    return set;
}

/** 文件里「引用过」的自定义属性名 */
function referencedVars(css) {
    const set = new Set();
    const re = /var\(\s*(--[a-z0-9-]+)/gi;
    let m;
    while ((m = re.exec(css)) !== null) set.add(m[1]);
    return set;
}

/** landing.css 里某个角色声明的值，例如 --brand → "var(--c-brand)" */
function roleValue(css, name) {
    const m = css.match(new RegExp(name.replace(/-/g, '\\-') + '\\s*:\\s*([^;]+);'));
    return m ? m[1].trim() : null;
}

describe('SEO 落地页接入设计令牌（S7）', () => {
    test('每个落地页都加载了 tokens.css —— 少一个页面就是一页裸色', () => {
        const pages = seoPages();
        expect(pages.length).toBeGreaterThan(1);

        const missing = pages.filter((f) => {
            const html = fs.readFileSync(path.join(SEO_DIR, f), 'utf8');
            return !html.includes('/src/css/tokens.css');
        });

        expect(missing).toEqual([]);
    });

    test('共享语义色一律映射到令牌，落地页不再持有品牌色副本', () => {
        const css = landing();
        // 这些角色的取值必须来自令牌层；改回字面值即视为漂移
        const sharedRoles = [
            '--brand', '--brand-dark', '--brand-tint', '--brand-line',
            '--ink', '--muted', '--line', '--bg', '--card',
            '--warn', '--warn-bg', '--warn-line'
        ];

        sharedRoles.forEach((role) => {
            const value = roleValue(css, role);
            expect(value).not.toBe(null);
            expect(value.startsWith('var(--c-')).toBe(true);
        });

        // 品牌 hex 不许在落地页样式里以任何形式复活（--brand-grad-end 是靛蓝 #4338ca，不是品牌色）
        expect(css.toLowerCase()).not.toContain('#1e40af');
    });

    test('landing.css 引用的每个变量都有声明 —— 防止拼错或引用已被删掉的令牌', () => {
        const css = landing();
        const declared = new Set([...declaredVars(tokens()), ...declaredVars(css)]);
        const orphans = [...referencedVars(css)].filter((v) => !declared.has(v));

        expect(orphans).toEqual([]);
    });

    test('落地页仍保持零内联样式 —— 视觉统一靠「只有一份共享 CSS」', () => {
        const withStyle = seoPages().filter((f) =>
            fs.readFileSync(path.join(SEO_DIR, f), 'utf8').includes('<style'));

        expect(withStyle).toEqual([]);
    });
});
