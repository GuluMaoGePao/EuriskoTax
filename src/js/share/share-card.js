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
    var LOGO_SRC = 'images/logo-zoomed.png';
    var CTA_BLOCK_ID = 'share-card-cta';
    var PREVIEW_ID = 'share-preview-modal';

    // 二维码的三个硬参数（都是「扫码能否成功」的直接变量，不能随手改）：
    //   1) 显示 168px —— 分享图 750px 宽，占 22%，微信里缩略时仍有足够物理尺寸；
    //   2) 静区 4 个模块 —— 二维码标准下限，少于此值部分扫码 App 直接识别失败；
    //   3) 位图 = 显示尺寸 × 截图倍率 —— 导出图里二维码近似 1:1 像素，不糊边。
    var QR_DISPLAY_PX = 168;
    var QR_QUIET_MODULES = 4;
    var QR_BITMAP_TARGET_PX = QR_DISPLAY_PX * SHARE_IMAGE_SCALE;

    // 结果容器 → 模板与取数规则（容器 id 取自 index.html 的 step-pane）
    var SOURCES = {
        // 17B-3（v1.49.0）：step-result 随综合所得旧页面删掉了。与 business / reverse 一样，
        // 综合所得的分享图改从向导的结果卡取数，认人靠 sourceKey 读 data-tool-id ——
        // 同一张卡会被三个工具轮着用，照裸 id 取会把别人的结果截进综合所得的图里。
        'dw-result-card:forward': {
            template: 'income',
            title: '综合所得年度汇算',
            hero: { selector: '#dw-result-card[data-tool-id="forward"] #dw-result-primary', label: '税后年收入' },
            rows: [
                { label: '税前年收入', selector: '#dw-result-card[data-tool-id="forward"] [data-dw-row="税前年收入"]' },
                { label: '全年应缴税额', selector: '#dw-result-card[data-tool-id="forward"] [data-dw-row="综合所得应纳税额"]' },
                { label: '适用税率', selector: '#dw-result-card[data-tool-id="forward"] [data-dw-row="适用税率"]' }
            ]
        },
        // 17B-1 / 17B-2：经营所得与反向倒算迁到 spec 驱动后，结果节点是**运行时渲染**的通用节点，
        // 在 index.html 里查不到。selector 统一带上 data-tool-id 做归属校验 —— 向导是通用
        // 渲染器，dw-result-card 会被所有 spec 工具轮着用，不加这一层就会把增值税的结果截成
        // 一张「经营所得分享图」（数值来自别的口径，比空图更难被发现）。
        //
        // 麻烦的是**两个工具共用同一个容器 id**，而模板还不一样：经营所得 → income，
        // 反向倒算（谈薪）→ negotiation。于是按工具再分一路，键写作 `容器:工具Id`，
        // 由 sourceKey() 读活节点的 data-tool-id 落到对应那一份。
        // 阶段18-3（v1.73.0）：这一份原先挂在裸键 'dw-result-card' 上，兼作「认不出时的兜底」——
        // 于是其余 17 个完整测算的取数都会落到这里，而它的 selector 写死 business，读到的自然是
        // 空，用户刚算完却看到「暂无可分享的结果」。兜底改由下面的 genericConfig 承担（按卡上
        // 的 data-tool-id 现场取数），这一份回归它本来的身份：经营所得那一路。
        'dw-result-card:business': {
            template: 'income',
            title: '经营所得年度汇算',
            hero: { selector: '#dw-result-card[data-tool-id="business"] #dw-result-primary', label: '应纳个人所得税' },
            rows: [
                { label: '应纳税所得额', selector: '#dw-result-card[data-tool-id="business"] [data-dw-row="应纳税所得额"]' },
                { label: '适用税率', selector: '#dw-result-card[data-tool-id="business"] [data-dw-row="适用税率"]' },
                { label: '减半征收减免', selector: '#dw-result-card[data-tool-id="business"] [data-dw-row="减半征收减免"]' }
            ]
        },
        // 谈薪卡的取数口径是「税前该谈多少」，与经营所得那张 income 卡完全不同 —— 这也是它必须
        // 单独一路的原因：共用一套 selector 时漏并不会报错，只会把税額截成参数不明的一张卡。
        'dw-result-card:reverse': {
            template: 'negotiation',
            title: '谈薪测算',
            hero: { selector: '#dw-result-card[data-tool-id="reverse"] #dw-result-primary', label: '税前年收入（可谈目标）' },
            rows: [
                { label: '全年税后到手', selector: '#dw-result-card[data-tool-id="reverse"] [data-dw-row="全年税后到手"]' },
                { label: '全年个人所得税', selector: '#dw-result-card[data-tool-id="reverse"] [data-dw-row="全年个人所得税"]' },
                { label: '全年扣除合计', selector: '#dw-result-card[data-tool-id="reverse"] [data-dw-row="全年扣除合计"]' }
            ]
        },
        // 17B-4（v1.50.0）：分类所得同样迁到了向导，containerId 从 'classification-step-result'
        // 改成 dw-result-card，并**按工具划一路**（dw-result-card:classification）。
        // 不划的话它会退到下面那份兜底 'dw-result-card'（business 的配置），
        // 分享图上就会出现「应纳个人所得税 ¥0」这种横刀夺爱的标题。
        'dw-result-card:classification': {
            template: 'income',
            title: '分类所得计税',
            hero: { selector: '#dw-result-card[data-tool-id="classification"] #dw-result-primary', label: '税后收入' },
            rows: [
                { label: '应纳税额', selector: '#dw-result-card[data-tool-id="classification"] [data-dw-row="应纳税额合计"]' },
                { label: '税负率', selector: '#dw-result-card[data-tool-id="classification"] [data-dw-row="实际税负率"]' }
            ]
        },
    };

    // 计算按钮 → 结果容器（与 lead-touchpoints / funnel-tracking 同一套映射，保持一致）
    // 17B-2（v1.48.0）：reverse-step-result 随反向倒算旧页面删除，谈薪这一路改走向导的 dw-next
    // → dw-result-card（同一收容容器，靠下面的 sourceKey 认出是谈薪那一路）。
    // 17B-3（v1.49.0）：综合所得同样改走 dw-next → dw-result-card，上面的取值范围跟着变 ——
    // 17B-4（v1.50.0）：分类所得跟进 —— calculate-classification-btn 随旧页面删了，
    // 现在四个迁移工具（business / reverse / forward / classification）共用同一颗 dw-next。
    var TRIGGERS = [
        { buttonId: 'dw-next', containerId: 'dw-result-card' }   // 四个迁移工具的向导下一步
    ];

    // 容器 id → 真正的取数配置。向导那两个工具（business / reverse）共用 dw-result-card，
    // 要看**此刻结果卡上挂着的是哪个工具**才分得出来 —— 照 id 直接查会把谈薪卡截成经营所得卡。
    function sourceKey(containerId) {
        if (!containerId || String(containerId).indexOf('dw-result-card') !== 0) return containerId;
        var el = document.getElementById('dw-result-card');
        var toolId = el && el.getAttribute('data-tool-id');
        var scoped = toolId ? containerId + ':' + toolId : containerId;
        return SOURCES[scoped] ? scoped : containerId;
    }

    // 阶段18-3（v1.73.0）：21 个完整测算共用同一张结果卡，而手写的取数配置只有阶段17 逐个迁移
    // 的那 4 份。其余 17 个算完点「生成分享图」时，sourceKey 认不出就退回裸键，裸键的 selector
    // 指向另一个工具，读到的自然是空 —— 用户看到「暂无可分享的结果…请先完成一次测算」，
    // 而保存与导出都是好的（与阶段18-2 的历史查看同一个病：按名字认人的表，每加一种形态就漏
    // 一批）。与其每加一个测算就补一份配置（漏一个就静默失败），不如给 spec 驱动的向导一份
    // **通用取数**：主结果是 #dw-result-primary，明细照卡上的 data-dw-row 抄前几行，
    // 标题取注册表里的工具名。手写那 4 份仍在 —— 它们是挑过行的（分类所得取的是实际税负率
    // 而不是适用税率），通用取数只会照卡上顺序抄。
    var GENERIC_ROW_LIMIT = 3;

    function rowsFromCard(card, scoped) {
        var rows = [];
        if (!card) return rows;
        var nodes = card.querySelectorAll('[data-dw-row]');
        for (var i = 0; i < nodes.length && rows.length < GENERIC_ROW_LIMIT; i++) {
            var label = nodes[i].getAttribute('data-dw-row');
            // 行标签要拼进属性选择器，带引号会把选择器撑坏 —— 宁可少一行，也不出半张图
            if (!label || String(label).indexOf('"') !== -1) continue;
            rows.push({ label: label, selector: scoped + ' [data-dw-row="' + label + '"]' });
        }
        return rows;
    }

    function genericConfig(containerId) {
        var el = document.getElementById(containerId);
        var toolId = el && el.getAttribute('data-tool-id');
        if (!toolId) return null;
        var reg = window.EuriskoToolRegistry;
        var tool = reg && typeof reg.get === 'function' ? reg.get(toolId) : null;
        var scoped = '#' + containerId + '[data-tool-id="' + toolId + '"]';
        return {
            // 谈薪卡的口径是「税前该谈多少」，与 income 那张完全不同 —— 这一路是手写的，
            // 通用取数也必须尊重这个分流，否则谈薪会被写成一张正向结果卡。
            template: toolId === 'reverse' ? 'negotiation' : 'income',
            title: (tool && tool.name) ? tool.name : toolId,
            hero: {
                selector: scoped + ' #dw-result-primary',
                label: readText(scoped + ' #dw-result-primary-label') || '测算结果'
            },
            rows: rowsFromCard(el, scoped)
        };
    }

    // 解析顺序不能反：先认「容器 + 工具」的手写配置（挑过行），再回落到通用取数。
    function resolveConfig(rawContainerId) {
        var key = sourceKey(rawContainerId);
        return SOURCES[key] || genericConfig(rawContainerId);
    }

    // 模板文案：如实描述功能，不承诺收益（合规红线）。
    // 「微信扫码」这一步的指引放在二维码旁固定展示，文案本身只说价值，避免同一句话重复两遍。
    var TEMPLATE_TEXT = {
        income: { lead: '30 秒算出你的税后收入' },
        negotiation: { lead: '谈薪前，先算清税前该谈多少' }
    };

    function escapeHtml(text) {
        return String(text == null ? '' : text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // 判断取到的文本是否是「真的算完了」：未计算时节点里是占位符（¥0 / ¥0.00 / — / 空）
    // 注意：¥0.00 这种「小数零」也要拒绝，否则分享图会生成一张写着 0 元的结果图
    function isMeaningful(text) {
        if (!text) return false;
        var normalized = String(text).replace(/[\s¥￥,%]/g, '');
        if (!normalized) return false;
        // 允许 "3%" 这种有意义的税率，但拒绝纯 0（含 0.00 / 0.0）
        if (normalized === '0' || /^0\.0*$/.test(normalized)) return false;
        return normalized !== '-' && normalized !== '—' && normalized !== '--';
    }

    function readText(selector) {
        var node = document.querySelector(selector);
        return node ? String(node.textContent || '').trim() : '';
    }

    // 明细行的值：向导把「标签」和「值」渲染在**同一个节点**里
    // （'<div data-dw-row="适用税率"><span>适用税率</span><span>20%</span></div>'），
    // 照 textContent 整取会把标签一起带进图上（「适用税率20%」）—— 与 lead-context.js 同一处坑，
    // 那里也是取最后一个 span。值 span 恒在最后，不依赖 class，也不要求每行都有标签。
    function readCell(selector) {
        var node = document.querySelector(selector);
        if (!node) return '';
        var spans = node.querySelectorAll('span');
        var value = spans.length ? spans[spans.length - 1] : node;
        return String(value.textContent || '').trim();
    }

    // 取数：hero 必须有效，否则视为「尚未测算」而拒绝出图 ——
    // 生成一张写着 ¥0 的分享图比不出图更伤品牌
    function collect(cfg) {
        var heroValue = readText(cfg.hero.selector);
        if (!isMeaningful(heroValue)) return null;

        var rows = [];
        (cfg.rows || []).forEach(function (row) {
            var value = readCell(row.selector);
            if (isMeaningful(value)) rows.push({ label: row.label, value: value });
        });

        return { heroLabel: cfg.hero.label, heroValue: heroValue, rows: rows };
    }

    // 分享落地页地址：带上 source=share 供 T4 归因。
    // 默认取 window.location.origin，但允许通过 window.EuriskoTaxConfig.shareBaseUrl 或
    // ShareCard.setShareBaseUrl() 覆盖 —— 避免本地开发环境（localhost:3000）被生成到线上分享图里。
    // 「无损缩短」是刻意的：二维码每多一个字符就可能多占一个版本（模块更密 → 更难扫），
    // 所以去掉默认文档名 index.html（多数静态托管处以 / 访问同一页面）与多余的查询串。
    var shareBaseUrl = (typeof window !== 'undefined' && window.EuriskoTaxConfig && window.EuriskoTaxConfig.shareBaseUrl)
        ? window.EuriskoTaxConfig.shareBaseUrl
        : '';

    function shareUrl() {
        var origin = shareBaseUrl || (typeof window !== 'undefined' ? window.location.origin : '');
        var path = (typeof window !== 'undefined' ? (window.location.pathname || '/') : '/').replace(/index\.html?$/i, '') || '/';
        return origin + path + '?source=share';
    }

    function setShareBaseUrl(url) {
        shareBaseUrl = String(url || '').replace(/\/$/, '');
    }

    // 二维码：qrcode-generator（CDN，与 jspdf / html2canvas 同为 SW cache-first）。
    // 生成失败不阻断出图 —— 退化为「域名文字」，分享图仍然可用，只是少了扫码入口。
    function qrDataUrl(text) {
        try {
            if (typeof window.qrcode !== 'function') return '';
            var qr = window.qrcode(0, 'M'); // typeNumber 0 = 按内容长度自动选版本；M 级容错兼顾模块密度与抗压缩
            qr.addData(text);
            qr.make();

            // 模块尺寸取整：二维码是纯硬边图形，非整数倍缩放会把黑块糊成灰块，微信再压一道就扫不动了。
            // 所以按「目标位图像素 ÷ 总模块数」反算 cellSize，而不是固定 6px ——
            // 固定值会让较长的 URL 悄悄变成更密的图案（更难扫），长度变化时质量不可控。
            var totalModules = qr.getModuleCount() + QR_QUIET_MODULES * 2;
            var cellSize = Math.max(2, Math.round(QR_BITMAP_TARGET_PX / totalModules));

            // 注意：qrcode-generator 的 margin 单位是「像素」而不是「模块」
            // （1.4.x 源码：margin 默认 4 * cellSize），所以这里显式传 4 个模块的像素宽度。
            return qr.createDataURL(cellSize, QR_QUIET_MODULES * cellSize);
        } catch (err) {
            console.warn('[ShareCard] 二维码生成失败，降级为域名文字:', err);
            return '';
        }
    }

    // isLast：最后一行去掉下边框，否则明细表底部会多出一条悬空的线
    function rowHtml(row, isLast) {
        var border = isLast ? 'none' : '1px solid #e2e8f0';
        return '<tr>' +
            '<td style="padding:13px 0;font-size:15px;color:#64748b;border-bottom:' + border + ';">' + escapeHtml(row.label) + '</td>' +
            '<td style="padding:13px 0;font-size:18px;font-weight:600;color:#0f172a;text-align:right;border-bottom:' + border + ';">' + escapeHtml(row.value) + '</td>' +
        '</tr>';
    }

    function qrBlockHtml(qr, template, host) {
        var text = TEMPLATE_TEXT[template] || TEMPLATE_TEXT.income;
        host = host || (typeof window !== 'undefined' ? window.location.host : '');
        var size = QR_DISPLAY_PX + 'px';

        // 二维码外面再包一层白卡：给扫码 App 留出干净的识别底，
        // 直接压在渐变底色上时，部分 App 会因对比度判定不足而识别变慢。
        var code = qr
            ? '<img src="' + qr + '" alt="微信扫码测算" style="width:' + size + ';height:' + size + ';display:block;" />'
            : '<div style="width:' + size + ';height:' + size + ';border:1px dashed #cbd5e1;border-radius:12px;' +
              'font-size:13px;color:#94a3b8;text-align:center;line-height:' + size + ';">扫码访问</div>';

        return '<table style="width:100%;border-top:1px dashed #cbd5e1;margin-top:34px;"><tr>' +
            '<td style="width:' + (QR_DISPLAY_PX + 24) + 'px;padding-top:26px;vertical-align:middle;">' +
                '<div style="display:inline-block;padding:10px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;">' + code + '</div>' +
            '</td>' +
            '<td style="padding-top:26px;padding-left:20px;vertical-align:middle;">' +
                '<div style="font-size:12px;font-weight:700;color:#2563eb;letter-spacing:1px;">微信扫码 · 长按识别</div>' +
                '<div style="font-size:17px;font-weight:600;color:#1f2937;line-height:1.6;margin-top:8px;">' + escapeHtml(text.lead) + '</div>' +
                '<div style="font-size:12px;color:#94a3b8;margin-top:10px;">' + escapeHtml(host) + '</div>' +
            '</td>' +
        '</tr></table>';
    }

    // 分享图 HTML：全部使用内联样式 + table 布局。
    // 不用 flex 是刻意的 —— html2canvas 对 flexbox 的还原度不稳，
    // 而 table / 内联块在本项目 PDF 报告里已验证可靠。
    function buildHtml(cfg, data, qr) {
        var rows = data.rows || [];
        var rowsHtml = rows.map(function (row, index, arr) {
            return rowHtml(row, index === arr.length - 1);
        }).join('');

        // 二维码区显示的 host 必须与二维码实际指向的域名一致（避免用户扫的是一个域名、看的是另一个域名）
        var landingUrl = shareUrl();
        var host = landingUrl.replace(/^https?:\/\//, '').split('/')[0];

        // 两层结构：外层白底承载顶部品牌条，内层负责渐变底与留白 ——
        // 品牌条必须通栏（不受 padding 约束），因此不能与内容共用一层。
        return '<div style="width:' + SHARE_IMAGE_WIDTH + 'px;box-sizing:border-box;background:#ffffff;' +
                'font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',\'PingFang SC\',\'Microsoft YaHei\',sans-serif;color:#1f2937;">' +
            '<div style="height:6px;background:linear-gradient(90deg,#2563eb 0%,#60a5fa 50%,#2563eb 100%);"></div>' +
            '<div style="padding:42px 44px 34px;background:linear-gradient(160deg,#eef4ff 0%,#ffffff 46%);">' +
            '<table style="width:100%;"><tr>' +
                '<td style="vertical-align:middle;">' +
                    '<img src="' + LOGO_SRC + '" alt="EuriskoTax" style="width:150px;height:auto;display:block;" />' +
                    
                    '<div style="font-size:12px;color:#64748b;margin-top:4px;">个人所得税测算工具</div>' +
                '</td>' +
                '<td style="text-align:right;vertical-align:middle;">' +
                    '<span style="display:inline-block;font-size:12px;color:#2563eb;background:#e8f0fe;border-radius:999px;padding:6px 14px;">' + escapeHtml(cfg.title) + '</span>' +
                '</td>' +
            '</tr></table>' +

            '<div style="margin-top:34px;background:#f4f8ff;border:1px solid #dbe7ff;border-left:6px solid #2563eb;border-radius:18px;padding:26px 30px;">' +
                '<div style="font-size:15px;color:#64748b;">' + escapeHtml(data.heroLabel) + '</div>' +
                '<div style="font-size:64px;font-weight:800;color:#1d4ed8;line-height:1.12;margin-top:8px;letter-spacing:-1px;">' + escapeHtml(data.heroValue) + '</div>' +
            '</div>' +

            '<table style="width:100%;border-collapse:collapse;margin-top:30px;">' + rowsHtml + '</table>' +

            qrBlockHtml(qr, cfg.template, host) +

            '<div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;">' + DISCLAIMER + '</div>' +
            '</div>' +
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

    // 轻量提示条：替代浏览器原生 alert 对话框。
    // 为什么必须换掉：Chrome 在用户多次触发后会静默屏蔽后续对话框
    // （「阻止此页面创建更多对话框」），届时 alert 既不显示也不报错，
    // 用户看到的就是「点了没反应」——最难排查的一类故障。
    // 页面内提示不受该限制，且不阻塞主线程。
    var TOAST_ID = 'share-card-toast';

    // 提示条要落在「贴住视口顶部、且不与既有固定层重叠」的位置：
    // 顶部导航栏（sticky）与离线 / 更新横幅都是贴顶固定元素，
    // 一律压 top:16px 会叠在一起，所以按实际占位顺延。
    function toastTopOffset() {
        var offset = 16;
        ['.compact-nav', '#offline-banner', '#sw-update-banner'].forEach(function (selector) {
            var el = document.querySelector(selector);
            if (!el) return;
            var rect = el.getBoundingClientRect();
            // 只顺延「真的贴在视口顶部」的元素（sticky 导航滚动后仍满足这一条件）
            if (rect.height > 0 && rect.top <= 1) offset += rect.height;
        });
        return offset;
    }

    function showToast(message) {
        var existing = document.getElementById(TOAST_ID);
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

        var toast = document.createElement('div');
        toast.id = TOAST_ID;
        toast.setAttribute('role', 'alert');
        // 放在顶部：底部提示落在结果区与按钮的视线之外，用户很容易整条错过。
        // z-index 高于预览遮罩(10000)与页面顶部横幅(9999)，保证任何情况下都可见。
        toast.style.cssText = 'position:fixed;left:50%;z-index:10002;' +
            'top:calc(' + toastTopOffset() + 'px + env(safe-area-inset-top, 0px));' +
            'transform:translateX(-50%);max-width:88%;padding:12px 20px;border-radius:10px;' +
            'background:rgba(15,23,42,.94);color:#fff;font-size:13px;line-height:1.5;text-align:center;' +
            'box-shadow:0 10px 30px rgba(0,0,0,.25);';
        toast.textContent = message;
        document.body.appendChild(toast);

        // 顶部静态出现的提示最容易被当成「页面本来就有的东西」而滑过去，补一个下滑入场
        if (typeof toast.animate === 'function') {
            toast.animate(
                [{ opacity: 0, transform: 'translate(-50%,-12px)' }, { opacity: 1, transform: 'translate(-50%,0)' }],
                { duration: 220, easing: 'ease-out' }
            );
        }

        setTimeout(function () {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 3600);
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

    // 任何一条失败路径都必须有「用户可见 + 控制台可查」的反馈。
    // 静默 return 是最坏的选择：用户只会说「点了没反应」，排查时无从下手。
    function generate(rawContainerId) {
        var containerId = sourceKey(rawContainerId);
        var cfg = resolveConfig(rawContainerId);
        if (!cfg) {
            console.warn('[ShareCard] 未识别的结果容器，无法生成分享图:', containerId);
            showToast('生成失败：未识别的结果类型，请刷新页面后重试');
            return;
        }

        if (!window.Capture || typeof window.Capture.captureHtml !== 'function') {
            console.warn('[ShareCard] 截图公共层 Capture 未就绪');
            showToast('生成组件未就绪，请刷新页面后重试');
            return;
        }

        var data = collect(cfg);
        if (!data) {
            // 把实际读到的值一并提示：用户一眼就知道该回去补哪一步，
            // 而不是怀疑「按钮坏了」
            var current = readText(cfg.hero.selector) || '空';
            console.warn('[ShareCard] 结果为空，拒绝出图:', cfg.hero.selector, '=', current);
            showToast('暂无可分享的结果（' + cfg.hero.label + '显示为 ' + current + '），请先完成一次测算');
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
                showToast('生成分享图失败，请稍后重试');
            });
    }

    function ctaHtml(containerId) {
        return '<div class="flex items-center gap-3">' +
            '<div class="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">' +
                '<i class="fa fa-picture-o text-blue-600"></i>' +
            '</div>' +
            '<div class="flex-1 min-w-0">' +
                '<h3 class="font-semibold text-gray-800 text-sm">生成一张结果长图，分享给需要的人</h3>' +
                '<p class="text-xs text-gray-600 mt-1">含税后收入与税额明细，可直接转发到群聊或朋友圈</p>' +
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

    // 阶段18-5（v1.75.0）：向导的「下一步 / 计算结果」按钮是**每次渲染重新生成**的，而这里
    // 原先在页面加载时按 getElementById('dw-next') 直接绑一次 —— 页面式时代那颗按钮是静态
    // DOM，绑一次管一辈子；迁到 spec 驱动（阶段17）后换成动态渲染，绑的那一颗早被替换掉了，
    // 于是 21 个完整测算的分享图入口**一次都没挂上过**（结果区只有保存 / 导出，没有分享）。
    // 改成事件委托（与下面 CTA 的点击同一套做法）：认的是 id，不是那一颗具体的节点。
    function bindTriggers() {
        var buttons = TRIGGERS.map(function (t) { return '#' + t.buttonId; }).join(', ');
        document.addEventListener('click', function (e) {
            var btn = (e.target && e.target.closest) ? e.target.closest(buttons) : null;
            if (!btn) return;
            var trigger = TRIGGERS.filter(function (t) { return t.buttonId === btn.id; })[0];
            if (!trigger) return;
            // 结果由按钮原有处理器渲染（分类所得为 setTimeout），这里延后一拍注入
            setTimeout(function () { injectCta(trigger.containerId); }, 180);
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
        sourceKey: sourceKey,
        resolveConfig: resolveConfig,   // 测试与排查用：看「这一次到底按哪一份配置出图」
        buildHtml: buildHtml,
        collect: collect,
        generate: generate,
        shareUrl: shareUrl,
        setShareBaseUrl: setShareBaseUrl,
        showToast: showToast
    };
})();
