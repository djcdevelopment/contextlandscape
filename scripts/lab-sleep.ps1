[CmdletBinding()]
param(
  [string] $CampaignId = "sleep-$([DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss'))",
  [int] $Shards = 12,
  [int] $MinimumFreeGiB = 50,
  [switch] $DryRun,
  [switch] $Canonical
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Push-Location $repo
try {
  $experiments = @(
    @{ Name = 'doctrine-landscape'; Scenario = ''; Runs = 1000; Policies = 64; Tunings = 1; SeedStart = 0 },
    @{ Name = 'tuning-train'; Scenario = ''; Runs = 1000; Policies = 32; Tunings = 6; SeedStart = 1000000 },
    @{ Name = 'tuning-holdout'; Scenario = ''; Runs = 1000; Policies = 32; Tunings = 6; SeedStart = 9000000 },
    @{ Name = 'deep-two-baked-slices'; Scenario = 'two-baked-slices'; Runs = 1000; Policies = 128; Tunings = 6; SeedStart = 17000000 },
    @{ Name = 'deep-false-bottleneck'; Scenario = 'false-bottleneck'; Runs = 1000; Policies = 128; Tunings = 6; SeedStart = 25000000 },
    @{ Name = 'deep-context-furnace'; Scenario = 'context-furnace'; Runs = 1000; Policies = 128; Tunings = 6; SeedStart = 33000000 },
    @{ Name = 'deep-documentation-fortress'; Scenario = 'documentation-fortress'; Runs = 1000; Policies = 128; Tunings = 6; SeedStart = 41000000 }
  )
  if ($DryRun) {
    $total = 0
    foreach ($experiment in $experiments) {
      $scenarioCount = if ($experiment.Scenario) { 1 } else { 4 }
      $runs = $scenarioCount * 4 * $experiment.Runs * $experiment.Policies * $experiment.Tunings
      $total += $runs
      Write-Host "$CampaignId-$($experiment.Name) runs=$runs seedStart=$($experiment.SeedStart)"
    }
    Write-Host "SLEEP CAMPAIGN DRY RUN: matrices=$($experiments.Count) totalRuns=$total shards=$Shards" -ForegroundColor Green
    return
  }
  $summaries = @()
  foreach ($experiment in $experiments) {
    $freeGiB = [math]::Round((Get-PSDrive -Name C).Free / 1GB, 1)
    if ($freeGiB -lt $MinimumFreeGiB) { throw "Stopping campaign with only $freeGiB GiB free" }
    $matrixId = "$CampaignId-$($experiment.Name)"
    Write-Host "START $matrixId freeGiB=$freeGiB" -ForegroundColor Cyan
    & "$PSScriptRoot/lab-night.ps1" -MatrixId $matrixId -Runs $experiment.Runs -Policies $experiment.Policies -Tunings $experiment.Tunings -Shards $Shards -SeedStart $experiment.SeedStart -Scenario $experiment.Scenario -Canonical:$Canonical
    $scenarioCount = if ($experiment.Scenario) { 1 } else { 4 }
    $expectedRuns = $scenarioCount * 4 * $experiment.Runs * $experiment.Policies * $experiment.Tunings
    & "$PSScriptRoot/lab-gate.ps1" -ReportPath "data/lab/$matrixId/report.json" -MinimumRuns $expectedRuns
    $report = Get-Content -LiteralPath "data/lab/$matrixId/report.json" -Raw | ConvertFrom-Json
    $summaries += [pscustomobject]@{
      name = $experiment.Name
      matrixId = $matrixId
      runs = $report.runs
      cells = $report.cells.Count
      paretoPolicies = $report.paretoFrontier.Count
      recommendations = $report.recommendations.Count
      manifestHash = $report.manifestHash
      reportHash = $report.reportHash
      sourceRevision = $report.provenance.sourceRevision
      modelHash = $report.provenance.modelHash
      reportPath = "data/lab/$matrixId/report.json"
      candidatePath = "data/lab/$matrixId/candidate-patches.json"
    }
  }
  $summaryPath = "data/lab/$CampaignId-summary.json"
  $summaries | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $summaryPath
  Write-Host "SLEEP CAMPAIGN PASS: $summaryPath" -ForegroundColor Green
} finally {
  Pop-Location
}
