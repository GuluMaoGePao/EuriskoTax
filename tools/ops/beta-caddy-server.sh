#!/usr/bin/env bash
# 给 beta 站挂公网域名 https://beta.euriskotax.com（Caddy 自动签发证书）。
#
# 为什么必须带 Basic Auth：beta 与正式站长得几乎一样，搜索引擎一旦收录，
# 用户就会在搜索结果里点进「预发环境」并看到测试内容；canonical/script 层面的
# noindex 只能不被收录，挡不住知道地址的人。Basic Auth 才是真锁。
#
# 前置：DNS（DNSPod）里已加 `beta` 的 A 记录指向本机公网 IP。没加就跑会白等ssl
# 签发，所以脚本先自查解析、不过就停下来告诉你差什么。
#
# 用法（在服务器上）：
#   bash beta-caddy-server.sh <用户名> <密码>
#   BETA_AUTH_PASS=xxx bash beta-caddy-server.sh <用户名>        # 密码不进 shell 历史
# 幂等：已存在该 site block 会先整块移除再重写。

set -euo pipefail

DOMAIN="${DOMAIN:-beta.euriskotax.com}"
UPSTREAM_PORT="${UPSTREAM_PORT:-3001}"
CADDYFILE=/etc/caddy/Caddyfile
TS=$(date +%Y%m%d-%H%M%S)

AUTH_USER="${1:-}"
AUTH_PASS="${BETA_AUTH_PASS:-${2:-}}"
if [ -z "$AUTH_USER" ] || [ -z "$AUTH_PASS" ]; then
    echo "用法: bash beta-caddy-server.sh <用户名> <密码>"
    echo "  或: BETA_AUTH_PASS=xxx bash beta-caddy-server.sh <用户名>"
    exit 1
fi

echo "[1/5] 检查 DNS 是否已指向本机"
RESOLVED=$(getent hosts "$DOMAIN" | awk '{print $1}' | head -1 || true)
SELF_IP=$(curl -s --max-time 5 https://api.ipify.org || true)
if [ -z "$RESOLVED" ]; then
    echo "  $DOMAIN 还解析不出来。请先在 DNSPod 加 A 记录 → 本机公网 IP $SELF_IP"
    echo "  （DNS 生效通常几十秒到几分钟），生效后再重跑本脚本。"
    exit 1
fi
echo "  解析到 $RESOLVED（本机公网 IP: ${SELF_IP:-未知}）"
if [ -n "$SELF_IP" ] && [ "$RESOLVED" != "$SELF_IP" ]; then
    echo "  [WARN] 解析结果与本机公网 IP 不一致，A 记录可能还没生效或指错了机器"
    echo "         继续会签发证书失败。确认无误请加环境变量 CONFIRM_WRONG_IP=1 强制。"
    [ "${CONFIRM_WRONG_IP:-0}" = "1" ] || exit 1
fi

echo "[2/5] 生成 Basic Auth 口令摘要（只在服务器上算，明文口令不落盘）"
AUTH_HASH=$(caddy hash-password --plaintext "$AUTH_PASS")

echo "[3/5] 备份 Caddyfile → $CADDYFILE.bak.$TS"
sudo -n cp "$CADDYFILE" "$CADDYFILE.bak.$TS"

echo "[4/5] 写入 site block（已存在则先移除，保证幂等）"
sudo -n python3 - "$CADDYFILE" "$DOMAIN" "$UPSTREAM_PORT" "$AUTH_USER" "$AUTH_HASH" <<'PY'
import re, sys
path, domain, port, user, pwdhash = sys.argv[1:6]
src = open(path, encoding='utf-8').read()

# 去掉此前本脚本写入的同域名整块（含块前注释），避免重复
block_re = re.compile(
    r'\n*#>>> beta-site ' + re.escape(domain) + r'.*?#<<< beta-site ' + re.escape(domain) + r'\n?',
    re.S)
src = block_re.sub('\n', src)

block = f"""
#>>> beta-site {domain}  由 tools/ops/beta-caddy-server.sh 写入，重跑会整体替换
{domain} {{
    encode gzip
    basic_auth {{
        {user} {pwdhash}
    }}
    # 双保险：即使有人绕过了 Basic Auth（例如将来换门口），也别进搜索结果
    header X-Robots-Tag "noindex, nofollow, noarchive"
    reverse_proxy 127.0.0.1:{port}
}}
#<<< beta-site {domain}
"""
open(path, 'w', encoding='utf-8').write(src.rstrip('\n') + '\n' + block)
print('  已写入', domain, '-> 127.0.0.1:' + port)
PY

echo "[5/5] 校验并重载 Caddy"
sudo -n caddy validate --config "$CADDYFILE" --adapter caddyfile
sudo -n systemctl reload caddy
sleep 3
CODE=$(curl -s -o /dev/null -w '%{http_code}' "https://$DOMAIN/" || true)
CODE_AUTH=$(curl -s -o /dev/null -w '%{http_code}' -u "$AUTH_USER:$AUTH_PASS" "https://$DOMAIN/" || true)
echo "  匿名访问 HTTP $CODE（期望 401 —— 说明 Basic Auth 生效）"
echo "  带口令访问 HTTP $CODE_AUTH（期望 200）"

if [ "$CODE" = "401" ] && [ "$CODE_AUTH" = "200" ]; then
    echo "BETA_DOMAIN_OK: https://$DOMAIN 已可用"
else
    echo "BETA_DOMAIN_CHECK: 状态码不符合预期，请检查 'sudo systemctl status caddy' 与 'pm2 status'"
    exit 1
fi
