[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Reference,
    [Parameter(Mandatory)][ValidateSet('status','verificação','mensagem','entrevista','teste','observação','erro')][string]$Type,
    [string]$Status = '', [string]$NextAction = '', [string]$Deadline = '', [string]$Note = '', [string]$Evidence = ''
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib\Fluxo.Common.ps1')
$applications = [Collections.Generic.List[object]]::new()
foreach ($item in @(Get-FluxoApplications)) { $applications.Add($item) }
$record = $applications | Where-Object { $_.id -eq $Reference -or $_.key -eq $Reference -or $_.identifierOrUrl -eq $Reference -or $_.applicationId -eq $Reference } | Select-Object -First 1
if (-not $record) { throw "Candidatura não encontrada: $Reference" }
$now = (Get-Date).ToString('o')
if ($Status) { $record.status = $Status }
if ($NextAction) { $record.nextAction = $NextAction }
if ($Deadline) { $record.deadline = $Deadline }
if ($Type -eq 'verificação') { $record.lastCheckedAt = $now }
if ($Evidence) { $record.evidence = @($record.evidence) + @($Evidence) | Select-Object -Unique }
$record.updatedAt = $now
$record.history = @($record.history) + @([pscustomobject]@{ at=$now; type=$Type; status=$Status; note=$Note; evidence=$Evidence })
Save-FluxoApplications -Applications @($applications)
$record | ConvertTo-Json -Depth 8
