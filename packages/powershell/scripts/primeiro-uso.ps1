[CmdletBinding()]
param(
    [switch]$ForceOnboarding,
    [switch]$PreflightOnly,
    [switch]$SkipPlaywright
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib\Fluxo.Common.ps1')
Initialize-FluxoDirectories
$root = Get-FluxoRoot
$profilePath = Join-Path $root 'perfil\candidato.md'
$campaignPath = Join-Path $root 'campanha\config.json'
$isFirstUse = -not (Test-Path -LiteralPath $profilePath -PathType Leaf) -or -not (Test-Path -LiteralPath $campaignPath -PathType Leaf)

Write-Host ''
Write-Host '=== Primeira configuração do fluxo de candidaturas ===' -ForegroundColor Cyan
Write-Host 'Este assistente cria arquivos privados locais e depois executa um preflight completo.'
Write-Host 'Tenha em mãos:'
Write-Host '  1. currículo em PDF ou DOCX;'
Write-Host '  2. contatos e links profissionais;'
Write-Host '  3. cargos, senioridade, stack, modalidade, locais e salário;'
Write-Host '  4. metas total, diária, semanal e por plataforma;'
Write-Host '  5. logins opcionais; senhas ficam somente no .env local.'
Write-Host ''

if (-not $PreflightOnly -and ($isFirstUse -or $ForceOnboarding)) {
    $null = Read-Host 'Pressione Enter para iniciar o onboarding'
    & (Join-Path $PSScriptRoot 'onboarding.ps1') -SkipPreflight
}
elseif (-not $PreflightOnly) {
    Write-Host 'Onboarding já identificado. Use -ForceOnboarding para refazê-lo.' -ForegroundColor Yellow
}

Write-Host ''
Write-Host '=== Preflight ===' -ForegroundColor Cyan
& (Join-Path $PSScriptRoot 'preflight.ps1') -SkipPlaywright:$SkipPlaywright -NoExit
$preflight = Read-FluxoJson -Path (Join-Path $root 'estado\preflight.json')
if (-not $preflight.ready) {
    Write-Warning 'A configuração foi salva, mas ainda existem pendências críticas. Corrija estado/preflight.md e execute este script com -PreflightOnly.'
    exit 1
}

$installation = [pscustomobject][ordered]@{
    version = 1
    configuredAt = (Get-Date).ToString('o')
    preflightAt = $preflight.checkedAt
    ready = $true
}
Write-FluxoJsonAtomic -Path (Join-Path $root 'estado\instalacao.json') -Value $installation
Write-Host ''
Write-Host 'Configuração concluída. O agente já pode gerar o painel, abrir a fila e iniciar a campanha.' -ForegroundColor Green
