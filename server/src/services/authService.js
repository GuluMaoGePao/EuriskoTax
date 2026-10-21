const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// 邮箱归一化：去首尾空格 + 转小写，避免大小写差异绕过查重、登录时精确匹配失败
const normalizeEmail = (rawEmail) => String(rawEmail || '').trim().toLowerCase();

// 种子期授权开关：SEED_GRANT_PRO=true 时，注册/登录即授予 pro（pro_granted_by="seed"，永久）
// 生产正式收费时置 false，改由兑换码/支付渠道（阶段11）授权
const seedGrantEnabled = () => process.env.SEED_GRANT_PRO === 'true';

// 体验版规则（三档体系）：基础版用户可免费领取 14 天专业版体验
// 实现复用现有模型：plan=pro + plan_expires_at=+14天 + pro_granted_by='trial'；
// isPro 到期自动回落基础版。公测期不限次数：到期后随时可再次领取（进行中不叠加）。
const TRIAL_DAYS = 14;
const TRIAL_DAYS_MS = TRIAL_DAYS * 24 * 60 * 60 * 1000;

// 领取专业版体验（幂等语义）：
//   - 已是有效 pro（seed 永久 / 正式授权 / 体验进行中）→ 原样返回不重复发放（already_pro=true）
//   - 免费 或 过期 trial → 重新授予 14 天体验（granted_by='trial'）
const claimTrial = async (userId) => {
    const user = await getUserById(userId);
    const now = Date.now();
    const exp = user.plan_expires_at ? new Date(user.plan_expires_at).getTime() : null;
    const proActive = user.plan === 'pro' && (!exp || !Number.isFinite(exp) || exp > now);
    if (proActive) {
        return user; // 已拥有有效专业版/体验，不叠加
    }
    return await prisma.user.update({
        where: { id: userId },
        data: {
            plan: 'pro',
            plan_expires_at: new Date(now + TRIAL_DAYS_MS),
            pro_granted_by: 'trial'
        },
        select: {
            id: true,
            username: true,
            email: true,
            phone: true,
            plan: true,
            plan_expires_at: true,
            pro_granted_by: true,
            created_at: true,
            updated_at: true
        }
    });
};

// 签发登录令牌：payload 带登录态版本号 tv（中间件据此吊销旧 token）。
// 抽成独立函数是因为 v1.144.0 起签发点不止登录一处 —— 注册成功同样直接签令牌，
// 两处必须走同一份 payload 结构，否则一处漏带 tv 就等于那条链路绕过了吊销。
const signTokenForUser = (user) => jwt.sign(
    { userId: user.id, tv: user.token_version ?? 0 },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
);

// 登录态版本号 +1 —— 使该用户**此前签发的全部 JWT** 一次性失效。
// 用于改密码、重置密码、退出登录这三处「必须让旧会话下线」的时刻。
const bumpTokenVersion = async (userId) => prisma.user.update({
    where: { id: userId },
    data: { token_version: { increment: 1 } },
    select: { id: true, token_version: true }
});

// 邀请码预检（v1.144.0）：注册事务之前先确认这个码能用。
// 单独抽出来是为了把「邀请码无效」挡在**验证码被消费之前** —— 邮箱验证码是一次性的，
// 若先校验验证码、后校验邀请码，邀请码填错的用户就得重新收一封邮件（旧行为的坑）。
// 邀请码是纯查库、无副作用，放前面最省事；空值直接放行（选填语义）。
// 事务内仍会再查一次：这里的通过不代表那一刻还没被别人抢走。
const checkInviteCode = async (inviteCode) => {
    const code = String(inviteCode || '').trim();
    if (!code) return null;

    const invite = await prisma.inviteCode.findUnique({ where: { code } });
    if (!invite) {
        const error = new Error('Invite code not found');
        error.statusCode = 403;
        throw error;
    }
    if (invite.used_by !== null) {
        const error = new Error('Invite code already used');
        error.statusCode = 403;
        throw error;
    }
    return invite;
};

// 查重（区分用户名/邮箱，注册前拦截，避免浪费一次性验证码）
const checkDuplicate = async (username, rawEmail) => {
    const email = normalizeEmail(rawEmail);

    if (username) {
        const existingName = await prisma.user.findUnique({ where: { username } });
        if (existingName) {
            const error = new Error('Username already taken');
            error.statusCode = 400;
            throw error;
        }
    }

    if (email) {
        const existingEmail = await prisma.user.findUnique({ where: { email } });
        if (existingEmail) {
            const error = new Error('Email already registered. Please login directly');
            error.statusCode = 409;
            throw error;
        }
    }
};

const registerUser = async (username, email, password, phone = null, inviteCode = null) => {
    const normalizedEmail = normalizeEmail(email);
    const passwordHash = await bcrypt.hash(password, parseInt(process.env.BCRYPT_ROUNDS) || 10);

    try {
        // 事务保证原子性：用户创建与邀请码消耗要么同时成功，要么整体回滚
        const user = await prisma.$transaction(async (tx) => {
            // 并发兜底：事务内再查一次重（两个请求同时到达时前置检查会双双通过）
            const existingUser = await tx.user.findFirst({
                where: {
                    OR: [
                        { username: username },
                        { email: normalizedEmail }
                    ]
                }
            });
            if (existingUser) {
                const error = new Error('Username or email already exists');
                error.statusCode = 400;
                throw error;
            }

            // v1.144.0：邀请码改为**选填**。
            // 原先必填（公测期一机一码）本意是控量，实际挡住的是"没听说过邀请码的普通人" ——
            // 他们注册失败后不会去找开发者要码，只会关掉页面。邮箱验证码已经承担了
            // 「这个邮箱是真的」这一层，邀请码只剩"谁带来的"这一层，那就不该是门槛。
            // 填了才校验：不存在 / 已用过都拒绝；不填则完全跳过，不占用任何码。
            const code = String(inviteCode || '').trim();
            let invite = null;
            if (code) {
                invite = await tx.inviteCode.findUnique({ where: { code } });
                if (!invite) {
                    const error = new Error('Invite code not found');
                    error.statusCode = 403;
                    throw error;
                }
                if (invite.used_by !== null) {
                    const error = new Error('Invite code already used');
                    error.statusCode = 403;
                    throw error;
                }
            }

            // 种子期：注册即授予 pro（granted_by="seed"，永久）；收费期该开关关闭后为默认 free
            const seedGrant = seedGrantEnabled()
                ? { plan: 'pro', pro_granted_by: 'seed' }
                : {};

            const created = await tx.user.create({
                data: {
                    username,
                    email: normalizedEmail,
                    password_hash: passwordHash,
                    phone,
                    ...seedGrant
                },
                select: {
                    id: true,
                    username: true,
                    email: true,
                    phone: true,
                    plan: true,
                    plan_expires_at: true,
                    pro_granted_by: true,
                    created_at: true
                }
            });

            // 只有真的填了邀请码才消耗它（未填时 invite 为 null）
            if (invite) {
                await tx.inviteCode.update({
                    where: { id: invite.id },
                    data: { used_by: created.id, used_at: new Date() }
                });
            }

            return created;
        });

        return user;
    } catch (err) {
        // Prisma 唯一约束冲突兜底（并发写入绕过前置检查时），转友好提示而非英文裸报错
        if (err && err.code === 'P2002') {
            const error = new Error('Username or email already exists');
            error.statusCode = 400;
            throw error;
        }
        throw err;
    }
};

// v1.144.0：登录凭据收敛为**邮箱唯一**。
// 原先「邮箱 或 用户名」双入口（v1.118.0）留下的问题是：账号这个概念有了两个真相源 ——
// 用户名注册时不校验邮箱归属、改邮箱后用户名不变，于是「我是哪个账号」要同时记两件事；
// 忘记密码链路也跟着分叉：填用户名的人收不到验证码邮件，只能回头猜自己注册时用的邮箱。
// 邮箱是唯一经过验证码验证的字段，收敛到它之后，登录与找回共用同一个标识。
// 手机号**仍然不**作为登录凭据：它是未验证字段（注册选填、个人中心随手可改），
// 当凭据会出现串号/冒领，要支持必须先接短信验证码 + phone 唯一索引 + phone_verified_at。
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const loginUser = async (account, password) => {
    const identifier = String(account || '').trim();

    // 非邮箱格式在查库前就拒：既不留"顺手试试用户名"的口子，也让错误提示能明确指向邮箱
    if (!EMAIL_RE.test(identifier)) {
        const error = new Error('Invalid email or password');
        error.statusCode = 401;
        throw error;
    }

    const user = await prisma.user.findUnique({
        where: { email: normalizeEmail(identifier) }
    });

    if (!user) {
        const error = new Error('Invalid email or password');
        error.statusCode = 401;
        throw error;
    }
    
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!isValidPassword) {
        const error = new Error('Invalid email or password');
        error.statusCode = 401;
        throw error;
    }
    
    // 种子期：存量 free 账号登录时自动升级为 pro（granted_by="seed"），幂等（已是 pro 不再改写）
    if (seedGrantEnabled() && user.plan !== 'pro') {
        await prisma.user.update({
            where: { id: user.id },
            data: { plan: 'pro', pro_granted_by: 'seed' }
        });
        user.plan = 'pro';
        user.pro_granted_by = 'seed';
    }
    
    const token = signTokenForUser(user);
    
    return {
        token,
        user: {
            id: user.id,
            username: user.username,
            email: user.email,
            phone: user.phone,
            plan: user.plan,
            plan_expires_at: user.plan_expires_at,
            pro_granted_by: user.pro_granted_by
        }
    };
};

const getUserById = async (userId) => {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            username: true,
            email: true,
            phone: true,
            plan: true,
            plan_expires_at: true,
            pro_granted_by: true,
            created_at: true,
            updated_at: true
        }
    });
    
    if (!user) {
        const error = new Error('User not found');
        error.statusCode = 404;
        throw error;
    }
    
    return user;
};

const verifyPassword = async (userId, password) => {
    const user = await prisma.user.findUnique({
        where: { id: userId }
    });
    
    if (!user) {
        return false;
    }
    
    return await bcrypt.compare(password, user.password_hash);
};

const updateUser = async (userId, data) => {
    const updateData = {};

    if (data.username !== undefined && String(data.username).trim()) {
        updateData.username = String(data.username).trim();
    }
    if (data.email !== undefined && String(data.email).trim()) {
        // 与注册一致：归一化后存储，避免大小写差异造成"改了个寂寞"或重复数据
        updateData.email = normalizeEmail(data.email);
    }
    if (data.phone !== undefined) updateData.phone = data.phone;

    // 查重（排除自身）：username/email 冲突在更新前返回明确 400/409，
    // 而不是撞 Prisma 唯一约束 P2002 → 500 英文裸错
    const current = await prisma.user.findUnique({ where: { id: userId } });
    if (!current) {
        const error = new Error('User not found');
        error.statusCode = 404;
        throw error;
    }
    if (updateData.username && updateData.username !== current.username) {
        const conflict = await prisma.user.findUnique({ where: { username: updateData.username } });
        if (conflict) {
            const error = new Error('该用户名已被占用');
            error.statusCode = 400;
            throw error;
        }
    }
    if (updateData.email && updateData.email !== current.email) {
        const conflict = await prisma.user.findUnique({ where: { email: updateData.email } });
        if (conflict) {
            const error = new Error('该邮箱已被其他账号使用');
            error.statusCode = 409;
            throw error;
        }
    }

    // 改密码：与重置密码同口径 —— 先挡掉"新旧相同"（否则白白把所有设备踢下线），
    // 再把 token_version 推高，让旧会话立即失效；同时返回新令牌，本人这台设备不掉线。
    if (data.password) {
        if (await bcrypt.compare(data.password, current.password_hash)) {
            const error = new Error('新密码不能与当前密码相同');
            error.statusCode = 400;
            throw error;
        }
        updateData.password_hash = await bcrypt.hash(data.password, parseInt(process.env.BCRYPT_ROUNDS) || 10);
        updateData.token_version = { increment: 1 };
    }

    const user = await prisma.user.update({
        where: { id: userId },
        data: updateData,
        select: {
            id: true,
            username: true,
            email: true,
            phone: true,
            token_version: true,
            updated_at: true
        }
    });

    // 改密码分支：token_version 只用来签新令牌，不该出现在返回体里（前端会整包存进
    // current_user，多一个内部字段就多一处"这个数字是什么"的疑问）
    if (data.password) {
        const { token_version: _tv, ...publicUser } = user;
        return { ...publicUser, token: signTokenForUser(user) };
    }

    return user;
};

const deleteUser = async (userId) => {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    
    if (!user) {
        const error = new Error('User not found');
        error.statusCode = 404;
        throw error;
    }
    
    await prisma.user.delete({ where: { id: userId } });
    
    return { message: 'User deleted successfully' };
};

// 校验邮箱是否已注册（忘记密码：未注册邮箱不发送重置码，直接提示）
const ensureEmailRegistered = async (rawEmail) => {
    const email = normalizeEmail(rawEmail);
    const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true }
    });

    if (!user) {
        const error = new Error('User with this email was not found');
        error.statusCode = 404;
        throw error;
    }

    return user;
};

// 对外用户字段：登录 / 注册 / 重置三处返回体必须同构，前端才能用同一份 current_user 渲染顶栏
const PUBLIC_USER_SELECT = {
    id: true,
    username: true,
    email: true,
    phone: true,
    plan: true,
    plan_expires_at: true,
    pro_granted_by: true
};

// 重置密码（忘记密码自助找回）：校验通过后更新密码哈希。
// v1.144.0 两处变化：
//   ① 新密码不能与旧密码相同 —— 否则"重置成功"是一句空话，还白白把所有设备踢下线；
//   ② 密码与 token_version 同一次更新，并返回新令牌 —— 改完这一刻之前签出的 token 全部失效，
//      而刚通过邮箱验证的用户不必再回头输一遍密码（闭环点）。
const resetPassword = async (rawEmail, newPassword) => {
    const email = normalizeEmail(rawEmail);
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
        const error = new Error('User with this email was not found');
        error.statusCode = 404;
        throw error;
    }

    if (await bcrypt.compare(newPassword, user.password_hash)) {
        const error = new Error('新密码不能与当前密码相同');
        error.statusCode = 400;
        throw error;
    }

    const passwordHash = await bcrypt.hash(newPassword, parseInt(process.env.BCRYPT_ROUNDS) || 10);
    const updated = await prisma.user.update({
        where: { id: user.id },
        data: {
            password_hash: passwordHash,
            token_version: { increment: 1 }
        },
        select: { ...PUBLIC_USER_SELECT, token_version: true }
    });

    return { token: signTokenForUser(updated), user: pickPublicUser(updated) };
};

function pickPublicUser(user) {
    return {
        id: user.id,
        username: user.username,
        email: user.email,
        phone: user.phone,
        plan: user.plan,
        plan_expires_at: user.plan_expires_at,
        pro_granted_by: user.pro_granted_by
    };
}

// 退出登录：让该用户此前签发的全部 JWT 失效。
// JWT 本身无法"删除"，能做的是把版本号推高 —— 这样退出才真的等于"别处也下线了"，
// 而不是只在当前浏览器清一下 localStorage（旧行为：token 复制出去 7 天内照样能用）。
const logout = async (userId) => {
    await bumpTokenVersion(userId);
    return { message: 'Logged out successfully' };
};

// 邀请码字符集：排除易混淆字符 0/O、1/I/L、U/V
const INVITE_CHARSET = 'ABCDEFGHJKMNPQRSTWXYZ23456789';

// 生成 EURISKO-XXXX-XXXX 格式邀请码（crypto 级随机）
const generateInviteCode = () => {
    const bytes = require('crypto').randomBytes(8);
    const pick = (offset) => Array.from(
        { length: 4 },
        (_, i) => INVITE_CHARSET[bytes[offset * 4 + i] % INVITE_CHARSET.length]
    ).join('');
    return `EURISKO-${pick(0)}-${pick(1)}`;
};

// 首批邀请码自动兜底：仅当表为空时生成 count 个（幂等，重启不会重复生成）
// 返回生成的码数组；表非空返回 null
const ensureInviteCodes = async (count = 20) => {
    const existing = await prisma.inviteCode.count();
    if (existing > 0) return null;

    const created = [];
    for (let i = 0; i < count; i++) {
        // 碰撞重试：unique 冲突时重新生成
        for (let retry = 0; retry < 5; retry++) {
            try {
                const code = generateInviteCode();
                await prisma.inviteCode.create({ data: { code } });
                created.push(code);
                break;
            } catch (err) {
                if (err.code !== 'P2002') throw err;
            }
        }
    }
    return created;
};

module.exports = {
    checkDuplicate,
    checkInviteCode,
    registerUser,
    loginUser,
    claimTrial,
    getUserById,
    verifyPassword,
    updateUser,
    deleteUser,
    ensureEmailRegistered,
    resetPassword,
    ensureInviteCodes,
    // v1.144.0：登录态版本与签发
    signTokenForUser,
    bumpTokenVersion,
    logout
};
