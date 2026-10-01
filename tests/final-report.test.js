// 阶段10B：专业版「汇算清缴报告」纯逻辑单测（文件名/税负结构/政策挑选/HTML 编排冒烟）
const { loadSource } = require('./helpers/load-source.js');

loadSource('src/js/auth/plan.js');
loadSource('src/js/data/tax-assistant.js'); // 提供真实内置快照（挑政策素材）
loadSource('src/js/export/final-report.js');

const report = () => window.EuriskoReport;

const POLICY_QA = [
    { id: 'policy-tax1', category: '政策法规', tag: 'policy-point', question: '个人养老金能抵扣吗？', answer: '每年 12000 元限额扣除。' },
    { id: 'policy-cmp1', category: '汇算清缴', tag: 'policy-point', question: '汇算清缴时间？', answer: '次年 3 月 1 日 - 6 月 30 日。' },
    { id: 'policy-biz1', category: '经营所得', tag: 'policy-point', question: '减半征收延续？', answer: '200 万以内减半。' },
    { id: 'normal-comprehensive', category: '综合所得', question: '普通计税问答', answer: '不应进入政策要点。' },
    { id: 'normal-business', category: '经营所得', question: '普通经营问答', answer: '不应进入政策要点。' }
];

let origQA;
beforeEach(() => {
    try { localStorage.clear(); } catch (e) { /* ignore */ }
    origQA = window.TAX_ASSISTANT_QA;
    window.TAX_ASSISTANT_QA = POLICY_QA.slice();
    delete window.calculationResults;
    delete window.businessCalculationResults;
    delete window.apiClient;
});

afterEach(() => {
    window.TAX_ASSISTANT_QA = origQA;
    delete window.calculationResults;
    delete window.businessCalculationResults;
    delete window.apiClient;
});

describe('proFilename 文件名规则', () => {
    test('汇算清缴报告_YYYY-MM.pdf', () => {
        const name = report().pure.proFilename(new Date(2026, 8, 9)); // 9 月
        expect(name).toBe('汇算清缴报告_2026-09.pdf');
    });

    test('单数月补零', () => {
        expect(report().pure.proFilename(new Date(2026, 0, 5))).toBe('汇算清缴报告_2026-01.pdf');
    });
});

describe('escapeHtml / num / money 基础', () => {
    test('escapeHtml 转义尖括号与引号', () => {
        expect(report().pure.escapeHtml('<b>"x" & \'y\'</b>')).toBe('&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/b&gt;');
        expect(report().pure.escapeHtml(null)).toBe('');
    });

    test('num 容错 NaN/null → 0', () => {
        expect(report().pure.num('abc')).toBe(0);
        expect(report().pure.num(null)).toBe(0);
        expect(report().pure.num(12.5)).toBe(12.5);
    });

    test('money 千分位 + ¥', () => {
        expect(report().pure.money(1234567.89)).toBe('¥1,234,568');
    });
});

describe('taxStructure 税负结构（柱状图数据源）', () => {
    test('综合所得：收入/扣除/所得额/预缴/应纳税额/净收入', () => {
        window.calculationResults = {
            incomeDetails: { total: 300000 },
            deductionDetails: { total: 90000 },
            taxDetails: { taxableIncome: 210000, prepaidTax: 12000, totalTax: 31080, netIncome: 268920 }
        };
        const s = report().pure.taxStructure('comprehensive');
        expect(s.labels).toHaveLength(6);
        expect(s.values).toEqual([300000, 90000, 210000, 12000, 31080, 268920]);
        expect(s.kind).toBe('comprehensive');
        expect(s.note).toContain('退税');
    });

    // 17B-1（v1.47.0）：经营所得那份「专业版报告」随旧页面一并删除 —— 它在向导里走
    // 自己的导出路径（deep-wizard-ui exportResult → exportToPDF/Word），不再有 business 这个 kind。
    test('只有综合所得一种税负结构（经营所得的 kind 已随旧页删除）', () => {
        const s = report().pure.taxStructure('business');
        expect(s.kind).toBe('comprehensive');   // 未知 kind 一律回落，不抛错
    });

    test('无结果数据时安全返回 0 序列', () => {
        const s = report().pure.taxStructure('comprehensive');
        expect(s.values.every((v) => v === 0)).toBe(true);
    });
});

describe('pickPolicyItems 政策要点挑选', () => {
    test('综合所得报告：收 policy-point 的政策法规/汇算清缴条目，排除普通计税问答', () => {
        const items = report().pure.pickPolicyItems('comprehensive', 6);
        const ids = items.map((it) => it.id);
        expect(ids).toContain('policy-tax1');
        expect(ids).toContain('policy-cmp1');
        expect(ids).not.toContain('normal-comprehensive');
        expect(ids).not.toContain('policy-biz1');
    });

    test('经营所得这条 kind 已下线：政策要点按综合所得的口径挑（不抛错、不漏版）', () => {
        const items = report().pure.pickPolicyItems('business', 6);
        const ids = items.map((it) => it.id);
        expect(ids).toContain('policy-tax1');
    });

    test('limit 生效；无 QA 时返回空', () => {
        expect(report().pure.pickPolicyItems('comprehensive', 1)).toHaveLength(1);
        window.TAX_ASSISTANT_QA = [];
        expect(report().pure.pickPolicyItems('comprehensive', 6)).toEqual([]);
    });
});

// 阶段20 P5（v1.107.0）：这份报告从「只有综合所得能用」改成注入式之后，新增的守护。
// 背景：阶段17 删旧页面时这条链路断开，此后 exportFinalReport 零调用 —— Pro 用户交了钱、
// 拿到的仍是自拼 HTML 的标准版，权益表承诺的封面 / 图表 / 政策要点一份都没给过。
describe('注入式数据源（阶段20 P5）', () => {
    test('coreHtml 优先：传了就不再调已删除旧页面的 generateWordDocumentContent', () => {
        global.generateWordDocumentContent = () => '<p>旧页面明细-不应出现</p>';
        const html = report().buildProDocHtml('bonus-tax-deep', { coreHtml: '<p>向导明细</p>' });
        expect(html).toContain('向导明细');
        expect(html).not.toContain('旧页面明细-不应出现');
        delete global.generateWordDocumentContent;
    });

    test('structure 注入生效（用向导结果，不读 window.calculationResults）', () => {
        delete window.calculationResults;
        const html = report().buildProDocHtml('bonus-tax-deep', {
            coreHtml: '<p>x</p>',
            structure: { labels: ['年终奖', '税额'], values: [50000, 4790], note: '注入的注脚' }
        });
        expect(html).toContain('id="pro-tax-chart"');
        expect(html).toContain('注入的注脚');
    });

    // 与资产概览「取不到就显示 —」同一条原则：六根全 0 的柱子会被读成
    // 「这些科目一分钱都没有」，而真相只是**我们拿不到数**。
    test('结构数据全 0 时不画柱状图（不摆一张全 0 的假图）', () => {
        const html = report().buildProDocHtml('bonus-tax-deep', {
            coreHtml: '<p>x</p>',
            structure: { labels: ['a', 'b'], values: [0, 0], note: 'n' }
        });
        expect(html).not.toContain('id="pro-tax-chart"');
        expect(html).not.toContain('税负结构对比');
        // 但报告本身还是完整的：政策要点与免责不受影响
        expect(html).toContain('免责声明');
    });

    test('meta 注入：封面标题按税种来，不再共用综合所得汇算', () => {
        const html = report().buildProDocHtml('bonus-tax-deep', {
            coreHtml: '<p>x</p>',
            structure: null,
            reportTitle: () => '年终奖交付版报告',
            kindLabel: '年终奖'
        });
        expect(html).toContain('年终奖交付版报告');
        expect(html).toContain('年终奖');
        expect(html).not.toContain('综合所得汇算清缴报告');
    });

    // v1.109.0：政策要点按税种注入。此前 pickPolicyItems 收了 kind 却没用 —— 21 个税种共用
    // 问答库里「综合所得/汇算清缴」的条目，增值税的精装报告里写着「子女教育专项附加扣除」
    // （真机截图实锤，用户是会拿去给客户的）。
    test('policies 注入：报告的政策要点用税种自己的 pitfalls，**加粗** 渲染成 strong', () => {
        const html = report().buildProDocHtml('vat-deep', {
            coreHtml: '<p>x</p>',
            structure: null,
            policies: ['**普票不是扣税凭证**：增值税普通发票、收据一律不得抵扣']
        });
        expect(html).toContain('普票不是扣税凭证');
        expect(html).toContain('<strong>');          // Markdown 加粗转 strong，不出裸星号
        expect(html).not.toContain('**');
        expect(html).not.toContain('个人养老金能抵扣吗？');  // 问答库的个税条目不再混入
    });

    test('policies 不传时回落问答库：旧调用（legacy 综合所得）行为不变', () => {
        const html = report().buildProDocHtml('comprehensive', { coreHtml: '<p>x</p>' });
        expect(html).toContain('个人养老金能抵扣吗？');   // POLICY_QA 里的条目仍在
    });
});

describe('exportFinalReport 分流（专业版 / 非专业版）', () => {
    let captured = null;

    beforeEach(() => {
        captured = null;
        global.exportToPDF = function (elId, title, opts) {
            captured = { elId: elId, title: title, opts: opts };
        };
    });

    afterEach(() => {
        delete global.exportToPDF;
        const dlg = document.getElementById('report-version-dialog');
        if (dlg) dlg.remove();
    });

    test('专业版：走精装（注入的明细 + 图表 + 按税种的文件名）', () => {
        localStorage.setItem('current_user', JSON.stringify({ email: 'pro@example.com', plan: 'pro', plan_expires_at: null }));
        expect(report().isProUser()).toBe(true);

        report().exportFinalReport({
            kind: 'bonus-tax-deep',
            coreHtml: '<p>向导明细</p>',
            structure: { labels: ['年终奖', '税额'], values: [50000, 4790], note: 'n' },
            meta: { resultElId: 'dw-result-card', reportTitle: () => '年终奖交付版报告', kindLabel: '年终奖' },
            filename: '年终奖交付版报告_2026-09.pdf'
        });

        expect(captured).not.toBeNull();
        expect(captured.elId).toBe('dw-result-card');
        expect(captured.title).toBe('年终奖交付版报告');
        expect(captured.opts.filename).toBe('年终奖交付版报告_2026-09.pdf');
        expect(captured.opts.contentBuilder()).toContain('向导明细');
    });

    // v1.109.0：policies 也要透传。这条用 exportFinalReport 全链路（向导同款调用形态）——
    // 只测 buildProDocHtml 的话，docOpts 逐字段抄写丢字段这类病是抓不到的（meta / policies 各丢过一次）。
    test('专业版全链路：policies 透传到报告，政策要点不回落问答库', () => {
        localStorage.setItem('current_user', JSON.stringify({ email: 'pro@example.com', plan: 'pro', plan_expires_at: null }));
        report().exportFinalReport({
            kind: 'vat-deep',
            coreHtml: '<p>增值税明细</p>',
            structure: null,
            policies: ['**普票不是扣税凭证**：收据白条一律不得抵扣'],
            meta: { resultElId: 'dw-result-card', reportTitle: () => '增值税交付版报告', kindLabel: '增值税' }
        });
        const html = captured.opts.contentBuilder();
        expect(html).toContain('普票不是扣税凭证');
        expect(html).toContain('<strong>');
        expect(html).not.toContain('年度汇算清缴怎么办理？');  // 问答库条目不再混入
    });

    test('非专业版：不直接导出，先给版本选择；点「标准版」回到调用方自己的导出', () => {
        localStorage.clear();
        expect(report().isProUser()).toBe(false);
        const onStandard = jest.fn();

        report().exportFinalReport({ kind: 'bonus-tax-deep', onStandard: onStandard });
        expect(captured).toBeNull();   // 未付费不能被直接推走导出

        const btn = document.querySelector('#report-version-dialog [data-rv="standard"]');
        expect(btn).not.toBeNull();
        btn.click();
        expect(onStandard).toHaveBeenCalledTimes(1);
    });

    // 「点了精装版，结果默默导出标准版」= 用遁词解释没反应。留资行只在真的挂得上钩子时出现。
    test('护栏外的税种不显示「留资，由顾问协助」那行承诺', () => {
        const dlgVisible = () => document.querySelector('#report-version-dialog [data-rv-hook]');

        report().exportFinalReport({ kind: 'comprehensive' });
        expect(report().hookAllowed('comprehensive')).toBe(true);
        expect(dlgVisible().style.display).not.toBe('none');

        document.getElementById('report-version-dialog').remove();
        report().exportFinalReport({ kind: 'reverse' });
        expect(report().hookAllowed('reverse')).toBe(false);
        expect(dlgVisible().style.display).toBe('none');
    });
});

describe('合规（付费语义不进站内 UI）', () => {
    test('版本弹窗不含 购买 / 支付 / 价格 / 订阅 / ¥', () => {
        const src = require('fs').readFileSync('src/js/export/final-report.js', 'utf8');
        const dialog = src.slice(src.indexOf('var DIALOG_ID'), src.indexOf('function closeDialog'));
        expect(dialog).not.toMatch(/购买|支付|价格|订阅|¥/);
    });

    test('谈薪（reverse）永远挂不上留资钩子', () => {
        expect(report().REPORT_BLOCKED_TYPES).toContain('reverse');
        expect(report().hookAllowed('reverse')).toBe(false);
    });
});

// 接线守护： valued 权益最容易死在「没人调用」上 —— 阶段17 那次就是这么断的，
// 且断了两年没人发现（单测全绿，因为单测测的是模块内部、不是链路）。
describe('接线守护（静态源码）', () => {
    const readSrc = (p) => require('fs').readFileSync(p, 'utf8');

    test('deep-wizard 的 PDF 导出必须走 EuriskoReport.exportFinalReport', () => {
        const src = readSrc('src/js/ui/deep-wizard-ui.js');
        expect(src).toMatch(/window\.EuriskoReport/);      // 取到那个模块
        expect(src).toMatch(/rep\.exportFinalReport\(/);   // 并且真的调用了它
        expect(src).toMatch(/kind === 'pdf'/);             // 挂的是 PDF 那颗按钮，不是 Word
    });

    test('final-report 必须在 index.html 里加载（否则整条链路是空引用）', () => {
        expect(readSrc('index.html')).toContain('src/js/export/final-report.js');
    });
});

describe('buildProDocHtml 编排冒烟（封面/明细/图表/政策/免责）', () => {
    test('包含封面品牌、税负对比图节点、政策章节与免责声明，且复用明细核心', () => {
        const fakeCore = () => '<p>明细核心-mock</p>';
        global.generateWordDocumentContent = fakeCore;
        window.apiClient = { getCurrentUser: () => ({ email: 'pro@example.com', plan: 'pro' }) };
        // 阶段20 P5：这条断言原依赖「无论数据是否存在都画图」的旧行为。现在全 0 一律不画，
        // 于是把前提坐实 —— 断言的意图本就是「**有数据时**报告里有对比图」，同上 DMS 那条「无数据不画」。
        window.calculationResults = {
            incomeDetails: { total: 300000 },
            deductionDetails: { total: 90000 },
            taxDetails: { taxableIncome: 210000, prepaidTax: 12000, totalTax: 31080, netIncome: 268920 }
        };
        const html = report().buildProDocHtml('comprehensive');
        expect(html).toContain('pro-cover');
        expect(html).toContain('EuriskoTax 个税管家');
        expect(html).toContain('年度综合所得汇算清缴报告');
        expect(html).toContain('明细核心-mock');
        expect(html).toContain('id="pro-tax-chart"');
        expect(html).toContain('政策要点与注意事项');
        expect(html).toContain('个人养老金能抵扣吗？'); // 政策素材问题进入报告
        expect(html).not.toContain('普通计税问答');   // 普通计税问答不应混入政策要点
        expect(html).toContain('免责声明');
        expect(html).toContain('pro@example.com');
        delete global.generateWordDocumentContent;
    });
});
