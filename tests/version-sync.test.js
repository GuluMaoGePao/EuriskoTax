// 版本号「五处同步」守护 —— 把发版纪律变成断言，漏改在 npm test 当场变红
//
// 为什么值得一个单测：线上版本哨兵 StaleGuard 会以 cache:'no-store' 拉 /version.json，
// 与本页 window.__APP_VERSION__ 比对，不一致就自动注销 SW + 清空 Cache Storage + 重载。
// 漏改一处的用户体感是「每次新会话都闪一下」，而不是报错 —— 从反馈里几乎定位不到，
// 所以排障表里那条「某用户每次进站都闪一下 → 版本落点漏改」才会出现。
//
// 现有拦截在 push 之后（ops-check-prod 的线上版本比对）。本套件把同一份纪律提前到本地：
// 改版本号时五处任一漏改，本地就红，不必推到线上再回滚。
// 五处口径见 docs/guides/development-workflow.md §2④；落点定义集中在 tools/ops/release-metrics.js
// （同一份定义也供 npm run verify:release 使用，避免第三份事实）。
const fs = require('fs');
const path = require('path');
const { readVersionSpots, checkVersionSpots } = require('../tools/ops/release-metrics.js');

const INDEX_HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const info = readVersionSpots();

describe('版本号五处同步（发版纪律的可执行版本）', () => {
    test('五处落点都能解析出版本号（结构性改动也在这里暴露）', () => {
        expect(info.version).toMatch(/^\d+\.\d+\.\d+$/);
        expect(info.spots).toHaveLength(5);
        const missing = info.spots.filter((s) => !s.value).map((s) => s.label);
        expect(missing).toEqual([]);
        info.spots.forEach((s) => expect(s.line).toBeGreaterThan(0));
    });

    test('五处版本号完全一致（报错直接指出是哪个落点）', () => {
        const drift = info.spots.filter((s) => s.value !== info.version)
            .map((s) => `${s.file}:${s.line} ${s.label}=${s.value}`);
        expect(drift).toEqual([]);
    });

    test('version.json releasedAt 是唯一权威发布日：与 CHANGELOG 该版同日且不晚于今天', () => {
        const r = checkVersionSpots();
        expect(r.issues).toEqual([]);
        const m = info.changelog.match(new RegExp('## \\[' + info.version.replace(/\./g, '\\.') + '\\] - (\\d{4}-\\d{2}-\\d{2})'));
        expect(m).not.toBeNull();
        expect(m[1]).toBe(info.releasedAt);
    });

    test('发版注释指向五处，不再只说「两处」（照着两处做必漏 package.json / 关于弹窗 / CHANGELOG）', () => {
        const comment = (INDEX_HTML.match(/<!--\s*版本哨兵：[\s\S]*?-->/) || [''])[0];
        expect(comment).toContain('五处');
        expect(comment).not.toContain('两处');
        // 注释要能直接告诉改代码的人「谁来兜底」，而不是只留一句要求
        expect(comment).toContain('tests/version-sync.test.js');
    });
});
