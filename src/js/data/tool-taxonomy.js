// === 阶段22 M3：挂载点表（tool-taxonomy）===
//
// 为什么需要这一层：
//   41 个工具入口此前只有 `tool-registry.group`（＝我们有什么），没有「它挂在分类树的哪里」。
//   M1（税种字典）+ M2（个人字典）定义了两侧的分类真源，本文件是**唯一同时引用三者的文件**：
//   每个工具一个主挂载点（+ 可选次挂载点），把「工具 ↔ 分类」的关系变成可查询、可校验的数据。
//
// 与既有文件的分工（依赖方向不许反向）：
//   tool-registry（工具有哪些、怎么算） ← 只读引用，注册表一行不改
//   tax-taxonomy / person-taxonomy（分类是什么） ← 只读引用 id 做外键
//   tool-taxonomy（工具挂在哪） ← 本文件，分类演进与校验独立进行
//
// primary 路径的四种形态（A「我自己」侧）与一种（B 企业侧）：
//   'F1/E1'   格内事件（F* → INCOME_FORMS，E* → EVENTS，且事件属于该格）
//   'F6'      纯格（classification 按 9 格补入口，先挂 F6）
//   'L1/expat' 身份层（非居民 / 外籍津补贴 —— 总表 §1.1 的 L1 税务身份）
//   'cross/E13' 跨格子事项（E* 必须是 form='cross' 的事件）
//   'B/C1'    企业侧税类（C1–C5 是总表 §2.1 编号，映射到税种字典的 CATEGORIES.id）
//
// 口径说明（与规格 §4.2 的修正一致）：
//   - **同一路径可以挂多个工具**：速算与完整测算算**同一入口**（`salary-tax` / `net-salary` /
//     `reverse` 都在 F1/E1）；「A 33 / B 11」按**工具数**计，不是按路径去重计。
//   - `taxCode` 为 null 只允许 `employer-cost`（成本测算，`mixed` 标注 not-a-tax）。
//   - 混装工具的次税种 / 拆分建议写在 `mixed`，不另立字段。
//
// 对外接口：window.EuriskoToolTaxonomy = { all, get, byBranch, byTaxCode, at, countByBranch,
//                                          categoryCode, validate }
(function () {
    'use strict';

    // B 侧类码（总表 §2.1 的 C1–C5）→ 税种字典 CATEGORIES.id
    var CATEGORY_CODES = {
        C1: 'turnover',
        C2: 'income',
        C3: 'property',
        C4: 'purpose',
        C5: 'levy'
    };

    // ---- 44 条挂载点（A 33 / B 11，与总表 §3 映射总表逐行核对）----
    // branch：主挂载点所在分支，决定 A/B 计数归属；secondary 不重复计数。
    // 阶段22 M5：F7 财产租赁补上 property-rental 后，A 由 30 → 31、总数 41 → 42；
    // M5 续补上契税（cross/E16）后，A 由 31 → 32、总数 42 → 43；
    // 再补上车辆购置税（cross/E25）后，A 由 32 → 33、总数 43 → 44 ——
    // 「41 个入口」本就是由分类体系统计得出的数字，不是硬约束（总表 §5 维护约定 3）。
    var MOUNTS = [
        // ===== A 我自己（33 个工具）=====

        // F1 工资薪金（14 个工具）
        { id: 'salary-tax',            branch: 'A', primary: 'F1/E1',  secondary: ['B/C2'], taxCode: 'iit' },
        { id: 'net-salary',            branch: 'A', primary: 'F1/E1',  taxCode: 'iit' },
        { id: 'reverse',               branch: 'A', primary: 'F1/E1',  taxCode: 'iit' },
        { id: 'bonus-tax',             branch: 'A', primary: 'F1/E2',  secondary: ['B/C2'], taxCode: 'iit' },
        { id: 'bonus-tax-deep',        branch: 'A', primary: 'F1/E2',  taxCode: 'iit' },
        { id: 'special-deduction',     branch: 'A', primary: 'F1/E4',  secondary: ['F1/E18'], taxCode: 'iit' },
        { id: 'special-deduction-deep', branch: 'A', primary: 'F1/E4', secondary: ['B/C5'], taxCode: 'iit' },
        { id: 'equity',                branch: 'A', primary: 'F1/E9',  taxCode: 'iit' },
        { id: 'equity-deep',           branch: 'A', primary: 'F1/E9',  taxCode: 'iit' },
        { id: 'severance',             branch: 'A', primary: 'F1/E7',  secondary: ['B/C5'], taxCode: 'iit' },
        { id: 'severance-deep',        branch: 'A', primary: 'F1/E7',  secondary: ['B/C5'], taxCode: 'iit' },
        { id: 'early-retirement',      branch: 'A', primary: 'F1/E8',  taxCode: 'iit' },
        { id: 'early-retirement-deep', branch: 'A', primary: 'F1/E8',  taxCode: 'iit' },
        { id: 'annuity',               branch: 'A', primary: 'F1/E12', taxCode: 'iit' },

        // F1–F4 年度汇算出口（3 个工具）
        { id: 'annual-settlement',      branch: 'A', primary: 'F1/E3', taxCode: 'iit',
          note: '综合所得四格共同的年度出口，挂在 F1 分支末（总表树）' },
        { id: 'annual-settlement-deep', branch: 'A', primary: 'F1/E3', taxCode: 'iit' },
        { id: 'forward',                branch: 'A', primary: 'F1/E3', taxCode: 'iit' },

        // F2 劳务报酬（2 个工具）
        { id: 'withholding',      branch: 'A', primary: 'F2/E5', secondary: ['B/C2'], taxCode: 'iit' },
        { id: 'withholding-deep', branch: 'A', primary: 'F2/E5', secondary: ['B/C2'], taxCode: 'iit' },

        // F3 / F4 / F6 / F9 共用的通用格（1 个工具）
        { id: 'classification', branch: 'A', primary: 'F6', secondary: ['F9', 'F3', 'F4'], taxCode: 'iit',
          mixed: '兼 F3 / F4 两个综合所得项：不是拆，是按 9 格补独立入口（内核保留一个）' },

        // F5 经营所得（2 个工具）
        { id: 'business-income', branch: 'A', primary: 'F5/E19', secondary: ['B/C2'], taxCode: 'iit' },
        { id: 'business',        branch: 'A', primary: 'F5/E19', secondary: ['B/C2'], taxCode: 'iit' },

        // F7 财产租赁（1 个工具 —— 阶段22 M5：全表最后一块 0 工具的格子补上了）
        { id: 'property-rental', branch: 'A', primary: 'F7/E17', secondary: ['B/C3'], taxCode: 'iit',
          note: '真正的跨税种组合器：个税 + 房产税 + 增值税 + 附加 + 印花税一屏出总额，各税种仍调自己的内核' },

        // F8 财产转让（1 个工具）
        { id: 'property-transfer', branch: 'A', primary: 'F8/E15', taxCode: 'iit',
          mixed: '只算个税；增值税 / 契税 / 附加靠手填 —— 应写组合器调现有内核，不重算' },

        // L1 税务身份（3 个工具 —— 非居民 / 外籍，见总表 §1.1）
        { id: 'expat',      branch: 'A', primary: 'L1/expat', taxCode: 'iit',
          note: '外籍人士八类津补贴免税' },
        { id: 'expat-deep', branch: 'A', primary: 'L1/expat', taxCode: 'iit' },
        { id: 'non-resident', branch: 'A', primary: 'L1/non-resident', secondary: ['F1'], taxCode: 'iit',
          note: '非居民按月分项计税（F1 的算法变体，挂在身份层）' },

        // 跨格子事项（5 个工具）
        { id: 'private-pension',      branch: 'A', primary: 'cross/E13', secondary: ['F5'], taxCode: 'iit' },
        { id: 'private-pension-deep', branch: 'A', primary: 'cross/E13', taxCode: 'iit' },
        { id: 'health-insurance',     branch: 'A', primary: 'cross/E14', taxCode: 'iit' },
        { id: 'donation',             branch: 'A', primary: 'cross/E24', taxCode: 'iit' },
        // 阶段22 M5 续（v2.2.0）：买房不是一笔所得（所以 9 格收不下它），按跨格子事项挂在 E16，
        // 次挂 B/C3 契税 —— B 分支那一格此前也是空的，企业买房同样要缴这一笔。
        { id: 'deed-tax', branch: 'A', primary: 'cross/E16', secondary: ['B/C3'], taxCode: 'deed',
          note: '契税 + 印花税：计税依据不含增值税，个人购买住房按「套数 × 面积」四格给优惠' },
        // 阶段22 M5 续（v2.3.0）：买车与买房同类（不是所得，是购置环节一次性征收的税），按跨格子
        // 事项挂在 E25，次挂 B/C3 —— 企业买车同样缴这一笔，且除新能源减免外没有别的优惠档。
        { id: 'vehicle-purchase-tax', branch: 'A', primary: 'cross/E25', secondary: ['B/C3'],
          taxCode: 'vehicle-purchase',
          note: '计税价格不含增值税（发票价按 13% 分离）；新能源 2026 年起减半且每辆封顶 7500 元' },

        // ===== B 企业（11 个工具）=====

        // C1 流转税（4 个工具）
        { id: 'vat',              branch: 'B', primary: 'B/C1', secondary: ['F5'], taxCode: 'vat' },
        { id: 'vat-deep',         branch: 'B', primary: 'B/C1', secondary: ['F5'], taxCode: 'vat' },
        { id: 'surtax-stamp',     branch: 'B', primary: 'B/C1', secondary: ['B/C3', 'F5'], taxCode: 'city-tax',
          mixed: '附加税费与印花税混装：附加税费归 B/C1，印花税归 B/C3 —— 建议拆' },
        { id: 'surtax-stamp-deep', branch: 'B', primary: 'B/C1', secondary: ['B/C3', 'F5'], taxCode: 'city-tax',
          mixed: '同 surtax-stamp，建议拆' },

        // C2 所得税（2 个工具；个税代扣双入口复用 A 侧，不占 B 计数）
        { id: 'corporate-income-tax',      branch: 'B', primary: 'B/C2', taxCode: 'cit' },
        { id: 'corporate-income-tax-deep', branch: 'B', primary: 'B/C2', taxCode: 'cit' },

        // C5 费与用工（5 个工具）
        { id: 'social-base',      branch: 'B', primary: 'B/C5', secondary: ['F5'], taxCode: 'social' },
        { id: 'social-base-deep', branch: 'B', primary: 'B/C5', secondary: ['F5'], taxCode: 'social' },
        { id: 'disability-fund',      branch: 'B', primary: 'B/C5', secondary: ['F5'], taxCode: 'disability',
          mixed: '残保金与工会经费同在一个工具 —— 建议拆' },
        { id: 'disability-fund-deep', branch: 'B', primary: 'B/C5', secondary: ['F5'], taxCode: 'disability',
          mixed: '同 disability-fund，建议拆' },
        { id: 'employer-cost', branch: 'B', primary: 'B/C5', taxCode: null,
          mixed: 'not-a-tax：企业用工成本是成本测算，不是税种' }
    ];

    var MOUNT_INDEX = {};
    MOUNTS.forEach(function (m) { MOUNT_INDEX[m.id] = m; });

    function all() { return MOUNTS.slice(); }
    function get(id) { return MOUNT_INDEX[id] || null; }
    function byBranch(branch) {
        return MOUNTS.filter(function (m) { return m.branch === branch; });
    }
    function byTaxCode(code) {
        return MOUNTS.filter(function (m) { return m.taxCode === code; });
    }
    function countByBranch(branch) { return byBranch(branch).length; }
    function categoryCode(code) { return CATEGORY_CODES[code] || null; }

    // 挂在某路径的工具（primary 精确命中；secondary 也计入，供「这里还有什么」查询）
    function at(path) {
        return MOUNTS.filter(function (m) {
            if (m.primary === path) return true;
            return (m.secondary || []).indexOf(path) >= 0;
        });
    }

    function pathKind(p) {
        if (/^B\/C\d$/.test(p)) return 'b-category';
        if (/^L1\//.test(p)) return 'identity';
        if (/^cross\/E\d+$/.test(p)) return 'cross';
        if (/^F\d\/E\d+$/.test(p)) return 'form-event';
        if (/^F\d$/.test(p)) return 'form';
        return 'unknown';
    }

    // 口径守护：把规格 §4.2（修正后）的约束变成可执行检查。返回问题数组，空数组 = 全部通过。
    // 依赖三个字典已加载（index.html 顺序保证；测试里显式 require 四件）。
    function validate() {
        var issues = [];
        var reg = window.EuriskoToolRegistry;
        var tax = window.EuriskoTaxTaxonomy;
        var person = window.EuriskoPersonTaxonomy;

        // 1. 数量与双向一致（无孤儿、无幽灵）
        if (MOUNTS.length !== 44) issues.push('挂载点必须恰好 44 条，实际 ' + MOUNTS.length);
        if (reg) {
            var regIds = reg.all().concat(reg.deep()).map(function (t) { return t.id; });
            var mountIds = MOUNTS.map(function (m) { return m.id; });
            regIds.forEach(function (id) {
                if (mountIds.indexOf(id) < 0) issues.push('注册表里有、挂载表里没有（幽灵入口）：' + id);
            });
            mountIds.forEach(function (id) {
                if (regIds.indexOf(id) < 0) issues.push('挂载表里有、注册表里没有（孤儿挂载）：' + id);
            });
        }

        var seenId = {};
        MOUNTS.forEach(function (m) {
            // 2. id 唯一、每条恰一个非空 primary、branch 合法
            if (seenId[m.id]) issues.push('挂载点 id 重复：' + m.id);
            seenId[m.id] = true;
            if (!m.primary) issues.push(m.id + '：缺 primary（一个工具必须有一个主挂载点）');
            if (['A', 'B'].indexOf(m.branch) < 0) issues.push(m.id + '：branch 非法');

            var kind = m.primary ? pathKind(m.primary) : 'unknown';
            // 3. branch 与 primary 前缀一致
            if (m.branch === 'B' && kind !== 'b-category') {
                issues.push(m.id + '：B 分支的 primary 必须是 B/C* 路径');
            }
            if (m.branch === 'A' && kind === 'b-category') {
                issues.push(m.id + '：A 分支的 primary 不能指向 B 侧税类');
            }

            // 4. primary 路径的每一端都必须真实存在
            if (kind === 'unknown') issues.push(m.id + '：primary 路径格式无法解析：' + m.primary);
            if (kind === 'form' && person && !person.getForm(m.primary)) {
                issues.push(m.id + '：primary 指向不存在的格 ' + m.primary);
            }
            if (kind === 'form-event' && person) {
                var seg = m.primary.split('/');
                var f = person.getForm(seg[0]);
                var e = person.getEvent(seg[1]);
                if (!f) issues.push(m.id + '：primary 的格不存在：' + m.primary);
                if (!e) { issues.push(m.id + '：primary 的事件不存在：' + m.primary); }
                else {
                    var forms = Array.isArray(e.form) ? e.form : [e.form];
                    if (forms.indexOf(seg[0]) < 0) {
                        issues.push(m.id + '：事件 ' + e.id + ' 不属于格 ' + seg[0]);
                    }
                }
            }
            if (kind === 'cross' && person) {
                var ev = person.getEvent(m.primary.split('/')[1]);
                if (!ev) issues.push(m.id + '：primary 的事件不存在：' + m.primary);
                else if (ev.form !== 'cross') {
                    issues.push(m.id + '：cross 路径只能挂跨格子事件，' + ev.id + ' 不是');
                }
            }
            if (kind === 'identity' && !/^L1\/(expat|non-resident)$/.test(m.primary)) {
                issues.push(m.id + '：L1 身份层目前只有 expat / non-resident 两个挂载位：' + m.primary);
            }
            if (kind === 'b-category') {
                var cat = CATEGORY_CODES[m.primary.split('/')[1]];
                if (!cat) issues.push(m.id + '：B 侧类码非法：' + m.primary);
                else if (tax && !tax.byCategory(cat).length) {
                    issues.push(m.id + '：税类 ' + cat + ' 下没有任何税种');
                }
            }

            // 5. taxCode 非空时必须存在于税种字典；null 只允许 not-a-tax 成本工具
            if (m.taxCode == null) {
                if (!/not-a-tax/.test(m.mixed || '')) {
                    issues.push(m.id + '：taxCode 为空但没标 not-a-tax');
                }
            } else if (tax && !tax.get(m.taxCode)) {
                issues.push(m.id + '：taxCode ' + m.taxCode + ' 不在税种字典里');
            }

            // 6. secondary 路径合法，且不与自己的 primary 重复
            (m.secondary || []).forEach(function (p) {
                if (p === m.primary) issues.push(m.id + '：secondary 与 primary 重复：' + p);
                var sk = pathKind(p);
                if (sk === 'unknown') issues.push(m.id + '：secondary 路径无法解析：' + p);
                if (sk === 'form' && person && !person.getForm(p)) {
                    issues.push(m.id + '：secondary 指向不存在的格 ' + p);
                }
                if (sk === 'form-event' && person) {
                    var sg = p.split('/');
                    var e2 = person.getEvent(sg[1]);
                    if (!person.getForm(sg[0])) issues.push(m.id + '：secondary 的格不存在：' + p);
                    if (!e2) issues.push(m.id + '：secondary 的事件不存在：' + p);
                }
                if (sk === 'cross' && person && (!person.getEvent(p.split('/')[1]))) {
                    issues.push(m.id + '：secondary 的事件不存在：' + p);
                }
                if (sk === 'b-category' && !CATEGORY_CODES[p.split('/')[1]]) {
                    issues.push(m.id + '：secondary 的 B 侧类码非法：' + p);
                }
            });
        });

        // 7. 计数口径：A 33 / B 11（按工具数，速算 + 完整测算算同一入口但各占一条）
        //    阶段22 M5 续：补上 deed-tax（A / cross/E16）后 A 由 31 → 32；
        //    再补上 vehicle-purchase-tax（A / cross/E25）后 A 由 32 → 33。
        if (byBranch('A').length !== 33) issues.push('A 分支必须恰好 33 个工具，实际 ' + byBranch('A').length);
        if (byBranch('B').length !== 11) issues.push('B 分支必须恰好 11 个工具，实际 ' + byBranch('B').length);

        // 8. 已知混装 / 待处理工具必须带 mixed（总表 §3 的 9 个 ⚠️ 里与本表相关的 7 个工具）
        ['surtax-stamp', 'surtax-stamp-deep', 'disability-fund', 'disability-fund-deep',
            'classification', 'property-transfer', 'employer-cost'].forEach(function (id) {
            var m = MOUNT_INDEX[id];
            if (!m || !m.mixed) issues.push(id + '：混装 / 待处理工具必须写 mixed 说明');
        });

        return issues;
    }

    window.EuriskoToolTaxonomy = {
        all: all,
        get: get,
        byBranch: byBranch,
        byTaxCode: byTaxCode,
        at: at,
        countByBranch: countByBranch,
        categoryCode: categoryCode,
        validate: validate
    };
})();
