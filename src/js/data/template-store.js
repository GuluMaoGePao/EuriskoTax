/**
 * 阶段19-9 · 效率层 E2：参数模板（Template）
 *
 * 一句话职责：把「某个工具的一套已填参数」存下来，下次一键带出（§3.10.3）。
 *
 * 与相邻概念的分工（混了就做不准）：
 *   · 参数记忆（19-8）：同一个工具只留**一份**「上次输入」，自动带出，不用管它。
 *   · 方案 scenario：存的是**算出来的数**，用来对比。
 *   · 模板 template：存的是**填进去的参数**，用来复用 —— 可以有很多份、有名字、可挂主体。
 * 所以：模板不是「记忆的加强版」，它是「用户知道自己要复用什么」时的那个东西 ——
 * 月度台账模板 / 甲乙两种客户口径 / 同一套社保比例给不同子公司，都是一份命名过的输入。
 *
 * 三条边界：
 *   ① **只收注册表声明过的字段**：存与取都按 tool.fields 的 key 过滤。
 *      模板可能被手改、被扩展过的旧版本写过 —— 不过滤等于给 compute 开一个
 *      任意参数的入口（这条与 19-8 带参链接是同一个口径）。
 *   ② **存全字段（含 advanced）**：填充时再由当前视图决定显示几项。
 *      简明视图下模板的高级参数照样参与计算 —— 「看得少」不等于「算得少」，
 *      否则同一份模板在两个视图下算出两个数，双视图就真的变成了两个产品。
 *   ③ **权益额度只拦新增**：免费 2 份（总数，不按工具计），Pro 无限；
 *      超出时不删任何旧模板，也**不加第三颗升级按钮**（阶段14 约束：入口只有顶栏 pill
 *      与个人中心横幅两处），只给一句带出处的说明文字。
 *
 * 对外接口：window.EuriskoTemplates
 */
(function () {
    'use strict';

    var KEY = 'euriskoTemplates';
    var MAX_FREE = 2;              // §3.10.9 权益刻度：免费 2 份模板（全部工具合计）
    var LOCAL_OWNER = 'local';

    // ======================= 纯函数（可单测） =======================

    // 与 scenario-store.js / entity-store.js 同一套账户隔离策略
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

    function newId() {
        return 't_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
    }

    // 该工具认哪些键：**全字段**，不分视图、不看 when（条件字段此时可能没显示，
    // 但它在另一组口径下会显示 —— 删掉它就等于让用户换一次选择就丢一批参数）。
    function keysOfTool(tool) {
        return ((tool && tool.fields) || []).map(function (f) { return f.key; });
    }

    // 边界 ①：只留工具声明过的键。返回过滤后的新对象，不改入参。
    function keepDeclared(tool, values) {
        var keys = keysOfTool(tool);
        var out = {};
        if (!values || typeof values !== 'object') return out;
        Object.keys(values).forEach(function (k) {
            if (keys.indexOf(k) !== -1) out[k] = values[k];
        });
        return out;
    }

    function registry() { return (typeof window !== 'undefined') ? window.EuriskoToolRegistry : null; }

    function toolOf(toolId) {
        var R = registry();
        return (R && typeof R.get === 'function' && toolId) ? R.get(toolId) : null;
    }

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
            if (!item.id || seen[item.id]) continue;      // id 是重命名 / 删除的锚，重复会串
            seen[item.id] = true;
            if (!item.toolId) continue;                   // 挂不到工具上的模板无从取用
            item.name = String(item.name || '').trim() || '未命名模板';
            item.entityId = item.entityId || null;        // null = 全局模板，任何主体下都可见
            item.ownerId = item.ownerId || LOCAL_OWNER;
            item.values = (item.values && typeof item.values === 'object') ? item.values : {};
            item.createdAt = item.createdAt || new Date().toISOString();
            item.updatedAt = item.updatedAt || item.createdAt;
            out.push(item);
        }
        return { list: out };
    }

    function limitFor(isPro) { return isPro ? Infinity : MAX_FREE; }

    function storage() {
        try { return (typeof window !== 'undefined') ? (window.localStorage || null) : null; }
        catch (e) { return null; }
    }

    function readDoc() {
        var s = storage();
        if (!s) return { list: [] };
        try {
            var raw = s.getItem(KEY);
            if (!raw) return { list: [] };
            return normalizeDoc(JSON.parse(raw));
        } catch (e) {
            return { list: [] };     // 读坏了就当没有模板，绝不让坏数据进 compute
        }
    }

    function writeDoc(doc) {
        var s = storage();
        if (!s) return false;
        try {
            s.setItem(KEY, JSON.stringify(normalizeDoc(doc)));
            return true;
        } catch (e) { return false; }
    }

    function notifyChanged() {
        try {
            if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function'
                && typeof window.CustomEvent === 'function') {
                window.dispatchEvent(new window.CustomEvent('eurisko:template-changed'));
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

    function currentEntityId() {
        var E = (typeof window !== 'undefined') ? window.EuriskoEntities : null;
        if (!E || typeof E.currentId !== 'function') return '';
        try { return E.currentId() || ''; } catch (e) { return ''; }
    }

    function all() { return readDoc().list.filter(function (t) { return t.ownerId === ownerId(); }); }
    function count() { return all().length; }

    function byId(id) {
        if (!id) return null;
        return all().filter(function (t) { return t.id === id; })[0] || null;
    }

    // 某个工具此刻**能用**的模板 = 全局模板 + 挂在当前主体下的模板。
    // 无主体时只剩全局的那几份 —— 这条就是守护测试 1 的另一半（不建主体照样能用模板）。
    function listOf(toolId) {
        if (!toolId) return [];
        var owner = ownerId();
        var ent = currentEntityId();
        return readDoc().list.filter(function (t) {
            if (t.toolId !== toolId || t.ownerId !== owner) return false;
            return t.entityId === null || (!!ent && t.entityId === ent);
        });
    }

    // 默认名：<工具名> · 模板N。不弹窗问名字 —— 让用户为了复用一件事先做一道填空题，
    // 大半人会直接放弃；名字错了在模板管理里改是同一回事，而且那时候他更清楚自己有几份。
    function defaultNameOf(tool) {
        var n = all().filter(function (t) { return t.toolId === tool.id; }).length;
        return tool.name + ' · 模板' + (n + 1);
    }

    // 存一份模板。返回 { ok, reason, template }：
    //   reason 'tool'  = 工具不在注册表里
    //   reason 'empty' = 过滤后一个键都不剩（传进来的不是这个工具的参数）
    //   reason 'limit' = 免费额度已满（已有模板一份都不删）
    function save(input) {
        var inp = (input && typeof input === 'object') ? input : {};
        var tool = toolOf(inp.toolId);
        if (!tool) return { ok: false, reason: 'tool' };
        var values = keepDeclared(tool, inp.values);
        if (!Object.keys(values).length) return { ok: false, reason: 'empty' };

        var doc = readDoc();
        var owner = ownerId();
        var mine = doc.list.filter(function (t) { return t.ownerId === owner; });
        var isEdit = !!inp.id && mine.some(function (t) { return t.id === inp.id; });
        if (!isEdit && mine.length >= limitFor(isPro())) {
            return { ok: false, reason: 'limit', limit: limitFor(isPro()), count: mine.length };
        }

        // 不传 entityId 默认挂全局：默认挂到当前主体后，用户一换主体就「我的模板不见了」——
        // 静默消失比多显示一份严重得多，所以宁可宽，由用户在管理里显式收窄。
        var entityId = inp.entityId === undefined ? null : (inp.entityId || null);
        var now = new Date().toISOString();
        var rec;
        if (isEdit) {
            doc.list = doc.list.map(function (t) {
                if (t.id !== inp.id) return t;
                rec = {
                    id: t.id, toolId: t.toolId, name: String(inp.name || t.name).trim() || t.name,
                    entityId: inp.entityId === undefined ? t.entityId : entityId,
                    ownerId: t.ownerId, values: values, createdAt: t.createdAt, updatedAt: now
                };
                return rec;
            });
        } else {
            rec = {
                id: newId(), toolId: inp.toolId, name: String(inp.name || '').trim() || defaultNameOf(tool),
                entityId: entityId, ownerId: owner, values: values, createdAt: now, updatedAt: now
            };
            doc.list.push(rec);
        }
        writeDoc(doc);
        notifyChanged();
        return { ok: true, template: rec };
    }

    function rename(id, name) {
        var clean = String(name || '').trim();
        if (!clean) return { ok: false, reason: 'name' };
        var doc = readDoc();
        var owner = ownerId();
        var hit = false;
        doc.list = doc.list.map(function (t) {
            if (t.id !== id || t.ownerId !== owner) return t;
            hit = true;
            return Object.assign({}, t, { name: clean, updatedAt: new Date().toISOString() });
        });
        writeDoc(doc);
        if (hit) notifyChanged();
        return { ok: hit };
    }

    function remove(id) {
        var doc = readDoc();
        var owner = ownerId();
        var before = doc.list.length;
        doc.list = doc.list.filter(function (t) { return !(t.id === id && t.ownerId === owner); });
        writeDoc(doc);
        if (doc.list.length < before) notifyChanged();
        return doc.list.length < before;
    }

    // 取一份模板的可用值：模板可能在别处被改过、也可能来自将来删了字段的旧版本，
    // 所以**取出时同样要过滤一次**（存入时过滤只对当时有效）。
    function valuesOf(id) {
        var t = byId(id);
        if (!t) return null;
        var tool = toolOf(t.toolId);
        if (!tool) return null;
        return keepDeclared(tool, t.values);
    }

    // 删主体时把它的模板转回全局：留在原 entityId 上会变成「还在存储里、但界面哪儿都看不到」，
    // 那是比删除更难受的一种丢 —— 用户没法解释它去哪了。
    function detachEntity(entityId) {
        if (!entityId) return 0;
        var doc = readDoc();
        var owner = ownerId();
        var n = 0;
        doc.list = doc.list.map(function (t) {
            if (t.ownerId !== owner || t.entityId !== entityId) return t;
            n++;
            return Object.assign({}, t, { entityId: null, updatedAt: new Date().toISOString() });
        });
        if (n) { writeDoc(doc); notifyChanged(); }
        return n;
    }

    function clearAll() {
        var s = storage();
        if (!s) return false;
        try { s.removeItem(KEY); return true; } catch (e) { return false; }
    }

    window.EuriskoTemplates = {
        KEY: KEY,
        MAX_FREE: MAX_FREE,
        all: all,
        count: count,
        byId: byId,
        listOf: listOf,
        save: save,
        rename: rename,
        remove: remove,
        valuesOf: valuesOf,
        detachEntity: detachEntity,
        clearAll: clearAll,
        limitFor: limitFor,
        isPro: isPro,
        defaultNameOf: function (toolId) {
            var t = toolOf(toolId);
            return t ? defaultNameOf(t) : '';
        },
        pure: {
            ownerId: ownerId,
            normalizeDoc: normalizeDoc,
            keepDeclared: keepDeclared,
            keysOfTool: keysOfTool,
            limitFor: limitFor
        }
    };
})();
