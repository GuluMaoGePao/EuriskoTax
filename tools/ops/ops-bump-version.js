#!/usr/bin/env node
'use strict';
/**
 * 升版本号：递一处，同步五处。
 *
 * 版本号散在五个地方，漏改任一一处的后果**不是报错**：index.html 里的版本哨兵会拿页面版本
 * 与线上 version.json 比对，不一致就重置缓存并重载 —— 用户体感是「每次新会话都要被清一次
 * 缓存，页面闪一下」。这类问题从用户反馈几乎定位不到（页面照样有数字、照样能用），所以
 * 五处必须一起动。这个脚本就是把这件事变成一条命令。
 *
 * 五处：
 *   1. package.json     "version": "x.y.z"
 *   2. version.json     "version" + "releasedAt"（releasedAt 写 **UTC 当天**，见下）
 *   3. index.html       window.__APP_VERSION__ = 'x.y.z'（版本哨兵读的就是它）
 *   4. index.html       页尾「版本 x.y.z」（关于弹窗那一行）
 *   5. CHANGELOG.md     首个 ## [x.y.z] - YYYY-MM-DD 小节（没有就插一个新的）
 *
 * 用法：
 *   node tools/ops/ops-bump-version.js                # 默认 Patch：1.149.6 → 1.149.7
 *   node tools/ops/ops-bump-version.js --minor        # 1.150.0
 *   node tools/ops/ops-bump-version.js --major        # 2.0.0
 *   node tools/ops/ops-bump-version.js --set=1.150.0  # 直接指定
 *   node tools/ops/ops-bump-version.js --dry-run      # 只看会改成什么，一个字节都不写
 *   node tools/ops/ops-bump-version.js --no-changelog # 只改四处，不动 CHANGELOG
 *   node tools/ops/ops-bump-version.js --title="CI：补上本机绿不等于仓库绿这条缝"
 *
 * 两个刻意的设计：
 *   - 任一一处匹配不上（比如注释改了、行被搬走了），脚本**报错退出而不是跳过**。
 *     静默跳过就等于制造了第六处漏改，那比不改更糟。
 *   - releasedAt 与 CHANGELOG 小节日期都取 UTC 当天。preflight-release.js 是按 UTC 判定
 *     「发布日不可能在未来」的：北京时间 00:00–08:00 这段，UTC 还是前一天，写本机日期
 *     会被判成「晚于今天」而 FAIL。
 */
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const flag = (n) => argv.includes('--' + n);
const opt = (n) => {
    const hit = argv.find((a) => a === '--' + n || a.startsWith('--' + n + '='));
    if (!hit) return null;
    const i = hit.indexOf('=');
    return i === -1 ? true : hit.slice(i + 1);
};

const root = path.resolve(opt('root') || path.join(__dirname, '..', '..'));
const dryRun = flag('dry-run');
const noChangelog = flag('no-changelog');
const title = opt('title') || '（待补：一句话说清这版改了什么）';
const VER = '[0-9]+\\.[0-9]+\\.[0-9]+';

function fail(msg) {
    console.error('[FAIL] ' + msg);
    process.exit(1);
}

// 匹配不到就整体失败，不允许「这一处跳过、其他照改」——
// 静默跳过等于制造了第六处漏改，那比不改更糟（页面照样能跑，问题只在用户侧表现为反复清缓存）。
function replaceOnce(text, re, make, what) {
    if (!re.test(text)) fail(what + '：在文件里匹配不到（格式变了就该改脚本，而不是跳过这一处）');
    return text.replace(re, make);
}

const files = {
    pkg: path.join(root, 'package.json'),
    ver: path.join(root, 'version.json'),
    html: path.join(root, 'index.html'),
    changelog: path.join(root, 'CHANGELOG.md'),
};
for (const key of Object.keys(files)) {
    if (!fs.existsSync(files[key])) fail('找不到文件：' + files[key]);
}

// ---- 现状 ----
const pkgText = fs.readFileSync(files.pkg, 'utf8');
const verText = fs.readFileSync(files.ver, 'utf8');
const htmlText = fs.readFileSync(files.html, 'utf8');
const chgText = fs.readFileSync(files.changelog, 'utf8');

const current = (pkgText.match(new RegExp('^\\s*"version"\\s*:\\s*"(' + VER + ')"', 'm')) || [])[1];
if (!current) fail('package.json 里读不到版本号（找不到 "version": "x.y.z" 这一行）');

const oldReleased = (verText.match(/"releasedAt"\s*:\s*"([^"]+)"/) || [])[1];
const sentry = (htmlText.match(new RegExp("window\\.__APP_VERSION__ = '(" + VER + ")'")) || [])[1];
const footer = (htmlText.match(new RegExp('(>版本 )(' + VER + ')(<)')) || [])[2];
const firstChg = chgText.match(/^## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})/m);

// ---- 目标版本 ----
let target;
const setTo = opt('set');
let mode;
if (setTo) {
    target = String(setTo);
    mode = 'set';
} else {
    const [a, b, c] = current.split('.').map(Number);
    if (flag('major')) {
        target = `${a + 1}.0.0`;
        mode = 'major';
    } else if (flag('minor')) {
        target = `${a}.${b + 1}.0`;
        mode = 'minor';
    } else {
        target = `${a}.${b}.${c + 1}`;
        mode = 'patch';
    }
}
if (!new RegExp('^' + VER + '$').test(target)) fail('目标版本号不合法：' + target);
if (target === current) fail(`目标版本与当前版本相同（${current}），没有可升的 —— 想指定版本用 --set=x.y.z`);

// UTC 当天（不是本机日期），见文件头说明
const today = new Date().toISOString().slice(0, 10);

// ---- 改四处（每一处都要先匹配到，匹配不到就整体失败） ----
const edits = [];

if (!sentry) fail('index.html 里找不到 window.__APP_VERSION__ = \'x.y.z\'（版本哨兵读的就是它）');
if (!footer) fail('index.html 里找不到页尾「版本 x.y.z」那一行');

const pkgNext = replaceOnce(pkgText,
    new RegExp('^(\\s*"version"\\s*:\\s*")(' + VER + ')(")', 'm'),
    (m, p1, p2, p3) => p1 + target + p3,
    'package.json 的 "version"');
edits.push({ file: 'package.json', label: 'version', from: current, to: target });

let verNext = replaceOnce(verText,
    new RegExp('("version"\\s*:\\s*")(' + VER + ')(")'),
    (m, p1, p2, p3) => p1 + target + p3,
    'version.json 的 "version"');
edits.push({ file: 'version.json', label: 'version', from: current, to: target });
if (oldReleased) {
    verNext = replaceOnce(verNext,
        /("releasedAt"\s*:\s*")([^"]+)(")/,
        (m, p1, p2, p3) => p1 + today + p3,
        'version.json 的 "releasedAt"');
    // 同一天连发两版时日期本就无需改动 —— 那不是漏改，不该报，也不该列进改动清单
    if (oldReleased !== today) edits.push({ file: 'version.json', label: 'releasedAt', from: oldReleased, to: today });
}

let htmlNext = replaceOnce(htmlText,
    new RegExp("(window\\.__APP_VERSION__ = ')(" + VER + ")(')"),
    (m, p1, p2, p3) => p1 + target + p3,
    'index.html 的 window.__APP_VERSION__');
htmlNext = replaceOnce(htmlNext,
    new RegExp('(>版本 )(' + VER + ')(<)'),
    (m, p1, p2, p3) => p1 + target + p3,
    'index.html 页尾「版本 x.y.z」');
edits.push({ file: 'index.html', label: '__APP_VERSION__', from: sentry, to: target });
edits.push({ file: 'index.html', label: '页尾「版本 x.y.z」', from: footer, to: target });

// ---- 第五处：CHANGELOG ----
let chgNext = chgText;
let chgNote = '';
if (noChangelog) {
    chgNote = '已跳过（--no-changelog）';
} else if (!firstChg) {
    fail('CHANGELOG.md 里找不到「## [x.y.z] - YYYY-MM-DD」小节 —— 它是 release-metrics.js 的扫描对象，不能凭空造');
} else if (firstChg[1] === target) {
    chgNote = `首节已是 ${target}，无需改动（幂等）`;
} else if (firstChg[1] === current) {
    // 新的小节还没有 —— 插一个。验收基线三行从上一节继承，
    // 这样 release-metrics.js 扫描首节能立刻拿到三要素，preflight 不会报「解析不到」。
    const idx = chgText.search(/^## \[/m);
    const nextIdx = chgText.indexOf('\n## ', idx);
    const oldFirst = chgText.slice(idx, nextIdx === -1 ? chgText.length : nextIdx);
    // 三要素用 release-metrics.js 的同款正则去上一节里读 ——
    // 继承它认可的写法，新小节才不会被它判成「解析不到」
    const suites = oldFirst.match(/(\d+)\s*套件\s*(\d+)\s*(?:例|个)/);
    const gate = oldFirst.match(/verify:local`?\s*\**\s*(\d+)\s*\/\s*(\d+)/);
    const fp = oldFirst.match(/线上指纹\s*\**\s*(\d+)\s*项/);
    const block =
        `## [${target}] - ${today} - ${title}\n` +
        `\n` +
        `### 本次改动\n` +
        `\n` +
        `- （待补）\n` +
        `\n` +
        `### 验收\n` +
        `\n` +
        `- 单测 ${suites ? suites[1] : 'N'} 套件 ${suites ? suites[2] : 'N'} 例\n` +
        `- 门禁 verify:local ${gate ? gate[1] + '/' + gate[2] : 'N/N'}\n` +
        `- 线上指纹 ${fp ? fp[1] : 'N'} 项\n` +
        `\n---\n\n`;
    chgNext = chgText.slice(0, idx) + block + chgText.slice(idx);
    edits.push({ file: 'CHANGELOG.md', label: `新增首节 [${target}] - ${today}`, from: `（首节为 ${firstChg[1]}）`, to: '（本节）' });
    if (!suites && !gate && !fp) chgNote = '警告：上一节没读到验收基线，新小节的三要素写成了占位值，发版前要补齐';
} else {
    chgNote = `首节是 ${firstChg[1]}，既不是当前版本也不是目标版本 —— 为避免标错版本，已跳过`;
}

// ---- 输出 ----
console.log('');
console.log(`   ${current}  →  ${target}    (${mode})`);
console.log('');
edits.forEach((e, i) => {
    console.log(`   [${i + 1}] ${e.file.padEnd(14)} ${e.label}: ${e.from} → ${e.to}`);
});
if (chgNote) console.log(`\n    CHANGELOG：${chgNote}`);

if (dryRun) {
    console.log('\n   --dry-run：以上只是预览，没有写入任何文件。\n');
    process.exit(0);
}

fs.writeFileSync(files.pkg, pkgNext, 'utf8');
fs.writeFileSync(files.ver, verNext, 'utf8');
fs.writeFileSync(files.html, htmlNext, 'utf8');
if (chgNext !== chgText) fs.writeFileSync(files.changelog, chgNext, 'utf8');

console.log('\n   已写入。下一步：npm run verify:release —— 它会当场校验五处一致，漏改即红。\n');
