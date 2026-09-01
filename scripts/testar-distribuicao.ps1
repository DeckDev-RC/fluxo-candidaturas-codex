[CmdletBinding()]
param([string]$ZipPath = '')

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$FlowRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
if (-not $ZipPath) {
    $latest = Get-ChildItem -LiteralPath (Join-Path $FlowRoot 'dist') -Filter 'fluxo-candidaturas-v*.zip' -File -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $latest) { throw 'Nenhum ZIP versionado encontrado em dist/.' }
    $ZipPath = $latest.FullName
}
if (-not (Test-Path -LiteralPath $ZipPath -PathType Leaf)) { throw "ZIP não encontrado: $ZipPath" }
$ZipPath = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $ZipPath).Path)
$checksumPath = "$ZipPath.sha256"
$testRoot = [IO.Path]::GetFullPath((Join-Path ([IO.Path]::GetTempPath()) "fluxo-release-test-$([guid]::NewGuid().ToString('n'))"))
$tempPrefix = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
if (-not $testRoot.StartsWith($tempPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Diretório de teste fora da pasta temporária.' }

New-Item -ItemType Directory -Path $testRoot -Force | Out-Null
try {
    if (-not (Test-Path -LiteralPath $checksumPath -PathType Leaf)) { throw 'Arquivo .sha256 correspondente ausente.' }
    $expectedHash = ((Get-Content -LiteralPath $checksumPath -Raw -Encoding Ascii).Trim() -split '\s+')[0]
    $actualHash = (Get-FileHash -LiteralPath $ZipPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($expectedHash.ToLowerInvariant() -ne $actualHash) { throw 'Checksum externo do ZIP inválido.' }

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [IO.Compression.ZipFile]::OpenRead($ZipPath)
    try {
        $unsafeEntries = @($archive.Entries | Where-Object { $_.FullName -match '(^|[\\/])\.\.([\\/]|$)' -or [IO.Path]::IsPathRooted($_.FullName) })
        if ($unsafeEntries.Count) { throw 'O ZIP contém caminhos inseguros.' }
    }
    finally { $archive.Dispose() }

    Expand-Archive -LiteralPath $ZipPath -DestinationPath $testRoot
    $packageRoot = Join-Path $testRoot 'Fluxo'
    if (-not (Test-Path -LiteralPath $packageRoot -PathType Container)) { throw 'O ZIP não contém a raiz Fluxo/.' }
    foreach ($required in @('AGENTS.md','README.md','VERSION','CHANGELOG.md','MANIFEST.sha256','.env.example','scripts\autoteste.ps1','scripts\primeiro-uso.ps1')) {
        if (-not (Test-Path -LiteralPath (Join-Path $packageRoot $required) -PathType Leaf)) { throw "Arquivo ausente no ZIP: $required" }
    }
    $agentsSize = (Get-Item -LiteralPath (Join-Path $packageRoot 'AGENTS.md')).Length
    if ($agentsSize -gt 28000) { throw "AGENTS.md grande demais para carregamento confiável: $agentsSize bytes." }

    $files = @(Get-ChildItem -LiteralPath $packageRoot -Recurse -Force -File)
    $forbiddenNames = @('.env','candidato.md','candidaturas.json','controle-candidaturas.md','painel.md','config.json','vagas.json','checkpoint.json','preflight.json','preflight.md','instalacao.json')
    $leaks = @($files | Where-Object { $_.Name -in $forbiddenNames -or $_.Extension -in @('.pdf','.docx') })
    if ($leaks.Count) { throw "Arquivos privados encontrados no ZIP: $($leaks.Name -join ', ')" }
    $envExampleLines = Get-Content -LiteralPath (Join-Path $packageRoot '.env.example') -Encoding UTF8
    if (@($envExampleLines | Where-Object { $_ -match '^\s*[A-Z0-9_]*(PASSWORD|TOKEN|SECRET|COOKIE)\s*=\s*.+$' }).Count) {
        throw 'O .env.example do ZIP contém segredo preenchido.'
    }
    foreach ($textFile in $files | Where-Object Extension -in @('.md','.json','.example','.txt')) {
        $content = Get-Content -LiteralPath $textFile.FullName -Raw -Encoding UTF8
        if ($content -match '(?i)[?&](ia|token|access_token|auth|code|key)=[A-Za-z0-9_%\-]{12,}') {
            throw "Possível URL privada encontrada: $($textFile.Name)"
        }
    }

    $manifestPath = Join-Path $packageRoot 'MANIFEST.sha256'
    $manifestLines = @(Get-Content -LiteralPath $manifestPath -Encoding UTF8)
    if ($manifestLines.Count -ne ($files.Count - 1)) { throw 'O manifesto não cobre exatamente todos os arquivos do pacote.' }
    $manifestPaths = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($line in $manifestLines) {
        if ($line -notmatch '^([a-f0-9]{64})\s{2}(.+)$') { throw "Linha inválida no manifesto: $line" }
        $expected = $matches[1]
        $relative = $matches[2].Replace([char]'/', [char][IO.Path]::DirectorySeparatorChar)
        $null = $manifestPaths.Add($relative)
        $filePath = Join-Path $packageRoot $relative
        if (-not (Test-Path -LiteralPath $filePath -PathType Leaf)) { throw "Arquivo do manifesto ausente: $relative" }
        $actual = (Get-FileHash -LiteralPath $filePath -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($expected -ne $actual) { throw "Hash interno inválido: $relative" }
    }
    foreach ($file in $files | Where-Object Name -ne 'MANIFEST.sha256') {
        $relative = $file.FullName.Substring($packageRoot.Length).TrimStart('\','/')
        if (-not $manifestPaths.Contains($relative)) { throw "Arquivo sem entrada no manifesto: $relative" }
    }

    $tokens = $null
    $parseErrors = [Collections.Generic.List[string]]::new()
    foreach ($script in Get-ChildItem -LiteralPath (Join-Path $packageRoot 'scripts') -Filter '*.ps1' -File -Recurse) {
        $errors = $null
        [void][Management.Automation.Language.Parser]::ParseFile($script.FullName, [ref]$tokens, [ref]$errors)
        foreach ($error in @($errors)) { $parseErrors.Add("$($script.Name): $($error.Message)") }
    }
    if ($parseErrors.Count) { throw "Erros de sintaxe: $($parseErrors -join '; ')" }

    $powerShellExecutable = Join-Path $PSHOME 'pwsh.exe'
    if (-not (Test-Path -LiteralPath $powerShellExecutable)) { $powerShellExecutable = (Get-Process -Id $PID).Path }
    & $powerShellExecutable -NoLogo -NoProfile -ExecutionPolicy Bypass -File (Join-Path $packageRoot 'scripts\autoteste.ps1')
    if ($LASTEXITCODE -ne 0) { throw "Autoteste do ZIP falhou com código $LASTEXITCODE." }

    $windowsPowerShell = Get-Command powershell.exe -ErrorAction SilentlyContinue
    $legacyResult = 'não disponível'
    if ($windowsPowerShell) {
        & $windowsPowerShell.Source -NoLogo -NoProfile -ExecutionPolicy Bypass -File (Join-Path $packageRoot 'scripts\autoteste.ps1')
        if ($LASTEXITCODE -ne 0) { throw "Autoteste no Windows PowerShell falhou com código $LASTEXITCODE." }
        $legacyResult = 'aprovado'
    }

    [pscustomobject][ordered]@{
        version = (Get-Content -LiteralPath (Join-Path $packageRoot 'VERSION') -Raw -Encoding UTF8).Trim()
        zip = $ZipPath
        sha256 = $actualHash
        files = $files.Count
        privateFiles = $leaks.Count
        powershellCore = 'aprovado'
        windowsPowerShell = $legacyResult
        result = 'APROVADO PARA DISTRIBUIÇÃO'
    } | Format-List
}
finally {
    if ($testRoot.StartsWith($tempPrefix, [StringComparison]::OrdinalIgnoreCase) -and (Split-Path -Leaf $testRoot) -like 'fluxo-release-test-*') {
        Remove-Item -LiteralPath $testRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}
