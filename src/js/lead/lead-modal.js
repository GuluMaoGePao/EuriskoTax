/**
 * 阶段13 B：留资弹窗（工具 → 服务转化的核心动作）
 *
 * 双通道设计（见阶段13 方案 §4）：
 *   ① 立即通道 —— 扫描企微活码，当场咨询顾问（意向最强的用户走这条）；
 *   ② 留言通道 —— 留下手机号/微信号，顾问在工作时间回访（覆盖面最广）。
 *
 * 活码不硬编码：由公司在企业微信后台生成「联系我」活码后，
 * 在 index.html 里用 window.LEAD_CONFIG 注入（也可直接改下面的 DEFAULTS）：
 *   <script>window.LEAD_CONFIG = { wecomQrUrl: 'images/lead-wecom-qr.png' };</script>
 * 未配置时优雅降级为「仅留言通道」，并在控制台提示一次，不影响主流程。
 *
 * wecomQrUrl 两种形态都收（见 isImageLikeUrl / renderQr）：
 *   ① 图片 —— 后台下载的活码 PNG / 企微图床地址，直接当 <img src>；
 *   ② 链接 —— work.weixin.qq.com/kfid/... 「联系我」页面地址，**不是图片**，
 *      直接塞进 src 只会得到一张裂图，所以这里用分享图同款的 qrcode-generator 现场生码。
 *      换客服不换码、也不必维护一张会过期的 png，是更稳的形态。
 * 二维码一律可点：手机上点一下直接进企微会话，桌面端扫码。
 *
 * 渠道分流（见 wecomQrByChannel / channelOfSource）：一个入口可以配一个专属码，
 * 企微侧据此区分「留资弹窗 / 分享图 / 落地页」来源，并分派接待人员与欢迎语。
 * **不要**手工在客服链接后拼 `?from=xxx`：企微规定客服链接不可改写、参数不可复制到别的链接，
 * 拼了页面照开，但「进入会话事件」的参数校验会失败 —— 回调里拿不到来源，等于白做。
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

    // 「所在城市」为省 + 市级联：这两个哨兵值表示用户落到了手输兜底
    // （省份选「其他 / 海外」，或城市选「其他（手动输入）」），此时城市取 #lead-city-other
    var PROVINCE_OTHER = '__other';
    var CITY_OTHER = '__other';

    // 提交按钮的两个状态：成功后必须能还原成一模一样的初始态（含图标），
    // 所以用常量存 HTML 而不是各写一次字符串 —— 否则图标很容易在第二次提交后消失。
    // 文案与 index.html 的 #lead-submit-btn 保持一致：这里只做「把信息交出去」，不承诺「预约成功」
    var SUBMIT_HTML = '<i class="fa fa-paper-plane-o mr-1.5"></i>提交信息';
    var SUBMIT_LOADING_HTML = '<i class="fa fa-spinner fa-spin mr-1.5"></i>提交中…';

    // 触点归因白名单需与后端 leadController.SOURCES 保持一致（非法值后端会回落 unknown）
    var DEFAULTS = {
        wecomQrUrl: '',
        wecomQrByChannel: {},
        advisorName: '',
        advisorTitle: ''
    };

    // 入口 → 专属活码的渠道白名单（见 wecomQrUrl）：
    //   modal   —— 站内留资弹窗（结果页 / 个人中心）
    //   share   —— 分享图带来的访客（分享图上的码是回流站点的，他们最终仍从弹窗进企微，
    //              所以「分享图来源」靠的是给这批访客换一个码，而不是改掉分享图的码）
    //   landing —— 站外落地页 / SEO 页（source 含 seo_ / landing）
    // 白名单是刻意的：渠道名会流进埋点与 DOM，未知值不能透传。
    var QR_CHANNELS = ['modal', 'share', 'landing'];

    // 链接型活码现场生码：弹窗里二维码显示 112px（w-28），这里按 5 倍生图，
    // 高分屏放大也不糊；4 模块留白是扫码成功率的保底（同分享图口径）
    var QR_LINK_TARGET_PX = 560;
    var QR_QUIET_MODULES = 4;

    var state = { source: 'modal', scene: '', type: '', wecomChannel: '', submitting: false, warnedNoQr: false, successTimer: 0 };

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

    // 按入口取活码。
    // 为什么要分码：企微客服链接**不允许自行改写或复制参数**（官方文档「获取客服账号链接」），
    // 手工拼 `?from=share` 能打开页面，但「进入会话事件」的参数校验过不了 —— 回调里拿不到来源。
    // 看起来能用、实际没数据，比不做更糟。所以来源只能靠「一个入口一个码」来区分。
    // 未配或配空的入口一律回落到兜底码 wecomQrUrl：少配一个入口不会让通道消失。
    function wecomQrUrl(channel) {
        var cfg = config();
        if (channel && QR_CHANNELS.indexOf(channel) !== -1) {
            var byChannel = cfg.wecomQrByChannel;
            if (byChannel && typeof byChannel === 'object') {
                var own = byChannel[channel];
                if (typeof own === 'string' && own.trim()) return own.trim();
            }
        }
        var url = cfg.wecomQrUrl;
        return typeof url === 'string' ? url.trim() : '';
    }

    // source（已有触点归因）→ 渠道归类：不新增归因字段，复用后端已认可的 source 字符串
    function channelOfSource(source) {
        var s = String(source || '');
        if (/share/i.test(s)) return 'share';
        if (/seo_|landing/i.test(s)) return 'landing';
        return 'modal';
    }

    // 是「图片」还是「链接」：企微活码两种产物都可能被填进来，判错就会得到一张裂图。
    // 企微图床（wework.qpic.cn）没有扩展名，需单独认下来。
    function isImageLikeUrl(url) {
        var u = String(url || '').trim();
        return /^data:image\//i.test(u)
            || /\.(png|jpe?g|gif|webp|svg|bmp)(\?|#|$)/i.test(u)
            || /wework\.qpic\.cn/i.test(u);
    }

    // 把「联系我」链接现场生码（与分享图共用 qrcode-generator）
    function qrDataUrl(text) {
        try {
            if (typeof window.qrcode !== 'function') return '';
            var qr = window.qrcode(0, 'M'); // 0 = 按内容长度自动选版本
            qr.addData(text);
            qr.make();
            var total = qr.getModuleCount() + QR_QUIET_MODULES * 2;
            var cell = Math.max(2, Math.round(QR_LINK_TARGET_PX / total));
            // qrcode-generator 1.4.x 的 margin 单位是像素而非模块，故传 4 个模块的像素宽
            return qr.createDataURL(cell, QR_QUIET_MODULES * cell);
        } catch (err) {
            console.warn('[LeadModal] 活码二维码生成失败，降级为点链接进入:', err);
            return '';
        }
    }

    // 立即通道的渲染：图片型直接用 src，链接型现场生码；
    // 生成不出来也不让通道废掉（CDN 挂了 / 老浏览器）—— 退化成可点的「点此联系顾问」。
    function renderQr(channel) {
        var url = wecomQrUrl(channel);
        var qr = el('lead-wecom-qr');
        var link = el('lead-wecom-link');
        var fallback = el('lead-wecom-fallback');
        if (!url || !qr) return false;

        if (link) {
            link.setAttribute('href', url);
            link.setAttribute('target', '_blank');
            link.setAttribute('rel', 'noopener');
        }

        var src = isImageLikeUrl(url) ? url : qrDataUrl(url);
        if (src) {
            qr.src = src;
            qr.classList.remove('hidden');
            if (fallback) fallback.classList.add('hidden');
        } else {
            // 拿不到图就留白，不要裂图：点击入口仍在，通道不残废
            qr.removeAttribute('src');
            qr.classList.add('hidden');
            if (fallback) fallback.classList.remove('hidden');
        }
        return true;
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

    // ===== 省 + 市级联（「所在城市」）=====
    // 数据来自 src/js/data/china-regions.js（中国省级行政区 + 地级行政区）。
    // 未加载到数据时优雅降级：省份只剩「其他 / 海外」，用户改走手输 —— 宁可多打字，也别卡住留资。

    function regionsApi() {
        var api = window.ChinaRegions;
        return (api && typeof api.citiesOf === 'function' && Array.isArray(api.list)) ? api : null;
    }

    // 城市下拉与手输框互斥：切到手输时清空旧值并聚焦（键盘弹出即为「请填写」的提示）
    function showCityInput(show) {
        var selectWrap = el('lead-city-select-wrap');
        var inputWrap = el('lead-city-input-wrap');
        var select = el('lead-city');
        var other = el('lead-city-other');
        if (selectWrap) selectWrap.classList.toggle('hidden', !!show);
        if (inputWrap) inputWrap.classList.toggle('hidden', !show);
        if (select) select.disabled = !!show;
        if (other) {
            other.value = '';
            if (show) setTimeout(function () { other.focus(); }, 0);
        }
    }

    // 省份 → 重建城市候选；选「其他 / 海外」直接落到手输，不再点一次城市下拉
    function setCities(province) {
        var select = el('lead-city');
        if (!select) return;

        if (!province) {
            select.innerHTML = '<option value="">城市</option>';
            showCityInput(false);
            select.disabled = true;
            return;
        }

        var api = regionsApi();
        var cities = (province === PROVINCE_OTHER || !api) ? [] : api.citiesOf(province);
        var html = '<option value="">请选择城市</option>';
        cities.forEach(function (city) {
            html += '<option value="' + escapeAttr(city) + '">' + escapeAttr(city) + '</option>';
        });
        // 行政区划不可能穷尽（县级市 / 境外）：留一个手输入口，避免用户选不到就没法提交
        html += '<option value="' + CITY_OTHER + '">其他（手动输入）</option>';
        select.innerHTML = html;
        // 省份选「其他 / 海外」时直接落到手输，同时把城市下拉置为哨兵值，
        // 否则 collectPayload 会从（隐藏的）下拉读到空值，用户在输入框里打的字被丢掉
        if (province === PROVINCE_OTHER) select.value = CITY_OTHER;
        showCityInput(province === PROVINCE_OTHER);
    }

    // 省份下拉是静态数据，构建一次即可；「其他 / 海外」恒在末位兜底
    function renderProvinces() {
        var select = el('lead-province');
        if (!select) return;
        var api = regionsApi();
        var html = '<option value="">省份 / 直辖市</option>';
        if (api) {
            api.list.forEach(function (item) {
                html += '<option value="' + escapeAttr(item.province) + '">' + escapeAttr(item.province) + '</option>';
            });
        }
        html += '<option value="' + PROVINCE_OTHER + '">其他 / 海外</option>';
        select.innerHTML = html;
    }

    // 每次打开弹窗复位：form.reset() 会把 select 拨回初始项，这里再把城市候选/手输态一并还原
    function resetRegions() {
        var province = el('lead-province');
        if (province) province.value = '';
        setCities('');
    }

    function collectPayload() {
        var signals = (window.LeadContext && typeof window.LeadContext.viewSignals === 'function')
            ? window.LeadContext.viewSignals()
            : null;

        function val(id) {
            var node = el(id);
            return node && typeof node.value === 'string' ? node.value : '';
        }
        // 省 / 市一起提交：顾问按省收敛分派（江浙沪私域），按市核对当地缴费基数口径；
        // 市名重名时（吉林市 / 海南藏族自治州）只有市名会认错统筹区。
        // 「其他 / 海外」是筛选城市用的哨兵值、不是真实省份：透传下去顾问会看到 '__other'
        var provinceSelect = el('lead-province');
        var provinceRaw = provinceSelect ? provinceSelect.value : '';
        var province = provinceRaw === PROVINCE_OTHER ? '' : provinceRaw.trim();
        // 选中「其他（手动输入）」时城市落在手输框
        var citySelect = el('lead-city');
        var city = (citySelect && citySelect.value === CITY_OTHER)
            ? val('lead-city-other').trim()
            : val('lead-city').trim();
        return {
            name: val('lead-name').trim(),
            phone: val('lead-phone').trim(),
            wechat: val('lead-wechat').trim(),
            company: val('lead-company').trim(),
            province: province,
            city: city,
            entityType: val('lead-entity') || 'unknown',
            need: val('lead-need') || 'other',
            source: state.source,
            scene: state.scene,
            // 阶段19-7b②：视图密度与「简明视图下主动展开进阶参数」次数随线索一起上报，
            // 顾问据此排跟进优先级（完整视图 / 调过进阶参数 = 更接近成交）。
            // 取不到就留空：老会话没记录过就是没信号，不猜一个「简明」出来充数。
            viewMode: signals ? signals.mode : '',
            advancedTouched: signals ? signals.advancedTouched : 0,
            note: val('lead-note').trim(),
            consent: !!(el('lead-consent') && el('lead-consent').checked)
        };
    }

    function validate(p) {
        if (!p.name) return '请填写您的称呼';
        // 所在城市不参与校验：2026-09 与后端口径对齐为「选填，不阻断留资」。
        // 城市对顾问核对当地社保 / 公积金缴费基数口径有用，但**不能因此阻断提交** ——
        // 后端 buildLead 对 province / city 只做长度约束（见 leadController.js 注释），
        // 前端若拦在这里，等于在北极星 lead_submit 上凭空丢弃线索；
        // 且行政区划不可能穷尽（县级市 / 境外），「其他」兜底之外仍有用户无解。
        // 因此这里只收不验：城市照常随 payload 提交（填了更好，顾问能按当地口径核），没填也放行。
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
                // 文案单一真源（§5.6 L-12）：统一一句，**不带任何时效**
                // （「1 个工作日内」做不到，写了就是虚假承诺；见 §2.5 留资时效铁律）
                sub.textContent = ((typeof window !== 'undefined' && window.CopyStandard && window.CopyStandard.LEAD)
                    ? window.CopyStandard.LEAD.success
                    : '') || '已收到您的信息，顾问会尽快与您联系，请留意来电或微信。';
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

        // 立即通道：按入口取码 —— 未配专属码则回落兜底码（图片型直接用，链接型现场生码）
        state.wecomChannel = channelOfSource(state.source);
        var hasQr = renderQr(state.wecomChannel);
        if (!hasQr && !state.warnedNoQr) {
            state.warnedNoQr = true;
            console.warn('[LeadModal] 未配置企业微信活码（window.LEAD_CONFIG.wecomQrUrl），本次仅展示留言通道。');
        }

        var form = el('lead-form');
        if (form) form.reset();
        resetRegions();
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
            detail: { source: state.source, scene: state.scene, wecomChannel: state.wecomChannel }
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

        // 省 + 市级联：省份决定城市候选；城市选「其他（手动输入）」时切换到手输框
        var provinceSelect = el('lead-province');
        renderProvinces();
        if (provinceSelect) {
            provinceSelect.addEventListener('change', function () {
                setCities(provinceSelect.value);
            });
        }
        var citySelect = el('lead-city');
        if (citySelect) {
            citySelect.addEventListener('change', function () {
                showCityInput(citySelect.value === CITY_OTHER);
            });
        }
        resetRegions();

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

    // _wecom 只给测试用：活码形态判定与生码是「配错就裂图、但没有报错」的地方，必须有断言盯着
    window.LeadModal = { open: open, close: close, _wecom: { isImageLikeUrl: isImageLikeUrl, qrDataUrl: qrDataUrl, renderQr: renderQr, wecomQrUrl: wecomQrUrl, channelOfSource: channelOfSource } };
})();
