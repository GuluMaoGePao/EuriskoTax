// 阶段12 C1：税制参数「热更新」同步层 验证测试
//
// 目标：
//   1. 锁定 window.TaxRates 对外契约（pure.validate / normalize / applyRates / syncNow ...）
//   2. 证明校验规则与后端 server/src/services/taxRateService.js 的 prepareTaxRates 对齐
//      （坏配置被拒、出厂基线通过、末级 Infinity / null 等价）
//   3. 证明 applyRates 真的覆盖全局税率变量并驱动计算——这是「管理台热改税率」的端上落点
//   4. 证明 localStorage 缓存可离线重放，且 syncNow 增量命中 / 失败分支正确

const { loadSource } = require('./helpers/load-source');

let BASE; // 出厂基线快照（原生形态，末级 max = Infinity）

function snapshot() {
    return {
        constantsVersion: window.TAX_CONSTANTS_VERSION,
        comprehensiveTaxRates: window.comprehensiveTaxRates,
        bonusMonthlyTaxRates: window.bonusMonthlyTaxRates,
        businessTaxRates: window.businessTaxRates,
        classificationTaxRates: window.classificationTaxRates,
        MIN_SOCIAL_SECURITY_BASE: window.MIN_SOCIAL_SECURITY_BASE,
        MIN_HOUSING_FUND_BASE: window.MIN_HOUSING_FUND_BASE
    };
}

// 转为「线路传输形态」：Infinity → null（与后端 JSON payload 一致）
function wire(rates) {
    return JSON.parse(JSON.stringify(rates, (k, v) => (v === Infinity ? null : v)));
}

// 将全局恢复到出厂基线
function toBaseline() {
    window.TaxRates.applyRates(wire(BASE));
}

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/tax-calculator.js');
    loadSource('src/js/data/tax-rates-sync.js');
    BASE = snapshot();
});

afterEach(() => {
    if (global.fetch && global.fetch.mockClear) global.fetch.mockClear();
    delete global.fetch;
    localStorage.clear();
    window.TaxRates.clearState();
});

describe('window.TaxRates 对外契约', () => {
    test('挂载同步 API 与纯逻辑出口', () => {
        expect(window.TaxRates).toBeDefined();
        ['applyRates', 'syncNow', 'triggerSync', 'replay', 'clearState', 'getState'].forEach((k) => {
            expect(typeof window.TaxRates[k]).toBe('function');
        });
        expect(typeof window.TaxRates.pure.validate).toBe('function');
        expect(typeof window.TaxRates.pure.normalize).toBe('function');
    });
});

describe('校验规则（与后端 prepareTaxRates 对齐）', () => {
    test('接受出厂基线（末级为 Infinity）', () => {
        const r = window.TaxRates.pure.validate(BASE);
        expect(r.errors).toEqual([]);
        expect(r.ok).toBe(true);
    });

    test('接受 JSON 传输形态（末级为 null）', () => {
        expect(window.TaxRates.pure.validate(wire(BASE)).ok).toBe(true);
    });

    test('normalize 把末级 null / Infinity 统一还原为 Infinity', () => {
        const n = window.TaxRates.pure.normalize(wire(BASE));
        expect(n.comprehensiveTaxRates[n.comprehensiveTaxRates.length - 1].max).toBe(Infinity);
        expect(n.bonusMonthlyTaxRates[n.bonusMonthlyTaxRates.length - 1].max).toBe(Infinity);
        expect(n.businessTaxRates[n.businessTaxRates.length - 1].max).toBe(Infinity);
    });

    test('拒绝：非末级留空上限', () => {
        const bad = wire(BASE);
        bad.comprehensiveTaxRates[0].max = null;
        const r = window.TaxRates.pure.validate(bad);
        expect(r.ok).toBe(false);
        expect(r.errors.join('|')).toContain('仅最后一级可无上限');
    });

    test('拒绝：综合所得级与级之间不衔接', () => {
        const bad = wire(BASE);
        bad.comprehensiveTaxRates[1].min = 36001;
        const r = window.TaxRates.pure.validate(bad);
        expect(r.ok).toBe(false);
        expect(r.errors.join('|')).toContain('不衔接');
    });

    test('拒绝：税率递减（破坏累进性）', () => {
        const bad = wire(BASE);
        bad.comprehensiveTaxRates[2].rate = 0.05; // 上一级为 0.10
        const r = window.TaxRates.pure.validate(bad);
        expect(r.ok).toBe(false);
        expect(r.errors.join('|')).toContain('税率须随级数递增');
    });

    test('拒绝：税率越界（> 100%）', () => {
        const bad = wire(BASE);
        bad.classificationTaxRates.interest.rate = 1.2;
        expect(window.TaxRates.pure.validate(bad).ok).toBe(false);
    });

    test('拒绝：负的缴费基数下限', () => {
        const bad = wire(BASE);
        bad.MIN_SOCIAL_SECURITY_BASE = -1;
        expect(window.TaxRates.pure.validate(bad).ok).toBe(false);
    });

    test('拒绝：空税率表 / 空分类表', () => {
        const a = wire(BASE);
        a.businessTaxRates = [];
        expect(window.TaxRates.pure.validate(a).ok).toBe(false);

        const b = wire(BASE);
        b.classificationTaxRates = {};
        expect(window.TaxRates.pure.validate(b).ok).toBe(false);
    });
});

describe('applyRates 覆盖全局并驱动计算（热改的端上落点）', () => {
    test('覆盖裸全局变量并同步 EuriskoTaxConstants', () => {
        const rates = wire(BASE);
        rates.constantsVersion = '2026.2';
        rates.comprehensiveTaxRates[6] = { min: 960000, max: null, rate: 0.50, deduction: 181920 };
        const res = window.TaxRates.applyRates(rates);

        expect(res.ok).toBe(true);
        expect(window.comprehensiveTaxRates[6].rate).toBe(0.50);
        expect(window.EuriskoTaxConstants.comprehensiveTaxRates[6].rate).toBe(0.50);
        expect(window.EuriskoTaxConstants.version).toBe('2026.2');
        expect(window.TAX_CONSTANTS_VERSION).toBe('2026.2');
    });

    test('热改后综合所得计算立即使用新税率', () => {
        expect(calculateIncomeTax(1000000).applicableRate).toBe(0.45);

        const rates = wire(BASE);
        rates.comprehensiveTaxRates[6].rate = 0.50;
        window.TaxRates.applyRates(rates);

        expect(calculateIncomeTax(1000000).applicableRate).toBe(0.50);
    });

    test('热改后年终奖单独计税使用新月度税率', () => {
        const before = calculateBonusTax(1200000, false);

        const rates = wire(BASE);
        rates.bonusMonthlyTaxRates[6] = { max: null, rate: 0.50, deduction: 15160 };
        window.TaxRates.applyRates(rates);

        const after = calculateBonusTax(1200000, false);
        expect(after).not.toBe(before);
        expect(after).toBeCloseTo(1200000 * 0.50 - 15160, 6);
    });

    test('热改后分类所得税率生效', () => {
        const rates = wire(BASE);
        rates.classificationTaxRates.interest = { rate: 0.30, name: '利息、股息、红利所得' };
        window.TaxRates.applyRates(rates);

        expect(calculateSingleClassificationTax('interest', 10000).totalTax).toBeCloseTo(3000, 6);
    });

    test('非法配置不覆盖（applyRates 返回 ok:false，全局保持原值）', () => {
        toBaseline();
        const bad = wire(BASE);
        bad.comprehensiveTaxRates[6].rate = 0.01; // 低于上一级 0.35，非法
        const res = window.TaxRates.applyRates(bad);

        expect(res.ok).toBe(false);
        expect(window.comprehensiveTaxRates[6].rate).toBe(0.45);
    });
});

describe('缓存重放与联网同步', () => {
    test('replay 从 localStorage 缓存恢复（离线首屏仍用最新税率）', () => {
        toBaseline();
        expect(window.comprehensiveTaxRates[6].rate).toBe(0.45);

        const cached = wire(BASE);
        cached.comprehensiveTaxRates[6].rate = 0.48;
        localStorage.setItem('taxRatesCache', JSON.stringify({
            version: '2026.9',
            revision: 'rev-cache',
            source: 'custom',
            checkedAt: new Date().toISOString(),
            rates: cached
        }));

        expect(window.TaxRates.replay()).toBe(1);
        expect(window.comprehensiveTaxRates[6].rate).toBe(0.48);
    });

    test('syncNow 拉取成功后覆盖并写入缓存', async () => {
        const rates = wire(BASE);
        rates.comprehensiveTaxRates[6].rate = 0.47;
        global.fetch = jest.fn(() => Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
                success: true,
                data: { version: '2026.5', revision: 'revA', publishedAt: null, note: '测试', source: 'custom', unchanged: false, rates }
            })
        }));

        const out = await window.TaxRates.syncNow({ force: true });

        expect(out.revision).toBe('revA');
        expect(window.comprehensiveTaxRates[6].rate).toBe(0.47);
        expect(JSON.parse(localStorage.getItem('taxRatesCache')).revision).toBe('revA');
    });

    test('syncNow 增量命中（rates=null）不覆盖已应用值', async () => {
        const rates = wire(BASE);
        rates.comprehensiveTaxRates[6].rate = 0.44;
        window.TaxRates.applyRates(rates);
        localStorage.setItem('taxRatesCache', JSON.stringify({
            version: 'x', revision: 'sameRev', source: 'custom',
            checkedAt: new Date().toISOString(), rates
        }));

        global.fetch = jest.fn(() => Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
                success: true,
                data: { version: 'x', revision: 'sameRev', unchanged: true, rates: null }
            })
        }));

        const out = await window.TaxRates.syncNow({ force: true });

        expect(out.updated).toBe(false);
        expect(window.comprehensiveTaxRates[6].rate).toBe(0.44);
    });

    test('syncNow 网络失败时静默（不抛错、保持已有税率）', async () => {
        toBaseline();
        global.fetch = jest.fn(() => Promise.reject(new Error('offline')));

        const out = await window.TaxRates.syncNow({ force: true });

        expect(out.updated).toBe(false);
        expect(out.reason).toBe('error');
        expect(window.comprehensiveTaxRates[6].rate).toBe(0.45);
    });

    test('getState 反映缓存来源与版本', () => {
        localStorage.setItem('taxRatesCache', JSON.stringify({
            version: '2026.7', revision: 'r7', source: 'custom', note: 'n',
            checkedAt: new Date().toISOString(), rates: wire(BASE)
        }));
        const st = window.TaxRates.getState();
        expect(st.version).toBe('2026.7');
        expect(st.source).toBe('custom');
    });
});
