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
 * 顾问背书同样走配置（advisorName / advisorTitle）：填真实信息才显示，留空则整行隐藏。
 * 写进弹窗的资质是要能被追问的，宁可少一行，也不编一个「从业 10 年」。
 *
 * 合规：不采集任何收入金额；consent 必须勾选（个保法显式同意），后端落库留痕。
 *
 * 对外接口：window.LeadModal.open({ source, scene, type })
 */
(function () {
    'use strict';

    var MODAL_ID = 'lead-modal';
    var PHONE_RE = /^1[3-9]\d{9}$/;

    // 提交按钮的两个状态：成功后必须能还原成一模一样的初始态（含图标），
    // 所以用常量存 HTML 而不是各写一次字符串 —— 否则图标很容易在第二次提交后消失。
    // 文案与 index.html 的 #lead-submit-btn 保持一致：这里只做「把信息交出去」，不承诺「预约成功」
    var SUBMIT_HTML = '<i class="fa fa-paper-plane-o mr-1.5"></i>提交信息';
    var SUBMIT_LOADING_HTML = '<i class="fa fa-spinner fa-spin mr-1.5"></i>提交中…';

    // 触点归因白名单需与后端 leadController.SOURCES 保持一致（非法值后端会回落 unknown）
    var DEFAULTS = {
        wecomQrUrl: '',
        advisorName: '',
        advisorTitle: ''
    };

    var state = { source: 'modal', scene: '', type: '', submitting: false, warnedNoQr: false, successTimer: 0 };

    function el(id) {
        return document.getElementById(id);
    }

    // 情境文本会写进 <option> 的属性与内容：历史记录虽来自本机，仍按不可信输入转义
    function escapeAttr(text) {
        return String(text == null ? '' : text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
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
        var body = el('lead-modal-body');

        var showForm = view === 'form';
        if (wecom) wecom.classList.toggle('hidden', !(hasQr && showForm));
        if (divider) divider.classList.toggle('hidden', !(hasQr && showForm));
        if (form) form.classList.toggle('hidden', !showForm);
        if (success) success.classList.toggle('hidden', view !== 'success');
        if (footer) footer.classList.toggle('hidden', !showForm);

        // 表单比成功态长得多：用户滚到底部点提交后，成功提示会落在视野之外，
        // 看起来像「点了没反应」。切到成功态时把滚动位置复位到顶部。
        if (body && view === 'success') body.scrollTop = 0;

        // 重放入场动画：先摘类再强制重排，否则连续两次成功态不会重新播放
        if (success && view === 'success') {
            success.classList.remove('lead-pop-in');
            void success.offsetWidth;
            success.classList.add('lead-pop-in');
        }
    }

    // 顾问背书（可选）：只在配置了真实姓名时才渲染这一行
    function renderAdvisor() {
        var node = el('lead-advisor');
        if (!node) return;
        var cfg = config();
        var name = typeof cfg.advisorName === 'string' ? cfg.advisorName.trim() : '';
        if (!name) {
            node.textContent = '';
            node.classList.add('hidden');
            return;
        }
        var title = typeof cfg.advisorTitle === 'string' ? cfg.advisorTitle.trim() : '';
        node.textContent = '顾问：' + name + (title ? ' · ' + title : '');
        node.classList.remove('hidden');
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
            btn.innerHTML = SUBMIT_LOADING_HTML;
        }

        try {
            if (!window.apiClient || typeof window.apiClient.submitLead !== 'function') {
                throw new Error('服务暂不可用，请稍后再试');
            }
            var data = await window.apiClient.submitLead(payload);
            var sub = el('lead-success-sub');
            if (sub) {
                sub.textContent = (data && data.merged)
                    ? '已收到您的补充信息，顾问会尽快联系您。'
                    : '顾问会在 1 个工作日内联系您，请留意来电或微信。';
            }
            setView('success');
            document.dispatchEvent(new CustomEvent('euriskotax:lead-submit', {
                detail: { source: state.source, scene: state.scene, merged: !!(data && data.merged) }
            }));
            // 成功后自动关闭；计时器存进 state 并在 open/close 里清掉 ——
            // 否则用户重开弹窗后会被上一次的计时器突然关掉（看起来像闪退）
            clearTimeout(state.successTimer);
            state.successTimer = setTimeout(function () {
                state.successTimer = 0;
                close();
            }, 3200);
        } catch (err) {
            showError((err && err.message) ? err.message : '提交失败，请稍后再试');
        } finally {
            state.submitting = false;
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = SUBMIT_HTML;
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

    // 情境卡：展示「用户真实的测算情境」，而不是调用方硬塞的入口标签。
    //   ① 结果页进入：从已渲染结果反推（类型 + 汇算结论 + 适用税率，不含金额）
    //   ② 个人中心等无测算入口：列出本地已保存记录，由用户主动挑一条（选填）
    //   ③ 两者都没有：整卡隐藏 —— 宁可不展示，也不编造一个「当前测算」
    //
    // 背景：旧实现把 scene 当成「当前测算」直接打印（如「当前测算：个人中心·财税服务」），
    // 个人中心根本没有测算，等于在编造信息误导用户与顾问。
    function renderScene(opts) {
        var sceneEl = el('lead-modal-scene');
        if (!sceneEl) return;

        var textEl = el('lead-modal-scene-text');
        var hintEl = el('lead-modal-scene-hint');
        var pickerEl = el('lead-modal-scene-picker');
        var selectEl = el('lead-scene-select');

        var ctx = window.LeadContext;
        var explicit = opts.scene || '';
        var auto = (ctx && typeof ctx.current === 'function' && opts.type) ? ctx.current(opts.type) : '';
        var scene = explicit || auto;

        if (scene) {
            state.scene = scene;
            if (textEl) textEl.textContent = '参考您的测算：' + scene;
            if (hintEl) hintEl.textContent = '顾问会提前看到，沟通时无需重复说明。';
            if (pickerEl) pickerEl.classList.add('hidden');
            sceneEl.classList.remove('hidden');
            return;
        }

        var options = (ctx && typeof ctx.historyOptions === 'function') ? ctx.historyOptions() : [];
        if (!options.length) {
            state.scene = '';
            sceneEl.classList.add('hidden');
            return;
        }

        state.scene = '';
        if (textEl) textEl.textContent = '想聊哪次测算？（选填）';
        // 选择器自身带 label 与说明，这里不再叠第二行提示 —— 三行小字会显得啰嗦
        if (hintEl) hintEl.textContent = '';
        if (pickerEl) pickerEl.classList.remove('hidden');
        if (selectEl) {
            var html = '<option value="">暂不选择</option>';
            options.forEach(function (item) {
                html += '<option value="' + escapeAttr(item.scene) + '">' + escapeAttr(item.label) + '</option>';
            });
            selectEl.innerHTML = html;
            selectEl.value = '';
        }
        sceneEl.classList.remove('hidden');
    }

    function open(opts) {
        opts = opts || {};
        var modal = el(MODAL_ID);
        if (!modal) return;

        // 上一次「成功态自动关闭」的计时器可能还在跑：先清掉，避免刚打开就被关掉
        clearTimeout(state.successTimer);
        state.successTimer = 0;

        // 优先级：调用方显式指定 > 落地来源（扫码/分享图进入）> 默认
        state.source = opts.source || landingSource() || 'modal';
        state.type = opts.type || '';
        state.scene = opts.scene || '';

        renderScene(opts);
        renderAdvisor();

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

        // 桌面端自动聚焦第一项（少一次点击）；移动端不抢焦点 —— 立即弹键盘会盖住表单
        if (window.matchMedia && window.matchMedia('(min-width: 640px)').matches) {
            setTimeout(function () {
                var first = el('lead-name');
                if (first && document.activeElement !== first) first.focus();
            }, 320);
        }

        document.dispatchEvent(new CustomEvent('euriskotax:lead-click', {
            detail: { source: state.source, scene: state.scene }
        }));
    }

    function close() {
        clearTimeout(state.successTimer);
        state.successTimer = 0;
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

        // 情境选择（仅无当前测算、且本地有历史时可见）：选中即作为留资情境上报
        var sceneSelect = el('lead-scene-select');
        if (sceneSelect) {
            sceneSelect.addEventListener('change', function () {
                state.scene = sceneSelect.value || '';
            });
        }

        // ESC 关闭：弹窗是全屏遮罩，习惯用键盘的用户第一反应是 Esc
        document.addEventListener('keydown', function (e) {
            var key = e.key || '';
            if (key !== 'Escape' && key !== 'Esc' && e.keyCode !== 27) return;
            if (modal.classList.contains('hidden')) return;
            close();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.LeadModal = { open: open, close: close };
})();
