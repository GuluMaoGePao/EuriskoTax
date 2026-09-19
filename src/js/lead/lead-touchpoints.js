/**
 * 阶段13 B：结果页情境引导（T1 触点）
 *
 * 设计铁律（见阶段13 方案 §3.2）：服务引导只投放在「高意向」结果页，
 * 「工资薪金正向计税 / 谈薪」这类结果页绝不出引导 —— 受众错配只会拉低品牌。
 *   ✓ 经营所得、综合所得年度汇算、分类所得、预算表   → 出引导
 *   ✗ 反向倒算（谈薪）                                → 永不出
 *
 * 分流白名单（ALLOWED_TYPES）与显式排除（BLOCKED_TYPES）是「双保险」，
 * 且该规则是 verify:local 的门禁断言项：防止后续迭代误把引导加到谈薪页。
 *
 * 挂载方式：监听各计算按钮的 click（addEventListener 不覆盖原有内联处理器），
 * 待结果面板渲染后（延后一拍）把引导区块追加到结果容器末尾，天然幂等。
 */
(function () {
    'use strict';

    // 允许投放引导的计算类型（也是门禁断言的正样本）
    var ALLOWED_TYPES = ['forward', 'comprehensive', 'business', 'classification'];
    // 显式排除（也是门禁断言的负样本：'reverse' 绝不出现在 ALLOWED_TYPES 中）
    var BLOCKED_TYPES = ['reverse'];

    // 类型 → 结果容器 + 触点归因（source 需与后端 leadController.SOURCES 一致）
    // 刻意不再携带固定 scene 字符串：情境由 lead-context.js 从已渲染结果反推，
    // 传递不可信的死标签只会把「测算类型名」当成「用户的当前测算」写进线索表。
    var TOUCHPOINTS = {
        // 17B-3（v1.49.0）：综合所得也迁到了 spec 向导，'step-result'（旧页面结果容器）随之删除。
        // 与 business 一样改指向导的结果卡；认人靠 data-tool-id，不是靠 id —— 通用渲染器的节点
        // 被所有 spec 工具复用，写裸 id 等于把别人的结果当成综合所得去归因。
        forward:        { containerId: 'dw-result-card',             source: 'result_settlement' },
        comprehensive:  { containerId: 'dw-result-card',             source: 'result_settlement' },
        // 17B-2：business-step-result 是随旧页面删掉、却一直没跟着改的一行 —— 结果是 business
        // 走完向导，引导因为找不到容器而从不出现（静默失败，没人觉得不对）。改成向导的结果卡。
        business:       { containerId: 'dw-result-card',             source: 'result_business' },
        // 17B-4（v1.50.0）：分类所得也与 business / forward 一样指向导的结果卡。
        // 'classification-step-result' 是随旧页面删掉的 —— 引导会因为找不到容器而从不出现
        // （静默失败，没人觉得不对：明明算完了却没人推荐）。
        classification: { containerId: 'dw-result-card', source: 'result_budget' }
    };

    var GUIDE_ID = 'lead-result-guide';

    function guideHTML(source, type) {
        return '' +
            '<div class="flex items-start gap-3 sm:gap-4">' +
                '<div class="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">' +
                    '<i class="fa fa-user-circle-o text-lg"></i>' +
                '</div>' +
                '<div class="flex-1 min-w-0">' +
                    '<div class="flex items-center gap-2 flex-wrap">' +
                        '<h3 class="font-bold text-gray-800 text-sm">算完先看这三项，参数别填错</h3>' +
                        '<span class="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">免费</span>' +
                    '</div>' +
                    '<p class="text-xs text-gray-600 mt-1.5 leading-relaxed">下面这三项最容易被填错，建议对照自查：</p>' +
                    '<ul class="mt-2 space-y-1 text-xs text-gray-600 leading-relaxed">' +
                        '<li><i class="fa fa-check-circle text-blue-500 mr-1.5"></i>专项附加扣除有没有漏填、还能不能补扣</li>' +
                        '<li><i class="fa fa-check-circle text-blue-500 mr-1.5"></i>社保公积金、年终奖选哪种算法更划算</li>' +
                        '<li><i class="fa fa-check-circle text-blue-500 mr-1.5"></i>退税 / 补税的测算依据是否填全</li>' +
                    '</ul>' +
                    '<div class="flex flex-wrap items-center gap-2 mt-3">' +
                        '<button type="button" class="lead-result-cta btn btn-primary text-xs px-4 py-2 rounded-lg"' +
                            ' data-source="' + source + '" data-type="' + type + '">免费协助</button>' +
                        '<span class="text-[11px] text-gray-400">不采集收入金额 · 测算结果仅供参考</span>' +
                    '</div>' +
                '</div>' +
            '</div>';
    }

    function inject(type) {
        // 双保险：显式排除优先，再走白名单
        if (BLOCKED_TYPES.indexOf(type) !== -1) return;
        if (ALLOWED_TYPES.indexOf(type) === -1) return;

        var cfg = TOUCHPOINTS[type];
        if (!cfg) return;
        var container = document.getElementById(cfg.containerId);
        if (!container) return;
        if (container.querySelector('#' + GUIDE_ID)) return; // 幂等：同一结果容器只挂一次

        var wrap = document.createElement('div');
        wrap.id = GUIDE_ID;
        wrap.className = 'mt-6 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 rounded-xl p-4 sm:p-5';
        wrap.innerHTML = guideHTML(cfg.source, type);
        container.appendChild(wrap);
    }

    // 17B-4（v1.50.0）：原先这里还有一个 bindButton(btnId, type) —— 它给「页面专属计算按钮」
    // 挂延时注入，是四个页面式 deep 各用一颗按钮时代的产物。页面上没了，最后一个调用者
    // （分类所得的 calculate-classification-btn）也随页面删了，函数一并删除：
    // 留着它，下一个人会以为「新测算的入口是自己的按钮」，而实际上都走 dw-next。

    // 17B-1：spec 驱动的向导是**通用渲染器** —— dw-next 与 dw-result-card 会被所有 spec 工具
    // 轮着用。若照搬「按钮 → 类型」的固定绑定，用户算了增值税也会被当成经营所得线索
    // 归因进去（线索表里看不出错，联系时也答非所问）。所以注入前先按 data-tool-id 认人。
    function bindWizardNext(type) {
        var btn = document.getElementById('dw-next');
        if (!btn) return;
        btn.addEventListener('click', function () {
            setTimeout(function () {
                var card = document.getElementById('dw-result-card');
                if (!card || card.getAttribute('data-tool-id') !== type) return;
                inject(type);
            }, 150);
        });
    }

    function bindCta() {
        document.addEventListener('click', function (e) {
            var target = e.target;
            var cta = (target && target.closest) ? target.closest('.lead-result-cta') : null;
            if (!cta) return;
            if (window.LeadModal && typeof window.LeadModal.open === 'function') {
                // 只传计算类型：情境文本由 LeadModal 依据 lead-context 反推，
                // 避免把入口标签伪装成「用户的当前测算」
                window.LeadModal.open({
                    source: cta.getAttribute('data-source') || 'modal',
                    type: cta.getAttribute('data-type') || ''
                });
            }
        });
    }

    function init() {
        // 17B-3（v1.49.0）：综合所得也走了向导，它的按钮 'next-to-result-btn' 随旧页面删掉了，
        // 与 business / reverse 一样改钩 dw-next，并按 data-tool-id 认人（通用渲染器复用同一颗按钮）。
        bindWizardNext('forward');
        bindWizardNext('business');                             // 经营所得：17B-1 起走 spec 驱动的向导
        // 17B-4（v1.50.0）：分类所得同上 —— 'calculate-classification-btn' 随旧页面删掉了。
        // bindButton 这个路基于是彻底没了调用者（四个页面式 deep 全走了），注入统一走 bindWizardNext。
        bindWizardNext('classification');
        // 反向倒算（谈薪）显式挂钩但会被 BLOCKED_TYPES 拦截 —— 证明守卫生效，可被门禁断言覆盖。
        // 17B-2：它的按钮随旧页面删了，钩到向导的下一步上（同样先按 data-tool-id 认人）。
        bindWizardNext('reverse');
        bindCta();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.LeadTouchpoints = {
        ALLOWED_TYPES: ALLOWED_TYPES,
        BLOCKED_TYPES: BLOCKED_TYPES,
        TOUCHPOINTS: TOUCHPOINTS,
        inject: inject
    };
})();
