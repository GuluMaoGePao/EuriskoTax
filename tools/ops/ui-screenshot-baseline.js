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
 *      本脚本为此做了三件事（每一件都是实测踩出来的，改动前请先读对应注释）：
 *        a. 截图前冻结动画 / 光标 / 滚动位置（FREEZE_JS）—— 掐掉时序噪声；
 *        b. 每张开拍前 clear localStorage/sessionStorage —— 掐掉跨轮次状态泄漏；
 *        c. 等 CDN 资源就绪再拍（waitForReady）—— index.html 引了 6 个外网 CDN，
 *           图标是字体，字体没到就是空白方块，出来的图根本不是同一个画面。
 *        d. 固定时间相关内容（问候语 / 日期 / 倒计时）—— 同一份代码，上午拍的
 *           和中午拍的就不是一张图（实测「上午好」→「中午好」，两张 home 双双对不上）。
 *
 * 已知限制（不是 bug，别当故障查）：
 *   **浏览器冷启动会挂**。agent-browser 的会话浏览器是常驻守护进程，把它连同无头
 *   Chrome 一起杀掉后重新跑，实测卡在第一张 7 分钟不出图（open 在等外网 CDN）。
 *   遇到这种情况：先手动跑一次 `npx agent-browser --session ui-baseline open <url>`
 *   之类的命令把浏览器热起来（让 CDN 进磁盘缓存），再跑本脚本即可。
 *   日常每个阶段跑一次时浏览器是热的，不会碰到。
 *
 * 用法：
 *   node tools/ops/ui-screenshot-baseline.js                 # 生成 / 覆盖基线
 *   node tools/ops/ui-screenshot-baseline.js --check         # 与基线比对（不覆盖）
 *   node tools/ops/ui-screenshot-baseline.js --only home,tools
 *   node tools/ops/ui-screenshot-baseline.js --port 4180
 *
 * 产物：
 *   tools/ops/screenshots/baseline/<id>-<w>.png     基线截图（入仓）
 *   tools/ops/screenshots/baseline/manifest.json    每张的 sha256 / 字节数（入仓）
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, execSync } = require('child_process');

// ============================ 配置 ============================

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const BASELINE_DIR = path.join(__dirname, 'screenshots', 'baseline');
const TMP_DIR = path.join(__dirname, 'screenshots', '.tmp');
const SESSION = 'ui-baseline';

/** 两个断点：手机（iPhone SE 宽）与桌面（常见笔电宽） */
const VIEWPORTS = [
    { w: 375, h: 812, tag: '375' },
    { w: 1280, h: 900, tag: '1280' }
];

/**
 * 6 个关键页面。
 * prepare 是一段在页面里执行的 JS（字符串），负责把页面切到目标状态。
 * 页面 id 取自 index.html：mode-selection-page / tools-page / quick-calculator-page
 * / deep-wizard-page / profile-page（showPage 用 getElementById 定位）。
 */
const TARGETS = [
    {
        id: 'home',
        name: '首页',
        prepare: `if (window.showPage) window.showPage('mode-selection-page');`
    },
    {
        id: 'tools',
        name: '工具页',
        prepare: `if (window.showPage) window.showPage('tools-page');`
    },
    {
        id: 'quick',
        name: '速算器（月薪个税）',
        prepare: `if (window.EuriskoToolbox && window.EuriskoToolbox.openTool) window.EuriskoToolbox.openTool('salary-tax');`
    },
    {
        id: 'deep-step1',
        name: '深度向导第1步（年终奖）',
        // fresh:true —— 必须带（踩过）。open() 默认会 loadDraft() 断点续算，
        // 而一旦跑过 deep-result（一路点到底），草稿里记的 stepIndex 就是最后一步；
        // 再拍 deep-step1 时 open() 会从草稿恢复，于是第 1 步这张图被拍成了结果页
        // （表象：与 deep-result 的字节数几乎一样，diff 看不出是两个页面）。
        // 用 fresh 绕开草稿恢复，不依赖 DRAFT_PREFIX 这个内部常量。
        prepare: `if (window.EuriskoDeepWizard) window.EuriskoDeepWizard.open('bonus-tax-deep', { fresh: true });`
    },
    {
        id: 'deep-result',
        name: '深度测算结果步（年终奖）',
        expect: '#dw-result-card',
        // 一路点「下一步」直到出现结果卡；字段全部用向导自带的默认值。
        // dw-next / dw-result-card 是通用渲染器的固定 id（deep-wizard-ui.js），
        // 其 click → collect/render 是同步的，所以同步 for 循环推得动，
        // 每轮用 requestAnimationFrame 无意义（同一轮 tick 内是同步完成的）。
        prepare: `
            if (window.EuriskoDeepWizard) {
                window.EuriskoDeepWizard.open('bonus-tax-deep', { fresh: true });
                for (var i = 0; i < 12; i++) {
                    if (document.getElementById('dw-result-card')) break;
                    var b = document.getElementById('dw-next');
                    if (!b) break;
                    b.click();
                }
            }`
    },
    {
        id: 'profile',
        name: '我的页',
        prepare: `if (window.showPage) window.showPage('profile-page');`
    }
];

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.webmanifest': 'application/manifest+json'
};

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

const targets = onlyArg ? TARGETS.filter(t => onlyArg.includes(t.id)) : TARGETS;
const outDir = isCheck ? TMP_DIR : BASELINE_DIR;

// ============================ 静态服务器 ============================

function startServer(port) {
    const server = http.createServer((req, res) => {
        let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
        let filePath = path.join(PROJECT_ROOT, urlPath === '/' ? 'index.html' : urlPath);

        // 目录穿越防护
        if (!filePath.startsWith(PROJECT_ROOT)) {
            res.writeHead(403);
            return res.end('403');
        }
        fs.stat(filePath, (err, st) => {
            if (err || st.isDirectory()) {
                // 未命中的路径一律回落 index.html（SPA 行为，避免 404 打断渲染）
                filePath = path.join(PROJECT_ROOT, 'index.html');
            }
            fs.readFile(filePath, (err2, buf) => {
                if (err2) {
                    res.writeHead(404);
                    return res.end('404');
                }
                res.writeHead(200, {
                    'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
                    'Cache-Control': 'no-store'
                });
                res.end(buf);
            });
        });
    });
    return new Promise((resolve, reject) => {
        server.on('error', reject);
        server.listen(port, '127.0.0.1', () => resolve(server));
    });
}

// ============================ agent-browser 调用 ============================

/**
 * 定位 agent-browser 的 CLI 入口（JS 文件），然后用 node 直接执行它。
 *
 * 为什么不 spawn('npx', …)：Windows 上 npx.cmd / npm.cmd 是批处理脚本，
 * 不经 shell 的 spawnSync 无法执行（实测抛 EINVAL）；而走 shell:true 又要把
 * 含双引号的 JSON 参数交给 cmd.exe 转义，风险更高。
 * 直接用 `node <cli.js>` 既无 shell 也无转义问题 —— 前提是能找到入口文件。
 */
let _abEntry = null;
function resolveAgentBrowserEntry() {
    if (_abEntry) return _abEntry;
    const candidates = [];

    const addFrom = (base) => {
        try {
            const pkgPath = path.join(base, 'package.json');
            if (!fs.existsSync(pkgPath)) return;
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
            const bin = typeof pkg.bin === 'string'
                ? pkg.bin
                : (pkg.bin && (pkg.bin['agent-browser'] || pkg.bin[Object.keys(pkg.bin)[0]]));
            if (bin) candidates.push(path.join(base, bin));
        } catch (e) { /* 忽略：解析失败就当这个候选不存在 */ }
    };

    // 1) 全局安装（本项目的使用方式：agent-browser 装在全局，不在项目 node_modules 里）
    try {
        const rootG = execSync('npm root -g', { encoding: 'utf8', windowsHide: true }).trim();
        addFrom(path.join(rootG, 'agent-browser'));
    } catch (e) { /* 忽略 */ }
    // 2) 项目本地安装
    addFrom(path.join(PROJECT_ROOT, 'node_modules', 'agent-browser'));

    const hit = candidates.find(p => fs.existsSync(p));
    if (!hit) {
        throw new Error('未找到 agent-browser 的 CLI 入口（已查全局与本地 node_modules）。\n' +
            '        请先确认 `npx agent-browser --version` 可执行。');
    }
    _abEntry = hit;
    return hit;
}

/**
 * 必须用**异步** spawn，不能用 spawnSync。
 * 原因（踩过）：spawnSync 会阻塞本进程事件循环，而静态服务器就跑在同一个进程里 ——
 * 浏览器来请求时主线程正卡在 spawnSync 上，没人 accept，于是连接超时
 * （实测报错 os error 10060，表象是"页面打不开"，根因在脚本自己）。
 */
function ab(args, timeoutMs) {
    return new Promise((resolve, reject) => {
        const child = spawn(
            process.execPath,
            [resolveAgentBrowserEntry(), '--session', SESSION].concat(args),
            { windowsHide: true, timeout: timeoutMs || 120000 }
        );
        let out = '', err = '';
        child.stdout.on('data', d => { out += d; });
        child.stderr.on('data', d => { err += d; });
        child.on('error', reject);
        child.on('close', code => {
            if (code !== 0) {
                reject(new Error('agent-browser 退出码 ' + code + '\n' + (err || out || '')));
            } else {
                resolve((out || '').trim());
            }
        });
    });
}

/**
 * 截图前执行的稳定化脚本。
 *
 * 为什么必须做这一步（踩过）：直接截出来的图**每次都不一样**。字节数在小幅抖动，
 * sha256 因而永远对不上，--check 失去意义。抖动源有五个，都在这一步被掐掉：
 *   1. CSS transition / animation：截图是某一瞬间的取证，元素此刻停在什么状态取决于等多久
 *      —— 一个正在淡入的元素可能停在 60% 也可能停在 100% 透明度。全部置 none 后
 *      元素直接落到终态，与时序无关。
 *   2. 文本光标（caret）：输入框聚焦时闪烁，位于非黑即白，逐像素 hash 必然变。
 *      caret-color:transparent + blur() 双保险。
 *   3. 滚动位置：Safari/Chromium 都可能在上次交互后保留 scrollTop，同一份 DOM
 *      截出来的可视区域不同。统一回到顶部。
 *   4. **滚动条本身**（踩过，最隐蔽的一个）：375px 下首页超高，右边有一条滚动条，
 *      它的滑块位置由「滚动位置 + 文档总高度」共同决定 —— 两者都极轻微地漂移，
 *      于是每一轮的 diff 都落在 x 357~374 这 18px 的窄条上（容差 8 时 236 个像素）。
 *      1280 断点首页不超高、没有滚动条，所以从不报错，只有 home-375 一直对不上：
 *      这是「为什么只有一张图有问题」的答案。滚动条既不是内容也不表达布局，
 *      直接隐藏掉 —— 隐藏后内容区域变宽是**确定的**变化，比滑块漂移好。
 *   5. **时间相关内容**（踩过，第二轮）：问候语按小时分段、日期行按天、
 *      今日税感的「剩 N 天」按天倒计时 —— 基线拍于上午、复查跑到中午，
 *      「上午好」变「中午好」，两张 home 当场双红。冻结的是**确定性**不是真实性：
 *      占位写死（结构照抄真实渲染的 dot + 文本），跨天跨时段基线不再漂。
 * 这五个都不是「视觉 diff」，而是「时序噪声」——不掐掉就没法把 hash 当指纹用。
 */
const FREEZE_JS = `(function(){
    if (!document.getElementById('__baseline_freeze__')) {
        var s = document.createElement('style');
        s.id = '__baseline_freeze__';
        s.textContent = '*,*::before,*::after{transition:none!important;animation:none!important;'
            + 'caret-color:transparent!important;scroll-behavior:auto!important}'
            // 滚动条：连它自己带的那一条也藏掉。scrollbar-width 管 Firefox 标准写法，
            // ::-webkit-scrollbar 管 Chromium/Safari；两者都写才跨平台一致。
            // 用 * 而不是只写 html,body：真正在滚动的可能是某个内部容器（不是文档根）。
            + '*{scrollbar-width:none!important;-ms-overflow-style:none!important;}'
            + '*::-webkit-scrollbar{width:0!important;height:0!important;display:none!important;}';
        (document.head || document.documentElement).appendChild(s);
    }
    try { var a = document.activeElement; if (a && a.blur) a.blur(); } catch (e) {}
    try {
        window.scrollTo(0, 0);
        if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
        var c = document.querySelector('.page:not(.hidden)');
        if (c && c.parentElement && c.parentElement.scrollTop !== undefined) c.parentElement.scrollTop = 0;
    } catch (e) {}
    // 5. 时间相关内容：占位写死。税感占位照抄真实渲染的「dot + 文本」结构，
    //    不拍瘪卡片（首行取基线当时的内容，编号与天数不再随真实日期走）。
    try {
        var g = document.getElementById('home-greeting');
        if (g) g.textContent = '上午好 👋';
        var dt = document.getElementById('home-date-text');
        if (dt) dt.textContent = '今天是 2026年9月20日 · 周日';
        var tf = document.getElementById('home-tax-feel-content');
        if (tf) tf.innerHTML = '<div class="flex items-start"><span class="tax-reminder-dot bg-warning"></span>'
            + '<span>经营所得减半优惠剩 467 天（至 2027.12.31）</span></div>';
    } catch (e) {}
    return 'ok';
})()`;

/**
 * 轮询等待页面「资源就绪」：DOM 完成 + 字体加载完成。
 *
 * 为什么要等（踩过，是本次最隐蔽的坑）：
 *   index.html 引了 6 个外网 CDN（font-awesome 4.7 的 CSS+字体、chart.js、jspdf、
 *   autotable、html2canvas、qrcode）。**图标是字体**，字体没到就是空白方块 ——
 *   于是「CDN 到没到」直接决定截图长什么样。热会话走磁盘缓存，秒开；冷启动
 *   缓存为空，字体还在路上就被截了图，出来的图和热态不是一个东西（首页那几个
 *   fa 图标直接缺席）。盲等固定毫秒数守不住这个：网络快慢不定。
 *   （注：本次排查中那 85B 的差异最后查明是滚动条，见 FREEZE_JS 的注释 ——
 *    字体缺席导致的差异要大得多，两者别搞混。）
 *
 * 为什么是**轮询 + 有限轮次**而不是一次性 wait：
 *   document.readyState 只说明 DOM，document.fonts.status 才说明字体；两者都要看。
 *   但也不能无限等 —— 外网不通时永远等不到，届时宁可拍一张「图标没渲染」的图并
 *   明确告警，也不要把脚本挂死（实测冷启动挂了 7 分钟不出图）。
 *
 * @returns {boolean} 是否等到就绪（false = 超时，本次截图可能缺图标 / 缺脚本）
 */
async function waitForReady(maxRounds) {
    const probe = `(function(){return document.readyState+'|'+(document.fonts?document.fonts.status:'none')})()`;
    const rounds = maxRounds || 6;
    for (let i = 0; i < rounds; i++) {
        let s = '';
        try { s = await ab(['eval', probe], 30000); } catch (e) { /* 单次探测失败按未就绪处理，继续下一轮 */ }
        const m = String(s).replace(/"/g, '').split('|');
        const domOk = m[0] === 'complete';
        const fontOk = m[1] === 'loaded' || m[1] === 'none';   // none = 浏览器不支持 FontFaceSet，无从判断，放过
        if (domOk && fontOk) return true;
        await ab(['wait', '1500']);
    }
    return false;
}

/**
 * 打开 → 复位存储 → reload → 设视口 → 等资源就绪 → 执行准备脚本 → 等 → 冻结 → 截图。
 *
 * 为什么不用 `batch` 一条命令跑完：
 *   实测 0.36.0 的 batch 把每个 JSON 数组参数报成 "Unknown command"
 *   （与 help 里的示例写法不符，疑为平台相关的参数解析差异）。
 *   逐步调用每次一个进程，慢一点但语义明确、报错能定位到具体哪一步；
 *   会话靠 --session 保持，不会每次重开浏览器。
 */
async function captureOne(url, vp, prepareJs, outFile, expectSel) {
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
    await ab(['reload']);
    await ab(['set', 'viewport', String(vp.w), String(vp.h)]);
    // 等 CDN 就绪（字体/脚本）再往下走 —— 见 waitForReady 的注释
    const ready = await waitForReady(6);
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
    return { state: state, ready: ready };
}

function sha256File(file) {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

// ============================ 主流程 ============================

(async function main() {
    fs.mkdirSync(outDir, { recursive: true });

    const server = await startServer(portArg);
    const url = 'http://127.0.0.1:' + portArg + '/';
    console.log('静态服务器已启动：' + url);
    console.log('模式：' + (isCheck ? '比对（--check，不覆盖基线）' : '生成基线'));
    console.log('目标：' + targets.map(t => t.id).join(', '));
    console.log('');

    const manifest = [];
    let failed = 0;

    for (const t of targets) {
        for (const vp of VIEWPORTS) {
            const fileName = t.id + '-' + vp.tag + '.png';
            const outFile = path.join(outDir, fileName);
            process.stdout.write('  拍摄 ' + fileName + ' (' + t.name + ' @ ' + vp.w + 'px) … ');
            try {
                const shot = await captureOne(url, vp, t.prepare, outFile, t.expect);
                if (!fs.existsSync(outFile)) throw new Error('截图未生成');
                manifest.push({
                    id: t.id,
                    name: t.name,
                    width: vp.w,
                    height: vp.h,
                    file: fileName,
                    bytes: fs.statSync(outFile).size,
                    sha256: sha256File(outFile),
                    // 资源就绪标记：false 说明 CDN 字体/脚本没等到，这张图的图标可能是空的。
                    // 存进 manifest 是为了让 --check 能识别「不是代码变了，是网络没到位」。
                    ready: shot.ready
                });
                console.log('OK · 当前页 ' + shot.state + (shot.ready ? '' : ' · [资源未就绪]'));
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
        const baseMap = new Map(base.map(x => [x.id + '@' + x.width, x]));

        const changed = [], same = [], missing = [];
        for (const cur of manifest) {
            const key = cur.id + '@' + cur.width;
            const b = baseMap.get(key);
            if (!b) { missing.push(cur); continue; }
            if (b.sha256 === cur.sha256) same.push(cur);
            else changed.push({ cur, b });
        }

        console.log('\n===== 比对结果 =====');
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

    const manifestPath = path.join(BASELINE_DIR, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    console.log('\n===== 完成 =====');
    console.log('成功：' + manifest.length + ' 张，失败：' + failed + ' 张');
    console.log('基线目录：' + BASELINE_DIR);
    console.log('清单：    ' + manifestPath);
    if (failed) process.exit(1);
})().catch(e => {
    console.error('\n[FATAL] ' + (e && e.stack || e));
    process.exit(1);
});
