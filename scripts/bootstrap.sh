#!/usr/bin/env bash
# In-repo one-shot install (macOS / Linux). Prefer: bun run bootstrap
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
exec node scripts/bootstrap.mjs "$@"