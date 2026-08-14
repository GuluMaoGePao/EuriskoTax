$ErrorActionPreference = "Stop"
try {
    $body = @{ email = "dev@example.com"; password = "password" } | ConvertTo-Json
    $r = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" -Method POST -ContentType "application/json" -Body $body -TimeoutSec 5
    Write-Host "LOGIN OK"
    Write-Host "Token: $($r.token)"
    Write-Host "User:  $($r.user.email)"
    $r | ConvertTo-Json -Depth 5
} catch {
    Write-Host "ERROR: $($_.Exception.Message)"
    if ($_.Exception.Response) {
        $sr = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        Write-Host $sr.ReadToEnd()
    }
}
