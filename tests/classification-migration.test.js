// 分类所得迁移（阶段17 17B-4 / v1.50.0）的回归网
//
// 它接的是三件事：
//   ① 旧页面删了以后，tests/ui-result-compliance.test.js 的 RESULT_PAGES 少了一个条目 ——
//      免责声明不再位于静态 HTML 里，那一处缺口由本文末尾的端到端用例接住；
//   ② 「按次单独计税」的口径独立重算一遍（不 import 内核的另一条路），防止迁移只是搬了个壳；
//   ③ repeater（动态增删所得条目）是这次新加的渲染器能力 —— 它是 classification 能迁的前提，
//      必须钉住：加一条、删一条、条目内的条件字段（选了「租赁」才出现修缮费）。
//
// 与 business / reverse / forward 三次迁移同一条纪律：删页面的那一版里，
// 必须先把守护换成一个同样会红的替代者。

const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/tax-calculator.js');
    loadSource('src/js/calculation/utils.js');             // buildClassificationTable / 推导链
    loadSource('src/js/data/tool-registry.js');
    loadSource('src/js/ui/toolbox-ui.js');
    loadSource('src/js/ui/deep-wizard-ui.js');
});

const R = () => window.EuriskoToolRegistry;
const W = () => window.EuriskoDeepWizard;

function compute(items) {
    return R().get('classification').compute({ items: items });
}

function row(out, label) {
    const r = out.rows.find((x) => x.label === label);
    return r ? r.value : undefined;
}

// ====== 按税法口径独立重算的一份应当 equals 的数（不 import 内核）======
// 分类所得只有一条主线：**按次单独计税、四类所得各自一套扣除口径、名义税率一律 20%**。
// 这里把它抄一遍，是为了让「内核改口径」这件事在这里先红，而不是界面上出现一个看着合理的错数。
function expectTaxOf(type, income, deduction) {
    let taxable;
    if (type === 'interest' || type === 'accidental') taxable = income;
    else if (type === 'rent') taxable = income <= 4000 ? Math.max(0, income - 800 - deduction) : Math.max(0, income * 0.8 - deduction);
    else taxable = Math.max(0, income - deduction);
    return { taxable, tax: taxable * 0.2 };
}

describe('分类所得迁移：四类所得的扣除口径', () => {
    test('利息、股息、红利所得不减除任何费用，全额 20%', () => {
        const out = compute([{ type: 'interest', income: 10000 }]);
        const e = expectTaxOf('interest', 10000, 0);
        expect(row(out, '应纳税所得额')).toBe(e.taxable);      // 10000
        expect(row(out, '应纳税额合计')).toBe(e.tax);          // 2000
        expect(row(out, '扣除合计')).toBe(0);
        expect(out.primary.value).toBe(10000 - e.tax);          // 税后收入
    });

    test('偶然所得同上（全额计税，没有扣除）', () => {
        const out = compute([{ type: 'accidental', income: 5000 }]);
        expect(row(out, '应纳税额合计')).toBe(1000);
    });

    test('财产租赁：> 4000 元减除 20%，再扣准予扣除项目与修缮费', () => {
        const out = compute([{ type: 'rent', income: 60000, rentDeductions: 5000, rentRepair: 0 }]);
        const e = expectTaxOf('rent', 60000, 5000);
        expect(row(out, '应纳税所得额')).toBe(43000);           // 60000 × 80% − 5000
        expect(row(out, '应纳税额合计')).toBe(8600);            // × 20%
        expect(row(out, '扣除合计')).toBe(5000);
        expect(e.taxable).toBe(43000);
    });

    test('财产租赁：≤ 4000 元减除 800 元（不是 20%）', () => {
        const out = compute([{ type: 'rent', income: 3000 }]);
        expect(row(out, '应纳税所得额')).toBe(2200);            // 3000 − 800
        expect(row(out, '应纳税额合计')).toBe(440);
    });

    // 修缮费每月 800 元是**封顶**，超出的部分结转以后月份 —— 页面版按 800 截断却一句话没说，
    // 用户填 1500 看到 800 会以为系统算错了。这次把话说进 hint / pitfalls，口径本身不变。
    test('修缮费每月封顶 800（填 1500 也只扣 800）', () => {
        const out = compute([{ type: 'rent', income: 60000, rentDeductions: 0, rentRepair: 1500 }]);
        expect(row(out, '扣除合计')).toBe(800);
        expect(row(out, '应纳税所得额')).toBe(48000 - 800);
        expect(R().get('classification').pitfalls.join('')).toContain('结转以后月份');
    });

    test('财产转让：收入 − 财产原值 − 合理费用', () => {
        const out = compute([{ type: 'transfer', income: 100000, transferOriginal: 60000, transferExpenses: 5000 }]);
        const e = expectTaxOf('transfer', 100000, 65000);
        expect(row(out, '扣除合计')).toBe(65000);
        expect(row(out, '应纳税所得额')).toBe(35000);
        expect(row(out, '应纳税额合计')).toBe(7000);
        expect(e.taxable).toBe(35000);
    });
});

describe('分类所得迁移：按次单独计税（不是合并计税）', () => {
    // 这是分类所得与综合所得最根本的差别：每一笔各自扣除、各自计税，税额直接相加。
    // 一旦哪天有人「顺手」把它合成一笔，第一个坏掉的就是这条。
    test('多项所得的税额＝各自税额之和（不合并、不累进）', () => {
        const items = [
            { type: 'interest', income: 10000 },
            { type: 'rent', income: 60000, rentDeductions: 5000, rentRepair: 0 },
            { type: 'transfer', income: 100000, transferOriginal: 60000, transferExpenses: 5000 }
        ];
        const out = compute(items);
        const one = items.map((it) => {
            const d = it.type === 'rent' ? it.rentDeductions + Math.min(it.rentRepair || 0, 800)
                : it.type === 'transfer' ? it.transferOriginal + it.transferExpenses : 0;
            return expectTaxOf(it.type, it.income, d);
        });

        expect(row(out, '收入合计')).toBe(170000);
        expect(row(out, '应纳税所得额')).toBe(one.reduce((s, x) => s + x.taxable, 0));
        expect(row(out, '应纳税额合计')).toBeCloseTo(one.reduce((s, x) => s + x.tax, 0), 6);
        // 名义税率一律 20%，真正会变的是**实际税负率**（有扣除的那几笔拉低了它）
        expect(row(out, '实际税负率')).toBeLessThan(0.2);
        expect(row(out, '所得类型')).toContain('3 项');
    });

    test('两笔租金不共享一次 800 元减除（每一笔各自算）', () => {
        const two = compute([{ type: 'rent', income: 3000 }, { type: 'rent', income: 3000 }]);
        const one = compute([{ type: 'rent', income: 6000 }]);
        expect(row(two, '应纳税所得额')).toBe(2200 * 2);        // 每笔各减 800
        expect(row(one, '应纳税所得额')).toBe(6000 * 0.8);      // 一笔 6000 走 20% 减除
    });

    test('收入为 0 的空条目不进计税表（用户正在填的那一条不算一笔所得）', () => {
        const out = compute([{ type: 'rent', income: 0, rentDeductions: 0 }]);
        expect(out.rows).toHaveLength(0);
        expect(out.note).toContain('还没有有效条目');
    });
});

describe('分类所得迁移：计税表（页面删了，表必须还在）', () => {
    const cells = (r) => (Array.isArray(r) ? r : (r.cells || []));

    test('extras 里挂着唯一的分类所得计税表，条目之间有分隔线', () => {
        const out = compute([
            { type: 'interest', income: 10000 },
            { type: 'rent', income: 60000, rentDeductions: 5000, rentRepair: 0 }
        ]);
        const tbl = out.extras.find((e) => e.title === '分类所得计税表');
        expect(tbl).toBeTruthy();
        expect(tbl.table.head).toEqual(['项目', '金额 (元)', '说明']);

        const rows = tbl.table.rows.map(cells);
        const flat = rows.map((r) => r[0]);
        expect(flat).toContain('利息、股息、红利所得');
        expect(flat).toContain('财产租赁所得');
        expect(flat.some((c) => String(c).indexOf('————') === 0)).toBe(true);   // 条目之间的分隔线
        expect(flat).toContain('总应纳税额');
    });
});

// 旧页面删掉以后（17B-4 v1.50.0），tests/ui-result-compliance.test.js 的 RESULT_PAGES 少了
// classification 那一条：免责声明不再位于静态 HTML 里 —— 那一处缺口由下面这组**端到端**用例接住
// （免责声明、结果归属 data-tool-id、分享图赖以为生的两个行标签、以及 repeater 的增删）。
describe('分类所得走向导：由 spec 驱动', () => {
    beforeEach(() => {
        localStorage.clear();
        window.showPage = jest.fn();
        document.body.innerHTML = '<div id="deep-wizard-page" class="page hidden"></div>';
    });

    test('classification 被通用向导接管（不再是页面式）', () => {
        expect(W().has(R().get('classification'))).toBe(true);
        const steps = W().stepsOf(R().get('classification'));
        expect(steps[0].title).toBe('所得条目');
        expect(steps[steps.length - 1].result).toBe(true);
        expect(R().get('classification').pageId).toBeUndefined();
    });

    function toResult() {
        W().open('classification', { fresh: true });
        for (let i = 0; i < 10; i++) {
            const next = document.getElementById('dw-next');
            if (!next) break;
            next.click();
            if (document.getElementById('dw-result-card')) break;
        }
    }

    test('走完向导：主结果、推导链、免责声明、计税表都在', () => {
        toResult();
        expect(document.getElementById('dw-result-primary')).toBeTruthy();
        expect(document.getElementById('dw-formula-panel')).toBeTruthy();
        expect(document.querySelector('.result-disclaimer').textContent).toContain('不构成税务建议');

        const card = document.getElementById('dw-result-card');
        expect(card.textContent).toContain('分类所得计税表');
        // 留资归因 / 分享图 / 埋点都靠它认人：通用渲染器不认人，分类所得的结果会算到别人头上
        expect(card.getAttribute('data-tool-id')).toBe('classification');
    });

    test('分享图赖以为生的两个行标签在结果卡上（改名会让分享图静默截空）', () => {
        toResult();
        const card = document.getElementById('dw-result-card');
        // SOURCES['dw-result-card:classification'] 的 rows 写的是这两个行标签 —— 它们不在静态
        // HTML 里（向导运行时生成），tests/share-card.test.js 的契约用例因此覆盖不到。
        ['应纳税额合计', '实际税负率'].forEach((label) => {
            expect(card.querySelector('[data-dw-row="' + label + '"]')).toBeTruthy();
        });
    });

    test('repeater：默认一条，能加能删（这是它能迁的唯一前提）', () => {
        W().open('classification', { fresh: true });
        const rows = () => document.querySelectorAll('[data-dw-rep-of="items"]');
        expect(rows()).toHaveLength(1);

        document.getElementById('dw-rep-add-items').click();
        expect(rows()).toHaveLength(2);
        // 加第二条时，第一条已经填的字不许被冲掉（先收值再加，这行当年在页面版踩过）
        document.getElementById('qf-items-0-income').value = '12345';
        document.getElementById('dw-rep-add-items').click();
        expect(document.getElementById('qf-items-0-income').value).toBe('12345');

        document.querySelector('[data-dw-rep-of="items"] [data-dw-rep-remove]').click();
        expect(rows()).toHaveLength(2);
        // 删空留一条：条目列表没了，连「添加」按钮都没着落
        document.querySelector('[data-dw-rep-of="items"] [data-dw-rep-remove]').click();
        document.querySelector('[data-dw-rep-of="items"] [data-dw-rep-remove]').click();
        expect(rows()).toHaveLength(1);
    });

    test('repeater 内的条件字段：选了「财产租赁」才出现修缮费', () => {
        W().open('classification', { fresh: true });
        expect(document.getElementById('qf-items-0-rentRepair')).toBeFalsy();     // 默认利息：无扣除字段

        const select = document.getElementById('qf-items-0-type');
        select.value = 'rent';
        select.dispatchEvent(new Event('change'));

        expect(document.getElementById('qf-items-0-rentDeductions')).toBeTruthy();
        expect(document.getElementById('qf-items-0-rentRepair')).toBeTruthy();
        expect(document.getElementById('qf-items-0-transferOriginal')).toBeFalsy();
    });
});
