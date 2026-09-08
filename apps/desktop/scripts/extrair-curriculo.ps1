[CmdletBinding()] param([Parameter(Mandatory)][string]$Path, [switch]$Force)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib\Fluxo.Common.ps1')
if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "Currículo não encontrado: $Path" }
$resolved = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $Path).Path)
$extension = [IO.Path]::GetExtension($resolved).ToLowerInvariant()
$output = [IO.Path]::ChangeExtension($resolved, '.txt')
if ($extension -eq '.txt') {
    if ((Get-Item -LiteralPath $resolved).Length -lt 20) { throw 'O arquivo TXT está vazio ou curto demais para consulta.' }
    Write-Output $resolved
    exit 0
}
if ((Test-Path -LiteralPath $output) -and -not $Force) { throw "O texto já existe: $output. Use -Force para atualizar." }
$text = ''
if ($extension -eq '.docx') {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [IO.Compression.ZipFile]::OpenRead($resolved)
    try {
        $entry = $archive.GetEntry('word/document.xml')
        if (-not $entry) { throw 'DOCX sem word/document.xml.' }
        $reader = [IO.StreamReader]::new($entry.Open())
        try { $xmlText = $reader.ReadToEnd() } finally { $reader.Dispose() }
        [xml]$xml = $xmlText
        $manager = [Xml.XmlNamespaceManager]::new($xml.NameTable)
        $manager.AddNamespace('w', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main')
        $paragraphs = foreach ($node in $xml.SelectNodes('//w:p', $manager)) { (($node.SelectNodes('.//w:t', $manager) | ForEach-Object { $_.'#text' }) -join '') }
        $text = $paragraphs -join "`r`n"
    }
    finally { $archive.Dispose() }
}
elseif ($extension -eq '.pdf') {
    $pdftotext = Get-Command pdftotext -ErrorAction SilentlyContinue
    if (-not $pdftotext) { throw 'Para PDF, instale pdftotext (Poppler) ou forneça uma versão DOCX/TXT. Nenhum dado foi enviado para serviço externo.' }
    & $pdftotext.Source -layout $resolved $output
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao extrair o PDF com pdftotext.' }
    $text = Get-Content -LiteralPath $output -Raw
}
else { throw 'Formato aceito: PDF, DOCX ou TXT.' }
if ($extension -ne '.pdf') { Set-Content -LiteralPath $output -Value $text.Trim() -Encoding UTF8 }
if (-not (Test-Path -LiteralPath $output -PathType Leaf) -or (Get-Item -LiteralPath $output).Length -lt 20) { throw 'A extração não produziu texto suficiente. Verifique se o currículo contém texto pesquisável.' }
Write-Output $output
