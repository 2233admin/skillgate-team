# Runs Skillgate TUI in the current terminal tab.
# For a new Windows Terminal window, use launch-tui-window.ps1 or launch-tui.cmd.
$ErrorActionPreference = "Stop"

# Prefer truecolor rendering when hosted in Windows Terminal.
if ($env:WT_SESSION) {
  if (-not $env:TERM) { $env:TERM = "xterm-256color" }
  if (-not $env:COLORTERM) { $env:COLORTERM = "truecolor" }
}
$teamRoot = if ($env:SKILLGATE_ROOT) { $env:SKILLGATE_ROOT } else { Split-Path $PSScriptRoot -Parent }
$env:SKILLGATE_ROOT = $teamRoot
Set-Location (Join-Path $teamRoot "tui")

$bunCmd = Get-Command bun -ErrorAction SilentlyContinue
$bunExe = if ($bunCmd) { $bunCmd.Source } else { $null }
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