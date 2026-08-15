$ErrorActionPreference = "Continue"
Write-Host "=== 1. Check /health ==="
try {
    $h = Invoke-WebRequest -Uri "http://localhost:3000/health" -TimeoutSec 5 -UseBasicParsing
    Write-Host "health OK: $($h.StatusCode)"
} catch {
    Write-Host "health FAIL: $($_.Exception.Message)"
}

Write-Host "`n=== 2. Check /api/docs.json ==="
try {
    $d = Invoke-WebRequest -Uri "http://localhost:3000/api/docs.json" -TimeoutSec 5 -UseBasicParsing
    Write-Host "docs.json OK: $($d.StatusCode), length=$($d.Content.Length)"
    $json = $d.Content | ConvertFrom-Json
    $paths = @($json.paths | Get-Member -MemberType NoteProperty)
    Write-Host "paths count: $($paths.Count)"
    if ($json.paths) { Write-Host "path names:"; $paths | ForEach-Object { Write-Host "  $($_.Name)" } }
    if ($json.components.securitySchemes) { Write-Host "securitySchemes: present" } else { Write-Host "securitySchemes: MISSING" }
    if ($json.security) { Write-Host "global security: present" } else { Write-Host "global security: MISSING" }
} catch {
    Write-Host "docs.json FAIL: $($_.Exception.Message)"
    if ($_.Exception.Response) {
        $sr = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        Write-Host "body: $($sr.ReadToEnd())"
    }
}

Write-Host "`n=== 3. Check /api/docs (Swagger UI HTML) ==="
try {
    $s = Invoke-WebRequest -Uri "http://localhost:3000/api/docs" -TimeoutSec 5 -UseBasicParsing
    Write-Host "docs HTML OK: $($s.StatusCode), length=$($s.Content.Length)"
} catch {
    Write-Host "docs HTML FAIL: $($_.Exception.Message)"
}

Write-Host "`n=== 4. Login test ==="
try {
    $body = @{ email = "dev@example.com"; password = "password" } | ConvertTo-Json
    $r = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" -Method POST -ContentType "application/json" -Body $body -TimeoutSec 8
    Write-Host "login OK: success=$($r.success), token length=$($r.data.token.Length)"
} catch {
    Write-Host "login FAIL: $($_.Exception.Message)"
}
