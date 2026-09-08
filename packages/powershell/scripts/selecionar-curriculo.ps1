[CmdletBinding()] param([Parameter(Mandatory)][string]$JobDescription)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib\Fluxo.Common.ps1')
$files = @(Get-ChildItem -LiteralPath (Join-Path (Get-FluxoRoot) 'curriculo') -Filter '*.txt' -File -ErrorAction SilentlyContinue)
if (-not $files.Count) { throw 'Nenhum currículo .txt disponível. Execute extrair-curriculo.ps1.' }
$scores = foreach ($file in $files) {
    $result = (& (Join-Path $PSScriptRoot 'calcular-aderencia.ps1') -JobDescription $JobDescription -ResumeTextPath $file.FullName) | ConvertFrom-Json
    [pscustomobject]@{ resume=$file.FullName; score=$result.score; classification=$result.classification }
}
$scores | Sort-Object score -Descending | Format-Table -AutoSize
