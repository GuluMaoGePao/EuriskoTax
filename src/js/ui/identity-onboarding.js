/**
 * 「我是谁」—— 身份弹窗 + 两处身份卡（v1.139.0）
 *
 * 位置变更的由来：身份原先是**首页第 5 张卡**（一行 6 个 chip）。用户反馈有两条：
 *   ① 首页是动作页，打开先被问"你是谁"是拦路 —— 41 个入口全都开放，问了也不改可达性；
 *   ② 「我的」里翻不到改身份的地方（原先只在首页那一行 chip 上有）。
 * 于是身份从首页撤下，落到两个该在的地方：
 *   A **登录后弹窗**（首次登录自动弹一次，选完点「下一步」即关；网页是弹窗、手机全屏）
 *   B **个人中心**（常驻显示 + 随时修改），「我的」页顶部再给一张身份卡做一眼可见的入口。
 *
 * 三条边界（改之前先看这里）：
 *   1. **仍然不是筛选**。选身份只改默认视图密度（identity-pref 带出），41 个入口照旧全开 ——
 *      弹窗里那句"不选也能用全部入口"不是客套话，是这条边界的用户可见版本。
 *   2. **仍然不写计税档案**。身份 6 张卡 vs 档案 identity 3 个计税口径，值域对不上，
 *      拿导航选择改计税口径将来算错没人查得到（identity-pref.js 文件头第 1 条）。
 *   3. **职务 / 公司只是显示用的备注**，不参与任何计算。留空完全合法 ——
 *      这也是两个输入框都**不校验**、没有"必填"标记的原因：它们不是登录资料。
 *
 * 游客可用：身份是本机偏好，不是登录特权（与 identity-pref / mode-pref 同一口径）。
 */
(function () {
    'use strict';

    var MODAL_ID = 'identity-modal';
    var CARD_ID = 'profile-identity-card';

    // 弹窗内的**临时**选择：只有点「下一步」才落盘。
    // 点 × 或「暂时不填」都不算数 —— 否则"顺手点了一下"就被记成身份了。
    var picked = null;

    // 已挂上的 identity-pref 变更订阅的退订函数（init 重挂用）
    var unsubscribe = null;

    function lib() { return window.EuriskoIdentityPref; }
    function reg() { return window.EuriskoToolRegistry; }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function scenarios() {
        var R = reg();
        if (!R || typeof R.scenarios !== 'function') return [];
        try { return R.scenarios() || []; } catch (e) { return []; }
    }

    function nameOf(id) {
        var hit = scenarios().filter(function (s) { return s.id === id; })[0];
        return hit ? hit.name : '';
    }

    function profile() {
        var L = lib();
        if (L && typeof L.profile === 'function') return L.profile();
        return { id: (L && L.get) ? L.get() : '', title: '', company: '' };
    }

    function modal() { return document.getElementById(MODAL_ID); }

    // ====== 弹窗内容 ======

    // 整卡形态（图标 + 名字 + 一句话说明）：这里是**让用户挑**的地方，
    // 说明必须出现 —— 首页那版 chip 不写说明是因为它只做"设为默认"这一个动作，
    // 而这里用户第一次见到这 6 个选项，看不出"个体户 / 小店"和自己有什么关系。
    function drawList() {
        var box = document.getElementById('identity-modal-list');
        if (!box) return;
        var current = picked != null ? picked : (profile().id || '');

        box.innerHTML = scenarios().map(function (s) {
            var on = s.id === current;
            return '<button type="button" class="identity-pick' + (on ? ' is-on' : '') + '"' +
                ' data-identity="' + esc(s.id) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
                '<i class="fa ' + esc(s.icon || 'fa-user') + '"></i>' +
                '<span class="identity-pick-name">' + esc(s.name) + '</span>' +
                '<span class="identity-pick-desc">' + esc(s.desc) + '</span>' +
                '<i class="fa fa-check identity-pick-check"></i>' +
                '</button>';
        }).join('');

        box.querySelectorAll('.identity-pick').forEach(function (btn) {
            btn.addEventListener('click', function () {
                picked = btn.getAttribute('data-identity');
                drawList();     // 就地重画：勾换到这张卡上（不关弹窗，还能接着填职务 / 公司）
            });
        });
    }

    function open(opts) {
        opts = opts || {};
        bindModal();     // 兜底：万一 init 跑在弹窗进入 DOM 之前，这一下补上
        var m = modal();
        if (!m) return;
        var p = profile();

        picked = p.id || '';
        var job = document.getElementById('identity-modal-job');
        var comp = document.getElementById('identity-modal-company');
        if (job) job.value = p.title || '';
        if (comp) comp.value = p.company || '';

        var title = document.getElementById('identity-modal-title');
        if (title) title.textContent = opts.title || '我是谁';

        // 「暂时不填」只在首次登录那次出现：从个人中心进来的人是要改的，
        // 给他一颗"算了"的按钮等于把已经点开的动作又收回去了。
        var skip = document.getElementById('identity-modal-skip');
        if (skip) skip.classList.toggle('hidden', !opts.firstTime);

        drawList();
        if (typeof window.openModal === 'function') window.openModal(m);
        else m.classList.remove('hidden');
    }

    function close() {
        var m = modal();
        if (!m) return;
        if (typeof window.closeModal === 'function') window.closeModal(m);
        else m.classList.add('hidden');
        picked = null;
    }

    function commit() {
        var L = lib();
        var job = document.getElementById('identity-modal-job');
        var comp = document.getElementById('identity-modal-company');
        if (L && typeof L.save === 'function') {
            L.save({
                id: picked == null ? undefined : picked,   // undefined = 只改详情、不动身份
                title: job ? String(job.value || '').trim() : '',
                company: comp ? String(comp.value || '').trim() : ''
            });
        }
        close();
        syncAll();
    }

    /** 点「暂时不填」：只记"引导看过了"，下次登录不再弹，身份保持没选过 */
    function skip() {
        var L = lib();
        if (L && typeof L.markOnboarded === 'function') L.markOnboarded();
        close();
        syncAll();
    }

    // ====== 两处身份卡 ======

    function summaryLine(p) {
        var bits = [];
        if (p.title) bits.push(p.title);
        if (p.company) bits.push(p.company);
        return bits.join(' · ');
    }

    /** 「我的」页顶部身份卡 */
    function syncIdentityCard() {
        var card = document.getElementById(CARD_ID);
        if (!card) return;
        var p = profile();
        var name = nameOf(p.id);
        var titleEl = document.getElementById('profile-identity-title');
        var subEl = document.getElementById('profile-identity-sub');
        if (titleEl) titleEl.textContent = name ? '我是' + name : '我是谁';

        if (subEl) {
            var line = summaryLine(p);
            if (line) subEl.textContent = line;
            else if (name) subEl.textContent = '补上职务与公司名称，测算默认按你的场景给参数';
            else subEl.textContent = '选一个最贴近你的身份，也可以只填职务与公司名称';
        }
    }

    /** 个人中心里的身份区块（显示 + 修改入口） */
    function syncSettingsCard() {
        var box = document.getElementById('identity-settings-summary');
        if (!box) return;
        var p = profile();
        var rows = [
            ['身份', nameOf(p.id) || '未选择'],
            ['职务名称', p.title || '未填写'],
            ['公司名称', p.company || '未填写']
        ];
        box.innerHTML = rows.map(function (r) {
            var empty = !r[1] || r[1] === '未选择' || r[1] === '未填写';
            return '<div class="identity-settings-row">' +
                '<span class="identity-settings-key">' + esc(r[0]) + '</span>' +
                '<span class="identity-settings-val' + (empty ? ' is-empty' : '') + '">' + esc(r[1]) + '</span>' +
                '</div>';
        }).join('');
    }

    function syncAll() {
        syncIdentityCard();
        syncSettingsCard();
    }

    /**
     * 登录成功后调一次：没走过引导才弹。
     * 判据用 identity-pref 的 onboarded 而不是"有没有身份"——
     * 用户在弹窗里点过「暂时不填」就该被尊重，下次登录再弹一次是纠缠。
     */
    function maybeOpenAfterLogin() {
        var L = lib();
        if (!L || typeof L.onboarded !== 'function' || L.onboarded()) return false;
        // 延后一拍：登录后的页面切换 / 同步还在跑，立刻弹会被随后的重绘盖掉
        window.setTimeout(function () { open({ firstTime: true, title: '先认识一下你' }); }, 300);
        return true;
    }

    /** 弹窗内部按钮的绑定（幂等）。open() 里也调一次：绑不绑得上不该取决于脚本加载时机。 */
    function bindModal() {
        var m = modal();
        if (!m || m.dataset.identityBound === '1') return;
        m.dataset.identityBound = '1';
        var closeBtn = document.getElementById('identity-modal-close');
        if (closeBtn) closeBtn.addEventListener('click', close);
        var nextBtn = document.getElementById('identity-modal-next');
        if (nextBtn) nextBtn.addEventListener('click', commit);
        var skipBtn = document.getElementById('identity-modal-skip');
        if (skipBtn) skipBtn.addEventListener('click', skip);
        // 点遮罩关闭：与其余弹窗同一套手感（e.target === 遮罩本身才算点在外面）
        m.addEventListener('click', function (e) {
            if (e.target === m) close();
        });
    }

    function init() {
        bindModal();

        // 「我的」页身份卡 与 个人中心的「修改」按钮都开同一个弹窗 ——
        // 一个目的地一条路径：不再各写一份表单。
        //
        // ⚠️ 这两个入口必须用**文档级委托**，不能 getElementById 直接绑：
        // 本脚本在 index.html 约 2011 行引入并执行，而 #profile-identity-card（约 2190 行）
        // 与 #identity-settings-edit 都在它**后面**才被解析 —— 当初在这里直接绑，
        // getElementById 一律返回 null，于是"点了没弹窗"，且控制台一声不响。
        // 委托天然与 DOM 顺序无关，将来这两个节点被重绘（换掉 DOM 节点）也照样接得住。
        // 弹窗本身（#identity-modal）在脚本之前，直接绑没问题。
        if (!document.documentElement.dataset.identityEntryBound) {
            document.documentElement.dataset.identityEntryBound = '1';
            document.addEventListener('click', function (e) {
                var t = e.target && e.target.closest
                    ? e.target.closest('#' + CARD_ID + ', #identity-settings-edit')
                    : null;
                if (t) open();
            });
        }

        // 订阅**重挂而非重复挂**：init 会被反复调（页面重进、单测里 identity-pref.reset()
        // 把订阅清了个干净），所以做法是先把上一份退订掉再挂新的 ——
        // 只挂一份（否则每次变更刷两遍 DOM），且 reset 之后还能接得上。
        var L = lib();
        if (L && typeof L.onChange === 'function') {
            if (unsubscribe) { unsubscribe(); unsubscribe = null; }
            unsubscribe = L.onChange(syncAll);
        }

        syncAll();
    }

    window.EuriskoIdentityOnboarding = {
        init: init,
        open: open,
        close: close,
        commit: commit,
        skip: skip,
        syncAll: syncAll,
        syncIdentityCard: syncIdentityCard,
        syncSettingsCard: syncSettingsCard,
        maybeOpenAfterLogin: maybeOpenAfterLogin
    };

    // 脚本在 body **中段**引入（index.html 约 2011 行），DOM 尚未解析完：
    // 立即 init() 只能绑到弹窗，两处身份卡与身份摘要都还不存在 —— 文本就刷不上去。
    // 因此没解析完就等 DOMContentLoaded；已解析完（重复执行 / 动态插入）则立刻跑。
    // init 自身幂等（dataset 标记 + 退订重挂），跑两次不会有第二份监听。
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
