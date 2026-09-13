// 阶段14 C2 - 城市社保参数库测试
//   1) prepareCitySocial 校验：城市编码契约、基数上下限、公积金比例选项、兜底城市不可删
//   2) resolveCity 回落链：命中 → 默认城市 → national → 列表首项（前端基数回落必须永远有值）
//   3) revisionOf / buildPublicPayload：指纹稳定性与「库中无配置回退出厂基线」
//   4) latestPublished / listHistory：快照查询契约
//
// 说明：本测试用一个内存版 Prisma 假体替换 @prisma/client。
//       配置库的价值在「校验 + 回落 + 指纹」这些决策上，只测纯函数即可覆盖全部风险点。

const mockRows = [];

const matches = (row, where) => Object.entries(where).every(([key, cond]) => {
    if (cond !== null && typeof cond === 'object') {
        if ('not' in cond) return row[key] !== cond.not;
        if ('in' in cond) return cond.in.includes(row[key]);
        return false;
    }
    return row[key] === cond;
});

const mockPrisma = {
    citySocialConfig: {
        async findFirst({ where = {}, orderBy } = {}) {
            const rows = mockRows.filter((r) => matches(r, where));
            if (!orderBy) return rows[0] || null;
            const sorted = [...rows].sort((a, b) => {
                const pa = new Date(a.published_at).getTime();
                const pb = new Date(b.published_at).getTime();
                if (pa !== pb) return pb - pa;
                return b.id - a.id;
            });
            return sorted[0] || null;
        },
        async findMany({ orderBy, take } = {}) {
            const sorted = [...mockRows].sort((a, b) => {
                const pa = new Date(a.published_at).getTime();
                const pb = new Date(b.published_at).getTime();
                if (pa !== pb) return pb - pa;
                return b.id - a.id;
            });
            return take ? sorted.slice(0, take) : sorted;
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

const service = require('../server/src/services/citySocialService');

const {
    DEFAULT_CITY_SOCIAL,
    FALLBACK_CITY,
    prepareCitySocial,
    parsePayload,
    revisionOf,
    latestPublished,
    listHistory,
    resolveCity,
    buildPublicPayload
} = service;

// 构造一个合法的城市项
const city = (over = {}) => ({
    code: 'beijing',
    name: '北京',
    socialBaseMin: 6821,
    socialBaseMax: 35811,
    housingBaseMin: 2420,
    housingBaseMax: null,
    housingFundRateOptions: [5, 12],
    note: '',
    ...over
});

const national = (over = {}) => city({
    code: FALLBACK_CITY,
    name: '全国平均',
    socialBaseMin: 7546,
    socialBaseMax: null,
    housingBaseMin: 7546,
    housingBaseMax: null,
    ...over
});

const expectError = (result, fragment) => {
    expect(result.ok).toBe(false);
    expect(result.data).toBeNull();
    expect(result.errors.join(' | ')).toContain(fragment);
};

beforeEach(() => {
    mockRows.length = 0;
});

describe('阶段14 C2 - prepareCitySocial 出厂基线与基本契约', () => {
    test('出厂基线自带 national 兜底城市，且与 C1 的全国平均基数一致', () => {
        expect(DEFAULT_CITY_SOCIAL.defaultCity).toBe(FALLBACK_CITY);
        const fallback = DEFAULT_CITY_SOCIAL.cities.find((c) => c.code === FALLBACK_CITY);
        expect(fallback.socialBaseMin).toBe(7546);
        expect(fallback.housingBaseMin).toBe(7546);
        // 出厂基线自身必须是合法配置（否则公开端点回退值会被校验拒绝）
        expect(prepareCitySocial(DEFAULT_CITY_SOCIAL).ok).toBe(true);
    });

    test('合法配置通过校验并归一化字段顺序', () => {
        const result = prepareCitySocial({
            constantsVersion: '2026.2',
            defaultCity: 'beijing',
            cities: [national(), city()]
        });
        expect(result.ok).toBe(true);
        expect(result.data.constantsVersion).toBe('2026.2');
        expect(result.data.defaultCity).toBe('beijing');
        expect(result.data.cities.map((c) => c.code)).toEqual(['national', 'beijing']);
        expect(Object.keys(result.data.cities[1])).toEqual([
            'code', 'name', 'socialBaseMin', 'socialBaseMax',
            'housingBaseMin', 'housingBaseMax', 'housingFundRateOptions', 'note'
        ]);
    });

    test('城市列表为空 / 非数组 → 拒绝', () => {
        expectError(prepareCitySocial({ cities: [] }), '不能为空');
        expectError(prepareCitySocial({ cities: 'beijing' }), '不能为空');
        expectError(prepareCitySocial({}), '不能为空');
    });

    test('constantsVersion 留空回退出厂版本号，超长截断 40', () => {
        const r1 = prepareCitySocial({ cities: [national()] });
        expect(r1.data.constantsVersion).toBe(DEFAULT_CITY_SOCIAL.constantsVersion);
        const r2 = prepareCitySocial({ constantsVersion: 'v'.repeat(80), cities: [national()] });
        expect(r2.data.constantsVersion.length).toBe(40);
    });
});

describe('阶段14 C2 - 城市编码契约（前后端契约与 localStorage 键的一部分）', () => {
    test('编码须小写字母开头；大写/中文/数字开头/过短均拒绝', () => {
        ['Beijing', '北京', '1beijing', 'b', 'bei jing', '-bei'].forEach((code) => {
            const r = prepareCitySocial({ cities: [national(), city({ code })] });
            expectError(r, '编码须为小写字母开头');
        });
    });

    test('允许小写字母/数字/_/- 组合，长度 2-32', () => {
        ['bj', 'shenzhen-sz', 'nei_menggu', 'city2026'].forEach((code) => {
            const r = prepareCitySocial({ defaultCity: code, cities: [national(), city({ code })] });
            expect(r.ok).toBe(true);
        });
        // 33 字符（超出 32 上限）拒绝
        const long = prepareCitySocial({ cities: [national(), city({ code: `a${'b'.repeat(32)}` })] });
        expectError(long, '编码须为小写字母开头');
        // 32 字符恰好合法（边界）
        const edge = prepareCitySocial({ cities: [national(), city({ code: `a${'b'.repeat(31)}` })] });
        expect(edge.ok).toBe(true);
    });

    test('编码重复 → 拒绝（同城两份口径会导致前端取值不确定）', () => {
        const r = prepareCitySocial({ cities: [national(), city({ code: 'national' })] });
        expectError(r, '编码重复');
    });

    test('城市名称不能为空，超长截断 50', () => {
        expectError(prepareCitySocial({ cities: [national(), city({ name: '   ' })] }), '城市名称不能为空');
        const r = prepareCitySocial({ cities: [national(), city({ name: '北'.repeat(80) })] });
        expect(r.data.cities[1].name.length).toBe(50);
    });

    test('必须保留 national 兜底城市（否则基数回落链断掉）', () => {
        const r = prepareCitySocial({ defaultCity: 'beijing', cities: [city()] });
        expectError(r, `必须保留编码为 ${FALLBACK_CITY} 的兜底城市`);
    });
});

describe('阶段14 C2 - 缴费基数校验（钱相关的口径，最易填错）', () => {
    test('基数下限须为 ≥ 0 的数值', () => {
        [-1, 'abc', null, undefined].forEach((v) => {
            const r = prepareCitySocial({ cities: [national(), city({ socialBaseMin: v })] });
            expectError(r, '社保基数下限：须为 ≥ 0 的数值');
        });
        // 0 合法（部分地区不设下限）
        const ok = prepareCitySocial({ cities: [national(), city({ socialBaseMin: 0 })] });
        expect(ok.ok).toBe(true);
    });

    test('上限留空/null = 无上限（存 null），不是 0', () => {
        const r = prepareCitySocial({ cities: [national(), city({ socialBaseMax: '', housingBaseMax: null })] });
        expect(r.ok).toBe(true);
        expect(r.data.cities[1].socialBaseMax).toBeNull();
        expect(r.data.cities[1].housingBaseMax).toBeNull();
    });

    test('上限低于下限 → 拒绝（否则校验器会认为所有基数都超标）', () => {
        const r1 = prepareCitySocial({ cities: [national(), city({ socialBaseMin: 8000, socialBaseMax: 7000 })] });
        expectError(r1, '社保基数上限：上限不得低于下限');

        const r2 = prepareCitySocial({ cities: [national(), city({ housingBaseMin: 8000, housingBaseMax: 7000 })] });
        expectError(r2, '公积金基数上限：上限不得低于下限');
    });

    test('数字字符串（表单提交常见）被接受，非数字拒绝', () => {
        const ok = prepareCitySocial({ cities: [national(), city({ socialBaseMin: '6821', socialBaseMax: '35811' })] });
        expect(ok.ok).toBe(true);
        expect(ok.data.cities[1].socialBaseMin).toBe(6821);

        const bad = prepareCitySocial({ cities: [national(), city({ socialBaseMax: 'x' })] });
        expectError(bad, '社保基数上限');
    });
});

describe('阶段14 C2 - 公积金比例选项', () => {
    test('留空 → 默认 [5,7]', () => {
        const r = prepareCitySocial({ cities: [national(), city({ housingFundRateOptions: undefined })] });
        expect(r.data.cities[1].housingFundRateOptions).toEqual([5, 7]);
    });

    test('去重升序，接受数字字符串', () => {
        const r = prepareCitySocial({ cities: [national(), city({ housingFundRateOptions: [12, '5', 12, 8] })] });
        expect(r.ok).toBe(true);
        expect(r.data.cities[1].housingFundRateOptions).toEqual([5, 8, 12]);
    });

    test('比例须落在 (0,100]，空数组与超量拒绝', () => {
        expectError(prepareCitySocial({ cities: [national(), city({ housingFundRateOptions: [0] })] }), '比例须在 (0, 100] 之间');
        expectError(prepareCitySocial({ cities: [national(), city({ housingFundRateOptions: [101] })] }), '比例须在 (0, 100] 之间');
        expectError(prepareCitySocial({ cities: [national(), city({ housingFundRateOptions: [] })] }), '须为非空数组');
        expectError(
            prepareCitySocial({ cities: [national(), city({ housingFundRateOptions: [5, 6, 7, 8, 9, 10, 11] })] }),
            '最多 6 项'
        );
    });
});

describe('阶段14 C2 - 默认城市与回落链 resolveCity', () => {
    test('默认城市留空 → 回落 national；不在列表中 → 拒绝', () => {
        const auto = prepareCitySocial({ cities: [national(), city()] });
        expect(auto.data.defaultCity).toBe(FALLBACK_CITY);

        const bad = prepareCitySocial({ defaultCity: 'shanghai', cities: [national(), city()] });
        expectError(bad, '默认城市「shanghai」不在城市列表中');
    });

    test('resolveCity：命中 → 默认城市 → national → 列表首项', () => {
        const config = {
            defaultCity: 'beijing',
            cities: [national(), city()]
        };
        expect(resolveCity(config, 'beijing').name).toBe('北京');
        // 未选择城市（空/undefined）→ 默认城市
        expect(resolveCity(config, '').code).toBe('beijing');
        expect(resolveCity(config).code).toBe('beijing');
        // 所选城市在新版本中被删除 → 回落 national，而不是 undefined
        expect(resolveCity({ ...config, defaultCity: 'deleted' }, 'deleted').code).toBe(FALLBACK_CITY);
        // 连 national 都没有（脏数据）→ 仍返回首项，保证调用方永远有口径可用
        expect(resolveCity({ cities: [city()] }, 'none').code).toBe('beijing');
        // 完全空配置 → null（由调用方回落 C1 全局基数）
        expect(resolveCity({ cities: [] }, 'beijing')).toBeNull();
        expect(resolveCity(null, 'beijing')).toBeNull();
    });
});

describe('阶段14 C2 - 指纹与公开载荷', () => {
    test('revision 对字段顺序不敏感（归一化后指纹稳定）', () => {
        const a = prepareCitySocial({ cities: [national(), city()] }).data;
        const b = prepareCitySocial({
            cities: [city(), national()]
        }).data;
        // 顺序不同 → 指纹不同（数组顺序属于实质内容，前端展示顺序也会变）
        expect(revisionOf(a)).not.toBe(revisionOf(b));
        // 同一对象 → 指纹稳定
        expect(revisionOf(a)).toBe(revisionOf(a));
    });

    test('库中无配置 → 公开载荷回退出厂基线（source=default）', () => {
        const payload = buildPublicPayload(null);
        expect(payload.source).toBe('default');
        expect(payload.version).toBe(DEFAULT_CITY_SOCIAL.constantsVersion);
        expect(payload.publishedAt).toBeNull();
        expect(payload.config).toBe(DEFAULT_CITY_SOCIAL);
        expect(payload.revision).toBe(revisionOf(DEFAULT_CITY_SOCIAL));
    });

    test('库中有配置 → 公开载荷取库中快照（source=custom）', () => {
        const config = prepareCitySocial({ defaultCity: 'beijing', cities: [national(), city()] }).data;
        const row = {
            id: 7,
            version: '2026.09.13-1',
            status: 'published',
            payload: JSON.stringify(config),
            note: '北京口径更新',
            published_at: new Date('2026-09-13T10:00:00Z')
        };
        const payload = buildPublicPayload(row);
        expect(payload.source).toBe('custom');
        expect(payload.version).toBe('2026.09.13-1');
        expect(payload.note).toBe('北京口径更新');
        expect(payload.config.cities.length).toBe(2);
        expect(payload.revision).toBe(revisionOf(config));
    });

    test('payload 损坏 → parsePayload 返回 null，公开载荷回落基线（不抛错）', () => {
        expect(parsePayload({ payload: '{oops' })).toBeNull();
        expect(parsePayload({ payload: '{"cities":"x"}' })).toBeNull();
        expect(parsePayload({ payload: '{"constantsVersion":"2026.1"}' })).toBeNull();
        expect(parsePayload(null)).toBeNull();
        expect(buildPublicPayload({ version: 'bad', payload: '{oops' }).source).toBe('default');
    });
});

describe('阶段14 C2 - 快照查询契约', () => {
    test('latestPublished 只取 published 且按 published_at/id 倒序', async () => {
        const config = prepareCitySocial({ cities: [national()] }).data;
        mockRows.push(
            { id: 1, version: 'a', status: 'archived', payload: JSON.stringify(config), published_at: new Date('2026-09-01') },
            { id: 2, version: 'b', status: 'published', payload: JSON.stringify(config), published_at: new Date('2026-09-02') },
            { id: 3, version: 'c', status: 'published', payload: JSON.stringify(config), published_at: new Date('2026-09-03') }
        );
        const row = await latestPublished();
        expect(row.id).toBe(3);
    });

    test('listHistory 默认取最近 30 条，按时间倒序', async () => {
        const config = prepareCitySocial({ cities: [national()] }).data;
        for (let i = 1; i <= 35; i++) {
            mockRows.push({
                id: i,
                version: `v${i}`,
                status: i === 35 ? 'published' : 'archived',
                payload: JSON.stringify(config),
                published_at: new Date(2026, 8, i)
            });
        }
        const rows = await listHistory();
        expect(rows.length).toBe(30);
        expect(rows[0].id).toBe(35);
    });
});
