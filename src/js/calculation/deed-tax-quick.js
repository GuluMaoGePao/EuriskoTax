/**
 * 契税（买房这一笔最大的税）—— 阶段22 M5 续（v2.2.0）
 *
 * 为什么单独做一个 quick 文件：
 *   买房是个人一辈子最大的一笔支出，而它要缴的税**全站一个入口都算不了** ——
 *   分类总表 §1.2 里 E16「买房了」是跨格子事项（契税不是所得，所以 9 格所得形态收不下它），
 *   B 分支 C3 财产与行为税里契税那一格也是空的。一套 500 万的房子契税就是 5 万到 15 万，
 *   差在哪儿、差多少，此前只能靠搜。
 *
 * 与 property-rental 同一个写法：**每个税种仍调用它自己的内核** ——
 *   价税分离调 `EuriskoVatQuick.priceSplitOf`，产权转移书据印花税调 `EuriskoSurtaxQuick.stampDutyOf`，
 *   本文件不复制它们的任何一条公式；税率与面积线取 tax-constants.js 的 `deedTaxRules`。
 *
 * 口径要点（错了就是几万块）：
 *   1. **计税依据不含增值税**（契税法第四条 + 财税〔2021〕23 号一）。免征增值税的，
 *      成交价格**不扣减**增值税税额 —— 二手房满两年是最常见的一种，此时合同价就是计税依据；
 *      而向开发商买新房（一般计税 9%）时，500 万的合同价要先除以 1.09，
 *      计税依据是 458.72 万而不是 500 万（契税 1.5% 差出 6193 元，见 vatCompareOf）。
 *   2. **法定税率是 3%~5% 的幅度，不是固定的 3%**（契税法第三条）：具体适用税率由省级人民政府
 *      在这个幅度内提出、报同级人大常委会决定。所以本工具把「当地法定税率」做成一个可选项，
 *      默认 3%（绝大多数省份），其余档位用户按当地口径选。
 *   3. **个人购买住房的两档优惠按「套数 × 面积」四格给**（财税〔2016〕23 号一）：
 *        唯一住房     ≤90㎡ → 1%     >90㎡ → 1.5%
 *        第二套改善性 ≤90㎡ → 1%     >90㎡ → 2%
 *      第三套及以上一律回到法定税率；**北上广深暂不实施第二套那一条**，所以同样买 110㎡ 的二套，
 *      在长沙是 2%、在深圳是 3%（500 万差 5 万）。另外这个优惠只给**个人**，企业买房不适用。
 *   4. **房屋互换按差额计税**（契税法第四条（二））：是两套房价格的**差额**，不是各自全额相加；
 *      价格相等时差额为 0，也就不缴契税（只缴印花税那一笔）。
 *   5. **法定继承与夫妻间变更免征**（契税法第六条（四）（五））：这两件事常有中介说「要交 3%」，
 *      实际上法定继承人继承承受的免征（**遗嘱继承给非法定继承人的属于赠与，不在免征范围**）。
 *   6. **印花税只对非住房**：对个人购买住房免征（财税〔2008〕137 号二）；买商铺、写字楼要按
 *      产权转移书据 0.5‰ 贴花（税率与减半规则在 stampDutyRules，本文件不抄）。
 *
 * 同源：税率、面积线、免征情形取 `deedTaxRules`；增值税税率引 `vatRules`（一般计税 9% /
 * 不动产征收率 5%），价税分离与印花税分别调 vat-quick / surtax-stamp-quick。
 */
(function (global) {
    'use strict';

    var C = global.EuriskoTaxConstants;

    function rules() {
        return (C && C.deedTaxRules) || {};
    }

    function vatRules() {
        return (C && C.vatRules) || null;
    }

    function toNumber(v, fallback) {
        var n = Number(String(v === null || v === undefined ? '' : v).replace(/,/g, '').trim());
        if (!isFinite(n) || n < 0) return fallback || 0;
        return n;
    }

    function round(n) {
        return Math.round(n * 100 + Number.EPSILON) / 100;
    }

    function isHousing(input) {
        return (input || {}).usage !== 'nonHousing';
    }

    function isIndividual(input) {
        return (input || {}).buyer !== 'company';
    }

    /** 当地法定税率：用户按当地口径选（3%~5%），越界夹回幅度内 */
    function statutoryRateOf(input) {
        var s = rules().statutory || {};
        var r = toNumber((input || {}).statutoryRate, s.default || 0.03);
        return Math.min(Math.max(r, s.min || 0.03), s.max || 0.05);
    }

    /**
     * 增值税处理方式对应的分离税率：
     *   general = 销售不动产一般计税 9%（引 vatRules.general）、simple = 不动产征收率 5%（引 vatRules.smallScale）、
     *   exempt  = 免征增值税（二手房满两年等）→ 0，此时成交价格**不扣减**增值税（财税〔2021〕23 号一）
     */
    function vatRateOf(input) {
        var mode = (input || {}).vatMode || 'exempt';
        var v = vatRules();
        if (mode === 'general') return v && v.general ? v.general.rates[1].rate : 0.09;
        if (mode === 'simple') return v && v.smallScale ? v.smallScale.levyRates[1].rate : 0.05;
        return 0;
    }

    /**
     * 计税依据（契税法第四条 + 财税〔2021〕23 号一）：
     *   买卖 → 成交价格（不含增值税）；互换 → 两套房价格的**差额**；
     *   赠与等无价格的转移 → 税务机关参照市场价格**核定**（本工具由用户输入核定价）；
     *   法定继承 → 免征，计税依据照列但税额为 0。
     */
    function basisOf(input) {
        input = input || {};
        var r = rules();
        var scene = input.scene || 'sale';
        var price = toNumber(input.price);
        var swapPrice = toNumber(input.swapPrice);

        // 互换：计税依据是**差额**，不是两套房子各算一遍（契税法第四条（二））
        var gross = scene === 'swap' ? Math.abs(price - swapPrice) : price;
        // 赠与 / 继承没有成交价格可分离增值税；核定价本身就是不含增值税的
        var vatRate = (scene === 'assess' || scene === 'inherit') ? 0 : vatRateOf(input);
        var split = (vatRate > 0 && global.EuriskoVatQuick)
            ? global.EuriskoVatQuick.priceSplitOf({ amount: gross, rate: vatRate, taxIncluded: true })
            : null;
        var exclusive = split ? split.exclusive : gross;
        var vat = split ? (split.tax || (gross - exclusive)) : 0;

        var modeText = vatRate > 0
            ? '按 ' + Math.round(vatRate * 100) + '% 分离，计税依据为不含增值税价格'
            : '免征增值税（或不涉及增值税）→ 成交价格不扣减，直接作为计税依据';

        return {
            scene: scene,
            price: price,
            swapPrice: swapPrice,
            gross: round(gross),
            vatRate: vatRate,
            vat: round(vat),
            base: round(exclusive),
            exempt: scene === 'inherit',
            assessNote: scene === 'assess'
                ? '赠与等没有成交价格的，由税务机关参照市场价格核定（契税法第四条（三）），此处填核定价'
                : '',
            modeText: modeText,
            basis: r.basisRules ? r.basisRules.basis : ''
        };
    }

    /**
     * 适用税率：先问「住房还是非住房 / 个人还是企业 / 是买还是继承」，
     * 再问「第几套 × 多大面积」—— 四格优惠只给**个人购买住房**这一条窄路。
     */
    function rateOf(input) {
        input = input || {};
        var r = rules();
        var h = r.housing || {};
        var statutory = statutoryRateOf(input);
        var scene = input.scene || 'sale';
        var housing = isHousing(input);

        if (scene === 'inherit') {
            return {
                rate: 0, statutory: statutory, preferential: false, exempt: true,
                reason: r.exempt ? r.exempt.note : '法定继承免征契税',
                basis: r.exempt ? r.exempt.basis : ''
            };
        }
        if (!housing) {
            return {
                rate: statutory, statutory: statutory, preferential: false, exempt: false,
                reason: '非住房（商铺、写字楼、车位等）不适用个人购买住房的优惠，按当地法定税率',
                basis: r.statutory ? r.statutory.basis : ''
            };
        }
        if (!isIndividual(input)) {
            return {
                rate: statutory, statutory: statutory, preferential: false, exempt: false,
                reason: '1% / 1.5% / 2% 的优惠只给个人购买家庭唯一或第二套改善性住房，企业购房按法定税率',
                basis: r.housing ? r.housing.basis : ''
            };
        }
        if (scene !== 'sale') {
            return {
                rate: statutory, statutory: statutory, preferential: false, exempt: false,
                reason: '互换与受赠不适用「购买住房」的优惠档，按当地法定税率',
                basis: r.housing ? r.housing.basis : ''
            };
        }

        var area = toNumber(input.area);
        var small = area <= (h.areaLimit || 90);
        var set = input.housingSet || 'first';
        var limit = h.areaLimit || 90;

        if (set === 'first') {
            return {
                rate: small ? h.first.small : h.first.large,
                statutory: statutory,
                preferential: true,
                exempt: false,
                set: 'first',
                areaText: '家庭唯一住房，' + Math.round(area) + ' 平方米（' + (small ? '≤' : '>') + limit + '㎡）',
                reason: '对个人购买家庭唯一住房，面积为 ' + limit + ' 平方米及以下的减按 1%、以上的减按 1.5%',
                basis: h.basis
            };
        }
        if (set === 'second') {
            // 北上广深暂不实施第二套改善性住房这一条优惠（财税〔2016〕23 号一（二）末句）
            if (input.city === 'big4' && h.bigFourSecondExcluded) {
                return {
                    rate: statutory, statutory: statutory, preferential: false, exempt: false,
                    set: 'second',
                    areaText: '第二套住房，' + Math.round(area) + ' 平方米，位于' + (h.bigFourCities || '北上广深'),
                    reason: '北上广深暂不实施第二套改善性住房的契税优惠，按当地法定税率',
                    basis: h.basis
                };
            }
            return {
                rate: small ? h.second.small : h.second.large,
                statutory: statutory,
                preferential: true,
                exempt: false,
                set: 'second',
                areaText: '家庭第二套改善性住房，' + Math.round(area) + ' 平方米（' + (small ? '≤' : '>') + limit + '㎡）',
                reason: '对个人购买家庭第二套改善性住房，面积为 ' + limit + ' 平方米及以下的减按 1%、以上的减按 2%',
                basis: h.basis
            };
        }
        return {
            rate: statutory, statutory: statutory, preferential: false, exempt: false,
            set: 'third',
            areaText: '第三套及以上住房',
            reason: '第三套及以上住房不享受优惠，按当地法定税率',
            basis: h.basis
        };
    }

    /** 契税：应纳税额 = 计税依据 × 适用税率（契税法第五条） */
    function deedOf(input) {
        input = input || {};
        var b = basisOf(input);
        var rate = rateOf(input);
        var tax = rate.exempt ? 0 : round(b.base * rate.rate);
        var statutoryTax = rate.exempt ? 0 : round(b.base * rate.statutory);
        return {
            base: b.base,
            gross: b.gross,
            vat: b.vat,
            vatRate: b.vatRate,
            rate: rate.rate,
            statutoryRate: rate.statutory,
            preferential: rate.preferential,
            exempt: !!rate.exempt,
            tax: tax,
            statutoryTax: statutoryTax,
            saving: round(statutoryTax - tax),
            areaText: rate.areaText || '',
            note: rate.exempt
                ? (rules().exempt ? rules().exempt.note : '法定继承免征契税')
                : '计税依据 ' + Math.round(b.base) + ' 元（' + b.modeText + '）× 适用税率 '
                    + Math.round(rate.rate * 1000) / 100 + '%',
            reason: rate.reason,
            basis: rate.basis
        };
    }

    /**
     * 印花税：产权转移书据 0.5‰（税率与减半规则在 stampDutyRules，这里只给税目与金额）；
     * 个人购买住房免征（财税〔2008〕137 号二）。
     */
    function stampOf(input) {
        input = input || {};
        var r = rules().stamp || {};
        var b = basisOf(input);
        if (isHousing(input)) {
            return {
                tax: 0, statutoryTax: 0, exempt: true, amount: b.gross,
                note: '对个人销售或购买住房免征印花税（财税〔2008〕137 号二）',
                basis: r.basis
            };
        }
        var stamp = global.EuriskoSurtaxQuick
            ? global.EuriskoSurtaxQuick.stampDutyOf({
                item: r.itemKey,
                amount: b.gross,
                vat: b.vat,
                halve: input.halve
            })
            : null;
        return {
            tax: stamp ? stamp.tax : 0,
            statutoryTax: stamp ? stamp.statutoryTax : 0,
            saving: stamp ? stamp.saved : 0,
            exempt: false,
            amount: b.gross,
            rate: stamp ? stamp.rate : 0.0005,
            rateText: stamp ? stamp.rateText : '万分之五',
            note: '非住房按产权转移书据 ' + (stamp ? stamp.rateText : '万分之五')
                + ' 贴花，计税依据不含单独列明的增值税税款',
            basis: r.basis
        };
    }

    /**
     * 一屏总额：契税 + 印花税，外加「总支出」与两个对照。
     *
     * @param {Object} input
     *   scene（sale / swap / assess / inherit）、usage（housing / nonHousing）、buyer（individual / company）、
     *   price（成交价格，通常为含税合同价）、swapPrice（互换时对方房屋价格）、area（建筑面积）、
     *   housingSet（first / second / third）、city（big4 / other）、vatMode（exempt / general / simple）、
     *   statutoryRate（当地法定税率）、halve（印花税按小规模纳税人减半）
     */
    function stackOf(input) {
        input = input || {};
        var b = basisOf(input);
        var deed = deedOf(input);
        var stamp = stampOf(input);
        var total = round(deed.tax + stamp.tax);
        var outlay = round(toNumber(input.price) + total);

        var rows = [
            {
                key: 'price',
                label: input.scene === 'swap' ? '两套房的差价（互换）' : '成交价格（合同金额）',
                value: b.gross, kind: 'money',
                hint: input.scene === 'swap'
                    ? '房屋互换按所互换房屋价格的差额计税（契税法第四条（二））'
                    : b.modeText
            },
            {
                key: 'base', label: '契税计税依据（不含增值税）', value: b.base, kind: 'money',
                hint: b.vatRate > 0 ? '已按 ' + Math.round(b.vatRate * 100) + '% 价税分离' : '不涉及增值税，不扣减'
            },
            { key: 'deedTax', label: '契税', value: deed.tax, kind: 'money', hint: deed.reason },
            { key: 'stamp', label: '印花税（产权转移书据）', value: stamp.tax, kind: 'money', hint: stamp.note },
            { key: 'total', label: '合计要交的税', value: total, kind: 'money' },
            { key: 'outlay', label: '房款 + 税（总支出）', value: outlay, kind: 'money' }
        ];

        var notes = [];
        if (deed.exempt) {
            notes.push(deed.note + '（契税法第六条）；印花税那一笔仍需按规定贴花');
        }
        if (deed.preferential) {
            notes.push('已按优惠税率 ' + Math.round(deed.rate * 1000) / 100 + '% 计征，法定税率是 '
                + Math.round(deed.statutoryRate * 100) + '% —— 少缴 ' + Math.round(deed.saving) + ' 元');
        }
        if (b.vatRate > 0) {
            notes.push('计税依据不含增值税：' + Math.round(b.gross) + ' 元的合同价分离出增值税 '
                + Math.round(b.vat) + ' 元，契税只对 ' + Math.round(b.base) + ' 元计征');
        } else if (input.scene === 'sale' || input.scene === 'swap') {
            notes.push('不涉及增值税（或免征），成交价格不扣减，直接作为计税依据（财税〔2021〕23 号一）');
        }
        if (input.scene === 'assess') {
            notes.push(b.assessNote);
        }

        return {
            rules: rules(),
            scene: input.scene || 'sale',
            housing: isHousing(input),
            individual: isIndividual(input),
            basis: b,
            deedTax: deed,
            stamp: stamp,
            rows: rows,
            total: total,
            outlay: outlay,
            statutoryTotal: round(deed.statutoryTax + (stamp.statutoryTax || 0)),
            effectiveRate: b.gross > 0 ? total / b.gross : 0,
            notes: notes,
            deadline: rules().deadline
        };
    }

    /**
     * 同一套房：首套 / 二套 / 三套差多少 —— 买房前最该先看的一张表。
     * 三套及以上与「北上广深的二套」都回到法定税率，所以这张表经常是「1.5% → 2% → 3%」三级跳。
     */
    function setCompareOf(input) {
        input = input || {};
        var mk = function (set) {
            var next = {};
            Object.keys(input).forEach(function (k) { next[k] = input[k]; });
            next.housingSet = set;
            return stackOf(next);
        };
        var first = mk('first');
        var second = mk('second');
        var third = mk('third');
        return {
            first: first,
            second: second,
            third: third,
            gapSecondVsFirst: round(second.total - first.total),
            gapThirdVsFirst: round(third.total - first.total),
            note: '同一套房、同一价格，家庭住房套数不同税率不同：唯一住房 1% / 1.5%，'
                + '第二套改善性住房 1% / 2%（北上广深不实施），第三套及以上回到法定税率'
        };
    }

    /**
     * 90 平方米那条线：差 1 平方米，税率跳一档（1% → 1.5%、1% → 2%）。
     * 这条线是**含本数**的：90 平方米及以下按小面积档（财税〔2016〕23 号一）。
     */
    function areaCompareOf(input) {
        input = input || {};
        var limit = (rules().housing || {}).areaLimit || 90;
        var mk = function (area) {
            var next = {};
            Object.keys(input).forEach(function (k) { next[k] = input[k]; });
            next.area = area;
            return stackOf(next);
        };
        var small = mk(limit);
        var large = mk(limit + 1);
        return {
            limit: limit,
            small: small,
            large: large,
            gap: round(large.total - small.total),
            note: '面积为 ' + limit + ' 平方米及以下的按小面积档（' + limit
                + ' 平方米这条线含本数），超过一平方米就跳到上一档'
        };
    }

    /**
     * 含税 vs 不含税：向开发商买新房（一般计税 9%）时最容易多缴的一笔。
     * 同样 500 万的合同价：按法定口径分离后计税依据是 458.72 万，契税 1.5% 差 6193 元。
     */
    function vatCompareOf(input) {
        input = input || {};
        var mk = function (vatMode) {
            var next = {};
            Object.keys(input).forEach(function (k) { next[k] = input[k]; });
            next.vatMode = vatMode;
            return stackOf(next);
        };
        var exempt = mk('exempt');
        var general = mk('general');
        return {
            exempt: exempt,
            general: general,
            gap: round(exempt.total - general.total),
            note: '契税的计税依据不含增值税（财税〔2021〕23 号一）：合同价里如果含着增值税，'
                + '要先分离出去再计税；免征增值税的则不扣减'
        };
    }

    global.EuriskoDeedTaxQuick = {
        VERSION: '1.0.0',
        rules: rules,
        statutoryRateOf: statutoryRateOf,
        vatRateOf: vatRateOf,
        basisOf: basisOf,
        rateOf: rateOf,
        deedOf: deedOf,
        stampOf: stampOf,
        stackOf: stackOf,
        setCompareOf: setCompareOf,
        areaCompareOf: areaCompareOf,
        vatCompareOf: vatCompareOf
    };
})(typeof window !== 'undefined' ? window : this);
