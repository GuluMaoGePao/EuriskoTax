/**
 * 游客会话（免登录使用）—— 只管「这次浏览是不是游客」这一个状态
 *
 * 依据（不是拍脑袋）：stage10 功能矩阵写「游客（未登录）= 免费版：全部计税功能、
 * 本地历史、基础截图导出」，`ui-ux-master-plan.md` 亦明确「❌ 绝不强制登录前置」。
 * 而代码此前是「未登录一律挡在登录页」，与该口径相悖 —— 本项目全部计算都在浏览器内完成、
 * 不需要服务端，登录本就该只承载「云同步 / 权益」而不是使用门槛。
 *
 * 为什么用 session 而不是 local：**保留注册转化入口**。
 * 关掉标签页即失效，下次进来仍然先给登录页；同一次浏览里选过「免登录使用」就一路可用，
 * 不会每次刷新都被踢回去。想变成长期记住，改一行存储位置即可 —— 但那是对 KPI 有影响的决定。
 *
 * 这里不碰 UI、不 import 任何模块（保持可用 eval 单测），
 * 怎么呈现由 auth-ui 的 updateAuthUI 决定。
 */
(function () {
    'use strict';

    var KEY = 'euriskoGuestSession';

    function read() {
        try {
            return window.sessionStorage.getItem(KEY) === '1';
        } catch (e) {
            // 隐私模式 / 禁用存储：当作非游客（回到登录页），不做降级猜测
            return false;
        }
    }

    function write(on) {
        try {
            if (on) {
                window.sessionStorage.setItem(KEY, '1');
            } else {
                window.sessionStorage.removeItem(KEY);
            }
        } catch (e) {
            /* 不可写时仅本次会话生效，不抛错 */
        }
    }

    window.EuriskoGuestSession = {
        KEY: KEY,
        isGuest: function () { return read(); },
        enter: function () { write(true); },
        exit: function () { write(false); }
    };
})();
