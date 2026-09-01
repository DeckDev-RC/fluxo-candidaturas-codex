[CmdletBinding()] param([int]$DueWithinDays = 7, [switch]$AsJson)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib\Fluxo.Common.ps1')
$today = (Get-Date).Date
$limit = $today.AddDays($DueWithinDays)
$result = foreach ($item in @(Get-FluxoApplications)) {
    $due = [datetime]::MinValue
    $hasDate = [datetime]::TryParse([string]$item.deadline, [ref]$due)
    if ($item.status -in @('rascunho','pronta para revisão','teste pendente','entrevista') -or ($hasDate -and $due.Date -le $limit)) {
        [pscustomobject]@{
            urgency=if ($hasDate -and $due.Date -lt $today) {'atrasada'} elseif ($hasDate -and $due.Date -le $limit) {'próxima'} else {'sem prazo'}
            deadline=$item.deadline; platform=$item.platform; company=$item.company; role=$item.role
            status=$item.status; nextAction=$item.nextAction; reference=$item.id
        }
    }
}
if ($AsJson) { @($result) | ConvertTo-Json -Depth 5 } else { @($result) | Sort-Object urgency,deadline | Format-Table -AutoSize }
