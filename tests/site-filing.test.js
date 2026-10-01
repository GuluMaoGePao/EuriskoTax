/**
 * 备案位（#site-filing）的守护断言 —— F-02 / F-03
 *
 * 守的是两件会**静默出错**的事：
 *   ① 未备案期间：位置必须占住（否则号一下来页脚多一行、底栏往上顶），
 *      但绝不能显示形似备案号的假号 —— 未备案展示备案号，性质是违规，不是文案瑕疵；
 *   ② 备案号下发后：只改 src/js/ui/site-filing-ui.js 里的两行配置即可全站生效，
 *      这里把「填号之后会长什么样」钉成断言 —— 到那天改完配置跑测试，绿了就是对的，
 *      不必再逐页翻页脚。
 *
 * 两条都跟**合规**有关，所以断言写在渲染结果上（eval 真实脚本 + 真实 DOM），
 * 而不是写死一串字符串去比对源码。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'src/js/ui/site-filing-ui.js'), 'utf8');

/** 在干净的 DOM 里 eval 一遍渲染脚本，返回它的运行时对象 */
function mount() {
    document.body.innerHTML = '<div id="site-filing"></div>';
    window.eval(SRC);
    const host = document.getElementById('site-filing');
    return { api: window.EuriskoSiteFiling, host };
}

// v1.112.0：ICP 备案号于 2026-10-01 下发 —— 下面这组从「未备案期间」翻到「已备案」当前态。
// 文件头当初写的设计正是为此：填号之后跑测试，绿了就是对的，不必再逐页翻页脚。
describe('备案位：已备案（当前状态 · ICP 号已下发）', () => {
    test('位置占住：容器可见，显示主体名 + ICP 号，占位语与弱化样式都消失', () => {
        const { api, host } = mount();
        expect(host.style.display).not.toBe('none');
        expect(host.textContent).toContain(api.config.owner);
        expect(host.textContent).toContain(api.config.icpNumber);
        expect(host.textContent).not.toContain('备案办理中');
        expect(host.classList.contains('site-filing--pending')).toBe(false);
    });

    test('ICP 号是管局下发号的合法格式（不是占位串，也不是随手编的）', () => {
        const { api } = mount();
        // 沪 + ICP备 + 序号（不少于 6 位）+ 号-N；填错格式在页脚上是看不出来的，只能靠断言
        expect(api.config.icpNumber).toMatch(/^沪ICP备\d{6,}号-\d+$/);
    });

    test('号链到工信部公示，新窗口打开（工信部对页脚的法定要求）', () => {
        const { host } = mount();
        const a = host.querySelector('a');
        expect(a).not.toBeNull();
        expect(a.textContent).toMatch(/^沪ICP备\d{6,}号-\d+$/);
        expect(a.getAttribute('href')).toBe('https://beian.miit.gov.cn/');
        expect(a.getAttribute('target')).toBe('_blank');
        expect(a.getAttribute('rel')).toContain('noopener');
    });

    test('公安号未下发时不许出现形似公安号的假号（⏳ 办理中）', () => {
        const { api, host } = mount();
        // 只查**公安号那一路**的痕：ICP 号本身也含长数字串（2026049608），
        // 直接对整段文本查 /\d{10,}/ 会误伤自己 —— 断言要指名查什么。
        expect(api.config.policeNumber).toBe('');
        expect(host.textContent).not.toContain('公网安备');
        const policeish = host.textContent.replace(api.config.icpNumber, '').match(/\d{6,}/);
        expect(policeish).toBeNull();
        // 号没下来就不该有可跳转的公安公示链接
        expect(host.innerHTML).not.toContain('beian.mps.gov.cn');
    });
});

// 管局核验「网站名称与填报一致」：备案填报名是「EuriskoTax税费计算器」（录入不带空格）。
// 这条不是页脚的事，但改 title / 站点名的人不会想到备案订单里还挂着一个名字，
// 所以把一致性钉在这里 —— 谁改了 title 把站名改没，这里先红。
describe('备案网站名称一致性', () => {
    const INDEX = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const FILED_NAME = 'EuriskoTax税费计算器';   // 备案订单里的网站名称

    test('index.html 的 title 含备案站名（去空格后比对，允许排版空格）', () => {
        const m = INDEX.match(/<title>([^<]+)<\/title>/);
        expect(m).not.toBeNull();
        const norm = (s) => s.replace(/\s+/g, '');
        expect(norm(m[1])).toContain(norm(FILED_NAME));
    });
});

describe('备案位：号下发后只改配置', () => {
    test('填 ICP 号 → 显示号 + 工信部链接 + 主体名，占位语消失', () => {
        const { api, host } = mount();
        api.config.icpNumber = '沪ICP备2026000000号-1';
        api.render();

        expect(host.textContent).toContain('沪ICP备2026000000号-1');
        expect(host.textContent).toContain(api.config.owner);
        expect(host.textContent).not.toContain('备案办理中');
        expect(host.classList.contains('site-filing--pending')).toBe(false);
        const a = host.querySelector('a');
        expect(a.getAttribute('href')).toBe('https://beian.miit.gov.cn/');
        expect(a.getAttribute('target')).toBe('_blank');
        expect(a.getAttribute('rel')).toContain('noopener');
    });

    test('公安联网备案也办结 → 两个号都在，各自链到正确的公示站', () => {
        const { api, host } = mount();
        api.config.icpNumber = '沪ICP备2026000000号-1';
        api.config.policeNumber = '沪公网安备 31010402000000号';
        api.render();

        const hrefs = Array.from(host.querySelectorAll('a')).map((a) => a.getAttribute('href'));
        expect(hrefs).toEqual([
            'https://beian.miit.gov.cn/',
            'https://beian.mps.gov.cn/#/query/webSearch'
        ]);
    });

    // v1.112.0：这条原测「无号时 pendingText 置空只剩主体名」—— 号已下发，pendingText
    // 不再参与渲染（有号优先）。保留它要测的东西：状态语不得与正式号同时出现。
    test('pendingText 置空与否都不影响正式号（有号优先，状态语不叠加）', () => {
        const { api, host } = mount();
        api.config.pendingText = '';
        api.render();
        expect(host.textContent).toContain(api.config.icpNumber);
        expect(host.textContent).not.toContain('备案办理中');
        expect(host.style.display).not.toBe('none');
    });
});
