/**
 * === 通用 Mock 工具：Logger + MockClient ===
 *
 * 提供可复用的日志器与模拟网络请求客户端，供各模块共享，避免重复实现。
 *
 * 用法示例：
 *   var logger = Logger.create({ tag: 'MyModule', level: 2 });
 *   var mockApi = MockClient.create({ logger: logger, tag: 'API' });
 *   mockApi.saveFavorite = function (id, action) {
 *       return this.request('POST', '/api/fav', { id: id, action: action })
 *           .then(function () { return { id: id, action: action }; });
 *   };
 *
 * 失败注入（测试用）：
 *   mockApi.failNext = 1;     // 强制下一次请求失败
 *   mockApi.failRate = 0.3;   // 30% 随机失败率
 *
 * 并发追踪（reqId）：
 *   每次调用 request() 会分配一个模块级递增的 reqId，并写入日志详情。
 *   由于各请求延迟随机，完成顺序可能与发起顺序不同；
 *   通过日志中的 reqId 可在并发场景下回溯单次请求的发起顺序与归属。
 *   reqId 跨实例全局递增，不同模块的并发请求也能统一排序追踪。
 *
 * 加载顺序：本文件需在依赖它的业务模块之前加载（见 index.html）。
 */

(function () {
    'use strict';

    // 模块级请求序号：跨实例递增，并发场景下用于追踪日志归属与发起顺序
    var reqSeq = 0;

    // ====== 离线状态检测 ======
    // PWA 离线化：计税引擎在前端本地运行，离线时完全可用；
    // MockClient 用于模拟收藏/反馈等"云端同步"操作，离线时直接本地成功（无网络延迟）
    function isOnline() {
        try {
            return typeof navigator !== 'undefined' && navigator.onLine !== false;
        } catch (e) {
            return true; // 非浏览器环境默认在线
        }
    }

    // 暴露全局离线状态工具
    window.EuriskoTaxNet = {
        isOnline: isOnline,
        // 监听在线/离线事件，回调接收 (isOnline)
        onStatusChange: function (cb) {
            if (typeof window === 'undefined') return function () {};
            var online = function () { cb(true); };
            var offline = function () { cb(false); };
            window.addEventListener('online', online);
            window.addEventListener('offline', offline);
            return function () {
                window.removeEventListener('online', online);
                window.removeEventListener('offline', offline);
            };
        }
    };

    // ====== Logger 工厂：可配置 tag 和 level 的轻量日志器 ======
    // level: 0=DEBUG, 1=INFO, 2=WARN(默认/生产), 3=ERROR
    // 生产默认 level=2 静默 INFO，仅保留 WARN/ERROR，消除高频日志开销
    // 调试时可动态修改实例 .level（如 window.TaxAssistant.logger.level = 1）
    function createLogger(opts) {
        opts = opts || {};
        var tag = opts.tag || 'App';
        var level = (opts.level != null) ? opts.level : 2;
        var enabled = (opts.enabled != null) ? opts.enabled : true;
        var levelRank = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };

        function ts() {
            try {
                return new Date().toISOString().split('T')[1].split('.')[0];
            } catch (e) { return '??:??:??'; }
        }

        return {
            enabled: enabled,
            level: level,
            _levelRank: levelRank,
            _ts: ts,
            _emit: function (lv, color, branch, message, details) {
                if (!this.enabled) return;
                // 级别过滤：当前级别数值高于设定值才输出
                if ((this._levelRank[lv] || 0) < this.level) return;
                var tagStr = '[' + tag + ' ' + this._ts() + ' ' + lv + ']';
                var head = '%c' + tagStr + ' [' + branch + '] ' + message;
                try {
                    if (lv === 'ERROR') {
                        console.error(tagStr + ' [' + branch + '] ' + message, details !== undefined ? details : '');
                    } else if (lv === 'WARN') {
                        console.warn(tagStr + ' [' + branch + '] ' + message, details !== undefined ? details : '');
                    } else {
                        console.log(head, 'color: ' + color + '; font-weight: bold;', details !== undefined ? details : '');
                    }
                } catch (e) { /* console 不可用时静默 */ }
            },
            debug: function (branch, message, details) { this._emit('DEBUG', '#6b7280', branch, message, details); },
            info: function (branch, message, details) { this._emit('INFO', '#0891b2', branch, message, details); },
            warn: function (branch, message, details) { this._emit('WARN', '#d97706', branch, message, details); },
            error: function (branch, message, details) { this._emit('ERROR', '#dc2626', branch, message, details); }
        };
    }

    // ====== MockClient 工厂：通用模拟网络请求客户端 ======
    // 配置项（opts）：
    //   latencyMin/latencyMax  延迟范围（默认 80-200ms，模拟真实快速网络）
    //   logger                 日志器实例（可选，自动记录请求日志）
    //   tag                    日志标签（默认 'API'）
    // 实例属性：
    //   failRate   随机失败率 0-1（0=永不失败）
    //   failNext   强制下 N 次请求失败（测试用，每次请求自减）
    // 实例方法：
    //   request(method, url, payload) → Promise
    //     resolve: { success: true }
    //     reject : { status: 500, message: '服务器内部错误' }
    //   业务方法（如 saveFavorite）可在实例上自行扩展，内部调用 this.request。
    function createMockClient(opts) {
        opts = opts || {};
        var logger = opts.logger || null;
        var tag = opts.tag || 'API';
        var latencyMin = (opts.latencyMin != null) ? opts.latencyMin : 80;
        var latencyMax = (opts.latencyMax != null) ? opts.latencyMax : 200;

        function logReq(reqId, method, url, payload, status, duration) {
            if (!logger) return;
            // reqId 便于并发场景下追踪单次请求的日志归属与发起顺序
            var detail = { reqId: reqId, payload: payload, status: status, duration: duration + 'ms' };
            if (status >= 500) {
                if (logger.error) logger.error(tag, method + ' ' + url + ' 失败', detail);
            } else {
                if (logger.info) logger.info(tag, method + ' ' + url, detail);
            }
        }

        return {
            failRate: 0,
            failNext: 0,
            _latencyMin: latencyMin,
            _latencyMax: latencyMax,
            _latency: function () {
                // 边界保护：latencyMin > latencyMax 时避免负延迟
                return Math.max(0, this._latencyMin + Math.random() * (this._latencyMax - this._latencyMin));
            },
            _shouldFail: function () {
                if (this.failNext > 0) { this.failNext--; return true; }
                return Math.random() < this.failRate;
            },
            request: function (method, url, payload) {
                var self = this;
                var reqId = ++reqSeq; // 发起即分配序号，日志中可对应发起顺序
                var start = (typeof performance !== 'undefined') ? performance.now() : Date.now();
                // 离线模式：计税等核心功能本地可用，收藏/反馈等"同步"操作直接本地成功
                // 不引入网络延迟，也不触发失败注入（离线时不应模拟服务端错误）
                if (!isOnline()) {
                    if (logger && logger.info) logger.info(tag, method + ' ' + url + ' [OFFLINE 本地成功]', { reqId: reqId, payload: payload });
                    return Promise.resolve({ success: true, offline: true });
                }
                var shouldFail = this._shouldFail();
                return new Promise(function (resolve, reject) {
                    setTimeout(function () {
                        var now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
                        var duration = Math.round(now - start);
                        if (shouldFail) {
                            logReq(reqId, method, url, payload, 500, duration);
                            reject({ status: 500, message: '服务器内部错误' });
                        } else {
                            logReq(reqId, method, url, payload, 200, duration);
                            resolve({ success: true });
                        }
                    }, self._latency());
                });
            }
        };
    }

    // 暴露到全局
    window.Logger = { create: createLogger };
    window.MockClient = { create: createMockClient };
})();
