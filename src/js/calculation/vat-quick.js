/**
 * 增值税 —— 轻量实现（阶段15 15B-1）
 *
 * 为什么单独做一个 quick 文件：
 *   /seo/vat.html 只需要「这笔业务要交多少增值税」，不值得引一遍完整引擎。
 *   但法定档位与优惠参数必须同源 —— 所以本文件不复制任何数字：
 *   规则取注册表声明的 vatRules，页面呈现的文号取 tax-registry.js。
 *   （对拍见 tests/vat-quick.test.js。）
 *
 * 三件事必须讲清楚（这是本页存在的全部理由）：
 *   1. **增值税是价外税**：合同里的「含税价」要先按征收率/税率分离出不含税销售额，
 *      再乘税率 —— 直接拿含税价乘税率会**多算**（含税 113000、13% 税率下，
 *      正确的销项是 13000，直接乘会得到 14690）。
 *   2. **免征额按「全部销售额」判断、且看的是不含税销售额**：小规模纳税人按月纳税的
 *      月销售额 10 万元以下（按季 30 万元以下）免征；一旦超过，是**全额**按征收率计税
 *      而不是只对超出部分 —— 所以「季度 30 万」是真正的临界点（多 1 分钱多缴约 3000 元）。
 *   3. **一般纳税人算的是「销项 − 进项」**：进项要凭合规扣税凭证抵扣，抵不完的留抵下期、
 *      不会倒欠；小规模纳税人不得抵扣进项，直接按销售额 × 征收率。
 *      「小规模 3% 减按 1%」是阶段性优惠（至 2027-12-31），不是法定征收率。
 */
(function (global) {
    'use strict';

    var registry = global.EuriskoTaxRegistry;

    function params() {
        return (registry && registry.resolveParams('vat')) || {};
    }

    function rules() {
        return params().rules || global.vatRules;
    }

    function toNumber(v, fallback) {
        var n = Number(v);
        if (!isFinite(n) || n < 0) return fallback || 0;
        return n;
    }

    function thresholdOf(period) {
        var r = rules().smallScale;
        return period === 'month' ? r.monthlyThreshold : r.quarterlyThreshold;
    }

    /**
     * 小规模纳税人：不含税销售额 × 征收率（现行优惠减按 1%），不抵扣进项。
     *
     * @param {Object} input
     *   sales           本期销售额（元）
     *   period          'quarter'（默认，按季纳税）或 'month'（按月纳税）
     *   taxIncluded     sales 是否为含税价（默认 false）
     *   specialInvoice  其中开具增值税专用发票的不含税销售额（元，免税部分不含专票）
     */
    function smallScaleOf(input) {
        input = input || {};
        var r = rules().smallScale;
        var period = input.period === 'month' ? 'month' : 'quarter';
        var raw = toNumber(input.sales);
        var rate = r.reducedRate;
        // 免征判断与计税都用**不含税**销售额：含税价先按现行征收率分离
        var exclusive = input.taxIncluded ? raw / (1 + rate) : raw;
        var threshold = thresholdOf(period);
        var exempt = r.thresholdInclusive ? exclusive <= threshold : exclusive < threshold;
        var special = Math.min(toNumber(input.specialInvoice), exclusive);
        // 未超过额度：普票部分免征，专票部分按票面征收率照缴；超过额度：全额计税
        var tax = exempt ? special * rate : exclusive * rate;
        var statutoryTax = exclusive * r.levyRate;
        return {
            period: period,
            sales: raw,
            taxIncluded: !!input.taxIncluded,
            rate: rate,
            levyRate: r.levyRate,
            exclusive: exclusive,
            threshold: threshold,
            exempt: exempt,
            specialInvoice: special,
            tax: tax,
            statutoryTax: statutoryTax,
            saving: statutoryTax - tax,
            // 临界点：当前免征时再多 1 分钱就要全额计税，用来说明「30 万是临界点」
            cliffTax: exempt ? (exclusive + 0.01) * rate : 0
        };
    }

    /**
     * 一般纳税人：应纳税额 = 销项税额 − 进项税额（不足抵扣的留抵下期，不倒欠）。
     *
     * @param {Object} input
     *   output       销售额（元）
     *   input        当期进项税额（元）
     *   rate         适用税率（0.13 / 0.09 / 0.06 / 0）
     *   taxIncluded  output 是否为含税价（默认 false）
     */
    function generalOf(input) {
        input = input || {};
        var general = rules().general;
        var rate = input.rate === 0 || input.rate === '0' ? 0 : toNumber(input.rate, 0.13);
        var raw = toNumber(input.output);
        var exclusive = input.taxIncluded ? raw / (1 + rate) : raw;
        var outputTax = exclusive * rate;
        var inputTax = toNumber(input.input);
        var tax = Math.max(0, outputTax - inputTax);
        return {
            output: raw,
            taxIncluded: !!input.taxIncluded,
            rate: rate,
            exclusive: exclusive,
            outputTax: outputTax,
            inputTax: inputTax,
            tax: tax,
            credit: Math.max(0, inputTax - outputTax),      // 留抵税额：结转下期继续抵扣
            burden: exclusive > 0 ? tax / exclusive : 0,    // 实际税负率（相对不含税销售额）
            simplifiedRate: general.simplifiedRate,
            // 同一笔业务若走简易计税（3%、不得抵扣进项）的对照
            simplifiedTax: exclusive * general.simplifiedRate
        };
    }

    /**
     * 价税分离：含税价 ⇄ 不含税价。
     *
     * @param {Object} input
     *   amount       金额（元）
     *   rate         税率 / 征收率
     *   taxIncluded  amount 是否为含税价（默认 true）
     */
    function priceSplitOf(input) {
        input = input || {};
        var rate = input.rate === 0 || input.rate === '0' ? 0 : toNumber(input.rate, 0.13);
        var amount = toNumber(input.amount);
        var taxIncluded = input.taxIncluded !== false;
        var exclusive = taxIncluded ? amount / (1 + rate) : amount;
        var tax = taxIncluded ? amount - exclusive : amount * rate;
        return {
            amount: amount,
            rate: rate,
            taxIncluded: taxIncluded,
            exclusive: exclusive,
            tax: tax,
            inclusive: exclusive + tax
        };
    }

    global.EuriskoVatQuick = {
        rules: rules,
        thresholdOf: thresholdOf,
        smallScaleOf: smallScaleOf,
        generalOf: generalOf,
        priceSplitOf: priceSplitOf
    };
})(typeof window !== 'undefined' ? window : globalThis);
