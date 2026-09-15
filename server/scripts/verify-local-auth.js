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
 *   2. 确保本地测试账号存在（默认 dev@example.com / password；本机可用仓库根
 *      dev-account.local.json 覆盖成自己的账号，凭据不进版本库 → ./dev-account.js）
 *   3. 随机空闲端口启动后端（node src/app.js，同源托管前端+API）
 *   4. HTTP 级 e2e：
 *      - 前端资源冒烟：/ 含登录表单、auth-ui.js 含 dev-login-fill 且无 quick-login、SW 为 v8
 *      - 登录本地测试账号 → 拿 JWT → GET /profile 校验（含种子授权 plan=pro）
 *      - 阶段8 反馈链路：落库/用户列表/管理员跟进 + 附图（合法 data URL 落库、非图片与超 3 张 400）
 *      - 阶段10 运维后台（admin.html 后端）：用户列表搜索、详情计数、权益调档 pro↔free、无令牌 401
 *      - 阶段10A 云端同步链路：上传/全量拉取、幂等、冲突新者胜、墓碑广播、
 *        SYNC_MAX_RECORDS 上限拒绝、free 账号 403 PRO_REQUIRED
 *      - 阶段14 专业版兑换码：管理端生成/列表/作废/CSV 导出 + 用户端一码一用兑换
 *      - 阶段14 C2 城市社保参数库：公开只读（含兜底城市不变量 / since 增量）+ 管理端
 *        发布/回滚/版本号唯一/上限低于下限拒绝（端上已回退为全国口径，用户不再选参保城市）
 *      - 留资「所在城市」：省 + 市级联下拉（含「其他」手输兜底）静态接线 + e2e 省市落库、按市/按省搜索命中、CSV 省市列
 *      - 缴费比例：三页可输入数字框（默认 5%，不再是固定两档）+ 输入即时重算 / 留空越界兜底
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

// 本机测试账号：默认账号 / 本机覆盖文件（gitignored）统一从这里取，凭据不进版本库
const { loadDevAccount } = require('./dev-account');

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

    // ---- 2. 确保本地测试账号存在（默认 dev@example.com / password；本机覆盖见 dev-account.js） ----
    const bcrypt = require('bcryptjs');
    const devAccount = loadDevAccount();
    const DEV_EMAIL = devAccount.email;
    const DEV_USERNAME = devAccount.username;
    const DEV_PASSWORD = devAccount.password;
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

        // ---- 阶段13B 前端转化触点静态断言 ----
        const leadPage = await request(PORT, 'GET', '/');
        record('index.html 含留资弹窗(#lead-modal)与表单(#lead-form)',
            leadPage.status === 200 && leadPage.raw.includes('id="lead-modal"') && leadPage.raw.includes('id="lead-form"'), `HTTP ${leadPage.status}`);
        record('index.html 已引入 lead-modal.js / lead-touchpoints.js',
            leadPage.status === 200 && leadPage.raw.includes('src/js/lead/lead-modal.js') && leadPage.raw.includes('src/js/lead/lead-touchpoints.js'), `HTTP ${leadPage.status}`);
        const leadModalJs = await request(PORT, 'GET', '/src/js/lead/lead-modal.js');
        record('lead-modal.js 暴露 window.LeadModal 且派发 lead-click 埋点',
            leadModalJs.status === 200 && leadModalJs.raw.includes('window.LeadModal') && leadModalJs.raw.includes('euriskotax:lead-click'), `HTTP ${leadModalJs.status}`);
        const apiClientJs = await request(PORT, 'GET', '/src/js/api/api-client.js');
        record('api-client.js 新增 submitLead（公开端点，游客可用）',
            apiClientJs.status === 200 && apiClientJs.raw.includes('function submitLead') && apiClientJs.raw.includes("'/leads'"), `HTTP ${apiClientJs.status}`);
        const leadTouchJs = await request(PORT, 'GET', '/src/js/lead/lead-touchpoints.js');
        const allowedMatch = leadTouchJs.raw.match(/ALLOWED_TYPES\s*=\s*\[([^\]]*)\]/);
        const allowedBody = allowedMatch ? allowedMatch[1] : '';
        record('lead-touchpoints.js 分流白名单排除谈薪(reverse)',
            leadTouchJs.status === 200 && allowedMatch !== null && allowedBody.indexOf('reverse') === -1 && allowedBody.indexOf('business') !== -1,
            `HTTP ${leadTouchJs.status}`);
        record('lead-touchpoints.js 显式排除 reverse（硬约束）',
            leadTouchJs.status === 200 && /BLOCKED_TYPES\s*=\s*\[[^\]]*'reverse'/.test(leadTouchJs.raw), `HTTP ${leadTouchJs.status}`);
        record('auth-ui.js 含个人中心留资入口(profile-card-lead)',
            authJs.status === 200 && authJs.raw.includes('profile-card-lead'), `HTTP ${authJs.status}`);

        // ---- 阶段13B+ 咨询情境真实性（不再拿入口标签冒充「当前测算」）----
        const leadCtxJs = await request(PORT, 'GET', '/src/js/lead/lead-context.js');
        record('lead-context.js 暴露 window.LeadContext（咨询情境数据层）',
            leadCtxJs.status === 200 && leadCtxJs.raw.includes('window.LeadContext') && leadCtxJs.raw.includes('historyOptions'),
            `HTTP ${leadCtxJs.status}`);
        record('index.html 引入 lead-context.js 且含情境选择器(#lead-scene-select)',
            leadPage.status === 200 && leadPage.raw.includes('src/js/lead/lead-context.js')
            && leadPage.raw.includes('id="lead-scene-select"'), `HTTP ${leadPage.status}`);
        record('弹窗不再伪造「当前测算」，改用可核实的「参考您的测算」',
            leadModalJs.status === 200 && leadModalJs.raw.includes('参考您的测算：')
            && leadModalJs.raw.indexOf("'当前测算：'") === -1, `HTTP ${leadModalJs.status}`);
        record('结果页触点只传计算类型(data-type)，不再传死场景(data-scene)',
            leadTouchJs.status === 200 && leadTouchJs.raw.includes('data-type')
            && leadTouchJs.raw.indexOf('data-scene') === -1, `HTTP ${leadTouchJs.status}`);
        record('个人中心入口不再伪造「个人中心·财税服务」这一假测算',
            authJs.status === 200 && authJs.raw.indexOf('个人中心·财税服务') === -1, `HTTP ${authJs.status}`);

        // ---- 阶段13C 运维后台「线索」Tab 静态断言 ----
        const adminPage = await request(PORT, 'GET', '/admin.html');
        record('admin.html 含线索 Tab(data-nav="leads")与视图(#view-leads)',
            adminPage.status === 200 && adminPage.raw.includes('data-nav="leads"') && adminPage.raw.includes('id="view-leads"'), `HTTP ${adminPage.status}`);
        const adminJs = await request(PORT, 'GET', '/src/js/admin/admin.js');
        record('admin.js 接通线索端点(列表/统计/导出)与交互(状态机/分配)',
            adminJs.status === 200 && adminJs.raw.includes('/admin/leads') && adminJs.raw.includes('loadLeadFunnel') && adminJs.raw.includes('data-lead-status') && adminJs.raw.includes('leads/export'),
            `HTTP ${adminJs.status}`);

        // ---- 阶段13D 分享图静态断言 ----
        const shareJs = await request(PORT, 'GET', '/src/js/share/share-card.js');
        record('share-card.js 含 2 模板(income/negotiation)与固定免责声明',
            shareJs.status === 200 && shareJs.raw.includes("'income'") && shareJs.raw.includes("'negotiation'")
            && shareJs.raw.includes('不构成税务建议'), `HTTP ${shareJs.status}`);
        record('index.html 已引入 share-card.js / capture.js / 二维码库',
            leadPage.status === 200 && leadPage.raw.includes('src/js/share/share-card.js')
            && leadPage.raw.includes('src/js/export/capture.js') && leadPage.raw.includes('qrcode'), `HTTP ${leadPage.status}`);
        const shareLandingJs = await request(PORT, 'GET', '/src/js/share/share-landing.js');
        record('share-landing.js 提供分享落地首屏引导(?source=share)',
            shareLandingJs.status === 200 && shareLandingJs.raw.includes('source=share')
            && shareLandingJs.raw.includes('home-start-card'), `HTTP ${shareLandingJs.status}`);
        record('index.html 引入 share-landing.js 且含落地 CTA 锚点(#home-start-card)',
            leadPage.status === 200 && leadPage.raw.includes('src/js/share/share-landing.js')
            && leadPage.raw.includes('id="home-start-card"'), `HTTP ${leadPage.status}`);
        const captureJs = await request(PORT, 'GET', '/src/js/export/capture.js');
        record('capture.js 暴露 window.Capture.captureHtml（PDF 与分享图共用截图层）',
            captureJs.status === 200 && captureJs.raw.includes('window.Capture') && captureJs.raw.includes('captureHtml'), `HTTP ${captureJs.status}`);
        const navJs = await request(PORT, 'GET', '/src/js/ui/navigation-ui.js');
        record('PDF 导出已收敛到公共截图层（navigation-ui 内不再直接调用 html2canvas）',
            navJs.status === 200 && navJs.raw.includes('window.Capture') && !navJs.raw.includes('html2canvas('), `HTTP ${navJs.status}`);
        record('分享图二维码带 source=share 归因，且留资弹窗读取该落地来源（T4 闭环）',
            shareJs.status === 200 && shareJs.raw.includes('source=share')
            && leadModalJs.raw.includes('opts.source || landingSource()'), '');
        record('分享图拒绝生成「0 元结果」—— isMeaningful 拦截 ¥0.00 等小数零',
            shareJs.status === 200 && shareJs.raw.includes('isMeaningful')
            && shareJs.raw.includes('/^0\\.0*$/'), `HTTP ${shareJs.status}`);
        record('分享图二维码 URL 支持外部配置（setShareBaseUrl / EuriskoTaxConfig），避免 localhost 泄露',
            shareJs.status === 200 && shareJs.raw.includes('setShareBaseUrl')
            && shareJs.raw.includes('shareBaseUrl'), `HTTP ${shareJs.status}`);
        record('分享图失败分支使用页面内提示（alert 会被浏览器屏蔽成「点了没反应」）',
            shareJs.status === 200 && shareJs.raw.includes('showToast')
            && shareJs.raw.indexOf('alert(') === -1, `HTTP ${shareJs.status}`);
        record('分享图失败提示条固定在顶部、层级高于页面横幅（底部提示会被整条错过）',
            shareJs.status === 200 && shareJs.raw.includes('toastTopOffset')
            && shareJs.raw.includes('z-index:10002'), `HTTP ${shareJs.status}`);

        // ---- 阶段14 专业版兑换码静态断言（线下收款授权闭环）----
        record('admin.html 含兑换码 Tab(data-nav="procodes")与视图(#view-procodes)',
            adminPage.status === 200 && adminPage.raw.includes('data-nav="procodes"') && adminPage.raw.includes('id="view-procodes"'),
            `HTTP ${adminPage.status}`);
        record('admin.js 接通兑换码端点(生成/列表/作废/导出)与筛选交互',
            adminJs.status === 200 && adminJs.raw.includes('/admin/pro-codes') && adminJs.raw.includes('loadProCodes')
            && adminJs.raw.includes('generateProCodes') && adminJs.raw.includes('toggleProCode') && adminJs.raw.includes('exportProCodes'),
            `HTTP ${adminJs.status}`);
        record('api-client.js 新增 redeemProCode（用户端自助兑换）',
            apiClientJs.status === 200 && apiClientJs.raw.includes('function redeemProCode') && apiClientJs.raw.includes("'/pro-codes/redeem'"),
            `HTTP ${apiClientJs.status}`);
        record('index.html 含兑换码输入框(#upgrade-redeem-input)与兑换按钮',
            leadPage.status === 200 && leadPage.raw.includes('id="upgrade-redeem-input"') && leadPage.raw.includes('id="upgrade-redeem-btn"'),
            `HTTP ${leadPage.status}`);
        record('auth-ui.js 集成兑换码处理(handleRedeemProCode → redeemProCode)',
            authJs.status === 200 && authJs.raw.includes('handleRedeemProCode') && authJs.raw.includes('redeemProCode'),
            `HTTP ${authJs.status}`);

        // ---- 阶段14 C2 回退（2026-09）：端上不再让用户选参保城市，改在留资时收集 ----
        // 保持断言：删掉的前端同步层/选择器不能再被 index.html 引用（防止半吊子回滚：
        // 文件删了但页面还引着 → 用户拿到 404 脚本 + 口径静默退回全国）
        record('index.html 不再引用已下线的城市社保同步层/选择器（回滚不残留半截）',
            leadPage.status === 200 && !leadPage.raw.includes('city-social-sync.js')
            && !leadPage.raw.includes('city-social-ui.js'),
            `HTTP ${leadPage.status}`);
        // 控件从「自由文本框」收紧为「省 + 市级联下拉」：手输城市名五花八门（上海 / 上海市 / 魔都），
        // 顾问拿到线索还得猜是哪个统筹区；「其他 / 海外」+「其他（手动输入）」是兜底 ——
        // 行政区划不可能穷尽（县级市 / 境外），不能把用户卡在本就必填的这一项上
        record('index.html「所在城市」为省 + 市级联下拉(#lead-province/#lead-city)+手输兜底，且保留必填星号并引入省市数据',
            leadPage.status === 200 && leadPage.raw.includes('id="lead-province"')
            && leadPage.raw.includes('id="lead-city"') && leadPage.raw.includes('id="lead-city-other"')
            && leadPage.raw.includes('所在城市 <span class="text-red-500">*</span>')
            && leadPage.raw.includes('src/js/data/china-regions.js'),
            `HTTP ${leadPage.status}`);
        const chinaRegionsJs = await request(PORT, 'GET', '/src/js/data/china-regions.js');
        record('china-regions.js 提供省级行政区数据（直辖市/自治区/港澳台）供联动，lead-modal.js 做联动与必填校验',
            chinaRegionsJs.status === 200 && chinaRegionsJs.raw.includes('citiesOf')
            && chinaRegionsJs.raw.includes('北京') && chinaRegionsJs.raw.includes('新疆')
            && chinaRegionsJs.raw.includes('香港')
            && leadModalJs.status === 200 && leadModalJs.raw.includes('renderProvinces')
            && leadModalJs.raw.includes('setCities') && leadModalJs.raw.includes('lead-city-other')
            && leadModalJs.raw.includes("val('lead-city')") && leadModalJs.raw.includes('请填写所在城市'),
            `HTTP ${chinaRegionsJs.status}/${leadModalJs.status}`);
        // 省份不能只是「筛选城市的中间态」：顾问要按省收敛分派（江浙沪私域），后端也要拿到。
        // 哨兵值必须剔除 —— 选「其他 / 海外」时下拉值是 '__other'，透传下去顾问会看到一行无意义的占位符
        record('lead-modal.js 采集省份并剔除「其他 / 海外」哨兵值（省 + 市一起提交后端）',
            leadModalJs.status === 200
            && /province\s*=\s*provinceRaw\s*===\s*PROVINCE_OTHER/.test(leadModalJs.raw)
            && leadModalJs.raw.includes('province: province,'),
            `HTTP ${leadModalJs.status}`);
        record('api-client.js 提交线索带上 province + city（与后端 buildLead 白名单一致）',
            apiClientJs.status === 200 && apiClientJs.raw.includes('province: p.province')
            && apiClientJs.raw.includes('city: p.city'),
            `HTTP ${apiClientJs.status}`);
        record('admin.js 线索列表展示省 + 市（顾问按当地基数口径核对）',
            adminJs.status === 200 && adminJs.raw.includes('it.province') && adminJs.raw.includes('it.city'),
            `HTTP ${adminJs.status}`);

        // ---- 缴费比例：用户自填（各地 5%~12% 口径不同，固定两档会让用户选不到自己的比例）----
        // 控件形态与「空值兜底」都要守住：清空输入若按 0 计算，公积金会静默变 0，用户会当成算错
        const homeAppJs = await request(PORT, 'GET', '/src/js/app.js');
        const helperFnJs = await request(PORT, 'GET', '/src/js/calculation/helper-functions.js');
        const rateInputIds = ['housing-fund-rate', 'reverse-housing-fund-rate', 'business-housing-fund-rate'];
        record('index.html 三页「缴费比例」为可输入数字框且默认 5%（不再是固定两档下拉）',
            leadPage.status === 200
            && rateInputIds.every((id) => !leadPage.raw.includes(`<select id="${id}"`)
                && new RegExp(`<input type="number" id="${id}"[^>]*value="5"`).test(leadPage.raw)),
            `HTTP ${leadPage.status}`);
        record('缴费比例输入即时重算 + 留空/越界回落默认值（清空后公积金不会静默变 0）',
            helperFnJs.status === 200 && helperFnJs.raw.includes('function normalizeRateInput')
            && homeAppJs.status === 200
            && homeAppJs.raw.includes("document.getElementById('housing-fund-rate').addEventListener('input'")
            && homeAppJs.raw.includes("document.getElementById('reverse-housing-fund-rate').addEventListener('input'")
            && homeAppJs.raw.includes('normalizeRateInput(this)'),
            `HTTP ${homeAppJs.status}/${helperFnJs.status}`);
        // 经营页的基数/比例原本一个事件都没接（改什么都不发生），且养老清空后若统一回落 5% 是错的
        record('经营页「缴费基数 × 缴费比例」联动 + 低于下限提示接线（各险种回落自己的默认比例）',
            helperFnJs.status === 200
            && helperFnJs.raw.includes('function calculateBusinessInsurance')
            && helperFnJs.raw.includes('function calculateBusinessSocialInsurance')
            && helperFnJs.raw.includes('fallback: 8')
            && homeAppJs.status === 200
            && homeAppJs.raw.includes("['business-social-security-base', 'business-housing-fund-base']")
            && homeAppJs.raw.includes("['business-pension-rate', 'business-medical-rate', 'business-unemployment-rate', 'business-housing-fund-rate']")
            && homeAppJs.raw.includes("validateSocialSecurityBase('business')")
            && homeAppJs.raw.includes("validateHousingFundBase('business')"),
            `HTTP ${homeAppJs.status}/${helperFnJs.status}`);
        record('admin.html 含社保基数 Tab(data-nav="citysocial")与视图(#view-citysocial)',
            adminPage.status === 200 && adminPage.raw.includes('data-nav="citysocial"') && adminPage.raw.includes('id="view-citysocial"'),
            `HTTP ${adminPage.status}`);
        record('admin.js 接通城市社保端点与编辑器交互(城市增删/回滚)',
            adminJs.status === 200 && adminJs.raw.includes('/admin/city-social') && adminJs.raw.includes('loadCitySocial')
            && adminJs.raw.includes('saveCitySocial') && adminJs.raw.includes('citySocialEditorHtml')
            && adminJs.raw.includes('removeCitySocialRow'),
            `HTTP ${adminJs.status}`);

        // ---- Swagger 文档完整性：@swagger JSDoc 的 YAML 若写坏，端点会「静默」从文档消失 ----
        // 典型坑：在 flow map（单行 {}）的值里写裸 { 或英文逗号，yaml 直接解析失败并只打日志，
        // 端点仍在路由里正常工作，但 /api/docs 看不到 → 只能靠断言拦。
        const docsJson = await request(PORT, 'GET', '/api/docs.json');
        const docsPaths = (docsJson.body && docsJson.body.paths) || {};
        record('Swagger /api/docs.json 可解析且含线索端点（JSDoc YAML 未写坏）',
            docsJson.status === 200 && !!docsPaths['/api/leads'] && !!docsPaths['/api/admin/leads/export'],
            `HTTP ${docsJson.status}, paths=${Object.keys(docsPaths).length}`);
        record('Swagger /api/docs.json 含兑换码端点（用户端 + 管理端）',
            docsJson.status === 200 && !!docsPaths['/api/pro-codes/redeem'] && !!docsPaths['/api/admin/pro-codes'],
            `HTTP ${docsJson.status}, paths=${Object.keys(docsPaths).length}`);
        record('Swagger /api/docs.json 含城市社保参数端点（公开 + 管理端 + 回滚）',
            docsJson.status === 200 && !!docsPaths['/api/config/city-social']
            && !!docsPaths['/api/admin/city-social'] && !!docsPaths['/api/admin/city-social/rollback'],
            `HTTP ${docsJson.status}, paths=${Object.keys(docsPaths).length}`);

        // ---- 阶段14 剩余项：SEO 落地页（收录自洽 + 口径同源） ----
        // 落地页最容易腐烂的三件事：页面上了线但 sitemap 没收录；sitemap 收录了却是 404；
        // 为了「能算」在页面里抄了第二份税率表，App 改口径后两个页面数字不一致。
        const robots = await request(PORT, 'GET', '/robots.txt');
        record('robots.txt 允许抓取公开页且声明 sitemap',
            robots.status === 200 && /User-agent:\s*\*/i.test(robots.raw)
            && /Disallow:\s*\/api\//.test(robots.raw)
            && robots.raw.includes('Sitemap: https://euriskotax.zeabur.app/sitemap.xml'),
            `HTTP ${robots.status}`);
        const sitemap = await request(PORT, 'GET', '/sitemap.xml');
        const sitemapLocs = (sitemap.raw.match(/<loc>([^<]+)<\/loc>/g) || []).map((s) => s.replace(/<\/?loc>/g, ''));
        record('sitemap.xml 可访问且收录首页与全部落地页',
            sitemap.status === 200 && sitemapLocs.includes('https://euriskotax.zeabur.app/')
            && sitemapLocs.some((u) => u.endsWith('/seo/bonus-tax.html'))
            && sitemapLocs.some((u) => u.endsWith('/seo/salary-tax.html'))
            && sitemapLocs.some((u) => u.endsWith('/seo/annual-settlement.html'))
            && sitemapLocs.some((u) => u.endsWith('/seo/labor-withholding.html'))
            && sitemapLocs.some((u) => u.endsWith('/seo/equity-incentive.html'))
            && sitemapLocs.some((u) => u.endsWith('/seo/severance.html'))
            && sitemapLocs.some((u) => u.endsWith('/seo/special-deduction.html')),
            `HTTP ${sitemap.status}, ${sitemapLocs.length} 条`);
        const bonusPage = await request(PORT, 'GET', '/seo/bonus-tax.html');
        record('年终奖落地页可访问且含 canonical/FAQPage 结构化数据与政策依据',
            bonusPage.status === 200 && bonusPage.raw.includes('rel="canonical"')
            && bonusPage.raw.includes('FAQPage') && bonusPage.raw.includes('2027 年 12 月 31 日')
            && bonusPage.raw.includes('财政部 税务总局公告 2023 年第 30 号'),
            `HTTP ${bonusPage.status}`);
        // 落地页为了「爬虫不执行 JS 也能读到税率表」，正文里必然有一份**静态**表格 ——
        // 所以不能靠「禁止出现某个税率数字」来防重复口径（那会误伤可抓取性），
        // 正确做法是：把页面上的静态表与常量文件里的表**逐档对账**，常量改了页面没改就红。
        const constantsJs = await request(PORT, 'GET', '/src/js/calculation/tax-constants.js');
        const bonusBlock = (constantsJs.raw.match(/bonusMonthlyTaxRates\s*=\s*\[([\s\S]*?)\n\s*\]/) || [])[1] || '';
        const bonusRows = Array.from(bonusBlock.matchAll(/rate:\s*([\d.]+)\s*,\s*deduction:\s*(\d+)/g))
            .map((m) => ({ rate: Number(m[1]), deduction: Number(m[2]) }));
        const staleRows = bonusRows.filter((r) => {
            const pct = `${Math.round(r.rate * 1000) / 10}%`;   // 0.03 → '3%'（避开浮点 3.0000000000000004）
            return !bonusPage.raw.includes(pct) || !bonusPage.raw.includes(`>${r.deduction}<`);
        });
        record('落地页静态税率表与常量文件逐档一致（页面不维护第二份口径）',
            bonusPage.status === 200 && bonusRows.length === 7 && staleRows.length === 0
            && bonusPage.raw.includes('/src/js/calculation/tax-constants.js')
            && bonusPage.raw.includes('/src/js/calculation/bonus-tax-quick.js')
            && bonusPage.raw.includes('/src/js/data/tax-rates-sync.js'),
            `常量 ${bonusRows.length} 档, 与页面不一致 ${staleRows.length} 档`);
        record('落地页 CTA 带 SEO 归因参数（线索来源可回流）',
            bonusPage.status === 200 && bonusPage.raw.includes('?source=seo_bonus'), '');
        // 同一套守护扩到「月薪个税」落地页：可访问 + 结构化数据 + 静态预扣率表逐档对账 + 归因参数。
        // 页面上的逐月示例表数字也要能被读到（爬虫不执行 JS，示例是纯静态正文）。
        const salaryPage = await request(PORT, 'GET', '/seo/salary-tax.html');
        record('月薪个税落地页可访问且含 canonical/FAQPage 结构化数据与政策依据',
            salaryPage.status === 200 && salaryPage.raw.includes('rel="canonical"')
            && salaryPage.raw.includes('FAQPage') && salaryPage.raw.includes('国家税务总局公告 2018 年第 61 号'),
            `HTTP ${salaryPage.status}`);
        const comprehensiveBlock = (constantsJs.raw.match(/comprehensiveTaxRates\s*=\s*\[([\s\S]*?)\n\s*\]/) || [])[1] || '';
        const comprehensiveRows = Array.from(comprehensiveBlock.matchAll(/rate:\s*([\d.]+)\s*,\s*deduction:\s*(\d+)/g))
            .map((m) => ({ rate: Number(m[1]), deduction: Number(m[2]) }));
        const staleSalaryRows = comprehensiveRows.filter((r) => {
            const pct = `${Math.round(r.rate * 1000) / 10}%`;   // 0.03 → '3%'（避开浮点 3.0000000000000004）
            return !salaryPage.raw.includes(pct) || !salaryPage.raw.includes(`>${r.deduction}<`);
        });
        record('月薪个税落地页静态预扣率表与常量文件逐档一致（页面不维护第二份口径）',
            salaryPage.status === 200 && comprehensiveRows.length === 7 && staleSalaryRows.length === 0
            && salaryPage.raw.includes('/src/js/calculation/tax-constants.js')
            && salaryPage.raw.includes('/src/js/data/tax-rates-sync.js')
            && salaryPage.raw.includes('/src/js/calculation/salary-tax-quick.js'),
            `常量 ${comprehensiveRows.length} 档, 与页面不一致 ${staleSalaryRows.length} 档`);
        record('月薪个税落地页静态逐月示例表可被读到（首月 300 / 第 4 月 580 / 全年 9480）',
            salaryPage.status === 200 && salaryPage.raw.includes('>300.00<')
            && salaryPage.raw.includes('>580.00<') && salaryPage.raw.includes('>9480.00<'), '');
        record('月薪个税落地页 CTA 带 SEO 归因参数（线索来源可回流）',
            salaryPage.status === 200 && salaryPage.raw.includes('?source=seo_salary'), '');
        // 第三张落地页「汇算清缴（退税/补税）」：前两张的守护照旧，另加一项本页独有的口径守护 ——
        // 这一页的核心结论是一道减法（应退/应补 = 全年应纳税额 − 已预缴税额），
        // 所以示例表里「差额 0 / 应补 9600」等数字必须能被爬虫读到，且年度税率表要与常量文件逐档一致。
        const settlementPage = await request(PORT, 'GET', '/seo/annual-settlement.html');
        record('汇算清缴落地页可访问且含 canonical/FAQPage 结构化数据与政策依据',
            settlementPage.status === 200 && settlementPage.raw.includes('rel="canonical"')
            && settlementPage.raw.includes('FAQPage')
            && settlementPage.raw.includes('国家税务总局公告 2019 年第 44 号')
            && settlementPage.raw.includes('6 月 30 日'),
            `HTTP ${settlementPage.status}`);
        const staleSettlementRows = comprehensiveRows.filter((r) => {
            const pct = `${Math.round(r.rate * 1000) / 10}%`;   // 0.03 → '3%'（避开浮点 3.0000000000000004）
            return !settlementPage.raw.includes(pct) || !settlementPage.raw.includes(`>${r.deduction}<`);
        });
        record('汇算清缴落地页静态年度税率表与常量文件逐档一致（页面不维护第二份口径）',
            settlementPage.status === 200 && comprehensiveRows.length === 7 && staleSettlementRows.length === 0
            && settlementPage.raw.includes('/src/js/calculation/tax-constants.js')
            && settlementPage.raw.includes('/src/js/data/tax-rates-sync.js')
            && settlementPage.raw.includes('/src/js/calculation/annual-settlement-quick.js'),
            `常量 ${comprehensiveRows.length} 档, 与页面不一致 ${staleSettlementRows.length} 档`);
        record('汇算清缴落地页静态示例表可被读到（应退应补 0 / 应补 9600，含 9480 与 19080 口径）',
            settlementPage.status === 200 && settlementPage.raw.includes('>9480.00<')
            && settlementPage.raw.includes('>3480.00<') && settlementPage.raw.includes('>19080.00<')
            && settlementPage.raw.includes('>9600.00<'), '');
        record('汇算清缴落地页 CTA 带 SEO 归因参数（线索来源可回流）',
            settlementPage.status === 200 && settlementPage.raw.includes('?source=seo_settlement'), '');
        // 第四张落地页「劳务报酬 / 稿酬 / 特许权使用费预扣预缴」（阶段15 15A-1）：
        // 前三张的守护照旧，另加两项本页独有的口径守护 ——
        //   ① 预扣率表（20/30/40，速算扣除 0/2000/7000）与常量逐档对账（不再硬编码在内核里）；
        //   ② 政策依据文号来自税种注册表 tax-registry.js，页面不得自己写一份口径。
        const withholdingPage = await request(PORT, 'GET', '/seo/labor-withholding.html');
        record('劳务报酬落地页可访问且含 canonical/FAQPage 结构化数据与政策依据',
            withholdingPage.status === 200 && withholdingPage.raw.includes('rel="canonical"')
            && withholdingPage.raw.includes('FAQPage')
            && withholdingPage.raw.includes('国家税务总局公告 2018 年第 61 号'),
            `HTTP ${withholdingPage.status}`);
        const laborBlock = (constantsJs.raw.match(/labor:\s*\[([\s\S]*?)\]/) || [])[1] || '';
        const laborRows = Array.from(laborBlock.matchAll(/rate:\s*([\d.]+)\s*,\s*deduction:\s*(\d+)/g))
            .map((m) => ({ rate: Number(m[1]), deduction: Number(m[2]) }));
        const staleLaborRows = laborRows.filter((r) => {
            const pct = `${Math.round(r.rate * 1000) / 10}%`;
            return !withholdingPage.raw.includes(pct) || !withholdingPage.raw.includes(`>${r.deduction}<`);
        });
        record('劳务报酬落地页静态预扣率表与常量文件逐档一致（页面不维护第二份口径）',
            withholdingPage.status === 200 && laborRows.length === 3 && staleLaborRows.length === 0
            && withholdingPage.raw.includes('/src/js/calculation/tax-constants.js')
            && withholdingPage.raw.includes('/src/js/calculation/tax-registry.js')
            && withholdingPage.raw.includes('/src/js/data/tax-rates-sync.js')
            && withholdingPage.raw.includes('/src/js/calculation/withholding-quick.js'),
            `常量 ${laborRows.length} 档, 与页面不一致 ${staleLaborRows.length} 档`);
        record('劳务报酬落地页静态示例表与年度税率表可读（1600 / 1120 / 8000 / 5600 + 七档税率）',
            withholdingPage.status === 200 && withholdingPage.raw.includes('>1600.00<')
            && withholdingPage.raw.includes('>1120.00<') && withholdingPage.raw.includes('>8000.00<')
            && withholdingPage.raw.includes('>5600.00<')
            && ['3%', '10%', '20%', '25%', '30%', '35%', '45%'].every((p) => withholdingPage.raw.includes(`>${p}<`)), '');
        record('劳务报酬落地页 CTA 带 SEO 归因参数（线索来源可回流）',
            withholdingPage.status === 200 && withholdingPage.raw.includes('?source=seo_withholding'), '');
        const registryJs = await request(PORT, 'GET', '/src/js/calculation/tax-registry.js');
        record('税种注册表登记了劳务报酬页与政策文号（页面只呈现、不自己写口径）',
            registryJs.status === 200 && registryJs.raw.includes("id: 'withholding'")
            && registryJs.raw.includes("page: '/seo/labor-withholding.html'")
            && registryJs.raw.includes('国家税务总局公告 2018 年第 61 号'),
            `HTTP ${registryJs.status}`);
        // 第五张落地页「股权激励个税」（阶段15 15A-2）：
        // 与劳务报酬页同一套守护（可访问性 / 结构化数据 / 静态表对账 / 示例表 / CTA 归因），
        // 另加一条本页独有的口径断言 —— 单独计税是「不并入」而非「可选并入」，
        // 若哪天页面把「并入」写成可选，政策口径就错了，这里拦的是这句声明。
        const equityPage = await request(PORT, 'GET', '/seo/equity-incentive.html');
        record('股权激励落地页可访问且含 canonical/FAQPage 结构化数据与政策依据',
            equityPage.status === 200 && equityPage.raw.includes('rel="canonical"')
            && equityPage.raw.includes('FAQPage')
            && equityPage.raw.includes('财政部 税务总局公告 2023 年第 25 号')
            && equityPage.raw.includes('财税〔2018〕164 号'),
            `HTTP ${equityPage.status}`);
        const annualBlock = (equityPage.raw.split('id="annual-rate-table"')[1] || '').split('</table>')[0];
        const annualRows = Array.from(annualBlock.matchAll(/<td>([^<]+)<\/td><td class="num">([\d.]+)%<\/td><td class="num">([\d,]+)<\/td>/g))
            .map((m) => ({ pct: Number(m[2]), deduction: Number(m[3].replace(/,/g, '')) }));
        const staleAnnualRows = annualRows.filter((r) => !constantsJs.raw.match(
            new RegExp(`rate:\\s*${(r.pct / 100).toFixed(2)}\\s*,\\s*deduction:\\s*${r.deduction}`)
        ));
        record('股权激励落地页静态年度税率表与常量文件逐档一致（页面不维护第二份口径）',
            equityPage.status === 200 && annualRows.length === 7 && staleAnnualRows.length === 0
            && equityPage.raw.includes('/src/js/calculation/tax-constants.js')
            && equityPage.raw.includes('/src/js/calculation/tax-registry.js')
            && equityPage.raw.includes('/src/js/calculation/equity-incentive-quick.js'),
            `页面 ${annualRows.length} 档, 与常量不一致 ${staleAnnualRows.length} 档`);
        record('股权激励落地页静态示例表与对照表可读（100000/7480、200000/23080、600000/127080、14960、8120）',
            equityPage.status === 200 && equityPage.raw.includes('>100000.00<')
            && equityPage.raw.includes('>7480.00<') && equityPage.raw.includes('>200000.00<')
            && equityPage.raw.includes('>127080.00<') && equityPage.raw.includes('>14960.00<')
            && equityPage.raw.includes('>8120.00<'), '');
        record('股权激励落地页 CTA 带 SEO 归因参数（线索来源可回流）',
            equityPage.status === 200 && equityPage.raw.includes('?source=seo_equity'), '');
        record('税种注册表登记了股权激励页：单独计税「不并入」而非可选并入 + 到期日 2027-12-31',
            registryJs.status === 200 && registryJs.raw.includes("id: 'equity-incentive'")
            && registryJs.raw.includes("page: '/seo/equity-incentive.html'")
            && registryJs.raw.includes('expiresOn: \'2027-12-31\'')
            && equityPage.raw.includes('不并入当年综合所得')
            && equityPage.raw.includes('2027 年 12 月 31 日'),
            `HTTP ${registryJs.status}`);
        // 第六张落地页「离职补偿金个税」（阶段15 15A-3）：
        // 与股权激励页同一套守护（可访问性 / 结构化数据 / 静态表对账 / 示例表 / CTA 归因），
        // 另加一条本页独有的口径断言 —— 超额部分「单独适用年度税率表、不按工作年限平均」，
        // 国税发〔1999〕178 号的平均法已不再执行，页面若照抄旧算法，这句断言就红。
        const severancePage = await request(PORT, 'GET', '/seo/severance.html');
        record('离职补偿金落地页可访问且含 canonical/FAQPage 结构化数据与政策依据',
            severancePage.status === 200 && severancePage.raw.includes('rel="canonical"')
            && severancePage.raw.includes('FAQPage')
            && severancePage.raw.includes('财税〔2018〕164 号')
            && severancePage.raw.includes('劳动合同法》第四十七条'),
            `HTTP ${severancePage.status}`);
        const severanceAnnualBlock = (severancePage.raw.split('id="annual-rate-table"')[1] || '').split('</table>')[0];
        const severanceAnnualRows = Array.from(severanceAnnualBlock.matchAll(/<td>([^<]+)<\/td><td class="num">([\d.]+)%<\/td><td class="num">([\d,]+)<\/td>/g))
            .map((m) => ({ pct: Number(m[2]), deduction: Number(m[3].replace(/,/g, '')) }));
        const staleSeveranceRows = severanceAnnualRows.filter((r) => !constantsJs.raw.match(
            new RegExp(`rate:\\s*${(r.pct / 100).toFixed(2)}\\s*,\\s*deduction:\\s*${r.deduction}`)
        ));
        record('离职补偿金落地页静态年度税率表与常量文件逐档一致（页面不维护第二份口径）',
            severancePage.status === 200 && severanceAnnualRows.length === 7 && staleSeveranceRows.length === 0
            && severancePage.raw.includes('/src/js/calculation/tax-constants.js')
            && severancePage.raw.includes('/src/js/calculation/tax-registry.js')
            && severancePage.raw.includes('/src/js/calculation/severance-quick.js'),
            `页面 ${severanceAnnualRows.length} 档, 与常量不一致 ${staleSeveranceRows.length} 档`);
        record('离职补偿金落地页静态示例表与对照表可读（70000/4480、130000/10480、17960、29080、11120）',
            severancePage.status === 200 && severancePage.raw.includes('>70000.00<')
            && severancePage.raw.includes('>4480.00<') && severancePage.raw.includes('>130000.00<')
            && severancePage.raw.includes('>10480.00<') && severancePage.raw.includes('>17960.00<')
            && severancePage.raw.includes('>29080.00<') && severancePage.raw.includes('>11120.00<'), '');
        record('离职补偿金落地页 CTA 带 SEO 归因参数（线索来源可回流）',
            severancePage.status === 200 && severancePage.raw.includes('?source=seo_severance'), '');
        record('税种注册表登记了离职补偿金页：长期政策（无到期日）+ 旧的平均法已不再执行 + 不并入',
            registryJs.status === 200 && registryJs.raw.includes("id: 'severance'")
            && registryJs.raw.includes("page: '/seo/severance.html'")
            && registryJs.raw.includes('expiresOn: null')
            && severancePage.raw.includes('不并入当年综合所得')
            && severancePage.raw.includes('国税发〔1999〕178 号')
            && severancePage.raw.includes('不再执行'),
            `HTTP ${registryJs.status}`);
        // 第七张落地页「专项附加扣除」（阶段15 15A-4）：
        // 与离职补偿金页同一套守护（可访问性 / 结构化数据 / 静态表对账 / 示例表 / CTA 归因），
        // 另加一条本页独有的口径断言 —— 「扣的是应纳税所得额，不是直接减税额」：
        // 页面若照抄「扣除额 × 税率」的天真算法，这句断言就红。
        const specialPage = await request(PORT, 'GET', '/seo/special-deduction.html');
        record('专项附加扣除落地页可访问且含 canonical/FAQPage 结构化数据与政策依据',
            specialPage.status === 200 && specialPage.raw.includes('rel="canonical"')
            && specialPage.raw.includes('FAQPage')
            && specialPage.raw.includes('国发〔2018〕41 号')
            && specialPage.raw.includes('国发〔2023〕13 号'),
            `HTTP ${specialPage.status}`);
        const specialAnnualBlock = (specialPage.raw.split('id="annual-rate-table"')[1] || '').split('</table>')[0];
        const specialAnnualRows = Array.from(specialAnnualBlock.matchAll(/<td>([^<]+)<\/td><td class="num">([\d.]+)%<\/td><td class="num">([\d,]+)<\/td>/g))
            .map((m) => ({ pct: Number(m[2]), deduction: Number(m[3].replace(/,/g, '')) }));
        const staleSpecialRows = specialAnnualRows.filter((r) => !constantsJs.raw.match(
            new RegExp(`rate:\\s*${(r.pct / 100).toFixed(2)}\\s*,\\s*deduction:\\s*${r.deduction}`)
        ));
        record('专项附加扣除落地页静态年度税率表与常量文件逐档一致（页面不维护第二份口径）',
            specialPage.status === 200 && specialAnnualRows.length === 7 && staleSpecialRows.length === 0
            && specialPage.raw.includes('/src/js/calculation/tax-constants.js')
            && specialPage.raw.includes('/src/js/calculation/tax-registry.js')
            && specialPage.raw.includes('/src/js/calculation/special-deduction-quick.js'),
            `页面 ${specialAnnualRows.length} 档, 与常量不一致 ${staleSpecialRows.length} 档`);
        record('专项附加扣除落地页静态示例表与对照表可读（36000/5480/1880/3600、72200/43080/28640/14440、12000/400）',
            specialPage.status === 200 && specialPage.raw.includes('>36000.00<')
            && specialPage.raw.includes('>5480.00<') && specialPage.raw.includes('>1880.00<')
            && specialPage.raw.includes('>3600.00<') && specialPage.raw.includes('>72200.00<')
            && specialPage.raw.includes('>43080.00<') && specialPage.raw.includes('>14440.00<')
            && specialPage.raw.includes('>12000.00<') && specialPage.raw.includes('>400.00<'), '');
        record('专项附加扣除落地页 CTA 带 SEO 归因参数（线索来源可回流）',
            specialPage.status === 200 && specialPage.raw.includes('?source=seo_special'), '');
        record('税种注册表登记了专项附加扣除页：扣的是应纳税所得额而非直接减税 + 长期制度（无到期日）',
            registryJs.status === 200 && registryJs.raw.includes("id: 'special-deduction'")
            && registryJs.raw.includes("page: '/seo/special-deduction.html'")
            && registryJs.raw.includes('specialDeductionRules')
            && specialPage.raw.includes('扣的是「应纳税所得额」')
            && specialPage.raw.includes('两段计税相减'),
            `HTTP ${registryJs.status}`);
        const deadLocs = [];
        for (const loc of sitemapLocs) {
            let pathname = loc;
            try { pathname = new URL(loc).pathname; } catch { /* 非绝对 URL：直接按路径探测 */ }
            // eslint-disable-next-line no-await-in-loop
            const probe = await request(PORT, 'GET', pathname);
            if (probe.status !== 200) deadLocs.push(`${pathname}=${probe.status}`);
        }
        record('sitemap 内每条 URL 均可访问（防收录 404）',
            sitemapLocs.length > 0 && deadLocs.length === 0, deadLocs.join(', '));
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

    // ---- 3.5 阶段12 C1：税制参数（公开只读 + 版本化发布/回滚 + 非法值拦截）----
    // 说明：发布用「出厂基线原样」回填，功能上不改变任何计税结果；随后回滚到该版本，
    //       因此本小节即使写库也保持生效配置 = 基线（零副作用）。
    console.log('\n[3/6 续·税制] 税制参数端点（阶段12 C1：公开只读 + 版本化发布/回滚）...');
    const trStamp = Date.now();
    const trAdminH = { 'X-Admin-Token': process.env.ADMIN_TOKEN || 'local-verify-admin-token' };
    let trPublishedId = null;
    let trPublishedVersion = null;
    try {
        const tr = await request(PORT, 'GET', '/api/config/tax-rates');
        const trData = (tr.body && tr.body.data) || {};
        const trRates = trData.rates || {};
        const comp = Array.isArray(trRates.comprehensiveTaxRates) ? trRates.comprehensiveTaxRates : [];
        const lastComp = comp[comp.length - 1] || {};
        const trWellFormed = comp.length > 0
            && Array.isArray(trRates.bonusMonthlyTaxRates) && trRates.bonusMonthlyTaxRates.length > 0
            && Array.isArray(trRates.businessTaxRates) && trRates.businessTaxRates.length > 0
            && !!trRates.classificationTaxRates && typeof trRates.classificationTaxRates === 'object'
            && typeof trRates.MIN_SOCIAL_SECURITY_BASE === 'number'
            && typeof trRates.MIN_HOUSING_FUND_BASE === 'number'
            && !!trData.revision;
        record('GET /config/tax-rates 公开税率配置（结构完整 + source 合法）',
            tr.status === 200 && trWellFormed && ['custom', 'default'].includes(trData.source),
            `HTTP ${tr.status}, source=${trData.source}, version=${trData.version}, revision=${trData.revision}`);
        // 末级无上限必须以 null 传输：端上还原为 Infinity 才能匹配最高档（JSON 无法表达 Infinity）
        record('税率表末级无上限以 null 传输（端上还原为 Infinity）',
            lastComp.max === null && lastComp.rate > 0,
            `末级 max=${JSON.stringify(lastComp.max)}, rate=${lastComp.rate}`);

        const trSame = await request(PORT, 'GET', '/api/config/tax-rates?since=' + encodeURIComponent(trData.revision || ''));
        const trSameData = (trSame.body && trSame.body.data) || {};
        record('since=当前指纹 → unchanged 且 rates=null（增量语义）',
            trSame.status === 200 && trSameData.unchanged === true && trSameData.rates === null,
            `HTTP ${trSame.status}, unchanged=${trSameData.unchanged}`);

        // 管理端点：无令牌必须被拒（税率填错会波及全站计税）
        const trNoTok = await request(PORT, 'GET', '/api/admin/tax-rates');
        record('GET /admin/tax-rates 无令牌被拒(401)', trNoTok.status === 401, `HTTP ${trNoTok.status}`);

        const trList = await request(PORT, 'GET', '/api/admin/tax-rates', { headers: trAdminH });
        const trListData = (trList.body && trList.body.data) || {};
        record('GET /admin/tax-rates 当前配置 + 出厂基线 + 历史',
            trList.status === 200 && !!trListData.defaults && Array.isArray(trListData.history),
            `HTTP ${trList.status}, hasCustom=${!!trListData.current}, history=${(trListData.history || []).length}`);

        // 非法配置必须 400 + details（防误填把全站税率改坏）
        const trBad = await request(PORT, 'POST', '/api/admin/tax-rates', {
            headers: trAdminH,
            json: { version: `verify-bad-${trStamp}`, rates: { comprehensiveTaxRates: [{ min: 0, max: 100, rate: 9, deduction: 0 }] } },
        });
        const trBadDetails = (trBad.body && trBad.body.error && trBad.body.error.details) || null;
        record('POST /admin/tax-rates 非法税率被拒(400 + details)',
            trBad.status === 400 && Array.isArray(trBadDetails) && trBadDetails.length > 0,
            `HTTP ${trBad.status}, details=${Array.isArray(trBadDetails) ? trBadDetails.length : 0}`);

        // 用出厂基线原样发布：验证写路径 + 版本化，且计税结果不变
        if (trListData.defaults) {
            const trPub = await request(PORT, 'POST', '/api/admin/tax-rates', {
                headers: trAdminH,
                json: { version: `verify.${trStamp}`, note: `[verify] e2e tax-rate publish ${trStamp}`, rates: trListData.defaults },
            });
            const trPubData = (trPub.body && trPub.body.data) || {};
            const trPubCfg = trPubData.config || {};
            trPublishedId = trPubCfg.id || null;
            trPublishedVersion = trPubCfg.version || null;
            record('POST /admin/tax-rates 发布基线版本(201；未勾选公告则 release=null)',
                trPub.status === 201 && !!trPubCfg.version && trPubData.release === null,
                `HTTP ${trPub.status}, version=${trPubCfg.version || 'N/A'}`);

            const trAfter = await request(PORT, 'GET', '/api/config/tax-rates');
            const trAfterData = (trAfter.body && trAfter.body.data) || {};
            record('发布后公开端点 source=custom（热改已生效）',
                trAfter.status === 200 && trAfterData.source === 'custom',
                `HTTP ${trAfter.status}, source=${trAfterData.source}`);
        }

        // 回滚：以刚发布版本为蓝本另存新版本（历史保留、可再次回滚；仍为基线等价配置）
        if (trPublishedId) {
            const trRoll = await request(PORT, 'POST', '/api/admin/tax-rates/rollback', {
                headers: trAdminH,
                json: { id: trPublishedId, version: `verify-rb.${trStamp}`, note: `[verify] e2e rollback ${trStamp}` },
            });
            const trRollCfg = (trRoll.body && trRoll.body.data && trRoll.body.data.config) || {};
            record('POST /admin/tax-rates/rollback 回滚另存新版本(201，from=源版本)',
                trRoll.status === 201 && !!trRollCfg.version && trRollCfg.from === trPublishedVersion,
                `HTTP ${trRoll.status}, from=${trRollCfg.from || 'N/A'} → ${trRollCfg.version || 'N/A'}`);
        }
    } catch (e) {
        record('税制参数端点（阶段12 C1）', false, e.message);
    }

    // ---- 3.5C 阶段14 C2：城市社保参数库（公开只读 + 版本化发布/回滚 + 兜底城市不变量）----
    // 说明：与 C1 同样用「出厂基线原样」发布（生效口径不变），并在收尾删除本轮版本、
    //       把发布前那条 published 记录恢复为生效（可重复执行，零残留）。
    console.log('\n[3/6 续·社保] 城市社保参数库端点（阶段14 C2：公开只读 + 版本化发布/回滚）...');
    const csStamp = Date.now();
    const csAdminH = { 'X-Admin-Token': process.env.ADMIN_TOKEN || 'local-verify-admin-token' };
    let csPublishedId = null;
    let csPublishedVersion = null;
    let csPrevPublishedId = null;
    try {
        const csPrev = await prisma.citySocialConfig.findFirst({
            where: { status: 'published' }, orderBy: [{ published_at: 'desc' }, { id: 'desc' }],
        });
        csPrevPublishedId = csPrev ? csPrev.id : null;

        const cs = await request(PORT, 'GET', '/api/config/city-social');
        const csData = (cs.body && cs.body.data) || {};
        const csCfg = csData.config || {};
        const csCities = Array.isArray(csCfg.cities) ? csCfg.cities : [];
        const csFallback = csCities.find((c) => c.code === 'national');
        const csWellFormed = csCities.length > 0 && !!csFallback
            && typeof csFallback.socialBaseMin === 'number' && typeof csFallback.housingBaseMin === 'number'
            && Array.isArray(csFallback.housingFundRateOptions) && csFallback.housingFundRateOptions.length > 0
            && typeof csCfg.defaultCity === 'string' && !!csData.revision;
        record('GET /config/city-social 公开城市社保参数（无需登录 + 结构完整 + 含兜底城市）',
            cs.status === 200 && csWellFormed && ['custom', 'default'].includes(csData.source),
            `HTTP ${cs.status}, source=${csData.source}, cities=${csCities.length}, revision=${csData.revision}`);

        const csSame = await request(PORT, 'GET', '/api/config/city-social?since=' + encodeURIComponent(csData.revision || ''));
        const csSameData = (csSame.body && csSame.body.data) || {};
        record('since=当前指纹 → unchanged 且 config=null（增量语义）',
            csSame.status === 200 && csSameData.unchanged === true && csSameData.config === null,
            `HTTP ${csSame.status}, unchanged=${csSameData.unchanged}`);

        // 管理端点：无令牌必须被拒（基数下限填错会误导全站用户的合规判断）
        const csNoTok = await request(PORT, 'GET', '/api/admin/city-social');
        record('GET /admin/city-social 无令牌被拒(401)', csNoTok.status === 401, `HTTP ${csNoTok.status}`);

        const csList = await request(PORT, 'GET', '/api/admin/city-social', { headers: csAdminH });
        const csListData = (csList.body && csList.body.data) || {};
        record('GET /admin/city-social 当前配置 + 出厂基线 + 历史',
            csList.status === 200 && !!csListData.defaults && Array.isArray(csListData.history),
            `HTTP ${csList.status}, hasCustom=${!!csListData.current}, history=${(csListData.history || []).length}`);

        // 兜底城市不变量：删掉 national 必须被拒（否则用户未选城市时无回落口径）
        if (csListData.defaults) {
            const noNational = JSON.parse(JSON.stringify(csListData.defaults));
            noNational.cities = noNational.cities.filter((c) => c.code !== 'national');
            const csBad = await request(PORT, 'POST', '/api/admin/city-social', {
                headers: csAdminH,
                json: { version: `verify-bad-${csStamp}`, config: noNational },
            });
            const csBadDetails = (csBad.body && csBad.body.error && csBad.body.error.details) || null;
            record('POST /admin/city-social 删除兜底城市 national 被拒(400 + details)',
                csBad.status === 400 && Array.isArray(csBadDetails) && csBadDetails.length > 0,
                `HTTP ${csBad.status}, details=${Array.isArray(csBadDetails) ? csBadDetails.length : 0}`);

            // 上限低于下限必须被拒（否则「基数超标」判定会全线颠倒）
            const inverted = JSON.parse(JSON.stringify(csListData.defaults));
            inverted.cities[0].socialBaseMin = 9000;
            inverted.cities[0].socialBaseMax = 8000;
            const csInv = await request(PORT, 'POST', '/api/admin/city-social', {
                headers: csAdminH, json: { version: `verify-inv-${csStamp}`, config: inverted },
            });
            record('POST /admin/city-social 上限低于下限被拒(400)', csInv.status === 400, `HTTP ${csInv.status}`);

            // 用出厂基线原样发布：验证写路径 + 版本化，且生效口径不变
            const csPub = await request(PORT, 'POST', '/api/admin/city-social', {
                headers: csAdminH,
                json: { version: `verify.${csStamp}`, note: `[verify] e2e city-social publish ${csStamp}`, config: csListData.defaults },
            });
            const csPubData = (csPub.body && csPub.body.data) || {};
            const csPubCfg = csPubData.config || {};
            csPublishedId = csPubCfg.id || null;
            csPublishedVersion = csPubCfg.version || null;
            record('POST /admin/city-social 发布基线版本(201；未勾选公告则 release=null)',
                csPub.status === 201 && !!csPubCfg.version && csPubData.release === null,
                `HTTP ${csPub.status}, version=${csPubCfg.version || 'N/A'}`);

            const csAfter = await request(PORT, 'GET', '/api/config/city-social');
            const csAfterData = (csAfter.body && csAfter.body.data) || {};
            // 注意：指纹是「按内容寻址」（md5(config)），原样重发基线内容时指纹不变是正确行为；
            //       这里只断言「库中自定义配置已生效」，指纹变化的语义由下一条单独验证
            record('发布后公开端点 source=custom（热改已生效）',
                csAfter.status === 200 && csAfterData.source === 'custom' && !!csAfterData.revision
                && csAfterData.version === csPublishedVersion,
                `HTTP ${csAfter.status}, source=${csAfterData.source}, version=${csAfterData.version}`);

            // 内容变化必须带动指纹变化 —— 端上 syncNow 靠指纹判断「要不要覆盖本地配置」，
            // 指纹若不随内容变化，管理台改了基数用户端将永远收不到更新（静默失效）。
            // 这里用「改城市备注」制造一次内容不同但生效口径完全等价的发布：
            // note 仅是管理台可见的口径来源备注，不参与任何基数/比例计算与端上校验。
            const reordered = JSON.parse(JSON.stringify(csListData.defaults));
            reordered.cities[0].note = `[verify] fingerprint check ${csStamp}`;
            const csRev = await request(PORT, 'POST', '/api/admin/city-social', {
                headers: csAdminH,
                json: { version: `verify-rev.${csStamp}`, note: `[verify] fingerprint ${csStamp}`, config: reordered },
            });
            const csRevAfter = await request(PORT, 'GET', '/api/config/city-social');
            const csRevAfterData = (csRevAfter.body && csRevAfter.body.data) || {};
            record('城市顺序变化 → 公开端点指纹随之变化（端上增量同步不会静默失效）',
                csRev.status === 201 && csRevAfter.status === 200
                && !!csRevAfterData.revision && csRevAfterData.revision !== csAfterData.revision,
                `HTTP ${csRev.status}, ${csAfterData.revision} → ${csRevAfterData.revision}`);

            // 版本号唯一：重复发布必须被拒，否则会静默覆盖历史版本（回滚目标丢失）
            const csDupVer = await request(PORT, 'POST', '/api/admin/city-social', {
                headers: csAdminH,
                json: { version: `verify.${csStamp}`, config: csListData.defaults },
            });
            record('POST /admin/city-social 版本号重复被拒(400，防覆盖历史)', csDupVer.status === 400, `HTTP ${csDupVer.status}`);
        }

        // 回滚：以刚发布版本为蓝本另存新版本（历史保留、可再次回滚；仍为基线等价配置）
        if (csPublishedId) {
            const csRoll = await request(PORT, 'POST', '/api/admin/city-social/rollback', {
                headers: csAdminH,
                json: { id: csPublishedId, version: `verify-rb.${csStamp}`, note: `[verify] e2e rollback ${csStamp}` },
            });
            const csRollCfg = (csRoll.body && csRoll.body.data && csRoll.body.data.config) || {};
            record('POST /admin/city-social/rollback 回滚另存新版本(201，from=源版本)',
                csRoll.status === 201 && !!csRollCfg.version && csRollCfg.from === csPublishedVersion,
                `HTTP ${csRoll.status}, from=${csRollCfg.from || 'N/A'} → ${csRollCfg.version || 'N/A'}`);
        }
    } catch (e) {
        record('城市社保参数端点（阶段14 C2）', false, e.message);
    } finally {
        // 清理：删除本轮版本；若发布前存在生效版本，则把它恢复为 published（可重复执行零残留）
        try {
            await prisma.citySocialConfig.deleteMany({
                where: {
                    version: {
                        in: [`verify.${csStamp}`, `verify-rb.${csStamp}`, `verify-rev.${csStamp}`,
                            `verify-bad-${csStamp}`, `verify-inv-${csStamp}`],
                    },
                },
            });
            if (csPrevPublishedId) {
                await prisma.citySocialConfig.update({ where: { id: csPrevPublishedId }, data: { status: 'published' } });
            }
        } catch { /* 清理失败不阻塞判定 */ }
    }

    // ---- 3.6 阶段13：转化线索（公开留资 + 管理端跟进 + CSV 导出 + 限流）----
    // 说明：留资是「工具 → 服务」的唯一入口，断链等于获客归零。
    //       本小节走完「游客提交 → 同号幂等合并 → 参数校验 → 管理端跟进 → 搜索/统计 → CSV 导出 → 限流」全链路，
    //       收尾按手机号前缀清理，不残留测试数据。
    console.log('\n[3/6 续·线索] 转化线索端点（阶段13：公开留资 + 管理端跟进）...');
    const leadStamp = Date.now();
    // 11 位手机号（'139'+7位 = 10 位前缀 + 1 位序号）；限流压测换 '137' 前缀，避免与前缀冲突
    const leadPhonePrefix = '139' + String(leadStamp).slice(-7);
    const burstPhonePrefix = '137' + String(leadStamp).slice(-6);
    const leadPhone = (n) => leadPhonePrefix + String(n);
    const leadAdminH = { 'X-Admin-Token': process.env.ADMIN_TOKEN || 'local-verify-admin-token' };
    let verifyLeadId = null;
    try {
        // 13.1 游客留资（无 JWT）必须成功 —— 绝大多数用户不会注册
        const guestLead = await request(PORT, 'POST', '/api/leads', {
            json: {
                name: '验证用户', phone: leadPhone(1), company: '验证个体户', province: '江苏', city: '苏州市',
                entityType: 'sole', need: 'settlement', source: 'result_business',
                scene: '经营所得·汇算清缴', note: `[verify] e2e lead ${leadStamp}`, consent: true,
            },
        });
        verifyLeadId = (guestLead.body && guestLead.body.data && guestLead.body.data.id) || null;
        record('POST /leads 游客留资成功(无需登录，201)',
            guestLead.status === 201 && !!verifyLeadId && guestLead.body.data.merged === false,
            `HTTP ${guestLead.status}, id=${verifyLeadId || 'N/A'}`);

        // 13.2 同手机号 24h 内重复提交 → 幂等合并（不新建、不暴露"该号已提交"）
        const dupLead = await request(PORT, 'POST', '/api/leads', {
            json: { name: '验证用户', phone: leadPhone(1), source: 'share', note: `[verify] dup ${leadStamp}`, consent: true },
        });
        const dupId = (dupLead.body && dupLead.body.data && dupLead.body.data.id) || null;
        const dupCount = await prisma.lead.count({ where: { phone: leadPhone(1) } });
        record('POST /leads 同号 24h 幂等合并(200 且库中仅 1 条)',
            dupLead.status === 200 && dupId === verifyLeadId && dupCount === 1,
            `HTTP ${dupLead.status}, id=${dupId}, count=${dupCount}`);

        // 13.3 参数校验：缺 name / 无联系方式 / 手机号非法 / 未同意隐私 → 全部 400
        const badName = await request(PORT, 'POST', '/api/leads', { json: { phone: leadPhone(2), consent: true } });
        record('POST /leads 缺 name 被拒(400)', badName.status === 400, `HTTP ${badName.status}`);

        const noContact = await request(PORT, 'POST', '/api/leads', { json: { name: '无联系方式', consent: true } });
        record('POST /leads 无手机号且无微信被拒(400)', noContact.status === 400, `HTTP ${noContact.status}`);

        const badPhone = await request(PORT, 'POST', '/api/leads', { json: { name: '号错', phone: '1280013800', consent: true } });
        record('POST /leads 手机号非法被拒(400)', badPhone.status === 400, `HTTP ${badPhone.status}`);

        const noConsent = await request(PORT, 'POST', '/api/leads', { json: { name: '未同意', phone: leadPhone(3) } });
        record('POST /leads 未勾选隐私同意被拒(400)', noConsent.status === 400, `HTTP ${noConsent.status}`);

        // 13.4 管理端无令牌必须被拒（线索含手机号，裸奔等于客户名单泄漏）
        const leadNoTok = await request(PORT, 'GET', '/api/admin/leads');
        record('GET /admin/leads 无令牌被拒(401)', leadNoTok.status === 401, `HTTP ${leadNoTok.status}`);

        // 13.5 列表：能查到刚提交的线索，且情境快照/主体类型完整（顾问跟进靠它精准开场）
        const leadList = await request(PORT, 'GET', '/api/admin/leads?limit=200', { headers: leadAdminH });
        const leadData = (leadList.body && leadList.body.data) || {};
        const leadItems = Array.isArray(leadData.items) ? leadData.items : [];
        const mineLead = leadItems.find((x) => x.id === verifyLeadId);
        record('GET /admin/leads 列表含新线索(情境快照 + 主体类型 + 所在省市 + byStatus)',
            leadList.status === 200 && !!mineLead && mineLead.scene === '经营所得·汇算清缴'
            && mineLead.entity_type === 'sole' && mineLead.province === '江苏' && mineLead.city === '苏州市'
            && !!leadData.byStatus && typeof leadData.total === 'number',
            `HTTP ${leadList.status}, total=${leadData.total}`);

        // 13.6 关键词搜索：姓名/手机号/公司/城市四字段 OR 匹配
        const leadSearch = await request(PORT, 'GET', '/api/admin/leads?q=' + encodeURIComponent(leadPhone(1)), { headers: leadAdminH });
        const searchItems = (leadSearch.body && leadSearch.body.data && leadSearch.body.data.items) || [];
        record('GET /admin/leads 支持关键词搜索(手机号命中)',
            leadSearch.status === 200 && searchItems.some((x) => x.id === verifyLeadId),
            `HTTP ${leadSearch.status}, hits=${searchItems.length}`);

        // 13.6b 按城市搜索：顾问按「本地口径」分派线索靠它（如江浙沪私域），不搜城市只能人工翻页
        const citySearch = await request(PORT, 'GET', '/api/admin/leads?q=' + encodeURIComponent('苏州'), { headers: leadAdminH });
        const cityItems = (citySearch.body && citySearch.body.data && citySearch.body.data.items) || [];
        record('GET /admin/leads 支持按城市搜索命中',
            citySearch.status === 200 && cityItems.some((x) => x.id === verifyLeadId),
            `HTTP ${citySearch.status}, hits=${cityItems.length}`);

        // 13.6c 按省份搜索：省是分派的上一级收敛维度（先筛省再挑市），且重名地市只有省份能区分
        const provinceSearch = await request(PORT, 'GET', '/api/admin/leads?q=' + encodeURIComponent('江苏'), { headers: leadAdminH });
        const provinceItems = (provinceSearch.body && provinceSearch.body.data && provinceSearch.body.data.items) || [];
        record('GET /admin/leads 支持按省份搜索命中',
            provinceSearch.status === 200 && provinceItems.some((x) => x.id === verifyLeadId),
            `HTTP ${provinceSearch.status}, hits=${provinceItems.length}`);

        // 13.7 漏斗统计（北极星指标 lead_submit / calc_done 的分子）
        const leadStatsResp = await request(PORT, 'GET', '/api/admin/leads/stats', { headers: leadAdminH });
        const statsData = (leadStatsResp.body && leadStatsResp.body.data) || {};
        record('GET /admin/leads/stats 漏斗统计(状态计数 + 今日新增 + 来源分布)',
            leadStatsResp.status === 200 && typeof statsData.total === 'number' && statsData.total >= 1
            && !!statsData.byStatus && typeof statsData.byStatus.new === 'number'
            && typeof statsData.newToday === 'number' && !!statsData.bySource,
            `HTTP ${leadStatsResp.status}, total=${statsData.total}, newToday=${statsData.newToday}`);

        // 13.8 状态机跟进：new → contacted + 分配顾问；非法状态必须被拒
        if (verifyLeadId) {
            const leadPatch = await request(PORT, 'PATCH', `/api/admin/leads/${verifyLeadId}`, {
                json: { status: 'contacted', owner: '验证顾问' }, headers: leadAdminH,
            });
            const patched = (leadPatch.body && leadPatch.body.data) || {};
            record('PATCH /admin/leads/:id 状态机流转 + 分配顾问',
                leadPatch.status === 200 && patched.status === 'contacted' && patched.owner === '验证顾问',
                `HTTP ${leadPatch.status}, status=${patched.status}`);

            const leadBadPatch = await request(PORT, 'PATCH', `/api/admin/leads/${verifyLeadId}`, {
                json: { status: 'nope' }, headers: leadAdminH,
            });
            record('PATCH /admin/leads/:id 非法状态被拒(400)', leadBadPatch.status === 400, `HTTP ${leadBadPatch.status}`);
        }

        // 13.9 CSV 导出：UTF-8 BOM + 中文表头（Excel 不乱码，销售可导进自有 CRM）
        const leadCsv = await request(PORT, 'GET', '/api/admin/leads/export?q=' + encodeURIComponent(leadPhone(1)), { headers: leadAdminH });
        const csvHasBom = typeof leadCsv.raw === 'string' && leadCsv.raw.charCodeAt(0) === 0xFEFF;
        record('GET /admin/leads/export CSV(含 BOM + 中文表头 + 省份/城市列)',
            leadCsv.status === 200 && csvHasBom && leadCsv.raw.includes('手机号') && leadCsv.raw.includes('情境')
            && leadCsv.raw.includes('省份') && leadCsv.raw.includes('城市'),
            `HTTP ${leadCsv.status}, bom=${csvHasBom}`);

        // 13.10 限流：公开写入端点必须挡批量刷量（10 次/小时/IP）
        let sawLead429 = false;
        let unexpectedStatus = null;
        for (let i = 0; i < 12 && !sawLead429; i++) {
            const burst = await request(PORT, 'POST', '/api/leads', {
                json: { name: '压测', phone: burstPhonePrefix + String(i).padStart(2, '0'), consent: true },
            });
            if (burst.status === 429) sawLead429 = true;
            else if (burst.status !== 201) { unexpectedStatus = burst.status; break; }
        }
        record('POST /leads 限流生效(429 拦截刷量)',
            sawLead429, sawLead429 ? '已按 IP 上限拦截' : `未触发限流${unexpectedStatus ? `，意外状态 ${unexpectedStatus}` : ''}`);
    } catch (e) {
        record('转化线索端点（阶段13）', false, e.message);
    } finally {
        try {
            await prisma.lead.deleteMany({
                where: {
                    OR: [
                        { phone: { startsWith: leadPhonePrefix } },
                        { phone: { startsWith: burstPhonePrefix } },
                    ],
                },
            });
        } catch { /* 清理失败不阻塞判定 */ }
    }

    console.log('\n[4/6] 登录链路（dev 账号）...');
    let devToken = null;
    try {
        const login = await request(PORT, 'POST', '/api/auth/login', { json: { email: DEV_EMAIL, password: DEV_PASSWORD } });
        devToken = login.body && login.body.data && login.body.data.token;
        record('登录本地测试账号', login.status === 200 && !!devToken, `HTTP ${login.status}`);

        if (devToken) {
            const profile = await request(PORT, 'GET', '/api/auth/profile', { token: devToken });
            const me = (profile.body && profile.body.data) || {};
            // 身份用邮箱（账号标识）比对，而不是用户名：测试账号可能早已存在，
            // 用户名是用户自己设的昵称（可改），拿它比对会把「账号已存在」误判成链路故障
            record('GET /profile 身份校验', profile.status === 200 && me.email === DEV_EMAIL,
                `HTTP ${profile.status}, user=${me.username}`);
        }
    } catch (e) {
        record('登录本地测试账号（请求异常）', false, e.message);
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

            // ---- 8.5b 阶段13E 转化漏斗（visit → calc_done → share/save → lead_click → lead_submit）----
            // 匿名上报（不带任何 token）：这正是 13E 要修的核心口径 —— visit / calc_done
            // 大多发生在未登录状态，若要求登录，北极星分母只剩登录用户、转化率会系统性虚高。
            const fnAnon = await request(PORT, 'POST', '/api/stats/funnel', { json: { step: 'visit' } });
            record('POST /stats/funnel 匿名上报(visit) 被接受',
                fnAnon.status === 201 && !!fnAnon.body && fnAnon.body.success === true
                && !!fnAnon.body.data && fnAnon.body.data.step === 'visit',
                `HTTP ${fnAnon.status}`);

            // lead_submit 必须被拒：它的唯一真相是 Lead 表，前端再上报会让两个数对不上
            const fnBad = await request(PORT, 'POST', '/api/stats/funnel', { json: { step: 'lead_submit' } });
            record('POST /stats/funnel 拒绝白名单外步骤(lead_submit 只由 Lead 表统计)',
                fnBad.status === 400, `HTTP ${fnBad.status}`);

            const funnel = await request(PORT, 'GET', '/api/admin/leads/funnel?days=7', { headers: adminH });
            const fd = (funnel.body && funnel.body.data) || {};
            const fSteps = fd.steps || {};
            const fKeys = ['visit', 'calc_done', 'share', 'save', 'lead_click', 'lead_submit'];
            record('GET /admin/leads/funnel 转化漏斗(各步累计 + 今日 + 转化率 + 北极星)',
                funnel.status === 200
                && fKeys.every((k) => typeof fSteps[k] === 'number')
                && !!fd.today && !!fd.rates && 'northStar' in fd,
                `HTTP ${funnel.status}, visit=${fSteps.visit}, calc_done=${fSteps.calc_done}, lead_submit=${fSteps.lead_submit}`);

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

    // ---- 5B. 阶段14：专业版兑换码（线下收款授权的变现闭环）----
    // 变现链路里最容易「静默出错」的一段：生成 → 交付 → 自助兑换 → 对账导出。
    // 本小节把「一码一用 / 参数校验 / 作废留痕 / CSV BOM」跑在真实服务端上验证。
    console.log('\n[5/6 续·兑换码] 专业版兑换码端点（阶段14：生成 → 兑换 → 作废 → 导出）...');
    const proStamp = Date.now();
    const proBatch = `verify-${proStamp}`;
    try {
        if (!devToken) {
            record('阶段14 兑换码冒烟', false, '前置登录失败，跳过');
        } else {
            const proAdminH = { 'X-Admin-Token': adminToken };

            // 14.1 管理端无令牌必须被拒（兑换码=可直接交付的付费凭证，裸奔等于白送专业版）
            const pcNoTok = await request(PORT, 'GET', '/api/admin/pro-codes');
            record('GET /admin/pro-codes 无令牌被拒(401)', pcNoTok.status === 401, `HTTP ${pcNoTok.status}`);

            // 14.2 批量生成限时码（30 天 × 2），返回明文码供交付
            const gen = await request(PORT, 'POST', '/api/admin/pro-codes', {
                json: { count: 2, durationDays: 30, batch: proBatch, note: '[verify] 门禁' }, headers: proAdminH,
            });
            const genData = (gen.body && gen.body.data) || {};
            const genCodes = Array.isArray(genData.codes) ? genData.codes : [];
            record('POST /admin/pro-codes 生成限时码(201，返回明文码)',
                gen.status === 201 && genData.createdCount === 2 && genCodes.length === 2 && genData.durationDays === 30,
                `HTTP ${gen.status}, count=${genData.createdCount}`);

            // 14.3 参数非法必须被拒（count 非整数 —— 曾经 parseInt 静默截断导致少发码）
            const genBad = await request(PORT, 'POST', '/api/admin/pro-codes', {
                json: { count: 1.5, durationDays: 30 }, headers: proAdminH,
            });
            record('POST /admin/pro-codes count 非整数被拒(400，防少发码)', genBad.status === 400, `HTTP ${genBad.status}`);

            // 14.4 列表：按批次筛选命中，三类计数齐全
            const pcList = await request(PORT, 'GET', `/api/admin/pro-codes?batch=${encodeURIComponent(proBatch)}`, { headers: proAdminH });
            const pcData = (pcList.body && pcList.body.data) || {};
            const pcItems = Array.isArray(pcData.items) ? pcData.items : [];
            const target = pcItems.find((x) => x.code === genCodes[0]);
            record('GET /admin/pro-codes 批次筛选命中(状态/有效期/计数)',
                pcList.status === 200 && pcItems.length === 2 && !!target
                && target.status === 'available' && target.permanent === false
                && typeof pcData.availableCount === 'number',
                `HTTP ${pcList.status}, items=${pcItems.length}`);

            // 14.5 一码一用：先把 dev 账号降为 free 才能兑换（永久专业版会被拒且不消耗码）
            await prisma.user.update({ where: { email: DEV_EMAIL }, data: { plan: 'free', plan_expires_at: null, pro_granted_by: null } });
            const redeem = await request(PORT, 'POST', '/api/pro-codes/redeem', { json: { code: genCodes[0] }, token: devToken });
            const rd = (redeem.body && redeem.body.data) || {};
            const expMs = rd.plan_expires_at ? new Date(rd.plan_expires_at).getTime() - Date.now() : 0;
            record('POST /pro-codes/redeem 兑换成功(plan=pro / purchase / 约 30 天)',
                redeem.status === 200 && rd.plan === 'pro' && rd.pro_granted_by === 'purchase'
                && expMs > 29 * 86400000 && expMs < 31 * 86400000,
                `HTTP ${redeem.status}, plan=${rd.plan}, expires=${rd.plan_expires_at}`);

            // 14.6 同一个码再兑 → 409（一码一用，不收第二份钱不存在的重复权益）
            const redeemDup = await request(PORT, 'POST', '/api/pro-codes/redeem', { json: { code: genCodes[0] }, token: devToken });
            record('POST /pro-codes/redeem 同码再兑被拒(409)', redeemDup.status === 409, `HTTP ${redeemDup.status}`);

            // 14.7 已兑换的码不允许作废（保留收款凭证，退款走权益回收）
            const disableUsed = await request(PORT, 'PATCH', `/api/admin/pro-codes/${target.id}`, { json: { disabled: true }, headers: proAdminH });
            record('PATCH /admin/pro-codes/:id 已兑换码禁止作废(409)', disableUsed.status === 409, `HTTP ${disableUsed.status}`);

            // 14.8 未使用的码可作废，且作废后不可兑换（403）
            const avail = pcItems.find((x) => x.code === genCodes[1]);
            const disable = await request(PORT, 'PATCH', `/api/admin/pro-codes/${avail.id}`, { json: { disabled: true }, headers: proAdminH });
            record('PATCH /admin/pro-codes/:id 作废可用码',
                disable.status === 200 && disable.body && disable.body.data && disable.body.data.disabled === true,
                `HTTP ${disable.status}`);
            const redeemDisabled = await request(PORT, 'POST', '/api/pro-codes/redeem', { json: { code: genCodes[1] }, token: devToken });
            record('POST /pro-codes/redeem 作废码被拒(403)', redeemDisabled.status === 403, `HTTP ${redeemDisabled.status}`);

            // 14.9 不存在的码 → 403（与「已作废」同码，避免进一步区分泄漏枚举信息）
            const redeemMissing = await request(PORT, 'POST', '/api/pro-codes/redeem', { json: { code: 'PRO-ZZZZ-ZZZZ' }, token: devToken });
            record('POST /pro-codes/redeem 不存在的码被拒(403)', redeemMissing.status === 403, `HTTP ${redeemMissing.status}`);

            // 14.10 CSV 导出：UTF-8 BOM（Excel 不乱码）+ 表头含 used_by_name
            const pcCsv = await request(PORT, 'GET', `/api/admin/pro-codes/export?batch=${encodeURIComponent(proBatch)}`, { headers: proAdminH });
            const pcBom = typeof pcCsv.raw === 'string' && pcCsv.raw.charCodeAt(0) === 0xFEFF;
            record('GET /admin/pro-codes/export CSV(含 BOM + 表头)',
                pcCsv.status === 200 && pcBom && pcCsv.raw.includes('used_by_name') && pcCsv.raw.includes(genCodes[0]),
                `HTTP ${pcCsv.status}, bom=${pcBom}`);
        }
    } catch (e) {
        record('专业版兑换码端点（阶段14）', false, e.message);
    } finally {
        // 清理本批验证码 + 恢复 dev 账号种子 pro 授权（门禁不得残留权益/数据）
        try {
            await prisma.proCode.deleteMany({ where: { batch: proBatch } });
            await prisma.user.update({ where: { email: DEV_EMAIL }, data: { plan: 'pro', pro_granted_by: 'seed', plan_expires_at: null } });
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
    const total = results.length;
    const passed = total - failed.length;

    // 口径落盘：把「本次实跑项数」留给文档口径守护比对（tests/docs-metrics.test.js / npm run verify:release）。
    // 只写默认本地模式 —— PG 演练模式的断言路径不同，覆盖快照会污染口径来源。
    if (!PG_MODE) {
        try {
            fs.writeFileSync(
                path.join(__dirname, '..', '..', 'tools', 'ops', '.verify-local-last.json'),
                JSON.stringify({ total, passed, at: new Date().toISOString() }, null, 2) + '\n',
                'utf8'
            );
        } catch (e) {
            console.warn(`  [WARN] 门禁口径快照写入失败（不影响判定）: ${e.message}`);
        }
    }

    console.log('\n========================================================');
    console.log(`  结果: ${passed}/${total} 通过`);
    if (failed.length > 0) {
        console.log('  未通过项:');
        failed.forEach((r) => console.log(`    - ${r.name}${r.detail ? `（${r.detail}）` : ''}`));
        console.log('\n  ❌ 本地验证未通过 —— 请勿 push 到线上。');
        exitCode = 1;
    } else {
        console.log('  ✅ 本地验证全部通过 —— 可以安全部署（git push）。');
    }

    // 文档口径自检：文档里的门禁项数必须等于本次实跑项数。
    // 这里只提示不改退出码 —— 口径滞后由 npm test / verify:release 拦，
    // 门禁本身变红会掩盖真正的功能失败。
    try {
        const { checkMetrics } = require(path.join(__dirname, '..', '..', 'tools', 'ops', 'release-metrics.js'));
        const claims = checkMetrics().claims.gate;
        const declared = Array.from(new Set(claims.map((c) => c.value)));
        if (declared.length === 1 && declared[0] !== total) {
            console.warn(`  ⚠ 文档口径待同步: 文档写 ${declared[0]} 项，本次实跑 ${total} 项`);
            console.warn(`     需改: ${claims.filter((c) => c.value !== total).map((c) => `${c.file}:${c.line}`).join(' / ')}`);
        } else if (declared.length === 1) {
            console.log(`  口径自检: 文档声明 ${declared[0]} 项 ＝ 本次实跑 ${total} 项 ✅`);
        }
    } catch (e) {
        // 口径自检是加分项，读不到口径定义不该让门禁失败
        console.warn(`  [WARN] 文档口径自检跳过: ${e.message}`);
    }
    console.log('========================================================\n');
    process.exit(exitCode);
})().catch((e) => {
    console.error('\n[FAIL] verify-local-auth 异常退出:', e);
    process.exit(1);
});
