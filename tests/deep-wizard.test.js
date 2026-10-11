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
const fs = require('fs');
const path = require('path');
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
    // 阶段19-4 顺延（v1.99.0）：结果步「各项数额」条（与速算器共用这一份）
    loadSource('src/js/ui/result-bars.js');
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

// 通用样例取**与速算器共享 spec** 的那一个 —— 但 17C 五条做完后（v1.58.0 ~ v1.62.0）
// vat-deep / corporate-income-tax-deep / social-base-deep / disability-fund-deep /
// surtax-stamp-deep 已全部改成自带 spec，**共享的已经归零**。这里仍用附加税印花税当样例：
// 它是这轮最后一个做深的，步数（3 步）与条件字段（按 variant 切换整组）都最典型，
// 而且它**有孪生速算器**，「结果步与速算器同口径」这条断言才有意义。
describe('多步向导：spec 形状', () => {
    test('结果步由渲染器自动追加，不在每个 spec 里重复声明', () => {
        const steps = W().stepsOf(R().get('surtax-stamp-deep'));
        expect(steps).toHaveLength(4);                       // 算哪一项 + 计税依据 + 减半与到期 + 结果
        expect(steps[steps.length - 1].title).toBe('计算结果');
        expect(steps[steps.length - 1].result).toBe(true);
    });

    test('字段按 step 归组，减半那一步只问减半', () => {
        const t = R().get('surtax-stamp-deep');
        expect(W().fieldsOfStep(t, 'identity').map((f) => f.key))
            .toEqual(['variant', 'location', 'signedWhere']);
        expect(W().fieldsOfStep(t, 'policy').map((f) => f.key)).toEqual(['halve']);
    });

    // v1.142.0：步骤表曾被「简明」视图改写（advanced 步被合并成一步「补充参数（可选）」），
    // 于是同一份测算有两套步骤条，用户认不出自己刚才填到哪一屏。视图取消之后还是出了第二版：
    // 渲染器把 advanced 步一律甩到末尾 —— 「参数有默认值可后填」被当成了唯一标准，
    // 结果综合所得一进门先被问「你一年挣多少」，而「工作几个月」被挪到最后才问。
    // **位置本身也是语义**：开场第一问不能因为它有默认值就往后放。
    // 现在唯一的规矩是：屏幕上的顺序 = spec 声明的顺序。
    test('步骤表 = spec 声明的那一张（不再改写，也不再重排）', () => {
        const t = R().get('forward');
        const keys = W().stepsOf(t).map((s) => (s.result ? '__result' : s.key));
        expect(keys).toEqual((t.steps || []).map((s) => s.key).concat(['__result']));
        // step 级 advanced 已整体取消：它现在没有任何效果，留着只会让人以为步还能被藏起来
        R().deep().concat(R().all()).forEach((tool) => {
            expect((tool.steps || []).filter((s) => s.level === 'advanced')).toEqual([]);
        });
        // 两次调用必须给出同一张表（曾经"看当前 mode 才知道自己有几步"）
        expect(W().stepsOf(t)).toEqual(W().stepsOf(t));
    });
});

describe('多步向导：渲染与走查', () => {
    test('打开向导：步骤条与第一步渲染出来，并切到向导页', () => {
        expect(W().open('surtax-stamp-deep', { fresh: true })).toBe(true);
        const host = document.getElementById('deep-wizard-page');
        expect(host.querySelectorAll('.step-number')).toHaveLength(4);
        expect(host.querySelector('.step-title.active').textContent).toBe('算哪一项与所在地');
        expect(host.querySelector('#qf-variant')).toBeTruthy();
        expect(window.showPage).toHaveBeenCalledWith('deep-wizard-page');
    });

    test('条件字段跟随计税口径切换（附加税 → 印花税）', () => {
        W().open('surtax-stamp-deep', { fresh: true });
        document.getElementById('qf-variant').value = 'stamp';
        document.getElementById('qf-variant').dispatchEvent(new Event('change'));
        document.getElementById('dw-next').click();
        expect(document.getElementById('qf-stampMode')).toBeTruthy();  // 印花税：凭证形态
        expect(document.getElementById('qf-vatPayable')).toBeFalsy();  // 附加税：实缴增值税
    });

    test('分步填值不丢：上一步再回来，已填的值仍在', () => {
        W().open('surtax-stamp-deep', { fresh: true });
        document.getElementById('dw-next').click();
        document.getElementById('qf-vatPayable').value = '50000';
        document.getElementById('dw-prev').click();     // 回第 1 步
        document.getElementById('dw-next').click();     // 再进第 2 步
        expect(document.getElementById('qf-vatPayable').value).toBe('50000');
    });

    test('结果步算出的税与同源速算器一致（不许两套口径）', () => {
        W().open('surtax-stamp-deep', { fresh: true });
        document.getElementById('dw-next').click();
        document.getElementById('qf-vatPayable').value = '50000';
        document.getElementById('qf-creditRefund').value = '0';   // 不做留抵退税调整
        document.getElementById('dw-next').click();
        document.getElementById('dw-next').click();               // 进结果步
        const shown = document.getElementById('deep-wizard-page').textContent;
        const direct = R().get('surtax-stamp').compute({
            variant: 'surtax', location: 'urban', vat: 50000, consumption: 0, halve: true
        });
        expect(shown).toContain(TB().fmtValue(direct.primary.value, direct.primary.kind));
    });

    test('断点续算：中途退出再进来，停在同一步且值还在', () => {
        W().open('surtax-stamp-deep', { fresh: true });
        document.getElementById('dw-next').click();
        document.getElementById('dw-next').click();
        document.getElementById('dw-next').click();     // 走到结果步并落草稿
        // 重新打开（非 fresh）应回到结果步
        W().open('surtax-stamp-deep');
        const host = document.getElementById('deep-wizard-page');
        expect(host.querySelector('.step-title.active').textContent).toBe('计算结果');
    });
});

// 第二个税种走同一套渲染器 —— 这是「渲染器通用」还是「只适配 vat」的分水岭。
// 附加税印花税的字段结构与 vat 完全不同（另一个 variant 选择器、17 个税目、计税依据是别的税种），
// 它若能跑通，说明新增一个完整测算确实只剩「写一条 spec」这件事。
// 注：它做深后的完整回归在 tests/surtax-deep.test.js —— 这里只留「同一套渲染器能跑」的那几条。
describe('多步向导：第二个税种（附加税与印花税）', () => {
    test('切到印花税后，附加税字段消失、税目与凭证金额出现', () => {
        W().open('surtax-stamp-deep', { fresh: true });
        expect(document.querySelector('.step-title.active').textContent).toBe('算哪一项与所在地');
        document.getElementById('qf-variant').value = 'stamp';
        document.getElementById('qf-variant').dispatchEvent(new Event('change'));
        document.getElementById('dw-next').click();
        expect(document.getElementById('qf-item')).toBeTruthy();        // 印花税：税目
        expect(document.getElementById('qf-amount')).toBeTruthy();      // 印花税：凭证金额
        expect(document.getElementById('qf-vatPayable')).toBeFalsy();   // 附加税：实缴增值税
        expect(document.getElementById('qf-location')).toBeFalsy();     // 附加税：所在地（在第 1 步）
    });

    test('结果步与同源速算器一致', () => {
        W().open('surtax-stamp-deep', { fresh: true });
        document.getElementById('dw-next').click();         // → 计税依据
        document.getElementById('qf-vatPayable').value = '50000';
        document.getElementById('qf-creditRefund').value = '0';      // 不做留抵退税调整
        document.getElementById('dw-next').click();         // → 减半与到期
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
// 第三个税种（企业所得税）。17C-2 纵深（v1.59.0）后 corporate-income-tax-deep 改为**自带 spec**：
// 速算器只收一个「从业人数」和一个「资产总额」，而法定口径是**全年季度平均值**；加计扣除能
// 把应纳税所得额压回 300 万门槛内、整档掉到 5%；亏损还会过期作废 —— 这三层速算器都表达不出来。
// 它是唯一一个有 **repeater 出现在多步中间**（季度台账、亏损台账）的税种，能跑通说明
// repeater 不依赖「只有最后一步才收明细」这个隐含前提。
describe('多步向导：第三个税种（企业所得税）', () => {
    test('第一步只问身份与资质，人数资产与利润都留给后面', () => {
        W().open('corporate-income-tax-deep', { fresh: true });
        expect(document.querySelector('.step-title.active').textContent).toBe('企业身份与资质');
        expect(document.getElementById('qf-industry')).toBeTruthy();
        expect(document.getElementById('qf-staffBegin')).toBeFalsy();     // 没有「直接填人数」的框
        expect(document.getElementById('qf-revenue')).toBeFalsy();
    });

    test('第二步收各季度季初 / 季末（repeater 在多步中间也要能用）', () => {
        W().open('corporate-income-tax-deep', { fresh: true });
        document.getElementById('dw-next').click();              // → 从业人数与资产总额
        expect(document.getElementById('qf-quarters-0-staffBegin')).toBeTruthy();
        expect(document.getElementById('qf-quarters-3-assetsEnd')).toBeTruthy();
    });

    test('第三步收收入成本与三大扣除限额', () => {
        W().open('corporate-income-tax-deep', { fresh: true });
        document.getElementById('dw-next').click();
        document.getElementById('dw-next').click();              // → 收入成本与纳税调整
        expect(document.getElementById('qf-revenue')).toBeTruthy();
        expect(document.getElementById('qf-entertainment')).toBeTruthy();
        expect(document.getElementById('qf-donation')).toBeTruthy();
    });

    // 阶段19-4 顺延（v1.99.0）：结果可视化。21 个完整测算的结果步与速算器共用
    // result-bars.js 那一份 —— 这里钉的是它挂对了地方、且取的是同一份 view。
    test('结果步画「各项数额」条：主结果排第一，且排在逐行明细之前', () => {
        W().open('corporate-income-tax-deep', { fresh: true });
        for (let i = 0; i < 8 && !document.getElementById('dw-result-primary'); i++) {
            document.getElementById('dw-next').click();
        }
        const card = document.getElementById('dw-result-card');
        expect(card.querySelectorAll('.result-bar').length).toBeGreaterThan(1);

        // 第一根是主结果 —— 与结果区那颗大数字同一项（条形取的就是 view，不会再算一遍）
        expect(card.querySelector('.result-bar__label').textContent)
            .toBe(document.getElementById('dw-result-primary-label').textContent);

        const html = card.innerHTML;
        expect(html.indexOf('result-bars-box')).toBeLessThan(html.indexOf('data-dw-row'));
        // 只比大小，不表达加减关系（防误读成瀑布 / 构成图）
        expect(html).toContain('不构成加减关系');
    });

    test('结果步算出的税与直接调 compute 一致', () => {
        // 向导与直接 compute 吃同一份：金额预填归零后向导只读 default，不传就是空算一场
        const input = {
            highTech: false, smeTech: false, industry: 'general', restricted: false,
            quarters: [
                { staffBegin: 280, staffEnd: 280, assetsBegin: 3000, assetsEnd: 3000 },
                { staffBegin: 280, staffEnd: 280, assetsBegin: 3000, assetsEnd: 3000 },
                { staffBegin: 280, staffEnd: 280, assetsBegin: 3000, assetsEnd: 3000 },
                { staffBegin: 380, staffEnd: 250, assetsBegin: 3000, assetsEnd: 3000 }
            ],
            revenue: 12000000, cost: 8800000,
            entertainment: 100000, advertising: 2000000, donation: 300000,
            rdExpense: 1000000, currentYear: 2026, losses: [{ year: 2019, amount: 1500000 }]
        };
        W().open('corporate-income-tax-deep', { fresh: true, values: input });
        for (let i = 0; i < 8 && !document.getElementById('dw-result-primary'); i++) {
            document.getElementById('dw-next').click();
        }
        const shown = document.getElementById('deep-wizard-page').textContent;
        const direct = R().get('corporate-income-tax-deep').compute(input);
        expect(shown).toContain(TB().fmtValue(direct.primary.value, direct.primary.kind));
    });
});

// 第四个税种（社保公积金，17C-3）：字段全在「月」这个量级上，但结果侧要出全年汇总 ——
// 它与前三个税种的结构都不同（没有 variant 选择器、没有条件字段），
// 它能跑通说明渲染器不依赖任何某个税种的特定字段形状。
// 第四个税种（社保公积金）。17C-3 纵深（v1.60.0）后 social-base-deep 改为**自带 spec**：
// 速算器的字段就叫「税前月薪」，compute 直接拿它当缴费基数，而法定是**本人上年度月平均工资**
// （工资总额里含奖金、津贴、加班），于是「月薪 1 万 + 年终奖 12 万」的基数被算成 1 万、
// 法定是 2 万。它也是唯一一个**按身份切换整组字段**的税种（单位职工 / 灵活就业） ——
// 能跑通说明 `when` 条件字段不只支持「显示/隐藏一个框」，还能换掉一整步的字段集合。
describe('多步向导：第四个税种（社保公积金）', () => {
    test('第一步先定参保身份与社平工资', () => {
        W().open('social-base-deep', { fresh: true });
        expect(document.querySelector('.step-title.active').textContent).toBe('参保身份与社平工资');
        expect(document.getElementById('qf-identity')).toBeTruthy();
        expect(document.getElementById('qf-socialAverage')).toBeTruthy();
        expect(document.getElementById('qf-monthlyWage')).toBeFalsy();
        expect(document.getElementById('qf-housingRate')).toBeFalsy();
    });

    test('第二步按身份给不同字段：单位职工收工资总额、灵活就业收自选档次', () => {
        W().open('social-base-deep', { fresh: true });
        document.getElementById('dw-next').click();     // → 缴费基数核定
        expect(document.getElementById('qf-monthlyWage')).toBeTruthy();
        expect(document.getElementById('qf-annualBonus')).toBeTruthy();

        document.getElementById('dw-prev').click();     // 回第 1 步
        document.getElementById('qf-identity').value = 'flexible';
        document.getElementById('qf-identity').dispatchEvent(new Event('change'));
        document.getElementById('dw-next').click();     // 回到第二步
        expect(document.getElementById('qf-level')).toBeTruthy();
        expect(document.getElementById('qf-monthlyWage')).toBeFalsy();
    });

    test('改了工资再回来，基数步填的值仍在（分步填值不丢）', () => {
        W().open('social-base-deep', { fresh: true });
        document.getElementById('dw-next').click();     // → 缴费基数核定
        document.getElementById('qf-monthlyWage').value = '20000';
        document.getElementById('dw-next').click();     // → 缴纳比例与申报基数
        document.getElementById('dw-prev').click();     // 回第 2 步
        expect(document.getElementById('qf-monthlyWage').value).toBe('20000');
    });

    test('结果步算出的数与直接调 compute 一致（无奖金时与速算器同口径）', () => {
        W().open('social-base-deep', { fresh: true });
        document.getElementById('dw-next').click();
        document.getElementById('qf-monthlyWage').value = '20000';
        document.getElementById('qf-annualBonus').value = '0';
        for (let i = 0; i < 6 && !document.getElementById('dw-result-primary'); i++) {
            document.getElementById('dw-next').click();
        }
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
    // 各 spec 的步数不同（vat-deep 纵深后是 4 步），所以一律「点到结果出来为止」
    function toResult(toolId) {
        W().open(toolId, { fresh: true });
        for (let i = 0; i < 8 && !document.getElementById('dw-result-primary'); i++) {
            const next = document.getElementById('dw-next');
            if (!next) break;
            next.click();
        }
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

    // 阶段20 P5（v1.107.0）：上面那条测的是「EuriskoReport 不在场时的兜底」，
    // 这里测的是**真机链路** —— final-report.js 在 index.html 里是加载的，
    // 所以点导出一定会先过交付版报告那一层。断了两年没人发现，正是因为
    // 从前只有「模块自己」的测试，没有「按钮 → 模块」的测试。
    test('加载 final-report 后，导出 PDF 先过交付版报告（不再直接 exportToPDF）', () => {
        loadSource('src/js/export/final-report.js');
        window.exportToPDF = jest.fn();
        window.exportToWord = jest.fn();
        const spy = jest.spyOn(window.EuriskoReport, 'exportFinalReport');

        toResult('vat-deep');
        document.getElementById('dw-export-pdf').click();

        expect(spy).toHaveBeenCalledTimes(1);
        expect(window.exportToPDF).not.toHaveBeenCalled();   // 未付费不能被直接推走导出
        const opts = spy.mock.calls[0][0];
        expect(opts.kind).toBe('vat-deep');
        // 明细必须来自向导自己的结果，不是那份读不到数的旧页面取数
        expect(opts.coreHtml).toContain('应纳增值税');
        // 选「标准版」仍回到原来那串（skipResultCheck + 自拼 HTML），不能变成点了没反应
        expect(typeof opts.onStandard).toBe('function');
        opts.onStandard();
        expect(window.exportToPDF).toHaveBeenCalledTimes(1);
        expect(window.exportToPDF.mock.calls[0][2].skipResultCheck).toBe(true);
        expect(window.exportToPDF.mock.calls[0][2].contentBuilder()).toContain('应纳增值税');
        spy.mockRestore();
    });

    // P5 只真机点过 1 个税种（增值税），而要服务的是 21 个。每个 spec 的 rows 长得不一样
    // （有的是 percent、有的 primary 不是 money），「在增值税上成立」推不出「在经营所得上也成立」。
    // 这里补齐覆盖面。**取数不走 UI 导航**：21 个 spec 里只有一部分能靠默认值点到底，
    // 其余有必填项（阶段19 真机冒烟 41/41 出数，缺的是默认值不是能力）—— 靠点 next 去凑
    // 覆盖面，量到的只是「哪些 spec 给了全默认值」，不是「报告在 21 个税种上取数对不对」。
    test('21 个完整测算逐一取数：交付版报告在每一个税种上都拼得出来', () => {
        loadSource('src/js/export/final-report.js');
        const tools = R().deep();
        const problems = [];
        let withChart = 0;
        let covered = 0;
        const stillNeeds = [];
        // 这 13 个 spec 的必需入参**没有默认值可算**（annual-settlement-deep 的第一步就是
        // repeater「任职段」，默认给的是一条空条目；business / donation 同理）—— 用户填了才有结果，
        // 不是能力缺失。它们不进默认覆盖面，但要登记在案：新增 spec 若默认算不出，必须显式加进来
        // （说明它也是"要用户填"），不许悄悄变成"默认打不开"；反之补了 default 就要移出、进覆盖面。
        const NEEDS_INPUT = [
            'business', 'withholding-deep', 'bonus-tax-deep', 'equity-deep', 'severance-deep',
            'early-retirement-deep', 'expat-deep', 'annual-settlement-deep', 'special-deduction-deep',
            'private-pension-deep', 'donation', 'property-transfer', 'non-resident'
        ];

        tools.forEach((tool) => {
            // 用向导自己填的那份默认入参（defaultsOf 含 repeater 的空条目）。
            // 只 open 的话 state.values 里只有当前步的字段，后面步骤还没进值 —— 那是取数方式不对，
            // 不是 tool 的病。
            let out = null;
            try { out = tool.compute(W().defaultsOf(tool)); } catch (e) { out = null; }
            const listed = NEEDS_INPUT.indexOf(tool.id) >= 0;
            if (!out || !out.primary) {
                // 名单里的仍算不出 = 现状没变；哪天补上了 default，ready 会少一个，提示移出名单
                if (listed) stillNeeds.push(tool.id);
                else problems.push(tool.id + '：默认入参算不出结果，且不在「需用户填值」名单里');
                return;
            }
            if (listed) { problems.push(tool.id + '：名单里说要用户填，实际默认就算得出 —— 移出名单让它进覆盖面'); return; }
            covered += 1;

            const s = W().structureFor(out);
            if (s) {
                if (s.labels.length !== s.values.length) problems.push(tool.id + '：图表标签与数值不等长');
                if (s.labels.length > 6) problems.push(tool.id + '：图表取了超过 6 项');
                if (!s.values.every((v) => Number(v) !== 0)) problems.push(tool.id + '：图表里混进了 0 值项');
                withChart += 1;
            }

            const meta = {
                resultElId: 'dw-result-card',
                reportTitle: () => tool.name + '交付版报告',
                kindLabel: tool.name
            };
            let html = '';
            try {
                html = window.EuriskoReport.buildProDocHtml(tool.id, {
                    meta: meta, coreHtml: '<p>明细</p>', structure: s,
                    // 与 exportResult 同源：政策要点按税种注入（v1.109.0）。不注入的话，
                    // 增值税的报告里写着「子女教育专项附加扣除」—— 个税的政策，真机截图实锤过。
                    policies: (tool.pitfalls || []).slice(0, 6)
                });
            } catch (e) {
                problems.push(tool.id + '：拼报告抛错 ' + e.message);
                return;
            }
            if (html.indexOf('pro-cover') < 0) problems.push(tool.id + '：报告没有封面');
            if (html.indexOf(tool.name) < 0) problems.push(tool.id + '：封面标题不带税种');
            if (html.indexOf('免责声明') < 0) problems.push(tool.id + '：报告没有免责');
            // 政策要点必须是这个税种自己的：取 pitfalls 第一条（去加粗标记）的前 12 个字当指纹。
            // 有 pitfalls 却对不上 = 注入链路断了，报告又在共用别家的政策。
            const fp = (function () {
                const p = (tool.pitfalls || [])[0];
                return p ? String(p).replace(/\*\*/g, '').replace(/\s+/g, '').slice(0, 12) : '';
            })();
            if (fp) {
                // 报告把 **x** 渲染成 <strong>x</strong>，所以两边都剥掉标记再比文字本身
            const plain = html.replace(/\s+/g, '').replace(/<\/?strong>/g, '');
            if (plain.indexOf(fp) < 0) {
                    let diag = '';
                    if (tool.id === 'vat-deep') {
                        const i = html.indexOf('政策要点');
                        diag = ' pitfalls-in=' + Array.isArray(tool.pitfalls) + '/' + (tool.pitfalls || []).length +
                            ' section=[' + (i >= 0 ? html.slice(i, i + 200) : 'NONE') + ']';
                    }
                    problems.push(tool.id + '：政策要点不含自己的 pitfalls（指纹 ' + fp + '）' + diag);
                }
                if (html.indexOf('子女教育') >= 0 && tool.id !== 'annual-settlement-deep') {
                    problems.push(tool.id + '：报告里出现个税专项扣除的政策（共用问答库没按税种分流）');
                }
            }
            // 有数据要画、没数据就不画 —— 两头都不许错
            if (s && html.indexOf('pro-tax-chart') < 0) problems.push(tool.id + '：有数据却没画图');
            if (!s && html.indexOf('pro-tax-chart') >= 0) problems.push(tool.id + '：没数据却画了图');
        });

        expect(problems).toEqual([]);
        expect(tools.length).toBe(21);
        expect(covered).toBe(21 - NEEDS_INPUT.length);   // 能默认算的都过了一遍
        expect(stillNeeds.sort()).toEqual(NEEDS_INPUT.slice().sort());
        expect(withChart).toBeGreaterThan(0);            // 覆盖面里至少有一部分画得出图
        delete window.EuriskoReport;
        // 摘掉它，后面的用例仍落在「报告不在场」的旧路径上 —— 这条验证的是真机链路，
        // 不是要把整份文件的导出行为都改成走报告（前者兑现权益，后者是另一批）。
        delete window.EuriskoReport;
    });

    test('还没到结果步就没有保存 / 导出按钮（不许导出半截结果）', () => {
        W().open('vat-deep', { fresh: true });
        expect(document.getElementById('dw-save')).toBeFalsy();
        expect(document.getElementById('dw-export-pdf')).toBeFalsy();
        expect(document.getElementById('dw-export-word')).toBeFalsy();
    });
});

// 最后一个税种类别（残保金与工会经费，17C-5）。v1.61.0 纵深后改为**自带 spec**，
// 两步变三步：先定算哪一项与社平工资，再收「上年月平均在职人数」或「全年工资总额」
// （按 variant 切换整组字段），最后才是分档减缴与招人定价 / 拨缴与扣除 ——
// 每一步都有 `when` 条件，它能跑通说明向导对「选择器 + 条件字段」的组合是稳的。
describe('多步向导：最后一个税种类别（残保金与工会经费）', () => {
    test('第一步只定算哪一项与社平工资，人数留在第二步', () => {
        W().open('disability-fund-deep', { fresh: true });
        expect(document.querySelector('.step-title.active').textContent).toBe('算哪一项与社平工资');
        expect(document.getElementById('qf-variant')).toBeTruthy();
        expect(document.getElementById('qf-socialAverage')).toBeTruthy();
        expect(document.getElementById('qf-regularCount')).toBeFalsy();
        expect(document.getElementById('qf-disabled')).toBeFalsy();
    });

    test('第二步按 variant 换整组字段：残保金收人数拆解、工会经费收工资总额', () => {
        W().open('disability-fund-deep', { fresh: true });
        document.getElementById('dw-next').click();     // → 上年月平均在职人数 / 全年工资总额
        expect(document.getElementById('qf-regularCount')).toBeTruthy();
        expect(document.getElementById('qf-seasonalCount')).toBeTruthy();
        expect(document.getElementById('qf-dispatchCount')).toBeTruthy();
        expect(document.getElementById('qf-monthlyWage')).toBeFalsy();

        document.getElementById('dw-prev').click();     // 回第 1 步
        document.getElementById('qf-variant').value = 'union';
        document.getElementById('qf-variant').dispatchEvent(new Event('change'));
        document.getElementById('dw-next').click();
        expect(document.getElementById('qf-monthlyWage')).toBeTruthy();
        expect(document.getElementById('qf-annualBonus')).toBeTruthy();
        expect(document.getElementById('qf-regularCount')).toBeFalsy();
    });

    test('改了人数再回来，人数步填的值仍在（分步填值不丢）', () => {
        W().open('disability-fund-deep', { fresh: true });
        document.getElementById('dw-next').click();     // → 上年月平均在职人数
        document.getElementById('qf-regularCount').value = '80';
        document.getElementById('dw-next').click();     // → 分档减缴
        document.getElementById('dw-prev').click();     // 回第 2 步
        expect(document.getElementById('qf-regularCount').value).toBe('80');
    });

    test('结果步与同源速算器一致（没有季节性用工与派遣时，月平均 = 常年人数）', () => {
        // 残保金要看社平与年平均工资，两者都归零了 —— 只填人数算不出对照的那个数。
        // 带 values 打开时渲染器直接落在结果步，所以这里不需要再点「下一步」。
        W().open('disability-fund-deep', {
            fresh: true,
            values: {
                socialAverage: 8000, avgAnnualWage: 120000,
                regularCount: 80, seasonalCount: 0, dispatchCount: 0
            }
        });
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
// 为什么临时换掉一个已有 spec 的 compute：DEEP 数组由 registry 私有持有，deep() 返回的是副本，
// 没法塞一条新 spec 进去；借一个已经是 spec 驱动的壳最省事 —— 但用完必须还，
// 否则后面凡是用到它的用例都会读到假结果（而且假得很难查）。
// 壳取 forward（综合所得）：它自己**没有** compare，正好用来验证「没有 compare 时一切照旧」。
// 选壳的标准是「既没有 compare 也没有 extras」—— 17C-5 做深后 disability-fund-deep 带上了
// extras、17C-4 做深后 surtax-stamp-deep 也带上了，两个都不能再当空壳（v1.61.0 就踩过一次）。
describe('多步向导：多方案对比（compare）', () => {
    const money = v => TB().fmtValue(v, 'currency');
    const toolId = 'forward';

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
    // 「没有 compare 时一切照旧」不靠「恰好哪个 spec 是干净的壳」—— 17C-5 / 17C-4 做深后
    // disability-fund-deep 与 surtax-stamp-deep 先后带上了 extras，壳是会随深度失效的。
    // 直接挂一个只有 primary + rows 的假 compute，断言就与「当前哪些 spec 带表」无关了。
    function mountPlainTool() {
        const tool = R().get(toolId);
        original = tool.compute;
        tool.compute = () => ({
            primary: { label: '目标税前月薪', value: 20000, kind: 'currency' },
            rows: [{ label: '到手月薪', value: 15000, kind: 'currency' }]
        });
    }
    function toResult() {
        W().open(toolId, { fresh: true });
        for (let i = 0; i < 8 && !document.getElementById('dw-result-primary'); i++) {
            const next = document.getElementById('dw-next');
            if (!next) break;
            next.click();
        }
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
        mountPlainTool();
        toResult();
        expect(document.querySelector('#dw-result-card table')).toBeFalsy();
        expect(document.querySelector('[id^="dw-cmp-"]')).toBeFalsy();
        expect(document.getElementById('dw-result-primary')).toBeTruthy();
    });
});

// 「完整测算」比速算器多出来的往往不是多一个字段，而是多一张**表**：综合所得要按年摊开
// 12 个月，累计预扣法下每月到手并不是年收入的十二分之一。这块东西不是一个 label 一个值
// 的 rows 装得下的 —— 没有通用容器，迁移到向导就只能把它删掉（＝迁移即降级）。
describe('多步向导：结果附加块（extras）', () => {
    // 壳取 forward（综合所得）：它自己**没有** extras，正好用来验证「没有 extras 时一切照旧」
    // （17C-5 做深后 disability-fund-deep、17C-4 做深后 surtax-stamp-deep 都带上了 extras，
    // 都不能再当空壳 —— 选壳前先确认它没有 compare / extras。）
    const toolId = 'forward';
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
        for (let i = 0; i < 8 && !document.getElementById('dw-result-primary'); i++) {
            const next = document.getElementById('dw-next');
            if (!next) break;
            next.click();
        }
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
        // 同 compare 那条：不靠「恰好哪个 spec 没有 extras」，直接挂一个不带 extras 的假 compute
        const tool = R().get(toolId);
        original = tool.compute;
        tool.compute = () => ({
            primary: { label: '目标税前月薪', value: 20000, kind: 'currency' },
            rows: [{ label: '到手月薪', value: 15000, kind: 'currency' }]
        });
        toResult();
        const card = document.getElementById('dw-result-card');
        expect(card.textContent).not.toContain('逐月预算表');
        expect(card.querySelector('table')).toBeFalsy();
        expect(document.getElementById('dw-result-primary')).toBeTruthy();
    });
});

// v1.142.0 第三轮：四个老牌完整测算（综合所得 / 反向倒算 / 经营所得 / 分类所得）
// 的内部结构回到 1.17 整页时代的形态。
//
// 为什么要钉这几条：spec 化之后，那些页面被压成「一串平铺的框」。一个总开关当时长成
// 两件东西（标题一行 + 右边一颗「是 / 否」），而它管的那一片字段只是从屏幕上"出现"了 ——
// 看不出归谁、也看不出勾与不勾差多少。用户的原话是「勾选显示有歧义」。
// 1.17 里没有这个毛病：勾选框本身就是小节标题（「专项扣除」三个字直接跟着方框），
// 它管的字段缩进挂在下面一块。下面三条钉的就是这个包含关系，以及"谁也没被吞掉"。
describe('完整测算内部结构：勾选式小节（回到 1.17 的页面形态）', () => {
    // 走到「扣除项明细」那一屏：不写死要点几次下一步 —— 按「那个控件出现了没有」找路
    function openAtDeduction(toolId) {
        W().open(toolId, { fresh: true });
        for (let i = 0; i < 10 && !document.getElementById('qf-specialDeductionCheckbox'); i++) {
            const next = document.getElementById('dw-next');
            if (!next) break;
            next.click();
        }
        return document.getElementById('qf-specialDeductionCheckbox');
    }

    // 勾上：必须**重画**（ Sadly 重画才能让受它管的一片出现在它下面）
    function check(key) {
        const el = document.getElementById('qf-' + key);
        expect(el).toBeTruthy();
        el.checked = true;
        el.dispatchEvent(new Event('change'));
        return document.getElementById('qf-' + key);
    }

    ['forward', 'reverse'].forEach((toolId) => {
        test(toolId + '：勾选框自己就是小节标题，它管的字段挂在它下面一块', () => {
            openAtDeduction(toolId);
            check('specialDeductionCheckbox');

            const cb = document.getElementById('qf-specialDeductionCheckbox');
            // ① 它不再是「是 / 否」开关：小节标题（有文字）与方框同在一颗 label 上
            expect(cb.closest('.dw-group-toggle')).toBeTruthy();
            expect(cb.closest('.tool-switch')).toBeFalsy();

            // ② 它管的那一片确实挂在它自己的 dw-group 下
            const group = cb.closest('.dw-group');
            expect(group).toBeTruthy();
            const owned = group.querySelector('.dw-group-body');
            ['socialBase', 'pensionInsurance', 'medicalInsurance', 'housingFund']
                .forEach((k) => {
                    const f = document.getElementById('qf-' + k);
                    expect(f).toBeTruthy();
                    expect(owned.contains(f)).toBe(true);   // 不是跟节点同级的第三第四层
                });
        });

        test(toolId + '：归组不吞字段 —— 勾上之后该出现的框一个都不少', () => {
            openAtDeduction(toolId);
            check('specialDeductionCheckbox');
            check('specialAdditionalDeductionCheckbox');

            const tool = R().get(toolId);
            const stepKey = 'deduction';
            const missing = tool.fields
                .filter((f) => (f.step || tool.steps[0].key) === stepKey)
                .filter((f) => TB().visibleFields({ fields: [f] }, W().values()).length)
                .map((f) => f.key)
                .filter((k) => !document.getElementById('qf-' + k));
            expect(missing).toEqual([]);
        });
    });

    test('社保缴费基数框里有数可改（勾了专项扣除却给 0 = 勾了跟没勾一样）', () => {
        openAtDeduction('forward');
        check('specialDeductionCheckbox');
        const el = document.getElementById('qf-socialBase');
        expect(Number(el.value)).toBeGreaterThan(0);
        // 养老/医疗/失业三个月缴额随之算出来了 —— 那一对一定挂在这个数上
        ['pensionInsurance', 'medicalInsurance', 'unemploymentInsurance'].forEach((k) => {
            expect(Number(document.getElementById('qf-' + k).value)).toBeGreaterThan(0);
        });
    });
});

// 并排（1.17 那四个页面里，一个卡片内部的框就是两个一行 `grid grid-cols-2 gap-3`）。
// jsdom 不排版，算不出「两列到底有没有并起来」，所以这两条各钉一半：
//   DOM 那一半钉**结构**（同一层的框是不是都落在同一块 grid 地里 —— 散在外面就永远并不起来）；
//   CSS 那一半钉**规则**（宽屏两列 / 窄屏一列，改了这里的数字必须能看见别人也知道）。
describe('完整测算内部结构：字段并排（1.17 那页的 grid 读法）', () => {
    test('一屏的所有输入框都在同一块并排容器里', () => {
        W().open('forward', { fresh: true });
        const grid = document.querySelector('#deep-wizard-page .dw-field-grid');
        expect(grid).toBeTruthy();
        const outside = Array.from(document.querySelectorAll('#deep-wizard-page [id^="qf-"]'))
            .map((el) => el.id)
            .filter((id) => !grid.querySelector('#' + id));
        expect(outside).toEqual([]);
    });

    test('占满行的三样东西是它的直接子元素（不然 grid-column 落不到它们头上）', () => {
        W().open('forward', { fresh: true });
        // 走到扣除项那一屏：勾选式小节与「更多参数」折叠块都在这屏
        for (let i = 0; i < 10 && !document.getElementById('qf-specialDeductionCheckbox'); i++) {
            const next = document.getElementById('dw-next');
            if (!next) break;
            next.click();
        }
        const grid = document.querySelector('#deep-wizard-page .dw-field-grid');
        const kids = Array.from(grid.children);
        expect(kids.some((k) => k.classList.contains('dw-group-head'))).toBe(true);
        // 直接子元素只可能是这几种（多出一种 = 有人又包了一层，跨行规则会落空）
        kids.forEach((k) => {
            const known = k.classList.contains('dw-group') || k.classList.contains('dw-group-head')
                || k.classList.contains('tool-field') || k.tagName === 'DETAILS';
            expect(known).toBe(true);
        });
        expect(kids.filter((k) => k.tagName === 'DETAILS').length).toBeLessThanOrEqual(1);

        // 勾上之后这一颗变成 dw-group（它管的那一片挂进来），仍然只有一层
        const cb = document.getElementById('qf-specialDeductionCheckbox');
        cb.checked = true;
        cb.dispatchEvent(new Event('change'));
        const after = Array.from(document.querySelector('#deep-wizard-page .dw-field-grid').children);
        expect(after.some((k) => k.classList.contains('dw-group'))).toBe(true);
    });

    test('两列并排这件事写在 CSS 里：宽屏两列、手机一列', () => {
        const css = fs.readFileSync(path.join(__dirname, '../src/css/toolbox.css'), 'utf8');
        expect(css).toMatch(/\.dw-field-grid[\s\S]{0,120}?grid-template-columns:\s*repeat\(2/);
        // 手机上仍然是一列 —— 375px 开两列，金额框连 5 位数都放不下
        expect(css).toMatch(/max-width:\s*767\.98px[\s\S]{0,200}?\.dw-field-grid[\s\S]{0,120}?minmax\(0,\s*1fr\)/);
    });

    test('基数类字段自己占一行（它是底下那一组的来源，不该跟他们并排）', () => {
        W().open('forward', { fresh: true });
        for (let i = 0; i < 10 && !document.getElementById('qf-socialBase'); i++) {
            const next = document.getElementById('dw-next');
            if (!next) break;
            next.click();
        }
        ['socialBase', 'housingFundBase'].forEach((k) => {
            const el = document.getElementById('qf-' + k);
            expect(el).toBeTruthy();
            expect(el.closest('.dw-field-wide')).toBeTruthy();
        });
        // 这就是为什么它要单独一行：这些字段都是它连带出来的
        expect(document.getElementById('qf-pensionInsurance')).toBeTruthy();
    });
});

// 任务①：勾选框统一成「方框在前 + 名字在后」，专项扣除默认勾上（1.17 那四个页面的样子）。
// 三条各钉一半：**形态**（不许再出现替用户陈述结论的「否」）、**默认**、
// **覆盖面**（20 个速算器与 21 个完整测算共用同一份 fieldHtml，不许有一处漏改）。
describe('勾选框：方框在前 + 名字在后，专项扣除默认勾上', () => {
    function atDeduction(toolId) {
        W().open(toolId, { fresh: true });
        for (let i = 0; i < 12 && !document.getElementById('qf-specialDeductionCheckbox'); i++) {
            const next = document.getElementById('dw-next');
            if (!next) break;
            next.click();
        }
        return document.getElementById('qf-specialDeductionCheckbox');
    }

    test('专项扣除默认勾上，它管的那一片默认就看得见', () => {
        ['forward', 'reverse'].forEach((toolId) => {
            const cb = atDeduction(toolId);
            expect(cb).toBeTruthy();
            expect(cb.checked).toBe(true);
            // 默认看得见：进门不必先猜才能看到自己的社保
            expect(document.getElementById('qf-socialBase')).toBeTruthy();
            expect(document.getElementById('qf-pensionInsurance')).toBeTruthy();
        });
    });

    test('标题式勾选里，方框在前、名字在后，且屏幕上没有「否」', () => {
        const cb = atDeduction('forward');
        const label = cb.closest('.dw-group-toggle');
        expect(label).toBeTruthy();
        const kids = Array.from(label.children);
        expect(kids[0]).toBe(cb);                       // 方框是第一个
        expect(kids[1].textContent.indexOf('专项扣除')).not.toBe(-1);   // 名字紧跟其后
        const page = document.getElementById('deep-wizard-page');
        expect(page.textContent.indexOf('否')).toBe(-1);
    });

    test('所有 switch 字段（速算器与完整测算共 41 个工具）都不再有「是 / 否」这颗伴生标记', () => {
        let switches = 0;
        R().all().concat(R().deep()).forEach((tool) => {
            (tool.fields || []).filter((f) => f.type === 'switch').forEach((f) => {
                switches += 1;
                const host = document.createElement('div');
                document.body.appendChild(host);
                host.innerHTML = TB().fieldHtml(f, { [f.key]: false }, {});
                // 未勾选时最容易被写成"否" —— 这正是用户截图里那个东西。
                // 注意：这条要钉的是那颗**独立的伴生标记**（旧实现里一个 `<span>否</span>`），
                // 不是"名字里恰好有个是/否字"（「是否为小微企业」这类名字本来就带这两字）。
                expect(host.innerHTML).not.toMatch(/<span>(是|否)<\/span>/);
                // 一颗 label 同时装下方框与名字（点文字也能勾）
                const cb = host.querySelector('.tool-switch input[type="checkbox"]');
                expect(cb).toBeTruthy();
                expect(host.querySelector('.tool-switch span').textContent.length).toBeGreaterThan(0);
            });
        });
        expect(switches).toBeGreaterThan(10);
    });
});

// 底部实时预览条（1.17 的 calc-preview-bar）三个数必须**横排并列**。
// v1.142 曾在这里栽过一次：tailwind.src.css 里规则齐全，但忘了跑 build:css，
// 产物里没有 .calc-preview-grid → grid 不生效 → 三个数竖着叠成一摞。
// 所以这里钉的是**构建产物**（用户真正加载的那份），不是源文件 —— 漏构建立刻红。
// 专项附加扣除有**七项法定分类**。勾上之后底下十来个框平铺成一串时，用户看不出
// "我这五个数分别属于哪一类"，更看不出还漏了哪一类没填 —— 七项里漏一项就是每月两千块。
// 这里钉三件事：字段带上了分类、界面按分类分块、五类一块不落。
describe('专项附加扣除按分类显示', () => {
    const GROUPS = ['子女教育与婴幼儿照护', '继续教育', '大病医疗', '住房贷款利息 / 住房租金', '赡养老人'];

    function openDeduction(toolId) {
        W().open(toolId, { fresh: true });
        for (let i = 0; i < 12 && !document.getElementById('qf-specialAdditionalDeductionCheckbox'); i++) {
            const next = document.getElementById('dw-next');
            if (!next) break;
            next.click();
        }
        const cb = document.getElementById('qf-specialAdditionalDeductionCheckbox');
        if (cb && !cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }
        return cb;
    }

    test('每个字段都带上了分类（漏一个就会掉出它的小节）', () => {
        ['forward', 'reverse'].forEach((toolId) => {
            const tool = R().get(toolId);
            (tool.fields || []).forEach((f) => {
                if (['childrenInfantCount', 'childrenInfantDeductionRate', 'childrenInfantDeduction',
                    'elderlyType', 'elderlyDeduction', 'housingType', 'rentDeduction', 'housingLoanDeduction',
                    'educationDegreeCheckbox', 'educationProfessionalCheckbox', 'educationDeduction',
                    'medicalDeduction'].indexOf(f.key) === -1) return;
                // 分类必须是五类之一：写错一个字，这个框就会自己单独成一块
                expect(GROUPS.indexOf(f.group) !== -1 ? 'ok' : f.key + ' 缺 group').toBe('ok');
            });
        });
    });

    test('界面上按分类分块：五类一块不落，每块有自己的小标题', () => {
        openDeduction('forward');
        const host = document.getElementById('deep-wizard-page');
        const titles = Array.from(host.querySelectorAll('.dw-subgroup-title')).map((x) => x.textContent.trim());
        GROUPS.forEach((g) => expect(titles).toContain(g));
        // 小标题底下确实装着框，不是空块
        Array.from(host.querySelectorAll('.dw-subgroup')).forEach((sg) => {
            expect(sg.querySelectorAll('.tool-field, .dw-group-head').length).toBeGreaterThan(0);
        });
    });

    test('分类归组不吞字段：分块前后字段一个不少', () => {
        openDeduction('forward');
        const host = document.getElementById('deep-wizard-page');
        const shown = Array.from(host.querySelectorAll('[id^="qf-"]')).map((x) => x.id.slice(3));
        ['childrenInfantDeduction', 'elderlyDeduction', 'housingType', 'educationDeduction', 'medicalDeduction']
            .forEach((k) => expect(shown).toContain(k));
    });
});

// 扣除项里有一批是**算出来的**（社保月缴额 = 基数 × 比例；子女 = 人数 × 2000 × 比例；
// 赡养 = 独生 3000 / 非独生 1500；继续教育 = 学历 400 × 月数 + 职业资格 3600）。
// 用户不该对着它们拿计算器 —— 钉四件事：勾了就自己变、源字段一改就跟着变、
// 界面上标得出来、手改了不被悄悄冲掉。
describe('扣除项里自动算出的值', () => {
    function toDeduction(toolId) {
        W().open(toolId, { fresh: true });
        for (let i = 0; i < 12 && !document.getElementById('qf-specialAdditionalDeductionCheckbox'); i++) {
            const next = document.getElementById('dw-next');
            if (!next) break;
            next.click();
        }
        const cb = document.getElementById('qf-specialAdditionalDeductionCheckbox');
        if (cb && !cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }
        return cb;
    }
    function setVal(id, v) {
        const el = document.getElementById(id);
        if (!el) return null;
        el.value = String(v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return el;
    }

    test('勾上学历继续教育，年度扣除额自己就算出来了（400 × 工作月数）', () => {
        toDeduction('forward');
        const before = Number(document.getElementById('qf-educationDeduction').value) || 0;
        const deg = document.getElementById('qf-educationDegreeCheckbox');
        deg.checked = true;
        deg.dispatchEvent(new Event('change', { bubbles: true }));
        const months = Number(W().values().workMonths) || 12;
        expect(Number(document.getElementById('qf-educationDeduction').value)).toBe(400 * months);
        expect(before).toBe(0);
    });

    test('再勾职业资格，3600 加进来', () => {
        toDeduction('forward');
        ['educationDegreeCheckbox', 'educationProfessionalCheckbox'].forEach((k) => {
            const el = document.getElementById('qf-' + k);
            el.checked = true;
            el.dispatchEvent(new Event('change', { bubbles: true }));
        });
        const months = Number(W().values().workMonths) || 12;
        expect(Number(document.getElementById('qf-educationDeduction').value)).toBe(400 * months + 3600);
    });

    test('改人数 / 分摊比例，子女扣除额跟着变', () => {
        toDeduction('forward');
        setVal('qf-childrenInfantCount', 2);
        setVal('qf-childrenInfantDeductionRate', 50);
        expect(Number(document.getElementById('qf-childrenInfantDeduction').value)).toBe(2000 * 2 * 0.5);
    });

    test('选独生子女，赡养扣除额自动给 3000', () => {
        toDeduction('forward');
        setVal('qf-elderlyType', 'only');
        expect(Number(document.getElementById('qf-elderlyDeduction').value)).toBe(3000);
    });

    // 「这栏要不要我填」这句话问号里的提示已经说了（「这一栏不用填：按…自动算出」），
    // 界面上不能再挂一行同样的字 —— 那只是把一句话说两遍。
    test('不在界面上重复挂「自动算出」标记：说明只留在问号的提示里', () => {
        toDeduction('forward');
        const host = document.getElementById('deep-wizard-page');
        expect(host.querySelectorAll('.dw-derived, .dw-derived-tag').length).toBe(0);
    });

    // 工资条上常常只有「养老扣了 800」，没有缴费基数 —— 手改过的数不能再被悄悄冲回派生值
    test('手改过的派生值不被冲掉：改了就是用户的数', () => {
        toDeduction('forward');
        setVal('qf-pensionInsurance', 800);
        const next = document.getElementById('dw-next');
        next.click();                                   // 切步会跑一次 collect + derive
        const prev = Array.from(document.querySelectorAll('.dw-step-jump'));
        if (prev.length) prev[prev.length - 1].click();
        expect(Number(W().values().pensionInsurance)).toBe(800);
    });
});

// 14 个主题是「同一件事的两版」。速算器 → 完整测算 那边早就有出口（速算器结果页行动条的
// 「按年填全的完整版」），反过来一直缺 —— 用户进了按年填全的向导才发现自己只想估一个数，
// 那时只能退出来重新找。钉四件事：有路、只在第一步、没有就不显示、点了真能过去。
describe('完整测算 ↔ 速算版：双向可达', () => {
    test('有对应速算器的完整测算：第一步给出「用速算版」这一行', () => {
        W().open('bonus-tax-deep', { fresh: true });
        const hint = document.querySelector('.dw-quick-hint');
        expect(!!hint).toBe(true);
        expect(hint.textContent).toContain('年终奖个税');
    });

    // 填到第二步再来这句话，等于劝人扔掉已经填好的东西
    test('只在第一步出现：后面几步不再劝人重来', () => {
        W().open('bonus-tax-deep', { fresh: true });
        const next = document.getElementById('dw-next');
        if (next) next.click();
        expect(document.querySelector('.dw-quick-hint')).toBeNull();
    });

    test('没有对应速算器的完整测算不给这一行（不指过去一个不存在的工具）', () => {
        W().open('classification', { fresh: true });
        expect(document.querySelector('.dw-quick-hint')).toBeNull();
    });

    test('点这一行真的打开速算器，不是一句装饰', () => {
        W().open('bonus-tax-deep', { fresh: true });
        document.getElementById('dw-go-quick').click();
        expect(window.showPage).toHaveBeenCalledWith('quick-calculator-page');
    });

    // 21 个完整测算的 nextTools 写了却从没渲染过 —— 填得最全的那批反而是唯一没有
    // 「算完还能干什么」的入口。
    test('结果页渲染「算完还能干什么」（nextTools 不再是死数据）', () => {
        W().open('vat-deep', { fresh: true });
        for (let i = 0; i < 12 && !document.getElementById('dw-result-primary'); i++) {
            const next = document.getElementById('dw-next');
            if (!next) break;
            next.click();
        }
        expect(!!document.getElementById('dw-result-card')).toBe(true);
        const box = document.getElementById('dw-next-tools');
        expect(!!box).toBe(true);
        expect(box.classList.contains('hidden')).toBe(false);
        expect(box.querySelectorAll('.tool-next-item').length).toBeGreaterThan(0);
    });
});

describe('底部预览条：三个数横排并列', () => {
    test('构建产物里有三列 grid（漏 build:css 会竖排）', () => {
        const css = fs.readFileSync(path.join(__dirname, '../src/css/tailwind.css'), 'utf8');
        expect(css).toMatch(/\.calc-preview-grid\{[^}]*grid-template-columns:repeat\(3/);
        // 源文件与产物同判：改源忘了构建，或构建把源丢了，都得有人叫
        const src = fs.readFileSync(path.join(__dirname, '../src/css/tailwind.src.css'), 'utf8');
        expect(src).toMatch(/\.calc-preview-grid\s*\{[^}]*grid-cols-3/);
    });

    test('渲染出的预览条用 calc-preview-grid，且每项是 label 上、值下', () => {
        W().open('forward', { fresh: true });
        for (let i = 0; i < 12 && !document.getElementById('dw-preview-bar'); i++) {
            const next = document.getElementById('dw-next');
            if (!next) break;
            next.click();
        }
        const bar = document.getElementById('dw-preview-bar');
        if (bar) {
            expect(bar.querySelector('.calc-preview-grid')).toBeTruthy();
            const items = bar.querySelectorAll('.calc-preview-item');
            expect(items.length).toBe(3);
            items.forEach((it) => {
                expect(it.querySelector('.calc-preview-label')).toBeTruthy();
                expect(it.querySelector('.calc-preview-value')).toBeTruthy();
            });
        }
    });
});

// 字段说明 / 行说明收进「名词后面那颗问号」，点开才显示。
// 585 条提示常驻时，一屏里三分之一是小字 —— 主次就这么没了（用户原话「看着很疲惫」）。
// 这里钉三件事：**默认收起**、**点了真的开**、**开合状态写在 aria 上**（读屏与键盘也走同一条路）。
describe('说明收进提示按钮：点开才显示', () => {
    function fieldWithHint() {
        const host = document.createElement('div');
        document.body.appendChild(host);
        host.innerHTML = TB().fieldHtml(
            { key: 'hintProbe', label: '探测字段', type: 'money', hint: '这一段是解释' }, {}, {}
        );
        return host;
    }

    test('默认收起：说明在 DOM 里但 hidden，界面上只读到一颗问号', () => {
        const host = fieldWithHint();
        const panel = host.querySelector('.tool-field-hint');
        expect(panel).toBeTruthy();
        expect(panel.hidden).toBe(true);
        const btn = host.querySelector('.tool-hint-btn');
        expect(btn).toBeTruthy();
        expect(btn.getAttribute('aria-expanded')).toBe('false');
        expect(btn.getAttribute('aria-controls')).toBe(panel.id);
        // 按钮紧跟名字，但**不在 label 里** —— label 内的点击会激活关联控件，
        // 搁进去等于"点看说明"顺手把开关拨了
        expect(btn.closest('.tool-field-head')).toBeTruthy();
        expect(btn.closest('label')).toBeNull();
    });

    test('点一下展开、再点收起（文档级委托：重画之后照样管用）', () => {
        const host = fieldWithHint();
        const btn = host.querySelector('.tool-hint-btn');
        const panel = host.querySelector('.tool-field-hint');
        btn.click();
        expect(panel.hidden).toBe(false);
        expect(btn.getAttribute('aria-expanded')).toBe('true');
        btn.click();
        expect(panel.hidden).toBe(true);
        expect(btn.getAttribute('aria-expanded')).toBe('false');
    });

    test('没有说明的字段不长这颗按钮（不然满屏问号点了没东西）', () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        host.innerHTML = TB().fieldHtml({ key: 'plain', label: '无说明字段', type: 'money' }, {}, {});
        expect(host.querySelector('.tool-hint-btn')).toBeNull();
        expect(host.querySelector('.tool-field-hint')).toBeNull();
    });

    test('结果行的说明同样收在按钮里（此前是 title 悬浮 —— 手机上没有 hover）', () => {
        W().open('forward', { fresh: true });
        for (let i = 0; i < 12 && !document.getElementById('dw-result-card'); i++) {
            const next = document.getElementById('dw-next');
            if (!next) break;
            next.click();
        }
        const card = document.getElementById('dw-result-card');
        // 综合所得的结果行里确实有带说明的（年终奖税额：并入 / 单独计税那一句）
        const panel = card.querySelector('.dw-result-hint');
        expect(panel).toBeTruthy();
        expect(panel.hidden).toBe(true);
        const btn = card.querySelector('.dw-result-row__label .tool-hint-btn');
        expect(btn).toBeTruthy();
        btn.click();
        expect(panel.hidden).toBe(false);
        // 说明挂在行的**后面**，不是塞进 label 里把值挤走
        expect(panel.previousElementSibling.classList.contains('dw-result-row')).toBe(true);
    });
});

// 界面是给人看的：两件事这里一并钉住 ——
//   ① 屏幕上不许出现裸的 markdown 星号（spec 的提示是照 markdown 写的，
//      按纯文本转义出去就是「再★减按 70%」这种给用户看的天书）；
//   ② 结果页的默认形态：结论给一个主数字，明细先收着。
describe('界面文案与结果页默认形态', () => {
    function toResult(toolId) {
        W().open(toolId, { fresh: true });
        for (let i = 0; i < 12 && !document.getElementById('dw-result-card'); i++) {
            const next = document.getElementById('dw-next');
            if (!next) break;
            next.click();
        }
        return document.getElementById('dw-result-card');
    }

    test('向导：走到每一屏都不出现 ** 号', () => {
        ['forward', 'classification', 'business'].forEach((toolId) => {
            W().open(toolId, { fresh: true });
            for (let i = 0; i < 12; i++) {
                const page = document.getElementById('deep-wizard-page');
                expect(page.textContent.indexOf('**')).toBe(-1);
                expect(page.innerHTML.indexOf('**')).toBe(-1);
                const next = document.getElementById('dw-next');
                if (!next) break;
                next.click();
            }
        });
    });

    test('速算器那一侧：提示同样不露 ** 号，勾选框不再替用户写「是 / 否」', () => {
        // 加粗要被渲染出来，不是把星号原样端到用户面前（spec 里一大批提示是照 markdown 写的）
        const host = document.createElement('div');
        document.body.appendChild(host);
        host.innerHTML = TB().fieldHtml(
            { key: 'starProbe', label: '探测字段', type: 'money', hint: '减除 20% 后**再减按 70%**' }, {}, {}
        );
        expect(host.innerHTML.indexOf('**')).toBe(-1);
        expect(host.querySelector('.tool-field-hint strong')).toBeTruthy();

        // 真 spec 里带加粗提示的字段（20 个工具里挑得出来）渲染后同样不许留星号
        const tool = R().all().concat(R().deep())
            .find((t) => (t.fields || []).some((f) => f.hint && f.hint.indexOf('**') !== -1));
        expect(tool).toBeTruthy();
        const host2 = document.createElement('div');
        document.body.appendChild(host2);
        tool.fields.forEach((f) => { host2.innerHTML += TB().fieldHtml(f, {}, {}); });
        expect(host2.innerHTML.indexOf('**')).toBe(-1);

        // 勾选框：不再替用户写一个「否」
        const swTool = R().all().concat(R().deep())
            .find((t) => (t.fields || []).some((f) => f.type === 'switch'));
        const host3 = document.createElement('div');
        document.body.appendChild(host3);
        swTool.fields.filter((f) => f.type === 'switch').forEach((f) => {
            host3.innerHTML = TB().fieldHtml(f, {}, {});
            expect(host3.textContent.indexOf('否')).toBe(-1);
            // 方框在前、名字在后：同一颗 label 同时含 input 与名字
            const cb = host3.querySelector('#qf-' + f.key);
            expect(cb).toBeTruthy();
            const label = cb.closest('.tool-switch');
            expect(label.tagName).toBe('LABEL');
            expect(label.textContent.indexOf(f.label)).not.toBe(-1);
        });
    });

    test('结果页：主数字独占一块 hero，明细默认收起', () => {
        const card = toResult('forward');
        expect(card).toBeTruthy();
        expect(card.querySelector('.dw-result-hero #dw-result-primary')).toBeTruthy();
        const details = card.querySelectorAll('details');
        expect(details.length).toBeGreaterThan(0);
        // 明细盒默认收起（这一屏的任务是给结论），推导链仍然展开 —— 核对不能顺手关掉
        expect(card.querySelector('details.dw-detail-box').open).toBe(false);
        expect(card.querySelectorAll('[data-dw-row]').length).toBeGreaterThan(0);
    });

    test('结果页：明细行按语义着色，不是二十个数一个颜色', () => {
        const card = toResult('forward');
        const tones = Array.from(card.querySelectorAll('.dw-result-row'))
            .map((row) => (row.className.match(/dw-result-row--(\w+)/) || [])[1]);
        expect(tones.length).toBeGreaterThan(1);
        expect(tones).toContain('tax');
    });

    // 结论由三个数构成：主数字 + 要交多少税 + 真正到手多少。
    // 只有主数字就得展开二十行才知道交了多少税 —— 那等于把结论也收起来了。
    test('结果页：主数字下面还有两个关键数（税额 / 到手），且排成一行', () => {
        const card = toResult('forward');
        const facts = card.querySelectorAll('.dw-result-keyfacts .dw-result-keyfact');
        expect(facts.length).toBeGreaterThanOrEqual(1);
        expect(facts.length).toBeLessThanOrEqual(2);
        facts.forEach((f) => {
            expect(f.querySelector('.dw-result-keyfact__label').textContent.trim().length).toBeGreaterThan(0);
            expect(f.querySelector('.dw-result-keyfact__value').textContent.trim().length).toBeGreaterThan(0);
        });
        // 关键数排在 hero 之后、明细之前（顺序错了就不是"摘要"，是又一组散数）
        const order = Array.from(card.querySelectorAll('#dw-result-hero, .dw-result-keyfacts, .dw-detail-box'))
            .map((n) => n.className.split(' ')[0]);
        expect(order.indexOf('dw-result-keyfacts')).toBeGreaterThan(order.indexOf('dw-result-hero'));
        expect(order.indexOf('dw-result-keyfacts')).toBeLessThan(order.indexOf('dw-detail-box'));

        // 两格并排写在 CSS 里（手机上回一列）
        const css = fs.readFileSync(path.join(__dirname, '../src/css/toolbox.css'), 'utf8');
        expect(css).toMatch(/\.dw-result-keyfacts\s*\{[\s\S]{0,160}?grid-template-columns:\s*repeat\(2/);
    });
});
