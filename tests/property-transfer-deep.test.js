// 个人转让房屋 17D-12 纵深（v1.68.0）的回归网
//
// 卖房的税既不是「一个月薪」也不是「一笔劳务」，而是《个人所得税法》第二条里单独一档的
// **财产转让所得**（20% 比例税率）—— 20 个速算器里没有一个能收它（与 donation 同款处境）。
// 速算器那套「收入 − 扣除 → 按表算」的框架在这里会直接把「售价」当「所得」，而最贵的五层
// 它一层都没碰：
//
//   ① 应纳税所得额 = 转让收入 − 房屋原值 − 转让过程中缴纳的税金 − 合理费用
//      （国税发〔2006〕108 号一）；装修费有**原值比例上限**（商品房及其他住房 10%、
//      已购公有住房 / 经济适用房 15%）—— 原值 200 万、装修发票 30 万只能扣 20 万，多缴 2 万；
//   ② **核定 1%~3% 不是可选项**：有原值凭证必须查账，只有凭证不全才核定
//      （售价 500 万 / 原值 100 万：查账 80 万 vs 核定 5 万，差 **75 万**）；
//   ③ **满五唯一**免征（财税字〔1999〕278 号四）：「唯一」是**同一省 / 自治区 / 直辖市范围内**
//      夫妻唯一一套（不是全国唯一、也不是同城唯一），自用年限按产权证与契税完税凭证**孰先**；
//   ④ **受赠 / 继承**的房屋再转让，原值是**原捐赠人 / 被继承人**的取得成本
//      （财税〔2009〕78 号五）：父亲 60 万买的房受赠后卖 500 万 → 88 万，误按评估价算差 **68 万**；
//   ⑤ **换购退税**退的是**已缴**个税（财政部 税务总局 住房城乡建设部公告 2026 年第 3 号，
//      至 2027-12-31），按新购 ÷ 转让金额的比例退 —— 满五唯一（已缴 0）退不到钱。
//
// 口径同源：全部公式落在 property-transfer-quick.js，税率 / 装修费上限 / 免征年限 / 退税口径
// 读注册表声明的 propertyTransferRules —— 本文件只钉「数字」与「接线」。

const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');          // propertyTransferRules
    loadSource('src/js/calculation/tax-registry.js');
    loadSource('src/js/calculation/property-transfer-quick.js');
    loadSource('src/js/calculation/utils.js');
    loadSource('src/js/data/tool-registry.js');
    loadSource('src/js/ui/toolbox-ui.js');
    loadSource('src/js/ui/deep-wizard-ui.js');
});

const R = () => window.EuriskoToolRegistry;
const W = () => window.EuriskoDeepWizard;
const Q = () => window.EuriskoPropertyTransferQuick;

// 默认形态：住房 500 万卖出、原值 300 万、装修发票 30 万（正好 10% 上限）、其他费用 2 万，
// 持有 6 年但**非**家庭唯一，卖后 1 年内在同城买了 400 万
function values(extra) {
    const base = {};
    R().get('property-transfer').fields.forEach((f) => { base[f.key] = f.default; });
    return Object.assign(base, extra || {});
}

function compute(extra) {
    return R().get('property-transfer').compute(values(extra));
}

function row(out, label) {
    const r = out.rows.find((x) => x.label === label);
    return r ? r.value : undefined;
}

function tableOf(out, keyword) {
    const e = out.extras.filter((x) => x.title.indexOf(keyword) >= 0)[0];
    return e ? e.table.rows : [];
}

describe('应纳税所得额：不是「售价 − 买价」的俗称', () => {
    test('默认形态：500 − 300 − 30 − 2 = 168 万，20% → 33.6 万', () => {
        const s = Q().stackOf(values());
        expect(s.taxable).toBeCloseTo(1680000, 6);
        expect(s.taxBeforeExempt).toBeCloseTo(336000, 6);
        expect(compute().primary.value).toBeCloseTo(336000, 6);
    });

    test('装修费有原值比例上限：商品房 10%（原值 200 万、发票 30 万 → 只能扣 20 万，多缴 2 万）', () => {
        const s = Q().stackOf(values({ originalValue: 2000000, decoration: 300000, otherFees: 0 }));
        expect(s.decoration.capRatio).toBeCloseTo(0.1, 6);
        expect(s.decoration.allowed).toBeCloseTo(200000, 6);
        expect(s.decoration.disallowed).toBeCloseTo(100000, 6);
        // 全额可扣时是 (500 − 200 − 30) × 20% = 54 万；受上限约束后是 (500 − 200 − 20) × 20% = 56 万
        expect(s.taxBeforeExempt).toBeCloseTo(560000, 6);
        expect(s.taxBeforeExempt - 540000).toBeCloseTo(20000, 6);
    });

    test('已购公有住房 / 经济适用房按 15%：同样 30 万发票可以全额扣', () => {
        const s = Q().stackOf(values({ originalValue: 2000000, houseType: 'public', decoration: 300000 }));
        expect(s.decoration.capRatio).toBeCloseTo(0.15, 6);
        expect(s.decoration.allowed).toBeCloseTo(300000, 6);
        expect(s.decoration.disallowed).toBeCloseTo(0, 6);
    });

    test('转让过程中缴纳的税金与贷款利息都进「减除」', () => {
        const s = Q().stackOf(values({ vatAndSurcharge: 100000, loanInterest: 50000 }));
        expect(s.taxable).toBeCloseTo(5000000 - 3000000 - 300000 - 20000 - 100000 - 50000, 6);
    });

    test('非住房不适用住房装修费的比例上限', () => {
        const s = Q().stackOf(values({ usage: 'nonresidence', originalValue: 2000000, decoration: 300000 }));
        expect(s.decoration.capRatio).toBeNull();
        expect(s.decoration.allowed).toBeCloseTo(300000, 6);
    });
});

describe('核定征收不是可选项', () => {
    test('默认（有原值凭证）走查账，核定 1% 只是对照', () => {
        const s = Q().stackOf(values());
        expect(s.method).toBe('verify');
        expect(s.assessTax).toBeCloseTo(50000, 6);
        expect(s.taxBeforeExempt - s.assessTax).toBeCloseTo(286000, 6);   // 28.6 万
    });

    test('原值凭证不全 → 核定：500 万 × 1% = 5 万，装修费等扣除项不再看', () => {
        const s = Q().stackOf(values({ hasValueProof: false, decoration: 300000 }));
        expect(s.method).toBe('assess');
        expect(s.tax).toBeCloseTo(50000, 6);
        expect(compute({ hasValueProof: false }).primary.value).toBeCloseTo(50000, 6);
    });

    test('核定征收率按省局口径可改（2% → 10 万）', () => {
        const s = Q().stackOf(values({ hasValueProof: false, assessRate: 2 }));
        expect(s.assessRate).toBeCloseTo(0.02, 6);
        expect(s.tax).toBeCloseTo(100000, 6);
    });

    test('差额大的那批人最想选核定、也最没有选择权：查账 80 万 vs 核定 5 万，差 75 万', () => {
        const s = Q().stackOf(values({ originalValue: 1000000, decoration: 0, otherFees: 0, repurchase: false }));
        expect(s.taxBeforeExempt).toBeCloseTo(800000, 6);
        expect(s.assessTax).toBeCloseTo(50000, 6);
        expect(s.taxBeforeExempt - s.assessTax).toBeCloseTo(750000, 6);
    });

    test('对照表四行：查账 + 1% / 2% / 3%，最省的是核定但本例适用的是查账', () => {
        const cmp = Q().assessCompareOf(values());
        expect(cmp.rows).toHaveLength(4);
        expect(cmp.rows[0].tax).toBeCloseTo(336000, 6);
        expect(cmp.rows[1].tax).toBeCloseTo(50000, 6);
        expect(cmp.cheapest.key).toBe('assess1');
        expect(cmp.gap).toBeCloseTo(286000, 6);
        expect(cmp.rows[0].applied).toBe(true);
        expect(cmp.rows[1].applied).toBe(false);
    });
});

describe('满五唯一：免在哪、唯一看多大范围', () => {
    test('自用 6 年 + 家庭唯一 → 免征，税额 0', () => {
        const s = Q().stackOf(values({ isOnlyHome: true }));
        expect(s.exemptEligible).toBe(true);
        expect(s.tax).toBeCloseTo(0, 6);
        expect(compute({ isOnlyHome: true }).primary.value).toBeCloseTo(0, 6);
    });

    test('自用不足 5 年 → 照缴', () => {
        const s = Q().stackOf(values({ holdYears: 4, isOnlyHome: true }));
        expect(s.exemptEligible).toBe(false);
        expect(s.tax).toBeCloseTo(336000, 6);
    });

    test('已经免征的人换购退不到钱：已缴为 0，退税额也是 0', () => {
        const s = Q().stackOf(values({ isOnlyHome: true }));
        expect(s.refund.applied).toBe(true);
        expect(s.refund.refund).toBeCloseTo(0, 6);
        expect(s.refund.reasons.join('')).toContain('已缴个税为 0');
    });

    test('非住房既不免征、也不能换购退税（国税发〔2007〕33 号二）', () => {
        const s = Q().stackOf(values({ usage: 'nonresidence' }));
        expect(s.exemptEligible).toBe(false);
        expect(s.refund.applied).toBe(false);
        expect(s.refund.reasons.join('')).toContain('非住房');
        expect(s.tax).toBeCloseTo(336000, 6);
    });

    test('三档边界表：满五唯一 0、满五非唯一与不足五年都照缴', () => {
        const ex = Q().exemptCompareOf(values());
        expect(ex.rows).toHaveLength(3);
        expect(ex.rows[0].tax).toBeCloseTo(336000, 6);   // 本例非唯一 → 这一档也不免
        expect(ex.rows[0].eligible).toBe(false);
        expect(ex.current).toBe('notOnly');
    });
});

describe('受赠 / 继承：原值不是 0，也不是评估价', () => {
    test('受赠：原值 = 原捐赠人 60 万 → 440 万 × 20% = 88 万', () => {
        const s = Q().stackOf(values({ acquireType: 'gift', donorCost: 600000, decoration: 0, otherFees: 0,
            repurchase: false }));
        expect(s.basis.value).toBeCloseTo(600000, 6);
        expect(s.basis.label).toContain('原捐赠人');
        expect(s.taxable).toBeCloseTo(4400000, 6);
        expect(s.tax).toBeCloseTo(880000, 6);
        // 误按受赠时评估价 400 万当原值：只有 20 万 —— 差 68 万
        const wrong = Q().stackOf({ usage: 'residence', acquireType: 'purchase', salePrice: 5000000,
            originalValue: 4000000, hasValueProof: true, holdYears: 6, isOnlyHome: false });
        expect(wrong.tax).toBeCloseTo(200000, 6);
        expect(s.tax - wrong.tax).toBeCloseTo(680000, 6);
    });

    test('继承：原值按被继承人取得成本口径，用同一个输入位置', () => {
        const s = Q().stackOf(values({ acquireType: 'inherit', originalValue: 800000 }));
        expect(s.basis.label).toContain('被继承人');
        expect(s.basis.value).toBeCloseTo(800000, 6);
    });
});

describe('换购退税：退的是已缴个税，不是补贴', () => {
    test('买 400 万（转让 500 万）→ 退 80%，26.88 万，净缴 6.72 万', () => {
        const s = Q().stackOf(values());
        expect(s.refund.ratio).toBeCloseTo(0.8, 6);
        expect(s.refund.refund).toBeCloseTo(268800, 6);
        expect(s.netTax).toBeCloseTo(67200, 6);
        expect(row(compute(), '换购住房退税')).toBeCloseTo(268800, 6);
        expect(row(compute(), '实际净缴个税')).toBeCloseTo(67200, 6);
    });

    test('新购金额 ≥ 转让金额 → 全额退还，净缴 0', () => {
        const s = Q().stackOf(values({ repurchasePrice: 6000000 }));
        expect(s.refund.ratio).toBeCloseTo(1, 6);
        expect(s.refund.refund).toBeCloseTo(336000, 6);
        expect(s.netTax).toBeCloseTo(0, 6);
    });

    test('不换购 / 不同城 / 不是新购产权人 → 一分不退', () => {
        expect(Q().repurchaseRefundOf({ usage: 'residence', salePrice: 5000000, taxPaidIIT: 336000,
            repurchase: false }).refund).toBeCloseTo(0, 6);
        const cross = Q().stackOf(values({ sameCity: false }));
        expect(cross.refund.refund).toBeCloseTo(0, 6);
        expect(cross.refund.reasons.join('')).toContain('不在同一城市');
        const notOwner = Q().stackOf(values({ isNewOwner: false }));
        expect(notOwner.refund.refund).toBeCloseTo(0, 6);
        expect(notOwner.refund.reasons.join('')).toContain('产权人');
    });

    test('政策口径：1 年窗口、同城、执行至 2027-12-31', () => {
        const r = Q().rules();
        expect(r.repurchase.windowMonths).toBe(12);
        expect(r.repurchase.from).toBe('2026-01-01');
        expect(r.repurchase.to).toBe('2027-12-31');
    });
});

describe('spec 接线：结果区、对照表与推导链', () => {
    test('primary / rows / note / extras / steps 五件套齐全', () => {
        const out = compute();
        expect(out.primary.label).toContain('应缴个人所得税');
        expect(out.primary.value).toBeCloseTo(336000, 6);
        expect(out.rows.length).toBeGreaterThan(4);
        expect(out.note).toContain('应纳税所得额');
        expect(out.extras).toHaveLength(3);
        expect(out.steps).toHaveLength(3);
    });

    test('三张对照表：核定能不能选 / 满五唯一 / 换购买多少退多少', () => {
        const out = compute();
        expect(tableOf(out, '核定 1% 能不能选')).toHaveLength(4);
        expect(tableOf(out, '满五唯一')).toHaveLength(3);
        const rp = tableOf(out, '卖后 1 年换购');
        expect(rp).toHaveLength(4);
        expect(rp[0][0]).toContain('不重新购房');
        expect(rp[3][3].value).toBeCloseTo(336000, 6);   // 买 600 万 → 全退
    });

    test('推导链三段：108 号一 → 278 号四 → 2026 年第 3 号', () => {
        const out = compute();
        expect(out.steps.map((s) => s.title)).toEqual([
            '① 应纳税所得额（国税发〔2006〕108 号一）',
            '② 满五唯一免征（财税字〔1999〕278 号四）',
            '③ 换购住房退税（财政部 税务总局 住房城乡建设部公告 2026 年第 3 号）'
        ]);
        expect(JSON.stringify(out.steps[0].rows)).toContain('装修费');
        expect(out.steps[2].footnote).toContain('2027-12-31');
    });

    test('核定形态下推导链换成「转让收入 × 征收率」，不再展示原值与装修费', () => {
        const out = compute({ hasValueProof: false });
        expect(out.steps[0].rows.map((r) => r.label)).toEqual(['转让收入', '核定征收率', '核定应纳税额']);
        expect(JSON.stringify(out.rows)).not.toContain('房屋原值');
    });
});

describe('走向导：由 spec 驱动', () => {
    beforeEach(() => {
        localStorage.clear();
        window.showPage = jest.fn();
        document.body.innerHTML = '<div id="deep-wizard-page" class="page hidden"></div>';
    });

    test('被通用向导接管：房子与产权 → 能扣什么 → 卖后换购 → 结果', () => {
        const tool = R().get('property-transfer');
        expect(W().has(tool)).toBe(true);
        expect(W().stepsOf(tool).map((s) => s.title)).toEqual([
            '房子与产权', '能扣什么', '卖后换购', '计算结果'
        ]);
    });

    test('走完四步：主结果、免责声明、结果归属都在', () => {
        W().open('property-transfer', { fresh: true });
        for (let i = 0; i < 10; i++) {
            const next = document.getElementById('dw-next');
            if (!next) break;
            next.click();
            if (document.getElementById('dw-result-card')) break;
        }
        expect(document.getElementById('dw-result-primary')).toBeTruthy();
        expect(document.querySelector('.result-disclaimer').textContent).toContain('不构成税务建议');
        const card = document.getElementById('dw-result-card');
        expect(card.textContent).toContain('应纳税所得额');
        expect(card.getAttribute('data-tool-id')).toBe('property-transfer');
    });

    test('条件字段：受赠才问原捐赠人成本、非住房不问唯一、凭证不全才问核定率', () => {
        W().open('property-transfer', { fresh: true });
        expect(document.getElementById('qf-donorCost')).toBeNull();
        expect(document.getElementById('qf-assessRate')).toBeNull();
        expect(document.getElementById('qf-originalValue')).toBeTruthy();

        document.getElementById('qf-acquireType').value = 'gift';
        document.getElementById('qf-acquireType').dispatchEvent(new Event('change'));
        expect(document.getElementById('qf-donorCost')).toBeTruthy();

        document.getElementById('qf-acquireType').value = 'purchase';
        document.getElementById('qf-acquireType').dispatchEvent(new Event('change'));
        const proof = document.getElementById('qf-hasValueProof');
        proof.checked = false;
        proof.dispatchEvent(new Event('change'));
        expect(document.getElementById('qf-assessRate')).toBeTruthy();
    });
});
