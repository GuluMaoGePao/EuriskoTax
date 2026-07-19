import apiClient from '../api/api-client.js';

function showLoginModal() {
    document.getElementById('login-modal').classList.remove('hidden');
    document.getElementById('register-modal').classList.add('hidden');
}

function hideLoginModal() {
    document.getElementById('login-modal').classList.add('hidden');
    document.getElementById('login-email').value = '';
    document.getElementById('login-password').value = '';
}

function showRegisterModal() {
    document.getElementById('register-modal').classList.remove('hidden');
    document.getElementById('login-modal').classList.add('hidden');
}

function hideRegisterModal() {
    document.getElementById('register-modal').classList.add('hidden');
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

async function handleLogin() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    if (!email || !password) {
        showAlert('请填写邮箱和密码');
        return;
    }
    
    try {
        await apiClient.loginUser(email, password);
        clearPageHistory();
        updateAuthUI();
        hideLoginModal();
        showAlert('登录成功', 'success');
    } catch (error) {
        showAlert('登录失败: ' + error.message);
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
        await apiClient.registerUser(username, email, password, phone || null);
        showAlert('注册成功，请登录', 'success');
        // 切换到登录 tab，而不是显示废弃的 login-modal
        document.getElementById('login-tab').click();
        // 清空注册表单
        document.getElementById('register-username').value = '';
        document.getElementById('register-email').value = '';
        document.getElementById('register-phone').value = '';
        document.getElementById('register-password').value = '';
        document.getElementById('register-confirm-password').value = '';
        // 预填邮箱到登录表单
        document.getElementById('login-email').value = email;
    } catch (error) {
        showAlert('注册失败: ' + error.message);
    }
}

async function handleLogout() {
    apiClient.logoutUser();
    updateAuthUI();
    showAlert('已退出登录', 'success');
    showPage('mode-selection-page');
}

async function loadProfile() {
    try {
        const user = await apiClient.getProfile();
        document.getElementById('profile-username').value = user.username;
        document.getElementById('profile-email').value = user.email;
        document.getElementById('profile-phone').value = user.phone || '';
        document.getElementById('profile-display-name').textContent = user.username;
        document.getElementById('profile-display-email').textContent = user.email;
        // 同步加载税务档案和税务日历
        loadTaxProfile();
        renderTaxCalendar();
    } catch (error) {
        showAlert('加载失败: ' + error.message);
    }
}

// 税务档案：使用 localStorage 存储，便于快速应用默认扣除配置
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
    localStorage.setItem(TAX_PROFILE_KEY, JSON.stringify(profile));
    showAlert('税务档案已保存', 'success');
}

function resetTaxProfile() {
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

// 税务日历：根据当前日期动态生成关键时间节点提醒
function renderTaxCalendar() {
    const listEl = document.getElementById('tax-calendar-list');
    if (!listEl) return;
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

    listEl.innerHTML = events.map(event => {
        let badgeClass = 'bg-gray-100 text-gray-700';
        let statusText = '已结束';
        let statusIcon = 'fa-times-circle';
        if (now < event.start) {
            badgeClass = 'bg-yellow-100 text-yellow-700';
            statusText = '即将开始';
            statusIcon = 'fa-hourglass-half';
        } else if (now >= event.start && now <= event.end) {
            badgeClass = 'bg-green-100 text-green-700';
            statusText = '进行中';
            statusIcon = 'fa-check-circle';
        }
        return `
            <div class="border border-gray-200 rounded-lg p-4">
                <div class="flex items-start justify-between mb-2">
                    <h4 class="font-semibold text-gray-800">${event.title}</h4>
                    <span class="${badgeClass} px-2 py-0.5 rounded text-xs">
                        <i class="fa ${statusIcon} mr-1"></i>${statusText}
                    </span>
                </div>
                <p class="text-sm text-gray-600 mb-2"><i class="fa fa-calendar-o mr-2"></i>${event.period}</p>
                <p class="text-xs text-gray-500">${event.description}</p>
            </div>
        `;
    }).join('');
}

// 数据导出：导出用户的所有计算历史
async function exportData(format) {
    try {
        const history = await apiClient.getCalculationHistory();
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
            const rows = [['ID', '类型', '创建时间', '税额合计']];
            const typeNames = {
                comprehensive: '综合所得',
                business: '经营所得',
                classification: '分类所得',
                reverse: '反向倒算'
            };
            history.forEach(item => {
                const tax = item.result_data?.taxDetails?.totalTax || item.result_data?.totalTax || 0;
                rows.push([
                    item.id,
                    typeNames[item.type] || item.type,
                    new Date(item.created_at).toLocaleString('zh-CN'),
                    tax
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
    }
}

async function saveProfile() {
    const phone = document.getElementById('profile-phone').value;
    const currentPassword = document.getElementById('profile-current-password').value;
    const password = document.getElementById('profile-password').value;
    const confirmPassword = document.getElementById('profile-confirm-password').value;
    
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
        const updatedUser = await apiClient.updateProfile(updateData);
        showAlert('修改成功', 'success');
        document.getElementById('profile-current-password').value = '';
        document.getElementById('profile-password').value = '';
        document.getElementById('profile-confirm-password').value = '';
        // 同步刷新侧边栏和导航栏的用户信息
        document.getElementById('profile-display-name').textContent = updatedUser.username;
        document.getElementById('profile-display-email').textContent = updatedUser.email;
        updateAuthUI();
    } catch (error) {
        showAlert('修改失败: ' + error.message);
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

async function loadHistory() {
    const historyList = document.getElementById('history-list');
    const historyEmpty = document.getElementById('history-empty');
    
    try {
        const history = await apiClient.getCalculationHistory();
        
        if (history.length === 0) {
            historyEmpty.classList.remove('hidden');
            return;
        }
        
        historyEmpty.classList.add('hidden');
        
        historyList.innerHTML = history.map(item => `
            <div class="card">
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
            </div>
        `).join('');
    } catch (error) {
        showAlert('加载失败: ' + error.message);
    }
}

async function loadProfileHistory() {
    const historyList = document.getElementById('profile-history-list');
    const historyEmpty = document.getElementById('profile-history-empty');
    
    try {
        const history = await apiClient.getCalculationHistory();
        
        if (history.length === 0) {
            historyEmpty.classList.remove('hidden');
            return;
        }
        
        historyEmpty.classList.add('hidden');
        
        historyList.innerHTML = history.map(item => `
            <div class="card">
                <div class="flex justify-between items-start">
                    <div>
                        <div class="font-medium text-gray-800">${getCalculationTypeName(item.type)}</div>
                        <div class="text-sm text-gray-500">${formatDate(item.created_at)}</div>
                    </div>
                    <div class="text-right">
                        <div class="font-bold text-primary">¥${formatAmount(item.result_data?.taxDetails?.totalTax || item.result_data?.totalTax || 0)}</div>
                    </div>
                </div>
                <button onclick="deleteHistoryItem(${item.id}); loadProfileHistory();" class="mt-3 text-sm text-danger hover:underline">删除</button>
            </div>
        `).join('');
    } catch (error) {
        showAlert('加载失败: ' + error.message);
    }
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
        loadHistory();
        showAlert('删除成功', 'success');
    } catch (error) {
        showAlert('删除失败: ' + error.message);
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
    document.getElementById('logout-link').addEventListener('click', (e) => {
        e.preventDefault();
        handleLogout();
    });
    document.getElementById('profile-link').addEventListener('click', (e) => {
        e.preventDefault();
        loadProfile();
        showPage('profile-page');
    });
    document.getElementById('history-link').addEventListener('click', (e) => {
        e.preventDefault();
        loadHistory();
        showPage('history-page');
    });
    document.getElementById('back-from-profile').addEventListener('click', () => {
        goBack();
    });
    const backFromHistoryBtn = document.getElementById('back-from-history');
    if (backFromHistoryBtn) {
        backFromHistoryBtn.addEventListener('click', () => {
            goBack();
        });
    }
    const backFromProfileHistoryBtn = document.getElementById('back-from-profile-history');
    if (backFromProfileHistoryBtn) {
        backFromProfileHistoryBtn.addEventListener('click', () => {
            goBack();
        });
    }
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
    // 税务档案事件
    document.getElementById('tax-profile-save').addEventListener('click', saveTaxProfile);
    document.getElementById('tax-profile-reset').addEventListener('click', resetTaxProfile);
    // 数据导出事件
    document.getElementById('export-json-btn').addEventListener('click', () => exportData('json'));
    document.getElementById('export-csv-btn').addEventListener('click', () => exportData('csv'));

    document.getElementById('profile-nav-history').addEventListener('click', (e) => {
        e.preventDefault();
        loadProfileHistory();
        showPage('profile-history-page');
    });
    document.getElementById('profile-nav-help').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('help-modal').classList.remove('hidden');
    });
    document.getElementById('profile-nav-about').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('about-modal').classList.remove('hidden');
    });
    
    document.getElementById('user-btn').addEventListener('click', () => {
        document.getElementById('user-dropdown').classList.toggle('hidden');
    });
    
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#user-menu')) {
            document.getElementById('user-dropdown').classList.add('hidden');
        }
    });
}

function showAlert(message, type = 'error') {
    const alertDiv = document.createElement('div');
    alertDiv.className = `fixed top-4 right-4 px-6 py-4 rounded-lg shadow-lg z-50 ${
        type === 'success' ? 'bg-success text-white' : 'bg-danger text-white'
    }`;
    alertDiv.textContent = message;
    document.body.appendChild(alertDiv);
    
    setTimeout(() => {
        alertDiv.remove();
    }, 3000);
}

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
    if (pageId === 'login-page') {
        loginPage.classList.remove('hidden');
        document.querySelectorAll('.page').forEach(page => {
            page.classList.add('hidden');
        });
        document.querySelector('.app-container')?.classList.add('hidden');
    } else {
        loginPage?.classList.add('hidden');
        document.querySelector('.app-container')?.classList.remove('hidden');
        document.querySelectorAll('.page').forEach(page => {
            page.classList.add('hidden');
        });
        const page = document.getElementById(pageId);
        if (page) {
            page.classList.remove('hidden');
        }
    }
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

export { initAuth, updateAuthUI, apiClient, showAlert };
