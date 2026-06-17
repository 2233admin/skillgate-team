#!/usr/bin/env bash
# skillgate global install (Git Bash / macOS / Linux)
# npm v11+ blocks `npm link -g`; installs shims to ~/.skillgate/bin and updates shell profile.
set -euo pipefail

SOURCE_PATH="${1:-$(cd "$(dirname "$0")/../cli" && pwd)}"
SKIP_BUILD=0
for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=1 ;;
  esac
done

if [ ! -f "$SOURCE_PATH/package.json" ]; then
  echo "error: not a skillgate repo: $SOURCE_PATH" >&2
  exit 1
fi

STATE_DIR="${HOME}/.skillgate"
REPO_LINK="${STATE_DIR}/repo"
BIN_DIR="${STATE_DIR}/bin"

if [ "$SKIP_BUILD" -eq 0 ]; then
  echo "Building skillgate in $SOURCE_PATH ..."
  (cd "$SOURCE_PATH" && { [ -d node_modules ] || npm install; } && npm run build)
fi

mkdir -p "$BIN_DIR"

if [ -e "$REPO_LINK" ] || [ -L "$REPO_LINK" ]; then
  rm -rf "$REPO_LINK"
fi

ln -snf "$SOURCE_PATH" "$REPO_LINK"

cat > "${BIN_DIR}/skillgate.mjs" <<'EOF'
#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const shimDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(process.env.SKILLGATE_HOME ?? path.join(shimDir, ".."), "repo");
const cliPath = path.join(repoRoot, "dist", "cli.js");
await import(pathToFileURL(cliPath).href);
EOF

cat > "${BIN_DIR}/skillgate" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
exec node "$(dirname "$0")/skillgate.mjs" "$@"
EOF
chmod +x "${BIN_DIR}/skillgate" "${BIN_DIR}/skillgate.mjs"

export SKILLGATE_HOME="$STATE_DIR"
export SKILLGATE_CLI="${REPO_LINK}/bin/skillgate.mjs"

case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*)
    powershell.exe -NoProfile -Command "
      [Environment]::SetEnvironmentVariable('SKILLGATE_HOME', '$STATE_DIR', 'User');
      [Environment]::SetEnvironmentVariable('SKILLGATE_CLI', '$REPO_LINK/bin/skillgate.mjs', 'User');
      \$p = [Environment]::GetEnvironmentVariable('Path', 'User');
      if (\$p -notlike '*$BIN_DIR*') {
        [Environment]::SetEnvironmentVariable('Path', '$BIN_DIR;' + \$p, 'User');
      }
    " >/dev/null
    ;;
  *)
    PROFILE="${HOME}/.bashrc"
    [ -f "${HOME}/.zshrc" ] && PROFILE="${HOME}/.zshrc"
    MARKER="# skillgate PATH"
    if ! grep -qF "$MARKER" "$PROFILE" 2>/dev/null; then
      {
        echo ""
        echo "$MARKER"
        echo "export SKILLGATE_HOME=\"$STATE_DIR\""
        echo "export SKILLGATE_CLI=\"$REPO_LINK/bin/skillgate.mjs\""
        echo "export PATH=\"$BIN_DIR:\$PATH\""
      } >>"$PROFILE"
    fi
    ;;
esac

export PATH="${BIN_DIR}:${PATH}"

echo ""
echo "skillgate installed to $STATE_DIR"
echo "  repo symlink -> $SOURCE_PATH"
echo "  PATH += $BIN_DIR"
echo ""
node "${BIN_DIR}/skillgate.mjs" --help 2>&1 | head -5