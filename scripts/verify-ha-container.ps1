param(
    [string]$IntegrationSource = (Join-Path $PSScriptRoot '../../storagesystem-ha/custom_components/storagesystem'),
    [string]$HaImage = 'ghcr.io/home-assistant/home-assistant@sha256:33afb0659d786213264c2211f8d91c5fe87461c56eba6a3a546eb05fc71e89f4',
    [switch]$Hold
)
$ErrorActionPreference = 'Stop'
$runId = 'storage-ha-check-' + [guid]::NewGuid().ToString('N').Substring(0, 10)
$fixtureName = $runId + '-fixture'
$haName = $runId + '-ha'
$configVolume = $runId + '-config'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$integration = (Resolve-Path $IntegrationSource).Path
if (!(Test-Path -LiteralPath (Join-Path $integration 'manifest.json'))) { throw 'Integration source missing.' }
function CheckedDocker {
    & docker @args
    if ($LASTEXITCODE -ne 0) { throw "Docker acceptance step failed ($LASTEXITCODE)." }
}
try {
    CheckedDocker network create --label storagesystem.acceptance=$runId $runId
    CheckedDocker volume create --label storagesystem.acceptance=$runId $configVolume
    CheckedDocker run -d --name $fixtureName --network $runId --network-alias storage-fixture --label storagesystem.acceptance=$runId -p 127.0.0.1:3216:3212 --mount "type=bind,source=$repo/scripts/browser-fixture.js,target=/app/scripts/browser-fixture.js,readonly" -e FIXTURE_HOST=0.0.0.0 -e FIXTURE_SEED=1 -e APP_BASE_URL=http://localhost:3216 storagesystem-base:local node scripts/browser-fixture.js
    $holdEnv = if ($Hold) { '1' } else { '0' }
    CheckedDocker run --name $haName --network $runId --label storagesystem.acceptance=$runId -p 127.0.0.1:3215:8123 --mount "type=volume,source=$configVolume,target=/config" --mount "type=bind,source=$integration,target=/config/custom_components/storagesystem,readonly" --mount "type=bind,source=$repo/scripts/verify-ha-runtime.py,target=/checks/verify-ha-runtime.py,readonly" -e HA_ACCEPTANCE_HOLD=$holdEnv --entrypoint python $HaImage /checks/verify-ha-runtime.py
} finally {
    # Only exact resources allocated by this invocation are removed.
    docker rm -f $haName $fixtureName 2>$null | Out-Null
    docker volume rm $configVolume 2>$null | Out-Null
    docker network rm $runId 2>$null | Out-Null
}
