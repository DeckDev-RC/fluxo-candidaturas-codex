[CmdletBinding()]
param([Parameter(Mandatory)][string]$JobDescription, [string]$ResumeTextPath = '', [string[]]$RequiredTerms = @(), [string[]]$ExcludedTerms = @())
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib\Fluxo.Common.ps1')
$root = Get-FluxoRoot
if (-not $ResumeTextPath) {
    $ResumeTextPath = Get-ChildItem -LiteralPath (Join-Path $root 'curriculo') -Filter '*.txt' -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName
}
$profilePath = Join-Path $root 'perfil\candidato.md'
$candidateText = ''
if ($ResumeTextPath -and (Test-Path -LiteralPath $ResumeTextPath)) { $candidateText += Get-Content -LiteralPath $ResumeTextPath -Raw }
if (Test-Path -LiteralPath $profilePath) { $candidateText += "`n" + (Get-Content -LiteralPath $profilePath -Raw) }
if (-not $candidateText) { throw 'Perfil ou currículo em texto não encontrado.' }
function Get-Tokens([string]$Text) {
    $stop = @('para','com','uma','das','dos','que','por','the','and','de','do','da','em','no','na','um','a','o','e')
    return @((ConvertTo-FluxoSlug $Text).Split('-') | Where-Object { $_.Length -ge 3 -and $_ -notin $stop } | Select-Object -Unique)
}
$jobTokens = @(Get-Tokens $JobDescription)
$candidateTokens = @(Get-Tokens $candidateText)
$matches = @($jobTokens | Where-Object { $_ -in $candidateTokens })
$missing = @($jobTokens | Where-Object { $_ -notin $candidateTokens })
$requiredMissing = @($RequiredTerms | Where-Object { $candidateText -notmatch [regex]::Escape($_) })
$excludedFound = @($ExcludedTerms | Where-Object { $JobDescription -match [regex]::Escape($_) })
$score = if ($jobTokens.Count) { [Math]::Round(100 * $matches.Count / $jobTokens.Count) } else { 0 }
$classification = if ($requiredMissing.Count -or $excludedFound.Count) { 'não aplicar' } elseif ($score -ge 65) { 'A' } elseif ($score -ge 40) { 'B' } else { 'C' }
[pscustomobject]@{ score=$score; classification=$classification; matchedTerms=$matches; missingRequired=$requiredMissing; excludedFound=$excludedFound; notableMissing=($missing | Select-Object -First 20) } | ConvertTo-Json -Depth 5
