# Install Electron desktop GUI workspace deps (cli + ui + desktop).
# Prefer Node 22 LTS — better-sqlite3 and Electron tooling are not validated on Node 26+.
param(
  [switch]$SkipNative
)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
Set-Location $Root

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
  node $electronInstall
  Remove-Item Env:force_no_cache -ErrorAction SilentlyContinue
}

$electronExe = Join-Path $Root "node_modules\electron\dist\electron.exe"
if (-not (Test-Path $electronExe)) {
  Write-Host "WARN: electron.exe still missing. Try Node 22 LTS and rerun this script." -ForegroundColor Yellow
  exit 1
}

Write-Host "GUI deps OK. Launch with: skillgate gui" -ForegroundColor Green