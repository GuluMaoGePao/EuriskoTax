#!/usr/bin/env node
/**
 * 管理员账号管理（v1.145.0）
 *
 * 管理台改成「邮箱 + 密码」登录后，管理员就是数据库里 role='admin' 的 User。
 * 这个脚本是**唯一的授予入口** —— 不提供任何「前端自助注册管理员」的路径，
 * 否则任何人注册个账号就能把自己提权。
 *
 * 用法（在 server 目录下执行，或 npm run admin:user）：
 *   node scripts/admin-user.js create  <email> <password> [username]
 *   node scripts/admin-user.js promote <email>              # 已有用户提为管理员
 *   node scripts/admin-user.js demote  <email>              # 撤销管理员
 *   node scripts/admin-user.js reset-password <email> <newPassword>
 *   node scripts/admin-user.js list                         # 列出所有管理员
 *
 * 生产上执行：
 *   cd /home/ubuntu/euriskotax/current/server && node scripts/admin-user.js create you@example.com 'xxx'
 * （脚本读的是当前目录的 .env，生产环境 DATABASE_URL 指向 PostgreSQL）
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const ROUNDS = parseInt(process.env.BCRYPT_ROUNDS) || 10;
const MIN_PASSWORD_LENGTH = 12;

function usage() {
    console.log(`用法:
  node scripts/admin-user.js create  <email> <password> [username]
  node scripts/admin-user.js promote <email>
  node scripts/admin-user.js demote  <email>
  node scripts/admin-user.js reset-password <email> <newPassword>
  node scripts/admin-user.js list`);
}

async function main() {
    const [cmd, email, password, username] = process.argv.slice(2);

    if (!cmd) { usage(); process.exit(1); }

    if (cmd === 'list') {
        const admins = await prisma.user.findMany({
            where: { role: 'admin' },
            select: { id: true, email: true, username: true, created_at: true }
        });
        if (!admins.length) {
            console.log('当前没有管理员账号。用 create 或 promote 建一个。');
        } else {
            admins.forEach((a) => console.log(`#${a.id}  ${a.email}  (${a.username})  建于 ${a.created_at.toISOString()}`));
        }
        return;
    }

    if (!email) { usage(); process.exit(1); }
    const normalizedEmail = String(email).trim().toLowerCase();

    if (cmd === 'create') {
        if (!password) { usage(); process.exit(1); }
        if (String(password).length < MIN_PASSWORD_LENGTH) {
            console.error(`密码至少 ${MIN_PASSWORD_LENGTH} 位 —— 这个账号能改税率、发兑换码、看所有用户，短密码扛不住撞库。`);
            process.exit(1);
        }
        const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
        if (existing) {
            console.error(`该邮箱已是注册用户（#${existing.id}，role=${existing.role}）。`);
            console.error(`要把它变成管理员请用: node scripts/admin-user.js promote ${normalizedEmail}`);
            process.exit(1);
        }
        const passwordHash = await bcrypt.hash(String(password), ROUNDS);
        const user = await prisma.user.create({
            data: {
                email: normalizedEmail,
                username: username || normalizedEmail.split('@')[0],
                password_hash: passwordHash,
                role: 'admin'
            },
            select: { id: true, email: true, username: true, role: true }
        });
        console.log(`已创建管理员 #${user.id} ${user.email}（${user.username}）`);
        console.log('现在可以用这个邮箱 + 密码登录 https://euriskotax.com/admin.html');
        return;
    }

    if (cmd === 'promote') {
        const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
        if (!user) { console.error('没有这个邮箱的用户。'); process.exit(1); }
        if (user.role === 'admin') { console.log('该用户已经是管理员。'); return; }
        await prisma.user.update({ where: { email: normalizedEmail }, data: { role: 'admin' } });
        console.log(`#${user.id} ${user.email} 已提升为管理员。`);
        return;
    }

    if (cmd === 'demote') {
        const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
        if (!user) { console.error('没有这个邮箱的用户。'); process.exit(1); }
        if (user.role !== 'admin') { console.log('该用户不是管理员。'); return; }
        // 顺带推高登录态版本号：撤销的同时把他已签出的管理台令牌一起废掉，
        // 否则「降权」要等令牌自己过期才生效 —— 那两小时里他照样是管理员。
        await prisma.user.update({
            where: { email: normalizedEmail },
            data: { role: 'user', token_version: { increment: 1 } }
        });
        console.log(`#${user.id} ${user.email} 已撤销管理员，其现有会话同时失效。`);
        return;
    }

    if (cmd === 'reset-password') {
        if (!password) { usage(); process.exit(1); }
        if (String(password).length < MIN_PASSWORD_LENGTH) {
            console.error(`密码至少 ${MIN_PASSWORD_LENGTH} 位。`);
            process.exit(1);
        }
        const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
        if (!user) { console.error('没有这个邮箱的用户。'); process.exit(1); }
        if (await bcrypt.compare(String(password), user.password_hash)) {
            console.error('新密码不能与当前密码相同。');
            process.exit(1);
        }
        await prisma.user.update({
            where: { email: normalizedEmail },
            data: { password_hash: await bcrypt.hash(String(password), ROUNDS), token_version: { increment: 1 } }
        });
        console.log(`#${user.id} ${user.email} 密码已重置，该账号所有会话已失效。`);
        return;
    }

    usage();
    process.exit(1);
}

main()
    .catch((err) => {
        console.error('失败:', err.message);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
