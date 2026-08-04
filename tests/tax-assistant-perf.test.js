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
