/**
 * 运行时环境识别 + 结果交付兜底（Phase 1.5：微信 / PWA 可用性，不是观感）
 *
 * 为什么抽成独立模块：
 *   - ui-ux-master-plan.md §10 把「微信完成一次完整计算并可交付」「PWA 无死胡同」
 *     列为**验收标准**，理由是这两项决定功能是否可用，而非页面好不好看。
 *   - 此前全站**没有任何 UA / 环境判别**（改造前 `src/js` 下零命中）：
 *     在微信内置浏览器里点导出走 `doc.save()` → 下载被拦或静默失败 →
 *     用户看到「点了没反应」，而这是当前唯一真实可达渠道，等于链路不闭环。
 *
 * 交付降级链：**下载 → 结果长图（长按保存）→ 复制文本**。
 * 三者至少有一个成立，因此用户永远不会停在「没反应」。
 *
 * 设计约束：
 *   1) 判定逻辑一律**纯函数**（输入 ua 串 + 少量开关），便于单测与跨版本回归；
 *      读 UA / matchMedia 的部分只留在 IIFE 外壳里。
 *   2) 只识别「内置浏览器」，**不许误伤** QQBrowser / Chrome 这类真正支持下载的浏览器 ——
 *      误判会让本可下载的用户白白看不到下载按钮。
 *   3) 文案必须解释「为什么 + 现在能怎么办」，不能只说「导出失败」。
 */
(function () {
    'use strict';

    // === UA 关键字 ===
    var WECHAT = /micromessenger/i;
    var WECHAT_WORK = /wxwork/i;
    var QQ_INAPP = / qq\//i;   // QQ 内置浏览器；QQBrowser 不带『 QQ/』，不受影响
    var WEIBO = /weibo/i;
    var DINGTALK = /dingtalk/i;
    var IOS = /iphone|ipad|ipod/i;
    var ANDROID = /android/i;

    /**
     * 识别运行时环境（纯函数）
     * @param {string} ua  UA 字符串
     * @param {object} [opts] { standalone, anchorDownloadSupported }
     *        standalone            是否为 PWA 独立窗口（由外壳用 matchMedia 传入）
     *        anchorDownloadSupported  <a download> 特性探测结果；缺省按「支持」处理
     * @returns {object} { wechat, wechatWork, qq, weibo, dingtalk, inApp, ios, android, standalone, downloadSupported }
     */
    function detectEnv(ua, opts) {
        opts = opts || {};
        var s = String(ua == null ? '' : ua);

        var wechat = WECHAT.test(s);
        var wechatWork = WECHAT_WORK.test(s);
        var qq = QQ_INAPP.test(s);
        var weibo = WEIBO.test(s);
        var dingtalk = DINGTALK.test(s);
        var inApp = wechat || wechatWork || qq || weibo || dingtalk;

        // 容器内的 iOS / Android 一律按不支持下载处理之外，还要扣掉「连特性都不支持」的浏览器：
        // 老 Safari / WebView 即便不在容器内也没有 a[download]。
        var anchorDownload = opts.anchorDownloadSupported !== false;

        return {
            wechat: wechat,
            wechatWork: wechatWork,
            qq: qq,
            weibo: weibo,
            dingtalk: dingtalk,
            inApp: inApp,
            ios: IOS.test(s),
            android: ANDROID.test(s),
            standalone: !!opts.standalone,
            downloadSupported: anchorDownload && !inApp
        };
    }

    /**
     * 选择交付方式（纯函数）
     * @param {object} env detectEnv 的返回值
     * @param {object} [availability] { image } —— image=false 表示当前没有可用的长图能力
     * @returns {object} { way, fallbacks }，保证 way 一定可用
     */
    function pickDelivery(env, availability) {
        availability = availability || {};
        var hasImage = availability.image !== false;

        var usable = [];
        if (env && env.downloadSupported) usable.push('download');
        if (hasImage) usable.push('image');
        usable.push('text'); // 文本永远可用：最差也能手动全选复制

        // 容器外也不排除「老浏览器不支持 a[download]」：此时 download 已被剔除，
        // 仍把它 append 到最后 —— 允许用户手动再试一次，而不是替他判死刑。
        if (usable.indexOf('download') === -1) usable.push('download');

        return { way: usable[0], fallbacks: usable.slice(1) };
    }

    /**
     * 解释「为什么不能直接下载」（纯函数）
     * @returns {string} 为空表示走正常下载，无需解释
     */
    function deliveryHint(env, way) {
        if (way === 'download') return '';
        if (env && (env.wechat || env.wechatWork)) {
            return '微信内置浏览器不支持直接下载文件，已改为展示结果图 —— 长按图片即可保存或转发给顾问。';
        }
        if (env && env.inApp) {
            return '当前 App 内置浏览器不支持直接下载文件，已改为展示结果图 —— 长按图片即可保存。';
        }
        return '当前浏览器不支持直接下载文件，已改为展示结果图 —— 长按图片即可保存。';
    }

    /**
     * HTML → 纯文本（纯函数）：复制结果的兜底素材。
     * 只要保证「人能读、能对得上数」，不追求排版。
     */
    function htmlToPlainText(html) {
        var s = String(html == null ? '' : html);
        s = s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '');
        s = s.replace(/<br\s*\/?>/gi, '\n');
        s = s.replace(/<\/(p|div|li|tr|h[1-6]|section)>/gi, '\n');
        s = s.replace(/<\/t[dh]>/gi, ' | ');
        s = s.replace(/<[^>]+>/g, '');
        s = s.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
            .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"');
        s = s.replace(/[ \t]+\n/g, '\n').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n');
        return s.trim();
    }

    /**
     * 复制到剪贴板：优先 async clipboard（需安全上下文），回落 textarea + execCommand。
     * 不抛错，只回报成败 —— 失败时上层应提示用户手动全选复制，而不是静默。
     */
    function copyToClipboard(text) {
        var body = String(text == null ? '' : text);
        if (!body) return Promise.resolve(false);

        if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(body).then(function () {
                return true;
            }).catch(function () {
                return legacyCopy(body);
            });
        }
        return Promise.resolve(legacyCopy(body));
    }

    function legacyCopy(body) {
        try {
            var ta = document.createElement('textarea');
            ta.value = body;
            // iOS Safari 只认「可编辑且未移出视口」的输入：readonly + 不缩放 + 不隐藏到 -9999px
            ta.setAttribute('readonly', 'readonly');
            ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;opacity:0;';
            document.body.appendChild(ta);
            ta.select();
            ta.setSelectionRange(0, body.length);
            var ok = document.execCommand('copy');
            document.body.removeChild(ta);
            return !!ok;
        } catch (e) {
            return false;
        }
    }

    // === 兜底面板：结果长图 + 复制文本两条出路 ===
    var PANEL_ID = 'runtime-fallback-panel';

    function closeFallbackPanel() {
        var existing = document.getElementById(PANEL_ID);
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
    }

    /**
     * 展示兜底交付面板
     * @param {object} opts
     *   imageDataUrl  结果长图 dataURL（长按保存）；没有则不展示图
     *   text          可复制的结果文本
     *   hint          为什么不能直接下载（deliveryHint 的结果）
     *   onRetryDownload 可选的「仍然尝试下载」回调
     */
    function openFallbackPanel(opts) {
        opts = opts || {};
        closeFallbackPanel();

        var mask = document.createElement('div');
        mask.id = PANEL_ID;
        mask.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:10004;' +
            'background:rgba(15,23,42,.72);overflow:auto;' +
            'padding:calc(24px + env(safe-area-inset-top, 0px)) 24px calc(24px + env(safe-area-inset-bottom, 0px));';

        var card = document.createElement('div');
        card.setAttribute('role', 'dialog');
        card.setAttribute('aria-modal', 'true');
        card.style.cssText = 'max-width:420px;margin:0 auto;background:#fff;border-radius:16px;padding:20px;text-align:center;' +
            'box-shadow:0 20px 50px rgba(0,0,0,.3);';

        var title = document.createElement('div');
        title.style.cssText = 'font-size:15px;font-weight:700;color:#1e293b;';
        title.textContent = '结果已生成';

        var hint = document.createElement('div');
        hint.style.cssText = 'font-size:12px;color:#64748b;margin-top:6px;line-height:1.6;text-align:left;';
        hint.textContent = opts.hint || '当前环境不支持直接下载文件，可长按结果图保存或复制下方文本。';

        card.appendChild(title);
        card.appendChild(hint);

        if (opts.imageDataUrl) {
            var img = document.createElement('img');
            img.alt = '测算结果长图';
            img.src = opts.imageDataUrl;
            img.style.cssText = 'width:100%;margin-top:14px;border:1px solid #e2e8f0;border-radius:12px;display:block;';
            card.appendChild(img);

            var imgHint = document.createElement('div');
            imgHint.style.cssText = 'font-size:12px;color:#94a3b8;margin-top:6px;';
            imgHint.textContent = '长按图片可保存到相册或转发';
            card.appendChild(imgHint);
        }

        function mkBtn(label, primary) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = label;
            btn.style.cssText = 'width:100%;margin-top:8px;padding:11px 0;min-height:44px;border:0;border-radius:10px;' +
                'font-size:14px;font-weight:600;cursor:pointer;' +
                (primary ? 'background:#2563eb;color:#fff;' : 'background:#fff;color:#475569;border:1px solid #e2e8f0;');
            return btn;
        }

        if (opts.text) {
            var copy = mkBtn('复制结果文本', true);
            copy.addEventListener('click', function () {
                copyToClipboard(opts.text).then(function (ok) {
                    copy.textContent = ok ? '已复制，可直接粘贴' : '复制失败，请长按下方文本手动复制';
                });
            });
            card.appendChild(copy);

            var ta = document.createElement('textarea');
            ta.setAttribute('readonly', 'readonly');
            ta.value = opts.text;
            ta.rows = 6;
            ta.style.cssText = 'width:100%;margin-top:8px;padding:10px;border:1px solid #e2e8f0;border-radius:10px;' +
                'font-size:12px;line-height:1.6;color:#334155;resize:vertical;box-sizing:border-box;';
            card.appendChild(ta);
        }

        if (typeof opts.onRetryDownload === 'function') {
            var retry = mkBtn('仍然尝试下载文件', false);
            retry.addEventListener('click', function () {
                try { opts.onRetryDownload(); } catch (e) { /* 失败即失败，面板仍在，不影响兜底 */ }
            });
            card.appendChild(retry);
        }

        var close = mkBtn('关闭', false);
        close.addEventListener('click', closeFallbackPanel);
        card.appendChild(close);

        mask.addEventListener('click', function (e) {
            if (e.target === mask) closeFallbackPanel();
        });

        mask.appendChild(card);
        document.body.appendChild(mask);
        return PANEL_ID;
    }

    // === 外壳：读取真实环境 ===
    function currentEnv() {
        var standalone = false;
        try {
            if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) standalone = true;
            if (window.navigator && window.navigator.standalone === true) standalone = true; // iOS 老写法
        } catch (e) {
            standalone = false;
        }

        var anchorDownloadSupported = true;
        try {
            anchorDownloadSupported = 'download' in document.createElement('a');
        } catch (e) {
            anchorDownloadSupported = true;
        }

        return detectEnv(window.navigator ? window.navigator.userAgent : '', {
            standalone: standalone,
            anchorDownloadSupported: anchorDownloadSupported
        });
    }

    /**
     * PWA 独立窗口：给 <html> 打标记，让 CSS 能针对「无地址栏」形态铺安全区。
     * 不做任何布局改动本身 —— 样式规则集中在 src/css/runtime-env.css。
     */
    function applyStandaloneFlag() {
        try {
            if (currentEnv().standalone) document.documentElement.setAttribute('data-app-mode', 'standalone');
        } catch (e) {
            /* 标记失败不影响功能 */
        }
    }

    var api = {
        detectEnv: detectEnv,
        pickDelivery: pickDelivery,
        deliveryHint: deliveryHint,
        htmlToPlainText: htmlToPlainText,
        copyToClipboard: copyToClipboard,
        currentEnv: currentEnv,
        applyStandaloneFlag: applyStandaloneFlag,
        openFallbackPanel: openFallbackPanel,
        closeFallbackPanel: closeFallbackPanel,
        // 测试入口：只暴露纯函数，避免误依赖 DOM
        pure: {
            detectEnv: detectEnv,
            pickDelivery: pickDelivery,
            deliveryHint: deliveryHint,
            htmlToPlainText: htmlToPlainText
        }
    };

    window.EuriskoEnv = api;
    applyStandaloneFlag();
})();
