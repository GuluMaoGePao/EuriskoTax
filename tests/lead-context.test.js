// 阶段13B+ 咨询情境数据层测试
//   1) 合规红线（本文件最关键的断言）：情境摘要**只含非金额信息**，金额只用于本地判断
//      「是否真的算完了」，绝不进入上报字段；
//   2) 不编造：结果页未渲染、历史记录类型未知时返回空，而不是硬塞一个「当前测算」；
//   3) 跨文件契约：index.html 的情境卡节点、弹窗与触点的调用方式必须与本模块一致
//      —— 这类 id / 属性改名不会报错，只会静默失效，必须由测试守住。

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const readSrc = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const INDEX_HTML = readSrc('index.html');

// lead-context.js 是 IIFE（挂 window.LeadContext）；jest 环境为 jsdom，直接 eval 即可
(0, eval)(readSrc('src/js/lead/lead-context.js'));

const LeadContext = global.LeadContext || window.LeadContext;

describe('阶段13B+ 咨询情境 - 汇算结论方向词', () => {
    test('只提取方向词、丢掉金额', () => {
        expect(LeadContext.conclusionWord('应退 ¥3,120.00')).toBe('预计退税');
        expect(LeadContext.conclusionWord('应补 ¥1,234.56')).toBe('预计补税');
        expect(LeadContext.conclusionWord('不退不补 ¥0.00')).toBe('无需补退');
    });

    test('无法识别的文本不猜结论（宁可留空）', () => {
        ['', null, undefined, '¥1,000.00', '待计算'].forEach((raw) => {
            expect(LeadContext.conclusionWord(raw)).toBe('');
        });
    });
});

describe('阶段13B+ 咨询情境 - 历史记录摘要（纯函数）', () => {
    test('类型 + 汇算结论 + 适用税率，且不含任何金额', () => {
        const scene = LeadContext.summarize({
            id: '1',
            type: 'forward',
            results: { taxDetails: { refundTax: -3120, applicableRate: 0.2, netIncome: 253080 } }
        });
        expect(scene).toBe('综合所得年度汇算 · 预计退税 · 适用税率 20%');
        expect(scene).not.toContain('¥');
        expect(scene).not.toContain('3120');
        expect(scene).not.toContain('253080');
    });

    test('缺少 taxDetails 时降级为「只有类型」，而不是报错或编造结论', () => {
        expect(LeadContext.summarize({ id: '2', type: 'business' })).toBe('经营所得年度汇算');
        expect(LeadContext.summarize({ id: '3', type: 'classification', results: {} })).toBe('分类所得计税');
    });

    test('refundTax 为 0 判为「无需补退」', () => {
        expect(LeadContext.summarize({ id: '4', type: 'forward', results: { taxDetails: { refundTax: 0 } } }))
            .toBe('综合所得年度汇算 · 无需补退');
    });

    test('未知类型 / 非法输入返回空（不产生无意义的情境）', () => {
        [null, undefined, {}, 'x', { id: '9', type: 'reverse-unknown' }].forEach((record) => {
            expect(LeadContext.summarize(record)).toBe('');
        });
    });
});

describe('阶段13B+ 咨询情境 - 结果页真实摘要（读已渲染 DOM）', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    // 17B-3（v1.49.0）：综合所得迁到 spec 驱动的向导后，情境不再是三个静态 id，而是
    // 向导结果卡上的 dw-result-primary + data-dw-row 行（**运行时渲染**）。下面照 business
    // 那一套拼：卡片必须带 data-tool-id，否则 readWizardText 会拒答（见「换工具不归因」那条）。
    function renderForwardCard(primaryText, rows) {
        const rowHtml = rows.map((r) => '<div data-dw-row="' + r.label + '">' +
            '<span>' + r.label + '</span><span>' + r.value + '</span></div>').join('');
        document.body.innerHTML =
            '<div id="dw-result-card" data-tool-id="forward">' +
            '<div id="dw-result-primary">' + primaryText + '</div>' + rowHtml + '</div>';
    }

    test('结果页尚未渲染（仍是占位符）时返回空 —— 不编造情境', () => {
        renderForwardCard('¥0', [{ label: '适用税率', value: '0%' }]);
        expect(LeadContext.current('forward')).toBe('');
    });

    test('已渲染时给出「类型 + 结论 + 税率」，且金额一律不进入返回值', () => {
        renderForwardCard('¥253,080.00', [
            { label: '应退税额', value: '¥3,120.00' },
            { label: '适用税率', value: '20%' }
        ]);

        const scene = LeadContext.current('forward');
        expect(scene).toBe('综合所得年度汇算 · 预计退税 · 适用税率 20%');
        expect(scene).not.toContain('¥');
        expect(scene).not.toContain('253,080');
        expect(scene).not.toContain('3,120');
    });

    test('经营所得走 spec 驱动的向导结果节点（按 data-tool-id 认人）', () => {
        // 17B-1：经营所得的旧结果容器随页面整页删除，节点改在向导里渲染 ——
        // 但向导是**通用渲染器**，dw-result-card 会被所有 spec 工具轮着用，必须认 data-tool-id。
        document.body.innerHTML =
            '<div id="dw-result-card" data-tool-id="business">' +
            '<div id="dw-result-primary">¥180,000.00</div>' +
            '<div data-dw-row="应补税额">¥6,800.00</div>' +
            '<div data-dw-row="适用税率">35%</div>' +
            '</div>';

        expect(LeadContext.current('business')).toBe('经营所得年度汇算 · 预计补税 · 适用税率 35%');

        // 换一个工具用同一个容器：不能把增值税算完当成经营所得的情境报给顾问
        document.getElementById('dw-result-card').setAttribute('data-tool-id', 'vat-deep');
        expect(LeadContext.current('business')).toBe('');
    });

    test('未知类型返回空（谈薪等不投服务引导的类型不会被凑出情境）', () => {
        document.body.innerHTML = '<div id="result-net-income">¥1</div>';
        expect(LeadContext.current('reverse')).toBe('');
        expect(LeadContext.current('')).toBe('');
        expect(LeadContext.current(undefined)).toBe('');
    });
});

describe('阶段13B+ 咨询情境 - 本地历史下拉', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    test('跳过无法识别的记录，并按上限截断', () => {
        const records = [
            // 内容依赖本地时区，故用不带 Z 的本地时间字面量，避免跨时区跑测试时日期飘一天
            { id: '1', type: 'forward', date: '2026-09-13T10:00:00', results: { taxDetails: { refundTax: -3120, applicableRate: 0.2 } } },
            { id: '2', type: 'unknown-type', date: '2026-09-13T10:00:00', results: {} },
            { id: '3', type: 'business', date: '2026-09-13T10:00:00', results: { taxDetails: { refundTax: 500 } } }
        ];
        localStorage.setItem('taxCalculationHistory', JSON.stringify(records));

        const options = LeadContext.historyOptions();
        expect(options).toHaveLength(2);
        expect(options[0].scene).toBe('综合所得年度汇算 · 预计退税 · 适用税率 20%');
        expect(options[0].label).toContain('2026-09-13');
        expect(options[1].scene).toBe('经营所得年度汇算 · 预计补税');
    });

    test('谈薪记录不作为留资情境（与结果页分流白名单同口径）', () => {
        localStorage.setItem('taxCalculationHistory', JSON.stringify([
            { id: '1', type: 'reverse', date: '2026-09-13T10:00:00', results: { taxDetails: { refundTax: -1 } } },
            { id: '2', type: 'forward', date: '2026-09-13T10:00:00', results: { taxDetails: { refundTax: 0 } } }
        ]));

        const options = LeadContext.historyOptions();
        expect(options).toHaveLength(1);
        expect(options[0].scene).toBe('综合所得年度汇算 · 无需补退');
    });

    test('localStorage 内容损坏时静默返回空数组（不能让弹窗打不开）', () => {
        localStorage.setItem('taxCalculationHistory', '{ 坏掉的 JSON');
        expect(LeadContext.historyOptions()).toEqual([]);
    });
});

describe('阶段13B+ 咨询情境 - 跨文件契约', () => {
    test('index.html 提供情境卡的展示位与选择器节点', () => {
        ['lead-modal-scene', 'lead-modal-scene-text', 'lead-modal-scene-hint', 'lead-modal-scene-picker', 'lead-scene-select']
            .forEach((id) => expect(INDEX_HTML).toContain('id="' + id + '"'));
    });

    test('情境提取依赖的结果节点：四个页面式 deep 都已迁走，全改成向导运行时节点', () => {
        // 17B-4（v1.50.0）：分类所得（最后一个页面式 deep）也走了 spec 驱动的向导 ——
        // 它那颗静态结果节点 classification-result-net-income 随页面删掉了，改走 wizard:primary 锚点
        // （端到端守护在 tests/classification-migration.test.js）。
        // 于是静态 HTML 里**一个**旧结果节点都不该剩下：结果节点现在是运行时渲染的
        // （dw-result-card + data-tool-id），由各个 migration 测试的向导端到端用例守护，
        // 含「换工具后不再归因」这条（认不出当前工具，情境就会串味）。
        ['classification-result-net-income', 'result-net-income', 'result-refund-tax', 'result-tax-rate']
            .forEach((id) => expect(INDEX_HTML).not.toContain('id="' + id + '"'));
    });

    test('本模块必须在 lead-modal.js 之前加载（弹窗打开时同步取用）', () => {
        const ctxIdx = INDEX_HTML.indexOf('src/js/lead/lead-context.js');
        const modalIdx = INDEX_HTML.indexOf('src/js/lead/lead-modal.js');
        expect(ctxIdx).toBeGreaterThan(-1);
        expect(modalIdx).toBeGreaterThan(ctxIdx);
    });

    test('弹窗不再把入口标签伪装成「当前测算」', () => {
        const src = readSrc('src/js/lead/lead-modal.js');
        expect(src).toContain('LeadContext');
        expect(src).toContain('参考您的测算：');
        // 断言代码里不再拼接该前缀（注释中提及历史实现不算）
        expect(src).not.toContain("'当前测算：'");
    });

    test('结果页触点只传计算类型，不再传死场景标签', () => {
        const src = readSrc('src/js/lead/lead-touchpoints.js');
        expect(src).toContain('data-type');
        expect(src).not.toContain('data-scene');
    });

    test('个人中心入口不再伪造「个人中心·财税服务」这一假测算', () => {
        expect(readSrc('src/js/auth/auth-ui.js')).not.toContain('个人中心·财税服务');
    });

    test('留资弹窗保留合规红线：不采集收入金额 / 不构成税务建议 / 需用户明确勾选同意', () => {
        expect(INDEX_HTML).toMatch(/不采集.*收入金额/);
        expect(INDEX_HTML).toMatch(/不构成.*税务建议/);
        expect(INDEX_HTML).toContain('id="lead-consent"');
        expect(INDEX_HTML).toMatch(/我已阅读并同意/);
    });

    test('弹窗底部操作区排版：同意与说明分行，主按钮通栏', () => {
        // 末屏原先是「一行密集小字 + 右侧小按钮」，改为一句话同意 + 一行灰字说明 + 通栏按钮
        expect(INDEX_HTML).toMatch(/id="lead-submit-btn" class="[^"]*w-full/);
        expect(INDEX_HTML).toContain('id="lead-form-error"');
    });

    test('弹窗不铺流程图、不挂问答模块 —— 只让用户填信息，提交后等联系', () => {
        // 曾有过「三步服务流程条」(#lead-steps) 与「顾虑答疑」折叠块 (#lead-faq)：
        // 按要求整体下线 —— 用户不需要先读懂流程，填完信息由后台顾问联系反馈即可。
        // 这里反向守护：任何一块被顺手加回来都会让这条用例变红。
        expect(INDEX_HTML).not.toContain('id="lead-steps"');
        expect(INDEX_HTML).not.toContain('id="lead-faq"');
        expect(readSrc('src/js/lead/lead-modal.js')).not.toContain("el('lead-faq')");
    });

    test('「提交后会有人联系」只留一句话，成功态只确认「收到了」', () => {
        expect(INDEX_HTML).toContain('提交后客服会与您联系');
        const start = INDEX_HTML.indexOf('id="lead-success"');
        const end = INDEX_HTML.indexOf('id="lead-modal-footer"', start);
        expect(start).toBeGreaterThan(-1);
        expect(end).toBeGreaterThan(start);
        const block = INDEX_HTML.slice(start, end);
        expect(block).toContain('已收到您的信息');
        // 提交完再读一段步骤清单，反而像「还没提交成功」—— 成功态不再复述流程
        expect(block).not.toContain('<li');
    });

    test('弹窗里不出现无法核实的数字背书', () => {
        const start = INDEX_HTML.indexOf('id="lead-modal"');
        const end = INDEX_HTML.indexOf('id="lead-success"', start);
        expect(start).toBeGreaterThan(-1);
        expect(end).toBeGreaterThan(start);
        const block = INDEX_HTML.slice(start, end);
        // 「已服务 N 家客户」「服务 X 万人」这类数字无从核实，写进弹窗就是自找追问
        expect(block).not.toMatch(/已服务\s*[\d一二三四五六七八九十]/);
        expect(block).not.toMatch(/\d+\s*万?\+?\s*(家|位)?\s*(客户|企业|用户)/);
    });

    test('顾问背书只配置了真实信息才显示（默认隐藏，不编造资质）', () => {
        const src = readSrc('src/js/lead/lead-modal.js');
        expect(src).toContain('renderAdvisor');
        expect(src).toContain("el('lead-advisor')");
        // DEFAULTS 里不放具体人名 —— 没有真实顾问就整行不显示
        expect(src).toMatch(/advisorName:\s*''/);
        expect(INDEX_HTML).toMatch(/id="lead-advisor" class="hidden/);
    });

    test('弹窗视图切换只保留「表单 / 成功」两态', () => {
        const src = readSrc('src/js/lead/lead-modal.js');
        expect(src).toContain("el('lead-success')");
        expect(src).toContain("el('lead-modal-footer')");
        expect(src).not.toContain("el('lead-faq')");
    });

    test('留资文案不再出现无法兑现的次数承诺或夸大说法', () => {
        const sources = [
            INDEX_HTML,
            readSrc('src/js/lead/lead-modal.js'),
            readSrc('src/js/lead/lead-touchpoints.js')
        ];
        sources.forEach((src) => {
            expect(src).not.toContain('免费核对一次');
            expect(src).not.toContain('首次免费');
            expect(src).not.toContain('把漏填项找出来');
        });
        // 触点承诺的是一次免费协助（协助核对参数），不是「替你完成申报」
        expect(readSrc('src/js/lead/lead-touchpoints.js')).toContain('免费协助');
    });

    // v1.37.8 ICP 备案内容合规：下面这些是**涉税专业服务**话术 —— 与页脚「仅供参考，不构成税务建议」
    // 自相矛盾，且可能超出备案时填报的服务内容。谁把它们改回来，这条会红。
    test('留资与触点文案不含涉税专业服务话术（备案后红线）', () => {
        const touchpoints = readSrc('src/js/lead/lead-touchpoints.js');
        [
            '财税顾问 · 一对一',
            '确认没问题再申报',
            '>记账报税<',
            '>申报核对<',
            '>其他财税咨询<',
            '提交后由后台顾问'
        ].forEach((phrase) => {
            expect(INDEX_HTML).not.toContain(phrase);
        });
        ['免费咨询', '申报前先核对', '避免多缴或漏扣'].forEach((phrase) => {
            expect(touchpoints).not.toContain(phrase);
        });
    });

    test('留资同意行带《隐私政策》入口（收集个人信息却无政策入口 = PIPL 告知-同意缺失）', () => {
        const start = INDEX_HTML.indexOf('id="lead-modal-footer"');
        const end = INDEX_HTML.indexOf('id="lead-submit-btn"', start);
        expect(start).toBeGreaterThan(-1);
        expect(end).toBeGreaterThan(start);
        const block = INDEX_HTML.slice(start, end);
        expect(block).toContain('隐私政策');
        expect(block).toContain('openPolicyModal');
    });
});
