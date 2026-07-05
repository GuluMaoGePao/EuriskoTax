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
        hideRegisterModal();
        showAlert('注册成功，请登录', 'success');
        showLoginModal();
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
    } catch (error) {
        showAlert('加载失败: ' + error.message);
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
        await apiClient.updateProfile(updateData);
        showAlert('修改成功', 'success');
        document.getElementById('profile-current-password').value = '';
        document.getElementById('profile-password').value = '';
        document.getElementById('profile-confirm-password').value = '';
    } catch (error) {
        showAlert('修改失败: ' + error.message);
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
    return parseFloat(amount).toFixed(2);
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
        showPage('mode-selection-page');
    });
    document.getElementById('back-from-history').addEventListener('click', () => {
        showPage('mode-selection-page');
    });
    document.getElementById('profile-save').addEventListener('click', saveProfile);
    document.getElementById('profile-cancel').addEventListener('click', resetProfileForm);
    
    document.getElementById('profile-nav-history').addEventListener('click', (e) => {
        e.preventDefault();
        loadHistory();
        showPage('history-page');
    });
    document.getElementById('profile-nav-help').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('help-modal').classList.remove('hidden');
    });
    document.getElementById('profile-nav-about').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('help-modal').classList.remove('hidden');
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

function showPage(pageId) {
    document.querySelectorAll('.page').forEach(page => {
        page.classList.add('hidden');
    });
    const page = document.getElementById(pageId);
    if (page) {
        page.classList.remove('hidden');
    }
}

function initAuth() {
    updateAuthUI();
    setupAuthEventListeners();
}

window.deleteHistoryItem = deleteHistoryItem;

export { initAuth, updateAuthUI, apiClient, showAlert };
