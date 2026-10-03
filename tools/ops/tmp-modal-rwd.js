// v1.134.0：验证两档宽度 + 手机全屏 + 自适应（四视口）
const path = require('path');
const pw = require(path.join(process.env.APPDATA, 'npm', 'node_modules', '@playwright', 'cli', 'node_modules', 'playwright-core'));

const IDS = ['help-modal', 'feedback-modal', 'lead-modal', 'upgrade-modal', 'about-modal',
    'content-notice-modal', 'user-agreement-modal', 'alert-modal', 'confirm-modal'];
const LG = new Set(IDS.slice(0, 7));

const VPS = [
    { name: '桌面 1280x900', width: 1280, height: 900 },
    { name: '平板 800x1000', width: 800, height: 1000 },
    { name: '窄窗口 700x900', width: 700, height: 900 },
    { name: '手机 390x844', width: 390, height: 844 },
    { name: '手机横屏 844x390', width: 844, height: 390 }
];

(async () => {
    const b = await pw.chromium.launch();
    for (const vp of VPS) {
        const pg = await b.newPage({ viewport: { width: vp.width, height: vp.height } });
        await pg.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
        await pg.waitForTimeout(2200);
        console.log(`\n== ${vp.name} ==`);
        for (const id of IDS) {
            const r = JSON.parse(await pg.evaluate(`(() => {
                const m = document.getElementById('${id}');
                if (!m) return JSON.stringify({ miss: 1 });
                document.body.appendChild(m);
                m.classList.remove('hidden', 'opacity-0');
                const shell = m.querySelector('.modal-shell');
                const head = m.querySelector('.modal-head');
                const body = m.querySelector('.modal-body');
                const rc = shell.getBoundingClientRect();
                const cs = getComputedStyle(shell);
                const isLg = shell.className.includes('--lg');
                const full = isLg && Math.round(rc.width) >= (${vp.width} - 1) && Math.round(rc.height) >= (${vp.height} - 1);
                return JSON.stringify({
                    w: Math.round(rc.width), h: Math.round(rc.height),
                    radius: cs.borderTopLeftRadius,
                    headRadius: head ? getComputedStyle(head).borderTopLeftRadius : '-',
                    内容超出: body ? (body.scrollHeight > body.clientHeight ? '可滚' : '全显') : '-',
                    full: full ? '全屏' : ''
                });
            })()`));
            if (r.miss) { console.log(`  ${id} 缺失`); continue; }
            console.log(`  ${id.padEnd(22)} ${String(r.w).padStart(4)}x${String(r.h).padStart(4)} 圆角=${r.radius.padEnd(5)} head圆角=${String(r.headRadius).padEnd(5)} ${r.内容超出} ${r.full}`);
        }
        await pg.close();
    }

    // 手机截图：反馈（内容型，应全屏）与 alert（决策型，应居中卡片）
    for (const [id, vp] of [['feedback-modal', { width: 390, height: 844 }], ['alert-modal', { width: 390, height: 844 }], ['lead-modal', { width: 390, height: 844 }]]) {
        const pg = await b.newPage({ viewport: vp });
        await pg.goto('http://127.0.0.1:3000/', { waitUntil: 'domcontentloaded' });
        await pg.waitForTimeout(2200);
        await pg.evaluate(`(() => { const m = document.getElementById('${id}'); document.body.appendChild(m); m.classList.remove('hidden','opacity-0'); })()`);
        await pg.waitForTimeout(300);
        await pg.screenshot({ path: `tools/ops/screenshots/.tmp/m-${id}.png` });
        await pg.close();
    }
    console.log('\n截图: tools/ops/screenshots/.tmp/m-*.png');
    await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
