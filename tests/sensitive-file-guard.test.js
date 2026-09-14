// 敏感文件守卫：静态托管的是仓库根，不设闸就等于把这些都变成可下载资源
//
// 实测可达（开了「公网分享」或部署到公网后任何人都能取）：
//     GET /server/prisma/dev.db   → SQLite 全库（用户邮箱 + 密码哈希 + 计算记录）
//     GET /.git/HEAD              → 配合 .git/objects 可拖走整份源码历史
//     GET /server/src/app.js      → 后端源码（限流规则、管理端点一览无余）
//     GET /tools/ops/*.json       → 运维配置（SMTP 授权码 / 隧道 token）
//     GET /dev-account.local.json → 本机测试账号的真实密码
//
// 这里钉住五件事：
//   ① 点文件段、server/tools/docs 顶层目录、数据库与密钥后缀 → 一律 404（本机请求也一样）；
//   ② `*.local.json` 是唯一例外：仅环回地址可读 —— 登录页「填入本地测试账号」依赖它，行为不变；
//   ③ 用 404 而非 403：不向公网确认「这个文件存在」；
//   ④ 普通静态资源（页面 / 脚本 / sitemap / manifest）一律放行，漏放行等于打挂整站；
//   ⑤ 守卫必须挂在 express.static 之前（顺序错了等于没拦）。
const fs = require('fs');
const path = require('path');

const {
    sensitiveFileGuard,
    shouldBlock,
    isLoopbackAddress,
    BLOCKED_SUFFIXES,
    LOCAL_ONLY_SUFFIX
} = require('../server/src/middleware/sensitiveFileGuard');

// 极简 req / res 替身：只用到中间件真正读取的那几个字段
function run(targetPath, ip) {
    return new Promise((resolve) => {
        const res = {
            statusCode: null,
            body: null,
            status(code) { this.statusCode = code; return this; },
            send(body) { this.body = body; return this; }
        };
        let nextCalled = false;
        sensitiveFileGuard({ path: targetPath, ip }, res, () => {
            nextCalled = true;
            resolve({ nextCalled, res });
        });
        // 被拦下时 next 不会被调用，等一轮微任务即可判定
        setTimeout(() => resolve({ nextCalled, res }), 0);
    });
}

// 断言「被拦下」：既不进静态中间件，也返回 404
async function expectBlocked(targetPath, ip) {
    const { nextCalled, res } = await run(targetPath, ip);
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(404);
}

describe('点文件段一律不下发（express.static 的 dotfiles 只挡最后一段，挡不住 /.git/config）', () => {
    test('.git 与 .env 类路径全部拦下', async () => {
        await expectBlocked('/.git/HEAD', '127.0.0.1');
        await expectBlocked('/.git/config', '127.0.0.1');
        await expectBlocked('/.git/objects/ab/cdef', '203.0.113.9');
        await expectBlocked('/.env', '127.0.0.1');
        await expectBlocked('/server/.env', '127.0.0.1');
    });

    test('其它点目录（.github / .codebuddy / .vscode）同样拦下', async () => {
        await expectBlocked('/.github/workflows/ci.yml', '203.0.113.9');
        await expectBlocked('/.codebuddy/teams/x.json', '203.0.113.9');
        await expectBlocked('/.vscode/settings.json', '203.0.113.9');
    });
});

describe('后端源码 / 运维脚本 / 内部文档顶层目录不下发', () => {
    test('server 目录：源码、迁移 SQL、本地 SQLite 全库', async () => {
        await expectBlocked('/server/src/app.js', '127.0.0.1');
        await expectBlocked('/server/prisma/dev.db', '127.0.0.1');
        await expectBlocked('/server/prisma/migrations/001_init/migration.sql', '203.0.113.9');
    });

    test('tools 目录：运维脚本与含 SMTP 授权码 / 隧道 token 的配置', async () => {
        await expectBlocked('/tools/ops/ops-notify-config.json', '127.0.0.1');
        await expectBlocked('/tools/ops/ops-start-dev.ps1', '203.0.113.9');
    });

    test('docs 目录：内部开发方案不外发', async () => {
        await expectBlocked('/docs/development/development-plan.md', '203.0.113.9');
    });
});

describe('数据库与私钥后缀：无论放在哪个目录都不下发', () => {
    test('后缀清单覆盖 .db / .sqlite / .pem / .key 等', () => {
        expect(BLOCKED_SUFFIXES).toEqual(expect.arrayContaining(['.db', '.sqlite', '.sqlite3', '.pem', '.key']));
    });

    test('任何目录下的库文件与私钥都被拦', async () => {
        await expectBlocked('/data/backup.db', '127.0.0.1');
        await expectBlocked('/cert/server.pem', '203.0.113.9');
        await expectBlocked('/cert/private.key', '203.0.113.9');
    });
});

describe('*.local.json：唯一按来源区分的文件', () => {
    test('本机（127.0.0.1 / ::1）可读 —— 登录页预填测试账号照旧可用', async () => {
        expect(LOCAL_ONLY_SUFFIX).toBe('.local.json');
        const v4 = await run('/dev-account.local.json', '127.0.0.1');
        expect(v4.nextCalled).toBe(true);
        const v6 = await run('/dev-account.local.json', '::ffff:127.0.0.1');
        expect(v6.nextCalled).toBe(true);
    });

    test('公网来源（含 X-Forwarded-For 里的客户端 IP）一律 404', async () => {
        await expectBlocked('/dev-account.local.json', '203.0.113.9');
        await expectBlocked('/dev-account.local.json', '::ffff:203.0.113.9');
        await expectBlocked('/dev-account.local.json', undefined);
    });

    test('未来新增的同类覆盖文件同样受保护（后缀规则而非写死文件名）', async () => {
        await expectBlocked('/ops-token.local.json', '203.0.113.9');
    });
});

describe('不误伤普通静态资源', () => {
    test('页面 / 脚本 / PWA 文件 / SEO 资源一律放行（漏放行等于打挂整站）', async () => {
        const paths = [
            '/', '/index.html', '/admin.html',
            '/src/js/api/api-client.js', '/src/js/calculation/tax-constants.js',
            '/seo/equity-incentive.html', '/seo/labor-withholding.html',
            '/manifest.json', '/service-worker.js', '/version.json',
            '/sitemap.xml', '/robots.txt', '/images/logo.png'
        ];
        for (const p of paths) {
            // eslint-disable-next-line no-await-in-loop
            const { nextCalled } = await run(p, '203.0.113.9');
            expect(nextCalled).toBe(true);
        }
    });

    test('路径大小写不敏感（/Server/App.JS 这种绕写也拦）', async () => {
        expect(shouldBlock('/Server/prisma/DEV.DB', false)).toBe(true);
    });

    test('守卫挂在 express.static 之前（顺序错了等于没拦）', () => {
        const src = fs.readFileSync(path.join(__dirname, '..', 'server', 'src', 'app.js'), 'utf8');
        expect(src).toMatch(/require\('\.\/middleware\/sensitiveFileGuard'\)/);
        const guardAt = src.indexOf('app.use(sensitiveFileGuard)');
        expect(guardAt).toBeGreaterThan(-1);
        expect(guardAt).toBeLessThan(src.indexOf('app.use(express.static('));
    });
});

describe('环回地址判定', () => {
    test('127.0.0.1 / ::1 / ::ffff:127.0.0.1 算本机，其余不算（未知来源按公网处理）', () => {
        expect(isLoopbackAddress('127.0.0.1')).toBe(true);
        expect(isLoopbackAddress('::1')).toBe(true);
        expect(isLoopbackAddress('::ffff:127.0.0.1')).toBe(true);
        expect(isLoopbackAddress('203.0.113.9')).toBe(false);
        expect(isLoopbackAddress('10.0.0.7')).toBe(false);
        expect(isLoopbackAddress(undefined)).toBe(false);
    });
});
