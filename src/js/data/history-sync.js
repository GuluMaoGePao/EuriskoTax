// 阶段10A：计算历史「云端同步」前端引擎（里程碑 2/2）
//
// 设计要点（与 server/src/controllers/calcSyncController.js 协议一一对应）：
//   - 写主在本端（taxCalculationHistory 仍为唯一本地数据源），云端仅镜像；
//   - 同步粒度 = 全量快照 diff：每次把本地活跃条目 + 待广播墓碑一起 push，
//     服务端按 (account, clientId) 幂等 upsert、updatedAt 新者胜，返回全量 active + deletedClientIds；
//   - 删除已同步记录时记录墓碑（deletedAt），登出/换设备后其它端据此清除；
//   - 登出清空本地后再次登录：本地为空 → pull 云端全量 → 实现换设备/重装找回；
//   - 自动同步仅限「已登录 + 专业版(未过期) + 在线」，失败保留本地数据、联网后自动重试。
//
// 本文件为普通全局 script，挂 window.EuriskoSync：
//   - 供普通 script 保存/删除入口调用 recordLocalDelete / 依赖自定义事件驱动；
//   - 供 module（auth-ui.js）调用 restore / afterLogin / afterLogout / updateUser / syncNow / getState；
//   - window.EuriskoSync.pure 暴露纯函数，供 jest 直接单测（幂等/冲突/墓碑/合并）。
(function () {
    'use strict';

    const HISTORY_KEY = 'taxCalculationHistory';
    const META_KEY = 'taxSyncMeta';
    const MUTATION_EVENT = 'euriskotax:history-mutated';
    const SYNCED_EVENT = 'euriskotax:history-synced';
    const STATUS_EVENT = 'euriskotax:sync-status';
    // 服务端 single-item bytes 限制为单条；这里放宽为单条 ≤48KB 的本地防御
    const DEBOUNCE_MS = 1500;         // 连续保存/删除合并为一次同步
    // type 兼容映射：本地「综合所得」历史用 forward，云端协议统一为 comprehensive
    const CLOUD_TYPE_MAP = { forward: 'comprehensive' };
    // 云端回本地反向映射：comprehensive → forward（与本地历史 UI / 导出命名约定保持一致）
    const LOCAL_TYPE_MAP = { comprehensive: 'forward' };
    const getApiBase = () => {
        // 测试/沙箱覆盖钩子：真实浏览器不会设置；verify-cloud-sync-engine.js 用它指到随机端口后端
        if (typeof window !== 'undefined' && window.__EURISKO_SYNC_API_BASE__) return window.__EURISKO_SYNC_API_BASE__;
        const host = (typeof window !== 'undefined' && window.location) ? window.location.hostname : '';
        if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:3000/api';
        return `${window.location.protocol}//${window.location.host}/api`;
    };

    // ======================= 纯函数（可单测） =======================

    // 本地记录规范化：确保 id / type / updatedAt 存在。
    // updatedAt 缺省回退（旧数据无该字段时以 date 为准），保证与云端比较有依据。
    function normalize(rawList) {
        const list = Array.isArray(rawList) ? rawList : [];
        const seen = new Set();
        const out = [];
        for (const raw of list) {
            if (!raw || typeof raw !== 'object') continue;
            const item = Object.assign({}, raw);
            if (!item.id) item.id = String(item.clientId || item.client_id || '');
            if (!item.id || seen.has(item.id)) continue; // 缺 id 或重复 id 的记录直接丢弃，避免破坏云端幂等键
            seen.add(item.id);
            // 仅兜底本地缺省 type；forward→comprehensive 的映射只发生在 toPayload 上行瞬间
            item.type = item.type || 'forward';
            item.updatedAt = item.updatedAt || item.date || new Date().toISOString();
            out.push(item);
        }
        return out;
    }

    // 组装上行 payload：
    //   push        本地全部活跃条目（服务端幂等 + updatedAt 新者胜，不含已删记录）
    //   tombstones  待广播墓碑（仅针对云端已知 clientId，未同步过的本地删除不产生云端垃圾行）
    function toPayload(history, meta) {
        const list = normalize(history);
        const metaObj = meta || {};
        const activeIds = new Set(list.map((i) => i.id));
        const knownCloudIds = new Set(Array.isArray(metaObj.cloudIds) ? metaObj.cloudIds : []);
        const seen = new Set();
        const push = list.map((item) => ({
            clientId: item.id,
            type: CLOUD_TYPE_MAP[item.type] || item.type,
            data: {
                title: item.title || '',
                date: item.date || item.updatedAt,
                results: item.results || null
            },
            updatedAt: item.updatedAt
        }));
        // 墓碑仅针对「云端已知且本地已删」的 clientId 广播，避免为从未同步过的记录在云端制造垃圾行
        const tombstones = (metaObj.tombstones || [])
            .filter((t) => t && t.clientId && knownCloudIds.has(t.clientId) && !activeIds.has(t.clientId))
            .filter((t) => !seen.has(t.clientId) && seen.add(t.clientId)) // 去重
            .map((t) => ({
                clientId: t.clientId,
                type: 'comprehensive', // 墓碑仅需 type 通过服务端枚举校验
                data: {},
                updatedAt: t.deletedAt || t.updatedAt || new Date().toISOString(),
                deletedAt: t.deletedAt || t.updatedAt || new Date().toISOString()
            }));
        return { push: push.concat(tombstones) };
    }

    // 合并云端回包（records 全量 active + deletedClientIds 云端已删集合）
    // 返回 { history, meta }；meta.cloudIds 更新为云端 active clientId 集合（删除墓碑判据）
    function mergeCloud(history, meta, cloud) {
        const list = normalize(history);
        const m = Object.assign({}, meta || {});
        const records = Array.isArray(cloud && cloud.records) ? cloud.records : [];
        const deletedIds = new Set(Array.isArray(cloud && cloud.deletedClientIds) ? cloud.deletedClientIds : []);
        const tsOf = (v) => {
            const t = new Date(v).getTime();
            return Number.isFinite(t) ? t : 0;
        };

        // 云端已删（含本端刚广播的墓碑）：本地对应记录移除
        const kept = list.filter((item) => !deletedIds.has(item.id));
        const byId = new Map(kept.map((i) => [i.id, i]));

        for (const rec of records) {
            if (!rec || !rec.clientId) continue;
            const local = byId.get(rec.clientId);
            const cloudData = rec.data || {};
            const makeRecord = (fromLocal) => ({
                id: rec.clientId,
                type: LOCAL_TYPE_MAP[rec.type] || rec.type || 'forward',
                title: cloudData.title !== undefined ? cloudData.title : (fromLocal ? fromLocal.title : ''),
                date: cloudData.date !== undefined ? cloudData.date : (fromLocal ? fromLocal.date : rec.updatedAt),
                results: cloudData.results !== undefined && cloudData.results !== null
                    ? cloudData.results
                    : (fromLocal ? fromLocal.results : null),
                updatedAt: rec.updatedAt,
                fromCloud: true
            });
            if (!local) {
                // 云端有、本地无（新设备 / 登出后重新登录拉回）→ 追加本地
                kept.push(makeRecord(null));
                continue;
            }
            // 冲突：updatedAt 新者胜（云端不旧于本地 → 以云端为准，幂等重放避免时间戳抖动）
            if (tsOf(rec.updatedAt) >= tsOf(local.updatedAt)) {
                const idx = kept.indexOf(local);
                kept[idx] = makeRecord(local);
            }
            // 本地较新：保留本地，下次 push 覆盖云端
        }

        const tombKeeper = new Set(deletedIds);
        const tombstones = (m.tombstones || []).filter((t) => t && !tombKeeper.has(t.clientId));

        return {
            history: kept,
            meta: Object.assign({}, m, {
                cloudIds: records.map((r) => r.clientId),
                tombstones
            })
        };
    }

    // ======================= 运行时引擎 =======================

    let account = null;                 // 当前登录邮箱
    let plan = 'free';
    let planExpiresAt = null;
    let attached = false;
    let busy = false;
    let dirtyWhileBusy = false;
    let debounceTimer = null;
    let lastResult = { status: 'idle', at: null, message: '', syncedCount: 0, recordsPulled: 0 };

    const isProActive = () => {
        const p = (typeof window !== 'undefined' && window.EuriskoPlan) ? window.EuriskoPlan : null;
        return p ? p.isPro(plan, planExpiresAt) : false;
    };
    const getToken = () => {
        try {
            return sessionStorage.getItem('auth_token') || localStorage.getItem('auth_token');
        } catch (e) {
            return null;
        }
    };
    const readMeta = () => {
        try {
            const raw = JSON.parse(localStorage.getItem(META_KEY) || 'null');
            if (raw && typeof raw === 'object') {
                return {
                    account: null, lastSyncAt: null, cloudIds: [], tombstones: [], ...raw
                };
            }
        } catch (e) { /* 损坏则重置 */ }
        return { account: null, lastSyncAt: null, cloudIds: [], tombstones: [] };
    };
    const writeMeta = (meta) => {
        try {
            localStorage.setItem(META_KEY, JSON.stringify(meta));
        } catch (e) { /* 写入失败静默（配额满时云同步暂停，本地数据不受影响） */ }
    };
    const publish = (patch) => {
        lastResult = { ...lastResult, ...patch, at: new Date().toISOString() };
        if (typeof document === 'undefined' || typeof CustomEvent === 'undefined') return;
        try {
            document.dispatchEvent(new CustomEvent(STATUS_EVENT, { detail: { ...lastResult } }));
        } catch (e) { /* 事件派发失败不影响主流程 */ }
    };
    const getState = () => ({
        account,
        loggedIn: !!account,
        plan,
        proActive: isProActive(),
        lastSyncAt: lastResult.at,
        status: lastResult.status,
        message: lastResult.message,
        syncedCount: lastResult.syncedCount,
        recordsPulled: lastResult.recordsPulled
    });

    async function doSync() {
        if (!account) return getState();
        const meta = readMeta();
        // 换账号（登出未清理等防御）：不同账号的云端幂等键/墓碑不混用
        const baseMeta = (meta.account && meta.account !== account) ? { account, cloudIds: [], tombstones: [] } : meta;
        const localList = normalize((() => {
            try {
                return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
            } catch (e) {
                return [];
            }
        })());
        const { push } = toPayload(localList, baseMeta);

        const token = getToken();
        if (!token) {
            publish({ status: 'error', message: '登录状态已失效，请重新登录后同步', syncedCount: 0, recordsPulled: 0 });
            return getState();
        }

        publish({ status: 'syncing', message: '正在同步计算历史…', syncedCount: 0, recordsPulled: 0 });
        try {
            const response = await fetch(`${getApiBase()}/calculations/sync`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ push })
            });
            let result = null;
            try { result = await response.json(); } catch (e) { result = null; }

            if (!response.ok || !result || !result.success) {
                const errMsg = (result && result.error && result.error.message) || `同步失败（HTTP ${response.status}）`;
                const statusCode = (result && result.error && result.error.statusCode) || response.status;
                const code = (result && result.error && result.error.code) || null;
                if (statusCode === 401) {
                    // 与 api-client.js 行为一致：token 失效 → 清理登录态并回登录页
                    try {
                        localStorage.removeItem('auth_token');
                        sessionStorage.removeItem('auth_token');
                        localStorage.removeItem('current_user');
                        sessionStorage.removeItem('current_user');
                    } catch (e) { /* 忽略 */ }
                    if (typeof window !== 'undefined' && window.location) window.location.reload();
                    throw new Error('登录已过期，请重新登录');
                }
                const message = code === 'HISTORY_LIMIT_REACHED'
                    ? errMsg
                    : code === 'PRO_REQUIRED'
                        ? (window.EuriskoPlan ? window.EuriskoPlan.PRO_FEATURE_HINT : errMsg)
                        : errMsg;
                publish({ status: 'error', message, syncedCount: 0, recordsPulled: 0 });
                return getState();
            }

            const data = (result && result.data) || { records: [], deletedClientIds: [] };
            const merged = mergeCloud(localList, baseMeta, data);
            try {
                localStorage.setItem(HISTORY_KEY, JSON.stringify(merged.history));
            } catch (e) { /* 本地写入失败：云已更新，下次再合并 */ }
            writeMeta({ ...merged.meta, account, lastSyncAt: new Date().toISOString() });

            publish({
                status: 'synced',
                message: '同步完成',
                syncedCount: push.length,
                recordsPulled: Array.isArray(data.records) ? data.records.length : 0
            });
            if (typeof document !== 'undefined' && typeof CustomEvent !== 'undefined') {
                try {
                    document.dispatchEvent(new CustomEvent(SYNCED_EVENT, {
                        detail: { syncedAt: lastResult.at, recordsPulled: lastResult.recordsPulled }
                    }));
                } catch (e) { /* 忽略 */ }
            }
        } catch (err) {
            // 网络不可用/服务暂不可达：保留本地数据，状态提示稍后自动重试（不弹窗打断）
            publish({
                status: 'error',
                message: (err && err.message && String(err.message).includes('登录'))
                    ? err.message
                    : '网络连接异常，已保留本地数据，联网后将自动重试',
                syncedCount: 0,
                recordsPulled: 0
            });
        }
        return getState();
    }

    function scheduleSync() {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            debounceTimer = null;
            if (busy) { dirtyWhileBusy = true; return; }
            busy = true;
            doSync().finally(() => {
                busy = false;
                if (dirtyWhileBusy) {
                    dirtyWhileBusy = false;
                    scheduleSync();
                }
            });
        }, DEBOUNCE_MS);
    }

    function onLocalMutation() {
        if (!account) return;          // 未登录不同步
        if (!isProActive()) return;    // 免费版不触发（保留本地，界面在数据管理页提示 PRO gate）
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return; // 离线等联网事件
        scheduleSync();
    }

    function bind(user) {
        account = user && user.email ? user.email : null;
        plan = (user && user.plan) || 'free';
        planExpiresAt = (user && user.plan_expires_at) || null;
    }

    const engine = {
        // 页面加载恢复会话：已登录则防抖自动同步（本地为空 → pull 云端找回）
        restore(user) {
            bind(user);
            if (account) scheduleSync();
            return getState();
        },
        // 登录成功：立刻触发同步（后台，不阻塞登录跳转）
        afterLogin(user) {
            bind(user);
            scheduleSync();
            return getState();
        },
        // 更新 plan/过期信息（profile 接口刷新后调用，如种子授权登录自动升级）
        updateUser(user) {
            bind(user);
            return getState();
        },
        // 登出/注销：清内存状态与本地同步元数据（防换号残留墓碑/cloudIds）
        afterLogout() {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = null;
            busy = false;
            dirtyWhileBusy = false;
            account = null;
            plan = 'free';
            planExpiresAt = null;
            try {
                localStorage.removeItem(META_KEY);
            } catch (e) { /* 忽略 */ }
            lastResult = { status: 'idle', at: null, message: '', syncedCount: 0, recordsPulled: 0 };
            return getState();
        },
        // 手动「立即同步」（数据管理页按钮），返回 Promise<state> 供 UI 展示错误提示
        syncNow() {
            if (busy) {
                dirtyWhileBusy = true;
                return Promise.resolve(getState());
            }
            if (!account) return Promise.resolve(getState());
            busy = true;
            return doSync().finally(() => {
                busy = false;
                if (dirtyWhileBusy) {
                    dirtyWhileBusy = false;
                    scheduleSync();
                }
            });
        },
        // 本地删除已同步记录 → 入墓碑（仅云端已知 clientId），下次同步广播给其它设备
        recordLocalDelete(clientId) {
            if (!account || !clientId) return;
            const meta = readMeta();
            if (!Array.isArray(meta.cloudIds) || !meta.cloudIds.includes(clientId)) return; // 未同步过无需墓碑
            const list = meta.tombstones || [];
            if (!list.some((t) => t.clientId === clientId)) {
                list.push({ clientId, deletedAt: new Date().toISOString() });
            }
            writeMeta({ ...meta, tombstones: list });
        },
        getState,
        // 纯逻辑暴露（单测用）
        pure: { normalize, toPayload, mergeCloud, CLOUD_TYPE_MAP, LOCAL_TYPE_MAP, MUTATION_EVENT, SYNCED_EVENT, STATUS_EVENT }
    };

    // 事件自注册（本普通脚本在 </body> 前加载，document 已就绪）：
    // 本地历史变更信号由 data-management.js / tax-calculator.js / auth-ui.js 在写库后 dispatch
    if (typeof document !== 'undefined' && !attached) {
        attached = true;
        document.addEventListener(MUTATION_EVENT, onLocalMutation);
        if (typeof window !== 'undefined') {
            window.addEventListener('online', () => {
                if (account && isProActive()) scheduleSync();
            });
        }
    }

    window.EuriskoSync = engine;
})();
