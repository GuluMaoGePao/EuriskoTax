// 阶段12 A4：方案对比中心 —— 方案库存储层
//
// 设计要点：
//   - 纯逻辑与 localStorage 读写分离：normalize / buildSummary / upsert / removeById
//     均为纯函数，挂在 window.EuriskoScenarios.pure 供 jest 直接单测
//     （沿用 history-sync.js「挂 window.Xxx.pure」的既有约定）。
//   - 数据结构预留云同步：每条方案自带 id / updatedAt / ownerId，
//     未来接 Pro 云端同步时可直接复用 history-sync.js 的
//     「(account, clientId) 幂等 upsert + updatedAt 新者胜 + 墓碑」协议，
//     本期不写后端。
//   - 账户隔离：方案带 ownerId，list() 按当前账户过滤，
//     多账号共用同一 localStorage 键但界面互不串数据（登出不清数据、切回可见）。
//   - 付费边界：免费版最多 2 套，专业版最多 10 套（仅限制「方案数量与云同步」，
//     计税能力本身永不锁定）。
(function () {
    'use strict';

    const STORAGE_KEY = 'taxScenarios';
    const MAX_FREE = 2;
    const MAX_PRO = 10;
    const LOCAL_OWNER = 'local';

    // ======================= 纯函数（可单测） =======================

    function num(v) {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
    }

    // 读取当前账户标识：优先 apiClient 缓存，回退 storage（与 final-report.js 的
    // getCurrentUser 双级读取策略保持一致）；未登录时归入 'local' 分组。
    function currentOwnerId() {
        try {
            if (typeof window !== 'undefined' && window.apiClient
                && typeof window.apiClient.getCurrentUser === 'function') {
                const u = window.apiClient.getCurrentUser();
                if (u && (u.id || u.userId)) return String(u.id || u.userId);
            }
            const raw = (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('current_user') : null)
                || (typeof localStorage !== 'undefined' ? localStorage.getItem('current_user') : null);
            if (raw) {
                const u = JSON.parse(raw);
                if (u && (u.id || u.userId)) return String(u.id || u.userId);
            }
        } catch (e) { /* ignore */ }
        return LOCAL_OWNER;
    }

    // 列表规范化：丢弃无 id / 重复 id 的脏数据，补全必要字段
    function normalize(rawList) {
        const list = Array.isArray(rawList) ? rawList : [];
        const seen = new Set();
        const out = [];
        for (const raw of list) {
            if (!raw || typeof raw !== 'object') continue;
            const item = Object.assign({}, raw);
            if (!item.id || seen.has(item.id)) continue;
            seen.add(item.id);
            item.name = item.name || '未命名方案';
            item.ownerId = item.ownerId || LOCAL_OWNER;
            item.createdAt = item.createdAt || item.updatedAt || new Date().toISOString();
            item.updatedAt = item.updatedAt || item.createdAt;
            item.summary = Object.assign({}, item.summary);
            out.push(item);
        }
        return out;
    }

    // 从计算结果的摘要字段构建对比指标（纯函数）
    function buildSummary(results) {
        const r = results || {};
        const income = r.incomeDetails || {};
        const tax = r.taxDetails || {};
        const months = num(r.workMonths) || 12;

        const preTaxTotal = num(income.preTaxTotal);
        const totalTax = num(tax.totalTax);
        const bonusTax = num(income.bonusTax);
        const taxTotal = totalTax + bonusTax;
        const netIncome = num(tax.netIncome);
        const bonus = num(income.bonus);
        const bonusInclude = !!income.bonusInclude;

        return {
            preTaxTotal: preTaxTotal,
            netIncome: netIncome,
            totalTax: totalTax,
            bonusTax: bonusTax,
            taxTotal: taxTotal,
            // 实际税负率 = 全年总税额 / 税前年收入
            effectiveRate: preTaxTotal > 0 ? taxTotal / preTaxTotal : 0,
            // 月均到手（含年终奖在内的全年税后收入按月摊）
            monthlyNet: months > 0 ? netIncome / months : 0,
            bonus: bonus,
            bonusInclude: bonusInclude,
            bonusMethod: bonus > 0 ? (bonusInclude ? '并入综合所得' : '单独计税') : '无年终奖'
        };
    }

    // 生成方案 id（时间戳 + 随机后缀，避免同毫秒内连续保存冲突）
    function makeId() {
        return 'sc_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    }

    // 新增或按 id 覆盖；返回新的列表（不修改入参）
    function upsert(rawList, scenario) {
        const list = normalize(rawList);
        const idx = list.findIndex((i) => i.id === scenario.id);
        if (idx >= 0) {
            const merged = Object.assign({}, list[idx], scenario, { updatedAt: new Date().toISOString() });
            const next = list.slice();
            next[idx] = merged;
            return next;
        }
        return list.concat([Object.assign({}, scenario, {
            createdAt: scenario.createdAt || new Date().toISOString(),
            updatedAt: scenario.updatedAt || new Date().toISOString()
        })]);
    }

    // 按 id 删除；返回新的列表（不修改入参）
    function removeById(rawList, id) {
        return normalize(rawList).filter((i) => i.id !== id);
    }

    // 当前档位可保存的方案上限
    function limitFor(isPro) {
        return isPro ? MAX_PRO : MAX_FREE;
    }

    // 按账户过滤
    function filterByOwner(rawList, ownerId) {
        return normalize(rawList).filter((i) => i.ownerId === ownerId);
    }

    // ======================= 存储读写 =======================

    function readAll() {
        try {
            const raw = (typeof localStorage !== 'undefined') ? localStorage.getItem(STORAGE_KEY) : null;
            return normalize(raw ? JSON.parse(raw) : []);
        } catch (e) {
            return [];
        }
    }

    function writeAll(list) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(normalize(list)));
            return true;
        } catch (e) {
            return false;
        }
    }

    // 当前账户可见的方案列表
    function list() {
        return filterByOwner(readAll(), currentOwnerId());
    }

    // 保存一个方案（含上限校验）；overwriteId 用于更新既有方案
    function save(scenario, options) {
        const opts = options || {};
        const ownerId = currentOwnerId();
        const all = readAll();
        const mine = filterByOwner(all, ownerId);
        const isPro = !!opts.isPro;
        const limit = limitFor(isPro);

        const exists = !!scenario.id && mine.some((i) => i.id === scenario.id);
        if (!exists && mine.length >= limit) {
            return { ok: false, reason: 'limit', limit: limit, count: mine.length, needPro: !isPro };
        }

        const record = Object.assign({}, scenario, {
            id: scenario.id || makeId(),
            ownerId: ownerId
        });

        const nextAll = upsert(all, record);
        if (!writeAll(nextAll)) {
            return { ok: false, reason: 'storage' };
        }
        return { ok: true, scenario: record, count: filterByOwner(nextAll, ownerId).length };
    }

    function remove(id) {
        const nextAll = removeById(readAll(), id);
        if (!writeAll(nextAll)) return { ok: false, reason: 'storage' };
        return { ok: true };
    }

    window.EuriskoScenarios = {
        STORAGE_KEY: STORAGE_KEY,
        MAX_FREE: MAX_FREE,
        MAX_PRO: MAX_PRO,
        LOCAL_OWNER: LOCAL_OWNER,

        currentOwnerId: currentOwnerId,
        list: list,
        save: save,
        remove: remove,
        limitFor: limitFor,
        makeId: makeId,

        // 纯函数出口（供 jest 单测与未来云同步复用）
        pure: {
            normalize: normalize,
            buildSummary: buildSummary,
            upsert: upsert,
            removeById: removeById,
            filterByOwner: filterByOwner,
            limitFor: limitFor,
            makeId: makeId
        }
    };
})();
