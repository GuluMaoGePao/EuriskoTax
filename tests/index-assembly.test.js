// 阶段18-1（v1.71.0）：index.html 的脚本装配守护
//
// 为什么需要这一份测试：index.html 用 <script> 的**书写顺序**表达依赖（62 个本地脚本，
// 没有任何打包器 / 模块系统介入）。而此前全部测试都是「只 eval 自己需要的那几个文件」——
// tests/helpers/load-source.js 里登记的前置只有 solver → tax-calculator 那三条。
// 于是存在一条谁都看不见的缝，而且它已经咬过人：
//   · solver.js 必须排在 tax-calculator.js 之前（错序则是二分倒算整块失效）；
//   · 所有 *-quick.js 必须排在 tool-registry.js 之前 —— spec 驱动的完整测算复用速算器
//     的 fields / steps / compute 靠的是**同一份对象引用**（tool-registry.test.js 用 toBe 钉住），
//     一旦 quick 晚于注册表加载，spec 拿到的就是 undefined；
//   · v1.67~v1.70 往这个顺序里新插了 property-transfer-quick.js / non-resident-quick.js。
// 这三种错法都会让页面整块失效，而 90 个套件依然全绿。
// 这一份测试把「按 index.html 的真实顺序装配一遍」变成门禁项。

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// 按出现顺序解析 <script>：经典脚本进 classic，type="module" 的单独装（它们走 ESM 图，
// 在 jsdom 里 eval 会撞语法错误 —— 不是本测试要守的加载路径，只断言它们没混进经典列表）
function parseScripts() {
    const classic = [];
    const modules = [];
    Array.from(HTML.matchAll(/<script\b([^>]*)>/g)).forEach(function (m) {
        const attrs = m[1];
        const srcMatch = attrs.match(/src="([^"]+)"/);
        if (!srcMatch) return;                  // 内联脚本不在本测试管辖范围
        const src = srcMatch[1];
        if (src.indexOf('src/js/') !== 0) return; // CDN / 外部脚本
        if (/type\s*=\s*"module"/.test(attrs)) modules.push(src);
        else classic.push(src);
    });
    return { classic: classic, modules: modules };
}

const parsed = parseScripts();
const CLASSIC = parsed.classic;
const MODULES = parsed.modules;

// 硬顺序约束：before 必须先于 after 出现
const ORDER_RULES = [
    {
        before: 'src/js/calculation/tax-constants.js',
        after: 'src/js/calculation/tax-calculator.js',
        why: '税率表与规则常量是所有计算的输入，必须在内核之前'
    },
    {
        before: 'src/js/calculation/solver.js',
        after: 'src/js/calculation/tax-calculator.js',
        why: '通用单调求解器：v1.41.0 收编了手写在 8 处的二分倒算，错序即倒算整块失效'
    },
    {
        before: 'src/js/calculation/tax-registry.js',
        after: 'src/js/calculation/salary-tax-quick.js',
        why: '速算器在顶层向 tax-registry 登记，注册表必须先就位'
    },
    {
        before: 'src/js/data/tax-rates-sync.js',
        after: 'src/js/calculation/tax-calculator.js',
        why: '税率同步先于内核，避免内核读到未同步的旧表'
    },
    {
        before: 'src/js/data/tool-registry.js',
        after: 'src/js/ui/toolbox-ui.js',
        why: '工具箱 UI 渲染的是注册表里的数据'
    },
    {
        before: 'src/js/data/tool-registry.js',
        after: 'src/js/ui/deep-wizard-ui.js',
        why: '向导渲染器读的是 registry 里的 spec'
    }
];

describe('index.html 脚本清单', () => {
    test('解析出的本地脚本数量符合预期（不是解析失败后的空列表）', () => {
        expect(CLASSIC.length).toBeGreaterThan(50);
        expect(MODULES.length).toBeGreaterThan(0);
    });

    test('每个 src 都指向磁盘上真实存在的文件', () => {
        const missing = CLASSIC.concat(MODULES).filter(function (src) {
            return !fs.existsSync(path.join(ROOT, src));
        });
        expect(missing).toEqual([]);
    });

    test('同一个脚本不会被加载两次（重复加载会静默重置模块状态）', () => {
        const seen = {};
        const dup = [];
        CLASSIC.forEach(function (src) {
            if (seen[src]) dup.push(src);
            seen[src] = true;
        });
        expect(dup).toEqual([]);
    });

    test('ESM 脚本没有被混进经典脚本列表', () => {
        MODULES.forEach(function (src) {
            expect(CLASSIC).not.toContain(src);
        });
    });
});

describe('index.html 脚本顺序', () => {
    test('已知的依赖顺序全部成立', () => {
        const violations = [];
        ORDER_RULES.forEach(function (rule) {
            const i = CLASSIC.indexOf(rule.before);
            const j = CLASSIC.indexOf(rule.after);
            if (i < 0 || j < 0 || i > j) {
                violations.push(rule.before + ' 必须排在 ' + rule.after + ' 之前（' + rule.why + '）');
            }
        });
        expect(violations).toEqual([]);
    });

    test('所有 *-quick.js 都排在 tool-registry.js 之前（spec 复用速算器靠的是同一份对象引用）', () => {
        const registryIndex = CLASSIC.indexOf('src/js/data/tool-registry.js');
        expect(registryIndex).toBeGreaterThan(-1);
        const late = CLASSIC.filter(function (src, idx) {
            return /-quick\.js$/.test(src) && idx > registryIndex;
        });
        expect(late).toEqual([]);
    });

    test('磁盘上的 *-quick.js 一个不落地登记进 index.html（新增速算器不会漏插脚本）', () => {
        const onDisk = fs.readdirSync(path.join(ROOT, 'src/js/calculation'))
            .filter(function (f) { return /-quick\.js$/.test(f); })
            .map(function (f) { return 'src/js/calculation/' + f; });
        expect(onDisk.length).toBeGreaterThan(0);
        const orphan = onDisk.filter(function (src) { return CLASSIC.indexOf(src) === -1; });
        expect(orphan).toEqual([]);
    });
});

describe('按 index.html 的真实顺序装配一遍', () => {
    let failure = null;
    let loaded = 0;

    beforeAll(() => {
        // 脚本里有一批是「加载即读 DOM」的（home-ui 的 initHome 等），
        // 空文档会让它们报错 —— 那报的是测试环境的问题，不是装配的问题。
        // 所以先把 index.html 的 DOM 结构（剥掉所有 <script>）挂进来，再按序 eval。
        const inner = HTML
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .match(/<html[^>]*>([\s\S]*)<\/html>/i)[1];
        document.documentElement.innerHTML = inner;

        for (let i = 0; i < CLASSIC.length; i += 1) {
            const src = CLASSIC[i];
            const code = fs.readFileSync(path.join(ROOT, src), 'utf8');
            try {
                window.eval(code);
                loaded += 1;
            } catch (e) {
                // 遇到第一个就停：后面的报错大多是雪崩出来的连带结果，记下来只会淹没真正的根因
                failure = { src: src, message: String(e && e.message) };
                break;
            }
        }
    });

    test('62 个脚本按序执行，没有一个抛异常', () => {
        expect(failure).toBeNull();
        expect(loaded).toBe(CLASSIC.length);
    });

    test('装配完成后注册表可用：20 个速算器 + 21 个 spec 驱动完整测算', () => {
        // 与 tests/tool-registry.test.js 同一口径（改数量时两处一起改）
        const registry = window.EuriskoToolRegistry;
        expect(typeof registry).toBe('object');
        expect(registry.all().length).toBe(20);
        expect(registry.deep().length).toBe(21);
    });

    // 这条才是整套守护的牙齿所在。spec 的 compute 是**运行时**才去取 quick 模块的全局对象的：
    //     var Q = window.EuriskoNonResidentQuick; if (!Q) return null;
    // 于是「漏插一个 -quick.js」的表现不是报错、也不是注册表里少一个工具（spec 是静态定义的），
    // 而是页面能开、卡片也在，点进去结果区是空的 —— 而 tests/tool-registry.test.js 那一边
    // 是在它自己 eval 好了全部 quick 的环境里跑的，永远绿。只有把 compute 放在**真实装配环境**里
    // 跑一遍，这个洞才暴露得出来。
    test('装配后每个工具的 compute 都跑得出结果（漏插 quick 模块时它会静默返回 null）', () => {
        const registry = window.EuriskoToolRegistry;
        const dead = [];

        function defaultsOf(tool) {
            const values = {};
            (tool.fields || []).forEach(function (f) { values[f.key] = f.default; });
            return values;
        }

        function tryCompute(tool) {
            try {
                return { out: tool.compute(defaultsOf(tool)) };
            } catch (e) {
                return { threw: String(e && e.message) };
            }
        }

        registry.all().concat(registry.deep()).forEach(function (tool) {
            if (typeof tool.compute !== 'function') {
                dead.push(tool.id + '：compute 不是函数');
                return;
            }
            const r = tryCompute(tool);
            if (r.threw) dead.push(tool.id + '：抛异常 ' + r.threw);
            else if (!r.out) dead.push(tool.id + '：compute 返回空（对应的 -quick 模块多半没挂上）');
        });

        expect(dead).toEqual([]);
    });

    // 上面那条只钉「算不算得出东西」（deep 的输入是多步向导攒出来的，默认值未必构成一次合法输入，
    // 所以不对它的数值下断言）；20 个速算器是单屏直算、默认值就是一份合法输入，这里按与
    // tests/tool-registry.test.js 相同的口径把数值也钉住 —— 同一份代码跑在两个装配环境里。
    test('装配后 20 个速算器用默认值算出的数：无 error、primary 有限且非负', () => {
        const registry = window.EuriskoToolRegistry;
        const bad = [];
        registry.all().forEach(function (tool) {
            const values = {};
            tool.fields.forEach(function (f) { values[f.key] = f.default; });
            const out = tool.compute(values);
            if (out.error) bad.push(tool.id + '：' + out.error);
            else if (!Number.isFinite(Number(out.primary.value))) bad.push(tool.id + '：primary 不是有限数');
            else if (Number(out.primary.value) < 0) bad.push(tool.id + '：primary 为负');
        });
        expect(bad).toEqual([]);
    });
});
