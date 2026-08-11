[CmdletBinding()]
param(
  [string] $MatrixId = "overnight-$([DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss'))",
  [int] $Runs = 1000,
  [int] $Policies = 32,
  [int] $Tunings = 6,
  [int] $Shards = 8,
  [int] $SeedStart = 0,
  [string] $Scenario = '',
  [switch] $Canonical
)

$ErrorActionPreference = 'Stop'
if ($Shards -lt 1) { throw 'Shards must be positive' }
$repo = Split-Path -Parent $PSScriptRoot
$project = 'context-landscape-lab'
$jobs = @()
$matrixDir = Join-Path $repo "data/lab/$MatrixId"
$manifestPath = Join-Path $matrixDir 'manifest.json'
$reportPath = Join-Path $matrixDir 'report.json'

Push-Location $repo
try {
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'git is required for matrix provenance' }
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'docker is required for the sharded lab worker' }
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
  if ((Test-Path -LiteralPath $manifestPath) -and $manifest.schemaVersion -ne 2) {
    throw "Cannot resume legacy matrix without immutable provenance: $manifestPath"
  }

  $sourceRevision = (& git -C $repo rev-parse --verify HEAD).Trim()
  if ($LASTEXITCODE -ne 0 -or -not $sourceRevision) { throw 'Unable to capture Git revision' }
  $sourceTree = (& git -C $repo rev-parse --verify 'HEAD^{tree}').Trim()
  if ($LASTEXITCODE -ne 0 -or -not $sourceTree) { throw 'Unable to capture Git tree' }
  $statusOutput = (& git -C $repo status --porcelain=v1 --untracked-files=all | Out-String).Trim()
  if ($LASTEXITCODE -ne 0) { throw 'Unable to capture Git worktree state' }
  $workspaceDirty = if ($statusOutput) { 'true' } else { 'false' }
  if ($Canonical -and $workspaceDirty -eq 'true') { throw 'Canonical lab campaigns require a clean Git worktree' }
  $canonicalValue = if ($Canonical) { 'true' } else { 'false' }

  docker compose -p $project -f infra/compose.lab.yml build worker
  if ($LASTEXITCODE -ne 0) { throw 'Lab worker image build failed' }
  $imageReference = (& docker compose -p $project -f infra/compose.lab.yml config --images | Select-Object -Last 1).Trim()
  if ($LASTEXITCODE -ne 0 -or -not $imageReference) { throw 'Unable to resolve the built lab worker image name' }
  $imageDigest = (& docker image inspect $imageReference --format '{{.Id}}' | Select-Object -Last 1).Trim()
  if ($LASTEXITCODE -ne 0 -or $imageDigest -notmatch '^sha256:[0-9a-fA-F]{64}$') { throw 'Unable to identify the built lab worker image' }

  $provenanceEnv = @(
    '-e', "LAB_SOURCE_REVISION=$sourceRevision",
    '-e', "LAB_SOURCE_TREE=$sourceTree",
    '-e', "LAB_WORKSPACE_DIRTY=$workspaceDirty",
    '-e', 'LAB_REPOSITORY=djcdevelopment/contextlandscape',
    '-e', "LAB_IMAGE_DIGEST=$imageDigest"
  )
  $prepareArgs = @('-p', $project, '-f', 'infra/compose.lab.yml', 'run', '--rm') + $provenanceEnv
  if (Test-Path -LiteralPath $manifestPath) {
    $prepareArgs += @(
      'worker', 'node', 'apps/lab/dist/main.js', "--manifest=data/lab/$MatrixId/manifest.json",
      "--canonical=$canonicalValue", '--prepare=true'
    )
  } else {
    $prepareArgs += @(
      'worker', 'node', 'apps/lab/dist/main.js',
      "--matrix=$MatrixId", "--runs=$Runs", "--policies=$Policies", "--tunings=$Tunings",
      "--shards=$Shards", "--seed-start=$SeedStart", "--canonical=$canonicalValue", '--prepare=true'
    )
    if ($Scenario) { $prepareArgs += "--scenario=$Scenario" }
  }
  & docker compose @prepareArgs
  if ($LASTEXITCODE -ne 0) { throw 'Unable to freeze or validate matrix manifest' }
  $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  if ($manifest.schemaVersion -ne 2 -or -not $manifest.provenance.manifestHash) { throw 'Prepared manifest has no immutable provenance' }

  for ($shard = 0; $shard -lt $Shards; $shard += 1) {
    $shardPath = Join-Path $matrixDir "shard-$($shard.ToString('0000')).jsonl.gz"
    $completePath = Join-Path $matrixDir "shard-$($shard.ToString('0000')).complete"
    if ((Test-Path -LiteralPath $shardPath) -and (Test-Path -LiteralPath $completePath) -and (Get-Item -LiteralPath $shardPath).Length -gt 0) {
      try {
        $completion = Get-Content -LiteralPath $completePath -Raw | ConvertFrom-Json
        $actualHash = "sha256:$((Get-FileHash -LiteralPath $shardPath -Algorithm SHA256).Hash.ToLowerInvariant())"
        if ($completion.manifestHash -eq $manifest.provenance.manifestHash -and $completion.shardHash -eq $actualHash) {
          Write-Host "LAB SHARD REUSE: $shard" -ForegroundColor DarkGreen
          continue
        }
      } catch { Write-Host "LAB SHARD REBUILD: $shard" -ForegroundColor Yellow }
    }
    $jobs += Start-Job -ArgumentList @($repo, $project, $MatrixId, $Shards, $shard, $sourceRevision, $sourceTree, $workspaceDirty, $imageDigest, $canonicalValue) -ScriptBlock {
      param($workdir, $composeProject, $matrix, $shardCount, $shardIndex, $revision, $tree, $dirty, $image, $canonical)
      Set-Location $workdir
      $ErrorActionPreference = 'SilentlyContinue'
      $args = @(
        '-p', $composeProject, '-f', 'infra/compose.lab.yml', 'run', '--rm',
        '-e', "LAB_SOURCE_REVISION=$revision", '-e', "LAB_SOURCE_TREE=$tree", '-e', "LAB_WORKSPACE_DIRTY=$dirty",
        '-e', 'LAB_REPOSITORY=djcdevelopment/contextlandscape', '-e', "LAB_IMAGE_DIGEST=$image",
        'worker', 'node', 'apps/lab/dist/main.js', "--manifest=data/lab/$matrix/manifest.json",
        "--shards=$shardCount", "--shard=$shardIndex", "--canonical=$canonical"
      )
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
  $auditArgs = @('-p', $project, '-f', 'infra/compose.lab.yml', 'run', '--rm') + $provenanceEnv + @(
    'worker', 'node', 'apps/lab/dist/main.js', "--audit=data/lab/$MatrixId"
  )
  if ($Canonical) { $auditArgs += '--strict=true' }
  & docker compose @auditArgs
  if ($LASTEXITCODE -ne 0) { throw 'lab provenance audit failed' }
  Write-Host "LAB NIGHT PASS: data/lab/$MatrixId/report.json" -ForegroundColor Green
} finally {
  $jobs | Remove-Job -Force -ErrorAction SilentlyContinue
  Pop-Location
}
