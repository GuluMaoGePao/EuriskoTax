// 线上（正式/预发）环境的网络错误文案不得出现 localhost:3000
//
// 背景：v1.149.1 部署预发站时，pm2 重启几十秒、Caddy 返回 502 HTML 错误页，
// 正在页面上操作的用户弹出了「服务器返回了非预期内容：请打开 http://localhost:3000 访问」
// —— 线上用户手里没有本地服务，照着提示去做只会更懵。
//
// api-client.js 加载时读 window.location 决定文案口径（本地预览才提示 localhost:3000），
// 所以这里用 vm 以不同 hostname 各加载一份源码来断言，改不了全局单例的既有测试加载方式。
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'js', 'api', 'api-client.js'), 'utf8')
    .replace(/^export\s+default\s+\w+;?\s*$/m, '');

const STORE = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

function loadInBrowser(hostname) {
    const sandbox = {
        window: {
            location: { hostname, protocol: 'https:', host: hostname },
            reload: () => {}
        },
        sessionStorage: STORE,
        localStorage: STORE,
        console,
        setTimeout
    };
    vm.createContext(sandbox);
    vm.runInContext(SRC, sandbox, { filename: 'api-client.js' });
    // apiRequest 是顶层函数声明 → 挂在 context 全局上
    return sandbox;
}

function htmlResponse(status) {
    return Promise.resolve({
        status,
        json: () => Promise.reject(new SyntaxError("Unexpected token '<' is not valid JSON"))
    });
}

async function errorMessage(promise) {
    try {
        await promise;
        throw new Error('预期 apiRequest 会 reject，但它成功了');
    } catch (e) {
        return e.message;
    }
}

describe('线上环境的网络错误文案（不得再出现 localhost:3000）', () => {
    const HOST = 'euriskotax.com';

    test('网关 5xx HTML（部署窗口/后端重启）→ 提示稍后刷新，不提 localhost', async () => {
        for (const status of [502, 503, 504]) {
            const sb = loadInBrowser(HOST);
            sb.fetch = jest.fn().mockResolvedValue(htmlResponse(status));
            // eslint-disable-next-line no-await-in-loop
            const msg = await errorMessage(sb.apiRequest('/auth/login', 'POST', {}));
            expect(msg).toContain('服务器正在更新或重启');
            expect(msg).not.toContain('localhost');
            expect(msg).not.toContain('静态服务');
        }
    });

    test('其它非 JSON 响应（如网关 404 HTML）→ 通用刷新提示，不提 localhost', async () => {
        const sb = loadInBrowser(HOST);
        sb.fetch = jest.fn().mockResolvedValue(htmlResponse(404));
        const msg = await errorMessage(sb.apiRequest('/auth/login', 'POST', {}));
        expect(msg).toContain('服务器返回了非预期内容');
        expect(msg).not.toContain('localhost');
    });

    test('网络彻底失败（fetch reject）→ 提示检查网络，不提 localhost', async () => {
        const sb = loadInBrowser(HOST);
        sb.fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));
        const msg = await errorMessage(sb.apiRequest('/auth/login', 'POST', {}));
        expect(msg).toContain('网络连接失败');
        expect(msg).not.toContain('localhost');
    });
});

describe('本地预览环境保留原有可操作提示（防回归）', () => {
    test('localhost 下非 JSON 响应仍提示「打开 http://localhost:3000」', async () => {
        const sb = loadInBrowser('localhost');
        sb.fetch = jest.fn().mockResolvedValue(htmlResponse(404));
        const msg = await errorMessage(sb.apiRequest('/auth/login', 'POST', {}));
        expect(msg).toContain('服务器返回了非预期内容');
        expect(msg).toContain('http://localhost:3000');
    });

    test('localhost 下网络失败仍提示启动后端 + 打开 :3000', async () => {
        const sb = loadInBrowser('localhost');
        sb.fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));
        const msg = await errorMessage(sb.apiRequest('/auth/login', 'POST', {}));
        expect(msg).toContain('无法连接服务器');
        expect(msg).toContain('http://localhost:3000');
    });
});
