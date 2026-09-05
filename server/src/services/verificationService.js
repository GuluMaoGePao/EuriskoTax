// 邮箱验证码服务：生成 / 发送 / 校验
// 安全设计：
//   - 验证码存 bcrypt 哈希，不存明文
//   - 10 分钟有效期，60 秒重发冷却（防邮件轰炸）
//   - 最多 5 次错误尝试后作废（防暴力猜码）
//   - 每个邮箱+用途只保留最新一条，旧码自动失效
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const mailService = require('./mailService');

const prisma = new PrismaClient();

const CODE_TTL_MINUTES = 10;       // 验证码有效期（分钟）
const RESEND_COOLDOWN_MS = 60 * 1000;   // 重发冷却 60 秒
const MAX_ATTEMPTS = 5;            // 最大错误尝试次数

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 生成 6 位数字验证码（crypto 级随机，避开可预测的 Math.random）
function generateCode() {
    const bytes = require('crypto').randomBytes(4).readUInt32BE(0);
    return String(bytes % 1000000).padStart(6, '0');
}

// 发送注册验证码；返回 { cooldownMs } 供前端倒计时
const sendRegisterCode = async (rawEmail) => {
    const email = String(rawEmail || '').trim().toLowerCase();

    if (!EMAIL_REGEX.test(email)) {
        const error = new Error('Invalid email format');
        error.statusCode = 400;
        throw error;
    }

    // 60 秒重发冷却：按该邮箱最近一条记录的创建时间判断
    const latest = await prisma.verificationCode.findFirst({
        where: { email, purpose: 'register' },
        orderBy: { created_at: 'desc' }
    });
    if (latest) {
        const elapsed = Date.now() - new Date(latest.created_at).getTime();
        if (elapsed < RESEND_COOLDOWN_MS) {
            const error = new Error('Code resend too frequent. Please wait a moment');
            error.statusCode = 429;
            throw error;
        }
    }

    const code = generateCode();
    const codeHash = await bcrypt.hash(code, 8);
    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000);

    // 只保留最新一条：先删旧记录再写入（幂等，避免历史码残留）
    await prisma.verificationCode.deleteMany({ where: { email, purpose: 'register' } });
    await prisma.verificationCode.create({
        data: { email, code_hash: codeHash, purpose: 'register', expires_at: expiresAt }
    });

    await mailService.sendVerificationCode(email, code, CODE_TTL_MINUTES);

    return { cooldownMs: RESEND_COOLDOWN_MS };
};

// 校验验证码：成功后立即作废；失败递增尝试次数
const verifyRegisterCode = async (rawEmail, code) => {
    const email = String(rawEmail || '').trim().toLowerCase();

    const record = await prisma.verificationCode.findFirst({
        where: { email, purpose: 'register' },
        orderBy: { created_at: 'desc' }
    });

    if (!record) {
        const error = new Error('Verification code not found. Please request a new one');
        error.statusCode = 400;
        throw error;
    }

    if (new Date(record.expires_at).getTime() < Date.now()) {
        const error = new Error('Verification code expired. Please request a new one');
        error.statusCode = 400;
        throw error;
    }

    if (record.attempts >= MAX_ATTEMPTS) {
        const error = new Error('Too many attempts. Please request a new code');
        error.statusCode = 429;
        throw error;
    }

    const isValid = await bcrypt.compare(String(code || ''), record.code_hash);
    if (!isValid) {
        await prisma.verificationCode.update({
            where: { id: record.id },
            data: { attempts: { increment: 1 } }
        });
        const error = new Error('Invalid verification code');
        error.statusCode = 400;
        throw error;
    }

    // 一次性使用：校验通过立即作废
    await prisma.verificationCode.delete({ where: { id: record.id } });
    return true;
};

module.exports = {
    sendRegisterCode,
    verifyRegisterCode
};
