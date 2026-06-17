# Opens Skillgate TUI in a new Windows Terminal tab (better rendering than legacy conhost).
param(
  [string]$TeamRoot = $(if ($env:SKILLGATE_ROOT) { $env:SKILLGATE_ROOT } else { Split-Path $PSScriptRoot -Parent })
)

$ErrorActionPreference = "Stop"

function Resolve-WtExe {
  $cmd = Get-Command wt -ErrorAction SilentlyContinue
  $candidates = @()
  if ($cmd) { $candidates += $cmd.Source }
  $candidates += @(
    "$env:LOCALAPPDATA\Microsoft\WindowsApps\wt.exe",
    "${env:ProgramFiles}\Windows Terminal\wt.exe",
    "${env:ProgramFiles(x86)}\Windows Terminal\wt.exe"
  )
  foreach ($path in $candidates) {
    if ($path -and (Test-Path $path)) { return $path }
  }
  return $null
}

function Resolve-PwshExe {
  $cmd = Get-Command pwsh -ErrorAction SilentlyContinue
  $candidates = @()
  if ($cmd) { $candidates += $cmd.Source }
  $candidates += @(
    "C:\Program Files\PowerShell\7\pwsh.exe",
    "C:\Program Files (x86)\PowerShell\7\pwsh.exe"
  )
  foreach ($path in $candidates) {
    if ($path -and (Test-Path $path)) { return $path }
  }
  return $null
}

$wtExe = Resolve-WtExe
if (-not $wtExe) {
  Write-Error "Windows Terminal (wt.exe) not found. Install from Microsoft Store or winget install Microsoft.WindowsTerminal"
}

$pwshExe = Resolve-PwshExe
if (-not $pwshExe) {
  Write-Error "PowerShell 7 (pwsh.exe) not found."
}

$runScript = Join-Path $PSScriptRoot "launch-tui.ps1"
$tuiDir = Join-Path $TeamRoot "tui"

# wt requires `--` before the shell command. Use full paths to avoid 0x80070002.
$wtArgs = @(
  "-w", "0", "nt",
  "--title", "Skillgate TUI",
  "-d", $tuiDir,
  "--", $pwshExe,
  "-NoExit",
  "-ExecutionPolicy", "Bypass",
  "-File", $runScript
)

$env:SKILLGATE_ROOT = $TeamRoot
Start-Process -FilePath $wtExe -ArgumentList $wtArgs
Write-Host "Launched Skillgate TUI in Windows Terminal." -ForegroundColor Green