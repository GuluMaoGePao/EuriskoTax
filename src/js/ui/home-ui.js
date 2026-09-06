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

    // ====== 数据：税务节点表（配置化，便于后续扩展） ======
    // type: ongoing(进行中) | upcoming(即将到来) | expired(已结束但仍提示)
    const TAX_NODES = [
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
    function daysUntilMonthDay(monthDay) {
        const now = new Date();
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

        // 按时间倒序，最多5条
        const sorted = [...history].sort((a, b) => {
            const da = new Date(a.date || a.created_at || 0);
            const db = new Date(b.date || b.created_at || 0);
            return db - da;
        }).slice(0, 5);

        const typeMap = {
            comprehensive: { name: '综合所得', icon: 'fa-calculator', color: 'text-primary' },
            business: { name: '经营所得', icon: 'fa-briefcase', color: 'text-accent' },
            classification: { name: '分类所得', icon: 'fa-list-alt', color: 'text-success' },
            reverse: { name: '反向倒算', icon: 'fa-refresh', color: 'text-secondary' }
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
                        <span class="ml-auto text-xs text-gray-400">${dateStr}</span>
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

    // ====== 渲染：税务日历提醒 ======
    function renderTaxCalendar() {
        const container = document.getElementById('home-calendar-list');
        const yearEl = document.getElementById('home-calendar-year');
        if (!container) return;
        const now = new Date();
        if (yearEl) yearEl.textContent = now.getFullYear();

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
                daysLeft: daysUntilMonthDay([6, 30])
            });
        }
        if (currentMonth >= 1 && currentMonth <= 3) {
            items.push({
                date: '3/31',
                name: '经营所得汇算清缴截止',
                color: 'bg-success',
                daysLeft: daysUntilMonthDay([3, 31])
            });
        }

        // 经营所得减半优惠截止
        items.push({
            date: '2027/12/31',
            name: '经营所得减半优惠截止',
            color: 'bg-warning',
            daysLeft: Math.ceil((new Date('2027-12-31') - now) / (1000 * 60 * 60 * 24))
        });

        // 按剩余天数排序
        items.sort((a, b) => a.daysLeft - b.daysLeft);

        // 最多显示4条
        const display = items.slice(0, 4);

        container.innerHTML = display.map(item => {
            const daysText = item.daysLeft > 0 ? `剩 ${item.daysLeft} 天` : '今天截止';
            const urgencyColor = item.daysLeft <= 7 ? 'text-danger' : (item.daysLeft <= 30 ? 'text-warning' : 'text-gray-500');
            return `
                <div class="tax-reminder-item">
                    <span class="tax-reminder-dot ${item.color}"></span>
                    <div class="flex-1 min-w-0">
                        <div class="text-sm text-gray-700 truncate">${item.name}</div>
                        <div class="text-xs text-gray-400">${item.date}</div>
                    </div>
                    <span class="text-xs ${urgencyColor} font-medium ml-2 flex-shrink-0">${daysText}</span>
                </div>
            `;
        }).join('');
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
        HomePerf.measure('initHome → 渲染最近计算', renderRecentCalculations);
        HomePerf.measure('initHome → 渲染税务日历', renderTaxCalendar);
        HomePerf.measure('initHome → 渲染税务小贴士', renderTaxTip);
        HomePerf.log('initHome → 渲染总耗时', performance.now() - renderStart, { steps: 5 });

        setupModeCards();
        setupInteractions();
    }

    // 暴露到全局
    window.initHome = initHome;
    window.refreshHomeRecent = renderRecentCalculations; // 保存计算后可调用刷新

    // DOM 就绪后自动初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initHome);
    } else {
        initHome();
    }
})();
