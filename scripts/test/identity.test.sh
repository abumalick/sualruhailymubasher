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
  'عبد الرزاق البدر'
  '7979d855f5a8ed011c9e9d54467dd431b227a6bf34451dd39c66708a330cac83'
)
pattern="$(IFS='|'; echo "${patterns[*]}")"
fixtures='scripts/test/fixtures/identity'
self='scripts/test/identity.test.sh'

# rg exits 0 on a match, 1 on none, and 2 or more on a real failure.
rg_hits() {
  local status=0
  rg "$@" || status=$?
  [ "$status" -le 1 ] || { echo "identity guard: rg failed with exit $status" >&2; exit "$status"; }
}

# Prints "path:line:text" for each hit among the NUL-separated paths on stdin;
# a path that matches by name is reported too.
scan() {
  local files=() hits
  mapfile -d '' files
  [ "${#files[@]}" -gt 0 ] || return 0
  hits="$(printf '%s\n' "${files[@]}" | rg_hits -i -e "$pattern" | sed 's/$/ (path)/')"
  [ -z "$hits" ] || printf '%s\n' "$hits"
  rg_hits -i -n --no-heading --with-filename -e "$pattern" -- "${files[@]}"
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
