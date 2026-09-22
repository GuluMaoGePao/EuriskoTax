// 阶段12 A4：方案对比中心 —— 界面层
//
// 分工：
//   - scenario-store.js：方案库读写（localStorage）与纯函数
//   - 本文件：把方案渲染成对比表，并处理「保存当前方案」「年终奖三方案」「删除方案」
//
// 可测性：把「由表单数据推导方案」的逻辑抽成 buildBonusScenarios(base, deductions) 纯函数，
//   不依赖 DOM，供 jest 直接断言；DOM 相关部分集中在 render / bind。
//
// 付费边界：免费版最多 2 套本地方案，专业版最多 10 套（后续接云同步）。
//   计税能力本身不锁定，仅限制方案数量。
//
// v1.51.0：这张卡原先长在综合所得页面的结果区，17B-3 删页后**宿主与数据源一起没了** ——
//   它取数靠 `collectTaxInputData()` / `collectDeductionInput()` 两个按 id 读表单的适配器，
//   页面一删，读的是不存在的输入框（第一个 `work-months` 就抛 TypeError）。
//   现在改成宿主注入：谁挂载这张卡，谁通过 `mount(el, ctx)` 把 `{base, deductions, results}`
//   递进来（综合所得向导由 spec 的 `toCalcInput` 提供，与 compute 同源）。
//   本文件从此**不读任何页面表单** —— 换了宿主不用改这里，也不再有第二套取数口径。
(function () {
    'use strict';

    const CURRENCY = '¥';

    // 挂载态：root = 卡片容器，ctx = 本次测算的入参与结果
    const state = { root: null, ctx: null };

    // 对比指标：best 表示该项「越小越优(max)」还是「越大越优」，用于差异高亮
    const METRICS = [
        { key: 'preTaxTotal', label: '税前年收入', kind: 'money' },
        { key: 'netIncome', label: '税后年收入', kind: 'money', best: 'max' },
        { key: 'taxTotal', label: '年度应纳税额', kind: 'money', best: 'min' },
        { key: 'effectiveRate', label: '实际税负率', kind: 'percent', best: 'min' },
        { key: 'monthlyNet', label: '月均到手', kind: 'money', best: 'max' },
        { key: 'bonusMethod', label: '年终奖计税方式', kind: 'text' }
    ];

    // ======================= 纯逻辑 =======================

    function fmtValue(value, kind) {
        if (kind === 'percent') return (Number(value || 0) * 100).toFixed(2) + '%';
        if (kind === 'money') return CURRENCY + Number(value || 0).toFixed(2);
        return (value === undefined || value === null || value === '') ? '-' : String(value);
    }

    // 找出某项指标的最优列下标（仅当存在 2 个以上方案时用于高亮）
    function bestIndex(list, key, mode) {
        let best = -1;
        let bestVal = null;
        list.forEach(function (item, idx) {
            const v = Number(item.summary && item.summary[key]);
            if (!Number.isFinite(v)) return;
            if (best === -1 || (mode === 'max' ? v > bestVal : v < bestVal)) {
                best = idx;
                bestVal = v;
            }
        });
        return best;
    }

    // 由「表单输入 + 已算好的扣除项」推导年终奖相关方案（纯函数，不读 DOM）
    //   方案1 年终奖并入综合所得
    //   方案2 年终奖单独计税
    //   方案3 年终奖与工资最优拆分（仅当收入结构为「工资薪金 + 年终奖」时有效，
    //         因为 calculateOptimalBonusAllocation 的模型只覆盖工资与年终奖两部分）
    function buildBonusScenarios(base, deductions) {
        const bonus = Number(base.bonusIncome) || 0;
        if (bonus <= 0) {
            return { ok: false, message: '当前未填写年终奖，无法生成年终奖方案' };
        }

        const build = function (name, input) {
            const results = performTaxCalculation(Object.assign({}, input, { deductions: deductions }));
            return {
                name: name,
                input: input,
                summary: window.EuriskoScenarios.pure.buildSummary(results)
            };
        };

        const scenarios = [
            build('年终奖并入综合所得', Object.assign({}, base, { bonusInclude: true })),
            build('年终奖单独计税', Object.assign({}, base, { bonusInclude: false }))
        ];

        const hasOtherIncome = (Number(base.annualLaborIncome) || 0) > 0
            || (Number(base.annualAuthorIncome) || 0) > 0
            || (Number(base.annualRoyaltyIncome) || 0) > 0;

        let note = '';
        if (hasOtherIncome) {
            note = '存在劳务/稿酬/特许权使用费收入，「最优拆分」模型不适用，仅提供并入与单独两种口径。';
        } else {
            const totalPackage = (Number(base.monthlySalaryIncome) || 0) * (Number(base.workMonths) || 12) + bonus;
            const opt = calculateOptimalBonusAllocation(totalPackage, deductions.totalDeduction);

            if (opt.optimalMethod === 'include') {
                note = '经测算，年终奖全部并入综合所得更划算（见方案1）。';
            } else if (opt.optimalBonus > 0 && Math.abs(opt.optimalBonus - bonus) > 1) {
                const monthlySalary = (totalPackage - opt.optimalBonus) / (Number(base.workMonths) || 12);
                scenarios.push(build('年终奖与工资最优拆分', Object.assign({}, base, {
                    monthlySalaryIncome: monthlySalary,
                    bonusIncome: opt.optimalBonus,
                    bonusInclude: false
                })));
                note = '已按税率临界点测算出更优的年终奖额度：' + opt.optimalBonus.toFixed(2)
                    + ' 元（可省税 ' + Math.max(0, opt.taxSavings).toFixed(2) + ' 元）。';
            } else {
                note = '当前年终奖额度已接近最优，无需拆分。';
            }
        }

        return { ok: true, scenarios: scenarios, note: note };
    }

    // ======================= 付费档位 =======================

    function getCurrentUser() {
        try {
            if (typeof window !== 'undefined' && window.apiClient
                && typeof window.apiClient.getCurrentUser === 'function') {
                const u = window.apiClient.getCurrentUser();
                if (u) return u;
            }
            const raw = (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('current_user') : null)
                || (typeof localStorage !== 'undefined' ? localStorage.getItem('current_user') : null);
            return raw ? JSON.parse(raw) : null;
        } catch (e) { /* ignore */ }
        return null;
    }

    function getIsPro() {
        const planLib = (typeof window !== 'undefined') ? window.EuriskoPlan : null;
        if (!planLib || typeof planLib.isPro !== 'function') return false;
        const user = getCurrentUser();
        if (!user) return false;
        return planLib.isPro(user.plan, user.plan_expires_at);
    }

    function proHint() {
        const planLib = (typeof window !== 'undefined') ? window.EuriskoPlan : null;
        if (!planLib) return '方案数量上限为专业版（PRO）功能。';
        // 同一个上限提示，不同身份的人看到的下一句应不同：
        // 尤其是「付过钱但权益已到期」的用户 —— 让他回去领免费体验是明显的降级话术。
        if (planLib.featureHintFor) return planLib.featureHintFor(getCurrentUser());
        return planLib.PRO_FEATURE_HINT || '方案数量上限为专业版（PRO）功能。';
    }

    // ======================= DOM 渲染 =======================

    // 卡片内部一律用 class 定位（不占全局 id）：向导会反复重渲染，
    // 全局 id 一旦撞车，hint 会写到上一张卡上 —— 那种错看界面完全看不出来。
    function q(sel) {
        return state.root ? state.root.querySelector(sel) : null;
    }

    function showHint(message, tone) {
        const el = q('.dw-sc-hint');
        if (!el) return;
        el.textContent = message || '';
        // 整体重写 className 时必须带上 dw-sc-hint —— 它是 q() 唯一的抓手，
        // 覆盖掉了就再也找不到这行提示（第二次提示会静默失效）。
        el.className = 'dw-sc-hint text-xs mb-3 ' + (tone === 'ok'
            ? 'text-green-600'
            : tone === 'warn' ? 'text-orange-500' : 'text-gray-500');
    }

    function escapeHtml(text) {
        return String(text === undefined || text === null ? '' : text)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // 表头与表体抽成纯字符串函数：结果页那张对比卡与首页「方案库」弹窗共用同一份 ——
    // 不写第二套对比表，否则两处迟早长出两套口径（19-6b 的教训）。
    function headHtml(list) {
        return '<tr><th>对比指标</th>'
            + list.map(function (s) { return '<th>' + escapeHtml(s.name) + '</th>'; }).join('')
            + '</tr>';
    }

    function tableBodyHtml(list, multi) {
        const rowsHtml = METRICS.map(function (metric) {
            const best = (multi && metric.best) ? bestIndex(list, metric.key, metric.best) : -1;
            const cells = list.map(function (s, idx) {
                const isBest = idx === best;
                const cls = isBest ? 'positive font-bold' : '';
                const tag = isBest ? ' <span class="text-xs">最优</span>' : '';
                return '<td class="' + cls + '">'
                    + escapeHtml(fmtValue(s.summary && s.summary[metric.key], metric.kind)) + tag + '</td>';
            }).join('');
            return '<tr><td class="font-medium">' + escapeHtml(metric.label) + '</td>' + cells + '</tr>';
        }).join('');

        const actionsHtml = '<tr><td class="font-medium">操作</td>'
            + list.map(function (s) {
                return '<td><button type="button" class="scenario-delete-btn text-xs text-red-500 hover:text-red-700" data-id="'
                    + escapeHtml(s.id) + '"><i class="fa fa-trash mr-1"></i>删除</button></td>';
            }).join('')
            + '</tr>';

        return rowsHtml + actionsHtml;
    }

    // after = 删完之后重画谁（由调用方给，见 render / drawLibrary 各自传自己的）
    function bindDeletes(scope, after) {
        scope.querySelectorAll('.scenario-delete-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                const id = btn.getAttribute('data-id');
                const res = window.EuriskoScenarios.remove(id);
                if (res.ok) {
                    if (typeof after === 'function') after();
                } else if (typeof showHint === 'function') {
                    showHint('删除失败：本地存储不可用', 'warn');
                }
            });
        });
    }

    function render() {
        const head = q('.dw-sc-head');
        const body = q('.dw-sc-body');
        const wrap = q('.dw-sc-wrap');
        const empty = q('.dw-sc-empty');
        if (!head || !body || !wrap) return;

        const list = (typeof window.EuriskoScenarios !== 'undefined') ? window.EuriskoScenarios.list() : [];
        const multi = list.length > 1;

        if (list.length === 0) {
            wrap.classList.add('hidden');
            if (empty) empty.classList.remove('hidden');
            showHint('', '');
            return;
        }
        wrap.classList.remove('hidden');
        if (empty) empty.classList.add('hidden');

        head.innerHTML = headHtml(list);
        body.innerHTML = tableBodyHtml(list, multi);
        // 删完重画的是**当前这张表**（结果页就是结果页，方案库弹窗就是弹窗），
        // 不能写死 render() —— 否则从首页弹窗里删一套，表格会画到结果页那个已经不在 DOM 里的容器上。
        bindDeletes(body, function () { render(); showHint('已删除方案', 'ok'); });

        const isPro = getIsPro();
        if (!isPro) {
            showHint('基础版最多保存 ' + window.EuriskoScenarios.MAX_FREE + ' 套方案，专业版可保存 '
                + window.EuriskoScenarios.MAX_PRO + ' 套并支持云同步。', '');
        }
    }

    // ======================= 行为 =======================

    // 存盘只留「人填的那部分」：deductions 每次都能由入参重算出来，
    // 带进 localStorage 只会多一份必然过期的副本。
    function inputSnapshot(base) {
        const snap = Object.assign({}, base || {});
        delete snap.deductions;
        return snap;
    }

    // 取不到上下文时**明确拒绝**：页面式时代取数异常被 try/catch 吞掉，
    // 表现为「提示保存成功、方案却是空的」—— 那比不给按钮更难发现。
    function saveCurrent(ctx) {
        ctx = ctx || state.ctx;
        const results = ctx && ctx.results;
        if (!results || !results.incomeDetails || !results.workMonths) {
            showHint('请先完成一次综合所得计算，再保存为方案。', 'warn');
            return { ok: false, reason: 'no-result' };
        }

        const isPro = getIsPro();
        const list = window.EuriskoScenarios.list();
        const res = window.EuriskoScenarios.save({
            name: '方案 ' + (list.length + 1),
            input: inputSnapshot(ctx.base),
            summary: window.EuriskoScenarios.pure.buildSummary(results)
        }, { isPro: isPro });

        // 先 render 再提示：render() 末尾会写一句「基础版最多保存 N 套」，
        // 顺序反了的话，用户点完「保存」看到的是那句常驻文案，而不是「已保存（1/2）」。
        if (res.ok) {
            render();
            showHint('已保存「' + res.scenario.name + '」（' + res.count + '/'
                + window.EuriskoScenarios.limitFor(isPro) + '）', 'ok');
        } else if (res.reason === 'limit') {
            render();
            showHint(proHint(), 'warn');
        } else {
            showHint('保存失败：本地存储不可用（可能是隐私模式或空间已满）。', 'warn');
        }
        return res;
    }

    function generateBonus(ctx) {
        ctx = ctx || state.ctx;
        if (!ctx || !ctx.base || !ctx.deductions) {
            showHint('请先完成一次综合所得计算，再生成年终奖方案。', 'warn');
            return { ok: false, reason: 'no-result' };
        }

        const built = buildBonusScenarios(ctx.base, ctx.deductions);
        if (!built.ok) {
            showHint(built.message, 'warn');
            return built;
        }

        const isPro = getIsPro();
        const limit = window.EuriskoScenarios.limitFor(isPro);
        let saved = 0;
        let blocked = false;

        built.scenarios.forEach(function (s) {
            if (blocked) return;
            const res = window.EuriskoScenarios.save({
                name: s.name,
                input: s.input,
                summary: s.summary
            }, { isPro: isPro });
            if (res.ok) {
                saved++;
            } else if (res.reason === 'limit') {
                blocked = true;
            }
        });

        render();

        if (blocked) {
            showHint('已保存 ' + saved + ' 套（上限 ' + limit + ' 套）。' + proHint(), 'warn');
        } else {
            showHint('已生成并保存 ' + saved + ' 套方案。' + (built.note || ''), 'ok');
        }
        return { ok: true, saved: saved, blocked: blocked, note: built.note };
    }

    function cardHtml() {
        return '<div class="card">' +
            '<div class="mb-3">' +
                '<h3 class="text-sm font-bold text-gray-800">方案对比</h3>' +
                '<p class="text-xs text-gray-500 mt-0.5">把几套口径摆在一起比 —— 基础版 2 套、专业版 10 套</p>' +
            '</div>' +
            '<div class="flex flex-wrap gap-2 mb-3">' +
                '<button type="button" class="dw-sc-save-btn btn btn-secondary text-sm flex-1">' +
                    '<i class="fa fa-save mr-1"></i>保存当前方案</button>' +
                '<button type="button" class="dw-sc-generate-btn btn btn-primary text-sm flex-1">' +
                    '<i class="fa fa-magic mr-1"></i>生成年终奖方案</button>' +
            '</div>' +
            '<p class="dw-sc-hint text-xs mb-3 text-gray-500"></p>' +
            '<div class="dw-sc-empty text-sm text-gray-500 py-4 text-center">' +
                '暂无保存的方案。完成一次测算后，点「保存当前方案」，或用「生成年终奖方案」一键对比「并入 / 单独计税 / 最优拆分」。' +
            '</div>' +
            '<div class="dw-sc-wrap overflow-x-auto hidden">' +
                '<table class="tax-budget-table"><thead class="dw-sc-head"></thead><tbody class="dw-sc-body"></tbody></table>' +
            '</div>' +
        '</div>';
    }

    function bind() {
        const saveBtn = q('.dw-sc-save-btn');
        if (saveBtn) saveBtn.addEventListener('click', function () { saveCurrent(); });

        const genBtn = q('.dw-sc-generate-btn');
        if (genBtn) genBtn.addEventListener('click', function () { generateBonus(); });
    }

    // 宿主（综合所得向导）把这一轮的入参与结果递进来；卡片自己不取数。
    // 重复挂载（向导回退再进结果步）直接覆盖：旧 root 已经不在 DOM 里了。
    function mount(container, ctx) {
        if (!container || typeof window.EuriskoScenarios === 'undefined') return null;
        state.root = container;
        state.ctx = ctx || null;
        container.innerHTML = cardHtml();
        bind();
        render();
        return container;
    }

    // ======================= 方案库弹窗（阶段19-2 遗留清偿④ 的落点）=======================
    // 为什么要有它：方案对比这张表原先**只挂在结果页** —— 存了 2 套方案，下次想看
    // 必须先重算一遍，否则那两套躺在 localStorage 里没有任何入口能打开。
    // 首页「我的方案与台账」卡的出口就落在这里：一个只读 + 可删的库，与结果页共用同一张表。
    //
    // 弹窗皮沿用主体 / 台账管理弹窗那一套（同一组 class 与 tailwind 类已存在），
    // 不发明第二套弹窗样式；DOM 按需建，不塞进 index.html。
    var LIBRARY_MODAL_ID = 'scenario-library-modal';
    var LIBRARY_BODY_ID = 'scenario-library-body';
    var LIBRARY_CLOSE_ID = 'close-scenario-library';

    // 与主体 / 台账管理弹窗同一套开关：全局 openModal/closeModal 存在就走它（带动画），
    // 没有就退回 class（测试环境没有那两个全局函数时，弹窗照样能开能关）。
    function openModalById(id) {
        var modal = document.getElementById(id);
        if (!modal) return;
        if (typeof window.openModal === 'function') window.openModal(modal);
        else { modal.classList.remove('hidden'); modal.classList.remove('opacity-0'); }
    }

    function closeModalById(id) {
        var modal = document.getElementById(id);
        if (!modal) return;
        if (typeof window.closeModal === 'function') window.closeModal(modal);
        else modal.classList.add('hidden');
    }

    function ensureLibraryModal() {
        if (document.getElementById(LIBRARY_MODAL_ID)) return;
        var div = document.createElement('div');
        div.id = LIBRARY_MODAL_ID;
        div.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 hidden opacity-0 transition-opacity duration-300';
        div.setAttribute('onclick', 'if(event.target===this)closeModal(this)');
        div.innerHTML = '<div class="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full mx-4 transform scale-95' +
            ' transition-transform duration-300 max-h-[85vh] overflow-hidden flex flex-col">' +
            '<div class="bg-gradient-to-r from-primary to-blue-600 text-white p-5 rounded-t-xl">' +
            '<div class="flex justify-between items-center">' +
            '<div><h3 class="text-lg font-bold">我的方案</h3>' +
            '<p class="text-white/80 text-xs mt-0.5">存过的口径摆在一起比 · 基础版 2 套、专业版 10 套</p></div>' +
            '<button type="button" id="' + LIBRARY_CLOSE_ID + '"' +
            ' class="w-8 h-8 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-colors">' +
            '<i class="fa fa-times"></i></button>' +
            '</div></div>' +
            '<div class="p-5 overflow-y-auto" id="' + LIBRARY_BODY_ID + '"></div>' +
            '</div>';
        document.body.appendChild(div);
        document.getElementById(LIBRARY_CLOSE_ID).addEventListener('click', function () { closeModalById(LIBRARY_MODAL_ID); });
    }

    function drawLibrary() {
        var body = document.getElementById(LIBRARY_BODY_ID);
        if (!body) return;
        var store = (typeof window !== 'undefined') ? window.EuriskoScenarios : null;
        if (!store) return;
        var list = store.list();
        if (!list.length) {
            body.innerHTML = '<p class="entity-modal-lead">还没有存过方案。任一工具算出结果后，' +
                '结果区的「保存当前方案」会把它收进这里 —— 存了就能随时回来比，不用再算一遍。</p>';
            return;
        }
        body.innerHTML = '<div class="overflow-x-auto"><table class="tax-budget-table">' +
            '<thead>' + headHtml(list) + '</thead>' +
            '<tbody>' + tableBodyHtml(list, list.length > 1) + '</tbody></table></div>';
        bindDeletes(body, drawLibrary);
    }

    function openLibrary() {
        ensureLibraryModal();
        drawLibrary();
        openModalById(LIBRARY_MODAL_ID);
    }

    window.EuriskoScenarioUI = {
        METRICS: METRICS,
        cardHtml: cardHtml,
        mount: mount,
        render: render,
        bind: bind,
        saveCurrent: saveCurrent,
        generateBonus: generateBonus,
        getIsPro: getIsPro,
        // 阶段19-2 遗留④：方案库弹窗（首页「我的方案与台账」的出口）
        openLibrary: openLibrary,
        drawLibrary: drawLibrary,
        MODAL_IDS: { library: LIBRARY_MODAL_ID },

        // 纯逻辑出口（供 jest 单测）
        pure: {
            buildBonusScenarios: buildBonusScenarios,
            fmtValue: fmtValue,
            bestIndex: bestIndex
        }
    };
})();
