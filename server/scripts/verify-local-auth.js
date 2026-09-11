#!/usr/bin/env node
/**
 * EuriskoTax 本地「登录链路」验证门禁 —— push 部署前必须在本地跑绿
 *
 * 用法（项目根目录）：
 *   npm run verify:local
 *   VERIFY_SKIP_GENERATE=1 npm run verify:local   // :3000 后端运行中占用引擎 DLL 时的逃生门（schema 未变更）
 *   npm run verify:pg                             // 生产等价演练：同一套断言跑在本地 PostgreSQL 上
 *
 * 两种运行模式：
 *   - 默认（SQLite dev.db）：日常门禁，快，但测不出 PostgreSQL 专有问题；
 *   - VERIFY_PG=1（PostgreSQL）：由 tools/ops/ops-verify-pg.ps1 拉起 docker 演练库后调用，
 *     DATABASE_URL 必须指向演练库；数据库准备改为「generate(生产 schema) + migrate deploy + 内容种子」，
 *     与线上容器启动顺序一致，用来拦下「本地绿、上线炸」的迁移/字段类问题。
 *
 * 它会把「本地完整应用」真的跑起来做端到端验证：
 *   1. 数据库准备（SQLite: prisma generate:dev + db push；PostgreSQL: generate + migrate deploy + 种子）
 *   2. 确保本地测试账号 dev@example.com / password 存在
 *   3. 随机空闲端口启动后端（node src/app.js，同源托管前端+API）
 *   4. HTTP 级 e2e：
 *      - 前端资源冒烟：/ 含登录表单、auth-ui.js 含 dev-login-fill 且无 quick-login、SW 为 v8
 *      - 登录本地测试账号 → 拿 JWT → GET /profile 校验（含种子授权 plan=pro）
 *      - 阶段8 反馈链路：落库/用户列表/管理员跟进 + 附图（合法 data URL 落库、非图片与超 3 张 400）
 *      - 阶段10 运维后台（admin.html 后端）：用户列表搜索、详情计数、权益调档 pro↔free、无令牌 401
 *      - 阶段10A 云端同步链路：上传/全量拉取、幂等、冲突新者胜、墓碑广播、
 *        SYNC_MAX_RECORDS 上限拒绝、free 账号 403 PRO_REQUIRED
 *      - 完整注册链路：申请邀请码(写库) → send-code(读后端控制台验证码) → register → 登录新号 → profile
 *   5. 清理（删临时账号/邀请码/关后端），输出 PASS/FAIL，失败时退出码非 0
 *
 * 前置：server/node_modules 已安装（npm install）；脚本会自动同步 SQLite 开发库。
 */
const path = require('path');
const fs = require('fs');
const net = require('net');
const { spawn, spawnSync } = require('child_process');
const http = require('http');

const serverDir = path.resolve(__dirname, '..');   // …/server
const envFile = path.join(serverDir, '.env');

require('dotenv').config({ path: envFile });

// 演练模式：由 ops-verify-pg.ps1 设置（DATABASE_URL 指向本地 docker PostgreSQL 演练库）
const PG_MODE = process.env.VERIFY_PG === '1';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 探测某端口是否已被监听（用于检测运行中的本地后端占用 Prisma 引擎 DLL）
function portOpen(port, timeoutMs) {
    return new Promise((resolve) => {
        const sock = new net.Socket();
        const done = (ok) => { sock.destroy(); resolve(ok); };
        sock.setTimeout(timeoutMs);
        sock.once('connect', () => done(true));
        sock.once('timeout', () => done(false));
        sock.once('error', () => done(false));
        sock.connect(port, '127.0.0.1');
    });
}

function logLine() {
    process.stdout.write(`  [${new Date().toISOString().slice(11, 19)}] `);
    console.log(...arguments);
}

// ====== 轻量 HTTP 客户端（只打 127.0.0.1） ======
function request(port, method, urlPath, { json, token, headers = {}, timeout = 10000 } = {}) {
    return new Promise((resolve, reject) => {
        const body = json ? JSON.stringify(json) : null;
        const req = http.request({
            host: '127.0.0.1',
            port,
            method,
            path: urlPath,
            timeout,
            headers: {
                ...(body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {}),
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...headers,
            },
        }, (res) => {
            let data = '';
            res.on('data', (c) => (data += c));
            res.on('end', () => {
                let parsed = null;
                try { parsed = JSON.parse(data); } catch { /* 非 JSON */ }
                resolve({ status: res.statusCode, body: parsed, raw: data, headers: res.headers });
            });
        });
        req.on('timeout', () => req.destroy(new Error('request timeout')));
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

async function getFreePort() {
    return new Promise((resolve, reject) => {
        const srv = net.createServer();
        srv.listen(0, '127.0.0.1', () => {
            const { port } = srv.address();
            srv.close(() => resolve(port));
        });
        srv.on('error', reject);
    });
}

async function waitHealth(port, ms = 25000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
        try {
            const r = await request(port, 'GET', '/health');
            if (r.status === 200) return true;
        } catch { /* 未就绪 */ }
        await sleep(400);
    }
    return false;
}

// 从后端控制台输出中截取某邮箱的验证码（开发模式会打印：验证码  : 123456）
function extractCodeFromLog(log, email) {
    const idx = log.indexOf(email);
    if (idx === -1) return null;
    const m = log.slice(idx).match(/验证码\s*:\s*(\d{6})/);
    return m ? m[1] : null;
}

// Feedback.attachments 在库中是 JSON 字符串（服务端写入时 JSON.stringify），
// 用户端 / 管理员端接口按库中原样返回，断言前统一解析成数组
function parseAttachments(raw) {
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : null;
        } catch { return null; }
    }
    return null;
}

// 1x1 透明 PNG 的 Data URL：与前端压缩上传格式一致，用于附图链路断言
const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

(async () => {
    let exitCode = 0;
    const results = [];
    const record = (name, okFlag, detail) => {
        results.push({ name, ok: okFlag, detail });
        if (okFlag) console.log(`  [PASS] ${name}${detail ? ` — ${detail}` : ''}`);
        else console.error(`  [FAIL] ${name}${detail ? ` — ${detail}` : ''}`);
    };

    console.log('\n========================================================');
    console.log('  EuriskoTax 本地登录链路验证门禁（verify:local）');
    console.log('========================================================');

    // ---- 0. 前置检查（自足化：缺 .env 时自动从 .env.example 复制，避免新机器卡壳） ----
    if (!fs.existsSync(envFile)) {
        const envExample = path.join(serverDir, '.env.example');
        if (!fs.existsSync(envExample)) {
            console.error('\n[FAIL] 找不到 server/.env 与 server/.env.example，请检查 server 目录是否完整。');
            process.exit(1);
        }
        fs.copyFileSync(envExample, envFile);
        require('dotenv').config({ path: envFile });
        console.log('  [OK] 未检测到 server/.env，已自动从 .env.example 复制（开发用 SQLite 默认配置）');
    }
    if (PG_MODE) {
        if (!/^postgres(ql)?:\/\//.test(process.env.DATABASE_URL || '')) {
            console.error(`\n[FAIL] VERIFY_PG=1 需要 DATABASE_URL 指向 PostgreSQL 演练库，当前为: ${process.env.DATABASE_URL || '(空)'}`);
            console.error('       请用 npm run verify:pg（会自动拉起本地 PostgreSQL 演练容器并设置该变量）。');
            process.exit(1);
        }
        console.log(`  [OK] PostgreSQL 演练模式：${String(process.env.DATABASE_URL).replace(/:[^:@/]*@/, ':***@')}`);
    } else if (!(process.env.DATABASE_URL || '').includes('dev.db')) {
        console.error(`\n[FAIL] server/.env 的 DATABASE_URL 应为本地 SQLite dev.db，当前为: ${process.env.DATABASE_URL}`);
        console.error('       生产数据库不能作为本地验证目标。');
        process.exit(1);
    }

    // ---- 0.5 引擎占用自检：运行中的本地后端(:3000)会锁定 Prisma 引擎 DLL，generate 会 EPERM ----
    if (await portOpen(3000, 400)) {
        console.warn('  [WARN] 检测到本地后端仍在运行（http://localhost:3000）。');
        console.warn('         Windows 下运行中的后端会锁定 Prisma 引擎 DLL，');
        console.warn('         generate 覆盖 .prisma/client 时大概率报 EPERM。');
        console.warn('         ▶ schema 未变更：可设 VERIFY_SKIP_GENERATE=1 跳过 generate，直接跑 db push；');
        console.warn('         ▶ 有 schema 变更：请先停止该后端（其控制台 Ctrl+C）再重跑本命令。');
    }

    // ---- 1. 数据库准备 ----
    // 两种模式的差异只在「怎么把库准备好」：
    //   SQLite   : generate:dev → db push（本地开发库，幂等）
    //   PostgreSQL: generate（生产 schema）→ migrate deploy → 内容种子（与线上容器启动同序）
    console.log(`\n[1/6] 数据库准备（${PG_MODE ? 'PostgreSQL 演练库' : 'SQLite dev.db'}）...`);
    const skipGenerate = process.env.VERIFY_SKIP_GENERATE === '1';
    if (PG_MODE) {
        if (skipGenerate) {
            console.log('  [SKIP] VERIFY_SKIP_GENERATE=1：跳过 prisma generate（沿用现有 Prisma Client）');
        } else {
            const genPg = spawnSync('npx prisma generate',
                { cwd: serverDir, shell: true, encoding: 'utf8', timeout: 120000 });
            if (genPg.status !== 0) {
                console.error('  [FAIL] prisma generate（生产 PostgreSQL schema）失败。');
                const genPgTail = (genPg.stderr || '') + (genPg.stdout || '');
                if (/EPERM|EBUSY/.test(genPgTail)) {
                    console.error('        疑似引擎 DLL 被运行中的后端占用：请先停止 :3000 后端后重跑。');
                }
                console.error(genPgTail.slice(-800));
                process.exit(1);
            }
        }
        // 与线上一致：容器启动执行的第一条命令就是 prisma migrate deploy
        const migrate = spawnSync('npx prisma migrate deploy',
            { cwd: serverDir, shell: true, encoding: 'utf8', timeout: 180000 });
        const migrateOut = (migrate.stdout || '') + (migrate.stderr || '');
        if (migrate.status !== 0) {
            console.error('  [FAIL] prisma migrate deploy 失败 —— 线上容器启动时执行的正是这条命令，');
            console.error('         迁移不过 = 部署后建表失败、整站不可用。请先修迁移再发布。');
            console.error(migrateOut.slice(-1500));
            process.exit(1);
        }
        const migrateTail = migrateOut.trim().split(/\r?\n/).filter(Boolean).pop() || '';
        console.log(`  [OK] 迁移已应用（${migrateTail}）`);
        // 内容端点断言依赖库内内容，演练库是空的，必须先种子化（幂等）
        const seed = spawnSync(process.execPath, [path.join(serverDir, 'scripts', 'seed-content.js')],
            { cwd: serverDir, encoding: 'utf8', timeout: 60000 });
        if (seed.status !== 0) {
            console.error('  [FAIL] 内容种子写入演练库失败（后面「内容中心公开端点」断言会因此失败）。');
            console.error(((seed.stdout || '') + (seed.stderr || '')).slice(-800));
            process.exit(1);
        }
        console.log('  [OK] Prisma Client(PostgreSQL) 已生成，迁移已应用，内容已种子化');
    } else {
        // npm install 的 postinstall 会用生产 schema(PostgreSQL) 生成 Prisma Client，
        // 必须先按本地 SQLite schema 重新 generate，否则 PrismaClient 与 dev.db 引擎不匹配
        if (skipGenerate) {
            console.log('  [SKIP] VERIFY_SKIP_GENERATE=1：跳过 prisma generate（沿用现有 Prisma Client）');
        } else {
            const gen = spawnSync('npx prisma generate --schema prisma/schema.dev.prisma',
                { cwd: serverDir, shell: true, encoding: 'utf8', timeout: 60000 });
            if (gen.status !== 0) {
                console.error('  [FAIL] prisma generate:dev 失败。请先 cd server && npm install');
                const genTail = (gen.stderr || '').slice(-600);
                if (/EPERM|EBUSY/.test(genTail)) {
                    console.error('        疑似引擎 DLL 被运行中的后端占用：请先停止 :3000 后端后重跑，');
                    console.error('        或 schema 未变更时设 VERIFY_SKIP_GENERATE=1 跳过 generate。');
                }
                console.error(genTail);
                process.exit(1);
            }
        }
        const pushResult = spawnSync('npx prisma db push --schema prisma/schema.dev.prisma',
            { cwd: serverDir, shell: true, encoding: 'utf8', timeout: 60000 });
        if (pushResult.status !== 0) {
            console.error('  [FAIL] prisma db push（SQLite 建表）失败。请检查 server/prisma/dev.db 是否被占用或已损坏。');
            console.error((pushResult.stderr || '').slice(-1200));
            process.exit(1);
        }
        console.log('  [OK] Prisma Client(SQLite) 已生成，dev.db 表结构已同步');
    }

    let prisma;
    try {
        const { PrismaClient } = require('@prisma/client');
        prisma = new PrismaClient();
        await prisma.$queryRawUnsafe('SELECT 1');
        console.log('  [OK] Prisma Client 可连接 SQLite 开发库');
    } catch (e) {
        console.error('  [FAIL] 无法连接开发库（Prisma Client 可能仍是生产 schema 生成）：', e.message);
        console.error('        请执行: cd server && npm run prisma:generate:dev');
        process.exit(1);
    }

    // ---- 2. 确保本地测试账号存在（dev@example.com / password） ----
    const bcrypt = require('bcryptjs');
    const DEV_EMAIL = 'dev@example.com';
    const DEV_USERNAME = 'devuser';
    const DEV_PASSWORD = 'password';
    try {
        const existing = await prisma.user.findUnique({ where: { email: DEV_EMAIL } });
        const hash = bcrypt.hashSync(DEV_PASSWORD, 10);
        if (existing) {
            await prisma.user.update({ where: { id: existing.id }, data: { password_hash: hash } });
            console.log(`  [OK] 本地测试账号已就绪（${DEV_EMAIL} / ${DEV_PASSWORD}）`);
        } else {
            await prisma.user.create({
                data: { username: DEV_USERNAME, email: DEV_EMAIL, password_hash: hash },
            });
            console.log(`  [OK] 已创建本地测试账号（${DEV_EMAIL} / ${DEV_PASSWORD}）`);
        }
    } catch (e) {
        console.error('  [FAIL] 准备测试账号失败:', e.message);
        process.exit(1);
    }

    // ---- 3. 启动后端（随机端口） ----
    console.log('\n[2/6] 启动本地后端...');
    const PORT = await getFreePort();
    const child = spawn(process.execPath, ['src/app.js'], {
        cwd: serverDir,
        env: {
            ...process.env,
            PORT: String(PORT),
            NODE_ENV: 'development',
            // 保证 X-Admin-Token 类管理接口（统计概览/邀请码/反馈跟进）本地可测
            ADMIN_TOKEN: process.env.ADMIN_TOKEN || 'local-verify-admin-token',
            // 阶段10A：云端历史上限调小（3 条），用于 e2e 断言「超限拒绝」而无需真的造 500 条
            SYNC_MAX_RECORDS: '3',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    let serverLog = '';
    child.stdout.on('data', (d) => (serverLog += d.toString()));
    child.stderr.on('data', (d) => (serverLog += d.toString()));

    const serverReady = await waitHealth(PORT);
    if (!serverReady) {
        console.error(`  [FAIL] 后端未能在 ${PORT} 就绪。最近日志:\n${serverLog.slice(-1500)}`);
        child.kill();
        process.exit(1);
    }
    console.log(`  [OK] 后端已就绪 → http://127.0.0.1:${PORT}`);

    // ---- 4. 端到端断言 ----
    console.log('\n[3/6] 前端资源冒烟...');
    try {
        const page = await request(PORT, 'GET', '/');
        record('GET / 返回登录表单', page.status === 200 && page.raw.includes('id="login-form"'), `HTTP ${page.status}`);
        const authJs = await request(PORT, 'GET', '/src/js/auth/auth-ui.js');
        record('auth-ui.js 含本地填充入口(dev-login-fill)', authJs.status === 200 && authJs.raw.includes('dev-login-fill'), `HTTP ${authJs.status}`);
        record('auth-ui.js 已无 quick-login 残留', authJs.status === 200 && !authJs.raw.includes('quick-login'), '');
        const sw = await request(PORT, 'GET', '/service-worker.js');
        record('service-worker.js 已无应用壳预缓存(APP_SHELL)', sw.status === 200 && !sw.raw.includes('APP_SHELL'), `HTTP ${sw.status}`);
        record('service-worker.js 含 http/https 协议守卫', sw.status === 200 && sw.raw.includes("url.protocol !== 'http:'"), `HTTP ${sw.status}`);
        record('service-worker.js HTML 导航 network-first', sw.status === 200 && sw.raw.includes("request.mode === 'navigate'"), `HTTP ${sw.status}`);

        // ---- 阶段10 前端云同步链路静态断言 ----
        const planJs = await request(PORT, 'GET', '/src/js/auth/plan.js');
        record('plan.js 含 isPro/PLAN_PRO', planJs.status === 200 && planJs.raw.includes('function isPro') && planJs.raw.includes('EuriskoPlan'), `HTTP ${planJs.status}`);
        const syncJs = await request(PORT, 'GET', '/src/js/data/history-sync.js');
        record('history-sync.js 含 mergeCloud/EuriskoSync', syncJs.status === 200 && syncJs.raw.includes('mergeCloud') && syncJs.raw.includes('window.EuriskoSync'), `HTTP ${syncJs.status}`);
        record('index.html 加载 plan/history-sync 脚本与云同步 DOM',
            page.status === 200 && page.raw.includes('src/js/auth/plan.js') && page.raw.includes('src/js/data/history-sync.js')
            && page.raw.includes('cloud-sync-now-btn') && page.raw.includes('topbar-plan-badge') && page.raw.includes('profile-plan-badge'),
            '');
        record('auth-ui.js 集成云同步引擎', authJs.status === 200 && authJs.raw.includes('EuriskoSync') && authJs.raw.includes('afterLogin'), `HTTP ${authJs.status}`);
        const dmJs = await request(PORT, 'GET', '/src/js/data/data-management.js');
        const calcJs = await request(PORT, 'GET', '/src/js/calculation/tax-calculator.js');
        record('保存入口写入 updatedAt + 变更信号(data-management)', dmJs.status === 200 && dmJs.raw.includes('updatedAt') && dmJs.raw.includes('euriskotax:history-mutated'), `HTTP ${dmJs.status}`);
        record('保存入口写入 updatedAt + 变更信号(tax-calculator)', calcJs.status === 200 && calcJs.raw.includes('updatedAt') && calcJs.raw.includes('euriskotax:history-mutated'), `HTTP ${calcJs.status}`);

        // ---- 阶段11 内容中心前端资源静态断言（政策要点 + 公告/运营内容） ----
        const taxPolicyJs = await request(PORT, 'GET', '/src/js/data/tax-policy.js');
        record('tax-policy.js 含内容中心同步(TaxPolicy/applyUpdates/syncNow/syncFeed)',
            taxPolicyJs.status === 200 && taxPolicyJs.raw.includes('window.TaxPolicy') && taxPolicyJs.raw.includes('applyUpdates')
            && taxPolicyJs.raw.includes('syncNow') && taxPolicyJs.raw.includes('syncFeed') && taxPolicyJs.raw.includes('triggerSync'), `HTTP ${taxPolicyJs.status}`);
        const contentUiJs = await request(PORT, 'GET', '/src/js/ui/content-center-ui.js');
        record('content-center-ui.js 含三展示位(首页公告条/公告弹窗/个人中心列表)',
            contentUiJs.status === 200 && contentUiJs.raw.includes('window.ContentCenterUI') && contentUiJs.raw.includes('renderHomeBanner')
            && contentUiJs.raw.includes('openNoticeList') && contentUiJs.raw.includes('openNoticeModal'), `HTTP ${contentUiJs.status}`);
        const finalReportJs = await request(PORT, 'GET', '/src/js/export/final-report.js');
        record('final-report.js 含汇算报告编排与分流(EuriskoReport/exportFinalReport)',
            finalReportJs.status === 200 && finalReportJs.raw.includes('window.EuriskoReport') && finalReportJs.raw.includes('exportFinalReport') && finalReportJs.raw.includes('buildProDocHtml'), `HTTP ${finalReportJs.status}`);
        record('index.html 加载 tax-policy/content-center-ui/final-report 脚本',
            page.status === 200 && page.raw.includes('src/js/data/tax-policy.js') && page.raw.includes('src/js/ui/content-center-ui.js')
            && page.raw.includes('src/js/export/final-report.js'), '');
        record('index.html 含内容中心 DOM(首页公告条 + 公告弹窗)',
            page.status === 200 && page.raw.includes('content-home-banner') && page.raw.includes('content-notice-modal'), '');
        record('auth-ui.js 集成内容同步(triggerContentSync/TaxPolicy)',
            authJs.status === 200 && authJs.raw.includes('triggerContentSync') && authJs.raw.includes('TaxPolicy'), `HTTP ${authJs.status}`);
        record('auth-ui.js 含「公告与更新」入口(profile-card-notices)',
            authJs.status === 200 && authJs.raw.includes('profile-card-notices'), `HTTP ${authJs.status}`);
        record('plan.js 已移除「政策更新为专业版功能」表述（政策对全体开放）',
            authJs.status === 200 && !authJs.raw.includes('政策更新为专业版'), '');
        const taxAssistantJs = await request(PORT, 'GET', '/src/js/data/tax-assistant.js');
        record('tax-assistant.js 暴露内置快照(window.TAX_ASSISTANT_QA)',
            taxAssistantJs.status === 200 && taxAssistantJs.raw.includes('window.TAX_ASSISTANT_QA'), `HTTP ${taxAssistantJs.status}`);
    } catch (e) {
        record('前端资源冒烟', false, e.message);
    }

    console.log('\n[3/6·内容] 内容中心公开端点（阶段11：政策要点 + 公告/运营内容，无需登录）...');
    try {
        const policy = await request(PORT, 'GET', '/api/content/tax-policy');
        const polData = policy.body && policy.body.data || {};
        const items = Array.isArray(polData.items) ? polData.items : [];
        const itemsWellFormed = items.length > 0 && items.every((x) => x && x.id && x.question && x.answer);
        record('GET /content/tax-policy 公开内容(version+revision+items)',
            policy.status === 200 && !!polData.version && !!polData.revision && itemsWellFormed,
            `HTTP ${policy.status}, version=${polData.version || 'N/A'}, items=${items.length}`);
        const policySame = await request(PORT, 'GET', '/api/content/tax-policy?since=' + encodeURIComponent(polData.revision || ''));
        const sameData = policySame.body && policySame.body.data || {};
        record('since=当前指纹 → items 空（无更新增量语义）',
            policySame.status === 200 && Array.isArray(sameData.items) && sameData.items.length === 0 && sameData.revision === polData.revision,
            `HTTP ${policySame.status}, items=${sameData.items.length}`);
        record('内容端点响应禁止共享缓存(private/no-store + Vary: Authorization)',
            String(policy.headers && policy.headers['cache-control'] || '').includes('no-store')
            && String(policy.headers && policy.headers.vary || '').toLowerCase().includes('authorization'),
            `cache-control=${policy.headers && policy.headers['cache-control']}, vary=${policy.headers && policy.headers.vary}`);

        const feed = await request(PORT, 'GET', '/api/content/feed');
        const feedData = feed.body && feed.body.data || {};
        record('GET /content/feed 公告/运营内容端点',
            feed.status === 200 && Array.isArray(feedData.items), `HTTP ${feed.status}, items=${(feedData.items || []).length}`);
        const feedModal = await request(PORT, 'GET', '/api/content/feed?placement=modal');
        const modalData = feedModal.body && feedModal.body.data || {};
        const modalFiltered = (modalData.items || []).every((x) => Array.isArray(x.placements) && x.placements.includes('modal'));
        record('GET /content/feed 支持 placement 过滤',
            feedModal.status === 200 && modalFiltered, `HTTP ${feedModal.status}, items=${(modalData.items || []).length}`);
    } catch (e) {
        record('内容中心公开端点', false, e.message);
    }

    console.log('\n[4/6] 登录链路（dev 账号）...');
    let devToken = null;
    try {
        const login = await request(PORT, 'POST', '/api/auth/login', { json: { email: DEV_EMAIL, password: DEV_PASSWORD } });
        devToken = login.body && login.body.data && login.body.data.token;
        record('登录 dev@example.com', login.status === 200 && !!devToken, `HTTP ${login.status}`);

        if (devToken) {
            const profile = await request(PORT, 'GET', '/api/auth/profile', { token: devToken });
            const name = profile.body && profile.body.data && profile.body.data.username;
            record('GET /profile 身份校验', profile.status === 200 && name === DEV_USERNAME, `HTTP ${profile.status}, user=${name}`);
        }
    } catch (e) {
        record('登录 dev 账号', false, e.message);
    }

    console.log('\n[4/6 续] 反馈落库 + 匿名埋点链路（dev 账号，阶段8）...');
    const stamp2 = Date.now();
    const adminToken = process.env.ADMIN_TOKEN || 'local-verify-admin-token';
    // 提在外层声明：后面的「运维后台用户端点」小节要引用本次产生的反馈 id
    let verifyFeedbackId = null;
    let verifyImageFeedbackId = null;
    try {
        if (!devToken) {
            record('阶段8端点冒烟', false, '前置登录失败，跳过');
        } else {
            // 8.1 匿名埋点：登录用户保存计算后上报计算类型（仅 type，不含输入数据）
            const ev = await request(PORT, 'POST', '/api/stats/events', {
                json: { type: 'comprehensive' }, token: devToken,
            });
            record('POST /stats/events 匿名埋点', ev.status === 201 && ev.body && ev.body.success === true, `HTTP ${ev.status}`);

            // 8.2 反馈提交落库（content 带 [verify] 标记便于收尾清理）
            const fb = await request(PORT, 'POST', '/api/feedback', {
                json: { category: 'bug', content: `[verify] e2e feedback ${stamp2}`, rating: 5 }, token: devToken,
            });
            verifyFeedbackId = fb.body && fb.body.data && fb.body.data.id || null;
            record('POST /feedback 反馈落库', fb.status === 201 && !!verifyFeedbackId, `HTTP ${fb.status}, id=${verifyFeedbackId || 'N/A'}`);

            // 8.2b 附图：合法压缩图 data URL 正常落库（与前端压缩上传格式一致）
            const fbImg = await request(PORT, 'POST', '/api/feedback', {
                json: { category: 'bug', content: `[verify] e2e feedback with image ${stamp2}`, attachments: [PNG_DATA_URL] }, token: devToken,
            });
            verifyImageFeedbackId = fbImg.body && fbImg.body.data && fbImg.body.data.id || null;
            record('POST /feedback 附图落库(data URL)', fbImg.status === 201 && !!verifyImageFeedbackId,
                `HTTP ${fbImg.status}, id=${verifyImageFeedbackId || 'N/A'}`);

            // 8.2c 附图非法必须 400：非图片 data URL / 超过 3 张（防脏数据与库容滥用）
            const badAtt = await request(PORT, 'POST', '/api/feedback', {
                json: { category: 'bug', content: `[verify] bad attachment ${stamp2}`, attachments: ['not-a-data-url'] }, token: devToken,
            });
            record('POST /feedback 非图片附图被拒(400)', badAtt.status === 400, `HTTP ${badAtt.status}`);
            const tooManyAtt = await request(PORT, 'POST', '/api/feedback', {
                json: { category: 'bug', content: `[verify] too many attachments ${stamp2}`, attachments: [PNG_DATA_URL, PNG_DATA_URL, PNG_DATA_URL, PNG_DATA_URL] }, token: devToken,
            });
            record('POST /feedback 附图超 3 张被拒(400)', tooManyAtt.status === 400, `HTTP ${tooManyAtt.status}`);

            // 8.3 当前用户反馈列表能查到该条
            const myList = await request(PORT, 'GET', '/api/feedback', { token: devToken });
            const mine = myList.body && myList.body.data || [];
            record('GET /feedback 用户列表', myList.status === 200 && mine.some((x) => x.id === verifyFeedbackId), `HTTP ${myList.status}`);

            // 8.3b 用户端列表回传附图（库中 JSON 字符串 → 解析后应还原为原 data URL）
            const mineImg = mine.find((x) => x.id === verifyImageFeedbackId);
            const mineAtts = parseAttachments(mineImg && mineImg.attachments);
            record('GET /feedback 用户端返回附图', myList.status === 200 && !!mineAtts && mineAtts.length === 1 && mineAtts[0] === PNG_DATA_URL,
                mineAtts ? `attachments=${mineAtts.length}` : 'attachments 无法解析为数组');

            // 8.4 管理员列表与状态跟进（X-Admin-Token）
            const adminH = { 'X-Admin-Token': adminToken };
            const adminList = await request(PORT, 'GET', '/api/feedback/admin?status=open', { headers: adminH });
            const adminItems = adminList.body && adminList.body.data || [];
            record('GET /feedback/admin 管理员列表', adminList.status === 200 && adminItems.some((x) => x.id === verifyFeedbackId), `HTTP ${adminList.status}`);

            // 8.4b 运维后台拿到附图才算闭环（admin.html 反馈 Tab 附图预览依赖此字段）
            const adminImgItem = adminItems.find((x) => x.id === verifyImageFeedbackId);
            const adminAtts = parseAttachments(adminImgItem && adminImgItem.attachments);
            record('GET /feedback/admin 运维后台可见附图', adminList.status === 200 && !!adminAtts && adminAtts.length === 1,
                adminAtts ? `attachments=${adminAtts.length}` : 'attachments 无法解析为数组');

            if (verifyFeedbackId) {
                const patch = await request(PORT, 'PATCH', `/api/feedback/admin/${verifyFeedbackId}`, {
                    json: { status: 'resolved' }, headers: adminH,
                });
                record('PATCH /feedback/admin/:id 状态跟进', patch.status === 200 && patch.body && patch.body.data && patch.body.data.status === 'resolved', `HTTP ${patch.status}`);
            }

            // 8.5 运营统计概览：计算统计改读 CalcEvent 聚合表后应能看到 8.1 的埋点
            const ov = await request(PORT, 'GET', '/api/stats/overview', { headers: adminH });
            const ovData = ov.body && ov.body.data || {};
            const ovTotal = ovData.calculations && ovData.calculations.total;
            const ovComp = ovData.calculations && ovData.calculations.byType && ovData.calculations.byType.comprehensive;
            record('GET /stats/overview 读聚合统计', ov.status === 200 && ovTotal >= 1 && ovComp >= 1, `HTTP ${ov.status}, total=${ovTotal}, comprehensive=${ovComp}`);

            // ---- 8.6 阶段10 运维后台（admin.html 后端）：用户列表/详情/权益调档 ----
            console.log('\n[4/6 续·运维] 运维后台用户端点（阶段10 运维后台）...');
            const devRow = await prisma.user.findUnique({ where: { email: DEV_EMAIL } });
            try {
                if (!devRow) {
                    record('运维后台用户端点', false, '未找到 dev 账号，跳过');
                } else {
                    // 8.6.1 无令牌必须被拒，防管理接口裸奔
                    const noTok = await request(PORT, 'GET', '/api/admin/users');
                    record('GET /admin/users 无令牌被拒(401)', noTok.status === 401, `HTTP ${noTok.status}`);

                    // 8.6.2 列表 + 关键词搜索（故意用大写关键词，锁住「大小写不敏感」语义）；
                    //       同时确认响应不含任何密码字段
                    const uList = await request(PORT, 'GET', '/api/admin/users?q=' + encodeURIComponent(DEV_EMAIL.toUpperCase()), { headers: adminH });
                    const uData = (uList.body && uList.body.data) || {};
                    const uItems = Array.isArray(uData.items) ? uData.items : [];
                    const uHit = uItems.find((u) => u.email === DEV_EMAIL);
                    record('GET /admin/users 列表+搜索(大小写不敏感/无密码字段)',
                        uList.status === 200 && uData.total >= 1 && !!uHit
                        && uHit.password_hash === undefined && uHit.passwordHash === undefined,
                        `HTTP ${uList.status}, total=${uData.total}`);

                    // 8.6.3 详情：数据规模计数（反馈/计算）+ 最近动态，供运维判断后调权益
                    const uDetail = await request(PORT, 'GET', `/api/admin/users/${devRow.id}`, { headers: adminH });
                    const uDet = (uDetail.body && uDetail.body.data) || {};
                    const uCounts = uDet.counts || {};
                    const uRecentFb = Array.isArray(uDet.recentFeedback) ? uDet.recentFeedback : [];
                    record('GET /admin/users/:id 详情(计数+最近动态)',
                        uDetail.status === 200 && !!uDet.user && uDet.user.id === devRow.id
                        && uCounts.feedback >= 1 && uRecentFb.some((f) => f.id === verifyFeedbackId),
                        `HTTP ${uDetail.status}, feedback=${uCounts.feedback}, calcs=${uCounts.calculations}`);

                    // 8.6.4 权益调档：授予 14 天专业版 → 回落基础版（真实写库，前端 plan 徽标依赖此结果）
                    const expIso = new Date(Date.now() + 14 * 86400000).toISOString();
                    const grant = await request(PORT, 'PATCH', `/api/admin/users/${devRow.id}/plan`, {
                        json: { plan: 'pro', expiresAt: expIso, grantedBy: 'admin' }, headers: adminH,
                    });
                    const gData = (grant.body && grant.body.data) || {};
                    record('PATCH /admin/users/:id/plan 授予限时专业版',
                        grant.status === 200 && gData.plan === 'pro' && gData.pro_granted_by === 'admin' && !!gData.plan_expires_at,
                        `HTTP ${grant.status}, plan=${gData.plan}, granted_by=${gData.pro_granted_by}`);

                    const revoke = await request(PORT, 'PATCH', `/api/admin/users/${devRow.id}/plan`, {
                        json: { plan: 'free' }, headers: adminH,
                    });
                    const rData = (revoke.body && revoke.body.data) || {};
                    record('PATCH /admin/users/:id/plan 回落基础版',
                        revoke.status === 200 && rData.plan === 'free' && !rData.plan_expires_at && !rData.pro_granted_by,
                        `HTTP ${revoke.status}, plan=${rData.plan}, granted_by=${rData.pro_granted_by || 'null'}`);
                }
            } finally {
                // 恢复 dev 账号的种子 pro 授权：门禁不得给开发账号残留权益改动
                try {
                    await prisma.user.update({
                        where: { email: DEV_EMAIL },
                        data: { plan: 'pro', pro_granted_by: 'seed', plan_expires_at: null },
                    });
                } catch { /* 恢复失败不阻塞判定 */ }
            }
        }
    } catch (e) {
        record('反馈/埋点链路', false, e.message);
    } finally {
        // 清理本次验证产生的反馈（埋点聚合计数保留，overview 断言用下限不受影响）
        try {
            await prisma.feedback.deleteMany({ where: { content: { contains: '[verify]' } } });
        } catch { /* 清理失败不阻塞判定 */ }
    }

    console.log('\n[5/6] 云端历史同步链路（dev 账号，阶段10A）...');
    const syncStamp = Date.now();
    const syncPrefix = `verify-sync-${syncStamp}-`;
    try {
        if (!devToken) {
            record('阶段10A 同步冒烟', false, '前置登录失败，跳过');
        } else {
            const devUser = await prisma.user.findUnique({ where: { email: DEV_EMAIL } });
            const devUserId = devUser.id;
            // 清空该账号此前云端同步行，保证上限断言基数可预期（上限被 SYNC_MAX_RECORDS=3 覆盖）
            await prisma.calculation.deleteMany({ where: { user_id: devUserId, client_id: { not: null } } });

            const tOld = '2026-01-01T00:00:00.000Z';
            const tNew = '2026-09-01T00:00:00.000Z';
            const recA = `${syncPrefix}A`;
            const recB = `${syncPrefix}B`;
            const recC = `${syncPrefix}C`;
            const recE = `${syncPrefix}E`;
            const recD = `${syncPrefix}D`;
            const toRec = (id, type, title) => ({ clientId: id, type, data: { title, seed: syncStamp }, updatedAt: tOld });

            // 10A.1 种子授权：种子模式下 dev 账号登录即 pro（granted_by=seed）
            const p0 = await request(PORT, 'GET', '/api/auth/profile', { token: devToken });
            const p0data = (p0.body && p0.body.data) || {};
            record('种子授权 profile.plan=pro', p0.status === 200 && p0data.plan === 'pro' && p0data.pro_granted_by === 'seed',
                `HTTP ${p0.status}, plan=${p0data.plan}, granted_by=${p0data.pro_granted_by}`);

            // 10A.2 首轮上传 A/B + 全量拉取
            const s1 = await request(PORT, 'POST', '/api/calculations/sync', {
                token: devToken,
                json: { push: [toRec(recA, 'comprehensive', '一月份'), toRec(recB, 'business', '经营B')] },
            });
            const d1 = (s1.body && s1.body.data) || {};
            const pull1 = (d1.records || []).filter((r) => r.clientId === recA || r.clientId === recB);
            record('sync 上传+全量拉取', s1.status === 200 && pull1.length === 2 && pull1.every((r) => r.data && r.data.seed === syncStamp),
                `HTTP ${s1.status}, pulled=${pull1.length}`);

            // 10A.3 幂等重放：同 clientId 再推不产生重复
            const s2 = await request(PORT, 'POST', '/api/calculations/sync', { token: devToken, json: { push: [toRec(recA, 'comprehensive', '一月份')] } });
            const d2 = (s2.body && s2.body.data) || {};
            const aCnt = (d2.records || []).filter((r) => r.clientId === recA).length;
            record('sync 幂等（无重复条）', s2.status === 200 && aCnt === 1, `HTTP ${s2.status}, recA count=${aCnt}`);

            // 10A.4 冲突新者胜：旧时间回传不覆盖云端新版本
            await request(PORT, 'POST', '/api/calculations/sync', {
                token: devToken,
                json: { push: [{ clientId: recA, type: 'comprehensive', data: { title: '一月份v2', seed: syncStamp }, updatedAt: tNew }] },
            });
            const s3 = await request(PORT, 'POST', '/api/calculations/sync', {
                token: devToken,
                json: { push: [{ clientId: recA, type: 'comprehensive', data: { title: '旧设备覆盖', seed: syncStamp }, updatedAt: '2020-01-01T00:00:00.000Z' }] },
            });
            const d3 = (s3.body && s3.body.data) || {};
            const recANow = (d3.records || []).find((r) => r.clientId === recA);
            record('sync 冲突 updatedAt 新者胜', s3.status === 200 && recANow && recANow.data && recANow.data.title === '一月份v2',
                `HTTP ${s3.status}, cloud=${recANow && recANow.data && recANow.data.title}`);

            // 10A.5 墓碑：删除 recA → deletedClientIds 广播、records 中消失
            const s4 = await request(PORT, 'POST', '/api/calculations/sync', {
                token: devToken,
                json: { push: [{ clientId: recA, type: 'comprehensive', data: {}, updatedAt: tNew, deletedAt: tNew }] },
            });
            const d4 = (s4.body && s4.body.data) || {};
            const tombOk = (d4.deletedClientIds || []).includes(recA) && !(d4.records || []).some((r) => r.clientId === recA);
            record('sync 墓碑删除广播', s4.status === 200 && !!tombOk, `HTTP ${s4.status}`);

            // 10A.5B 前端同步引擎 × 真实服务端：沙箱 A 设备上传 → 沙箱 B 设备空本地拉回（换机/重装场景）
            const engRes = spawnSync(process.execPath, [path.join(serverDir, 'scripts', 'verify-cloud-sync-engine.js')], {
                env: { ...process.env, PORT: String(PORT), SYNC_TOKEN: devToken || '', SYNC_EMAIL: DEV_EMAIL, SYNC_PREFIX: syncPrefix },
                encoding: 'utf8',
                timeout: 30000,
            });
            const engOut = (engRes.stdout || '') + (engRes.stderr || '');
            record('sync 引擎·A设备本端上传', engRes.status === 0 && engOut.includes('ENG-A-UPLOAD-PASS'),
                engRes.status === 0 ? 'sandbox engine ok' : `code=${engRes.status} ${engOut.slice(-260)}`);
            record('sync 引擎·B设备空本地拉回', engRes.status === 0 && engOut.includes('ENG-B-PULL-PASS'),
                engRes.status === 0 ? 'sandbox engine ok' : engOut.slice(-260));
            // 清理引擎联测行，保证 10A.6 上限断言基数仍为「仅 recB 活跃」
            try {
                await prisma.calculation.deleteMany({ where: { user_id: devUserId, client_id: { startsWith: syncPrefix + 'ENG' } } });
            } catch { /* 清理失败不阻塞判定 */ }

            // 10A.6 上限：SYNC_MAX_RECORDS=3，第 4 条新记录被拒（409 HISTORY_LIMIT_REACHED）
            await request(PORT, 'POST', '/api/calculations/sync', { token: devToken, json: { push: [toRec(recC, 'classification', 'C'), toRec(recE, 'reverse', 'E')] } });
            const s5 = await request(PORT, 'POST', '/api/calculations/sync', { token: devToken, json: { push: [toRec(recD, 'comprehensive', 'D')] } });
            const limitOk = s5.status === 409 && s5.body && s5.body.error && s5.body.error.code === 'HISTORY_LIMIT_REACHED';
            record('sync 超过上限被拒(500条)', !!limitOk, `HTTP ${s5.status}, code=${s5.body && s5.body.error && s5.body.error.code}`);

            // 10A.7 free 拒绝：临时降级为 free → 403 PRO_REQUIRED
            await prisma.user.update({ where: { id: devUserId }, data: { plan: 'free', pro_granted_by: null } });
            const sf = await request(PORT, 'POST', '/api/calculations/sync', { token: devToken, json: { push: [toRec(recB, 'business', '经营B2')] } });
            const freeOk = sf.status === 403 && sf.body && sf.body.error && sf.body.error.code === 'PRO_REQUIRED';
            record('sync free 账号被拒(PRO_REQUIRED)', !!freeOk, `HTTP ${sf.status}, code=${sf.body && sf.body.error && sf.body.error.code}`);
        }
    } catch (e) {
        record('阶段10A 同步链路', false, e.message);
    } finally {
        // 清理本次同步测试数据 + 恢复 dev 账号种子 pro 授权
        try {
            const devUser = await prisma.user.findUnique({ where: { email: DEV_EMAIL } });
            if (devUser) {
                await prisma.calculation.deleteMany({ where: { user_id: devUser.id, client_id: { startsWith: syncPrefix } } });
                await prisma.user.update({ where: { id: devUser.id }, data: { plan: 'pro', pro_granted_by: 'seed' } });
            }
        } catch { /* 清理失败不阻塞判定 */ }
    }

    console.log('\n[6/6] 注册链路（邀请码 + 邮箱验证码 → 登录新号）...');
    let tmpInviteId = null;
    let tmpUserId = null;
    const stamp = Date.now();
    const newEmail = `verify.${stamp}@example.com`;
    const newUsername = `verify_${stamp % 100000000}`;
    const newPassword = 'password123';
    try {
        // 5.1 写一个专用邀请码（注册成功后随临时账号一并清理）
        const invite = await prisma.inviteCode.create({ data: { code: `VERIFY-${stamp.toString(36).toUpperCase()}` } });
        tmpInviteId = invite.id;
        record('准备专用邀请码', true, invite.code);

        // 5.2 请求验证码（开发模式会打印到后端控制台，等待提取）
        const sendCodeResp = await request(PORT, 'POST', '/api/auth/send-code', { json: { email: newEmail } });
        record('POST /send-code 发送注册验证码', sendCodeResp.status === 200, `HTTP ${sendCodeResp.status}`);

        let code = null;
        for (let i = 0; i < 20 && !code; i++) {
            code = extractCodeFromLog(serverLog, newEmail);
            if (!code) await sleep(300);
        }
        record('从后端控制台截取到 6 位验证码', !!code, code ? `code=${code}` : '（未见 [开发模式] 验证码打印）');

        if (code) {
            const reg = await request(PORT, 'POST', '/api/auth/register', {
                json: {
                    username: newUsername, email: newEmail, password: newPassword,
                    phone: null, inviteCode: invite.code, verificationCode: code,
                },
            });
            tmpUserId = reg.body && reg.body.data && reg.body.data.id || null;
            record('POST /register 注册新号（验证码+邀请码）', reg.status === 201, `HTTP ${reg.status}`);

            if (tmpUserId) {
                const login2 = await request(PORT, 'POST', '/api/auth/login', { json: { email: newEmail, password: newPassword } });
                const t2 = login2.body && login2.body.data && login2.body.data.token;
                record('新号登录成功', login2.status === 200 && !!t2, `HTTP ${login2.status}`);

                if (t2) {
                    const p2 = await request(PORT, 'GET', '/api/auth/profile', { token: t2 });
                    record('新号身份校验', p2.status === 200 && p2.body.data.username === newUsername, `HTTP ${p2.status}`);
                }
            }
        }
    } catch (e) {
        record('注册链路', false, e.message);
    } finally {
        try {
            if (tmpUserId) await prisma.user.delete({ where: { id: tmpUserId } });
            if (tmpInviteId) await prisma.inviteCode.delete({ where: { id: tmpInviteId } });
        } catch (e) { /* 清理失败不阻塞判定 */ }
    }

    // ---- 5. 收尾 ----
    try { child.kill(); } catch { /* 已退出 */ }
    try { await prisma.$disconnect(); } catch { /* ignore */ }
    // 演练模式把 Prisma Client 生成成了 PostgreSQL 版本，必须恢复为本地 SQLite 版本，
    // 否则后续 npm run verify:local / 本地启动会因 Client provider 与 dev.db 不匹配而失败
    if (PG_MODE) {
        const restore = spawnSync('npx prisma generate --schema prisma/schema.dev.prisma',
            { cwd: serverDir, shell: true, encoding: 'utf8', timeout: 120000 });
        if (restore.status === 0) {
            console.log('  [OK] 已恢复本地 SQLite Prisma Client（供日常开发/门禁使用）');
        } else {
            console.warn('  [WARN] 恢复 SQLite Client 失败，请手动执行: cd server && npm run prisma:generate:dev');
        }
    }

    const failed = results.filter((r) => !r.ok);
    console.log('\n========================================================');
    console.log(`  结果: ${results.length - failed.length}/${results.length} 通过`);
    if (failed.length > 0) {
        console.log('  未通过项:');
        failed.forEach((r) => console.log(`    - ${r.name}${r.detail ? `（${r.detail}）` : ''}`));
        console.log('\n  ❌ 本地验证未通过 —— 请勿 push 到线上。');
        exitCode = 1;
    } else {
        console.log('  ✅ 本地验证全部通过 —— 可以安全部署（git push）。');
    }
    console.log('========================================================\n');
    process.exit(exitCode);
})().catch((e) => {
    console.error('\n[FAIL] verify-local-auth 异常退出:', e);
    process.exit(1);
});
