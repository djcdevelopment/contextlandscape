[CmdletBinding()]
param(
  [ValidateSet('all', 'stationary-train', 'capacity-train', 'holdout')]
  [string] $AttentionCampaign = 'all',
  [string] $MatrixId = "attention-$([DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss'))",
  [int] $Runs = 0,
  [int] $Shards = 12,
  [Nullable[int]] $SeedStart = $null,
  [string] $Manifest = '',
  [int] $MinimumFreeGiB = 20,
  [switch] $Canonical,
  [switch] $Prepare,
  [switch] $DryRun
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$project = 'context-landscape-attention-lab'
$campaignJobs = @()
$matrixArgumentSpecified = $PSBoundParameters.ContainsKey('MatrixId')
$runsArgumentSpecified = $PSBoundParameters.ContainsKey('Runs')
$shardsArgumentSpecified = $PSBoundParameters.ContainsKey('Shards')
$seedStartArgumentSpecified = $PSBoundParameters.ContainsKey('SeedStart')

function Get-PlannedRuns {
  param($Experiment)
  return [int64]$Experiment.RunsPerSeed * [int64]$Experiment.SeedsPerCell
}

function Get-ManifestRunCount {
  param($Document)
  [int64]$cells = 0
  foreach ($matchup in @($Document.matchups)) {
    $cells += [int64]@($matchup.variantIds).Count * [int64]@($matchup.playerOnePolicyIds).Count * [int64]@($matchup.playerTwoPolicyIds).Count
  }
  return $cells * [int64]$Document.seedsPerCell
}

function Assert-SafeMatrixId {
  param([string] $Id)
  if ($Id -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]*$') { throw "Unsafe attention matrix id: $Id" }
}

function Assert-FreeSpace {
  $rootPath = [System.IO.Path]::GetPathRoot($repo)
  $drive = [System.IO.DriveInfo]::new($rootPath)
  $freeGiB = [math]::Round($drive.AvailableFreeSpace / 1GB, 1)
  if ($freeGiB -lt $MinimumFreeGiB) {
    throw "Attention campaign requires at least $MinimumFreeGiB GiB free; $freeGiB GiB is available"
  }
  Write-Host "ATTENTION DISK CHECK: freeGiB=$freeGiB requiredGiB=$MinimumFreeGiB" -ForegroundColor DarkCyan
}

function Invoke-GitChecked {
  param([string[]] $Arguments, [string] $Failure)
  $output = (& git @Arguments | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or -not $output) { throw $Failure }
  return $output
}

function Invoke-DockerChecked {
  param([object[]] $Arguments, [string] $Failure)
  & docker compose @Arguments
  if ($LASTEXITCODE -ne 0) { throw $Failure }
}

function Get-ExpectedShardCounts {
  param($Document)
  $counts = [long[]]::new([int]$Document.shardCount)
  [long]$blockIndex = 0
  foreach ($matchup in @($Document.matchups)) {
    $policyRuns = [long]@($matchup.playerOnePolicyIds).Count * [long]@($matchup.playerTwoPolicyIds).Count
    foreach ($variantId in @($matchup.variantIds)) {
      for ($seedOffset = 0; $seedOffset -lt [int]$Document.seedsPerCell; $seedOffset += 1) {
        $assignedShard = [int]($blockIndex % [long]$Document.shardCount)
        $counts[$assignedShard] += $policyRuns
        $blockIndex += 1
      }
    }
  }
  return ,$counts
}

function Move-ToQuarantine {
  param([string] $Path)
  if (-not (Test-Path -LiteralPath $Path)) { return }
  $suffix = "$([DateTime]::UtcNow.ToString('yyyyMMddHHmmss'))-$([Guid]::NewGuid().ToString('N'))"
  $destination = "$Path.invalid-$suffix"
  Move-Item -LiteralPath $Path -Destination $destination
  Write-Host "ATTENTION ARTIFACT QUARANTINED: $destination" -ForegroundColor Yellow
}

function Test-ReusableShard {
  param($Experiment, [int] $ShardIndex)
  $stem = "shard-$($ShardIndex.ToString('0000'))"
  $shardPath = Join-Path $Experiment.MatrixDir "$stem.jsonl.gz"
  $completePath = Join-Path $Experiment.MatrixDir "$stem.complete"
  if (-not (Test-Path -LiteralPath $shardPath) -or -not (Test-Path -LiteralPath $completePath)) { return $false }
  if ((Get-Item -LiteralPath $shardPath).Length -le 0) { return $false }
  try {
    $completion = Get-Content -LiteralPath $completePath -Raw | ConvertFrom-Json
    $actualHash = "sha256:$((Get-FileHash -LiteralPath $shardPath -Algorithm SHA256).Hash.ToLowerInvariant())"
    return $completion.schemaVersion -eq 1 `
      -and $completion.matrixKind -eq 'attention-command' `
      -and $completion.matrixId -eq $Experiment.MatrixId `
      -and $completion.shardIndex -eq $ShardIndex `
      -and $completion.recordCount -eq $Experiment.ExpectedShardCounts[$ShardIndex] `
      -and $completion.manifestHash -eq $Experiment.ManifestDocument.provenance.manifestHash `
      -and -not [string]::IsNullOrWhiteSpace([string]$completion.provenanceId) `
      -and $completion.shardHash -eq $actualHash
  } catch {
    return $false
  }
}

function Assert-ExactArtifactNames {
  param($Experiment)
  $expectedShards = @{}
  $expectedMarkers = @{}
  for ($index = 0; $index -lt $Experiment.ShardCount; $index += 1) {
    $stem = "shard-$($index.ToString('0000'))"
    $expectedShards["$stem.jsonl.gz"] = $true
    $expectedMarkers["$stem.complete"] = $true
  }
  foreach ($file in @(Get-ChildItem -LiteralPath $Experiment.MatrixDir -File -ErrorAction SilentlyContinue)) {
    if ($file.Name -match '^shard-\d+\.jsonl\.gz$' -and -not $expectedShards.ContainsKey($file.Name)) {
      throw "Unexpected attention shard prevents safe resume: $($file.FullName)"
    }
    if ($file.Name -match '^shard-\d+\.complete$' -and -not $expectedMarkers.ContainsKey($file.Name)) {
      throw "Unexpected attention completion marker prevents safe resume: $($file.FullName)"
    }
  }
}

function New-DefaultExperiments {
  $definitions = @(
    @{ Kind = 'stationary-train'; RunsPerSeed = 1920; DefaultSeeds = 250; DefaultSeedStart = 100000 },
    @{ Kind = 'capacity-train'; RunsPerSeed = 576; DefaultSeeds = 250; DefaultSeedStart = 100000 },
    @{ Kind = 'holdout'; RunsPerSeed = 10; DefaultSeeds = 5000; DefaultSeedStart = 9000000 }
  )
  $selected = if ($AttentionCampaign -eq 'all') { $definitions } else { @($definitions | Where-Object Kind -eq $AttentionCampaign) }
  foreach ($definition in $selected) {
    $id = if ($AttentionCampaign -eq 'all') { "$MatrixId-$($definition.Kind)" } else { $MatrixId }
    Assert-SafeMatrixId $id
    [pscustomobject]@{
      Kind = $definition.Kind
      MatrixId = $id
      SeedsPerCell = if ($Runs -gt 0) { $Runs } else { $definition.DefaultSeeds }
      RunsPerSeed = $definition.RunsPerSeed
      SeedStart = if ($null -ne $SeedStart) { [int]$SeedStart } else { $definition.DefaultSeedStart }
      ShardCount = $Shards
      MatrixDir = Join-Path $repo "data/lab/$id"
      ManifestPath = Join-Path $repo "data/lab/$id/manifest.json"
      ManifestRelative = "data/lab/$id/manifest.json"
      ManifestDocument = $null
      ExpectedShardCounts = $null
    }
  }
}

function New-ManifestExperiment {
  $requestedPath = if ([System.IO.Path]::IsPathRooted($Manifest)) { $Manifest } else { Join-Path $repo $Manifest }
  $resolvedPath = (Resolve-Path -LiteralPath $requestedPath).Path
  $labRoot = [System.IO.Path]::GetFullPath((Join-Path $repo 'data/lab'))
  $relativePath = [System.IO.Path]::GetRelativePath($labRoot, $resolvedPath)
  if ($relativePath.StartsWith('..') -or [System.IO.Path]::GetFileName($resolvedPath) -ne 'manifest.json') {
    throw 'Attention resume manifests must be data/lab/<matrix-id>/manifest.json'
  }
  $document = Get-Content -LiteralPath $resolvedPath -Raw | ConvertFrom-Json
  if ($document.matrixKind -ne 'attention-command' -or -not $document.provenance.manifestHash) {
    throw "Not a sealed attention manifest: $resolvedPath"
  }
  Assert-SafeMatrixId ([string]$document.matrixId)
  if ($matrixArgumentSpecified -and $MatrixId -ne $document.matrixId) { throw 'Requested matrix id does not match the resume manifest' }
  if ($runsArgumentSpecified -and $Runs -ne $document.seedsPerCell) { throw 'Requested runs do not match the resume manifest' }
  if ($shardsArgumentSpecified -and $Shards -ne $document.shardCount) { throw 'Requested shards do not match the resume manifest' }
  if ($seedStartArgumentSpecified -and $SeedStart -ne $document.seedStart) { throw 'Requested seed start does not match the resume manifest' }
  if ($AttentionCampaign -ne 'all' -and $AttentionCampaign -ne $document.campaignKind) { throw 'Requested attention campaign does not match the resume manifest' }
  return [pscustomobject]@{
    Kind = [string]$document.campaignKind
    MatrixId = [string]$document.matrixId
    SeedsPerCell = [int]$document.seedsPerCell
    RunsPerSeed = [int64](Get-ManifestRunCount $document) / [int64]$document.seedsPerCell
    SeedStart = [int]$document.seedStart
    ShardCount = [int]$document.shardCount
    MatrixDir = Split-Path -Parent $resolvedPath
    ManifestPath = $resolvedPath
    ManifestRelative = ([System.IO.Path]::GetRelativePath($repo, $resolvedPath) -replace '\\', '/')
    ManifestDocument = $document
    ExpectedShardCounts = $null
  }
}

if ($runsArgumentSpecified -and $Runs -lt 1) { throw 'Runs must be positive when supplied' }
if ($Shards -lt 1) { throw 'Shards must be positive' }
if ($MinimumFreeGiB -lt 20) { throw 'MinimumFreeGiB cannot be lower than the required 20 GiB guard' }
if ($Manifest -and $AttentionCampaign -eq 'all' -and $PSBoundParameters.ContainsKey('AttentionCampaign')) {
  throw 'Select one attention campaign when resuming an explicit manifest'
}

$experiments = if ($Manifest) { @(New-ManifestExperiment) } else { @(New-DefaultExperiments) }

if ($DryRun) {
  [int64]$totalRuns = 0
  foreach ($experiment in $experiments) {
    $plannedRuns = Get-PlannedRuns $experiment
    $totalRuns += $plannedRuns
    Write-Host "$($experiment.Kind) matrix=$($experiment.MatrixId) runs=$plannedRuns seedsPerCell=$($experiment.SeedsPerCell) shards=$($experiment.ShardCount) seedStart=$($experiment.SeedStart)"
  }
  Write-Host "ATTENTION CAMPAIGN DRY RUN: matrices=$(@($experiments).Count) totalRuns=$totalRuns shards=$Shards" -ForegroundColor Green
  return
}

Push-Location $repo
try {
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'git is required for attention matrix provenance' }
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'docker is required for attention matrix workers' }
  Assert-FreeSpace

  $sourceRevision = Invoke-GitChecked @('-C', $repo, 'rev-parse', '--verify', 'HEAD') 'Unable to capture Git revision'
  $sourceTree = Invoke-GitChecked @('-C', $repo, 'rev-parse', '--verify', 'HEAD^{tree}') 'Unable to capture Git tree'
  if ($sourceRevision -notmatch '^[0-9a-fA-F]{40,64}$' -or $sourceTree -notmatch '^[0-9a-fA-F]{40,64}$') {
    throw 'Git returned an invalid source identity'
  }
  $statusOutput = (& git -C $repo status --porcelain=v1 --untracked-files=all | Out-String).Trim()
  if ($LASTEXITCODE -ne 0) { throw 'Unable to capture Git worktree state' }
  $workspaceDirty = if ($statusOutput) { 'true' } else { 'false' }
  if ($Canonical -and $workspaceDirty -eq 'true') { throw 'Canonical attention campaigns require a clean Git worktree' }
  $canonicalValue = if ($Canonical) { 'true' } else { 'false' }

  Invoke-DockerChecked @('-p', $project, '-f', 'infra/compose.lab.yml', 'build', 'worker') 'Attention worker image build failed'
  $imageReference = (& docker compose -p $project -f infra/compose.lab.yml config --images | Select-Object -Last 1).Trim()
  if ($LASTEXITCODE -ne 0 -or -not $imageReference) { throw 'Unable to resolve the built attention worker image name' }
  $imageDigest = (& docker image inspect $imageReference --format '{{.Id}}' | Select-Object -Last 1).Trim()
  if ($LASTEXITCODE -ne 0 -or $imageDigest -notmatch '^sha256:[0-9a-fA-F]{64}$') {
    throw 'Unable to identify the explicitly built attention worker image'
  }

  $provenanceEnv = @(
    '-e', "LAB_SOURCE_REVISION=$($sourceRevision.ToLowerInvariant())",
    '-e', "LAB_SOURCE_TREE=$($sourceTree.ToLowerInvariant())",
    '-e', "LAB_WORKSPACE_DIRTY=$workspaceDirty",
    '-e', 'LAB_REPOSITORY=djcdevelopment/contextlandscape',
    '-e', "LAB_IMAGE_DIGEST=$($imageDigest.ToLowerInvariant())"
  )

  # Freeze or validate every manifest before starting even one shard.
  foreach ($experiment in $experiments) {
    $prepareArgs = @('-p', $project, '-f', 'infra/compose.lab.yml', 'run', '--rm') + $provenanceEnv
    if (Test-Path -LiteralPath $experiment.ManifestPath) {
      $prepareArgs += @(
        'worker', 'node', 'apps/lab/dist/main.js', "--manifest=$($experiment.ManifestRelative)",
        "--canonical=$canonicalValue", '--prepare=true'
      )
    } else {
      $prepareArgs += @(
        'worker', 'node', 'apps/lab/dist/main.js', "--attention-campaign=$($experiment.Kind)",
        "--matrix=$($experiment.MatrixId)", "--runs=$($experiment.SeedsPerCell)",
        "--shards=$($experiment.ShardCount)", "--seed-start=$($experiment.SeedStart)",
        "--canonical=$canonicalValue", '--prepare=true'
      )
    }
    Invoke-DockerChecked $prepareArgs "Unable to freeze or validate attention manifest $($experiment.MatrixId)"
    $document = Get-Content -LiteralPath $experiment.ManifestPath -Raw | ConvertFrom-Json
    if ($document.matrixKind -ne 'attention-command' -or -not $document.provenance.manifestHash) {
      throw "Prepared attention manifest has no immutable provenance: $($experiment.ManifestPath)"
    }
    if ($document.matrixId -ne $experiment.MatrixId -or $document.campaignKind -ne $experiment.Kind `
        -or $document.seedsPerCell -ne $experiment.SeedsPerCell -or $document.shardCount -ne $experiment.ShardCount `
        -or $document.seedStart -ne $experiment.SeedStart) {
      throw "Prepared attention manifest does not match requested parameters: $($experiment.ManifestPath)"
    }
    if ($Canonical -and -not $document.provenance.canonical) { throw "Prepared manifest is not canonical: $($experiment.MatrixId)" }
    if (-not $Manifest -and [bool]$document.provenance.canonical -ne [bool]$Canonical) {
      throw "Prepared manifest canonical mode does not match the requested campaign: $($experiment.MatrixId)"
    }
    if ($document.provenance.imageDigest -ne $imageDigest.ToLowerInvariant()) {
      throw "Prepared manifest is not pinned to the explicitly built worker image: $($experiment.MatrixId)"
    }
    $experiment.ManifestDocument = $document
    $experiment.ExpectedShardCounts = Get-ExpectedShardCounts $document
    if (($experiment.ExpectedShardCounts | Measure-Object -Sum).Sum -ne (Get-PlannedRuns $experiment)) {
      throw "Prepared manifest run dimensions are inconsistent: $($experiment.MatrixId)"
    }
    Assert-ExactArtifactNames $experiment
    Write-Host "ATTENTION MANIFEST FROZEN: $($experiment.MatrixId) runs=$(Get-PlannedRuns $experiment)" -ForegroundColor Cyan
  }

  if ($Prepare) {
    Write-Host "ATTENTION PREPARE PASS: manifests=$(@($experiments).Count)" -ForegroundColor Green
    return
  }

  foreach ($experiment in $experiments) {
    Assert-FreeSpace
    $campaignJobs = @()
    try {
      for ($shard = 0; $shard -lt $experiment.ShardCount; $shard += 1) {
        $stem = "shard-$($shard.ToString('0000'))"
        $shardPath = Join-Path $experiment.MatrixDir "$stem.jsonl.gz"
        $completePath = Join-Path $experiment.MatrixDir "$stem.complete"
        if (Test-ReusableShard $experiment $shard) {
          Write-Host "ATTENTION SHARD REUSE: $($experiment.MatrixId) shard=$shard" -ForegroundColor DarkGreen
          continue
        }
        Move-ToQuarantine $shardPath
        Move-ToQuarantine $completePath
        $campaignJobs += Start-Job -ArgumentList @(
          $repo, $project, $experiment.ManifestRelative, $experiment.ShardCount, $shard,
          $sourceRevision, $sourceTree, $workspaceDirty, $imageDigest, $canonicalValue
        ) -ScriptBlock {
          param($workdir, $composeProject, $manifestPath, $shardCount, $shardIndex, $revision, $tree, $dirty, $image, $canonical)
          Set-Location $workdir
          $ErrorActionPreference = 'Stop'
          $arguments = @(
            '-p', $composeProject, '-f', 'infra/compose.lab.yml', 'run', '--rm',
            '-e', "LAB_SOURCE_REVISION=$revision", '-e', "LAB_SOURCE_TREE=$tree", '-e', "LAB_WORKSPACE_DIRTY=$dirty",
            '-e', 'LAB_REPOSITORY=djcdevelopment/contextlandscape', '-e', "LAB_IMAGE_DIGEST=$image",
            'worker', 'node', 'apps/lab/dist/main.js', "--manifest=$manifestPath",
            "--shards=$shardCount", "--shard=$shardIndex", "--canonical=$canonical"
          )
          $output = (& docker compose @arguments 2>&1 | Out-String)
          Write-Output $output
          if ($LASTEXITCODE -ne 0) { throw "attention shard $shardIndex failed" }
        }
      }
      if ($campaignJobs.Count -gt 0) {
        $campaignJobs | Wait-Job | Out-Null
        $failed = @($campaignJobs | Where-Object State -ne 'Completed')
        $campaignJobs | Receive-Job -ErrorAction Continue
        if ($failed.Count -gt 0) { throw "Attention shards failed for $($experiment.MatrixId): $($failed.Id -join ', ')" }
      }
    } finally {
      $campaignJobs | Remove-Job -Force -ErrorAction SilentlyContinue
      $campaignJobs = @()
    }

    $reportArgs = @('-p', $project, '-f', 'infra/compose.lab.yml', 'run', '--rm') + $provenanceEnv + @(
      'worker', 'node', 'apps/lab/dist/main.js', "--report=data/lab/$($experiment.MatrixId)"
    )
    Invoke-DockerChecked $reportArgs "Attention report failed for $($experiment.MatrixId)"
    $reportPath = Join-Path $experiment.MatrixDir 'report.json'
    $report = Get-Content -LiteralPath $reportPath -Raw | ConvertFrom-Json
    if ($report.matrixKind -ne 'attention-command' -or $report.runs -ne (Get-PlannedRuns $experiment) `
        -or $report.manifestHash -ne $experiment.ManifestDocument.provenance.manifestHash -or -not $report.reportHash) {
      throw "Attention report does not match its frozen manifest or planned run count: $reportPath"
    }
    $auditArgs = @('-p', $project, '-f', 'infra/compose.lab.yml', 'run', '--rm') + $provenanceEnv + @(
      'worker', 'node', 'apps/lab/dist/main.js', "--audit=data/lab/$($experiment.MatrixId)"
    )
    if ($experiment.ManifestDocument.provenance.canonical) { $auditArgs += '--strict=true' }
    Invoke-DockerChecked $auditArgs "Attention provenance audit failed for $($experiment.MatrixId)"
    Write-Host "ATTENTION CAMPAIGN PASS: data/lab/$($experiment.MatrixId)/report.json" -ForegroundColor Green
  }
} finally {
  $campaignJobs | Remove-Job -Force -ErrorAction SilentlyContinue
  Pop-Location
}
