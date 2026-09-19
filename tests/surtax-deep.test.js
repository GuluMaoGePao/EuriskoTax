// 附加税与印花税完整测算（阶段17 17C-4 纵深，v1.62.0）的回归网
//
// 17C-4 在 v1.48.0 交付的是「铺齐」—— surtax-stamp-deep 当时只有元数据，
// 字段与计算**共享 surtax-stamp 速算器**。速算器已经算到了「城建税三档 7/5/1%
// + 教育费附加 3% + 地方教育附加 2% + 六税两费减半 + 印花税 17 个税目 + 不含列明的
// 增值税」—— 但它的「实际缴纳的增值税」只是一个输入框，而法定口径要做**三处方向
// 各不相同的调整**；印花税那边则只有「一张凭证、一个税目、一个金额」。
//
// 四处具体的口径差：
//   ① 附加税的计税依据是「**依法实际缴纳**」的增值税、消费税，不是申报表的应纳数，
//      更不是销售额。三处调整**方向相反**，记反一处就是整段错 ——
//        · 增值税期末留抵退税额：**允许**从计税依据中扣除（财税〔2018〕80 号）；
//        · 即征即退 / 先征后返退还的增值税：**不扣**，已征的附加税也**不退还**；
//        · 进口货物 / 境外单位代扣代缴的增值税：**根本不附征**（城建税法第三条）。
//      实测（市区、减半后综合 6%）：申报期应纳 10 万、本期留抵退税 3 万 →
//      计税依据 **7 万**（不是 10 万），附加税 4200 而非 6000，**差 1800**；
//      同样 3 万若是即征即退 → 计税依据**仍是 10 万**（扣了反而少缴 1800）；
//      进口环节缴增值税 50 万 → 不附征，误算进去就**多缴 3 万**。
//   ② 小规模纳税人季度销售额 ≤ 30 万（月 10 万）**免征增值税 → 附加税跟着免**，
//      而且是**整段跳变**不是渐进：季度 28 万 → 0；季度 31 万 → 增值税 3100、附加税 186。
//   ③ 印花税同一凭证载有**两个以上税目**：分别列明的**分别适用**，**未分别列明的从高**
//      （第九条）。实测：买卖 100 万（万分之三）+ 租赁 10 万（千分之一），
//      分别列明 → 200（减半）；未分别列明 → 110 万 × 千分之一 → **550** 减半后，**差 350**。
//   ④ 另外三处：金额未列明**先贴 5 元**、结算多退少补；营业账簿只对**增加额**计税
//      （500 万 → 800 万：375 vs 误算 1000，**差 625**）；**境外书立境内使用**也要贴花。
//
// 口径仍同源：三处调整、多税目从高、先贴 5 元、账簿增加额一律走 `EuriskoSurtaxQuick`
// （新增 surtaxBaseOf / stampMixedOf / stampSettlementOf / accountBookOf 四个可复用函数）。

const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/surtax-stamp-quick.js');
    loadSource('src/js/calculation/utils.js');
    loadSource('src/js/data/tool-registry.js');
    loadSource('src/js/ui/toolbox-ui.js');
    loadSource('src/js/ui/deep-wizard-ui.js');
});

const R = () => window.EuriskoToolRegistry;
const W = () => window.EuriskoDeepWizard;
const Q = () => window.EuriskoSurtaxQuick;

// 默认场景（附加税一般纳税人）：申报期应纳 10 万、本期留抵退税 3 万 → 计税依据 7 万
function compute(values) {
    return R().get('surtax-stamp-deep').compute(Object.assign({
        variant: 'surtaxGeneral',
        location: 'urban',
        signedWhere: 'domestic',
        vatPayable: 100000,
        quarterlySales: 280000,
        creditRefund: 30000,
        instantRefund: 0,
        importVat: 0,
        consumption: 0,
        stampMode: 'single',
        item: 'sale',
        amount: 1000000,
        stampVat: 0,
        secondItem: 'lease',
        secondAmount: 100000,
        secondVat: 0,
        separatelyStated: 'separate',
        settledAmount: 10000000,
        prevCapital: 5000000,
        currCapital: 8000000,
        halve: true
    }, values || {}));
}

function row(out, label) {
    const r = out.rows.find((x) => x.label === label);
    return r ? r.value : undefined;
}

function extrasTitle(out, title) {
    return (out.extras || []).some((e) => e.title === title);
}

describe('与速算器同源：核定后的数传给 quick，逐点相等', () => {
    // 没有留抵退税 / 即征即退 / 进口代扣代缴时，计税依据 = 申报期实缴增值税 —— 此时必须与速算器同口径
    const NO_ADJUST = { creditRefund: 0, instantRefund: 0, importVat: 0 };

    test('没有三处调整时 ≡ surtax-stamp 速算器直达', () => {
        const out = compute(NO_ADJUST);
        const direct = R().get('surtax-stamp').compute({
            variant: 'surtax', location: 'urban', vat: 100000, consumption: 0, halve: true
        });
        expect(out.primary.value).toBe(direct.primary.value);
        expect(out.primary.value).toBe(6000);        // 10 万 × 12% × 50%
    });

    test('逐项走 surtaxOf，一个数都不自己算', () => {
        const out = compute(NO_ADJUST);
        const r = Q().surtaxOf({ vat: 100000, consumption: 0, location: 'urban', halve: true });
        expect(out.primary.value).toBe(r.total);
        expect(row(out, '城建税')).toBe(r.cityTax);
        expect(row(out, '教育费附加（3%）')).toBe(r.educationTax);
        expect(row(out, '地方教育附加（2%）')).toBe(r.localEducationTax);
        expect(row(out, '综合负担率')).toBe(r.effectiveRate);
    });

    test('印花税单税目 ≡ surtax-stamp 速算器直达', () => {
        const out = compute({ variant: 'stamp' });
        const direct = R().get('surtax-stamp').compute({
            variant: 'stamp', item: 'sale', amount: 1000000, stampVat: 0, halve: true
        });
        expect(out.primary.value).toBe(direct.primary.value);
        expect(out.primary.value).toBe(150);          // 100 万 × 万分之三 = 300，减半 150
    });

    test('印花税逐项走 stampDutyOf，一个数都不自己算', () => {
        const out = compute({ variant: 'stamp', amount: 2000000, stampVat: 200000 });
        const s = Q().stampDutyOf({ item: 'sale', amount: 2000000, vat: 200000, halve: true });
        expect(out.primary.value).toBe(s.tax);
        expect(row(out, '计税金额（不含列明的增值税）')).toBe(s.base);
        expect(row(out, '法定税额（未减半）')).toBe(s.statutoryTax);
    });
});

// ① 附加税的计税依据是「依法实际缴纳」的数，三处调整方向不同
describe('① 实缴增值税的三处调整（方向各不相同）', () => {
    test('留抵退税**要扣**：计税依据 7 万不是 10 万，附加税差 1800', () => {
        const out = compute({ creditRefund: 30000, instantRefund: 0, importVat: 0 });
        expect(row(out, '**计税依据**')).toBe(70000);
        expect(row(out, '若误按申报表应纳数（含进口）')).toBe(100000);
        expect(out.primary.value).toBe(4200);            // 7 万 × 6%
        expect(row(out, '按错误口径（含进口、不扣留抵退税）应缴')).toBe(6000);
        expect(6000 - 4200).toBe(1800);
    });

    test('即征即退**不扣**：同样 3 万退税，计税依据仍是 10 万', () => {
        const out = compute({ creditRefund: 0, instantRefund: 30000 });
        expect(row(out, '**计税依据**')).toBe(100000);
        expect(out.primary.value).toBe(6000);
        // 与留抵退税那条对照：同一个数，方向相反 —— 这是最容易记反的一处
        expect(compute({ creditRefund: 30000, instantRefund: 0 }).primary.value).toBe(4200);
    });

    test('留抵退税不能把计税依据扣成负数', () => {
        const out = compute({ creditRefund: 999999 });
        expect(row(out, '**计税依据**')).toBe(0);
        expect(out.primary.value).toBe(0);
    });

    test('进口环节 / 代扣代缴的增值税**不附征**：误算进去多缴 3 万', () => {
        const out = compute({ creditRefund: 0, importVat: 500000 });
        expect(row(out, '**计税依据**')).toBe(100000);
        expect(row(out, '若误按申报表应纳数（含进口）')).toBe(600000);
        expect(out.primary.value).toBe(6000);
        expect(row(out, '按错误口径（含进口、不扣留抵退税）应缴')).toBe(36000);
        expect(36000 - 6000).toBe(30000);
    });

    test('三处调整同时出现时各走各的方向', () => {
        // 应纳 10 万、留抵退税 3 万（扣）、即征即退 2 万（不扣）、进口 50 万（不附征）
        const out = compute({ creditRefund: 30000, instantRefund: 20000, importVat: 500000 });
        expect(row(out, '**计税依据**')).toBe(70000);
        expect(row(out, '若误按申报表应纳数（含进口）')).toBe(600000);
        expect(out.primary.value).toBe(4200);
    });

    test('消费税进计税依据', () => {
        const out = compute({ creditRefund: 0, consumption: 50000 });
        expect(row(out, '**计税依据**')).toBe(150000);
        expect(out.primary.value).toBe(9000);            // 15 万 × 6%
    });

    test('三处调整写进对照表，方向标在表里', () => {
        const table = (compute({ creditRefund: 30000, instantRefund: 20000, importVat: 500000 })
            .extras.find((e) => e.title === '计税依据的三处调整（方向各不相同）')).table;
        const flat = JSON.stringify(table.rows);
        expect(flat).toContain('**扣**');
        expect(flat).toContain('**不扣**');
        expect(flat).toContain('**不附征**');
    });
});

// ② 小规模：免征增值税 → 附加税跟着免，且是整段跳变
describe('② 小规模纳税人：季度 30 万是整段跳变，不是渐进', () => {
    test('季度 28 万：免征增值税 → 附加税 0', () => {
        const out = compute({ variant: 'surtaxSmall', quarterlySales: 280000 });
        expect(row(out, '实际缴纳的增值税（1% 征收率）')).toBe(0);
        expect(row(out, '**计税依据**')).toBe(0);
        expect(out.primary.value).toBe(0);
    });

    test('季度 31 万：按 1% 缴增值税 3100，附加税 186', () => {
        const out = compute({ variant: 'surtaxSmall', quarterlySales: 310000 });
        expect(row(out, '实际缴纳的增值税（1% 征收率）')).toBe(3100);
        expect(row(out, '**计税依据**')).toBe(3100);
        expect(out.primary.value).toBe(186);             // 3100 × 6% = 186
    });

    test('门槛上下的差是整段的（30 万 → 0，30.01 万 → 180.06）', () => {
        expect(compute({ variant: 'surtaxSmall', quarterlySales: 300000 }).primary.value).toBe(0);
        // 300100 × 1% = 3001 元增值税 × 6% = 180.06；三项各自四舍五入后合计 180.07
        expect(compute({ variant: 'surtaxSmall', quarterlySales: 300100 }).primary.value).toBe(180.07);
    });

    test('小规模也适用「进口不附征」', () => {
        const out = compute({ variant: 'surtaxSmall', quarterlySales: 310000, importVat: 200000 });
        expect(row(out, '**计税依据**')).toBe(3100);
        expect(row(out, '若误按申报表应纳数（含进口）')).toBe(203100);
    });
});

// ③ 同一凭证两个以上税目：分别列明 vs 从高
describe('③ 同一凭证多税目：分别列明 vs 从高适用', () => {
    const MIXED = {
        variant: 'stamp', stampMode: 'mixed',
        item: 'sale', amount: 1000000, stampVat: 0,
        secondItem: 'lease', secondAmount: 100000, secondVat: 0
    };

    test('分别列明：两个税目各按各的税率', () => {
        const out = compute(Object.assign({}, MIXED, { separatelyStated: 'separate' }));
        // 买卖 100 万 × 万分之三 = 300；租赁 10 万 × 千分之一 = 100；合计 400，减半 200
        expect(row(out, '分别列明时应纳')).toBe(200);
        expect(out.primary.value).toBe(200);
    });

    test('未分别列明：从高适用千分之一，差 350', () => {
        const out = compute(Object.assign({}, MIXED, { separatelyStated: 'mixed' }));
        // 合并 110 万 × 千分之一 = 1100，减半 550
        expect(row(out, '未分别列明时（从高 千分之一）')).toBe(550);
        expect(out.primary.value).toBe(550);
        expect(row(out, '**两种写法的差额**')).toBe(350);
        expect(550 - 200).toBe(350);
    });

    test('两个税目税率相同时，从高与分别列明没有差别', () => {
        const same = Object.assign({}, MIXED, { secondItem: 'contract', separatelyStated: 'mixed' });
        const outMixed = compute(same);
        const outSep = compute(Object.assign({}, same, { separatelyStated: 'separate' }));
        expect(outMixed.primary.value).toBe(outSep.primary.value);
    });

    test('走 stampMixedOf，一个数都不自己算', () => {
        const out = compute(MIXED);
        const m = Q().stampMixedOf({
            item: 'sale', amount: 1000000, vat: 0,
            secondItem: 'lease', secondAmount: 100000, secondVat: 0,
            halve: true, separatelyStated: true
        });
        expect(out.primary.value).toBe(m.tax);
        expect(row(out, '分别列明时应纳')).toBe(m.separated);
        expect(row(out, '未分别列明时（从高 千分之一）')).toBe(m.merged);
    });
});

// ④ 另外三处速算器收不下的口径
describe('④ 未列明金额 / 营业账簿 / 境外书立', () => {
    test('金额未列明：先贴 5 元，结算 1000 万 → 应补 1495', () => {
        const out = compute({ variant: 'stamp', stampMode: 'undetermined', item: 'sale', settledAmount: 10000000 });
        expect(row(out, '签订时是否已贴花')).toBe('已按 5.00 元贴花');
        expect(row(out, '结算时应纳税额')).toBe(1500);     // 1000 万 × 万分之三 = 3000，减半 1500
        expect(row(out, '**应补（多退少补）**')).toBe(1495);
        expect(out.primary.value).toBe(1495);             // 主结果是「应补」
    });

    test('结算金额小于已贴部分时可以退', () => {
        const out = compute({ variant: 'stamp', stampMode: 'undetermined', item: 'sale', settledAmount: 10000, halve: false });
        expect(row(out, '结算时应纳税额')).toBe(3);         // 1 万 × 万分之三 = 3
        expect(row(out, '**应补（多退少补）**')).toBe(-2);  // 3 − 5 = −2 → 可退 2 元
    });

    test('营业账簿只对**增加额**计税：375 而不是 1000，差 625', () => {
        const out = compute({ variant: 'stamp', stampMode: 'capital', prevCapital: 5000000, currCapital: 8000000 });
        expect(row(out, '**增加额**（计税依据）')).toBe(3000000);
        expect(out.primary.value).toBe(375);              // 300 万 × 万分之二点五 = 750，减半 375
        expect(row(out, '若误按本年末全额贴（错）')).toBe(1000);   // 800 万 → 2000，减半 1000
        expect(1000 - 375).toBe(625);
    });

    test('资本公积减少时增加额为 0（减少不退税）', () => {
        const out = compute({ variant: 'stamp', stampMode: 'capital', prevCapital: 8000000, currCapital: 5000000 });
        expect(row(out, '**增加额**（计税依据）')).toBe(0);
        expect(out.primary.value).toBe(0);
    });

    test('境外书立境内使用同样要贴花，这一条写在结果里', () => {
        const out = compute({ variant: 'stamp', signedWhere: 'overseas' });
        expect(row(out, '凭证书立地')).toBe('境外书立、境内使用');
        expect(out.rows[0].hint).toContain('境外书立在境内使用的应税凭证');
    });
});

describe('减半与到期：证券交易不减半，2027-12-31 到期恢复全额', () => {
    test('证券交易印花税不享受六税两费减半', () => {
        const out = compute({ variant: 'stamp', item: 'securities', amount: 1000000, halve: true });
        expect(out.primary.value).toBe(1000);            // 100 万 × 千分之一，不减半
        expect(row(out, '法定税额（未减半）')).toBe(1000);
        expect(row(out, '减半优惠')).toBe(0);
    });

    test('普通税目减半后与法定差一半', () => {
        const out = compute({ variant: 'stamp', item: 'sale', amount: 1000000, halve: true });
        expect(out.primary.value).toBe(150);
        expect(row(out, '法定税额（未减半）')).toBe(300);
    });

    test('附加税：到期后按 100% 征收（减半执行至 2027-12-31）', () => {
        const out = compute({ creditRefund: 0 });
        expect(out.primary.value).toBe(6000);
        expect(row(out, '到期后（2028 起按 100%）')).toBe(12000);
    });

    test('不勾减半时结果等于法定全额', () => {
        const out = compute({ creditRefund: 0, halve: false });
        expect(out.primary.value).toBe(12000);
        expect(row(out, '减半优惠')).toBe(0);
    });
});

describe('三档所在地：城建税按所在地划分，不是按企业规模', () => {
    test('市区 12% / 县城 10% / 其他 6%（减半后 6% / 5% / 3%）', () => {
        const base = { creditRefund: 0, halve: false };
        expect(compute(Object.assign({}, base, { location: 'urban' })).primary.value).toBe(12000);
        expect(compute(Object.assign({}, base, { location: 'county' })).primary.value).toBe(10000);
        expect(compute(Object.assign({}, base, { location: 'other' })).primary.value).toBe(6000);
    });

    test('三档写进对照表', () => {
        const table = (compute({ creditRefund: 0 }).extras
            .find((e) => e.title.indexOf('三档所在地') === 0)).table;
        expect(table.rows.length).toBe(3);
        expect(JSON.stringify(table.rows)).toContain('市区');
        expect(JSON.stringify(table.rows)).toContain('不在市区、县城或者镇');
    });
});

describe('结果区形状：推导链与附加块都在', () => {
    test('附加税给了 4 步推导链', () => {
        const out = compute();
        expect(out.steps.length).toBe(4);
        expect(out.steps[0].title).toContain('实际缴纳');
        expect(out.steps[3].title).toContain('减半');
    });

    test('印花税各形态都给了推导链', () => {
        expect(compute({ variant: 'stamp' }).steps.length).toBe(2);
        expect(compute({ variant: 'stamp', stampMode: 'mixed' }).steps.length).toBe(2);
        expect(compute({ variant: 'stamp', stampMode: 'undetermined' }).steps.length).toBe(2);
        expect(compute({ variant: 'stamp', stampMode: 'capital' }).steps.length).toBe(2);
    });

    test('附加税给了三张附加块', () => {
        const out = compute();
        expect(out.extras.length).toBe(3);
        expect(extrasTitle(out, '计税依据的三处调整（方向各不相同）')).toBe(true);
        expect(extrasTitle(out, '减半到期对照（六税两费至 2027-12-31）')).toBe(true);
    });

    test('主结果与 note 都带了口径说明', () => {
        const out = compute();
        expect(out.primary.hint).toContain('计税依据');
        expect(out.note).toContain('依法实际缴纳');
        expect(out.note).toContain('2027-12-31');
    });
});

describe('自带 spec：不再与速算器共享同一份 fields', () => {
    test('surtax-stamp-deep 自带 fields / steps，且与速算器不是同一个对象', () => {
        const deep = R().get('surtax-stamp-deep');
        const quick = R().get('surtax-stamp');
        expect(deep.fields).toBeTruthy();
        expect(deep.fields).not.toBe(quick.fields);
        expect(deep.steps).not.toBe(quick.steps);
    });

    test('字段按 step 归组，第一步只问算哪一项与所在地', () => {
        const t = R().get('surtax-stamp-deep');
        expect(W().fieldsOfStep(t, 'identity').map((f) => f.key)).toEqual(['variant', 'location', 'signedWhere']);
        expect(W().fieldsOfStep(t, 'policy').map((f) => f.key)).toEqual(['halve']);
    });

    test('结果步由渲染器自动追加（3 步 + 结果）', () => {
        const steps = W().stepsOf(R().get('surtax-stamp-deep'));
        expect(steps).toHaveLength(4);
        expect(steps[steps.length - 1].title).toBe('计算结果');
        expect(steps[steps.length - 1].result).toBe(true);
    });

    test('17 个印花税税目全部来自常量，不复制一份', () => {
        const item = R().get('surtax-stamp-deep').fields.find((f) => f.key === 'item');
        expect(item.options.map((o) => o.value).sort())
            .toEqual(window.stampDutyRules.items.map((i) => i.key).sort());
    });
});

// 端到端：走一遍向导，确认分步填值与条件字段都没坏
describe('端到端：分步走一遍', () => {
    beforeEach(() => {
        localStorage.clear();
        window.showPage = jest.fn();
        document.body.innerHTML = '<div id="deep-wizard-page" class="page hidden"></div>';
    });

    test('算哪一项 → 计税依据 → 减半 → 结果，四步走通', () => {
        W().open('surtax-stamp-deep', { fresh: true });
        expect(document.querySelector('.step-title.active').textContent).toBe('算哪一项与所在地');
        document.getElementById('dw-next').click();
        expect(document.getElementById('qf-vatPayable')).toBeTruthy();
        expect(document.getElementById('qf-creditRefund')).toBeTruthy();
        expect(document.getElementById('qf-quarterlySales')).toBeFalsy();     // 一般纳税人不问季度销售额
        document.getElementById('dw-next').click();
        expect(document.getElementById('qf-halve')).toBeTruthy();
        document.getElementById('dw-next').click();
        expect(document.getElementById('dw-result-primary')).toBeTruthy();
    });

    test('切到小规模后，季度销售额替换掉「申报期应纳增值税」', () => {
        W().open('surtax-stamp-deep', { fresh: true });
        document.getElementById('qf-variant').value = 'surtaxSmall';
        document.getElementById('qf-variant').dispatchEvent(new Event('change'));
        document.getElementById('dw-next').click();
        expect(document.getElementById('qf-quarterlySales')).toBeTruthy();
        expect(document.getElementById('qf-vatPayable')).toBeFalsy();
    });

    test('切到印花税并选「多税目」后，第二个税目与「是否分别列明」出现', () => {
        W().open('surtax-stamp-deep', { fresh: true });
        document.getElementById('qf-variant').value = 'stamp';
        document.getElementById('qf-variant').dispatchEvent(new Event('change'));
        document.getElementById('dw-next').click();
        expect(document.getElementById('qf-stampMode')).toBeTruthy();
        expect(document.getElementById('qf-item')).toBeTruthy();

        document.getElementById('qf-stampMode').value = 'mixed';
        document.getElementById('qf-stampMode').dispatchEvent(new Event('change'));
        expect(document.getElementById('qf-secondItem')).toBeTruthy();
        expect(document.getElementById('qf-separatelyStated')).toBeTruthy();
        expect(document.getElementById('qf-amount')).toBeFalsy();
    });

    test('选「营业账簿」后换成实收资本的两个框', () => {
        W().open('surtax-stamp-deep', { fresh: true });
        document.getElementById('qf-variant').value = 'stamp';
        document.getElementById('qf-variant').dispatchEvent(new Event('change'));
        document.getElementById('dw-next').click();
        document.getElementById('qf-stampMode').value = 'capital';
        document.getElementById('qf-stampMode').dispatchEvent(new Event('change'));
        expect(document.getElementById('qf-prevCapital')).toBeTruthy();
        expect(document.getElementById('qf-currCapital')).toBeTruthy();
        expect(document.getElementById('qf-amount')).toBeFalsy();
    });

    test('分步填值不丢：改了留抵退税再回来，值还在', () => {
        W().open('surtax-stamp-deep', { fresh: true });
        document.getElementById('dw-next').click();
        document.getElementById('qf-creditRefund').value = '50000';
        document.getElementById('dw-prev').click();
        document.getElementById('dw-next').click();
        expect(document.getElementById('qf-creditRefund').value).toBe('50000');
    });
});
