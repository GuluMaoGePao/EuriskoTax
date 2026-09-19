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
        // 17B-2（v1.48.0）：反向倒算的旧结果页删了，谈薪那一路改走 dw-result-card:reverse
        expect(ShareCard.SOURCES['dw-result-card:reverse'].template).toBe('negotiation');
        // 17B-3（v1.49.0）：综合所得的旧结果页 step-result 随页面删了，改从向导的结果卡取数；
        // 17B-4（v1.50.0）：分类所得同样 —— 它原先那份 'classification-step-result' 随页面删了，
        // 改按 `:toolId` 划出 dw-result-card:classification 这一路。
        // 四个迁移工具（business / reverse / forward / classification）共用 dw-result-card，
        // 全靠 `:toolId` 后缀分家 —— 少划一路就会退到兜底那份 business 的配置上，把某一路的
        // 分享图截成「应纳个人所得税」这种张冠李戴的标题。
        ['dw-result-card:forward', 'dw-result-card:classification', 'dw-result-card'].forEach((id) => {
            expect(ShareCard.SOURCES[id].template).toBe('income');
        });
    });

    test('触发器覆盖全部结果容器（新增结果页漏配 = 那个页面没有分享出口）', () => {
        // `容器:工具Id` 是**同一容器按工具再分的一路**（两个 spec 工具共用 dw-result-card），
        // 它不是一个独立的触发目标 —— 触发按钮还是那一个 dw-next。
        const own = Object.keys(ShareCard.SOURCES).filter((k) => k.indexOf(':') === -1);
        expect(ShareCard.TRIGGERS.map((t) => t.containerId).sort()).toEqual(own.sort());
    });

    test('谈薪结果被服务引导排除，分享图是它唯一的转化出口 —— 必须存在', () => {
        // lead-touchpoints 把谈薪排除在引导白名单外（受众是求职者，不该推企业服务），
        // 因此这条断言守的是「谈薪仍然有出口」这个产品决策，不只是代码
        expect(readSrc('src/js/lead/lead-touchpoints.js')).toMatch(/reverse/);
        expect(ShareCard.TRIGGERS.some((t) => t.containerId === 'dw-result-card')).toBe(true);
        expect(ShareCard.SOURCES['dw-result-card:reverse'].template).toBe('negotiation');
    });

    test('同一个向导结果卡能按当前工具分流（谈薪不能截成经营所得卡）', () => {
        // 17B-2：dw-result-card 是通用节点，两个工具轮着用 —— 认不出工具就会糊成一张错卡
        document.body.innerHTML = '<div id="dw-result-card" data-tool-id="reverse"></div>';
        expect(ShareCard.generate.length).toBeGreaterThan(0);   // 入口在
        expect(typeof ShareCard.sourceKey).toBe('function');
        expect(ShareCard.sourceKey('dw-result-card')).toBe('dw-result-card:reverse');

        document.getElementById('dw-result-card').setAttribute('data-tool-id', 'business');
        expect(ShareCard.sourceKey('dw-result-card')).toBe('dw-result-card');

        // 别的工具（没有配过分享图的那几路）退回默认那一份，而不是认不出
        document.getElementById('dw-result-card').setAttribute('data-tool-id', 'vat-deep');
        expect(ShareCard.sourceKey('dw-result-card')).toBe('dw-result-card');
        // 页面式容器的 id 不被这条分流逻辑改口
        expect(ShareCard.sourceKey('step-result')).toBe('step-result');
    });
});

describe('阶段13D 分享图 - 与 index.html 的契约', () => {
    test('所有取数 selector 在页面中真实存在（id 改名会让分享图静默变空）', () => {
        const missing = [];
        Object.keys(ShareCard.SOURCES).forEach((key) => {
            // 17B-1：spec 驱动的向导结果是**运行时渲染**的，静态 HTML 里查不到，
            // 它们的存在改由 tests/business-income-core.test.js 的向导端到端用例守护。
            if (key.indexOf('dw-') === 0) return;
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
            // 同上：dw-* 是向导的运行时节点，不在静态 HTML 里
            const gone = (id) => id && id.indexOf('dw-') !== 0 && INDEX_HTML.indexOf('id="' + id + '"') === -1;
            if (gone(t.buttonId)) missing.push(t.buttonId);
            if (gone(t.containerId)) missing.push(t.containerId);
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

    test('未测算（占位符 ¥0 / ¥0.00）时拒绝生成 —— 一张写着 0 的图比不出图更伤品牌', () => {
        document.body.innerHTML = '<div id="t-hero">¥0</div>';
        const cfg = { template: 'income', title: 'X', hero: { selector: '#t-hero', label: 'L' }, rows: [] };
        expect(ShareCard.collect(cfg)).toBeNull();

        document.body.innerHTML = '<div id="t-hero2">¥0.00</div>';
        const cfg2 = { template: 'income', title: 'X', hero: { selector: '#t-hero2', label: 'L' }, rows: [] };
        expect(ShareCard.collect(cfg2)).toBeNull();
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

describe('阶段13D 分享图 - 失败反馈可见性（静默失败最难排查）', () => {
    test('不再使用 alert 对话框（会被浏览器静默屏蔽成「点了没反应」）', () => {
        const src = readSrc('src/js/share/share-card.js');
        expect(src).toContain('showToast');
        expect(src).not.toMatch(/\balert\s*\(/);
    });

    test('未识别的结果容器不再静默 return，而是给出可见提示', () => {
        const src = readSrc('src/js/share/share-card.js');
        expect(src).not.toMatch(/if \(!cfg\) return;/);
        expect(src).toContain('未识别的结果容器');
    });

    test('showToast 渲染页面内提示条（不依赖浏览器对话框）', () => {
        document.body.innerHTML = '';
        ShareCard.showToast('测试提示');
        const toast = document.getElementById('share-card-toast');
        expect(toast).toBeTruthy();
        expect(toast.textContent).toBe('测试提示');
        expect(toast.style.position).toBe('fixed');
    });

    test('提示条固定在顶部 —— 放底部会落在结果区视线之外，用户整条错过', () => {
        const src = readSrc('src/js/share/share-card.js');
        expect(src).toMatch(/top:calc\(/);
        expect(src).not.toMatch(/bottom:\s*32px/);
        // 顶部还有导航栏与离线/更新横幅，提示条必须顺延而不是压在它们身上
        expect(src).toContain('toastTopOffset');
        // 层级要高于预览遮罩(10000)与页面顶部横幅(9999)
        expect(src).toContain('z-index:10002');
    });
});

describe('阶段13D 分享图 - 闭环（归因 + 埋点）', () => {
    test('二维码指向的落地地址带 source=share（T4 归因）', () => {
        expect(ShareCard.shareUrl()).toContain('source=share');
    });

    test('分享落地地址可通过 setShareBaseUrl 覆盖，避免 localhost 泄露到线上图', () => {
        ShareCard.setShareBaseUrl('https://euriskotax.example.com');
        expect(ShareCard.shareUrl()).toBe('https://euriskotax.example.com/?source=share');
        ShareCard.setShareBaseUrl(''); // 恢复默认值，避免污染后续测试
    });

    test('二维码下方显示的 host 与落地地址域名一致', () => {
        ShareCard.setShareBaseUrl('https://euriskotax.example.com');
        const html = ShareCard.buildHtml({ template: 'income', title: '综合所得年度汇算' }, SAMPLE_DATA, '');
        expect(html).toContain('euriskotax.example.com');
        expect(html).not.toContain('localhost');
        ShareCard.setShareBaseUrl('');
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

describe('阶段13D+ 分享落地引导', () => {
    test('index.html 引入 share-landing.js', () => {
        expect(INDEX_HTML).toContain('src/js/share/share-landing.js');
    });

    test('仅 ?source=share 落地时展示横幅', () => {
        const src = readSrc('src/js/share/share-landing.js');
        expect(src).toContain('source=share');
        expect(src).toContain('isShareLanding');
    });

    test('CTA 锚点在页面中真实存在（锚点被改名 = 按钮点了没反应）', () => {
        // 锚点随信息架构调整而变（原「开始计算」卡片已移入工具页，首页第一屏是「我是谁」场景入口）
        expect(INDEX_HTML).toContain('id="home-scenarios"');
        expect(readSrc('src/js/share/share-landing.js')).toContain('home-scenarios');
    });

    test('落地引导不承担归因与埋点（职责单一，可整体下线而不影响闭环）', () => {
        const src = readSrc('src/js/share/share-landing.js');
        // 注释里会提到 sessionStorage 属于别的模块，这里断言的是「没有真的去读写」
        expect(src).not.toMatch(/sessionStorage\s*\./);
        expect(src).not.toContain('reportFunnelEvent');
    });
});
