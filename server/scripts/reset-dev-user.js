const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
// 本机测试账号：默认账号 / 本机覆盖文件（gitignored）统一从这里取，凭据不进版本库
const { loadDevAccount } = require('./dev-account');

const prisma = new PrismaClient();

async function resetDevUser() {
    const { email, password, username } = loadDevAccount();

    try {
        const passwordHash = await bcrypt.hash(password, 10);

        const existingUser = await prisma.user.findUnique({
            where: { email }
        });

        if (existingUser) {
            // 原地重置密码，**不删账号重建**：Calculation / Feedback 对 User 都是
            // onDelete: Cascade，删账号会连带删掉该账号名下的计算记录与反馈 ——
            // 而本机测试账号很可能就是使用者自己的账号（见 dev-account.js 的覆盖机制）
            const user = await prisma.user.update({
                where: { email },
                data: { password_hash: passwordHash }
            });
            console.log(`Dev user password reset in place (id=${user.id}, email=${user.email})`);
        } else {
            const user = await prisma.user.create({
                data: {
                    username,
                    email,
                    password_hash: passwordHash
                }
            });
            console.log('Dev user created successfully:', user);
        }

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

resetDevUser();
