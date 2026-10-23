#!/usr/bin/env bash
#
# beta（预发）测试账号：确保存在（幂等，可重复跑）
#
# 为什么需要它：beta 用的是**独立库** `eurisko_beta`，与正式库不通 —— 正式站的账号
# 在 beta 站登不进去（实测 beta 库 `User` 表 0 行，正式库 3 行）。而 beta 的
# `SMTP_PASS` 是刻意留空的（不向真实用户发测试邮件），所以「注册」这条路在 beta 上
# 也走不通：收不到邮箱验证码。结论是**要在 beta 真机验登录链路，只能在库里直接建号**，
# 这个脚本就是干这件事的。
#
# 用法（在服务器上执行，需先 scp 上去）：
#   bash beta-ensure-test-user.sh <email> <password>
#
# 幂等：账号已存在则**原地重置密码**，不删号重建 —— `Calculation` / `Feedback` 对 `User`
# 是 onDelete: Cascade，删号会连带删掉该账号名下的计算记录与反馈，等于每次建号都把
# 上次验收留下的数据清掉（与 reset-dev-user.js 同一条理由）。
#
# 目录约定（与 beta-init-server.sh 一致，别猜）：
#   /home/ubuntu/euriskotax-beta/.env.shared     ← beta 的 env（不是 .env）
#   /home/ubuntu/euriskotax-beta/current/server  ← 应用目录（node_modules 在这里）
#                                                  current 是软链，find 默认不跟随它
set -euo pipefail

EMAIL="${1:?用法: bash beta-ensure-test-user.sh <email> <password>}"
PASSWORD="${2:?用法: bash beta-ensure-test-user.sh <email> <password>}"
APP_DIR="${BETA_APP_DIR:-/home/ubuntu/euriskotax-beta}"
ENV_FILE="$APP_DIR/.env.shared"
RUN_DIR="$APP_DIR/current/server"

if [ ! -f "$ENV_FILE" ]; then
    echo "[FAIL] 找不到 $ENV_FILE —— beta 环境还没初始化？"
    exit 1
fi
if [ ! -d "$RUN_DIR/node_modules" ]; then
    echo "[FAIL] 找不到 $RUN_DIR/node_modules —— beta 还没部署过？"
    exit 1
fi

# 只提取 DATABASE_URL，不 source 整个文件：该文件里有一行中文说明不是注释行，
# source 会被 bash 当命令执行（实测报「·: command not found」）并因 set -e 中断。
DATABASE_URL="$(grep -E '^[[:space:]]*(export[[:space:]]+)?DATABASE_URL=' "$ENV_FILE" \
    | head -1 | sed -E 's/^[[:space:]]*(export[[:space:]]+)?DATABASE_URL=//' | tr -d '\r')"
if [ -z "$DATABASE_URL" ]; then
    echo "[FAIL] $ENV_FILE 里读不到 DATABASE_URL"
    exit 1
fi
export DATABASE_URL

cat > /tmp/_beta_ensure_user.js <<'JS'
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

(async () => {
    const email = process.env.BETA_TEST_EMAIL;
    const password = process.env.BETA_TEST_PASSWORD;
    const prisma = new PrismaClient();
    try {
        const hash = bcrypt.hashSync(password, 10);
        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) {
            await prisma.user.update({ where: { email }, data: { password_hash: hash } });
            console.log(`[OK] 已重置 beta 测试账号密码：${email}`);
        } else {
            await prisma.user.create({
                data: { email, username: 'beta-tester', password_hash: hash },
            });
            console.log(`[OK] 已创建 beta 测试账号：${email}`);
        }
        const total = await prisma.user.count();
        console.log(`[OK] beta 库用户总数：${total}`);
    } finally {
        await prisma.$disconnect();
    }
})();
JS

# 脚本放 /tmp、用 NODE_PATH 指到 beta 的依赖：不往 release 目录里写东西
BETA_TEST_EMAIL="$EMAIL" BETA_TEST_PASSWORD="$PASSWORD" \
    NODE_PATH="$RUN_DIR/node_modules" node /tmp/_beta_ensure_user.js
rm -f /tmp/_beta_ensure_user.js
