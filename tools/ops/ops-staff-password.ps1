<#
.SYNOPSIS
    重置生产「工作人员」（管理台）账号密码 —— 应急通道。
.DESCRIPTION
    管理台改成「工作人员账号 + 密码」登录之后，改密码这件事本身也要先登录 ——
    于是 owner 一旦忘了密码就登不进去，也就改不了自己。唯一的路是在服务器上
    跑 `node scripts/staff.js reset-password`。本脚本就是把这条路做成入口。

    它 SSH 到生产服务器执行该命令，**新密码经 stdin 管道传给远程进程**，
    不拼进命令行：命令行参数在同机任何人 ps 一下、或翻一下 shell history
    就能拿到明文。改密码值得多绕这一步。

    日常改密码请到管理台「工作人员」Tab（需 owner 登录），不必走这里。

.PARAMETER Email
    要重置的工作人员邮箱。会做格式校验（它要拼进远程命令，不能放任意字符串进去）。
.PARAMETER List
    只列出生产工作人员账号，不改任何东西。重置前先用它确认邮箱写对了。

.用法
    .\ops-staff-password.ps1 -List
    .\ops-staff-password.ps1 -Email you@example.com          # 会交互询问新密码
    $env:EURISKO_STAFF_PWD = 'xxx'; .\ops-staff-password.ps1 -Email you@example.com
#>
param(
    [string]$Email,
    [switch]$List
)

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

function Write-Step {
    param([string]$Level, [string]$Message)
    $mark = switch ($Level) { 'OK' { '✅' } 'ERR' { '❌' } 'WARN' { '⚠️' } default { 'ℹ️' } }
    Write-Host "$mark $Message"
}

# ---- 服务器地址复用部署配置，不另外维护一份 ----
$cfgPath = Join-Path $ScriptDir 'deploy.config.json'
if (-not (Test-Path $cfgPath)) {
    Write-Step 'ERR' "找不到部署配置：$cfgPath（从 ops-deploy.config.example.json 复制一份并填好服务器信息）"
    exit 1
}
$cfg = Get-Content $cfgPath -Raw -Encoding UTF8 | ConvertFrom-Json
$srv = $cfg.server
$remotePath = $cfg.deploy.remotePath
$sshTarget = "$($srv.user)@$($srv.host)"
$portArg = if ($srv.port -ne 22) { "-p $($srv.port)" } else { '' }
$sshOptions = @('-o', 'StrictHostKeyChecking=accept-new', '-o', 'ConnectTimeout=15')
if ($srv.authMethod -eq 'key' -and $srv.privateKeyPath) {
    $sshOptions += @('-i', ($srv.privateKeyPath -replace '^~', $env:USERPROFILE))
}

function Invoke-Remote {
    param([string]$RemoteCommand, [string]$StdinText)
    # 管道传给 ssh 的字节编码：不设的话 PowerShell 5.1 默认按 ASCII 走，
    # 密码里一旦有非 ASCII 字符就会被替换成问号，改完登不进去还查不出原因
    $OutputEncoding = [System.Text.Encoding]::UTF8
    $allArgs = @()
    if ($portArg) { $allArgs += $portArg.Split(' ') }
    $allArgs += $sshOptions
    $allArgs += @($sshTarget, $RemoteCommand)
    $allArgs = $allArgs | Where-Object { $_ -ne '' }
    if ($null -ne $StdinText -and $StdinText -ne '') {
        # 密码走 stdin，不进命令行
        return ($StdinText | & ssh @allArgs 2>&1)
    }
    return (& ssh @allArgs 2>&1)
}

if ($List) {
    Write-Step 'INFO' "查询生产工作人员（$sshTarget）…"
    Invoke-Remote -RemoteCommand "cd $remotePath/current/server && node scripts/staff.js list" |
        ForEach-Object { Write-Host "   $_" }
    exit $LASTEXITCODE
}

if (-not $Email) {
    Write-Step 'ERR' '请用 -Email 指定账号，或先跑 -List 看有哪些工作人员'
    exit 1
}
# 邮箱要拼进远程命令，先卡格式 —— 否则一个分号就能带进任意命令
if ($Email -notmatch '^[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}$') {
    Write-Step 'ERR' "邮箱格式不对：$Email"
    exit 1
}

# 新密码来源：环境变量（GUI 调用时不进命令行、不进日志）> 交互输入
$plain = $env:EURISKO_STAFF_PWD
if ([string]::IsNullOrWhiteSpace($plain)) {
    $secure = Read-Host "为 $Email 设置新密码（至少 12 位，输入不回显）" -AsSecureString
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
}
if ([string]::IsNullOrWhiteSpace($plain)) { Write-Step 'ERR' '密码不能为空'; exit 1 }
if ($plain.Length -lt 12) { Write-Step 'ERR' '密码至少 12 位'; exit 1 }

Write-Step 'INFO' "重置 $Email 的管理台密码…"
Invoke-Remote -RemoteCommand "cd $remotePath/current/server && node scripts/staff.js reset-password '$Email'" -StdinText $plain |
    ForEach-Object { Write-Host "   $_" }

if ($LASTEXITCODE -eq 0) {
    Write-Step 'OK' "已重置。$Email 现有所有登录会话立即失效，请用新密码重新登录管理台。"
    Write-Step 'WARN' '这串密码只在你本机这一刻出现过，请自行存进密码管理器。'
} else {
    Write-Step 'ERR' "失败（exit=$LASTEXITCODE）。常见原因：邮箱不存在，或新密码与当前密码相同。"
}
exit $LASTEXITCODE
