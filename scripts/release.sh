#!/usr/bin/env bash
# Deploys and releases, run on this machine (the Mac for iOS builds). See changes/README.md for entries.
#   after-merge <pre> <post>   called by worktree.sh finish: queues what the merge ships, returns at once
#   run <step>...              queues chosen steps again (a retry): server web github-apk play-internal testflight
#   bump [patch|minor|major]   lands a version-only commit on main through worktree.sh finish, which ships it
#   store android|ios|both     sends the version on internal testing / TestFlight to store review (both: in parallel)
# Steps joined with + (store-android+store-ios) run at the same time.
# Jobs run one at a time as transient systemd user units, in a worktree detached at main's HEAD.
# SC2029: the Mac paths are meant to expand here, before ssh sends them
# shellcheck disable=SC2029
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
main_root="$(git -C "$here" rev-parse --path-format=absolute --git-common-dir)"
main_root="$(cd "$main_root/.." && pwd)"
state="$main_root/.worktrees/.release"
build="$state/build"
logs="$main_root/.worktrees/.logs"
SECRETS="${ALBADR_SECRETS:-$HOME/.config/albadrmubasher}"

if [ -z "${RELEASE_NOTIFY_CMD+set}" ] && [ -f "$SECRETS/release.env" ]; then
  # shellcheck source=/dev/null
  . "$SECRETS/release.env"
fi

say() { printf '%s\n' "$*" >&2; }
die() { say "$*"; exit 1; }

queue() {
  local id log
  id="$(date +%Y%m%d-%H%M%S)-$$"
  mkdir -p "$logs"
  log="$logs/release-$id.log"
  # A transient unit outlives the workspace that ran finish; it gets the shell's tools but no terminal
  "${RELEASE_SYSTEMD_RUN:-systemd-run}" --user --collect --quiet --unit "albadr-release-$id" \
    -p MemoryMax=8G -p MemorySwapMax=2G \
    -p "StandardOutput=append:$log" -p "StandardError=append:$log" \
    --working-directory="$main_root" \
    --setenv=PATH="$PATH" --setenv=HOME="$HOME" --setenv=LANG="${LANG:-en_US.UTF-8}" \
    ${ANDROID_HOME:+--setenv=ANDROID_HOME="$ANDROID_HOME"} ${JAVA_HOME:+--setenv=JAVA_HOME="$JAVA_HOME"} \
    ${SSH_AUTH_SOCK:+--setenv=SSH_AUTH_SOCK="$SSH_AUTH_SOCK"} \
    -- bash "$here/release.sh" job "$@"
  say "queued: $* (unit albadr-release-$id, log $log)"
}

cmd_after_merge() {
  local steps
  steps="$(cd "$main_root" && node "$here/release.mjs" plan "$1" "$2")" || die "release: cannot plan this merge"
  if [ -z "$steps" ]; then say "release: nothing to deploy"; return 0; fi
  # shellcheck disable=SC2086
  queue $steps
}

prepare_build() {
  cp "$SECRETS/google-services.com.albadrmubasher.app.json" app/android/app/google-services.json
  pnpm install --frozen-lockfile
}

smoke() { # <url> <fixed text the body must contain>
  local _
  for _ in $(seq 1 10); do
    curl -fsS --max-time 10 "$1" 2>/dev/null | grep -qF "$2" && return 0
    sleep 3
  done
  say "smoke check failed: $1 does not contain $2"
  return 1
}

step_server() {
  grep -q '"account_id": "9ab550becc556ce60d4250bfdc48224c"' server/wrangler.jsonc \
    || { say "server/wrangler.jsonc does not name the personal account"; return 1; }
  (cd server && CI=1 pnpm exec wrangler d1 migrations apply albadr-lessons --remote && pnpm exec wrangler deploy)
  smoke https://api.albadrmubasher.com/api/health '"ok":true'
}

step_web() {
  local asset
  pnpm --filter app build
  (cd web && pnpm exec wrangler deploy)
  asset="$(grep -o '/assets/[^"]*' app/dist/index.html | head -n 1)"
  smoke https://albadrmubasher.com/ "$asset"
}

version() { node scripts/release.mjs version; }
shipped() { git rev-parse -q --verify "refs/tags/release/$1/$(version)" >/dev/null; }
tag_channel() { git tag "release/$1/$(version)" "${2:-HEAD}"; } # <channel> [commit]
# A step that finds its work already done says so here: its exit code stays free for real failures
skipped() { : > "$STEP_SKIPPED"; }

step_github_apk() {
  if shipped github; then skipped; return 0; fi
  node scripts/release.mjs notes github HEAD .tmp/release-notes/github
  fastlane android github_apk
  tag_channel github
}

step_play_internal() {
  local code locale
  if shipped play-internal; then skipped; return 0; fi
  code="$(sed -n 's/.*versionCode \([0-9]*\).*/\1/p' app/android/app/build.gradle)"
  node scripts/release.mjs notes play-internal HEAD .tmp/release-notes/play
  for locale in ar en-US; do
    cp ".tmp/release-notes/play/$locale.txt" "fastlane/metadata/android/$locale/changelogs/$code.txt"
  done
  fastlane android internal
  tag_channel play-internal
}

MAC="${RELEASE_MAC:-mac}"
MAC_DIR="workspace/dawa/albadrmubasher-release"
MAC_LOCK=".albadr-release.lock"

# Runs a command in the pipeline's own copy on the Mac, never the hand-used one, one build at a time
on_mac() {
  local rc waited=0
  WAKE_MAC_HOLD=5400 wake-mac
  until ssh "$MAC" "mkdir ~/$MAC_LOCK" 2>/dev/null; do
    [ "$waited" -lt 3600 ] || { say "the Mac lock ~/$MAC_LOCK is still held after an hour"; return 1; }
    sleep 30; waited=$((waited + 30))
  done
  set +e
  rsync -a --delete --exclude node_modules --exclude .git --exclude /.worktrees --exclude /app/android/ \
    --include /.tmp/ --include '/.tmp/release-notes/***' --exclude '/.tmp/*' \
    ./ "$MAC:$MAC_DIR/" &&
    ssh "$MAC" "zsh -lc 'cd ~/$MAC_DIR && $*'"
  rc=$?
  set -e
  ssh "$MAC" "rmdir ~/$MAC_LOCK" || say "warning: could not release the Mac lock ~/$MAC_LOCK"
  return "$rc"
}

ios_notes() { # <channel> <commit> -> .tmp/release-notes/ios/whats-new.txt (Arabic, then English)
  node scripts/release.mjs notes "$1" "$2" .tmp/release-notes/ios
  { cat .tmp/release-notes/ios/ar-SA.txt; printf '\n\n'; cat .tmp/release-notes/ios/en-US.txt; } > .tmp/release-notes/ios/whats-new.txt
}

step_testflight() {
  if shipped testflight; then skipped; return 0; fi
  ios_notes testflight HEAD
  on_mac "fastlane ios beta changelog_file:.tmp/release-notes/ios/whats-new.txt"
  tag_channel testflight
}

on_test_track() { # <test channel> <store>
  shipped "$1" && return 0
  say "version $(version) is not on $2's test track yet (no release/$1/$(version) tag): run release.sh bump first"
  return 1
}

step_store_android() {
  on_test_track play-internal Play || return 1
  if shipped play; then skipped; return 0; fi
  fastlane android upload_metadata
  fastlane android production
  # The release is the binary built at the bump, not main's HEAD: later merges belong to the next version
  tag_channel play "release/play-internal/$(version)^{commit}"
}

step_store_ios() {
  local built
  on_test_track testflight "the App Store" || return 1
  if shipped appstore; then skipped; return 0; fi
  built="release/testflight/$(version)^{commit}"
  ios_notes appstore "$built"
  on_mac "fastlane ios metadata && fastlane ios submit notes_dir:.tmp/release-notes/ios"
  tag_channel appstore "$built"
}

notify() {
  local msg
  msg="$(cat)"
  if [ -z "${RELEASE_NOTIFY_CMD:-}" ]; then
    say "warning: RELEASE_NOTIFY_CMD is not set ($SECRETS/release.env); no message sent"
    return 0
  fi
  printf '%s\n' "$msg" | bash -c "$RELEASE_NOTIFY_CMD" || say "warning: the notification failed"
}

cmd_bump() {
  local kind="${1:-patch}" tmp printed name branch blob f mode tree commit
  mkdir -p "$state"
  exec 8>"$state/bump.lock"
  flock 8
  tmp="$(mktemp -d "$state/bump.XXXXXX")"
  # shellcheck disable=SC2064
  trap "rm -rf '$tmp'" EXIT
  local files=(app/android/app/build.gradle app/ios/App/App.xcodeproj/project.pbxproj)
  for f in "${files[@]}"; do
    mkdir -p "$tmp/$(dirname "$f")"
    git -C "$main_root" show "main:$f" > "$tmp/$f"
  done
  printed="$(cd "$tmp" && node "$here/release.mjs" bump "$kind")"
  name="${printed%% *}"
  branch="release-${name//./-}"
  # The commit is built without a checkout, so nothing is installed or built for it
  export GIT_INDEX_FILE="$tmp/index"
  git -C "$main_root" read-tree main
  for f in "${files[@]}"; do
    blob="$(git -C "$main_root" hash-object -w "$tmp/$f")"
    mode="$(git -C "$main_root" ls-tree main -- "$f" | cut -d' ' -f1)"
    git -C "$main_root" update-index --cacheinfo "$mode,$blob,$f"
  done
  tree="$(git -C "$main_root" write-tree)"
  unset GIT_INDEX_FILE
  commit="$(git -C "$main_root" commit-tree "$tree" -p main -m "release: $printed")"
  git -C "$main_root" branch "$branch" "$commit" || die "branch $branch already exists: finish or delete it first"
  say "release: $printed on $branch"
  bash "$main_root/scripts/worktree.sh" finish "$branch"
}

cmd_job() {
  local s rc i group summary failed=0 sha results=() parallel=() pids=()
  mkdir -p "$state"
  exec 9>"$state/job.lock"
  flock 9
  git -C "$main_root" worktree remove --force "$build" 2>/dev/null || rm -rf "$build"
  git -C "$main_root" worktree prune
  git -C "$main_root" worktree add --quiet --detach "$build" main
  # A new path starts untrusted, and every mise shim (node, pnpm, tdl) then refuses to run in it
  if command -v mise >/dev/null 2>&1 && [ -f "$build/mise.toml" ]; then mise trust "$build/mise.toml" >&2 || say "warning: mise trust failed"; fi
  # shellcheck disable=SC2064
  trap "git -C '$main_root' worktree remove --force '$build' 2>/dev/null || true" EXIT
  cd "$build"
  sha="$(git rev-parse --short HEAD)"
  say "== release job at $sha: $*"
  set +e
  (set -e; prepare_build)
  rc=$?
  set -e
  if [ "$rc" != 0 ]; then failed=1; results+=("prepare: FAILED"); fi
  for group in "$@"; do
    IFS=+ read -r -a parallel <<<"$group"
    if [ "$failed" = 1 ]; then
      for s in "${parallel[@]}"; do results+=("$s: not run"); done
      continue
    fi
    pids=()
    for s in "${parallel[@]}"; do
      say "== $s"
      rm -f "$state/skipped.$s"
      (set -e; STEP_SKIPPED="$state/skipped.$s"; "step_${s//-/_}") &
      pids+=("$!")
    done
    for i in "${!parallel[@]}"; do
      set +e
      wait "${pids[$i]}"
      rc=$?
      set -e
      if [ "$rc" != 0 ]; then results+=("${parallel[$i]}: FAILED"); failed=1
      elif [ -e "$state/skipped.${parallel[$i]}" ]; then results+=("${parallel[$i]}: skipped")
      else results+=("${parallel[$i]}: ok"); fi
      rm -f "$state/skipped.${parallel[$i]}"
    done
  done
  summary="$(printf 'Albadr release at %s (%s)\n%s' "$sha" "$(git log -1 --format=%s)" "$(printf '%s\n' "${results[@]}")")"
  say "$summary"
  printf '%s\n' "$summary" | notify
  return "$failed"
}

if [ -n "${RELEASE_STEPS_FILE:-}" ]; then
  # shellcheck source=/dev/null
  . "$RELEASE_STEPS_FILE"
fi

cmd="${1:-}"
shift || true
case "$cmd" in
  after-merge) cmd_after_merge "${1:?pre-merge commit required}" "${2:?post-merge commit required}" ;;
  run) [ $# -gt 0 ] || die "usage: release.sh run <step>..."; queue "$@" ;;
  bump) cmd_bump "$@" ;;
  store)
    case "${1:-}" in
      android|ios) queue "store-$1" ;;
      both) queue store-android+store-ios ;;
      *) die "usage: release.sh store android|ios|both" ;;
    esac ;;
  job) cmd_job "$@" ;;
  *) die "usage: release.sh after-merge <pre> <post> | run <step>... | bump [patch|minor|major] | store android|ios|both" ;;
esac
