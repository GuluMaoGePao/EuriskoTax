const path = require('path');
const pw = require(path.join(process.env.APPDATA, 'npm', 'node_modules', '@playwright', 'cli', 'node_modules', 'playwright-core'));

const snap = `(() => {
  const g = id => document.getElementById(id);
  const d = id => g(id) ? getComputedStyle(g(id)).display : 'n/a';
  return {
    login: d('login-page'), app: d('app-container'), topTab: d('top-tabbar'),
    bottomTab: d('bottom-tabbar'), userName: d('user-name'),
    scrollH: document.documentElement.scrollHeight, innerH: window.innerHeight,
    activePage: (document.querySelector('.page.active') || {}).id || null,
    token: !!localStorage.getItem('auth_token') || !!localStorage.getItem('token')
  };
})()`;

(async () => {
    const b = await pw.chromium.launch();
    const pg = await b.newPage({ viewport: { width: 1280, height: 800 } });
    await pg.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
    await pg.waitForTimeout(2500);

    console.log('① 未登录  :', JSON.stringify(await pg.evaluate(snap)));

    // 登录（dev 账号）：先清掉可能残留的 token，从干净态走完整登录
    await pg.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await pg.reload({ waitUntil: 'domcontentloaded' });
    await pg.waitForTimeout(2000);
    await pg.evaluate((acct) => {
        document.getElementById('login-email').value = acct.email;
        document.getElementById('login-password').value = acct.password;
    }, { email: '2649719969@qq.com', password: 'Hek8Sy8sy2QtJ43bHbqY' });
    await pg.click('#login-submit');
    await pg.waitForTimeout(4500);
    console.log('② 登录成功:', JSON.stringify(await pg.evaluate(snap)));
    await pg.screenshot({ path: 'tools/ops/tmp-after-login.png' });

    // ③ 退出登录 → 应回到登录页，主应用消失（个人中心里的退出按钮）
    await pg.evaluate(() => { const b = document.getElementById('profile-logout-link'); if (b) b.click(); });
    await pg.waitForTimeout(2500);
    console.log('③ 退出登录:', JSON.stringify(await pg.evaluate(snap)));

    // ④ 游客进入 → 主应用显示、登录页消失
    await pg.evaluate(() => { const b = document.getElementById('guest-entry-btn'); if (b) b.click(); });
    await pg.waitForTimeout(2500);
    console.log('④ 游客进入:', JSON.stringify(await pg.evaluate(snap)));

    await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
