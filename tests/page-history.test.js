/**
 * Phase 1.5：页面导航与浏览器 History 的同步
 *
 * 覆盖的是一条肉眼很难守住的约束：**UI 返回按钮与系统返回手势必须走同一条路径**。
 * 站点切页只改 hidden 类、天然不产生 history 条目；一旦两边各记一半账，
 * 表现就是「按了返回却跳到一个早已离开的页面」—— 比直接退出应用还难解释。
 */
const { loadSource } = require('./helpers/load-source');

const sleep = () => new Promise((r) => setTimeout(r, 0));

describe('EuriskoPageHistory：页面导航 ↔ 浏览器 History', () => {
    let wentBack;

    // jsdom 不做真实的会话历史遍历（history.back() 不会派发 popstate），
    // 因此手动补上「浏览器确定会派发的那一个事件」—— 被测的是我们的处理逻辑。
    const popState = async () => {
        window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
        await sleep();
    };

    // 模块只加载一次：反复求值会产生多个实例、多个 popstate 监听器，
    // 于是一次事件被处理 N 遍 —— 那是测试的锅，不是实现的锅。
    beforeAll(() => {
        loadSource('src/js/utils/page-history.js');
    });

    beforeEach(() => {
        wentBack = [];
        window.EuriskoPageHistory._reset();
        window.EuriskoPageHistory.configure({
            onBack: () => wentBack.push('back'),
            onExit: () => wentBack.push('exit')
        });
    });

    test('前进一次 = 一条真实条目（否则 PWA standalone 里返回手势会直接退出应用）', () => {
        const before = window.history.length;
        expect(window.EuriskoPageHistory.push('a-page', 'b-page')).toBe(true);
        expect(window.EuriskoPageHistory.depth()).toBe(1);
        expect(window.history.length).toBe(before + 1);
    });

    test('原地不动不算前进：不建垃圾条目（避免按一次返回只是跳回同一个页面）', () => {
        expect(window.EuriskoPageHistory.push('a-page', 'a-page')).toBe(false);
        expect(window.EuriskoPageHistory.push(null, 'b-page')).toBe(false);
        expect(window.EuriskoPageHistory.depth()).toBe(0);
    });

    test('UI 返回按钮：先交给浏览器，落地的仍是同一个「回到上一页」动作', async () => {
        window.EuriskoPageHistory.push('a-page', 'b-page');
        window.EuriskoPageHistory.push('b-page', 'c-page');
        expect(window.EuriskoPageHistory.depth()).toBe(2);

        // 返回 true = 已交给 history；真正的切换由随后的 popstate 完成
        expect(window.EuriskoPageHistory.back()).toBe(true);
        await popState();
        expect(wentBack).toEqual(['back']);
        expect(window.EuriskoPageHistory.depth()).toBe(1);
    });

    test('系统返回手势与 UI 返回按钮完全同路（两套账各记一半才会「返回跳错页」）', async () => {
        window.EuriskoPageHistory.push('a-page', 'b-page');
        // 不经由 UI 按钮，直接模拟系统返回
        await popState();
        expect(wentBack).toEqual(['back']);
        expect(window.EuriskoPageHistory.depth()).toBe(0);
    });

    test('已经退到起点：不再劫持，把这一次返回交还宿主（否则用户永远退不出应用）', async () => {
        window.EuriskoPageHistory.push('a-page', 'b-page');
        await popState();
        expect(wentBack).toEqual(['back']);
        expect(window.EuriskoPageHistory.depth()).toBe(0);

        // 再退一次：我们已经无条目可退，不该再消费这一次返回
        expect(window.EuriskoPageHistory.back()).toBe(false);
        await popState();
        expect(wentBack).toEqual(['back', 'exit']);
    });

    test('多次前进后连续返回：一来一回严格配对，不残留', async () => {
        window.EuriskoPageHistory.push('home', 'p1');
        window.EuriskoPageHistory.push('p1', 'p2');
        window.EuriskoPageHistory.push('p2', 'p3');
        expect(window.EuriskoPageHistory.depth()).toBe(3);

        await popState();
        await popState();
        expect(window.EuriskoPageHistory.depth()).toBe(1);
        expect(wentBack).toEqual(['back', 'back']);
    });

    test('受限容器（pushState 抛异常）降级为不接管，而不是每次切页都报错', () => {
        const real = window.history.pushState;
        window.history.pushState = () => { throw new Error('SecurityError'); };
        try {
            loadSource('src/js/utils/page-history.js');
            window.EuriskoPageHistory._reset();
            expect(() => window.EuriskoPageHistory.push('a-page', 'b-page')).not.toThrow();
            expect(window.EuriskoPageHistory.isEnabled()).toBe(false);
            expect(window.EuriskoPageHistory.back()).toBe(false);   // 调用方据此退回内部栈
        } finally {
            window.history.pushState = real;
        }
    });
});

describe('EuriskoPageHistory：纯判定', () => {
    test('isForwardNav / canGoBack', () => {
        loadSource('src/js/utils/page-history.js');
        const { isForwardNav, canGoBack, DEFAULT_HOME } = window.EuriskoPageHistory.pure;
        expect(isForwardNav('a', 'b')).toBe(true);
        expect(isForwardNav('a', 'a')).toBe(false);
        expect(isForwardNav('', 'b')).toBe(false);
        expect(canGoBack(1)).toBe(true);
        expect(canGoBack(0)).toBe(false);
        expect(DEFAULT_HOME).toBe('mode-selection-page');
    });
});
