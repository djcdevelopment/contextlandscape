param(
  [Parameter(Mandatory = $true)][string] $MatrixDir,
  [Parameter(Mandatory = $true)][string] $AnalysisDir,
  [Parameter(Mandatory = $true)][string] $ProbeDir,
  [Parameter(Mandatory = $true)][string] $AuditDir,
  [Parameter(Mandatory = $true)][string] $ArchivePath,
  [switch] $ValidateOnly,
  [switch] $RemoveMatrixAfterVerify
)

$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$labRoot = [IO.Path]::GetFullPath((Join-Path $repoRoot 'data/lab'))
$archiveRoot = [IO.Path]::GetFullPath((Join-Path $repoRoot 'data/archives'))

function Resolve-RepoPath([string] $Path) {
  return [IO.Path]::GetFullPath((Join-Path $repoRoot $Path))
}

function Get-RepoRelativePath([string] $Path) {
  $fullPath = [IO.Path]::GetFullPath($Path)
  if (!$fullPath.StartsWith($repoRoot + [IO.Path]::DirectorySeparatorChar)) {
    throw "Path is outside repository: $fullPath"
  }
  return $fullPath.Substring($repoRoot.Length).TrimStart([char[]]@('\', '/'))
}

function Assert-LabDirectory([string] $Path, [string] $Name) {
  if (!$Path.StartsWith($labRoot + [IO.Path]::DirectorySeparatorChar) -or $Path -eq $labRoot) {
    throw "$Name must resolve to a specific directory beneath data/lab"
  }
  if (!(Test-Path -LiteralPath $Path -PathType Container)) {
    throw "$Name does not exist: $Path"
  }
}

function Get-Sha256([string] $Path) {
  return "sha256:$((Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant())"
}

$matrixPath = Resolve-RepoPath $MatrixDir
$analysisPath = Resolve-RepoPath $AnalysisDir
$probePath = Resolve-RepoPath $ProbeDir
$auditPath = Resolve-RepoPath $AuditDir
$targetArchive = Resolve-RepoPath $ArchivePath

Assert-LabDirectory $matrixPath 'MatrixDir'
Assert-LabDirectory $analysisPath 'AnalysisDir'
Assert-LabDirectory $probePath 'ProbeDir'
Assert-LabDirectory $auditPath 'AuditDir'
if (!$targetArchive.StartsWith($archiveRoot + [IO.Path]::DirectorySeparatorChar)) {
  throw 'ArchivePath must resolve beneath data/archives'
}
if ([IO.Path]::GetExtension($targetArchive) -ne '.zip') { throw 'ArchivePath must end in .zip' }
if (Test-Path -LiteralPath $targetArchive) { throw "Archive already exists: $targetArchive" }

$completion = Get-Content -LiteralPath (Join-Path $matrixPath 'report.json') -Raw | ConvertFrom-Json
$assessment = Get-Content -LiteralPath (Join-Path $analysisPath 'assessment.json') -Raw | ConvertFrom-Json
$launch = Get-Content -LiteralPath (Join-Path $matrixPath 'launch-evidence.json') -Raw | ConvertFrom-Json
$probe = Get-Content -LiteralPath (Join-Path $probePath 'report.json') -Raw | ConvertFrom-Json
$audit = Get-Content -LiteralPath (Join-Path $auditPath 'report.json') -Raw | ConvertFrom-Json

if ($completion.completionStatus -ne 'complete' -or $completion.observedRuns -ne $completion.plannedRuns) {
  throw 'Matrix completion report is not exact and complete'
}
if ($assessment.integrity.status -ne 'pass' -or !$assessment.integrity.exactRunCoverage) {
  throw 'Corrected assessment integrity did not pass'
}
if ($assessment.source.completionReportHash -ne $completion.reportHash) {
  throw 'Assessment does not bind the matrix completion report'
}
if ($assessment.evidenceDecision.finalSurvivorSelectionEligible -ne $false -or
    $assessment.evidenceDecision.nextStageSelectionEligible -ne $true) {
  throw 'Assessment has an unexpected evidence decision'
}
if ($launch.launchDecision -ne 'preflights-passed' -or $launch.planHash -ne $completion.planHash) {
  throw 'Launch evidence does not authorize this completed plan'
}
foreach ($preflight in @($probe, $audit)) {
  if ($preflight.overallStatus -ne 'pass' -or $preflight.observedRuns -ne $preflight.plannedRuns) {
    throw "Preflight did not pass exactly: $($preflight.campaignId)"
  }
  if (@($preflight.gates | Where-Object status -ne 'pass').Count -ne 0) {
    throw "Preflight contains a failed gate: $($preflight.campaignId)"
  }
  $preflightRoot = $auditPath
  if ($preflight.campaignKind -eq 'attention-v2-probe') { $preflightRoot = $probePath }
  $rawPath = Join-Path $preflightRoot $preflight.rawEvidence.path
  if ((Get-Sha256 $rawPath) -ne $preflight.rawEvidence.hash) {
    throw "Preflight raw evidence hash mismatch: $($preflight.campaignId)"
  }
}
if ($launch.probe.reportHash -ne $probe.reportHash -or $launch.audit.reportHash -ne $audit.reportHash) {
  throw 'Launch evidence does not bind the supplied preflight reports'
}

if ($ValidateOnly) {
  [ordered]@{
    status = 'pass'
    planId = $completion.planId
    completionReportHash = $completion.reportHash
    analysisHash = $assessment.analysisHash
    probeReportHash = $probe.reportHash
    auditReportHash = $audit.reportHash
    correctedRuns = $completion.observedRuns
    preflightRuns = $probe.observedRuns + $audit.observedRuns
    provisionalCandidateRows = @($assessment.selection.provisionalCandidates | ForEach-Object designRow)
    archivePath = (Get-RepoRelativePath $targetArchive).Replace('\', '/')
  } | ConvertTo-Json -Depth 5
  exit 0
}

$archiveName = [IO.Path]::GetFileName($targetArchive)
$sourceDirectories = @($matrixPath, $analysisPath, $probePath, $auditPath)
$restorePaths = $sourceDirectories | ForEach-Object { (Get-RepoRelativePath $_).Replace('\', '/') }
$readmePath = Join-Path $analysisPath 'ARCHIVE_README.md'
$candidateRows = @($assessment.selection.provisionalCandidates | ForEach-Object designRow) -join ', '
$readme = @"
# Archived attention-v2 corrected campaign

This portable evidence bundle contains the complete causal chain for the corrected commander-landscape screen:

- the 32,768-run compiler/behavior probe at ``$($restorePaths[2])``;
- the 256,000-run mechanic and replay audit at ``$($restorePaths[3])``;
- the immutable 9,216,000-run enriched matrix at ``$($restorePaths[0])``;
- the compact assessment, charts, and next-campaign plan at ``$($restorePaths[1])``.

Evidence identifiers:

- Plan: ``$($completion.planId)``
- Plan hash: ``$($completion.planHash)``
- Completion report: ``$($completion.reportHash)``
- Analysis: ``$($assessment.analysisHash)``
- Probe report: ``$($probe.reportHash)``
- Audit report: ``$($audit.reportHash)``
- Corrected screen runs: $($completion.observedRuns)
- Provisional next-stage rows: $candidateRows
- Next-stage selection eligible: yes
- Final survivor promotion eligible: no

The raw shards and preflight streams are already gzip JSONL, so the outer ZIP primarily provides portability, provenance, and one restore target rather than dramatic additional compression.

Restore from the repository root:

``````powershell
tar -xf data/archives/$archiveName
``````

After restoration, compare every file against ``archive-manifest.json``. The six candidates are inputs to the planned causal-refinement campaign; they are not promoted survivors until multi-sample, holdout, and v1 regression gates pass.
"@
[IO.File]::WriteAllText($readmePath, $readme, [Text.UTF8Encoding]::new($false))

$files = @($sourceDirectories | ForEach-Object {
  Get-ChildItem -LiteralPath $_ -File | Where-Object Name -ne 'archive-manifest.json'
}) | Sort-Object FullName
$entries = foreach ($file in $files) {
  [ordered]@{
    path = (Get-RepoRelativePath $file.FullName).Replace('\', '/')
    bytes = $file.Length
    sha256 = Get-Sha256 $file.FullName
    description = if ($file.DirectoryName -eq $matrixPath) {
      if ($file.Name -like 'shard-*.jsonl.gz') { 'enriched corrected campaign records (gzip JSONL)' }
      elseif ($file.Name -like 'shard-*.complete') { 'shard completion marker with independent digest' }
      elseif ($file.Name -eq 'launch-evidence.json') { 'source, image, calibration, probe, and audit launch binding' }
      else { 'corrected campaign manifest or completion report' }
    } elseif ($file.DirectoryName -eq $analysisPath) {
      if ($file.Extension -eq '.svg' -or $file.Extension -eq '.png') { 'human-readable evidence visualization' }
      elseif ($file.Name -eq 'assessment.json') { 'machine-readable statistical assessment and candidate frontier' }
      elseif ($file.Name -eq 'NEXT_CAMPAIGN.md') { 'hash-bound causal-refinement plan' }
      else { 'compact assessment documentation' }
    } elseif ($file.DirectoryName -eq $probePath) {
      'compiler and behavioral-distinctness probe evidence'
    } else {
      'mechanic reachability, attribution, and replay audit evidence'
    }
  }
}

$manifestDraft = [ordered]@{
  schemaVersion = 1
  archiveKind = 'attention-v2-corrected-causal-shape-screen'
  planId = $completion.planId
  planHash = $completion.planHash
  completionReportHash = $completion.reportHash
  analysisHash = $assessment.analysisHash
  probeReportHash = $probe.reportHash
  auditReportHash = $audit.reportHash
  observedRuns = $completion.observedRuns
  preflightRuns = $probe.observedRuns + $audit.observedRuns
  nextStageSelectionEligible = $true
  finalSurvivorSelectionEligible = $false
  provisionalCandidateRows = @($assessment.selection.provisionalCandidates | ForEach-Object designRow)
  files = @($entries)
}
$manifestJson = $manifestDraft | ConvertTo-Json -Depth 10
$hasher = [Security.Cryptography.SHA256]::Create()
try { $manifestHashBytes = $hasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($manifestJson)) }
finally { $hasher.Dispose() }
$manifest = [ordered]@{}
foreach ($property in $manifestDraft.GetEnumerator()) { $manifest[$property.Key] = $property.Value }
$manifest['manifestHash'] = "sha256:$(([BitConverter]::ToString($manifestHashBytes) -replace '-', '').ToLowerInvariant())"
$manifestPath = Join-Path $analysisPath 'archive-manifest.json'
[IO.File]::WriteAllText($manifestPath, (($manifest | ConvertTo-Json -Depth 10) + "`n"), [Text.UTF8Encoding]::new($false))
$manifestFileHash = Get-Sha256 $manifestPath

New-Item -ItemType Directory -Force -Path ([IO.Path]::GetDirectoryName($targetArchive)) | Out-Null
$relativeSources = $sourceDirectories | ForEach-Object { Get-RepoRelativePath $_ }
Push-Location $repoRoot
try {
  & tar -a -cf $targetArchive @relativeSources
  if ($LASTEXITCODE -ne 0) { throw "tar failed with exit code $LASTEXITCODE" }
} finally {
  Pop-Location
}

$archiveEntries = @(& tar -tf $targetArchive)
if ($LASTEXITCODE -ne 0 -or $archiveEntries.Count -lt ($entries.Count + 1)) {
  throw 'Archive listing verification failed'
}

$verifyBase = [IO.Path]::GetFullPath((Join-Path $repoRoot 'data/archive-verify'))
$verifyRoot = [IO.Path]::GetFullPath((Join-Path $verifyBase ([IO.Path]::GetFileNameWithoutExtension($targetArchive))))
if (!$verifyRoot.StartsWith($verifyBase + [IO.Path]::DirectorySeparatorChar) -or $verifyRoot -eq $verifyBase) {
  throw 'Unsafe verification path'
}
New-Item -ItemType Directory -Force -Path $verifyRoot | Out-Null
try {
  & tar -xf $targetArchive -C $verifyRoot
  if ($LASTEXITCODE -ne 0) { throw "Archive extraction failed with exit code $LASTEXITCODE" }
  foreach ($entry in $entries) {
    $restored = Join-Path $verifyRoot $entry.path
    if (!(Test-Path -LiteralPath $restored -PathType Leaf)) { throw "Archive is missing $($entry.path)" }
    if ((Get-Sha256 $restored) -ne $entry.sha256) { throw "Restored hash mismatch: $($entry.path)" }
  }
  $restoredManifest = Join-Path $verifyRoot ((Get-RepoRelativePath $manifestPath).Replace('/', '\'))
  if ((Get-Sha256 $restoredManifest) -ne $manifestFileHash) { throw 'Restored archive manifest hash mismatch' }
} finally {
  if (Test-Path -LiteralPath $verifyRoot) { Remove-Item -LiteralPath $verifyRoot -Recurse -Force }
}

if ($RemoveMatrixAfterVerify) {
  if (!$matrixPath.StartsWith($labRoot + [IO.Path]::DirectorySeparatorChar) -or $matrixPath -eq $labRoot) {
    throw 'Refusing unsafe matrix removal'
  }
  Remove-Item -LiteralPath $matrixPath -Recurse -Force
  if (Test-Path -LiteralPath $matrixPath) { throw 'Verified matrix removal did not complete' }
}

$archiveInfo = Get-Item -LiteralPath $targetArchive
$sidecar = [ordered]@{
  schemaVersion = 1
  archivePath = (Get-RepoRelativePath $targetArchive).Replace('\', '/')
  archiveBytes = $archiveInfo.Length
  archiveHash = Get-Sha256 $targetArchive
  manifestHash = $manifest.manifestHash
  manifestFileHash = $manifestFileHash
  analysisHash = $assessment.analysisHash
  completionReportHash = $completion.reportHash
  fullExtractionVerified = $true
  verifiedFiles = $entries.Count + 1
  matrixSourceRemoved = !(Test-Path -LiteralPath $matrixPath)
  probeAndAuditRemainOnline = $true
  nextStageSelectionEligible = $true
  finalSurvivorSelectionEligible = $false
}
[IO.File]::WriteAllText("$targetArchive.json", (($sidecar | ConvertTo-Json -Depth 5) + "`n"), [Text.UTF8Encoding]::new($false))

$sidecar | ConvertTo-Json -Depth 5
