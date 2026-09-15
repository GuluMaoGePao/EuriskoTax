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
        stampDutySumOf: stampDutySumOf
    };
})();
