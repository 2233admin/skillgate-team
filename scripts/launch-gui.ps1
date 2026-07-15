# Launch the Skillgate Tauri desktop in development mode.
$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$env:SKILLGATE_ROOT = $Root
Set-Location $Root
if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
  throw "Bun is required: https://bun.sh"
}
if (-not (Get-Command rustc -ErrorAction SilentlyContinue)) {
  throw "Rust 1.85 or newer is required: https://rustup.rs"
}
bun run gui:tauri
