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
    var TOUCHPOINTS = {
        forward:        { containerId: 'step-result',                source: 'result_settlement', scene: '综合所得·年度汇算' },
        comprehensive:  { containerId: 'step-result',                source: 'result_settlement', scene: '综合所得·年度汇算' },
        business:       { containerId: 'business-step-result',       source: 'result_business',   scene: '经营所得·年度汇算' },
        classification: { containerId: 'classification-step-result', source: 'result_budget',     scene: '分类所得·计税' }
    };

    var GUIDE_ID = 'lead-result-guide';

    function guideHTML(source, scene) {
        return '' +
            '<div class="flex items-start gap-3">' +
                '<div class="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">' +
                    '<i class="fa fa-user-circle-o text-blue-600"></i>' +
                '</div>' +
                '<div class="flex-1 min-w-0">' +
                    '<h3 class="font-semibold text-gray-800 text-sm">不确定填得对不对？让专业顾问免费核对一次</h3>' +
                    '<p class="text-xs text-gray-600 mt-1 leading-relaxed">专项附加扣除、社保公积金、年终奖计税方式等容易漏填或选错。留下联系方式，顾问帮您核对确认无误再申报。</p>' +
                    '<button type="button" class="lead-result-cta mt-3 btn btn-primary text-xs px-4 py-1.5 rounded-lg"' +
                        ' data-source="' + source + '" data-scene="' + scene + '">免费核对一次</button>' +
                    '<p class="text-[11px] text-gray-400 mt-2">本测算仅供参考，不构成税务建议</p>' +
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
        wrap.className = 'mt-6 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-xl p-4 sm:p-5';
        wrap.innerHTML = guideHTML(cfg.source, cfg.scene);
        container.appendChild(wrap);
    }

    function bindButton(btnId, type) {
        var btn = document.getElementById(btnId);
        if (!btn) return;
        btn.addEventListener('click', function () {
            // 结果由按钮原处理器同步（分类所得为 setTimeout）渲染，这里延后一拍注入
            setTimeout(function () { inject(type); }, 150);
        });
    }

    function bindCta() {
        document.addEventListener('click', function (e) {
            var target = e.target;
            var cta = (target && target.closest) ? target.closest('.lead-result-cta') : null;
            if (!cta) return;
            if (window.LeadModal && typeof window.LeadModal.open === 'function') {
                window.LeadModal.open({
                    source: cta.getAttribute('data-source') || 'modal',
                    scene: cta.getAttribute('data-scene') || ''
                });
            }
        });
    }

    function init() {
        bindButton('next-to-result-btn', 'forward');            // 综合所得（年度汇算）
        bindButton('calculate-business-btn', 'business');       // 经营所得
        bindButton('calculate-classification-btn', 'classification'); // 分类所得
        // 反向倒算（谈薪）显式挂钩但会被 BLOCKED_TYPES 拦截 —— 证明守卫生效，可被门禁断言覆盖
        bindButton('calculate-reverse-btn', 'reverse');
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
