// 阶段14 C2：城市社保参数库「热更新」同步层 + 参保城市选择器 验证测试
//
// 目标：
//   1. 锁定 window.CitySocial / window.CitySocialUI 对外契约
//   2. 证明端上校验规则与后端 server/src/services/citySocialService.js 对齐（坏配置被拒）
//   3. 证明「选择参保城市」真的改写了 MIN_SOCIAL_SECURITY_BASE / MIN_HOUSING_FUND_BASE，
//      并驱动 helper-functions.js 的基数合规提示——这是 C2 的端上落点
//   4. 证明与 C1 的时序耦合正确：C1 更新税率会把 MIN_* 写回全国口径，C2 必须在其之后重新施加城市口径
//   5. 证明 localStorage 缓存可离线重放，且 syncNow 增量命中 / 失败分支正确
//   6. 证明选择器被注入到三个页面且三处共享同一份选择

const { loadSource } = require('./helpers/load-source');

// 一份典型的多城市配置：北京（高基数、有上限）、深圳（低基数、无上限）
const CONFIG = {
    constantsVersion: '2026.2',
    defaultCity: 'national',
    cities: [
        { code: 'national', name: '全国平均', socialBaseMin: 7546, socialBaseMax: null, housingBaseMin: 7546, housingBaseMax: null, housingFundRateOptions: [5, 7], note: '' },
        { code: 'beijing', name: '北京', socialBaseMin: 6821, socialBaseMax: 35811, housingBaseMin: 2420, housingBaseMax: null, housingFundRateOptions: [5, 12], note: '' },
        { code: 'shenzhen', name: '深圳', socialBaseMin: 2360, socialBaseMax: null, housingBaseMin: 2360, housingBaseMax: null, housingFundRateOptions: [5, 12], note: '' }
    ]
};

function clone(v) { return JSON.parse(JSON.stringify(v)); }

function mockFetch(payload) {
    global.fetch = jest.fn(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve(payload)
    }));
    return global.fetch;
}

// 三个页面的社保区块（结构同 index.html，选择器需注入到基数输入所在的 form-group 之后）
const PAGES_HTML = [
    ['social-security-base', 'social-security-base-warning', '6000'],
    ['reverse-social-security-base', 'reverse-social-security-base-warning', '6000'],
    ['business-social-security-base', 'business-social-security-base-warning', '6000']
].map(([input, warning, value]) => `<div class="form-group">
        <label for="${input}">社保缴费基数</label>
        <input type="number" id="${input}" value="${value}">
        <div id="${warning}" class="hidden"></div>
    </div>`).join('');

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/helper-functions.js');
    loadSource('src/js/data/tax-rates-sync.js');
    loadSource('src/js/data/city-social-sync.js');
    document.body.innerHTML = PAGES_HTML;
    loadSource('src/js/ui/city-social-ui.js');
    // 不依赖 DOMContentLoaded 的触发时机，显式初始化（init 幂等）
    window.CitySocialUI.init();
});

afterEach(() => {
    if (global.fetch && global.fetch.mockClear) global.fetch.mockClear();
    delete global.fetch;
    localStorage.clear();
    window.CitySocial.clearState();
    window.CitySocialUI.render();
});

describe('阶段14 C2 - window.CitySocial 对外契约', () => {
    test('挂载同步 API 与纯逻辑出口', () => {
        expect(window.CitySocial).toBeDefined();
        ['applyConfig', 'syncNow', 'triggerSync', 'replay', 'reapply', 'selectCity',
            'getSelectedCode', 'getCities', 'getCity', 'clearState', 'getState'].forEach((k) => {
            expect(typeof window.CitySocial[k]).toBe('function');
        });
        expect(typeof window.CitySocial.pure.validate).toBe('function');
        expect(typeof window.CitySocial.pure.normalize).toBe('function');
        expect(typeof window.CitySocial.pure.resolveCity).toBe('function');
        expect(window.CitySocial.ENDPOINT).toBe('/api/config/city-social');
        expect(window.CitySocial.FALLBACK_CITY).toBe('national');
    });

    test('getState 初始为 builtin 且无城市参数', () => {
        const st = window.CitySocial.getState();
        expect(st.source).toBe('builtin');
        expect(st.cityCount).toBe(0);
        expect(window.CitySocial.getCities()).toEqual([]);
    });
});

describe('阶段14 C2 - 校验规则（与后端 prepareCitySocial 对齐）', () => {
    test('接受合法多城市配置，并归一化默认城市', () => {
        const r = window.CitySocial.pure.validate(CONFIG);
        expect(r.errors).toEqual([]);
        expect(r.ok).toBe(true);
        expect(r.data.cities.length).toBe(3);
        expect(r.data.constantsVersion).toBe('2026.2');
    });

    test('缺失 national 兜底城市 → 拒绝（否则城市被删时无回落锚点）', () => {
        const bad = clone(CONFIG);
        bad.cities = bad.cities.filter((c) => c.code !== 'national');
        const r = window.CitySocial.pure.validate(bad);
        expect(r.ok).toBe(false);
        expect(r.errors.join('|')).toContain('必须保留编码为 national 的兜底城市');
    });

    test('编码非法 / 重复 → 拒绝', () => {
        const bad = clone(CONFIG);
        bad.cities.push({ code: 'Beijing', name: '北京2', socialBaseMin: 1, housingBaseMin: 1 });
        expect(window.CitySocial.pure.validate(bad).ok).toBe(false);

        const dup = clone(CONFIG);
        dup.cities.push({ code: 'beijing', name: '北京副本', socialBaseMin: 1, housingBaseMin: 1 });
        expect(window.CitySocial.pure.validate(dup).errors.join('|')).toContain('编码重复');
    });

    test('上限低于下限 → 拒绝；上限留空 → null（无上限）', () => {
        const bad = clone(CONFIG);
        bad.cities[1].socialBaseMax = 100;
        expect(window.CitySocial.pure.validate(bad).errors.join('|')).toContain('上限不得低于下限');

        const r = window.CitySocial.pure.normalize(CONFIG);
        expect(r.cities[1].socialBaseMax).toBe(35811);
        expect(r.cities[2].socialBaseMax).toBeNull();
    });

    test('公积金比例选项：去重升序，越界拒绝，留空回落 [5,7]', () => {
        const dup = clone(CONFIG);
        dup.cities[1].housingFundRateOptions = [12, 5, 12];
        expect(window.CitySocial.pure.normalize(dup).cities[1].housingFundRateOptions).toEqual([5, 12]);

        const bad = clone(CONFIG);
        bad.cities[1].housingFundRateOptions = [0];
        expect(window.CitySocial.pure.validate(bad).errors.join('|')).toContain('(0, 100]');

        const blank = clone(CONFIG);
        delete blank.cities[1].housingFundRateOptions;
        expect(window.CitySocial.pure.normalize(blank).cities[1].housingFundRateOptions).toEqual([5, 7]);
    });

    test('默认城市不在列表中 → 拒绝', () => {
        const bad = clone(CONFIG);
        bad.defaultCity = 'shanghai';
        expect(window.CitySocial.pure.validate(bad).errors.join('|')).toContain('默认城市「shanghai」不在城市列表中');
    });

    test('城市列表为空 → 拒绝', () => {
        expect(window.CitySocial.pure.validate({ cities: [] }).ok).toBe(false);
        expect(window.CitySocial.pure.validate({}).ok).toBe(false);
    });
});

describe('阶段14 C2 - 城市回落链', () => {
    test('命中 → 默认城市 → national → 列表首项', () => {
        const cfg = window.CitySocial.pure.normalize(CONFIG);
        expect(window.CitySocial.pure.resolveCity(cfg, 'beijing').name).toBe('北京');
        expect(window.CitySocial.pure.resolveCity(cfg, '').code).toBe('national');
        expect(window.CitySocial.pure.resolveCity(cfg, 'deleted-city').code).toBe('national');
        const noFallback = { defaultCity: 'gone', cities: [{ code: 'beijing', name: '北京' }] };
        expect(window.CitySocial.pure.resolveCity(noFallback, 'gone').code).toBe('beijing');
        expect(window.CitySocial.pure.resolveCity(null, 'beijing')).toBeNull();
    });
});

describe('阶段14 C2 - 选择参保城市改写基数下限全局量（端上落点）', () => {
    test('未选择城市 → 使用默认城市（national）的口径', () => {
        window.CitySocial.applyConfig(CONFIG);
        expect(window.MIN_SOCIAL_SECURITY_BASE).toBe(7546);
        expect(window.MIN_HOUSING_FUND_BASE).toBe(7546);
        expect(window.CITY_SOCIAL_ACTIVE.code).toBe('national');
    });

    test('选择北京 → 全局量与 EuriskoTaxConstants 同步改写', () => {
        window.CitySocial.applyConfig(CONFIG);
        const r = window.CitySocial.selectCity('beijing');
        expect(r.ok).toBe(true);
        expect(window.MIN_SOCIAL_SECURITY_BASE).toBe(6821);
        expect(window.MIN_HOUSING_FUND_BASE).toBe(2420);
        expect(window.EuriskoTaxConstants.MIN_SOCIAL_SECURITY_BASE).toBe(6821);
        expect(window.EuriskoTaxConstants.MIN_HOUSING_FUND_BASE).toBe(2420);
        expect(window.CITY_SOCIAL_ACTIVE.name).toBe('北京');
        expect(window.CITY_SOCIAL_ACTIVE.matched).toBe(true);
    });

    test('深圳（低基数）→ 6000 元基数不再告警；北京（高基数）→ 6000 元基数告警', () => {
        window.CitySocial.applyConfig(CONFIG);
        const input = document.getElementById('social-security-base');
        const warning = document.getElementById('social-security-base-warning');

        window.CitySocial.selectCity('shenzhen');
        window.validateSocialSecurityBase();
        expect(warning.classList.contains('hidden')).toBe(true);
        expect(warning.textContent).toBe('');

        window.CitySocial.selectCity('beijing');
        window.validateSocialSecurityBase();
        expect(warning.classList.contains('hidden')).toBe(false);
        expect(warning.textContent).toContain('6821');

        // 未指定城市时回落默认城市（national 7546），6000 仍低于下限
        window.CitySocial.selectCity('');
        window.validateSocialSecurityBase();
        expect(warning.textContent).toContain('7546');
        expect(input.value).toBe('6000');
    });

    test('所选城市在新版本中被删除 → 回落并标记 matched=false', () => {
        window.CitySocial.applyConfig(CONFIG);
        window.CitySocial.selectCity('beijing');
        const next = clone(CONFIG);
        next.cities = next.cities.filter((c) => c.code !== 'beijing');
        const r = window.CitySocial.applyConfig(next);
        expect(r.ok).toBe(true);
        expect(window.CITY_SOCIAL_ACTIVE.matched).toBe(false);
        expect(window.CITY_SOCIAL_ACTIVE.requested).toBe('beijing');
        expect(window.MIN_SOCIAL_SECURITY_BASE).toBe(7546);
    });

    test('applyConfig 拒绝坏配置且不改写全局量', () => {
        window.CitySocial.applyConfig(CONFIG);
        window.CitySocial.selectCity('beijing');
        const r = window.CitySocial.applyConfig({ cities: [{ code: 'BAD CODE' }] });
        expect(r.ok).toBe(false);
        expect(window.MIN_SOCIAL_SECURITY_BASE).toBe(6821);
    });
});

describe('阶段14 C2 - 与 C1（税制参数）的时序耦合', () => {
    test('C1 更新税率写回全国口径后，C2 监听事件重新施加城市口径', () => {
        window.CitySocial.applyConfig(CONFIG);
        window.CitySocial.selectCity('beijing');
        expect(window.MIN_SOCIAL_SECURITY_BASE).toBe(6821);

        // 模拟 C1 拉取到新的税率配置：applyRates 会把 MIN_* 写回全国口径
        const baseline = {
            constantsVersion: window.TAX_CONSTANTS_VERSION,
            comprehensiveTaxRates: window.comprehensiveTaxRates,
            bonusMonthlyTaxRates: window.bonusMonthlyTaxRates,
            businessTaxRates: window.businessTaxRates,
            classificationTaxRates: window.classificationTaxRates,
            MIN_SOCIAL_SECURITY_BASE: 7546,
            MIN_HOUSING_FUND_BASE: 7546
        };
        const applied = window.TaxRates.applyRates(baseline);
        expect(applied.ok).toBe(true);
        expect(window.MIN_SOCIAL_SECURITY_BASE).toBe(7546);

        // C1 在指纹变化时会发这个事件；C2 必须在之后把城市口径恢复为最终生效值
        document.dispatchEvent(new CustomEvent(window.TaxRates.EVENT_UPDATED));
        expect(window.MIN_SOCIAL_SECURITY_BASE).toBe(6821);
        expect(window.MIN_HOUSING_FUND_BASE).toBe(2420);
        expect(window.CITY_SOCIAL_ACTIVE.code).toBe('beijing');
    });
});

describe('阶段14 C2 - 离线重放与同步分支', () => {
    test('replay：从 localStorage 缓存恢复配置与选择（离线可用）', () => {
        localStorage.setItem('citySocialCache', JSON.stringify({
            version: '2026.09.13-1',
            revision: 'rev-1',
            checkedAt: new Date().toISOString(),
            config: CONFIG
        }));
        localStorage.setItem('euriskotax_social_city', JSON.stringify('beijing'));

        // 先让模块回到「无配置」态，再验证纯靠缓存能否恢复
        window.CitySocial.clearState();
        expect(window.MIN_SOCIAL_SECURITY_BASE).toBe(7546);

        localStorage.setItem('citySocialCache', JSON.stringify({
            version: '2026.09.13-1',
            revision: 'rev-1',
            checkedAt: new Date().toISOString(),
            config: CONFIG
        }));
        localStorage.setItem('euriskotax_social_city', JSON.stringify('beijing'));
        expect(window.CitySocial.replay()).toBe(1);
        expect(window.MIN_SOCIAL_SECURITY_BASE).toBe(6821);
        expect(window.CitySocial.getSelectedCode()).toBe('beijing');
    });

    test('replay：缓存损坏时静默回落，不抛错', () => {
        localStorage.setItem('citySocialCache', JSON.stringify({ revision: 'x', config: { cities: 'oops' } }));
        expect(window.CitySocial.replay()).toBe(0);
        expect(window.MIN_SOCIAL_SECURITY_BASE).toBe(7546);
    });

    test('syncNow：成功下发配置 → 应用并写缓存', async () => {
        mockFetch({
            success: true,
            data: {
                version: '2026.09.13-1',
                revision: 'rev-1',
                publishedAt: '2026-09-13T10:00:00.000Z',
                note: '12 城口径更新',
                source: 'custom',
                unchanged: false,
                config: CONFIG
            }
        });
        const r = await window.CitySocial.syncNow();
        expect(r.revision).toBe('rev-1');
        expect(window.MIN_SOCIAL_SECURITY_BASE).toBe(7546);

        const cache = window.CitySocial.getCache();
        expect(cache.version).toBe('2026.09.13-1');
        expect(cache.config.cities.length).toBe(3);
        // 首载不算「变更」，避免误报提示
        expect(r.updated).toBe(false);
    });

    test('syncNow：revision 变化 → 视为更新并发出事件', async () => {
        localStorage.setItem('citySocialCache', JSON.stringify({
            version: 'old', revision: 'old-rev', checkedAt: new Date().toISOString(), config: CONFIG
        }));
        window.CitySocial.replay();
        const fired = jest.fn();
        document.addEventListener(window.CitySocial.EVENT_UPDATED, fired);

        mockFetch({
            success: true,
            data: {
                version: '2026.09.13-2', revision: 'new-rev', source: 'custom', unchanged: false,
                config: clone(CONFIG)
            }
        });
        const r = await window.CitySocial.syncNow({ force: true });
        expect(r.updated).toBe(true);
        expect(fired).toHaveBeenCalled();
        document.removeEventListener(window.CitySocial.EVENT_UPDATED, fired);
    });

    test('syncNow：since 命中（config=null）→ 仍重新施加城市口径', async () => {
        localStorage.setItem('citySocialCache', JSON.stringify({
            version: 'v1', revision: 'rev-1', checkedAt: new Date().toISOString(), config: CONFIG
        }));
        window.CitySocial.replay();
        window.CitySocial.selectCity('beijing');

        // 模拟 C1 刚把全局量写回全国口径
        window.MIN_SOCIAL_SECURITY_BASE = 7546;

        mockFetch({ success: true, data: { version: 'v1', revision: 'rev-1', unchanged: true, config: null } });
        const r = await window.CitySocial.syncNow();
        expect(r.updated).toBe(false);
        expect(window.MIN_SOCIAL_SECURITY_BASE).toBe(6821);
    });

    test('syncNow：请求失败 / 无 fetch → 静默降级', async () => {
        global.fetch = jest.fn(() => Promise.resolve({ ok: false, status: 500 }));
        const r = await window.CitySocial.syncNow();
        expect(r.updated).toBe(false);
        expect(r.reason).toBe('error');

        delete global.fetch;
        const r2 = await window.CitySocial.syncNow();
        expect(r2.reason).toBe('no-fetch');
    });

    test('clearState：清缓存 + 清选择 + 还原全国口径', () => {
        window.CitySocial.applyConfig(CONFIG);
        window.CitySocial.selectCity('beijing');
        window.CitySocial.clearState();
        expect(window.CitySocial.getSelectedCode()).toBe('');
        expect(window.CitySocial.getCache()).toBeNull();
        expect(window.MIN_SOCIAL_SECURITY_BASE).toBe(7546);
        expect(window.MIN_HOUSING_FUND_BASE).toBe(7546);
        expect(window.CITY_SOCIAL_ACTIVE).toBeNull();
    });
});

describe('阶段14 C2 - 参保城市选择器 UI', () => {
    test('三个页面都被注入选择器，且共享同一份选择', () => {
        window.CitySocial.applyConfig(CONFIG);
        window.CitySocialUI.render();
        const ids = ['social-city-select', 'reverse-social-city-select', 'business-social-city-select'];
        ids.forEach((id) => {
            const el = document.getElementById(id);
            expect(el).not.toBeNull();
            // 3 个城市 + 「未指定」
            expect(el.options.length).toBe(4);
            expect(el.disabled).toBe(false);
        });

        // 在「反向」页切换城市 → 三处下拉与全局量一起更新
        const shenzhenValue = Array.prototype.find.call(
            document.getElementById('reverse-social-city-select').options,
            (o) => o.value === 'shenzhen'
        ).value;
        const reverseSelect = document.getElementById('reverse-social-city-select');
        reverseSelect.value = shenzhenValue;
        reverseSelect.dispatchEvent(new window.Event('change'));

        expect(window.CitySocial.getSelectedCode()).toBe('shenzhen');
        expect(document.getElementById('social-city-select').value).toBe('shenzhen');
        expect(document.getElementById('business-social-city-select').value).toBe('shenzhen');
        expect(window.MIN_SOCIAL_SECURITY_BASE).toBe(2360);
    });

    test('无城市参数时禁用下拉并明确提示按全国口径（不静默给错口径）', () => {
        window.CitySocial.clearState();
        window.CitySocialUI.render();
        const el = document.getElementById('social-city-select');
        expect(el.disabled).toBe(true);
        expect(document.getElementById('social-city-select-hint').textContent).toContain('全国平均口径');
    });

    test('参数同步完成（事件）后重建选项并重新提示', () => {
        window.CitySocial.clearState();
        window.CitySocialUI.render();
        expect(document.getElementById('social-city-select').disabled).toBe(true);

        window.CitySocial.applyConfig(CONFIG);
        document.dispatchEvent(new CustomEvent(window.CitySocial.EVENT_UPDATED));
        expect(document.getElementById('social-city-select').disabled).toBe(false);
        expect(document.getElementById('social-city-select-hint').textContent).toContain('全国平均');
    });

    test('提示文案含所选城市的下限与公积金比例选项', () => {
        window.CitySocial.applyConfig(CONFIG);
        window.CitySocial.selectCity('beijing');
        const hint = document.getElementById('social-city-select-hint').textContent;
        expect(hint).toContain('北京');
        expect(hint).toContain('6,821');
        expect(hint).toContain('2,420');
        expect(hint).toContain('5% / 12%');
    });
});
