[CmdletBinding()]
param([Parameter(Mandatory)][string]$Reference, [Parameter(Mandatory)][string]$ErrorMessage, [string]$Blocker = '')
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib\Fluxo.Common.ps1')
$root = Get-FluxoRoot
$path = Join-Path $root 'fila\vagas.json'
$queue = [Collections.Generic.List[object]]::new()
foreach ($item in @(Get-FluxoArray (Read-FluxoJson -Path $path -Default @()))) { $queue.Add($item) }
$record = $queue | Where-Object { $_.id -eq $Reference -or $_.key -eq $Reference -or $_.identifierOrUrl -eq $Reference } | Select-Object -First 1
if (-not $record) { throw "Item da fila não encontrado: $Reference" }
$maximum = [int](Get-FluxoCampaign).maxConsecutiveFailures
if ($maximum -lt 1) { $maximum = 3 }
$attempts = [int]$record.attempts
if ($attempts -lt 1) { $attempts = 1; $record.attempts = 1 }
$record.lastError = $ErrorMessage
$record.updatedAt = (Get-Date).ToString('o')
$record.status = if ($attempts -ge $maximum) { 'bloqueada' } else { 'na fila' }
Write-FluxoJsonAtomic -Path $path -Value @($queue)
& (Join-Path $PSScriptRoot 'salvar-checkpoint.ps1') -Phase 'falha' -Platform $record.platform -Url $record.identifierOrUrl -ApplicationKey $record.key -Notes $ErrorMessage -Blocker $Blocker -ConsecutiveFailures $attempts | Out-Null
[pscustomobject]@{ reference=$record.id; attempts=$attempts; maximum=$maximum; status=$record.status; error=$record.lastError; blocker=$Blocker } | ConvertTo-Json -Depth 4
