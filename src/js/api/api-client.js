// 动态获取 API 地址：生产环境使用当前域名，开发环境使用 localhost
const API_BASE_URL = (() => {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return 'http://localhost:3000/api';
    }
    // 生产环境：使用当前域名
    return `${window.location.protocol}//${window.location.host}/api`;
})();

function getAuthToken() {
    return localStorage.getItem('auth_token');
}

function setAuthToken(token) {
    localStorage.setItem('auth_token', token);
}

function removeAuthToken() {
    localStorage.removeItem('auth_token');
}

function getCurrentUser() {
    const userStr = localStorage.getItem('current_user');
    return userStr ? JSON.parse(userStr) : null;
}

function setCurrentUser(user) {
    localStorage.setItem('current_user', JSON.stringify(user));
}

function removeCurrentUser() {
    localStorage.removeItem('current_user');
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
    'Authentication required': '请先登录'
};

async function apiRequest(url, method = 'GET', data = null, requiresAuth = false) {
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
        throw new Error(ERROR_MESSAGE_MAP[errorMessage] || errorMessage || '请求失败');
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

async function loginUser(email, password) {
    const result = await apiRequest('/auth/login', 'POST', {
        email,
        password
    });
    if (result.token) {
        setAuthToken(result.token);
        setCurrentUser(result.user);
    }
    return result;
}

async function logoutUser() {
    removeAuthToken();
    removeCurrentUser();
}

async function getProfile() {
    return await apiRequest('/auth/profile', 'GET', null, true);
}

async function updateProfile(data) {
    const result = await apiRequest('/auth/profile', 'PUT', data, true);
    setCurrentUser(result);
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
    loginUser,
    logoutUser,
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
    isLoggedIn
};

export default apiClient;
