#!/usr/bin/env node
/**
 * beta（预发）真机冒烟：登录 → 档案 → 算一笔 → 云端同步 → 内容 → 留资
 *
 * 为什么需要它：beta 的 37 项指纹核对**不登录、不写数据**，它能证明「页面出得来、接口通」，
 * 但证明不了「登录之后的关键链路还活着」。后者此前只能靠人真机手点 —— 而手点的代价是
 * 每次发版都要重复一遍，忙起来就跳过了（跳过也不会有谁报错）。这个脚本把那 5 步固定下来，
 * 一条命令跑完，且**跑的是真实 HTTP + 真实数据库**，不是 jsdom 模拟。
 *
 * 用法：
 *   npm run smoke:beta
 *   node tools/ops/beta-smoke.js --base-url https://beta.euriskotax.com \
 *        --email beta-tester@euriskotax.com --password <口令>
 *
 * 凭据优先从命令行取，其次环境变量 BETA_TEST_EMAIL / BETA_TEST_PASSWORD；
 * Basic Auth（beta 站的锁）从 BETA_AUTH_USER / BETA_AUTH_PASS 取。
 * **口令不会出现在输出里**（报告只显示邮箱）。
 *
 * 两道护栏：
 *   1. 默认拒绝打正式站 —— 留资会写真线索表，把测试数据写进生产是不可逆的脏数据；
 *      确有必要必须显式 --allow-prod（且留资步骤仍会跳过，见下）。
 *   2. 留资步骤遇 429（限流 10 次/小时/IP）判为**跳过**而不是失败：限流是环境在保护自己，
 *      不是链路坏了；反复跑冒烟必然撞上，报红会让人误以为出事了。
 */
const crypto = require('crypto');

const DEFAULT_BASE = process.env.BETA_BASE_URL || 'https://beta.euriskotax.com';
// 正式站域名：冒烟会写数据（留资写真线索表、同步写计算记录），默认不许打
const PROD_HOSTS = new Set(['euriskotax.com', 'www.euriskotax.com']);

// ======================= 纯逻辑（可测试，不联网） =======================

function hostOf(baseUrl) {
    try {
        return new URL(baseUrl).hostname.toLowerCase();
    } catch (e) {
        return String(baseUrl || '').toLowerCase();
    }
}

// 护栏：是不是正式站（beta.euriskotax.com 不在白名单里，所以默认放行）
function isProdHost(baseUrl) {
    return PROD_HOSTS.has(hostOf(baseUrl));
}

// 公网 beta 的死结：网关（Caddy）要 Basic Auth、应用要 Bearer，而 **HTTP 只有一个
// Authorization 头** —— 后写的覆盖先写的，二者不可共存。表现是「登录成功、之后每一步
// 都 401」，很容易误判成 token 失效或账号没权限。
// 核对脚本不受影响：它只取页面/静态资源，不需要登录态，所以带 Basic 就够。
// 发现这种组合要**在登录之前**就停 —— /api/auth/* 限流 10 次/15 分钟/IP，白跑一次就少一次。
function hasAuthConflict(baseUrl, auth) {
    const h = hostOf(baseUrl);
    const isLocal = h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
    return Boolean(auth && auth.user && auth.pass) && !isLocal;
}

const AUTH_CONFLICT_HINT = [
    '❌ 无法执行：这个地址既要 Basic Auth（网关 Caddy）又要 Bearer（应用登录态），',
    '   而 HTTP 只有一个 Authorization 头 —— 后写的会覆盖先写的，二者不可共存。',
    '   （核对脚本不受影响：它只取页面，不需要登录态，带 Basic 就够。）',
    '',
    '   解法：用 SSH 隧道绕过网关，隧道里不需要 Basic Auth：',
    '     ssh -i <key> -L 3001:127.0.0.1:3001 -N ubuntu@101.42.89.184',
    '     node tools/ops/beta-smoke.js --base-url http://127.0.0.1:3001 --email <邮箱> --password <口令>',
].join('\n');

// 失败分类：限流 ≠ 链路坏，鉴权失败 ≠ 服务挂
// 返回 'ok' | 'ratelimit' | 'auth' | 'fail'
function classifyStatus(status) {
    if (status === 429) return 'ratelimit';
    if (status === 401 || status === 403) return 'auth';
    if (status >= 200 && status < 300) return 'ok';
    return 'fail';
}

function makeClientId() {
    return `beta-smoke-${crypto.randomUUID()}`;
}

// 一条「算过一笔」的云端记录：type 必须在白名单内，clientId 是幂等键
function syncPushPayload(clientId, { deleted = false } = {}) {
    const now = new Date().toISOString();
    const item = { clientId, type: 'comprehensive', updatedAt: now };
    if (deleted) {
        item.deletedAt = now;      // 墓碑：跑完就删，不把测试数据留在预发库里
    } else {
        item.data = {
            title: 'beta 冒烟（自动，跑完即删）',
            date: now,
            results: { note: 'tools/ops/beta-smoke.js' },
        };
    }
    return { push: [item] };
}

// 留资：phone 需匹配 1[3-9]\d{9}；consent 必须严格 true
function leadPayload(tag) {
    return {
        name: 'beta冒烟',
        phone: '13800138000',
        consent: true,
        source: 'unknown',
        scene: 'beta-smoke',
        note: `[${tag}] 自动化冒烟写入，可忽略`,
    };
}

function buildReport(steps, meta) {
    const lines = [];
    lines.push('| # | 步骤 | 结果 | 说明 |');
    lines.push('|---|---|---|---|');
    steps.forEach((s, i) => {
        lines.push(`| ${i + 1} | ${s.name} | ${s.icon} | ${s.detail} |`);
    });
    const failed = steps.filter((s) => s.icon === '❌');
    const skipped = steps.filter((s) => s.icon === '⏭️');
    lines.push('');
    lines.push(failed.length
        ? `**结论**：❌ ${failed.length} 步失败（${failed.map((s) => s.name).join('、')}）—— 不要发正式`
        : `**结论**：✅ ${steps.length - skipped.length} 步通过${skipped.length ? `，${skipped.length} 步跳过（${skipped.map((s) => s.name).join('、')}）` : ''}`);
    lines.push('');
    lines.push(`- 目标：\`${meta.baseUrl}\``);
    lines.push(`- 账号：\`${meta.email}\`（口令不回显）`);
    if (meta.prodGuard) lines.push('- ⚠️ 已用 `--allow-prod`：留资步骤已强制跳过，正式站不写测试数据');
    return lines.join('\n');
}

// ======================= 联网执行 =======================

async function call(baseUrl, pathname, { method = 'GET', body, token, auth } = {}) {
    const headers = { Accept: 'application/json' };
    if (body) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    if (auth && auth.user && auth.pass) {
        headers.Authorization = `Basic ${Buffer.from(`${auth.user}:${auth.pass}`).toString('base64')}`;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
        const res = await fetch(`${baseUrl.replace(/\/$/, '')}${pathname}`, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
            signal: ctrl.signal,
        });
        let json = null;
        try { json = await res.json(); } catch (e) { /* 非 JSON：交给状态码判定 */ }
        return { status: res.status, json };
    } catch (e) {
        return { status: 0, json: null, error: e.message };
    } finally {
        clearTimeout(timer);
    }
}

async function run({ baseUrl, email, password, auth, allowProd = false }) {
    const steps = [];
    const push = (name, icon, detail) => steps.push({ name, icon, detail });
    const prod = isProdHost(baseUrl);

    if (hasAuthConflict(baseUrl, auth)) {
        return { steps: [], report: AUTH_CONFLICT_HINT, exitCode: 1 };
    }

    if (prod && !allowProd) {
        return {
            steps: [],
            report: [
                `❌ 拒绝执行：\`${baseUrl}\` 看起来是正式站。`,
                '',
                '冒烟会写数据（留资写真线索表、同步写计算记录），把测试数据写进生产是不可逆的。',
                '要打预发就用默认地址；确有必要打正式站，显式加 `--allow-prod`（留资仍会跳过）。',
            ].join('\n'),
            exitCode: 1,
        };
    }

    // 1. 登录
    const login = await call(baseUrl, '/api/auth/login', {
        method: 'POST', body: { email, password }, auth,
    });
    const token = login.json && login.json.data && login.json.data.token;
    if (classifyStatus(login.status) !== 'ok' || !token) {
        const kind = classifyStatus(login.status);
        push('登录', '❌', `HTTP ${login.status}${login.error ? `（${login.error}）` : ''}`
            + (kind === 'ratelimit' ? ' —— /api/auth/* 限流 10 次/15 分钟/IP，稍后再试' : '')
            + (kind === 'auth' ? ' —— 账号或口令不对；beta 是独立库，正式站账号登不进来（见 beta-ensure-test-user.sh）' : ''));
        return { steps, report: buildReport(steps, { baseUrl, email, prodGuard: prod }), exitCode: 1 };
    }
    push('登录', '✅', `HTTP ${login.status}，拿到 token（${token.length} 字符）`);

    // 2. 档案（顺带确认权益档位：同步端点要求 plan=pro）
    const profile = await call(baseUrl, '/api/auth/profile', { token });
    const me = (profile.json && profile.json.data) || {};
    push('档案 /api/auth/profile',
        classifyStatus(profile.status) === 'ok' && me.email === email ? '✅' : '❌',
        `HTTP ${profile.status}，plan=${me.plan || '未知'}`);

    // 3. 算税引擎（后端镜像：无鉴权、不入库，只能证明引擎活着 —— 真正的留痕在下一步）
    const calc = await call(baseUrl, '/api/calculations/comprehensive', {
        method: 'POST',
        body: {
            workMonths: 12,
            salaryIncome: 30000,
            bonusIncome: 0,
            bonusInclude: false,
            specialDeduction: { pensionInsurance: 0, medicalInsurance: 0, unemploymentInsurance: 0, housingFund: 0 },
            specialAdditional: { elderly: 0, childrenInfant: 0, housing: 0, education: 0, medical: 0, professional: 0 },
            otherDeduction: { pension: 0, enterpriseAnnuity: 0, insuranceOther: 0, taxDeferredPension: 0, charitableDonation: 0 },
        },
    });
    const calcData = calc.json && calc.json.data;
    push('算一笔 /api/calculations/comprehensive',
        classifyStatus(calc.status) === 'ok' && calcData && typeof calcData === 'object' ? '✅' : '❌',
        `HTTP ${calc.status}，返回${calcData ? '结果对象' : '无 data'}`);

    // 4. 云端同步：上传 → 拉回 → 墓碑删除（不把测试数据留在预发库）
    const clientId = makeClientId();
    const up = await call(baseUrl, '/api/calculations/sync', {
        method: 'POST', body: syncPushPayload(clientId), token,
    });
    const upOk = classifyStatus(up.status) === 'ok';
    push('云端同步 /api/calculations/sync（上传）', upOk ? '✅' : '❌',
        `HTTP ${up.status}` + (up.status === 403 ? ' —— PRO_REQUIRED：账号需 plan=pro' : ''));

    if (upOk) {
        const down = await call(baseUrl, '/api/calculations/sync', {
            method: 'POST', body: { push: [] }, token,
        });
        const records = (down.json && down.json.data && down.json.data.records) || [];
        const found = records.some((r) => r.clientId === clientId);
        push('云端同步（拉回并核对同一条）', found ? '✅' : '❌',
            `HTTP ${down.status}，云端 ${records.length} 条，含本次记录=${found}`);
        // 墓碑清理
        await call(baseUrl, '/api/calculations/sync', {
            method: 'POST', body: syncPushPayload(clientId, { deleted: true }), token,
        });
    }

    // 5. 内容：用 tax-policy 而不是 feed —— 不带 placement 的 feed 在**正式站也是 items=0**
    //    （两站实测一致，是产品行为），拿它断言只会得出「预发有问题」的错误结论。
    //    tax-policy 才是核对脚本真正检查的那个端点，beta 空库没补种会让它为空。
    const content = await call(baseUrl, '/api/content/tax-policy', { token });
    const items = (content.json && content.json.data && content.json.data.items) || [];
    const version = content.json && content.json.data && content.json.data.version;
    push('内容 /api/content/tax-policy',
        classifyStatus(content.status) === 'ok' && items.length > 0 ? '✅' : '❌',
        `HTTP ${content.status}，version=${version || '空'}，items=${items.length}`
        + (items.length === 0 ? '（空库？跑 beta-seed-server.sh 补种）' : ''));

    // 6. 留资（生产强制跳过；限流判跳过不算失败）
    if (prod) {
        push('留资 /api/leads', '⏭️', '正式站：跳过，不写测试线索');
    } else {
        const lead = await call(baseUrl, '/api/leads', {
            method: 'POST', body: leadPayload(new Date().toISOString().slice(0, 10)), token,
        });
        const kind = classifyStatus(lead.status);
        if (kind === 'ratelimit') {
            push('留资 /api/leads', '⏭️', 'HTTP 429 —— 限流 10 次/小时/IP，属环境自保，非链路故障');
        } else {
            const ok = lead.status === 201 || lead.status === 200;
            push('留资 /api/leads', ok ? '✅' : '❌',
                `HTTP ${lead.status}${lead.json && lead.json.data && lead.json.data.merged ? '（24h 内同手机号合并）' : ''}`);
        }
    }

    const failed = steps.filter((s) => s.icon === '❌');
    return {
        steps,
        report: buildReport(steps, { baseUrl, email, prodGuard: prod }),
        exitCode: failed.length ? 1 : 0,
    };
}

function parseArg(argv, name, fallback = '') {
    const i = argv.indexOf(`--${name}`);
    if (i >= 0 && argv[i + 1]) return argv[i + 1];
    const eq = argv.find((a) => a.startsWith(`--${name}=`));
    return eq ? eq.slice(name.length + 3) : fallback;
}

async function main(argv = process.argv.slice(2)) {
    const baseUrl = parseArg(argv, 'base-url', DEFAULT_BASE);
    const email = parseArg(argv, 'email', process.env.BETA_TEST_EMAIL || '');
    const password = parseArg(argv, 'password', process.env.BETA_TEST_PASSWORD || '');
    const allowProd = argv.includes('--allow-prod');

    if (!email || !password) {
        console.log('❌ 缺少账号：用 --email/--password 传，或设环境变量 BETA_TEST_EMAIL / BETA_TEST_PASSWORD。');
        console.log('   beta 是独立库且不发信（注册走不通），账号要用 tools/ops/beta-ensure-test-user.sh 现建。');
        process.exitCode = 1;
        return;
    }

    const r = await run({
        baseUrl,
        email,
        password,
        auth: { user: process.env.BETA_AUTH_USER || '', pass: process.env.BETA_AUTH_PASS || '' },
        allowProd,
    });
    console.log(r.report);
    process.exitCode = r.exitCode;
}

if (require.main === module) {
    main();
}

module.exports = {
    isProdHost, hasAuthConflict, classifyStatus, makeClientId, syncPushPayload, leadPayload,
    buildReport, run,
};
