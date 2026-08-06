import apiClient from '../api/api-client.js';

function showLoginModal() {
    openModal(document.getElementById('login-modal'));
    closeModal(document.getElementById('register-modal'));
}

function hideLoginModal() {
    closeModal(document.getElementById('login-modal'));
    document.getElementById('login-email').value = '';
    document.getElementById('login-password').value = '';
}

function showRegisterModal() {
    openModal(document.getElementById('register-modal'));
    closeModal(document.getElementById('login-modal'));
}

function hideRegisterModal() {
    closeModal(document.getElementById('register-modal'));
    document.getElementById('register-username').value = '';
    document.getElementById('register-email').value = '';
    document.getElementById('register-phone').value = '';
    document.getElementById('register-password').value = '';
    document.getElementById('register-confirm-password').value = '';
}

function showApp() {
    document.getElementById('login-page').classList.add('hidden');
    document.getElementById('app-container').classList.remove('hidden');
}

function showLoginPage() {
    document.getElementById('app-container').classList.add('hidden');
    document.getElementById('login-page').classList.remove('hidden');
}

function updateAuthUI() {
    if (apiClient.isLoggedIn()) {
        showApp();
        const user = apiClient.getCurrentUser();
        document.getElementById('auth-section').classList.add('hidden');
        document.getElementById('user-menu').classList.remove('hidden');
        document.getElementById('user-name').textContent = user?.username || '用户';
    } else {
        showLoginPage();
        document.getElementById('auth-section').classList.remove('hidden');
        document.getElementById('user-menu').classList.add('hidden');
    }
}

function setLoading(btn, loading) {
    if (!btn) return;
    const originalText = btn.dataset.originalText || btn.textContent;
    if (!btn.dataset.originalText) {
        btn.dataset.originalText = originalText;
    }
    
    if (loading) {
        btn.disabled = true;
        btn.innerHTML = `<span class="loading-spinner inline-block w-4 h-4 mr-2"></span>处理中...`;
    } else {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

async function handleLogin() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const btn = document.getElementById('login-submit');
    
    if (!email || !password) {
        showAlert('请填写邮箱和密码');
        return;
    }
    
    try {
        setLoading(btn, true);
        await apiClient.loginUser(email, password);
        clearPageHistory();
        updateAuthUI();
        hideLoginModal();
        showAlert('登录成功', 'success');
    } catch (error) {
        showAlert('登录失败: ' + error.message);
    } finally {
        setLoading(btn, false);
    }
}

async function handleQuickLogin() {
    const email = 'dev@example.com';
    const password = 'password';
    
    document.getElementById('login-email').value = email;
    document.getElementById('login-password').value = password;
    
    try {
        await apiClient.loginUser(email, password);
        updateAuthUI();
        showAlert('快速登录成功', 'success');
    } catch (error) {
        showAlert('快速登录失败: ' + error.message);
    }
}

async function handleRegister() {
    const username = document.getElementById('register-username').value;
    const email = document.getElementById('register-email').value;
    const phone = document.getElementById('register-phone').value;
    const password = document.getElementById('register-password').value;
    const confirmPassword = document.getElementById('register-confirm-password').value;
    const btn = document.getElementById('register-submit');
    
    if (!username || !email || !password) {
        showAlert('请填写用户名、邮箱和密码');
        return;
    }
    
    if (password !== confirmPassword) {
        showAlert('两次输入的密码不一致');
        return;
    }
    
    if (password.length < 6) {
        showAlert('密码长度至少6位');
        return;
    }
    
    try {
        setLoading(btn, true);
        await apiClient.registerUser(username, email, password, phone || null);
        showAlert('注册成功，请登录', 'success');
        document.getElementById('login-tab').click();
        document.getElementById('register-username').value = '';
        document.getElementById('register-email').value = '';
        document.getElementById('register-phone').value = '';
        document.getElementById('register-password').value = '';
        document.getElementById('register-confirm-password').value = '';
        document.getElementById('login-email').value = email;
    } catch (error) {
        showAlert('注册失败: ' + error.message);
    } finally {
        setLoading(btn, false);
    }
}

async function handleLogout() {
    apiClient.logoutUser();
    updateAuthUI();
    showAlert('已退出登录', 'success');
    showPage('mode-selection-page');
}

// === 个人中心性能日志工具 ===
const ProfilePerf = {
    log(action, durationMs, extra = {}) {
        const now = new Date();
        const time = now.toISOString().split('T')[1].split('.')[0];
        const ts = now.getTime();
        console.log(
            `%c[EuriskoTax Profile ${time}]`,
            'color: #7c3aed; font-weight: bold;',
            `${action} → ${durationMs.toFixed(2)}ms`,
            { timestamp: ts, ...extra }
        );
    },
    measure(action, fn, extra = {}) {
        const start = performance.now();
        const result = fn();
        const duration = performance.now() - start;
        this.log(action, duration, extra);
        return result;
    },
    async measureAsync(action, fn, extra = {}) {
        const start = performance.now();
        const result = await fn();
        const duration = performance.now() - start;
        this.log(action, duration, extra);
        return result;
    },
    // 测量多个子步骤并汇总
    measureSteps(action, steps, extra = {}) {
        const totalStart = performance.now();
        const timings = {};
        for (const [name, fn] of steps) {
            const s = performance.now();
            fn();
            timings[name] = +(performance.now() - s).toFixed(2);
        }
        const total = +(performance.now() - totalStart).toFixed(2);
        this.log(action, total, { steps: timings, ...extra });
        return timings;
    }
};

async function loadProfile() {
    const totalStart = performance.now();
    try {
        const user = await ProfilePerf.measureAsync('loadProfile → API获取用户信息', () => apiClient.getProfile());
        document.getElementById('profile-username').value = user.username;
        document.getElementById('profile-email').value = user.email;
        document.getElementById('profile-phone').value = user.phone || '';
        document.getElementById('profile-display-name').textContent = user.username;
        document.getElementById('profile-display-email').textContent = user.email;

        ProfilePerf.measure('loadProfile → 渲染统计卡片', renderProfileStats);
        ProfilePerf.measure('loadProfile → 更新统计数据', updateProfileStats);
        ProfilePerf.measure('loadProfile → 渲染模块卡片', renderProfileCards);
        ProfilePerf.measure('loadProfile → 加载税务档案', loadTaxProfile);
        ProfilePerf.measure('loadProfile → 渲染税务日历', renderTaxCalendar);

        const totalDuration = performance.now() - totalStart;
        ProfilePerf.log('loadProfile → 总耗时', totalDuration, { user: user.username });
    } catch (error) {
        showAlert('加载失败: ' + error.message);
        ProfilePerf.log('loadProfile → 错误', performance.now() - totalStart, { error: error.message });
    }
}

// === 个人中心统计卡片配置 ===
const PROFILE_STATS_CONFIG = [
    { id: 'profile-stats-calculations', icon: 'fa-calculator', color: 'blue', label: '计算次数' },
    { id: 'profile-stats-profiles', icon: 'fa-file-text-o', color: 'green', label: '档案数量' },
    { id: 'profile-stats-history', icon: 'fa-history', color: 'purple', label: '历史记录' },
    { id: 'profile-stats-reminders', icon: 'fa-calendar-check-o', color: 'orange', label: '本月提醒' }
];

// 渲染统计卡片
function renderProfileStats() {
    const grid = document.getElementById('profile-stats-grid');
    if (!grid || grid.children.length > 0) return; // 已渲染则跳过

    grid.innerHTML = PROFILE_STATS_CONFIG.map(({ id, icon, color, label }) => `
        <div class="bg-gradient-to-br from-${color}-50 to-${color}-100 rounded-xl p-4 border border-${color}-200">
            <div class="flex items-center">
                <div class="w-10 h-10 bg-${color}-500 rounded-lg flex items-center justify-center mr-3">
                    <i class="fa ${icon} text-white"></i>
                </div>
                <div>
                    <p class="text-sm text-${color}-600 font-medium">${label}</p>
                    <p id="${id}" class="text-2xl font-bold text-${color}-800">0</p>
                </div>
            </div>
        </div>
    `).join('');
}

// === 个人中心功能模块卡片配置 ===
const PROFILE_CARDS_CONFIG = [
    { id: 'profile-card-history', icon: 'fa-history', color: 'blue', title: '计算历史', desc: '查看和管理您的计算记录' },
    { id: 'profile-card-tax', icon: 'fa-file-text-o', color: 'green', title: '税务档案', desc: '设置常用扣除配置，快速应用' },
    { id: 'profile-card-data', icon: 'fa-database', color: 'purple', title: '数据管理', desc: '导出计算数据，备份与迁移' },
    { id: 'profile-card-calendar', icon: 'fa-calendar', color: 'orange', title: '税务日历', desc: '关键时间节点提醒' },
    { id: 'profile-card-help', icon: 'fa-question-circle', color: 'gray', title: '使用帮助', desc: '了解如何使用本工具' },
    { id: 'profile-card-about', icon: 'fa-info-circle', color: 'indigo', title: '关于我们', desc: '了解更多信息' }
];

// 渲染功能模块卡片
function renderProfileCards() {
    const grid = document.getElementById('profile-cards-grid');
    if (!grid || grid.children.length > 0) return; // 已渲染则跳过

    grid.innerHTML = PROFILE_CARDS_CONFIG.map(({ id, icon, color, title, desc }) => `
        <div class="card cursor-pointer profile-card-hover" id="${id}">
            <div class="p-6">
                <div class="w-12 h-12 rounded-lg bg-${color}-100 flex items-center justify-center mb-4">
                    <i class="fa ${icon} text-2xl text-${color}-600"></i>
                </div>
                <h3 class="text-lg font-semibold text-gray-800 mb-2">${title}</h3>
                <p class="text-sm text-gray-500">${desc}</p>
            </div>
        </div>
    `).join('');
}

function updateProfileStats() {
    const history = JSON.parse(localStorage.getItem('calculation_history') || '[]');
    const taxProfile = localStorage.getItem('tax_profile');

    document.getElementById('profile-stats-calculations').textContent = history.length;
    document.getElementById('profile-stats-history').textContent = history.length;
    document.getElementById('profile-stats-profiles').textContent = taxProfile ? 1 : 0;
    document.getElementById('profile-stats-reminders').textContent = getMonthlyReminders();
}

function getMonthlyReminders() {
    const today = new Date();
    const month = today.getMonth() + 1;
    const reminders = [];
    
    if (month >= 3 && month <= 6) reminders.push('综合所得汇算');
    if (month >= 1 && month <= 3) reminders.push('经营所得汇算');
    if (month === 1 || month === 4 || month === 7 || month === 10) reminders.push('季度申报');
    
    return reminders.length;
}

async function loadProfileSettings() {
    await loadProfile();
}

function loadProfileTax() {
    loadTaxProfile();
}

function loadProfileCalendar() {
    renderTaxCalendar();
}

const TAX_PROFILE_KEY = 'tax_profile';

function getDefaultTaxProfile() {
    return {
        socialBase: 4250,
        housingBase: 4250,
        children: 0,
        elderly: 0,
        rent: 0,
        housingLoan: 0,
        education: 0,
        pension: 0,
        workMonths: 12,
        userType: 'employee'
    };
}

function loadTaxProfile() {
    try {
        const saved = JSON.parse(localStorage.getItem(TAX_PROFILE_KEY) || 'null');
        const profile = { ...getDefaultTaxProfile(), ...(saved || {}) };
        document.getElementById('tax-profile-social-base').value = profile.socialBase;
        document.getElementById('tax-profile-housing-base').value = profile.housingBase;
        document.getElementById('tax-profile-children').value = profile.children;
        document.getElementById('tax-profile-elderly').value = profile.elderly;
        document.getElementById('tax-profile-rent').value = profile.rent;
        document.getElementById('tax-profile-housing-loan').value = profile.housingLoan;
        document.getElementById('tax-profile-education').value = profile.education;
        document.getElementById('tax-profile-pension').value = profile.pension;
        document.getElementById('tax-profile-work-months').value = profile.workMonths;
        document.getElementById('tax-profile-user-type').value = profile.userType;
    } catch (e) {
        console.error('Failed to load tax profile:', e);
    }
}

function saveTaxProfile() {
    const profile = {
        socialBase: parseFloat(document.getElementById('tax-profile-social-base').value) || 0,
        housingBase: parseFloat(document.getElementById('tax-profile-housing-base').value) || 0,
        children: parseFloat(document.getElementById('tax-profile-children').value) || 0,
        elderly: parseFloat(document.getElementById('tax-profile-elderly').value) || 0,
        rent: parseFloat(document.getElementById('tax-profile-rent').value) || 0,
        housingLoan: parseFloat(document.getElementById('tax-profile-housing-loan').value) || 0,
        education: parseFloat(document.getElementById('tax-profile-education').value) || 0,
        pension: parseFloat(document.getElementById('tax-profile-pension').value) || 0,
        workMonths: parseInt(document.getElementById('tax-profile-work-months').value) || 12,
        userType: document.getElementById('tax-profile-user-type').value
    };
    
    if (profile.workMonths < 1 || profile.workMonths > 12) {
        showAlert('工作月数应在 1-12 之间');
        return;
    }
    if (profile.pension > 12000) {
        showAlert('个人养老金年度上限为 12000 元');
        return;
    }
    if (profile.socialBase < 0 || profile.housingBase < 0) {
        showAlert('基数不能为负数');
        return;
    }
    
    localStorage.setItem(TAX_PROFILE_KEY, JSON.stringify(profile));
    showAlert('税务档案已保存', 'success');
}

function resetTaxProfile() {
    const confirmed = confirm('确定要重置税务档案为默认值吗？');
    if (!confirmed) return;
    
    const defaults = getDefaultTaxProfile();
    document.getElementById('tax-profile-social-base').value = defaults.socialBase;
    document.getElementById('tax-profile-housing-base').value = defaults.housingBase;
    document.getElementById('tax-profile-children').value = defaults.children;
    document.getElementById('tax-profile-elderly').value = defaults.elderly;
    document.getElementById('tax-profile-rent').value = defaults.rent;
    document.getElementById('tax-profile-housing-loan').value = defaults.housingLoan;
    document.getElementById('tax-profile-education').value = defaults.education;
    document.getElementById('tax-profile-pension').value = defaults.pension;
    document.getElementById('tax-profile-work-months').value = defaults.workMonths;
    document.getElementById('tax-profile-user-type').value = defaults.userType;
    localStorage.removeItem(TAX_PROFILE_KEY);
    showAlert('税务档案已重置为默认值', 'success');
}

function renderTaxCalendar() {
    const listEl = document.getElementById('tax-calendar-list');
    if (!listEl) {
        return;
    }
    
    const now = new Date();
    const year = now.getFullYear();
    const nextYear = year + 1;

    const events = [
        {
            title: '经营所得年度汇算清缴',
            period: `${nextYear}年1月1日 - ${nextYear}年3月31日`,
            description: '个体工商户、个人独资企业、合伙企业投资者需在此期间完成经营所得汇算清缴',
            start: new Date(`${nextYear}-01-01`),
            end: new Date(`${nextYear}-03-31`)
        },
        {
            title: '综合所得年度汇算清缴',
            period: `${nextYear}年3月1日 - ${nextYear}年6月30日`,
            description: '居民个人需在此期间完成综合所得年度汇算清缴，多退少补',
            start: new Date(`${nextYear}-03-01`),
            end: new Date(`${nextYear}-06-30`)
        },
        {
            title: '经营所得减半征收优惠政策',
            period: '2023年1月1日 - 2027年12月31日',
            description: '年应纳税所得额≤2,000,000元的部分减按50%计入应纳税所得额',
            start: new Date('2023-01-01'),
            end: new Date('2027-12-31')
        }
    ];

    let badgeClass = 'bg-gray-100 text-gray-700';
    let statusText = '已结束';
    let statusIcon = 'fa-times-circle';
    
    const sortedEvents = events.map(event => {
        if (now < event.start) {
            badgeClass = 'bg-yellow-100 text-yellow-700';
            statusText = '即将开始';
            statusIcon = 'fa-hourglass-half';
        } else if (now >= event.start && now <= event.end) {
            badgeClass = 'bg-green-100 text-green-700';
            statusText = '进行中';
            statusIcon = 'fa-check-circle';
        }
        return {
            ...event,
            badgeClass,
            statusText,
            statusIcon
        };
    }).sort((a, b) => a.start - b.start);

    listEl.innerHTML = sortedEvents.map(event => `
        <div class="border border-gray-200 rounded-lg p-4 profile-card-hover">
            <div class="flex items-start justify-between mb-2">
                <h4 class="font-semibold text-gray-800">${event.title}</h4>
                <span class="${event.badgeClass} px-2 py-0.5 rounded text-xs">
                    <i class="fa ${event.statusIcon} mr-1"></i>${event.statusText}
                </span>
            </div>
            <p class="text-sm text-gray-600 mb-2"><i class="fa fa-calendar-o mr-2"></i>${event.period}</p>
            <p class="text-xs text-gray-500">${event.description}</p>
        </div>
    `).join('');
}

let historyCache = {
    data: null,
    timestamp: 0
};

async function getHistoryData(forceRefresh = false) {
    const cacheExpire = 5 * 60 * 1000;
    if (!forceRefresh && historyCache.data && Date.now() - historyCache.timestamp < cacheExpire) {
        return historyCache.data;
    }
    
    const history = await apiClient.getCalculationHistory();
    historyCache = {
        data: history,
        timestamp: Date.now()
    };
    return history;
}

async function exportData(format) {
    const btn = format === 'json' ? document.getElementById('export-json-btn') : document.getElementById('export-csv-btn');
    
    try {
        setLoading(btn, true);
        const history = await getHistoryData(true);
        
        if (history.length === 0) {
            showAlert('暂无计算历史可导出');
            return;
        }

        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        let content, mimeType, extension;

        if (format === 'json') {
            content = JSON.stringify({
                exported_at: new Date().toISOString(),
                user: apiClient.getCurrentUser(),
                records: history
            }, null, 2);
            mimeType = 'application/json';
            extension = 'json';
        } else if (format === 'csv') {
            const rows = [['ID', '类型', '创建时间', '税额合计', '税前收入', '税后收入']];
            const typeNames = {
                comprehensive: '综合所得',
                business: '经营所得',
                classification: '分类所得',
                reverse: '反向倒算'
            };
            
            history.forEach(item => {
                const tax = item.result_data?.taxDetails?.totalTax || item.result_data?.totalTax || 0;
                const income = item.result_data?.taxDetails?.totalIncome || item.result_data?.totalIncome || 0;
                const netIncome = item.result_data?.taxDetails?.netIncome || item.result_data?.netIncome || 0;
                rows.push([
                    item.id,
                    `"${typeNames[item.type] || item.type}"`,
                    `"${new Date(item.created_at).toLocaleString('zh-CN')}"`,
                    tax,
                    income,
                    netIncome
                ].join(','));
            });
            
            content = '\uFEFF' + rows.join('\n');
            mimeType = 'text/csv;charset=utf-8';
            extension = 'csv';
        } else {
            return;
        }

        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `euriskotax-export-${timestamp}.${extension}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showAlert(`已导出 ${history.length} 条记录`, 'success');
    } catch (error) {
        showAlert('导出失败: ' + error.message);
    } finally {
        setLoading(btn, false);
    }
}

async function saveProfile() {
    const phone = document.getElementById('profile-phone').value;
    const currentPassword = document.getElementById('profile-current-password').value;
    const password = document.getElementById('profile-password').value;
    const confirmPassword = document.getElementById('profile-confirm-password').value;
    const btn = document.getElementById('profile-save');
    
    if (password || confirmPassword) {
        if (!currentPassword) {
            showAlert('请输入当前密码以验证身份');
            return;
        }
        
        if (password !== confirmPassword) {
            showAlert('两次输入的新密码不一致');
            return;
        }
        
        if (password.length < 6) {
            showAlert('新密码长度至少6位');
            return;
        }
    }
    
    if (phone && !/^1[3-9]\d{9}$/.test(phone)) {
        showAlert('请输入有效的手机号');
        return;
    }
    
    const updateData = {};
    if (phone) updateData.phone = phone;
    if (password) {
        updateData.password = password;
        updateData.currentPassword = currentPassword;
    }
    
    if (Object.keys(updateData).length === 0) {
        showAlert('请修改至少一项信息');
        return;
    }
    
    try {
        setLoading(btn, true);
        const updatedUser = await apiClient.updateProfile(updateData);
        showAlert('修改成功', 'success');
        document.getElementById('profile-current-password').value = '';
        document.getElementById('profile-password').value = '';
        document.getElementById('profile-confirm-password').value = '';
        document.getElementById('profile-display-name').textContent = updatedUser.username;
        document.getElementById('profile-display-email').textContent = updatedUser.email;
        updateAuthUI();
    } catch (error) {
        showAlert('修改失败: ' + error.message);
    } finally {
        setLoading(btn, false);
    }
}

async function deleteAccount() {
    const confirmed = confirm('警告：注销账号将永久删除您的账户及所有计算历史记录，且无法恢复！\n\n确定要继续注销账号吗？');
    if (!confirmed) return;

    const secondConfirm = prompt('请输入您的邮箱以确认注销账号：');
    const currentUser = apiClient.getCurrentUser();
    if (secondConfirm !== currentUser?.email) {
        showAlert('邮箱不匹配，已取消注销');
        return;
    }

    try {
        await apiClient.deleteProfile();
        showAlert('账号已注销', 'success');
        updateAuthUI();
    } catch (error) {
        showAlert('注销失败: ' + error.message);
    }
}

function resetProfileForm() {
    document.getElementById('profile-phone').value = '';
    document.getElementById('profile-current-password').value = '';
    document.getElementById('profile-password').value = '';
    document.getElementById('profile-confirm-password').value = '';
    loadProfile();
}

function renderHistoryItems(history, listElement) {
    const fragment = document.createDocumentFragment();
    
    history.forEach(item => {
        const card = document.createElement('div');
        card.className = 'card profile-card-hover';
        card.innerHTML = `
            <div class="flex justify-between items-start">
                <div>
                    <div class="font-medium text-gray-800">${getCalculationTypeName(item.type)}</div>
                    <div class="text-sm text-gray-500">${formatDate(item.created_at)}</div>
                </div>
                <div class="text-right">
                    <div class="font-bold text-primary">¥${formatAmount(item.result_data?.taxDetails?.totalTax || item.result_data?.totalTax || 0)}</div>
                </div>
            </div>
            <button onclick="deleteHistoryItem(${item.id})" class="mt-3 text-sm text-danger hover:underline">删除</button>
        `;
        fragment.appendChild(card);
    });
    
    listElement.innerHTML = '';
    listElement.appendChild(fragment);
}

// 通用历史记录加载函数（合并原 loadHistory 和 loadProfileHistory）
async function loadHistoryToList(listId, emptyId) {
    const historyList = document.getElementById(listId);
    const historyEmpty = document.getElementById(emptyId);

    try {
        const history = await getHistoryData();

        if (history.length === 0) {
            if (historyEmpty) historyEmpty.classList.remove('hidden');
            return;
        }

        if (historyEmpty) historyEmpty.classList.add('hidden');
        renderHistoryItems(history, historyList);
    } catch (error) {
        showAlert('加载失败: ' + error.message);
    }
}

async function loadHistory() {
    return loadHistoryToList('history-list', 'history-empty');
}

async function loadProfileHistory() {
    return loadHistoryToList('profile-history-list', 'profile-history-empty');
}

function getCalculationTypeName(type) {
    const types = {
        comprehensive: '综合所得计税',
        business: '经营所得计税',
        classification: '分类所得计税',
        reverse: '反向倒算'
    };
    return types[type] || type;
}

function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

function formatAmount(amount) {
    const num = parseFloat(amount) || 0;
    return num.toFixed(2);
}

async function deleteHistoryItem(id) {
    if (!confirm('确定要删除这条记录吗？')) return;
    
    try {
        await apiClient.deleteCalculation(id);
        historyCache = { data: null, timestamp: 0 };
        loadHistory();
        loadProfileHistory();
        showAlert('删除成功', 'success');
    } catch (error) {
        showAlert('删除失败: ' + error.message);
    }
}

function togglePasswordVisibility(inputId, toggleId) {
    const input = document.getElementById(inputId);
    const toggle = document.getElementById(toggleId);
    
    if (input.type === 'password') {
        input.type = 'text';
        toggle.classList.remove('fa-eye');
        toggle.classList.add('fa-eye-slash');
    } else {
        input.type = 'password';
        toggle.classList.remove('fa-eye-slash');
        toggle.classList.add('fa-eye');
    }
}

function setupAuthEventListeners() {
    document.getElementById('login-tab').addEventListener('click', () => {
        document.getElementById('login-tab').classList.add('border-primary', 'text-primary');
        document.getElementById('login-tab').classList.remove('border-transparent', 'text-gray-500');
        document.getElementById('register-tab').classList.add('border-transparent', 'text-gray-500');
        document.getElementById('register-tab').classList.remove('border-primary', 'text-primary');
        document.getElementById('login-form').classList.remove('hidden');
        document.getElementById('register-form').classList.add('hidden');
    });
    
    document.getElementById('register-tab').addEventListener('click', () => {
        document.getElementById('register-tab').classList.add('border-primary', 'text-primary');
        document.getElementById('register-tab').classList.remove('border-transparent', 'text-gray-500');
        document.getElementById('login-tab').classList.add('border-transparent', 'text-gray-500');
        document.getElementById('login-tab').classList.remove('border-primary', 'text-primary');
        document.getElementById('register-form').classList.remove('hidden');
        document.getElementById('login-form').classList.add('hidden');
    });
    
    document.getElementById('login-submit').addEventListener('click', handleLogin);
    document.getElementById('quick-login-btn').addEventListener('click', handleQuickLogin);
    document.getElementById('register-submit').addEventListener('click', handleRegister);
    document.getElementById('profile-link').addEventListener('click', (e) => {
        e.preventDefault();
        const eventTime = Date.now();
        loadProfile();
        const showPageStart = performance.now();
        showPage('profile-page');
        const showPageDuration = performance.now() - showPageStart;
        ProfilePerf.log('进入个人中心 → showPage', showPageDuration, { eventTime });
    });
    document.getElementById('logout-link').addEventListener('click', (e) => {
        e.preventDefault();
        handleLogout();
    });

    // === 通用返回按钮绑定（所有 back-from-* 按钮统一调用 goBack） ===
    document.querySelectorAll('[id^="back-from-"]').forEach(btn => {
        btn.addEventListener('click', () => {
            const eventTime = Date.now();
            const fromPage = btn.closest('.page')?.id || 'unknown';
            const steps = [['goBack', goBack]];
            ProfilePerf.measureSteps('返回按钮点击', steps, {
                from: fromPage,
                buttonId: btn.id,
                eventTime
            });
        });
    });

    document.getElementById('profile-save').addEventListener('click', saveProfile);
    document.getElementById('profile-cancel').addEventListener('click', resetProfileForm);
    document.getElementById('profile-logout-link').addEventListener('click', (e) => {
        e.preventDefault();
        handleLogout();
    });
    document.getElementById('profile-delete-account').addEventListener('click', (e) => {
        e.preventDefault();
        deleteAccount();
    });

    document.getElementById('tax-profile-save').addEventListener('click', saveTaxProfile);
    document.getElementById('tax-profile-reset').addEventListener('click', resetTaxProfile);

    document.getElementById('export-json-btn').addEventListener('click', () => exportData('json'));
    document.getElementById('export-csv-btn').addEventListener('click', () => exportData('csv'));

    // === 通用个人中心卡片点击处理（事件委托，支持动态生成的卡片） ===
    // 配置: { 卡片ID, 目标页面ID, 加载函数(可选), 特殊处理(可选) }
    const profileCardConfigs = [
        { cardId: 'profile-card-history', pageId: 'profile-history-page', loadFn: loadProfileHistory },
        { cardId: 'profile-card-tax', pageId: 'profile-tax-page', loadFn: loadProfileTax },
        { cardId: 'profile-card-data', pageId: 'profile-data-page' },
        { cardId: 'profile-card-calendar', pageId: 'profile-calendar-page', loadFn: loadProfileCalendar },
        { cardId: 'profile-card-help', specialFn: () => {
            const modal = document.getElementById('help-modal');
            modal.classList.remove('hidden');
            setTimeout(() => {
                modal.classList.remove('opacity-0');
                modal.querySelector('div').classList.remove('scale-95');
            }, 10);
        }},
        { cardId: 'profile-card-about', specialFn: () => openModal(document.getElementById('about-modal')) }
    ];

    const profileCardsGrid = document.getElementById('profile-cards-grid');
    if (profileCardsGrid) {
        profileCardsGrid.addEventListener('click', (e) => {
            const card = e.target.closest('[id^="profile-card-"]');
            if (!card) return;
            const config = profileCardConfigs.find(c => c.cardId === card.id);
            if (!config) return;
            const eventTime = Date.now();
            if (config.specialFn) {
                ProfilePerf.measure('卡片点击 → 特殊处理', config.specialFn, {
                    cardId: card.id, target: 'modal', eventTime
                });
            } else {
                const steps = [];
                if (config.loadFn) steps.push(['loadFn', config.loadFn]);
                if (config.pageId) steps.push(['showPage', () => showPage(config.pageId)]);
                ProfilePerf.measureSteps('卡片点击', steps, {
                    cardId: card.id,
                    target: config.pageId || 'unknown',
                    hasLoadFn: !!config.loadFn,
                    eventTime
                });
            }
        });
    }

    document.getElementById('profile-nav-settings').addEventListener('click', (e) => {
        e.preventDefault();
        const eventTime = Date.now();
        ProfilePerf.measureSteps('导航 → 账户设置', [
            ['loadProfileSettings', () => loadProfileSettings()],
            ['showPage', () => showPage('profile-settings-page')]
        ], { eventTime });
    });

    document.getElementById('user-btn').addEventListener('click', () => {
        document.getElementById('user-dropdown').classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('#user-menu')) {
            document.getElementById('user-dropdown').classList.add('hidden');
        }
    });
    
    const passwordToggleIds = [
        { input: 'login-password', toggle: 'login-password-toggle' },
        { input: 'register-password', toggle: 'register-password-toggle' },
        { input: 'register-confirm-password', toggle: 'register-confirm-password-toggle' },
        { input: 'profile-current-password', toggle: 'profile-current-password-toggle' },
        { input: 'profile-password', toggle: 'profile-password-toggle' },
        { input: 'profile-confirm-password', toggle: 'profile-confirm-password-toggle' }
    ];
    
    passwordToggleIds.forEach(({ input, toggle }) => {
        const toggleEl = document.getElementById(toggle);
        if (toggleEl) {
            toggleEl.addEventListener('click', () => togglePasswordVisibility(input, toggle));
        }
    });
}

function showAlert(message, type = 'error', callback) {
    const modal = document.getElementById('alert-modal');
    const iconDiv = document.getElementById('alert-modal-icon');
    const iconI = document.getElementById('alert-modal-icon-i');
    const title = document.getElementById('alert-modal-title');
    const msg = document.getElementById('alert-modal-message');
    const okButton = document.getElementById('alert-modal-ok');
    const closeButton = document.getElementById('close-alert-modal');
    
    const typeConfig = {
        success: { icon: 'fa-check-circle', bg: 'bg-green-100', color: 'text-green-600', title: '操作成功' },
        warning: { icon: 'fa-exclamation-triangle', bg: 'bg-amber-100', color: 'text-amber-600', title: '警告' },
        error: { icon: 'fa-times-circle', bg: 'bg-red-100', color: 'text-red-600', title: '操作失败' },
        info: { icon: 'fa-info-circle', bg: 'bg-blue-100', color: 'text-blue-600', title: '提示' }
    };
    
    const config = typeConfig[type] || typeConfig.info;
    
    iconDiv.className = `w-10 h-10 ${config.bg} rounded-full flex items-center justify-center mr-3`;
    iconI.className = `fa ${config.icon} ${config.color}`;
    title.textContent = config.title;
    msg.textContent = message;
    
    openModal(modal);
    
    function handleOk() {
        closeModal(modal);
        if (callback) callback();
        okButton.removeEventListener('click', handleOk);
        closeButton.removeEventListener('click', handleOk);
    }
    
    okButton.addEventListener('click', handleOk);
    closeButton.addEventListener('click', handleOk);
}

function openModal(modal) {
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        modal.querySelector('div').classList.remove('scale-95');
    }, 10);
}

function closeModal(modal) {
    modal.classList.add('opacity-0');
    modal.querySelector('div').classList.add('scale-95');
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 300);
}

window.openModal = openModal;
window.closeModal = closeModal;

function showConfirm(message, onConfirm, onCancel) {
    const modal = document.getElementById('confirm-modal');
    const messageElement = document.getElementById('confirm-modal-message');
    const confirmButton = document.getElementById('confirm-modal-confirm');
    const cancelButton = document.getElementById('confirm-modal-cancel');
    const closeButton = document.getElementById('close-confirm-modal');

    messageElement.textContent = message;
    openModal(modal);

    function handleConfirm() {
        closeModal(modal);
        if (onConfirm) onConfirm();
        cleanup();
    }

    function handleCancel() {
        closeModal(modal);
        if (onCancel) onCancel();
        cleanup();
    }

    function cleanup() {
        confirmButton.removeEventListener('click', handleConfirm);
        cancelButton.removeEventListener('click', handleCancel);
        closeButton.removeEventListener('click', handleCancel);
    }

    confirmButton.addEventListener('click', handleConfirm);
    cancelButton.addEventListener('click', handleCancel);
    closeButton.addEventListener('click', handleCancel);
}

window.showConfirm = showConfirm;
window.showLoginModal = showLoginModal;
window.hideLoginModal = hideLoginModal;
window.showRegisterModal = showRegisterModal;
window.hideRegisterModal = hideRegisterModal;

const pageHistory = [];
let isInitialNavigation = true;
let isGoingBack = false;

function showPage(pageId) {
    if (isInitialNavigation) {
        isInitialNavigation = false;
        document.querySelectorAll('.page').forEach(page => {
            page.classList.add('hidden');
        });
        const page = document.getElementById(pageId);
        if (page) {
            page.classList.remove('hidden');
            page.classList.add('page-transition', 'active');
        }
        return;
    }

    if (!isGoingBack) {
        const loginPage = document.getElementById('login-page');
        const isOnLoginPage = loginPage && !loginPage.classList.contains('hidden');
        let currentPageId = null;

        if (isOnLoginPage) {
            currentPageId = 'login-page';
        } else {
            const currentPage = document.querySelector('.page:not(.hidden)');
            if (currentPage) {
                currentPageId = currentPage.id;
            }
        }

        if (currentPageId && currentPageId !== pageId) {
            pageHistory.push(currentPageId);
        }
    }

    const loginPage = document.getElementById('login-page');
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
        setTimeout(() => {
            page.classList.add('hidden');
        }, 200);
    });

    setTimeout(() => {
        if (pageId === 'login-page') {
            loginPage.classList.remove('hidden');
            loginPage.classList.add('page-transition', 'active');
            document.querySelector('.app-container')?.classList.add('hidden');
        } else {
            loginPage?.classList.add('hidden');
            document.querySelector('.app-container')?.classList.remove('hidden');
            const page = document.getElementById(pageId);
            if (page) {
                page.classList.remove('hidden');
                page.classList.add('page-transition', 'active');
            }
        }
    }, 200);
    
    isGoingBack = false;
}

function goBack() {
    if (pageHistory.length > 0) {
        isGoingBack = true;
        const previousPage = pageHistory.pop();
        showPage(previousPage);
    } else {
        showPage('mode-selection-page');
    }
}

function clearPageHistory() {
    pageHistory.length = 0;
}

function initAuth() {
    updateAuthUI();
    setupAuthEventListeners();
}

window.deleteHistoryItem = deleteHistoryItem;
window.showPage = showPage;
window.goBack = goBack;
window.showAlert = showAlert;

export { initAuth, updateAuthUI, apiClient, showAlert };
