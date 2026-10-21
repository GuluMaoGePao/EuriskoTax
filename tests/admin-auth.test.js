// 管理台鉴权与工作人员体系（v1.146.0）
//
// v1.145.0 把管理员做成 User.role='admin' —— 管理台因此第一次有了「按人登录」，
// 但工作人员与客户混在一张表，立刻暴露三处问题，这次分表重写，本文件守的就是它们：
//   ① 客户列表混进工作人员（listUsers 的 where 没排除 role，管理员自己出现在
//      「用户」Tab 里还能被改 plan —— v1.145.0 实测到的回归）
//   ② 工作人员继承了 plan / 兑换码 / 计算记录这些客户字段，且能登录客户端 App
//   ③ **谁都能管人**：少了 owner 门禁，一个 support 就能把自己提成 owner，
//      分了三级角色也等于没分
//
// 另外继续守住 v1.145.0 那几条：客户令牌不得越权、降权后立即失效、登录不泄露名单。

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const MW = read('server/src/middleware/adminAuth.js');
const ROUTES = read('server/src/routes/adminAuth.js');
const STAFF = read('server/src/routes/adminStaff.js');
const USERS_ROUTE = read('server/src/routes/adminUsers.js');
const ADMIN_JS = read('src/js/admin/admin.js');
const HTML = read('admin.html');
const APP = read('server/src/app.js');
const SCHEMA = read('server/prisma/schema.prisma');
const DEV_SCHEMA = read('server/prisma/schema.dev.prisma');
const MIGRATION = read('server/prisma/migrations/20261021_add_admin_user/migration.sql');

describe('工作人员与客户必须分表', () => {
    test('鉴权查的是 AdminUser，不是 User', () => {
        expect(MW).toContain('prisma.adminUser.findUnique');
        // 判据是 staffId —— 客户令牌签的是 userId，查另一张表，天然查不到
        expect(MW).toContain("decoded.scope !== 'admin' || !decoded.staffId");
    });

    test('schema 与迁移都有 AdminUser，且两个 schema 口径一致', () => {
        expect(SCHEMA).toMatch(/model AdminUser \{/);
        expect(DEV_SCHEMA).toMatch(/model AdminUser \{/);
        expect(MIGRATION).toContain('CREATE TABLE "AdminUser"');
        expect(MIGRATION).toContain('"email" TEXT NOT NULL');
    });

    test('User.role 已废弃：代码里不再拿它当权限判据', () => {
        expect(SCHEMA).toContain('废弃');
        // 分表之后客户表只装客户，若还有地方按 User.role 判权就是漏改
        expect(MW).not.toContain("user.role !== 'admin'");
    });

    test('工作人员登录不了客户端：客户端认证只认 User 表', () => {
        const authMw = read('server/src/middleware/auth.js');
        expect(authMw).toContain('prisma.user.findUnique');
        expect(authMw).not.toContain('adminUser');
    });
});

describe('三级角色与「谁能管人」', () => {
    test('角色枚举含 owner / admin / support，且业务角色不含 support', () => {
        expect(MW).toMatch(/STAFF_ROLES\s*=\s*\[[^\]]*'owner'[^\]]*'admin'[^\]]*'support'/);
        expect(MW).toMatch(/BUSINESS_ROLES\s*=\s*\[\s*'owner',\s*'admin'\s*\]/);
    });

    test('工作人员管理整组端点都要过 owner 门禁', () => {
        ['/', '/:id', '/:id/password'].forEach(() => {});
        // 三个端点（列表、改角色/状态、改密码）都必须带 requireOwner
        const ownerGuards = (STAFF.match(/requireOwner/g) || []).length;
        expect(ownerGuards).toBeGreaterThanOrEqual(3);
    });

    test('不能修改自己 —— 否则 owner 一键把自己降成 support，全场无人能管', () => {
        expect(STAFF).toContain('req.admin.id === id');
        expect(STAFF).toContain('不能修改自己的角色或状态');
    });

    test('不能干掉最后一个 owner —— 否则管理台锁死', () => {
        expect(STAFF).toContain('countActiveOwners');
        expect(STAFF).toContain('至少要保留一名所有者');
    });

    test('降权 / 禁用立即吊销其令牌，而不是等 2 小时', () => {
        // 状态变 disabled 或角色变化 → 推高 token_version
        expect(STAFF).toContain("data.status === 'disabled' || (data.role && data.role !== target.role)");
        expect(STAFF).toContain('token_version: { increment: 1 }');
    });

    test('只禁用不删除：操作要能追溯到人', () => {
        expect(STAFF).not.toMatch(/router\.delete\(/);
        expect(STAFF).toContain('audit(');
    });
});

describe('业务端点不让 support 碰', () => {
    test('客户权益端点用组合门禁（认人 + 认角色）', () => {
        expect(USERS_ROUTE).toContain('requireBusinessAdmin');
        // 组合门禁必须是「先认人再认角色」两项，缺一项就漏
        expect(MW).toContain('const requireBusinessAdmin = [requireAdmin, requireRoles(BUSINESS_ROLES)]');
    });

    test('反馈与排障话术留给 support —— 那是客服的本职', () => {
        expect(read('server/src/routes/feedback.js')).toContain('requireAdmin,');
        expect(read('server/src/routes/supportAdmin.js')).toContain('requireAdmin,');
    });

    test('app.js 挂上了工作人员路由', () => {
        expect(APP).toContain("app.use('/api/admin/staff', adminStaffRoutes)");
    });
});

describe('会话与登录：不越权、不泄露、不长效', () => {
    test('角色与状态每次请求回库核对，不只信令牌声明', () => {
        expect(MW).toMatch(/staff\.status !== 'active'/);
        expect(MW).toContain('Invalid staff role');
        // 顺序：认 scope 先于查库
        expect(MW.indexOf("decoded.scope")).toBeLessThan(MW.indexOf('prisma.adminUser.findUnique'));
    });

    test('沿用 token_version：改密 / 禁用 / 退出后旧令牌立即失效', () => {
        expect(MW).toContain('Admin session revoked');
        expect(ROUTES).toContain('token_version: { increment: 1 }');
    });

    test('三种失败同一句提示，且未命中也跑一次 bcrypt', () => {
        expect(ROUTES).toContain('邮箱或密码错误，或该账号不可用');
        expect(ROUTES).toContain('DUMMY_HASH');
        expect(ROUTES).toMatch(/const hash = [^\n]*DUMMY_HASH/);
    });

    test('令牌短期，且带 scope=admin', () => {
        expect(ROUTES).toContain("scope: 'admin'");
        expect(ROUTES).toContain("process.env.ADMIN_JWT_EXPIRES_IN || '2h'");
    });

    test('登录限流只计 /login，不把 /me /refresh 也算进去', () => {
        expect(APP).toContain("skip: (req) => req.path !== '/login'");
    });
});

describe('前端：按角色收窄入口（真正的拦截在后端）', () => {
    test('有工作人员 Tab 且登录/自动登录都填了 role', () => {
        expect(HTML).toContain('data-nav="staff"');
        expect(ADMIN_JS).toContain("tab === 'staff'");
        expect(ADMIN_JS).toContain('state.role =');
        expect(ADMIN_JS).toContain('applyRoleVisibility()');
    });

    test('非 owner 看不到工作人员入口，非业务角色看不到客户与配置', () => {
        expect(ADMIN_JS).toContain("document.querySelectorAll('[data-nav=\"staff\"]')");
        expect(ADMIN_JS).toContain("['users', 'invites', 'procodes', 'content', 'taxrates', 'citysocial', 'leads']");
    });

    test('自己那一行不给操作入口 —— 后端会拒，但不必让人先吃个 403', () => {
        expect(ADMIN_JS).toContain('不能修改自己');
        expect(ADMIN_JS).toContain('isSelf');
    });

    test('请求仍走 Bearer，与后端一致', () => {
        expect(ADMIN_JS).toContain('Authorization: `Bearer ${state.token}`');
        expect(ADMIN_JS).not.toContain("'X-Admin-Token': state.token");
    });
});

describe('应急通道收口（v1.146.0）', () => {
    const SEED = read('tools/ops/ops-seed-prod.js');

    test('静态令牌在生产一律不认 —— 不能只靠「生产恰好没配置」', () => {
        // 显式挡 production：否则谁为省事把 ADMIN_TOKEN 配回 .env.shared，门就又开了，
        // 而且从代码上看不出那是意外还是有意
        expect(MW).toMatch(/NODE_ENV === 'production' \? '' : process\.env\.ADMIN_TOKEN/);
        // 门禁脚本自注入 ADMIN_TOKEN 跑管理端点，跑的是 development，不受影响
        expect(read('server/scripts/verify-local-auth.js')).toContain("NODE_ENV: 'development'");
    });

    test('生产补种改走工作人员登录，不再依赖静态令牌', () => {
        expect(SEED).toContain('ADMIN_STAFF_EMAIL');
        expect(SEED).toContain('/api/admin/login');
        expect(SEED).toContain('Bearer ${bearer}');
    });

    test('没有凭证时跳过而不是失败 —— 补种不该阻断发布', () => {
        expect(SEED).toContain('return EXIT_NO_TOKEN');
    });
});
