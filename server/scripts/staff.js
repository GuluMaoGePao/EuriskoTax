#!/usr/bin/env node
/**
 * 工作人员账号管理（v1.146.0）
 *
 * 管理台登录的是**工作人员**（AdminUser 表），与客户（User 表）完全分开。
 * 本脚本是**创建第一个工作人员**的唯一入口 —— 不提供任何自助注册路径，
 * 否则任何人注册个账号就能把自己变成工作人员。
 *
 * 用法（在 server 目录下执行）：
 *   node scripts/staff.js create <email> <password> [username] [owner|admin|support]
 *   node scripts/staff.js list
 *   node scripts/staff.js set-role <email> <owner|admin|support>
 *   node scripts/staff.js disable <email>
 *   node scripts/staff.js enable <email>
 *   node scripts/staff.js reset-password <email> <newPassword>
 *   node scripts/staff.js migrate-from-user <email> [owner|admin|support]
 *
 * `migrate-from-user` 用于 v1.145.0 升级：那个版本把管理员做成了 User.role='admin'，
 * 本脚本按原哈希迁到 AdminUser（**密码不变**），然后把那条 User 删掉 —— 否则它会
 * 作为一个「假客户」留在客户列表里，还能登录网站前台。
 *
 * 生产上执行：
 *   cd /home/ubuntu/euriskotax/current/server && node scripts/staff.js create you@example.com 'xxx' '' owner
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const ROUNDS = parseInt(process.env.BCRYPT_ROUNDS) || 10;
const MIN_PASSWORD_LENGTH = 12;
const ROLES = ['owner', 'admin', 'support'];

function usage() {
    console.log(`用法:
  node scripts/staff.js create <email> <password> [username] [owner|admin|support]
  node scripts/staff.js list
  node scripts/staff.js set-role <email> <owner|admin|support>
  node scripts/staff.js disable <email>
  node scripts/staff.js enable <email>
  node scripts/staff.js reset-password <email> <newPassword>
  node scripts/staff.js migrate-from-user <email> [owner|admin|support]`);
}

const norm = (e) => String(e || '').trim().toLowerCase();

async function main() {
    const [cmd, email, password, username, roleArg] = process.argv.slice(2);
    if (!cmd) { usage(); process.exit(1); }

    if (cmd === 'list') {
        const items = await prisma.adminUser.findMany({
            select: { id: true, email: true, username: true, role: true, status: true, last_login_at: true, created_at: true },
            orderBy: { created_at: 'asc' }
        });
        if (!items.length) {
            console.log('还没有工作人员账号。用 create 建第一个（建议角色 owner）。');
        } else {
            items.forEach((a) => console.log(
                `#${a.id}  ${a.email}  (${a.username})  role=${a.role}  status=${a.status}  最后登录=${a.last_login_at ? a.last_login_at.toISOString() : '从未'}`
            ));
        }
        return;
    }

    if (!email) { usage(); process.exit(1); }
    const target = norm(email);

    if (cmd === 'create') {
        if (!password) { usage(); process.exit(1); }
        if (String(password).length < MIN_PASSWORD_LENGTH) {
            console.error(`密码至少 ${MIN_PASSWORD_LENGTH} 位 —— 这个账号能碰客户数据与站点配置，短密码扛不住撞库。`);
            process.exit(1);
        }
        const role = ROLES.includes(roleArg) ? roleArg : 'support';
        if (await prisma.adminUser.findUnique({ where: { email: target } })) {
            console.error('该邮箱已是工作人员。要改角色用 set-role。');
            process.exit(1);
        }
        const created = await prisma.adminUser.create({
            data: {
                email: target,
                username: username || target.split('@')[0],
                password_hash: await bcrypt.hash(String(password), ROUNDS),
                role
            },
            select: { id: true, email: true, role: true }
        });
        console.log(`已创建工作人员 #${created.id} ${created.email} role=${created.role}`);
        console.log('现在可以用这个邮箱 + 密码登录 https://euriskotax.com/admin.html');
        return;
    }

    if (cmd === 'migrate-from-user') {
        const role = ROLES.includes(roleArg) ? roleArg : 'owner';
        const user = await prisma.user.findUnique({ where: { email: target } });
        if (!user) { console.error('客户表里没有这个邮箱，无需迁移。'); process.exit(1); }
        if (await prisma.adminUser.findUnique({ where: { email: target } })) {
            console.error('该邮箱已是工作人员，无需迁移。');
            process.exit(1);
        }
        const [calcs, feedbacks, leads] = await Promise.all([
            prisma.calculation.count({ where: { user_id: user.id } }),
            prisma.feedback.count({ where: { user_id: user.id } }),
            prisma.lead.count({ where: { user_id: user.id } })
        ]);
        if (calcs + feedbacks + leads > 0) {
            console.error(`这条客户记录名下还有数据（计算 ${calcs} / 反馈 ${feedbacks} / 线索 ${leads}），不能删。
请先确认它是不是真有客户数据 —— 是的话改用别的邮箱建工作人员，别删这条。`);
            process.exit(1);
        }
        // 直接搬哈希，密码保持不变 —— 迁移不该让人被迫改密码
        const created = await prisma.adminUser.create({
            data: {
                email: user.email,
                username: user.username,
                password_hash: user.password_hash,
                role
            },
            select: { id: true, email: true, role: true }
        });
        await prisma.user.delete({ where: { id: user.id } });
        console.log(`已迁移为工作人员 #${created.id} ${created.email} role=${created.role}（密码不变），原客户记录 #${user.id} 已删除。`);
        return;
    }

    const staff = await prisma.adminUser.findUnique({ where: { email: target } });
    if (!staff) { console.error('没有这个邮箱的工作人员。'); process.exit(1); }

    if (cmd === 'set-role') {
        if (!ROLES.includes(roleArg)) { console.error(`角色只能是 ${ROLES.join(' / ')}`); process.exit(1); }
        if (staff.role === 'owner' && roleArg !== 'owner') {
            const owners = await prisma.adminUser.count({ where: { role: 'owner', status: 'active' } });
            if (owners <= 1) { console.error('至少要保留一名所有者。'); process.exit(1); }
        }
        await prisma.adminUser.update({
            where: { email: target },
            data: { role: roleArg, token_version: { increment: 1 } }
        });
        console.log(`${staff.email} 角色改为 ${roleArg}，其现有会话已失效。`);
        return;
    }

    if (cmd === 'disable' || cmd === 'enable') {
        const status = cmd === 'disable' ? 'disabled' : 'active';
        if (cmd === 'disable' && staff.role === 'owner') {
            const owners = await prisma.adminUser.count({ where: { role: 'owner', status: 'active' } });
            if (owners <= 1) { console.error('至少要保留一名可用所有者。'); process.exit(1); }
        }
        await prisma.adminUser.update({
            where: { email: target },
            data: { status, token_version: { increment: 1 } }
        });
        console.log(`${staff.email} 已${status === 'disabled' ? '禁用' : '启用'}，其现有会话已失效。`);
        return;
    }

    if (cmd === 'reset-password') {
        if (!password) { usage(); process.exit(1); }
        if (String(password).length < MIN_PASSWORD_LENGTH) {
            console.error(`密码至少 ${MIN_PASSWORD_LENGTH} 位。`);
            process.exit(1);
        }
        if (await bcrypt.compare(String(password), staff.password_hash)) {
            console.error('新密码不能与当前密码相同。');
            process.exit(1);
        }
        await prisma.adminUser.update({
            where: { email: target },
            data: { password_hash: await bcrypt.hash(String(password), ROUNDS), token_version: { increment: 1 } }
        });
        console.log(`${staff.email} 密码已重置，该账号所有会话已失效。`);
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
