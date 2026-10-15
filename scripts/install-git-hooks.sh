#!/usr/bin/env bash
set -euo pipefail
ROOT=$(git rev-parse --show-toplevel)
git config core.hooksPath .githooks
chmod +x "$ROOT/.githooks/pre-commit" "$ROOT/scripts/check-private-not-tracked.sh"
echo "Installed repository Git hooks."
