// === 阶段22 M2：个人字典（person-taxonomy）===
//
// 为什么需要这一层：
//   A「我自己」侧要按「这笔钱在法律上属于哪一格」组织引导（阶段22 论证的判定问句），
//   而这套九宫格此前只存在于设计文档里。本文件把它变成可查询的数据，是 A 侧分类的唯一真源。
//
// 骨架＝《个人所得税法》第二条的 9 项所得，分 3 组（综合 / 经营 / 分类）：
//   这是法律给定的**封闭集合** —— 个人收入不可能落在 9 格之外，所以分类不会膨胀。
//   职业因此**降级为别名表**：加一个职业 = 加一行数据（`ROLE_ALIASES`），不动分类、不动工具映射。
//
// 与既有文件的分工（不许重叠，重叠就是两个真源）：
//   - `*-quick.js`：税率、公式、预扣口径 —— **算的东西**，本文件一律不碰
//   - `tax-taxonomy.js`：税种是什么（B 侧真源）—— 事件的 `taxCode` 引用它的 id
//   - `tool-registry.js`：工具有哪些、怎么算 —— 事件的 `tools` 引用它的 id
//   - `tool-taxonomy.js`（M3）：工具挂在哪
//
// 三条硬约束（与阶段22 规格 §3.5 同源，`validate()` 会执行）：
//   1. **身份是算法参数，不是分类维度**：别名表带 `identity`（可选，默认 `resident`），
//      只影响工具内部的算法参数（非居民按月分项计税），不改变 9 格骨架与工具映射。
//   2. **每格的 `question` 是引导 UI 的唯一文案来源** —— 非空、且不许混进税率数字。
//   3. **禁止存税率、公式、免征额**（口径一律见 `*-quick.js`）。
//
// 对外接口：window.EuriskoPersonTaxonomy = { groups, forms, aliases, events, getForm, getAlias,
//                                         getEvent, formsByGroup, eventsByForm, forAlias, validate }
(function () {
    'use strict';

    // ---- 3 组：计税方式不同，是「要不要并入年度汇算」的分界 ----
    var INCOME_GROUPS = [
        { id: 'comprehensive', name: '综合所得', note: '年度合并计税，多退少补（F1–F4）' },
        { id: 'business',      name: '经营所得', note: '五级累进，单独算，不并入综合' },
        { id: 'schedular',     name: '分类所得', note: '分项计税，按次，不并入年度汇算' }
    ];

    // ---- 9 格：分类骨架（个税法第二条）----
    // withheldBy 决定产品形态：employer → 直接给计算器；其余 → 先定性再给工具。
    // rateBasis 只记算法族，不记税率数字（数字在 *-quick.js）。
    var INCOME_FORMS = [
        { id: 'F1', name: '工资薪金', group: 'comprehensive',
            withheldBy: 'employer', annualSettlement: true, rateBasis: 'annual-progressive',
            question: '单位按月发给你、还给你交社保？',
            law: '《个人所得税法》第二条第（一）项 · 工资、薪金所得' },

        { id: 'F2', name: '劳务报酬', group: 'comprehensive',
            withheldBy: 'payer', annualSettlement: true, rateBasis: 'annual-progressive',
            question: '给别人干活，按次 / 按项目结算，没人给你交社保？',
            law: '《个人所得税法》第二条第（二）项 · 劳务报酬所得' },

        { id: 'F3', name: '稿酬', group: 'comprehensive',
            withheldBy: 'payer', annualSettlement: true, rateBasis: 'annual-progressive',
            question: '写稿、出书、开专栏？',
            law: '《个人所得税法》第二条第（三）项 · 稿酬所得' },

        { id: 'F4', name: '特许权使用费', group: 'comprehensive',
            withheldBy: 'payer', annualSettlement: true, rateBasis: 'annual-progressive',
            question: '把版权 / 专利 / 肖像给别人用？',
            law: '《个人所得税法》第二条第（四）项 · 特许权使用费所得' },

        { id: 'F5', name: '经营所得', group: 'business',
            withheldBy: 'self', annualSettlement: false, rateBasis: 'five-level',
            question: '自己有摊 / 店 / 工作室 / 合伙份额，自负盈亏？',
            law: '《个人所得税法》第二条第（五）项 · 经营所得' },

        { id: 'F6', name: '利息、股息、红利', group: 'schedular',
            withheldBy: 'payer', annualSettlement: false, rateBasis: 'flat-20',
            question: '钱生钱（分红、利息、理财）？',
            law: '《个人所得税法》第二条第（六）项 · 利息、股息、红利所得' },

        { id: 'F7', name: '财产租赁', group: 'schedular',
            withheldBy: 'self', annualSettlement: false, rateBasis: 'flat-20',
            question: '把房 / 车 / 东西租出去了？',
            law: '《个人所得税法》第二条第（七）项 · 财产租赁所得' },

        { id: 'F8', name: '财产转让', group: 'schedular',
            withheldBy: 'self', annualSettlement: false, rateBasis: 'flat-20',
            question: '卖掉了房 / 股 / 车？',
            law: '《个人所得税法》第二条第（八）项 · 财产转让所得' },

        { id: 'F9', name: '偶然所得', group: 'schedular',
            withheldBy: 'payer', annualSettlement: false, rateBasis: 'flat-20',
            question: '中奖、白得的？',
            law: '《个人所得税法》第二条第（九）项 · 偶然所得' }
    ];

    // ---- 职业别名表：唯一允许无限扩充的地方 ----
    // 加一行 = 加一个职业；分类树、工具映射、算法全部不动。
    // 作用只剩两个：SEO 落地页（「律师怎么交税」是真实搜索词）+ 让用户有归属感地找到入口。
    // identity 可选（默认 resident）—— 只改算法参数，不改分类；挂载点在总表 §1.1 的 L1 税务身份层。
    var ROLE_ALIASES = [
        { id: 'employee', name: '上班族（含公务员 / 教师 / 受雇医生）', forms: ['F1'] },
        { id: 'owner',    name: '个体工商户 / 小店',                     forms: ['F5'] },
        { id: 'retiree',  name: '退休 / 内退',                           forms: ['F1'],
          note: '年金与养老金事项见事件 E12 / E13' },
        { id: 'student',  name: '学生 / 实习生',                         forms: ['F2'],
          note: '实习报酬暂无独立入口，可复用劳务预扣' },
        { id: 'expat',    name: '外籍 / 跨境',                           forms: ['F1'], identity: 'non-resident' },
        { id: 'lawyer',   name: '律师',                                   forms: ['F1', 'F2', 'F3', 'F5'],
          note: '授薪=F1 / 外聘讲课=F2 / 出书=F3 / 律所合伙人=F5（先分后税）' },
        { id: 'anchor',   name: '主播 · 自媒体 · 电商',                   forms: ['F1', 'F2', 'F5'],
          note: '签约底薪=F1 / 打赏坑位费=F2 / 有工作室=F5' },
        { id: 'doctor',   name: '医生',                                   forms: ['F1', 'F2', 'F5'],
          note: '受雇=F1 / 多点执业=F2 / 开诊所=F5' },
        { id: 'rider',    name: '网约车 · 骑手',                          forms: ['F2', 'F5'],
          note: '各地口径不一，必须走定性问句而不是给结论' },
        { id: 'agent',    name: '保险代理人 · 中介',                      forms: ['F2', 'F5'],
          note: '佣金=F2（展业成本可扣）/ 注册了个体户=F5' }
    ];

    // ---- 24 个事件：用户语言的真正入口 ----
    // form：指向 F1–F9；跨多格的记数组；'cross' = 跨格子事项（必须写 crossReason）。
    // tools：只登记「已存在」的入口（速算 + 完整测算算一个）；待做项留空数组。
    var EVENTS = [
        { id: 'E1',  name: '发了工资', form: 'F1', taxCode: 'iit',
            tools: ['salary-tax', 'net-salary', 'reverse'] },
        { id: 'E2',  name: '发了年终奖', form: 'F1', taxCode: 'iit',
            tools: ['bonus-tax', 'bonus-tax-deep'],
            question: '这笔奖是单独计税，还是并入当年综合所得？' },
        { id: 'E3',  name: '年底汇算', form: ['F1', 'F2', 'F3', 'F4'], taxCode: 'iit',
            tools: ['annual-settlement', 'annual-settlement-deep', 'forward'],
            note: '综合所得四格共同的年度出口' },
        { id: 'E4',  name: '扣专项附加（子女、房贷、房租…）', form: 'F1', taxCode: 'iit',
            tools: ['special-deduction', 'special-deduction-deep'] },
        { id: 'E5',  name: '接了私活', form: 'F2', taxCode: 'iit',
            tools: ['withholding', 'withholding-deep'] },
        { id: 'E6',  name: '讲课 / 出书 / 授权', form: ['F2', 'F3', 'F4'], taxCode: 'iit',
            tools: ['classification'],
            note: '三格共用一个通用格，待按格补独立入口' },
        { id: 'E7',  name: '离职拿补偿', form: 'F1', taxCode: 'iit',
            tools: ['severance', 'severance-deep'] },
        { id: 'E8',  name: '提前退休 / 内退', form: 'F1', taxCode: 'iit',
            tools: ['early-retirement', 'early-retirement-deep'] },
        { id: 'E9',  name: '拿到股权激励', form: 'F1', taxCode: 'iit',
            tools: ['equity', 'equity-deep'] },
        { id: 'E10', name: '行权 / 转让股权', form: 'F8', taxCode: 'iit',
            tools: [],
            note: 'P1 待做：转让股权无专器' },
        { id: 'E11', name: '拿公司分红', form: 'F6', taxCode: 'iit',
            tools: ['classification'],
            note: '无专器，暂用通用格' },
        { id: 'E12', name: '领企业年金', form: 'F1', taxCode: 'iit',
            tools: ['annuity'] },
        { id: 'E13', name: '存 / 领个人养老金', form: 'cross', taxCode: 'iit',
            crossReason: '存的时候是税前扣除、领的时候单独计税，两个动作跨所有格子',
            tools: ['private-pension', 'private-pension-deep'] },
        { id: 'E14', name: '买税优健康险', form: 'cross', taxCode: 'iit',
            crossReason: '税前扣除事项，不是一笔所得',
            tools: ['health-insurance'] },
        { id: 'E15', name: '卖房了', form: 'F8', taxCode: 'iit',
            tools: ['property-transfer'],
            pitfall: '现有工具只算个税；增值税 / 契税 / 附加要先用别的工具算完手填' },
        { id: 'E16', name: '买房了', form: 'cross', taxCode: 'deed',
            crossReason: '契税不是所得，是取得不动产时的一次性税',
            tools: [],
            question: '首套还是二套？九十平米以下还是以上？',
            note: 'P0 待做：买房组合（契税为主税种）' },
        { id: 'E17', name: '把房租出去了', form: 'F7', taxCode: 'iit',
            tools: ['property-rental'],
            pitfall: '住房与非住房是两套税：住房适用一整包优惠（房产税与个税的优惠税率 + 免征印花税与城镇土地使用税），非住房一律不适用' },
        { id: 'E18', name: '租房住', form: 'F1', taxCode: 'iit',
            tools: ['special-deduction'],
            note: '走住房租金专项附加扣除' },
        { id: 'E19', name: '开小店 / 摆摊', form: 'F5', taxCode: 'iit',
            tools: ['business-income', 'business', 'vat', 'surtax-stamp'] },
        { id: 'E20', name: '主播 / 律师 / 骑手……（别名入口）', form: 'cross', taxCode: 'iit',
            crossReason: '同一职业可跨多格，必须先走定性问句',
            tools: [],
            question: '这笔钱是怎么结给你的？（可多选）' },
        { id: 'E21', name: '炒股 / 理财', form: ['F6', 'F8'], taxCode: 'iit',
            tools: ['classification'],
            note: '无专器，暂用通用格' },
        { id: 'E22', name: '存款利息', form: 'F6', taxCode: 'iit',
            tools: [],
            note: '免税，做普法卡而不是计算器' },
        { id: 'E23', name: '中奖了', form: 'F9', taxCode: 'iit',
            tools: ['classification'],
            note: '无专器，暂用通用格' },
        { id: 'E24', name: '捐款了', form: 'cross', taxCode: 'iit',
            crossReason: '捐赠扣除跨综合 / 经营 / 分类三组，不属于单一形态',
            tools: ['donation'] }
    ];

    var FORM_IDS = INCOME_FORMS.map(function (f) { return f.id; });
    var GROUP_IDS = INCOME_GROUPS.map(function (g) { return g.id; });
    var WITHHELD_BY = ['employer', 'payer', 'self', 'none'];
    var RATE_BASIS = ['annual-progressive', 'five-level', 'flat-20', 'exempt'];

    function byId(list) {
        var m = {};
        list.forEach(function (x) { m[x.id] = x; });
        return m;
    }
    var FORM_INDEX = byId(INCOME_FORMS);
    var ALIAS_INDEX = byId(ROLE_ALIASES);
    var EVENT_INDEX = byId(EVENTS);

    function groups() { return INCOME_GROUPS.slice(); }
    function forms() { return INCOME_FORMS.slice(); }
    function aliases() { return ROLE_ALIASES.slice(); }
    function events() { return EVENTS.slice(); }
    function getForm(id) { return FORM_INDEX[id] || null; }
    function getAlias(id) { return ALIAS_INDEX[id] || null; }
    function getEvent(id) { return EVENT_INDEX[id] || null; }

    function formsByGroup(groupId) {
        return INCOME_FORMS.filter(function (f) { return f.group === groupId; });
    }

    // form 可以是单格 id、数组（多格事件）或 'cross'（不参与）
    function eventsByForm(formId) {
        return EVENTS.filter(function (e) {
            if (Array.isArray(e.form)) return e.form.indexOf(formId) >= 0;
            return e.form === formId;
        });
    }

    function forAlias(aliasId) {
        var a = ALIAS_INDEX[aliasId];
        if (!a) return [];
        return a.forms.map(function (fid) { return FORM_INDEX[fid]; }).filter(Boolean);
    }

    function eventForms(e) {
        return Array.isArray(e.form) ? e.form : [e.form];
    }

    // 口径守护：把规格 §3.5 的约束变成可执行检查（与 tax-taxonomy.validate 同一套设计）。
    // 返回问题数组，空数组 = 全部通过。
    // taxCode / tools 的存在性依赖另两个字典 —— 仅在它们已加载时校验
    // （浏览器里 index.html 的引入顺序保证了这一点；测试里显式 require 三件）。
    function validate() {
        var issues = [];
        var taxIndex = window.EuriskoTaxTaxonomy;
        var reg = window.EuriskoToolRegistry;
        var regIds = null;
        if (reg) regIds = reg.all().concat(reg.deep()).map(function (t) { return t.id; });
        var seenForm = {};
        var seenAlias = {};
        var seenEvent = {};

        if (INCOME_FORMS.length !== 9) issues.push('所得形态必须恰好 9 格，实际 ' + INCOME_FORMS.length);

        INCOME_FORMS.forEach(function (f) {
            if (seenForm[f.id]) issues.push('格 id 重复：' + f.id);
            seenForm[f.id] = true;
            if (!f.question) issues.push(f.id + '：缺 question（引导 UI 的唯一文案来源）');
            if (GROUP_IDS.indexOf(f.group) < 0) issues.push(f.id + '：group 非法（' + f.group + '）');
            if (WITHHELD_BY.indexOf(f.withheldBy) < 0) issues.push(f.id + '：withheldBy 非法');
            if (RATE_BASIS.indexOf(f.rateBasis) < 0) issues.push(f.id + '：rateBasis 非法');
            // 组与汇算的对应是法定口径，写死成断言
            if (f.group === 'comprehensive' !== !!f.annualSettlement) {
                issues.push(f.id + '：综合所得应并入年度汇算，其余不应（annualSettlement 与 group 不一致）');
            }
        });

        GROUP_IDS.forEach(function (g) {
            if (!formsByGroup(g).length) issues.push('组 ' + g + '：没有任何格');
        });

        ROLE_ALIASES.forEach(function (a) {
            if (seenAlias[a.id]) issues.push('别名 id 重复：' + a.id);
            seenAlias[a.id] = true;
            if (!a.name) issues.push(a.id + '：缺 name');
            if (a.identity !== undefined && ['resident', 'non-resident'].indexOf(a.identity) < 0) {
                issues.push(a.id + '：identity 只能取 resident / non-resident');
            }
            (a.forms || []).forEach(function (fid) {
                if (FORM_IDS.indexOf(fid) < 0) issues.push(a.id + '：指向不存在的格 ' + fid);
            });
            if (!a.forms || !a.forms.length) issues.push(a.id + '：forms 为空');
        });

        if (EVENTS.length !== 24) issues.push('事件必须恰好 24 个，实际 ' + EVENTS.length);
        EVENTS.forEach(function (e) {
            if (seenEvent[e.id]) issues.push('事件 id 重复：' + e.id);
            seenEvent[e.id] = true;
            if (!e.name) issues.push(e.id + '：缺 name');
            if (!e.taxCode) { issues.push(e.id + '：缺 taxCode'); }

            if (e.form === 'cross') {
                if (!e.crossReason) issues.push(e.id + '：cross 事件必须写 crossReason');
            } else {
                eventForms(e).forEach(function (fid) {
                    if (FORM_IDS.indexOf(fid) < 0) issues.push(e.id + '：form 指向不存在的格 ' + fid);
                });
                if (Array.isArray(e.form) && e.form.length < 2) {
                    issues.push(e.id + '：只有一格时 form 应记字符串，不记数组');
                }
            }

            (e.tools || []).forEach(function (tid) {
                if (regIds && regIds.indexOf(tid) < 0) issues.push(e.id + '：tools 指向不存在的工具 ' + tid);
            });
        });

        // 存在性校验（需要另外两个字典已加载）
        if (taxIndex) {
            EVENTS.forEach(function (e) {
                if (e.taxCode && !taxIndex.get(e.taxCode)) {
                    issues.push(e.id + '：taxCode ' + e.taxCode + ' 不在税种字典里');
                }
            });
        }

        // 硬约束：文案里不许出现税率 / 金额（question 是给引导 UI 用的，混进数字就会变成第二个口径源）
        function textOf(x) {
            return [x.name, x.question, x.note, x.crossReason, x.pitfall].filter(Boolean).join(' ');
        }
        INCOME_FORMS.concat(ROLE_ALIASES, EVENTS).forEach(function (x) {
            if (/%|万元|\d+ 元/.test(textOf(x))) {
                issues.push(x.id + '：禁止在字典里存税率或金额（口径一律见 *-quick.js）');
            }
        });

        return issues;
    }

    window.EuriskoPersonTaxonomy = {
        groups: groups,
        forms: forms,
        aliases: aliases,
        events: events,
        getForm: getForm,
        getAlias: getAlias,
        getEvent: getEvent,
        formsByGroup: formsByGroup,
        eventsByForm: eventsByForm,
        forAlias: forAlias,
        validate: validate
    };
})();
