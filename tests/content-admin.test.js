// 阶段11 内容中心测试
//   1) 后台 DOM 契约：admin.js 选择器 ↔ admin.html 元素 id（防止两侧改版后选择器失配而静默失效）
//   2) 内容编辑器动态字段契约：collectContentForm 引用的字段必须都被 renderContentEditor 渲染
//   3) contentService 可见性分层纯逻辑：游客/基础版/专业版的 audience 集合与时间窗判定

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const HTML = read('admin.html');
const ADMIN_JS = read('src/js/admin/admin.js');

const SECTION_START = ADMIN_JS.indexOf('// ---------- 内容中心（阶段11） ----------');
const SECTION_END = ADMIN_JS.indexOf('// ---------- 动作分发');
const CONTENT_SECTION = ADMIN_JS.slice(SECTION_START, SECTION_END);

describe('阶段11 内容中心 - 后台 DOM 契约', () => {
    test('admin.html 同时提供桌面端与移动端的「内容」导航入口', () => {
        const navCount = (HTML.match(/data-nav="content"/g) || []).length;
        expect(navCount).toBe(2);
    });

    test('admin.html 提供内容视图容器与筛选/列表/编辑器节点', () => {
        ['id="view-content"', 'id="content-type-filter"', 'id="content-status-filter"',
            'id="content-audience-filter"', 'id="content-query"', 'id="content-list"', 'id="content-editor"']
            .forEach((needle) => expect(HTML).toContain(needle));
    });

    test('admin.js 静态选择器引用的 id 均存在于 admin.html', () => {
        expect(SECTION_START).toBeGreaterThan(-1);
        expect(SECTION_END).toBeGreaterThan(SECTION_START);

        // 取 $('  #静态id  ') 形式的引用（排除编辑器动态生成的 content-f-* 字段）
        const ids = new Set(
            [...CONTENT_SECTION.matchAll(/\$\('#([A-Za-z0-9_-]+)'\)/g)]
                .map((m) => m[1])
                .filter((id) => !id.startsWith('content-f-'))
        );
        expect(ids.size).toBeGreaterThan(0);
        const missing = [...ids].filter((id) => !HTML.includes(`id="${id}"`));
        expect(missing).toEqual([]);
    });

    test('编辑器动态字段：collectContentForm 读取的字段都被 renderContentEditor 渲染', () => {
        const declared = new Set(
            [...CONTENT_SECTION.matchAll(/id="(content-f-[A-Za-z0-9_-]+)"/g)].map((m) => m[1])
        );
        const referenced = new Set(
            [...CONTENT_SECTION.matchAll(/\$\('#(content-f-[A-Za-z0-9_-]+)'\)/g)].map((m) => m[1])
        );
        expect(referenced.size).toBeGreaterThan(0);
        const missing = [...referenced].filter((id) => !declared.has(id));
        expect(missing).toEqual([]);
    });

    test('内容编辑器覆盖四类展示位与三种投放对象', () => {
        ['assistant_qa', 'home_banner', 'modal', 'notice_list'].forEach((key) => {
            expect(CONTENT_SECTION).toContain(`key: '${key}'`);
        });
        ['all', 'free', 'pro'].forEach((key) => {
            expect(CONTENT_SECTION).toContain(`${key}: { label:`);
        });
    });

    test('内容中心动作全部在 handleAction 中分发', () => {
        ['search-content', 'new-content', 'content-edit', 'content-delete',
            'content-save', 'content-cancel', 'publish-content', 'content-prev', 'content-next']
            .forEach((act) => {
                expect(ADMIN_JS).toContain(`name === '${act}'`);
            });
    });
});

describe('阶段11 内容中心 - contentService 可见性分层', () => {
    let svc;

    beforeAll(() => {
        // 避免 PrismaClient 构造时因缺少数据源报错；纯逻辑测试不发起任何查询
        process.env.DATABASE_URL = process.env.DATABASE_URL || 'file:./prisma/dev.db';
        svc = require('../server/src/services/contentService');
    });

    test('游客仅可见 all 档内容', () => {
        expect(svc.allowedAudiences(null)).toEqual(['all']);
        expect(svc.allowedAudiences(undefined)).toEqual(['all']);
    });

    test('基础版可见 all + free', () => {
        expect(svc.allowedAudiences({ plan: 'free' })).toEqual(['all', 'free']);
    });

    test('专业版与未过期的体验版可见全部三档', () => {
        expect(svc.allowedAudiences({ plan: 'pro', plan_expires_at: null })).toEqual(['all', 'free', 'pro']);
        const future = new Date(Date.now() + 86400000);
        expect(svc.allowedAudiences({ plan: 'pro', plan_expires_at: future })).toEqual(['all', 'free', 'pro']);
    });

    test('已过期的专业版回落为 all + free', () => {
        const past = new Date(Date.now() - 86400000);
        expect(svc.allowedAudiences({ plan: 'pro', plan_expires_at: past })).toEqual(['all', 'free']);
    });

    test('时间窗：草稿 / 预约未到 / 已过期 均不可见', () => {
        const past = new Date(Date.now() - 86400000);
        const future = new Date(Date.now() + 86400000);
        expect(svc.isWithinWindow({ status: 'draft', publish_at: past, expire_at: null })).toBe(false);
        expect(svc.isWithinWindow({ status: 'revoked', publish_at: past, expire_at: null })).toBe(false);
        expect(svc.isWithinWindow({ status: 'published', publish_at: future, expire_at: null })).toBe(false);
        expect(svc.isWithinWindow({ status: 'published', publish_at: past, expire_at: past })).toBe(false);
        expect(svc.isWithinWindow({ status: 'published', publish_at: past, expire_at: null })).toBe(true);
        expect(svc.isWithinWindow({ status: 'published', publish_at: past, expire_at: future })).toBe(true);
    });

    test('placements / keywords 解析容错', () => {
        expect(svc.parseJsonArray('["a","b"]')).toEqual(['a', 'b']);
        expect(svc.parseJsonArray('not-json')).toEqual([]);
        expect(svc.parseJsonArray(undefined)).toEqual([]);
        expect(svc.parseJsonArray('{"a":1}')).toEqual([]);
    });

    test('revision 指纹对相同载荷稳定、对不同载荷变化', () => {
        const a = [{ id: 'p1', answer: 'x' }];
        const b = [{ id: 'p1', answer: 'y' }];
        expect(svc.revisionOf(a)).toBe(svc.revisionOf([{ id: 'p1', answer: 'x' }]));
        expect(svc.revisionOf(a)).not.toBe(svc.revisionOf(b));
        expect(svc.revisionOf([])).toHaveLength(12);
    });
});
