# Install Electron desktop GUI workspace deps (bun monorepo + Node natives).
# Prefer Node 22–25 — better-sqlite3 and Electron are not validated on Node 26+.
param(
  [switch]$SkipNative
)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
Set-Location $Root

function Repair-BetterSqlite3Vcxproj {
  param(
    [string]$NodeExe,
    [string]$BsqlRoot
  )
  $vcxproj = Join-Path $BsqlRoot "build\deps\locate_sqlite3.vcxproj"
  if (-not (Test-Path $vcxproj)) { return }

  $outDir = Join-Path $BsqlRoot "build\Release\obj\global_intermediate\sqlite3"
  New-Item -ItemType Directory -Force -Path $outDir | Out-Null
  & $NodeExe (Join-Path $BsqlRoot "deps\copy.js") $outDir "" | Out-Null

  $content = Get-Content $vcxproj -Raw
  $content = $content -replace '<Command>.*?</Command>', '<Command>echo sqlite3 pre-copied&#xD;&#xA;exit /b 0</Command>'
  Set-Content -Path $vcxproj -Value $content -NoNewline
}

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
Write-Host "Installing skillgate-team workspaces with Bun (ignore native scripts)..." -ForegroundColor Cyan

# Root bun workspaces: skip better-sqlite3 compile during install (Node 26 breaks it).
bun install --ignore-scripts

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
  # Project .npmrc sets script-shell=cmd.exe so node-gyp MSBuild actions find node (user ~/.npmrc may use Git bash).
  $bsqlDirs = Get-ChildItem -Path (Join-Path $Root "node_modules\.bun\better-sqlite3@*\node_modules\better-sqlite3") -Directory -ErrorAction SilentlyContinue
  foreach ($dir in $bsqlDirs) {
    $buildDir = Join-Path $dir.FullName "build"
    if (Test-Path $buildDir) {
      Remove-Item -Recurse -Force $buildDir
    }
  }
  $legacyBsql = Join-Path $Root "node_modules\better-sqlite3\build"
  if (Test-Path $legacyBsql) {
    Remove-Item -Recurse -Force $legacyBsql
  }
  # User ~/.npmrc may set script-shell=bash, which breaks node-gyp MSBuild ("node" not found).
  $prevScriptShell = $env:npm_config_script_shell
  $env:npm_config_script_shell = "C:\Windows\System32\cmd.exe"
  $electronVer = (& $NodeExe -p "require('electron/package.json').version" 2>$null)
  if (-not $electronVer) { $electronVer = "42.4.1" }

  Push-Location $Root
  $rebuildExit = 0
  try {
    npx --yes electron-rebuild -f -w better-sqlite3 -m .
    $rebuildExit = $LASTEXITCODE
  } finally {
    Pop-Location
    if ($null -ne $prevScriptShell) {
      $env:npm_config_script_shell = $prevScriptShell
    } else {
      Remove-Item Env:npm_config_script_shell -ErrorAction SilentlyContinue
    }
  }

  if ($rebuildExit -ne 0) {
    Write-Host "electron-rebuild failed (exit $rebuildExit); retrying with MSBuild node-gyp workaround..." -ForegroundColor Yellow
    $bsqlDirs = @(
      (Get-ChildItem -Path (Join-Path $Root "node_modules\.bun\better-sqlite3@*\node_modules\better-sqlite3") -Directory -ErrorAction SilentlyContinue)
      (Get-Item (Join-Path $Root "node_modules\better-sqlite3") -ErrorAction SilentlyContinue)
    ) | Where-Object { $_ } | Select-Object -ExpandProperty FullName -Unique

    $prevScriptShell = $env:npm_config_script_shell
    $env:npm_config_script_shell = "C:\Windows\System32\cmd.exe"
    foreach ($dir in $bsqlDirs) {
      Push-Location $dir
      try {
        npx --yes node-gyp configure --target=$electronVer --dist-url=https://electronjs.org/headers
        if ($LASTEXITCODE -ne 0) { continue }
        Repair-BetterSqlite3Vcxproj -NodeExe $NodeExe -BsqlRoot $dir
        npx --yes node-gyp build
        if ($LASTEXITCODE -eq 0) { $rebuildExit = 0 }
      } finally {
        Pop-Location
      }
    }
    if ($null -ne $prevScriptShell) {
      $env:npm_config_script_shell = $prevScriptShell
    } else {
      Remove-Item Env:npm_config_script_shell -ErrorAction SilentlyContinue
    }
  }

  if ($rebuildExit -ne 0) {
    Write-Host "WARN: better-sqlite3 native rebuild failed (exit $rebuildExit). Desktop SQLite may not work." -ForegroundColor Yellow
  } else {
    Write-Host "better-sqlite3 rebuilt for Electron $electronVer" -ForegroundColor Green
  }
}

Write-Host "GUI deps OK. Launch with: bun run gui" -ForegroundColor Green