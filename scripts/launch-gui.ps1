# Launch Skillgate Electron GUI (dev mode). Prefers Node 22–25 for native modules.
$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent

$nodeCandidates = @(
  "C:\nodejs-v25.9.0\node.exe",
  "C:\Program Files\nodejs\node.exe"
)
$NodeExe = $null
foreach ($candidate in $nodeCandidates) {
  if (Test-Path $candidate) {
    $NodeExe = $candidate
    break
  }
}
if (-not $NodeExe) {
  throw "Node.js not found. Install Node 22–25 LTS."
}

$NodeDir = Split-Path $NodeExe -Parent
$env:Path = "$NodeDir;$env:Path"
$env:SKILLGATE_ROOT = $Root

$electronExe = Join-Path $Root "node_modules\electron\dist\electron.exe"
if (-not (Test-Path $electronExe)) {
  Write-Host "Electron missing — running install-gui.ps1 first..." -ForegroundColor Yellow
  & (Join-Path $Root "scripts\install-gui.ps1")
}

Set-Location (Join-Path $Root "desktop")
npm run dev