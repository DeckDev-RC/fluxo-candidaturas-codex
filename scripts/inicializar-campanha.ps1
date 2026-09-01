[CmdletBinding()]
param(
    [string]$Name = 'Campanha de candidaturas', [int]$TotalGoal = 0, [int]$DailyGoal = 0,
    [int]$WeeklyGoal = 0, [string]$Deadline = '', [int]$GupyGoal = -1, [int]$InfoJobsGoal = -1,
    [int]$PandaPeGoal = -1, [int]$LinkedInGoal = -1, [int]$CathoGoal = -1,
    [int]$VagasComGoal = -1, [int]$SolidesGoal = -1, [int]$MaxConsecutiveFailures = 0,
    [switch]$NonInteractive, [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib\Fluxo.Common.ps1')
Initialize-FluxoDirectories
$root = Get-FluxoRoot
$path = Join-Path $root 'campanha\config.json'
if ((Test-Path -LiteralPath $path) -and -not $Force) { throw 'A campanha já existe. Use -Force para substituí-la.' }
if ((Test-Path -LiteralPath $path) -and $Force) { $null = Backup-FluxoFile -Path $path }

function Read-Goal([string]$Prompt, [int]$Value, [int]$Default) {
    if ($Value -ge 0 -and ($Value -gt 0 -or $script:NonInteractive)) { return $Value }
    if ($script:NonInteractive) { return $Default }
    $answer = Read-Host "$Prompt [$Default]"
    if ([string]::IsNullOrWhiteSpace($answer)) { return $Default }
    $parsed = 0
    if (-not [int]::TryParse($answer, [ref]$parsed) -or $parsed -lt 0) { throw "Meta inválida: $answer" }
    return $parsed
}

$TotalGoal = Read-Goal 'Meta total' $TotalGoal (ConvertTo-FluxoInt (Read-FluxoEnvValue 'CAMPAIGN_TOTAL_GOAL' '60') 60)
$DailyGoal = Read-Goal 'Meta diária' $DailyGoal (ConvertTo-FluxoInt (Read-FluxoEnvValue 'CAMPAIGN_DAILY_GOAL' '5') 5)
$WeeklyGoal = Read-Goal 'Meta semanal' $WeeklyGoal (ConvertTo-FluxoInt (Read-FluxoEnvValue 'CAMPAIGN_WEEKLY_GOAL' '20') 20)
$MaxConsecutiveFailures = Read-Goal 'Máximo de falhas consecutivas' $MaxConsecutiveFailures (ConvertTo-FluxoInt (Read-FluxoEnvValue 'MAX_CONSECUTIVE_FAILURES' '3') 3)
$definitions = @(
    @{ Name='GUPY'; Value=$GupyGoal }, @{ Name='INFOJOBS'; Value=$InfoJobsGoal },
    @{ Name='PANDAPE'; Value=$PandaPeGoal }, @{ Name='LINKEDIN'; Value=$LinkedInGoal },
    @{ Name='CATHO'; Value=$CathoGoal }, @{ Name='VAGASCOM'; Value=$VagasComGoal }, @{ Name='SOLIDES'; Value=$SolidesGoal }
)
$platforms = [Collections.Generic.List[object]]::new()
foreach ($definition in $definitions) {
    $enabled = ConvertTo-FluxoBoolean (Read-FluxoEnvValue "$($definition.Name)_ENABLED" 'false')
    $defaultGoal = ConvertTo-FluxoInt (Read-FluxoEnvValue "$($definition.Name)_GOAL" '0') 0
    $goal = Read-Goal "Meta em $($definition.Name)" ([int]$definition.Value) $defaultGoal
    $platforms.Add([pscustomobject]@{ name=$definition.Name; enabled=$enabled; goal=$goal })
}
$campaign = [pscustomobject][ordered]@{
    version=1; name=$Name; createdAt=(Get-Date).ToString('o'); updatedAt=(Get-Date).ToString('o'); deadline=$Deadline
    totalGoal=$TotalGoal; dailyGoal=$DailyGoal; weeklyGoal=$WeeklyGoal; maxConsecutiveFailures=$MaxConsecutiveFailures; platforms=@($platforms)
}
Write-FluxoJsonAtomic -Path $path -Value $campaign
if (-not (Test-Path -LiteralPath (Join-Path $root 'fila\vagas.json'))) { Write-FluxoJsonAtomic -Path (Join-Path $root 'fila\vagas.json') -Value @() }
if (-not (Test-Path -LiteralPath (Join-Path $root 'candidaturas\candidaturas.json'))) { Write-FluxoJsonAtomic -Path (Join-Path $root 'candidaturas\candidaturas.json') -Value @() }
Save-FluxoApplications -Applications @(Get-FluxoApplications)
$campaign | ConvertTo-Json -Depth 6
