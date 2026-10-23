// 功能开关（src/js/utils/feature-flags.js）
//   为什么单独一个文件盯它：开关的失效方式全是**静默**的 ——
//   拼错名字不会报错、优先级搞反不会报错、正式站误开也不会报错，
//   只会表现成「新功能在某些人那里不出来」或「没全量的功能跑到了全体用户面前」。
//   本项目没有预发环境，开关是「真机小范围验证」的唯一手段，它本身必须先被验证。
//   这里盯五件事：① 默认全关；② 四条打开途径与优先级；③ 未登记名字必须关；
//   ④ 预发角标只在 beta 站出现（正式站永不出现）；⑤ index.html 已引入且早于业务模块。

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'src/js/utils/feature-flags.js'), 'utf8');
const INDEX_HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const BADGE_ID = 'eurisko-beta-badge';

function setSearch(search) {
    Object.defineProperty(window, 'location', {
        value: new URL('https://euriskotax.com/' + search),
        writable: true,
        configurable: true
    });
}

function loadFlags() {
    delete window.EuriskoFlags;
    (0, eval)(SRC);
    return window.EuriskoFlags;
}

beforeEach(() => {
    document.body.innerHTML = '';
    window.localStorage.clear();
    delete window.__APP_CHANNEL__;
    setSearch('');
});

describe('功能开关：默认态与登记约束', () => {
    test('未做任何设置时，所有开关一律关闭（新功能默认不上线）', () => {
        const flags = loadFlags();
        flags.list().forEach((f) => {
            expect(f.on).toBe(false);
        });
    });

    test('未登记的开关名返回 false，而不是 undefined —— `if (enabled(...))` 不会误判为真', () => {
        const flags = loadFlags();
        expect(flags.enabled('not.registered.name')).toBe(false);
    });

    test('enable/disable 只认登记过的名字，误用不会被静默当成成功', () => {
        const flags = loadFlags();
        expect(flags.enable('not.registered.name')).toBe(false);
        expect(flags.disable('not.registered.name')).toBe(false);
    });

    test('每个登记项都带说明文字（半年后没人记得这个开关是干什么的）', () => {
        const flags = loadFlags();
        flags.list().forEach((f) => {
            expect(f.desc.length).toBeGreaterThan(0);
        });
    });
});

describe('功能开关：四条打开途径与优先级', () => {
    test('?beta=1 一次打开所有 beta 通道开关', () => {
        setSearch('?beta=1');
        const flags = loadFlags();
        const betaOnes = flags.list().filter((f) => f.beta);
        expect(betaOnes.length).toBeGreaterThan(0);
        betaOnes.forEach((f) => expect(flags.enabled(f.name)).toBe(true));
    });

    test('channel=beta（部署注入）等价于 ?beta=1', () => {
        window.__APP_CHANNEL__ = 'beta';
        const flags = loadFlags();
        expect(flags.isBeta()).toBe(true);
        flags.list().filter((f) => f.beta).forEach((f) => {
            expect(flags.enabled(f.name)).toBe(true);
        });
    });

    test('?ff=名字 只开指定的那一个，不牵连其它开关', () => {
        const target = 'env.betaBadge';
        setSearch('?ff=' + target);
        const flags = loadFlags();
        expect(flags.enabled(target)).toBe(true);
        flags.list().filter((f) => f.name !== target).forEach((f) => {
            expect(flags.enabled(f.name)).toBe(false);
        });
    });

    test('localStorage 持久化生效，换页不丢（内部自测常用）', () => {
        const flags = loadFlags();
        flags.enable('env.betaBadge');
        // 重新加载一次模块，模拟下一次访问
        const again = loadFlags();
        expect(again.enabled('env.betaBadge')).toBe(true);
    });

    test('?beta=1 优先于 localStorage 里的显式关闭（救火时不能被人手滑关死）', () => {
        window.localStorage.setItem('euriskoFeatureFlags', JSON.stringify({ 'env.betaBadge': false }));
        setSearch('?beta=1');
        const flags = loadFlags();
        expect(flags.enabled('env.betaBadge')).toBe(true);
    });

    test('reset() 清空持久化，回到「真实用户」的默认视角', () => {
        const flags = loadFlags();
        flags.enable('env.betaBadge');
        flags.reset();
        expect(loadFlags().enabled('env.betaBadge')).toBe(false);
    });
});

describe('预发环境角标', () => {
    test('正式站（无 channel）不出现角标 —— 决不能误伤真实用户', () => {
        loadFlags();
        expect(document.getElementById(BADGE_ID)).toBeNull();
    });

    test('channel=beta 时插入角标，且写明「数据非生产」', () => {
        window.__APP_CHANNEL__ = 'beta';
        loadFlags();
        const badge = document.getElementById(BADGE_ID);
        expect(badge).not.toBeNull();
        expect(badge.textContent).toContain('预发环境');
        expect(badge.textContent).toContain('非生产');
    });

    test('?beta=1 也能预览角标（不必为了看一眼去部署 beta 站）', () => {
        setSearch('?beta=1');
        loadFlags();
        expect(document.getElementById(BADGE_ID)).not.toBeNull();
    });

    test('重复渲染不产生第二个角标', () => {
        window.__APP_CHANNEL__ = 'beta';
        const flags = loadFlags();
        flags.renderBadge();
        flags.renderBadge();
        expect(document.querySelectorAll('#' + BADGE_ID).length).toBe(1);
    });
});

describe('接入完整性', () => {
    test('index.html 已引入 feature-flags.js，且早于业务模块 navigation-ui.js', () => {
        expect(INDEX_HTML).toContain('src/js/utils/feature-flags.js');
        const flagAt = INDEX_HTML.indexOf('src/js/utils/feature-flags.js');
        const navAt = INDEX_HTML.indexOf('src/js/ui/navigation-ui.js');
        expect(flagAt).toBeGreaterThan(-1);
        expect(navAt).toBeGreaterThan(flagAt);
    });

    test('源码不写死 channel（正式站读不到 __APP_CHANNEL__ 就该是正式站）', () => {
        // 只看非注释代码行：文档注释里出现「置为 'beta'」这类说明不该算违规
        const codeOnly = SRC
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .split('\n')
            .filter((l) => !/^\s*(\*|\/\/)/.test(l))
            .join('\n');
        expect(codeOnly).not.toMatch(/__APP_CHANNEL__\s*=/);
    });
});
