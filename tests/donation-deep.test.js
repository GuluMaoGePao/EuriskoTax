// 公益慈善捐赠扣除（阶段17 17D-10，v1.66.0）的回归网
//
// 它守护的是 20 个速算器**一个都算不了**的场景：捐赠不是一个所得项目，
// 而是**横跨综合所得、经营所得、分类所得三个所得项目**的一项扣除。其中最贵的一层
// 是「**先扣哪一项**」—— 扣除顺序由纳税人自行决定（财政部 税务总局公告 2019 年第
// 99 号三（三）），而各项目税率不同：
//
//   ① **顺序差 3756 元**：同一笔 5 万捐赠，先扣分类（20%）→ 经营 → 综合省 **8000**，
//      先扣综合（3% 档）→ 经营 → 分类只省 **4244**；
//   ② **捐赠额 ≠ 票面那个数**：货币按实际捐赠额，**股权 / 房产按财产原值**（不是市值），
//      其他非货币性资产按市场价格（二）。房产市值 500 万、原值 200 万 → 捐赠额 **200 万**；
//   ③ **限额 = 各项目应纳税所得额 × 30%**（不是收入的 30%），分类所得按**当月**；
//      一个项目扣不完的可**继续在其他项目扣**（三（一）），但超出的部分个人**不结转**
//      （企业可结转 3 年 —— 最常被混用的两条）；
//   ④ **核定征收的经营所得不扣捐赠**（六（四））；非居民按当月；两处工资只能选一处；
//      追补与补票据都是 90 日、票据留存 5 年。
//
// 口径同源：限额比例与结转规则取注册表声明的 donationRules；综合所得税走内核
// calculateTaxByTaxableIncome、经营所得走 EuriskoBusinessIncomeQuick.taxOf（含 200 万减半）、
// 分类所得走 classificationTaxRates —— 单项目输入下与内核逐点相等（第一个 describe 钉这个）。

const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');           // donationRules / 三张税率表
    loadSource('src/js/calculation/tax-calculator.js');          // calculateTaxByTaxableIncome / 经营所得
    loadSource('src/js/calculation/tax-registry.js');            // policyKey 到期状态
    loadSource('src/js/calculation/business-income-quick.js');   // 经营所得含减半
    loadSource('src/js/calculation/donation-quick.js');
    loadSource('src/js/calculation/utils.js');
    loadSource('src/js/data/tool-registry.js');
    loadSource('src/js/ui/toolbox-ui.js');
    loadSource('src/js/ui/deep-wizard-ui.js');
});

const R = () => window.EuriskoToolRegistry;
const W = () => window.EuriskoDeepWizard;
const Q = () => window.EuriskoDonationQuick;

// 默认形态 = 一笔 5 万货币捐赠，三个所得项目各有一份（捐赠前）
function values(extra) {
    return Object.assign({
        donateKind: 'cash', cashAmount: 50000,
        equityCost: 1000000, equityMarketValue: 3000000,
        houseCost: 2000000, houseMarketValue: 5000000,
        otherMarketValue: 300000, fullDeduction: 'no',
        comprehensiveTaxable: 36000, comprehensiveBasis: 'year',
        businessTaxable: 300000, businessVerified: 'no',
        classificationTaxable: 100000, classificationType: 'accidental',
        residency: 'resident', employerCount: '1', hasReceipt: 'yes'
    }, extra || {});
}

function compute(extra) {
    return R().get('donation').compute(values(extra));
}

function row(out, label) {
    const r = out.rows.find((x) => x.label === label);
    return r ? r.value : undefined;
}

function tableOf(out, keyword) {
    const e = out.extras.filter((x) => x.title.indexOf(keyword) >= 0)[0];
    return e ? e.table.rows : [];
}

describe('与内核同源：只有一个所得项目时 ≡ 应纳税所得额 × 30%', () => {
    test('只综合所得：可扣 = min(捐赠额, 应纳税所得额 × 30%)，节税 ≡ 内核两笔之差', () => {
        const out = compute({ businessTaxable: 0, classificationTaxable: 0 });
        const taxable = 36000;
        const cap = taxable * 0.3;                      // 1.08 万
        expect(row(out, '扣除限额合计')).toBeCloseTo(cap, 6);
        expect(row(out, '实际可扣除')).toBeCloseTo(cap, 6);
        const byKernel = window.calculateTaxByTaxableIncome(taxable).tax
            - window.calculateTaxByTaxableIncome(taxable - cap).tax;
        expect(row(out, '按最优顺序少交')).toBeCloseTo(byKernel, 6);
        expect(out.primary.value).toBeCloseTo(byKernel, 6);
    });

    test('捐赠额小于限额时全额扣：5 万捐赠、综合 20 万 → 可扣 5 万', () => {
        const out = compute({ comprehensiveTaxable: 200000, businessTaxable: 0, classificationTaxable: 0 });
        expect(row(out, '实际可扣除')).toBe(50000);
        expect(row(out, '扣不完的部分')).toBe(0);
    });

    test('经营所得走五级表 + 200 万减半：单项目节税 ≡ business-income-quick', () => {
        const r = Q().stackOf({
            donateKind: 'cash', cashAmount: 50000,
            businessTaxable: 300000, comprehensiveTaxable: 0, classificationTaxable: 0
        });
        const B = window.EuriskoBusinessIncomeQuick;
        const before = B.taxOf(300000).tax;
        const after = B.taxOf(300000 - 50000).tax;
        expect(r.best.saving).toBeCloseTo(before - after, 6);
        expect(r.best.deductibleTotal).toBe(50000);      // 限额 9 万内
    });

    test('分类所得按 20% 比例税、限额按当月', () => {
        const out = compute({ comprehensiveTaxable: 0, businessTaxable: 0 });
        expect(row(out, '扣除限额合计')).toBeCloseTo(100000 * 0.3, 6);
        expect(row(out, '按最优顺序少交')).toBeCloseTo(30000 * 0.2, 6);   // 3 万 × 20%
    });
});

describe('同一笔捐赠，先扣哪一项税不一样（顺序自行决定）', () => {
    test('分类优先省 8000、综合优先省 4244 —— 差 3756', () => {
        const out = compute();
        expect(row(out, '按最优顺序少交')).toBe(8000);
        expect(row(out, '最差顺序少交')).toBe(4244);
        expect(row(out, '顺序选错的差额')).toBe(3756);
        expect(out.primary.value).toBe(8000);
    });

    test('六种顺序全部列出，最优排第一', () => {
        const rows = tableOf(compute(), '六种扣除顺序');
        expect(rows).toHaveLength(6);
        const savings = rows.map((r) => r[2].value);
        expect(savings.slice().sort((a, b) => b - a)).toEqual(savings);   // 已按「少交」降序
        expect(rows[0][3].value).toBe(0);                 // 最优自己差 0
        expect(rows[5][3].value).toBe(3756);
    });

    test('一个项目扣不完的，继续在下一个项目扣（不是作废）', () => {
        const out = compute({ classificationTaxable: 0, cashAmount: 100000 });
        // 分类没了：综合限额 1.08 万 + 经营限额 9 万 = 10.08 万 ≥ 10 万 → 全额扣完
        expect(row(out, '实际可扣除')).toBe(100000);
        expect(row(out, '扣不完的部分')).toBe(0);
        expect(row(out, '最优扣除顺序')).toContain('经营所得');
    });

    test('超出全部项目限额的部分不结转以后年度（企业可结转 3 年）', () => {
        const out = compute({ cashAmount: 200000 });
        expect(row(out, '扣除限额合计')).toBeCloseTo(130800, 6);
        expect(row(out, '扣不完的部分')).toBeCloseTo(200000 - 130800, 6);
        expect(out.note).toContain('不结转以后年度');
    });
});

describe('捐赠额不是票面那个数：股权 / 房产按财产原值', () => {
    test('房产市值 500 万、原值 200 万 → 捐赠额 200 万，差的 300 万不能扣', () => {
        const out = compute({
            donateKind: 'house', businessTaxable: 10000000, cashAmount: 0,
            classificationTaxable: 0, comprehensiveTaxable: 0
        });
        expect(row(out, '核定后的捐赠额')).toBe(2000000);
        expect(row(out, '与票面市值的差')).toBe(3000000);
        expect(Q().amountOf({ donateKind: 'house', houseCost: 2000000, houseMarketValue: 5000000 }).note)
            .toContain('财产原值');
    });

    test('股权同样按财产原值：原值 100 万、市值 300 万', () => {
        const a = Q().amountOf({ donateKind: 'equity', equityCost: 1000000, equityMarketValue: 3000000 });
        expect(a.amount).toBe(1000000);
        expect(a.declared).toBe(3000000);
    });

    test('货币按实际捐赠额、其他非货币性资产按市场价格', () => {
        expect(Q().amountOf({ donateKind: 'cash', cashAmount: 50000 }).amount).toBe(50000);
        expect(Q().amountOf({ donateKind: 'other', otherMarketValue: 300000 }).amount).toBe(300000);
    });
});

describe('三个容易被忽略的闸门：核定征收 / 非居民 / 两处工资', () => {
    test('核定征收的经营所得不扣捐赠', () => {
        const items = Q().itemsOf({ businessTaxable: 300000, businessVerified: 'yes', comprehensiveTaxable: 0, classificationTaxable: 0 });
        const biz = items.filter((x) => x.key === 'business')[0];
        expect(biz.blocked).toBe(true);
        expect(biz.limit).toBe(0);
        expect(Q().stackOf({
            donateKind: 'cash', cashAmount: 30000, businessTaxable: 300000, businessVerified: 'yes',
            comprehensiveTaxable: 0, classificationTaxable: 0
        }).best.deductibleTotal).toBe(0);
    });

    test('非居民按当月、居民按当年（综合所得限额基数）', () => {
        const resident = Q().itemsOf({ comprehensiveTaxable: 36000, businessTaxable: 0, classificationTaxable: 0, comprehensiveBasis: 'year' });
        const nonResident = Q().itemsOf({ comprehensiveTaxable: 36000, businessTaxable: 0, classificationTaxable: 0, comprehensiveBasis: 'month' });
        expect(resident.filter((x) => x.key === 'comprehensive')[0].monthly).toBe(false);
        expect(nonResident.filter((x) => x.key === 'comprehensive')[0].monthly).toBe(true);
        expect(compute({ residency: 'non-resident' }).note).toContain('非居民');
    });

    test('两处以上工资只能选一处扣除且当年不得变更；未取得票据 90 日内补齐', () => {
        expect(compute({ employerCount: '2' }).note).toContain('两处以上');
        expect(compute({ hasReceipt: 'no' }).note).toContain('90 日');
    });
});

describe('结构与输入边界', () => {
    test('捐赠额为 0 时给出提示，不产出计税行', () => {
        const out = compute({ cashAmount: 0, donateKind: 'cash' });
        expect(out.rows).toHaveLength(0);
        expect(out.note).toContain('捐赠额是 0');
        expect(out.primary.value).toBe(0);
    });

    test('推导链三步：捐赠额核定 → 限额与分配 → 节税与结转（结果步由渲染器追加）', () => {
        const out = compute();
        expect(out.steps).toHaveLength(3);
        expect(out.steps.map((s) => s.title)).toEqual([
            '① 捐赠额核定（不是票面那个数）',
            '② 三个所得项目的限额与分配',
            '③ 节税与扣不完的部分'
        ]);
        expect(out.steps[0].footnote).toContain('财产原值');
        expect(out.steps[1].footnote).toContain('30%');
        expect(out.steps[2].footnote).toContain('顺序');
    });

    test('三张明细表：逐项、六种顺序、捐赠额怎么算出来的', () => {
        const out = compute();
        expect(out.extras).toHaveLength(3);
        expect(out.extras.map((e) => e.title)).toEqual([
            '三个所得项目：限额、可扣、各自省多少（按最优顺序）',
            '六种扣除顺序对照（**顺序自行决定**，税不一样）',
            '捐赠额怎么算出来的（99 号公告二）'
        ]);
        expect(tableOf(out, '捐赠额怎么算出来的')).toHaveLength(4);
    });
});

describe('走向导：由 spec 驱动', () => {
    beforeEach(() => {
        localStorage.clear();
        window.showPage = jest.fn();
        document.body.innerHTML = '<div id="deep-wizard-page" class="page hidden"></div>';
    });

    test('被通用向导接管：捐赠什么 → 三个所得项目 → 身份与票据 → 结果', () => {
        const tool = R().get('donation');
        expect(W().has(tool)).toBe(true);
        expect(tool.pageId).toBeUndefined();
        expect(W().stepsOf(tool).map((s) => s.title)).toEqual([
            '这笔捐赠按多少算', '三个所得项目各能扣多少', '身份与票据', '计算结果'
        ]);
    });

    test('没有孪生速算器：它是第一个「无同名速算器的完整测算」（与 business / forward 同类）', () => {
        const tool = R().get('donation');
        expect(R().get('donation')).toBe(tool);
        expect(tool.fields).toHaveLength(17);
        expect(tool.policyKey).toBe('donation');
        expect(tool.status).toBe('deep');
    });

    test('走完向导：主结果、免责声明、结果归属都在', () => {
        W().open('donation', { fresh: true });
        for (let i = 0; i < 10; i++) {
            const next = document.getElementById('dw-next');
            if (!next) break;
            next.click();
            if (document.getElementById('dw-result-card')) break;
        }
        expect(document.getElementById('dw-result-primary')).toBeTruthy();
        expect(document.querySelector('.result-disclaimer').textContent).toContain('不构成税务建议');

        const card = document.getElementById('dw-result-card');
        expect(card.textContent).toContain('六种扣除顺序');
        expect(card.getAttribute('data-tool-id')).toBe('donation');
    });

    test('捐赠形式是条件字段：选房产才出现原值与市值', () => {
        W().open('donation', { fresh: true });
        expect(document.getElementById('qf-houseCost')).toBeNull();
        expect(document.getElementById('qf-cashAmount')).toBeTruthy();

        document.getElementById('qf-donateKind').value = 'house';
        document.getElementById('qf-donateKind').dispatchEvent(new Event('change'));
        expect(document.getElementById('qf-houseCost')).toBeTruthy();
        expect(document.getElementById('qf-houseMarketValue')).toBeTruthy();
    });
});
