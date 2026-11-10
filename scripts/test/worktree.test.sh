#!/usr/bin/env bash
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

repo="$scratch/proj"
wts="$scratch/proj-worktrees"
git init -q -b main "$repo"
git -C "$repo" config user.email t@t.t
git -C "$repo" config user.name t
mkdir -p "$repo/scripts/lib" "$repo/server"
cp "$src/lib/worktree-common.sh" "$src/lib/ports.sh" "$repo/scripts/lib/"
sed "s|^WH_INSTALL_CMD='pnpm install'|WH_INSTALL_CMD=''|" "$src/worktree.sh" > "$repo/scripts/worktree.sh"
chmod +x "$repo/scripts/worktree.sh"
printf 'exec sleep 300\n' > "$repo/scripts/dev-server.sh"
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
# shellcheck source=/dev/null
. "$repo/scripts/lib/worktree-common.sh"
check "feat/ui and fix/ui get different hosts" \
  [ "$(wh_url lessons-radio "$(wh_slugify feat/ui)" t)" != "$(wh_url lessons-radio "$(wh_slugify fix/ui)" t)" ]

# list: a process whose command line holds a newline does not break the output
(cd "$wts/feat-ui" && exec bash -c $'sleep 300 # line one\n# line two') &
bg_pids+=("$!")
sleep 0.3
list_out="$(cd "$repo" && "$wt_sh" list 2>&1)"
check "list ignores newlines in command lines" bash -c "! grep -q 'line two\|processes left' <<<\"\$1\"" _ "$list_out"

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
