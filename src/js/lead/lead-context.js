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

    // 服务错配：谈薪是**主动不投**的那一类（lead-touchpoints 里它连引导都不出），
    // 因此也不作为留资情境 —— 否则顾问会收到服务范围外的线索。这一条是产品硬约束。
    var BLOCKED_TYPES = ['reverse'];

    // 类型 → 展示名（与 lead-touchpoints.TOUCHPOINTS / share-card.SOURCES 同一命名口径）
    var TYPE_NAMES = {
        forward: '综合所得年度汇算',
        comprehensive: '综合所得年度汇算',
        business: '经营所得年度汇算',
        classification: '分类所得计税',
        reverse: '谈薪测算'
    };

    // 阶段18-4（v1.74.0）：21 个完整测算共用同一个向导，而上表只手写了阶段17 逐个迁移的那 4 个。
    // 其余 17 个（增值税、企业所得税、年终奖、股权激励、离职补偿、非居民……）留资时
    // current() 认不出、历史下拉里也选不到 —— 顾问只看到「有人留了资」，不知道他算的是什么税。
    // 名字改由注册表兜底（注册表里有的才算数），认不出仍然返回空：**不编造情境**。
    // 与阶段18-2 / 18-3 同一个病、同一剂药：按名字认人的表，每加一种形态就漏一批。
    function nameOf(type) {
        if (TYPE_NAMES[type]) return TYPE_NAMES[type];
        var reg = window.EuriskoToolRegistry;
        var tool = reg && typeof reg.get === 'function' ? reg.get(type) : null;
        return tool && tool.name ? tool.name : '';
    }

    // 「已算完」判据节点：读它的文本是否还是占位符，判断结果面板是否真的渲染过
    // （只是本地判断，不作为情境内容上报）
    // 17B-1：经营所得迁到 spec 驱动的向导后不再有专属 id（向导是通用渲染器，dw-* 节点被所有
    // spec 工具复用），所以它的三个节点改用「wizard:」锚点 —— 由 readWizardText 按
    // data-tool-id 归因人。写成裸 id 会把增值税的结果当成经营所得的情境报给顾问。
    // 17B-3（v1.49.0）：综合所得同样迁到向导，result-net-income / result-refund-tax /
    // result-tax-rate 三个旧页面节点随之删除 —— 改同样的锚点，否则情境永远读不到东西
    // （readText 拿到空串，留资情境里三个字段静默消失）。
    // 17B-4（v1.50.0）：分类所得同样如此 —— 'classification-result-net-income' 随旧页面删了，
    // 不改锚点，顾问看到的情境就是「这笔线索没算过分类所得」。
    var RESULT_MARKERS = {
        forward: 'wizard:primary',
        comprehensive: 'wizard:primary',
        business: 'wizard:primary',
        classification: 'wizard:primary'
    };

    // 汇算结论节点：文本形如「应补 ¥1,234.56」「应退 ¥1,234.56」「不退不补 ¥0.00」
    var CONCLUSION_NODES = {
        forward: 'wizard:refund',
        comprehensive: 'wizard:refund',
        business: 'wizard:refund'
    };

    // 适用税率节点：文本形如「20%」
    var RATE_NODES = {
        forward: 'wizard:row:适用税率',
        comprehensive: 'wizard:row:适用税率',
        business: 'wizard:row:适用税率',
        // 分类所得的行名叫这个：它是**实际税负率**（税额 ÷ 收入），与上面的「适用税率」不是一个东西 ——
        // 四类所得名义税率都是 20%，真正会因扣除而变动的是实际税负率。
        classification: 'wizard:row:实际税负率'
    };

    function readText(id) {
        var node = document.getElementById(id);
        return node ? String(node.textContent || '').trim() : '';
    }

    // spec 驱动的向导：通过 data-tool-id 找到「当前这次测算」的结果节点，再按锚点取值。
    // 返回值与 readText 同形态，区别只在定位方式。
    function readWizardText(type, kind, arg) {
        var card = document.getElementById('dw-result-card');
        if (!card || card.getAttribute('data-tool-id') !== type) return '';
        if (kind === 'primary') {
            var hero = document.getElementById('dw-result-primary');
            return hero ? String(hero.textContent || '').trim() : '';
        }
        if (kind === 'refund') {
            // 方向写在**行标签**上（"应补税额" / "应退税额"），而不是行值里 ——
            // conclusionWord 认的正是这两个词，取不到方向就返回空，情境里不出现结论项。
            if (card.querySelector('[data-dw-row="应补税额"]')) return '应补税额';
            if (card.querySelector('[data-dw-row="应退税额"]')) return '应退税额';
            return '';
        }
        var row = card.querySelector('[data-dw-row="' + arg + '"]');
        if (!row) {
            // 真机上行名常带后缀（「实际税负率（占不含税销售额）」），精确匹配会取不到 ——
            // 阶段18-4 只验了 jsdom 里那批精确行名，真机一跑税率锚点就整段消失。按前缀再找一次。
            row = card.querySelector('[data-dw-row^="' + arg + '"]');
        }
        if (!row) return '';
        // 行标签和值渲染在**同一个**节点里（'<div data-dw-row="适用税率"><span>适用税率</span>
        // <span>20%</span></div>'），而下面 rateWord 认的是纯粹的一个 '20%' —— 整行 textContent
        // 会把标签一起带进来。取最后一个 span 就是值：不依赖 class，也不要求每行都有标签。
        var spans = row.querySelectorAll('span');
        var value = spans.length ? spans[spans.length - 1] : row;
        return String(value.textContent || '').trim();
    }

    // 支持两种定位写法：普通 id（存量页面）与 'wizard:xxx'（spec 驱动的向导）
    function readNode(selector, type) {
        if (String(selector).indexOf('wizard:') === 0) {
            var parts = String(selector).split(':');
            return readWizardText(type, parts[1], parts.slice(2).join(':'));
        }
        return readText(selector);
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
    // 未列出锚点的那一批测算（17 个）没有手写配置：试几个常见行名，取第一个真有值的。
    // 行名是什么就写什么（「实际税负率 12%」而不是一律「适用税率 …」）—— 这两者不是一回事。
    var GENERIC_RATE_ROWS = ['适用税率', '实际税负率', '税负率'];

    function rateOf(type) {
        if (RATE_NODES[type]) return rateWord(readNode(RATE_NODES[type], type));
        for (var i = 0; i < GENERIC_RATE_ROWS.length; i++) {
            var value = readNode('wizard:row:' + GENERIC_RATE_ROWS[i], type);
            if (value && value !== '0%') return GENERIC_RATE_ROWS[i] + ' ' + value;
        }
        return '';
    }

    function current(type) {
        // 谈薪是**主动排除**的那一类。注意它此前返回空是靠「没给它配锚点」这种巧合撑着的
        // （RESULT_MARKERS 里没有 reverse 这一路）—— 通用锚点一加，那个巧合就没了。
        // 硬约束不能靠巧合，这里显式挡掉。
        if (BLOCKED_TYPES.indexOf(type) !== -1) return '';

        var name = nameOf(type);
        if (!name) return '';

        // 缺锚点的照样能取数：主结果一律是 wizard:primary，结论行没有就留空（不猜方向）
        var marker = readNode(RESULT_MARKERS[type] || 'wizard:primary', type);
        if (!isMeaningful(marker)) return '';

        var parts = [name];
        var conclusion = conclusionWord(readNode(CONCLUSION_NODES[type] || 'wizard:refund', type));
        if (conclusion) parts.push(conclusion);

        var rate = rateOf(type);
        if (rate) parts.push(rate);

        return parts.join(' · ');
    }

    // 阶段19-7b②（v1.102.0）：视图密度 + 「简明视图下主动展开过进阶参数」的次数。
    // 这两个数**不描述算了什么**（那是 current() 的职责），只描述**这个人想要多细** ——
    // 选完整视图、或在简明视图下翻出进阶参数去调的人，多数是财务 / HR / 企业主（ICP ★★★）。
    // 刻意不并进 current() 的文本：那段话是给用户看的「参考您的测算」，
    // 混进行为标记，就成了当着用户的面给他打分。
    // 拿不到（模块未加载）返回 null —— 没信号就说没信号，不猜一个「简明」出来充数。
    function viewSignals() {
        var p = window.EuriskoModePref;
        if (!p || typeof p.get !== 'function') return null;
        var touched = (typeof p.advancedTouched === 'function') ? p.advancedTouched() : null;
        return {
            mode: p.get() === p.FULL ? 'full' : 'simple',
            advancedTouched: Number(touched && touched.count) || 0
        };
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

        if (BLOCKED_TYPES.indexOf(record.type) !== -1) return '';
        var name = nameOf(record.type);
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
            // 阶段18-4：这里原先只放行 SERVICE_TYPES 那 4 个类型 —— 于是 17 个完整测算算完
            // 保存的记录在下拉里根本选不到（阶段18-2 让它们打得开，这里让它们说得清）。
            // 过滤条件改为「不是主动排除的 + 认得出名字」：谈薪依旧进不来（服务错配），
            // 认不出的依旧不编造。下拉是**用户自己选**的情境，不是推送引导。
            if (BLOCKED_TYPES.indexOf(record.type) !== -1) continue;
            if (!nameOf(record.type)) continue;
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
        conclusionWord: conclusionWord,
        viewSignals: viewSignals
    };
})();
