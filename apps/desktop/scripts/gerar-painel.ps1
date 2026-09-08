[CmdletBinding()] param()
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib\Fluxo.Common.ps1')
Update-FluxoReports -Applications @(Get-FluxoApplications)
Get-Content -LiteralPath (Join-Path (Get-FluxoRoot) 'candidaturas\painel.md') -Raw
