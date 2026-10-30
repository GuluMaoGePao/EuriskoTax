// 车辆购置税（阶段22 M5 续，v2.3.0）的回归网
//
// 与契税同类：它不是所得，是**购置环节一次性征收**的税，所以分类总表里按跨格子事项挂在
// E25「买车了」，B 分支 C3 财产与行为税里车辆购置税那一格此前也是空的。本文件钉四件事：
//
//   ① **计税价格不含增值税**（车辆购置税法第六条（一））：发票上的 30 万是含税价，
//      计税价格是 265486.73，购置税 26548.67 —— 直接拿发票价乘 10% 得到 3 万，多算 3451.33。
//   ② **新能源 2026 年起不是全免了**（财政部 税务总局公告 2023 年第 10 号）：
//      2024–2025 免征且每辆封顶 15000，2026–2027 **减半**且每辆封顶 7500。
//      一辆 30 万的新能源车：减半算出 13274.34 但只能减 7500，实缴 19048.67 ——
//      既不是 0（旧口径），也不是应纳税额的一半（忘了封顶）。
//   ③ **二手车不再征收**（第三条：一次性征收）；**进口自用按组成计税价格**
//      （关税完税价格 + 关税 + 消费税，消费税率按气缸容量分档），不是按落地售价。
//   ④ **自产 / 受赠按凭证载明价格**，且这个价格本身**不含增值税** ——
//      与购买自用时「从含税发票价里分离」是两件事。
//
// 口径同源：10% 与封顶额落在 tax-constants.js 的 vehiclePurchaseTaxRules；
// 13% 引 vatRules.general.rates[0]（销售货物）、价税分离调 vat-quick 的 priceSplitOf ——
// 本文件额外钉住「13% 与封顶额确实是从别处引用来的，不是抄第二份」。

const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');              // vehiclePurchaseTaxRules
    loadSource('src/js/calculation/tax-registry.js');               // 政策条目 vehicle-purchase
    loadSource('src/js/calculation/vat-quick.js');                  // priceSplitOf（价税分离）
    loadSource('src/js/calculation/vehicle-purchase-tax-quick.js');
    loadSource('src/js/calculation/utils.js');
    loadSource('src/js/data/tax-taxonomy.js');
    loadSource('src/js/data/person-taxonomy.js');
    loadSource('src/js/data/tool-taxonomy.js');
    loadSource('src/js/data/tool-registry.js');
    loadSource('src/js/ui/toolbox-ui.js');
    loadSource('src/js/ui/deep-wizard-ui.js');
});

const R = () => window.EuriskoToolRegistry;
const Q = () => window.EuriskoVehiclePurchaseTaxQuick;
const C = () => window.EuriskoTaxConstants;

// 默认形态：买一辆 30 万的新能源新车（2026 档：减半且封顶 7500）
function values(extra) {
    const base = {};
    R().get('vehicle-purchase-tax').fields.forEach((f) => {
        base[f.key] = (f.sample !== undefined ? f.sample : f.default);
    });
    return Object.assign(base, extra || {});
}

function compute(extra) {
    return R().get('vehicle-purchase-tax').compute(values(extra));
}

function row(out, label) {
    const r = out.rows.find((x) => x.label === label);
    return r ? r.value : undefined;
}

function tableOf(out, keyword) {
    const e = out.extras.filter((x) => x.title.indexOf(keyword) >= 0)[0];
    return e ? e.table.rows : [];
}

describe('计税价格：不含增值税（发票价 30 万 → 计税价格 265486.73）', () => {
    // 300000 ÷ 1.13 = 265486.7256… → 265486.73；购置税 26548.67
    // 直接拿发票价乘 10% = 30000 —— 多算 3451.33
    test('购买自用：增值税按 13% 分离，购置税 26548.67（不是 30000）', () => {
        const s = Q().stackOf({ source: 'buy', energy: 'fuel', price: 300000 });
        expect(s.basis.vatRate).toBeCloseTo(0.13, 6);
        expect(s.basis.base).toBeCloseTo(265486.73, 2);
        expect(s.basis.vat).toBeCloseTo(34513.27, 2);
        expect(s.tax.tax).toBeCloseTo(26548.67, 2);
        expect(s.tax.tax).not.toBeCloseTo(30000, 0);
    });

    test('含税与不含税的差额：多算 3451.33 元', () => {
        const cmp = Q().vatCompareOf({ source: 'buy', energy: 'fuel', price: 300000 });
        expect(cmp.wrong).toBeCloseTo(30000, 2);
        expect(cmp.gap).toBeCloseTo(3451.33, 2);
    });

    // 自产 / 受赠：凭证载明的价格**本身不含增值税**，不再分离
    test('自产自用：凭证载明的价格（不含增值税）就是计税价格', () => {
        const b = Q().basisOf({ source: 'selfMade', exclusivePrice: 200000 });
        expect(b.vatRate).toBe(0);
        expect(b.vat).toBe(0);
        expect(b.base).toBe(200000);
    });

    test('受赠 / 获奖：同样按凭证载明价格，购置税 20000', () => {
        const s = Q().stackOf({ source: 'gift', energy: 'fuel', exclusivePrice: 200000 });
        expect(s.basis.base).toBe(200000);
        expect(s.tax.tax).toBeCloseTo(20000, 2);
    });
});

describe('新能源减免：2026 年起是减半且封顶 7500，不是全免', () => {
    // 30 万的车：应纳税额 26548.67，减半是 13274.34 —— 但封顶 7500
    test('2026 档：减半算出 13274.34 但封顶 7500 → 实缴 19048.67', () => {
        const s = Q().stackOf({ source: 'buy', energy: 'ne', price: 300000, period: 'half2026' });
        expect(s.tax.tax).toBeCloseTo(26548.67, 2);
        expect(s.tax.relief.relief).toBeCloseTo(7500, 2);
        expect(s.tax.relief.cap).toBe(7500);
        expect(s.tax.relief.capped).toBe(true);
        expect(s.total).toBeCloseTo(19048.67, 2);
        expect(s.total).not.toBe(0);
        expect(s.total).not.toBeCloseTo(13274.34, 0);
    });

    test('2024 档：免征但封顶 15000 → 减免 15000、实缴 11548.67', () => {
        const s = Q().stackOf({ source: 'buy', energy: 'ne', price: 300000, period: 'exempt2024' });
        expect(s.tax.relief.relief).toBeCloseTo(15000, 2);
        expect(s.total).toBeCloseTo(11548.67, 2);
    });

    test('无减免档：按 10% 全额 26548.67（与燃油车同额）', () => {
        const s = Q().stackOf({ source: 'buy', energy: 'ne', price: 300000, period: 'none' });
        expect(s.tax.relief.relief).toBe(0);
        expect(s.total).toBeCloseTo(26548.67, 2);
    });

    // 10 万的车：应纳税额 8849.56，减半 4424.78 < 封顶 7500 —— 此时按一半减，不触顶
    test('车价降到 10 万：减半 4424.78 未触封顶，实缴 4424.78', () => {
        const s = Q().stackOf({ source: 'buy', energy: 'ne', price: 100000, period: 'half2026' });
        expect(s.tax.tax).toBeCloseTo(8849.56, 2);
        expect(s.tax.relief.capped).toBe(false);
        expect(s.tax.relief.relief).toBeCloseTo(4424.78, 2);
        expect(s.total).toBeCloseTo(4424.78, 2);
    });

    test('燃油车不享受减免：30 万缴 26548.67', () => {
        const s = Q().stackOf({ source: 'buy', energy: 'fuel', price: 300000 });
        expect(s.tax.relief.relief).toBe(0);
        expect(s.total).toBeCloseTo(26548.67, 2);
    });

    test('新能源与燃油的差额就是封顶额 7500（不是全额 26548.67）', () => {
        const cmp = Q().energyCompareOf({ source: 'buy', energy: 'ne', price: 300000 });
        expect(cmp.ne.total).toBeCloseTo(19048.67, 2);
        expect(cmp.fuel.total).toBeCloseTo(26548.67, 2);
        expect(cmp.gap).toBeCloseTo(7500, 2);
    });
});

describe('二手车不再征收：一次性征收（第三条）', () => {
    test('买二手车：计税价格与实缴都是 0', () => {
        const s = Q().stackOf({ source: 'used', energy: 'fuel', price: 150000 });
        expect(s.basis.base).toBe(0);
        expect(s.tax.tax).toBe(0);
        expect(s.total).toBe(0);
    });

    test('二手车即使是新能源也不产生减免', () => {
        const s = Q().stackOf({ source: 'used', energy: 'ne', price: 150000, period: 'half2026' });
        expect(s.tax.relief.applied).toBe(false);
        expect(s.total).toBe(0);
    });
});

describe('进口自用：组成计税价格（关税完税价格 + 关税 + 消费税）', () => {
    // 完税价 40 万、关税 15% = 60000；消费税 5%（2.0 升档）：
    //   组成计税价格 = (400000 + 60000) ÷ (1 − 5%) = 484210.5263…
    //   消费税 = 484210.53 × 5% = 24210.53；计税价格 = 484210.53 → 购置税 48421.05
    test('40 万完税价、关税 15%、消费税 5%：购置税 48421.05（不是 40000）', () => {
        const s = Q().stackOf({
            source: 'import', energy: 'fuel',
            customsPrice: 400000, tariffRate: 0.15, consumptionRate: 0.05
        });
        expect(s.basis.tariff).toBeCloseTo(60000, 2);
        expect(s.basis.consumption).toBeCloseTo(24210.53, 2);
        expect(s.basis.base).toBeCloseTo(484210.53, 2);
        expect(s.tax.tax).toBeCloseTo(48421.05, 2);
        expect(s.tax.tax).not.toBeCloseTo(40000, 0);
    });

    // 4.0 升以上消费税 40%：组成计税价格 = 460000 ÷ 0.6 = 766666.67 → 购置税 76666.67
    test('大排量 40% 消费税：组成计税价格 766666.67 → 购置税 76666.67', () => {
        const b = Q().basisOf({
            source: 'import', customsPrice: 400000, tariffRate: 0.15, consumptionRate: 0.40
        });
        expect(b.consumption).toBeCloseTo(306666.67, 2);
        expect(b.base).toBeCloseTo(766666.67, 2);
    });

    test('进口新能源同样享受减免（只是按封顶减）', () => {
        const s = Q().stackOf({
            source: 'import', energy: 'ne', period: 'half2026',
            customsPrice: 400000, tariffRate: 0.15, consumptionRate: 0.05
        });
        expect(s.tax.tax).toBeCloseTo(48421.05, 2);
        expect(s.tax.relief.relief).toBeCloseTo(7500, 2);
        expect(s.total).toBeCloseTo(40921.05, 2);
    });
});

describe('接线：一屏结果、三张对照表、三段推导链', () => {
    test('主结果是实缴车辆购置税（减免后）', () => {
        const out = compute({});
        expect(out.primary.label).toContain('车辆购置税');
        expect(out.primary.value).toBeCloseTo(19048.67, 2);
    });

    test('结果行：计税价格、应纳税额、减免、实缴、总支出', () => {
        const out = compute({});
        expect(row(out, '车辆购置税计税价格（不含增值税）')).toBeCloseTo(265486.73, 2);
        expect(row(out, '车辆购置税（按 10% 计征）')).toBeCloseTo(26548.67, 2);
        expect(row(out, '新能源汽车减免')).toBeCloseTo(7500, 2);
        expect(row(out, '实缴车辆购置税')).toBeCloseTo(19048.67, 2);
        expect(row(out, '车款 + 购置税（总支出）')).toBeCloseTo(319048.67, 2);
    });

    test('三张对照表：新能源与燃油、含不含增值税、减免档期', () => {
        const out = compute({});
        expect(tableOf(out, '新能源与燃油').length).toBe(2);
        expect(tableOf(out, '含不含增值税').length).toBe(2);
        expect(tableOf(out, '减免档期').length).toBe(3);
    });

    test('推导链三段：计税价格怎么定 → 应纳税额 → 减免与实缴', () => {
        const out = compute({});
        expect(out.steps.length).toBe(3);
        expect(out.steps[0].title).toContain('计税价格');
        expect(out.steps[1].title).toContain('10%');
        expect(out.steps[2].title).toContain('减免');
    });

    test('政策条目已登记：vehicle-purchase 有文号可查', () => {
        const reg = window.EuriskoTaxRegistry || null;
        const p = reg && typeof reg.get === 'function' ? reg.get('vehicle-purchase') : null;
        expect(R().get('vehicle-purchase-tax').policyKey).toBe('vehicle-purchase');
        if (p) {
            expect(p.basis.length).toBeGreaterThanOrEqual(4);
            expect(p.basis.map((x) => x.title).join('')).toContain('车辆购置税法');
            expect(p.basis.map((x) => x.doc).join('')).toContain('2023 年第 10 号');
        }
    });
});

describe('口径同源：13% 与封顶额确实来自别处，不是抄第二份', () => {
    test('购车发票的增值税税率引自 vatRules（销售货物那一档）', () => {
        expect(Q().vatRateOf()).toBe(C().vatRules.general.rates[0].rate);
        expect(Q().vatRateOf()).toBeCloseTo(0.13, 6);
        expect(C().vehiclePurchaseTaxRules.vatRate).toBe(C().vatRules.general.rates[0].rate);
    });

    test('10% 与两档封顶额都在 vehiclePurchaseTaxRules，内核不含硬编码数字', () => {
        const r = C().vehiclePurchaseTaxRules;
        expect(r.rate).toBeCloseTo(0.1, 6);
        const half = r.ne.periods.filter((x) => x.id === 'half2026')[0];
        const exempt = r.ne.periods.filter((x) => x.id === 'exempt2024')[0];
        expect(half.cap).toBe(7500);
        expect(half.mode).toBe('half');
        expect(exempt.cap).toBe(15000);
        expect(exempt.mode).toBe('exempt');
        // 改上游而这里没跟着变 → 下面这条会红
        expect(r.ne.default).toBe('half2026');
    });

    test('进口环节的关税与消费税率也在规则里（消费税按气缸容量分档）', () => {
        const imp = C().vehiclePurchaseTaxRules.import;
        expect(imp.tariffRate).toBeCloseTo(0.15, 6);
        expect(imp.consumptionRates.length).toBe(7);
        expect(imp.consumptionRates[0].rate).toBeCloseTo(0.01, 6);
        expect(imp.consumptionRates[6].rate).toBeCloseTo(0.4, 6);
    });
});

describe('挂载：买车是跨格子事项，车辆购置税那一格在 B 分支', () => {
    const T = () => window.EuriskoToolTaxonomy;

    test('主挂 A / E25 买车，次挂 B / C3 财产与行为税', () => {
        const m = T().get('vehicle-purchase-tax');
        expect(m.branch).toBe('A');
        expect(m.primary).toBe('cross/E25');
        expect(m.secondary).toContain('B/C3');
        expect(m.taxCode).toBe('vehicle-purchase');
    });

    test('E25 事件已登记，且税种字典里有车辆购置税', () => {
        const ev = window.EuriskoPersonTaxonomy.events();
        const e = ev.filter((x) => x.id === 'E25')[0];
        expect(e.tools).toContain('vehicle-purchase-tax');
        const tax = window.EuriskoTaxTaxonomy.get('vehicle-purchase');
        expect(tax).toBeTruthy();
        expect(tax.category).toBe('property');
    });

    test('入口数由分类统计得出：44 个入口、A 33 / B 11', () => {
        expect(T().all().length).toBe(44);
        expect(T().countByBranch('A')).toBe(33);
        expect(T().countByBranch('B')).toBe(11);
        expect(T().validate().length).toBe(0);
    });
});
