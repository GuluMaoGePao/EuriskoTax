// 阶段12 排障话术库测试
//   1) 内置种子数据契约：分类合法、script_id 唯一、必填字段非空、占位符写法统一
//   2) 请求体归一化契约：steps 换行拆分 / PATCH 部分更新语义（前后端字段契约，易静默失效）
//   3) 后台 DOM 契约与动作分发：见 content-admin.test.js（该文件的扫描区间已覆盖本模块）
//
// 说明：supportScriptService 顶层会 new PrismaClient()，这里 mock 掉，
//       使本测试只校验纯数据契约，不依赖 DATABASE_URL 与已生成的 Prisma Client。
//       virtual: 根目录解析不到 @prisma/client（它安装在 server/node_modules 下），占位实现即可。

jest.mock('@prisma/client', () => ({ PrismaClient: class { } }), { virtual: true });

const { SEED_SCRIPTS, CATEGORIES } = require('../server/src/services/supportScriptService');
const { _internal } = require('../server/src/controllers/supportAdminController');
const { parseSteps, buildData } = _internal;

const CATEGORY_KEYS = Object.keys(CATEGORIES);

describe('阶段12 排障话术库 - 内置种子数据契约', () => {
    test('内置条目至少 9 条，script_id 唯一且非空', () => {
        expect(SEED_SCRIPTS.length).toBeGreaterThanOrEqual(9);
        const ids = SEED_SCRIPTS.map((s) => s.script_id);
        ids.forEach((id) => {
            expect(typeof id).toBe('string');
            expect(id.trim().length).toBeGreaterThan(0);
        });
        expect(new Set(ids).size).toBe(ids.length);
    });

    test('每条分类都在 CATEGORIES 枚举内', () => {
        expect(CATEGORY_KEYS.length).toBeGreaterThan(0);
        SEED_SCRIPTS.forEach((s) => expect(CATEGORY_KEYS).toContain(s.category));
    });

    test('标题 / 症状 / 话术正文均非空，步骤为非空数组', () => {
        SEED_SCRIPTS.forEach((s) => {
            expect(s.title.trim().length).toBeGreaterThan(0);
            expect(s.symptom.trim().length).toBeGreaterThan(0);
            expect(s.script.trim().length).toBeGreaterThan(0);
            expect(Array.isArray(s.steps)).toBe(true);
            expect(s.steps.length).toBeGreaterThan(0);
            s.steps.forEach((step) => expect(String(step).trim().length).toBeGreaterThan(0));
        });
    });

    test('priority 为整数，且最高频的旧版残留问题排在最前', () => {
        SEED_SCRIPTS.forEach((s) => expect(Number.isInteger(s.priority)).toBe(true));
        const top = [...SEED_SCRIPTS].sort((a, b) => b.priority - a.priority)[0];
        expect(top.script_id).toBe('stale-page');
    });

    test('{RESET_URL} 占位符按标准写法出现，端上替换不会漏', () => {
        const all = SEED_SCRIPTS.map((s) => s.script).join('\n');
        expect(all).toContain('{RESET_URL}');
        // 除标准写法外，不应出现其它全大写花括号占位符（大小写/拼写变体会导致替换失效）
        expect(all.match(/\{(?!RESET_URL\})[A-Z_]{3,}\}/g) || []).toEqual([]);
    });

    test('每个分类都有可用话术，避免筛选后空白', () => {
        const used = new Set(SEED_SCRIPTS.map((s) => s.category));
        CATEGORY_KEYS.forEach((key) => expect(used.has(key)).toBe(true));
    });
});

describe('阶段12 排障话术库 - 请求体归一化契约', () => {
    describe('parseSteps：后台「一行一步」文本 → 步骤数组', () => {
        test('按行拆分，去掉空行与首尾空白（含 CRLF）', () => {
            expect(parseSteps('第一步\r\n第二步\n\n  第三步  \n')).toEqual(['第一步', '第二步', '第三步']);
        });

        test('直接传数组时逐项 trim 并丢弃空项', () => {
            expect(parseSteps([' a ', '', '  ', 'b'])).toEqual(['a', 'b']);
        });

        test('空值 / 非字符串非数组 → 空数组', () => {
            expect(parseSteps(undefined)).toEqual([]);
            expect(parseSteps(null)).toEqual([]);
            expect(parseSteps('   ')).toEqual([]);
            expect(parseSteps(123)).toEqual([]);
        });

        test('步骤数量封顶 20 条，避免异常输入撑爆存储', () => {
            const many = Array.from({ length: 25 }, (_, i) => `步骤${i + 1}`).join('\n');
            expect(parseSteps(many)).toHaveLength(20);
        });
    });

    describe('buildData：新建（partial=false）', () => {
        const valid = { title: '标题', script: '话术', category: 'cache', steps: 'a\nb', priority: '7' };

        test('合法入参归一化为数据库行（steps 序列化为 JSON 字符串）', () => {
            const { data, error } = buildData(valid, { partial: false });
            expect(error).toBeUndefined();
            expect(data.category).toBe('cache');
            expect(data.priority).toBe(7);
            expect(typeof data.steps).toBe('string');
            expect(JSON.parse(data.steps)).toEqual(['a', 'b']);
        });

        test('缺 title / script 时报错', () => {
            expect(buildData({ ...valid, title: '  ' }, { partial: false }).error).toContain('title');
            expect(buildData({ ...valid, script: '  ' }, { partial: false }).error).toContain('script');
        });

        test('分类不在枚举内时报错', () => {
            expect(buildData({ ...valid, category: 'unknown' }, { partial: false }).error).toContain('category');
        });

        test('priority 非法时回落为 0，不写入 NaN', () => {
            const { data } = buildData({ ...valid, priority: 'abc' }, { partial: false });
            expect(data.priority).toBe(0);
        });

        test('缺省分类为 cache（端上筛选不会因分类空值而漏出）', () => {
            const { data } = buildData({ title: 't', script: 's' }, { partial: false });
            expect(data.category).toBe('cache');
        });
    });

    describe('buildData：编辑（partial=true，PATCH 语义）', () => {
        test('只更新传入的字段，未传字段不出现在 data 中', () => {
            const { data, error } = buildData({ title: '改标题' }, { partial: true });
            expect(error).toBeUndefined();
            expect(Object.keys(data)).toEqual(['title']);
        });

        test('传入空 title / script 时报错（不允许清空必填项）', () => {
            expect(buildData({ title: '' }, { partial: true }).error).toContain('title');
            expect(buildData({ script: '  ' }, { partial: true }).error).toContain('script');
        });

        test('传入非法分类时报错', () => {
            expect(buildData({ category: 'nope' }, { partial: true }).error).toContain('category');
        });

        test('只改步骤时其余字段不受影响', () => {
            const { data } = buildData({ steps: 'x\ny' }, { partial: true });
            expect(Object.keys(data)).toEqual(['steps']);
            expect(JSON.parse(data.steps)).toEqual(['x', 'y']);
        });
    });
});
