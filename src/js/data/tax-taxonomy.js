// === 阶段22 M1：税种字典（tax-taxonomy）===
//
// 为什么需要这一层：
//   B 企业侧要按「专业税种」组织目录（阶段22 论证的一层分流两套逻辑），但这套分类此前只存在于
//   设计文档里，代码里既没有税种清单，也没有「一个工具对应哪个税种」的挂载关系 —— 结果就是
//   工具列表只能按「我们有什么」排（`tool-registry.group`），而不是按「客户在找什么」排。
//   本文件把**税种是什么、归哪类、多久报一次、依据哪部法**变成可查询的数据，是 B 侧分类的唯一真源。
//
// 与既有文件的分工（不许重叠，重叠就是两个真源）：
//   - `*-quick.js` / `tax-rates*`：税率、公式、免征额 —— **算的东西**，本文件一律不碰
//   - `tax-registry.js`：政策时效判定（`statusOf`）—— 本文件只存 `law` / `effectiveFrom` 两个字段供它引用
//   - `tool-registry.js`：工具有哪些、怎么摆、怎么算 —— 本文件不描述工具
//   - `tool-taxonomy.js`（M3）：工具挂在哪 —— 引用本文件的 `id` 做外键
//
// 两条硬约束（与阶段22 规格 §2.5 同源）：
//   1. **禁止存税率、公式、起征点、免征额**。需要口径的地方一律写「见 xxx」，由 `*-quick.js` 作答。
//      （`validate()` 会把这条变成可执行的检查，防止后来者顺手把数字抄进来。）
//   2. **税种是封闭集合**（现行 18 个）。新增税种必须先改规格文档，不是加一行数据那么简单。
//
// 三类对象要分清（统计口径的前提）：
//   tax        = 法定税种，恰好 18 个
//   fee        = 不是税但必办（社保公积金、残保金、工会经费、文化事业建设费）
//   mechanism  = 更不是税，是计算机制 / 政策（出口退税、研发费加计扣除）——
//                此前把它们算进 18 税种，导致「流转税组 5 项」这类口径对不上，故单列。
//
// 对外接口：window.EuriskoTaxTaxonomy = { categories, all, taxes, fees, mechanisms, get,
//                                         byCategory, forEntity, countTaxes, validate }
(function () {
    'use strict';

    // 一级分组：按征税对象（与企业财务的直觉一致，也是 B 侧目录的骨架）
    // defaultOpen 由 UI 决定折叠与否 —— 放在数据里是因为「哪一类默认收起」是分类判断，不是渲染判断。
    var CATEGORIES = [
        { id: 'turnover', name: '流转税', defaultOpen: true, note: '城建税与两项附加挂在此类（随增值税附征），不单独成类' },
        { id: 'income', name: '所得税', defaultOpen: true, note: '个税代扣是企业侧与「我自己」侧的唯一交汇点' },
        { id: 'property', name: '财产与行为税', defaultOpen: true, note: '多为按年或一次性，与流转税的使用频率完全不同' },
        { id: 'purpose', name: '特定目的与资源环境税', defaultOpen: false, note: '95% 企业为零，默认折叠' },
        { id: 'levy', name: '费与用工', defaultOpen: true, note: '不是税，但企业每月必办，故与税同列' }
    ];

    // entities 取值：company（企业）/ individual（个体户、个人独资等经营主体）/ person（自然人）
    // scope 取值：all（普适）/ conditional（有条件才涉及）/ industry（特定行业）
    // frequency 取值：month / quarter / year / onetime / withVat（随增值税附征，仅城建税一项使用）
    var TAX_TYPES = [
        // ---- 流转税（4 个法定税种）----
        { id: 'vat', name: '增值税', kind: 'tax', category: 'turnover',
            frequency: 'month', scope: 'all', entities: ['company', 'individual'],
            law: '《中华人民共和国增值税法》', effectiveFrom: '2026-01-01',
            note: '一般纳税人与小规模是两套算法；征收率与免征额口径见 vatRules' },

        { id: 'city-tax', name: '城市维护建设税', kind: 'tax', category: 'turnover',
            frequency: 'withVat', scope: 'all', entities: ['company', 'individual'],
            law: '《中华人民共和国城市维护建设税法》', effectiveFrom: '2021-09-01',
            note: '随增值税、消费税附征；两项教育费附加不是税，但与本税合并申报，合计口径见 surtax-stamp' },

        { id: 'consumption', name: '消费税', kind: 'tax', category: 'turnover',
            frequency: 'month', scope: 'industry', entities: ['company'],
            law: '《中华人民共和国消费税暂行条例》', effectiveFrom: '2009-01-01',
            note: '有税目清单，从价 / 从量 / 复合三种计税方式' },

        { id: 'tariff', name: '关税', kind: 'tax', category: 'turnover',
            frequency: 'onetime', scope: 'conditional', entities: ['company'],
            law: '《中华人民共和国关税法》', effectiveFrom: '2024-12-01',
            note: '完税价格的确定与税率适用是两个独立判断' },

        // ---- 所得税（2 个法定税种）----
        { id: 'cit', name: '企业所得税', kind: 'tax', category: 'income',
            frequency: 'quarter', scope: 'all', entities: ['company'],
            law: '《中华人民共和国企业所得税法》', effectiveFrom: '2008-01-01',
            note: '季度预缴 + 年度汇算；小微判定与优惠口径见 corporate-income-tax' },

        { id: 'iit', name: '个人所得税', kind: 'tax', category: 'income',
            frequency: 'month', scope: 'all', entities: ['company', 'individual', 'person'],
            law: '《中华人民共和国个人所得税法》', effectiveFrom: '2019-01-01',
            note: '九项所得分三组（综合 / 经营 / 分类），分组与判定问句见 person-taxonomy' },

        // ---- 财产与行为税（6 个法定税种）----
        { id: 'stamp', name: '印花税', kind: 'tax', category: 'property',
            frequency: 'quarter', scope: 'all', entities: ['company', 'person'],
            law: '《中华人民共和国印花税法》', effectiveFrom: '2022-07-01',
            note: '合同、产权转移书据、营业账簿三类应税凭证' },

        { id: 'property', name: '房产税', kind: 'tax', category: 'property',
            frequency: 'year', scope: 'conditional', entities: ['company', 'person'],
            law: '《中华人民共和国房产税暂行条例》', effectiveFrom: '1986-10-01',
            note: '从价与从租两套算法；个人出租住房有专门优惠口径，见 property（待建）' },

        { id: 'land-use', name: '城镇土地使用税', kind: 'tax', category: 'property',
            frequency: 'year', scope: 'conditional', entities: ['company'],
            law: '《中华人民共和国城镇土地使用税暂行条例》', effectiveFrom: '1988-11-01',
            note: '定额税率，按城市规模分档' },

        { id: 'deed', name: '契税', kind: 'tax', category: 'property',
            frequency: 'onetime', scope: 'conditional', entities: ['company', 'person'],
            law: '《中华人民共和国契税法》', effectiveFrom: '2021-09-01',
            note: '个人购买住房有优惠口径，具体由地方确定；本税种是买房场景的主税种' },

        { id: 'vehicle', name: '车船税', kind: 'tax', category: 'property',
            frequency: 'year', scope: 'conditional', entities: ['company', 'person'],
            law: '《中华人民共和国车船税法》', effectiveFrom: '2012-01-01',
            note: '定额，由保险机构代收' },

        { id: 'vehicle-purchase', name: '车辆购置税', kind: 'tax', category: 'property',
            frequency: 'onetime', scope: 'conditional', entities: ['company', 'person'],
            law: '《中华人民共和国车辆购置税法》', effectiveFrom: '2019-07-01',
            note: '计税价格是主要判断点（不含增值税的购车价）' },

        // ---- 特定目的与资源环境税（6 个法定税种）----
        { id: 'lvat', name: '土地增值税', kind: 'tax', category: 'purpose',
            frequency: 'onetime', scope: 'conditional', entities: ['company'],
            law: '《中华人民共和国土地增值税暂行条例》', effectiveFrom: '1994-01-01',
            note: '四级超率累进，增值额与扣除项目的确定是全部难点' },

        { id: 'farmland', name: '耕地占用税', kind: 'tax', category: 'purpose',
            frequency: 'onetime', scope: 'conditional', entities: ['company'],
            law: '《中华人民共和国耕地占用税法》', effectiveFrom: '2019-09-01',
            note: '定额，按人均耕地面积分档' },

        { id: 'resource', name: '资源税', kind: 'tax', category: 'purpose',
            frequency: 'month', scope: 'industry', entities: ['company'],
            law: '《中华人民共和国资源税法》', effectiveFrom: '2020-09-01',
            note: '从价与从量两种' },

        { id: 'environmental', name: '环境保护税', kind: 'tax', category: 'purpose',
            frequency: 'quarter', scope: 'industry', entities: ['company'],
            law: '《中华人民共和国环境保护税法》', effectiveFrom: '2018-01-01',
            note: '按月计算、按季申报，与其他税种的申报节奏不同' },

        { id: 'tobacco', name: '烟叶税', kind: 'tax', category: 'purpose',
            frequency: 'onetime', scope: 'industry', entities: ['company'],
            law: '《中华人民共和国烟叶税法》', effectiveFrom: '2018-07-01',
            note: '收购单位缴纳，税目单一' },

        { id: 'tonnage', name: '船舶吨税', kind: 'tax', category: 'purpose',
            frequency: 'onetime', scope: 'industry', entities: ['company'],
            law: '《中华人民共和国船舶吨税法》', effectiveFrom: '2018-07-01',
            note: '由海关代征' },

        // ---- 费（不是税，但企业每月必办）----
        { id: 'social', name: '社会保险费与住房公积金', kind: 'fee', category: 'levy',
            frequency: 'month', scope: 'all', entities: ['company', 'person', 'individual'],
            law: '《中华人民共和国社会保险法》', effectiveFrom: '2011-07-01',
            note: '五险与公积金；基数上下限与比例口径见 social-base' },

        { id: 'disability', name: '残疾人就业保障金', kind: 'fee', category: 'levy',
            frequency: 'year', scope: 'conditional', entities: ['company'],
            law: '《残疾人就业保障金征收使用管理办法》', effectiveFrom: '2015-10-01',
            note: '按上年在职职工人数与工资总额计算；与工会经费在同一工具里，待拆' },

        { id: 'union', name: '工会经费', kind: 'fee', category: 'levy',
            frequency: 'month', scope: 'all', entities: ['company'],
            law: '《中华人民共和国工会法》', effectiveFrom: '2022-01-01',
            note: '按工资总额拨缴，比例口径见 disability-fund' },

        { id: 'culture', name: '文化事业建设费', kind: 'fee', category: 'levy',
            frequency: 'month', scope: 'industry', entities: ['company'],
            law: '《文化事业建设费征收管理暂行办法》', effectiveFrom: '2016-05-01',
            note: '广告业与娱乐业' },

        // ---- 机制（更不是税，是计算机制 / 政策）----
        // 这类此前被混入税种统计，导致「18 个税种」对不上，故 kind 单列、category 为 null。
        { id: 'export-rebate', name: '出口退税', kind: 'mechanism', category: null,
            frequency: 'onetime', scope: 'industry', entities: ['company'],
            law: '《出口货物退（免）税管理办法》', effectiveFrom: null,
            note: '免抵退与免退两套算法；是机制不是税种，不计入 18' },

        { id: 'rd-super-deduction', name: '研发费用加计扣除', kind: 'mechanism', category: null,
            frequency: 'year', scope: 'conditional', entities: ['company'],
            law: '《研发费用加计扣除政策指引》', effectiveFrom: null,
            note: '企业所得税的计算机制，不是税种；加计比例以当年政策为准' }
    ];

    var CATEGORY_IDS = CATEGORIES.map(function (c) { return c.id; });
    var KINDS = ['tax', 'fee', 'mechanism'];
    var FREQUENCIES = ['month', 'quarter', 'year', 'onetime', 'withVat'];
    var SCOPES = ['all', 'conditional', 'industry'];
    var ENTITIES = ['company', 'individual', 'person'];

    function byId() {
        var m = {};
        TAX_TYPES.forEach(function (t) { m[t.id] = t; });
        return m;
    }
    var INDEX = byId();

    function all() {
        return TAX_TYPES.slice();
    }

    function ofKind(kind) {
        return TAX_TYPES.filter(function (t) { return t.kind === kind; });
    }

    function taxes() { return ofKind('tax'); }
    function fees() { return ofKind('fee'); }
    function mechanisms() { return ofKind('mechanism'); }

    function get(id) {
        return INDEX[id] || null;
    }

    function byCategory(categoryId) {
        return TAX_TYPES.filter(function (t) { return t.category === categoryId; });
    }

    function forEntity(entity) {
        return TAX_TYPES.filter(function (t) { return t.entities.indexOf(entity) >= 0; });
    }

    function countTaxes() {
        return taxes().length;
    }

    // 口径守护：把规格 §2.5 的约束变成可执行检查。
    // 为什么放在运行时而不是只放测试：税种字典是要被人工长期维护的数据，最容易被顺手改坏
    // （抄一个税率进来、把出口退税当成税种）。控制台与测试都可调，一处定义两处生效。
    // 返回问题数组，空数组 = 全部通过。
    function validate() {
        var issues = [];
        var seen = {};

        TAX_TYPES.forEach(function (t) {
            var where = t.id || '(缺 id)';
            if (!t.id) issues.push('存在缺 id 的条目');
            if (seen[t.id]) issues.push('id 重复：' + where);
            seen[t.id] = true;

            if (!t.name) issues.push(where + '：缺 name');
            if (KINDS.indexOf(t.kind) < 0) issues.push(where + '：kind 非法（' + t.kind + '）');
            if (!t.law) issues.push(where + '：缺 law');

            if (t.kind === 'mechanism') {
                if (t.category !== null) issues.push(where + '：机制类不属于任何税类，category 必须为 null');
            } else {
                if (CATEGORY_IDS.indexOf(t.category) < 0) issues.push(where + '：category 不存在（' + t.category + '）');
                if (!t.effectiveFrom) issues.push(where + '：税种与费必须填 effectiveFrom');
            }

            if (FREQUENCIES.indexOf(t.frequency) < 0) issues.push(where + '：frequency 非法（' + t.frequency + '）');
            if (t.frequency === 'withVat' && t.id !== 'city-tax') issues.push(where + '：withVat 只允许 city-tax 使用');
            if (SCOPES.indexOf(t.scope) < 0) issues.push(where + '：scope 非法（' + t.scope + '）');
            if (!t.entities || !t.entities.length) issues.push(where + '：entities 为空');
            (t.entities || []).forEach(function (e) {
                if (ENTITIES.indexOf(e) < 0) issues.push(where + '：entities 非法（' + e + '）');
            });

            // 硬约束 1：不得把计税口径抄进字典（税率 / 免征额 / 金额）
            var text = (t.note || '') + (t.name || '');
            if (/%|万元|元\/|\d+ 元/.test(text)) {
                issues.push(where + '：禁止在字典里存税率或金额（口径一律见 *-quick.js）');
            }
        });

        return issues;
    }

    window.EuriskoTaxTaxonomy = {
        categories: function () { return CATEGORIES.slice(); },
        all: all,
        taxes: taxes,
        fees: fees,
        mechanisms: mechanisms,
        get: get,
        byCategory: byCategory,
        forEntity: forEntity,
        countTaxes: countTaxes,
        validate: validate
    };
})();
