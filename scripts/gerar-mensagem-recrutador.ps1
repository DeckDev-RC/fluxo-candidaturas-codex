[CmdletBinding()]
param([Parameter(Mandatory)][string]$Company, [Parameter(Mandatory)][string]$Role, [string]$RecruiterName = '', [string[]]$Highlights = @(), [string]$CallToAction = 'Fico à disposição para conversar.')
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib\Fluxo.Common.ps1')
$root = Get-FluxoRoot
$profile = Join-Path $root 'perfil\candidato.md'
if (-not (Test-Path -LiteralPath $profile)) { throw 'Execute o onboarding antes de gerar mensagens.' }
$nameLine = Get-Content -LiteralPath $profile | Where-Object { $_ -like '- Nome completo:*' } | Select-Object -First 1
$candidateName = if ($nameLine) { ($nameLine -replace '^- Nome completo:\s*','').Trim() } else { 'Candidato(a)' }
$greeting = if ($RecruiterName) { "Olá, $RecruiterName!" } else { 'Olá!' }
$highlightText = if ($Highlights.Count) { ' Minha experiência com ' + (($Highlights | Select-Object -First 3) -join ', ') + ' se conecta diretamente aos requisitos.' } else { '' }
$message = "$greeting`r`n`r`nCandidatei-me à vaga de $Role na $Company.$highlightText $CallToAction`r`n`r`n$candidateName"
$file = Join-Path $root "mensagens\$(Get-Date -Format 'yyyyMMdd-HHmmss-fff')-$(ConvertTo-FluxoSlug "$Company-$Role").md"
Set-Content -LiteralPath $file -Value "# Rascunho para recrutador`r`n`r`n> Revise antes de enviar.`r`n`r`n$message" -Encoding UTF8
Write-Output $file
