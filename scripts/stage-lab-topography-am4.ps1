param(
  [string]$Node = "derek@am4.tail8e749c.ts.net",
  [string]$RemoteRoot = "/home/derek/contextlandscape-topography/all-labs-topography-v1"
)

$ErrorActionPreference = "Stop"
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$sourceRoot = Join-Path $repositoryRoot "data/lab/lab-topography-atlas-v1"
$files = @(
  (Join-Path $sourceRoot "atlas.json"),
  (Join-Path $sourceRoot "heightmap.png"),
  (Join-Path $sourceRoot "semantic-mask.png"),
  (Join-Path $sourceRoot "render-job.json"),
  (Join-Path $repositoryRoot "config/lab-topography/atlas-v1.json")
)

foreach ($file in $files) {
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
    throw "Missing atlas input: $file. Run npm run build:lab-topography first."
  }
}

Write-Host "AM4 render-device ownership (inspection only):"
& ssh $Node "fuser -v /dev/dri/renderD128 /dev/dri/renderD129 2>&1 || true"
if ($LASTEXITCODE -ne 0) { throw "Could not inspect AM4 render devices." }

& ssh $Node "mkdir -p '$RemoteRoot' /home/derek/contextlandscape-topography/renders"
if ($LASTEXITCODE -ne 0) { throw "Could not create the AM4 staging directory." }

& scp @files "${Node}:$RemoteRoot/"
if ($LASTEXITCODE -ne 0) { throw "Could not stage atlas inputs on AM4." }

Write-Host "Staged hashes:"
& ssh $Node "cd '$RemoteRoot' && sha256sum atlas.json heightmap.png semantic-mask.png render-job.json atlas-v1.json"
if ($LASTEXITCODE -ne 0) { throw "Could not verify staged atlas inputs." }

Write-Host "Staging complete. This script intentionally does not start, stop, or reconfigure ComfyUI or another GPU workload."
