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
//   - 项数声明的身份靠**版本前缀**判定（2026-09-13 加固）：非当前口径必须带 vX.Y.Z / [X.Y.Z]
//     （同一行或所在 `## ` 小节标题）才算历史基线，否则就是漏改的旧口径
//
// 顺带守住一个反例：既然口径已一致，`verify:release --write` 的 dry-run 必须是空操作。
const {
    checkMetrics, measureCounts, syncMetricNumbers, readRecordedGateRun,
    GATE_PATTERNS, findStaleMentions, anchorInfo,
} = require('../tools/ops/release-metrics.js');

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

    test('门禁项数：与最近一次 verify:local 实跑项数一致（有实跑快照时）', () => {
        const recorded = readRecordedGateRun();
        if (!recorded) return;   // 本机还没跑过门禁：没有证据就不假装有，跳过
        const r = checkMetrics();
        const declared = Array.from(new Set(r.claims.gate.map((c) => c.value)));
        expect(declared).toEqual([recorded.total]);
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

// 文档登记守护（2026-09-17）
//
// 背景：2026-09-16 / 09-17 新增的两份 UI 方案（`ui-ux-master-plan.md` / `dual-end-ui-plan.md`）
// **从未被登记进 `docs/README.md`** —— 该索引最后更新停在 09-14，早于它们的创建日。
// 后果不是报错，而是「想要的东西存在，但必须一层层点链接才找得到」：
// 唯一入口变成被别的文档引用，文档之间越套越深，没人敢删也没人找得到。
//
// 这里把「新增文档必须登记」从口头纪律变成会红的断言 —— 否则下一次还是会漏。
describe('docs 索引登记不能有遗漏', () => {
    const fs = require('fs');
    const path = require('path');
    const DOCS_ROOT = path.resolve(__dirname, '../docs');
    const readme = () => fs.readFileSync(path.join(DOCS_ROOT, 'README.md'), 'utf8');

    function docsMarkdowns() {
        const files = [];
        (function walk(dir) {
            fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
                const full = path.join(dir, e.name);
                if (e.isDirectory()) walk(full);
                else if (e.name.endsWith('.md')) files.push(path.relative(DOCS_ROOT, full).replace(/\\/g, '/'));
            });
        })(DOCS_ROOT);
        return files.filter((f) => f !== 'README.md');
    }

    test('docs 下每个 .md 都能在 docs/README.md 里找到（新增文档必须登记）', () => {
        const content = readme();
        const unlisted = docsMarkdowns().filter((rel) => !content.includes(rel));
        expect(unlisted).toEqual([]);
    });

    test('至少扫到了足够多的文档（防目录改名后断言空转）', () => {
        expect(docsMarkdowns().length).toBeGreaterThan(20);
    });
});

// 旧口径残留防护（2026-09-13 加固）
//
// 旧实现只校验「每份文件里数值最大的那一条」项数声明，同文件内其余出现既不校验、也不要求版本前缀 ——
// 只要旧口径不写得比当前值大，就能永久骗过断言（上一版在 ops-verify-pg.ps1 / gui-dev-console.ps1 /
// development-workflow.md 里的 10 处「152 项 / 156 项」残留，全靠人工 grep 才捞出来）。
// 现在：非当前口径的每条命中都必须带版本前缀自证是历史基线，否则判为「疑似旧口径残留」。
describe('旧口径残留防护（版本前缀约束）', () => {
    const VERSION = '1.17.0';
    const opts = (extra) => Object.assign(
        { version: VERSION, history: true, isCurrent: (h) => h.nums[0] === 165 },
        extra
    );
    const fakeHitAt = (text, needle) => ({ index: text.indexOf(needle), raw: needle });

    test('没带版本前缀的旧口径会被逐条抓出来（旧实现只看最大值，这条永远漏）', () => {
        const text = '> 门禁基线：**verify:local 165 项**\n\n别处遗留：本地门禁 `verify:local` 152/152 全绿\n';
        expect(findStaleMentions(text, GATE_PATTERNS, opts()).map((h) => h.nums[0])).toEqual([152]);
    });

    test('同一行带版本前缀的历史基线合法', () => {
        const text = '（阶段13 随 v1.12.0 上线）本地门禁 `verify:local` 100/100 全绿\n';
        expect(findStaleMentions(text, GATE_PATTERNS, opts())).toEqual([]);
    });

    test('所在 `## ` 小节标题带版本号的历史基线合法（CHANGELOG 旧版本条目写法）', () => {
        const text = '## [1.15.0] - 2026-08-01\n\n> 门禁基线：verify:local 156/156 全绿\n';
        expect(findStaleMentions(text, GATE_PATTERNS, opts())).toEqual([]);
    });

    test('非 history 落点不接受历史值：即使带版本前缀也判为残留', () => {
        const text = '（阶段13 随 v1.12.0 上线）本地门禁 `verify:local` 100/100 全绿\n';
        expect(findStaleMentions(text, GATE_PATTERNS, opts({ history: false })).length).toBe(1);
    });

    test('增量描述（新增/移除 N 项）不是总项数，不判为残留', () => {
        const text = '本版新增：移除 6 项静态断言；新增「城市改在留资里」5 项 + 「经营页」1 项断言。\n';
        const stale = findStaleMentions(text, GATE_PATTERNS, opts());
        expect(stale.filter((h) => h.nums[0] === 1 || h.nums[0] === 6)).toEqual([]);
    });

    test('anchorInfo：当前版本与历史版本的标注可区分（选取当前口径不再靠「取最大」）', () => {
        const now = '## [1.17.0] - 2026-09-13\n\n> 门禁基线：verify:local 165/165 全绿\n';
        const old = '## [1.15.0] - 2026-08-01\n\n> 门禁基线：verify:local 156/156 全绿\n';
        expect(anchorInfo(now, fakeHitAt(now, 'verify:local'), VERSION)).toEqual({ anchored: true, current: true });
        expect(anchorInfo(old, fakeHitAt(old, 'verify:local'), VERSION)).toEqual({ anchored: true, current: false });
    });
});
