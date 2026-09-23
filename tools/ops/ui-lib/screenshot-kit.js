#!/usr/bin/env node
/**
 * 视觉类脚本的公共底座（tools/ops/ui-lib/screenshot-kit.js）
 *
 * 为什么抽这一层：
 *   阶段19-1 补验收时要写第二个真机脚本（对比度审计 ui-contrast-audit.js），
 *   它需要和截图基线**完全一样**的三样东西：静态服务器、agent-browser 调用、
 *   6 个页面的状态准备脚本。这三样里前两样是踩坑踩出来的（见下面各段注释），
 *   复制一份过去 = 坑也要维护两份，且两边迟早走偏（一边修了 spawnSync 死锁，
 *   另一边没有）。所以抽成底座，两个脚本共用同一份实现。
 *
 * 使用方式：
 *   const kit = require('./ui-lib/screenshot-kit');
 *   const server = await kit.startServer(4173);
 *   const browser = kit.createBrowser('ui-baseline');   // 会话名隔离，两个脚本不抢同一个浏览器
 *   await browser.ab(['open', url]);
 *
 * 这里只放**与页面无关**的能力（服务器 / 浏览器 / 目标定义）。
 * 与具体任务相关的比对、打分、报告留在各自的脚本里。
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

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
 *
 * 注意：对比度审计复用同一份 prepare —— 只有切到同一个状态，
 * 两件事（截图 / 取色）才是在说同一个画面，否则审计结论对不上图。
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
        // 阶段19-3 起场景组默认折叠：prepare 里**展开全部组**再拍。
        // 折叠态的画面里只有 6 行组头，41 个入口与卡片微标签一个都拍不到 ——
        // 那等于把这张基线的价值也一起折叠掉了（对比度审计复用同一份 prepare，同理）。
        // 只摘 class、不写 localStorage：拍一张图不能把用户的展开记忆改掉。
        // 「默认折叠」这件事本身由单测钉住（tests/toolbox-ui.test.js）。
        prepare: `if (window.showPage) window.showPage('tools-page');
            document.querySelectorAll('.tool-group').forEach(function(g){ g.classList.remove('is-collapsed'); });`
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
        id: 'deep-step1-advanced',
        name: '完整测算第1步（年度汇算 · 简明视图的更多参数）',
        // 阶段19-7b：advanced **字段级**分级铺到了全部 spec，而上面 deep-step1 / deep-result
        // 两张用的 bonus-tax-deep 是 19-7a 就有的**步**级分级 —— 新铺的折叠块一张基线都没进过，
        // 等于这轮唯一肉眼可见的产物没有回归网（以后改坏了哪种跑法都发现不了）。
        // 年度汇算第 1 步就有三项（劳务 / 稿酬 / 特许权）在简明视图下收进
        // 「⚙ 更多参数（可选）」，一张图正好盖住「默认收起 + 折叠块在场」这两件事。
        // 不额外拍展开态：那是完整视图的活，由 mode-pref 的对拍守护管。
        prepare: `if (window.EuriskoDeepWizard) window.EuriskoDeepWizard.open('annual-settlement-deep', { fresh: true });`
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
 *   6. **悬浮助手球 `.assistant-fab`**（踩过，第三轮，最顽固的一个）：
 *      它是可拖动的浮动球，**位移由 JS 写进 `--peek-x`、形态由 JS 加 `--peek` 类**
 *      （peek = 贴边只露月牙 + opacity .5）。也就是说它的位置与样子由**脚本在
 *      某个时刻**决定，不是 CSS 静态决定 —— 关掉 animation/transition 管不到它：
 *      那只是让它瞬间到位，而"到位到哪儿"取决于 JS 那一刻算出的值。
 *      实测同一份代码连拍三次：68469B / 68417B / 68401B，三次都不一样，
 *      差异稳定落在 x 357~374 这条右缘竖带上（正是 peek 状态下露出的那 18px；
 *      与第 4 条滚动条曾经落的位置相同，别再误判成滚动条）。
 *      处理：钉成确定态（完全显示、无位移、无过渡），用 !important 压住
 *      JS 后续可能加回的类与内联变量 —— 截图要的是**可复现**，不是还原动画中间态。
 * 这六个都不是「视觉 diff」，而是「时序噪声」——不掐掉就没法把 hash 当指纹用。
 *
 * 对比度审计也注入同一段：冻结动画是为了让过渡中的半透明元素落到终态，
 * 否则读到的是过渡中途的颜色（一个正在 fade-in 的文字 opacity 可能是 0.4，
 * 算出来的对比度毫无意义）。
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
            + '*::-webkit-scrollbar{width:0!important;height:0!important;display:none!important;}'
            // 6. 悬浮助手球钉成确定态（见上方注释第 6 条）。!important 是必须的：
            //    JS 可能在冻结之后又加回 --peek 类或改写 --peek-x 内联变量，
            //    普通优先级压不住，且它的位移本身是 transform，只有压住 transform 才回得来。
            + '.assistant-fab{opacity:1!important;transform:none!important;transition:none!important;}';
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
 * 切换到指定主题。
 *
 * 为什么两件事都要做（只做一个不够）：
 *   1. localStorage['theme'] 是**持久**的（app.js 的切换按钮写它），页面初始化
 *      时会读它 —— 不写这个，reload 之后页面会按「上次的值」把我们的设置盖回去。
 *   2. documentElement.classList 是**当前生效**的（所有 .dark 选择器都挂在它上面）
 *      —— 不写这个，就得赌页面初始化真的读了 localStorage（初始化时机不确定）。
 *   两者都写，reload 前后都站得住。
 */
function themeJs(theme) {
    return `(function(){
        try {
            localStorage.setItem('theme', '${theme}');
            var d = document.documentElement.classList;
            d.remove('dark');
            if ('${theme}' === 'dark') d.add('dark');
        } catch (e) {}
        return 'ok';
    })()`;
}

// ============================ 静态服务器 ============================

/**
 * 不依赖后端：只起静态服务器托管项目根。页面在 /api 不可用时仍会渲染
 * （auth-ui.js 的初始化遮罩在 finally 里无条件移除，不会白屏），
 * 而截图/审计关注的是**布局与样式**，不是数据 —— 反而更稳定。
 */
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
 * 创建一个绑定了会话名的浏览器句柄。
 *
 * 为什么用工厂而不是导出一个全局 ab：会话名必须隔离 —— 截图脚本用 ui-baseline、
 * 对比度脚本用 ui-a11y，否则两个脚本交替跑会互相顶掉彼此的浏览器状态
 * （尤其是 viewport 和当前页面）。工厂让调用方在一处决定会话名，
 * 后续调用签名与原来完全一致（ab(['open', url])），改造成本最小。
 */
function createBrowser(session) {
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
                [resolveAgentBrowserEntry(), '--session', session].concat(args),
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
     * 轮询等待页面「资源就绪」：DOM 完成 + 字体加载完成。
     *
     * 为什么要等（踩过，是本次最隐蔽的坑）：
     *   index.html 引了 6 个外网 CDN（font-awesome 4.7 的 CSS+字体、chart.js、jspdf、
     *   autotable、html2canvas、qrcode）。**图标是字体**，字体没到就是空白方块 ——
     *   于是「CDN 到没到」直接决定截图长什么样。热会话走磁盘缓存，秒开；冷启动
     *   缓存为空，字体还在路上就被截了图，出来的图和热态不是一个东西（首页那几个
     *   fa 图标直接缺席）。盲等固定毫秒数守不住这个：网络快慢不定。
     *
     * 为什么是**轮询 + 有限轮次**而不是一次性 wait：
     *   document.readyState 只说明 DOM，document.fonts.status 才说明字体；两者都要看。
     *   但也不能无限等 —— 外网不通时永远等不到，届时宁可拍一张「图标没渲染」的图并
     *   明确告警，也不要把脚本挂死（实测冷启动挂了 7 分钟不出图）。
     *
     * @returns {boolean} 是否等到就绪（false = 超时）
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

    return { ab, waitForReady, session };
}

module.exports = {
    PROJECT_ROOT,
    VIEWPORTS,
    TARGETS,
    FREEZE_JS,
    themeJs,
    startServer,
    createBrowser,
    resolveAgentBrowserEntry
};
