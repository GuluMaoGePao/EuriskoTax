// CI 工作流的护栏（2026-10-24 新增）
//
// 为什么钉这些：CI 是**唯一一个拿到仓库凭据的地方** —— 它能读全部代码、能跑任意命令。
// 往里塞一次服务器私钥或 Basic Auth 口令，就等于把它发给每一个能看日志的人
// （GitHub Actions 的日志默认是公开的）。所以「CI 里不许有凭据、不许有部署动作」
// 必须是会红的断言，不能只是开头一句注释。
//
// 另一条同样重要：**门禁步骤被删掉也要红**。少跑一步门禁，CI 会是绿的 ——
// 那种绿比没有 CI 更糟，因为它让人以为验过了。
const fs = require('fs');
const path = require('path');

const WF = path.resolve(__dirname, '../.github/workflows/ci.yml');

describe('CI 工作流存在且跑全该跑的门禁', () => {
    let text;
    beforeAll(() => {
        text = fs.readFileSync(WF, 'utf8');
    });

    test('工作流文件存在', () => {
        expect(fs.existsSync(WF)).toBe(true);
    });

    test('三步门禁一个都不能少（少一步 CI 也是绿的，那种绿比没有 CI 更糟）', () => {
        expect(text).toContain('npm test');
        expect(text).toContain('npm run verify:local');
        expect(text).toContain('npm run verify:release');
    });

    test('跑在 push 与 PR 上', () => {
        expect(text).toMatch(/push:/);
        expect(text).toMatch(/pull_request/);
    });
});

describe('CI 里不许出现凭据与部署动作', () => {
    let text;
    beforeAll(() => {
        // 只看**实际会执行的行**：文件开头的注释里明确写着「刻意不做部署 / 不跑冒烟」，
        // 把注释也算进去的话，解释「为什么不做」反而会让断言红掉。
        text = fs.readFileSync(WF, 'utf8')
            .split(/\r?\n/)
            .filter((l) => !/^\s*#/.test(l))
            .join('\n');
    });

    test('不含任何口令 / 私钥 / Basic Auth 凭据', () => {
        // 命中的都是「看起来像凭据」的字面量：CI 日志默认公开，出现一个就是泄露
        const forbidden = [
            /BEGIN (RSA |OPENSSH |EC |)PRIVATE KEY/,
            /euriskotax-beta\s*:/,        // beta 的 Basic Auth 用户:口令
            /WJcHwoOf11ZVJKM9ZUip/,
            /_sskkey|\.pem\b/,
            /secrets\.[A-Z_]+/,           // 显式引用 secret 至少要让评审看见（此处禁止硬编码）
            /password\s*[:=]\s*['"][^'"]+['"]/i,
        ];
        forbidden.forEach((re) => {
            expect(text).not.toMatch(re);
        });
    });

    test('不含部署动作（CI 只证明仓库绿，不上线）', () => {
        expect(text).not.toContain('ops-deploy');
        expect(text).not.toContain('git push');
        expect(text).not.toContain('smoke:beta');
    });
});
