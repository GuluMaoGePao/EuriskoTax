#!/usr/bin/env node
/**
 * EuriskoTax 本地「登录链路」验证门禁 —— push 部署前必须在本地跑绿
 *
 * 用法（项目根目录）：
 *   npm run verify:local
 *   VERIFY_SKIP_GENERATE=1 npm run verify:local   // :3000 后端运行中占用引擎 DLL 时的逃生门（schema 未变更）
 *
 * 它会把「本地完整应用」真的跑起来做端到端验证：
 *   1. 数据库准备（prisma generate:dev + db push 到 server/prisma/dev.db，幂等）
 *   2. 确保本地测试账号 dev@example.com / password 存在
 *   3. 随机空闲端口启动后端（node src/app.js，同源托管前端+API）
 *   4. HTTP 级 e2e：
 *      - 前端资源冒烟：/ 含登录表单、auth-ui.js 含 dev-login-fill 且无 quick-login、SW 为 v8
 *      - 登录本地测试账号 → 拿 JWT → GET /profile 校验（含种子授权 plan=pro）
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
                resolve({ status: res.statusCode, body: parsed, raw: data });
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
    if (!(process.env.DATABASE_URL || '').includes('dev.db')) {
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

    // ---- 1. 数据库准备：固定顺序 generate:dev → db push（SQLite 开发库，幂等） ----
    console.log('\n[1/6] 数据库准备（SQLite dev.db）...');
    // npm install 的 postinstall 会用生产 schema(PostgreSQL) 生成 Prisma Client，
    // 必须先按本地 SQLite schema 重新 generate，否则 PrismaClient 与 dev.db 引擎不匹配
    const skipGenerate = process.env.VERIFY_SKIP_GENERATE === '1';
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
    } catch (e) {
        record('前端资源冒烟', false, e.message);
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
            const verifyFeedbackId = fb.body && fb.body.data && fb.body.data.id || null;
            record('POST /feedback 反馈落库', fb.status === 201 && !!verifyFeedbackId, `HTTP ${fb.status}, id=${verifyFeedbackId || 'N/A'}`);

            // 8.3 当前用户反馈列表能查到该条
            const myList = await request(PORT, 'GET', '/api/feedback', { token: devToken });
            const mine = myList.body && myList.body.data || [];
            record('GET /feedback 用户列表', myList.status === 200 && mine.some((x) => x.id === verifyFeedbackId), `HTTP ${myList.status}`);

            // 8.4 管理员列表与状态跟进（X-Admin-Token）
            const adminH = { 'X-Admin-Token': adminToken };
            const adminList = await request(PORT, 'GET', '/api/feedback/admin?status=open', { headers: adminH });
            const adminItems = adminList.body && adminList.body.data || [];
            record('GET /feedback/admin 管理员列表', adminList.status === 200 && adminItems.some((x) => x.id === verifyFeedbackId), `HTTP ${adminList.status}`);

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
