// 工具注册表（App 内多税种入口）的一致性测试
//
// 这个文件要钉住的是「目录层」而不是「算法层」的算法正确性（算法由各 *-quick.test.js 对拍）：
//   ① 数量与口径：20 个速算器 + 4 个深度流程 —— 目录页、App 工具箱、测试三方必须同数；
//   ② 落地页真实存在：注册表里写的 seoPath 不能指向 404（曾经出现过「目录写了 20 个、
//      正文文案还写 18 个」这类口径漂移，这里用文件系统兜底）；
//   ③ 政策依据必须是 tax-registry 里**已登记**的 id —— 防止随手写一个拼错的 key，
//      导致页面上的「政策有效期」永远显示不出来（到期了没人知道比写错数字更危险）；
//   ④ native 工具必须真能算：字段 schema 与 compute() 对得上，默认输入下结果有限且非负。
const fs = require('fs');
const path = require('path');
const { loadSource } = require('./helpers/load-source');

const ROOT = path.join(__dirname, '..');

// 顺序与 index.html 保持一致（social-insurance 被 net-salary / employer-cost 依赖，
// bonus-tax 被 early-retirement 依赖），顺序错了这里会先红，起到「加载顺序」的守护作用。
const QUICK_MODULES = [
    'social-insurance-quick.js',
    'salary-tax-quick.js',
    'bonus-tax-quick.js',
    'net-salary-quick.js',
    'special-deduction-quick.js',
    'annual-settlement-quick.js',
    'withholding-quick.js',
    'equity-incentive-quick.js',
    'severance-quick.js',
    'early-retirement-quick.js',
    'expat-allowance-quick.js',
    'private-pension-quick.js',
    'health-insurance-quick.js',
    'annuity-quick.js',
    'employer-cost-quick.js',
    'disability-fund-quick.js',
    'surtax-stamp-quick.js',
    'business-income-quick.js',
    'vat-quick.js',
    'corporate-income-tax-quick.js'
];

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    // 部分 quick 模块（special-deduction / expat / private-pension 等）的节税对照
    // 直接复用内核的 calculateTaxByTaxableIncome，测试里必须先加载
    loadSource('src/js/calculation/tax-calculator.js');
    // 17B-4（v1.50.0）：helper-functions.js 随分类所得页面删除（它是最后一个页面式 deep）。
    loadSource('src/js/calculation/tax-registry.js');
    QUICK_MODULES.forEach((f) => loadSource('src/js/calculation/' + f));
    loadSource('src/js/data/tool-registry.js');
});

const R = () => window.EuriskoToolRegistry;

describe('工具注册表：数量与分组', () => {
    // 阶段17 17C-1 后 deep 不再只有一种：分成「页面式」（各有独立 HTML 页与私有逻辑）与
    // 「spec 驱动」（无 pageId，由 deep-wizard-ui.js 按注册表渲染）。**分开统计，别笼统计总数** ——
    // 阶段17 的进度刻度就是「spec 驱动的在涨、页面式的最终归零」（17B 反向迁移的验收口径）。
    test('20 个速算器 + 深度流程（0 个页面式 + 10 个 spec 驱动）', () => {
        expect(R().all()).toHaveLength(20);
        const deep = R().deep();
        // 17B-1（v1.46.0）：business 从页面式迁到 spec 驱动，页面式由 4 → 3；
        // 17B-2（v1.48.0）：reverse 迁完，页面式由 3 → 2，且**旧页面已同版删干净**（不像 17B-1 那样留到下一版收尾）；
        // 17B-3（v1.49.0）：forward 迁完，页面式由 2 → 1；
        // 17B-4（v1.50.0）：classification 迁完 —— 它要等 spec 先有「动态增删所得条目」的 repeater
        // 能力才能迁，而这一条一直留着就是为了它：**归零已经兑现**。
        const pageBased = deep.filter((t) => !!t.pageId).map((t) => t.id).sort();
        const specDriven = deep.filter((t) => !t.pageId).map((t) => t.id).sort();
        // 页面式 deep 归零 = 17B 全部四个迁移完成：没删干净就会漏在这里（还记得 v1.46.0 那次吗）
        expect(pageBased).toEqual([]);
        // vat-deep（17C-1）、corporate-income-tax-deep（17C-2）、social-base-deep（17C-3）、
        // surtax-stamp-deep（17C-4）、disability-fund-deep（17C-5）：附加税的计税依据就是实缴增值税，
        // 所以它必须跟在 vat 之后 —— 这是 stage17 里唯一不许反顺序做的一对华系，钉在这里防乱序施工。
        // 到 17C-5 为止，按 tax-registry 的 6 类计**每类都有完整测算**；business 是 17B 迁回来的第一个，
        // classification 是最后一个（v1.50.0）—— 序号不重要，重要的是它俩都在这份清单里。
        // 17D-1（v1.52.0）：withholding-deep 是**第一个个税场景**的完整测算 —— 它不增加 category 数，
        //   增加的是「个税场景完整度」（4/16 → 5/16，目标 10/16）。覆盖面数字看不出这一步，
        //   所以这里必须把 id 列出来，否则「个税纵深」会被当成没有进展。
        expect(specDriven).toEqual([
            'business', 'classification', 'corporate-income-tax-deep', 'disability-fund-deep', 'forward',
            'reverse', 'social-base-deep', 'surtax-stamp-deep', 'vat-deep', 'withholding-deep'
        ]);
    });

    // 用测试钉住 17A-5 的硬约束：spec 驱动的完整测算**不许**自带一份 fields / compute，
    // 必须与同口径速算器是**同一个对象引用**（toBe 而非 toEqual）。
    // 复制一份就会出现「同一个增值税、速算器与完整测算算出两个数」的口径漂移，
    // 而增值税还是 surtax / stamp 的计税依据，漂一点会顺着依赖链放大。
    test('spec 驱动的完整测算复用速算器的字段与计算（不是复制）', () => {
        const specDriven = R().deep().filter((t) => !t.pageId);

        // ① `-deep` 系列：与同名速算器共享同一份 fields / steps / compute（同一对象引用）。
        //    复制一份就会出现「同一个增值税、速算器与完整测算算出两个数」的口径漂移，
        //    而增值税还是 surtax / stamp 的计税依据，漂一点会顺着依赖链放大。
        const twins = specDriven.filter((t) => t.id.endsWith('-deep'));
        expect(twins).toHaveLength(6);

        // ① 共享速算器 spec 的那 5 个（vat / cit / social / surtax-stamp / fee）：
        //    完整测算与速算器本就问同一件事，共享同一份对象最省事，也最不容易漂。
        const shared = twins.filter((t) => t.id !== 'withholding-deep');
        expect(shared.map((t) => t.id).sort()).toEqual([
            'corporate-income-tax-deep', 'disability-fund-deep', 'social-base-deep', 'surtax-stamp-deep', 'vat-deep'
        ]);
        shared.forEach((t) => {
            const twin = R().all().find((n) => n.compute === t.compute);
            expect(twin !== undefined && twin !== null).toBe(true);   // 必须能在速算器里找到同口径孪生项
            expect(t.fields).toBe(twin.fields);     // 同一对象引用，不是结构相等
            expect(t.steps).toBe(twin.steps);
            expect(t.compute).toBe(twin.compute);
        });

        // ② 自带 spec 的（17D-1 起）：速算器只认一笔收入，完整测算要按次、按月算好几笔 ——
        //    共享同一份 fields 就等于把速算器复制一遍，那不是复用。它不再共用对象，
        //    口径同源改由「同一个 withholding-quick.js 模块」+ 单笔输入的逐点对拍守护
        //    （tests/withholding-deep.test.js）。这里只钉住「它确实自带且没被覆盖」。
        const own = R().get('withholding-deep');
        expect(own.compute).not.toBe(R().get('withholding').compute);
        expect(own.fields).not.toBe(R().get('withholding').fields);
        expect(Array.isArray(own.fields) && own.fields.length > 0).toBe(true);
        expect(Array.isArray(own.steps) && own.steps.length > 0).toBe(true);
        expect(own.policyKey).toBe('withholding');

        // ② 从页面迁来的（17B-1：business；17B-2：reverse；17B-3：forward；17B-4：classification）：
        //    它们**没有**同名速算器可复用（经营所得速算器是「核定 vs 查账」对比、反向倒算压根没有速算器、
        //    综合所得那一溜专项附加扣除也不是月薪速算器那一套、分类所得按次计税没有对应速算器），
        //    所以计算走的是从页面里抽出来的共享内核：
        //    calculateBusinessTaxCore / calculateReverseTaxCore / performTaxCalculation /
        //    calculateSingleClassificationTax + calculateClassificationTaxTotal。
        //    这里只钉三件套齐全（防止只迁一半），**口径一致**由逐点对拍证明：
        //    business → tests/business-migration.test.js，reverse → tests/reverse-migration.test.js，
        //    forward → tests/forward-migration.test.js，classification → tests/classification-migration.test.js。
        const migrated = specDriven.filter((t) => !t.id.endsWith('-deep'));
        expect(migrated.map((t) => t.id).sort()).toEqual(['business', 'classification', 'forward', 'reverse']);
        migrated.forEach((t) => {
            expect(Array.isArray(t.fields) && t.fields.length > 0).toBe(true);
            expect(Array.isArray(t.steps) && t.steps.length > 0).toBe(true);
            expect(typeof t.compute).toBe('function');
        });
    });

    test('每个速算器都归属一个已声明的分组', () => {
        const groupIds = R().groups().map((g) => g.id);
        R().all().forEach((tool) => {
            expect(groupIds).toContain(tool.group);
        });
    });

    test('id 唯一（深度流程与速算器不重号）', () => {
        const ids = R().all().map((t) => t.id).concat(R().deep().map((t) => t.id));
        expect(new Set(ids).size).toBe(ids.length);
    });
});

describe('工具注册表：落地页真实存在', () => {
    test('所有 seoPath 都能在磁盘上找到', () => {
        const missing = R()
            .all()
            .filter((tool) => !tool.seoPath)
            .map((t) => t.id)
            .concat(
                R()
                    .all()
                    .filter((tool) => tool.seoPath && !fs.existsSync(path.join(ROOT, tool.seoPath.replace(/^\//, ''))))
                    .map((t) => t.id + ' → ' + t.seoPath)
            );
        expect(missing).toEqual([]);
    });
});

describe('工具注册表：政策依据登记在案', () => {
    test('每个工具的 policyKey 都能被 tax-registry 识别', () => {
        const bad = R()
            .all()
            .filter((tool) => tool.policyKey)
            .filter((tool) => !window.EuriskoTaxRegistry.statusOf(tool.policyKey))
            .map((t) => t.id + ' → ' + t.policyKey);
        expect(bad).toEqual([]);
    });
});

describe('工具注册表：App 内速算器（native）可用', () => {
    const natives = () => R().all().filter((t) => t.status === 'native');

    test('20 个工具全部 App 内置（不再有「网页版」跳站态）', () => {
        // 阶段16：之前 14 个工具只能跳 /seo 落地页，App 内点开就跳出 PWA。
        // 现在 20 个全部内置，落地页退回纯粹的 SEO / 分享入口。
        const notNative = R().all().filter((t) => t.status !== 'native').map((t) => t.id);
        expect(notNative).toEqual([]);
        expect(natives()).toHaveLength(20);
    });

    test('native 工具都有字段 schema、易错口径与 compute', () => {
        natives().forEach((tool) => {
            expect(Array.isArray(tool.fields)).toBe(true);
            expect(tool.fields.length).toBeGreaterThan(0);
            expect(typeof tool.compute).toBe('function');
            expect(Array.isArray(tool.pitfalls)).toBe(true);
            expect(tool.pitfalls.length).toBeGreaterThan(0);
        });
    });

    test('用默认值计算：结果有限、非负，且带 primary 与 rows', () => {
        natives().forEach((tool) => {
            const values = {};
            tool.fields.forEach((f) => { values[f.key] = f.default; });
            const out = tool.compute(values);
            expect(out).toBeTruthy();
            expect(out.error).toBeUndefined();
            expect(out.primary).toBeDefined();
            expect(Number.isFinite(Number(out.primary.value))).toBe(true);
            expect(Number(out.primary.value)).toBeGreaterThanOrEqual(0);
            expect(Array.isArray(out.rows)).toBe(true);
            out.rows.forEach((row) => {
                if (row.kind === 'money' || row.kind === 'percent') {
                    expect(Number.isFinite(Number(row.value))).toBe(true);
                }
            });
        });
    });

    // 企业所得税的完整测算比速算器多一条「从收入成本算 + 纳税调整」的路径（17C-2）。
    // 两条路径必须都算得出数 —— 申报表口径那条最容易坏在「调增写成调减」上，
    // 符号错了税额反而变小，肉眼和用户都不会察觉，只能靠固定数值钉住。
    test('企业所得税两种填法都能算（直接填 vs 收入成本纳税调整）', () => {
        const cit = R().get('corporate-income-tax');
        const base = {};
        cit.fields.forEach((f) => { base[f.key] = f.default; });

        const direct = cit.compute(Object.assign({}, base, { mode: 'direct', taxable: 2800000 }));
        expect(direct.error).toBeUndefined();
        expect(direct.primary.value).toBeCloseTo(140000, 2);   // 280 万 × 减按 25% 计入 × 20% = 14 万

        const adjusted = cit.compute(Object.assign({}, base, {
            mode: 'adjust', revenue: 5000000, cost: 4200000,
            entertainment: 60000, advertising: 200000, donation: 100000, previousLoss: 0
        }));
        expect(adjusted.error).toBeUndefined();
        // 会计利润 80 万：招待费可扣 min(6 万 × 60%, 500 万 × 5‰) = 2.5 万 → 调增 3.5 万；
        // 广宣费 20 万 < 500 万 × 15% 不调增；捐赠 10 万 − 80 万 × 12% = 0.4 万调增。
        expect(adjusted.rows.find((r) => r.label === '纳税调增合计').value).toBeCloseTo(39000, 2);
        expect(adjusted.rows.find((r) => r.label === '应纳税所得额').value).toBeCloseTo(839000, 2);
    });

    // 社保公积金的完整测算（17C-3）比速算器多出「逐项明细 + 全年汇总」。
    // 年度口径最容易坏在「拿月度数直接当月缴 × 12」以外的写法上（比如把公积金超标部分重复计入），
    // 而逐项明细的合计必须等于月缴合计 —— 少一项或多一项，用户看到的年度数就是错的。
    test('社保公积金：逐项明细合计 = 月缴合计，全年口径 = 月度 × 12', () => {
        const sb = R().get('social-base');
        const base = {};
        sb.fields.forEach((f) => { base[f.key] = f.default; });
        const r = sb.compute(base);                 // 月薪 15000、社平 8000、公积金 12%
        expect(r.error).toBeUndefined();

        const input = { wage: 15000, socialAverage: 8000, housingRate: 0.12, specialMonthly: 0 };
        const s = window.EuriskoSocialQuick.socialInsuranceOf(input);
        const n = window.EuriskoSocialQuick.netSalaryOf(input);
        const row = (label) => r.rows.find((x) => x.label === label).value;

        const items = r.rows.filter((x) => String(x.label).endsWith('（个人 / 月）'));
        expect(items.length).toBe(s.items.length + 1);                       // 五险 + 公积金
        expect(items.reduce((a, x) => a + x.value, 0)).toBeCloseTo(s.personalTotal, 2);

        expect(row('全年个人缴纳')).toBeCloseTo(s.personalTotal * 12, 2);
        expect(row('全年单位缴纳')).toBeCloseTo(s.employerTotal * 12, 2);
        expect(row('企业全年用工成本（1 人）')).toBeCloseTo((15000 + s.employerTotal) * 12, 2);
        expect(row('员工全年到手')).toBeCloseTo(n.annualNet, 2);
    });

    // 残保金（17C-5）是唯一一个「临界点比公式更要命」的类别：
    // 分档减缴是边际递减的（招到第 3 人可能一分钱都省不了），30 人又是临界点不是起征点。
    // 这两件事光看一个应缴额都看不出来 —— 不量化就会被当成算错，钉在这里。
    test('残保金：分档减缴边际递减，30 人临界点的跳变被量化出来', () => {
        const df = R().get('disability-fund');
        const base = {};
        df.fields.forEach((f) => { base[f.key] = f.default; });
        const r = df.compute(base);                 // 50 人、0 名残疾、社平 8000、年均工资 12 万
        expect(r.error).toBeUndefined();

        const Q = window.EuriskoDisabilityFundQuick;
        const input = { headcount: 50, disabled: 0, socialAverageMonthly: 8000, avgAnnualWage: 120000 };
        const row = (res, label) => res.rows.find((x) => x.label === label).value;

        expect(row(r, '再招 1 名残疾人可省')).toBeCloseTo(Q.savingOf(input, 1).saving, 2);
        expect(Q.savingOf(input, 1).saving).toBeGreaterThanOrEqual(Q.savingOf(input, 2).saving);

        const small = df.compute(Object.assign({}, base, { headcount: 30 }));
        expect(small.primary.value).toBe(0);
        expect(row(small, '超过 30 人后（按 31 人）应缴'))
            .toBeCloseTo(Q.levyOf(Object.assign({}, input, { headcount: 31 })).payable, 2);

        // 工会经费：年度计提 → 月均，做预算要的是月均
        const u = df.compute(Object.assign({}, base, { variant: 'union' }));
        expect(row(u, '月均计提')).toBeCloseTo(5000000 * 0.02 / 12, 2);
    });

    test('增值税切换计税场景后仍能算（条件字段不影响求解）', () => {
        const vat = R().get('vat');
        ['small', 'general', 'split'].forEach((variant) => {
            const values = {};
            vat.fields.forEach((f) => { values[f.key] = f.default; });
            values.variant = variant;
            const out = vat.compute(values);
            expect(out.error).toBeUndefined();
            expect(Number.isFinite(Number(out.primary.value))).toBe(true);
        });
    });
});

describe('工具注册表：信息架构（场景 / 相关工具）', () => {
    test('5 个身份场景，引用的工具都存在', () => {
        expect(R().scenarios()).toHaveLength(5);
        const bad = [];
        R().scenarios().forEach((s) => {
            s.tools.forEach((id) => { if (!R().get(id)) bad.push(s.id + ' → ' + id); });
        });
        expect(bad).toEqual([]);
    });

    test('nextTools 指向的工具都存在（结果页「下一步」不能是死链）', () => {
        const bad = [];
        R().all().concat(R().deep()).forEach((t) => {
            if (!Array.isArray(t.nextTools) || !t.nextTools.length) { bad.push(t.id + ' → 缺 nextTools'); return; }
            t.nextTools.forEach((id) => { if (!R().get(id)) bad.push(t.id + ' → ' + id); });
        });
        expect(bad).toEqual([]);
    });

    test('完整测算是一个独立分组，不混进按场景的 5 个组', () => {
        // 混排会让同组出现两个「算工资」的入口，用户更懵 —— 填多填少的差别只放在最后一组
        const groupIds = R().groups().map((g) => g.id);
        expect(groupIds).not.toContain(R().deepGroup().id);
        expect(R().deepGroup().id).toBe('deep');
        R().deep().forEach((t) => { expect(t.status).toBe('deep'); });
    });

    test('分组名不再叫「深度测算」：保存与导出已下放，形态不该出现在组名里', () => {
        // 阶段16 之前这组叫「深度测算」（按实现形态起名，用户心里没有「深度」这回事），
        // 卖点还是「可保存 / 可导出」—— 现在 20 个速算器都能存能导出，这个说法就过期了
        const g = R().deepGroup();
        expect(g.name).not.toBe('深度测算');
        expect(g.desc).not.toMatch(/可保存|可导出/);
    });
});

describe('工具注册表：搜索', () => {
    test('中文名与别名都能命中', () => {
        expect(R().search('增值税').tools.map((t) => t.id)).toContain('vat');
        expect(R().search('年终奖').tools.map((t) => t.id)).toContain('bonus-tax');
        expect(R().search('残保金').tools.map((t) => t.id)).toContain('disability-fund');
        expect(R().search('反向').deep.map((t) => t.id)).toContain('reverse');
    });

    test('空关键词返回全量，且不标记为搜索态', () => {
        const result = R().search('');
        expect(result.matched).toBe(false);
        expect(result.tools).toHaveLength(20);
    });
});
