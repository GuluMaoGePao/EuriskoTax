// 邀请码生成脚本（一机一码）：node scripts/generate-invite-codes.js [数量]
// 生成 EURISKO-XXXX-XXXX 格式（排除易混淆字符 0/O/1/I/L/U/V），直接写入数据库
require('dotenv').config();
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// 字符集排除易混淆：0/O、1/I/L、U/V
const CHARSET = 'ABCDEFGHJKMNPQRSTWXYZ23456789';

function generateCode() {
    const bytes = crypto.randomBytes(8);
    const pick = (offset) => Array.from({ length: 4 }, (_, i) => CHARSET[bytes[offset * 4 + i] % CHARSET.length]).join('');
    return `EURISKO-${pick(0)}-${pick(1)}`;
}

async function main() {
    const count = parseInt(process.argv[2]) || 10;
    if (count < 1 || count > 100) {
        console.error('数量需在 1-100 之间');
        process.exit(1);
    }

    const created = [];
    for (let i = 0; i < count; i++) {
        // 碰撞重试：unique 冲突时重新生成
        for (let retry = 0; retry < 5; retry++) {
            try {
                const code = generateCode();
                await prisma.inviteCode.create({ data: { code } });
                created.push(code);
                break;
            } catch (err) {
                if (err.code !== 'P2002') throw err;
            }
        }
    }

    console.log(`\n已生成 ${created.length} 个邀请码（一机一码，每个仅可用一次）：\n`);
    created.forEach((code, idx) => console.log(`  ${idx + 1}. ${code}`));
    console.log('\n已写入数据库 InviteCode 表，请妥善保管，勿提交到代码仓库。\n');
}

main()
    .catch((err) => {
        console.error('生成失败:', err.message);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
