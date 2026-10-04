/**
 * 导航分端守卫（v1.136.0）
 *
 * 用户原话："头部导航和底部导航不应该同时存在吧，网页是头部导航，手机是底部导航。
 * 还有顶部的 logo 这一栏也要自适应，手机端应该没有这样的顶栏吧。"
 *
 * 实测证实（390px）：顶栏 56 + 顶部 Tab 行 44 + 底部 Tab 栏 56 = 首屏 156px 全是导航，
 * 其中 Tab 行与底栏是同一份 Tab 的两种投影（syncNav 一份状态驱动两套 DOM），
 * 同屏出现就是重复；顶栏在手机上只剩 logo 图 + 主题 + 登录，是一整条"品牌横幅"。
 *
 * 规则（ui-redesign.css 导航分端段）：
 *   ≤767.98px  → 顶部 Tab 行不显示、顶栏不显示，导航只剩底部 Tab 栏；
 *                calc-sticky-header / profile-sub-nav 的 top-14 让位改贴顶。
 *   ≥768px     → 形态零变化（顶栏 + Tab 行，无底栏）。
 *
 * 为什么守 CSS 而不是守 HTML：这次修的 bug 恰恰是「HTML 的 hidden md:block 在
 * JS 摘掉 hidden 后失效」—— 所以断言必须落在不依赖类的 media query 规则上；
 * HTML 上的类怎么写都拦不住这个 bug。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CSS = fs.readFileSync(path.join(ROOT, 'src/css/ui-redesign.css'), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const AUTH_UI = fs.readFileSync(path.join(ROOT, 'src/js/auth/auth-ui.js'), 'utf8');

describe('导航分端：桌面头部导航 / 手机底部导航，互不并存', () => {
    // 这条是本次 bug 的根因修复：top-tabbar 的小屏隐藏必须由 media query 保证，
    // 不能依赖可被 syncNav 摘掉的 hidden 类（摘掉后 nav 默认 display:block 就露出来了）。
    test('手机断点内顶部 Tab 行一律 display:none（不依赖 hidden 类）', () => {
        const m = CSS.match(/@media \(max-width: 767\.98px\) \{[\s\S]*?\n\}/);
        expect(m).not.toBeNull();
        expect(m[0]).toMatch(/\.top-tabbar\s*\{\s*display:\s*none\s*!important/);
    });

    test('手机断点内顶栏（logo 行）display:none，桌面形态不受影响', () => {
        const m = CSS.match(/@media \(max-width: 767\.98px\) \{[\s\S]*?\n\}/);
        expect(m[0]).toMatch(/\.compact-nav\s*\{\s*display:\s*none\s*!important/);
        // 桌面（≥768）没有任何隐藏顶栏的规则 —— 形态零变化是这次改造的承诺
        expect(CSS).not.toMatch(/@media[^{]*min-width[^{]*\{[^}]*\.compact-nav[^}]*display:\s*none/);
    });

    // top-14 是给顶栏（56px）让的位。顶栏没了还让位，吸顶条上方就是一条 56px 的空带。
    test('顶栏消失后 sticky 让位同步撤掉（贴顶）', () => {
        const m = CSS.match(/@media \(max-width: 767\.98px\) \{[\s\S]*?\n\}/);
        expect(m[0]).toMatch(/\.calc-sticky-header\s*\{\s*top:\s*0/);
        expect(m[0]).toMatch(/\.profile-sub-nav\s*\{\s*top:\s*0/);
    });

    // 功能迁移三件套：手机上没有顶栏，账号动作必须有去处 —— 少一个就是功能丢失。
    test('顶栏的账号动作在「我的」侧有承接（登录 / 深色模式 / 退出）', () => {
        // 游客登录：横幅按钮 + 绑定 + 显隐切换
        expect(HTML).toMatch(/id="profile-guest-login"/);
        expect(AUTH_UI).toMatch(/getElementById\('profile-guest-login'\)/);
        expect(AUTH_UI).toMatch(/guestLoginBtn\.classList\.toggle\('hidden', !guest\)/);
        // 深色模式：卡片配置 + 点击映射（复用顶栏 handler，不复制切换逻辑）
        expect(AUTH_UI).toMatch(/id: 'profile-card-theme'/);
        expect(AUTH_UI).toMatch(/cardId: 'profile-card-theme'/);
        expect(AUTH_UI).toMatch(/function syncThemeCard/);
        // 退出登录：个人中心按钮 + 绑定（2026-10-03 删过的 id 回归）
        expect(HTML).toMatch(/id="profile-logout-link"/);
        expect(AUTH_UI).toMatch(/profileLogoutLink\.addEventListener/);
    });

    // 桌面入口必须原样保留：这次改造的边界是"手机没有顶栏"，不是"删掉顶栏"。
    test('桌面顶栏的账号动作原样保留（登录 / 主题 / 退出菜单）', () => {
        ['id="theme-toggle"', 'id="guest-login-btn"', 'id="logout-link"'].forEach((id) => {
            expect(HTML).toContain(id);
        });
    });
});
