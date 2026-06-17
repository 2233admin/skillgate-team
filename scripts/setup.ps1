# Clone ~/.skillgate-team (if needed) + bootstrap. Requires Git + Bun.
param(
  [switch]$Desktop,
  [switch]$SkipApply,
  [switch]$En
)

$ErrorActionPreference = "Stop"
$argsList = @()
if ($Desktop) { $argsList += "--desktop" }
if ($SkipApply) { $argsList += "--skip-apply" }
if ($En) { $argsList += "--en" }

& node (Join-Path $PSScriptRoot "setup.mjs") @argsList
exit $LASTEXITCODE