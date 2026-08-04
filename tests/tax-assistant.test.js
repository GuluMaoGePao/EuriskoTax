// 悬浮税助手单元测试
// 覆盖 tax-assistant-ui.js 的交互逻辑和数据匹配

const { loadSource } = require('./helpers/load-source');

// 模拟问答数据
const MOCK_QA = [
    {
        id: 'test_1',
        category: '综合所得',
        keywords: ['年终奖', '奖金', '一次性'],
        question: '年终奖如何计税？',
        answer: '年终奖可选择单独计税或并入综合所得。',
        hot: true,
        related: { page: 'forward-calculation-page', label: '去综合所得测算' }
    },
    {
        id: 'test_2',
        category: '经营所得',
        keywords: ['个体工商户', '经营', '减半'],
        question: '经营所得减半征收怎么享受？',
        answer: '年应纳税所得额不超过200万部分减半征收。'
    },
    {
        id: 'test_3',
        category: '分类所得',
        keywords: ['租金', '财产租赁'],
        question: '房屋租金如何计税？',
        answer: '月租金≤4000减800，>4000减20%，税率20%。'
    }
];

const MOCK_SHORTCUTS = [
    { id: 'rate', icon: 'fa-table', label: '税率表', action: 'showRateTable' },
    { id: 'history', icon: 'fa-history', label: '历史记录', action: 'goHistory' }
];

// 设置全局数据
beforeAll(() => {
    global.window = global;
    global.window.TAX_ASSISTANT_QA = MOCK_QA;
    global.window.TAX_ASSISTANT_SHORTCUTS = MOCK_SHORTCUTS;
    global.InteractionLog = { log: jest.fn() };
    // 先加载通用 Mock 工具，业务模块依赖 window.Logger / window.MockClient
    loadSource('src/js/utils/mock-client.js');
});

// 每个测试前重置 DOM 与 localStorage（收藏/反馈/历史/FAB位置 隔离）
beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = `
        <button id="tax-assistant-fab" class="assistant-fab" style="display:flex;">
            <i class="fa fa-comments"></i>
        </button>
        <div id="tax-assistant-overlay" class="assistant-overlay"></div>
        <div id="tax-assistant-drawer" class="assistant-drawer assistant-drawer-closed">
            <div class="assistant-header">
                <button id="assistant-close" class="assistant-close">×</button>
                <input type="text" id="assistant-search" class="assistant-search" />
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
});

describe('悬浮税助手 - 初始化与开关', () => {
    test('FAB 点击应打开抽屉', () => {
        loadSource('src/js/ui/tax-assistant-ui.js');

        const drawer = document.getElementById('tax-assistant-drawer');
        const fab = document.getElementById('tax-assistant-fab');

        expect(drawer.classList.contains('assistant-drawer-open')).toBe(false);

        fab.click();

        expect(drawer.classList.contains('assistant-drawer-open')).toBe(true);
        expect(fab.style.display).toBe('none');
    });

    test('关闭按钮应关闭抽屉', () => {
        loadSource('src/js/ui/tax-assistant-ui.js');

        // 先打开
        document.getElementById('tax-assistant-fab').click();
        expect(document.getElementById('tax-assistant-drawer').classList.contains('assistant-drawer-open')).toBe(true);

        // 关闭
        document.getElementById('assistant-close').click();
        expect(document.getElementById('tax-assistant-drawer').classList.contains('assistant-drawer-open')).toBe(false);
        expect(document.getElementById('tax-assistant-fab').style.display).toBe('flex');
    });

    test('点击遮罩层应关闭抽屉', () => {
        loadSource('src/js/ui/tax-assistant-ui.js');

        // 先打开
        document.getElementById('tax-assistant-fab').click();
        expect(document.getElementById('tax-assistant-drawer').classList.contains('assistant-drawer-open')).toBe(true);

        // 点击遮罩
        document.getElementById('tax-assistant-overlay').click();
        expect(document.getElementById('tax-assistant-drawer').classList.contains('assistant-drawer-open')).toBe(false);
    });

    test('ESC 键应关闭抽屉', () => {
        loadSource('src/js/ui/tax-assistant-ui.js');

        // 先打开
        document.getElementById('tax-assistant-fab').click();
        expect(document.getElementById('tax-assistant-drawer').classList.contains('assistant-drawer-open')).toBe(true);

        // 按 ESC
        const escEvent = new KeyboardEvent('keydown', { key: 'Escape' });
        document.dispatchEvent(escEvent);
        expect(document.getElementById('tax-assistant-drawer').classList.contains('assistant-drawer-open')).toBe(false);
    });
});

describe('悬浮税助手 - 渲染', () => {
    test('打开时应渲染快捷功能按钮', () => {
        loadSource('src/js/ui/tax-assistant-ui.js');

        document.getElementById('tax-assistant-fab').click();

        const shortcuts = document.querySelectorAll('.assistant-shortcut');
        expect(shortcuts.length).toBe(2);
        expect(shortcuts[0].textContent).toContain('税率表');
        expect(shortcuts[1].textContent).toContain('历史记录');
    });

    test('打开时应渲染分类标签', () => {
        loadSource('src/js/ui/tax-assistant-ui.js');

        document.getElementById('tax-assistant-fab').click();

        const cats = document.querySelectorAll('.assistant-cat');
        expect(cats.length).toBe(8); // 全部 + 6个分类 + 1个收藏筛选
        expect(cats[0].textContent).toBe('全部');
        expect(cats[0].classList.contains('assistant-cat-active')).toBe(true);
    });

    test('打开时应渲染全部问答', () => {
        loadSource('src/js/ui/tax-assistant-ui.js');

        document.getElementById('tax-assistant-fab').click();

        const items = document.querySelectorAll('.assistant-qa-item');
        expect(items.length).toBe(3);
    });
});

describe('悬浮税助手 - 搜索', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });
    afterEach(() => {
        jest.useRealTimers();
    });

    test('搜索"年终奖"应筛选出1条', () => {
        loadSource('src/js/ui/tax-assistant-ui.js');

        document.getElementById('tax-assistant-fab').click();

        const search = document.getElementById('assistant-search');
        search.value = '年终奖';
        search.dispatchEvent(new Event('input'));

        // 执行防抖
        jest.advanceTimersByTime(300);

        const items = document.querySelectorAll('.assistant-qa-item');
        expect(items.length).toBe(1);
        expect(items[0].querySelector('.assistant-qa-q-text').textContent).toContain('年终奖');
    });

    test('搜索无匹配应显示空状态', () => {
        loadSource('src/js/ui/tax-assistant-ui.js');

        document.getElementById('tax-assistant-fab').click();

        const search = document.getElementById('assistant-search');
        search.value = '不存在的关键词xyz';
        search.dispatchEvent(new Event('input'));

        jest.advanceTimersByTime(300);

        const empty = document.querySelector('.assistant-empty');
        expect(empty).not.toBeNull();
        expect(empty.textContent).toContain('未找到');
    });

    test('清空搜索应恢复全部问答', () => {
        loadSource('src/js/ui/tax-assistant-ui.js');

        document.getElementById('tax-assistant-fab').click();

        // 先搜索
        const search = document.getElementById('assistant-search');
        search.value = '年终奖';
        search.dispatchEvent(new Event('input'));
        jest.advanceTimersByTime(300);
        expect(document.querySelectorAll('.assistant-qa-item').length).toBe(1);

        // 清空
        search.value = '';
        search.dispatchEvent(new Event('input'));
        jest.advanceTimersByTime(300);
        expect(document.querySelectorAll('.assistant-qa-item').length).toBe(3);
    });

    test('搜索关键词应在问答中高亮', () => {
        loadSource('src/js/ui/tax-assistant-ui.js');

        document.getElementById('tax-assistant-fab').click();

        const search = document.getElementById('assistant-search');
        search.value = '年终奖';
        search.dispatchEvent(new Event('input'));

        jest.advanceTimersByTime(300);

        const mark = document.querySelector('.assistant-mark');
        expect(mark).not.toBeNull();
        expect(mark.textContent).toBe('年终奖');
    });
});

describe('悬浮税助手 - 分类筛选', () => {
    test('点击"经营所得"应筛选出对应分类', () => {
        loadSource('src/js/ui/tax-assistant-ui.js');

        document.getElementById('tax-assistant-fab').click();

        // 点击经营所得分类
        let cats = document.querySelectorAll('.assistant-cat');
        const bizCat = Array.from(cats).find(c => c.textContent === '经营所得');
        bizCat.click();

        // renderCategories 会重新渲染按钮，需要重新获取
        cats = document.querySelectorAll('.assistant-cat');
        const newBizCat = Array.from(cats).find(c => c.textContent === '经营所得');
        expect(newBizCat.classList.contains('assistant-cat-active')).toBe(true);

        const items = document.querySelectorAll('.assistant-qa-item');
        expect(items.length).toBe(1);
        expect(items[0].querySelector('.assistant-qa-q-text').textContent).toContain('经营所得');
    });

    test('点击"全部"应恢复全部问答', () => {
        loadSource('src/js/ui/tax-assistant-ui.js');

        document.getElementById('tax-assistant-fab').click();

        // 先选经营所得
        let cats = document.querySelectorAll('.assistant-cat');
        cats[2].click(); // 经营所得
        expect(document.querySelectorAll('.assistant-qa-item').length).toBe(1);

        // 再选全部（重新获取，因为 renderCategories 重渲染了）
        cats = document.querySelectorAll('.assistant-cat');
        cats[0].click(); // 全部
        expect(document.querySelectorAll('.assistant-qa-item').length).toBe(3);
    });
});

describe('悬浮税助手 - 问答展开', () => {
    test('点击问题应展开答案', () => {
        loadSource('src/js/ui/tax-assistant-ui.js');

        document.getElementById('tax-assistant-fab').click();

        const q = document.querySelector('.assistant-qa-q');
        const a = document.querySelector('.assistant-qa-a');

        expect(a.style.display).toBe('none');

        q.click();

        expect(a.style.display).toBe('block');
        expect(q.getAttribute('data-expanded')).toBe('true');
    });

    test('再次点击应收起答案', () => {
        loadSource('src/js/ui/tax-assistant-ui.js');

        document.getElementById('tax-assistant-fab').click();

        const q = document.querySelector('.assistant-qa-q');
        const a = document.querySelector('.assistant-qa-a');

        // 展开
        q.click();
        expect(a.style.display).toBe('block');

        // 收起
        q.click();
        expect(a.style.display).toBe('none');
        expect(q.getAttribute('data-expanded')).toBe('false');
    });
});

describe('悬浮税助手 - 全局 API', () => {
    test('window.TaxAssistant 应暴露 open/close/toggle 方法', () => {
        loadSource('src/js/ui/tax-assistant-ui.js');

        expect(typeof window.TaxAssistant).toBe('object');
        expect(typeof window.TaxAssistant.open).toBe('function');
        expect(typeof window.TaxAssistant.close).toBe('function');
        expect(typeof window.TaxAssistant.toggle).toBe('function');
    });

    test('toggle 应在打开和关闭之间切换', () => {
        loadSource('src/js/ui/tax-assistant-ui.js');

        const drawer = document.getElementById('tax-assistant-drawer');

        window.TaxAssistant.toggle();
        expect(drawer.classList.contains('assistant-drawer-open')).toBe(true);

        window.TaxAssistant.toggle();
        expect(drawer.classList.contains('assistant-drawer-open')).toBe(false);
    });
});

describe('悬浮税助手 - 热门问题', () => {
    test('打开时应渲染热门问题 chips', () => {
        loadSource('src/js/ui/tax-assistant-ui.js');

        document.getElementById('tax-assistant-fab').click();

        const chips = document.querySelectorAll('.assistant-hot-chip');
        expect(chips.length).toBe(1); // MOCK_QA 中 test_1 标记为 hot
        expect(chips[0].textContent).toContain('年终奖');
    });

    test('点击热门 chip 应展开对应问答', () => {
        loadSource('src/js/ui/tax-assistant-ui.js');

        document.getElementById('tax-assistant-fab').click();

        const chip = document.querySelector('.assistant-hot-chip');
        chip.click();

        const items = document.querySelectorAll('.assistant-qa-item');
        const expanded = Array.from(items).find(it => it.querySelector('.assistant-qa-q').getAttribute('data-expanded') === 'true');
        expect(expanded).toBeDefined();
        expect(expanded.getAttribute('data-qa-id')).toBe('test_1');
    });
});

describe('悬浮税助手 - 收藏功能', () => {
    test('展开问答后点击收藏应切换收藏态并写入 localStorage', () => {
        loadSource('src/js/ui/tax-assistant-ui.js');

        document.getElementById('tax-assistant-fab').click();

        // 展开第一条
        document.querySelector('.assistant-qa-q').click();

        const favBtn = document.querySelector('.assistant-fav-btn');
        expect(favBtn.classList.contains('fav-active')).toBe(false);

        favBtn.click();

        // 收藏后按钮应变为激活态
        const favBtnAfter = document.querySelector('.assistant-fav-btn');
        expect(favBtnAfter.classList.contains('fav-active')).toBe(true);
        expect(JSON.parse(localStorage.getItem('taxAssistantFavorites'))).toEqual(['test_1']);
    });

    test('再次点击收藏应取消收藏', () => {
        loadSource('src/js/ui/tax-assistant-ui.js');

        document.getElementById('tax-assistant-fab').click();
        document.querySelector('.assistant-qa-q').click();
        const favBtn = document.querySelector('.assistant-fav-btn');
        favBtn.click();  // 收藏
        favBtn.click();  // 取消

        expect(JSON.parse(localStorage.getItem('taxAssistantFavorites'))).toEqual([]);
    });

    test('点击"收藏"筛选 chip 应只显示已收藏问题', () => {
        loadSource('src/js/ui/tax-assistant-ui.js');

        document.getElementById('tax-assistant-fab').click();

        // 先收藏 test_1
        document.querySelector('.assistant-qa-q').click();
        document.querySelector('.assistant-fav-btn').click();

        // 点击收藏筛选 chip
        const favChip = Array.from(document.querySelectorAll('.assistant-cat')).find(c => c.getAttribute('data-cat') === '__fav__');
        favChip.click();

        const items = document.querySelectorAll('.assistant-qa-item');
        expect(items.length).toBe(1);
        expect(items[0].getAttribute('data-qa-id')).toBe('test_1');
    });

    test('收藏筛选下无收藏应显示空状态', () => {
        loadSource('src/js/ui/tax-assistant-ui.js');

        document.getElementById('tax-assistant-fab').click();

        const favChip = Array.from(document.querySelectorAll('.assistant-cat')).find(c => c.getAttribute('data-cat') === '__fav__');
        favChip.click();

        const empty = document.querySelector('.assistant-empty');
        expect(empty).not.toBeNull();
        expect(empty.textContent).toContain('还没有收藏');
    });
});

describe('悬浮税助手 - 反馈功能', () => {
    test('点击"有用"应记录反馈并更新计数', () => {
        loadSource('src/js/ui/tax-assistant-ui.js');

        document.getElementById('tax-assistant-fab').click();
        document.querySelector('.assistant-qa-q').click();

        const goodBtn = document.querySelector('.assistant-fb-btn[data-fb-type="good"]');
        goodBtn.click();

        const goodBtnAfter = document.querySelector('.assistant-fb-btn[data-fb-type="good"]');
        expect(goodBtnAfter.classList.contains('fb-clicked')).toBe(true);
        expect(goodBtnAfter.textContent).toContain('1');
        const fb = JSON.parse(localStorage.getItem('taxAssistantFeedback'));
        expect(fb.test_1.good).toBe(1);
        expect(fb.test_1.mine).toBe('good');
    });

    test('再次点击"有用"应取消反馈', () => {
        loadSource('src/js/ui/tax-assistant-ui.js');

        document.getElementById('tax-assistant-fab').click();
        document.querySelector('.assistant-qa-q').click();

        const goodBtn = document.querySelector('.assistant-fb-btn[data-fb-type="good"]');
        goodBtn.click();
        goodBtn.click();  // 取消

        const goodBtnAfter = document.querySelector('.assistant-fb-btn[data-fb-type="good"]');
        expect(goodBtnAfter.classList.contains('fb-clicked')).toBe(false);
        expect(goodBtnAfter.textContent).toContain('0');
    });

    test('从"有用"切换到"无用"应转移反馈', () => {
        loadSource('src/js/ui/tax-assistant-ui.js');

        document.getElementById('tax-assistant-fab').click();
        document.querySelector('.assistant-qa-q').click();

        document.querySelector('.assistant-fb-btn[data-fb-type="good"]').click();
        document.querySelector('.assistant-fb-btn[data-fb-type="bad"]').click();

        const fb = JSON.parse(localStorage.getItem('taxAssistantFeedback'));
        expect(fb.test_1.good).toBe(0);
        expect(fb.test_1.bad).toBe(1);
        expect(fb.test_1.mine).toBe('bad');
    });
});

describe('悬浮税助手 - 关联跳转', () => {
    test('有 related 的问答应渲染"去测算"按钮', () => {
        loadSource('src/js/ui/tax-assistant-ui.js');

        document.getElementById('tax-assistant-fab').click();

        // test_1 有 related，展开后应含关联按钮
        const items = document.querySelectorAll('.assistant-qa-item');
        const item1 = Array.from(items).find(it => it.getAttribute('data-qa-id') === 'test_1');
        item1.querySelector('.assistant-qa-q').click();

        const relatedBtn = item1.querySelector('.assistant-related-btn');
        expect(relatedBtn).not.toBeNull();
        expect(relatedBtn.getAttribute('data-related-page')).toBe('forward-calculation-page');
    });

    test('无 related 的问答不应渲染"去测算"按钮', () => {
        loadSource('src/js/ui/tax-assistant-ui.js');

        document.getElementById('tax-assistant-fab').click();

        const items = document.querySelectorAll('.assistant-qa-item');
        const item2 = Array.from(items).find(it => it.getAttribute('data-qa-id') === 'test_2');
        item2.querySelector('.assistant-qa-q').click();

        expect(item2.querySelector('.assistant-related-btn')).toBeNull();
    });
});

describe('悬浮税助手 - 搜索历史与联想', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });
    afterEach(() => {
        jest.useRealTimers();
    });

    test('Enter 提交搜索应记录到历史', () => {
        loadSource('src/js/ui/tax-assistant-ui.js');

        document.getElementById('tax-assistant-fab').click();

        const search = document.getElementById('assistant-search');
        search.value = '年终奖';
        search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

        const hist = JSON.parse(localStorage.getItem('taxAssistantHistory'));
        expect(hist).toEqual(['年终奖']);
    });

    test('输入时应显示相关问题的联想下拉', () => {
        loadSource('src/js/ui/tax-assistant-ui.js');

        document.getElementById('tax-assistant-fab').click();

        const search = document.getElementById('assistant-search');
        search.value = '年终奖';
        search.dispatchEvent(new Event('input'));

        const suggest = document.getElementById('assistant-suggest');
        expect(suggest.style.display).not.toBe('none');
        const items = suggest.querySelectorAll('.assistant-suggest-item');
        expect(items.length).toBeGreaterThan(0);
        expect(items[0].textContent).toContain('年终奖');
    });

    test('聚焦空搜索框应显示历史（若有）', () => {
        loadSource('src/js/ui/tax-assistant-ui.js');

        // 先写入一条历史
        localStorage.setItem('taxAssistantHistory', JSON.stringify(['年终奖']));

        document.getElementById('tax-assistant-fab').click();

        const search = document.getElementById('assistant-search');
        search.dispatchEvent(new Event('focus'));

        const suggest = document.getElementById('assistant-suggest');
        const items = suggest.querySelectorAll('.assistant-suggest-item');
        expect(items.length).toBe(1);
        expect(items[0].textContent).toContain('年终奖');
        // 历史模式应有"清空历史"按钮
        expect(document.getElementById('assistant-suggest-clear')).not.toBeNull();
    });

    test('清空历史按钮应清除 localStorage 历史', () => {
        loadSource('src/js/ui/tax-assistant-ui.js');

        localStorage.setItem('taxAssistantHistory', JSON.stringify(['年终奖', '租金']));

        document.getElementById('tax-assistant-fab').click();

        const search = document.getElementById('assistant-search');
        search.dispatchEvent(new Event('focus'));

        document.getElementById('assistant-suggest-clear').click();

        expect(JSON.parse(localStorage.getItem('taxAssistantHistory'))).toEqual([]);
    });
});

describe('悬浮税助手 - 失败回滚', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });
    afterEach(() => {
        jest.useRealTimers();
    });

    // flush microtask 队列（Promise.then/.catch 链）
    async function flush() {
        for (let i = 0; i < 5; i++) await Promise.resolve();
    }

    test('收藏同步失败应回滚本地收藏状态', async () => {
        loadSource('src/js/ui/tax-assistant-ui.js');
        window.TaxAssistant.mockApi.failNext = 1; // 强制下次请求失败

        document.getElementById('tax-assistant-fab').click();
        document.querySelector('.assistant-qa-q').click();

        const wasFav = window.TaxAssistant.isFavorited('test_1');
        document.querySelector('.assistant-fav-btn').click();

        // 乐观更新：立即切换收藏态
        expect(window.TaxAssistant.isFavorited('test_1')).toBe(!wasFav);

        // 推进定时器，MockApi reject 触发回滚
        jest.advanceTimersByTime(250);
        await flush();

        // 回滚后应恢复原状
        expect(window.TaxAssistant.isFavorited('test_1')).toBe(wasFav);
    });

    test('反馈同步失败应回滚本地反馈计数', async () => {
        loadSource('src/js/ui/tax-assistant-ui.js');
        window.TaxAssistant.mockApi.failNext = 1;

        document.getElementById('tax-assistant-fab').click();
        document.querySelector('.assistant-qa-q').click();

        const fbBefore = JSON.parse(localStorage.getItem('taxAssistantFeedback') || '{}');
        const goodBefore = (fbBefore.test_1 && fbBefore.test_1.good) || 0;

        document.querySelector('.assistant-fb-btn[data-fb-type="good"]').click();

        // 乐观更新：good +1
        let fb = JSON.parse(localStorage.getItem('taxAssistantFeedback'));
        expect(fb.test_1.good).toBe(goodBefore + 1);

        jest.advanceTimersByTime(250);
        await flush();

        // 回滚后恢复原值
        fb = JSON.parse(localStorage.getItem('taxAssistantFeedback') || '{}');
        const goodAfter = (fb.test_1 && fb.test_1.good) || 0;
        expect(goodAfter).toBe(goodBefore);
    });

    test('收藏同步成功不应回滚', async () => {
        loadSource('src/js/ui/tax-assistant-ui.js');
        // 不设 failNext，请求应成功

        document.getElementById('tax-assistant-fab').click();
        document.querySelector('.assistant-qa-q').click();

        const wasFav = window.TaxAssistant.isFavorited('test_1');
        document.querySelector('.assistant-fav-btn').click();

        expect(window.TaxAssistant.isFavorited('test_1')).toBe(!wasFav);

        jest.advanceTimersByTime(250);
        await flush();

        // 成功后保持切换态，不回滚
        expect(window.TaxAssistant.isFavorited('test_1')).toBe(!wasFav);
    });
});
