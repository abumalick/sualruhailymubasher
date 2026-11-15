#!/usr/bin/env bash
# Fails while any tracked file outside docs/ still carries an identifier of the
# app this repo was forked from.
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$root"

patterns=(
  'albadr' 'al-badr' 'albadrnet' 'albadrmubasher' 'albadrlessons'
  '11ae0749-3428-4993-ba2e-16d6aea40336'
  '6832876968'
  'albadr-lessons'
  'ALBADR_'
)
pattern="$(IFS='|'; echo "${patterns[*]}")"
fixtures='scripts/test/fixtures/identity'
self='scripts/test/identity.test.sh'

# Prints "path:line:text" for each hit among the NUL-separated paths on stdin;
# a path that matches by name is reported too.
scan() {
  local files hits
  mkdir -p "$root/.tmp"
  files="$(mktemp -p "$root/.tmp" scan.XXXXXX)"
  cat > "$files"
  hits="$(tr '\0' '\n' < "$files" | rg -i -e "$pattern" | sed 's/$/ (path)/' || true)"
  [ -z "$hits" ] || printf '%s\n' "$hits"
  xargs -0 -r -a "$files" rg -i -n --no-heading --with-filename -e "$pattern" -- || true
  rm -f "$files"
}

failures=0
pass() { printf 'ok   %s\n' "$1"; }
fail() { printf 'FAIL %s\n' "$1"; failures=$((failures + 1)); }

planted="$(find "$fixtures" -type f -print0 | scan)"
if grep -q 'planted.pbxproj' <<<"$planted"; then
  pass "the scan flags the planted com.albadrmubasher.app"
else
  fail "the scan flags the planted com.albadrmubasher.app"
fi

found="$(git ls-files -z -- . ":(exclude)docs" ":(exclude)$fixtures" ":(exclude)$self" | scan)"
if [ -z "$found" ]; then
  pass "no tracked file outside docs/ carries a forbidden identifier"
else
  fail "no tracked file outside docs/ carries a forbidden identifier"
  printf '%s\n' "$found"
  printf '\n%s files:\n' "$(cut -d: -f1 <<<"$found" | sed 's/ (path)$//' | sort -u | wc -l | tr -d ' ')"
  cut -d: -f1 <<<"$found" | sed 's/ (path)$//' | sort -u
fi

[ "$failures" -eq 0 ]
