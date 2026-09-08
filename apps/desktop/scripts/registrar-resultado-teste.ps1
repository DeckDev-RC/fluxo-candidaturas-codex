[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Reference, [Parameter(Mandatory)][string]$TestName,
    [string]$Provider = '', [string]$Url = '', [string]$Status = 'concluído',
    [string]$Score = '', [string]$Total = '', [string]$Evidence = '', [string]$Notes = ''
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib\Fluxo.Common.ps1')
$applications = [Collections.Generic.List[object]]::new()
foreach ($item in @(Get-FluxoApplications)) { $applications.Add($item) }
$record = $applications | Where-Object { $_.id -eq $Reference -or $_.key -eq $Reference -or $_.identifierOrUrl -eq $Reference -or $_.applicationId -eq $Reference } | Select-Object -First 1
if (-not $record) { throw "Candidatura não encontrada: $Reference" }
$now = (Get-Date).ToString('o')
$record.assessment = [pscustomobject][ordered]@{ name=$TestName; provider=$Provider; url=$Url; status=$Status; score=$Score; total=$Total; notes=$Notes; completedAt=$now }
$record.status = if ($Status -eq 'concluído') { 'teste concluído' } else { 'teste pendente' }
$record.nextAction = if ($Status -eq 'concluído') { 'Acompanhar retorno' } else { "Concluir teste: $TestName" }
$record.updatedAt = $now
if ($Evidence) { $record.evidence = @($record.evidence) + @($Evidence) | Select-Object -Unique }
$record.history = @($record.history) + @([pscustomobject]@{ at=$now; type='teste'; status=$Status; note="$TestName - $Score/$Total - $Notes"; evidence=$Evidence })
Save-FluxoApplications -Applications @($applications)
$record.assessment | ConvertTo-Json -Depth 5
