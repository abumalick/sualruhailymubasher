#!/usr/bin/env bash
# Tests for scripts/release.sh against a scratch repo. Real deploys never run: systemd-run is replaced by
# an inline runner and every step by a stub (RELEASE_STEPS_FILE) that records its name.
set -euo pipefail

src="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$src/../.tmp"
scratch="$(cd "$(mktemp -d "$src/../.tmp/release-test.XXXXXX")" && pwd -P)"
trap 'rm -rf "$scratch"' EXIT

failures=0
pass() { printf 'ok   %s\n' "$1"; }
fail() { printf 'FAIL %s\n' "$1"; failures=$((failures + 1)); }
check() { local name="$1"; shift; if "$@"; then pass "$name"; else fail "$name"; fi; }

repo="$scratch/proj"
git init -q -b main "$repo"
git -C "$repo" config user.email t@t.t
git -C "$repo" config user.name t
mkdir -p "$repo/scripts" "$repo/app/android/app" "$repo/app/ios/App/App.xcodeproj" "$repo/app/src" "$repo/agent"
cp "$src/release.sh" "$src/release.mjs" "$src/release-lib.mjs" "$src/github-apk.mjs" "$repo/scripts/"
cp "$src/../app/android/app/build.gradle" "$repo/app/android/app/"
cp "$src/../app/ios/App/App.xcodeproj/project.pbxproj" "$repo/app/ios/App/App.xcodeproj/"
printf '.worktrees/\n.tmp/\n' > "$repo/.gitignore"
echo a > "$repo/app/src/a.ts"
echo a > "$repo/agent/a.py"
git -C "$repo" add -A
git -C "$repo" commit -q -m init

record="$scratch/record"
# Runs the queued command inline, the way systemd-run would in the background
cat > "$scratch/systemd-run" <<'EOF'
#!/usr/bin/env bash
echo "$*" >> "$RECORD.units"
while [ "$1" != -- ]; do shift; done
shift
exec "$@"
EOF
chmod +x "$scratch/systemd-run"
cat > "$scratch/steps.sh" <<'EOF'
prepare_build() { :; }
stub() { echo "start $1 $(date +%s%N)" >> "$RECORD"; sleep "${STUB_SLEEP:-0}"; echo "end $1 $(date +%s%N)" >> "$RECORD"; }
step_server() { stub server; [ -z "${FAIL_SERVER:-}" ]; }
step_web() { stub web; }
step_github_apk() { stub github-apk; return "$SKIPPED"; }
step_play_internal() { stub play-internal; }
step_testflight() { stub testflight; }
EOF
cat > "$scratch/notify" <<'EOF'
#!/usr/bin/env bash
cat >> "$RECORD.notify"
EOF
chmod +x "$scratch/notify"
export RECORD="$record" RELEASE_SYSTEMD_RUN="$scratch/systemd-run" RELEASE_STEPS_FILE="$scratch/steps.sh" \
  RELEASE_NOTIFY_CMD="$scratch/notify" ALBADR_SECRETS="$scratch/no-secrets"
rel() { (cd "$repo" && bash scripts/release.sh "$@"); }
reset() { rm -f "$record" "$record.units" "$record.notify"; }
commit_file() { echo "$2" > "$repo/$1"; git -C "$repo" add -A; git -C "$repo" commit -q -m "$1"; git -C "$repo" rev-parse HEAD; }
steps_run() { sed -n 's/^start \([^ ]*\) .*/\1/p' "$record" 2>/dev/null | tr '\n' ' '; }

# after-merge: what a merge ships
reset
pre="$(git -C "$repo" rev-parse HEAD)"
post="$(commit_file agent/a.py b)"
out="$(rel after-merge "$pre" "$post" 2>&1)"
check "an agent-only merge queues nothing" [ ! -e "$record.units" ]
check "and says so" grep -q "nothing to deploy" <<<"$out"

reset
pre="$post"
post="$(commit_file app/src/a.ts b)"
rel after-merge "$pre" "$post" >/dev/null 2>&1
check "an app merge deploys the server, then the web" [ "$(steps_run)" = "server web " ]
check "the job runs as a transient user unit with a memory cap" grep -q -- '--user .*MemoryMax=8G' "$record.units"
check "the build worktree is removed afterwards" [ ! -e "$repo/.worktrees/.release/build" ]
check "the owner is told each step's result" grep -q "server: ok" "$record.notify"

reset
FAIL_SERVER=1 rel run server web >/dev/null 2>&1 || true
check "a failed step stops the steps after it" [ "$(steps_run)" = "server " ]
check "the message names the failure and what did not run" \
  bash -c "grep -q 'server: FAILED' '$record.notify' && grep -q 'web: not run' '$record.notify'"

reset
rel run github-apk play-internal >/dev/null 2>&1
check "a step that already shipped is reported as skipped and the next one still runs" \
  bash -c "grep -q 'github-apk: skipped' '$record.notify' && grep -q 'play-internal: ok' '$record.notify'"

reset
check "a version rise mixed with other changes is refused before anything is queued" bash -c "
  cd '$repo' && pre=\$(git rev-parse HEAD) && node scripts/release.mjs bump patch >/dev/null && echo c > app/src/a.ts &&
  git add -A && git commit -q -m mixed && ! bash scripts/release.sh after-merge \$pre HEAD 2>/dev/null && [ ! -e '$record.units' ]"
git -C "$repo" reset -q --hard HEAD~1

# Two jobs started together never overlap
reset
STUB_SLEEP=1 rel run server >/dev/null 2>&1 &
first=$!
sleep 0.2
STUB_SLEEP=1 rel run web >/dev/null 2>&1
wait "$first"
end_first="$(sed -n 's/^end server //p' "$record")"
start_second="$(sed -n 's/^start web //p' "$record")"
check "a second job waits for the first to finish" [ "$start_second" -ge "$end_first" ]

check "without a notification command the job still succeeds" \
  bash -c "cd '$repo' && RELEASE_NOTIFY_CMD= bash scripts/release.sh run web >/dev/null 2>&1"

if [ "$failures" -ne 0 ]; then echo "release: $failures failed"; exit 1; fi
echo "release: all tests passed"
