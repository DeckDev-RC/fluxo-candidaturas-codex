[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$FlowRoot = Split-Path -Parent $PSScriptRoot
$npx = Get-Command npx -ErrorAction SilentlyContinue

if (-not $npx) {
    Write-Error 'npx não foi encontrado. Instale Node.js/npm antes de usar a habilidade Playwright.'
    exit 1
}

$candidateSkillPaths = [Collections.Generic.List[string]]::new()
$candidateSkillPaths.Add((Join-Path $FlowRoot '.agents\skills\playwright\SKILL.md'))
$candidateSkillPaths.Add('C:\CodexData\skills\playwright\SKILL.md')
$candidateSkillPaths.Add('C:\CodexData\skills\.system\playwright\SKILL.md')

if ($env:USERPROFILE) {
    $candidateSkillPaths.Add((Join-Path $env:USERPROFILE '.codex\skills\playwright\SKILL.md'))
    $candidateSkillPaths.Add((Join-Path $env:USERPROFILE '.agents\skills\playwright\SKILL.md'))
}

$skillPath = $candidateSkillPaths | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1

Write-Host "npx: $($npx.Source)" -ForegroundColor Green

if ($skillPath) {
    Write-Host "Habilidade Playwright encontrada: $skillPath" -ForegroundColor Green
}
else {
    Write-Warning 'O arquivo SKILL.md do Playwright não foi encontrado nos caminhos locais comuns.'
    Write-Warning 'Confirme no catálogo de habilidades do Codex se $playwright está instalada e habilitada.'
}

$cliOutput = & npx --yes --package '@playwright/cli' playwright-cli --version 2>&1
if ($LASTEXITCODE -ne 0) {
    $cliOutput | ForEach-Object { Write-Warning $_ }
    Write-Error 'A CLI do Playwright não pôde ser inicializada.'
    exit 1
}

Write-Host "Playwright CLI: $($cliOutput | Select-Object -First 1)" -ForegroundColor Green

if (-not $skillPath) {
    exit 2
}

Write-Host 'Ambiente pronto para o agente usar a habilidade Playwright.' -ForegroundColor Green
