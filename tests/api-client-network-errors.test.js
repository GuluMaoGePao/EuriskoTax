// 前端网络层错误必须说人话（本地预览最容易踩的一类）
//
// 场景：后端没起（或页面不是从 http://localhost:3000 打开的）时，浏览器 fetch 直接 reject，
//   抛的是英文 TypeError（Chrome "Failed to fetch" / Firefox "NetworkError when attempting to
//   fetch resource."）；若请求打到了返回 HTML 的其它静态服务，response.json() 又抛
//   "Unexpected token '<'..."。这两种英文报错过去都原样弹给用户 —— 看不懂，也看不出该干什么。
//
// 这里钉住三件事：
//   ① 网络失败 / 非 JSON 响应 → 中文且给出「启动后端 + 打开 :3000」的可操作提示；
//   ② 后端业务错误照旧查表翻译（401 → 邮箱或密码错误），并带 statusCode；
//   ③ 提示里必须带上 localhost:3000 —— 少这一句，用户还是不知道去哪儿。
const fs = require('fs');
const path = require('path');
const { loadSource } = require('./helpers/load-source');

const CONNECTION_HINT = 'http://localhost:3000';

beforeAll(() => {
    // api-client 在加载时读 window.location 决定 API 地址（同源 / 本地 3000）
    global.window = { location: { hostname: 'localhost', protocol: 'http:', host: 'localhost:3000' } };
    const store = {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {}
    };
    global.sessionStorage = store;
    global.localStorage = store;
    // 该文件末尾有 `export default apiClient;`（浏览器 ESM 用），而 loadSource 走 eval ——
    // eval 不支持 export 语法，故先摘掉再注入；只影响测试加载方式，不改源码行为。
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'js', 'api', 'api-client.js'), 'utf8')
        .replace(/^export\s+default\s+\w+;?\s*$/m, '');
    (0, eval)(src);
});

afterEach(() => {
    delete global.fetch;
});

function jsonResponse(payload, status = 200) {
    return Promise.resolve({
        status,
        json: () => Promise.resolve(payload)
    });
}

describe('网络层失败 → 中文可操作提示', () => {
    test('fetch 直接失败（后端没起）时提示「无法连接服务器」并给出 :3000', async () => {
        global.fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));
        await expect(apiRequest('/auth/login', 'POST', { email: 'a@b.com', password: 'x' }))
            .rejects.toThrow('无法连接服务器');
        await expect(apiRequest('/auth/login', 'POST', {})).rejects.toThrow(CONNECTION_HINT);
    });

    test('响应不是 JSON（打到了返回 HTML 的其它静态服务）时也不说英文', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            status: 404,
            json: () => Promise.reject(new SyntaxError("Unexpected token '<' is not valid JSON"))
        });
        await expect(apiRequest('/auth/login', 'POST', {})).rejects.toThrow('服务器返回了非预期内容');
        await expect(apiRequest('/auth/login', 'POST', {})).rejects.toThrow(CONNECTION_HINT);
    });

    test('三种浏览器 / Node 的网络错误文案都在映射表里（换浏览器也不露英文）', async () => {
        const messages = ['Failed to fetch', 'NetworkError when attempting to fetch resource.', 'fetch failed'];
        for (const msg of messages) {
            global.fetch = jest.fn().mockRejectedValue(new TypeError(msg));
            // eslint-disable-next-line no-await-in-loop
            await expect(apiRequest('/auth/login', 'POST', {})).rejects.toThrow('无法连接服务器');
        }
    });
});

describe('后端业务错误照旧翻译并带状态码', () => {
    test('401 Invalid email or password → 邮箱或密码错误，且 statusCode 保留', async () => {
        global.fetch = jest.fn().mockResolvedValue(jsonResponse({
            success: false,
            error: { message: 'Invalid email or password', statusCode: 401 }
        }, 401));
        await expect(apiRequest('/auth/login', 'POST', {})).rejects.toThrow('邮箱或密码错误');
        try {
            await apiRequest('/auth/login', 'POST', {});
        } catch (err) {
            expect(err.statusCode).toBe(401);
        }
    });

    test('成功响应原样返回 data（改动不能影响正常链路）', async () => {
        global.fetch = jest.fn().mockResolvedValue(jsonResponse({ success: true, data: { token: 't' } }));
        await expect(apiRequest('/auth/login', 'POST', {})).resolves.toEqual({ token: 't' });
    });
});
