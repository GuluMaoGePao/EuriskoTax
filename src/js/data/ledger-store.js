/**
 * 阶段19-10 · 效率层 E3：台账（Ledger）
 *
 * 一句话职责：把「每次算完往历史里一扔」变成「按月、按主体归档的一本账」。
 *
 * 它和「计算历史」的关系必须先说清楚，否则这个项目会多出一个第二存储：
 *   **历史是本体（一条测算记录），台账是它的一层索引** —— 只记历史里查不出来的那点东西。
 *   具体分工：
 *     · 期间 → 从记录自己的 `date` 推。它本来就写着"什么时候算的"，再抄一份到索引里，
 *       两边迟早不一致（用户改了期间，索引说这个月、记录的 date 说上个月，听谁的？）。
 *       只有用户**显式改过**期间时，索引才存一个覆盖值 —— 覆盖值是例外，不是常态。
 *     · 主体 → 只能存在索引里（历史记录里没有这个概念的容身之处）。
 *     · 状态（已算 / 已导出 / 已申报）→ 它是"这件事办到哪一步"，不是测算的一部分。
 *   索引坏了/丢了怎么办：**期间能从 date 重建**，主体与状态丢了只是少一层标注 ——
 *   历史一条不少、一个数都没改。这就是「基于现有 history 扩展，不重写」在代码层面的含义。
 *
 * 为什么履约能力强到这里必须收住：
 *   台账再往前一步就是"报税申报台"——要申报表、要回执、要对接税局。那不是 E3 该付的成本。
 *   本文件的 `status` 只是**用户自己给自己看的进度标记**（算完了？导出给会计了？申报了吗？），
 *   系统不根据它做任何事，也不催任何人。
 *
 * 三条边界（沿用效率层一贯的规矩）：
 *   ① 零感知：索引为空时，历史 / 首页 / 导出的一切行为与改前逐字一致（守护测试）。
 *   ② 不删数据：权益只管**看得见几个月**，不管"存不存在"。更老的索引条目一直都在，
 *      免费用户看到的少，专业版看到的全 —— 差的是视野，不是数据本身。
 *   ③ 索引跟随历史生命周期：历史记录被删，索引里那条立刻清理（挂在 data-management.js
 *      的 deleteHistoryRecord 之后），否则会留下一堆指着空气的行。
 *
 * 存储：单键 euriskoLedger 存整个文档，按 ownerId 分组（与 entity-store 同一套隔离策略）。
 * 对外接口：window.EuriskoLedger
 */
(function () {
    'use strict';

    var KEY = 'euriskoLedger';
    var HISTORY_KEY = 'taxCalculationHistory';
    var LOCAL_OWNER = 'local';
    var FREE_MONTHS = 3;            // §3.10.9 权益刻度：免费用户看近 3 个月

    // 状态是"这件事办到哪一步"，不是测算的属性 —— 因此它归台账，不进历史记录。
    // 顺序即推进顺序：越靠后越接近办完。
    var STATUS = [
        { value: 'computed', label: '已算' },
        { value: 'exported', label: '已导出' },
        { value: 'filed', label: '已申报' }
    ];

    function ownerId() {
        try {
            if (typeof window !== 'undefined' && window.apiClient
                && typeof window.apiClient.getCurrentUser === 'function') {
                var u = window.apiClient.getCurrentUser();
                if (u && (u.id || u.userId)) return String(u.id || u.userId);
            }
            var raw = (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('current_user') : null)
                || (typeof localStorage !== 'undefined' ? localStorage.getItem('current_user') : null);
            if (raw) {
                var s = JSON.parse(raw);
                if (s && (s.id || s.userId)) return String(s.id || s.userId);
            }
        } catch (e) { /* ignore */ }
        return LOCAL_OWNER;
    }

    function storage() {
        try { return (typeof window !== 'undefined') ? (window.localStorage || null) : null; }
        catch (e) { return null; }
    }

    // ======================= 期间：台账的排序轴 =======================

    // 'YYYY-MM'。不用季度/旬 —— 报税的最小公共节拍是月（增值税按月或季、个税按月），
    // 一开始就把轴定死在月上，后面才有得归并；若定死在"第几期"上，季报用户会自己发明第二套说法。
    function periodKeyOf(dateish) {
        var d;
        if (dateish instanceof Date) d = dateish;
        else {
            var t = Date.parse(dateish);
            if (isNaN(t)) return '';
            d = new Date(t);
        }
        if (!d || isNaN(d.getTime())) return '';
        var m = d.getMonth() + 1;
        return d.getFullYear() + '-' + (m < 10 ? '0' + m : String(m));
    }

    function isValidPeriodKey(k) { return typeof k === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(k); }

    function addMonths(key, delta) {
        if (!isValidPeriodKey(key)) return '';
        var y = Number(key.slice(0, 4));
        var m = Number(key.slice(5, 7)) - 1 + delta;
        var ny = y + Math.floor(m / 12);
        var nm = ((m % 12) + 12) % 12;
        return ny + '-' + (nm + 1 < 10 ? '0' + (nm + 1) : String(nm + 1));
    }

    function prevPeriod(key) { return addMonths(key, -1); }

    function monthLabel(key) {
        if (!isValidPeriodKey(key)) return key || '';
        return Number(key.slice(0, 4)) + ' 年 ' + Number(key.slice(5, 7)) + ' 月';
    }

    function labelOfStatus(v) {
        var hit = STATUS.filter(function (s) { return s.value === v; })[0];
        return hit ? hit.label : STATUS[0].label;
    }

    // ======================= 索引读写 =======================

    function normalizeEntry(raw) {
        var e = (raw && typeof raw === 'object') ? raw : {};
        if (!e.historyId) return null;
        var out = {
            historyId: String(e.historyId),
            entityId: e.entityId ? String(e.entityId) : null,
            status: STATUS.filter(function (s) { return s.value === e.status; })[0] ? e.status : STATUS[0].value,
            updatedAt: e.updatedAt || new Date().toISOString()
        };
        // periodKey 是**覆盖值**（用户改过期间才有）：不合法就当没覆盖，回落到 date 推。
        if (isValidPeriodKey(e.periodKey)) out.periodKey = e.periodKey;
        return out;
    }

    function normalizeDoc(raw) {
        var doc = (raw && typeof raw === 'object') ? raw : {};
        var owners = (doc.owners && typeof doc.owners === 'object') ? doc.owners : {};
        var out = {};
        Object.keys(owners).forEach(function (owner) {
            var rows = owners[owner];
            if (!rows || typeof rows !== 'object') return;
            var mine = {};
            Object.keys(rows).forEach(function (hid) {
                var e = normalizeEntry(rows[hid]);
                if (!e) return;
                e.historyId = String(hid);
                mine[hid] = e;
            });
            out[owner] = mine;
        });
        return { owners: out };
    }

    function readDoc() {
        var s = storage();
        if (!s) return { owners: {} };
        try {
            var raw = s.getItem(KEY);
            if (!raw) return { owners: {} };
            return normalizeDoc(JSON.parse(raw));
        } catch (e) {
            // 索引读坏 = 回到"没有被归档过"的状态而不是炸掉：历史一条不少，
            // 少的只是这层标注。它若反过来把 UI 拖垮，那才是便宜的选择换昂贵的后果。
            return { owners: {} };
        }
    }

    function writeDoc(doc) {
        var s = storage();
        if (!s) return false;
        try { s.setItem(KEY, JSON.stringify(normalizeDoc(doc))); return true; }
        catch (e) { return false; }   // 隐私模式 / 配额满：台账没了，测算与历史照旧
    }

    function notifyChanged() {
        try {
            if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function'
                && typeof window.CustomEvent === 'function') {
                window.dispatchEvent(new window.CustomEvent('eurisko:ledger-changed'));
            }
        } catch (e) { /* ignore */ }
    }

    function isPro() {
        var P = (typeof window !== 'undefined') ? (window.EuriskoPlan || window.EuriskoSubscription) : null;
        if (!P) return false;
        try {
            var u = (window.apiClient && typeof window.apiClient.getCurrentUser === 'function')
                ? window.apiClient.getCurrentUser() : null;
            if (typeof P.isPro === 'function') return u ? !!P.isPro(u.plan, u.plan_expires_at) : false;
            if (typeof P.getCurrentPlan === 'function') {
                var plan = P.getCurrentPlan(u || null);
                return !!plan && String(plan.code || plan.name || '').toLowerCase().indexOf('pro') >= 0;
            }
        } catch (e) { /* ignore */ }
        return false;
    }

    function historyRecords() {
        var s = storage();
        if (!s) return [];
        try {
            var list = JSON.parse(s.getItem(HISTORY_KEY) || '[]');
            return Array.isArray(list) ? list : [];
        } catch (e) { return []; }
    }

    // 历史里找工具 id：两种写入形态各有一套字段（见文件头）
    //   · 速算器 toolId 写了 toolId，type 是常量 'quick'
    //   · 完整测算把 toolId 放在 type 上（saveToHistory(results, type, titlePrefix) 的历史包袱）
    function toolIdOf(rec) {
        if (!rec || typeof rec !== 'object') return '';
        if (rec.type === 'quick') return rec.toolId ? String(rec.toolId) : '';
        return rec.toolId ? String(rec.toolId) : (rec.type ? String(rec.type) : '');
    }

    function entries() {
        var owner = ownerId();
        var mine = readDoc().owners[owner] || {};
        return Object.keys(mine).map(function (hid) { return mine[hid]; });
    }

    function entry(historyId) {
        if (!historyId) return null;
        var owner = ownerId();
        var mine = readDoc().owners[owner] || {};
        return mine[String(historyId)] || null;
    }

    function saveEntry(e) {
        var doc = readDoc();
        var owner = ownerId();
        doc.owners[owner] = doc.owners[owner] || {};
        doc.owners[owner][e.historyId] = e;
        var ok = writeDoc(doc);
        notifyChanged();
        return ok;
    }

    // 归档一条历史记录（保存测算时调用）。
    // entityId 缺省 = 当前主体（19-9 建的那套）；没建主体就是 null —— 台账照样能用，
    // 只是这些行挂在"不按主体"名下。刻意不拦：台账是给重复劳动记账的，不是主体的附属品。
    function attach(historyId, opts) {
        if (!historyId) return { ok: false, reason: 'id' };
        opts = opts || {};
        var ent = (typeof window !== 'undefined') ? window.EuriskoEntities : null;
        var entityId = opts.entityId !== undefined ? opts.entityId
            : (ent && typeof ent.currentId === 'function' ? (ent.currentId() || null) : null);
        var prev = entry(historyId);
        var e = normalizeEntry({
            historyId: String(historyId),
            entityId: entityId || null,
            status: opts.status || (prev && prev.status) || STATUS[0].value,
            periodKey: opts.periodKey || (prev && prev.periodKey) || '',
            updatedAt: new Date().toISOString()
        });
        if (!e) return { ok: false, reason: 'id' };
        saveEntry(e);
        return { ok: true, entry: e };
    }

    function setStatus(historyId, status) {
        var e = entry(historyId);
        if (!e) return { ok: false, reason: 'notfound' };
        var next = normalizeEntry({
            historyId: e.historyId,
            entityId: e.entityId,
            status: status,
            periodKey: e.periodKey,
            updatedAt: new Date().toISOString()
        });
        saveEntry(next);
        return { ok: true, entry: next };
    }

    // 显式改期间：**只有这里**会往索引里写 periodKey。其余时候期间一律从历史记录的 date 推。
    function setPeriod(historyId, periodKey) {
        var e = entry(historyId);
        if (!e) return { ok: false, reason: 'notfound' };
        if (!isValidPeriodKey(periodKey)) return { ok: false, reason: 'period' };
        var next = normalizeEntry({
            historyId: e.historyId,
            entityId: e.entityId,
            status: e.status,
            periodKey: periodKey,
            updatedAt: new Date().toISOString()
        });
        saveEntry(next);
        return { ok: true, entry: next };
    }

    function setEntity(historyId, entityId) {
        var e = entry(historyId);
        if (!e) return { ok: false, reason: 'notfound' };
        var next = normalizeEntry({
            historyId: e.historyId,
            entityId: entityId || null,
            status: e.status,
            periodKey: e.periodKey,
            updatedAt: new Date().toISOString()
        });
        saveEntry(next);
        return { ok: true, entry: next };
    }

    // 历史记录被删 → 索引那行跟着走（见文件头边界 ③）
    function remove(historyId) {
        var doc = readDoc();
        var owner = ownerId();
        var mine = doc.owners[owner] || {};
        if (!mine[String(historyId)]) return false;
        delete mine[String(historyId)];
        writeDoc(doc);
        notifyChanged();
        return true;
    }

    // ======================= 视图数据：行 = 历史记录 + 索引 =======================

    // 一条台账行。历史记录缺了就从结果里消失 —— 索引指向一条不存在的历史，
    // 这种"幽灵行"必须在这里滤掉：它是索引与历史不同步时唯一诚实的表现。
    function rowsFor(list, index) {
        return list.map(function (rec) {
            if (!rec || typeof rec !== 'object') return null;
            var hid = String(rec.id || '');
            if (!hid) return null;
            var e = index[hid] || null;
            var periodKey = (e && e.periodKey) || periodKeyOf(rec.date);
            return {
                historyId: hid,
                title: String(rec.title || '').trim() || '测算记录',
                date: rec.date || '',
                toolId: toolIdOf(rec),
                source: rec.source === 'quick' ? 'quick' : 'deep',
                periodKey: periodKey,
                periodLabel: monthLabel(periodKey),
                status: e ? e.status : STATUS[0].value,
                entityId: e ? e.entityId : null,
                archived: !!e
            };
        }).filter(Boolean);
    }

    function rows() {
        var index = {};
        entries().forEach(function (e) { index[e.historyId] = e; });
        return rowsFor(historyRecords(), index);
    }

    // 权益边界 ②：保留期只管**看得见几个月**，不删任何东西。
    // 免费用户看到近三个月；更老的条目还在文档里，升级后原地出现 ——
    // 门槛设在"视野"上而不是"数据"上，是因为删掉的数据用户没法自己变回来。
    // nowKey 只在单测里传（把"今天"钉住）；线上永远走 periodKeyOf(new Date())。
    // 把时间作为参数而不是藏在函数里，这条权益边界才能被断言 —— 否则测保留期只能等真的过三个月。
    function retentionFloorKey(nowKey) {
        if (isPro()) return '';
        var key = isValidPeriodKey(nowKey) ? nowKey : periodKeyOf(new Date());
        return addMonths(key, -(FREE_MONTHS - 1));
    }

    function visibleRows(nowKey) {
        var floorKey = retentionFloorKey(nowKey);
        if (!floorKey) return rows();
        return rows().filter(function (r) {
            if (!isValidPeriodKey(r.periodKey)) return true;   // 认不出期间的按可见处理，不猜
            return r.periodKey >= floorKey;                     // 'YYYY-MM' 字典序即时间序
        });
    }

    // 差多少条被权益收起来（只用于提示文案：告诉用户"还有更早的"，而不是让它们凭空消失）
    function hiddenCount(nowKey) { return rows().length - visibleRows(nowKey).length; }

    // 按期间分组（新的在前）。台账的默认视图就是"这个月有哪些事"。
    // 「未按期」永远垫底：它是"这条连日子都没有"（旧记录），排最新会把最不可靠的那组
    // 送到用户眼前第一屏。
    function groupByPeriod(list) {
        var map = {};
        (list || []).forEach(function (r) {
            var k = r.periodKey || 'unknown';
            (map[k] = map[k] || []).push(r);
        });
        return Object.keys(map).sort(function (a, b) {
            if (a === b) return 0;
            if (a === 'unknown') return 1;
            if (b === 'unknown') return -1;
            return a < b ? 1 : a > b ? -1 : 0;
        }).map(function (k) {
            return { periodKey: k, label: k === 'unknown' ? '未按期' : monthLabel(k), rows: map[k] };
        });
    }

    function groupByScene(list) {
        var map = {};
        (list || []).forEach(function (r) {
            var k = r.toolId || 'other';
            (map[k] = map[k] || []).push(r);
        });
        return Object.keys(map).map(function (k) { return { toolId: k, rows: map[k] }; });
    }

    // 「复制上月」：同一套工具 + 同一主体，上一期最新的一条。
    // 这就是台账真正的价值 —— 重复劳动不用从头填，也不用先去找上次那条记录在哪。
    function prevMonthValues(opts) {
        opts = opts || {};
        var toolId = opts.toolId || '';
        var entityId = opts.entityId || null;
        var periodKey = opts.periodKey || periodKeyOf(new Date());
        var want = prevPeriod(periodKey);
        if (!want) return null;
        var index = {};
        entries().forEach(function (e) { index[e.historyId] = e; });
        var records = {};
        historyRecords().forEach(function (rec) { if (rec && rec.id) records[String(rec.id)] = rec; });
        var hit = rowsFor(Object.keys(records).map(function (k) { return records[k]; }), index)
            .filter(function (r) {
                return r.toolId === toolId && (r.entityId || null) === entityId && r.periodKey === want;
            })
            .sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); })[0];
        return hit ? { record: records[hit.historyId], periodKey: want } : null;
    }

    function count() { return entries().length; }

    function clearAll() {
        var s = storage();
        if (!s) return false;
        try { s.removeItem(KEY); return true; } catch (e) { return false; }
    }

    window.EuriskoLedger = {
        KEY: KEY,
        HISTORY_KEY: HISTORY_KEY,
        STATUS: STATUS,
        FREE_MONTHS: FREE_MONTHS,
        // --- 索引 ---
        attach: attach,
        entry: entry,
        entries: entries,
        remove: remove,
        setStatus: setStatus,
        setPeriod: setPeriod,
        setEntity: setEntity,
        count: count,
        clearAll: clearAll,
        // --- 视图 ---
        rows: rows,
        rowsFor: rowsFor,
        visibleRows: visibleRows,
        hiddenCount: hiddenCount,
        groupByPeriod: groupByPeriod,
        groupByScene: groupByScene,
        prevMonthValues: prevMonthValues,
        retentionFloorKey: retentionFloorKey,
        historyRecords: historyRecords,
        toolIdOf: toolIdOf,
        isPro: isPro,
        statusLabel: labelOfStatus,
        pure: {
            ownerId: ownerId,
            periodKeyOf: periodKeyOf,
            isValidPeriodKey: isValidPeriodKey,
            addMonths: addMonths,
            prevPeriod: prevPeriod,
            monthLabel: monthLabel,
            normalizeDoc: normalizeDoc,
            normalizeEntry: normalizeEntry,
            rowsFor: rowsFor,
            groupByPeriod: groupByPeriod,
            groupByScene: groupByScene,
            retentionFloorKey: retentionFloorKey,
            toolIdOf: toolIdOf
        }
    };
})();
