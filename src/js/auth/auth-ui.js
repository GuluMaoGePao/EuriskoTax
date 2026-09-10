import apiClient from '../api/api-client.js';

function showApp() {
    const loginPage = document.getElementById('login-page');
    if (loginPage) loginPage.classList.add('hidden');
    const appContainer = document.getElementById('app-container');
    if (appContainer) appContainer.classList.remove('hidden');
}

function showLoginPage() {
    const appContainer = document.getElementById('app-container');
    if (appContainer) appContainer.classList.add('hidden');
    const loginPage = document.getElementById('login-page');
    if (loginPage) loginPage.classList.remove('hidden');
}

function updateAuthUI() {
    if (apiClient.isLoggedIn()) {
        showApp();
        const user = apiClient.getCurrentUser();
        const authSection = document.getElementById('auth-section');
        if (authSection) authSection.classList.add('hidden');
        const userMenu = document.getElementById('user-menu');
        if (userMenu) userMenu.classList.remove('hidden');
        const userName = document.getElementById('user-name');
        if (userName) userName.textContent = user?.username || '用户';
    } else {
        showLoginPage();
        const authSection = document.getElementById('auth-section');
        if (authSection) authSection.classList.remove('hidden');
        const userMenu = document.getElementById('user-menu');
        if (userMenu) userMenu.classList.add('hidden');
    }
    renderPlanBadges(); // 阶段10/11：顶栏版本徽标（基础版/体验版/专业版）随登录态刷新
}

// 退出/注销时清理本地残留的用户数据，避免换号共用浏览器导致数据串号。
// 计算历史（taxCalculationHistory）为浏览器本地唯一数据源、随账号会话在本机产生，
// 登出即清空，防止换账号登录共用浏览器时看到他人计算记录（游客阶段不受影响）
function clearLocalUserData() {
    localStorage.removeItem('calculation_history');      // 旧遗留 key
    localStorage.removeItem('taxCalculationHistory');    // 主页/个人中心共用 key
    localStorage.removeItem('tax_profile');
    localStorage.removeItem('taxSyncMeta');              // 阶段10：云同步元数据（墓碑/cloudIds）随会话清理，防换号残留
    // 阶段10B：政策更新缓存与横幅 seen 状态随会话清理（退出/注销后不残留他人更新提示）
    if (window.TaxPolicy && typeof window.TaxPolicy.clearState === 'function') {
        window.TaxPolicy.clearState();
    }
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

// 阶段10B：专业版登录/恢复会话后静默拉取「政策要点」增量（免费版仅用内置快照，不发起请求）
function triggerPolicySyncIfPro() {
    try {
        const tp = window.TaxPolicy;
        if (!tp || typeof tp.syncNow !== 'function') return;
        const user = apiClient && typeof apiClient.getCurrentUser === 'function' ? apiClient.getCurrentUser() : null;
        if (!user) return;
        const planLib = window.EuriskoPlan;
        if (!planLib || typeof planLib.isPro !== 'function' || !planLib.isPro(user.plan, user.plan_expires_at)) return;
        tp.syncNow();
    } catch (e) {
        console.error('[policy] 政策同步异常:', e);
    }
}

async function handleLogin() {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const btn = document.getElementById('login-submit');
    
    if (!email || !password) {
        showAlert('请输入邮箱和密码');
        return;
    }
    
    // 「保持登录状态」：勾选 → token 存 localStorage（跨会话保持）；未勾选 → sessionStorage（关闭浏览器即失效）
    // 元素不存在（如单元测试环境）时默认保持登录（维持历史行为）
    const rememberMe = document.getElementById('remember-me')?.checked !== false;

    try {
        setLoading(btn, true);
        await apiClient.loginUser(email, password, rememberMe);
        clearPageHistory();
        updateAuthUI();
        // 阶段10：登录即自动开启云同步（PRO 后台拉取云端/上传本端增量，不阻塞登录流程）
        if (window.EuriskoSync && typeof window.EuriskoSync.afterLogin === 'function') {
            window.EuriskoSync.afterLogin(apiClient.getCurrentUser());
        }
        // 阶段10B：专业版静默拉取政策要点增量（免费版仅内置快照）
        triggerPolicySyncIfPro();
        // 登录成功后直接进入应用，不再弹「操作成功」确认框打断流程
        // （顶栏用户名与版本徽标已是明确的成功反馈）
    } catch (error) {
        showAlert(error.message);
    } finally {
        setLoading(btn, false);
    }
}

// === 注册表单字段级校验：必填项未填写时红字标注，填写后自动消除 ===
function showRegisterFieldError(fieldId, message) {
    const errorEl = document.getElementById(fieldId + '-error');
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
    }
    const field = document.getElementById(fieldId);
    if (field) field.classList.add('input-error');
    if (fieldId !== 'register-agree') {
        const label = document.querySelector(`label[for="${fieldId}"]`);
        if (label) label.classList.add('label-danger');
    }
    return !!errorEl;
}

function clearRegisterFieldError(fieldId) {
    const errorEl = document.getElementById(fieldId + '-error');
    if (errorEl) {
        errorEl.textContent = '';
        errorEl.classList.add('hidden');
    }
    const field = document.getElementById(fieldId);
    if (field) field.classList.remove('input-error');
    if (fieldId !== 'register-agree') {
        const label = document.querySelector(`label[for="${fieldId}"]`);
        if (label) label.classList.remove('label-danger');
    }
}

function clearAllRegisterFieldErrors() {
    [
        'register-username',
        'register-email',
        'register-code',
        'register-phone',
        'register-password',
        'register-confirm-password',
        'register-invite-code',
        'register-agree'
    ].forEach(clearRegisterFieldError);
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
    const agreeEl = document.getElementById('register-agree');

    clearAllRegisterFieldErrors();

    // 必填项未填写：就地红字标注对应字段，填写后自动消除
    const requiredChecks = [
        { fieldId: 'register-username', filled: !!username, message: '请输入用户名' },
        { fieldId: 'register-email', filled: !!email, message: '请输入邮箱' },
        { fieldId: 'register-code', filled: !!verificationCode, message: '请输入邮箱验证码' },
        { fieldId: 'register-password', filled: !!password, message: '请输入密码' },
        { fieldId: 'register-confirm-password', filled: !!confirmPassword, message: '请再次输入密码' },
        { fieldId: 'register-invite-code', filled: !!inviteCode, message: '请输入邀请码' }
    ];
    let firstInvalidId = null;
    const fallbackMessages = [];
    requiredChecks.forEach(({ fieldId, filled, message }) => {
        if (filled) return;
        if (!showRegisterFieldError(fieldId, message)) fallbackMessages.push(message);
        if (!firstInvalidId) firstInvalidId = fieldId;
    });

    if (agreeEl && !agreeEl.checked) {
        if (!showRegisterFieldError('register-agree', '请先阅读并勾选同意《用户协议》与《隐私政策》')) {
            fallbackMessages.push('请先阅读并勾选同意《用户协议》与《隐私政策》');
        }
        if (!firstInvalidId) firstInvalidId = 'register-agree';
    }

    if (firstInvalidId) {
        // 兼容无内联提示节点的旧版页面：给出弹窗兜底提示
        if (fallbackMessages.length > 0) showAlert(fallbackMessages[0]);
        const target = document.getElementById(firstInvalidId);
        if (target) target.focus();
        return;
    }

    if (password !== confirmPassword) {
        const message = '两次输入的密码不一致，请重新输入';
        showRegisterFieldError('register-password', message);
        showRegisterFieldError('register-confirm-password', message);
        document.getElementById('register-confirm-password').focus();
        return;
    }

    if (password.length < 6) {
        showRegisterFieldError('register-password', '密码长度不能少于 6 位');
        document.getElementById('register-password').focus();
        return;
    }

    if (phone && !/^1[3-9]\d{9}$/.test(phone)) {
        showRegisterFieldError('register-phone', '请输入正确的手机号（11 位数字）');
        document.getElementById('register-phone').focus();
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
        clearAllRegisterFieldErrors();
        showAlert('注册成功，请登录（注册邮箱已自动填入）', 'success', () => {
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
        if (!showRegisterFieldError('register-email', '请先输入注册邮箱')) showAlert('请先输入注册邮箱');
        document.getElementById('register-email').focus();
        return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        if (!showRegisterFieldError('register-email', '请输入正确的邮箱格式')) showAlert('请输入正确的邮箱格式');
        document.getElementById('register-email').focus();
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
        showAlert('验证码已发送至您的邮箱，请查收；若未收到，请查看垃圾邮件箱', 'success');
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
            showAlert('该邮箱已注册，请直接登录；如忘记密码，可通过「忘记密码」功能自助重置', 'warning', function() {
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
        el.innerHTML = '仅已注册邮箱可获取重置验证码；若收不到邮件请检查垃圾箱，或<a href="mailto:2044781167@qq.com" class="underline hover:text-white">联系开发者</a>';
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
    if (!panel || !loginForm) return;
    clearAllRegisterFieldErrors();

    // 复制当前登录邮箱到重置面板，减少输入
    const loginEmailValue = document.getElementById('login-email')?.value.trim() || '';
    const resetEmail = document.getElementById('reset-email');
    if (resetEmail && loginEmailValue) resetEmail.value = loginEmailValue;

    loginForm.classList.add('hidden');
    if (registerForm) registerForm.classList.add('hidden');
    panel.classList.remove('hidden');
    updateAuthAgreementText('reset');
    setActiveTab('login');
    setTimeout(() => resetEmail && resetEmail.focus(), 50);
}

// 隐藏重置面板并回到登录 Tab
function closeResetPasswordPanel() {
    const panel = document.getElementById('reset-password-form');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    if (!panel || !loginForm) return;
    clearAllRegisterFieldErrors();

    panel.classList.add('hidden');
    loginForm.classList.remove('hidden');
    if (registerForm) registerForm.classList.add('hidden');
    updateAuthAgreementText('login');
    setActiveTab('login');
}

// 切换登录/注册 Tab（若重置面板打开则自动回到对应表单）
function switchAuthTab(mode) {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const panel = document.getElementById('reset-password-form');
    if (!loginForm || !registerForm) return;
    clearAllRegisterFieldErrors();

    if (panel && !panel.classList.contains('hidden')) {
        panel.classList.add('hidden');
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
        showAlert('请先输入注册邮箱');
        return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showAlert('请输入正确的邮箱格式');
        return;
    }

    try {
        btn.disabled = true;
        btn.textContent = '发送中...';
        await apiClient.sendResetCode(email);
        if (codeInput) codeInput.value = '';
        showAlert('验证码已发送至您的邮箱，请查收；若未收到，请查看垃圾邮件箱', 'success');
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
        showAlert('请先输入注册邮箱');
        return;
    }
    if (!code) {
        showAlert('请输入邮箱验证码');
        return;
    }
    if (!newPassword || newPassword.length < 6) {
        showAlert('新密码长度不能少于 6 位');
        return;
    }
    if (newPassword !== confirmPassword) {
        showAlert('两次输入的新密码不一致，请重新输入');
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
    // 阶段10：云同步引擎登出（停防抖表、清本地同步元数据）
    if (window.EuriskoSync && typeof window.EuriskoSync.afterLogout === 'function') {
        window.EuriskoSync.afterLogout();
    }
    clearPageHistory();
    // updateAuthUI 会自动回到登录页，登录页重现即为退出成功的明确反馈，无需再弹确认框
    updateAuthUI();
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
        // 账户设置：同步"邮箱验证码改密"提示中的绑定邮箱，并启用发送按钮
        const verifyEmailEl = document.getElementById('profile-verify-email');
        if (verifyEmailEl) verifyEmailEl.textContent = user.email;
        const sendCodeBtn = document.getElementById('profile-send-code-btn');
        if (sendCodeBtn && !profileCodeTimer) sendCodeBtn.disabled = !user.email;
        document.getElementById('profile-display-name').textContent = user.username;
        document.getElementById('profile-display-email').textContent = user.email;
        // 阶段10/11：profile 返回最新 plan/过期时间 → 刷新版本徽标与同步引擎授权（三档：基础版/体验版/专业版）
        renderPlanBadges(user);
        if (window.EuriskoSync && typeof window.EuriskoSync.updateUser === 'function') {
            window.EuriskoSync.updateUser(user);
        }
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
        valueClass: 'text-xl sm:text-2xl font-bold text-blue-800'
    },
    {
        id: 'profile-stats-profiles',
        icon: 'fa-file-text-o',
        label: '档案数量',
        cardClass: 'bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-4 border border-green-200',
        iconBg: 'w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center mr-3',
        labelClass: 'text-sm text-green-600 font-medium',
        valueClass: 'text-xl sm:text-2xl font-bold text-green-800'
    },
    {
        id: 'profile-stats-history',
        icon: 'fa-history',
        label: '历史记录',
        cardClass: 'bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-4 border border-purple-200',
        iconBg: 'w-10 h-10 bg-purple-500 rounded-lg flex items-center justify-center mr-3',
        labelClass: 'text-sm text-purple-600 font-medium',
        valueClass: 'text-xl sm:text-2xl font-bold text-purple-800'
    },
    {
        id: 'profile-stats-reminders',
        icon: 'fa-calendar-check-o',
        label: '本月提醒',
        cardClass: 'bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-4 border border-orange-200',
        iconBg: 'w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center mr-3',
        labelClass: 'text-sm text-orange-600 font-medium',
        valueClass: 'text-xl sm:text-2xl font-bold text-orange-800'
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
        iconWrapClass: 'w-11 h-11 rounded-xl bg-blue-100 flex items-center justify-center shrink-0',
        iconClass: 'fa fa-history text-xl text-blue-600'
    },
    {
        id: 'profile-card-tax',
        icon: 'fa-file-text-o',
        title: '税务档案',
        desc: '设置常用扣除配置，快速应用',
        iconWrapClass: 'w-11 h-11 rounded-xl bg-green-100 flex items-center justify-center shrink-0',
        iconClass: 'fa fa-file-text-o text-xl text-green-600'
    },
    {
        id: 'profile-card-data',
        icon: 'fa-database',
        title: '数据管理',
        desc: '导出计算数据，备份与迁移',
        iconWrapClass: 'w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center shrink-0',
        iconClass: 'fa fa-database text-xl text-purple-600'
    },
    {
        id: 'profile-card-calendar',
        icon: 'fa-calendar',
        title: '税务日历',
        desc: '关键时间节点提醒',
        iconWrapClass: 'w-11 h-11 rounded-xl bg-orange-100 flex items-center justify-center shrink-0',
        iconClass: 'fa fa-calendar text-xl text-orange-600'
    },
    {
        id: 'profile-card-help',
        icon: 'fa-question-circle',
        title: '使用帮助',
        desc: '了解如何使用本工具',
        iconWrapClass: 'w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center shrink-0',
        iconClass: 'fa fa-question-circle text-xl text-gray-600'
    },
    {
        id: 'profile-card-about',
        icon: 'fa-info-circle',
        title: '关于我们',
        desc: '了解版本信息与开发者',
        iconWrapClass: 'w-11 h-11 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0',
        iconClass: 'fa fa-info-circle text-xl text-indigo-600'
    },
    {
        id: 'profile-card-feedback',
        icon: 'fa-comments-o',
        title: '意见反馈',
        desc: '提交 Bug、建议或截图，每条我们都会认真查看',
        iconWrapClass: 'w-11 h-11 rounded-xl bg-rose-100 flex items-center justify-center shrink-0',
        iconClass: 'fa fa-comments-o text-xl text-rose-600'
    }
];

// 渲染功能模块卡片（横向紧凑式：图标 + 说明 + 箭头，点击委托见 manageProfileEventBindings）
function renderProfileCards() {
    const grid = document.getElementById('profile-cards-grid');
    if (!grid || grid.children.length > 0) return; // 已渲染则跳过

    grid.innerHTML = PROFILE_CARDS_CONFIG.map(({ id, title, desc, iconWrapClass, iconClass }) => `
        <div class="card cursor-pointer profile-card-hover h-full" id="${id}">
            <div class="p-4 sm:p-5 flex items-center gap-3.5 sm:gap-4">
                <div class="${iconWrapClass}">
                    <i class="${iconClass}"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <h3 class="font-semibold text-gray-800 text-[15px] leading-snug">${title}</h3>
                    <p class="text-xs text-gray-500 mt-1 leading-relaxed">${desc}</p>
                </div>
                <i class="fa fa-chevron-right text-gray-300 flex-shrink-0"></i>
            </div>
        </div>
    `).join('');
}

function updateProfileStats() {
    // 与主页统一读 taxCalculationHistory（本地唯一数据源），修复此前读空服务端历史导致统计恒 0
    const history = getLocalHistory();
    const taxProfile = localStorage.getItem('tax_profile');

    // profile-stats-* 元素由「我的/个人中心」打开时动态注入（见 renderProfileStats），
    // 云同步完成回调可能先于个人中心渲染到达（首页加载即触发 doSync），此处必须容忍缺失。
    const calcEl = document.getElementById('profile-stats-calculations');
    const histEl = document.getElementById('profile-stats-history');
    const profEl = document.getElementById('profile-stats-profiles');
    const remEl = document.getElementById('profile-stats-reminders');
    if (calcEl) calcEl.textContent = history.length;
    if (histEl) histEl.textContent = history.length;
    if (profEl) profEl.textContent = taxProfile ? 1 : 0;
    if (remEl) remEl.textContent = getMonthlyReminders();
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

// 账户设置：保存手机号（独立生效，不再有页面级"保存修改"）
async function saveProfilePhone() {
    const phoneInput = document.getElementById('profile-phone');
    const phone = phoneInput.value.trim();
    const btn = document.getElementById('profile-phone-save');

    if (phone && !/^1[3-9]\d{9}$/.test(phone)) {
        showAlert('请输入正确的手机号（11 位数字）');
        return;
    }

    try {
        setLoading(btn, true);
        await apiClient.updateProfile({ phone });
        await loadProfile();
        showAlert('手机号已更新', 'success');
    } catch (error) {
        showAlert('保存失败: ' + error.message);
    } finally {
        setLoading(btn, false);
    }
}

// === 账户设置：邮箱验证码修改密码（与注册/忘记密码同一套验证码链路） ===
let profileCodeTimer = null;
const PROFILE_CODE_COOLDOWN = 60;

function startProfileCodeCountdown(seconds) {
    const btn = document.getElementById('profile-send-code-btn');
    if (!btn) return;
    let remaining = seconds;
    btn.disabled = true;
    btn.textContent = `${remaining}s 后重发`;
    if (profileCodeTimer) clearInterval(profileCodeTimer);
    profileCodeTimer = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
            clearInterval(profileCodeTimer);
            profileCodeTimer = null;
            btn.textContent = '发送验证码';
            btn.disabled = false;
        } else {
            btn.textContent = `${remaining}s 后重发`;
        }
    }, 1000);
}

// 发送验证码到当前登录绑定邮箱（后端仅允许已注册邮箱接收，天然防轰炸）
async function handleSendProfileCode() {
    const email = document.getElementById('profile-email').value.trim();
    const btn = document.getElementById('profile-send-code-btn');

    if (!email) {
        showAlert('未获取到绑定邮箱，请稍后重试');
        return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showAlert('绑定邮箱格式异常，请联系客服');
        return;
    }

    try {
        btn.disabled = true;
        btn.textContent = '发送中...';
        await apiClient.sendResetCode(email);
        const codeInput = document.getElementById('profile-code');
        if (codeInput) codeInput.value = '';
        showAlert('验证码已发送至 ' + email + '，请查收；若未收到请查看垃圾邮件箱', 'success');
        startProfileCodeCountdown(PROFILE_CODE_COOLDOWN);
    } catch (error) {
        btn.textContent = '发送验证码';
        btn.disabled = false;
        showAlert(error.message);
    }
}

// 提交验证码 + 新密码（后端校验验证码一次性有效，通过后直接更新密码哈希）
async function handleChangeProfilePassword() {
    const email = document.getElementById('profile-email').value.trim();
    const code = document.getElementById('profile-code').value.trim();
    const newPassword = document.getElementById('profile-password').value;
    const confirmPassword = document.getElementById('profile-confirm-password').value;
    const btn = document.getElementById('profile-password-submit');

    if (!code) {
        showAlert('请输入邮箱验证码');
        return;
    }
    if (!newPassword || newPassword.length < 6) {
        showAlert('新密码长度不能少于 6 位');
        return;
    }
    if (newPassword !== confirmPassword) {
        showAlert('两次输入的新密码不一致，请重新输入');
        return;
    }

    try {
        setLoading(btn, true);
        await apiClient.resetPassword(email, code, newPassword);
        document.getElementById('profile-code').value = '';
        document.getElementById('profile-password').value = '';
        document.getElementById('profile-confirm-password').value = '';
        showAlert('密码修改成功，下次登录请使用新密码', 'success');
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
        // 阶段10：注销账号同步重置云同步引擎（防已删账号状态残留触发无效同步）
        if (window.EuriskoSync && typeof window.EuriskoSync.afterLogout === 'function') {
            window.EuriskoSync.afterLogout();
        }
        clearPageHistory();
        updateAuthUI();
        showAlert('账号已注销，感谢您的使用', 'success');
    } catch (error) {
        showAlert('注销失败: ' + error.message);
    }
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

    // 阶段10：已同步过的记录删除 → 云端墓碑广播（同步引擎下次上传携带）；未同步过则忽略
    if (window.EuriskoSync && typeof window.EuriskoSync.recordLocalDelete === 'function') {
        window.EuriskoSync.recordLocalDelete(id);
    }
    dispatchHistoryMutated();

    // 同步刷新主页与个人中心各视图（主页渲染前会先从 localStorage 刷新镜像）
    refreshHomeHistoryViews();
    loadProfileHistory();
    updateProfileStats();
    showAlert('删除成功', 'success');
}

// === 阶段10/11：账户分层（三档：基础版/体验版/专业版）徽标 + 云同步面板 ===
// 顶栏 pill 三态样式（免费→素色、体验→紫色、专业→琥珀金）
const TOPBAR_BADGE_CLASSES = {
    free: 'inline-flex items-center gap-1 rounded-full border border-white/30 bg-white/10 px-2 py-1 text-[10px] font-bold leading-none text-white/90',
    trial: 'inline-flex items-center gap-1 rounded-full border border-violet-300 bg-violet-500 px-2 py-1 text-[10px] font-bold leading-none text-white',
    pro: 'inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-400 px-2 py-1 text-[10px] font-bold leading-none text-amber-950'
};
// 个人中心徽标落在蓝色渐变 banner 上，使用高亮 chips 保证可读
const PROFILE_BADGE_CLASSES = {
    free: 'px-2 py-0.5 rounded-full text-xs font-bold bg-white/25 text-white border border-white/30',
    trial: 'px-2 py-0.5 rounded-full text-xs font-bold bg-violet-200 text-violet-900',
    pro: 'px-2 py-0.5 rounded-full text-xs font-bold bg-amber-300 text-amber-950'
};

function fmtDate(iso) {
    if (!iso) return '';
    try {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return '';
        return d.toLocaleDateString('zh-CN');
    } catch (e) { return ''; }
}

// 依据当前 user 会话计算三档描述：未登录 null / { key, label, daysLeft, expireAt, permanent, expiredTrial }
function planTierOf(user) {
    const planLib = (typeof window !== 'undefined' && window.EuriskoPlan) ? window.EuriskoPlan : null;
    if (!planLib || !planLib.describe || !user) return null;
    return planLib.describe(user);
}

// 徽标短文案（体验版附剩余天数）
function tierShortLabel(tier) {
    if (!tier) return '';
    if (tier.key === 'trial') return tier.daysLeft > 0 ? `体验版 · 剩${tier.daysLeft}天` : '体验版';
    return tier.label; // 基础版 / 专业版
}

// 个人中心「我的版本」一行说明
function planNoteText(user) {
    const tier = planTierOf(user);
    if (!tier) return '';
    if (tier.key === 'free') {
        return tier.expiredTrial
            ? `专业版体验已于 ${fmtDate(tier.expireAt)} 到期，可再次免费领取`
            : '基础版 · 可免费领取 14 天专业版体验';
    }
    if (tier.key === 'trial') return `专业版体验进行中 · ${fmtDate(tier.expireAt)} 到期`;
    // 老渠道/种子授权（permanent）：正式上线后再单独告知测试用户可获得永久专业版，界面先不透露
    return tier.permanent ? '专业版已生效 · 全部专业功能可用' : `专业版有效期至 ${fmtDate(tier.expireAt)}`;
}

// 顶栏 pill + 个人中心徽标按档位渲染（登录后显示；未登录整体隐藏）
function renderPlanBadges(userArg) {
    const user = userArg || (apiClient && typeof apiClient.getCurrentUser === 'function' ? apiClient.getCurrentUser() : null);
    const tier = planTierOf(user); // null = 未登录
    const topbarBadge = document.getElementById('topbar-plan-badge');
    const profileBadge = document.getElementById('profile-plan-badge');
    const planNote = document.getElementById('profile-plan-note');
    if (!user) {
        if (topbarBadge) { topbarBadge.textContent = ''; topbarBadge.classList.add('hidden'); }
        if (profileBadge) { profileBadge.textContent = ''; profileBadge.classList.add('hidden'); }
        if (planNote) { planNote.textContent = ''; planNote.classList.add('hidden'); }
        return;
    }
    const key = (tier && tier.key) || 'free';
    const label = tierShortLabel(tier) || '基础版';
    if (topbarBadge) {
        topbarBadge.classList.remove('hidden');
        topbarBadge.textContent = label;
        topbarBadge.className = TOPBAR_BADGE_CLASSES[key];
        topbarBadge.title = key === 'free' ? '点击查看 · 免费领取专业版体验' : `${label} · 点击查看版本与权益`;
    }
    if (profileBadge) {
        profileBadge.classList.remove('hidden');
        profileBadge.textContent = label;
        profileBadge.className = PROFILE_BADGE_CLASSES[key];
    }
    if (planNote) {
        const note = planNoteText(user);
        planNote.textContent = note;
        planNote.classList.toggle('hidden', !note);
    }
}

// 本地历史被保存/删除时向云同步引擎广播变更信号（引擎防抖后自动同步，仅登录+PRO 生效）
function dispatchHistoryMutated() {
    if (typeof document === 'undefined' || typeof CustomEvent === 'undefined') return;
    try {
        document.dispatchEvent(new CustomEvent('euriskotax:history-mutated', { detail: { at: Date.now() } }));
    } catch (e) { /* 广播失败不影响主流程 */ }
}

// 「数据管理」页云同步面板：按 登录态 + 档位（基础版 gate / 体验版 / 专业版）渲染
function renderCloudSyncPanel() {
    const engine = (typeof window !== 'undefined' && window.EuriskoSync) ? window.EuriskoSync : null;
    const planLib = (typeof window !== 'undefined' && window.EuriskoPlan) ? window.EuriskoPlan : null;
    if (!engine || !planLib) return;
    const statusEl = document.getElementById('cloud-sync-status');
    const tierEl = document.getElementById('cloud-sync-tier-badge');
    const noteEl = document.getElementById('cloud-sync-note');
    const btn = document.getElementById('cloud-sync-now-btn');
    const accountEl = document.getElementById('cloud-sync-account');
    const ctaEl = document.getElementById('cloud-sync-cta');
    const user = apiClient && typeof apiClient.getCurrentUser === 'function' ? apiClient.getCurrentUser() : null;
    const state = engine.getState();
    const tier = planLib.describe ? planLib.describe(user) : null; // null = 未登录

    const setTierChip = (key, label) => {
        if (!tierEl) return;
        tierEl.classList.remove('hidden');
        tierEl.textContent = label;
        tierEl.className = 'ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold leading-none ' +
            (key === 'trial' ? 'bg-violet-100 text-violet-700'
                : key === 'pro' ? 'bg-amber-100 text-amber-700'
                : 'bg-gray-100 text-gray-600');
    };
    const setCta = (html) => {
        if (!ctaEl) return;
        if (html) { ctaEl.innerHTML = html; ctaEl.classList.remove('hidden'); }
        else { ctaEl.classList.add('hidden'); ctaEl.innerHTML = ''; }
    };
    const disableSyncBtn = (disabled) => { if (btn) btn.disabled = !!disabled; };
    const syncStatusTexts = { idle: '待同步', syncing: '同步中…', synced: '已同步', error: '同步异常' };

    // 未登录：引导登录领取体验
    if (!user) {
        if (tierEl) { tierEl.classList.add('hidden'); tierEl.textContent = ''; }
        if (statusEl) { statusEl.textContent = '未登录'; statusEl.classList.remove('text-green-600', 'text-red-600'); }
        if (noteEl) noteEl.textContent = '云同步为专业版功能。登录后即可免费领取 14 天专业版体验（公测期不限次数），体验期内自动把本机计算历史安全同步到云端。';
        disableSyncBtn(true);
        if (accountEl) accountEl.textContent = '';
        setCta('<p class="text-violet-800"><i class="fa fa-gift mr-1 text-violet-500"></i>登录后即可免费领取 14 天专业版体验，多设备自动找回计算历史。</p>' +
            '<button id="cloud-sync-claim-btn" type="button" class="mt-2 inline-flex items-center rounded-lg bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-semibold px-4 py-2 text-sm"><i class="fa fa-unlock-alt mr-2"></i>登录领取体验</button>');
        return;
    }

    // 基础版（含体验到期回落）：展示 PRO gate + 免费体验 CTA
    if (!tier || tier.key === 'free') {
        setTierChip('free', '基础版');
        if (statusEl) { statusEl.textContent = '免费版'; statusEl.classList.remove('text-green-600', 'text-red-600'); }
        if (noteEl) noteEl.textContent = tier && tier.expiredTrial
            ? '您的专业版体验已到期，云端同步暂不可用；随时可再次免费领取新一轮 14 天体验。'
            : planLib.PRO_FEATURE_HINT;
        disableSyncBtn(true);
        if (accountEl) accountEl.textContent = `当前账号：${user.email}（基础版）`;
        setCta('<p class="text-violet-800"><i class="fa fa-gift mr-1 text-violet-500"></i>免费领取 14 天专业版体验，解锁云同步、汇算 PDF 报告与政策更新。</p>' +
            '<button id="cloud-sync-claim-btn" type="button" class="mt-2 inline-flex items-center rounded-lg bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-semibold px-4 py-2 text-sm"><i class="fa fa-gift mr-2"></i>免费领取 14 天专业版体验</button>');
        return;
    }

    // 体验版 / 专业版：正常同步面板
    setTierChip(tier.key, tier.key === 'trial' ? `体验版 · 剩${tier.daysLeft || 0}天` : '专业版');
    setCta('');
    if (statusEl) {
        statusEl.textContent = syncStatusTexts[state.status] || '待同步';
        statusEl.classList.toggle('text-green-600', state.status === 'synced');
        statusEl.classList.toggle('text-red-600', state.status === 'error');
    }
    if (noteEl) noteEl.textContent = state.message || '自动同步已开启：本机计算历史将安全备份，多设备登录同一账号即可找回。';
    disableSyncBtn(state.status === 'syncing');
    if (accountEl) accountEl.textContent = `当前账号：${user.email}`;
}

// === 版本权益弹窗：按档位渲染 hero + 领取 CTA ===
function upgradeHeroHtml(user) {
    const planLib = (typeof window !== 'undefined' && window.EuriskoPlan) ? window.EuriskoPlan : null;
    const tier = planLib && planLib.describe ? planLib.describe(user) : null;
    const trialDays = (planLib && planLib.TRIAL_DAYS) || 14;
    const claimBtn = (label) =>
        '<button id="upgrade-claim-btn" type="button" class="mt-3 inline-flex items-center rounded-lg bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-semibold px-5 py-2 text-sm shadow"><i class="fa fa-gift mr-2"></i>' + label + '</button>';

    if (!user) {
        return '<div class="text-center">' +
            '<p class="text-violet-700 font-bold text-base">登录后免费领取 14 天专业版体验</p>' +
            '<p class="text-gray-500 text-xs mt-1">体验期内完整解锁云同步、汇算 PDF 报告与政策更新；公测期不限次数。</p>' +
            claimBtn('登录领取体验') + '</div>';
    }
    if (!tier || tier.key === 'free') {
        const expired = !!(tier && tier.expiredTrial);
        return '<div class="flex">' +
            '<div class="flex-1">' +
            '<p class="text-violet-700 font-bold text-base">' + (expired ? '体验已到期，可再次免费领取' : '免费领取 14 天专业版体验') + '</p>' +
            '<p class="text-gray-500 text-xs mt-1">' + (expired
                ? '上一轮体验已于 ' + fmtDate(tier.expireAt) + ' 到期，重新领取后立即恢复全部专业版功能，本地数据不受影响。'
                : '基础版用户可免费试用全部专业版功能 14 天。体验期间计税与历史数据不受任何影响，到期自动回落基础版。') + '</p>' +
            claimBtn('立即免费领取体验') + '</div></div>';
    }
    if (tier.key === 'trial') {
        const pct = Math.min(100, Math.max(6, Math.round(((tier.daysLeft || 0) / trialDays) * 100)));
        const warn = (tier.daysLeft || 0) <= 3;
        return '<div>' +
            '<div class="flex items-center justify-between mb-2">' +
            '<div class="flex items-center"><span class="px-2 py-0.5 rounded-full text-xs font-bold bg-violet-100 text-violet-700">体验版</span>' +
            '<span class="ml-2 text-sm font-semibold text-violet-800">剩余 ' + (tier.daysLeft || 0) + ' 天</span></div>' +
            '<span class="text-xs text-gray-400">' + fmtDate(tier.expireAt) + ' 到期</span></div>' +
            '<div class="h-2 rounded-full bg-violet-200 overflow-hidden"><div class="h-full rounded-full bg-gradient-to-r from-violet-500 to-purple-600" style="width:' + pct + '%"></div></div>' +
            '<p class="text-xs mt-2 ' + (warn ? 'text-amber-600 font-medium' : 'text-gray-500') + '">' +
            (warn ? '体验即将到期：请确认云端数据已同步。到期后自动回到基础版，仍可再次免费领取。' : '专业版全功能体验中：云同步、汇算 PDF 报告、政策更新均已解锁。到期后自动回到基础版，可再次免费领取。') + '</p></div>';
    }
    // 专业版：seed/正式授权均落此态；正式上线前不向用户明示"永久专业版授权"，用通用权益文案呈现
    const trailing = tier.permanent
        ? '您已开通专业版，云同步、汇算清缴 PDF 报告与政策更新等全部专业功能均可用。'
        : '专业版有效期至 ' + fmtDate(tier.expireAt) + '，云同步、汇算清缴 PDF 报告与政策更新等全部专业功能随时可用。';
    return '<div class="flex items-start">' +
        '<div class="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center mr-3 flex-shrink-0"><i class="fa fa-check text-amber-600 text-xl"></i></div>' +
        '<div><p class="text-amber-700 font-bold text-base">专业版已启用</p>' +
        '<p class="text-gray-500 text-xs mt-1">' + trailing + '</p></div></div>';
}

function openUpgradeModal() {
    const modal = document.getElementById('upgrade-modal');
    if (!modal) return;
    const hero = document.getElementById('upgrade-hero');
    const user = apiClient && typeof apiClient.getCurrentUser === 'function' ? apiClient.getCurrentUser() : null;
    if (hero) hero.innerHTML = upgradeHeroHtml(user);
    openModal(modal);
}

// 领取专业版体验（顶栏弹窗 / 数据管理页云同步 CTA 共用）
async function handleClaimTrial(btn) {
    if (!apiClient || typeof apiClient.isLoggedIn !== 'function' || !apiClient.isLoggedIn()) {
        showAlert('请先登录，即可免费领取 14 天专业版体验');
        return;
    }
    if (!apiClient.claimTrial) {
        showAlert('服务暂不可用，请刷新页面后重试');
        return;
    }
    const origHtml = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="loading-spinner inline-block w-4 h-4 mr-2"></span>开通中…';
    }
    try {
        const updated = await apiClient.claimTrial();
        if (window.EuriskoSync && typeof window.EuriskoSync.updateUser === 'function') {
            window.EuriskoSync.updateUser(updated);
        }
        renderPlanBadges(updated);
        renderCloudSyncPanel();
        const hero = document.getElementById('upgrade-hero');
        if (hero) hero.innerHTML = upgradeHeroHtml(updated);
        showAlert('已开通 14 天专业版体验，云同步与全部专业功能已生效', 'success');
    } catch (err) {
        if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = origHtml; }
        showAlert((err && err.message) || '领取失败，请稍后重试');
    }
}

// 云同步完成 → 统一刷新以 localStorage 为唯一数据源的各历史视图（避免 UI 与本地镜像脱节）
function refreshAfterCloudSync() {
    refreshHomeHistoryViews();
    updateProfileStats();
    const historyPage = document.getElementById('profile-history-page');
    if (historyPage && !historyPage.classList.contains('hidden')) {
        loadProfileHistory();
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

// 本地开发专用入口：仅 localhost / 127.0.0.1 显示"填入本地测试账号"。
// 生产环境不注入该节点（开发/测试入口绝不泄漏到公网）；点击只填表不自动登录。
function setupDevLoginFill() {
    const host = window.location.hostname;
    if (host !== 'localhost' && host !== '127.0.0.1') return;
    const form = document.getElementById('login-form');
    // 仅当真实登录表单包含登录按钮时才注入（单元测试的空 fixture 自动跳过）
    if (!form || !form.querySelector('#login-submit')) return;
    if (form.querySelector('.dev-login-fill')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dev-login-fill mt-1 w-full text-center text-xs text-blue-500 hover:text-blue-700 underline underline-offset-2';
    btn.textContent = '开发环境：填入本地测试账号';
    btn.title = '自动填入 dev@example.com / password，仍需手动点击「登录」';
    btn.addEventListener('click', () => {
        const emailInput = document.getElementById('login-email');
        const pwdInput = document.getElementById('login-password');
        if (emailInput) emailInput.value = 'dev@example.com';
        if (pwdInput) pwdInput.value = 'password';
        showAlert('已填入本地测试账号，请点击「登录」', 'info');
    });
    form.appendChild(btn);
}

function setupAuthEventListeners() {
    const loginTab = document.getElementById('login-tab');
    if (loginTab) loginTab.addEventListener('click', () => switchAuthTab('login'));
    const registerTab = document.getElementById('register-tab');
    if (registerTab) registerTab.addEventListener('click', () => switchAuthTab('register'));

    const loginSubmit = document.getElementById('login-submit');
    if (loginSubmit) loginSubmit.addEventListener('click', handleLogin);
    // 忘记密码 → 打开重置密码面板（自助找回）
    const forgotPassword = document.getElementById('forgot-password');
    if (forgotPassword) {
        forgotPassword.addEventListener('click', (e) => {
            e.preventDefault();
            showResetPasswordPanel();
        });
    }
    const registerSubmit = document.getElementById('register-submit');
    if (registerSubmit) registerSubmit.addEventListener('click', handleRegister);
    const sendCodeBtn = document.getElementById('send-code-btn');
    if (sendCodeBtn) sendCodeBtn.addEventListener('click', handleSendCode);
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
    // === 注册表单必填红字提示：填写即消除、空值失焦即标注 ===
    const REGISTER_BLUR_ERROR_MESSAGES = {
        'register-username': '请输入用户名',
        'register-email': '请输入邮箱',
        'register-code': '请输入邮箱验证码',
        'register-password': '请输入密码',
        'register-confirm-password': '请再次输入密码',
        'register-invite-code': '请输入邀请码'
    };
    Object.keys(REGISTER_BLUR_ERROR_MESSAGES).forEach(id => {
        const fieldEl = document.getElementById(id);
        if (!fieldEl) return;
        fieldEl.addEventListener('input', () => clearRegisterFieldError(id));
        // 离开空必填项时红字标注；重新填写后自动消除
        fieldEl.addEventListener('blur', () => {
            if (!fieldEl.value.trim()) {
                showRegisterFieldError(id, REGISTER_BLUR_ERROR_MESSAGES[id]);
            }
        });
    });
    // 密码与确认密码任一改动，均解除两者的一致性报错
    ['register-password', 'register-confirm-password'].forEach(id => {
        const fieldEl = document.getElementById(id);
        if (!fieldEl) return;
        fieldEl.addEventListener('input', () => {
            clearRegisterFieldError('register-password');
            clearRegisterFieldError('register-confirm-password');
        });
    });
    const registerAgreeCheckbox = document.getElementById('register-agree');
    if (registerAgreeCheckbox) {
        registerAgreeCheckbox.addEventListener('change', () => clearRegisterFieldError('register-agree'));
    }
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

    const profilePhoneSaveBtn = document.getElementById('profile-phone-save');
    if (profilePhoneSaveBtn) profilePhoneSaveBtn.addEventListener('click', saveProfilePhone);
    const profileSendCodeBtn = document.getElementById('profile-send-code-btn');
    if (profileSendCodeBtn) profileSendCodeBtn.addEventListener('click', handleSendProfileCode);
    const profilePasswordSubmitBtn = document.getElementById('profile-password-submit');
    if (profilePasswordSubmitBtn) profilePasswordSubmitBtn.addEventListener('click', handleChangeProfilePassword);
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

    // === 阶段10：云同步手动触发 + 状态/完成事件 ===
    const cloudSyncBtn = document.getElementById('cloud-sync-now-btn');
    if (cloudSyncBtn) {
        cloudSyncBtn.addEventListener('click', async () => {
            const engine = window.EuriskoSync;
            if (!engine) { showAlert('云同步模块未加载，请刷新页面重试'); return; }
            const state = await engine.syncNow();
            renderCloudSyncPanel();
            if (state && state.status === 'error') {
                showAlert(state.message || '同步失败，请稍后重试');
            }
        });
    }
    if (typeof document.addEventListener === 'function') {
        document.addEventListener('euriskotax:sync-status', () => {
            // 面板元素不在 DOM（尚未进入数据管理页）时静默跳过，进入时由 loadFn 兜底刷新
            if (document.getElementById('cloud-sync-status')) renderCloudSyncPanel();
        });
        document.addEventListener('euriskotax:history-synced', refreshAfterCloudSync);

        // === 版本权益弹窗（三档体系：基础版/体验版/专业版）事件绑定 ===
        const upgradeModalEl = document.getElementById('upgrade-modal');
        const topbarPlanBadgeBtn = document.getElementById('topbar-plan-badge');
        if (topbarPlanBadgeBtn) topbarPlanBadgeBtn.addEventListener('click', openUpgradeModal);
        const topbarPlanEntry = document.getElementById('topbar-plan-entry');
        if (topbarPlanEntry) {
            topbarPlanEntry.addEventListener('click', (e) => {
                e.preventDefault();
                const dd = document.getElementById('user-dropdown');
                if (dd) dd.classList.add('hidden');
                openUpgradeModal();
            });
        }
        if (upgradeModalEl) {
            const closeUpgrade = () => closeModal(upgradeModalEl);
            const closeBtn = document.getElementById('close-upgrade-modal');
            if (closeBtn) closeBtn.addEventListener('click', closeUpgrade);
            const cancelBtn = document.getElementById('upgrade-cancel-btn');
            if (cancelBtn) cancelBtn.addEventListener('click', closeUpgrade);
            // 领取按钮委托：内容随档位动态填充
            upgradeModalEl.addEventListener('click', (e) => {
                const claimBtn = e.target.closest('#upgrade-claim-btn');
                if (!claimBtn) return;
                e.preventDefault();
                handleClaimTrial(claimBtn);
            });
        }
        // 数据管理页云同步 CTA 的领取按钮委托（CTA 由 renderCloudSyncPanel 动态注入）
        const dataPageEl = document.getElementById('profile-data-page');
        if (dataPageEl) {
            dataPageEl.addEventListener('click', (e) => {
                const claimBtn = e.target.closest('#cloud-sync-claim-btn');
                if (!claimBtn) return;
                e.preventDefault();
                handleClaimTrial(claimBtn);
            });
        }
    }

    // === 通用个人中心卡片点击处理（事件委托，支持动态生成的卡片） ===
    // 配置: { 卡片ID, 目标页面ID, 加载函数(可选), 特殊处理(可选) }
    const profileCardConfigs = [
        { cardId: 'profile-card-history', pageId: 'profile-history-page', loadFn: loadProfileHistory },
        { cardId: 'profile-card-tax', pageId: 'profile-tax-page', loadFn: loadProfileTax },
        { cardId: 'profile-card-data', pageId: 'profile-data-page', loadFn: renderCloudSyncPanel },
        { cardId: 'profile-card-calendar', pageId: 'profile-calendar-page', loadFn: loadProfileCalendar },
        { cardId: 'profile-card-help', specialFn: () => openModal(document.getElementById('help-modal')) },
        { cardId: 'profile-card-about', specialFn: () => openModal(document.getElementById('about-modal')) },
        { cardId: 'profile-card-feedback', specialFn: () => openModal(document.getElementById('feedback-modal')) }
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
    bindCloseBtn('close-feedback-modal', 'feedback-modal');

    // 意见反馈弹窗：取消 / 内容字数统计 / 提交
    const feedbackModalEl = document.getElementById('feedback-modal');
    const feedbackCancelBtn = document.getElementById('feedback-cancel-btn');
    if (feedbackCancelBtn) {
        feedbackCancelBtn.addEventListener('click', () => closeModal(feedbackModalEl));
    }
    const feedbackContentInput = document.getElementById('feedback-content');
    if (feedbackContentInput) {
        feedbackContentInput.addEventListener('input', () => {
            const countEl = document.getElementById('feedback-content-count');
            if (countEl) countEl.textContent = String(feedbackContentInput.value.length);
        });
    }
    const feedbackSubmitBtn = document.getElementById('feedback-submit-btn');
    if (feedbackSubmitBtn) feedbackSubmitBtn.addEventListener('click', handleSubmitFeedback);

    // 意见反馈附图：选择 / 移除
    const feedbackAddAttachmentBtn = document.getElementById('feedback-add-attachment');
    const feedbackFileInputEl = document.getElementById('feedback-file-input');
    if (feedbackAddAttachmentBtn && feedbackFileInputEl) {
        feedbackAddAttachmentBtn.addEventListener('click', () => feedbackFileInputEl.click());
    }
    if (feedbackFileInputEl) {
        feedbackFileInputEl.addEventListener('change', handleFeedbackFilesSelected);
    }
    const feedbackAttachmentGrid = document.getElementById('feedback-attachment-grid');
    if (feedbackAttachmentGrid) {
        feedbackAttachmentGrid.addEventListener('click', (e) => {
            const removeBtn = e.target.closest('[data-remove-attachment]');
            if (!removeBtn) return;
            const index = Number(removeBtn.dataset.removeAttachment);
            if (Number.isInteger(index) && index >= 0 && index < pendingFeedbackAttachments.length) {
                pendingFeedbackAttachments.splice(index, 1);
                renderFeedbackAttachmentThumbs();
            }
        });
    }

    // ESC 关闭当前最上层弹窗（协议/隐私/帮助/关于/alert/confirm 统一处理）
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && openModalSet.size > 0) {
            closeModal([...openModalSet][openModalSet.size - 1]);
        }
    });

    // 本地开发登录入口（仅 localhost 注入，见函数内 hostname 判断）
    setupDevLoginFill();
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
        warning: { icon: 'fa-exclamation-triangle', bg: 'bg-amber-100', color: 'text-amber-600', title: '提示' },
        error: { icon: 'fa-times-circle', bg: 'bg-red-100', color: 'text-red-600', title: '提示' },
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
    // 弹窗若嵌套在隐藏容器（如登录页时 #app-container 为 hidden）内，
    // fixed 定位会随祖先隐藏而不可见。打开前挂到 body 顶层，保证任何场景都能弹出。
    if (modal.parentNode && modal.parentNode !== document.body) {
        document.body.appendChild(modal);
    }
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
    // UI 刷新与事件绑定分别隔离：即使 updateAuthUI 因页面 DOM 未就绪而异常，
    // 也绝不影响登录/注册按钮的事件绑定（此前一处 null.classList 异常会被
    // try/catch 吞掉，导致 setupAuthEventListeners 从未执行 → 点击登录无反应）。
    try {
        updateAuthUI();
    } catch (e) {
        console.error('[initAuth] updateAuthUI 异常:', e);
    }
    // 阶段10：恢复会话后启动云同步引擎（attach 变更监听；已登录则防抖自动同步，未登录仅清引擎态）
    try {
        const syncEngine = window.EuriskoSync;
        const currentUser = apiClient && typeof apiClient.getCurrentUser === 'function' ? apiClient.getCurrentUser() : null;
        if (syncEngine && typeof syncEngine.restore === 'function') {
            syncEngine.restore(currentUser || null);
        }
    } catch (e) {
        console.error('[initAuth] 云同步初始化异常:', e);
    }
    // 阶段10B：恢复会话（已登录专业版）后静默拉取政策要点增量
    try {
        triggerPolicySyncIfPro();
    } catch (e) {
        console.error('[initAuth] 政策同步初始化异常:', e);
    }
    try {
        setupAuthEventListeners();
    } catch (e) {
        console.error('[initAuth] 事件绑定异常:', e);
    } finally {
        // 无论是否出错，都必须移除初始化遮罩，否则页面永久白屏
        document.body.classList.add('auth-ready');
    }
}

window.deleteHistoryItem = deleteHistoryItem;
window.showPage = showPage;
window.goBack = goBack;
window.showAlert = showAlert;

// === 意见反馈附图：压缩 + 预览管理（随反馈文本一起提交，最多 3 张） ===
const MAX_FEEDBACK_ATTACHMENTS = 3;
const MAX_ATTACHMENT_SIDE = 1280;           // 压缩后长边上限（px）
const MAX_ATTACHMENT_DATA_URL_LEN = 900000; // 单张 dataURL 字符上限（与服务端校验一致）
const pendingFeedbackAttachments = [];      // 模块级待提交 dataURL 列表；提交成功后清空

const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.readAsDataURL(file);
});

const loadImageFromDataUrl = (dataUrl) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片解析失败'));
    img.src = dataUrl;
});

// 压缩：逐档降质量/尺寸，保证输出 dataURL 不超服务端上限（png/webp 均转 jpeg，统一规则）
async function compressFeedbackImage(file) {
    const dataUrl = await readFileAsDataUrl(file);
    const img = await loadImageFromDataUrl(dataUrl);
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    if (!width || !height) throw new Error('无法读取图片尺寸');
    const baseScale = Math.min(1, MAX_ATTACHMENT_SIDE / Math.max(width, height));
    const attempts = [
        { scale: baseScale, quality: 0.8 },
        { scale: baseScale * 0.75, quality: 0.65 },
        { scale: baseScale * 0.5, quality: 0.5 },
        { scale: baseScale * 0.35, quality: 0.45 }
    ];
    for (const { scale, quality } of attempts) {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const out = canvas.toDataURL('image/jpeg', quality);
        if (out.length <= MAX_ATTACHMENT_DATA_URL_LEN) return out;
    }
    throw new Error('图片过大，请换一张更小的截图');
}

function renderFeedbackAttachmentThumbs() {
    const grid = document.getElementById('feedback-attachment-grid');
    if (!grid) return;
    grid.innerHTML = pendingFeedbackAttachments.map((dataUrl, index) => `
        <div class="relative">
            <img src="${dataUrl}" alt="反馈附图${index + 1}" class="w-20 h-20 rounded-lg border border-gray-200 object-cover">
            <button type="button" data-remove-attachment="${index}" title="移除这张图片"
                class="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gray-700/80 hover:bg-red-600 text-white rounded-full text-xs flex items-center justify-center transition-colors">
                <i class="fa fa-times"></i>
            </button>
        </div>
    `).join('');
    const addBtn = document.getElementById('feedback-add-attachment');
    if (addBtn) {
        const full = pendingFeedbackAttachments.length >= MAX_FEEDBACK_ATTACHMENTS;
        addBtn.disabled = full;
        addBtn.classList.toggle('opacity-50', full);
    }
}

async function handleFeedbackFilesSelected(event) {
    const fileInput = document.getElementById('feedback-file-input');
    const files = Array.from(event.target.files || []).filter((f) => f && f.type && f.type.startsWith('image/'));
    if (fileInput) fileInput.value = ''; // 允许再次选择同一文件
    if (!files.length) return;
    const room = MAX_FEEDBACK_ATTACHMENTS - pendingFeedbackAttachments.length;
    if (room <= 0) {
        showAlert(`最多添加 ${MAX_FEEDBACK_ATTACHMENTS} 张图片`);
        return;
    }
    const picked = files.slice(0, room);
    if (files.length > room) showAlert(`最多添加 ${MAX_FEEDBACK_ATTACHMENTS} 张图片，已保留前 ${room} 张`);
    let added = 0;
    for (const file of picked) {
        try {
            pendingFeedbackAttachments.push(await compressFeedbackImage(file));
            added += 1;
        } catch (err) {
            showAlert(`${file.name}：${err.message || '处理失败'}`);
        }
    }
    if (added > 0) renderFeedbackAttachmentThumbs();
}

function resetFeedbackAttachments() {
    pendingFeedbackAttachments.length = 0;
    renderFeedbackAttachmentThumbs();
}

// === 意见反馈提交（个人中心"意见反馈"卡片入口） ===
// 提交后落库（文本 + 附图 dataURL），供开发者逐条跟进；采纳的改进会记录在更新日志并致谢
async function handleSubmitFeedback() {
    const modal = document.getElementById('feedback-modal');
    const contentInput = document.getElementById('feedback-content');
    const content = contentInput ? contentInput.value.trim() : '';
    if (!content) {
        showAlert('请输入反馈内容');
        return;
    }
    const category = document.getElementById('feedback-category')?.value || 'general';
    const ratingRaw = document.getElementById('feedback-rating')?.value || '';
    const rating = ratingRaw ? Number(ratingRaw) : null;

    try {
        await apiClient.submitFeedback({
            category,
            content,
            rating,
            attachments: pendingFeedbackAttachments.slice()
        });
        if (contentInput) contentInput.value = '';
        const countEl = document.getElementById('feedback-content-count');
        if (countEl) countEl.textContent = '0';
        const fileInput = document.getElementById('feedback-file-input');
        if (fileInput) fileInput.value = '';
        resetFeedbackAttachments();
        closeModal(modal);
        showAlert('已收到，谢谢！被采纳的反馈会记录在更新日志的致谢名单中', 'success');
    } catch (err) {
        showAlert(err.message || '提交失败，请稍后重试');
    }
}

export { initAuth, updateAuthUI, apiClient, showAlert };
