/**
 * 个人转让房屋（财产转让所得）—— 阶段17 17D-12（v1.68.0）
 *
 * 为什么单独做一个 quick 文件：
 *   20 个速算器里**没有一个**能算卖房的税 —— 它不是工资、不是劳务、也不是经营所得，而是
 *   《个人所得税法》第二条里单独一档的**财产转让所得**（20% 比例税率）。而它最贵的一层
 *   恰恰是「**能扣什么、扣到多少为止**」：同一套 500 万的房子，查账 33.6 万、核定 1% 只有 5 万，
 *   差 28.6 万 —— 但核定**不是可选项**，只有原值凭证不全时税务机关才核定。
 *
 * 口径要点（错了就是把「售价」当「所得」，或者把「原值」当「0」）：
 *   1. **应纳税所得额 = 转让收入 − 房屋原值 − 转让过程中缴纳的税金 − 合理费用**（国税发〔2006〕108 号一）；
 *      转让收入按**实际成交价**（网签价明显偏低且无正当理由的，税务机关可核定）；
 *   2. **装修费有比例上限**：商品房及其他住房 = 房屋原值的 **10%**，已购公有住房、经济适用房 = **15%**
 *      （108 号二（一）1），且须有税务统一发票、发票付款人与产权人一致；
 *      贷款利息、手续费、公证费按**实际发生额**扣除；
 *   3. **原值凭证不全 → 核定征收**（108 号三）：按转让收入 **1%~3%** 核定（具体由省局 / 市局确定，
 *      如海南为 2%）。有凭证的**必须查账**，不能反过来「哪个省选哪个」；
 *   4. **满五唯一免征**（财税字〔1999〕278 号四）：自用 **5 年以上** 且是 **家庭唯一生活用房**；
 *      「唯一」是**同一省、自治区、直辖市范围内**（有配偶的为夫妻双方）只有这一套住房 ——
 *      **不是全国唯一、也不是同城唯一**；自用年限起算点为房屋产权证注明时间与契税完税凭证
 *      注明时间 **孰先**；
 *   5. **受赠 / 继承的房屋再转让**，原值不是 0、也不是受赠时的评估价，而是 **原捐赠人 / 被继承人
 *      取得该房屋的实际购置成本**（财税〔2009〕78 号五）—— 父亲 60 万买的房子受赠后卖 500 万，
 *      原值是 60 万而不是 0；
 *   6. **换购住房退税**（财政部 税务总局 住房城乡建设部公告 **2026 年第 3 号**，2026-01-01 至
 *      **2027-12-31**）：出售住房后 **1 年内**在**同城**重新购房、且售房人为新购住房产权人（或之一）的，
 *      新购金额 ≥ 转让金额**全额退还**已缴个税，< 则按 **新购 ÷ 转让** 的比例退还；
 *   7. **非住房（商铺、写字楼）不适用**满五唯一免征，也**不适用**换购退税（国税发〔2007〕33 号二）。
 *
 * 阶段22 M5 续（v2.4.0）：卖房这一笔**不止个税**。以前增值税及附加是「调用方传入」的一个数，
 *   而它同时**是**个税的扣除项 —— 填错一点，个税跟着一起错。现在这一层自己算：
 *   增值税（住房满 2 年免征、北上广深非普通住房按差额、非住房按差额，5% 征收率）、
 *   城建税及两项附加（随实缴增值税，免了就免，小规模减半）、印花税（住房免征、非住房 0.5‰），
 *   再加个税，一屏给出「卖房这一笔要缴多少税」。
 *
 * 同源：税率、装修费比例上限、免征年限、退税口径全部取注册表声明的 propertyTransferRules；
 *   卖房这一层的口径取 propertySaleRules（5% 引 vatRules 的 realestate 档），
 *   价税分离调 EuriskoVatQuick.priceSplitOf、附加与印花税调 EuriskoSurtaxQuick —— 一条公式都不复制。
 */
(function (global) {
    'use strict';

    var registry = global.EuriskoTaxRegistry;

    function rules() {
        return (registry && registry.resolveParams('property-transfer').rules) || global.propertyTransferRules;
    }

    function toNumber(v, fallback) {
        var n = Number(v);
        if (!isFinite(n) || n < 0) return fallback || 0;
        return n;
    }

    function isResidence(input) {
        return (input || {}).usage !== 'nonresidence';
    }

    /** 房屋原值：购买 / 继承看自己的取得成本，受赠看**原捐赠人**的取得成本 */
    function basisOf(input) {
        input = input || {};
        var own = toNumber(input.originalValue);
        var donor = toNumber(input.donorCost);
        if (input.acquireType === 'gift') {
            return {
                value: donor,
                label: '原捐赠人取得该房屋的实际购置成本',
                note: '受赠取得的房屋再转让：房屋原值是原捐赠人的实际购置成本（财税〔2009〕78 号五）—— 不是 0，也不是受赠时的评估价'
            };
        }
        if (input.acquireType === 'inherit') {
            return {
                value: own,
                label: '被继承人取得该房屋的实际购置成本',
                note: '继承取得的房屋再转让：房屋原值按被继承人取得该房屋的实际购置成本确定'
            };
        }
        return {
            value: own,
            label: '购置该房屋实际支付的价款 + 契税、土地出让金等',
            note: '房屋原值 = 实际支付的购房价款以及支付的相关税费（契税、土地出让金等，国税发〔2006〕108 号二）'
        };
    }

    /**
     * 装修费扣除上限（108 号二（一）1）：
     *   商品房及其他住房 = 房屋原值 10%；已购公有住房、经济适用房 = 15%；非住房不适用该比例上限。
     */
    function decorationCapOf(input) {
        input = input || {};
        var r = rules();
        var actual = toNumber(input.decoration);
        if (!isResidence(input)) {
            return {
                actual: actual, allowed: actual, disallowed: 0, cap: 0, capRatio: null, basis: 0,
                note: '转让非住房（商铺、写字楼等）：不适用住房装修费的比例上限，凭合法凭证按实际发生额扣除'
            };
        }
        var ratio = input.houseType === 'public' ? r.decorationCap.publicOrAffordable : r.decorationCap.commercial;
        var basis = basisOf(input).value;
        var cap = basis * ratio;
        var allowed = Math.min(actual, cap);
        return {
            actual: actual, allowed: allowed, disallowed: Math.max(0, actual - allowed),
            cap: cap, capRatio: ratio, basis: basis,
            note: '装修费上限 = 房屋原值 × ' + Math.round(ratio * 100) + '%（'
                + (input.houseType === 'public' ? '已购公有住房 / 经济适用房' : '商品房及其他住房')
                + '），凭税务统一发票且付款人与产权人一致'
        };
    }

    /** 核定征收（108 号三）：仅当原值凭证不全时适用，按转让收入 × 省局 / 市局确定的征收率 */
    function assessOf(input) {
        input = input || {};
        var r = rules();
        var rate = toNumber(input.assessRate, r.assessDefault * 100) / 100;
        var price = toNumber(input.salePrice);
        return {
            rate: rate, price: price, tax: price * rate,
            range: r.assessRange,
            note: '原值凭证不全时，由税务机关按转让收入 ' + Math.round(r.assessRange[0] * 100) + '%~'
                + Math.round(r.assessRange[1] * 100) + '% 核定征收（具体征收率由各省局 / 市局确定）'
        };
    }

    /** 查账 vs 核定（1% / 2% / 3%）四行对照：重点是把「能不能选」说清楚 */
    function assessCompareOf(input) {
        input = input || {};
        var s = stackOf(input);
        var r = rules();
        var rows = [{
            key: 'verify', label: '查账征收（有原值凭证）', method: 'verify',
            tax: s.taxBeforeExempt, applied: s.method === 'verify',
            note: '应纳税所得额 ' + Math.round(s.taxable) + ' 元 × 20%'
        }];
        [0.01, 0.02, 0.03].forEach(function (rate) {
            rows.push({
                key: 'assess' + Math.round(rate * 100), label: '核定征收 ' + Math.round(rate * 100) + '%',
                method: 'assess', rate: rate,
                tax: toNumber(input.salePrice) * rate,
                applied: s.method === 'assess' && Math.abs((s.assessRate || 0) - rate) < 1e-9,
                note: '转让收入 × ' + Math.round(rate * 100) + '%'
            });
        });
        var cheapest = rows.reduce(function (a, b) { return b.tax < a.tax ? b : a; });
        return {
            rows: rows, cheapest: cheapest, verify: rows[0],
            gap: Math.max(0, rows[0].tax - cheapest.tax),
            range: r.assessRange,
            note: '有完整原值凭证的必须查账，核定只是凭证不全时的替代 —— 「哪个省选哪个」不成立'
        };
    }

    /**
     * 换购住房退税（财政部 税务总局 住房城乡建设部公告 2026 年第 3 号，2026-01-01 至 2027-12-31）：
     *   退的是**已缴**个税；新购 ≥ 转让金额全额退，< 则按新购 ÷ 转让的比例退。
     */
    function repurchaseRefundOf(input) {
        input = input || {};
        var r = rules();
        var price = toNumber(input.salePrice);
        var taxPaidIIT = toNumber(input.taxPaidIIT);
        var applied = isResidence(input) && !!input.repurchase && !!input.sameCity && !!input.isNewOwner;
        var buy = toNumber(input.repurchasePrice);
        var ratio = applied ? Math.min(1, price > 0 ? buy / price : 0) : 0;
        var refund = taxPaidIIT * ratio;
        var reasons = [];
        if (!isResidence(input)) {
            reasons.push('换购退税只适用于住房，转让非住房不在政策范围内（国税发〔2007〕33 号二）');
        }
        if (isResidence(input) && input.repurchase) {
            if (!input.sameCity) reasons.push('新购住房与现住房不在同一城市（同一直辖市、副省级城市、地级市所辖全部行政区划）');
            if (!input.isNewOwner) reasons.push('售房人须为新购住房产权人或产权人之一');
        }
        if (applied && taxPaidIIT <= 0) {
            reasons.push('已缴个税为 0（例如满五唯一免征），退税额自然也是 0 —— 退税不是补贴');
        }
        return {
            applied: applied, ratio: ratio, refund: refund,
            netTax: Math.max(0, taxPaidIIT - refund),
            salePrice: price, repurchasePrice: buy,
            windowMonths: r.repurchase.windowMonths,
            from: r.repurchase.from, to: r.repurchase.to,
            reasons: reasons
        };
    }

    /** 满五唯一的三种边界：满 5 年唯一 → 全免；满 5 年不唯一 / 未满 5 年 → 照缴 */
    function exemptCompareOf(input) {
        input = input || {};
        var r = rules();
        var s = stackOf(input);
        var years = toNumber(input.holdYears);
        var residence = isResidence(input);
        var rows = [
            {
                key: 'full', label: '自用 5 年以上 + 家庭唯一生活用房', eligible: residence && years >= r.exemption.years && !!input.isOnlyHome,
                tax: residence && years >= r.exemption.years && !!input.isOnlyHome ? 0 : s.taxBeforeExempt
            },
            {
                key: 'notOnly', label: '自用 5 年以上但非唯一', eligible: false,
                tax: residence && years >= r.exemption.years ? s.taxBeforeExempt : s.taxBeforeExempt
            },
            { key: 'notFive', label: '自用不足 5 年', eligible: false, tax: s.taxBeforeExempt }
        ];
        // 「非唯一 / 未满 5 年」两行税额同样按查账结果，差别只在是否免征
        rows[0].note = '免征（财税字〔1999〕278 号四）';
        rows[1].note = years >= r.exemption.years ? '年限够了但「唯一」不满足 → 照缴' : '本例年限已满但家庭还有别的住房';
        rows[2].note = '自用年限不足 ' + r.exemption.years + ' 年 → 照缴';
        return {
            rows: rows,
            needYears: r.exemption.years,
            years: years,
            scope: r.exemption.scope,
            startRule: r.exemption.startRule,
            current: rows[0].eligible ? 'full' : (years >= r.exemption.years ? 'notOnly' : 'notFive')
        };
    }

    function round2(x) {
        return Math.round((Number(x) || 0) * 100) / 100;
    }

    /** 卖房这一笔的口径（增值税 / 附加 / 印花税 / 土地增值税提示）在 propertySaleRules */
    function saleRules() {
        return (global.EuriskoTaxConstants && global.EuriskoTaxConstants.propertySaleRules) || {};
    }

    /**
     * 增值税（阶段22 M5 续，v2.4.0）：卖房这一笔**不止个税**，光增值税及附加就能到几十万，
     * 而它同时还是个税的扣除项 —— 以前让用户自己填，填错一点个税跟着一起错。
     *
     * 三种算法（财税〔2016〕36 号附件 3 第五条、附件 2 第一条（八））：
     *   住房不满 2 年 → 全额 5%；住房满 2 年 → 免征（**北上广深的非普通住房按差额**）；
     *   非住房 → 按「全部价款 − 购置原价」的差额 5%。
     * 5% 引 vatRules 的 realestate 档、价税分离调 EuriskoVatQuick.priceSplitOf，这里一条公式都不复制。
     */
    function vatOf(input) {
        input = input || {};
        var r = saleRules().vat || {};
        var rate = r.levyRate || 0.05;
        var residence = isResidence(input);
        var price = toNumber(input.salePrice);
        var years = toNumber(input.holdYears);
        var buyPrice = toNumber(input.vatBasisPrice);
        var bigFour = input.cityGroup === 'four';
        var ordinary = input.isOrdinary !== 'nonordinary';

        var mode, base;
        if (!residence) {
            mode = 'diff';
            base = Math.max(0, price - buyPrice);
        } else if (years < (r.housingExemptYears || 2)) {
            mode = 'full';
            base = price;
        } else if (bigFour && !ordinary) {
            mode = 'diff';
            base = Math.max(0, price - buyPrice);
        } else {
            mode = 'exempt';
            base = 0;
        }

        var split = (base > 0 && global.EuriskoVatQuick)
            ? global.EuriskoVatQuick.priceSplitOf({ amount: base, rate: rate, taxIncluded: true })
            : null;
        var exclusive = split ? split.exclusive : (rate > 0 ? base / (1 + rate) : base);
        var tax = mode === 'exempt' ? 0 : round2(exclusive * rate);

        var note;
        if (mode === 'exempt') {
            note = '购买 2 年以上的住房对外销售免征增值税（财税〔2016〕36 号附件 3 第五条）';
        } else if (mode === 'full') {
            note = '购买不足 2 年的住房对外销售：按 5% 征收率全额缴纳增值税，'
                + '含税 ' + Math.round(price) + ' 元先分离出税额再乘 5%';
        } else if (!residence) {
            note = '转让非住房：按全部价款减去购置原价后的差额、5% 征收率计算'
                + '（财税〔2016〕36 号附件 2 第一条（八））';
        } else {
            note = '北上广深满 2 年的非普通住房：按销售收入减去购买住房价款后的差额、5% 征收率计算';
        }

        return {
            mode: mode, rate: rate, price: price, buyPrice: buyPrice,
            base: base, exclusive: round2(exclusive), tax: tax,
            residence: residence, years: years, bigFour: bigFour, note: note,
            basis: r.basis
        };
    }

    /**
     * 附加（城建税 + 教育费附加 + 地方教育附加）：计税依据是**实缴增值税** ——
     * 增值税免了附加跟着免。三档税率与六税两费减半由 surtax-stamp-quick 的 surtaxOf 作答，本文件不重算。
     */
    function surtaxOf(vatTax, input) {
        input = input || {};
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

    /** 印花税：产权转移书据 0.5‰，**个人销售住房暂免**（财税〔2008〕137 号二）；非住房照征且可减半 */
    function stampOf(input) {
        input = input || {};
        var r = saleRules().stamp || {};
        var v = vatOf(input);
        if (isResidence(input)) {
            return {
                housing: true, tax: 0, statutoryTax: 0, saving: 0, amount: v.price,
                note: '对个人销售住房暂免征收印花税（财税〔2008〕137 号二）', basis: r.basis
            };
        }
        var stamp = global.EuriskoSurtaxQuick
            ? global.EuriskoSurtaxQuick.stampDutyOf({
                item: r.itemKey, amount: v.price, vat: v.tax, halve: input.halve
            })
            : null;
        return {
            housing: false,
            tax: stamp ? stamp.tax : 0,
            statutoryTax: stamp ? stamp.statutoryTax : 0,
            saving: stamp ? stamp.saved : 0,
            amount: v.price,
            rate: stamp ? stamp.rate : 0.0005,
            rateText: stamp ? stamp.rateText : '万分之五',
            note: '产权转移书据按 ' + (stamp ? stamp.rateText : '万分之五') + ' 贴花，计税依据不含单独列明的增值税税款',
            basis: r.basis
        };
    }

    /**
     * 完整测算：房屋原值 → 各项扣除 → 应纳税所得额 → 20% 税额 → 免征 → 核定 / 查账 → 换购退税。
     *
     * @param {Object} input
     *   usage（residence / nonresidence）、acquireType（purchase / gift / inherit）、salePrice、
     *   originalValue、donorCost、hasValueProof、holdYears、isOnlyHome、
     *   vatAndSurcharge、houseType、decoration、loanInterest、otherFees、assessRate、
     *   repurchase、sameCity、isNewOwner、repurchasePrice
     */
    function stackOf(input) {
        input = input || {};
        var r = rules();
        var residence = isResidence(input);
        var price = toNumber(input.salePrice);
        var basis = basisOf(input);
        // 阶段22 M5 续（v2.4.0）：增值税及附加、印花税不再是用户手填的一个数，
        // 而是本文件自己算出来 —— 它们同时是**个税的扣除项**，算错一点个税跟着一起错。
        var vat = vatOf(input);
        var surtax = surtaxOf(vat.tax, input);
        var stamp = stampOf(input);
        var transferTax = round2(vat.tax + surtax.total + stamp.tax);
        // 手填的那一栏改成「除了上面这几笔之外、转让过程中另缴的税金」（如土地增值税）
        var otherTaxPaid = toNumber(input.otherTaxPaid !== undefined
            ? input.otherTaxPaid : input.vatAndSurcharge);
        var taxPaid = round2(transferTax + otherTaxPaid);
        var deco = decorationCapOf(input);
        var loanInterest = toNumber(input.loanInterest);
        var otherFees = toNumber(input.otherFees);

        // 开关字段：默认「有原值凭证」（UI switch 默认 true），只有关掉才走核定
        var hasProof = input.hasValueProof === undefined ? true : !!input.hasValueProof;
        var method = hasProof ? 'verify' : 'assess';
        var assess = assessOf(input);

        var deductions = taxPaid + deco.allowed + loanInterest + otherFees;
        var taxable = Math.max(0, price - basis.value - deductions);
        var taxBeforeExempt = taxable * r.rate;

        var years = toNumber(input.holdYears);
        var exemptEligible = residence && years >= r.exemption.years && !!input.isOnlyHome;
        var tax = exemptEligible ? 0 : taxBeforeExempt;

        var finalTax = method === 'assess' ? (exemptEligible ? 0 : assess.tax) : tax;
        var refund = repurchaseRefundOf({
            usage: input.usage, salePrice: price, taxPaidIIT: finalTax,
            repurchase: input.repurchase, repurchasePrice: input.repurchasePrice,
            sameCity: input.sameCity, isNewOwner: input.isNewOwner
        });

        var notes = [];
        if (deco.disallowed > 0) {
            notes.push('装修费 ' + Math.round(deco.actual) + ' 元超过原值 '
                + Math.round(deco.capRatio * 100) + '% 的上限（' + Math.round(deco.cap)
                + ' 元），超出的 ' + Math.round(deco.disallowed) + ' 元不能扣除，多缴个税 '
                + Math.round(deco.disallowed * r.rate) + ' 元');
        }
        if (!hasProof) {
            notes.push('未提供完整、准确的房屋原值凭证：由税务机关按转让收入核定征收（108 号三），此时装修费、贷款利息等扣除项都不再适用');
        }
        if (!residence) {
            notes.push('转让非住房：不适用满五唯一免征，也不适用换购住房退税（国税发〔2007〕33 号二）');
            // 个人销售**住房**暂免土地增值税，非住房不免 —— 这一笔本工具只提示、不计算
            notes.push('转让非住房还要缴土地增值税（30%~60% 四级超率累进，个人销售住房暂免，'
                + '财税〔2008〕137 号三）：本工具按你填的「其他已缴税金」计入个税扣除，不代算这一笔');
        }
        if (vat.mode !== 'exempt') {
            notes.push('增值税 ' + Math.round(vat.tax) + ' 元 + 附加 ' + Math.round(surtax.total)
                + ' 元已经计进个税的「转让过程中缴纳的税金」扣除项 —— 手动估算时最容易漏的正是这一层');
        }
        if (exemptEligible) {
            notes.push('自用 ' + years + ' 年且为家庭唯一生活用房 → 免征个人所得税（财税字〔1999〕278 号四）');
        }
        if (refund.applied && refund.refund > 0) {
            notes.push('出售后 1 年内在同城重新购房：退还已缴个税的 ' + Math.round(refund.ratio * 100)
                + '%（新购 ' + Math.round(refund.repurchasePrice) + ' 元 ÷ 转让 ' + Math.round(price) + ' 元）');
        }

        return {
            rules: r,
            isResidence: residence,
            price: price,
            basis: basis,
            vat: vat,
            surtax: surtax,
            stamp: stamp,
            transferTax: transferTax,
            otherTaxPaid: otherTaxPaid,
            taxPaidInTransfer: taxPaid,
            decoration: deco,
            loanInterest: loanInterest,
            otherFees: otherFees,
            deductions: deductions,
            taxable: taxable,
            rate: r.rate,
            taxBeforeExempt: taxBeforeExempt,
            exemptEligible: exemptEligible,
            exemptTax: tax,
            method: method,
            hasProof: hasProof,
            assessRate: assess.rate,
            assessTax: assess.tax,
            assess: assess,
            tax: finalTax,
            refund: refund,
            netTax: refund.netTax,
            // 卖房这一笔的**全部**税：增值税 + 附加 + 印花税 + 个税（换购退税后）
            total: round2(transferTax + refund.netTax),
            notes: notes
        };
    }

    global.EuriskoPropertyTransferQuick = {
        VERSION: '1.0.0',
        rules: rules,
        basisOf: basisOf,
        decorationCapOf: decorationCapOf,
        assessOf: assessOf,
        assessCompareOf: assessCompareOf,
        repurchaseRefundOf: repurchaseRefundOf,
        exemptCompareOf: exemptCompareOf,
        saleRules: saleRules,
        vatOf: vatOf,
        surtaxOf: surtaxOf,
        stampOf: stampOf,
        stackOf: stackOf
    };
})(typeof window !== 'undefined' ? window : this);
