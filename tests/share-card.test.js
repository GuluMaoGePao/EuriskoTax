// 阶段13D 分享图测试
//   1) 模板分流：4 类结果 → 2 个模板（谈薪走 negotiation，其余走 income）
//   2) 跨文件契约（本文件最有价值的部分）：SOURCES 里的 selector 与容器 id 必须在 index.html 中真实存在
//      —— id 被改名不会报错，只会让分享图静默截出空值，必须由测试守住
//   3) 合规：每张图固定带免责声明，文案不含「避税 / 节税 / 税筹」
//   4) 闭环：派发 euriskotax:share 且漏斗端真的在监听；?source=share 落地归因被留资弹窗读取
//   5) 共用：PDF 导出与分享图都走 Capture.captureHtml，不再各自维护一份 html2canvas 配置

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const readSrc = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const INDEX_HTML = readSrc('index.html');

// share-card.js 是 IIFE（挂 window.ShareCard）；jest 环境为 jsdom，直接 eval 即可
(0, eval)(readSrc('src/js/share/share-card.js'));

const ShareCard = global.ShareCard || window.ShareCard;

const SAMPLE_DATA = {
    heroLabel: '税后年收入',
    heroValue: '¥253,080',
    rows: [{ label: '税前年收入', value: '¥360,000' }]
};

describe('阶段13D 分享图 - 模板分流', () => {
    test('4 类结果各归其模板：谈薪 → negotiation，其余 → income', () => {
        expect(ShareCard.SOURCES['reverse-step-result'].template).toBe('negotiation');
        ['step-result', 'business-step-result', 'classification-step-result'].forEach((id) => {
            expect(ShareCard.SOURCES[id].template).toBe('income');
        });
    });

    test('触发器覆盖全部结果容器（新增结果页漏配 = 那个页面没有分享出口）', () => {
        expect(ShareCard.TRIGGERS.map((t) => t.containerId).sort())
            .toEqual(Object.keys(ShareCard.SOURCES).sort());
    });

    test('谈薪页被服务引导排除，分享图是它唯一的转化出口 —— 必须存在', () => {
        // lead-touchpoints 把谈薪排除在引导白名单外（受众是求职者，不该推企业服务），
        // 因此这条断言守的是「谈薪页仍然有出口」这个产品决策，不只是代码
        expect(readSrc('src/js/lead/lead-touchpoints.js')).toMatch(/reverse/);
        expect(ShareCard.TRIGGERS.some((t) => t.containerId === 'reverse-step-result')).toBe(true);
    });
});

describe('阶段13D 分享图 - 与 index.html 的契约', () => {
    test('所有取数 selector 在页面中真实存在（id 改名会让分享图静默变空）', () => {
        const missing = [];
        Object.keys(ShareCard.SOURCES).forEach((key) => {
            const cfg = ShareCard.SOURCES[key];
            [cfg.hero.selector].concat(cfg.rows.map((r) => r.selector)).forEach((sel) => {
                if (INDEX_HTML.indexOf('id="' + sel.replace('#', '') + '"') === -1) missing.push(sel);
            });
        });
        expect(missing).toEqual([]);
    });

    test('所有触发按钮与结果容器 id 在页面中真实存在', () => {
        const missing = [];
        ShareCard.TRIGGERS.forEach((t) => {
            if (INDEX_HTML.indexOf('id="' + t.buttonId + '"') === -1) missing.push(t.buttonId);
            if (INDEX_HTML.indexOf('id="' + t.containerId + '"') === -1) missing.push(t.containerId);
        });
        expect(missing).toEqual([]);
    });

    test('页面引入了分享图脚本与二维码库', () => {
        expect(INDEX_HTML).toContain('src/js/share/share-card.js');
        expect(INDEX_HTML).toContain('qrcode');
    });
});

describe('阶段13D 分享图 - 合规与内容', () => {
    test('每张分享图都带免责声明（方案 §8 硬要求）', () => {
        ['income', 'negotiation'].forEach((template) => {
            expect(ShareCard.buildHtml({ template, title: '综合所得年度汇算' }, SAMPLE_DATA, ''))
                .toContain(ShareCard.DISCLAIMER);
        });
    });

    test('文案不含「避税 / 节税 / 税筹」等违规表述', () => {
        const texts = [JSON.stringify(ShareCard.TEMPLATE_TEXT)];
        ['income', 'negotiation'].forEach((template) => {
            texts.push(ShareCard.buildHtml({ template, title: '综合所得年度汇算' }, SAMPLE_DATA, ''));
        });
        texts.forEach((t) => expect(t).not.toMatch(/避税|节税|税筹/));
    });

    test('Hero 数字与明细如实进入图片', () => {
        const html = ShareCard.buildHtml({ template: 'income', title: '综合所得年度汇算' }, SAMPLE_DATA, '');
        expect(html).toContain('¥253,080');
        expect(html).toContain('税后年收入');
        expect(html).toContain('税前年收入');
        expect(html).toContain('¥360,000');
    });

    test('分享图宽度符合移动端长图规格', () => {
        expect(ShareCard.buildHtml({ template: 'income', title: 'X' }, SAMPLE_DATA, ''))
            .toContain('width:' + ShareCard.SHARE_IMAGE_WIDTH + 'px');
    });

    test('二维码缺失时降级为文字入口，而不是留白或报错', () => {
        expect(ShareCard.buildHtml({ template: 'income', title: 'X' }, SAMPLE_DATA, '')).toContain('扫码访问');
        expect(ShareCard.buildHtml({ template: 'income', title: 'X' }, SAMPLE_DATA, 'data:image/gif;base64,AAA'))
            .toContain('data:image/gif;base64,AAA');
    });

    test('用户可见文本被 HTML 转义（防止截图内容被注入结构）', () => {
        const html = ShareCard.buildHtml(
            { template: 'income', title: 'X' },
            { heroLabel: 'L', heroValue: '<img src=x onerror=alert(1)>', rows: [] },
            ''
        );
        expect(html).not.toContain('<img src=x');
        expect(html).toContain('&lt;img');
    });

    test('未测算（占位符 ¥0）时拒绝生成 —— 一张写着 ¥0 的图比不出图更伤品牌', () => {
        document.body.innerHTML = '<div id="t-hero">¥0</div>';
        const cfg = { template: 'income', title: 'X', hero: { selector: '#t-hero', label: 'L' }, rows: [] };
        expect(ShareCard.collect(cfg)).toBeNull();
    });

    test('已测算时 collect 汇总 hero 并过滤占位符明细', () => {
        document.body.innerHTML =
            '<div id="t-hero">¥253,080</div>' +
            '<div id="t-row">¥360,000</div>' +
            '<div id="t-empty">—</div>';
        const out = ShareCard.collect({
            template: 'income',
            title: 'X',
            hero: { selector: '#t-hero', label: '税后年收入' },
            rows: [{ label: '税前', selector: '#t-row' }, { label: '占位', selector: '#t-empty' }]
        });
        expect(out.heroValue).toBe('¥253,080');
        expect(out.rows).toHaveLength(1);
        expect(out.rows[0].label).toBe('税前');
    });
});

describe('阶段13D 分享图 - 闭环（归因 + 埋点）', () => {
    test('二维码指向的落地地址带 source=share（T4 归因）', () => {
        expect(ShareCard.shareUrl()).toContain('source=share');
    });

    test('派发 euriskotax:share，且漏斗端确实在监听（任一端改名即断链）', () => {
        // 断言「真的派发」而不是「文件里出现过这个词」——注释里也会出现，那样测不出断链
        expect(readSrc('src/js/share/share-card.js'))
            .toContain("dispatchEvent(new CustomEvent('euriskotax:share'");
        expect(readSrc('src/js/stats/funnel-tracking.js')).toContain("addEventListener('euriskotax:share'");
    });

    test('埋点发生在「真的拿到图」之后（生成失败不该被记成一次分享）', () => {
        const src = readSrc('src/js/share/share-card.js');
        const previewIdx = src.indexOf('showPreview(canvas');
        const fireIdx = src.indexOf("dispatchEvent(new CustomEvent('euriskotax:share'");
        expect(previewIdx).toBeGreaterThan(-1);
        expect(fireIdx).toBeGreaterThan(previewIdx);
    });

    test('share 在漏斗白名单内（否则埋点被后端 400 丢掉）', () => {
        expect(readSrc('src/js/api/api-client.js')).toMatch(/FUNNEL_STEPS\s*=\s*\[[^\]]*'share'/);
    });

    test('留资归因：lead-modal 读取落地来源，且优先级低于调用方显式指定', () => {
        const src = readSrc('src/js/lead/lead-modal.js');
        expect(src).toContain('captureLandingSource');
        expect(src).toContain('opts.source || landingSource() ||');
    });
});

describe('阶段13D 截图公共层 - PDF 与分享图共用', () => {
    test('PDF 导出改用 Capture.captureHtml，不再各自维护 html2canvas 配置', () => {
        const src = readSrc('src/js/ui/navigation-ui.js');
        expect(src).toContain('window.Capture');
        expect(src).toContain('captureHtml(');
        // 配置漂移的根源就是多处各写一份 html2canvas 调用
        expect(src).not.toMatch(/html2canvas\(/);
    });

    test('分享图走同一公共层，而不是自己写一套截图', () => {
        const src = readSrc('src/js/share/share-card.js');
        expect(src).toContain('Capture.captureHtml');
        expect(src).not.toMatch(/html2canvas\(/);
    });

    test('capture.js 在成功与失败两条路径上都清理临时容器（漏清理会撑出横向滚动条）', () => {
        const src = readSrc('src/js/export/capture.js');
        expect(src).toContain('cleanup()');
        expect(src).toContain('removeChild');
        expect(src).toContain('html2canvas(');
    });
});
