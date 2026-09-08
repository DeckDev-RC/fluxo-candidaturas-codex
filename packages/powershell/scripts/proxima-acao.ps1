[CmdletBinding()] param([string]$Platform = '', [switch]$Claim, [switch]$AsJson)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib\Fluxo.Common.ps1')
$root = Get-FluxoRoot
$path = Join-Path $root 'fila\vagas.json'
$queue = [Collections.Generic.List[object]]::new()
foreach ($item in @(Get-FluxoArray (Read-FluxoJson -Path $path -Default @()))) { $queue.Add($item) }
$applications = @(Get-FluxoApplications)
$campaign = Get-FluxoCampaign
$submittedStatuses = @('enviada','triagem','teste pendente','teste concluído','entrevista','proposta','rejeitada','encerrada')
$eligiblePlatforms = [Collections.Generic.List[string]]::new()
foreach ($config in @($campaign.platforms)) {
    if (-not $config.enabled) { continue }
    $done = @($applications | Where-Object { $_.platform -eq $config.name -and $_.status -in $submittedStatuses }).Count
    if ([int]$config.goal -gt 0 -and $done -lt [int]$config.goal) { $eligiblePlatforms.Add([string]$config.name) }
}
if ($Platform) { $eligiblePlatforms = [Collections.Generic.List[string]]@((ConvertTo-FluxoPlatform $Platform)) }
$rank = @{ A=1; B=2; C=3 }
$next = $queue | Where-Object { $_.status -eq 'na fila' -and $_.platform -in $eligiblePlatforms } |
    Sort-Object @{Expression={ $rank[[string]$_.priority] }}, @{Expression='fitScore';Descending=$true}, @{Expression='deadline'}, @{Expression='addedAt'} |
    Select-Object -First 1
if (-not $next) { Write-Host 'Nenhuma vaga elegível na fila.'; exit 2 }
if ($Claim) {
    $next.status = 'em andamento'; $next.attempts = [int]$next.attempts + 1; $next.updatedAt = (Get-Date).ToString('o')
    Write-FluxoJsonAtomic -Path $path -Value @($queue)
    & (Join-Path $PSScriptRoot 'salvar-checkpoint.ps1') -Phase 'vaga selecionada' -Platform $next.platform -Url $next.identifierOrUrl -ApplicationKey $next.key -Notes "Tentativa $($next.attempts)" | Out-Null
}
if ($AsJson) { $next | ConvertTo-Json -Depth 6 } else { $next | Format-List }
