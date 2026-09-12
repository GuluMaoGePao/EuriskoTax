/**
 * 阶段13D：DOM 截图公共层（html2canvas 薄封装）
 *
 * 为什么值得抽这一层（而不是各处各写一份）：
 *   1) 「HTML 字符串 → 离屏临时容器 → html2canvas → canvas」这个流程，
 *      PDF 导出（navigation-ui.exportToPDF）与分享图（share-card）完全一致；
 *   2) 配置漂移的代价很隐蔽：宽度 / scale / CORS 参数在一处改了、另一处没改，
 *      就会产生「PDF 清晰但分享图糊」这类极难排查的问题，收敛到一处即可根治；
 *   3) 临时容器的清理必须万无一失 —— 漏清理会在页面上留下一个 800px 宽的隐形 div，
 *      直接撑出横向滚动条。所以成功与失败两条路径的清理都写在这里。
 *
 * 对外接口：window.Capture
 *   captureHtml(html, opts) → Promise<HTMLCanvasElement>
 *     opts.width          临时容器宽度（默认 800）
 *     opts.scale          像素倍率（默认 2，越大越清晰也越慢）
 *     opts.delayMs        截图前等待时长（默认 0；长表格/图片场景需要更大值）
 *     opts.beforeCapture  (container) => void，截图前回调（如绘制图表），异常不阻断出图
 *     opts.logging        是否让 html2canvas 打日志（排查时才开）
 *   downloadCanvas(canvas, filename)  触发浏览器下载 PNG
 *   isReady()                          html2canvas 是否已加载（CDN 不可达时为 false）
 */
(function () {
    'use strict';

    var DEFAULT_WIDTH = 800;
    var DEFAULT_SCALE = 2;

    function isReady() {
        return typeof window.html2canvas === 'function';
    }

    function captureHtml(html, opts) {
        opts = opts || {};

        if (!isReady()) {
            // 明确 reject 而不是静默返回空白图：调用方需要知道「没截到」才能给出正确提示
            return Promise.reject(new Error('html2canvas 未加载（离线或 CDN 不可达）'));
        }

        var width = opts.width || DEFAULT_WIDTH;
        var scale = opts.scale || DEFAULT_SCALE;

        var container = document.createElement('div');
        // 用 fixed + 负坐标移出视口，而不是 display:none —— 后者会让 html2canvas
        // 量到 0 尺寸，截出来是一张空白图。
        container.style.position = 'fixed';
        container.style.left = '-9999px';
        container.style.top = '-9999px';
        container.style.width = width + 'px';
        container.style.height = 'auto';
        container.style.zIndex = '9999';
        container.innerHTML = html;
        document.body.appendChild(container);

        function cleanup() {
            if (container.parentNode) container.parentNode.removeChild(container);
        }

        return new Promise(function (resolve) {
            // 让出一轮事件循环：给图片、字体与脚本渲染留出布局时间
            setTimeout(resolve, opts.delayMs || 0);
        }).then(function () {
            if (typeof opts.beforeCapture === 'function') {
                try {
                    opts.beforeCapture(container);
                } catch (err) {
                    // 装饰性内容（图表等）失败不应阻断出图：宁可少个图，也要把报告交出去
                    console.error('[Capture] beforeCapture 执行失败，继续截图:', err);
                }
            }
            return window.html2canvas(container, {
                scale: scale,
                useCORS: true,
                logging: !!opts.logging,
                backgroundColor: opts.backgroundColor || '#ffffff',
                width: width,
                height: container.scrollHeight,
                windowWidth: width,
                windowHeight: container.scrollHeight + 100,
                allowTaint: true,
                removeContainer: true
            });
        }).then(function (canvas) {
            cleanup();
            return canvas;
        }, function (err) {
            cleanup(); // 失败路径同样必须清理
            throw err;
        });
    }

    function downloadCanvas(canvas, filename) {
        if (!canvas) return;
        var link = document.createElement('a');
        link.href = canvas.toDataURL('image/png');
        link.download = filename || ('download-' + Date.now() + '.png');
        // Firefox 要求节点在文档中才会真正触发下载
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    window.Capture = {
        captureHtml: captureHtml,
        downloadCanvas: downloadCanvas,
        isReady: isReady,
        DEFAULT_WIDTH: DEFAULT_WIDTH,
        DEFAULT_SCALE: DEFAULT_SCALE
    };
})();
