#!/usr/bin/env bash
# EuriskoTax beta（预发）环境初始化 —— 在服务器上执行，幂等（可重复跑）。
#
# 用法（本机 PowerShell）：
#   scp -i <key> tools/ops/beta-init-server.sh ubuntu@<host>:/tmp/beta-init-server.sh
#   ssh -i <key> ubuntu@<host> 'bash /tmp/beta-init-server.sh <beta_db_password> <jwt_secret>'
#
# 做三件事：
#   ① 建 beta 专属 PG 角色与库（与生产库 eurisko 完全隔离：beta 账号无权访问生产库，
#      这是「beta 上跑 migrate deploy / 点留资 / 兑换码」不会污染生产数据的根本保证）；
#   ② 生成 beta 的 .env.shared —— 从正式那份**在服务器内部**复制后再覆盖三项，
#      敏感值从头到尾不经过本机、也不出现在 stdout；
#   ③ 建 beta 部署目录并核对（只打印键名，值一律脱敏）。
#
# 覆盖的三项：
#   DATABASE_URL → beta 库（必须独立）
#   JWT_SECRET   → 独立随机值（否则 beta 签发的 token 能拿去正式站用）
#   SMTP_PASS    → 清空（beta 禁止向真实用户发邮件）

set -euo pipefail

# 参数可选：首次建库必须给密码，重跑（只想修正 env）可以一个参数都不带
DB_PWD="${1:-}"
JWT_SECRET="${2:-}"

DB_NAME=eurisko_beta
DB_USER=eurisko_beta
BETA_DIR=/home/ubuntu/euriskotax-beta
PROD_ENV=/home/ubuntu/euriskotax/.env.shared

echo "[1/3] 建 beta 专属 PG 角色与库"
role_exists=$(sudo -n -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'")
if [ "$role_exists" = "1" ]; then
    echo "  角色 $DB_USER 已存在，跳过"
else
    [ -n "$DB_PWD" ] || { echo "  角色不存在且未提供密码，退出"; exit 1; }
    sudo -n -u postgres psql -c "CREATE ROLE $DB_USER LOGIN PASSWORD '$DB_PWD'"
    echo "  已建角色 $DB_USER"
fi

db_exists=$(sudo -n -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'")
if [ "$db_exists" = "1" ]; then
    echo "  库 $DB_NAME 已存在，跳过"
else
    sudo -n -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER"
    echo "  已建库 $DB_NAME（owner=$DB_USER）"
fi

echo "[2/3] 生成 beta 环境变量"
mkdir -p "$BETA_DIR"
if [ -f "$BETA_DIR/.env.shared" ]; then
    echo "  $BETA_DIR/.env.shared 已存在，保留不动（避免覆盖已调好的值）"
else
    cp "$PROD_ENV" "$BETA_DIR/.env.shared"
    sed -i "s|^DATABASE_URL=.*|DATABASE_URL=postgresql://$DB_USER:$DB_PWD@127.0.0.1:5432/$DB_NAME|" "$BETA_DIR/.env.shared"
    sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|" "$BETA_DIR/.env.shared"
    if grep -q '^SMTP_PASS=' "$BETA_DIR/.env.shared"; then
        sed -i "s|^SMTP_PASS=.*|SMTP_PASS=|" "$BETA_DIR/.env.shared"
    else
        echo "SMTP_PASS=" >> "$BETA_DIR/.env.shared"
    fi
    chmod 600 "$BETA_DIR/.env.shared"
    echo "  已写入 $BETA_DIR/.env.shared（权限 600）"
fi

echo "[3/3] 校正 beta 专属项（已存在时也要跑：PORT 必须 3001、SMTP 必须关）"
# PORT 从正式那份复制过来是 3000，beta 必须换 3001 —— 否则两个 pm2 进程抢同一个端口，
# 表现为「beta 起不来」或更糟的「把正式进程挤掉」（pm2 里两个同名/同端口进程互相顶掉）。
if grep -q '^PORT=' "$BETA_DIR/.env.shared"; then
    sed -i 's|^PORT=.*|PORT=3001|' "$BETA_DIR/.env.shared"
else
    echo "PORT=3001" >> "$BETA_DIR/.env.shared"
fi
# 幂等地关掉对外发信：SMTP_PASS 留空还不够稳妥，显式关掉开关（有该键就置 false）
if grep -q '^SMTP_PASS=' "$BETA_DIR/.env.shared"; then
    sed -i 's|^SMTP_PASS=.*|SMTP_PASS=|' "$BETA_DIR/.env.shared"
fi
if grep -q '^MAIL_ENABLED=' "$BETA_DIR/.env.shared"; then
    sed -i 's|^MAIL_ENABLED=.*|MAIL_ENABLED=false|' "$BETA_DIR/.env.shared"
fi
echo "  已校正 PORT / SMTP_PASS / MAIL_ENABLED"

# beta 标记脚本（与 tools/ops/beta-mark-server.sh 同源，每次部署后由 postDeploy 调用）
# 单独成文件的原因见该文件头部注释：postDeploy 经过 SSH 传参会丢引号，写进脚本才稳。
cat > "$BETA_DIR/beta-mark.sh" <<'MARK_EOF'
#!/usr/bin/env bash
set -euo pipefail
DIR=/home/ubuntu/euriskotax-beta/current
HTML="$DIR/index.html"
if [ ! -f "$HTML" ]; then echo "BETA_MARK_FAIL: no index.html"; exit 1; fi
if grep -q '__APP_CHANNEL__' "$HTML"; then echo "channel 已标记，跳过"; else
    sed -i 's|window.__APP_VERSION__ = |window.__APP_CHANNEL__="beta"; window.__APP_VERSION__ = |' "$HTML"
    echo "已注入 channel=beta"; fi
if grep -q 'name=robots' "$HTML"; then echo "robots 已标记，跳过"; else
    sed -i 's|<head>|<head><meta name=robots content=noindex,nofollow>|' "$HTML"
    echo "已注入 robots noindex"; fi
echo "channel 命中: $(grep -c '__APP_CHANNEL__' "$HTML")  robots 命中: $(grep -c 'name=robots' "$HTML")"
echo "BETA_MARK_OK"
MARK_EOF
chmod +x "$BETA_DIR/beta-mark.sh"
echo "  已就位 $BETA_DIR/beta-mark.sh"

echo "[4/4] 核对（只列键名，值不打印）"
grep -E '^[A-Z]' "$BETA_DIR/.env.shared" | sed 's/=.*/=***/'
sudo -n -u postgres psql -tAc "SELECT datname FROM pg_database WHERE datname='$DB_NAME'"
echo "DONE: beta 环境就绪。下一步（本机）：ops-deploy-beta.ps1 -DryRun → 实发 → ops-check-beta.ps1"
