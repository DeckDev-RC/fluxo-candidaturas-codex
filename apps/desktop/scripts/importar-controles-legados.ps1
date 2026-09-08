[CmdletBinding()]
param([string]$Directory = '', [string]$Pattern = 'controle_candidaturas_*.md')
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib\Fluxo.Common.ps1')
if (-not $Directory) { $Directory = Split-Path -Parent (Get-FluxoRoot) }

function Clean-Cell([string]$Value) { return $Value.Trim().Trim('`').Replace('\|', '|').Trim() }
function Map-Status([string]$Value) {
    $text = (ConvertTo-FluxoSlug $Value)
    if ($text -match 'rejeit|nao-selecion') { return 'rejeitada' }
    if ($text -match 'entrevista') { return 'entrevista' }
    if ($text -match 'teste') { return 'teste pendente' }
    if ($text -match 'proposta') { return 'proposta' }
    if ($text -match 'confirm|conclu|finaliz|enviad|realiz') { return 'enviada' }
    if ($text -match 'iniciad|rascunho') { return 'rascunho' }
    return 'enviada'
}

$files = @(Get-ChildItem -LiteralPath $Directory -Filter $Pattern -File -ErrorAction Stop)
$imported = 0
$skipped = 0
foreach ($file in $files) {
    $platform = ConvertTo-FluxoPlatform (($file.BaseName -replace '^controle_candidaturas_', ''))
    $lines = @(Get-Content -LiteralPath $file.FullName -Encoding UTF8)
    $headerIndex = -1
    for ($i=0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match '^\|\s*(ID da vaga|Identificador)\s*\|') { $headerIndex = $i; break }
    }
    if ($headerIndex -lt 0) { continue }
    $headers = @(($lines[$headerIndex].Trim('|') -split '(?<!\\)\|') | ForEach-Object { Clean-Cell $_ })
    for ($i=$headerIndex + 2; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -notmatch '^\|') { break }
        $cells = @(($lines[$i].Trim('|') -split '(?<!\\)\|') | ForEach-Object { Clean-Cell $_ })
        if ($cells.Count -lt $headers.Count) { $skipped++; continue }
        $row = @{}
        for ($column=0; $column -lt $headers.Count; $column++) { $row[$headers[$column]] = $cells[$column] }
        $identifier = if ($row.ContainsKey('ID da vaga')) { $row['ID da vaga'] } else { $row['Identificador'] }
        $company = $row['Empresa']; $role = $row['Vaga']
        if (-not $identifier -or -not $company -or -not $role) { $skipped++; continue }
        $mode = if ($row.ContainsKey('Local/modalidade')) { $row['Local/modalidade'] } else { $row['Modalidade'] }
        $legacyStatus = [string]$row['Status']
        $return = [string]$row['Retorno']
        $applicationId = if ($row.ContainsKey('ID da candidatura')) { $row['ID da candidatura'] } else { '' }
        try {
            & (Join-Path $PSScriptRoot 'nova-candidatura.ps1') -Platform $platform -Company $company -Role $role -IdentifierOrUrl $identifier -ApplicationId $applicationId -WorkMode $mode -Status (Map-Status "$legacyStatus $return") -NextAction 'Verificar status na plataforma' -Notes "Importado de $($file.Name). Status original: $legacyStatus. Retorno: $return" -AllowCrossPlatformDuplicate | Out-Null
            $imported++
        }
        catch {
            if ($_.Exception.Message -like 'Candidatura duplicada*') { $skipped++ } else { throw }
        }
    }
}
[pscustomobject]@{ files=$files.Count; imported=$imported; skipped=$skipped } | Format-List
