# In-repo one-shot install (Windows). Prefer: bun run bootstrap
param(
  [switch]$Desktop,
  [switch]$SkipApply,
  [switch]$En
)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
Set-Location $Root

$argsList = @()
if ($Desktop) { $argsList += "--desktop" }
if ($SkipApply) { $argsList += "--skip-apply" }
if ($En) { $argsList += "--en" }

& node (Join-Path $PSScriptRoot "bootstrap.mjs") @argsList
exit $LASTEXITCODE