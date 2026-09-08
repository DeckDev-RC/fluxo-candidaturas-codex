Set-StrictMode -Version Latest

function Get-FluxoRoot {
    return [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
}

function Initialize-FluxoDirectories {
    $root = Get-FluxoRoot
    foreach ($relative in @('campanha', 'candidaturas', 'curriculo', 'estado', 'evidencias', 'fila', 'mensagens', 'perfil')) {
        New-Item -ItemType Directory -Path (Join-Path $root $relative) -Force | Out-Null
    }
}

function Read-FluxoEnvValue {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][ValidatePattern('^[A-Z0-9_]+$')][string]$Name,
        [string]$Default = '',
        [string]$Path = (Join-Path (Get-FluxoRoot) '.env')
    )

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $Default }
    foreach ($line in [IO.File]::ReadLines($Path)) {
        if ($line -match '^\s*#' -or [string]::IsNullOrWhiteSpace($line)) { continue }
        $separator = $line.IndexOf('=')
        if ($separator -lt 1) { continue }
        $key = $line.Substring(0, $separator).Trim()
        if ($key -cne $Name) { continue }
        $value = $line.Substring($separator + 1).Trim()
        if ($value.Length -ge 2 -and (($value[0] -eq '"' -and $value[-1] -eq '"') -or ($value[0] -eq "'" -and $value[-1] -eq "'"))) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        if ($value -eq '') { return $Default }
        return $value.Replace('\n', "`n").Replace('\"', '"').Replace('\\', '\')
    }
    return $Default
}

function ConvertTo-FluxoBoolean {
    param([AllowNull()][object]$Value, [bool]$Default = $false)
    if ($null -eq $Value) { return $Default }
    $text = ([string]$Value).Trim().ToLowerInvariant()
    if ($text -in @('1', 'true', 'sim', 's', 'yes', 'y')) { return $true }
    if ($text -in @('0', 'false', 'nao', 'não', 'n', 'no')) { return $false }
    return $Default
}

function ConvertTo-FluxoInt {
    param([AllowNull()][object]$Value, [int]$Default = 0)
    $number = 0
    if ($null -ne $Value -and [int]::TryParse(([string]$Value), [ref]$number)) { return $number }
    return $Default
}

function Read-FluxoJson {
    param([Parameter(Mandatory)][string]$Path, [AllowNull()][object]$Default = $null)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $Default }
    $raw = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
    if ([string]::IsNullOrWhiteSpace($raw)) { return $Default }
    return $raw | ConvertFrom-Json
}

function Write-FluxoJsonAtomic {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][AllowEmptyCollection()][object]$Value,
        [int]$Depth = 12
    )
    $fullPath = [IO.Path]::GetFullPath($Path)
    $directory = Split-Path -Parent $fullPath
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
    $temporary = "$fullPath.$PID.tmp"
    $json = ConvertTo-Json -InputObject $Value -Depth $Depth
    Set-Content -LiteralPath $temporary -Value $json -Encoding UTF8
    $moved = $false
    for ($attempt = 1; $attempt -le 4; $attempt++) {
        try {
            Move-Item -LiteralPath $temporary -Destination $fullPath -Force -ErrorAction Stop
            $moved = $true
            break
        }
        catch {
            if ($attempt -lt 4) { Start-Sleep -Milliseconds (100 * $attempt) }
        }
    }
    if (-not $moved) {
        if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue }
        throw "Não foi possível atualizar o arquivo JSON: $fullPath"
    }
}

function Backup-FluxoFile {
    param([Parameter(Mandatory)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $null }
    $source = [IO.Path]::GetFullPath($Path)
    $parent = Split-Path -Parent $source
    $backupDirectory = Join-Path $parent 'backups'
    New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null
    $baseName = [IO.Path]::GetFileNameWithoutExtension($source)
    $extension = [IO.Path]::GetExtension($source)
    $backup = Join-Path $backupDirectory "$baseName-$(Get-Date -Format 'yyyyMMdd-HHmmss-fff')$extension"
    Copy-Item -LiteralPath $source -Destination $backup
    return $backup
}

function ConvertTo-FluxoSlug {
    param([AllowNull()][string]$Value)
    if ([string]::IsNullOrWhiteSpace($Value)) { return 'item' }
    $normalized = $Value.Normalize([Text.NormalizationForm]::FormD)
    $builder = [Text.StringBuilder]::new()
    foreach ($character in $normalized.ToCharArray()) {
        if ([Globalization.CharUnicodeInfo]::GetUnicodeCategory($character) -ne [Globalization.UnicodeCategory]::NonSpacingMark) {
            [void]$builder.Append($character)
        }
    }
    $slug = $builder.ToString().Normalize([Text.NormalizationForm]::FormC).ToLowerInvariant()
    $slug = ($slug -replace '[^a-z0-9]+', '-').Trim('-')
    if ($slug) { return $slug }
    return 'item'
}

function ConvertTo-FluxoPlatform {
    param([Parameter(Mandatory)][string]$Value)
    $slug = ConvertTo-FluxoSlug $Value
    switch -Regex ($slug) {
        '^gupy' { return 'GUPY' }
        'infojobs' { return 'INFOJOBS' }
        'pandape' { return 'PANDAPE' }
        'linkedin' { return 'LINKEDIN' }
        'catho' { return 'CATHO' }
        '^vagas' { return 'VAGASCOM' }
        'solides' { return 'SOLIDES' }
        default { return $Value.Trim().ToUpperInvariant() }
    }
}

function Escape-FluxoMarkdownCell {
    param([AllowNull()][object]$Value)
    if ($null -eq $Value) { return '' }
    return ([string]$Value).Replace('|', '\|').Replace("`r", ' ').Replace("`n", '<br>').Trim()
}

function Get-FluxoApplicationKey {
    param(
        [Parameter(Mandatory)][string]$Platform,
        [AllowEmptyString()][string]$IdentifierOrUrl,
        [AllowEmptyString()][string]$Company,
        [AllowEmptyString()][string]$Role
    )
    $identity = if (-not [string]::IsNullOrWhiteSpace($IdentifierOrUrl)) { $IdentifierOrUrl.Trim().TrimEnd('/').ToLowerInvariant() } else { "$(ConvertTo-FluxoSlug $Company)|$(ConvertTo-FluxoSlug $Role)" }
    return "$(ConvertTo-FluxoPlatform $Platform)|$identity"
}

function Get-FluxoVacancyFingerprint {
    param([Parameter(Mandatory)][string]$Company, [Parameter(Mandatory)][string]$Role)
    return "$(ConvertTo-FluxoSlug $Company)|$(ConvertTo-FluxoSlug $Role)"
}

function Test-FluxoFingerprintMatch {
    param([Parameter(Mandatory)][object]$Item, [Parameter(Mandatory)][string]$Fingerprint)
    if ($Item.PSObject.Properties.Name -contains 'fingerprint' -and $Item.fingerprint) { return $Item.fingerprint -eq $Fingerprint }
    return (Get-FluxoVacancyFingerprint -Company ([string]$Item.company) -Role ([string]$Item.role)) -eq $Fingerprint
}

function Get-FluxoArray {
    param([AllowNull()][object]$Value)
    if ($null -eq $Value) { return @() }
    return @($Value)
}

function Get-FluxoApplications {
    $path = Join-Path (Get-FluxoRoot) 'candidaturas\candidaturas.json'
    return @(Get-FluxoArray (Read-FluxoJson -Path $path -Default @()))
}

function Save-FluxoApplications {
    param([Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Applications)
    $root = Get-FluxoRoot
    Write-FluxoJsonAtomic -Path (Join-Path $root 'candidaturas\candidaturas.json') -Value @($Applications)
    Update-FluxoReports -Applications @($Applications)
}

function Get-FluxoCampaign {
    $root = Get-FluxoRoot
    $path = Join-Path $root 'campanha\config.json'
    $campaign = Read-FluxoJson -Path $path -Default $null
    if ($null -ne $campaign) { return $campaign }

    $platforms = [Collections.Generic.List[object]]::new()
    foreach ($name in @('GUPY', 'INFOJOBS', 'PANDAPE', 'LINKEDIN', 'CATHO', 'VAGASCOM', 'SOLIDES')) {
        $platforms.Add([pscustomobject]@{
            name = $name
            enabled = ConvertTo-FluxoBoolean (Read-FluxoEnvValue -Name "${name}_ENABLED" -Default 'false')
            goal = ConvertTo-FluxoInt (Read-FluxoEnvValue -Name "${name}_GOAL" -Default '0')
        })
    }
    return [pscustomobject]@{
        name = 'Campanha padrão'
        createdAt = (Get-Date).ToString('o')
        totalGoal = ConvertTo-FluxoInt (Read-FluxoEnvValue -Name 'CAMPAIGN_TOTAL_GOAL' -Default '60') 60
        dailyGoal = ConvertTo-FluxoInt (Read-FluxoEnvValue -Name 'CAMPAIGN_DAILY_GOAL' -Default '5') 5
        weeklyGoal = ConvertTo-FluxoInt (Read-FluxoEnvValue -Name 'CAMPAIGN_WEEKLY_GOAL' -Default '20') 20
        maxConsecutiveFailures = ConvertTo-FluxoInt (Read-FluxoEnvValue -Name 'MAX_CONSECUTIVE_FAILURES' -Default '3') 3
        platforms = @($platforms)
    }
}

function Update-FluxoReports {
    param([Parameter(Mandatory)][AllowEmptyCollection()][object[]]$Applications)
    $root = Get-FluxoRoot
    $campaign = Get-FluxoCampaign
    $submittedStatuses = @('enviada', 'triagem', 'teste pendente', 'teste concluído', 'entrevista', 'proposta', 'rejeitada', 'encerrada')
    $lines = [Collections.Generic.List[string]]::new()
    $lines.Add('# Controle de candidaturas')
    $lines.Add('')
    $lines.Add("Atualizado em: $((Get-Date).ToString('yyyy-MM-dd HH:mm:ss zzz'))")
    $lines.Add('')
    $lines.Add('| Data | Plataforma | Empresa | Vaga | ID/URL | Modalidade | Currículo | Status | Próxima ação | Prazo | Resultado | Evidência | Observações |')
    $lines.Add('|---|---|---|---|---|---|---|---|---|---|---|---|---|')
    foreach ($item in @($Applications | Sort-Object appliedAt, createdAt -Descending)) {
        $result = ''
        if ($item.PSObject.Properties.Name -contains 'assessment' -and $null -ne $item.assessment) {
            $score = if ($item.assessment.PSObject.Properties.Name -contains 'score') { $item.assessment.score } else { '' }
            $total = if ($item.assessment.PSObject.Properties.Name -contains 'total') { $item.assessment.total } else { '' }
            if ($score -ne '') { $result = if ($total -ne '') { "$score/$total" } else { [string]$score } }
        }
        $evidence = if ($item.PSObject.Properties.Name -contains 'evidence' -and $item.evidence) { (@($item.evidence) -join ', ') } else { '' }
        $lines.Add(('| {0} | {1} | {2} | {3} | {4} | {5} | {6} | {7} | {8} | {9} | {10} | {11} | {12} |' -f @(
            (Escape-FluxoMarkdownCell $item.appliedAt), (Escape-FluxoMarkdownCell $item.platform),
            (Escape-FluxoMarkdownCell $item.company), (Escape-FluxoMarkdownCell $item.role),
            (Escape-FluxoMarkdownCell $item.identifierOrUrl), (Escape-FluxoMarkdownCell $item.workMode),
            (Escape-FluxoMarkdownCell $item.resume), (Escape-FluxoMarkdownCell $item.status),
            (Escape-FluxoMarkdownCell $item.nextAction), (Escape-FluxoMarkdownCell $item.deadline),
            (Escape-FluxoMarkdownCell $result), (Escape-FluxoMarkdownCell $evidence),
            (Escape-FluxoMarkdownCell $item.notes)
        )))
    }
    Set-Content -LiteralPath (Join-Path $root 'candidaturas\controle-candidaturas.md') -Value $lines -Encoding UTF8

    $dashboard = [Collections.Generic.List[string]]::new()
    $submitted = @($Applications | Where-Object { $_.status -in $submittedStatuses })
    $dashboard.Add('# Painel da campanha')
    $dashboard.Add('')
    $dashboard.Add("- Meta total: $($campaign.totalGoal)")
    $dashboard.Add("- Candidaturas confirmadas: $($submitted.Count)")
    $dashboard.Add("- Restantes: $([Math]::Max(0, [int]$campaign.totalGoal - $submitted.Count))")
    $dashboard.Add("- Registros totais: $($Applications.Count)")
    $dashboard.Add('')
    $dashboard.Add('## Progresso por plataforma')
    $dashboard.Add('')
    $dashboard.Add('| Plataforma | Meta | Confirmadas | Restantes | Na fila |')
    $dashboard.Add('|---|---:|---:|---:|---:|')
    $queue = @(Get-FluxoArray (Read-FluxoJson -Path (Join-Path $root 'fila\vagas.json') -Default @()))
    foreach ($platform in @($campaign.platforms)) {
        $done = @($submitted | Where-Object platform -eq $platform.name).Count
        $queued = @($queue | Where-Object { $_.platform -eq $platform.name -and $_.status -eq 'na fila' }).Count
        $dashboard.Add("| $(Escape-FluxoMarkdownCell $platform.name) | $($platform.goal) | $done | $([Math]::Max(0, [int]$platform.goal - $done)) | $queued |")
    }
    $dashboard.Add('')
    $dashboard.Add('## Pendências')
    $dashboard.Add('')
    $pending = @($Applications | Where-Object { $_.status -in @('rascunho', 'pronta para revisão', 'teste pendente', 'entrevista') -or $_.nextAction })
    if ($pending.Count -eq 0) { $dashboard.Add('Nenhuma pendência registrada.') }
    else {
        $dashboard.Add('| Plataforma | Empresa | Vaga | Status | Próxima ação | Prazo |')
        $dashboard.Add('|---|---|---|---|---|---|')
        foreach ($item in $pending | Sort-Object deadline) {
            $dashboard.Add("| $(Escape-FluxoMarkdownCell $item.platform) | $(Escape-FluxoMarkdownCell $item.company) | $(Escape-FluxoMarkdownCell $item.role) | $(Escape-FluxoMarkdownCell $item.status) | $(Escape-FluxoMarkdownCell $item.nextAction) | $(Escape-FluxoMarkdownCell $item.deadline) |")
        }
    }
    Set-Content -LiteralPath (Join-Path $root 'candidaturas\painel.md') -Value $dashboard -Encoding UTF8
}
