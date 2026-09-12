// 动态获取 API 地址：生产环境使用当前域名，开发环境使用 localhost
const API_BASE_URL = (() => {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return 'http://localhost:3000/api';
    }
    // 生产环境：使用当前域名
    return `${window.location.protocol}//${window.location.host}/api`;
})();

// 会话存储策略：
//   - 登录时勾选「保持登录状态」→ localStorage（跨浏览器会话保持登录）
//   - 未勾选 → sessionStorage（关闭标签页/浏览器即失效）
// 读取时两级都查，兼容历史版本只写 localStorage 的旧数据。
function getAuthToken() {
    return sessionStorage.getItem('auth_token') || localStorage.getItem('auth_token');
}

function setAuthToken(token, persistent = true) {
    if (persistent) {
        localStorage.setItem('auth_token', token);
        sessionStorage.removeItem('auth_token');
    } else {
        sessionStorage.setItem('auth_token', token);
        localStorage.removeItem('auth_token');
    }
}

function removeAuthToken() {
    localStorage.removeItem('auth_token');
    sessionStorage.removeItem('auth_token');
}

function getCurrentUser() {
    const userStr = sessionStorage.getItem('current_user') || localStorage.getItem('current_user');
    return userStr ? JSON.parse(userStr) : null;
}

function setCurrentUser(user, persistent = true) {
    if (persistent) {
        localStorage.setItem('current_user', JSON.stringify(user));
        sessionStorage.removeItem('current_user');
    } else {
        sessionStorage.setItem('current_user', JSON.stringify(user));
        localStorage.removeItem('current_user');
    }
}

function removeCurrentUser() {
    localStorage.removeItem('current_user');
    sessionStorage.removeItem('current_user');
}

// 后端英文错误消息 → 用户友好的中文提示（未匹配到的原样透出）
const ERROR_MESSAGE_MAP = {
    'Username, email and password are required': '请填写用户名、邮箱和密码',
    'Email and password are required': '请填写邮箱和密码',
    'Username or email already exists': '用户名或邮箱已被注册',
    'Invalid email or password': '邮箱或密码错误',
    'Invalid invite code. Public beta requires an invite code.': '邀请码无效，公测期注册需要有效邀请码',
    'Invite code is required': '请填写邀请码',
    'Invite code not found': '邀请码无效，请向开发者获取',
    'Invite code already used': '该邀请码已被使用，每个邀请码仅可注册一个账号',
    'Email already registered. Please login directly': '该邮箱已注册，请直接登录',
    'Username already taken': '用户名已被占用，请换一个',
    'Verification code is required': '请填写邮箱验证码',
    'Email is required': '请填写邮箱',
    'Invalid email format': '邮箱格式不正确',
    'Code resend too frequent. Please wait a moment': '验证码发送过于频繁，请稍后再试',
    'SMTP mail is not configured': '邮件服务未配置，请联系开发者',
    'Verification code not found. Please request a new one': '请先获取验证码',
    'Verification code expired. Please request a new one': '验证码已过期，请重新获取',
    'Too many attempts. Please request a new code': '错误次数过多，验证码已失效，请重新获取',
    'Invalid verification code': '验证码错误，请重新输入',
    'Feedback content is required': '请填写反馈内容',
    'Feedback content must be less than 5000 characters': '反馈内容不能超过5000字符',
    'Calculation not found': '计算记录不存在',
    'Access denied': '无权访问该记录',
    'User not found': '用户不存在',
    'Authentication required': '请先登录',
    '当前密码验证失败': '当前密码验证失败',
    'Password must be at least 6 characters': '密码长度至少6位',
    'User with this email was not found': '该邮箱未注册，请先注册',
    'Email, verification code and new password are required': '请填写邮箱、验证码和新密码',
    'Count must be an integer between 1 and 100': '数量必须是 1 到 100 之间的整数',
    'Invalid attachments. At most 3 compressed images (png/jpeg/webp, <= 900K each)': '附图数量或格式不正确（最多 3 张 png/jpeg/webp 图片）',
    'Invalid admin token': '管理员令牌无效',
    'Stats endpoint is not configured. Set ADMIN_TOKEN environment variable first.': '统计接口未配置，请联系开发者',
    '请求过于频繁，请 15 分钟后再试': '请求过于频繁，请 15 分钟后再试',
    '验证码发送过于频繁，请 15 分钟后再试': '验证码发送过于频繁，请 15 分钟后再试'
};

async function apiRequest(url, method = 'GET', data = null, requiresAuth = false, sendTokenIfPresent = false) {
    const options = {
        method: method,
        headers: {
            'Content-Type': 'application/json'
        }
    };

    if (requiresAuth) {
        const token = getAuthToken();
        if (!token) {
            throw new Error('请先登录');
        }
        options.headers['Authorization'] = `Bearer ${token}`;
    } else if (sendTokenIfPresent) {
        // 可选鉴权：有 token 就带上（用于「游客可用、登录则关联账号」的公开端点，如留资）
        const token = getAuthToken();
        if (token) {
            options.headers['Authorization'] = `Bearer ${token}`;
        }
    }

    if (data) {
        options.body = JSON.stringify(data);
    }

    const response = await fetch(`${API_BASE_URL}${url}`, options);
    const result = await response.json();

    if (!result.success) {
        const errorMessage = result.error?.message || '';
        // Token 过期或无效时，清理登录状态并刷新页面回到登录页
        if (errorMessage === 'Token expired' || errorMessage === 'Token invalid' || errorMessage === 'Token expired or invalid' || errorMessage === 'Access token is missing' || errorMessage === 'Invalid token') {
            removeAuthToken();
            removeCurrentUser();
            window.location.reload();
        }
        // 携带状态码：调用方可据 statusCode 判定业务类型（如 409 邮箱已注册），
        // 不依赖中/英文提示文案匹配（后端改文案也不受影响）
        const error = new Error(ERROR_MESSAGE_MAP[errorMessage] || errorMessage || '请求失败');
        error.statusCode = result.error?.statusCode || response.status;
        throw error;
    }

    return result.data;
}

async function registerUser(username, email, password, phone = null, inviteCode = null, verificationCode = null) {
    return await apiRequest('/auth/register', 'POST', {
        username,
        email,
        password,
        phone,
        inviteCode,
        verificationCode
    });
}

// 发送注册验证码到邮箱
async function sendVerificationCode(email) {
    return await apiRequest('/auth/send-code', 'POST', { email });
}

// 忘记密码：发送密码重置验证码到已注册邮箱
async function sendResetCode(email) {
    return await apiRequest('/auth/send-reset-code', 'POST', { email });
}

// 忘记密码：校验重置验证码后设置新密码
async function resetPassword(email, verificationCode, newPassword) {
    return await apiRequest('/auth/reset-password', 'POST', {
        email,
        verificationCode,
        newPassword
    });
}

// remember = true → token 存 localStorage（勾选"保持登录状态"），false → sessionStorage（关闭浏览器即失效）
async function loginUser(email, password, remember = true) {
    const result = await apiRequest('/auth/login', 'POST', {
        email,
        password
    });
    if (result.token) {
        setAuthToken(result.token, remember);
        setCurrentUser(result.user, remember);
    }
    return result;
}

async function logoutUser() {
    removeAuthToken();
    removeCurrentUser();
}

// 领取专业版体验（登录、基础版可领；体验期 14 天，公测期到期后可再次领取）
// 服务端返回更新后的账户信息（含 plan / plan_expires_at / pro_granted_by），直接刷新本地会话
async function claimTrial() {
    const result = await apiRequest('/auth/claim-trial', 'POST', {}, true);
    setCurrentUser(result);
    return result;
}

async function getProfile() {
    return await apiRequest('/auth/profile', 'GET', null, true);
}

async function updateProfile(data) {
    const result = await apiRequest('/auth/profile', 'PUT', data, true);
    // PUT 返回体不含 plan 等版本字段：整包覆盖会丢失本地会话的档位信息，改为字段合并保留
    const prev = getCurrentUser() || {};
    setCurrentUser({ ...prev, ...result });
    return result;
}

async function verifyPassword(currentPassword) {
    const result = await apiRequest('/auth/verify-password', 'POST', { currentPassword }, true);
    return result.valid;
}

async function deleteProfile() {
    await apiRequest('/auth/profile', 'DELETE', null, true);
    logoutUser();
}

async function calculateComprehensive(inputData) {
    return await apiRequest('/calculations/comprehensive', 'POST', inputData);
}

async function calculateReverse(inputData) {
    return await apiRequest('/calculations/reverse', 'POST', inputData);
}

async function calculateBusiness(inputData) {
    return await apiRequest('/calculations/business', 'POST', inputData);
}

async function calculateClassification(inputData) {
    return await apiRequest('/calculations/classification', 'POST', inputData);
}

async function getCalculationHistory() {
    return await apiRequest('/calculations/history', 'GET', null, true);
}

async function getCalculationById(id) {
    return await apiRequest(`/calculations/${id}`, 'GET', null, true);
}

async function deleteCalculation(id) {
    return await apiRequest(`/calculations/${id}`, 'DELETE', null, true);
}

// 提交意见反馈（登录用户，落库；attachments 为前端压缩后的图片 dataURL 数组，最多 3 张）
async function submitFeedback(data) {
    return await apiRequest('/feedback', 'POST', {
        category: data.category || 'general',
        content: data.content,
        rating: data.rating || null,
        attachments: Array.isArray(data.attachments) ? data.attachments : []
    }, true);
}

// 获取当前用户提交过的反馈列表
async function getMyFeedback() {
    return await apiRequest('/feedback', 'GET', null, true);
}

// 提交转化线索（阶段13）：公开端点，游客也可留资，故 requiresAuth=false。
// 末位 sendTokenIfPresent=true：登录用户自动带上 JWT，后端 optionalAuth 会挂 user_id 便于顾问跟进；
// 未登录时静默不带令牌，不打断主流程。字段需与后端 leadController 白名单一致（非法值后端回落默认）。
async function submitLead(payload) {
    const p = payload || {};
    return await apiRequest('/leads', 'POST', {
        name: p.name || '',
        phone: p.phone || '',
        wechat: p.wechat || '',
        company: p.company || '',
        entityType: p.entityType || 'unknown',
        need: p.need || 'other',
        source: p.source || 'unknown',
        scene: p.scene || '',
        note: p.note || '',
        consent: p.consent === true
    }, false, true);
}

// 匿名计算埋点（阶段8）：登录用户在保存计算后上报"计算类型"，供运营观察功能使用分布。
// 关键设计：
//   - 仅上报 type，绝不携带任何收入/扣除等输入数据（守住"收入不出浏览器"的隐私承诺）；
//   - 不走 apiRequest：token 过期时静默忽略，避免触发整页刷新打断用户；
//   - 失败静默、不重试、离线不积压。
const CALC_TYPE_MAP = {
    forward: 'comprehensive',          // 综合所得（历史记录中的 type）
    comprehensive: 'comprehensive',
    business: 'business',              // 经营所得
    classification: 'classification',  // 分类所得
    reverse: 'reverse'                 // 反向倒算
};

async function trackCalculation(type) {
    const token = getAuthToken();
    if (!token) return;
    const normalized = CALC_TYPE_MAP[type];
    if (!normalized) return;
    try {
        await fetch(`${API_BASE_URL}/stats/events`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ type: normalized })
        });
    } catch (err) {
        // 埋点失败静默：统计属辅助数据，不影响用户主流程
    }
}

// 阶段13E：转化漏斗埋点（visit / calc_done / share / save / lead_click）
// 与 trackCalculation 的关键区别：
//   - 走公开端点，**不需要登录**（游客也要计入 —— 否则北极星分母只剩登录用户、指标虚高）；
//   - 已登录则顺带 token（便于将来做人群切片），未登录即匿名上报；
//   - 服务端不落任何个人标识，这里也只传「哪一步」；
//   - 失败静默、不重试：统计是辅助数据，绝不打断计算与留资主流程。
const FUNNEL_STEPS = ['visit', 'calc_done', 'share', 'save', 'lead_click'];
const VISIT_FLAG_KEY = 'euriskotax:funnel-visit';

async function reportFunnelEvent(step) {
    if (FUNNEL_STEPS.indexOf(step) === -1) return;
    try {
        const token = getAuthToken();
        await fetch(`${API_BASE_URL}/stats/funnel`, {
            method: 'POST',
            headers: Object.assign(
                { 'Content-Type': 'application/json' },
                token ? { 'Authorization': `Bearer ${token}` } : {}
            ),
            body: JSON.stringify({ step })
        });
    } catch (err) {
        // 埋点失败静默
    }
}

// visit 只在「每个会话」上报一次：刷新技术性刷新不应把访问量刷高。
// 用 sessionStorage（关标签页即失效）而非 localStorage，与「一次访问」语义一致。
// 隐私模式 / 存储被禁用时 sessionStorage 可能抛错，此时退化为「不上报 visit」（宁可少记不可报错）。
function reportVisitOnce() {
    try {
        if (sessionStorage.getItem(VISIT_FLAG_KEY)) return;
        sessionStorage.setItem(VISIT_FLAG_KEY, '1');
    } catch (err) {
        return;
    }
    reportFunnelEvent('visit');
}

function isLoggedIn() {
    return !!getAuthToken();
}

const apiClient = {
    getAuthToken,
    setAuthToken,
    removeAuthToken,
    getCurrentUser,
    setCurrentUser,
    removeCurrentUser,
    registerUser,
    sendVerificationCode,
    sendResetCode,
    resetPassword,
    loginUser,
    logoutUser,
    claimTrial,
    getProfile,
    updateProfile,
    verifyPassword,
    deleteProfile,
    calculateComprehensive,
    calculateReverse,
    calculateBusiness,
    calculateClassification,
    getCalculationHistory,
    getCalculationById,
    deleteCalculation,
    submitFeedback,
    getMyFeedback,
    submitLead,
    trackCalculation,
    reportFunnelEvent,
    reportVisitOnce,
    isLoggedIn
};

// 同时暴露到 window：tax-policy.js / final-report.js 等普通（非 module）脚本依赖
// window.apiClient 读取当前登录用户，模块内的 ES import 不受影响。
if (typeof window !== 'undefined') {
    window.apiClient = apiClient;
}

export default apiClient;
