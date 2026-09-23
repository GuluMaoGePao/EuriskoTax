// Phase 1.5 运行时环境识别测试
//   1) 容器识别要准：微信 / 企微 / QQ 内置 / 微博 / 钉钉 → inApp 且 downloadSupported=false
//   2) **不许误伤**：QQBrowser / Chrome / Safari 这类真正支持下载的浏览器必须仍可下载
//      —— 误判会让本可一键下载的用户绕远路，这类静默劣化只有测试能拦
//   3) 降级链永远有出路：way 必须在「way + fallbacks」里，且至少包含 text
//   4) htmlToPlainText 的基本可读性（表格换行、实体还原）

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// runtime-env.js 是 IIFE（挂 window.EuriskoEnv）；jest 环境为 jsdom，直接 eval 即可
(0, eval)(fs.readFileSync(path.join(ROOT, 'src/js/utils/runtime-env.js'), 'utf8'));

const Env = global.EuriskoEnv || window.EuriskoEnv;

const UA_WECHAT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 MicroMessenger/8.0.40(0x18002832) NetType/WIFI Language/zh_CN';
const UA_WXWORK = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 wxwork/4.0.8 MicroMessenger/7.0.1 Language/zh';
const UA_QQ_INAPP = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) QQ/8.9.88.616 NetType/WIFI Pixel/1170';
const UA_QQBROWSER = 'Mozilla/5.0 (Linux; Android 12; SM-G9910 Build/SP1A.210812.016) AppleWebKit/537.36 Chrome/99.0.4844.88 MQQBrowser/13.5 Mobile Safari/537.36';
const UA_WEIBO = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 Weibo/13.6.1';
const UA_DINGTALK = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 DingTalk/7.0.10 Language/zh';
const UA_CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const UA_SAFARI_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 Version/16.6 Mobile/15E148 Safari/604.1';

describe('Phase 1.5 环境识别 - 容器内环境', () => {
    test('微信 / 企微 / QQ内置 / 微博 / 钉钉 均判为 inApp 且不可直接下载', () => {
        [
            [UA_WECHAT, 'wechat'],
            [UA_WXWORK, 'wechatWork'],
            [UA_QQ_INAPP, 'qq'],
            [UA_WEIBO, 'weibo'],
            [UA_DINGTALK, 'dingtalk']
        ].forEach(([ua, key]) => {
            const env = Env.pure.detectEnv(ua, { anchorDownloadSupported: true });
            expect(env[key]).toBe(true);
            expect(env.inApp).toBe(true);
            expect(env.downloadSupported).toBe(false);
        });
    });

    test('平台判定正确（ iOS / Android 不被容器判定带偏）', () => {
        expect(Env.pure.detectEnv(UA_WECHAT).ios).toBe(true);
        expect(Env.pure.detectEnv(UA_QQBROWSER).android).toBe(true);
    });
});

describe('Phase 1.5 环境识别 - 不误伤真实浏览器', () => {
    test('Chrome / Safari / QQBrowser 仍支持直接下载', () => {
        [UA_CHROME, UA_SAFARI_IPHONE, UA_QQBROWSER].forEach((ua) => {
            const env = Env.pure.detectEnv(ua, { anchorDownloadSupported: true });
            expect(env.inApp).toBe(false);
            expect(env.downloadSupported).toBe(true);
        });
    });

    test('QQ 内置浏览器不会被误判成 QQBrowser（反之亦然）', () => {
        expect(Env.pure.detectEnv(UA_QQ_INAPP).qq).toBe(true);
        expect(Env.pure.detectEnv(UA_QQBROWSER).qq).toBe(false);
    });

    test('特性探测为不支持时，即便不是容器也降级', () => {
        const env = Env.pure.detectEnv(UA_CHROME, { anchorDownloadSupported: false });
        expect(env.inApp).toBe(false);
        expect(env.downloadSupported).toBe(false);
    });
});

describe('Phase 1.5 交付降级链', () => {
    test('可下载环境首选下载，且备选包含长图与文本', () => {
        const env = Env.pure.detectEnv(UA_CHROME, { anchorDownloadSupported: true });
        const d = Env.pure.pickDelivery(env, { image: true });
        expect(d.way).toBe('download');
        expect(d.fallbacks).toContain('image');
        expect(d.fallbacks).toContain('text');
    });

    test('微信内首选长图（长按保存），文本永远在链上', () => {
        const env = Env.pure.detectEnv(UA_WECHAT, { anchorDownloadSupported: true });
        const d = Env.pure.pickDelivery(env, { image: true });
        expect(d.way).toBe('image');
        expect(d.fallbacks).toContain('text');
    });

    test('没有长图能力时也不会没有出路（退回文本，并保留手动下载尝试）', () => {
        const env = Env.pure.detectEnv(UA_WECHAT, { anchorDownloadSupported: true });
        const d = Env.pure.pickDelivery(env, { image: false });
        expect(d.way).toBe('text');
        expect(d.fallbacks).toContain('download');
    });

    test('任何输入下 way 都可用（防御：env 为空也不炸）', () => {
        [null, undefined, {}, { downloadSupported: true }].forEach((env) => {
            const d = Env.pure.pickDelivery(env, { image: true });
            expect([d.way].concat(d.fallbacks)).toContain('text');
        });
    });
});

describe('Phase 1.5 兜底文案', () => {
    test('正常下载不需要解释文案', () => {
        const env = Env.pure.detectEnv(UA_CHROME, { anchorDownloadSupported: true });
        expect(Env.pure.deliveryHint(env, 'download')).toBe('');
    });

    test('微信文案点明「为什么 + 现在能怎么办」', () => {
        const env = Env.pure.detectEnv(UA_WECHAT, {});
        const hint = Env.pure.deliveryHint(env, 'image');
        expect(hint).toContain('微信');
        expect(hint).toContain('长按');
    });

    test('未知容器也有兜底文案（不留空白提示）', () => {
        const hint = Env.pure.deliveryHint({}, 'image');
        expect(hint.length).toBeGreaterThan(0);
    });
});

describe('Phase 1.5 结果 HTML → 纯文本', () => {
    test('表格行换行、单元格分隔、实体还原', () => {
        const text = Env.pure.htmlToPlainText(
            '<table><tr><td>应纳税额</td><td>¥1,234.00</td></tr>' +
            '<tr><td>税率</td><td>10%&nbsp;&amp;&nbsp;速算扣除数 210</td></tr></table>'
        );
        expect(text).toContain('应纳税额');
        expect(text).toContain('¥1,234.00');
        expect(text).toContain('10% & 速算扣除数');
        expect(text.split('\n').length).toBeGreaterThan(1);
    });

    test('script / style 内容不进文本（避免把样式噪声复制出去）', () => {
        const text = Env.pure.htmlToPlainText('<style>.a{color:red}</style><p>实发工资 8000</p>');
        expect(text).not.toContain('color:red');
        expect(text).toContain('实发工资 8000');
    });

    test('空值不炸', () => {
        [null, undefined, '', '<div></div>'].forEach((v) => {
            expect(typeof Env.pure.htmlToPlainText(v)).toBe('string');
        });
    });
});

describe('Phase 1.5 模块契约', () => {
    test('对外暴露的方法齐备（调用方改名会静默失效）', () => {
        ['detectEnv', 'pickDelivery', 'deliveryHint', 'htmlToPlainText', 'copyToClipboard',
            'currentEnv', 'openFallbackPanel', 'applyStandaloneFlag'].forEach((k) => {
            expect(typeof Env[k]).toBe('function');
        });
    });

    test('pure 入口只暴露纯函数（避免测试误依赖 DOM）', () => {
        expect(typeof Env.pure).toBe('object');
        ['detectEnv', 'pickDelivery', 'deliveryHint', 'htmlToPlainText'].forEach((k) => {
            expect(typeof Env.pure[k]).toBe('function');
        });
    });

    test('currentEnv 在 jsdom 下返回可用结构', () => {
        const env = Env.currentEnv();
        expect(typeof env.downloadSupported).toBe('boolean');
        expect(typeof env.inApp).toBe('boolean');
        expect(typeof env.standalone).toBe('boolean');
    });
});
