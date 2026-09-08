[CmdletBinding()]
param([switch]$SkipPreflight)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib\Fluxo.Common.ps1')

$FlowRoot = Split-Path -Parent $PSScriptRoot
$ProfileDir = Join-Path $FlowRoot 'perfil'
$ResumeDir = Join-Path $FlowRoot 'curriculo'
$ApplicationsDir = Join-Path $FlowRoot 'candidaturas'
$ProfilePath = Join-Path $ProfileDir 'candidato.md'
$ApplicationsPath = Join-Path $ApplicationsDir 'controle-candidaturas.md'
$EnvPath = Join-Path $FlowRoot '.env'
$EnvExamplePath = Join-Path $FlowRoot '.env.example'

New-Item -ItemType Directory -Path $ProfileDir, $ResumeDir, $ApplicationsDir -Force | Out-Null
if (-not (Test-Path -LiteralPath $EnvPath) -and (Test-Path -LiteralPath $EnvExamplePath)) {
    Copy-Item -LiteralPath $EnvExamplePath -Destination $EnvPath
}

function Ask-Value {
    param(
        [Parameter(Mandatory)][string]$Prompt,
        [string]$Default = ''
    )

    $suffix = if ($Default) { " [$Default]" } else { '' }
    $value = Read-Host "$Prompt$suffix"
    if ([string]::IsNullOrWhiteSpace($value)) { return $Default }
    return $value.Trim()
}

function Ask-YesNo {
    param(
        [Parameter(Mandatory)][string]$Prompt,
        [bool]$Default = $false
    )

    $hint = if ($Default) { 'S/n' } else { 's/N' }
    $answer = Read-Host "$Prompt [$hint]"
    if ([string]::IsNullOrWhiteSpace($answer)) { return $Default }
    return $answer.Trim().ToLowerInvariant() -in @('s', 'sim', 'y', 'yes')
}

function Ask-Integer {
    param(
        [Parameter(Mandatory)][string]$Prompt,
        [int]$Default = 0
    )
    while ($true) {
        $answer = Read-Host "$Prompt [$Default]"
        if ([string]::IsNullOrWhiteSpace($answer)) { return $Default }
        $number = 0
        if ([int]::TryParse($answer.Trim(), [ref]$number) -and $number -ge 0) { return $number }
        Write-Warning 'Informe um número inteiro igual ou maior que zero.'
    }
}

function Escape-Markdown {
    param([AllowNull()][string]$Value)
    if ($null -eq $Value) { return '' }
    return $Value.Replace('|', '\|').Trim()
}

function ConvertTo-DotEnvValue {
    param([AllowNull()][string]$Value)
    if ($null -eq $Value) { $Value = '' }
    $escaped = $Value.Replace('\', '\\').Replace('"', '\"').Replace("`r", '').Replace("`n", '\n')
    return '"' + $escaped + '"'
}

function Read-PlainSecret {
    param([Parameter(Mandatory)][string]$Prompt)
    $secure = Read-Host $Prompt -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
}

Write-Host ''
Write-Host '=== Onboarding de candidaturas ===' -ForegroundColor Cyan
Write-Host 'As respostas gerarão um perfil privado para consulta do agente.'
Write-Host ''

$name = Ask-Value 'Nome completo'
$socialName = Ask-Value 'Nome social ou nome preferido (opcional)'
$email = Ask-Value 'E-mail profissional'
$phone = Ask-Value 'Telefone/WhatsApp'
$location = Ask-Value 'Cidade, estado e país'
$linkedin = Ask-Value 'URL do LinkedIn (opcional)'
$github = Ask-Value 'URL do GitHub (opcional)'
$portfolio = Ask-Value 'URL do portfólio/site (opcional)'

Write-Host ''
Write-Host '--- Objetivo profissional ---' -ForegroundColor Cyan
$targetRoles = Ask-Value 'Cargos-alvo, separados por vírgula'
$seniority = Ask-Value 'Senioridade desejada'
$technicalFocus = Ask-Value 'Tecnologias e áreas que deseja priorizar'
$secondarySkills = Ask-Value 'Tecnologias secundárias que aceita usar'
$workModes = Ask-Value 'Modalidades aceitas (remoto, híbrido, presencial)'
$acceptedLocations = Ask-Value 'Localidades aceitas'
$contracts = Ask-Value 'Tipos de contrato aceitos'
$minimumSalary = Ask-Value 'Pretensão salarial mínima'
$targetSalary = Ask-Value 'Pretensão salarial alvo'
$industries = Ask-Value 'Setores ou tipos de empresa preferidos'
$exclusions = Ask-Value 'Vagas, tecnologias, locais ou condições a excluir'
$availability = Ask-Value 'Disponibilidade para início'

Write-Host ''
Write-Host '--- Meta da campanha ---' -ForegroundColor Cyan
$totalGoal = Ask-Integer 'Meta total de candidaturas' 60
$dailyGoal = Ask-Integer 'Meta diária de candidaturas' 5
$weeklyGoal = Ask-Integer 'Meta semanal de candidaturas' 20
$deadline = Ask-Value 'Prazo da campanha (data ou período)'
$platforms = Ask-Value 'Plataformas prioritárias' 'Gupy, InfoJobs, LinkedIn, Catho, Vagas.com, Sólides'
$gupyGoal = Ask-Integer 'Meta na Gupy' 30
$infoJobsGoal = Ask-Integer 'Meta no InfoJobs' 30
$pandaPeGoal = Ask-Integer 'Meta no PandaPé (testes/convites)' 0
$linkedInGoal = Ask-Integer 'Meta no LinkedIn' 0
$cathoGoal = Ask-Integer 'Meta na Catho' 0
$vagasComGoal = Ask-Integer 'Meta no Vagas.com' 0
$solidesGoal = Ask-Integer 'Meta na Sólides' 0

Write-Host ''
Write-Host '--- Formação e experiência ---' -ForegroundColor Cyan
$education = Ask-Value 'Formação acadêmica (curso, instituição e status)'
$certifications = Ask-Value 'Certificações (opcional)'
$languages = Ask-Value 'Idiomas e níveis'
$professionalSummary = Ask-Value 'Resumo profissional em 3 a 6 frases'
$strengths = Ask-Value 'Principais pontos fortes'
$highlightProject = Ask-Value 'Projeto ou resultado de maior destaque'
$challengeExample = Ask-Value 'Exemplo resumido de desafio, ação e resultado'
$leadership = Ask-Value 'Experiência com liderança ou mentoria (opcional)'
$gaps = Ask-Value 'Lacunas ou fatos que exigem explicação (opcional)'

Write-Host ''
Write-Host '--- Elegibilidade e dados sensíveis ---' -ForegroundColor Cyan
$workAuthorization = Ask-Value 'Autorização para trabalhar e necessidade de visto'
$travel = Ask-Value 'Disponibilidade para viagens ou mudança'
$pcd = Ask-Value 'Deseja se candidatar a vagas PcD? (sim, não ou prefiro não informar)'
$accommodations = Ask-Value 'Adaptações necessárias em seleção/trabalho (opcional)'
$affirmative = Ask-Value 'Outras vagas afirmativas de interesse (opcional)'

$resumeReference = ''
$resumeSource = Ask-Value 'Caminho de um currículo PDF/DOCX para copiar (opcional)'
if ($resumeSource) {
    if (-not (Test-Path -LiteralPath $resumeSource -PathType Leaf)) {
        Write-Warning "Currículo não encontrado: $resumeSource"
    }
    else {
        $extension = [IO.Path]::GetExtension($resumeSource).ToLowerInvariant()
        if ($extension -notin @('.pdf', '.docx')) {
            Write-Warning 'Formato ignorado. Use PDF ou DOCX.'
        }
        else {
            $safeBase = ($name -replace '[^\p{L}\p{Nd}]+', '-').Trim('-').ToLowerInvariant()
            if (-not $safeBase) { $safeBase = 'candidato' }
            $destination = Join-Path $ResumeDir ("curriculo-$safeBase$extension")
            $sourceFullPath = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $resumeSource).Path)
            $destinationFullPath = [IO.Path]::GetFullPath($destination)
            if ($sourceFullPath.Equals($destinationFullPath, [StringComparison]::OrdinalIgnoreCase)) {
                Write-Host 'O currículo já está no diretório correto; arquivo preservado.'
            }
            elseif ((Test-Path -LiteralPath $destination) -and -not (Ask-YesNo "Substituir $destination?" $false)) {
                Write-Host 'Currículo existente preservado.'
            }
            else {
                if (Test-Path -LiteralPath $destination) { $null = Backup-FluxoFile -Path $destination }
                Copy-Item -LiteralPath $resumeSource -Destination $destination -Force
            }
            $resumeReference = [IO.Path]::GetFileName($destination)
        }
    }
}

$generatedAt = Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz'
$profile = @"
# Perfil do candidato

> Gerado em $generatedAt. Este arquivo é privado e deve ser revisado pelo candidato.

## Identificação e contato

- Nome completo: $(Escape-Markdown $name)
- Nome preferido: $(Escape-Markdown $socialName)
- E-mail: $(Escape-Markdown $email)
- Telefone/WhatsApp: $(Escape-Markdown $phone)
- Localização: $(Escape-Markdown $location)
- LinkedIn: $(Escape-Markdown $linkedin)
- GitHub: $(Escape-Markdown $github)
- Portfólio: $(Escape-Markdown $portfolio)
- Currículo padrão: $(Escape-Markdown $resumeReference)

## Objetivo profissional

- Cargos-alvo: $(Escape-Markdown $targetRoles)
- Senioridade: $(Escape-Markdown $seniority)
- Foco técnico: $(Escape-Markdown $technicalFocus)
- Competências secundárias: $(Escape-Markdown $secondarySkills)
- Modalidades: $(Escape-Markdown $workModes)
- Localidades aceitas: $(Escape-Markdown $acceptedLocations)
- Contratos aceitos: $(Escape-Markdown $contracts)
- Salário mínimo: $(Escape-Markdown $minimumSalary)
- Salário alvo: $(Escape-Markdown $targetSalary)
- Setores preferidos: $(Escape-Markdown $industries)
- Exclusões: $(Escape-Markdown $exclusions)
- Disponibilidade: $(Escape-Markdown $availability)

## Meta da campanha

- Meta total: $(Escape-Markdown $totalGoal)
- Meta diária: $(Escape-Markdown $dailyGoal)
- Meta semanal: $(Escape-Markdown $weeklyGoal)
- Prazo: $(Escape-Markdown $deadline)
- Plataformas prioritárias: $(Escape-Markdown $platforms)
- Meta Gupy: $(Escape-Markdown $gupyGoal)
- Meta InfoJobs: $(Escape-Markdown $infoJobsGoal)
- Meta PandaPé: $(Escape-Markdown $pandaPeGoal)
- Meta LinkedIn: $(Escape-Markdown $linkedInGoal)
- Meta Catho: $(Escape-Markdown $cathoGoal)
- Meta Vagas.com: $(Escape-Markdown $vagasComGoal)
- Meta Sólides: $(Escape-Markdown $solidesGoal)

## Formação e idiomas

- Formação: $(Escape-Markdown $education)
- Certificações: $(Escape-Markdown $certifications)
- Idiomas: $(Escape-Markdown $languages)

## Banco de respostas profissionais

### Resumo profissional

$(Escape-Markdown $professionalSummary)

### Pontos fortes

$(Escape-Markdown $strengths)

### Projeto ou resultado de destaque

$(Escape-Markdown $highlightProject)

### Desafio, ação e resultado

$(Escape-Markdown $challengeExample)

### Liderança ou mentoria

$(Escape-Markdown $leadership)

### Lacunas ou explicações

$(Escape-Markdown $gaps)

## Elegibilidade e preferências sensíveis

- Autorização de trabalho/visto: $(Escape-Markdown $workAuthorization)
- Viagens ou mudança: $(Escape-Markdown $travel)
- Vagas PcD: $(Escape-Markdown $pcd)
- Adaptações: $(Escape-Markdown $accommodations)
- Outras vagas afirmativas: $(Escape-Markdown $affirmative)

## Confirmações pendentes antes de cada envio

- Pretensão salarial quando a pergunta usar formato diferente.
- Disponibilidade quando houver data específica.
- Dados sensíveis não registrados acima.
- Consentimentos opcionais.
- Declarações legais e informações eliminatórias.
"@

if (Test-Path -LiteralPath $ProfilePath) { $null = Backup-FluxoFile -Path $ProfilePath }
Set-Content -LiteralPath $ProfilePath -Value $profile -Encoding UTF8

if (-not (Test-Path -LiteralPath $ApplicationsPath)) {
    $control = @"
# Controle de candidaturas

| Data | Plataforma | Empresa | Vaga | ID/URL | Modalidade | Status | Próxima ação | Prazo | Observações |
|---|---|---|---|---|---|---|---|---|---|

## Meta

- Total: $(Escape-Markdown $totalGoal)
- Diária: $(Escape-Markdown $dailyGoal)
- Semanal: $(Escape-Markdown $weeklyGoal)
- Prazo: $(Escape-Markdown $deadline)
"@
    Set-Content -LiteralPath $ApplicationsPath -Value $control -Encoding UTF8
}

if (Ask-YesNo 'Deseja preencher logins e senhas no .env local agora? As senhas serão gravadas em texto puro.' $false) {
    $platformDefinitions = @(
        @{ Name = 'GUPY'; Url = 'https://portal.gupy.io/'; Auth = 'password' },
        @{ Name = 'INFOJOBS'; Url = 'https://www.infojobs.com.br/'; Auth = 'password' },
        @{ Name = 'PANDAPE'; Url = 'https://www.pandape.com.br/'; Auth = 'link-convite' },
        @{ Name = 'LINKEDIN'; Url = 'https://www.linkedin.com/jobs/'; Auth = 'manual' },
        @{ Name = 'CATHO'; Url = 'https://www.catho.com.br/vagas/'; Auth = 'password' },
        @{ Name = 'VAGASCOM'; Url = 'https://www.vagas.com.br/'; Auth = 'password' },
        @{ Name = 'SOLIDES'; Url = 'https://vagas.solides.com.br/'; Auth = 'password' }
    )

    $envLines = [Collections.Generic.List[string]]::new()
    $envLines.Add('# ARQUIVO LOCAL. NÃO COMPARTILHAR.')
    $envLines.Add('REQUIRE_FINAL_CONFIRMATION=true')
    $envLines.Add('ALLOW_AUTOMATED_SUBMISSION=false')
    $envLines.Add('DEFAULT_LANGUAGE=pt-BR')
    $envLines.Add('BROWSER_AUTOMATION_REQUIRED=true')
    $envLines.Add('PLAYWRIGHT_SESSION=candidaturas')
    $envLines.Add('PLAYWRIGHT_HEADLESS=false')
    $envLines.Add("CAMPAIGN_TOTAL_GOAL=$totalGoal")
    $envLines.Add("CAMPAIGN_DAILY_GOAL=$dailyGoal")
    $envLines.Add("CAMPAIGN_WEEKLY_GOAL=$weeklyGoal")
    $envLines.Add('MAX_APPLICATIONS_PER_RUN=30')
    $envLines.Add('MAX_CONSECUTIVE_FAILURES=3')
    $envLines.Add('CHECKPOINT_AFTER_EACH_ACTION=true')
    $envLines.Add('EVIDENCE_MODE=confirmation')

    foreach ($platform in $platformDefinitions) {
        Write-Host ''
        $enabled = Ask-YesNo "Configurar $($platform.Name)?" $true
        $envLines.Add('')
        $envLines.Add("$($platform.Name)_ENABLED=$($enabled.ToString().ToLowerInvariant())")
        $url = Ask-Value "URL de $($platform.Name)" $platform.Url
        $authMode = Ask-Value "Modo de autenticação de $($platform.Name)" $platform.Auth
        $login = if ($enabled) { Ask-Value "Login de $($platform.Name) (opcional)" } else { '' }
        $password = ''
        if ($enabled -and $authMode -eq 'password' -and (Ask-YesNo "Gravar senha de $($platform.Name) agora?" $false)) {
            $password = Read-PlainSecret "Senha de $($platform.Name)"
        }
        $envLines.Add("$($platform.Name)_URL=$(ConvertTo-DotEnvValue $url)")
        $envLines.Add("$($platform.Name)_AUTH_MODE=$(ConvertTo-DotEnvValue $authMode)")
        $envLines.Add("$($platform.Name)_LOGIN=$(ConvertTo-DotEnvValue $login)")
        $envLines.Add("$($platform.Name)_PASSWORD=$(ConvertTo-DotEnvValue $password)")
        $goal = switch ($platform.Name) {
            'GUPY' { $gupyGoal }; 'INFOJOBS' { $infoJobsGoal }; 'PANDAPE' { $pandaPeGoal }
            'LINKEDIN' { $linkedInGoal }; 'CATHO' { $cathoGoal }; 'VAGASCOM' { $vagasComGoal }; 'SOLIDES' { $solidesGoal }
        }
        $envLines.Add("$($platform.Name)_GOAL=$goal")
    }

    if (Test-Path -LiteralPath $EnvPath) { $null = Backup-FluxoFile -Path $EnvPath }
    Set-Content -LiteralPath $EnvPath -Value $envLines -Encoding UTF8
}

& (Join-Path $PSScriptRoot 'inicializar-campanha.ps1') -Name 'Campanha do onboarding' -TotalGoal ([int]$totalGoal) -DailyGoal ([int]$dailyGoal) -WeeklyGoal ([int]$weeklyGoal) -Deadline $deadline -GupyGoal ([int]$gupyGoal) -InfoJobsGoal ([int]$infoJobsGoal) -PandaPeGoal ([int]$pandaPeGoal) -LinkedInGoal ([int]$linkedInGoal) -CathoGoal ([int]$cathoGoal) -VagasComGoal ([int]$vagasComGoal) -SolidesGoal ([int]$solidesGoal) -MaxConsecutiveFailures 3 -NonInteractive -Force | Out-Null

Write-Host ''
Write-Host "Perfil criado em: $ProfilePath" -ForegroundColor Green
Write-Host "Controle criado em: $ApplicationsPath" -ForegroundColor Green
Write-Host "Campanha criada em: $(Join-Path $FlowRoot 'campanha\config.json')" -ForegroundColor Green
if (-not $SkipPreflight) {
    Write-Host ''
    Write-Host 'Executando preflight completo...' -ForegroundColor Cyan
    & (Join-Path $PSScriptRoot 'preflight.ps1') -NoExit
    $preflightResult = Get-Content -LiteralPath (Join-Path $FlowRoot 'estado\preflight.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($preflightResult.ready) {
        $installation = [pscustomobject][ordered]@{
            version = 1
            configuredAt = (Get-Date).ToString('o')
            preflightAt = $preflightResult.checkedAt
            ready = $true
        }
        Write-FluxoJsonAtomic -Path (Join-Path $FlowRoot 'estado\instalacao.json') -Value $installation
    }
}
