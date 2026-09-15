// 税法常量单一事实来源（税率表 / 缴费基数下限）
//
// 加载顺序硬约束：本文件必须先于所有消费者加载。
//   - index.html：紧随「引入分离的JavaScript文件」注释之后，为全部脚本中的第一个
//   - 测试：tests/helpers/load-source.js 以间接 eval 注入，任何加载
//     tax-calculator.js 的测试都必须先 loadSource 本文件
//   消费者：tax-calculator.js、helper-functions.js、utils.js
//
// 为什么用 var 而非 const（勿改）：
//   浏览器中顶层 const 会生成全局词法绑定，跨 <script> 可见；但测试用的间接
//   eval（(0, eval)(code)）会为 let/const 单独创建声明式环境，跨文件不可见，
//   而 var 在全局 eval 中会落到全局对象上。用 var 才能让两种环境行为一致。
//   这正是 history-sync.js 选择「挂 window.EuriskoSync」的同一原因。
//
// 阶段12 C1 契约（运行时热更新，勿破坏）：
//   本文件只是「出厂基线」。运行时会被 src/js/data/tax-rates-sync.js 用管理台发布的配置覆盖
//   （window.TaxRates.applyRates 会直接改写下列全局 var，并同步 window.EuriskoTaxConstants）。
//   因此计算层请始终「直接引用这些全局变量」，不要在模块顶层把它们缓存进局部常量。

// 常量版本号：税制调整时递增，便于排查“前端常量与政策不一致”类问题
var TAX_CONSTANTS_VERSION = '2026.1';

// 综合所得税率表
var comprehensiveTaxRates = [
    { min: 0, max: 36000, rate: 0.03, deduction: 0 },
    { min: 36000, max: 144000, rate: 0.10, deduction: 2520 },
    { min: 144000, max: 300000, rate: 0.20, deduction: 16920 },
    { min: 300000, max: 420000, rate: 0.25, deduction: 31920 },
    { min: 420000, max: 660000, rate: 0.30, deduction: 52920 },
    { min: 660000, max: 960000, rate: 0.35, deduction: 85920 },
    { min: 960000, max: Infinity, rate: 0.45, deduction: 181920 }
];

// 月度税率表（用于年终奖单独计税）
var bonusMonthlyTaxRates = [
    { max: 3000, rate: 0.03, deduction: 0 },
    { max: 12000, rate: 0.10, deduction: 210 },
    { max: 25000, rate: 0.20, deduction: 1410 },
    { max: 35000, rate: 0.25, deduction: 2660 },
    { max: 55000, rate: 0.30, deduction: 4410 },
    { max: 80000, rate: 0.35, deduction: 7160 },
    { max: Infinity, rate: 0.45, deduction: 15160 }
];

// 经营所得税率表
var businessTaxRates = [
    { max: 30000, rate: 0.05, deduction: 0 },
    { max: 90000, rate: 0.10, deduction: 1500 },
    { max: 300000, rate: 0.20, deduction: 10500 },
    { max: 500000, rate: 0.30, deduction: 40500 },
    { max: Infinity, rate: 0.35, deduction: 65500 }
];

// 分类所得税率表（比例税率20%）
var classificationTaxRates = {
    interest: { rate: 0.20, name: '利息、股息、红利所得' },
    rent: { rate: 0.20, name: '财产租赁所得' },
    transfer: { rate: 0.20, name: '财产转让所得' },
    accidental: { rate: 0.20, name: '偶然所得' }
};

// 劳务报酬 / 稿酬 / 特许权使用费 —— 预扣预缴税率表（阶段15 15A-1）
//
// 政策依据：《个人所得税扣缴申报管理办法（试行）》（国家税务总局公告 2018 年第 61 号）第八条、第九条
//   - 劳务报酬：按「应纳税所得额」适用 20% / 30% / 40% 三级超额累进（速算扣除数 0 / 2000 / 7000）
//   - 稿酬、特许权使用费：预扣率固定 20%（单档，便于与劳务共用同一套查表代码）
//
// 为什么把「20/30/40」从 tax-calculator.js 里搬出来：
//   阶段15 的落地页要在页面上算同一笔税，若页面抄一份、内核留一份，就是第二处口径。
//   搬到这里后，内核 calculateOtherIncome 与 withholding-quick.js 读同一份，
//   由 tests/withholding-quick.test.js 逐点对拍证明二者等价。
//   （未纳入 tax-rates-sync.js 的后端热改字段：这三个预扣率自 2019 年起未调整，
//     属「长期稳定参数」；若哪天调整，按 15D-3 的多税种版本化扩进 /api/config/tax-rates。）
var withholdingTaxRates = {
    labor: [
        { max: 20000, rate: 0.20, deduction: 0 },
        { max: 50000, rate: 0.30, deduction: 2000 },
        { max: Infinity, rate: 0.40, deduction: 7000 }
    ],
    author: [
        { max: Infinity, rate: 0.20, deduction: 0 }
    ],
    royalty: [
        { max: Infinity, rate: 0.20, deduction: 0 }
    ]
};

// 劳务报酬 / 稿酬 / 特许权使用费 —— 费用扣除与「并入综合所得」折算规则（阶段15 15A-1）
//
//   threshold / flat / ratio：预扣预缴阶段的费用扣除
//       收入 ≤ 4000 → 减除费用 800；收入 > 4000 → 减除 20%
//   postRatio：费用扣除后再打的折（稿酬再减按 70% 计算，即「打七折」）
//   incomeRatio：年度汇算并入综合所得时的收入额折算（劳务 / 特许权 80%，稿酬 80% × 70% = 56%）
//
// 字段刻意拆开而不是直接写死 0.56：三个所得的差别只在 postRatio，
//   拆分后内核与落地页共用同一个表达式，不会出现「页面按 56%、内核按 0.8×0.7」这类表述差异。
var otherIncomeRules = {
    labor: { name: '劳务报酬所得', threshold: 4000, flat: 800, ratio: 0.8, postRatio: 1, incomeRatio: 0.8 },
    author: { name: '稿酬所得', threshold: 4000, flat: 800, ratio: 0.8, postRatio: 0.7, incomeRatio: 0.8 },
    royalty: { name: '特许权使用费所得', threshold: 4000, flat: 800, ratio: 0.8, postRatio: 1, incomeRatio: 0.8 }
};

// 股权激励所得 —— 计税规则（阶段15 15A-2）
//
// 政策依据：《关于个人所得税法修改后有关优惠政策衔接问题的通知》第二条（财税〔2018〕164 号）
//            《关于延续实施上市公司股权激励个人所得税政策的公告》（财政部 税务总局公告 2023 年第 25 号）
//   居民个人取得股票期权、股票增值权、限制性股票、股权奖励等股权激励，符合条件的，
//   在 2027-12-31 前**不并入当年综合所得，全额单独适用综合所得税率表**计算纳税：
//       应纳税额 = 股权激励收入 × 适用税率 − 速算扣除数（不减除任何费用）
//
// 为什么这里没有税率表：
//   单独计税用的是**年度综合所得税率表**（comprehensiveTaxRates），不是另一套表 ——
//   写成 rateTable 的名字而不是复制一张表，改税率时就只有一处要改（与 15D-1 同一原则）。
//
// 为什么 expiresOn 也写在这里：
//   到期日既要在页面正文里「呈现」，也要能被注册表 expiringWithin() 复核；
//   只写页面 = 到期了没人知道，只写注册表 = 页面上那句「执行至 2027 年底」仍是手抄的。
var equityIncentiveRules = {
    rateTable: 'comprehensiveTaxRates',   // 全额单独适用年度综合所得税率表
    noDeduction: true,                    // 不减除费用、不扣 6 万元基本减除费用
    combineWithinYear: true,              // 一个纳税年度内两次以上股权激励应合并计算
    expiresOn: '2027-12-31',
    // 四种激励的「股权激励收入」怎么算（types 只描述公式，不含数字）
    types: {
        option: { name: '股票期权', formula: '（行权日每股市场价 − 每股施权价）× 行权股票数量' },
        restricted: { name: '限制性股票', formula: '（登记日市价 + 解禁日市价）÷ 2 × 解禁份数 − 该批次出资额' },
        appreciation: { name: '股票增值权', formula: '（行权日每股价格 − 授权日每股价格）× 行权份数' },
        award: { name: '股权奖励', formula: '（取得股票时的公平市场价格 − 每股实际出资额）× 取得股票数量' }
    },
    // 非上市公司符合条件的股权激励可递延纳税：行权时暂不缴，转让时按「财产转让所得」20% 计税
    deferred: { rate: 0.2, name: '非上市公司符合条件的递延纳税（财税〔2016〕101 号）' }
};

// 解除劳动关系一次性补偿收入 —— 计税规则（阶段15 15A-3）
//
// 政策依据：《关于个人所得税法修改后有关优惠政策衔接问题的通知》第五条第一项（财税〔2018〕164 号）
//   个人与用人单位解除劳动关系取得一次性补偿收入（经济补偿金、生活补助费和其他补助费），
//   在当地上年职工平均工资 3 倍数额以内的部分，免征个人所得税；超过 3 倍数额的部分，
//   **不并入当年综合所得，单独适用综合所得税率表**计算纳税（不减除任何费用）。
//
// 「12 年」到底管什么（全网最常写错的一处，页面单列一节解释）：
//   《劳动合同法》第四十七条封的是**经济补偿金本身**：月工资高于当地上年度职工月平均工资
//   3 倍的按 3 倍计，且支付年限不超过 12 年 —— 这决定「你能合法拿多少」，不是计税方法。
//   旧的计税方法是国税发〔1999〕178 号的「÷ 工作年限（最长 12）平均成月工资再查月度表」，
//   该做法自 2019 年起**已不再执行**（164 号改为超额部分直接单独适用年度税率表）。
//   所以本规则里的 capYears 只用于算「法定经济补偿上限」，计算税额时不做任何平均。
//
// 免税额度只能抵「符合法定标准的补偿」：
//   超出法定标准发放的部分（如违法解除的赔偿金中超出经济补偿标准的部分），
//   无论是否超过 3 倍社平工资都不得免税 —— 这也是为什么页面把「经济补偿金」与
//   「其他补助费」拆成两个输入框。
var severanceRules = {
    rateTable: 'comprehensiveTaxRates',      // 超额部分单独适用**年度**综合所得税率表
    exemptMultipleOfAverageWage: 3,          // 免税额度 = 当地上年职工年平均工资 × 3
    capYears: 12,                            // 劳动合同法：经济补偿支付年限上限（超过 12 年按 12 年）
    capMonthlyWageMultiple: 3,               // 劳动合同法：月工资封顶为当地上年度职工月平均工资 × 3
    noDeduction: true,                       // 超额部分不减除任何费用（不扣 6 万元，也不扣专项附加）
    notMergedIntoComprehensive: true,        // 不并入当年综合所得
    noAveraging: true,                       // 不再按工作年限平均（国税发〔1999〕178 号做法已停止执行）
    expiresOn: null                          // 非过渡性优惠，长期有效（无到期日）
};

// 个人所得税专项附加扣除 —— 七项标准（阶段15 15A-4）
//
// 政策依据：
//   《个人所得税专项附加扣除暂行办法》（国发〔2018〕41 号，2019-01-01 起施行）
//   《关于提高个人所得税有关专项附加扣除标准的通知》（国发〔2023〕13 号）：
//     自 2023-01-01 起，3 岁以下婴幼儿照护与子女教育 1000 → 2000 元/月、
//     赡养老人 2000 → 3000 元/月（独生子女）；非独生子女与兄弟姐妹分摊，每人不超过 1500 元/月。
//
// 口径要点（页面 / 速算 / App 必须同源，改这里一处即可）：
//   1. 除大病医疗按「年度据实、限额 8 万」外，其余各项均按**月**定额扣除：全年扣除 = 月标准 × 享受月数；
//   2. 分摊：子女教育与婴幼儿照护可由父母一方按 100% 扣除、或双方各按 50% 扣除（选定后一个年度内不得变更）；
//      赡养老人非独生子女分摊每人不超过 monthlyCapPerPerson；
//   3. 互斥：住房贷款利息与住房租金**同一纳税年度只能二选一**（exclusive），不可叠加；
//   4. 大病医疗：医保目录内个人自付累计超过 threshold 的部分才可扣，年度限额 annualCap，
//      且只能在**年度汇算**时办理（平时预扣预缴不扣）；
//   5. 每年 annualConfirmMonth（12 月）需确认次年信息；未及时确认的，扣缴单位自次年 1 月起暂停扣除，
//      但可在汇算清缴时补充扣除 —— 所以「忘了确认」不会少扣税，只是当月到手变少。
var specialDeductionRules = {
    rateTable: 'comprehensiveTaxRates',   // 节税额按**年度**综合所得税率表估算（扣除降低的是应纳税所得额）
    annualConfirmMonth: 12,               // 每年 12 月确认次年享受的专项附加扣除信息
    items: {
        infantCare: {
            label: '3 岁以下婴幼儿照护', monthly: 2000, months: 12,
            unit: '每个婴幼儿', sharable: true
        },
        childrenEducation: {
            label: '子女教育', monthly: 2000, months: 12,
            unit: '每个子女', sharable: true
        },
        continuingEducationDegree: {
            label: '继续教育（学历 / 学位）', monthly: 400, maxMonths: 48,
            unit: '同一学历（学位）继续教育期间'
        },
        continuingEducationCert: {
            label: '继续教育（职业资格）', annual: 3600, oneOff: true,
            unit: '取得相关证书当年'
        },
        seriousIllness: {
            label: '大病医疗', threshold: 15000, annualCap: 80000, annualOnly: true,
            unit: '医保目录内个人自付累计'
        },
        housingLoan: {
            label: '住房贷款利息', monthly: 1000, maxMonths: 240,
            unit: '首套住房贷款'
        },
        housingRent: {
            label: '住房租金', monthlyByCityTier: [1500, 1100, 800], months: 12,
            unit: '直辖市 / 省会等 1500，市辖区户籍人口超 100 万 1100，不超 100 万 800'
        },
        elderlySupport: {
            label: '赡养老人', monthly: 3000, monthlyCapPerPerson: 1500, months: 12,
            unit: '被赡养人年满 60 岁'
        }
    },
    exclusive: [['housingLoan', 'housingRent']],   // 同一纳税年度二选一，不可叠加
    expiresOn: null                                // 长期制度，无到期日
};

// 个人养老金 —— 税前扣除与领取环节计税（阶段15 15A-5）
//
// 政策依据：《关于个人养老金有关个人所得税政策的公告》（财政部 税务总局公告 2024 年第 21 号）：
//   自 2024-01-01 起在**全国范围**实施 —— 缴费环节按 12000 元/年的限额标准在综合所得或经营所得中
//   据实扣除；投资环节收益暂不征收个人所得税；领取环节按 3% 单独计税（不并入综合所得）。
//   （此前：财政部 税务总局公告 2022 年第 34 号，自 2022-01-01 起仅在先行城市 / 地区实施。）
//
// 口径要点（页面 / 速算 / App 必须同源，改这里一处即可）：
//   1. 缴费扣的是**应纳税所得额**，所以「少交多少税」= T(x) − T(x − min(缴费额, 限额))，
//      不是「12000 × 税率」—— 跨档时后者必然高估（与专项附加扣除页同一条纠偏）；
//   2. 领取时按 **领取额全额**（本金 + 收益）乘 3%，不扣除任何费用、不与综合所得合并；
//   3. 净优惠 = 缴费环节少交的税 − 领取环节交的 3%。只有适用税率 **高于 3%** 才划算：
//      落在 3% 档（全年应纳税所得额 ≤ 36000）的人「省 3% 交 3%」，等于白锁流动性；
//   4. 缴费上限由人社部、财政部根据经济社会发展水平与多层次养老保险体系发展情况**适时调整**，
//      本页按现行 12000 元/年（月均 1000 元）计算。
var privatePensionRules = {
    rateTable: 'comprehensiveTaxRates',   // 缴费环节少交的税按**年度**综合所得税率表算（与内核同一张表）
    annualLimit: 12000,                   // 每年税前扣除限额（缴费超过部分当年不可扣，也不能结转）
    withdrawRate: 0.03,                   // 领取环节单独计税税率（不并入综合所得）
    withdrawIsSeparate: true,             // 领取时单独计税，不与当年综合所得合并、不参与汇算
    investmentTaxFree: true,              // 投资环节收益暂不征税
    effectiveFrom: '2024-01-01',          // 21 号公告起全国实施
    expiresOn: null                       // 长期制度，无到期日（缴费上限可动态调整）
};

// 外籍个人津补贴免税 —— 与专项附加扣除二选一（阶段15 15A-6）
//
// 政策依据：《关于延续实施外籍个人有关津补贴个人所得税政策的公告》
//           （财政部 税务总局公告 2023 年第 29 号，**执行至 2027-12-31**）：
//   符合居民个人条件的外籍个人，可以选择享受个人所得税专项附加扣除，也可以选择按
//   财税字〔1994〕020 号、国税发〔1997〕54 号、财税〔2004〕29 号的规定享受
//   住房补贴、语言训练费、子女教育费等津补贴免税优惠，**但不得同时享受**；
//   一经选择，在一个纳税年度内不得变更。
//
// 口径要点（页面 / 速算 / App 必须同源，改这里一处即可）：
//   1. 这是**二选一**而不是叠加：不能一边扣专项附加扣除、一边把津补贴当免税；
//   2. 「免税」同样是通过降低应纳税所得额来少交税（与专项附加扣除同一条纠偏），
//      所以两条路径的「少交的税」都要按 T(x) − T(x − 金额) 算，而不是「金额 × 税率」；
//   3. 免税补贴须**以非现金形式或实报实销形式**取得（或按合理标准、经税务机关审核批准）；
//   4. **有到期日**：执行至 2027-12-31。到期提醒由注册表 statusOf / expiringWithin 统一给出，
//      页面不允许把「执行至 X 年」写成写完就忘的装饰。
var expatAllowanceRules = {
    rateTable: 'comprehensiveTaxRates',   // 两条路径都按**年度**综合所得税率表计税
    exclusiveWithSpecialDeduction: true,  // 与专项附加扣除二选一，不得同时享受
    changeNotAllowedInYear: true,         // 一经选择，一个纳税年度内不得变更
    appliesTo: '符合居民个人条件的外籍个人（含港澳台居民，见财税〔2004〕29 号）',
    items: [
        { label: '住房补贴', condition: '以非现金形式或实报实销形式取得' },
        { label: '伙食补贴', condition: '以非现金形式或实报实销形式取得' },
        { label: '搬迁费', condition: '以非现金形式或实报实销形式取得' },
        { label: '洗衣费', condition: '以非现金形式或实报实销形式取得' },
        { label: '境内、外出差补贴', condition: '按合理标准取得' },
        { label: '探亲费', condition: '经当地税务机关审核批准为合理的部分（每年不超过 2 次）' },
        { label: '语言训练费', condition: '经当地税务机关审核批准为合理的部分' },
        { label: '子女教育费', condition: '经当地税务机关审核批准为合理的部分' }
    ],
    expiresOn: '2027-12-31'               // 29 号公告执行期限；到期提醒由注册表统一计算
};

// 提前退休 / 内部退养一次性收入 —— 与「离职补偿金」是三套不同口径（阶段15 15A-7）
//
// 政策依据：《关于个人所得税法修改后有关优惠政策衔接问题的通知》（财税〔2018〕164 号）第五条：
//   （二）提前退休：一次性补贴收入按**办理提前退休手续至法定退休年龄之间实际年度数**平均分摊，
//        确定适用税率和速算扣除数，**单独适用综合所得税率表**计算纳税。
//        应纳税额 = {〔(一次性补贴收入 ÷ 实际年度数) − 费用扣除标准〕× 适用税率 − 速算扣除数} × 实际年度数
//   （三）内部退养：按《国家税务总局关于个人所得税有关政策问题的通知》（国税发〔1999〕58 号）第一条：
//        一次性收入按**办理内部退养手续后至法定离退休年龄之间的所属月份**进行平均，
//        **与领取当月的工资薪金合并后减除当月费用扣除标准**，以余额为基数确定适用税率；
//        再将当月工资薪金加上一次性收入、减去费用扣除标准，按适用税率计征。
//
// 三处最容易混淆的地方（页面 / 速算 / App 必须同源，改这里一处即可）：
//   1. 提前退休是**真的分摊计税**（先按年减 6 万、算完再乘回年数），
//      而内部退养的「平均」**只用来定档**，计税基数仍是当月工资 + 一次性收入的全额；
//   2. 提前退休用**年度**综合所得税率表、减 6 万/年；内部退养用**月度**税率表、减 5000 元/月，
//      并且要**与当月工资合并**定档 —— 当月工资越高，一次性收入适用的税率越高；
//   3. 这与「离职补偿金」（15A-3）不是一回事：离职补偿有 **3 倍社平工资免税额度**、超额部分
//      单独适用年度税率表且**不做分摊**；提前退休**没有免税额度**但**按年分摊**。
var earlyRetirementRules = {
    early: {
        rateTable: 'comprehensiveTaxRates',   // 年度综合所得税率表（与 App 内核同一张表）
        annualDeduction: 60000,               // 分摊后每年减 60000 元费用扣除标准
        spread: true                          // 真分摊：算完每年税额再乘回实际年度数
    },
    internal: {
        rateTable: 'bonusMonthlyTaxRates',    // 月度税率表（与年终奖单独计税同一张表）
        monthlyDeduction: 5000,               // 当月费用扣除标准 5000 元/月
        averageOnlyForRate: true,             // 平均只为定档，计税基数不摊
        mergeWithMonthlySalary: true          // 与领取当月工资薪金合并后定档
    },
    effectiveFrom: '2019-01-01',              // 164 号文执行起始
    expiresOn: null                           // 长期政策，无到期日
};

// 企业所得税（阶段15 15B-2）—— 与个税、增值税都不同源：这是对企业**利润**征的税，
// 计算由 corporate-income-tax-quick.js 读这里，页面 /seo/corporate-income-tax.html 读 quick。
//
// 2026 年现行口径（三处最容易踩）：
//   1. 法定税率 25%（企业所得税法）。高新技术企业减按 15%（税法第二十八条）。
//   2. 小型微利企业优惠（财政部 税务总局公告 2023 年第 12 号，执行至 2027-12-31）：
//      减按 **25% 计入应纳税所得额**，再按 20% 税率 → **实际税负 5%**。
//      注意是「先打折计入、再乘 20%」，不是「税率 5%」—— 两档相乘才是 5%。
//   3. 小微门槛**三条同时满足**且是**临界点**：年应纳税所得额 ≤ 300 万元、从业人数 ≤ 300 人、
//      资产总额 ≤ 5000 万元、从事国家非限制和禁止行业。任一超标就**全部**按 25%，
//      不是只对超出部分 —— 所以 300 万是真正的悬崖（300 万交 15 万，301 万交 75.25 万）。
var corporateIncomeTaxRules = {
    statutoryRate: 0.25,          // 法定税率 25%
    rates: [
        { rate: 0.25, label: '一般企业（法定税率）' },
        { rate: 0.20, label: '小型微利企业（减按 25% 计入应纳税所得额后按 20% 税率，实际税负 5%）' },
        { rate: 0.15, label: '高新技术企业（减按 15%）' },
        { rate: 0.20, label: '非居民企业取得本法第三条第三款所得（预提所得税，实际减按 10% 征收）' }
    ],
    small: {
        taxableCap: 3000000,      // 年应纳税所得额不超过 300 万元
        staffCap: 300,            // 从业人数不超过 300 人
        assetsCap: 50000000,      // 资产总额不超过 5000 万元
        includedRatio: 0.25,      // 减按 25% 计入应纳税所得额
        rate: 0.20,               // 按 20% 的税率
        effectiveRate: 0.05,      // 实际税负 = 25% × 20% = 5%
        requireAll: true,         // 三个条件须**同时**满足
        needNotRestricted: true,  // 从事国家非限制和禁止行业
        effectiveFrom: '2023-01-01',
        expiresOn: '2027-12-31'
    },
    highTechRate: 0.15,           // 高新技术企业：减按 15%
    dividend: { rate: 0.20 },     // 税后利润分红给个人股东：股息红利个税 20%
    limits: {
        // 业务招待费：按发生额的 60% 扣除，但最高不得超过当年销售（营业）收入的 5‰
        entertainment: { ratioOfAmount: 0.6, capOfRevenue: 0.005, carryForward: false },
        // 广告费和业务宣传费：不超过当年销售（营业）收入 15% 的部分准予扣除，超过部分结转以后年度
        advertising: { capOfRevenue: 0.15, carryForward: true },
        // 公益性捐赠：在年度利润总额 12% 以内扣除，超过部分结转以后三年
        donation: { capOfProfit: 0.12, carryForwardYears: 3 }
    },
    effectiveFrom: '2008-01-01'
};

// 增值税（阶段15 15B-1）—— 与个税不同源：这是流转税，本文件只存「法定档位与优惠参数」，
// 计算由 vat-quick.js 读这里，页面 /seo/vat.html 读 quick，避免第二份口径。
//
// 2026 年现行口径（三处最容易搞混）：
//   1. 2026-01-01 起施行《中华人民共和国增值税法》（主席令第四十一号），同时废止原暂行条例：
//      一般纳税人税率档 13% / 9% / 6% / 0%；小规模纳税人适用简易计税方法，征收率 3%
//      （小规模标准：年应征增值税销售额 500 万元以下）。
//   2. 小规模纳税人的「月 10 万 / 季 30 万以下免征」与「3% 减按 1%」是**阶段性优惠**
//      （财政部 税务总局公告 2023 年第 19 号，执行至 2027-12-31），不是法定征收率本身 ——
//      到期日登记在注册表 vat-small-scale 条目上，页面只读 statusOf，不自己算日期。
//   3. 免征判断用的是**不含税**销售额，且按**全部**销售额判断：一旦超过额度就**全额**计税，
//      不是只对超出部分 —— 所以「季度 30 万」是真正的临界点（多 1 分钱多缴约 3000 元）。
var vatRules = {
    smallScale: {
        levyRate: 0.03,              // 法定征收率（增值税法：小规模简易计税 3%）
        reducedRate: 0.01,           // 现行优惠：3% 减按 1%（2023 年第 19 号）
        monthlyThreshold: 100000,    // 按月纳税：月销售额 10 万元（含本数）以下免征
        quarterlyThreshold: 300000,  // 按季纳税：季度销售额 30 万元（含本数）以下免征
        annualSalesCap: 5000000,     // 小规模纳税人标准：年应征增值税销售额 500 万元以下
        thresholdInclusive: true,    // 含本数（≤ 即免征）
        thresholdBasis: 'exclusive'  // 以不含税销售额判断
    },
    general: {
        rates: [
            { rate: 0.13, label: '销售货物 / 加工修理修配服务 / 有形动产租赁服务 / 进口货物' },
            { rate: 0.09, label: '交通运输 / 邮政 / 基础电信 / 建筑 / 不动产租赁 / 销售不动产 / 转让土地使用权 / 农产品等' },
            { rate: 0.06, label: '其他服务 / 无形资产' },
            { rate: 0, label: '出口货物 / 跨境销售规定范围内的服务与无形资产' }
        ],
        simplifiedRate: 0.03,        // 一般纳税人的简易计税项目：征收率 3%，且不得抵扣进项
        inputCredit: true            // 一般计税：应纳税额 = 销项税额 − 进项税额（凭票抵扣）
    },
    effectiveFrom: '2026-01-01',     // 增值税法施行日（原暂行条例同日废止）
    reducedUntil: '2027-12-31'       // 小规模减免优惠执行至（到期判定由注册表 statusOf 统一给出）
};

// 社保/公积金缴费基数最低标准 —— 全国口径兜底值，同时也是表单的初始默认基数。
//
// 阶段12 C1 契约（运行时热更新，勿破坏）：
//   这两个值是最终兜底，实际生效顺序为
//     tax-constants.js（本文件，全国兜底 7546）
//       → tax-rates-sync.js 覆盖为管理台「税率」Tab 维护的全国口径（最终生效值）
//   因此计算/校验层请始终「直接引用这两个全局变量」，不要缓存进局部常量。
//
// 设计取舍（2026-09 回退阶段14 C2 的「参保城市」分档）：
//   不按城市分档校验——统一按全国兜底口径提示「低于最低标准」，
//   城市改由留资/咨询时收集，由顾问核对当地口径后再给结论。
//   （城市参数库与 /api/config/city-social 仍在后台维护，端上暂不消费，
//     供后续「社保基数」SEO 落地页复用；需要恢复分档时按 git 历史回滚前端即可。）
//
// 取值与表单初始默认基数对齐：默认值即最低标准（默认 7546，输入低于 7546 才提示）
var MIN_SOCIAL_SECURITY_BASE = 7546;
var MIN_HOUSING_FUND_BASE = 7546;

// 对外聚合出口：供 engine.js / 后续税务参数配置化（C1）与单测使用
window.EuriskoTaxConstants = {
    version: TAX_CONSTANTS_VERSION,
    comprehensiveTaxRates: comprehensiveTaxRates,
    bonusMonthlyTaxRates: bonusMonthlyTaxRates,
    businessTaxRates: businessTaxRates,
    classificationTaxRates: classificationTaxRates,
    withholdingTaxRates: withholdingTaxRates,
    otherIncomeRules: otherIncomeRules,
    equityIncentiveRules: equityIncentiveRules,
    severanceRules: severanceRules,
    specialDeductionRules: specialDeductionRules,
    privatePensionRules: privatePensionRules,
    expatAllowanceRules: expatAllowanceRules,
    earlyRetirementRules: earlyRetirementRules,
    vatRules: vatRules,
    corporateIncomeTaxRules: corporateIncomeTaxRules,
    MIN_SOCIAL_SECURITY_BASE: MIN_SOCIAL_SECURITY_BASE,
    MIN_HOUSING_FUND_BASE: MIN_HOUSING_FUND_BASE
};
