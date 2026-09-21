// === 阶段19-2：首页 Mission 层（纯逻辑，无 DOM、无视觉变化） ===
// 首页要从「按身份挑工具」改成「先问你遇到了什么事」（plan §3.3）：
//   Hero（你现在该办的事）→ 事件轴（我要做什么）→ 资产（我已有的）→ 身份轴（我是谁）→ 兜底
// 本模块只负责这四件事的**判定与数据**，渲染仍在 home-ui.js：
//   1. Mission 三态判定（首访 / 有历史 / 临近节点）—— 决定 Hero 里那句话与主 CTA
//   2. 9 张事件卡的数据（生活语言 → 落到具体工具）
//   3. 待办与截止（税务日历 × 已保存的测算推导，不是凭空列节点）
//   4. 今年税负概览（≥2 次测算才出现，避免新客看到空图劝退）
//
// 为什么单独成文件：这四件事都是**可测的纯逻辑**，且首页改版时 home-ui.js 会大改；
// 把判定留在独立模块里，改结构不必重验判定，改判定也不必重拍截图基线。
//
// ⚠️ 与 home-ui.js 的 TAX_NODES 同源问题：节点表此前硬编码在 home-ui.js 内部（私有），
// 本模块为了能独立判定，**也**需要节点表。两份会漂移 —— 故本模块的 nodes 是**真源**，
// home-ui.js 改为读 window.EuriskoHomeMission.nodes（缺失时用它自己那份兜底，保证
// tests/home-page.test.js 单独 eval 时仍绿）。节点口径只有一处。

(function () {
    'use strict';

    // ====== 常量 ======
    // 节点进入「临近」态的阈值：30 天内开始占用 Hero（plan §3.3.2：临近申报节点是三态之一）
    const DEADLINE_WINDOW_DAYS = 30;
    // 只有**年度汇算清缴**能升级成 Hero 的 deadline 态 —— 月度 / 季度预缴是例行申报
    // （每月 15 日，任何一天距下一次都 ≤30 天），若也算临近，deadline 态会永久命中、
    // 「有历史」态永远显示不出来，Hero 就退化成一块每月都一样的倒计时牌。
    const HERO_NODE_TYPES = ['settlement'];
    // 概览要出现至少几次测算（plan §3.3.5：≥2 次测算后出现），避免 1 条数据画「构成」
    const OVERVIEW_MIN_COUNT = 2;

    // ====== 数据：税务节点表（真源，与 home-ui.js 同口径） ======
    // type: settlement(汇算区间) | policy(政策有效期) | prepaid(按期申报)
    // 判定字段：settlement 用 startMonthDay/endMonthDay；policy 用 endDate；prepaid 用 dayOfMonth / quarterEndDay
    const TAX_NODES = [
        {
            id: 'comprehensive-settlement',
            name: '综合所得汇算清缴',
            period: '次年3月1日 - 6月30日',
            startMonthDay: [3, 1],
            endMonthDay: [6, 30],
            description: '对上年度综合所得进行年度汇算，多退少补',
            type: 'settlement',
            // 与哪类已保存测算相关（用于待办推导）
            relatedTypes: ['comprehensive', 'quick', 'reverse', 'salary-tax', 'bonus-tax']
        },
        {
            id: 'business-settlement',
            name: '经营所得汇算清缴',
            period: '次年1月1日 - 3月31日',
            startMonthDay: [1, 1],
            endMonthDay: [3, 31],
            description: '对上年度经营所得进行年度汇算申报',
            type: 'settlement',
            relatedTypes: ['business', 'quick']
        },
        {
            id: 'business-half-reduction',
            name: '经营所得减半征收优惠',
            period: '2023.1.1 - 2027.12.31',
            startDate: new Date('2023-01-01'),
            endDate: new Date('2027-12-31'),
            description: '年应纳税所得额≤200万部分减按50%计入',
            type: 'policy',
            relatedTypes: ['business']
        },
        {
            id: 'monthly-prepaid',
            name: '综合所得月度预缴申报',
            period: '每月15日前',
            dayOfMonth: 15,
            description: '扣缴义务人每月预扣预缴个人所得税',
            type: 'prepaid',
            relatedTypes: ['comprehensive', 'quick']
        },
        {
            id: 'business-quarterly-prepaid',
            name: '经营所得季度预缴申报',
            period: '季度结束后15日内',
            quarterEndDay: 15,
            description: '个体工商户季度预缴经营所得税',
            type: 'prepaid',
            relatedTypes: ['business']
        }
    ];

    // ====== 数据：9 张事件卡（plan §3.3.3）======
    // 规则：卡片 = 一句大白话 + 一行小字 + 一个箭头，**不出现税种名、不出现术语**。
    // target = 落到的工具 id（tool-registry 中已存在；tests/home-mission.test.js 会逐个核）。
    // decide = true：先判定再进工具（第 8 张，开店/私活 的劳务报酬 vs 经营所得是自由职业者的核心断点）。
    // workbench = true：进的是工作台不是单个计算器（第 9 张，财务/HR 的效率层入口）。
    const EVENT_CARDS = [
        {
            id: 'got-bonus',
            title: '发了年终奖',
            desc: '单独算还是并进工资里算，哪个到手多',
            icon: 'fa-gift',
            target: 'bonus-tax'
        },
        {
            id: 'changed-job',
            title: '换工作 / 谈 offer',
            desc: '给我一个到手数，反推要开多少税前',
            icon: 'fa-handshake-o',
            target: 'reverse'
        },
        {
            id: 'sell-house',
            title: '我要卖房 / 买房',
            desc: '买卖双方各要交哪些、分别多少',
            icon: 'fa-home',
            target: 'property-transfer'
        },
        {
            id: 'got-equity',
            title: '拿了期权 / 要转股权',
            desc: '多次行权怎么合并算，递延划不划算',
            icon: 'fa-line-chart',
            target: 'equity-deep'
        },
        {
            id: 'left-job',
            title: '被裁 / 离职拿了补偿',
            desc: '补偿金怎么算、法定应得是多少',
            icon: 'fa-sign-out',
            target: 'severance-deep'
        },
        {
            id: 'first-job',
            title: '第一次工作 / 看工资条',
            desc: '每月扣的那些都是什么，到手怎么算',
            icon: 'fa-id-badge',
            target: 'salary-tax'
        },
        {
            id: 'life-change',
            title: '生娃 / 租房 / 父母养老',
            desc: '这些事能少交多少，别漏填',
            icon: 'fa-child',
            target: 'special-deduction'
        },
        {
            id: 'side-hustle',
            title: '开了店 / 接了私活',
            desc: '先判定属于哪一类，再按对的口径算',
            icon: 'fa-shopping-bag',
            decide: true,
            target: 'withholding',
            altTarget: 'business'
        },
        {
            id: 'pay-salary',
            title: '我要发工资 / 算用工成本',
            desc: '一个人的真实用工成本是多少',
            icon: 'fa-users',
            target: 'employer-cost',
            workbench: true
        }
    ];

    // ====== 工具函数 ======
    const DAY = 1000 * 60 * 60 * 24;

    function startOfDay(d) {
        return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }

    // 两个日期相差天数（按自然日，不算小时）
    function daysBetween(from, to) {
        return Math.round((startOfDay(to) - startOfDay(from)) / DAY);
    }

    // 距离「今年或明年的某月某日」还有多少天（过了就取明年）
    function daysUntilMonthDay(monthDay, now) {
        const year = now.getFullYear();
        let diff = daysBetween(now, new Date(year, monthDay[0] - 1, monthDay[1]));
        if (diff < 0) diff = daysBetween(now, new Date(year + 1, monthDay[0] - 1, monthDay[1]));
        return diff;
    }

    // 当前是否在 [startMD, endMD] 区间内（含跨年）
    function isDateInRange(startMD, endMD, now) {
        const m = now.getMonth() + 1, d = now.getDate();
        const [startM, startD] = startMD, [endM, endD] = endMD;
        if (startM === endM) return m === startM && d >= startD && d <= endD;
        if (startM < endM) {
            return (m > startM && m < endM) || (m === startM && d >= startD) || (m === endM && d <= endD);
        }
        // 跨年（如 11 月 - 次年 2 月）
        return (m > startM || (m === startM && d >= startD)) || (m < endM || (m === endM && d <= endD));
    }

    function monthDayLabel(md) {
        return `${md[0]}/${md[1]}`;
    }

    // ====== 节点：算出每个节点的「下一次截止」与剩余天数 ======
    // 返回 { id, name, deadlineLabel, daysLeft, ongoing }；不需要展示的节点返回 null。
    // 口径说明：
    //   - settlement：区间内 → 截止日就是区间末尾（ongoing=true）；区间外 → 下一个区间末尾（明年）
    //   - prepaid 月度：本月 15 日，过了就下月 15 日
    //   - prepaid 季度：1/4/7/10 月的 15 日（季度结束后 15 日内），过了就下一个申报月
    //   - policy：政策到期日（通常很远，不参与 Hero 的临近判定，但保留给待办/资产区）
    function nodeDeadline(node, now) {
        if (node.type === 'settlement') {
            const ongoing = isDateInRange(node.startMonthDay, node.endMonthDay, now);
            const daysLeft = daysUntilMonthDay(node.endMonthDay, now);
            return {
                id: node.id, name: node.name,
                deadlineLabel: monthDayLabel(node.endMonthDay),
                daysLeft, ongoing, type: node.type
            };
        }
        if (node.type === 'policy') {
            const daysLeft = daysBetween(now, node.endDate);
            return {
                id: node.id, name: node.name,
                deadlineLabel: `${node.endDate.getFullYear()}/${node.endDate.getMonth() + 1}/${node.endDate.getDate()}`,
                daysLeft, ongoing: daysLeft > 0, type: node.type
            };
        }
        if (node.type === 'prepaid' && node.dayOfMonth) {
            const d = now.getDate();
            if (d <= node.dayOfMonth) {
                return {
                    id: node.id, name: node.name,
                    deadlineLabel: `${now.getMonth() + 1}/${node.dayOfMonth}`,
                    daysLeft: node.dayOfMonth - d, ongoing: true, type: node.type
                };
            }
            const next = new Date(now.getFullYear(), now.getMonth() + 1, node.dayOfMonth);
            return {
                id: node.id, name: node.name,
                deadlineLabel: `${next.getMonth() + 1}/${node.dayOfMonth}`,
                daysLeft: daysBetween(now, next), ongoing: false, type: node.type
            };
        }
        if (node.type === 'prepaid' && node.quarterEndDay) {
            // 申报月 = 季度末的下一个月（3/6/9/12 → 4/7/10/1）
            const filingMonths = [1, 4, 7, 10];
            const m = now.getMonth() + 1, d = now.getDate();
            for (const fm of filingMonths) {
                if (fm > m || (fm === m && d <= node.quarterEndDay)) {
                    const target = new Date(now.getFullYear(), fm - 1, node.quarterEndDay);
                    return {
                        id: node.id, name: node.name,
                        deadlineLabel: `${fm}/${node.quarterEndDay}`,
                        daysLeft: daysBetween(now, target), ongoing: fm === m, type: node.type
                    };
                }
            }
            const target = new Date(now.getFullYear() + 1, 0, node.quarterEndDay);
            return {
                id: node.id, name: node.name,
                deadlineLabel: `1/${node.quarterEndDay}`,
                daysLeft: daysBetween(now, target), ongoing: false, type: node.type
            };
        }
        return null;
    }

    // 全部节点的截止信息，按剩余天数升序；policy 类排在后面（它不制造紧迫感）
    function upcomingNodes(now = new Date(), limit = 0) {
        const list = TAX_NODES
            .map(n => nodeDeadline(n, now))
            .filter(Boolean)
            .map(x => ({ ...x, isPolicy: x.type === 'policy' }))
            .sort((a, b) => {
                if (a.isPolicy !== b.isPolicy) return a.isPolicy ? 1 : -1;
                return a.daysLeft - b.daysLeft;
            });
        return limit > 0 ? list.slice(0, limit) : list;
    }

    // ====== 历史：读取与摘要 ======
    function readHistory() {
        // 优先用 data-management.js 维护的内存镜像，兜底读 localStorage
        if (typeof calculationHistory !== 'undefined' && Array.isArray(calculationHistory)) {
            return calculationHistory;
        }
        try {
            const raw = localStorage.getItem('taxCalculationHistory');
            const list = JSON.parse(raw || '[]');
            return Array.isArray(list) ? list : [];
        } catch (e) {
            return [];
        }
    }

    function recordTime(item) {
        return new Date(item.date || item.created_at || 0);
    }

    function recordTax(item) {
        const tax = item.results?.taxDetails?.totalTax
            || item.results?.totalTax
            || item.result_data?.taxDetails?.totalTax
            || item.result_data?.totalTax
            || 0;
        return parseFloat(tax) || 0;
    }

    function recordTitle(item) {
        return item.title || item.name || item.type || '测算';
    }

    function lastRecord(history) {
        if (!Array.isArray(history) || history.length === 0) return null;
        return [...history].sort((a, b) => recordTime(b) - recordTime(a))[0];
    }

    // 「3 天前 / 2 小时前 / 刚刚」，与首页卡片口径一致（不要精确到分钟，会制造焦虑）
    function relativeTime(date, now = new Date()) {
        const diffMs = now - new Date(date);
        if (isNaN(diffMs)) return '';
        const days = Math.floor(diffMs / DAY);
        if (days >= 1) return days === 1 ? '昨天' : `${days} 天前`;
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        if (hours >= 1) return `${hours} 小时前`;
        return '刚刚';
    }

    // ====== Mission 三态判定（plan §3.3.2）======
    // 优先级：临近节点 > 有历史 > 首访 —— 临近节点是最该被看见的那一句，
    // 但它只在**用户已经有测算**时才升级为 deadline 态：新客连结果都没有，
    // 给他一个倒计时只会劝退（plan §3.3.5 同款顾虑：空状态不放给新客看）。
    function detectMission(options = {}) {
        const now = options.now || new Date();
        const history = options.history || readHistory();
        const last = lastRecord(history);

        if (!last) {
            return {
                state: 'first-visit',
                title: '你今年要交多少税？',
                subtitle: '41 个场景，全在你手机里算完，数据不出本机',
                cta: { text: '开始测算', action: 'scroll', target: 'home-events' },
                node: null,
                last: null
            };
        }

        // 临近节点：只认年度汇算（见 HERO_NODE_TYPES 的说明 —— 例行申报不占用首屏）
        const urgent = upcomingNodes(now).find(n =>
            HERO_NODE_TYPES.includes(n.type) && n.daysLeft >= 0 && n.daysLeft <= DEADLINE_WINDOW_DAYS);
        if (urgent) {
            const tax = recordTax(last);
            return {
                state: 'deadline',
                title: `距${urgent.name}还有 ${urgent.daysLeft} 天`,
                subtitle: tax > 0
                    ? `上次测算：${recordTitle(last)} 应纳 ¥${tax.toFixed(0)} · ${relativeTime(recordTime(last), now)}`
                    : `${urgent.deadlineLabel} 截止，趁现在把数填进去`,
                cta: { text: '现在更新测算', action: 'open-last', target: last.id },
                node: urgent,
                last
            };
        }

        const tax = recordTax(last);
        return {
            state: 'has-history',
            title: tax > 0
                ? `上次测算：${recordTitle(last)} 应纳 ¥${tax.toFixed(0)}`
                : `上次测算：${recordTitle(last)}`,
            subtitle: `${relativeTime(recordTime(last), now)} · ${recordTime(last).getFullYear()} 年度`,
            cta: { text: '继续', action: 'open-last', target: last.id },
            altCta: { text: '换个方案对比', action: 'scroll', target: 'home-events' },
            node: null,
            last
        };
    }

    // ====== 待办与截止（plan §3.3.5 ②）======
    // 由「税务日历 × 已保存的测算」推导：只提示**与我已算过的东西有关**的节点，
    // 不把 5 个节点全列出来（列全等于没提醒）。没有任何相关测算时返回空数组。
    function buildTodos(options = {}) {
        const now = options.now || new Date();
        const history = options.history || readHistory();
        if (!Array.isArray(history) || history.length === 0) return [];

        const types = new Set(history.map(h => h.type).filter(Boolean));
        // 速算器（type='quick'）要按它保存的工具 id 再认一次，否则待办永远推不出来
        history.forEach(h => {
            if (h.toolId) types.add(h.toolId);
            if (h.tool_id) types.add(h.tool_id);
        });

        const todos = [];
        TAX_NODES.forEach(node => {
            const hit = (node.relatedTypes || []).some(t => types.has(t));
            if (!hit) return;
            const dl = nodeDeadline(node, now);
            if (!dl || dl.daysLeft < 0) return;
            todos.push({
                id: node.id,
                name: node.name,
                deadline: dl.deadlineLabel,
                daysLeft: dl.daysLeft,
                ongoing: dl.ongoing,
                isPolicy: node.type === 'policy'
            });
        });

        return todos.sort((a, b) => {
            if (a.isPolicy !== b.isPolicy) return a.isPolicy ? 1 : -1;
            return a.daysLeft - b.daysLeft;
        }).slice(0, options.limit || 3);
    }

    // ====== 今年税负概览（plan §3.3.5 ③）======
    // ≥2 次测算才可见：1 条数据画「构成」是自欺欺人。
    function buildYearOverview(historyArg, options = {}) {
        const now = options.now || new Date();
        const history = historyArg || readHistory();
        const year = now.getFullYear();
        const mine = (Array.isArray(history) ? history : [])
            .filter(h => recordTime(h).getFullYear() === year);

        const buckets = new Map();
        mine.forEach(h => {
            const name = recordTitle(h);
            const tax = recordTax(h);
            buckets.set(name, (buckets.get(name) || 0) + tax);
        });

        const items = [...buckets.entries()]
            .map(([name, tax]) => ({ name, tax }))
            .sort((a, b) => b.tax - a.tax);
        const total = items.reduce((s, x) => s + x.tax, 0);

        return {
            year,
            count: mine.length,
            visible: mine.length >= OVERVIEW_MIN_COUNT && total > 0,
            total,
            items: items.map(x => ({ ...x, pct: total > 0 ? Math.round((x.tax / total) * 100) : 0 }))
        };
    }

    // ====== 暴露 ======
    window.EuriskoHomeMission = {
        DEADLINE_WINDOW_DAYS,
        HERO_NODE_TYPES,
        OVERVIEW_MIN_COUNT,
        nodes: TAX_NODES,
        eventCards: EVENT_CARDS,
        nodeDeadline,
        upcomingNodes,
        detectMission,
        buildTodos,
        buildYearOverview,
        // 下面几个是渲染层也要用的小工具，一并导出，避免 home-ui 再抄一份相对时间口径
        relativeTime,
        recordTax,
        recordTitle,
        recordTime,
        lastRecord,
        readHistory
    };
})();
