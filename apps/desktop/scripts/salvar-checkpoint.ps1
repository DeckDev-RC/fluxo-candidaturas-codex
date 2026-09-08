[CmdletBinding()]
param(
    [string]$Phase = '', [string]$Platform = '', [string]$Url = '', [string]$ApplicationKey = '',
    [string]$Page = '', [string]$Question = '', [string]$Notes = '', [string]$Blocker = '',
    [int]$ConsecutiveFailures = 0, [switch]$Clear
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib\Fluxo.Common.ps1')
$path = Join-Path (Get-FluxoRoot) 'estado\checkpoint.json'
if ($Clear) {
    if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Force }
    Write-Host 'Checkpoint limpo.'
    exit 0
}
$checkpoint = [pscustomobject][ordered]@{
    updatedAt=(Get-Date).ToString('o'); phase=$Phase; platform=$Platform; url=$Url; applicationKey=$ApplicationKey
    page=$Page; question=$Question; notes=$Notes; blocker=$Blocker; consecutiveFailures=$ConsecutiveFailures
}
Write-FluxoJsonAtomic -Path $path -Value $checkpoint
$checkpoint | ConvertTo-Json -Depth 4
