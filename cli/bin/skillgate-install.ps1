# skillgate global install (Windows)
# npm v11+ blocks `npm link -g`; this installs shims to ~/.skillgate/bin and adds User PATH.
param(
  [string]$SourcePath = "",
  [switch]$SkipBuild,
  [switch]$WhatIf
)

$ErrorActionPreference = "Stop"

if (-not $SourcePath) {
  $SourcePath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

$UserHome = $env:USERPROFILE
$StateDir = Join-Path $UserHome ".skillgate"
$RepoLink = Join-Path $StateDir "repo"
$BinDir = Join-Path $StateDir "bin"
$ShimMjs = Join-Path $BinDir "skillgate.mjs"
$ShimCmd = Join-Path $BinDir "skillgate.cmd"
$ShimBash = Join-Path $BinDir "skillgate"

if (-not (Test-Path (Join-Path $SourcePath "package.json"))) {
  Write-Error "SourcePath is not a skillgate repo: $SourcePath"
}

if (-not $SkipBuild) {
  Write-Host "Building skillgate in $SourcePath ..."
  Push-Location $SourcePath
  try {
    if (-not (Test-Path "node_modules")) {
      npm install
    }
    npm run build
  } finally {
    Pop-Location
  }
}

if ($WhatIf) {
  Write-Host "[WhatIf] Would link $SourcePath -> $RepoLink"
  Write-Host "[WhatIf] Would write shims under $BinDir"
  Write-Host "[WhatIf] Would add $BinDir to User PATH"
  exit 0
}

New-Item -ItemType Directory -Force -Path $StateDir | Out-Null
New-Item -ItemType Directory -Force -Path $BinDir | Out-Null

if (Test-Path $RepoLink) {
  $item = Get-Item $RepoLink -Force
  if ($item.LinkType -eq "Junction" -or $item.LinkType -eq "SymbolicLink") {
    Remove-Item $RepoLink -Force
  } elseif ($item.PSIsContainer) {
    Remove-Item $RepoLink -Recurse -Force
  } else {
    Remove-Item $RepoLink -Force
  }
}

cmd /c mklink /J "$RepoLink" "$SourcePath" | Out-Null
if (-not (Test-Path $RepoLink)) {
  Write-Error "Failed to create junction $RepoLink -> $SourcePath"
}

$entryMjs = Join-Path $RepoLink "bin\skillgate.mjs"
if (-not (Test-Path $entryMjs)) {
  Write-Error "Missing $entryMjs after link"
}

@'
#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const shimDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(process.env.SKILLGATE_HOME ?? path.join(shimDir, ".."), "repo");
const cliPath = path.join(repoRoot, "dist", "cli.js");
await import(pathToFileURL(cliPath).href);
'@ | Set-Content -Path $ShimMjs -Encoding utf8NoBOM

@'
@echo off
node "%~dp0skillgate.mjs" %*
'@ | Set-Content -Path $ShimCmd -Encoding ascii

@'
#!/usr/bin/env bash
set -euo pipefail
exec node "$(dirname "$0")/skillgate.mjs" "$@"
'@ | Set-Content -Path $ShimBash -Encoding utf8NoBOM

# User environment (persistent)
[Environment]::SetEnvironmentVariable("SKILLGATE_HOME", $StateDir, "User")
[Environment]::SetEnvironmentVariable(
  "SKILLGATE_CLI",
  (Join-Path $RepoLink "bin\skillgate.mjs"),
  "User"
)

$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if (-not $userPath) { $userPath = "" }
$paths = $userPath -split ";" | Where-Object { $_ -and $_.Trim() -ne "" }
if ($paths -notcontains $BinDir) {
  $paths = @($BinDir) + $paths
  [Environment]::SetEnvironmentVariable("Path", ($paths -join ";"), "User")
}

$env:SKILLGATE_HOME = $StateDir
$env:SKILLGATE_CLI = Join-Path $RepoLink "bin\skillgate.mjs"
if ($env:Path -notlike "*$BinDir*") {
  $env:Path = "$BinDir;$env:Path"
}

Write-Host ""
Write-Host "skillgate installed to $StateDir"
Write-Host "  repo junction -> $SourcePath"
Write-Host "  PATH += $BinDir"
Write-Host ""
Write-Host "Open a new terminal, then run:"
Write-Host "  skillgate --help"
Write-Host ""

& node $ShimMjs --help 2>&1 | Select-Object -First 5