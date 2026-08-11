param(
  [Parameter(Mandatory = $true)][string] $AnalysisDir
)

$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$labRoot = [IO.Path]::GetFullPath((Join-Path $repoRoot 'data/lab'))
$analysisPath = [IO.Path]::GetFullPath((Join-Path $repoRoot $AnalysisDir))
if (!$analysisPath.StartsWith($labRoot + [IO.Path]::DirectorySeparatorChar) -or $analysisPath -eq $labRoot) {
  throw 'AnalysisDir must resolve to a specific directory beneath data/lab'
}
if (!(Test-Path -LiteralPath $analysisPath -PathType Container)) {
  throw "AnalysisDir does not exist: $analysisPath"
}

$chromeCandidates = @(
  'C:\Program Files\Google\Chrome\Application\chrome.exe',
  'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
  'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
  'C:\Program Files\Microsoft\Edge\Application\msedge.exe'
)
$browser = $chromeCandidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
if (!$browser) { throw 'Chrome or Edge is required to render full-resolution PNG charts' }

$profilePath = [IO.Path]::GetFullPath((Join-Path $analysisPath '.chrome-render-profile'))
if (!$profilePath.StartsWith($analysisPath + [IO.Path]::DirectorySeparatorChar) -or $profilePath -eq $analysisPath) {
  throw 'Unsafe browser profile path'
}
New-Item -ItemType Directory -Path $profilePath -Force | Out-Null

$results = @()
try {
  $charts = @(Get-ChildItem -LiteralPath $analysisPath -Filter '*.svg' -File | Sort-Object Name)
  if ($charts.Count -eq 0) { throw 'No SVG charts found' }
  foreach ($chart in $charts) {
    $svg = Get-Content -LiteralPath $chart.FullName -Raw -Encoding utf8
    if ($svg -notmatch '<svg[^>]+width="(?<width>\d+)"[^>]+height="(?<height>\d+)"') {
      throw "Chart has no integer SVG dimensions: $($chart.Name)"
    }
    $width = [int]$Matches.width
    $height = [int]$Matches.height
    $pngPath = [IO.Path]::ChangeExtension($chart.FullName, '.png')
    $fileUrl = 'file:///' + $chart.FullName.Replace('\', '/')
    & $browser '--headless=new' '--disable-gpu' '--hide-scrollbars' '--force-device-scale-factor=1' `
      "--user-data-dir=$profilePath" "--window-size=$width,$height" "--screenshot=$pngPath" $fileUrl | Out-Null
    if ($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath $pngPath -PathType Leaf)) {
      throw "Browser render failed for $($chart.Name)"
    }
    $results += [ordered]@{
      source = $chart.Name
      output = [IO.Path]::GetFileName($pngPath)
      width = $width
      height = $height
      bytes = (Get-Item -LiteralPath $pngPath).Length
      sha256 = "sha256:$((Get-FileHash -LiteralPath $pngPath -Algorithm SHA256).Hash.ToLowerInvariant())"
    }
  }
} finally {
  if (Test-Path -LiteralPath $profilePath) {
    Remove-Item -LiteralPath $profilePath -Recurse -Force
  }
}

[ordered]@{
  status = 'pass'
  browser = $browser
  analysisDir = $AnalysisDir.Replace('\', '/')
  charts = $results
} | ConvertTo-Json -Depth 5
