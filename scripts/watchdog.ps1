# EuriskoTax Service Watchdog (PowerShell)
# Monitors backend server on port 3000 and (optionally) cpolar tunnel.
# Auto-restarts processes when they crash or stop responding.
# Records detailed events to events.log and sends email notifications.
#
# Usage:
#   .\watchdog.ps1                     # Monitor local :3000 only
#   .\watchdog.ps1 -Share              # Monitor + cpolar public tunnel
#   .\watchdog.ps1 -IntervalSec 30     # Custom check interval (default 20s)
#   .\watchdog.ps1 -MaxRestarts 10     # Max restarts before giving up (0 = unlimited)
#   Press Ctrl+C to stop the watchdog.

param(
    [switch]$Share,
    [int]$IntervalSec = 20,
    [int]$MaxRestarts = 0
)

$ErrorActionPreference = "Continue"
# 脚本位于 scripts/ 子目录，项目根目录为上一级
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$ServerDir = Join-Path $ProjectRoot "server"
$CpolarExe = Join-Path $ProjectRoot "cpolar\cpolar.exe"
$CpolarLog = Join-Path $env:TEMP "cpolar-euriskotax-watchdog.log"
$WatchdogLog = Join-Path $ScriptDir "watchdog.log"
$EventLog = Join-Path $ScriptDir "events.log"
$NotifyModule = Join-Path $ScriptDir "notify.ps1"
$LastCpolarUrl = ""
$RestartCount = 0
$global:WatchdogRunning = $true

# ====== Load notification module ======
if (Test-Path $NotifyModule) {
    . $NotifyModule
    $NotifyAvailable = $true
} else {
    $NotifyAvailable = $false
}

# ====== Logger ======
function Write-Log {
    param([string]$Level, [string]$Msg)
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$ts] [$Level] $Msg"
    switch ($Level) {
        "INFO"  { Write-Host $line -ForegroundColor Cyan }
        "OK"    { Write-Host $line -ForegroundColor Green }
        "WARN"  { Write-Host $line -ForegroundColor Yellow }
        "ERROR" { Write-Host $line -ForegroundColor Red }
        default { Write-Host $line }
    }
    Add-Content -Path $WatchdogLog -Value $line -ErrorAction SilentlyContinue
}

# ====== Event logger (writes to events.log with structured fields) ======
function Write-EventLog {
    param(
        [Parameter(Mandatory=$true)]
        [string]$EventType,    # BACKEND_RESTART | CPOLAR_RESTART | URL_CHANGED | RESTART_FAILED
        [Parameter(Mandatory=$true)]
        [string]$Reason,
        [string]$Details = "",
        [int]$RecoveryMs = 0,
        [string]$NewUrl = "",
        [string]$OldUrl = ""
    )
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $fields = @("event=$EventType", "reason=$Reason")
    if ($RecoveryMs -gt 0) { $fields += "recovery_ms=$RecoveryMs" }
    if ($NewUrl) { $fields += "new_url=$NewUrl" }
    if ($OldUrl) { $fields += "old_url=$OldUrl" }
    if ($Details) { $fields += "details=$Details" }
    $line = "[$ts] [$EventType] " + ($fields -join " | ")
    Add-Content -Path $EventLog -Value $line -ErrorAction SilentlyContinue
    Write-Host "[EVENT] $line" -ForegroundColor Magenta
}

# ====== Notify helper (email + console, uses Chinese templates) ======
function Invoke-Notification {
    param(
        [string]$EventType,
        [hashtable]$TemplateData
    )
    if ($NotifyAvailable) {
        $sent = Send-WatchdogNotification -EventType $EventType -TemplateData $TemplateData
        if (-not $sent) {
            Write-Log "WARN" "Email not sent (config disabled or SMTP issue). Event still logged to events.log"
        }
    } else {
        Write-Log "WARN" "notify.ps1 not found, skip email. Event still logged to events.log"
    }
}

# ====== Server health check (port 3000 listening + HTTP 200/401 response) ======
function Test-ServerHealth {
    try {
        $conn = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
        if (-not $conn) { return $false }
        $resp = Invoke-WebRequest -Uri "http://127.0.0.1:3000/api/auth/profile" `
            -Method GET -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
        return $true
    } catch {
        if ($_.Exception.Response -and $_.Exception.Response.StatusCode.value__ -eq 401) {
            return $true
        }
        return $false
    }
}

# ====== Diagnose backend failure reason ======
function Get-BackendFailureReason {
    $conn = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
    if (-not $conn) { return "port_3000_not_listening" }
    try {
        $resp = Invoke-WebRequest -Uri "http://127.0.0.1:3000/api/auth/profile" `
            -Method GET -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
        return "http_unexpected_status_" + $resp.StatusCode
    } catch {
        if ($_.Exception.Response) {
            $code = $_.Exception.Response.StatusCode.value__
            if ($code -eq 401) { return "false_positive_ok" }
            return "http_error_$code"
        }
        $msg = $_.Exception.Message
        if ($msg -match "timed out" -or $msg -match "Unable to connect") {
            return "connection_refused_or_timeout"
        }
        return "http_exception"
    }
}

# ====== Restart backend server ======
function Restart-ServerService {
    Write-Log "WARN" "Backend service down, diagnosing..."
    $reason = Get-BackendFailureReason
    Write-Log "WARN" "Backend failure reason: $reason"

    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        # Kill processes holding port 3000
        $oldConns = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
        if ($oldConns) {
            $oldPids = $oldConns.OwningProcess | Sort-Object -Unique
            foreach ($p in $oldPids) {
                Get-Process -Id $p -ErrorAction SilentlyContinue |
                    Stop-Process -Force -ErrorAction SilentlyContinue
            }
            Start-Sleep -Seconds 2
        }
        $stdoutLog = Join-Path $env:TEMP "eurisko-server-watchdog.log"
        $stderrLog = Join-Path $env:TEMP "eurisko-server-watchdog.err"
        $proc = Start-Process -FilePath "node" `
            -ArgumentList "src/app.js" `
            -WorkingDirectory $ServerDir `
            -WindowStyle Hidden `
            -RedirectStandardOutput $stdoutLog `
            -RedirectStandardError $stderrLog `
            -PassThru
        # Wait up to 30 seconds for service to become ready
        $ready = $false
        for ($i = 0; $i -lt 15; $i++) {
            Start-Sleep -Seconds 2
            if (Test-ServerHealth) {
                $ready = $true
                break
            }
        }
        $sw.Stop()
        $recoveryMs = [int]$sw.ElapsedMilliseconds

        if ($ready) {
            Write-Log "OK" ("Backend restarted OK (PID: " + $proc.Id + ") in ${recoveryMs}ms")
            Write-EventLog -EventType "BACKEND_RESTART" -Reason $reason -RecoveryMs $recoveryMs -Details ("new_pid=" + $proc.Id)
            $tplData = @{ reason=$reason; recoveryMs=$recoveryMs; newPid=$proc.Id; timestamp=(Get-Date -Format "yyyy-MM-dd HH:mm:ss"); logPath=$stdoutLog }
            Invoke-Notification -EventType "BACKEND_RESTART" -TemplateData $tplData
            return $true
        } else {
            $sw.Stop()
            $recoveryMs = [int]$sw.ElapsedMilliseconds
            Write-Log "ERROR" "Backend restart timed out (not ready in 30s)"
            Write-EventLog -EventType "RESTART_FAILED" -Reason "backend_timeout_30s" -RecoveryMs $recoveryMs -Details ("attempted_pid=" + $proc.Id)
            $tplData = @{ target="backend"; reason=$reason; restartCount=$RestartCount; details=("timeout 30s, attempted_pid=" + $proc.Id); timestamp=(Get-Date -Format "yyyy-MM-dd HH:mm:ss"); logPath=$stdoutLog; cpolarLogPath=$CpolarLog }
            Invoke-Notification -EventType "RESTART_FAILED" -TemplateData $tplData
            return $false
        }
    } catch {
        $sw.Stop()
        $recoveryMs = [int]$sw.ElapsedMilliseconds
        Write-Log "ERROR" ("Backend restart failed: " + $_)
        Write-EventLog -EventType "RESTART_FAILED" -Reason "backend_exception" -RecoveryMs $recoveryMs -Details $_.Exception.Message
        $tplData = @{ target="backend"; reason=$reason; restartCount=$RestartCount; details=$_.Exception.Message; timestamp=(Get-Date -Format "yyyy-MM-dd HH:mm:ss"); logPath=$stdoutLog; cpolarLogPath=$CpolarLog }
        Invoke-Notification -EventType "RESTART_FAILED" -TemplateData $tplData
        return $false
    }
}

# ====== Get cpolar public url (API first, log fallback) ======
function Get-CpolarUrl {
    param([string]$LogPath)

    # 1) Try cpolar local dashboard API (works regardless of how cpolar was started)
    try {
        $resp = Invoke-WebRequest -Uri "http://127.0.0.1:4040" -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
        if ($resp.Content -match 'https://[a-z0-9]+\.r8\.cpolar\.cn') { return $matches[0] }
        if ($resp.Content -match 'https://[a-z0-9]+\.cpolar\.[a-z]+') { return $matches[0] }
    } catch { }

    # 2) Fallback: parse from log file
    if ($LogPath -and (Test-Path $LogPath)) {
        $content = Get-Content $LogPath -Raw -ErrorAction SilentlyContinue
        if ($content) {
            $pattern = 'Tunnel established at (https://[^\s"]+)'
            $m = [regex]::Match($content, $pattern)
            if ($m.Success) { return $m.Groups[1].Value }
            $pattern = 'Tunnel established at (http://[^\s"]+)'
            $m = [regex]::Match($content, $pattern)
            if ($m.Success) { return $m.Groups[1].Value }
        }
    }

    return $null
}

# ====== Diagnose cpolar failure reason ======
function Get-CpolarFailureReason {
    param([string]$ExpectedUrl)
    $proc = Get-Process -Name "cpolar" -ErrorAction SilentlyContinue
    if (-not $proc) { return "cpolar_process_dead" }
    if ($ExpectedUrl) {
        try {
            $resp = Invoke-WebRequest -Uri ($ExpectedUrl + "/api/auth/profile") `
                -Method GET -TimeoutSec 10 -UseBasicParsing -ErrorAction Stop
            return "false_positive_ok"
        } catch {
            if ($_.Exception.Response) {
                $code = $_.Exception.Response.StatusCode.value__
                if ($code -eq 401) { return "false_positive_ok" }
                return "public_url_http_$code"
            }
            $msg = $_.Exception.Message
            if ($msg -match "timed out") { return "public_url_timeout" }
            if ($msg -match "Unable to connect") { return "public_url_unreachable" }
            return "public_url_error"
        }
    }
    return "no_url_and_process_alive"
}

# ====== Cpolar health check (process alive + public URL reachable) ======
# Note: If old URL is unreachable but process is alive, check if URL changed
# (cpolar auto-reconnect assigns new URL). Returns true to avoid unnecessary restart.
function Test-CpolarHealth {
    param([string]$ExpectedUrl)
    $proc = Get-Process -Name "cpolar" -ErrorAction SilentlyContinue
    if (-not $proc) { return $false }
    if ($ExpectedUrl) {
        try {
            $resp = Invoke-WebRequest -Uri ($ExpectedUrl + "/api/auth/profile") `
                -Method GET -TimeoutSec 10 -UseBasicParsing -ErrorAction Stop
            return $true
        } catch {
            if ($_.Exception.Response -and $_.Exception.Response.StatusCode.value__ -eq 401) {
                return $true
            }
            # Old URL unreachable, but process is alive - check if URL changed via dashboard
            $freshUrl = Get-CpolarUrl -LogPath $CpolarLog
            if ($freshUrl -and $freshUrl -ne $ExpectedUrl) {
                Write-Log "INFO" "cpolar URL changed (old unreachable, new detected): $ExpectedUrl -> $freshUrl"
                return $true  # Process healthy, just URL changed (no restart needed)
            }
            return $false
        }
    }
    return $true
}

# ====== Restart cpolar tunnel ======
function Restart-CpolarTunnel {
    Write-Log "WARN" "cpolar tunnel down, diagnosing..."
    $reason = Get-CpolarFailureReason -ExpectedUrl $LastCpolarUrl
    Write-Log "WARN" "cpolar failure reason: $reason"
    $oldUrl = $LastCpolarUrl

    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        Get-Process -Name "cpolar" -ErrorAction SilentlyContinue |
            Stop-Process -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
        if (Test-Path $CpolarLog) {
            Remove-Item $CpolarLog -Force -ErrorAction SilentlyContinue
        }
        if (-not (Test-Path $CpolarExe)) {
            Write-Log "ERROR" ("cpolar.exe not found: " + $CpolarExe)
            Write-EventLog -EventType "RESTART_FAILED" -Reason "cpolar_exe_not_found" -Details $CpolarExe
            $tplData = @{ target="cpolar"; reason="cpolar_exe_not_found"; restartCount=$RestartCount; details=$CpolarExe; timestamp=(Get-Date -Format "yyyy-MM-dd HH:mm:ss"); logPath=$stdoutLog; cpolarLogPath=$CpolarLog }
            Invoke-Notification -EventType "RESTART_FAILED" -TemplateData $tplData
            return $false
        }
        # Use pre-configured tunnel "eurisko" in cpolar.yml (region=cn, port 3000)
        $cpolarErrLog = Join-Path $env:TEMP "cpolar-euriskotax-watchdog.err"
        $proc = Start-Process -FilePath $CpolarExe `
            -ArgumentList @("start", "eurisko", "-log=stdout") `
            -WindowStyle Hidden `
            -RedirectStandardOutput $CpolarLog `
            -RedirectStandardError $cpolarErrLog `
            -PassThru
        # Wait up to 30s for tunnel establishment
        $newUrl = $null
        for ($i = 0; $i -lt 15; $i++) {
            Start-Sleep -Seconds 2
            $newUrl = Get-CpolarUrl -LogPath $CpolarLog
            if ($newUrl) { break }
        }
        $sw.Stop()
        $recoveryMs = [int]$sw.ElapsedMilliseconds

        if ($newUrl) {
            $script:LastCpolarUrl = $newUrl
            Write-Log "OK" ("cpolar restart OK: " + $newUrl + " in ${recoveryMs}ms")
            Write-EventLog -EventType "CPOLAR_RESTART" -Reason $reason -RecoveryMs $recoveryMs -NewUrl $newUrl -OldUrl $oldUrl
            $ts = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
            # If URL changed, also fire URL_CHANGED event + notification
            if ($oldUrl -and $newUrl -ne $oldUrl) {
                Write-EventLog -EventType "URL_CHANGED" -Reason "cpolar_restart_new_url" -NewUrl $newUrl -OldUrl $oldUrl
                $tplData = @{ oldUrl=$oldUrl; newUrl=$newUrl; reason="cpolar_restart_new_url"; recoveryMs=$recoveryMs; timestamp=$ts }
                Invoke-Notification -EventType "URL_CHANGED" -TemplateData $tplData
            } else {
                $tplData = @{ reason=$reason; recoveryMs=$recoveryMs; newUrl=$newUrl; timestamp=$ts }
                Invoke-Notification -EventType "CPOLAR_RESTART" -TemplateData $tplData
            }
            return $true
        } else {
            $sw.Stop()
            $recoveryMs = [int]$sw.ElapsedMilliseconds
            Write-Log "WARN" "cpolar process started but no tunnel URL within 30s"
            Write-EventLog -EventType "RESTART_FAILED" -Reason "cpolar_url_timeout_30s" -RecoveryMs $recoveryMs -Details ("process_pid=" + $proc.Id)
            $tplData = @{ target="cpolar"; reason=$reason; restartCount=$RestartCount; details=("timeout 30s, process_pid=" + $proc.Id); timestamp=(Get-Date -Format "yyyy-MM-dd HH:mm:ss"); logPath=$stdoutLog; cpolarLogPath=$CpolarLog }
            Invoke-Notification -EventType "RESTART_FAILED" -TemplateData $tplData
            return $true
        }
    } catch {
        $sw.Stop()
        $recoveryMs = [int]$sw.ElapsedMilliseconds
        Write-Log "ERROR" ("cpolar restart failed: " + $_)
        Write-EventLog -EventType "RESTART_FAILED" -Reason "cpolar_exception" -RecoveryMs $recoveryMs -Details $_.Exception.Message
        $tplData = @{ target="cpolar"; reason=$reason; restartCount=$RestartCount; details=$_.Exception.Message; timestamp=(Get-Date -Format "yyyy-MM-dd HH:mm:ss"); logPath=$stdoutLog; cpolarLogPath=$CpolarLog }
        Invoke-Notification -EventType "RESTART_FAILED" -TemplateData $tplData
        return $false
    }
}

# ====== Banner ======
Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  EuriskoTax Service Watchdog" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ("  Interval:     " + $IntervalSec + "s") -ForegroundColor Gray
Write-Host "  Targets:      Backend (:3000)" -ForegroundColor Gray
if ($Share) { Write-Host "                + cpolar tunnel" -ForegroundColor Gray }
$limitText = if ($MaxRestarts -eq 0) { "unlimited" } else { $MaxRestarts.ToString() }
Write-Host ("  Max restarts: " + $limitText) -ForegroundColor Gray
Write-Host ("  Watchdog log: " + $WatchdogLog) -ForegroundColor Gray
Write-Host ("  Event log:    " + $EventLog) -ForegroundColor Magenta
if ($NotifyAvailable) {
    Write-Host ("  Notify module: loaded (notify.ps1)") -ForegroundColor Green
} else {
    Write-Host ("  Notify module: NOT FOUND (email disabled)") -ForegroundColor Yellow
}
Write-Host "  Press Ctrl+C to stop" -ForegroundColor Gray
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

Write-Log "INFO" "Watchdog started (notify_available=$NotifyAvailable)"

# Initial URL seed (if a previous log exists)
if ($Share -and (Test-Path $CpolarLog)) {
    $LastCpolarUrl = Get-CpolarUrl -LogPath $CpolarLog
    if ($LastCpolarUrl) {
        Write-Log "INFO" ("Initial cpolar URL: " + $LastCpolarUrl)
    }
}

# ====== Main loop ======
$loopCount = 0
while ($global:WatchdogRunning) {
    $loopCount++

    # 1) Server
    $serverOk = Test-ServerHealth
    if (-not $serverOk) {
        if ($MaxRestarts -eq 0 -or $RestartCount -lt $MaxRestarts) {
            if (Restart-ServerService) {
                $RestartCount++
            }
        } else {
            Write-Log "ERROR" ("Backend down but max restarts (" + $MaxRestarts + ") reached, giving up.")
            Write-EventLog -EventType "RESTART_FAILED" -Reason "max_restarts_reached" -Details ("target=backend count=$RestartCount")
            $tplData = @{ target="backend"; reason="max_restarts_reached"; maxRestarts=$MaxRestarts; timestamp=(Get-Date -Format "yyyy-MM-dd HH:mm:ss") }
            Invoke-Notification -EventType "MAX_RESTARTS_REACHED" -TemplateData $tplData
        }
    }

    # 2) Cpolar tunnel (Share mode)
    if ($Share) {
        $cpolarOk = Test-CpolarHealth -ExpectedUrl $LastCpolarUrl
        if (-not $cpolarOk) {
            if ($MaxRestarts -eq 0 -or $RestartCount -lt $MaxRestarts) {
                if (Restart-CpolarTunnel) {
                    $RestartCount++
                }
            } else {
                Write-Log "ERROR" ("cpolar down but max restarts (" + $MaxRestarts + ") reached, giving up.")
                Write-EventLog -EventType "RESTART_FAILED" -Reason "max_restarts_reached" -Details ("target=cpolar count=$RestartCount")
                $tplData = @{ target="cpolar"; reason="max_restarts_reached"; maxRestarts=$MaxRestarts; timestamp=(Get-Date -Format "yyyy-MM-dd HH:mm:ss") }
                Invoke-Notification -EventType "MAX_RESTARTS_REACHED" -TemplateData $tplData
            }
        } else {
            # Detect URL change (tunnel auto-reconnected with new URL, no restart needed)
            $currentUrl = Get-CpolarUrl -LogPath $CpolarLog
            if ($currentUrl -and $LastCpolarUrl -and $currentUrl -ne $LastCpolarUrl) {
                $oldUrl = $LastCpolarUrl
                $LastCpolarUrl = $currentUrl
                Write-Log "INFO" ("cpolar URL changed (no restart): " + $oldUrl + " -> " + $currentUrl)
                Write-EventLog -EventType "URL_CHANGED" -Reason "auto_reconnect_new_url" -NewUrl $currentUrl -OldUrl $oldUrl
                $tplData = @{ oldUrl=$oldUrl; newUrl=$currentUrl; reason="auto_reconnect_new_url"; recoveryMs=0; timestamp=(Get-Date -Format "yyyy-MM-dd HH:mm:ss") }
                Invoke-Notification -EventType "URL_CHANGED" -TemplateData $tplData
            } elseif ($currentUrl -and -not $LastCpolarUrl) {
                $LastCpolarUrl = $currentUrl
                Write-Log "INFO" ("cpolar URL detected: " + $currentUrl)
            }
        }
    }

    # Heartbeat every 10 rounds (~3-4 min at default interval)
    if ($loopCount % 10 -eq 0) {
        $parts = @()
        if (Test-ServerHealth) { $parts += "backend=OK" } else { $parts += "backend=FAIL" }
        if ($Share) {
            if (Test-CpolarHealth -ExpectedUrl $LastCpolarUrl) { $parts += "cpolar=OK" } else { $parts += "cpolar=FAIL" }
        }
        Write-Log "INFO" ("Heartbeat [" + $loopCount + "]: " + ($parts -join " | ") + " | restarts=" + $RestartCount + " | url=" + $LastCpolarUrl)
    }

    Start-Sleep -Seconds $IntervalSec
}
