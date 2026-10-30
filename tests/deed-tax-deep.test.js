// 契税（阶段22 M5 续，v2.2.0）的回归网
//
// 分类总表 §1.2 里 E16「买房了」是跨格子事项 —— 契税不是所得，所以 9 格所得形态收不下它，
// B 分支 C3 契税那一格也是空的。买房是个人一辈子最大的一笔支出，一套 500 万的房子契税
// 从 5 万到 15 万不等，差在哪儿此前全站没有一个入口能算。本文件钉四件事：
//
//   ① **计税依据不含增值税**（契税法第四条 + 财税〔2021〕23 号一）：800 万的新房按 9% 分离后
//      计税依据是 7339449.54，契税 1.5% = 110091.74 —— 直接拿 800 万乘 1.5% 是 12 万，多算近一万；
//      反过来，免征增值税的（二手房满两年）成交价格**不扣减**，500 万就是 500 万。
//   ② **个人购买住房的优惠是「套数 × 面积」四格**（财税〔2016〕23 号一）：
//      唯一住房 ≤90㎡ 1% / >90㎡ 1.5%，第二套改善性住房 1% / 2%，第三套及以上回到法定税率；
//      **北上广深暂不实施第二套那一条** —— 同样买 110㎡ 的二套，500 万在长沙是 10 万、在深圳是 15 万。
//      90 平方米这条线**含本数**。
//   ③ **房屋互换按差额**（契税法第四条（二））：是两套房价格的差，不是各算一遍；
//      **法定继承免征**（第六条（五））—— 中介常说的「继承要交 3%」是错的。
//   ④ **印花税只对非住房**：对个人购买住房免征（财税〔2008〕137 号二），
//      商铺、写字楼按产权转移书据 0.5‰ 贴花（300 万的商铺：1376.15 元）。
//
// 口径同源：法定税率幅度、面积线、优惠档落在 tax-constants.js 的 deedTaxRules；
// 价税分离调 vat-quick、印花税调 surtax-stamp-quick —— 本文件只钉「数字」与「接线」，
// 并额外钉住「9% / 5% 与 0.5‰ 确实是从别处引用来的，不是抄第二份」。

const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');          // deedTaxRules
    loadSource('src/js/calculation/tax-registry.js');           // 政策条目 deed-tax
    loadSource('src/js/calculation/vat-quick.js');              // priceSplitOf（价税分离）
    loadSource('src/js/calculation/surtax-stamp-quick.js');     // stampDutyOf（产权转移书据）
    loadSource('src/js/calculation/deed-tax-quick.js');
    loadSource('src/js/calculation/utils.js');
    loadSource('src/js/data/tax-taxonomy.js');
    loadSource('src/js/data/person-taxonomy.js');
    loadSource('src/js/data/tool-taxonomy.js');
    loadSource('src/js/data/tool-registry.js');
    loadSource('src/js/ui/toolbox-ui.js');
    loadSource('src/js/ui/deep-wizard-ui.js');
});

const R = () => window.EuriskoToolRegistry;
const Q = () => window.EuriskoDeedTaxQuick;
const C = () => window.EuriskoTaxConstants;

// 默认形态：买一套 500 万的住房，89 平方米、家庭唯一、免征增值税、当地法定税率 3%
function values(extra) {
    const base = {};
    R().get('deed-tax').fields.forEach((f) => {
        base[f.key] = (f.sample !== undefined ? f.sample : f.default);
    });
    return Object.assign(base, extra || {});
}

function compute(extra) {
    return R().get('deed-tax').compute(values(extra));
}

function row(out, label) {
    const r = out.rows.find((x) => x.label === label);
    return r ? r.value : undefined;
}

function tableOf(out, keyword) {
    const e = out.extras.filter((x) => x.title.indexOf(keyword) >= 0)[0];
    return e ? e.table.rows : [];
}

describe('计税依据：不含增值税，但免征的不扣减', () => {
    // 二手房满两年免征增值税：成交价格不扣减（财税〔2021〕23 号一）
    test('免征增值税：500 万的成交价就是计税依据 500 万', () => {
        const s = Q().stackOf({ usage: 'housing', price: 5000000, vatMode: 'exempt' });
        expect(s.basis.gross).toBe(5000000);
        expect(s.basis.base).toBe(5000000);
        expect(s.basis.vatRate).toBe(0);
        expect(s.basis.vat).toBe(0);
    });

    // 向开发商买新房：一般计税 9%，8000000 ÷ 1.09 = 7339449.541…
    //   契税（首套 >90㎡ 1.5%）= 7339449.54 × 1.5% = 110091.74
    //   直接拿 800 万乘 1.5% 是 120000 —— 多算 9908 元，这就是最容易错的一处
    test('一般计税 9%：800 万合同价 → 计税依据 7339449.54、契税 110091.74（不是 120000）', () => {
        const s = Q().stackOf({
            usage: 'housing', price: 8000000, area: 120, housingSet: 'first',
            vatMode: 'general', statutoryRate: 0.03
        });
        expect(s.basis.vatRate).toBeCloseTo(0.09, 6);
        expect(s.basis.base).toBeCloseTo(7339449.54, 2);
        // 8000000 × 9 ÷ 109 = 660550.46（含税价里分离出去的那一笔）
        expect(s.basis.vat).toBeCloseTo(660550.46, 2);
        expect(s.deedTax.rate).toBeCloseTo(0.015, 6);
        expect(s.deedTax.tax).toBeCloseTo(110091.74, 2);
        expect(s.deedTax.tax).not.toBeCloseTo(120000, 0);
    });

    // 简易计税 5%（老项目等）：3000000 ÷ 1.05 = 2857142.86
    test('简易计税 5%：300 万合同价 → 计税依据 2857142.86', () => {
        const b = Q().basisOf({ price: 3000000, vatMode: 'simple' });
        expect(b.vatRate).toBeCloseTo(0.05, 6);
        expect(b.base).toBeCloseTo(2857142.86, 2);
    });

    // 含税 vs 不含税：同一笔 800 万，差 9908.26 元
    test('含税与不含税的差额：同一套房差 9908.26 元', () => {
        const cmp = Q().vatCompareOf({
            usage: 'housing', price: 8000000, area: 120, housingSet: 'first', vatMode: 'exempt'
        });
        expect(cmp.gap).toBeCloseTo(9908.26, 2);
    });
});

describe('优惠税率：套数 × 面积四格，且只给个人购买住房', () => {
    test('首套 89㎡：1% → 500 万缴 5 万', () => {
        const s = Q().stackOf({ usage: 'housing', price: 5000000, area: 89, housingSet: 'first' });
        expect(s.deedTax.rate).toBeCloseTo(0.01, 6);
        expect(s.deedTax.tax).toBeCloseTo(50000, 2);
    });

    test('首套 91㎡：1.5% → 500 万缴 7.5 万', () => {
        const s = Q().stackOf({ usage: 'housing', price: 5000000, area: 91, housingSet: 'first' });
        expect(s.deedTax.rate).toBeCloseTo(0.015, 6);
        expect(s.deedTax.tax).toBeCloseTo(75000, 2);
    });

    test('二套 89㎡：1%（与首套同档）', () => {
        const s = Q().stackOf({ usage: 'housing', price: 5000000, area: 89, housingSet: 'second' });
        expect(s.deedTax.rate).toBeCloseTo(0.01, 6);
    });

    test('二套 110㎡：2% → 500 万缴 10 万', () => {
        const s = Q().stackOf({ usage: 'housing', price: 5000000, area: 110, housingSet: 'second' });
        expect(s.deedTax.rate).toBeCloseTo(0.02, 6);
        expect(s.deedTax.tax).toBeCloseTo(100000, 2);
    });

    // 北上广深暂不实施第二套改善性住房这一条（财税〔2016〕23 号一（二））
    test('同样是二套 110㎡：北上广深按法定 3% 缴 15 万，比其他城市多 5 万', () => {
        const other = Q().stackOf({ usage: 'housing', price: 5000000, area: 110, housingSet: 'second', city: 'other' });
        const big4 = Q().stackOf({ usage: 'housing', price: 5000000, area: 110, housingSet: 'second', city: 'big4' });
        expect(other.deedTax.tax).toBeCloseTo(100000, 2);
        expect(big4.deedTax.rate).toBeCloseTo(0.03, 6);
        expect(big4.deedTax.tax).toBeCloseTo(150000, 2);
        expect(big4.deedTax.preferential).toBe(false);
    });

    test('三套及以上：回到法定税率 3% → 15 万', () => {
        const s = Q().stackOf({ usage: 'housing', price: 5000000, area: 110, housingSet: 'third' });
        expect(s.deedTax.rate).toBeCloseTo(0.03, 6);
        expect(s.deedTax.tax).toBeCloseTo(150000, 2);
        expect(s.deedTax.preferential).toBe(false);
    });

    test('企业买房不适用优惠：同样 89㎡ 首套口径也按法定 3%', () => {
        const s = Q().stackOf({ usage: 'housing', price: 5000000, area: 89, buyer: 'company' });
        expect(s.deedTax.rate).toBeCloseTo(0.03, 6);
        expect(s.deedTax.tax).toBeCloseTo(150000, 2);
    });

    test('非住房（商铺）不适用优惠：按法定 3%', () => {
        const s = Q().stackOf({ usage: 'nonHousing', price: 5000000, vatMode: 'exempt' });
        expect(s.deedTax.rate).toBeCloseTo(0.03, 6);
        expect(s.deedTax.tax).toBeCloseTo(150000, 2);
    });

    test('法定税率是幅度不是定数：当地 4% 时第三套按 4%', () => {
        const s = Q().stackOf({ usage: 'housing', price: 5000000, housingSet: 'third', statutoryRate: 0.04 });
        expect(s.deedTax.rate).toBeCloseTo(0.04, 6);
        expect(s.deedTax.tax).toBeCloseTo(200000, 2);
    });
});

describe('90 平方米那条线含本数：差一平方米跳一档', () => {
    test('90㎡ 按 1%，91㎡ 按 1.5%', () => {
        expect(Q().rateOf({ usage: 'housing', area: 90, housingSet: 'first' }).rate).toBeCloseTo(0.01, 6);
        expect(Q().rateOf({ usage: 'housing', area: 91, housingSet: 'first' }).rate).toBeCloseTo(0.015, 6);
    });

    test('500 万的房子：90 与 91 平方米差 2.5 万', () => {
        const cmp = Q().areaCompareOf({ usage: 'housing', price: 5000000, housingSet: 'first', area: 90 });
        expect(cmp.limit).toBe(90);
        expect(cmp.small.deedTax.tax).toBeCloseTo(50000, 2);
        expect(cmp.large.deedTax.tax).toBeCloseTo(75000, 2);
        expect(cmp.gap).toBeCloseTo(25000, 2);
    });

    test('首套 / 二套 / 三套：500 万是 5 万 → 7.5 万 → 15 万三级跳', () => {
        const cmp = Q().setCompareOf({ usage: 'housing', price: 5000000, area: 110, housingSet: 'first' });
        expect(cmp.first.deedTax.tax).toBeCloseTo(75000, 2);
        expect(cmp.second.deedTax.tax).toBeCloseTo(100000, 2);
        expect(cmp.third.deedTax.tax).toBeCloseTo(150000, 2);
        expect(cmp.gapThirdVsFirst).toBeCloseTo(75000, 2);
    });
});

describe('互换按差额、法定继承免征', () => {
    // 契税法第四条（二）：土地使用权互换、房屋互换，为所互换的土地使用权、房屋价格的差额
    test('500 万换 350 万：按差额 150 万计税 → 4.5 万（不是各自全额相加的 27 万）', () => {
        const s = Q().stackOf({ scene: 'swap', usage: 'housing', price: 5000000, swapPrice: 3500000 });
        expect(s.basis.gross).toBe(1500000);
        // 互换不适用「购买住房」的优惠档，按法定税率
        expect(s.deedTax.rate).toBeCloseTo(0.03, 6);
        expect(s.deedTax.tax).toBeCloseTo(45000, 2);
    });

    test('两套房价格相等：差额为 0，契税为 0', () => {
        const s = Q().stackOf({ scene: 'swap', usage: 'housing', price: 5000000, swapPrice: 5000000 });
        expect(s.basis.gross).toBe(0);
        expect(s.deedTax.tax).toBe(0);
    });

    // 契税法第六条（五）：法定继承人通过继承承受土地、房屋权属的免征
    test('法定继承：免征契税（中介常说的「继承要交 3%」是错的）', () => {
        const s = Q().stackOf({ scene: 'inherit', usage: 'housing', price: 5000000 });
        expect(s.deedTax.exempt).toBe(true);
        expect(s.deedTax.tax).toBe(0);
        expect(s.deedTax.rate).toBe(0);
    });
});

describe('印花税：住房免征、非住房按产权转移书据贴花', () => {
    test('个人购买住房：免征印花税（财税〔2008〕137 号二）', () => {
        const s = Q().stackOf({ usage: 'housing', price: 5000000 });
        expect(s.stamp.exempt).toBe(true);
        expect(s.stamp.tax).toBe(0);
    });

    // 商铺 300 万、一般计税 9%：
    //   计税依据 2752293.58 → 契税 3% = 82568.81
    //   印花税：计税金额扣掉增值税后 2752293.58 × 0.5‰ = 1376.15
    test('商铺 300 万（9% 分离）：契税 82568.81 + 印花税 1376.15 = 83944.96', () => {
        const s = Q().stackOf({
            usage: 'nonHousing', price: 3000000, vatMode: 'general', statutoryRate: 0.03, halve: false
        });
        expect(s.deedTax.tax).toBeCloseTo(82568.81, 2);
        expect(s.stamp.tax).toBeCloseTo(1376.15, 2);
        expect(s.total).toBeCloseTo(83944.96, 2);
    });

    test('商铺减半（财税〔2023〕12 号）：印花税 688.07', () => {
        const s = Q().stackOf({
            usage: 'nonHousing', price: 3000000, vatMode: 'general', halve: true
        });
        expect(s.stamp.tax).toBeCloseTo(688.07, 2);
    });
});

describe('接线：一屏总额、三张对照表、三段推导链', () => {
    test('主结果是契税与印花税的合计，不是契税一个数', () => {
        const out = compute({ usage: 'nonHousing', price: 3000000, vatMode: 'general' });
        expect(out.primary.label).toContain('契税');
        expect(out.primary.value).toBeCloseTo(83944.96, 2);
        expect(row(out, '契税')).toBeCloseTo(82568.81, 2);
        expect(row(out, '印花税（产权转移书据）')).toBeCloseTo(1376.15, 2);
    });

    test('结果行含计税依据：让「按哪个数算的」看得见', () => {
        const out = compute({ price: 5000000, vatMode: 'exempt' });
        expect(row(out, '契税计税依据（不含增值税）')).toBe(5000000);
        expect(row(out, '成交价格（合同金额）')).toBe(5000000);
    });

    test('三张对照表：套数、90 平方米那条线、含不含增值税', () => {
        const out = compute({ price: 5000000, area: 110 });
        expect(tableOf(out, '家庭第几套').length).toBe(3);
        expect(tableOf(out, '90 平方米').length).toBe(2);
        expect(tableOf(out, '含不含增值税').length).toBe(2);
    });

    test('推导链三段：计税依据 → 税率怎么定 → 印花税与合计', () => {
        const out = compute({ price: 5000000 });
        expect(out.steps.length).toBe(3);
        expect(out.steps[0].title).toContain('计税依据');
        expect(out.steps[1].title).toContain('适用税率');
        expect(out.steps[2].title).toContain('印花税');
    });

    test('政策条目已登记：deed-tax 有文号可查', () => {
        const reg = window.EuriskoTaxRegistry || null;
        const p = reg && typeof reg.get === 'function' ? reg.get('deed-tax') : null;
        expect(R().get('deed-tax').policyKey).toBe('deed-tax');
        if (p) {
            expect(p.basis.length).toBeGreaterThanOrEqual(5);
            expect(p.basis.map((x) => x.title).join('')).toContain('契税法');
        }
    });
});

describe('口径同源：税率与金额确实来自别处，不是抄第二份', () => {
    test('一般计税 9% 引自 vatRules（销售不动产那一档）', () => {
        expect(Q().vatRateOf({ vatMode: 'general' })).toBe(C().vatRules.general.rates[1].rate);
        expect(Q().vatRateOf({ vatMode: 'general' })).toBeCloseTo(0.09, 6);
    });

    test('简易计税 5% 引自 vatRules 的不动产征收率', () => {
        expect(Q().vatRateOf({ vatMode: 'simple' })).toBe(C().vatRules.smallScale.levyRates[1].rate);
    });

    test('产权转移书据的税率在 stampDutyRules，deedTaxRules 只记税目 key', () => {
        const r = C().deedTaxRules.stamp;
        expect(r.itemKey).toBe('propertyTransfer');
        const item = C().stampDutyRules.items.filter((x) => x.key === r.itemKey)[0];
        expect(item).toBeTruthy();
        expect(item.rate).toBeCloseTo(0.0005, 6);
        // 改上游而这里没跟着变 → 下面这条会红
        expect(C().deedTaxRules.stamp.itemKey).toBe('propertyTransfer');
    });

    test('90 平方米那条线与优惠档都在 deedTaxRules，内核不含硬编码数字', () => {
        expect(C().deedTaxRules.housing.areaLimit).toBe(90);
        expect(C().deedTaxRules.housing.first.small).toBeCloseTo(0.01, 6);
        expect(C().deedTaxRules.housing.first.large).toBeCloseTo(0.015, 6);
        expect(C().deedTaxRules.housing.second.large).toBeCloseTo(0.02, 6);
        expect(C().deedTaxRules.statutory.min).toBeCloseTo(0.03, 6);
        expect(C().deedTaxRules.statutory.max).toBeCloseTo(0.05, 6);
    });
});

describe('挂载：买房是跨格子事项，契税那一格在 B 分支', () => {
    const T = () => window.EuriskoToolTaxonomy;

    test('主挂 A / E16 买房，次挂 B / C3 契税', () => {
        const m = T().get('deed-tax');
        expect(m.branch).toBe('A');
        expect(m.primary).toBe('cross/E16');
        expect(m.secondary).toContain('B/C3');
        expect(m.taxCode).toBe('deed');
    });

    test('E16 事件不再是无工具的空行', () => {
        const ev = window.EuriskoPersonTaxonomy.events();
        const e = ev.filter((x) => x.id === 'E16')[0];
        expect(e.tools).toContain('deed-tax');
    });

    test('入口数由分类统计得出：43 个入口、A 32 / B 11', () => {
        expect(T().all().length).toBe(43);
        expect(T().countByBranch('A')).toBe(32);
        expect(T().countByBranch('B')).toBe(11);
        expect(T().validate().length).toBe(0);
    });
});
