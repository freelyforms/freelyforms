#!/usr/bin/env bash
set -euo pipefail
# Fails if private/internal files are tracked or staged.
PATTERN='(^private/|\.private\.md$|\.strategy\.md$|^FIRST_PROMPT_FOR_CLAUDE\.md$|^PRIVATE_FILES_README\.txt$|CLAUDE\.local\.md$|settings\.local\.json$|\.zip$|(^|/)\.env($|\.)|\.pem$)'
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  BAD=$( { git ls-files; git diff --cached --name-only; } | grep -E "$PATTERN" | grep -v '^\.env\.example$' | sort -u || true)
  if [ -n "$BAD" ]; then
    echo "ERROR: private/internal files are tracked or staged:" >&2
    echo "$BAD" >&2
    echo "Unstage them: git rm --cached <file>" >&2
    exit 1
  fi
fi
