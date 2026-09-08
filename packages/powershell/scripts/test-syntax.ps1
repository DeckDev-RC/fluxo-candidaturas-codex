[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$files = Get-ChildItem -LiteralPath $root -Recurse -Filter '*.ps1' -File
$failures = [Collections.Generic.List[string]]::new()

foreach ($file in $files) {
    $tokens = $null
    $errors = $null
    [Management.Automation.Language.Parser]::ParseFile(
        $file.FullName,
        [ref]$tokens,
        [ref]$errors
    ) | Out-Null

    foreach ($parseError in $errors) {
        $failures.Add(('{0}: {1}' -f $file.FullName, $parseError.Message))
    }
}

if ($failures.Count -gt 0) {
    $failures | ForEach-Object { Write-Error $_ }
    exit 1
}

Write-Host ('PowerShell: {0} arquivo(s) analisado(s) sem erro.' -f $files.Count)
