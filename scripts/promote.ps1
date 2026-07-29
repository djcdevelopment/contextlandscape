[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)] [string] $Image,
  [Parameter(Mandatory = $true)] [string] $ReleaseId,
  [Parameter(Mandatory = $true)] [string] $SshTarget,
  [string] $RemoteRoot = '/opt/mech-commander',
  [string] $RemoteEnvironment = '/etc/mech-commander/environment',
  [switch] $DryRun
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$compose = Join-Path $root 'infra/compose.release.yml'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$archive = Join-Path ([IO.Path]::GetTempPath()) "mech-commander-$ReleaseId-$stamp.oci.tar"
$remoteArchive = "/tmp/$(Split-Path -Leaf $archive)"

Push-Location $root
try {
  if (!(Test-Path -LiteralPath $compose)) { throw "Missing release Compose file: $compose" }
  $imageId = (& docker image inspect --format '{{.Id}}' $Image | Select-Object -Last 1)
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($imageId)) { throw "Local image not found: $Image" }
  Write-Host "image=$Image image_id=$imageId" -ForegroundColor Cyan
  if ($DryRun) {
    Write-Host "DRY RUN: would save, hash, transfer, load, pin, health-check, and verify this image on $SshTarget" -ForegroundColor Yellow
    return
  }

  & docker save --output $archive $Image
  if ($LASTEXITCODE -ne 0) { throw 'docker save failed' }
  $sha = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
  Write-Host "archive_sha256=$sha" -ForegroundColor Cyan
  & scp -o BatchMode=yes $archive "${SshTarget}:$remoteArchive"
  if ($LASTEXITCODE -ne 0) { throw 'scp image archive failed' }
  & scp -o BatchMode=yes $compose "${SshTarget}:/tmp/compose.release.$ReleaseId.yml"
  if ($LASTEXITCODE -ne 0) { throw 'scp Compose file failed' }

  $remote = @"
set -eu
root='$RemoteRoot'
environment='$RemoteEnvironment'
image='$Image'
release='$ReleaseId'
expected_id='$imageId'
expected_sha='$sha'
archive='$remoteArchive'
compose_tmp='/tmp/compose.release.$ReleaseId.yml'
backup="`$root/backups/$stamp"
sudo mkdir -p "`$root" "`$backup" "`$(dirname "`$environment")"
if [ -f "`$environment" ]; then sudo cp "`$environment" "`$backup/environment"; fi
if [ -f "`$root/compose.release.yml" ]; then sudo cp "`$root/compose.release.yml" "`$backup/compose.release.yml"; fi
remote_sha=`$(sha256sum "`$archive" | awk '{print `$1}')
test "`$remote_sha" = "`$expected_sha"
sudo docker load --input "`$archive" >/dev/null
loaded_id=`$(sudo docker image inspect --format '{{.Id}}' "`$image")
test "`$loaded_id" = "`$expected_id"
sudo install -m 0644 "`$compose_tmp" "`$root/compose.release.yml"
if [ -f "`$environment" ]; then sudo sed -i '/^MECH_COMMANDER_IMAGE=/d; /^MECH_COMMANDER_RELEASE=/d' "`$environment"; fi
printf 'MECH_COMMANDER_IMAGE=%s\nMECH_COMMANDER_RELEASE=%s\n' "`$image" "`$release" | sudo tee -a "`$environment" >/dev/null
sudo docker compose --env-file "`$environment" -f "`$root/compose.release.yml" config >/dev/null
sudo docker compose --env-file "`$environment" -f "`$root/compose.release.yml" up -d --no-build
until curl --fail --silent http://127.0.0.1:8080/health/ready | grep -q '"status":"ok"'; do sleep 2; done
container_id=`$(sudo docker compose --env-file "`$environment" -f "`$root/compose.release.yml" ps -q app)
running_id=`$(sudo docker inspect --format '{{.Image}}' "`$container_id")
test "`$running_id" = "`$expected_id"
printf 'status=promoted\nimage=%s\nimage_id=%s\nrelease=%s\nbackup=%s\n' "`$image" "`$running_id" "`$release" "`$backup"
"@
  $remote | & ssh -o BatchMode=yes $SshTarget 'sh -s'
  if ($LASTEXITCODE -ne 0) { throw "Remote promotion failed on $SshTarget" }
} finally {
  Pop-Location
  if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
}
