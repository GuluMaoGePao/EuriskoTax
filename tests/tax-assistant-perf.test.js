// 性能基准测试：评估 logger 高频输出开销与 log level 优化效果
// 运行：npx jest tests/tax-assistant-perf.test.js

const { loadSource } = require('./helpers/load-source');

beforeAll(() => {
    global.showAlert = jest.fn();
    global.showSaveSuccessMessage = jest.fn();
    global.showSaveErrorMessage = jest.fn();
    global.calculationHistory = [];
    // 先加载通用 Mock 工具，再加载依赖它的业务模块
    loadSource('src/js/utils/mock-client.js');
    loadSource('src/js/ui/tax-assistant-ui.js');
});

// 工具：测量函数执行 N 次的耗时（ms）
function bench(fn, iterations) {
    const start = process.hrtime.bigint();
    for (let i = 0; i < iterations; i++) fn(i);
    const end = process.hrtime.bigint();
    return Number(end - start) / 1e6; // ns → ms
}

describe('logger 性能基准', () => {
    const N = 5000;

    test('INFO 开启（level=1）：5000 次调用应在 500ms 内', () => {
        // 取 TaxAssistant 内部 logger 不便，直接通过 console 计数间接验证
        // 此处验证 level 机制本身的开销
        const logger = { enabled: true, level: 1, _levelRank: { INFO: 1, WARN: 2, ERROR: 3 } };
        const emit = (lv) => {
            if (!logger.enabled) return;
            if ((logger._levelRank[lv] || 0) < logger.level) return;
        };
        const ms = bench(() => emit('INFO'), N);
        console.log('  [level=1 过滤开销] ' + N + ' 次 = ' + ms.toFixed(2) + 'ms');
        expect(ms).toBeLessThan(500);
    });

    test('INFO 静默（level=2）：应显著快于开启态', () => {
        const logger = { enabled: true, level: 1, _levelRank: { INFO: 1, WARN: 2, ERROR: 3 } };

        // level=1（INFO 输出，含 console.log）
        logger.level = 1;
        const msOn = bench(() => {
            if ((logger._levelRank['INFO'] || 0) < logger.level) return;
            console.log('test');
        }, N);

        // level=2（INFO 静默，提前 return）
        logger.level = 2;
        const msOff = bench(() => {
            if ((logger._levelRank['INFO'] || 0) < logger.level) return;
            console.log('test');
        }, N);

        console.log('  [console.log 开销] level=1: ' + msOn.toFixed(2) + 'ms | level=2: ' + msOff.toFixed(2) + 'ms');
        // 静默态应至少快 5 倍（无 console.log 序列化开销）
        expect(msOff).toBeLessThan(msOn / 5);
    });
});

describe('handleSuggest 高频调用基准', () => {
    test('连续 500 次联想生成应在 200ms 内', () => {
        document.body.innerHTML = `
            <div id="assistant-suggest" style="display:none;"></div>
            <div id="assistant-qa-list"></div>
        `;
        // 通过 API 触发搜索，间接调用 handleSuggest
        const keywords = ['年', '年终', '年终奖', '经营', '租金', '税', '扣', '汇算', 'a', 'xyz'];
        const ms = bench((i) => {
            window.TaxAssistant.search(keywords[i % keywords.length]);
        }, 500);
        console.log('  [handleSuggest ×500] = ' + ms.toFixed(2) + 'ms');
        expect(ms).toBeLessThan(200);
    });
});

describe('MockApi 请求耗时', () => {
    test('saveFavorite 应在 80-300ms 内 resolve（缩短后延迟）', async () => {
        // 使用真实 MockApi（已通过 window.TaxAssistant.mockApi 暴露）
        // 延迟 80-200ms，验证 Promise 正常 resolve
        const start = Date.now();
        await window.TaxAssistant.mockApi.saveFavorite('perf_test', 'add');
        const elapsed = Date.now() - start;
        expect(elapsed).toBeGreaterThanOrEqual(60);
        expect(elapsed).toBeLessThan(400);
    });
});

describe('logger level=2 静默模式', () => {
    test('level=2 应静默 INFO，仅保留 WARN/ERROR', () => {
        const logger = window.TaxAssistant.logger;
        const calls = { log: 0, warn: 0, error: 0 };
        const origLog = console.log, origWarn = console.warn, origErr = console.error;
        console.log = () => { calls.log++; };
        console.warn = () => { calls.warn++; };
        console.error = () => { calls.error++; };
        try {
            logger.level = 2;
            // 模拟高频点击产生的 INFO 日志
            for (let i = 0; i < 100; i++) {
                logger.info('FAV', '点击收藏按钮', { id: 'test', i: i });
            }
            // WARN / ERROR 应正常输出
            logger.warn('STORAGE', '读取失败', { error: 'test' });
            logger.error('FAV', '服务端同步失败', { id: 'test' });
            // INFO 被静默：console.log 不应被调用
            expect(calls.log).toBe(0);
            // WARN / ERROR 各 1 次
            expect(calls.warn).toBe(1);
            expect(calls.error).toBe(1);
        } finally {
            console.log = origLog;
            console.warn = origWarn;
            console.error = origErr;
        }
    });

    test('切换 level=1 后 INFO 应恢复输出', () => {
        const logger = window.TaxAssistant.logger;
        const calls = { log: 0 };
        const origLog = console.log;
        console.log = () => { calls.log++; };
        try {
            logger.level = 1;
            logger.info('FAV', '调试日志', {});
            expect(calls.log).toBe(1);
        } finally {
            console.log = origLog;
            logger.level = 2; // 恢复静默
        }
    });
});

describe('工具复用：其他模块可独立创建 MockClient 实例', () => {
    test('不同模块创建的实例相互隔离，各自配置延迟/失败', async () => {
        // 模拟"另一个模块"用通用工厂创建独立客户端
        const otherLogger = window.Logger.create({ tag: 'OtherModule', level: 1 });
        const otherClient = window.MockClient.create({
            logger: otherLogger,
            tag: 'OTHER',
            latencyMin: 30,
            latencyMax: 50
        });
        // 与 tax-assistant 的实例隔离
        expect(otherClient).not.toBe(window.TaxAssistant.mockApi);
        // 各自的 failNext 独立
        otherClient.failNext = 1;
        expect(window.TaxAssistant.mockApi.failNext).toBe(0);

        // 独立实例正常工作：强制失败 → reject
        const p = otherClient.request('POST', '/api/other', { x: 1 });
        await expect(p).rejects.toMatchObject({ status: 500, message: '服务器内部错误' });
        // 失败后 failNext 归零，下次成功
        const res = await otherClient.request('GET', '/api/other');
        expect(res).toEqual({ success: true });

        // tax-assistant 的实例不受影响，仍可正常调用
        const fav = await window.TaxAssistant.mockApi.saveFavorite('reuse_test', 'add');
        expect(fav).toMatchObject({ id: 'reuse_test', action: 'add' });
    });
});

describe('MockClient 并发请求日志顺序', () => {
    test('并发请求各自带递增 reqId，可据其回溯发起顺序', async () => {
        // 用捕获型 logger 收集日志，level=1 让 INFO 成功日志也输出
        const logs = [];
        const captLogger = {
            level: 1,
            info: (t, m, d) => logs.push({ tag: t, msg: m, detail: d }),
            warn: () => {},
            error: (t, m, d) => logs.push({ tag: t, msg: m, detail: d })
        };
        const client = window.MockClient.create({
            logger: captLogger,
            tag: 'CONCURRENCY',
            latencyMin: 30,
            latencyMax: 80
        });
        // 并发发起 3 个请求（延迟随机，完成顺序可能与发起顺序不同）
        await Promise.all([
            client.request('POST', '/api/a', { n: 1 }),
            client.request('POST', '/api/b', { n: 2 }),
            client.request('POST', '/api/c', { n: 3 })
        ]);
        // 3 条完成日志，每条带 reqId
        expect(logs.length).toBe(3);
        const ids = logs.map(l => l.detail.reqId);
        ids.forEach(id => expect(typeof id).toBe('number'));
        // reqId 全局唯一
        expect(new Set(ids).size).toBe(3);
        // 排序后连续递增：证明发起时按序分配，完成乱序也能回溯
        const sorted = [...ids].sort((a, b) => a - b);
        expect(sorted[1]).toBe(sorted[0] + 1);
        expect(sorted[2]).toBe(sorted[1] + 1);
    });

    test('latencyMin > latencyMax 时延迟不为负', () => {
        const client = window.MockClient.create({
            logger: null,
            latencyMin: 200,
            latencyMax: 50
        });
        for (let i = 0; i < 30; i++) {
            expect(client._latency()).toBeGreaterThanOrEqual(0);
        }
    });
});

describe('搜索联想模块：同步性 & 免受 MockClient 异步延迟影响', () => {
    beforeEach(() => {
        // 供联想匹配的问答数据（与主测试一致）
        window.TAX_ASSISTANT_QA = [
            { id: 'q1', category: '综合所得', keywords: ['年终奖', '奖金'], question: '年终奖如何计税？', answer: '单独或并入综合所得。' },
            { id: 'q2', category: '经营所得', keywords: ['个体户', '减半'], question: '经营所得减半征收怎么享受？', answer: '200万以下减半。' },
            { id: 'q3', category: '分类所得', keywords: ['租金', '租赁'], question: '房屋租金如何计税？', answer: '税率20%。' }
        ];
        // 还原一个干净的助手 DOM（与主测试一致）
        document.body.innerHTML = `
            <button id="tax-assistant-fab" class="assistant-fab" style="display:flex;"></button>
            <div id="tax-assistant-overlay" class="assistant-overlay"></div>
            <div id="tax-assistant-drawer" class="assistant-drawer assistant-drawer-closed">
                <div class="assistant-header">
                    <button id="assistant-close" class="assistant-close">×</button>
                    <input type="text" id="assistant-search" class="assistant-search" />
                    <button id="assistant-search-clear" style="display:none;"></button>
                </div>
                <div class="assistant-body">
                    <div id="assistant-shortcuts" class="assistant-shortcuts"></div>
                    <div id="assistant-hot" class="assistant-hot"></div>
                    <div id="assistant-categories" class="assistant-categories"></div>
                    <div id="assistant-qa-list" class="assistant-qa-list"></div>
                    <div id="assistant-suggest" class="assistant-suggest" style="display:none;"></div>
                </div>
            </div>
        `;
        localStorage.clear();
        // 重新加载源码以将事件监听绑定到新 DOM（与主测试文件一致）
        loadSource('src/js/ui/tax-assistant-ui.js');
        // 打开抽屉以初始化事件绑定
        document.getElementById('tax-assistant-fab').click();
    });

    test('input 事件后联想下拉同步渲染，无需等待任何异步延迟', () => {
        // 给 MockApi 注入一个未决的异步请求，证明联想不被其阻塞
        const pending = window.TaxAssistant.mockApi.saveFavorite('block_test', 'add');
        // 此时 MockApi 内部 setTimeout 尚未触发（80-200ms 后才 resolve）

        const search = document.getElementById('assistant-search');
        const suggest = document.getElementById('assistant-suggest');

        // 输入触发 handleSearch → handleSuggest（同步）
        search.value = '年终';
        search.dispatchEvent(new Event('input'));

        // 不等待任何定时器：联想应已同步渲染
        expect(suggest.style.display).toBe('block');
        const items = suggest.querySelectorAll('.assistant-suggest-item');
        expect(items.length).toBeGreaterThan(0);
        expect(items[0].textContent).toContain('年终');

        // 清理未决 Promise（避免泄漏到后续测试）
        pending.catch(() => {});
    });

    test('高频连续输入下每次联想结果立即正确（500 次 < 200ms）', () => {
        const search = document.getElementById('assistant-search');
        const suggest = document.getElementById('assistant-suggest');
        const keys = ['年', '年终', '年终奖', '经营', '租金', '税', '扣', '汇算', '租金', '经营'];

        const ms = bench((i) => {
            search.value = keys[i % keys.length];
            search.dispatchEvent(new Event('input'));
        }, 500);

        // 末次输入 '经营'（500 % 10 = 0 → '年'，补一次有匹配词验证）
        search.value = '经营';
        search.dispatchEvent(new Event('input'));
        expect(suggest.querySelectorAll('.assistant-suggest-item').length).toBeGreaterThan(0);
        console.log('  [联想高频输入 ×500] = ' + ms.toFixed(2) + 'ms');
        expect(ms).toBeLessThan(200);
    });

    test('联想结果不依赖 MockApi 的 setTimeout 延迟', () => {
        // 把 MockApi 延迟调到极大值，若联想依赖它则会被卡住
        const origMin = window.TaxAssistant.mockApi._latencyMin;
        const origMax = window.TaxAssistant.mockApi._latencyMax;
        window.TaxAssistant.mockApi._latencyMin = 5000;
        window.TaxAssistant.mockApi._latencyMax = 5000;

        try {
            const search = document.getElementById('assistant-search');
            const suggest = document.getElementById('assistant-suggest');

            search.value = '经营';
            search.dispatchEvent(new Event('input'));

            // 联想立即渲染，未被 5s 延迟阻塞
            expect(suggest.style.display).toBe('block');
            expect(suggest.querySelectorAll('.assistant-suggest-item').length).toBeGreaterThan(0);
        } finally {
            window.TaxAssistant.mockApi._latencyMin = origMin;
            window.TaxAssistant.mockApi._latencyMax = origMax;
        }
    });
});
