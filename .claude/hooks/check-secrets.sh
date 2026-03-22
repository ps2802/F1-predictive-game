#!/usr/bin/env bash
# Secrets detection hook — runs before Write/Edit tool calls.
# Scans content being written for common secret patterns and blocks the write if found.
# Extracted from everything-claude-code security patterns, adapted for Gridlock.

set -euo pipefail

# Read the file path from the environment (set by Claude Code hooks)
FILE_PATH="${CLAUDE_TOOL_INPUT_FILE_PATH:-}"

# Only check source files — skip binary, lock files, and audit docs
if [[ -z "$FILE_PATH" ]]; then
  exit 0
fi

case "$FILE_PATH" in
  *.png|*.jpg|*.ico|*.svg|*.woff*|*.lock|*package-lock.json)
    exit 0
    ;;
  *INTEGRATIONS_AUDIT.md|*INTEGRATIONS.md|*CLAUDE.md)
    # Docs may contain example patterns — skip
    exit 0
    ;;
esac

# Patterns that indicate a hardcoded secret
SECRET_PATTERNS=(
  # Supabase keys
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.'
  'sbp_[a-zA-Z0-9]{40}'
  # Generic high-entropy keys (service role / API keys)
  'SUPABASE_SERVICE_ROLE_KEY\s*=\s*["\x27][a-zA-Z0-9._-]{20,}'
  'SUPABASE_ANON_KEY\s*=\s*["\x27][a-zA-Z0-9._-]{20,}'
  # Common secret variable assignments with literal values
  'API_KEY\s*=\s*["\x27][a-zA-Z0-9._/-]{16,}'
  'SECRET\s*=\s*["\x27][a-zA-Z0-9._/-]{16,}'
  'PASSWORD\s*=\s*["\x27][^\$][a-zA-Z0-9._/@!#-]{8,}'
  # GitHub tokens
  'ghp_[a-zA-Z0-9]{36}'
  'github_pat_[a-zA-Z0-9_]{82}'
  # Generic Bearer tokens hardcoded
  "Authorization.*Bearer [a-zA-Z0-9._-]{20,}"
)

# Read stdin content if piped (for Write operations with new content)
CONTENT=""
if [[ -p /dev/stdin ]]; then
  CONTENT=$(cat)
elif [[ -f "$FILE_PATH" ]]; then
  CONTENT=$(cat "$FILE_PATH")
fi

if [[ -z "$CONTENT" ]]; then
  exit 0
fi

FOUND=0
for pattern in "${SECRET_PATTERNS[@]}"; do
  if echo "$CONTENT" | grep -qE "$pattern" 2>/dev/null; then
    echo "BLOCKED: Potential hardcoded secret detected matching pattern: $pattern" >&2
    echo "File: $FILE_PATH" >&2
    echo "Use environment variables instead. Secrets belong in .env.local (dev) or Vercel env vars (prod)." >&2
    FOUND=1
  fi
done

# Exit non-zero to block the tool call if secrets were found
if [[ $FOUND -eq 1 ]]; then
  exit 1
fi

exit 0
