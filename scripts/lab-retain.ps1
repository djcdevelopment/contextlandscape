[CmdletBinding()]
param(
  [string] $Root = 'data/lab',
  [int] $KeepDays = 14,
  [switch] $Apply
)

$ErrorActionPreference = 'Stop'
$resolved = (Resolve-Path -LiteralPath $Root -ErrorAction Stop).Path
if ([IO.Path]::GetFileName($resolved.TrimEnd('\', '/')) -ne 'lab') { throw "Refusing retention outside a lab directory: $resolved" }
$cutoff = [DateTime]::UtcNow.AddDays(-1 * $KeepDays)
$candidates = @(Get-ChildItem -LiteralPath $resolved -Directory | Where-Object { $_.LastWriteTimeUtc -lt $cutoff })
if (-not $candidates.Count) { Write-Host "LAB RETENTION: nothing older than $KeepDays days"; return }
foreach ($candidate in $candidates) {
  Write-Host "$($candidate.FullName) last-write=$($candidate.LastWriteTimeUtc.ToString('o'))"
  if ($Apply) { Remove-Item -LiteralPath $candidate.FullName -Recurse -Force }
}
if (-not $Apply) { Write-Host 'Dry run only. Re-run with -Apply to remove these exact matrix directories.' -ForegroundColor Yellow }
