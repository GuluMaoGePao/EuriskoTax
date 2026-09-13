/**
 * 阶段13D+：分享落地首屏引导（T4 触点的「落地即引导」）
 *
 * 背景：分享图二维码指向 ?source=share，但此前扫码落地后与自然访问一模一样 ——
 * 用户扫了码却不知道自己到了哪、接下来该做什么，于是直接关掉。首屏给一句明确来历
 * 加一个明确动作，是这条传播链路唯一真正需要的补充。
 *
 * 职责边界（刻意收窄，避免与既有模块重叠）：
 *   - 留资归因：由 lead-modal.js 的 captureLandingSource 读 sessionStorage 负责；
 *   - 漏斗 visit：由 funnel-tracking.js 负责；
 *   - 本文件只管首屏那张欢迎横幅，可随时整体下线而不影响归因与埋点。
 *
 * 对外接口：window.ShareLanding = { bannerHtml }
 */
(function () {
    'use strict';

    var BANNER_ID = 'share-landing-banner';
    var ANCHOR_ID = 'content-home-banner';   // 首页公告条：横幅插在它之后，保持首页既有信息层次
    var HOST_SELECTOR = '#mode-selection-page .max-w-5xl';
    var SCROLL_TARGET_ID = 'home-start-card'; // 「开始计算」卡片
    var SOURCE_RE = /[?&]source=share(\b|$)/i;

    function isShareLanding() {
        try {
            return SOURCE_RE.test(window.location.search);
        } catch (err) {
            return false;
        }
    }

    function bannerHtml() {
        return '' +
            '<div class="flex items-start gap-3 rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-4">' +
                '<div class="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">' +
                    '<i class="fa fa-share-alt text-lg"></i>' +
                '</div>' +
                '<div class="flex-1 min-w-0">' +
                    '<h3 class="font-bold text-gray-800 text-sm">这是朋友分享给您的个税测算</h3>' +
                    '<p class="text-xs text-gray-600 mt-1 leading-relaxed">填入收入和扣除，30 秒算出税后收入与汇算结论；数据只存在本机。</p>' +
                    '<div class="flex flex-wrap items-center gap-2 mt-3">' +
                        '<button type="button" id="share-landing-cta" class="btn btn-primary text-xs px-4 py-2 rounded-lg">算出我的结果</button>' +
                        '<span class="text-[11px] text-gray-500">免费使用 · 不采集收入金额</span>' +
                    '</div>' +
                '</div>' +
                '<button type="button" id="share-landing-close" aria-label="关闭" ' +
                    'class="w-7 h-7 rounded-full text-gray-400 hover:text-gray-600 hover:bg-white/60 flex items-center justify-center shrink-0">' +
                    '<i class="fa fa-times"></i>' +
                '</button>' +
            '</div>';
    }

    function scrollToStart() {
        var target = document.getElementById(SCROLL_TARGET_ID);
        if (!target) return;
        if (typeof target.scrollIntoView === 'function') {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    function bind(banner) {
        var cta = banner.querySelector('#share-landing-cta');
        if (cta) cta.addEventListener('click', scrollToStart);

        var close = banner.querySelector('#share-landing-close');
        if (close) {
            close.addEventListener('click', function () {
                if (banner.parentNode) banner.parentNode.removeChild(banner);
            });
        }
    }

    function inject() {
        if (!isShareLanding()) return;
        if (document.getElementById(BANNER_ID)) return;

        var host = document.querySelector(HOST_SELECTOR) || document.getElementById('mode-selection-page');
        if (!host) return;

        var banner = document.createElement('div');
        banner.id = BANNER_ID;
        banner.className = 'mb-4';
        banner.innerHTML = bannerHtml();

        var anchor = document.getElementById(ANCHOR_ID);
        if (anchor && anchor.parentNode === host) {
            anchor.insertAdjacentElement('afterend', banner);
        } else {
            host.insertBefore(banner, host.firstChild);
        }

        bind(banner);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inject);
    } else {
        inject();
    }

    window.ShareLanding = { bannerHtml: bannerHtml, isShareLanding: isShareLanding };
})();
