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

$background = [Drawing.ColorTranslator]::FromHtml('#07131f')
$panel = [Drawing.ColorTranslator]::FromHtml('#102536')
$teal = [Drawing.ColorTranslator]::FromHtml('#4ff0c5')
$coral = [Drawing.ColorTranslator]::FromHtml('#ff7188')
$amber = [Drawing.ColorTranslator]::FromHtml('#f8d66d')
$blue = [Drawing.ColorTranslator]::FromHtml('#72b7ff')
$text = [Drawing.ColorTranslator]::FromHtml('#ecf7ff')
$muted = [Drawing.ColorTranslator]::FromHtml('#9fb3c5')

function New-Canvas([string] $Title, [int] $Height) {
  $bitmap = [Drawing.Bitmap]::new(1800, $Height)
  $graphics = [Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear($background)
  $font = [Drawing.Font]::new('Segoe UI', 26, [Drawing.FontStyle]::Bold)
  $graphics.DrawString($Title, $font, [Drawing.SolidBrush]::new($text), 60, 45)
  $font.Dispose()
  return @{ Bitmap = $bitmap; Graphics = $graphics }
}

function Save-Canvas($Canvas, [string] $Name) {
  try { $Canvas.Bitmap.Save((Join-Path $analysisPath $Name), [Drawing.Imaging.ImageFormat]::Png) }
  finally { $Canvas.Graphics.Dispose(); $Canvas.Bitmap.Dispose() }
}

function New-BarChart {
  param([string] $Name, [string] $Title, [object[]] $Rows, [double] $Maximum = 0)
  $height = [Math]::Max(420, 190 + 72 * $Rows.Count)
  $canvas = New-Canvas $Title $height
  $g = $canvas.Graphics
  $font = [Drawing.Font]::new('Consolas', 12)
  if ($Maximum -le 0) { $Maximum = ($Rows | ForEach-Object { [double]$_.Value } | Measure-Object -Maximum).Maximum }
  if ($Maximum -le 0) { $Maximum = 1 }
  for ($i = 0; $i -lt $Rows.Count; $i++) {
    $row = $Rows[$i]
    $y = 135 + $i * 72
    $g.DrawString([string]$row.Label, $font, [Drawing.SolidBrush]::new($text), 60, $y + 8)
    $g.FillRectangle([Drawing.SolidBrush]::new($panel), 600, $y, 1010, 34)
    $width = [Math]::Max(1, [Math]::Round(([double]$row.Value / $Maximum) * 1010))
    $g.FillRectangle([Drawing.SolidBrush]::new($teal), 600, $y, $width, 34)
    $g.DrawString(([double]$row.Value).ToString('N3'), $font, [Drawing.SolidBrush]::new($muted), 1630, $y + 8)
  }
  $font.Dispose()
  Save-Canvas $canvas $Name
}

function New-ForestChart {
  param([string] $Name, [string] $Title, [object[]] $Rows)
  $height = [Math]::Max(420, 190 + 72 * $Rows.Count)
  $canvas = New-Canvas $Title $height
  $g = $canvas.Graphics
  $font = [Drawing.Font]::new('Consolas', 12)
  $maximum = ($Rows | ForEach-Object { [Math]::Max([Math]::Abs([double]$_.Low), [Math]::Abs([double]$_.High)) } | Measure-Object -Maximum).Maximum
  if ($maximum -le 0) { $maximum = 1 }
  $barX = 600; $barWidth = 1010; $center = $barX + $barWidth / 2; $scale = ($barWidth / 2) / $maximum
  for ($i = 0; $i -lt $Rows.Count; $i++) {
    $row = $Rows[$i]; $value = [double]$row.Value; $y = 135 + $i * 72; $mid = $y + 17
    $g.DrawString([string]$row.Label, $font, [Drawing.SolidBrush]::new($text), 60, $y + 8)
    $g.FillRectangle([Drawing.SolidBrush]::new($panel), $barX, $y, $barWidth, 34)
    $g.DrawLine([Drawing.Pen]::new($text, 2), $center, $y - 4, $center, $y + 38)
    $color = if ($value -lt 0) { $coral } else { $teal }
    $low = $center + [double]$row.Low * $scale; $high = $center + [double]$row.High * $scale; $point = $center + $value * $scale
    $g.DrawLine([Drawing.Pen]::new($color, 5), $low, $mid, $high, $mid)
    $g.FillEllipse([Drawing.SolidBrush]::new($color), $point - 8, $mid - 8, 16, 16)
    $g.DrawString(('{0:N3} pp' -f ($value * 100)), $font, [Drawing.SolidBrush]::new($muted), 1630, $y + 8)
  }
  $font.Dispose()
  Save-Canvas $canvas $Name
}

function Convert-EffectRows($Rows, [string] $LabelProperty = 'level') {
  return @($Rows | ForEach-Object {
    $label = $_.PSObject.Properties[$LabelProperty].Value
    @{ Label = $label; Value = $_.mean; Low = $_.ci95[0]; High = $_.ci95[1] }
  })
}

$funnel = $assessment.artilleryFunnel
New-BarChart '01-artillery-funnel.png' 'Artillery decision and resolution funnel' @(
  @{ Label = 'phases considered'; Value = $funnel.considered },
  @{ Label = 'shells declared'; Value = $funnel.declared },
  @{ Label = 'shells fired'; Value = $funnel.fired },
  @{ Label = 'flare established'; Value = $funnel.flareEstablished },
  @{ Label = 'hostile shells blocked'; Value = $funnel.hostileBlocked }
)
New-BarChart '02-why-artillery-fired.png' 'Why artillery fired or passed' @(
  $assessment.artilleryReasons.PSObject.Properties | Sort-Object Value -Descending | ForEach-Object { @{ Label = $_.Name; Value = $_.Value } }
)
$downstream = $assessment.downstreamAttribution
New-BarChart '03-downstream-attribution.png' 'From shell to downstream outcome' @(
  @{ Label = 'reload events'; Value = $downstream.reloads },
  @{ Label = 'flare-generated artifacts'; Value = $downstream.flareArtifactsGenerated },
  @{ Label = 'flare-added unsound accepts'; Value = $downstream.flareUnsoundAccepts },
  @{ Label = 'flare-induced drift defeats'; Value = $downstream.flareDriftDefeatsInduced }
)
$solo = @($assessment.doctrineContrasts | Where-Object { !$_.treatment.StartsWith('combined') } | ForEach-Object {
  @{ Label = "$($_.doctrine.Replace('v3-', '')) / $($_.treatment.Split(':')[1])"; Value = $_.score.mean; Low = $_.score.ci95[0]; High = $_.score.ci95[1] }
})
New-ForestChart '04-solo-doctrine-effect.png' 'Causal artillery lift: solo loadouts' $solo
$combined = @($assessment.doctrineContrasts | Where-Object { $_.treatment.StartsWith('combined') } | ForEach-Object {
  @{ Label = "$($_.doctrine.Replace('v3-', '')) / $($_.treatment.Split(':')[1])"; Value = $_.score.mean; Low = $_.score.ci95[0]; High = $_.score.ci95[1] }
})
New-ForestChart '05-combined-doctrine-effect.png' 'Causal artillery lift: combined arms' $combined
$reload = @($assessment.reloadContrasts | ForEach-Object {
  @{ Label = "$($_.doctrine.Replace('v3-', '')) / $($_.supply)"; Value = $_.score.mean; Low = $_.score.ci95[0]; High = $_.score.ci95[1] }
})
New-ForestChart '06-reload-increment.png' 'Incremental value of reload' $reload
New-ForestChart '07-reload-effect-by-scenario.png' 'Flare-only reload effect by scenario' (Convert-EffectRows $assessment.reloadSoloEffects.byScenario)
New-ForestChart '08-reload-effect-by-soundness.png' 'Flare-only reload effect by soundness' (Convert-EffectRows $assessment.reloadSoloEffects.bySoundness)
New-ForestChart '09-reload-effect-by-spatial-pressure.png' 'Flare-only reload effect by spatial pressure' (Convert-EffectRows $assessment.reloadSoloEffects.bySpatialPressure)
New-BarChart '10-uap-rejection-reasons.png' 'UAP plan rejection reasons' @(
  $assessment.uapQualityGate.byReason.PSObject.Properties | ForEach-Object { @{ Label = $_.Name; Value = $_.Value } }
)

$auditRows = @($assessment.desperationAudit.requestedElements)
$height = [Math]::Max(520, 190 + 68 * $auditRows.Count)
$canvas = New-Canvas 'Desperation Artillery identifiability audit' $height
$g = $canvas.Graphics
$font = [Drawing.Font]::new('Consolas', 11)
$bold = [Drawing.Font]::new('Consolas', 11, [Drawing.FontStyle]::Bold)
for ($i = 0; $i -lt $auditRows.Count; $i++) {
  $row = $auditRows[$i]; $y = 135 + $i * 68
  $g.DrawString([string]$row.element, $font, [Drawing.SolidBrush]::new($text), 60, $y + 8)
  $color = if ($row.status -eq 'present') { $teal } elseif ($row.status.StartsWith('partial')) { $amber } else { $coral }
  $g.FillRectangle([Drawing.SolidBrush]::new($color), 1280, $y, 430, 34)
  $g.DrawString([string]$row.status, $bold, [Drawing.SolidBrush]::new($background), 1300, $y + 7)
}
$font.Dispose(); $bold.Dispose()
Save-Canvas $canvas '11-hail-mary-identifiability.png'

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
