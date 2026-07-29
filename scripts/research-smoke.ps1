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

Write-Host "Research smoke: $BaseUrl" -ForegroundColor Cyan
$scenarioResponse = Invoke-RestMethod "$BaseUrl/api/scenarios"
$scenarios = if ($scenarioResponse -is [array]) { $scenarioResponse } elseif ($null -ne $scenarioResponse.value) { @($scenarioResponse.value) } else { @($scenarioResponse) }
Assert-Equal $scenarios.Count 4 'scenario registry count'

$match = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/matches" -ContentType 'application/json' -Body (@{ scenarioId = 'false-bottleneck' } | ConvertTo-Json -Compress)
$matchId = $match.matchId
Assert-Equal $match.scenarioId 'false-bottleneck' 'research scenario selected'

Post-Order $matchId 'research-scout-1' @{ unitId = 'scout-01'; action = 'scout'; fireMode = 'single' } | Out-Null
Post-Order $matchId 'research-implement-1' @{ unitId = 'line-01'; action = 'implement'; fireMode = 'semi' } | Out-Null
$result = Post-Order $matchId 'research-contract-1' @{ unitId = 'line-01'; action = 'build_contract'; fireMode = 'single' }
Assert-Equal $result.projection.status 'victory' 'research scenario deterministic result'

$reconstruction = Invoke-RestMethod "$BaseUrl/api/matches/$matchId/reconstruction"
Assert-Equal $reconstruction.status 'victory' 'reconstruction status'
if ($null -eq $reconstruction.eventTypes.'bottleneck.measured') { throw 'reconstruction missing bottleneck.measured event' }
Write-Host "PASS  reconstruction counterfactual=$($reconstruction.counterfactual.action)" -ForegroundColor Green

$observation = @{ sessionId = "research-smoke-$([guid]::NewGuid())"; matchId = $matchId; eventType = 'research.smoke'; occurredAt = [DateTime]::UtcNow.ToString('o'); data = @{ source = 'script' } } | ConvertTo-Json -Compress
$accepted = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/research/observations" -ContentType 'application/json' -Body $observation
Assert-Equal $accepted.accepted $true 'observation accepted'

$challenge = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/challenges" -ContentType 'application/json' -Body (@{ scenarioId = 'context-furnace'; creatorId = 'researcher' } | ConvertTo-Json -Compress)
Assert-Equal $challenge.challenge.status 'open' 'challenge created'
$acceptedChallenge = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/challenges/$($challenge.challenge.challengeId)/accept" -ContentType 'application/json' -Body (@{ opponentId = 'opponent' } | ConvertTo-Json -Compress)
Assert-Equal $acceptedChallenge.status 'accepted' 'challenge accepted'

Write-Host "RESEARCH SMOKE PASS: $matchId" -ForegroundColor Green
