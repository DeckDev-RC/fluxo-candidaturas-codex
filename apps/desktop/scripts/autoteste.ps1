[CmdletBinding()] param()
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$sourceRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$testRoot = [IO.Path]::GetFullPath((Join-Path ([IO.Path]::GetTempPath()) "fluxo-candidaturas-test-$([guid]::NewGuid().ToString('n'))"))
$expectedPrefix = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
if (-not $testRoot.StartsWith($expectedPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Diretório de teste fora da pasta temporária.' }
New-Item -ItemType Directory -Path $testRoot -Force | Out-Null
try {
    foreach ($file in @('AGENTS.md','README.md','.env.example','.gitignore')) { Copy-Item -LiteralPath (Join-Path $sourceRoot $file) -Destination $testRoot }
    foreach ($directory in @('config','docs','templates','scripts')) {
        Copy-Item -LiteralPath (Join-Path $sourceRoot $directory) -Destination $testRoot -Recurse
    }
    foreach ($directory in @('perfil','curriculo','candidaturas','campanha','fila','estado','evidencias','mensagens')) {
        $targetDirectory = Join-Path $testRoot $directory
        New-Item -ItemType Directory -Path $targetDirectory -Force | Out-Null
        $readme = Join-Path $sourceRoot "$directory\README.md"
        if (Test-Path -LiteralPath $readme) { Copy-Item -LiteralPath $readme -Destination $targetDirectory }
    }
    Copy-Item -LiteralPath (Join-Path $sourceRoot '.env.example') -Destination (Join-Path $testRoot '.env') -Force
    $scripts = Join-Path $testRoot 'scripts'
    & (Join-Path $scripts 'inicializar-campanha.ps1') -TotalGoal 2 -DailyGoal 2 -WeeklyGoal 2 -GupyGoal 1 -InfoJobsGoal 1 -PandaPeGoal 0 -LinkedInGoal 0 -CathoGoal 0 -VagasComGoal 0 -SolidesGoal 0 -MaxConsecutiveFailures 3 -NonInteractive -Force | Out-Null
    $dummyProfile = @'
# Perfil do candidato

## Identificação

- Nome completo: Pessoa de Teste
- E-mail: pessoa@example.invalid
- Telefone/WhatsApp: 000000000
- Localização: Brasil

## Objetivo profissional

- Cargos-alvo: Pessoa Desenvolvedora
- Senioridade: Pleno
- Foco técnico: Python, JavaScript
- Modalidades: Remoto
- Localidades aceitas: Brasil
- Contratos aceitos: CLT
- Salário alvo: valor de teste

## Banco de respostas profissionais

Resumo profissional fictício criado exclusivamente para o autoteste local do pacote, sem qualquer dado real.
'@
    Set-Content -LiteralPath (Join-Path $testRoot 'perfil\candidato.md') -Value $dummyProfile -Encoding UTF8
    Set-Content -LiteralPath (Join-Path $testRoot 'curriculo\curriculo-teste.pdf') -Value '%PDF-1.4 arquivo fictício do autoteste' -Encoding Ascii
    $preflight = (& (Join-Path $scripts 'preflight.ps1') -SkipPlaywright -NoExit -AsJson) | ConvertFrom-Json
    if (-not $preflight.ready) { throw 'O preflight isolado não foi aprovado.' }
    & (Join-Path $scripts 'adicionar-vaga.ps1') -Platform GUPY -Company 'Empresa Teste' -Role 'Vaga Teste' -IdentifierOrUrl 'test-001' -Priority A -FitScore 90 | Out-Null
    $next = (& (Join-Path $scripts 'proxima-acao.ps1') -Claim -AsJson) | ConvertFrom-Json
    if ($next.identifierOrUrl -ne 'test-001') { throw 'A fila não retornou o item esperado.' }
    $application = (& (Join-Path $scripts 'nova-candidatura.ps1') -Platform GUPY -Company 'Empresa Teste' -Role 'Vaga Teste' -IdentifierOrUrl 'test-001' -Status enviada -Resume 'curriculo-teste.pdf') | ConvertFrom-Json
    & (Join-Path $scripts 'nova-candidatura.ps1') -Platform GUPY -Company 'Empresa Teste' -Role 'Vaga Teste' -IdentifierOrUrl 'test-001' -Status triagem -UpdateExisting | Out-Null
    $updatedApplication = Get-Content -LiteralPath (Join-Path $testRoot 'candidaturas\candidaturas.json') -Raw | ConvertFrom-Json
    if ($updatedApplication.resume -ne 'curriculo-teste.pdf' -or $updatedApplication.status -ne 'triagem') { throw 'A atualização parcial apagou dados existentes.' }
    & (Join-Path $scripts 'registrar-resultado-teste.ps1') -Reference $application.id -TestName 'Teste' -Score 5 -Total 5 | Out-Null
    $legacyDirectory = Join-Path $testRoot 'legacy'
    New-Item -ItemType Directory -Path $legacyDirectory -Force | Out-Null
    $legacy = @'
# Controle de candidaturas — InfoJobs

| ID da vaga | Empresa | Vaga | Local/modalidade | Status | Retorno |
|---|---|---|---|---|---|
| `legacy-002` | Empresa Legada | Vaga Legada | Remoto | Candidatura concluída | — |
'@
    Set-Content -LiteralPath (Join-Path $legacyDirectory 'controle_candidaturas_infojobs.md') -Value $legacy -Encoding UTF8
    & (Join-Path $scripts 'importar-controles-legados.ps1') -Directory $legacyDirectory | Out-Null
    & (Join-Path $scripts 'gerar-painel.ps1') | Out-Null
    $applications = Get-Content -LiteralPath (Join-Path $testRoot 'candidaturas\candidaturas.json') -Raw | ConvertFrom-Json
    if (@($applications).Count -ne 2) { throw 'Quantidade inesperada de candidaturas depois da importação.' }
    if (-not (Test-Path -LiteralPath (Join-Path $testRoot 'candidaturas\painel.md'))) { throw 'Painel não gerado.' }
    Write-Host 'Autoteste concluído com sucesso.' -ForegroundColor Green
}
finally {
    if ($testRoot.StartsWith($expectedPrefix, [StringComparison]::OrdinalIgnoreCase) -and (Split-Path -Leaf $testRoot) -like 'fluxo-candidaturas-test-*') {
        Remove-Item -LiteralPath $testRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}
