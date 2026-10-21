/**
 * 站点备案信息（ICP 备案 + 公安联网备案）渲染
 *
 * 为什么做成配置化而不是直接写死在 HTML 里：
 *   1. 备案号**下发之后**才能展示 —— 未备案就展示备案号，与不展示一样违规；
 *      备案审核要 3~5 周，这期间站点照常在境外跑（当时是 Zeabur，2026-10-10 起已迁腾讯云上海），组件必须「空号不显示号」；
 *   2. 备案通过 + 切境内节点（阶段16A）时需要改的地方越少越好，
 *      理想状态只改这一个配置，不必动 index.html 和 21 个落地页的页脚；
 *   3. 备案号是**法定义务**项（工信部要求页脚展示并链到 beian.miit.gov.cn），
 *      公安联网备案需在备案通过后 30 日内办理（beian.mps.gov.cn）。
 *
 * ── 当前状态（2026-10-21）────────────────────────────────────
 *   ICP 备案 ✅ 已下发：沪ICP备2026049608号-1（备案网站名称「EuriskoTax税费计算器」）；
 *   公安联网备案 ✅ 已下发：沪公网安备31011602003178号 —— 号与查询链接都按
 *   beian.mps.gov.cn 生成的「联网备案代码」原文填装，不自作聪明加空格或改写。
 *
 * ── 两处备案号都已填装，本文件此后只剩一种改法───────────────────
 *   号变了就改 policeNumber / icpNumber 两行（链接里的 code 参数同步换）。
 *   ① App 登录页页尾（本域名首页 / 打开就是它 —— 工信部口径的「首页底部」即此处）；
 *   ② App 内「我的 → 关于我们」弹窗（v1.123.0：主应用**每个页面底部那条常驻页尾已删**，
 *      这里是 App 内唯一的备案落点）；③ 21 个落地页页脚。
 *   覆盖情况由 tests/copy-standard.test.js 断言 5 与
 *   tests/site-filing.test.js 守住。
 *
 * ── 两件与备案核验有关、但不在这个文件里的事 ────────────────────
 *   ① **网站名称**：管局核验「网站名称与填报一致」，备案填报名是「EuriskoTax税费计算器」
 *      （录入时无空格），站点 title 是「EuriskoTax 税费计算器 - …」。这条一致性由
 *      tests/site-filing.test.js 断言（去空格后比对）守住，改 title 时别把站名改没了；
 *   ② **接入节点**：公安备案要填 IP 与接入商，生产已在境内（腾讯云上海轻量），按境内节点填报 ——
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
        // 公安联网备案 ✅ 2026-10-21 下发 —— 号的写法与官方联网备案代码逐字一致
        //（「沪公网安备31011602003178号」，中间无空格）；链接带本站备案码参数，
        // 指向公安备案查询页。配套的警徽图标 images/ghs.png（官方 ghs.png，本地托管，
        // 不热链公安站点资源），渲染见 policeLink()。
        policeNumber: '沪公网安备31011602003178号',

        // 未备案时的状态语（置空则只显示主体名）。它描述的是状态，不是号 ——
        // 因此这里**不得出现任何形似备案号的数字串**，tests/site-filing.test.js 会拦。
        pendingText: 'ICP 备案办理中',

        icpUrl: 'https://beian.miit.gov.cn/',
        policeUrl: 'https://beian.mps.gov.cn/#/query/webSearch?code=31011602003178',
        policeIcon: '/images/ghs.png'
    };

    function link(href, text) {
        return '<a href="' + href + '" target="_blank" rel="noopener" class="hover:underline">' + text + '</a>';
    }

    // 公安备案链接按官方「联网备案代码」生成：警徽 + 备案号整体包在 <a> 里，
    // rel 用官方要求的 noreferrer（noreferrer 蕴含 noopener，安全性只强不弱）。
    // 图标路径用根绝对路径 —— 落地页在 /seo/ 子目录，相对路径会解析成 /seo/images/…。
    function policeLink() {
        return '<a href="' + ICP.policeUrl + '" target="_blank" rel="noreferrer" class="hover:underline">'
            + '<img src="' + ICP.policeIcon + '" alt="公安联网备案"'
            + ' style="display:inline-block;width:15px;height:15px;margin-right:4px;vertical-align:-2px;">'
            + ICP.policeNumber + '</a>';
    }

    /**
     * 收集全部承载容器并逐个渲染。
     *
     * 为什么不能退回 getElementById：全站**不止一处**备案位 —— 登录页页尾、App 内
     * 「关于我们」弹窗（v1.123.0 起，主应用常驻页尾删掉后它就是 App 内的落点）、
     * 21 个落地页各自的页脚。getElementById 只命中第一个，其余留空**且不报错** ——
     * 页面看着正常，备案号实际只在首页出现 —— 这种静默漏页脚的局面往往半年后才被发现。
     */
    function render() {
        const hosts = document.querySelectorAll('#site-filing, [data-site-filing]');
        if (!hosts.length) return;

        const parts = [];
        if (ICP.icpNumber) parts.push(link(ICP.icpUrl, ICP.icpNumber));
        if (ICP.policeNumber) parts.push(policeLink());

        const hasNumber = parts.length > 0;
        const html = hasNumber
            ? ICP.owner + ' · ' + parts.join(' · ')
            // 未备案：显示占位行（占住页脚位置），但绝不显示号
            : (ICP.pendingText ? ICP.owner + ' · ' + ICP.pendingText : ICP.owner);

        hosts.forEach(host => {
            host.classList.toggle('site-filing--pending', !hasNumber);
            host.innerHTML = html;
            host.style.display = '';
        });
    }

    window.EuriskoSiteFiling = { config: ICP, render: render };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', render);
    } else {
        render();
    }
})();
