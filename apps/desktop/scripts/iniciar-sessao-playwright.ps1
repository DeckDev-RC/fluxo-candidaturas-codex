[CmdletBinding()] param([string]$Platform = 'GUPY', [string]$Url = '')
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib\Fluxo.Common.ps1')
& (Join-Path $PSScriptRoot 'verificar-playwright.ps1')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$Platform = ConvertTo-FluxoPlatform $Platform
$session = Read-FluxoEnvValue 'PLAYWRIGHT_SESSION' 'candidaturas'
if (-not $Url) { $Url = Read-FluxoEnvValue "${Platform}_URL" '' }
if (-not $Url) { throw "URL não configurada para $Platform." }
Write-Host "Sessão: $session | Plataforma: $Platform" -ForegroundColor Cyan
& npx --yes --package '@playwright/cli' playwright-cli "-s=$session" open $Url --headed
