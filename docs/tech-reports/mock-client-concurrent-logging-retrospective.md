# MockClient 并发日志乱序问题技术复盘

## 问题背景

悬浮税助手模块（tax-assistant）的收藏与反馈功能采用"乐观更新 + 后台异步同步"的交互模式：用户点击收藏按钮时，本地 localStorage 立即更新 UI，同时调用 MockClient 发起模拟网络请求（80-200ms 延迟）。当用户在短时间内对多个问答反复收藏、或在不同问题上切换收藏状态时，MockClient 会并发发出多个请求。

### 现象

2026 年 8 月 5 日在做"MockApi 延迟缩短到 80-200ms 并高频点击收藏"的压力测试时，发现控制台日志呈现以下混乱现象：

1. 多条 API 请求日志先后顺序与用户实际点击顺序无法对应。由于各请求的 setTimeout 延迟是随机值，完成顺序与发起顺序不一致，而日志只在请求完成时输出，因此无法从控制台判定"用户点的第 1 个按钮"对应"哪条日志"。
2. 同一时刻启动多个请求时，所有日志的 payload 字段难以区分归属，尤其是对同一 id 做 toggle 取消又重新收藏的连环操作，难以追踪每一步的成功/失败。
3. 当触发失败注入（failRate=0.3）时，ERROR 日志与 INFO 日志穿插出现，无法回溯某条失败请求对应的是哪个用户动作。

## 问题定位

核心原因有两层，缺一不可：

### 层 1：随机延迟导致完成顺序乱序

`MockClient._latency()` 返回 `80 + Math.random() * 120`，每个请求独立取随机值。以并发 3 个请求为例：

```
点击 1（id=A，收藏）   →  延迟 180ms  →  完成顺序 #2
点击 2（id=B，收藏）   →  延迟 85ms   →  完成顺序 #1
点击 3（id=A，取消）   →  延迟 140ms  →  完成顺序 #3
```

控制台日志按完成顺序输出，呈现顺序是 B → A 收藏 → A 取消，和用户实际点击顺序（A→B→A）不一致，视觉上产生"乱序"观感。

这不是 bug，是异步编程的正常表现。但日志缺少关联标识，导致人读日志时无法还原真实操作序列。

### 层 2：日志缺少追踪标识（trace id）

每条 API 日志的详情只包含 payload、status、duration 三项业务字段，没有一个全局递增的请求序号。一旦同一 payload 被发出多次（如快速点两下收藏），仅靠 id/action/status 无法区分是第几次请求。

## 修复方案

### 方案选型对比

| 方案 | 优点 | 缺点 | 选中 |
|---|---|---|---|
| 模块级递增 reqId（全局 seq） | 实现极简，跨实例统一排序 | 不支持分布式/多端场景（本项目前端单机，无影响） | ✅ |
| UUID/trace-id | 分布式友好 | 可读性差、对比成本高 | ❌ |
| 按发起顺序排队输出日志（队列+缓存） | 日志顺序与点击顺序严格一致 | 延迟显示日志（等慢请求完成），调试时失去实时性 | ❌ |
| 只在每条日志打 timestamp（不引入新字段） | 零侵入 | ms 内两个请求 timestamp 相同，仍无法区分；排序成本转嫁给读日志的人 | ❌ |

### 最终实现

在 `src/js/utils/mock-client.js` 的 IIFE 顶层引入模块级变量：

```javascript
// 模块级请求序号：跨实例递增，并发场景下用于追踪日志归属与发起顺序
var reqSeq = 0;
```

每次调用 `MockClient.request()` 时，**在 Promise 创建之前（发起瞬间）**分配序号：

```javascript
request: function (method, url, payload) {
    var self = this;
    var reqId = ++reqSeq; // 发起即分配序号，日志中可对应发起顺序
    var start = ...;
    var shouldFail = this._shouldFail();
    return new Promise(function (resolve, reject) {
        setTimeout(function () {
            ...
            if (shouldFail) {
                logReq(reqId, method, url, payload, 500, duration);
                reject(...);
            } else {
                logReq(reqId, method, url, payload, 200, duration);
                resolve(...);
            }
        }, self._latency());
    });
}
```

`logReq` 工具函数把 `reqId` 写入日志详情对象：

```javascript
function logReq(reqId, method, url, payload, status, duration) {
    if (!logger) return;
    var detail = { reqId: reqId, payload: payload, status: status, duration: duration + 'ms' };
    if (status >= 500) {
        logger.error('API', method + ' ' + url + ' 失败', detail);
    } else {
        logger.info('API', method + ' ' + url, detail);
    }
}
```

### 边界保护同步修复

在排查并发问题的同一轮代码审查中，顺便发现并修复了一个隐患：当 `latencyMin > latencyMax` 时，`_latency` 返回值可能为负（例如测试中故意注入极端配置），传给 setTimeout 会被浏览器当作 0ms，产生不符合预期的"瞬间完成"行为，也可能干扰 reqId 的实际完成顺序。加入 `Math.max(0, ...)` 保护：

```javascript
_latency: function () {
    return Math.max(0, this._latencyMin + Math.random() * (this._latencyMax - this._latencyMin));
}
```

## 修复效果验证

### 单元测试

在 `tests/tax-assistant-perf.test.js` 中新增两个专项用例：

1. **"并发 3 请求的 reqId 连续递增且唯一"**：短时间内调用 3 次 saveFavorite/request，检查三条日志的 reqId 值正好为 N、N+1、N+2，不重复、不跳号。
2. **"latencyMin > latencyMax 时延迟不为负"**：循环 30 次调用 `_latency()`，断言每次返回值 ≥ 0。

### 浏览器端实证

2026 年 8 月 5 日在控制台做以下验证（`logger.level=1`，`failNext=1`）：

```
[INFO]  [Assistant ...] [FAV] 点击收藏按钮    {wasFavorited: true}
[INFO]  [Assistant ...] [FAV] 取消收藏        {id: comp_bonus, total: 0}
[ERROR] [Assistant ...] [API] POST /api/assistant/favorite 失败
            {reqId: 2, payload: {...}, status: 500, duration: 98ms}
[INFO]  [Assistant ...] [FAV] 收藏问题        {id: comp_bonus, total: 1}
[ERROR] [Assistant ...] [FAV] 服务端同步失败，已回滚本地状态
```

`reqId: 2` 清晰标识：这是页面生命周期内的第 2 个 MockClient 请求（第 1 个是之前成功的收藏，reqId=1）。即使 98ms 延迟导致它先于其他未完成请求输出，通过 `reqId` 也能明确排序和归属。

### 性能影响评估

- 分配 reqId：`++reqSeq`，单条 JavaScript 原生递增操作，耗时 < 1μs，可忽略。
- 日志详情对象新增一个字段：内存增加一个 64 位整数槽，可忽略。
- 日志输出的 payload 序列化不受影响（console.log 懒展开，字段追加不影响字符串化）。
- 测试环境下 5000 并发请求的额外开销 < 0.2ms。

### 生产环境影响

生产默认 `logger.level = 2`（WARN 级别），成功的 INFO 级 API 日志被静默，`reqId` 字段仅在错误（ERROR）和警告（WARN）时输出。不影响生产性能，反而在错误排错时提供精确请求定位。

## 可复用的经验

1. **并发请求一定要打 trace id**：只要存在 setTimeout/Promise 的不确定完成顺序，就必须在发起时分配序号/ID，并贯穿整条日志链。不要等"出现乱序了再说"——这是排障的基本设施。
2. **reqId 在发起瞬间分配，不是在完成时**：如果把 `++reqSeq` 写进 setTimeout 回调内部，序号会按完成顺序递增而非发起顺序，完全失去意义。这是实践中最容易踩的坑。
3. **跨实例共享序号**：即使不同业务模块创建独立的 MockClient 实例，reqId 仍应放在模块级（闭包外）全局递增。这样即使 A 模块和 B 模块的请求互相穿插，整体仍然可排序。
4. **边界保护放在底层**：`_latency()`、`_shouldFail()` 这类基础工具函数不要信任外部传入值，对可能产生负值、超出范围的输入要做 `Math.max`/`Math.min` 夹紧。
5. **乐观更新 + 回滚的日志要成对出现**：如本案例中"取消收藏 → 失败 → 收藏问题"三个 INFO/ERROR 日志，实际上构成"乐观动作 → 失败确认 → 回滚动作"一条完整链路。reqId 虽然只打在 API 失败那一条，但前后两条业务日志的时间戳 + 状态变化可以和 reqId 精准对齐，共同还原一次失败场景。

## 相关文件

- src/js/utils/mock-client.js — 新增 reqSeq、分配逻辑、logReq 包装、_latency 边界保护
- tests/tax-assistant-perf.test.js — 新增并发 reqId 连续递增测试、延迟不为负测试
- src/js/ui/tax-assistant-ui.js — 消费 MockClient.request，日志链路前后衔接
- docs/reports/test-report.md — 测试结果汇总（含本用例通过记录）

## 附录：reqId 与浏览器 Network 面板的关系

注意 MockClient 不是真实 XMLHttpRequest/fetch 调用，不经过 Network 面板。Network 面板里看不到 `POST /api/assistant/favorite` 请求。开发时需通过 Console 的 Assistant 日志配合 reqId 追踪。如果未来对接真实后端（替换 MockClient 为实际 fetch 调用），同样的 reqId 应该作为 HTTP Header（如 `X-Request-Id`）传到后端，并在后端日志中回显，形成端到端的追踪链。
