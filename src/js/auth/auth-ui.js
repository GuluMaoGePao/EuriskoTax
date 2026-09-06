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
    const email = document.getElementById('login-email').value.trim();
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
        showAlert('注册成功，请登录（邮箱已自动填入）', 'success', () => {
            document.getElementById('login-email').focus();
        });
        document.getElementById('login-tab').click();
        document.getElementById('register-username').value = '';
        document.getElementById('register-email').value = '';
        document.getElementById('register-phone').value = '';
        document.getElementById('register-password').value = '';
        document.getElementById('register-confirm-password').value = '';
        document.getElementById('register-invite-code').value = '';
        document.getElementById('register-code').value = '';
        document.getElementById('login-email').value = email;
    } catch (error) {
        showAlert(error.message);
    } finally {
        setLoading(btn, false);
    }
}

// 发送注册验证码：成功后进入 60 秒倒计时
const SEND_CODE_COOLDOWN = 60;
let sendCodeTimer = null;

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
        showAlert('验证码已发送，请查收邮箱（注意垃圾箱）', 'success');
        startSendCodeCountdown(SEND_CODE_COOLDOWN);
    } catch (error) {
        // 发送失败不进入倒计时，允许用户直接重试
        btn.textContent = '发送验证码';
        btn.disabled = false;
        // 已注册邮箱：后端返回 409，直接引导登录而非显示"发送失败"
        const msg = error.message || '';
        if (msg.includes('已注册') || msg.includes('already registered')) {
            showAlert(msg + '，如忘记密码请联系开发者重置', 'warning', function() {
                document.getElementById('login-tab').click();
            });
        } else {
            showAlert(msg);
        }
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
    document.getElementById('forgot-password').addEventListener('click', (e) => {
        e.preventDefault();
        showAlert(
            '公测期暂不支持自助找回密码。\n\n如需重置密码，请提供注册邮箱并联系开发者：\n• 邮箱：2649719969@qq.com\n• 说明您的注册邮箱，验证身份后为您重置\n\n重置后请及时修改为个人密码。',
            'warning'
        );
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
    // 用户协议和隐私政策弹窗
    document.getElementById('user-agreement-link').addEventListener('click', (e) => {
        e.preventDefault();
        openModal(document.getElementById('user-agreement-modal'));
    });
    document.getElementById('close-user-agreement-modal').addEventListener('click', () => {
        closeModal(document.getElementById('user-agreement-modal'));
    });
    document.getElementById('user-agreement-ok').addEventListener('click', () => {
        closeModal(document.getElementById('user-agreement-modal'));
    });
    // 点击遮罩关闭用户协议
    document.getElementById('user-agreement-modal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeModal(e.target);
    });
    document.getElementById('privacy-policy-link').addEventListener('click', (e) => {
        e.preventDefault();
        openModal(document.getElementById('privacy-policy-modal'));
    });
    document.getElementById('close-privacy-policy-modal').addEventListener('click', () => {
        closeModal(document.getElementById('privacy-policy-modal'));
    });
    document.getElementById('privacy-policy-ok').addEventListener('click', () => {
        closeModal(document.getElementById('privacy-policy-modal'));
    });
    // 点击遮罩关闭隐私政策
    document.getElementById('privacy-policy-modal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeModal(e.target);
    });
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
    msg.style.whiteSpace = 'pre-line';
    
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
