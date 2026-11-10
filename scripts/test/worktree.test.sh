#!/usr/bin/env bash
# all() evals its quoted conditions, so they are single-quoted on purpose.
# shellcheck disable=SC2016,SC2034
# Tests for scripts/worktree.sh and scripts/lib/*.sh, run against a scratch repo.
# Each case starts no real dev server: the harness is copied with an empty install
# command and a stub dev-server.sh.
set -euo pipefail

src="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$src/../.tmp"
scratch="$(cd "$(mktemp -d "$src/../.tmp/worktree-test.XXXXXX")" && pwd -P)"
bg_pids=()
cleanup() {
  for p in "${bg_pids[@]}"; do kill "$p" 2>/dev/null || true; done
  rm -rf "$scratch"
}
trap cleanup EXIT

failures=0
pass() { printf 'ok   %s\n' "$1"; }
fail() { printf 'FAIL %s\n' "$1"; failures=$((failures + 1)); }
check() { local name="$1"; shift; if "$@"; then pass "$name"; else fail "$name"; fi; }
all() { local c; for c in "$@"; do eval "$c" || return 1; done; }

repo="$scratch/proj"
wts="$scratch/proj-worktrees"
git init -q -b main "$repo"
git -C "$repo" config user.email t@t.t
git -C "$repo" config user.name t
mkdir -p "$repo/scripts/lib" "$repo/server"
cp "$src/lib/worktree-common.sh" "$src/lib/ports.sh" "$repo/scripts/lib/"
sed "s|^WH_INSTALL_CMD='pnpm install'|WH_INSTALL_CMD=''|" "$src/worktree.sh" > "$repo/scripts/worktree.sh"
chmod +x "$repo/scripts/worktree.sh"
# shellcheck disable=SC2016 # expands when the stub runs
printf 'echo stub-log-line\n[ -z "${STUB_DIE:-}" ] || exit 3\nexec sleep 300\n' > "$repo/scripts/dev-server.sh"
printf 'server/.dev.vars\n' > "$repo/.gitignore"
printf 'ADMIN_TOKEN=local\n' > "$repo/server/.dev.vars"
git -C "$repo" add -A
git -C "$repo" commit -q -m init
wt_sh="$repo/scripts/worktree.sh"

# create
out="$(cd "$repo" && "$wt_sh" create feat/ui 2>/dev/null)"
check "create prints only the worktree path, beside the repo" [ "$out" = "$wts/feat-ui" ]
check "create copies server/.dev.vars" grep -qx 'ADMIN_TOKEN=local' "$wts/feat-ui/server/.dev.vars"
check "create refuses a branch too long for a host label" \
  bash -c "cd '$repo' && ! '$wt_sh' create $(printf 'b%.0s' $(seq 1 50)) 2>/dev/null"

# up: URL per worktree dir, a branch without the harness is refused
procs_in() { for p in /proc/[0-9]*; do case "$(readlink "$p/cwd" 2>/dev/null)" in "$1"|"$1"/*) echo "${p#/proc/}";; esac; done; }
(cd "$repo" && "$wt_sh" up feat/ui --bg >/dev/null 2>&1)
for _ in $(seq 1 20); do [ -n "$(procs_in "$wts/feat-ui")" ] && break; sleep 0.1; done
check "up --bg runs the server inside the worktree" [ -n "$(procs_in "$wts/feat-ui")" ]
git -C "$repo" branch -q old main
git -C "$repo" checkout -q old
git -C "$repo" rm -q scripts/dev-server.sh
git -C "$repo" commit -q -m "before the harness"
git -C "$repo" checkout -q main
git -C "$repo" worktree add -q "$wts/old" old
old_err="$(cd "$repo" && "$wt_sh" up old --bg 2>&1)" || true
case "$old_err" in
  *"predates the harness"*) pass "up refuses a worktree without dev-server.sh" ;;
  *) fail "up refuses a worktree without dev-server.sh: $old_err" ;;
esac
url_of() { (cd "$repo" && "$wt_sh" create "$1" 2>&1 >/dev/null) | sed -n 's/^url: *//p'; }
fix_url="$(url_of fix/ui)"
feat_url="$(url_of feat/ui)"
check "each worktree's URL is named after its directory" \
  all '[ "$feat_url" = https://lessons-radio-feat-ui.dev.sageplex.com ]' '[ "$fix_url" = https://lessons-radio-fix-ui.dev.sageplex.com ]'
(cd "$repo" && "$wt_sh" remove fix/ui --force >/dev/null 2>&1)

# dev-server.sh registers the same name with portless (pnpm and portless stubbed)
ds="$scratch/ds"
mkdir -p "$ds/scripts/lib" "$ds/server" "$ds/app" "$scratch/ds-stubs"
cp "$src/dev-server.sh" "$ds/scripts/"
cp "$src/lib/worktree-common.sh" "$src/lib/ports.sh" "$ds/scripts/lib/"
printf '#!/bin/sh\nexit 0\n' > "$scratch/ds-stubs/pnpm"
# shellcheck disable=SC2016 # $1 expands when the stub runs
printf '#!/bin/sh\necho "$1" > "%s/portless-name"\n' "$scratch" > "$scratch/ds-stubs/portless"
chmod +x "$scratch/ds-stubs/pnpm" "$scratch/ds-stubs/portless"
env PATH="$scratch/ds-stubs:$PATH" WH_SLUG=feat-ui bash "$ds/scripts/dev-server.sh" >/dev/null 2>&1 || true
check "dev-server.sh registers lessons-radio-<worktree-dir> with portless" \
  grep -qx 'lessons-radio-feat-ui' "$scratch/portless-name"

# list: a process whose command line holds a newline does not break the output
(cd "$wts/feat-ui" && exec bash -c $'sleep 300 # line one\n# line two') &
bg_pids+=("$!")
sleep 0.3
list_out="$(cd "$repo" && "$wt_sh" list 2>&1)"
check "list ignores newlines in command lines" bash -c "! grep -q 'line two\|processes left' <<<\"\$1\"" _ "$list_out"

# start: health checks go through a curl stub, so no test touches the network
stubs="$scratch/stubs"
mkdir -p "$stubs"
printf '#!/bin/sh\n[ -e "%s/curl-ok" ]\n' "$scratch" > "$stubs/curl"
chmod +x "$stubs/curl"
run_start() { # run_start <branch> [VAR=value...] -> START_OUT, START_ERR, START_STATUS
  local b="$1"; shift
  set +e
  START_OUT="$(cd "$repo" && env PATH="$stubs:$PATH" WH_START_TIMEOUT=1 "$@" timeout 30 "$wt_sh" start "$b" 2>"$scratch/start.err")"
  START_STATUS=$?
  set -e
  START_ERR="$(cat "$scratch/start.err")"
}
has() { case "$START_ERR" in *"$1"*) return 0 ;; esac; return 1; }

run_start feat/cap
check "start returns the path to a caller capturing it" [ "$START_OUT" = "$wts/feat-cap" ]
check "start exits non-zero when the URL never answers (status $START_STATUS)" \
  all '[ "$START_STATUS" -ne 0 ]' '[ "$START_STATUS" -ne 124 ]'
check "start's timeout names the failure and shows the log" all 'has "did not answer within 1s"' 'has stub-log-line'
run_start feat/cap
check "start refuses to launch a second copy while servers still boot" has "processes already run in $wts/feat-cap"
touch "$scratch/curl-ok"
run_start feat/cap
check "start reports servers that already answer as running" all '[ "$START_STATUS" -eq 0 ]' 'has "already running"'
run_start feat/other
check "start refuses a URL answered by something outside the worktree" has "something else already answers"
rm "$scratch/curl-ok"
run_start feat/die STUB_DIE=1 WH_START_TIMEOUT=20
check "start fails fast when the servers exit" all '[ "$START_STATUS" -ne 0 ]' 'has "the servers exited"'
for b in feat/cap feat/other feat/die; do (cd "$repo" && "$wt_sh" remove "$b" --force >/dev/null 2>&1) || echo "remove $b failed"; done

# remove: stops every process in the worktree, deletes its log, keeps nothing
echo change > "$wts/feat-ui/change.txt"
git -C "$wts/feat-ui" add change.txt
git -C "$wts/feat-ui" commit -q -m change
mkdir -p "$wts/.logs" && : > "$wts/.logs/feat-ui.log"
check "remove refuses an unmerged branch" bash -c "cd '$repo' && ! '$wt_sh' remove feat/ui 2>/dev/null"
(cd "$repo" && "$wt_sh" remove feat-ui --force 2>/dev/null)
check "remove --force by slug deletes the worktree" [ ! -e "$wts/feat-ui" ]
check "remove deletes the branch" bash -c "! git -C '$repo' show-ref --quiet refs/heads/feat/ui"
check "remove deletes the worktree's log" [ ! -e "$wts/.logs/feat-ui.log" ]
check "remove stops the worktree's processes" [ -z "$(procs_in "$wts/feat-ui")" ]

# ports
# shellcheck source=/dev/null
. "$repo/scripts/lib/ports.sh"
port=$(( 20000 + RANDOM % 20000 ))
port="$(wh_free_port "$port")"
check "wh_free_port returns a port nobody listens on" bash -c "! (exec 3<>/dev/tcp/127.0.0.1/$port) 2>/dev/null"
node -e "require('net').createServer().listen($port, '127.0.0.1')" &
bg_pids+=("$!")
for _ in $(seq 1 50); do wh_port_busy "$port" && break; sleep 0.1; done
check "wh_free_port skips a busy port" [ "$(wh_free_port "$port")" -gt "$port" ]

if [ "$failures" -ne 0 ]; then echo "worktree harness: $failures failed"; exit 1; fi
echo "worktree harness: all tests passed"
