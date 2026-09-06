import apiClient from '../api/api-client.js';

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
        const authSection = document.getElementById('auth-section');
        if (authSection) authSection.classList.add('hidden');
        document.getElementById('user-menu').classList.remove('hidden');
        document.getElementById('user-name').textContent = user?.username || '用户';
    } else {
        showLoginPage();
        const authSection = document.getElementById('auth-section');
        if (authSection) authSection.classList.remove('hidden');
        document.getElementById('user-menu').classList.add('hidden');
    }
}

// 退出/注销时清理本地残留的用户数据，避免换号共用浏览器导致数据串号。
// 计算历史（taxCalculationHistory）为浏览器本地唯一数据源、随账号会话在本机产生，
// 登出即清空，防止换账号登录共用浏览器时看到他人计算记录（游客阶段不受影响）
function clearLocalUserData() {
    localStorage.removeItem('calculation_history');      // 旧遗留 key
    localStorage.removeItem('taxCalculationHistory');    // 主页/个人中心共用 key
    localStorage.removeItem('tax_profile');
    refreshHomeHistoryViews();
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
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const btn = document.getElementById('login-submit');
    
    if (!email || !password) {
        showAlert('请填写邮箱和密码');
        return;
    }
    
    // 「记住我」：勾选 → token 存 localStorage（跨会话保持）；未勾选 → sessionStorage（关浏览器即失效）
    // 元素不存在（如单元测试环境）时默认记住（保持历史行为）
    const rememberMe = document.getElementById('remember-me')?.checked !== false;

    try {
        setLoading(btn, true);
        await apiClient.loginUser(email, password, rememberMe);
        clearPageHistory();
        updateAuthUI();
        showAlert('登录成功', 'success');
    } catch (error) {
        showAlert(error.message);
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
        showAlert(error.message);
    }
}

async function handleRegister() {
    const username = document.getElementById('register-username').value.trim();
    const email = document.getElementById('register-email').value.trim().toLowerCase();
    const phone = document.getElementById('register-phone').value.trim();
    const password = document.getElementById('register-password').value;
    const confirmPassword = document.getElementById('register-confirm-password').value;
    const inviteCode = document.getElementById('register-invite-code').value.trim().toUpperCase();
    const verificationCode = document.getElementById('register-code').value.trim();
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

    if (phone && !/^1[3-9]\d{9}$/.test(phone)) {
        showAlert('请输入有效的手机号');
        return;
    }

    const agreeEl = document.getElementById('register-agree');
    if (agreeEl && !agreeEl.checked) {
        showAlert('请先勾选已阅读并同意《用户协议》和《隐私政策》');
        return;
    }

    if (!inviteCode) {
        showAlert('请填写邀请码');
        return;
    }

    if (!verificationCode) {
        showAlert('请填写邮箱验证码');
        return;
    }
    
    try {
        setLoading(btn, true);
        await apiClient.registerUser(username, email, password, phone || null, inviteCode, verificationCode);
        // 回到登录并预填邮箱
        switchAuthTab('login');
        document.getElementById('login-email').value = email;
        document.getElementById('register-username').value = '';
        document.getElementById('register-email').value = '';
        document.getElementById('register-phone').value = '';
        document.getElementById('register-password').value = '';
        document.getElementById('register-confirm-password').value = '';
        document.getElementById('register-invite-code').value = '';
        document.getElementById('register-code').value = '';
        registerCodeSentEmail = '';
        if (agreeEl) agreeEl.checked = false;
        showAlert('注册成功，请登录（邮箱已自动填入）', 'success', () => {
            document.getElementById('login-email').focus();
        });
    } catch (error) {
        // 已注册邮箱（后端 409）：给出明确提示并引导去登录，而不是让用户干等验证码
        if (error && error.statusCode === 409) {
            showAlert('该邮箱已注册，请直接登录', 'warning', function() {
                switchAuthTab('login');
                document.getElementById('login-email').value = email;
            });
        } else {
            showAlert(error.message);
        }
    } finally {
        setLoading(btn, false);
    }
}

// 发送注册验证码：成功后进入 60 秒倒计时
const SEND_CODE_COOLDOWN = 60;
let sendCodeTimer = null;
// 记录最近一次发送注册验证码的邮箱：用户改邮箱后旧验证码自动作废
let registerCodeSentEmail = '';

function startSendCodeCountdown(seconds) {
    const btn = document.getElementById('send-code-btn');
    let remaining = seconds;
    btn.disabled = true;
    btn.textContent = `${remaining}s 后重发`;
    sendCodeTimer = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
            clearInterval(sendCodeTimer);
            sendCodeTimer = null;
            btn.textContent = '发送验证码';
            // 冷却结束后仅在邮箱已填写时恢复可点击
            const email = document.getElementById('register-email').value.trim();
            btn.disabled = !email;
        } else {
            btn.textContent = `${remaining}s 后重发`;
        }
    }, 1000);
}

async function handleSendCode() {
    const email = document.getElementById('register-email').value.trim();
    const btn = document.getElementById('send-code-btn');

    if (!email) {
        showAlert('请先填写邮箱');
        return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showAlert('邮箱格式不正确');
        return;
    }

    try {
        btn.disabled = true;
        btn.textContent = '发送中...';
        await apiClient.sendVerificationCode(email);
        registerCodeSentEmail = email;
        // 邮箱变更后重新发送：清空旧验证码，避免用旧码注册时报"验证码无效"造成困惑
        const codeInput = document.getElementById('register-code');
        if (codeInput) codeInput.value = '';
        showAlert('验证码已发送，请查收邮箱（注意垃圾箱）', 'success');
        startSendCodeCountdown(SEND_CODE_COOLDOWN);
    } catch (error) {
        // 发送失败不进入倒计时，允许用户直接重试
        btn.textContent = '发送验证码';
        btn.disabled = false;
        // 已注册邮箱：后端返回 409（以状态码为准，不依赖文案匹配），
        // 直接引导登录而非显示"发送失败"
        const isRegistered = (error && error.statusCode === 409) ||
            /已注册|already registered/i.test(error.message || '');
        if (isRegistered) {
            showAlert('该邮箱已注册，请直接登录；如忘记密码可点击「忘记密码」自助找回', 'warning', function() {
                document.getElementById('login-tab').click();
                document.getElementById('login-email').value = email;
            });
        } else {
            showAlert(error.message);
        }
    }
}

// === 登录/注册 Tab 与底部协议文案联动 ===
function setActiveTab(mode) {
    const loginTab = document.getElementById('login-tab');
    const registerTab = document.getElementById('register-tab');
    if (!loginTab || !registerTab) return;
    const loginActive = mode === 'login';
    loginTab.classList.toggle('border-primary', loginActive);
    loginTab.classList.toggle('text-primary', loginActive);
    loginTab.classList.toggle('border-transparent', !loginActive);
    loginTab.classList.toggle('text-gray-500', !loginActive);
    registerTab.classList.toggle('border-primary', !loginActive);
    registerTab.classList.toggle('text-primary', !loginActive);
    registerTab.classList.toggle('border-transparent', loginActive);
    registerTab.classList.toggle('text-gray-500', loginActive);
}

function updateAuthAgreementText(mode) {
    const el = document.getElementById('auth-agreement-text');
    if (!el) return;
    const links =
        '<a href="#" onclick="openPolicyModal(event, \'user-agreement-modal\')" class="underline hover:text-white">用户协议</a>' +
        ' 和 ' +
        '<a href="#" onclick="openPolicyModal(event, \'privacy-policy-modal\')" class="underline hover:text-white">隐私政策</a>';
    if (mode === 'register') {
        el.innerHTML = '点击「注册」按钮即表示已阅读并同意' + links;
    } else if (mode === 'reset') {
        el.innerHTML = '仅已注册邮箱可获取重置验证码；若收不到邮件请检查垃圾箱，或<a href="mailto:2649719969@qq.com" class="underline hover:text-white">联系开发者</a>';
    } else {
        el.innerHTML = '登录即表示同意' + links;
    }
}

// === 忘记密码：重置密码面板 ===
function isResetPanelOpen() {
    const panel = document.getElementById('reset-password-form');
    return panel && !panel.classList.contains('hidden');
}

function showResetPasswordPanel() {
    const panel = document.getElementById('reset-password-form');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const divider = document.getElementById('auth-divider');
    const socialRow = document.getElementById('auth-social-row');
    if (!panel || !loginForm) return;

    // 复制当前登录邮箱到重置面板，减少输入
    const loginEmailValue = document.getElementById('login-email')?.value.trim() || '';
    const resetEmail = document.getElementById('reset-email');
    if (resetEmail && loginEmailValue) resetEmail.value = loginEmailValue;

    loginForm.classList.add('hidden');
    if (registerForm) registerForm.classList.add('hidden');
    panel.classList.remove('hidden');
    if (divider) divider.classList.add('hidden');
    if (socialRow) socialRow.classList.add('hidden');
    updateAuthAgreementText('reset');
    setActiveTab('login');
    setTimeout(() => resetEmail && resetEmail.focus(), 50);
}

// 隐藏重置面板并回到登录 Tab（同时恢复分隔线与第三方登录入口）
function closeResetPasswordPanel() {
    const panel = document.getElementById('reset-password-form');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const divider = document.getElementById('auth-divider');
    const socialRow = document.getElementById('auth-social-row');
    if (!panel || !loginForm) return;

    panel.classList.add('hidden');
    loginForm.classList.remove('hidden');
    if (registerForm) registerForm.classList.add('hidden');
    if (divider) divider.classList.remove('hidden');
    if (socialRow) socialRow.classList.remove('hidden');
    updateAuthAgreementText('login');
    setActiveTab('login');
}

// 切换登录/注册 Tab（若重置面板打开则自动回到对应表单）
function switchAuthTab(mode) {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const panel = document.getElementById('reset-password-form');
    if (!loginForm || !registerForm) return;

    if (panel && !panel.classList.contains('hidden')) {
        panel.classList.add('hidden');
        const divider = document.getElementById('auth-divider');
        const socialRow = document.getElementById('auth-social-row');
        if (divider) divider.classList.remove('hidden');
        if (socialRow) socialRow.classList.remove('hidden');
    }

    if (mode === 'register') {
        loginForm.classList.add('hidden');
        registerForm.classList.remove('hidden');
        updateAuthAgreementText('register');
        setActiveTab('register');
    } else {
        registerForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
        updateAuthAgreementText('login');
        setActiveTab('login');
    }
}

// === 发送密码重置验证码 ===
const RESET_CODE_COOLDOWN = 60;
let resetSendTimer = null;

function startResetCodeCountdown(seconds) {
    const btn = document.getElementById('reset-send-code-btn');
    if (!btn) return;
    let remaining = seconds;
    btn.disabled = true;
    btn.textContent = `${remaining}s 后重发`;
    if (resetSendTimer) clearInterval(resetSendTimer);
    resetSendTimer = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
            clearInterval(resetSendTimer);
            resetSendTimer = null;
            btn.textContent = '发送验证码';
            const email = document.getElementById('reset-email')?.value.trim() || '';
            btn.disabled = !email;
        } else {
            btn.textContent = `${remaining}s 后重发`;
        }
    }, 1000);
}

async function handleResetSendCode() {
    const email = document.getElementById('reset-email').value.trim();
    const btn = document.getElementById('reset-send-code-btn');
    const codeInput = document.getElementById('reset-code');

    if (!email) {
        showAlert('请先填写注册邮箱');
        return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showAlert('邮箱格式不正确');
        return;
    }

    try {
        btn.disabled = true;
        btn.textContent = '发送中...';
        await apiClient.sendResetCode(email);
        if (codeInput) codeInput.value = '';
        showAlert('验证码已发送，请查收邮箱（注意垃圾箱）', 'success');
        startResetCodeCountdown(RESET_CODE_COOLDOWN);
    } catch (error) {
        btn.textContent = '发送验证码';
        btn.disabled = false;
        showAlert(error.message);
    }
}

async function handleResetPassword() {
    const email = document.getElementById('reset-email').value.trim().toLowerCase();
    const code = document.getElementById('reset-code').value.trim();
    const newPassword = document.getElementById('reset-new-password').value;
    const confirmPassword = document.getElementById('reset-confirm-password').value;
    const btn = document.getElementById('reset-submit');

    if (!email) {
        showAlert('请填写注册邮箱');
        return;
    }
    if (!code) {
        showAlert('请填写邮箱验证码');
        return;
    }
    if (!newPassword || newPassword.length < 6) {
        showAlert('新密码长度至少6位');
        return;
    }
    if (newPassword !== confirmPassword) {
        showAlert('两次输入的新密码不一致');
        return;
    }

    try {
        setLoading(btn, true);
        await apiClient.resetPassword(email, code, newPassword);
        // 清理重置面板
        document.getElementById('reset-code').value = '';
        document.getElementById('reset-new-password').value = '';
        document.getElementById('reset-confirm-password').value = '';
        // 回到登录并自动填入邮箱
        switchAuthTab('login');
        document.getElementById('login-email').value = email;
        document.getElementById('login-email').focus();
        showAlert('密码重置成功，请使用新密码登录', 'success');
    } catch (error) {
        showAlert(error.message);
    } finally {
        setLoading(btn, false);
    }
}

async function handleLogout() {
    apiClient.logoutUser();
    clearLocalUserData();
    clearPageHistory();
    // updateAuthUI 会自动回到登录页
    updateAuthUI();
    showAlert('已退出登录', 'success');
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
    ProfilePerf.log('loadProfile → 开始', 0, { timestamp: Date.now() });
    let apiDuration = 0;
    let syncDuration = 0;
    let rafScheduledAt = 0;
    try {
        // 阶段1：API 获取用户信息
        const apiStart = performance.now();
        const user = await ProfilePerf.measureAsync('loadProfile → API获取用户信息', () => apiClient.getProfile());
        apiDuration = performance.now() - apiStart;
        ProfilePerf.log('loadProfile → 阶段1完成-API', apiDuration, { user: user.username, phone: !!user.phone });

        // 阶段2：同步更新顶栏关键信息（5 个字段）
        const syncStart = performance.now();
        document.getElementById('profile-username').value = user.username;
        document.getElementById('profile-email').value = user.email;
        document.getElementById('profile-phone').value = user.phone || '';
        document.getElementById('profile-display-name').textContent = user.username;
        document.getElementById('profile-display-email').textContent = user.email;
        syncDuration = performance.now() - syncStart;
        ProfilePerf.log('loadProfile → 阶段2完成-同步更新顶栏', syncDuration, { fields: 5 });

        // 阶段3：调度 requestAnimationFrame 延迟非关键 DOM 渲染
        // 涉及大量 innerHTML 与连续 input value 写入，同步执行会阻塞页面切换动画
        rafScheduledAt = performance.now();
        ProfilePerf.log('loadProfile → 阶段3-调度rAF延迟渲染', 0, { scheduledAt: +rafScheduledAt.toFixed(2) });

        requestAnimationFrame(() => {
            // 测量 rAF 实际触发延迟（若过长说明主线程被阻塞）
            const rafDelay = performance.now() - rafScheduledAt;
            ProfilePerf.log('loadProfile → rAF回调触发', rafDelay, { waitDelay: +rafDelay.toFixed(2) });

            // 阶段4：执行 5 个渲染子步骤
            const renderStart = performance.now();
            ProfilePerf.measure('loadProfile → 渲染统计卡片', renderProfileStats);
            ProfilePerf.measure('loadProfile → 更新统计数据', updateProfileStats);
            ProfilePerf.measure('loadProfile → 渲染模块卡片', renderProfileCards);
            ProfilePerf.measure('loadProfile → 加载税务档案', loadTaxProfile);
            ProfilePerf.measure('loadProfile → 渲染税务日历', renderTaxCalendar);
            const renderDuration = performance.now() - renderStart;

            // 阶段5：汇总
            const totalDuration = performance.now() - totalStart;
            ProfilePerf.log('loadProfile → 阶段4完成-渲染', renderDuration, { steps: 5 });
            ProfilePerf.log('loadProfile → 总耗时', totalDuration, {
                user: user.username,
                breakdown: {
                    api: +apiDuration.toFixed(2),
                    syncUpdate: +syncDuration.toFixed(2),
                    rafWait: +rafDelay.toFixed(2),
                    rendering: +renderDuration.toFixed(2)
                }
            });
        });
    } catch (error) {
        const errorDuration = performance.now() - totalStart;
        ProfilePerf.log('loadProfile → 错误', errorDuration, {
            error: error.message,
            stack: error.stack,
            phase: apiDuration === 0 ? 'api' : (syncDuration === 0 ? 'sync' : 'rAF')
        });
        showAlert('加载失败: ' + error.message);
    }
}

// === 个人中心统计卡片配置 ===
// 注意：所有 Tailwind 类名必须为完整静态字符串，避免动态拼接（${color}）
// 因为 cdn.tailwindcss.com 的 JIT 会监听 DOM 变化，动态类名会触发重扫和实时生成，造成卡顿。
const PROFILE_STATS_CONFIG = [
    {
        id: 'profile-stats-calculations',
        icon: 'fa-calculator',
        label: '计算次数',
        cardClass: 'bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border border-blue-200',
        iconBg: 'w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center mr-3',
        labelClass: 'text-sm text-blue-600 font-medium',
        valueClass: 'text-2xl font-bold text-blue-800'
    },
    {
        id: 'profile-stats-profiles',
        icon: 'fa-file-text-o',
        label: '档案数量',
        cardClass: 'bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-4 border border-green-200',
        iconBg: 'w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center mr-3',
        labelClass: 'text-sm text-green-600 font-medium',
        valueClass: 'text-2xl font-bold text-green-800'
    },
    {
        id: 'profile-stats-history',
        icon: 'fa-history',
        label: '历史记录',
        cardClass: 'bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-4 border border-purple-200',
        iconBg: 'w-10 h-10 bg-purple-500 rounded-lg flex items-center justify-center mr-3',
        labelClass: 'text-sm text-purple-600 font-medium',
        valueClass: 'text-2xl font-bold text-purple-800'
    },
    {
        id: 'profile-stats-reminders',
        icon: 'fa-calendar-check-o',
        label: '本月提醒',
        cardClass: 'bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-4 border border-orange-200',
        iconBg: 'w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center mr-3',
        labelClass: 'text-sm text-orange-600 font-medium',
        valueClass: 'text-2xl font-bold text-orange-800'
    }
];

// 渲染统计卡片
function renderProfileStats() {
    const grid = document.getElementById('profile-stats-grid');
    if (!grid || grid.children.length > 0) return; // 已渲染则跳过

    grid.innerHTML = PROFILE_STATS_CONFIG.map(({ id, icon, label, cardClass, iconBg, labelClass, valueClass }) => `
        <div class="${cardClass}">
            <div class="flex items-center">
                <div class="${iconBg}">
                    <i class="fa ${icon} text-white"></i>
                </div>
                <div class="min-w-0">
                    <p class="${labelClass}">${label}</p>
                    <p id="${id}" class="${valueClass}">0</p>
                </div>
            </div>
        </div>
    `).join('');
}

// === 个人中心功能模块卡片配置 ===
// 同样使用完整静态类名，避免动态拼接触发 Tailwind CDN 重扫
const PROFILE_CARDS_CONFIG = [
    {
        id: 'profile-card-history',
        icon: 'fa-history',
        title: '计算历史',
        desc: '查看和管理您的计算记录',
        iconWrapClass: 'w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center mb-4',
        iconClass: 'fa fa-history text-2xl text-blue-600'
    },
    {
        id: 'profile-card-tax',
        icon: 'fa-file-text-o',
        title: '税务档案',
        desc: '设置常用扣除配置，快速应用',
        iconWrapClass: 'w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center mb-4',
        iconClass: 'fa fa-file-text-o text-2xl text-green-600'
    },
    {
        id: 'profile-card-data',
        icon: 'fa-database',
        title: '数据管理',
        desc: '导出计算数据，备份与迁移',
        iconWrapClass: 'w-12 h-12 rounded-lg bg-purple-100 flex items-center justify-center mb-4',
        iconClass: 'fa fa-database text-2xl text-purple-600'
    },
    {
        id: 'profile-card-calendar',
        icon: 'fa-calendar',
        title: '税务日历',
        desc: '关键时间节点提醒',
        iconWrapClass: 'w-12 h-12 rounded-lg bg-orange-100 flex items-center justify-center mb-4',
        iconClass: 'fa fa-calendar text-2xl text-orange-600'
    },
    {
        id: 'profile-card-help',
        icon: 'fa-question-circle',
        title: '使用帮助',
        desc: '了解如何使用本工具',
        iconWrapClass: 'w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center mb-4',
        iconClass: 'fa fa-question-circle text-2xl text-gray-600'
    },
    {
        id: 'profile-card-about',
        icon: 'fa-info-circle',
        title: '关于我们',
        desc: '了解更多信息',
        iconWrapClass: 'w-12 h-12 rounded-lg bg-indigo-100 flex items-center justify-center mb-4',
        iconClass: 'fa fa-info-circle text-2xl text-indigo-600'
    }
];

// 渲染功能模块卡片
function renderProfileCards() {
    const grid = document.getElementById('profile-cards-grid');
    if (!grid || grid.children.length > 0) return; // 已渲染则跳过

    grid.innerHTML = PROFILE_CARDS_CONFIG.map(({ id, title, desc, iconWrapClass, iconClass }) => `
        <div class="card cursor-pointer profile-card-hover" id="${id}">
            <div class="p-6">
                <div class="${iconWrapClass}">
                    <i class="${iconClass}"></i>
                </div>
                <h3 class="text-lg font-semibold text-gray-800 mb-2">${title}</h3>
                <p class="text-sm text-gray-500">${desc}</p>
            </div>
        </div>
    `).join('');
}

function updateProfileStats() {
    // 与主页统一读 taxCalculationHistory（本地唯一数据源），修复此前读空服务端历史导致统计恒 0
    const history = getLocalHistory();
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
    // workMonths 有效值为 1-12，parseInt('0')=0 是合法解析结果但业务无效，
    // 不能用 || 12（0 是 falsy 会被吞掉），改用 isNaN 判断仅兜底 NaN
    const workMonthsRaw = parseInt(document.getElementById('tax-profile-work-months').value);
    const profile = {
        socialBase: parseFloat(document.getElementById('tax-profile-social-base').value) || 0,
        housingBase: parseFloat(document.getElementById('tax-profile-housing-base').value) || 0,
        children: parseFloat(document.getElementById('tax-profile-children').value) || 0,
        elderly: parseFloat(document.getElementById('tax-profile-elderly').value) || 0,
        rent: parseFloat(document.getElementById('tax-profile-rent').value) || 0,
        housingLoan: parseFloat(document.getElementById('tax-profile-housing-loan').value) || 0,
        education: parseFloat(document.getElementById('tax-profile-education').value) || 0,
        pension: parseFloat(document.getElementById('tax-profile-pension').value) || 0,
        workMonths: isNaN(workMonthsRaw) ? 12 : workMonthsRaw,
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

// ====== 计算历史：本地唯一数据源（与主页共用 taxCalculationHistory） ======
// 计算主流程为「前端本地计算 + localStorage 保存」，服务器没有落库链路，
// 原个人中心读 apiClient.getCalculationHistory() 恒为空数组（与主页双轨不一致）。
// 此处统一：统计 / 历史列表 / 导出 / 删除全部读本地，删除时尽力同步服务器残留即可。
const LOCAL_HISTORY_KEY = 'taxCalculationHistory';

function getLocalHistory() {
    try {
        return JSON.parse(localStorage.getItem(LOCAL_HISTORY_KEY) || '[]');
    } catch (e) {
        return [];
    }
}

function persistLocalHistory(history) {
    try {
        localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(history));
    } catch (e) {
        console.error('[EuriskoTax] 本地历史写入失败:', e);
    }
}

function removeLocalHistoryRecord(id) {
    const history = getLocalHistory();
    const next = history.filter((item) => item.id !== id);
    if (next.length === history.length) return false;
    persistLocalHistory(next);
    return true;
}

// 通知主页各视图刷新（主页渲染函数内部会先从 localStorage 同步内存镜像）
function refreshHomeHistoryViews() {
    if (typeof window === 'undefined') return;
    try {
        if (typeof window.loadHistoryRecords === 'function') window.loadHistoryRecords();
        if (typeof window.renderRecentCalculations === 'function') window.renderRecentCalculations();
    } catch (e) { /* 主页容器不可用时忽略 */ }
}

async function exportData(format) {
    const btn = format === 'json' ? document.getElementById('export-json-btn') : document.getElementById('export-csv-btn');
    
    try {
        setLoading(btn, true);
        const history = getLocalHistory();

        if (history.length === 0) {
            showAlert('暂无计算历史可导出');
            return;
        }

        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        let content, mimeType, extension;

        if (format === 'json') {
            content = JSON.stringify({
                exported_at: new Date().toISOString(),
                // 导出为浏览器本地数据，不依赖登录态（未登录时 user 为 null）
                user: apiClient && typeof apiClient.getCurrentUser === 'function' ? apiClient.getCurrentUser() : null,
                records: history
            }, null, 2);
            mimeType = 'application/json';
            extension = 'json';
        } else if (format === 'csv') {
            const rows = [['ID', '类型', '保存时间', '税额合计', '税前收入', '税后收入']];
            const typeNames = {
                forward: '综合所得计税',
                comprehensive: '综合所得计税',
                business: '经营所得计税',
                classification: '分类所得计税',
                reverse: '反向倒算'
            };

            history.forEach(item => {
                // 兼容本地记录（results）与旧服务器结构（result_data）
                const result = item.results || item.result_data || {};
                const tax = result?.taxDetails?.totalTax ?? result?.totalTax ?? 0;
                const income = result?.taxDetails?.totalIncome ?? result?.incomeDetails?.total ?? result?.totalIncome ?? 0;
                const netIncome = result?.taxDetails?.netIncome ?? result?.netIncome ?? Math.max(0, income - tax);
                rows.push([
                    item.id,
                    `"${typeNames[item.type] || item.type}"`,
                    `"${new Date(item.date || item.created_at).toLocaleString('zh-CN')}"`,
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
        clearLocalUserData();
        clearPageHistory();
        updateAuthUI();
        showAlert('账号已注销，感谢您的使用', 'success');
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
    if (!listElement) return;
    const fragment = document.createDocumentFragment();

    history.forEach(item => {
        // 兼容本地记录（results/date/title）与旧服务器结构（result_data/created_at）
        const result = item.results || item.result_data || {};
        const tax = result?.taxDetails?.totalTax ?? result?.totalTax ?? 0;
        const card = document.createElement('div');
        card.className = 'card profile-card-hover';
        card.innerHTML = `
            <div class="flex justify-between items-start">
                <div>
                    <div class="font-medium text-gray-800">${item.title || getCalculationTypeName(item.type)}</div>
                    <div class="text-sm text-gray-500">${formatDate(item.date || item.created_at)}</div>
                </div>
                <div class="text-right">
                    <div class="font-bold text-primary">¥${formatAmount(tax)}</div>
                </div>
            </div>
            <button onclick="deleteHistoryItem('${item.id}')" class="mt-3 text-sm text-danger hover:underline">删除</button>
        `;
        fragment.appendChild(card);
    });

    listElement.innerHTML = '';
    listElement.appendChild(fragment);
}

// 个人中心历史列表：统一读本地 taxCalculationHistory（同步读取，无需服务器往返）
function loadHistoryToList(listId, emptyId) {
    const historyList = document.getElementById(listId);
    const historyEmpty = document.getElementById(emptyId);
    const history = getLocalHistory();

    if (history.length === 0) {
        if (historyList) historyList.innerHTML = '';
        if (historyEmpty) historyEmpty.classList.remove('hidden');
        return;
    }

    if (historyEmpty) historyEmpty.classList.add('hidden');
    renderHistoryItems(history, historyList);
}

async function loadProfileHistory() {
    return loadHistoryToList('profile-history-list', 'profile-history-empty');
}

function getCalculationTypeName(type) {
    const types = {
        forward: '综合所得计税',
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

function deleteHistoryItem(id) {
    if (!confirm('确定要删除这条记录吗？')) return;

    // 本地统一源删除；本地找不到时尝试删除服务端残留（若曾同步过），失败静默
    const removed = removeLocalHistoryRecord(id);
    if (!removed && apiClient && typeof apiClient.deleteCalculation === 'function') {
        apiClient.deleteCalculation(id).catch(() => {});
    }

    // 同步刷新主页与个人中心各视图（主页渲染前会先从 localStorage 刷新镜像）
    refreshHomeHistoryViews();
    loadProfileHistory();
    updateProfileStats();
    showAlert('删除成功', 'success');
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
    document.getElementById('login-tab').addEventListener('click', () => switchAuthTab('login'));
    document.getElementById('register-tab').addEventListener('click', () => switchAuthTab('register'));

    document.getElementById('login-submit').addEventListener('click', handleLogin);
    // 忘记密码 → 打开重置密码面板（自助找回）
    document.getElementById('forgot-password').addEventListener('click', (e) => {
        e.preventDefault();
        showResetPasswordPanel();
    });
    // 快速登录仅限本地开发使用，生产环境隐藏入口
    if (['localhost', '127.0.0.1'].includes(window.location.hostname)) {
        document.getElementById('quick-login-btn').addEventListener('click', handleQuickLogin);
    } else {
        document.getElementById('quick-login-btn').classList.add('hidden');
    }
    document.getElementById('register-submit').addEventListener('click', handleRegister);
    document.getElementById('send-code-btn').addEventListener('click', handleSendCode);
    // Enter 键提交（按钮为 type=button，表单无隐式提交，需手动绑定）
    document.querySelectorAll('#login-form input').forEach(input => {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleLogin();
            }
        });
    });
    document.querySelectorAll('#register-form input').forEach(input => {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleRegister();
            }
        });
    });
    // 邮箱填写后才允许点击"发送验证码"（倒计时期间由倒计时逻辑控制）
    document.getElementById('register-email').addEventListener('input', (e) => {
        if (!sendCodeTimer) {
            document.getElementById('send-code-btn').disabled = !e.target.value.trim();
        }
    });
    // 修改注册邮箱后，旧邮箱的验证码作废：清空并提醒重新获取
    document.getElementById('register-email').addEventListener('change', (e) => {
        const codeInput = document.getElementById('register-code');
        const newEmail = e.target.value.trim().toLowerCase();
        if (registerCodeSentEmail && newEmail !== registerCodeSentEmail && codeInput && codeInput.value.trim()) {
            codeInput.value = '';
            showAlert('邮箱已变更，原验证码已失效，请重新获取验证码', 'info');
        }
    });

    // === 忘记密码：重置密码面板事件 ===
    const resetBackBtn = document.getElementById('reset-back-to-login');
    if (resetBackBtn) {
        resetBackBtn.addEventListener('click', () => closeResetPasswordPanel());
    }
    const resetEmailInput = document.getElementById('reset-email');
    const resetSendBtn = document.getElementById('reset-send-code-btn');
    if (resetEmailInput) {
        resetEmailInput.addEventListener('input', (e) => {
            if (resetSendBtn && !resetSendTimer) {
                resetSendBtn.disabled = !e.target.value.trim();
            }
        });
        // 修改重置邮箱后清空已填验证码，避免提交到错误邮箱
        resetEmailInput.addEventListener('change', (e) => {
            const codeInput = document.getElementById('reset-code');
            if (codeInput && codeInput.value.trim()) {
                codeInput.value = '';
                showAlert('邮箱已变更，请重新获取验证码', 'info');
            }
        });
    }
    if (resetSendBtn) resetSendBtn.addEventListener('click', handleResetSendCode);
    const resetSubmit = document.getElementById('reset-submit');
    if (resetSubmit) resetSubmit.addEventListener('click', handleResetPassword);
    document.querySelectorAll('#reset-password-form input').forEach(input => {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleResetPassword();
            }
        });
    });

    // 微信/QQ 登录：当前未开放，点击给出提示而非无反应
    const socialWechat = document.getElementById('social-wechat-btn');
    if (socialWechat) {
        socialWechat.addEventListener('click', () => {
            showAlert('微信登录暂未开放，请使用邮箱登录', 'info');
        });
    }
    const socialQq = document.getElementById('social-qq-btn');
    if (socialQq) {
        socialQq.addEventListener('click', () => {
            showAlert('QQ 登录暂未开放，请使用邮箱登录', 'info');
        });
    }
    // 用户协议和隐私政策弹窗：显示/隐藏逻辑已由 index.html 中的 inline onclick 直接处理，
    // 此处不再重复绑定 addEventListener，避免与 inline onclick 冲突或元素缺失时抛错中断后续绑定
    document.getElementById('profile-link').addEventListener('click', (e) => {
        e.preventDefault();
        const eventTime = Date.now();
        // 先切换页面（让动画立即开始），再异步加载数据，避免同步渲染阻塞页面切换
        const showPageStart = performance.now();
        showPage('profile-page');
        const showPageDuration = performance.now() - showPageStart;
        ProfilePerf.log('进入个人中心 → showPage', showPageDuration, { eventTime });
        // 在下一帧加载数据，让浏览器先完成页面切换渲染
        requestAnimationFrame(() => loadProfile());
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
        { cardId: 'profile-card-help', specialFn: () => openModal(document.getElementById('help-modal')) },
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
        { input: 'profile-confirm-password', toggle: 'profile-confirm-password-toggle' },
        { input: 'reset-new-password', toggle: 'reset-new-password-toggle' },
        { input: 'reset-confirm-password', toggle: 'reset-confirm-password-toggle' }
    ];
    
    passwordToggleIds.forEach(({ input, toggle }) => {
        const toggleEl = document.getElementById(toggle);
        if (toggleEl) {
            toggleEl.addEventListener('click', () => togglePasswordVisibility(input, toggle));
        }
    });

    // 帮助/关于弹窗的右上角关闭按钮
    const bindCloseBtn = (btnId, modalId) => {
        const btn = document.getElementById(btnId);
        if (btn) {
            btn.addEventListener('click', () => {
                const modal = document.getElementById(modalId);
                if (modal) closeModal(modal);
            });
        }
    };
    bindCloseBtn('close-help-modal', 'help-modal');
    bindCloseBtn('close-about-modal', 'about-modal');

    // ESC 关闭当前最上层弹窗（协议/隐私/帮助/关于/alert/confirm 统一处理）
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && openModalSet.size > 0) {
            closeModal([...openModalSet][openModalSet.size - 1]);
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
    msg.style.whiteSpace = 'pre-line';
    
    openModal(modal);
    
    // 直接赋值 onclick，天然去重：同一按钮连点或重复 showAlert 不会累积多个回调
    function handleOk() {
        closeModal(modal);
        if (callback) callback();
        okButton.onclick = null;
        closeButton.onclick = null;
    }
    
    okButton.onclick = handleOk;
    closeButton.onclick = handleOk;
}

// 当前打开中的弹窗集合：用于多弹窗时的背景滚动锁定与 ESC 关闭最上层弹窗
const openModalSet = new Set();

function openModal(modal) {
    if (!modal) return;
    modal.classList.remove('hidden');
    openModalSet.add(modal);
    document.body.style.overflow = 'hidden';
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        const inner = modal.querySelector('div');
        if (inner) inner.classList.remove('scale-95');
    }, 10);
}

function closeModal(modal) {
    if (!modal) return;
    modal.classList.add('opacity-0');
    const inner = modal.querySelector('div');
    if (inner) inner.classList.add('scale-95');
    openModalSet.delete(modal);
    if (openModalSet.size === 0) {
        document.body.style.overflow = '';
    }
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

const pageHistory = [];
let isInitialNavigation = true;
let isGoingBack = false;

function showPage(pageId) {
    const start = performance.now();
    const wasInitial = isInitialNavigation;
    ProfilePerf.log('showPage → 开始', 0, {
        pageId,
        isInitialNavigation: wasInitial,
        isGoingBack,
        historyLength: pageHistory.length
    });

    // === 分支A：初始导航（首次进入页面，无过渡动画） ===
    if (isInitialNavigation) {
        isInitialNavigation = false;
        const hideStart = performance.now();
        document.querySelectorAll('.page').forEach(page => {
            page.classList.add('hidden');
        });
        ProfilePerf.log('showPage → 初始导航-隐藏所有页面', performance.now() - hideStart);

        const page = document.getElementById(pageId);
        if (page) {
            page.classList.remove('hidden');
            page.classList.add('page-transition', 'active');
        }
        ProfilePerf.log('showPage → 初始导航完成', performance.now() - start, {
            pageId,
            pageFound: !!page
        });
        return;
    }

    // === 分支B：常规导航 ===
    // B-1：检测当前页面并压入历史栈（非返回操作时）
    let currentPageId = null;
    if (!isGoingBack) {
        const loginPage = document.getElementById('login-page');
        const isOnLoginPage = loginPage && !loginPage.classList.contains('hidden');
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
            ProfilePerf.log('showPage → 压入历史栈', 0, {
                pushed: currentPageId,
                newLength: pageHistory.length
            });
        } else {
            ProfilePerf.log('showPage → 跳过历史栈', 0, {
                currentPageId,
                reason: currentPageId === pageId ? 'samePage' : 'noCurrentPage'
            });
        }
    } else {
        ProfilePerf.log('showPage → 返回模式-跳过历史栈检测', 0);
    }

    // B-2：阶段1 - 移除所有页面的 active 类（触发淡出动画）
    const phase1Start = performance.now();
    const loginPage = document.getElementById('login-page');
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    ProfilePerf.log('showPage → 阶段1-移除active类', performance.now() - phase1Start);

    // B-3：200ms 后隐藏所有页面并显示目标页面
    const phase2ScheduledAt = performance.now();
    ProfilePerf.log('showPage → 调度200ms延迟', 0, { scheduledAt: +phase2ScheduledAt.toFixed(2) });

    setTimeout(() => {
        const phase2Delay = performance.now() - phase2ScheduledAt;
        ProfilePerf.log('showPage → 阶段2回调触发', phase2Delay, { actualDelay: +phase2Delay.toFixed(2) });

        // 阶段2a：隐藏所有页面
        const hideStart = performance.now();
        document.querySelectorAll('.page').forEach(page => {
            page.classList.add('hidden');
        });
        const hideDuration = performance.now() - hideStart;
        ProfilePerf.log('showPage → 阶段2a-隐藏所有页面', hideDuration);

        // 阶段2b：显示目标页面
        const showStart = performance.now();
        let pageFound = false;
        if (pageId === 'login-page') {
            loginPage.classList.remove('hidden');
            loginPage.classList.add('page-transition', 'active');
            document.querySelector('.app-container')?.classList.add('hidden');
            pageFound = true;
        } else {
            loginPage?.classList.add('hidden');
            document.querySelector('.app-container')?.classList.remove('hidden');
            const page = document.getElementById(pageId);
            if (page) {
                page.classList.remove('hidden');
                page.classList.add('page-transition', 'active');
                pageFound = true;
            }
        }
        const showDuration = performance.now() - showStart;
        ProfilePerf.log('showPage → 阶段2b-显示目标页面', showDuration, {
            pageId,
            pageFound,
            isLoginPage: pageId === 'login-page'
        });

        // 汇总
        ProfilePerf.log('showPage → 总耗时', performance.now() - start, {
            pageId,
            fromPage: currentPageId,
            isGoingBack,
            wasInitial: false,
            breakdown: {
                phase1Sync: +(phase2ScheduledAt - phase1Start).toFixed(2),
                waitDelay: +phase2Delay.toFixed(2),
                hidePages: +hideDuration.toFixed(2),
                showTarget: +showDuration.toFixed(2)
            }
        });
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
    try {
        updateAuthUI();
        setupAuthEventListeners();
    } catch (e) {
        console.error('[initAuth] 初始化异常:', e);
    } finally {
        // 无论是否出错，都必须移除初始化遮罩，否则页面永久白屏
        document.body.classList.add('auth-ready');
    }
}

window.deleteHistoryItem = deleteHistoryItem;
window.showPage = showPage;
window.goBack = goBack;
window.showAlert = showAlert;

export { initAuth, updateAuthUI, apiClient, showAlert };
