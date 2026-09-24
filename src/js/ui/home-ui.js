// === 阶段1：工作台首页动态逻辑 ===
// 负责首页卡片流的动态内容渲染：
// 1. 问候语 + 日期
// 2. 今日税感（按当前日期动态生成税务节点提醒）
// 3. 最近计算（横向滑动卡，从 localStorage 读取）
// 4. 税务日历提醒（本月 + 即将到来）
// 5. 税务小贴士（轮播）
// 6. 模式卡片点击 → 触发对应按钮点击；info 按钮 → 弹窗展示模式说明

(function () {
    'use strict';

    // ====== 首页渲染性能日志（与个人中心 ProfilePerf / 税务助手 AssistantPerf 风格对齐） ======
    // 用于确认 initHome 中 5 个渲染步骤是否达到低耗时标准
    const HomePerf = {
        log(action, durationMs, extra = {}) {
            const now = new Date();
            const time = now.toISOString().split('T')[1].split('.')[0];
            console.log(
                `%c[EuriskoTax Home ${time}]`,
                'color: #16a34a; font-weight: bold;',
                `${action} → ${durationMs.toFixed(2)}ms`,
                { timestamp: now.getTime(), ...extra }
            );
        },
        measure(action, fn, extra = {}) {
            const start = performance.now();
            const result = fn();
            this.log(action, performance.now() - start, extra);
            return result;
        }
    };

    // ====== 数据：税务节点表 ======
    // 真源在 home-mission.js（阶段19-2）—— 那里要用节点表做 Mission 判定与待办推导。
    // 这里**只是兜底**：tests/home-page.test.js 只 eval 本文件（不加载 home-mission.js），
    // 若改成硬依赖会立刻红。两份必须逐字一致 —— 改节点口径时先改 home-mission.js 再同步这里。
    // type: settlement(汇算区间) | policy(政策有效期) | prepaid(按期申报)
    const TAX_NODES = (window.EuriskoHomeMission && window.EuriskoHomeMission.nodes) || [
        {
            id: 'comprehensive-settlement',
            name: '综合所得汇算清缴',
            period: '次年3月1日 - 6月30日',
            startMonthDay: [3, 1],
            endMonthDay: [6, 30],
            description: '对上年度综合所得进行年度汇算，多退少补',
            type: 'settlement'
        },
        {
            id: 'business-settlement',
            name: '经营所得汇算清缴',
            period: '次年1月1日 - 3月31日',
            startMonthDay: [1, 1],
            endMonthDay: [3, 31],
            description: '对上年度经营所得进行年度汇算申报',
            type: 'settlement'
        },
        {
            id: 'business-half-reduction',
            name: '经营所得减半征收优惠',
            period: '2023.1.1 - 2027.12.31',
            startDate: new Date('2023-01-01'),
            endDate: new Date('2027-12-31'),
            description: '年应纳税所得额≤200万部分减按50%计入',
            type: 'policy'
        },
        {
            id: 'monthly-prepaid',
            name: '综合所得月度预缴申报',
            period: '每月15日前',
            dayOfMonth: 15,
            description: '扣缴义务人每月预扣预缴个人所得税',
            type: 'prepaid'
        },
        {
            id: 'business-quarterly-prepaid',
            name: '经营所得季度预缴申报',
            period: '季度结束后15日内',
            quarterEndDay: 15,
            description: '个体工商户季度预缴经营所得税',
            type: 'prepaid'
        }
    ];

    // ====== 数据：模式说明（info 按钮） ======
    const MODE_INFO = {
        forward: {
            title: '综合所得计税',
            icon: 'fa-calculator',
            color: 'primary',
            description: '工资薪金、劳务报酬、稿酬、特许权使用费合并计税，适用3%-45%七级超额累进税率。',
            suitable: '大多数个人用户（上班族、自由职业者等）',
            features: ['支持完整收入明细（工资/劳务/稿酬/特许权）', '年终奖单独计税或并入综合所得', '完整专项扣除与专项附加扣除', '生成标准化年度个税预算表']
        },
        business: {
            title: '经营所得计税',
            icon: 'fa-briefcase',
            color: 'accent',
            description: '个体工商户、个人独资企业、合伙企业生产经营所得，适用5%-35%五级超额累进税率。',
            suitable: '个体工商户、个人独资企业、合伙企业自然人合伙人',
            features: ['支持成本、费用、损失扣除', '享受减半征收优惠（≤200万部分）', '可选"是否有综合所得"避免重复扣除', '生成经营所得年度预算表']
        },
        classification: {
            title: '分类所得计税',
            icon: 'fa-list-alt',
            color: 'success',
            description: '利息股息红利、财产租赁、财产转让、偶然所得，统一适用20%比例税率。',
            suitable: '有投资收益、租金收入、资产转让、中奖等收入的用户',
            features: ['利息/股息/红利：全额计税', '财产租赁：≤4000减800，>4000减20%', '财产转让：减除财产原值和合理费用', '偶然所得：全额计税']
        },
        reverse: {
            title: '反向倒算',
            icon: 'fa-refresh',
            color: 'secondary',
            description: '给定目标（税率/月度税后/目标税额），反推所需的税前收入，支持保守/均衡/进取三档模式。',
            suitable: '财务人员、薪酬规划、薪资谈判参考',
            features: ['按目标税率倒算：了解税率档位对应的收入区间', '按月度税后倒算：设定到手目标反推税前', '按目标税额倒算：设定纳税目标反推收入', '三种模式对比：保守/均衡/进取']
        }
    };

    // ====== 数据：税务小贴士（配置化） ======
    const TAX_TIPS = [
        '年终奖可以选择"单独计税"或"并入综合所得计税"，两者税负可能不同，建议都测算一次取较低者。',
        '专项附加扣除需在个人所得税APP中据实填报，建议留存相关佐证材料备查。',
        '劳务报酬、稿酬、特许权使用费按80%折算计入综合所得（稿酬再按70%），实际税负比想象中低。',
        '经营所得年应纳税所得额不超过200万的部分，可享受减半征收优惠（至2027年底）。',
        '赡养老人扣除：独生子女每月3000元，非独生子女每月最高1500元。',
        '子女教育扣除：每个子女每月2000元，可选择由一方100%扣除或双方各50%扣除。',
        '住房租金与住房贷款利息不可同时享受，二选一。',
        '继续教育：学历教育每月400元（最长48个月），职业资格证书取得当年3600元。',
        '大病医疗扣除：自付超15000元部分，每年限额80000元，可在汇算时扣除。',
        '个人养老金每年缴纳上限12000元，可在综合所得中扣除，降低当期税负。'
    ];

    let currentTipIndex = 0;

    // ====== 工具函数 ======
    function pad(n) { return n < 10 ? '0' + n : '' + n; }

    function getTodayStr() {
        const d = new Date();
        return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
    }

    function getWeekdayStr() {
        const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        return weekdays[new Date().getDay()];
    }

    function getGreeting() {
        const h = new Date().getHours();
        if (h < 6) return '夜深了';
        if (h < 9) return '早上好';
        if (h < 12) return '上午好';
        if (h < 14) return '中午好';
        if (h < 18) return '下午好';
        if (h < 22) return '晚上好';
        return '夜深了';
    }

    // 判断当前日期是否在 [startMD, endMD] 之间（含端点）
    function isDateInRange(startMD, endMD) {
        const now = new Date();
        const m = now.getMonth() + 1, d = now.getDate();
        const startM = startMD[0], startD = startMD[1];
        const endM = endMD[0], endD = endMD[1];
        if (startM === endM) {
            return m === startM && d >= startD && d <= endD;
        }
        if (startM < endM) {
            return (m > startM && m < endM) || (m === startM && d >= startD) || (m === endM && d <= endD);
        }
        // 跨年情况（如 11月-次年2月）
        return (m > startM || (m === startM && d >= startD)) || (m < endM || (m === endM && d <= endD));
    }

    // 距离某个月日还有多少天（今年或明年）
    // base 可注入：日历是日期驱动的，纯建模函数要把「今天」传进来才测得动
    // （不传就是真实当前时间，既有调用点的行为不变）。
    function daysUntilMonthDay(monthDay, base) {
        const now = base || new Date();
        const year = now.getFullYear();
        let target = new Date(year, monthDay[0] - 1, monthDay[1]);
        let diff = Math.ceil((target - now) / (1000 * 60 * 60 * 24));
        if (diff < 0) {
            target = new Date(year + 1, monthDay[0] - 1, monthDay[1]);
            diff = Math.ceil((target - now) / (1000 * 60 * 60 * 24));
        }
        return diff;
    }

    // ====== 渲染：问候语 + 日期 ======
    function renderGreeting() {
        const greetingEl = document.getElementById('home-greeting');
        const dateEl = document.getElementById('home-date-text');
        if (greetingEl) greetingEl.textContent = `${getGreeting()} 👋`;
        if (dateEl) dateEl.textContent = `今天是 ${getTodayStr()} · ${getWeekdayStr()}`;
    }

    // ====== 渲染：今日税感（动态） ======
    function renderTaxFeel() {
        const container = document.getElementById('home-tax-feel-content');
        if (!container) return;

        const now = new Date();
        const m = now.getMonth() + 1, d = now.getDate();
        const reminders = [];

        // 1. 检查进行中的汇算清缴
        const compSettlement = TAX_NODES[0];
        if (isDateInRange(compSettlement.startMonthDay, compSettlement.endMonthDay)) {
            const endDiff = daysUntilMonthDay(compSettlement.endMonthDay);
            reminders.push({
                color: 'bg-success',
                text: `综合所得汇算清缴进行中（3/1-6/30）${endDiff <= 15 ? `，剩 ${endDiff} 天截止` : ''}`
            });
        }

        const bizSettlement = TAX_NODES[1];
        if (isDateInRange(bizSettlement.startMonthDay, bizSettlement.endMonthDay)) {
            const endDiff = daysUntilMonthDay(bizSettlement.endMonthDay);
            reminders.push({
                color: 'bg-success',
                text: `经营所得汇算清缴进行中（1/1-3/31）${endDiff <= 15 ? `，剩 ${endDiff} 天截止` : ''}`
            });
        }

        // 2. 经营所得减半优惠（长期政策，剩多久）
        const halfPolicy = TAX_NODES[2];
        const policyEndDiff = Math.ceil((halfPolicy.endDate - now) / (1000 * 60 * 60 * 24));
        if (policyEndDiff > 0 && policyEndDiff < 730) { // 2年内提示
            reminders.push({
                color: 'bg-warning',
                text: `经营所得减半优惠剩 ${policyEndDiff} 天（至 ${halfPolicy.period.split(' - ')[1]}）`
            });
        }

        // 3. 月度预缴申报（每月15日前）
        const monthlyNode = TAX_NODES[3];
        if (d <= 15) {
            const left = 15 - d;
            if (left <= 5) {
                reminders.push({
                    color: left <= 2 ? 'bg-danger' : 'bg-warning',
                    text: `本月综合所得预缴申报剩 ${left} 天（每月15日前）`
                });
            }
        }

        // 4. 经营所得季度预缴（季度末后15天内）
        const quarterEndMonths = [3, 6, 9, 12];
        const quarterEndDay = 15;
        quarterEndMonths.forEach(qm => {
            // 季度后的下个月 1-15 日为申报期
            const nextMonth = qm === 12 ? 1 : qm + 1;
            const nextYearOffset = qm === 12 ? 1 : 0;
            const checkYear = now.getFullYear() + nextYearOffset;
            if (now.getMonth() + 1 === nextMonth && now.getFullYear() === checkYear) {
                if (d <= quarterEndDay) {
                    const left = quarterEndDay - d;
                    if (left <= 5) {
                        reminders.push({
                            color: left <= 2 ? 'bg-danger' : 'bg-warning',
                            text: `经营所得季度预缴申报剩 ${left} 天（${nextMonth}月${quarterEndDay}日前）`
                        });
                    }
                }
            }
        });

        // 5. 如果没有任何提醒，显示一个默认友好提示
        if (reminders.length === 0) {
            reminders.push({
                color: 'bg-blue-400',
                text: '当前无紧急税务节点，是规划年度税负的好时机 ✨'
            });
        }

        // 限制最多3条
        const display = reminders.slice(0, 3);
        container.innerHTML = display.map(r => `
            <div class="flex items-start">
                <span class="tax-reminder-dot ${r.color}"></span>
                <span>${r.text}</span>
            </div>
        `).join('');
    }

    // ====== 渲染：Mission Hero（阶段19-2）======
    // 首屏那句话与那颗按钮由 home-mission.js 判定（首访 / 有历史 / 临近节点），这里只负责落 DOM。
    // 依赖缺失（home-mission.js 没加载、或 DOM 里没有 Hero 容器）时**静默跳过**，不弹错、不改其余卡片。
    function renderMission() {
        const titleEl = document.getElementById('home-mission-title');
        const subEl = document.getElementById('home-mission-subtitle');
        if (!titleEl && !subEl) return;
        const M = window.EuriskoHomeMission;
        if (!M || typeof M.detectMission !== 'function') return;

        const mission = M.detectMission({ history: readHistoryForMission() });
        if (titleEl) titleEl.textContent = mission.title;
        if (subEl) subEl.textContent = mission.subtitle;

        const cta = document.getElementById('home-mission-cta');
        const ctaText = document.getElementById('home-mission-cta-text');
        if (ctaText) ctaText.textContent = mission.cta.text;
        if (cta) {
            cta.setAttribute('data-mission-action', mission.cta.action);
            cta.setAttribute('data-mission-target', String(mission.cta.target || ''));
        }

        // 次要动作只在「有历史」态出现（换个方案对比 = 回到事件轴重新挑）
        const alt = document.getElementById('home-mission-alt');
        if (alt) {
            if (mission.altCta) {
                alt.textContent = mission.altCta.text + ' ›';
                alt.setAttribute('data-mission-action', mission.altCta.action);
                alt.setAttribute('data-mission-target', String(mission.altCta.target || ''));
                alt.classList.remove('hidden');
            } else {
                alt.classList.add('hidden');
            }
        }
    }

    // Mission 要读历史：优先内存镜像，兜底 localStorage（与 renderRecentCalculations 同一口径）
    function readHistoryForMission() {
        if (typeof syncCalculationHistoryFromStorage === 'function') {
            try { syncCalculationHistoryFromStorage(); } catch (e) { /* 测试环境可能没有，忽略 */ }
        }
        if (typeof calculationHistory !== 'undefined' && Array.isArray(calculationHistory)) {
            return calculationHistory;
        }
        try {
            const list = JSON.parse(localStorage.getItem('taxCalculationHistory') || '[]');
            return Array.isArray(list) ? list : [];
        } catch (e) {
            return [];
        }
    }

    // Hero 的 CTA：只有两种动作 —— 滚到事件轴 / 打开上次那条记录
    function setupMissionCta() {
        const bind = function (el) {
            if (!el) return;
            el.addEventListener('click', function () {
                const action = this.getAttribute('data-mission-action');
                const target = this.getAttribute('data-mission-target');
                if (action === 'scroll') {
                    const anchor = document.getElementById(target || 'home-event-rail');
                    if (anchor && typeof anchor.scrollIntoView === 'function') {
                        anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                    return;
                }
                if (action === 'open-last' && target && typeof viewHistoryRecord === 'function') {
                    viewHistoryRecord(target);
                }
            });
        };
        bind(document.getElementById('home-mission-cta'));
        bind(document.getElementById('home-mission-alt'));
    }

    // ====== 渲染：上轴 · 事件卡「我遇到了什么事」（阶段19-2）======
    // 数据是生活语言（不发年终奖→bonus-tax），渲染成横向滑动卡片组；**任何断点都不折叠**。
    function renderEventRail() {
        const rail = document.getElementById('home-event-rail');
        if (!rail) return;
        const M = window.EuriskoHomeMission;
        const cards = M && Array.isArray(M.eventCards) ? M.eventCards : [];
        if (!cards.length) return;

        rail.innerHTML = cards.map(c => `
            <button type="button" class="event-card" data-event="${c.id}" data-tool="${c.target}"
                    data-alt-tool="${c.altTarget || ''}" data-decide="${c.decide ? '1' : ''}">
                <div class="event-card__title"><i class="fa ${c.icon} text-primary mr-2"></i>${c.title}</div>
                <div class="event-card__hint">${c.desc}</div>
                <div class="mt-2 text-xs text-primary">${c.decide ? '先判定，再算 ›' : '去算 ›'}</div>
            </button>
        `).join('');

        rail.querySelectorAll('.event-card').forEach(btn => {
            btn.addEventListener('click', function () {
                openEventTarget(this.getAttribute('data-tool'),
                    this.getAttribute('data-alt-tool'),
                    this.getAttribute('data-decide') === '1');
            });
        });
    }

    // 打开事件卡落到哪个工具：第 8 张（开店 / 私活）先问一句再进 —— 劳务报酬与经营所得的
    // 口径完全不同，猜错就是算错，这是自由职业者最大的断点（plan §3.3.3）
    function openEventTarget(toolId, altToolId, needDecide) {
        const open = function (id) {
            if (!id) return;
            if (window.EuriskoToolbox && typeof window.EuriskoToolbox.openTool === 'function') {
                window.EuriskoToolbox.openTool(id);
            }
        };
        if (needDecide && typeof showConfirm === 'function') {
            showConfirm(
                '这笔收入更接近哪一种？算错口径，结果会差很多。\n\n· 按次结算、对方代扣（劳务报酬）\n· 持续经营、自负盈亏（经营所得）',
                function () { open(toolId); },      // 确定 → 劳务报酬
                function () { open(altToolId); }    // 取消 → 经营所得
            );
            return;
        }
        open(toolId);
    }

    // ====== 渲染：我的税务资产（阶段19-2）======
    // 只给回访用户看：待办与截止（税务日历 × 已保存测算）+ 今年税负概览（≥2 次测算才出现）。
    function renderAssets() {
        const card = document.getElementById('home-assets-card');
        const box = document.getElementById('home-assets-list');
        if (!card || !box) return;
        const M = window.EuriskoHomeMission;
        if (!M) return;

        const history = readHistoryForMission();
        const todos = M.buildTodos({ history });
        const overview = M.buildYearOverview(history);
        const yearEl = document.getElementById('home-assets-year');
        if (yearEl) yearEl.textContent = `${overview.year} 年`;

        const parts = [];

        todos.forEach(t => {
            const days = t.daysLeft > 0 ? `剩 ${t.daysLeft} 天` : '今天截止';
            parts.push(`
                <div class="flex items-center gap-2">
                    <i class="fa fa-clock-o ${t.daysLeft <= 7 ? 'text-danger' : 'text-primary'}"></i>
                    <span class="flex-1 truncate">${t.name}</span>
                    <span class="text-xs text-gray-500">${t.deadline}</span>
                    <span class="text-xs ${t.daysLeft <= 7 ? 'text-danger' : 'text-gray-500'}">${days}</span>
                </div>
            `);
        });

        if (overview.visible) {
            const bars = overview.items.slice(0, 4).map(x => `
                <div class="flex items-center gap-2">
                    <span class="text-xs text-gray-500 w-20 truncate">${x.name}</span>
                    <span class="progress-line flex-1"><span class="progress-line__fill" style="width:${x.pct}%"></span></span>
                    <span class="text-xs text-gray-500">¥${x.tax.toFixed(0)}</span>
                </div>
            `).join('');
            parts.push(`
                <div class="mt-1">
                    <div class="text-xs text-gray-500 mb-1">今年已测算的税额构成（共 ¥${overview.total.toFixed(0)}）</div>
                    ${bars}
                </div>
            `);
        }

        if (!parts.length) {
            card.classList.add('hidden');
            box.innerHTML = '';
            syncTodoCard();   // 待办段空了，整张「接下来要办」可能该收起
            return;
        }
        card.classList.remove('hidden');
        box.innerHTML = parts.join('');
        syncTodoCard();
    }

    /**
     * 「接下来要办」这张壳的显隐（阶段20 P1 · ④）：三段（待办 / 截止 / 漏填）**全空就整卡不出现**。
     * 判定只问「子块是不是还挂着 hidden」—— 不重复任何一段自己的判定逻辑
     * （待办要不要出、漏填要不要出，各自的渲染函数已经算过一遍，再算第二遍必然长出第二套口径）。
     * 新客因此看到的是干净首页，不是一张「你漏了 5 项」的空壳。
     */
    function syncTodoCard() {
        var card = document.getElementById('home-todo-card');
        if (!card) return;
        var blocks = ['home-assets-card', 'home-calendar-section', 'home-missing-card'];
        var any = blocks.some(function (id) {
            var el = document.getElementById(id);
            return !!el && !el.classList.contains('hidden');
        });
        card.classList.toggle('hidden', !any);
    }

    // ====== 渲染：漏填提醒（阶段19-2 遗留 · §3.3 ④）======
    // 判定不自己写：completeness（漏了哪几项）与 shouldNudge（尊重「暂不」）都在 tax-profile.js 里，
    // 首页只负责落 DOM —— 与结果页引导卡共用同一份判定，不会两边各长一套口径（19-5b 的教训）。
    //
    // 出口为什么开**速算器**而不是跳「我的 → 我的情况」：那张编辑卡在 profile 页（要登录），
    // 而免登录可直接算是本站的主线；算一遍对应工具既能把值补上（tax-profile.absorb 会吸回档案），
    // 也不必再写第二套补档案的表单。
    var MISSING_TOOL_OF = {
        identity: null,          // 身份没有"补填工具"：滚到首页身份卡组，挑一个当默认视角
        city: 'social-base',     // 城市决定社保基数 → 社保公积金
        social: 'social-base',
        deductions: 'special-deduction',
        bonus: 'bonus-tax'
    };

    function missingLib() {
        var L = window.EuriskoTaxProfile;
        return (L && L.pure && typeof L.pure.completeness === 'function') ? L : null;
    }

    /**
     * 纯建模：档案 → 这张卡该不该出、漏了哪几项、出口开哪个工具。
     * 只说**漏了什么**，**不含任何金额** —— 漏项能省多少钱取决于几个子女 / 怎么分摊，
     * 不知道还硬算，算出来的「可能多缴 ¥1,200」就是假的（与省钱卡同一条规矩）。
     */
    function buildMissingModel(profile) {
        var none = {
            visible: false, percent: 0, filled: 0, total: 0,
            missing: [], first: null, cta: null, deductionMissed: false
        };
        var L = missingLib();
        if (!L || !profile) return none;
        var c = L.pure.completeness(profile);
        // 「暂不」是永久的（19-5）：用户在结果页说过别再提，首页换个地方再提就是骚扰
        if (typeof L.shouldNudge === 'function' && !L.shouldNudge()) return none;
        // 一项都没填的新客：提醒"你漏了 5 项"是噪音（那是结果页引导卡的活）；全填完也不占位
        if (!(c.filled > 0) || !c.missing.length) return none;

        var first = c.missing[0];
        var toolId = MISSING_TOOL_OF[first.key] || null;
        return {
            visible: true,
            percent: c.percent,
            filled: c.filled,
            total: c.total,
            missing: c.missing.map(function (it) { return { key: it.key, label: it.label }; }),
            first: { key: first.key, label: first.label },
            cta: toolId
                ? { action: 'tool', target: toolId, text: '去补填：' + first.label }
                : { action: 'scroll', target: 'home-scenarios', text: '挑一个身份当默认视角' },
            deductionMissed: c.missing.some(function (it) { return it.key === 'deductions'; })
        };
    }

    function renderMissing() {
        var card = document.getElementById('home-missing-card');
        var box = document.getElementById('home-missing-body');
        if (!card || !box) return;
        var L = missingLib();
        var model = buildMissingModel(L ? L.get() : null);
        var progress = document.getElementById('home-missing-progress');

        if (!model.visible) {
            card.classList.add('hidden');
            box.innerHTML = '';
            if (progress) progress.textContent = '';
            syncTodoCard();   // 漏填段收起后，整张「接下来要办」可能也该收起
            return;
        }

        card.classList.remove('hidden');
        if (progress) progress.textContent = '我的情况 ' + model.filled + '/' + model.total;
        box.innerHTML =
            '<p class="whoami-hint">这几项还没填，测算会按「没享受」的口径算 —— 可能多缴。' +
            '补全后下次测算自动带上，不用每次重填一遍。</p>' +
            (model.deductionMissed
                ? '<p class="whoami-hint">专项附加扣除最容易漏 —— 它直接减少应纳税所得额。</p>'
                : '') +
            '<div class="home-missing-chips">' + model.missing.map(function (m) {
                return '<span class="profile-chip home-missing-chip">' + m.label + '</span>';
            }).join('') + '</div>' +
            '<div class="home-missing-actions">' +
            '<button type="button" class="btn btn-primary home-missing-cta" data-action="' + model.cta.action +
            '" data-target="' + model.cta.target + '">' + model.cta.text + '</button>' +
            '</div>';
        syncTodoCard();
    }

    // 卡内内容每次重画，事件绑在卡片上（委托）——绑在按钮上会随重画丢掉
    function setupMissingCta() {
        var card = document.getElementById('home-missing-card');
        if (!card || card.getAttribute('data-missing-bound') === '1') return;
        card.setAttribute('data-missing-bound', '1');
        card.addEventListener('click', function (e) {
            var btn = e.target.closest('.home-missing-cta');
            if (!btn) return;
            var action = btn.getAttribute('data-action');
            var target = btn.getAttribute('data-target');
            if (action === 'tool') {
                if (window.EuriskoToolbox && typeof window.EuriskoToolbox.openTool === 'function') {
                    window.EuriskoToolbox.openTool(target);
                }
                return;
            }
            var anchor = document.getElementById(target || '');
            if (anchor && typeof anchor.scrollIntoView === 'function') {
                anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    }

    // ====== 渲染：我的方案 / 台账（阶段19-2 遗留清偿④ · §3.3.5 ①）======
    // 「最近计算」是一次性流水：算完往历史里一扔，下次打开首页它还是"上次算了个什么"，
    // 看不出**存了几套方案、这个月办到哪一步**。这一段补的就是这两层资产心智。
    //
    // 两条规矩（与漏填提醒卡同一套）：
    //   ① **零感知**：没存过方案 / 没有台账行 → 整段不出现，新客看到的还是原来那张流水卡；
    //   ② **出口必须是真出口**：方案 → 方案库弹窗（scenario-ui 的 openLibrary），
    //      台账 → 已有台账弹窗（entity-ui 的 openLedger）。段里不出现点了没反应的东西。

    // 本文件原先没有转义函数：卡片文案都走的模板字符串。方案名与主体名是**用户自己起的**，
    // 拼进 innerHTML 之前必须转义（名字里带个 < 就把卡片结构吃掉了）。
    function esc(s) {
        return String(s === undefined || s === null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // 千分位自己写：toLocaleString 的产出随运行环境 ICU 变，断言会跟着飘。
    function money(n) {
        var v = Math.round(Number(n) || 0);
        return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    function planLib() {
        return (typeof window !== 'undefined') ? window.EuriskoScenarios : null;
    }
    function ledgerLib() {
        return (typeof window !== 'undefined') ? window.EuriskoLedger : null;
    }
    function entityLib() {
        return (typeof window !== 'undefined') ? window.EuriskoEntities : null;
    }

    // 方案的「可比数额」：取两套方案**共有**的指标里那条像税额的
    // （年度应纳税额 / 应纳增值税 / 应补税额 …），取不到就不说差额 —— 不猜、不补 0。
    //
    // v1.98.0 之前只看 summary.taxTotal，那是综合所得独有的字段：速算器存进来的方案
    // 一句差额都说不出。现在任何工具都能存（方案按自己的口径存指标），所以这里改成
    // 先看两套口径对不对得上（compareRows 取交集），再决定拿哪一行做差。
    function diffRowOf(list) {
        var SUI = (typeof window !== 'undefined') ? window.EuriskoScenarioUI : null;
        if (!SUI || !SUI.pure || typeof SUI.pure.compareRows !== 'function') return null;
        var cmp = SUI.pure.compareRows(list);
        if (!cmp || !cmp.comparable || !cmp.rows || !cmp.rows.length) return null;

        var money = cmp.rows.filter(function (r) {
            return r.kind === 'money'
                && r.cells.every(function (v) { return typeof v === 'number' && isFinite(v); });
        });
        if (!money.length) return null;
        // 只认税额类：说「差 ¥X」却不说是差在哪一项上，等于让人自己猜比的是什么
        var taxLike = money.filter(function (r) { return /应纳|税额|应缴|实缴|应补|应退|补缴/.test(r.label); });
        return taxLike.length ? taxLike[0] : null;
    }

    /**
     * 纯建模：方案列表 → 这一行该说什么。
     * 只报**存了几套**与**差额**，不评价哪套好（那是对比表里"最优"标签的活，
     * 首页没有列出所有指标，标"最优"就是拿一半信息下结论）。
     */
    function buildPlanModel(list, isPro) {
        var lib = planLib();
        var limit = (lib && typeof lib.limitFor === 'function')
            ? lib.limitFor(!!isPro)
            : (isPro ? 10 : 2);
        var items = Array.isArray(list) ? list : [];
        if (!items.length) return { visible: false, count: 0, limit: limit, full: false, diff: null };

        var diff = null;
        if (items.length >= 2) {
            // 两套方案的指标要对得上才比：跨工具（交集为空）时硬凑一个差额，
            // 减出来的数字能算，但那个差没有意义 —— 那就是拿假结论冒充对比。
            var row = diffRowOf(items);
            if (row) {
                var pairs = items.map(function (s, i) {
                    return { name: (s && s.name) || '未命名方案', tax: Number(row.cells[i]) };
                }).filter(function (x) { return isFinite(x.tax); });
                if (pairs.length >= 2) {
                    pairs.sort(function (a, b) { return b.tax - a.tax; });
                    var hi = pairs[0];
                    var lo = pairs[pairs.length - 1];
                    // 两套税额一样时不说"差 ¥0"（那句听着像坏了），说"税额相同"
                    diff = { hi: hi.name, lo: lo.name, amount: Math.abs(hi.tax - lo.tax), same: hi.tax === lo.tax };
                }
            }
        }
        return {
            visible: true,
            count: items.length,
            limit: limit,
            full: items.length >= limit,
            isPro: !!isPro,
            diff: diff
        };
    }

    /**
     * 纯建模：台账行 → 这一行该说什么。只说最近一个期间（台账的默认视图就是"这个月"）。
     * 未申报 = 状态没走到「已申报」的行数（含"已算""已导出"）—— 它是**办到哪一步**，
     * 不是"逾期"：系统不催任何人，也没有逾期这一天的数据。
     */
    function buildLedgerModel(groups, nameOfEntity) {
        var list = Array.isArray(groups) ? groups : [];
        var g = list.filter(function (x) { return x && x.rows && x.rows.length; })[0];
        if (!g) return { visible: false, total: 0, undeclared: 0, entityName: '' };

        var undeclared = g.rows.filter(function (r) { return r.status !== 'filed'; }).length;
        // 主体名只在**这一格每一行都归到同一个主体**时才说：
        // 混着"不按主体"的行时，报出的那个名字只覆盖了其中几条 —— 那就是拿一半信息冒充全部。
        var ids = {};
        g.rows.forEach(function (r) { if (r.entityId) ids[r.entityId] = true; });
        var keys = Object.keys(ids);
        var allSame = g.rows.length > 0 && keys.length === 1
            && g.rows.every(function (r) { return !!r.entityId; });
        var entityName = (allSame && typeof nameOfEntity === 'function')
            ? (nameOfEntity(keys[0]) || '') : '';

        return {
            visible: true,
            label: g.label || '',
            total: g.rows.length,
            undeclared: undeclared,
            entityName: entityName
        };
    }

    function renderPlans() {
        var box = document.getElementById('home-plans-box');
        if (!box) return;

        var isPro = false;
        var planUIMaybe = (typeof window !== 'undefined') ? window.EuriskoScenarioUI : null;
        if (planUIMaybe && typeof planUIMaybe.getIsPro === 'function') {
            try { isPro = !!planUIMaybe.getIsPro(); } catch (e) { isPro = false; }
        }

        var parts = [];

        var SL = planLib();
        var plan = buildPlanModel(SL && typeof SL.list === 'function' ? SL.list() : [], isPro);
        if (plan.visible) {
            // 上限照实说（免费 2/2 已用满）。**不挂升级按钮** —— 升级入口全局只有顶栏 pill
            // 与个人中心两处（19-6b 定下的纪律），这里再长一颗就是第三处。
            // PAY-09：不再括注「专业版 10 套」—— 那是档位营销；额度照实说即可
            var quota = '已存 ' + plan.count + '/' + plan.limit + ' 套';
            var diffText = '';
            if (plan.diff) {
                diffText = plan.diff.same
                    ? ' · ' + esc(plan.diff.hi) + ' / ' + esc(plan.diff.lo) + ' 税额相同'
                    : ' · ' + esc(plan.diff.hi) + ' / ' + esc(plan.diff.lo) + ' 差 ¥' + money(plan.diff.amount);
            }
            parts.push(
                '<div class="plans-row">' +
                '<span class="plans-row-main">' +
                '<span class="plans-title"><i class="fa fa-columns mr-1.5"></i>方案对比</span>' +
                '<span class="plans-meta">' + esc(quota) + diffText + '</span>' +
                '</span>' +
                '<button type="button" class="plans-go" data-plans-open="library">看对比 ›</button>' +
                '</div>'
            );
        }

        var LL = ledgerLib();
        if (LL && typeof LL.visibleRows === 'function') {
            var groups = (typeof LL.groupByPeriod === 'function') ? LL.groupByPeriod(LL.visibleRows()) : [];
            var EL = entityLib();
            var nameOf = function (id) {
                if (!EL || typeof EL.byId !== 'function') return '';
                var e = EL.byId(id);
                return e ? (e.name || '') : '';
            };
            var led = buildLedgerModel(groups, nameOf);
            if (led.visible) {
                var meta = esc(led.label) + ' · 已算 ' + led.total + ' 条'
                    + (led.undeclared ? ' · ' + led.undeclared + ' 条未申报' : ' · 都已申报')
                    + (led.entityName ? ' · ' + esc(led.entityName) : '');
                parts.push(
                    '<div class="plans-row">' +
                    '<span class="plans-row-main">' +
                    '<span class="plans-title"><i class="fa fa-book mr-1.5"></i>台账</span>' +
                    '<span class="plans-meta">' + meta + '</span>' +
                    '</span>' +
                    '<button type="button" class="plans-go" data-plans-open="ledger">我的台账 ›</button>' +
                    '</div>'
                );
            }
        }

        var label = document.getElementById('home-plans-recent-label');
        if (!parts.length) {
            box.classList.add('hidden');
            box.innerHTML = '';
            // 没有那两段时，下面就是整张卡唯一的列表 —— 再加一句「最近算过」是废话
            if (label) label.classList.add('hidden');
            return;
        }
        box.classList.remove('hidden');
        box.innerHTML = parts.join('');
        if (label) label.classList.remove('hidden');

        box.querySelectorAll('[data-plans-open]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var what = this.getAttribute('data-plans-open');
                if (what === 'library') {
                    var SUI = window.EuriskoScenarioUI;
                    if (SUI && typeof SUI.openLibrary === 'function') SUI.openLibrary();
                } else if (what === 'ledger') {
                    var EUI = window.EuriskoEntityUI;
                    if (EUI && typeof EUI.openLedger === 'function') EUI.openLedger();
                }
            });
        });
    }

    // ====== 渲染：最近计算（横向滑动） ======
    function renderRecentCalculations() {
        const container = document.getElementById('home-recent-list');
        if (!container) return;

        // 每次渲染先从 localStorage 同步内存镜像（data-management.js 提供；测试环境可能未加载则跳过）
        if (typeof syncCalculationHistoryFromStorage === 'function') {
            syncCalculationHistoryFromStorage();
        }

        // 优先用全局 calculationHistory（data-management.js 维护），兜底直接读 localStorage
        let history = [];
        if (typeof calculationHistory !== 'undefined' && Array.isArray(calculationHistory)) {
            history = calculationHistory;
        } else {
            try {
                history = JSON.parse(localStorage.getItem('taxCalculationHistory') || '[]');
            } catch (e) {
                history = [];
            }
        }

        if (history.length === 0) {
            container.innerHTML = `
                <div class="home-empty-state w-full">
                    <i class="fa fa-inbox"></i>
                    <p>还没有计算记录</p>
                    <span class="empty-hint">
                        <i class="fa fa-arrow-up text-[10px] mr-1"></i>从上方选择模式开始
                    </span>
                </div>
            `;
            container.style.flexWrap = 'wrap';
            return;
        }
        container.style.flexWrap = '';

        // 按时间倒序，最多 3 条（阶段20 P1 · ⑥）：首页这一块只回答「接着上次算哪个」，
        // 3 条够覆盖「上次那个」；再多就是清单，清单归「我的 → 计算历史」（卡头那颗「全部 ›」）。
        const sorted = [...history].sort((a, b) => {
            const da = new Date(a.date || a.created_at || 0);
            const db = new Date(b.date || b.created_at || 0);
            return db - da;
        }).slice(0, 3);

        const typeMap = {
            comprehensive: { name: '综合所得', icon: 'fa-calculator', color: 'text-primary' },
            business: { name: '经营所得', icon: 'fa-briefcase', color: 'text-accent' },
            classification: { name: '分类所得', icon: 'fa-list-alt', color: 'text-success' },
            reverse: { name: '反向倒算', icon: 'fa-refresh', color: 'text-secondary' },
            // 20 个单页速算器保存的结果（toolbox-ui 写入 type: 'quick'）
            quick: { name: '速算器', icon: 'fa-bolt', color: 'text-primary' }
        };

        container.innerHTML = sorted.map(item => {
            const type = typeMap[item.type] || typeMap.comprehensive;
            const date = new Date(item.date || item.created_at || Date.now());
            const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;
            // 兼容新旧数据结构取税额
            const tax = item.results?.taxDetails?.totalTax || item.results?.totalTax || item.result_data?.taxDetails?.totalTax || item.result_data?.totalTax || 0;
            const taxStr = parseFloat(tax) ? `¥${parseFloat(tax).toFixed(0)}` : '—';
            const title = item.title || type.name;

            return `
                <div class="recent-card" data-history-id="${item.id}">
                    <div class="flex items-center mb-2">
                        <i class="fa ${type.icon} ${type.color} mr-2"></i>
                        <span class="text-xs font-medium text-gray-700">${type.name}</span>
                        <span class="ml-auto text-xs text-gray-500">${dateStr}</span>
                    </div>
                    <div class="text-xs text-gray-500 mb-1 truncate">${title}</div>
                    <div class="text-sm font-bold text-primary">应纳税 ${taxStr}</div>
                </div>
            `;
        }).join('');

        // 绑定点击：查看该记录
        container.querySelectorAll('.recent-card').forEach(card => {
            card.addEventListener('click', function () {
                const id = this.getAttribute('data-history-id');
                if (typeof viewHistoryRecord === 'function') {
                    viewHistoryRecord(id);
                }
            });
        });
    }

    // ====== 渲染：截止段（原「税务提醒」卡，阶段20 P1 收编进「接下来要办」）======
    // 关键口径改动：**只列 90 天内到期的节点**。
    // 旧实现里「经营所得减半优惠截止 2027/12/31」永远存在（剩 400+ 天），
    // 结果就是这张卡**永远在、也永远没人看** —— 一条一年后才到期的节点占着「接下来要办」的第一行，
    // 等于把待办区变成了装饰。90 天是「还来得及安排」的量级，更远的节点不进待办。
    // 判定抽成纯函数（buildCalendarItems(now)）是为了单测能直接问「这天该出哪几条」，
    // 不必靠改系统时间或等某个月份才能测。
    const CALENDAR_HORIZON_DAYS = 90;

    function buildCalendarItems(now) {
        const items = [];

        // 本月剩余的税务节点
        const currentMonth = now.getMonth() + 1;
        const today = now.getDate();

        // 月度预缴：每月15日
        if (currentMonth && today <= 15) {
            items.push({
                date: `${currentMonth}/15`,
                name: '综合所得月度预缴申报',
                color: 'bg-blue-400',
                daysLeft: 15 - today
            });
        }

        // 季度预缴：季度后下个月15日前
        const quarterMonths = [1, 4, 7, 10]; // 申报月
        if (quarterMonths.includes(currentMonth) && today <= 15) {
            items.push({
                date: `${currentMonth}/15`,
                name: '经营所得季度预缴申报',
                color: 'bg-orange-400',
                daysLeft: 15 - today
            });
        }

        // 汇算清缴节点（按月日判断）
        if (currentMonth >= 3 && currentMonth <= 6) {
            items.push({
                date: '6/30',
                name: '综合所得汇算清缴截止',
                color: 'bg-success',
                daysLeft: daysUntilMonthDay([6, 30], now)
            });
        }
        if (currentMonth >= 1 && currentMonth <= 3) {
            items.push({
                date: '3/31',
                name: '经营所得汇算清缴截止',
                color: 'bg-success',
                daysLeft: daysUntilMonthDay([3, 31], now)
            });
        }

        // 经营所得减半优惠截止（2027/12/31）：离得远，正常情况下进不了 90 天窗口，
        // 到 2027 年秋天它才会自己冒出来 —— 那时它才是「接下来要办」的事。
        items.push({
            date: '2027/12/31',
            name: '经营所得减半优惠截止',
            color: 'bg-warning',
            daysLeft: Math.ceil((new Date('2027-12-31') - now) / (1000 * 60 * 60 * 24))
        });

        return items
            .filter(it => it.daysLeft <= CALENDAR_HORIZON_DAYS)   // 远期节点不占待办位
            .sort((a, b) => a.daysLeft - b.daysLeft)
            .slice(0, 4);
    }

    function renderTaxCalendar() {
        const container = document.getElementById('home-calendar-list');
        if (!container) return;
        const section = document.getElementById('home-calendar-section');
        const items = buildCalendarItems(new Date());

        if (!items.length) {
            container.innerHTML = '';
            if (section) section.classList.add('hidden');
            syncTodoCard();
            return;
        }
        if (section) section.classList.remove('hidden');

        container.innerHTML = items.map(item => {
            const daysText = item.daysLeft > 0 ? `剩 ${item.daysLeft} 天` : '今天截止';
            const urgencyColor = item.daysLeft <= 7 ? 'text-danger' : (item.daysLeft <= 30 ? 'text-warning' : 'text-gray-500');
            return `
                <div class="tax-reminder-item">
                    <span class="tax-reminder-dot ${item.color}"></span>
                    <div class="flex-1 min-w-0">
                        <div class="text-sm text-gray-700 truncate">${item.name}</div>
                        <div class="text-xs text-gray-500">${item.date}</div>
                    </div>
                    <span class="text-xs ${urgencyColor} font-medium ml-2 flex-shrink-0">${daysText}</span>
                </div>
            `;
        }).join('');
        syncTodoCard();
    }

    // ====== 渲染：税务小贴士 ======
    function renderTaxTip() {
        const container = document.getElementById('home-tip-content');
        if (!container) return;
        const tip = TAX_TIPS[currentTipIndex % TAX_TIPS.length];
        container.innerHTML = `
            <div class="flex items-start">
                <i class="fa fa-quote-left text-yellow-400 mr-2 mt-0.5"></i>
                <span class="flex-1">${tip}</span>
            </div>
        `;
    }

    // ====== 模式说明弹窗 ======
    function showModeInfo(mode) {
        const info = MODE_INFO[mode];
        if (!info) return;

        // 兜底：浏览器 alert
        if (typeof showAlert !== 'function') {
            const featuresStr = info.features.map(f => `• ${f}`).join('\n');
            alert(`${info.title}\n\n${info.description}\n\n适用人群：${info.suitable}\n\n功能特点：\n${featuresStr}`);
            return;
        }

        // 用 showAlert 打开模态框（占位消息），随后用 innerHTML 注入富文本
        showAlert(info.description, 'info');

        const titleEl = document.getElementById('alert-modal-title');
        const msgEl = document.getElementById('alert-modal-message');
        if (titleEl) titleEl.textContent = info.title;
        if (msgEl) {
            const featuresHtml = info.features.map(f =>
                `<li class="flex items-start mb-1.5"><i class="fa fa-check-circle text-success mt-0.5 mr-2 text-xs"></i><span>${f}</span></li>`
            ).join('');
            msgEl.innerHTML = `
                <div class="text-left">
                    <div class="flex items-center mb-3">
                        <div class="tip-icon-wrapper w-10 h-10 rounded-lg flex items-center justify-center mr-3">
                            <i class="tip-icon fa ${info.icon}"></i>
                        </div>
                        <span class="text-base font-bold text-gray-800">${info.title}</span>
                    </div>
                    <p class="text-sm text-gray-600 mb-3 leading-relaxed">${info.description}</p>
                    <div class="bg-gray-50 rounded-lg p-3 mb-3">
                        <div class="text-xs text-gray-500 mb-1">适用人群</div>
                        <div class="text-sm text-gray-700">${info.suitable}</div>
                    </div>
                    <div>
                        <div class="text-xs text-gray-500 mb-2">功能特点</div>
                        <ul class="text-sm text-gray-700">${featuresHtml}</ul>
                    </div>
                </div>
            `;
        }
    }

    // ====== 绑定模式卡片点击 ======
    function setupModeCards() {
        const cardBtnMap = {
            'forward-mode-card': 'forward-mode-btn',
            'business-mode-card': 'business-mode-btn',
            'classification-mode-card': 'classification-mode-btn',
            'reverse-mode-card': 'reverse-mode-btn'
        };

        Object.entries(cardBtnMap).forEach(([cardId, btnId]) => {
            const card = document.getElementById(cardId);
            if (!card) return;
            card.addEventListener('click', function (e) {
                // 如果点击的是 info 按钮，则不触发导航
                if (e.target.closest('.mode-card-info-btn')) {
                    return;
                }
                const btn = document.getElementById(btnId);
                if (btn) btn.click();
            });
        });

        // info 按钮
        document.querySelectorAll('.mode-card-info-btn').forEach(btn => {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                const mode = this.getAttribute('data-mode-info');
                showModeInfo(mode);
            });
        });
    }

    // ====== 绑定其他交互 ======
    function setupInteractions() {
        // 换一条小贴士
        const nextTipBtn = document.getElementById('home-next-tip');
        if (nextTipBtn) {
            nextTipBtn.addEventListener('click', function () {
                currentTipIndex++;
                renderTaxTip();
            });
        }

        // 查看全部历史
        const viewAllBtn = document.getElementById('home-view-all-history');
        if (viewAllBtn) {
            viewAllBtn.addEventListener('click', function (e) {
                e.preventDefault();
                if (typeof showPage === 'function') {
                    showPage('profile-page');
                    // 尝试触发历史卡片点击
                    setTimeout(() => {
                        const historyCard = document.getElementById('profile-card-history');
                        if (historyCard) historyCard.click();
                    }, 300);
                }
            });
        }

        // 品牌Logo点击回首页
        const brandLink = document.getElementById('brand-home-link');
        if (brandLink) {
            brandLink.addEventListener('click', function () {
                if (typeof showPage === 'function') {
                    showPage('mode-selection-page');
                }
            });
        }
    }

    // ====== 主初始化 ======
    function initHome() {
        const renderStart = performance.now();
        HomePerf.measure('initHome → 渲染问候语与日期', renderGreeting);
        HomePerf.measure('initHome → 渲染今日税感', renderTaxFeel);
        HomePerf.measure('initHome → 渲染我的方案 / 台账', renderPlans);
        HomePerf.measure('initHome → 渲染最近计算', renderRecentCalculations);
        HomePerf.measure('initHome → 渲染税务日历', renderTaxCalendar);
        HomePerf.measure('initHome → 渲染税务小贴士', renderTaxTip);
        // 阶段19-2：首屏 Mission（三态判定）+ 上轴事件卡 + 我的税务资产
        HomePerf.measure('initHome → 渲染 Mission Hero', renderMission);
        HomePerf.measure('initHome → 渲染事件卡上轴', renderEventRail);
        HomePerf.measure('initHome → 渲染我的税务资产', renderAssets);
        HomePerf.measure('initHome → 渲染漏填提醒', renderMissing);
        // 三段各自渲染时都会调 syncTodoCard，这里再兜一次：顺序依赖（例如截止段先跑、
        // 待办段后跑）不会让壳的显隐停在中间态
        syncTodoCard();
        HomePerf.log('initHome → 渲染总耗时', performance.now() - renderStart, { steps: 9 });

        setupMissionCta();
        setupMissingCta();
        setupModeCards();
        setupInteractions();

        // 档案在别处被补了一项，首页这张卡要跟着少一项 —— 否则还挂着已经补上的项，等于骗人
        var profileLib = missingLib();
        if (profileLib && typeof profileLib.onChange === 'function') {
            profileLib.onChange(renderMissing);
        }
    }

    // 保存计算后刷新首页（阶段19-2 扩展）：除了最近计算，还要刷新 Mission 与资产 ——
    // 「首访 → 有历史」的切换就发生在保存之后，只刷最近计算会留下一个还在问「你今年要交多少税」的过期首屏。
    // 阶段19-10a：这里原本还顺手刷一下首页「最近使用」卡（调的是 refreshRecentTools）。
    // 那个函数全仓**没有定义** —— typeof 判空让它永远安静地跳过，卡也因此从来不刷新。
    // 卡已随入口清理撤掉（同一份数据在工具页第一组），这段一并删，不留假接线。
    function refreshHomeRecent() {
        renderPlans();             // 存了方案 / 归档了台账，这两行要跟着变
        renderRecentCalculations();
        renderMission();
        renderAssets();
        renderTaxCalendar();  // 归档/存方案不会改日期，但漏了它「接下来要办」的壳就不会重算
        renderMissing();   // 算完可能刚补上一项，这张卡的漏项要跟着变
        syncTodoCard();
    }

    // 暴露到全局
    window.initHome = initHome;
    window.refreshHomeRecent = refreshHomeRecent; // 保存计算后可调用刷新
    window.renderEventRail = renderEventRail;
    window.renderMission = renderMission;
    window.renderAssets = renderAssets;
    window.renderMissing = renderMissing;
    window.renderPlans = renderPlans;
    window.renderTaxCalendar = renderTaxCalendar;
    window.syncTodoCard = syncTodoCard;
    // 截止段同款套路：建模是纯函数（单测直接问「这天该出哪几条」），渲染只负责落 DOM
    window.EuriskoHomeCalendar = {
        pure: { buildCalendarItems: buildCalendarItems, HORIZON_DAYS: CALENDAR_HORIZON_DAYS }
    };
    // 判定的纯函数单独导出：单测可以只问「该不该出卡、出口开哪个」，不必拼一整个首页
    window.EuriskoHomeMissing = {
        pure: { buildMissingModel: buildMissingModel, MISSING_TOOL_OF: MISSING_TOOL_OF },
        render: renderMissing
    };
    // 同一套路：建模是纯函数（单测直接问「该说什么」），渲染只负责落 DOM
    window.EuriskoHomePlans = {
        pure: { buildPlanModel: buildPlanModel, buildLedgerModel: buildLedgerModel, diffRowOf: diffRowOf, money: money },
        render: renderPlans
    };

    // DOM 就绪后自动初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initHome);
    } else {
        initHome();
    }
})();
