[CmdletBinding()]
param([Parameter(Mandatory)][string]$SourcePath, [Parameter(Mandatory)][string]$Reference, [ValidateSet('envio','teste','entrevista','mensagem','status','outro')][string]$Type = 'outro')
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib\Fluxo.Common.ps1')
if (-not (Test-Path -LiteralPath $SourcePath -PathType Leaf)) { throw "Arquivo não encontrado: $SourcePath" }
$root = Get-FluxoRoot
$resolved = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $SourcePath).Path)
$extension = [IO.Path]::GetExtension($resolved)
$name = "$(Get-Date -Format 'yyyyMMdd-HHmmss')-$(ConvertTo-FluxoSlug $Type)-$(ConvertTo-FluxoSlug $Reference)$extension"
$destination = Join-Path $root "evidencias\$name"
Copy-Item -LiteralPath $resolved -Destination $destination
$relative = "evidencias/$name"
& (Join-Path $PSScriptRoot 'registrar-evento.ps1') -Reference $Reference -Type 'observação' -Note "Evidência: $Type" -Evidence $relative | Out-Null
Write-Output $relative
