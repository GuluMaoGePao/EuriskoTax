/**
 * 个人出租不动产（财产租赁所得 + 房产税 + 增值税及附加 + 印花税）—— 阶段22 M5（v2.1.0）
 *
 * 为什么单独做一个 quick 文件：
 *   这是**第一个真正的跨税种组合器**。卖房（property-transfer-quick）只算财产转让所得个税，
 *   增值税与附加被有意留在外面（口径在 vat-quick / surtax-stamp-quick，不复制第二份），
 *   结果「卖房要交多少税」至今没有一屏的总额。出租不能再走同一条路 —— 个人出租住房涉及
 *   个税 + 房产税 + 增值税 + 附加 + 印花税**五个税种**，而且它们互相咬合：
 *   增值税是价外税，房产税和个税的计税依据都是**不含增值税**的租金收入；
 *   增值税免了附加税跟着免；房租里缴的这些税又能在个税前扣除。
 *   拆成五个工具让用户自己拼，等于把一笔房租算成五份税单 —— 所以这里做成组合器，
 *   但**每个税种仍调用它自己的内核**（见下方 vatOf / surtax / stamp），本文件一条税率都不重算。
 *
 * 口径要点（错了就是把「含税租金」当收入，或者把住房优惠套到商铺上）：
 *   1. **住房与非住房是两套税**，差别是整包给的（财税〔2008〕24 号二）：
 *        住房   → 增值税减按 1.5%、房产税 4%、个税 10%、**免征**印花税与城镇土地使用税；
 *        非住房 → 增值税 5%、房产税 12%、个税 20%、租赁合同按 1‰ 贴花、城镇土地使用税按当地定额。
 *      一字之差，月租 1 万一年的税差到 1.2 万（见 usageCompareOf）。
 *   2. **增值税是价外税，房租要先按 5% 分离**：个人出租住房的法定表述是
 *      「按 5% 的征收率减按 1.5% 计算应纳税额」，公式 = 含税销售额 ÷ (1 + 5%) × 1.5% ——
 *      **不是** 含税额 × 1.5%，也不是按 1.5% 去分离。所以价税分离一律用 5%，
 *      乘的时候才用减按后的征收率（vatOf 里这两步是分开的，别合成一步）。
 *   3. **一次性收租可以分摊**（财税〔2016〕36 号附件 2 第一条（九））：其他个人一次性收取租金的，
 *      可在租赁期内平均分摊，分摊后的**月**租金收入未超过 10 万元的免征增值税。
 *      这一条最值钱：一次性收 1 年 12 万，不分摊要缴 1714 元，分摊后是 0（见 spreadCompareOf）。
 *   4. **个税可扣三样**：出租过程中缴纳的税费（增值税及附加、房产税、印花税，凭完税凭证）、
 *      纳税人负担的**修缮费用**（每月最多 800 元，**扣不完的结转以后月份**继续扣，不是当月作废）、
 *      以及法定的费用扣除标准（月收入 ≤ 4000 减 800，> 4000 减 20%）。
 *      顺序是先扣税费与修缮费，再判断 4000 那一档的分界（分界看的是**收入额**，不是扣完的余额）。
 *   5. **城镇土地使用税本工具不估**：非住房按面积 × 当地定额，定额由省级政府在法定幅度内确定，
 *      给一个数就是编出来的。住房是免税，非住房在结果里只给提示行。
 *
 * 同源：所有税率与免征线取注册表 / tax-constants.js 声明的 rentalRules；
 *   增值税价税分离调 `EuriskoVatQuick.priceSplitOf`，
 *   附加税调 `EuriskoSurtaxQuick.surtaxOf`，租赁合同印花税调 `EuriskoSurtaxQuick.stampDutyOf`，
 *   本文件不复制它们的任何一条公式。
 */
(function (global) {
    'use strict';

    var C = global.EuriskoTaxConstants;

    function rules() {
        return (C && C.rentalRules) || {};
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

    /** 期数：一次性收取的月份数（1~240 个月）；按月收就是 1 期 */
    function monthsOf(input) {
        input = input || {};
        if (input.payMode !== 'once') return 1;
        var m = Math.round(toNumber(input.months, 1));
        return Math.min(Math.max(m, 1), 240);
    }

    /**
     * 增值税：其他个人出租不动产，征收率 5%（不享受 3% 减按 1%），住房减按 1.5%。
     *
     * 两步必须分开：价税分离用 5%，计税才用减按后的征收率。
     */
    function vatOf(input) {
        input = input || {};
        var r = rules().vat;
        var monthly = toNumber(input.monthlyRent);
        var months = monthsOf(input);
        var housing = isHousing(input);
        var rate = housing ? r.housingReducedRate : r.levyRate;

        var split = global.EuriskoVatQuick
            ? global.EuriskoVatQuick.priceSplitOf({ amount: monthly, rate: r.levyRate, taxIncluded: true })
            : null;
        var exclusive = split ? split.exclusive : (r.levyRate > 0 ? monthly / (1 + r.levyRate) : monthly);

        // 分摊后的月租金未超过 10 万元 → 免征（含本数）
        var exempt = r.thresholdInclusive ? exclusive <= r.monthlyThreshold : exclusive < r.monthlyThreshold;
        var monthlyTax = exempt ? 0 : round(exclusive * rate);
        var monthlyStatutory = round(exclusive * r.levyRate);

        return {
            monthlyRent: monthly,
            months: months,
            payMode: input.payMode || 'month',
            housing: housing,
            exclusive: exclusive,            // 分摊后每月**不含税**租金收入
            levyRate: r.levyRate,
            rate: rate,
            rateText: housing ? '5% 减按 1.5%' : '5%',
            threshold: r.monthlyThreshold,
            exempt: exempt,
            monthlyTax: monthlyTax,
            tax: round(monthlyTax * months),
            monthlyStatutoryTax: monthlyStatutory,
            statutoryTax: round(monthlyStatutory * months),
            saving: round((monthlyStatutory - monthlyTax) * months),
            totalIncome: monthly * months,
            totalExclusive: exclusive * months,
            note: exempt
                ? '分摊后月租金 ' + Math.round(exclusive) + ' 元未超过 ' + (r.monthlyThreshold / 10000)
                    + ' 万元 → 免征增值税（' + r.spreadNote + '）'
                : '含税销售额 ÷ (1 + 5%) × ' + (housing ? '1.5%' : '5%') + '，共 ' + months + ' 个月',
            basis: r.basis
        };
    }

    /**
     * 房产税：住房按租金收入 4%（财税〔2008〕24 号二），非住房从租 12%（条例第四条）。
     * 计税依据是**不含增值税**的租金收入；六税两费减半同样适用。
     */
    function propertyTaxOf(input) {
        input = input || {};
        var r = rules().propertyTax;
        var v = vatOf(input);
        var rate = isHousing(input) ? r.housingRate : r.nonHousingRate;
        // 减半的比例读 surtaxRules.halve.ratio（六税两费），不是本文件自己的数字
        var halveRatio = C && C.surtaxRules ? C.surtaxRules.halve.ratio : 1;
        var ratio = input.halve ? halveRatio : 1;
        var monthlyTax = round(v.exclusive * rate * ratio);
        var monthlyStatutory = round(v.exclusive * rate);
        return {
            housing: isHousing(input),
            rate: rate,
            ratio: ratio,
            halve: !!input.halve,
            base: v.exclusive,
            monthlyTax: monthlyTax,
            tax: round(monthlyTax * v.months),
            monthlyStatutoryTax: monthlyStatutory,
            statutoryTax: round(monthlyStatutory * v.months),
            saving: round((monthlyStatutory - monthlyTax) * v.months),
            note: (isHousing(input) ? '个人出租住房按租金收入 4%' : '非住房从租计征 12%')
                + '，计税依据为不含增值税的租金收入',
            basis: r.basis
        };
    }

    /**
     * 印花税：租赁合同 1‰，住房免征（财税〔2008〕24 号二）。
     * 税率与「计税依据不含列明增值税」「六税两费减半」全部由 stampDutyOf 自己处理，这里不复制。
     */
    function stampOf(input) {
        input = input || {};
        var r = rules().stamp;
        var v = vatOf(input);
        if (isHousing(input)) {
            return {
                housing: true,
                tax: 0,
                statutoryTax: 0,
                amount: v.totalIncome,
                note: '对个人出租、承租住房签订的租赁合同免征印花税（财税〔2008〕24 号二）',
                basis: r.basis
            };
        }
        var stamp = global.EuriskoSurtaxQuick
            ? global.EuriskoSurtaxQuick.stampDutyOf({
                item: r.leaseKey,
                amount: v.totalIncome,
                vat: v.tax,
                halve: input.halve
            })
            : null;
        return {
            housing: false,
            tax: stamp ? stamp.tax : 0,
            statutoryTax: stamp ? stamp.statutoryTax : 0,
            saving: stamp ? stamp.saved : 0,
            amount: v.totalIncome,
            rate: stamp ? stamp.rate : 0.001,
            rateText: stamp ? stamp.rateText : '千分之一',
            note: '租赁合同按租金 ' + (stamp ? stamp.rateText : '千分之一') + ' 贴花，计税依据不含单独列明的增值税税款',
            basis: r.basis
        };
    }

    /**
     * 个人所得税（财产租赁所得）：逐月算，因为修缮费要**跨月结转**。
     *
     * 应纳税所得额 = 收入 − 税费 − 修缮费（<b>≤800/月</b>，扣不完结转以后月份）− 费用扣除标准
     *   费用扣除标准：收入 ≤ 4000 → 定额减 800；收入 > 4000 → 定率减 20%
     *   税率：住房 10%（减按），非住房 20%
     */
    function iitOf(input) {
        input = input || {};
        var r = rules().iit;
        var v = vatOf(input);
        var months = v.months;
        var housing = isHousing(input);
        var rate = housing ? r.housingReducedRate : r.rate;

        // 每月可扣除的税费：增值税 + 附加 + 房产税 + 印花税（印花税一次性，摊到每月）
        var surtaxMonthly = toNumber(input.surtaxMonthly);
        var propertyMonthly = toNumber(input.propertyMonthly);
        var stampMonthly = toNumber(input.stampMonthly);
        var feesMonthly = v.monthlyTax + surtaxMonthly + propertyMonthly + stampMonthly;

        var remaining = toNumber(input.repair);
        var cap = r.repairMonthlyCap;
        var income = v.exclusive;
        var monthlyRows = [];
        var totalTax = 0;
        var totalRepairDeducted = 0;

        for (var m = 0; m < months; m++) {
            var repairDeduct = Math.min(remaining, cap);
            remaining = round(remaining - repairDeduct);
            var before = Math.max(0, income - feesMonthly - repairDeduct);
            // 4000 的分界看的是**收入额**，不是扣完税费后的余额
            var expense = income > r.expenseThreshold
                ? round(before * r.expenseRatio)
                : Math.min(r.expenseFlat, before);
            var taxable = Math.max(0, before - expense);
            var tax = round(taxable * rate);
            totalTax += tax;
            totalRepairDeducted += repairDeduct;
            monthlyRows.push({
                month: m + 1,
                income: round(income),
                fees: round(feesMonthly),
                repair: repairDeduct,
                repairCarried: remaining,
                expense: expense,
                taxable: taxable,
                rate: rate,
                tax: tax
            });
        }

        var last = monthlyRows[monthlyRows.length - 1] || { taxable: 0 };
        return {
            housing: housing,
            rate: rate,
            rateText: housing ? '20% 减按 10%' : '20%',
            income: income,
            months: months,
            fees: feesMonthly,
            repairInput: toNumber(input.repair),
            repairCap: cap,
            repairDeducted: totalRepairDeducted,
            repairCarried: remaining,
            expenseMode: income > r.expenseThreshold ? 'ratio' : 'flat',
            expenseThreshold: r.expenseThreshold,
            monthlyTax: round(totalTax / Math.max(months, 1)),
            tax: round(totalTax),
            rows: monthlyRows,
            sample: last,
            note: '出租过程中缴纳的税费与修缮费可扣除；修缮费每月最多扣 ' + cap
                + ' 元，扣不完的结转以后月份继续扣（国税发〔1994〕89 号六）',
            basis: r.basis
        };
    }

    /**
     * 附加税费（城建税 + 教育费附加 + 地方教育附加）：计税依据是**实缴增值税**，
     * 增值税免了附加跟着免 —— 这一句由 surtax-stamp-quick 的 surtaxOf 作答，本文件不重算。
     */
    function surtaxOf(vatTax, input) {
        if (!global.EuriskoSurtaxQuick) {
            return { total: 0, cityTax: 0, educationTax: 0, localEducationTax: 0, base: 0 };
        }
        return global.EuriskoSurtaxQuick.surtaxOf({
            vat: vatTax,
            consumption: 0,
            location: input.location,
            halve: input.halve
        });
    }

    /**
     * 一屏总额：五个税种相加，外加到手金额与实际税负率。
     *
     * @param {Object} input
     *   usage（housing / nonHousing）、monthlyRent（月租金，含税）、
     *   payMode（month / once）、months（一次性收几个月）、
     *   location（urban / county / other）、halve（六税两费减半）、repair（修缮费总额）
     */
    function stackOf(input) {
        input = input || {};
        var r = rules();
        var v = vatOf(input);
        var surtax = surtaxOf(v.tax, input);
        var property = propertyTaxOf(input);
        var stamp = stampOf(input);

        // 附加与印花税是按期总数，个税按月算 → 摊回每月
        var months = v.months;
        var surtaxMonthly = months > 0 ? surtax.total / months : 0;
        var stampMonthly = months > 0 ? stamp.tax / months : 0;
        var iit = iitOf({
            usage: input.usage,
            monthlyRent: input.monthlyRent,
            payMode: input.payMode,
            months: input.months,
            halve: input.halve,
            repair: input.repair,
            surtaxMonthly: surtaxMonthly,
            propertyMonthly: property.monthlyTax,
            stampMonthly: stampMonthly
        });

        var total = round(v.tax + surtax.total + property.tax + stamp.tax + iit.tax);
        var grossIncome = v.totalIncome;
        // 附加的两项费率与印花税税率都在 surtax-stamp-quick 那边，本文件只读取、不抄数字
        var surtaxRules = global.EuriskoSurtaxQuick ? global.EuriskoSurtaxQuick.rules() : null;
        var eduRate = surtaxRules ? surtaxRules.education.rate : 0;
        var localEduRate = surtaxRules ? surtaxRules.localEducation.rate : 0;
        var rows = [
            {
                key: 'vat',
                label: '增值税',
                tax: v.tax,
                rate: v.housing ? v.rate : v.levyRate,
                rateText: v.rateText,
                note: v.note,
                basis: v.basis
            },
            {
                key: 'cityTax', label: '城市维护建设税', tax: surtax.cityTax, rate: surtax.cityRate || 0,
                note: '按纳税人所在地分档（市区 7% / 县城、镇 5% / 其他 1%），以实缴增值税为计税依据', basis: ''
            },
            { key: 'educationTax', label: '教育费附加', tax: surtax.educationTax, rate: eduRate, note: '以实缴增值税为计税依据', basis: '' },
            { key: 'localEducationTax', label: '地方教育附加', tax: surtax.localEducationTax, rate: localEduRate, note: '以实缴增值税为计税依据', basis: '' },
            {
                key: 'propertyTax',
                label: '房产税',
                tax: property.tax,
                rate: property.rate,
                note: property.note + (property.halve ? '，已减半征收' : ''),
                basis: property.basis
            },
            {
                key: 'stamp',
                label: '印花税',
                tax: stamp.tax,
                rate: stamp.rate || 0,
                note: stamp.note,
                basis: stamp.basis
            },
            {
                key: 'iit',
                label: '个人所得税',
                tax: iit.tax,
                rate: iit.rate,
                note: iit.note,
                basis: iit.basis
            }
        ];

        // 城镇土地使用税：住房免税、非住房按当地定额 —— 定额省级确定，不估金额，只出提示
        var landUseNote = isHousing(input)
            ? '对个人出租住房免征城镇土地使用税（财税〔2008〕24 号二）'
            : r.landUseTax.nonHousingNote;
        var landUse = {
            key: 'landUseTax',
            label: '城镇土地使用税',
            tax: 0,
            exempt: isHousing(input),
            estimated: !isHousing(input),
            note: landUseNote,
            basis: r.landUseTax.basis
        };

        var notes = [];
        if (v.exempt) {
            notes.push('增值税免征 → 三项附加的计税依据为 0，附加税跟着免（城建税法第二条）');
        }
        if (!isHousing(input)) {
            notes.push(r.usageNote);
        }
        if (iit.repairCarried > 0) {
            notes.push('修缮费还剩 ' + Math.round(iit.repairCarried) + ' 元没扣完，可结转以后月份继续扣除 —— 不是作废');
        }
        if (input.halve) {
            notes.push('城建税、两项附加、房产税、印花税按“六税两费”减半征收（执行至 2027-12-31）');
        }
        if (landUse.estimated) {
            notes.push(landUse.note);
        }

        return {
            rules: r,
            housing: isHousing(input),
            months: months,
            grossIncome: grossIncome,
            exclusiveIncome: v.totalExclusive,
            vat: v,
            surtax: surtax,
            propertyTax: property,
            stamp: stamp,
            iit: iit,
            landUseTax: landUse,
            rows: rows,
            total: total,
            netIncome: round(grossIncome - total),
            effectiveRate: grossIncome > 0 ? total / grossIncome : 0,
            monthlyTotal: round(total / Math.max(months, 1)),
            notes: notes,
            usageNote: r.usageNote
        };
    }

    /** 分摊 vs 不分摊（一次性收租最常见的临界点）：分摊后月租金 ≤ 10 万 → 免征 */
    function spreadCompareOf(input) {
        input = input || {};
        var months = monthsOf(input);
        var spread = vatOf(input);
        var unspread = vatOf({
            usage: input.usage,
            monthlyRent: toNumber(input.monthlyRent) * months,
            payMode: 'month',
            months: 1
        });
        return {
            months: months,
            spread: spread,
            unspread: unspread,
            gap: round(unspread.tax - spread.tax),
            spreadExempt: spread.exempt,
            unspreadExempt: unspread.exempt,
            note: '一次性收取租金可在租赁期内平均分摊：分摊后月租金未超过 '
                + (spread.threshold / 10000) + ' 万元的免征增值税，不分摊则要按全额计税'
        };
    }

    function withUsage(input, usage) {
        return {
            usage: usage,
            monthlyRent: input.monthlyRent,
            payMode: input.payMode,
            months: input.months,
            location: input.location,
            halve: input.halve,
            repair: input.repair
        };
    }

    /** 住房 vs 非住房：整包优惠差多少（同一笔租金） */
    function usageCompareOf(input) {
        input = input || {};
        var asHousing = stackOf(withUsage(input, 'housing'));
        var asNonHousing = stackOf(withUsage(input, 'nonHousing'));
        return {
            housing: asHousing,
            nonHousing: asNonHousing,
            gap: round(asNonHousing.total - asHousing.total),
            note: '出租住房适用一整包优惠（增值税减按 1.5%、房产税 4%、个税 10%、免征印花税与城镇土地使用税），非住房一律不适用'
        };
    }

    global.EuriskoPropertyRentalQuick = {
        VERSION: '1.0.0',
        rules: rules,
        vatOf: vatOf,
        propertyTaxOf: propertyTaxOf,
        stampOf: stampOf,
        surtaxOf: surtaxOf,
        iitOf: iitOf,
        stackOf: stackOf,
        spreadCompareOf: spreadCompareOf,
        usageCompareOf: usageCompareOf
    };
})(typeof window !== 'undefined' ? window : this);
