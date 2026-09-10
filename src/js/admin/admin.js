// EuriskoTax Admin Console（运维后台）
// 轻量管理台：总览 / 反馈处理 / 用户权益 / 兑换码；所有请求带 X-Admin-Token。

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

const state = { token: '', tab: 'overview', users: { q: '', plan: '', offset: 0, limit: 20, total: 0, items: [] } };

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

// ---------- 动作分发（data-act 委托） ----------
async function handleAction(e) {
    const act = e.target.closest('[data-act]');
    if (!act) return;
    const id = act.dataset.id;
    const name = act.dataset.act;
    const back = async (fn) => { try { await fn; } catch (err) { reportError(err); } };
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

