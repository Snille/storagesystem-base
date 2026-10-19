param([string]$Image = 'storagesystem-base:local')
$ErrorActionPreference = 'Stop'
$containerName = 'storage-base-check-' + [guid]::NewGuid().ToString('N').Substring(0, 10)
$volumeName = $containerName + '-data'
$createdContainer = $false
$createdVolume = $false

function Invoke-Docker {
    $result = & docker @args
    if ($LASTEXITCODE -ne 0) { throw "Docker command failed: $($args[0])" }
    return $result
}

try {
    Invoke-Docker volume create $volumeName | Out-Null
    $createdVolume = $true
    Invoke-Docker run -d --name $containerName -p '127.0.0.1::3210' `
        -e STORAGE_ADMIN_KEY=isolated-admin-fixture -e STORAGE_API_KEY=isolated-public-fixture `
        -v "${volumeName}:/data" $Image | Out-Null
    $createdContainer = $true
    $port = (Docker port $containerName 3210).Trim().Split(':')[-1]
    $base = "http://127.0.0.1:$port"
    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        try { $health = Invoke-RestMethod -TimeoutSec 5 -DisableKeepAlive "$base/healthz"; if ($health.ok) { $ready = $true; break } } catch { }
        Start-Sleep -Milliseconds 300
    }
    if (!$ready) { throw 'Isolated container did not become ready.' }
    $headers = @{ 'x-api-key' = 'isolated-admin-fixture' }
    $payload = @{
        box = @{ boxId = 'DEMO-1'; label = 'Demo fasteners'; currentLocationId = 'CABINET:A:H1:P1' }
        session = @{ boxId = 'DEMO-1'; summary = 'Demo M3 screws'; itemKeywords = @('demo', 'screws') }
    } | ConvertTo-Json -Depth 6
    $null = Invoke-RestMethod -TimeoutSec 5 -DisableKeepAlive "$base/api/manage/session" -Method Post -Headers $headers -ContentType 'application/json' -Body $payload
    $before = Invoke-RestMethod -TimeoutSec 5 -DisableKeepAlive "$base/api/manage/export" -Headers $headers
    if ($before.boxes.Count -ne 1) { throw 'Fixture write did not persist.' }
    Invoke-Docker restart $containerName | Out-Null
    # Docker can allocate a new host port when restarting a dynamically published port.
    $port = (Invoke-Docker port $containerName 3210).Trim().Split(':')[-1]
    $base = "http://127.0.0.1:$port"
    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        try { $after = Invoke-RestMethod -TimeoutSec 5 -DisableKeepAlive "$base/api/manage/export" -Headers $headers; $ready = $true; break } catch { }
        Start-Sleep -Milliseconds 300
    }
    if (!$ready -or $after.boxes[0].boxId -ne 'DEMO-1') { throw 'Data was not retained across restart.' }
    Invoke-Docker exec $containerName node src/cli.js audit | Write-Output
    Invoke-Docker exec $containerName node src/cli.js backup /data/check-backup.sqlite | Write-Output
    Invoke-Docker exec $containerName node src/cli.js restore /data/check-backup.sqlite /data/check-restored.sqlite | Write-Output
    Invoke-Docker exec -e STORAGE_DB=/data/check-restored.sqlite $containerName node src/cli.js audit | Write-Output
    $mcp = @{ jsonrpc = '2.0'; id = 1; method = 'tools/call'; params = @{ name = 'search_inventory'; arguments = @{ query = 'demo' } } } | ConvertTo-Json -Depth 7
    $found = Invoke-RestMethod -TimeoutSec 5 -DisableKeepAlive "$base/api/mcp" -Method Post -Headers @{ 'x-api-key' = 'isolated-public-fixture' } -ContentType 'application/json' -Body $mcp
    if ($found.result.structuredContent.matches[0].boxId -ne 'DEMO-1') { throw 'Container MCP search failed.' }
    Write-Output 'PASS: non-root container, HTTP write/read, restart persistence, audit, backup, fresh restore, and MCP.'
} finally {
    # Remove only exact names created by this invocation, never other containers or volumes.
    if ($createdContainer) { & docker rm -f $containerName | Out-Null }
    if ($createdVolume) { & docker volume rm $volumeName | Out-Null }
}
