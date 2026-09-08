[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Platform, [Parameter(Mandatory)][string]$Company,
    [Parameter(Mandatory)][string]$Role, [Parameter(Mandatory)][string]$IdentifierOrUrl,
    [ValidateSet('A','B','C')][string]$Priority = 'B', [ValidateRange(0,100)][int]$FitScore = 0,
    [string]$WorkMode = '', [string]$Deadline = '', [string]$Source = 'busca', [string]$Notes = '',
    [switch]$AllowCrossPlatformDuplicate
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib\Fluxo.Common.ps1')
Initialize-FluxoDirectories
$Platform = ConvertTo-FluxoPlatform $Platform
$key = Get-FluxoApplicationKey -Platform $Platform -IdentifierOrUrl $IdentifierOrUrl -Company $Company -Role $Role
$fingerprint = Get-FluxoVacancyFingerprint -Company $Company -Role $Role
$applications = @(Get-FluxoApplications)
if (@($applications | Where-Object key -eq $key).Count) { throw "Já existe candidatura para esta vaga: $IdentifierOrUrl" }
if (-not $AllowCrossPlatformDuplicate -and @($applications | Where-Object { Test-FluxoFingerprintMatch -Item $_ -Fingerprint $fingerprint }).Count) {
    throw "Possível duplicata entre plataformas: $Company - $Role. Use -AllowCrossPlatformDuplicate somente se forem processos diferentes."
}
$path = Join-Path (Get-FluxoRoot) 'fila\vagas.json'
$queue = [Collections.Generic.List[object]]::new()
foreach ($item in @(Get-FluxoArray (Read-FluxoJson -Path $path -Default @()))) { $queue.Add($item) }
if (@($queue | Where-Object key -eq $key).Count) { throw "A vaga já está na fila: $IdentifierOrUrl" }
if (-not $AllowCrossPlatformDuplicate -and @($queue | Where-Object { Test-FluxoFingerprintMatch -Item $_ -Fingerprint $fingerprint }).Count) {
    throw "Possível duplicata na fila: $Company - $Role."
}
$now = (Get-Date).ToString('o')
$item = [pscustomobject][ordered]@{
    id=[guid]::NewGuid().ToString('n'); key=$key; fingerprint=$fingerprint; platform=$Platform; company=$Company; role=$Role
    identifierOrUrl=$IdentifierOrUrl; priority=$Priority; fitScore=$FitScore; workMode=$WorkMode
    deadline=$Deadline; source=$Source; notes=$Notes; status='na fila'; attempts=0; addedAt=$now; updatedAt=$now; lastError=''
}
$queue.Add($item)
Write-FluxoJsonAtomic -Path $path -Value @($queue)
Update-FluxoReports -Applications @(Get-FluxoApplications)
$item | ConvertTo-Json -Depth 5
