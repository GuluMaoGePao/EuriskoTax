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
 * 项数声明的「身份」靠版本标注判定（2026-09-13 加固，实现见「版本锚定」小节）：
 *   - 等于当前口径 → 当前值；带 vX.Y.Z / [X.Y.Z] 标注（同一行或所在 `## ` 小节标题）→ 自证是历史基线
 *   - 既不是当前口径、又没标注版本 → 判为「疑似旧口径残留」并指名 文件:行号
 *   旧实现只校验「每份文件里数值最大的那一条」，同文件内其余出现既不校验、也不要求标注 ——
 *   残留的旧口径只要不写得比当前值大，就能永久骗过断言（上一版靠人工 grep 才捞出 10 处）。
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

// test.each([...]) 在源码里只占一行声明，jest 却按数据条目展开成 N 个用例。
// 行首正则数不到它（`test` 后面跟的是 `.each` 而非 `(`），口径因此比 jest 实测少算 ——
// 实测对照才发现（19-1 验收时 1750 vs 1754，差额全在 reverse-migration.test.js 的一处 each）。
// 只处理数组形式：模板字符串表格（test.each`...`）本仓库未用，若引入需以 jest 实跑数为准手工核对。
function countEachCases(src) {
    let total = 0;
    const re = /\b(?:test|it)\.each\s*\(\s*\[/g;
    let m;
    while ((m = re.exec(src))) {
        const start = m.index + m[0].length - 1; // 停在 '['
        let depth = 0;
        let end = -1;
        for (let i = start; i < src.length; i++) {
            if (src[i] === '[') depth++;
            else if (src[i] === ']') { depth--; if (depth === 0) { end = i; break; } }
        }
        if (end < 0) break;
        let items = 0;
        let nested = 0;
        let nonEmpty = false;
        for (let i = start + 1; i < end; i++) {
            const ch = src[i];
            if (ch === '[' || ch === '(' || ch === '{') nested++;
            else if (ch === ']' || ch === ')' || ch === '}') nested--;
            else if (ch === ',' && nested === 0) items++;
            else if (/\S/.test(ch)) nonEmpty = true;
        }
        if (nonEmpty) items += 1;
        total += items;
        re.lastIndex = end;
    }
    return total;
}

// 口径只数「真实会被执行的用例」，注释里举的写法不算 —— 否则在注释中说明
// `test.each([...])` 这句话本身会被上面两条规则各数一次（实测踩到：口径凭空多 1 例）。
// 只剔整行注释（行首 //、/*、*），不动行内的 `//`：行内形式会误伤字符串里的 URL 之类。
function stripCommentLines(src) {
    return src.split(/\r?\n/).map((l) => (/^\s*(\/\/|\/\*|\*)/.test(l) ? '' : l)).join('\n');
}

function measureCounts() {
    const files = collectTestFiles(path.join(ROOT, 'tests'));
    const testCases = files.reduce((n, f) => {
        const src = stripCommentLines(fs.readFileSync(f, 'utf8'));
        return n + (src.match(/^[ \t]*(?:test|it)\s*\(/gm) || []).length + countEachCases(src);
    }, 0);
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

// 门禁断言数（verify:local）：逐条校验（等于当前口径，或带版本前缀自证是历史基线）
const GATE_PATTERNS = [
    /verify:local`?\s*\**\s*(\d+)\s*\/\s*(\d+)/g,
    /verify:local`?\s*\**\s*(\d+)\s*项/g,
    /门禁\s*\**\s*(\d+)\s*\/\s*(\d+)/g,
    /门禁\s*\**\s*(\d+)\s*项/g,
    /(\d+)\s*项断言/g,
    /同一套\s*(?:\*\*\s*)?(\d+)\s*项/g,
    /→\s*\**\s*(\d+)\s*项/g,
];

// history: true = 该文件允许保留历史基线，但每条历史值都必须带版本前缀（否则视为漏改）；
// 其余落点一律只写当前口径（出现历史值即红）—— 当前版本的 CHANGELOG 小节也按此从严。
const GATE_SPOTS = [
    { file: 'README.md' },
    { file: 'docs/README.md' },
    { file: 'docs/guides/development-workflow.md' },
    { file: 'docs/development/development-plan.md', history: true },
    { file: 'CHANGELOG.md', scope: FIRST_SECTION },
    { file: 'tools/ops/README.md' },
    { file: 'tools/gui/README.md' },
    // 旧口径残留的实际漏检面：脚本里的说明串同样对外宣称项数，纳入同一套逐条校验
    { file: 'tools/ops/ops-verify-pg.ps1' },
    { file: 'tools/gui/gui-dev-console.ps1' },
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
    { file: 'docs/development/development-plan.md', history: true },
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

// ======================= 版本锚定（旧口径残留防护） =======================
//
// 加固（2026-09-13）：项数声明原先只校验「每份文件里数值最大的那一条」，同文件内其余出现
// 既不校验、也不要求版本前缀 —— 只要旧口径不写得比当前值大，就能永久骗过断言
// （上一版在 ops-verify-pg.ps1 / gui-dev-console.ps1 / development-workflow.md 里发现的
// 10 处「152 项 / 156 项」残留，全靠人工 grep 才捞出来）。现在两条硬约束：
//   ① 逐条校验：任何项数命中要么等于当前口径，要么**明确带版本前缀**
//      （同一行或所在 `## ` 小节标题含 vX.Y.Z / [X.Y.Z]）自证是历史基线，否则判为「疑似旧口径残留」；
//   ② 当前口径必须锚定当前版本：取「带当前版本标注」的那条，一条都没有即报红 ——
//      不再靠「取最大」猜（项数下降的版本里历史值会比当前值大，取最大会取错）。

const VERSION_RE = /\bv?\d+\.\d+\.\d+\b|\[\d+\.\d+\.\d+\]/;

function lineText(full, index) {
    const start = full.lastIndexOf('\n', index) + 1;
    const end = full.indexOf('\n', index);
    return full.slice(start, end === -1 ? full.length : end);
}

function sectionHeaderBefore(full, index) {
    const lines = full.slice(0, index).split('\n');
    for (let i = lines.length - 1; i >= 0; i -= 1) {
        if (/^##[ \t]/.test(lines[i])) return lines[i];
    }
    return '';
}

// 命中是否带版本标注 / 是否带「当前版本」标注（看同一行与所在 `## ` 小节标题）
function anchorInfo(full, hit, version) {
    const text = `${sectionHeaderBefore(full, hit.index)}\n${lineText(full, hit.index)}`;
    return { anchored: VERSION_RE.test(text), current: text.indexOf(version) !== -1 };
}

// 当前口径：优先取带当前版本标注的命中；历史落点一条都没有就报红并退回「最大一条」（其余校验照常跑）
function pickCurrent(full, hits, pick, opts) {
    const anchored = hits.filter((h) => anchorInfo(full, h, opts.version).current);
    if (anchored.length) return currentHit(anchored, pick);
    // 只有允许历史值的落点才强求「当前口径锚定当前版本」：这类文件里多个版本的口径共存，
    // 不标注就分不清哪条是当前值（项数下降的版本里「取最大」会取到历史值）
    if (opts.history) {
        opts.issues.push(
            `[${opts.file}] ${opts.span}当前口径未标注当前版本 v${opts.version}（同一行或所在 \`## \` 小节标题）——`
            + '无法与历史值区分，请补版本标注后再发布'
        );
    }
    return currentHit(hits, pick);
}

// 疑似旧口径残留：既不是当前口径、又没带版本前缀（只有 history 落点才允许留下历史值）；
// 增量描述（「新增/移除/少 N 项」）本就不是总项数声明，在这里统一排除
function findStaleMentions(full, patterns, opts) {
    const filter = opts.filter || (() => true);
    const isClaim = notDelta(full);
    return extract(full, { scope: opts.scope }, patterns)
        .filter((h) => filter(h) && isClaim(h))
        .filter((h) => !opts.isCurrent(h) && !(opts.history && anchorInfo(full, h, opts.version).anchored));
}

function reportStaleMentions(issues, full, patterns, opts) {
    findStaleMentions(full, patterns, opts).forEach((h) => {
        issues.push(
            `[${opts.file}:${h.line}] 疑似旧口径残留：${opts.span}「${h.raw.trim()}」既非${opts.currentText}，`
            + '也未标注版本前缀（vX.Y.Z / [X.Y.Z]）——'
            + (opts.history ? '历史基线请补版本前缀' : '本文件只写当前口径，请改成当前值')
        );
    });
}

// 「门禁 165/165」这类成对写法：两侧数字必须相同才算一条总项数声明
const pairedSame = (h) => h.nums[1] === undefined || h.nums[1] === h.nums[0];

// 「新增「城市改在留资里」5 项 / 移除 … 6 项断言 / 少 1 项」这类说的是**增量**而不是总项数：
// 命中所在句（按 。；; 断句）的前半段出现增量词，就不算一条总项数声明 —— 否则变更列表会全员误报。
const DELTA_WORDS_RE = /新增|移除|删除|下线|补强|净增|[少多增减]|±/;
const notDelta = (full) => (h) => {
    const line = lineText(full, h.index);
    const before = line.slice(0, line.indexOf(h.raw)).split(/[。；;]/).pop();
    return !DELTA_WORDS_RE.test(before);
};

// 门禁实跑快照：verify-local-auth.js 每次本地实跑都会写一份（gitignored）。
// 有了它，「门禁项数」从「无从离线推导」变成「有实跑证据可对账」——
// 2026-09-13 那次「文档写 142、实跑 146」能瞒过一切断言，正是因为文档里的数字
// 是「基线 + 新增项」推算出来的，没有任何一次实跑值与它对照。
const GATE_RUN_FILE = 'tools/ops/.verify-local-last.json';

function readRecordedGateRun() {
    try {
        return readJson(GATE_RUN_FILE);
    } catch (err) {
        return null;   // 还没跑过门禁的开发机：没有证据，不假装有
    }
}

// ======================= 口径核对 =======================

function checkMetrics() {
    const measured = measureCounts();
    const issues = [];
    const claims = { units: [], gate: [], fingerprints: [] };
    const version = readVersionSpots().version;

    // ---- 套件/用例数：当前口径必须等于实测；其余出现必须带版本前缀（见「版本锚定」）----
    UNIT_SPOTS.forEach((spot) => {
        const full = read(spot.file);
        const hits = extract(full, spot, [UNIT_PATTERN]);
        if (!hits.length) {
            issues.push(`[${spot.file}] 解析不到「N 套件 M 例」口径声明（措辞被改写？更新 release-metrics.js 的 UNIT_SPOTS）`);
            return;
        }
        const cur = pickCurrent(full, hits, (h) => h.nums[1], {
            file: spot.file, version, history: !!spot.history, span: '单测口径', issues,
        });
        claims.units.push({ file: spot.file, line: cur.line, suite: cur.nums[0], cases: cur.nums[1] });
        if (cur.nums[0] !== measured.suiteFiles || cur.nums[1] !== measured.testCases) {
            issues.push(
                `[${spot.file}:${cur.line}] 声明「${cur.nums[0]} 套件 ${cur.nums[1]} 例」≠ 实测「${measured.suiteFiles} 套件 ${measured.testCases} 例」`
            );
        }
        // 逐条校验：非实测值必须带版本前缀自证是历史基线（同一文件里第二处漏改也必须被抓住）
        reportStaleMentions(issues, full, [UNIT_PATTERN], {
            scope: spot.scope,
            file: spot.file,
            version,
            history: !!spot.history,
            span: '单测口径',
            currentText: `实测值（${measured.suiteFiles} 套件 ${measured.testCases} 例）`,
            isCurrent: (h) => h.nums[0] === measured.suiteFiles && h.nums[1] === measured.testCases,
        });
    });

    // ---- 门禁断言数：无从离线推导，故逐条「等于当前口径或带版本前缀」+ 文档彼此一致 + 不超过脚本文本断言数 ----
    const gateValues = [];
    GATE_SPOTS.forEach((spot) => {
        const full = read(spot.file);
        const hits = extract(full, spot, GATE_PATTERNS).filter((h) => pairedSame(h) && notDelta(full)(h));
        if (!hits.length) {
            issues.push(`[${spot.file}] 解析不到 verify:local 门禁项数声明（措辞被改写？更新 release-metrics.js 的 GATE_SPOTS）`);
            return;
        }
        const cur = pickCurrent(full, hits, (h) => h.nums[0], {
            file: spot.file, version, history: !!spot.history, span: 'verify:local 门禁项数', issues,
        });
        claims.gate.push({ file: spot.file, line: cur.line, value: cur.nums[0] });
        gateValues.push(cur.nums[0]);
        reportStaleMentions(issues, full, GATE_PATTERNS, {
            scope: spot.scope,
            filter: pairedSame,
            file: spot.file,
            version,
            history: !!spot.history,
            span: '门禁项数',
            currentText: `当前口径（${cur.nums[0]} 项）`,
            isCurrent: (h) => h.nums[0] === cur.nums[0],
        });
    });
    const gateSet = Array.from(new Set(gateValues));
    if (gateSet.length > 1) {
        issues.push(`门禁项数各处不一致：${claims.gate.map((c) => `${c.file}=${c.value}`).join(' / ')}`);
    }
    if (gateSet.length && gateSet[0] > measured.verifyLocalTextAssertions) {
        issues.push(`门禁项数声明 ${gateSet[0]} > 脚本内文本断言数 ${measured.verifyLocalTextAssertions}（verify-local-auth.js 不可能有这么多断言）`);
    }
    // 有实跑快照时，声明值必须等于「最近一次真跑出来的项数」——这是唯一能抓住
    // 「数字是推算的」的断言：上界检查只能拦虚报，拦不住少报/多报几个
    const recorded = readRecordedGateRun();
    if (recorded && gateSet.length && typeof recorded.total === 'number' && gateSet[0] !== recorded.total) {
        issues.push(
            `门禁项数声明 ${gateSet[0]} ≠ 最近一次 verify:local 实跑 ${recorded.total} 项（快照 ${GATE_RUN_FILE} @ ${recorded.at}）——`
            + '跑一次 npm run verify:local 看分段明细后回填文档，不要按「基线 + 新增项」推算'
        );
    }

    // ---- 线上指纹数：同上逐条校验，上界为 ops-check-prod 的 Add-Check 文本数 ----
    const fpValues = [];
    FINGERPRINT_SPOTS.forEach((spot) => {
        const full = read(spot.file);
        const hits = extract(full, spot, FINGERPRINT_PATTERNS).filter(notDelta(full));
        if (!hits.length) {
            issues.push(`[${spot.file}] 解析不到线上指纹项数声明（措辞被改写？更新 release-metrics.js 的 FINGERPRINT_SPOTS）`);
            return;
        }
        const cur = pickCurrent(full, hits, (h) => h.nums[0], {
            file: spot.file, version, history: !!spot.history, span: '线上指纹项数', issues,
        });
        claims.fingerprints.push({ file: spot.file, line: cur.line, value: cur.nums[0] });
        fpValues.push(cur.nums[0]);
        reportStaleMentions(issues, full, FINGERPRINT_PATTERNS, {
            scope: spot.scope,
            file: spot.file,
            version,
            history: !!spot.history,
            span: '线上指纹项数',
            currentText: `当前口径（${cur.nums[0]} 项）`,
            isCurrent: (h) => h.nums[0] === cur.nums[0],
        });
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
    const version = readVersionSpots().version;
    const changes = [];

    UNIT_SPOTS.forEach((spot) => {
        const full = read(spot.file);
        const hits = extract(full, spot, [UNIT_PATTERN]);
        if (!hits.length) return;
        // 与 checkMetrics 同一套选取口径：只改「带当前版本标注」的当前值，绝不误改历史基线
        const cur = pickCurrent(full, hits, (h) => h.nums[1], {
            file: spot.file, version, history: !!spot.history, span: '单测口径', issues: [],
        });
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
    readRecordedGateRun,
    // 口径定义与「版本锚定」规则（供 tests/docs-metrics.test.js 直接驱动）
    UNIT_PATTERN,
    GATE_PATTERNS,
    FINGERPRINT_PATTERNS,
    anchorInfo,
    findStaleMentions,
};
