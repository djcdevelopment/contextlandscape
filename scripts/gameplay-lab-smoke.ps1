[CmdletBinding()]
param(
  [string] $BaseUrl = 'http://127.0.0.1:9080'
)

$ErrorActionPreference = 'Stop'

function Assert-Equal([object] $Actual, [object] $Expected, [string] $Label) {
  if ($Actual -ne $Expected) { throw "$Label expected '$Expected' but got '$Actual'" }
  Write-Host "PASS  $Label = $Actual" -ForegroundColor Green
}

function Assert-True([bool] $Condition, [string] $Label) {
  if (-not $Condition) { throw "$Label expected true" }
  Write-Host "PASS  $Label" -ForegroundColor Green
}

function Post-Json([string] $Uri, [object] $Body) {
  Invoke-RestMethod -Method Post -Uri $Uri -ContentType 'application/json' -Body ($Body | ConvertTo-Json -Depth 12 -Compress)
}

function Post-Order([string] $MatchId, [string] $Key, [string] $UnitId, [string] $Action, [string] $FireMode = 'semi') {
  Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/matches/$MatchId/orders" `
    -Headers @{ 'idempotency-key' = $Key } `
    -ContentType 'application/json' `
    -Body (@{ unitId = $UnitId; action = $Action; fireMode = $FireMode } | ConvertTo-Json -Compress)
}

function Assert-ReconstructionGated([string] $MatchId) {
  try {
    Invoke-RestMethod "$BaseUrl/api/matches/$MatchId/reconstruction" | Out-Null
    throw 'reconstruction unexpectedly available before pre-review'
  } catch {
    if ($_.Exception.Message -eq 'reconstruction unexpectedly available before pre-review') { throw }
    $status = [int]$_.Exception.Response.StatusCode
    Assert-Equal $status 409 'reconstruction pre-review gate'
  }
}

Write-Host "Gameplay lab smoke: $BaseUrl" -ForegroundColor Cyan
$health = Invoke-RestMethod "$BaseUrl/health/ready"
Assert-Equal $health.status 'ok' 'health status'

$catalogResponse = Invoke-RestMethod "$BaseUrl/api/gameplay-labs"
$catalog = if ($catalogResponse -is [array]) { $catalogResponse } else { @($catalogResponse) }
Assert-Equal $catalog.Count 5 'gameplay lab registry count'
Assert-True (-not ($catalog[0].PSObject.Properties.Name -contains 'hypothesis')) 'catalog is blinded'

$participantId = "gameplay-lab-smoke-$([guid]::NewGuid())"
$payload = Post-Json "$BaseUrl/api/gameplay-labs/GL-001/sessions" @{ participantId = $participantId }
$sessionId = $payload.session.labSessionId
Assert-Equal $payload.session.trialCount 3 'GL-001 trial count'
Assert-True (-not (($payload.session | ConvertTo-Json -Depth 12) -match 'variantId')) 'session treatment mapping is blinded'
Assert-Equal $payload.projection.rulesTuning.tuningId 'blinded' 'initial tuning projection is redacted'

for ($index = 0; $index -lt 3; $index += 1) {
  $trial = $payload.session.currentTrial
  $matchId = $trial.matchId
  Write-Host "Running trial $($trial.variantToken) ($($index + 1)/3)" -ForegroundColor Cyan

  Post-Order $matchId "$sessionId-$index-scout" 'scout-01' 'scout' 'single' | Out-Null
  Post-Order $matchId "$sessionId-$index-contract" 'line-01' 'build_contract' 'single' | Out-Null
  Post-Order $matchId "$sessionId-$index-implement" 'line-01' 'implement' 'semi' | Out-Null
  $terminal = Post-Order $matchId "$sessionId-$index-send" 'line-01' 'full_send' 'full'
  Assert-Equal $terminal.projection.status 'victory' "trial $($trial.variantToken) terminal status"
  Assert-Equal $terminal.projection.rulesTuning.tuningId 'blinded' "trial $($trial.variantToken) order response is redacted"

  $resumedMatch = Invoke-RestMethod "$BaseUrl/api/matches/$matchId"
  Assert-Equal $resumedMatch.rulesTuning.tuningId 'blinded' "trial $($trial.variantToken) direct match response is redacted"

  $payload = Post-Json "$BaseUrl/api/gameplay-lab-sessions/$sessionId/trials/$($trial.trialId)/complete" @{}
  Assert-ReconstructionGated $matchId

  $payload = Post-Json "$BaseUrl/api/gameplay-lab-sessions/$sessionId/reviews" @{
    phase = 'pre'
    trialId = $trial.trialId
    answers = @{
      bindingConstraint = 'commander energy'
      decisiveDecision = 'the final commitment'
      replayChange = 'forecast the complete route'
      earnedRating = 4
      confidenceRating = 4
    }
  }
  $reconstruction = Invoke-RestMethod "$BaseUrl/api/gameplay-lab-sessions/$sessionId/trials/$($trial.trialId)/reconstruction"
  Assert-Equal $reconstruction.status 'victory' "trial $($trial.variantToken) reconstruction"

  $payload = Post-Json "$BaseUrl/api/gameplay-lab-sessions/$sessionId/reviews" @{
    phase = 'post'
    trialId = $trial.trialId
    answers = @{
      explanationChanged = $true
      updatedExplanation = 'The contract made the bounded commitment affordable.'
      missingOrMisleading = 'Nominal costs did not expose conditional costs.'
    }
  }
}

Assert-Equal $payload.session.status 'awaiting_final_review' 'final comparison stage'
$tokens = @($payload.session.completedTrialTokens)
$payload = Post-Json "$BaseUrl/api/gameplay-lab-sessions/$sessionId/reviews" @{
  phase = 'final'
  answers = @{
    clearestTrialToken = $tokens[0]
    fairestTrialToken = $tokens[1]
    mostInterestingTrialToken = $tokens[2]
    comparisonNotes = 'The anonymous comparison made the energy edge visible.'
    disposition = 'revise'
    dispositionRationale = 'Keep the edge and expose conditional command costs.'
  }
}

Assert-Equal $payload.session.status 'complete' 'session completion'
Assert-Equal @($payload.session.revealedVariants).Count 3 'treatment reveal count'
Assert-True ($null -ne $payload.exportPaths.followUpMatrix) 'follow-up matrix path prepared'

$bundle = Invoke-RestMethod "$BaseUrl/api/gameplay-lab-sessions/$sessionId/export"
Assert-Equal @($bundle.matches).Count 3 'exported deterministic matches'
Assert-True (@($bundle.timeline).Count -gt @($bundle.observations).Count) 'joined export timeline'
Assert-Equal @($bundle.followUpMatrix.tuningOverrides).Count 2 'follow-up control/treatment count'
$workbook = Invoke-RestMethod "$BaseUrl/api/gameplay-lab-sessions/$sessionId/export?format=markdown"
Assert-True ($workbook.StartsWith('# GL-001')) 'Markdown workbook export'

$zoo = Post-Json "$BaseUrl/api/gameplay-labs/GL-005/sessions" @{ participantId = "$participantId-zoo" }
$zooSessionId = $zoo.session.labSessionId
$zooTrial = $zoo.session.currentTrial
Assert-True ($null -ne $zooTrial.doctrineCard) 'Policy Zoo doctrine card present'
Assert-True (-not ($zooTrial.doctrineCard.PSObject.Properties.Name -contains 'policyId')) 'Policy Zoo internal policy ID is blinded'
Assert-True (-not ($zooTrial.doctrineCard.PSObject.Properties.Name -contains 'category')) 'Policy Zoo synthetic category is blinded'
Post-Order $zooTrial.matchId "$zooSessionId-send-1" 'line-01' 'full_send' 'full' | Out-Null
Post-Order $zooTrial.matchId "$zooSessionId-cool" 'line-01' 'consolidate' 'semi' | Out-Null
$zooTerminal = Post-Order $zooTrial.matchId "$zooSessionId-send-2" 'line-01' 'full_send' 'semi'
Assert-Equal $zooTerminal.projection.status 'victory' 'Policy Zoo trial terminal status'
Post-Json "$BaseUrl/api/gameplay-lab-sessions/$zooSessionId/trials/$($zooTrial.trialId)/complete" @{} | Out-Null

try {
  Post-Json "$BaseUrl/api/gameplay-lab-sessions/$zooSessionId/reviews" @{
    phase = 'pre'
    trialId = $zooTrial.trialId
    answers = @{
      bindingConstraint = 'heat'
      decisiveDecision = 'cooling between bursts'
      replayChange = 'inspect the doctrine before committing'
      earnedRating = 4
      confidenceRating = 4
    }
  } | Out-Null
  throw 'Policy Zoo review unexpectedly accepted without doctrine labels'
} catch {
  if ($_.Exception.Message -eq 'Policy Zoo review unexpectedly accepted without doctrine labels') { throw }
  Assert-Equal ([int]$_.Exception.Response.StatusCode) 400 'Policy Zoo doctrine label requirement'
}

$zoo = Post-Json "$BaseUrl/api/gameplay-lab-sessions/$zooSessionId/reviews" @{
  phase = 'pre'
  trialId = $zooTrial.trialId
  answers = @{
    bindingConstraint = 'heat'
    decisiveDecision = 'cooling between bursts'
    replayChange = 'inspect the doctrine before committing'
    earnedRating = 4
    confidenceRating = 4
    doctrineFollowed = $false
    doctrineClassification = 'incoherent'
    doctrineDecisionRationale = 'The proposed opening did not address the visible heat constraint.'
  }
}
Assert-Equal $zoo.session.currentTrial.status 'reconstruction_available' 'Policy Zoo labeled review accepted'

Write-Host "GAMEPLAY LAB SMOKE PASS: $sessionId (Policy Zoo probe: $zooSessionId)" -ForegroundColor Green
