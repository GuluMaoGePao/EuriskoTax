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

// 连不上后端的可操作提示（本地预览由后端 Express 同时托管前端静态资源，
// 所以「打得开页面但登不上」基本都是后端没起 / 页面不是从 :3000 打开的）
const CONNECT_ERROR_MESSAGE = '无法连接服务器：请确认后端已启动，并打开 http://localhost:3000 访问'
    + '（GUI「日常启动：快速启动」或 server 目录 npm start）';
const RESPONSE_ERROR_MESSAGE = '服务器返回了非预期内容：请打开 http://localhost:3000 访问，'
    + '不要直接用其它静态服务或文件系统打开 index.html';

// 后端英文错误消息 → 用户友好的中文提示（未匹配到的原样透出）
const ERROR_MESSAGE_MAP = {
    'Username, email and password are required': '请填写用户名、邮箱和密码',
    'Email and password are required': '请填写账号和密码',
    'Username or email already exists': '用户名或邮箱已被注册',
    // v1.118.0 遗留：老后端（1.118~1.143）的登录错误串，保留映射以兼容旧服务端
    'Invalid account or password': '账号或密码错误，请检查邮箱与密码',
    // v1.144.0：登录凭据收敛为邮箱唯一，错误串跟着改成 Invalid email or password
    'Invalid email or password': '邮箱或密码错误，请重新输入',
    'Invalid invite code. Public beta requires an invite code.': '邀请码无效，公测期注册需要有效邀请码',
    'Invite code is required': '请填写邀请码',
    // 「请向开发者获取」是内部口吻（而且邀请码已改选填，用户填了说明他本来就有码，只是填错了）
    'Invite code not found': '邀请码无效，请检查后重试，或留空直接注册',
    'Invite code already used': '该邀请码已被使用，请换一个或留空直接注册',
    'Email already registered. Please login directly': '该邮箱已注册，请直接登录',
    'Username already taken': '用户名已被占用，请换一个',
    'Verification code is required': '请填写邮箱验证码',
    'Email is required': '请填写邮箱',
    'Invalid email format': '邮箱格式不正确',
    'Code resend too frequent. Please wait a moment': '验证码发送过于频繁，请稍后再试',
    // 「未配置」是部署侧的问题，用户既看不懂也帮不上 —— 只说结果与下一步
    'SMTP mail is not configured': '邮件服务暂时不可用，请稍后再试',
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
    '验证码发送过于频繁，请 15 分钟后再试': '验证码发送过于频繁，请 15 分钟后再试',
    // 网络层失败：浏览器抛的是英文 TypeError（Chrome "Failed to fetch" / Firefox "NetworkError when
    // attempting to fetch resource." / Node "fetch failed"）。本地预览最常见的成因是「只起了前端静态
    // 服务、没起后端」，或页面不是从 http://localhost:3000 打开的 —— 直接透出英文等于没告诉用户怎么办。
    'Failed to fetch': CONNECT_ERROR_MESSAGE,
    'NetworkError when attempting to fetch resource.': CONNECT_ERROR_MESSAGE,
    'fetch failed': CONNECT_ERROR_MESSAGE,
    'Unexpected end of JSON input': RESPONSE_ERROR_MESSAGE,
    'Unexpected token < in JSON at position 0': RESPONSE_ERROR_MESSAGE
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

    // 网络层失败（后端没起 / 端口不对 / 断网）：fetch 直接 reject，浏览器给的是英文 TypeError，
    // 不拦下来就会把「Failed to fetch」原样弹给用户 —— 本地预览最常见的就是这个。
    let response;
    try {
        response = await fetch(`${API_BASE_URL}${url}`, options);
    } catch (e) {
        const error = new Error(CONNECT_ERROR_MESSAGE);
        error.cause = e;
        throw error;
    }

    // 拿到了响应但不是 JSON（例如请求打到了返回 HTML 的其它静态服务）：
    // response.json() 会抛 "Unexpected token '<'..."，同样换成能照做的中文提示。
    let result;
    try {
        result = await response.json();
    } catch (e) {
        const error = new Error(RESPONSE_ERROR_MESSAGE);
        error.statusCode = response.status;
        error.cause = e;
        throw error;
    }

    if (!result.success) {
        const errorMessage = result.error?.message || '';
        // v1.144.0：会话失效统一按 **HTTP 401 状态码**判定，不再枚举后端错误文案。
        // 旧写法列了 'Token expired' / 'Token invalid' / 'Access token is missing' 等六个字符串，
        // 后端改一个词、或新增一处 401（如 token_version 校验不通过）就静默漏判 ——
        // 用户看到的是「点了没反应」，而不是回到登录页重新登录。
        // 唯一例外是登录接口自身：那里的 401 是「这次没登上去」，不是「会话失效」，
        // 清掉本地会话会误伤（用户可能正拿着另一个账号在试）。
        if (response.status === 401 && url !== '/auth/login') {
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

// v1.144.0：注册成功服务端直接签令牌（data = { token, user }），这里与登录同样落会话 ——
// 表单已经走完邮箱验证码，再让用户回登录页输一遍密码是把刚走完的流程走第二遍。
async function registerUser(username, email, password, phone = null, inviteCode = null, verificationCode = null, remember = true) {
    const result = await apiRequest('/auth/register', 'POST', {
        username,
        email,
        password,
        phone,
        inviteCode,
        verificationCode
    });
    if (result && result.token) {
        setAuthToken(result.token, remember);
        setCurrentUser(result.user, remember);
    }
    return result;
}

// 发送注册验证码到邮箱
async function sendVerificationCode(email) {
    return await apiRequest('/auth/send-code', 'POST', { email });
}

// 忘记密码：发送密码重置验证码到已注册邮箱
async function sendResetCode(email) {
    return await apiRequest('/auth/send-reset-code', 'POST', { email });
}

// 忘记密码：校验重置验证码后设置新密码。
// v1.144.0：服务端同时把旧 token 作废并签发新令牌（data = { token, user }），
// 这里直接落会话 —— 邮箱验证码已证明归属，重置完还要再登录一次是多余的断口。
async function resetPassword(email, verificationCode, newPassword, remember = true) {
    const result = await apiRequest('/auth/reset-password', 'POST', {
        email,
        verificationCode,
        newPassword
    });
    if (result && result.token) {
        setAuthToken(result.token, remember);
        setCurrentUser(result.user, remember);
    }
    return result;
}

// remember = true → token 存 localStorage（勾选"保持登录状态"），false → sessionStorage（关闭浏览器即失效）
// v1.144.0：account 必须是**注册邮箱**（后端已不再接受用户名，非邮箱格式直接 401）；
// 字段名沿用 email 以兼容既有客户端。
async function loginUser(account, password, remember = true) {
    const result = await apiRequest('/auth/login', 'POST', {
        email: account,
        password
    });
    if (result.token) {
        setAuthToken(result.token, remember);
        setCurrentUser(result.user, remember);
    }
    return result;
}

// v1.144.0 闭环点③：退出先通知服务端（token_version 自增 → 已签发的全部 JWT 失效），
// 再清本地。服务端调用失败**不阻断退出**：离线 / 后端不可用时也要能退出，
// 本地清理才是"退出"这件事本身，服务端那一步只是"让别处的会话也下线"。
async function logoutUser() {
    if (isLoggedIn()) {
        try {
            await apiRequest('/auth/logout', 'POST', {}, true);
        } catch (e) {
            // 服务端吊销失败不阻断本地退出
        }
    }
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

// 兑换专业版兑换码（阶段14 变现）：线下收款后由运营发放，一码一用
// 成功返回更新后的用户信息并同步本地会话，调用方据此刷新权益展示
async function redeemProCode(code) {
    const result = await apiRequest('/pro-codes/redeem', 'POST', { code }, true);
    setCurrentUser(result);
    return result;
}

async function getProfile() {
    return await apiRequest('/auth/profile', 'GET', null, true);
}

async function updateProfile(data) {
    const result = await apiRequest('/auth/profile', 'PUT', data, true);
    // PUT 返回体不含 plan 等版本字段：整包覆盖会丢失本地会话的档位信息，改为字段合并保留
    const { token: rotatedToken, ...userFields } = result || {};
    const prev = getCurrentUser() || {};
    setCurrentUser({ ...prev, ...userFields });
    // v1.144.0：改密码时服务端推高 token_version 并回一个新令牌 —— 不换掉本地的，
    // 下一次请求就会因版本不匹配被 401 踢下线（本人这台设备不该被自己改密码踢出去）。
    // 存储策略跟随现状：token 当前在 localStorage 就继续持久化，在 sessionStorage 就继续会话级。
    if (rotatedToken) {
        setAuthToken(rotatedToken, localStorage.getItem('auth_token') !== null);
    }
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
        // 省 / 市改为留资时收集（参保城市选择已回退）：顾问据此核对当地缴费基数口径。
        // 两项都传：市名重名时（吉林市 / 海南藏族自治州）只有市名会让顾问认错统筹区；
        // 「其他 / 海外」这类前端哨兵值由 lead-modal 剔除后再进来，这里只做透传
        province: p.province || '',
        city: p.city || '',
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
    redeemProCode,
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
