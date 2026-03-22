#!/usr/bin/env bash
# Secrets detection hook — PreToolUse on Write|Edit.
# Claude Code passes tool input as JSON on stdin.
# Reads the content being written/edited and blocks if hardcoded secrets are found.

set -euo pipefail

# jq is required to parse stdin JSON
if ! command -v jq &>/dev/null; then
  # Can't scan without jq — allow and warn
  echo '{"continue": true}' >&2
  exit 0
fi

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Only act on Write and Edit
if [[ "$TOOL_NAME" != "Write" && "$TOOL_NAME" != "Edit" ]]; then
  exit 0
fi

# Skip if no file path
if [[ -z "$FILE_PATH" ]]; then
  exit 0
fi

# Skip binary, lock files, and documentation files that may contain example patterns
case "$FILE_PATH" in
  *.png|*.jpg|*.ico|*.svg|*.woff*|*.lock|*package-lock.json)
    exit 0
    ;;
  *INTEGRATIONS_AUDIT.md|*INTEGRATIONS.md|*CLAUDE.md|*check-secrets.sh)
    exit 0
    ;;
esac

# Extract the content being written (Write = .content, Edit = .new_string)
if [[ "$TOOL_NAME" == "Write" ]]; then
  CONTENT=$(echo "$INPUT" | jq -r '.tool_input.content // empty')
else
  CONTENT=$(echo "$INPUT" | jq -r '.tool_input.new_string // empty')
fi

if [[ -z "$CONTENT" ]]; then
  exit 0
fi

# Patterns that indicate a hardcoded secret
SECRET_PATTERNS=(
  # Supabase JWT tokens (service role / anon key)
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.'
  # Supabase personal access token
  'sbp_[a-zA-Z0-9]{40}'
  # GitHub tokens
  'ghp_[a-zA-Z0-9]{36}'
  'github_pat_[a-zA-Z0-9_]{82}'
  # Generic secret assignments with literal values (not env var references)
  'SUPABASE_SERVICE_ROLE_KEY[[:space:]]*=[[:space:]]*"[a-zA-Z0-9._-]{20,}'
  "SUPABASE_SERVICE_ROLE_KEY[[:space:]]*=[[:space:]]*'[a-zA-Z0-9._-]{20,}"
)

FOUND=0
for pattern in "${SECRET_PATTERNS[@]}"; do
  if echo "$CONTENT" | grep -qE "$pattern" 2>/dev/null; then
    echo "BLOCKED: Potential hardcoded secret detected (pattern: $pattern)" >&2
    echo "File: $FILE_PATH" >&2
    echo "Use environment variables. Secrets belong in .env.local (dev) or Vercel env vars (prod)." >&2
    FOUND=1
  fi
done

if [[ $FOUND -eq 1 ]]; then
  exit 2
fi

exit 0
