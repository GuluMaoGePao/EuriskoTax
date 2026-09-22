/**
 * 阶段19-9 · 效率层 E1：主体（Entity）
 *
 * 一句话职责：给「重复性的活」一个归属。模板挂在主体下（也可挂全局），
 * 下一阶段的台账 / 批量同样挂在主体下 —— 所以主体是效率层的地基（§3.10.2）。
 *
 * 主体 = 一个纳税实体（公司 / 个体户 / 个人）。它本身不参与任何计税：
 *   本文件只有存储与「当前主体」两件事，不写一行算法，也不自动往工具字段里塞值。
 *
 * 为什么「不自动给速算器填默认值」是刻意的：
 *   注册表里同一个 key 在不同工具里是不同口径 —— 经营所得里 key mode 是「征收方式」，
 *   倒算工具里 mode 是「到手口径」，企业所得税里又是「利润怎么填」。若按 key 同名就地注入，
 *   用户建了一个核定征收的主体后再用倒算工具，他的口径就被静默改了 —— 这正是 §3.10
 *   最忌讳的那种自作主张。真要打通，必须由 spec 显式声明映射，不能靠键名巧合。
 *   本阶段因此只做「归属」，把通畅留到 spec 声明之后。
 *
 * 三条边界：
 *   ① 无主体时全局零感知：列表为空时切换器不渲染、模板只剩全局那几份，
 *      历史 / 方案 / 导出的行为与改动前逐字一致（守护测试 1）。
 *   ② 降级不许删数据：Pro 过期只剩免费额度时，已建主体照常可用，只拦「新建」。
 *      为了一条权益把用户已经录进去的公司删掉，是最贵的一种合规。
 *   ③ 计税能力永不锁定：主体 / 模板是便利，不是计税的前置条件 —— 超限时照样能算。
 *
 * 存储：单键 euriskoEntities 存整个文档（list + currentId）——
 *   一次写入一个整体，不拆两个键（拆开会出现「列表写成功、当前主体没写」的撕裂态）。
 *   账户隔离：每条带 ownerId，多账号共用同一个 localStorage 键而互不串公司名。
 *
 * 对外接口：window.EuriskoEntities
 */
(function () {
    'use strict';

    var KEY = 'euriskoEntities';
    var MAX_FREE = 1;              // §3.10.9 权益刻度：免费 1 个主体
    var LOCAL_OWNER = 'local';

    // 主体档案五个字段：名称 / 类型 / 纳税人类型 / 征收方式 / 城市（影响社保基数口径）
    var KINDS = [
        { value: 'company', label: '企业' },
        { value: 'individual', label: '个体工商户' },
        { value: 'person', label: '个人' }
    ];
    var TAXPAYER_TYPES = [
        { value: 'small', label: '小规模纳税人' },
        { value: 'general', label: '一般纳税人' }
    ];
    var LEVY_MODES = [
        { value: 'audited', label: '查账征收' },
        { value: 'assessed', label: '核定征收' }
    ];

    // ======================= 纯函数（可单测） =======================

    // 与 scenario-store.js 同一套「优先 apiClient 缓存、回退 storage、兜底 local」策略：
    // 读不到就归本地分组 —— 游客也能用整套效率层，是本项目的一贯前提。
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

    function labelOf(list, value) {
        var hit = (list || []).filter(function (o) { return o.value === value; })[0];
        return hit ? hit.label : '';
    }

    function newId() {
        return 'e_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
    }

    function pickEntity(raw) {
        var e = (raw && typeof raw === 'object') ? raw : {};
        return {
            id: e.id ? String(e.id) : newId(),
            name: String(e.name || '').trim(),
            kind: e.kind || 'company',
            taxpayerType: e.taxpayerType || 'small',
            levyMode: e.levyMode || 'audited',
            city: String(e.city || '').trim(),
            ownerId: e.ownerId || LOCAL_OWNER,
            createdAt: e.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
    }

    function limitFor(isPro) { return isPro ? Infinity : MAX_FREE; }

    function visibleFor(list, owner) {
        return (list || []).filter(function (e) { return e.ownerId === owner; });
    }

    // 文档级规范化：无 id / 重复 id 的脏数据丢弃 —— id 是续编辑与模板挂载的唯一锚，重复会串。
    // 当前主体必须真的还在列表里：还指向那个被删掉的，界面会显示一个不存在的主体。
    function normalizeDoc(raw) {
        var doc = (raw && typeof raw === 'object') ? raw : {};
        var list = Array.isArray(doc.list) ? doc.list : [];
        var seen = {};
        var out = [];
        for (var i = 0; i < list.length; i++) {
            var r = list[i];
            if (!r || typeof r !== 'object') continue;
            var item = {};
            for (var k in r) { if (Object.prototype.hasOwnProperty.call(r, k)) item[k] = r[k]; }
            if (!item.id || seen[item.id]) continue;
            seen[item.id] = true;
            item.name = String(item.name || '').trim() || '未命名主体';
            item.kind = item.kind || 'company';
            item.taxpayerType = item.taxpayerType || 'small';
            item.levyMode = item.levyMode || 'audited';
            item.city = String(item.city || '').trim();
            item.ownerId = item.ownerId || LOCAL_OWNER;
            item.createdAt = item.createdAt || new Date().toISOString();
            item.updatedAt = item.updatedAt || item.createdAt;
            out.push(item);
        }
        var currentId = typeof doc.currentId === 'string' ? doc.currentId : '';
        if (currentId && !seen[currentId]) currentId = '';
        return { list: out, currentId: currentId };
    }

    function storage() {
        try { return (typeof window !== 'undefined') ? (window.localStorage || null) : null; }
        catch (e) { return null; }
    }

    function readDoc() {
        var s = storage();
        if (!s) return { list: [], currentId: '' };
        try {
            var raw = s.getItem(KEY);
            if (!raw) return { list: [], currentId: '' };
            return normalizeDoc(JSON.parse(raw));
        } catch (e) {
            // 读坏了就当「没有主体」而不是「有」：兜底到不启用只是少一点便利，
            // 把读坏的东西当成有主体、拿去重绘界面才是事故。
            return { list: [], currentId: '' };
        }
    }

    function writeDoc(doc) {
        var s = storage();
        if (!s) return false;
        try {
            s.setItem(KEY, JSON.stringify(normalizeDoc(doc)));
            return true;
        } catch (e) { return false; }   // 隐私模式 / 配额满：主体没了也不该影响测算本身
    }

    // 与 data-management.js 的 notifyHistoryMutated 同一思路：一处改、多处刷（切换器 / 模板条）
    function notifyChanged() {
        try {
            if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function'
                && typeof window.CustomEvent === 'function') {
                window.dispatchEvent(new window.CustomEvent('eurisko:entity-changed'));
            }
        } catch (e) { /* ignore */ }
    }

    function isPro() {
        var P = (typeof window !== 'undefined') ? window.EuriskoPlan : null;
        if (!P || typeof P.isPro !== 'function') return false;
        try {
            var u = (window.apiClient && typeof window.apiClient.getCurrentUser === 'function')
                ? window.apiClient.getCurrentUser() : null;
            return u ? !!P.isPro(u.plan, u.plan_expires_at) : false;
        } catch (e) { return false; }
    }

    function all() { return visibleFor(readDoc().list, ownerId()); }
    function count() { return all().length; }

    function byId(id) {
        if (!id) return null;
        return all().filter(function (e) { return e.id === id; })[0] || null;
    }

    function currentId() { return readDoc().currentId; }

    // 「当前主体」= 显式选中的那个；没选就是 null —— 不兜底到第一条。
    // 自动选第一条会让用户以为自己「正以某个主体在算」，而他根本没选过。
    function current() { var id = currentId(); return id ? byId(id) : null; }

    function setCurrent(id) {
        var doc = readDoc();
        doc.currentId = (id && byId(id)) ? id : '';
        var ok = writeDoc(doc);
        notifyChanged();
        return ok;
    }

    // 新建 / 编辑。返回 { ok, reason, entity }：
    //   reason 'name'  = 名称为空
    //   reason 'limit' = 免费额度已满（已建主体不受影响，见文件头边界 ②）
    function save(raw) {
        var entity = pickEntity(raw);
        if (!entity.name) return { ok: false, reason: 'name' };
        var owner = ownerId();
        entity.ownerId = owner;
        var doc = readDoc();
        var mine = visibleFor(doc.list, owner);
        var exists = !!(raw && raw.id) && mine.some(function (e) { return e.id === entity.id; });
        if (!exists && mine.length >= limitFor(isPro())) {
            return { ok: false, reason: 'limit', limit: limitFor(isPro()), count: mine.length };
        }
        if (exists) {
            doc.list = doc.list.map(function (e) {
                if (e.id !== entity.id) return e;
                var merged = {};
                for (var k in e) { if (Object.prototype.hasOwnProperty.call(e, k)) merged[k] = e[k]; }
                for (var j in entity) { if (Object.prototype.hasOwnProperty.call(entity, j)) merged[j] = entity[j]; }
                merged.createdAt = e.createdAt || entity.createdAt;   // 建号时间不因编辑而改
                return merged;
            });
        } else {
            entity.createdAt = entity.createdAt || new Date().toISOString();
            doc.list.push(entity);
        }
        // 建第一个主体时顺便设为当前：用户建它的目的就是用它在算，
        // 再让他多点一次「切换」是把操作步骤转嫁给用户。
        if (!doc.currentId || doc.currentId === entity.id) doc.currentId = entity.id;
        writeDoc(doc);
        notifyChanged();
        return { ok: true, entity: entity };
    }

    function remove(id) {
        var doc = readDoc();
        var before = doc.list.length;
        doc.list = doc.list.filter(function (e) { return e.id !== id; });
        if (doc.currentId === id) doc.currentId = '';
        // 挂在它下面的模板转回全局，而不是跟着一起消失（写在这里而不是 UI 层：
        // 这是数据一致性，任何一个删主体的调用方都该得到同一个结果）。
        var tpl = (typeof window !== 'undefined') ? window.EuriskoTemplates : null;
        if (tpl && typeof tpl.detachEntity === 'function') {
            try { tpl.detachEntity(id); } catch (e) { /* ignore */ }
        }
        writeDoc(doc);
        notifyChanged();
        return doc.list.length < before;
    }

    // 单测用：用例之间必须清干净，否则上一个用例建的主体会漏进下一个用例
    function clearAll() {
        var s = storage();
        if (!s) return false;
        try { s.removeItem(KEY); return true; } catch (e) { return false; }
    }

    window.EuriskoEntities = {
        KEY: KEY,
        KINDS: KINDS,
        TAXPAYER_TYPES: TAXPAYER_TYPES,
        LEVY_MODES: LEVY_MODES,
        MAX_FREE: MAX_FREE,
        all: all,
        count: count,
        byId: byId,
        current: current,
        currentId: currentId,
        setCurrent: setCurrent,
        save: save,
        remove: remove,
        clearAll: clearAll,
        labelOfKind: function (v) { return labelOf(KINDS, v); },
        labelOfTaxpayerType: function (v) { return labelOf(TAXPAYER_TYPES, v); },
        labelOfLevyMode: function (v) { return labelOf(LEVY_MODES, v); },
        limitFor: limitFor,
        isPro: isPro,
        // 挂 window.Xxx.pure 供 jest 直测：沿用 history-sync.js / scenario-store.js 的既有约定
        pure: {
            ownerId: ownerId,
            normalizeDoc: normalizeDoc,
            pickEntity: pickEntity,
            limitFor: limitFor,
            visibleFor: visibleFor,
            labelOf: labelOf
        }
    };
})();
