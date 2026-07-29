[CmdletBinding()]
param(
  [string] $MatrixId = "overnight-$([DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss'))",
  [int] $Runs = 1000,
  [int] $Policies = 32,
  [int] $Tunings = 6,
  [int] $Shards = 8,
  [int] $SeedStart = 0,
  [string] $Scenario = ''
)

$ErrorActionPreference = 'Stop'
if ($Shards -lt 1) { throw 'Shards must be positive' }
$repo = Split-Path -Parent $PSScriptRoot
$project = 'mech-commander-lab'
$jobs = @()
$matrixDir = Join-Path $repo "data/lab/$MatrixId"
$manifestPath = Join-Path $matrixDir 'manifest.json'
$reportPath = Join-Path $matrixDir 'report.json'

try {
  if (Test-Path -LiteralPath $manifestPath) {
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    $expectedScenarios = if ($Scenario) { @($Scenario) } else { @('two-baked-slices', 'false-bottleneck', 'context-furnace', 'documentation-fortress') }
    $actualScenarios = @($manifest.scenarioIds)
    $manifestMatches = $manifest.matrixId -eq $MatrixId `
      -and $manifest.runsPerCell -eq $Runs `
      -and $manifest.policyCount -eq $Policies `
      -and $manifest.tuningCount -eq $Tunings `
      -and $manifest.shardCount -eq $Shards `
      -and $manifest.seedStart -eq $SeedStart `
      -and ($actualScenarios -join '|') -eq ($expectedScenarios -join '|')
    if (-not $manifestMatches) { throw "Existing matrix manifest does not match requested parameters: $manifestPath" }
  }
  if (Test-Path -LiteralPath $reportPath) {
    Write-Host "LAB NIGHT REUSE: data/lab/$MatrixId/report.json" -ForegroundColor Green
    return
  }
  for ($shard = 0; $shard -lt $Shards; $shard += 1) {
    $shardPath = Join-Path $matrixDir "shard-$($shard.ToString('0000')).jsonl.gz"
    $completePath = Join-Path $matrixDir "shard-$($shard.ToString('0000')).complete"
    if ((Test-Path -LiteralPath $shardPath) -and (Test-Path -LiteralPath $completePath) -and (Get-Item -LiteralPath $shardPath).Length -gt 0) {
      Write-Host "LAB SHARD REUSE: $shard" -ForegroundColor DarkGreen
      continue
    }
    $jobs += Start-Job -ArgumentList @($repo, $project, $MatrixId, $Runs, $Policies, $Tunings, $Shards, $shard, $SeedStart, $Scenario) -ScriptBlock {
      param($workdir, $composeProject, $matrix, $runCount, $policyCount, $tuningCount, $shardCount, $shardIndex, $seedStart, $scenarioId)
      Set-Location $workdir
      $ErrorActionPreference = 'SilentlyContinue'
      $args = @('-p', $composeProject, '-f', 'infra/compose.lab.yml', 'run', '--rm', '-e', "LAB_MATRIX_ID=$matrix", '-e', "LAB_RUNS=$runCount", '-e', "LAB_POLICIES=$policyCount", '-e', "LAB_TUNINGS=$tuningCount", '-e', "LAB_SHARDS=$shardCount", '-e', "LAB_SHARD=$shardIndex", '-e', "LAB_SEED_START=$seedStart", 'worker')
      if ($scenarioId) { $args = @('-p', $composeProject, '-f', 'infra/compose.lab.yml', 'run', '--rm', '-e', "LAB_MATRIX_ID=$matrix", '-e', "LAB_SCENARIO=$scenarioId", '-e', "LAB_RUNS=$runCount", '-e', "LAB_POLICIES=$policyCount", '-e', "LAB_TUNINGS=$tuningCount", '-e', "LAB_SHARDS=$shardCount", '-e', "LAB_SHARD=$shardIndex", '-e', "LAB_SEED_START=$seedStart", 'worker') }
      $output = (& docker compose @args 2>&1 | Out-String)
      Write-Output $output
      if ($LASTEXITCODE -ne 0) { throw "shard $shardIndex failed" }
    }
  }
  $jobs | Wait-Job | Out-Null
  $failed = @($jobs | Where-Object State -ne 'Completed')
  $jobs | Receive-Job -ErrorAction Continue
  if ($failed.Count) { throw "lab shards failed: $($failed.Id -join ', ')" }
  docker compose -p $project -f infra/compose.lab.yml run --rm worker node apps/lab/dist/main.js --report="data/lab/$MatrixId"
  if ($LASTEXITCODE -ne 0) { throw 'lab report failed' }
  Write-Host "LAB NIGHT PASS: data/lab/$MatrixId/report.json" -ForegroundColor Green
} finally {
  $jobs | Remove-Job -Force -ErrorAction SilentlyContinue
}
