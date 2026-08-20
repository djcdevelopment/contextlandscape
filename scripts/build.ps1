[CmdletBinding()]
param(
  [ValidateSet('Verify', 'Image', 'Smoke')]
  [string] $Target = 'Verify',
  [string] $ReleaseId = 'dev',
  [string] $ImageTag,
  [switch] $AllowDirty
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
  if ($Target -eq 'Verify') {
    docker build --target verify -t context-landscape-build:verify .
    if ($LASTEXITCODE -ne 0) { throw 'Docker verification failed' }
  } elseif ($Target -eq 'Image') {
    if ($ImageTag -eq '') { $ImageTag = "context-landscape:$ReleaseId" }
    $revision = 'workspace'
    if ((Get-Command git -ErrorAction SilentlyContinue) -and (Test-Path (Join-Path $root '.git'))) {
      $revision = (& git -C $root rev-parse HEAD).Trim()
      if ($LASTEXITCODE -ne 0) { throw 'Could not resolve the Git revision for the image build' }
      if (-not $AllowDirty) {
        $changes = @(& git -C $root status --porcelain --untracked-files=all)
        if ($LASTEXITCODE -ne 0) { throw 'Could not inspect the Git worktree before the image build' }
        if ($changes.Count -gt 0) {
          throw 'Image builds require a clean Git worktree. Commit or stash changes, or pass -AllowDirty explicitly.'
        }
      }
    }
    docker build --target runtime -t $ImageTag --label "org.opencontainers.image.version=$ReleaseId" --label "org.opencontainers.image.revision=$revision" .
    if ($LASTEXITCODE -ne 0) { throw 'Docker image build failed' }
    docker image inspect $ImageTag --format 'image={{.Id}}'
  } else {
    docker compose --env-file .env.example -f infra/compose.release.yml config
    if ($LASTEXITCODE -ne 0) { throw 'Compose configuration failed' }
  }
} finally { Pop-Location }
