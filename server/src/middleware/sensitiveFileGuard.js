'use strict';

/**
 * 敏感文件守卫 —— 后端源码 / 运维脚本 / 点文件 / 本地库与密钥，一律不下发
 *
 * 背景（不是假想风险，是实测可达的泄漏）：
 *   app.js 用 `express.static` 把**仓库根整个**托管出来（前端页面就是这么被服务的），
 *   于是下面这些地址在开了「公网分享」（tools/ops/ops-start-dev.ps1 -Share，cpolar 穿透）
 *   或部署到公网后，任何人都能直接下载：
 *
 *       GET /server/prisma/dev.db   → 200  SQLite format 3 …   ← 全库：用户邮箱 + 密码哈希 + 计算记录
 *       GET /.git/HEAD              → 200  ref: refs/heads/main ← 配合 .git/objects 可拖走整份源码历史
 *       GET /server/src/app.js      → 200  后端源码（限流规则、管理端点一览无余）
 *       GET /tools/ops/*.json       → 200  运维配置（SMTP 授权码 / 隧道 token 一旦生成即外发）
 *       GET /dev-account.local.json → 200  本机测试账号的真实密码
 *
 *   注意：express.static 的 `dotfiles: 'ignore'` 只挡**最后一段是点文件**的请求
 *   （`/.env` 挡得住，但 `/.git/config` 挡不住，因为最后一段是 `config`），
 *   且 SPA 回退 `app.get('*')` 会把没命中的路径统统回成 index.html（状态码 200）——
 *   「200」不代表内容安全，这也是必须显式设闸的原因。
 *
 * 规则：
 *   - 顶层目录 server / tools / docs、任何点文件段（.git / .env / .github …）、
 *     数据库与密钥类后缀 → **一律 404**，本机请求也一样（本机要看库用 Prisma Studio，
 *     不需要走 HTTP；规则不区分来源，就不会因 trust proxy 解析差异而漏判）
 *   - `*.local.json`（本机测试账号）是本页唯一例外：前端「填入本地测试账号」由本机发起，
 *     故**仅环回地址可读取**，公网来源 404
 *   - 用 404 而不是 403：不向公网确认「这个文件存在」，与文件不存在的表现完全一致
 */

// 顶层目录：前端页面用不到，外发即事故（docs 是内部开发方案，不参与站点内容）
const BLOCKED_TOP_DIRS = ['server', 'tools', 'docs'];

// 后缀：数据库文件、私钥/证书、本机专属覆盖文件
const BLOCKED_SUFFIXES = [
    '.db', '.sqlite', '.sqlite3', '.db-journal',
    '.pem', '.key', '.p12', '.pfx',
    '.local.json'
];

// 本机专属文件：只有它按来源放行（环回可读）
const LOCAL_ONLY_SUFFIX = '.local.json';

/**
 * 是否环回地址
 * @param {string} ip req.ip（app 开了 trust proxy，故可能是 X-Forwarded-For 里的客户端 IP）
 */
const isLoopbackAddress = (ip) => {
    const normalized = String(ip || '').trim().toLowerCase().replace(/^::ffff:/, '');
    return normalized === '127.0.0.1' || normalized === '::1' || normalized === 'localhost';
};

/** 路径里是否含点文件段（.git / .env / .github / .codebuddy …） */
const hasDotfileSegment = (target) => String(target || '').split('/')
    .some((seg) => seg.startsWith('.') && seg !== '.' && seg !== '..');

/**
 * 是否应当拦下（true = 拦）
 * @param {string} target 小写化后的路径
 * @param {boolean} loopback 是否环回地址
 */
const shouldBlock = (rawPath, loopback) => {
    // 自己统一小写化：调用方（中间件 / 测试）不必记得先转小写，绕写 /Server/DEV.DB 一样拦得住
    const target = String(rawPath || '').toLowerCase();
    if (hasDotfileSegment(target)) return true;
    if (BLOCKED_SUFFIXES.some((suffix) => target.endsWith(suffix))) {
        // 本机专属文件是唯一例外：环回地址仍要能读（登录页预填测试账号依赖它）
        if (target.endsWith(LOCAL_ONLY_SUFFIX) && loopback) return false;
        return true;
    }
    const first = target.replace(/^\/+/, '').split('/')[0];
    return BLOCKED_TOP_DIRS.includes(first);
};

/**
 * 守卫中间件：必须挂在 express.static 之前
 */
const sensitiveFileGuard = (req, res, next) => {
    const target = String(req.path || '').toLowerCase();
    const loopback = isLoopbackAddress(req.ip || (req.socket && req.socket.remoteAddress));
    if (!shouldBlock(target, loopback)) {
        return next();
    }
    // 公网 / 本机都不下发，且不确认文件存在
    return res.status(404).send('Not Found');
};

module.exports = {
    sensitiveFileGuard,
    shouldBlock,
    isLoopbackAddress,
    BLOCKED_TOP_DIRS,
    BLOCKED_SUFFIXES,
    LOCAL_ONLY_SUFFIX
};
