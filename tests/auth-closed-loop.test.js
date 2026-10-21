/**
 * 登录闭环：入口 → 凭证 → 会话 → 退出 四个断口（v1.144.0）
 *
 * 为什么值得一份单测：
 *   登录这一段此前是**四段互不相接的流程**：注册完要回登录页再输一遍密码；
 *   改完密码旧 token 还能用满 7 天；退出只清了本浏览器的 localStorage；
 *   401 靠枚举后端错误文案来识别（后端换个词就静默失效，用户看到的是"点了没反应"）。
 *   四段各自能跑通，但拼起来处处是断口 —— 用户走完一步还得自己接上下一步。
 *
 *   本版把这四段接上：注册即登录、改密即吊销、退出即全局下线、401 按状态码识别。
 *   这里钉的是"接上了"这件事本身 —— 任何一处退回旧写法都会让这条链路重新裂开。
 *
 * 守的四条：
 *   ① 注册 / 重置成功都签发令牌（不再要求用户再走一次登录）；
 *   ② 改密 / 重置 / 退出都推高 token_version，中间件据此拒掉旧 token；
 *   ③ 401 按 **HTTP 状态码** 判定会话失效，登录接口自身的 401 除外；
 *   ④ 邀请码在验证码**之前**校验 —— 填错邀请码不该吞掉一次性验证码。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const readSrc = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** 取某个具名函数的函数体（到下一个顶层 const/function 为止） */
function fnBody(src, signature) {
    const start = src.indexOf(signature);
    expect(start).toBeGreaterThan(-1);
    const rest = src.slice(start);
    const nextConst = rest.indexOf('\nconst ');
    const nextFn = rest.indexOf('\nfunction ');
    const ends = [nextConst, nextFn].filter((i) => i > -1);
    return ends.length ? rest.slice(0, Math.min(...ends)) : rest;
}

describe('闭环①：注册与重置成功都直接签发令牌', () => {
    test('register 控制器返回 { token, user }，不再只回 user', () => {
        const body = fnBody(readSrc('server/src/controllers/authController.js'), 'const register =');
        expect(body).toContain('authService.signTokenForUser(user)');
        expect(body).toMatch(/data:\s*\{\s*token:/);
    });

    test('重置密码同样签发令牌（邮箱验证码已证明归属，不该再走一遍登录）', () => {
        const body = fnBody(readSrc('server/src/services/authService.js'), 'const resetPassword =');
        expect(body).toContain('signTokenForUser(updated)');
        expect(body).toContain('pickPublicUser(updated)');
    });

    test('签发点只有一处（signTokenForUser），避免某条链路漏带 tv 而绕过吊销', () => {
        const svc = readSrc('server/src/services/authService.js');
        const signCalls = svc.match(/jwt\.sign\(/g) || [];
        expect(signCalls).toHaveLength(1);
        expect(svc).toContain('const signTokenForUser');
        // 三处签发点都走它：登录 / 注册（控制器）/ 重置
        expect(svc).toContain('const token = signTokenForUser(user);');
        expect(fnBody(svc, 'const resetPassword =')).toContain('signTokenForUser(updated)');
        expect(fnBody(svc, 'const updateUser =')).toContain('signTokenForUser(user)');
    });

    /** 取 try { ... } catch 之间的成功路径 —— catch 里仍有"已注册 → 切登录页"的引导，不能混进来 */
    function successPath(src, signature) {
        const body = fnBody(src, signature);
        const start = body.indexOf('try {');
        expect(start).toBeGreaterThan(-1);
        const end = body.indexOf('} catch', start);
        return end > -1 ? body.slice(start, end) : body.slice(start);
    }

    test('前端注册成功不再切回登录页，而是走与登录同一套后续动作', () => {
        const ok = successPath(readSrc('src/js/auth/auth-ui.js'), 'async function handleRegister');
        expect(ok).not.toContain("switchAuthTab('login')");
        expect(ok).not.toContain('注册成功，请登录');
        expect(ok).toContain('updateAuthUI()');
        expect(ok).toContain('exitGuestSession()');
        expect(ok).toContain('clearPageHistory()');
        expect(ok).toContain('maybeOpenAfterLogin');
        expect(ok).toContain('注册成功，已为你自动登录');
    });

    test('前端重置成功同样直接进入应用（不再是"请用新密码登录"）', () => {
        const ok = successPath(readSrc('src/js/auth/auth-ui.js'), 'async function handleResetPassword');
        expect(ok).not.toContain('请使用新密码登录');
        expect(ok).toContain('closeResetPasswordPanel()');
        expect(ok).toContain('updateAuthUI()');
        expect(ok).toContain('密码已重置，已为你自动登录');
    });
});

describe('闭环②：改密 / 重置 / 退出都让旧 token 立即失效', () => {
    test('User 有 token_version 字段，且生产与本地两份 schema 一致', () => {
        expect(readSrc('server/prisma/schema.prisma')).toMatch(/token_version\s+Int\s+@default\(0\)/);
        expect(readSrc('server/prisma/schema.dev.prisma')).toMatch(/token_version\s+Int\s+@default\(0\)/);
    });

    test('迁移脚本存在且是 NOT NULL DEFAULT 0（存量行不为空，老 token 不被集体踢下线）', () => {
        const sql = readSrc('server/prisma/migrations/20261020_add_user_token_version/migration.sql');
        expect(sql).toMatch(/ALTER TABLE "User" ADD COLUMN "token_version" INTEGER NOT NULL DEFAULT 0;/);
    });

    test('middleware 比对 tv 与库里的 token_version，不一致即 401', () => {
        const mw = readSrc('server/src/middleware/auth.js');
        expect(mw).toContain('token_version: true');
        expect(mw).toContain('Number.isInteger(decoded.tv) ? decoded.tv : 0');
        expect(mw).toMatch(/issuedTv !== currentTv/);
    });

    test('老 token（无 tv 声明）按 0 处理 —— 存量会话不被本次上线踢下线', () => {
        const mw = readSrc('server/src/middleware/auth.js');
        // 若直接写 decoded.tv !== user.token_version，老 token 的 undefined !== 0 会全员掉线
        expect(mw).not.toMatch(/decoded\.tv\s*!==\s*user\.token_version/);
    });

    test('重置密码与改密都在同一次 update 里推高 token_version', () => {
        const svc = readSrc('server/src/services/authService.js');
        expect(fnBody(svc, 'const resetPassword =')).toContain('token_version: { increment: 1 }');
        expect(fnBody(svc, 'const updateUser =')).toContain('updateData.token_version = { increment: 1 }');
    });

    test('退出登录推高版本号（退出 = 别处也下线，不只是清本地）', () => {
        const svc = readSrc('server/src/services/authService.js');
        const body = fnBody(svc, 'const logout =');
        expect(body).toContain('bumpTokenVersion(userId)');
        expect(svc).toContain('const bumpTokenVersion');
    });

    test('新密码不能与当前密码相同（否则"重置成功"是空话，还白白踢掉所有设备）', () => {
        const svc = readSrc('server/src/services/authService.js');
        expect(fnBody(svc, 'const resetPassword =')).toContain('新密码不能与当前密码相同');
        expect(fnBody(svc, 'const updateUser =')).toContain('新密码不能与当前密码相同');
    });
});

describe('闭环③：退出走服务端端点', () => {
    test('/api/auth/logout 路由存在且受鉴权保护', () => {
        const routes = readSrc('server/src/routes/auth.js');
        expect(routes).toContain("router.post('/logout', authenticateToken, authController.logout)");
        // swagger 里写明它会吊销全部已签发 token
        const block = routes.slice(routes.indexOf('/api/auth/logout'), routes.indexOf('/api/auth/claim-trial'));
        expect(block).toContain('token_version 自增');
    });

    test('前端 logoutUser 先调服务端，且失败不阻断本地退出', () => {
        const body = fnBody(readSrc('src/js/api/api-client.js'), 'async function logoutUser');
        expect(body).toContain("apiRequest('/auth/logout'");
        expect(body).toMatch(/catch\s*\(/);
        expect(body).toContain('removeAuthToken()');
        expect(body).toContain('removeCurrentUser()');
    });

    test('handleLogout await 后仍有本地清理', () => {
        const body = fnBody(readSrc('src/js/auth/auth-ui.js'), 'async function handleLogout');
        expect(body).toContain('await apiClient.logoutUser()');
        expect(body).toContain('exitGuestSession()');
        expect(body).toContain('updateAuthUI()');
    });
});

describe('闭环④：401 按状态码判定，不再枚举后端错误文案', () => {
    test('apiRequest 用 response.status === 401 判定会话失效', () => {
        const client = readSrc('src/js/api/api-client.js');
        expect(client).toContain('response.status === 401');
        // 旧写法枚举六个英文串，后端改一个词就静默失效
        expect(client).not.toContain("errorMessage === 'Token expired'");
    });

    test('登录接口自身的 401 除外 —— 那是"这次没登上去"，不是"会话失效"', () => {
        const client = readSrc('src/js/api/api-client.js');
        expect(client).toContain("url !== '/auth/login'");
    });
});

describe('闭环⑤：邀请码在验证码之前校验（填错不吞验证码）', () => {
    test('register 控制器先 checkInviteCode 再 verifyRegisterCode', () => {
        const body = fnBody(readSrc('server/src/controllers/authController.js'), 'const register =');
        const inviteAt = body.indexOf('checkInviteCode');
        const codeAt = body.indexOf('verifyRegisterCode');
        expect(inviteAt).toBeGreaterThan(-1);
        expect(codeAt).toBeGreaterThan(-1);
        expect(inviteAt).toBeLessThan(codeAt);
    });

    test('checkInviteCode 对空值直接放行（选填语义，不查库不报错）', () => {
        const body = fnBody(readSrc('server/src/services/authService.js'), 'const checkInviteCode =');
        expect(body).toMatch(/if \(!code\) return null;/);
    });
});

/**
 * 重置面板的「发送验证码」按钮曾经只有一种情况会变灰解除：用户**手打**邮箱。
 * 因为禁用状态写在 reset-email 的 input 监听里，而两个入口都是直接赋值：
 *   ① 点「忘记密码？」时把登录框的邮箱回填进重置框（showResetPasswordPanel）；
 *   ② 浏览器自动填充。
 * 直接赋值不派发 input 事件，于是邮箱明晃晃填着、按钮却停在 HTML 的 disabled，
 * 点了没反应 —— 用户唯一的线索是"它坏了"。修法是把状态收成一处计算函数，
 * 每个可能改变它的时刻都显式调一次。
 */
describe('重置面板：发送验证码按钮的状态只有一处真相', () => {
    const ui = readSrc('src/js/auth/auth-ui.js');

    test('禁用条件由 syncResetSendButtonState 统一计算（值 + 冷却）', () => {
        const body = fnBody(ui, 'function syncResetSendButtonState');
        expect(body).toContain('const coolingDown = !!resetSendTimer && email === resetSendTimerEmail');
        expect(body).toContain('btn.disabled = !email || coolingDown');
    });

    test('打开重置面板时补一次同步 —— 回填是直接赋值，不会有 input 事件', () => {
        const body = fnBody(ui, 'function showResetPasswordPanel');
        expect(body).toContain('resetEmail.value = loginEmailValue');
        expect(body).toContain('syncResetSendButtonState()');
    });

    test('input 监听不再自己算 disabled，只调同步函数（否则又多一处真相）', () => {
        const body = fnBody(ui, 'function setupAuthEventListeners');
        expect(body).toContain('syncResetSendButtonState()');
        expect(body).not.toContain('resetSendBtn.disabled = !e.target.value.trim()');
    });

    test('冷却锁跟着邮箱走：换个收件地址就该立刻能发', () => {
        const body = fnBody(ui, 'function startResetCodeCountdown');
        expect(body).toContain('resetSendTimerEmail');
        const listener = fnBody(ui, 'function setupAuthEventListeners');
        expect(listener).toContain('if (resetSendTimer && email !== resetSendTimerEmail) clearResetCodeCountdown();');
    });
});

/**
 * 邮件是这条链路上唯一离开本站、出现在用户邮箱列表里的东西 ——
 * 发件名写什么，用户就以为自己在用什么产品。原先只写「EuriskoTax」，
 * 收件人分不清是哪个站点，也容易被当成群发广告。
 *
 * 两处写法刻意不同：邮件用间隔号（EuriskoTax · 税费计算器），页面 title 用空格，
 * 但去掉分隔符后必须是同一个名字 —— 这组断言钉的是「不会各自漂移成两个品牌名」，
 * 而不是「两处字符串一模一样」。三处默认值（代码 / compose / 环境变量模板）
 * 都钉在这里，漏改任何一处会指名到文件。
 */
describe('验证码邮件的发件名', () => {
    const BRAND = 'EuriskoTax · 税费计算器';
    const title = readSrc('index.html').match(/<title>([^<]+)<\/title>/)[1];

    test('发件名用间隔号写法：EuriskoTax · 税费计算器（不是空格，也不是连写）', () => {
        expect(BRAND).toBe('EuriskoTax · 税费计算器');
    });

    test('与站内 title 是同一个名字 —— 去掉分隔符后必须完全一致', () => {
        const strip = (s) => s.split(' - ')[0].replace(/[·\s]/g, '');
        expect(strip(title)).toBe(strip(BRAND));
        expect(strip(BRAND)).toBe('EuriskoTax税费计算器');
    });

    test('mailService 默认发件名 = 品牌名（Subject 前缀与正文标题都取自它）', () => {
        const mail = readSrc('server/src/services/mailService.js');
        expect(mail).toContain(`process.env.SMTP_FROM_NAME || '${BRAND}'`);
        // 正文抬头只写品牌名 —— 原先还缀着「· 个人所得税预算规划工具」，
        // 既与产品覆盖范围（个税/企业税/社保）不符，也和抬头的名字重复
        expect(mail).toContain('<h2 style="color:#fff;margin:0;font-size:20px;">${fromName}</h2>');
    });

    test('compose 默认值与环境变量模板同样是品牌名（生产 cp .env.example 后仍生效）', () => {
        expect(readSrc('deploy/lighthouse/docker-compose.yml')).toContain('SMTP_FROM_NAME:-' + BRAND + '}');
        expect(readSrc('deploy/lighthouse/.env.example')).toContain('SMTP_FROM_NAME=' + BRAND);
    });

    /**
     * 这条守的是「邮件能不能发出去」，不是「邮件长什么样」——比上面几条更要命。
     * 生产机解析 smtp.qq.com 只拿到 AAAA（IPv6）记录而 IPv6 不可达，Node 22 按 DNS
     * 原序先试 IPv6，ENETUNREACH 之后**不会回退 IPv4**，整条发信链路静默失效：
     * 代码、账号、授权码全对，用户点「发送验证码」却永远收不到，后端日志也不报错。
     * 谁把 family: 4 当多余配置删掉，注册与找回密码就一起断在这里。
     */
    test('SMTP 强制走 IPv4 —— 否则生产机连不上只解析出 IPv6 的邮件服务器', () => {
        const mail = readSrc('server/src/services/mailService.js');
        expect(mail).toMatch(/family:\s*4/);
        // 只钉 SMTP 这一处：全局改解析顺序会连带影响数据库等其它连接。
        // 注意这里查的是**调用**（带左括号），本文件注释里提到这个函数名不算。
        expect(mail).not.toContain('setDefaultResultOrder(');
    });
});
