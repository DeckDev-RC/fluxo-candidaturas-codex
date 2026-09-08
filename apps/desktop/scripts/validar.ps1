[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$FlowRoot = Split-Path -Parent $PSScriptRoot
$checks = [Collections.Generic.List[object]]::new()

function Add-Check {
    param([string]$Item, [bool]$Ok, [string]$Detail)
    $script:checks.Add([pscustomobject]@{
        Item = $Item
        Status = if ($Ok) { 'OK' } else { 'PENDENTE' }
        Detail = $Detail
    })
}

$requiredFiles = @(
    'AGENTS.md',
    'README.md',
    'VERSION',
    'CHANGELOG.md',
    '.env.example',
    '.gitignore',
    '.gitattributes',
    'scripts\verificar-playwright.ps1',
    'scripts\testar-distribuicao.ps1',
    'scripts\primeiro-uso.ps1',
    'scripts\preflight.ps1',
    'scripts\lib\Fluxo.Common.ps1',
    'scripts\inicializar-campanha.ps1',
    'scripts\adicionar-vaga.ps1',
    'scripts\proxima-acao.ps1',
    'scripts\salvar-checkpoint.ps1',
    'scripts\registrar-falha-fila.ps1',
    'scripts\retomar-fluxo.ps1',
    'scripts\nova-candidatura.ps1',
    'scripts\registrar-evento.ps1',
    'scripts\registrar-resultado-teste.ps1',
    'scripts\gerar-painel.ps1',
    'scripts\monitorar-pendencias.ps1',
    'scripts\importar-controles-legados.ps1',
    'config\plataformas.json',
    'docs\FORMULARIOS.md',
    'docs\PRIMEIRO-USO.md',
    'docs\OPERACAO.md',
    'docs\PLAYWRIGHT.md',
    'docs\PLATAFORMAS.md',
    'docs\QUESTIONARIOS-E-TESTES.md',
    'docs\METAS-FILA-RETOMADA.md',
    'docs\CURRICULOS.md',
    'docs\DADOS-E-COMANDOS.md',
    'docs\MENSAGENS-E-ACOMPANHAMENTO.md',
    'docs\MONITORAMENTO.md',
    'docs\DISTRIBUICAO.md',
    'docs\SEGURANCA.md',
    'docs\USO-CODEX-CHATGPT.md'
)

foreach ($relative in $requiredFiles) {
    $path = Join-Path $FlowRoot $relative
    Add-Check $relative (Test-Path -LiteralPath $path -PathType Leaf) $path
}

$profilePath = Join-Path $FlowRoot 'perfil\candidato.md'
$profileOk = (Test-Path -LiteralPath $profilePath -PathType Leaf) -and ((Get-Item -LiteralPath $profilePath).Length -gt 200)
Add-Check 'Perfil preenchido' $profileOk $profilePath

$resumeDir = Join-Path $FlowRoot 'curriculo'
$resumes = @(Get-ChildItem -LiteralPath $resumeDir -File -ErrorAction SilentlyContinue | Where-Object Extension -in @('.pdf', '.docx'))
$resumeDetail = if ($resumes.Count) { $resumes.Name -join ', ' } else { $resumeDir }
Add-Check 'Currículo PDF/DOCX' ($resumes.Count -gt 0) $resumeDetail

$envPath = Join-Path $FlowRoot '.env'
Add-Check '.env local' (Test-Path -LiteralPath $envPath -PathType Leaf) $envPath

$controlPath = Join-Path $FlowRoot 'candidaturas\controle-candidaturas.md'
Add-Check 'Controle de candidaturas' (Test-Path -LiteralPath $controlPath -PathType Leaf) $controlPath

$campaignPath = Join-Path $FlowRoot 'campanha\config.json'
Add-Check 'Campanha e metas' (Test-Path -LiteralPath $campaignPath -PathType Leaf) $campaignPath

$syntaxErrors = [Collections.Generic.List[string]]::new()
foreach ($scriptFile in Get-ChildItem -LiteralPath (Join-Path $FlowRoot 'scripts') -Filter '*.ps1' -File -Recurse) {
    $tokens = $null
    $errors = $null
    [void][Management.Automation.Language.Parser]::ParseFile($scriptFile.FullName, [ref]$tokens, [ref]$errors)
    foreach ($error in @($errors)) { $syntaxErrors.Add("$($scriptFile.Name): $($error.Message)") }
}
Add-Check 'Sintaxe dos scripts PowerShell' ($syntaxErrors.Count -eq 0) $(if ($syntaxErrors.Count) { $syntaxErrors -join '; ' } else { 'Todos os scripts foram analisados.' })

$npxAvailable = $null -ne (Get-Command npx -ErrorAction SilentlyContinue)
Add-Check 'npx para Playwright' $npxAvailable 'Execute scripts\verificar-playwright.ps1 para a verificação completa.'

if (Get-Command git -ErrorAction SilentlyContinue) {
    $gitRoot = & git -C $FlowRoot rev-parse --show-toplevel 2>$null
    if ($LASTEXITCODE -eq 0) {
        & git -C $FlowRoot check-ignore -q .env
        Add-Check '.env ignorado pelo Git' ($LASTEXITCODE -eq 0) 'git check-ignore .env'
    }
}

$checks | Format-Table -AutoSize

$pending = @($checks | Where-Object Status -eq 'PENDENTE')
if ($pending.Count -gt 0) {
    Write-Warning "$($pending.Count) item(ns) pendente(s). Execute o onboarding ou complete os arquivos indicados."
    exit 1
}

Write-Host 'Fluxo pronto para uso.' -ForegroundColor Green
