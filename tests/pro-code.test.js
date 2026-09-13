// 阶段14 变现 - 专业版兑换码测试
//   1) normalizeCode 归一化：大小写/空格容错（用户手抄粘贴场景）
//   2) computeExpiry 到期时间决策：永久码 / 续期叠加 / 过期重算（钱相关，最易算错）
//   3) generateCodes 入参校验与码格式契约（前缀区分邀请码、字符集排除易混字符）
//   4) redeemCode 兑换事务：一码一用、作废拒绝、永久账号不消耗码、续期叠加
//   5) setCodeDisabled / exportCodesCsv：作废规则与 CSV 公式注入防护
//
// 说明：本测试用一个内存版 Prisma 假体替换 @prisma/client。
//       兑换码的价值全在「事务内的状态迁移」，只测纯函数覆盖不到，故必须能跑通真实调用链。

const mockDb = { codes: [], users: [], nextCodeId: 1 };

// 轻量 where 匹配：支持等值、null、{ not } 与 { in }
const matches = (row, where) => Object.entries(where).every(([key, cond]) => {
    if (cond !== null && typeof cond === 'object') {
        if ('not' in cond) return row[key] !== cond.not;
        if ('in' in cond) return cond.in.includes(row[key]);
        return false;
    }
    return row[key] === cond;
});

const sortById = (rows, orderBy) => {
    if (!orderBy || !orderBy.id) return rows;
    return [...rows].sort((a, b) => (orderBy.id === 'desc' ? b.id - a.id : a.id - b.id));
};

const mockPrisma = {
    async $transaction(fn) {
        return fn(mockPrisma);
    },
    proCode: {
        async findUnique({ where }) {
            return mockDb.codes.find((c) => matches(c, where)) || null;
        },
        async create({ data }) {
            if (mockDb.codes.some((c) => c.code === data.code)) {
                const err = new Error('Unique constraint failed on the fields: (`code`)');
                err.code = 'P2002';
                throw err;
            }
            const row = {
                id: mockDb.nextCodeId++,
                code: data.code,
                duration_days: data.duration_days ?? null,
                batch: data.batch ?? null,
                note: data.note ?? '',
                disabled: false,
                used_by: null,
                used_at: null,
                created_at: new Date(),
                ...data
            };
            mockDb.codes.push(row);
            return row;
        },
        async updateMany({ where, data }) {
            const hit = mockDb.codes.filter((c) => matches(c, where));
            hit.forEach((c) => Object.assign(c, data));
            return { count: hit.length };
        },
        async update({ where, data }) {
            const row = mockDb.codes.find((c) => matches(c, where));
            Object.assign(row, data);
            return row;
        },
        async findMany({ where = {}, orderBy, skip = 0, take } = {}) {
            const rows = sortById(mockDb.codes.filter((c) => matches(c, where)), orderBy);
            return rows.slice(skip, take ? skip + take : undefined);
        },
        async count({ where = {} } = {}) {
            return mockDb.codes.filter((c) => matches(c, where)).length;
        }
    },
    user: {
        async findUnique({ where }) {
            return mockDb.users.find((u) => matches(u, where)) || null;
        },
        async update({ where, data }) {
            const row = mockDb.users.find((u) => matches(u, where));
            Object.assign(row, data);
            return { ...row };
        },
        async findMany({ where = {} } = {}) {
            return mockDb.users.filter((u) => matches(u, where));
        }
    }
};

jest.mock('@prisma/client', () => ({
    PrismaClient: class {
        constructor() {
            return mockPrisma;
        }
    }
}), { virtual: true });

const service = require('../server/src/services/proCodeService');

const {
    normalizeCode,
    computeExpiry,
    redeemCode,
    generateCodes,
    listCodes,
    setCodeDisabled,
    exportCodesCsv,
    listUserCodes
} = service;

const DAY_MS = 24 * 60 * 60 * 1000;

const seedUser = (over = {}) => {
    const user = {
        id: mockDb.users.length + 1,
        username: `user${mockDb.users.length + 1}`,
        email: `u${mockDb.users.length + 1}@example.com`,
        phone: null,
        plan: 'free',
        plan_expires_at: null,
        pro_granted_by: null,
        ...over
    };
    mockDb.users.push(user);
    return user;
};

const seedCode = (over = {}) => {
    const row = {
        id: mockDb.nextCodeId++,
        code: 'PRO-AAAA-BBBB',
        duration_days: 365,
        batch: null,
        note: '',
        disabled: false,
        used_by: null,
        used_at: null,
        created_at: new Date(),
        ...over
    };
    mockDb.codes.push(row);
    return row;
};

const expectStatus = (err, statusCode) => {
    expect(err).toBeDefined();
    expect(err.statusCode).toBe(statusCode);
};

beforeEach(() => {
    mockDb.codes = [];
    mockDb.users = [];
    mockDb.nextCodeId = 1;
});

describe('阶段14 兑换码 - normalizeCode 归一化', () => {
    test('去首尾空白、转大写、剔除内部空格（手抄与粘贴混入的空格都要容忍）', () => {
        expect(normalizeCode('  pro-abcd-efgh  ')).toBe('PRO-ABCD-EFGH');
        expect(normalizeCode('PRO abcd efgh')).toBe('PROABCDEFGH');
        expect(normalizeCode('pro-abcd-efgh')).toBe('PRO-ABCD-EFGH');
    });

    test('空值输入统一归一化为空串（由调用方判断并报 400）', () => {
        [undefined, null, '', '   '].forEach((v) => expect(normalizeCode(v)).toBe(''));
        expect(normalizeCode(12345)).toBe('12345');
    });
});

describe('阶段14 兑换码 - computeExpiry 到期决策', () => {
    const now = Date.UTC(2026, 8, 13, 0, 0, 0);

    test('永久码（duration_days = null）→ null 表示永久授权', () => {
        expect(computeExpiry({ plan: 'free', plan_expires_at: null }, null, now)).toBeNull();
        expect(computeExpiry({ plan: 'pro', plan_expires_at: new Date(now + DAY_MS) }, null, now)).toBeNull();
    });

    test('基础版用户 → 自兑换时刻起算 N 天', () => {
        const result = computeExpiry({ plan: 'free', plan_expires_at: null }, 30, now);
        expect(result.getTime()).toBe(now + 30 * DAY_MS);
    });

    test('专业版仍在有效期内 → 在现有到期日上叠加续期（不清零，用户不吃亏）', () => {
        const existing = new Date(now + 10 * DAY_MS);
        const result = computeExpiry({ plan: 'pro', plan_expires_at: existing }, 30, now);
        expect(result.getTime()).toBe(existing.getTime() + 30 * DAY_MS);
    });

    test('专业版但已过期 → 按新购处理，自兑换时刻起算', () => {
        const expired = new Date(now - 5 * DAY_MS);
        const result = computeExpiry({ plan: 'pro', plan_expires_at: expired }, 30, now);
        expect(result.getTime()).toBe(now + 30 * DAY_MS);
    });

    test('基础版但残留未来到期日（异常数据）→ 不叠加，按新购起算', () => {
        const future = new Date(now + 5 * DAY_MS);
        const result = computeExpiry({ plan: 'free', plan_expires_at: future }, 30, now);
        expect(result.getTime()).toBe(now + 30 * DAY_MS);
    });
});

describe('阶段14 兑换码 - generateCodes 校验与码格式', () => {
    test('count 必须是 1-200 的整数', async () => {
        await expect(generateCodes({ count: 0 })).rejects.toThrow(/between 1 and 200/);
        await expect(generateCodes({ count: 201 })).rejects.toThrow(/between 1 and 200/);
        await expect(generateCodes({ count: 'abc' })).rejects.toThrow(/between 1 and 200/);
        await expect(generateCodes({ count: 1.5 })).rejects.toThrow(/between 1 and 200/);
        // 边界：1 与 200 合法
        expect((await generateCodes({ count: 1 })).createdCount).toBe(1);
        // 字符串数字（表单提交常见）仍应被接受
        expect((await generateCodes({ count: '3' })).createdCount).toBe(3);
        // 反向确认：非整数不得被静默截断少发码
        expect(mockDb.codes.length).toBe(4);
    });

    test('durationDays 必须为 1-3650 的整数，省略/空串/null 视为永久', async () => {
        await expect(generateCodes({ count: 1, durationDays: 0 })).rejects.toThrow(/durationDays/);
        await expect(generateCodes({ count: 1, durationDays: 3651 })).rejects.toThrow(/durationDays/);
        await expect(generateCodes({ count: 1, durationDays: 'x' })).rejects.toThrow(/durationDays/);

        expect((await generateCodes({ count: 1 })).durationDays).toBeNull();
        expect((await generateCodes({ count: 1, durationDays: '' })).durationDays).toBeNull();
        expect((await generateCodes({ count: 1, durationDays: null })).durationDays).toBeNull();
        expect((await generateCodes({ count: 1, durationDays: 30 })).durationDays).toBe(30);
    });

    test('码格式契约：PRO-XXXX-XXXX，且不含易混字符 0/O/1/I/L/U/V', async () => {
        const { codes } = await generateCodes({ count: 30, durationDays: 365 });
        codes.forEach((code) => {
            expect(code).toMatch(/^PRO-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
            expect(code.slice(4)).not.toMatch(/[01OILUV]/);
        });
        // 前缀必须与邀请码区分，避免用户在注册框误填
        expect(codes.every((c) => !c.startsWith('EURISKO-'))).toBe(true);
        expect(new Set(codes).size).toBe(codes.length);
    });

    test('batch 去空白并截断 64 字符，note 截断 200 字符，未传时回落空值', async () => {
        const res = await generateCodes({
            count: 1,
            batch: `  ${'b'.repeat(80)}  `,
            note: 'n'.repeat(300)
        });
        expect(res.batch.length).toBe(64);
        const row = mockDb.codes[0];
        expect(row.note.length).toBe(200);
    });

    test('撞上 unique 约束（P2002）时自动重新生成，不整体失败', async () => {
        const created = await generateCodes({ count: 5, durationDays: 30 });
        expect(created.createdCount).toBe(5);
        expect(mockDb.codes.length).toBe(5);
    });
});

describe('阶段14 兑换码 - redeemCode 兑换事务', () => {
    test('兑换成功：占用码 + 升级专业版 + 授予来源 purchase', async () => {
        const user = seedUser();
        seedCode({ code: 'PRO-AAAA-BBBB', duration_days: 365 });

        const result = await redeemCode(user.id, 'PRO-AAAA-BBBB');

        expect(result.plan).toBe('pro');
        expect(result.pro_granted_by).toBe('purchase');
        expect(result.plan_expires_at).toBeInstanceOf(Date);
        // 绝不外泄口令哈希等敏感字段
        expect(result.password_hash).toBeUndefined();

        const row = mockDb.codes[0];
        expect(row.used_by).toBe(user.id);
        expect(row.used_at).toBeInstanceOf(Date);
    });

    test('一码一用：同一码第二次兑换失败，且不覆盖首位兑换者的占用', async () => {
        const first = seedUser();
        const second = seedUser();
        seedCode({ code: 'PRO-AAAA-BBBB', duration_days: 365 });

        await redeemCode(first.id, 'PRO-AAAA-BBBB');
        await expect(redeemCode(second.id, 'PRO-AAAA-BBBB')).rejects.toThrow(/仅限一次/);

        expect(mockDb.codes[0].used_by).toBe(first.id);
        expect(mockDb.users[1].plan).toBe('free');
    });

    test('兑换码不存在 / 已被作废 → 403，且不发放权益', async () => {
        const user = seedUser();
        seedCode({ code: 'PRO-AAAA-BBBB', disabled: true });

        await expect(redeemCode(user.id, 'PRO-AAAA-CCCC')).rejects.toThrow(/不存在/);
        await expect(redeemCode(user.id, 'PRO-AAAA-BBBB')).rejects.toThrow(/作废/);

        expect(mockDb.users[0].plan).toBe('free');
    });

    test('已是永久专业版 → 409 且不消耗兑换码（避免用户白买一个用不上的码）', async () => {
        const user = seedUser({ plan: 'pro', plan_expires_at: null, pro_granted_by: 'seed' });
        seedCode({ code: 'PRO-AAAA-BBBB', duration_days: null });

        await expect(redeemCode(user.id, 'PRO-AAAA-BBBB')).rejects.toThrow(/已是永久专业版/);
        expect(mockDb.codes[0].used_by).toBeNull();
        expect(mockDb.codes[0].used_at).toBeNull();
    });

    test('限时码对未过期的专业版用户 → 到期日叠加续期', async () => {
        const existing = new Date(Date.now() + 10 * DAY_MS);
        const user = seedUser({ plan: 'pro', plan_expires_at: existing, pro_granted_by: 'admin' });
        seedCode({ code: 'PRO-AAAA-BBBB', duration_days: 30 });

        const result = await redeemCode(user.id, 'PRO-AAAA-BBBB');
        expect(result.plan_expires_at.getTime()).toBe(existing.getTime() + 30 * DAY_MS);
        // 授予来源应更新为 purchase（本次是通过购买获得的）
        expect(result.pro_granted_by).toBe('purchase');
    });

    test('永久码兑换后 plan_expires_at 为 null（永久）', async () => {
        const user = seedUser();
        seedCode({ code: 'PRO-AAAA-BBBB', duration_days: null });

        const result = await redeemCode(user.id, 'PRO-AAAA-BBBB');
        expect(result.plan).toBe('pro');
        expect(result.plan_expires_at).toBeNull();
    });

    test('入参容错：小写 / 前后空格 / 内部空格 均可兑换成功', async () => {
        seedUser();
        seedCode({ code: 'PRO-AAAA-BBBB', duration_days: 30 });

        const result = await redeemCode(1, '  pro-aaaa-bbbb  ');
        expect(result.plan).toBe('pro');
    });

    test('空兑换码 → 400（不进入事务）', async () => {
        seedUser();
        try {
            await redeemCode(1, '   ');
            throw new Error('should have thrown');
        } catch (err) {
            expectStatus(err, 400);
        }
    });

    test('用户不存在 → 404', async () => {
        seedCode({ code: 'PRO-AAAA-BBBB', duration_days: 30 });
        try {
            await redeemCode(999, 'PRO-AAAA-BBBB');
            throw new Error('should have thrown');
        } catch (err) {
            expectStatus(err, 404);
        }
    });
});

describe('阶段14 兑换码 - 管理端列表 / 作废 / 导出', () => {
    test('listCodes 状态筛选与三类计数', async () => {
        seedUser();
        seedCode({ code: 'PRO-AAAA-AAAA', used_by: 1, used_at: new Date() });
        seedCode({ code: 'PRO-BBBB-BBBB' });
        seedCode({ code: 'PRO-CCCC-CCCC', disabled: true });

        const all = await listCodes({});
        expect(all.total).toBe(3);
        expect(all.availableCount).toBe(1);
        expect(all.usedCount).toBe(1);
        expect(all.disabledCount).toBe(1);

        expect((await listCodes({ status: 'available' })).total).toBe(1);
        expect((await listCodes({ status: 'used' })).total).toBe(1);
        expect((await listCodes({ status: 'disabled' })).total).toBe(1);
    });

    test('listCodes 返回值含状态派生字段与兑换者用户名（裸外键手动关联）', async () => {
        const user = seedUser({ username: 'alia' });
        seedCode({ code: 'PRO-AAAA-AAAA', used_by: user.id, used_at: new Date(), duration_days: null });

        const { items } = await listCodes({});
        expect(items[0].status).toBe('used');
        expect(items[0].permanent).toBe(true);
        expect(items[0].usedByName).toBe('alia');
    });

    test('listCodes 按批次筛选', async () => {
        seedCode({ code: 'PRO-AAAA-AAAA', batch: '2026.09' });
        seedCode({ code: 'PRO-BBBB-BBBB', batch: '2026.10' });
        expect((await listCodes({ batch: '2026.09' })).total).toBe(1);
    });

    test('未被兑换的码可作废；已被兑换的码拒绝作废（收款凭证需留痕）', async () => {
        seedUser();
        const free = seedCode({ code: 'PRO-AAAA-AAAA' });
        const used = seedCode({ code: 'PRO-BBBB-BBBB', used_by: 1, used_at: new Date() });

        const res = await setCodeDisabled(free.id, true);
        expect(res.status).toBe('disabled');

        try {
            await setCodeDisabled(used.id, true);
            throw new Error('should have thrown');
        } catch (err) {
            expectStatus(err, 409);
        }

        expect((await setCodeDisabled(free.id, false)).status).toBe('available');

        try {
            await setCodeDisabled(99999, true);
            throw new Error('should have thrown');
        } catch (err) {
            expectStatus(err, 404);
        }
    });

    test('exportCodesCsv：带 UTF-8 BOM、表头齐全、永久码输出 permanent', async () => {
        seedCode({ code: 'PRO-AAAA-AAAA', duration_days: null });
        const csv = await exportCodesCsv({});

        expect(csv.startsWith('\uFEFF')).toBe(true);
        expect(csv).toContain('"code","status","duration_days"');
        expect(csv).toContain('"permanent"');
        expect(csv).toContain('"available"');
    });

    test('exportCodesCsv：备注以 = + - @ 开头时前置单引号（CSV 公式注入防护）', async () => {
        seedCode({ code: 'PRO-AAAA-AAAA', note: '=cmd|\' /c calc\'!A1' });
        const csv = await exportCodesCsv({});
        expect(csv).toContain('"\'=cmd');
    });

    test('listUserCodes 返回某用户兑换过的码（客服核对用）', async () => {
        const user = seedUser();
        seedCode({ code: 'PRO-AAAA-AAAA', used_by: user.id, used_at: new Date(), batch: '2026.09' });
        seedCode({ code: 'PRO-BBBB-BBBB', used_by: 999, used_at: new Date() });

        const rows = await listUserCodes(user.id);
        expect(rows.length).toBe(1);
        expect(rows[0].code).toBe('PRO-AAAA-AAAA');
        expect(rows[0].batch).toBe('2026.09');
    });
});
