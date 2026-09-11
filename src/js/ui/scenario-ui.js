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
(function () {
    'use strict';

    const CURRENCY = '¥';

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
        return (planLib && planLib.PRO_FEATURE_HINT)
            ? planLib.PRO_FEATURE_HINT
            : '方案数量上限为专业版（PRO）功能。';
    }

    // ======================= DOM 渲染 =======================

    function showHint(message, tone) {
        const el = document.getElementById('scenario-hint');
        if (!el) return;
        el.textContent = message || '';
        el.className = 'text-xs mb-3 ' + (tone === 'ok'
            ? 'text-green-600'
            : tone === 'warn' ? 'text-orange-500' : 'text-gray-500');
    }

    function escapeHtml(text) {
        return String(text === undefined || text === null ? '' : text)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function render() {
        const head = document.getElementById('scenario-compare-head');
        const body = document.getElementById('scenario-compare-body');
        const wrap = document.getElementById('scenario-table-wrap');
        const empty = document.getElementById('scenario-empty');
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

        head.innerHTML = '<tr><th>对比指标</th>'
            + list.map(function (s) { return '<th>' + escapeHtml(s.name) + '</th>'; }).join('')
            + '</tr>';

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
                return '<td><button class="scenario-delete-btn text-xs text-red-500 hover:text-red-700" data-id="'
                    + escapeHtml(s.id) + '"><i class="fa fa-trash mr-1"></i>删除</button></td>';
            }).join('')
            + '</tr>';

        body.innerHTML = rowsHtml + actionsHtml;

        body.querySelectorAll('.scenario-delete-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                const id = btn.getAttribute('data-id');
                const res = window.EuriskoScenarios.remove(id);
                if (res.ok) {
                    showHint('已删除方案', 'ok');
                    render();
                } else {
                    showHint('删除失败：本地存储不可用', 'warn');
                }
            });
        });

        const isPro = getIsPro();
        if (!isPro) {
            showHint('基础版最多保存 ' + window.EuriskoScenarios.MAX_FREE + ' 套方案，专业版可保存 '
                + window.EuriskoScenarios.MAX_PRO + ' 套并支持云同步。', '');
        }
    }

    // ======================= 行为 =======================

    function collectInputSafely() {
        try {
            return collectTaxInputData();
        } catch (e) {
            return null;
        }
    }

    function saveCurrent() {
        const results = (typeof calculationResults !== 'undefined') ? calculationResults : null;
        if (!results || !results.incomeDetails || !results.workMonths) {
            showHint('请先完成一次综合所得计算，再保存为方案。', 'warn');
            return { ok: false, reason: 'no-result' };
        }

        const isPro = getIsPro();
        const list = window.EuriskoScenarios.list();
        const res = window.EuriskoScenarios.save({
            name: '方案 ' + (list.length + 1),
            input: collectInputSafely(),
            summary: window.EuriskoScenarios.pure.buildSummary(results)
        }, { isPro: isPro });

        if (res.ok) {
            showHint('已保存「' + res.scenario.name + '」（' + res.count + '/'
                + window.EuriskoScenarios.limitFor(isPro) + '）', 'ok');
            render();
        } else if (res.reason === 'limit') {
            showHint(proHint(), 'warn');
        } else {
            showHint('保存失败：本地存储不可用（可能是隐私模式或空间已满）。', 'warn');
        }
        return res;
    }

    function generateBonus() {
        const base = collectInputSafely();
        if (!base) {
            showHint('无法读取表单数据，请先完成一次计算。', 'warn');
            return { ok: false };
        }

        let deductions;
        try {
            deductions = computeDeductions(collectDeductionInput(), base.workMonths);
        } catch (e) {
            showHint('无法读取扣除项，请先完成一次计算。', 'warn');
            return { ok: false };
        }

        const built = buildBonusScenarios(base, deductions);
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

    function bind() {
        const saveBtn = document.getElementById('scenario-save-btn');
        if (saveBtn) saveBtn.addEventListener('click', saveCurrent);

        const genBtn = document.getElementById('scenario-generate-btn');
        if (genBtn) genBtn.addEventListener('click', generateBonus);
    }

    function init() {
        if (typeof window.EuriskoScenarios === 'undefined') return;
        bind();
        render();
    }

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
    }

    window.EuriskoScenarioUI = {
        METRICS: METRICS,
        render: render,
        bind: bind,
        init: init,
        saveCurrent: saveCurrent,
        generateBonus: generateBonus,
        getIsPro: getIsPro,

        // 纯逻辑出口（供 jest 单测）
        pure: {
            buildBonusScenarios: buildBonusScenarios,
            fmtValue: fmtValue,
            bestIndex: bestIndex
        }
    };
})();
