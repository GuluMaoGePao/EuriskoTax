/**
 * 阶段13D：一键结果分享图（含二维码归因 —— T4 触点）
 *
 * 产品理由（对应方案 §3.2 的硬约束）：
 *   「工资薪金 / 谈薪」这两类结果页**不出服务引导** —— 受众是打工人，推企业财税服务
 *   只会伤害品牌。但它们的传播价值恰恰最高：「税后到手多少」是天然的社交话题。
 *   所以这两类页面唯一的转化动作就是「生成分享图」：
 *   用户发到群里 → 朋友扫码 → 带来新一轮 visit，归因记为 share。
 *
 * 两个模板（覆盖全部四类结果）：
 *   income        正向结果卡 —— 综合所得 / 经营所得 / 分类所得，主角是「税后收入」
 *   negotiation   谈薪卡     —— 反向倒算，主角是「税前该谈多少」（谈薪场景真正想知道的事）
 *
 * 数据来源：直接读结果页**已渲染的 DOM 文本**，而不是去够计算模块的内部状态。
 *   好处是零耦合 —— 计算逻辑重构不会悄悄弄挂分享图；
 *   代价是依赖节点 id 稳定，故 SOURCES 表同时是单测与门禁的校验对象。
 *
 * 合规（方案 §8 硬要求）：每张图固定展示「测算结果仅供参考，不构成税务建议」；
 *   文案禁用「避税 / 节税 / 税筹」，统一「测算 / 核对」。
 *
 * 埋点闭环：生成成功派发 `euriskotax:share` → funnel-tracking.js 计入漏斗 share 步。
 * 归因闭环：二维码指向 ?source=share → 扫码者落地后留资 source 记为 share（见 lead-modal.js）。
 */
(function () {
    'use strict';

    var SHARE_IMAGE_WIDTH = 750; // 分享图宽度：移动端长图主流宽度，够清晰又不过大
    var SHARE_IMAGE_SCALE = 2;   // 2 倍像素密度，微信二次压缩后仍清晰
    var DISCLAIMER = '本测算结果仅供参考，不构成税务建议';
    var LOGO_SRC = 'images/EuriskoTaxLogo.png';
    var CTA_BLOCK_ID = 'share-card-cta';
    var PREVIEW_ID = 'share-preview-modal';

    // 结果容器 → 模板与取数规则（容器 id 取自 index.html 的 step-pane）
    var SOURCES = {
        'step-result': {
            template: 'income',
            title: '综合所得年度汇算',
            hero: { selector: '#result-net-income', label: '税后年收入' },
            rows: [
                { label: '税前年收入', selector: '#result-total-income' },
                { label: '全年应缴税额', selector: '#result-total-tax' },
                { label: '适用税率', selector: '#result-tax-rate' }
            ]
        },
        'business-step-result': {
            template: 'income',
            title: '经营所得年度汇算',
            hero: { selector: '#business-result-net-income', label: '税后经营所得' },
            rows: [
                { label: '经营利润', selector: '#business-result-profit' },
                { label: '年度扣除', selector: '#business-result-deductions' }
            ]
        },
        'classification-step-result': {
            template: 'income',
            title: '分类所得计税',
            hero: { selector: '#classification-result-net-income', label: '税后收入' },
            rows: [
                { label: '所得类型', selector: '#classification-result-type' },
                { label: '应纳税额', selector: '#classification-result-total-tax' }
            ]
        },
        'reverse-step-result': {
            template: 'negotiation',
            title: '谈薪测算',
            hero: { selector: '#reverse-result-total-income', label: '年度税前收入（可谈目标）' },
            rows: [
                { label: '年度税后收入', selector: '#reverse-result-net-income' },
                { label: '全年应缴税额', selector: '#reverse-result-total-tax' },
                { label: '适用税率', selector: '#reverse-result-tax-rate' }
            ]
        }
    };

    // 计算按钮 → 结果容器（与 lead-touchpoints / funnel-tracking 同一套映射，保持一致）
    var TRIGGERS = [
        { buttonId: 'next-to-result-btn', containerId: 'step-result' },
        { buttonId: 'calculate-business-btn', containerId: 'business-step-result' },
        { buttonId: 'calculate-classification-btn', containerId: 'classification-step-result' },
        { buttonId: 'calculate-reverse-btn', containerId: 'reverse-step-result' }
    ];

    // 模板文案：如实描述功能，不承诺收益（合规红线）
    var TEMPLATE_TEXT = {
        income: { lead: '微信扫码，30 秒算出你的税后收入' },
        negotiation: { lead: '微信扫码，测测谈薪目标该定多少' }
    };

    function escapeHtml(text) {
        return String(text == null ? '' : text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // 判断取到的文本是否是「真的算完了」：未计算时节点里是占位符（¥0 / — / 空）
    function isMeaningful(text) {
        if (!text) return false;
        var normalized = String(text).replace(/[\s¥￥,]/g, '');
        if (!normalized) return false;
        return normalized !== '0' && normalized !== '-' && normalized !== '—' && normalized !== '--';
    }

    function readText(selector) {
        var node = document.querySelector(selector);
        return node ? String(node.textContent || '').trim() : '';
    }

    // 取数：hero 必须有效，否则视为「尚未测算」而拒绝出图 ——
    // 生成一张写着 ¥0 的分享图比不出图更伤品牌
    function collect(cfg) {
        var heroValue = readText(cfg.hero.selector);
        if (!isMeaningful(heroValue)) return null;

        var rows = [];
        (cfg.rows || []).forEach(function (row) {
            var value = readText(row.selector);
            if (isMeaningful(value)) rows.push({ label: row.label, value: value });
        });

        return { heroLabel: cfg.hero.label, heroValue: heroValue, rows: rows };
    }

    // 分享落地页地址：带上 source=share 供 T4 归因（origin 自动适配本地/生产域名）
    function shareUrl() {
        var base = window.location.origin + window.location.pathname;
        return base + (base.indexOf('?') === -1 ? '?' : '&') + 'source=share';
    }

    // 二维码：qrcode-generator（CDN，与 jspdf / html2canvas 同为 SW cache-first）。
    // 生成失败不阻断出图 —— 退化为「域名文字」，分享图仍然可用，只是少了扫码入口。
    function qrDataUrl(text) {
        try {
            if (typeof window.qrcode !== 'function') return '';
            var qr = window.qrcode(0, 'M'); // typeNumber 0 = 自动选择版本，M 级容错
            qr.addData(text);
            qr.make();
            return qr.createDataURL(6, 8);
        } catch (err) {
            console.warn('[ShareCard] 二维码生成失败，降级为域名文字:', err);
            return '';
        }
    }

    function rowHtml(row) {
        return '<tr>' +
            '<td style="padding:12px 0;font-size:15px;color:#64748b;border-bottom:1px solid #e2e8f0;">' + escapeHtml(row.label) + '</td>' +
            '<td style="padding:12px 0;font-size:18px;font-weight:600;color:#0f172a;text-align:right;border-bottom:1px solid #e2e8f0;">' + escapeHtml(row.value) + '</td>' +
        '</tr>';
    }

    function qrBlockHtml(qr, template) {
        var text = TEMPLATE_TEXT[template] || TEMPLATE_TEXT.income;
        var host = window.location.host;
        var code = qr
            ? '<img src="' + qr + '" alt="扫码测算" style="width:120px;height:120px;display:block;" />'
            : '<div style="width:120px;height:120px;border:1px dashed #cbd5e1;border-radius:10px;font-size:12px;color:#94a3b8;text-align:center;line-height:120px;">扫码访问</div>';
        return '<table style="width:100%;border-top:1px dashed #cbd5e1;margin-top:34px;"><tr>' +
            '<td style="width:132px;padding-top:26px;vertical-align:middle;">' + code + '</td>' +
            '<td style="padding-top:26px;padding-left:16px;vertical-align:middle;">' +
                '<div style="font-size:16px;color:#334155;line-height:1.7;">' + escapeHtml(text.lead) + '</div>' +
                '<div style="font-size:12px;color:#94a3b8;margin-top:8px;">' + escapeHtml(host) + '</div>' +
            '</td>' +
        '</tr></table>';
    }

    // 分享图 HTML：全部使用内联样式 + table 布局。
    // 不用 flex 是刻意的 —— html2canvas 对 flexbox 的还原度不稳，
    // 而 table / 内联块在本项目 PDF 报告里已验证可靠。
    function buildHtml(cfg, data, qr) {
        var rowsHtml = (data.rows || []).map(rowHtml).join('');
        return '<div style="width:' + SHARE_IMAGE_WIDTH + 'px;box-sizing:border-box;padding:46px 44px 34px;' +
                'background:linear-gradient(160deg,#eef4ff 0%,#ffffff 46%);' +
                'font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',\'PingFang SC\',\'Microsoft YaHei\',sans-serif;color:#1f2937;">' +
            '<table style="width:100%;"><tr>' +
                '<td style="vertical-align:middle;">' +
                    '<img src="' + LOGO_SRC + '" alt="" style="width:42px;height:42px;border-radius:10px;vertical-align:middle;margin-right:12px;" />' +
                    '<span style="font-size:20px;font-weight:700;letter-spacing:.5px;vertical-align:middle;">EuriskoTax</span>' +
                    '<div style="font-size:12px;color:#64748b;margin-top:4px;">个人所得税测算工具</div>' +
                '</td>' +
                '<td style="text-align:right;vertical-align:middle;">' +
                    '<span style="display:inline-block;font-size:12px;color:#2563eb;background:#e8f0fe;border-radius:999px;padding:6px 14px;">' + escapeHtml(cfg.title) + '</span>' +
                '</td>' +
            '</tr></table>' +

            '<div style="margin-top:38px;">' +
                '<div style="font-size:15px;color:#64748b;">' + escapeHtml(data.heroLabel) + '</div>' +
                '<div style="font-size:64px;font-weight:800;color:#1d4ed8;line-height:1.12;margin-top:8px;letter-spacing:-1px;">' + escapeHtml(data.heroValue) + '</div>' +
            '</div>' +

            '<table style="width:100%;border-collapse:collapse;margin-top:30px;">' + rowsHtml + '</table>' +

            qrBlockHtml(qr, cfg.template) +

            '<div style="margin-top:22px;font-size:12px;color:#94a3b8;">' + DISCLAIMER + '</div>' +
        '</div>';
    }

    // 预加载 logo：截图时图片未就绪会留空白；加载失败也继续（少个 logo 不影响可用性）
    function preloadImage(src) {
        return new Promise(function (resolve) {
            var img = new Image();
            img.onload = function () { resolve(); };
            img.onerror = function () { resolve(); };
            img.src = src;
        });
    }

    function closePreview() {
        var existing = document.getElementById(PREVIEW_ID);
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
    }

    // 生成前预览确认（方案 §13D 的交付项之一）：
    // 分享图是要发出去给别人看的，先让用户确认再决定保存。
    function showPreview(canvas, cfg) {
        closePreview();

        var mask = document.createElement('div');
        mask.id = PREVIEW_ID;
        mask.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:10000;' +
            'background:rgba(15,23,42,.72);overflow:auto;padding:24px;';

        var card = document.createElement('div');
        card.style.cssText = 'max-width:420px;margin:0 auto;background:#fff;border-radius:16px;padding:20px;text-align:center;' +
            'box-shadow:0 20px 50px rgba(0,0,0,.3);';

        var title = document.createElement('div');
        title.style.cssText = 'font-size:15px;font-weight:700;color:#1e293b;';
        title.textContent = '分享图已生成';

        var hint = document.createElement('div');
        hint.style.cssText = 'font-size:12px;color:#94a3b8;margin-top:6px;';
        // 移动端浏览器对 a[download] 支持参差，长按保存是最可靠的兜底路径
        hint.textContent = '手机端可长按图片保存到相册';

        var img = document.createElement('img');
        img.alt = '测算结果分享图';
        img.src = canvas.toDataURL('image/png');
        img.style.cssText = 'width:100%;margin-top:14px;border:1px solid #e2e8f0;border-radius:12px;display:block;';

        var download = document.createElement('button');
        download.type = 'button';
        download.textContent = '保存图片';
        download.style.cssText = 'width:100%;margin-top:16px;padding:11px 0;border:0;border-radius:10px;' +
            'background:#2563eb;color:#fff;font-size:14px;font-weight:600;cursor:pointer;';
        download.addEventListener('click', function () {
            var name = 'EuriskoTax-' + cfg.template + '-' + new Date().toISOString().split('T')[0] + '.png';
            window.Capture.downloadCanvas(canvas, name);
        });

        var close = document.createElement('button');
        close.type = 'button';
        close.textContent = '关闭';
        close.style.cssText = 'width:100%;margin-top:8px;padding:10px 0;border:1px solid #e2e8f0;border-radius:10px;' +
            'background:#fff;color:#475569;font-size:14px;cursor:pointer;';
        close.addEventListener('click', closePreview);

        // 点遮罩空白处关闭（点卡片内部不关，避免误触）
        mask.addEventListener('click', function (e) {
            if (e.target === mask) closePreview();
        });

        card.appendChild(title);
        card.appendChild(hint);
        card.appendChild(img);
        card.appendChild(download);
        card.appendChild(close);
        mask.appendChild(card);
        document.body.appendChild(mask);
    }

    function generate(containerId) {
        var cfg = SOURCES[containerId];
        if (!cfg) return;

        if (!window.Capture || typeof window.Capture.captureHtml !== 'function') {
            alert('生成组件未就绪，请刷新页面后重试');
            return;
        }

        var data = collect(cfg);
        if (!data) {
            alert('请先完成测算，再生成分享图');
            return;
        }

        var html = buildHtml(cfg, data, qrDataUrl(shareUrl()));

        preloadImage(LOGO_SRC)
            .then(function () {
                return window.Capture.captureHtml(html, {
                    width: SHARE_IMAGE_WIDTH,
                    scale: SHARE_IMAGE_SCALE
                });
            })
            .then(function (canvas) {
                showPreview(canvas, cfg);
                // 埋点在「真的拿到图」时上报，而不是点击按钮时 ——
                // 否则生成失败（如 CDN 不可达）也会被记成一次分享，污染漏斗
                document.dispatchEvent(new CustomEvent('euriskotax:share', {
                    detail: { container: containerId, template: cfg.template }
                }));
            })
            .catch(function (err) {
                console.error('[ShareCard] 生成分享图失败:', err);
                alert('生成分享图失败，请稍后重试');
            });
    }

    function ctaHtml(containerId) {
        return '<div class="flex items-center gap-3">' +
            '<div class="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">' +
                '<i class="fa fa-picture-o text-blue-600"></i>' +
            '</div>' +
            '<div class="flex-1 min-w-0">' +
                '<h3 class="font-semibold text-gray-800 text-sm">把结果生成一张图，分享给需要的人</h3>' +
                '<p class="text-xs text-gray-600 mt-1">含税后收入的清晰长图，可直接发到群里</p>' +
            '</div>' +
            '<button type="button" class="share-card-btn btn btn-secondary text-xs px-4 py-1.5 rounded-lg whitespace-nowrap"' +
                ' data-container="' + containerId + '">生成分享图</button>' +
        '</div>';
    }

    function injectCta(containerId) {
        var container = document.getElementById(containerId);
        if (!container) return;
        if (container.querySelector('#' + CTA_BLOCK_ID)) return; // 幂等：同一容器只挂一次

        var wrap = document.createElement('div');
        wrap.id = CTA_BLOCK_ID;
        wrap.className = 'mt-6 bg-gradient-to-r from-slate-50 to-blue-50 border border-slate-200 rounded-xl p-4 sm:p-5';
        wrap.innerHTML = ctaHtml(containerId);
        container.appendChild(wrap);
    }

    function bindTriggers() {
        TRIGGERS.forEach(function (trigger) {
            var btn = document.getElementById(trigger.buttonId);
            if (!btn) return;
            btn.addEventListener('click', function () {
                // 结果由按钮原有处理器渲染（分类所得为 setTimeout），这里延后一拍注入
                setTimeout(function () { injectCta(trigger.containerId); }, 180);
            });
        });
    }

    function bindCtaClick() {
        document.addEventListener('click', function (e) {
            var btn = (e.target && e.target.closest) ? e.target.closest('.share-card-btn') : null;
            if (!btn) return;
            generate(btn.getAttribute('data-container'));
        });
    }

    function init() {
        bindTriggers();
        bindCtaClick();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.ShareCard = {
        SOURCES: SOURCES,
        TRIGGERS: TRIGGERS,
        TEMPLATE_TEXT: TEMPLATE_TEXT,
        SHARE_IMAGE_WIDTH: SHARE_IMAGE_WIDTH,
        DISCLAIMER: DISCLAIMER,
        buildHtml: buildHtml,
        collect: collect,
        generate: generate,
        shareUrl: shareUrl
    };
})();
