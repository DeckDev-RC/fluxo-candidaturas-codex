[CmdletBinding()] param([switch]$AsJson)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib\Fluxo.Common.ps1')
$root = Get-FluxoRoot
$checkpoint = Read-FluxoJson -Path (Join-Path $root 'estado\checkpoint.json') -Default $null
$campaign = Get-FluxoCampaign
$applications = @(Get-FluxoApplications)
$queue = @(Get-FluxoArray (Read-FluxoJson -Path (Join-Path $root 'fila\vagas.json') -Default @()))
$summary = [pscustomobject][ordered]@{
    campaign=$campaign.name; totalGoal=$campaign.totalGoal; applicationRecords=$applications.Count
    queued=@($queue | Where-Object status -eq 'na fila').Count
    inProgress=@($queue | Where-Object status -eq 'em andamento').Count
    blocked=@($queue | Where-Object status -eq 'bloqueada').Count
    checkpoint=$checkpoint
}
if ($AsJson) { $summary | ConvertTo-Json -Depth 8 }
else {
    $summary | Select-Object campaign,totalGoal,applicationRecords,queued,inProgress,blocked | Format-List
    if ($checkpoint) { Write-Host 'Checkpoint:' -ForegroundColor Cyan; $checkpoint | Format-List }
    else { Write-Host 'Nenhum checkpoint salvo.' }
}
