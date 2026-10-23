// 发布台账的判定逻辑必须钉住（2026-10-24 新增）
//
// 为什么需要它：beta（预发）上线后，同一个版本有了「本地 / 预发 / 正式」三个状态，
// 靠人脑同步三者必然漂移，而漂移的后果是**发错环境**。这个文件的价值不在覆盖代码，
// 在于把两类会**静默失效**的情况钉成会红的断言：
//   ① 预发落后于正式 —— 此时 beta 已不是「提前一步」，拿它验收等于拿旧版本验收；
//   ② 线上跑着的版本没归档进 CHANGELOG —— 漏归档，或有人绕过流程直接发了。
const { compareVersion, parseChangelogVersions, buildStatus, renderMarkdown } = require('../tools/ops/release-status.js');

const CHANGELOG_SAMPLE = [
    '> 顶部说明，不是版本行',
    '## [1.149.2] - 2026-10-23 - 修掉部署窗口弹 localhost 提示',
    '正文',
    '## [1.149.1] - 2026-10-23 - beta 域名',
    '## [1.149.0] - 2026-10-22 - 补上 beta 环境',
].join('\n');

describe('版本号比较（字符串比较会得出 1.9.0 > 1.10.0，必须按段比数字）', () => {
    test('1.9.0 < 1.10.0', () => {
        expect(compareVersion('1.9.0', '1.10.0')).toBe(-1);
        expect(compareVersion('1.10.0', '1.9.0')).toBe(1);
    });

    test('相等与缺省段', () => {
        expect(compareVersion('1.149.2', '1.149.2')).toBe(0);
        expect(compareVersion('1.2', '1.2.0')).toBe(0);
    });
});

describe('CHANGELOG 版本清单解析', () => {
    test('只认 ## [X.Y.Z] - 日期 这一种写法，顺序为新的在前', () => {
        const list = parseChangelogVersions(CHANGELOG_SAMPLE);
        expect(list.map((v) => v.version)).toEqual(['1.149.2', '1.149.1', '1.149.0']);
        expect(list[0].date).toBe('2026-10-23');
    });

    test('空输入不会崩', () => {
        expect(parseChangelogVersions('')).toEqual([]);
    });
});

describe('版本在预发 / 正式的状态判定', () => {
    const versions = parseChangelogVersions(CHANGELOG_SAMPLE);

    test('本地比预发新 → 还没发预发，下一步是发 beta', () => {
        const s = buildStatus({ versions, local: '1.149.3', beta: '1.149.2', prod: '1.149.1' });
        expect(s.conclusion).toContain('还没发到预发');
        expect(s.rows[0].version).toBe('1.149.2');
        expect(s.rows[0].beta).toBe('✅');
        expect(s.rows[0].prod).toBe('—');
    });

    test('预发已就位、正式还差一版 → 待发正式', () => {
        const s = buildStatus({ versions, local: '1.149.2', beta: '1.149.2', prod: '1.149.1' });
        expect(s.conclusion).toContain('待发正式');
        expect(s.rows[0]).toMatchObject({ version: '1.149.2', beta: '✅', prod: '—' });
        expect(s.rows[1]).toMatchObject({ version: '1.149.1', beta: '✅', prod: '✅' });
    });

    test('两站都是最新版 → 已全量，无告警', () => {
        const s = buildStatus({ versions, local: '1.149.2', beta: '1.149.2', prod: '1.149.2' });
        expect(s.conclusion).toContain('已全量');
        expect(s.warnings).toEqual([]);
    });

    test('预发落后于正式 → 报警（beta 已失去提前一步的意义）', () => {
        const s = buildStatus({ versions, local: '1.149.2', beta: '1.149.0', prod: '1.149.2' });
        const w = s.warnings.join('\n');
        expect(w).toContain('落后于正式');
        expect(w).toContain('1.149.0');
    });

    test('线上版本没归档进 CHANGELOG → 报警（漏归档或绕过流程）', () => {
        const s = buildStatus({ versions, local: '1.149.2', beta: '1.149.2', prod: '1.148.9' });
        expect(s.warnings.join('\n')).toContain('不在 CHANGELOG');
    });

    test('读不到预发版本 → 提示补凭据，而不是误判成「没发」', () => {
        const s = buildStatus({ versions, local: '1.149.2', beta: null, prod: '1.149.1' });
        expect(s.warnings.join('\n')).toContain('读不到预发站版本');
        expect(s.rows[0].beta).toBe('—');
    });

    test('渲染出的表格含三列事实来源，便于直接贴进台账', () => {
        const md = renderMarkdown(buildStatus({ versions, local: '1.149.2', beta: '1.149.2', prod: '1.149.1' }));
        expect(md).toContain('| 版本 | 归档日 | 预发 beta | 正式 |');
        expect(md).toContain('1.149.2');
        expect(md).toContain('**当前结论**');
    });
});
