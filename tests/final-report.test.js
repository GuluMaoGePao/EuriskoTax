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

    test('经营所得：收入/成本/税金损失/利润/所得额/税额', () => {
        window.businessCalculationResults = {
            incomeDetails: { businessIncome: 800000, businessCost: 300000, businessLosses: 20000, businessOtherExpenses: 0, businessProfit: 480000 },
            taxDetails: { taxableIncome: 460000, totalTax: 120000 }
        };
        const s = report().pure.taxStructure('business');
        expect(s.labels).toContain('收入总额');
        expect(s.values[0]).toBe(800000);
        expect(s.values[1]).toBe(300000);
        expect(s.values[2]).toBe(20000); // 损失+其他
        expect(s.values[3]).toBe(480000);
        expect(s.kind).toBe('business');
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

    test('经营所得报告：纳入经营所得相关政策条目', () => {
        const items = report().pure.pickPolicyItems('business', 6);
        const ids = items.map((it) => it.id);
        expect(ids).toContain('policy-biz1');
        expect(ids).not.toContain('normal-business');
    });

    test('limit 生效；无 QA 时返回空', () => {
        expect(report().pure.pickPolicyItems('comprehensive', 1)).toHaveLength(1);
        window.TAX_ASSISTANT_QA = [];
        expect(report().pure.pickPolicyItems('comprehensive', 6)).toEqual([]);
    });
});

describe('buildProDocHtml 编排冒烟（封面/明细/图表/政策/免责）', () => {
    test('包含封面品牌、税负对比图节点、政策章节与免责声明，且复用明细核心', () => {
        const fakeCore = () => '<p>明细核心-mock</p>';
        global.generateWordDocumentContent = fakeCore;
        window.apiClient = { getCurrentUser: () => ({ email: 'pro@example.com', plan: 'pro' }) };
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
