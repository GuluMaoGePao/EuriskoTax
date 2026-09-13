// 文档口径守护 —— 「文档里写的验证强度」必须等于「仓库里实际有的验证强度」
//
// 背景：单测套件/用例数、门禁断言数、线上指纹数散落在 6 处 README/文档里，改动后靠人肉手改。
// 数字漂移的后果不是报错，而是**对外承诺与实现对不上**：低报（说 537 实际 544）让人怀疑测试是否真跑，
// 高报（说 142 项实际 100 项）则是虚报验证强度 —— 两种都比测试失败更难发现。
//
// 这里把可静态推导的部分变成断言（口径定义集中在 tools/ops/release-metrics.js）：
//   - 套件数 = tests/**/*.test.js 文件数（jest testMatch 同口径）
//   - 用例数 = 测试文件里「行首 test(」个数（与 jest 实测核对一致）
//   - 门禁/指纹项数无法离线推导（脚本含 catch 分支回退断言），只夹逼「文档彼此一致 + 不超过脚本文本断言数」
//
// 顺带守住一个反例：既然口径已一致，`verify:release --write` 的 dry-run 必须是空操作。
const { checkMetrics, measureCounts, syncMetricNumbers } = require('../tools/ops/release-metrics.js');

describe('文档口径与实测一致', () => {
    test('所有口径落点都能解析出当前声明（措辞被改写时在这里指名文件）', () => {
        const r = checkMetrics();
        const unparsed = r.issues.filter((i) => i.includes('解析不到'));
        expect(unparsed).toEqual([]);
        // 至少要覆盖：README、docs/README、development-workflow、development-plan、CHANGELOG
        expect(r.claims.units.length).toBeGreaterThanOrEqual(5);
        expect(r.claims.gate.length).toBeGreaterThanOrEqual(5);
        expect(r.claims.fingerprints.length).toBeGreaterThanOrEqual(3);
        r.claims.units.concat(r.claims.gate, r.claims.fingerprints).forEach((c) => {
            expect({ file: c.file, hasLine: c.line > 0 }).toEqual({ file: c.file, hasLine: true });
        });
    });

    test('套件数与用例数与实测一致（新加测试文件/用例后必须同步文档）', () => {
        const r = checkMetrics();
        const m = measureCounts();
        expect(m.suiteFiles).toBeGreaterThan(0);
        expect(m.testCases).toBeGreaterThanOrEqual(m.suiteFiles);
        // 各落点声明值已由 checkMetrics 逐条比对，这里只暴露「谁不一致」
        const drift = r.claims.units.filter((c) => c.suite !== m.suiteFiles || c.cases !== m.testCases);
        expect(drift).toEqual([]);
    });

    test('门禁与线上指纹项数：文档彼此一致，且不超过脚本内文本断言数（虚报上界）', () => {
        const r = checkMetrics();
        const m = measureCounts();
        expect(Array.from(new Set(r.claims.gate.map((c) => c.value))).length).toBe(1);
        expect(Array.from(new Set(r.claims.fingerprints.map((c) => c.value))).length).toBe(1);
        expect(r.claims.gate[0].value).toBeLessThanOrEqual(m.verifyLocalTextAssertions);
        expect(r.claims.fingerprints[0].value).toBeLessThanOrEqual(m.opsCheckTextAssertions);
    });

    test('口径已一致时，自动同步（--write）的 dry-run 为空操作', () => {
        const dry = syncMetricNumbers();
        expect(dry.written).toBe(false);
        expect(dry.changes).toEqual([]);
    });

    test('checkMetrics 整体判定为通过（任一问题都会在这里汇总暴露）', () => {
        const r = checkMetrics();
        expect(r.issues).toEqual([]);
        expect(r.ok).toBe(true);
    });
});
