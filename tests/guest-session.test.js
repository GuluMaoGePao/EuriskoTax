/**
 * 游客会话（免登录使用）
 *
 * 这一组盯的是**三条改坏之后不会报错、只会悄悄退化的路径**：
 *   1. 游客态被 updateAuthUI 踢回登录页 —— 「免登录使用」点了等于没点；
 *   2. 登出不清游客标记 —— 换账号共用浏览器时等于没退出去（隐私，不是体验问题）；
 *   3. showPage 无条件放行主容器 —— 等于把登录墙整个拆掉，谁都能绕过。
 * 反向用一句话概括：**游客可以有户口，但登录墙不能被无感拆除，退出键必须一直有效。**
 */
const fs = require('fs');
const path = require('path');
const { loadSource } = require('./helpers/load-source');

const INDEX_HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const AUTH_UI = fs.readFileSync(path.join(__dirname, '..', 'src', 'js', 'auth', 'auth-ui.js'), 'utf8');

describe('EuriskoGuestSession：状态机', () => {
    beforeAll(() => {
        loadSource('src/js/auth/guest-session.js');
    });

    beforeEach(() => {
        window.sessionStorage.clear();
    });

    test('默认不是游客 —— 首次进入仍给登录页，注册转化入口不动', () => {
        expect(window.EuriskoGuestSession.isGuest()).toBe(false);
    });

    test('enter / exit 可往返，且状态落在 sessionStorage', () => {
        window.EuriskoGuestSession.enter();
        expect(window.EuriskoGuestSession.isGuest()).toBe(true);
        expect(window.sessionStorage.getItem(window.EuriskoGuestSession.KEY)).toBe('1');

        window.EuriskoGuestSession.exit();
        expect(window.EuriskoGuestSession.isGuest()).toBe(false);
        expect(window.sessionStorage.getItem(window.EuriskoGuestSession.KEY)).toBeNull();
    });

    test('enter 幂等：重复点「免登录使用」不会累积状态', () => {
        window.EuriskoGuestSession.enter();
        window.EuriskoGuestSession.enter();
        expect(window.sessionStorage.getItem(window.EuriskoGuestSession.KEY)).toBe('1');
        expect(window.EuriskoGuestSession.isGuest()).toBe(true);
    });

    test('存储不可用（隐私模式）时按非游客处理，绝不抛错', () => {
        const real = Object.getOwnPropertyDescriptor(window, 'sessionStorage');
        Object.defineProperty(window, 'sessionStorage', {
            configurable: true,
            get() { throw new Error('denied'); }
        });
        try {
            expect(() => window.EuriskoGuestSession.isGuest()).not.toThrow();
            expect(window.EuriskoGuestSession.isGuest()).toBe(false);
            expect(() => window.EuriskoGuestSession.enter()).not.toThrow();
        } finally {
            if (real) Object.defineProperty(window, 'sessionStorage', real);
        }
    });
});

describe('游客会话：跨文件契约（改坏不报错，只会悄悄失效或悄悄拆墙）', () => {
    test('index.html 引入了 guest-session.js', () => {
        expect(INDEX_HTML).toContain('src/js/auth/guest-session.js');
    });

    test('登录墙拆出口后必须补两条回路：登录页有入口、顶栏有回来的登录按钮', () => {
        expect(INDEX_HTML).toContain('id="guest-entry-btn"');
        expect(INDEX_HTML).toContain('id="guest-login-btn"');
        expect(AUTH_UI).toContain("getElementById('guest-entry-btn')");
        expect(AUTH_UI).toContain("getElementById('guest-login-btn')");
    });

    test('游客态下 updateAuthUI 不能再把人踢回登录页', () => {
        expect(AUTH_UI).toContain('if (isGuestSession()) showApp(); else showLoginPage();');
    });

    test('showPage 放行主容器必须被 canUseApp() 守卫 —— 否则等于无条件拆登录墙', () => {
        // 死选择器（全库无 class="app-container"）已清除，改成按 id 取
        expect(AUTH_UI).not.toContain("querySelector('.app-container')");
        // 且放行前要有守卫，不能不问登录态就 remove hidden
        expect(AUTH_UI).toMatch(/if \(canUseApp\(\)\) \{\s*\n\s*document\.getElementById\('app-container'\)\?\.classList\.remove\('hidden'\);/);
    });

    test('登录成功 / 退出登录 / 注销账号三处都要摘掉游客标记', () => {
        const hits = AUTH_UI.match(/exitGuestSession\(\)/g) || [];
        // 定义处 1 次 + 登录成功、退出登录、注销账号各 1 次
        expect(hits.length).toBeGreaterThanOrEqual(4);
    });
});
