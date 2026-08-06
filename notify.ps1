# EuriskoTax Notification Module (PowerShell)
# Sends email notifications when watchdog events occur.
# Reads config from notify.config.json and templates from notify-templates.json.
#
# Usage:
#   . .\notify.ps1
#   Send-WatchdogNotification -EventType "URL_CHANGED" -TemplateData @{ oldUrl="..."; newUrl="..." }
#   # Or with raw subject/body (bypass templates):
#   Send-WatchdogNotification -EventType "URL_CHANGED" -Subject "..." -Body "..."

$NotifyConfigPath = Join-Path $PSScriptRoot "notify.config.json"
$NotifyTemplatesPath = Join-Path $PSScriptRoot "notify-templates.json"
$NotifyConfig = $null
$NotifyTemplates = $null

function Load-NotifyConfig {
    if (-not (Test-Path $NotifyConfigPath)) {
        return $null
    }
    try {
        $raw = Get-Content $NotifyConfigPath -Raw -Encoding UTF8
        $cfg = $raw | ConvertFrom-Json
        return $cfg
    } catch {
        Write-Warning "Failed to parse notify.config.json: $_"
        return $null
    }
}

function Load-NotifyTemplates {
    if (-not (Test-Path $NotifyTemplatesPath)) {
        return $null
    }
    try {
        $raw = Get-Content $NotifyTemplatesPath -Raw -Encoding UTF8
        $tpl = $raw | ConvertFrom-Json
        return $tpl
    } catch {
        Write-Warning "Failed to parse notify-templates.json: $_"
        return $null
    }
}

function Should-Notify {
    param([string]$EventType)
    if (-not $NotifyConfig) { $script:NotifyConfig = Load-NotifyConfig }
    if (-not $NotifyConfig) { return $false }
    if (-not $NotifyConfig.enabled) { return $false }
    switch ($EventType) {
        "BACKEND_RESTART"        { return $NotifyConfig.notifyOn.backendRestart }
        "CPOLAR_RESTART"         { return $NotifyConfig.notifyOn.cpolarRestart }
        "URL_CHANGED"            { return $NotifyConfig.notifyOn.urlChanged }
        "RESTART_FAILED"         { return $NotifyConfig.notifyOn.restartFailed }
        "MAX_RESTARTS_REACHED"   { return $NotifyConfig.notifyOn.restartFailed }
        default                  { return $true }
    }
}

# Fill template placeholders like {reason}, {timestamp} with actual values
function Format-Template {
    param(
        [Parameter(Mandatory=$true)]
        [string]$Template,
        [hashtable]$Data
    )
    $result = $Template
    if ($Data) {
        foreach ($key in $Data.Keys) {
            $placeholder = "{" + $key + "}"
            $value = if ($null -ne $Data[$key]) { $Data[$key].ToString() } else { "" }
            $result = $result -replace [regex]::Escape($placeholder), $value
        }
    }
    # Convert literal \n to real newlines (JSON templates use \n for line breaks)
    $result = $result -replace "\\n", "`n"
    return $result
}

# Build subject and body from Chinese template
function Get-NotificationFromTemplate {
    param(
        [Parameter(Mandatory=$true)]
        [string]$EventType,
        [hashtable]$TemplateData
    )
    if (-not $NotifyTemplates) { $script:NotifyTemplates = Load-NotifyTemplates }
    if (-not $NotifyTemplates) { return $null }

    $tpl = $NotifyTemplates.$EventType
    if (-not $tpl) { return $null }

    $subject = Format-Template -Template $tpl.subject -Data $TemplateData
    $body = Format-Template -Template $tpl.body -Data $TemplateData
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
    if (-not $NotifyConfig) { $script:NotifyConfig = Load-NotifyConfig }

    # If no raw Subject/Body provided, try loading from Chinese template
    if (-not $Subject -and -not $Body) {
        $rendered = Get-NotificationFromTemplate -EventType $EventType -TemplateData $TemplateData
        if ($rendered) {
            $Subject = $rendered.Subject
            $Body = $rendered.Body
        } else {
            Write-Host "[NOTIFY] No template for event '$EventType' and no raw Subject/Body provided, skip" -ForegroundColor Yellow
            return $false
        }
    }

    if (-not $NotifyConfig) {
        Write-Host "[NOTIFY] Config not loaded, skip email: $Subject" -ForegroundColor Gray
        return $false
    }
    if (-not $NotifyConfig.enabled) {
        Write-Host "[NOTIFY] Notification disabled, skip email: $Subject" -ForegroundColor Gray
        return $false
    }
    if (-not (Should-Notify -EventType $EventType)) {
        Write-Host "[NOTIFY] Event type '$EventType' muted by config, skip: $Subject" -ForegroundColor Gray
        return $false
    }

    $smtp = $NotifyConfig.smtp
    $recipients = $NotifyConfig.recipients
    if (-not $recipients -or $recipients.Count -eq 0) {
        Write-Host "[NOTIFY] No recipients configured, skip email" -ForegroundColor Yellow
        return $false
    }

    $from = $smtp.from
    $password = $smtp.password
    if ($from -match "your_qq_number" -or $password -match "your_auth_code") {
        Write-Host "[NOTIFY] SMTP credentials not filled (placeholder detected), skip email" -ForegroundColor Yellow
        Write-Host "         Edit: $NotifyConfigPath" -ForegroundColor Gray
        return $false
    }

    # Convert plain text body to HTML (preserve line breaks, escape special chars)
    $fullBody = $Body
    if (-not $IsHtml) {
        $escaped = $Body -replace '&', '&amp;' -replace '<', '&lt;' -replace '>', '&gt;'
        $fullBody = $escaped -replace "`n", "<br>"
        $fullBody = "<div style='font-family: Consolas, monospace, sans-serif; font-size: 13px; line-height: 1.6;'>" + $fullBody + "</div>"
    }
    $footer = "<hr style='border:none;border-top:1px solid #ddd;margin:20px 0;'><p style='color:#888;font-size:11px;'>EuriskoTax Watchdog | " + (Get-Date -Format "yyyy-MM-dd HH:mm:ss") + " | Event: $EventType</p>"
    $fullBody = "<div style='font-family: sans-serif; max-width: 600px;'>" + $fullBody + $footer + "</div>"

    try {
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

        $client = New-Object System.Net.Mail.SmtpClient($smtp.host, [int]$smtp.port)
        $client.EnableSsl = [bool]$smtp.useSsl
        $client.Credentials = New-Object System.Net.NetworkCredential($from, $password)
        $client.Timeout = 15000

        $client.Send($msg)
        $client.Dispose()
        $msg.Dispose()
        Write-Host "[NOTIFY] Email sent OK -> $($recipients -join ', ') | $Subject" -ForegroundColor Green
        return $true
    } catch {
        Write-Host "[NOTIFY] Email send FAILED: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

# Convenience function: send test email using TEST template
function Send-TestNotification {
    if (-not $NotifyConfig) { $script:NotifyConfig = Load-NotifyConfig }
    $data = @{
        from = $NotifyConfig.smtp.from
        recipients = ($NotifyConfig.recipients -join ", ")
        smtpHost = $NotifyConfig.smtp.host
        smtpPort = $NotifyConfig.smtp.port
        timestamp = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
    }
    return Send-WatchdogNotification -EventType "TEST" -TemplateData $data
}
