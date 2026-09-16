// 阶段13B 企业微信活码（留资弹窗「立即通道」）
//   为什么单独一个文件盯它：活码**配错形态不会报错**，只会变成一张裂图。
//   企微「联系我」给的是**链接**（work.weixin.qq.com/kfid/...），不是图片；
//   早先的实现把它直接塞进 <img src>，弹窗看着一切正常，二维码位却是破图 ——
//   而留资弹窗是冷启动唯一的即时承接通道，坏了没人会第一时间发现。
//   所以这里盯三件事：① 配置确实是活码链接；② 链接型走现场生码而非直接当 src；
//   ③ 生码失败（CDN 没加载）也不让通道废掉，退化成可点的「点此联系顾问」。

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const readSrc = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const INDEX_HTML = readSrc('index.html');

// lead-modal.js 是 IIFE（挂 window.LeadModal）；jest 环境为 jsdom，直接 eval 即可
(0, eval)(readSrc('src/js/lead/lead-modal.js'));

const LeadModal = global.LeadModal || window.LeadModal;

const KFID = 'https://work.weixin.qq.com/kfid/kfcdb871293d06fc4d0';

function setupDom() {
    document.body.innerHTML = [
        '<div id="lead-modal" class="hidden"></div>',
        '<a id="lead-wecom-link" href="#"></a>',
        '<img id="lead-wecom-qr" src="" />',
        '<p id="lead-wecom-fallback" class="hidden"></p>'
    ].join('');
}

// qrcode-generator 的最小替身：只关心「生码分支有没有被调用、结果有没有落到 src 上」
function fakeQrcode(dataUrl) {
    return function () {
        return {
            addData() {},
            make() {},
            getModuleCount: () => 33,
            createDataURL: () => dataUrl
        };
    };
}

describe('阶段13B 活码配置（index.html）', () => {
    test('wecomQrUrl 已配成企业微信「联系我」活码链接（空配置 = 立即通道整个消失）', () => {
        const m = INDEX_HTML.match(/window\.LEAD_CONFIG\s*=\s*\{[^}]*wecomQrUrl\s*:\s*'([^']*)'/);
        expect(m).not.toBeNull();
        expect(m[1]).toMatch(/^https:\/\/work\.weixin\.qq\.com\/kfid\/[A-Za-z0-9]+$/);
    });

    test('二维码位整块可点，且带生码失败的兜底文案（id 改名会让点击入口静默失效）', () => {
        expect(INDEX_HTML).toContain('id="lead-wecom-link"');
        expect(INDEX_HTML).toContain('id="lead-wecom-fallback"');
    });

    // 加好友活码只有图片形态（后台给的是一张 PNG），路径写错的话静态托管照常 200，
    // 浏览器里就是一张裂图 —— 而弹窗只有真正点开才加载，等人肉眼发现往往已经过了很久。
    test('分码里填的本地图片必须在磁盘上存在（填错路径 = 线上裂图，且不报错）', () => {
        const block = INDEX_HTML.match(/wecomQrByChannel\s*:\s*\{([\s\S]*?)\}/);
        expect(block).not.toBeNull();

        // 只取 `键: '值'` 的值：直接扫裸引号会把 modal: '' 的空引号连同后面的注释一起吞进来
        const values = Array.from(block[1].matchAll(/:\s*'([^']*)'/g))
            .map((m) => m[1])
            .filter(Boolean);
        values.forEach((v) => {
            if (/^https?:\/\//i.test(v)) return; // 外链形态交给运行时，这里只盯本地文件
            expect(fs.existsSync(path.join(ROOT, v))).toBe(true);
        });
    });
});

describe('阶段13B 活码渲染（链接型 vs 图片型）', () => {
    beforeEach(() => {
        setupDom();
        delete window.qrcode;
    });

    test('kfid 链接被判为「不是图片」—— 判错就会拿网页当图片渲染', () => {
        expect(LeadModal._wecom.isImageLikeUrl(KFID)).toBe(false);
        expect(LeadModal._wecom.isImageLikeUrl('images/lead-wecom-qr.png')).toBe(true);
        expect(LeadModal._wecom.isImageLikeUrl('https://wework.qpic.cn/wwpic/123')).toBe(true);
        expect(LeadModal._wecom.isImageLikeUrl('data:image/png;base64,AAA')).toBe(true);
    });

    test('链接型活码现场生码：img 拿到的是二维码图，不是链接本身', () => {
        window.qrcode = fakeQrcode('data:image/gif;base64,QR');
        window.LEAD_CONFIG = { wecomQrUrl: KFID };

        expect(LeadModal._wecom.renderQr()).toBe(true);

        const qr = document.getElementById('lead-wecom-qr');
        expect(qr.getAttribute('src')).toBe('data:image/gif;base64,QR');
        expect(qr.classList.contains('hidden')).toBe(false);
        // 不想扫码的人还有一条路：点击直接进企微添加页
        expect(document.getElementById('lead-wecom-link').getAttribute('href')).toBe(KFID);
    });

    test('生码失败（CDN 没加载）不留裂图：隐藏图片位并显示「点此联系顾问」', () => {
        window.LEAD_CONFIG = { wecomQrUrl: KFID };

        LeadModal._wecom.renderQr();

        const qr = document.getElementById('lead-wecom-qr');
        expect(qr.hasAttribute('src')).toBe(false);
        expect(qr.classList.contains('hidden')).toBe(true);
        expect(document.getElementById('lead-wecom-fallback').classList.contains('hidden')).toBe(false);
        expect(document.getElementById('lead-wecom-link').getAttribute('href')).toBe(KFID);
    });

    test('图片型配置仍然直接当 src 用（换成链接后不许把老配置搞坏）', () => {
        window.LEAD_CONFIG = { wecomQrUrl: 'images/lead-wecom-qr.png' };

        expect(LeadModal._wecom.renderQr()).toBe(true);
        expect(document.getElementById('lead-wecom-qr').getAttribute('src')).toBe('images/lead-wecom-qr.png');
        expect(document.getElementById('lead-wecom-fallback').classList.contains('hidden')).toBe(true);
    });

    test('未配置时 renderQr 返回 false —— 弹窗据此降级为仅留言通道并告警', () => {
        window.LEAD_CONFIG = {};
        expect(LeadModal._wecom.renderQr()).toBe(false);
    });
});

describe('阶段13B 按入口分码（一个入口一个码）', () => {
    beforeEach(() => {
        setupDom();
        window.qrcode = fakeQrcode('data:image/gif;base64,QR');
    });

    test('入口 → 渠道归类：分享图来的走 share，落地页走 landing，其余走 modal', () => {
        expect(LeadModal._wecom.channelOfSource('share')).toBe('share');
        expect(LeadModal._wecom.channelOfSource('seo_salary')).toBe('landing');
        expect(LeadModal._wecom.channelOfSource('result_settlement')).toBe('modal');
        expect(LeadModal._wecom.channelOfSource('')).toBe('modal');
    });

    test('配了专属码的入口用专属码，没配的回落兜底码 —— 少配一个入口不会让通道消失', () => {
        window.LEAD_CONFIG = {
            wecomQrUrl: KFID,
            wecomQrByChannel: { modal: 'https://work.weixin.qq.com/kfid/CHANNEL_MODAL', share: '   ' }
        };
        expect(LeadModal._wecom.wecomQrUrl('modal')).toBe('https://work.weixin.qq.com/kfid/CHANNEL_MODAL');
        expect(LeadModal._wecom.wecomQrUrl('share')).toBe(KFID);   // 空白串视同未配
        expect(LeadModal._wecom.wecomQrUrl('landing')).toBe(KFID); // 压根没配
    });

    test('未知渠道值不透传，一律回落兜底码（渠道名会流进埋点与 DOM）', () => {
        window.LEAD_CONFIG = { wecomQrUrl: KFID, wecomQrByChannel: { modal: 'https://work.weixin.qq.com/kfid/M' } };
        expect(LeadModal._wecom.wecomQrUrl('<script>')).toBe(KFID);
        expect(LeadModal._wecom.wecomQrUrl('__proto__')).toBe(KFID);
        expect(LeadModal._wecom.wecomQrUrl(undefined)).toBe(KFID);
    });

    test('分享来源的弹窗渲染 share 专属码：二维码与点击入口都指向它', () => {
        const shareKf = 'https://work.weixin.qq.com/kfid/CHANNEL_SHARE';
        window.LEAD_CONFIG = { wecomQrUrl: KFID, wecomQrByChannel: { share: shareKf } };

        expect(LeadModal._wecom.renderQr(LeadModal._wecom.channelOfSource('share'))).toBe(true);
        expect(document.getElementById('lead-wecom-qr').getAttribute('src')).toBe('data:image/gif;base64,QR');
        expect(document.getElementById('lead-wecom-link').getAttribute('href')).toBe(shareKf);
    });
});
