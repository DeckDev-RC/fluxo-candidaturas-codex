[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$FlowRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$DistDir = [IO.Path]::GetFullPath((Join-Path $FlowRoot 'dist'))
$VersionPath = Join-Path $FlowRoot 'VERSION'
if (-not (Test-Path -LiteralPath $VersionPath -PathType Leaf)) { throw 'Arquivo VERSION ausente.' }
$version = (Get-Content -LiteralPath $VersionPath -Raw -Encoding UTF8).Trim()
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw "Versão inválida: $version" }
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$BuildDir = [IO.Path]::GetFullPath((Join-Path $DistDir "build-$stamp-$PID"))
$PackageRoot = Join-Path $BuildDir 'Fluxo'
$ZipPath = Join-Path $DistDir "fluxo-candidaturas-v$version-$stamp.zip"
$ChecksumPath = "$ZipPath.sha256"

if (-not $DistDir.StartsWith($FlowRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Diretório de saída fora da raiz esperada.' }
if (-not $BuildDir.StartsWith($DistDir, [StringComparison]::OrdinalIgnoreCase)) { throw 'Diretório temporário fora da pasta dist.' }

New-Item -ItemType Directory -Path $PackageRoot -Force | Out-Null
$exportSucceeded = $false
try {
    $rootFiles = @('AGENTS.md', 'README.md', 'VERSION', 'CHANGELOG.md', '.env.example', '.gitignore', '.gitattributes')
    foreach ($file in $rootFiles) {
        $source = Join-Path $FlowRoot $file
        if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Arquivo obrigatório ausente: $file" }
        Copy-Item -LiteralPath $source -Destination $PackageRoot
    }

    foreach ($directory in @('config', 'docs', 'templates', 'scripts')) {
        Copy-Item -LiteralPath (Join-Path $FlowRoot $directory) -Destination $PackageRoot -Recurse
    }

    foreach ($directory in @('perfil', 'curriculo', 'candidaturas', 'campanha', 'fila', 'estado', 'evidencias', 'mensagens')) {
        $target = Join-Path $PackageRoot $directory
        New-Item -ItemType Directory -Path $target -Force | Out-Null
        $readme = Join-Path $FlowRoot "$directory\README.md"
        if (Test-Path -LiteralPath $readme) { Copy-Item -LiteralPath $readme -Destination $target }
    }

    $agentsSize = (Get-Item -LiteralPath (Join-Path $PackageRoot 'AGENTS.md')).Length
    if ($agentsSize -gt 28000) { throw "AGENTS.md excedeu o limite de distribuição de 28.000 bytes: $agentsSize" }

    $allFiles = @(Get-ChildItem -LiteralPath $PackageRoot -Recurse -Force -File)
    $privateNames = @(
        '.env', 'candidato.md', 'controle-candidaturas.md', 'candidaturas.json', 'painel.md',
        'config.json', 'vagas.json', 'checkpoint.json', 'preflight.json', 'preflight.md', 'instalacao.json'
    )
    $privateLeaks = @($allFiles | Where-Object Name -in $privateNames)
    $documentLeaks = @($allFiles | Where-Object Extension -in @('.pdf', '.docx'))
    $unexpectedRuntimeFiles = @($allFiles | Where-Object {
        $relative = $_.FullName.Substring($PackageRoot.Length).TrimStart('\','/')
        $top = ($relative -split '[\\/]')[0]
        $top -in @('perfil','curriculo','candidaturas','campanha','fila','estado','evidencias','mensagens') -and $_.Name -ne 'README.md'
    })
    if ($privateLeaks.Count -or $documentLeaks.Count -or $unexpectedRuntimeFiles.Count) {
        throw 'A exportação foi interrompida porque um arquivo privado entrou no pacote.'
    }

    $envExample = Get-Content -LiteralPath (Join-Path $PackageRoot '.env.example') -Encoding UTF8
    $filledSecrets = @($envExample | Where-Object { $_ -match '^\s*[A-Z0-9_]*(PASSWORD|TOKEN|SECRET|COOKIE)\s*=\s*.+$' })
    if ($filledSecrets.Count) { throw 'O .env.example contém um segredo preenchido.' }

    $shareableTextFiles = @($allFiles | Where-Object Extension -in @('.md','.json','.example','.txt'))
    $privateInviteMatches = [Collections.Generic.List[string]]::new()
    foreach ($file in $shareableTextFiles) {
        $content = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8
        if ($content -match '(?i)[?&](ia|token|access_token|auth|code|key)=[A-Za-z0-9_%\-]{12,}') {
            $privateInviteMatches.Add($file.FullName)
        }
    }
    if ($privateInviteMatches.Count) { throw 'Foi detectada uma URL possivelmente privada no pacote compartilhável.' }

    $manifestLines = [Collections.Generic.List[string]]::new()
    foreach ($file in Get-ChildItem -LiteralPath $PackageRoot -Recurse -Force -File | Sort-Object FullName) {
        $relative = $file.FullName.Substring($PackageRoot.Length).TrimStart('\','/').Replace('\','/')
        $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        $manifestLines.Add("$hash  $relative")
    }
    Set-Content -LiteralPath (Join-Path $PackageRoot 'MANIFEST.sha256') -Value $manifestLines -Encoding UTF8

    Compress-Archive -LiteralPath $PackageRoot -DestinationPath $ZipPath -CompressionLevel Optimal
    $zipHash = (Get-FileHash -LiteralPath $ZipPath -Algorithm SHA256).Hash.ToLowerInvariant()
    Set-Content -LiteralPath $ChecksumPath -Value "$zipHash  $([IO.Path]::GetFileName($ZipPath))" -Encoding Ascii
    $exportSucceeded = $true
}
finally {
    $cleanupSucceeded = $false
    for ($attempt = 1; $attempt -le 5; $attempt++) {
        try {
            if (Test-Path -LiteralPath $BuildDir) { Remove-Item -LiteralPath $BuildDir -Recurse -Force -ErrorAction Stop }
            $cleanupSucceeded = $true
            break
        }
        catch {
            if ($attempt -lt 5) { Start-Sleep -Milliseconds (200 * $attempt) }
        }
    }
    if (-not $cleanupSucceeded) { Write-Warning "A pasta temporária permaneceu bloqueada: $BuildDir" }
}

if (-not $exportSucceeded) { throw 'A exportação não foi concluída.' }
Write-Host "Pacote distribuível criado em: $ZipPath" -ForegroundColor Green
Write-Host "Checksum SHA-256: $ChecksumPath" -ForegroundColor Green
