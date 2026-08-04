// === 悬浮税助手：问答库数据 ===
// 按分类组织，每条记录包含：
//   keywords  搜索匹配关键词
//   question  问题
//   answer    答案（\n 换行）
//   hot       是否热门（可选，首页热门区展示）
//   related   关联跳转（可选）：{ page: 页面ID, label: 按钮文案 }
// 拓展时直接在对应分类数组中追加即可

const TAX_ASSISTANT_QA = [
    // ===== 综合所得计税 =====
    {
        id: 'comp_basic',
        category: '综合所得',
        keywords: ['综合所得', '工资', '薪金', '劳务报酬', '稿酬', '特许权使用费', '收入额'],
        question: '综合所得包括哪些收入？',
        answer: '综合所得包括四类收入：\n1. 工资薪金所得（全额计入）\n2. 劳务报酬所得（按80%折算计入）\n3. 稿酬所得（按80%×70%=56%折算计入）\n4. 特许权使用费所得（按80%折算计入）\n\n这四项合并后，减去基本减除费用（6万/年）、专项扣除（社保公积金）、专项附加扣除后，适用3%-45%七级超额累进税率。',
        related: { page: 'forward-calculation-page', label: '去综合所得测算' }
    },
    {
        id: 'comp_rate',
        category: '综合所得',
        keywords: ['税率', '档位', '七级', '累进'],
        question: '综合所得税率表是怎样的？',
        answer: '综合所得适用7级超额累进税率：\n• 不超过3.6万：3%\n• 3.6万-14.4万：10%\n• 14.4万-30万：20%\n• 30万-42万：25%\n• 42万-66万：30%\n• 66万-96万：35%\n• 超过96万：45%\n\n注：以上为年度应纳税所得额档位。',
        hot: true,
        related: { page: 'forward-calculation-page', label: '去综合所得测算' }
    },
    {
        id: 'comp_bonus',
        category: '综合所得',
        keywords: ['年终奖', '一次性奖金', '单独计税', '并入'],
        question: '年终奖如何计税更划算？',
        answer: '年终奖有两种计税方式：\n\n1. 单独计税：年终奖÷12找适用税率，单独计算税额\n2. 并入综合所得：与工资等合并计税\n\n选择建议：\n• 如果综合所得（不含奖金）低于6万或扣除后为负，选"并入"更划算\n• 如果综合所得已较高（25%以上档位），选"单独计税"可能更划算\n• 建议两种都测算，取税负较低者',
        hot: true,
        related: { page: 'forward-calculation-page', label: '去综合所得测算' }
    },
    {
        id: 'comp_special_deduction',
        category: '综合所得',
        keywords: ['专项附加扣除', '子女教育', '赡养老人', '住房', '继续教育', '大病医疗'],
        question: '专项附加扣除有哪些项目？',
        answer: '专项附加扣除共7项：\n1. 子女教育：每个子女2000元/月\n2. 3岁以下婴幼儿照护：每个2000元/月\n3. 赡养老人：独生子女3000元/月，非独生子女分摊最高1500元/月\n4. 住房贷款利息：1000元/月\n5. 住房租金：800-1500元/月（按城市）\n6. 继续教育：学历教育400元/月（最长48月），职业资格3600元/年\n7. 大病医疗：自付超1.5万部分，限额8万/年\n\n注意：住房租金与贷款利息不可同时享受。',
        hot: true,
        related: { page: 'forward-calculation-page', label: '去综合所得测算' }
    },
    {
        id: 'comp_pension',
        category: '综合所得',
        keywords: ['个人养老金', '养老金', '扣除'],
        question: '个人养老金如何享受税前扣除？',
        answer: '个人养老金扣除要点：\n• 年度缴纳上限：12000元\n• 在综合所得中税前扣除\n• 领取时单独按3%税率计税\n• 适合中高收入人群节税\n\n在本系统中，"其他扣除"部分可填写个人养老金金额。',
        related: { page: 'forward-calculation-page', label: '去综合所得测算' }
    },
    {
        id: 'comp_labor',
        category: '综合所得',
        keywords: ['劳务报酬', '兼职', '外包', '80%'],
        question: '劳务报酬所得如何计算？',
        answer: '劳务报酬所得计税规则：\n• 预扣预缴：每次≤4000减800，>4000减20%\n• 预扣率：20%（≤2万）/ 30%（2万-5万）/ 40%（>5万）\n• 年度汇算时：按收入额（×80%）并入综合所得\n\n例：单次劳务报酬10000元\n预扣 = 10000×(1-20%)×20% = 1600元\n\n年度汇算时，这笔按8000元并入综合所得重新计税，多退少补。',
        related: { page: 'forward-calculation-page', label: '去综合所得测算' }
    },
    {
        id: 'comp_manuscript',
        category: '综合所得',
        keywords: ['稿酬', '稿费', '出版', '56%'],
        question: '稿酬所得怎么计算？',
        answer: '稿酬所得计税规则：\n• 收入额 = 收入 × 80% × 70% = 收入 × 56%\n• 按56%计入综合所得\n• 预扣率：与劳务报酬相同（20%/30%/40%三档）\n\n例：稿酬10000元\n收入额 = 10000 × 56% = 5600元\n预扣 = 5600 × 20% = 1120元\n\n稿酬的税负比劳务报酬更轻（再减30%）。',
        related: { page: 'forward-calculation-page', label: '去综合所得测算' }
    },
    {
        id: 'comp_rent_deduction',
        category: '综合所得',
        keywords: ['住房租金', '扣除标准', '1500', '1100', '800'],
        question: '住房租金扣除具体标准是多少？',
        answer: '住房租金专项附加扣除标准（按工作城市）：\n• 直辖市/省会/计划单列市：1500元/月\n• 户籍人口超100万的城市：1100元/月\n• 其他城市：800元/月\n\n条件：\n• 本人及配偶在主要工作城市无自有住房\n• 与住房贷款利息不可同时享受\n• 夫妻双方可由一方扣除',
        related: { page: 'forward-calculation-page', label: '去综合所得测算' }
    },
    {
        id: 'comp_multi_employer',
        category: '综合所得',
        keywords: ['多处工资', '两份工作', '兼职工资', '合并'],
        question: '多处取得工资如何计税？',
        answer: '多处取得工资薪金的处理：\n• 预扣预缴：各任职单位分别按累计预扣法预扣\n• 年度汇算：合并全部工资薪金，统一计算应纳税额\n• 减除费用6万只在一家单位享受（或汇算时统一扣除）\n\n注意：多处领薪往往预缴不足，汇算时需补税的概率较高，建议预留资金。',
        related: { page: 'forward-calculation-page', label: '去综合所得测算' }
    },
    {
        id: 'comp_equity',
        category: '综合所得',
        keywords: ['股权激励', '股票期权', '限制性股票', '激励'],
        question: '股权激励如何计税？',
        answer: '股权激励计税要点：\n• 居民个人符合条件的股权激励，可单独计税\n• 不并入当年综合所得\n• 按"年终奖"类似方式：应纳税所得额÷12找税率\n• 适用综合所得7级累进税率表\n\n2023年12月31日前取得的股权激励可单独计税，政策已延续。汇算时也可选择并入综合所得，建议测算比较。',
        hot: true
    },

    // ===== 经营所得计税 =====
    {
        id: 'biz_basic',
        category: '经营所得',
        keywords: ['经营所得', '个体工商户', '个人独资', '合伙企业'],
        question: '经营所得的计税范围是什么？',
        answer: '经营所得适用于：\n• 个体工商户\n• 个人独资企业投资人\n• 合伙企业自然人合伙人\n• 其他从事生产、经营活动的个人\n\n计税方式：\n收入总额 - 成本费用 - 损失 - 投资者扣除 - 允许弥补的以前年度亏损 = 应纳税所得额\n\n适用5%-35%五级超额累进税率。',
        related: { page: 'business-calculation-page', label: '去经营所得测算' }
    },
    {
        id: 'biz_rate',
        category: '经营所得',
        keywords: ['经营所得', '税率', '五级', '累进'],
        question: '经营所得税率表是怎样的？',
        answer: '经营所得适用5级超额累进税率：\n• 不超过3万：5%\n• 3万-9万：10%\n• 9万-30万：20%\n• 30万-50万：30%\n• 超过50万：35%\n\n注：以上为年度应纳税所得额档位。',
        related: { page: 'business-calculation-page', label: '去经营所得测算' }
    },
    {
        id: 'biz_half_reduction',
        category: '经营所得',
        keywords: ['减半征收', '优惠', '200万', '个体工商户'],
        question: '经营所得减半征收优惠怎么享受？',
        answer: '减半征收优惠要点：\n• 适用对象：个体工商户\n• 优惠内容：年应纳税所得额不超过200万元的部分，减半征收\n• 有效期：2023.1.1 - 2027.12.31\n• 系统自动计算：在经营所得计税页面，系统会自动应用该优惠',
        hot: true,
        related: { page: 'business-calculation-page', label: '去经营所得测算' }
    },
    {
        id: 'biz_with_comp',
        category: '经营所得',
        keywords: ['综合所得', '重复扣除', '基本减除', '6万'],
        question: '同时有经营所得和综合所得，6万减除怎么扣？',
        answer: '重要规则：\n基本减除费用6万元/年、社保公积金、专项附加扣除等，只能在综合所得或经营所得中扣除一次，不可重复。\n\n本系统的处理方式：\n• 勾选"有综合所得"：这些扣除在综合所得中享受，经营所得不再扣除\n• 不勾选"无综合所得"：可在经营所得中扣除每月5000元减除费用及社保公积金\n\n建议：通常在综合所得中扣除更划算。',
        related: { page: 'business-calculation-page', label: '去经营所得测算' }
    },
    {
        id: 'biz_loss_carryforward',
        category: '经营所得',
        keywords: ['亏损', '弥补', '以前年度', '结转'],
        question: '经营所得亏损怎么弥补？',
        answer: '经营所得亏损弥补规则：\n• 亏损可向以后年度结转弥补\n• 最长结转年限：5年\n• 弥补顺序：先弥补以前年度最早亏损，逐年向后\n• 需在汇算清缴时填报《个人所得税经营所得纳税申报表（B表）》\n\n注意：核定征收期间发生的亏损不得弥补。',
        related: { page: 'business-calculation-page', label: '去经营所得测算' }
    },

    // ===== 分类所得计税 =====
    {
        id: 'cls_basic',
        category: '分类所得',
        keywords: ['分类所得', '利息', '股息', '红利', '财产租赁', '财产转让', '偶然所得'],
        question: '分类所得包括哪些？税率多少？',
        answer: '分类所得共4类，统一适用20%比例税率：\n\n1. 利息、股息、红利所得：全额计税\n2. 财产租赁所得：≤4000减800，>4000减20%\n3. 财产转让所得：收入 - 财产原值 - 合理费用\n4. 偶然所得：全额计税（如中奖）\n\n分类所得与综合所得分别计税，不合并。',
        related: { page: 'classification-calculation-page', label: '去分类所得测算' }
    },
    {
        id: 'cls_rent',
        category: '分类所得',
        keywords: ['租金', '房屋出租', '财产租赁', '800'],
        question: '房屋租金收入如何计税？',
        answer: '财产租赁所得计税：\n• 月租金≤4000：减除800元后计税\n• 月租金>4000：减除20%后计税\n• 税率：20%\n\n例如：月租金3000元\n应纳税 = (3000-800) × 20% = 440元\n\n月租金5000元\n应纳税 = 5000 × (1-20%) × 20% = 800元',
        related: { page: 'classification-calculation-page', label: '去分类所得测算' }
    },
    {
        id: 'cls_transfer',
        category: '分类所得',
        keywords: ['财产转让', '卖房', '卖股', '股权转让', '原值'],
        question: '财产转让所得如何计税？',
        answer: '财产转让所得计税：\n• 应纳税所得额 = 转让收入 - 财产原值 - 合理费用\n• 税率：20%\n\n常见情形：\n• 卖房：收入-购房款-税金-合理费用\n• 卖股：A股个人转让暂免（除限售股）\n• 股权转让：按转让价与原值差额计税\n\n注意：满五唯一的住房转让可免征个税。',
        related: { page: 'classification-calculation-page', label: '去分类所得测算' }
    },
    {
        id: 'cls_accidental',
        category: '分类所得',
        keywords: ['偶然所得', '中奖', '彩票', '赠与'],
        question: '偶然所得（中奖）怎么交税？',
        answer: '偶然所得计税：\n• 全额计税，税率20%\n• 常见情形：中奖、中彩、奖金、赠与\n\n特殊规定：\n• 福彩/体彩一次性中奖≤1万元：免税\n• 超过1万元：全额按20%计税\n• 企业向个人赠与（如促销抽奖）：按20%代扣代缴\n\n例：中彩5万元\n应纳税 = 50000 × 20% = 10000元',
        hot: true,
        related: { page: 'classification-calculation-page', label: '去分类所得测算' }
    },

    // ===== 反向倒算 =====
    {
        id: 'rev_basic',
        category: '反向倒算',
        keywords: ['反向倒算', '目标税率', '到手收入', '目标税额'],
        question: '反向倒算有什么用？',
        answer: '反向倒算适用于薪酬规划场景：\n\n1. 按目标税率倒算：给定希望适用的税率档位，反推所需税前收入\n2. 按月度税后倒算：给定每月到手金额，反推税前月薪\n3. 按目标税额倒算：给定全年纳税总额，反推收入\n\n支持三种模式对比：\n• 保守：取档位下限\n• 均衡：取档位中值\n• 进取：取档位上限\n\n适合财务人员、薪酬规划、薪资谈判参考。',
        hot: true,
        related: { page: 'reverse-calculation-page', label: '去反向倒算测算' }
    },
    {
        id: 'rev_modes',
        category: '反向倒算',
        keywords: ['保守', '均衡', '进取', '模式区别'],
        question: '反向倒算三种模式有什么区别？',
        answer: '三种模式对应档位取值不同：\n\n• 保守模式：取税率档位下限\n  → 税前收入要求较低，税负轻但到手也少\n\n• 均衡模式：取税率档位中值\n  → 平衡选择，居中\n\n• 进取模式：取税率档位上限\n  → 税前收入要求较高，税负重但到手更多\n\n适用场景：\n• 薪资谈判：参考进取模式\n• 保守预算：参考保守模式\n• 年度规划：参考均衡模式',
        related: { page: 'reverse-calculation-page', label: '去反向倒算测算' }
    },

    // ===== 汇算清缴 =====
    {
        id: 'settlement_basic',
        category: '汇算清缴',
        keywords: ['汇算清缴', '退税', '补税', '多退少补'],
        question: '年度汇算清缴怎么办理？',
        answer: '汇算清缴要点：\n• 时间：次年3月1日 - 6月30日\n• 对象：上年度综合所得\n• 方式：登录"个人所得税"APP办理\n• 原则：预缴税额 > 应纳税额 → 退税\n         预缴税额 < 应纳税额 → 补税\n\n免办情形：\n• 综合所得≤12万且需补税\n• 补税金额≤400元',
        hot: true,
        related: { page: 'forward-calculation-page', label: '去综合所得测算' }
    },
    {
        id: 'settlement_prepaid',
        category: '汇算清缴',
        keywords: ['预缴', '预扣预缴', '已缴税额'],
        question: '已预缴税额在哪里查看？',
        answer: '查看已预缴税额途径：\n1. 个人所得税APP → 首页 → 收入纳税明细\n2. 单位财务部门查询工资条中的"累计已扣税"\n3. 税务局办税服务厅\n\n在本系统中，"基本参数"步骤的"全年累计已预缴税额"填写后，系统会自动计算应退/应补税额。',
        related: { page: 'forward-calculation-page', label: '去综合所得测算' }
    },
    {
        id: 'settlement_refund_time',
        category: '汇算清缴',
        keywords: ['退税到账', '退税时间', '多久', '进度'],
        question: '汇算清缴退税多久到账？',
        answer: '退税到账时间：\n• 申请退税后，税务机关审核一般10个工作日内完成\n• 审核通过后，国库退库一般3-7个工作日到账\n• 整体通常2-4周到账\n\n查询进度：\n• 个税APP → 服务 → 申报查询 → 退税进度\n• 银行卡需为本人I类账户\n\n未到账原因：\n• 银行账户异常\n• 申报数据存疑需核实\n• 身份信息不一致',
        hot: true
    },
    {
        id: 'settlement_app',
        category: '汇算清缴',
        keywords: ['个税APP', '操作', '办理', '申报流程'],
        question: '个税APP如何办理汇算？',
        answer: '个税APP办理汇算步骤：\n1. 登录"个人所得税"APP\n2. 首页 → 综合所得年度汇算\n3. 选择"使用已申报数据填写"\n4. 核对收入、扣除信息\n5. 确认应退/应补税额\n6. 退税：绑定银行卡 → 提交退税申请\n   补税：选择支付方式 → 完成缴税\n\n提示：建议先在"收入纳税明细"核对每笔收入，有异议可申诉。'
    },

    // ===== 政策法规 =====
    {
        id: 'policy_2024',
        category: '政策法规',
        keywords: ['2024', '2025', '新政策', '专项附加扣除', '提高'],
        question: '2024年起专项附加扣除有什么变化？',
        answer: '2024年专项附加扣除主要变化：\n\n1. 子女教育：从1000元/月提高到2000元/月\n2. 3岁以下婴幼儿照护：从1000元/月提高到2000元/月\n3. 赡养老人：从2000元/月提高到3000元/月\n\n这些标准本系统已全部采用。',
        hot: true
    },
    {
        id: 'policy_pension',
        category: '政策法规',
        keywords: ['个人养老金', '试点', '全国', '12000'],
        question: '个人养老金政策最新情况？',
        answer: '个人养老金政策：\n• 2024年12月15日起在全国推广实施\n• 年度缴纳上限12000元\n• 缴存阶段：税前扣除\n• 投资阶段：收益暂不征税\n• 领取阶段：单独按3%税率计税\n• 参加条件：参加基本养老保险的劳动者均可参加'
    },
    {
        id: 'policy_annuity',
        category: '政策法规',
        keywords: ['企业年金', '职业年金', '年金'],
        question: '企业年金/职业年金如何计税？',
        answer: '年金计税规则：\n• 缴存阶段：企业/事业单位缴费部分 + 个人缴费≤4%部分，暂不征税\n• 投资阶段：收益暂不征税\n• 领取阶段：按"工资薪金"单独计税，可均摊到各月\n\n年金与个人养老金区别：\n• 年金由单位建立，个人养老金个人自愿参加\n• 年金领取按工资薪金税率，个人养老金领取按3%固定税率'
    }
];

// 快捷功能链接
const TAX_ASSISTANT_SHORTCUTS = [
    { id: 'rate_table', icon: 'fa-table', label: '税率表速查', action: 'showRateTable' },
    { id: 'bonus_calc', icon: 'fa-gift', label: '年终奖测算', action: 'goBonusCalc' },
    { id: 'history', icon: 'fa-history', label: '历史记录', action: 'goHistory' },
    { id: 'help', icon: 'fa-question-circle', label: '使用帮助', action: 'showHelp' }
];

// 暴露到全局
window.TAX_ASSISTANT_QA = TAX_ASSISTANT_QA;
window.TAX_ASSISTANT_SHORTCUTS = TAX_ASSISTANT_SHORTCUTS;
