/**
 * 工具注册表（App 内多税种入口的统一元数据源）
 *
 * 为什么需要这一层：
 *   阶段15 交付了 20 个税种速算器（src/js/calculation/*-quick.js）。本注册表把
 *   「有哪些工具、怎么摆、怎么算、易错口径是什么、政策依据是哪条、算完还能干什么」
 *   集中到一处，首页、工具页、速算器页都由它渲染 —— 以后加税种只改这一个文件。
 *
 * 信息架构（阶段16 重构，取代早先「深度测算 + 工具箱」双入口）：
 *   早期 UI 把 4 个多步骤流程与 20 个速算器分成两块，那是**实现形态**的分界
 *   （向导 vs 一屏算完），不是用户心智的分界 —— 用户只知道「我要算年终奖」。
 *   现在入口层只按「人/场景」分一套类，形态差异降为卡片上的一行说明，
 *   4 个多步骤流程收在最后的「完整测算」组里（按年填全 · 出完整预算表）。
 *
 * 设计约束（与阶段15 同源，不许违反）：
 *   1. 计算永远在前端：这里只做**参数适配与结果整形**，算法一律调用 *-quick.js，
 *      绝不复制税率、不复制公式（口径同源，不复制）；
 *   2. status = 'native' 在 App 内直接算，结果与对应落地页逐点一致（同一函数）；
 *      status = 'deep'   是原有的 4 个多步骤流程页（可保存历史 / 导出 PDF）。
 *      全站已无 seo 态：20 个工具全部内置，落地页只作 SEO 与分享入口。
 *   3. 政策时效不自己算：只存 policyKey，由 tax-registry 的 statusOf 统一判定。
 *   4. nextTools 是「算完还能干什么」（SmartAsset 式的 next step）：
 *      相关工具互链，既是体验也是内部导流，不许指向不存在的 id。
 *
 * 对外接口：window.EuriskoToolRegistry = { groups, deep, deepGroup, scenarios, all, get, byGroup, search }
 */
(function () {
    'use strict';

    // ====== 分组（按「人/场景」而不是按税种 —— 用户不按税种思考） ======
    var GROUPS = [
        { id: 'salary', name: '工资与到手', icon: 'fa-money', desc: '月薪个税、谈薪倒算、年终奖、专项附加扣除、年度汇算' },
        { id: 'special', name: '一次性收入与特殊所得', icon: 'fa-gift', desc: '劳务报酬、股权激励、离职补偿、提前退休、外籍津补贴' },
        { id: 'prefer', name: '税优与养老', icon: 'fa-shield', desc: '个人养老金、税优健康险、企业年金' },
        { id: 'social', name: '社保与用工', icon: 'fa-users', desc: '社保公积金、企业用工成本、残保金与工会经费' },
        { id: 'corp', name: '企业与经营', icon: 'fa-building', desc: '增值税、企业所得税、附加税与印花税、个体户经营所得' }
    ];

    // 完整测算：不是「另一种工具」，而是同一种任务里**填得更全**的那一种（按年逐项、出完整预算表）。
    // 排在工具页最后，不与其他组混排 —— 混排会让同组出现两个「算工资」的入口，用户更懵。
    // 阶段16：保存历史与导出 PDF 已下放到 20 个速算器，所以这一组不再拿「可保存 / 可导出」当卖点，
    // 也就不该再叫「深度测算」—— 那是按实现形态起的名字，用户心里没有「深度」这回事。
    var DEEP_GROUP = {
        id: 'deep', name: '完整测算', icon: 'fa-list-ol',
        desc: '按年填全 · 出完整预算表与逐项明细 —— 只想知道一个数，用上面的速算器更快'
    };

    // ====== 原有 4 个深度流程（多步骤 / 可保存 / 可导出） ======
    var DEEP = [
        {
            id: 'forward', name: '综合所得', subtitle: '工资 / 劳务 / 稿酬，四步出年度个税预算表',
            icon: 'fa-calculator', status: 'deep', pageId: 'forward-calculation-page',
            nextTools: ['salary-tax', 'annual-settlement', 'special-deduction']
        },
        {
            // 阶段17 17B-1：**第一个由页面式迁到 spec 驱动**的经营所得测算。
            // 原来它指向 business-calculation-page（index.html 里 390 行 + app.js 私有逻辑），
            // 现在由 deep-wizard-ui.js 按这份 spec 渲染，卡片点击即进向导。
            // 口径没动：compute 直接调 tax-calculator.js 抽出的 calculateBusinessTaxCore —— 与页面版同一份内核。
            id: 'business', name: '经营所得', subtitle: '个体 / 独资，成本费用逐项扣',
            icon: 'fa-briefcase', status: 'deep',
            nextTools: ['business-income', 'social-base', 'vat'],
            // 结果步由渲染器自动追加（所有完整测算都有，「计算结果」不在此重复声明）。
            fields: [
                { key: 'income', step: 'income', label: '年度经营收入总额', type: 'money', default: 600000 },
                { key: 'cost', step: 'income', label: '年度成本', type: 'money', default: 350000 },
                { key: 'expenses', step: 'income', label: '年度费用', type: 'money', default: 50000 },
                { key: 'taxes', step: 'income', label: '年度税金', type: 'money', default: 0 },
                { key: 'losses', step: 'income', label: '年度损失', type: 'money', default: 0 },
                { key: 'otherExpenses', step: 'income', label: '其他支出', type: 'money', default: 0 },
                { key: 'previousLosses', step: 'income', label: '以前年度亏损弥补', type: 'money', default: 0, hint: '亏损可向以后年度结转，最长 5 年' },
                { key: 'hasComprehensiveIncome', step: 'deduction', label: '本年度有综合所得（工资薪金等）', type: 'switch', default: true, hint: '有综合所得时，基本减除与社保公积金在综合所得里扣，经营所得不再扣' },
                { key: 'workMonths', step: 'deduction', label: '年工作总月数', type: 'select', default: 12, options: [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map(function (m) { return { value: m, label: m + '个月' }; }) },
                { key: 'pensionInsurance', step: 'deduction', label: '养老保险金（元/月）', type: 'money', default: 0, hint: '＝ 缴费基数 × 8%，按年工作月数折算为年度' },
                { key: 'medicalInsurance', step: 'deduction', label: '医疗保险金（元/月）', type: 'money', default: 0, hint: '＝ 缴费基数 × 2%' },
                { key: 'unemploymentInsurance', step: 'deduction', label: '失业保险金（元/月）', type: 'money', default: 0, hint: '＝ 缴费基数 × 0.5%' },
                { key: 'housingFund', step: 'deduction', label: '住房公积金（元/月）', type: 'money', default: 0 },
                { key: 'childrenInfantDeduction', step: 'deduction', label: '子女教育 / 3 岁以下婴幼儿照护', type: 'money', default: 0 },
                { key: 'elderlyDeduction', step: 'deduction', label: '赡养老人', type: 'money', default: 0 },
                { key: 'housingDeduction', step: 'deduction', label: '住房贷款利息 / 住房租金', type: 'money', default: 0 },
                { key: 'educationDeduction', step: 'deduction', label: '继续教育', type: 'money', default: 0 },
                { key: 'medicalDeduction', step: 'deduction', label: '大病医疗', type: 'money', default: 0, hint: '只扣超过 1.5 万的部分，限额 8 万' },
                { key: 'pensionDeduction', step: 'deduction', label: '商业健康险 / 税延养老保险', type: 'money', default: 0 },
                { key: 'enterpriseAnnuity', step: 'deduction', label: '企业年金', type: 'money', default: 0 },
                { key: 'insuranceDeduction', step: 'deduction', label: '其他商业保险', type: 'money', default: 0 },
                { key: 'charitableDonation', step: 'deduction', label: '公益性捐赠', type: 'money', default: 0, hint: '扣除限额＝应纳税所得额 × 30%' },
                { key: 'prepaidTax', step: 'deduction', label: '已预缴税额', type: 'money', default: 0 }
            ],
            steps: [
                { key: 'income', title: '经营收入与成本', why: '经营所得按年计税：收入总额减成本、费用、税金与损失，才是经营利润' },
                { key: 'deduction', title: '扣除项明细', why: '先确认有没有综合所得 —— 它决定 6 万减除与社保公积金在哪边扣，两边不能重复扣' }
            ],
            pitfalls: [
                '有综合所得时，基本减除费用与社保公积金**只能在综合所得里扣一次**，经营所得不再扣',
                '减半征收是**年应纳税所得额 200 万以内**的部分减半，不是全部所得减半',
                '大病医疗只扣**超过 1.5 万**的部分、限额 8 万；公益性捐赠限额为应纳税所得额的 30%'
            ],
            compute: function (v) {
                if (typeof calculateBusinessTaxCore !== 'function') return null;
                var core = calculateBusinessTaxCore(v);
                var t = core.taxDetails;
                return {
                    primary: { label: '应纳个人所得税', value: t.totalTax, kind: 'money' },
                    rows: [
                        { label: '应纳税所得额', value: t.taxableIncome, kind: 'money' },
                        { label: '适用税率', value: t.applicableRate, kind: 'percent' },
                        { label: '速算扣除数', value: t.applicableDeduction, kind: 'money' },
                        { label: '减半征收减免', value: t.taxReduction, kind: 'money', hint: '年应纳税所得额 200 万以内的部分减半' },
                        { label: '扣除合计', value: core.deductionDetails.total, kind: 'money' },
                        { label: '已预缴税额', value: t.prepaidTax, kind: 'money' },
                        { label: t.refundTax >= 0 ? '应补税额' : '应退税额', value: Math.abs(t.refundTax), kind: 'money' },
                        { label: '税后经营所得', value: t.netIncomeAfterTax, kind: 'money' }
                    ],
                    note: '投资者本人减除费用 5000 元/月按实际工作月数算；有综合所得时该减除与社保公积金改在综合所得里扣除。',
                    // 推导链直接复用 utils.js 里既有那份（页面版用的也是它）—— 不写第二套
                    steps: (typeof buildBusinessFormulaSteps === 'function') ? buildBusinessFormulaSteps(core) : []
                };
            }
        },
        {
            id: 'classification', name: '分类所得', subtitle: '利息 / 租赁 / 转让 / 偶然所得',
            icon: 'fa-list-alt', status: 'deep', pageId: 'classification-calculation-page',
            nextTools: ['withholding', 'annual-settlement']
        },
        {
            id: 'reverse', name: '反向倒算', subtitle: '给定目标税负或到手，反推收入',
            icon: 'fa-refresh', status: 'deep', pageId: 'reverse-calculation-page',
            nextTools: ['net-salary', 'salary-tax', 'employer-cost']
        },
        // 阶段17 17C-1：第一个**由 spec 驱动**的完整测算 —— 此前 4 个 deep 各有独立页面与私有逻辑，
        // 每加一个税种就要再写一页 HTML；本条目没有 pageId，内容由 deep-wizard-ui.js 按 spec 渲染。
        // 字段与计算不在这里重复声明，见文件末尾「与 vat 速算器共享同一份 fields / compute」。
        {
            id: 'vat-deep', name: '增值税', subtitle: '小规模 / 一般纳税人，分步填本期数据',
            icon: 'fa-shopping-cart', status: 'deep',
            nextTools: ['surtax-stamp', 'corporate-income-tax', 'business-income']
        },
        // 阶段17 17C-2：企业所得税的完整测算。与 vat 同为 §4.4 的 P0（B 端财务客群）。
        // 排在 vat deep 之后、附加税之前 —— 卡片顺序就是施工优先级（P0 → P1 → P2）。
        // 它的「完整」体现在第二步：速算器只认「年应纳税所得额」，完整测算多给一条
        // 「从收入成本算 + 三大扣除限额纳税调整」的路径 —— 这才是申报表上的口径。
        {
            id: 'corporate-income-tax-deep', name: '企业所得税', subtitle: '小微 / 高新判定 + 纳税调整，分步出申报口径',
            icon: 'fa-bank', status: 'deep',
            nextTools: ['vat', 'surtax-stamp', 'business-income']
        },
        // 阶段17 17C-3：社保公积金的完整测算（§4.4 P1，HR 高频）。
        // 它的「完整」在结果侧：速算器只给月度六行，完整测算给出**逐项明细 + 全年汇总** ——
        // 社保是按年看的支出，年度预算表才是 HR 真正要拿走的那一版。
        {
            id: 'social-base-deep', name: '社保公积金', subtitle: '基数核定 → 逐项明细 → 全年汇总',
            icon: 'fa-users', status: 'deep',
            nextTools: ['employer-cost', 'net-salary', 'salary-tax']
        },
        // 阶段17 17C-4：附加税印花税的完整测算。排在 vat deep 之后 ——
        // 附加税的计税依据是「实际缴纳的增值税」，顺序不是随意排的。
        {
            id: 'surtax-stamp-deep', name: '附加税与印花税', subtitle: '城建税 + 教育费附加 + 印花税，分步核计税依据',
            icon: 'fa-tags', status: 'deep',
            nextTools: ['vat', 'corporate-income-tax', 'business-income']
        },
        // 阶段17 17C-5：**最后一个税种类别**（§4.4 P2）。排在最后不是因为它不重要 ——
        // 它低频但单次申报金额大，且它是唯一一个「临界点比公式更要命」的类别。
        // 两步照抄 §4.4 给这类的形态（人数/工资总额 → 分档减缴 → 申报表），
        // 它的「完整」在决策侧：不只给应缴额，还量化「再招 1 人省多少」与「超过 30 人后会跳出多少」。
        // 至此按 tax-registry 的 6 类计，**每类都有完整测算**（页面式 4 个 + spec 驱动 5 个）。
        {
            id: 'disability-fund-deep', name: '残保金与工会经费', subtitle: '人数 / 工资总额 → 分档减缴 → 申报口径',
            icon: 'fa-wheelchair', status: 'deep',
            nextTools: ['employer-cost', 'social-base', 'corporate-income-tax']
        }
    ];

    // ====== 「我是谁」场景入口 ======
    // 工具超过 20 个之后，分类浏览的效率低于「先认身份」：用户不知道年终奖属于哪一类，
    // 但一定知道自己是不是上班族。这一层把「我该用哪个」这个问题在入口就解决掉。
    var SCENARIOS = [
        {
            id: 'employee', name: '上班族', icon: 'fa-id-badge',
            desc: '领工资、算年终奖、看汇算退税',
            tools: ['salary-tax', 'bonus-tax', 'annual-settlement', 'special-deduction', 'net-salary']
        },
        {
            id: 'freelance', name: '自由职业 / 兼职', icon: 'fa-laptop',
            desc: '劳务报酬预扣、自己缴社保',
            tools: ['withholding', 'business-income', 'social-base', 'private-pension', 'annual-settlement']
        },
        {
            id: 'owner', name: '个体户 / 小店', icon: 'fa-shopping-bag',
            desc: '经营所得、开票缴税、核定还是查账',
            tools: ['business-income', 'vat', 'surtax-stamp', 'social-base', 'disability-fund']
        },
        {
            id: 'finance', name: '企业财务 / HR', icon: 'fa-building',
            desc: '用工成本、企税增值税、附加与印花',
            tools: ['employer-cost', 'corporate-income-tax', 'vat', 'surtax-stamp', 'disability-fund']
        },
        {
            id: 'executive', name: '高管 / 股东 / 临近退休', icon: 'fa-trophy',
            desc: '股权激励、离职补偿、退休与年金',
            tools: ['equity', 'severance', 'early-retirement', 'annuity', 'expat']
        }
    ];

    // ====== 20 个单页速算器（全部已 App 内置） ======
    var TOOLS = [
        // ---- 工资与到手 ----
        {
            id: 'salary-tax', name: '月薪个税', subtitle: '按累计预扣法逐月算，看每月到手多少',
            group: 'salary', icon: 'fa-money', status: 'native', seoPath: '/seo/salary-tax.html',
            policyKey: 'comprehensive',
            nextTools: ['bonus-tax', 'annual-settlement', 'social-base'],
            fields: [
                { key: 'monthlyIncome', label: '税前月薪', type: 'money', default: 15000, hint: '税前工资（含岗位工资、绩效等固定发放部分）' },
                { key: 'months', label: '计算月数', type: 'number', default: 12, min: 1, max: 12 },
                { key: 'monthlyInsurance', label: '五险一金（个人 / 月）', type: 'money', default: 1500, hint: '个人缴纳部分；工伤与生育个人不缴' },
                { key: 'monthlySpecialAdditional', label: '专项附加扣除（月）', type: 'money', default: 1000, hint: '七项合计的月均额，每年 12 月需确认' }
            ],
            pitfalls: [
                '到手逐月变少**不是算错**：累计预扣使适用档位逐月爬升（年初低档、年末高档）',
                '月薪个税是**预扣预缴**，不是最终税负 —— 次年 3~6 月汇算才多退少补'
            ],
            compute: function (v) {
                var Q = window.EuriskoSalaryQuick;
                if (!Q) return null;
                var m = Math.max(1, Math.min(12, Math.floor(Number(v.months) || 12)));
                var tax = Q.taxOf(v.monthlyIncome, m, v.monthlyInsurance, v.monthlySpecialAdditional);
                var schedule = Q.monthlyScheduleOf(v.monthlyIncome, m, v.monthlyInsurance, v.monthlySpecialAdditional);
                var gross = v.monthlyIncome * m;
                var net = gross - v.monthlyInsurance * m - tax;
                return {
                    primary: { label: m + ' 个月累计应纳个税', value: tax, kind: 'money' },
                    rows: [
                        { label: '第 1 月预扣', value: schedule[0] || 0, kind: 'money' },
                        { label: '第 ' + m + ' 月预扣', value: schedule[m - 1] || 0, kind: 'money' },
                        { label: '税前收入合计', value: gross, kind: 'money' },
                        { label: '到手合计', value: net, kind: 'money' },
                        { label: '实际税负率', value: gross > 0 ? tax / gross : 0, kind: 'percent' }
                    ],
                    // 台账 C 打样：速算器推导链（结构同 buildFormulaSteps 的 step schema，由 toolbox-ui 复用同一套渲染）
                    steps: (function () {
                        var perMonthTaxable = Q.monthlyTaxableOf(v.monthlyIncome, v.monthlyInsurance, v.monthlySpecialAdditional);
                        var cumulative = Q.cumulativeTaxableOf(v.monthlyIncome, m, v.monthlyInsurance, v.monthlySpecialAdditional);
                        var bracket = Q.bracketOf(cumulative);
                        if (!bracket) return undefined; // 无应纳税所得额（如月薪低于起征点）时不展示
                        var ratePct = (bracket.rate * 100).toFixed(0);
                        return [
                            {
                                title: '第一步：每月应纳税所得额',
                                rows: [
                                    { label: '税前月薪', note: '', value: v.monthlyIncome },
                                    { label: '减：基本减除费用（起征点）', note: '', value: Q.BASIC_DEDUCTION },
                                    { label: '减：五险一金（个人）', note: '', value: v.monthlyInsurance },
                                    { label: '减：专项附加扣除', note: '', value: v.monthlySpecialAdditional }
                                ],
                                totalLabel: '每月应纳税所得额',
                                totalValue: perMonthTaxable,
                                footnote: '月薪 − 5000 − 五险一金 − 专项附加，不足 0 按 0'
                            },
                            {
                                title: '第二步：累计应纳税所得额',
                                rows: [
                                    { label: '每月应纳税所得额', note: '逐月相加 × ' + m + ' 个月（与内核浮点逐位一致）', value: perMonthTaxable }
                                ],
                                totalLabel: '累计应纳税所得额',
                                totalValue: cumulative,
                                footnote: ''
                            },
                            {
                                title: '第三步：适用预扣率与累计应纳税额',
                                rows: [
                                    { label: '适用预扣率', note: '按累计应纳税所得额查综合所得年度税率表', value: bracket.rate, format: 'percent' },
                                    { label: '速算扣除数', note: '', value: bracket.deduction }
                                ],
                                totalLabel: m + ' 个月累计应纳税额',
                                totalValue: tax,
                                footnote: cumulative.toFixed(2) + ' × ' + ratePct + '% − ' + bracket.deduction.toFixed(2) + ' = ' + tax.toFixed(2)
                            }
                        ];
                    })(),
                    note: '每月应纳税所得额 = 月薪 − 5000 − 五险一金 − 专项附加扣除；累计应纳税额按七级年度表查，本月税额 = 截至本月累计 − 截至上月累计。'
                };
            }
        },
        {
            id: 'net-salary', name: '税后工资倒算', subtitle: '月到手 1 万，税前要谈多少',
            group: 'salary', icon: 'fa-handshake-o', status: 'native', seoPath: '/seo/net-salary.html',
            policyKey: 'comprehensive',
            nextTools: ['salary-tax', 'employer-cost', 'social-base'],
            fields: [
                { key: 'targetMonthly', label: '期望每月到手', type: 'money', default: 10000 },
                { key: 'mode', label: '口径', type: 'select', default: 'annual', options: [{ value: 'annual', label: '全年平均到手' }, { value: 'first', label: '入职首月到手' }], hint: '两种口径倒推出的税前不同，谈薪前必须先定口径' },
                { key: 'socialAverage', label: '当地社平工资（月）', type: 'money', default: 8000, hint: '用于社保 60% 保底 / 300% 封顶' },
                { key: 'housingRate', label: '公积金比例（%）', type: 'percent', default: 12 },
                { key: 'specialMonthly', label: '专项附加扣除（月）', type: 'money', default: 0 }
            ],
            pitfalls: [
                '倒算**不能除以到手率**：到手率不是常数，甚至不单调（五险一金按社平 3 倍封顶后不再增加）',
                '「每月到手 X」有两种口径，全年平均与首月相差可达数百元',
                '涨薪 1000 元 ≠ 到手多 1000 元（边际到手率约 65%~70%）'
            ],
            compute: function (v) {
                var Q = window.EuriskoNetSalaryQuick;
                if (!Q || !window.EuriskoSocialQuick) return null;
                var r = Q.solveOf({
                    targetMonthly: v.targetMonthly,
                    mode: v.mode,
                    socialAverage: v.socialAverage,
                    housingRate: (Number(v.housingRate) || 0) / 100,
                    specialMonthly: v.specialMonthly
                });
                if (!r || !r.converged) return { error: '未能求解，请检查输入（目标到手过低时会被社保下限咬住）' };
                return {
                    primary: { label: '应谈税前月薪', value: r.gross, kind: 'money' },
                    rows: [
                        { label: '取整到百元（好谈）', value: r.grossHundred, kind: 'money' },
                        { label: '第 1 月到手', value: r.net1, kind: 'money' },
                        { label: '第 12 月到手', value: r.net12, kind: 'money' },
                        { label: '五险一金（个人 / 月）', value: r.personalTotal, kind: 'money' },
                        { label: '到手率', value: r.netRate, kind: 'percent' },
                        { label: '企业月成本（含单位部分）', value: r.employerMonthly, kind: 'money' }
                    ],
                    note: '二分求解到分，解出的税前代回正向可复现目标到手；本结果只含月薪，不含年终奖（年终奖另有单独计税口径）。'
                };
            }
        },
        {
            id: 'bonus-tax', name: '年终奖个税', subtitle: '单独计税还是并入综合所得更省',
            group: 'salary', icon: 'fa-star', status: 'native', seoPath: '/seo/bonus-tax.html',
            policyKey: 'bonus',
            nextTools: ['salary-tax', 'annual-settlement', 'net-salary'],
            fields: [
                { key: 'bonus', label: '年终奖金额', type: 'money', default: 36000 },
                { key: 'annualTaxable', label: '全年其他应纳税所得额', type: 'money', default: 0, hint: '填 0 则只看单独计税；填了才能比较「并入综合所得」' }
            ],
            pitfalls: [
                '存在**临界点**：多发 1 元可能跳档，到手反而更少（本工具给出跳档位置）',
                '单独计税政策执行至 2027-12-31（以注册表状态为准）'
            ],
            compute: function (v) {
                var Q = window.EuriskoBonusQuick;
                if (!Q) return null;
                var tax = Q.taxOf(v.bonus);
                var br = Q.bracketOf(v.bonus);
                var edge = br ? br.max * 12 : 0;
                var jump = edge > 0 ? Q.taxOf(edge + 0.01) - Q.taxOf(edge) : 0;
                return {
                    primary: { label: '年终奖应纳个税（单独计税）', value: tax, kind: 'money' },
                    rows: [
                        { label: '税后到手', value: v.bonus - tax, kind: 'money' },
                        { label: '适用税率', value: br ? br.rate : 0, kind: 'percent' },
                        { label: '速算扣除数', value: br ? br.deduction : 0, kind: 'money' },
                        { label: '本档上限（年终奖）', value: edge, kind: 'money', hint: '超过此数即跳下一档' },
                        { label: '跳档多交（多发 1 分）', value: jump, kind: 'money' }
                    ],
                    note: '单独计税：奖金全额 × 按月换算后的税率 − 速算扣除数（税率由「奖金 ÷ 12」定位）。是否更省需与并入综合所得比较，并入与否以年度汇算结果为准。'
                };
            }
        },
        {
            id: 'special-deduction', name: '专项附加扣除', subtitle: '七项各能扣多少、能少交多少税',
            group: 'salary', icon: 'fa-child', status: 'native', seoPath: '/seo/special-deduction.html',
            policyKey: 'special-deduction',
            nextTools: ['salary-tax', 'annual-settlement', 'private-pension'],
            fields: [
                { key: 'taxableBefore', label: '扣除前全年应纳税所得额', type: 'money', default: 200000, hint: '全年收入 − 6 万 − 五险一金 − 其他扣除后的金额' },
                { key: 'children', label: '子女教育（个数）', type: 'number', default: 1, min: 0, hint: '每个子女 2000 元/月' },
                { key: 'infants', label: '3 岁以下婴幼儿（个数）', type: 'number', default: 0, min: 0, hint: '每个婴幼儿 2000 元/月' },
                { key: 'elderly', label: '赡养老人', type: 'select', default: 'only', options: [{ value: 'none', label: '不适用' }, { value: 'only', label: '独生子女（3000 元/月）' }, { value: 'shared', label: '非独生子女（分摊）' }] },
                { key: 'elderlyMonthly', label: '分摊月扣除额', type: 'money', default: 1500, when: { key: 'elderly', in: ['shared'] }, hint: '非独生子女每人不超过 1500 元/月' },
                { key: 'housing', label: '住房', type: 'select', default: 'none', options: [{ value: 'none', label: '不适用' }, { value: 'loan', label: '住房贷款利息' }, { value: 'rent', label: '住房租金' }], hint: '房贷与租金只能二选一' },
                { key: 'loanMonths', label: '贷款利息享受月数', type: 'number', default: 12, min: 0, max: 240, when: { key: 'housing', in: ['loan'] } },
                { key: 'rentTier', label: '租房城市档', type: 'select', default: '1', options: [{ value: '1', label: '直辖市 / 省会（1500 元/月）' }, { value: '2', label: '市辖区户籍人口 >100 万（1100 元/月）' }, { value: '3', label: '其他（800 元/月）' }], when: { key: 'housing', in: ['rent'] } },
                { key: 'degreeMonths', label: '学历继续教育（月）', type: 'number', default: 0, min: 0, max: 48, hint: '400 元/月，同一学历最长 48 个月' },
                { key: 'certCount', label: '职业资格证书（本）', type: 'number', default: 0, min: 0, hint: '取得当年一次性扣 3600 元' },
                { key: 'medicalSelfPaid', label: '大病医疗自付累计', type: 'money', default: 0, hint: '医保目录内个人自付，超 1.5 万部分据实扣、限额 8 万' }
            ],
            pitfalls: [
                '扣除额 × 税率 **不等于** 少交的税：跨档时只有部分扣除额落在高档（本工具给出「朴素估算」与差额）',
                '房贷利息与住房租金**只能二选一**，赡养老人与子女教育按分摊协议执行',
                '大病医疗只能在**年度汇算**时扣除，平时预扣不体现'
            ],
            compute: function (v) {
                var Q = window.EuriskoSpecialDeductionQuick;
                if (!Q) return null;
                var r = Q.compareOf({
                    taxableBefore: v.taxableBefore,
                    infants: v.infants,
                    children: v.children,
                    degreeMonths: v.degreeMonths,
                    certCount: v.certCount,
                    medicalSelfPaid: v.medicalSelfPaid,
                    housing: v.housing,
                    loanMonths: v.loanMonths,
                    rentTier: Number(v.rentTier) || 1,
                    rentMonths: 12,
                    elderly: v.elderly,
                    elderlyMonthly: v.elderlyMonthly
                });
                var labels = {
                    infantCare: '3 岁以下婴幼儿照护',
                    childrenEducation: '子女教育',
                    continuingEducationDegree: '学历继续教育',
                    continuingEducationCert: '职业资格继续教育',
                    seriousIllness: '大病医疗',
                    housingLoan: '住房贷款利息',
                    housingRent: '住房租金',
                    elderlySupport: '赡养老人'
                };
                var rows = [
                    { label: '七项年度扣除合计', value: r.totalAnnual, kind: 'money' },
                    { label: '月均扣除额', value: r.totalMonthly, kind: 'money' }
                ];
                Object.keys(labels).forEach(function (k) {
                    if (r.items && r.items[k] > 0) rows.push({ label: labels[k], value: r.items[k], kind: 'money' });
                });
                rows.push(
                    { label: '扣除前应纳税所得额', value: r.taxableBefore, kind: 'money' },
                    { label: '扣除后应纳税所得额', value: r.taxableAfter, kind: 'money' },
                    { label: '适用税率（扣除前）', value: r.rate, kind: 'percent' },
                    { label: '朴素估算（扣除额 × 税率）', value: r.naiveSaving, kind: 'money', hint: '很多人这么估，但它会高估' },
                    { label: '朴素估算高估了', value: r.naiveGap, kind: 'money' }
                );
                return {
                    primary: { label: '全年可少交个税', value: r.saving, kind: 'money' },
                    rows: rows,
                    note: '节税额 = 扣除前应纳税额 − 扣除后应纳税额（按七级年度表）。跨档时只有落在高档的那部分扣除额按高档税率省税，因此「扣除额 × 税率」会高估。'
                };
            }
        },
        {
            id: 'annual-settlement', name: '年度汇算清缴', subtitle: '退税还是补税，一次算清',
            group: 'salary', icon: 'fa-balance-scale', status: 'native', seoPath: '/seo/annual-settlement.html',
            policyKey: 'settlement',
            nextTools: ['salary-tax', 'bonus-tax', 'special-deduction'],
            fields: [
                { key: 'monthlyIncome', label: '税前月薪', type: 'money', default: 15000 },
                { key: 'months', label: '当年任职月数', type: 'number', default: 12, min: 1, max: 12, hint: '年中入职 / 离职按实际月数' },
                { key: 'monthlyInsurance', label: '五险一金（个人 / 月）', type: 'money', default: 1500 },
                { key: 'monthlySpecialAdditional', label: '专项附加扣除（月）', type: 'money', default: 1000 },
                { key: 'prepaidTax', label: '全年已预缴个税', type: 'money', default: 0, hint: '填 0 则按累计预扣法自动推演；填实际值更准（看个税 App 已申报税额）' }
            ],
            pitfalls: [
                '结果**正数 = 应补税、负数 = 应退税**，符号别看反',
                '多处任职 / 年中跳槽会在各单位**重复扣 6 万**基本减除费用，汇算时合并后通常要补税',
                '年终奖若已按单独计税申报，汇算时仍可选择并入（本工具不含这一层比较）'
            ],
            compute: function (v) {
                var Q = window.EuriskoSettlementQuick;
                if (!Q) return null;
                // 位置参数：settlementOf(monthlyIncome, months, monthlyInsurance, monthlySpecialAdditional, prepaidTax)
                var r = Q.settlementOf(v.monthlyIncome, v.months, v.monthlyInsurance, v.monthlySpecialAdditional, v.prepaidTax);
                var refund = r.diff < 0;
                return {
                    primary: { label: refund ? '应退个税' : '应补个税', value: Math.abs(r.diff), kind: 'money' },
                    rows: [
                        { label: '全年收入', value: r.annualIncome, kind: 'money' },
                        { label: '全年扣除合计', value: r.annualDeduction, kind: 'money', hint: '6 万基本减除 + 五险一金 + 专项附加扣除' },
                        { label: '全年应纳税所得额', value: r.annualTaxable, kind: 'money' },
                        { label: '全年应纳税额', value: r.annualTax, kind: 'money' },
                        { label: '已预缴税额', value: r.prepaidTax, kind: 'money', hint: r.providedPrepaid ? '使用你填写的值' : '按累计预扣法推演' },
                        { label: '适用税率', value: r.bracket ? r.bracket.rate : 0, kind: 'percent' }
                    ],
                    note: '汇算差额 = 全年应纳税额 − 全年已预缴。结果为负即退税；多处任职请用「综合所得」深度流程按单位逐段合并计算。'
                };
            }
        },

        // ---- 一次性收入与特殊所得 ----
        {
            id: 'withholding', name: '劳务报酬个税', subtitle: '800 元扣除与三档预扣率',
            group: 'special', icon: 'fa-file-text-o', status: 'native', seoPath: '/seo/labor-withholding.html',
            policyKey: 'withholding',
            nextTools: ['annual-settlement', 'business-income', 'salary-tax'],
            fields: [
                { key: 'type', label: '所得类型', type: 'select', default: 'labor', options: [{ value: 'labor', label: '劳务报酬' }, { value: 'author', label: '稿酬' }, { value: 'royalty', label: '特许权使用费' }] },
                { key: 'amount', label: '单次收入', type: 'money', default: 30000, hint: '按次计算；同一项目连续性收入以一个月内取得的为一次' },
                { key: 'marginalRate', label: '你全年综合所得边际税率（%）', type: 'percent', default: 20, hint: '用于估算汇算时的税负差，10/20/25/30/35/45 选最接近的一档' }
            ],
            pitfalls: [
                '费用扣除是**分档**的：≤4000 元减 800，>4000 元减 20%，不是统一减 20%',
                '稿酬在费用扣除后**再打七折**（实际按收入的 56% 计入），税负明显低于劳务报酬',
                '预扣率最高 40% 是**预扣**，次年并入综合所得汇算，多退少补'
            ],
            compute: function (v) {
                var Q = window.EuriskoWithholdingQuick;
                if (!Q) return null;
                // 位置参数：compareOf(type, amount, marginalRate)
                var r = Q.compareOf(v.type, v.amount, (Number(v.marginalRate) || 0) / 100);
                return {
                    primary: { label: '本次预扣预缴个税', value: r.prepaid, kind: 'money' },
                    rows: [
                        { label: '费用扣除后应纳税所得额', value: r.taxable, kind: 'money', hint: '≤4000 减 800；>4000 按 80%' },
                        { label: '并入综合所得的收入额', value: r.income, kind: 'money', hint: '劳务/特许权 80%，稿酬 56%' },
                        { label: '汇算时估算税负', value: r.settled, kind: 'money' },
                        { label: '汇算差额', value: r.gap, kind: 'money', hint: '正数 = 预扣少于应付' },
                        { label: '汇算方向', value: r.direction, kind: 'text' }
                    ],
                    note: '预扣环节按次、按三档预扣率表计算；次年并入综合所得适用七级年度税率，「汇算差额」为正即需补税。'
                };
            }
        },
        {
            id: 'equity', name: '股权激励个税', subtitle: '期权 / 限制性股票 / 增值权',
            group: 'special', icon: 'fa-line-chart', status: 'native', seoPath: '/seo/equity-incentive.html',
            policyKey: 'equity-incentive',
            nextTools: ['annual-settlement', 'severance', 'salary-tax'],
            fields: [
                { key: 'type', label: '激励形式', type: 'select', default: 'option', options: [{ value: 'option', label: '股票期权' }, { value: 'restricted', label: '限制性股票' }, { value: 'appreciation', label: '股票增值权' }, { value: 'award', label: '股权奖励' }] },
                { key: 'qty', label: '数量（股 / 份）', type: 'number', default: 10000, min: 0 },
                { key: 'price', label: '行权 / 解禁日市价（元/股）', type: 'money', default: 20 },
                { key: 'cost', label: '施权价 / 出资额（元/股）', type: 'money', default: 10 },
                { key: 'grantPrice', label: '股票登记日市价（元/股）', type: 'money', default: 15, when: { key: 'type', in: ['restricted'] }, hint: '限制性股票按「登记日与解禁日均价」计税' },
                { key: 'ytdIncome', label: '本年度已计入的股权激励收入', type: 'money', default: 0, hint: '一年内两次以上激励须合并计税' },
                { key: 'otherTaxable', label: '全年其他综合所得应纳税所得额', type: 'money', default: 0, hint: '已扣完各项扣除的金额，用于比较「并入」' }
            ],
            pitfalls: [
                '现行政策是**单独计税、不并入**综合所得，且**不减除任何费用**（不是减 6 万后再算）',
                '「并入」那一列是政策 2027-12-31 到期后的对照值，不是现在能选的',
                '一年内多次行权必须**合并**计算，分开算会低估税率'
            ],
            compute: function (v) {
                var Q = window.EuriskoEquityQuick;
                if (!Q) return null;
                var r = Q.compareOf({
                    type: v.type, qty: v.qty, price: v.price, cost: v.cost,
                    grantPrice: v.grantPrice, ytdIncome: v.ytdIncome, otherTaxable: v.otherTaxable
                });
                return {
                    primary: { label: '股权激励应纳个税（单独计税）', value: r.separate, kind: 'money' },
                    rows: [
                        { label: '本次股权激励收入', value: r.income, kind: 'money' },
                        { label: '计税基数（含本年度已计入）', value: r.base, kind: 'money' },
                        { label: '实际税负率', value: r.effectiveRate, kind: 'percent' },
                        { label: '其他综合所得应纳税额', value: r.otherTax, kind: 'money' },
                        { label: '单独计税合计', value: r.separateTotal, kind: 'money' },
                        { label: '若并入全年（对照）', value: r.mergedTotal, kind: 'money', hint: '政策到期后的口径，现行不适用' },
                        { label: '并入差额', value: r.gap, kind: 'money' },
                        { label: '提示', value: r.direction, kind: 'text' }
                    ],
                    note: '单独计税：以股权激励收入全额（不减费用、不扣专项附加）按七级年度表计税，一年内多次行权合并。'
                };
            }
        },
        {
            id: 'severance', name: '离职补偿金', subtitle: '3 倍社平工资以内免税',
            group: 'special', icon: 'fa-sign-out', status: 'native', seoPath: '/seo/severance.html',
            policyKey: 'severance',
            nextTools: ['early-retirement', 'annual-settlement', 'social-base'],
            fields: [
                { key: 'economic', label: '经济补偿金', type: 'money', default: 300000, hint: '按工作年限 × 月工资计算的部分' },
                { key: 'other', label: '其他一次性补助', type: 'money', default: 0, hint: '医疗补助费、生活补助费等' },
                { key: 'avgWage', label: '当地上年职工年平均工资', type: 'money', default: 120000, hint: '免税额度 = 该数 × 3' },
                { key: 'monthlyWage', label: '离职前月平均工资', type: 'money', default: 15000, hint: '用于校验是否超过法定经济补偿上限' },
                { key: 'years', label: '本单位工作年限', type: 'number', default: 8, min: 0 },
                { key: 'otherTaxable', label: '当年其他综合所得应纳税所得额', type: 'money', default: 0 }
            ],
            pitfalls: [
                '免税额度是**当地上年职工年平均工资 × 3**，不是「月工资 × 3」，也不是全国一个数',
                '超过法定标准（工资超社平 3 倍 / 年限超 12 年）的部分**不能享受免税**',
                '离职补偿**不并入**综合所得，单独计税、且**不做按年限平均**'
            ],
            compute: function (v) {
                var Q = window.EuriskoSeveranceQuick;
                if (!Q) return null;
                var r = Q.compareOf({
                    economic: v.economic, other: v.other, avgWage: v.avgWage,
                    monthlyWage: v.monthlyWage, years: v.years, otherTaxable: v.otherTaxable
                });
                var dirText = { 'separate-cheaper': '单独计税更省', 'merge-cheaper': '并入更省', same: '两者相同' }[r.direction] || '—';
                return {
                    primary: { label: '离职补偿应纳个税', value: r.tax, kind: 'money' },
                    rows: [
                        { label: '一次性收入合计', value: r.amount, kind: 'money' },
                        { label: '免税额度（社平 ×3）', value: r.exemptCap, kind: 'money' },
                        { label: '实际使用免税额度', value: r.exemptUsed, kind: 'money', hint: '免税额度只抵「符合法定标准」的部分' },
                        { label: '应纳税所得额', value: r.taxable, kind: 'money' },
                        { label: '适用税率', value: r.rate, kind: 'percent' },
                        { label: '税后到手', value: r.net, kind: 'money' },
                        { label: '实际税负率', value: r.effectiveRate, kind: 'percent' },
                        { label: '法定经济补偿上限', value: r.legalCap === null || r.legalCap === undefined ? '未校验（未填工资/年限）' : r.legalCap, kind: r.legalCap === null || r.legalCap === undefined ? 'text' : 'money' },
                        { label: '超法定标准部分', value: r.overLegal, kind: 'money' },
                        { label: '与并入综合所得的比较', value: dirText, kind: 'text' }
                    ],
                    note: '应纳税所得额 = 一次性收入 − 免税额度（社平年工资 ×3），单独按七级年度表计税，不并入综合所得、不做按年限平均。'
                };
            }
        },
        {
            id: 'early-retirement', name: '提前退休 / 内退', subtitle: '一次性收入怎么算',
            group: 'special', icon: 'fa-hourglass-half', status: 'native', seoPath: '/seo/early-retirement.html',
            policyKey: 'early-retirement',
            nextTools: ['severance', 'annuity', 'annual-settlement'],
            fields: [
                { key: 'variant', label: '情形', type: 'select', default: 'early', options: [{ value: 'early', label: '提前退休（真分摊）' }, { value: 'internal', label: '内部退养（平均只为定档）' }], hint: '两者口径完全不同，选错整张表都错' },
                { key: 'subsidy', label: '一次性补贴收入', type: 'money', default: 300000, when: { key: 'variant', in: ['early'] } },
                { key: 'years', label: '提前退休至法定退休年数', type: 'number', default: 5, min: 1, when: { key: 'variant', in: ['early'] }, hint: '按实际年度数分摊，可含小数' },
                { key: 'lumpSum', label: '内退一次性收入', type: 'money', default: 300000, when: { key: 'variant', in: ['internal'] } },
                { key: 'months', label: '内退至法定退休的月份数', type: 'number', default: 24, min: 1, when: { key: 'variant', in: ['internal'] } },
                { key: 'monthlySalary', label: '领取当月工资薪金', type: 'money', default: 6000, when: { key: 'variant', in: ['internal'] }, hint: '内退一次性收入与当月工资合并计税' }
            ],
            pitfalls: [
                '提前退休是**真分摊**：收入 ÷ 实际年数后按年计税，再乘回年数',
                '内部退养**不是真分摊**：月均额只用来**定税率档**，计税基数仍是全额',
                '两种情形都**没有**免税额度（与离职补偿的社平 3 倍不同）'
            ],
            compute: function (v) {
                var Q = window.EuriskoEarlyRetirementQuick;
                if (!Q) return null;
                if (v.variant === 'early') {
                    var e = Q.earlyOf({ subsidy: v.subsidy, years: v.years });
                    return {
                        primary: { label: '一次性补贴应纳个税', value: e.tax, kind: 'money' },
                        rows: [
                            { label: '分摊年度数', value: e.years, kind: 'text' },
                            { label: '每年分摊额', value: e.perYear, kind: 'money' },
                            { label: '分摊后年应纳税所得额', value: e.taxablePerYear, kind: 'money', hint: '每年分摊额 − 6 万' },
                            { label: '适用税率', value: e.rate, kind: 'percent' },
                            { label: '每年税额', value: e.taxPerYear, kind: 'money' },
                            { label: '若不分摊（错误算法）', value: e.naiveTax, kind: 'money' },
                            { label: '分摊省下的税', value: e.spreadSaving, kind: 'money' }
                        ],
                        note: '提前退休：一次性补贴 ÷ 实际提前年数 = 每年分摊额，减 6 万后按年度综合所得税率表计税，再乘回年数。'
                    };
                }
                var i = Q.internalOf({ lumpSum: v.lumpSum, months: v.months, monthlySalary: v.monthlySalary });
                return {
                    primary: { label: '内退一次性收入应纳个税', value: i.tax, kind: 'money' },
                    rows: [
                        { label: '月均额（仅用于定档）', value: i.monthly, kind: 'money' },
                        { label: '定档基数（月均 + 当月工资 − 5000）', value: i.base, kind: 'money' },
                        { label: '适用税率', value: i.rate, kind: 'percent' },
                        { label: '计税基数（全额不摊）', value: i.taxable, kind: 'money', hint: '当月工资 + 一次性收入 − 5000' },
                        { label: '若误按「月均 × 月数」算', value: i.naiveTax, kind: 'money' },
                        { label: '少算的税额', value: i.naiveGap, kind: 'money' }
                    ],
                    note: '内部退养：一次性收入与领取当月工资合并，先按月均额（÷ 所属月份数）确定税率档，再对**全额**计税 —— 平均只为定档，不是分摊。'
                };
            }
        },
        {
            id: 'expat', name: '外籍津补贴免税', subtitle: '与专项附加扣除二选一',
            group: 'special', icon: 'fa-globe', status: 'native', seoPath: '/seo/expat-allowance.html',
            policyKey: 'expat-allowance',
            nextTools: ['special-deduction', 'annual-settlement', 'salary-tax'],
            fields: [
                { key: 'taxableBefore', label: '扣除前全年应纳税所得额', type: 'money', default: 300000 },
                { key: 'allowanceAnnual', label: '全年可免税的津补贴合计', type: 'money', default: 60000, hint: '住房补贴、伙食补贴、搬迁费、探亲费、语言训练费、子女教育费等' },
                { key: 'specialAnnual', label: '全年专项附加扣除合计', type: 'money', default: 36000, hint: '若改为享受专项附加扣除，可扣这么多' }
            ],
            pitfalls: [
                '两条路径**二选一、不可叠加**，且**一年内不得变更**',
                '免税的津补贴必须是**实报实销或限额内**的八类项目，现金补贴并不都能免',
                '政策执行至 2027-12-31，到期后只能走专项附加扣除（本工具给出到期后的对照）'
            ],
            compute: function (v) {
                var Q = window.EuriskoExpatAllowanceQuick;
                if (!Q) return null;
                var r = Q.compareOf({
                    taxableBefore: v.taxableBefore,
                    allowanceAnnual: v.allowanceAnnual,
                    specialAnnual: v.specialAnnual
                });
                var betterText = { allowance: '选津补贴免税', special: '选专项附加扣除', same: '两者相同' }[r.better] || '—';
                var pick = r.better === 'special' ? r.special.saved : r.allowance.saved;
                return {
                    primary: { label: '两种口径差额（测算值）', value: pick, kind: 'money' },
                    rows: [
                        { label: '建议', value: betterText, kind: 'text' },
                        { label: '选津补贴免税可省', value: r.allowance.saved, kind: 'money' },
                        { label: '选专项附加扣除可省', value: r.special.saved, kind: 'money' },
                        { label: '两者差额', value: r.diff, kind: 'money' },
                        { label: '月均差额', value: r.monthlyDiff, kind: 'money' },
                        { label: '政策到期后只能省', value: r.afterExpirySaved, kind: 'money', hint: r.expiresOn + ' 之后津补贴免税终止' },
                        { label: '政策到期影响', value: r.afterExpiryGap, kind: 'money' }
                    ],
                    note: '两条路径互斥：津补贴免税与专项附加扣除不得叠加，且一经选择在一个纳税年度内不得变更。'
                };
            }
        },

        // ---- 税优与养老 ----
        {
            id: 'private-pension', name: '个人养老金', subtitle: '每年 12000 元税前扣除能省多少',
            group: 'prefer', icon: 'fa-piggy-bank', status: 'native', seoPath: '/seo/private-pension.html',
            policyKey: 'private-pension',
            nextTools: ['health-insurance', 'annuity', 'annual-settlement'],
            fields: [
                { key: 'annualContribution', label: '今年缴费额', type: 'money', default: 12000, hint: '上限 12000 元/年，超额不可扣' },
                { key: 'taxableBefore', label: '扣除前全年应纳税所得额', type: 'money', default: 200000 },
                { key: 'years', label: '预计缴费年数', type: 'number', default: 10, min: 1 },
                { key: 'withdrawTotal', label: '预计领取总额', type: 'money', default: 0, hint: '填 0 则按「只回本金」估算' }
            ],
            pitfalls: [
                '领取时按 **3% 单独计税**（不并入综合所得）—— 所以只有当前税率 > 3% 才划算',
                '3% 税率档的人**净优惠为 0**，别被「每年省 360 元」的说法误导',
                '缴费环节扣除、投资环节免税、领取环节 3%，三段口径要分开看'
            ],
            compute: function (v) {
                var Q = window.EuriskoPrivatePensionQuick;
                if (!Q) return null;
                var r = Q.compareOf({
                    annualContribution: v.annualContribution,
                    taxableBefore: v.taxableBefore,
                    years: v.years,
                    withdrawTotal: v.withdrawTotal
                });
                return {
                    primary: { label: '今年可少交个税', value: r.taxSaved, kind: 'money' },
                    rows: [
                        { label: '年度缴费限额', value: r.annualLimit, kind: 'money' },
                        { label: '实际可扣除', value: r.deductible, kind: 'money' },
                        { label: '超额不可扣（不结转）', value: r.overLimit, kind: 'money' },
                        { label: '适用税率', value: r.rate, kind: 'percent' },
                        { label: '缴费期累计节税', value: r.totalTaxSaved, kind: 'money' },
                        { label: '领取时按 3% 计税', value: r.withdrawTax, kind: 'money' },
                        { label: '净收益（节税 − 领取税）', value: r.netBenefit, kind: 'money' },
                        { label: '回本线（领取额超过即不划算）', value: r.breakEvenWithdraw, kind: 'money' },
                        { label: '是否划算', value: r.worthIt ? '划算（税率 > 3%）' : '不划算（税率 ≤ 3%）', kind: 'text' }
                    ],
                    note: '缴费时税前扣除（上限 12000 元/年），领取时按 3% 单独计税。当前适用税率高于 3% 才有净收益。'
                };
            }
        },
        {
            id: 'health-insurance', name: '税优健康险', subtitle: '2400 元/年限额，节税上限 1080 元',
            group: 'prefer', icon: 'fa-heartbeat', status: 'native', seoPath: '/seo/health-insurance.html',
            policyKey: 'health-insurance',
            nextTools: ['private-pension', 'annuity', 'special-deduction'],
            fields: [
                { key: 'annualPremium', label: '今年保费', type: 'money', default: 2400, hint: '限额 2400 元/年（200 元/月）' },
                { key: 'taxableBefore', label: '扣除前全年应纳税所得额', type: 'money', default: 200000 }
            ],
            pitfalls: [
                '限额是 **2400 元/年**不是 12000 元，节税上限 = 2400 × 45% = **1080 元/年**',
                '必须是带「税优识别码」的合规产品，普通商业健康险不能扣',
                '与个人养老金不同：赔付环节**完全免税**，没有 3% 的领取税'
            ],
            compute: function (v) {
                var Q = window.EuriskoHealthInsuranceQuick;
                if (!Q) return null;
                var r = Q.compareOf({ annualPremium: v.annualPremium, taxableBefore: v.taxableBefore });
                return {
                    primary: { label: '今年可少交个税', value: r.taxSaved, kind: 'money' },
                    rows: [
                        { label: '年度扣除限额', value: r.annualLimit, kind: 'money' },
                        { label: '实际可扣除', value: r.deductible, kind: 'money' },
                        { label: '超额不可扣', value: r.overLimit, kind: 'money' },
                        { label: '适用税率', value: r.rate, kind: 'percent' },
                        { label: '节税上限（2400 × 45%）', value: r.maxYearlySaving, kind: 'money' },
                        { label: '赔付是否免税', value: r.payoutTaxFree ? '是（与个人养老金不同）' : '否', kind: 'text' }
                    ],
                    note: '税优健康险限额 2400 元/年，在当年应纳税所得额中扣除；保险赔付免征个人所得税。'
                };
            }
        },
        {
            id: 'annuity', name: '企业年金', subtitle: '个人 4% 当期扣除、单位 8% 递延',
            group: 'prefer', icon: 'fa-university', status: 'native', seoPath: '/seo/enterprise-annuity.html',
            policyKey: 'enterprise-annuity',
            nextTools: ['private-pension', 'health-insurance', 'salary-tax'],
            fields: [
                { key: 'contributionBase', label: '月缴费基数', type: 'money', default: 15000, hint: '须按当地社平工资 300% 封顶后的金额' },
                { key: 'personalRate', label: '个人缴费比例（%）', type: 'percent', default: 4, hint: '不超过 4% 的部分当期免税' },
                { key: 'employerRate', label: '单位缴费比例（%）', type: 'percent', default: 8, hint: '计入个人账户时递延纳税' },
                { key: 'taxableBefore', label: '扣除前全年应纳税所得额', type: 'money', default: 200000 },
                { key: 'years', label: '预计缴费年数', type: 'number', default: 10, min: 1 },
                { key: 'monthlyWithdraw', label: '预计月领取额', type: 'money', default: 2000 }
            ],
            pitfalls: [
                '个人缴费 **≤4%** 的部分当期免税，超过部分要并入工资计税',
                '单位缴费是**递延**不是免税：领取时按「月度税率表」全额计税（不并入综合所得）',
                '年度税率高于领取时的月度税率才划算，否则是「先免后补」'
            ],
            compute: function (v) {
                var Q = window.EuriskoAnnuityQuick;
                if (!Q) return null;
                var r = Q.compareOf({
                    contributionBase: v.contributionBase,
                    personalRate: (Number(v.personalRate) || 0) / 100,
                    employerRate: (Number(v.employerRate) || 0) / 100,
                    taxableBefore: v.taxableBefore,
                    years: v.years,
                    monthlyWithdraw: v.monthlyWithdraw
                });
                return {
                    primary: { label: '今年可少交个税', value: r.taxSaved, kind: 'money' },
                    rows: [
                        { label: '个人缴费月免税额', value: r.exemptMonthly, kind: 'money' },
                        { label: '超 4% 需并入工资部分', value: r.taxablePersonalMonthly, kind: 'money' },
                        { label: '单位缴费（递延）月额', value: r.employerMonthly, kind: 'money' },
                        { label: '年度免税额', value: r.annualExempt, kind: 'money' },
                        { label: '年度递延额', value: r.annualDeferred, kind: 'money' },
                        { label: '账户累计（个人 + 单位）', value: r.accountTotal, kind: 'money' },
                        { label: '缴费期累计节税', value: r.totalTaxSaved, kind: 'money' },
                        { label: '领取时适用月税率', value: r.monthlyWithdrawRate, kind: 'percent' },
                        { label: '可领取月数', value: r.months, kind: 'text' },
                        { label: '领取累计税额', value: r.withdrawTaxTotal, kind: 'money' },
                        { label: '净收益', value: r.netBenefit, kind: 'money' },
                        { label: '是否划算', value: r.worthIt ? '划算' : '不划算（领取税率更高）', kind: 'text' }
                    ],
                    note: '个人缴费不超过本人缴费工资 4% 的部分当期免税；单位缴费计入个人账户时递延，领取时按月度税率表单独计税。'
                };
            }
        },

        // ---- 社保与用工 ----
        {
            id: 'social-base', name: '社保公积金', subtitle: '缴费基数不是工资：60% 保底 / 300% 封顶',
            group: 'social', icon: 'fa-users', status: 'native', seoPath: '/seo/social-base.html',
            policyKey: 'social-insurance',
            nextTools: ['employer-cost', 'net-salary', 'salary-tax'],
            // 阶段17 分步编排（17A-1 / 17C-3）：`step` 引用下方 `steps` 的 key，与 vat / cit 同一套约定。
            // 纯增量声明 —— 速算器页不读 steps，可见字段与改动前完全一致。
            // 顺序刻意是「先核定基数、再谈比例」：缴费基数不是工资（60% 保底 / 300% 封顶），
            // 基数没定下来，后面比例填得再准也是错的。
            fields: [
                { key: 'wage', step: 'base', label: '税前月薪', type: 'money', default: 15000 },
                { key: 'socialAverage', step: 'base', label: '当地社平工资（月）', type: 'money', default: 8000, hint: '决定缴费基数的上下限（60% / 300%）' },
                { key: 'housingRate', step: 'detail', label: '公积金比例（%）', type: 'percent', default: 12, hint: '5% ~ 12%；超过 12% 的部分不免个税' },
                { key: 'specialMonthly', step: 'detail', label: '专项附加扣除（月）', type: 'money', default: 0 }
            ],
            steps: [
                { key: 'base', title: '核定缴费基数', why: '缴费基数**不是工资**：低于当地社平 60% 按下限保底、高于 300% 按上限封顶 —— 基数错一格，后面每一项都跟着错' },
                { key: 'detail', title: '缴纳比例与扣除', why: '工伤、生育**个人不缴**；公积金只有「比例 ≤ 12% 且基数 ≤ 社平 3 倍」的部分免征个税，超出部分要并回工资计税' }
            ],
            pitfalls: [
                '缴费基数**不是工资**：低于社平 60% 保底、高于 300% 封顶',
                '工伤、生育个人不缴（生育已并入医保），算到手时扣掉就多扣了',
                '公积金只有「比例 ≤ 12% 且基数 ≤ 社平 3 倍」的部分免征个税',
                '到手工资**逐月变少**是累计预扣的正常结果（跳档后税率变高），不是算错'
            ],
            compute: function (v) {
                var S = window.EuriskoSocialQuick;
                if (!S) return null;
                var input = {
                    wage: v.wage,
                    socialAverage: v.socialAverage,
                    housingRate: (Number(v.housingRate) || 0) / 100,
                    specialMonthly: v.specialMonthly
                };
                var s = S.socialInsuranceOf(input);
                var n = S.netSalaryOf(input);
                var clampText = { below: '按下限保底', above: '按上限封顶', within: '未触及上下限', none: '未填工资' }[s.clamped] || '';
                var yuan = function (x) { return (Math.round((Number(x) || 0) * 100) / 100).toFixed(2); };
                var pct = function (r) { return Math.round((Number(r) || 0) * 10000) / 100 + '%'; };
                var year = function (x) { return Math.round((Number(x) || 0) * 12 * 100) / 100; };

                var rows = [];
                // ① 基数先亮相：这一步错了，下面每一项都是错的，所以它必须在明细之前。
                rows.push({
                    label: '缴费基数',
                    value: s.base,
                    kind: 'money',
                    hint: clampText + (s.socialAverage > 0 ? '（下限 ' + yuan(s.baseMin) + ' / 上限 ' + yuan(s.baseMax) + '）' : '（未填社平工资时不上下限）')
                });
                // ② 逐项明细：工伤/生育个人为 0 不是漏算，hint 里写明比例与单位侧，
                //    否则「个人 0 元」会被当成 bug 报上来。
                s.items.forEach(function (it) {
                    rows.push({
                        label: it.name + '（个人 / 月）',
                        value: it.personal,
                        kind: 'money',
                        hint: '个人 ' + pct(it.personalRate) + '、单位 ' + pct(it.employerRate) + ' → 单位 ' + yuan(it.employer) + ' 元/月' + (it.personalRate ? '' : '（个人不缴）')
                    });
                });
                rows.push({
                    label: '住房公积金（个人 / 月）',
                    value: s.housingPersonal,
                    kind: 'money',
                    hint: '比例 ' + pct(s.housingRate) + '，单位同比例再缴 ' + yuan(s.housingEmployer) + ' 元/月'
                });
                // ③ 月度小计
                rows.push({ label: '个人五险一金 / 月', value: s.personalTotal, kind: 'money' });
                rows.push({ label: '单位缴纳 / 月', value: s.employerTotal, kind: 'money' });
                rows.push({ label: '到手（第 1 月）', value: n.net1, kind: 'money' });
                rows.push({
                    label: '到手（第 12 月）',
                    value: n.net12,
                    kind: 'money',
                    hint: '累计预扣逐级跳档，比第 1 月少 ' + yuan(n.net1 - n.net12) + ' 元是正常结果'
                });
                rows.push({ label: '公积金超标部分（并入工资计税）', value: s.housingTaxable, kind: 'money' });
                // ④ 全年汇总：社保是按年看的支出，年度口径才是 HR 真正要拿走的那一版。
                rows.push({ label: '全年个人缴纳', value: year(s.personalTotal), kind: 'money', hint: '月缴 × 12' });
                rows.push({ label: '全年单位缴纳', value: year(s.employerTotal), kind: 'money', hint: '月缴 × 12' });
                rows.push({ label: '全年个税', value: n.annualTax, kind: 'money', hint: '累计预扣，逐月相加而非「单月 × 12」' });
                rows.push({ label: '员工全年到手', value: n.annualNet, kind: 'money' });
                rows.push({
                    label: '企业全年用工成本（1 人）',
                    value: year(s.wage + s.employerTotal),
                    kind: 'money',
                    hint: '税前工资 + 单位五险一金；多人再乘人数'
                });
                return {
                    primary: { label: '个人五险一金 / 月', value: s.personalTotal, kind: 'money' },
                    rows: rows,
                    note: '到手 = 工资 − 个人五险一金 − 个税（累计预扣）。企业用工成本 = 工资 + 单位五险一金。'
                };
            }
        },
        {
            id: 'employer-cost', name: '企业用工成本', subtitle: '税前 1 万企业实际花 1.395 万',
            group: 'social', icon: 'fa-building-o', status: 'native', seoPath: '/seo/employer-cost.html',
            policyKey: 'social-insurance',
            nextTools: ['social-base', 'disability-fund', 'net-salary'],
            fields: [
                { key: 'variant', label: '算什么', type: 'select', default: 'cost', options: [{ value: 'cost', label: '按工资算成本' }, { value: 'solve', label: '按预算倒算工资' }, { value: 'raise', label: '涨薪测算' }] },
                { key: 'wage', label: '税前月薪', type: 'money', default: 15000, when: { key: 'variant', in: ['cost', 'raise'] } },
                { key: 'budgetMonthly', label: '人均月用工预算', type: 'money', default: 20000, when: { key: 'variant', in: ['solve'] } },
                { key: 'step', label: '拟涨薪额（元/月）', type: 'money', default: 1000, when: { key: 'variant', in: ['raise'] } },
                { key: 'socialAverage', label: '当地社平工资（月）', type: 'money', default: 8000 },
                { key: 'housingRate', label: '公积金比例（%）', type: 'percent', default: 12 },
                { key: 'specialMonthly', label: '专项附加扣除（月）', type: 'money', default: 0 },
                { key: 'headcount', label: '人数', type: 'number', default: 1, min: 1, when: { key: 'variant', in: ['cost'] } }
            ],
            pitfalls: [
                '成本倍数**不是常数 1.395**：工资低时因 60% 保底而更高，工资高时因 300% 封顶而更低',
                '涨薪 1000 元，企业多花的**不止** 1395 元，员工到手也**拿不到** 1000 元',
                '「税楔」= 企业花掉但员工没拿到手的差额，是谈薪时最有说服力的一组数'
            ],
            compute: function (v) {
                var Q = window.EuriskoEmployerCostQuick;
                if (!Q) return null;
                var base = {
                    socialAverage: v.socialAverage,
                    housingRate: (Number(v.housingRate) || 0) / 100,
                    specialMonthly: v.specialMonthly
                };
                if (v.variant === 'solve') {
                    var s = Q.solveOf(Object.assign({ budgetMonthly: v.budgetMonthly }, base));
                    if (!s || !s.converged) return { error: '未能求解，请提高预算（预算低于社保下限对应的成本时无解）' };
                    return {
                        primary: { label: '预算内的税前月薪', value: s.wage, kind: 'money' },
                        rows: [
                            { label: '取整到百元', value: s.wageHundred, kind: 'money' },
                            { label: '人均月成本', value: s.monthlyPerPerson, kind: 'money' },
                            { label: '预算剩余', value: s.gap, kind: 'money' },
                            { label: '员工月到手', value: s.netMonthly, kind: 'money' },
                            { label: '成本倍数', value: s.multiple, kind: 'percent' },
                            { label: '到手占成本比', value: s.netShare, kind: 'percent' }
                        ],
                        note: '二分求解：在预算内找到月成本不超过预算的最大税前月薪。'
                    };
                }
                if (v.variant === 'raise') {
                    var r = Q.raiseOf(Object.assign({ wage: v.wage }, base), v.step);
                    return {
                        primary: { label: '企业年增成本', value: r.extraCostAnnual, kind: 'money' },
                        rows: [
                            { label: '涨薪额（月）', value: r.step, kind: 'money' },
                            { label: '涨后税前月薪', value: r.gross, kind: 'money' },
                            { label: '企业月增成本', value: r.extraCostMonthly, kind: 'money' },
                            { label: '员工月增到手', value: r.extraNetMonthly, kind: 'money' },
                            { label: '员工年增到手', value: r.extraNetAnnual, kind: 'money' },
                            { label: '成本倍数', value: r.costMultiple, kind: 'percent', hint: '封顶后趋近 1' },
                            { label: '传递率（到手/成本）', value: r.passThrough, kind: 'percent' }
                        ],
                        note: '涨薪的成本与收益不对称：企业多缴的单位部分不会进员工口袋，员工还要多缴社保与个税。'
                    };
                }
                var c = Q.costOf(Object.assign({ wage: v.wage, headcount: v.headcount }, base));
                var clampText = { below: '按下限保底', above: '按上限封顶', within: '未触及上下限', none: '未填工资' }[c.clamped] || '';
                return {
                    primary: { label: '人均月用工成本', value: c.monthlyPerPerson, kind: 'money' },
                    rows: [
                        { label: '缴费基数', value: c.base, kind: 'money', hint: clampText },
                        { label: '单位五险一金 / 月', value: c.employerTotal, kind: 'money' },
                        { label: '个人五险一金 / 月', value: c.personalTotal, kind: 'money' },
                        { label: '员工月到手', value: c.netMonthly, kind: 'money' },
                        { label: '员工全年个税', value: c.annualTax, kind: 'money' },
                        { label: '人均年成本', value: c.annualPerPerson, kind: 'money' },
                        { label: '成本倍数（成本 ÷ 工资）', value: c.multiple, kind: 'percent' },
                        { label: '到手占成本比', value: c.netShare, kind: 'percent' },
                        { label: '税楔（企业花但员工没拿到）', value: c.wedge, kind: 'money' },
                        { label: '按 ' + c.headcount + ' 人合计月成本', value: c.monthlyTotal, kind: 'money' }
                    ],
                    note: '企业成本 = 税前工资 + 单位五险一金；成本倍数随工资变化（社保保底/封顶），不是固定 1.395。'
                };
            }
        },
        {
            id: 'disability-fund', name: '残保金与工会经费', subtitle: '30 人以下免征，31 人按全部人数算',
            group: 'social', icon: 'fa-wheelchair', status: 'native', seoPath: '/seo/disability-fund.html',
            policyKey: 'disability-fund',
            nextTools: ['employer-cost', 'social-base', 'corporate-income-tax'],
            // 阶段17 分步编排（17A-1 / 17C-5）：`step` 引用下方 `steps` 的 key，与 vat / cit / social 同一套约定。
            // 纯增量声明 —— 速算器页不读 steps，可见字段只是换了顺序（按步分组），值与口径不变。
            // 两步直接照抄 §4.4 给这类的形态：「人数/工资总额 → 分档减缴 → 申报表」（第三步是结果步，
            // 由渲染器自动追加）。顺序不能反：**规模没定就谈减免，等于拿 31 人的系数去套 300 人的盘子**。
            fields: [
                { key: 'variant', step: 'scale', label: '算哪一项', type: 'select', default: 'levy', options: [{ value: 'levy', label: '残疾人就业保障金' }, { value: 'union', label: '工会经费' }] },
                { key: 'headcount', step: 'scale', label: '在职职工人数', type: 'number', default: 50, min: 0, when: { key: 'variant', in: ['levy'] } },
                { key: 'avgAnnualWage', step: 'scale', label: '本单位职工年平均工资', type: 'money', default: 120000, when: { key: 'variant', in: ['levy'] } },
                { key: 'wageTotal', step: 'scale', label: '全年工资总额', type: 'money', default: 5000000, when: { key: 'variant', in: ['union'] }, hint: '统计口径：含奖金、津贴与加班工资，不含单位承担的社保公积金' },
                { key: 'disabled', step: 'exempt', label: '已安排残疾人数', type: 'number', default: 0, min: 0, when: { key: 'variant', in: ['levy'] } },
                { key: 'socialAverageMonthly', step: 'exempt', label: '当地社平工资（月）', type: 'money', default: 8000, when: { key: 'variant', in: ['levy'] }, hint: '年平均工资按社平 2 倍封顶' },
                { key: 'hasUnion', step: 'exempt', label: '已建立工会组织', type: 'switch', default: true, when: { key: 'variant', in: ['union'] }, hint: '建会：40% 上缴、60% 留存；未建会：全额上缴' }
            ],
            steps: [
                { key: 'scale', title: '人数与工资总额', why: '残保金看**上年在职职工人数**（30 人是临界点，31 人按全部 31 人算），工会经费看**全年工资总额** —— 两个数不是同一个口径，先把规模定下来' },
                { key: 'exempt', title: '分档减缴与封顶', why: '实际安排比例决定**分档减缴**（≥1.5% 免征、≥1% 减半、<1% 按 90%）；计费工资按当地社平 **2 倍**封顶 —— 不是社保那个 300%' }
            ],
            pitfalls: [
                '**30 人是临界点不是起征点**：31 人按全部 31 人算，不是只对超出的 1 人算',
                '应安排人数按 1.5% 计算可能是小数（31 人 → 0.465 人），不要四舍五入',
                '计费工资按当地社平 **2 倍**封顶（不是社保的 3 倍）',
                '**第一个残疾人最值钱**：分档减缴是边际递减的，招到第 3 个人时可能一分钱都省不了'
            ],
            compute: function (v) {
                var Q = window.EuriskoDisabilityFundQuick;
                if (!Q) return null;
                if (v.variant === 'union') {
                    var u = Q.unionFeeOf({ wageTotal: v.wageTotal, hasUnion: !!v.hasUnion });
                    return {
                        primary: { label: '应拨缴工会经费', value: u.fee, kind: 'money' },
                        rows: [
                            { label: '计提比例（工资总额）', value: u.rate, kind: 'percent' },
                            // 工会经费是按年申报、按月计提的 —— 年度数算出来后，做预算要的是月均。
                            { label: '月均计提', value: Math.round(u.fee / 12 * 100) / 100, kind: 'money', hint: '按 12 个月均摊，便于做月度预算' },
                            { label: '上缴上级工会', value: u.remitted, kind: 'money', hint: u.hasUnion ? '建会：40% 上缴' : '未建会：全额上缴' },
                            { label: '本单位留存', value: u.retained, kind: 'money' },
                            { label: '企业所得税扣除限额', value: u.limit, kind: 'money' },
                            { label: '实际可扣除', value: u.deductible, kind: 'money' },
                            { label: '超限额需纳税调增', value: u.overDeduction, kind: 'money' }
                        ],
                        note: '工会经费按工资总额 2% 计提；凭《工会经费收入专用收据》在不超过工资总额 2% 的范围内税前扣除。'
                    };
                }
                var levyInput = {
                    headcount: v.headcount,
                    disabled: v.disabled,
                    socialAverageMonthly: v.socialAverageMonthly,
                    avgAnnualWage: v.avgAnnualWage
                };
                var r = Q.levyOf(levyInput);
                var rows = [
                    { label: '应安排残疾人数', value: r.required.toFixed(2) + ' 人', kind: 'text', hint: '人数 × 1.5%，保留小数' },
                    { label: '缺口人数', value: r.gap.toFixed(2) + ' 人', kind: 'text' },
                    { label: '实际安排比例', value: r.arrangedRatio, kind: 'percent' },
                    { label: '计费工资（社平 2 倍封顶）', value: r.avgWageUsed, kind: 'money', hint: r.capped ? '已封顶，上限 ' + Math.round(r.wageCap) + ' 元/年' : '未触及封顶' },
                    { label: '应缴费额（缺口 × 计费工资）', value: r.base, kind: 'money' },
                    { label: '分档减缴系数', value: r.multiplier, kind: 'percent', hint: '安排比例 ≥1.5% 免征，≥1% 减半（0.5），<1% 按 0.9' },
                    { label: '减缴前应缴', value: r.payableBeforeExempt, kind: 'money' },
                    { label: '30 人以下暂免', value: r.smallExempt ? '是（在职 ' + r.headcount + ' 人）' : '否（在职 ' + r.headcount + ' 人）', kind: 'text' }
                ];
                // 「该不该再招一个残疾人」才是 HR 拿着这笔钱要做的事，而速算器只给一个应缴额 ——
                // 分档减缴是边际递减的，招到第 3 个人时可能一分钱都省不了，不量化就会被当成算错。
                var nextHire = Q.savingOf(levyInput, Math.floor(r.disabled) + 1);
                rows.push({
                    label: '再招 1 名残疾人可省',
                    value: nextHire.saving,
                    kind: 'money',
                    hint: '第 ' + nextHire.index + ' 人：应缴 ' + (Math.round(nextHire.before * 100) / 100) + ' → ' + (Math.round(nextHire.after * 100) / 100)
                });
                var need = Math.max(0, Math.ceil(r.required - r.disabled - 1e-9));
                rows.push({
                    label: '补到免征还需招',
                    value: need + ' 人',
                    kind: 'text',
                    hint: need > 0 ? '安排比例达到规定比例即免征，招满这 ' + need + ' 人后应缴为 0' : '已达免征比例'
                });
                if (r.smallExempt) {
                    // 30 人是临界点不是起征点：多招 1 个普通人，这笔钱可能从 0 直接跳成一整年的数。
                    var over = Q.levyOf(Object.assign({}, levyInput, { headcount: 31 }));
                    rows.push({
                        label: '超过 30 人后（按 31 人）应缴',
                        value: over.payable,
                        kind: 'money',
                        hint: '临界点不是起征点：成本从 0 直接跳到这个数'
                    });
                }
                return {
                    primary: { label: '应缴残疾人就业保障金', value: r.payable, kind: 'money' },
                    rows: rows,
                    note: '残保金 =（应安排人数 − 已安排人数）× 上年在职职工年平均工资（按当地社平 2 倍封顶）× 分档系数；在职 30 人（含）以下暂免征收。'
                };
            }
        },

        // ---- 企业与经营 ----
        {
            id: 'vat', name: '增值税', subtitle: '小规模季度 30 万免征 / 一般纳税人销项减进项',
            group: 'corp', icon: 'fa-shopping-cart', status: 'native', seoPath: '/seo/vat.html',
            policyKey: 'vat-small-scale',
            nextTools: ['surtax-stamp', 'corporate-income-tax', 'business-income'],
            // 阶段17 分步编排（17A-1）：`step` 引用下方 `steps` 的 key。
            // 纯增量声明 —— 速算器页（status:'native'）不读 steps，行为与改动前完全一致，
            // 20 个既有工具零影响；只有通用 deep 渲染器会消费它。
            // 结果步由渲染器自动追加（所有完整测算都有，「计算结果」不在此重复声明）。
            fields: [
                { key: 'variant', step: 'identity', label: '计税场景', type: 'select', default: 'small', options: [{ value: 'small', label: '小规模纳税人' }, { value: 'general', label: '一般纳税人' }, { value: 'split', label: '价税分离' }] },
                { key: 'sales', step: 'data', label: '本期销售额', type: 'money', default: 280000, when: { key: 'variant', in: ['small'] } },
                { key: 'period', step: 'data', label: '纳税期', type: 'select', default: 'quarter', options: [{ value: 'quarter', label: '按季' }, { value: 'month', label: '按月' }], when: { key: 'variant', in: ['small'] } },
                { key: 'specialInvoice', step: 'data', label: '其中专票销售额', type: 'money', default: 0, when: { key: 'variant', in: ['small'] }, hint: '免征只覆盖普票，专票部分照缴' },
                { key: 'output', step: 'data', label: '销售额', type: 'money', default: 113000, when: { key: 'variant', in: ['general'] } },
                { key: 'inputTax', step: 'data', label: '当期进项税额', type: 'money', default: 8000, when: { key: 'variant', in: ['general'] } },
                { key: 'rate', step: 'data', label: '适用税率', type: 'select', default: 0.13, options: [{ value: 0.13, label: '13%' }, { value: 0.09, label: '9%' }, { value: 0.06, label: '6%' }, { value: 0.03, label: '3%（简易）' }], when: { key: 'variant', in: ['general', 'split'] } },
                { key: 'amount', step: 'data', label: '金额', type: 'money', default: 113000, when: { key: 'variant', in: ['split'] } },
                { key: 'taxIncluded', step: 'data', label: '金额为含税价', type: 'switch', default: true, when: { key: 'variant', in: ['small', 'general', 'split'] } }
            ],
            steps: [
                { key: 'identity', title: '纳税人身份', why: '决定用哪种计税方法：小规模按「不含税销售额 × 征收率」，一般纳税人按「销项税额 − 进项税额」' },
                { key: 'data', title: '本期数据', why: '增值税按纳税期申报；先确认金额是否为含税价 —— 价外税必须价税分离后再计税' }
            ],
            pitfalls: [
                '增值税是**价外税**：含税价必须先分离，直接「含税价 × 税率」会多算',
                '小规模「季 30 万」是**临界点不是起征点**：超过即全额计税，且专票不免税',
                '小规模适用简易计税、**不得抵扣进项**；一般纳税人抵不完的留抵下期、不倒欠'
            ],
            compute: function (v) {
                var Q = window.EuriskoVatQuick;
                if (!Q) return null;
                if (v.variant === 'small') {
                    var r = Q.smallScaleOf({ sales: v.sales, period: v.period, taxIncluded: v.taxIncluded, specialInvoice: v.specialInvoice });
                    return {
                        primary: { label: '应纳增值税', value: r.tax, kind: 'money' },
                        rows: [
                            { label: '不含税销售额', value: r.exclusive, kind: 'money' },
                            { label: '本季免征额度', value: r.threshold, kind: 'money' },
                            { label: '是否免征', value: r.exempt ? '是（普票部分）' : '否（全额计税）', kind: 'text' },
                            { label: '征收率（现行减按）', value: r.rate, kind: 'percent' },
                            { label: '法定 3% 对照', value: r.statutoryTax, kind: 'money' },
                            { label: '临界提示：再超 1 分即全额计税', value: r.cliffTax, kind: 'money', hint: '免征状态下再多 1 分钱的税额' }
                        ],
                        note: '免征额度按**全部不含税销售额**判断、含本数；超过即按全额计税，不是只对超出部分计税。',
                        // 推导链（台账 C 同一套 step schema，由 utils.js 的 renderFormulaStepsHtml 渲染）：
                        // 小规模最容易错的一步就是「拿含税价和 30 万比」，所以第一步必须是价税分离。
                        steps: [
                            {
                                title: '① 价税分离：' + (v.taxIncluded ? '含税价 → 不含税价' : '本身就是不含税价'),
                                rows: [
                                    { label: '本期销售额（' + (v.taxIncluded ? '含税' : '不含税') + '）', value: v.sales, format: 'money' },
                                    { label: '征收率', value: r.rate, format: 'percent' },
                                    { label: '不含税销售额', value: r.exclusive, format: 'money', note: v.taxIncluded ? '含税价 ÷ (1 + 征收率)' : '无需换算' }
                                ],
                                totalLabel: '用于比较免征额度的销售额',
                                totalValue: r.exclusive,
                                format: 'money',
                                footnote: '免征额度比的是**不含税**销售额；直接拿含税价和 30 万比，会把本该免征的算成应税。'
                            },
                            {
                                title: '② 与免征额度比较：' + (r.exempt ? '未超过 → 普票部分免征' : '已超过 → 全额计税'),
                                rows: [
                                    { label: r.period === 'quarter' ? '季度免征额度' : '月度免征额度', value: r.threshold, format: 'money' },
                                    { label: '其中专票销售额', value: v.specialInvoice, format: 'money', note: '专票不享受免征' },
                                    { label: '法定 3% 对照（未减征）', value: r.statutoryTax, format: 'money' }
                                ],
                                totalLabel: '应纳增值税',
                                totalValue: r.tax,
                                format: 'money',
                                footnote: '临界点不是起征点：再多 1 分钱就要按全额计税（¥' + Number(r.cliffTax).toFixed(2) + '），不是只对超出部分计税。'
                            }
                        ]
                    };
                }
                if (v.variant === 'general') {
                    // 注意：generalOf 的进项税额参数名是 input（不是 inputTax）
                    var g = Q.generalOf({ output: v.output, input: v.inputTax, rate: Number(v.rate), taxIncluded: v.taxIncluded });
                    return {
                        primary: { label: '应纳增值税（销项 − 进项）', value: g.tax, kind: 'money' },
                        rows: [
                            { label: '不含税销售额', value: g.exclusive, kind: 'money' },
                            { label: '销项税额', value: g.outputTax, kind: 'money' },
                            { label: '进项税额', value: g.inputTax, kind: 'money' },
                            { label: '留抵税额（结转下期）', value: g.credit, kind: 'money' },
                            { label: '实际税负率', value: g.burden, kind: 'percent' },
                            { label: '简易计税 3% 对照', value: g.simplifiedTax, kind: 'money' }
                        ],
                        note: '应纳税额 = 销项税额 − 进项税额，不足抵扣的留抵下期继续抵扣，不倒欠。',
                        steps: [
                            {
                                title: '① 价税分离',
                                rows: [
                                    { label: '销售额（' + (v.taxIncluded ? '含税' : '不含税') + '）', value: v.output, format: 'money' },
                                    { label: '适用税率', value: Number(v.rate), format: 'percent' }
                                ],
                                totalLabel: '不含税销售额',
                                totalValue: g.exclusive,
                                format: 'money'
                            },
                            {
                                title: '② 销项税额',
                                rows: [
                                    { label: '不含税销售额', value: g.exclusive, format: 'money' },
                                    { label: '适用税率', value: Number(v.rate), format: 'percent' }
                                ],
                                totalLabel: '销项税额',
                                totalValue: g.outputTax,
                                format: 'money'
                            },
                            {
                                title: '③ 抵扣进项',
                                rows: [
                                    { label: '销项税额', value: g.outputTax, format: 'money' },
                                    { label: '当期进项税额', value: g.inputTax, format: 'money' },
                                    { label: '留抵税额（结转下期）', value: g.credit, format: 'money' },
                                    { label: '实际税负率', value: g.burden, format: 'percent' }
                                ],
                                totalLabel: '应纳增值税（销项 − 进项）',
                                totalValue: g.tax,
                                format: 'money',
                                footnote: '进项大于销项时留抵下期继续抵扣，**不倒欠**；简易计税 3% 对照为 ¥' + Number(g.simplifiedTax).toFixed(2) + '。'
                            }
                        ]
                    };
                }
                var p = Q.priceSplitOf({ amount: v.amount, rate: Number(v.rate), taxIncluded: v.taxIncluded });
                return {
                    primary: { label: '税额', value: p.tax, kind: 'money' },
                    rows: [
                        { label: '不含税价', value: p.exclusive, kind: 'money' },
                        { label: '含税价', value: p.inclusive, kind: 'money' },
                        { label: '税率', value: p.rate, kind: 'percent' }
                    ],
                    note: '含税价 ÷ (1 + 税率) = 不含税价；误用「含税价 × 税率」会多算税款。',
                    steps: [
                        {
                            title: '价税分离',
                            rows: [
                                { label: v.taxIncluded ? '含税金额' : '不含税金额', value: v.amount, format: 'money' },
                                { label: '税率', value: Number(v.rate), format: 'percent' },
                                { label: '不含税价', value: p.exclusive, format: 'money' },
                                { label: '含税价', value: p.inclusive, format: 'money' }
                            ],
                            totalLabel: '税额',
                            totalValue: p.tax,
                            format: 'money',
                            footnote: '含税价 ÷ (1 + 税率) = 不含税价；误用「含税价 × 税率」会多算税款。'
                        }
                    ]
                    };
            }
        },
        {
            id: 'corporate-income-tax', name: '企业所得税', subtitle: '一般 25% / 小微 5% / 高新 15%',
            group: 'corp', icon: 'fa-bank', status: 'native', seoPath: '/seo/corporate-income-tax.html',
            policyKey: 'corporate-small-low-profit',
            nextTools: ['vat', 'surtax-stamp', 'employer-cost'],
            // 阶段17 分步编排（17A-1 / 17C-2）：`step` 引用下方 `steps` 的 key，与 vat / surtax-stamp 同一套约定。
            // 纯增量声明 —— 速算器页不读 steps，且默认 mode='direct' 时可见字段与改动前完全一致。
            // 分步顺序把「身份与规模」排在「利润」之前：小微三条件是「且」的关系，
            // 先知道自己够不够格，才知道后面填的利润按哪一档计税。
            fields: [
                { key: 'staff', step: 'identity', label: '从业人数', type: 'number', default: 80 },
                { key: 'assetsWan', step: 'identity', label: '资产总额（万元）', type: 'number', default: 3000 },
                { key: 'highTech', step: 'identity', label: '高新技术企业', type: 'switch', default: false },
                { key: 'restricted', step: 'identity', label: '属于限制/禁止行业', type: 'switch', default: false },
                { key: 'mode', step: 'profit', label: '利润怎么填', type: 'select', default: 'direct', options: [{ value: 'direct', label: '直接填应纳税所得额' }, { value: 'adjust', label: '从收入成本算（含纳税调整）' }] },
                { key: 'taxable', step: 'profit', label: '年应纳税所得额', type: 'money', default: 2800000, when: { key: 'mode', in: ['direct'] } },
                { key: 'revenue', step: 'profit', label: '营业收入', type: 'money', default: 5000000, when: { key: 'mode', in: ['adjust'] } },
                { key: 'cost', step: 'profit', label: '成本、费用、税金及损失', type: 'money', default: 4200000, when: { key: 'mode', in: ['adjust'] } },
                { key: 'entertainment', step: 'profit', label: '业务招待费', type: 'money', default: 60000, when: { key: 'mode', in: ['adjust'] }, hint: '只能扣发生额的 60%，且不超过收入的 5‰' },
                { key: 'advertising', step: 'profit', label: '广告费与业务宣传费', type: 'money', default: 200000, when: { key: 'mode', in: ['adjust'] }, hint: '不超过收入 15% 的部分可扣，超出结转以后年度' },
                { key: 'donation', step: 'profit', label: '公益性捐赠支出', type: 'money', default: 100000, when: { key: 'mode', in: ['adjust'] }, hint: '不超过年度利润总额 12% 的部分可扣，超出结转三年' },
                { key: 'previousLoss', step: 'profit', label: '可弥补以前年度亏损', type: 'money', default: 0, when: { key: 'mode', in: ['adjust'] } }
            ],
            steps: [
                { key: 'identity', title: '企业身份与规模', why: '小微三个条件是「且」的关系（应纳税所得额 ≤ 300 万、从业人数 ≤ 300 人、资产总额 ≤ 5000 万）且非限制/禁止行业；高新 15% 与小微 5% 不叠加，按税额孰优' },
                { key: 'profit', title: '利润与纳税调整', why: '企业所得税算的是**利润**不是收入：会计利润还要把超限额的业务招待费、广宣费、公益性捐赠**调增**回来，才是申报表上的应纳税所得额' }
            ],
            pitfalls: [
                '小微实际税负 **5% 是乘出来的**（减按 25% 计入 × 20% 税率）',
                '三个门槛是「**且**」的关系且是**临界点**：300 万交 15 万，301 万交 75.25 万 —— 多 1 万利润多缴 60.25 万税',
                '高新 15% 与小微 5% **不叠加**，按孰优',
                '纳税调整是**调增不是扣减**：超限额的业务招待费、广宣费、公益性捐赠要加回利润，直接按会计利润申报会少缴'
            ],
            compute: function (v) {
                var C = window.EuriskoCorporateQuick;
                if (!C) return null;
                var taxable;
                var adjust = null;
                if (v.mode === 'adjust') {
                    // 申报表口径：会计利润 → 三大扣除限额调增 → 弥补以前年度亏损 → 应纳税所得额。
                    // 限额比例同样取自 tax-constants（deductionLimitOf），本文件不内置任何数字。
                    var revenue = Number(v.revenue) || 0;
                    var profit = Math.max(0, revenue - (Number(v.cost) || 0));
                    adjust = C.deductionLimitOf({
                        revenue: revenue, profit: profit,
                        entertainment: v.entertainment, advertising: v.advertising, donation: v.donation
                    });
                    taxable = Math.max(0, adjust.adjustedProfit - (Number(v.previousLoss) || 0));
                } else {
                    taxable = Number(v.taxable) || 0;
                }
                var r = C.enterpriseOf({
                    taxable: taxable,
                    staff: v.staff,
                    assets: (Number(v.assetsWan) || 0) * 10000,
                    highTech: !!v.highTech,
                    restricted: !!v.restricted
                });
                var regimeText = { small: '小型微利', highTech: '高新技术企业', general: '一般企业' }[r.regime] || r.regime;
                var rows = [];
                if (adjust) {
                    // 调整明细放在最前面：用户先看到「我的会计利润怎么变成应纳税所得额的」，
                    // 再看适用哪一档税率 —— 顺序反了会让人以为调增是税率的一部分。
                    rows.push({ label: '会计利润（收入 − 成本费用）', value: adjust.profit, kind: 'money' });
                    rows.push({ label: '业务招待费调增', value: adjust.entertainment.addBack, kind: 'money', hint: '发生额 60% 与收入 5‰ 孰低后的差额' });
                    rows.push({ label: '广宣费调增', value: adjust.advertising.addBack, kind: 'money', hint: '超收入 15% 的部分，结转以后年度' });
                    rows.push({ label: '公益性捐赠调增', value: adjust.donation.addBack, kind: 'money', hint: '超利润总额 12% 的部分，结转三年' });
                    rows.push({ label: '纳税调增合计', value: adjust.totalAddBack, kind: 'money' });
                    rows.push({ label: '弥补以前年度亏损', value: Math.min(Number(v.previousLoss) || 0, adjust.adjustedProfit), kind: 'money' });
                }
                rows.push({ label: '应纳税所得额', value: r.taxable, kind: 'money' });
                rows.push({ label: '适用身份', value: regimeText, kind: 'text', hint: '按税额孰优选取；小微与高新不叠加' });
                rows.push({ label: '实际税负率', value: r.effectiveRate, kind: 'percent' });
                rows.push({ label: '按法定 25% 对照', value: r.statutoryTax, kind: 'money' });
                rows.push({ label: '优惠减免', value: r.saving, kind: 'money' });
                if (r.smallTax !== null) rows.push({ label: '小微口径税额', value: r.smallTax, kind: 'money' });
                if (r.highTechTax !== null) rows.push({ label: '高新口径税额', value: r.highTechTax, kind: 'money' });
                if (!r.qualified) {
                    rows.push({
                        label: '未满足小微的原因',
                        value: { taxable: '应纳税所得额超 300 万', staff: '从业人数超 300 人', assets: '资产总额超 5000 万', restricted: '属于限制/禁止行业' }[r.fails[0]] || '—',
                        kind: 'text'
                    });
                }
                rows.push({ label: '踩线代价（+1 元）', value: r.cliff.gap, kind: 'money', hint: '超过 300 万后按全额 25% 计税的差额' });
                return {
                    primary: { label: '应纳企业所得税', value: r.tax, kind: 'money' },
                    rows: rows,
                    note: adjust
                        ? '应纳税所得额 = 会计利润 + 纳税调增 − 可弥补亏损；三大限额（招待费 60% 与 5‰ 孰低、广宣费 15%、捐赠 12%）以注册表状态为准。'
                        : '小微优惠需同时满足：年应纳税所得额 ≤ 300 万、从业人数 ≤ 300 人、资产总额 ≤ 5000 万，且从事国家非限制和禁止行业（至 2027-12-31，以注册表状态为准）。'
                };
            }
        },
        {
            id: 'surtax-stamp', name: '附加税与印花税', subtitle: '城建税 7/5/1% + 教育费附加 + 印花税 17 税目',
            group: 'corp', icon: 'fa-tags', status: 'native', seoPath: '/seo/surtax-stamp-duty.html',
            policyKey: 'surtax',
            nextTools: ['vat', 'corporate-income-tax', 'business-income'],
            // 阶段17 分步编排（17A-1）：`step` 引用下方 `steps` 的 key，与 vat 同一套约定。
            // 纯增量声明 —— 速算器页不读 steps，20 个既有工具行为不变。
            // 分步顺序刻意把「计税依据」放在最后：附加税的计税依据是实缴增值税，
            // 先弄清是对什么征、再看数字，比一上来填数更不容易搞错基数。
            fields: [
                { key: 'variant', step: 'identity', label: '算哪一项', type: 'select', default: 'surtax', options: [{ value: 'surtax', label: '附加税（城建 + 教育费附加）' }, { value: 'stamp', label: '印花税' }] },
                { key: 'location', step: 'basis', label: '所在地', type: 'select', default: 'urban', options: [{ value: 'urban', label: '市区（7%）' }, { value: 'county', label: '县城、镇（5%）' }, { value: 'other', label: '其他（1%）' }], when: { key: 'variant', in: ['surtax'] } },
                { key: 'vat', step: 'basis', label: '实际缴纳的增值税', type: 'money', default: 100000, when: { key: 'variant', in: ['surtax'] }, hint: '计税依据是**实缴**税额，不是销售额 —— 增值税为零时附加税也为零' },
                { key: 'consumption', step: 'basis', label: '实际缴纳的消费税', type: 'money', default: 0, when: { key: 'variant', in: ['surtax'] } },
                { key: 'item', step: 'basis', label: '税目', type: 'select', default: 'sale', options: [
                    { value: 'sale', label: '买卖合同（万分之三）' },
                    { value: 'loan', label: '借款合同（万分之零点五）' },
                    { value: 'financeLease', label: '融资租赁合同（万分之零点五）' },
                    { value: 'contract', label: '承揽合同（万分之三）' },
                    { value: 'construction', label: '建设工程合同（万分之三）' },
                    { value: 'transport', label: '运输合同（万分之三）' },
                    { value: 'technology', label: '技术合同（万分之三）' },
                    { value: 'lease', label: '租赁合同（千分之一）' },
                    { value: 'custody', label: '保管合同（千分之一）' },
                    { value: 'warehouse', label: '仓储合同（千分之一）' },
                    { value: 'insurance', label: '财产保险合同（千分之一）' },
                    { value: 'landTransfer', label: '土地使用权出让/转让书据（万分之五）' },
                    { value: 'propertyTransfer', label: '房屋等建筑物转让书据（万分之五）' },
                    { value: 'equityTransfer', label: '股权转让书据（万分之五）' },
                    { value: 'ipTransfer', label: '商标/著作权等转让书据（万分之三）' },
                    { value: 'accountBook', label: '营业账簿（万分之二点五）' },
                    { value: 'securities', label: '证券交易（千分之一，不减半）' }
                ], when: { key: 'variant', in: ['stamp'] } },
                { key: 'amount', step: 'basis', label: '凭证金额', type: 'money', default: 1000000, when: { key: 'variant', in: ['stamp'] } },
                { key: 'stampVat', step: 'basis', label: '单独列明的增值税', type: 'money', default: 0, when: { key: 'variant', in: ['stamp'] }, hint: '单独列明的可从计税依据中扣除' },
                { key: 'halve', step: 'basis', label: '享受六税两费减半', type: 'switch', default: true }
            ],
            steps: [
                { key: 'identity', title: '税种选择', why: '附加税与印花税的计税依据完全不同：前者跟着增值税走，后者按凭证金额走 —— 先定是哪个' },
                { key: 'basis', title: '计税依据', why: '这一步反复核对的依据：附加税看实际缴纳的增值税与消费税，印花税看凭证金额且不含单独列明的增值税' }
            ],
            pitfalls: [
                '附加税的计税依据是**实际缴纳的增值税 + 消费税**，不是销售额，也不是申报表的应纳数',
                '印花税计税依据**不含单独列明的增值税**；未分别列明的，从高适用税率',
                '证券交易印花税**不享受**六税两费减半（且仅对卖方征收）'
            ],
            compute: function (v) {
                var Q = window.EuriskoSurtaxQuick;
                if (!Q) return null;
                if (v.variant === 'stamp') {
                    var s = Q.stampDutyOf({ item: v.item, amount: v.amount, vat: v.stampVat, halve: !!v.halve });
                    return {
                        primary: { label: '应纳印花税', value: s.tax, kind: 'money' },
                        rows: [
                            { label: '税目', value: s.name, kind: 'text' },
                            { label: '税率', value: s.rateText, kind: 'text' },
                            { label: '计税依据', value: s.baseName, kind: 'text' },
                            { label: '计税金额', value: s.base, kind: 'money' },
                            { label: '法定税额（未减半）', value: s.statutoryTax, kind: 'money' },
                            { label: '减半优惠', value: s.saved, kind: 'money', hint: s.halveApplicable ? '' : '证券交易不享受减半' },
                            { label: '备注', value: s.note || '—', kind: 'text' }
                        ],
                        note: '印花税按应税凭证所列金额计税，不含单独列明的增值税；同一凭证涉及多税目未分别列明金额的，从高适用税率。'
                    };
                }
                var r = Q.surtaxOf({ vat: v.vat, consumption: v.consumption, location: v.location, halve: !!v.halve });
                return {
                    primary: { label: '附加税费合计', value: r.total, kind: 'money' },
                    rows: [
                        { label: '计税依据（增值税 + 消费税）', value: r.base, kind: 'money' },
                        { label: '所在地', value: r.locationLabel, kind: 'text' },
                        { label: '城建税税率', value: r.cityRate, kind: 'percent' },
                        { label: '城建税', value: r.cityTax, kind: 'money' },
                        { label: '教育费附加（3%）', value: r.educationTax, kind: 'money' },
                        { label: '地方教育附加（2%）', value: r.localEducationTax, kind: 'money' },
                        { label: '法定合计（未减半）', value: r.statutoryTotal, kind: 'money' },
                        { label: '减半优惠', value: r.saved, kind: 'money' },
                        { label: '综合负担率', value: r.effectiveRate, kind: 'percent' }
                    ],
                    note: '附加税以实际缴纳的增值税、消费税为计税依据；市区城建税 7% + 教育费附加 3% + 地方教育附加 2% = 12%，六税两费减半后为 6%。'
                };
            }
        },
        {
            id: 'business-income', name: '个体户经营所得', subtitle: '核定征收 vs 查账征收哪个划算',
            group: 'corp', icon: 'fa-briefcase', status: 'native', seoPath: '/seo/business-income.html',
            policyKey: 'business-income',
            nextTools: ['vat', 'surtax-stamp', 'social-base'],
            fields: [
                { key: 'revenue', label: '年收入总额', type: 'money', default: 1000000 },
                { key: 'profitRatio', label: '核定应税所得率（%）', type: 'percent', default: 10, hint: '行业不同，通常 3%~30%' },
                { key: 'cost', label: '成本费用税金损失合计', type: 'money', default: 700000 },
                { key: 'previousLoss', label: '可弥补以前年度亏损', type: 'money', default: 0 },
                { key: 'hasComprehensiveIncome', label: '另有工资薪金等综合所得', type: 'switch', default: false, hint: '有综合所得时，业主费用扣除与专项附加只能在综合所得一侧扣' },
                { key: 'halve', label: '享受经营所得减半', type: 'switch', default: true, hint: '应纳税所得额 ≤ 200 万的部分减半（至 2027-12-31）' }
            ],
            pitfalls: [
                '经营所得用的是**五级**税率表（5%~35%），不是工资那张七级表',
                '核定征收**不扣成本、不扣 6 万、不扣专项附加**，利润薄时反而比查账交得多',
                '减半只减「应纳税所得额 ≤ 200 万那部分对应的税额」，不是全额减半'
            ],
            compute: function (v) {
                var Q = window.EuriskoBusinessIncomeQuick;
                if (!Q) return null;
                var r = Q.compareOf({
                    revenue: v.revenue,
                    profitRatio: (Number(v.profitRatio) || 0) / 100,
                    cost: v.cost,
                    previousLoss: v.previousLoss,
                    hasComprehensiveIncome: !!v.hasComprehensiveIncome,
                    halve: !!v.halve
                });
                var pick = r.cheaper === 'audited' ? r.audited : r.assessed;
                var modeText = r.cheaper === 'audited' ? '查账' : (r.cheaper === 'assessed' ? '核定' : '两者相同');
                return {
                    primary: { label: '经营所得应纳个税（' + modeText + '）', value: pick.tax, kind: 'money' },
                    rows: [
                        { label: '核定征收税额', value: r.assessed.tax, kind: 'money' },
                        { label: '查账征收税额', value: r.audited.tax, kind: 'money' },
                        { label: '两者差额', value: r.diff, kind: 'money', hint: '正数 = 查账更省' },
                        { label: '核定应纳税所得额', value: r.assessed.taxable, kind: 'money', hint: '收入 × 应税所得率，不扣成本' },
                        { label: '查账应纳税所得额', value: r.audited.taxable, kind: 'money' },
                        { label: '查账利润（收入 − 成本）', value: r.audited.profit, kind: 'money' },
                        { label: '业主费用扣除', value: r.audited.investorDeduction, kind: 'money' },
                        { label: '减半优惠（查账）', value: r.audited.halve, kind: 'money' },
                        { label: '实际利润率', value: r.actualProfitRatio, kind: 'percent' }
                    ],
                    note: '核定征收按「收入 × 应税所得率」计税，不扣成本费用与业主费用；查账征收按利润扣 6 万业主费用后计税。实际利润率低于临界点时查账更划算。'
                };
            }
        }
    ];

    // ====== 查询接口 ======
    function all() { return TOOLS.slice(); }
    function deep() { return DEEP.slice(); }
    function groups() { return GROUPS.slice(); }
    function deepGroup() { return DEEP_GROUP; }
    function scenarios() { return SCENARIOS.slice(); }

    function get(id) {
        for (var i = 0; i < TOOLS.length; i++) if (TOOLS[i].id === id) return TOOLS[i];
        for (var j = 0; j < DEEP.length; j++) if (DEEP[j].id === id) return DEEP[j];
        return null;
    }

    function byGroup(groupId) {
        return TOOLS.filter(function (t) { return t.group === groupId; });
    }

    function byScenario(scenarioId) {
        for (var i = 0; i < SCENARIOS.length; i++) {
            if (SCENARIOS[i].id === scenarioId) {
                return SCENARIOS[i].tools.map(get).filter(Boolean);
            }
        }
        return [];
    }

    // 搜索：名称 / 副标题 / 别名 / 场景名
    var ALIASES = {
        'salary-tax': '工资 月薪 个税 到手 累计预扣',
        'net-salary': '谈薪 倒算 税后 到手 反向',
        'bonus-tax': '年终奖 一次性奖金 单独计税',
        'special-deduction': '子女教育 赡养老人 房贷 房租 扣除',
        'annual-settlement': '汇算 退税 补税 多处任职 跳槽',
        'withholding': '劳务报酬 稿酬 特许权 预扣',
        'equity': '股权 期权 限制性股票 激励',
        'severance': '离职 补偿 裁员 经济补偿金 免税',
        'early-retirement': '内退 提前退休 一次性收入',
        'expat': '外籍 港澳台 津补贴 免税',
        'private-pension': '养老金 12000 递延',
        'health-insurance': '健康险 2400 税优',
        'annuity': '年金 4% 企业年金',
        'social-base': '社保 公积金 五险一金 基数 上下限',
        'employer-cost': '用工成本 单位 成本倍数 涨薪',
        'disability-fund': '残保金 工会经费 30人',
        'vat': '增值税 小规模 一般纳税人 进项 销项 免税',
        'corporate-income-tax': '企业所得税 小微 高新 25%',
        'surtax-stamp': '城建税 附加 印花税 教育费附加',
        'business-income': '个体户 核定 查账 经营所得',
        'forward': '综合所得 正向 年度预算',
        'business': '经营所得 个体 独资',
        'classification': '分类所得 利息 租赁 转让 偶然',
        'reverse': '反向 倒算 反推'
    };

    function search(keyword) {
        var kw = String(keyword || '').trim().toLowerCase();
        if (!kw) return { deep: DEEP.slice(), tools: TOOLS.slice(), matched: false };
        function hit(t) {
            var hay = (t.name + ' ' + (t.subtitle || '') + ' ' + (ALIASES[t.id] || '')).toLowerCase();
            return hay.indexOf(kw) !== -1;
        }
        return { deep: DEEP.filter(hit), tools: TOOLS.filter(hit), matched: true };
    }

    // ====== spec 驱动的完整测算自动与同名速算器配对（阶段17 17A-5 / 17C-*） ======
    // 约定：`X-deep` 自动复用 `X` 的 fields / steps / compute / pitfalls / policyKey，
    // 且指向**同一个对象**，不是复制两份。一旦复制，就会出现「同一个税种、速算器与完整测算
    // 算出两个数」的口径漂移 —— 增值税漂一点还会顺着依赖链放大到附加税印花税上。
    //
    // 这段约定本身才是阶段17 的交付物：**新增一个完整测算 = 在 DEEP 里加一条 spec**，
    // 不必改本文件的共享逻辑、不必改 index.html、不必写任何渲染代码。
    // （原先是硬编码 vat → vat-deep 一对；改成按后缀配对，是第二个税种落地时逼出来的。）
    (function () {
        var SHARED = ['fields', 'steps', 'compute', 'pitfalls', 'policyKey'];
        DEEP.forEach(function (t) {
            if (t.pageId) return;                    // 页面式 deep 有各自 HTML，不参与配对
            var twinId = t.id.replace(/-deep$/, '');
            if (twinId === t.id) return;             // 不是 X-deep 形式，没有孪生速算器
            var twin = get(twinId);
            if (!twin) return;
            SHARED.forEach(function (k) { t[k] = twin[k]; });
        });
    })();

    window.EuriskoToolRegistry = {
        groups: groups,
        deep: deep,
        deepGroup: deepGroup,
        scenarios: scenarios,
        all: all,
        get: get,
        byGroup: byGroup,
        byScenario: byScenario,
        search: search
    };
})();
