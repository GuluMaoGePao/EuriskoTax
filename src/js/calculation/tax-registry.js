/**
 * 税种注册表（阶段15 15D-1）—— 「有哪些税种、按什么政策算、什么时候到期」的单点定义
 *
 * 为什么要这个文件：
 *   阶段15 要把个税做深（15A）并补齐企业税种（15B）。税种一多，最先腐烂的不是算法，
 *   而是**元数据**：同一个政策依据文号在三个页面里写了三种简称、某个优惠政策到期了
 *   但只有当初写它的那个人记得。算法错会立刻被对拍测试抓住，元数据错则只会让页面
 *   慢慢失真 —— 所以把元数据收进一张注册表，页面只负责「读出来展示」。
 *
 * 刻意不做的事（避免变成第二份口径）：
 *   - **不存数字**：税率表与费用扣除规则仍在 tax-constants.js（出厂基线，可被
 *     tax-rates-sync.js 用管理台发布值热改）。注册表只记「参数在哪个全局量里」，
 *     这样改税率只改一处，注册表不需要跟着改。
 *   - **不碰计算**：本文件是纯数据 + 查询函数，不含任何税额计算，便于被页面与
 *     未来的 B 端 API 描述接口共用。
 *
 * 每个条目字段：
 *   id            唯一标识（页面 / 测试 / 未来的 API 都用它引用）
 *   name          展示名
 *   category      iit（个人所得税）/ vat / cit / surtax / stamp …
 *   scope         适用范围一句话
 *   effectiveFrom 生效期（YYYY-MM-DD）
 *   expiresOn     到期日（YYYY-MM-DD，null = 长期有效）
 *   basis         政策依据数组 [{ title, doc, url? }]，doc 为文号
 *   params        参数来源：{ 用途: 全局量名 }，由 resolveParams() 取出真实对象
 *   page          对应落地页（无则 null）
 *   note          口径提醒（易错点 / 近似说明）
 *
 * 对外接口：window.EuriskoTaxRegistry = {
 *   get, list, has, basisOf, resolveParams, statusOf, expiringWithin, CATEGORIES, VERSION
 * }
 */
(function () {
    'use strict';

    // 注册表版本：新增/修订税种条目时递增（与 TAX_CONSTANTS_VERSION 无关：那边管数字，这边管口径描述）
    var VERSION = '2026.1';

    var CATEGORIES = {
        iit: '个人所得税',
        vat: '增值税',
        cit: '企业所得税',
        surtax: '附加税费',
        stamp: '印花税',
        social: '社保公积金'
    };

    var TAXES = [
        {
            id: 'comprehensive',
            name: '工资薪金（综合所得累计预扣预缴）',
            category: 'iit',
            scope: '居民个人工资薪金所得，按累计预扣法逐月预扣、年度汇算清缴',
            effectiveFrom: '2019-01-01',
            expiresOn: null,
            basis: [
                { title: '《中华人民共和国个人所得税法》', doc: '主席令第九号（2018 年修正）' },
                { title: '《个人所得税扣缴申报管理办法（试行）》', doc: '国家税务总局公告 2018 年第 61 号' }
            ],
            params: { rates: 'comprehensiveTaxRates' },
            page: '/seo/salary-tax.html',
            note: '累计预扣预缴：按截至当月的累计应纳税所得额定档，故下半年到手通常低于上半年。'
        },
        {
            id: 'withholding',
            name: '劳务报酬 / 稿酬 / 特许权使用费（预扣预缴）',
            category: 'iit',
            scope: '居民个人取得的劳务报酬所得、稿酬所得、特许权使用费所得，由支付方预扣预缴',
            effectiveFrom: '2019-01-01',
            expiresOn: null,
            basis: [
                { title: '《个人所得税扣缴申报管理办法（试行）》第八条、第九条', doc: '国家税务总局公告 2018 年第 61 号' },
                { title: '《中华人民共和国个人所得税法实施条例》', doc: '国务院令第 707 号' }
            ],
            params: { rates: 'withholdingTaxRates', rules: 'otherIncomeRules' },
            page: '/seo/labor-withholding.html',
            note: '费用扣除：≤4000 元减 800 元、>4000 元减 20%；稿酬在费用扣除后再减按 70% 计算。年度汇算时按收入额（劳务/特许权 80%、稿酬 56%）并入综合所得，预扣与最终税负的差额多退少补。'
        },
        {
            id: 'bonus',
            name: '全年一次性奖金（单独计税）',
            category: 'iit',
            scope: '居民个人取得的全年一次性奖金，可选择单独计税或并入综合所得',
            // 该政策经历过多轮延续（2018 年第 164 号 → 2021 年第 42 号 → 2023 年第 30 号），
            // 这里记的是**当前这一轮**延续期的口径，到期日才是要盯的字段
            effectiveFrom: '2024-01-01',
            expiresOn: '2027-12-31',
            basis: [
                { title: '《关于延续实施全年一次性奖金个人所得税政策的公告》', doc: '财政部 税务总局公告 2023 年第 30 号' }
            ],
            params: { rates: 'bonusMonthlyTaxRates' },
            page: '/seo/bonus-tax.html',
            note: '一个纳税年度内只能用一次；税率由「奖金 ÷ 12」定档、税额按奖金全额计算，故存在临界点跳档。'
        },
        {
            id: 'equity-incentive',
            name: '股权激励所得（股票期权 / 限制性股票 / 股票增值权 / 股权奖励）',
            category: 'iit',
            scope: '居民个人取得的股权激励，符合条件的不并入当年综合所得，全额单独适用综合所得税率表',
            effectiveFrom: '2019-01-01',
            expiresOn: '2027-12-31',
            basis: [
                { title: '《关于延续实施上市公司股权激励个人所得税政策的公告》', doc: '财政部 税务总局公告 2023 年第 25 号' },
                { title: '《关于个人所得税法修改后有关优惠政策衔接问题的通知》第二条', doc: '财税〔2018〕164 号' },
                { title: '《关于完善股权激励和技术入股有关所得税政策的通知》', doc: '财税〔2016〕101 号' }
            ],
            params: { rules: 'equityIncentiveRules', rates: 'comprehensiveTaxRates' },
            page: '/seo/equity-incentive.html',
            note: '应纳税额 = 股权激励收入 × 年度税率 − 速算扣除数（不减除费用）；一个纳税年度内两次以上股权激励应合并计算。非上市公司符合条件的股票期权、限制性股票、股权奖励可递延至转让时按「财产转让所得」20% 计税。'
        },
        {
            id: 'severance',
            name: '解除劳动关系一次性补偿收入（经济补偿金 / 生活补助费 / 医疗补助费）',
            category: 'iit',
            scope: '居民个人因解除劳动关系取得一次性补偿收入：当地上年职工平均工资 3 倍以内免税，超过部分单独适用综合所得税率表',
            effectiveFrom: '2019-01-01',
            expiresOn: null,
            basis: [
                { title: '《关于个人所得税法修改后有关优惠政策衔接问题的通知》第五条第一项', doc: '财税〔2018〕164 号' },
                { title: '《关于个人与用人单位解除劳动关系取得的一次性补偿收入征免个人所得税问题的通知》', doc: '财税〔2001〕157 号' },
                { title: '《中华人民共和国劳动合同法》第四十七条（经济补偿的封顶规则）', doc: '主席令第六十五号（2012 年修正）' }
            ],
            params: { rules: 'severanceRules', rates: 'comprehensiveTaxRates' },
            page: '/seo/severance.html',
            note: '免税额度 = 当地上年职工年平均工资 × 3，且只能抵「符合法定标准的补偿」；超过部分不并入当年综合所得、不减除费用，单独适用综合所得税率表。「12 年」是《劳动合同法》对经济补偿金本身的封顶（月工资另按 3 倍封顶），不是计税平均年限 —— 国税发〔1999〕178 号「按工作年限平均」的做法自 2019 年起不再执行。'
        },
        {
            id: 'special-deduction',
            name: '专项附加扣除（婴幼儿照护 / 子女教育 / 继续教育 / 大病医疗 / 住房贷款利息 / 住房租金 / 赡养老人）',
            category: 'iit',
            scope: '居民个人综合所得可扣除的七项专项附加扣除：按月定额或年度据实扣除，直接降低应纳税所得额',
            effectiveFrom: '2019-01-01',
            expiresOn: null,
            basis: [
                { title: '《个人所得税专项附加扣除暂行办法》', doc: '国发〔2018〕41 号' },
                { title: '《关于提高个人所得税有关专项附加扣除标准的通知》（2023-01-01 起提高三项标准）', doc: '国发〔2023〕13 号' },
                { title: '《中华人民共和国个人所得税法》第六条第四款（专项附加扣除）', doc: '主席令第九号（2018 年修正）' }
            ],
            params: { rules: 'specialDeductionRules', rates: 'comprehensiveTaxRates' },
            page: '/seo/special-deduction.html',
            note: '扣除的是**应纳税所得额**而不是直接减税额：少交多少税取决于扣除额落在哪几档税率上。大病医疗按年度据实扣除（超 15000 元的部分、限额 80000 元）且只能在汇算清缴时办理；住房贷款利息与住房租金同一纳税年度只能二选一；每年 12 月需确认次年信息，未确认只是暂停按月扣除，汇算时可补扣。'
        },
        {
            id: 'private-pension',
            name: '个人养老金（缴费税前扣除 + 领取按 3% 单独计税）',
            category: 'iit',
            scope: '参加个人养老金制度的个人：缴费环节按年限额在综合所得或经营所得中据实扣除，投资环节收益暂不征税，领取环节按 3% 单独计税',
            effectiveFrom: '2024-01-01',
            expiresOn: null,
            basis: [
                { title: '《关于个人养老金有关个人所得税政策的公告》（全国实施）', doc: '财政部 税务总局公告 2024 年第 21 号' },
                { title: '《关于个人养老金有关个人所得税政策的公告》（先行城市）', doc: '财政部 税务总局公告 2022 年第 34 号' }
            ],
            params: { rules: 'privatePensionRules', rates: 'comprehensiveTaxRates' },
            page: '/seo/private-pension.html',
            note: '缴费扣的是**应纳税所得额**而不是直接减税额，少交的税 = T(x) − T(x − min(缴费额, 年限额))；只有适用税率**高于 3%** 才划算 —— 落在 3% 档（全年应纳税所得额 ≤ 36000）的人省 3%、领取时再交 3%，等于白锁流动性。领取时按领取额**全额**（本金 + 收益）乘 3%，单独计税、不并入综合所得。缴费上限由人社部与财政部适时调整。'
        },
        {
            id: 'expat-allowance',
            name: '外籍个人津补贴免税（与专项附加扣除二选一，执行至 2027-12-31）',
            category: 'iit',
            scope: '符合居民个人条件的外籍个人（含港澳台）：可选择专项附加扣除，或按财税字〔1994〕020 号等规定享受住房补贴、语言训练费、子女教育费等津补贴免税，二者不得同时享受',
            effectiveFrom: '2023-01-01',
            expiresOn: '2027-12-31',
            basis: [
                { title: '《关于延续实施外籍个人有关津补贴个人所得税政策的公告》（执行至 2027-12-31）', doc: '财政部 税务总局公告 2023 年第 29 号' },
                { title: '《关于个人所得税若干政策问题的通知》（外籍个人免税项目）', doc: '财税字〔1994〕020 号' },
                { title: '《关于外籍个人取得有关补贴征免个人所得税执行问题的通知》', doc: '国税发〔1997〕54 号' },
                { title: '《关于外籍个人取得港澳地区住房等补贴征免个人所得税的通知》', doc: '财税〔2004〕29 号' }
            ],
            params: { rules: 'expatAllowanceRules', rates: 'comprehensiveTaxRates' },
            page: '/seo/expat-allowance.html',
            note: '这是**二选一**而非叠加：不能一边扣专项附加扣除、一边把津补贴当免税；一经选择，一个纳税年度内不得变更。两条路径的「少交的税」都按 T(x) − T(x − 金额) 计算（扣的是应纳税所得额）。**本条有到期日 2027-12-31** —— 到期提醒由 statusOf / expiringWithin 统一给出，页面必须写明 2028 年起如何衔接。'
        },
        {
            id: 'settlement',
            name: '综合所得年度汇算清缴',
            category: 'iit',
            scope: '居民个人综合所得的年度汇算（次年 3 月 1 日至 6 月 30 日办理）',
            effectiveFrom: '2019-01-01',
            expiresOn: null,
            basis: [
                { title: '《关于办理 2019 年度个人所得税综合所得汇算清缴事项的公告》', doc: '国家税务总局公告 2019 年第 44 号' }
            ],
            params: { rates: 'comprehensiveTaxRates' },
            page: '/seo/annual-settlement.html',
            note: '应退/应补 = 全年应纳税额 − 全年已预缴税额；差额来自多处工资合并、年中跳槽、扣除未及时填报等。'
        }
    ];

    var byId = {};
    TAXES.forEach(function (t) { byId[t.id] = t; });

    function get(id) { return byId[id] || null; }
    function has(id) { return !!byId[id]; }
    function list() { return TAXES.slice(); }
    function listByCategory(category) { return TAXES.filter(function (t) { return t.category === category; }); }

    // 政策依据：给页面展示用（页面只负责呈现，不自己写文号）
    function basisOf(id) {
        var t = get(id);
        return t ? t.basis.slice() : [];
    }

    // 取出条目声明的参数对象（读全局量，不复制数值）
    function resolveParams(id) {
        var t = get(id);
        if (!t || !t.params) return {};
        var out = {};
        Object.keys(t.params).forEach(function (key) {
            var name = t.params[key];
            var scope = typeof window !== 'undefined' ? window : {};
            var value = scope[name];
            if (value === undefined && scope.EuriskoTaxConstants) value = scope.EuriskoTaxConstants[name];
            out[key] = value === undefined ? null : value;
        });
        return out;
    }

    function daysBetween(fromISO, toISO) {
        var a = new Date(fromISO + 'T00:00:00Z').getTime();
        var b = new Date(toISO + 'T00:00:00Z').getTime();
        if (!isFinite(a) || !isFinite(b)) return null;
        return Math.round((b - a) / 86400000);
    }

    function todayISO(now) {
        var d = now instanceof Date ? now : (now ? new Date(now) : new Date());
        if (!isFinite(d.getTime())) return null;
        return d.toISOString().slice(0, 10);
    }

    // 政策时效状态：到期前必须复核（页面上的「执行至 X」不是写完就忘的装饰）
    function statusOf(id, now) {
        var t = get(id);
        if (!t) return null;
        var today = todayISO(now);
        if (!t.expiresOn || !today) {
            return { id: t.id, active: true, expired: false, expiresOn: t.expiresOn || null, daysLeft: null };
        }
        var daysLeft = daysBetween(today, t.expiresOn);
        return {
            id: t.id,
            active: daysLeft === null ? true : daysLeft >= 0,
            expired: daysLeft === null ? false : daysLeft < 0,
            expiresOn: t.expiresOn,
            daysLeft: daysLeft
        };
    }

    // 到期提醒：把 days 天内到期（含已过期）的条目列出来，供页面提示与运维复核
    function expiringWithin(days, now) {
        var horizon = Number(days);
        if (!isFinite(horizon)) return [];
        return TAXES.filter(function (t) {
            var s = statusOf(t.id, now);
            return !!s && s.daysLeft !== null && s.daysLeft <= horizon;
        }).map(function (t) { return statusOf(t.id, now); });
    }

    var api = {
        VERSION: VERSION,
        CATEGORIES: CATEGORIES,
        get: get,
        has: has,
        list: list,
        listByCategory: listByCategory,
        basisOf: basisOf,
        resolveParams: resolveParams,
        statusOf: statusOf,
        expiringWithin: expiringWithin
    };

    if (typeof window !== 'undefined') window.EuriskoTaxRegistry = api;
})();
