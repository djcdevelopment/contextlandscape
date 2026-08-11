param(
  [Parameter(Mandatory = $true)][string] $AnalysisDir
)

$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$labRoot = [IO.Path]::GetFullPath((Join-Path $repoRoot 'data/lab'))
$analysisPath = [IO.Path]::GetFullPath((Join-Path $repoRoot $AnalysisDir))
if (!$analysisPath.StartsWith($labRoot + [IO.Path]::DirectorySeparatorChar)) { throw 'AnalysisDir must resolve beneath data/lab' }
$assessmentPath = Join-Path $analysisPath 'assessment.json'
if (!(Test-Path -LiteralPath $assessmentPath -PathType Leaf)) { throw "Missing assessment: $assessmentPath" }
$assessment = Get-Content -LiteralPath $assessmentPath -Raw | ConvertFrom-Json
Add-Type -AssemblyName System.Drawing

function New-BarChart {
  param([string] $Name, [string] $Title, [object[]] $Rows, [double] $Maximum = 0)
  $width = 1800
  $height = [Math]::Max(420, 190 + 76 * $Rows.Count)
  $bitmap = [Drawing.Bitmap]::new($width, $height)
  $graphics = [Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $background = [Drawing.ColorTranslator]::FromHtml('#07131f')
  $panel = [Drawing.ColorTranslator]::FromHtml('#102536')
  $teal = [Drawing.ColorTranslator]::FromHtml('#4ff0c5')
  $text = [Drawing.ColorTranslator]::FromHtml('#ecf7ff')
  $muted = [Drawing.ColorTranslator]::FromHtml('#9fb3c5')
  $graphics.Clear($background)
  $titleFont = [Drawing.Font]::new('Segoe UI', 26, [Drawing.FontStyle]::Bold)
  $rowFont = [Drawing.Font]::new('Consolas', 13)
  $graphics.DrawString($Title, $titleFont, [Drawing.SolidBrush]::new($text), 60, 45)
  if ($Maximum -le 0) { $Maximum = ($Rows | ForEach-Object { [double]$_.Value } | Measure-Object -Maximum).Maximum }
  if ($Maximum -le 0) { $Maximum = 1 }
  for ($index = 0; $index -lt $Rows.Count; $index += 1) {
    $row = $Rows[$index]
    $y = 135 + $index * 76
    $graphics.DrawString([string]$row.Label, $rowFont, [Drawing.SolidBrush]::new($text), 60, $y + 8)
    $graphics.FillRectangle([Drawing.SolidBrush]::new($panel), 530, $y, 1080, 36)
    $barWidth = [Math]::Max(1, [Math]::Round(([double]$row.Value / $Maximum) * 1080))
    $graphics.FillRectangle([Drawing.SolidBrush]::new($teal), 530, $y, $barWidth, 36)
    $graphics.DrawString(([double]$row.Value).ToString('N3'), $rowFont, [Drawing.SolidBrush]::new($muted), 1630, $y + 8)
  }
  $target = Join-Path $analysisPath $Name
  try { $bitmap.Save($target, [Drawing.Imaging.ImageFormat]::Png) }
  finally {
    $titleFont.Dispose(); $rowFont.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
  }
}

function Get-PropertyValue($Object, [string] $Name) {
  $property = $Object.PSObject.Properties[$Name]
  if ($null -eq $property) { return 0 }
  return $property.Value
}

$funnel = $assessment.artilleryFunnel
New-BarChart '01-artillery-funnel.png' 'Artillery decision and resolution funnel' @(
  @{ Label = 'phases considered'; Value = $funnel.considered },
  @{ Label = 'shells declared'; Value = $funnel.declared },
  @{ Label = 'shells fired'; Value = $funnel.fired },
  @{ Label = 'flare established'; Value = $funnel.flareEstablished },
  @{ Label = 'hostile shells blocked'; Value = $funnel.hostileBlocked }
)
New-BarChart '02-artillery-reasons.png' 'Why artillery fired or passed' @(
  $assessment.artilleryReasons.PSObject.Properties | Sort-Object Value -Descending | ForEach-Object { @{ Label = $_.Name; Value = $_.Value } }
)
New-BarChart '03-artillery-targets.png' 'Artillery target-basis atlas' @(
  $assessment.artilleryTargets.PSObject.Properties | Sort-Object Value -Descending | ForEach-Object { @{ Label = $_.Name; Value = $_.Value } }
)
New-BarChart '04-capability-causal-ladder.png' 'Capability ladder' @(
  @{ Label = 'Stage A score'; Value = $assessment.stages.A.score },
  @{ Label = 'Stage B score'; Value = $assessment.stages.B.score },
  @{ Label = 'Stage C score'; Value = $assessment.stages.C.score }
) 1
$histogram = $assessment.fiveDriftBoundary.finalDriftHistogram
New-BarChart '05-five-drift-boundary.png' 'Five-drift boundary' @(
  @{ Label = 'final drift 3'; Value = (Get-PropertyValue $histogram '3') },
  @{ Label = 'final drift 4'; Value = (Get-PropertyValue $histogram '4') },
  @{ Label = 'final drift 5'; Value = (Get-PropertyValue $histogram '5') }
)

$pngFiles = Get-ChildItem -LiteralPath $analysisPath -Filter '*.png' | Sort-Object Name
$checksums = [ordered]@{}
foreach ($file in $pngFiles) {
  $checksums[$file.Name] = "sha256:$((Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant())"
}
[IO.File]::WriteAllText(
  (Join-Path $analysisPath 'png-checksums.json'),
  (([ordered]@{ schemaVersion = 1; files = $checksums } | ConvertTo-Json -Depth 4) + "`n"),
  [Text.UTF8Encoding]::new($false)
)
$checksums | ConvertTo-Json -Depth 4
