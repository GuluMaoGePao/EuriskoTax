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
    loadSource('src/js/calculation/helper-functions.js');
    loadSource('src/js/calculation/tax-registry.js');
    loadSource('src/js/calculation/vat-quick.js');
    loadSource('src/js/calculation/surtax-stamp-quick.js');
    loadSource('src/js/calculation/corporate-income-tax-quick.js');
    loadSource('src/js/calculation/social-insurance-quick.js');
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
        expect(W().has(R().get('forward'))).toBe(false);    // 有独立页面，走原路
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
