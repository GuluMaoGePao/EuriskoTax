/**
 * 登录标识 = 邮箱 或 用户名（v1.118.0）
 *
 * 为什么值得一份单测：
 *   登录页此前只认邮箱，而注册是「用户名 + 邮箱」双唯一 —— 用户记住的往往是用户名，
 *   结果登录时反复试错、走「忘记密码」绕一圈。用户名注册时即唯一校验，拿它登录不需要
 *   任何新的验证手段，是零成本的扩入口。
 *
 * 同时这里钉住**反面**：手机号**不能**成为登录凭据。它是未验证字段（注册选填、个人中心
 * 随手可改，任何人都能填任意 11 位），一旦当凭据就会出现「A 填了 B 的号 → B 登录进
 * A 的账号」的串号/冒领。要支持手机号登录，必须先接短信验证码 + phone 唯一索引 +
 * phone_verified_at —— 这三样没到位前，任何"顺手加个手机号登录"的改动都应在这里被拦下。
 *
 * 守的三条：
 *   ① 后端按形态分流（含 @ 走邮箱、其余走用户名），且 loginUser 段里不出现 phone；
 *   ② 前端登录框文案与输入类型跟着改（type=email 会挡住纯用户名）；
 *   ③ 手机号在注册页与个人中心的口径统一为「联系方式，不用于登录」。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const readSrc = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** 取 authService 里 loginUser 函数体（到下一个顶层 const 为止），避免"全文出现过 phone"误判 */
function loginUserSection() {
    const src = readSrc('server/src/services/authService.js');
    const start = src.indexOf('const loginUser');
    expect(start).toBeGreaterThan(-1);
    const rest = src.slice(start);
    const end = rest.indexOf('\nconst ');
    return end > -1 ? rest.slice(0, end) : rest;
}

/** 取 index.html 中某个 id 的 input 标签原文 */
function inputTagById(id) {
    const html = readSrc('index.html');
    const m = html.match(new RegExp('<input[^>]*id="' + id + '"[^>]*>'));
    return m ? m[0] : '';
}

describe('后端 loginUser：邮箱与用户名都能命中，手机号不参与', () => {
    const section = loginUserSection();

    test('按形态分流：形似邮箱走 email，其余走 username', () => {
        expect(section).toContain('EMAIL_RE.test(identifier)');
        expect(section).toContain('{ email: normalizeEmail(identifier) }');
        expect(section).toContain('{ username: identifier }');
    });

    test('查库条件里不出现 phone —— 手机号不得作为登录凭据', () => {
        // 只看查询条件本身：返回体带 phone: user.phone 是给前端展示用的，不算凭据
        const query = section.match(/findFirst\(\{[\s\S]*?\}\);/);
        expect(query).not.toBeNull();
        expect(query[0].toLowerCase()).not.toContain('phone');
        expect(section).not.toContain('phone: identifier');
    });

    test('错误提示统一为 Invalid account or password（不再单指邮箱）', () => {
        expect(section).toContain("new Error('Invalid account or password')");
        expect(section).not.toContain('Invalid email or password');
    });

    test('用户表 phone 仍是可空非唯一字段（未验证，故不可当身份凭据）', () => {
        const schema = readSrc('server/prisma/schema.prisma');
        const userBlock = schema.slice(schema.indexOf('model User {'), schema.indexOf('model ', schema.indexOf('model User {') + 10));
        expect(userBlock).toMatch(/phone\s+String\?/);
        expect(userBlock).not.toMatch(/phone\s+String\s+@unique/);
    });

    test('swagger 写明「邮箱 或 用户名」并提示手机号不可用', () => {
        const routes = readSrc('server/src/routes/auth.js');
        const loginBlock = routes.slice(routes.indexOf('/api/auth/login'), routes.indexOf('/api/auth/claim-trial'));
        expect(loginBlock).toContain('邮箱 或 用户名');
        expect(loginBlock).toContain('手机号不可作为登录凭据');
    });
});

describe('前端登录框：文案与输入类型跟着改', () => {
    const tag = inputTagById('login-email');

    test('提示为「邮箱或用户名」，且 type 不再锁死 email（否则浏览器会挡住纯用户名）', () => {
        expect(tag).toContain('placeholder="请输入邮箱或用户名"');
        expect(tag).not.toMatch(/type="email"/);
    });

    test('label 与页面提示同步，并指明忘记账号时走注册邮箱找回', () => {
        const html = readSrc('index.html');
        expect(html).toContain('<label for="login-email" class="label">邮箱或用户名</label>');
        expect(html).toContain('两种都可以登录');
    });

    test('handleLogin 取值为账号语义，空值提示不再只提邮箱', () => {
        const ui = readSrc('src/js/auth/auth-ui.js');
        expect(ui).toContain("showAlert('请输入邮箱或用户名、密码')");
        expect(ui).toContain('apiClient.loginUser(account, password, rememberMe)');
    });

    test('打开重置密码面板时，登录框里若填的是用户名不得回填成收件邮箱', () => {
        const ui = readSrc('src/js/auth/auth-ui.js');
        const panel = ui.slice(ui.indexOf('function showResetPasswordPanel'), ui.indexOf('function closeResetPasswordPanel'));
        expect(panel).toMatch(/test\(loginEmailValue\)/);
        // 回填前必须有邮箱格式判断，否则验证码会发到一个不存在的地址
        expect(panel).toMatch(/if \(resetEmail && loginEmailValue && \/\^\[\^\\s@\]/);
    });

    test('api-client 把账号放进 email 字段（字段名为兼容既有客户端保持不变）', () => {
        const client = readSrc('src/js/api/api-client.js');
        const fn = client.slice(client.indexOf('async function loginUser'), client.indexOf('async function loginUser') + 400);
        expect(fn).toContain('email: account');
        expect(client).toContain("'Invalid account or password'");
    });
});

describe('手机号口径：注册页与个人中心都写明「不用于登录」', () => {
    test('注册页：选填 + 仅作联系方式', () => {
        const html = readSrc('index.html');
        expect(html).toContain('<label for="register-phone" class="label">联系手机号（选填）</label>');
        expect(html).toContain('仅作联系方式，不用于登录');
    });

    test('个人中心：label 与提示同步', () => {
        const html = readSrc('index.html');
        const profileBlock = html.slice(html.indexOf('id="profile-phone"') - 400, html.indexOf('id="profile-phone-save"') + 400);
        expect(profileBlock).toContain('联系手机号（选填）');
        expect(profileBlock).toContain('不用于登录');
    });

    test('注册手机号仍保持选填（必填只会换来未验证的脏数据，见 CHANGELOG 1.118.0）', () => {
        const html = readSrc('index.html');
        expect(html).not.toMatch(/<label for="register-phone"[^>]*>手机号<i class="req-star"/);
        const ui = readSrc('src/js/auth/auth-ui.js');
        // 必填清单里不应出现 register-phone
        expect(ui.slice(ui.indexOf('const requiredChecks'), ui.indexOf('let firstInvalidId'))).not.toContain('register-phone');
    });
});

describe('api-client.loginUser 实际请求体', () => {
    let captured = null;

    beforeAll(() => {
        global.window = { location: { hostname: 'localhost', protocol: 'http:', host: 'localhost:3000' } };
        const store = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
        global.sessionStorage = store;
        global.localStorage = store;
        const src = readSrc('src/js/api/api-client.js').replace(/^export\s+default\s+\w+;?\s*$/m, '');
        (0, eval)(src);
    });

    afterEach(() => {
        captured = null;
        delete global.fetch;
    });

    const okResponse = () => Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, data: { token: 't' } })
    });

    test('用户名登录也走同一个 /auth/login，值落在 email 字段', async () => {
        global.fetch = jest.fn((url, opts) => {
            captured = { url, body: opts.body };
            return okResponse();
        });
        await apiClient.loginUser('zhangsan', 'pwd123', true);
        expect(captured.url).toContain('/auth/login');
        expect(JSON.parse(captured.body)).toEqual({ email: 'zhangsan', password: 'pwd123' });
    });

    test('邮箱登录行为不变（向后兼容）', async () => {
        global.fetch = jest.fn((url, opts) => {
            captured = { url, body: opts.body };
            return okResponse();
        });
        await apiClient.loginUser('Dev@Example.com', 'pwd123');
        expect(JSON.parse(captured.body)).toEqual({ email: 'Dev@Example.com', password: 'pwd123' });
    });
});
