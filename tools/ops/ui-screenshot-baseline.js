#!/usr/bin/env node
/**
 * 阶段19-0 · 视觉回归截图基线（tools/ops/ui-screenshot-baseline.js）
 *
 * 为什么要有这个脚本：
 *   src/css/tokens.css 的文件头注释里写得很清楚 —— 本项目**没有视觉回归**，
 *   这是 Tailwind 未能全量变量化的真实阻力：全站几十处 /50 /90 透明度修饰符，
 *   一旦有一处颜色不对，pure-DOM 断言看不出来，只能靠人眼翻。
 *   阶段19 要动首页结构、结果页布局、令牌层，没有基线就是赌博。
 *   本脚本把「6 个关键页面 × 2 个断点」的截图固化成基线，每个阶段结束后重拍对比。
 *
 * 为什么后来加了 `--theme`（阶段19-1 补验收时加的）：
 *   基线原本只有浅色 12 张，而 19-1 收口的阴影令牌**在深色档是另一套值**
 *   （tokens.css 的 .dark 段：深色靠"更黑"不靠"更灰"，透明度 .30/.40/.50）。
 *   也就是说：浅色 12 张全绿**证明不了深色没问题** —— 19-1 的验收要求
 *   「深色模式逐页过一遍」在这套基线下根本没有产物可看。加主题参数后，
 *   两套各 12 张，后续每个阶段 --check 能同时守住浅色与深色。
 *
 * 设计取舍：
 *   1. **零新增依赖**：静态服务器用 Node 内置 http（不引 express），
 *      截图用已装的 agent-browser CLI（0.36.0），不在 package.json 里加任何东西。
 *   2. **不依赖后端**：只起静态服务器托管项目根。页面在 /api 不可用时仍会渲染
 *      （auth-ui.js 的初始化遮罩在 finally 里无条件移除，不会白屏），
 *      而截图关注的是**布局与样式**，不是数据 —— 反而更稳定。
 *   3. **比对用 sha256，不引像素库**：像素级比对需要一个图像库（pngjs / pixelmatch），
 *      为它新增依赖不划算。hash 足以回答"变没变"；"变得好不好"由人眼确认，
 *      这也是方案里写死的验收方式（每个阶段结束重拍，**人眼确认**）。
 *   4. **hash 当指纹用，前提是每次拍的都是同一个东西**。这不是天然成立的，
 *      本脚本为此做了几件事（每一件都是实测踩出来的，改动前请先读对应注释）：
 *        a. 截图前冻结动画 / 光标 / 滚动位置（FREEZE_JS）—— 掐掉时序噪声；
 *        b. 每张开拍前 clear localStorage/sessionStorage —— 掐掉跨轮次状态泄漏；
 *        c. 等 CDN 资源就绪再拍（waitForReady）—— index.html 引了 6 个外网 CDN，
 *           图标是字体，字体没到就是空白方块，出来的图根本不是同一个画面；
 *        d. 固定时间相关内容（问候语 / 日期 / 倒计时）—— 同一份代码，上午拍的
 *           和中午拍的就不是一张图（实测「上午好」→「中午好」，两张 home 双双对不上）。
 *      a~d 的实现都在公共底座 ui-lib/screenshot-kit.js 里（与对比度审计脚本共用）。
 *
 * 已知限制（不是 bug，别当故障查）：
 *   **浏览器冷启动会挂**。agent-browser 的会话浏览器是常驻守护进程，把它连同无头
 *   Chrome 一起杀掉后重新跑，实测卡在第一张 7 分钟不出图（open 在等外网 CDN）。
 *   遇到这种情况：先手动跑一次 `node <cli> --session ui-baseline open <url>`
 *   之类的命令把浏览器热起来（让 CDN 进磁盘缓存），再跑本脚本即可
 *   （<cli> 是 npm root -g 下 agent-browser 的 bin，别用 npx —— Windows 上 spawn EINVAL）。
 *   日常每个阶段跑一次时浏览器是热的，不会碰到。
 *
 * 用法：
 *   node tools/ops/ui-screenshot-baseline.js                 # 生成 / 覆盖基线（浅色）
 *   node tools/ops/ui-screenshot-baseline.js --theme dark    # 生成 / 覆盖基线（深色）
 *   node tools/ops/ui-screenshot-baseline.js --check         # 与基线比对（不覆盖）
 *   node tools/ops/ui-screenshot-baseline.js --check --theme dark
 *   node tools/ops/ui-screenshot-baseline.js --only home,tools
 *   node tools/ops/ui-screenshot-baseline.js --port 4180
 *
 * 产物：
 *   tools/ops/screenshots/baseline/<id>-<w>.png         浅色基线（入仓）
 *   tools/ops/screenshots/baseline/<id>-<w>-dark.png    深色基线（入仓）
 *   tools/ops/screenshots/baseline/manifest.json        每张的 sha256 / 字节数（入仓）
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 服务器 / agent-browser 调用 / 页面目标定义 / 稳定化脚本都在公共底座里（阶段19-1 补验收时抽的），
// 与对比度审计脚本（ui-contrast-audit.js）共用同一份实现 —— 踩过的坑只维护一遍。
const kit = require('./ui-lib/screenshot-kit');

// ============================ 配置 ============================

const BASELINE_DIR = path.join(__dirname, 'screenshots', 'baseline');
const TMP_DIR = path.join(__dirname, 'screenshots', '.tmp');
const SESSION = 'ui-baseline';

const VIEWPORTS = kit.VIEWPORTS;
const TARGETS = kit.TARGETS;
const FREEZE_JS = kit.FREEZE_JS;
const { ab, waitForReady } = kit.createBrowser(SESSION);

// ============================ 参数 ============================

const argv = process.argv.slice(2);
const isCheck = argv.includes('--check');
const onlyArg = (() => {
    const i = argv.indexOf('--only');
    return i >= 0 && argv[i + 1] ? argv[i + 1].split(',').map(s => s.trim()).filter(Boolean) : null;
})();
const portArg = (() => {
    const i = argv.indexOf('--port');
    return i >= 0 && argv[i + 1] ? parseInt(argv[i + 1], 10) : 4173;
})();
const themeArg = (() => {
    const i = argv.indexOf('--theme');
    const v = i >= 0 && argv[i + 1] ? argv[i + 1].toLowerCase() : 'light';
    return v === 'dark' ? 'dark' : 'light';
})();

const targets = onlyArg ? TARGETS.filter(t => onlyArg.includes(t.id)) : TARGETS;
const outDir = isCheck ? TMP_DIR : BASELINE_DIR;

// ============================ 工具 ============================

function sha256File(file) {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/** 清单的唯一键：同一页面同一断点，浅色与深色是两张不同的图，必须分得开 */
function manifestKey(id, width, theme) {
    return id + '@' + width + '@' + theme;
}

// ============================ 拍摄 ============================

/**
 * 打开 → 复位存储 → reload → 设主题 → 设视口 → 等资源就绪 → 执行准备脚本 → 等 → 冻结 → 截图。
 *
 * 为什么不用 `batch` 一条命令跑完：
 *   实测 0.36.0 的 batch 把每个 JSON 数组参数报成 "Unknown command"
 *   （与 help 里的示例写法不符，疑为平台相关的参数解析差异）。
 *   逐步调用每次一个进程，慢一点但语义明确、报错能定位到具体哪一步；
 *   会话靠 --session 保持，不会每次重开浏览器。
 */
async function captureOne(url, vp, prepareJs, outFile, expectSel, theme) {
    await ab(['open', url]);                                  // 首次会拉起浏览器守护进程，可能较慢
    // 复位存储 → 进「免登录使用」会话 → reload。
    //
    // 为什么要 clear（踩过，且这次是**可复现**的偏差不是噪声）：
    //   agent-browser 的会话浏览器是长期存活的守护进程，localStorage 跨轮次留存。
    //   上一轮拍 quick / deep-* 会在首页留下「最近使用」记录，于是下一轮拍 home 时
    //   #home-recent-tools-card 从 hidden 变可见 —— 同一份代码，第一次拍出来的图和
    //   之后每一次都不一样：连跑两次 --check 都稳定差 85B，而基线那张恰是「干净态」。
    //   不复位的话，基线永远只在第一次是对的，--check 从此永久误报。
    //   每个 target 都从干净状态起拍，才是「同一份代码 → 同一张图」。
    //
    // 为什么只留 guest 这一个 key（guest-session.js：sessionStorage['euriskoGuestSession']='1'）：
    //   页面初始化时据此直接 showApp()，否则全被挡在登录页（实测踩过）。
    //   走 sessionStorage 而不是点 #guest-entry-btn，是为了不依赖登录页 DOM 的存在。
    await ab(['eval', 'try{localStorage.clear();sessionStorage.clear();' +
        'sessionStorage.setItem("euriskoGuestSession","1");}catch(e){} "ok";']);
    // 视口必须在 **reload 之前** 设好（踩过，19-1 补）：
    //   悬浮助手球的纵坐标是页面初始化时按 window.innerHeight 算的。若先 reload 再 set viewport，
    //   初始化读到的是**上一张图留下的旧视口**（会话浏览器长期存活，上一轮可能是 1280×900），
    //   之后改视口它也不会重算 —— 同一份代码，球的纵向位置随「上一轮拍了什么」漂。
    //   实测基线球在右下、复查球在页中，diff 集中在右缘一小块（1030px / 0.34%）。
    //   先设视口再 reload，初始化读到的就是终值，球回到确定位置。
    await ab(['set', 'viewport', String(vp.w), String(vp.h)]);
    await ab(['reload']);
    // 主题：reload 后立刻置一次（写 localStorage + 当前 class）
    await ab(['eval', kit.themeJs(theme)]);
    await ab(['set', 'viewport', String(vp.w), String(vp.h)]);   // 兜底再设一次：防个别实现导航后丢视口
    // 等 CDN 就绪（字体/脚本）再往下走 —— 见公共底座 waitForReady 的注释
    const ready = await waitForReady(6);
    // 再置一次：页面初始化脚本可能在这段时间里按 localStorage 重置过 class
    // （只写 class 不写 localStorage 就会在下一轮被盖回去，所以两件事一起做）。
    await ab(['eval', kit.themeJs(theme)]);
    await ab(['wait', '2500']);                               // 等首屏脚本（auth-ui / toolbox）初始化
    await ab(['eval', '(function(){' + prepareJs + '\nreturn "ok";})()']);
    await ab(['wait', '1200']);                               // 等切换后的重排与过渡动画结束
    await ab(['eval', FREEZE_JS]);                            // 冻结动画 / 光标 / 滚动位置
    await ab(['wait', '600']);                                // 让冻结后的样式生效并完成最后一次重排
    await ab(['screenshot', outFile]);
    // 状态回读：看不到图时用它判断这张拍的是不是目标页（踩过：全拍成登录页却显示 OK）
    const state = await ab(['eval', '(function(){var ps=document.querySelectorAll(".page");var pid="none";for(var i=0;i<ps.length;i++){if(!ps[i].classList.contains("hidden")){pid=ps[i].id;break;}}' +
        'var miss=' + (expectSel ? '!document.querySelector("' + expectSel + '")' : 'false') + ';' +
        'return pid+(miss?" [MISSING ' + (expectSel || '') + ']":"")})()']);
    // 主题回读：class 没挂上就是白拍（深色档的 .dark 全靠它），必须能自查出来
    // 回读值带引号（CLI 把字符串字面量原样回传，与 state 回读同一现象），不 strip 会永远"未生效"
    const themeState = String(await ab(['eval',
        '(function(){return document.documentElement.classList.contains("dark")?"dark":"light"})()']))
        .replace(/"/g, '').trim();
    return { state: state, ready: ready, theme: themeState };
}

// ============================ 主流程 ============================

(async function main() {
    fs.mkdirSync(outDir, { recursive: true });

    const server = await kit.startServer(portArg);
    const url = 'http://127.0.0.1:' + portArg + '/';
    console.log('静态服务器已启动：' + url);
    console.log('模式：' + (isCheck ? '比对（--check，不覆盖基线）' : '生成基线') +
        ' · 主题：' + (themeArg === 'dark' ? '深色（.dark）' : '浅色'));
    console.log('目标：' + targets.map(t => t.id).join(', '));
    console.log('');

    const manifest = [];
    let failed = 0;
    const themeTag = themeArg === 'dark' ? '-dark' : '';

    for (const t of targets) {
        for (const vp of VIEWPORTS) {
            const fileName = t.id + '-' + vp.tag + themeTag + '.png';
            const outFile = path.join(outDir, fileName);
            process.stdout.write('  拍摄 ' + fileName + ' (' + t.name + ' @ ' + vp.w + 'px) … ');
            try {
                const shot = await captureOne(url, vp, t.prepare, outFile, t.expect, themeArg);
                if (!fs.existsSync(outFile)) throw new Error('截图未生成');
                manifest.push({
                    id: t.id,
                    name: t.name,
                    width: vp.w,
                    height: vp.h,
                    theme: themeArg,
                    file: fileName,
                    bytes: fs.statSync(outFile).size,
                    sha256: sha256File(outFile),
                    // 资源就绪标记：false 说明 CDN 字体/脚本没等到，这张图的图标可能是空的。
                    // 存进 manifest 是为了让 --check 能识别「不是代码变了，是网络没到位」。
                    ready: shot.ready
                });
                const themeWarn = shot.theme === themeArg ? '' : ' · [主题未生效：实拍 ' + shot.theme + ']';
                console.log('OK · 当前页 ' + shot.state + (shot.ready ? '' : ' · [资源未就绪]') + themeWarn);
            } catch (e) {
                failed++;
                console.log('失败\n    ' + String(e.message || e).split('\n').slice(0, 4).join('\n    '));
            }
        }
    }

    server.close();

    if (isCheck) {
        const baseManifestPath = path.join(BASELINE_DIR, 'manifest.json');
        if (!fs.existsSync(baseManifestPath)) {
            console.log('\n[FAIL] 基线 manifest 不存在：' + baseManifestPath);
            console.log('       请先运行一次不带 --check 的命令生成基线。');
            process.exit(1);
        }
        const base = JSON.parse(fs.readFileSync(baseManifestPath, 'utf8'));
        const baseMap = new Map(base.map(x => [manifestKey(x.id, x.width, x.theme || 'light'), x]));

        const changed = [], same = [], missing = [];
        for (const cur of manifest) {
            const key = manifestKey(cur.id, cur.width, cur.theme);
            const b = baseMap.get(key);
            if (!b) { missing.push(cur); continue; }
            if (b.sha256 === cur.sha256) same.push(cur);
            else changed.push({ cur, b });
        }

        console.log('\n===== 比对结果（主题：' + themeArg + '）=====');
        console.log('一致：' + same.length + ' 张');
        console.log('变化：' + changed.length + ' 张');
        if (missing.length) console.log('基线缺失：' + missing.length + ' 张');

        // 资源未就绪时，「图不一样」说明不了任何事 —— 可能只是字体没下载到。
        // 不把这件事说在前面，就会被当成视觉回归去查代码（白查）。
        const notReady = manifest.filter(x => x.ready === false);
        if (notReady.length) {
            console.log('\n[警告] 以下 ' + notReady.length + ' 张是在资源未就绪（CDN 字体/脚本没等到）的状态下拍的，' +
                '它们与基线的差异**不足以证明**代码有改动：');
            console.log('       ' + notReady.map(x => x.file).join(', '));
            console.log('       index.html 引了 6 个外网 CDN（font-awesome / chart.js / jspdf 等），');
            console.log('       请先确认外网可达后重跑；否则应先修网络再谈视觉回归。');
        }

        if (missing.length) {
            console.log('\n基线里没有这些条目（多半是这套主题的基线还没生成）：');
            for (const m of missing) console.log('  - ' + m.file + '  → 运行 --theme ' + themeArg + ' 不带 --check 生成');
        }

        if (changed.length) {
            console.log('\n以下截图与基线不一致（需人眼确认是否为预期改动）：');
            for (const c of changed) {
                console.log('  - ' + c.cur.file +
                    '  (' + c.b.bytes + 'B → ' + c.cur.bytes + 'B)');
                console.log('    基线：' + path.join(BASELINE_DIR, c.b.file));
                console.log('    新拍：' + path.join(TMP_DIR, c.cur.file));
            }
            console.log('\n确认改动无误后，运行不带 --check 的命令重新固化基线。');
            process.exit(2);
        }
        console.log('\n[OK] 与基线完全一致 —— 本阶段零视觉变化。');
        return;
    }

    // 生成模式：与已有清单**合并**写入。
    // 为什么不能直接覆盖：一次运行只拍一个主题（--theme），若直接覆盖，
    //   跑完 dark 就把 light 的 12 条冲掉了 —— 24 张基线永远凑不齐，
    //   表现为「浅色 --check 全部 missing」。合并以 (页面@断点@主题) 为键，
    //   本次覆盖、其余保留，两个主题分两次跑即可并存。
    const manifestPath = path.join(BASELINE_DIR, 'manifest.json');
    let merged = [];
    if (fs.existsSync(manifestPath)) {
        try {
            merged = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            if (!Array.isArray(merged)) merged = [];
        } catch (e) { merged = []; /* 清单坏了就当没有，本次会重建 */ }
    }
    const mergedMap = new Map(merged.map(x => [manifestKey(x.id, x.width, x.theme || 'light'), x]));
    for (const cur of manifest) mergedMap.set(manifestKey(cur.id, cur.width, cur.theme), cur);
    const finalManifest = Array.from(mergedMap.values())
        .sort((a, b) => (a.id + '@' + a.width + '@' + a.theme).localeCompare(b.id + '@' + b.width + '@' + b.theme));

    fs.writeFileSync(manifestPath, JSON.stringify(finalManifest, null, 2), 'utf8');
    console.log('\n===== 完成 =====');
    console.log('本次成功：' + manifest.length + ' 张，失败：' + failed + ' 张');
    console.log('清单合计：' + finalManifest.length + ' 张（已按主题合并）');
    console.log('基线目录：' + BASELINE_DIR);
    console.log('清单：    ' + manifestPath);
    if (failed) process.exit(1);
})().catch(e => {
    console.error('\n[FATAL] ' + (e && e.stack || e));
    process.exit(1);
});
