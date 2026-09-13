#!/usr/bin/env node
/**
 * 发版前自检 —— `npm run verify:release [-- --write]`
 *
 * 一条命令把「发版时最容易漏、且漏了不报错」的三件事摆到面前：
 *   1. 版本号五处落点（package.json / __APP_VERSION__ / 关于弹窗 / version.json / CHANGELOG）
 *      —— 漏改一处的体感是「用户每次新会话都清一次缓存」，从反馈里几乎定位不到
 *   2. 文档口径 vs 实测（套件/用例数、门禁断言数、线上指纹数在 6 处文档里人肉同步）
 *      —— 数字漂移是「对外承诺的验证强度」与实现对不上，比测试失败更难发现
 *   3. 口径自动同步：`--write` 只改「当前声明值」，CHANGELOG 里「20 套件 412 例 → **25 套件 537 例**」
 *      这类历史值不会被误改；默认 dry-run，先看清要改什么再写
 *
 * 与单测的分工：`npm test` 里的 tests/version-sync.test.js 与 tests/docs-metrics.test.js 是**门禁**
 * （不一致即红，谁也不能跳过）；本脚本是**人类可读的发版前自查 + 自动改数字**，
 * 口径定义与单测共用 tools/ops/release-metrics.js，不存在第三份事实。
 *
 * 退出码：0 = 全部一致；1 = 有需要处理的项（版本不一致 / 文档口径与实测不符 / 门禁指纹数需人工确认）。
 */
'use strict';
const { measureCounts, checkMetrics, checkVersionSpots, syncMetricNumbers } = require('./release-metrics.js');

const write = process.argv.slice(2).includes('--write');
const pad = (s, n) => String(s).padEnd(n, ' ');
let failed = false;

console.log('\n=== 1/3 版本号五处落点 ===');
const vr = checkVersionSpots();
vr.info.spots.forEach((s) => {
    const ok = s.value === vr.info.version;
    console.log(`  ${ok ? '[OK]' : '[!!]'} ${pad(s.label, 36)} ${pad(s.value || '(缺失)', 10)} ${s.file}:${s.line}`);
});
console.log(`  权威发布日 releasedAt = ${vr.info.releasedAt}（须与 CHANGELOG 该版标题日期同日）`);
vr.issues.forEach((i) => console.error(`  [FAIL] ${i}`));
if (vr.issues.length) failed = true;

console.log('\n=== 2/3 文档口径 vs 实测 ===');
const before = measureCounts();
const mr = checkMetrics();
console.log(`  实测：${before.suiteFiles} 套件 ${before.testCases} 例（tests/**/*.test.js）`);
mr.claims.units.forEach((c) => {
    const ok = c.suite === before.suiteFiles && c.cases === before.testCases;
    console.log(`  ${ok ? '[OK]' : '[!!]'} ${pad(c.file, 40)} 声明 ${c.suite} 套件 ${c.cases} 例  @${c.line}`);
});
console.log(`  门禁 verify:local 声明 ${mr.claims.gate.map((c) => c.value).join(' / ')} 项`
    + `（脚本内文本断言 ${before.verifyLocalTextAssertions} —— 真实项数须以 verify:local 实跑输出为准）`);
console.log(`  线上指纹声明 ${mr.claims.fingerprints.map((c) => c.value).join(' / ')} 项`
    + `（ops-check-prod.ps1 文本断言 ${before.opsCheckTextAssertions} —— 真实项数须以实跑输出为准）`);

console.log('\n=== 3/3 口径自动同步 ===');
const sync = syncMetricNumbers({ write });
if (!sync.changes.length) {
    console.log('  无需同步（套件/用例数文档口径与实测一致）');
} else {
    sync.changes.forEach((c) => console.log(`  ${write ? '[已写入]' : '[待写入]'} ${c.file}:${c.line}  ${c.from} → ${c.to}`));
    if (!write) console.log('  → 加 --write 实际写入；门禁/指纹项数请实跑核对后手工同步');
}

// --write 后复检：门禁/指纹这类无法离线推导的项若仍不一致，必须人工处理
const after = write ? checkMetrics() : mr;
if (after.issues.length) {
    failed = true;
    console.error('\n仍需处理的口径问题：');
    after.issues.forEach((i) => console.error(`  [FAIL] ${i}`));
}

console.log(`\n结论：${failed ? '未通过（见上方 [FAIL]）' : '通过 —— 版本五处一致、文档口径与实测一致'}\n`);
process.exit(failed ? 1 : 0);
