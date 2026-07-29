[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string] $ReportPath,
  [int] $MinimumRuns = 1
)

$ErrorActionPreference = 'Stop'
$report = Get-Content -LiteralPath $ReportPath -Raw | ConvertFrom-Json
if ($report.runs -lt $MinimumRuns) { throw "report contains $($report.runs) runs; minimum is $MinimumRuns" }
if (-not $report.cells -or $report.cells.Count -eq 0) { throw 'report has no aggregate cells' }
if ($report.cells | Where-Object { $_.winRate -lt 0 -or $_.winRate -gt 1 }) { throw 'report contains an invalid win rate' }
if ($report.cells | Where-Object { $_.winRate95.Count -ne 2 }) { throw 'report contains an invalid confidence interval' }
$defaultLessons = @($report.lessonSeparation | Where-Object { $_.compositionId -like '*:default' })
if ($defaultLessons.Count -eq 0) { throw 'report has no default tuning lesson separation' }
if ($defaultLessons | Where-Object { $_.delta -lt -0.25 }) { throw 'default tuning reverses the intended lesson by more than 0.25' }
Write-Host "LAB GATE PASS: runs=$($report.runs) cells=$($report.cells.Count) defaultLessonChecks=$($defaultLessons.Count)" -ForegroundColor Green
