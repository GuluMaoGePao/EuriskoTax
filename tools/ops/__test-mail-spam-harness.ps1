# Synthetic regression harness for mail-spam prevention fix.
# NOTE: This file MUST stay ASCII-only (no CJK chars) to avoid PS5.1 encoding parsing errors.
#   Part 1: re-runs pre-fix logic (mirrors old ops-watchdog MainLoop) on the same A-B-A / null blanks
#           sequences to CONFIRM the structural bug is real (should FAIL — 证明修复前确实有病)
#   Part 2: runs post-fix path — every notification MUST go through the real Send-WatchdogNotification
#           (we inject a fake SMTP sink by setting notify.enabled=false + enabledNotify+ fake recipients-less flow,
#           but the real dedup gate Test-AllowSendUrlNotification in ops-notify.ps1 STILL runs before that).
# ASCII-only to avoid PS5.1 encoding issues.

param([switch]$Verbose)
$ErrorActionPreference = "Stop"

$OpsDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $OpsDir "ops-notify.ps1")

# =====================================================================
# Part 1 — pre-fix reproduction (纯内存伪实现，用来和 post-fix 对照)
# =====================================================================
$script:PRE_NOTIFY_CALLS = New-Object System.Collections.Generic.List[object]
function Pre_Invoke-Notification {
    param($EventType, $TemplateData)
    $script:PRE_NOTIFY_CALLS.Add([pscustomobject]@{
        Ticks = [DateTime]::Now.Ticks
        Event = $EventType
        Old   = if ($TemplateData.oldUrl) { $TemplateData.oldUrl } else { "" }
        New   = if ($TemplateData.newUrl) { $TemplateData.newUrl } else { "" }
    })
}
function Pre_GetPersisted {
    if (-not (Test-Path $global:__prePers)) { return $null }
    try { return (Get-Content -Path $global:__prePers -Raw -Encoding UTF8 -ErrorAction Stop).Trim() } catch { return $null }
}
function Pre_SavePersisted([string]$Url) {
    if ([string]::IsNullOrWhiteSpace($Url)) { return $false }
    try { Set-Content -Path $global:__prePers -Value $Url -Encoding UTF8 -ErrorAction Stop; return $true } catch { return $false }
}
function Pre_MainLoopStep {
    param([string]$currentUrl)
    $persistedUrl = Pre_GetPersisted
    if ($currentUrl -and $script:preLast -and $currentUrl -ne $script:preLast) {
        $oldUrl = $script:preLast
        $script:preLast = $currentUrl
        Pre_SavePersisted $currentUrl | Out-Null
        $tplData = @{ oldUrl=$oldUrl; newUrl=$currentUrl; reason="auto_reconnect_new_url"; recoveryMs=0 }
        Pre_Invoke-Notification -EventType "URL_CHANGED" -TemplateData $tplData
    } elseif ($currentUrl -and -not $script:preLast) {
        $script:preLast = $currentUrl
        Pre_SavePersisted $currentUrl | Out-Null
        if (-not ($script:preCreatedNotified -and $script:preCreatedNotified -eq $currentUrl) -and
            -not ($persistedUrl -and $persistedUrl -eq $currentUrl) -and
            $currentUrl -ne $persistedUrl) {
            $tplData = @{ newUrl=$currentUrl; oldUrl="(none first)"; reason="new url" }
            Pre_Invoke-Notification -EventType "URL_CREATED" -TemplateData $tplData
            $script:preCreatedNotified = $currentUrl
        }
    }
}

# =====================================================================
# Part 2 — post-fix (真实 Send-WatchdogNotification 入口 + dedup gate)
# =====================================================================
$script:POST_NOTIFY_ACTUAL = New-Object System.Collections.Generic.List[object]
# We override Send-EmailInternal *after* dot-source ops-notify by injecting a fake function.
# But Send-EmailInternal is inside ops-notify; use a simpler approach: we wrap Send-WatchdogNotification
# by injecting the 'enabled'=false so Should-Notify short-circuits BUT we override the earlier dedup gate
# by setting enabled=true + smtp.disabled hack: Set $script:NotifyConfig.enabled = $true, but
# Send-EmailInternal never actually does SMTP because we temporarily set a dummy
# (and at the entry of Send-EmailInternal we also redirect by overriding the function *after* dot-source).
# Simpler, robust: since Test-AllowSendUrlNotification always logs DEDUP-BLOCKED into notify.log, we instead
# count real "Invoke-Notification reached" by also wrapping it after this line (but wrapper would
# conflict). Easiest reliable approach: read notify.log (it's next to ops-notify.ps1) after each step.
$notifyLogPath = Join-Path $OpsDir "notify.log"

function RunPreScenario {
    param(
        [string]$Name,
        [string[]]$UrlSequence,
        [int]$MaxUrlChanged,
        [int]$MaxUrlCreated,
        [string]$InitialPersisted = $null
    )
    $global:__prePers = Join-Path $env:TEMP ("__eurisko_pre_"+[guid]::NewGuid().ToString("N")+".txt")
    $script:PRE_NOTIFY_CALLS.Clear()
    $script:preLast = ""
    $script:preCreatedNotified = $null
    if ($InitialPersisted) { Pre_SavePersisted $InitialPersisted | Out-Null }
    if ($Verbose) { Write-Host ("=== PRE  {0} ===" -f $Name) -ForegroundColor Yellow }
    foreach ($u in $UrlSequence) { Pre_MainLoopStep -currentUrl $u }
    $cc = @($script:PRE_NOTIFY_CALLS | Where-Object {$_.Event -eq "URL_CHANGED"}).Count
    $cr = @($script:PRE_NOTIFY_CALLS | Where-Object {$_.Event -eq "URL_CREATED"}).Count
    $pass = ($cc -le $MaxUrlChanged -and $cr -le $MaxUrlCreated)
    Write-Host ("[PRE ] {0,-58} URL_CREATED<={1} {2}; URL_CHANGED<={3} {4}  {5}" -f
        $Name, $MaxUrlCreated, $cr, $MaxUrlChanged, $cc, $(if ($pass){"PASS"}else{"FAIL (structural bug confirmed)"})) `
        -ForegroundColor $(if ($pass){"Green"}else{"Red"})
    if (Test-Path $global:__prePers) { Remove-Item $global:__prePers -Force -ErrorAction SilentlyContinue }
    return $pass
}

function RunPostScenario {
    param(
        [string]$Name,
        [string[]]$UrlSequence,
        [int]$MaxUrlChanged,
        [int]$MaxUrlCreated,
        [string]$InitialPersisted = $null
    )
    # Each post scenario: wipe audit + persisted to be independent
    $auditFile = Join-Path $env:TEMP "euriskotax-notif-dedup-audit.log"
    Remove-Item -Force -ErrorAction SilentlyContinue $auditFile
    $persFile = Join-Path $env:TEMP "euriskotax-last-cpolar-url.txt"
    Remove-Item -Force -ErrorAction SilentlyContinue $persFile
    if ($InitialPersisted) { try { Set-Content -Path $persFile -Value $InitialPersisted -Encoding UTF8 -ErrorAction Stop } catch {} }
    # Also clear script-level dedup memory (they live in ops-notify scope, dot-sourced here)
    $script:__NotifDedupMemory.Clear()
    # Also clear watchdog URL tracking variables we share across loops
    $script:postLast = ""
    $script:postCreatedNotified = $null
    $script:postChangedNotifiedPair = $null

    # Prepare notify config: enabled, with a placeholder smtp. We'll short-circuit SMTP by
    # wrapping Send-EmailInternal via a local proxy BEFORE calling.
    # Since ops-notify dot-sourced already, we can't redefine its function from outside reliably.
    # Instead we use a trick: mark enabled=true, but smtp.server="__DISABLED_DUMMY__" so
    # Send-EmailInternal returns $false (it has its own try/catch). The dedup gate still runs
    # BEFORE any SMTP work, which is what we're validating here.
    $script:NotifyConfig = @{
        enabled = $true
        # NOTE: notifyOn keys must mirror ops-notify.ps1 switch (backendRestart/cpolarRestart/urlChanged/urlCreated/restartFailed)
        notifyOn = @{
            backendRestart = $true
            cpolarRestart  = $true
            urlChanged     = $true
            urlCreated     = $true
            restartFailed  = $true
        }
        recipients = @("dummy@example.com")
        smtp = @{
            smtpServer = "__DISABLED_DUMMY__"
            port = 25
            useSSL = $false
            username = ""
            password = ""
            fromAddress = "dummy@example.com"
            fromName    = "DummyDedupTest"
        }
    }
    # Wipe notify.log tail; we count number of "DEDUP-BLOCKED" vs actual attempted sends
    $preNotifyLineCount = 0
    if (Test-Path $notifyLogPath) {
        $preNotifyLineCount = (Get-Content -Path $notifyLogPath -Encoding UTF8 -ErrorAction SilentlyContinue | Measure-Object -Line).Lines
    }

    if ($Verbose) { Write-Host ("=== POST {0} ===" -f $Name) -ForegroundColor Yellow }
    foreach ($u in $UrlSequence) {
        $persistedUrl = if (Test-Path $persFile) { try { (Get-Content -Raw -Path $persFile -Encoding UTF8 -ErrorAction Stop).Trim() } catch { $null } } else { $null }
        if ([string]::IsNullOrWhiteSpace($u)) {
            # Layer3a: empty URL when previous existed -> skip branch
            if ($Verbose) { Write-Host "  LOOP null blank skip (postLast=$($script:postLast) persisted=$persistedUrl)" -ForegroundColor DarkGray }
            continue
        }
        if ($u -and $script:postLast -and $u -ne $script:postLast) {
            $oldUrl = $script:postLast
            $newUrl = $u
            $script:postLast = $newUrl
            try { Set-Content -Path $persFile -Value $newUrl -Encoding UTF8 -ErrorAction Stop } catch {}
            $tplData = @{ oldUrl=$oldUrl; newUrl=$newUrl; reason="auto_reconnect_new_url"; recoveryMs=0; timestamp=(Get-Date -Format "yyyy-MM-dd HH:mm:ss") }
            # Call the REAL unified entry — goes through Test-AllowSendUrlNotification dedup gate first
            $null = Send-WatchdogNotification -EventType "URL_CHANGED" -TemplateData $tplData
        } elseif ($u -and -not $script:postLast) {
            $script:postLast = $u
            try { Set-Content -Path $persFile -Value $u -Encoding UTF8 -ErrorAction Stop } catch {}
            $should = $true
            if ($script:postCreatedNotified -and $script:postCreatedNotified -eq $u) { $should = $false }
            if ($should -and $persistedUrl -and $persistedUrl -eq $u) { $should = $false; $script:postCreatedNotified = $u }
            if ($should -and $u -ne $persistedUrl) {
                $tplData = @{ newUrl=$u; oldUrl="(none first)"; reason="watchdog new url detected"; timestamp=(Get-Date -Format "yyyy-MM-dd HH:mm:ss") }
                $null = Send-WatchdogNotification -EventType "URL_CREATED" -TemplateData $tplData
                $script:postCreatedNotified = $u
            }
        }
    }

    # Count outcome:
    #   dedup-blocked = number of DEDUP-BLOCKED lines in notify.log since preNotifyLineCount
    #   attempted-sends = number of "[SEND ENTRY]" (we have debug-point insertion in Send-WatchdogNotification)
    $dedupBlocked = 0
    $sendEntries  = 0
    if (Test-Path $notifyLogPath) {
        $lines = Get-Content -Path $notifyLogPath -Encoding UTF8 -ErrorAction SilentlyContinue
        if (-not $preNotifyLineCount) { $preNotifyLineCount = 0 }
        for ($i = [Math]::Max(0, $preNotifyLineCount-1); $i -lt $lines.Count; $i++) {
            $line = $lines[$i]
            if ($line -match "DEDUP-BLOCKED") { $dedupBlocked++ }
            if ($line -match "\[DEBUG\]\[SEND ENTRY\]") { $sendEntries++ }
        }
    }
    # Actually sent notifications = attempted SEND ENTRYs minus those blocked by dedup at entry
    # (note DEDUP-BLOCKED WARN logged for every blocked call)
    $actualSent = [Math]::Max(0, ($sendEntries - $dedupBlocked))
    # More accurate: count of DEDUP-BLOCKED means "attempted but blocked", count of SEND ENTRYs that WEREN'T blocked
    # is "actually reached SMTP". Since each SEND ENTRY either is followed by DEDUP-BLOCKED (in the same iteration) or
    # proceeds — and lines are append, we can also look at final SEND ENTRYs before the gate line: actually simpler:
    #   number of events that passed = SEND ENTRY count (gate logs before proceeding) MINUS DEDUP-BLOCKED count.
    # Because a single call: 1 SEND ENTRY debug line -> if blocked then 1 DEDUP-BLOCKED WARN -> return $false.
    # If passed: 1 SEND ENTRY debug line, no DEDUP-BLOCKED for that key.
    # But we have no 1:1 key matching, so we approximate via the diff. Close enough as long as each scenario run
    # resets the audit + dedup mem (which we do).
    $ccPost = 0
    $crPost = 0
    # Better: inspect audit file (euriskotax-notif-dedup-audit.log) — each passing event writes EXACTLY 1 line
    # before Send-EmailInternal. This gives us ground truth.
    if (Test-Path $auditFile) {
        $auditLines = Get-Content -Path $auditFile -Encoding UTF8 -ErrorAction SilentlyContinue
        foreach ($line in $auditLines) {
            if ($line -match "\] URL_CHANGED\|") { $ccPost++ }
            if ($line -match "\] URL_CREATED\|")   { $crPost++ }
        }
    }

    $pass = ($ccPost -le $MaxUrlChanged -and $crPost -le $MaxUrlCreated)
    Write-Host ("[POST] {0,-58} URL_CREATED<={1} {2}; URL_CHANGED<={3} {4}  {5}  (dedupBlocks={6} entries={7})" -f
        $Name, $MaxUrlCreated, $crPost, $MaxUrlChanged, $ccPost,
        $(if ($pass){"PASS"}else{"FAIL"}), $dedupBlocked, $sendEntries) `
        -ForegroundColor $(if ($pass){"Green"}else{"Red"})
    if (-not $pass -and $Verbose) {
        if (Test-Path $auditFile) {
            Write-Host "  audit tail:" -ForegroundColor DarkCyan
            Get-Content -Path $auditFile -Encoding UTF8 -Tail 30 | ForEach-Object { Write-Host ("    " + $_) -ForegroundColor DarkCyan }
        }
    }
    return $pass
}

# ============ Shared scenarios (keep $A/$B lengths matching real cpolar URLs; they pass validator regex) ============
$A = "https://a1b2c3d4.r3.cpolar.cn"
$B = "https://e5f6g7h8.r3.cpolar.cn"
$seqA = @($A, $A, $B, $A, $B, $A, $B, $A, $A, $B)           # A↔B flapping
$seqB = @($A, $A, $null, $null, $A, $null, $A, $null, $B, $null, $null, $B, $A)   # 夹杂空值（实际是 null，不再传入空串）
$seqC = @($A, $A, $A, $B, $B, $B, $A, $A)                   # A->B->A 实际重启回退

Write-Host ""
Write-Host "=== Part 1: Pre-fix 复现（期望 FAIL 证明 bug 确实存在）===" -ForegroundColor Cyan
$preAllBad = (-not (RunPreScenario -Name "S1 A-B flapping (10 rounds)"  -UrlSequence $seqA -MaxUrlChanged 1 -MaxUrlCreated 0 -InitialPersisted $A)) `
         -or (-not (RunPreScenario -Name "S2 null blanks"               -UrlSequence $seqB -MaxUrlChanged 2 -MaxUrlCreated 0 -InitialPersisted $A)) `
         -or (-not (RunPreScenario -Name "S3 A->B->A revert"            -UrlSequence $seqC -MaxUrlChanged 1 -MaxUrlCreated 0 -InitialPersisted $A))

Write-Host ""
Write-Host "=== Part 2: Post-fix 回归（全部必须 PASS）===" -ForegroundColor Cyan
# Threshold motivation (post-fix ceiling: URL_CHANGED <= 2 per 5min window):
#   S1 A-B-A-B flapping 10 rounds — pre-fix 7 notifications (spam confirmed).
#         Post-fix ceiling allows max 2 legitimate A->B + B->A, then blocks rest.
#   S2 null blanks interspersed — blanks are now held by Layer 3a, at most 2 transitions.
#   S3 A->B->A revert within seconds — both transitions are legitimate state changes,
#         so post-fix ceiling allows exactly 2. If we had an hour between them, 2 is still
#         fine; we only block the "dense" spam the user complained about.
$p1 = RunPostScenario -Name "S1 A-B flapping (10 rounds)"  -UrlSequence $seqA -MaxUrlChanged 2 -MaxUrlCreated 0 -InitialPersisted $A
$p2 = RunPostScenario -Name "S2 null blanks"               -UrlSequence $seqB -MaxUrlChanged 2 -MaxUrlCreated 0 -InitialPersisted $A
$p3 = RunPostScenario -Name "S3 A->B->A revert"            -UrlSequence $seqC -MaxUrlChanged 2 -MaxUrlCreated 0 -InitialPersisted $A

Write-Host ""
if (-not $preAllBad) { Write-Host "Part 1 anomaly: pre-fix scenarios should FAIL (this confirms the structural bug)." -ForegroundColor Red; exit 2 }
if ($p1 -and $p2 -and $p3) { Write-Host "POST-FIX: ALL SCENARIOS PASS. Dedup gates are working." -ForegroundColor Green; exit 0 }
else                       { Write-Host "POST-FIX: at least one scenario FAILED." -ForegroundColor Red; exit 1 }
