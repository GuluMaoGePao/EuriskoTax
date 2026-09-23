/**
 * 线索质量分层信号（阶段19-7b②，v1.102.0）
 *
 * 这个信号是「白捡」的：用户选完整视图、或在简明视图下主动翻出「更多参数（可选）」去调，
 * 等于自己交代了需求深度 —— 不用多问一句、不用多采一项个人信息。
 *
 * 要钉住的是**信号不被稀释**：
 *   ① 只有简明视图下的展开才算（完整视图下折叠块本来就是展开的，点一下不代表在找参数）；
 *   ② 只有「更多参数」这个块才算（推导链那些 details 不算，否则数字会被冲淡）；
 *   ③ 合上不算、重复展开累加、同一测算只归因一次；
 *   ④ 拿不到信号返回 null —— 没有信号就说没有，不猜一个「简明」出来充数。
 *
 * 另外钉住前后端字段名：这条链路跨 4 个文件（渲染层 → 情境层 → 弹窗 payload → 后端列），
 * 任何一处改名都会**静默丢信号**（不报错，只是顾问再也看不到），所以用源码对拍兜住。
 *
 * @jest-environment jsdom
 */
const fs = require('fs');
const path = require('path');
const { loadSource } = require('./helpers/load-source');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

beforeAll(() => {
    loadSource('src/js/calculation/tax-constants.js');
    loadSource('src/js/calculation/tax-calculator.js');
    loadSource('src/js/calculation/utils.js');
    loadSource('src/js/calculation/tax-registry.js');
    loadSource('src/js/calculation/vat-quick.js');
    loadSource('src/js/calculation/business-income-quick.js');
    loadSource('src/js/calculation/bonus-tax-quick.js');
    loadSource('src/js/calculation/annual-settlement-quick.js');
    loadSource('src/js/calculation/social-insurance-quick.js');
    // 视图偏好必须排在 toolbox-ui / deep-wizard-ui 之前（index.html 里的顺序也是这样）
    loadSource('src/js/ui/mode-pref.js');
    loadSource('src/js/data/tool-registry.js');
    loadSource('src/js/ui/toolbox-ui.js');
    loadSource('src/js/lead/lead-context.js');
});

const P = () => window.EuriskoModePref;

// 造一个真实的「更多参数」折叠块：走渲染器的同一份 HTML，
// 于是 data-tool-id 与监听认的 class 都是真的（不是测试里另写一份糊弄自己）
function block(toolId) {
    const html = window.EuriskoToolbox.advancedBlockHtml(
        [{ key: 'extra', label: '补充参数', type: 'number', default: 1 }], {}, null, toolId
    );
    document.body.innerHTML = '<div id="host">' + html + '</div>';
    return document.getElementById('host').querySelector('details');
}

// toggle 事件不冒泡（所以渲染层只能在捕获阶段收）：这里手动派发同一个事件，
// 不依赖 jsdom 会不会自己因为 open 变化而派发 —— 那属于 jsdom 的实现细节。
function toggleIt(node, isOpen) {
    node.open = !!isOpen;
    node.dispatchEvent(new Event('toggle'));
}

beforeEach(() => {
    localStorage.clear();
    window.showPage = jest.fn();
    document.body.innerHTML = '';
});

describe('19-7b② 进阶参数探索记录', () => {
    test('简明视图下主动展开 → 计数，并记下是哪个测算', () => {
        P().set(P().SIMPLE);
        toggleIt(block('annual-settlement-deep'), true);
        const t = P().advancedTouched();
        expect(t.count).toBe(1);
        expect(t.tools).toEqual(['annual-settlement-deep']);
    });

    test('完整视图下展开不计数：它本来就是展开的，点一下不代表在找参数', () => {
        P().set(P().FULL);
        toggleIt(block('annual-settlement-deep'), true);
        expect(P().advancedTouched().count).toBe(0);
    });

    test('合上不计数（只有「找参数」才是信号）', () => {
        P().set(P().SIMPLE);
        const d = block('vat-deep');
        toggleIt(d, false);
        expect(P().advancedTouched().count).toBe(0);
    });

    test('反复展开累加次数，同一测算只归因一次（分层看的是深度，不是点击量）', () => {
        P().set(P().SIMPLE);
        const d = block('vat-deep');
        toggleIt(d, true);
        toggleIt(d, false);
        toggleIt(d, true);
        const t = P().advancedTouched();
        expect(t.count).toBe(2);
        expect(t.tools).toEqual(['vat-deep']);
    });

    test('别的折叠块（推导链等）不算：算进去只会把信号冲淡', () => {
        P().set(P().SIMPLE);
        document.body.innerHTML = '<details class="tool-formula-panel"><summary>查看计算过程</summary></details>';
        toggleIt(document.querySelector('details'), true);
        expect(P().advancedTouched().count).toBe(0);
    });

    test('折叠块带 data-tool-id：否则只知道「有人调过参数」，不知道调的是哪个税', () => {
        const d = block('bonus-tax-deep');
        expect(d.getAttribute('data-tool-id')).toBe('bonus-tax-deep');
    });

    test('reset 清空记录（用例之间不串味，重装的会话从 0 开始）', () => {
        P().set(P().SIMPLE);
        toggleIt(block('vat-deep'), true);
        expect(P().advancedTouched().count).toBe(1);
        P().reset();
        expect(P().advancedTouched()).toMatchObject({ count: 0, tools: [] });
    });
});

describe('19-7b② 留资情境里的信号汇总', () => {
    test('完整视图 → mode=full（ICP 信号本身就成立，与调没调过参数无关）', () => {
        P().set(P().FULL);
        expect(window.LeadContext.viewSignals()).toEqual({ mode: 'full', advancedTouched: 0 });
    });

    test('简明视图 + 调过 2 次 → mode=simple / advancedTouched=2', () => {
        P().set(P().SIMPLE);
        const d = block('social-base-deep');
        toggleIt(d, true);
        toggleIt(d, true);
        expect(window.LeadContext.viewSignals()).toEqual({ mode: 'simple', advancedTouched: 2 });
    });

    test('偏好模块不在时返回 null：没信号就说没信号，不猜一个「简明」出来充数', () => {
        const saved = window.EuriskoModePref;
        delete window.EuriskoModePref;
        expect(window.LeadContext.viewSignals()).toBeNull();
        window.EuriskoModePref = saved;
    });

    test('信号不并进 current() 的情境文本（那是给用户看的，不能变成当着面给他打分）', () => {
        P().set(P().FULL);
        P().noteAdvancedOpen('x');
        const text = window.LeadContext.current('forward');
        expect(text.indexOf('完整')).toBe(-1);
        expect(text.indexOf('进阶')).toBe(-1);
    });
});

describe('19-7b② 跨文件字段名：静默断链的兜底', () => {
    // 这条链路跨 4 个文件，任一侧改名都不会报错，只是顾问从此看不到信号 ——
    // 属于「静默失效」里最难发现的那一类，只能用源码对拍兜住。
    test('弹窗 payload 的字段名 = 后端读取的字段名', () => {
        const modal = read('src/js/lead/lead-modal.js');
        const ctrl = read('server/src/controllers/leadController.js');
        expect(modal).toMatch(/\bviewMode\b\s*:/);
        expect(modal).toMatch(/\badvancedTouched\b\s*:/);
        expect(ctrl).toMatch(/src\.viewMode/);
        expect(ctrl).toMatch(/src\.advancedTouched/);
    });

    test('后端落库的列名 = schema 里声明的列', () => {
        const ctrl = read('server/src/controllers/leadController.js');
        const schema = read('server/prisma/schema.prisma');
        const devSchema = read('server/prisma/schema.dev.prisma');
        expect(ctrl).toMatch(/view_mode:/);
        expect(ctrl).toMatch(/advanced_touched:/);
        [schema, devSchema].forEach((s) => {
            expect(s).toMatch(/view_mode\s+String/);
            expect(s).toMatch(/advanced_touched\s+Int/);
        });
    });

    test('CSV 导出的表头与数据同序（列错位会让顾问把「视图」读成「需求」）', () => {
        const src = read('server/src/controllers/leadAdminController.js');
        const headIdx = src.indexOf("'视图'");
        const headIdx2 = src.indexOf("'调过进阶参数'");
        const rowIdx = src.indexOf('it.view_mode');
        const rowIdx2 = src.indexOf('it.advanced_touched');
        expect(headIdx).toBeGreaterThan(0);
        expect(rowIdx).toBeGreaterThan(0);
        // 表头里「视图」在「调过进阶参数」之前，数据行里也必须同序
        expect(headIdx < headIdx2).toBe(rowIdx < rowIdx2);
    });
});
