// EuriskoTax Admin Console（运维后台）
// 轻量管理台：总览 / 反馈处理 / 用户权益 / 兑换码 / 内容中心；所有请求带 X-Admin-Token。

const TOKEN_KEY = 'eurisko_admin_token';

const CATEGORY_META = {
    bug: { label: 'Bug', cls: 'bg-red-50 text-red-600 border-red-200' },
    suggestion: { label: '建议', cls: 'bg-blue-50 text-blue-600 border-blue-200' },
    other: { label: '其他', cls: 'bg-gray-50 text-gray-600 border-gray-200' },
    general: { label: '一般', cls: 'bg-purple-50 text-purple-600 border-purple-200' }
};
const STATUS_META = {
    open: { label: '待处理', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    resolved: { label: '已解决', cls: 'bg-green-50 text-green-700 border-green-200' },
    closed: { label: '已关闭', cls: 'bg-gray-100 text-gray-500 border-gray-200' }
};
const SOURCE_META = { seed: '种子授权', invite: '兑换码', admin: '管理员', purchase: '购买' };
const TYPE_META = { comprehensive: '综合所得', business: '经营所得', classification: '分类所得', reverse: '反向倒算' };

const state = {
    token: '',
    tab: 'overview',
    users: { q: '', plan: '', offset: 0, limit: 20, total: 0, items: [] },
    content: { type: '', status: '', audience: '', q: '', offset: 0, limit: 50, total: 0, items: [], editingId: null },
    // 排障话术库：source = 'api'（数据来自数据库，可编辑）/ 'offline'（接口不可用时的兜底快照，只读）
    support: { items: [], source: 'api', editingId: null },
    // 税制参数（阶段12 C1）：model 为当前编辑态，modelOriginal 用于「载入当前生效值」回退，
    // defaults 为服务端下发的出厂基线（库中尚无自定义配置时的编辑初始值）
    taxrates: { history: [], defaults: null, model: null, modelOriginal: null, notify: { enabled: false, placements: ['modal', 'notice_list'] } }
};

// ---------- 基础工具 ----------
const $ = (sel) => document.querySelector(sel);

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const fmtTime = (iso) => {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString('zh-CN', { hour12: false }); } catch { return String(iso); }
};

const fmtShort = (iso) => {
    if (!iso) return '—';
    try {
        const d = new Date(iso);
        const now = new Date();
        const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
        const diff = Math.round((day(now) - day(d)) / 86400000);
        if (diff === 0) return `今天 ${d.toTimeString().slice(0, 5)}`;
        if (diff === 1) return `昨天 ${d.toTimeString().slice(0, 5)}`;
        return d.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
    } catch { return String(iso); }
};

// ---------- 请求封装 ----------
function headers() {
    return { 'Content-Type': 'application/json', ...(state.token ? { 'X-Admin-Token': state.token } : {}) };
}

async function api(path, options = {}) {
    const res = await fetch(`/api${path}`, { ...options, headers: { ...headers(), ...(options.headers || {}) } });
    let body = null;
    try { body = await res.json(); } catch { /* 非 JSON */ }
    if (!res.ok || !body || body.success === false) {
        const err = new Error((body && body.error && body.error.message) || `请求失败（HTTP ${res.status}）`);
        err.status = res.status;
        if (body && body.error && Array.isArray(body.error.details)) err.details = body.error.details;
        throw err;
    }
    return body.data;
}

// ---------- Toast ----------
let toastTimer = null;
function toast(message, type = 'info') {
    const el = $('#toast');
    if (!el) return;
    const bg = type === 'success' ? 'bg-green-600' : type === 'error' ? 'bg-red-600' : 'bg-gray-800';
    el.className = `fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl shadow-xl text-sm text-white max-w-md ${bg}`;
    el.textContent = message;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), type === 'error' ? 4200 : 2400);
}

function reportError(err, fallback = '操作失败') {
    const msg = err && err.message ? err.message : fallback;
    toast(msg, 'error');
    if (err && err.status === 401) setTimeout(() => doLogout('登录已过期，请重新输入管理令牌'), 800);
}

// ---------- 登录 / 登出 ----------
async function doLogin() {
    const input = $('#login-token-input');
    const remember = $('#login-remember').checked;
    const token = (input.value || '').trim();
    if (!token) return showLoginError('请输入访问令牌');
    $('#login-error').classList.add('hidden');
    state.token = token;
    const btn = $('#login-btn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> 验证中…';
    try {
        await api('/stats/overview'); // 轻量探测令牌有效性
        remember ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY);
        enterApp();
    } catch (err) {
        state.token = '';
        showLoginError(err.status === 401 ? '令牌无效或已失效，请检查 ADMIN_TOKEN' : (err.message || '连接服务器失败'));
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa fa-sign-in"></i>进入管理台';
    }
}

function showLoginError(msg) {
    const el = $('#login-error');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
}

function enterApp() {
    $('#login-view').classList.add('hidden');
    $('#app-view').classList.remove('hidden');
    $('#logout-btn').classList.remove('hidden');
    $('#connection-state').classList.remove('hidden');
    $('#connection-state').innerHTML = '<i class="fa fa-circle text-green-500"></i> 已连接';
    switchTab('overview');
}

function doLogout(reason) {
    state.token = '';
    localStorage.removeItem(TOKEN_KEY);
    $('#app-view').classList.add('hidden');
    $('#logout-btn').classList.add('hidden');
    $('#connection-state').classList.add('hidden');
    const input = $('#login-token-input');
    if (input) input.value = '';
    if (reason) showLoginError(reason);
    else { const e = $('#login-error'); if (e) e.classList.add('hidden'); }
    $('#login-view').classList.remove('hidden');
}

// ---------- Tab 切换 ----------
function switchTab(tab) {
    state.tab = tab;
    document.querySelectorAll('.tab-btn[data-nav]').forEach((b) => b.classList.toggle('active', b.dataset.nav === tab));
    document.querySelectorAll('.view-section').forEach((s) => s.classList.add('hidden'));
    const sec = $(`#view-${tab}`);
    if (sec) sec.classList.remove('hidden');
    if (tab === 'overview') loadOverview();
    else if (tab === 'feedback') loadFeedback();
    else if (tab === 'users') loadUsers(true);
    else if (tab === 'invites') loadInvites();
    else if (tab === 'content') loadContent(true);
    else if (tab === 'taxrates') loadTaxRates();
    else if (tab === 'support') loadSupport();
}

// ---------- 总览 ----------
function loadOverview() {
    $('#overview-metrics').innerHTML = '<div class="col-span-4 py-8 text-center text-gray-400 text-sm"><i class="fa fa-spinner fa-spin mr-2"></i>加载中…</div>';
    api('/stats/overview').then(renderOverview).catch((e) => reportError(e, '统计加载失败'));
}

function metricCard(icon, cls, value, label) {
    return `<div class="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3.5">
        <div class="w-11 h-11 rounded-xl ${cls} flex items-center justify-center shrink-0"><i class="fa ${icon} text-lg"></i></div>
        <div class="min-w-0"><div class="text-2xl font-bold text-gray-800 leading-tight">${esc(value)}</div><div class="text-xs text-gray-500 mt-0.5 truncate">${esc(label)}</div></div>
    </div>`;
}

function barRow(label, value, max, barCls) {
    const pct = max > 0 ? Math.round((value / max) * 100) : 0;
    return `<div class="flex items-center gap-3 mb-2.5 last:mb-0">
        <span class="w-20 text-xs text-gray-500 shrink-0">${esc(label)}</span>
        <div class="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden"><div class="h-full ${barCls} rounded-full" style="width:${pct}%"></div></div>
        <span class="w-10 text-right text-xs font-semibold text-gray-600 shrink-0">${value}</span>
    </div>`;
}

function renderOverview(d) {
    const users = d.users || {};
    const calcs = d.calculations || {};
    $('#overview-metrics').innerHTML = [
        metricCard('fa-user', 'bg-blue-50 text-blue-600', users.total ?? '—', '累计注册'),
        metricCard('fa-user-plus', 'bg-green-50 text-green-600', users.newToday ?? '—', '今日新增'),
        metricCard('fa-calculator', 'bg-violet-50 text-violet-600', calcs.total ?? '—', '累计计算'),
        metricCard('fa-bolt', 'bg-amber-50 text-amber-600', calcs.today ?? '—', '今日计算')
    ].join('');

    const byType = calcs.byType || {};
    const types = ['comprehensive', 'business', 'classification', 'reverse'];
    const maxType = Math.max(1, ...types.map((t) => byType[t] || 0));
    $('#overview-types').innerHTML = types
        .map((t, i) => barRow(TYPE_META[t] || t, byType[t] || 0, maxType, ['bg-blue-500', 'bg-green-500', 'bg-violet-500', 'bg-amber-500'][i]))
        .join('');

    const trend = Array.isArray(d.dailyTrend) ? d.dailyTrend : [];
    if (!trend.length) {
        $('#overview-trend').innerHTML = '<p class="text-xs text-gray-400 text-center py-6">暂无趋势数据</p>';
        return;
    }
    const maxCalc = Math.max(1, ...trend.map((t) => t.calculations || 0));
    const maxUser = Math.max(1, ...trend.map((t) => t.newUsers || 0));
    $('#overview-trend').innerHTML = `<div class="flex items-end justify-between gap-2 pb-1">${trend.map((t) => `
        <div class="flex-1 flex flex-col items-center gap-1 min-w-0">
            <span class="text-[10px] text-gray-400">${esc(t.newUsers || 0)}</span>
            <div class="w-full max-w-[28px] rounded-t bg-green-400/80" style="height:${Math.max(3, Math.round((t.newUsers || 0) / maxUser * 64))}px"></div>
            <div class="w-full max-w-[28px] rounded-t bg-blue-500/80" style="height:${Math.max(3, Math.round((t.calculations || 0) / maxCalc * 64))}px"></div>
            <span class="text-[10px] text-gray-500">${esc(String(t.date || '').slice(5))}</span>
        </div>`).join('')}</div>
        <div class="flex items-center justify-center gap-5 mt-3 text-[11px] text-gray-500">
            <span><span class="inline-block w-2.5 h-2.5 rounded-sm bg-blue-500 mr-1 align-middle"></span>计算</span>
            <span><span class="inline-block w-2.5 h-2.5 rounded-sm bg-green-400 mr-1 align-middle"></span>注册</span>
        </div>`;
}

// ---------- 反馈 ----------
async function loadFeedback() {
    $('#feedback-list').innerHTML = '<div class="py-10 text-center text-gray-400 text-sm"><i class="fa fa-spinner fa-spin mr-2"></i>加载反馈中…</div>';
    try {
        renderFeedback(await api('/feedback/admin'));
    } catch (err) {
        $('#feedback-list').innerHTML = '';
        reportError(err, '反馈加载失败');
    }
}

function renderFeedback(items) {
    const status = $('#feedback-status-filter').value;
    const category = $('#feedback-category-filter').value;
    const filtered = items.filter((it) => (!status || it.status === status) && (!category || it.category === category));
    const listEl = $('#feedback-list');
    if (!filtered.length) {
        listEl.innerHTML = '<div class="py-12 text-center text-gray-400 text-sm"><i class="fa fa-inbox mr-2 text-2xl align-middle"></i>没有匹配的反馈</div>';
        return;
    }
    listEl.innerHTML = filtered.map((it) => {
        const cat = CATEGORY_META[it.category] || CATEGORY_META.general;
        const st = STATUS_META[it.status] || STATUS_META.open;
        let attachments = [];
        try {
            attachments = JSON.parse(it.attachments || '[]');
            if (!Array.isArray(attachments)) attachments = [];
        } catch { /* ignore */ }
        const stars = it.rating
            ? Array.from({ length: 5 }, (_, i) => i < it.rating).map((on) => `<i class="fa ${on ? 'fa-star text-amber-400' : 'fa-star-o text-gray-300'} text-xs"></i>`).join('')
            : '';
        const user = it.user || {};
        return `<div class="bg-white rounded-xl border border-gray-200 p-4 sm:p-5" data-feedback-card="${it.id}">
            <div class="flex flex-wrap items-start justify-between gap-2 mb-2">
                <div class="flex items-center gap-2 flex-wrap text-sm">
                    <span class="px-2 py-0.5 rounded-full border ${cat.cls} text-xs font-semibold">${cat.label}</span>
                    <span class="px-2 py-0.5 rounded-full border ${st.cls} text-xs font-semibold">${st.label}</span>
                    ${stars ? `<span class="text-xs">${stars}</span>` : ''}
                    <span class="text-xs text-gray-400">#${it.id}</span>
                </div>
                <div class="flex items-center gap-3">
                    <span class="text-xs text-gray-400">${fmtShort(it.created_at)}</span>
                    <select data-feedback-status="${it.id}" class="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                        <option value="open"${it.status === 'open' ? ' selected' : ''}>待处理</option>
                        <option value="resolved"${it.status === 'resolved' ? ' selected' : ''}>已解决</option>
                        <option value="closed"${it.status === 'closed' ? ' selected' : ''}>已关闭</option>
                    </select>
                </div>
            </div>
            <div class="text-sm text-gray-500 mb-2">
                <span class="font-medium text-gray-700">${esc(user.username || '未命名')}</span><span class="text-gray-400"> · ${esc(user.email || '无邮箱')}</span>
            </div>
            <p class="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed break-words">${esc(it.content)}</p>
            ${attachments.length ? `<div class="mt-3 flex flex-wrap gap-2 items-center">
                ${attachments.map((src, i) => `<img data-att-preview="${it.id}:${i}" src="${src}" alt="附图 ${i + 1}" class="w-24 h-24 rounded-lg border border-gray-200 object-cover cursor-pointer hover:opacity-85 transition-opacity">`).join('')}
                <span class="text-xs text-gray-400">点击放大</span>
            </div>` : ''}
        </div>`;
    }).join('');
}

async function updateFeedbackStatus(id, status) {
    try {
        const data = await api(`/feedback/admin/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
        toast(`反馈 #${id} 已标记为「${(STATUS_META[data.status] || {}).label || data.status}」`, 'success');
    } catch (err) {
        reportError(err, '状态更新失败');
    }
}

// ---------- 用户 ----------
function currentUsersParams() {
    const q = $('#users-query').value.trim();
    const plan = $('#users-plan-filter').value;
    if (q !== state.users.q || plan !== state.users.plan) {
        state.users.q = q;
        state.users.plan = plan;
        state.users.offset = 0;
    }
    return state.users;
}

async function loadUsers(reset) {
    if (reset) state.users.offset = 0;
    const { q, plan, offset, limit } = currentUsersParams();
    const query = new URLSearchParams({ offset: String(offset), limit: String(limit) });
    if (q) query.set('q', q);
    if (plan) query.set('plan', plan);
    const body = $('#users-table-body');
    body.innerHTML = '<tr><td colspan="7" class="px-4 py-8 text-center text-gray-400 text-sm"><i class="fa fa-spinner fa-spin mr-2"></i>加载用户中…</td></tr>';
    try {
        const data = await api(`/admin/users?${query.toString()}`);
        state.users.total = data.total;
        state.users.items = data.items || [];
        renderUsersTable();
    } catch (err) {
        body.innerHTML = '<tr><td colspan="7"></td></tr>';
        reportError(err, '用户列表加载失败');
    }
}

function planBadge(user) {
    if (user.plan === 'pro') {
        const perm = !user.plan_expires_at;
        return `<span class="px-2 py-0.5 rounded-full text-xs font-bold ${perm ? 'bg-amber-300 text-amber-950' : 'bg-amber-100 text-amber-700'}">专业版${perm ? ' · 永久' : ''}</span>`;
    }
    return '<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-600">基础版</span>';
}

function renderUsersTable() {
    const rows = state.users.items;
    const body = $('#users-table-body');
    body.innerHTML = rows.length ? rows.map((u) => `
        <tr class="hover:bg-gray-50">
            <td class="px-4 py-3 mono text-xs text-gray-500">${u.id}</td>
            <td class="px-4 py-3 font-medium text-gray-800">${esc(u.username)}</td>
            <td class="px-4 py-3 text-gray-500 break-all">${esc(u.email || '—')}</td>
            <td class="px-4 py-3">${planBadge(u)}</td>
            <td class="px-4 py-3 text-xs text-gray-500">
                ${u.plan_expires_at ? fmtShort(u.plan_expires_at) : (u.plan === 'pro' ? '<span class="text-amber-600">永久</span>' : '—')}
                ${u.pro_granted_by ? `<span class="text-gray-400">（${SOURCE_META[u.pro_granted_by] || u.pro_granted_by}）</span>` : ''}
            </td>
            <td class="px-4 py-3 text-xs text-gray-500">${fmtShort(u.created_at)}</td>
            <td class="px-4 py-3"><button data-act="user-detail" data-id="${u.id}" class="px-2.5 py-1.5 rounded-lg text-xs bg-blue-50 text-blue-700 hover:bg-blue-100"><i class="fa fa-search mr-1"></i>详情</button></td>
        </tr>`).join('') : '<tr><td colspan="7" class="px-4 py-8 text-center text-gray-400 text-sm">没有匹配的用户</td></tr>';

    const total = state.users.total || 0;
    const { limit, offset } = state.users;
    const pageNo = limit > 0 ? Math.floor(offset / limit) + 1 : 1;
    const pageCount = Math.max(1, Math.ceil(total / limit));
    $('#users-total').textContent = `共 ${total} 个用户 · 每页 ${limit} 条`;
    $('#users-page').textContent = `${pageNo} / ${pageCount}`;
    const prev = $('[data-act="users-prev"]');
    const next = $('[data-act="users-next"]');
    if (prev) prev.disabled = offset <= 0;
    if (next) next.disabled = offset + limit >= total;
}

async function openUserDetail(id) {
    const panel = $('#user-detail');
    panel.classList.remove('hidden');
    panel.innerHTML = '<div class="py-8 text-center text-gray-400 text-sm"><i class="fa fa-spinner fa-spin mr-2"></i>加载详情…</div>';
    try {
        renderUserDetail(panel, await api(`/admin/users/${id}`));
    } catch (err) {
        panel.classList.add('hidden');
        reportError(err, '用户详情加载失败');
    }
}

function renderUserDetail(panel, d) {
    const u = d.user;
    const counts = d.counts || {};
    const recentFeedback = d.recentFeedback || [];
    const recentCalcs = d.recentCalculations || [];
    const src = u.pro_granted_by ? (SOURCE_META[u.pro_granted_by] || u.pro_granted_by) : '—';
    panel.innerHTML = `
        <div class="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 pb-4 mb-4">
            <div>
                <div class="flex items-center gap-3 flex-wrap">
                    <h3 class="text-base font-bold text-gray-800">${esc(u.username)} <span class="text-gray-400 font-normal text-sm">#${u.id}</span></h3>
                    ${planBadge(u)}
                </div>
                <p class="text-sm text-gray-500 mt-1 break-all">${esc(u.email || '无邮箱')}${u.phone ? ` · ${esc(u.phone)}` : ''}</p>
                <p class="text-xs text-gray-400 mt-1">注册：${fmtTime(u.created_at)} · 最近活动：${fmtTime(u.updated_at)}</p>
            </div>
            <div class="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                <span><i class="fa fa-comments-o mr-1 text-blue-500"></i>反馈 ${counts.feedback ?? 0}</span>
                <span class="text-gray-300">|</span>
                <span><i class="fa fa-calculator mr-1 text-green-500"></i>计算 ${counts.calculations ?? 0}</span>
            </div>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div class="rounded-xl border border-gray-200 p-4">
                <h4 class="text-xs font-bold text-gray-500 mb-3"><i class="fa fa-key mr-1"></i>权益调整</h4>
                <p class="text-xs text-gray-500 mb-3 leading-relaxed">${u.plan === 'pro'
                    ? `当前：专业版，${u.plan_expires_at ? `有效期至 ${fmtTime(u.plan_expires_at)}` : '永久生效'}，来源 ${src}。`
                    : '当前为基础版账号，尚未拥有专业版权益。'}</p>
                <div class="flex flex-wrap gap-2 items-center">
                    <button data-act="grant-trial" data-id="${u.id}" class="px-3 py-2 rounded-lg text-xs font-semibold bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100"><i class="fa fa-clock-o mr-1"></i>补发 14 天体验</button>
                    <button data-act="grant-permanent" data-id="${u.id}" class="px-3 py-2 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100"><i class="fa fa-crown mr-1"></i>授予永久专业版</button>
                    <div class="flex items-center gap-1.5">
                        <input id="grant-days-input-${u.id}" type="number" min="1" max="365" value="30" class="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-xs">
                        <button data-act="grant-days" data-id="${u.id}" class="px-3 py-2 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100">按天开通</button>
                    </div>
                    ${u.plan === 'pro' ? '<button data-act="revoke-pro" data-id="' + u.id + '" class="px-3 py-2 rounded-lg text-xs font-semibold bg-red-50 text-red-600 border border-red-200 hover:bg-red-100"><i class="fa fa-undo mr-1"></i>回落基础版</button>' : ''}
                </div>
                <p class="text-[11px] text-gray-400 mt-3">对外授权请优先使用兑换码；「永久」仅用于内部决策（如种子贡献补偿）。</p>
            </div>
            <div class="space-y-4">
                <div>
                    <h4 class="text-xs font-bold text-gray-500 mb-2"><i class="fa fa-comments-o mr-1"></i>最近反馈（5）</h4>
                    ${recentFeedback.length ? recentFeedback.map((f) => `
                        <div class="text-xs text-gray-600 mb-2 leading-relaxed">
                            <span class="text-gray-400">${fmtShort(f.created_at)}</span>
                            <span class="px-1.5 py-0.5 rounded bg-gray-100 ml-1">${(CATEGORY_META[f.category] || {}).label || f.category}</span>
                            <span class="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 ml-1">${(STATUS_META[f.status] || {}).label || f.status}</span>
                            <div class="text-gray-500 mt-1">${esc(String(f.content).slice(0, 90))}${f.content.length > 90 ? '…' : ''}</div>
                        </div>`).join('') : '<p class="text-xs text-gray-400">暂无反馈</p>'}
                </div>
                <div>
                    <h4 class="text-xs font-bold text-gray-500 mb-2"><i class="fa fa-calculator mr-1"></i>最近计算（5）</h4>
                    ${recentCalcs.length ? recentCalcs.map((c) => `
                        <div class="text-xs text-gray-600 mb-1.5">
                            <span class="text-gray-400">${fmtShort(c.updated_at)}</span>
                            <span class="px-1.5 py-0.5 rounded bg-gray-100 ml-1">${TYPE_META[c.type] || c.type}</span>
                            <span class="text-gray-400 mono text-[11px] ml-1">#${c.id}</span>
                        </div>`).join('') : '<p class="text-xs text-gray-400">暂无云端计算记录</p>'}
                </div>
            </div>
        </div>`;
}

async function applyUserPlan(id, payload, tip) {
    if (!confirm(`${tip}\n\n确认对用户 #${id} 执行该权益调整吗？`)) return;
    try {
        await api(`/admin/users/${id}/plan`, { method: 'PATCH', body: JSON.stringify(payload) });
        toast('权益已更新', 'success');
        openUserDetail(id);
        loadUsers();
    } catch (err) {
        reportError(err, '权益调整失败');
    }
}

// ---------- 兑换码 ----------
async function loadInvites() {
    $('#invite-available').innerHTML = '<div class="py-6 text-center text-gray-400 text-xs"><i class="fa fa-spinner fa-spin mr-1"></i>加载中</div>';
    $('#invite-used').innerHTML = '';
    try {
        renderInvites(await api('/invites'));
    } catch (err) {
        $('#invite-available').innerHTML = '';
        reportError(err, '兑换码加载失败');
    }
}

function renderInvites(d) {
    $('#invite-available-badge').textContent = `剩余 ${d.availableCount ?? 0}`;
    $('#invite-used-badge').textContent = `已用 ${d.usedCount ?? 0}`;
    const avail = Array.isArray(d.available) ? d.available : [];
    $('#invite-available').innerHTML = avail.length
        ? avail.map((it) => `
            <div class="flex items-center gap-2 py-1.5 px-3 rounded-lg bg-gray-50 border border-gray-100 hover:border-blue-200">
                <span class="mono text-xs text-gray-800 flex-1 select-all">${esc(it.code)}</span>
                <span class="text-[10px] text-gray-400 hidden sm:inline">${fmtShort(it.createdAt)}</span>
                <button data-act="copy-code" data-code="${esc(it.code)}" class="text-[11px] text-blue-600 hover:text-blue-800 px-1.5 py-1 rounded"><i class="fa fa-copy"></i></button>
            </div>`).join('')
        : '<p class="py-6 text-center text-gray-400 text-xs">暂无可用兑换码</p>';
    const used = Array.isArray(d.used) ? d.used : [];
    $('#invite-used').innerHTML = used.length
        ? used.map((it) => `
            <div class="flex items-center gap-2 py-1.5 px-3 rounded-lg bg-gray-50 border border-gray-100">
                <span class="mono text-xs text-gray-500 flex-1 select-all">${esc(it.code)}</span>
                <span class="text-[11px] text-gray-400">→ ${esc(it.usedBy)}</span>
                <span class="text-[10px] text-gray-300">${fmtShort(it.usedAt)}</span>
            </div>`).join('')
        : '<p class="py-6 text-center text-gray-400 text-xs">暂无已使用的兑换码</p>';
}

async function generateInvites() {
    const raw = parseInt($('#invite-count').value, 10);
    const count = Number.isInteger(raw) && raw >= 1 && raw <= 100 ? raw : 5;
    try {
        const d = await api('/invites', { method: 'POST', body: JSON.stringify({ count }) });
        toast(`已生成 ${d.createdCount} 个兑换码`, 'success');
        loadInvites();
    } catch (err) {
        reportError(err, '生成失败');
    }
}

async function copyText(text, okMsg) {
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
        } else {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
        }
        toast(okMsg || '已复制', 'success');
    } catch { /* fallthrough */ }
}

// ---------- Lightbox ----------
window.__closeLightbox = () => {
    const lb = $('#lightbox');
    if (lb) { lb.classList.add('hidden'); lb.classList.remove('flex'); }
};

function openLightbox(src, caption) {
    const lb = $('#lightbox');
    const img = $('#lightbox-img');
    const cap = $('#lightbox-caption');
    if (!lb || !img) return;
    img.src = src;
    cap.textContent = caption || '';
    lb.classList.remove('hidden');
    lb.classList.add('flex');
}

// ---------- 内容中心（阶段11） ----------
const CONTENT_TYPES = { policy: '政策要点', announcement: '更新公告', operation: '运营内容' };
const CONTENT_STATUS = {
    draft: { label: '草稿', cls: 'bg-gray-100 text-gray-600 border-gray-200' },
    published: { label: '已发布', cls: 'bg-green-50 text-green-700 border-green-200' },
    revoked: { label: '已撤回', cls: 'bg-red-50 text-red-600 border-red-200' }
};
const CONTENT_AUDIENCE = {
    all: { label: '全体', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
    free: { label: '基础版', cls: 'bg-gray-50 text-gray-600 border-gray-200' },
    pro: { label: '专业版', cls: 'bg-amber-50 text-amber-700 border-amber-200' }
};
const CONTENT_PLACEMENTS = [
    { key: 'assistant_qa', label: '税助手问答库' },
    { key: 'home_banner', label: '首页公告条' },
    { key: 'modal', label: '启动弹窗' },
    { key: 'notice_list', label: '个人中心列表' }
];

function contentPlacements(it) {
    try { const p = JSON.parse((it && it.placements) || '[]'); return Array.isArray(p) ? p : []; } catch { return []; }
}
function contentKeywords(it) {
    try { const k = JSON.parse((it && it.keywords) || '[]'); return Array.isArray(k) ? k : []; } catch { return []; }
}
const ctPad2 = (n) => String(n).padStart(2, '0');
function toLocalInput(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${ctPad2(d.getMonth() + 1)}-${ctPad2(d.getDate())}T${ctPad2(d.getHours())}:${ctPad2(d.getMinutes())}`;
}
function fromLocalInput(v) {
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function currentContentParams() {
    const c = state.content;
    const type = $('#content-type-filter').value;
    const status = $('#content-status-filter').value;
    const audience = $('#content-audience-filter').value;
    const q = $('#content-query').value.trim();
    if (type !== c.type || status !== c.status || audience !== c.audience || q !== c.q) {
        c.type = type; c.status = status; c.audience = audience; c.q = q; c.offset = 0;
    }
    return c;
}

async function loadContent(reset) {
    if (reset) state.content.offset = 0;
    const { type, status, audience, q, offset, limit } = currentContentParams();
    const query = new URLSearchParams({ offset: String(offset), limit: String(limit) });
    if (type) query.set('type', type);
    if (status) query.set('status', status);
    if (audience) query.set('audience', audience);
    if (q) query.set('q', q);

    $('#content-list').innerHTML = '<div class="py-10 text-center text-gray-400 text-sm"><i class="fa fa-spinner fa-spin mr-2"></i>加载内容中…</div>';
    try {
        const data = await api(`/admin/content?${query.toString()}`);
        state.content.total = data.total;
        state.content.items = data.items || [];
        renderContentList();
    } catch (err) {
        $('#content-list').innerHTML = '';
        reportError(err, '内容加载失败');
    }
}

function renderContentList() {
    const el = $('#content-list');
    const rows = state.content.items;
    if (!rows.length) {
        el.innerHTML = '<div class="py-12 text-center text-gray-400 text-sm"><i class="fa fa-inbox mr-2 text-2xl align-middle"></i>没有匹配的内容</div>';
        return;
    }
    const cards = rows.map((it) => {
        const st = CONTENT_STATUS[it.status] || { label: it.status, cls: 'bg-gray-100 text-gray-600 border-gray-200' };
        const aud = CONTENT_AUDIENCE[it.audience] || { label: it.audience, cls: 'bg-gray-50 text-gray-600 border-gray-200' };
        const pls = contentPlacements(it).map((k) => (CONTENT_PLACEMENTS.find((p) => p.key === k) || {}).label || k);
        const head = it.type === 'policy' ? (it.question || it.title || '(未填写问题)') : (it.title || '(未填写标题)');
        const raw = it.type === 'policy' ? (it.answer || '') : (it.summary || it.body || '');
        const preview = String(raw).slice(0, 120);
        const kws = contentKeywords(it);
        return `<div class="bg-white rounded-xl border border-gray-200 p-4">
            <div class="flex flex-wrap items-start justify-between gap-2 mb-2">
                <div class="flex items-center gap-2 flex-wrap text-sm">
                    <span class="px-2 py-0.5 rounded-full border ${st.cls} text-xs font-semibold">${st.label}</span>
                    <span class="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs font-semibold">${CONTENT_TYPES[it.type] || it.type}</span>
                    <span class="px-2 py-0.5 rounded-full border ${aud.cls} text-xs font-semibold">${aud.label}</span>
                    ${it.hot ? '<span class="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-xs font-semibold">热门</span>' : ''}
                    <span class="text-xs text-gray-400 mono">${esc(it.item_id)}</span>
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-xs text-gray-400">${fmtShort(it.updated_at)}</span>
                    <button data-act="content-edit" data-id="${it.id}" class="px-2.5 py-1.5 rounded-lg text-xs bg-blue-50 text-blue-700 hover:bg-blue-100"><i class="fa fa-pencil mr-1"></i>编辑</button>
                    <button data-act="content-delete" data-id="${it.id}" class="px-2.5 py-1.5 rounded-lg text-xs bg-red-50 text-red-600 hover:bg-red-100"><i class="fa fa-trash mr-1"></i>删除</button>
                </div>
            </div>
            <div class="text-sm font-medium text-gray-800 mb-1 break-words">${esc(head)}</div>
            <div class="text-xs text-gray-500 leading-relaxed mb-2 break-words">${esc(preview)}${String(raw).length > 120 ? '…' : ''}</div>
            <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-400">
                <span><i class="fa fa-map-marker mr-1"></i>${esc(pls.join(' / ') || '未设置展示位')}</span>
                <span>优先级 ${it.priority || 0}</span>
                <span>上线 ${fmtShort(it.publish_at)}</span>
                <span>下架 ${it.expire_at ? fmtShort(it.expire_at) : '永不'}</span>
                ${kws.length ? `<span>关键词 ${esc(kws.join('、'))}</span>` : ''}
                ${it.link_url ? `<span>链接 ${esc(it.link_text || it.link_url)}</span>` : ''}
            </div>
        </div>`;
    }).join('');

    const total = state.content.total || 0;
    const { limit, offset } = state.content;
    const pageNo = limit > 0 ? Math.floor(offset / limit) + 1 : 1;
    const pageCount = Math.max(1, Math.ceil(total / limit));
    el.innerHTML = cards + `<div class="px-1 pt-3 flex items-center justify-between text-sm text-gray-500">
        <span class="text-xs">共 ${total} 条内容</span>
        <div class="flex items-center gap-2">
            <button data-act="content-prev" class="px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 text-xs"${offset <= 0 ? ' disabled' : ''}>上一页</button>
            <span class="text-xs">${pageNo} / ${pageCount}</span>
            <button data-act="content-next" class="px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 text-xs"${offset + limit >= total ? ' disabled' : ''}>下一页</button>
        </div>
    </div>`;
}

function contentField(label, inner, hint) {
    return `<div>
        <label class="block text-xs font-semibold text-gray-500 mb-1">${label}</label>
        ${inner}
        ${hint ? `<p class="text-[11px] text-gray-400 mt-1">${hint}</p>` : ''}
    </div>`;
}

function renderContentEditor(it) {
    const panel = $('#content-editor');
    const isNew = !it;
    const d = it || {};
    const type = d.type || 'announcement';
    const placements = isNew ? ['home_banner'] : contentPlacements(d);
    const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

    panel.innerHTML = `
        <div class="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
            <h3 class="text-sm font-bold text-gray-700"><i class="fa ${isNew ? 'fa-plus' : 'fa-pencil'} mr-2 text-primary"></i>${isNew ? '新建内容' : '编辑内容'}${it ? ` <span class="text-gray-400 font-normal mono text-xs">#${it.id}</span>` : ''}</h3>
            <button data-act="content-cancel" class="text-xs text-gray-400 hover:text-gray-600"><i class="fa fa-times mr-1"></i>关闭</button>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            ${contentField('item_id（幂等键）',
                `<input id="content-f-item_id" class="${inputCls} mono" ${isNew ? '' : 'readonly'} value="${esc(d.item_id || '')}" placeholder="留空自动生成">`,
                '政策条目要与内置问答对齐（覆盖/撤回）时，须填内置 id。')}
            ${contentField('类型 type',
                `<select id="content-f-type" class="${inputCls}">${Object.entries(CONTENT_TYPES).map(([k, v]) => `<option value="${k}"${k === type ? ' selected' : ''}>${v}（${k}）</option>`).join('')}</select>`)}
            ${contentField('投放对象 audience',
                `<select id="content-f-audience" class="${inputCls}">${Object.entries(CONTENT_AUDIENCE).map(([k, v]) => `<option value="${k}"${k === (d.audience || 'all') ? ' selected' : ''}>${v.label}（${k}）</option>`).join('')}</select>`,
                '全体 = 含未登录游客可见。')}
            ${contentField('状态 status',
                `<select id="content-f-status" class="${inputCls}">${Object.entries(CONTENT_STATUS).map(([k, v]) => `<option value="${k}"${k === (d.status || 'draft') ? ' selected' : ''}>${v.label}（${k}）</option>`).join('')}</select>`,
                '草稿不会推送到客户端。')}
            ${contentField('优先级 priority',
                `<input id="content-f-priority" type="number" step="1" class="${inputCls}" value="${Number.isInteger(d.priority) ? d.priority : 0}">`,
                '数值越大越靠前。')}
            ${contentField('上线时间 publish_at',
                `<input id="content-f-publish_at" type="datetime-local" class="${inputCls}" value="${toLocalInput(d.publish_at)}">`,
                '留空 = 立即生效。')}
            ${contentField('下架时间 expire_at',
                `<input id="content-f-expire_at" type="datetime-local" class="${inputCls}" value="${toLocalInput(d.expire_at)}">`,
                '留空 = 永不过期。')}
        </div>
        <div class="mt-4">
            <label class="block text-xs font-semibold text-gray-500 mb-1">展示位 placements</label>
            <div class="flex flex-wrap gap-x-4 gap-y-2 mt-1">
                ${CONTENT_PLACEMENTS.map((p) => `<label class="flex items-center gap-1.5 text-xs text-gray-600"><input type="checkbox" data-placement="${p.key}"${placements.includes(p.key) ? ' checked' : ''} class="rounded border-gray-300 text-blue-600">${p.label}</label>`).join('')}
            </div>
        </div>
        <div id="content-fields-policy" class="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4${type === 'policy' ? '' : ' hidden'}">
            ${contentField('分类 category', `<input id="content-f-category" class="${inputCls}" value="${esc(d.category || '')}" placeholder="政策法规 / 综合所得">`)}
            ${contentField('是否热门 hot', `<label class="flex items-center gap-2 text-sm text-gray-600 pt-1"><input id="content-f-hot" type="checkbox" class="rounded border-gray-300 text-blue-600"${d.hot ? ' checked' : ''}>进入「热门问题」</label>`)}
            ${contentField('问题 question', `<input id="content-f-question" class="${inputCls}" value="${esc(d.question || '')}" placeholder="如：2026 年专项附加扣除有哪些变化？">`)}
            ${contentField('关键词 keywords', `<input id="content-f-keywords" class="${inputCls}" value="${esc(contentKeywords(d).join('，'))}" placeholder="逗号分隔">`)}
            ${contentField('答案 answer', `<textarea id="content-f-answer" rows="5" class="${inputCls}">${esc(d.answer || '')}</textarea>`)}
        </div>
        <div id="content-fields-feed" class="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4${type === 'policy' ? ' hidden' : ''}">
            ${contentField('标题 title', `<input id="content-f-title" class="${inputCls}" value="${esc(d.title || '')}">`)}
            ${contentField('摘要 summary', `<input id="content-f-summary" class="${inputCls}" value="${esc(d.summary || '')}" placeholder="公告条/卡片上的一句话">`)}
            ${contentField('跳转链接 link_url', `<input id="content-f-link_url" class="${inputCls}" value="${esc(d.link_url || '')}" placeholder="https://…">`)}
            ${contentField('链接文案 link_text', `<input id="content-f-link_text" class="${inputCls}" value="${esc(d.link_text || '')}" placeholder="查看详情">`)}
            ${contentField('正文 body', `<textarea id="content-f-body" rows="5" class="${inputCls}">${esc(d.body || '')}</textarea>`)}
        </div>
        <div class="flex items-center gap-2 mt-5 pt-4 border-t border-gray-100">
            <button data-act="content-save" class="bg-primary hover:bg-blue-800 text-white text-sm font-medium rounded-lg px-5 py-2"><i class="fa fa-save mr-1"></i>保存</button>
            <button data-act="content-cancel" class="text-sm text-gray-500 hover:text-gray-700 px-4 py-2">取消</button>
        </div>`;
}

function openContentEditor(id) {
    const panel = $('#content-editor');
    panel.classList.remove('hidden');
    const it = id ? state.content.items.find((x) => x.id === id) : null;
    state.content.editingId = it ? it.id : null;
    renderContentEditor(it);
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function collectContentForm() {
    const val = (id) => { const el = $(id); return el ? el.value : ''; };
    const placements = Array.from(document.querySelectorAll('#content-editor [data-placement]'))
        .filter((c) => c.checked)
        .map((c) => c.dataset.placement);
    const payload = {
        type: val('#content-f-type'),
        audience: val('#content-f-audience'),
        status: val('#content-f-status'),
        placements,
        priority: parseInt(val('#content-f-priority'), 10) || 0,
        publish_at: fromLocalInput(val('#content-f-publish_at')),
        expire_at: fromLocalInput(val('#content-f-expire_at')),
        title: val('#content-f-title'),
        summary: val('#content-f-summary'),
        body: val('#content-f-body'),
        category: val('#content-f-category'),
        question: val('#content-f-question'),
        answer: val('#content-f-answer'),
        keywords: val('#content-f-keywords'),
        hot: $('#content-f-hot') ? $('#content-f-hot').checked : false,
        link_url: val('#content-f-link_url'),
        link_text: val('#content-f-link_text')
    };
    const itemIdEl = $('#content-f-item_id');
    if (itemIdEl && !itemIdEl.readOnly) payload.item_id = itemIdEl.value.trim();
    return payload;
}

async function saveContent() {
    const payload = collectContentForm();
    if (!payload.placements.length) { toast('请至少选择一个展示位', 'error'); return; }
    if (payload.type === 'policy' && !payload.question.trim()) { toast('政策条目需要填写「问题」', 'error'); return; }
    if (payload.type !== 'policy' && !payload.title.trim()) { toast('公告/运营内容需要填写「标题」', 'error'); return; }

    const id = state.content.editingId;
    try {
        if (id) await api(`/admin/content/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        else await api('/admin/content', { method: 'POST', body: JSON.stringify(payload) });
        toast(id ? '内容已更新' : '内容已创建', 'success');
        $('#content-editor').classList.add('hidden');
        state.content.editingId = null;
        loadContent();
    } catch (err) {
        reportError(err, '保存失败');
    }
}

async function deleteContentItem(id) {
    if (!confirm(`确认删除内容 #${id}？\n\n删除后已同步过该条目的客户端会将其移除（政策条目会回退为内置内容）。`)) return;
    try {
        await api(`/admin/content/${id}`, { method: 'DELETE' });
        toast('已删除', 'success');
        if (state.content.editingId === id) {
            $('#content-editor').classList.add('hidden');
            state.content.editingId = null;
        }
        loadContent();
    } catch (err) {
        reportError(err, '删除失败');
    }
}

async function publishContentItems() {
    const notice = prompt('发布通知文案（端上「内容已更新」提示，可留空）：', '');
    if (notice === null) return;
    if (!confirm('将把所有草稿转为已发布，并生成新的内容版本号。\n\n注意：上线时间（publish_at）未到的条目仍不会对用户可见。确认发布吗？')) return;
    try {
        const d = await api('/admin/content/releases', { method: 'POST', body: JSON.stringify({ notice }) });
        toast(`已发布版本 ${d.version}（草稿转正 ${d.promotedCount} 条）`, 'success');
        loadContent();
    } catch (err) {
        reportError(err, '发布失败');
    }
}

// ---------- 排障话术库（后端可管理） ----------
// 数据源：GET/POST/PATCH/DELETE /api/admin/support。内置 9 条由服务端启动时幂等播种
// （仅当 SupportScript 表为空），之后在后台改这里就生效，不必改代码发版。
// 话术正文里的 {RESET_URL} 占位符，在渲染与复制时替换为当前站点的 /reset 短链。
// 权威文档：docs/guides/support-playbook.md ｜ 服务端种子：server/src/services/supportScriptService.js
const SUPPORT_CATEGORY_META = {
    cache: { label: '缓存 / 版本', cls: 'bg-violet-50 text-violet-700 border-violet-200' },
    account: { label: '账号 / 登录', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
    data: { label: '数据 / 同步', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    pay: { label: '权益 / 兑换码', cls: 'bg-green-50 text-green-700 border-green-200' },
    usage: { label: '功能使用', cls: 'bg-gray-50 text-gray-600 border-gray-200' }
};

// 离线兜底快照：仅当 /api/admin/support 不可用（后端未部署新版本 / 库未执行迁移）时展示，
// 保证管理台不会因接口异常而白屏。正常运行的数据一律来自数据库，此处改动不影响线上。
// 字段对齐数据库：script_id / steps（数组）/ script。
const OFFLINE_SUPPORT_PLAYBOOK = [
    {
        id: 'stale-page',
        category: 'cache',
        title: '发版后仍看到旧版页面 / 功能没更新',
        symptom: '界面与最新版本对不上（区块划分、文案、按钮行为不一致），或点击后毫无反应。',
        steps: [
            '先让用户看首页底部的「版本 x.y.z」，与当前线上版本核对。',
            '把排障短链发给用户：会自动注销 Service Worker、清空离线缓存并跳回首页。',
            '用户回来后再次核对底部版本号，应已是最新。',
            '若仍为旧版：让用户用无痕窗口打开同址。无痕下正常，说明是其常规窗口的缓存污染。',
            '仍不正常则换浏览器（Edge ↔ Chrome）复测，据此判断是否单个浏览器的问题。'
        ],
        script: '你看到的是旧版页面，按下面步骤可以自动修复：\n1. 打开这个链接（会自动清理旧缓存并回到首页）：\n{RESET_URL}\n2. 等页面提示「已完成」后会自动跳转。\n此操作不会影响你的登录状态和已保存的计算记录。\n如果还是旧版，请告诉我，我再帮你进一步排查。'
    },
    {
        id: 'login-stuck',
        category: 'cache',
        title: '登录 / 注册按钮点不动、协议弹窗不出来',
        symptom: '输入手机号或邮箱后点击按钮无反应；或登录页应弹出的《用户协议》《隐私政策》弹窗不出现。',
        steps: [
            '确认不是网络问题：让用户换网络（如切到手机热点）复测一次。',
            '走缓存重置：发送排障短链，让用户在清理后的页面重试。',
            '若清理后正常，判定为旧版脚本残留（旧包与新 HTML 混用）。',
            '若清理后仍无反应：让用户按 F12 打开控制台，截图报错信息回传，据此定位具体脚本。'
        ],
        script: '这个现象通常是浏览器里的旧缓存导致的，请按下面步骤操作：\n1. 先关闭当前页面；\n2. 打开这个链接自动清理并回到首页：\n{RESET_URL}\n3. 重新登录试试。\n如果还是点不动，麻烦在页面上按 F12，把红色报错截图发我，我马上排查。'
    },
    {
        id: 'blank-screen',
        category: 'cache',
        title: '页面白屏 / 一直转圈打不开',
        symptom: '进入站点后一直空白、或长时间停留在加载动画，始终进不去。',
        steps: [
            '先确认服务端状态：访问 /health，返回 {"status":"ok"} 说明服务正常，问题在客户端。',
            '让用户走排障短链重置缓存后重进。',
            '若短链也打不开：让用户换浏览器或无痕窗口访问，排除单浏览器扩展干扰。',
            '若全平台都无法访问：查服务端日志与部署状态，按线上故障处理。'
        ],
        script: '页面打不开通常是本地缓存异常，请试一下：\n1. 打开这个链接（一键重置，会自动回到首页）：\n{RESET_URL}\n2. 如果还是不行，请换一个浏览器（比如从 Edge 换成 Chrome）再打开。\n麻烦把结果告诉我，我这边同步检查服务状态。'
    },
    {
        id: 'offline-stale',
        category: 'cache',
        title: '断网后看到的还是旧内容 / 离线打不开',
        symptom: '断网时打开的页面版本很旧；或提示无法访问，看不到任何内容。',
        steps: [
            '说明机制：离线可用的前提是「联网状态下打开过该页面」——资源才会落入本地缓存。',
            '让用户联网打开一次站点，把常用页面各访问一遍，之后即可离线使用。',
            '若之前访问过仍打不开，让用户走排障短链重置后再联网完整访问一次。'
        ],
        script: '离线打开需要先「联网访问过一次」作为铺垫，缓存里才会有内容。\n请你在有网的情况下：\n1. 打开 {RESET_URL} 完成一次重置；\n2. 回到首页，把常用的计算页面都点开一遍；\n3. 之后再断网就能正常打开了。'
    },
    {
        id: 'code-invalid',
        category: 'pay',
        title: '兑换码无效 / 专业版没生效',
        symptom: '输入兑换码提示无效、已使用；或提示成功但功能仍是基础版。',
        steps: [
            '到管理台「兑换码」页核对：该码是否在「可用」列表、是否已出现在「已使用」列表（一机一码，用过即失效）。',
            '到「用户」页搜索该用户，确认 plan 字段是否已变为 pro、有效期是否正确。',
            '若端上未刷新：让用户退出登录再重新登录，或走一次排障短链后重登。',
            '若权益已发但用户仍看不到：确认是否是同一个账号（手机号 / 邮箱可能与用户以为的不一致）。'
        ],
        script: '我这边查到你的兑换码记录是：{核对结果}。\n请按下面步骤让权益刷新出来：\n1. 打开 {RESET_URL} 完成一次缓存重置；\n2. 重新登录你的账号；\n3. 进入「个人中心」查看权益状态。\n如果仍未生效，把个人中心截图发我，我再核对一次。'
    },
    {
        id: 'no-verify-code',
        category: 'account',
        title: '收不到邮箱验证码',
        symptom: '点击发送后长时间收不到验证码邮件，或提示发送过于频繁。',
        steps: [
            '先看频率限制：验证码为 5 次 / 15 分钟 / IP，超限会提示稍后再试，等待即可。',
            '让用户检查垃圾邮件 / 广告邮件文件夹，并把发件人加入白名单。',
            '确认邮箱地址拼写正确（常见于 .com / .cn、数字与字母混淆）。',
            '若确认无限制且多次未收到：查服务端日志中的邮件发送记录，必要时更换发信渠道。'
        ],
        script: '麻烦先确认两点：\n1. 邮箱地址是否填写正确；\n2. 请检查「垃圾邮件 / 广告邮件」文件夹，并把我们的发件人加入白名单。\n另外，验证码每 15 分钟最多发送 5 次，超过会被暂时限制，稍等一会再试即可。\n如果都排除了还是收不到，告诉我发送时间，我查一下服务端记录。'
    },
    {
        id: 'sync-missing',
        category: 'data',
        title: '换设备后看不到云端历史记录',
        symptom: '在新设备登录后，个人中心的历史记录为空，或数量比旧设备少。',
        steps: [
            '确认账号一致：两端必须是同一个账号登录（手机号 / 邮箱）。',
            '确认权益：云端历史同步是专业版功能，基础版仅保存在本机。',
            '到管理台「用户」页确认该账号 plan 为 pro、有效期未过期。',
            '让用户在联网状态下打开个人中心，触发一次同步后下拉查看。',
            '提醒用户：本地未上传过的记录不会自动出现在新设备上。'
        ],
        script: '云端历史同步需要满足两个条件：\n1. 两端登录的是同一个账号；\n2. 账号具有专业版权益（基础版的记录只保存在本机，不会跨设备）。\n请你在新设备上联网打开「个人中心」停留几秒触发同步。\n如果还是没有，把账号和我核对一下，我帮你确认权益状态。'
    },
    {
        id: 'calc-diff',
        category: 'data',
        title: '计算结果与预期不一致 / 历史记录少了',
        symptom: '同一组数据算出来的结果和之前不同，或历史记录数量变少。',
        steps: [
            '核对输入项：公积金 / 社保基数有默认值（当前默认 7546），用户可能未按实际填写。',
            '核对口径：结果页「税前收入」「应纳税所得额」「应退/补税额」应与预算表汇总行一致。',
            '确认版本：旧版本可能存在口径差异，让用户走一次排障短链确认是最新版。',
            '若仍不一致：请用户提供计算类型、关键输入项与结果截图，按疑点复算并记录到反馈。'
        ],
        script: '麻烦帮我核对几个信息，方便定位：\n1. 你使用的计算类型（综合所得 / 经营所得 / 分类所得 / 反向倒算）；\n2. 关键输入项（收入、公积金基数、社保基数等）；\n3. 页面底部的版本号。\n另外请先打开 {RESET_URL} 重置一次缓存，确认你用的是最新版本。\n把以上信息发我，我马上帮你核对口径。'
    },
    {
        id: 'export-result',
        category: 'usage',
        title: '如何导出 PDF / 保存计算结果',
        symptom: '用户不清楚怎么把计算结果保存下来或打印出来。',
        steps: [
            '指引：计算完成后，在结果区找到「导出 / 保存」相关按钮。',
            '若用户按钮无效：先走一次排障短链确认不是旧版脚本问题。',
            '导出依赖浏览器下载权限，提醒用户不要拦截本站的下载。',
            '仍失败则建议改用浏览器自带的「打印 → 另存为 PDF」。'
        ],
        script: '计算结果可以在结果页面直接导出：\n1. 先完成一次计算，停留在结果页；\n2. 在结果区域找到「导出 / 保存」按钮并点击；\n3. 如果浏览器提示是否允许下载，请选择「允许」。\n如果按钮没反应，先打开 {RESET_URL} 重置一次缓存再试；\n也可以按 Ctrl+P 选择「另存为 PDF」。'
    }
];

function supportResetUrl() {
    return `${location.origin}/reset`;
}

// steps 兼容两种来源：接口返回 JSON 字符串；离线快照是数组
function parseSupportSteps(raw) {
    if (Array.isArray(raw)) return raw;
    try {
        const parsed = JSON.parse(raw || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
        return [];
    }
}

// 归一化：接口条目（script_id）与离线快照（id）统一成同一种结构
function normalizeSupportItem(raw) {
    return {
        id: raw.id,
        script_id: raw.script_id || raw.id || '',
        category: raw.category || 'usage',
        title: raw.title || '',
        symptom: raw.symptom || '',
        steps: parseSupportSteps(raw.steps),
        script: raw.script || '',
        priority: Number(raw.priority) || 0
    };
}

// 面板当前匹配的条目（前端过滤：条数少、输入即筛更跟手）
function supportRows() {
    const q = (($('#support-query') || {}).value || '').trim().toLowerCase();
    const cat = (($('#support-category-filter') || {}).value) || '';
    return state.support.items.filter((it) => {
        if (cat && it.category !== cat) return false;
        if (!q) return true;
        return [it.title, it.symptom, it.script, ...it.steps].join(' ').toLowerCase().includes(q);
    });
}

async function loadSupport() {
    const urlEl = $('#support-reset-url');
    if (urlEl) urlEl.textContent = supportResetUrl();

    const el = $('#support-list');
    if (el) el.innerHTML = '<div class="py-12 text-center text-gray-400 text-sm"><i class="fa fa-spinner fa-spin mr-2 align-middle"></i>加载中…</div>';

    try {
        const d = await api('/admin/support');
        state.support.items = ((d && d.items) || []).map(normalizeSupportItem);
        state.support.source = 'api';
    } catch (err) {
        // 接口不可用：退回离线快照，保证面板不至于白屏
        state.support.items = OFFLINE_SUPPORT_PLAYBOOK.map(normalizeSupportItem);
        state.support.source = 'offline';
        reportError(err, '话术库接口不可用，已切换离线快照');
    }
    renderSupport();
}

function renderSupport() {
    const el = $('#support-list');
    if (!el) return;

    const urlEl = $('#support-reset-url');
    if (urlEl) urlEl.textContent = supportResetUrl();

    const rows = supportRows();
    const banner = state.support.source === 'offline'
        ? '<div class="mb-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800"><i class="fa fa-plug mr-1"></i>当前展示的是<b>离线兜底快照</b>，此状态下无法编辑。请确认服务端已部署并执行数据库迁移（新增 SupportScript 表）后点「刷新」。</div>'
        : '';

    if (!rows.length) {
        el.innerHTML = banner + '<div class="py-12 text-center text-gray-400 text-sm"><i class="fa fa-search mr-2 text-2xl align-middle"></i>没有匹配的条目</div>';
        return;
    }

    const editable = state.support.source === 'api';
    el.innerHTML = banner + rows.map((it) => {
        const meta = SUPPORT_CATEGORY_META[it.category] || SUPPORT_CATEGORY_META.usage;
        const full = it.script.replace(/\{RESET_URL\}/g, supportResetUrl());
        return `<div class="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
            <div class="flex flex-wrap items-start justify-between gap-2 mb-2">
                <div class="flex items-center gap-2 flex-wrap">
                    <span class="px-2 py-0.5 rounded-full border ${meta.cls} text-xs font-semibold">${meta.label}</span>
                    <span class="text-sm font-bold text-gray-800">${esc(it.title)}</span>
                    ${it.priority ? `<span class="text-[10px] text-gray-400">优先级 ${it.priority}</span>` : ''}
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                    <button data-act="support-copy" data-key="${esc(it.script_id)}" class="px-2.5 py-1.5 rounded-lg text-xs bg-blue-50 text-blue-700 hover:bg-blue-100"><i class="fa fa-copy mr-1"></i>复制话术</button>
                    ${editable ? `<button data-act="support-edit" data-id="${it.id}" class="px-2.5 py-1.5 rounded-lg text-xs bg-gray-100 text-gray-600 hover:bg-gray-200"><i class="fa fa-pencil mr-1"></i>编辑</button>
                    <button data-act="support-delete" data-id="${it.id}" class="px-2.5 py-1.5 rounded-lg text-xs bg-red-50 text-red-600 hover:bg-red-100"><i class="fa fa-trash mr-1"></i>删除</button>` : ''}
                </div>
            </div>
            <p class="text-xs text-gray-500 leading-relaxed mb-2"><span class="font-semibold text-gray-600">典型症状：</span>${esc(it.symptom)}</p>
            <ol class="list-decimal list-inside text-xs text-gray-600 leading-relaxed space-y-0.5 mb-3">
                ${it.steps.map((s) => `<li>${esc(s)}</li>`).join('')}
            </ol>
            <pre class="text-xs text-gray-700 bg-gray-50 border border-gray-100 rounded-lg p-3 whitespace-pre-wrap break-words font-sans">${esc(full)}</pre>
        </div>`;
    }).join('');
}

// ---------- 话术编辑（新增 / 修改） ----------
function openSupportEditor(id) {
    const box = $('#support-editor');
    if (!box) return;
    const item = id ? state.support.items.find((x) => x.id === id) : null;
    state.support.editingId = item ? item.id : null;

    const catOptions = Object.entries(SUPPORT_CATEGORY_META)
        .map(([k, v]) => `<option value="${k}"${item && item.category === k ? ' selected' : ''}>${v.label}</option>`)
        .join('');

    box.innerHTML = `
        <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h3 class="text-sm font-bold text-gray-800">${item ? '编辑话术' : '新增话术'}</h3>
            <span class="text-[11px] text-gray-400">话术中的 <span class="mono">{RESET_URL}</span> 会替换为当前站点的 /reset 短链</span>
        </div>
        <div class="grid sm:grid-cols-2 gap-3 mb-3">
            <label class="block"><span class="text-xs text-gray-500">问题标题 *</span>
                <input id="support-f-title" class="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value="${esc(item ? item.title : '')}" placeholder="如：发版后仍看到旧版页面">
            </label>
            <label class="block"><span class="text-xs text-gray-500">分类</span>
                <select id="support-f-category" class="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">${catOptions}</select>
            </label>
        </div>
        <label class="block mb-3"><span class="text-xs text-gray-500">典型症状</span>
            <input id="support-f-symptom" class="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value="${esc(item ? item.symptom : '')}">
        </label>
        <label class="block mb-3"><span class="text-xs text-gray-500">处理步骤（一行一步）</span>
            <textarea id="support-f-steps" rows="5" class="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">${esc(item ? item.steps.join('\n') : '')}</textarea>
        </label>
        <label class="block mb-3"><span class="text-xs text-gray-500">话术正文 *（可直接复制发给用户）</span>
            <textarea id="support-f-script" rows="6" class="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">${esc(item ? item.script : '')}</textarea>
        </label>
        <label class="block mb-4 w-40"><span class="text-xs text-gray-500">优先级（大的靠前）</span>
            <input id="support-f-priority" type="number" class="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value="${item ? item.priority : 0}">
        </label>
        <div class="flex items-center gap-2">
            <button data-act="support-save" class="bg-primary text-white text-sm font-medium rounded-lg px-4 py-2 hover:opacity-90"><i class="fa fa-save mr-1"></i>保存</button>
            <button data-act="support-cancel" class="bg-gray-100 text-gray-600 text-sm rounded-lg px-4 py-2 hover:bg-gray-200">取消</button>
        </div>`;
    box.classList.remove('hidden');
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function saveSupport() {
    const title = $('#support-f-title').value.trim();
    const script = $('#support-f-script').value.trim();
    if (!title) return toast('请填写问题标题', 'error');
    if (!script) return toast('请填写话术正文', 'error');

    const payload = {
        title,
        script,
        category: $('#support-f-category').value,
        symptom: $('#support-f-symptom').value.trim(),
        steps: $('#support-f-steps').value,
        priority: parseInt($('#support-f-priority').value, 10) || 0
    };

    const id = state.support.editingId;
    try {
        if (id) await api(`/admin/support/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        else await api('/admin/support', { method: 'POST', body: JSON.stringify(payload) });
        toast(id ? '已保存' : '已新增', 'success');
        $('#support-editor').classList.add('hidden');
        state.support.editingId = null;
        loadSupport();
    } catch (err) {
        reportError(err, '保存失败');
    }
}

async function deleteSupport(id) {
    const item = state.support.items.find((x) => x.id === id);
    if (!confirm(`确认删除话术「${item ? item.title : id}」？\n\n删除后不可恢复；内置条目可用「恢复内置」找回。`)) return;
    try {
        await api(`/admin/support/${id}`, { method: 'DELETE' });
        toast('已删除', 'success');
        if (state.support.editingId === id) {
            $('#support-editor').classList.add('hidden');
            state.support.editingId = null;
        }
        loadSupport();
    } catch (err) {
        reportError(err, '删除失败');
    }
}

async function restoreSupport() {
    if (!confirm('将补回缺失的内置话术，并把已存在的内置条目还原为出厂内容。\n\n自建条目不受影响。确认继续？')) return;
    try {
        const d = await api('/admin/support/restore', { method: 'POST' });
        toast(`已恢复内置话术（新增 ${d.created} 条，还原 ${d.restored} 条）`, 'success');
        loadSupport();
    } catch (err) {
        reportError(err, '恢复失败');
    }
}

// ---------- 税率（阶段12 C1：税制参数热改 + 版本化 + 可选公告联动） ----------
// 前端预校验规则与后端 server/src/services/taxRateService.js 的 prepareTaxRates 保持一致
// （后端为最终安全边界，前端校验只为即时反馈；表单税率以「百分数」编辑，提交前转小数）
const TR_BRACKETS = [
    { key: 'comprehensiveTaxRates', label: '综合所得税率表（年度）', hasMin: true },
    { key: 'bonusMonthlyTaxRates', label: '月度税率表（年终奖单独计税）', hasMin: false },
    { key: 'businessTaxRates', label: '经营所得税率表（年度）', hasMin: false }
];
const TR_PLACEMENTS = [
    { key: 'modal', label: '启动弹窗' },
    { key: 'notice_list', label: '个人中心公告' },
    { key: 'home_banner', label: '首页公告条' },
    { key: 'assistant_qa', label: '助手问答' }
];
const TR_INPUT = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm';

const trPct = (rate) => Number(((Number(rate) || 0) * 100).toFixed(4));

// 状态反馈同时写入「Tab 顶部」与「保存按钮上方」两处：
// 「保存并发布」在很长的编辑器最底部，只写顶部时用户点完按钮看不到任何反馈（表现为「点了没反应」）。
function setTaxRatesStatus(html) {
    const text = html || '';
    ['#taxrates-status', '#tr-status-inline'].forEach((sel) => {
        const el = $(sel);
        if (!el) return;
        el.innerHTML = text;
        el.classList.toggle('hidden', !text);
    });
}

// 把反馈滚进视口，避免错误信息出现在看不见的位置
function scrollToTaxRatesStatus() {
    const el = $('#tr-status-inline') || $('#taxrates-status');
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function trBracketTable(def, rows) {
    const head = def.hasMin
        ? '<tr><th class="text-left px-3 py-2">级</th><th class="text-left px-3 py-2">起征下限 min</th><th class="text-left px-3 py-2">上限 max</th><th class="text-left px-3 py-2">税率 %</th><th class="text-left px-3 py-2">速算扣除数</th></tr>'
        : '<tr><th class="text-left px-3 py-2">级</th><th class="text-left px-3 py-2">上限 max</th><th class="text-left px-3 py-2">税率 %</th><th class="text-left px-3 py-2">速算扣除数</th></tr>';
    const body = (rows || []).map((r, i) => {
        const last = i === rows.length - 1;
        const minTd = def.hasMin
            ? `<td class="px-3 py-2"><input type="number" step="any" data-tr="${def.key}|${i}|min" value="${r.min ?? ''}" class="${TR_INPUT}"></td>`
            : '';
        const maxVal = (r.max === null || r.max === undefined || r.max === Infinity) ? '' : r.max;
        const maxPh = last ? 'placeholder="留空=无上限"' : '';
        return `<tr class="text-gray-700">
            <td class="px-3 py-2 text-gray-400">${i + 1}</td>
            ${minTd}
            <td class="px-3 py-2"><input type="number" step="any" ${maxPh} data-tr="${def.key}|${i}|max" value="${maxVal}" class="${TR_INPUT}"></td>
            <td class="px-3 py-2"><input type="number" step="0.01" data-tr="${def.key}|${i}|rate" value="${trPct(r.rate)}" class="${TR_INPUT}"></td>
            <td class="px-3 py-2"><input type="number" step="any" data-tr="${def.key}|${i}|deduction" value="${Number(r.deduction) || 0}" class="${TR_INPUT}"></td>
        </tr>`;
    }).join('');
    return `<div class="mb-4">
        <h4 class="text-xs font-semibold text-gray-600 mb-2">${def.label}</h4>
        <div class="overflow-x-auto border border-gray-100 rounded-lg">
            <table class="w-full text-xs">
                <thead class="bg-gray-50 text-gray-500">${head}</thead>
                <tbody class="divide-y divide-gray-100">${body}</tbody>
            </table>
        </div>
    </div>`;
}

function trClassificationTable(cls) {
    const rows = Object.entries(cls || {}).map(([key, v]) => `<tr class="text-gray-700">
        <td class="px-3 py-2 text-gray-400">${esc(key)}</td>
        <td class="px-3 py-2"><input data-trcls="${esc(key)}|name" value="${esc(v.name || '')}" class="${TR_INPUT}"></td>
        <td class="px-3 py-2"><input type="number" step="0.01" data-trcls="${esc(key)}|rate" value="${trPct(v.rate)}" class="${TR_INPUT}"></td>
    </tr>`).join('');
    return `<div class="mb-4">
        <h4 class="text-xs font-semibold text-gray-600 mb-2">分类所得税率表（比例税率）</h4>
        <div class="overflow-x-auto border border-gray-100 rounded-lg">
            <table class="w-full text-xs">
                <thead class="bg-gray-50 text-gray-500"><tr>
                    <th class="text-left px-3 py-2">键</th><th class="text-left px-3 py-2">名称</th><th class="text-left px-3 py-2">税率 %</th>
                </tr></thead>
                <tbody class="divide-y divide-gray-100">${rows}</tbody>
            </table>
        </div>
        <p class="text-[11px] text-gray-400 mt-1">键（interest / rent / transfer / accidental）为计算逻辑引用标识，请勿修改。</p>
    </div>`;
}

function taxRatesEditorHtml(model) {
    const r = model.rates || {};
    const n = state.taxrates.notify || {};
    const placements = TR_PLACEMENTS.map((p) => `<label class="inline-flex items-center gap-1.5 text-xs text-gray-600 mr-3">
        <input type="checkbox" data-tr-placement="${p.key}" ${(n.placements || []).includes(p.key) ? 'checked' : ''}>${p.label}
    </label>`).join('');
    return `<div class="bg-white rounded-xl border border-gray-200 p-5">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h3 class="text-sm font-bold text-gray-800">编辑配置 <span class="text-xs font-normal text-gray-400">（${esc(model.sourceLabel || '')}）</span></h3>
            <span class="text-[11px] text-gray-400">当前生效版本：${esc(model.sourceVersion || '—')}</span>
        </div>
        <div class="grid sm:grid-cols-2 gap-3 mb-4">
            <label class="block"><span class="text-xs text-gray-500">版本号（留空自动生成 YYYY.MM.DD-N）</span>
                <input id="tr-f-version" class="${TR_INPUT} mt-1" value="${esc(model.version || '')}" placeholder="如 2026.2">
            </label>
            <label class="block"><span class="text-xs text-gray-500">变更说明（写入版本历史）</span>
                <input id="tr-f-note" class="${TR_INPUT} mt-1" value="${esc(model.note || '')}" placeholder="如：按新政调整综合所得第 3 档税率">
            </label>
        </div>
        ${TR_BRACKETS.map((def) => trBracketTable(def, r[def.key] || [])).join('')}
        ${trClassificationTable(r.classificationTaxRates)}
        <div class="grid sm:grid-cols-2 gap-3 mb-4">
            <label class="block"><span class="text-xs text-gray-500">社保缴费基数下限（元）</span>
                <input id="tr-f-social" type="number" step="any" class="${TR_INPUT} mt-1" value="${r.MIN_SOCIAL_SECURITY_BASE ?? ''}">
            </label>
            <label class="block"><span class="text-xs text-gray-500">公积金缴费基数下限（元）</span>
                <input id="tr-f-housing" type="number" step="any" class="${TR_INPUT} mt-1" value="${r.MIN_HOUSING_FUND_BASE ?? ''}">
            </label>
        </div>
        <div class="border-t border-gray-100 pt-4 mb-4">
            <label class="flex items-center gap-2 text-sm font-medium text-gray-700">
                <input type="checkbox" id="tr-f-notify-enabled" ${n.enabled ? 'checked' : ''}>
                同步发送更新公告（保存后发布一条公告，复用内容中心投放）
            </label>
            <div id="tr-notify-fields" class="${n.enabled ? '' : 'hidden'} mt-3 space-y-2">
                <input id="tr-f-notify-title" class="${TR_INPUT}" value="${esc(n.title || '')}" placeholder="公告标题（留空自动生成）">
                <input id="tr-f-notify-summary" class="${TR_INPUT}" value="${esc(n.summary || '')}" placeholder="摘要（留空自动生成）">
                <textarea id="tr-f-notify-body" rows="3" class="${TR_INPUT}" placeholder="正文（留空同摘要）">${esc(n.body || '')}</textarea>
                <div class="pt-1">${placements}</div>
            </div>
        </div>
        <div id="tr-status-inline" class="hidden mb-3 text-xs"></div>
        <div class="flex items-center gap-2">
            <button data-act="taxrates-save" class="bg-primary text-white text-sm font-medium rounded-lg px-4 py-2 hover:opacity-90"><i class="fa fa-cloud-upload mr-1"></i>保存并发布</button>
            <button data-act="taxrates-loaddefault" class="bg-gray-100 text-gray-600 text-sm rounded-lg px-4 py-2 hover:bg-gray-200"><i class="fa fa-undo mr-1"></i>载入出厂基线</button>
        </div>
    </div>`;
}

function renderTaxRatesHistory() {
    const box = $('#taxrates-history');
    if (!box) return;
    const items = state.taxrates.history || [];
    box.innerHTML = items.length ? items.map((h) => `<div class="flex items-center justify-between gap-3 border border-gray-100 rounded-lg px-3 py-2">
        <div class="min-w-0">
            <div class="text-xs font-semibold text-gray-700">${esc(h.version)}
                <span class="ml-1 text-[11px] ${h.status === 'published' ? 'text-green-600' : 'text-gray-400'}">${h.status === 'published' ? '生效中' : '历史'}</span>
            </div>
            <div class="text-[11px] text-gray-400 truncate">${esc(h.note || '—')} · ${fmtTime(h.publishedAt || h.createdAt)}</div>
        </div>
        <button data-act="taxrates-rollback" data-id="${h.id}" data-version="${esc(h.version)}" ${h.status === 'published' ? 'disabled' : ''}
            class="shrink-0 px-2.5 py-1.5 rounded-lg text-xs ${h.status === 'published' ? 'bg-gray-50 text-gray-300 cursor-not-allowed' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'}">
            <i class="fa fa-history mr-1"></i>回滚到此版本
        </button>
    </div>`).join('') : '<div class="text-xs text-gray-400">暂无历史版本（首次发布后出现）</div>';
}

function renderTaxRates() {
    const box = $('#taxrates-editor');
    if (!box) return;
    box.innerHTML = state.taxrates.model
        ? taxRatesEditorHtml(state.taxrates.model)
        : '<div class="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">暂无税率配置</div>';
    renderTaxRatesHistory();
}

async function loadTaxRates() {
    const box = $('#taxrates-editor');
    if (box) box.innerHTML = '<div class="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm"><i class="fa fa-spinner fa-spin mr-2"></i>加载税率配置中…</div>';
    setTaxRatesStatus('');
    try {
        const d = await api('/admin/tax-rates');
        const st = state.taxrates;
        st.defaults = d.defaults || null;
        st.history = d.history || [];
        const hasCustom = !!(d.current && d.current.payload);
        const rates = hasCustom ? d.current.payload : st.defaults;
        // 版本号一律留空，由后端按 YYYY.MM.DD-N 自动生成。
        // 切勿预填「当前生效版本」：version 在库中唯一，预填会让下一次保存直接撞号被 400 拒绝。
        st.modelOriginal = {
            version: '',
            note: hasCustom ? (d.current.note || '') : '',
            rates,
            sourceLabel: hasCustom ? `线上生效版本 ${d.current.version}` : '出厂基线（尚未发布过自定义配置）',
            sourceVersion: hasCustom ? d.current.version : '（出厂基线）'
        };
        st.model = JSON.parse(JSON.stringify(st.modelOriginal));
        st.notify = { enabled: false, placements: ['modal', 'notice_list'] };
        renderTaxRates();
    } catch (err) {
        reportError(err, '税率配置加载失败');
        if (box) box.innerHTML = '<div class="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">加载失败，请重试</div>';
    }
}

function collectBracket(key, hasMin) {
    const rows = [];
    document.querySelectorAll(`[data-tr^="${key}|"]`).forEach((el) => {
        const parts = el.dataset.tr.split('|');
        const idx = Number(parts[1]);
        if (!rows[idx]) rows[idx] = {};
        rows[idx][parts[2]] = el.value === '' ? null : Number(el.value);
    });
    return rows.map((raw) => {
        const r = raw || {};
        const out = {
            max: (r.max === null || r.max === undefined) ? null : Number(r.max),
            rate: Number(r.rate) / 100,
            deduction: Number(r.deduction)
        };
        if (hasMin) out.min = Number(r.min);
        return out;
    });
}

function collectTaxRatesForm() {
    const rates = {};
    TR_BRACKETS.forEach((def) => { rates[def.key] = collectBracket(def.key, def.hasMin); });
    const cls = {};
    document.querySelectorAll('[data-trcls]').forEach((el) => {
        const parts = el.dataset.trcls.split('|');
        const key = parts[0];
        if (!cls[key]) cls[key] = {};
        cls[key][parts[1]] = parts[1] === 'rate' ? Number(el.value) / 100 : el.value.trim();
    });
    rates.classificationTaxRates = cls;
    rates.MIN_SOCIAL_SECURITY_BASE = Number($('#tr-f-social').value);
    rates.MIN_HOUSING_FUND_BASE = Number($('#tr-f-housing').value);
    return rates;
}

function collectNotifyFromForm() {
    const enabled = !!($('#tr-f-notify-enabled') && $('#tr-f-notify-enabled').checked);
    const placements = [];
    document.querySelectorAll('[data-tr-placement]').forEach((el) => { if (el.checked) placements.push(el.dataset.trPlacement); });
    return {
        enabled,
        title: $('#tr-f-notify-title') ? $('#tr-f-notify-title').value.trim() : '',
        summary: $('#tr-f-notify-summary') ? $('#tr-f-notify-summary').value.trim() : '',
        body: $('#tr-f-notify-body') ? $('#tr-f-notify-body').value.trim() : '',
        placements
    };
}

function trCheckBrackets(rows, label, hasMin) {
    const errors = [];
    if (!Array.isArray(rows) || !rows.length) return [label + '：不能为空'];
    rows.forEach((r, i) => {
        const tag = `${label} 第 ${i + 1} 级`;
        if (!isFinite(r.rate) || r.rate <= 0 || r.rate > 1) errors.push(`${tag}：税率须在 (0, 100]%`);
        if (!isFinite(r.deduction) || r.deduction < 0) errors.push(`${tag}：速算扣除数须 ≥ 0`);
        if (hasMin && (!isFinite(r.min) || r.min < 0)) errors.push(`${tag}：起征下限须 ≥ 0`);
        const isLast = i === rows.length - 1;
        if (isLast) {
            if (r.max !== null && (!isFinite(r.max) || r.max <= 0)) errors.push(`${tag}：上限须为正数或留空`);
        } else if (r.max === null || !isFinite(r.max) || r.max <= 0) {
            errors.push(`${tag}：非末级上限须为正数`);
        }
    });
    for (let i = 1; i < rows.length; i++) {
        const prev = rows[i - 1];
        const cur = rows[i];
        if (hasMin && isFinite(prev.max) && prev.max !== cur.min) errors.push(`${label}：第 ${i} / ${i + 1} 级不衔接`);
        if (!hasMin && isFinite(prev.max) && isFinite(cur.max) && cur.max <= prev.max) errors.push(`${label}：第 ${i + 1} 级上限须递增`);
        if (isFinite(prev.rate) && isFinite(cur.rate) && cur.rate < prev.rate) errors.push(`${label}：税率须递增`);
    }
    if (hasMin && rows.length && rows[0].min !== 0) errors.push(`${label}：第一级下限须为 0`);
    return errors;
}

function validateTaxRatesForm(rates) {
    let errors = [];
    errors = errors.concat(trCheckBrackets(rates.comprehensiveTaxRates, '综合所得税率表', true));
    errors = errors.concat(trCheckBrackets(rates.bonusMonthlyTaxRates, '月度税率表', false));
    errors = errors.concat(trCheckBrackets(rates.businessTaxRates, '经营所得税率表', false));
    Object.keys(rates.classificationTaxRates || {}).forEach((k) => {
        const it = rates.classificationTaxRates[k];
        if (!isFinite(it.rate) || it.rate <= 0 || it.rate > 1) errors.push(`分类所得税率「${it.name || k}」：税率须在 (0, 100]%`);
    });
    if (!isFinite(rates.MIN_SOCIAL_SECURITY_BASE) || rates.MIN_SOCIAL_SECURITY_BASE < 0) errors.push('社保缴费基数下限须 ≥ 0');
    if (!isFinite(rates.MIN_HOUSING_FUND_BASE) || rates.MIN_HOUSING_FUND_BASE < 0) errors.push('公积金缴费基数下限须 ≥ 0');
    return errors;
}

function resetTaxRatesForm() {
    const st = state.taxrates;
    if (!st.modelOriginal) return;
    st.model = JSON.parse(JSON.stringify(st.modelOriginal));
    st.notify = { enabled: false, placements: ['modal', 'notice_list'] };
    renderTaxRates();
    toast('已载入当前生效值', 'info');
}

function loadDefaultTaxRates() {
    const st = state.taxrates;
    if (!st.defaults) return;
    if (!confirm('将用「出厂基线」覆盖当前表单（不会立即生效，需再点「保存并发布」）。确认继续？')) return;
    // defaults 是「扁平的 rates 对象」（comprehensiveTaxRates / MIN_* 直接在顶层），
    // 而编辑器 model 的形状是 { version, note, rates, sourceLabel }，必须包进 rates。
    // 整体直接赋值会让 taxRatesEditorHtml 的 r = model.rates || {} 取到空对象 → 表格被清空，
    // 保存时 collectTaxRatesForm 收集到空数组 → 必然「不能为空」而发布失败。
    st.model = {
        version: '',
        note: '',
        rates: JSON.parse(JSON.stringify(st.defaults)),
        sourceLabel: '出厂基线（尚未保存）',
        sourceVersion: (st.modelOriginal && st.modelOriginal.sourceVersion) || '（出厂基线）'
    };
    renderTaxRates();
    toast('已载入出厂基线，确认无误后点「保存并发布」', 'info');
}

function updateNotifyFieldsVisibility() {
    const cb = $('#tr-f-notify-enabled');
    const box = $('#tr-notify-fields');
    if (cb && box) box.classList.toggle('hidden', !cb.checked);
}

async function saveTaxRates() {
    const rates = collectTaxRatesForm();
    const version = ($('#tr-f-version').value || '').trim();
    const note = ($('#tr-f-note').value || '').trim();
    const errors = validateTaxRatesForm(rates);
    if (errors.length) {
        const msg = `${errors[0]}${errors.length > 1 ? ` （共 ${errors.length} 项问题）` : ''}`;
        setTaxRatesStatus(`<span class="text-red-600"><i class="fa fa-exclamation-circle mr-1"></i>${esc(msg)}</span>`);
        toast(msg, 'error');
        scrollToTaxRatesStatus();
        return;
    }
    const notify = collectNotifyFromForm();
    state.taxrates.notify = notify;
    const payload = { version, note, rates };
    if (notify.enabled) payload.notify = notify;

    if (!confirm(`确认发布税率版本「${version || '（自动生成）'}」？\n\n保存后立即对所有用户生效。${notify.enabled ? '\n并会同步发送一条更新公告。' : ''}`)) return;

    setTaxRatesStatus('<span class="text-gray-500"><i class="fa fa-spinner fa-spin mr-1"></i>发布中…</span>');
    try {
        const d = await api('/admin/tax-rates', { method: 'POST', body: JSON.stringify(payload) });
        toast(`已发布税率版本 ${d.config.version}${d.release ? '，并已发送公告' : ''}`, 'success');
        loadTaxRates();
    } catch (err) {
        const detail = (err.details && err.details.length) ? err.details.slice(0, 3).join('；') : err.message;
        setTaxRatesStatus(`<span class="text-red-600"><i class="fa fa-exclamation-circle mr-1"></i>${esc(detail)}</span>`);
        scrollToTaxRatesStatus();
        if (err.status === 401) reportError(err);
        else toast(detail, 'error');
    }
}

async function rollbackTaxRates(id, version) {
    if (id == null) return;
    if (!confirm(`确认回滚到版本「${version || id}」？\n\n将以该版本配置另存为一个新版本（历史保留，可再次回滚）。`)) return;
    try {
        const d = await api('/admin/tax-rates/rollback', { method: 'POST', body: JSON.stringify({ id }) });
        toast(`已回滚，新版本 ${d.config.version}`, 'success');
        loadTaxRates();
    } catch (err) {
        reportError(err, '回滚失败');
    }
}

// ---------- 动作分发（data-act 委托） ----------
async function handleAction(e) {
    const act = e.target.closest('[data-act]');
    if (!act) return;
    const id = act.dataset.id;
    const name = act.dataset.act;
    const back = async (fn) => { try { await fn; } catch (err) { reportError(err); } };
    if (name === 'refresh-support') return back(loadSupport());
    if (name === 'support-new') return openSupportEditor(null);
    if (name === 'support-edit') return openSupportEditor(Number(id));
    if (name === 'support-save') return back(saveSupport());
    if (name === 'support-cancel') { $('#support-editor').classList.add('hidden'); state.support.editingId = null; return; }
    if (name === 'support-delete') return back(deleteSupport(Number(id)));
    if (name === 'support-restore') return back(restoreSupport());
    if (name === 'support-copy-reset-url') return back(copyText(supportResetUrl(), '排障短链已复制'));
    if (name === 'support-copy') {
        const item = state.support.items.find((x) => x.script_id === act.dataset.key);
        if (!item) return;
        return back(copyText(item.script.replace(/\{RESET_URL\}/g, supportResetUrl()), '话术已复制'));
    }
    if (name === 'refresh-overview') return back(loadOverview());
    if (name === 'refresh-feedback') return back(loadFeedback());
    if (name === 'search-users') return loadUsers(true);
    if (name === 'users-prev') { if (state.users.offset - state.users.limit >= 0) { state.users.offset -= state.users.limit; loadUsers(); } return; }
    if (name === 'users-next') { if (state.users.offset + state.users.limit < state.users.total) { state.users.offset += state.users.limit; loadUsers(); } return; }
    if (name === 'user-detail') return openUserDetail(Number(id));
    if (name === 'grant-trial') {
        return applyUserPlan(Number(id), { plan: 'pro', expiresAt: new Date(Date.now() + 14 * 86400000).toISOString(), grantedBy: 'admin' }, `将授予用户 #${id} 14 天专业版体验（到期自动回落基础版）。`);
    }
    if (name === 'grant-permanent') {
        return applyUserPlan(Number(id), { plan: 'pro', expiresAt: null, grantedBy: 'admin' }, `将授予用户 #${id} 永久专业版。\n\n提醒：正式上线前不应对测试用户作出永久承诺，请确认这是内部决策（种子贡献/补偿）再继续。`);
    }
    if (name === 'grant-days') {
        const days = parseInt($(`#grant-days-input-${id}`).value, 10);
        const n = Number.isInteger(days) && days >= 1 && days <= 365 ? days : 30;
        return applyUserPlan(Number(id), { plan: 'pro', expiresAt: new Date(Date.now() + n * 86400000).toISOString(), grantedBy: 'admin' }, `将授予用户 #${id} ${n} 天专业版（到期自动回落基础版）。`);
    }
    if (name === 'revoke-pro') {
        return applyUserPlan(Number(id), { plan: 'free' }, `将把用户 #${id} 回落为基础版（云端历史数据不受影响，仅停用同步等专业功能）。`);
    }
    if (name === 'gen-invites') return back(generateInvites());
    if (name === 'copy-code') return back(copyText(act.dataset.code, '兑换码已复制'));
    if (name === 'search-content') return back(loadContent(true));
    if (name === 'new-content') return openContentEditor(null);
    if (name === 'content-edit') return openContentEditor(Number(id));
    if (name === 'content-delete') return back(deleteContentItem(Number(id)));
    if (name === 'content-save') return back(saveContent());
    if (name === 'content-cancel') { $('#content-editor').classList.add('hidden'); state.content.editingId = null; return; }
    if (name === 'publish-content') return back(publishContentItems());
    if (name === 'content-prev') { if (state.content.offset - state.content.limit >= 0) { state.content.offset -= state.content.limit; back(loadContent()); } return; }
    if (name === 'content-next') { if (state.content.offset + state.content.limit < state.content.total) { state.content.offset += state.content.limit; back(loadContent()); } return; }
    if (name === 'taxrates-refresh') return back(loadTaxRates());
    if (name === 'taxrates-reset') return resetTaxRatesForm();
    if (name === 'taxrates-loaddefault') return loadDefaultTaxRates();
    if (name === 'taxrates-save') return back(saveTaxRates());
    if (name === 'taxrates-rollback') return back(rollbackTaxRates(Number(id), act.dataset.version));
}

// ---------- 初始化 ----------
function init() {
    $('#login-btn').addEventListener('click', doLogin);
    $('#login-token-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
    $('#logout-btn').addEventListener('click', () => doLogout());

    document.querySelectorAll('[data-nav]').forEach((btn) => {
        btn.addEventListener('click', () => switchTab(btn.dataset.nav));
    });

    $('#feedback-status-filter').addEventListener('change', () => loadFeedback());
    $('#feedback-category-filter').addEventListener('change', () => loadFeedback());
    $('#users-query').addEventListener('keydown', (e) => { if (e.key === 'Enter') loadUsers(true); });
    $('#users-plan-filter').addEventListener('change', () => loadUsers(true));
    $('#invite-count').addEventListener('keydown', (e) => { if (e.key === 'Enter') generateInvites(); });

    // 内容中心筛选与编辑器
    $('#content-type-filter').addEventListener('change', () => loadContent(true));
    $('#content-status-filter').addEventListener('change', () => loadContent(true));
    $('#content-audience-filter').addEventListener('change', () => loadContent(true));
    $('#content-query').addEventListener('keydown', (e) => { if (e.key === 'Enter') loadContent(true); });

    // 排障话术库：输入即过滤，无需点查询
    $('#support-query').addEventListener('input', () => renderSupport());
    $('#support-category-filter').addEventListener('change', () => renderSupport());
    $('#content-editor').addEventListener('change', (e) => {
        if (e.target && e.target.id === 'content-f-type') {
            const isPolicy = e.target.value === 'policy';
            const pf = $('#content-fields-policy');
            const ff = $('#content-fields-feed');
            if (pf) pf.classList.toggle('hidden', !isPolicy);
            if (ff) ff.classList.toggle('hidden', isPolicy);
        }
    });

    document.addEventListener('click', (e) => {
        if (e.target.closest('[data-act]')) {
            const a = e.target.closest('[data-act]');
            if (!['users-prev', 'users-next', 'search-users'].includes(a.dataset.act)) e.preventDefault();
            handleAction(e);
        }
        const img = e.target.closest('img[data-att-preview]');
        if (img) {
            const [fbId, idx] = img.dataset.attPreview.split(':');
            openLightbox(img.src, `反馈 #${fbId} · 附图 ${Number(idx) + 1}`);
        }
    });

    document.addEventListener('change', (e) => {
        const sel = e.target.closest('[data-feedback-status]');
        if (sel) updateFeedbackStatus(Number(sel.dataset.feedbackStatus), sel.value);
        if (e.target && e.target.id === 'tr-f-notify-enabled') updateNotifyFieldsVisibility();
    });

    // 记住的令牌直接进入
    const saved = localStorage.getItem(TOKEN_KEY);
    if (saved) {
        $('#login-token-input').value = saved;
        $('#login-remember').checked = true;
        doLogin();
    }
}

init();

