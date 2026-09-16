/**
 * 备案内容合规 —— 承诺书三句话的可执行版本
 *
 * 这个文件守护的不是风格偏好，而是**已经对外承诺过的内容**：
 * 备案时向上海市通信管理局提交的《不涉及前置审批的承诺书》里写过：
 *   ① 网站名称 =「EuriskoTax 税费计算器」
 *   ② 具体内容 = 在线税费及社保计算工具，**仅提供数值测算，不代为办理纳税申报**，
 *      不涉及资金收付、支付结算、税务代理及投资理财业务
 *   ③ **页面均标注「本测算结果仅供参考，不构成税务建议」**
 *
 * 这三句话一旦在页面上做不到，性质是「承诺不实」，不是「文案不够好」——
 * 所以逐条写成断言：谁把话术改回去、谁删了页脚免责声明，这里立刻变红。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DISCLAIMER = '仅供参考，不构成税务建议';

function read(rel) {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

// 对外页面：App 首页 + seo 目录页 + 20 个落地页（admin.html 是后台，不对外，不计入）
const PUBLIC_PAGES = ['index.html'].concat(
    fs.readdirSync(path.join(ROOT, 'seo'))
        .filter((f) => f.endsWith('.html'))
        .map((f) => 'seo/' + f)
);

describe('备案内容合规（承诺书级）', () => {
    test('网站名称与备案一致：每个对外页面都能看到中文全称', () => {
        const missing = PUBLIC_PAGES.filter((p) => !read(p).includes('EuriskoTax 税费计算器'));
        // 名称与备案不符是最常见的驳回点：改页脚时别把中文名删了
        expect(missing).toEqual([]);
    });

    test('每个对外页面都标注「仅供参考，不构成税务建议」（承诺书写的是「页面均标注」）', () => {
        const missing = PUBLIC_PAGES.filter((p) => !read(p).includes(DISCLAIMER));
        expect(missing).toEqual([]);
    });

    test('对外页面不出现承诺书排除的业务：代办申报 / 税务代理 / 代理记账', () => {
        // 只禁「经营动作」类措辞 —— 免责声明里的「不构成投资建议」含「投资建议」四字，不能按词禁
        const banned = ['代为办理纳税申报', '代办申报', '税务代理', '代理记账', '代账服务', '包过', '保证退税'];
        const hits = [];
        PUBLIC_PAGES.forEach((p) => {
            const src = read(p);
            banned.forEach((word) => {
                if (src.includes(word)) hits.push(p + ' → ' + word);
            });
        });
        expect(hits).toEqual([]);
    });

    test('不宣称官方或与政府部门有关联（避免被误认为官方系统）', () => {
        const src = read('index.html');
        ['国家税务总局指定', '官方指定', '政府合作', '税务局授权'].forEach((w) => {
            expect(src.includes(w)).toBe(false);
        });
    });

    test('首页无在线支付入口：承诺不涉及资金收付 / 支付结算（当前只发兑换码）', () => {
        // 真要开线上收款，先确认 ICP 是否为经营性、要不要增值电信许可 —— 这条红的时候别硬删，
        // 而是先把资质问题想清楚（见 docs/marketing/wecom-channel-playbook.md）
        const src = read('index.html');
        ['微信支付', '支付宝', '立即付款', '在线支付', '扫码付款'].forEach((w) => {
            expect(src.includes(w)).toBe(false);
        });
    });
});
