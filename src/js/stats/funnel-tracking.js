/**
 * 阶段13E：转化漏斗埋点接线（visit → calc_done → share / save → lead_click）
 *
 * lead_submit **不在这里**：它的唯一真相是 Lead 表，由后端 /api/admin/leads/funnel 直接统计。
 * 前端再上报一次只会制造「两个数对不上」的问题（同一事实只存一处）。
 *
 * 三条设计原则：
 *   1) 只埋「入口」，不埋细节：
 *      - calc_done 绑 4 个计算按钮，一处覆盖全部计算类型，无需改各计算模块；
 *      - lead_click 只包装 window.LeadModal.open —— 留资弹窗的**唯一入口**。
 *        以后新增任何触点，只要走 LeadModal.open 就自动被统计，不需要再动埋点代码。
 *   2) 上报必须「无感」：全部 fire-and-forget，不 await、不占主流程，
 *      埋点自身异常绝不允许冒泡影响计算与留资（这是统计数据的本分）。
 *   3) 不过度工程：calc_done 以「点击后结果容器可见」判定，避免校验失败被误记；
 *      第二次点击若校验失败会多记 1 次 —— 这个长尾误差可接受，趋势观察不需要绝对精确。
 */
import apiClient from '../api/api-client.js';

// 计算按钮 → 结果容器 id（结果容器可见 = 这次真的算出来了）
const CALC_TRIGGERS = [
    { buttonId: 'next-to-result-btn', resultId: 'step-result' },
    { buttonId: 'calculate-business-btn', resultId: 'business-step-result' },
    { buttonId: 'calculate-classification-btn', resultId: 'classification-step-result' },
    { buttonId: 'calculate-reverse-btn', resultId: 'reverse-step-result' }
];

// 等结果渲染的时长：纯前端同步计算，300ms 足够；宁可少记，也不让埋点拖慢用户
const CALC_SETTLE_MS = 300;

function report(step) {
    try {
        apiClient.reportFunnelEvent(step);
    } catch (err) {
        // 埋点失败静默：统计是辅助数据，绝不打断用户主流程
    }
}

function bindCalcDone() {
    CALC_TRIGGERS.forEach(({ buttonId, resultId }) => {
        const btn = document.getElementById(buttonId);
        if (!btn) return;
        btn.addEventListener('click', () => {
            setTimeout(() => {
                const el = document.getElementById(resultId);
                if (el && !el.classList.contains('hidden')) report('calc_done');
            }, CALC_SETTLE_MS);
        });
    });
}

// 留资弹窗唯一入口 → lead_click（覆盖结果页引导、个人中心卡片及未来所有触点）
function patchLeadModal() {
    const modal = window.LeadModal;
    if (!modal || typeof modal.open !== 'function' || modal.__funnelPatched) return false;
    const original = modal.open;
    modal.open = function patchedOpen() {
        report('lead_click');
        return original.apply(this, arguments);
    };
    modal.__funnelPatched = true;
    return true;
}

function bindLeadClick() {
    if (patchLeadModal()) return;
    // lead-modal.js 是同步普通脚本，正常已先执行完；这里只作兜底（离线/缓存异常时）
    let tries = 0;
    const timer = setInterval(() => {
        tries += 1;
        if (patchLeadModal() || tries >= 20) clearInterval(timer);
    }, 200);
}

function bindSavedAndShare() {
    // 保存：复用既有事件（tax-calculator.js / data-management.js 已在派发）
    document.addEventListener('euriskotax:calc-saved', () => report('save'));
    // 分享：13D 分享图上线后派发 euriskotax:share 即自动接入（现在无触发点是有意为之）
    document.addEventListener('euriskotax:share', () => report('share'));
}

function init() {
    apiClient.reportVisitOnce(); // 每会话一次（sessionStorage 去重，刷新不虚增）
    bindCalcDone();
    bindLeadClick();
    bindSavedAndShare();
}

init();
