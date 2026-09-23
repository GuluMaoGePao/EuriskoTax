/**
 * 经营所得（个体工商户 / 个人独资企业 / 合伙企业）—— 轻量实现（阶段15 15B-5）
 *
 * 为什么单独做一个 quick 文件：
 *   /seo/business-income.html 只需要「核定与查账哪个更省」，不值得引一遍完整引擎。
 *   但法定档位与优惠参数必须同源 —— 所以本文件不复制任何数字：
 *   税率取 businessTaxRates、规则取注册表声明的 businessIncomeRules，
 *   页面呈现的文号取 tax-registry.js。（对拍见 tests/business-income-quick.test.js。）
 *
 * 三件事必须讲清楚（这是本页存在的全部理由）：
 *   1. **核定不等于少交税**：核定征收按「收入 × 应税所得率」算税，成本费用再多也不看，
 *      业主 6 万费用扣除与专项附加同样不能扣，核定期间的亏损也不得弥补。
 *      所以**实际利润率低于核定应税所得率时，核定反而多交税** —— 这正是本页要算出来的临界点。
 *   2. **临界点比直觉高一截**：查账还能扣业主本人费用 6 万元/年（且只在没有综合所得时可扣），
 *      因此临界净利率通常 ≈ 核定应税所得率 + 6 万 ÷ 年收入。年收入 60 万、核定所得率 10%
 *      时，临界净利率是 20% —— 不是 10%。
 *   3. **减半只减「不超过 200 万那部分」的税额**：年应纳税所得额 300 万时，只有 200 万以内
 *      部分对应的税额减半，超出部分全额计税；核定与查账**都能**享受（财政部 税务总局
 *      公告 2023 年第 12 号，执行至 2027-12-31，到期状态由注册表 statusOf 给出）。
 */
(function (global) {
    'use strict';

    var registry = global.EuriskoTaxRegistry;

    function params() {
        return (registry && registry.resolveParams('business-income')) || {};
    }

    function rules() {
        return params().rules || global.businessIncomeRules;
    }

    function rates() {
        return params().rates || global.businessTaxRates;
    }

    function toNumber(v, fallback) {
        var n = Number(v);
        if (!isFinite(n) || n < 0) return fallback || 0;
        return n;
    }

    /**
     * 五级超额累进（**未减半**）—— 17E（v1.70.0）起这里不再自己维护一份：
     * 直接取内核 `calculateBusinessTaxByTaxableIncome` 的定档结果。
     *
     * 为什么敢反向依赖内核：加载顺序在 `index.html` 与 `tests/helpers/load-source.js` 里都是
     * 「内核在前、quick 在后」（用到这话 JSDOM 测试也一样），而调用链很短 —— 统一之后
     * 经营所得的**定档与减半**都只剩一个真身：内核那一份。
     * 税率表是经营所得自己的五级表（5%/10%/20%/30%/35%），不是工资那张七级表。
     */
    function taxBeforeHalveOf(taxable) {
        var t = toNumber(taxable);
        if (t <= 0) return { tax: 0, rate: 0, deduction: 0 };
        var k = global.calculateBusinessTaxByTaxableIncome(t);
        return { tax: k.tax, rate: k.rate, deduction: k.deduction };
    }

    /**
     * 减半减免额：不超过 200 万元那部分应纳税所得额**对应的税额**的一半
     * （减免税额 = (min(应纳税所得额, 200 万) × 税率 − 速算扣除数) × 50%，再以「不为负」兜底）。
     *
     * 17E：这式子原先在本模块与内核里各有一份，方言不同（本模块额外用上限内金额单独走一次
     * 税率表），实际等价但没有证明 —— 现在两边都调用内核的 `businessHalveOf`，并由
     * tests/business-halve-consistency.test.js 用一份独立参考实现逐点钉住。
     */
    function halveOf(taxable) {
        var t = toNumber(taxable);
        if (t <= 0) return 0;
        return global.businessHalveOf(t).reduction;
    }

    /** 实际应纳税额（含减半） */
    function taxOf(taxable) {
        var h = global.businessHalveOf(toNumber(taxable));
        return {
            taxable: h.taxable,
            beforeHalve: h.before,
            halve: h.reduction,
            tax: h.tax,
            rate: h.rate,
            deduction: h.deduction,
            effectiveRate: h.taxable > 0 ? h.tax / h.taxable : 0,
            halveApplied: h.reduction > 0
        };
    }

    /**
     * 核定征收：应纳税所得额 = 收入总额 × 应税所得率。
     *
     * **不扣**成本费用、**不扣**业主 6 万费用扣除、**不扣**专项附加，亏损也不得弥补 ——
     * 这三件事是「核定反而多交税」的全部来源。
     *
     * @param {Object} input
     *   revenue      年收入总额（元，不含增值税口径）
     *   profitRatio  应税所得率（默认取常量 defaultProfitRatio，各地核定）
     *   halve        是否享受≤200 万减半（默认 true）
     */
    function assessedOf(input) {
        input = input || {};
        var r = rules();
        var revenue = toNumber(input.revenue);
        var ratio = input.profitRatio === undefined
            ? r.assessed.defaultProfitRatio
            : toNumber(input.profitRatio, r.assessed.defaultProfitRatio);
        var useHalve = input.halve === undefined ? true : !!input.halve;
        var taxable = revenue * ratio;
        var result = useHalve ? taxOf(taxable) : (function () {
            var before = taxBeforeHalveOf(taxable);
            return {
                taxable: taxable,
                beforeHalve: before.tax,
                halve: 0,
                tax: before.tax,
                rate: before.rate,
                deduction: before.deduction,
                effectiveRate: taxable > 0 ? before.tax / taxable : 0,
                halveApplied: false
            };
        })();
        result.mode = 'assessed';
        result.revenue = revenue;
        result.profitRatio = ratio;
        return result;
    }

    /**
     * 查账征收：应纳税所得额 = 收入 − 成本费用损失 − 以前年度亏损 − 业主费用扣除 − 专项扣除 − 专项附加扣除。
     *
     * @param {Object} input
     *   revenue                年收入总额（元，不含增值税口径）
     *   cost                   成本、费用、税金及损失合计（元）
     *   previousLoss           可弥补的以前年度亏损（元，核定期间亏损不得弥补）
     *   specialDeduction       个人缴纳的社保公积金（元，无综合所得时才可扣）
     *   specialAdditional      专项附加扣除（元，无综合所得时才可扣）
     *   investorDeduction      业主本人费用扣除（元，默认：无综合所得 60000 / 有综合所得 0）
     *   hasComprehensiveIncome 是否另有工资薪金等综合所得（决定 6 万扣在哪边）
     *   halve                  是否享受≤200 万减半（默认 true）
     */
    function auditedOf(input) {
        input = input || {};
        var r = rules();
        var revenue = toNumber(input.revenue);
        var cost = toNumber(input.cost);
        var previousLoss = toNumber(input.previousLoss);
        var hasComprehensive = !!input.hasComprehensiveIncome;
        var investorDeduction = input.investorDeduction === undefined
            ? (hasComprehensive ? 0 : r.audited.investorAnnualCap)
            : toNumber(input.investorDeduction);
        // 有综合所得时，6 万基本减除费用、社保公积金与专项附加只能在综合所得侧扣一次
        var specialDeduction = hasComprehensive ? 0 : toNumber(input.specialDeduction);
        var specialAdditional = hasComprehensive ? 0 : toNumber(input.specialAdditional);

        var profit = Math.max(0, revenue - cost);
        var taxable = Math.max(0, profit - previousLoss - investorDeduction - specialDeduction - specialAdditional);

        var useHalve = input.halve === undefined ? true : !!input.halve;
        var result = useHalve ? taxOf(taxable) : (function () {
            var before = taxBeforeHalveOf(taxable);
            return {
                taxable: taxable,
                beforeHalve: before.tax,
                halve: 0,
                tax: before.tax,
                rate: before.rate,
                deduction: before.deduction,
                effectiveRate: taxable > 0 ? before.tax / taxable : 0,
                halveApplied: false
            };
        })();
        result.mode = 'audited';
        result.revenue = revenue;
        result.profit = profit;
        result.investorDeduction = investorDeduction;
        result.deductionTotal = previousLoss + investorDeduction + specialDeduction + specialAdditional;
        return result;
    }

    /**
     * 两种方式并排对比。
     *
     * @param {Object} input 同 auditedOf，另加 profitRatio（核定应税所得率）
     * @returns {{assessed: Object, audited: Object, cheaper: string, diff: number, profitRatio: number}}
     *   cheaper：'audited'（查账省）/ 'assessed'（核定省）/ 'same'（差 < 0.01 元）
     */
    function compareOf(input) {
        input = input || {};
        var assessed = assessedOf(input);
        var audited = auditedOf(input);
        var diff = assessed.tax - audited.tax; // > 0 表示查账更省
        var cheaper = Math.abs(diff) < 0.01 ? 'same' : (diff > 0 ? 'audited' : 'assessed');
        var revenue = toNumber(input.revenue);
        return {
            assessed: assessed,
            audited: audited,
            diff: diff,
            cheaper: cheaper,
            revenue: revenue,
            // 实际净利率（供页面展示「你的利润率在临界点哪一侧」）
            actualProfitRatio: revenue > 0 ? audited.profit / revenue : 0
        };
    }

    // 给定利润率时的查账税额（临界求解的内部函数）
    function auditedTaxAtProfitRatio(input, ratio) {
        var revenue = toNumber(input.revenue);
        var clone = Object.assign({}, input);
        clone.cost = Math.max(0, revenue - revenue * ratio);
        return auditedOf(clone).tax;
    }

    /**
     * 临界净利率：查账税额 = 核定税额 时的实际净利率。
     *
     * 低于它 → 核定更省；高于它 → 查账更省。之所以通常**高于**核定所得率，
     * 是因为查账还能扣掉业主本人的 6 万元费用扣除（「6 万 ÷ 年收入」那一截）。
     *
     * @returns {Object|null} 无解（查账在任何利润率下都更省）时返回 null
     */
    function breakevenProfitRatioOf(input) {
        input = input || {};
        var assessed = assessedOf(input).tax;
        var low = 0;
        var high = 1;
        if (auditedTaxAtProfitRatio(input, 0) > assessed) {
            // 连零利润都比核定交得多：核定恒优（比较罕见，通常意味着核定所得率极低）
            return {
                ratio: 0,
                revenue: toNumber(input.revenue),
                assessedTax: assessed,
                auditedTax: auditedTaxAtProfitRatio(input, 0),
                alwaysAssessed: true
            };
        }
        if (auditedTaxAtProfitRatio(input, high) < assessed) {
            return null; // 查账恒优
        }
        for (var i = 0; i < 200; i++) {
            var mid = (low + high) / 2;
            if (auditedTaxAtProfitRatio(input, mid) < assessed) low = mid;
            else high = mid;
        }
        var ratio = (low + high) / 2;
        var revenue = toNumber(input.revenue);
        return {
            ratio: ratio,
            revenue: revenue,
            profitAtRatio: revenue * ratio,
            assessedTax: assessed,
            auditedTax: auditedTaxAtProfitRatio(input, ratio),
            alwaysAssessed: false
        };
    }

    /** 静态表：不同实际净利率下的两种方式税额对比 */
    function profitRatioTableOf(ratios, input) {
        input = input || {};
        var revenue = toNumber(input.revenue);
        return (ratios || []).map(function (ratio) {
            var row = compareOf(Object.assign({}, input, {
                cost: Math.max(0, revenue - revenue * ratio)
            }));
            row.ratio = ratio;
            row.profit = row.audited.profit;
            return row;
        });
    }

    /** 静态表：减半优惠在不同应纳税所得额上的效果（说明「不是全额减半」） */
    function halveTableOf(taxables) {
        return (taxables || []).map(function (t) {
            var withHalve = taxOf(t);
            var without = taxBeforeHalveOf(t);
            return {
                taxable: t,
                tax: withHalve.tax,
                beforeHalve: without.tax,
                halve: withHalve.halve,
                savedRatio: without.tax > 0 ? withHalve.halve / without.tax : 0
            };
        });
    }

    /**
     * 一人兴办**两家以上**企业时的汇总口径（财税〔2000〕91号 第十二~十四条）。
     *
     * 三件事，每一件都会算错：
     *   ① **汇总定档**：年度终了应汇总所有企业的应纳税所得额，据此确定适用税率并计算税款
     *      （第十二条）—— 不是每家各自查一次税率表。分别申报会把速算扣除数扣两次、
     *      且档位偏低，属于**漏报**；
     *   ② **亏损不能跨企业弥补**（第十四条第二款）：亏损企业当年计 0，亏损留在本企业用
     *      以后年度所得逐年弥补（最长 5 年）—— 所以「盈利 50 万 + 亏损 20 万 = 30 万」
     *      这种互抵是错的；
     *   ③ 投资者本人的 6 万费用扣除**只能选其中一家扣**（第十三条）。
     *
     * @param {Object} input
     *   own      本企业（或本合伙企业按分配比例归属后的）应纳税所得额
     *   others   [{name, taxable}] 其他企业（亏损填负数）
     *   halve    是否享受≤200 万减半（默认 true）
     * @returns {Object} legal（法定）/ separate（分别申报）/ netting（误按互抵）三档税额与差额
     */
    function multiEntityOf(input) {
        input = input || {};
        var r = rules();
        var me = r.multiEntity || {};
        var useHalve = input.halve === undefined ? true : !!input.halve;
        var taxAt = function (t) {
            return useHalve ? taxOf(t).tax : taxBeforeHalveOf(t).tax;
        };
        // 注意：这里的 taxable **允许为负**（亏损企业），所以不能用模块内的 toNumber
        // （它对负数一律归零 —— 那是给收入 / 成本这类金额用的约定）
        var signed = function (v) { var n = Number(v); return isFinite(n) ? n : 0; };
        var own = signed(input.own);
        var others = input.others || [];

        var items = [{ name: input.ownName || '本企业（含你填的这一家）', taxable: own, isOwn: true }];
        for (var i = 0; i < others.length; i++) {
            items.push({
                name: others[i].name || ('其他企业' + (i + 1)),
                taxable: signed(others[i].taxable),
                isOwn: false
            });
        }

        // 亏损企业当年计 0（留在本企业结转以后年度，不跨企业弥补）
        var positive = items.map(function (it) { return Math.max(0, it.taxable); });
        var aggregateTaxable = positive.reduce(function (a, b) { return a + b; }, 0);
        var nettingTaxable = Math.max(0, items.reduce(function (a, it) { return a + it.taxable; }, 0));

        var legal = taxAt(aggregateTaxable);
        var separate = positive.reduce(function (a, t) { return a + taxAt(t); }, 0);
        var netting = taxAt(nettingTaxable);
        var lossCarried = items.reduce(function (a, it) { return it.taxable < 0 ? a - it.taxable : a; }, 0);

        return {
            items: items,
            aggregateTaxable: aggregateTaxable,
            nettingTaxable: nettingTaxable,
            legal: legal,
            separate: separate,
            netting: netting,
            separateGap: legal - separate,     // > 0：分别申报少交这么多（漏报）
            nettingGap: legal - netting,       // > 0：误按互抵少算这么多
            lossCarriedForward: lossCarried,   // 留在原企业结转的亏损额
            lossCarryYears: me.lossCarryYears,
            lossCarryAcross: !!me.lossCarryAcross,
            investorDeductionOnce: !!me.investorDeductionOnce,
            investorSalaryNotDeductible: !!me.investorSalaryNotDeductible,
            halveApplied: useHalve,
            basis: me.basis
        };
    }

    /**
     * 减半的**三种算法**并排（说明「减半」减的是什么）。
     *
     *   正确   ：减免 = min(应纳税所得额, 200 万) 那部分**对应的税额** × 50%
     *   误区① ：把「减半」当成**税额**直接打五折 —— 应纳税所得额超过 200 万时会**少算一大半**
     *   误区② ：把**应纳税所得额**打五折再查表 —— 跨档，同样少算
     *
     * 注意：应纳税所得额 ≤ 200 万时，误区① 与正确值恰好相等（全额都在减半范围内），
     * 所以这个坑只在**超过 200 万**时才现形 —— 恰恰是数字最大的那批人。
     */
    function halveCompareOf(taxable) {
        var t = toNumber(taxable);
        var r = rules().halve;
        var before = taxBeforeHalveOf(t).tax;
        var correct = taxOf(t).tax;
        var byTax = Math.max(0, before * r.ratio);                  // 误区①
        var byTaxable = taxBeforeHalveOf(t * r.ratio).tax;          // 误区②
        return {
            taxable: t,
            before: before,
            halve: taxOf(t).halve,
            correct: correct,
            byTax: byTax,
            byTaxable: byTaxable,
            gapByTax: correct - byTax,          // > 0：误区① 少算
            gapByTaxable: correct - byTaxable,  // > 0：误区② 少算
            threshold: r.threshold,
            ratio: r.ratio
        };
    }

    global.EuriskoBusinessIncomeQuick = {
        VERSION: '1.0.0',
        rules: rules,
        rates: rates,
        taxBeforeHalveOf: taxBeforeHalveOf,
        halveOf: halveOf,
        taxOf: taxOf,
        assessedOf: assessedOf,
        auditedOf: auditedOf,
        compareOf: compareOf,
        breakevenProfitRatioOf: breakevenProfitRatioOf,
        profitRatioTableOf: profitRatioTableOf,
        halveTableOf: halveTableOf,
        multiEntityOf: multiEntityOf,
        halveCompareOf: halveCompareOf
    };
})(typeof window !== 'undefined' ? window : globalThis);
