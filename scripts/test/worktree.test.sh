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
procs_in() { for p in /proc/[0-9]*; do case "$(readlink "$p/cwd" 2>/dev/null)" in "$1"|"$1"/*) echo "${p#/proc/}";; esac; done; }
bg_pids=()
cleanup() {
  for p in "${bg_pids[@]}"; do kill "$p" 2>/dev/null || true; done
  # Whatever a failed or aborted case left running in the scratch dirs.
  for p in $(procs_in "$scratch"); do kill "$p" 2>/dev/null || true; done
  rm -rf "$scratch"
}
trap cleanup EXIT

failures=0
pass() { printf 'ok   %s\n' "$1"; }
fail() { printf 'FAIL %s\n' "$1"; failures=$((failures + 1)); }
check() { local name="$1"; shift; if "$@"; then pass "$name"; else fail "$name"; fi; }
all() { local c; for c in "$@"; do eval "$c" || return 1; done; }

repo="$scratch/proj"
wts="$repo/.worktrees"
git init -q -b main "$repo"
git -C "$repo" config user.email t@t.t
git -C "$repo" config user.name t
mkdir -p "$repo/scripts/lib" "$repo/server"
cp "$src/lib/worktree-common.sh" "$src/lib/ports.sh" "$repo/scripts/lib/"
sed "s|^WH_INSTALL_CMD=.*|WH_INSTALL_CMD=''|" "$src/worktree.sh" > "$repo/scripts/worktree.sh"
chmod +x "$repo/scripts/worktree.sh"
# shellcheck disable=SC2016 # expands when the stub runs
printf 'echo stub-log-line\n[ -z "${STUB_DIE:-}" ] || exit 3\nexec sleep 300\n' > "$repo/scripts/dev-server.sh"
printf '.worktrees/\nserver/.dev.vars\n' > "$repo/.gitignore"
printf 'ADMIN_TOKEN=local\n' > "$repo/server/.dev.vars"
git -C "$repo" add -A
git -C "$repo" commit -q -m init
wt_sh="$repo/scripts/worktree.sh"
check "the scratch harness installs nothing" grep -qx "WH_INSTALL_CMD=''" "$wt_sh"
check "a new worktree generates the Android files its Gradle tests need" \
  grep -q "^WH_INSTALL_CMD=.*pnpm --filter app build.*cap sync android" "$src/worktree.sh"

# create
out="$(cd "$repo" && "$wt_sh" create feat/ui 2>/dev/null)"
check "create prints only the worktree path, in the repo's .worktrees/" [ "$out" = "$wts/feat-ui" ]
check "the project ignores .worktrees/" git -C "$src/.." check-ignore -q .worktrees/feat-ui
check "a new worktree leaves the main checkout clean" [ -z "$(git -C "$repo" status --porcelain)" ]
check "create copies server/.dev.vars" grep -qx 'ADMIN_TOKEN=local' "$wts/feat-ui/server/.dev.vars"
check "create refuses a branch too long for a host label" \
  bash -c "cd '$repo' && ! '$wt_sh' create $(printf 'b%.0s' $(seq 1 50)) 2>/dev/null"

# up: URL per worktree dir, a branch without the harness is refused
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

# dev-server.sh (pnpm and portless stubbed; the wrangler stub serves /api/health from
# its own cwd, the way workerd does)
ds="$scratch/ds"
dstubs="$scratch/ds-stubs"
mkdir -p "$ds/scripts/lib" "$ds/server" "$ds/app" "$dstubs"
cp "$src/dev-server.sh" "$ds/scripts/"
cp "$src/lib/worktree-common.sh" "$src/lib/ports.sh" "$ds/scripts/lib/"
cat > "$dstubs/pnpm" <<'EOF'
#!/usr/bin/env bash
case "$*" in *"wrangler dev"*) ;; *) exit 0 ;; esac
[ -z "${STUB_WRANGLER_DIE:-}" ] || exit 1
while [ $# -gt 0 ]; do [ "$1" = --port ] && port="$2"; shift; done
if [ -n "${STUB_WRANGLER_FOREIGN:-}" ]; then
  # Another checkout's server took the port first; this wrangler never binds it.
  (cd "$STUB_WRANGLER_FOREIGN" && exec node -e "require('http').createServer((q, r) => r.end('ok')).listen($port, '127.0.0.1')") &
  exec sleep 300
fi
if [ -n "${STUB_WRANGLER_EXIT_AFTER_HEALTH:-}" ]; then
  # Exits right after answering, so it is gone before Vite has even started.
  exec node -e "require('http').createServer((q, r) => r.end('ok', () => process.exit(0))).listen($port, '127.0.0.1')"
fi
exec node -e "require('http').createServer((q, r) => r.end('ok')).listen($port, '127.0.0.1')"
EOF
printf '#!/bin/sh\necho "$1" > "%s/portless-name"\n[ -z "$STUB_VITE_STAY" ] || exec sleep 300\n' "$scratch" > "$dstubs/portless"
chmod +x "$dstubs/pnpm" "$dstubs/portless"
run_ds() { set +e; env PATH="$dstubs:$PATH" WH_SLUG=feat-ui "$@" timeout 30 bash "$ds/scripts/dev-server.sh" >"$scratch/ds.log" 2>&1; DS_STATUS=$?; set -e; }
run_ds
check "dev-server.sh registers lessons-radio-<worktree-dir> with portless" \
  grep -qx 'lessons-radio-feat-ui' "$scratch/portless-name"
check "dev-server.sh stops its Worker when Vite exits (status $DS_STATUS)" \
  all '[ "$DS_STATUS" -ne 124 ]' '[ -z "$(procs_in "$ds")" ]'
rm -f "$scratch/portless-name"
run_ds STUB_WRANGLER_DIE=1
check "dev-server.sh exits without starting Vite when its wrangler dies" \
  all '[ "$DS_STATUS" -ne 0 ]' '[ "$DS_STATUS" -ne 124 ]' '[ ! -e "$scratch/portless-name" ]'
rm -f "$scratch/portless-name"
run_ds STUB_WRANGLER_FOREIGN="$scratch" WH_API_TIMEOUT=2
check "dev-server.sh refuses to start Vite when another checkout answers on its port" \
  all '[ "$DS_STATUS" -ne 0 ]' '[ "$DS_STATUS" -ne 124 ]' '[ ! -e "$scratch/portless-name" ]'
run_ds STUB_WRANGLER_EXIT_AFTER_HEALTH=1 STUB_VITE_STAY=1
check "dev-server.sh stops Vite when its Worker exits, even before the wait (status $DS_STATUS)" \
  all '[ "$DS_STATUS" -ne 0 ]' '[ "$DS_STATUS" -ne 124 ]' 'grep -qx lessons-radio-feat-ui "$scratch/portless-name"' '[ -z "$(procs_in "$ds")" ]'

# list: a process whose command line holds a newline does not break the output
(cd "$wts/feat-ui" && exec bash -c $'sleep 300 # line one\n# line two') &
bg_pids+=("$!")
sleep 0.3
list_out="$(cd "$repo" && "$wt_sh" list 2>&1)"
check "list ignores newlines in command lines" bash -c "! grep -q 'line two\|processes left' <<<\"\$1\"" _ "$list_out"

# start: health checks go through a curl stub, so no test touches the network
stubs="$scratch/stubs"
mkdir -p "$stubs"
printf '#!/bin/sh\n[ -z "$STUB_CURL_SLEEP" ] || sleep "$STUB_CURL_SLEEP"\n[ -e "%s/curl-ok" ]\n' "$scratch" > "$stubs/curl"
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
check "start's timeout names the failure and shows the log" all 'has "did not answer within 1s"' 'has stub-log-line' 'has "worktree.sh down feat/cap"'
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
s=$SECONDS
run_start feat/slow STUB_CURL_SLEEP=2 WH_START_TIMEOUT=3
check "start's limit counts time, not attempts ($((SECONDS - s))s)" [ $((SECONDS - s)) -le 9 ]
(cd "$repo" && "$wt_sh" down feat/cap >/dev/null 2>&1) || true
check "down stops the servers and keeps the worktree" all '[ -z "$(procs_in "$wts/feat-cap")" ]' '[ -d "$wts/feat-cap" ]'
for b in feat/cap feat/other feat/die feat/slow; do (cd "$repo" && "$wt_sh" remove "$b" --force >/dev/null 2>&1) || echo "remove $b failed"; done

# an empty slug (no a-z or digit) never reaches the whole worktree dir
mkdir -p "$wts/.logs"
check "remove refuses a name with an empty slug and stops nothing" \
  all "! (cd '$repo' && '$wt_sh' remove 'دورة' --force 2>$scratch/slug.err)" "grep -q 'empty folder name' $scratch/slug.err" '[ -n "$(procs_in "$wts/feat-ui")" ]'
check "create refuses a name with an empty slug" \
  all "! (cd '$repo' && '$wt_sh' create '@' 2>$scratch/slug.err)" "grep -q 'empty folder name' $scratch/slug.err" "! git -C '$repo' worktree list --porcelain | grep -qx 'worktree $wts'"
check "down refuses a name with an empty slug" all "! (cd '$repo' && '$wt_sh' down _ 2>$scratch/slug.err)" "grep -q 'empty folder name' $scratch/slug.err"
# shellcheck source=/dev/null
. "$repo/scripts/lib/worktree-common.sh"
check "the lib refuses to stop processes across the whole worktree dir" \
  all "! WH_WT_ROOT='$wts' wh_stop_procs_in '$wts/' 2>/dev/null" '[ -n "$(procs_in "$wts/feat-ui")" ]'
check "the lib refuses to list the whole worktree dir unless asked" \
  all "! WH_WT_ROOT='$wts' wh_procs_under '$wts' 2>/dev/null" "[ -n \"\$(WH_WT_ROOT='$wts' wh_procs_under '$wts' --whole-root)\" ]"

# remove: stops every process in the worktree, deletes its log, keeps nothing
echo change > "$wts/feat-ui/change.txt"
git -C "$wts/feat-ui" add change.txt
git -C "$wts/feat-ui" commit -q -m change
mkdir -p "$wts/.logs" && : > "$wts/.logs/feat-ui.log"
check "remove refuses an unmerged branch" bash -c "cd '$repo' && ! '$wt_sh' remove feat/ui 2>/dev/null"
(cd "$repo/server" && exec sleep 300) &
main_pid=$!; bg_pids+=("$main_pid")
(cd "$repo" && "$wt_sh" remove feat-ui --force 2>/dev/null)
check "remove leaves processes in the main checkout running" kill -0 "$main_pid"
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
(cd "$src" && exec node -e "require('net').createServer().listen($port, '127.0.0.1')") &
bg_pids+=("$!")
for _ in $(seq 1 50); do wh_port_busy "$port" && break; sleep 0.1; done
check "wh_free_port skips a busy port" [ "$(wh_free_port "$port")" -gt "$port" ]
check "wh_port_owned_by sees a listener working in the dir" wh_port_owned_by "$port" "$src"
check "wh_port_owned_by ignores a listener working elsewhere" bash -c "set -o pipefail; . '$src/lib/worktree-common.sh'; . '$src/lib/ports.sh'; wh_port_owned_by '$port' '$scratch'; [ \$? -eq 1 ]"
mkdir -p "$scratch/main/.worktrees/x" "$scratch/main/server"
for d in .worktrees/x server; do
  p="$(wh_free_port $(( 20000 + RANDOM % 20000 )))"
  (cd "$scratch/main/$d" && exec node -e "require('net').createServer().listen($p, '127.0.0.1')") &
  bg_pids+=("$!")
  for _ in $(seq 1 50); do wh_port_busy "$p" && break; sleep 0.1; done
  if [ "$d" = server ]; then main_port="$p"; else nested_port="$p"; fi
done
check "wh_port_owned_by does not count a worktree's server as the main checkout's" \
  bash -c "set -o pipefail; . '$src/lib/worktree-common.sh'; . '$src/lib/ports.sh'; wh_port_owned_by '$nested_port' '$scratch/main'; [ \$? -eq 1 ]"
check "wh_port_owned_by still counts the main checkout's own subdirs" wh_port_owned_by "$main_port" "$scratch/main"
s=$SECONDS
check "wh_wait_own_port gives up when the server exits" bash -c ". '$src/lib/ports.sh'; ! wh_wait_own_port '$port' '$scratch' 999999 30"
check "wh_wait_own_port gives up at once, not at the timeout" [ $((SECONDS - s)) -le 2 ]
check "wh_wait_any returns when a child was reaped before the call" \
  timeout 10 "$BASH" -c ". '$src/lib/worktree-common.sh'; true & a=\$!; sleep 300 & b=\$!; sleep 1; wh_wait_any \$a \$b; s=\$?; kill \$b; exit \$s"
mkdir -p "$scratch/quiet"
check "wh_procs_under skips a process that exited during the scan" \
  bash -c ". '$src/lib/worktree-common.sh'; true & gone=\$!; wait \$gone; _wh_pid_cwds() { echo \"\$gone $scratch/quiet\"; }; [ -z \"\$(wh_procs_under '$scratch/quiet')\" ]"
check "wh_wait_any treats a live pid that is not its child as gone (pid reuse)" \
  timeout 10 "$BASH" -c ". '$src/lib/worktree-common.sh'; sleep 300 & b=\$!; o=\$(sleep 300 >/dev/null 2>&1 & echo \$!); kill -0 \$o || exit 9; wh_wait_any \$b \$o; s=\$?; kill \$b \$o; exit \$s"
# Without ss (macOS) lsof answers; without either the check is skipped, not failed.
mkdir -p "$scratch/no-ss" "$scratch/no-tools"
for t in lsof sort readlink; do ln -s "$(command -v "$t")" "$scratch/no-ss/$t"; done
libs="set -o pipefail; . '$src/lib/worktree-common.sh'; . '$src/lib/ports.sh'"
check "wh_port_owned_by falls back to lsof without ss" env PATH="$scratch/no-ss" "$BASH" -c "$libs; wh_port_owned_by '$port' '$src'"
check "the lsof fallback still ignores a listener working elsewhere" \
  env PATH="$scratch/no-ss" "$BASH" -c "$libs; wh_port_owned_by '$port' '$scratch'; [ \$? -eq 1 ]"
mkdir -p "$scratch/bad-ss"
printf '#!/bin/sh\nexit 255\n' > "$scratch/bad-ss/ss"
chmod +x "$scratch/bad-ss/ss"
for t in grep cut sort readlink; do ln -s "$(command -v "$t")" "$scratch/bad-ss/$t"; done
check "a failing ss reads as no listeners, not as a missing tool" \
  env PATH="$scratch/bad-ss" "$BASH" -c "$libs; wh_port_owned_by '$port' '$src'; [ \$? -eq 1 ]"
check "wh_port_owned_by says it cannot tell without ss or lsof" \
  env PATH="$scratch/no-tools" "$BASH" -c "$libs; wh_port_owned_by '$port' '$src'; [ \$? -eq 2 ]"
check "wh_wait_own_port skips the check with a note without ss or lsof" \
  env PATH="$scratch/no-tools" "$BASH" -c "$libs; [[ \$(wh_wait_own_port '$port' '$scratch' \$\$ 5 2>&1) == *'neither ss nor lsof'* ]]"

if [ "$failures" -ne 0 ]; then echo "worktree harness: $failures failed"; exit 1; fi
echo "worktree harness: all tests passed"
