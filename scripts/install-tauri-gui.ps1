$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
Set-Location $Root

if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
  throw "Bun is required: https://bun.sh"
}
if (-not (Get-Command rustc -ErrorAction SilentlyContinue)) {
  throw "Rust 1.85 or newer is required: https://rustup.rs"
}

$rustVersion = rustc --version
Write-Host "Using $rustVersion" -ForegroundColor Cyan
Write-Host "Installing Skillgate Tauri workspace dependencies..." -ForegroundColor Cyan
bun install --frozen-lockfile --ignore-scripts
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Checking the Tauri desktop toolchain..." -ForegroundColor Cyan
bun run gui:tauri:check
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Tauri desktop dependencies are ready. Launch with: bun run gui" -ForegroundColor Green

