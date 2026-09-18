/**
 * Phase 1：多步流程草稿（断点续算）
 *
 * 断言的是三条一旦退化就**不会报错**、只会默默伤用户的约束：
 *   1. 过期数据不能回填 —— 让上个季度的工资数悄悄回到表单里，比没有草稿更糟；
 *   2. 默认值（大量 value="0"）不能误判成「用户填过」，否则恢复条永远赶不走；
 *   3. 收入属敏感个人信息 —— 草稿必须走独立命名空间（不进云同步）且不碰凭证字段。
 */
const fs = require('fs');
const path = require('path');
const { loadSource } = require('./helpers/load-source');

const SRC = path.join(__dirname, '..', 'src', 'js', 'data', 'draft-store.js');

const FIXTURE = `
<div id="flow-page" class="hidden">
    <div id="pane-1" class="step-pane active"><span>基本参数</span></div>
    <div id="pane-2" class="step-pane hidden"><span>收入明细</span></div>
    <select id="work-months"><option value="12">12</option><option value="6">6</option></select>
    <input type="number" id="salary" value="0">
    <input type="text" id="remark" value="">
    <input type="checkbox" id="use-insurance" checked>
    <input type="password" id="pwd">
    <input type="file" id="att">
</div>`;

let seq = 0;

describe('EuriskoDraft：草稿存取', () => {
    beforeAll(() => {
        loadSource('src/js/data/draft-store.js');
    });

    beforeEach(() => {
        localStorage.clear();
        document.body.innerHTML = FIXTURE;
        window.goToStep = jest.fn();
        seq += 1;
        // 每个用例用独立 flowId：registerFlow 对同一 id 只注册一次（幂等），这是刻意的
        window.EuriskoDraft.registerFlow({
            id: 'flow' + seq, containerId: 'flow-page',
            paneIds: ['pane-1', 'pane-2'], gotoName: 'goToStep'
        });
    });

    const draft = () => window.EuriskoDraft;

    test('填过就存、回来就恢复：值回到表单里', () => {
        document.getElementById('salary').value = '12000';
        expect(draft().save('flow' + seq)).toBe(true);

        document.getElementById('salary').value = '0';   // 模拟被打断、页面重置
        expect(draft().restore('flow' + seq)).toBeGreaterThan(0);
        expect(document.getElementById('salary').value).toBe('12000');
    });

    test('恢复时连当前步一起回到原来那一步', () => {
        document.getElementById('pane-2').classList.remove('hidden');
        document.getElementById('pane-1').classList.add('hidden');
        document.getElementById('salary').value = '8000';
        draft().save('flow' + seq);

        document.getElementById('pane-2').classList.add('hidden');
        document.getElementById('pane-1').classList.remove('hidden');
        draft().restore('flow' + seq);
        expect(window.goToStep).toHaveBeenCalledWith(2);
    });

    test('大量缺省 value="0"：什么都没改就什么都不会弹（也不会留下草稿）', () => {
        expect(draft().save('flow' + seq)).toBe(false);
        expect(localStorage.getItem('euriskoDraft:flow' + seq)).toBeNull();
    });

    test('改回默认值 = 当作没填过：草稿要随之抹掉（否则上个月的工资一直阴魂不散地弹回来）', () => {
        document.getElementById('salary').value = '9000';
        draft().save('flow' + seq);
        expect(draft().hasDraft('flow' + seq)).toBe(true);

        document.getElementById('salary').value = '0';
        draft().save('flow' + seq);
        expect(draft().hasDraft('flow' + seq)).toBe(false);
    });

    test('勾选框按布尔值往返，不会被当成字符串', () => {
        document.getElementById('use-insurance').checked = false;
        draft().save('flow' + seq);

        document.getElementById('use-insurance').checked = true;
        draft().restore('flow' + seq);
        expect(document.getElementById('use-insurance').checked).toBe(false);
    });

    test('凭证类字段一律不碰（密码 / 文件）', () => {
        document.getElementById('pwd').value = 'secret';
        document.getElementById('salary').value = '7000';
        draft().save('flow' + seq);

        const raw = JSON.parse(localStorage.getItem('euriskoDraft:flow' + seq));
        expect(raw.values.pwd).toBeUndefined();
        expect(raw.values.att).toBeUndefined();
        expect(raw.values.salary).toBe('7000');
    });

    test('恢复会派发 input / change：否则「劳务报酬折算」这类联动不会重算，界面上只是摆了个数', () => {
        document.getElementById('salary').value = '6500';
        draft().save('flow' + seq);

        const onChange = jest.fn();
        const onInput = jest.fn();
        const el = document.getElementById('salary');
        el.addEventListener('change', onChange);
        el.addEventListener('input', onInput);
        el.value = '0';

        draft().restore('flow' + seq);
        expect(onInput).toHaveBeenCalled();
        expect(onChange).toHaveBeenCalled();
        expect(el.value).toBe('6500');
    });

    test('restore 只认本流程内的元素：宁可少恢复一项，也不给同 id 的其它页面写串', () => {
        const stray = document.createElement('input');
        stray.id = 'salary';
        stray.value = '0';
        document.body.appendChild(stray);   // 同 id 却在本流程容器之外

        document.getElementById('salary').value = '5200';
        draft().save('flow' + seq);
        document.getElementById('salary').value = '0';
        draft().restore('flow' + seq);

        expect(document.getElementById('salary').value).toBe('5200');   // 容器内那个
        stray.remove();
    });

    test('切后台 / 离开页面会把待存立即落盘：最后几个字不该丢', () => {
        const el = document.getElementById('salary');
        el.value = '18800';
        el.dispatchEvent(new Event('input', { bubbles: true }));   // 只排了防抖，还没到 600ms
        expect(localStorage.getItem('euriskoDraft:flow' + seq)).toBeNull();

        draft().flushPending();
        const saved = JSON.parse(localStorage.getItem('euriskoDraft:flow' + seq));
        expect(saved.values.salary).toBe('18800');
    });

    test('clear / clearAll 真的清干净', () => {
        document.getElementById('salary').value = '3000';
        draft().save('flow' + seq);
        draft().clear('flow' + seq);
        expect(localStorage.getItem('euriskoDraft:flow' + seq)).toBeNull();
        expect(draft().hasDraft('flow' + seq)).toBe(false);
        expect(() => draft().clearAll()).not.toThrow();
    });

    test('隐私模式（localStorage 取不到）：不抛异常，填写本身照常可用', () => {
        const real = Object.getOwnPropertyDescriptor(window, 'localStorage');
        Object.defineProperty(window, 'localStorage', {
            configurable: true,
            get() { throw new Error('SecurityError'); }
        });
        try {
            document.getElementById('salary').value = '8800';
            expect(() => draft().save('flow' + seq)).not.toThrow();
            expect(draft().save('flow' + seq)).toBe(false);
            expect(draft().load('flow' + seq)).toBeNull();
            expect(() => draft().clear('flow' + seq)).not.toThrow();
        } finally {
            if (real) Object.defineProperty(window, 'localStorage', real);
        }
    });
});

describe('EuriskoDraft：纯函数', () => {
    let P;
    beforeAll(() => {
        loadSource('src/js/data/draft-store.js');
        P = window.EuriskoDraft.pure;
    });

    test('键走独立命名空间：绝不与云同步的 taxCalculationHistory 同一把钥匙', () => {
        expect(P.storageKey('forward')).toBe('euriskoDraft:forward');
        expect(P.storageKey('forward')).not.toBe('taxCalculationHistory');
    });

    test('过期即弃（默认 7 天）：第 8 天的草稿读出来是 null', () => {
        const DAY = 24 * 60 * 60 * 1000;
        const now = Date.UTC(2026, 8, 17, 12, 0, 0);
        const raw = JSON.stringify({ v: 1, ts: now - 8 * DAY, step: 3, values: { salary: '99999' } });
        expect(P.readDraft(raw, now)).toBeNull();

        const fresh = JSON.stringify({ v: 1, ts: now - 6 * DAY, step: 3, values: { salary: '99999' } });
        expect(P.readDraft(fresh, now).values.salary).toBe('99999');
    });

    test('坏了 / 被改过 / 旧版本的记录不会把填写流程拖崩', () => {
        const now = Date.now();
        expect(P.readDraft('', now)).toBeNull();
        expect(P.readDraft('{不是 JSON', now)).toBeNull();
        expect(P.readDraft(JSON.stringify({ v: 99, ts: now, values: {} }), now)).toBeNull();
        expect(P.readDraft(JSON.stringify({ v: 1, ts: now }), now)).toBeNull();  // 缺 values
        expect(P.readDraft(JSON.stringify({ v: 1, ts: 0, values: {} }), now)).toBeNull();
    });

    test('超过配额写不进去：返回 false，不让「保存失败」变成一次异常', () => {
        expect(P.isExpired(NaN, Date.now())).toBe(true);
        expect(P.DEFAULT_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
    });

    test('relativeTime：给人读的档位', () => {
        const now = Date.now();
        expect(P.relativeTime(now, now)).toBe('刚刚');
        expect(P.relativeTime(now - 25 * 60 * 1000, now)).toBe('25 分钟前');
        expect(P.relativeTime(now - 3 * 60 * 60 * 1000, now)).toBe('3 小时前');
        expect(P.relativeTime(now - 50 * 60 * 60 * 1000, now)).toBe('2 天前');
    });

    test('visibleStep 直接读 DOM 的可见面板', () => {
        expect(P.visibleStep(document.body, ['pane-1', 'pane-2'])).toBe(1);
        expect(P.visibleStep(document.body, ['pane-2', 'pane-1'])).toBe(2);
        expect(P.visibleStep(document.body, ['不存在', 'pane-1'])).toBe(2);
        expect(P.visibleStep(document.body, [])).toBe(1);
    });
});

describe('EuriskoDraft：跨文件契约', () => {
    // 这一组防的是**静默失效**：一次 UI 重构把面板 id 或导航函数改名，
    // 草稿功能照跑不报错，只是再也不弹出「继续填写」—— 没人会在日常点点里发现。
    const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const NAV = fs.readFileSync(path.join(__dirname, '..', 'src', 'js', 'ui', 'navigation-ui.js'), 'utf8');

    beforeAll(() => {
        loadSource('src/js/data/draft-store.js');
    });

    test('index.html 引入了 draft-store.js', () => {
        expect(HTML).toContain('src/js/data/draft-store.js');
    });

    test('每个流程的容器与分步面板 id 都在 index.html 里真实存在', () => {
        window.EuriskoDraft._FLOWS.forEach((f) => {
            expect(HTML).toContain('id="' + f.containerId + '"');
            f.paneIds.forEach((p) => expect(HTML).toContain('id="' + p + '"'));
        });
    });

    test('每个流程依赖的导航函数在 navigation-ui.js 里有定义', () => {
        window.EuriskoDraft._FLOWS.forEach((f) => {
            expect(NAV).toMatch(new RegExp('function\\s+' + f.gotoName + '\\b'));
        });
    });

    test('隐私政策写明草稿只存本机 —— 「明示」是这条功能的合规前提', () => {
        expect(HTML).toContain('本地草稿');
        expect(HTML).toContain('不会上传服务器');
    });
});

describe('EuriskoDraft：不上云的硬约束', () => {
    test('源文件里不允许出现任何网络调用 —— 收入 / 五险一金不得出本机', () => {
        const src = fs.readFileSync(SRC, 'utf8');
        expect(src).not.toMatch(/\bfetch\s*\(/);
        expect(src).not.toMatch(/XMLHttpRequest/);
        expect(src).not.toMatch(/\.ajax\s*\(/);
        // 云同步链路只认这一个 key，草稿的 key 空间必须与之分离。
        // 注释里提到 key 名是为了说清这条边界；要卡的是代码里没有把它当存储键来用
        expect(src).toMatch(/euriskoDraft:/);
        expect(src).not.toMatch(/['"]taxCalculationHistory['"]/);
    });
});
