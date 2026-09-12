/**
 * 阶段13 B：留资弹窗（工具 → 服务转化的核心动作）
 *
 * 双通道设计（见阶段13 方案 §4）：
 *   ① 立即通道 —— 扫描企业微信「联系我」活码，当场加顾问好友（意向最强的用户走这条）；
 *   ② 留言通道 —— 留下手机号/微信号，顾问在工作时间回访（覆盖面最广）。
 *
 * 活码不硬编码：由公司在企业微信后台生成「联系我」活码后，
 * 在 index.html 里用 window.LEAD_CONFIG 注入（也可直接改下面的 DEFAULTS）：
 *   <script>window.LEAD_CONFIG = { wecomQrUrl: 'images/lead-wecom-qr.png' };</script>
 * 未配置时优雅降级为「仅留言通道」，并在控制台提示一次，不影响主流程。
 *
 * 合规：不采集任何收入金额；consent 必须勾选（个保法显式同意），后端落库留痕。
 *
 * 对外接口：window.LeadModal.open({ source, scene })
 */
(function () {
    'use strict';

    var MODAL_ID = 'lead-modal';
    var PHONE_RE = /^1[3-9]\d{9}$/;

    // 触点归因白名单需与后端 leadController.SOURCES 保持一致（非法值后端会回落 unknown）
    var DEFAULTS = {
        wecomQrUrl: ''
    };

    var state = { source: 'modal', scene: '', submitting: false, warnedNoQr: false };

    function el(id) {
        return document.getElementById(id);
    }

    function config() {
        return (window.LEAD_CONFIG && typeof window.LEAD_CONFIG === 'object') ? window.LEAD_CONFIG : DEFAULTS;
    }

    function wecomQrUrl() {
        var url = config().wecomQrUrl;
        return typeof url === 'string' ? url.trim() : '';
    }

    // openModal / closeModal 由 auth-ui.js（动态 import）注入，脚本加载顺序不保证，
    // 故此处保留与 content-center-ui.js 同款兜底实现。
    function openModalSafe(modal) {
        if (!modal) return;
        if (typeof window.openModal === 'function') {
            window.openModal(modal);
            return;
        }
        modal.classList.remove('hidden');
        if (modal.parentNode !== document.body) document.body.appendChild(modal);
        document.body.style.overflow = 'hidden';
        setTimeout(function () {
            modal.classList.remove('opacity-0');
            var inner = modal.querySelector('div');
            if (inner) inner.classList.remove('scale-95');
        }, 10);
    }

    function closeModalSafe(modal) {
        if (!modal) return;
        if (typeof window.closeModal === 'function') {
            window.closeModal(modal);
            return;
        }
        modal.classList.add('opacity-0');
        var inner = modal.querySelector('div');
        if (inner) inner.classList.add('scale-95');
        document.body.style.overflow = '';
        setTimeout(function () {
            modal.classList.add('hidden');
        }, 300);
    }

    function setView(view) {
        var hasQr = !!wecomQrUrl();
        var form = el('lead-form');
        var success = el('lead-success');
        var footer = el('lead-modal-footer');
        var wecom = el('lead-wecom-channel');
        var divider = el('lead-divider');

        var showForm = view === 'form';
        if (wecom) wecom.classList.toggle('hidden', !(hasQr && showForm));
        if (divider) divider.classList.toggle('hidden', !(hasQr && showForm));
        if (form) form.classList.toggle('hidden', !showForm);
        if (success) success.classList.toggle('hidden', view !== 'success');
        if (footer) footer.classList.toggle('hidden', !showForm);
    }

    function showError(message) {
        var err = el('lead-form-error');
        if (!err) return;
        err.textContent = message;
        err.classList.remove('hidden');
    }

    function clearError() {
        var err = el('lead-form-error');
        if (!err) return;
        err.textContent = '';
        err.classList.add('hidden');
    }

    function collectPayload() {
        function val(id) {
            var node = el(id);
            return node && typeof node.value === 'string' ? node.value : '';
        }
        return {
            name: val('lead-name').trim(),
            phone: val('lead-phone').trim(),
            wechat: val('lead-wechat').trim(),
            company: val('lead-company').trim(),
            entityType: val('lead-entity') || 'unknown',
            need: val('lead-need') || 'other',
            source: state.source,
            scene: state.scene,
            note: val('lead-note').trim(),
            consent: !!(el('lead-consent') && el('lead-consent').checked)
        };
    }

    function validate(p) {
        if (!p.name) return '请填写您的称呼';
        if (!p.phone && !p.wechat) return '请至少填写手机号或微信号';
        if (p.phone && !PHONE_RE.test(p.phone)) return '手机号格式不正确，请检查后重试';
        if (!p.consent) return '请先勾选同意，我们才能与您联系';
        return '';
    }

    async function onSubmit(e) {
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        if (state.submitting) return;

        var payload = collectPayload();
        var errMsg = validate(payload);
        if (errMsg) {
            showError(errMsg);
            return;
        }
        clearError();

        var btn = el('lead-submit-btn');
        state.submitting = true;
        if (btn) {
            btn.disabled = true;
            btn.textContent = '提交中…';
        }

        try {
            if (!window.apiClient || typeof window.apiClient.submitLead !== 'function') {
                throw new Error('服务暂不可用，请稍后再试');
            }
            var data = await window.apiClient.submitLead(payload);
            var sub = el('lead-success-sub');
            if (sub) {
                sub.textContent = (data && data.merged)
                    ? '我们已收到您的补充信息，顾问会尽快与您联系。'
                    : '顾问会在工作时间尽快与您联系，请留意来电或好友申请。';
            }
            setView('success');
            document.dispatchEvent(new CustomEvent('euriskotax:lead-submit', {
                detail: { source: state.source, scene: state.scene, merged: !!(data && data.merged) }
            }));
            setTimeout(function () { close(); }, 2600);
        } catch (err) {
            showError((err && err.message) ? err.message : '提交失败，请稍后再试');
        } finally {
            state.submitting = false;
            if (btn) {
                btn.disabled = false;
                btn.textContent = '提交';
            }
        }
    }

    // 分享图落地归因（阶段13D / T4）：扫码进入时 URL 带 ?source=share。
    // 这里只做格式校验、不维护白名单 —— 白名单在后端 leadController.SOURCES 一处维护，
    // 前端再抄一份只会漂移（非法值后端回落 unknown，安全）。
    var SOURCE_FLAG_KEY = 'euriskotax:lead-source';
    var SOURCE_RE = /^[a-z_]{2,32}$/;

    function captureLandingSource() {
        try {
            var matched = /[?&]source=([^&#]+)/i.exec(window.location.search);
            if (!matched) return;
            var source = decodeURIComponent(matched[1]).toLowerCase();
            if (!SOURCE_RE.test(source)) return;
            sessionStorage.setItem(SOURCE_FLAG_KEY, source);
        } catch (err) {
            // sessionStorage 不可用（隐私模式）时静默跳过：归因是加分项，不能影响留资主流程
        }
    }

    function landingSource() {
        try {
            return sessionStorage.getItem(SOURCE_FLAG_KEY) || '';
        } catch (err) {
            return '';
        }
    }

    function open(opts) {
        opts = opts || {};
        var modal = el(MODAL_ID);
        if (!modal) return;

        // 优先级：调用方显式指定 > 落地来源（扫码/分享图进入）> 默认
        state.source = opts.source || landingSource() || 'modal';
        state.scene = opts.scene || '';

        // 情境提示：把用户「刚算完的这道题」带回弹窗，提升转化
        var sceneEl = el('lead-modal-scene');
        if (sceneEl) {
            if (state.scene) {
                sceneEl.textContent = '当前测算：' + state.scene;
                sceneEl.classList.remove('hidden');
            } else {
                sceneEl.classList.add('hidden');
            }
        }

        // 立即通道：配置了活码才渲染二维码
        var qr = el('lead-wecom-qr');
        var hasQr = !!wecomQrUrl();
        if (qr && hasQr) qr.src = wecomQrUrl();
        if (!hasQr && !state.warnedNoQr) {
            state.warnedNoQr = true;
            console.warn('[LeadModal] 未配置企业微信活码（window.LEAD_CONFIG.wecomQrUrl），本次仅展示留言通道。');
        }

        var form = el('lead-form');
        if (form) form.reset();
        clearError();
        setView('form');

        openModalSafe(modal);
        document.dispatchEvent(new CustomEvent('euriskotax:lead-click', {
            detail: { source: state.source, scene: state.scene }
        }));
    }

    function close() {
        closeModalSafe(el(MODAL_ID));
    }

    function init() {
        captureLandingSource(); // 必须在 early return 之前：归因与弹窗是否绑定无关

        var modal = el(MODAL_ID);
        if (!modal || modal.dataset.leadBound === '1') return;
        modal.dataset.leadBound = '1';

        var closeBtn = el('lead-modal-close');
        if (closeBtn) closeBtn.addEventListener('click', close);

        var form = el('lead-form');
        if (form) form.addEventListener('submit', onSubmit);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.LeadModal = { open: open, close: close };
})();
