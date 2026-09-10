#!/usr/bin/env node
/**
 * 阶段10A：在 Node 沙箱中运行「真实浏览器同步引擎」（src/js/data/history-sync.js）对抗本地后端，
 * 验证前端链路端到端（A 设备本端数据 → 云端 → B 设备空本地拉回），补 HTTP 直测覆盖不到的引擎逻辑。
 *
 * 由 verify-local-auth.js 调用，传入环境变量：
 *   PORT=随机后端端口  SYNC_TOKEN=dev JWT  SYNC_EMAIL=dev 邮箱  SYNC_PREFIX=verify 行前缀
 *
 * 输出标记：ENG-A-UPLOAD-PASS / ENG-B-PULL-PASS，失败退出码非 0。
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');   // 项目根
const PLAN_SRC = fs.readFileSync(path.join(ROOT, 'src/js/auth/plan.js'), 'utf8');
const ENGINE_SRC = fs.readFileSync(path.join(ROOT, 'src/js/data/history-sync.js'), 'utf8');

const PORT = process.env.PORT;
const TOKEN = process.env.SYNC_TOKEN;
const EMAIL = process.env.SYNC_EMAIL;
const PREFIX = process.env.SYNC_PREFIX || 'engine-';
if (!PORT || !TOKEN || !EMAIL) {
    console.error('缺少 PORT / SYNC_TOKEN / SYNC_EMAIL');
    process.exit(2);
}
const API_BASE = `http://127.0.0.1:${PORT}/api`;

// 轻量 fetch（浏览器网络层最小契约：ok / status / json）
// 刻意不用 Node 18+ 全局 fetch：其 undici dispatcher 默认 keep-alive，本脚本紧跟
// process.exit() 时 socket 仍挂起，在 Windows libuv 会触发 UV_HANDLE_CLOSING abort
// （退出码 3221226505）——用原生 http + agent:false 每请求独立连接、发完即关。
function localFetch(url, init) {
    return new Promise((resolve, reject) => {
        const opts = init || {};
        const method = opts.method || 'GET';
        const headers = Object.assign({}, opts.headers || {});
        const body = typeof opts.body === 'string'
            ? opts.body
            : (opts.body ? JSON.stringify(opts.body) : null);
        const u = new URL(url);
        const req = http.request({
            hostname: u.hostname,
            port: u.port,
            path: u.pathname + u.search,
            method,
            agent: false,
            headers: Object.assign({}, headers, body ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            } : {})
        }, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                const text = Buffer.concat(chunks).toString('utf8');
                let json = null;
                try { json = JSON.parse(text); } catch (e) { /* 非 JSON 响应 */ }
                resolve({
                    ok: res.statusCode >= 200 && res.statusCode < 300,
                    status: res.statusCode,
                    json: () => Promise.resolve(json),
                    text: () => Promise.resolve(text)
                });
            });
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

// 每个沙箱 = 一台「设备」：独立的 localStorage/sessionStorage 与全局执行环境
function makeSandbox({ historyItems = [], token = TOKEN }) {
    const store = {};
    if (historyItems.length) store.taxCalculationHistory = JSON.stringify(historyItems);
    store.auth_token = token;

    const storage = {
        getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; },
        clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
        key: () => null,
        length: 0
    };

    const ctx = {
        console,
        Promise,
        Date,
        Math,
        JSON,
        Error,
        setTimeout,
        clearTimeout,
        // 轻量 fetch（原生 http + 连接即用即关，等价浏览器网络层最小契约）
        fetch: (url, init) => localFetch(url, init),
        localStorage: storage,
        sessionStorage: storage,
        navigator: { onLine: true },
        __EURISKO_SYNC_API_BASE__: API_BASE,
        __read: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null)
    };
    ctx.window = ctx; // 浏览器全局对象即沙箱全局（引擎挂 window.EuriskoPlan / window.EuriskoSync）
    vm.runInNewContext(PLAN_SRC, ctx, { filename: 'plan.js' });
    vm.runInNewContext(ENGINE_SRC, ctx, { filename: 'history-sync.js' });
    return ctx;
}

const ENG_ID = `${PREFIX}ENG-A`;
const ISO = new Date().toISOString();
const A_LOCAL_ITEM = {
    id: ENG_ID,
    type: 'business',
    title: '引擎联测-一月份经营',
    date: ISO,
    results: { income: 120000, tax: 0, taxableIncome: 60000 },
    updatedAt: ISO
};
const USER = { email: EMAIL, plan: 'pro', plan_expires_at: null };

(async () => {
    // ---- A 设备：本端已有 1 条离线记录 → 登录后上传 ----
    const deviceA = makeSandbox({ historyItems: [A_LOCAL_ITEM] });
    deviceA.EuriskoSync.updateUser(USER);
    const aState = await deviceA.EuriskoSync.syncNow();
    const aHist = JSON.parse(deviceA.__read('taxCalculationHistory') || '[]');
    const aOk = aState.status === 'synced'
        && aHist.some((r) => r.id === ENG_ID)
        && JSON.parse(deviceA.__read('taxSyncMeta') || '{}').account === EMAIL;
    console.log(aOk ? 'ENG-A-UPLOAD-PASS' : `ENG-A-FAIL state=${aState.status}`);

    // ---- B 设备：全新空本地（重装/换机场景）→ 登录拉回 A 的记录 ----
    const deviceB = makeSandbox({ historyItems: [] });
    deviceB.EuriskoSync.updateUser(USER);
    const bState = await deviceB.EuriskoSync.syncNow();
    const bHist = JSON.parse(deviceB.__read('taxCalculationHistory') || '[]');
    const pulled = bHist.find((r) => r.id === ENG_ID);
    const bOk = bState.status === 'synced' && !!pulled && pulled.title === A_LOCAL_ITEM.title && pulled.results.income === 120000;
    console.log(bOk ? 'ENG-B-PULL-PASS' : `ENG-B-FAIL state=${bState.status}`);

    process.exit(aOk && bOk ? 0 : 1);
})().catch((e) => {
    console.error('ENG-RUN-ERR', e && e.message);
    process.exit(1);
});
