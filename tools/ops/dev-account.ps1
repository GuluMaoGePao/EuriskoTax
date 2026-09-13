# ==============================================================================
# 本机测试账号读取（PowerShell 侧）—— 凭据不进版本库
#
# 与 server/scripts/dev-account.js 是同一份事实的两侧实现（Node / PowerShell 各一）：
#   - 仓库里只放可用的默认账号（$script:DevAccountDefault，任何机器 clone 都能跑）
#   - 本机真实账号放仓库根目录 dev-account.local.json（已在 .gitignore）：
#       { "email": "you@example.com", "password": "your-local-password", "username": "devuser" }
#
# 用法（调用方先 dot-source 本文件，再用 Get-DevAccount 取账号）：
#   . (Join-Path $PSScriptRoot 'dev-account.ps1')
#   $dev = Get-DevAccount
#   Write-Host "$($dev.Email) / $($dev.Password)"
#
# 覆盖文件缺失 → 回落默认账号；存在但写坏了 → 抛错（不能悄悄用默认账号，
# 否则「换了账号却没生效」会被误当成链路故障）
# ==============================================================================

$script:DevAccountDefault = [pscustomobject]@{
    Email    = 'dev@example.com'
    Password = 'password'
    Username = 'devuser'
}

# 本文件在 tools/ops/ 下，仓库根 = ../..
$script:DevAccountOverridePath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\dev-account.local.json'))

function Get-DevAccount {
    <#
    .SYNOPSIS
        取本机测试账号（Email / Password / Username）
    .DESCRIPTION
        优先读仓库根的 dev-account.local.json（gitignored），没有就回落仓库默认账号。
        写坏了直接抛错，避免「以为换了账号其实没生效」。
    #>
    [CmdletBinding()]
    param()

    if (Test-Path -LiteralPath $script:DevAccountOverridePath) {
        try {
            $cfg = Get-Content -LiteralPath $script:DevAccountOverridePath -Raw -Encoding UTF8 | ConvertFrom-Json
        } catch {
            throw "本机测试账号文件解析失败：$script:DevAccountOverridePath —— $($_.Exception.Message)"
        }
        if (-not $cfg.email -or -not $cfg.password) {
            throw "本机测试账号文件缺 email / password 字段：$script:DevAccountOverridePath"
        }
        $username = $script:DevAccountDefault.Username
        if ($cfg.username) { $username = $cfg.username }
        return [pscustomobject]@{
            Email    = $cfg.email
            Password = $cfg.password
            Username = $username
        }
    }

    return $script:DevAccountDefault
}
