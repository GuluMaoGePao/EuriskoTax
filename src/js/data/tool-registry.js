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

    // 阶段17 17D-7（v1.63.0）：汇算清缴里「劳务 / 稿酬 / 特许权使用费」的中文名。
    // 同样必须放在文件最前面（DEEP_SPECS 在 TOOLS 之前求值）；名字取自 otherIncomeRules，不复制文案。
    var SETTLEMENT_OTHER_LABEL = { labor: '劳务报酬', author: '稿酬', royalty: '特许权使用费' };

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

    // 阶段17 17C-1 纵深（v1.58.0）：增值税进项的两道闸门 + 法定简易计税情形。
    //
    // 与八类津补贴同构 —— 只存**代号**（下标对应常量 entries），名字与「能不能抵」的判定
    // 一律从 `vatRules.inputRules` / `vatRules.simplifiedCases` 读，一条文案都不复制。
    // 同样必须放在文件最前面，原因见上一条注释。
    var VAT_VOUCHERS = ['special', 'customs', 'vehicle', 'toll', 'normal', 'none'];
    var VAT_USAGES = ['business', 'exempt', 'welfare', 'service', 'loss'];

    function vatInputRules() {
        return (typeof vatRules !== 'undefined' && vatRules.inputRules) || {};
    }

    function vatList(which) {
        var r = vatInputRules();
        return (which === 'voucher' ? r.vouchers : r.usages) || [];
    }

    function vatVoucherOptions() {
        return vatList('voucher').map(function (it, i) { return { value: VAT_VOUCHERS[i], label: it.label }; });
    }

    function vatUsageOptions() {
        return vatList('usage').map(function (it, i) { return { value: VAT_USAGES[i], label: it.label }; });
    }

    function vatSimplifiedOptions() {
        var items = (typeof vatRules !== 'undefined' && vatRules.simplifiedCases && vatRules.simplifiedCases.items) || [];
        return items.map(function (it) { return { value: it.key, label: it.label }; });
    }

    function vatApportionNote() {
        return vatInputRules().apportionNote || '';
    }

    // 阶段17 17C-2 纵深（v1.59.0）：企业所得税的三处「速算器收了数却没说口径」。
    // 与上面同构 —— 只存**代号**（下标 / key 对应常量 entries），判定一律从
    // `corporateIncomeTaxRules` 读，一条文案都不复制。同样必须放在文件最前面，原因见上。
    function citRules() {
        return (typeof corporateIncomeTaxRules !== 'undefined' && corporateIncomeTaxRules) || {};
    }

    function citIndustryOptions() {
        return [{ value: 'general', label: '一般行业（可加计扣除）' }].concat(
            ((citRules().rdSuperDeduction || {}).excluded || []).map(function (x) {
                return { value: x.key, label: x.label + '（负面清单，不得加计扣除）' };
            })
        );
    }

    function citNote(which) {
        var r = citRules();
        if (which === 'quarter') return (r.quarterlyAverage || {}).note || '';
        if (which === 'rd') return (r.rdSuperDeduction || {}).note || '';
        if (which === 'loss') return (r.lossCarryForward || {}).note || '';
        if (which === 'lossScope') return (r.lossCarryForward || {}).extendedScope || '';
        return '';
    }

    function citQuarterFormula() {
        return (citRules().quarterlyAverage || {}).formula || '';
    }

    // 阶段17 17C-3 纵深（v1.60.0）：社保基数核定的四处「速算器收了数却没说口径」。
    // 与上面同构 —— 文案与档次一律从 `socialInsuranceRules` 读，一条都不复制。
    // 同样必须放在文件最前面，原因见上。
    function socialRules() {
        return (typeof socialInsuranceRules !== 'undefined' && socialInsuranceRules) || {};
    }

    function socialNote(which) {
        var r = socialRules();
        if (which === 'wage') return (r.wageComposition || {}).note || '';
        if (which === 'adjust') return (r.wageComposition || {}).adjustNote || '';
        if (which === 'taxFree') return (r.housingFund || {}).taxFreeNote || '';
        if (which === 'flexible') return (r.flexible || {}).note || '';
        if (which === 'refund') return (r.flexible || {}).refundNote || '';
        if (which === 'compliance') return (r.compliance || {}).note || '';
        return '';
    }

    // 灵活就业的自选缴费档次（60% ~ 300%，读常量，不写死）
    function socialLevelOptions() {
        return ((socialRules().flexible || {}).levels || [0.6, 1, 3]).map(function (x) {
            return { value: x, label: Math.round(x * 100) + '%（社平 × ' + x + '）' };
        });
    }

    // 阶段17 17C-5 纵深（v1.61.0）：残保金与工会经费的文案同样一律从常量读，不复制一份。
    // 与上面同构，也必须放在文件最前面（DEEP_SPECS 在 TOOLS 之前求值）。
    function dfRules() {
        return (typeof disabilityFundRules !== 'undefined' && disabilityFundRules) || {};
    }

    function ufRules() {
        return (typeof unionFeeRules !== 'undefined' && unionFeeRules) || {};
    }

    function feeNote(which) {
        var d = dfRules();
        var u = ufRules();
        if (which === 'headcount') return d.headcountNote || '';
        if (which === 'wageCap') return d.wageCapNote || '';
        if (which === 'small') return (d.smallExempt || {}).note || '';
        if (which === 'ratio') return d.ratioNote || '';
        if (which === 'expiry') return d.tiersExpiryNote || '';
        if (which === 'unionWageBase') return u.wageBaseNote || '';
        if (which === 'unionNoUnion') return u.noUnionNote || '';
        if (which === 'unionDeduction') return u.deductionNote || '';
        return '';
    }

    // 工会经费「月薪阶梯」对照表用的几档工资（高薪看封顶、低薪看保底，两头都要有）
    function unionWageLadder() {
        return [3000, 4800, 8000, 24000, 30000, 50000];
    }

    // 阶段17 17C-4 纵深（v1.62.0）：附加税印花税的常量与税目选项同样一律从常量读，不复制一份。
    // 与上面同构，也必须放在文件最前面（DEEP_SPECS 在 TOOLS 之前求值）。
    function ssRules() {
        return (typeof surtaxRules !== 'undefined' && surtaxRules) || {};
    }

    function sdRules() {
        return (typeof stampDutyRules !== 'undefined' && stampDutyRules) || {};
    }

    function surtaxNote(which) {
        var r = ssRules();
        if (which === 'base') return (r.city || {}).baseNote || '';
        if (which === 'credit') return (r.creditRefund || {}).note || '';
        if (which === 'instant') return (r.instantRefund || {}).note || '';
        if (which === 'importVat') return (r.importVat || {}).note || '';
        if (which === 'halveExpiry') return '“六税两费”减半执行至 ' + ((r.halve || {}).expiresOn || '2027-12-31')
            + '；到期后若无延续文件，附加税与印花税恢复按法定税率全额征收';
        return '';
    }

    function stampNote(which) {
        var d = sdRules();
        if (which === 'overseas') return d.overseasNote || '';
        if (which === 'increment') return d.incrementNote || '';
        if (which === 'excludeVat') return d.excludeVat ? '计税依据不包括列明的增值税税款；合同里单独列明税额，能直接省下对应税率的那部分印花税' : '';
        if (which === 'mixed') return d.fromHigherWhenMixed ? '同一凭证载有两个以上税目事项的，分别列明金额的分别适用税率；未分别列明金额的，从高适用税率' : '';
        return '';
    }

    // 印花税 17 个税目的下拉项 —— 从常量读，标签里的税率读法优先用 quick 的 rateText
    // （quick 未加载时退化成只显示税目名，不影响 key）
    function stampItemOptions() {
        var Q = (typeof window !== 'undefined') ? window.EuriskoSurtaxQuick : null;
        return (sdRules().items || []).map(function (it) {
            var text = (Q && Q.rateText) ? Q.rateText(it.rate) : '';
            return { value: it.key, label: it.name + (text ? '（' + text + '）' : '') };
        });
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
            id: 'business', name: '经营所得', subtitle: '一人多家怎么汇总，亏损能不能互抵',
            icon: 'fa-briefcase', status: 'deep',
            nextTools: ['business-income', 'social-base', 'vat'],
            // 结果步由渲染器自动追加（所有完整测算都有，「计算结果」不在此重复声明）。
            //
            // 17D-11（v1.67.0）做深：原来的 spec 只认「一家个体户、成本费用逐项扣」，
            // 而经营所得最贵的三层它一层都没碰 ——
            //   ① **一人兴办两家以上企业必须汇总定档**（财税〔2000〕91号 第十二条）：
            //      分别申报会把速算扣除数扣两次、档位还偏低（实测少交 **29250**）；
            //   ② **年度经营亏损不能跨企业弥补**（第十四条第二款）：亏损企业当年计 0，
            //      亏损留在本企业逐年弥补（最长 5 年）—— 误按互抵会少算 **70000**；
            //   ③ **投资者的工资不得税前扣除**（第六条（一））、6 万费用扣除**只能选其中一家**
            //      （第十三条）、合伙企业按**分配比例**归属（第五条）。
            // 这三层都加在 business-income-quick.js 里（multiEntityOf / halveCompareOf），
            // 内核 calculateBusinessTaxCore 只加了两个**默认不生效**的可选参数
            // （ownerSalaryAddBack / profitShareRatio）—— 关掉它们必须回到内核那一个数，
            // 这条「增量不改变原样」由 tests/business-income-core.test.js 的闭环对拍钉住。
            fields: [
                { key: 'entityType', step: 'entity', label: '企业类型', type: 'select', default: 'individual',
                    options: [{ value: 'individual', label: '个体工商户' }, { value: 'sole', label: '个人独资企业' },
                        { value: 'partnership', label: '合伙企业（按分配比例）' }],
                    hint: '合伙企业以**每一个合伙人**为纳税人：按合伙协议约定的分配比例确定应纳税所得额，没约定的按合伙人数量平均（第五条）' },
                { key: 'partnershipRatio', step: 'entity', label: '你在该合伙企业的分配比例（%）', type: 'percent', default: 50,
                    when: { key: 'entityType', in: ['partnership'] },
                    hint: '合伙协议约定优先；没有约定的按合伙人数量平均计算（财税〔2000〕91号 第五条）' },
                { key: 'mode', step: 'entity', label: '征收方式', type: 'select', default: 'audited',
                    options: [{ value: 'audited', label: '查账征收' }, { value: 'assessed', label: '核定征收（按应税所得率）' }],
                    hint: '核定征收按「收入 × 应税所得率」计税：成本费用再多也不看，投资者 6 万费用与专项附加同样不能扣' },
                { key: 'profitRatio', step: 'entity', label: '核定应税所得率（%）', type: 'percent', default: 10,
                    when: { key: 'mode', in: ['assessed'] },
                    hint: '各地按行业核定：制造业 5%~15%、批发零售 4%~15%、娱乐业 15%~30%、其他 10%~30%' },
                { key: 'halve', step: 'entity', label: '享受“不超过 200 万部分减半征收”', type: 'switch', default: true,
                    hint: '财政部 税务总局公告 2023 年第 12 号，执行至 2027-12-31' },
                { key: 'hasOtherEntities', step: 'entity', label: '你今年还有别的个体户 / 个独 / 合伙份额', type: 'switch', default: true,
                    hint: '一人兴办两家以上企业（含参与兴办），年度终了必须**汇总**所有企业的应纳税所得额确定税率（第十二条）' },
                { key: 'otherEntities', step: 'entity', label: '其他企业（亏损填负数）', type: 'repeater',
                    when: { key: 'hasOtherEntities', in: [true] }, addLabel: '添加一家企业',
                    default: [{ taxable: 800000 }, { taxable: -400000 }],
                    itemFields: [
                        { key: 'taxable', label: '该企业年度应纳税所得额（元，亏损填负数）', type: 'money', default: 0 }
                    ],
                    hint: '亏损企业的亏损**不能跨企业弥补**，只能留在本企业用以后年度所得逐年弥补（最长 5 年）' },
                { key: 'ownerDeductionAt', step: 'entity', label: '投资者本人 6 万费用扣除在哪家扣', type: 'select', default: 'self',
                    when: { key: 'hasOtherEntities', in: [true] },
                    options: [{ value: 'self', label: '扣在本企业' }, { value: 'other', label: '已在其他企业扣过' }],
                    hint: '只能选**其中一家**企业的所得中扣除，不能每家都扣一次（第十三条）' },
                { key: 'income', step: 'income', label: '年度经营收入总额', type: 'money', default: 600000 },
                { key: 'cost', step: 'income', label: '年度成本', type: 'money', default: 350000 },
                { key: 'expenses', step: 'income', label: '年度费用', type: 'money', default: 50000 },
                { key: 'taxes', step: 'income', label: '年度税金', type: 'money', default: 0 },
                { key: 'losses', step: 'income', label: '年度损失', type: 'money', default: 0 },
                { key: 'otherExpenses', step: 'income', label: '其他支出', type: 'money', default: 0 },
                { key: 'previousLosses', step: 'income', label: '以前年度亏损弥补', type: 'money', default: 0, hint: '亏损可向以后年度结转，最长 5 年' },
                { key: 'ownerSalary', step: 'income', label: '给投资者本人（业主）发的工资（已计入成本费用）', type: 'money', default: 120000, min: 0,
                    hint: '投资者的工资**不得在税前扣除** —— 已列支的要调增回来（财税〔2000〕91号 第六条（一））' },
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
                { key: 'entity', title: '身份与征收方式', why: '先定两件事：是不是合伙企业（按分配比例归属）、还有没有别的企业（有就必须汇总定档）' },
                { key: 'income', title: '经营收入与成本', why: '经营所得按年计税：收入总额减成本、费用、税金与损失，才是经营利润；给业主发的工资要调增回来' },
                { key: 'deduction', title: '扣除项明细', why: '先确认有没有综合所得 —— 它决定 6 万减除与社保公积金在哪边扣，两边不能重复扣' }
            ],
            pitfalls: [
                '**一人兴办两家以上企业（含参与兴办）必须汇总**：年度终了汇总所有企业的应纳税所得额，据此确定适用税率（财税〔2000〕91号 第十二条）。分别各自申报会把速算扣除数扣两次、档位还偏低 —— 实测少交 **28250 元**',
                '**年度经营亏损不能跨企业弥补**（第十四条第二款）：亏损企业当年计 0，亏损留在本企业用以后年度所得逐年弥补、**最长 5 年**。误按「盈利 50 万 − 亏损 20 万 = 30 万」互抵，实测少算 **70000 元**',
                '**投资者的工资不得在税前扣除**（第六条（一））：给业主本人发的工资已计入成本费用的，汇算时一律调增；投资者本人的费用扣除（6 万）**只能选择在其中一家企业**扣除，不能每家都扣一次（第十三条）',
                '**合伙企业按分配比例**归属到每个合伙人，协议没约定的按合伙人数量平均（第五条）—— 不是谁拿了多少就算多少',
                '**减半减的是「不超过 200 万那部分对应的税额」**，不是全额应纳税额打五折：应纳税所得额 ≤ 200 万时两种算法恰好相等，所以这个坑只在**超过 200 万**时才现形 —— 恰恰是数字最大的那批人（300 万时差 **175000 元**）',
                '**核定征收不是「少交税」的代名词**：按「收入 × 应税所得率」计税，成本费用再多也不看，投资者 6 万费用与专项附加同样不能扣，核定期间的亏损也不得弥补 —— 实际利润率低于应税所得率 + 6 万 ÷ 年收入时，核定反而多交',
                '有综合所得时，基本减除费用与社保公积金**只能在综合所得里扣一次**，经营所得不再扣；大病医疗只扣**超过 1.5 万**的部分、限额 8 万；公益性捐赠限额为应纳税所得额的 30%',
                '减半政策执行至 **2027-12-31**；经营所得按年计算、分月或分季预缴，**年度终了后 3 个月内**汇算清缴，多退少补（第十七条）'
            ],
            compute: function (v) {
                if (typeof calculateBusinessTaxCore !== 'function') return null;
                var Q = window.EuriskoBusinessIncomeQuick;
                if (!Q) return null;

                var useHalve = v.halve !== false;
                var isAssessed = v.mode === 'assessed';
                var shareRatio = v.entityType === 'partnership' ? (Number(v.partnershipRatio) || 0) / 100 : 1;
                var ownerSalary = isAssessed ? 0 : (Number(v.ownerSalary) || 0);

                // 6 万只能扣在一家（第十三条）：已在别家扣过 → 本企业不再扣
                var ownerDeductedElsewhere = !!(v.hasOtherEntities && v.ownerDeductionAt === 'other');

                var ownTaxable, deductionTotal = 0, core = null;
                if (isAssessed) {
                    ownTaxable = Q.assessedOf({
                        revenue: Number(v.income) || 0,
                        profitRatio: (Number(v.profitRatio) || 0) / 100,
                        halve: useHalve
                    }).taxable;
                } else {
                    core = calculateBusinessTaxCore(v, {
                        ownerSalaryAddBack: ownerSalary,
                        profitShareRatio: shareRatio,
                        ownerDeductedElsewhere: ownerDeductedElsewhere
                    });
                    ownTaxable = core.taxDetails.taxableIncome;
                    deductionTotal = core.deductionDetails.total;
                }

                var others = (v.hasOtherEntities && Array.isArray(v.otherEntities))
                    ? v.otherEntities.map(function (o, i) {
                        // 亏损填负数 —— 不能用 `|| 0` 兜底，否则 -40 万会被当成 0
                        var n = Number(o && o.taxable);
                        return { name: '其他企业 ' + (i + 1), taxable: isFinite(n) ? n : 0 };
                    }) : [];
                var m = Q.multiEntityOf({ own: ownTaxable, others: others, halve: useHalve, ownName: '本企业' });
                var bracket = Q.taxBeforeHalveOf(m.aggregateTaxable);
                var halved = Q.taxOf(m.aggregateTaxable);
                var prepaid = Number(v.prepaidTax) || 0;
                var refund = halved.tax - prepaid;

                var money = function (x) { return { value: x, kind: 'money' }; };
                var pct = function (x) { return { value: x, kind: 'percent' }; };

                var rows = [
                    { label: '本企业应纳税所得额', value: ownTaxable, kind: 'money',
                        hint: isAssessed ? '核定征收：收入 × 应税所得率，不扣成本费用' : '已调增投资者工资、并按分配比例归属后的所得' },
                    { label: '汇总应纳税所得额', value: m.aggregateTaxable, kind: 'money',
                        hint: others.length ? '各企业相加，亏损企业当年计 0（不能跨企业弥补）' : '只有这一家企业，汇总数等于本企业数' },
                    { label: '适用税率', value: bracket.rate, kind: 'percent', hint: '按**汇总**数定档，不是各家各查一次' },
                    { label: '速算扣除数', value: bracket.deduction, kind: 'money' },
                    { label: '减半征收减免', value: halved.halve, kind: 'money', hint: '年应纳税所得额 200 万以内的部分减半（2023 年第 12 号，至 2027-12-31）' },
                    { label: '应纳个人所得税', value: halved.tax, kind: 'money' }
                ];
                if (m.separateGap > 0.01) {
                    rows.push({ label: '比“分别申报”多交', value: m.separateGap, kind: 'money',
                        hint: '分别申报会少交这么多 —— 那是漏报，不是筹划' });
                }
                if (m.nettingGap > 0.01) {
                    rows.push({ label: '比“亏损互抵”多交', value: m.nettingGap, kind: 'money',
                        hint: '亏损不能跨企业弥补，误按互抵会少算这么多' });
                }
                if (m.lossCarriedForward > 0) {
                    rows.push({ label: '留在原企业结转的亏损', value: m.lossCarriedForward, kind: 'money',
                        hint: '用本企业以后年度所得逐年弥补，最长 ' + m.lossCarryYears + ' 年' });
                }
                if (!isAssessed) rows.push({ label: '扣除合计', value: deductionTotal, kind: 'money' });
                rows.push({ label: '已预缴税额', value: prepaid, kind: 'money' });
                rows.push({ label: refund >= 0 ? '应补税额' : '应退税额', value: Math.abs(refund), kind: 'money' });
                rows.push({ label: '税后经营所得', value: m.aggregateTaxable - halved.tax, kind: 'money' });

                var extras = [];
                if (others.length) {
                    extras.push({
                        title: '各家企业的所得、单独申报税额与汇总口径（第十二条）',
                        note: '汇总后按各企业应纳税所得额占比分摊；亏损企业当年计 0，亏损留在本企业结转 '
                            + m.lossCarryYears + ' 年',
                        table: {
                            head: ['企业', '应纳税所得额', '单独申报税额', '汇总后分摊', '备注'],
                            rows: m.items.map(function (it) {
                                var share = m.aggregateTaxable > 0
                                    ? halved.tax * (Math.max(0, it.taxable) / m.aggregateTaxable) : 0;
                                return [it.name, money(it.taxable), money(Q.taxOf(Math.max(0, it.taxable)).tax),
                                    money(share), it.taxable < 0 ? '亏损结转，不能跨企业弥补' : ''];
                            }).concat([['合计', money(m.aggregateTaxable), money(m.separate), money(halved.tax), '']])
                        }
                    });
                }

                var halveRows = [500000, 1000000, 2000000, 3000000, 5000000].map(function (t) {
                    var c = Q.halveCompareOf(t);
                    return [money(t), money(c.before), money(c.halve), money(c.correct), money(c.byTax), money(c.byTaxable)];
                });
                extras.push({
                    title: '减半到底减的是什么（三种算法对照）',
                    note: '正确：减免 = min(应纳税所得额, 200 万) 那部分**对应的税额** × 50%；'
                        + '「应纳税额打五折」只在 ≤ 200 万时恰好相等，超过 200 万就开始少算',
                    table: {
                        head: ['应纳税所得额', '减半前税额', '减免额', '正确税额', '误：税额打五折', '误：所得额打五折'],
                        rows: halveRows
                    }
                });

                if (!isAssessed) {
                    var cmp = Q.compareOf({
                        revenue: Number(v.income) || 0,
                        cost: (Number(v.cost) || 0) + (Number(v.expenses) || 0) + (Number(v.taxes) || 0)
                            + (Number(v.losses) || 0) + (Number(v.otherExpenses) || 0) - ownerSalary,
                        previousLoss: Number(v.previousLosses) || 0,
                        specialDeduction: core ? core.deductionDetails.specialDeduction.total : 0,
                        specialAdditional: core ? core.deductionDetails.specialAdditionalDeduction.total : 0,
                        hasComprehensiveIncome: v.hasComprehensiveIncome,
                        profitRatio: (Number(v.profitRatio) || 0) / 100,
                        halve: useHalve
                    });
                    var be = Q.breakevenProfitRatioOf({
                        revenue: Number(v.income) || 0,
                        cost: (Number(v.cost) || 0) + (Number(v.expenses) || 0) + (Number(v.taxes) || 0)
                            + (Number(v.losses) || 0) + (Number(v.otherExpenses) || 0) - ownerSalary,
                        previousLoss: Number(v.previousLosses) || 0,
                        specialDeduction: core ? core.deductionDetails.specialDeduction.total : 0,
                        specialAdditional: core ? core.deductionDetails.specialAdditionalDeduction.total : 0,
                        hasComprehensiveIncome: v.hasComprehensiveIncome,
                        profitRatio: (Number(v.profitRatio) || 0) / 100,
                        halve: useHalve
                    });
                    extras.push({
                        title: '如果改成核定征收会怎样（不是必然更省）',
                        note: be ? '临界净利率约 ' + Math.round(be.ratio * 1000) / 10 + '%：高于它查账更省，低于它核定更省'
                            : '当前口径下查账在任何利润率下都不比核定差',
                        table: {
                            head: ['征收方式', '应纳税所得额', '税率', '减半减免', '税额'],
                            rows: [
                                ['查账征收', money(cmp.audited.taxable), pct(cmp.audited.rate),
                                    money(cmp.audited.halve), money(cmp.audited.tax)],
                                ['核定征收', money(cmp.assessed.taxable), pct(cmp.assessed.rate),
                                    money(cmp.assessed.halve), money(cmp.assessed.tax)]
                            ]
                        }
                    });
                }

                var note = '本企业应纳税所得额 ' + Math.round(ownTaxable) + ' 元'
                    + (others.length ? '，加上其他企业后**汇总 ' + Math.round(m.aggregateTaxable) + ' 元**定档'
                        + '（适用税率 ' + Math.round(bracket.rate * 100) + '%）' : '')
                    + '，减半减免 ' + Math.round(halved.halve) + ' 元，全年应纳个人所得税 **'
                    + Math.round(halved.tax) + ' 元**。';
                if (m.separateGap > 0.01) note += ' 按各家分别申报会少交 ' + Math.round(m.separateGap) + ' 元（漏报）；';
                if (m.nettingGap > 0.01) note += ' 把亏损拿去互抵会少算 ' + Math.round(m.nettingGap) + ' 元（不能跨企业弥补）；';
                if (isAssessed) note += ' 核定征收按「收入 × 应税所得率」计税，成本费用、投资者 6 万与专项附加一律不扣；';
                note += ' 投资者本人的工资不得税前扣除，已列支的 ' + Math.round(ownerSalary) + ' 元已调增。';

                var steps = [{
                    title: '① 本企业应纳税所得额',
                    rows: isAssessed ? [
                        { label: '收入总额', value: Number(v.income) || 0, format: 'money' },
                        { label: '应税所得率', value: (Number(v.profitRatio) || 0) / 100, format: 'percent' },
                        { label: '应纳税所得额', value: ownTaxable, format: 'money', note: '核定不扣成本费用' }
                    ] : [
                        { label: '经营利润（收入 − 成本费用损失）', value: core.incomeDetails.businessProfit, format: 'money' },
                        { label: '加：投资者工资调增', value: ownerSalary, format: 'money', note: '投资者的工资不得税前扣除（第六条（一））' },
                        { label: '减：以前年度亏损', value: Number(v.previousLosses) || 0, format: 'money' },
                        { label: shareRatio < 1 ? '× 合伙分配比例' : '投资者份额', value: shareRatio < 1 ? shareRatio : 1,
                            format: shareRatio < 1 ? 'percent' : 'text' },
                        { label: '减：扣除合计', value: deductionTotal, format: 'money' },
                        { label: '应纳税所得额', value: ownTaxable, format: 'money' }
                    ],
                    footnote: isAssessed ? '核定征收：应纳税所得额 = 收入总额 × 应税所得率（第九条）'
                        : '投资者本人的工资不得扣除；合伙企业按分配比例归属（第五条）。'
                }, {
                    title: '② 汇总定档（第十二 ~ 十四条）',
                    rows: m.items.map(function (it) {
                        return { label: it.name, value: Math.max(0, it.taxable), format: 'money',
                            note: it.taxable < 0 ? '亏损当年计 0，留在本企业结转' : '' };
                    }).concat([
                        { label: '汇总应纳税所得额', value: m.aggregateTaxable, format: 'money' },
                        { label: '适用税率', value: bracket.rate, format: 'percent' },
                        { label: '速算扣除数', value: bracket.deduction, format: 'money' }
                    ]),
                    footnote: '一人兴办两家以上企业的，年度终了汇总所有企业应纳税所得额确定税率；企业的年度亏损不能跨企业弥补。'
                }, {
                    title: '③ 减半与补退',
                    rows: [
                        { label: '减半前应纳税额', value: halved.beforeHalve, format: 'money' },
                        { label: '减：200 万以内部分减半', value: halved.halve, format: 'money' },
                        { label: '应纳个人所得税', value: halved.tax, format: 'money' },
                        { label: '已预缴税额', value: prepaid, format: 'money' },
                        { label: refund >= 0 ? '应补税额' : '应退税额', value: Math.abs(refund), format: 'money' }
                    ],
                    footnote: '财政部 税务总局公告 2023 年第 12 号，执行至 2027-12-31；年度终了后 3 个月内汇算清缴。'
                }];

                return {
                    primary: { label: '全年应纳个人所得税', value: halved.tax, kind: 'money' },
                    rows: rows, note: note, extras: extras, steps: steps
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
            // 阶段17 17D-7（v1.63.0）：个税场景完整度 **10/16 → 11/16** 的第七个场景 —— 年度汇算清缴。
            //
            // 速算器那五个输入框（月薪 / 任职月数 / 五险一金 / 专项附加 / 已预缴）
            // 只认「一处任职、全年 12 个月、只有工资」这一种人生，而汇算真正会出错的三层它一个都表达不出来：
            //   ① **基本减除费用在汇算时是年定额 6 万元，不按任职月数折算**（个税法第六条）——
            //      累计预扣法里的「5000 × 任职月数」只是**预扣**阶段的算法。年中入职 6 个月、
            //      月薪 2 万的人，汇算应纳税额 2580、已预缴 5580 → **退 3000**；速算器按 5000×6 算，
            //      得出「不补不退」—— 把退税算没了。
            //   ② **劳务报酬 / 稿酬 / 特许权使用费按「收入额」并入**（劳务、特许权 80%，稿酬 56%），
            //      预扣却最高按 40% 扣。全年劳务 10 万：预扣 25000、汇算应纳税额 600 → **退 24400**。
            //      速算器根本没有这几个框，这笔钱在它眼里不存在。
            //   ③ **大病医疗只能在汇算时扣**（平时预扣不扣），且是「超 1.5 万的部分、限额 8 万」。
            // 另外两件速算器给不出的结论：**免办判定**（补税 ≤400 元，或综合所得收入 ≤12 万元）
            // 与**年终奖两口径对照**（汇算时还能改成并入，低收入者并入往往全退）。
            //
            // 口径仍然同源：一切计算走 annual-settlement-quick 的 settlementFullOf
            // （它自己又调 withholding-quick 的收入额与预扣率、bonus-quick 的单独计税、
            //   special-deduction 常量里的大病医疗限额）—— 单段 12 个月、无劳务稿酬、无大病、
            //   无年终奖时与速算器 settlementOf 逐点相等，由 tests/annual-settlement-deep.test.js 钉住。
            id: 'annual-settlement-deep', name: '年度汇算清缴', subtitle: '多段任职 + 劳务稿酬并入 → 退补与免办判定',
            icon: 'fa-balance-scale', status: 'deep',
            nextTools: ['annual-settlement', 'salary-tax', 'withholding', 'bonus-tax'],
            policyKey: 'settlement',
            fields: [
                { key: 'jobs', step: 'income', label: '任职段（多处任职 / 年中跳槽各填一段）', type: 'repeater',
                    addLabel: '添加一段任职',
                    hint: '每一段**独立**按累计预扣法预扣：新单位不掌握上一家的累计，从 0 重新开始 —— 这就是跳槽后要补税的根源',
                    default: [{ monthlyIncome: 15000, months: 12, monthlyInsurance: 1500, monthlySpecial: 1000 }],
                    itemFields: [
                        { key: 'monthlyIncome', label: '税前月薪（元）', type: 'money', default: 15000, min: 0 },
                        { key: 'months', label: '任职月数', type: 'number', default: 12, min: 1, max: 12 },
                        { key: 'monthlyInsurance', label: '五险一金（个人 / 月）', type: 'money', default: 1500, min: 0 },
                        { key: 'monthlySpecial', label: '专项附加扣除（月）', type: 'money', default: 1000, min: 0 }
                    ] },
                { key: 'labor', step: 'income', label: '全年劳务报酬（含税）', type: 'money', default: 0, min: 0,
                    hint: '汇算按**收入额 80%** 并入；预扣阶段最高却按 40% 扣 —— 差额就是退税的来源' },
                { key: 'author', step: 'income', label: '全年稿酬（含税）', type: 'money', default: 0, min: 0,
                    hint: '汇算按**收入额 56%** 并入（减除 20% 费用后再减按 70%）' },
                { key: 'royalty', step: 'income', label: '全年特许权使用费（含税）', type: 'money', default: 0, min: 0,
                    hint: '汇算按**收入额 80%** 并入' },

                { key: 'specialOverride', step: 'deduction', label: '专项附加扣除怎么取', type: 'select', default: 'auto',
                    options: [{ value: 'auto', label: '按各任职段申报的合计' },
                        { value: 'manual', label: '我要另填全年实际享受的金额' }],
                    hint: '多处任职时，同一个项目（比如子女教育）在两家都申报了也**只能扣一份** —— 那种情况选第二项' },
                { key: 'annualSpecial', step: 'deduction', label: '全年专项附加扣除（元）', type: 'money', default: 24000, min: 0,
                    when: { key: 'specialOverride', in: ['manual'] },
                    hint: '七项合计的**全年**数：子女教育 2000 元/月 · 婴幼儿照护 2000 元/月 · 赡养老人 3000 元/月 ……' },
                { key: 'medicalSelfPay', step: 'deduction', label: '大病医疗：医保目录内个人自付累计（元）', type: 'money', default: 0, min: 0,
                    hint: '**只能在年度汇算时扣**：超过 1.5 万元的部分才可扣，年度限额 8 万元 —— 平时预扣一分钱也扣不到' },
                { key: 'otherDeduction', step: 'deduction', label: '其他扣除（元/年）', type: 'money', default: 0, min: 0,
                    hint: '个人养老金（≤12000）、企业年金 / 职业年金、税优健康险（≤2400）、商业养老保险等' },

                { key: 'bonus', step: 'bonus', label: '全年一次性奖金（元）', type: 'money', default: 0, min: 0,
                    hint: '填 0 表示没有；有奖金时下面会给出「单独计税 vs 并入综合所得」的全年税额对照' },
                { key: 'bonusDeclared', step: 'bonus', label: '汇算时怎么算这笔奖金', type: 'select', default: 'separate',
                    options: [{ value: 'separate', label: '单独计税（单位通常这么申报）' },
                        { value: 'merged', label: '并入综合所得（汇算时可以改）' }] },

                { key: 'prepaidTax', step: 'prepaid', label: '全年已预缴个税（元）', type: 'money', default: 0, min: 0,
                    hint: '填 0 则按累计预扣法自动推演；想更准就照个税 App「已申报税额合计」填（不含年终奖单独计税那部分）' }
            ],
            steps: [
                { key: 'income', title: '全年综合所得', why: '汇算的范围只有**四项**（工资薪金 / 劳务报酬 / 稿酬 / 特许权使用费）：年终奖单独计税、股权激励、离职补偿、经营所得与分类所得都不参与' },
                { key: 'deduction', title: '全年扣除', why: '汇算的减除费用是**年定额 6 万**，不按任职月数折算；大病医疗还只能在这里扣' },
                { key: 'bonus', title: '年终奖口径', why: '同一个人在「单独计税」与「并入综合所得」下全年税额可以差几千元，汇算时还能改一次' },
                { key: 'prepaid', title: '已预缴', why: '应退 / 应补 = 全年应纳税额 − 全年已预缴 —— 这一道减法就是汇算的全部' }
            ],
            pitfalls: [
                '基本减除费用在汇算时是**年定额 6 万元，不按任职月数折算** —— 年中入职 / 离职的人照样扣满 6 万，速算器那种「5000 × 月数」是预扣口径，会把退税算成 0',
                '劳务报酬 / 稿酬 / 特许权使用费并入汇算时按**收入额**（劳务、特许权 80%，稿酬 56%），预扣阶段劳务最高却按 **40%** 扣 —— 这是「一年没怎么交税却被扣了一大笔」最常见的原因',
                '**大病医疗只能在汇算时扣除**：医保目录内个人自付累计超 1.5 万的部分才可扣，限额 8 万；不办汇算就等于放弃这笔扣除',
                '已依法预缴且**需补税**，但年度综合所得收入 ≤ **12 万元**、或补税金额 ≤ **400 元**的，**无需办理**汇算；退税是权利不是义务 —— 不办理视为放弃退税，不加收滞纳金',
                '补税逾期要按日加收**万分之五**滞纳金（年化 18.25%），并可能在纳税记录中留下不良记录',
                '**年终奖单独计税与并入综合所得二选一**：收入低、扣除大的人并入往往更省（甚至全退），高收入的人通常单独计税更省 —— 汇算时还能改一次',
                '住房贷款利息与住房租金**同一年度只能二选一**；专项附加扣除忘了在 12 月确认次年信息，只是当月到手变少，**汇算时补扣不会少扣税**'
            ],
            compute: function (v) {
                var Q = window.EuriskoSettlementQuick;
                if (!Q) return null;

                var jobs = Array.isArray(v.jobs) ? v.jobs : [];
                var manual = String(v.specialOverride || 'auto') === 'manual';
                var r = Q.settlementFullOf({
                    jobs: jobs,
                    labor: v.labor, author: v.author, royalty: v.royalty,
                    annualSpecial: manual ? Number(v.annualSpecial) : undefined,
                    medicalSelfPay: v.medicalSelfPay,
                    otherDeduction: v.otherDeduction,
                    bonus: v.bonus,
                    bonusDeclared: v.bonusDeclared,
                    prepaidTax: v.prepaidTax
                });

                if (!r.jobs.length && r.otherGross <= 0 && r.bonus <= 0) {
                    return {
                        primary: { label: '应退 / 应补', value: 0, kind: 'money' },
                        rows: [],
                        note: '还没有收入：至少填一段任职（或一笔劳务报酬 / 稿酬），才会进入汇算表。',
                        steps: []
                    };
                }

                var money = function (x) { return { value: x, kind: 'money' }; };
                var abs = Math.abs(r.diff);
                var primaryLabel = r.diff < 0 ? '应退个税' : (r.diff > 0 ? '应补个税' : '不补不退');
                var ex = r.exempt;
                var late = ex.needFile ? Q.lateFeeOf(abs, 30) : null;

                var rows = [
                    { label: '汇算收入额合计', value: r.incomeAmountTotal, kind: 'money',
                        hint: '工资薪金全额 + 劳务/稿酬/特许权的**收入额**（80% / 56%）' },
                    { label: '减除费用', value: r.basicDeduction, kind: 'money', hint: '年定额 6 万元，不按任职月数折算' },
                    { label: '专项扣除（五险一金）', value: r.insuranceTotal, kind: 'money' },
                    { label: '专项附加扣除', value: r.specialTotal, kind: 'money',
                        hint: r.medical.deduction > 0 ? '含大病医疗 ' + Math.round(r.medical.deduction) + ' 元（只在汇算时扣）' : '七项合计' },
                    { label: '其他扣除', value: r.otherDeduction, kind: 'money' },
                    { label: '扣除合计', value: r.deductionTotal, kind: 'money' },
                    { label: '应纳税所得额', value: r.taxable, kind: 'money' },
                    { label: '适用税率', value: r.bracket ? r.bracket.rate : 0, kind: 'percent' },
                    { label: '全年应纳税额', value: r.annualTax, kind: 'money' },
                    { label: '全年已预缴', value: r.prepaidTax, kind: 'money',
                        hint: r.providedPrepaid ? '使用你填写的值' : '按累计预扣法推演（看个税 App「已申报税额」更准）' },
                    { label: '应退 / 应补', value: (r.diff < 0 ? '退税 ' : (r.diff > 0 ? '补税 ' : '')) + Math.round(abs) + ' 元', kind: 'text',
                        hint: '应退 / 应补 = 全年应纳税额 − 全年已预缴（负数为退税）' },
                    { label: '要不要办理', value: ex.reason, kind: 'text' }
                ];
                if (late) {
                    rows.push({ label: '若逾期 30 天办理', value: late.fee, kind: 'money',
                        hint: '滞纳金按日万分之五（年化 18.25%）= 补税额 × 0.05% × 天数' });
                }
                rows.push({ label: '速算器口径算出的退补', value: r.naive.diff, kind: 'money',
                    hint: '速算器按「5000 × 任职月数」当减除费用，且没有劳务 / 稿酬 / 大病这几个框' });
                rows.push({ label: '与速算器口径的差', value: r.naiveGap, kind: 'money',
                    hint: '这一格就是「完整测算比速算器多出来的那部分钱」' });
                if (r.bonus > 0) {
                    rows.push({ label: '年终奖：单独计税', value: r.bonusSeparateTotal, kind: 'money',
                        hint: '综合所得部分 ' + Math.round(r.bonusSeparateTotal - r.bonusTaxSeparate) + ' + 年终奖单独 ' + Math.round(r.bonusTaxSeparate) });
                    rows.push({ label: '年终奖：并入综合所得', value: r.bonusMergedTotal, kind: 'money' });
                    rows.push({ label: '年终奖怎么算更省', value: r.bonusBetter === 'merged' ? '并入综合所得' : (r.bonusBetter === 'separate' ? '单独计税' : '两者相同'), kind: 'text' });
                    rows.push({ label: '两种口径差额', value: r.bonusGap, kind: 'money' });
                }

                var extras = [];
                if (r.jobs.length) {
                    extras.push({
                        title: '任职段明细（各段独立预扣）',
                        note: '新单位不掌握上一家的累计收入，累计预扣从 0 重新开始 —— 档位被重置、速算扣除数被扣两次',
                        table: {
                            head: ['任职段', '月收入', '月数', '收入', '五险一金', '专项附加', '已预缴'],
                            rows: r.jobs.map(function (j, i) {
                                return ['第 ' + (i + 1) + ' 段', money(j.monthlyIncome), String(j.months) + ' 个月',
                                    money(j.income), money(j.insurance), money(j.special), money(j.prepaid)];
                            })
                        }
                    });
                }
                if (r.other.length) {
                    extras.push({
                        title: '劳务 / 稿酬 / 特许权：收入额折算与预扣对照',
                        note: '预扣按含税金额算、汇算按收入额算 —— 两头的口径不同，差额就是退（补）税',
                        table: {
                            head: ['所得', '含税金额', '汇算收入额', '折算率', '支付方已预扣'],
                            rows: r.other.map(function (o) {
                                return [SETTLEMENT_OTHER_LABEL[o.type] || o.type, money(o.gross), money(o.incomeAmount),
                                    Math.round(o.incomeAmount / o.gross * 100) + '%', money(o.prepaid)];
                            })
                        }
                    });
                }
                if (r.medical.selfPay > 0) {
                    extras.push({
                        title: '大病医疗扣除核定',
                        note: '医保目录内个人自付累计超 ' + Math.round(r.medical.threshold) + ' 元的部分才可扣，年度限额 '
                            + Math.round(r.medical.cap) + ' 元 —— 且只在汇算时扣',
                        table: {
                            head: ['项目', '金额'],
                            rows: [['个人自付累计', money(r.medical.selfPay)],
                                ['起扣线以下（不可扣）', money(r.medical.cutBelowThreshold)],
                                ['超过限额部分（不可扣）', money(r.medical.cutOverCap)],
                                ['汇算可扣', money(r.medical.deduction)]]
                        }
                    });
                }
                if (r.bonus > 0) {
                    extras.push({
                        title: '年终奖两口径对照（全年个税合计）',
                        note: '汇算时还能改一次：并入综合所得后，之前按单独计税扣的税一并参与清算',
                        table: {
                            head: ['口径', '全年个税合计'],
                            rows: [['单独计税（单位通常这么申报）', money(r.bonusSeparateTotal)],
                                ['并入综合所得', money(r.bonusMergedTotal)],
                                ['差额', money(r.bonusGap)]]
                        }
                    });
                }

                var note = '汇算收入额 ' + Math.round(r.incomeAmountTotal) + ' 元，扣除合计 '
                    + Math.round(r.deductionTotal) + ' 元（6 万定额 + 五险一金 ' + Math.round(r.insuranceTotal)
                    + ' + 专项附加 ' + Math.round(r.specialTotal)
                    + (r.otherDeduction > 0 ? ' + 其他扣除 ' + Math.round(r.otherDeduction) : '')
                    + '），全年应纳税额 ' + Math.round(r.annualTax) + ' 元、已预缴 ' + Math.round(r.prepaidTax)
                    + ' 元 → ' + (r.diff < 0 ? '**应退 ' + Math.round(abs) + ' 元**' : (r.diff > 0 ? '**应补 ' + Math.round(abs) + ' 元**' : '不补不退'))
                    + '。' + ex.reason + '。';
                if (Math.abs(r.naiveGap) >= 1) {
                    note += ' 速算器按「5000 × 任职月数」当减除费用、且没有劳务 / 稿酬 / 大病这几个框，'
                        + '它会算出 ' + Math.round(r.naive.diff) + ' 元 —— **差 ' + Math.round(Math.abs(r.naiveGap)) + ' 元**。';
                }
                if (r.bonus > 0) {
                    note += ' 年终奖' + (r.bonusBetter === 'merged' ? '**并入综合所得**更省' : (r.bonusBetter === 'separate' ? '**单独计税**更省' : '两种口径相同'))
                        + '（' + Math.round(r.bonusSeparateTotal) + ' vs ' + Math.round(r.bonusMergedTotal)
                        + '，差 ' + Math.round(r.bonusGap) + ' 元）。';
                }

                var steps = [{
                    title: '① 收入额：四项综合所得怎么折算',
                    rows: [
                        { label: '工资薪金（全额）', value: r.salaryIncome, format: 'money' },
                        { label: '劳务 / 稿酬 / 特许权（收入额）', value: r.otherIncomeTotal, format: 'money',
                            note: r.otherGross > 0 ? '含税 ' + Math.round(r.otherGross) + ' 元 × 折算率（劳务/特许权 80%、稿酬 56%）' : '本年没有这三项所得' },
                        { label: '并入的年终奖', value: r.bonusDeclared === 'merged' ? r.bonus : 0, format: 'money' },
                        { label: '汇算收入额合计', value: r.incomeAmountTotal, format: 'money' }
                    ]
                }, {
                    title: '② 扣除：6 万定额 + 三项扣除',
                    rows: [
                        { label: '基本减除费用（年定额）', value: r.basicDeduction, format: 'money', note: '不按任职月数折算 —— 年中入职也扣满 6 万' },
                        { label: '专项扣除（五险一金）', value: r.insuranceTotal, format: 'money' },
                        { label: '专项附加扣除', value: r.specialTotal, format: 'money',
                            note: r.medical.deduction > 0 ? '含大病医疗 ' + Math.round(r.medical.deduction) + ' 元（只在汇算时扣）' : '七项合计' },
                        { label: '其他扣除', value: r.otherDeduction, format: 'money' },
                        { label: '扣除合计', value: r.deductionTotal, format: 'money' },
                        { label: '应纳税所得额', value: r.taxable, format: 'money' }
                    ]
                }, {
                    title: '③ 应退 / 应补 = 应纳税额 − 已预缴',
                    rows: [
                        { label: '全年应纳税额', value: r.annualTax, format: 'money',
                            note: r.bracket ? '适用税率 ' + Math.round(r.bracket.rate * 100) + '%，速算扣除数 ' + r.bracket.deduction : '' },
                        { label: '全年已预缴', value: r.prepaidTax, format: 'money',
                            note: r.providedPrepaid ? '你填写的值' : '按累计预扣法推演' },
                        { label: '差额（正 = 应补，负 = 应退）', value: r.diff, format: 'money' },
                        { label: '要不要办理', value: ex.reason, format: 'text' }
                    ],
                    footnote: '已依法预缴且需补税，但年度综合所得收入 ≤ 12 万元、或补税金额 ≤ 400 元的，无需办理年度汇算（国家税务总局公告 2019 年第 44 号）。'
                }];

                return { primary: { label: primaryLabel, value: abs, kind: 'money' }, rows: rows, note: note, extras: extras, steps: steps };
            }
        },
        {
            // 阶段17 17D-8（v1.64.0）：个税场景完整度 **11/16 → 12/16** 的第八个场景 —— 专项附加扣除。
            //
            // 速算器 `special-deduction` 已经算到了「七项各能扣多少 → 少交多少税」这道减法
            // （而且它是**两段计税相减**、不是「扣除额 × 税率」）—— 但它收的是**一个**
            // 「扣除前全年应纳税所得额」，于是下面三层它一个都表达不出来：
            //   ① **夫妻之间怎么分摊**：扣除抵的是**各自**的应纳税所得额，放在税率高的
            //      一方身上才省得多。实测：夫月薪 6000（3% 档）、妻月薪 3 万（20% 档），
            //      子女教育 2.4 万全给夫只省 **144 元**（其余全浪费），给妻省 **4800 元**
            //      —— **差 4656 元**，而速算器只算一个人，这个问题它根本答不了；
            //   ② **按实际符合条件的月份累计**：年中满 3 岁 / 满 60 岁 / 毕业 / 贷款还清 /
            //      年中起租都不是满 12 个月，速算器一律按 12 个月满算（孩子年中满 3 岁，
            //      7 个月 = 14000 而不是 24000，**多算 1 万扣除**）；
            //   ③ **逐项的边际节税**：跨档时各项「单独省」之和 ≠ 合计省。
            // 另外两条法定的硬约束：赡养老人非独生子女**每人不超过 1500 元/月**、
            // 房贷利息与住房租金**同一年度只能二选一**。
            //
            // 口径同源：一切计算走 special-deduction-quick 新增的 fullOf（它自己又读
            // specialDeductionRules 的七项标准、走内核 calculateTaxByTaxableIncome 计税），
            // 单人 + 满 12 个月时与 annualOf / savingOf 逐点相等，由测试钉住。
            id: 'special-deduction-deep', name: '专项附加扣除', subtitle: '七项逐项核定 + 夫妻间怎么分摊最省',
            icon: 'fa-child', status: 'deep',
            nextTools: ['special-deduction', 'annual-settlement', 'salary-tax', 'private-pension'],
            policyKey: 'special-deduction',
            fields: [
                { key: 'selfMonthlyIncome', step: 'income', label: '本人税前月薪（元）', type: 'money', default: 15000, min: 0,
                    hint: '扣除只抵**本人**的应纳税所得额，所以夫妻两人的收入都要填，才能算出「给谁更省」' },
                { key: 'selfMonthlyInsurance', step: 'income', label: '本人五险一金（元/月）', type: 'money', default: 1500, min: 0 },
                { key: 'selfOtherDeduction', step: 'income', label: '本人其他扣除（元/年）', type: 'money', default: 0, min: 0,
                    hint: '个人养老金（≤12000）/ 企业年金 / 税优健康险（≤2400）等 —— 它们与专项附加扣除**叠加**享受' },
                { key: 'spouseMonthlyIncome', step: 'income', label: '配偶税前月薪（元）', type: 'money', default: 0, min: 0,
                    hint: '填 0 表示按单身（或配偶无综合所得）计算' },
                { key: 'spouseMonthlyInsurance', step: 'income', label: '配偶五险一金（元/月）', type: 'money', default: 0, min: 0 },
                { key: 'spouseOtherDeduction', step: 'income', label: '配偶其他扣除（元/年）', type: 'money', default: 0, min: 0 },

                { key: 'children', step: 'children', label: '子女教育：符合条件的子女个数', type: 'number', default: 1, min: 0,
                    hint: '每个子女 2000 元/月；3 岁至全日制学历教育结束' },
                { key: 'childMonths', step: 'children', label: '本年享受月数', type: 'number', default: 12, min: 0, max: 12,
                    hint: '**按实际符合条件的月份累计** —— 年中满 3 岁、年中入学都不是满 12 个月' },
                { key: 'childShare', step: 'children', label: '由谁扣除', type: 'select', default: 'auto',
                    options: [{ value: 'auto', label: '自动：谁省得多就给谁' }, { value: 'self', label: '本人 100%' },
                        { value: 'spouse', label: '配偶 100%' }, { value: 'split', label: '双方各 50%' }],
                    hint: '《暂行办法》只给这两个选项（100% 一方 或 各 50%），**选定后一个纳税年度内不得变更**' },
                { key: 'infants', step: 'children', label: '3 岁以下婴幼儿个数', type: 'number', default: 0, min: 0,
                    hint: '每个婴幼儿 2000 元/月（2023 年起由 1000 提高至 2000）' },
                { key: 'infantMonths', step: 'children', label: '本年享受月数', type: 'number', default: 12, min: 0, max: 12 },
                { key: 'infantShare', step: 'children', label: '由谁扣除', type: 'select', default: 'auto',
                    options: [{ value: 'auto', label: '自动：谁省得多就给谁' }, { value: 'self', label: '本人 100%' },
                        { value: 'spouse', label: '配偶 100%' }, { value: 'split', label: '双方各 50%' }] },

                { key: 'housing', step: 'housing', label: '住房', type: 'select', default: 'none',
                    options: [{ value: 'none', label: '不适用' }, { value: 'loan', label: '住房贷款利息（1000 元/月）' },
                        { value: 'rent', label: '住房租金（按城市档）' }],
                    hint: '**房贷利息与住房租金同一纳税年度只能二选一**，不可叠加' },
                { key: 'loanMonths', step: 'housing', label: '本年享受月数', type: 'number', default: 12, min: 0, max: 12,
                    when: { key: 'housing', in: ['loan'] },
                    hint: '1000 元/月；**同一住房贷款累计不超过 240 个月**，且一生只能享受一次首套' },
                { key: 'loanShare', step: 'housing', label: '由谁扣除', type: 'select', default: 'auto',
                    when: { key: 'housing', in: ['loan'] },
                    options: [{ value: 'auto', label: '自动：谁省得多就给谁' }, { value: 'self', label: '本人 100%' },
                        { value: 'spouse', label: '配偶 100%' }] },
                { key: 'rentTier', step: 'housing', label: '租房城市档', type: 'select', default: '1',
                    when: { key: 'housing', in: ['rent'] },
                    options: [{ value: '1', label: '直辖市 / 省会等（1500 元/月）' },
                        { value: '2', label: '市辖区户籍人口 >100 万（1100 元/月）' },
                        { value: '3', label: '其他（800 元/月）' }],
                    hint: '由**签订租赁住房合同的承租人**扣除；配偶在主要工作城市有自有住房的，视同本人有房' },
                { key: 'rentMonths', step: 'housing', label: '本年享受月数', type: 'number', default: 12, min: 0, max: 12,
                    when: { key: 'housing', in: ['rent'] } },
                { key: 'elderly', step: 'housing', label: '赡养老人', type: 'select', default: 'none',
                    options: [{ value: 'none', label: '不适用' }, { value: 'only', label: '独生子女（3000 元/月）' },
                        { value: 'shared', label: '非独生子女（与兄弟姐妹分摊）' }],
                    hint: '被赡养人年满 60 岁；**本人与配偶各自赡养各自的父母**，所以这一项不存在「给谁扣」的问题' },
                { key: 'elderlyMonths', step: 'housing', label: '本年享受月数', type: 'number', default: 12, min: 0, max: 12,
                    hint: '老人年中满 60 岁，就只从满 60 岁的那个月算起' },
                { key: 'elderlyMonthly', step: 'housing', label: '分摊月扣除额（元/月）', type: 'money', default: 1500, min: 0,
                    when: { key: 'elderly', in: ['shared'] },
                    hint: '兄弟姐妹分摊每月 3000 元的额度，**每人不超过 1500 元/月**；可平均分摊 / 约定分摊 / 指定分摊（指定分摊优先），需签书面协议' },

                { key: 'degreeMonths', step: 'other', label: '学历（学位）继续教育（月）', type: 'number', default: 0, min: 0, max: 12,
                    hint: '400 元/月，**同一学历最长 48 个月**；本科及以下可选择由父母按子女教育（2000 元/月）扣除 —— 二选一' },
                { key: 'certCount', step: 'other', label: '职业资格证书（本）', type: 'number', default: 0, min: 0,
                    hint: '取得相关证书的**当年**一次性扣 3600 元；与学历继续教育可以同时享受' },
                { key: 'medicalSelfPaid', step: 'other', label: '大病医疗：医保目录内个人自付累计（元）', type: 'money', default: 0, min: 0,
                    hint: '超 1.5 万元的部分才可扣、限额 8 万元，**只能在年度汇算时办**；本人 / 配偶 / 未成年子女的都算' },
                { key: 'medicalShare', step: 'other', label: '由谁扣除', type: 'select', default: 'auto',
                    options: [{ value: 'auto', label: '自动：谁省得多就给谁' }, { value: 'self', label: '本人' },
                        { value: 'spouse', label: '配偶' }] }
            ],
            steps: [
                { key: 'income', title: '两个人的收入基础', why: '扣除抵的是**各自**的应纳税所得额 —— 不知道两人的税率，就谈不上「给谁更省」' },
                { key: 'children', title: '子女与婴幼儿', why: '这两项是唯一允许在夫妻之间选 100% 或各 50% 的，也是最常被随手填给自己的' },
                { key: 'housing', title: '住房与赡养老人', why: '房贷利息与住房租金**二选一**；赡养老人非独生子女分摊**每人不超过 1500 元/月**' },
                { key: 'other', title: '继续教育与大病医疗', why: '学历继续教育按月累计且有 48 个月上限；职业资格只在取得当年；大病医疗只能汇算时扣' }
            ],
            pitfalls: [
                '**夫妻之间怎么分摊最省**：扣除抵的是**各自**的应纳税所得额，放在税率高的一方身上省得多 —— 实测夫月薪 6000（3% 档）、妻月薪 3 万（20% 档），子女教育 2.4 万全给夫只省 144 元、给妻省 **4800 元**，差 4656 元',
                '扣除抵的是**应纳税所得额**不是税额，「扣除额 × 税率」在跨档时必然**高估**；扣除额超过本人应纳税所得额的部分**用不上**（落到 3% 档的人扣再多也只省 3%）',
                '**按实际符合条件的月份累计**：孩子年中满 3 岁、老人年中满 60 岁、年中毕业、贷款年中还清都不是满 12 个月 —— 按 12 个月满算会高估扣除',
                '**赡养老人非独生子女每人不超过 1500 元/月**（兄弟姐妹分摊每月 3000 元的额度）；可平均分摊 / 约定分摊 / 指定分摊，**指定分摊优先**，需签订书面分摊协议',
                '**住房贷款利息与住房租金同一纳税年度只能二选一**；房贷累计不超过 240 个月且只能享受一次首套；租金由**签订租赁合同的承租人**扣除，配偶在同一城市有自住房的视同有房',
                '学历继续教育 400 元/月、同一学历最长 **48 个月**；**本科及以下可以选择由父母按子女教育 2000 元/月扣除**，两者二选一；职业资格继续教育在**取得证书当年**一次性 3600 元',
                '每年 12 月要确认次年信息；**忘了确认只是当月到手变少，汇算时补扣不会少扣税** —— 这不是损失，别为此慌'
            ],
            compute: function (v) {
                var Q = window.EuriskoSpecialDeductionQuick;
                if (!Q) return null;

                var r = Q.fullOf({
                    selfMonthlyIncome: v.selfMonthlyIncome,
                    selfMonthlyInsurance: v.selfMonthlyInsurance,
                    selfOtherDeduction: v.selfOtherDeduction,
                    spouseMonthlyIncome: v.spouseMonthlyIncome,
                    spouseMonthlyInsurance: v.spouseMonthlyInsurance,
                    spouseOtherDeduction: v.spouseOtherDeduction,
                    children: v.children, childMonths: v.childMonths, childShare: v.childShare,
                    infants: v.infants, infantMonths: v.infantMonths, infantShare: v.infantShare,
                    housing: v.housing, loanMonths: v.loanMonths, loanShare: v.loanShare,
                    rentTier: v.rentTier, rentMonths: v.rentMonths,
                    elderly: v.elderly, elderlyMonths: v.elderlyMonths, elderlyMonthly: v.elderlyMonthly,
                    degreeMonths: v.degreeMonths, certCount: v.certCount,
                    medicalSelfPaid: v.medicalSelfPaid, medicalShare: v.medicalShare
                });

                if (!r.items.length) {
                    return {
                        primary: { label: '全年可少交个税', value: 0, kind: 'money' },
                        rows: [],
                        note: '七项一项都没填：先在后面几步里选上你符合条件的项目，才会进入核定表。',
                        steps: []
                    };
                }

                var money = function (x) { return { value: x, kind: 'money' }; };
                var ownerText = function (owner) { return Q.ownerTextOf(owner, r.hasSpouse); };
                var best = r.best;
                var wasted = best.wastedSelf + best.wastedSpouse;

                var rows = [
                    { label: '七项年度扣除合计', value: r.totalAnnual, kind: 'money',
                        hint: '按月标准 × 实际享受月数 × 分摊比例核定' },
                    { label: '落在本人身上', value: best.deductionSelf, kind: 'money' }
                ];
                if (r.hasSpouse) rows.push({ label: '落在配偶身上', value: best.deductionSpouse, kind: 'money' });

                rows.push(
                    { label: '本人扣除前应纳税所得额', value: r.self.taxableBefore, kind: 'money',
                        hint: '全年工资 − 6 万 − 五险一金 − 其他扣除（不含专项附加扣除）' },
                    { label: '本人适用税率（扣除前）', value: r.self.bracket ? r.self.bracket.rate : 0, kind: 'percent' },
                    { label: '本人扣除后个税', value: best.taxSelf, kind: 'money' }
                );
                if (r.hasSpouse) {
                    rows.push(
                        { label: '配偶扣除前应纳税所得额', value: r.spouse.taxableBefore, kind: 'money' },
                        { label: '配偶适用税率（扣除前）', value: r.spouse.bracket ? r.spouse.bracket.rate : 0, kind: 'percent' },
                        { label: '配偶扣除后个税', value: best.taxSpouse, kind: 'money' }
                    );
                }
                rows.push(
                    { label: '家庭全年个税（按最省的分摊）', value: best.totalTax, kind: 'money',
                        hint: '不享受任何专项附加扣除时是 ' + Math.round(r.baselineTax) + ' 元' },
                    { label: '朴素估算（扣除额 × 税率）', value: r.totalAnnual * (r.self.bracket ? r.self.bracket.rate : 0), kind: 'money',
                        hint: '很多人这么估，但跨档时它必然高估' }
                );
                if (r.hasSpouse && Math.abs(r.splitGain) >= 1) {
                    rows.push({ label: '全给自己要多交', value: r.splitGain, kind: 'money',
                        hint: '最优分摊 vs 七项全部填在自己名下 —— 这一格就是「夫妻间怎么分」值多少钱' });
                }
                if (wasted >= 1) {
                    rows.push({ label: '扣除没用上的部分', value: wasted, kind: 'money',
                        hint: '扣除额超过本人（或配偶）应纳税所得额的部分**不产生节税**，换个分摊对象就能用上' });
                }
                if (r.housingCompare) {
                    var hc = r.housingCompare;
                    rows.push({ label: '住房二选一的另一个口径', value: hc.chosen === 'loan' ? hc.rent : hc.loan, kind: 'money',
                        hint: '房贷利息与住房租金**同一年度只能二选一**：另一个口径按你选的城市档估算，仅供判断' });
                }

                var extras = [{
                    title: '七项逐项核定（月数 × 标准 × 分摊）',
                    note: '月标准与上限全部取自 specialDeductionRules；「谁省得多就给谁」是逐个方案真算出来的',
                    table: {
                        head: ['项目', '年扣除额', '由谁扣除', '核定依据'],
                        rows: r.items.map(function (it) {
                            return [it.label, money(it.annual), ownerText(best.owners[it.key]), it.note];
                        })
                    }
                }, {
                    title: '分摊方案对照（家庭全年个税）',
                    note: '扣除抵的是**各自**的应纳税所得额 —— 同一笔扣除放在不同人身上，省下的税可以差一个数量级',
                    table: {
                        head: ['方案', '本人扣除', '配偶扣除', '家庭全年个税', '少交'],
                        rows: r.plans.slice().sort(function (a, b) { return a.totalTax - b.totalTax; }).slice(0, 4).map(function (p) {
                            return [
                                Object.keys(p.owners).map(function (k) { return ownerText(p.owners[k]); }).join(' / ') || '本人',
                                money(p.deductionSelf), money(p.deductionSpouse), money(p.totalTax), money(p.saving)
                            ];
                        })
                    }
                }, {
                    title: '逐项边际节税（去掉这一项会多交多少）',
                    note: '跨档时各项单独贡献之和 ≠ 合计节税 —— 因为后面的扣除会掉到更低的档上',
                    table: {
                        head: ['项目', '年扣除额', '这一项实际省下'],
                        rows: r.marginal.map(function (m) {
                            return [m.label, money(m.annual), money(m.contribution)];
                        })
                    }
                }];
                if (r.housingCompare) {
                    var hc2 = r.housingCompare;
                    extras.push({
                        title: '住房贷款利息 vs 住房租金（年度只能二选一）',
                        note: '两者**不可叠加**；租金通常更高，但要求你在主要工作城市没有自有住房',
                        table: {
                            head: ['口径', '年扣除额'],
                            rows: [['住房贷款利息（1000 元/月）', money(hc2.loan)],
                                ['住房租金（按所选城市档）', money(hc2.rent)],
                                ['差额', money(hc2.gap)]]
                        }
                    });
                }

                var note = '七项核定合计 ' + Math.round(r.totalAnnual) + ' 元（本人 ' + Math.round(best.deductionSelf)
                    + (r.hasSpouse ? ' + 配偶 ' + Math.round(best.deductionSpouse) : '')
                    + '），家庭全年个税 ' + Math.round(best.totalTax) + ' 元，比不享受时少交 **'
                    + Math.round(r.saving) + ' 元**。';
                if (r.hasSpouse && Math.abs(r.splitGain) >= 1) {
                    note += ' 其中「怎么分」值 ' + Math.round(r.splitGain) + ' 元 —— 全填在自己名下的话要多交这么多。';
                }
                if (wasted >= 1) {
                    note += ' 另有 ' + Math.round(wasted) + ' 元扣除**用不上**（超过本人应纳税所得额的部分不产生节税）。';
                }
                if (r.housingCompare) {
                    note += ' 房贷利息与住房租金只能二选一（本例差额 ' + Math.round(r.housingCompare.gap) + ' 元）。';
                }

                var steps = [{
                    title: '① 逐项核定：月标准 × 实际月数 × 分摊',
                    rows: r.items.map(function (it) {
                        return { label: it.label, value: it.annual, format: 'money', note: it.note + ' → ' + ownerText(best.owners[it.key]) };
                    }).concat([{ label: '年度扣除合计', value: r.totalAnnual, format: 'money' }])
                }, {
                    title: '② 扣除落到各自的应纳税所得额上',
                    rows: [{ label: '本人扣除前应纳税所得额', value: r.self.taxableBefore, format: 'money',
                        note: '全年工资 − 6 万 − 五险一金 − 其他扣除' },
                        { label: '本人扣除后', value: Math.max(0, r.self.taxableBefore - best.deductionSelf), format: 'money' },
                        { label: '本人个税', value: best.taxSelf, format: 'money' }].concat(r.hasSpouse ? [
                            { label: '配偶扣除前应纳税所得额', value: r.spouse.taxableBefore, format: 'money' },
                            { label: '配偶扣除后', value: Math.max(0, r.spouse.taxableBefore - best.deductionSpouse), format: 'money' },
                            { label: '配偶个税', value: best.taxSpouse, format: 'money' }
                        ] : [])
                }, {
                    title: '③ 家庭税负与最省的分摊',
                    rows: [
                        { label: '不享受任何专项附加扣除', value: r.baselineTax, format: 'money' },
                        { label: '按最省的分摊', value: best.totalTax, format: 'money' },
                        { label: '全年少交', value: r.saving, format: 'money' },
                        { label: '七项全部填在自己名下', value: r.allSelf.totalTax, format: 'money' },
                        { label: '「怎么分」值多少', value: r.splitGain, format: 'money' }
                    ],
                    footnote: '子女教育与婴幼儿照护只给了两个法定选项：一方 100% 或双方各 50%，选定后一个纳税年度内不得变更；赡养老人非独生子女每人不超过 1500 元/月；房贷利息与住房租金同一年度二选一。'
                }];

                return {
                    primary: { label: '全年可少交个税', value: r.saving, kind: 'money' },
                    rows: rows, note: note, extras: extras, steps: steps
                };
            }
        },
        {
            // 阶段17 17D-9（v1.65.0）：个税场景完整度 **12/16 → 13/16** 的第九个场景 —— 个人养老金。
            //
            // 三个速算器（private-pension / health-insurance / annuity）各自只算自己那一项：
            // 12000、2400、个人 4%。但**它们扣的是同一份应纳税所得额**，于是三层答不出来：
            //   ① **叠加会跨档**：三项「各自单独省」之和 ≠ 合起来省。实测月薪 1 万（扣除前
            //      4.8 万）+ 三件套满额 2.59 万：单独之和 **2592**，合并 **1617.6** —— **差 974**；
            //   ② **年金 4% 的基数不是月薪**：是**本人上年度月平均工资**（含奖金），且超过当地
            //      社平 300% 的部分**不计入**（与社保基数同源的两个坑）。实测月薪 1.5 万 + 年终奖
            //      12 万 → 上年月均 2.5 万、社平 8000 → 基数封顶 **2.4 万**，年免税 **11520**
            //      而不是按月薪算的 7200；
            //   ③ **领取环节的税三件套各不相同**：养老金按**领取额全额 3%**（本金 + 收益一起计）、
            //      年金按月领走**月度**税率表、税优健康险**赔付免税**。所以 3% 税率档的人缴
            //      个人养老金**净收益为 0**，一旦账户有收益就是**净亏**（领 1.8 万缴 540 > 省 360）。
            //
            // 口径同源：一切计算走 private-pension-quick 新增的 stackOf / personOf / itemsOf，
            // 限额读各自的 rules、计税走内核 calculateTaxByTaxableIncome，年金与领取侧复用
            // annuity-quick / health-insurance-quick；单笔输入下与 compareOf 逐点相等（测试钉住）。
            id: 'private-pension-deep', name: '个人养老金与税优三件套',
            subtitle: '养老金 12000 / 健康险 2400 / 年金 4%：扣的是同一份应纳税所得额',
            icon: 'fa-piggy-bank', status: 'deep',
            nextTools: ['private-pension', 'health-insurance', 'annuity', 'special-deduction', 'annual-settlement'],
            policyKey: 'private-pension',
            fields: [
                { key: 'selfMonthlyIncome', step: 'income', label: '本人税前月薪（元）', type: 'money', default: 15000, min: 0,
                    hint: '三项税优扣的都是**同一个**应纳税所得额，所以它必须由收入推出来，而不是让你自己填一个数' },
                { key: 'selfMonthlyInsurance', step: 'income', label: '本人五险一金（元/月）', type: 'money', default: 1500, min: 0 },
                { key: 'selfSpecialDeduction', step: 'income', label: '本人专项附加扣除（元/年）', type: 'money', default: 0, min: 0 },
                { key: 'selfOtherDeduction', step: 'income', label: '本人其他扣除（元/年）', type: 'money', default: 0, min: 0 },
                { key: 'spouseMonthlyIncome', step: 'income', label: '配偶税前月薪（元）', type: 'money', default: 0, min: 0,
                    hint: '12000 是**每个人**的额度，不是一家人的 —— 填了配偶才能算出「家里的钱该给谁缴」' },
                { key: 'spouseMonthlyInsurance', step: 'income', label: '配偶五险一金（元/月）', type: 'money', default: 0, min: 0 },
                { key: 'spouseSpecialDeduction', step: 'income', label: '配偶专项附加扣除（元/年）', type: 'money', default: 0, min: 0 },
                { key: 'spouseOtherDeduction', step: 'income', label: '配偶其他扣除（元/年）', type: 'money', default: 0, min: 0 },

                { key: 'pensionSelf', step: 'pension', label: '个人养老金：今年缴费额（元）', type: 'money', default: 12000, min: 0,
                    hint: '上限 **12000 元/年**，超额部分当年不可扣、**也不能结转到以后年度**' },
                { key: 'years', step: 'pension', label: '预计缴费年数', type: 'number', default: 10, min: 1 },
                { key: 'growthMultiple', step: 'pension', label: '预期领取额是累计缴费的几倍', type: 'number', default: 1.5, min: 1, step: 0.1,
                    hint: '领取环节的 3% 是**按领取额全额**计的（本金 + 收益一起计） —— 填 1 表示只回本金，1.5 表示连本带收益领 1.5 倍' },

                { key: 'healthPremium', step: 'other', label: '税优健康险：今年保费（元）', type: 'money', default: 2400, min: 0,
                    hint: '限额 **2400 元/年**（200 元/月），须是带「税优识别码」的合规产品；**赔付环节免税**' },
                { key: 'joinAnnuity', step: 'other', label: '是否参加企业 / 职业年金', type: 'select', default: 'no',
                    options: [{ value: 'no', label: '不参加' }, { value: 'yes', label: '参加' }] },
                { key: 'annuityPrevMonthlyWage', step: 'other', label: '本人上年度月平均工资（元）', type: 'money', default: 15000, min: 0,
                    when: { key: 'joinAnnuity', in: ['yes'] },
                    hint: '年金 4% 的基数**不是当月工资**：是本人**上年度月平均工资**，含奖金津贴 —— 与社保缴费基数同一个口径' },
                { key: 'annuitySocialAverage', step: 'other', label: '当地上年度职工月平均工资（元）', type: 'money', default: 8000, min: 0,
                    when: { key: 'joinAnnuity', in: ['yes'] },
                    hint: '基数封顶：超过社平 **300%** 的部分不计入缴费基数' },
                { key: 'personalRate', step: 'other', label: '个人缴费比例（%）', type: 'percent', default: 4, min: 0,
                    when: { key: 'joinAnnuity', in: ['yes'] },
                    hint: '不超过 **4%** 的部分当期从应纳税所得额中扣除；**超过 4% 的部分要并入工资计税**' },
                { key: 'employerRate', step: 'other', label: '单位缴费比例（%）', type: 'percent', default: 8, min: 0,
                    when: { key: 'joinAnnuity', in: ['yes'] },
                    hint: '单位缴费是**递延**不是免税 —— 计入个人账户时暂不纳税，领取时照样要交' },
                { key: 'monthlyWithdraw', step: 'other', label: '预计月领取额（元）', type: 'money', default: 2000, min: 0,
                    when: { key: 'joinAnnuity', in: ['yes'] },
                    hint: '年金领取按**月度**税率表单独计税，不并入综合所得、不参与汇算' }
            ],
            steps: [
                { key: 'income', title: '两个人的应纳税所得额', why: '三项税优扣的都是同一个数，先把它从收入里推出来 —— 也才能算「家里的钱该给谁缴」' },
                { key: 'pension', title: '个人养老金', why: '12000 的额度、领取时 3% 的税 —— 后者按**领取额全额**计，本金和收益一起算' },
                { key: 'other', title: '税优健康险与企业年金', why: '健康险 2400 且赔付免税；年金 4% 的基数是**上年度月平均工资**且封顶社平 3 倍，超 4% 还要并回工资' }
            ],
            pitfalls: [
                '**三项扣的是同一份应纳税所得额，叠加会跨档**：各自单独省之和 ≠ 合起来省。实测月薪 1 万（扣除前 4.8 万）+ 三件套满额 2.59 万：单独之和 2592、合并 **1617.6**，差 974',
                '**年金 4% 的基数不是月薪**：是本人**上年度月平均工资**（含奖金），且超过当地社平 **300%** 的部分不计入。月薪 1.5 万 + 年终奖 12 万 → 上年月均 2.5 万、社平 8000 → 基数封顶 2.4 万，年免税 **11520** 而不是按月薪算的 7200',
                '个人缴费**超过 4% 的部分要并入工资计税**（税后扣缴、照常进账户），不是「多缴多免税」',
                '**领取环节三件套各不相同**：个人养老金按**领取额全额 × 3%**（本金 + 收益一起计）、年金按月领走**月度**税率表、税优健康险**赔付免税**',
                '**3% 税率档的人缴个人养老金净收益为 0**（现在省 3%、将来领取得缴 3%），账户一旦有收益就是净亏 —— 实测领 1.8 万（1.5 倍）缴 540 > 省 360',
                '12000 是**每个人**的额度（夫妻各自 12000），且**当年有效、不结转**；当年忘了缴不能补到次年',
                '当年没扣也不用慌：个人养老金可以在**次年汇算时**填报扣除（3 月 1 日 — 6 月 30 日），税额一样不少'
            ],
            compute: function (v) {
                var Q = window.EuriskoPrivatePensionQuick;
                if (!Q) return null;

                var r = Q.stackOf({
                    selfMonthlyIncome: v.selfMonthlyIncome,
                    selfMonthlyInsurance: v.selfMonthlyInsurance,
                    selfSpecialDeduction: v.selfSpecialDeduction,
                    selfOtherDeduction: v.selfOtherDeduction,
                    spouseMonthlyIncome: v.spouseMonthlyIncome,
                    spouseMonthlyInsurance: v.spouseMonthlyInsurance,
                    spouseSpecialDeduction: v.spouseSpecialDeduction,
                    spouseOtherDeduction: v.spouseOtherDeduction,
                    pensionSelf: v.pensionSelf,
                    years: v.years,
                    growthMultiple: v.growthMultiple,
                    healthPremium: v.healthPremium,
                    joinAnnuity: v.joinAnnuity,
                    annuityPrevMonthlyWage: v.annuityPrevMonthlyWage,
                    annuitySocialAverage: v.annuitySocialAverage,
                    personalRate: (Number(v.personalRate) || 0) / 100,
                    employerRate: (Number(v.employerRate) || 0) / 100,
                    monthlyWithdraw: v.monthlyWithdraw
                });

                if (!r.items.length) {
                    return {
                        primary: { label: '今年可少交个税', value: 0, kind: 'money' },
                        rows: [],
                        note: '三项一项都没填：先把个人养老金 / 税优健康险 / 企业年金填上一个，才会进入核定表。',
                        steps: []
                    };
                }

                var money = function (x) { return { value: x, kind: 'money' }; };
                var rows = [
                    { label: '本人扣除前应纳税所得额', value: r.self.taxableBefore, kind: 'money',
                        hint: '全年工资 − 6 万 − 五险一金 − 专项附加扣除 − 其他扣除' },
                    { label: '本人适用税率（扣除前）', value: r.self.bracket ? r.self.bracket.rate : 0, kind: 'percent' },
                    { label: '三项合计可扣除', value: r.totalDeductible, kind: 'money' },
                    { label: '扣除后应纳税所得额', value: r.taxableAfter, kind: 'money' },
                    { label: '三项合计少交', value: r.savingCombined, kind: 'money',
                        hint: '合并扣除后的真实节税（不是「扣除额 × 税率」）' },
                    { label: '三项各自单算之和', value: r.separateSum, kind: 'money',
                        hint: '三个速算器各算各的口径 —— 叠加跨档时它必然高估' },
                    { label: '叠加跨档的差额', value: r.stackingGap, kind: 'money',
                        hint: '单独之和 − 合并实际：差额越大说明跨档越多' }
                ];
                if (r.totalAddBack > 0) {
                    rows.push({ label: '年金超 4% 并入工资', value: r.totalAddBack, kind: 'money',
                        hint: '超过基数 4% 的部分要并入工资计税，税后扣缴、照常进账户' });
                }
                var annuityItem = r.items.filter(function (it) { return it.key === 'annuity'; })[0];
                if (annuityItem) {
                    rows.push({ label: '年金缴费基数（月）', value: annuityItem.base, kind: 'money',
                        hint: '上年度月平均工资，封顶社平 3 倍 = ' + Math.round(annuityItem.baseCap) + ' 元'
                            + (annuityItem.baseCapped ? '（已封顶）' : '') });
                }
                if (r.items.some(function (it) { return it.key === 'pension'; })) {
                    rows.push(
                        { label: '养老金缴费期累计节税', value: r.pensionSavedYears, kind: 'money',
                            hint: r.years + ' 年累计' },
                        { label: '领取时按 3% 计税', value: r.pensionWithdrawTax, kind: 'money',
                            hint: '领取额 ' + Math.round(r.pensionWithdrawTotal) + ' 元 × 3%（本金 + 收益一起计）' },
                        { label: '养老金净优惠', value: r.pensionNetBenefit, kind: 'money',
                            hint: '缴费期累计节税 − 领取时交的税' },
                        { label: '划算的领取额上限', value: r.breakEvenWithdraw, kind: 'money',
                            hint: '领取额超过这个数，净优惠就转负（≈ 累计缴费的 ' + r.breakEvenMultiple.toFixed(2) + ' 倍）' }
                    );
                    if (!r.worthIt) {
                        rows.push({ label: '是否划算', value: '不划算（当前税率 ≤ 3%）', kind: 'text' });
                    }
                }

                var extras = [{
                    title: '三件套逐项核定（限额 / 可扣 / 领取环节）',
                    note: '年限额全部读各自的 rules；年金基数按「上年度月平均工资、封顶社平 3 倍」自己算',
                    table: {
                        head: ['项目', '年缴费', '可扣除', '领取环节的税'],
                        rows: r.items.map(function (it) {
                            return [it.label, money(it.contribution), money(it.deductible), it.withdrawNote];
                        })
                    }
                }, {
                    title: '叠加 vs 各自单算（跨档时两者不等）',
                    note: '三项扣的是**同一个**应纳税所得额 —— 合成一笔之后可能掉到更低的档上',
                    table: {
                        head: ['项目', '可扣除', '单独算', '合并后的实际贡献'],
                        rows: r.marginal.map(function (m) {
                            var sep = r.separate.filter(function (s) { return s.key === m.key; })[0];
                            return [m.label, money(m.deductible), money(sep ? sep.saving : 0), money(m.contribution)];
                        }).concat([['合计', money(r.totalDeductible), money(r.separateSum), money(r.savingCombined)]])
                    }
                }, {
                    title: '领取环节三件套对照',
                    note: '缴费环节都是「暂不征税」，差别全在领取：3% 全额 / 月度税率表 / 免税',
                    table: {
                        head: ['项目', '领取口径', '预计领取额', '领取时交税'],
                        rows: r.items.map(function (it) {
                            if (it.key === 'pension') {
                                return ['个人养老金', '领取额全额 × 3%', money(r.pensionWithdrawTotal), money(r.pensionWithdrawTax)];
                            }
                            if (it.key === 'annuity' && r.annuity) {
                                return ['企业 / 职业年金', '按月领取 × 月度税率表', money(r.annuity.accountTotal),
                                    money(r.annuity.withdrawTaxTotal)];
                            }
                            if (it.key === 'health') {
                                return ['税优健康险', '保险赔款免征个税', money(0), money(0)];
                            }
                            return [it.label, '—', money(0), money(0)];
                        })
                    }
                }];
                if (r.hasSpouse && r.plans.length > 1) {
                    extras.push({
                        title: '家里的 12000 该给谁缴（每人各 12000，本人只能扣本人的）',
                        note: '个人养老金**不能由配偶代扣** —— 所以「谁缴」决定「省多少」，放在税率高的一方身上才省得多',
                        table: {
                            head: ['投法', '本人缴', '配偶缴', '家庭全年个税', '少交'],
                            rows: r.plans.map(function (p) {
                                return [p.label, money(p.pensionSelf), money(p.pensionSpouse), money(p.totalTax), money(p.saving)];
                            })
                        }
                    });
                }

                var note = '三项合计可扣 ' + Math.round(r.totalDeductible) + ' 元，今年少交 **'
                    + Math.round(r.savingCombined) + ' 元**（三个速算器各算各的会给出 ' + Math.round(r.separateSum)
                    + ' 元，叠加跨档差 ' + Math.round(r.stackingGap) + ' 元）。';
                if (r.items.some(function (it) { return it.key === 'pension'; })) {
                    note += ' 养老金 ' + r.years + ' 年累计节税 ' + Math.round(r.pensionSavedYears)
                        + ' 元，领取时（按 ' + r.multiple + ' 倍估算）交 ' + Math.round(r.pensionWithdrawTax)
                        + ' 元，净优惠 **' + Math.round(r.pensionNetBenefit) + ' 元**';
                    if (!r.worthIt) note += '（当前税率 ≤ 3%，这个数随账户收益增大而转负）';
                    note += '。';
                }
                if (r.hasSpouse && r.plans.length > 1) {
                    note += ' 家里的额度给 **' + (r.bestPlan.key === 'both' ? '两个人各缴满' : (r.bestPlan.key === 'spouse' ? '配偶' : '本人'))
                        + '** 最省。';
                }

                var steps = [{
                    title: '① 三项各自核定（限额内的部分才可扣）',
                    rows: r.items.map(function (it) {
                        return { label: it.label, value: it.deductible, format: 'money', note: it.note };
                    }).concat([{ label: '合计可扣除', value: r.totalDeductible, format: 'money' }])
                }, {
                    title: '② 从同一份应纳税所得额里合并扣除',
                    rows: [
                        { label: '扣除前应纳税所得额', value: r.self.taxableBefore, format: 'money' },
                        { label: '合并扣除后', value: r.taxableAfter, format: 'money' },
                        { label: '合并口径少交', value: r.savingCombined, format: 'money' },
                        { label: '三项各自单算之和', value: r.separateSum, format: 'money' },
                        { label: '跨档差额', value: r.stackingGap, format: 'money' }
                    ],
                    footnote: '叠加会跨档，所以「各自单独省」之和 ≠ 合计省；年金超过基数 4% 的部分还要并回工资计税。'
                }, {
                    title: '③ 领取环节与净优惠',
                    rows: r.items.filter(function (it) { return it.key === 'pension'; }).length ? [
                        { label: '缴费期累计节税', value: r.pensionSavedYears, format: 'money' },
                        { label: '预计领取额', value: r.pensionWithdrawTotal, format: 'money' },
                        { label: '领取时按 3% 计税', value: r.pensionWithdrawTax, format: 'money' },
                        { label: '净优惠', value: r.pensionNetBenefit, format: 'money' },
                        { label: '划算的领取额上限', value: r.breakEvenWithdraw, format: 'money' }
                    ] : [{ label: '未填个人养老金', value: 0, format: 'money' }],
                    footnote: '个人养老金按领取额**全额** 3%（本金 + 收益一起计）；年金按月领走月度税率表；税优健康险赔付免税。'
                }];

                return {
                    primary: { label: '今年三项合计可少交个税', value: r.savingCombined, kind: 'money' },
                    rows: rows, note: note, extras: extras, steps: steps
                };
            }
        },
        {
            // 阶段17 17D-10（v1.66.0）：个税场景完整度 **13/16 → 14/16** 的第十个场景 —— 公益捐赠。
            //
            // 20 个速算器里**没有一个**能算捐赠：它不是一个所得项目，而是**横跨综合所得、
            // 经营所得、分类所得三个所得项目**的一项扣除。而它最贵的一层恰恰是「**先扣哪一项**」：
            //   ① **扣除顺序由纳税人自行决定**（99 号公告三（三）），且各项目税率不同 —— 实测
            //      同一笔 5 万捐赠：先扣分类（20%）→ 经营 → 综合，省 **8000**；先扣综合（3% 档）
            //      → 经营 → 分类，只省 **4244** —— **差 3756**；
            //   ② **捐赠额 ≠ 你想捐的那个数**：货币按实际捐赠额，**股权 / 房产按财产原值**
            //      （不是市值）。实测房产市值 500 万、原值 200 万 → 捐赠额是 **200 万**；
            //   ③ **限额 = 各项目应纳税所得额 × 30%**（不是收入的 30%），分类所得按**当月**；
            //      一个项目扣不完的**可以在其他项目继续扣**（不是作废），但超出全部限额的
            //      部分个人**不结转以后年度**（企业可结转 3 年 —— 最常被混用的两条）；
            //   ④ **核定征收的经营所得不扣捐赠**、两处工资**只能选一处且当年不得变更**、
            //      劳务 / 稿酬 / 特许权**预扣时不扣**、追补与补票据都是 **90 日**。
            //
            // 它没有同名速算器可复用（与 business / forward / reverse / classification 同类），
            // 口径同源由 `donation-quick.js` + 单笔输入逐点对拍守护（见 tests/donation-deep.test.js）。
            id: 'donation', name: '公益慈善捐赠扣除',
            subtitle: '同一笔捐赠，先扣哪一项一年能差 3756 元',
            icon: 'fa-heart', status: 'deep',
            nextTools: ['special-deduction', 'annual-settlement', 'business-income'],
            policyKey: 'donation',
            fields: [
                { key: 'donateKind', step: 'donate', label: '捐赠什么', type: 'select', default: 'cash',
                    options: [{ value: 'cash', label: '货币' }, { value: 'equity', label: '股权' },
                        { value: 'house', label: '房产' }, { value: 'other', label: '其他非货币性资产' }],
                    hint: '捐赠额**不是**你想捐的那个数：股权与房产按**财产原值**，其他非货币性资产按市场价格' },
                { key: 'cashAmount', step: 'donate', label: '实际捐赠金额（元）', type: 'money', default: 50000, min: 0,
                    when: { key: 'donateKind', in: ['cash'] }, hint: '货币性资产按实际捐赠金额确定' },
                { key: 'equityCost', step: 'donate', label: '股权的财产原值（元）', type: 'money', default: 1000000, min: 0,
                    when: { key: 'donateKind', in: ['equity'] }, hint: '按财产原值确定 —— 不是现在的市值' },
                { key: 'equityMarketValue', step: 'donate', label: '股权当前市值（元，仅对照）', type: 'money', default: 3000000, min: 0,
                    when: { key: 'donateKind', in: ['equity'] } },
                { key: 'houseCost', step: 'donate', label: '房产的财产原值（元）', type: 'money', default: 2000000, min: 0,
                    when: { key: 'donateKind', in: ['house'] }, hint: '按财产原值确定 —— 不是现在的市值' },
                { key: 'houseMarketValue', step: 'donate', label: '房产当前市值（元，仅对照）', type: 'money', default: 5000000, min: 0,
                    when: { key: 'donateKind', in: ['house'] } },
                { key: 'otherMarketValue', step: 'donate', label: '非货币性资产的市场价格（元）', type: 'money', default: 300000, min: 0,
                    when: { key: 'donateKind', in: ['other'] } },
                { key: 'fullDeduction', step: 'donate', label: '是否属于国务院规定的全额扣除情形', type: 'select', default: 'no',
                    options: [{ value: 'no', label: '按 30% 限额扣除' }, { value: 'yes', label: '可全额税前扣除' }],
                    hint: '同时发生按 30% 扣除与全额扣除的，**扣除次序自行选择**' },

                { key: 'comprehensiveTaxable', step: 'income', label: '综合所得应纳税所得额（元，捐赠前）', type: 'money', default: 36000, min: 0,
                    hint: '限额按**应纳税所得额**算，不是收入 —— 已扣完 6 万与五险一金、专项附加之后的那个数' },
                { key: 'comprehensiveBasis', step: 'income', label: '上面这个数是', type: 'select', default: 'year',
                    options: [{ value: 'year', label: '全年（居民个人）' }, { value: 'month', label: '当月（非居民个人）' }] },
                { key: 'businessTaxable', step: 'income', label: '经营所得应纳税所得额（元，捐赠前）', type: 'money', default: 300000, min: 0,
                    hint: '个体户 / 个人独资 / 合伙企业的自然人合伙人填这一栏' },
                { key: 'businessVerified', step: 'income', label: '经营所得是否核定征收', type: 'select', default: 'no',
                    options: [{ value: 'no', label: '查账征收' }, { value: 'yes', label: '核定征收' }],
                    hint: '核定征收的经营所得**不扣除**公益捐赠（99 号公告六（四））' },
                { key: 'classificationTaxable', step: 'income', label: '当月分类所得应纳税所得额（元）', type: 'money', default: 100000, min: 0,
                    hint: '财产租赁 / 财产转让 / 利息股息红利 / 偶然所得 —— 限额按**当月**算，不是全年' },
                { key: 'classificationType', step: 'income', label: '分类所得项目', type: 'select', default: 'accidental',
                    options: [{ value: 'accidental', label: '偶然所得' }, { value: 'transfer', label: '财产转让所得' },
                        { value: 'rent', label: '财产租赁所得' }, { value: 'interest', label: '利息、股息、红利所得' }] },

                { key: 'residency', step: 'special', label: '纳税人身份', type: 'select', default: 'resident',
                    options: [{ value: 'resident', label: '居民个人' }, { value: 'non-resident', label: '非居民个人' }],
                    hint: '非居民按捐赠**当月**应纳税所得额的 30% 扣除，扣不完的可以在经营所得中继续扣除' },
                { key: 'employerCount', step: 'special', label: '工资薪金任职单位数', type: 'select', default: '1',
                    options: [{ value: '1', label: '一处' }, { value: '2', label: '两处以上' }],
                    hint: '两处以上取得工资薪金的，只能选择其中一处扣除，**选择后当年不得变更**' },
                { key: 'hasReceipt', step: 'special', label: '是否已取得捐赠票据', type: 'select', default: 'yes',
                    options: [{ value: 'yes', label: '已取得' }, { value: 'no', label: '尚未取得（先凭银行支付凭证）' }],
                    hint: '未取得的可先凭银行支付凭证扣除，须在捐赠之日起 **90 日**内补充提供票据；票据留存 5 年' }
            ],
            steps: [
                { key: 'donate', title: '这笔捐赠按多少算', why: '捐赠额不是票面那个数 —— 股权与房产按**财产原值**，其他非货币性资产按市场价格' },
                { key: 'income', title: '三个所得项目各能扣多少', why: '限额是各项目**应纳税所得额**的 30%，且分类所得按**当月** —— 三项各自的额度决定了顺序怎么排' },
                { key: 'special', title: '身份与票据', why: '非居民按当月、两处工资只能选一处、票据 90 日内补齐 —— 这三条决定了扣得到扣不到' }
            ],
            pitfalls: [
                '**同一笔捐赠，先扣哪一项税不一样**：扣除顺序由纳税人自行决定（99 号公告三（三））。实测 5 万捐赠：先扣分类（20%）→ 经营 → 综合省 **8000**，先扣综合（3% 档）→ 经营 → 分类只省 **4244** —— **差 3756 元**',
                '**捐赠额不是票面那个数**：货币按实际捐赠额，但**股权、房产按财产原值**（不是市值），其他非货币性资产按市场价格（二）。房产市值 500 万、原值 200 万 → 捐赠额是 **200 万**',
                '**限额 = 应纳税所得额 × 30%**，不是收入的 30%；且分类所得按**当月**应纳税所得额算（三（二））',
                '**一个项目扣不完的可以在其他项目继续扣**（三（一））—— 不是作废；但超出全部项目限额之和的部分，个人**不结转以后年度**（企业捐赠可结转 3 年，这是最常被混用的两条）',
                '**已在分类所得中扣除的捐赠，不再调整到其他所得**（五）—— 所以顺序选错没法回头改',
                '**核定征收的经营所得不扣捐赠**（六（四））；合伙 / 个人独资企业按**分配比例**归属到每个投资者（六（二））；两处以上工资薪金**只能选一处扣除、当年不得变更**（四（一））',
                '**劳务报酬 / 稿酬 / 特许权使用费预扣预缴时不扣捐赠**，统一在汇算清缴时扣除（四（二））；全年一次性奖金、股权激励单独计税的，捐赠扣除**比照分类所得**处理（四（三））',
                '分类所得当月应扣未扣的可**追补扣除**、未取得票据的可先凭银行支付凭证扣除 —— 两个期限都是 **90 日**；捐赠票据留存 **5 年**（五、九、十）'
            ],
            compute: function (v) {
                var Q = window.EuriskoDonationQuick;
                if (!Q) return null;

                var r = Q.stackOf({
                    donateKind: v.donateKind, cashAmount: v.cashAmount,
                    equityCost: v.equityCost, equityMarketValue: v.equityMarketValue,
                    houseCost: v.houseCost, houseMarketValue: v.houseMarketValue,
                    otherMarketValue: v.otherMarketValue, fullDeduction: v.fullDeduction,
                    comprehensiveTaxable: v.comprehensiveTaxable, comprehensiveBasis: v.comprehensiveBasis,
                    businessTaxable: v.businessTaxable, businessVerified: v.businessVerified,
                    classificationTaxable: v.classificationTaxable, classificationType: v.classificationType,
                    residency: v.residency, employerCount: v.employerCount, hasReceipt: v.hasReceipt
                });

                var money = function (x) { return { value: x, kind: 'money' }; };
                var pct = function (x) { return { value: x, kind: 'percent' }; };

                if (r.amount <= 0) {
                    return {
                        primary: { label: '今年这笔捐赠能少交个税', value: 0, kind: 'money' },
                        rows: [],
                        note: '捐赠额是 0：先在第一步把捐赠金额（或股权 / 房产的财产原值）填上，才会进入限额与扣除顺序的对照。',
                        steps: []
                    };
                }

                var rows = [
                    { label: '核定后的捐赠额', value: r.amount, kind: 'money', hint: r.declared.note },
                    { label: '扣除限额合计', value: r.limitSum, kind: 'money',
                        hint: '三个项目各按应纳税所得额 × ' + Math.round(r.limitRatio * 100) + '%' },
                    { label: '实际可扣除', value: r.deductibleTotal, kind: 'money' },
                    { label: '最优扣除顺序', value: r.best.label, kind: 'text' },
                    { label: '按最优顺序少交', value: r.best.saving, kind: 'money' },
                    { label: '最差顺序少交', value: r.worst.saving, kind: 'money',
                        hint: r.worst.label + ' —— 顺序选错就少省这么多' },
                    { label: '顺序选错的差额', value: r.orderGap, kind: 'money' },
                    { label: '扣不完的部分', value: r.unused, kind: 'money',
                        hint: '超出全部项目限额之和：个人**不结转以后年度**（企业可结转 3 年）' }
                ];
                if (r.declared.gap > 0) {
                    rows.push({ label: '与票面市值的差', value: r.declared.gap, kind: 'money',
                        hint: '按财产原值计，多出来的部分不能扣' });
                }

                var extras = [{
                    title: '三个所得项目：限额、可扣、各自省多少（按最优顺序）',
                    note: '限额 = 该项目**应纳税所得额** × ' + Math.round(r.limitRatio * 100)
                        + '%；分类所得按**当月**',
                    table: {
                        head: ['所得项目', '应纳税所得额', '扣除限额', '实际可扣', '扣除后', '少交'],
                        rows: r.best.per.map(function (p) {
                            return [p.label, money(p.taxable), money(p.limit), money(p.deductible),
                                money(p.taxableAfter), money(p.saving)];
                        }).concat([['合计', money(r.items.reduce(function (a, it) { return a + it.taxable; }, 0)),
                            money(r.limitSum), money(r.deductibleTotal), '—', money(r.best.saving)]])
                    }
                }, {
                    title: '六种扣除顺序对照（**顺序自行决定**，税不一样）',
                    note: '一个项目扣不完的可以继续在下一个项目扣（三（一））；已在分类所得扣除的不再调整到其他所得（五）',
                    table: {
                        head: ['扣除顺序', '可扣合计', '少交个税', '比最优少省'],
                        rows: r.orders.map(function (o) {
                            return [o.label, money(o.deductibleTotal), money(o.saving),
                                money(Math.max(0, r.best.saving - o.saving))];
                        })
                    }
                }, {
                    title: '捐赠额怎么算出来的（99 号公告二）',
                    note: '同一份资产，捐赠形式不同 → 能扣的捐赠额不同',
                    table: {
                        head: ['捐赠形式', '捐赠额按什么确定', '本次金额'],
                        rows: [
                            ['货币性资产', '实际捐赠金额', money(r.declared.kind === 'cash' ? r.amount : 0)],
                            ['股权', '持有股权的**财产原值**', money(r.declared.kind === 'equity' ? r.amount : 0)],
                            ['房产', '持有房产的**财产原值**', money(r.declared.kind === 'house' ? r.amount : 0)],
                            ['其他非货币性资产', '非货币性资产的**市场价格**', money(r.declared.kind === 'other' ? r.amount : 0)]
                        ]
                    }
                }];

                var note = '这笔捐赠核定为 ' + Math.round(r.amount) + ' 元，'
                    + (r.unused > 0 ? '只能扣 ' + Math.round(r.deductibleTotal) + ' 元（超出限额的 '
                        + Math.round(r.unused) + ' 元不结转以后年度）' : '限额内可全额扣除')
                    + '，按最优顺序今年少交 **' + Math.round(r.best.saving) + ' 元**；'
                    + '顺序换成 ' + r.worst.label + ' 只省 ' + Math.round(r.worst.saving)
                    + ' 元 —— **差 ' + Math.round(r.orderGap) + ' 元**。';
                if (r.notes.length) note += ' ' + r.notes.join('；') + '。';

                var steps = [{
                    title: '① 捐赠额核定（不是票面那个数）',
                    rows: [
                        { label: r.declared.kindLabel, value: r.declared.declared, format: 'money' },
                        { label: '核定后的捐赠额', value: r.amount, format: 'money', note: r.declared.note }
                    ],
                    footnote: '货币按实际捐赠额；股权、房产按**财产原值**；其他非货币性资产按市场价格（99 号公告二）。'
                }, {
                    title: '② 三个所得项目的限额与分配',
                    rows: r.best.per.map(function (p) {
                        return { label: p.label + '（限额 ' + Math.round(p.limit) + '）', value: p.deductible, format: 'money' };
                    }).concat([{ label: '可扣合计', value: r.deductibleTotal, format: 'money' }]),
                    footnote: '限额 = 各项目应纳税所得额 × 30%（分类所得按当月）；一个项目扣不完的继续在下一个项目扣。'
                }, {
                    title: '③ 节税与扣不完的部分',
                    rows: [
                        { label: '扣除前三个项目税额合计', value: r.taxBefore, format: 'money' },
                        { label: '扣除后税额合计', value: r.taxAfter, format: 'money' },
                        { label: '少交个税', value: r.best.saving, format: 'money' },
                        { label: '扣不完（不结转）', value: r.unused, format: 'money' }
                    ],
                    footnote: '扣除顺序自行决定（三（三））；顺序不同 → 各项目边际税率不同 → 税额不同。'
                }];

                return {
                    primary: { label: '今年这笔捐赠能少交个税', value: r.best.saving, kind: 'money' },
                    rows: rows, note: note, extras: extras, steps: steps
                };
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
        {
            // 阶段17 17C-1（v1.48.0 铺齐 → **v1.58.0 做深**）。
            //
            // 17C-1 v1.48.0 交付的是「铺齐」：本条目当时只有元数据，字段与计算**共享 vat 速算器**，
            // 于是「增值税完整测算」= 速算器那一屏 —— category 覆盖到了 6/6，但深度没上来。
            // 这一版做的是**纵向做深**（与 17D 同一套判断：速算器只认一个数，完整测算要算
            // 速算器算不出来的那几层）。速算器只收一个标量 `inputTax`「当期进项税额」，
            // 于是「这笔进项到底能不能抵」被推给了用户 —— 而增值税最贵的一类错误就在这里：
            //   ① **凭证闸门**：增值税普通发票、收据、白条**不是扣税凭证** —— 最常见的一笔「以为能抵」；
            //   ② **用途闸门**：用于免征 / 简易计税项目、集体福利与个人消费、餐饮 / 居民日常 /
            //      娱乐 / 贷款服务、非正常损失的进项一律不得抵扣，**即使拿到的是专票**；
            //   ③ **共同进项分摊转出**：房租、水电、办公用品这类**分不清用途**的进项，要按免税与
            //      简易项目销售额占比分摊转出（财税〔2016〕36 号附件1 第二十九条公式）——
            //      速算器一个框，表达不出这条公式。
            // 还有一层是**速算器给了对照却没说「你能不能选」**的：
            //   ④ **一般计税 vs 简易计税不是自由选择题**：只有法定情形才可以选，且**一经选择
            //      36 个月内不得变更**。即便能选，也只有进项占比高于**临界增值率**
            //      （= 税率 − 征收率：13% → 10%、9% → 6%、**6% → 仅 3%**）时一般计税才更省 ——
            //      6% 的现代服务业进项主要是房租与差旅，很容易低于 3%，也就是**很多 6% 纳税人
            //      其实该走简易，却往往不符合法定情形**，这才是要讲清楚的话。
            //   ⑤ **小规模 vs 一般纳税人的身份临界增值率**（= 税率 − 现行 1%：13% → 12%）：
            //      登记为一般纳税人**原则上不可逆**，所以这笔账必须在登记前算。
            //   ⑥ **附加税跟着实缴增值税走**：城建税 + 教育费附加 + 地方教育附加（市区 12%），
            //      所以两种计税方法的差额要 ×1.12 才是真实的现金流差额。
            // 口径仍同源：价税分离、免征判定、销项进项一律走 `EuriskoVatQuick`；
            // 附加税走 `EuriskoSurtaxStampQuick`（税率取 surtaxRules）；
            // 单笔输入与速算器逐点相等，由 tests/vat-deep.test.js 钉住。
            id: 'vat-deep', name: '增值税', subtitle: '逐笔核定进项能不能抵，再比计税方法',
            icon: 'fa-shopping-cart', status: 'deep',
            nextTools: ['vat', 'surtax-stamp', 'corporate-income-tax', 'business-income'],
            policyKey: 'vat-small-scale',
            fields: [
                { key: 'taxpayer', step: 'identity', label: '纳税人身份', type: 'select', default: 'general',
                    options: [{ value: 'small', label: '小规模纳税人' }, { value: 'general', label: '一般纳税人' }] },
                { key: 'rate', step: 'identity', label: '适用税率', type: 'select', default: 0.13,
                    options: [{ value: 0.13, label: '13%' }, { value: 0.09, label: '9%' },
                        { value: 0.06, label: '6%' }, { value: 0, label: '0%（出口 / 跨境）' }],
                    when: { key: 'taxpayer', in: ['general'] } },
                { key: 'simplifiedCase', step: 'identity', label: '是否符合法定简易计税情形', type: 'select', default: 'none',
                    options: vatSimplifiedOptions(), when: { key: 'taxpayer', in: ['general'] },
                    hint: '一般纳税人**不是想选就能选简易**：只有法定情形才可以，且一经选择 36 个月内不得变更' },

                { key: 'sales', step: 'sales', label: '本期销售额', type: 'money', default: 1130000 },
                { key: 'taxIncluded', step: 'sales', label: '销售额为含税价', type: 'switch', default: false },
                { key: 'period', step: 'sales', label: '纳税期', type: 'select', default: 'quarter',
                    options: [{ value: 'quarter', label: '按季' }, { value: 'month', label: '按月' }],
                    when: { key: 'taxpayer', in: ['small'] } },
                { key: 'specialInvoice', step: 'sales', label: '其中开具专票的销售额', type: 'money', default: 0,
                    when: { key: 'taxpayer', in: ['small'] }, hint: '免征只覆盖普票，专票部分照缴' },
                { key: 'exemptSales', step: 'sales', label: '其中免征项目销售额', type: 'money', default: 0,
                    when: { key: 'taxpayer', in: ['general'] },
                    hint: '免税项目的进项不得抵扣，且要把分不清用途的共同进项按比例分摊转出' },
                { key: 'simplifiedSales', step: 'sales', label: '其中简易计税项目销售额', type: 'money', default: 0,
                    when: { key: 'taxpayer', in: ['general'] } },

                { key: 'inputs', step: 'input', label: '进项税额逐笔（按凭证与用途核定）', type: 'repeater',
                    addLabel: '添加一笔进项',
                    hint: '小规模**不得抵扣进项** —— 这里填的是你**若登记为一般纳税人**能抵多少，用来判断要不要转',
                    default: [
                        { voucher: 'special', usage: 'business', amount: 80000 },
                        { voucher: 'normal', usage: 'business', amount: 12000 },
                        { voucher: 'special', usage: 'service', amount: 15000 },
                        { voucher: 'special', usage: 'welfare', amount: 8000 }
                    ],
                    itemFields: [
                        { key: 'voucher', label: '扣税凭证', type: 'select', default: 'special', options: vatVoucherOptions() },
                        { key: 'usage', label: '用途', type: 'select', default: 'business', options: vatUsageOptions() },
                        { key: 'amount', label: '票面税额（元）', type: 'money', default: 0, min: 0 }
                    ] },
                { key: 'unallocatedInput', step: 'input', label: '无法划分用途的共同进项税额（元）', type: 'money', default: 12000,
                    when: { key: 'taxpayer', in: ['general'] }, hint: vatApportionNote() },

                { key: 'annualSales', step: 'compare', label: '连续 12 个月累计应征增值税销售额（元）', type: 'money', default: 4800000,
                    hint: '超过 500 万须**强制登记**为一般纳税人；登记后原则上不得转回小规模' },
                { key: 'location', step: 'compare', label: '城建税：纳税人所在地', type: 'select', default: 'urban',
                    options: [{ value: 'urban', label: '市区（7%）' }, { value: 'county', label: '县城、镇（5%）' },
                        { value: 'other', label: '不在市区、县城、镇（1%）' }] },
                { key: 'halve', step: 'compare', label: '享受“六税两费”减半', type: 'switch', default: true,
                    hint: '小规模纳税人 / 小型微利企业 / 个体工商户可享，附加税减半征收' }
            ],
            steps: [
                { key: 'identity', title: '纳税人身份与计税方法', why: '决定用哪套算法：小规模按「不含税销售额 × 征收率」，一般纳税人按「销项 − 进项」' },
                { key: 'sales', title: '本期销售额', why: '增值税是价外税 —— 先确认是不是含税价；免税与简易项目要单列，它们决定共同进项要分摊转出多少' },
                { key: 'input', title: '进项逐笔核定', why: '两道闸门：先看过没过「有没有合规扣税凭证」，再看过没过「用于什么用途」—— 两道都过才能抵' },
                { key: 'compare', title: '计税方法对照与附加税', why: '附加税跟着**实缴增值税**走，所以真正要对比的是「增值税 + 附加」的合计' }
            ],
            pitfalls: [
                '**普票不是扣税凭证**：增值税普通发票、收据、白条一律不得抵扣 —— 最常见的一笔「以为能抵」',
                '**拿到专票也不一定可抵**：用于免征 / 简易计税项目、集体福利与个人消费、餐饮 / 居民日常 / 娱乐 / 贷款服务、非正常损失的进项一律不得抵扣',
                '分不清用途的共同进项（房租、水电、办公用品）要按免税与简易项目销售额占比**分摊转出**',
                '一般纳税人**不是想选简易就能选简易**：只有法定情形才可以，且**一经选择 36 个月内不得变更**',
                '一般计税更省的前提是进项占比高于**临界增值率**（税率 − 征收率）：13% → 10%、9% → 6%、**6% → 仅 3%**',
                '小规模「季 30 万」是**临界点不是起征点**：超过即**全额**计税，且开具专票的部分不免税',
                '小规模纳税人**不得抵扣进项**；一般纳税人抵不完的留抵下期继续抵扣，**不倒欠**',
                '连续 12 个月累计销售额超过 **500 万**须强制登记为一般纳税人，登记后**原则上不得转回小规模** —— 这笔账要在登记前算',
                '附加税以**实际缴纳的增值税**为计税依据（市区合计 12%），所以省下的增值税还能再省 12% 的附加'
            ],
            compute: function (v) {
                var Q = window.EuriskoVatQuick;
                if (!Q) return null;
                // 附加税跟着**实缴增值税**走 —— 所以「省了多少增值税」要连同附加税一起看。
                // 注：surtax-stamp-quick 导出的名字是 EuriskoSurtaxQuick（不带 stamp），别写错。
                var SU = window.EuriskoSurtaxQuick;

                var rules = Q.rules() || {};
                var num = function (x) { var n = Number(x); return isFinite(n) && n > 0 ? n : 0; };
                var numN = function (x, d) { var n = Number(x); return isFinite(n) ? n : (d || 0); };
                var general = v.taxpayer === 'general';

                // ① 进项逐笔核定：两道闸门（凭证 + 用途），再叠一层共同进项分摊转出
                var vouchers = {}, usages = {};
                vatList('voucher').forEach(function (x) { vouchers[x.key] = x; });
                vatList('usage').forEach(function (x) { usages[x.key] = x; });

                var claimed = 0, deductible = 0, cutVoucher = 0, cutUsage = 0;
                var detail = [];
                (Array.isArray(v.inputs) ? v.inputs : []).forEach(function (it) {
                    it = it || {};
                    var amount = num(it.amount);
                    var vc = vouchers[it.voucher] || vouchers.normal || { ok: false, label: '未知凭证', note: '' };
                    var us = usages[it.usage] || usages.business || { ok: true, label: '应税项目', note: '' };
                    var ok = vc.ok === true && us.ok !== false;
                    var okAmount = ok ? amount : 0;
                    claimed += amount;
                    deductible += okAmount;
                    if (vc.ok !== true) cutVoucher += amount; else if (us.ok === false) cutUsage += amount;
                    var why = vc.ok !== true ? vc.note : (us.ok === false ? us.note : '凭证与用途均符合，可抵扣');
                    detail.push([vc.label + ' · ' + us.label, { value: amount, kind: 'money' },
                        { value: okAmount, kind: 'money' }, why]);
                });

                var rawSales = num(v.sales);
                var reducedRate = (rules.smallScale && rules.smallScale.reducedRate) || 0.01;
                var rate = numN(v.rate, 0.13);
                var exclusive = v.taxIncluded ? rawSales / (1 + (general ? rate : reducedRate)) : rawSales;

                var exemptSales = general ? num(v.exemptSales) : 0;
                var simplifiedSales = general ? num(v.simplifiedSales) : 0;

                // 法定简易情形决定征收率（不是想选就能选，所以不符合时只给对照、不给建议）
                var simplifiedCase = null;
                ((rules.simplifiedCases || {}).items || []).forEach(function (x) {
                    if (x.key === v.simplifiedCase) simplifiedCase = x;
                });
                var caseRate = simplifiedCase ? numN(simplifiedCase.rate, 0) : 0;
                var fallbackRate = (rules.general && rules.general.simplifiedRate) || 0.03;
                var compareRate = caseRate > 0 ? caseRate : fallbackRate;
                var eligible = !!(simplifiedCase && simplifiedCase.key !== 'none' && caseRate > 0);

                var taxableSalesF = general ? Math.max(0, exclusive - exemptSales - simplifiedSales) : 0;
                var outputTax = general ? (taxableSalesF * rate + simplifiedSales * caseRate) : 0;

                // ③ 共同进项分摊转出（财税〔2016〕36 号附件1 第二十九条）
                var unallocated = general ? num(v.unallocatedInput) : 0;
                var apportionedOut = (general && exclusive > 0)
                    ? unallocated * (exemptSales + simplifiedSales) / exclusive : 0;
                var creditableInput = deductible + Math.max(0, unallocated - apportionedOut);

                var small = null;
                var tax = 0;
                if (general) {
                    tax = Math.max(0, outputTax - creditableInput);
                } else {
                    // 小规模：免征判定与计税一律问 quick（含「临界点不是起征点」那条提示）
                    small = Q.smallScaleOf({
                        sales: v.sales, period: v.period, taxIncluded: v.taxIncluded, specialInvoice: v.specialInvoice
                    });
                    exclusive = small.exclusive;
                    tax = small.tax;
                }
                var credit = general ? Math.max(0, creditableInput - outputTax) : 0;
                // 速算器口径：把填进来的进项当成全部可抵
                var naiveTax = general ? Math.max(0, outputTax - (claimed + unallocated)) : tax;
                var understated = tax - naiveTax;

                // ④ 一般计税 vs 简易计税：临界增值率 = 税率 − 征收率
                var simplifiedTax = exclusive * compareRate;
                var methodBreakEven = rate - compareRate;
                var inputRatio = exclusive > 0 ? creditableInput / exclusive : 0;
                var methodBetter = simplifiedTax < tax ? 'simplified' : (tax < simplifiedTax ? 'general' : 'same');
                var methodText = { simplified: '简易计税更省', general: '一般计税更省', same: '两者相同' }[methodBetter];

                // ⑤ 身份临界：小规模（现行 1%）vs 一般纳税人，临界增值率 = 税率 − 现行征收率
                var smallTax = exclusive * reducedRate;
                var generalHypo = Math.max(0, exclusive * rate - creditableInput);
                var identityBreakEven = rate - reducedRate;
                var identityBetter = generalHypo < smallTax ? 'general' : (smallTax < generalHypo ? 'small' : 'same');
                var cap = (rules.smallScale && rules.smallScale.annualSalesCap) || 5000000;
                var annualSales = num(v.annualSales);
                var mustRegister = annualSales > cap;

                // ⑥ 附加税跟着**实缴**增值税走
                var surtax = SU ? SU.surtaxOf({
                    vat: tax, consumption: 0, location: v.location, halve: !!v.halve
                }) : null;
                var surtaxTotal = surtax ? surtax.total : 0;
                var totalWithSurtax = tax + surtaxTotal;

                var primary = { label: '应纳增值税', value: tax, kind: 'money',
                    hint: '填进来的进项 ' + Math.round(claimed + unallocated) + ' 元里，核定可抵 '
                        + Math.round(creditableInput) + ' 元' };

                var rows = [
                    { label: '不含税销售额', value: exclusive, kind: 'money' }
                ];
                if (general) {
                    rows.push({ label: '销项税额', value: outputTax, kind: 'money' });
                } else {
                    rows.push({ label: (small.period === 'quarter' ? '本季' : '本月') + '免征额度', value: small.threshold, kind: 'money' });
                    rows.push({ label: '是否免征', value: small.exempt ? '是（普票部分）' : '否（全额计税）', kind: 'text' });
                    rows.push({ label: '其中专票销售额（不免税）', value: small.specialInvoice, kind: 'money' });
                    rows.push({ label: '征收率（现行减按）', value: small.rate, kind: 'percent' });
                    rows.push({ label: '临界提示：再超 1 分即全额计税', value: small.cliffTax, kind: 'money' });
                }
                rows.push({ label: '填进来的进项税额合计', value: claimed + unallocated, kind: 'money',
                    hint: '速算器只有一个「当期进项税额」框，会把它当成全部可抵' });
                rows.push({ label: '核定可抵的进项税额', value: creditableInput, kind: 'money' });
                rows.push({ label: '核减：凭证不合规', value: cutVoucher, kind: 'money' });
                rows.push({ label: '核减：用途不得抵扣', value: cutUsage, kind: 'money' });
                if (general) {
                    rows.push({ label: '核减：共同进项分摊转出', value: apportionedOut, kind: 'money' });
                    rows.push({ label: '留抵税额（结转下期）', value: credit, kind: 'money' });
                    rows.push({ label: '实际税负率（占不含税销售额）', value: exclusive > 0 ? tax / exclusive : 0, kind: 'percent' });
                    rows.push({ label: '若全部走简易计税（' + Math.round(compareRate * 100) + '%）', value: simplifiedTax, kind: 'money',
                        hint: eligible ? '符合法定情形，但一经选择 36 个月内不得变更' : '⚠️ 不符合法定简易情形 —— 仅作对照，实际不可选' });
                    rows.push({ label: '两种计税方法差额', value: Math.abs(tax - simplifiedTax), kind: 'money' });
                    rows.push({ label: '临界增值率（进项 ÷ 销售额）', value: methodBreakEven, kind: 'percent',
                        hint: '高于它一般计税更省，低于它简易更省' });
                    rows.push({ label: '当前进项占比', value: inputRatio, kind: 'percent' });
                    rows.push({ label: '计税方法结论', value: methodText + (eligible ? '' : '（不可选）'), kind: 'text' });
                }
                rows.push({ label: '随增值税附征（城建 + 教育费附加 + 地方教育附加）', value: surtaxTotal, kind: 'money' });
                rows.push({ label: '增值税与附加合计', value: totalWithSurtax, kind: 'money' });
                rows.push({ label: '年累计销售额', value: annualSales, kind: 'money' });
                rows.push({ label: '小规模纳税人标准', value: cap, kind: 'money',
                    hint: mustRegister ? '已超过 —— 须强制登记为一般纳税人' : '未超过' });

                var note = '增值税是价外税：' + Math.round(rawSales) + ' 元' + (v.taxIncluded ? '（含税）' : '')
                    + ' → 不含税 ' + Math.round(exclusive) + ' 元。';
                if (general) {
                    note += ' 进项核定才是大头：填进来的 ' + Math.round(claimed + unallocated)
                        + ' 元里，只有 ' + Math.round(creditableInput) + ' 元能抵（'
                        + (cutVoucher > 0 ? '凭证不合规核减 ' + Math.round(cutVoucher) + '、' : '')
                        + (cutUsage > 0 ? '用途不得抵扣核减 ' + Math.round(cutUsage) + '、' : '')
                        + (apportionedOut > 0 ? '共同进项分摊转出 ' + Math.round(apportionedOut) + '、' : '')
                        + '），速算器把它当成全部可抵，会**少算税 ' + Math.round(understated) + ' 元**。';
                    note += ' 一般计税 ' + Math.round(tax) + ' 元 vs 简易计税 ' + Math.round(simplifiedTax)
                        + ' 元（' + Math.round(compareRate * 100) + '%）：' + methodText
                        + '。临界增值率 ' + Math.round(methodBreakEven * 1000) / 10 + '%，你当前 '
                        + Math.round(inputRatio * 1000) / 10 + '% —— '
                        + (inputRatio < methodBreakEven ? '低于临界，进项再少就该走简易' : '高于临界，一般计税更划算')
                        + (eligible ? '' : '（但**不符合法定简易情形**，实际只能一般计税）') + '。';
                } else {
                    note += ' 小规模按不含税销售额 × 现行 ' + Math.round(reducedRate * 100)
                        + '% 计税，不得抵扣进项；免征额度按**全部不含税销售额**判断、含本数，'
                        + '超过即**全额**计税（不是只对超出部分）。';
                    if (small && small.exempt) {
                        note += ' 当前未超额度，但再超 1 分钱就要全额计税（¥'
                            + Number(small.cliffTax).toFixed(2) + '）—— 临界点附近应把开票与收入确认时点往后挪一个纳税期。';
                    }
                }
                note += ' 加上随增值税附征的附加税后，本期现金流合计 ' + Math.round(totalWithSurtax) + ' 元。';
                if (!mustRegister) {
                    note += ' 年累计 ' + Math.round(annualSales) + ' 元未超 ' + Math.round(cap)
                        + ' 元：同一笔业务走小规模是 ' + Math.round(smallTax) + ' 元、走一般纳税人是 '
                        + Math.round(generalHypo) + ' 元 —— ' + (identityBetter === 'small' ? '小规模更省' : '一般纳税人更省')
                        + '（临界增值率 ' + Math.round(identityBreakEven * 1000) / 10
                        + '%）。登记为一般纳税人**原则上不可逆**，这笔账要在登记前算。';
                } else {
                    note += ' ⚠️ 年累计已超 ' + Math.round(cap) + ' 元，须**强制登记**为一般纳税人。';
                }

                var extras = [{
                    title: '进项逐笔核定明细',
                    note: '每一笔能不能抵，取决于「凭证」与「用途」两道闸门 —— 这一层速算器表达不出来',
                    table: { head: ['凭证 · 用途', '票面税额', '核定可抵', '依据'], rows: detail }
                }];
                if (surtax) {
                    extras.push({
                        title: '随增值税附征的附加税',
                        note: '计税依据是**实际缴纳的增值税**（' + Math.round(tax) + ' 元），随增值税同增同减',
                        table: {
                            head: ['项目', '金额'], rows: [
                                ['城市维护建设税（' + surtax.locationLabel + ' ' + Math.round(surtax.cityRate * 100) + '%）',
                                    { value: surtax.cityTax, kind: 'money' }],
                                ['教育费附加（3%）', { value: surtax.educationTax, kind: 'money' }],
                                ['地方教育附加（2%）', { value: surtax.localEducationTax, kind: 'money' }],
                                ['合计' + (v.halve ? '（“六税两费”减半后）' : ''), { value: surtax.total, kind: 'money' }]
                            ]
                        }
                    });
                }

                // 推导链（台账 C）：与 20 个速算器**同一套约定** —— compute 返回 steps，
                // 渲染走 utils.js 的 renderFormulaStepsHtml。不写第二套（17A-2 的硬前置）。
                var steps = [{
                    title: '价税分离',
                    rows: [
                        { label: '销售额（' + (v.taxIncluded ? '含税' : '不含税') + '）', value: rawSales, format: 'money' },
                        { label: '不含税销售额', value: exclusive, format: 'money',
                            note: v.taxIncluded ? '含税 ÷ (1 + ' + (general ? rate : reducedRate) + ')' : '本就是不含税价' }
                    ],
                    footnote: '增值税是价外税 —— 先分离，后面每一步都建立在不含税金额上'
                }];
                if (general) {
                    steps.push({
                        title: '销项税额',
                        rows: [
                            { label: '一般计税项目 ' + Math.round(taxableSalesF) + ' × ' + rate,
                                value: taxableSalesF * rate, format: 'money' },
                            { label: '简易计税项目 ' + Math.round(simplifiedSales) + ' × ' + caseRate,
                                value: simplifiedSales * caseRate, format: 'money' },
                            { label: '销项税额合计', value: outputTax, format: 'money' }
                        ],
                        footnote: '免征项目不产生销项'
                    });
                    steps.push({
                        title: '进项核定（两道闸门 + 分摊转出）',
                        rows: [
                            { label: '填进来的进项税额', value: claimed + unallocated, format: 'money',
                                note: '速算器只有一个「当期进项税额」框，会把它当成全部可抵' },
                            { label: '核减：凭证不合规', value: -cutVoucher, format: 'money' },
                            { label: '核减：用途不得抵扣', value: -cutUsage, format: 'money' },
                            { label: '核减：共同进项分摊转出', value: -apportionedOut, format: 'money' },
                            { label: '核定可抵的进项税额', value: creditableInput, format: 'money' }
                        ],
                        footnote: '两道闸门：先看过没过「有没有合规扣税凭证」，再看过没过「用于什么用途」'
                    });
                    steps.push({
                        title: '应纳增值税',
                        rows: [
                            { label: '销项税额 − 核定可抵进项', value: outputTax - creditableInput, format: 'money' },
                            { label: '留抵税额（结转下期）', value: credit, format: 'money' },
                            { label: '应纳增值税', value: tax, format: 'money' }
                        ],
                        footnote: '抵不完的留抵下期继续抵扣，不倒欠'
                    });
                } else {
                    steps.push({
                        title: '免征判定',
                        rows: [
                            { label: '不含税销售额', value: exclusive, format: 'money' },
                            { label: (small.period === 'quarter' ? '本季' : '本月') + '免征额度', value: small.threshold, format: 'money' },
                            { label: small.exempt ? '未超额度 → 免征（普票部分）' : '已超额度 → 全额计税',
                                value: small.exempt ? 0 : 1, format: 'money' }
                        ],
                        footnote: '这是**临界点不是起征点**：超过即全额计税'
                    });
                    steps.push({
                        title: '应纳增值税',
                        rows: [
                            { label: '不含税销售额 × 现行 ' + Math.round(reducedRate * 100) + '%',
                                value: exclusive * reducedRate, format: 'money' },
                            { label: '其中专票部分照缴', value: small.specialInvoice, format: 'money' },
                            { label: '应纳增值税', value: tax, format: 'money' }
                        ],
                        footnote: '小规模不得抵扣进项'
                    });
                }
                steps.push({
                    title: '随增值税附征的附加税',
                    rows: [
                        { label: '实际缴纳的增值税', value: tax, format: 'money' },
                        { label: '城建税（' + (surtax ? surtax.locationLabel : '—') + '）', value: surtax ? surtax.cityTax : 0, format: 'money' },
                        { label: '教育费附加（3%）', value: surtax ? surtax.educationTax : 0, format: 'money' },
                        { label: '地方教育附加（2%）', value: surtax ? surtax.localEducationTax : 0, format: 'money' },
                        { label: '合计', value: surtaxTotal, format: 'money' }
                    ],
                    footnote: '计税依据是**实际缴纳的增值税** —— 随增值税同增同减'
                });

                return { primary: primary, rows: rows, note: note, extras: extras, steps: steps };
            }
        },
        {
            // 阶段17 17C-2（v1.48.0 铺齐 → **v1.59.0 做深**）。
            //
            // 17C-2 v1.48.0 交付的是「铺齐」：本条目当时只有元数据，字段与计算**共享 cit 速算器**。
            // 与 vat 不同，cit 速算器本身已经不浅（纳税调增 + 小微/高新孰优 + 300 万临界点），
            // 所以这一版要补的不是「再给一条填数路径」，而是**三处速算器收了数、却没说口径**的地方：
            //
            //   ① **从业人数与资产总额看的是「全年季度平均值」，不是期末数**
            //      （国家税务总局公告 2019 年第 2 号：季度平均值 =（季初+季末）÷2，
            //       全年季度平均值 = 四个季度平均值之和 ÷4）。速算器只收一个数，把「填哪个数」
            //      推给了用户 —— 于是**12 月 31 日裁员到 300 人以下被认为是「够格了」**。
            //      实测：Q1–Q3 各 380 人、Q4 裁到 250 人，期末 250 人看着符合 ≤300，
            //      但全年季度平均值 363.75 人 → **不符合小微**。利润 200 万时差 40 万税。
            //
            //   ② **研发费用加计扣除不是「少交一点税」，而是能把应纳税所得额压回 300 万门槛以内**。
            //      加计扣除直接减少应纳税所得额，够得着门槛时会**整档从 25% 掉回 5%** ——
            //      边际收益在临界点是**跳变**的，不是线性的。
            //      实测：会计利润 320 万 + 调增 24 万 = 344 万（超门槛，25% → 86 万）；
            //      研发投入 100 万按 100% 加计 → 244 万（回到门槛内，5% → **12.2 万**）。
            //      **省 73.8 万，比研发投入 100 万本身小不了多少**。
            //      反过来说：已经稳在 5% 档的企业，加计扣除 100 万只省 5 万 —— 值不值得做归集，
            //      取决于你离 300 万门槛有多远。负面清单行业（烟草、住宿餐饮、批发零售、
            //      房地产、租赁商务服务、娱乐）**一律不得加计**。
            //
            //   ③ **以前年度亏损会过期作废**：一般企业结转 5 年；当年具备高新技术企业或
            //      科技型中小企业资格的延长至 10 年。速算器只收一个「可弥补以前年度亏损」数字，
            //      不问这笔亏损是哪一年、还在不在弥补期 —— 于是十年前那笔巨亏常被当成今天还能抵的税盾。
            //      实测：2026 年汇算，2019 年亏 150 万 → 一般企业 2024 年度已到期**作废**；
            //      取得科技型中小企业资格 → 2029 年度到期，**能抵回 7.5 万税**。
            //      注意：**科技型中小企业本身不减税率**（那是高新 15% 的事），它只延长亏损结转年限。
            //
            // 口径仍同源：企业所得税税额、小微三门槛、孰优、临界点一律走 `EuriskoCorporateQuick`；
            // 三大扣除限额走 `deductionLimitOf`；季度平均值 / 加计扣除 / 亏损台账走新增的三个
            // quick 函数（同样读 tax-constants，运营改数字后前台同口径生效）。
            id: 'corporate-income-tax-deep', name: '企业所得税',
            subtitle: '季度平均定身份、加计扣除定档、亏损台账定可抵',
            icon: 'fa-bank', status: 'deep',
            nextTools: ['corporate-income-tax', 'vat', 'surtax-stamp', 'business-income'],
            policyKey: 'corporate-small-low-profit',
            fields: [
                { key: 'highTech', step: 'identity', label: '高新技术企业', type: 'switch', default: false,
                    hint: '减按 15% 计税；与小微 5% 不叠加，按税额孰优' },
                { key: 'smeTech', step: 'identity', label: '科技型中小企业', type: 'switch', default: false,
                    hint: '**不减税率**，但当年度具备资格可把亏损结转年限由 5 年延长至 10 年' },
                { key: 'industry', step: 'identity', label: '所属行业', type: 'select', default: 'general',
                    options: citIndustryOptions() },
                { key: 'restricted', step: 'identity', label: '属于国家限制/禁止行业', type: 'switch', default: false,
                    hint: '属于则一律不适用小微优惠' },

                { key: 'quarters', step: 'scale', label: '各季度季初 / 季末人数与资产', type: 'repeater',
                    addLabel: '添加一个季度', hint: citQuarterFormula(),
                    default: [
                        { staffBegin: 280, staffEnd: 280, assetsBegin: 3000, assetsEnd: 3000 },
                        { staffBegin: 280, staffEnd: 280, assetsBegin: 3000, assetsEnd: 3000 },
                        { staffBegin: 280, staffEnd: 280, assetsBegin: 3000, assetsEnd: 3000 },
                        { staffBegin: 380, staffEnd: 250, assetsBegin: 3000, assetsEnd: 3000 }
                    ],
                    itemFields: [
                        { key: 'staffBegin', label: '季初从业人数', type: 'number', default: 0, min: 0 },
                        { key: 'staffEnd', label: '季末从业人数', type: 'number', default: 0, min: 0 },
                        { key: 'assetsBegin', label: '季初资产总额（万元）', type: 'number', default: 0, min: 0 },
                        { key: 'assetsEnd', label: '季末资产总额（万元）', type: 'number', default: 0, min: 0 }
                    ] },

                { key: 'revenue', step: 'profit', label: '营业收入', type: 'money', default: 12000000 },
                { key: 'cost', step: 'profit', label: '成本、费用、税金及损失', type: 'money', default: 8800000 },
                { key: 'entertainment', step: 'profit', label: '业务招待费', type: 'money', default: 100000,
                    hint: '只能扣发生额的 60%，且不超过收入的 5‰（两个上限都要过）' },
                { key: 'advertising', step: 'profit', label: '广告费与业务宣传费', type: 'money', default: 2000000,
                    hint: '不超过收入 15% 的部分可扣，超出**结转以后年度**（无年限）' },
                { key: 'donation', step: 'profit', label: '公益性捐赠支出', type: 'money', default: 300000,
                    hint: '不超过年度利润总额 12% 的部分可扣，超出只**结转三年**，第四年作废' },

                { key: 'rdExpense', step: 'deduction', label: '可归集的研发费用', type: 'money', default: 1000000,
                    hint: '负面清单行业不得加计扣除；加计扣除直接减少应纳税所得额，够得着 300 万会整档掉到 5%' },
                { key: 'currentYear', step: 'deduction', label: '当前汇算年度', type: 'number', default: 2026 },
                { key: 'losses', step: 'deduction', label: '以前年度亏损台账', type: 'repeater',
                    addLabel: '添加一笔往年亏损', hint: citNote('loss'),
                    default: [{ year: 2019, amount: 1500000 }],
                    itemFields: [
                        { key: 'year', label: '亏损年度', type: 'number', default: 2025, min: 1990 },
                        { key: 'amount', label: '尚未弥补的亏损额（元）', type: 'money', default: 0, min: 0 }
                    ] }
            ],
            steps: [
                { key: 'identity', title: '企业身份与资质', why: '高新 15% 与小微 5% 不叠加、按税额孰优；科技型中小企业不减税率但延长亏损结转；负面清单行业不得加计扣除' },
                { key: 'scale', title: '从业人数与资产总额', why: '小微门槛看的是**全年季度平均值**，不是期末数 —— 期末突击裁员不改变这个数' },
                { key: 'profit', title: '收入成本与纳税调整', why: '企业所得税算的是**利润**不是收入：超限额的招待费、广宣费、捐赠要**调增**回利润' },
                { key: 'deduction', title: '研发加计扣除与亏损弥补', why: '加计扣除能把应纳税所得额压回 300 万门槛内（整档掉到 5%）；亏损会过期，先填哪一年才知道还能不能抵' }
            ],
            pitfalls: [
                '从业人数与资产总额按**全年季度平均值**判定（四个季度平均值的平均），**不是期末数** —— 12 月 31 日裁员到 300 人以下不改变判定结果',
                '研发费用加计扣除直接减少应纳税所得额，够得着 300 万门槛时会**整档从 25% 掉回 5%**，边际收益是**跳变**的',
                '已经稳在 5% 档的小微企业，100 万研发加计只省 5 万税；25% 档的企业省 25 万 —— 值不值得做归集，取决于离 300 万门槛多远',
                '负面清单行业（烟草、住宿餐饮、批发零售、房地产、租赁商务服务、娱乐）**一律不得**加计扣除',
                '以前年度亏损**会过期作废**：一般企业 5 年，当年具备高新 / 科技型中小企业资格的延长至 10 年',
                '**科技型中小企业不减税率**（那是高新 15% 的事），它只把亏损结转年限从 5 年延长到 10 年',
                '小微实际税负 **5% 是乘出来的**（减按 25% 计入 × 20% 税率）',
                '三个门槛是「**且**」的关系且是**临界点**：300 万交 15 万，300.0001 万交约 75 万 —— 多 1 元利润多缴约 60 万税',
                '纳税调整是**调增不是扣减**：超限额的业务招待费、广宣费、公益性捐赠要加回利润',
                '广宣费超限额部分**无限期结转**，公益性捐赠超限额部分只**结转三年**（第四年作废）—— 两者不一样'
            ],
            compute: function (v) {
                var C = window.EuriskoCorporateQuick;
                if (!C) return null;
                var rules = C.rules() || {};
                var num = function (x) { var n = Number(x); return isFinite(n) && n > 0 ? n : 0; };
                var staffCap = (rules.small || {}).staffCap === undefined ? 300 : rules.small.staffCap;
                var assetsCap = (rules.small || {}).assetsCap === undefined ? 50000000 : rules.small.assetsCap;
                var taxableCap = (rules.small || {}).taxableCap === undefined ? 3000000 : rules.small.taxableCap;

                // ① 全年季度平均值 —— 法定口径，不是期末数
                var qs = Array.isArray(v.quarters) ? v.quarters : [];
                var staffAvg = C.quarterlyAverageOf(qs.map(function (q) {
                    return { begin: q && q.staffBegin, end: q && q.staffEnd };
                }));
                var assetAvg = C.quarterlyAverageOf(qs.map(function (q) {
                    return { begin: q && q.assetsBegin, end: q && q.assetsEnd };
                }));
                var staff = staffAvg.annualAverage;
                var assets = assetAvg.annualAverage * 10000;      // 万元 → 元

                // ② 会计利润 → 三大扣除限额调增
                var revenue = num(v.revenue);
                var profit = Math.max(0, revenue - num(v.cost));
                var adjust = C.deductionLimitOf({
                    revenue: revenue, profit: profit,
                    entertainment: v.entertainment, advertising: v.advertising, donation: v.donation
                });
                var afterAdjust = Math.max(0, adjust.adjustedProfit);

                // ③ 研发费用加计扣除（负面清单行业不得加计）
                var rd = C.rdSuperDeductionOf({ expense: v.rdExpense, industry: v.industry });
                var afterRd = Math.max(0, afterAdjust - rd.superDeduction);

                // ④ 亏损弥补台账：会过期（高新 / 科技型中小企业延长至 10 年）
                var extended = !!v.smeTech || !!v.highTech;
                var carry = C.lossCarryOf({
                    losses: v.losses, currentYear: v.currentYear, extended: extended, limit: afterRd
                });
                var taxable = Math.max(0, afterRd - carry.total);

                var r = C.enterpriseOf({
                    taxable: taxable, staff: staff, assets: assets,
                    highTech: !!v.highTech, restricted: !!v.restricted
                });

                // ⑤ 对照：同样花了研发的钱、但没有做归集（于是没有加计扣除）
                var carryNoRd = C.lossCarryOf({
                    losses: v.losses, currentYear: v.currentYear, extended: extended, limit: afterAdjust
                });
                var noRd = Math.max(0, afterAdjust - carryNoRd.total);
                var rNoRd = C.enterpriseOf({
                    taxable: noRd, staff: staff, assets: assets,
                    highTech: !!v.highTech, restricted: !!v.restricted
                });
                var rdSaving = rNoRd.tax - r.tax;
                var regimeChanged = rNoRd.regime !== r.regime;
                var regimeText = { small: '小型微利（5%）', highTech: '高新技术企业（15%）', general: '一般企业（25%）' }[r.regime] || r.regime;

                var primary = { label: '应纳企业所得税', value: r.tax, kind: 'money',
                    hint: '应纳税所得额 ' + Math.round(taxable) + ' 元 → ' + regimeText };

                var rows = [
                    { label: '从业人数（全年季度平均值）', value: staff, kind: 'number',
                        hint: citQuarterFormula() },
                    { label: '从业人数（期末数，不作数）', value: staffAvg.yearEnd, kind: 'number',
                        hint: staffAvg.yearEnd <= staffCap && staff > staffCap
                            ? '⚠️ 期末 ' + Math.round(staffAvg.yearEnd) + ' 人看着符合 ≤' + staffCap
                                + '，但法定看的是全年季度平均值 ' + Math.round(staff) + ' 人 —— 不符合'
                            : '判定小微用的是全年季度平均值，不是这个数' },
                    { label: '资产总额（全年季度平均值）', value: assets, kind: 'money' },
                    { label: '会计利润（收入 − 成本费用）', value: adjust.profit, kind: 'money' },
                    { label: '业务招待费调增', value: adjust.entertainment.addBack, kind: 'money',
                        hint: '发生额 60% 与收入 5‰ 孰低后的差额' },
                    { label: '广宣费调增', value: adjust.advertising.addBack, kind: 'money',
                        hint: '超收入 15% 的部分，结转以后年度' },
                    { label: '公益性捐赠调增', value: adjust.donation.addBack, kind: 'money',
                        hint: '超利润总额 12% 的部分，只结转三年' },
                    { label: '调增后所得额', value: afterAdjust, kind: 'money' },
                    { label: '研发费用加计扣除', value: rd.superDeduction, kind: 'money',
                        hint: rd.excluded ? '⚠️ ' + rd.excludedLabel + '属于负面清单，不得加计扣除' : rd.note },
                    { label: '弥补以前年度亏损（在弥补期内）', value: carry.total, kind: 'money' },
                    { label: '已过弥补期作废的亏损', value: carry.expired, kind: 'money',
                        hint: carry.rescuable > 0 && !extended
                            ? '取得高新技术 / 科技型中小企业资格可延长至 10 年，能救回 ' + Math.round(carry.rescuable) + ' 元'
                            : '超过结转年限仍未弥补完的部分，不再抵税' },
                    { label: '应纳税所得额', value: r.taxable, kind: 'money' },
                    { label: '适用身份', value: regimeText, kind: 'text', hint: '按税额孰优选取；小微与高新不叠加' },
                    { label: '实际税负率', value: r.effectiveRate, kind: 'percent' },
                    { label: '若不做研发费用归集（无加计扣除）', value: rNoRd.tax, kind: 'money',
                        hint: '所得额 ' + Math.round(noRd) + ' 元 → '
                            + ({ small: '小型微利（5%）', highTech: '高新技术企业（15%）', general: '一般企业（25%）' }[rNoRd.regime] || rNoRd.regime) },
                    { label: '加计扣除省下的税', value: rdSaving, kind: 'money' },
                    { label: '按法定 25% 对照', value: r.statutoryTax, kind: 'money' },
                    { label: '优惠减免合计', value: r.saving, kind: 'money' },
                    { label: '小微门槛余额（应纳税所得额）', value: taxableCap - r.taxable, kind: 'money',
                        hint: r.taxable <= taxableCap ? '再超这个数就要全额按 25% 计税' : '已超门槛，全额按 25% 计税' },
                    { label: '踩线代价（+1 元）', value: r.cliff.gap, kind: 'money',
                        hint: '超过 ' + Math.round(taxableCap) + ' 元后按全额 25% 计税的差额' }
                ];
                if (!r.qualified) {
                    rows.push({
                        label: '未满足小微的原因',
                        value: { taxable: '应纳税所得额超 300 万', staff: '从业人数（全年季度平均值）超 300 人',
                            assets: '资产总额（全年季度平均值）超 5000 万', restricted: '属于限制/禁止行业' }[r.fails[0]] || '—',
                        kind: 'text'
                    });
                }

                var note = '从业人数与资产总额按**全年季度平均值**判定：'
                    + staffAvg.quarters.map(function (x) { return Math.round(x); }).join(' / ')
                    + ' → 平均 ' + Math.round(staff * 100) / 100 + ' 人（期末 '
                    + Math.round(staffAvg.yearEnd) + ' 人**不作数**）。';
                note += ' 会计利润 ' + Math.round(profit) + ' 元，三大限额调增 '
                    + Math.round(adjust.totalAddBack) + ' 元 → ' + Math.round(afterAdjust) + ' 元。';
                if (rd.superDeduction > 0) {
                    note += ' 研发加计扣除 ' + Math.round(rd.superDeduction) + ' 元后为 '
                        + Math.round(afterRd) + ' 元';
                } else if (rd.excluded) {
                    note += ' ⚠️ ' + rd.excludedLabel + '属于负面清单行业，**不得**加计扣除';
                }
                if (carry.total > 0) note += '，再弥补亏损 ' + Math.round(carry.total) + ' 元';
                note += ' → **应纳税所得额 ' + Math.round(taxable) + ' 元**，按' + regimeText + '，应纳 **'
                    + Math.round(r.tax) + ' 元**。';
                if (rdSaving > 0) {
                    note += ' 加计扣除省下 ' + Math.round(rdSaving) + ' 元'
                        + (regimeChanged
                            ? ' —— 而且不只是「少交一点」：它把应纳税所得额压回 ' + Math.round(taxableCap)
                                + ' 元门槛以内，**整档从 ' + Math.round((rNoRd.effectiveRate || 0.25) * 100)
                                + '% 掉到 ' + Math.round((r.effectiveRate || 0) * 100) + '%**'
                            : '（一直在同一档，加计的边际收益就是这一档的税率）') + '。';
                }
                if (carry.expired > 0) {
                    note += ' ⚠️ 有 ' + Math.round(carry.expired) + ' 元亏损**已过弥补期作废**'
                        + (carry.rescuable > 0 && !extended
                            ? '：取得高新技术企业或科技型中小企业资格可延长至 10 年，能救回 '
                                + Math.round(carry.rescuable) + ' 元（科技型中小企业**不减税率**，只延长年限）'
                            : '，超过结转年限未弥补完的部分不再抵税') + '。';
                }
                if (r.taxable > taxableCap && r.regime === 'general') {
                    note += ' 已超 ' + Math.round(taxableCap) + ' 元门槛，全额按 25% 计税：多赚 1 元要多缴 '
                        + Math.round(r.cliff.gap) + ' 元税，所以只要压回门槛的成本低于这个数就值得压。';
                }

                var extras = [{
                    title: '从业人数与资产总额的季度平均',
                    note: citQuarterFormula() + ' —— 期末数不参与判定',
                    table: {
                        head: ['季度', '季初人数', '季末人数', '季度平均', '季初资产（万元）', '季末资产（万元）', '季度平均（万元）'],
                        rows: qs.map(function (q, i) {
                            return ['第 ' + (i + 1) + ' 季度', q.staffBegin, q.staffEnd,
                                Math.round((staffAvg.quarters[i] || 0) * 100) / 100,
                                q.assetsBegin, q.assetsEnd,
                                Math.round((assetAvg.quarters[i] || 0) * 100) / 100];
                        }).concat([['全年季度平均值', '—', '—', Math.round(staff * 100) / 100,
                            '—', '—', Math.round(assetAvg.annualAverage * 100) / 100],
                            ['门槛', '—', '—', staffCap, '—', '—', assetsCap / 10000],
                            ['是否通过', '—', '—', staff <= staffCap ? '通过' : '不通过',
                                '—', '—', assetAvg.annualAverage * 10000 <= assetsCap ? '通过' : '不通过']])
                    }
                }, {
                    title: '以前年度亏损弥补台账',
                    note: '一般企业结转 ' + carry.years + ' 年' + (carry.extended ? '（已延长至 ' + carry.extendedYears + ' 年）' : '')
                        + '；先到期的先弥补，超期**作废**',
                    table: {
                        head: ['亏损年度', '亏损额', '5 年到期年度', '延长后到期', '本次可抵', '结论'],
                        rows: carry.rows.length ? carry.rows.map(function (x) {
                            return [x.year + ' 年', { value: x.amount, kind: 'money' },
                                x.year + carry.years + ' 年', x.year + carry.extendedYears + ' 年',
                                { value: x.used, kind: 'money' },
                                x.usable ? (x.used > 0 ? '在弥补期内' : '所得额不足，结转以后年度')
                                    : '已过弥补期作废' + (x.aliveIfExtended ? '（延长后可救回）' : '')];
                        }) : [['—', '—', '—', '—', '—', '未填写往年亏损']]
                    }
                }, {
                    title: '三大扣除限额',
                    note: '纳税调整是**调增**不是扣减 —— 超限额的部分要加回利润',
                    table: {
                        head: ['项目', '发生额', '扣除上限', '可扣除', '调增', '结转'],
                        rows: [
                            ['业务招待费', { value: adjust.entertainment.amount, kind: 'money' },
                                'min(60% = ' + Math.round(adjust.entertainment.byAmount) + ', 收入 5‰ = '
                                    + Math.round(adjust.entertainment.byRevenue) + ')',
                                { value: adjust.entertainment.deductible, kind: 'money' },
                                { value: adjust.entertainment.addBack, kind: 'money' }, '不可结转'],
                            ['广告费与业务宣传费', { value: adjust.advertising.amount, kind: 'money' },
                                '收入 15% = ' + Math.round(adjust.advertising.byRevenue),
                                { value: adjust.advertising.deductible, kind: 'money' },
                                { value: adjust.advertising.addBack, kind: 'money' }, '结转以后年度（无年限）'],
                            ['公益性捐赠', { value: adjust.donation.amount, kind: 'money' },
                                '利润总额 12% = ' + Math.round(adjust.donation.byProfit),
                                { value: adjust.donation.deductible, kind: 'money' },
                                { value: adjust.donation.addBack, kind: 'money' },
                                '只结转 ' + adjust.donation.carryForwardYears + ' 年']
                        ]
                    }
                }];

                // 推导链（台账 C）：与 20 个速算器同一套约定，走 utils.js 的 renderFormulaStepsHtml
                var steps = [{
                    title: '从业人数与资产总额（全年季度平均值）',
                    rows: [
                        { label: '四个季度平均值', value: Math.round(staff * 100) / 100, format: 'text' },
                        { label: '从业人数门槛', value: staffCap, format: 'text' },
                        { label: '资产总额平均值（万元）', value: Math.round(assetAvg.annualAverage * 100) / 100, format: 'text' },
                        { label: '资产总额门槛（万元）', value: assetsCap / 10000, format: 'text' }
                    ],
                    footnote: '期末数不参与判定 —— 12 月 31 日裁员到门槛以下不改变这个数'
                }, {
                    title: '会计利润与纳税调增',
                    rows: [
                        { label: '营业收入 − 成本费用', value: adjust.profit, format: 'money' },
                        { label: '业务招待费调增', value: adjust.entertainment.addBack, format: 'money' },
                        { label: '广宣费调增', value: adjust.advertising.addBack, format: 'money' },
                        { label: '公益性捐赠调增', value: adjust.donation.addBack, format: 'money' },
                        { label: '调增后所得额', value: afterAdjust, format: 'money' }
                    ],
                    footnote: '超限额的部分是**加回**利润，不是从利润里扣'
                }, {
                    title: '研发费用加计扣除',
                    rows: [
                        { label: '可归集研发费用', value: rd.expense, format: 'money' },
                        { label: '加计比例', value: rd.excluded ? '不适用（负面清单）' : Math.round(rd.ratio * 100) + '%', format: 'text' },
                        { label: '加计扣除额', value: rd.superDeduction, format: 'money' },
                        { label: '加计后所得额', value: afterRd, format: 'money' }
                    ],
                    footnote: rd.excluded ? rd.excludedLabel + '属于负面清单行业，不得加计扣除'
                        : '加计扣除直接减少应纳税所得额 —— 够得着门槛时会整档掉到 5%'
                }, {
                    title: '弥补以前年度亏损',
                    rows: [
                        { label: '结转年限', value: carry.extended ? carry.extendedYears + ' 年（已延长）' : carry.years + ' 年', format: 'text' },
                        { label: '本次可抵', value: carry.total, format: 'money' },
                        { label: '已过弥补期作废', value: carry.expired, format: 'money' },
                        { label: '应纳税所得额', value: taxable, format: 'money' }
                    ],
                    footnote: carry.expired > 0 ? '超期未弥补完的亏损**作废**，不再抵税' : '先到期的先弥补'
                }, {
                    title: '适用税率与税额（孰优）',
                    rows: [
                        { label: '一般企业 25%', value: r.statutoryTax, format: 'money' },
                        { label: '小型微利 5%（减按 25% 计入 × 20%）', value: r.smallTax === null ? 0 : r.smallTax, format: 'money' },
                        { label: '高新技术企业 15%', value: r.highTechTax === null ? 0 : r.highTechTax, format: 'money' },
                        { label: '应纳企业所得税', value: r.tax, format: 'money' }
                    ],
                    footnote: '小微与高新不叠加，按税额孰优；小微三条件是「且」的关系'
                }];

                return { primary: primary, rows: rows, note: note, extras: extras, steps: steps };
            }
        },
        {
            // 阶段17 17C-3（v1.48.0 铺齐 → **v1.60.0 做深**）。
            //
            // 17C-3 v1.48.0 交付的是「铺齐」：本条目当时只有元数据，字段与计算**共享社保速算器**。
            // 速算器的字段就叫「**税前月薪**」，compute 直接拿它当缴费基数 ——
            // 而法定的缴费基数是「**本人上年度月平均工资**」，工资总额里**含奖金、津贴补贴、
            // 加班工资**。于是「月薪 1 万 + 年终奖 12 万」的人，基数被算成 1 万，法定是 2 万：
            // 个人侧一年差 **2.7 万**、单位侧差 **4.74 万**。这是本工具最贵的一类错误。
            //
            // 四处具体的口径差：
            //
            //   ① **基数是上年度月平均工资，不是本月工资**（国家统计局《关于工资总额组成的规定》）：
            //      工资总额 = 计时/计件工资 + 奖金 + 津贴补贴 + 加班加点工资 + 特殊情况下支付的工资；
            //      上年度工作不满 12 个月的按**实际计薪月数**平均；基数**一年一调**
            //      （多数地区每年 7 月随上年度社平工资公布调整），不是每月跟着工资变。
            //      实测：月薪 1 万 + 年终奖 12 万 → 上年度工资总额 24 万 ÷ 12 = **2 万/月**。
            //
            //   ② **公积金免税的两个上限是「且」的关系**（财税〔2006〕10 号）：
            //      比例 ≤ 12% **且** 基数 ≤ 社平 3 倍。公积金基数可与社保基数不同
            //      （部分地区另行公布上下限），超出的部分**并入工资计税**。
            //      速算器内部算了这个数，但**没有暴露公积金基数这一栏**，用户填不了。
            //      实测：公积金基数 3 万、社平 8000（3 倍 = 2.4 万）、比例 12%
            //      → 个人实缴 3600/月，免税部分只有 2880/月，**超标 720/月并入工资计税**。
            //
            //   ③ **申报基数不足额的代价**（社保费 2019 年起由税务部门征收）：
            //      补缴 + 按日加收**万分之五**滞纳金（年化 **18.25%**）+ 欠缴数额 **1~3 倍**罚款。
            //      实测：核定的基数 2 万却按下限 4800 申报（差 1.52 万）→ 一年少缴 **6.93 万**，
            //      若被追溯 1 年，补缴 + 滞纳金 + 罚款合计 **14.5 万 ~ 28.4 万**。
            //
            //   ④ **灵活就业是另一套制度**，不是「单位职工的简化版」：
            //      养老按 **20%** 缴且**全部个人承担**（单位职工是单位 16% + 个人 8%），
            //      其中 8% 进个人账户、12% 进统筹；基数在社平 60%~300% 之间**自选**；
            //      而且**统筹部分不退还** —— 断缴 / 身故 / 出国定居只退个人账户那 8%。
            //      实测：按 60% 档（社平 8000 × 60% = 4800）缴养老保险一年 11520 元，
            //      其中只有 **4608 元**（40%）进个人账户，6912 元进统筹，**拿不回来**。
            //
            // 口径仍同源：基数上下限、五项费率、公积金免税额、累计预扣一律走
            // `EuriskoSocialQuick`（新增 wageBaseOf / housingTaxFreeOf / flexibleOf /
            // complianceGapOf 四个可复用函数，同样读 tax-constants）。
            id: 'social-base-deep', name: '社保公积金',
            subtitle: '上年度月平均定基数、公积金双上限定免税、申报差额定价',
            icon: 'fa-users', status: 'deep',
            nextTools: ['social-base', 'employer-cost', 'net-salary', 'salary-tax'],
            policyKey: 'social-insurance',
            fields: [
                { key: 'identity', step: 'identity', label: '参保身份', type: 'select', default: 'employee',
                    options: [{ value: 'employee', label: '单位职工（五险一金，单位与个人分担）' },
                        { value: 'flexible', label: '灵活就业（只能缴养老与医疗，全部个人承担）' }] },
                { key: 'socialAverage', step: 'identity', label: '当地上年度社平工资（月）', type: 'money', default: 8000,
                    hint: '决定缴费基数上下限（60% 保底 / 300% 封顶）与公积金免税基数上限（社平 3 倍）' },

                // 单位职工：基数 = 本人上年度月平均工资（工资总额口径）
                { key: 'monthlyWage', step: 'base', label: '月固定工资', type: 'money', default: 10000,
                    when: { key: 'identity', in: ['employee'] } },
                { key: 'annualBonus', step: 'base', label: '全年奖金（年终奖 / 季度奖 / 绩效奖）', type: 'money', default: 120000,
                    when: { key: 'identity', in: ['employee'] },
                    hint: '奖金属于**工资总额**，要计入缴费基数口径 —— 速算器只按「税前月薪」算，这里补上' },
                { key: 'monthlyAllowance', step: 'base', label: '月津贴补贴', type: 'money', default: 0,
                    when: { key: 'identity', in: ['employee'] } },
                { key: 'monthlyOvertime', step: 'base', label: '月加班工资', type: 'money', default: 0,
                    when: { key: 'identity', in: ['employee'] } },
                { key: 'paidMonths', step: 'base', label: '上年度实际计薪月数', type: 'select', default: 12,
                    when: { key: 'identity', in: ['employee'] },
                    options: [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map(function (m) { return { value: m, label: m + ' 个月' }; }),
                    hint: '上年度工作不满 12 个月的按**实际月数**平均（年中入职 / 新参加工作从起薪之月起）' },

                // 灵活就业：基数在 60%~300% 之间**自选**
                { key: 'level', step: 'base', label: '缴费档次（社平工资的百分比）', type: 'select', default: 0.6,
                    when: { key: 'identity', in: ['flexible'] }, options: socialLevelOptions(),
                    hint: socialNote('flexible') },
                { key: 'withMedical', step: 'base', label: '同时缴纳职工医疗保险', type: 'switch', default: true,
                    when: { key: 'identity', in: ['flexible'] } },

                { key: 'housingRate', step: 'detail', label: '住房公积金比例（%）', type: 'percent', default: 12,
                    when: { key: 'identity', in: ['employee'] }, hint: '法定 5% ~ 12%' },
                { key: 'housingBaseMode', step: 'detail', label: '公积金缴存基数', type: 'select', default: 'same',
                    when: { key: 'identity', in: ['employee'] },
                    options: [{ value: 'same', label: '与社保缴费基数一致' },
                        { value: 'separate', label: '单独填写（部分地区上下限另行公布）' }] },
                { key: 'housingBase', step: 'detail', label: '公积金缴存基数（元/月）', type: 'money', default: 30000,
                    when: { key: 'housingBaseMode', in: ['separate'] },
                    hint: '超过社平 3 倍的部分，对应缴存额**不免个税**，要并入工资计税' },
                { key: 'specialMonthly', step: 'detail', label: '专项附加扣除（月）', type: 'money', default: 0,
                    when: { key: 'identity', in: ['employee'] } },
                { key: 'declaredBase', step: 'detail', label: '单位实际申报的缴费基数', type: 'money', default: 4800,
                    when: { key: 'identity', in: ['employee'] },
                    hint: '填 0 表示按上面核定的基数足额申报；低于实际基数即**未足额缴纳**' },
                { key: 'auditYears', step: 'detail', label: '假设被追溯的年数', type: 'number', default: 1, min: 1,
                    when: { key: 'identity', in: ['employee'] } }
            ],
            steps: [
                { key: 'identity', title: '参保身份与社平工资', why: '单位职工与灵活就业是**两套制度**：前者单位与个人分担、有公积金，后者只能缴养老与医疗且**全部个人承担**，基数还是自选的' },
                { key: 'base', title: '缴费基数核定', why: '单位职工的基数是**本人上年度月平均工资**（含奖金、津贴、加班），不是本月工资；基数一年一调，不是每月跟着工资变' },
                { key: 'detail', title: '缴纳比例与申报基数', why: '公积金只有「比例 ≤12% 且基数 ≤ 社平 3 倍」的部分免征个税；申报基数低于实际基数要补缴并加收滞纳金' }
            ],
            pitfalls: [
                '缴费基数是**本人上年度月平均工资**，**不是本月工资** —— 奖金、津贴补贴、加班工资都属于工资总额，都要进基数口径',
                '缴了 1 万月薪 + 12 万年终奖的人，法定基数是 **2 万**不是 1 万：个人侧一年差 **2.7 万**、单位侧差 **4.74 万**',
                '基数**一年一调**（多数地区每年 7 月随上年度社平工资公布调整），不是每月跟着工资变',
                '公积金免税的两个上限是「**且**」的关系：比例 ≤12% **且** 基数 ≤ 社平 3 倍，超出部分**并入工资计税**',
                '公积金基数可与社保基数**不同**（部分地区上下限另行公布），超速算器没有这一栏，填不了',
                '按最低基数申报是**未足额缴纳**：补缴 + 按日万分之五滞纳金（年化 **18.25%**）+ 欠缴数额 **1~3 倍**罚款',
                '灵活就业养老按 **20%** 缴且**全部个人承担**，其中只有 **8% 进个人账户**、12% 进统筹',
                '灵活就业的基数在社平 **60%~300% 之间自选**，与单位职工「按实际工资定」根本不同',
                '**统筹部分不退还**：断缴、身故、出国定居只退还个人账户（8%）那一部分',
                '工伤、生育个人不缴（生育已并入医保），算到手时扣掉就多扣了',
                '缴费基数仍受 **60% 保底 / 300% 封顶**约束：工资 3000 按下限缴、工资 5 万只按 3 倍封顶数缴'
            ],
            compute: function (v) {
                var S = window.EuriskoSocialQuick;
                if (!S) return null;
                var num = function (x) { var n = Number(x); return isFinite(n) && n > 0 ? n : 0; };
                var yuan = function (x) { return (Math.round((Number(x) || 0) * 100) / 100).toFixed(2); };
                var pct = function (r) { return Math.round((Number(r) || 0) * 10000) / 100 + '%'; };
                var yr = function (x) { return Math.round((Number(x) || 0) * 12 * 100) / 100; };
                var socialAverage = num(v.socialAverage);

                // ===== 灵活就业：另一套制度（20% 全额自付，8% 进个人账户）=====
                if (v.identity === 'flexible') {
                    var f = S.flexibleOf({ socialAverage: socialAverage, level: v.level, withMedical: !!v.withMedical });
                    var rowsF = [
                        { label: '缴费基数（自选档次）', value: f.base, kind: 'money',
                            hint: '社平 ' + yuan(socialAverage) + ' × ' + Math.round(f.level * 100) + '%' },
                        { label: '养老保险（个人 / 月，20%）', value: f.pensionMonthly, kind: 'money',
                            hint: '**全部个人承担**：单位职工是单位 16% + 个人 8%，灵活就业是 20% 一人出' },
                        { label: '其中：记入个人账户（8%）', value: f.personalAccountMonthly, kind: 'money',
                            hint: '这一部分才是「自己的」' },
                        { label: '其中：记入统筹基金（12%）', value: f.poolMonthly, kind: 'money',
                            hint: '**不退还**：断缴、身故、出国定居都拿不回来' },
                        { label: '职工医疗保险（个人 / 月）', value: f.medicalMonthly, kind: 'money',
                            hint: f.withMedical ? '比例 ' + pct(f.medicalRate) + '，由统筹地区确定' : '未勾选，不计入' },
                        { label: '月缴合计', value: f.monthlyTotal, kind: 'money' },
                        { label: '年缴合计', value: f.annualTotal, kind: 'money' },
                        { label: '全年记入个人账户', value: f.annualPersonalAccount, kind: 'money',
                            hint: '年缴 ' + yuan(f.annualTotal) + ' 中只有 ' + yuan(f.annualPersonalAccount) + ' 元是自己的' },
                        { label: '全年记入统筹基金', value: f.annualPool, kind: 'money',
                            hint: '占养老缴费的 ' + pct(f.poolRate / f.pensionRate) + '，不退还' },
                        { label: '若当年退保 / 身故可退还', value: f.annualPersonalAccount, kind: 'money',
                            hint: f.refundNote }
                    ];

                    var levels = ((S.rules() || {}).flexible || {}).levels || [0.6, 1, 3];
                    var stepsF = [{
                        title: '自选档次 → 缴费基数',
                        rows: [
                            { label: '当地上年度社平工资（月）', value: socialAverage, format: 'money' },
                            { label: '自选档次', value: Math.round(f.level * 100) + '%', format: 'text' },
                            { label: '缴费基数', value: f.base, format: 'money' }
                        ],
                        footnote: '单位职工是「按本人上年度月平均工资定」，灵活就业是**自选** —— 这是两套制度最根本的差别'
                    }, {
                        title: '养老保险 20% 的拆分',
                        rows: [
                            { label: '月缴（20%）', value: f.pensionMonthly, format: 'money' },
                            { label: '记入个人账户（8%）', value: f.personalAccountMonthly, format: 'money' },
                            { label: '记入统筹基金（12%）', value: f.poolMonthly, format: 'money' },
                            { label: '月缴合计（含医保）', value: f.monthlyTotal, format: 'money' }
                        ],
                        footnote: f.refundNote
                    }];

                    var noteF = '灵活就业在当地社平 ' + yuan(socialAverage) + ' 元的 '
                        + Math.round(f.level * 100) + '% 档（基数 ' + yuan(f.base) + ' 元/月）参保：'
                        + '养老保险按 ' + pct(f.pensionRate) + ' 缴、' + yuan(f.pensionMonthly)
                        + ' 元/月，**全部个人承担**（单位职工是单位 16% + 个人 8%）。'
                        + '其中只有 ' + pct(f.personalAccountRate) + '（' + yuan(f.personalAccountMonthly)
                        + ' 元/月）进个人账户，剩下 ' + pct(f.poolRate) + '（' + yuan(f.poolMonthly)
                        + ' 元/月）进统筹基金 —— **统筹部分不退还**。'
                        + (f.withMedical ? ' 加职工医保 ' + yuan(f.medicalMonthly) + ' 元/月，' : '')
                        + '月缴合计 **' + yuan(f.monthlyTotal) + ' 元**、年缴 **' + yuan(f.annualTotal)
                        + ' 元**，其中全年只有 **' + yuan(f.annualPersonalAccount) + ' 元**是自己的。';

                    return {
                        primary: { label: '灵活就业月缴合计', value: f.monthlyTotal, kind: 'money',
                            hint: '基数 ' + yuan(f.base) + ' 元/月（社平 ' + Math.round(f.level * 100) + '% 档）' },
                        rows: rowsF,
                        note: noteF,
                        extras: [{
                            title: '各档次缴费对照（养老 + 医疗）',
                            note: '基数在社平 60%~300% 之间自选；缴得多不等于「自己的」多 —— 只有 8% 进个人账户',
                            table: {
                                head: ['档次', '缴费基数', '月缴', '年缴', '全年个人账户', '全年统筹（不退还）'],
                                rows: levels.map(function (lv) {
                                    var o = S.flexibleOf({ socialAverage: socialAverage, level: lv, withMedical: !!v.withMedical });
                                    return [Math.round(lv * 100) + '%', { value: o.base, kind: 'money' },
                                        { value: o.monthlyTotal, kind: 'money' }, { value: o.annualTotal, kind: 'money' },
                                        { value: o.annualPersonalAccount, kind: 'money' }, { value: o.annualPool, kind: 'money' }];
                                })
                            }
                        }],
                        steps: stepsF
                    };
                }

                // ===== 单位职工 =====
                var wb = S.wageBaseOf({
                    monthlyWage: v.monthlyWage, monthlyAllowance: v.monthlyAllowance,
                    monthlyOvertime: v.monthlyOvertime, annualBonus: v.annualBonus,
                    paidMonths: v.paidMonths, socialAverage: socialAverage
                });
                var housingBase = v.housingBaseMode === 'separate' ? num(v.housingBase) : wb.base;
                var rateInput = (Number(v.housingRate) || 0) / 100;
                var input = {
                    wage: wb.monthlyAverage, socialAverage: socialAverage,
                    housingRate: rateInput, housingBase: housingBase, specialMonthly: v.specialMonthly
                };
                var s = S.socialInsuranceOf(input);
                var n = S.netSalaryOf(input);
                var hf = S.housingTaxFreeOf({ housingBase: housingBase, housingRate: rateInput, socialAverage: socialAverage });
                var comp = S.complianceGapOf({ actualBase: wb.base, declaredBase: v.declaredBase, years: v.auditYears });

                var rows = [
                    { label: '缴费基数（法定：本人上年度月平均工资）', value: wb.base, kind: 'money',
                        hint: socialNote('wage') + '；' + socialNote('adjust') },
                    { label: '上年度工资总额', value: wb.annualTotal, kind: 'money',
                        hint: '（月工资 ' + yuan(wb.monthlyWage) + ' + 津贴 ' + yuan(wb.monthlyAllowance)
                            + ' + 加班 ' + yuan(wb.monthlyOvertime) + '）× ' + wb.months + ' 个月 + 奖金 '
                            + yuan(wb.annualBonus) },
                    { label: '上年度月平均工资', value: wb.monthlyAverage, kind: 'money',
                        hint: '工资总额 ÷ 实际计薪月数 ' + wb.months + ' 个月' },
                    { label: '速算器口径（只按本月固定工资）', value: wb.naiveBase, kind: 'money',
                        hint: wb.gap > 0
                            ? '⚠️ 少算 ' + yuan(wb.gap) + ' 元基数 —— 速算器的字段就叫「税前月薪」，直接拿它当基数'
                            : '与法定口径一致（本月工资就是上年度月平均）' },
                    { label: '基数上下限', value: yuan(wb.baseMin) + ' ~ ' + yuan(wb.baseMax), kind: 'text',
                        hint: '社平 60% 保底 / 300% 封顶' },
                    { label: '公积金缴存基数', value: hf.housingBase, kind: 'money',
                        hint: v.housingBaseMode === 'separate' ? '单独填写（与社保基数不同）' : '与社保缴费基数一致' },
                    { label: '住房公积金（个人 / 月）', value: hf.personal, kind: 'money',
                        hint: '比例 ' + pct(hf.housingRate) + '，单位同比例再缴 ' + yuan(s.housingEmployer) + ' 元/月' },
                    { label: '公积金免税部分', value: hf.taxFree, kind: 'money',
                        hint: '比例 ≤ ' + pct(hf.capRate) + ' **且** 基数 ≤ 社平 ' + hf.capRatio + ' 倍（'
                            + yuan(hf.capBase) + ' 元）' },
                    { label: '公积金超标并入工资计税', value: hf.taxable, kind: 'money',
                        hint: hf.taxable > 0
                            ? '⚠️ 基数超社平 3 倍 ' + yuan(hf.exceededBase) + ' 元，对应缴存额要并入工资计个税'
                            : '未超标（比例与基数两个上限都在内）' }
                ];
                s.items.forEach(function (it) {
                    rows.push({
                        label: it.name + '（个人 / 月）',
                        value: it.personal,
                        kind: 'money',
                        hint: '个人 ' + pct(it.personalRate) + '、单位 ' + pct(it.employerRate) + ' → 单位 '
                            + yuan(it.employer) + ' 元/月' + (it.personalRate ? '' : '（个人不缴）')
                    });
                });
                rows.push({ label: '个人五险一金 / 月', value: s.personalTotal, kind: 'money' });
                rows.push({ label: '单位缴纳 / 月', value: s.employerTotal, kind: 'money' });
                rows.push({ label: '到手（第 1 月）', value: n.net1, kind: 'money' });
                rows.push({ label: '到手（第 12 月）', value: n.net12, kind: 'money',
                    hint: '累计预扣逐级跳档，比第 1 月少 ' + yuan(n.net1 - n.net12) + ' 元是正常结果' });
                rows.push({ label: '全年个人缴纳', value: yr(s.personalTotal), kind: 'money', hint: '月缴 × 12' });
                rows.push({ label: '全年单位缴纳', value: yr(s.employerTotal), kind: 'money', hint: '月缴 × 12' });
                rows.push({ label: '全年个税', value: n.annualTax, kind: 'money' });
                rows.push({ label: '员工全年到手', value: n.annualNet, kind: 'money' });
                rows.push({ label: '企业全年用工成本（1 人）', value: yr(s.wage + s.employerTotal), kind: 'money' });

                if (!comp.compliant) {
                    rows.push({ label: '申报基数', value: comp.declaredBase, kind: 'money',
                        hint: '⚠️ 低于核定的 ' + yuan(comp.actualBase) + ' 元，差 ' + yuan(comp.gapBase) + ' 元' });
                    rows.push({ label: '一年少缴（单位 + 个人）', value: comp.annualGap, kind: 'money',
                        hint: '单位 ' + pct(comp.employerRate) + ' + 个人 ' + pct(comp.personalRate) + '，月差 '
                            + yuan(comp.monthlyGap) + ' 元' });
                    rows.push({ label: '追溯 ' + comp.years + ' 年的欠缴额', value: comp.totalArrears, kind: 'money' });
                    rows.push({ label: '滞纳金（按日万分之五）', value: comp.lateFee, kind: 'money',
                        hint: '年化 ' + pct(comp.lateFeeDailyRate * 365) + '，按平均欠缴 ' + (comp.years / 2) + ' 年估算' });
                    rows.push({ label: '罚款（1 ~ 3 倍）', value: comp.penaltyMin + ' ~ ' + comp.penaltyMax, kind: 'text' });
                    rows.push({ label: '合计代价', value: comp.totalMin + ' ~ ' + comp.totalMax, kind: 'text',
                        hint: '补缴 + 滞纳金 + 罚款；' + socialNote('compliance') });
                }

                var note = '缴费基数是**本人上年度月平均工资**：上年度工资总额 ' + yuan(wb.annualTotal)
                    + ' 元 ÷ ' + wb.months + ' 个月 = ' + yuan(wb.monthlyAverage) + ' 元/月'
                    + (wb.clamped === 'below' ? '（低于社平 60%，按下限 ' + yuan(wb.base) + ' 元保底）'
                        : wb.clamped === 'above' ? '（高于社平 300%，按上限 ' + yuan(wb.base) + ' 元封顶）' : '')
                    + ' → **缴费基数 ' + yuan(wb.base) + ' 元**。';
                if (wb.gap > 0) {
                    note += ' ⚠️ 速算器只按「税前月薪」算会得 ' + yuan(wb.naiveBase) + ' 元，**少算 '
                        + yuan(wb.gap) + ' 元基数** —— 奖金、津贴、加班都属于工资总额，都要进这个口径。';
                }
                note += ' 公积金：基数 ' + yuan(hf.housingBase) + ' 元 × ' + pct(hf.housingRate) + ' = '
                    + yuan(hf.personal) + ' 元/月，其中免税 ' + yuan(hf.taxFree) + ' 元'
                    + (hf.taxable > 0 ? '，**超标 ' + yuan(hf.taxable) + ' 元要并入工资计税**（基数超社平 3 倍）' : '')
                    + '。';
                note += ' 个人五险一金 **' + yuan(s.personalTotal) + ' 元/月**，单位 **'
                    + yuan(s.employerTotal) + ' 元/月**。';
                if (!comp.compliant) {
                    note += ' ⚠️ 单位按 ' + yuan(comp.declaredBase) + ' 元申报（比核定基数低 '
                        + yuan(comp.gapBase) + ' 元）：一年少缴 ' + yuan(comp.annualGap) + ' 元，追溯 '
                        + comp.years + ' 年的代价是 **' + yuan(comp.totalMin) + ' ~ ' + yuan(comp.totalMax)
                        + ' 元**（补缴 + 滞纳金 + 1~3 倍罚款）。';
                }

                var extras = [{
                    title: '工资总额口径（什么进基数、什么不进）',
                    note: socialNote('wage') + '；' + socialNote('adjust'),
                    table: {
                        head: ['计入缴费基数', '不计入缴费基数'],
                        rows: (function () {
                            var inc = ((S.rules() || {}).wageComposition || {}).included || [];
                            var exc = ((S.rules() || {}).wageComposition || {}).excluded || [];
                            var n2 = Math.max(inc.length, exc.length);
                            var out = [];
                            for (var i = 0; i < n2; i++) {
                                out.push([inc[i] ? inc[i].label : '—', exc[i] || '—']);
                            }
                            return out;
                        })()
                    }
                }, {
                    title: '五险一金逐项明细',
                    note: '工伤、生育个人不缴（生育已并入职工医保）—— 「个人 0 元」不是漏算',
                    table: {
                        head: ['项目', '个人比例', '单位比例', '个人（月）', '单位（月）'],
                        rows: s.items.map(function (it) {
                            return [it.name, pct(it.personalRate), pct(it.employerRate),
                                { value: it.personal, kind: 'money' }, { value: it.employer, kind: 'money' }];
                        }).concat([
                            ['住房公积金', pct(s.housingRate), pct(s.housingRate),
                                { value: s.housingPersonal, kind: 'money' }, { value: s.housingEmployer, kind: 'money' }],
                            ['合计', '—', '—', { value: s.personalTotal, kind: 'money' }, { value: s.employerTotal, kind: 'money' }]
                        ])
                    }
                }, {
                    title: '申报基数对照（按社保法第八十六条）',
                    note: socialNote('compliance'),
                    table: {
                        head: ['项目', '金额'],
                        rows: [
                            ['核定的缴费基数', { value: comp.actualBase, kind: 'money' }],
                            ['单位申报的基数', { value: comp.declaredBase, kind: 'money' }],
                            ['基数差额', { value: comp.gapBase, kind: 'money' }],
                            ['每月少缴（单位 + 个人）', { value: comp.monthlyGap, kind: 'money' }],
                            ['每年少缴', { value: comp.annualGap, kind: 'money' }],
                            ['追溯 ' + comp.years + ' 年欠缴额', { value: comp.totalArrears, kind: 'money' }],
                            ['滞纳金（日万分之五，年化 ' + pct(comp.lateFeeDailyRate * 365) + '）', { value: comp.lateFee, kind: 'money' }],
                            ['罚款（1 倍）', { value: comp.penaltyMin, kind: 'money' }],
                            ['罚款（3 倍）', { value: comp.penaltyMax, kind: 'money' }],
                            ['合计代价（最低 ~ 最高）', comp.compliant ? '足额申报，无代价'
                                : yuan(comp.totalMin) + ' ~ ' + yuan(comp.totalMax) + ' 元']
                        ]
                    }
                }];

                var steps = [{
                    title: '本人上年度月平均工资 → 缴费基数',
                    rows: [
                        { label: '上年度工资总额', value: wb.annualTotal, format: 'money',
                            note: '（月工资 + 津贴补贴 + 加班工资）× 计薪月数 + 全年奖金' },
                        { label: '实际计薪月数', value: wb.months, format: 'text' },
                        { label: '上年度月平均工资', value: wb.monthlyAverage, format: 'money' },
                        { label: '速算器口径（只按本月工资）', value: wb.naiveBase, format: 'money' },
                        { label: '缴费基数', value: wb.base, format: 'money' }
                    ],
                    footnote: wb.gap > 0
                        ? '速算器少算 ' + yuan(wb.gap) + ' 元基数 —— 奖金、津贴、加班都属于工资总额'
                        : '基数一年一调（多数地区每年 7 月随上年度社平工资公布调整），不是每月跟着工资变'
                }, {
                    title: '基数上下限（60% 保底 / 300% 封顶）',
                    rows: [
                        { label: '当地上年度社平工资（月）', value: socialAverage, format: 'money' },
                        { label: '下限（60%）', value: wb.baseMin, format: 'money' },
                        { label: '上限（300%）', value: wb.baseMax, format: 'money' },
                        { label: '核定结果', value: { below: '按下限保底', above: '按上限封顶', within: '未触及上下限', none: '未填工资' }[wb.clamped], format: 'text' }
                    ],
                    footnote: '工资 3000 按下限缴、工资 5 万只按 3 倍封顶数缴 —— 缴费基数不是工资'
                }, {
                    title: '公积金免税的两个上限（且的关系）',
                    rows: [
                        { label: '公积金缴存基数', value: hf.housingBase, format: 'money' },
                        { label: '免税基数上限（社平 3 倍）', value: hf.capBase, format: 'money' },
                        { label: '缴存比例', value: hf.housingRate, format: 'percent' },
                        { label: '个人缴存额', value: hf.personal, format: 'money' },
                        { label: '免税部分', value: hf.taxFree, format: 'money' },
                        { label: '超标并入工资计税', value: hf.taxable, format: 'money' }
                    ],
                    footnote: '比例 ≤12% **且** 基数 ≤ 社平 3 倍，两个条件都满足才免征个税'
                }, {
                    title: '申报基数差额与代价',
                    rows: [
                        { label: '核定的缴费基数', value: comp.actualBase, format: 'money' },
                        { label: '单位申报的基数', value: comp.declaredBase, format: 'money' },
                        { label: '每月少缴（单位 + 个人）', value: comp.monthlyGap, format: 'money' },
                        { label: '追溯 ' + comp.years + ' 年欠缴额', value: comp.totalArrears, format: 'money' },
                        { label: '滞纳金（日万分之五）', value: comp.lateFee, format: 'money' },
                        { label: '合计代价（最低）', value: comp.totalMin, format: 'money' }
                    ],
                    footnote: comp.compliant ? '足额申报，无代价' : socialNote('compliance')
                }];

                return {
                    primary: { label: '个人五险一金 / 月', value: s.personalTotal, kind: 'money',
                        hint: '缴费基数 ' + yuan(wb.base) + ' 元（上年度月平均 ' + yuan(wb.monthlyAverage) + ' 元）' },
                    rows: rows,
                    note: note,
                    extras: extras,
                    steps: steps
                };
            }
        },
        {
            // 阶段17 17C-4（v1.48.0 铺齐 → **v1.62.0 做深**）。排在 vat deep 之后 ——
            // 附加税的计税依据是「实际缴纳的增值税」，顺序不是随意排的。
            //
            // 17C-4 v1.48.0 交付的是「铺齐」：本条目当时只有元数据，字段与计算**共享速算器**。
            // 速算器已经算到了「城建税三档 7/5/1% + 教育费附加 3% + 地方教育附加 2% + 六税两费减半
            // + 印花税 17 个税目 + 不含列明的增值税」—— 但它的「实际缴纳的增值税」只是一个输入框，
            // 而法定口径要做**三处方向各不相同的调整**；印花税那边则只有「一张凭证、一个税目、一个金额」。
            //
            // 四处具体的口径差：
            //
            //   ① 附加税的计税依据是「**依法实际缴纳**」的增值税、消费税，不是申报表的应纳数，
            //      更不是销售额。三处调整**方向相反**，记反一处就是整段错 ——
            //        · 增值税期末留抵退税额：**允许**从计税依据中扣除（财税〔2018〕80 号）；
            //        · 即征即退 / 先征后返退还的增值税：**不扣**，已征的附加税也**不退还**；
            //        · 进口货物 / 境外单位代扣代缴的增值税：**根本不附征**（城建税法第三条）。
            //      实测（市区、减半后综合 6%）：申报期应纳 10 万、本期留抵退税 3 万 →
            //      计税依据 **7 万**（不是 10 万），附加税 4200 而非 6000，**差 1800**；
            //      同样 3 万若是即征即退 → 计税依据**仍是 10 万**（扣了反而少缴 1800）；
            //      进口环节缴增值税 50 万 → 不附征，误算进去就**多缴 3 万**。
            //
            //   ② 小规模纳税人月销售额 10 万（季度 30 万）以下**免征增值税 → 附加税跟着免**，
            //      而且是**整段跳变**不是渐进：季度 28 万 → 附加税 0；季度 31 万 → 按 1% 缴增值税
            //      3100 元、附加税 186 元。
            //
            //   ③ 印花税同一份凭证载有**两个以上税目**：分别列明金额的**分别适用**税率，
            //      **未分别列明的从高**适用（第九条）—— 这是「签合同多写几行字」能直接省的钱。
            //      实测：设备买卖 100 万（万分之三）+ 租赁 10 万（千分之一），分别列明 → 400（减半 200）；
            //      未分别列明 → 110 万 × 千分之一 = 1100（**减半 550**），**差 350**。
            //
            //   ④ 另外三处速算器收不下的口径：
            //        · 签订时**无法确定金额**的：先按 **5 元**贴花，结算时按实际金额**多退少补**
            //          （框架协议最常见：结算 1000 万 → 1500，已贴 5 元 → **应补 1495**）；
            //        · 营业账簿只对**增加部分**计税（第十一条）：上年 500 万 → 本年 800 万，
            //          增加额 300 万 × 0.25‰ = 750（减半 **375**），误按 800 万全额是 **1000**，**差 625**；
            //        · 在**境外书立、境内使用**的应税凭证**同样要贴花** —— 不是「国外签的就不用贴」。
            //
            // 口径仍同源：三处调整、多税目从高、先贴 5 元、账簿增加额一律走 `EuriskoSurtaxQuick`
            // （新增 surtaxBaseOf / stampMixedOf / stampSettlementOf / accountBookOf 四个可复用函数）。
            id: 'surtax-stamp-deep', name: '附加税与印花税',
            subtitle: '实缴增值税的三处调整、多税目从高、账簿只对增加额',
            icon: 'fa-tags', status: 'deep',
            nextTools: ['surtax-stamp', 'vat', 'corporate-income-tax', 'business-income'],
            policyKey: 'surtax',
            fields: [
                { key: 'variant', step: 'identity', label: '算哪一项', type: 'select', default: 'surtaxGeneral',
                    options: [
                        { value: 'surtaxGeneral', label: '附加税（一般纳税人）' },
                        { value: 'surtaxSmall', label: '附加税（小规模纳税人）' },
                        { value: 'stamp', label: '印花税' }
                    ],
                    hint: '附加税跟着**实际缴纳的增值税**走、印花税跟着**凭证金额**走 —— 两个基数不是一个口径，先定算哪一项' },
                { key: 'location', step: 'identity', label: '纳税人所在地', type: 'select', default: 'urban',
                    options: [{ value: 'urban', label: '市区（城建税 7%）' }, { value: 'county', label: '县城、镇（5%）' }, { value: 'other', label: '其他（1%）' }],
                    when: { key: 'variant', in: ['surtaxGeneral', 'surtaxSmall'] },
                    hint: '三档按**所在地**划分，不是按企业规模' },
                { key: 'signedWhere', step: 'identity', label: '凭证书立地', type: 'select', default: 'domestic',
                    options: [{ value: 'domestic', label: '境内书立' }, { value: 'overseas', label: '境外书立、境内使用' }],
                    when: { key: 'variant', in: ['stamp'] },
                    hint: stampNote('overseas') },

                // ===== 附加税：计税依据是「依法实际缴纳」的数，三处调整方向各不相同 =====
                { key: 'vatPayable', step: 'basis', label: '申报期实际缴纳的增值税（境内）', type: 'money', default: 100000,
                    when: { key: 'variant', in: ['surtaxGeneral'] }, hint: surtaxNote('base') },
                { key: 'quarterlySales', step: 'basis', label: '本季度销售额', type: 'money', default: 280000,
                    when: { key: 'variant', in: ['surtaxSmall'] },
                    hint: '季度销售额 ≤ 30 万（月 10 万）**免征增值税 → 附加税跟着免**；超过后按 1% 征收率缴增值税' },
                { key: 'creditRefund', step: 'basis', label: '本期收到的增值税期末留抵退税', type: 'money', default: 30000,
                    when: { key: 'variant', in: ['surtaxGeneral'] },
                    hint: surtaxNote('credit') + ' —— **要扣**' },
                { key: 'instantRefund', step: 'basis', label: '本期收到的即征即退 / 先征后返退税', type: 'money', default: 0,
                    when: { key: 'variant', in: ['surtaxGeneral'] },
                    hint: surtaxNote('instant') + ' —— **不扣**，与留抵退税方向相反' },
                { key: 'importVat', step: 'basis', label: '进口环节 / 代扣代缴的增值税', type: 'money', default: 0,
                    when: { key: 'variant', in: ['surtaxGeneral', 'surtaxSmall'] },
                    hint: surtaxNote('importVat') + ' —— **不附征**' },
                { key: 'consumption', step: 'basis', label: '实际缴纳的消费税', type: 'money', default: 0,
                    when: { key: 'variant', in: ['surtaxGeneral', 'surtaxSmall'] } },

                // ===== 印花税：一张凭证的四种形态 =====
                { key: 'stampMode', step: 'basis', label: '凭证形态', type: 'select', default: 'single',
                    options: [
                        { value: 'single', label: '单税目、金额已列明' },
                        { value: 'mixed', label: '同一凭证载有两个以上税目' },
                        { value: 'undetermined', label: '签订时金额未列明（先贴 5 元）' },
                        { value: 'capital', label: '营业账簿（只对增加额计税）' }
                    ],
                    when: { key: 'variant', in: ['stamp'] } },
                { key: 'item', step: 'basis', label: '税目', type: 'select', default: 'sale',
                    options: stampItemOptions(),
                    when: { key: 'stampMode', in: ['single', 'mixed', 'undetermined'] } },
                { key: 'amount', step: 'basis', label: '凭证金额', type: 'money', default: 1000000,
                    when: { key: 'stampMode', in: ['single'] } },
                { key: 'stampVat', step: 'basis', label: '单独列明的增值税', type: 'money', default: 0,
                    when: { key: 'stampMode', in: ['single'] }, hint: stampNote('excludeVat') },
                { key: 'secondItem', step: 'basis', label: '第二个税目', type: 'select', default: 'lease',
                    options: stampItemOptions(), when: { key: 'stampMode', in: ['mixed'] } },
                { key: 'secondAmount', step: 'basis', label: '第二个税目金额', type: 'money', default: 100000,
                    when: { key: 'stampMode', in: ['mixed'] } },
                { key: 'secondVat', step: 'basis', label: '第二个税目单独列明的增值税', type: 'money', default: 0,
                    when: { key: 'stampMode', in: ['mixed'] } },
                { key: 'separatelyStated', step: 'basis', label: '是否分别列明金额', type: 'select', default: 'separate',
                    options: [{ value: 'separate', label: '分别列明（分别适用税率）' }, { value: 'mixed', label: '未分别列明（从高适用）' }],
                    when: { key: 'stampMode', in: ['mixed'] }, hint: stampNote('mixed') },
                { key: 'settledAmount', step: 'basis', label: '实际结算金额', type: 'money', default: 10000000,
                    when: { key: 'stampMode', in: ['undetermined'] },
                    hint: '签订时金额未列明的先按 **5 元**贴花，结算时按实际金额计税、**多退少补**' },
                { key: 'prevCapital', step: 'basis', label: '上年末实收资本（股本）+ 资本公积', type: 'money', default: 5000000,
                    when: { key: 'stampMode', in: ['capital'] } },
                { key: 'currCapital', step: 'basis', label: '本年末实收资本（股本）+ 资本公积', type: 'money', default: 8000000,
                    when: { key: 'stampMode', in: ['capital'] }, hint: stampNote('increment') },

                { key: 'halve', step: 'policy', label: '享受“六税两费”减半', type: 'switch', default: true,
                    hint: surtaxNote('halveExpiry') }
            ],
            steps: [
                { key: 'identity', title: '算哪一项与所在地', why: '附加税跟着**实际缴纳的增值税**走、印花税跟着**凭证金额**走；城建税三档按**所在地**划分，不是按企业规模' },
                { key: 'basis', title: '实缴增值税的三处调整 / 凭证金额与税目', why: '留抵退税**要扣**、即征即退**不扣**、进口代扣代缴**不附征** —— 三处方向不同；印花税同一凭证多税目未分别列明要**从高**' },
                { key: 'policy', title: '减半与到期对照', why: '“六税两费”减半执行至 2027-12-31，做三年预算不能只按减半后的数估' }
            ],
            pitfalls: [
                '附加税的计税依据是**依法实际缴纳**的增值税 + 消费税，不是申报表的应纳数，更不是销售额',
                '**留抵退税要扣**、**即征即退不扣**（已缴的附加税也不退还）—— 同样是退税，处理方向相反',
                '进口货物或境外单位向境内销售劳务、服务、无形资产缴纳的增值税**不征收**城建税，不要把它算进计税依据',
                '小规模纳税人季度销售额 ≤ 30 万（月 10 万）**免征增值税 → 附加税跟着免**，且是整段跳变不是渐进',
                '同一凭证载有两个以上税目：**未分别列明金额的从高适用**税率 —— 合同里多写几行金额就能省下这笔钱',
                '印花税计税依据**不含单独列明的增值税**；没列明的按合同全额计征',
                '营业账簿只对**增加部分**计税，不是每年按实收资本 + 资本公积总额重贴一遍（误算会多缴）',
                '签订时**金额未列明**的先按 **5 元**贴花，结算时按实际金额**多退少补** —— 不是「等结算完再贴」',
                '**境外书立、境内使用**的应税凭证同样要贴花，不是「国外签的合同就不用贴」',
                '证券交易印花税**不享受**六税两费减半，且**只对出让方**征收',
                '“六税两费”减半执行至 **2027-12-31**，到期后若无延续文件恢复按法定税率全额征收'
            ],
            compute: function (v) {
                var Q = window.EuriskoSurtaxQuick;
                if (!Q) return null;
                var yuan = function (x) { return (Math.round((Number(x) || 0) * 100) / 100).toFixed(2); };
                var pct = function (r) { return Math.round((Number(r) || 0) * 10000) / 100 + '%'; };
                var halve = !!v.halve;

                // ===== 印花税 =====
                if (v.variant === 'stamp') {
                    var mode = v.stampMode || 'single';
                    var overseas = v.signedWhere === 'overseas';
                    var stampVatNote = stampNote('excludeVat');
                    var overseasRow = overseas
                        ? [{ label: '凭证书立地', value: '境外书立、境内使用', kind: 'text', hint: stampNote('overseas') }]
                        : [{ label: '凭证书立地', value: '境内书立', kind: 'text' }];

                    // ④ 营业账簿只对增加部分计税
                    if (mode === 'capital') {
                        var ab = Q.accountBookOf({ prevCapital: v.prevCapital, currCapital: v.currCapital, halve: halve });
                        return {
                            primary: { label: '应纳印花税（营业账簿）', value: ab.tax, kind: 'money',
                                hint: '实收资本（股本）+ 资本公积**增加额** ' + yuan(ab.increment) + ' 元 × ' + ab.rateText },
                            rows: overseasRow.concat([
                                { label: '上年末实收资本（股本）+ 资本公积', value: ab.prevCapital, kind: 'money' },
                                { label: '本年末实收资本（股本）+ 资本公积', value: ab.currCapital, kind: 'money' },
                                { label: '**增加额**（计税依据）', value: ab.increment, kind: 'money',
                                    hint: stampNote('increment') },
                                { label: '税率', value: ab.rateText, kind: 'text' },
                                { label: '法定税额（未减半）', value: ab.statutoryTax, kind: 'money' },
                                { label: '减半优惠', value: Math.max(ab.statutoryTax - ab.tax, 0), kind: 'money' },
                                { label: '若误按本年末全额贴（错）', value: ab.fullTax, kind: 'money',
                                    hint: ab.gap > 0 ? '⚠️ **多缴 ' + yuan(ab.gap) + ' 元** —— 账簿只对增加部分计税' : '与按增加额一致' }
                            ]),
                            note: '营业账簿按实收资本（股本）、资本公积**合计金额的增加部分**计税：'
                                + yuan(ab.currCapital) + ' − ' + yuan(ab.prevCapital) + ' = **' + yuan(ab.increment)
                                + ' 元** × ' + ab.rateText + ' = ' + yuan(ab.tax) + ' 元'
                                + (halve ? '（减半后）' : '（未享受减半）')
                                + '。不是每年按总额重贴一遍 —— 误按 ' + yuan(ab.currCapital)
                                + ' 元全额贴是 ' + yuan(ab.fullTax) + ' 元，'
                                + (ab.gap > 0 ? '**多缴 ' + yuan(ab.gap) + ' 元**' : '两者一致')
                                + (ab.decreased ? '。注意：本年末**低于**上年末，增加额为 0，本年无需贴花（减少不退税）' : '')
                                + '。',
                            extras: [{
                                title: '营业账簿：按增加额 vs 按总额（误算会多缴）',
                                note: stampNote('increment'),
                                table: {
                                    head: ['项目', '金额'],
                                    rows: [
                                        ['上年末实收资本（股本）+ 资本公积', { value: ab.prevCapital, kind: 'money' }],
                                        ['本年末实收资本（股本）+ 资本公积', { value: ab.currCapital, kind: 'money' }],
                                        ['**增加额**（合法计税依据）', { value: ab.increment, kind: 'money' }],
                                        ['按增加额应纳', { value: ab.tax, kind: 'money' }],
                                        ['按总额误算', { value: ab.fullTax, kind: 'money' }],
                                        ['差额（多缴）', { value: ab.gap, kind: 'money' }]
                                    ]
                                }
                            }],
                            steps: [{
                                title: '① 确定增加额（不是总额）',
                                rows: [
                                    { label: '上年末实收资本（股本）+ 资本公积', value: ab.prevCapital, format: 'money' },
                                    { label: '本年末实收资本（股本）+ 资本公积', value: ab.currCapital, format: 'money' },
                                    { label: '增加额', value: ab.increment, format: 'money' }
                                ],
                                footnote: stampNote('increment')
                            }, {
                                title: '② 按 0.25‰ 计税',
                                rows: [
                                    { label: '计税依据（增加额）', value: ab.increment, format: 'money' },
                                    { label: '税率', value: ab.rateText, format: 'text' },
                                    { label: '法定税额', value: ab.statutoryTax, format: 'money' },
                                    { label: '应纳印花税', value: ab.tax, format: 'money' }
                                ],
                                footnote: halve ? '“六税两费”减半后' : '未享受减半'
                            }]
                        };
                    }

                    // ④ 签订时金额未列明：先贴 5 元，结算时多退少补
                    if (mode === 'undetermined') {
                        var st = Q.stampSettlementOf({ item: v.item, settledAmount: v.settledAmount, vat: v.stampVat, halve: halve });
                        var s0 = st.settled;
                        return {
                            primary: { label: '结算时应补印花税', value: st.topUp > 0 ? st.topUp : 0, kind: 'money',
                                hint: '结算税额 ' + yuan(st.tax) + ' 元 − 已贴 ' + yuan(st.prepaid) + ' 元' },
                            rows: overseasRow.concat([
                                { label: '税目', value: s0.name, kind: 'text' },
                                { label: '税率', value: s0.rateText, kind: 'text' },
                                { label: '签订时是否已贴花', value: '已按 ' + yuan(st.prepaid) + ' 元贴花', kind: 'text',
                                    hint: '签订时无法确定金额的，先按 5 元贴花' },
                                { label: '实际结算金额', value: st.settledAmount, kind: 'money' },
                                { label: '计税依据（不含列明的增值税）', value: s0.base, kind: 'money', hint: stampVatNote },
                                { label: '结算时应纳税额', value: st.tax, kind: 'money' },
                                { label: '**应补（多退少补）**', value: st.topUp, kind: 'money',
                                    hint: st.topUp > 0 ? '结算金额大于已贴部分，需补缴' : st.topUp < 0 ? '可申请退还 ' + yuan(st.refundable) + ' 元' : '刚好' },
                                { label: '法定税额（未减半）', value: s0.statutoryTax, kind: 'money' }
                            ]),
                            note: '签订时金额未列明的应税凭证，先按 **' + yuan(st.prepaid) + ' 元**贴花，'
                                + '以后结算时再按实际金额计税、**多退少补**。本次实际结算 '
                                + yuan(st.settledAmount) + ' 元（' + s0.name + ' ' + s0.rateText + '）'
                                + ' → 应纳税额 ' + yuan(st.tax) + ' 元，'
                                + (st.topUp > 0 ? '**应补 ' + yuan(st.topUp) + ' 元**'
                                    : st.topUp < 0 ? '**可申请退还 ' + yuan(st.refundable) + ' 元**' : '不需补退')
                                + '。注意：签的时候就该贴那 5 元，等结算完才贴，中间这段时间属于未按规定贴花。',
                            extras: [{
                                title: '未列明金额：先贴 5 元，结算多退少补',
                                note: '《印花税法》第六条：应税合同、产权转移书据未列明金额的，先按 5 元贴花，以后结算时按实际金额计税',
                                table: {
                                    head: ['项目', '金额'],
                                    rows: [
                                        ['签订时先贴花', { value: st.prepaid, kind: 'money' }],
                                        ['实际结算金额', { value: st.settledAmount, kind: 'money' }],
                                        ['结算时应纳税额', { value: st.tax, kind: 'money' }],
                                        [st.topUp > 0 ? '**应补缴**' : '**应退还**', { value: Math.abs(st.topUp), kind: 'money' }]
                                    ]
                                }
                            }],
                            steps: [{
                                title: '① 签订时先按 5 元贴花',
                                rows: [
                                    { label: '签订时金额是否列明', value: '未列明', format: 'text' },
                                    { label: '先贴花金额', value: st.prepaid, format: 'money' }
                                ],
                                footnote: '未列明金额的应税凭证，先按 5 元贴花，不是等结算完再贴'
                            }, {
                                title: '② 结算时按实际金额计税',
                                rows: [
                                    { label: '实际结算金额', value: st.settledAmount, format: 'money' },
                                    { label: '税率', value: s0.rateText, format: 'text' },
                                    { label: '结算时应纳税额', value: st.tax, format: 'money' },
                                    { label: '已贴花', value: st.prepaid, format: 'money' },
                                    { label: '应补（退）', value: st.topUp, format: 'money' }
                                ],
                                footnote: '多退少补：结算金额小于预计的，多贴的部分可申请退还'
                            }]
                        };
                    }

                    // ③ 同一凭证载有两个以上税目：分别列明 vs 从高
                    if (mode === 'mixed') {
                        var mx = Q.stampMixedOf({
                            item: v.item, amount: v.amount, vat: v.stampVat,
                            secondItem: v.secondItem, secondAmount: v.secondAmount, secondVat: v.secondVat,
                            halve: halve, separatelyStated: v.separatelyStated !== 'mixed'
                        });
                        var f1 = mx.first;
                        var f2 = mx.second;
                        return {
                            primary: { label: '应纳印花税（同一凭证多税目）', value: mx.tax, kind: 'money',
                                hint: mx.separatelyStated ? '分别列明金额，分别适用税率' : '未分别列明金额，**从高**适用 ' + mx.higherRateText },
                            rows: overseasRow.concat([
                                { label: '税目一', value: f1.name + '（' + f1.rateText + '）', kind: 'text' },
                                { label: '税目一计税金额', value: f1.base, kind: 'money' },
                                { label: '税目二', value: f2.name + '（' + f2.rateText + '）', kind: 'text' },
                                { label: '税目二计税金额', value: f2.base, kind: 'money' },
                                { label: '是否分别列明金额', value: mx.separatelyStated ? '是（分别适用税率）' : '否（**从高适用**）', kind: 'text' },
                                { label: '分别列明时应纳', value: mx.separated, kind: 'money' },
                                { label: '未分别列明时（从高 ' + mx.higherRateText + '）', value: mx.merged, kind: 'money',
                                    hint: '合并金额 ' + yuan(mx.mergedAmount) + ' 元 × ' + mx.higherRateText },
                                { label: '**两种写法的差额**', value: mx.gap, kind: 'money',
                                    hint: mx.gap > 0 ? '⚠️ 合同里把两个税目的金额分开写，能省下 ' + yuan(mx.gap) + ' 元' : '两种写法一致' },
                                { label: '法定合计（未减半）', value: mx.statutoryTax, kind: 'money' }
                            ]),
                            note: '同一凭证载有两个以上税目事项：'
                                + (mx.separatelyStated
                                    ? '**分别列明金额**的分别适用税率 —— ' + f1.name + ' ' + yuan(f1.base) + ' 元 × '
                                        + f1.rateText + ' + ' + f2.name + ' ' + yuan(f2.base) + ' 元 × ' + f2.rateText
                                        + ' = **' + yuan(mx.separated) + ' 元**'
                                    : '**未分别列明金额**的**从高适用**税率 —— 合并 ' + yuan(mx.mergedAmount)
                                        + ' 元 × ' + mx.higherRateText + '（' + mx.higherName + '）= **' + yuan(mx.merged) + ' 元**')
                                + '。两种写法差 **' + yuan(mx.gap) + ' 元**'
                                + (mx.gap > 0 ? ' —— 这一行金额写不写清楚，直接决定缴多少。' : '。')
                                + '另：计税依据不含单独列明的增值税。',
                            extras: [{
                                title: '分别列明 vs 未分别列明（从高）',
                                note: stampNote('mixed'),
                                table: {
                                    head: ['写法', '计税方式', '应纳税额'],
                                    rows: [
                                        ['分别列明金额', f1.name + ' ' + yuan(f1.base) + ' × ' + f1.rateText + '，'
                                            + f2.name + ' ' + yuan(f2.base) + ' × ' + f2.rateText, { value: mx.separated, kind: 'money' }],
                                        ['未分别列明（从高）', '合并 ' + yuan(mx.mergedAmount) + ' × ' + mx.higherRateText
                                            + '（' + mx.higherName + '）', { value: mx.merged, kind: 'money' }],
                                        ['**差额**', '合同里分开写金额能省下的', { value: mx.gap, kind: 'money' }]
                                    ]
                                }
                            }],
                            steps: [{
                                title: '① 两个税目分别计税',
                                rows: [
                                    { label: f1.name, value: f1.base, format: 'money', note: f1.rateText },
                                    { label: f2.name, value: f2.base, format: 'money', note: f2.rateText },
                                    { label: '分别列明合计', value: mx.separated, format: 'money' }
                                ],
                                footnote: stampNote('excludeVat')
                            }, {
                                title: '② 未分别列明：从高适用',
                                rows: [
                                    { label: '合并金额', value: mx.mergedAmount, format: 'money' },
                                    { label: '从高税目', value: mx.higherName, format: 'text' },
                                    { label: '从高税率', value: mx.higherRateText, format: 'text' },
                                    { label: '从高应纳税额', value: mx.merged, format: 'money' },
                                    { label: '与分别列明的差额', value: mx.gap, format: 'money' }
                                ],
                                footnote: stampNote('mixed')
                            }]
                        };
                    }

                    // 单税目、金额已列明
                    var s = Q.stampDutyOf({ item: v.item, amount: v.amount, vat: v.stampVat, halve: halve });
                    return {
                        primary: { label: '应纳印花税', value: s.tax, kind: 'money',
                            hint: s.name + ' ' + yuan(s.base) + ' 元 × ' + s.rateText },
                        rows: overseasRow.concat([
                            { label: '税目', value: s.name, kind: 'text' },
                            { label: '税率', value: s.rateText, kind: 'text' },
                            { label: '计税依据', value: s.baseName, kind: 'text' },
                            { label: '凭证金额', value: s.amount, kind: 'money', hint: stampVatNote },
                            { label: '其中单独列明的增值税', value: s.vat, kind: 'money' },
                            { label: '计税金额（不含列明的增值税）', value: s.base, kind: 'money' },
                            { label: '法定税额（未减半）', value: s.statutoryTax, kind: 'money' },
                            { label: '减半优惠', value: s.saved, kind: 'money',
                                hint: s.halveApplicable ? '' : '证券交易印花税不享受减半' },
                            { label: '到期后（2028 起按法定税率）', value: s.statutoryTax, kind: 'money',
                                hint: surtaxNote('halveExpiry') },
                            { label: '备注', value: s.note || '—', kind: 'text' }
                        ]),
                        note: s.name + '按应税凭证所列金额 ' + yuan(s.amount) + ' 元'
                            + (s.vat > 0 ? '（扣除单独列明的增值税 ' + yuan(s.vat) + ' 元）' : '')
                            + '计税 = ' + yuan(s.base) + ' 元 × ' + s.rateText
                            + ' = **' + yuan(s.tax) + ' 元**'
                            + (halve && !s.halveApplicable ? '（证券交易印花税**不享受**六税两费减半）' : '')
                            + '。若这份凭证还载有其他税目事项，未分别列明金额的会**从高适用**税率；'
                            + '签订时金额未列明的先按 5 元贴花、结算时多退少补。',
                        extras: [{
                            title: '六税两费减半范围（证券交易不在内）',
                            note: surtaxNote('halveExpiry'),
                            table: {
                                head: ['项目', '是否减半', '法定税额', '减半后'],
                                rows: [
                                    [s.name, s.halveApplicable ? '是' : '**否**（证券交易）',
                                        { value: s.statutoryTax, kind: 'money' }, { value: s.tax, kind: 'money' }]
                                ]
                            }
                        }, {
                            title: '同一凭证多税目 / 未列明金额（换一种写法缴多少）',
                            note: stampNote('mixed'),
                            table: {
                                head: ['凭证形态', '计税方式'],
                                rows: [
                                    ['单税目、金额已列明', '按所列金额 × 本税目税率'],
                                    ['同一凭证两个以上税目（分别列明）', '分别适用各自税率'],
                                    ['同一凭证两个以上税目（未分别列明）', '**从高适用**税率'],
                                    ['签订时金额未列明', '先按 5 元贴花，结算时多退少补'],
                                    ['营业账簿', '只对**增加部分**计税（0.25‰）']
                                ]
                            }
                        }],
                        steps: [{
                            title: '① 确定计税依据（不含列明的增值税）',
                            rows: [
                                { label: '凭证金额', value: s.amount, format: 'money' },
                                { label: '单独列明的增值税', value: s.vat, format: 'money' },
                                { label: '计税金额', value: s.base, format: 'money' }
                            ],
                            footnote: stampNote('excludeVat')
                        }, {
                            title: '② 按税目税率计税',
                            rows: [
                                { label: '税目', value: s.name, format: 'text' },
                                { label: '税率', value: s.rateText, format: 'text' },
                                { label: '计税金额', value: s.base, format: 'money' },
                                { label: '法定税额', value: s.statutoryTax, format: 'money' },
                                { label: '应纳印花税', value: s.tax, format: 'money' }
                            ],
                            footnote: s.halveApplicable ? '“六税两费”减半后' : '证券交易印花税不享受减半，且只对出让方征收'
                        }]
                    };
                }

                // ===== 附加税 =====
                var isSmall = v.variant === 'surtaxSmall';
                var b = Q.surtaxBaseOf({
                    taxpayer: isSmall ? 'small' : 'general',
                    vatPayable: v.vatPayable, consumption: v.consumption,
                    creditRefund: v.creditRefund, instantRefund: v.instantRefund,
                    importVat: v.importVat, quarterlySales: v.quarterlySales
                });
                var r = Q.surtaxOf({
                    vat: Math.max(b.domesticVat - b.deductedCredit, 0),
                    consumption: b.consumption, location: v.location, halve: halve
                });
                var rNaive = Q.surtaxOf({ vat: b.vatPayable + b.importVat, consumption: b.consumption, location: v.location, halve: halve });
                var rFull = Q.surtaxOf({
                    vat: Math.max(b.domesticVat - b.deductedCredit, 0),
                    consumption: b.consumption, location: v.location, halve: false
                });

                var rows = [
                    { label: '纳税人类型', value: isSmall ? '小规模纳税人' : '一般纳税人', kind: 'text' }
                ];
                if (isSmall) {
                    rows.push({ label: '本季度销售额', value: b.quarterlySales, kind: 'money',
                        hint: b.smallExempt ? '≤ 30 万，免征增值税 → **附加税跟着免**' : '> 30 万，按 1% 征收率缴增值税' });
                    rows.push({ label: '实际缴纳的增值税（1% 征收率）', value: b.smallVat, kind: 'money' });
                } else {
                    rows.push({ label: '申报期实际缴纳的增值税（境内）', value: b.vatPayable, kind: 'money' });
                    rows.push({ label: '减：增值税期末留抵退税', value: -b.deductedCredit, kind: 'money',
                        hint: b.deductedCredit > 0 ? surtaxNote('credit') : '本期无留抵退税' });
                }
                rows.push({ label: '实际缴纳的消费税', value: b.consumption, kind: 'money' });
                rows.push({ label: '**计税依据**', value: b.base, kind: 'money',
                    hint: surtaxNote('base') });
                rows.push({ label: '若误按申报表应纳数（含进口）', value: b.naiveBase, kind: 'money',
                    hint: b.importVat > 0 ? surtaxNote('importVat') : '' });
                rows.push({ label: '两种口径的差额', value: b.gap, kind: 'money',
                    hint: b.gap > 0 ? '⚠️ 多算 ' + yuan(b.gap) + ' 元计税依据' : b.gap < 0 ? '少算 ' + yuan(-b.gap) + ' 元' : '一致' });
                rows.push({ label: '所在地', value: r.locationLabel, kind: 'text' });
                rows.push({ label: '城建税税率', value: r.cityRate, kind: 'percent' });
                rows.push({ label: '城建税', value: r.cityTax, kind: 'money' });
                rows.push({ label: '教育费附加（3%）', value: r.educationTax, kind: 'money' });
                rows.push({ label: '地方教育附加（2%）', value: r.localEducationTax, kind: 'money' });
                rows.push({ label: '**附加税费合计**', value: r.total, kind: 'money' });
                rows.push({ label: '综合负担率', value: r.effectiveRate, kind: 'percent' });
                rows.push({ label: '减半优惠', value: r.saved, kind: 'money' });
                rows.push({ label: '到期后（2028 起按 100%）', value: rFull.total, kind: 'money',
                    hint: surtaxNote('halveExpiry') });
                if (b.instantRefund > 0) {
                    rows.push({ label: '本期即征即退 / 先征后返退税', value: b.instantRefund, kind: 'money',
                        hint: surtaxNote('instant') + ' —— **不扣**，与留抵退税方向相反' });
                }
                if (b.importVat > 0) {
                    rows.push({ label: '进口环节 / 代扣代缴的增值税', value: b.importVat, kind: 'money',
                        hint: surtaxNote('importVat') + ' —— 误算进去会多缴 ' + yuan(rNaive.total - r.total) + ' 元' });
                }
                rows.push({ label: '按错误口径（含进口、不扣留抵退税）应缴', value: rNaive.total, kind: 'money',
                    hint: rNaive.total !== r.total ? '差 ' + yuan(rNaive.total - r.total) + ' 元' : '与法定口径一致' });

                var note = '附加税以**依法实际缴纳**的增值税、消费税为计税依据：'
                    + (isSmall
                        ? '本季度销售额 ' + yuan(b.quarterlySales) + ' 元'
                            + (b.smallExempt ? ' ≤ 30 万，**免征增值税 → 附加税跟着免**' : ' > 30 万，按 1% 征收率缴增值税 ' + yuan(b.smallVat) + ' 元')
                        : '境内实际缴纳增值税 ' + yuan(b.vatPayable) + ' 元'
                            + (b.deductedCredit > 0 ? ' − 留抵退税 ' + yuan(b.deductedCredit) + ' 元' : ''))
                    + (b.consumption > 0 ? ' + 消费税 ' + yuan(b.consumption) + ' 元' : '')
                    + ' = **' + yuan(b.base) + ' 元**'
                    + (b.instantRefund > 0 ? '（即征即退 ' + yuan(b.instantRefund) + ' 元**不扣**）' : '')
                    + (b.importVat > 0 ? '；进口 / 代扣代缴的 ' + yuan(b.importVat) + ' 元**不附征**' : '')
                    + '。' + r.locationLabel + '：城建税 ' + pct(r.cityRate) + ' + 教育费附加 3% + 地方教育附加 2%'
                    + ' = ' + pct(r.statutoryRate)
                    + (halve ? '，六税两费减半后 ' + pct(r.effectiveRate) : '')
                    + ' → **' + yuan(r.total) + ' 元**'
                    + (b.gap > 0 ? '。若误按申报表应纳数 ' + yuan(b.naiveBase) + ' 元算，会缴 ' + yuan(rNaive.total)
                        + ' 元，**多缴 ' + yuan(rNaive.total - r.total) + ' 元**' : '')
                    + '。另：减半执行至 2027-12-31，到期后按 ' + yuan(rFull.total) + ' 元征收。';

                var compareRows = Object.keys(r.compare).map(function (k) {
                    var c = r.compare[k];
                    return [c.label, { value: c.rate, kind: 'percent' }, { value: c.effectiveRate, kind: 'percent' },
                        { value: c.total, kind: 'money' }];
                });

                return {
                    primary: { label: '附加税费合计', value: r.total, kind: 'money',
                        hint: '计税依据 ' + yuan(b.base) + ' 元 × ' + pct(r.effectiveRate) },
                    rows: rows,
                    note: note,
                    extras: [{
                        title: '计税依据的三处调整（方向各不相同）',
                        note: surtaxNote('base'),
                        table: {
                            head: ['项目', '金额', '是否进计税依据'],
                            rows: [
                                [isSmall ? '按 1% 征收率实际缴纳的增值税' : '申报期实际缴纳的增值税（境内）',
                                    { value: b.domesticVat, kind: 'money' }, '进'],
                                ['减：增值税期末留抵退税额', { value: -b.deductedCredit, kind: 'money' }, '**扣**'],
                                ['即征即退 / 先征后返退还的增值税', { value: b.instantRefund, kind: 'money' }, '**不扣**'],
                                ['进口环节 / 代扣代缴的增值税', { value: b.importVat, kind: 'money' }, '**不附征**'],
                                ['实际缴纳的消费税', { value: b.consumption, kind: 'money' }, '进'],
                                ['**法定计税依据**', { value: b.base, kind: 'money' }, '—'],
                                ['误按申报表应纳数（含进口）', { value: b.naiveBase, kind: 'money' }, '—'],
                                ['**差额**', { value: b.gap, kind: 'money' }, '—']
                            ]
                        }
                    }, {
                        title: '三档所在地的综合负担率（城建税按所在地，不按企业规模）',
                        note: '市区 7% + 教育费附加 3% + 地方教育附加 2% = 12%；县城、镇 10%；其他 6%',
                        table: {
                            head: ['所在地', '法定综合负担率', halve ? '减半后' : '实际执行', '应缴附加税费'],
                            rows: compareRows
                        }
                    }, {
                        title: '减半到期对照（六税两费至 2027-12-31）',
                        note: surtaxNote('halveExpiry'),
                        table: {
                            head: ['口径', '综合负担率', '应缴附加税费'],
                            rows: [
                                ['法定（未减半）', { value: r.statutoryRate, kind: 'percent' }, { value: rFull.total, kind: 'money' }],
                                ['现行减半' + (halve ? '（当前）' : ''), { value: r.effectiveRate, kind: 'percent' }, { value: r.total, kind: 'money' }],
                                ['**差额**', { value: r.statutoryRate - r.effectiveRate, kind: 'percent' }, { value: r.saved, kind: 'money' }]
                            ]
                        }
                    }],
                    steps: [{
                        title: '① 确定「依法实际缴纳」的增值税',
                        rows: isSmall
                            ? [
                                { label: '本季度销售额', value: b.quarterlySales, format: 'money' },
                                { label: '免征门槛（季度）', value: b.smallThreshold.quarterly, format: 'money' },
                                { label: '是否免征增值税', value: b.smallExempt ? '是（附加税跟着免）' : '否', format: 'text' },
                                { label: '实际缴纳的增值税（1%）', value: b.smallVat, format: 'money' }
                            ]
                            : [
                                { label: '申报期实际缴纳的增值税', value: b.vatPayable, format: 'money' },
                                { label: '减：期末留抵退税额', value: b.deductedCredit, format: 'money' },
                                { label: '即征即退 / 先征后返（不扣）', value: b.instantRefund, format: 'money' },
                                { label: '进口 / 代扣代缴（不附征）', value: b.importVat, format: 'money' }
                            ],
                        footnote: isSmall
                            ? '季度销售额 ≤ 30 万（月 10 万）免征增值税 → 附加税跟着免，且是整段跳变'
                            : surtaxNote('credit') + '；' + surtaxNote('instant')
                    }, {
                        title: '② 计税依据（增值税 + 消费税）',
                        rows: [
                            { label: '实际缴纳的增值税', value: b.domesticVat - b.deductedCredit, format: 'money' },
                            { label: '实际缴纳的消费税', value: b.consumption, format: 'money' },
                            { label: '计税依据', value: b.base, format: 'money' }
                        ],
                        footnote: surtaxNote('base')
                    }, {
                        title: '③ 城建税三档 + 两项附加',
                        rows: [
                            { label: '所在地', value: r.locationLabel, format: 'text' },
                            { label: '城建税税率', value: r.cityRate, format: 'percent' },
                            { label: '教育费附加', value: 0.03, format: 'percent' },
                            { label: '地方教育附加', value: 0.02, format: 'percent' },
                            { label: '城建税', value: r.cityTax, format: 'money' },
                            { label: '教育费附加', value: r.educationTax, format: 'money' },
                            { label: '地方教育附加', value: r.localEducationTax, format: 'money' }
                        ],
                        footnote: '三档按**纳税人所在地**划分（市区 7% / 县城、镇 5% / 其他 1%），不是按企业规模'
                    }, {
                        title: '④ 六税两费减半与到期对照',
                        rows: [
                            { label: '法定合计', value: rFull.total, format: 'money' },
                            { label: '减半比例', value: halve ? 0.5 : 1, format: 'percent' },
                            { label: '减半优惠', value: r.saved, format: 'money' },
                            { label: '应缴附加税费', value: r.total, format: 'money' }
                        ],
                        footnote: surtaxNote('halveExpiry')
                    }]
                };
            }
        },
        // 阶段17 17C-5：**最后一个税种类别**（§4.4 P2）。排在最后不是因为它不重要 ——
        // 它低频但单次申报金额大，且它是唯一一个「临界点比公式更要命」的类别。
        // 两步照抄 §4.4 给这类的形态（人数/工资总额 → 分档减缴 → 申报表），
        // 它的「完整」在决策侧：不只给应缴额，还量化「再招 1 人省多少」与「超过 30 人后会跳出多少」。
        // 至此按 tax-registry 的 6 类计，**每类都有完整测算**（页面式 4 个 + spec 驱动 5 个）。
        {
            // 阶段17 17C-5（v1.48.0 铺齐 → **v1.61.0 做深**）。
            //
            // 17C-5 v1.48.0 交付的是「铺齐」：本条目当时只有元数据，字段与计算**共享速算器**。
            // 速算器已经算到了「30 人临界点 + 分档减缴 + 边际节省」—— 但它的字段就叫
            // 「**在职职工人数**」，HR 手上那个数通常是**常年正式在册**的 25 人，
            // 而法定要的是「**上年各月在职人数之和 ÷ 12**」（季节性用工折算、劳务派遣择一计入）。
            // 实测：常年 25 人看着「30 人以下免征」，法定月平均 **45 人** → 一年差 **7.29 万**。
            //
            // 四处具体的口径差：
            //
            //   ① **在职职工人数是上年月平均，不是年末在册**（财税〔2015〕72 号）：
            //      季节性用工**折算年平均人数**，劳务派遣由派遣单位与用工单位**协商计入一方**
            //      （不得重复计算）。这与 17C-2 的「从业人数看全年季度平均值」是同一类错，
            //      但**公式不同**：cit 是（季初 + 季末）÷ 2 再 ÷ 4，残保金是各月之和 ÷ 12。
            //      实测：常年 25 + 季节性 24 人×4 月（折算 8）+ 派遣 12 人 = **45 人**
            //      → 0.675 缺口 × 12 万 × 90% = **7.29 万/年**，而按 25 人是 **0**。
            //
            //   ② **「招几个才免征」取决于人数，不是一个固定比例**（100 人是第二个临界点）：
            //      1 名残疾人达到 1.5% 需要公司在职 ≤ **66 人**（1 ÷ 1.5% = 66.67）；
            //      达到 1%（减半档）需要 ≤ **100 人**。所以 67~100 人招 1 个人**只能减半**，
            //      101 人以上招 1 个人连 1% 都够不着 —— 速算器只给「还差几人免征」，
            //      不给「招 1 个人够不够」这个**人数分界**。
            //
            //   ③ **招残疾人 vs 缴残保金的成本对照**（速算器完全没有，是「要不要招一个人」的定价）：
            //      两种情形必须分开答，否则一定被当成算错 ——
            //        A **岗位本来就要招人**：招残疾人 vs 招非残疾人用工成本一样，**净省 = 残保金减少额**；
            //        B **专为省残保金增设岗位**：净成本 = 年薪 ×（1 + 单位社保公积金费率）− 残保金减少额。
            //      实测：100 人公司招第 1 人省 **13.2 万**，而雇一个人的用工成本是 **16.74 万**
            //      → 专门招一个人**不划算**（除非岗位年薪压到 **9.46 万**以下）。
            //
            //   ④ **工会经费的基数是工资总额，与社保缴费基数两个方向都不同**：
            //      社保有 60% 保底与 300% 封顶，工资总额**两头都不夹** ——
            //      月薪 3 万：社保按 2.4 万封顶、工会经费按 3 万；月薪 3000：社保按 4800 保底、
            //      工会经费按 3000。拿社保基数估工会经费**两头都会估错**。
            //      另：**计提 ≠ 扣除**，企税扣除要凭《工会经费收入专用收据》；未建会按 2% 收筹备金且**全额上缴**。
            //
            //   ⑤ 现行分档减缴与 30 人免征**均执行至 2027-12-31**，到期恢复按 100% 征收 ——
            //      做三年预算时不能只按 90% / 50% 估。
            //
            // 口径仍同源：人数折算、招人对照、工资总额口径一律走 `EuriskoDisabilityFundQuick`
            // （新增 headcountOf / exemptPlanOf / hireCompareOf / unionBaseOf 四个可复用函数），
            // 单位社保公积金费率读 `socialInsuranceRules`（与 17C-3 同一个源）。
            id: 'disability-fund-deep', name: '残保金与工会经费',
            subtitle: '上年月平均定人数、招人成本定价、工资总额两头都不夹',
            icon: 'fa-wheelchair', status: 'deep',
            nextTools: ['disability-fund', 'employer-cost', 'social-base', 'corporate-income-tax'],
            policyKey: 'disability-fund',
            fields: [
                { key: 'variant', step: 'target', label: '算哪一项', type: 'select', default: 'levy',
                    options: [{ value: 'levy', label: '残疾人就业保障金' }, { value: 'union', label: '工会经费' }] },
                { key: 'socialAverage', step: 'target', label: '当地社平工资（月）', type: 'money', default: 8000,
                    hint: '残保金：年平均工资按社平 **2 倍**封顶（不是社保那个 300%）；工会经费：用于对照社保缴费基数' },

                // 残保金：上年月平均在职职工人数（不是年末在册）
                { key: 'regularCount', step: 'base', label: '常年用工人数（全年在岗）', type: 'number', default: 25, min: 0,
                    when: { key: 'variant', in: ['levy'] },
                    hint: '速算器只给一个「在职职工人数」，通常就被填成这个数 —— 但法定还要加季节性折算与派遣' },
                { key: 'seasonalCount', step: 'base', label: '季节性用工人数', type: 'number', default: 24, min: 0,
                    when: { key: 'variant', in: ['levy'] } },
                { key: 'seasonalMonths', step: 'base', label: '季节性用工月数', type: 'number', default: 4, min: 0,
                    when: { key: 'variant', in: ['levy'] },
                    hint: feeNote('headcount') },
                { key: 'dispatchCount', step: 'base', label: '劳务派遣用工人数', type: 'number', default: 12, min: 0,
                    when: { key: 'variant', in: ['levy'] } },
                { key: 'dispatchHere', step: 'base', label: '派遣用工由本单位计入', type: 'switch', default: true,
                    when: { key: 'variant', in: ['levy'] },
                    hint: '由派遣单位与用工单位**协商计入一方**，不得重复计算 —— 这一项能把人数整段降下来' },

                // 工会经费：全年工资总额（国家统计局口径，无保底无封顶）
                { key: 'monthlyWage', step: 'base', label: '月固定工资', type: 'money', default: 30000,
                    when: { key: 'variant', in: ['union'] } },
                { key: 'monthlyAllowance', step: 'base', label: '月津贴补贴', type: 'money', default: 0,
                    when: { key: 'variant', in: ['union'] } },
                { key: 'annualBonus', step: 'base', label: '全年奖金', type: 'money', default: 0,
                    when: { key: 'variant', in: ['union'] },
                    hint: feeNote('unionWageBase') },
                { key: 'paidMonths', step: 'base', label: '计薪月数', type: 'select', default: 12,
                    when: { key: 'variant', in: ['union'] },
                    options: [12, 11, 10, 9, 8, 7, 6].map(function (m) { return { value: m, label: m + ' 个月' }; }) },

                { key: 'avgAnnualWage', step: 'detail', label: '上年在职职工年平均工资', type: 'money', default: 120000,
                    when: { key: 'variant', in: ['levy'] },
                    hint: feeNote('wageCap') + '；口径按国家统计局《工资总额组成的规定》：**含奖金、津贴、加班**' },
                { key: 'disabled', step: 'detail', label: '已安排残疾人数', type: 'number', default: 0, min: 0,
                    when: { key: 'variant', in: ['levy'] } },
                { key: 'hireAnnualWage', step: 'detail', label: '拟招岗位年薪', type: 'money', default: 120000,
                    when: { key: 'variant', in: ['levy'] },
                    hint: '用于「招残疾人 vs 缴残保金」的成本对照；填 0 表示按公司年平均工资' },
                { key: 'hasUnion', step: 'detail', label: '已建立工会组织', type: 'switch', default: true,
                    when: { key: 'variant', in: ['union'] }, hint: feeNote('unionNoUnion') },
                { key: 'actual', step: 'detail', label: '实际拨缴金额', type: 'money', default: 0,
                    when: { key: 'variant', in: ['union'] },
                    hint: feeNote('unionDeduction') + '；填 0 表示按法定 2% 拨缴' }
            ],
            steps: [
                { key: 'target', title: '算哪一项与社平工资', why: '残保金看**上年在职职工人数**、工会经费看**全年工资总额** —— 两个基数不是一个口径，先定算哪一项' },
                { key: 'base', title: '上年月平均在职人数 / 全年工资总额', why: '残保金的在职人数是**上年各月之和 ÷ 12**（季节性用工折算、派遣择一计入），不是年末在册；工会经费的工资总额**没有 60% 保底与 300% 封顶**' },
                { key: 'detail', title: '分档减缴与招人定价 / 拨缴与扣除', why: '「招几个才免征」取决于人数（100 人是第二个临界点）；招残疾人 vs 缴残保金是**定价**问题，两种情形要分开答；工会经费**计提 ≠ 扣除**' }
            ],
            pitfalls: [
                '在职职工人数是**上年各月在职人数之和 ÷ 12**，不是年末在册 —— 常年 25 人看着免征，法定月平均 **45 人** → 一年 **7.29 万**',
                '季节性用工要**折算年平均人数**（人数 × 月数 ÷ 12），劳务派遣由派遣单位与用工单位**协商计入一方**、不得重复',
                '这个「年度平均」与 17C-2 企业所得税的从业人数**公式不同**：cit 是（季初 + 季末）÷ 2 再 ÷ 4，残保金是各月之和 ÷ 12',
                '**100 人是第二个临界点**：1 名残疾人达到 1.5% 需要 ≤ **66 人**、达到 1% 需要 ≤ **100 人**，101 人以上招 1 个人连减半档都够不着',
                '**第一个残疾人最值钱**：分档减缴是边际递减的（100 人公司第 1 人省 13.2 万、第 2 人只省 3 万；45 人公司第 1 人省 7.29 万、第 2 人一分钱都省不了）',
                '**岗位本来就要招人** → 招残疾人净省全额残保金；**专为省残保金增设岗位** → 净亏（雇一个人要付 1.395 倍工资）',
                '专门招一个人是否划算，看拟招岗位年薪 ≤ 残保金减少额 ÷ 1.395 —— 100 人公司的盈亏平衡年薪是 **9.46 万**',
                '工会经费的基数是**工资总额**，与社保缴费基数**两个方向都不同**：月薪 3 万社保封顶 2.4 万、月薪 3000 社保保底 4800',
                '工会经费**计提 ≠ 扣除**：企税扣除要凭《工会经费收入专用收据》，超提部分不得扣除',
                '未建立工会的按工资总额 2% 收**建会筹备金**，且**全额上缴**（没有 60% 留存）',
                '现行分档减缴与 30 人以下暂免**均执行至 2027-12-31**，到期恢复按 100% 征收 —— 做三年预算别只按 90% 估',
                '计费工资按当地社平 **2 倍**封顶（不是社保的 3 倍），两条封顶线不是一起停的'
            ],
            compute: function (v) {
                var Q = window.EuriskoDisabilityFundQuick;
                if (!Q) return null;
                var yuan = function (x) { return (Math.round((Number(x) || 0) * 100) / 100).toFixed(2); };
                var pct = function (r) { return Math.round((Number(r) || 0) * 10000) / 100 + '%'; };
                var socialAverage = Number(v.socialAverage) || 0;

                // ===== 工会经费：基数是工资总额，与社保缴费基数两个方向都不同 =====
                if (v.variant === 'union') {
                    var months = Number(v.paidMonths) || 12;
                    var ub = Q.unionBaseOf({
                        monthlyWage: v.monthlyWage, monthlyAllowance: v.monthlyAllowance,
                        annualBonus: v.annualBonus, paidMonths: months, socialAverage: socialAverage
                    });
                    var u = Q.unionFeeOf({ wageTotal: ub.wageTotal, hasUnion: !!v.hasUnion, actual: v.actual });
                    var rowsU = [
                        { label: '全年工资总额（国家统计局口径）', value: ub.wageTotal, kind: 'money',
                            hint: '（月工资 ' + yuan(v.monthlyWage) + ' + 津贴 ' + yuan(v.monthlyAllowance) + '）× '
                                + months + ' 个月 + 奖金 ' + yuan(v.annualBonus) + '；**没有 60% 保底与 300% 封顶**' },
                        { label: '社保缴费基数口径（同一批人，年）', value: ub.socialAnnual, kind: 'money',
                            hint: '月薪 ' + yuan(v.monthlyWage) + ' → 社保基数 ' + yuan(ub.socialMonthlyBase)
                                + ' 元/月（60% 保底 / 300% 封顶）' },
                        { label: '两个口径的差额', value: ub.gapAnnual, kind: 'money',
                            hint: ub.gapAnnual > 0 ? '⚠️ 工资总额**高于**社保基数（社保被封顶，工会经费没有）'
                                : ub.gapAnnual < 0 ? '⚠️ 工资总额**低于**社保基数（社保被保底，工会经费没有）'
                                    : '两个口径一致' },
                        { label: '工会经费（工资总额 × 2%）', value: ub.feeOnWage, kind: 'money' },
                        { label: '若误按社保基数估（错）', value: ub.feeOnSocialBase, kind: 'money',
                            hint: '差 ' + yuan(ub.feeGap) + ' 元 —— 拿社保基数估工会经费**两头都会估错**' },
                        { label: '月均计提', value: u.fee / 12, kind: 'money', hint: '按 12 个月均摊，便于做月度预算' },
                        { label: '上缴上级工会', value: u.remitted, kind: 'money',
                            hint: u.hasUnion ? '建会：40% 上缴、60% 留存' : '⚠️ 未建会：建会筹备金**全额上缴**' },
                        { label: '本单位留存', value: u.retained, kind: 'money' },
                        { label: '企业所得税扣除限额', value: u.limit, kind: 'money',
                            hint: '不超过工资薪金总额 2%' },
                        { label: '实际拨缴', value: u.actual, kind: 'money' },
                        { label: '实际可扣除', value: u.deductible, kind: 'money',
                            hint: '凭证：《工会经费收入专用收据》或税务机关代收凭据' },
                        { label: '超限额需纳税调增', value: u.overDeduction, kind: 'money',
                            hint: u.overDeduction > 0 ? '⚠️ 多提的部分企税不得扣除' : '未超限额' }
                    ];

                    var noteU = '工会经费按**全年工资总额** ' + yuan(ub.wageTotal) + ' 元的 '
                        + pct(u.rate) + ' 计提 = ' + yuan(u.fee) + ' 元'
                        + (u.hasUnion ? '（40% 上缴 ' + yuan(u.remitted) + ' 元、60% 留存 ' + yuan(u.retained) + ' 元）'
                            : '（未建会：建会筹备金 **全额上缴** ' + yuan(u.remitted) + ' 元）')
                        + '。这个基数与社保缴费基数**两个方向都不同**：社保有 60% 保底与 300% 封顶，'
                        + '工资总额两头都不夹 —— 同一批人按社保基数是 ' + yuan(ub.socialAnnual)
                        + ' 元，按工资总额是 ' + yuan(ub.wageTotal) + ' 元，'
                        + (ub.feeGap > 0 ? '**少估 ' + yuan(ub.feeGap) + ' 元**' : ub.feeGap < 0 ? '**多估 ' + yuan(-ub.feeGap) + ' 元**' : '两者一致')
                        + '。企税扣除要凭《工会经费收入专用收据》'
                        + (u.overDeduction > 0 ? '，本次超提 ' + yuan(u.overDeduction) + ' 元不得扣除' : '，本次可全额扣除')
                        + '。';

                    return {
                        primary: { label: '应拨缴工会经费', value: u.fee, kind: 'money',
                            hint: '工资总额 ' + yuan(ub.wageTotal) + ' 元 × 2%' },
                        rows: rowsU,
                        note: noteU,
                        extras: [{
                            title: '工资总额 vs 社保缴费基数（两个方向都不同）',
                            note: feeNote('unionWageBase'),
                            table: {
                                head: ['月薪', '社保缴费基数（60% 保底 / 300% 封顶）', '工会经费基数（工资总额）', '年工会经费', '按社保基数估（错）', '差额'],
                                rows: unionWageLadder().map(function (w) {
                                    var o = Q.unionBaseOf({
                                        monthlyWage: w, monthlyAllowance: 0, annualBonus: 0,
                                        paidMonths: 12, socialAverage: socialAverage
                                    });
                                    return [{ value: w, kind: 'money' }, { value: o.socialMonthlyBase, kind: 'money' },
                                        { value: o.wageTotal, kind: 'money' }, { value: o.feeOnWage, kind: 'money' },
                                        { value: o.feeOnSocialBase, kind: 'money' }, { value: o.feeGap, kind: 'money' }];
                                })
                            }
                        }, {
                            title: '工资总额口径（什么进基数、什么不进）',
                            note: '与社保缴费基数同一个口径（17C-3 沉淀的 wageComposition），但社保有保底与封顶、这里没有',
                            table: {
                                head: ['计入工资总额', '不计入工资总额'],
                                rows: (function () {
                                    var wc = ((window.socialInsuranceRules || {}).wageComposition || {});
                                    var inc = wc.included || [];
                                    var exc = wc.excluded || [];
                                    var out = [];
                                    for (var i = 0; i < Math.max(inc.length, exc.length); i++) {
                                        out.push([inc[i] ? inc[i].label : '—', exc[i] || '—']);
                                    }
                                    return out;
                                })()
                            }
                        }],
                        steps: [{
                            title: '① 全年工资总额（无保底、无封顶）',
                            rows: [
                                { label: '月固定工资', value: v.monthlyWage, format: 'money' },
                                { label: '月津贴补贴', value: v.monthlyAllowance, format: 'money' },
                                { label: '全年奖金', value: v.annualBonus, format: 'money' },
                                { label: '计薪月数', value: months, format: 'text' },
                                { label: '全年工资总额', value: ub.wageTotal, format: 'money' }
                            ],
                            footnote: feeNote('unionWageBase')
                        }, {
                            title: '② 与社保缴费基数对照',
                            rows: [
                                { label: '当地社平工资（月）', value: socialAverage, format: 'money' },
                                { label: '社保基数下限（60%）', value: Math.round(socialAverage * 0.6 * 100) / 100, format: 'money' },
                                { label: '社保基数上限（300%）', value: Math.round(socialAverage * 3 * 100) / 100, format: 'money' },
                                { label: '社保缴费基数（月）', value: ub.socialMonthlyBase, format: 'money' },
                                { label: '两个口径年差额', value: ub.gapAnnual, format: 'money' }
                            ],
                            footnote: '月薪高于社平 3 倍时社保被封顶、工资总额没有；月薪低于社平 60% 时社保被保底、工资总额没有'
                        }, {
                            title: '③ 计提 2% 与分成',
                            rows: [
                                { label: '工资总额', value: ub.wageTotal, format: 'money' },
                                { label: '计提比例', value: u.rate, format: 'percent' },
                                { label: '应拨缴工会经费', value: u.fee, format: 'money' },
                                { label: '上缴上级工会', value: u.remitted, format: 'money' },
                                { label: '本单位留存', value: u.retained, format: 'money' }
                            ],
                            footnote: u.hasUnion ? '建会：40% 上缴、60% 留存' : feeNote('unionNoUnion')
                        }, {
                            title: '④ 企业所得税扣除（计提 ≠ 扣除）',
                            rows: [
                                { label: '扣除限额（工资总额 2%）', value: u.limit, format: 'money' },
                                { label: '实际拨缴', value: u.actual, format: 'money' },
                                { label: '实际可扣除', value: u.deductible, format: 'money' },
                                { label: '超限额需纳税调增', value: u.overDeduction, format: 'money' }
                            ],
                            footnote: feeNote('unionDeduction')
                        }]
                    };
                }

                // ===== 残保金 =====
                var h = Q.headcountOf({
                    regularCount: v.regularCount, seasonalCount: v.seasonalCount,
                    seasonalMonths: v.seasonalMonths, dispatchCount: v.dispatchCount,
                    dispatchHere: !!v.dispatchHere
                });
                var levyInput = {
                    headcount: h.monthlyAverage, disabled: v.disabled,
                    socialAverageMonthly: socialAverage, avgAnnualWage: v.avgAnnualWage
                };
                var r = Q.levyOf(levyInput);
                var naive = Q.levyOf(Object.assign({}, levyInput, { headcount: h.naive }));
                var plan = Q.exemptPlanOf({ headcount: h.monthlyAverage, disabled: v.disabled });
                var cmp = Q.hireCompareOf(Object.assign({}, levyInput, { hireAnnualWage: v.hireAnnualWage }));
                // 政策到期后（2027-12-31）若无延续文件，恢复按 100% 征收
                var expired = Math.round(r.base * 100) / 100;

                var rows = [
                    { label: '上年在职职工人数（月平均）', value: h.monthlyAverage, kind: 'text',
                        hint: feeNote('headcount') },
                    { label: '其中：常年用工', value: h.regularCount, kind: 'text' },
                    { label: '其中：季节性用工折算', value: h.seasonalEquivalent, kind: 'text',
                        hint: h.seasonalCount + ' 人 × ' + h.seasonalMonths + ' 个月 ÷ 12' },
                    { label: '其中：劳务派遣计入', value: h.dispatchEquivalent, kind: 'text',
                        hint: h.dispatchHere ? '由本单位计入（不得与派遣单位重复计算）' : '由派遣单位计入' },
                    { label: '速算器口径（只填常年正式在册）', value: h.naive, kind: 'text',
                        hint: h.gap > 0 ? '⚠️ 少算 ' + h.gap + ' 人 —— 漏了季节性折算与劳务派遣' : '与法定口径一致' },
                    { label: '30 人以下暂免（按月平均判断）', value: h.exempt ? '是（在职 ' + h.monthlyAverage + ' 人）' : '否（在职 ' + h.monthlyAverage + ' 人）', kind: 'text',
                        hint: h.exempt ? '在职 ' + h.monthlyAverage + ' 人 ≤ 30，暂免征收' : '在职 ' + h.monthlyAverage + ' 人 > 30，全额计算' },
                    { label: '按速算器口径（' + h.naive + ' 人）是否免征', value: h.naiveExempt ? '是（免征）' : '否', kind: 'text',
                        hint: h.naiveExempt && !h.exempt ? '⚠️ 这是错的结果：按 ' + h.naive + ' 人免征，按法定 '
                            + h.monthlyAverage + ' 人**不免征**' : '' },
                    { label: '少算人数导致的差额', value: r.payable - naive.payable, kind: 'money',
                        hint: '法定 ' + yuan(r.payable) + ' − 速算器口径 ' + yuan(naive.payable) },
                    { label: '应安排残疾人数', value: r.required.toFixed(2) + ' 人', kind: 'text',
                        hint: '在职 ' + h.monthlyAverage + ' 人 × ' + pct(r.ratio) + '，保留小数' },
                    { label: '缺口人数', value: r.gap.toFixed(2) + ' 人', kind: 'text' },
                    { label: '实际安排比例', value: r.arrangedRatio, kind: 'percent' },
                    { label: '计费工资（社平 2 倍封顶）', value: r.avgWageUsed, kind: 'money',
                        hint: r.capped ? '已封顶，上限 ' + yuan(r.wageCap) + ' 元/年（社平 × 12 × 2）' : '未触及封顶' },
                    { label: '应缴费额（缺口 × 计费工资）', value: r.base, kind: 'money' },
                    { label: '分档减缴系数', value: r.multiplier, kind: 'percent', hint: r.tier.label },
                    { label: '政策到期后（2028 起按 100%）', value: expired, kind: 'money',
                        hint: feeNote('expiry') },
                    { label: '达到免征还需招', value: plan.needExempt + ' 人', kind: 'text',
                        hint: plan.needExempt > 0 ? '安排比例达到 ' + pct(plan.ratio) + ' 即免征' : '已达免征比例' },
                    { label: '达到减半档（' + pct(plan.halfRatio) + '）还需招', value: plan.needHalf + ' 人', kind: 'text',
                        hint: '1 名残疾人达到 ' + pct(plan.ratio) + ' 需在职 ≤ ' + plan.onePersonExemptUpTo
                            + ' 人、达到 ' + pct(plan.halfRatio) + ' 需 ≤ ' + plan.onePersonHalfUpTo + ' 人' },
                    { label: '再招 1 名残疾人可省', value: cmp.saving, kind: 'money',
                        hint: '第 ' + (r.disabled + 1) + ' 人：应缴 ' + yuan(cmp.before) + ' → ' + yuan(cmp.after) },
                    { label: '招 1 人的用工成本（年薪 + 单位社保公积金）', value: cmp.hireCost, kind: 'money',
                        hint: '年薪 ' + yuan(cmp.hireAnnualWage) + ' ×（1 + ' + pct(cmp.totalRate) + '）' },
                    { label: '情形 A：岗位本来就要招人 → 净省', value: cmp.netReplace, kind: 'money',
                        hint: '招残疾人 vs 招非残疾人，用工成本一样，净省全额残保金减少额' },
                    { label: '情形 B：专为省残保金增设岗位 → 净支出', value: cmp.netAdd, kind: 'money',
                        hint: cmp.netAdd > 0 ? '⚠️ 不划算：雇一个人要付 ' + yuan(cmp.hireCost)
                            + '，只省下 ' + yuan(cmp.saving) : '划算：省下的比雇人的成本还多' },
                    { label: '盈亏平衡年薪', value: cmp.breakEvenWage, kind: 'money',
                        hint: '拟招岗位年薪降到这个数以下，情形 B 才划算；现填 '
                            + yuan(cmp.hireAnnualWage) + ' → ' + (cmp.worthIt ? '划算' : '不划算') }
                ];
                if (h.exempt) {
                    var over = Q.levyOf(Object.assign({}, levyInput, { headcount: h.smallExemptUpTo + 1 }));
                    rows.push({
                        label: '超过 30 人后（按 31 人）应缴', value: over.payable, kind: 'money',
                        hint: '临界点不是起征点：成本从 0 直接跳到这个数'
                    });
                }

                var note = '在职职工人数是**上年各月在职人数之和 ÷ 12**：常年 ' + h.regularCount
                    + ' 人 + 季节性折算 ' + h.seasonalEquivalent + ' 人 + 派遣计入 '
                    + h.dispatchEquivalent + ' 人 = **' + h.monthlyAverage + ' 人**'
                    + (h.gap > 0 ? '（速算器那一个「在职职工人数」通常被填成常年 ' + h.naive
                        + ' 人，**少算 ' + h.gap + ' 人**）' : '')
                    + '。应安排 ' + r.required.toFixed(2) + ' 人，缺口 ' + r.gap.toFixed(2) + ' 人，'
                    + '计费工资 ' + yuan(r.avgWageUsed) + ' 元'
                    + (r.capped ? '（社平 2 倍封顶）' : '')
                    + ' → 应缴费额 ' + yuan(r.base) + ' 元 × ' + pct(r.multiplier)
                    + '（' + r.tier.label + '）= **' + yuan(r.payable) + ' 元**'
                    + (h.gap > 0 ? '，而按 ' + h.naive + ' 人算是 ' + yuan(naive.payable) + ' 元，**差 ' + yuan(r.payable - naive.payable) + ' 元**' : '')
                    + '。再招 1 名残疾人可省 **' + yuan(cmp.saving) + ' 元**'
                    + (cmp.netReplace > 0 ? '（岗位本来就要招人 → 净省这个数）' : '')
                    + '；但专为省残保金增设岗位要付 ' + yuan(cmp.hireCost) + ' 元，'
                    + (cmp.worthIt ? '划算' : '**不划算**')
                    + '（盈亏平衡年薪 ' + yuan(cmp.breakEvenWage) + ' 元）。'
                    + '另：现行减缴与 30 人免征均至 2027-12-31，到期后按 **' + yuan(expired) + ' 元**征收。';

                return {
                    primary: { label: '应缴残疾人就业保障金', value: r.payable, kind: 'money',
                        hint: '在职 ' + h.monthlyAverage + ' 人（常年 ' + h.regularCount
                            + ' + 季节 ' + h.seasonalEquivalent + ' + 派遣 ' + h.dispatchEquivalent + '）' },
                    rows: rows,
                    note: note,
                    extras: [{
                        title: '在职职工人数口径（上年月平均，不是年末在册）',
                        note: feeNote('headcount'),
                        table: {
                            head: ['项目', '人数'],
                            rows: [
                                ['常年用工（全年在岗）', h.regularCount],
                                ['季节性用工折算（' + h.seasonalCount + ' 人 × ' + h.seasonalMonths + ' 月 ÷ 12）', h.seasonalEquivalent],
                                ['劳务派遣（' + (h.dispatchHere ? '本单位计入' : '派遣单位计入') + '）', h.dispatchEquivalent],
                                ['**上年月平均在职人数**', h.monthlyAverage],
                                ['速算器口径（只填常年正式在册）', h.naive],
                                ['差额（少算的人数）', h.gap],
                                ['30 人以下暂免（法定）', h.exempt ? '是' : '否'],
                                ['30 人以下暂免（速算器口径）', h.naiveExempt ? '是（⚠️ 错）' : '否']
                            ]
                        }
                    }, {
                        title: '「招几个才免征」取决于人数（100 人是第二个临界点）',
                        note: '1 名残疾人达到 ' + pct(plan.ratio) + ' 需在职 ≤ ' + plan.onePersonExemptUpTo
                            + ' 人、达到 ' + pct(plan.halfRatio) + ' 需 ≤ ' + plan.onePersonHalfUpTo + ' 人',
                        table: {
                            head: ['在职人数', '达到免征（' + pct(plan.ratio) + '）需招', '达到减半（' + pct(plan.halfRatio) + '）需招'],
                            rows: plan.ladder.map(function (o) {
                                return [o.headcount, o.needExempt + ' 人', o.needHalf + ' 人'];
                            })
                        }
                    }, {
                        title: '招残疾人 vs 缴残保金（两种情形要分开答）',
                        note: '单位社保公积金费率 ' + pct(cmp.employerRate) + ' + 公积金 ' + pct(cmp.housingRate)
                            + ' = ' + pct(cmp.totalRate) + '；用工成本 = 年薪 ×（1 + ' + pct(cmp.totalRate) + '）',
                        table: {
                            head: ['项目', '金额'],
                            rows: [
                                ['当前应缴（' + r.disabled + ' 名残疾人）', { value: cmp.before, kind: 'money' }],
                                ['再招 1 名后应缴', { value: cmp.after, kind: 'money' }],
                                ['残保金减少额', { value: cmp.saving, kind: 'money' }],
                                ['招 1 人的用工成本', { value: cmp.hireCost, kind: 'money' }],
                                ['情形 A：岗位本来就要招人 → 净省', { value: cmp.netReplace, kind: 'money' }],
                                ['情形 B：专为省残保金增设岗位 → 净支出', { value: cmp.netAdd, kind: 'money' }],
                                ['盈亏平衡年薪', { value: cmp.breakEvenWage, kind: 'money' }],
                                ['结论', cmp.worthIt ? '岗位年薪 ' + yuan(cmp.hireAnnualWage) + ' ≤ 盈亏平衡，情形 B 也划算'
                                    : '岗位年薪 ' + yuan(cmp.hireAnnualWage) + ' > 盈亏平衡，只有情形 A 划算']
                            ]
                        }
                    }],
                    steps: [{
                        title: '① 上年在职职工人数 → 月平均',
                        rows: [
                            { label: '常年用工（全年在岗）', value: h.regularCount, format: 'text' },
                            { label: '季节性用工折算', value: h.seasonalEquivalent, format: 'text',
                                note: h.seasonalCount + ' 人 × ' + h.seasonalMonths + ' 个月 ÷ 12' },
                            { label: '劳务派遣计入', value: h.dispatchEquivalent, format: 'text',
                                note: h.dispatchHere ? '本单位计入' : '派遣单位计入' },
                            { label: '上年月平均在职人数', value: h.monthlyAverage, format: 'text' },
                            { label: '速算器口径（只填常年正式在册）', value: h.naive, format: 'text' }
                        ],
                        footnote: h.gap > 0
                            ? '少算 ' + h.gap + ' 人 —— 季节性用工与劳务派遣都要进这个口径'
                            : feeNote('headcount')
                    }, {
                        title: '② 应安排人数与差额人数',
                        rows: [
                            { label: '在职职工人数', value: h.monthlyAverage, format: 'text' },
                            { label: '规定安排比例', value: r.ratio, format: 'percent' },
                            { label: '应安排残疾人数', value: r.required.toFixed(2), format: 'text' },
                            { label: '已安排残疾人数', value: r.disabled, format: 'text' },
                            { label: '差额人数', value: r.gap.toFixed(2), format: 'text' }
                        ],
                        footnote: '应安排人数可以是小数（31 人 → 0.465 人），不要四舍五入'
                    }, {
                        title: '③ 计费工资（社平 2 倍封顶）',
                        rows: [
                            { label: '本单位年平均工资', value: r.avgWageInput, format: 'money' },
                            { label: '当地社平工资（月）', value: socialAverage, format: 'money' },
                            { label: '封顶（社平 × 12 × 2）', value: r.wageCap, format: 'money' },
                            { label: '计费工资', value: r.avgWageUsed, format: 'money' },
                            { label: '应缴费额', value: r.base, format: 'money' }
                        ],
                        footnote: feeNote('wageCap')
                    }, {
                        title: '④ 分档减缴（按实际安排比例）',
                        rows: [
                            { label: '实际安排比例', value: r.arrangedRatio, format: 'percent' },
                            { label: '适用档次', value: r.tier.label, format: 'text' },
                            { label: '分档系数', value: r.multiplier, format: 'percent' },
                            { label: '应缴残保金', value: r.payable, format: 'money' }
                        ],
                        footnote: '1 名残疾人达到 ' + pct(plan.ratio) + ' 需在职 ≤ ' + plan.onePersonExemptUpTo
                            + ' 人、达到 ' + pct(plan.halfRatio) + ' 需 ≤ ' + plan.onePersonHalfUpTo + ' 人'
                    }, {
                        title: '⑤ 招残疾人 vs 缴残保金（定价）',
                        rows: [
                            { label: '当前应缴', value: cmp.before, format: 'money' },
                            { label: '再招 1 名后应缴', value: cmp.after, format: 'money' },
                            { label: '残保金减少额', value: cmp.saving, format: 'money' },
                            { label: '招 1 人的用工成本', value: cmp.hireCost, format: 'money' },
                            { label: '情形 A：岗位本来就要招人 → 净省', value: cmp.netReplace, format: 'money' },
                            { label: '情形 B：专为省残保金增设岗位 → 净支出', value: cmp.netAdd, format: 'money' },
                            { label: '盈亏平衡年薪', value: cmp.breakEvenWage, format: 'money' }
                        ],
                        footnote: '岗位本来就要招人 → 招残疾人净省全额残保金；专为省残保金增设岗位 → 雇一个人要付 '
                            + pct(1 + cmp.totalRate) + ' 倍工资'
                    }]
                };
            }
        },
        {
            // 阶段17 17D-12（v1.68.0）：**个人转让房屋** —— 与 donation 同款处境，20 个速算器里
            // **没有一个**能收它：它不是「一个月薪」也不是「一笔劳务」，而是《个人所得税法》
            // 第二条里单独一档的**财产转让所得**（20% 比例税率）。速算器那套「收入 − 扣除 → 按表算」
            // 的框架在这里会直接把「售价」当「所得」，而卖房最贵的五层它一层都没碰：
            //   ① 应纳税所得额 = 转让收入 − **房屋原值** − 转让环节税金 − 合理费用（国税发〔2006〕108 号一）；
            //      装修费有**原值比例上限**（商品房及其他住房 10%、已购公有住房 / 经济适用房 15%）
            //      —— 原值 200 万、装修发票 30 万只能扣 20 万，多缴 **2 万**；
            //   ② **核定 1% 不是可选项**：有原值凭证必须查账，只有凭证不全才按转让收入 1%~3% 核定
            //      （售价 500 万 / 原值 100 万：查账 80 万、核定 5 万，差 **75 万**但没有选择权）；
            //   ③ **满五唯一**免征的「唯一」是**同一省 / 自治区 / 直辖市范围内**夫妻唯一一套住房
            //      （不是全国唯一、也不是同城唯一），自用年限按产权证与契税完税凭证**孰先**起算；
            //   ④ **受赠 / 继承**的房屋再转让，原值是**原捐赠人 / 被继承人**的实际购置成本
            //      （父亲 60 万买的房受赠后卖 500 万：正确 88 万，误按评估价 400 万算只有 20 万，差 **68 万**）；
            //   ⑤ **换购退税**退的是**已缴**个税（2026 年第 3 号，至 2027-12-31），按新购 ÷ 转让金额
            //      的比例退 —— 卖 500 万缴 33.6 万：买 400 万退 26.88 万、买 600 万全退 33.6 万。
            // 口径实现在 property-transfer-quick.js（税率 / 上限 / 免征年限 / 退税口径全部读
            // propertyTransferRules），这里只负责收集与呈现 —— 与 17D-11 同一个约定：**不复制公式**。
            id: 'property-transfer', name: '卖房要交多少税',
            subtitle: '满五唯一免在哪、核定 1% 能不能选、换购能退多少',
            icon: 'fa-home', status: 'deep',
            nextTools: ['classification', 'surtax-stamp'],
            fields: [
                { key: 'usage', step: 'property', label: '转让的是', type: 'select', default: 'residence',
                    options: [{ value: 'residence', label: '住房（住宅）' }, { value: 'nonresidence', label: '非住房（商铺 / 写字楼等）' }],
                    hint: '满五唯一免征与换购退税**只适用于住房**（国税发〔2007〕33 号二）' },
                { key: 'acquireType', step: 'property', label: '房子是怎么取得的', type: 'select', default: 'purchase',
                    options: [{ value: 'purchase', label: '自己买的' }, { value: 'gift', label: '受赠取得' },
                        { value: 'inherit', label: '继承取得' }],
                    hint: '受赠 / 继承的房屋再转让：房屋原值是**原捐赠人 / 被继承人**的实际购置成本，不是 0（财税〔2009〕78 号五）' },
                { key: 'salePrice', step: 'property', label: '转让收入（实际成交价，元）', type: 'money', default: 5000000,
                    hint: '按实际成交价；网签价明显偏低又无正当理由的，税务机关可核定' },
                { key: 'originalValue', step: 'property', label: '房屋原值（元）', type: 'money', default: 3000000,
                    when: { key: 'acquireType', in: ['purchase', 'inherit'] },
                    hint: '实际支付的购房价款 + 缴纳的契税、土地出让金等（108 号二）；继承的填**被继承人**的取得成本' },
                { key: 'donorCost', step: 'property', label: '原捐赠人取得该房屋的实际购置成本（元）', type: 'money', default: 600000,
                    when: { key: 'acquireType', in: ['gift'] },
                    hint: '不是受赠时的评估价，也不是 0 —— 父亲 60 万买的房受赠后卖 500 万，原值是 60 万（财税〔2009〕78 号五）' },
                { key: 'hasValueProof', step: 'property', label: '能提供完整、准确的房屋原值凭证', type: 'switch', default: true,
                    hint: '关掉就是「原值凭证不全」：由税务机关按转让收入 1%~3% **核定**征收，装修费、贷款利息等扣除项都不再看（108 号三）' },
                { key: 'assessRate', step: 'property', label: '核定征收率（%）', type: 'percent', default: 1,
                    when: { key: 'hasValueProof', in: [false] },
                    hint: '法定区间 1%~3%，具体由各省局 / 市局确定（如海南为 2%）—— 不是纳税人可以挑的' },
                { key: 'holdYears', step: 'property', label: '自用年限', type: 'select', default: 6,
                    options: [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 20, 25, 30].map(function (y) {
                        return { value: y, label: y + ' 年' };
                    }),
                    hint: '起算点：房屋产权证注明的时间与契税完税凭证注明的时间**孰先**（财税字〔1999〕278 号）' },
                { key: 'isOnlyHome', step: 'property', label: '本次出售的住房是家庭唯一生活用房', type: 'switch', default: false,
                    when: { key: 'usage', in: ['residence'] },
                    hint: '「唯一」是**同一省 / 自治区 / 直辖市范围内**（有配偶的为夫妻双方）只有这一套住房 —— 不是全国唯一、也不是同城唯一' },
                { key: 'vatAndSurcharge', step: 'cost', label: '转让过程中缴纳的税金（元）', type: 'money', default: 0,
                    hint: '增值税及附加、土地增值税等；住房满 2 年免征增值税时填 0（108 号一（三））' },
                { key: 'houseType', step: 'cost', label: '房屋性质', type: 'select', default: 'commercial',
                    when: { key: 'usage', in: ['residence'] },
                    options: [{ value: 'commercial', label: '商品房及其他住房' },
                        { value: 'public', label: '已购公有住房 / 经济适用房' }],
                    hint: '决定装修费的扣除上限比例：商品房 10%、公有住房 / 经济适用房 15%' },
                { key: 'decoration', step: 'cost', label: '住房装修费用（元）', type: 'money', default: 300000,
                    hint: '须有税务统一发票、发票付款人与产权人一致；超过原值比例上限的部分**不能扣**（108 号二（一）1）' },
                { key: 'loanInterest', step: 'cost', label: '住房贷款利息（元）', type: 'money', default: 0,
                    hint: '凭贷款利息支出凭证按实际发生额扣除' },
                { key: 'otherFees', step: 'cost', label: '手续费、公证费等其他合理费用（元）', type: 'money', default: 20000 },
                { key: 'repurchase', step: 'repurchase', label: '出售住房后 1 年内有重新购房', type: 'switch', default: true,
                    when: { key: 'usage', in: ['residence'] },
                    hint: '财政部 税务总局 住房城乡建设部公告 2026 年第 3 号：退的是**已缴**个税，不是补贴' },
                { key: 'sameCity', step: 'repurchase', label: '新购住房与现住房在同一城市', type: 'switch', default: true,
                    when: { key: 'repurchase', in: [true] },
                    hint: '同一直辖市、副省级城市、地级市所辖的全部行政区划范围' },
                { key: 'isNewOwner', step: 'repurchase', label: '售房人为新购住房产权人或产权人之一', type: 'switch', default: true,
                    when: { key: 'repurchase', in: [true] } },
                { key: 'repurchasePrice', step: 'repurchase', label: '新购住房金额（元）', type: 'money', default: 4000000,
                    when: { key: 'repurchase', in: [true] },
                    hint: '新购金额 ≥ 现住房转让金额 → **全额退还**已缴个税；< 则按新购 ÷ 转让金额的比例退还' }
            ],
            steps: [
                { key: 'property', title: '房子与产权', why: '先定三件事：住房还是非住房、怎么取得的（受赠 / 继承的原值另有规定）、满五年是不是家庭唯一' },
                { key: 'cost', title: '能扣什么', why: '原值、转让环节税金、装修费（有原值比例上限）、贷款利息与手续费公证费 —— 扣完才是应纳税所得额' },
                { key: 'repurchase', title: '卖后换购', why: '出售住房后 1 年内在同城重新购房的，按新购金额占转让金额的比例退还已缴个税' }
            ],
            pitfalls: [
                '**应纳税所得额不是「售价 − 买价」**：转让收入 − 房屋原值 − 转让过程中缴纳的税金 − 合理费用（国税发〔2006〕108 号一）。装修费有**原值比例上限** —— 商品房及其他住房 10%、已购公有住房 / 经济适用房 15%：原值 200 万、装修发票 30 万只能扣 20 万，多缴 **2 万**',
                '**核定 1% 不是可选项**：能提供完整、准确的房屋原值凭证的**必须查账**，只有凭证不全时才由税务机关按转让收入 1%~3% 核定（具体征收率由省局 / 市局确定）。售价 500 万、原值 100 万：查账 80 万、核定 5 万，差 **75 万** —— 恰恰是差额大的那批人最想选、也最没有选择权',
                '**满五唯一的「唯一」不是全国唯一、也不是同城唯一**：是**同一省、自治区、直辖市范围内**纳税人（有配偶的为夫妻双方）仅拥有一套住房；自用 5 年以上的起算点是房屋产权证注明时间与契税完税凭证注明时间**孰先**（财税字〔1999〕278 号四）',
                '**受赠 / 继承的房屋再转让**，原值不是 0、也不是受赠时的评估价，而是**原捐赠人 / 被继承人**取得该房屋的实际购置成本（财税〔2009〕78 号五）：父亲 60 万买的房子受赠后卖 500 万，正确税额 88 万；误按受赠时评估价 400 万算只有 20 万 —— 差 **68 万**',
                '**换购退税退的是已缴个税，不是补贴**（财政部 税务总局 住房城乡建设部公告 **2026 年第 3 号**，执行至 **2027-12-31**）：出售住房后 **1 年内**在**同城**重新购房、且售房人为新购住房产权人或之一，新购金额 ≥ 转让金额**全额退**，< 则按新购 ÷ 转让金额的比例退。卖 500 万缴 33.6 万：买 400 万退 **26.88 万**、买 600 万全退 **33.6 万**',
                '**已经满五唯一的人换购退不到钱**：已缴个税本来就是 0，退税额 = 0 × 比例 = 0。别把「卖了再买能退税」当成年年可吃的红利 —— 它只在**你真的缴了税**时才有意义',
                '**非住房（商铺、写字楼）不适用**满五唯一免征，**也不适用**换购住房退税（国税发〔2007〕33 号二），装修费也不受住房那档比例上限约束',
                '装修费须凭**税务统一发票**、且发票付款人与产权人一致；住房贷款利息凭贷款利息支出凭证按实际发生额扣除；转让收入按**实际成交价**，网签价明显偏低又无正当理由的，税务机关有权核定'
            ],
            compare: [
                '查账 vs 核定：有原值凭证必须查账，核定 1%~3% 只是凭证不全时的替代 —— 「哪个省选哪个」不成立',
                '满五唯一：免的是全部个税，但「唯一」看同一省 / 自治区 / 直辖市范围内，不是全国唯一',
                '换购退税：已缴个税 × 新购 ÷ 转让金额，与满五唯一免征不叠加（免征时已缴为 0）'
            ],
            compute: function (v) {
                var Q = window.EuriskoPropertyTransferQuick;
                if (!Q) return null;

                var input = {
                    usage: v.usage, acquireType: v.acquireType,
                    salePrice: Number(v.salePrice) || 0,
                    originalValue: Number(v.originalValue) || 0,
                    donorCost: Number(v.donorCost) || 0,
                    hasValueProof: v.hasValueProof !== false,
                    holdYears: Number(v.holdYears) || 0,
                    isOnlyHome: !!v.isOnlyHome,
                    vatAndSurcharge: Number(v.vatAndSurcharge) || 0,
                    houseType: v.houseType || 'commercial',
                    decoration: Number(v.decoration) || 0,
                    loanInterest: Number(v.loanInterest) || 0,
                    otherFees: Number(v.otherFees) || 0,
                    assessRate: Number(v.assessRate) || 0,
                    repurchase: !!v.repurchase, sameCity: !!v.sameCity, isNewOwner: !!v.isNewOwner,
                    repurchasePrice: Number(v.repurchasePrice) || 0
                };
                var s = Q.stackOf(input);
                var cmp = Q.assessCompareOf(input);
                var ex = Q.exemptCompareOf(input);
                var money = function (x) { return { value: x, kind: 'money' }; };
                var pct = function (x) { return { value: x, kind: 'percent' }; };
                var isAssess = s.method === 'assess';

                var rows = [{ label: '转让收入（实际成交价）', value: s.price, kind: 'money' }];
                if (isAssess) {
                    rows.push({ label: '核定征收率', value: s.assessRate, kind: 'percent',
                        hint: '原值凭证不全：按转让收入 1%~3% 核定（省局 / 市局确定）' });
                    rows.push({ label: '核定应纳税额', value: s.assessTax, kind: 'money' });
                } else {
                    rows.push({ label: '减：房屋原值', value: s.basis.value, kind: 'money', hint: s.basis.label });
                    rows.push({ label: '减：转让过程中缴纳的税金', value: s.taxPaidInTransfer, kind: 'money',
                        hint: '增值税及附加等；住房满 2 年免征增值税时填 0' });
                    rows.push({ label: '减：合理费用', value: s.decoration.allowed + s.loanInterest + s.otherFees,
                        kind: 'money', hint: s.decoration.note });
                    rows.push({ label: '应纳税所得额', value: s.taxable, kind: 'money' });
                    rows.push({ label: '税率', value: s.rate, kind: 'percent', hint: '财产转让所得：20% 比例税率' });
                    rows.push({ label: '应纳税额', value: s.taxBeforeExempt, kind: 'money' });
                }
                if (s.exemptEligible) {
                    rows.push({ label: '满五唯一免征', value: 0, kind: 'money',
                        hint: '自用 5 年以上且为家庭唯一生活用房（财税字〔1999〕278 号四）' });
                }
                if (s.refund.applied) {
                    rows.push({ label: '换购住房退税', value: s.refund.refund, kind: 'money',
                        hint: '退还比例 ' + Math.round(s.refund.ratio * 100) + '%（新购 ÷ 转让金额）' });
                }
                rows.push({ label: '实际净缴个税', value: s.netTax, kind: 'money' });

                var extras = [{
                    title: '核定 1% 能不能选：查账与核定对照',
                    note: cmp.note,
                    table: {
                        head: ['口径', '税额', '本例适用', '说明'],
                        rows: cmp.rows.map(function (r0) {
                            return [r0.label, money(r0.tax), r0.applied ? '是' : '', r0.note];
                        })
                    }
                }, {
                    title: '满五唯一的三种边界（同一省 / 自治区 / 直辖市范围内）',
                    note: '免征条件：自用 ' + ex.needYears + ' 年以上 **且** 是家庭唯一生活用房；自用年限起算点按'
                        + ex.startRule,
                    table: {
                        head: ['情形', '是否免征', '个税'],
                        rows: ex.rows.map(function (r0) {
                            return [r0.label, r0.eligible ? '免征' : '照缴', money(r0.tax)];
                        })
                    }
                }];

                if (s.isResidence) {
                    var price = s.price;
                    var rpRows = [0, Math.round(price * 0.8), price, Math.round(price * 1.2)].map(function (buy) {
                        var r0 = Q.repurchaseRefundOf({
                            usage: 'residence', salePrice: price, taxPaidIIT: s.tax,
                            repurchase: buy > 0, repurchasePrice: buy, sameCity: true, isNewOwner: true
                        });
                        return [buy > 0 ? '重新购房（' + Math.round(buy / 10000) + ' 万）' : '不重新购房',
                            money(buy), pct(r0.ratio), money(r0.refund), money(r0.netTax)];
                    });
                    extras.push({
                        title: '卖后 1 年换购：买多少退多少（2026 年第 3 号，至 2027-12-31）',
                        note: '退的是**已缴**个税：新购金额 ≥ 转让金额全额退，不足则按新购 ÷ 转让金额的比例退；'
                            + '满五唯一免征的（已缴为 0）退不到钱',
                        table: { head: ['情形', '新购金额', '退还比例', '退还个税', '实际净缴'], rows: rpRows }
                    });
                }

                var note = '转让收入 ' + Math.round(s.price) + ' 元';
                if (isAssess) {
                    note += '，原值凭证不全按 ' + Math.round(s.assessRate * 100) + '% 核定，应纳税额 **'
                        + Math.round(s.tax) + ' 元**';
                } else {
                    note += '，减除房屋原值 ' + Math.round(s.basis.value) + ' 元、转让环节税金 '
                        + Math.round(s.taxPaidInTransfer) + ' 元、合理费用 '
                        + Math.round(s.decoration.allowed + s.loanInterest + s.otherFees) + ' 元后，应纳税所得额 '
                        + Math.round(s.taxable) + ' 元，按 20% 计税 **' + Math.round(s.taxBeforeExempt) + ' 元**';
                }
                if (s.decoration.disallowed > 0.01) {
                    note += '；装修费有 ' + Math.round(s.decoration.disallowed) + ' 元超过原值 '
                        + Math.round(s.decoration.capRatio * 100) + '% 的上限不能扣（多缴 '
                        + Math.round(s.decoration.disallowed * s.rate) + ' 元）';
                }
                if (s.exemptEligible) note += '；符合满五唯一 → **免征**';
                if (s.refund.applied && s.refund.refund > 0.01) {
                    note += '；换购退税 ' + Math.round(s.refund.refund) + ' 元后实际净缴 **'
                        + Math.round(s.netTax) + ' 元**';
                }

                var steps = [{
                    title: '① 应纳税所得额（国税发〔2006〕108 号一）',
                    rows: isAssess ? [
                        { label: '转让收入', value: s.price, format: 'money' },
                        { label: '核定征收率', value: s.assessRate, format: 'percent' },
                        { label: '核定应纳税额', value: s.assessTax, format: 'money' }
                    ] : [
                        { label: '转让收入（实际成交价）', value: s.price, format: 'money' },
                        { label: '减：房屋原值', value: s.basis.value, format: 'money', note: s.basis.label },
                        { label: '减：转让过程中缴纳的税金', value: s.taxPaidInTransfer, format: 'money' },
                        { label: '减：装修费（受原值比例上限约束）', value: s.decoration.allowed, format: 'money',
                            note: s.decoration.note },
                        { label: '减：住房贷款利息', value: s.loanInterest, format: 'money' },
                        { label: '减：手续费、公证费等其他合理费用', value: s.otherFees, format: 'money' },
                        { label: '应纳税所得额', value: s.taxable, format: 'money' },
                        { label: '× 税率', value: s.rate, format: 'percent' },
                        { label: '应纳税额', value: s.taxBeforeExempt, format: 'money' }
                    ],
                    footnote: isAssess ? '原值凭证不全 → 由税务机关按转让收入 1%~3% 核定（108 号三）'
                        : '转让收入按实际成交价；房屋原值含购置价款与缴纳的契税、土地出让金等（108 号二）'
                }, {
                    title: '② 满五唯一免征（财税字〔1999〕278 号四）',
                    rows: [
                        { label: '自用年限', value: s.rules.exemption.years, format: 'text',
                            note: '本例 ' + Math.round(input.holdYears) + ' 年' },
                        { label: '家庭唯一生活用房', value: input.isOnlyHome ? '是' : '否', format: 'text',
                            note: '同一省 / 自治区 / 直辖市范围内（有配偶的为夫妻双方）' },
                        { label: '免征后应纳税额', value: s.exemptTax, format: 'money' }
                    ],
                    footnote: '自用 5 年以上 **且** 是家庭唯一生活用房才免征；自用年限按房屋产权证注明时间与契税完税凭证注明时间孰先起算'
                }, {
                    title: '③ 换购住房退税（财政部 税务总局 住房城乡建设部公告 2026 年第 3 号）',
                    rows: [
                        { label: '已缴个人所得税', value: s.tax, format: 'money' },
                        { label: '新购住房金额', value: s.refund.repurchasePrice, format: 'money' },
                        { label: '退还比例（新购 ÷ 转让）', value: s.refund.ratio, format: 'percent' },
                        { label: '退还个人所得税', value: s.refund.refund, format: 'money' },
                        { label: '实际净缴', value: s.netTax, format: 'money' }
                    ],
                    footnote: '出售住房后 1 年内在同城重新购房、售房人为新购住房产权人或之一；执行至 2027-12-31'
                }];

                return {
                    primary: { label: s.exemptEligible ? '应缴个人所得税（免征）' : '应缴个人所得税',
                        value: s.tax, kind: 'money' },
                    rows: rows, note: note, extras: extras, steps: steps
                };
            }
        },
        {
            // 阶段17 17D-13（v1.69.0）：**非居民个人 / 无住所个人** —— 第三类「20 个速算器里
            // 没有一个能收它」的完整测算（前两个是 donation、property-transfer）。即便同为个税，
            // 「月薪 + 五险一金 + 专项附加」那五个框**默认这位是中国税收居民**：monthsYears /
            // 累计预扣 / 年度汇算 / 专项附加扣除一律假定法定。而这一类人进门要解决的第一个问题
            // 根本不是「扣多少」，而是「**这笔钱要不要在中国缴**」。要补的四层：
            //   ① 居住天数 → 纳税义务四档（个税法第一条 + 34 号）：≤ 90 天只对「境内工作 +
            //      境内雇主支付」的部分计税；90~183 天境内工作期间的**不论谁支付**都要缴；
            //      满 183 天成为居民但连续不满六年，境外所得中境外支付的部分免税；连续满六年
            //      （且无任何一年单次离境超过 30 天）→ 境内境外**全部**所得都要缴；
            //      同样的工资，四档实测 **0 / 6220 / 53080 / 73080**；
            //   ② 收入额要先过一道乘法（35 号第二条）：公式一 = 境内外工资 × 境内支付占比 ×
            //      境内工作天数占比；公式二 = 境内外工资 × 境内工作天数占比；公式三 = 境内外
            //      工资 ×〔1 − 境外支付占比 × 境外工作天数占比〕；高管（董事、监事、高层管理
            //      职务）无论是否在境内履行职务，由境内居民企业支付或者负担的报酬一律属境内所得；
            //   ③ 非居民**按月换算后的综合所得税率表逐月单独计税**（当月收入额 − 5000 → 月度
            //      税率表），不像居民那样按年累计：24 万年收入均匀发 19080、集中到一个月发
            //      **44280**，差 **25200** —— 而居民那张年度表根本不看发放节奏；
            //   ④ 数月奖金单独按 **6 个月**分摊、**不减除费用**、一年只能用一次（公式五），
            //      这与居民的「全年一次性奖金 ÷ 12 定档」是两回事，不能互相套用；
            //      实测默认口径：法定 26620，把奖金并入发放当月算出 **89580**，虚增 **62960**。
            // 口径实现在 non-resident-quick.js（183 天 / 90 天 / 六年 / 30 天 / 5000 / 6 个月全部
            // 读 nonResidentRules，月度税率表复用 bonusMonthlyTaxRates，年度表走内核），
            // 这里只负责收集与呈现 —— 与前三版同一个约定：**不复制税率、不复制公式**。
            id: 'non-resident', name: '非居民 / 无住所要缴多少税',
            subtitle: '90 天 · 183 天 · 满六年，这次问题不是扣多少',
            icon: 'fa-passport', status: 'deep',
            nextTools: ['expat', 'forward', 'withholding'],
            fields: [
                { key: 'role', step: 'residence', label: '在境内单位的职务', type: 'select', default: 'staff',
                    options: [{ value: 'staff', label: '普通 / 中层员工' },
                        { value: 'executive', label: '董事、监事或高层管理人员' }],
                    hint: '担任境内居民企业董事、监事、高层管理职务的个人，**无论是否在境内履行职务**，'
                        + '由该境内企业支付或者负担的报酬一律属于境内所得（35 号第一条（三））' },
                { key: 'stayFullDays', step: 'residence', label: '本纳税年度内在境内累计居住天数', type: 'number',
                    default: 120,
                    hint: '在中国境内停留的**当天满 24 小时**才算一天；不足 24 小时的不计入居住天数'
                        + '（作为工作天数时可按半天算，两个口径不同）' },
                { key: 'fullYearsBefore', step: 'residence', label: '此前连续住满 183 天的年度数', type: 'select',
                    default: 5,
                    options: [0, 1, 2, 3, 4, 5, 6].map(function (y) {
                        return { value: y, label: y === 6 ? '6 年及以上' : y + ' 年' };
                    }),
                    hint: '满 183 天 **且** 此前六年每年都住满 183 天 **且** 没有任何一年单次离境超过 30 天'
                        + ' → 境内境外全部所得都要缴（财政部 税务总局公告 2019 年第 34 号一）' },
                { key: 'maxSingleAbsence', step: 'residence', label: '此前六年中任一年度的单次最长离境天数',
                    type: 'number', default: 0,
                    hint: '六年判定只看**有没有任何一年单次离境超过 30 天** —— 不再有「累计离境 90 天作废」'
                        + '那条老规则（财税字〔1995〕98 号已随 2019 年新法废止）' },
                { key: 'monthlyTotal', step: 'income', label: '当月境内外工资薪金总额（元）', type: 'money',
                    default: 30000,
                    hint: '工资薪金所属的工作期间**横跨境内境外**时，境内外支付都要算进来，'
                        + '再按比例切出境内所得' },
                { key: 'monthlyPaidDomestic', step: 'income', label: '其中由境内雇主支付或者负担的部分（元）',
                    type: 'money', default: 15000,
                    hint: '「支付或者负担」包括外国母公司替境内子公司承担的部分 —— 谁最终买单比谁填支票更重要' },
                { key: 'calendarDays', step: 'income', label: '当月工资薪金所属工作期间的公历天数',
                    type: 'number', default: 30 },
                { key: 'domesticWorkDays', step: 'income', label: '其中境内工作天数', type: 'number', default: 20,
                    hint: '在境内、境外单位同时任职（或仅在境外单位任职）的，境内停留当天**不足 24 小时的按半天**'
                        + '计入境内工作天数（35 号第一条（一））' },
                { key: 'months', step: 'income', label: '本年在境内任职领取工资的月数', type: 'select', default: 12,
                    options: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(function (m) {
                        return { value: m, label: m + ' 个月' };
                    }) },
                { key: 'bonus', step: 'bonus', label: '一次性取得的数月奖金（元）', type: 'money', default: 120000,
                    hint: '非居民一个月内取得数月奖金：单独、**不与当月工资合并**、按 6 个月分摊且'
                        + '**不减除费用**计税（公式五），一个公历年度内每人只能适用一次' }
            ],
            steps: [
                { key: 'residence', title: '身份与居住天数', why: '先定四档里的哪一档：90 天以内、90~183 天、满 183 天但不满六年、连续满六年' },
                { key: 'income', title: '钱从哪来、人在哪干活', why: '收入额不是工资总额 —— 要先按境内支付占比与境内工作天数占比过一道乘法' },
                { key: 'bonus', title: '数月奖金', why: '单独按 6 个月分摊计税，不并入当月工资、也不减除费用' }
            ],
            pitfalls: [
                '**先问要不要缴，再问扣多少**：同样是每月 3 万全部由境外母公司支付 —— 年内累计居住 60 天的适用公式一，只对「境内工作 + 境内雇主支付或者负担」两者重叠的那部分计税（本例交集为空 → **0 元**）；住到 120 天就换成公式二，境内工作期间的工资**不论由谁支付**都要缴（**26620 元**）',
                '**六年不是自然年，是被「单次离境超过 30 天」打断的**：同样住满 200 天且此前已连续六年，一次性离境 40 天就把六年清掉 —— 73080 元退回到 **53080 元**，差 **20000 元**；34 号只认「单次」，老黄历里那句「累计离境 90 天作废」（财税字〔1995〕98 号）已随 2019 年新法废止',
                '**收入额是不等于工资总额的**：公式一 = 当月境内外工资 × 境内支付占比 × 境内工作天数占比（例如 3 万 × 50% × 20/30 = **1 万**）；公式二去掉支付占比；公式三只对「境外工作且境外支付」的那部分做扣除 —— 三个公式随居住天数切换，不能记一个用到底',
                '**非居民按月换算后的综合所得税率表逐月单独计税**（当月收入额 − 5000 → 月度税率表），不像居民那样按年累计合并：**同一笔 24 万年薪，均匀发放与全压到最后一个月发放相差 25200 元**（19080 vs 44280），而居民按年累计的那张年度表**根本不看发放节奏**，两种算法差出来的钱没有任何补偿',
                '**数月奖金单独按 6 个月分摊、不减除费用、一年只能用一次**（公式五）：默认口径下法定 26620 元，而最常见的错误算法「奖金并入发放当月」会算出 **89580 元** —— 虚增 **62960 元**，原因就是把 12 万一把推进月度税率的 45% 那一档',
                '**数月奖金分摊不是居民的「全年一次性奖金 ÷ 12」**：居民是把奖金 ÷ 12 定档后「全额 × 税率 − 速算扣除数」，速算扣除数只扣一次、也不另行减除费用；非居民是 ÷ **6** 定档、**不减除** 5000 元、且一个公历年度内对同一人**只能用一次** —— 两张口诀长得像，结果未必相同，不能互相套',
                '**高管（董事、监事、高层管理职务）不适用「按天数分摊」的待遇**：≤90 天档里普通员工的公式一是「支付占比 × 天数占比」两道相乘，高管只看第一道 —— 由境内居民企业支付或者负担的报酬**全额计入**，不再切天数；90~183 天档里高管也改用公式三（35 号第二条（三））',
                '**非居民不享受专项附加扣除、不办理年度汇算**：子女教育 / 房贷利息 / 赡养老人只属于居民个人综合所得；此外居住天数按「当天满 24 小时」计、而工作天数在同时对境外任职时可按**半天**计 —— 两个口径规则不同，混着用会在 90 天 / 183 天的临界点上出错'
            ],
            compare: [
                '四档纳税义务：≤90 天 / 90~183 天 / 满183天不满六年 / 满六年 —— 同一批收入实测 6220 / 26620 / 53080 / 73080',
                '收入额三公式：公式一（<90天）→ 公式二（90~183天）→ 公式三（居民不满六年或90~183天的高管）',
                '非居民逐月单独计税 vs 居民按年累计：收入越不均匀，前者越吃亏',
                '数月奖金：单独 ÷ 6 定档 × 6（不减费用）vs 并入当月工资 —— 实测差 62960'
            ],
            compute: function (v) {
                var Q = window.EuriskoNonResidentQuick;
                if (!Q) return null;

                var input = {
                    role: v.role || 'staff',
                    stayFullDays: Number(v.stayFullDays) || 0,
                    fullYearsBefore: Number(v.fullYearsBefore) || 0,
                    maxSingleAbsence: Number(v.maxSingleAbsence) || 0,
                    monthlyTotal: Number(v.monthlyTotal) || 0,
                    monthlyPaidDomestic: Number(v.monthlyPaidDomestic) || 0,
                    calendarDays: Number(v.calendarDays) || 30,
                    domesticWorkDays: Number(v.domesticWorkDays) || 0,
                    months: Number(v.months) || 12,
                    bonus: Number(v.bonus) || 0
                };
                var s = Q.stackOf(input);
                var money = function (x) { return { value: x, kind: 'money' }; };
                var pct = function (x) { return { value: x, kind: 'percent' }; };
                var text = function (x) { return { value: x, kind: 'text' }; };
                var ic = s.income;
                var sal = s.salary;
                var rround = function (x) { return Math.round(x * 100) / 100; };

                var rows = [
                    { label: '本纳税年度境内累计居住天数', value: s.status.days + ' 天', kind: 'text',
                        hint: '在中国境内停留的当天**满 24 小时**才算一天' },
                    { label: '身份判定', value: s.status.tierLabel, kind: 'text',
                        hint: '一个纳税年度内累计居住是否满 183 天（个税法第一条）' }
                ];
                if (s.status.isResident) {
                    rows.push({ label: '六年规则', value: s.sixYear.sixYearsMet ? '已连续满六年（全球所得征税）'
                        : '不满六年（境外支付的境外所得免税）', kind: 'text',
                        hint: s.sixYear.reasons.join('；') });
                }
                rows.push({ label: '当月境内外工资薪金总额', value: input.monthlyTotal, kind: 'money' });
                rows.push({ label: '当月工资薪金收入额', value: ic.amount, kind: 'money',
                    hint: ic.formula + '：' + ic.label + ' —— ' + ic.note });
                rows.push({ label: '每月减除费用', value: sal.monthlyDeduction, kind: 'money',
                    hint: '非居民个人：按月换算后的综合所得税率表，一个月算一次' });
                if (input.monthlyPaidDomestic > 0 || ic.ratio < 1) {
                    rows.push({ label: '留在征税范围外（由所得来源地规则切出去）', value: input.monthlyTotal
                        - ic.amount, kind: 'money',
                        hint: '这一档里不用在中国的部分，不是「扣除」而是**本来就不在征税范围**' });
                }
                if (!s.status.isResident) {
                    rows.push({ label: '月度税率', value: sal.rate, kind: 'percent',
                        hint: '速算扣除数 ' + Math.round(sal.deduction) + ' 元' });
                    rows.push({ label: '工资薪金税额（' + sal.months + ' 个月）', value: sal.tax, kind: 'money' });
                }
                if (input.bonus > 0) {
                    rows.push({ label: '数月奖金税额（÷ ' + s.bonus.spreadMonths + ' 定档后再 × '
                        + s.bonus.spreadMonths + '）', value: s.bonus.tax, kind: 'money',
                        hint: s.bonus.note });
                }
                rows.push({ label: s.status.isResident ? '应缴个人所得税（按年累计）' : '应缴个人所得税',
                    value: s.tax, kind: 'money' });
                if (input.bonus > 0 && Math.abs(s.naiveGap) > 0.01) {
                    rows.push({ label: '若把奖金并入发放当月（错误算法）', value: s.naive, kind: 'money',
                        hint: '法定口径 ' + Math.round(s.tax) + ' 元，差 ' + Math.round(s.naiveGap) + ' 元' });
                }

                var scenarios = Q.scenarioTableOf(input);
                var vol = Q.volatilitySampleOf(input);
                var bonusMerged = input.bonus > 0
                    ? Q.monthlyTaxOf(Math.max(0, input.monthlyTotal + input.bonus - sal.monthlyDeduction)).tax
                        + Math.max(0, sal.months - 1) * sal.taxPerMonth
                    : 0;

                var extras = [{
                    title: '四档：同样是这批工资，住多久决定缴多少',
                    note: '没有单位 PRC 税务局会替你选一档 —— 四个情形是同一批收入（月领 3 万，其中境内'
                        + '支付 ' + Math.round(input.monthlyPaidDomestic / 10000) + ' 万，'
                        + input.calendarDays + ' 天里境内工作 ' + input.domesticWorkDays + ' 天）',
                    table: {
                        head: ['居住天数 / 身份', '适用公式', '当月收入额', '个税'],
                        rows: scenarios.map(function (r0) {
                            return [r0.label, r0.formula, money(r0.monthlyIncome), money(r0.tax)];
                        })
                    }
                }, {
                    title: '数月奖金：单独分摊 vs 并入发放当月',
                    note: s.bonus.note + '；这是非居民最贵的一处上手经验',
                    table: {
                        head: ['口径', '算法', '税额'],
                        rows: [
                            ['法定：单独按 ' + s.bonus.spreadMonths + ' 个月分摊',
                                '〔（' + Math.round(s.bonus.inScope) + ' ÷ ' + s.bonus.spreadMonths
                                    + '）× ' + Math.round(s.bonus.rate * 100) + '% − '
                                    + Math.round(s.bonus.deduction) + '〕× ' + s.bonus.spreadMonths,
                                money(s.bonus.tax)],
                            ['错误：并入发放当月计税',
                                '（' + Math.round(input.monthlyTotal + input.bonus) + ' − '
                                    + Math.round(sal.monthlyDeduction) + '）查月度税率表',
                                money(bonusMerged)]
                        ]
                    }
                }, {
                    title: '发放节奏：同一笔年收入，怎么发决定非居民交多少',
                    note: vol.note,
                    table: {
                        head: ['发放方式', '每月金额', '非居民（月度表）', '居民（年度表）'],
                        rows: [
                            ['按月均匀发放', money(rround(vol.flatEach)), money(vol.flatTax), money(vol.residentSame)],
                            ['前 ' + Math.max(0, vol.months - 1) + ' 个月少发、最后一个月集中发',
                                Math.round(vol.lumpEach) + ' 元 / ' + Math.round(vol.lumpLast) + ' 元',
                                money(vol.lumpTax), money(vol.residentSame)]
                        ]
                    }
                }];

                var note = '本纳税年度境内累计居住 ' + s.status.days + ' 天 → ' + s.status.tierLabel
                    + '；当月工资薪金收入额 ' + Math.round(ic.amount) + ' 元（' + ic.formula + '：'
                    + ic.label + '）';
                if (!s.status.isResident) {
                    note += '，按 ' + (sal.monthlyDeduction || 0) + ' 元/月减除后适用月度税率表 '
                        + Math.round(sal.rate * 100) + '%';
                }
                note += '，工资薪金 ' + Math.round(sal.tax) + ' 元';
                if (input.bonus > 0) note += '，数月奖金 ' + Math.round(s.bonus.tax) + ' 元';
                note += '，合计 **' + Math.round(s.tax) + ' 元**';
                if (input.bonus > 0 && Math.abs(s.naiveGap) > 0.01) {
                    note += '；奖金并入发放当月的错法会算出 ' + Math.round(s.naive) + ' 元（多 '
                        + Math.round(s.naiveGap) + ' 元）';
                }
                if (ic.amount < input.monthlyTotal - 0.01) {
                    note += '；另有每月 ' + Math.round(input.monthlyTotal - ic.amount)
                        + ' 元按所得来源地规则不在中国的征税范围内';
                }

                var steps = [{
                    title: '① 纳税义务四个档（个税法第一条 + 34 号）',
                    rows: [
                        { label: '本纳税年度境内累计居住天数', value: s.status.days + ' 天', format: 'text',
                            note: '当天停留满 24 小时才算一天' },
                        { label: '身份判定', value: s.status.tierLabel, format: 'text' },
                        { label: '适用口径', value: ic.formula, format: 'text', note: ic.note }
                    ],
                    footnote: s.sixYear.reasons.join('；')
                }, {
                    title: '② 当月工资薪金收入额（35 号第二条）',
                    rows: [
                        { label: '当月境内外工资薪金总额', value: input.monthlyTotal, format: 'money' },
                        { label: '境内支付占比', value: ic.payRatio, format: 'percent',
                            note: '由境内雇主支付或者负担 ' + Math.round(input.monthlyPaidDomestic) + ' 元' },
                        { label: '境内工作天数占比', value: ic.dayRatio, format: 'percent',
                            note: input.domesticWorkDays + ' ÷ ' + input.calendarDays + ' 天' },
                        { label: '当月工资薪金收入额', value: ic.amount, format: 'money',
                            note: ic.label }
                    ],
                    footnote: '三个公式随居住天数与身份切换；高管（董事、监事、高层管理职务）'
                        + '无论是否在境内履行职务，由境内居民企业支付或者负担的报酬一律属于境内所得'
                }, {
                    title: '③ 税款计算（35 号第三条）',
                    rows: s.status.isResident ? [
                        { label: '年度收入额合计', value: sal.salaryIncome + s.bonus.inScope, format: 'money' },
                        { label: '减：年度费用扣除', value: s.rules.annualDeduction || 0, format: 'money' },
                        { label: '应纳税所得额', value: Math.max(0, sal.salaryIncome + s.bonus.inScope
                            - (s.rules.annualDeduction || 0)), format: 'money' },
                        { label: '应缴个人所得税（年度表）', value: s.tax, format: 'money' }
                    ] : [
                        { label: '当月收入额', value: ic.amount, format: 'money' },
                        { label: '减：每月费用扣除', value: sal.monthlyDeduction, format: 'money' },
                        { label: '应纳税所得额（月度口径）', value: sal.taxablePerMonth, format: 'money' },
                        { label: '月度税率 / 速算扣除数', value: Math.round(sal.rate * 100) + '% / '
                            + Math.round(sal.deduction) + ' 元', format: 'text' },
                        { label: '当月工资薪金税额', value: sal.taxPerMonth, format: 'money' },
                        { label: '× 任职月数', value: sal.months + ' 个月', format: 'text' },
                        { label: '工资薪金税额合计', value: sal.tax, format: 'money' },
                        { label: '数月奖金（÷ ' + s.bonus.spreadMonths + ' 定档后 × '
                            + s.bonus.spreadMonths + '）', value: s.bonus.tax, format: 'money' },
                        { label: '应缴个人所得税', value: s.tax, format: 'money' }
                    ],
                    footnote: s.status.isResident
                        ? '居民个人：工资薪金并入综合所得按年计税，次年办理汇算清缴'
                        : '非居民个人：按月换算后的综合所得税率表逐月单独计税，不办理年度汇算、'
                            + '不享受专项附加扣除；数月奖金单独分摊且一个年度内只能用一次'
                }];

                return {
                    primary: { label: s.status.isResident ? '应缴个人所得税（居民：按年累计）'
                        : '应缴个人所得税（非居民：按月换算）', value: s.tax, kind: 'money' },
                    rows: rows, note: note, extras: extras, steps: steps
                };
            }
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
