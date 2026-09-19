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

    // 阶段17 17D-6（v1.57.0）：外籍津补贴免税的**八类项目代号**，与 expatAllowanceRules.items 一一对应。
    //
    // 为什么要这一份代号表：`expatAllowanceRules.items` 存的是「中文名 + 免税条件」，
    // 是给人看的；而 repeater 每一项要存一个**可持久化的值**。若直接把中文名当值，
    // 改一次措辞就把历史与草稿全废了。所以这里只存顺序 —— 名字仍然从常量里取，
    // 一条文案都没复制（见 expat-deep 的 options 构造）。
    //
    // 放在文件最前面而不是靠近用到的地方：下面的 DEEP_SPECS 数组在**求值那一刻**
    // 就要调 expatItemOptions()，那是 `var` 提升拯救不了的（提升只给 undefined）。
    var EXPAT_ITEM_CODES = ['housing', 'meal', 'relocation', 'laundry', 'travel', 'home', 'language', 'education'];

    function expatItemOptions() {
        var r = (typeof expatAllowanceRules !== 'undefined' && expatAllowanceRules.items) || [];
        return r.map(function (it, i) { return { value: EXPAT_ITEM_CODES[i], label: it.label }; })
            .concat([{ value: 'other', label: '其他（八类之外，一律不免）' }]);
    }

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

    // ====== 「社保基数 × 比例 → 月缴额」的通用联动（经营所得 / 反向倒算两个完整测算共用） ======
    // 这段逻辑原先只存在于页面的私有函数里：app.js 的 input 回调 + helper-functions.js 的
    // calculateXxxInsurance / validateSocialSecurityBase。删页面时跟着删了，是 v1.47.0 的教训 ——
    // 「便利输入」不在 spec 里就没人登记它，删完才发现算不了了。规矩抽在这里，两边共用一份；
    // **动作仍在渲染器**：deep-wizard-ui.js 的 applyDerived / bindDerivedSources / renderWarnings。
    var INSURANCE_DERIVE_FROM = ['socialBase', 'housingFundBase', 'pensionRate', 'medicalRate', 'unemploymentRate', 'housingFundRate'];

    function insuranceDerive(v) {
        // 清空 / 越界时回落的是**该险种自己的常用比例**，不是统一的 5%
        var FALLBACK = { pensionRate: 8, medicalRate: 2, unemploymentRate: 0.5, housingFundRate: 5 };
        function pct(key) {
            var raw = Number(v[key]);
            if (!isFinite(raw) || raw < 0 || raw > 100) return FALLBACK[key];
            return raw;
        }
        var r2 = function (x) { return Math.round(x * 100) / 100; };
        var base = Number(v.socialBase) || 0;
        var hBase = Number(v.housingFundBase) || 0;
        var out = {};
        // 比例归位是无条件做的：清空输入框后框里要显示回落值，而不是留个空框让用户以为按 0 算
        Object.keys(FALLBACK).forEach(function (k) { out[k] = pct(k); });
        // 金额只在填了基数时才有意义 —— 没填基数却把用户手填的月缴额冲成 0，是页面版都没犯的错
        if (base > 0) {
            out.pensionInsurance = r2(base * pct('pensionRate') / 100);
            out.medicalInsurance = r2(base * pct('medicalRate') / 100);
            out.unemploymentInsurance = r2(base * pct('unemploymentRate') / 100);
        }
        if (hBase > 0) out.housingFund = r2(hBase * pct('housingFundRate') / 100);
        return out;
    }

    // ====== 专项附加扣除的一批「定额 → 金额」联动（综合所得用） ======
    // 同一类教训的第二次出现：app.js 里 children-infant-count / elderly-type /
    // education-degree-checkbox 三个 addEventListener 才是它们的唯一实现，页面删了就没了。
    // 这些额度（2000 / 3000 / 1500 / 400 / 3600）是**政策定额**，写死在前端当然不妥，但至少
    // 别散落在各处的私有函数里 —— 它们每年都可能调，改的时候我只想改一处、且不靠搜索碰运气。
    var CHILD_MONTHLY_QUOTA = 2000;                       // 每个子女 / 婴幼儿每月
    var ELDERLY_MONTHLY_QUOTA = { none: 0, only: 3000, 'non-only': 1500 };
    var EDUCATION_DEGREE_MONTHLY = 400;                   // 学历继续教育：元/月
    var EDUCATION_PROFESSIONAL_ANNUAL = 3600;             // 职业资格继续教育：元/年，一次性扣除

    function forwardDerive(v) {
        var out = insuranceDerive(v) || {};
        var r2 = function (x) { return Math.round(x * 100) / 100; };
        // 分摊比例与社保比例同一个规矩：留空（空串）/ 越界都要落回 100 ——
        // 让用户对着一个空框看到按 0% 算出来的结果，是页面版都不会犯的错。
        var raw = v.childrenInfantDeductionRate;
        var rate = (raw === '' || raw === null || typeof raw === 'undefined') ? 100 : Number(raw);
        if (!isFinite(rate) || rate < 0 || rate > 100) rate = 100;
        out.childrenInfantDeductionRate = rate;
        out.childrenInfantDeduction = r2((Number(v.childrenInfantCount) || 0) * CHILD_MONTHLY_QUOTA * (rate / 100));

        // 赡养老人：独生子女定额 3000；非独生按分摊协议，上限 1500 —— 上限不是金额，写主体
        var elderly = ELDERLY_MONTHLY_QUOTA[v.elderlyType];
        if (elderly !== undefined) out.elderlyDeduction = elderly;

        // 继续教育 = 学历（按月随工作月数）+ 职业资格（一次性 3600）
        var months = Number(v.workMonths) || 12;
        out.educationDeduction = (v.educationDegreeCheckbox ? EDUCATION_DEGREE_MONTHLY * months : 0) +
            (v.educationProfessionalCheckbox ? EDUCATION_PROFESSIONAL_ANNUAL : 0);
        return out;
    }

    // 「向导值 → 计税入参」：forward 的 compute 与 toCalcInput 共用这一份。
    //
    // 为什么非抽出来不可（v1.51.0）：页面式时代这段映射长在 DOM 里 ——
    // `collectTaxInputData()` / `collectDeductionInput()` 两个适配器按 id 读那张表单。
    // 17B-3 删掉综合所得页面后，读的是**不存在的输入框**：前者在 `work-months` 那一行就抛
    // TypeError，而「方案对比」卡正是靠它取数，于是整张卡随着页面一起失去数据源。
    // 抽成一个函数后，取数只有这一处；谁要算综合所得都找它，不存在第二套口径。
    function forwardCalc(v) {
        if (typeof performTaxCalculation !== 'function' || typeof computeDeductions !== 'function') return null;

        var months = Number(v.workMonths) || 12;
        var special = v.specialDeductionCheckbox !== false;
        var additional = v.specialAdditionalDeductionCheckbox !== false;
        var other = !!v.otherDeductionCheckbox;
        var num = function (x) { return Number(x) || 0; };
        var pick = function (k, on) { return on ? num(v[k]) : 0; };

        // 三个总开关的语义在这里兑现：页上是「展开 / 收起」，这里是**显式置 0**
        // —— 否则用户取消勾选后扣除照样算进去，界面上一点都看不出来。
        var dedInput = {
            monthlyBasicDeduction: 5000,
            monthlyPensionInsurance: pick('pensionInsurance', special),
            monthlyMedicalInsurance: pick('medicalInsurance', special),
            monthlyUnemploymentInsurance: pick('unemploymentInsurance', special),
            monthlyHousingFund: pick('housingFund', special),
            monthlyElderlyDeduction: pick('elderlyDeduction', additional),
            monthlyChildrenInfantDeduction: pick('childrenInfantDeduction', additional),
            monthlyHousingDeduction: additional
                ? (v.housingType === 'rent' ? num(v.rentDeduction)
                    : (v.housingType === 'loan' ? num(v.housingLoanDeduction) : 0))
                : 0,
            annualEducationDeduction: pick('educationDeduction', additional),
            annualMedicalDeduction: pick('medicalDeduction', additional),
            annualProfessionalDeduction: (additional && v.educationProfessionalCheckbox) ? 3600 : 0,
            monthlyPensionDeduction: pick('pensionDeduction', other && v.pensionDeductionCheckbox),
            monthlyEnterpriseAnnuity: pick('enterpriseAnnuity', other && v.enterpriseAnnuityCheckbox),
            monthlyInsuranceOtherDeduction: pick('insuranceOtherDeduction', other && v.insuranceOtherDeductionCheckbox),
            monthlyTaxDeferredPension: pick('taxDeferredPension', other && v.taxDeferredPensionCheckbox),
            annualCharitableDonation: pick('charitableDonation', other && v.charitableDonationCheckbox)
        };

        var base = {
            workMonths: months,
            monthlySalaryIncome: num(v.monthlySalaryIncome),
            annualLaborIncome: num(v.annualLaborIncome),
            annualAuthorIncome: num(v.annualAuthorIncome),
            annualRoyaltyIncome: num(v.annualRoyaltyIncome),
            bonusIncome: num(v.bonusIncome),
            bonusInclude: !!v.bonusInclude,
            // 填了才算「手动指定」，0 / 留空走自动推演 —— 与页面版 collectTaxInputData 同口径
            userInputPrepaidTax: num(v.prepaidTax) > 0 ? num(v.prepaidTax) : undefined,
            deductions: computeDeductions(dedInput, months)
        };

        return { base: base, deductions: base.deductions, months: months, results: performTaxCalculation(base) };
    }

    function socialBaseWarnings(v) {
        // 低于最低标准的基数要在**填的时候**就说出来，别等到结果 Reconciliation。
        // 下限读 tax-constants.js 的全局变量（管理台可热改）—— 这里不复制第二份常量。
        var w = {};
        var minS = (typeof MIN_SOCIAL_SECURITY_BASE === 'number') ? MIN_SOCIAL_SECURITY_BASE : 0;
        var minH = (typeof MIN_HOUSING_FUND_BASE === 'number') ? MIN_HOUSING_FUND_BASE : 0;
        var b = Number(v.socialBase) || 0;
        var h = Number(v.housingFundBase) || 0;
        if (b > 0 && minS > 0 && b < minS) w.socialBase = '⚠️ 当前基数低于最低标准 ' + minS + ' 元/月';
        if (h > 0 && minH > 0 && h < minH) w.housingFundBase = '⚠️ 当前基数低于最低标准 ' + minH + ' 元/月';
        return w;
    }

    // ====== 原有 4 个深度流程（多步骤 / 可保存 / 可导出） ======
    var DEEP = [
        {
            // 阶段17 17B-3：最后一个「非 -deep」页面式流程（原先指向 index.html 里 967 行 + app.js
            // 的一批私有联动）。口径一字未改：compute 调 performTaxCalculation —— 它本来就是纯的
            // （扣除项支持注入），所以这次不用像 v1.46.0 那样先抽内核。
            //
            // 它比前面 6 个 spec 多两样东西，也都是**迁移不能顺手删掉**的那部分：
            //   ① 逐月预算表（extras.table）—— 综合所得是按月累计预扣的：同样的年收入，
            //      发放节奏不同，每月到手就不同。这张表是它比「月薪个税速算器」多出来的全部意义，
            //      为此先给向导加了 extras 能力（表 / 列表两类块，导出也跟着走）。
            //   ② 年终奖计税方式对比（compare）—— 并入 vs 单独计税差出一档税，是这类测算里
            //      最常被问的一句「哪种更划算」。答一个数不够，得把两套账摆在一起。
            id: 'forward', name: '综合所得', subtitle: '工资 / 劳务 / 稿酬，四步出年度个税预算表',
            icon: 'fa-calculator', status: 'deep',
            nextTools: ['salary-tax', 'annual-settlement', 'special-deduction'],
            fields: [
                { key: 'workMonths', step: 'param', label: '年工作总月数', type: 'select', default: 12,
                    options: [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map(function (m) { return { value: m, label: m + '个月' }; }) },
                { key: 'prepaidTax', step: 'param', label: '全年已预缴税额', type: 'money', default: 0,
                    hint: '填 0 或不填＝按累计预扣法自动推演工资部分的预缴 + 劳务 / 稿酬 / 特许权的预扣' },

                { key: 'monthlySalaryIncome', step: 'income', label: '月工资薪金收入', type: 'money', default: 30000 },
                { key: 'annualLaborIncome', step: 'income', label: '劳务报酬（元/年）', type: 'money', default: 0,
                    hint: '减除 20% 费用后计入收入额' },
                { key: 'annualAuthorIncome', step: 'income', label: '稿酬所得（元/年）', type: 'money', default: 0,
                    hint: '减除 20% 费用后**再减按 70%** 计入收入额' },
                { key: 'annualRoyaltyIncome', step: 'income', label: '特许权使用费（元/年）', type: 'money', default: 0,
                    hint: '减除 20% 费用后计入收入额' },
                { key: 'bonusIncome', step: 'income', label: '年终奖（元/年）', type: 'money', default: 0 },
                { key: 'bonusInclude', step: 'income', label: '年终奖并入综合所得计税', type: 'switch', default: true,
                    hint: '取消勾选＝按全年一次性奖金单独计税；填了年终奖时结果区会给两种口径的对比' },

                { key: 'specialDeductionCheckbox', step: 'deduction', label: '享受专项扣除（社保 / 公积金）', type: 'switch', default: true },
                // v1.47.0 删经营所得页面时丢过一次同样的东西（只在 app.js + helper-functions.js 的私有函数里，
                // 页面一删就跟着没了），最后是 verify:local 变红才暴露 —— 这次先补再删。
                { key: 'socialBase', step: 'deduction', label: '社保缴费基数（元/月）', type: 'money', default: 7546,
                    when: { key: 'specialDeductionCheckbox', in: [true] },
                    hint: '填了就由它和下面三项比例算月缴额（月缴额以基数为准）；不填则自己填月缴额' },
                { key: 'pensionRate', step: 'deduction', label: '养老缴费比例', type: 'percent', default: 8,
                    when: { key: 'specialDeductionCheckbox', in: [true] } },
                { key: 'medicalRate', step: 'deduction', label: '医疗缴费比例', type: 'percent', default: 2,
                    when: { key: 'specialDeductionCheckbox', in: [true] } },
                { key: 'unemploymentRate', step: 'deduction', label: '失业缴费比例', type: 'percent', default: 0.5,
                    when: { key: 'specialDeductionCheckbox', in: [true] } },
                { key: 'housingFundBase', step: 'deduction', label: '公积金缴费基数（元/月）', type: 'money', default: 7546,
                    when: { key: 'specialDeductionCheckbox', in: [true] } },
                { key: 'housingFundRate', step: 'deduction', label: '公积金缴费比例', type: 'percent', default: 5,
                    when: { key: 'specialDeductionCheckbox', in: [true] }, hint: '各地 5%~12% 不同，按参保地口径填' },
                { key: 'pensionInsurance', step: 'deduction', label: '养老保险金（元/月）', type: 'money', default: 603.68,
                    when: { key: 'specialDeductionCheckbox', in: [true] }, hint: '＝ 社保缴费基数 × 养老比例' },
                { key: 'medicalInsurance', step: 'deduction', label: '医疗保险金（元/月）', type: 'money', default: 150.92,
                    when: { key: 'specialDeductionCheckbox', in: [true] }, hint: '＝ 社保缴费基数 × 医疗比例' },
                { key: 'unemploymentInsurance', step: 'deduction', label: '失业保险金（元/月）', type: 'money', default: 37.73,
                    when: { key: 'specialDeductionCheckbox', in: [true] }, hint: '＝ 社保缴费基数 × 失业比例' },
                { key: 'housingFund', step: 'deduction', label: '住房公积金（元/月）', type: 'money', default: 377.3,
                    when: { key: 'specialDeductionCheckbox', in: [true] }, hint: '＝ 公积金缴费基数 × 公积金比例' },

                { key: 'specialAdditionalDeductionCheckbox', step: 'deduction', label: '享受专项附加扣除', type: 'switch', default: true },
                { key: 'childrenInfantCount', step: 'deduction', label: '子女教育 / 3 岁以下婴幼儿照护（人数）', type: 'number', default: 0, min: 0,
                    when: { key: 'specialAdditionalDeductionCheckbox', in: [true] } },
                { key: 'childrenInfantDeductionRate', step: 'deduction', label: '扣除分摊比例', type: 'percent', default: 100,
                    when: { key: 'specialAdditionalDeductionCheckbox', in: [true] },
                    hint: '父母双方各扣 50% 时填 50；全额扣除填 100' },
                { key: 'childrenInfantDeduction', step: 'deduction', label: '子女教育 / 婴幼儿照护（元/月）', type: 'money', default: 0,
                    when: { key: 'specialAdditionalDeductionCheckbox', in: [true] }, hint: '＝ 人数 × 2000 元/月 × 分摊比例' },
                { key: 'elderlyType', step: 'deduction', label: '赡养老人', type: 'select', default: 'none', options: [
                    { value: 'none', label: '不适用' },
                    { value: 'only', label: '独生子女（3000 元/月）' },
                    { value: 'non-only', label: '非独生子女（分摊，上限 1500 元/月）' }
                ], when: { key: 'specialAdditionalDeductionCheckbox', in: [true] } },
                { key: 'elderlyDeduction', step: 'deduction', label: '赡养老人扣除额（元/月）', type: 'money', default: 0,
                    when: { key: 'specialAdditionalDeductionCheckbox', in: [true] }, hint: '由上面的身份自动生成；非独生子女按实际分摊额改' },
                { key: 'housingType', step: 'deduction', label: '住房扣除方式', type: 'select', default: 'rent', options: [
                    { value: 'rent', label: '住房租金' },
                    { value: 'loan', label: '住房贷款利息' }
                ], when: { key: 'specialAdditionalDeductionCheckbox', in: [true] }, hint: '租金与房贷利息**只能二选一**' },
                { key: 'rentDeduction', step: 'deduction', label: '住房租金（元/月）', type: 'money', default: 1500,
                    when: { key: 'housingType', in: ['rent'] } },
                { key: 'housingLoanDeduction', step: 'deduction', label: '住房贷款利息（元/月）', type: 'money', default: 1000,
                    when: { key: 'housingType', in: ['loan'] } },
                { key: 'educationDegreeCheckbox', step: 'deduction', label: '学历继续教育（400 元/月）', type: 'switch', default: false,
                    when: { key: 'specialAdditionalDeductionCheckbox', in: [true] } },
                { key: 'educationProfessionalCheckbox', step: 'deduction', label: '职业资格继续教育（3600 元/年，一次性扣）', type: 'switch', default: false,
                    when: { key: 'specialAdditionalDeductionCheckbox', in: [true] } },
                { key: 'educationDeduction', step: 'deduction', label: '继续教育（元/年）', type: 'money', default: 0,
                    when: { key: 'specialAdditionalDeductionCheckbox', in: [true] },
                    hint: '＝ 学历 400 元/月 × 工作月数 ＋ 职业资格 3600 元/年（勾选时）' },
                { key: 'medicalDeduction', step: 'deduction', label: '大病医疗自付部分（元/年）', type: 'money', default: 0,
                    when: { key: 'specialAdditionalDeductionCheckbox', in: [true] },
                    hint: '只扣超过 1.5 万的部分、限额 8 万；且只在年度汇算扣，不进月度' },

                { key: 'otherDeductionCheckbox', step: 'deduction', label: '有其他扣除（年金 / 商业健康险等）', type: 'switch', default: false },
                { key: 'pensionDeductionCheckbox', step: 'deduction', label: '商业健康险', type: 'switch', default: false,
                    when: { key: 'otherDeductionCheckbox', in: [true] } },
                { key: 'pensionDeduction', step: 'deduction', label: '商业健康险（元/月）', type: 'money', default: 0,
                    when: { key: 'pensionDeductionCheckbox', in: [true] } },
                { key: 'enterpriseAnnuityCheckbox', step: 'deduction', label: '企业年金', type: 'switch', default: false,
                    when: { key: 'otherDeductionCheckbox', in: [true] } },
                { key: 'enterpriseAnnuity', step: 'deduction', label: '企业年金（元/月）', type: 'money', default: 0,
                    when: { key: 'enterpriseAnnuityCheckbox', in: [true] } },
                { key: 'insuranceOtherDeductionCheckbox', step: 'deduction', label: '其他商业保险', type: 'switch', default: false,
                    when: { key: 'otherDeductionCheckbox', in: [true] } },
                { key: 'insuranceOtherDeduction', step: 'deduction', label: '其他商业保险（元/月）', type: 'money', default: 0,
                    when: { key: 'insuranceOtherDeductionCheckbox', in: [true] } },
                { key: 'taxDeferredPensionCheckbox', step: 'deduction', label: '税延养老保险', type: 'switch', default: false,
                    when: { key: 'otherDeductionCheckbox', in: [true] } },
                { key: 'taxDeferredPension', step: 'deduction', label: '税延养老保险（元/月）', type: 'money', default: 0,
                    when: { key: 'taxDeferredPensionCheckbox', in: [true] } },
                { key: 'charitableDonationCheckbox', step: 'deduction', label: '公益性捐赠', type: 'switch', default: false,
                    when: { key: 'otherDeductionCheckbox', in: [true] } },
                { key: 'charitableDonation', step: 'deduction', label: '公益性捐赠（元/年）', type: 'money', default: 0,
                    when: { key: 'charitableDonationCheckbox', in: [true] }, hint: '扣除限额为应纳税所得额的 30%' }
            ],
            // 上面的 fields 与 reverse 逐项对齐（同一套 key、同一套 when）：两份 spec 共用下面这一对
            // 与 reverse 逐项对齐（同一套键、同一套 when）：两份 spec 共用下面这一对钩子才不会各自漂移。
            // derive 里装了两批联动 —— 社保那份（基数 × 比例，见 INSURANCE_DERIVE_FROM）
            // 与专项附加这份（人数 × 2000 × 比例 / 赡养老人身份 / 继续教育勾选，见 forwardDerive）。
            deriveFrom: INSURANCE_DERIVE_FROM,
            derive: forwardDerive,
            warnings: socialBaseWarnings,
            steps: [
                { key: 'param', title: '计算参数', why: '工作月数决定全年减除与累计预扣的基数；留空预缴额＝按累计预扣法自动推演' },
                { key: 'income', title: '各项所得录入', why: '四类所得计入综合所得的口径不同（劳务打八折、稿酬再减按七成），先录准' },
                { key: 'deduction', title: '扣除项明细', why: '扣除项直接决定应纳税所得额 —— 少填一项，等于自认为要多缴一份税' }
            ],
            pitfalls: [
                '住房租金与住房贷款利息**只能二选一**，同时享受会被税务机关驳回',
                '大病医疗只扣**超过 1.5 万**的部分、限额 8 万，且只在年度汇算扣 —— 月度预算表里看不到它',
                '公益性捐赠扣除限额为应纳税所得额的 30%，超出部分当年不能扣（可结转三年）',
                '劳务 / 稿酬 / 特许权使用费是**按次预扣**（20%~40%），年度汇算才并入综合所得按超额累进重算',
                '月度预算表按累计预扣法算：同样的年收入，一次性发放与逐月发放，每月到手并不一样'
            ],
            // 方案对比的取数钩子（v1.51.0）：与 compute **同一个** forwardCalc，不是第二份映射。
            // 渲染器见到它才在结果区挂「方案对比」卡 —— 没声明的工具就没有这张卡。
            toCalcInput: function (v) {
                var c = forwardCalc(v);
                return c ? { base: c.base, deductions: c.deductions, results: c.results, months: c.months } : null;
            },
            compute: function (v) {
                var c = forwardCalc(v);
                if (!c || !c.results || !c.results.taxDetails) return null;

                var baseInput = c.base;
                var core = c.results;

                var inc = core.incomeDetails;
                var ded = core.deductionDetails;
                var tax = core.taxDetails;

                function scenario(include) {
                    var r = performTaxCalculation(Object.assign({}, baseInput, { bonusInclude: include }));
                    return {
                        key: include ? 'include' : 'separate',
                        label: include ? '并入综合所得' : '年终奖单独计税',
                        why: include ? '年终奖并入综合所得，与工资一起适用年度超额累进税率'
                            : '年终奖单独按「奖金 ÷ 12」定税率，不并入当年的综合所得档次',
                        primary: { label: '税后年收入', value: r.taxDetails.netIncome, kind: 'money' },
                        rows: [
                            { label: '综合所得应纳税额', value: r.taxDetails.totalTax, kind: 'money' },
                            { label: '年终奖税额', value: r.incomeDetails.bonusTax, kind: 'money' },
                            { label: '全年税负合计', value: r.taxDetails.totalTax + r.incomeDetails.bonusTax, kind: 'money' },
                            { label: '应纳税所得额', value: r.taxDetails.taxableIncome, kind: 'money' },
                            { label: '适用税率', value: r.taxDetails.applicableRate, kind: 'percent' }
                        ]
                    };
                }
                // 只在真的有年终奖时给对比 —— 没有年终奖却摆两张一样的方案表，是拿「看起来很专业」骗人
                var compare = null;
                if (inc.bonus > 0) {
                    compare = {
                        label: '年终奖计税方式对比',
                        active: baseInput.bonusInclude ? 'include' : 'separate',
                        scenarios: [scenario(true), scenario(false)]
                    };
                }

                // 逐月预算表：这份数据与页面上的 #budget-table-body 同源（utils.js 的 buildForwardBudgetTable），
                // 删页面前后每一行都应该一模一样 —— 这也是它必须赶在删页之前抽出来的原因。
                var extras = [];
                if (typeof buildForwardBudgetTable === 'function') {
                    var budget = buildForwardBudgetTable(core);
                    if (budget) {
                        extras.push({
                            title: '个人年度个税预算表',
                            table: { head: budget.head, rows: budget.rows },
                            note: '逐月按累计预扣法：每月用累计应纳税所得额定档，减去已预缴部分即当月应扣'
                        });
                    }
                }

                return {
                    primary: { label: '税后年收入', value: tax.netIncome, kind: 'money' },
                    rows: [
                        { label: '税前年收入', value: inc.preTaxTotal, kind: 'money' },
                        { label: '扣除合计', value: ded.total, kind: 'money' },
                        { label: '应纳税所得额', value: tax.taxableIncome, kind: 'money' },
                        { label: '适用税率', value: tax.applicableRate, kind: 'percent' },
                        { label: '速算扣除数', value: tax.applicableDeduction, kind: 'money' },
                        { label: '综合所得应纳税额', value: tax.totalTax, kind: 'money' },
                        { label: '全年已预缴税额', value: tax.prepaidTax, kind: 'money' },
                        { label: tax.refundTax >= 0 ? '应补税额' : '应退税额', value: Math.abs(tax.refundTax), kind: 'money' },
                        { label: '年终奖税额', value: inc.bonusTax, kind: 'money',
                            hint: baseInput.bonusInclude ? '已并入综合所得' : '按全年一次性奖金单独计税' },
                        { label: '实际税负率', value: inc.preTaxTotal > 0 ? tax.totalTax / inc.preTaxTotal : 0, kind: 'percent' }
                    ],
                    note: '年终奖单独计税与并入综合所得是两条不同的路径，结果区已把两套账摆在一起：并入按年度累进税率，单独按「奖金 ÷ 12」定档。',
                    steps: (typeof buildFormulaSteps === 'function') ? buildFormulaSteps(core) : [],
                    extras: extras,
                    compare: compare
                };
            }
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
                // 下面 6 项是**便利输入**：用户手里有的是社保缴费基数，不是「每月扣了多少养老金」。
                // 页面版由 index.html 的输入框 + app.js/helper-functions.js 的私有联动提供，
                // 迁移到 spec 后改由向导的 derive / warnings 两个通用钩子承担（见文件内 derive 注释）。
                { key: 'socialBase', step: 'deduction', label: '社保缴费基数（元/月）', type: 'money', default: 0, hint: '填了就由它和下面三项比例算月缴额（月缴额以基数为准）；不填则自己填月缴额' },
                { key: 'housingFundBase', step: 'deduction', label: '公积金缴费基数（元/月）', type: 'money', default: 0 },
                { key: 'pensionRate', step: 'deduction', label: '养老缴费比例', type: 'percent', default: 8 },
                { key: 'medicalRate', step: 'deduction', label: '医疗缴费比例', type: 'percent', default: 2 },
                { key: 'unemploymentRate', step: 'deduction', label: '失业缴费比例', type: 'percent', default: 0.5 },
                { key: 'housingFundRate', step: 'deduction', label: '公积金缴费比例', type: 'percent', default: 5, hint: '各地 5%~12% 不同，按参保地口径填' },
                { key: 'pensionInsurance', step: 'deduction', label: '养老保险金（元/月）', type: 'money', default: 0, hint: '＝ 社保缴费基数 × 养老比例，按年工作月数折算为年度' },
                { key: 'medicalInsurance', step: 'deduction', label: '医疗保险金（元/月）', type: 'money', default: 0, hint: '＝ 社保缴费基数 × 医疗比例' },
                { key: 'unemploymentInsurance', step: 'deduction', label: '失业保险金（元/月）', type: 'money', default: 0, hint: '＝ 社保缴费基数 × 失业比例' },
                { key: 'housingFund', step: 'deduction', label: '住房公积金（元/月）', type: 'money', default: 0, hint: '＝ 公积金缴费基数 × 公积金比例' },
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
            // 「基数 × 比例 → 月缴额」：三个钩子抽到文件顶部（INSURANCE_DERIVE_FROM / insuranceDerive /
            // socialBaseWarnings）供 business 与 reverse 共用 —— 17B-2 才发现两边逻辑本来就是同一份，
            // 抄两遍迟早只改其中一遍。
            deriveFrom: INSURANCE_DERIVE_FROM,
            derive: insuranceDerive,
            warnings: socialBaseWarnings,
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
            // 阶段17 17B-4（v1.50.0）：**最后一个页面式 deep** 也迁到 spec 上了 —— 页面式自此归零。
            //
            // 它之所以排在四趟迁移的最后，是因为它是唯一含「动态增删所得条目」的测算：
            // 一笔利息、一笔房租、一笔股权转让，各有各的扣除口径，**条数不定、每条的字段还不一样**。
            // 前三次迁移过的 practicalспособность（steps / when / compare / extras / derive）都表达不了这个，
            // 所以这次先给渲染器补 repeater（type:'repeater' + itemFields，见 deep-wizard-ui.js），
            // 再写这份 spec，最后才删页面 —— 与前面三次同一个顺序：**先有能力，再迁，最后删**。
            //
            // 口径一字未改：compute 调 tax-calculator 里早就存在的 calculateSingleClassificationTax /
            // calculateClassificationTaxTotal。这两个函数此前被页面冷落在一边 —— 页面版的
            // addClassificationItem 自己内联了一份同样的公式（"多一份同形实现" 的第 N 次出现），
            // 迁移后两份终于是同一份。
            //
            // 顺手补上的一件事：修缮费超过 800 元那部分**不是免税，是结转以后月份**，页面直接按 800
            // 截断却一句话没说 —— 用户填 1500 看到的是 800，会以为系统算错了。这次改到 hint / pitfalls 里讲清楚。
            id: 'classification', name: '分类所得', subtitle: '利息 / 租赁 / 转让 / 偶然所得，按次单独计税',
            icon: 'fa-list-alt', status: 'deep',
            nextTools: ['withholding', 'annual-settlement'],
            fields: [
                // repeater：值是一条数组 [ { type, income, …条件字段} ]
                { key: 'items', step: 'income', label: '所得条目', type: 'repeater',
                    addLabel: '添加一条所得',
                    hint: '每一笔分类所得单独计税 —— 类型不同，扣除口径也不同（租赁扣费用与修缮费、转让扣原值与合理费用）',
                    default: [{ type: 'interest', income: 10000 }],
                    itemFields: [
                        { key: 'type', label: '所得类型', type: 'select', default: 'interest', options: [
                            { value: 'interest', label: '利息、股息、红利所得' },
                            { value: 'rent', label: '财产租赁所得' },
                            { value: 'transfer', label: '财产转让所得' },
                            { value: 'accidental', label: '偶然所得' }
                        ] },
                        { key: 'income', label: '收入金额', type: 'money', default: 0, min: 0 },
                        { key: 'rentDeductions', label: '准予扣除的税费（元）', type: 'money', default: 0, min: 0,
                            when: { key: 'type', in: ['rent'] },
                            hint: '租赁过程中缴纳的税金、教育费附加等；不计修缮费' },
                        { key: 'rentRepair', label: '修缮费用（元）', type: 'money', default: 0, min: 0,
                            when: { key: 'type', in: ['rent'] },
                            hint: '每月最多扣 800 元，当月扣不完的**结转以后月份**，不是作废' },
                        { key: 'transferOriginal', label: '财产原值（元）', type: 'money', default: 0, min: 0,
                            when: { key: 'type', in: ['transfer'] },
                            hint: '取得该项财产时实际支付的成交价及相关税费' },
                        { key: 'transferExpenses', label: '合理费用（元）', type: 'money', default: 0, min: 0,
                            when: { key: 'type', in: ['transfer'] },
                            hint: '转让过程中缴纳的税金及有关费用' }
                    ] }
            ],
            steps: [
                { key: 'income', title: '所得条目', why: '分类所得**按次（或按项）单独计税**：同一种类型的每一笔要分开录，各自扣除、各自适用税率' }
            ],
            pitfalls: [
                '利息、股息、红利所得与偶然所得**不减除任何费用**，全额按 20% 计税',
                '财产租赁所得：月收入 ≤ 4000 元减除费用 800 元，> 4000 元减除 20%；修缮费每月最多扣 800 元，超出的部分**结转以后月份**',
                '财产转让所得＝转让收入 − 财产原值 − 合理费用，**原值与费用要留好凭证**，没有凭证就等于全额计税',
                '偶然所得中的福利彩票单笔 1 万元以下免税、有奖发票单张 800 元以下免税 —— 本表按全额计税，符合条件时需自行扣除',
                '分类所得**不并入综合所得、也不做年度汇算**，在这里缴完就是终局，多缴不退'
            ],
            compute: function (v) {
                if (typeof calculateSingleClassificationTax !== 'function') return null;

                var list = Array.isArray(v.items) ? v.items : [];
                var items = [];
                list.forEach(function (it) {
                    var type = it.type || 'interest';
                    var income = Number(it.income) || 0;
                    // 收入为 0 的空条目不参与计税：页面上「添加条目」就卡着 income > 0，
                    // 向导里允许存在空条目（用户正在填），但别让它变成一行 0.00 混进计税表
                    if (income <= 0) return;

                    // 两条口径与页面版逐字对齐：租赁是「准予扣除项目 ＋ 修缮费（封顶 800）」，
                    // 转让是「财产原值 ＋ 合理费用」；利息 / 偶然所得本来就没有扣除
                    var deduction = 0;
                    if (type === 'rent') {
                        deduction = (Number(it.rentDeductions) || 0) + Math.min(Number(it.rentRepair) || 0, 800);
                    } else if (type === 'transfer') {
                        deduction = (Number(it.transferOriginal) || 0) + (Number(it.transferExpenses) || 0);
                    }
                    items.push(calculateSingleClassificationTax(type, income, deduction));
                });

                if (!items.length) {
                    return {
                        primary: { label: '应纳税额合计', value: 0, kind: 'money' },
                        rows: [],
                        note: '还没有有效条目：给每一条所得填上大于 0 的收入金额，它才会进计税表。',
                        steps: []
                    };
                }

                var results = (typeof calculateClassificationTaxTotal === 'function')
                    ? calculateClassificationTaxTotal(items)
                    : (function () {
                        var t = { income: 0, taxable: 0, tax: 0 };
                        items.forEach(function (i) { t.income += i.income; t.taxable += i.taxableIncome; t.tax += i.totalTax; });
                        return { items: items, totalIncome: t.income, totalTaxableIncome: t.taxable, totalTax: t.tax };
                    })();

                var deductionTotal = 0;
                items.forEach(function (i) { deductionTotal += i.deduction; });

                var extras = [];
                if (typeof buildClassificationTable === 'function') {
                    var tbl = buildClassificationTable(results);
                    if (tbl) {
                        extras.push({
                            title: '分类所得计税表',
                            table: tbl,
                            note: '每一条所得各自扣除、各自按 20% 计税，税额直接相加 —— 不与工资薪金合并，也不做年度汇算'
                        });
                    }
                }

                return {
                    primary: { label: '税后收入', value: results.totalIncome - results.totalTax, kind: 'money' },
                    rows: [
                        { label: '所得类型', value: items.length > 1 ? '多项分类所得（' + items.length + ' 项）' : items[0].typeName, kind: 'text' },
                        { label: '收入合计', value: results.totalIncome, kind: 'money' },
                        { label: '扣除合计', value: deductionTotal, kind: 'money',
                            hint: '租赁的费用减除与修缮费、转让的财产原值与合理费用' },
                        { label: '应纳税所得额', value: results.totalTaxableIncome, kind: 'money' },
                        { label: '应纳税额合计', value: results.totalTax, kind: 'money' },
                        { label: '实际税负率', value: results.totalIncome > 0 ? results.totalTax / results.totalIncome : 0, kind: 'percent' }
                    ],
                    note: '同一类型的所得**每一笔单独计税**：比如两套房子的租金要按两套出租房产分别算收入与费用减除，不能合起来享受一次 800 元。',
                    steps: (typeof buildClassificationFormulaSteps === 'function') ? buildClassificationFormulaSteps(results) : [],
                    extras: extras
                };
            }
        },
        {
            // 阶段17 17D-1（v1.52.0）：个税纵深补齐的第一个场景 ——
            // 劳务报酬 / 稿酬 / 特许权使用费的「完整测算」。
            //
            // 它是第一个**自带 spec** 的 `-deep`：速算器只认一笔收入（填一个数出五个数），
            // 而真实情况是按次、按月、跨月好几笔进来 —— 费用扣除与预扣率都是**按次**算的，
            // 分着算能多扣一次 800 元、多用一次低档税率，合起来才是法定口径。这一层差异
            // 就是完整测算比速算器多出来的全部意义，没法靠共享同一份 fields 得到。
            //
            // 口径仍然同源：每一笔的扣除、预扣率、收入额一律调 withholding-quick.js 的
            // taxableOf / bracketOf / taxOf / incomeOf，一个税率、一条公式都没复制
            // （单笔输入与速算器逐点相等，由 tests/withholding-deep.test.js 钉住）。
            // 汇算那一层用内核 calculateTaxByTaxableIncome 算**增量**，不是速算器那种
            // 「收入额 × 边际税率」的线性估算 —— 预扣 20%~40%、汇算常落在 3%/10%，
            // 「次年能不能退一笔」全靠这个差，估算精度不够就会误导。
            id: 'withholding-deep', name: '劳务报酬预扣预缴', subtitle: '多笔按次预扣 → 并入综合所得看补退税',
            icon: 'fa-file-text-o', status: 'deep',
            nextTools: ['withholding', 'annual-settlement', 'business-income'],
            policyKey: 'withholding',
            fields: [
                { key: 'type', step: 'type', label: '所得类型', type: 'select', default: 'labor',
                    options: [{ value: 'labor', label: '劳务报酬所得' }, { value: 'author', label: '稿酬所得' }, { value: 'royalty', label: '特许权使用费所得' }],
                    hint: '三类所得的预扣率表不同：劳务报酬是 20%/30%/40% 三级超额累进，稿酬与特许权一律 20%' },

                { key: 'mergeByMonth', step: 'payout', label: '同一个月内的多笔合并为「一次」', type: 'switch', default: true,
                    hint: '法定口径：属于同一项目连续性收入的，以**一个月内**取得的收入为一次。关掉则逐笔单独预扣（不同支付方各自预扣的情形）' },
                { key: 'payments', step: 'payout', label: '发放明细', type: 'repeater',
                    addLabel: '添加一笔收入',
                    hint: '每一笔填取得的月份与金额；金额 ≤ 0 的条目不参与预扣',
                    default: [{ month: 1, amount: 30000 }],
                    itemFields: [
                        { key: 'month', label: '取得月份', type: 'select', default: 1,
                            options: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(function (m) { return { value: m, label: m + ' 月' }; }) },
                        { key: 'amount', label: '收入金额（元）', type: 'money', default: 0, min: 0 }
                    ] },

                { key: 'otherTaxable', step: 'settle', label: '全年其他综合所得的应纳税所得额（元）', type: 'money', default: 0,
                    hint: '工资薪金等已减 6 万基本减除、五险一金与专项附加扣除后的余额；填 0 表示全年只有这里填的这笔收入' }
            ],
            steps: [
                { key: 'type', title: '所得类型', why: '三类所得的预扣率表与收入额折算比例都不同 —— 先定类型，后面的每一步才有对应的口径' },
                { key: 'payout', title: '发放明细', why: '预扣是**按次**的：一次收入扣一次费用、用一次预扣率表。同一笔钱分几次发，扣出来的税并不一样' },
                { key: 'settle', title: '汇算口径', why: '预扣不是终局 —— 次年并入综合所得按七级年度税率重算，多退少补。要算补退多少，得知道你其余的综合所得落在哪一档' }
            ],
            pitfalls: [
                '「一次」不是按笔算的：同一项目连续性收入以**一个月内**取得的收入为一次 —— 分着算能多扣一次 800 元、多用一次低档税率，合起来才是法定口径',
                '费用扣除是**分档**的：≤4000 元减 800，>4000 元减 20%；稿酬在扣除后**再减按 70%**（实际按收入的 56% 并入）',
                '预扣率最高 40% 只是**预扣**：次年并入综合所得按七级年度税率重算，全年只有这笔收入的人通常能退一笔',
                '不同支付方各自预扣，**同一个月也不要合并** —— 关掉上面的合并开关，或分开测算两次',
                '汇算差额按「其他综合所得应纳税所得额」算增量：那一栏填 0 就表示全年只有这笔收入，实际有工资一定要填，否则会低估税负'
            ],
            compute: function (v) {
                var Q = window.EuriskoWithholdingQuick;
                if (!Q) return null;

                var type = v.type || 'labor';
                var rule = Q.ruleOf(type);

                var list = Array.isArray(v.payments) ? v.payments : [];
                var paid = [];
                list.forEach(function (p) {
                    var amt = Number(p && p.amount) || 0;
                    // 金额为空 / 0 的条目不进预扣表：向导允许存在正在填的空条目，
                    // 但别让它变成一行 0.00 混进明细（与分类所得迁移时同一条处理）
                    if (amt > 0) paid.push({ month: Number(p.month) || 1, amount: amt });
                });

                if (!paid.length) {
                    return {
                        primary: { label: '全年预扣预缴个税合计', value: 0, kind: 'money' },
                        rows: [],
                        note: '还没有有效条目：给每一笔收入填上大于 0 的金额，它才会进预扣表。'
                    };
                }

                // 合并成「次」：同月相加（法定口径）还是逐笔单独 —— 这是本工具与速算器唯一的口径差，
                // 也是它存在的理由。两种走法的金额合计相同，扣完费用后的税并不相同。
                var times = [];
                if (v.mergeByMonth !== false) {
                    var byMonth = {};
                    paid.forEach(function (p) { byMonth[p.month] = (byMonth[p.month] || 0) + p.amount; });
                    Object.keys(byMonth).sort(function (a, b) { return Number(a) - Number(b); }).forEach(function (m) {
                        times.push({ label: '第 ' + m + ' 月', amount: byMonth[m] });
                    });
                } else {
                    paid.forEach(function (p, i) { times.push({ label: '第 ' + (i + 1) + ' 笔', amount: p.amount }); });
                }

                var amountTotal = 0, taxableTotal = 0, incomeTotal = 0, prepaidTotal = 0;
                var tableRows = [];
                times.forEach(function (t) {
                    var taxable = Q.taxableOf(type, t.amount);
                    var bracket = Q.bracketOf(type, t.amount) || { rate: 0, deduction: 0 };
                    var tax = Q.taxOf(type, t.amount);

                    amountTotal += t.amount;
                    taxableTotal += taxable;
                    incomeTotal += Q.incomeOf(type, t.amount);
                    prepaidTotal += tax;

                    tableRows.push([
                        t.label,
                        { value: t.amount, kind: 'money' },
                        { value: taxable, kind: 'money' },
                        { value: bracket.rate, kind: 'percent' },
                        { value: bracket.deduction, kind: 'money' },
                        { value: tax, kind: 'money' }
                    ]);
                });

                // 汇算：收入额并入综合所得后按年度税率表重算，与其余综合所得**合并找档**，
                // 所以这里算的是「增量」而不是「收入额 × 边际税率」—— 后者在跨档时会整段算错。
                var other = Math.max(0, Number(v.otherTaxable) || 0);
                var settled = 0;
                if (typeof calculateTaxByTaxableIncome === 'function') {
                    settled = Math.max(0,
                        calculateTaxByTaxableIncome(other + incomeTotal).tax - calculateTaxByTaxableIncome(other).tax);
                }
                var gap = settled - prepaidTotal;
                var direction = gap > 0.005 ? '汇算需补税' : (gap < -0.005 ? '汇算可退税' : '基本持平');

                return {
                    primary: { label: '全年预扣预缴个税合计', value: prepaidTotal, kind: 'money' },
                    rows: [
                        { label: '所得类型', value: rule ? rule.name : type, kind: 'text' },
                        { label: '收入合计', value: amountTotal, kind: 'money' },
                        { label: '计税次数', value: times.length + ' 次', kind: 'text',
                            hint: v.mergeByMonth !== false ? '同一个月内的多笔已合并为一次' : '逐笔单独预扣' },
                        { label: '费用扣除合计', value: amountTotal - taxableTotal, kind: 'money',
                            hint: '≤4000 元减 800、>4000 元减 20%；稿酬再减按 30%' },
                        { label: '预扣应纳税所得额合计', value: taxableTotal, kind: 'money' },
                        { label: '全年预扣预缴个税合计', value: prepaidTotal, kind: 'money' },
                        { label: '并入综合所得的收入额', value: incomeTotal, kind: 'money',
                            hint: '劳务报酬 / 特许权按收入的 80%，稿酬按 56%' },
                        { label: '汇算后的增量税负', value: settled, kind: 'money',
                            hint: '（其他综合所得 + 收入额）的年度税额 − 其他综合所得的年度税额' },
                        { label: '汇算差额', value: gap, kind: 'money', hint: '正数 = 预扣少于汇算应付' },
                        { label: '汇算方向', value: direction, kind: 'text' }
                    ],
                    note: '预扣是**按次**的（每次扣一次费用、用一次预扣率），汇算是**按年**的（收入额并入综合所得适用七级年度税率）。两者之差就是次年补税或退税的来源。',
                    extras: [{
                        title: '逐次预扣预缴明细',
                        note: '每一次各自减除费用、各自查预扣率表 —— 同一笔钱分几次发，扣出来的税不一样',
                        table: {
                            head: ['计税「次」', '收入', '减除费用后', '预扣率', '速算扣除', '预扣税额'],
                            rows: tableRows
                        }
                    }]
                };
            }
        },
        {
            // 阶段17 17D-2（v1.53.0）：个税纵深补齐的第二个场景 —— 年终奖择优。
            //
            // 速算器 `bonus-tax` 只能算**单独计税**那一半：它收了「全年其他应纳税所得额」
            // 却在 compute 里一行都没用到，subtitle 写着「单独计税还是并入综合所得更省」，
            // 实际没比过。这里补的是它缺的三层：
            //   ① **两套口径真比一次**（并入 vs 单独），并给出择优结论与差额 —— 而不是只报一个数；
            //   ② **最优分配点**：当这笔钱本就可以在「工资」与「年终奖」之间切分时，
            //      最省的那个点常常既不是全并入也不是全单独，而是某一档的上沿 ——
            //      f(x) = T(总额 − x) + 奖金税(x) 是分段线性且在每个阈值处向上跳，
            //      最小值只可能落在段的两个端点，所以只需枚举「各档上沿」与「上沿 − 1 分」；
            //   ③ **临界区（雷区）表**：6 个跳档点各自算出「多发 1 元增多少税」与
            //      「到手回到原来水平的出口金额」—— 速算器只报一个「跳档多交」，
            //      不给「该定在多少」，而用户真正需要的正是后者。
            // 口径仍然同源：奖金税一律走 withholding 那样的 quick 模块 `EuriskoBonusQuick`，
            // 综合所得部分走内核 `calculateTaxByTaxableIncome`，一个税率、一条公式都没复制。
            id: 'bonus-tax-deep', name: '年终奖择优', subtitle: '并入还是单独计税，并给出最优分配点',
            icon: 'fa-star', status: 'deep',
            nextTools: ['bonus-tax', 'annual-settlement', 'salary-tax'],
            policyKey: 'bonus',
            fields: [
                { key: 'otherTaxable', step: 'base', label: '全年其他综合所得的应纳税所得额（元）', type: 'money', default: 60000,
                    hint: '工资薪金等已减 6 万基本减除、三险一金与专项附加扣除后的余额；全年只有年终奖这一笔收入就填 0' },

                { key: 'bonus', step: 'bonus', label: '年终奖金额（元）', type: 'money', default: 36000, min: 0,
                    hint: '全年一次性奖金；同一个月内只发一次（一年只能用一次单独计税）' },

                { key: 'splittable', step: 'split', label: '这笔薪酬能在「工资」与「年终奖」之间自由分配', type: 'switch', default: false,
                    hint: '总额不变、只换名目发放（谈 offer / 年底定包的情形）。已经发完的年终奖改不了分配，只能两套口径二选一' }
            ],
            steps: [
                { key: 'base', title: '全年口径', why: '年终奖并入还是单独更省，取决于你**其余综合所得落在哪一档** —— 没有这一档，两套口径无从比较' },
                { key: 'bonus', title: '年终奖', why: '单独计税按「奖金 ÷ 12」定档、再全额乘税率：发 36000 与发 36001 之间差两千多，中间那一段是雷区' },
                { key: 'split', title: '分配方式', why: '如果这笔钱本就可以在工资与年终奖之间切分，那么最省的点通常既不是全并入也不是全单独' }
            ],
            pitfalls: [
                '单独计税按「奖金 ÷ 12」定档、再全额乘税率，所以**临界点附近多发 1 元可能到手更少**：36000 / 144000 / 300000 / 420000 / 660000 / 960000 之后各有一段雷区，本工具给出每段的出口金额',
                '「并入更省」不是绝对的：它取决于你其余综合所得落在哪一档 —— 全年没什么其他收入时并入通常更省，中高收入单独计税通常更省',
                '最优分配只在**你能决定发放名目**时成立：已经发完的年终奖改不了口径，只能在两套算法里二选一',
                '一年只能用一次单独计税；同一个月内分两笔发也不改变这一点（那是两笔奖金，不是两次优惠）',
                '单独计税政策执行至 2027-12-31（以注册表状态为准）；之后只能并入综合所得',
                '本工具按「工资与年终奖总额不变」求最优，未考虑社保 / 公积金缴费基数随工资变动带来的影响'
            ],
            compute: function (v) {
                var Q = window.EuriskoBonusQuick;
                if (!Q) return null;

                var T = function (x) {
                    return typeof calculateTaxByTaxableIncome === 'function'
                        ? calculateTaxByTaxableIncome(Math.max(0, x)).tax : 0;
                };

                var other = Math.max(0, Number(v.otherTaxable) || 0);
                var bonus = Math.max(0, Number(v.bonus) || 0);

                // ① 两套口径：单独计税 = 综合所得照常算 + 奖金按月度换算表单独算；
                //    并入 = 奖金全额加进综合所得一起找档（**不是**「奖金 × 边际税率」）。
                var bonusTax = Q.taxOf(bonus);
                var sep = T(other) + bonusTax;
                var inc = T(other + bonus);
                var gap = inc - sep;                       // 正数 = 并入更贵
                var pick = gap > 0.005 ? '单独计税更省' : (gap < -0.005 ? '并入综合所得更省' : '两种口径相同');
                var pickTax = Math.min(sep, inc);

                var br = Q.bracketOf(bonus);
                var edge = br && isFinite(br.max) ? br.max * 12 : 0;

                // ② 临界区（雷区）：每一档的上沿 t 本身仍按低档计税，t + 1 元就跳档。
                //    跳档后净额 = x(1 − 高档税率) + 高档速算扣除，随 x 线性回升，
                //    于是能解出「到手回到 t 水平」的出口金额 —— 那一段就是真实的雷区。
                var table = (Array.isArray(window.bonusMonthlyTaxRates) && window.bonusMonthlyTaxRates)
                    || (window.EuriskoTaxConstants && window.EuriskoTaxConstants.bonusMonthlyTaxRates) || [];
                var edges = [];
                table.forEach(function (r, i) {
                    if (!isFinite(r.max)) return;
                    var t = r.max * 12;
                    var next = table[i + 1];
                    var taxAt = Q.taxOf(t);
                    var netAt = t - taxAt;
                    var escape = null;
                    if (next) {
                        var x = (netAt - next.deduction) / (1 - next.rate);
                        if (x > t) escape = x;
                    }
                    edges.push({
                        edge: t, rate: r.rate, jump: Q.taxOf(t + 1) - taxAt,
                        nextRate: next ? next.rate : null, escape: escape
                    });
                });

                // 雷区判定：金额刚过上沿、但还没到「出口金额」—— 这一段里多发不如少发
                function inEscapeZone(e, x) {
                    if (e.escape === null || e.escape === undefined) return false;
                    return x > e.edge && x < e.escape;
                }

                var inDanger = null;
                edges.forEach(function (e) {
                    if (inEscapeZone(e, bonus)) inDanger = e;
                });

                // ③ 最优分配：总额固定的前提下，多少走年终奖单独计税最省？
                //    f(x) = T(pool − x) + 奖金税(x) 在每一档内是线性的，只会在阈值处向上跳，
                //    所以最小值必然落在「档的上沿」或「上沿 − 1 分」这类端点上 —— 枚举即可，不需要搜索。
                var splitRows = null, best = null;
                if (v.splittable === true && (other + bonus) > 0) {
                    var pool = other + bonus;
                    var cands = [0, pool, bonus];
                    edges.forEach(function (e) {
                        if (e.edge <= pool) {
                            cands.push(e.edge);
                            if (e.edge - 0.01 > 0) cands.push(e.edge - 0.01);
                        }
                    });
                    var seen = {};
                    splitRows = [];
                    cands.forEach(function (raw) {
                        var x = Math.min(Math.max(raw, 0), pool);
                        var key = x.toFixed(2);
                        if (seen[key]) return;
                        seen[key] = true;
                        var tax = T(pool - x) + Q.taxOf(x);
                        var row = { bonus: x, other: pool - x, tax: tax };
                        splitRows.push(row);
                        if (!best || tax < best.tax - 1e-9) best = row;
                    });
                    splitRows.sort(function (a, b) { return a.tax - b.tax; });
                }

                var rows = [
                    { label: '单独计税：综合所得部分', value: T(other), kind: 'money' },
                    { label: '单独计税：年终奖税额', value: bonusTax, kind: 'money',
                        hint: '奖金 ÷ 12 定档，再全额乘税率减速算扣除' },
                    { label: '单独计税：全年个税合计', value: sep, kind: 'money' },
                    { label: '并入综合所得：全年个税合计', value: inc, kind: 'money',
                        hint: '奖金全额计入综合所得，与其余所得合并找档' },
                    { label: '两种口径差额（并入 − 单独）', value: gap, kind: 'money',
                        hint: '正数表示并入更贵、单独计税更省' },
                    { label: '择优结论', value: pick, kind: 'text' },
                    { label: '年终奖适用税率', value: br ? br.rate : 0, kind: 'percent' },
                    // 最高档没有上限（max 是 Infinity）—— 显示成「0 元」会被读成「一分都不能多发」，
                    // 所以这里给文字而不是数字
                    edge > 0
                        ? { label: '本档上限（年终奖）', value: edge, kind: 'money', hint: '超过此数即跳下一档' }
                        : { label: '本档上限（年终奖）', value: '最高档，无上限', kind: 'text' }
                ];

                if (best) {
                    var saveNow = sep - best.tax;      // 现状按「单独计税」计，最优也按同一口径比
                    rows.push({ label: '最优：年终奖发', value: best.bonus, kind: 'money',
                        hint: '总额 ' + (other + bonus) + ' 元不变，其余走工资' });
                    rows.push({ label: '最优：工资部分应纳税所得额', value: best.other, kind: 'money' });
                    rows.push({ label: '最优：全年个税合计', value: best.tax, kind: 'money' });
                    rows.push({ label: '相对当前分配可省', value: saveNow, kind: 'money',
                        hint: '当前把 ' + bonus + ' 元作为年终奖、' + other + ' 元作为工资' });
                }

                var note = '两套口径都是「算出来的」，不是「估出来的」：单独计税按奖金 ÷ 12 定档、全额乘税率；'
                    + '并入则把奖金全额加进综合所得重新找档。择优结论取决于你其余综合所得的档位，'
                    + '所以上面那一栏填得越准，结论越可信。';
                if (inDanger) {
                    note = '⚠️ 当前年终奖落在**雷区**：' + inDanger.edge + ' ~ ' + Math.ceil(inDanger.escape)
                        + ' 元这段里，多发不如少发（多发 1 元就要多缴 ' + Math.round(inDanger.jump)
                        + ' 元）。要么就定在 ' + inDanger.edge + ' 元，要么发到 ' + Math.ceil(inDanger.escape) + ' 元以上。';
                }

                var extras = [{
                    title: '两套口径逐项对比',
                    note: '同样是这笔年终奖，两种算法差在「奖金是单独找档还是并进综合所得找档」',
                    table: {
                        head: ['计税口径', '综合所得部分', '年终奖部分', '全年个税合计'],
                        rows: [
                            ['单独计税', { value: T(other), kind: 'money' }, { value: bonusTax, kind: 'money' }, { value: sep, kind: 'money' }],
                            ['并入综合所得', { value: T(other + bonus), kind: 'money' }, '─', { value: inc, kind: 'money' }]
                        ]
                    }
                }, {
                    title: '临界区（多发反而少拿的区间）',
                    note: '每一档的上沿本身仍按低档计税，超过 1 元就整笔跳档；跳档后要涨到「出口金额」以上，到手才回到原来水平',
                    table: {
                        head: ['档位上限', '该档税率', '多发 1 元多缴', '雷区上沿（到手回到原水平）'],
                        rows: edges.map(function (e) {
                            return [
                                { value: e.edge, kind: 'money' },
                                { value: e.rate, kind: 'percent' },
                                { value: e.jump, kind: 'money' },
                                e.escape === null || e.escape === undefined ? '─' : { value: Math.ceil(e.escape), kind: 'money' }
                            ];
                        })
                    }
                }];

                if (splitRows) {
                    extras.push({
                        title: '可分配总额下的候选切分点',
                        note: '总额固定时，全年个税在每一档内是线性变化的、只会在阈值处向上跳 —— 最优点必然落在这些端点上，已按税额从低到高排序',
                        table: {
                            head: ['年终奖', '工资部分应纳税所得额', '全年个税合计', '说明'],
                            rows: splitRows.map(function (r) {
                                var mark = (best && Math.abs(r.tax - best.tax) < 1e-9) ? '最优'
                                    : (Math.abs(r.bonus - bonus) < 0.005 ? '当前' : '─');
                                return [
                                    { value: r.bonus, kind: 'money' },
                                    { value: r.other, kind: 'money' },
                                    { value: r.tax, kind: 'money' },
                                    mark
                                ];
                            })
                        }
                    });
                }

                return {
                    primary: { label: '择优后全年个税合计', value: pickTax, kind: 'money', hint: pick },
                    rows: rows,
                    note: note,
                    extras: extras
                };
            }
        },
        {
            // 阶段17 17D-3（v1.54.0）：个税纵深补齐的第三个场景 —— 股权激励。
            //
            // 速算器 `equity` 只认**一个行权日、一个价差**：fields 里只有一组 qty / price / cost，
            // 而「一年内多次行权」只能靠一个标量 `ytdIncome` 手工补进去。它缺的是这四层：
            //   ① **多批次明细**（repeater）：每一批各有形式、数量、价格、出资、月份，
            //      合并成一个基数一次性定档 —— 而不是让用户自己先加好再填一个总数；
            //   ② **分次各自定档 vs 合并定档的差额**：法定是合并（`combineWithinYear: true`），
            //      而「每批各自从低档起算」会**少算税** —— 那个差额就是次年汇算要补（还可能加滞纳金）
            //      的数。速算器永远只算合并，所以这一层它根本表达不出来；
            //   ③ **递延纳税 20%**（非上市公司，财税〔2016〕101 号）：`equityIncentiveRules.deferred`
            //      这个常量一直存在，quick 模块里却**没有任何函数用它** —— 这里补上对照：
            //      行权时暂不缴、转让时按「财产转让所得」20%，计税依据是转让价减取得成本；
            //   ④ **跨年度行权**：合并只在**同一个纳税年度内**成立，分到两个年度就各自定档。
            //      行权窗口还能自己安排时，这是唯一合法的降档路径 —— 枚举「前 k 批当年、其余次年」即可。
            // 口径仍然同源：收入额走 `EuriskoEquityQuick.incomeOf`（四种形式的公式一个都没复制），
            // 税率与税额走 `taxSeparateOf` / `bracketOf`，综合所得部分走内核
            // `calculateTaxByTaxableIncome`；单批输入与速算器逐点相等，由 tests/equity-deep.test.js 钉住。
            id: 'equity-deep', name: '股权激励', subtitle: '多次行权合并计税，并给出递延与跨年对照',
            icon: 'fa-line-chart', status: 'deep',
            nextTools: ['equity', 'annual-settlement', 'salary-tax'],
            policyKey: 'equity-incentive',
            fields: [
                { key: 'otherTaxable', step: 'base', label: '全年其他综合所得的应纳税所得额（元）', type: 'money', default: 60000,
                    hint: '工资薪金等已减 6 万基本减除、三险一金与专项附加扣除后的余额；股权激励**不并入**这一栏，只用于对照「如果并入会怎样」' },

                { key: 'grants', step: 'grants', label: '本年取得的股权激励批次', type: 'repeater',
                    addLabel: '添加一批行权 / 解禁',
                    hint: '同一纳税年度内的所有批次都要列上 —— 法定口径是**合并成一个基数**一次性定档；收入 ≤ 0 的批次不产生税额',
                    default: [{ month: 3, type: 'option', qty: 10000, price: 20, cost: 10, grantPrice: 15 }],
                    itemFields: [
                        { key: 'month', label: '取得月份', type: 'select', default: 3,
                            options: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(function (m) { return { value: m, label: m + ' 月' }; }) },
                        { key: 'type', label: '激励形式', type: 'select', default: 'option',
                            options: [
                                { value: 'option', label: '股票期权' }, { value: 'restricted', label: '限制性股票' },
                                { value: 'appreciation', label: '股票增值权' }, { value: 'award', label: '股权奖励' }
                            ] },
                        { key: 'qty', label: '数量（股 / 份）', type: 'number', default: 10000, min: 0 },
                        { key: 'price', label: '行权 / 解禁日市价（元/股）', type: 'money', default: 20 },
                        { key: 'cost', label: '施权价 / 出资额（元/股）', type: 'money', default: 10,
                            hint: '股票增值权填授权日每股价格；限制性股票填该批次实际出资额' },
                        { key: 'grantPrice', label: '股票登记日市价（元/股）', type: 'money', default: 15,
                            when: { key: 'type', in: ['restricted'] },
                            hint: '仅限制性股票用到：按「登记日与解禁日的均价」减出资额计税' }
                    ] },

                { key: 'deferred', step: 'option', label: '非上市公司且符合条件，可递延至转让时按 20% 计税', type: 'switch', default: false,
                    hint: '财税〔2016〕101 号：行权时暂不缴，转让该股权时按「财产转让所得」20% 计税；选择递延后不再适用单独计税' },
                { key: 'exitPrice', step: 'option', label: '预计转让价（元/股）', type: 'money', default: 30,
                    when: { key: 'deferred', in: [true] },
                    hint: '递延口径的计税依据 =（转让价 − 取得成本）× 份数' },
                { key: 'plannable', step: 'option', label: '行权时点还能自己安排（可跨年度分批）', type: 'switch', default: false,
                    hint: '期权行权窗口、解禁节奏可自选的情形；已经行权完的批次改不了年度' }
            ],
            steps: [
                { key: 'base', title: '全年口径', why: '股权激励是**全额单独适用**年度税率表、不并入综合所得 —— 这一栏只用来给出「如果并入会怎样」的对照' },
                { key: 'grants', title: '激励批次', why: '一个纳税年度内两次以上股权激励必须**合并**计税：合并后一次性定档，而不是每批各自从低档起算' },
                { key: 'option', title: '递延与行权安排', why: '非上市公司可递延到转让时按 20% 计税；行权窗口还能自选时，把批次分到两个纳税年度会各自定档' }
            ],
            pitfalls: [
                '一个纳税年度内取得两次以上股权激励必须**合并计算**：合并后的收入一次性定档，按每批各自定档会**少算税**，汇算时要补（并可能加收滞纳金）',
                '现行政策是**不并入**综合所得、全额单独适用年度税率表，且**不减除任何费用** —— 6 万元基本减除与专项附加扣除都用不上，所以不能拿它跟「同等金额的工资」直接比税率',
                '与年终奖不同：这里适用的是**超额累进的年度税率表**，不存在「多发 1 元到手反而变少」的雷区 —— 年终奖那种雷区来自「÷ 12 定档、全额乘税率」的月度换算表',
                '非上市公司符合条件的股票期权 / 限制性股票 / 股权奖励可**递延**至转让时按「财产转让所得」20% 计税；递延与单独计税只能二选一，股价涨幅越大递延越不划算',
                '合并只在**同一个纳税年度内**成立 —— 跨年度行权会各自定档，这是唯一合法的降档路径，但需要行权时点本身可以自己安排',
                '单独计税政策执行至 2027-12-31（以注册表状态为准）；之后按现行口径将并入综合所得'
            ],
            compute: function (v) {
                var Q = window.EuriskoEquityQuick;
                if (!Q) return null;

                var T = function (x) {
                    return typeof calculateTaxByTaxableIncome === 'function'
                        ? calculateTaxByTaxableIncome(Math.max(0, x)).tax : 0;
                };
                var num = function (x) { var n = Number(x); return isFinite(n) ? n : 0; };
                var NAME = { option: '股票期权', restricted: '限制性股票', appreciation: '股票增值权', award: '股权奖励' };

                var other = Math.max(0, num(v.otherTaxable));
                var items = Array.isArray(v.grants) ? v.grants : [];

                // ① 逐批：收入额走 quick（四种形式的公式都在那里），一个都没复制
                var list = items.map(function (g, i) {
                    var row = {
                        index: i,
                        month: Math.min(12, Math.max(1, Math.round(num(g && g.month)) || 1)),
                        type: Q.TYPES.indexOf(g && g.type) >= 0 ? g.type : 'option',
                        qty: Math.max(0, num(g && g.qty)),
                        price: num(g && g.price),
                        cost: num(g && g.cost),
                        grantPrice: num(g && g.grantPrice)
                    };
                    row.typeName = NAME[row.type] || row.type;
                    row.income = Q.incomeOf(row.type, row);
                    row.alone = Q.taxSeparateOf(row.income);   // ② 若按这一批单独定档（错误口径）
                    return row;
                });

                var total = list.reduce(function (s, r) { return s + r.income; }, 0);
                var sep = Q.taxSeparateOf(total);              // 法定：合并成一个基数，一次性定档
                var br = Q.bracketOf(total);
                var aloneSum = list.reduce(function (s, r) { return s + r.alone; }, 0);
                var underpay = sep - aloneSum;                 // 正数 = 分次算少算了
                var otherTax = T(other);
                var nowTotal = sep + otherTax;
                var merged = T(other + total);                 // 政策不延续后并入综合所得的对照
                var gap = merged - nowTotal;

                // ③ 递延纳税：行权时不缴，转让时按「财产转让所得」20% —— 税率读常量，不写死
                var deferred = null;
                if (v.deferred === true) {
                    var rules = Q.rules() || {};
                    var dRate = num(rules.deferred && rules.deferred.rate) || 0.2;
                    var exit = Math.max(0, num(v.exitPrice));
                    var gain = list.reduce(function (s, r) { return s + Math.max(0, (exit - r.cost) * r.qty); }, 0);
                    deferred = { rate: dRate, gain: gain, tax: gain * dRate, diff: gain * dRate - sep, exit: exit };
                }

                // ④ 跨年度切分：合并只在同一纳税年度内成立，前 k 批当年、其余次年 → 枚举 n+1 种即可
                var splits = null, bestSplit = null;
                if (v.plannable === true && list.length > 1) {
                    var sorted = list.slice().sort(function (a, b) { return a.month - b.month; });
                    splits = [];
                    for (var k = 0; k <= sorted.length; k++) {
                        var cur = 0, nxt = 0;
                        sorted.forEach(function (r, i) { if (i < k) cur += r.income; else nxt += r.income; });
                        var tax = Q.taxSeparateOf(cur) + Q.taxSeparateOf(nxt);
                        var row = {
                            k: k, current: cur, next: nxt, tax: tax,
                            desc: k === sorted.length ? '全部在当年（现行）'
                                : (k === 0 ? '全部推到次年' : '前 ' + k + ' 批当年、其余次年')
                        };
                        splits.push(row);
                        if (!bestSplit || tax < bestSplit.tax - 1e-9) bestSplit = row;
                    }
                }

                var rows = [
                    { label: '股权激励收入合计（合并基数）', value: total, kind: 'money',
                        hint: '全年各批次的收入额合计，不减除任何费用' },
                    { label: '合并后适用税率', value: br ? br.rate : 0, kind: 'percent',
                        hint: '全额单独适用年度综合所得税率表（不 ÷ 12、不做月度换算）' },
                    { label: '现行：股权激励应纳个税', value: sep, kind: 'money' },
                    { label: '其他综合所得应纳税额', value: otherTax, kind: 'money' },
                    { label: '现行：全年个税合计', value: nowTotal, kind: 'money' },
                    { label: '若按批各自定档（错误口径）', value: aloneSum, kind: 'money',
                        hint: '每批各自从低档起算的结果，法定不这么算' },
                    { label: '分次算会少算（汇算要补）', value: underpay, kind: 'money',
                        hint: '正数表示按批各自定档少算了税，年度汇算时要补' },
                    { label: '若并入综合所得（对照）', value: merged, kind: 'money',
                        hint: '政策 2027-12-31 到期后若不延续的口径，现行不适用' },
                    { label: '并入差额', value: gap, kind: 'money' }
                ];

                if (deferred) {
                    rows.push({ label: '递延：转让时应纳税额（' + Math.round(deferred.rate * 100) + '%）', value: deferred.tax, kind: 'money',
                        hint: '计税依据 =（转让价 ' + deferred.exit + ' − 取得成本）× 份数' });
                    rows.push({ label: '递延相对单独计税', value: deferred.diff, kind: 'money',
                        hint: '正数表示递延更贵（股价涨幅越大越不划算）' });
                }
                if (bestSplit) {
                    rows.push({ label: '最优：当年行权批次', value: bestSplit.k + ' / ' + list.length, kind: 'text' });
                    rows.push({ label: '最优：股权激励个税合计', value: bestSplit.tax, kind: 'money' });
                    rows.push({ label: '相对全部在当年可省', value: sep - bestSplit.tax, kind: 'money' });
                }

                var note = '现行口径：全年各批次**合并**成一个基数、全额单独适用年度税率表，'
                    + '不并入综合所得也不减除任何费用。年度表是超额累进的，所以这里**没有**年终奖那种'
                    + '「多发 1 元到手反而变少」的雷区 —— 多发只会多交一点，不会倒挂。';
                if (underpay > 0.005) {
                    note = '⚠️ 如果按每一批各自定档预扣，全年会**少算 ' + Math.round(underpay)
                        + ' 元**：法定口径是把全年各批次合并后一次性定档（' + Math.round(total)
                        + ' 元 → 税率 ' + Math.round((br ? br.rate : 0) * 100) + '%），'
                        + '不是每批各从低档起算。这个差额年度汇算时要补，并可能加收滞纳金。';
                }

                var compareRows = [
                    ['现行：合并后单独计税', { value: total, kind: 'money' }, { value: sep, kind: 'money' }, '法定口径'],
                    ['若按批各自定档', { value: total, kind: 'money' }, { value: aloneSum, kind: 'money' },
                        underpay > 0.005 ? '少算 ' + Math.round(underpay) + ' 元' : '与合并相同'],
                    ['并入综合所得（对照）', { value: other + total, kind: 'money' }, { value: merged, kind: 'money' },
                        '政策到期后若不延续']
                ];
                if (deferred) {
                    compareRows.push(['递延至转让（财产转让所得）', { value: deferred.gain, kind: 'money' },
                        { value: deferred.tax, kind: 'money' }, '非上市公司符合条件时可选']);
                }

                var extras = [{
                    title: '本年批次明细',
                    note: '同一纳税年度内的每一批都在这里；「若单独定档」那一列是错误口径，用来量化少算的税',
                    table: {
                        head: ['月份', '形式', '数量', '股权激励收入', '若单独定档的税', '占合并基数'],
                        rows: list.slice().sort(function (a, b) { return a.month - b.month; }).map(function (r) {
                            return [
                                r.month + ' 月',
                                r.typeName,
                                { value: r.qty, kind: 'number' },
                                { value: r.income, kind: 'money' },
                                { value: r.alone, kind: 'money' },
                                total > 0 ? { value: r.income / total, kind: 'percent' } : '─'
                            ];
                        })
                    }
                }, {
                    title: '四种口径逐项对比',
                    note: '计税基数与应纳税额一一对应；只有第一行是现行法定口径',
                    table: {
                        head: ['口径', '计税基数', '应纳税额', '说明'],
                        rows: compareRows
                    }
                }];

                if (splits) {
                    extras.push({
                        title: '跨年度行权的候选切法',
                        note: '合并只在同一个纳税年度内成立 —— 前 k 批在当年、其余推到次年，两边各自定档（按月份排序枚举），已按税额升序',
                        table: {
                            head: ['切法', '当年基数', '次年基数', '股权激励个税合计', '说明'],
                            rows: splits.slice().sort(function (a, b) { return a.tax - b.tax; }).map(function (r) {
                                return [
                                    r.desc,
                                    { value: r.current, kind: 'money' },
                                    { value: r.next, kind: 'money' },
                                    { value: r.tax, kind: 'money' },
                                    bestSplit && Math.abs(r.tax - bestSplit.tax) < 1e-9 ? '最优'
                                        : (r.k === list.length ? '现状' : '─')
                                ];
                            })
                        }
                    });
                }

                return {
                    primary: { label: '现行：全年个税合计', value: nowTotal, kind: 'money',
                        hint: '股权激励单独计税 + 其他综合所得' },
                    rows: rows,
                    note: note,
                    extras: extras
                };
            }
        },
        {
            // 阶段17 17D-4（v1.55.0）：个税纵深补齐的第四个场景 —— 离职补偿金。
            //
            // 速算器 `severance` 只有 `economic` / `other` 两个框，而 `compareOf` 里写的是
            // `legalPart = legalEconomic + other` —— 即「其他一次性补助」被**全额认可为可享免税**。
            // 这恰恰是离职补偿里最贵的那个坑：真实的补偿包是**多笔构成**的，而税务处理各不相同：
            //   ① **经济补偿金 / 医疗生活补助费** —— 属于财税〔2001〕157 号的「一次性补偿收入」，
            //      可享「当地上年职工年平均工资 × 3」的免税额度；
            //   ② **一次性安置费（破产企业）** —— 157 号第三条**全额免税**，不受 3 倍限制；
            //   ③ **代通知金（+1）/ 竞业限制补偿 / 未休年休假折算** —— **不属于**解除劳动关系
            //      取得的一次性补偿，不能享受免税额度。把它们填进速算器的「其他补助」框，
            //      就会**少算税**（本工具量化这个差额）。
            // 速算器做不到的另外三层：
            //   ④ **法定应得的精确折算**：《劳动合同法》第 47 条是「满一年一个月、六个月以上
            //      不满一年按一年、不满六个月按半个月」，速算器直接把「年限」当月数用；
            //   ⑤ **代扣的社保公积金可扣除**（157 号第二条）—— 速算器**没有这一栏**，用户会多算税；
            //   ⑥ **免税额度是按「一次性补偿收入」整体给一次**，分次 / 跨年支付不能重复扣。
            // 还有一条算出来才知道的反直觉结论：月工资超过社平 3 倍时，经济补偿受
            // 「3 倍 × 12 年」双封顶，封顶值 = 月均×3×12 = 年均×3，**恰好等于免税额度** ——
            // 按法定上限足额支付的经济补偿，一分钱税都不用交。
            // 口径仍然同源：免税额度、法定上限、税额全部走 `EuriskoSeveranceQuick`，
            // 并入综合所得的部分走内核 `calculateTaxByTaxableIncome` 的**增量**；
            // 单笔输入与速算器逐点相等，由 tests/severance-deep.test.js 钉住。
            id: 'severance-deep', name: '离职补偿金', subtitle: '逐笔分类计税，并核算法定应得',
            icon: 'fa-sign-out', status: 'deep',
            nextTools: ['severance', 'annual-settlement', 'early-retirement'],
            policyKey: 'severance',
            fields: [
                { key: 'avgWage', step: 'basis', label: '当地上年职工年平均工资（元/年）', type: 'money', default: 120000,
                    hint: '免税额度 = 该数 × 3；各地人社部门每年公布，口径是**年平均工资**' },
                { key: 'monthlyWage', step: 'basis', label: '离职前 12 个月月平均工资（元）', type: 'money', default: 15000 },
                { key: 'years', step: 'basis', label: '本单位工作年限（整年）', type: 'number', default: 8, min: 0 },
                { key: 'extraMonths', step: 'basis', label: '不足一年的月数', type: 'number', default: 0, min: 0,
                    hint: '满一年一个月；六个月以上不满一年按一年；不满六个月按半个月' },

                { key: 'items', step: 'package', label: '离职补偿包的构成（逐笔）', type: 'repeater',
                    addLabel: '添加一笔',
                    hint: '**不同款项的税务处理不一样**：只有经济补偿金与医疗 / 生活补助费能享受免税额度，'
                        + '代通知金、竞业限制补偿、未休年休假折算都不能 —— 分开填才不会算错',
                    default: [{ kind: 'economic', amount: 120000 }, { kind: 'noncompete', amount: 60000 }],
                    itemFields: [
                        { key: 'kind', label: '款项类别', type: 'select', default: 'economic',
                            options: [
                                { value: 'economic', label: '经济补偿金（N）' },
                                { value: 'subsidy', label: '医疗 / 生活补助费' },
                                { value: 'placement', label: '一次性安置费（破产）' },
                                { value: 'notice', label: '代通知金（+1）' },
                                { value: 'noncompete', label: '竞业限制补偿' },
                                { value: 'leave', label: '未休年休假折算' },
                                { value: 'other', label: '其他款项' }
                            ] },
                        { key: 'amount', label: '金额（元）', type: 'money', default: 0 }
                    ] },

                { key: 'socialDeduction', step: 'option', label: '从补偿款中代扣的社保公积金（元）', type: 'money', default: 0,
                    hint: '财税〔2001〕157 号第二条：领取补偿时按国家规定比例**实际缴纳**的住房公积金、'
                        + '医疗 / 养老 / 失业保险费，可以在计征时扣除' },
                { key: 'otherTaxable', step: 'option', label: '当年其他综合所得的应纳税所得额（元）', type: 'money', default: 60000,
                    hint: '工资薪金等已减 6 万基本减除与各项扣除后的余额；只影响「并入综合所得」的那些款项' },
                { key: 'installments', step: 'option', label: '补偿是分次 / 跨年支付的', type: 'switch', default: false,
                    hint: '免税额度是按「一次性补偿收入」整体给**一次**的，分几次支付也不能重复扣' },
                { key: 'times', step: 'option', label: '分几次支付', type: 'number', default: 2, min: 1,
                    when: { key: 'installments', in: [true] } }
            ],
            steps: [
                { key: 'basis', title: '当地口径与年限', why: '免税额度是**当地上年职工年平均工资 × 3** —— 不是月工资 × 3，也不是全国一个数；年限决定法定应得几个月' },
                { key: 'package', title: '补偿构成', why: '补偿包往往是多笔构成的，而**只有**经济补偿金与医疗 / 生活补助费属于「一次性补偿收入」、能享受免税额度' },
                { key: 'option', title: '扣除与对照', why: '补偿款里代扣的社保公积金可以在计征时扣除；并入综合所得的那部分要按你当年的档位算增量' }
            ],
            pitfalls: [
                '免税额度是**当地上年职工年平均工资 × 3**，不是「离职前月工资 × 3」，也不是全国一个数',
                '只有**解除劳动关系取得的一次性补偿收入**才享受免税：竞业限制补偿、未休年休假折算、代通知金、股权激励结算都**不属于**，把它们算进补偿包就会少算税',
                '破产企业职工取得的一次性安置费**全额免税**，不受 3 倍限制（财税〔2001〕157 号第三条）',
                '领取补偿时按国家规定比例**实际缴纳**的住房公积金、医疗 / 养老 / 失业保险费，可以在计征时扣除 —— 速算器没有这一栏，会多算税',
                '免税额度按「一次性补偿收入」整体给**一次** —— 分次支付、跨年支付都不能重复扣（每扣一次就少算一份税）',
                '超过免税额度部分**不并入**当年综合所得，单独适用年度税率表、不减除任何费用、也**不做按工作年限平均**（国税发〔1999〕178 号的平均法已停止执行）',
                '月工资超过社平 3 倍时，经济补偿受「3 倍 × 12 年」双封顶，封顶值**恰好等于免税额度** —— 按法定上限足额支付的经济补偿一分钱税都不用交'
            ],
            compute: function (v) {
                var Q = window.EuriskoSeveranceQuick;
                if (!Q) return null;

                var T = function (x) {
                    return typeof calculateTaxByTaxableIncome === 'function'
                        ? calculateTaxByTaxableIncome(Math.max(0, x)).tax : 0;
                };
                var num = function (x) { var n = Number(x); return isFinite(n) ? n : 0; };

                // 三类款式的税务处理不同 —— 这是速算器两个框表达不出来的那一层
                var KIND = {
                    economic: { name: '经济补偿金', bucket: 'sev', note: '《劳动合同法》第 47 条，受法定上限约束' },
                    subsidy: { name: '医疗 / 生活补助费', bucket: 'sev', note: '157 号文列举的「其他补助费」，法定只设下限' },
                    placement: { name: '一次性安置费（破产）', bucket: 'free', note: '破产企业职工取得，全额免税' },
                    notice: { name: '代通知金（+1）', bucket: 'merge', note: '各地口径不一，本工具按并入综合所得处理' },
                    noncompete: { name: '竞业限制补偿', bucket: 'merge', note: '不属于解除劳动关系的一次性补偿' },
                    leave: { name: '未休年休假折算', bucket: 'merge', note: '工资薪金性质' },
                    other: { name: '其他款项', bucket: 'merge', note: '口径不明时按并入处理（保守）' }
                };
                var BUCKET = {
                    sev: '一次性补偿收入（可享免税额度）',
                    free: '全额免税',
                    merge: '并入当年综合所得'
                };

                var rules = Q.rules() || {};
                var mult = num(rules.exemptMultipleOfAverageWage) || 3;
                var capM = num(rules.capMonthlyWageMultiple) || 3;
                var capY = num(rules.capYears) || 12;

                var avgWage = Math.max(0, num(v.avgWage));
                var monthlyWage = Math.max(0, num(v.monthlyWage));
                var years = Math.max(0, num(v.years));
                var extraMonths = Math.min(11, Math.max(0, Math.round(num(v.extraMonths))));

                // 《劳动合同法》第 47 条：满一年一个月；六个月以上不满一年按一年；不满六个月按半个月
                // （速算器直接把「年限」当月数用，小数年限会被少算）
                var months = years + (extraMonths >= 6 ? 1 : (extraMonths > 0 ? 0.5 : 0));

                var items = Array.isArray(v.items) ? v.items : [];
                var detail = items.map(function (it) {
                    var kind = KIND[it && it.kind] ? it.kind : 'other';
                    var k = KIND[kind];
                    return {
                        kind: kind, name: k.name, bucket: k.bucket, note: k.note,
                        amount: Math.max(0, num(it && it.amount))
                    };
                });
                var sumOf = function (kind) {
                    return detail.reduce(function (s, d) { return s + (d.kind === kind ? d.amount : 0); }, 0);
                };
                var sumBucket = function (b) {
                    return detail.reduce(function (s, d) { return s + (d.bucket === b ? d.amount : 0); }, 0);
                };
                var sevEconomic = sumOf('economic');
                var sevSubsidy = sumOf('subsidy');
                var sevBase = sevEconomic + sevSubsidy;
                var freePart = sumBucket('free');
                var mergePart = sumBucket('merge');
                var total = sevBase + freePart + mergePart;

                // 免税额度与法定上限一律走 quick，一个数字都没复制
                var r = Q.compareOf({
                    economic: sevEconomic, other: sevSubsidy, avgWage: avgWage,
                    monthlyWage: monthlyWage, years: months, otherTaxable: 0
                });

                var socialDed = Math.max(0, num(v.socialDeduction));
                var taxable = Math.max(0, r.taxable - socialDed);
                var br = Q.bracketOf(taxable);
                var sevTax = Q.taxSeparateOf(taxable);

                // 并入综合所得的部分按**增量**算：离职补偿不占用 6 万元基本减除
                var otherTaxable = Math.max(0, num(v.otherTaxable));
                var mergeTax = T(otherTaxable + mergePart) - T(otherTaxable);
                var totalTax = sevTax + mergeTax;

                // 法定应得（法条精确版）：只有月工资超社平 3 倍时才封「3 倍 × 12 年」
                var maWage = avgWage / 12;
                var wageCapped = monthlyWage > maWage * capM + 1e-9;
                // 只有月工资超社平 3 倍时才「按 3 倍计、年限封 12 年」；否则年限不封顶
                var dueMonths = wageCapped ? Math.min(months, capY) : months;
                var dueWage = wageCapped ? maWage * capM : monthlyWage;
                var legalDue = dueWage * dueMonths;
                var dueGap = legalDue - sevBase;      // 正数 = 拿到的经济补偿低于法定应得

                // 错误口径①：把所有款项都填进「经济补偿金」（速算器只有两个框时最常见的填法）
                var naive = Q.compareOf({
                    economic: sevBase + mergePart, other: 0, avgWage: avgWage,
                    monthlyWage: monthlyWage, years: months, otherTaxable: 0
                });
                var naiveTax = Q.taxSeparateOf(Math.max(0, naive.taxable - socialDed));
                var naiveGap = totalTax - naiveTax;   // 正数 = 混着填会少算

                // 错误口径②：分次支付时每次各扣一次免税额度（免税额度整体只给一次）
                var inst = null;
                var times = Math.max(1, Math.round(num(v.times)));
                if (v.installments === true && times > 1 && sevBase > 0) {
                    var each = sevBase / times;
                    var eachTaxable = Math.max(0, each - r.exemptCap);
                    var instTax = Q.taxSeparateOf(eachTaxable) * times;
                    inst = { times: times, each: each, taxable: eachTaxable, tax: instTax, gap: sevTax - instTax };
                }

                var rows = [
                    { label: '补偿包合计', value: total, kind: 'money' },
                    { label: '其中：一次性补偿收入（可享免税）', value: sevBase, kind: 'money' },
                    { label: '其中：全额免税（破产安置费）', value: freePart, kind: 'money' },
                    { label: '其中：并入综合所得', value: mergePart, kind: 'money' },
                    { label: '免税额度（社平年工资 ×' + mult + '）', value: r.exemptCap, kind: 'money' },
                    { label: '实际使用免税额度', value: r.exemptUsed, kind: 'money',
                        hint: '免税额度只抵「符合法定标准」的那部分' },
                    { label: '扣除：补偿款中代扣的社保公积金', value: socialDed, kind: 'money' },
                    { label: '一次性补偿应纳税所得额', value: taxable, kind: 'money' },
                    { label: '适用税率', value: br ? br.rate : 0, kind: 'percent' },
                    { label: '一次性补偿应纳个税', value: sevTax, kind: 'money' },
                    { label: '并入部分的增量税', value: mergeTax, kind: 'money',
                        hint: '不占用 6 万元基本减除，按并入前后的档位差计算' },
                    { label: '应纳个税合计', value: totalTax, kind: 'money' },
                    { label: '税后到手', value: total - totalTax, kind: 'money' },
                    { label: '实际税负率', value: total > 0 ? totalTax / total : 0, kind: 'percent' },
                    { label: '法定应得经济补偿（' + dueMonths + ' 个月）', value: legalDue, kind: 'money',
                        hint: wageCapped ? '月工资超社平 ' + capM + ' 倍，按「' + capM + ' 倍 × ' + capY + ' 年」双封顶'
                            : '月工资未超社平 ' + capM + ' 倍，年限不封顶' },
                    { label: '经济补偿低于法定应得', value: Math.max(0, dueGap), kind: 'money' },
                    { label: '若全按一次性补偿（错误口径）', value: naiveTax, kind: 'money' },
                    { label: '混着填会少算', value: naiveGap, kind: 'money' }
                ];
                if (inst) {
                    rows.push({ label: '若分 ' + inst.times + ' 次支付、每次各扣免税额度', value: inst.tax, kind: 'money' });
                    rows.push({ label: '分次各扣会少算', value: inst.gap, kind: 'money' });
                }

                var note = '免税额度 = 当地上年职工年平均工资 × ' + mult + '（' + Math.round(r.exemptCap)
                    + ' 元）。一次性补偿收入在该额度以内免税，超出部分**不并入**当年综合所得、'
                    + '单独适用年度税率表，不减除任何费用，也不做按工作年限平均。';
                if (mergePart > 0 && naiveGap > 0.005) {
                    note = '⚠️ 补偿包里有 ' + Math.round(mergePart) + ' 元**不属于**解除劳动关系的一次性补偿收入'
                        + '（代通知金 / 竞业限制补偿 / 未休年休假折算等），不能享受免税额度。'
                        + '若把它们一并填进「经济补偿金」，会**少算 ' + Math.round(naiveGap) + ' 元**税。';
                }
                if (wageCapped) {
                    note += ' 你填的月工资已超过社平月工资 ' + capM + ' 倍，经济补偿受「' + capM + ' 倍 × ' + capY
                        + ' 年」双封顶，封顶值 ' + Math.round(legalDue) + ' 元**恰好等于免税额度** —— '
                        + '按法定上限足额支付的经济补偿一分钱税都不用交。';
                }
                if (!wageCapped && months > 0) {
                    note += ' 你填的月工资未超社平 ' + capM + ' 倍，经济补偿的年限**不封顶**（按 ' + months
                        + ' 个月计付）；速算器口径无条件按 ' + capY + ' 年封顶，长工龄时会低估法定应得。';
                }
                if (dueGap > 0.005) {
                    note += ' 另：按《劳动合同法》第 47 条折算，法定应得经济补偿约 ' + Math.round(legalDue)
                        + ' 元，你填的经济补偿比它少 ' + Math.round(dueGap) + ' 元 —— 先核实基数与年限，再谈税。';
                }

                var compareRows = [
                    ['现行：按款项分类处理', { value: totalTax, kind: 'money' }, '—', '法定口径'],
                    ['若全按一次性补偿', { value: naiveTax, kind: 'money' },
                        Math.abs(naiveGap) < 0.005 ? '相同' : '少算 ' + Math.round(naiveGap) + ' 元',
                        '把不能免税的款项塞进补偿包']
                ];
                if (inst) {
                    compareRows.push(['若分次支付每次各扣免税额度', { value: inst.tax, kind: 'money' },
                        Math.abs(inst.gap) < 0.005 ? '相同' : '少算 ' + Math.round(inst.gap) + ' 元',
                        '免税额度只给一次']);
                }

                return {
                    primary: { label: '离职补偿应纳个税', value: totalTax, kind: 'money',
                        hint: '一次性补偿单独计税 + 并入部分的增量税' },
                    rows: rows,
                    note: note,
                    extras: [{
                        title: '补偿构成与税务处理',
                        note: '同一笔钱，类别不同处理就不同 —— 只有前两类能享受免税额度',
                        table: {
                            head: ['款项', '金额', '税务处理', '可享免税额度', '说明'],
                            rows: detail.map(function (d) {
                                return [
                                    d.name,
                                    { value: d.amount, kind: 'money' },
                                    BUCKET[d.bucket],
                                    d.bucket === 'sev' ? '是' : (d.bucket === 'free' ? '全额免税' : '否'),
                                    d.note
                                ];
                            })
                        }
                    }, {
                        title: '口径对照',
                        note: '只有第一行是法定口径；后两行是常见填法会造成的差额',
                        table: {
                            head: ['口径', '应纳税额', '与现行差额', '说明'],
                            rows: compareRows
                        }
                    }]
                };
            }
        },
        {
            // 阶段17 17D-5（v1.56.0）：个税纵深补齐的第五个场景 —— 提前退休 / 内部退养一次性收入。
            //
            // 速算器 `early-retirement` 已经用 `variant` 把「真分摊」与「平均只为定档」分开了，
            // 但它把**分摊年数 / 所属月份数当成两个自由填写的框** —— 而这两个数是**法定的**：
            //   ① **提前退休**（财税〔2018〕164 号第五条二项）按「办理提前退休手续至法定离退休年龄
            //      之间实际年度数」平均分摊 —— 不是想分几年就几年。多填年数就能少交税，是这条政策
            //      最容易被钻的空子（本工具按**法定退休年龄 − 办理时年龄**折算，并量化自行填写的差额）。
            //   ② **内部退养**（164 号第五条三项 + 国税发〔1999〕58 号）的「所属月份数」同样是法定的。
            // 另外三层是速算器没算出来的：
            //   ③ **免税额度**：提前退休分摊后每年减 6 万，等价于「免税额度 = 6 万 × 分摊年数」——
            //      **随提前的年数线性增长**；离职补偿是「社平年工资 × 3」的**固定**额度；内部退养
            //      **根本没有免税额度**（只减一次 5000）。同一笔一次性收入，三种口径差出一个数量级。
            //   ④ **内部退养有巨大的临界区**：它与年终奖共用同一张**月度**表定档，但税基是
            //      「当月工资 + 一次性收入**全额**」—— 定档基数跨档时，多发 1 元可能多交上万元税。
            //      提前退休用连续的年度累进表，**没有**雷区（与股权激励同理）。本工具算出临界点并给出建议值。
            //   ⑤ 提前退休一次性补贴**不并入**当年综合所得（内退是与当月工资合并按月度表计税）。
            // 口径仍同源：两种情形一律走 `EuriskoEarlyRetirementQuick`；横向对照里的「离职补偿口径」
            // 走 `EuriskoSeveranceQuick`（复刻 17D-4 那条「法定上限恰好等于免税额度」的恒等式，
            // 让 legalCap 不额外截断）；单笔输入与速算器逐点相等，由 tests/early-retirement-deep.test.js 钉住。
            id: 'early-retirement-deep', name: '提前退休 / 内退', subtitle: '按法定年数分摊，并查临界区',
            icon: 'fa-hourglass-half', status: 'deep',
            nextTools: ['early-retirement', 'severance', 'annual-settlement'],
            policyKey: 'early-retirement',
            fields: [
                { key: 'variant', step: 'basis', label: '情形', type: 'select', default: 'early',
                    options: [{ value: 'early', label: '提前退休（真分摊）' },
                        { value: 'internal', label: '内部退养（平均只为定档）' }],
                    hint: '两者口径完全不同：一个按年度表真分摊，一个按月度表定档后对全额计税' },
                { key: 'age', step: 'basis', label: '办理手续时的年龄（岁，可含小数）', type: 'number', default: 53, min: 0,
                    hint: '52.5 = 52 岁 6 个月' },
                { key: 'legalAge', step: 'basis', label: '本人法定退休年龄（岁）', type: 'number', default: 60, min: 0,
                    hint: '2025-01-01 起实施渐进式延迟法定退休年龄，**不再是固定的 60/55/50** —— 填本人的实际法定退休年龄' },

                { key: 'subsidy', step: 'income', label: '一次性补贴收入（元）', type: 'money', default: 560000,
                    when: { key: 'variant', in: ['early'] } },
                { key: 'lumpSum', step: 'income', label: '内退一次性收入（元）', type: 'money', default: 300000,
                    when: { key: 'variant', in: ['internal'] } },
                { key: 'monthlySalary', step: 'income', label: '领取当月工资薪金（元/月）', type: 'money', default: 6000,
                    when: { key: 'variant', in: ['internal'] },
                    hint: '内退一次性收入与领取当月工资**合并**计税；这个数也用于后面三口径的横向对照' },

                { key: 'otherTaxable', step: 'option', label: '当年其他综合所得的应纳税所得额（元）', type: 'money', default: 60000,
                    hint: '提前退休的一次性补贴**不并入**当年综合所得 —— 填它只为量化「若并入」会多交多少' },
                { key: 'claimedYears', step: 'option', label: '你原以为可以分摊几年', type: 'number', default: 10, min: 0,
                    when: { key: 'variant', in: ['early'] },
                    hint: '分摊年数按**法定实际年度数**算，不能自己选 —— 填一个不同的数看看会差多少' },
                { key: 'avgWage', step: 'option', label: '当地上年职工年平均工资（元/年）', type: 'money', default: 120000,
                    hint: '只用于与「离职补偿」口径做横向对照：那个口径的免税额度 = 该数 × 3' }
            ],
            steps: [
                { key: 'basis', title: '情形与时间点', why: '分摊年数 / 所属月份数是**法定的**（法定退休年龄 − 办理时年龄），不是想填几年就几年' },
                { key: 'income', title: '一次性收入', why: '提前退休按年度表真分摊；内退与领取当月工资合并、按月度表定档后对**全额**计税' },
                { key: 'option', title: '对照', why: '三种「一次性收入」的免税逻辑完全不同，横向一比就知道自己属于哪一种、差多少钱' }
            ],
            pitfalls: [
                '提前退休是**真分摊**（÷ 实际年数后按年减 6 万、算完乘回年数）；内部退养的「平均」**只用来定档**，税基仍是当月工资 + 一次性收入**全额**',
                '分摊的年数 / 月份数是**办理手续至法定离退休年龄的实际期间**，不是想分几年就几年 —— 多填年数能少交税，但那是错的',
                '免税额度三种三种都不同：提前退休 = **6 万 × 分摊年数**（随年数线性增长）、离职补偿 = **社平年工资 × 3**（固定）、内部退养 = **没有免税额度**（只减一次 5000）',
                '提前退休用**年度**税率表、内部退养用**月度**税率表（与年终奖同一张），两者不是一回事',
                '内部退养有**临界区**：定档基数跨档时税基是全额 —— 多发 1 元可能多交上万元税；提前退休用连续的年度累进表，**没有**雷区',
                '2025-01-01 起实施渐进式延迟法定退休年龄，法定退休年龄不再是固定的 60 / 55 / 50 —— 必须填本人的实际法定退休年龄',
                '提前退休的一次性补贴**不并入**当年综合所得、单独计税；内部退养是与领取**当月**工资合并按月度表计税，两者都不参与年度汇算'
            ],
            compute: function (v) {
                var Q = window.EuriskoEarlyRetirementQuick;
                if (!Q) return null;

                var T = function (x) {
                    return typeof calculateTaxByTaxableIncome === 'function'
                        ? calculateTaxByTaxableIncome(Math.max(0, x)).tax : 0;
                };
                var num = function (x) { var n = Number(x); return isFinite(n) ? n : 0; };

                var rules = Q.rules() || {};
                var annualDed = num(rules.early && rules.early.annualDeduction) || 60000;
                var monthlyDed = num(rules.internal && rules.internal.monthlyDeduction) || 5000;

                var variant = v.variant === 'internal' ? 'internal' : 'early';
                var age = Math.max(0, num(v.age));
                var legalAge = Math.max(0, num(v.legalAge));
                // 法定的实际期间：不是「想分几年就几年」
                var years = Math.max(0, legalAge - age);
                var months = Math.max(1, Math.round(years * 12));
                var effYears = years > 0 ? years : 1;

                var salary = Math.max(0, num(v.monthlySalary));
                var otherTaxable = Math.max(0, num(v.otherTaxable));
                var avgWage = Math.max(0, num(v.avgWage));
                var amount = Math.max(0, num(variant === 'early' ? v.subsidy : v.lumpSum));

                // —— 三种「一次性收入」的横向对照：同一笔钱，三种算法差出一个数量级 ——
                var sevTax = null;
                var Q2 = window.EuriskoSeveranceQuick;
                if (Q2) {
                    // 传 monthlyWage = 3 倍月均、years = 12，使法定上限**恰好等于**免税额度
                    // （17D-4 那条恒等式），legalCap 就不会额外截断 —— 得到纯粹的
                    // 「3 倍社平免税 + 超额部分单独适用年度表」口径。
                    sevTax = Q2.compareOf({
                        economic: amount, other: 0, avgWage: avgWage,
                        monthlyWage: avgWage / 12 * 3, years: 12, otherTaxable: 0
                    }).tax;
                }
                var compareRows = [
                    ['提前退休（真分摊）', { value: Q.earlyOf({ subsidy: amount, years: effYears }).tax, kind: 'money' },
                        { value: annualDed * years, kind: 'money' }, '6 万 × 分摊年数，年度表，乘回年数'],
                    ['内部退养（平均只为定档）',
                        { value: Q.internalOf({ lumpSum: amount, months: months, monthlySalary: salary }).tax, kind: 'money' },
                        '无（只减一次 5000）', '月均定档 + **全额**计税，月度表']
                ];
                if (sevTax !== null) {
                    compareRows.push(['离职补偿（3 倍社平免税）', { value: sevTax, kind: 'money' },
                        { value: avgWage * 3, kind: 'money' }, '超额部分单独适用年度表，**不做分摊**']);
                }

                var rows, note, primary;

                if (variant === 'early') {
                    var e = Q.earlyOf({ subsidy: amount, years: effYears });
                    var exemptCap = annualDed * years;              // 分摊免税额度 = 6 万 × 分摊年数
                    var mergedTax = T(otherTaxable + amount) - T(otherTaxable);   // 若并入当年综合所得
                    var claimed = Math.max(0, num(v.claimedYears));
                    var claimedTax = claimed > 0 ? Q.earlyOf({ subsidy: amount, years: claimed }).tax : e.tax;
                    var claimedGap = e.tax - claimedTax;            // 正数 = 自行填的年数会少算

                    primary = { label: '一次性补贴应纳个税', value: e.tax, kind: 'money',
                        hint: '分摊后每年税额 × 法定的实际年度数' };
                    rows = [
                        { label: '一次性补贴收入', value: amount, kind: 'money' },
                        { label: '分摊年度数（法定实际年度数）', value: years, kind: 'text',
                            hint: '法定退休 ' + legalAge + ' 岁 − 办理时 ' + age + ' 岁' },
                        { label: '每年分摊额', value: e.perYear, kind: 'money' },
                        { label: '分摊后年应纳税所得额', value: e.taxablePerYear, kind: 'money',
                            hint: '每年分摊额 − 6 万' },
                        { label: '适用税率', value: e.rate, kind: 'percent' },
                        { label: '每年税额', value: e.taxPerYear, kind: 'money' },
                        { label: '应纳个税合计', value: e.tax, kind: 'money' },
                        { label: '税后到手', value: amount - e.tax, kind: 'money' },
                        { label: '实际税负率', value: amount > 0 ? e.tax / amount : 0, kind: 'percent' },
                        { label: '免税额度（6 万 × 分摊年数）', value: exemptCap, kind: 'money',
                            hint: '随提前的年数**线性增长** —— 与离职补偿的固定额度不同' },
                        { label: '若不分摊（错误算法）', value: e.naiveTax, kind: 'money' },
                        { label: '分摊省下的税', value: e.spreadSaving, kind: 'money' },
                        { label: '若并入当年综合所得（错误口径）', value: mergedTax, kind: 'money' },
                        { label: '并入会多交', value: mergedTax - e.tax, kind: 'money' },
                        { label: '若按你填的 ' + claimed + ' 年分摊', value: claimedTax, kind: 'money' },
                        { label: '自行填年数的差额', value: claimedGap, kind: 'money',
                            hint: '正数 = 你填的年数会少算税（多填年数确实能少交，但年数是法定的）' }
                    ];

                    note = '提前退休：一次性补贴 ÷ 实际年度数（法定退休 ' + legalAge + ' 岁 − 办理时 ' + age
                        + ' 岁 = ' + years + ' 年）= 每年 ' + Math.round(e.perYear) + ' 元，减 6 万后按**年度**'
                        + '综合所得税率表计税，再乘回年数；**不并入**当年综合所得。'
                        + '分摊后每年减 6 万，等价于**免税额度 = 6 万 × ' + years + ' = '
                        + Math.round(exemptCap) + ' 元** —— 与离职补偿的「社平年工资 × 3」不同，这个额度随提前的年数线性增长。';
                    if (Math.abs(claimed - years) > 1e-9 && claimed > 0) {
                        note += ' 分摊年数是**法定实际年度数**，不能自己选：你填的 ' + claimed + ' 年算出 '
                            + Math.round(claimedTax) + ' 元，比法定口径' + (claimedGap > 0 ? '少算 ' : '多算 ')
                            + Math.abs(Math.round(claimedGap)) + ' 元。';
                    }
                    if (years <= 0) {
                        note = '⚠️ 办理时年龄已达法定退休年龄，不构成「提前退休」—— 请核对该填的年龄。';
                    }
                } else {
                    var i = Q.internalOf({ lumpSum: amount, months: months, monthlySalary: salary });

                    // 内部退养的临界区：与年终奖共用月度表定档，但税基是**全额**
                    var rates = window.bonusMonthlyTaxRates || [];
                    var cliffs = [];
                    var hit = null;
                    for (var k = 0; k < rates.length - 1; k++) {
                        var L = rates[k].max;
                        if (!isFinite(L)) continue;
                        var atL = (L - salary + monthlyDed) * months;      // 定档基数刚好等于 L 时的一次性收入
                        if (atL <= 0) continue;
                        var base = Math.max(0, salary + atL - monthlyDed);
                        var nx = rates[k + 1];
                        var jump = base * (nx.rate - rates[k].rate) - (nx.deduction - rates[k].deduction);
                        if (jump <= 0) continue;
                        cliffs.push([{ value: L, kind: 'money' }, { value: atL, kind: 'money' },
                            { value: jump, kind: 'money' }, { value: Math.floor(atL), kind: 'money' }]);
                        if (amount > atL && amount - atL < jump) hit = { at: atL, jump: jump, keep: Math.floor(atL) };
                    }

                    primary = { label: '内退一次性收入应纳个税', value: i.tax, kind: 'money',
                        hint: '月均额只用来定档，税基是当月工资 + 一次性收入全额' };
                    rows = [
                        { label: '内退一次性收入', value: amount, kind: 'money' },
                        { label: '所属月份数（法定折算）', value: months, kind: 'text',
                            hint: '（法定退休 ' + legalAge + ' 岁 − 办理时 ' + age + ' 岁）× 12' },
                        { label: '月均额（仅用于定档）', value: i.monthly, kind: 'money' },
                        { label: '定档基数（月均 + 当月工资 − 5000）', value: i.base, kind: 'money' },
                        { label: '适用税率', value: i.rate, kind: 'percent' },
                        { label: '计税基数（全额不摊）', value: i.taxable, kind: 'money',
                            hint: '当月工资 + 一次性收入 − 5000' },
                        { label: '应纳个税', value: i.tax, kind: 'money' },
                        { label: '税后到手', value: amount - i.tax, kind: 'money' },
                        { label: '实际税负率', value: amount > 0 ? i.tax / amount : 0, kind: 'percent' },
                        { label: '免税额度', value: '无（只减一次 5000）', kind: 'text' },
                        { label: '若误按「月均 × 月数」算', value: i.naiveTax, kind: 'money' },
                        { label: '少算的税额', value: i.naiveGap, kind: 'money' }
                    ];

                    note = '内部退养：一次性收入与领取当月工资合并，先按月均额（÷ 所属月份数 ' + months
                        + '）确定税率档，再对**全额**计税 —— 平均只为定档，不是分摊；它**没有免税额度**，'
                        + '整个一次性收入只减一次 5000 元。';
                    if (hit) {
                        note = '⚠️ 你填的一次性收入刚跨过 ' + Math.round(hit.at) + ' 元的定档临界点：'
                            + '多拿 1 元要多交约 ' + Math.round(hit.jump) + ' 元税 —— 定在 '
                            + hit.keep + ' 元反而到手更多。';
                    }
                }

                var extras = [{
                    title: '同一笔一次性收入的三种口径',
                    note: '只有你选的那一行是适用的；免税逻辑三种三种都不同，所以差别能到一个数量级',
                    table: { head: ['口径', '应纳税额', '免税额度', '计税方法'], rows: compareRows }
                }];
                if (variant === 'internal') {
                    extras.push({
                        title: '内部退养的临界区（该定在多少）',
                        note: '定档基数每跨一档，税额就按**全额**跳一次 —— 提前退休用连续的年度表，没有这个雷区',
                        table: {
                            head: ['月度档上限', '一次性收入临界', '多发 1 元多交', '建议定在'],
                            rows: cliffs
                        }
                    });
                }

                return { primary: primary, rows: rows, note: note, extras: extras };
            }
        },
        {
            // 阶段17 17D-6（v1.57.0）：个税纵深补齐的第六个（也是最后一个）场景 —— 外籍个人津补贴免税。
            //
            // 速算器 `expat` 只收一个标量 `allowanceAnnual`「全年可免税的津补贴合计」——
            // 于是**核定「哪些钱真的能免」这件事被推给了用户**，而它恰恰是这条政策最容易错的地方：
            //   ① **现金发放的补贴不能免**：八类里的前四类（住房 / 伙食 / 搬迁 / 洗衣）一律要求
            //      「以**非现金形式或实报实销形式**取得」。外企最常发的就是随工资走的**现金住房补贴** ——
            //      填进速算器的 6 万，可能一半根本不能免。deep 逐项问「取得形式」，算出真正能免的数。
            //   ② **八类之外一律不免**：车辆补贴 / 司机、俱乐部会员费、税务平衡款（tax equalization）、
            //      超标准部分……都不在名单里。速算器一个框，用户自然会一股脑全填进去。
            //   ③ **探亲费每年不超过 2 次**：填 4 次，能免的只有一半 —— 这是可以量化的一条。
            //   ④ **语言训练费 / 子女教育费 / 探亲费须经税务机关审核批准为合理的部分**，deep 在明细里标出来。
            // 还有一层是**速算器讲了结论但没讲道理**的：
            //   ⑤ 两条路径降的是**同一个**应纳税所得额，而 T(x) − T(x − a) 关于 a 单调不减 ——
            //      所以**只需要比金额，不用比税率**：金额大的那条一定更省（或一样）。
            //      用户以为要算两次税再比，其实真正的工作量全在**核定金额**上，这正是本工具在做的。
            //   ⑥ **一经选择、一个纳税年度内不得变更** —— 所以必须**年初就选对**，年中改不了；
            //      而政策**执行至 2027-12-31**，2027 是最后一个可选年度，2028 年起津补贴全额并入计税。
            // 口径仍同源：两条路径一律走 `EuriskoExpatAllowanceQuick`（税率表与到期日取注册表声明的常量）；
            // 专项附加扣除那一侧走 `EuriskoSpecialDeductionQuick`（七项标准取自 specialDeductionRules）；
            // 单笔输入与速算器逐点相等，由 tests/expat-deep.test.js 钉住。
            id: 'expat-deep', name: '外籍津补贴免税', subtitle: '逐项核定可免金额，再二选一',
            icon: 'fa-globe', status: 'deep',
            nextTools: ['expat', 'special-deduction', 'annual-settlement'],
            policyKey: 'expat-allowance',
            fields: [
                { key: 'taxableBefore', step: 'basis', label: '扣除前全年应纳税所得额（元）', type: 'money', default: 300000,
                    hint: '已减 6 万基本减除与三险一金、但**还没扣**津补贴免税 / 专项附加扣除之前的余额' },

                { key: 'items', step: 'allowance', label: '津补贴逐项（按类别与取得形式填）', type: 'repeater',
                    addLabel: '添加一项津补贴',
                    hint: '**只有八类项目、且以非现金或实报实销形式取得的**才能免 —— 逐项填才知道真正能免多少',
                    default: [
                        { kind: 'housing', amount: 60000, form: 'reimburse', times: 0 },
                        { kind: 'home', amount: 40000, form: 'reimburse', times: 4 },
                        { kind: 'education', amount: 30000, form: 'cash', times: 0 },
                        { kind: 'other', amount: 20000, form: 'reimburse', times: 0 }
                    ],
                    itemFields: [
                        { key: 'kind', label: '项目类别', type: 'select', default: 'housing', options: expatItemOptions() },
                        { key: 'amount', label: '全年金额（元）', type: 'money', default: 0, min: 0 },
                        { key: 'form', label: '取得形式', type: 'select', default: 'cash', options: [
                            { value: 'reimburse', label: '实报实销' },
                            { value: 'inkind', label: '非现金形式' },
                            { value: 'cash', label: '现金发放（不可免）' }
                        ] },
                        { key: 'times', label: '探亲次数（仅探亲费看这一栏）', type: 'number', default: 0, min: 0,
                            hint: '每年不超过 2 次；其他项目填 0 即可' }
                    ] },

                { key: 'children', step: 'special', label: '子女教育：符合条件的子女个数', type: 'number', default: 1, min: 0 },
                { key: 'housing', step: 'special', label: '住房（贷款利息与租金二选一）', type: 'select', default: 'rent',
                    options: [{ value: 'none', label: '都不享受' }, { value: 'rent', label: '住房租金' },
                        { value: 'loan', label: '住房贷款利息' }] },
                { key: 'rentTier', step: 'special', label: '租房城市档', type: 'select', default: 1,
                    options: [{ value: 1, label: '直辖市 / 省会等（1500 元/月）' },
                        { value: 2, label: '市辖区人口 > 100 万（1100 元/月）' },
                        { value: 3, label: '市辖区人口 ≤ 100 万（800 元/月）' }],
                    when: { key: 'housing', in: ['rent'] } },
                { key: 'elderly', step: 'special', label: '赡养老人', type: 'select', default: 'none',
                    options: [{ value: 'none', label: '不享受' }, { value: 'only', label: '独生子女（3000 元/月）' },
                        { value: 'shared', label: '非独生子女分摊（≤1500 元/月）' }] },
                { key: 'specialDirect', step: 'special', label: '大病医疗 / 继续教育等其他专项附加扣除（元/年）', type: 'money', default: 0,
                    hint: '大病医疗超起扣线的据实部分（限额 8 万）、学历继续教育 400 元/月、职业资格 3600 元/年' }
            ],
            steps: [
                { key: 'basis', title: '税基', why: '两条路径降的是**同一个**应纳税所得额 —— 所以只需比金额，不用比税率' },
                { key: 'allowance', title: '津补贴逐项', why: '只有八类、且非现金或实报实销的才能免；探亲费每年还不超过 2 次' },
                { key: 'special', title: '专项附加扣除对照', why: '二选一的另一条路：把它的法定金额也算准，才知道该选哪条' }
            ],
            pitfalls: [
                '**现金发放的补贴不能免**：住房 / 伙食 / 搬迁 / 洗衣费必须**以非现金形式或实报实销形式**取得 —— 随工资发的现金住房补贴不在免税范围内',
                '**八类之外一律不免**：车辆补贴与司机费用、俱乐部会员费、税务平衡款、超标准部分……都不在名单里',
                '探亲费**每年不超过 2 次**，超出次数对应的部分不免；探亲费、语言训练费、子女教育费还须**经税务机关审核批准为合理的部分**',
                '津补贴免税与专项附加扣除**二选一、不可叠加**，且**一经选择在一个纳税年度内不得变更** —— 必须年初就选对，年中不能改',
                '两条路径降的是同一个应纳税所得额，T(x) − T(x − a) 随 a 单调不减 —— **金额大的那条一定更省**，不用比税率',
                '政策**执行至 2027-12-31**：2027 是最后一个可选年度，2028 年起津补贴全额并入工资薪金计税',
                '适用于**符合居民个人条件的外籍个人**（含港澳台居民）—— 非居民个人走的是另一套（按月单独计税）'
            ],
            compute: function (v) {
                var Q = window.EuriskoExpatAllowanceQuick;
                if (!Q) return null;
                var S = window.EuriskoSpecialDeductionQuick;

                var rules = Q.rules() || {};
                var ruleItems = rules.items || [];
                var num = function (x) { var n = Number(x); return isFinite(n) ? n : 0; };
                var codes = EXPAT_ITEM_CODES;

                // 前四类必须「非现金或实报实销」；现金一律不可免
                var FORM_OK = { reimburse: true, inkind: true, cash: false };
                // 须经税务机关审核批准为合理的部分（不阻塞计算，只在明细里标出来）
                var NEED_APPROVE = { home: true, language: true, education: true };
                var HOME_MAX_TIMES = 2;      // 探亲费每年不超过 2 次

                var list = Array.isArray(v.items) ? v.items : [];
                var detail = [];
                var claimed = 0, exempt = 0;
                var cutCash = 0, cutList = 0, cutTimes = 0;

                list.forEach(function (it) {
                    it = it || {};
                    var amount = Math.max(0, num(it.amount));
                    var kind = String(it.kind || 'other');
                    var idx = codes.indexOf(kind);
                    var inList = idx >= 0 && idx < ruleItems.length;
                    var label = inList ? ruleItems[idx].label : '其他';
                    var condition = inList ? ruleItems[idx].condition : '八类之外，一律不免';

                    var formOk = inList && FORM_OK[it.form] === true;
                    var times = Math.max(0, Math.round(num(it.times)));
                    var timesFactor = (kind === 'home' && times > HOME_MAX_TIMES) ? HOME_MAX_TIMES / times : 1;

                    var okAmount = inList ? amount : 0;
                    var formAmount = formOk ? okAmount : 0;
                    var itemExempt = formAmount * timesFactor;

                    claimed += amount;
                    exempt += itemExempt;
                    cutList += amount - okAmount;
                    cutCash += okAmount - formAmount;
                    cutTimes += formAmount - itemExempt;

                    var reason = !inList ? '不在八类之内'
                        : (!formOk ? '现金发放，不符合「非现金或实报实销」' : (timesFactor < 1 ? '探亲超过 2 次，按比例核减' : '符合'));
                    detail.push([label, { value: amount, kind: 'money' }, { value: itemExempt, kind: 'money' },
                        reason + (NEED_APPROVE[kind] ? '（须经税务机关审核批准）' : '')]);
                });

                // 专项附加扣除那一侧：法定金额由 special-deduction-quick 算（七项标准不复制）
                var housing = String(v.housing || 'none');
                var specialTotal = 0;
                var specialItems = null;
                if (S) {
                    var sd = S.annualOf({
                        children: Math.max(0, num(v.children)), childShare: 100,
                        housing: housing, rentTier: v.rentTier, rentMonths: 12, loanMonths: 12,
                        elderly: String(v.elderly || 'none')
                    });
                    specialTotal = sd.totalAnnual + Math.max(0, num(v.specialDirect));
                    specialItems = sd.items;
                } else {
                    specialTotal = Math.max(0, num(v.children)) * 2000 * 12;
                }

                var cmp = Q.compareOf({
                    taxableBefore: v.taxableBefore,
                    allowanceAnnual: exempt,
                    specialAnnual: specialTotal
                });
                // 速算器口径：把填进去的金额当成全部可免
                var naive = Q.compareOf({
                    taxableBefore: v.taxableBefore,
                    allowanceAnnual: claimed,
                    specialAnnual: specialTotal
                });

                var taxableBefore = cmp.taxableBefore;
                var betterText = { allowance: '选津补贴免税', special: '选专项附加扣除', same: '两者相同' }[cmp.better] || '—';
                var pickSaved = cmp.better === 'special' ? cmp.special.saved : cmp.allowance.saved;
                var status = cmp.status;
                var daysLeft = status && status.daysLeft !== null && status.daysLeft !== undefined ? status.daysLeft : null;

                // 「以为可以叠加」的错误口径：两条路的金额一起扣。二选一是**互斥**的，
                // 所以这个数只是用来量化「搞错了会少算多少税」。
                var T = function (x) {
                    return typeof calculateTaxByTaxableIncome === 'function'
                        ? calculateTaxByTaxableIncome(Math.max(0, x)).tax : 0;
                };
                var stackedSaved = T(taxableBefore) - Math.max(0, T(taxableBefore - exempt - specialTotal));
                var bestSaved = Math.max(cmp.allowance.saved, cmp.special.saved);

                var primary = { label: '核定后可免税的津补贴（元/年）', value: exempt, kind: 'money',
                    hint: '填进来的 ' + Math.round(claimed) + ' 元里，只有这么多真正符合免税条件' };

                var rows = [
                    { label: '填进来的津补贴合计', value: claimed, kind: 'money' },
                    { label: '核定后可免合计', value: exempt, kind: 'money' },
                    { label: '核减：不在八类之内', value: cutList, kind: 'money' },
                    { label: '核减：现金发放', value: cutCash, kind: 'money' },
                    { label: '核减：探亲超过 2 次', value: cutTimes, kind: 'money' },
                    { label: '专项附加扣除合计（法定）', value: specialTotal, kind: 'money',
                        hint: '由 special-deduction-quick 按七项标准算出' },
                    { label: '建议', value: betterText, kind: 'text' },
                    { label: '选津补贴免税可省', value: cmp.allowance.saved, kind: 'money' },
                    { label: '选专项附加扣除可省', value: cmp.special.saved, kind: 'money' },
                    { label: '两者差额', value: cmp.diff, kind: 'money' },
                    { label: '月均差额', value: cmp.monthlyDiff, kind: 'money' },
                    { label: '若误以为可叠加（错误口径）', value: stackedSaved, kind: 'money',
                        hint: '两条路是**互斥**的，一起扣在多年前是常见的错法' },
                    { label: '叠加口径少算的税', value: stackedSaved - bestSaved, kind: 'money' },
                    { label: '若按填进来的金额全免（速算器口径）', value: naive.allowance.saved, kind: 'money',
                        hint: '速算器只有一个「合计」框，会把它当成全部可免' },
                    { label: '速算器口径少算的税', value: naive.allowance.saved - cmp.allowance.saved, kind: 'money' },
                    { label: '政策到期后（2028 起）多交', value: cmp.allowance.saved, kind: 'money',
                        hint: rules.expiresOn + ' 之后津补贴全额并入工资薪金计税' },
                    { label: '政策到期影响', value: cmp.afterExpiryGap, kind: 'money' }
                ];
                if (daysLeft !== null) {
                    rows.push({ label: '距政策到期', value: daysLeft + ' 天', kind: 'text',
                        hint: '剩余不足一年时，当年这一次选择更要一次选对' });
                }

                var note = '两条路径降的是**同一个**应纳税所得额（' + Math.round(taxableBefore)
                    + ' 元），所以 T(x) − T(x − a) 随金额单调不减 —— **金额大的那条一定更省**，'
                    + '不用比税率。真正的工作量在核定金额：填进来的 ' + Math.round(claimed)
                    + ' 元里，核定后可免 ' + Math.round(exempt) + ' 元（'
                    + (cutList > 0 ? '八类之外核减 ' + Math.round(cutList) + '、' : '')
                    + (cutCash > 0 ? '现金发放核减 ' + Math.round(cutCash) + '、' : '')
                    + (cutTimes > 0 ? '探亲超次核减 ' + Math.round(cutTimes) + '、' : '')
                    + '），专项附加扣除 ' + Math.round(specialTotal) + ' 元 —— 建议' + betterText + '。';
                if (naive.allowance.saved - cmp.allowance.saved > 0) {
                    note += ' 速算器只有一个「合计」框，会把它当成全部可免，'
                        + '那样会**少算税 ' + Math.round(naive.allowance.saved - cmp.allowance.saved) + ' 元**。';
                }
                note += ' 两条路**互斥**：若误以为可叠加，能省 ' + Math.round(stackedSaved)
                    + ' 元 —— 比正确口径多 ' + Math.round(stackedSaved - bestSaved) + ' 元，那是拿不到的。';
                if (daysLeft !== null && daysLeft >= 0) {
                    note += ' 政策' + rules.expiresOn + '到期（还剩 ' + daysLeft + ' 天），'
                        + '2028 年起津补贴全额并入计税 —— 每年多交约 '
                        + Math.round(cmp.allowance.saved) + ' 元。';
                } else if (daysLeft !== null) {
                    note = '⚠️ 政策已于 ' + rules.expiresOn + ' 到期：津补贴免税已不适用，只能走专项附加扣除。';
                }

                var extras = [{
                    title: '逐项核定明细',
                    note: '每一项的「能免多少」取决于类别与取得形式 —— 这一层速算器表达不出来',
                    table: { head: ['项目', '填的金额', '核定可免', '依据'], rows: detail }
                }];
                if (specialItems) {
                    var sdRows = Object.keys(specialItems).filter(function (k) { return specialItems[k] > 0; })
                        .map(function (k) { return [k, { value: specialItems[k], kind: 'money' }]; });
                    if (sdRows.length) {
                        extras.push({
                            title: '专项附加扣除构成',
                            note: '与津补贴免税二选一，不可叠加',
                            table: { head: ['项目', '年度扣除额'], rows: sdRows }
                        });
                    }
                }

                return { primary: primary, rows: rows, note: note, extras: extras };
            }
        },
        {
            // 阶段17 17B-2：**第一个带多口径对比的 spec 迁移**。
            // 原来它指向 reverse-calculation-page（index.html 一整页 + app.js 私有逻辑），
            // 现在由 deep-wizard-ui.js 按这份 spec 渲染 —— 这一步之后旧页面进入拆除期（下一小步删）。
            //
            // 它比前面 5 个 spec 多一样东西：同一个目标是**一段区间**，不是一个数。
            // 目标税负率给的是税率档位，档位内的任意收入都满足同一个税负率 —— 所以必须给出
            // 保守（档位下限）/ 均衡（解出的值）/ 激进（档位上限）三份答案让用户挑。
            // 这套能力就是上一小步落到向导里的 compare 契约：spec 只出 scenarios，
            // 切换、对比表、导出带表都由渲染器统一负责。
            //
            // 口径一字未改：compute 直接调 tax-calculator.js 抽出的 calculateReverseTaxCore，
            // 与页面版同一份内核；推导链复用 utils.js 的 buildReverseFormulaSteps。
            //
            // 另一个决定：**不保留经营所得子模式**（incomeType 固定 comprehensive）——
            // 经营所得的反向需求由「经营所得」完整测算承接，两个入口算同一件事迟早互相打架。
            id: 'reverse', name: '反向倒算', subtitle: '给定目标税负或到手，反推税前收入',
            icon: 'fa-refresh', status: 'deep',
            nextTools: ['net-salary', 'salary-tax', 'employer-cost'],
            fields: [
                // ---- 第一步：倒算目标 ----
                // 四种目标合成一个下拉：拆成「先选方式、再选金额类型」两层就多一处不一致，
                // 而内核只看 reverseType + fixedTax / fixedNet，本来就用不上第二层。
                { key: 'reverseType', step: 'target', label: '倒算方式', type: 'select', default: 'rate', options: [
                    { value: 'rate', label: '按目标税负率倒算' },
                    { value: 'monthly', label: '按月均到手倒算' },
                    { value: 'tax', label: '按目标税额倒算' },
                    { value: 'net', label: '按全年到手额倒算' }
                ] },
                { key: 'targetRate', step: 'target', label: '目标税负率', type: 'percent', default: 3,
                    when: { key: 'reverseType', in: ['rate'] },
                    hint: '全年个税 ÷ 全年税前收入。填 3 就是按最低档 3% 反推' },
                { key: 'monthlyNet', step: 'target', label: '月均到手（元/月）', type: 'money', default: 10000,
                    when: { key: 'reverseType', in: ['monthly'] } },
                { key: 'fixedAmount', step: 'target', label: '目标金额（元/年）', type: 'money', default: 30000,
                    when: { key: 'reverseType', in: ['tax', 'net'] },
                    hint: '按税额倒算时填全年个税；按到手倒算时填全年税后收入' },

                // ---- 第二步：发放与口径 ----
                { key: 'workMonths', step: 'income', label: '年工作总月数', type: 'select', default: 12,
                    options: [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map(function (m) { return { value: m, label: m + '个月' }; }),
                    hint: '学历继续教育的年额度按工作月数摊到每月' },
                { key: 'calcMode', step: 'income', label: '计算口径', type: 'select', default: 'conservative', options: [
                    { value: 'conservative', label: '保守（档位下限）' },
                    { value: 'balanced', label: '均衡（解出的值）' },
                    { value: 'aggressive', label: '激进（档位上限）' }
                ], hint: '同一目标对应一个收入区间：保守是下限、激进是上限，结果页可随时横着比' },
                { key: 'bonusIncome', step: 'income', label: '年终奖（元/年）', type: 'money', default: 0 },
                { key: 'bonusInclude', step: 'income', label: '反推的收入含年终奖', type: 'switch', default: false,
                    hint: '含年终奖时，年终奖单独计税，其余部分才按月摊' },

                // ---- 第三步：扣除项明细 ----
                // 两级勾选沿用页面版：「专项扣除」「专项附加扣除」「其他扣除」三个总开关各管一片，
                // 总开关不勾，下面的月缴额 / 分项一律不计 —— 这是页面上最容易踩、且看不出来的坑。
                { key: 'specialDeductionCheckbox', step: 'deduction', label: '缴纳社保与公积金（专项扣除）', type: 'switch', default: true },
                // 「基数 × 比例 → 月缴额」这组便利输入：17B-2 删页面前特意捞回来的。
                // v1.47.0 删经营所得页面时丢过一次同样的东西（只在 app.js + helper-functions.js 的私有函数里，
                // 页面一删就跟着没了），最后是 verify:local 变红才暴露 —— 这次先补再删。
                { key: 'socialBase', step: 'deduction', label: '社保缴费基数（元/月）', type: 'money', default: 7546,
                    when: { key: 'specialDeductionCheckbox', in: [true] },
                    hint: '填了就由它和下面三项比例算月缴额（月缴额以基数为准）；不填则自己填月缴额' },
                { key: 'pensionRate', step: 'deduction', label: '养老缴费比例', type: 'percent', default: 8,
                    when: { key: 'specialDeductionCheckbox', in: [true] } },
                { key: 'medicalRate', step: 'deduction', label: '医疗缴费比例', type: 'percent', default: 2,
                    when: { key: 'specialDeductionCheckbox', in: [true] } },
                { key: 'unemploymentRate', step: 'deduction', label: '失业缴费比例', type: 'percent', default: 0.5,
                    when: { key: 'specialDeductionCheckbox', in: [true] } },
                { key: 'housingFundBase', step: 'deduction', label: '公积金缴费基数（元/月）', type: 'money', default: 7546,
                    when: { key: 'specialDeductionCheckbox', in: [true] } },
                { key: 'housingFundRate', step: 'deduction', label: '公积金缴费比例', type: 'percent', default: 5,
                    when: { key: 'specialDeductionCheckbox', in: [true] }, hint: '各地 5%~12% 不同，按参保地口径填' },

                { key: 'pensionInsurance', step: 'deduction', label: '养老保险金（元/月）', type: 'money', default: 603.68,
                    when: { key: 'specialDeductionCheckbox', in: [true] }, hint: '＝ 社保缴费基数 × 养老比例' },
                { key: 'medicalInsurance', step: 'deduction', label: '医疗保险金（元/月）', type: 'money', default: 150.92,
                    when: { key: 'specialDeductionCheckbox', in: [true] }, hint: '＝ 社保缴费基数 × 医疗比例' },
                { key: 'unemploymentInsurance', step: 'deduction', label: '失业保险金（元/月）', type: 'money', default: 37.73,
                    when: { key: 'specialDeductionCheckbox', in: [true] }, hint: '＝ 社保缴费基数 × 失业比例' },
                { key: 'housingFund', step: 'deduction', label: '住房公积金（元/月）', type: 'money', default: 377.3,
                    when: { key: 'specialDeductionCheckbox', in: [true] }, hint: '＝ 公积金缴费基数 × 公积金比例' },

                { key: 'specialAdditionalDeductionCheckbox', step: 'deduction', label: '享受专项附加扣除', type: 'switch', default: true },
                { key: 'childrenInfantDeduction', step: 'deduction', label: '子女教育 / 3 岁以下婴幼儿照护（元/月）', type: 'money', default: 0,
                    when: { key: 'specialAdditionalDeductionCheckbox', in: [true] } },
                { key: 'elderlyDeduction', step: 'deduction', label: '赡养老人（元/月）', type: 'money', default: 0,
                    when: { key: 'specialAdditionalDeductionCheckbox', in: [true] } },
                { key: 'housingType', step: 'deduction', label: '住房扣除方式', type: 'select', default: 'rent', options: [
                    { value: 'rent', label: '住房租金' },
                    { value: 'loan', label: '住房贷款利息' }
                ], when: { key: 'specialAdditionalDeductionCheckbox', in: [true] }, hint: '租金与房贷利息**只能二选一**' },
                { key: 'rentDeduction', step: 'deduction', label: '住房租金（元/月）', type: 'money', default: 1500,
                    when: { key: 'housingType', in: ['rent'] } },
                { key: 'housingLoanDeduction', step: 'deduction', label: '住房贷款利息（元/月）', type: 'money', default: 1000,
                    when: { key: 'housingType', in: ['loan'] } },
                { key: 'educationDeduction', step: 'deduction', label: '继续教育（元/年）', type: 'money', default: 0,
                    when: { key: 'specialAdditionalDeductionCheckbox', in: [true] },
                    hint: '学历继续教育按定额扣；职业资格另勾下面那一项' },
                { key: 'educationProfessionalCheckbox', step: 'deduction', label: '职业资格继续教育（3600 元/年，一次性扣）', type: 'switch', default: false,
                    when: { key: 'specialAdditionalDeductionCheckbox', in: [true] } },
                { key: 'medicalDeduction', step: 'deduction', label: '大病医疗自付部分（元/年）', type: 'money', default: 0,
                    when: { key: 'specialAdditionalDeductionCheckbox', in: [true] },
                    hint: '只扣超过 1.5 万的部分、限额 8 万；且只在年度汇算扣，不进月度' },

                { key: 'otherDeductionCheckbox', step: 'deduction', label: '有其他扣除（年金 / 商业健康险等）', type: 'switch', default: false },
                { key: 'pensionDeductionCheckbox', step: 'deduction', label: '商业健康险', type: 'switch', default: false,
                    when: { key: 'otherDeductionCheckbox', in: [true] } },
                { key: 'pensionDeduction', step: 'deduction', label: '商业健康险（元/月）', type: 'money', default: 0,
                    when: { key: 'pensionDeductionCheckbox', in: [true] } },
                { key: 'enterpriseAnnuityCheckbox', step: 'deduction', label: '企业年金', type: 'switch', default: false,
                    when: { key: 'otherDeductionCheckbox', in: [true] } },
                { key: 'enterpriseAnnuity', step: 'deduction', label: '企业年金（元/月）', type: 'money', default: 0,
                    when: { key: 'enterpriseAnnuityCheckbox', in: [true] } },
                { key: 'insuranceOtherDeductionCheckbox', step: 'deduction', label: '其他商业保险', type: 'switch', default: false,
                    when: { key: 'otherDeductionCheckbox', in: [true] } },
                { key: 'insuranceOtherDeduction', step: 'deduction', label: '其他商业保险（元/月）', type: 'money', default: 0,
                    when: { key: 'insuranceOtherDeductionCheckbox', in: [true] } },
                { key: 'taxDeferredPensionCheckbox', step: 'deduction', label: '税延养老保险', type: 'switch', default: false,
                    when: { key: 'otherDeductionCheckbox', in: [true] } },
                { key: 'taxDeferredPension', step: 'deduction', label: '税延养老保险（元/月）', type: 'money', default: 0,
                    when: { key: 'taxDeferredPensionCheckbox', in: [true] } },
                { key: 'charitableDonationCheckbox', step: 'deduction', label: '公益性捐赠', type: 'switch', default: false,
                    when: { key: 'otherDeductionCheckbox', in: [true] } },
                { key: 'charitableDonation', step: 'deduction', label: '公益性捐赠（元/年）', type: 'money', default: 0,
                    when: { key: 'charitableDonationCheckbox', in: [true] }, hint: '扣除限额为应纳税所得额的 30%' }
            ],
            // 与 business / forward 共用同一份「基数 × 比例 → 月缴额」钩子 —— 这次是**删页面之前**补的，
            // 不像 v1.47.0 那样等门禁变红了才发现便利输入还在私有函数里。
            // 页面版还有一路反向的「手填月缴额 → 反算比例」，这里**故意不补**：
            // 两个方向互相写对方的值，在同一张表单上必然抖动（改额→改比例→再改额）。
            deriveFrom: INSURANCE_DERIVE_FROM,
            derive: insuranceDerive,
            warnings: socialBaseWarnings,
            steps: [
                { key: 'target', title: '倒算目标', why: '先定「想要什么」：目标税负率、月均到手，还是固定的税额 / 到手金额' },
                { key: 'income', title: '发放与口径', why: '同一个目标对应税率档位上的一段区间 —— 选哪一档决定最终落在区间的哪一端' },
                { key: 'deduction', title: '扣除项明细', why: '扣除项直接决定「到同样的手需要多少税前」：漏一项，就得多发一份税' }
            ],
            pitfalls: [
                '同一个税负率对应的是**一段收入区间**（税率档位），不是唯一解 —— 保守落在档位下限、激进用到上限',
                '住房租金与住房贷款利息**只能二选一**，同时享受会被税务机关驳回',
                '含年终奖时它按全年一次性奖金单独计税，与并入综合所得的口径不同：反推前先确认发放方式',
                '大病医疗只在**年度汇算**扣（超过 1.5 万的部分、限额 8 万），不进月度'
            ],
            compute: function (v) {
                if (typeof calculateReverseTaxCore !== 'function') return null;
                // spec 的驼峰键 ↔ 内核字典的「去前缀 DOM id」键：两处拼写由这一个转换互认。
                // 不写对照表 —— 表迟早漏一行，漏一行就是**静默少扣一项**，界面上完全看不出来。
                function kebab(k) { return k.replace(/[A-Z]/g, function (c) { return '-' + c.toLowerCase(); }); }
                var ded = {};
                ['specialDeductionCheckbox', 'specialAdditionalDeductionCheckbox', 'otherDeductionCheckbox',
                    'pensionInsurance', 'medicalInsurance', 'unemploymentInsurance', 'housingFund',
                    'childrenInfantDeduction', 'elderlyDeduction', 'housingType', 'rentDeduction', 'housingLoanDeduction',
                    'educationDeduction', 'medicalDeduction', 'educationProfessionalCheckbox',
                    'pensionDeductionCheckbox', 'pensionDeduction', 'enterpriseAnnuityCheckbox', 'enterpriseAnnuity',
                    'insuranceOtherDeductionCheckbox', 'insuranceOtherDeduction',
                    'taxDeferredPensionCheckbox', 'taxDeferredPension',
                    'charitableDonationCheckbox', 'charitableDonation'
                ].forEach(function (k) { ded[kebab(k)] = v[k]; });

                // tax / net 两种方式在内核里都是 target 分支（只看 fixedTax / fixedNet 哪个非 0）
                var inputData = {
                    reverseType: (v.reverseType === 'tax' || v.reverseType === 'net') ? 'target' : v.reverseType,
                    incomeType: 'comprehensive',       // 17B-2 决定：经营所得子模式不再由本工具承载
                    calcMode: v.calcMode,
                    targetRate: v.targetRate,
                    monthlyNet: v.monthlyNet,
                    fixedTax: v.reverseType === 'tax' ? v.fixedAmount : 0,
                    fixedNet: v.reverseType === 'net' ? v.fixedAmount : 0,
                    workMonths: v.workMonths,
                    bonusIncome: v.bonusIncome,
                    bonusInclude: !!v.bonusInclude
                };

                var core = calculateReverseTaxCore(inputData, ded);
                if (!core || !core.result) return null;

                var MODE_LABEL = { conservative: '保守', balanced: '均衡', aggressive: '激进' };
                var MODE_WHY = {
                    conservative: '取税率档位下限：满足目标所需的最少税前收入',
                    balanced: '按目标直接解出的应纳税所得额',
                    aggressive: '用满目标税率档位：同样税负率下能拿到的最高税前收入'
                };
                function scenario(mode) {
                    var r = core.allModeResults && core.allModeResults[mode];
                    if (!r) return null;
                    return {
                        key: mode,
                        label: MODE_LABEL[mode],
                        why: MODE_WHY[mode],
                        primary: { label: '所需税前年收入', value: r.totalIncome, kind: 'money' },
                        rows: [
                            { label: '全年个人所得税', value: r.finalTotalTax, kind: 'money' },
                            { label: '全年税后到手', value: r.calculatedNetIncome, kind: 'money' },
                            { label: '月均税前收入', value: r.monthlyIncome, kind: 'money' },
                            { label: '月均到手', value: r.monthlyNet, kind: 'money' },
                            { label: '年应纳税所得额', value: r.taxableIncome, kind: 'money' },
                            { label: '适用税率', value: r.applicableRate, kind: 'percent' }
                        ]
                    };
                }
                var scenarios = ['conservative', 'balanced', 'aggressive'].map(scenario).filter(Boolean);
                var active = scenarios.filter(function (s) { return s.key === inputData.calcMode; })[0];
                if (!active) return null;

                // 推导链：与页面版同吃 utils.js 那一份（页面删了之后这也是唯一一份）
                var steps = [];
                if (typeof buildReverseFormulaSteps === 'function') {
                    var record = (typeof buildReverseResultsRecord === 'function')
                        ? buildReverseResultsRecord(core.result, inputData, core.deductionData, core.bonusTax, core.allModeResults)
                        : null;
                    steps = record ? buildReverseFormulaSteps(record) : [];
                } else if (typeof console !== 'undefined') {
                    console.warn('[tool-registry] buildReverseFormulaSteps 未加载（utils.js），推导链面板被跳过');
                }

                return {
                    primary: active.primary,
                    rows: [
                        { label: '全年个人所得税', value: core.result.finalTotalTax, kind: 'money' },
                        { label: '全年税后到手', value: core.result.calculatedNetIncome, kind: 'money' },
                        { label: '月均税前收入', value: core.result.monthlyIncome, kind: 'money' },
                        { label: '月均到手', value: core.result.monthlyNet, kind: 'money' },
                        { label: '全年扣除合计', value: core.deductionData.totalDeduction, kind: 'money' },
                        { label: '年应纳税所得额', value: core.result.taxableIncome, kind: 'money' },
                        { label: '适用税率', value: core.result.applicableRate, kind: 'percent' },
                        { label: '年终奖税额', value: core.bonusTax, kind: 'money' }
                    ],
                    // 三份答案是区间的两个端点 + 中间解，不是说有三种算法 —— 这句话跟着结果走
                    note: '一个税负目标对应税率档位上的一段收入区间：保守落在档位下限、激进用到上限，均衡是按目标直接解出的值。三者是同一段区间的取点，不是三个不同的算法。',
                    steps: steps,
                    compare: { label: '三种口径对比', active: active.key, scenarios: scenarios }
                };
            }
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
            // 17D-1（v1.52.0）起的例外：**自带 spec 的 `-deep` 不被速算器覆盖**。
            // 完整测算版一旦比速算器多几步（劳务报酬要按次、按月算好几笔，不是一个数），
            // 共享同一份 fields 就等于把速算器复制一遍 —— 那不叫复用，叫原地踏步。
            // 口径同源改由两件事保证，而不是靠共用同一个对象：
            //   ① 计算仍然调**同一个 *-quick.js 模块**（不复制税率、不复制公式）；
            //   ② 单笔输入下的逐点对拍（tests/withholding-deep.test.js）。
            if (t.fields || t.compute) return;
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
