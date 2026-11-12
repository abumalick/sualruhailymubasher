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
mkdir -p "$repo/scripts/lib" "$repo/app/android/app" "$repo/app/ios/App/App.xcodeproj" "$repo/app/src" "$repo/agent"
cp "$src/release.sh" "$src/release.mjs" "$src/release-lib.mjs" "$src/github-apk.mjs" "$repo/scripts/"
cp "$src/lib/worktree-common.sh" "$src/lib/ports.sh" "$repo/scripts/lib/"
sed "s|^WH_INSTALL_CMD=.*|WH_INSTALL_CMD=''|" "$src/worktree.sh" > "$repo/scripts/worktree.sh"
cp "$src/../app/android/app/build.gradle" "$repo/app/android/app/"
for l in ar en-US; do mkdir -p "$repo/fastlane/metadata/android/$l/changelogs"; touch "$repo/fastlane/metadata/android/$l/changelogs/.keep"; done
cp "$src/../app/ios/App/App.xcodeproj/project.pbxproj" "$repo/app/ios/App/App.xcodeproj/"
printf '.worktrees/\n.tmp/\n' > "$repo/.gitignore"
echo a > "$repo/app/src/a.ts"
echo a > "$repo/agent/a.py"
git -C "$repo" add -A
git -C "$repo" commit -q -m init
for t in release/play/1.0.9 release/play-internal/1.0.9 release/github/1.0.9 release/appstore/1.0 release/testflight/1.0; do
  git -C "$repo" tag "$t"
done

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

# bump: a version-only commit lands through finish and ships every channel
reset
version_now() { git -C "$repo" show main:app/android/app/build.gradle | sed -n 's/.*versionName "\(.*\)"/\1/p'; }
was="$(version_now)"
rel bump >/dev/null 2>&1
check "bump lands a release commit on main" [ "$(git -C "$repo" log -1 --format=%s main^2)" = "release: 1.0.10 (10)" ]
check "the release commit changes only the version files" \
  [ "$(git -C "$repo" diff --name-only main^1 main | sort | tr '\n' ' ')" = "app/android/app/build.gradle app/ios/App/App.xcodeproj/project.pbxproj " ]
check "the bump ships every channel, server and web first" \
  [ "$(steps_run)" = "server web github-apk play-internal testflight " ]
check "the main checkout stays clean" [ -z "$(git -C "$repo" status --porcelain)" ]
check "the release branch is gone after the merge" bash -c "! git -C '$repo' rev-parse -q --verify refs/heads/release-1-0-10"
check "the version was $was before" [ "$was" = 1.0.9 ]

reset
rel bump >/dev/null 2>&1 &
first=$!
rel bump >/dev/null 2>&1
wait "$first"
check "two bumps at once give two versions, never the same one twice" \
  [ "$(git -C "$repo" log --format=%s main | grep -c '^release: 1\.0\.1[12] (1[12])$')" = 2 ]

# The real level-2 steps, with the outside world stubbed: fastlane, the Mac and Telegram
bin="$scratch/bin"
mkdir -p "$bin"
for tool in fastlane ssh rsync wake-mac; do
  # shellcheck disable=SC2016 # the stub expands $* and $RECORD when it runs
  printf '#!/usr/bin/env bash\necho "%s $*" >> "$RECORD.calls"\n' "$tool" > "$bin/$tool"
  chmod +x "$bin/$tool"
done
printf 'prepare_build() { :; }\nstep_server() { :; }\nstep_web() { :; }\n' > "$scratch/steps-real.sh"
mkdir -p "$repo/changes"
echo '{ "platforms": ["android"], "ar": "إصلاح أندرويد", "en": "Android fix" }' > "$repo/changes/a.json"
echo '{ "platforms": ["ios"], "ar": "إصلاح آيفون", "en": "iOS fix" }' > "$repo/changes/b.json"
git -C "$repo" add -A
git -C "$repo" commit -q -m entries
real() { (cd "$repo" && PATH="$bin:$PATH" RELEASE_STEPS_FILE="$scratch/steps-real.sh" bash scripts/release.sh "$@"); }
v="$(version_now)"
reset
rm -f "$record.calls"
real run github-apk play-internal testflight >/dev/null 2>&1
check "each channel is tagged at the commit it shipped" bash -c "
  for c in github play-internal testflight; do [ \"\$(git -C '$repo' rev-parse release/\$c/$v^{commit})\" = \"\$(git -C '$repo' rev-parse main)\" ] || exit 1; done"
check "the GitHub APK and the internal bundle are built by separate fastlane runs, APK first" \
  [ "$(grep '^fastlane' "$record.calls" | head -n 2 | tr '\n' ' ')" = "fastlane android github_apk fastlane android internal " ]
check "TestFlight is built on the Mac, in the pipeline's own folder, with the testers' notes" \
  grep -q "^ssh .*albadrmubasher-release.*fastlane ios beta changelog_file:.tmp/release-notes/ios/whats-new.txt" "$record.calls"
check "the copy to the Mac never touches the hand-used folder" \
  bash -c "grep '^rsync' '$record.calls' | grep -q 'albadrmubasher-release/' && ! grep '^rsync' '$record.calls' | grep -q 'albadrmubasher/ '"
check "the Mac lock is released after the build" grep -q "^ssh .*rmdir" "$record.calls"

reset
rm -f "$record.calls"
real run github-apk play-internal testflight >/dev/null 2>&1
check "a channel that already shipped this version is skipped, not rebuilt" \
  bash -c "[ ! -e '$record.calls' ] || ! grep -q '^fastlane' '$record.calls'"
check "and reported as skipped" grep -q "testflight: skipped" "$record.notify"

# The notes each step hands over (kept by the job in the build worktree is gone; regenerate the same way)
out="$scratch/notes"
(cd "$repo" && git tag -d "release/github/$v" "release/play-internal/$v" "release/testflight/$v" >/dev/null &&
  node scripts/release.mjs notes play-internal HEAD "$out/play" >/dev/null && node scripts/release.mjs notes testflight HEAD "$out/ios" >/dev/null)
check "Play notes list the Android entry only" [ "$(cat "$out/play/en-US.txt")" = "• Android fix" ]
check "TestFlight notes list the iOS entry only" [ "$(cat "$out/ios/en-US.txt")" = "• iOS fix" ]

# Store releases
v="$(version_now)"
reset
rm -f "$record.calls"
out="$(real store android 2>&1)" || true
check "a store release of a version not yet on internal testing is refused" grep -q 'store-android: FAILED' "$record.notify"
check "and the message names the missing tag" grep -qF "release/play-internal/$v" <<<"$out"
check "and nothing is sent to Play" bash -c "[ ! -e '$record.calls' ] || ! grep -q '^fastlane' '$record.calls'"

real run github-apk play-internal testflight >/dev/null 2>&1
reset
rm -f "$record.calls"
real store both >/dev/null 2>&1
check "store both releases Android and iOS, each reported" \
  bash -c "grep -q 'store-android: ok' '$record.notify' && grep -q 'store-ios: ok' '$record.notify'"
check "Android uploads the listing, then promotes to production" \
  [ "$(grep '^fastlane android' "$record.calls" | tr '\n' ' ')" = "fastlane android upload_metadata fastlane android production " ]
check "iOS uploads the listing, then submits with the notes, on the Mac" \
  grep -q "^ssh .*albadrmubasher-release.*fastlane ios metadata && fastlane ios submit notes_dir:.tmp/release-notes/ios" "$record.calls"
check "both stores are tagged" bash -c "git -C '$repo' rev-parse -q --verify release/play/$v >/dev/null && git -C '$repo' rev-parse -q --verify release/appstore/$v >/dev/null"
check "the next store notes start after this release" bash -c "
  cd '$repo' && node scripts/release.mjs notes play HEAD '$scratch/next' >/dev/null && [ \"\$(cat '$scratch/next/en-US.txt')\" = 'Improvements and fixes.' ]"

reset
STUB_SLEEP=1 RELEASE_STEPS_FILE="$scratch/steps.sh" rel run 'server+web' >/dev/null 2>&1
check "steps joined with + run at the same time" \
  [ "$(sed -n 's/^start web //p' "$record")" -lt "$(sed -n 's/^end server //p' "$record")" ]

if [ "$failures" -ne 0 ]; then echo "release: $failures failed"; exit 1; fi
echo "release: all tests passed"
