/**
 * Phase 1.5：页面导航与浏览器 History 的同步（PWA standalone 应用内返回）
 *
 * 为什么需要这个文件：
 *   站点是单页应用，切页只改 `hidden` 类，**一条 history 条目都不会产生**。
 *   在浏览器里按返回键 = 直接离开整站；加到主屏幕后（PWA standalone）没有地址栏，
 *   安卓返回手势更是**一步退出应用** —— 用户填到第三步的流程就此蒸发。
 *
 * 设计原则（这是最容易做歪的一处）：
 *   **UI 返回按钮与系统返回手势必须走同一条路径**。
 *   如果 UI 按钮只动内部栈、系统返回走另一套判断，两条栈会各自漂移，
 *   表现就是「按了返回却跳到一个早已离开的页面」（设计文档 §8 把这列为前置约束）。
 *   所以这里的规则极简：
 *     前进一次 → 建一条真实条目（depth +1）
 *     返回一次 → 调用 history.back()，由 popstate 触发同一个回到上一页的动作（depth −1）
 *   一来一回严格配对，两套表示自然同步，不需要额外的对账逻辑。
 *
 * 可用性与降级：
 *   file:// 或个别受限容器里 pushState 会抛 SecurityError，此时整体降级为
 *   「不接管 history」（isEnabled() 为 false），调用方退回自己的内部栈 —— 行为与改造前一致。
 *
 * 对外接口：window.EuriskoPageHistory = { configure, push, back, depth, isEnabled, pure }
 */
(function () {
    'use strict';

    // 可用于长期演进的默认首页：内部栈空时，返回应落在用户认识的「家」而不是留白。
    var DEFAULT_HOME = 'mode-selection-page';

    var opts = {
        homeId: DEFAULT_HOME,
        onBack: null,      // 回到上一页的动作，由导航实现提供（auth-ui.js 的 goBack 内部逻辑）
        onExit: null       // 已退到底部时的动作（可选）：给宿主一个「再按一次退出」的机会
    };

    var depth = 0;         // 我们接管的条目数（= 可安全按返回键的次数）
    var listenerBound = false;
    var enabled = typeof window !== 'undefined'
        && typeof window.history === 'object'
        && typeof window.history.pushState === 'function';

    /**
     * 是否值得为这次前进建一条条目（纯函数，便于断言）
     * @param {string|null} from 离开的页 id
     * @param {string} to 要去的页 id
     */
    function isForwardNav(from, to) {
        return !!from && !!to && from !== to;
    }

    /** 还有没有我们创建的条目可以「退回去」（纯函数） */
    function canGoBack(d) {
        return d > 0;
    }

    function configure(o) {
        if (!o) return opts;
        if (o.homeId) opts.homeId = o.homeId;
        if (typeof o.onBack === 'function') opts.onBack = o.onBack;
        if (typeof o.onExit === 'function') opts.onExit = o.onExit;
        bind();
        return opts;
    }

    function push(fromId, toId) {
        if (!enabled || !isForwardNav(fromId, toId)) return false;
        try {
            window.history.pushState({ euNav: depth + 1 }, '');
            depth += 1;
            return true;
        } catch (e) {
            // 受限环境下放弃接管，而不是让每一次切页都抛异常
            enabled = false;
            return false;
        }
    }

    /**
     * UI 上的返回按钮走这里：交给真实 history，落盘动作由 popstate 回调完成。
     * @returns {boolean} true 表示已交给 history（随后会回调 onBack）
     */
    function back() {
        if (!enabled || !canGoBack(depth)) return false;
        window.history.back();
        return true;
    }

    function handlePop() {
        if (depth > 0) depth -= 1;
        if (typeof opts.onBack === 'function') {
            opts.onBack();
        } else if (typeof window !== 'undefined' && typeof window.showPage === 'function') {
            window.showPage(opts.homeId);
        }
    }

    function bind() {
        if (listenerBound || typeof window === 'undefined' || !enabled) return;
        window.addEventListener('popstate', function () {
            // 已经退到我们接管的最后一条：这次返回落在宿主身上（浏览器/PWA 自行处理）
            if (depth === 0) {
                if (typeof opts.onExit === 'function') opts.onExit();
                return;
            }
            handlePop();
        });
        listenerBound = true;
    }

    window.EuriskoPageHistory = {
        configure: configure,
        push: push,
        back: back,
        depth: function () { return depth; },
        isEnabled: function () { return enabled; },
        // 供单测重置（测试之间不该互相污染 history 计数）
        _reset: function () { depth = 0; },
        pure: {
            isForwardNav: isForwardNav,
            canGoBack: canGoBack,
            DEFAULT_HOME: DEFAULT_HOME
        }
    };
})();
