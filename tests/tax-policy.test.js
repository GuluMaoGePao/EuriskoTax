// 阶段11：内容中心「更新同步」单测
//   政策要点对全体用户开放（含未登录游客）+ revision 增量 + 覆盖层缓存重放 + feed 展示位查询
const { loadSource } = require('./helpers/load-source.js');

loadSource('src/js/auth/plan.js');
loadSource('src/js/data/tax-assistant.js'); // 提供 window.TAX_ASSISTANT_QA（内置快照全量）
loadSource('src/js/data/tax-policy.js');

const policy = () => window.TaxPolicy;
const baseCount = () => (window.TAX_ASSISTANT_QA || []).length;
const findIt = (id) => (window.TAX_ASSISTANT_QA || []).find((it) => it.id === id);

const mockFetchOk = (payload) => {
    global.fetch = jest.fn(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: payload })
    }));
};

// 按 URL 分派的 fetch 桩（同时支持 /tax-policy 与 /feed）
const mockFetchRoutes = (routes) => {
    global.fetch = jest.fn((url) => {
        const key = Object.keys(routes).find((k) => String(url).indexOf(k) !== -1);
        if (!key) return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: routes[key] }) });
    });
};

beforeEach(() => {
    try { localStorage.clear(); } catch (e) { /* ignore */ }
    try { sessionStorage.clear(); } catch (e) { /* ignore */ }
    if (window.TaxPolicy) window.TaxPolicy.clearState();
    // 重置内置快照，隔离用例间对 TAX_ASSISTANT_QA 的修改
    loadSource('src/js/data/tax-assistant.js');
});

afterEach(() => {
    delete global.fetch;
});

describe('阶段11 - 全员同步（政策要点不再专业版专属）', () => {
    test('未登录游客 → 仍发起请求，且不带 Authorization 头', async () => {
        mockFetchOk({ version: 'V1', revision: 'r1', notice: '', items: [] });
        await policy().syncNow();
        expect(global.fetch).toHaveBeenCalledTimes(1);
        const opts = global.fetch.mock.calls[0][1];
        expect(opts.headers.Authorization).toBeUndefined();
    });

    test('已登录 → 携带 Bearer token（服务端据此按档位分层返回）', async () => {
        sessionStorage.setItem('auth_token', 'tok-123');
        mockFetchOk({ version: 'V1', revision: 'r1', notice: '', items: [] });
        await policy().syncNow();
        expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer tok-123');
    });

    test('triggerSync 同时同步政策要点与公告 feed', async () => {
        mockFetchRoutes({
            '/tax-policy': { version: 'V1', revision: 'r1', notice: '', items: [] },
            '/feed': { version: 'V1', revision: 'f1', items: [] }
        });
        await policy().triggerSync();
        const urls = global.fetch.mock.calls.map((c) => String(c[0]));
        expect(urls.some((u) => u.indexOf('/tax-policy') !== -1)).toBe(true);
        expect(urls.some((u) => u.indexOf('/feed') !== -1)).toBe(true);
    });

    test('无 fetch 环境（非浏览器）安全降级', async () => {
        delete global.fetch;
        const out = await policy().syncNow();
        expect(out).toEqual({ updated: false, reason: 'no-fetch' });
    });

    test('请求失败 → 返回 error 且不影响后续调用', async () => {
        global.fetch = jest.fn(() => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) }));
        const out = await policy().syncNow();
        expect(out.updated).toBe(false);
        expect(out.reason).toBe('error');
    });
});

describe('阶段11 - revision 增量与新鲜期', () => {
    test('缓存指纹新鲜 → 请求携带 since=<revision>', async () => {
        localStorage.setItem('taxPolicyCache', JSON.stringify({
            version: 'V1', revision: 'rev-1', notice: '', checkedAt: new Date().toISOString(), overrides: []
        }));
        mockFetchOk({ version: 'V1', revision: 'rev-1', notice: '', items: [] });
        await policy().syncNow();
        expect(String(global.fetch.mock.calls[0][0])).toContain('since=rev-1');
    });

    test('缓存超过新鲜期 → 强制全量（不带 since，保证自动过期/撤回生效）', async () => {
        const stale = new Date(Date.now() - (policy().STALE_MS + 60000)).toISOString();
        localStorage.setItem('taxPolicyCache', JSON.stringify({
            version: 'V1', revision: 'rev-1', notice: '', checkedAt: stale, overrides: []
        }));
        mockFetchOk({ version: 'V1', revision: 'rev-1', notice: '', items: [] });
        await policy().syncNow();
        expect(String(global.fetch.mock.calls[0][0])).not.toContain('since=');
    });

    test('指纹一致（items 空）→ 无更新，仅推进缓存', async () => {
        mockFetchOk({ version: 'V1', revision: 'rev-1', notice: '说明', items: [] });
        const out = await policy().syncNow();
        expect(out.updated).toBe(false);
        expect(out.reason).toBe('no-change');
        expect(policy().getCache().version).toBe('V1');
        expect(policy().getCache().revision).toBe('rev-1');
    });
});

describe('阶段11 - 覆盖层合并与缓存重放', () => {
    test('版本前进且有新条目 → 合并进内置快照、写缓存并广播事件', async () => {
        const listener = jest.fn();
        document.addEventListener(policy().EVENT_UPDATED, listener);
        const before = baseCount();
        mockFetchOk({
            version: '2026.09.11-1',
            revision: 'rev-new',
            notice: '专项附加扣除填报提醒',
            publishedAt: '2026-09-11',
            items: [{ id: 'notice-new-1', category: '政策法规', question: '新政策？', answer: '是的。', tag: 'policy-point', updatedAt: '2026-09-01' }]
        });
        const out = await policy().syncNow();
        expect(out.updated).toBe(true);
        expect(baseCount()).toBe(before + 1);
        expect(findIt('notice-new-1')).toBeTruthy();
        expect(policy().getCache().version).toBe('2026.09.11-1');
        expect(policy().getCache().notice).toContain('专项附加');
        expect(policy().getCache().overrides).toHaveLength(1);
        expect(listener).toHaveBeenCalledTimes(1);
        document.removeEventListener(policy().EVENT_UPDATED, listener);
    });

    test('覆盖同 id 内置条目 → 字段以远端为准且数量不变', () => {
        const first = window.TAX_ASSISTANT_QA[0];
        expect(first).toBeTruthy();
        const before = baseCount();
        const count = policy().applyUpdates([{ id: first.id, tag: 'policy-point', category: '政策法规' }]);
        expect(count).toBe(1);
        expect(baseCount()).toBe(before);
        expect(findIt(first.id).tag).toBe('policy-point');
    });

    test('deleted:true 撤回内置条目', () => {
        const target = window.TAX_ASSISTANT_QA[1];
        const id = target && target.id;
        if (!id) return;
        const before = baseCount();
        policy().applyUpdates([{ id: id, deleted: true }]);
        expect(baseCount()).toBe(before - 1);
        expect(findIt(id)).toBeUndefined();
    });

    test('远端删除条目 → 全量载荷不含它时覆盖层被整体替换（不残留）', async () => {
        mockFetchOk({
            version: 'V1', revision: 'r1',
            items: [{ id: 'keep-1', question: 'q', answer: 'a' }, { id: 'drop-1', question: 'q2', answer: 'a2' }]
        });
        await policy().syncNow();
        expect(findIt('keep-1')).toBeTruthy();
        expect(findIt('drop-1')).toBeTruthy();
        // 第二轮：服务端不再返回 drop-1（已删除）
        mockFetchOk({ version: 'V2', revision: 'r2', items: [{ id: 'keep-1', question: 'q', answer: 'a' }] });
        await policy().syncNow();
        expect(findIt('keep-1')).toBeTruthy();
        expect(findIt('drop-1')).toBeUndefined();
        expect(policy().getCache().overrides).toHaveLength(1);
    });

    test('非法输入安全返回 0', () => {
        expect(policy().applyUpdates(null)).toBe(0);
        expect(policy().applyUpdates('oops')).toBe(0);
    });

    test('刷新重放：模块初始化时恢复缓存中的覆盖层（修复阶段10B 刷新丢内容）', () => {
        const first = window.TAX_ASSISTANT_QA[0];
        localStorage.setItem('taxPolicyCache', JSON.stringify({
            version: 'V9', revision: 'r9', notice: '', publishedAt: null,
            checkedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), updatedCount: 2,
            overrides: [{ id: first.id, answer: '远端答案-重放验证' }, { id: 'replay-new-1', question: 'q', answer: 'a' }]
        }));

        loadSource('src/js/data/tax-assistant.js'); // 模拟刷新：重置内置快照
        loadSource('src/js/data/tax-policy.js');    // 重新执行模块 → 触发 replay

        expect(findIt('replay-new-1')).toBeTruthy();
        expect(findIt(first.id).answer).toBe('远端答案-重放验证');
    });
});

describe('阶段11 - feed 展示位', () => {
    const feedItems = [
        { id: 'n-home', type: 'announcement', placements: ['home_banner'], title: '首页公告', summary: 's1', publishedAt: '2026-09-10T00:00:00.000Z', updatedAt: 'u1', priority: 1 },
        { id: 'n-modal', type: 'announcement', placements: ['modal', 'notice_list'], title: '启动弹窗', summary: 's2', publishedAt: '2026-09-11T00:00:00.000Z', updatedAt: 'u2', priority: 5 },
        { id: 'n-op', type: 'operation', placements: ['home_banner'], title: '运营活动', summary: 's3', publishedAt: '2026-09-12T00:00:00.000Z', updatedAt: 'u3', priority: 9 }
    ];

    test('syncFeed 落缓存并广播 feed 事件', async () => {
        const listener = jest.fn();
        document.addEventListener(policy().EVENT_FEED, listener);
        mockFetchRoutes({ '/feed': { version: 'V1', revision: 'f1', items: feedItems } });
        const out = await policy().syncFeed();
        expect(out.count).toBe(3);
        expect(listener).toHaveBeenCalledTimes(1);
        document.removeEventListener(policy().EVENT_FEED, listener);
    });

    test('getFeed 按展示位过滤', async () => {
        mockFetchRoutes({ '/feed': { version: 'V1', revision: 'f1', items: feedItems } });
        await policy().syncFeed();
        expect(policy().getFeed('modal').map((i) => i.id)).toEqual(['n-modal']);
        expect(policy().getFeed('home_banner').map((i) => i.id).sort()).toEqual(['n-home', 'n-op']);
        expect(policy().getFeed().length).toBe(3);
    });

    test('启动弹窗：未读才返回，标记已读后不再返回', async () => {
        mockFetchRoutes({ '/feed': { version: 'V1', revision: 'f1', items: feedItems } });
        await policy().syncFeed();
        const pending = policy().pendingModalNotices();
        expect(pending.map((i) => i.id)).toEqual(['n-modal']);
        policy().markModalSeen(pending);
        expect(policy().pendingModalNotices()).toEqual([]);
    });

    test('首页公告条取优先级最高的一条；关闭后切换为下一条', async () => {
        mockFetchRoutes({ '/feed': { version: 'V1', revision: 'f1', items: feedItems } });
        await policy().syncFeed();
        const first = policy().homeBannerItem();
        expect(first.id).toBe('n-op'); // 服务端已按 priority 排序
        policy().dismissHomeBanner(first);
        expect(policy().homeBannerItem().id).toBe('n-home');
    });

    test('个人中心公告列表按发布时间倒序', async () => {
        mockFetchRoutes({ '/feed': { version: 'V1', revision: 'f1', items: feedItems } });
        await policy().syncFeed();
        expect(policy().noticeList().map((i) => i.id)).toEqual(['n-op', 'n-modal', 'n-home']);
    });
});

describe('阶段11 - 税助手横幅状态', () => {
    test('无缓存不提示；同步落地后提示；已读后不再提示；clearState 复位', async () => {
        expect(policy().needsBanner()).toBe(false);
        mockFetchOk({ version: 'V9', revision: 'r9', notice: '更新说明', items: [{ id: 'bn-1', category: '政策法规', question: 'q', answer: 'a' }] });
        await policy().syncNow();
        expect(policy().needsBanner()).toBe(true);
        policy().markBannerSeen();
        expect(policy().needsBanner()).toBe(false);
        // 兼容别名（tax-assistant-ui.js 关闭横幅时调用）
        policy().setBannerSeen();
        expect(policy().needsBanner()).toBe(false);
        policy().clearState();
        expect(policy().getCache()).toBeNull();
        expect(policy().needsBanner()).toBe(false);
    });

    test('clearState 同时清理 feed 缓存与已读状态', async () => {
        mockFetchRoutes({
            '/tax-policy': { version: 'V1', revision: 'r1', items: [] },
            '/feed': { version: 'V1', revision: 'f1', items: [{ id: 'x1', placements: ['modal'], title: 't', summary: 's', updatedAt: 'u1' }] }
        });
        await policy().triggerSync();
        expect(policy().getFeed('modal').length).toBe(1);
        policy().clearState();
        expect(policy().getFeed('modal')).toEqual([]);
        expect(policy().noticeList()).toEqual([]);
    });
});
