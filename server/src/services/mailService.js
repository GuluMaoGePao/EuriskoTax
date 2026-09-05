// SMTP 邮件服务：基于 nodemailer，用于发送注册验证码
// 环境变量：SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM_NAME / SMTP_SECURE
const nodemailer = require('nodemailer');

let transporter = null;

// 懒创建 transporter；SMTP 未配置时返回 null，由调用方降级处理
function getTransporter() {
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
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

// 发送 6 位数字验证码邮件
async function sendVerificationCode(email, code, expireMinutes = 10) {
    const client = getTransporter();
    if (!client) {
        const error = new Error('SMTP mail is not configured');
        error.statusCode = 500;
        throw error;
    }

    const fromName = process.env.SMTP_FROM_NAME || 'EuriskoTax';
    const from = process.env.SMTP_USER;

    const subject = `【${fromName}】邮箱验证码：${code}`;
    const html = `
<div style="max-width:520px;margin:0 auto;font-family:'Microsoft YaHei',Arial,sans-serif;color:#333;">
    <div style="background:#1d4ed8;border-radius:12px 12px 0 0;padding:24px;text-align:center;">
        <h2 style="color:#fff;margin:0;font-size:20px;">${fromName} · 个人所得税预算规划工具</h2>
    </div>
    <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:28px 32px;">
        <p style="margin:0 0 12px;">你好！</p>
        <p style="margin:0 0 20px;">你正在注册 <strong>${fromName}</strong> 账号，本次验证码为：</p>
        <div style="background:#f3f4f6;border-radius:8px;padding:16px;text-align:center;font-size:32px;font-weight:bold;letter-spacing:8px;color:#1d4ed8;">
            ${code}
        </div>
        <p style="margin:20px 0 8px;color:#6b7280;font-size:13px;">
            验证码 <strong>${expireMinutes} 分钟内有效</strong>，请尽快完成注册。
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
