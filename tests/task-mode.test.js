/**
 * 阶段14：任务页（多步计税）固定层预算
 *
 * 这一组的价值不在单元测试覆盖本身，而在于把「目测 22%」换成**可复算的数字**：
 *   改前 360×640 实测 = 全局顶栏 56 + 紧凑顶栏 73 + 预览条 48 = **177px / 27.7%**
 *   改后（本合并）     = 0 + 45 + 48                        = **93px / 14.5%**（预算线 ≤115px）
 * 数据取自本机 Chrome 无头浏览器的 getBoundingClientRect，不是估算（见 CHANGELOG）。
 *
 * 断言重点有三条，都对应「改坏之后不会报错、只会悄悄退化」的地方：
 *   1. sync 必须在**初始导航分支之前** —— showPage 的分支A 会直接 return，
 *      放在常规分支里会导致深链直达 / 首次进入完全不生效；
 *   2. 折叠规则必须**只存在于 ≤640px 媒体查询内** —— 漏出一条就变成桌面端变形；
 *   3. 任务页判据看结构不看 id 白名单 —— 新增向导页要自动继承。
 */
const fs = require('fs');
const path = require('path');
const { loadSource } = require('./helpers/load-source');

const AUTH_UI = fs.readFileSync(path.join(__dirname, '..', 'src', 'js', 'auth', 'auth-ui.js'), 'utf8');
const CSS = fs.readFileSync(path.join(__dirname, '..', 'src', 'css', 'tailwind.src.css'), 'utf8');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

const FIXTURE = `
<div id="classification-calculation-page" class="page hidden has-preview-bar">
    <div class="calc-sticky-header">
        <div class="max-w-5xl mx-auto">
            <div class="calc-top-row"><span class="calc-page-title">分类所得计税</span></div>
            <div class="step-indicator"><span class="step-title active">基本参数</span></div>
        </div>
    </div>
    <div class="calc-preview-bar"><span class="calc-preview-value">¥0</span></div>
</div>
<div id="mode-selection-page" class="page hidden"><h2>选择计税模式</h2></div>
<div id="tools-page" class="page hidden"><h2>工具箱</h2></div>`;

/** 取出从 fromIdx 处开始的第一个 @media 块的完整文本（大括号配对） */
function mediaBlock(src, fromIdx) {
    const braceStart = src.indexOf('{', fromIdx);
    if (braceStart < 0) return '';
    let depth = 0;
    for (let i = braceStart; i < src.length; i++) {
        if (src[i] === '{') depth += 1;
        else if (src[i] === '}') {
            depth -= 1;
            if (depth === 0) return { text: src.slice(fromIdx, i + 1), start: fromIdx, end: i + 1 };
        }
    }
    return { text: src.slice(fromIdx), start: fromIdx, end: src.length };
}

describe('TaskMode：任务页判定与 body 类', () => {
    beforeAll(() => {
        loadSource('src/js/ui/task-mode.js');
    });

    beforeEach(() => {
        document.body.className = '';
        document.body.innerHTML = FIXTURE;
    });

    test('多步计税页算任务页，普通页不算', () => {
        expect(window.TaskMode.isTaskPage('classification-calculation-page')).toBe(true);
        expect(window.TaskMode.isTaskPage('mode-selection-page')).toBe(false);
        expect(window.TaskMode.isTaskPage('tools-page')).toBe(false);
    });

    test('判据是页面结构而不是写死的 id 列表：新增向导式页面自动继承', () => {
        const future = document.createElement('div');
        future.id = 'some-future-wizard-page';
        future.innerHTML = '<div class="calc-sticky-header"></div>';
        document.body.appendChild(future);

        expect(window.TaskMode.isTaskPage('some-future-wizard-page')).toBe(true);
        future.remove();
    });

    test('缺 pageId / 页面不存在：一律按非任务页处理（宁可少折叠，不要错折叠）', () => {
        expect(window.TaskMode.isTaskPage('')).toBe(false);
        expect(window.TaskMode.isTaskPage(null)).toBe(false);
        expect(window.TaskMode.isTaskPage('no-such-page')).toBe(false);
        expect(window.TaskMode.sync('no-such-page')).toBe(false);
        expect(document.body.classList.contains('task-mode')).toBe(false);
    });

    test('sync：进入任务页加上类，离开任务页必须摘干净（否则全站顶栏消失）', () => {
        expect(window.TaskMode.sync('classification-calculation-page')).toBe(true);
        expect(document.body.classList.contains('task-mode')).toBe(true);

        expect(window.TaskMode.sync('mode-selection-page')).toBe(false);
        expect(document.body.classList.contains('task-mode')).toBe(false);
    });

    test('sync 幂等：重复同步同一个页面不累积状态', () => {
        window.TaskMode.sync('classification-calculation-page');
        window.TaskMode.sync('classification-calculation-page');
        expect(document.body.classList.toString()).toBe('task-mode');
    });
});

describe('TaskMode：跨文件契约（改坏不会报错，只会悄悄失效）', () => {
    test('index.html 引入了 task-mode.js', () => {
        expect(HTML).toContain('src/js/ui/task-mode.js');
    });

    test('showPage 在**初始导航分支之前**调用 sync —— 分支A 会直接 return，放错位置就整个不生效', () => {
        const syncIdx = AUTH_UI.indexOf('TaskMode.sync');
        const initialNavIdx = AUTH_UI.indexOf('分支A：初始导航');
        expect(syncIdx).toBeGreaterThan(-1);
        expect(initialNavIdx).toBeGreaterThan(-1);
        expect(syncIdx).toBeLessThan(initialNavIdx);
    });

    test('折叠规则只在 ≤640px 媒体查询内 —— 漏出一条就会让桌面端变形', () => {
        const mark = '阶段14：任务页固定层预算';
        expect(CSS).toContain(mark);
        const idx = CSS.indexOf('@media (max-width: 640px)', CSS.indexOf(mark));
        expect(idx).toBeGreaterThan(-1);

        const block = mediaBlock(CSS, idx);
        expect(block.text).toContain('body.task-mode .compact-nav { display: none; }');
        expect(block.text).toContain('body.task-mode .calc-sticky-header { top: 0; }');
        expect(block.text).toContain('.calc-sticky-header > .max-w-5xl');

        const rest = CSS.slice(0, block.start) + CSS.slice(block.end);
        expect(rest).not.toContain('body.task-mode');
    });
});
