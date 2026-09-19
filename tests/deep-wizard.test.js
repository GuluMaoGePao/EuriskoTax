/**
 * 通用多步测算向导（阶段17 17A-4）测试
 *
 * 这个文件钉的是「多步向导作为一类新页型」能否成立 —— 它决定了阶段17 后面 5 类税种
 * 是「写一份 spec」还是继续「写一页 HTML」：
 *   ① 接管范围：只接管 spec 驱动的完整测算，不误伤速算器与原有 4 个页面式 deep；
 *   ② spec 形状：结果步自动追加、字段按 step 归组；
 *   ③ 条件字段（when）跟随前一步的选择显隐 —— 分步之后这是最容易坏的一处；
 *   ④ **分步填值不丢**：上一步再回来，已填的值必须还在（fieldHtml 只认 default，
 *      不回填就会静默打回默认值，肉眼极难发现）；
 *   ⑤ 结果与同源速算器一致 —— 不许出现「同一个增值税、两个入口算出两个数」。
 *
 * @jest-environment jsdom
 */
const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/tax-calculator.js');
    // 17B-4（v1.50.0）：helper-functions.js 随分类所得页面删掉了 —— 分类所得是最后一个页面式 deep，
    // 它的私有逻辑全部写在页面上，页面删后这个文件也一并删了（剩下的是一整个空壳）。
    loadSource('src/js/calculation/utils.js');   // renderFormulaStepsHtml：推导链渲染的唯一实现
    loadSource('src/js/calculation/tax-registry.js');
    loadSource('src/js/calculation/vat-quick.js');
    loadSource('src/js/calculation/surtax-stamp-quick.js');
    loadSource('src/js/calculation/corporate-income-tax-quick.js');
    loadSource('src/js/calculation/social-insurance-quick.js');
    loadSource('src/js/calculation/disability-fund-quick.js');
    loadSource('src/js/data/tool-registry.js');
    loadSource('src/js/ui/toolbox-ui.js');
    loadSource('src/js/ui/deep-wizard-ui.js');
});

const W = () => window.EuriskoDeepWizard;
const R = () => window.EuriskoToolRegistry;
const TB = () => window.EuriskoToolbox;

beforeEach(() => {
    localStorage.clear();
    window.showPage = jest.fn();
    document.body.innerHTML = '<div id="deep-wizard-page" class="page hidden"></div>';
});

describe('多步向导：接管范围', () => {
    test('只接管 spec 驱动的完整测算，不误伤速算器与原有页面式 deep', () => {
        expect(W().has(R().get('vat-deep'))).toBe(true);    // 无 pageId，由 spec 渲染
        expect(W().has(R().get('vat'))).toBe(false);        // 速算器
        // 17B-3：forward 已是 spec 驱动，它必须**接得住**，
        // 否则用户点的就是一张点不开的卡片 —— 这一条原先是在钉「有独立页面，走原路」，现在反过来钉。
        expect(W().has(R().get('forward'))).toBe(true);
        // 17B-4（v1.50.0）：分类所得迁完 —— 它之前被钉成 false（「页面式，等 repeater 能力」），
        // 现在且必须反过来：spec 有了 repeater，这一条**必须接得住**，否则它就是一张点不开的卡片。
        expect(W().has(R().get('classification'))).toBe(true);
    });
});

describe('多步向导：spec 形状', () => {
    test('结果步由渲染器自动追加，不在每个 spec 里重复声明', () => {
        const steps = W().stepsOf(R().get('vat-deep'));
        expect(steps).toHaveLength(3);                       // 纳税人身份 + 本期数据 + 结果
        expect(steps[steps.length - 1].title).toBe('计算结果');
        expect(steps[steps.length - 1].result).toBe(true);
    });

    test('字段按 step 归组，身份步只问身份', () => {
        const t = R().get('vat-deep');
        expect(W().fieldsOfStep(t, 'identity').map((f) => f.key)).toEqual(['variant']);
        expect(W().fieldsOfStep(t, 'data').length).toBe(8);
    });
});

describe('多步向导：渲染与走查', () => {
    test('打开向导：步骤条与第一步渲染出来，并切到向导页', () => {
        expect(W().open('vat-deep', { fresh: true })).toBe(true);
        const host = document.getElementById('deep-wizard-page');
        expect(host.querySelectorAll('.step-number')).toHaveLength(3);
        expect(host.querySelector('.step-title.active').textContent).toBe('纳税人身份');
        expect(host.querySelector('#qf-variant')).toBeTruthy();
        expect(window.showPage).toHaveBeenCalledWith('deep-wizard-page');
    });

    test('条件字段跟随计税场景切换（小规模 → 一般纳税人）', () => {
        W().open('vat-deep', { fresh: true });
        document.getElementById('qf-variant').value = 'general';
        document.getElementById('qf-variant').dispatchEvent(new Event('change'));
        document.getElementById('dw-next').click();
        expect(document.getElementById('qf-inputTax')).toBeTruthy();   // 一般纳税人：进项税额
        expect(document.getElementById('qf-sales')).toBeFalsy();       // 小规模：本期销售额
    });

    test('分步填值不丢：上一步再回来，已填的值仍在', () => {
        W().open('vat-deep', { fresh: true });
        document.getElementById('qf-variant').value = 'general';
        document.getElementById('qf-variant').dispatchEvent(new Event('change'));
        document.getElementById('dw-next').click();
        document.getElementById('qf-output').value = '200000';
        document.getElementById('dw-prev').click();     // 回第 1 步
        document.getElementById('dw-next').click();     // 再进第 2 步
        expect(document.getElementById('qf-output').value).toBe('200000');
    });

    test('结果步算出的税与同源速算器一致（不许两套口径）', () => {
        W().open('vat-deep', { fresh: true });
        document.getElementById('qf-variant').value = 'general';
        document.getElementById('qf-variant').dispatchEvent(new Event('change'));
        document.getElementById('dw-next').click();
        document.getElementById('qf-output').value = '200000';
        document.getElementById('dw-next').click();     // 进结果步
        const shown = document.getElementById('deep-wizard-page').textContent;
        const direct = R().get('vat').compute({
            variant: 'general', output: 200000, inputTax: 8000, rate: 0.13, taxIncluded: true
        });
        expect(shown).toContain(TB().fmtValue(direct.primary.value, direct.primary.kind));
    });

    test('断点续算：中途退出再进来，停在同一步且值还在', () => {
        W().open('vat-deep', { fresh: true });
        document.getElementById('qf-variant').value = 'general';
        document.getElementById('qf-variant').dispatchEvent(new Event('change'));
        document.getElementById('dw-next').click();
        document.getElementById('qf-output').value = '200000';
        document.getElementById('dw-next').click();     // 走到结果步并落草稿
        // 重新打开（非 fresh）应回到结果步
        W().open('vat-deep');
        const host = document.getElementById('deep-wizard-page');
        expect(host.querySelector('.step-title.active').textContent).toBe('计算结果');
    });
});

// 第二个税种走同一套渲染器 —— 这是「渲染器通用」还是「只适配 vat」的分水岭。
// 附加税印花税的字段结构与 vat 完全不同（另一个 variant 选择器、17 个税目、计税依据是别的税种），
// 它若能跑通，说明新增一个完整测算确实只剩「写一条 spec」这件事。
describe('多步向导：第二个税种（附加税与印花税）', () => {
    test('切到印花税后，附加税字段消失、税目与凭证金额出现', () => {
        W().open('surtax-stamp-deep', { fresh: true });
        expect(document.querySelector('.step-title.active').textContent).toBe('税种选择');
        document.getElementById('qf-variant').value = 'stamp';
        document.getElementById('qf-variant').dispatchEvent(new Event('change'));
        document.getElementById('dw-next').click();
        expect(document.getElementById('qf-item')).toBeTruthy();        // 印花税：税目
        expect(document.getElementById('qf-amount')).toBeTruthy();      // 印花税：凭证金额
        expect(document.getElementById('qf-vat')).toBeFalsy();          // 附加税：实缴增值税
        expect(document.getElementById('qf-location')).toBeFalsy();     // 附加税：所在地
    });

    test('结果步与同源速算器一致', () => {
        W().open('surtax-stamp-deep', { fresh: true });
        document.getElementById('dw-next').click();         // → 计税依据
        document.getElementById('qf-vat').value = '50000';
        document.getElementById('dw-next').click();         // → 结果
        const shown = document.getElementById('deep-wizard-page').textContent;
        const direct = R().get('surtax-stamp').compute({
            variant: 'surtax', location: 'urban', vat: 50000, consumption: 0, halve: true
        });
        expect(shown).toContain(TB().fmtValue(direct.primary.value, direct.primary.kind));
    });

    test('「依据是什么」写在屏幕上，而不是只给一个空字段名', () => {
        W().open('surtax-stamp-deep', { fresh: true });
        document.getElementById('dw-next').click();
        const text = document.getElementById('deep-wizard-page').textContent;
        expect(text).toContain('实际缴纳的增值税');
        expect(text).toContain('计税依据');       // step.why 渲染出来了
    });
});

// 第三个税种（企业所得税，17C-2）：它的完整测算比速算器多一条「收入成本 → 纳税调整」路径，
// 字段靠 mode 条件切换 —— 这条能跑通，说明「一条 spec 撑起一个比速算器更完整的测算」成立。
describe('多步向导：第三个税种（企业所得税）', () => {
    test('第一步只问身份与规模，利润相关的都留给第二步', () => {
        W().open('corporate-income-tax-deep', { fresh: true });
        expect(document.querySelector('.step-title.active').textContent).toBe('企业身份与规模');
        expect(document.getElementById('qf-staff')).toBeTruthy();
        expect(document.getElementById('qf-taxable')).toBeFalsy();
    });

    test('切到「从收入成本算」后，纳税调整字段出现、直接填的字段消失', () => {
        W().open('corporate-income-tax-deep', { fresh: true });
        document.getElementById('dw-next').click();              // → 利润与纳税调整
        document.getElementById('qf-mode').value = 'adjust';
        document.getElementById('qf-mode').dispatchEvent(new Event('change'));
        expect(document.getElementById('qf-revenue')).toBeTruthy();
        expect(document.getElementById('qf-entertainment')).toBeTruthy();
        expect(document.getElementById('qf-taxable')).toBeFalsy();
    });

    test('结果步与同源速算器一致（走纳税调整路径）', () => {
        W().open('corporate-income-tax-deep', { fresh: true });
        document.getElementById('dw-next').click();
        document.getElementById('qf-mode').value = 'adjust';
        document.getElementById('qf-mode').dispatchEvent(new Event('change'));
        document.getElementById('qf-revenue').value = '5000000';
        document.getElementById('qf-cost').value = '4200000';
        document.getElementById('dw-next').click();              // → 结果
        const shown = document.getElementById('deep-wizard-page').textContent;
        const direct = R().get('corporate-income-tax').compute({
            mode: 'adjust', staff: 80, assetsWan: 3000, highTech: false, restricted: false,
            revenue: 5000000, cost: 4200000, entertainment: 60000,
            advertising: 200000, donation: 100000, previousLoss: 0
        });
        expect(shown).toContain(TB().fmtValue(direct.primary.value, direct.primary.kind));
    });
});

// 第四个税种（社保公积金，17C-3）：字段全在「月」这个量级上，但结果侧要出全年汇总 ——
// 它与前三个税种的结构都不同（没有 variant 选择器、没有条件字段），
// 它能跑通说明渲染器不依赖任何某个税种的特定字段形状。
describe('多步向导：第四个税种（社保公积金）', () => {
    test('第一步只核定基数，比例与扣除留给第二步', () => {
        W().open('social-base-deep', { fresh: true });
        expect(document.querySelector('.step-title.active').textContent).toBe('核定缴费基数');
        expect(document.getElementById('qf-wage')).toBeTruthy();
        expect(document.getElementById('qf-socialAverage')).toBeTruthy();
        expect(document.getElementById('qf-housingRate')).toBeFalsy();
    });

    test('改了工资再回来，基数步填的值仍在（分步填值不丢）', () => {
        W().open('social-base-deep', { fresh: true });
        document.getElementById('qf-wage').value = '20000';
        document.getElementById('dw-next').click();     // → 缴纳比例与扣除
        document.getElementById('dw-prev').click();     // 回第 1 步
        expect(document.getElementById('qf-wage').value).toBe('20000');
    });

    test('结果步与同源速算器一致', () => {
        W().open('social-base-deep', { fresh: true });
        document.getElementById('qf-wage').value = '20000';
        document.getElementById('dw-next').click();
        document.getElementById('dw-next').click();     // → 结果
        const shown = document.getElementById('deep-wizard-page').textContent;
        const direct = R().get('social-base').compute({
            wage: 20000, socialAverage: 8000, housingRate: 12, specialMonthly: 0
        });
        expect(shown).toContain(TB().fmtValue(direct.primary.value, direct.primary.kind));
    });
});

// 17A-2：结果区与存量 4 页**对等** —— 这是 17B 反向迁移能不能动工的验收口径。
// 存量 4 个页面式 deep 都有四件套：查看计算过程（推导链）、免责声明、保存、导出 PDF·Word。
// spec 驱动的向导缺任何一样，迁移过去就是功能降级，所以先在这里补齐并钉住。
describe('多步向导：结果区与存量页面对等（17A-2）', () => {
    function toResult(toolId) {
        W().open(toolId, { fresh: true });
        document.getElementById('dw-next').click();
        document.getElementById('dw-next').click();     // → 结果步
    }

    test('结果区给出推导链与免责声明（与速算器同一套渲染）', () => {
        toResult('vat-deep');
        const panel = document.getElementById('dw-formula-panel');
        expect(panel).toBeTruthy();
        expect(panel.textContent).toContain('价税分离');       // 小规模最容易错的一步
        expect(document.querySelector('.result-disclaimer').textContent).toContain('不构成税务建议');
    });

    test('保存走存量同一处（tax-calculator 的 saveToHistory），不开第二套历史', () => {
        window.saveToHistory = jest.fn();
        toResult('vat-deep');
        document.getElementById('dw-save').click();
        expect(window.saveToHistory).toHaveBeenCalledTimes(1);
        const args = window.saveToHistory.mock.calls[0];
        expect(args[1]).toBe('vat-deep');
        expect(args[0].toolId).toBe('vat-deep');
        expect(args[0].primary).toEqual(expect.objectContaining({ label: '应纳增值税' }));
    });

    test('导出 PDF / Word 不被存量页面的「请先进行计算」拦下', () => {
        window.exportToPDF = jest.fn();
        window.exportToWord = jest.fn();
        toResult('vat-deep');
        document.getElementById('dw-export-pdf').click();
        document.getElementById('dw-export-word').click();

        expect(window.exportToPDF).toHaveBeenCalledTimes(1);
        expect(window.exportToWord).toHaveBeenCalledTimes(1);
        // 两个导出函数默认校验的是存量 4 页的全局 results，spec 向导必须显式跳过
        expect(window.exportToPDF.mock.calls[0][2].skipResultCheck).toBe(true);
        expect(window.exportToWord.mock.calls[0][2].skipResultCheck).toBe(true);
        // 报告内容非空：带着主结果，不是空壳
        expect(window.exportToPDF.mock.calls[0][2].contentBuilder()).toContain('应纳增值税');
        expect(window.exportToWord.mock.calls[0][2].content).toContain('应纳增值税');
    });

    test('还没到结果步就没有保存 / 导出按钮（不许导出半截结果）', () => {
        W().open('vat-deep', { fresh: true });
        expect(document.getElementById('dw-save')).toBeFalsy();
        expect(document.getElementById('dw-export-pdf')).toBeFalsy();
        expect(document.getElementById('dw-export-word')).toBeFalsy();
    });
});

// 最后一个税种类别（残保金与工会经费，17C-5）：它的两步是「人数/工资总额 → 分档减缴」，
// 字段比前面几个都少，但每一步都有 `when` 条件（按 variant 切换 levy / union 两套字段）——
// 它能跑通说明向导对「选择器 + 条件字段」的组合是稳的，这一轮 6 类才算真的齐了。
describe('多步向导：最后一个税种类别（残保金与工会经费）', () => {
    test('第一步只问规模，分档减缴留给第二步', () => {
        W().open('disability-fund-deep', { fresh: true });
        expect(document.querySelector('.step-title.active').textContent).toBe('人数与工资总额');
        expect(document.getElementById('qf-headcount')).toBeTruthy();
        expect(document.getElementById('qf-disabled')).toBeFalsy();
    });

    test('改了人数再回来，规模步填的值仍在（分步填值不丢）', () => {
        W().open('disability-fund-deep', { fresh: true });
        document.getElementById('qf-headcount').value = '80';
        document.getElementById('dw-next').click();     // → 分档减缴与封顶
        document.getElementById('dw-prev').click();     // 回第 1 步
        expect(document.getElementById('qf-headcount').value).toBe('80');
    });

    test('结果步与同源速算器一致', () => {
        W().open('disability-fund-deep', { fresh: true });
        document.getElementById('qf-headcount').value = '80';
        document.getElementById('dw-next').click();
        document.getElementById('dw-next').click();     // → 结果
        const shown = document.getElementById('deep-wizard-page').textContent;
        const direct = R().get('disability-fund').compute({
            variant: 'levy', headcount: 80, disabled: 0,
            socialAverageMonthly: 8000, avgAnnualWage: 120000
        });
        expect(shown).toContain(TB().fmtValue(direct.primary.value, direct.primary.kind));
    });
});

// 多方案对比（compare，17B-2 的通用能力）
//
// 加这个能力是为了让「同一份输入、几套口径」的测算不必再各写一页 —— 反向倒算的
// 保守 / 均衡 / 激进就是最典型的一张脸。这里钉的不是某个税种的数字，而是**契约**：
//   ① 有 compare 就给口径卡 + 横向对比表；② 切换口径后界面与明细同步；
//   ③ 保存 / 导出必须跟着当前口径走（界面看 A、导出 B 是这类工具最伤信用的错）；
//   ④ 没有 compare 的 spec 一切照旧。
//
// 为什么临时换掉 vat-deep 的 compute：DEEP 数组由 registry 私有持有，deep() 返回的是副本，
// 没法塞一条新 spec 进去；借一个已经是 spec 驱动的壳最省事 —— 但用完必须还，
// 否则后面凡是用到 vat-deep 的用例都会读到假结果（而且假得很难查）。
describe('多步向导：多方案对比（compare）', () => {
    const money = v => TB().fmtValue(v, 'currency');
    const toolId = 'vat-deep';

    // 三份口径的主结果与明细都不同，才能逼出「切换后整块结果都要跟着换」
    function fakeCompute() {
        const scenario = (key, label, gross, net) => ({
            key, label, why: label + '口径',
            primary: { label: '目标税前月薪', value: gross, kind: 'currency' },
            rows: [
                { label: '到手月薪', value: net, kind: 'currency' },
                { label: '月均税负', value: gross - net, kind: 'currency' }
            ]
        });
        return {
            primary: { label: '目标税前月薪', value: 20000, kind: 'currency' },
            rows: [{ label: '到手月薪', value: 15000, kind: 'currency' }],
            compare: {
                label: '三种口径对比',
                active: 'balanced',
                scenarios: [
                    scenario('conservative', '保守', 18000, 15000),
                    scenario('balanced', '均衡', 20000, 15000),
                    scenario('aggressive', '激进', 25000, 15000)
                ]
            }
        };
    }

    let original = null;
    function mountCompareTool() {
        const tool = R().get(toolId);
        original = tool.compute;
        tool.compute = fakeCompute;
    }
    function toResult() {
        W().open(toolId, { fresh: true });
        document.getElementById('dw-next').click();
        document.getElementById('dw-next').click();     // → 结果步
    }
    afterEach(() => {
        if (original) { R().get(toolId).compute = original; original = null; }
    });

    test('有 compare 时给出三张口径卡与横向对比表，默认落在 active 那份', () => {
        mountCompareTool();
        toResult();

        expect(document.getElementById('dw-cmp-conservative')).toBeTruthy();
        expect(document.getElementById('dw-cmp-balanced')).toBeTruthy();
        expect(document.getElementById('dw-cmp-aggressive')).toBeTruthy();
        // 默认口径 = compare.active（均衡）
        expect(document.getElementById('dw-result-primary').textContent).toBe(money(20000));
        expect(document.getElementById('dw-cmp-balanced').textContent).toContain('当前口径');

        const table = document.querySelector('#dw-result-card table');
        expect(table).toBeTruthy();
        expect(table.textContent).toContain('保守');
        expect(table.textContent).toContain('激进');
        // 明细跟着当前口径：均衡那份的月均税负 = 20000 - 15000
        expect(document.querySelector('[data-dw-row="月均税负"]').textContent).toContain(money(5000));
    });

    test('点另一份口径，主结果与明细跟着换（不许停留在上一次的口径上）', () => {
        mountCompareTool();
        toResult();
        document.getElementById('dw-cmp-conservative').click();

        expect(document.getElementById('dw-result-primary').textContent).toBe(money(18000));
        expect(document.querySelector('[data-dw-row="月均税负"]').textContent).toContain(money(3000));
        expect(document.getElementById('dw-cmp-conservative').textContent).toContain('当前口径');
        expect(document.getElementById('dw-cmp-balanced').textContent).not.toContain('当前口径');
    });

    test('保存跟着当前口径走：切到激进后存的是激进那份 primary', () => {
        window.saveToHistory = jest.fn();
        mountCompareTool();
        toResult();
        document.getElementById('dw-cmp-aggressive').click();
        document.getElementById('dw-save').click();

        expect(window.saveToHistory).toHaveBeenCalledTimes(1);
        expect(window.saveToHistory.mock.calls[0][0].primary.value).toBe(25000);
        expect(window.saveToHistory.mock.calls[0][1]).toBe(toolId);
    });

    test('导出报告带上对比表：拿去签字的不能只有一个数', () => {
        window.exportToPDF = jest.fn();
        window.exportToWord = jest.fn();
        mountCompareTool();
        toResult();
        document.getElementById('dw-export-pdf').click();
        document.getElementById('dw-export-word').click();

        const pdf = window.exportToPDF.mock.calls[0][2].contentBuilder();
        const word = window.exportToWord.mock.calls[0][2].content;
        [pdf, word].forEach(function (html) {
            expect(html).toContain('三种口径对比');
            expect(html).toContain('保守');
            expect(html).toContain('激进');
            expect(html).toContain(money(18000));   // 保守那份的税前月薪
            expect(html).toContain(money(25000));   // 激进那份的税前月薪
        });
    });

    test('没有 compare 的 spec 一切照旧：结果区不带对比表', () => {
        toResult();     // 未挂载假 compute，真实 spec 本来就没有 compare
        expect(document.querySelector('#dw-result-card table')).toBeFalsy();
        expect(document.querySelector('[id^="dw-cmp-"]')).toBeFalsy();
        expect(document.getElementById('dw-result-primary')).toBeTruthy();
    });
});

// 「完整测算」比速算器多出来的往往不是多一个字段，而是多一张**表**：综合所得要按年摊开
// 12 个月，累计预扣法下每月到手并不是年收入的十二分之一。这块东西不是一个 label 一个值
// 的 rows 装得下的 —— 没有通用容器，迁移到向导就只能把它删掉（＝迁移即降级）。
describe('多步向导：结果附加块（extras）', () => {
    const toolId = 'vat-deep';
    let original = null;

    const MONTHLY = {
        head: ['月份', '月工资', '月税额'],
        rows: [
            ['1月', { value: 20000, kind: 'currency' }, { value: 600, kind: 'currency' }],
            ['2月', { value: 20000, kind: 'currency' }, { value: 1140, kind: 'currency' }]
        ]
    };

    function mountExtrasTool() {
        const tool = R().get(toolId);
        original = tool.compute;
        tool.compute = () => ({
            primary: { label: '目标税前月薪', value: 20000, kind: 'currency' },
            rows: [{ label: '到手月薪', value: 15000, kind: 'currency' }],
            extras: [
                { title: '逐月预算表', table: MONTHLY, note: '累计预扣法下，越往后税率档位越高' },
                { title: '优化建议', list: ['提高公积金缴存比例可压低税基'] }
            ]
        });
    }
    function toResult() {
        W().open(toolId, { fresh: true });
        document.getElementById('dw-next').click();
        document.getElementById('dw-next').click();     // → 结果步
    }
    afterEach(() => {
        if (original) { R().get(toolId).compute = original; original = null; }
    });

    test('extras 的表与列表都渲染出来（表头、金额走统一格式化）', () => {
        mountExtrasTool();
        toResult();

        const card = document.getElementById('dw-result-card');
        expect(card.textContent).toContain('逐月预算表');
        expect(card.textContent).toContain('优化建议');
        expect(card.textContent).toContain('提高公积金缴存比例可压低税基');
        expect(card.textContent).toContain(TB().fmtValue(600, 'currency'));    // 不是裸数字

        const table = card.querySelector('table');
        expect(table).toBeTruthy();
        // 少了表头就等于不知道哪一列是什么 —— 这类表是靠列头认数的
        expect(table.querySelectorAll('thead th').length).toBe(3);
        expect(table.querySelectorAll('tbody tr').length).toBe(2);
        expect(table.querySelector('tbody tr').textContent).toContain('1月');
    });

    test('导出报告带上附加块（同一份数据），拿去签字的东西不能少一张表', () => {
        window.exportToPDF = jest.fn();
        window.exportToWord = jest.fn();
        mountExtrasTool();
        toResult();
        document.getElementById('dw-export-word').click();

        const html = window.exportToWord.mock.calls[0][2].content;
        expect(html).toContain('逐月预算表');
        expect(html).toContain('1月');
        expect(html).toContain(TB().fmtValue(1140, 'currency'));
        expect(html).toContain('优化建议');
    });

    test('没有 extras 的 spec 一切照旧（不留空壳）', () => {
        toResult();     // 真实 spec 没有 extras
        const card = document.getElementById('dw-result-card');
        expect(card.textContent).not.toContain('逐月预算表');
        expect(card.querySelector('table')).toBeFalsy();
        expect(document.getElementById('dw-result-primary')).toBeTruthy();
    });
});
