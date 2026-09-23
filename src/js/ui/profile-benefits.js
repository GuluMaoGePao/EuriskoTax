/**
 * 阶段19-6b（v1.88.0）：我的 → 权益进度条（plan §3.6 ①）。
 *
 * 为什么要有这张卡：B5 病灶写得很直白 —— 升级入口只有顶栏 pill 与横幅两处，
 * 用户既看不见自己"用掉了多少权益"，也看不见云同步到底开没开。
 * 「基础版」三个字没有任何进度感，专业版就永远只是一个按钮上的词。
 *
 * 三条克制（与本项目其它卡片同一条规矩）：
 *   1) 取不到就不说。EuriskoScenarios / EuriskoSync 没加载或没数据时，
 *      对应的那一行**整行不出现**，不补 0 —— 0 会被读成"你一套方案都没存"。
 *   2) 进度条只表达**档位在阶梯上的位置**（基础版 → 体验版 → 专业版 三格），
 *      不表达"距离专业版还差百分之几" —— 那是没有分母的百分比，纯属编的。
 *   3) 升级入口不新增：卡片里那颗按钮就是原来的横幅按钮（id 仍是
 *      #profile-nav-upgrade），全局依旧只有顶栏 pill + 这一处（阶段14 约束）。
 *
 * 元素一律 class + 容器作用域定位（不引全局 id）：与档案卡同页，避免互相覆盖。
 */
(function () {
    'use strict';

    // 三档刻度：顺序即阶梯顺序（基础版 → 体验版 → 专业版）
    var TIER_STEPS = [
        { key: 'free', label: '基础版' },
        { key: 'trial', label: '体验版' },
        { key: 'pro', label: '专业版' }
    ];

    function esc(s) {
        return String(s === null || s === undefined ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function dayGap(now, then) {
        return Math.floor((now.getTime() - then.getTime()) / 86400000);
    }

    // 「N 天前」这类相对时间（只说天数/月数，不精确到小时 —— 精度在这里是噪音）
    function agoText(iso, now) {
        if (!iso) return '';
        var t = new Date(iso);
        if (isNaN(t.getTime())) return '';
        var d = dayGap(now || new Date(), t);
        if (d <= 0) return '今天';
        if (d === 1) return '昨天';
        if (d < 30) return d + ' 天前';
        return Math.floor(d / 30) + ' 个月前';
    }

    /**
     * 纯函数：把「档位 + 方案用量 + 云同步状态」翻译成卡片上要说的话。
     * 供 jest 直接单测，不依赖 DOM 与任何全局库。
     */
    function buildModel(opts) {
        var o = opts || {};
        var now = o.now || new Date();
        var tierKey = o.tierKey || '';

        var current = -1;
        for (var i = 0; i < TIER_STEPS.length; i++) {
            if (TIER_STEPS[i].key === tierKey) { current = i; break; }
        }
        var steps = TIER_STEPS.map(function (s, idx) {
            return {
                key: s.key,
                label: s.label,
                state: idx < current ? 'done' : (idx === current ? 'current' : 'todo')
            };
        });

        // 方案用量：拿不到（store 未加载）就整行不出现
        var usageText = '';
        if (typeof o.scenarioCount === 'number') {
            var limit = o.scenarioLimit;
            if (!limit || limit === Infinity) {
                usageText = '已存 ' + o.scenarioCount + ' 套方案 · 不限量';
            } else {
                usageText = '已用 ' + Math.min(o.scenarioCount, limit) + '/' + limit + ' 套方案';
                if (o.scenarioCount >= limit) usageText += ' · 再存需先删一套';
            }
        }

        // 云同步：只有"专业版权益生效中"才算开启，没同步过就说没同步过
        var syncText = '';
        var sync = o.sync;
        if (sync && typeof sync === 'object') {
            if (sync.proActive) {
                syncText = sync.lastSyncAt
                    ? '云同步已开启 · 上次同步 ' + agoText(sync.lastSyncAt, now)
                    : '云同步已开启 · 尚未同步过';
            } else {
                syncText = '云同步未开启（专业版可用）';
            }
        }

        return {
            visible: current >= 0,
            tierKey: tierKey,
            tierLabel: o.tierLabel || '',
            steps: steps,
            usageText: usageText,
            syncText: syncText,
            // 已经是专业版的人不需要被"了解专业版"，那句话对他没信息量
            ctaText: tierKey === 'pro' ? '查看版本与权益' : '了解专业版'
        };
    }

    function stepsHtml(steps) {
        return steps.map(function (s) {
            return '<div class="benefit-step is-' + s.state + '"' +
                (s.state === 'current' ? ' aria-current="step"' : '') + '>' +
                '<span class="benefit-step__bar"></span>' +
                '<span class="benefit-step__label">' + esc(s.label) +
                (s.state === 'current' ? '（当前）' : '') + '</span></div>';
        }).join('');
    }

    function setLine(id, text) {
        var el = document.getElementById(id);
        if (!el) return;
        el.textContent = text || '';
        el.classList.toggle('hidden', !text);
    }

    function isProUser(user) {
        var P = (typeof window !== 'undefined') ? window.EuriskoPlan : null;
        if (!P || typeof P.isPro !== 'function' || !user) return false;
        return !!P.isPro(user.plan, user.plan_expires_at);
    }

    function render(user) {
        var box = document.getElementById('profile-benefits-card');
        if (!box) return; // 我的页没渲染到（游客态等）就什么都不做，不抛错

        var P = (typeof window !== 'undefined') ? window.EuriskoPlan : null;
        var tier = (P && typeof P.describe === 'function') ? P.describe(user) : null;

        // 方案用量：库不在就不编 —— 空串会让这一行整行隐藏
        var scenario = {};
        var S = (typeof window !== 'undefined') ? window.EuriskoScenarios : null;
        if (S && typeof S.list === 'function' && typeof S.limitFor === 'function') {
            scenario.scenarioCount = S.list().length;
            scenario.scenarioLimit = S.limitFor(isProUser(user));
        }

        var sync = null;
        var Y = (typeof window !== 'undefined') ? window.EuriskoSync : null;
        if (Y && typeof Y.getState === 'function') {
            sync = { proActive: !!Y.getState().proActive, lastSyncAt: Y.getState().lastSyncAt || null };
        }

        var model = buildModel(Object.assign({
            tierKey: tier ? tier.key : '',
            tierLabel: tier ? tier.label : '',
            sync: sync
        }, scenario));

        if (!model.visible) { box.classList.add('hidden'); return; }
        box.classList.remove('hidden');

        var tierEl = document.getElementById('profile-benefits-tier');
        if (tierEl) tierEl.textContent = model.tierLabel + '权益';

        var stepsEl = document.getElementById('profile-benefits-steps');
        if (stepsEl) stepsEl.innerHTML = stepsHtml(model.steps);

        setLine('profile-benefits-usage', model.usageText);
        setLine('profile-benefits-sync', model.syncText);

        var cta = document.querySelector('#profile-nav-upgrade span');
        if (cta) cta.textContent = model.ctaText;
    }

    window.EuriskoProfileBenefits = {
        render: render,
        TIER_STEPS: TIER_STEPS,
        // 纯逻辑出口（供 jest 单测，不需要 DOM 与全局库）
        pure: { buildModel: buildModel, agoText: agoText, stepsHtml: stepsHtml }
    };
})();
