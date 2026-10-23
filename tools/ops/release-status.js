/**
 * 发布台账：一眼看出「每个版本现在在测试版还是已推正式」
 *
 * 为什么需要它：beta（预发）上线后，版本状态从「一个地方看」变成「三个地方看」——
 * 本地 package.json、预发站 /version.json、正式站 /version.json。人脑同步三者
 * 必然漂移，而漂移的后果是**发错环境**：以为「已经发过预发了」其实没有，
 * 或者预发早已落后于正式（此时 beta 已经没有「提前一步」的意义）。
 *
 * 做法：以 CHANGELOG 为版本清单、以两站 /version.json 为事实来源，自动判定每版的
 * beta / 正式两列，并对「预发滞后于生产」「正式版本没归档」这两种静默失效报警。
 * 判定逻辑是纯函数（下面 export 的那几个），以便被测试钉住。
 *
 * 用法：
 *   node tools/ops/release-status.js                 # 查实时状态（读两站 /version.json）
 *   node tools/ops/release-status.js --offline       # 不联网，只按本地信息判定
 *   node tools/ops/release-status.js --write         # 把表格写回 docs/development/release-status.md
 *
 * 预发站带 Basic Auth：从环境变量 BETA_AUTH_USER / BETA_AUTH_PASS 取凭据；
 * 没给凭据时该列标「未知」并提示，不会误判成「没发」。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const CHANGELOG = path.join(ROOT, 'CHANGELOG.md');
const LEDGER = path.join(ROOT, 'docs', 'development', 'release-status.md');

const PROD_BASE = process.env.PROD_BASE_URL || 'https://euriskotax.com';
const BETA_BASE = process.env.BETA_BASE_URL || 'https://beta.euriskotax.com';

const MARK_BEGIN = '<!-- release-status:auto -->';
const MARK_END = '<!-- /release-status:auto -->';

// ======================= 纯逻辑（可被测试直接调用） =======================

// 版本号比较：1.9.0 < 1.10.0（字符串比较会得出相反结论，必须按段比数字）
function compareVersion(a, b) {
    const pa = String(a || '').split('.').map((n) => parseInt(n, 10) || 0);
    const pb = String(b || '').split('.').map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < 3; i += 1) {
        const d = (pa[i] || 0) - (pb[i] || 0);
        if (d !== 0) return d > 0 ? 1 : -1;
    }
    return 0;
}

// 从 CHANGELOG 抽版本清单：只认 `## [X.Y.Z] - YYYY-MM-DD` 这一种写法
function parseChangelogVersions(text) {
    const re = /^##\s*\[(\d+\.\d+\.\d+)\]\s*-\s*(\d{4}-\d{2}-\d{2})/gm;
    const out = [];
    let m;
    while ((m = re.exec(text)) !== null) {
        out.push({ version: m[1], date: m[2] });
    }
    return out;
}

/**
 * 判定每个版本在 beta / 正式的状态。
 * @param {object} p
 * @param {Array<{version:string,date:string}>} p.versions CHANGELOG 里的版本清单（新的在前）
 * @param {string} p.local      本地 package.json 版本
 * @param {string|null} p.beta  预发站实际版本（null = 取不到）
 * @param {string|null} p.prod  正式站实际版本（null = 取不到）
 * @param {number} [p.limit]    最多列几个版本
 */
function buildStatus({ versions, local, beta, prod, limit = 8 }) {
    const list = (versions || []).slice(0, limit);
    const hit = (actual, target) => (actual && compareVersion(actual, target) >= 0 ? '✅' : '—');

    const rows = list.map((v) => ({
        version: v.version,
        date: v.date,
        beta: hit(beta, v.version),
        prod: hit(prod, v.version),
    }));

    const warnings = [];
    // 预发落后于正式：beta 已经不是「提前一步」，而是旧版本，拿它验收等于拿旧东西验收
    if (beta && prod && compareVersion(beta, prod) < 0) {
        warnings.push(`预发 ${beta} 落后于正式 ${prod} —— beta 已失去「提前一步」的意义，先发一次 beta 再用`);
    }
    // 正式站跑着的版本没在 CHANGELOG 里：不是漏归档就是有人绕过流程直接发了
    if (prod && !list.some((v) => v.version === prod)) {
        warnings.push(`正式站 ${prod} 不在 CHANGELOG 最近 ${limit} 个版本里（漏归档，还是有人绕过流程直接发了？）`);
    }
    if (beta && !list.some((v) => v.version === beta)) {
        warnings.push(`预发站 ${beta} 不在 CHANGELOG 最近 ${limit} 个版本里`);
    }
    if (!beta) {
        warnings.push(`读不到预发站版本（${BETA_BASE}/version.json）：没给 Basic Auth 凭据（BETA_AUTH_USER / BETA_AUTH_PASS）或站点不可达`);
    }
    if (!prod) {
        warnings.push(`读不到正式站版本（${PROD_BASE}/version.json）`);
    }

    let conclusion;
    if (!local) {
        conclusion = '读不到本地版本（package.json）';
    } else if (!beta || compareVersion(local, beta) > 0) {
        conclusion = `本地 ${local} 还没发到预发 —— 下一步：ops-deploy-beta.ps1`;
    } else if (!prod || compareVersion(local, prod) > 0) {
        conclusion = `已在预发 ${beta}，待发正式（正式现在是 ${prod || '未知'}）—— 下一步：ops-check-beta.ps1 全绿后 ops-deploy.ps1`;
    } else {
        conclusion = `已全量：正式 ${prod} = 本地 ${local}`;
    }

    return { rows, warnings, conclusion, local, beta, prod };
}

function renderMarkdown(status) {
    const lines = [];
    lines.push('| 版本 | 归档日 | 预发 beta | 正式 | ');
    lines.push('|---|---|---|---|');
    status.rows.forEach((r) => {
        lines.push(`| ${r.version} | ${r.date} | ${r.beta} | ${r.prod} |`);
    });
    lines.push('');
    lines.push(`**当前结论**：${status.conclusion}`);
    lines.push('');
    lines.push(`- 本地 package.json：\`${status.local || '未知'}\``);
    lines.push(`- 预发 ${BETA_BASE}：\`${status.beta || '读取失败'}\``);
    lines.push(`- 正式 ${PROD_BASE}：\`${status.prod || '读取失败'}\``);
    if (status.warnings.length) {
        lines.push('');
        status.warnings.forEach((w) => lines.push(`> ⚠️ ${w}`));
    }
    return lines.join('\n');
}

function updateLedger(status, generatedAt) {
    const block = [MARK_BEGIN, '', renderMarkdown(status), '',
        `<!-- 生成时间：${generatedAt} ；由 npm run status:release -- --write 覆写，本区块内手写内容会被覆盖 -->`,
        MARK_END].join('\n');

    if (!fs.existsSync(LEDGER)) {
        const head = [
            '# 发布台账：每个版本现在在测试版还是已推正式',
            '',
            '> 下表由 `npm run status:release -- --write` 自动生成（事实来源是两站 `/version.json` + `CHANGELOG.md`），',
            '> **不要手写** —— 手写的会漂移，漂移了就比没有更糟（照着旧台账发错环境）。',
            '> 需要留档的结论（真机手点结果、已知问题）写在下面的「真机验收记录」小节，那里不会被覆盖。',
            '',
            block,
            '',
            '## 怎么读这张表',
            '',
            '| 预发 | 正式 | 含义 | 下一步 |',
            '|---|---|---|---|',
            '| ✅ | ✅ | 已全量 | 收工 |',
            '| ✅ | — | 已发预发、待发正式 | 预发核对 37 项 + 真机手点 → `ops-deploy.ps1` |',
            '| — | — | 还没发过 | `ops-deploy-beta.ps1` |',
            '',
            '## 真机验收记录（手写，不被脚本覆盖）',
            '',
            '| 版本 | 日期 | 预发真机结论 | 正式发后复核 |',
            '|---|---|---|---|',
            '',
        ].join('\n');
        fs.writeFileSync(LEDGER, head, 'utf8');
        return { created: true };
    }

    const text = fs.readFileSync(LEDGER, 'utf8');
    const begin = text.indexOf(MARK_BEGIN);
    const end = text.indexOf(MARK_END);
    if (begin < 0 || end < 0) {
        return { created: false, error: '台账文件里找不到自动区块标记，未改动文件' };
    }
    const next = text.slice(0, begin) + block + text.slice(end + MARK_END.length);
    fs.writeFileSync(LEDGER, next, 'utf8');
    return { created: false };
}

// ======================= 联网取事实 =======================

async function fetchVersion(baseUrl, auth) {
    const headers = {};
    if (auth && auth.user && auth.pass) {
        headers.Authorization = `Basic ${Buffer.from(`${auth.user}:${auth.pass}`).toString('base64')}`;
    }
    // 不用 AbortSignal.timeout：Node 在 Windows 上退出时会因它的 handle 已关闭而
    // 断言崩溃（实测报 "Assertion failed: ... UV_HANDLE_CLOSING"），命令输出正确
    // 却顶着一段红字，看着像失败。改成自己持有 AbortController 并清掉定时器。
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
        const res = await fetch(`${baseUrl.replace(/\/$/, '')}/version.json`, {
            headers,
            signal: ctrl.signal,
        });
        if (!res.ok) return null;
        const json = await res.json();
        return json && json.version ? json.version : null;
    } catch (e) {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

async function main(argv = process.argv.slice(2)) {
    const offline = argv.includes('--offline') || argv.includes('-o');
    const write = argv.includes('--write') || argv.includes('-w');

    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const versions = parseChangelogVersions(fs.readFileSync(CHANGELOG, 'utf8'));

    let beta = null;
    let prod = null;
    if (!offline) {
        const auth = {
            user: process.env.BETA_AUTH_USER || '',
            pass: process.env.BETA_AUTH_PASS || '',
        };
        [beta, prod] = await Promise.all([
            fetchVersion(BETA_BASE, auth),
            fetchVersion(PROD_BASE, null),
        ]);
    }

    const status = buildStatus({ versions, local: pkg.version, beta, prod });
    console.log(renderMarkdown(status));

    if (write) {
        const r = updateLedger(status, new Date().toISOString().slice(0, 16).replace('T', ' '));
        if (r.error) console.log(`\n[WARN] ${r.error}`);
        else console.log(`\n已写入 ${path.relative(ROOT, LEDGER)}${r.created ? '（新建）' : ''}`);
    }

    // 退出码：只在「预发滞后于生产」这种会让 beta 失去意义的情况上报警，
    // 其余（还没发预发）是正常流程状态，不该让命令失败。
    const fatal = status.warnings.filter((w) => w.includes('落后于正式'));
    return fatal.length ? 1 : 0;
}

if (require.main === module) {
    // 同样为了避开上面那个 Windows 退出断言：设 exitCode 让进程自然收尾，
    // 而不是在 fetch 的 handle 还挂着时硬 process.exit。
    main().then((code) => { process.exitCode = code; });
}

module.exports = { compareVersion, parseChangelogVersions, buildStatus, renderMarkdown, updateLedger };
