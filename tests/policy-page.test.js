/**
 * 协议类法律文本：页面 vs 弹窗（v1.132.0）
 *
 * 结论先说：协议**做成独立页面**，弹窗只留给「表单内当场读」的场景。
 *
 * 判据（两条）：
 *   ① 跳走会不会丢上下文 —— 丢，就用弹窗（注册表单、留资表单里的「我已阅读并同意」）
 *   ② 要不要 URL 直达 / 打印存档 / 反复查阅 / JS 挂了也还在 —— 要，就用页面
 *
 * 协议是法律文本，② 四条全中：要能发链接给对方、要能打印存档、用户会回来查、
 * 且它是**合规义务**（《个保法》第 17 条要求告知"易于获取"）。这四件事弹窗一件都做不到
 * —— 弹窗没 URL、打印只剩一屏、内容在 JS 里、关掉就没了。所以正文落在
 * agreement.html / privacy.html，静态硬编码。
 *
 * 代价：正文存在两份（页面 + 弹窗）。这份测试就是为这个代价兜底的 ——
 * 逐字比对两份正文，改一边忘另一边直接红。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const HTML = read('index.html');

/** 剥标签 + 压空白：比的是「用户看到的字」，不看排版差异 */
const textOf = (s) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

/** 从 index.html 里切出某个弹窗的正文区（modal-body） */
function modalBody(modalId) {
    const at = HTML.indexOf(`id="${modalId}"`);
    if (at < 0) throw new Error(`找不到弹窗 ${modalId}`);
    const bodyAt = HTML.indexOf('modal-body', at);
    const openEnd = HTML.indexOf('>', bodyAt);
    const close = HTML.indexOf('</div>', openEnd); // 正文区的第一个收口
    return HTML.slice(openEnd + 1, close);
}

/** 从页面里切出正文区（data-policy-body） */
function pageBody(file) {
    const src = read(file);
    const at = src.indexOf('data-policy-body');
    const openEnd = src.indexOf('>', at);
    const close = src.indexOf('</main>', openEnd);
    return src.slice(openEnd + 1, close);
}

const PAIRS = [
    { 名: '用户协议', modal: 'user-agreement-modal', page: 'agreement.html' },
    { 名: '隐私政策', modal: 'privacy-policy-modal', page: 'privacy.html' }
];

describe('协议有独立页面（可分享 / 可打印 / 静态可访问）', () => {
    PAIRS.forEach(({ 名, modal, page }) => {
        test(`${名}：页面存在且有正文容器`, () => {
            const src = read(page);
            expect(src).toContain('data-policy-body');
            expect(src).toContain(`<h1>${名}</h1>`);
        });

        // 这条是本文件的核心：正文两份，必须逐字一致。
        // 漏改一边 = 用户在注册表单里读的协议，和页面上的不是同一份 —— 法律文本出现两个版本。
        test(`${名}：页面正文与弹窗正文逐字一致（改一边必须改另一边）`, () => {
            expect(textOf(pageBody(page))).toBe(textOf(modalBody(modal)));
        });

        test(`${名}：正文静态硬编码，不靠脚本注入（JS 挂了也要在）`, () => {
            const src = read(page);
            const body = src.slice(src.indexOf('<main'), src.indexOf('</main>'));
            expect(body).not.toContain('<script');
            expect(body).toContain('<p>');
        });

        test(`${名}：页脚备案位交给 site-filing-ui.js 渲染（不写死）`, () => {
            const src = read(page);
            expect(src).toContain('id="site-filing"');
            expect(src).toContain('src/js/ui/site-filing-ui.js');
            // 写死备案号 = 备案主体与页面迟早对不上。
            // 注意：隐私政策**正文里**必须写明处理者主体（《个保法》第 17 条），
            // 所以只查页脚那一段不许写死，正文里出现主体名是应该的。
            const ICP = read('src/js/ui/site-filing-ui.js');
            const m = ICP.match(/owner\s*[:=]\s*'([^']+)'/);
            expect(m).not.toBeNull();
            expect(src.slice(src.indexOf('<footer'))).not.toContain(m[1]);
        });

        // 版本号已经要同步五处，页面里再写就是第六处 —— 不写。
        test(`${名}：页面不写版本号（避免又多一处要同步）`, () => {
            expect(read(page)).not.toMatch(/版本\s*\d+\.\d+\.\d+/);
        });
    });

    test('两个页面互相可达（协议与隐私政策是一套）', () => {
        expect(read('agreement.html')).toContain('href="privacy.html"');
        expect(read('privacy.html')).toContain('href="agreement.html"');
    });
});

describe('入口分工：表单内用弹窗，纯阅读走页面', () => {
    // 注册表单勾选行 / 登录·注册 Tab 下的同意行 / 留资同意行 —— 这些地方跳走会丢已填内容
    const FORM_ENTRIES = [
        'register-agree',      // 注册表单勾选
        'auth-agreement-text', // 登录页 Tab 下的同意行（auth-ui.js 渲染）
        'lead-modal'           // 留资表单同意行
    ];

    test('表单内的协议入口仍是弹窗（跳走会丢已填内容）', () => {
        const auth = read('src/js/auth/auth-ui.js');
        // 登录/注册同意行由 JS 渲染成 openPolicyModal 链接（模板串里单引号是转义过的）
        expect(auth).toMatch(/openPolicyModal\(event,\s*\\?'user-agreement-modal/);
        expect(auth).toMatch(/openPolicyModal\(event,\s*\\?'privacy-policy-modal/);

        // 注册勾选行：在登录/注册卡片里，跳走会丢已填内容
        // 链接在勾选框的 label 文本里，位置在 id 之后 —— 前后都要取
        const ra = HTML.indexOf('id="register-agree"');
        const registerRow = HTML.slice(ra - 200, ra + 900);
        expect(registerRow).toMatch(/openPolicyModal\(event,\s*'user-agreement-modal/);
        // 留资同意行
        const leadRow = HTML.slice(HTML.indexOf('id="lead-modal"'), HTML.indexOf('id="lead-modal"') + 30000);
        expect(leadRow).toMatch(/openPolicyModal\(event,\s*'privacy-policy-modal/);
        expect(FORM_ENTRIES.length).toBe(3);
    });

    test('「关于」里的协议走页面（纯阅读，没有要保的表单）', () => {
        const at = HTML.indexOf('id="about-modal"');
        // 切到下一个弹窗为止：窗口给大了会串进后面弹窗里的 openPolicyModal
        const next = HTML.indexOf('id="lead-modal"');
        const block = HTML.slice(at, next > at ? next : at + 3000);
        expect(block).toContain('href="agreement.html"');
        expect(block).toContain('href="privacy.html"');
        expect(block).not.toContain('openPolicyModal');
    });

    test('弹窗底部给出去页面的路（不把要分享/打印的人锁在弹窗里）', () => {
        PAIRS.forEach(({ modal, page }) => {
            const at = HTML.indexOf(`id="${modal}"`);
            // 两个协议弹窗紧挨着：窗口切到下一个弹窗为止，免得串味
            const next = HTML.indexOf('id="privacy-policy-modal"') > at
                ? HTML.indexOf('id="privacy-policy-modal"')
                : HTML.indexOf('id="about-modal"');
            const block = HTML.slice(at, next > at ? next : at + 3000);
            expect(block).toContain(`href="${page}"`);
        });
    });
});

describe('未迁移的弹窗：理由成立（不做为迁而迁）', () => {
    // 判据②的四条里，「速查/保上下文」类弹窗一条都不占 —— 它们留在弹窗是对的。
    // 这里守住的是：别有人顺手把税率表、三个管理器也改成页面。
    test('税率表速查仍是弹窗（算到一半查表，跳页丢输入）', () => {
        expect(read('src/js/ui/tax-assistant-ui.js')).toContain('modal-shell');
        expect(fs.existsSync(path.join(ROOT, 'rate-table.html'))).toBe(false);
    });

    test('三个管理器仍是弹窗（管的是当前测算要用的东西）', () => {
        expect(read('src/js/ui/entity-ui.js')).toContain('modal-shell');
    });

    test('留资仍是弹窗（提交完要回原处）', () => {
        const at = HTML.indexOf('id="lead-modal"');
        expect(HTML.slice(at, at + 400)).toContain('modal-shell');
    });
});
