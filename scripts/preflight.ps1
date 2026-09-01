[CmdletBinding()]
param(
    [switch]$SkipPlaywright,
    [switch]$NoExit,
    [switch]$AsJson
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib\Fluxo.Common.ps1')
Initialize-FluxoDirectories

$root = Get-FluxoRoot
$checks = [Collections.Generic.List[object]]::new()

function Add-PreflightCheck {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][ValidateSet('critical','warning','info')][string]$Level,
        [Parameter(Mandatory)][bool]$Ok,
        [Parameter(Mandatory)][string]$Detail,
        [string]$Fix = ''
    )
    $script:checks.Add([pscustomobject][ordered]@{
        name = $Name
        level = $Level
        status = if ($Ok) { 'ok' } else { 'pending' }
        detail = $Detail
        fix = $Fix
    })
}

function Test-JsonFile {
    param([Parameter(Mandatory)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
    try {
        $null = Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
        return $true
    }
    catch { return $false }
}

$requiredFiles = @(
    'AGENTS.md', 'README.md', '.env.example', 'config\plataformas.json',
    'scripts\onboarding.ps1', 'scripts\preflight.ps1', 'scripts\verificar-playwright.ps1',
    'docs\PRIMEIRO-USO.md', 'docs\SEGURANCA.md'
)
foreach ($relative in $requiredFiles) {
    $path = Join-Path $root $relative
    Add-PreflightCheck -Name "Arquivo: $relative" -Level critical -Ok (Test-Path -LiteralPath $path -PathType Leaf) -Detail $path -Fix 'Restaure o pacote compartilhável original.'
}

$syntaxErrors = [Collections.Generic.List[string]]::new()
foreach ($scriptFile in Get-ChildItem -LiteralPath (Join-Path $root 'scripts') -Filter '*.ps1' -File -Recurse) {
    $tokens = $null
    $errors = $null
    [void][Management.Automation.Language.Parser]::ParseFile($scriptFile.FullName, [ref]$tokens, [ref]$errors)
    foreach ($error in @($errors)) { $syntaxErrors.Add("$($scriptFile.Name): $($error.Message)") }
}
Add-PreflightCheck -Name 'Sintaxe dos scripts' -Level critical -Ok ($syntaxErrors.Count -eq 0) -Detail $(if ($syntaxErrors.Count) { $syntaxErrors -join '; ' } else { 'Todos os scripts PowerShell foram analisados.' }) -Fix 'Restaure ou corrija os scripts indicados.'

$profilePath = Join-Path $root 'perfil\candidato.md'
$profileOk = (Test-Path -LiteralPath $profilePath -PathType Leaf) -and ((Get-Item -LiteralPath $profilePath).Length -gt 200)
Add-PreflightCheck -Name 'Perfil do candidato' -Level critical -Ok $profileOk -Detail $profilePath -Fix 'Conclua o onboarding e revise perfil/candidato.md.'
if ($profileOk) {
    $profileText = Get-Content -LiteralPath $profilePath -Raw -Encoding UTF8
    $profileHasPlaceholders = $profileText -match '\[(nome|email|telefone|cargos|senioridade|foco|resumo|resposta|arquivo)\]'
    Add-PreflightCheck -Name 'Perfil sem placeholders' -Level critical -Ok (-not $profileHasPlaceholders) -Detail $(if ($profileHasPlaceholders) { 'Existem campos de modelo ainda não preenchidos.' } else { 'Nenhum placeholder obrigatório encontrado.' }) -Fix 'Substitua os campos entre colchetes por respostas reais.'
}

$resumeDir = Join-Path $root 'curriculo'
$resumes = @(Get-ChildItem -LiteralPath $resumeDir -File -ErrorAction SilentlyContinue | Where-Object Extension -in @('.pdf','.docx'))
Add-PreflightCheck -Name 'Currículo PDF/DOCX' -Level critical -Ok ($resumes.Count -gt 0) -Detail $(if ($resumes.Count) { $resumes.Name -join ', ' } else { $resumeDir }) -Fix 'Coloque ao menos um currículo PDF ou DOCX em curriculo/.'

$envPath = Join-Path $root '.env'
$envOk = Test-Path -LiteralPath $envPath -PathType Leaf
Add-PreflightCheck -Name '.env local' -Level critical -Ok $envOk -Detail $envPath -Fix 'Copie .env.example para .env e preencha apenas localmente.'

$campaignPath = Join-Path $root 'campanha\config.json'
$campaignOk = Test-JsonFile $campaignPath
$activeCampaignPlatforms = @()
Add-PreflightCheck -Name 'Campanha e metas' -Level critical -Ok $campaignOk -Detail $campaignPath -Fix 'Execute scripts/inicializar-campanha.ps1.'
if ($campaignOk) {
    $campaign = Read-FluxoJson -Path $campaignPath
    $positiveGoals = @($campaign.platforms | Where-Object { $_.enabled -and [int]$_.goal -gt 0 })
    $activeCampaignPlatforms = @($positiveGoals | ForEach-Object { [string]$_.name })
    Add-PreflightCheck -Name 'Meta por plataforma' -Level critical -Ok ($positiveGoals.Count -gt 0) -Detail $(if ($positiveGoals.Count) { ($positiveGoals | ForEach-Object { "$($_.name)=$($_.goal)" }) -join ', ' } else { 'Nenhuma plataforma habilitada possui meta positiva.' }) -Fix 'Defina ao menos uma meta por plataforma maior que zero.'
    $platformGoalSum = ($positiveGoals | Measure-Object -Property goal -Sum).Sum
    $totalMatches = [int]$campaign.totalGoal -eq [int]$platformGoalSum
    Add-PreflightCheck -Name 'Coerência da meta total' -Level warning -Ok $totalMatches -Detail "Meta total=$($campaign.totalGoal); soma das plataformas=$platformGoalSum." -Fix 'Ajuste a meta total ou confirme conscientemente que ela difere da soma por plataforma.'
}

$platformConfigPath = Join-Path $root 'config\plataformas.json'
Add-PreflightCheck -Name 'Configuração das plataformas' -Level critical -Ok (Test-JsonFile $platformConfigPath) -Detail $platformConfigPath -Fix 'Restaure config/plataformas.json.'

foreach ($runtime in @('fila\vagas.json','candidaturas\candidaturas.json')) {
    $runtimePath = Join-Path $root $runtime
    if (-not (Test-Path -LiteralPath $runtimePath)) { Write-FluxoJsonAtomic -Path $runtimePath -Value @() }
    Add-PreflightCheck -Name "Base: $runtime" -Level critical -Ok (Test-JsonFile $runtimePath) -Detail $runtimePath -Fix 'Recrie a campanha ou restaure um backup válido.'
}

if ($envOk) {
    $enabledPlatforms = if ($activeCampaignPlatforms.Count) {
        $activeCampaignPlatforms
    }
    else {
        @('GUPY','INFOJOBS','PANDAPE','LINKEDIN','CATHO','VAGASCOM','SOLIDES') | Where-Object {
            ConvertTo-FluxoBoolean (Read-FluxoEnvValue -Name "${_}_ENABLED" -Default 'false')
        }
    }
    foreach ($platform in $enabledPlatforms) {
        $url = Read-FluxoEnvValue -Name "${platform}_URL" -Default ''
        Add-PreflightCheck -Name "URL: $platform" -Level critical -Ok (-not [string]::IsNullOrWhiteSpace($url)) -Detail $(if ($url) { 'URL configurada no .env.' } else { 'URL vazia' }) -Fix "Preencha ${platform}_URL no .env."
        $authMode = Read-FluxoEnvValue -Name "${platform}_AUTH_MODE" -Default 'manual'
        $login = Read-FluxoEnvValue -Name "${platform}_LOGIN" -Default ''
        $authReady = $authMode -in @('manual','link-convite') -or -not [string]::IsNullOrWhiteSpace($login)
        Add-PreflightCheck -Name "Acesso: $platform" -Level warning -Ok $authReady -Detail $(if ($authReady) { "Modo $authMode configurado ou login informado." } else { 'Login ainda não informado; uma sessão autenticada também pode atender.' }) -Fix "Informe ${platform}_LOGIN ou autentique manualmente na sessão Playwright."
    }
}

if ($SkipPlaywright) {
    Add-PreflightCheck -Name 'Playwright' -Level warning -Ok $false -Detail 'Verificação ignorada por -SkipPlaywright.' -Fix 'Execute novamente sem -SkipPlaywright antes de navegar.'
}
else {
    $npx = Get-Command npx -ErrorAction SilentlyContinue
    Add-PreflightCheck -Name 'npx' -Level critical -Ok ($null -ne $npx) -Detail $(if ($npx) { $npx.Source } else { 'npx não encontrado' }) -Fix 'Instale Node.js/npm.'
    $skillCandidates = @(
        (Join-Path $root '.agents\skills\playwright\SKILL.md'),
        'C:\CodexData\skills\playwright\SKILL.md',
        'C:\CodexData\skills\.system\playwright\SKILL.md'
    )
    if ($env:USERPROFILE) {
        $skillCandidates += Join-Path $env:USERPROFILE '.codex\skills\playwright\SKILL.md'
        $skillCandidates += Join-Path $env:USERPROFILE '.agents\skills\playwright\SKILL.md'
    }
    $skillPath = $skillCandidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
    Add-PreflightCheck -Name 'Habilidade Playwright' -Level critical -Ok (-not [string]::IsNullOrWhiteSpace($skillPath)) -Detail $(if ($skillPath) { $skillPath } else { 'SKILL.md não encontrado nos caminhos comuns.' }) -Fix 'Instale ou habilite a habilidade $playwright no Codex.'
    if ($npx) {
        $cliOutput = & npx --yes --package '@playwright/cli' playwright-cli --version 2>&1
        $cliOk = $LASTEXITCODE -eq 0
        Add-PreflightCheck -Name 'Playwright CLI' -Level critical -Ok $cliOk -Detail (($cliOutput | Select-Object -First 1) -join '') -Fix 'Confirme rede, npm e o pacote @playwright/cli.'
    }
}

$criticalPending = @($checks | Where-Object { $_.level -eq 'critical' -and $_.status -ne 'ok' })
$warnings = @($checks | Where-Object { $_.level -eq 'warning' -and $_.status -ne 'ok' })
$report = [pscustomobject][ordered]@{
    version = 1
    checkedAt = (Get-Date).ToString('o')
    ready = $criticalPending.Count -eq 0
    criticalPending = $criticalPending.Count
    warnings = $warnings.Count
    checks = @($checks)
}
Write-FluxoJsonAtomic -Path (Join-Path $root 'estado\preflight.json') -Value $report
if ($report.ready) {
    Write-FluxoJsonAtomic -Path (Join-Path $root 'estado\instalacao.json') -Value ([pscustomobject][ordered]@{
        version = 1
        configuredAt = (Get-Date).ToString('o')
        preflightAt = $report.checkedAt
        ready = $true
    })
}

$markdown = [Collections.Generic.List[string]]::new()
$markdown.Add('# Preflight do fluxo')
$markdown.Add('')
$markdown.Add("- Executado em: $($report.checkedAt)")
$markdown.Add("- Resultado: $(if ($report.ready) { 'PRONTO' } else { 'INCOMPLETO' })")
$markdown.Add("- Pendências críticas: $($report.criticalPending)")
$markdown.Add("- Avisos: $($report.warnings)")
$markdown.Add('')
$markdown.Add('| Verificação | Nível | Status | Detalhe | Correção |')
$markdown.Add('|---|---|---|---|---|')
foreach ($check in $checks) {
    $markdown.Add("| $(Escape-FluxoMarkdownCell $check.name) | $($check.level) | $($check.status) | $(Escape-FluxoMarkdownCell $check.detail) | $(Escape-FluxoMarkdownCell $check.fix) |")
}
Set-Content -LiteralPath (Join-Path $root 'estado\preflight.md') -Value $markdown -Encoding UTF8

if ($AsJson) { $report | ConvertTo-Json -Depth 8 }
else {
    $checks | Select-Object name,level,status,detail | Format-Table -AutoSize
    if ($report.ready) { Write-Host 'PREFLIGHT APROVADO: fluxo pronto para operar.' -ForegroundColor Green }
    else { Write-Warning "PREFLIGHT INCOMPLETO: $($report.criticalPending) pendência(s) crítica(s). Consulte estado/preflight.md." }
}

if (-not $report.ready -and -not $NoExit) { exit 1 }
