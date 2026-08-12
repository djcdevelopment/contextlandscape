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
if (!$matrixPath.StartsWith($labRoot + [IO.Path]::DirectorySeparatorChar) -or $matrixPath -eq $labRoot) { throw 'Unsafe MatrixDir' }
if (!$analysisPath.StartsWith($labRoot + [IO.Path]::DirectorySeparatorChar) -or $analysisPath -eq $labRoot) { throw 'Unsafe AnalysisDir' }
if (!$targetArchive.StartsWith($archiveRoot + [IO.Path]::DirectorySeparatorChar)) { throw 'ArchivePath must be beneath data/archives' }
if (Test-Path -LiteralPath $targetArchive) { throw 'Archive already exists' }

$report = Get-Content -LiteralPath (Join-Path $matrixPath 'report.json') -Raw | ConvertFrom-Json
$assessment = Get-Content -LiteralPath (Join-Path $analysisPath 'assessment.json') -Raw | ConvertFrom-Json
if ($report.campaignKind -ne 'v3-artillery-mechanism-screen' -or $report.runs -ne 1411200 -or @($report.shards).Count -ne 12) {
  throw 'Matrix is not the complete artillery mechanism screen'
}
if ($assessment.source.reportHash -ne $report.reportHash -or $assessment.source.manifestHash -ne $report.manifestHash) {
  throw 'Assessment does not bind the completed matrix'
}

function Get-RelativePath([string] $Path) {
  $full = [IO.Path]::GetFullPath($Path)
  if (!$full.StartsWith($repoRoot + [IO.Path]::DirectorySeparatorChar)) { throw "Path outside repository: $full" }
  return $full.Substring($repoRoot.Length).TrimStart([char[]]@('\', '/')).Replace('\', '/')
}
function Get-Hash([string] $Path) { return "sha256:$((Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant())" }

$files = @(
  Get-ChildItem -LiteralPath $matrixPath -File
  Get-ChildItem -LiteralPath $analysisPath -File | Where-Object Name -ne 'archive-manifest.json'
) | Sort-Object FullName
$entries = @($files | ForEach-Object { [ordered]@{ path = Get-RelativePath $_.FullName; bytes = $_.Length; sha256 = Get-Hash $_.FullName } })
$archiveManifest = [ordered]@{
  schemaVersion = 1
  archiveKind = 'attention-v3-artillery-mechanism-screen-five-drift'
  matrixId = $report.matrixId
  manifestHash = $report.manifestHash
  reportHash = $report.reportHash
  analysisHash = $assessment.analysisHash
  runs = $report.runs
  files = $entries
}
$archiveManifestPath = Join-Path $analysisPath 'archive-manifest.json'
[IO.File]::WriteAllText($archiveManifestPath, (($archiveManifest | ConvertTo-Json -Depth 8) + "`n"), [Text.UTF8Encoding]::new($false))
$archiveManifestHash = Get-Hash $archiveManifestPath
$relativeMatrix = Get-RelativePath $matrixPath
$relativeAnalysis = Get-RelativePath $analysisPath
New-Item -ItemType Directory -Force -Path ([IO.Path]::GetDirectoryName($targetArchive)) | Out-Null
Push-Location $repoRoot
try {
  & tar -a -cf $targetArchive $relativeMatrix $relativeAnalysis
  if ($LASTEXITCODE -ne 0) { throw "tar failed with exit code $LASTEXITCODE" }
} finally { Pop-Location }

$listed = @(& tar -tf $targetArchive)
if ($LASTEXITCODE -ne 0 -or $listed.Count -lt ($entries.Count + 1)) { throw 'Archive listing verification failed' }
$verifyBase = [IO.Path]::GetFullPath((Join-Path $repoRoot 'data/archive-verify'))
$verifyPath = [IO.Path]::GetFullPath((Join-Path $verifyBase ([IO.Path]::GetFileNameWithoutExtension($targetArchive))))
if (!$verifyPath.StartsWith($verifyBase + [IO.Path]::DirectorySeparatorChar)) { throw 'Unsafe verification path' }
New-Item -ItemType Directory -Force -Path $verifyPath | Out-Null
try {
  & tar -xf $targetArchive -C $verifyPath
  if ($LASTEXITCODE -ne 0) { throw 'Archive extraction verification failed' }
  foreach ($entry in $entries) {
    $restored = Join-Path $verifyPath $entry.path
    if (!(Test-Path -LiteralPath $restored -PathType Leaf) -or (Get-Hash $restored) -ne $entry.sha256) {
      throw "Restored hash mismatch: $($entry.path)"
    }
  }
  $restoredManifest = Join-Path $verifyPath (Get-RelativePath $archiveManifestPath)
  if ((Get-Hash $restoredManifest) -ne $archiveManifestHash) { throw 'Restored archive manifest mismatch' }
} finally {
  if (Test-Path -LiteralPath $verifyPath) { Remove-Item -LiteralPath $verifyPath -Recurse -Force }
}
$archiveInfo = Get-Item -LiteralPath $targetArchive
$sidecar = [ordered]@{
  schemaVersion = 1
  archivePath = Get-RelativePath $targetArchive
  archiveBytes = $archiveInfo.Length
  archiveHash = Get-Hash $targetArchive
  archiveManifestHash = $archiveManifestHash
  fullExtractionVerified = $true
  sourceRemoved = [bool]$RemoveMatrixAfterVerify
}
[IO.File]::WriteAllText("$targetArchive.json", (($sidecar | ConvertTo-Json -Depth 4) + "`n"), [Text.UTF8Encoding]::new($false))
if ($RemoveMatrixAfterVerify) { Remove-Item -LiteralPath $matrixPath -Recurse -Force }
$sidecar | ConvertTo-Json -Depth 4
