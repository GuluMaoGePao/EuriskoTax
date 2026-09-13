/**
 * 阶段13B+：留资「咨询情境」数据层
 *
 * 为什么需要它：
 *   此前弹窗里的「当前测算：xxx」并不是用户真正算出来的东西 —— 它只是调用方硬编码的
 *   **入口标签**。从个人中心进入时甚至会显示「当前测算：个人中心·财税服务」，
 *   个人中心根本没有测算。这既误导用户，也让顾问拿到一个无意义的字段。
 *
 * 本模块把「情境」改成**从结果页 / 本地历史反推的真实信息**，并严格守住合规红线：
 *   只产出「测算类型 + 应退税/应补税 + 适用税率 + 日期」这类**非金额**摘要；
 *   金额节点只在本地用于判断「是否真的算完了」，绝不进入任何上报字段。
 *
 * 三个能力：
 *   current(type)      结果页真实摘要（读已渲染 DOM；尚未测算时返回 ''）
 *   historyOptions()   本地已保存记录的摘要列表（供用户主动选择一条作为咨询情境）
 *   summarize(record)  单条记录 → 摘要文本（纯函数，供单测直接调用）
 *
 * 对外接口：window.LeadContext
 */
(function () {
    'use strict';

    var HISTORY_KEY = 'taxCalculationHistory';
    var HISTORY_LIMIT = 8; // 下拉最多列 8 条：更多用户也不会看，反而拖慢渲染

    // 与 lead-touchpoints.ALLOWED_TYPES 同一口径：谈薪(reverse)不投服务引导，
    // 因此也不让它作为留资情境出现在下拉里 —— 否则顾问会收到其服务范围外的线索
    var SERVICE_TYPES = ['forward', 'comprehensive', 'business', 'classification'];

    // 类型 → 展示名（与 lead-touchpoints.TOUCHPOINTS / share-card.SOURCES 同一命名口径）
    var TYPE_NAMES = {
        forward: '综合所得年度汇算',
        comprehensive: '综合所得年度汇算',
        business: '经营所得年度汇算',
        classification: '分类所得计税',
        reverse: '谈薪测算'
    };

    // 「已算完」判据节点：读它的文本是否还是占位符，判断结果面板是否真的渲染过
    // （只是本地判断，不作为情境内容上报）
    var RESULT_MARKERS = {
        forward: 'result-net-income',
        comprehensive: 'result-net-income',
        business: 'business-result-net-income',
        classification: 'classification-result-net-income'
    };

    // 汇算结论节点：文本形如「应补 ¥1,234.56」「应退 ¥1,234.56」「不退不补 ¥0.00」
    var CONCLUSION_NODES = {
        forward: 'result-refund-tax',
        comprehensive: 'result-refund-tax',
        business: 'business-result-refund-tax'
    };

    // 适用税率节点：文本形如「20%」
    var RATE_NODES = {
        forward: 'result-tax-rate',
        comprehensive: 'result-tax-rate',
        business: 'business-result-tax-rate'
    };

    function readText(id) {
        var node = document.getElementById(id);
        return node ? String(node.textContent || '').trim() : '';
    }

    // 与 share-card.js 同一判据：占位符（¥0 / — / 空）视为「尚未测算」
    function isMeaningful(text) {
        if (!text) return false;
        var normalized = String(text).replace(/[\s¥￥,]/g, '');
        if (!normalized) return false;
        return normalized !== '0' && normalized !== '0.00' && normalized !== '-' && normalized !== '—' && normalized !== '--';
    }

    // 只提取「方向词」，丢掉金额 —— 这是本模块守合规的关键一步
    function conclusionWord(rawText) {
        if (!rawText) return '';
        if (rawText.indexOf('应退') === 0) return '预计退税';
        if (rawText.indexOf('应补') === 0) return '预计补税';
        if (rawText.indexOf('不退不补') === 0) return '无需补退';
        return '';
    }

    function rateWord(rawText) {
        var rate = String(rawText || '').trim();
        if (!rate || rate === '0%') return ''; // 0% 多数情况是未测算时的占位
        return '适用税率 ' + rate;
    }

    // 结果页真实摘要：未测算（面板仍是占位符）时返回 ''，调用方据此隐藏情境卡
    function current(type) {
        var name = TYPE_NAMES[type];
        if (!name) return '';

        var marker = readText(RESULT_MARKERS[type]);
        if (!isMeaningful(marker)) return '';

        var parts = [name];
        var conclusion = conclusionWord(readText(CONCLUSION_NODES[type]));
        if (conclusion) parts.push(conclusion);

        var rate = rateWord(readText(RATE_NODES[type]));
        if (rate) parts.push(rate);

        return parts.join(' · ');
    }

    function formatDate(value) {
        var date = value ? new Date(value) : null;
        if (!date || isNaN(date.getTime())) return '';
        var month = ('0' + (date.getMonth() + 1)).slice(-2);
        var day = ('0' + date.getDate()).slice(-2);
        return date.getFullYear() + '-' + month + '-' + day;
    }

    // 单条历史记录 → 摘要文本（纯函数：不读 DOM，供单测直接喂 fixture）
    function summarize(record) {
        if (!record || typeof record !== 'object') return '';

        var name = TYPE_NAMES[record.type] || '';
        if (!name) return '';

        var parts = [name];
        var details = (record.results && record.results.taxDetails) || {};

        if (typeof details.refundTax === 'number') {
            if (details.refundTax > 0.005) parts.push('预计补税');
            else if (details.refundTax < -0.005) parts.push('预计退税');
            else parts.push('无需补退');
        }

        if (typeof details.applicableRate === 'number' && details.applicableRate > 0) {
            parts.push('适用税率 ' + Math.round(details.applicableRate * 100) + '%');
        }

        return parts.join(' · ');
    }

    function readHistory() {
        try {
            var list = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
            return Array.isArray(list) ? list : [];
        } catch (err) {
            return [];
        }
    }

    // 供弹窗下拉使用：{ id, label, scene }
    //   label —— 下拉里显示（含日期，便于区分同日多条）
    //   scene —— 选中后随留资提交的情境文本（不含日期与任何金额）
    function historyOptions() {
        var options = [];
        var records = readHistory();

        for (var i = 0; i < records.length && options.length < HISTORY_LIMIT; i++) {
            var record = records[i];
            if (!record || record.id == null) continue;
            if (SERVICE_TYPES.indexOf(record.type) === -1) continue;
            var scene = summarize(record);
            if (!scene) continue;
            var date = formatDate(record.date || record.updatedAt);
            options.push({
                id: String(record.id),
                scene: scene,
                label: scene + (date ? ' · ' + date : '')
            });
        }

        return options;
    }

    window.LeadContext = {
        TYPE_NAMES: TYPE_NAMES,
        HISTORY_LIMIT: HISTORY_LIMIT,
        current: current,
        summarize: summarize,
        historyOptions: historyOptions,
        conclusionWord: conclusionWord
    };
})();
