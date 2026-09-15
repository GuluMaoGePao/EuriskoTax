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
    var VERSION = '2026.2';

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
            id: 'early-retirement',
            name: '提前退休 / 内部退养一次性收入（与离职补偿金不同口径）',
            category: 'iit',
            scope: '提前退休：一次性补贴按实际年度数分摊、单独适用综合所得税率表；内部退养：一次性收入按月平均只为定档，与当月工资合并后按月度税率表计征',
            effectiveFrom: '2019-01-01',
            expiresOn: null,
            basis: [
                { title: '《关于个人所得税法修改后有关优惠政策衔接问题的通知》第五条（二）（三）', doc: '财税〔2018〕164 号' },
                { title: '《关于个人所得税有关政策问题的通知》第一条（内部退养）', doc: '国税发〔1999〕58 号' }
            ],
            params: { rules: 'earlyRetirementRules', rates: 'comprehensiveTaxRates', monthlyRates: 'bonusMonthlyTaxRates' },
            page: '/seo/early-retirement.html',
            note: '三件事不能混：① 提前退休是**真分摊**（先按年减 6 万、算完乘回年数），内部退养的「平均」**只用来定档**、税基仍是当月工资 + 一次性收入全额；② 提前退休用年度表减 6 万/年，内部退养用月度表减 5000 元/月并与当月工资合并定档；③ 这些与**离职补偿金**（3 倍社平免税 + 超额单独计税、不做分摊）不是一回事，页面必须写明区别。'
        },
        {
            id: 'vat',
            name: '增值税（一般纳税人：销项 − 进项；小规模：销售额 × 征收率）',
            category: 'vat',
            scope: '在境内销售货物、服务、无形资产、不动产及进口货物：一般纳税人适用一般计税方法（销项税额 − 进项税额），小规模纳税人适用简易计税方法（销售额 × 征收率）',
            effectiveFrom: '2026-01-01',
            expiresOn: null,
            basis: [
                { title: '《中华人民共和国增值税法》（2026-01-01 起施行，原暂行条例同日废止）', doc: '主席令第四十一号' },
                { title: '《中华人民共和国增值税法实施条例》', doc: '国务院令第 826 号' }
            ],
            params: { rules: 'vatRules' },
            page: '/seo/vat.html',
            note: '增值税是**价外税**：合同里的「含税价」要先按税率分离出销售额与税额再算，直接用含税价乘税率会**多算**。一般纳税人应纳税额 = 销项税额 − 进项税额（进项须凭合规扣税凭证抵扣，不足抵扣的部分留抵下期，不会倒欠）；小规模纳税人不得抵扣进项，直接按不含税销售额 × 征收率。'
        },
        {
            id: 'vat-small-scale',
            name: '增值税小规模纳税人减免（月 10 万 / 季 30 万以下免征、3% 减按 1%）',
            category: 'vat',
            scope: '增值税小规模纳税人：月销售额 10 万元以下（按季纳税 30 万元以下）免征增值税；适用 3% 征收率的应税销售收入减按 1% 征收',
            effectiveFrom: '2023-01-01',
            expiresOn: '2027-12-31',
            basis: [
                { title: '《关于增值税小规模纳税人减免增值税政策的公告》', doc: '财政部 税务总局公告 2023 年第 19 号' }
            ],
            params: { rules: 'vatRules' },
            page: '/seo/vat.html',
            note: '免征判断用**不含税**销售额、按**全部**销售额判断（不是只对超出部分）：季度 30 万元是临界点，多 1 分钱即全额按 1% 计税（多缴约 3000 元），开票与确认收入时点要算清楚。免征适用范围是普通发票部分；**开具增值税专用发票的部分不免税**，需按票面征收率缴纳。本条为阶段性优惠，执行至 2027-12-31，到期状态由 statusOf 给出，页面写明 2028 年起如何衔接。'
        },
        {
            id: 'corporate-income-tax',
            name: '企业所得税（一般 25% / 高新 15% / 小型微利实际税负 5%）',
            category: 'cit',
            scope: '企业和其他取得收入的组织：应纳税所得额 × 适用税率 − 减免抵免税额；居民企业一般 25%，高新技术企业减按 15%，小型微利企业减按 25% 计入应纳税所得额后按 20% 税率（实际税负 5%）',
            effectiveFrom: '2008-01-01',
            expiresOn: null,
            basis: [
                { title: '《中华人民共和国企业所得税法》（2008-01-01 施行，2018 年第七次修正）', doc: '主席令第 63 号' },
                { title: '《中华人民共和国企业所得税法实施条例》', doc: '国务院令第 512 号' },
                { title: '《中华人民共和国个人所得税法》（税后利润分红给个人股东按「利息、股息、红利所得」20%）', doc: '主席令第 9 号' }
            ],
            params: { rules: 'corporateIncomeTaxRules' },
            page: '/seo/corporate-income-tax.html',
            note: '企业所得税算的是**利润**（应纳税所得额），不是收入；与增值税并行、互不影响。三档税率里最容易看错的是小微：优惠是「**减按 25% 计入应纳税所得额**再按 20% 税率」，两档相乘得到实际税负 5%，并不是直接给了一个 5% 的税率。高新 15% 与小微 5% **不叠加**，符合条件时按孰优。'
        },
        {
            id: 'corporate-small-low-profit',
            name: '小型微利企业所得税优惠（实际税负 5%，门槛 300 万·300 人·5000 万）',
            category: 'cit',
            scope: '小型微利企业：年应纳税所得额不超过 300 万元的部分，减按 25% 计入应纳税所得额，按 20% 税率缴纳企业所得税；需同时符合应纳税所得额 ≤ 300 万元、从业人数 ≤ 300 人、资产总额 ≤ 5000 万元且从事国家非限制和禁止行业',
            effectiveFrom: '2023-01-01',
            expiresOn: '2027-12-31',
            basis: [
                { title: '《关于进一步支持小微企业和个体工商户发展有关税费政策的公告》（第三条：延续执行至 2027-12-31）', doc: '财政部 税务总局公告 2023 年第 12 号' },
                { title: '《关于实施小微企业普惠性税收减免政策的通知》（小型微利企业三项条件：300 万 / 300 人 / 5000 万元）', doc: '财税〔2019〕13 号' }
            ],
            params: { rules: 'corporateIncomeTaxRules' },
            page: '/seo/corporate-income-tax.html',
            note: '三个条件是**且**的关系、且是**临界点**而非超额累进：任一超标即**全额**按 25% 计税，不是只对超出部分。300 万元处最陡 —— 应纳税所得额 300 万交 15 万，301 万交 75.25 万，多 1 万元利润多缴 60.25 万元税。本条为阶段性优惠，执行至 2027-12-31，到期状态由 statusOf 给出。'
        },
        {
            id: 'surtax',
            name: '城市维护建设税及教育费附加（市区 7% / 县城、镇 5% / 其他 1%，另加教育费附加 3% 与地方教育附加 2%）',
            category: 'surtax',
            scope: '在境内缴纳增值税、消费税的单位和个人，以依法实际缴纳的增值税、消费税税额为计税依据缴纳城建税，并同时缴纳教育费附加 3%、地方教育附加 2%',
            effectiveFrom: '2021-09-01',
            expiresOn: null,
            basis: [
                { title: '《中华人民共和国城市维护建设税法》（第四条：市区 7%、县城和镇 5%、其他 1%；第二条：以依法实际缴纳的增值税、消费税税额为计税依据）', doc: '主席令第 51 号' },
                { title: '《征收教育费附加的暂行规定》（2011 年修订，费率 3%）', doc: '国务院令第 60 号' },
                { title: '《关于统一地方教育附加政策有关问题的通知》（统一按 2% 征收）', doc: '财综〔2010〕98 号' }
            ],
            params: { rules: 'surtaxRules' },
            page: '/seo/surtax-stamp-duty.html',
            note: '附加税不是对**收入**征的，而是跟着**实际缴纳的增值税、消费税**走 —— 增值税免了，附加税跟着免；增值税是 0，附加税就是 0。城建税三档按**纳税人所在地**划分，不是按企业规模。市区常说「12% 附加」= 7% + 3% + 2%。'
        },
        {
            id: 'stamp-duty',
            name: '印花税（按税目：借款 0.05‰ / 买卖 0.3‰ / 租赁 1‰ / 股权转让 0.5‰ / 营业账簿 0.25‰）',
            category: 'stamp',
            scope: '在境内书立应税凭证、进行证券交易的单位和个人，按《印花税税目税率表》以计税依据乘以适用税率计算应纳税额',
            effectiveFrom: '2022-07-01',
            expiresOn: null,
            basis: [
                { title: '《中华人民共和国印花税法》（第五条：计税依据不包括列明的增值税税款；第九条：未分别列明金额的从高适用税率；第十一条：营业账簿按增加部分计算）', doc: '主席令第 89 号' }
            ],
            params: { rules: 'stampDutyRules' },
            page: '/seo/surtax-stamp-duty.html',
            note: '最容易多缴的一处：合同里**单独列明增值税**的，印花税按不含税金额贴花；没列明就按全额计征 —— 同一份 100 万元合同，列明税额与否能差出十几元到上百元。营业账簿只对**增加部分**计税，不是每年按注册资本总额重贴。'
        },
        {
            id: 'surtax-stamp-halve',
            name: '“六税两费”减半（城建税、两项教育附加、印花税等，执行至 2027-12-31）',
            category: 'surtax',
            scope: '自 2023-01-01 至 2027-12-31，对增值税小规模纳税人、小型微利企业和个体工商户减半征收资源税（不含水资源税）、城市维护建设税、房产税、城镇土地使用税、印花税（不含证券交易印花税）、耕地占用税和教育费附加、地方教育附加',
            effectiveFrom: '2023-01-01',
            expiresOn: '2027-12-31',
            basis: [
                { title: '《关于进一步支持小微企业和个体工商户发展有关税费政策的公告》（第二条：六税两费在 50% 税额幅度内减征，执行至 2027-12-31）', doc: '财政部 税务总局公告 2023 年第 12 号' }
            ],
            params: { rules: 'surtaxRules' },
            page: '/seo/surtax-stamp-duty.html',
            note: '减半**不是**只对某一项：城建税与两项教育附加一起减半（市区合计由 12% 降到 6%），印花税同样减半，但**证券交易印花税不在减半范围内**。享受主体是增值税小规模纳税人、小型微利企业与个体工商户 —— 一般纳税人若同时是小型微利企业同样可以享受。本条为阶段性优惠，到期状态由 statusOf 给出。'
        },
        {
            id: 'social-insurance',
            name: '社会保险（养老 8%/16%、医疗 2%/约 9.8%、失业 0.5%/0.5%、工伤与生育由单位缴纳）',
            category: 'social',
            scope: '职工基本养老保险、基本医疗保险、失业保险、工伤保险、生育保险：以本人上年度月平均工资为缴费基数，低于当地上年度社平工资 60% 的按 60% 保底、高于 300% 的按 300% 封顶，由单位与个人按比例缴纳',
            effectiveFrom: '2011-07-01',
            expiresOn: null,
            basis: [
                { title: '《中华人民共和国社会保险法》（第五十八条：用人单位应当自用工之日起三十日内为职工办理社会保险登记）', doc: '主席令第 35 号' },
                { title: '《降低社会保险费率综合方案》（养老保险单位缴费比例降至 16%，自 2019 年 5 月 1 日起执行）', doc: '国办发〔2019〕13 号' }
            ],
            params: { rules: 'socialInsuranceRules' },
            page: '/seo/social-base.html',
            note: '缴费基数**不是**当月工资：低于社平工资 60% 按下限保底、高于 300% 按上限封顶，所以工资 3000 元按下限缴、工资 5 万元只按 3 倍封顶数缴。上下限由各统筹地区按年度公布。工伤与生育保险**个人不缴**（生育已与职工医保合并实施），算到手工资时不能把这两项扣掉。'
        },
        {
            id: 'housing-fund',
            name: '住房公积金（单位与职工各 5%~12%，超过 12% 或基数超过社平 3 倍的部分并入工资计个税）',
            category: 'social',
            scope: '国家机关、国有企业、城镇集体企业、外商投资企业、城镇私营企业及其他城镇企业、事业单位、民办非企业单位、社会团体及其在职职工缴存的长期住房储金，单位与职工缴存比例一致',
            effectiveFrom: '1999-04-03',
            expiresOn: null,
            basis: [
                { title: '《住房公积金管理条例》（第十八条：职工和单位住房公积金的缴存比例均不得低于 5%、不得高于 12%）', doc: '国务院令第 262 号（2019 年修订）' },
                { title: '《关于基本养老保险费基本医疗保险费失业保险费住房公积金有关个人所得税政策的通知》（公积金在 12% 与社平工资 3 倍以内部分免征个人所得税）', doc: '财税〔2006〕10 号' }
            ],
            params: { rules: 'socialInsuranceRules' },
            page: '/seo/social-base.html',
            note: '最容易被忽略的一处：公积金**不是缴多少都免税**。只有在比例不超过 12%、且缴存基数不超过设区城市上年度职工月平均工资 3 倍的范围内免征个人所得税，超出部分要并回工资计税 —— 高工资按最高比例缴存时，超出部分实际上要先交个税。'
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
        },
        {
            id: 'business-income',
            name: '经营所得（个体工商户 / 个人独资企业 / 合伙企业自然人合伙人）',
            category: 'iit',
            scope: '个体工商户业主、个人独资企业投资人、合伙企业自然人合伙人从事生产经营活动取得的所得，适用 5%~35% 五级超额累进税率，按年计算、分月或分季预缴、次年 3 月 31 日前汇算清缴',
            effectiveFrom: '2019-01-01',
            expiresOn: null,
            basis: [
                { title: '《中华人民共和国个人所得税法》（第三条：经营所得适用 5%~35% 五级超额累进税率）', doc: '主席令第九号（2018 年修正）' },
                { title: '《中华人民共和国个人所得税法实施条例》（第六条、第十五条：经营所得的范围与应纳税所得额计算）', doc: '国务院令第 707 号' },
                { title: '《个体工商户个人所得税计税办法》', doc: '国家税务总局令第 35 号' }
            ],
            params: { rates: 'businessTaxRates', rules: 'businessIncomeRules' },
            page: '/seo/business-income.html',
            note: '应纳税所得额 = 收入总额 − 成本、费用、损失 − 业主本人费用扣除（5000 元/月，仅在**没有综合所得**时可扣）− 专项附加扣除。与综合所得用的是**不同的税率表**：经营所得五级（5%/10%/20%/30%/35%），不是工资那张七级表，不能混用。'
        },
        {
            id: 'business-income-halve',
            name: '个体工商户经营所得减半征收（年应纳税所得额不超过 200 万元的部分）',
            category: 'iit',
            scope: '个体工商户年应纳税所得额不超过 200 万元的部分，减半征收个人所得税（不区分查账或核定征收，可与其他优惠叠加）',
            effectiveFrom: '2023-01-01',
            expiresOn: '2027-12-31',
            basis: [
                { title: '《关于进一步支持小微企业和个体工商户发展有关税费政策的公告》第二条', doc: '财政部 税务总局公告 2023 年第 12 号' },
                { title: '《关于落实支持小型微利企业和个体工商户发展所得税优惠政策有关事项的公告》', doc: '国家税务总局公告 2023 年第 12 号' }
            ],
            params: { rules: 'businessIncomeRules', rates: 'businessTaxRates' },
            page: '/seo/business-income.html',
            note: '减免的是「不超过 200 万元那部分应纳税所得额对应的税额」的一半，**不是**全部税额的一半 —— 超过 200 万的部分照常全额计税。核定与查账**都能**享受（这是很多人以为只有查账能享受的地方）。'
        },
        {
            id: 'business-income-assessed',
            name: '个体工商户核定征收（应税所得率 / 定期定额）',
            category: 'iit',
            scope: '账簿不健全、难以准确核算成本费用的个体工商户，由主管税务机关核定应税所得率或核定税额（定期定额）征收',
            effectiveFrom: '2007-01-01',
            expiresOn: null,
            basis: [
                { title: '《中华人民共和国税收征收管理法》（第三十五条：账目混乱、成本资料残缺难以查账的，税务机关有权核定应纳税额）', doc: '主席令第 23 号（2015 年修正）' },
                { title: '《个体工商户税收定期定额征收管理办法》', doc: '国税发〔2006〕183 号' },
                { title: '《企业所得税核定征收办法（试行）》第八条（行业应税所得率幅度，为各地核定个体户所得率的参照）', doc: '国税发〔2008〕30 号' }
            ],
            params: { rules: 'businessIncomeRules', rates: 'businessTaxRates' },
            page: '/seo/business-income.html',
            note: '核定征收按「收入 × 应税所得率」算税：**不扣**成本费用、**不扣**业主 6 万费用扣除与专项附加，核定期间的亏损也**不得**结转弥补。所以核定不等于「一定更省」—— 实际利润率低于核定所得率时，核定反而多交税。应税所得率由各地税务局在幅度内确定，具体以主管税务机关核定为准。'
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
