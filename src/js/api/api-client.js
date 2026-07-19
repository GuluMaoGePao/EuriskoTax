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
        throw new Error(errorMessage || '请求失败');
    }

    return result.data;
}

async function registerUser(username, email, password, phone = null) {
    return await apiRequest('/auth/register', 'POST', {
        username,
        email,
        password,
        phone
    });
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
