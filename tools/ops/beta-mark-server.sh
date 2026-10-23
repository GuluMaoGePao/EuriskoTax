#!/usr/bin/env bash
# 给 beta 站打两个标记（幂等，可重复执行）：
#   ① channel=beta —— 前端据此显示「预发环境 · 数据非生产」角标
#      （src/js/utils/feature-flags.js 读 window.__APP_CHANNEL__，正式站读不到就是正式站）；
#   ② robots noindex —— beta 与正式站长得几乎一样，万一被抓到也别进搜索结果
#      （真正的防收录还要靠 Caddy 的 Basic Auth，这里只是多一层）。
#
# 为什么单独成一个脚本：部署脚本的 postDeploy 是「一串经 SSH 传过去的命令」，
# 而 PowerShell 5.1 往 ssh 传参时会吃掉双引号，导致 sed 表达式里的 `<` 被远端 bash
# 当成重定向（实测报 syntax error near unexpected token `<`）。
# 把逻辑落到脚本文件里、postDeploy 只负责 `bash <这个脚本>`，就没有引号传递问题。
#
# 用法：bash /home/ubuntu/euriskotax-beta/beta-mark.sh
# 由 beta-init-server.sh 负责放到位；ops-deploy.ps1 的 beta 配置每次部署后会调一次。

set -euo pipefail

DIR=/home/ubuntu/euriskotax-beta/current
HTML="$DIR/index.html"

if [ ! -f "$HTML" ]; then
    echo "BETA_MARK_FAIL: index.html not found at $HTML"
    exit 1
fi

if grep -q '__APP_CHANNEL__' "$HTML"; then
    echo "channel 已标记，跳过"
else
    sed -i 's|window.__APP_VERSION__ = |window.__APP_CHANNEL__="beta"; window.__APP_VERSION__ = |' "$HTML"
    echo "已注入 channel=beta"
fi

if grep -q 'name=robots' "$HTML"; then
    echo "robots 已标记，跳过"
else
    sed -i 's|<head>|<head><meta name=robots content=noindex,nofollow>|' "$HTML"
    echo "已注入 robots noindex"
fi

echo "channel 命中行数: $(grep -c '__APP_CHANNEL__' "$HTML")"
echo "robots 命中行数: $(grep -c 'name=robots' "$HTML")"
echo "BETA_MARK_OK"
