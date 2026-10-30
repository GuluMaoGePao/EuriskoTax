// 阶段22 M1 / M2：两个分类字典的自洽性守护
//
// 为什么单独立一个测试文件：
//   `tax-taxonomy.js` 与 `person-taxonomy.js` 是要被人工长期维护的**数据**（不是算法），
//   最容易坏的方式不是算错，而是「口径漂移」—— 抄一个税率进来、把出口退税当成税种、
//   别名表里冒出身份字段、新增职业时加成了分类节点。这类错误没有任何计算会报错，
//   只能靠断言提前拦住。
//
// 这里的每一条断言都对应 `阶段22-字典数据模型规格.md` §2.5 / §3.5 的一条约束；
// 改约束请先改规格文档，再改这里。
require('../src/js/data/tax-taxonomy.js');
require('../src/js/data/tool-registry.js');
require('../src/js/data/person-taxonomy.js');
require('../src/js/data/tool-taxonomy.js');

describe('税种字典（阶段22 M1）', () => {
    const T = global.window.EuriskoTaxTaxonomy;

    test('模块已挂载且三类对象齐全', () => {
        expect(T).toBeTruthy();
        expect(typeof T.all).toBe('function');
        expect(T.all().length).toBeGreaterThan(0);
    });

    test('口径守护：validate() 无问题（新增/修改税种时先看这里）', () => {
        expect(T.validate()).toEqual([]);
    });

    test('税种恰好 18 个、费 4 个、机制 2 个', () => {
        expect(T.taxes().length).toBe(18);
        expect(T.fees().length).toBe(4);
        expect(T.mechanisms().length).toBe(2);
        expect(T.countTaxes()).toBe(18);
    });

    test('id 全表唯一', () => {
        const ids = T.all().map((t) => t.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    test('5 个税类都有归属，且机制不属于任何税类', () => {
        T.categories().forEach((c) => {
            expect(T.byCategory(c.id).length).toBeGreaterThan(0);
        });
        T.mechanisms().forEach((m) => {
            expect(m.category).toBeNull();
        });
        // 每个税种与费都必须落在某个税类里
        T.taxes().concat(T.fees()).forEach((t) => {
            expect(T.categories().some((c) => c.id === t.category)).toBe(true);
        });
    });

    test('withVat 只允许城建税（这个枚举存在的唯一理由）', () => {
        T.all().filter((t) => t.frequency === 'withVat').forEach((t) => {
            expect(t.id).toBe('city-tax');
        });
    });

    test('禁止在字典里存税率与金额（口径一律见 *-quick.js）', () => {
        T.all().forEach((t) => {
            expect(/%|万元|\d+ 元/.test(t.note || '')).toBe(false);
        });
    });

    test('查询接口可用：get / byCategory / forEntity', () => {
        expect(T.get('vat').name).toBe('增值税');
        expect(T.get('不存在的税种')).toBeNull();
        // 流转税 = 增值税 + 城建税 + 消费税 + 关税
        expect(T.byCategory('turnover').map((t) => t.id).sort())
            .toEqual(['city-tax', 'consumption', 'tariff', 'vat']);
        // 自然人会碰到的税种里必须含契税（买房），但不含残保金
        const personIds = T.forEntity('person').map((t) => t.id);
        expect(personIds).toContain('deed');
        expect(personIds).not.toContain('disability');
    });
});

describe('个人字典（阶段22 M2）', () => {
    const P = global.window.EuriskoPersonTaxonomy;
    const R = global.window.EuriskoToolRegistry;
    const FORM_IDS = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9'];

    test('模块已挂载：3 组 / 9 格 / 10 别名 / 25 事件', () => {
        expect(P).toBeTruthy();
        expect(P.groups().length).toBe(3);
        expect(P.forms().length).toBe(9);
        expect(P.aliases().length).toBe(10);
        // 阶段22 M5 续（v2.3.0）：E25「买车了」—— 与 E16 买房同类的跨格子事项
        expect(P.events().length).toBe(25);
    });

    test('口径守护：validate() 无问题（含对税种字典与注册表的存在性校验）', () => {
        expect(P.validate()).toEqual([]);
    });

    test('9 格 id 恰为 F1–F9，三个组都有格', () => {
        expect(P.forms().map((f) => f.id)).toEqual(FORM_IDS);
        ['comprehensive', 'business', 'schedular'].forEach((g) => {
            expect(P.formsByGroup(g).length).toBeGreaterThan(0);
        });
        expect(P.formsByGroup('comprehensive').map((f) => f.id)).toEqual(['F1', 'F2', 'F3', 'F4']);
    });

    test('每格 question 非空（引导 UI 的唯一文案来源），且不含税率数字', () => {
        P.forms().forEach((f) => {
            expect(f.question.length).toBeGreaterThan(4);
            expect(/%|万元|\d+ 元/.test(f.question)).toBe(false);
        });
    });

    test('综合所得并入年度汇算，经营与分类所得不并入（法定口径写死成断言）', () => {
        P.forms().forEach((f) => {
            expect(f.annualSettlement).toBe(f.group === 'comprehensive');
        });
    });

    test('别名 forms 全部落在 F1–F9 内，identity 只能取 resident / non-resident', () => {
        P.aliases().forEach((a) => {
            a.forms.forEach((fid) => expect(FORM_IDS).toContain(fid));
            if (a.identity !== undefined) {
                expect(['resident', 'non-resident']).toContain(a.identity);
            }
        });
        // 律师必须横跨 4 格 —— 这是「职业做不了分类轴」的样本证据
        expect(P.getAlias('lawyer').forms).toEqual(['F1', 'F2', 'F3', 'F5']);
        // 外籍别名挂非居民身份 —— 只改算法参数，不改 9 格骨架
        expect(P.getAlias('expat').identity).toBe('non-resident');
        expect(P.getAlias('employee').identity).toBeUndefined();
    });

    test('事件 id 恰为 E1–E25，无重复无跳号', () => {
        const ids = P.events().map((e) => e.id);
        expect(new Set(ids).size).toBe(25);
        ids.forEach((id, i) => expect(id).toBe('E' + (i + 1)));
    });

    test('cross 事件恰好 6 个（E13 E14 E16 E20 E24 E25），且都写明原因', () => {
        const crosses = P.events().filter((e) => e.form === 'cross');
        expect(crosses.map((e) => e.id)).toEqual(['E13', 'E14', 'E16', 'E20', 'E24', 'E25']);
        crosses.forEach((e) => expect(e.crossReason.length).toBeGreaterThan(4));
    });

    test('taxCode 全部存在于税种字典，买房事件挂的是契税', () => {
        const T = global.window.EuriskoTaxTaxonomy;
        P.events().forEach((e) => {
            expect(T.get(e.taxCode)).toBeTruthy();
        });
        expect(P.getEvent('E16').taxCode).toBe('deed');
    });

    test('tools 全部存在于现有 44 个入口（tool-registry all + deep）', () => {
        const ids = new Set(R.all().concat(R.deep()).map((t) => t.id));
        expect(ids.size).toBe(44);
        P.events().forEach((e) => {
            (e.tools || []).forEach((tid) => expect(ids.has(tid)).toBe(true));
        });
    });

    test('查询接口可用：eventsByForm / forAlias / getEvent', () => {
        expect(P.getEvent('E2').tools).toEqual(['bonus-tax', 'bonus-tax-deep']);
        // F7 财产租赁只有 E17 一个事件 —— 阶段22 M5 之前它是全表唯一空格子（P0 依据），
        // 现在挂上了 property-rental（个人出租组合），这条从「空格子」改成「有且只有它」
        expect(P.eventsByForm('F7').map((e) => e.id)).toEqual(['E17']);
        expect(P.eventsByForm('F7')[0].tools).toEqual(['property-rental']);
        expect(P.forAlias('lawyer').length).toBe(4);
        // E3 是多格事件：数组里的每一项都必须是真实存在的格
        expect(P.getEvent('E3').form).toContain('F1');
    });
});

describe('挂载点表（阶段22 M3）', () => {
    const M = global.window.EuriskoToolTaxonomy;
    const R = global.window.EuriskoToolRegistry;
    const MIXED_IDS = ['surtax-stamp', 'surtax-stamp-deep', 'disability-fund', 'disability-fund-deep',
        'classification', 'property-transfer', 'employer-cost'];

    test('模块已挂载：恰好 44 条挂载点', () => {
        expect(M).toBeTruthy();
        expect(M.all().length).toBe(44);
    });

    test('口径守护：validate() 无问题（含对三个字典的存在性校验）', () => {
        expect(M.validate()).toEqual([]);
    });

    test('与注册表双向一致：无孤儿、无幽灵', () => {
        const regIds = new Set(R.all().concat(R.deep()).map((t) => t.id));
        const mountIds = new Set(M.all().map((m) => m.id));
        expect(regIds.size).toBe(44);
        expect(mountIds.size).toBe(44);
        regIds.forEach((id) => expect(mountIds.has(id)).toBe(true));
        mountIds.forEach((id) => expect(regIds.has(id)).toBe(true));
    });

    // 阶段22 M5 续：契税（cross/E16）入表后 A 由 31 → 32；车辆购置税（cross/E25）入表后 32 → 33
    test('A 33 / B 11（按工具数：速算 + 完整测算算同一入口但各占一条）', () => {
        expect(M.countByBranch('A')).toBe(33);
        expect(M.countByBranch('B')).toBe(11);
    });

    test('同一路径可以挂多个工具（F1/E1 有三个倒算/速算入口）', () => {
        const ids = M.at('F1/E1').map((m) => m.id).sort();
        expect(ids).toEqual(['net-salary', 'reverse', 'salary-tax']);
    });

    test('A 侧 33 个工具全部挂个税（iit），B 侧税码各异且 employer-cost 为空', () => {
        expect(M.byTaxCode('iit').length).toBe(31);
        expect(M.byTaxCode('vat').length).toBe(2);
        expect(M.byTaxCode('city-tax').length).toBe(2);
        const ec = M.get('employer-cost');
        expect(ec.taxCode).toBeNull();
        expect(ec.mixed).toMatch(/not-a-tax/);
    });

    test('跨分支复用只计一次主挂载点（vat 主挂 B，次挂 F5）', () => {
        const vat = M.get('vat');
        expect(vat.branch).toBe('B');
        expect(vat.primary).toBe('B/C1');
        expect(vat.secondary).toEqual(['F5']);
        // 复用清单（总表 §0.2）里的工具都应带另一分支的次挂载点
        ['salary-tax', 'withholding', 'bonus-tax', 'severance', 'social-base', 'business-income'].forEach((id) => {
            const m = M.get(id);
            expect(m.secondary.length).toBeGreaterThan(0);
        });
    });

    test('混装 / 待处理 7 个工具都写 mixed 说明', () => {
        MIXED_IDS.forEach((id) => {
            expect(M.get(id).mixed.length).toBeGreaterThan(4);
        });
    });

    test('B 侧类码映射到真实税类（C1 流转税 / C5 费与用工）', () => {
        expect(M.categoryCode('C1')).toBe('turnover');
        expect(M.categoryCode('C5')).toBe('levy');
        expect(M.categoryCode('C6')).toBeNull();
        // B/C4 特定目的税类存在但暂无工具（95% 企业为零，符合预期）
        const atC4 = M.all().filter((m) => m.primary === 'B/C4' || (m.secondary || []).includes('B/C4'));
        expect(atC4).toEqual([]);
    });

    test('查询接口可用：get / at / byTaxCode', () => {
        expect(M.get('salary-tax').primary).toBe('F1/E1');
        expect(M.get('不存在的工具')).toBeNull();
        expect(M.at('cross/E13').map((m) => m.id)).toContain('private-pension');
        expect(M.at('F5').map((m) => m.id)).toContain('social-base'); // 次挂载点命中
    });
});
