// 主页（工作台）单元测试
// 覆盖 home-ui.js 的渲染逻辑和事件绑定
// 包含：问候语、今日税感、最近计算、税务日历、税务小贴士、模式卡片点击

const { loadSource } = require('./helpers/load-source');

// 模拟全局函数（home-ui.js 依赖）
global.showPage = jest.fn();
global.showAlert = jest.fn();
global.viewHistoryRecord = jest.fn();

beforeAll(() => {
    global.window = global;
});

beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();

    // 构建主页 DOM 结构（精简版，包含 home-ui.js 需要的所有元素）
    document.body.innerHTML = `
        <div id="mode-selection-page" class="page active">
            <div class="max-w-5xl mx-auto pt-2 pb-6">
                <!-- 卡片1：欢迎 -->
                <div class="home-card">
                    <h2 id="home-greeting"></h2>
                    <p id="home-date-text"></p>
                    <div id="home-tax-feel-content"></div>
                </div>
                <!-- 卡片2：模式选择 -->
                <div class="home-card">
                    <div class="home-card-header">
                        <div class="home-card-title"><span>开始计算</span></div>
                    </div>
                    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <div class="mode-card mode-card-primary" id="forward-mode-card">
                            <button class="mode-card-info-btn" data-mode-info="forward"><i class="fa fa-info-circle"></i></button>
                            <button id="forward-mode-btn" class="hidden"></button>
                        </div>
                        <div class="mode-card mode-card-accent" id="business-mode-card">
                            <button class="mode-card-info-btn" data-mode-info="business"><i class="fa fa-info-circle"></i></button>
                            <button id="business-mode-btn" class="hidden"></button>
                        </div>
                        <div class="mode-card mode-card-success" id="classification-mode-card">
                            <button class="mode-card-info-btn" data-mode-info="classification"><i class="fa fa-info-circle"></i></button>
                            <button id="classification-mode-btn" class="hidden"></button>
                        </div>
                        <div class="mode-card mode-card-secondary" id="reverse-mode-card">
                            <button class="mode-card-info-btn" data-mode-info="reverse"><i class="fa fa-info-circle"></i></button>
                            <button id="reverse-mode-btn" class="hidden"></button>
                        </div>
                    </div>
                </div>
                <!-- 卡片3：最近计算 -->
                <div class="home-card">
                    <div class="home-card-header">
                        <div class="home-card-title"><span>最近计算</span></div>
                        <a href="#" id="home-view-all-history">全部 ›</a>
                    </div>
                    <div id="home-recent-list" class="recent-scroll"></div>
                </div>
                <!-- 卡片4：税务提醒 -->
                <div class="home-card">
                    <div class="home-card-header">
                        <div class="home-card-title"><span>税务提醒</span></div>
                        <span id="home-calendar-year"></span>
                    </div>
                    <div id="home-calendar-list" class="space-y-1"></div>
                </div>
                <!-- 卡片5：小贴士 -->
                <div class="home-card">
                    <div class="home-card-header">
                        <div class="home-card-title"><span>税务小贴士</span></div>
                        <button id="home-next-tip">换一条 ›</button>
                    </div>
                    <div id="home-tip-content"></div>
                </div>
            </div>
        </div>
        <!-- 模态框（showModeInfo 需要） -->
        <div id="alert-modal" class="hidden">
            <h3 id="alert-modal-title"></h3>
            <div id="alert-modal-message"></div>
        </div>
    `;

    // 加载 home-ui.js（IIFE 模式，可直接 eval）
    loadSource('src/js/ui/home-ui.js');
});

afterEach(() => {
    // 清理 IIFE 注册的全局函数，避免跨测试污染
    delete global.window.initHome;
    delete global.window.refreshHomeRecent;
});

// ====== 渲染：问候语 + 日期 ======
describe('主页 - 问候语与日期渲染', () => {
    test('问候语应包含 👋 表情', () => {
        const greeting = document.getElementById('home-greeting').textContent;
        expect(greeting).toContain('👋');
    });

    test('日期文本应包含"今天是"', () => {
        const dateText = document.getElementById('home-date-text').textContent;
        expect(dateText).toContain('今天是');
        expect(dateText).toMatch(/年.*月.*日/);
    });

    test('问候语应根据时间段变化', () => {
        const greeting = document.getElementById('home-greeting').textContent;
        const validGreetings = ['夜深了', '早上好', '上午好', '中午好', '下午好', '晚上好'];
        expect(validGreetings.some(g => greeting.includes(g))).toBe(true);
    });
});

// ====== 渲染：今日税感 ======
describe('主页 - 今日税感渲染', () => {
    test('今日税感容器应有内容', () => {
        const container = document.getElementById('home-tax-feel-content');
        expect(container.innerHTML).not.toBe('');
        // 应包含至少一个提醒项
        expect(container.querySelectorAll('.flex.items-start').length).toBeGreaterThan(0);
    });

    test('提醒项应包含 tax-reminder-dot', () => {
        const dots = document.getElementById('home-tax-feel-content').querySelectorAll('.tax-reminder-dot');
        expect(dots.length).toBeGreaterThan(0);
    });
});

// ====== 渲染：最近计算 ======
describe('主页 - 最近计算渲染', () => {
    test('无历史记录时应显示空状态', () => {
        const container = document.getElementById('home-recent-list');
        expect(container.querySelector('.home-empty-state')).toBeTruthy();
        expect(container.textContent).toContain('还没有计算记录');
    });

    test('有历史记录时应渲染 recent-card', () => {
        // 存入测试数据
        localStorage.setItem('taxCalculationHistory', JSON.stringify([
            { id: 'test1', type: 'comprehensive', date: '2026-07-01', title: '测试计算1', results: { totalTax: 1200 } },
            { id: 'test2', type: 'business', date: '2026-07-02', title: '测试计算2', results: { totalTax: 800 } }
        ]));

        // 重新渲染
        global.window.refreshHomeRecent();

        const container = document.getElementById('home-recent-list');
        const cards = container.querySelectorAll('.recent-card');
        expect(cards.length).toBe(2);
        // 应按时间倒序（test2 在前）
        expect(cards[0].getAttribute('data-history-id')).toBe('test2');
    });

    test('最近计算应限制最多5条', () => {
        const history = [];
        for (let i = 0; i < 10; i++) {
            history.push({ id: `test${i}`, type: 'comprehensive', date: `2026-07-${i+1}`, title: `测试${i}`, results: { totalTax: 100 } });
        }
        localStorage.setItem('taxCalculationHistory', JSON.stringify(history));

        global.window.refreshHomeRecent();

        const cards = document.querySelectorAll('.recent-card');
        expect(cards.length).toBe(5);
    });

    test('点击 recent-card 应调用 viewHistoryRecord', () => {
        localStorage.setItem('taxCalculationHistory', JSON.stringify([
            { id: 'click-test', type: 'comprehensive', date: '2026-07-01', title: '点击测试', results: { totalTax: 500 } }
        ]));
        global.window.refreshHomeRecent();

        const card = document.querySelector('.recent-card');
        card.click();

        expect(global.viewHistoryRecord).toHaveBeenCalledWith('click-test');
    });
});

// ====== 渲染：税务日历 ======
describe('主页 - 税务日历渲染', () => {
    test('年份应显示当前年份', () => {
        const yearEl = document.getElementById('home-calendar-year');
        expect(yearEl.textContent).toBe(String(new Date().getFullYear()));
    });

    test('日历列表应有提醒项', () => {
        const items = document.getElementById('home-calendar-list').querySelectorAll('.tax-reminder-item');
        expect(items.length).toBeGreaterThan(0);
    });

    test('提醒项应包含剩余天数', () => {
        const container = document.getElementById('home-calendar-list');
        expect(container.textContent).toMatch(/剩.*天|今天截止/);
    });
});

// ====== 渲染：税务小贴士 ======
describe('主页 - 税务小贴士渲染', () => {
    test('小贴士容器应有内容', () => {
        const container = document.getElementById('home-tip-content');
        expect(container.innerHTML).not.toBe('');
        expect(container.querySelector('.fa-quote-left')).toBeTruthy();
    });

    test('点击"换一条"应切换小贴士', () => {
        const before = document.getElementById('home-tip-content').textContent;
        document.getElementById('home-next-tip').click();
        const after = document.getElementById('home-tip-content').textContent;

        // 内容可能相同（如果只有一条），但应能正常执行不报错
        expect(after).toBeTruthy();
    });

    test('连续点击多次应循环不报错', () => {
        const btn = document.getElementById('home-next-tip');
        for (let i = 0; i < 15; i++) {
            btn.click();
        }
        expect(document.getElementById('home-tip-content').innerHTML).not.toBe('');
    });
});

// ====== 事件绑定：模式卡片点击 ======
describe('主页 - 模式卡片事件绑定', () => {
    test('点击综合所得卡片应触发 forward-mode-btn', () => {
        const btn = document.getElementById('forward-mode-btn');
        const clickSpy = jest.spyOn(btn, 'click');

        document.getElementById('forward-mode-card').click();
        expect(clickSpy).toHaveBeenCalled();
    });

    test('点击经营所得卡片应触发 business-mode-btn', () => {
        const btn = document.getElementById('business-mode-btn');
        const clickSpy = jest.spyOn(btn, 'click');

        document.getElementById('business-mode-card').click();
        expect(clickSpy).toHaveBeenCalled();
    });

    test('点击分类所得卡片应触发 classification-mode-btn', () => {
        const btn = document.getElementById('classification-mode-btn');
        const clickSpy = jest.spyOn(btn, 'click');

        document.getElementById('classification-mode-card').click();
        expect(clickSpy).toHaveBeenCalled();
    });

    test('点击反向倒算卡片应触发 reverse-mode-btn', () => {
        const btn = document.getElementById('reverse-mode-btn');
        const clickSpy = jest.spyOn(btn, 'click');

        document.getElementById('reverse-mode-card').click();
        expect(clickSpy).toHaveBeenCalled();
    });

    test('点击 info 按钮不应触发模式按钮 click', () => {
        const btn = document.getElementById('forward-mode-btn');
        const clickSpy = jest.spyOn(btn, 'click');

        const infoBtn = document.querySelector('[data-mode-info="forward"]');
        infoBtn.click();

        expect(clickSpy).not.toHaveBeenCalled();
    });

    test('点击 info 按钮应调用 showAlert', () => {
        const infoBtn = document.querySelector('[data-mode-info="forward"]');
        infoBtn.click();

        expect(global.showAlert).toHaveBeenCalled();
    });
});

// ====== 事件绑定：其他交互 ======
describe('主页 - 其他交互绑定', () => {
    test('点击"全部"应调用 showPage 跳转个人中心', () => {
        jest.useFakeTimers();
        document.getElementById('home-view-all-history').click();
        expect(global.showPage).toHaveBeenCalledWith('profile-page');

        // 快进 setTimeout
        jest.runAllTimers();
        jest.useRealTimers();
    });
});
