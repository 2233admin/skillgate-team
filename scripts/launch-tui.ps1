# Opens Skillgate TUI in the current terminal (use via Start-Process for a new window).
$ErrorActionPreference = "Stop"
$teamRoot = if ($env:SKILLGATE_ROOT) { $env:SKILLGATE_ROOT } else { Split-Path $PSScriptRoot -Parent }
$env:SKILLGATE_ROOT = $teamRoot
Set-Location (Join-Path $teamRoot "tui")

$bunExe = (Get-Command bun -ErrorAction SilentlyContinue)?.Source
if (-not $bunExe) {
    $fallback = Join-Path $env:USERPROFILE ".bun\bin\bun.exe"
    if (Test-Path $fallback) { $bunExe = $fallback }
    else { throw "bun not found. Install from https://bun.sh" }
}

Write-Host ""
Write-Host " Skillgate TUI" -ForegroundColor Cyan
Write-Host " Ctrl+Q quit   ? help   1/2/3 tabs" -ForegroundColor DarkGray
Write-Host ""

& $bunExe run start