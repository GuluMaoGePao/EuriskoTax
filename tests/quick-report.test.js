/**
 * 阶段16：速算器结果导出 PDF（src/js/export/quick-report.js）
 *
 * 这个文件钉住的是「速算器也能带走一份结果」这件事的**内容正确性**：
 *   ① 文件名规则（带工具名与日期，不至于下载一堆同名 report.pdf）；
 *   ② 输入回显要说人话（select 回显选项文字，不是内部值 general / separate）；
 *   ③ 文档里有结果拆解、易错口径、政策时效与免责声明（能单独拿出去给人看）；
 *   ④ 条件字段隐藏时报告里也不该出现（小规模没有进项，报告里就别问进项）；
 *   ⑤ 转义：工具名/口径是数据，不能当 HTML 执行；
 *   ⑥ 导出入口：走既有 exportToPDF 的 contentBuilder 通道，并跳过深度流程的结果守卫。
 * 排版与落盘由 Capture + exportToPDF 负责（已在别处覆盖），这里只测「编出来的文档对不对」。
 */
const { loadSource } = require('./helpers/load-source.js');

loadSource('src/js/export/quick-report.js');

// v1.110.0：上面的独立用例走的是**兜底分支**（没加载 toolbox-ui）。覆盖面用例要在真实链路上跑，
// 否则「 bolster 掉哪一份实现」是测不出来的 —— 这与 v1.109.0 docOpts 丢字段是同一类教训：
// 只看下层函数对不对，抓不到「中间层没接上」。
describe('覆盖面：20 个速算器 × 页面与 PDF 同源（真实链路）', () => {
    beforeAll(() => {
        // 与 toolbox-ui.test.js 同一份依赖链：20 个速算器的 compute 住在 *-quick.js 里，
        // 不加载它们，默认入参永远算不出结果（覆盖面会退化成「20 个跳过的空跑」）。
        loadSource('src/js/calculation/tax-constants.js');
        loadSource('src/js/calculation/tax-calculator.js');
        loadSource('src/js/calculation/tax-registry.js');
        ['social-insurance-quick.js', 'salary-tax-quick.js', 'bonus-tax-quick.js', 'net-salary-quick.js',
            'special-deduction-quick.js', 'annual-settlement-quick.js', 'withholding-quick.js',
            'equity-incentive-quick.js', 'severance-quick.js', 'early-retirement-quick.js',
            'expat-allowance-quick.js', 'private-pension-quick.js', 'health-insurance-quick.js',
            'annuity-quick.js', 'employer-cost-quick.js', 'disability-fund-quick.js',
            'surtax-stamp-quick.js', 'business-income-quick.js', 'vat-quick.js',
            'corporate-income-tax-quick.js'].forEach((f) => loadSource('src/js/calculation/' + f));
        loadSource('src/js/data/tool-registry.js');
        loadSource('src/js/ui/toolbox-ui.js');   // 格式化与易错口径渲染的真源
    });

    const defaultsOf = (tool) => {
        const v = {};
        (tool.fields || []).forEach((f) => {
            if (f.default !== undefined) { v[f.key] = f.default; return; }
            v[f.key] = f.type === 'money' ? 10000 : f.type === 'number' ? 1
                : f.type === 'percent' ? 0.03
                    : f.type === 'select' && f.options ? f.options[0].value
                        : f.type === 'switch' ? false : '';
        });
        return v;
    };

    test('渲染与格式化都取自页面真源（这条不先成立，覆盖面就白跑了）', () => {
        expect(typeof window.EuriskoToolbox.pitfallHtml).toBe('function');
        expect(typeof window.EuriskoToolbox.strongify).toBe('function');
        expect(QR().fmtValue(1234.567, 'money')).toBe(window.EuriskoToolbox.fmtValue(1234.567, 'money'));
    });

    test('每个速算器的 PDF：易错口径带加粗但不留裸星号，金额与页面同口径', () => {
        const problems = [];
        window.EuriskoToolRegistry.all().forEach((tool) => {
            const vals = defaultsOf(tool);
            let out = null;
            try { out = tool.compute(vals); } catch (e) {
                problems.push(tool.id + '：compute 抛错 ' + e.message.slice(0, 50));
                return;
            }
            if (!out || !out.primary) { problems.push(tool.id + '：默认入参算不出结果'); return; }

            let html = '';
            try { html = QR().buildDocHtml(tool, vals, out); } catch (e) {
                problems.push(tool.id + '：拼文档抛错 ' + e.message.slice(0, 50));
                return;
            }

            // ① 加粗标记总闸：整份文档不许出现裸 ** —— 不论它来自 pitfalls 还是 out.note。
            // 修复前两种都漏（pitfalls 一处、note 一处），所以这条按「全文」断言，不指定来源：
            // 将来再冒出第三种带加粗的字段，这里会先红，而不是等用户在 PDF 里看见星号。
            const hasStar = (tool.pitfalls || []).some((p) => String(p).indexOf('**') >= 0)
                || String(out.note || '').indexOf('**') >= 0;
            if (hasStar && html.indexOf('**') >= 0) {
                const at = html.indexOf('**');
                problems.push(tool.id + '：报告里残留裸 ** 加粗标记 @[' + html.slice(Math.max(0, at - 60), at + 40) + ']');
            }
            if (hasStar && html.indexOf('<strong>') < 0) problems.push(tool.id + '：加粗没渲染成 strong');

            // ② 金额口径：页面「¥1,234.56」导出成 PDF 变成「¥1,235」，而这份 PDF 是交给别人的。
            (out.rows || []).filter((r) => r.kind === 'money').forEach((r) => {
                const page = window.EuriskoToolbox.fmtValue(r.value, 'money');
                if (html.indexOf(page) < 0) {
                    problems.push(tool.id + '：明细「' + (r.label || '') + '」报告口径 ' +
                        QR().fmtValue(r.value, 'money') + ' ≠ 页面 ' + page);
                }
            });
        });
        expect(problems).toEqual([]);
    });
});

const QR = () => window.EuriskoQuickReport;

const TOOL = {
    id: 'bonus-tax',
    name: '年终奖个税',
    subtitle: '单独计税还是并入综合所得更省',
    policyKey: 'bonus',
    fields: [
        { key: 'bonus', label: '年终奖金额', type: 'money', default: 36000 },
        {
            key: 'variant', label: '计税方式', type: 'select', default: 'separate',
            options: [{ value: 'separate', label: '单独计税' }, { value: 'merge', label: '并入综合所得' }]
        },
        { key: 'withSocial', label: '含社保', type: 'switch', default: true },
        { key: 'rate', label: '附加税率（%）', type: 'percent', default: 13 },
        // 条件字段：只有「并入综合所得」时才问
        { key: 'annualTaxable', label: '并入前综合所得', type: 'money', default: 100000, when: { key: 'variant', in: ['merge'] } }
    ],
    pitfalls: ['临界点附近多发 1 元，可能多缴上千元'],
    nextTools: ['salary-tax']
};

const OUT = {
    primary: { label: '应缴个税', value: 3390, kind: 'money' },
    rows: [{ label: '应纳税所得额', value: 36000, kind: 'money' }],
    note: '单独计税：不并入当年综合所得'
};

const VALUES = { bonus: 36000, variant: 'separate', withSocial: true, rate: 13 };

describe('政策依据（与结果页同源）', () => {
    const saved = window.EuriskoTaxRegistry;
    afterEach(() => {
        if (saved) window.EuriskoTaxRegistry = saved;
        else delete window.EuriskoTaxRegistry;
    });

    test('报告带登记的政策文号，且不给任何链接（打印件点不了链接）', () => {
        window.EuriskoTaxRegistry = {
            basisOf: () => [{ doc: '财税〔2018〕164 号', title: '个人所得税法修改后有关优惠政策衔接问题' }]
        };
        const html = QR().pure.buildDocHtml(TOOL, VALUES, OUT);
        expect(html).toContain('政策依据');
        expect(html).toContain('财税〔2018〕164 号');
        expect(html).not.toMatch(/<a\s/);
    });

    test('registry 未加载时不拖累导出：只是没有这一节', () => {
        delete window.EuriskoTaxRegistry;
        const html = QR().pure.buildDocHtml(TOOL, VALUES, OUT);
        expect(html).toContain('¥3,390');
        expect(html).not.toContain('政策依据');
    });
});

describe('文件名', () => {
    test('带工具名与日期，不会因为多次导出互相覆盖', () => {
        expect(QR().pure.filename(TOOL, new Date(2026, 8, 15)))
            .toBe('年终奖个税_测算结果_2026-09-15.pdf');
    });

    test('工具名含非法文件名字符时会被清掉（Windows 下直接报错）', () => {
        const weird = { name: '增值税/小规模:纳税人?' };
        expect(QR().pure.filename(weird, new Date(2026, 0, 2)))
            .toBe('增值税小规模纳税人_测算结果_2026-01-02.pdf');
    });
});

describe('值回显', () => {
    // v1.110.0：这条原先把「¥3,390」（取整）钉成预期 —— 那是被修掉的缺陷本身留下的化石：
    // 页面是两位小数，报告抹成整数，用户页面上看到的金额与导出 PDF 对不上，而 PDF 是要交出去的。
    // 现在 money 与页面同源（两位小数），断言跟着改成页面口径。标题写的「同一套口径」才名副其实。
    test('money / percent / 原样 与结果区同一套口径', () => {
        expect(QR().pure.fmtValue(3390, 'money')).toBe('¥3,390.00');
        expect(QR().pure.fmtValue(3390.5, 'money')).toBe('¥3,390.50');   // 小数不能丢
        expect(QR().pure.fmtValue(0.13, 'percent')).toBe('13.00%');
        expect(QR().pure.fmtValue('单独计税')).toBe('单独计税');
    });

    test('select 回显选项文字而不是内部值（用户看 separate 不知道选了什么）', () => {
        const f = TOOL.fields[1];
        expect(QR().pure.fmtInput(f, 'separate')).toBe('单独计税');
        expect(QR().pure.fmtInput(f, 'merge')).toBe('并入综合所得');
    });

    test('switch 回显是/否，money 回显带币种', () => {
        expect(QR().pure.fmtInput(TOOL.fields[2], true)).toBe('是');
        expect(QR().pure.fmtInput(TOOL.fields[2], false)).toBe('否');
        expect(QR().pure.fmtInput(TOOL.fields[0], 36000)).toBe('¥36,000.00');   // 与页面同口径
    });
});

describe('文档编排', () => {
    test('含工具名 / 主结果 / 结果拆解 / 输入 / 易错口径 / 免责声明', () => {
        const html = QR().pure.buildDocHtml(TOOL, VALUES, OUT, new Date(2026, 8, 15));
        expect(html).toContain('年终奖个税');
        expect(html).toContain('应缴个税');
        expect(html).toContain('¥3,390');
        expect(html).toContain('应纳税所得额');
        expect(html).toContain('年终奖金额');
        expect(html).toContain('临界点附近多发 1 元');
        expect(html).toContain('以主管税务机关认定为准');
        expect(html).toContain('2026-09-15');
    });

    test('条件字段未生效时不出现在报告里（小规模没有进项就别问进项）', () => {
        const separate = QR().pure.buildDocHtml(TOOL, VALUES, OUT);
        expect(separate).not.toContain('并入前综合所得');

        const merge = QR().pure.buildDocHtml(TOOL, Object.assign({}, VALUES, { variant: 'merge' }), OUT);
        expect(merge).toContain('并入前综合所得');
    });

    test('数据是数据：工具名与易错口径里的尖括号被转义', () => {
        const evil = Object.assign({}, TOOL, {
            name: '<script>alert(1)</script>',
            pitfalls: ['<img src=x onerror=alert(1)>']
        });
        const html = QR().pure.buildDocHtml(evil, VALUES, OUT);
        expect(html).not.toContain('<script>');
        expect(html).not.toContain('<img');
        expect(html).toContain('&lt;script&gt;');
        expect(html).toContain('&lt;img');
    });

    test('没有结果时返回空文档（不生成一份空白 PDF）', () => {
        expect(QR().pure.buildDocHtml(TOOL, VALUES, null)).toBe('');
    });
});

describe('政策时效', () => {
    afterEach(() => { delete window.EuriskoTaxRegistry; });

    test('问 tax-registry，不自己算日期', () => {
        window.EuriskoTaxRegistry = {
            statusOf: () => ({ expiresOn: '2027-12-31', daysLeft: 300 })
        };
        expect(QR().policyLine(TOOL)).toBe('政策有效期至 2027-12-31');
    });

    test('过期要明说（结果仅供参考）', () => {
        window.EuriskoTaxRegistry = { statusOf: () => ({ expired: true }) };
        expect(QR().policyLine(TOOL)).toContain('已过有效期');
    });

    test('拿不到就整行不写（宁缺毋滥，不编一个日期）', () => {
        window.EuriskoTaxRegistry = { statusOf: () => null };
        expect(QR().policyLine(TOOL)).toBe('');
        expect(QR().policyLine({})).toBe('');
    });
});

describe('导出入口', () => {
    let alerts;
    beforeEach(() => {
        alerts = [];
        global.showAlert = (m) => alerts.push(m);
        global.exportToPDF = jest.fn();
        window.Capture = { captureHtml: jest.fn() };
    });
    afterEach(() => {
        delete global.showAlert;
        delete global.exportToPDF;
        delete window.Capture;
    });

    test('走既有 exportToPDF 的 contentBuilder 通道，并跳过深度流程的结果守卫', () => {
        expect(QR().exportQuickResult(TOOL, VALUES, OUT)).toBe(true);
        expect(global.exportToPDF).toHaveBeenCalledTimes(1);
        const args = global.exportToPDF.mock.calls[0];
        expect(args[1]).toBe('年终奖个税');
        expect(args[2].skipResultCheck).toBe(true);
        expect(args[2].filename).toMatch(/年终奖个税_测算结果_\d{4}-\d{2}-\d{2}\.pdf$/);
        // 文档内容是「现编现用」的：调用时才把当前 tool/values/out 编进去
        expect(typeof args[2].contentBuilder).toBe('function');
        expect(args[2].contentBuilder()).toContain('¥3,390');
    });

    test('没算出结果就点导出：明确拦下，不生成空白 PDF', () => {
        expect(QR().exportQuickResult(TOOL, VALUES, null)).toBe(false);
        expect(global.exportToPDF).not.toHaveBeenCalled();
        expect(alerts).toHaveLength(1);
    });

    test('导出组件未就绪时给出提示而不是静默失败', () => {
        delete window.Capture;
        expect(QR().exportQuickResult(TOOL, VALUES, OUT)).toBe(false);
        expect(alerts).toHaveLength(1);
    });
});
