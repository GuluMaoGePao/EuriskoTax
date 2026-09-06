// SMTP 邮件服务：基于 nodemailer，用于发送注册验证码
// 环境变量：SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM_NAME / SMTP_SECURE
// 本地开发兜底：未配置真实 SMTP（或仅复制了 .env.example 的占位值）时，
// 把验证码打印到后端控制台，保证"注册/找回→验证码→提交"全链路在本地可测；
// 生产环境（NODE_ENV=production / 非 dev.db）未配置 SMTP 一律报错，不允许绕过。
const nodemailer = require('nodemailer');

let transporter = null;

// SMTP 是否真实配置：host/user/pass 齐全且不是 .env.example 的占位示例
function hasRealSmtpConfig() {
    const user = String(process.env.SMTP_USER || '');
    const pass = String(process.env.SMTP_PASS || '');
    if (!process.env.SMTP_HOST || !user || !pass) return false;
    // .env.example 的占位值不算配置：本地复制后应走控制台兜底，而不是尝试真实发信
    if (user.includes('your-mail@qq.com') || user.includes('your@')) return false;
    if (pass.includes('your-smtp-auth-code') || pass.includes('your-password')) return false;
    return true;
}

// 是否为本地开发/测试环境（此类环境允许验证码打印到控制台）
function isDevConsoleDelivery() {
    return process.env.NODE_ENV === 'development'
        || process.env.NODE_ENV === 'test'
        || (process.env.DATABASE_URL || '').includes('dev.db');
}

// 懒创建 transporter；SMTP 未（真实）配置时返回 null，由调用方降级处理
function getTransporter() {
    if (!hasRealSmtpConfig()) {
        return null;
    }
    if (!transporter) {
        const port = parseInt(process.env.SMTP_PORT) || 465;
        // 465 走 SSL 直连，587 走 STARTTLS
        const secure = process.env.SMTP_SECURE
            ? process.env.SMTP_SECURE === 'true'
            : port === 465;
        transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port,
            secure,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });
    }
    return transporter;
}

function isMailConfigured() {
    return getTransporter() !== null;
}

// 把验证码打印到后端控制台（仅开发/测试环境调用）
function logCodeToConsole(email, code, expireMinutes, purpose) {
    const action = purpose === 'reset' ? '密码重置' : '邮箱验证';
    console.log('\n====================================================');
    console.log(`  [开发模式] ${action}验证码（收件邮箱 ${email}）`);
    console.log(`  验证码  : ${code}（${expireMinutes} 分钟内有效）`);
    console.log('====================================================\n');
}

// 发送 6 位数字验证码邮件
// purpose：register=注册账号，reset=重置密码（控制标题与正文引导文案）
async function sendVerificationCode(email, code, expireMinutes = 10, purpose = 'register') {
    const client = getTransporter();
    const devConsole = isDevConsoleDelivery();

    if (!client) {
        // 未配置真实 SMTP：
        //  - 生产环境：直接报错（公测期必须能真正发信，不允许绕过）
        //  - 开发/测试环境：打印到控制台，保证本地全链路可测
        if (!devConsole) {
            const error = new Error('SMTP mail is not configured');
            error.statusCode = 500;
            throw error;
        }
        logCodeToConsole(email, code, expireMinutes, purpose);
        return { deliveredVia: 'console', email, code, purpose };
    }

    // 开发/测试环境且已配置 SMTP：仍然打印验证码（供 verify-local-auth 门禁读取），并照常发信
    if (devConsole) {
        logCodeToConsole(email, code, expireMinutes, purpose);
    }

    const fromName = process.env.SMTP_FROM_NAME || 'EuriskoTax';
    const from = process.env.SMTP_USER;
    const isReset = purpose === 'reset';

    const subject = isReset
        ? `【${fromName}】密码重置验证码：${code}`
        : `【${fromName}】邮箱验证码：${code}`;
    const actionHint = isReset ? '你正在重置 <strong>' + fromName + '</strong> 账号密码' : '你正在注册 <strong>' + fromName + '</strong> 账号';
    const html = `
<div style="max-width:520px;margin:0 auto;font-family:'Microsoft YaHei',Arial,sans-serif;color:#333;">
    <div style="background:#1d4ed8;border-radius:12px 12px 0 0;padding:24px;text-align:center;">
        <h2 style="color:#fff;margin:0;font-size:20px;">${fromName} · 个人所得税预算规划工具</h2>
    </div>
    <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:28px 32px;">
        <p style="margin:0 0 12px;">你好！</p>
        <p style="margin:0 0 20px;">${actionHint}，本次验证码为：</p>
        <div style="background:#f3f4f6;border-radius:8px;padding:16px;text-align:center;font-size:32px;font-weight:bold;letter-spacing:8px;color:#1d4ed8;">
            ${code}
        </div>
        <p style="margin:20px 0 8px;color:#6b7280;font-size:13px;">
            验证码 <strong>${expireMinutes} 分钟内有效</strong>，${isReset ? '请尽快完成密码重置，重置后原密码立即失效。' : '请尽快完成注册。'}
        </p>
        <p style="margin:0;color:#ef4444;font-size:13px;">
            如果这不是你本人的操作，请忽略本邮件，切勿将验证码告诉任何人。
        </p>
    </div>
    <p style="text-align:center;color:#9ca3af;font-size:12px;margin-top:16px;">
        本邮件由系统自动发送，请勿回复
    </p>
</div>`;

    await client.sendMail({
        from: `"${fromName}" <${from}>`,
        to: email,
        subject,
        html
    });
}

module.exports = {
    isMailConfigured,
    sendVerificationCode
};
