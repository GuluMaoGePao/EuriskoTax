/**
 * 站点备案信息（ICP 备案 + 公安联网备案）渲染
 *
 * 为什么做成配置化而不是直接写死在 HTML 里：
 *   1. 备案号**下发之后**才能展示 —— 未备案就展示备案号，与不展示一样违规；
 *      备案审核要 3~5 周，这期间站点照常在境外（Zeabur）跑，组件必须「空号不显示号」；
 *   2. 备案通过 + 切境内节点（阶段16A）时需要改的地方越少越好，
 *      理想状态只改这一个配置，不必动 index.html 和 21 个落地页的页脚；
 *   3. 备案号是**法定义务**项（工信部要求页脚展示并链到 beian.miit.gov.cn），
 *      公安联网备案需在备案通过后 30 日内办理（beian.mps.gov.cn）。
 *
 * ── 当前状态（2026-10-01）────────────────────────────────────
 *   ICP 备案 ✅ 已下发：沪ICP备2026049608号-1（备案网站名称「EuriskoTax税费计算器」）；
 *   公安联网备案 ⏳ 办理中 —— 号下来后把 policeNumber 填上即可，无需改任何 HTML。
 *
 * ── 备案号下发后的操作（只有下面这两行）─────────────────────────
 *   ① ✅ 已完成：icpNumber 已填管局下发的号；
 *   ② ⏳ 公安联网备案办结后填 policeNumber。
 *   占位行会被自动替换掉，无需改任何 HTML —— 全站 22 个页面（App + 21 个落地页）
 *   共用这一个配置，覆盖情况由 tests/copy-standard.test.js 断言 5 与
 *   tests/site-filing.test.js 守住。
 *
 * ── 两件与备案核验有关、但不在这个文件里的事 ────────────────────
 *   ① **网站名称**：管局核验「网站名称与填报一致」，备案填报名是「EuriskoTax税费计算器」
 *      （录入时无空格），站点 title 是「EuriskoTax 税费计算器 - …」。这条一致性由
 *      tests/site-filing.test.js 断言（去空格后比对）守住，改 title 时别把站名改没了；
 *   ② **接入节点**：公安备案要填 IP 与接入商，而生产目前仍在境外（Zeabur）跑 ——
 *      先切境内节点（阶段16A）再办公安备案，否则填报的 IP 与备案接入信息对不上。
 *
 * ── 未备案期间为什么仍要渲染一行（而不是整块隐藏）──────────────
 *   页脚位置先占住：备案号下来时页面不会跳版（原本空号是 display:none，
 *   号一到就多出一行、把底栏往上顶）。占位行只陈述事实 ——
 *   **主体名 + 状态**，绝不写形似备案号的假号（写假号 = 未备案展示备案号，性质是违规）。
 *   不想显示状态语，把 pendingText 置空即可，此时只显示主体名。
 */
(function () {
    'use strict';

    var ICP = {
        // 备案主体：上海鑫惟商务咨询服务有限公司（与承诺书、备案订单主体一致）
        owner: '上海鑫惟商务咨询服务有限公司',

        // ⬇⬇⬇ 备案号下发后只改这两行（icpNumber / policeNumber）⬇⬇⬇
        // ICP 备案 ✅ 2026-10-01 下发（管局下发的号，与备案订单、承诺书主体一致）
        icpNumber: '沪ICP备2026049608号-1',
        // 公安联网备案 ⏳ 办理中（备案通过后 30 日内办结）—— 号下来后填这一行即可，
        // 全站 22 页自动带「沪公网安备 XXXXXXXXXXXX号」并链到 beian.mps.gov.cn。
        policeNumber: '',   // 例：'沪公网安备 31010402000000号'
        // ⬆⬆⬆ 改完这两行，占位行自动替换为正式备案信息 ⬆⬆⬆

        // 未备案时的状态语（置空则只显示主体名）。它描述的是状态，不是号 ——
        // 因此这里**不得出现任何形似备案号的数字串**，tests/site-filing.test.js 会拦。
        pendingText: 'ICP 备案办理中',

        icpUrl: 'https://beian.miit.gov.cn/',
        policeUrl: 'https://beian.mps.gov.cn/#/query/webSearch'
    };

    function link(href, text) {
        return '<a href="' + href + '" target="_blank" rel="noopener" class="hover:underline">' + text + '</a>';
    }

    function render() {
        var host = document.getElementById('site-filing');
        if (!host) return;

        var parts = [];
        if (ICP.icpNumber) parts.push(link(ICP.icpUrl, ICP.icpNumber));
        if (ICP.policeNumber) parts.push(link(ICP.policeUrl, ICP.policeNumber));

        if (parts.length) {
            host.classList.remove('site-filing--pending');
            host.innerHTML = ICP.owner + ' · ' + parts.join(' · ');
        } else {
            // 未备案：显示占位行（占住页脚位置），但绝不显示号
            host.classList.add('site-filing--pending');
            host.innerHTML = ICP.pendingText
                ? ICP.owner + ' · ' + ICP.pendingText
                : ICP.owner;
        }
        host.style.display = '';
    }

    window.EuriskoSiteFiling = { config: ICP, render: render };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', render);
    } else {
        render();
    }
})();
