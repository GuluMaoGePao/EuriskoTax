# EuriskoTax Notification Module (PowerShell)
# Sends email notifications when watchdog events occur.
# Reads config from notify.config.json and templates from notify-templates.json.
#
# Usage:
#   . .\notify.ps1
#   Send-WatchdogNotification -EventType "URL_CHANGED" -TemplateData @{ oldUrl="..."; newUrl="..." }
#   # Or with raw subject/body (bypass templates):
#   Send-WatchdogNotification -EventType "URL_CHANGED" -Subject "..." -Body "..."
#
# Logging:
#   All key events are logged to notify.log (next to this script) for troubleshooting.
#   Log levels: INFO (normal flow), WARN (skipped/degraded), ERROR (failures), DEBUG (detailed).

$NotifyConfigPath = Join-Path $PSScriptRoot "notify.config.json"
$NotifyTemplatesPath = Join-Path $PSScriptRoot "notify-templates.json"
$ReasonMapPath = Join-Path $PSScriptRoot "notify-reason-map.json"
$NotifyLogPath = Join-Path $PSScriptRoot "notify.log"
$NotifyConfig = $null
$NotifyTemplates = $null
$ReasonMap = $null

# ====== Unified logger ======
# Levels: INFO | WARN | ERROR | DEBUG
# DEBUG only writes when $env:NOTIFY_DEBUG = "1"
function Write-NotifyLog {
    param(
        [Parameter(Mandatory=$true)]
        [ValidateSet("INFO","WARN","ERROR","DEBUG")]
        [string]$Level,
        [Parameter(Mandatory=$true)]
        [string]$Message
    )
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$ts] [$Level] $Message"
    try {
        Add-Content -Path $NotifyLogPath -Value $line -Encoding UTF8 -ErrorAction SilentlyContinue
    } catch { }
    # Mirror to console with color
    $color = switch ($Level) {
        "INFO"  { "Gray" }
        "WARN"  { "Yellow" }
        "ERROR" { "Red" }
        "DEBUG" { "DarkGray" }
    }
    Write-Host "[NOTIFY] $line" -ForegroundColor $color
}

function Load-NotifyConfig {
    Write-NotifyLog "INFO" "Loading config from: $NotifyConfigPath"
    if (-not (Test-Path $NotifyConfigPath)) {
        Write-NotifyLog "ERROR" "Config file not found: $NotifyConfigPath"
        return $null
    }
    try {
        $raw = Get-Content $NotifyConfigPath -Raw -Encoding UTF8
        $cfg = $raw | ConvertFrom-Json
        $rc = if ($cfg.recipients) { $cfg.recipients.Count } else { 0 }
        Write-NotifyLog "INFO" "Config loaded OK (enabled=$($cfg.enabled), recipients=$rc, smtp=$($cfg.smtp.host):$($cfg.smtp.port))"
        return $cfg
    } catch {
        Write-NotifyLog "ERROR" "Failed to parse notify.config.json: $_"
        return $null
    }
}

function Load-NotifyTemplates {
    Write-NotifyLog "INFO" "Loading templates from: $NotifyTemplatesPath"
    if (-not (Test-Path $NotifyTemplatesPath)) {
        Write-NotifyLog "ERROR" "Templates file not found: $NotifyTemplatesPath"
        return $null
    }
    try {
        $raw = Get-Content $NotifyTemplatesPath -Raw -Encoding UTF8
        $tpl = $raw | ConvertFrom-Json
        $keys = $tpl.PSObject.Properties.Name | Where-Object { $_ -notmatch "^_" }
        Write-NotifyLog "INFO" "Templates loaded OK (keys: $($keys -join ', '))"
        return $tpl
    } catch {
        Write-NotifyLog "ERROR" "Failed to parse notify-templates.json: $_"
        return $null
    }
}

function Should-Notify {
    param([string]$EventType)
    if (-not $NotifyConfig) { $script:NotifyConfig = Load-NotifyConfig }
    if (-not $NotifyConfig) {
        Write-NotifyLog "WARN" "Should-Notify: config not loaded -> false (event=$EventType)"
        return $false
    }
    if (-not $NotifyConfig.enabled) {
        Write-NotifyLog "WARN" "Should-Notify: master switch disabled -> false (event=$EventType)"
        return $false
    }
    $result = switch ($EventType) {
        "BACKEND_RESTART"        { $NotifyConfig.notifyOn.backendRestart }
        "CPOLAR_RESTART"         { $NotifyConfig.notifyOn.cpolarRestart }
        "URL_CHANGED"            { $NotifyConfig.notifyOn.urlChanged }
        "RESTART_FAILED"         { $NotifyConfig.notifyOn.restartFailed }
        "MAX_RESTARTS_REACHED"   { $NotifyConfig.notifyOn.restartFailed }
        default                  { $true }
    }
    Write-NotifyLog "DEBUG" "Should-Notify: event=$EventType result=$result"
    return $result
}

# Load reason -> Chinese description map from JSON (avoids PS5 encoding issues)
function Load-ReasonMap {
    Write-NotifyLog "INFO" "Loading reason map from: $ReasonMapPath"
    if (-not (Test-Path $ReasonMapPath)) {
        Write-NotifyLog "WARN" "Reason map not found: $ReasonMapPath (reasons will stay in English)"
        return $null
    }
    try {
        $raw = Get-Content $ReasonMapPath -Raw -Encoding UTF8
        $map = $raw | ConvertFrom-Json
        $count = ($map.PSObject.Properties | Where-Object { $_.Name -notmatch "^_" }).Count
        Write-NotifyLog "INFO" "Reason map loaded OK ($count entries)"
        return $map
    } catch {
        Write-NotifyLog "ERROR" "Failed to parse notify-reason-map.json: $_"
        return $null
    }
}

# Map watchdog reason codes to Chinese descriptions (email friendly)
function Convert-ReasonToChinese {
    param([string]$Reason)
    if ([string]::IsNullOrWhiteSpace($Reason)) { return $Reason }
    if (-not $ReasonMap) { $script:ReasonMap = Load-ReasonMap }
    if (-not $ReasonMap) { return $Reason }
    $prop = $ReasonMap.PSObject.Properties[$Reason]
    if ($prop -and $prop.Value) {
        Write-NotifyLog "DEBUG" "Reason translated: $Reason -> $($prop.Value)"
        return $prop.Value
    }
    Write-NotifyLog "WARN" "Reason not found in map (passed through): $Reason"
    return $Reason
}

# Fill template placeholders like {reason}, {timestamp} with actual values
function Format-Template {
    param(
        [Parameter(Mandatory=$true)]
        [string]$Template,
        [hashtable]$Data
    )
    Write-NotifyLog "DEBUG" "Format-Template start (template length=$($Template.Length), data keys=$(if($Data){$Data.Count}else{0}))"
    $result = $Template
    if ($Data) {
        # Make a copy so we do not mutate the caller hashtable
        $processedData = @{}
        foreach ($key in $Data.Keys) { $processedData[$key] = $Data[$key] }

        # Translate reason value into Chinese description for the email body
        if ($processedData.ContainsKey("reason")) {
            $processedData["reason"] = Convert-ReasonToChinese -Reason $processedData["reason"]
        }

        foreach ($key in $processedData.Keys) {
            $placeholder = "{" + $key + "}"
            $value = if ($null -ne $processedData[$key]) { $processedData[$key].ToString() } else { "" }
            # Escape $ in replacement value to prevent regex backreference interpretation
            # (e.g. URLs like https://$1.r8.cpolar.cn would be misinterpreted)
            $safeValue = $value -replace '\$', '$$$$'
            $result = $result -replace [regex]::Escape($placeholder), $safeValue
            Write-NotifyLog "DEBUG" "  replaced $placeholder -> $($value.Substring(0, [Math]::Min(80, $value.Length)))"
        }
    }
    # Convert literal \n to real newlines (JSON templates use \n for line breaks)
    $result = $result -replace "\\n", "`n"
    Write-NotifyLog "DEBUG" "Format-Template done (result length=$($result.Length))"
    return $result
}

# Build subject and body from Chinese template
function Get-NotificationFromTemplate {
    param(
        [Parameter(Mandatory=$true)]
        [string]$EventType,
        [hashtable]$TemplateData
    )
    Write-NotifyLog "INFO" "Rendering template for event: $EventType"
    if (-not $NotifyTemplates) { $script:NotifyTemplates = Load-NotifyTemplates }
    if (-not $NotifyTemplates) {
        Write-NotifyLog "ERROR" "Templates not loaded, cannot render"
        return $null
    }

    $tpl = $NotifyTemplates.$EventType
    if (-not $tpl) {
        Write-NotifyLog "ERROR" "No template found for event: $EventType"
        return $null
    }

    $subject = Format-Template -Template $tpl.subject -Data $TemplateData
    $body = Format-Template -Template $tpl.body -Data $TemplateData
    Write-NotifyLog "INFO" "Template rendered OK (subject length=$($subject.Length), body length=$($body.Length))"
    return @{ Subject = $subject; Body = $body }
}

function Send-WatchdogNotification {
    param(
        [Parameter(Mandatory=$true)]
        [string]$EventType,
        [string]$Subject,
        [string]$Body,
        [hashtable]$TemplateData,
        [switch]$IsHtml
    )
    Write-NotifyLog "INFO" "===== Send-WatchdogNotification start (event=$EventType) ====="
    if (-not $NotifyConfig) { $script:NotifyConfig = Load-NotifyConfig }

    # If no raw Subject/Body provided, try loading from Chinese template
    if (-not $Subject -and -not $Body) {
        Write-NotifyLog "INFO" "No raw subject/body, using template rendering"
        $rendered = Get-NotificationFromTemplate -EventType $EventType -TemplateData $TemplateData
        if ($rendered) {
            $Subject = $rendered.Subject
            $Body = $rendered.Body
        } else {
            Write-NotifyLog "ERROR" "Template rendering failed and no raw subject/body provided, aborting"
            return $false
        }
    } else {
        Write-NotifyLog "INFO" "Using raw subject/body (template bypassed)"
    }

    if (-not $NotifyConfig) {
        Write-NotifyLog "WARN" "Config not loaded, skip email"
        return $false
    }
    if (-not $NotifyConfig.enabled) {
        Write-NotifyLog "WARN" "Notification master switch disabled (enabled=false), skip email"
        return $false
    }
    if (-not (Should-Notify -EventType $EventType)) {
        Write-NotifyLog "WARN" "Event type '$EventType' muted by notifyOn config, skip email"
        return $false
    }

    $smtp = $NotifyConfig.smtp
    $recipients = $NotifyConfig.recipients
    if (-not $recipients -or $recipients.Count -eq 0) {
        Write-NotifyLog "ERROR" "No recipients configured in notify.config.json"
        return $false
    }

    $from = $smtp.from
    $password = $smtp.password
    if ($from -match "your_qq_number" -or $password -match "your_auth_code") {
        Write-NotifyLog "ERROR" "SMTP credentials not filled (placeholder detected). Edit: $NotifyConfigPath"
        return $false
    }

    Write-NotifyLog "INFO" "Preparing email: from=$from, to=$($recipients -join '; '), subject length=$($Subject.Length)"

    # Convert plain text body to HTML (preserve line breaks, escape special chars)
    $fullBody = $Body
    if (-not $IsHtml) {
        $escaped = $Body -replace '&', '&amp;' -replace '<', '&lt;' -replace '>', '&gt;'
        $fullBody = $escaped -replace "`n", "<br>"
        $fullBody = "<div style='font-family: Consolas, monospace, sans-serif; font-size: 13px; line-height: 1.6;'>" + $fullBody + "</div>"
    }
    $footer = "<hr style='border:none;border-top:1px solid #ddd;margin:20px 0;'><p style='color:#888;font-size:11px;'>EuriskoTax Watchdog | " + (Get-Date -Format "yyyy-MM-dd HH:mm:ss") + " | Event: $EventType</p>"
    $fullBody = "<div style='font-family: sans-serif; max-width: 600px;'>" + $fullBody + $footer + "</div>"

    $msg = $null
    $client = $null
    $sendSw = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        Write-NotifyLog "INFO" "Building MailMessage (IsBodyHtml=$true, UTF8)"
        $msg = New-Object System.Net.Mail.MailMessage
        $msg.From = New-Object System.Net.Mail.MailAddress($from, $smtp.displayName)
        foreach ($to in $recipients) {
            $msg.To.Add($to)
        }
        $msg.Subject = $Subject
        $msg.Body = $fullBody
        $msg.IsBodyHtml = $true
        $msg.BodyEncoding = [System.Text.Encoding]::UTF8
        $msg.SubjectEncoding = [System.Text.Encoding]::UTF8

        Write-NotifyLog "INFO" "Connecting to SMTP: $($smtp.host):$($smtp.port) (SSL=$($smtp.useSsl), timeout=15s)"
        $client = New-Object System.Net.Mail.SmtpClient($smtp.host, [int]$smtp.port)
        $client.EnableSsl = [bool]$smtp.useSsl
        $client.Credentials = New-Object System.Net.NetworkCredential($from, $password)
        $client.Timeout = 15000

        Write-NotifyLog "INFO" "Sending email..."
        $client.Send($msg)
        $sendSw.Stop()
        Write-NotifyLog "INFO" "Email sent OK in $($sendSw.ElapsedMilliseconds)ms -> $($recipients -join ', ') | $Subject"
        return $true
    } catch {
        $sendSw.Stop()
        $ex = $_.Exception
        $innerMsg = if ($ex.InnerException) { $ex.InnerException.Message } else { "(no inner exception)" }
        Write-NotifyLog "ERROR" "Email send FAILED after $($sendSw.ElapsedMilliseconds)ms: $($ex.Message)"
        Write-NotifyLog "ERROR" "Inner exception: $innerMsg"
        Write-NotifyLog "ERROR" "Exception type: $($ex.GetType().FullName)"
        # Diagnose common failures
        if ($ex.Message -match "mailbox|not available|reject") {
            Write-NotifyLog "ERROR" "Hint: SMTP server rejected the sender or recipients. Check 'from' address and authorization code."
        } elseif ($ex.Message -match "timeout|timed out") {
            Write-NotifyLog "ERROR" "Hint: SMTP connection timed out. Check network/firewall and smtp.host/smtp.port."
        } elseif ($ex.Message -match "SSL|TLS|certificate") {
            Write-NotifyLog "ERROR" "Hint: SSL/TLS handshake failed. Check useSsl setting and port (587=STARTTLS, 465=SSL)."
        } elseif ($ex.Message -match "authentication|credential|535") {
            Write-NotifyLog "ERROR" "Hint: SMTP authentication failed. Verify authorization code (NOT login password) for QQ mailbox."
        }
        return $false
    } finally {
        if ($client) { try { $client.Dispose() } catch { } }
        if ($msg)    { try { $msg.Dispose() }    catch { } }
        Write-NotifyLog "DEBUG" "Resources disposed (client=$($null -ne $client), msg=$($null -ne $msg))"
    }
}

# Convenience function: send test email using TEST template
function Send-TestNotification {
    Write-NotifyLog "INFO" "===== Send-TestNotification invoked ====="
    if (-not $NotifyConfig) { $script:NotifyConfig = Load-NotifyConfig }
    if (-not $NotifyConfig) {
        Write-NotifyLog "ERROR" "Cannot send test: config not loaded"
        return $false
    }
    $data = @{
        from = $NotifyConfig.smtp.from
        recipients = ($NotifyConfig.recipients -join ", ")
        smtpHost = $NotifyConfig.smtp.host
        smtpPort = $NotifyConfig.smtp.port
        timestamp = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
    }
    return Send-WatchdogNotification -EventType "TEST" -TemplateData $data
}
