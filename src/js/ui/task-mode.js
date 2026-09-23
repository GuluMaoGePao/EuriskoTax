/**
 * 阶段14：任务页（多步计税）固定层预算
 *
 * 为什么要它：360×640 实测，多步计税页压着三层常驻占位 —— 全局顶栏 56 + 紧凑顶栏 73 +
 * sticky 预览条 48 = **177px / 640 = 27.7%**，表单只剩 463px。§11 Phase 1 给任务页画的
 * 预算线是 ≤18%（=115px），超出部分就是从「要填十几项的个体户 / 汇算用户」手里抢屏。
 *
 * 这里**不做任何形态决定**，只回答一个问题：当前页是不是任务页。
 * 真正让出高度的是 CSS 里那条 `@media (max-width: 640px)` —— 桌面端形态零变化，
 * 窄屏才折叠全局顶栏并把步骤条并入标题行，改坏了删掉这段 CSS 即可整块回滚。
 */
(function () {
    'use strict';

    var CLASS = 'task-mode';

    /**
     * 判据是「这一页是不是多步任务」，而不是写死四个页面 id ——
     * 以后新增向导式页面自动继承同样的预算，不需要回来改常量表。
     */
    function isTaskPage(pageId) {
        if (!pageId || typeof document === 'undefined') return false;
        var page = document.getElementById(pageId);
        return !!(page && page.querySelector('.calc-sticky-header'));
    }

    /** 同步 body 上的类；返回是否处于任务页。切换成功的代价很低，重复调用无副作用 */
    function sync(pageId) {
        if (typeof document === 'undefined' || !document.body) return false;
        var on = isTaskPage(pageId);
        document.body.classList.toggle(CLASS, on);
        return on;
    }

    window.TaskMode = {
        CLASS: CLASS,
        isTaskPage: isTaskPage,
        sync: sync
    };
})();
