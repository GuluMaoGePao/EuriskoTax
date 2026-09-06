const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// 邮箱归一化：去首尾空格 + 转小写，避免大小写差异绕过查重、登录时精确匹配失败
const normalizeEmail = (rawEmail) => String(rawEmail || '').trim().toLowerCase();

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

            // 一机一码：码不存在或已被使用均拒绝注册
            const code = String(inviteCode || '').trim();
            const invite = await tx.inviteCode.findUnique({ where: { code } });
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

            const created = await tx.user.create({
                data: {
                    username,
                    email: normalizedEmail,
                    password_hash: passwordHash,
                    phone
                },
                select: {
                    id: true,
                    username: true,
                    email: true,
                    phone: true,
                    created_at: true
                }
            });

            await tx.inviteCode.update({
                where: { id: invite.id },
                data: { used_by: created.id, used_at: new Date() }
            });

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

const loginUser = async (email, password) => {
    const user = await prisma.user.findUnique({
        where: { email: normalizeEmail(email) }
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
    
    const token = jwt.sign(
        { userId: user.id },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
    
    return {
        token,
        user: {
            id: user.id,
            username: user.username,
            email: user.email,
            phone: user.phone
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

    if (data.password) {
        updateData.password_hash = await bcrypt.hash(data.password, parseInt(process.env.BCRYPT_ROUNDS) || 10);
    }

    const user = await prisma.user.update({
        where: { id: userId },
        data: updateData,
        select: {
            id: true,
            username: true,
            email: true,
            phone: true,
            updated_at: true
        }
    });

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

// 重置密码（忘记密码自助找回）：校验通过后更新密码哈希
const resetPassword = async (rawEmail, newPassword) => {
    const email = normalizeEmail(rawEmail);
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
        const error = new Error('User with this email was not found');
        error.statusCode = 404;
        throw error;
    }

    const passwordHash = await bcrypt.hash(newPassword, parseInt(process.env.BCRYPT_ROUNDS) || 10);
    await prisma.user.update({
        where: { id: user.id },
        data: { password_hash: passwordHash }
    });

    return { message: 'Password reset successfully' };
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
    registerUser,
    loginUser,
    getUserById,
    verifyPassword,
    updateUser,
    deleteUser,
    ensureEmailRegistered,
    resetPassword,
    ensureInviteCodes
};
