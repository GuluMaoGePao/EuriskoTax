/**
 * 站点备案信息（ICP 备案 + 公安联网备案）渲染
 *
 * 为什么做成配置化而不是直接写死在 HTML 里：
 *   1. 备案号**下发之后**才能展示 —— 未备案就展示备案号，与不展示一样违规；
 *      备案审核要 3~5 周，这期间站点照常在境外（Zeabur）跑，组件必须「空号不渲染」；
 *   2. 备案通过 + 切境内节点（阶段16A）时需要改的地方越少越好，
 *      理想状态只改这一个配置，不必动 index.html 和 20 个落地页的页脚；
 *   3. 备案号是**法定义务**项（工信部要求页脚展示并链到 beian.miit.gov.cn），
 *      公安联网备案需在备案通过后 30 日内办理（beian.mps.gov.cn）。
 *
 * 待办（备案号下发后执行）：
 *   - 把 ICP.icpNumber 改成管局下发的号，如 '沪ICP备2026XXXXXX号-1'；
 *   - 公安联网备案办结后填 policeNumber；
 *   - 落地页（/seo/*.html）页脚需同步加同一段，届时与域名切换脚本一起批量处理。
 */
(function () {
    'use strict';

    var ICP = {
        // 备案主体：上海鑫惟商务咨询服务有限公司（与承诺书、备案订单主体一致）
        owner: '上海鑫惟商务咨询服务有限公司',
        // ICP 备案号（空 = 未备案，组件不渲染任何内容）
        icpNumber: '',
        icpUrl: 'https://beian.miit.gov.cn/',
        // 公安联网备案号（备案通过后 30 日内办理）
        policeNumber: '',
        policeUrl: 'https://beian.mps.gov.cn/#/query/webSearch'
    };

    function render() {
        var host = document.getElementById('site-filing');
        if (!host) return;

        if (!ICP.icpNumber && !ICP.policeNumber) {
            // 未备案：整个容器不占位，避免页脚出现空行
            host.style.display = 'none';
            return;
        }

        var parts = [];
        if (ICP.icpNumber) {
            parts.push('<a href="' + ICP.icpUrl + '" target="_blank" rel="noopener" class="hover:underline">' + ICP.icpNumber + '</a>');
        }
        if (ICP.policeNumber) {
            parts.push('<a href="' + ICP.policeUrl + '" target="_blank" rel="noopener" class="hover:underline">' + ICP.policeNumber + '</a>');
        }
        host.style.display = '';
        host.innerHTML = ICP.owner + ' · ' + parts.join(' · ');
    }

    window.EuriskoSiteFiling = { config: ICP, render: render };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', render);
    } else {
        render();
    }
})();
