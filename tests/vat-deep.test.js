// 增值税完整测算（阶段17 17C-1 纵深，v1.58.0）的回归网
//
// 17C-1 在 v1.48.0 交付的是「铺齐」—— vat-deep 当时只有元数据，字段与计算**共享 vat 速算器**，
// 于是「完整测算」= 速算器那一屏。这一版做的是**纵向做深**，守护四件速算器做不到的事：
//
//   ① **凭证闸门**：速算器只收一个标量 `inputTax`「当期进项税额」，于是「这笔进项能不能抵」
//      被推给了用户。而增值税普通发票、收据、白条**根本不是扣税凭证** —— 最常见的一笔「以为能抵」。
//   ② **用途闸门**：拿到专票也不一定可抵。用于免征 / 简易计税项目、集体福利与个人消费、
//      餐饮 / 居民日常 / 娱乐 / 贷款服务、非正常损失的进项一律不得抵扣。
//   ③ **共同进项分摊转出**：房租、水电、办公用品这类**分不清用途**的进项，按免税与简易项目
//      销售额占比摊转出（财税〔2016〕36 号附件1 第二十九条公式）—— 一个框表达不出这条公式。
//   ④ **一般计税 vs 简易计税不是自由选择题**：只有法定情形才可以选，且**一经选择 36 个月内
//      不得变更**。即便能选，也只有进项占比高于**临界增值率**（= 税率 − 征收率：13% → 10%、
//      9% → 6%、**6% → 仅 3%**）时一般计税才更省。
//
// 另两层：**小规模 vs 一般纳税人的身份临界增值率**（登记后**原则上不可逆**，必须在登记前算）；
// **附加税跟着实缴增值税走**（市区合计 12%），所以两种计税方法的差额要 ×1.12 才是真实现金流差额。
//
// 口径仍同源：价税分离、免征判定、销项进项一律走 `EuriskoVatQuick`；附加税走
// `EuriskoSurtaxStampQuick`（税率取 surtaxRules）；两道闸门的名单取 `vatRules.inputRules`。

const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/tax-registry.js');   // vat-quick 在加载那一刻就抓 registry
    loadSource('src/js/calculation/vat-quick.js');
    loadSource('src/js/calculation/surtax-stamp-quick.js');
    loadSource('src/js/calculation/utils.js');
    loadSource('src/js/data/tool-registry.js');
    loadSource('src/js/ui/toolbox-ui.js');
    loadSource('src/js/ui/deep-wizard-ui.js');
});

const R = () => window.EuriskoToolRegistry;
const W = () => window.EuriskoDeepWizard;
const Q = () => window.EuriskoVatQuick;
// 注：surtax-stamp-quick.js 导出的名字是 EuriskoSurtaxQuick（不带 stamp）
const SU = () => window.EuriskoSurtaxQuick;

function compute(values) {
    return R().get('vat-deep').compute(Object.assign({
        taxpayer: 'general',
        rate: 0.13,
        simplifiedCase: 'none',
        sales: 1130000,
        taxIncluded: false,
        period: 'quarter',
        specialInvoice: 0,
        exemptSales: 0,
        simplifiedSales: 0,
        inputs: [
            { voucher: 'special', usage: 'business', amount: 80000 },
            { voucher: 'normal', usage: 'business', amount: 12000 },
            { voucher: 'special', usage: 'service', amount: 15000 },
            { voucher: 'special', usage: 'welfare', amount: 8000 }
        ],
        unallocatedInput: 12000,
        annualSales: 4800000,
        location: 'urban',
        halve: true
    }, values || {}));
}

function row(out, label) {
    const r = out.rows.find((x) => x.label === label);
    return r ? r.value : undefined;
}

describe('与速算器同源：核定后的数传给 quick，逐点相等', () => {
    test('一般纳税人：一笔 8000 的合规进项 ≡ generalOf 直达', () => {
        const out = compute({
            sales: 113000, taxIncluded: true, rate: 0.13,
            inputs: [{ voucher: 'special', usage: 'business', amount: 8000 }],
            unallocatedInput: 0, exemptSales: 0, simplifiedSales: 0
        });
        const quick = Q().generalOf({ output: 113000, input: 8000, rate: 0.13, taxIncluded: true });
        expect(quick.exclusive).toBeCloseTo(100000, 6);   // 113000 / 1.13 有浮点尾数
        expect(quick.tax).toBeCloseTo(5000, 6);

        expect(row(out, '不含税销售额')).toBe(quick.exclusive);   // 价外税必须先分离
        expect(row(out, '销项税额')).toBe(quick.outputTax);
        expect(row(out, '核定可抵的进项税额')).toBe(8000);
        expect(out.primary.value).toBe(quick.tax);
        expect(row(out, '留抵税额（结转下期）')).toBe(quick.credit);
    });

    test('小规模：免征判定与计税一律问 quick', () => {
        const under = compute({ taxpayer: 'small', sales: 280000, period: 'quarter', taxIncluded: false });
        const over = compute({ taxpayer: 'small', sales: 310000, period: 'quarter', taxIncluded: false });
        const q1 = Q().smallScaleOf({ sales: 280000, period: 'quarter', taxIncluded: false, specialInvoice: 0 });
        const q2 = Q().smallScaleOf({ sales: 310000, period: 'quarter', taxIncluded: false, specialInvoice: 0 });
        expect(q1.exempt).toBe(true);
        expect(q2.exempt).toBe(false);
        expect(under.primary.value).toBe(q1.tax);
        expect(over.primary.value).toBe(q2.tax);
        expect(row(over, '不含税销售额')).toBe(q2.exclusive);
    });

    test('两道闸门的名单与「能不能抵」一律取自常量，不复制文案', () => {
        const rules = Q().rules();
        const vouchers = rules.inputRules.vouchers;
        const usages = rules.inputRules.usages;
        expect(vouchers.map((x) => x.ok)).toEqual([true, true, true, true, false, false]);
        expect(usages.map((x) => x.ok)).toEqual([true, false, false, false, false]);
        // deep 的 select options 就是从这里生成的
        const opt = R().get('vat-deep').fields.find((f) => f.key === 'inputs')
            .itemFields.find((f) => f.key === 'voucher').options;
        expect(opt.map((o) => o.label)).toEqual(vouchers.map((x) => x.label));
    });
});

describe('凭证闸门：普票不是扣税凭证', () => {
    test('1.2 万普票 → 核定可抵 0；进项多、税也多', () => {
        const out = compute({
            sales: 1130000, taxIncluded: false, rate: 0.13,
            inputs: [{ voucher: 'normal', usage: 'business', amount: 12000 }],
            unallocatedInput: 0
        });
        expect(row(out, '填进来的进项税额合计')).toBe(12000);
        expect(row(out, '核定可抵的进项税额')).toBe(0);
        expect(row(out, '核减：凭证不合规')).toBe(12000);
        expect(out.extras[0].table.rows[0][3]).toContain('普票不是扣税凭证');
    });

    test('同样的 1.2 万换成专票 → 全额可抵，一年差 12000 元税', () => {
        const normal = compute({
            inputs: [{ voucher: 'normal', usage: 'business', amount: 12000 }], unallocatedInput: 0
        });
        const special = compute({
            inputs: [{ voucher: 'special', usage: 'business', amount: 12000 }], unallocatedInput: 0
        });
        expect(special.primary.value - normal.primary.value).toBe(-12000);
        expect(special.primary.value).toBe(146900 - 12000);
        expect(normal.primary.value).toBe(146900);
    });
});

describe('用途闸门：拿到专票也不一定可抵', () => {
    test('四类不得抵扣的用途，专票也不行', () => {
        ['exempt', 'welfare', 'service', 'loss'].forEach((usage) => {
            const out = compute({
                sales: 1130000, taxIncluded: false, rate: 0.13,
                inputs: [{ voucher: 'special', usage: usage, amount: 20000 }],
                unallocatedInput: 0
            });
            expect(row(out, '核定可抵的进项税额')).toBe(0);
            expect(row(out, '核减：用途不得抵扣')).toBe(20000);
            expect(row(out, '核减：凭证不合规')).toBe(0);
        });
    });

    test('凭证不合规优先于用途：普票 + 免税项目只记一次核减', () => {
        const out = compute({
            inputs: [{ voucher: 'normal', usage: 'exempt', amount: 5000 }], unallocatedInput: 0
        });
        expect(row(out, '核减：凭证不合规')).toBe(5000);
        expect(row(out, '核减：用途不得抵扣')).toBe(0);
    });
});

describe('共同进项分摊转出（法定第二十九条公式）', () => {
    test('销售额 100 万、免税项目 25 万、共同进项 8000 → 分摊转出 2000', () => {
        const out = compute({
            sales: 1000000, taxIncluded: false, rate: 0.13,
            exemptSales: 250000, simplifiedSales: 0,
            inputs: [], unallocatedInput: 8000
        });
        // 8000 × (250000 + 0) / 1000000 = 2000
        expect(row(out, '核减：共同进项分摊转出')).toBe(2000);
        expect(row(out, '核定可抵的进项税额')).toBe(6000);
        // 销项只按一般计税部分算：75 万 × 13% = 97500
        expect(row(out, '销项税额')).toBe(97500);
        expect(out.primary.value).toBe(91500);
    });

    test('没有免税 / 简易项目时，共同进项全额可抵、不转出', () => {
        const out = compute({
            sales: 1000000, taxIncluded: false, rate: 0.13,
            exemptSales: 0, simplifiedSales: 0, inputs: [], unallocatedInput: 8000
        });
        expect(row(out, '核减：共同进项分摊转出')).toBe(0);
        expect(row(out, '核定可抵的进项税额')).toBe(8000);
    });
});

describe('速算器口径会少算税', () => {
    test('默认场景：填进来 12.7 万进项，核定可抵 9.2 万 → 少算 35000', () => {
        const out = compute();
        expect(row(out, '填进来的进项税额合计')).toBe(127000);
        expect(row(out, '核定可抵的进项税额')).toBe(92000);
        expect(row(out, '核减：凭证不合规')).toBe(12000);
        expect(row(out, '核减：用途不得抵扣')).toBe(23000);
        expect(row(out, '销项税额')).toBe(146900);
        expect(out.primary.value).toBe(54900);
        expect(out.note).toContain('少算税 35000');
    });
});

describe('一般计税 vs 简易计税：临界增值率', () => {
    test('临界增值率 = 税率 − 征收率：13% → 10%、9% → 6%、6% → 3%', () => {
        const base = { sales: 1000000, taxIncluded: false, inputs: [], unallocatedInput: 0 };
        expect(row(compute(Object.assign({}, base, { rate: 0.13 })), '临界增值率（进项 ÷ 销售额）')).toBeCloseTo(0.10, 10);
        expect(row(compute(Object.assign({}, base, { rate: 0.09 })), '临界增值率（进项 ÷ 销售额）')).toBeCloseTo(0.06, 10);
        // 反直觉的一条：6% 的现代服务业，进项占比只要低于 3% 就该走简易
        expect(row(compute(Object.assign({}, base, { rate: 0.06 })), '临界增值率（进项 ÷ 销售额）')).toBeCloseTo(0.03, 10);
    });

    test('结论与临界点一致：进项占比低于临界 → 简易更省，反之一般计税更省', () => {
        const mk = (ratio) => compute({
            sales: 1000000, taxIncluded: false, rate: 0.13,
            inputs: [{ voucher: 'special', usage: 'business', amount: 1000000 * ratio }],
            unallocatedInput: 0
        });
        // 临界 10%：低于它
        expect(row(mk(0.05), '计税方法结论')).toContain('简易计税更省');
        expect(mk(0.05).primary.value).toBe(130000 - 50000);          // 8 万
        expect(row(mk(0.05), '若全部走简易计税（3%）')).toBe(30000);
        // 高于它
        expect(row(mk(0.20), '计税方法结论')).toContain('一般计税更省');
        expect(mk(0.20).primary.value).toBe(0);           // 进项 20 万 > 销项 13 万，留抵 7 万
        expect(row(mk(0.20), '当前进项占比')).toBeCloseTo(0.20, 10);
    });

    test('6% 服务业：进项占比 2%（房租 + 差旅）时简易省一半以上', () => {
        const out = compute({
            sales: 1000000, taxIncluded: false, rate: 0.06,
            inputs: [{ voucher: 'special', usage: 'business', amount: 20000 }],
            unallocatedInput: 0
        });
        expect(out.primary.value).toBe(60000 - 20000);       // 一般计税 4 万
        expect(row(out, '若全部走简易计税（3%）')).toBe(30000);
        expect(row(out, '计税方法结论')).toContain('简易计税更省');
    });
});

describe('简易计税不是自由选择题', () => {
    test('不符合法定情形 → 只给对照、结论标「不可选」', () => {
        const out = compute({ simplifiedCase: 'none' });
        expect(row(out, '计税方法结论')).toContain('不可选');
        expect(row(out, '若全部走简易计税（3%）').valueOf()).toBe(33900);
        const hint = out.rows.find((x) => x.label.indexOf('若全部走简易计税') === 0).hint;
        expect(hint).toContain('不符合法定简易情形');
    });

    test('符合法定情形（建筑老项目 3%）→ 结论可选，且提醒 36 个月锁定期', () => {
        const out = compute({ simplifiedCase: 'construction' });
        expect(row(out, '计税方法结论')).not.toContain('不可选');
        expect(row(out, '若全部走简易计税（3%）')).toBe(33900);
        const hint = out.rows.find((x) => x.label.indexOf('若全部走简易计税') === 0).hint;
        expect(hint).toContain('36 个月');
    });

    test('不同法定情形的征收率不同：不动产 / 劳务派遣是 5%', () => {
        const re = compute({ simplifiedCase: 'realestate' });
        expect(row(re, '若全部走简易计税（5%）')).toBe(56500);
        const labor = compute({ simplifiedCase: 'labor' });
        expect(row(labor, '若全部走简易计税（5%）')).toBe(56500);
    });
});

describe('身份临界与 500 万强制登记', () => {
    test('身份临界增值率 = 税率 − 现行 1%：13% → 12%', () => {
        const out = compute();
        // 同一笔业务：小规模 11300 vs 一般纳税人 54900 —— 进项占比 8.14% 低于 12%
        expect(out.note).toContain('临界增值率 12%');
        expect(out.note).toContain('小规模更省');
        expect(row(out, '年累计销售额')).toBe(4800000);
        expect(row(out, '小规模纳税人标准')).toBe(5000000);
    });

    test('超过 500 万 → 强制登记；登记后原则上不可逆', () => {
        const out = compute({ annualSales: 5200000 });
        expect(out.rows.find((x) => x.label === '小规模纳税人标准').hint).toContain('须强制登记为一般纳税人');
        expect(out.note).toContain('强制登记');
    });
});

describe('附加税跟着实缴增值税走', () => {
    test('市区 12%、减半后 6%：54900 × 6% = 3294', () => {
        const out = compute();
        const quick = SU().surtaxOf({ vat: 54900, consumption: 0, location: 'urban', halve: true });
        expect(quick.total).toBe(3294);
        expect(row(out, '随增值税附征（城建 + 教育费附加 + 地方教育附加）')).toBe(quick.total);
        expect(row(out, '增值税与附加合计')).toBe(54900 + 3294);
    });

    test('不减半时翻倍；县城档是 10%', () => {
        const full = compute({ halve: false });
        expect(row(full, '随增值税附征（城建 + 教育费附加 + 地方教育附加）')).toBe(6588);
        const county = compute({ location: 'county', halve: false });
        expect(row(county, '随增值税附征（城建 + 教育费附加 + 地方教育附加）'))
            .toBe(SU().surtaxOf({ vat: 54900, consumption: 0, location: 'county', halve: false }).total);
    });

    test('附加税构成明细里三档都在', () => {
        const t = compute().extras.find((x) => x.title.indexOf('随增值税附征') === 0);
        expect(t.table.rows.map((r) => r[0]).join('|')).toContain('城市维护建设税');
        expect(t.table.rows.map((r) => r[0]).join('|')).toContain('教育费附加');
        expect(t.table.rows.map((r) => r[0]).join('|')).toContain('地方教育附加');
    });
});

describe('小规模季 30 万是临界点不是起征点', () => {
    test('30 万 → 0；30.01 万 → 全额 3001', () => {
        const at = compute({ taxpayer: 'small', sales: 300000, period: 'quarter', taxIncluded: false });
        const over = compute({ taxpayer: 'small', sales: 300100, period: 'quarter', taxIncluded: false });
        expect(at.primary.value).toBe(0);
        expect(over.primary.value).toBeCloseTo(3001, 6);   // 全额按 1% 计税，不是只对超出的 1000 元
        // 免征额度内也要提醒：再超 1 分钱就全额计税
        expect(at.note).toContain('临界点附近');
        expect(row(at, '临界提示：再超 1 分即全额计税')).toBeCloseTo(3000.0001, 6);
    });

    test('免征只覆盖普票：开 5 万专票照缴', () => {
        const out = compute({
            taxpayer: 'small', sales: 280000, period: 'quarter', taxIncluded: false, specialInvoice: 50000
        });
        expect(Q().smallScaleOf({ sales: 280000, period: 'quarter', taxIncluded: false, specialInvoice: 50000 }).tax)
            .toBe(500);
        expect(out.primary.value).toBe(500);
    });
});

describe('走向导：由 spec 驱动', () => {
    beforeEach(() => {
        localStorage.clear();
        window.showPage = jest.fn();
        document.body.innerHTML = '<div id="deep-wizard-page" class="page hidden"></div>';
    });

    test('被通用向导接管：身份 → 销售额 → 进项 → 对照 + 结果', () => {
        const tool = R().get('vat-deep');
        expect(W().has(tool)).toBe(true);
        expect(tool.pageId).toBeUndefined();
        expect(W().stepsOf(tool).map((s) => s.title))
            .toEqual(['纳税人身份与计税方法', '本期销售额', '进项逐笔核定', '计税方法对照与附加税', '计算结果']);
    });

    test('自带 spec，不再与速算器共享 —— 共享 spec 的 5 个里没有它了', () => {
        const deep = R().get('vat-deep');
        const quick = R().get('vat');
        expect(deep.compute).not.toBe(quick.compute);
        expect(deep.fields).not.toBe(quick.fields);
        expect(deep.fields.map((f) => f.key)).toEqual([
            'taxpayer', 'rate', 'simplifiedCase',
            'sales', 'taxIncluded', 'period', 'specialInvoice', 'exemptSales', 'simplifiedSales',
            'inputs', 'unallocatedInput',
            'annualSales', 'location', 'halve'
        ]);
        expect(deep.steps).toHaveLength(4);
        expect(deep.policyKey).toBe('vat-small-scale');
    });

    test('走完向导：主结果、进项核定明细、免责声明、结果归属都在', () => {
        W().open('vat-deep', { fresh: true });
        for (let i = 0; i < 10; i++) {
            const next = document.getElementById('dw-next');
            if (!next) break;
            next.click();
            if (document.getElementById('dw-result-card')) break;
        }
        expect(document.getElementById('dw-result-primary')).toBeTruthy();
        expect(document.querySelector('.result-disclaimer').textContent).toContain('不构成税务建议');

        const card = document.getElementById('dw-result-card');
        expect(card.textContent).toContain('进项逐笔核定明细');
        expect(card.getAttribute('data-tool-id')).toBe('vat-deep');
    });

    test('条件字段：身份决定哪些字段有意义', () => {
        W().open('vat-deep', { fresh: true });
        expect(document.getElementById('qf-rate')).toBeTruthy();      // 默认一般纳税人

        document.getElementById('qf-taxpayer').value = 'small';
        document.getElementById('qf-taxpayer').dispatchEvent(new Event('change'));
        expect(document.getElementById('qf-rate')).toBeNull();        // 小规模没有「适用税率」这回事

        document.getElementById('dw-next').click();                    // → 本期销售额
        expect(document.getElementById('qf-period')).toBeTruthy();     // 纳税期只对小规模有意义
        expect(document.getElementById('qf-exemptSales')).toBeNull();  // 免征项目只对一般纳税人有意义
    });
});
