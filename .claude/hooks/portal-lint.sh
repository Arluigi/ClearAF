#!/usr/bin/env bash
# PostToolUse: auto-fix ESLint issues in an edited portal source file; report remaining errors to Claude.
f=$(jq -r '.tool_input.file_path // ""')
case "$f" in
  */web-portal/src/*.ts|*/web-portal/src/*.tsx) ;;
  *) exit 0 ;;
esac
portal="${f%%/web-portal/src/*}/web-portal"
[ -d "$portal/node_modules" ] || exit 0
cd "$portal" || exit 0
if ! out=$(npx --no-install eslint --fix "$f" 2>&1); then
  echo "ESLint errors remain in $f:" >&2
  echo "$out" >&2
  exit 2
fi
exit 0
