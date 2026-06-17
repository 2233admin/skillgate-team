# Install Electron desktop GUI workspace deps (cli + ui + desktop).
# Prefer Node 22–25 — better-sqlite3 and Electron are not validated on Node 26+.
param(
  [switch]$SkipNative
)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
Set-Location $Root

function Resolve-PreferredNode {
  $candidates = @(
    "C:\nodejs-v25.9.0\node.exe",
    "C:\Program Files\nodejs\node.exe"
  )
  foreach ($node in $candidates) {
    if (Test-Path $node) {
      $ver = & $node -v 2>$null
      if ($ver -match '^v(2[0-5])\.' -or $ver -match '^v22\.') {
        return $node
      }
    }
  }
  foreach ($node in $candidates) {
    if (Test-Path $node) { return $node }
  }
  return "node"
}

$NodeExe = Resolve-PreferredNode
$NodeDir = Split-Path $NodeExe -Parent
if ($NodeDir) {
  $env:Path = "$NodeDir;$env:Path"
}

Write-Host "Using Node: $(& $NodeExe -v)" -ForegroundColor Cyan
Write-Host "Installing skillgate-team GUI workspaces (cli, ui, desktop)..." -ForegroundColor Cyan

if ($SkipNative) {
  npm install --ignore-scripts
} else {
  npm install
}

Write-Host "Ensuring Electron binary..." -ForegroundColor Cyan
$electronInstall = Join-Path $Root "node_modules\electron\install.js"
if (Test-Path $electronInstall) {
  $env:force_no_cache = "true"
  & $NodeExe $electronInstall
  Remove-Item Env:force_no_cache -ErrorAction SilentlyContinue
}

$electronExe = Join-Path $Root "node_modules\electron\dist\electron.exe"
if (-not (Test-Path $electronExe)) {
  Write-Host "WARN: electron.exe still missing. Try Node 22–25 LTS and rerun this script." -ForegroundColor Yellow
  exit 1
}

if (-not $SkipNative) {
  Write-Host "Rebuilding better-sqlite3 for Electron..." -ForegroundColor Cyan
  npx electron-rebuild -f -w better-sqlite3 -m .
}

Write-Host "GUI deps OK. Launch with: skillgate gui" -ForegroundColor Green