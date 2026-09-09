// 阶段10B：政策要点「更新同步」单测（免费不请求 / PRO 增量拉取 / 合并 / 横幅状态）
const { loadSource } = require('./helpers/load-source.js');

loadSource('src/js/auth/plan.js');
loadSource('src/js/data/tax-assistant.js'); // 提供 window.TAX_ASSISTANT_QA（内置快照全量）
loadSource('src/js/data/tax-policy.js');

const policy = () => window.TaxPolicy;
const baseCount = () => (window.TAX_ASSISTANT_QA || []).length;

const proUser = (over) => Object.assign({ email: 'pro@example.com', plan: 'pro' }, over || {});
const freeUser = { email: 'free@example.com', plan: 'free' };

beforeEach(() => {
    try { localStorage.clear(); } catch (e) { /* ignore */ }
    try { sessionStorage.clear(); } catch (e) { /* ignore */ }
    if (window.TaxPolicy) window.TaxPolicy.clearState();
    window.apiClient = { getCurrentUser: () => freeUser };
});

afterEach(() => {
    delete window.apiClient;
    if (global.fetch) global.fetch.mockRestore && global.fetch.mockRestore();
    delete global.fetch;
});

const mockFetchOk = (payload) => {
    global.fetch = jest.fn(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: payload })
    }));
};

describe('isProActive / 免费不请求', () => {
    test('免费用户 → 不发起请求，返回 reason=free', async () => {
        const spy = jest.fn();
        global.fetch = spy;
        const out = await policy().syncNow();
        expect(out).toEqual({ updated: false, reason: 'free' });
        expect(spy).not.toHaveBeenCalled();
    });

    test('未登录（无用户）→ 视为非 pro，不请求', async () => {
        window.apiClient.getCurrentUser = () => null;
        const spy = jest.fn();
        global.fetch = spy;
        await policy().syncNow();
        expect(spy).not.toHaveBeenCalled();
    });

    test('PRO 永久授权 → 发起拉取', async () => {
        window.apiClient.getCurrentUser = () => proUser(); // plan_expires_at 缺省=永久
        mockFetchOk({ version: 'V2', notice: '', items: [] });
        await policy().syncNow();
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    test('PRO 已过期 → 视为非 pro，不请求', async () => {
        window.apiClient.getCurrentUser = () => proUser({ plan_expires_at: '2020-01-01T00:00:00.000Z' });
        const spy = jest.fn();
        global.fetch = spy;
        await policy().syncNow();
        expect(spy).not.toHaveBeenCalled();
    });
});

describe('apiClient 未挂 window 时（ES module 场景，普通脚本需存储回退）', () => {
    test('sessionStorage 有 pro 用户（未勾选「保持登录」）→ 仍发起拉取并落缓存', async () => {
        delete window.apiClient; // 真实浏览器：api-client.js 为 type=module，window.apiClient 缺失
        sessionStorage.setItem('current_user', JSON.stringify(proUser()));
        mockFetchOk({ version: 'V2', notice: '更新说明', items: [] });
        await policy().syncNow();
        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(policy().getCache()).not.toBeNull();
        expect(policy().getCache().version).toBe('V2');
    });

    test('storage 亦无用户 → 视为非 pro，不请求', async () => {
        delete window.apiClient;
        const spy = jest.fn();
        global.fetch = spy;
        const out = await policy().syncNow();
        expect(out).toEqual({ updated: false, reason: 'free' });
        expect(spy).not.toHaveBeenCalled();
    });
});

describe('applyUpdates 合并', () => {
    test('带 since：版本一致 items 空 → 无更新，仅推进缓存版本', async () => {
        window.apiClient.getCurrentUser = () => proUser();
        // 先制造本地缓存 V1
        policy().applyUpdates([{ id: 'dummy-a', question: 'q', answer: 'a', category: '政策法规' }]);
        mockFetchOk({ version: 'V1', notice: '', items: [] }); // since=V1 同版本
        const out = await policy().syncNow();
        expect(out.updated).toBe(false);
        expect(out.version).toBe('V1');
        expect(policy().getCache().version).toBe('V1');
    });

    test('版本前进且有更新条目 → 合并到内置快照并写缓存/发事件', async () => {
        window.apiClient.getCurrentUser = () => proUser();
        const listener = jest.fn();
        document.addEventListener(policy().EVENT_UPDATED, listener);
        const before = baseCount();
        mockFetchOk({
            version: '2026.09.2',
            notice: '专项附加扣除填报提醒',
            publishedAt: '2026-09-09',
            items: [
                { id: 'notice-new-1', category: '政策法规', question: '新政策？', answer: '是的。', tag: 'policy-point', updatedAt: '2026-09-01' }
            ]
        });
        const out = await policy().syncNow();
        expect(out.updated).toBe(true);
        expect(out.version).toBe('2026.09.2');
        expect(baseCount()).toBe(before + 1);
        expect(window.TAX_ASSISTANT_QA.some((it) => it.id === 'notice-new-1')).toBe(true);
        expect(policy().getCache().version).toBe('2026.09.2');
        expect(policy().getCache().notice).toContain('专项附加');
        expect(listener).toHaveBeenCalledTimes(1);
        document.removeEventListener(policy().EVENT_UPDATED, listener);
    });

    test('覆盖更新：与内置条目同 id → 字段以远端为准，数量不变', () => {
        const first = window.TAX_ASSISTANT_QA[0];
        expect(first).toBeTruthy();
        const before = baseCount();
        const count = policy().applyUpdates([{ id: first.id, tag: 'policy-point', category: '政策法规' }]);
        expect(count).toBe(1);
        expect(baseCount()).toBe(before);
        expect(window.TAX_ASSISTANT_QA[0].tag).toBe('policy-point');
    });

    test('deleted:true 撤回内置条目', () => {
        const target = window.TAX_ASSISTANT_QA[1];
        const id = target && target.id;
        if (!id) return;
        const before = baseCount();
        policy().applyUpdates([{ id: id, deleted: true }]);
        expect(baseCount()).toBe(before - 1);
        expect(window.TAX_ASSISTANT_QA.some((it) => it.id === id)).toBe(false);
    });

    test('非法输入安全返回 0', () => {
        expect(policy().applyUpdates(null)).toBe(0);
        expect(policy().applyUpdates('oops')).toBe(0);
    });
});

describe('横幅状态 needsBanner / setBannerSeen / clearState', () => {
    test('无缓存不提示；同步落地后提示；已读后不再提示；clearState 复位', async () => {
        expect(policy().needsBanner()).toBe(false);
        window.apiClient.getCurrentUser = () => proUser();
        mockFetchOk({ version: 'V9', notice: '更新说明', items: [{ id: 'bn-1', category: '政策法规', question: 'q', answer: 'a' }] });
        await policy().syncNow();
        expect(policy().needsBanner()).toBe(true);
        policy().setBannerSeen();
        expect(policy().needsBanner()).toBe(false);
        policy().clearState();
        expect(policy().getCache()).toBeNull();
        expect(policy().needsBanner()).toBe(false);
    });
});
