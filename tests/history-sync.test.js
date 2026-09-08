// 阶段10A：云同步引擎纯函数单测（幂等 / 冲突新者胜 / 墓碑 / 合并拉回）
const { loadSource } = require('./helpers/load-source.js');

loadSource('src/js/auth/plan.js');
loadSource('src/js/data/history-sync.js');

const pure = () => window.EuriskoSync.pure;

const t = (iso) => new Date(iso).toISOString();

beforeEach(() => {
    try {
        localStorage.clear();
    } catch (e) { /* 忽略 */ }
});

describe('normalize 本地记录规范化', () => {
    test('旧数据（无 updatedAt）回退到 date', () => {
        const out = pure().normalize([{ id: 'a1', type: 'forward', date: '2026-01-05T08:00:00.000Z' }]);
        expect(out).toHaveLength(1);
        expect(out[0].updatedAt).toBe('2026-01-05T08:00:00.000Z');
    });

    test('缺 id 记录丢弃，重复 id 去重', () => {
        const out = pure().normalize([
            { type: 'business', date: '2026-01-01T00:00:00.000Z' },           // 无 id
            { id: 'x', type: 'forward', date: '2026-01-01T00:00:00.000Z' },    // 与下重复
            { id: 'x', type: 'reverse', date: '2026-01-02T00:00:00.000Z' }
        ]);
        expect(out).toHaveLength(1);
        expect(out[0].type).toBe('forward');
    });

    test('非数组输入安全返回空数组', () => {
        expect(pure().normalize(null)).toEqual([]);
        expect(pure().normalize('oops')).toEqual([]);
    });
});

describe('toPayload 上行组装', () => {
    test('forward 映射为云端 comprehensive；data 快照携带 title/date/results', () => {
        const { push } = pure().toPayload([
            { id: 'a1', type: 'forward', title: '综合所得 - 2026/1/1', date: '2026-01-01T00:00:00.000Z', results: { tax: 100 }, updatedAt: '2026-01-01T00:00:00.000Z' }
        ], {});
        expect(push).toHaveLength(1);
        expect(push[0].type).toBe('comprehensive');
        expect(push[0].data.title).toBe('综合所得 - 2026/1/1');
        expect(push[0].data.results).toEqual({ tax: 100 });
        expect(push[0].updatedAt).toBe('2026-01-01T00:00:00.000Z');
    });

    test('墓碑只广播云端已知 clientId；本地活跃 id 不出现在墓碑中', () => {
        const { push } = pure().toPayload(
            [{ id: 'live1', type: 'business', updatedAt: '2026-01-01T00:00:00.000Z' }],
            {
                cloudIds: ['gone1', 'gone2'],
                tombstones: [
                    { clientId: 'gone1', deletedAt: '2026-01-03T00:00:00.000Z' },
                    { clientId: 'never-synced', deletedAt: '2026-01-03T00:00:00.000Z' }, // 云端未知 → 过滤
                    { clientId: 'live1', deletedAt: '2026-01-03T00:00:00.000Z' }        // 本地复活 → 过滤
                ]
            }
        );
        const tombstones = push.filter((p) => p.deletedAt);
        expect(tombstones).toHaveLength(1);
        expect(tombstones[0].clientId).toBe('gone1');
        expect(tombstones[0].type).toBeTruthy();
    });
});

describe('mergeCloud 云端合并', () => {
    const localItem = (over) => ({
        id: 'a1', type: 'forward', title: '本地标题', date: '2026-01-01T00:00:00.000Z',
        results: { tax: 100 }, updatedAt: '2026-01-01T00:00:00.000Z', ...(over || {})
    });

    test('云端不旧于本地 → 云端覆盖（幂等重放不回抖）', () => {
        const { history } = pure().mergeCloud(
            [localItem()],
            { cloudIds: ['a1'], tombstones: [] },
            { records: [{ clientId: 'a1', type: 'comprehensive', data: { title: '云端标题', date: '2026-01-01T00:00:00.000Z', results: { tax: 200 } }, updatedAt: '2026-01-02T00:00:00.000Z' }], deletedClientIds: [] }
        );
        expect(history).toHaveLength(1);
        expect(history[0].title).toBe('云端标题');
        expect(history[0].results).toEqual({ tax: 200 });
        expect(history[0].type).toBe('forward'); // comprehensive → forward 反向映射
    });

    test('本地较新 → 保留本地（下次 push 再覆盖云端）', () => {
        const { history } = pure().mergeCloud(
            [localItem({ updatedAt: '2026-01-05T00:00:00.000Z' })],
            { cloudIds: ['a1'], tombstones: [] },
            { records: [{ clientId: 'a1', type: 'comprehensive', data: { title: '旧云端', results: { tax: 1 } }, updatedAt: '2026-01-02T00:00:00.000Z' }], deletedClientIds: [] }
        );
        expect(history[0].title).toBe('本地标题');
        expect(history[0].updatedAt).toBe('2026-01-05T00:00:00.000Z');
    });

    test('云端新增记录拉回本地（新设备/重装找回）', () => {
        const { history } = pure().mergeCloud(
            [],
            { cloudIds: [], tombstones: [] },
            { records: [{ clientId: 'c9', type: 'reverse', data: { title: '反算单', results: { tax: 88 } }, updatedAt: '2026-01-04T00:00:00.000Z' }], deletedClientIds: [] }
        );
        expect(history).toHaveLength(1);
        expect(history[0].id).toBe('c9');
        expect(history[0].type).toBe('reverse');
        expect(history[0].title).toBe('反算单');
    });

    test('deletedClientIds 删除本地记录并清除对应墓碑', () => {
        const { history, meta } = pure().mergeCloud(
            [localItem()],
            { cloudIds: ['a1'], tombstones: [{ clientId: 'a1', deletedAt: '2026-01-03T00:00:00.000Z' }] },
            { records: [], deletedClientIds: ['a1'] }
        );
        expect(history).toHaveLength(0);
        expect(meta.tombstones).toHaveLength(0);
        expect(meta.cloudIds).toEqual([]);
    });

    test('云端空回包（空账号）不清空本端尚未同步记录', () => {
        const { history } = pure().mergeCloud(
            [localItem()],
            { cloudIds: [], tombstones: [] },
            { records: [], deletedClientIds: [] }
        );
        expect(history).toHaveLength(1);
        expect(history[0].title).toBe('本地标题');
    });
});

describe('云同步运行时常量', () => {
    test('事件名与 key 约定存在', () => {
        expect(pure().MUTATION_EVENT).toBe('euriskotax:history-mutated');
        expect(pure().SYNCED_EVENT).toBe('euriskotax:history-synced');
        expect(pure().STATUS_EVENT).toBe('euriskotax:sync-status');
    });
});
