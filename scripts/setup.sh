#!/usr/bin/env bash
# Clone ~/.skillgate-team (if needed) + bootstrap. Requires git + bun.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
exec node "$DIR/setup.mjs" "$@"