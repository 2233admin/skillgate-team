param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("optional", "required")]
  [string]$Mode
)

$ErrorActionPreference = "Stop"
$RepoRoot = git rev-parse --show-toplevel 2>$null
if (-not $RepoRoot) {
  Write-Error "Not in a git repository. Run from project root."
}

$ProfileDir = Join-Path $RepoRoot ".skillgate"
$ProfileFile = Join-Path $ProfileDir "profile"
$HookDir = Join-Path $RepoRoot ".claude\hooks"
$HookFile = Join-Path $HookDir "check-skillgate.sh"
$SettingsFile = Join-Path $RepoRoot ".claude\settings.json"
$ClaudeMd = Join-Path $RepoRoot "CLAUDE.md"

New-Item -ItemType Directory -Force -Path $ProfileDir | Out-Null
if (-not (Test-Path $ProfileFile)) {
  Set-Content -Path $ProfileFile -Value "quant" -NoNewline
}

New-Item -ItemType Directory -Force -Path $HookDir | Out-Null
@'
#!/usr/bin/env bash
set -euo pipefail
ROOT="${SKILLGATE_ROOT:-$HOME/.team-skills}"
PROFILE_FILE="$(git rev-parse --show-toplevel 2>/dev/null)/.skillgate/profile"
PROFILE="$(cat "$PROFILE_FILE" 2>/dev/null || echo quant)"

run_skillgate() {
  if command -v skillgate >/dev/null 2>&1; then
    SKILLGATE_ROOT="$ROOT" skillgate "$@"
    return
  fi
  if [ -n "${SKILLGATE_CLI:-}" ] && [ -f "$SKILLGATE_CLI" ]; then
    SKILLGATE_ROOT="$ROOT" node "$SKILLGATE_CLI" "$@"
    return
  fi
  for candidate in \
    "$HOME/.skillgate/bin/skillgate.mjs" \
    "$HOME/.skillgate/repo/bin/skillgate.mjs" \
    "D:/projects/_tools/skillgate/bin/skillgate.mjs"; do
    if [ -f "$candidate" ]; then
      SKILLGATE_ROOT="$ROOT" node "$candidate" "$@"
      return
    fi
  done
  echo "SKILLGATE_MISSING: install skillgate CLI or set SKILLGATE_CLI" >&2
  exit 2
}

if [ ! -d "$ROOT" ]; then
  echo "TEAM_SKILLS_MISSING: clone team-skills to $ROOT" >&2
  exit 2
fi

run_skillgate doctor --profile "$PROFILE" -q
'@ | Set-Content -Path $HookFile -Encoding utf8NoBOM

if ($Mode -eq "required") {
  New-Item -ItemType Directory -Force -Path (Split-Path $SettingsFile) | Out-Null
  $settings = @{}
  if (Test-Path $SettingsFile) {
    $settings = Get-Content $SettingsFile -Raw | ConvertFrom-Json -AsHashtable
  }
  if (-not $settings.hooks) { $settings.hooks = @{} }
  if (-not $settings.hooks.SessionStart) { $settings.hooks.SessionStart = @() }

  $hookCmd = '"$CLAUDE_PROJECT_DIR/.claude/hooks/check-skillgate.sh"'
  $exists = $false
  foreach ($entry in $settings.hooks.SessionStart) {
    if ($entry.hooks) {
      foreach ($h in $entry.hooks) {
        if ($h.command -like "*check-skillgate*") { $exists = $true }
      }
    }
  }
  if (-not $exists) {
    $settings.hooks.SessionStart += @{
      hooks = @(
        @{
          type    = "command"
          command = $hookCmd
        }
      )
    }
  }
  ($settings | ConvertTo-Json -Depth 10) + "`n" | Set-Content -Path $SettingsFile -Encoding utf8NoBOM
}

$Snippet = if ($Mode -eq "required") {
@"

## skillgate (REQUIRED)

Before any work, verify team skills:

``````bash
skillgate doctor --profile quant
``````

If missing: clone team-skills to ``~/.team-skills``, then ``skillgate apply --profile quant``.
"@
} else {
@"

## skillgate (recommended)

Install team skills for consistent agent behavior:

``````bash
skillgate apply --profile quant
``````
"@
}

if (Test-Path $ClaudeMd) {
  $content = Get-Content $ClaudeMd -Raw
  if ($content -notmatch "## skillgate") {
    Add-Content -Path $ClaudeMd -Value $Snippet
  }
} else {
  Set-Content -Path $ClaudeMd -Value "# Project`n$Snippet"
}

Write-Host "skillgate team-init ($Mode) complete."
Write-Host "  .skillgate/profile"
Write-Host "  .claude/hooks/check-skillgate.sh"
if ($Mode -eq "required") {
  Write-Host "  .claude/settings.json (SessionStart hook)"
}