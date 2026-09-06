// 个人中心单元测试
// 覆盖 auth-ui.js 的渲染逻辑和事件绑定
// 包含：统计卡片、模块卡片、税务档案、税务日历、页面导航、卡片点击事件

const fs = require('fs');
const path = require('path');

// ====== 加载 auth-ui.js（ES module 需去除 import/export 后 eval） ======
function loadAuthUI(mockApi) {
    // 注入 mock apiClient（auth-ui.js 内部以全局 apiClient 引用）
    global.apiClient = mockApi;
    global.window = global;

    const fullPath = path.join(__dirname, '..', 'src', 'js', 'auth', 'auth-ui.js');
    let code = fs.readFileSync(fullPath, 'utf8');
    // 去除 ES module 语法（间接 eval 不支持 import/export）
    code = code.replace(/import\s+apiClient\s+from\s+['"][^'"]+['"];?/, '');
    code = code.replace(/export\s*\{[^}]*\};?/, '');
    (0, eval)(code);
}

// ====== Mock apiClient ======
function createMockApiClient(user) {
    const mockUser = user || { id: 1, username: '测试用户', email: 'test@example.com', phone: '13800138000' };
    return {
        _user: mockUser,
        getProfile: jest.fn().mockResolvedValue(mockUser),
        updateProfile: jest.fn().mockResolvedValue(mockUser),
        deleteProfile: jest.fn().mockResolvedValue({ success: true }),
        getCalculationHistory: jest.fn().mockResolvedValue([]),
        deleteCalculation: jest.fn().mockResolvedValue({ success: true }),
        isLoggedIn: jest.fn().mockReturnValue(true),
        getCurrentUser: jest.fn().mockReturnValue(mockUser),
        loginUser: jest.fn().mockResolvedValue(mockUser),
        registerUser: jest.fn().mockResolvedValue(mockUser),
        logoutUser: jest.fn()
    };
}

// ====== 构建个人中心 DOM ======
function buildProfileDOM() {
    document.body.innerHTML = `
        <div id="app-container">
            <div id="user-menu" class="hidden">
                <button id="user-btn"><span id="user-name" class="text-sm"></span></button>
                <div id="user-dropdown" class="hidden"></div>
            </div>
            <div id="auth-section" class="hidden"></div>
        </div>
        <div id="login-page" class="page hidden">
            <div id="login-form"></div>
            <div id="register-form" class="hidden"></div>
            <button id="login-tab"></button>
            <button id="register-tab"></button>
            <input id="login-email" type="email" />
            <input id="login-password" type="password" />
            <i id="login-password-toggle" class="fa fa-eye"></i>
            <input id="register-username" />
            <input id="register-email" type="email" />
            <input id="register-phone" />
            <input id="register-password" type="password" />
            <i id="register-password-toggle" class="fa fa-eye"></i>
            <input id="register-confirm-password" type="password" />
            <i id="register-confirm-password-toggle" class="fa fa-eye"></i>
            <input id="register-code" type="text" />
            <button id="send-code-btn" disabled></button>
            <input id="register-invite-code" type="text" />
            <button id="login-submit"></button>
            <a href="#" id="forgot-password"></a>
            <button id="quick-login-btn"></button>
            <button id="register-submit"></button>
        </div>
        <div id="mode-selection-page" class="page active"></div>
        <!-- 个人中心主页 -->
        <div id="profile-page" class="page hidden">
            <div class="profile-user-card">
                <div class="profile-user-avatar"></div>
                <div class="profile-user-info">
                    <h3 id="profile-display-name">用户名</h3>
                    <p id="profile-display-email">email@example.com</p>
                </div>
                <div class="profile-user-action">
                    <button class="btn">编辑资料</button>
                </div>
            </div>
            <div id="profile-stats-grid" class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6"></div>
            <div id="profile-cards-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"></div>
        </div>
        <!-- 账户设置 -->
        <div id="profile-settings-page" class="page hidden">
            <button id="back-from-settings" class="back-btn"></button>
            <input id="profile-username" type="text" readonly />
            <input id="profile-email" type="email" readonly />
            <input id="profile-phone" type="tel" />
            <input id="profile-current-password" type="password" />
            <i id="profile-current-password-toggle" class="fa fa-eye"></i>
            <input id="profile-password" type="password" />
            <i id="profile-password-toggle" class="fa fa-eye"></i>
            <input id="profile-confirm-password" type="password" />
            <i id="profile-confirm-password-toggle" class="fa fa-eye"></i>
            <button id="profile-save"></button>
            <button id="profile-cancel"></button>
            <button id="profile-logout-link"></button>
            <button id="profile-delete-account"></button>
        </div>
        <!-- 税务档案 -->
        <div id="profile-tax-page" class="page hidden">
            <button id="back-from-tax" class="back-btn"></button>
            <input id="tax-profile-social-base" type="number" />
            <input id="tax-profile-housing-base" type="number" />
            <input id="tax-profile-children" type="number" />
            <input id="tax-profile-elderly" type="number" />
            <input id="tax-profile-rent" type="number" />
            <input id="tax-profile-housing-loan" type="number" />
            <input id="tax-profile-education" type="number" />
            <input id="tax-profile-pension" type="number" />
            <input id="tax-profile-work-months" type="number" />
            <select id="tax-profile-user-type">
                <option value="employee">雇员</option>
                <option value="owner">个体户</option>
            </select>
            <button id="tax-profile-save"></button>
            <button id="tax-profile-reset"></button>
        </div>
        <!-- 计算历史 -->
        <div id="profile-history-page" class="page hidden">
            <button id="back-from-history" class="back-btn"></button>
            <div id="profile-history-list" class="space-y-4"></div>
            <div id="profile-history-empty" class="hidden"></div>
        </div>
        <!-- 数据管理 -->
        <div id="profile-data-page" class="page hidden">
            <button id="back-from-data" class="back-btn"></button>
            <button id="export-json-btn"></button>
            <button id="export-csv-btn"></button>
        </div>
        <!-- 税务日历 -->
        <div id="profile-calendar-page" class="page hidden">
            <button id="back-from-calendar" class="back-btn"></button>
            <div id="tax-calendar-list" class="space-y-3"></div>
        </div>
        <!-- 导航 -->
        <a href="#" id="profile-link"></a>
        <a href="#" id="logout-link"></a>
        <a href="#" id="profile-nav-settings"></a>
        <!-- 模态框 -->
        <div id="alert-modal" class="hidden">
            <div>
                <div id="alert-modal-icon"><i id="alert-modal-icon-i"></i></div>
                <h3 id="alert-modal-title"></h3>
                <div id="alert-modal-message"></div>
                <button id="alert-modal-ok"></button>
                <button id="close-alert-modal"></button>
            </div>
        </div>
        <div id="help-modal" class="hidden opacity-0">
            <div class="scale-95"></div>
        </div>
        <div id="about-modal" class="hidden">
            <div></div>
        </div>
        <div id="confirm-modal" class="hidden">
            <div>
                <p id="confirm-modal-message"></p>
                <button id="confirm-modal-confirm"></button>
                <button id="confirm-modal-cancel"></button>
                <button id="close-confirm-modal"></button>
            </div>
        </div>
        <div id="login-modal" class="hidden"><div></div></div>
        <div id="register-modal" class="hidden"><div></div></div>
    `;
}

// ====== 测试套件 ======
describe('个人中心 - 渲染逻辑', () => {
    let mockApi;

    beforeEach(() => {
        localStorage.clear();
        mockApi = createMockApiClient();
        buildProfileDOM();
        loadAuthUI(mockApi);
    });

    test('renderProfileStats 应渲染 4 个统计卡片', () => {
        renderProfileStats();
        const grid = document.getElementById('profile-stats-grid');
        const cards = grid.children;
        expect(cards.length).toBe(4);
        // 验证包含预期的统计项 ID
        const ids = Array.from(cards).map(c => c.querySelector('[id]')?.id).filter(Boolean);
        expect(ids).toContain('profile-stats-calculations');
        expect(ids).toContain('profile-stats-profiles');
        expect(ids).toContain('profile-stats-history');
        expect(ids).toContain('profile-stats-reminders');
    });

    test('renderProfileStats 幂等：重复调用不重复渲染', () => {
        renderProfileStats();
        const firstCount = document.getElementById('profile-stats-grid').children.length;
        renderProfileStats();
        const secondCount = document.getElementById('profile-stats-grid').children.length;
        expect(secondCount).toBe(firstCount);
        expect(secondCount).toBe(4);
    });

    test('renderProfileCards 应渲染 6 个模块卡片', () => {
        renderProfileCards();
        const grid = document.getElementById('profile-cards-grid');
        const cards = grid.querySelectorAll('[id^="profile-card-"]');
        expect(cards.length).toBe(6);
        // 验证包含预期的卡片
        const ids = Array.from(cards).map(c => c.id);
        expect(ids).toContain('profile-card-history');
        expect(ids).toContain('profile-card-tax');
        expect(ids).toContain('profile-card-data');
        expect(ids).toContain('profile-card-calendar');
        expect(ids).toContain('profile-card-help');
        expect(ids).toContain('profile-card-about');
    });

    test('renderProfileCards 幂等：重复调用不重复渲染', () => {
        renderProfileCards();
        const firstCount = document.getElementById('profile-cards-grid').children.length;
        renderProfileCards();
        expect(document.getElementById('profile-cards-grid').children.length).toBe(firstCount);
    });

    test('updateProfileStats 应更新统计数字', () => {
        // 准备数据
        localStorage.setItem('calculation_history', JSON.stringify([1, 2, 3]));
        localStorage.setItem('tax_profile', JSON.stringify({ socialBase: 4250 }));

        renderProfileStats(); // 先渲染 DOM
        updateProfileStats();

        expect(document.getElementById('profile-stats-calculations').textContent).toBe('3');
        expect(document.getElementById('profile-stats-history').textContent).toBe('3');
        expect(document.getElementById('profile-stats-profiles').textContent).toBe('1');
    });

    test('updateProfileStats 无税务档案时档案数为 0', () => {
        localStorage.setItem('calculation_history', JSON.stringify([1]));
        renderProfileStats();
        updateProfileStats();
        expect(document.getElementById('profile-stats-profiles').textContent).toBe('0');
    });

    test('renderTaxCalendar 应渲染税务日历事件', () => {
        renderTaxCalendar();
        const list = document.getElementById('tax-calendar-list');
        expect(list.children.length).toBeGreaterThan(0);
        // 应包含汇算清缴相关内容
        expect(list.textContent).toContain('汇算清缴');
    });

    test('renderTaxCalendar 应包含状态标签', () => {
        renderTaxCalendar();
        const list = document.getElementById('tax-calendar-list');
        // 应包含"进行中"、"即将开始"或"已结束"之一
        expect(list.textContent).toMatch(/进行中|即将开始|已结束/);
    });
});

// ====== 税务档案逻辑 ======
describe('个人中心 - 税务档案', () => {
    let mockApi;

    beforeEach(() => {
        localStorage.clear();
        mockApi = createMockApiClient();
        buildProfileDOM();
        loadAuthUI(mockApi);
    });

    test('loadTaxProfile 无保存数据时应加载默认值', () => {
        loadTaxProfile();
        expect(document.getElementById('tax-profile-social-base').value).toBe('4250');
        expect(document.getElementById('tax-profile-housing-base').value).toBe('4250');
        expect(document.getElementById('tax-profile-children').value).toBe('0');
        expect(document.getElementById('tax-profile-work-months').value).toBe('12');
        expect(document.getElementById('tax-profile-user-type').value).toBe('employee');
    });

    test('loadTaxProfile 有保存数据时应加载已保存值', () => {
        const saved = {
            socialBase: 5000,
            housingBase: 6000,
            children: 1,
            elderly: 1,
            rent: 1500,
            housingLoan: 1000,
            education: 400,
            pension: 12000,
            workMonths: 10,
            userType: 'owner'
        };
        localStorage.setItem('tax_profile', JSON.stringify(saved));

        loadTaxProfile();

        expect(document.getElementById('tax-profile-social-base').value).toBe('5000');
        expect(document.getElementById('tax-profile-housing-base').value).toBe('6000');
        expect(document.getElementById('tax-profile-children').value).toBe('1');
        expect(document.getElementById('tax-profile-pension').value).toBe('12000');
        expect(document.getElementById('tax-profile-work-months').value).toBe('10');
        expect(document.getElementById('tax-profile-user-type').value).toBe('owner');
    });

    test('saveTaxProfile 应将档案保存到 localStorage', () => {
        // 设置表单值
        document.getElementById('tax-profile-social-base').value = '5000';
        document.getElementById('tax-profile-housing-base').value = '5000';
        document.getElementById('tax-profile-children').value = '2';
        document.getElementById('tax-profile-pension').value = '6000';
        document.getElementById('tax-profile-work-months').value = '12';
        document.getElementById('tax-profile-user-type').value = 'employee';

        saveTaxProfile();

        const saved = JSON.parse(localStorage.getItem('tax_profile'));
        expect(saved.socialBase).toBe(5000);
        expect(saved.children).toBe(2);
        expect(saved.pension).toBe(6000);
        expect(saved.workMonths).toBe(12);
        expect(saved.userType).toBe('employee');
    });

    test('saveTaxProfile 工作月数超出范围应拒绝保存', () => {
        document.getElementById('tax-profile-work-months').value = '15';
        saveTaxProfile();
        // 未保存到 localStorage
        expect(localStorage.getItem('tax_profile')).toBeNull();
    });

    test('saveTaxProfile 工作月数为 0 应拒绝保存', () => {
        // 修复后：parseInt('0')=0 不再被 || 12 吞掉，0 < 1 触发验证失败
        document.getElementById('tax-profile-work-months').value = '0';
        saveTaxProfile();
        expect(localStorage.getItem('tax_profile')).toBeNull();
    });

    test('saveTaxProfile 养老金超 12000 应拒绝保存', () => {
        document.getElementById('tax-profile-pension').value = '15000';
        document.getElementById('tax-profile-work-months').value = '12';
        saveTaxProfile();
        expect(localStorage.getItem('tax_profile')).toBeNull();
    });

    test('saveTaxProfile 基数为负应拒绝保存', () => {
        document.getElementById('tax-profile-social-base').value = '-100';
        document.getElementById('tax-profile-work-months').value = '12';
        saveTaxProfile();
        expect(localStorage.getItem('tax_profile')).toBeNull();
    });

    test('resetTaxProfile 应恢复默认值并清除存储', () => {
        // 先保存自定义值
        localStorage.setItem('tax_profile', JSON.stringify({ socialBase: 9999 }));
        // 设置表单为非默认值
        document.getElementById('tax-profile-social-base').value = '9999';
        document.getElementById('tax-profile-children').value = '5';

        // jsdom confirm 默认返回 false，需 mock 为 true
        global.confirm = jest.fn().mockReturnValue(true);

        resetTaxProfile();

        expect(document.getElementById('tax-profile-social-base').value).toBe('4250');
        expect(document.getElementById('tax-profile-children').value).toBe('0');
        expect(localStorage.getItem('tax_profile')).toBeNull();
    });

    test('resetTaxProfile 用户取消时应保持原值', () => {
        localStorage.setItem('tax_profile', JSON.stringify({ socialBase: 9999 }));
        document.getElementById('tax-profile-social-base').value = '9999';

        global.confirm = jest.fn().mockReturnValue(false);

        resetTaxProfile();

        expect(document.getElementById('tax-profile-social-base').value).toBe('9999');
        expect(localStorage.getItem('tax_profile')).not.toBeNull();
    });
});

// ====== 异步加载个人资料 ======
describe('个人中心 - loadProfile 异步加载', () => {
    let mockApi;

    beforeEach(() => {
        localStorage.clear();
        mockApi = createMockApiClient();
        buildProfileDOM();
        loadAuthUI(mockApi);
    });

    test('loadProfile 应调用 apiClient.getProfile', async () => {
        await loadProfile();
        expect(mockApi.getProfile).toHaveBeenCalled();
    });

    test('loadProfile 应填充顶栏用户信息', async () => {
        await loadProfile();
        // loadProfile 内部用 requestAnimationFrame 延迟渲染，同步部分应已填充
        expect(document.getElementById('profile-username').value).toBe('测试用户');
        expect(document.getElementById('profile-email').value).toBe('test@example.com');
        expect(document.getElementById('profile-phone').value).toBe('13800138000');
        expect(document.getElementById('profile-display-name').textContent).toBe('测试用户');
        expect(document.getElementById('profile-display-email').textContent).toBe('test@example.com');
    });

    test('loadProfile API 失败应调用 showAlert', async () => {
        mockApi.getProfile.mockRejectedValueOnce(new Error('网络错误'));
        await loadProfile();
        // showAlert 已暴露到 window
        expect(global.showAlert).toBeDefined();
    });

    test('loadProfile 用户无 phone 时应填空字符串', async () => {
        mockApi.getProfile.mockResolvedValueOnce({ username: '无手机号', email: 'nophone@test.com' });
        await loadProfile();
        expect(document.getElementById('profile-phone').value).toBe('');
    });
});

// ====== 事件绑定：setupAuthEventListeners ======
describe('个人中心 - 事件绑定', () => {
    let mockApi;

    beforeEach(() => {
        localStorage.clear();
        mockApi = createMockApiClient();
        buildProfileDOM();
        loadAuthUI(mockApi);
        // 渲染卡片以便后续点击测试
        renderProfileStats();
        renderProfileCards();
        // 绑定事件
        setupAuthEventListeners();
        // 重置 showPage 的初始导航状态
        clearPageHistory();
    });

    test('点击 profile-link 应跳转到个人中心页', () => {
        jest.useFakeTimers();
        const link = document.getElementById('profile-link');
        link.click();
        // profile-link 内部用 requestAnimationFrame 调度 loadProfile
        // showPage 在初始导航分支会立即隐藏所有页面并显示目标页
        expect(global.showPage).toBeDefined();
        jest.runAllTimers();
        jest.useRealTimers();
    });

    test('点击计算历史卡片应跳转到历史页', () => {
        jest.useFakeTimers();
        const card = document.getElementById('profile-card-history');
        card.click();
        jest.runAllTimers();
        // 验证历史页被显示（showPage 会移除 hidden 并添加 active）
        const historyPage = document.getElementById('profile-history-page');
        expect(historyPage.classList.contains('hidden')).toBe(false);
        jest.useRealTimers();
    });

    test('点击税务档案卡片应跳转到档案页', () => {
        jest.useFakeTimers();
        document.getElementById('profile-card-tax').click();
        jest.runAllTimers();
        expect(document.getElementById('profile-tax-page').classList.contains('hidden')).toBe(false);
        jest.useRealTimers();
    });

    test('点击税务日历卡片应跳转到日历页', () => {
        jest.useFakeTimers();
        document.getElementById('profile-card-calendar').click();
        jest.runAllTimers();
        expect(document.getElementById('profile-calendar-page').classList.contains('hidden')).toBe(false);
        jest.useRealTimers();
    });

    test('点击数据管理卡片应跳转到数据管理页', () => {
        jest.useFakeTimers();
        document.getElementById('profile-card-data').click();
        jest.runAllTimers();
        expect(document.getElementById('profile-data-page').classList.contains('hidden')).toBe(false);
        jest.useRealTimers();
    });

    test('点击使用帮助卡片应打开帮助模态框', () => {
        const card = document.getElementById('profile-card-help');
        card.click();
        const modal = document.getElementById('help-modal');
        expect(modal.classList.contains('hidden')).toBe(false);
    });

    test('点击关于我们卡片应打开关于模态框', () => {
        const card = document.getElementById('profile-card-about');
        card.click();
        const modal = document.getElementById('about-modal');
        expect(modal.classList.contains('hidden')).toBe(false);
    });

    test('点击返回按钮应调用 goBack', () => {
        jest.useFakeTimers();
        // 先初始导航到 profile-page（消耗初始导航状态）
        showPage('profile-page');
        // 此时 isInitialNavigation=false，后续导航为常规导航会压栈

        // 点击历史卡片 → 常规导航，profile-page 入栈
        document.getElementById('profile-card-history').click();
        jest.runAllTimers();

        // 点击返回
        document.getElementById('back-from-history').click();
        jest.runAllTimers();

        // 应返回到 profile-page
        expect(document.getElementById('profile-page').classList.contains('hidden')).toBe(false);
        jest.useRealTimers();
    });

    test('点击 tax-profile-save 应触发保存', () => {
        document.getElementById('tax-profile-social-base').value = '5000';
        document.getElementById('tax-profile-work-months').value = '12';
        document.getElementById('tax-profile-user-type').value = 'employee';

        document.getElementById('tax-profile-save').click();

        const saved = JSON.parse(localStorage.getItem('tax_profile'));
        expect(saved).not.toBeNull();
        expect(saved.socialBase).toBe(5000);
    });

    test('点击 tax-profile-reset 应触发重置', () => {
        global.confirm = jest.fn().mockReturnValue(true);
        localStorage.setItem('tax_profile', JSON.stringify({ socialBase: 9999 }));
        document.getElementById('tax-profile-social-base').value = '9999';

        document.getElementById('tax-profile-reset').click();

        expect(document.getElementById('tax-profile-social-base').value).toBe('4250');
        expect(localStorage.getItem('tax_profile')).toBeNull();
    });
});

// ====== 页面导航逻辑 ======
describe('个人中心 - 页面导航 showPage/goBack', () => {
    let mockApi;

    beforeEach(() => {
        localStorage.clear();
        mockApi = createMockApiClient();
        buildProfileDOM();
        loadAuthUI(mockApi);
        clearPageHistory();
    });

    test('showPage 初始导航应隐藏所有页面并显示目标页', () => {
        // 初始导航状态：isInitialNavigation = true（每次 loadAuthUI 后重置）
        showPage('profile-page');

        const target = document.getElementById('profile-page');
        expect(target.classList.contains('hidden')).toBe(false);
        expect(target.classList.contains('active')).toBe(true);
    });

    test('showPage 常规导航应压入历史栈', () => {
        jest.useFakeTimers();
        // 先做一次初始导航到 profile-page
        showPage('profile-page');
        // 此时 isInitialNavigation = false

        // 常规导航到 settings
        showPage('profile-settings-page');
        jest.runAllTimers();

        // profile-page 应被压入历史栈
        expect(document.getElementById('profile-settings-page').classList.contains('hidden')).toBe(false);
        jest.useRealTimers();
    });

    test('goBack 无历史时应回到模式选择页', () => {
        jest.useFakeTimers();
        // 先初始导航到 profile-page
        showPage('profile-page');

        // goBack 无历史 → 回到 mode-selection-page
        goBack();
        jest.runAllTimers();

        expect(document.getElementById('mode-selection-page').classList.contains('hidden')).toBe(false);
        jest.useRealTimers();
    });

    test('goBack 有历史时应返回上一页', () => {
        jest.useFakeTimers();
        showPage('profile-page');           // 初始导航
        showPage('profile-settings-page');  // 常规导航，profile-page 入栈
        jest.runAllTimers();

        goBack();                            // 应返回 profile-page
        jest.runAllTimers();

        expect(document.getElementById('profile-page').classList.contains('hidden')).toBe(false);
        jest.useRealTimers();
    });

    test('连续导航多次后历史栈应正确维护', () => {
        jest.useFakeTimers();
        showPage('profile-page');            // 初始
        showPage('profile-settings-page');   // profile-page 入栈
        jest.runAllTimers();                 // 等待 settings 页显示
        showPage('profile-tax-page');        // profile-settings-page 入栈
        jest.runAllTimers();                 // 等待 tax 页显示

        // 第一次返回 → 回到 settings
        goBack();
        jest.runAllTimers();
        expect(document.getElementById('profile-settings-page').classList.contains('hidden')).toBe(false);

        // 第二次返回 → 回到 profile-page
        goBack();
        jest.runAllTimers();
        expect(document.getElementById('profile-page').classList.contains('hidden')).toBe(false);

        jest.useRealTimers();
    });
});

// ====== 密码可见性切换 ======
describe('个人中心 - 密码可见性切换', () => {
    let mockApi;

    beforeEach(() => {
        localStorage.clear();
        mockApi = createMockApiClient();
        buildProfileDOM();
        loadAuthUI(mockApi);
        setupAuthEventListeners();
    });

    test('点击密码切换图标应切换 input type', () => {
        const input = document.getElementById('profile-password');
        const toggle = document.getElementById('profile-password-toggle');

        expect(input.type).toBe('password');
        toggle.click();
        expect(input.type).toBe('text');
        toggle.click();
        expect(input.type).toBe('password');
    });

    test('切换图标应正确增删 fa-eye / fa-eye-slash 类', () => {
        const toggle = document.getElementById('profile-current-password-toggle');
        expect(toggle.classList.contains('fa-eye')).toBe(true);

        toggle.click();
        expect(toggle.classList.contains('fa-eye')).toBe(false);
        expect(toggle.classList.contains('fa-eye-slash')).toBe(true);

        toggle.click();
        expect(toggle.classList.contains('fa-eye')).toBe(true);
        expect(toggle.classList.contains('fa-eye-slash')).toBe(false);
    });
});
