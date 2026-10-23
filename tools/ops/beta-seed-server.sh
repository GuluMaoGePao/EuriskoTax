#!/usr/bin/env bash
# 给 beta 库补种公共内容（幂等，可重复执行）。
#
# 为什么需要：beta 库是全新空库，ops-check-beta 的「内容端点 items>0」会红。
# 不补种的后果是「beta 永远差一项」，久了就会习惯性忽略那一项红灯 ——
# 而「习惯性忽略红灯」正是门禁失效的标准路径，所以宁可多一步也要补齐。
#
# 凭证取自 beta 自己的 .env.shared（服务器内部读取，不回传本机、不打印值）。
# ops-seed-prod.js 需先放到 beta 的 current/tools/ops/ 下（脚本会自己拷）。
#
# 用法（在服务器上）：bash /tmp/beta-seed-server.sh

set -euo pipefail

BETA_DIR=/home/ubuntu/euriskotax-beta
ENV_FILE="$BETA_DIR/.env.shared"
SEED_SRC=/tmp/ops-seed-prod.js

if [ ! -f "$SEED_SRC" ]; then
    echo "BETA_SEED_FAIL: 缺少 $SEED_SRC（先 scp ops-seed-prod.js 到 /tmp）"
    exit 1
fi

ADMIN_STAFF_EMAIL=$(grep '^ADMIN_STAFF_EMAIL=' "$ENV_FILE" | cut -d= -f2-)
ADMIN_STAFF_PASSWORD=$(grep '^ADMIN_STAFF_PASSWORD=' "$ENV_FILE" | cut -d= -f2-)
export ADMIN_STAFF_EMAIL ADMIN_STAFF_PASSWORD

if [ -z "$ADMIN_STAFF_EMAIL" ] || [ -z "$ADMIN_STAFF_PASSWORD" ]; then
    echo "BETA_SEED_FAIL: beta .env.shared 里没有 ADMIN_STAFF_EMAIL / ADMIN_STAFF_PASSWORD"
    exit 1
fi

# 先确保 beta 库里有这个工作人员账号：beta 是全新空库，正式库的账号不会跟过来，
# 直接 seed 会 401（实测：工作人员登录失败 ops-seed@euriskotax.com）。
# 密码/邮箱取自 beta 自己的 .env.shared，与正式保持同名同密，省得记两套。
cd "$BETA_DIR/current/server"
node scripts/staff.js create "$ADMIN_STAFF_EMAIL" "$ADMIN_STAFF_PASSWORD" ops-seed admin || echo "  （账号可能已存在，继续）"

mkdir -p "$BETA_DIR/current/tools/ops"
cp "$SEED_SRC" "$BETA_DIR/current/tools/ops/ops-seed-prod.js"

# 种子源在 current/server/data/content/ 下，脚本按 __dirname 上溯两级找它，
# 所以必须落在 current/tools/ops/ 里跑，不能放 /tmp 直接跑。
node "$BETA_DIR/current/tools/ops/ops-seed-prod.js" --base-url=http://127.0.0.1:3001
echo "BETA_SEED_DONE"
