# EuriskoTax beta（预发）线上核对薄封装
#
# 用法：
#   .\ops-check-beta.ps1                                  # 核对 https://beta.euriskotax.com
#   .\ops-check-beta.ps1 -BaseUrl http://<IP>:3001        # Caddy/域名还没配好时，直连进程端口
#
# 复用正式站的同一套 37 项指纹（ops-check-prod.ps1 -BaseUrl），
# 好处是「beta 全绿」与「生产全绿」是同一把尺子 —— 不会出现 beta 用宽松标准蒙混过关。

param(
    [string]$BaseUrl = "https://beta.euriskotax.com",
    # beta 站有 Basic Auth，公网核对必须带凭据；
    # 走 SSH 隧道（-BaseUrl http://127.0.0.1:3001）时绕过 Caddy，不需要凭据。
    [string]$AuthUser = $env:BETA_AUTH_USER,
    [string]$AuthPass = $env:BETA_AUTH_PASS
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$check = Join-Path $ScriptDir "ops-check-prod.ps1"

& $check -BaseUrl $BaseUrl -AuthUser $AuthUser -AuthPass $AuthPass
exit $LASTEXITCODE
