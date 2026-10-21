/**
 * 登录标识 = 邮箱唯一（v1.144.0）
 *
 * 为什么值得一份单测：
 *   登录页此前接受「邮箱 或 用户名」（v1.118.0 加的双入口）。上线后的实际代价是
 *   「账号」这个概念有了两个真相源 —— 用户名注册时不校验邮箱归属、改了邮箱用户名不变，
 *   于是"我是哪个账号"要同时记两件事；忘记密码链路也跟着分叉：填用户名的人收不到
 *   验证码邮件，只能回头猜自己注册时用的邮箱是哪个。
 *
 *   邮箱是唯一经过验证码验证的字段，收敛到它，登录与找回才能共用同一个标识。
 *   这次把双入口**收回去**，本文件随之改写为"只认邮箱"版本。
 *
 * 同时这里钉住**反面**：手机号**不能**成为登录凭据。它是未验证字段（注册选填、个人中心
 * 随手可改，任何人都能填任意 11 位），一旦当凭据就会出现「A 填了 B 的号 → B 登录进
 * A 的账号」的串号/冒领。要支持手机号登录，必须先接短信验证码 + phone 唯一索引 +
 * phone_verified_at —— 这三样没到位前，任何"顺手加个手机号登录"的改动都应在这里被拦下。
 *
 * 守的四条：
 *   ① 后端只按 email 查库，loginUser 段里既没有 username 分支也没有 phone；
 *   ② 前端登录框 type=email，文案只说邮箱；
 *   ③ 手机号在注册页与个人中心的口径统一为「联系方式，不用于登录」；
 *   ④ 非邮箱格式在查库前直接 401（不查库、不留"顺手试试用户名"的口子）。
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

describe('后端 loginUser：只认邮箱，用户名与手机号都不参与', () => {
    const section = loginUserSection();

    test('查库条件只有 email，没有 username 分支', () => {
        expect(section).toContain('{ email: normalizeEmail(identifier) }');
        expect(section).not.toContain('{ username: identifier }');
        expect(section).not.toContain('findFirst(');
    });

    test('非邮箱格式在查库前直接 401（不给"顺手试试用户名"留口子）', () => {
        expect(section).toMatch(/EMAIL_RE\.test\(identifier\)/);
        expect(section).toContain("new Error('Invalid email or password')");
        // 格式化校验失败与查不到、密码错，返回同一个错误串 —— 不泄露"这个邮箱注册过没有"
        expect(section).not.toContain('Invalid account or password');
    });

    test('查库条件里不出现 phone —— 手机号不得作为登录凭据', () => {
        // 只看查询条件本身：返回体带 phone: user.phone 是给前端展示用的，不算凭据
        const query = section.match(/findUnique\(\{[\s\S]*?\}\);/);
        expect(query).not.toBeNull();
        expect(query[0].toLowerCase()).not.toContain('phone');
        expect(section).not.toContain('phone: identifier');
    });

    test('用户表 phone 仍是可空非唯一字段（未验证，故不可当身份凭据）', () => {
        const schema = readSrc('server/prisma/schema.prisma');
        const userBlock = schema.slice(schema.indexOf('model User {'), schema.indexOf('model ', schema.indexOf('model User {') + 10));
        expect(userBlock).toMatch(/phone\s+String\?/);
        expect(userBlock).not.toMatch(/phone\s+String\s+@unique/);
    });

    test('swagger 写明「注册邮箱」且不再提用户名登录', () => {
        const routes = readSrc('server/src/routes/auth.js');
        const loginBlock = routes.slice(routes.indexOf('/api/auth/login'), routes.indexOf('/api/auth/claim-trial'));
        expect(loginBlock).toContain('注册邮箱');
        expect(loginBlock).toContain('不再支持用户名登录');
        expect(loginBlock).toContain('手机号不可作为登录凭据');
    });
});

describe('前端登录框：只说邮箱，type 锁死 email', () => {
    const tag = inputTagById('login-email');

    test('type=email + 邮箱 placeholder（浏览器与键盘都按邮箱处理）', () => {
        expect(tag).toContain('type="email"');
        expect(tag).toContain('placeholder="name@example.com"');
        expect(tag).not.toContain('邮箱或用户名');
    });

    test('label 只写「邮箱」，且标红星为必填', () => {
        const html = readSrc('index.html');
        expect(html).toContain('<label for="login-email" class="label">邮箱<i class="req-star" aria-hidden="true">*</i></label>');
        // 登录表单内不再出现解释性小字：placeholder 已说明一切，说明行是重复信息
        const loginForm = html.slice(html.indexOf('id="login-form"'), html.indexOf('id="register-form"'));
        expect(loginForm).not.toContain('text-xs text-gray-500');
    });

    test('handleLogin 的空值与格式校验都只提邮箱', () => {
        const ui = readSrc('src/js/auth/auth-ui.js');
        expect(ui).toContain("showLoginFieldError('login-email', '请输入邮箱')");
        expect(ui).toContain("showLoginFieldError('login-email', '请输入正确的邮箱格式')");
        expect(ui).toContain("showLoginFieldError('login-password', '请输入密码')");
        expect(ui).not.toContain('请输入邮箱或用户名');
    });

    test('打开重置密码面板时，登录框值不是邮箱格式不得回填', () => {
        const ui = readSrc('src/js/auth/auth-ui.js');
        const panel = ui.slice(ui.indexOf('function showResetPasswordPanel'), ui.indexOf('function closeResetPasswordPanel'));
        // 回填前必须有邮箱格式判断，否则验证码会发到一个不存在的地址。
        // v1.144.0 起四处（登录 / 注册发码 / 重置发码 / 重置提交）共用 EMAIL_PATTERN，
        // 不再各写一份内联正则 —— 同时钉住常量本身，防止有人为了过测试把它改成 /.*/
        expect(panel).toContain('EMAIL_PATTERN.test(loginEmailValue)');
        expect(ui).toContain('const EMAIL_PATTERN = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;');
    });

    test('api-client 把账号放进 email 字段（字段名为兼容既有客户端保持不变）', () => {
        const client = readSrc('src/js/api/api-client.js');
        const fn = client.slice(client.indexOf('async function loginUser'), client.indexOf('async function loginUser') + 400);
        expect(fn).toContain('email: account');
        // 新错误串进映射表；老串（1.118~1.143 的服务端）保留，避免旧服务端露英文
        expect(client).toContain("'Invalid email or password'");
        expect(client).toContain("'Invalid account or password'");
    });
});

describe('手机号口径：注册页选填、个人中心写明「不用于登录」', () => {
    test('注册页：选填 + 占位讲清用途（v1.144.0 撤掉字段下的辅助行，不再摆决策口径）', () => {
        const html = readSrc('index.html');
        expect(html).toContain('id="register-phone"');
        expect(html).toContain('placeholder="选填，用于顾问回电"');
        // 「不用于登录」是实现口径（为什么不做手机号登录），对填表的人没有用；
        // 占位里的「用于顾问回电」已经回答了「填了会怎样」。
        expect(html).not.toContain('仅用于顾问回电，不用于登录');
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

describe('注册页邀请码选填（v1.144.0）', () => {
    test('邀请码 label 不再带必填红星，而是「选填」灰字', () => {
        const html = readSrc('index.html');
        expect(html).toContain('<label for="register-invite-code" class="label">邀请码<span class="label-optional">选填</span></label>');
        expect(html).not.toMatch(/<label for="register-invite-code"[^>]*>邀请码<i class="req-star"/);
    });

    test('必填清单里没有 register-invite-code', () => {
        const ui = readSrc('src/js/auth/auth-ui.js');
        const block = ui.slice(ui.indexOf('const requiredChecks'), ui.indexOf('let firstInvalidId'));
        expect(block).not.toContain('register-invite-code');
    });

    test('后端 register 不再拦「未填邀请码」，service 里邀请码校验包在 if 内', () => {
        const ctrl = readSrc('server/src/controllers/authController.js');
        expect(ctrl).not.toContain("'Invite code is required'");
        const svc = readSrc('server/src/services/authService.js');
        expect(svc).toContain('if (code) {');
        expect(svc).toContain('const checkInviteCode');
    });

    test('swagger 的 required 清单里没有 inviteCode', () => {
        const routes = readSrc('server/src/routes/auth.js');
        // 边界取 register → login：swagger 块按 send-code / send-reset-code / reset-password /
        // register / login 的顺序排，用 send-code 当右边界会切出空串（它排在 register 之前）
        const regBlock = routes.slice(routes.indexOf('/api/auth/register'), routes.indexOf('/api/auth/login'));
        expect(regBlock).toMatch(/required: \[username, email, password, verificationCode\]/);
        expect(regBlock).not.toMatch(/required: \[[^\]]*inviteCode/);
    });
});

describe('登录页用户视角口径（v1.119.0：内部口径与运维入口不上登录页）', () => {
    const html = () => readSrc('index.html');
    const loginSection = () => {
        const src = html();
        return src.slice(src.indexOf('id="login-page"'), src.indexOf('id="app-container"'));
    };

    test('游客入口叫「游客登录」，说明是一句人话（不再出现「免登录使用」这种内部口径）', () => {
        const alt = loginSection().slice(loginSection().indexOf('class="auth-alt"'));
        expect(alt).toContain('游客登录');
        expect(alt).not.toContain('免登录使用');
    });

    test('登录页页脚有备案号容器，与其它备案位（关于弹窗 / 落地页）共用同一份配置渲染', () => {
        expect(loginSection()).toContain('id="site-filing"');
        // 渲染器是唯一取数处：登录页不维护第二份备案信息。
        // v1.123.0 起渲染器按 querySelectorAll 渲染全部容器（曾用 getElementById 只命中
        // 第一个 —— 多处共存时其余静默留空），断言钉的是"唯一取数"这件事本身
        expect(readSrc('src/js/ui/site-filing-ui.js')).toContain("querySelectorAll('#site-filing, [data-site-filing]')");
    });

    test('运维排障入口（一键重置缓存）不出现在登录页 —— 用户视角没有"旧版页面"概念', () => {
        expect(loginSection()).not.toContain('clean-cache.html');
        // 入口收进「关于」弹窗：用户主动打开才可见
        expect(html()).toContain('clean-cache.html?auto=1');
    });

    test('品牌面板不再罗列功能清单（"20 个速算器 · 21 个完整测算"是开发口径）', () => {
        const section = loginSection();
        expect(section).not.toContain('auth-brand__points');
        expect(section).not.toContain('20 个速算器');
        // 失去消费方的样式一并删掉，防止 DOM 回潮时样式还在"兜底"
        const css = readSrc('src/css/ui-redesign.css');
        expect(css).not.toContain('.auth-brand__points');
        expect(css).not.toContain('.auth-brand__note');
    });

    test('syncNav 在登录页可见时不放行导航栏（"下滑进主页"的根治点）', () => {
        const src = readSrc('src/js/ui/toolbox-ui.js');
        // 按**函数边界**切，不用固定长度窗口：v1.126.0 在 syncNav 开头补了几行注释，
        // 900 字符的窗口立刻把函数尾巴切掉，断言红得莫名其妙 —— 注释一长就再犯。
        const start = src.indexOf('function syncNav');
        const fn = src.slice(start, src.indexOf('function initTabBar'));
        expect(fn).toContain("getElementById('login-page')");
        expect(fn).toContain("classList.contains('hidden')");
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

    test('值落在 email 字段（字段名沿用 email 以兼容既有客户端）', async () => {
        global.fetch = jest.fn((url, opts) => {
            captured = { url, body: opts.body };
            return okResponse();
        });
        await apiClient.loginUser('Dev@Example.com', 'pwd123', true);
        expect(captured.url).toContain('/auth/login');
        expect(JSON.parse(captured.body)).toEqual({ email: 'Dev@Example.com', password: 'pwd123' });
    });

    test('前台不缓存登录结果：成功响应只落 token，不改请求体', async () => {
        global.fetch = jest.fn((url, opts) => {
            captured = { url, body: opts.body };
            return okResponse();
        });
        await apiClient.loginUser('Dev@Example.com', 'pwd123', false);
        expect(captured.url).toContain('/auth/login');
        expect(JSON.parse(captured.body)).toEqual({ email: 'Dev@Example.com', password: 'pwd123' });
    });
});
