/** Portable SessionStart hook script (bash — runs on macOS/Linux/Git Bash). */
export function renderCheckSkillgateHook(): string {
  return `#!/usr/bin/env bash
set -euo pipefail
ROOT="\${SKILLGATE_ROOT:-$HOME/.skillgate-team}"
PROFILE_FILE="$(git rev-parse --show-toplevel 2>/dev/null)/.skillgate/profile"
PROFILE="$(cat "$PROFILE_FILE" 2>/dev/null || echo quant)"

run_skillgate() {
  if command -v skillgate >/dev/null 2>&1; then
    SKILLGATE_ROOT="$ROOT" skillgate "$@"
    return
  fi
  if [ -n "\${SKILLGATE_CLI:-}" ] && [ -f "$SKILLGATE_CLI" ]; then
    SKILLGATE_ROOT="$ROOT" node "$SKILLGATE_CLI" "$@"
    return
  fi
  for candidate in \\
    "$HOME/.skillgate/bin/skillgate.mjs" \\
    "$HOME/.skillgate/repo/bin/skillgate.mjs" \\
    "$HOME/.skillgate-team/cli/bin/skillgate.mjs"; do
    if [ -f "$candidate" ]; then
      SKILLGATE_ROOT="$ROOT" node "$candidate" "$@"
      return
    fi
  done
  echo "SKILLGATE_MISSING: run skillgate install-global from skillgate-team/cli" >&2
  exit 2
}

if [ ! -d "$ROOT" ]; then
  echo "SKILLGATE_TEAM_MISSING: clone skillgate-team to $ROOT" >&2
  exit 2
fi

run_skillgate doctor --profile "$PROFILE" -q
`;
}