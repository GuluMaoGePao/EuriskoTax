#!/usr/bin/env node
// =============================================================================
// EuriskoTax 生产内容种子（运维后台 API 版）
//
// 背景（阶段11）：公共内容端点改为读数据库（ContentItem / ContentRelease），
//   server/data/content/tax-policy.json 退役为「纯种子源」。
//   因此「换新库 / 重置生产库」后线上内容表为空，会导致：
//     ops-check-prod.ps1 判定 /api/content/tax-policy「version 为空 + items=0」→ 发布门禁永远不绿。
//   本脚本通过后台 API 把种子源幂等补进生产库，作为发布流水线的一环。
//
// 凭证（v1.146.0 起）：
//   生产只能用**工作人员账号登录**（ADMIN_STAFF_EMAIL / ADMIN_STAFF_PASSWORD，
//   环境变量或 server/.env）—— 静态令牌 ADMIN_TOKEN_PROD 已被中间件在生产永久拒绝。
//   建议专门开一个 role=admin 的运维账号给本脚本用：补种只要内容权限，不需要管人的权限。
//
// 与 server/scripts/seed-content.js 的关系：
//   同一份种子源、同一套字段映射；区别是前者直连数据库（本地/可访问库），
//   本脚本走 HTTP（正式库在腾讯云服务器内网，本地直连不到）。
//
// 幂等性：
//   - 条目按 item_id 判断，已存在一律跳过（不覆盖后台人工改动）；
//   - 发布批次仅在「本次新增了条目」或「该版本批次不存在」时才登记，
//     无变化的复跑不会刷新 published_at（不产生副作用）。
//
// 用法：
//   node tools/ops/ops-seed-prod.js                      # 默认打生产域名
//   node tools/ops/ops-seed-prod.js --dry-run            # 只报告将要做什么，不写库
//   node tools/ops/ops-seed-prod.js --wait=180           # 等后台接口就绪（新构建滚动中）
//   node tools/ops/ops-seed-prod.js --base-url=http://localhost:3000
//   node tools/ops/ops-seed-prod.js --token=xxx          # 本地/旧环境可用静态令牌；生产请用下方账号凭证
//                                                        # 凭证也可走环境变量：ADMIN_STAFF_EMAIL / ADMIN_STAFF_PASSWORD
//
// 退出码：
//   0 = 成功（含「无变化」）  1 = 失败（网络/接口/数据）  2 = 未配置任何生产凭证（调用方可据此跳过）
// =============================================================================
const fs = require('fs');
const path = require('path');

const OPS_DIR = __dirname;
const PROJECT_ROOT = path.resolve(OPS_DIR, '..', '..');
const SERVER_DIR = path.join(PROJECT_ROOT, 'server');
const SERVER_ENV_FILE = path.join(SERVER_DIR, '.env');
const CONTENT_FILE = path.join(SERVER_DIR, 'data', 'content', 'tax-policy.json');
// v1.116.0：切境内节点后生产地址改为正式域名。留着旧域的后果是——
// 若把 BASE_URL 指回 Zeabur（已降级的测试环境）再跑播种，内容会灌进那个旧库，而正式库（腾讯云）里一条都没有，
// 表现为「线上没内容」且极难定位（脚本退 0、看着像成功了）。
const DEFAULT_BASE_URL = 'https://euriskotax.com';

const EXIT_OK = 0;
const EXIT_FAIL = 1;
const EXIT_NO_TOKEN = 2;

const argv = process.argv.slice(2);
const hasFlag = (name) => argv.includes(name);
const argValue = (name) => {
    const prefix = `${name}=`;
    const inline = argv.find((a) => a.startsWith(prefix));
    if (inline) return inline.slice(prefix.length);
    const idx = argv.indexOf(name);
    return idx >= 0 && argv[idx + 1] && !argv[idx + 1].startsWith('--') ? argv[idx + 1] : '';
};

const QUIET = hasFlag('--quiet');
const DRY_RUN = hasFlag('--dry-run');
const BASE_URL = (argValue('--base-url') || process.env.EURISKO_PROD_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
const WAIT_SECONDS = Math.max(0, parseInt(argValue('--wait') || '0', 10) || 0);

const log = (...args) => { if (!QUIET) console.log(...args); };
const say = (...args) => console.log(...args);

function printHelp() {
    console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 30).join('\n'));
}

// 解析 server/.env（只取需要的键，避免为一处取值引入依赖）
function readEnvFile(file) {
    const out = {};
    if (!fs.existsSync(file)) return out;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
        if (!m) continue;
        let value = m[2].trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        out[m[1]] = value;
    }
    return out;
}

function resolveToken() {
    if (process.env.ADMIN_TOKEN_PROD) return process.env.ADMIN_TOKEN_PROD.trim();
    const env = readEnvFile(SERVER_ENV_FILE);
    return (env.ADMIN_TOKEN_PROD || '').trim();
}

// v1.146.0：静态令牌（ADMIN_TOKEN_PROD）在生产已被中间件永久拒绝 ——
// 生产补种改用**工作人员账号登录**拿短期 JWT：2 小时过期、可按人吊销、留 last_login，
// 比一把永不过期且不留痕的静态字符串好得多。
//
// 凭证读 ADMIN_STAFF_EMAIL / ADMIN_STAFF_PASSWORD（环境变量或 server/.env）。
// 建议专门开一个 role=admin 的运维账号给脚本用，而不是填自己的 owner 账号 ——
// 补种只需要内容权限，不需要管人的权限。
function resolveStaffCredentials() {
    const env = readEnvFile(SERVER_ENV_FILE);
    return {
        email: (process.env.ADMIN_STAFF_EMAIL || env.ADMIN_STAFF_EMAIL || '').trim(),
        password: process.env.ADMIN_STAFF_PASSWORD || env.ADMIN_STAFF_PASSWORD || ''
    };
}

async function loginAsStaff() {
    const { email, password } = resolveStaffCredentials();
    if (!email || !password) return null;
    try {
        const res = await fetch(`${BASE_URL}/api/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const parsed = await res.json().catch(() => null);
        if (res.ok && parsed && parsed.success !== false && parsed.data && parsed.data.token) {
            log(`  已登录工作人员账号：${email}`);
            return parsed.data.token;
        }
        log(`  工作人员登录失败（HTTP ${res.status}）：${email}`);
        return null;
    } catch (err) {
        log(`  工作人员登录异常：${err.message}`);
        return null;
    }
}

function loadSeedSource() {
    const raw = fs.readFileSync(CONTENT_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.version || !Array.isArray(parsed.items)) {
        throw new Error(`种子源结构异常（需含 version 与 items[]）：${CONTENT_FILE}`);
    }
    return parsed;
}

// 与 server/scripts/seed-content.js 保持完全一致的字段映射
function toItemPayload(item) {
    return {
        item_id: String(item.id),
        type: 'policy',
        audience: 'all',
        placements: ['assistant_qa'],
        title: item.question || item.title || '',
        summary: '',
        body: item.answer || '',
        category: item.category || null,
        question: item.question || null,
        answer: item.answer || '',
        keywords: Array.isArray(item.keywords) ? item.keywords : [],
        hot: item.hot === true,
        priority: item.hot ? 10 : 0,
        status: 'published',
        publish_at: item.effectiveAt || new Date().toISOString(),
        expire_at: null
    };
}

async function api(pathname, { method = 'GET', token, bearer, body } = {}) {
    const url = `${BASE_URL}/api/admin/content${pathname}`;
    const headers = { 'Content-Type': 'application/json' };
    // 优先 Bearer（工作人员登录签发的短期令牌），回落静态令牌（仅本地/旧环境还认它）
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
    else if (token) headers['X-Admin-Token'] = token;
    let res;
    try {
        res = await fetch(url, {
            method,
            headers,
            body: body === undefined ? undefined : JSON.stringify(body)
        });
    } catch (err) {
        return { status: 0, body: null, error: err.message };
    }
    const text = await res.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch (err) { /* 非 JSON 响应 */ }
    return { status: res.status, body: parsed, text };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 等后台内容接口就绪（新构建滚动期间先 404），并把不可恢复的错误区分开
async function waitForAdminApi(cred, seconds) {
    const deadline = Date.now() + seconds * 1000;
    let lastDetail = '';
    for (;;) {
        const r = await api('?limit=1', cred);
        if (r.status === 200) return { ok: true };
        if (r.status === 401) {
            return { ok: false, fatal: true, detail: '后台拒绝了凭证（401）：工作人员账号密码有误，或该账号已被禁用 / 降权' };
        }
        if (r.status === 503) {
            return { ok: false, fatal: true, detail: '后台鉴权未就绪（503）：生产已停用静态令牌，请配置 ADMIN_STAFF_EMAIL / ADMIN_STAFF_PASSWORD 走工作人员登录' };
        }
        lastDetail = `HTTP ${r.status || 'N/A'}${r.error ? ` (${r.error})` : ''}`;
        if (Date.now() >= deadline) {
            return { ok: false, fatal: false, detail: `等待 ${seconds}s 后后台内容接口仍不可用（最后一次：${lastDetail}）` };
        }
        await sleep(5000);
    }
}

async function main() {
    if (hasFlag('--help') || hasFlag('-h')) {
        printHelp();
        return EXIT_OK;
    }
    if (typeof fetch !== 'function') {
        throw new Error('当前 Node 不支持 fetch，请使用 Node 18+');
    }

    // 凭证优先级：工作人员登录（生产唯一可用）> 静态令牌（仅本地 / 旧环境还认它）
    const bearer = await loginAsStaff();
    const staticToken = resolveToken();
    const cred = bearer ? { bearer } : (staticToken ? { token: staticToken } : null);
    if (!cred) {
        say('[跳过] 未配置生产凭证 → 不做生产内容种子。');
        say('       生产请配置 ADMIN_STAFF_EMAIL / ADMIN_STAFF_PASSWORD（工作人员账号，环境变量或 server/.env）；');
        say('       静态令牌 ADMIN_TOKEN_PROD 已在生产停用 —— 中间件对 production 一律拒绝。');
        return EXIT_NO_TOKEN;
    }

    const content = loadSeedSource();
    log(`目标：${BASE_URL}${DRY_RUN ? '（--dry-run，只读不写）' : ''}`);
    log(`种子源：${content.version} / ${content.items.length} 条`);

    if (WAIT_SECONDS > 0) {
        log(`等待后台内容接口就绪（最多 ${WAIT_SECONDS}s）...`);
        const ready = await waitForAdminApi(cred, WAIT_SECONDS);
        if (!ready.ok) {
            say(`[失败] ${ready.detail}`);
            return EXIT_FAIL;
        }
    }

    const listRes = await api('?limit=200', cred);
    if (listRes.status !== 200) {
        say(`[失败] 读取线上内容列表失败：HTTP ${listRes.status || 'N/A'}${listRes.error ? ` (${listRes.error})` : ''}` +
            `${listRes.status === 404 ? ' —— 生产仍是旧构建（无后台内容接口），稍后重试' : ''}`);
        return EXIT_FAIL;
    }
    const existing = new Set((listRes.body?.data?.items || []).map((i) => i.item_id));
    log(`线上现有内容：${existing.size} 条`);

    let created = 0;
    let skipped = 0;
    for (const item of content.items) {
        if (!item || !item.id) continue;
        const itemId = String(item.id);
        if (existing.has(itemId)) {
            skipped++;
            log(`  [跳过] ${itemId}（已存在）`);
            continue;
        }
        if (DRY_RUN) {
            created++;
            log(`  [待新增] ${itemId}`);
            continue;
        }
        const r = await api('', { method: 'POST', ...cred, body: toItemPayload(item) });
        if (r.status !== 201) {
            say(`[失败] 新增 ${itemId} 失败：HTTP ${r.status || 'N/A'} ${r.text ? r.text.slice(0, 200) : ''}`);
            return EXIT_FAIL;
        }
        created++;
        log(`  [新增] ${itemId} -> id=${r.body?.data?.id}`);
    }

    // 发布批次：仅在「有新条目」或「批次缺失」时登记，避免复跑刷新 published_at
    const relRes = await api('/releases', cred);
    if (relRes.status !== 200) {
        say(`[失败] 读取发布批次失败：HTTP ${relRes.status || 'N/A'}`);
        return EXIT_FAIL;
    }
    const hasRelease = (relRes.body?.data?.items || []).some((r) => r.version === content.version);
    let releaseNote;
    if (created > 0 || !hasRelease) {
        if (DRY_RUN) {
            releaseNote = `待登记批次 ${content.version}`;
        } else {
            const r = await api('/releases', { method: 'POST', ...cred, body: { version: content.version, notice: content.notice || '' } });
            if (r.status !== 200) {
                say(`[失败] 登记发布批次失败：HTTP ${r.status || 'N/A'} ${r.text ? r.text.slice(0, 200) : ''}`);
                return EXIT_FAIL;
            }
            releaseNote = `已登记批次 ${r.body?.data?.version}（草稿转已发布 ${r.body?.data?.promotedCount} 条）`;
        }
    } else {
        releaseNote = `批次 ${content.version} 已存在，跳过`;
    }

    say(`[完成] 生产内容种子：新增 ${created} 条 / 跳过 ${skipped} 条 / ${releaseNote}`);
    return EXIT_OK;
}

main()
    .then((code) => process.exit(code))
    .catch((err) => {
        console.error(`[失败] 生产内容种子异常：${err.message}`);
        process.exit(EXIT_FAIL);
    });
