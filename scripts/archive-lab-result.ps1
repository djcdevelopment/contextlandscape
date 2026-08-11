param(
  [Parameter(Mandatory = $true)][string] $MatrixDir,
  [Parameter(Mandatory = $true)][string] $AnalysisDir,
  [Parameter(Mandatory = $true)][string] $ArchivePath,
  [switch] $RemoveMatrixAfterVerify
)

$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$labRoot = [IO.Path]::GetFullPath((Join-Path $repoRoot 'data/lab'))
$archiveRoot = [IO.Path]::GetFullPath((Join-Path $repoRoot 'data/archives'))
$matrixPath = [IO.Path]::GetFullPath((Join-Path $repoRoot $MatrixDir))
$analysisPath = [IO.Path]::GetFullPath((Join-Path $repoRoot $AnalysisDir))
$targetArchive = [IO.Path]::GetFullPath((Join-Path $repoRoot $ArchivePath))

function Get-RepoRelativePath([string] $Path) {
  $fullPath = [IO.Path]::GetFullPath($Path)
  if (!$fullPath.StartsWith($repoRoot + [IO.Path]::DirectorySeparatorChar)) { throw "Path is outside repository: $fullPath" }
  return $fullPath.Substring($repoRoot.Length).TrimStart([char[]]@('\', '/'))
}

if (!$matrixPath.StartsWith($labRoot + [IO.Path]::DirectorySeparatorChar)) { throw 'MatrixDir must resolve beneath data/lab' }
if (!$analysisPath.StartsWith($labRoot + [IO.Path]::DirectorySeparatorChar)) { throw 'AnalysisDir must resolve beneath data/lab' }
if (!$targetArchive.StartsWith($archiveRoot + [IO.Path]::DirectorySeparatorChar)) { throw 'ArchivePath must resolve beneath data/archives' }
if (!(Test-Path -LiteralPath $matrixPath -PathType Container)) { throw "Matrix directory does not exist: $matrixPath" }
if (!(Test-Path -LiteralPath $analysisPath -PathType Container)) { throw "Analysis directory does not exist: $analysisPath" }
if (Test-Path -LiteralPath $targetArchive) { throw "Archive already exists: $targetArchive" }

$completionPath = Join-Path $matrixPath 'report.json'
$assessmentPath = Join-Path $analysisPath 'assessment.json'
$completion = Get-Content -LiteralPath $completionPath -Raw | ConvertFrom-Json
$assessment = Get-Content -LiteralPath $assessmentPath -Raw | ConvertFrom-Json
if ($completion.completionStatus -ne 'complete' -or $completion.observedRuns -ne $completion.plannedRuns) { throw 'Matrix completion report is not complete' }
if ($assessment.source.completionReportHash -ne $completion.reportHash) { throw 'Assessment does not bind the matrix completion report' }

$readmePath = Join-Path $analysisPath 'ARCHIVE_README.md'
$restoreMatrix = $MatrixDir.Replace('\', '/')
$restoreAnalysis = $AnalysisDir.Replace('\', '/')
$archiveName = [IO.Path]::GetFileName($targetArchive)
$readme = @"
# Archived attention-v2 shape screen

This archive contains the immutable raw matrix at ``$restoreMatrix`` and its compact forensic analysis at ``$restoreAnalysis``.

- Plan: ``$($completion.planId)``
- Completion report: ``$($completion.reportHash)``
- Analysis: ``$($assessment.analysisHash)``
- Runs: $($completion.observedRuns)
- Selection eligible: no

The raw shards are already gzip JSONL. The outer ZIP is a portable container and may not materially reduce their size.

Restore from the repository root:

``````powershell
tar -xf data/archives/$archiveName
``````

After restoration, rerun ``scripts/archive-lab-result.ps1`` without deleting sources or compare every restored file with ``archive-manifest.json``. Do not use this dataset for commander or survivor selection; see ``ASSESSMENT.md``.
"@
[IO.File]::WriteAllText($readmePath, $readme, [Text.UTF8Encoding]::new($false))

$files = @(
  Get-ChildItem -LiteralPath $matrixPath -File
  Get-ChildItem -LiteralPath $analysisPath -File | Where-Object Name -ne 'archive-manifest.json'
) | Sort-Object FullName
$entries = foreach ($file in $files) {
  $relative = (Get-RepoRelativePath $file.FullName).Replace('\', '/')
  [ordered]@{
    path = $relative
    bytes = $file.Length
    sha256 = "sha256:$((Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant())"
  }
}
$manifestDraft = [ordered]@{
  schemaVersion = 1
  archiveKind = 'attention-v2-shape-screen-integrity-only'
  planId = $completion.planId
  planHash = $completion.planHash
  completionReportHash = $completion.reportHash
  analysisHash = $assessment.analysisHash
  observedRuns = $completion.observedRuns
  selectionEligible = $false
  files = @($entries)
}
$manifestJson = $manifestDraft | ConvertTo-Json -Depth 8
$hasher = [Security.Cryptography.SHA256]::Create()
try { $manifestHashBytes = $hasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($manifestJson)) }
finally { $hasher.Dispose() }
$manifest = [ordered]@{}
foreach ($property in $manifestDraft.GetEnumerator()) { $manifest[$property.Key] = $property.Value }
$manifest['manifestHash'] = "sha256:$(([BitConverter]::ToString($manifestHashBytes) -replace '-', '').ToLowerInvariant())"
$manifestPath = Join-Path $analysisPath 'archive-manifest.json'
[IO.File]::WriteAllText($manifestPath, (($manifest | ConvertTo-Json -Depth 8) + "`n"), [Text.UTF8Encoding]::new($false))

New-Item -ItemType Directory -Force -Path ([IO.Path]::GetDirectoryName($targetArchive)) | Out-Null
$relativeMatrix = Get-RepoRelativePath $matrixPath
$relativeAnalysis = Get-RepoRelativePath $analysisPath
Push-Location $repoRoot
try {
  & tar -a -cf $targetArchive $relativeMatrix $relativeAnalysis
  if ($LASTEXITCODE -ne 0) { throw "tar failed with exit code $LASTEXITCODE" }
} finally {
  Pop-Location
}

$archiveEntries = @(& tar -tf $targetArchive)
if ($LASTEXITCODE -ne 0 -or $archiveEntries.Count -lt ($entries.Count + 1)) { throw 'Archive listing verification failed' }

$verifyRoot = [IO.Path]::GetFullPath((Join-Path $repoRoot "data/archive-verify/$([IO.Path]::GetFileNameWithoutExtension($targetArchive))"))
$allowedVerifyRoot = [IO.Path]::GetFullPath((Join-Path $repoRoot 'data/archive-verify'))
if (!$verifyRoot.StartsWith($allowedVerifyRoot + [IO.Path]::DirectorySeparatorChar)) { throw 'Unsafe verification path' }
New-Item -ItemType Directory -Force -Path $verifyRoot | Out-Null
try {
  & tar -xf $targetArchive -C $verifyRoot
  if ($LASTEXITCODE -ne 0) { throw "Archive extraction failed with exit code $LASTEXITCODE" }
  foreach ($entry in $entries) {
    $restored = Join-Path $verifyRoot $entry.path
    if (!(Test-Path -LiteralPath $restored -PathType Leaf)) { throw "Archive is missing $($entry.path)" }
    $hash = "sha256:$((Get-FileHash -LiteralPath $restored -Algorithm SHA256).Hash.ToLowerInvariant())"
    if ($hash -ne $entry.sha256) { throw "Restored hash mismatch: $($entry.path)" }
  }
} finally {
  if (Test-Path -LiteralPath $verifyRoot) { Remove-Item -LiteralPath $verifyRoot -Recurse -Force }
}

$archiveInfo = Get-Item -LiteralPath $targetArchive
$archiveHash = "sha256:$((Get-FileHash -LiteralPath $targetArchive -Algorithm SHA256).Hash.ToLowerInvariant())"
$sidecar = [ordered]@{
  schemaVersion = 1
  archivePath = (Get-RepoRelativePath $targetArchive).Replace('\', '/')
  archiveBytes = $archiveInfo.Length
  archiveHash = $archiveHash
  manifestHash = $manifest.manifestHash
  fullExtractionVerified = $true
  sourceRemoved = [bool]$RemoveMatrixAfterVerify
}
[IO.File]::WriteAllText("$targetArchive.json", (($sidecar | ConvertTo-Json -Depth 4) + "`n"), [Text.UTF8Encoding]::new($false))

if ($RemoveMatrixAfterVerify) {
  if (!$matrixPath.StartsWith($labRoot + [IO.Path]::DirectorySeparatorChar) -or $matrixPath -eq $labRoot) { throw 'Refusing unsafe matrix removal' }
  Remove-Item -LiteralPath $matrixPath -Recurse -Force
}

$sidecar | ConvertTo-Json -Depth 4
