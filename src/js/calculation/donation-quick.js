/**
 * 公益慈善捐赠扣除 —— 阶段17 17D-10（v1.66.0）
 *
 * 为什么单独做一个 quick 文件：
 *   20 个速算器里**没有一个**能算捐赠 —— 它不是一个所得项目，而是**横跨综合所得、
 *   经营所得、分类所得三个所得项目**的一项扣除。而它最贵的一层恰恰是「**先扣哪一项**」：
 *   扣除顺序由纳税人自行决定（财政部 税务总局公告 2019 年第 99 号三（三）），
 *   同一笔捐赠先扣经营（20% 档）还是先扣综合（3% 档），实测一年能差 **3756 元**。
 *
 * 口径要点（错了就是把「捐赠额」直接当「扣除额」，或把「扣不完」当成作废）：
 *   1. **捐赠额 ≠ 你想捐的那个数**：货币性资产按实际捐赠额；**捐赠股权、房产按财产原值**
 *      （不是市值）；其他非货币性资产按市场价格（99 号公告二）。房产市值 500 万、
 *      原值 200 万 → 捐赠额是 **200 万**，按市值填会凭空多出 300 万扣除额；
 *   2. **限额 = 各所得项目应纳税所得额 × 30%**，不是收入的 30%；分类所得按**当月**
 *      应纳税所得额（不是全年），综合所得按当年（三（二））；
 *   3. **一个项目扣不完的，可以在其他项目继续扣**（三（一））—— 不是作废；
 *      但**超出全部项目限额之和**的那部分，个人**不结转以后年度**（企业可结转 3 年）；
 *   4. **扣除顺序由纳税人自行决定**（三（三）），且在分类所得中扣除的**不再调整到
 *      其他所得**（五）—— 所以顺序选错是真金白银的损失；
 *   5. **核定征收的经营所得不扣捐赠**（六（四））；合伙 / 个人独资企业按**分配比例**
 *      归属到每个投资者（六（二））；两处以上工资薪金的**只能选一处扣除、当年不得变更**
 *      （四（一））；劳务报酬 / 稿酬 / 特许权使用费**预扣时不扣**，统一汇算时扣（四（二））；
 *   6. 追补扣除与补充票据都是 **90 日**，票据留存 **5 年**（五、九）。
 *
 * 同源：限额比例与结转规则取注册表声明的 donationRules；综合所得税走内核
 *   calculateTaxByTaxableIncome、经营所得走 EuriskoBusinessIncomeQuick.taxOf（含 200 万减半）、
 *   分类所得走 classificationTaxRates —— 一个税率、一条公式都不复制。
 */
(function (global) {
    'use strict';

    var registry = global.EuriskoTaxRegistry;

    function rules() {
        return (registry && registry.resolveParams('donation').rules) || global.donationRules;
    }

    function toNumber(v, fallback) {
        var n = Number(v);
        if (!isFinite(n) || n < 0) return fallback || 0;
        return n;
    }

    /**
     * 捐赠额核定（99 号公告二）：
     *   货币 → 实际捐赠额；股权 / 房产 → **财产原值**；其他非货币性资产 → 市场价格。
     * @returns {{kind, kindLabel, amount, declared, gap, note}} amount = 可用于税前扣除的捐赠额
     */
    function amountOf(input) {
        input = input || {};
        var kind = input.donateKind || 'cash';
        var declared = 0, amount = 0, label = '', note = '';

        if (kind === 'equity') {
            declared = toNumber(input.equityMarketValue);
            amount = toNumber(input.equityCost);
            label = '捐赠股权';
            note = '按持有股权的**财产原值**确定 —— 不是市值（99 号公告二（二））';
        } else if (kind === 'house') {
            declared = toNumber(input.houseMarketValue);
            amount = toNumber(input.houseCost);
            label = '捐赠房产';
            note = '按持有房产的**财产原值**确定 —— 不是市值（99 号公告二（二））';
        } else if (kind === 'other') {
            declared = amount = toNumber(input.otherMarketValue);
            label = '其他非货币性资产';
            note = '按非货币性资产的**市场价格**确定（99 号公告二（三））';
        } else {
            declared = amount = toNumber(input.cashAmount);
            label = '货币捐赠';
            note = '按实际捐赠金额确定（99 号公告二（一））';
        }

        return {
            kind: kind, kindLabel: label, amount: amount, declared: declared,
            gap: Math.max(0, declared - amount),
            note: note,
            isFull: input.fullDeduction === 'yes'
        };
    }

    /**
     * 三个所得项目的扣除限额（捐赠前的应纳税所得额 × 30%）。
     * 分类所得按**当月**、经营所得核定征收时**不扣**。
     */
    function itemsOf(input) {
        input = input || {};
        var r = rules();
        var ratio = r.limitRatio;

        var comp = toNumber(input.comprehensiveTaxable);
        var bus = toNumber(input.businessTaxable);
        var cls = toNumber(input.classificationTaxable);
        var verified = input.businessVerified === 'yes';

        return [
            {
                key: 'comprehensive', label: '综合所得', type: 'comprehensive',
                taxable: comp, monthly: input.comprehensiveBasis === 'month',
                limit: comp * ratio, blocked: false, blockNote: ''
            },
            {
                key: 'business', label: '经营所得', type: 'business',
                taxable: bus, monthly: false,
                limit: verified ? 0 : bus * ratio,
                blocked: verified, blockNote: verified ? '核定征收的经营所得不扣除公益捐赠（六（四））' : ''
            },
            {
                key: 'classification', label: '分类所得（当月）', type: 'classification',
                taxable: cls, monthly: true, clsType: input.classificationType || 'accidental',
                limit: cls * ratio, blocked: false,
                blockNote: '分类所得按**当月**应纳税所得额算限额，且在分类所得中扣除的不再调整到其他所得'
            }
        ];
    }

    /** 某一项目在给定应纳税所得额下的税额（三条税率表各走各的入口） */
    function taxOf(type, taxable, clsType) {
        var t = Math.max(0, toNumber(taxable));
        if (type === 'business') {
            var B = global.EuriskoBusinessIncomeQuick;
            if (B && B.taxOf) return B.taxOf(t).tax;                     // 五级 + 200 万减半
            var core = global.calculateBusinessTaxByTaxableIncome;       // 内核回退（不含减半）
            return core ? core(t).tax : 0;
        }
        if (type === 'classification') {
            var table = global.classificationTaxRates || {};
            var rate = (table[clsType] && table[clsType].rate) || 0.2;   // 四类同为 20%
            return t * rate;
        }
        return global.calculateTaxByTaxableIncome(t).tax;                // 综合所得七级
    }

    /**
     * 按给定顺序把捐赠额分配到各项目：一个项目扣不完的**继续**在下一个项目扣（三（一））。
     * @param {number} amount 核定后的捐赠额
     * @param {Array} items   itemsOf 的结果
     * @param {Array} order   项目 key 的排列
     */
    function allocateOf(amount, items, order) {
        var remaining = Math.max(0, toNumber(amount));
        var per = (order || []).map(function (key) {
            var it = items.filter(function (x) { return x.key === key; })[0];
            if (!it) return null;
            var room = it.blocked ? 0 : Math.max(0, it.limit);
            var take = Math.min(remaining, room);
            remaining -= take;
            var taxableAfter = Math.max(0, it.taxable - take);
            var taxBefore = taxOf(it.type, it.taxable, it.clsType);
            var taxAfter = taxOf(it.type, taxableAfter, it.clsType);
            return {
                key: it.key, label: it.label, type: it.type,
                taxable: it.taxable, limit: it.limit, blocked: it.blocked, blockNote: it.blockNote,
                deductible: take, taxableAfter: taxableAfter,
                taxBefore: taxBefore, taxAfter: taxAfter, saving: taxBefore - taxAfter
            };
        }).filter(Boolean);

        var deductibleTotal = per.reduce(function (a, x) { return a + x.deductible; }, 0);
        var savingTotal = per.reduce(function (a, x) { return a + x.saving; }, 0);
        var taxBefore = items.reduce(function (a, it) { return a + taxOf(it.type, it.taxable, it.clsType); }, 0);
        var taxAfter = per.reduce(function (a, x) { return a + x.taxAfter; }, 0) +
            items.filter(function (it) { return (order || []).indexOf(it.key) < 0; })
                .reduce(function (a, it) { return a + taxOf(it.type, it.taxable, it.clsType); }, 0);

        return {
            order: (order || []).slice(), per: per,
            deductibleTotal: deductibleTotal,
            unused: Math.max(0, toNumber(amount) - deductibleTotal),   // 超出全部限额：个人不结转
            taxBefore: taxBefore, taxAfter: taxAfter, saving: taxBefore - taxAfter,
            savingByItem: savingTotal
        };
    }

    /** 三个项目的全部排列（3! = 6 种，含标签） */
    function ordersOf(items) {
        var keys = items.map(function (it) { return it.key; });
        var result = [];
        (function permute(prefix, rest) {
            if (!rest.length) { result.push(prefix.slice()); return; }
            rest.forEach(function (k, i) {
                permute(prefix.concat([k]), rest.slice(0, i).concat(rest.slice(i + 1)));
            });
        })([], keys);
        return result;
    }

    function orderLabel(order, items) {
        return order.map(function (k, i) {
            var it = items.filter(function (x) { return x.key === k; })[0];
            return (i + 1) + '·' + (it ? it.label : k);
        }).join(' → ');
    }

    /**
     * 六种扣除顺序对照：同一笔捐赠，先扣哪一项**税不一样**。
     * @returns {{orders, best, worst, gap}}
     */
    function compareOf(input) {
        input = input || {};
        var items = itemsOf(input);
        var amount = amountOf(input).amount;
        var orders = ordersOf(items).map(function (order) {
            var a = allocateOf(amount, items, order);
            a.label = orderLabel(order, items);
            return a;
        }).sort(function (a, b) { return b.saving - a.saving; });

        var best = orders[0];
        var worst = orders[orders.length - 1];
        return { orders: orders, best: best, worst: worst, gap: best.saving - worst.saving };
    }

    /**
     * 完整测算：捐赠额核定 → 三个项目限额 → 六种顺序对照 → 最优顺序与扣不完的部分。
     *
     * @param {Object} input
     *   donateKind / cashAmount / equityCost / equityMarketValue / houseCost / houseMarketValue
     *   otherMarketValue / fullDeduction
     *   comprehensiveTaxable / comprehensiveBasis / businessTaxable / businessVerified
     *   classificationTaxable / classificationType
     *   residency / employerCount / hasReceipt
     */
    function stackOf(input) {
        input = input || {};
        var r = rules();
        var declared = amountOf(input);
        var items = itemsOf(input);
        var cmp = compareOf(input);
        var best = cmp.best;

        var limitSum = items.reduce(function (a, it) { return a + it.limit; }, 0);

        // 全额扣除（国务院规定）的那部分不受 30% 限额约束；与 30% 的扣除次序自行选择（八）
        var deductibleByLimit = best.deductibleTotal;
        var amount = declared.amount;
        var fullPart = declared.isFull ? Math.max(0, amount - deductibleByLimit) : 0;

        var notes = [];
        if (declared.gap > 0) {
            notes.push('捐赠额按' + declared.note.replace(/\*\*/g, '') + '计为 ' + Math.round(amount)
                + ' 元，与票面市值差 ' + Math.round(declared.gap) + ' 元 —— 多出来的部分不能扣');
        }
        if (input.businessVerified === 'yes') {
            notes.push('经营所得为核定征收：不扣除公益捐赠（六（四））');
        }
        if (input.residency === 'non-resident') {
            notes.push('非居民个人：按捐赠**当月**应纳税所得额的 30% 扣除，扣不完的可以在经营所得中继续扣除（七）');
        }
        if (String(input.employerCount) === '2') {
            notes.push('两处以上工资薪金：只能选择其中一处扣除，选择后当年不得变更（四（一））');
        }
        if (input.hasReceipt === 'no') {
            notes.push('尚未取得捐赠票据：可先凭银行支付凭证扣除，须在捐赠之日起 ' + r.makeupDays
                + ' 日内补充提供票据，否则扣缴义务人应报告税务机关（九）');
        }
        if (best.unused > 0) {
            notes.push('超出全部所得项目限额的 ' + Math.round(best.unused)
                + ' 元，个人**不结转以后年度**（企业可结转 3 年）');
        }

        return {
            rules: r,
            declared: declared, amount: amount, isFull: declared.isFull, fullPart: fullPart,
            items: items, limitRatio: r.limitRatio, limitSum: limitSum,
            orders: cmp.orders, best: best, worst: cmp.worst, orderGap: cmp.gap,
            deductibleTotal: best.deductibleTotal, unused: best.unused,
            taxBefore: best.taxBefore, taxAfter: best.taxAfter, saving: best.saving,
            notes: notes,
            makeupDays: r.makeupDays, retentionYears: r.receiptRetentionYears
        };
    }

    global.EuriskoDonationQuick = {
        VERSION: '1.0.0',
        rules: rules,
        amountOf: amountOf,
        itemsOf: itemsOf,
        allocateOf: allocateOf,
        ordersOf: ordersOf,
        compareOf: compareOf,
        stackOf: stackOf
    };
})(typeof window !== 'undefined' ? window : this);
