/**
 * 发版口径核对（共享库）—— 把「文档里写的数字」与「仓库里的实测数字」对账
 *
 * 为什么需要它：单测套件/用例数、门禁断言数、线上指纹数散落在
 * README / docs/README / development-workflow / development-plan / CHANGELOG / tools 下两份 README，
 * 改一次用例数要人肉手改 6 处；漏改的后果不是报错，而是**对外承诺的验证强度与实现对不上**
 * （说 537 例实际 544 例是低报，说 142 项实际 100 项是虚报）。
 *
 * 可静态推导的部分（无需跑测试，快且准）：
 *   - 套件数 = tests/**\/*.test.js 文件数（与 jest `testMatch` 同口径）
 *   - 用例数 = 测试文件里「行首 test(」的个数（537/537 已与 jest 实测核对一致；
 *     按行首计数可避开字符串/注释里出现的 "test("）
 *
 * 无法离线推导的部分（脚本里含 catch 分支回退断言，文本数 ≥ 实跑数，只能当「上限」夹逼）：
 *   - verify:local 门禁项数、ops-check-prod 线上指纹项数 —— 真实数值必须实跑一次才知道
 *
 * 消费方（同一份口径定义，避免第三份事实）：
 *   - tests/docs-metrics.test.js（随 npm test 跑，不一致当场变红）
 *   - tests/version-sync.test.js（五处版本落点）
 *   - tools/ops/preflight-release.js（发版前 CLI：npm run verify:release）
 *
 * 维护契约：下面每条口径声明都是按现有措辞写的正则。若某天改写了这些句子的措辞导致解析不到，
 * 断言会失败并**指名文件**（不会静默放过）—— 修法是补/改正则，而不是删断言。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const readJson = (rel) => JSON.parse(read(rel));

// ======================= 实测值 =======================

// jest testMatch: <rootDir>/tests/**/*.test.js（递归）
function collectTestFiles(dir) {
    const out = [];
    (function walk(d) {
        fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
            const p = path.join(d, e.name);
            if (e.isDirectory()) walk(p);
            else if (e.name.endsWith('.test.js')) out.push(p);
        });
    })(dir);
    return out.sort();
}

function measureCounts() {
    const files = collectTestFiles(path.join(ROOT, 'tests'));
    const testCases = files.reduce(
        (n, f) => n + (fs.readFileSync(f, 'utf8').match(/^[ \t]*test\s*\(/gm) || []).length, 0
    );
    return {
        suiteFiles: files.length,
        testCases,
        // 文本断言数：含 catch 分支的回退断言，故 **≥** 实跑项数，仅作上界使用
        verifyLocalTextAssertions: (read('server/scripts/verify-local-auth.js').match(/record\s*\(/g) || []).length,
        opsCheckTextAssertions: (read('tools/ops/ops-check-prod.ps1').match(/Add-Check/g) || []).length,
    };
}

// ======================= 口径落点 =======================

const FIRST_SECTION = 'firstSection';

// 套件/用例数：每个文件取其作用域内「用例数最大」的一条作为当前口径
// （CHANGELOG 与 development-plan 会在同段里回指上一版基线，如「20 套件 412 例 → **25 套件 537 例**」，
//  历史值一定更小，取最大即可稳定命中当前值）
// 「N 套件 M 例」的两种行文都要认：「N 例」与「N 个（单元测试）」
const UNIT_PATTERN = /(\d+)\s*套件\s*(\d+)\s*(?:例|个)/g;

// history: true = 该文件会成段回指旧基线（如「20 套件 412 例 → **26 套件 545 例**」），
// 只校验「当前口径」；其余文件**不允许**出现任何过时数字（一处漏改即红）
const UNIT_SPOTS = [
    { file: 'README.md' },
    { file: 'docs/README.md' },
    { file: 'docs/guides/development-workflow.md' },
    { file: 'docs/development/development-plan.md', history: true },
    { file: 'CHANGELOG.md', scope: FIRST_SECTION, history: true },
];

// 门禁断言数（verify:local）：只做「文档彼此一致 + 不超过脚本文本断言数」
const GATE_PATTERNS = [
    /verify:local`?\s*\**\s*(\d+)\s*\/\s*(\d+)/g,
    /verify:local`?\s*\**\s*(\d+)\s*项/g,
    /门禁\s*\**\s*(\d+)\s*\/\s*(\d+)/g,
    /(\d+)\s*项断言/g,
    /同一套\s*(?:\*\*\s*)?(\d+)\s*项/g,
    /→\s*\**\s*(\d+)\s*项/g,
];

const GATE_SPOTS = [
    { file: 'README.md' },
    { file: 'docs/README.md' },
    { file: 'docs/guides/development-workflow.md' },
    { file: 'docs/development/development-plan.md' },
    { file: 'CHANGELOG.md', scope: FIRST_SECTION },
    { file: 'tools/ops/README.md' },
    { file: 'tools/gui/README.md' },
];

// 线上指纹数（ops-check-prod）
const FINGERPRINT_PATTERNS = [
    /线上指纹\s*\**\s*(\d+)\s*项/g,
    /(\d+)\s*项线上指纹/g,
    /线上\s*\**\s*(\d+)\s*项指纹/g,
    /(\d+)\s*项指纹/g,
];

const FINGERPRINT_SPOTS = [
    { file: 'docs/guides/development-workflow.md' },
    { file: 'docs/development/development-plan.md' },
    { file: 'CHANGELOG.md', scope: FIRST_SECTION },
];

// ======================= 解析工具 =======================

const lineAt = (text, index) => text.slice(0, index).split('\n').length;

// 作用域：整文件 / 首个 `## ` 小节（CHANGELOG 的当前发布或未发布小节）
function scopeOf(full, scope) {
    if (scope !== FIRST_SECTION) return { text: full, start: 0 };
    const re = /^##[ \t]/gm;
    const first = re.exec(full);
    if (!first) return { text: full, start: 0 };
    const rest = new RegExp(re.source, 'gm');
    rest.lastIndex = first.index + first[0].length;
    let next = rest.exec(full);
    const end = next ? next.index : full.length;
    return { text: full.slice(first.index, end), start: first.index };
}

function extract(full, spot, patterns) {
    const { text, start } = scopeOf(full, spot.scope);
    const hits = [];
    patterns.forEach((re) => {
        const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
        let m;
        while ((m = g.exec(text))) {
            const nums = m.slice(1).filter((x) => x !== undefined).map(Number);
            hits.push({ index: start + m.index, line: lineAt(full, start + m.index), nums, raw: m[0] });
        }
    });
    return hits;
}

// 取作用域内「最大」的一条为当前口径（历史值必然更小）
const currentHit = (hits, pick) => hits.reduce((a, b) => (pick(b) > pick(a) ? b : a));

// ======================= 口径核对 =======================

function checkMetrics() {
    const measured = measureCounts();
    const issues = [];
    const claims = { units: [], gate: [], fingerprints: [] };

    // ---- 套件/用例数：每个落点必须等于实测 ----
    UNIT_SPOTS.forEach((spot) => {
        const full = read(spot.file);
        const hits = extract(full, spot, [UNIT_PATTERN]);
        if (!hits.length) {
            issues.push(`[${spot.file}] 解析不到「N 套件 M 例」口径声明（措辞被改写？更新 release-metrics.js 的 UNIT_SPOTS）`);
            return;
        }
        const cur = currentHit(hits, (h) => h.nums[1]);
        claims.units.push({ file: spot.file, line: cur.line, suite: cur.nums[0], cases: cur.nums[1] });
        // 含历史记录的文件只校验「当前口径」（历史值本来就该保留）；
        // 其余文件逐条校验 —— 同一文件里第二处漏改（如 README 命令区的「N 个」）也必须被抓住
        (spot.history ? [cur] : hits).forEach((h) => {
            if (h.nums[0] !== measured.suiteFiles || h.nums[1] !== measured.testCases) {
                issues.push(
                    `[${spot.file}:${h.line}] 声明「${h.nums[0]} 套件 ${h.nums[1]} 例」≠ 实测「${measured.suiteFiles} 套件 ${measured.testCases} 例」`
                );
            }
        });
    });

    // ---- 门禁断言数：无从离线推导，只夹「文档彼此一致」+「不超过脚本文本断言数」----
    const gateValues = [];
    GATE_SPOTS.forEach((spot) => {
        const full = read(spot.file);
        const hits = extract(full, spot, GATE_PATTERNS).filter((h) => (h.nums[1] === undefined || h.nums[1] === h.nums[0]));
        if (!hits.length) {
            issues.push(`[${spot.file}] 解析不到 verify:local 门禁项数声明（措辞被改写？更新 release-metrics.js 的 GATE_SPOTS）`);
            return;
        }
        const cur = currentHit(hits, (h) => h.nums[0]);
        claims.gate.push({ file: spot.file, line: cur.line, value: cur.nums[0] });
        gateValues.push(cur.nums[0]);
    });
    const gateSet = Array.from(new Set(gateValues));
    if (gateSet.length > 1) {
        issues.push(`门禁项数各处不一致：${claims.gate.map((c) => `${c.file}=${c.value}`).join(' / ')}`);
    }
    if (gateSet.length && gateSet[0] > measured.verifyLocalTextAssertions) {
        issues.push(`门禁项数声明 ${gateSet[0]} > 脚本内文本断言数 ${measured.verifyLocalTextAssertions}（verify-local-auth.js 不可能有这么多断言）`);
    }

    // ---- 线上指纹数：同上，上界为 ops-check-prod 的 Add-Check 文本数 ----
    const fpValues = [];
    FINGERPRINT_SPOTS.forEach((spot) => {
        const full = read(spot.file);
        const hits = extract(full, spot, FINGERPRINT_PATTERNS);
        if (!hits.length) {
            issues.push(`[${spot.file}] 解析不到线上指纹项数声明（措辞被改写？更新 release-metrics.js 的 FINGERPRINT_SPOTS）`);
            return;
        }
        const cur = currentHit(hits, (h) => h.nums[0]);
        claims.fingerprints.push({ file: spot.file, line: cur.line, value: cur.nums[0] });
        fpValues.push(cur.nums[0]);
    });
    const fpSet = Array.from(new Set(fpValues));
    if (fpSet.length > 1) {
        issues.push(`线上指纹项数各处不一致：${claims.fingerprints.map((c) => `${c.file}=${c.value}`).join(' / ')}`);
    }
    if (fpSet.length && fpSet[0] > measured.opsCheckTextAssertions) {
        issues.push(`线上指纹声明 ${fpSet[0]} > ops-check-prod.ps1 内 Add-Check 文本数 ${measured.opsCheckTextAssertions}`);
    }

    return { ok: issues.length === 0, measured, claims, issues };
}

// 把「当前口径」的套件/用例数改成实测值（默认 dry-run）。
// 只改与当前声明值相同的匹配：像「20 套件 412 例 → **25 套件 537 例**」里的历史值不会被误改。
function syncMetricNumbers(options) {
    const opts = options || {};
    const measured = measureCounts();
    const changes = [];

    UNIT_SPOTS.forEach((spot) => {
        const full = read(spot.file);
        const hits = extract(full, spot, [UNIT_PATTERN]);
        if (!hits.length) return;
        const cur = currentHit(hits, (h) => h.nums[1]);
        const stale = { suite: cur.nums[0], cases: cur.nums[1] };
        if (stale.suite === measured.suiteFiles && stale.cases === measured.testCases
            && !hits.some((h) => h.nums[0] !== measured.suiteFiles || h.nums[1] !== measured.testCases)) return;
        // 待改 = 与实测不符的部分：含历史的文件只动「当前口径」（历史值保持原样），
        // 其余文件逐条修正（同一文件里第二处漏改也要一并改掉）
        const targets = (spot.history ? [cur] : hits)
            .filter((h) => h.nums[0] !== measured.suiteFiles || h.nums[1] !== measured.testCases)
            .sort((a, b) => b.index - a.index);
        let out = full;
        targets.forEach((h) => {
            const replaced = h.raw.replace(/(\d+)(\s*套件\s*)(\d+)/, (mm, a, mid) => `${measured.suiteFiles}${mid}${measured.testCases}`);
            out = out.slice(0, h.index) + replaced + out.slice(h.index + h.raw.length);
            changes.push({ file: spot.file, line: h.line, from: `${h.nums[0]} 套件 ${h.nums[1]} 例`, to: `${measured.suiteFiles} 套件 ${measured.testCases} 例` });
        });
        if (opts.write && out !== full) fs.writeFileSync(path.join(ROOT, spot.file), out, 'utf8');
    });

    return { written: !!opts.write, changes };
}

// ======================= 五处版本落点 =======================

// 发版时版本号需同步的五处（见 docs/guides/development-workflow.md §2④ 与 branch-release-strategy §3.2）
function readVersionSpots() {
    const indexHtml = read('index.html');
    const pkgRaw = read('package.json');
    const pkg = readJson('package.json');
    const versionJson = readJson('version.json');
    const changelog = read('CHANGELOG.md');

    // 行号取「正则命中的那一段」的位置：`indexOf('window.__APP_VERSION__')` 会命中上方注释里的同名引用，
    // 报出来的行号会指向注释行 —— 发版时照着行号跳会跳错地方
    const htmlMatch = indexHtml.match(/window\.__APP_VERSION__\s*=\s*'([^']+)'/);
    const htmlVersion = htmlMatch ? htmlMatch[1] : undefined;
    const htmlIndex = htmlMatch ? htmlMatch.index : -1;
    const aboutMatch = indexHtml.match(/版本\s+(\d+\.\d+\.\d+)/);
    const aboutVersion = aboutMatch ? aboutMatch[1] : undefined;
    const aboutIndex = aboutMatch ? aboutMatch.index : -1;

    return {
        version: pkg.version,
        releasedAt: versionJson.releasedAt,
        indexHtml,
        changelog,
        spots: [
            { label: 'package.json version', file: 'package.json', line: lineAt(pkgRaw, pkgRaw.indexOf('"version"')), value: pkg.version },
            { label: 'version.json version', file: 'version.json', line: lineAt(read('version.json'), read('version.json').indexOf('"version"')), value: versionJson.version },
            { label: 'index.html 版本哨兵 __APP_VERSION__', file: 'index.html', line: htmlIndex < 0 ? -1 : lineAt(indexHtml, htmlIndex), value: htmlVersion },
            { label: 'index.html 关于弹窗「版本 x.y.z」', file: 'index.html', line: aboutIndex < 0 ? -1 : lineAt(indexHtml, aboutIndex), value: aboutVersion },
            { label: 'CHANGELOG 该版条目', file: 'CHANGELOG.md', line: lineAt(changelog, changelog.indexOf(`[${pkg.version}]`)), value: changelog.includes(`## [${pkg.version}]`) ? pkg.version : undefined },
        ],
    };
}

// 五处一致性 + 日期自洽（releasedAt 是唯一权威发布日：CHANGELOG 该版标题日期须与它同日）
function checkVersionSpots() {
    const info = readVersionSpots();
    const issues = [];
    const semver = /^\d+\.\d+\.\d+$/;

    if (!semver.test(String(info.version))) issues.push(`package.json version「${info.version}」不是三段语义化版本`);
    info.spots.forEach((s) => {
        if (!s.value) issues.push(`[${s.file}] 解析不到版本落点「${s.label}」（措辞/结构被改写？）`);
        else if (s.value !== info.version) issues.push(`[${s.file}:${s.line}] ${s.label} = ${s.value} ≠ package.json ${info.version}`);
    });

    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(info.releasedAt))) {
        issues.push(`version.json releasedAt「${info.releasedAt}」不是 YYYY-MM-DD`);
    } else {
        const today = new Date().toISOString().slice(0, 10);
        if (info.releasedAt > today) issues.push(`version.json releasedAt ${info.releasedAt} 晚于今天 ${today}（发布日不可能在未来）`);
        const m = info.changelog.match(new RegExp(`## \\[${info.version.replace(/\./g, '\\.')}\\] - (\\d{4}-\\d{2}-\\d{2})`));
        if (!m) issues.push(`CHANGELOG 找不到「## [${info.version}] - YYYY-MM-DD」条目`);
        else if (m[1] !== info.releasedAt) issues.push(`CHANGELOG 该版日期 ${m[1]} ≠ version.json releasedAt ${info.releasedAt}`);
    }

    return { ok: issues.length === 0, info, issues };
}

module.exports = {
    ROOT,
    read,
    readJson,
    measureCounts,
    checkMetrics,
    syncMetricNumbers,
    readVersionSpots,
    checkVersionSpots,
};
