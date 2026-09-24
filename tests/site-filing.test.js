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

describe('备案位：未备案期间（当前状态）', () => {
    test('位置占住：容器可见，且显示主体名 + 状态语', () => {
        const { api, host } = mount();
        expect(host.style.display).not.toBe('none');
        expect(host.textContent).toContain(api.config.owner);
        expect(host.textContent).toContain('备案办理中');
        // 占位态带弱化标记，拿到号后这个 class 要消失
        expect(host.classList.contains('site-filing--pending')).toBe(true);
    });

    test('占位不得出现任何形似备案号的数字串（写假号 = 未备案展示备案号）', () => {
        const { host } = mount();
        // 真号形如「沪ICP备2026XXXXXX号-1」「沪公网安备 31010402000000号」：连续 6 位以上数字
        expect(host.textContent).not.toMatch(/\d{6,}/);
        expect(host.innerHTML).not.toMatch(/ICP备\s*\d/);
        // 占位行里也不该有 beian 链接（没有号就没有可跳转的备案公示）
        expect(host.innerHTML).not.toContain('beian.miit.gov.cn');
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

    test('pendingText 置空 → 只剩主体名，位置仍然占住', () => {
        const { api, host } = mount();
        api.config.pendingText = '';
        api.render();
        expect(host.textContent.trim()).toBe(api.config.owner);
        expect(host.style.display).not.toBe('none');
    });
});
