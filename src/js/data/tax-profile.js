/**
 * 阶段19-5：税务档案（留存机制 §3.8 ② —— 完成度引导）
 *
 * 为什么要有它：竞品把「算」做到了极致，把「留」全部放弃了（plan §2.1）。
 * 而「留」的 cheapest 抓手是**沉没成本**：用户补全过一次自己的情况，下次再算
 * 就不必从头解释一遍自己是上班族还是个体户 —— 换设备的成本也随之变高。
 *
 * 三条硬约束（写在这里，避免后人按字面 repeater）：
 *   1) **只存用户自己给过的东西**。从测算输入里抽取，也只抽**能确定的**：
 *      填了「专项附加扣除 ¥3,000」看不出是哪几项，就不写 deductions ——
 *      猜出来的档案比没有档案更糟（它会让后面的"更准"变成假承诺）。
 *   2) **不阻塞任何测算**。读写全部 try/catch，localStorage 不可用（隐私模式）
 *      时降级为内存对象，页面行为完全不变。
 *   3) **可跳过**。引导卡一次「暂不」就永久收声（nudgeDismissed），
 *      不再靠重复弹窗刷存在感 —— 那只会把人赶走。
 *
 * 纯函数挂在 window.EuriskoTaxProfile.pure 供 jest 直接单测（沿用 scenario-store 的约定）。
 */
(function () {
    'use strict';

    var STORAGE_KEY = 'taxProfile';

    // 档案的 5 个项：覆盖「下次别让我重填」所需的最小集。
    // ask 是引导卡上给用户的那一句（人话，不写字段名）。
    var ITEMS = [
        {
            key: 'identity',
            label: '身份',
            ask: '你算的是自己的工资，还是店里的账？',
            kind: 'single',
            options: [
                { value: 'employee', label: '上班族' },
                { value: 'freelance', label: '自由职业 / 副业' },
                { value: 'owner', label: '个体户 / 老板' },
                { value: 'finance', label: '企业财务 / 代账' }
            ]
        },
        {
            key: 'city',
            label: '城市',
            ask: '参保 / 经营在哪个城市？（社保基数与口径按城市走）',
            kind: 'text'
        },
        {
            key: 'social',
            label: '社保公积金',
            ask: '你有缴社保公积金吗？',
            kind: 'single',
            options: [
                { value: 'yes', label: '有缴' },
                { value: 'no', label: '没缴' }
            ]
        },
        {
            key: 'deductions',
            label: '专项附加扣除',
            ask: '哪些专项附加扣除你享受得到？（可多选）',
            kind: 'multi',
            options: [
                { value: 'children', label: '子女教育' },
                { value: 'education', label: '继续教育' },
                { value: 'medical', label: '大病医疗' },
                { value: 'loan', label: '住房贷款利息' },
                { value: 'rent', label: '住房租金' },
                { value: 'elderly', label: '赡养老人' },
                { value: 'infant', label: '3 岁以下婴幼儿照护' }
            ]
        },
        {
            key: 'bonus',
            label: '年终奖',
            ask: '今年有年终奖 / 一次性奖金吗？（计税方式不一样）',
            kind: 'single',
            options: [
                { value: 'yes', label: '有' },
                { value: 'no', label: '没有' }
            ]
        }
    ];

    function itemOf(key) {
        for (var i = 0; i < ITEMS.length; i += 1) {
            if (ITEMS[i].key === key) return ITEMS[i];
        }
        return null;
    }

    function emptyProfile() {
        return {
            identity: '',
            city: '',
            social: '',
            deductions: [],
            bonus: '',
            nudgeDismissed: false,
            updatedAt: ''
        };
    }

    // ---- 判定：某一项算不算「已填」 ----
    // deductions 是数组（空数组 = 没填）；其余是字符串。
    function isFilled(profile, key) {
        var p = profile || {};
        var v = p[key];
        if (key === 'deductions') return Array.isArray(v) && v.length > 0;
        return typeof v === 'string' && v.trim() !== '';
    }

    /**
     * 完成度：{ percent, filled, total, missing }
     * missing 保持 ITEMS 的顺序 —— 引导卡按它决定先问哪一句，顺序稳定才好测。
     */
    function completeness(profile) {
        var p = profile || {};
        var missing = [];
        var filled = 0;
        ITEMS.forEach(function (it) {
            if (isFilled(p, it.key)) filled += 1;
            else missing.push(it);
        });
        var total = ITEMS.length;
        return {
            percent: Math.round((filled / total) * 100),
            filled: filled,
            total: total,
            missing: missing
        };
    }

    function patchProfile(profile, patch) {
        var next = Object.assign({}, emptyProfile(), profile || {}, patch || {});
        if (!Array.isArray(next.deductions)) next.deductions = [];
        return next;
    }

    // ---- 从一次测算的输入里抽取档案项 ----
    // 只抽**能确定的**：数值 > 0 的社保基数 ⇒ "有缴"，但一个汇总的扣除金额 ⇒ 不猜是哪几项。
    var CITY_RE = /(city|城市)/i;
    var SOCIAL_RE = /(social|insurance|fund|shebao|gjj|社保|公积金)/i;
    var BONUS_RE = /(bonus|年终奖|一次性奖金)/i;
    // 具体扣除项：字段名里认得出是哪一项才写（否则只看到一个总额，写进去就是编）
    var DEDUCTION_ALIASES = [
        { re: /(children|子女)/i, value: 'children' },
        { re: /(continuing|education|继续教育)/i, value: 'education' },
        { re: /(medical|大病)/i, value: 'medical' },
        { re: /(loan|mortgage|房贷|贷款)/i, value: 'loan' },
        { re: /(rent|房租|租金)/i, value: 'rent' },
        { re: /(elderly|赡养)/i, value: 'elderly' },
        { re: /(infant|baby|婴幼儿|3岁)/i, value: 'infant' }
    ];

    // 工具 → 身份：只在**工具本身就说明了身份**时才写（算经营所得 ⇒ 老板），
    // 通用工具（如增值税）不猜 —— 老板和代账都会用，猜了必错一半。
    var TOOL_IDENTITY = {
        'salary-tax': 'employee',
        'net-salary': 'employee',
        'annual-settlement': 'employee',
        'withholding': 'freelance',
        'business-income': 'owner',
        'business': 'owner',
        'employer-cost': 'finance'
    };

    function num(v) {
        var n = Number(v);
        return isFinite(n) ? n : 0;
    }

    /**
     * 纯函数：把一次测算的输入并入档案。
     * @returns {{ profile: object, absorbed: string[] }} absorbed = 本次真正补上的项（用于引导卡上的文案）
     */
    function absorbFromValues(profile, toolId, values) {
        var base = patchProfile(profile, {});
        var next = Object.assign({}, base);
        next.deductions = (base.deductions || []).slice();
        var absorbed = [];
        var vals = values || {};

        function mark(key, value) {
            if (isFilled(next, key)) return;
            next[key] = value;
            absorbed.push(key);
        }

        Object.keys(vals).forEach(function (k) {
            var v = vals[k];
            if (v === null || v === undefined || v === '') return;
            if (CITY_RE.test(k) && typeof v === 'string') {
                mark('city', String(v).trim());
                return;
            }
            if (SOCIAL_RE.test(k)) {
                // 只认两种确定形态：布尔 / 数字基数。字符串（城市名等）不认，避免把"按北京社保"当成有缴
                if (typeof v === 'boolean') mark('social', v ? 'yes' : 'no');
                else if (num(v) > 0) mark('social', 'yes');
                return;
            }
            if (BONUS_RE.test(k) && num(v) > 0) {
                mark('bonus', 'yes');
                return;
            }
            // 具体扣除项：字段名认得出 + 有值 ⇒ 这一项享受得到
            for (var i = 0; i < DEDUCTION_ALIASES.length; i += 1) {
                if (DEDUCTION_ALIASES[i].re.test(k)) {
                    var on = typeof v === 'boolean' ? v : num(v) > 0;
                    if (on && next.deductions.indexOf(DEDUCTION_ALIASES[i].value) === -1) {
                        next.deductions = next.deductions.concat([DEDUCTION_ALIASES[i].value]);
                        if (absorbed.indexOf('deductions') === -1) absorbed.push('deductions');
                    }
                    return;
                }
            }
        });

        var ident = TOOL_IDENTITY[toolId];
        if (ident) mark('identity', ident);

        if (absorbed.length) next.updatedAt = new Date().toISOString();
        return { profile: next, absorbed: absorbed };
    }

    // ---- 存储（localStorage 不可用时降级为内存，页面行为不变）----
    var memory = null;

    function read() {
        try {
            var raw = (typeof localStorage !== 'undefined') ? localStorage.getItem(STORAGE_KEY) : null;
            if (!raw) return memory ? patchProfile(memory, {}) : emptyProfile();
            var parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return emptyProfile();
            return patchProfile(parsed, {});
        } catch (e) {
            return memory ? patchProfile(memory, {}) : emptyProfile();
        }
    }

    function write(profile) {
        memory = profile;
        var next = Object.assign({}, profile, { updatedAt: new Date().toISOString() });
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
            }
        } catch (e) {
            // 隐私模式 / 配额满：留在内存里，本次会话仍可用
        }
        notify(next);
        return next;
    }

    var listeners = [];
    function notify(profile) {
        try {
            if (typeof document !== 'undefined') {
                document.dispatchEvent(new CustomEvent('euriskotax:profile-updated', {
                    detail: { profile: profile }
                }));
            }
        } catch (e) {
            // 事件只是给 UI 的广播，失败不影响存储
        }
        listeners.forEach(function (fn) {
            try { fn(profile); } catch (e) { /* 单个订阅者出错不拖垮其余 */ }
        });
    }

    window.EuriskoTaxProfile = {
        STORAGE_KEY: STORAGE_KEY,
        // 纯函数：jest 直接测，不碰 DOM 与 localStorage
        pure: {
            ITEMS: ITEMS,
            itemOf: itemOf,
            emptyProfile: emptyProfile,
            isFilled: isFilled,
            completeness: completeness,
            patchProfile: patchProfile,
            absorbFromValues: absorbFromValues
        },
        get: function () { return read(); },
        /** 合并写入并返回新档案 */
        patch: function (obj) { return write(patchProfile(read(), obj || {})); },
        /**
         * 一次测算后调用：把输入里**能确定**的部分并入档案。
         * @returns {{ profile, absorbed }} absorbed 为空表示这次没学到新东西
         */
        absorb: function (toolId, values) {
            var res = absorbFromValues(read(), toolId, values);
            if (res.absorbed.length) return { profile: write(res.profile), absorbed: res.absorbed };
            return { profile: res.profile, absorbed: [] };
        },
        /** 「暂不」：一次跳过，之后不再自动引导 */
        dismissNudge: function () { return write(patchProfile(read(), { nudgeDismissed: true })); },
        /**
         * 该不该在结果页引导：档案未满、且用户没说过「暂不」。
         * complete 只由 completeness 决定 —— 不要让调用方自己再算一遍百分比。
         */
        shouldNudge: function () {
            var p = read();
            if (p.nudgeDismissed) return false;
            return completeness(p).percent < 100;
        },
        reset: function () { return write(emptyProfile()); },
        onChange: function (fn) { if (typeof fn === 'function') listeners.push(fn); }
    };
})();
