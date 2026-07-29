[CmdletBinding()]
param(
  [string] $BaseUrl = 'http://127.0.0.1:9080'
)

$ErrorActionPreference = 'Stop'

function Assert-Equal([object] $Actual, [object] $Expected, [string] $Label) {
  if ($Actual -ne $Expected) { throw "$Label expected '$Expected' but got '$Actual'" }
  Write-Host "PASS  $Label = $Actual" -ForegroundColor Green
}

function Post-Order([string] $MatchId, [string] $Key, [hashtable] $Order) {
  $body = $Order | ConvertTo-Json -Compress
  Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/matches/$MatchId/orders" -Headers @{ 'idempotency-key' = $Key } -ContentType 'application/json' -Body $body
}

Write-Host "Checking $BaseUrl" -ForegroundColor Cyan
$health = Invoke-RestMethod "$BaseUrl/health/ready"
Assert-Equal $health.status 'ok' 'health status'
Assert-Equal $health.persistence 'postgres' 'persistence mode'

$version = Invoke-RestMethod "$BaseUrl/version"
Write-Host "PASS  release=$($version.releaseId) scenario=$($version.scenario)" -ForegroundColor Green

$match = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/matches" -ContentType 'application/json' -Body '{}'
$matchId = $match.matchId
Write-Host "Created $matchId" -ForegroundColor Cyan
Assert-Equal $match.objectiveProgress 0 'initial objective progress'
Assert-Equal $match.commanderEnergy 6 'initial commander energy'

$scout = Post-Order $matchId 'smoke-scout-1' @{ unitId = 'scout-01'; action = 'scout'; fireMode = 'single' }
$duplicate = Post-Order $matchId 'smoke-scout-1' @{ unitId = 'scout-01'; action = 'scout'; fireMode = 'single' }
Assert-Equal $scout.projection.slot 1 'first order slot'
Assert-Equal $duplicate.projection.slot 1 'duplicate order slot'
Assert-Equal $duplicate.events.Count 2 'duplicate response event count'
Assert-Equal $scout.projection.contractExposed $true 'boundary exposed by scout'

$contract = Post-Order $matchId 'smoke-contract-1' @{ unitId = 'line-01'; action = 'build_contract'; fireMode = 'single' }
$implement = Post-Order $matchId 'smoke-implement-1' @{ unitId = 'line-01'; action = 'implement'; fireMode = 'semi' }
$review = Post-Order $matchId 'smoke-review-1' @{ unitId = 'line-02'; action = 'review'; fireMode = 'single' }
$victory = Post-Order $matchId 'smoke-full-send-1' @{ unitId = 'line-01'; action = 'full_send'; fireMode = 'full' }

Assert-Equal $victory.projection.status 'victory' 'intended doctrine result'
Assert-Equal $victory.projection.commanderEnergy 0 'energy spent exactly'
Assert-Equal $victory.projection.rollbackVerified $true 'rollback verified'

$persisted = Invoke-RestMethod "$BaseUrl/api/matches/$matchId"
Assert-Equal $persisted.status 'victory' 'persisted match status'
Assert-Equal $persisted.eventSequence 10 'persisted event sequence'
Assert-Equal $persisted.events.Count 10 'persisted event history'

Write-Host "SMOKE PASS: $matchId" -ForegroundColor Green
