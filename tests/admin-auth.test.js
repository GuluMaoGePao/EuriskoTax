// 管理台登录（v1.145.0）：从「一把静态 ADMIN_TOKEN」改为「邮箱 + 密码 + 短期 JWT」
//
// 守的是四件真会出事的事，不是凑数：
//   ① App 那把 7 天令牌能不能顺带进管理台 —— 能就是全线失守：
//      任一注册用户拿自己的令牌就能改税率、发兑换码、看所有用户。
//   ② 管理员被降权 / 改密之后，已签发的令牌是不是还有效 —— 若只信令牌里的
//      声明，撤销要等它自己过期，那两小时里「已撤销的管理员」照样是管理员。
//   ③ 登录接口会不会变成「枚举哪些邮箱是管理员」的探针 —— 报错分三种、
//      或者命中/未命中的响应耗时不同，都等于把管理员名单递出去。
//   ④ 前端与后端凭证格式对不上 —— 一边发 Bearer 一边验 X-Admin-Token，
//      表现是管理台每个 Tab 全 401，而且看日志查不出所以然。
//
// 另有两条守「改动完整性」：迁移落地、账号只由运维脚本授予。

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const MW = read('server/src/middleware/adminAuth.js');
const ROUTES = read('server/src/routes/adminAuth.js');
const ADMIN_JS = read('src/js/admin/admin.js');
const HTML = read('admin.html');
const APP = read('server/src/app.js');
const SCHEMA = read('server/prisma/schema.prisma');
const DEV_SCHEMA = read('server/prisma/schema.dev.prisma');
const MIGRATION = read('server/prisma/migrations/20261021_add_user_role/migration.sql');
const ADMIN_OPS = read('server/scripts/admin-user.js');

describe('管理台鉴权 —— App 令牌不得越权', () => {
    test('认令牌先认 scope=admin，App 签发的令牌没有 scope', () => {
        expect(MW).toContain("decoded.scope !== 'admin'");
        // 拒绝要先于任何查库/放行：顺序反了就是「先查完再判断」，白查一次还容易漏
        expect(MW.indexOf("decoded.scope")).toBeLessThan(MW.indexOf('prisma.user.findUnique'));
    });

    test('角色每次请求都回库核对，不只信令牌里的声明', () => {
        expect(MW).toContain("user.role !== 'admin'");
        // 查库必须带上 role 字段 —— 漏选就等于永远查不到，判断恒为「不是管理员」
        expect(MW).toMatch(/select:\s*\{[^}]*role:\s*true/);
    });

    test('沿用 token_version 吊销：改密 / 退出后旧会话立即失效', () => {
        expect(MW).toContain('issuedTv');
        expect(MW).toContain('currentTv');
        expect(MW).toContain('Admin session revoked');
    });

    test('保留静态令牌作为应急通道，但只在没带 Bearer 时才检查', () => {
        expect(MW).toContain("req.get('X-Admin-Token')");
        // 管理员账号被误删 / 密码忘了走不通邮件找回时，这是最后的入口
        expect(MW.indexOf('if (bearer)')).toBeLessThan(MW.indexOf("req.get('X-Admin-Token')"));
    });
});

describe('管理台登录接口 —— 不泄露、不长效', () => {
    test('三种失败（无此邮箱 / 非管理员 / 密码错）合并成同一句提示', () => {
        expect(ROUTES).toMatch(/if\s*\(!user\s*\|\|\s*user\.role\s*!==\s*'admin'\s*\|\|\s*!passwordOk\)/);
        expect(ROUTES).toContain('邮箱或密码错误，或该账号不是管理员');
    });

    test('未命中账号也跑一次 bcrypt —— 否则响应耗时差异会暴露哪些邮箱存在', () => {
        expect(ROUTES).toContain('DUMMY_HASH');
        // dummy 必须真的参与比对，定义了不用等于没防
        expect(ROUTES).toMatch(/const hash = [^\n]*DUMMY_HASH/);
        expect(ROUTES).toContain('bcrypt.compare(password, hash)');
    });

    test('签发的令牌带 scope=admin，且有效期独立于 App 的 7 天', () => {
        expect(ROUTES).toContain("scope: 'admin'");
        expect(ROUTES).toContain("process.env.ADMIN_JWT_EXPIRES_IN || '2h'");
    });

    test('密码用 bcrypt 比对，不出现明文比较', () => {
        expect(ROUTES).toContain('bcrypt.compare');
        expect(ROUTES).not.toMatch(/password\s*===\s*user\./);
    });
});

describe('前端与后端凭证格式必须一致', () => {
    test('admin.js 发 Authorization: Bearer', () => {
        expect(ADMIN_JS).toContain('Authorization: `Bearer ${state.token}`');
    });

    test('不再发 X-Admin-Token —— 与后端对不上会全站 401', () => {
        expect(ADMIN_JS).not.toContain("'X-Admin-Token': state.token");
    });

    test('登录表单是邮箱 + 密码两个输入框，admin.js 取的是同一批 id', () => {
        expect(HTML).toContain('id="login-email-input"');
        expect(HTML).toContain('id="login-password-input"');
        expect(ADMIN_JS).toContain("'#login-email-input'");
        expect(ADMIN_JS).toContain("'#login-password-input'");
    });

    test('会话过期自动续期一次，而不是直接把人踢回登录页', () => {
        expect(ADMIN_JS).toContain('/api/admin/refresh');
        // 续期必须并发收敛：多个请求同时 401 时各续各的会互相把令牌刷没
        expect(ADMIN_JS).toContain('if (refreshing) return refreshing;');
    });

    test('退出时通知后端吊销，而不只是清本地', () => {
        expect(ADMIN_JS).toContain('/api/admin/logout');
    });
});

describe('数据层与运维入口', () => {
    test('生产与开发 schema 都加了 role，且默认 user（老用户不会自动变管理员）', () => {
        expect(SCHEMA).toMatch(/role\s+String\s+@default\("user"\)/);
        expect(DEV_SCHEMA).toMatch(/role\s+String\s+@default\("user"\)/);
    });

    test('迁移给存量行填 user，且非空', () => {
        expect(MIGRATION).toContain('ADD COLUMN "role" TEXT NOT NULL DEFAULT');
    });

    test('app.js 挂载会话路由，且登录单独限流', () => {
        expect(APP).toContain("app.use('/api/admin', adminLoginLimiter, adminAuthRoutes)");
        // 限流只计 /login —— 把 /me /refresh 也算进来，正常用一会儿就把自己锁住
        expect(APP).toContain("skip: (req) => req.path !== '/login'");
    });

    test('管理员只能由运维脚本授予，没有自助注册入口', () => {
        expect(ADMIN_OPS).toContain("role: 'admin'");
        expect(ADMIN_OPS).toContain('promote');
        expect(ADMIN_OPS).toContain('demote');
        // 撤销管理员必须同时吊销会话，否则降权要等令牌自己过期
        expect(ADMIN_OPS).toContain('token_version: { increment: 1 }');
        // 密码要有长度下限：这个账号能改税率、发兑换码，短密码扛不住撞库
        expect(ADMIN_OPS).toContain('MIN_PASSWORD_LENGTH');
    });
});
