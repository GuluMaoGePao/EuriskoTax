/**
 * 车辆购置税（买车这一笔）—— 阶段22 M5 续（v2.3.0）
 *
 * 为什么单独做一个 quick 文件：
 *   买车是除买房之外个人最大的一笔消费，而它要缴的这个税**全站一个入口都算不了** ——
 *   它与契税同类（不是所得，是购置环节的一次性税），分类总表里归在 B 分支 C3 财产与行为税，
 *   那一格此前只有契税。一辆 30 万的车购置税就是 2.6 万，而新能源减免在 2026 年
 *   已经从「全免」改成「减半且封顶 7500 元」—— 差在哪儿、差多少，此前只能靠搜。
 *
 * 与 property-rental / deed-tax 同一个写法：**能调现有内核的就调，本文件不复制它们的公式** ——
 *   价税分离调 `EuriskoVatQuick.priceSplitOf`（13% 引 `vatRules.general.rates[0]`，不抄）；
 *   税率、计税价格的四种定法、新能源减免的两档封顶额取 `vehiclePurchaseTaxRules`。
 *
 * 口径要点（错了就是几千到几万块）：
 *   1. **计税价格不含增值税**（车辆购置税法第六条（一））：发票上的 30 万是含税价，
 *      计税价格是 300000 ÷ 1.13 = 265486.73，购置税 26548.67 —— 直接拿发票价乘 10%
 *      得到 30000，**多算 3451.33**。
 *   2. **新能源 2026 年起不是全免了**（财政部 税务总局公告 2023 年第 10 号）：
 *      2024–2025 免征（每辆乘用车免税额不超过 15000 元），
 *      2026–2027 **减半**（每辆乘用车减税额不超过 7500 元）。
 *      所以一辆 30 万的新能源车：应纳税额 26548.67，减半是 13274.34 但**封顶 7500**，
 *      实缴 19048.67 —— 而不是 0，也不是 13274.33。
 *   3. **二手车不再征收**（第三条：一次性征收）：购置已征车辆购置税的车辆不缴这个税，
 *      二手车商说「购置税我帮你交」时，交的往往不是这一笔。
 *   4. **进口自用的计税价格是组成计税价格**（第六条（二））：关税完税价格 + 关税 + 消费税，
 *      不是按落地售价。40 万完税价、关税 15%、消费税 5%（2.0 升档）→
 *      计税价格 484210.53，购置税 48421.05 —— 比按 40 万乘 10% 多出 8421.05。
 *   5. **自产 / 受赠 / 获奖按凭证载明价格**（第六条（三）（四）），且价格本身**不含增值税**
 *      —— 与购买自用那条「从含税价里分离」是两件事，别混。
 *   6. **申报期限 60 日**（第十三条）：购置当日算起，逾期有滞纳金。
 *
 * 同源：税率与封顶额取 `vehiclePurchaseTaxRules`；13% 引 `vatRules.general.rates[0]`；
 * 价税分离调 vat-quick 的 `priceSplitOf`。
 */
(function (global) {
    'use strict';

    var C = global.EuriskoTaxConstants;

    function rules() {
        return (C && C.vehiclePurchaseTaxRules) || {};
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

    /** 购车发票的增值税税率：销售货物 13%（引 vatRules，不写死在这里） */
    function vatRateOf() {
        var v = vatRules();
        var r = rules().vatRate;
        if (r === undefined && v && v.general) r = v.general.rates[0].rate;
        return r === undefined ? 0.13 : r;
    }

    function periodOf(input) {
        var ps = rules().ne ? rules().ne.periods : [];
        var id = (input || {}).period || (rules().ne ? rules().ne.default : '');
        var hit = null;
        ps.forEach(function (p) { if (p.id === id) hit = p; });
        return hit || ps[ps.length - 1] || { id: 'none', mode: 'none', cap: 0, note: '' };
    }

    function isNewEnergy(input) {
        return (input || {}).energy === 'ne';
    }

    /**
     * 计税价格（车辆购置税法第六条）—— 四种定法，按取得方式分：
     *   buy      购买自用：全部价款**不含增值税**（从含税发票价里分离）
     *   import   进口自用：关税完税价格 + 关税 + 消费税（消费税是价内税，组成计税价格）
     *   selfMade 自产自用：同类应税车辆的销售价格，不含增值税
     *   gift     受赠 / 获奖等：相关凭证载明的价格，不含增值税
     *   used     购置已征车辆：不再征收（第三条），计税价格为 0
     */
    function basisOf(input) {
        input = input || {};
        var r = rules();
        var source = input.source || 'buy';
        var out = {
            source: source,
            gross: 0,       // 进口是完税价格，购买是发票价，自产/受赠是凭证价
            vatRate: 0,
            vat: 0,
            tariffRate: 0,
            tariff: 0,
            consumptionRate: 0,
            consumption: 0,
            base: 0,
            basis: r.basis ? r.basis[source] : '',
            note: ''
        };

        if (source === 'used') {
            out.note = '车辆购置税实行一次性征收，购置已征车辆购置税的车辆不再征收'
                + '（《车辆购置税法》第三条）';
            return out;
        }

        if (source === 'import') {
            var customs = toNumber(input.customsPrice);
            var tariffRate = toNumber(input.tariffRate, r.import ? r.import.tariffRate : 0.15);
            var consumptionRate = toNumber(input.consumptionRate, 0.05);
            var tariff = round(customs * tariffRate);
            // 消费税是价内税：组成计税价格 = (完税价格 + 关税) ÷ (1 − 消费税率)
            var comp = consumptionRate < 1 ? (customs + tariff) / (1 - consumptionRate) : customs + tariff;
            var consumption = round(comp * consumptionRate);
            out.gross = round(customs);
            out.tariffRate = tariffRate;
            out.tariff = tariff;
            out.consumptionRate = consumptionRate;
            out.consumption = consumption;
            out.base = round(customs + tariff + consumption);
            out.note = '关税完税价格 ' + Math.round(customs) + ' 元 + 关税 ' + Math.round(tariff)
                + ' 元 + 消费税 ' + Math.round(consumption) + ' 元（消费税按组成计税价格计算）';
            return out;
        }

        if (source === 'selfMade' || source === 'gift') {
            // 这两条凭证载明的价格本身就是**不含增值税**的，不再分离
            var price = toNumber(input.exclusivePrice);
            out.gross = round(price);
            out.base = round(price);
            out.note = source === 'selfMade'
                ? '自产自用按同类应税车辆的销售价格确定，该价格不含增值税（《车辆购置税法》第六条（三））'
                : '受赠 / 获奖等按购置时相关凭证载明的价格确定，该价格不含增值税'
                    + '（《车辆购置税法》第六条（四））';
            return out;
        }

        // buy：发票上的全部价款是**含税**价，先按 13% 分离
        var invoice = toNumber(input.price);
        var rate = vatRateOf();
        var split = (rate > 0 && global.EuriskoVatQuick)
            ? global.EuriskoVatQuick.priceSplitOf({ amount: invoice, rate: rate, taxIncluded: true })
            : null;
        out.gross = round(invoice);
        out.vatRate = rate;
        out.vat = split ? round(split.tax || (invoice - split.exclusive)) : 0;
        out.base = split ? round(split.exclusive) : round(invoice);
        out.note = '全部价款 ' + Math.round(invoice) + ' 元（含增值税 ' + Math.round(out.vat)
            + ' 元）→ 计税价格 ' + Math.round(out.base) + ' 元';
        return out;
    }

    /**
     * 新能源减免（财政部 税务总局公告 2023 年第 10 号）：
     *   2024–2025 免征，免税额不超过 15000；2026–2027 减半，减税额不超过 7500。
     * 封顶是这里的重点：减半算出来常常超过封顶额，实缴不是「应纳税额的一半」。
     */
    function reliefOf(input, tax) {
        input = input || {};
        var p = periodOf(input);
        if (!isNewEnergy(input) || (input.source || 'buy') === 'used') {
            return { period: p, cap: 0, relief: 0, taxable: round(tax), rate: 0, note: '', applied: false };
        }
        var relief = 0;
        if (p.mode === 'exempt') relief = Math.min(tax, p.cap || 0);
        else if (p.mode === 'half') relief = Math.min(tax / 2, p.cap || 0);
        relief = round(relief);
        var capped = p.cap > 0 && tax > 0
            && ((p.mode === 'half' && tax / 2 > p.cap) || (p.mode === 'exempt' && tax > p.cap));
        return {
            period: p,
            cap: p.cap || 0,
            relief: relief,
            taxable: round(tax),
            rate: tax > 0 ? relief / tax : 0,
            capped: capped,
            applied: relief > 0,
            note: p.note + (capped ? '（本次减半额超过封顶 ' + Math.round(p.cap) + ' 元，按封顶额减）' : ''),
            basis: rules().ne ? rules().ne.basis : ''
        };
    }

    /** 应纳税额 = 计税价格 × 10%（车辆购置税法第四条）；减除减免后是实缴 */
    function taxOf(input) {
        input = input || {};
        var b = basisOf(input);
        var rate = rules().rate === undefined ? 0.1 : rules().rate;
        var tax = round(b.base * rate);
        var relief = reliefOf(input, tax);
        var payable = round(Math.max(tax - relief.relief, 0));
        return {
            base: b.base,
            rate: rate,
            tax: tax,
            relief: relief,
            payable: payable,
            statutoryPayable: tax,
            saving: relief.relief,
            note: '计税价格 ' + Math.round(b.base) + ' 元 × ' + Math.round(rate * 100)
                + '% = ' + Math.round(tax) + ' 元'
                + (relief.applied ? '，减免 ' + Math.round(relief.relief) + ' 元后实缴 '
                    + Math.round(payable) + ' 元' : '')
        };
    }

    /**
     * 一屏结果：计税价格 → 10% → 减免 → 实缴 → 总支出。
     *
     * @param {Object} input
     *   source（buy / used / import / selfMade / gift）、energy（ne 新能源 / fuel 燃油）、
     *   price（购买自用的全部价款，含增值税）、exclusivePrice（自产 / 受赠的凭证价，不含增值税）、
     *   customsPrice / tariffRate / consumptionRate（进口自用）、period（新能源减免档期）
     */
    function stackOf(input) {
        input = input || {};
        var r = rules();
        var b = basisOf(input);
        var t = taxOf(input);
        var total = t.payable;
        // 总支出：购买自用按发票价（含税），进口按完税价格，二手车按买价
        var pricePaid = (input.source === 'import') ? b.gross : toNumber(input.price);
        if (input.source === 'used') pricePaid = toNumber(input.price);
        if (input.source === 'selfMade' || input.source === 'gift') pricePaid = b.gross;
        var outlay = round(pricePaid + total);

        var rows = [];
        if (input.source === 'import') {
            rows.push({ key: 'customs', label: '关税完税价格', value: b.gross, kind: 'money',
                hint: '进口自用：计税价格 = 关税完税价格 + 关税 + 消费税'
                    + '（《车辆购置税法》第六条（二））' });
            rows.push({ key: 'tariff', label: '进口关税', value: b.tariff, kind: 'money',
                hint: '按 ' + Math.round(b.tariffRate * 100) + '% 计算，税率可改' });
            rows.push({ key: 'consumption', label: '进口环节消费税', value: b.consumption, kind: 'money',
                hint: '按 ' + Math.round(b.consumptionRate * 1000) / 100
                    + '% 计算（乘用车按气缸容量分档），组成计税价格 = (完税价格 + 关税) ÷ (1 − 税率)' });
        }
        rows.push({
            key: 'base',
            label: '车辆购置税计税价格' + (input.source === 'buy' ? '（不含增值税）' : ''),
            value: b.base, kind: 'money', hint: b.basis || b.note
        });
        rows.push({ key: 'tax', label: '车辆购置税（按 ' + Math.round(t.rate * 100) + '% 计征）',
            value: t.tax, kind: 'money', hint: '车辆购置税法第四条：税率为百分之十' });
        rows.push({ key: 'relief', label: '新能源汽车减免', value: t.relief.relief, kind: 'money',
            hint: t.relief.applied ? t.relief.note : '非新能源车辆（或不在减免车型目录内）不享受减免' });
        rows.push({ key: 'payable', label: '实缴车辆购置税', value: t.payable, kind: 'money',
            hint: t.relief.capped ? '减免封顶 ' + Math.round(t.relief.cap) + ' 元，实缴不是应纳税额的一半' : '' });
        rows.push({ key: 'outlay', label: '车款 + 购置税（总支出）', value: outlay, kind: 'money' });

        var notes = [];
        if (input.source === 'buy' && b.vat > 0) {
            notes.push('计税价格不含增值税：发票价 ' + Math.round(b.gross) + ' 元分离出增值税 '
                + Math.round(b.vat) + ' 元，购置税只对 ' + Math.round(b.base) + ' 元计征 —— 直接拿发票价乘 '
                + Math.round(t.rate * 100) + '% 会多缴 ' + Math.round(b.gross * t.rate - t.tax) + ' 元');
        }
        if (input.source === 'used') {
            notes.push('二手车：车辆购置税一次性征收，购置已征车辆购置税的车辆不再征收'
                + '（《车辆购置税法》第三条）—— '
                + '这一笔是 0，与「过户费 / 车船税」不是一回事');
        }
        if (t.relief.capped) {
            notes.push('新能源减免封顶：按减半算出的减免额超过 ' + Math.round(t.relief.cap)
                + ' 元，只能减 ' + Math.round(t.relief.cap) + ' 元，实缴 ' + Math.round(t.payable) + ' 元');
        }
        if (isNewEnergy(input) && t.relief.applied && !t.relief.capped) {
            notes.push('新能源汽车减免：' + t.relief.period.note + '，本次减免 ' + Math.round(t.relief.relief) + ' 元');
        }
        if (input.source === 'import') {
            notes.push('进口自用的计税价格不是售价，是关税完税价格 + 关税 + 消费税'
                + '（《车辆购置税法》第六条（二）），'
                + '消费税本身还要按组成计税价格算一遍');
        }

        return {
            rules: r,
            source: input.source || 'buy',
            energy: input.energy || 'fuel',
            newEnergy: isNewEnergy(input),
            basis: b,
            tax: t,
            rows: rows,
            total: total,
            outlay: outlay,
            effectiveRate: b.base > 0 ? total / b.base : 0,
            notes: notes,
            deadline: r.deadline
        };
    }

    /** 同一辆车的两种动力：新能源省下的那笔（2026 年起是封顶后的差额，不是全额） */
    function energyCompareOf(input) {
        input = input || {};
        var mk = function (energy) {
            var next = {};
            Object.keys(input).forEach(function (k) { next[k] = input[k]; });
            next.energy = energy;
            return stackOf(next);
        };
        var ne = mk('ne');
        var fuel = mk('fuel');
        return {
            ne: ne,
            fuel: fuel,
            gap: round(fuel.total - ne.total),
            note: '同一辆车、同一计税价格：新能源汽车按当期政策减免（'
                + (rules().ne ? rules().ne.kinds : '列入减免目录的新能源汽车') + '），'
                + '减免额有封顶，不是全额免'
        };
    }

    /** 含税 vs 不含税：按发票价直接乘 10% 会多缴多少 —— 最常见的那一笔错 */
    function vatCompareOf(input) {
        input = input || {};
        var s = stackOf(input);
        var gross = s.basis.gross;
        var wrong = round(gross * s.tax.rate);   // 错误算法：直接拿含税发票价乘税率
        return {
            right: s,
            wrong: wrong,
            gap: round(wrong - s.tax.tax),
            note: '车辆购置税的计税价格不包括增值税税款（《车辆购置税法》第六条（一））：发票价要先按 '
                + Math.round(s.basis.vatRate * 100) + '% 分离，'
                + '直接拿发票价乘 ' + Math.round(s.tax.rate * 100) + '% 会多缴'
        };
    }

    /** 减免档期对照：2024–2025 免征 / 2026–2027 减半且封顶 / 之后全额 */
    function periodCompareOf(input) {
        input = input || {};
        var ps = rules().ne ? rules().ne.periods : [];
        var list = ps.map(function (p) {
            var next = {};
            Object.keys(input).forEach(function (k) { next[k] = input[k]; });
            next.period = p.id;
            return { period: p, stack: stackOf(next) };
        });
        return {
            periods: list,
            note: '新能源汽车减免分档期执行，且每档都有封顶额（财政部 税务总局公告 2023 年第 10 号）：'
                + '2026 年起是减半且封顶，不是全免'
        };
    }

    global.EuriskoVehiclePurchaseTaxQuick = {
        VERSION: '1.0.0',
        rules: rules,
        vatRateOf: vatRateOf,
        periodOf: periodOf,
        basisOf: basisOf,
        reliefOf: reliefOf,
        taxOf: taxOf,
        stackOf: stackOf,
        energyCompareOf: energyCompareOf,
        vatCompareOf: vatCompareOf,
        periodCompareOf: periodCompareOf
    };
})(typeof window !== 'undefined' ? window : this);
