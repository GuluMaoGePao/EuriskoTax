#!/usr/bin/env node
/**
 * EuriskoTax 本地「登录链路」验证门禁 —— push 部署前必须在本地跑绿
 *
 * 用法（项目根目录）：
 *   npm run verify:local
 *
 * 它会把「本地完整应用」真的跑起来做端到端验证：
 *   1. 数据库准备（prisma generate:dev + db push 到 server/prisma/dev.db，幂等）
 *   2. 确保本地测试账号 dev@example.com / password 存在
 *   3. 随机空闲端口启动后端（node src/app.js，同源托管前端+API）
 *   4. HTTP 级 e2e：
 *      - 前端资源冒烟：/ 含登录表单、auth-ui.js 含 dev-login-fill 且无 quick-login、SW 为 v8
 *      - 登录本地测试账号 → 拿 JWT → GET /profile 校验
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

function logLine() {
    process.stdout.write(`  [${new Date().toISOString().slice(11, 19)}] `);
    console.log(...arguments);
}

// ====== 轻量 HTTP 客户端（只打 127.0.0.1） ======
function request(port, method, urlPath, { json, token, timeout = 10000 } = {}) {
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

    // ---- 1. 数据库准备：固定顺序 generate:dev → db push（SQLite 开发库，幂等） ----
    console.log('\n[1/5] 数据库准备（SQLite dev.db）...');
    // npm install 的 postinstall 会用生产 schema(PostgreSQL) 生成 Prisma Client，
    // 必须先按本地 SQLite schema 重新 generate，否则 PrismaClient 与 dev.db 引擎不匹配
    const gen = spawnSync('npx prisma generate --schema prisma/schema.dev.prisma',
        { cwd: serverDir, shell: true, encoding: 'utf8', timeout: 60000 });
    if (gen.status !== 0) {
        console.error('  [FAIL] prisma generate:dev 失败。请先 cd server && npm install');
        console.error((gen.stderr || '').slice(-1200));
        process.exit(1);
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
    console.log('\n[2/5] 启动本地后端...');
    const PORT = await getFreePort();
    const child = spawn(process.execPath, ['src/app.js'], {
        cwd: serverDir,
        env: { ...process.env, PORT: String(PORT), NODE_ENV: 'development' },
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
    console.log('\n[3/5] 前端资源冒烟...');
    try {
        const page = await request(PORT, 'GET', '/');
        record('GET / 返回登录表单', page.status === 200 && page.raw.includes('id="login-form"'), `HTTP ${page.status}`);
        const authJs = await request(PORT, 'GET', '/src/js/auth/auth-ui.js');
        record('auth-ui.js 含本地填充入口(dev-login-fill)', authJs.status === 200 && authJs.raw.includes('dev-login-fill'), `HTTP ${authJs.status}`);
        record('auth-ui.js 已无 quick-login 残留', authJs.status === 200 && !authJs.raw.includes('quick-login'), '');
        const sw = await request(PORT, 'GET', '/service-worker.js');
        record('service-worker.js 为 v8（网络优先）', sw.status === 200 && sw.raw.includes('euriskotax-v8'), `HTTP ${sw.status}`);
        record('service-worker.js 含 http/https 协议守卫', sw.status === 200 && sw.raw.includes("url.protocol !== 'http:'"), `HTTP ${sw.status}`);
    } catch (e) {
        record('前端资源冒烟', false, e.message);
    }

    console.log('\n[4/5] 登录链路（dev 账号）...');
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

    console.log('\n[5/5] 注册链路（邀请码 + 邮箱验证码 → 登录新号）...');
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
