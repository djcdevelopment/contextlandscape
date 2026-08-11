param(
  [string] $CampaignDir = 'data/lab/attention-v3-20260810-9mm',
  [string] $AnalysisDir = 'data/lab/attention-v2-v3-paired-analysis',
  [int] $PollSeconds = 60,
  [int] $MaximumHours = 48
)

$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$campaignPath = [IO.Path]::GetFullPath((Join-Path $repoRoot $CampaignDir))
$analysisPath = [IO.Path]::GetFullPath((Join-Path $repoRoot $AnalysisDir))
$labRoot = [IO.Path]::GetFullPath((Join-Path $repoRoot 'data/lab'))
if (!$campaignPath.StartsWith($labRoot + [IO.Path]::DirectorySeparatorChar) -or !$analysisPath.StartsWith($labRoot + [IO.Path]::DirectorySeparatorChar)) {
  throw 'CampaignDir and AnalysisDir must resolve beneath data/lab'
}
$deadline = [DateTime]::UtcNow.AddHours($MaximumHours)
$reportPath = Join-Path $campaignPath 'report.json'
while (!(Test-Path -LiteralPath $reportPath -PathType Leaf)) {
  if ([DateTime]::UtcNow -ge $deadline) { throw "Timed out waiting for $reportPath" }
  Start-Sleep -Seconds $PollSeconds
}
$report = Get-Content -LiteralPath $reportPath -Raw | ConvertFrom-Json
if ($report.runs -ne 9216000 -or @($report.shards).Count -ne 12) { throw 'V3 completion report is not the frozen 9.216M / 12-shard campaign' }
Push-Location $repoRoot
try {
  & node scripts/analyze-attention-v2-v3-paired.mjs "--v3=$reportPath" "--out=$analysisPath"
  if ($LASTEXITCODE -ne 0) { throw 'Paired analysis failed' }
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/render-attention-v2-charts.ps1 -AnalysisDir $AnalysisDir
  if ($LASTEXITCODE -ne 0) { throw 'Paired chart rendering failed' }
} finally {
  Pop-Location
}
