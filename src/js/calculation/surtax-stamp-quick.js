// 附加税（城建税及两项教育附加）与印花税的轻量实现（阶段15 15B-3）
//
// 与 vat-quick.js / corporate-income-tax-quick.js 同一套做法：**不复制税率**，
// 税率与费率全部来自 tax-constants.js 的 surtaxRules / stampDutyRules，页面读本文件。
//
// 这一页要钉住的三件事（比税率的数字更容易写错）：
//   1. 附加税**不是对收入征的**，计税依据是「依法实际缴纳的增值税、消费税税额」
//      （城建税法第二条）—— 增值税免了附加税跟着免，增值税是 0 附加税就是 0；
//   2. 城建税三档按**纳税人所在地**划分（市区 7% / 县城、镇 5% / 其他 1%），不是按企业规模；
//      加上教育费附加 3%、地方教育附加 2%，市区合计常被说成「12% 附加」。
//   3. 印花税计税依据**不包括列明的增值税税款**（印花税法第五条），
//      营业账簿只对**增加部分**计税（第十一条），证券交易印花税**不享受**六税两费减半。
(function () {
    'use strict';

    var C = window.EuriskoTaxConstants;
    var SURTAX = C.surtaxRules;
    var STAMP = C.stampDutyRules;

    function num(value) {
        var n = Number(String(value === null || value === undefined ? '' : value).replace(/,/g, '').trim());
        return isFinite(n) && n > 0 ? n : 0;
    }

    // 「六税两费」减半：把实际征收比例从 1 降到 0.5
    function levyRatio(halve) {
        return halve ? SURTAX.halve.ratio : 1;
    }

    function cityRateOf(location) {
        var rates = SURTAX.city.rates;
        for (var i = 0; i < rates.length; i++) {
            if (rates[i].key === location) return rates[i];
        }
        return rates[0];
    }

    function round(n) {
        return Math.round(n * 100 + Number.EPSILON) / 100;
    }

    // 附加税：城建税 + 教育费附加 + 地方教育附加
    function surtaxOf(input) {
        input = input || {};
        var vat = num(input.vat);
        var consumption = num(input.consumption);
        var base = vat + consumption;                 // 计税依据：实际缴纳的增值税 + 消费税
        var city = cityRateOf(input.location);
        var ratio = levyRatio(input.halve);

        var cityTax = round(base * city.rate * ratio);
        var educationTax = round(base * SURTAX.education.rate * ratio);
        var localEducationTax = round(base * SURTAX.localEducation.rate * ratio);
        var total = cityTax + educationTax + localEducationTax;
        var statutoryRate = city.rate + SURTAX.education.rate + SURTAX.localEducation.rate;
        var statutoryTotal = round(base * statutoryRate);

        var compare = {};
        SURTAX.city.rates.forEach(function (item) {
            var t = round(base * (item.rate + SURTAX.education.rate + SURTAX.localEducation.rate) * ratio);
            compare[item.key] = {
                key: item.key,
                label: item.label,
                cityRate: item.rate,
                total: t,
                rate: item.rate + SURTAX.education.rate + SURTAX.localEducation.rate,
                effectiveRate: (item.rate + SURTAX.education.rate + SURTAX.localEducation.rate) * ratio
            };
        });

        return {
            vat: vat,
            consumption: consumption,
            base: base,
            locationKey: city.key,
            locationLabel: city.label,
            cityRate: city.rate,
            cityTax: cityTax,
            educationTax: educationTax,
            localEducationTax: localEducationTax,
            total: total,
            statutoryTotal: statutoryTotal,
            saved: Math.max(statutoryTotal - total, 0),
            statutoryRate: statutoryRate,
            effectiveRate: statutoryRate * ratio,
            halve: !!input.halve,
            compare: compare
        };
    }

    /**
     * 阶段17 17C-4（v1.62.0）①：附加税的计税依据是「**依法实际缴纳**」的增值税、消费税 ——
     * 不是申报表的应纳数，更不是销售额。三处调整**方向各不相同**，记反一处就是整段错：
     *
     *   ① 增值税期末留抵退税额：**允许**从计税依据中扣除（财税〔2018〕80 号）；
     *   ② 即征即退 / 先征后返退还的增值税：**不扣**，且已征的附加税也**不退还**；
     *   ③ 进口货物或境外单位代扣代缴的增值税：**根本不附征**（城建税法第三条）。
     *
     * 实测（市区、减半，综合 6%）：
     *   申报期应纳 10 万、本期留抵退税 3 万 → 计税依据 **7 万**（不是 10 万），附加税 4200 而非 **6000**，差 **1800**；
     *   同样 3 万若是即征即退 → 计税依据**仍是 10 万**，附加税 **6000**（扣了反而少缴 1800）；
     *   进口环节缴增值税 50 万 → **不附征**，误算进去就多缴 **3 万**。
     */
    function surtaxBaseOf(input) {
        input = input || {};
        var isSmall = input.taxpayer === 'small';
        var quarterly = num(input.quarterlySales);
        var vatPayable = num(input.vatPayable);
        var consumption = num(input.consumption);
        // 小规模纳税人**不抵扣进项**，本来就没有期末留抵、也就没有留抵退税 —— 这一项只对一般纳税人生效
        var creditRefund = isSmall ? 0 : num(input.creditRefund);
        var instantRefund = num(input.instantRefund);
        var importVat = num(input.importVat);

        // 小规模：季度销售额 ≤ 30 万（月 10 万）免征增值税 → 附加税跟着免（整段跳变，不是渐近）
        var smallExempt = isSmall && quarterly > 0 && quarterly <= SURTAX.smallThreshold.quarterly;
        var smallVat = (isSmall && !smallExempt) ? round(quarterly * SURTAX.smallThreshold.rate) : 0;
        var domesticVat = smallExempt ? 0 : (isSmall ? smallVat : vatPayable);

        // ① 留抵退税**要扣**（但不能扣成负数）
        var deductedCredit = Math.min(creditRefund, domesticVat);
        var base = round(domesticVat - deductedCredit + consumption);
        // ② 即征即退**不扣** —— 它只出现在对照行里，说明「同样是退税，处理相反」
        // ③ 进口 / 代扣代缴的增值税**不进**计税依据
        var naiveBase = round((isSmall ? smallVat : vatPayable) + consumption + importVat);

        return {
            taxpayer: input.taxpayer || 'general',
            isSmall: isSmall,
            quarterlySales: quarterly,
            smallExempt: smallExempt,
            smallVat: smallVat,
            vatPayable: vatPayable,
            consumption: consumption,
            creditRefund: creditRefund,
            deductedCredit: deductedCredit,
            instantRefund: instantRefund,
            importVat: importVat,
            domesticVat: domesticVat,
            base: base,
            naiveBase: naiveBase,
            gap: round(naiveBase - base),
            exempt: base <= 0,
            smallThreshold: SURTAX.smallThreshold,
            notes: {
                credit: SURTAX.creditRefund.note,
                instant: SURTAX.instantRefund.note,
                importVat: SURTAX.importVat.note,
                base: SURTAX.city.baseNote
            }
        };
    }

    /**
     * ② 同一份凭证载有两个以上税目：**分别列明金额**的分别适用税率，**未分别列明**的**从高**适用（第九条）
     *
     * 这是「签合同多写几行字」能直接省的钱 —— 实测：设备买卖 100 万（万分之三）+ 租赁 10 万（千分之一），
     * 分别列明 → 300 + 100 = 400（减半 200）；未分别列明 → 110 万 × 千分之一 = 1100（减半 **550**），差 **350**。
     */
    function stampMixedOf(input) {
        input = input || {};
        var first = stampDutyOf({
            item: input.item, amount: input.amount, vat: input.vat, halve: input.halve
        });
        var second = stampDutyOf({
            item: input.secondItem, amount: input.secondAmount, vat: input.secondVat, halve: input.halve
        });
        var separated = round(first.tax + second.tax);
        var separatedStatutory = round(first.statutoryTax + second.statutoryTax);

        // 未分别列明：从高适用税率，计税依据合并
        var higher = first.rate >= second.rate ? first : second;
        var merged = stampDutyOf({
            item: higher.key,
            amount: num(input.amount) + num(input.secondAmount),
            vat: num(input.vat) + num(input.secondVat),
            halve: input.halve
        });

        var separatelyStated = input.separatelyStated !== false;
        return {
            first: first,
            second: second,
            higherKey: higher.key,
            higherName: higher.name,
            higherRate: higher.rate,
            higherRateText: higher.rateText,
            separated: separated,
            separatedStatutory: separatedStatutory,
            merged: merged.tax,
            mergedStatutory: merged.statutoryTax,
            mergedAmount: num(input.amount) + num(input.secondAmount),
            gap: round(merged.tax - separated),
            gapStatutory: round(merged.statutoryTax - separatedStatutory),
            separatelyStated: separatelyStated,
            tax: separatelyStated ? separated : merged.tax,
            statutoryTax: separatelyStated ? separatedStatutory : merged.statutoryTax
        };
    }

    /**
     * ③ 签订时**无法确定金额**的：先按 **5 元**贴花，以后结算时按实际金额计税、**多退少补**（第六条）
     *
     * 框架协议 / 长期供货合同最常见。实测：结算时实际 1000 万买卖合同 → 3000（减半 **1500**），
     * 已先贴 5 元 → 应补 **1495**；签的时候不贴、结算时才补，这一段时间是滞纳风险。
     */
    function stampSettlementOf(input) {
        input = input || {};
        var prepaid = STAMP.undeterminedPrepaid || 5;
        var settled = stampDutyOf({
            item: input.item, amount: input.settledAmount, vat: input.vat, halve: input.halve
        });
        var topUp = round(settled.tax - prepaid);
        return {
            prepaid: prepaid,
            settledAmount: num(input.settledAmount),
            settled: settled,
            tax: settled.tax,
            statutoryTax: settled.statutoryTax,
            topUp: topUp,
            refundable: topUp < 0 ? round(-topUp) : 0
        };
    }

    /**
     * ④ 营业账簿只对**增加部分**计税（第十一条）：按实收资本（股本）+ 资本公积的**增加额** × 0.25‰，
     *    不是每年按注册资本总额重贴一遍。速算器只有一个「凭证金额」框，填进去就被当成全额。
     *
     * 实测：上年末 500 万 → 本年末 800 万，增加额 300 万 → 750（减半 **375**）；
     * 误按 800 万全额 → 2000（减半 **1000**），差 **625**。
     */
    function accountBookOf(input) {
        input = input || {};
        var prev = num(input.prevCapital);
        var curr = num(input.currCapital);
        var increment = Math.max(round(curr - prev), 0);
        var inc = stampDutyOf({ item: 'accountBook', amount: increment, vat: 0, halve: input.halve });
        var full = stampDutyOf({ item: 'accountBook', amount: curr, vat: 0, halve: input.halve });
        return {
            prevCapital: prev,
            currCapital: curr,
            increment: increment,
            decreased: curr < prev,
            tax: inc.tax,
            statutoryTax: inc.statutoryTax,
            fullTax: full.tax,
            fullStatutoryTax: full.statutoryTax,
            gap: round(full.tax - inc.tax),
            gapStatutory: round(full.statutoryTax - inc.statutoryTax),
            rate: inc.rate,
            rateText: inc.rateText
        };
    }

    function itemOf(key) {
        var items = STAMP.items;
        for (var i = 0; i < items.length; i++) {
            if (items[i].key === key) return items[i];
        }
        return null;
    }

    var CN_DIGITS = { '0': '零', '1': '一', '2': '二', '3': '三', '4': '四', '5': '五', '6': '六', '7': '七', '8': '八', '9': '九', '.': '点' };

    // 税率读法：0.001 → 千分之一；0.0005 → 万分之五；0.00005 → 万分之零点五
    function rateText(rate) {
        var perThousand = Math.round(rate * 1000 * 1000) / 1000;
        if (perThousand >= 1 && Math.abs(perThousand - Math.round(perThousand)) < 1e-9) {
            return '千分之' + (String(Math.round(perThousand)).split('').map(function (c) { return CN_DIGITS[c]; }).join(''));
        }
        var perTen = Math.round(rate * 10000 * 1000) / 1000;
        var s = String(perTen);
        return '万分之' + s.split('').map(function (c) { return CN_DIGITS[c]; }).join('');
    }

    // 印花税（单张应税凭证）
    function stampDutyOf(input) {
        input = input || {};
        var item = itemOf(input.item) || itemOf('sale');
        var amount = num(input.amount);
        var vat = Math.min(num(input.vat), amount);          // 合同中单独列明的增值税税款
        var base = STAMP.excludeVat ? Math.max(amount - vat, 0) : amount;
        var isSecurities = item.key === STAMP.securitiesKey;
        var halveApplicable = !!input.halve && !isSecurities; // 证券交易印花税不减半
        var ratio = halveApplicable ? SURTAX.halve.ratio : 1;

        var tax = round(base * item.rate * ratio);
        var statutoryTax = round(base * item.rate);
        return {
            key: item.key,
            name: item.name,
            rate: item.rate,
            rateText: rateText(item.rate),
            baseName: item.base,
            note: item.note || '',
            amount: amount,
            vat: vat,
            base: base,
            tax: tax,
            statutoryTax: statutoryTax,
            saved: Math.max(statutoryTax - tax, 0),
            halveApplicable: halveApplicable,
            isSecurities: isSecurities,
            onlySeller: isSecurities
        };
    }

    // 印花税（同一期间多张应税凭证合计；提示未分别列明金额时的「从高适用」风险）
    function stampDutySumOf(input) {
        input = input || {};
        var entries = input.entries || [];
        var rows = [];
        var highest = null;
        entries.forEach(function (entry) {
            var r = stampDutyOf({
                item: entry.item,
                amount: entry.amount,
                vat: entry.vat,
                halve: input.halve
            });
            if (r.amount > 0) {
                rows.push(r);
                if (!highest || r.rate > highest.rate) highest = r;
            }
        });
        var total = round(rows.reduce(function (s, r) { return s + r.tax; }, 0));
        var statutoryTotal = round(rows.reduce(function (s, r) { return s + r.statutoryTax; }, 0));
        return {
            rows: rows,
            total: total,
            statutoryTotal: statutoryTotal,
            saved: Math.max(statutoryTotal - total, 0),
            halve: !!input.halve,
            highest: highest
        };
    }

    window.EuriskoSurtaxQuick = {
        rules: function () { return SURTAX; },
        stampRules: function () { return STAMP; },
        rateText: rateText,
        surtaxOf: surtaxOf,
        stampDutyOf: stampDutyOf,
        stampDutySumOf: stampDutySumOf,
        surtaxBaseOf: surtaxBaseOf,
        stampMixedOf: stampMixedOf,
        stampSettlementOf: stampSettlementOf,
        accountBookOf: accountBookOf
    };
})();
