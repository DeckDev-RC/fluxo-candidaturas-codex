[CmdletBinding()]
param(
    [string]$Platform,
    [string]$Company,
    [string]$Role,
    [string]$IdentifierOrUrl,
    [string]$WorkMode = '',
    [ValidateSet('rascunho', 'pronta para revisão', 'enviada', 'triagem', 'teste pendente', 'teste concluído', 'entrevista', 'proposta', 'rejeitada', 'desistência', 'encerrada')]
    [string]$Status = 'rascunho',
    [string]$NextAction = 'Revisar e enviar',
    [string]$Deadline = '',
    [string]$Notes = '',
    [string]$Resume = '',
    [string]$ApplicationId = '',
    [string[]]$Evidence = @(),
    [switch]$UpdateExisting,
    [switch]$AllowCrossPlatformDuplicate
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib\Fluxo.Common.ps1')
Initialize-FluxoDirectories

function Ask-Required([string]$Value, [string]$Prompt) {
    if (-not [string]::IsNullOrWhiteSpace($Value)) { return $Value.Trim() }
    $answer = (Read-Host $Prompt).Trim()
    if (-not $answer) { throw "$Prompt é obrigatório." }
    return $answer
}

$Platform = ConvertTo-FluxoPlatform (Ask-Required $Platform 'Plataforma')
$Company = Ask-Required $Company 'Empresa'
$Role = Ask-Required $Role 'Vaga'
$IdentifierOrUrl = Ask-Required $IdentifierOrUrl 'ID ou URL'
$key = Get-FluxoApplicationKey -Platform $Platform -IdentifierOrUrl $IdentifierOrUrl -Company $Company -Role $Role
$fingerprint = Get-FluxoVacancyFingerprint -Company $Company -Role $Role
$applications = [Collections.Generic.List[object]]::new()
foreach ($item in @(Get-FluxoApplications)) { $applications.Add($item) }
$existing = $applications | Where-Object key -eq $key | Select-Object -First 1

if ($existing -and -not $UpdateExisting) {
    throw "Candidatura duplicada. Use -UpdateExisting apenas para corrigir o registro existente: $IdentifierOrUrl"
}
if (-not $existing -and -not $AllowCrossPlatformDuplicate) {
    $crossPlatform = $applications | Where-Object { (Test-FluxoFingerprintMatch -Item $_ -Fingerprint $fingerprint) -and $_.key -ne $key } | Select-Object -First 1
    if ($crossPlatform) { throw "Possível candidatura duplicada em $($crossPlatform.platform): $Company - $Role. Use -AllowCrossPlatformDuplicate somente após confirmar que são processos diferentes." }
}

$now = (Get-Date).ToString('o')
if ($existing) {
    foreach ($pair in @{ platform=$Platform; company=$Company; role=$Role; identifierOrUrl=$IdentifierOrUrl; key=$key; updatedAt=$now }.GetEnumerator()) {
        $existing.($pair.Key) = $pair.Value
    }
    if ($existing.PSObject.Properties.Name -contains 'fingerprint') { $existing.fingerprint = $fingerprint }
    else { $existing | Add-Member -NotePropertyName fingerprint -NotePropertyValue $fingerprint }
    $optionalUpdates = @{
        WorkMode='workMode'; Status='status'; NextAction='nextAction'; Deadline='deadline'; Notes='notes';
        Resume='resume'; ApplicationId='applicationId'
    }
    foreach ($parameterName in $optionalUpdates.Keys) {
        if ($PSBoundParameters.ContainsKey($parameterName)) {
            $propertyName = $optionalUpdates[$parameterName]
            $existing.$propertyName = Get-Variable -Name $parameterName -ValueOnly
        }
    }
    if ($PSBoundParameters.ContainsKey('Evidence') -and $Evidence.Count) { $existing.evidence = @($existing.evidence) + @($Evidence) | Select-Object -Unique }
    if (-not $existing.appliedAt -and $existing.status -in @('enviada','triagem','teste pendente','teste concluído','entrevista','proposta','rejeitada','encerrada')) {
        $existing.appliedAt = (Get-Date).ToString('yyyy-MM-dd')
    }
    $existing.history = @($existing.history) + @([pscustomobject]@{ at=$now; type='atualização'; status=$existing.status; note=$Notes })
    $record = $existing
}
else {
    $record = [pscustomobject][ordered]@{
        id = [guid]::NewGuid().ToString('n'); key = $key; fingerprint = $fingerprint; platform = $Platform; company = $Company; role = $Role
        identifierOrUrl = $IdentifierOrUrl; applicationId = $ApplicationId; workMode = $WorkMode; resume = $Resume
        status = $Status; nextAction = $NextAction; deadline = $Deadline; notes = $Notes; source = 'manual'
        createdAt = $now
        appliedAt = if ($Status -in @('enviada','triagem','teste pendente','teste concluído','entrevista','proposta','rejeitada','encerrada')) { (Get-Date).ToString('yyyy-MM-dd') } else { '' }
        updatedAt = $now; lastCheckedAt = ''; evidence = @($Evidence); assessment = $null
        history = @([pscustomobject]@{ at=$now; type='registro'; status=$Status; note=$Notes })
    }
    $applications.Add($record)
}

Save-FluxoApplications -Applications @($applications)
$queuePath = Join-Path (Get-FluxoRoot) 'fila\vagas.json'
$queue = [Collections.Generic.List[object]]::new()
foreach ($item in @(Get-FluxoArray (Read-FluxoJson -Path $queuePath -Default @()))) { $queue.Add($item) }
$queueItem = $queue | Where-Object key -eq $key | Select-Object -First 1
if ($queueItem) {
    $queueItem.status = if ($record.status -eq 'rascunho') { 'em andamento' } else { 'processada' }
    $queueItem.updatedAt = $now
    Write-FluxoJsonAtomic -Path $queuePath -Value @($queue)
}
$record | ConvertTo-Json -Depth 8
