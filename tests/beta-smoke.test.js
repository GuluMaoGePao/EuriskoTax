// beta 真机冒烟的护栏与判定逻辑（2026-10-24 新增）
//
// 为什么钉这些：这个脚本会**写真数据**（留资写真线索表、同步写计算记录）。
// 它一旦被误用在正式站上，写入的是不可逆的脏数据 —— 而且因为「留资成功」看起来
// 就是成功，没人会发现。所以「默认拒绝正式站」必须是断言，不能是注释。
// 另两条容易被误判的：429 是限流（环境在自保）不是链路坏；403 是权益/口令问题不是服务挂。
const {
    isProdHost, hasAuthConflict, classifyStatus, makeClientId, syncPushPayload, leadPayload,
    buildReport, run,
} = require('../tools/ops/beta-smoke.js');

describe('Basic Auth 与 Bearer 不可共存（公网 beta 的死结）', () => {
    test('公网地址 + Basic 凭据 → 判定冲突', () => {
        expect(hasAuthConflict('https://beta.euriskotax.com', { user: 'u', pass: 'p' })).toBe(true);
    });

    test('隧道地址（127.0.0.1）+ Basic 凭据 → 不冲突（本地本来就不需要 Basic）', () => {
        expect(hasAuthConflict('http://127.0.0.1:3001', { user: 'u', pass: 'p' })).toBe(false);
    });

    test('公网地址但不带 Basic 凭据 → 不冲突', () => {
        expect(hasAuthConflict('https://beta.euriskotax.com', {})).toBe(false);
    });

    test('冲突时在登录之前就停，一步都不跑（登录有 10 次/15 分钟限流，白跑一次少一次）', async () => {
        const r = await run({
            baseUrl: 'https://beta.euriskotax.com',
            email: 'a@b.com',
            password: 'x',
            auth: { user: 'u', pass: 'p' },
        });
        expect(r.steps).toEqual([]);
        expect(r.exitCode).toBe(1);
        expect(r.report).toContain('只有一个 Authorization 头');
        expect(r.report).toContain('SSH 隧道');
    });
});

describe('护栏：不许把测试数据写进正式站', () => {
    test('正式域名被认出来，beta 不被误伤', () => {
        expect(isProdHost('https://euriskotax.com')).toBe(true);
        expect(isProdHost('https://www.euriskotax.com')).toBe(true);
        expect(isProdHost('https://beta.euriskotax.com')).toBe(false);
    });

    test('打正式站且不显式放行 → 直接拒绝，一步都不跑', async () => {
        const r = await run({
            baseUrl: 'https://euriskotax.com', email: 'a@b.com', password: 'x', auth: {},
        });
        expect(r.steps).toEqual([]);
        expect(r.exitCode).toBe(1);
        expect(r.report).toContain('拒绝执行');
    });
});

describe('失败分类：限流 ≠ 链路坏，鉴权失败 ≠ 服务挂', () => {
    test('429 是限流，401/403 是鉴权/权益，其余按成功与否判', () => {
        expect(classifyStatus(429)).toBe('ratelimit');
        expect(classifyStatus(401)).toBe('auth');
        expect(classifyStatus(403)).toBe('auth');
        expect(classifyStatus(200)).toBe('ok');
        expect(classifyStatus(201)).toBe('ok');
        expect(classifyStatus(500)).toBe('fail');
        expect(classifyStatus(0)).toBe('fail');   // 连不上
    });
});

describe('同步载荷：跑完用墓碑删掉，不把测试数据留在预发库', () => {
    test('正常条目带 data、不带 deletedAt', () => {
        const p = syncPushPayload('cid-1');
        expect(p.push).toHaveLength(1);
        expect(p.push[0].clientId).toBe('cid-1');
        expect(p.push[0].type).toBe('comprehensive');
        expect(p.push[0].data).toBeTruthy();
        expect(p.push[0].deletedAt).toBeUndefined();
    });

    test('墓碑条目带 deletedAt、不带 data', () => {
        const p = syncPushPayload('cid-1', { deleted: true });
        expect(p.push[0].deletedAt).toBeTruthy();
        expect(p.push[0].data).toBeUndefined();
    });

    test('每次生成的 clientId 都不同（幂等键不能撞）', () => {
        const a = makeClientId();
        const b = makeClientId();
        expect(a).not.toBe(b);
        expect(a.startsWith('beta-smoke-')).toBe(true);
    });
});

describe('留资载荷：必须过后端校验', () => {
    test('手机号合规、consent 严格为 true', () => {
        const p = leadPayload('2026-10-24');
        expect(p.phone).toMatch(/^1[3-9]\d{9}$/);
        expect(p.consent).toBe(true);
        expect(p.name).toBeTruthy();
    });
});

describe('报告：不得泄露口令', () => {
    test('任何一步的说明里都不出现口令', () => {
        const steps = [
            { name: '登录', icon: '✅', detail: 'HTTP 200，拿到 token（152 字符）' },
            { name: '留资 /api/leads', icon: '⏭️', detail: 'HTTP 429 —— 限流' },
        ];
        const report = buildReport(steps, { baseUrl: 'https://beta.euriskotax.com', email: 'beta-tester@euriskotax.com' });
        expect(report).not.toContain('41cx2AIdLUDmMkSw');
        expect(report).toContain('beta-tester@euriskotax.com');
        expect(report).toContain('**结论**：✅');
    });

    test('有失败步骤时结论为红，并点名是哪一步', () => {
        const steps = [
            { name: '登录', icon: '✅', detail: 'ok' },
            { name: '云端同步（上传）', icon: '❌', detail: 'HTTP 403' },
        ];
        const report = buildReport(steps, { baseUrl: 'https://beta.euriskotax.com', email: 'a@b.com' });
        expect(report).toContain('**结论**：❌ 1 步失败（云端同步（上传））');
        expect(report).toContain('不要发正式');
    });
});
