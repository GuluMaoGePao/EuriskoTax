$ErrorActionPreference = "Stop"
try {
    # 1. 检查 swagger 规范文档
    $json = Invoke-RestMethod -Uri "http://localhost:3000/api/docs.json" -TimeoutSec 5
    Write-Host "=== Swagger Spec Info ==="
    Write-Host "title: $($json.info.title)"
    $paths = @($json.paths | Get-Member -MemberType NoteProperty)
    Write-Host "paths: $($paths.Count)"
    Write-Host "securitySchemes present: $($json.components -and $json.components.securitySchemes -and $json.components.securitySchemes.bearerAuth)"
    if ($json.components -and $json.components.securitySchemes) {
        $json.components.securitySchemes | ConvertTo-Json -Depth 3
    }
    # 检查每个端点是否有 @swagger 定义
    $samplePath = "/api/auth/profile"
    if ($json.paths -and $json.paths.$samplePath) {
        Write-Host "`n=== GET $samplePath ==="
        $json.paths.$samplePath | ConvertTo-Json -Depth 3
    } else {
        Write-Host "NO DOC for $samplePath (probably missing @swagger JSDoc annotations)"
    }

    # 2. 测试实际登录+访问 profile 接口
    $body = @{ email = "dev@example.com"; password = "password" } | ConvertTo-Json
    $login = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" -Method POST -ContentType "application/json" -Body $body -TimeoutSec 5
    $token = $login.data.token
    Write-Host "`n=== Test Profile API with Token ==="
    $headers = @{ Authorization = "Bearer $token" }
    try {
        $profile = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/profile" -Headers $headers -TimeoutSec 5
        Write-Host "API profile OK: $($profile.data.email)"
    } catch {
        Write-Host "API profile FAIL: $($_.Exception.Message)"
        if ($_.Exception.Response) {
            $respStream = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            Write-Host $respStream.ReadToEnd()
        }
    }
} catch {
    Write-Host "ERR: $($_.Exception.Message)"
}
