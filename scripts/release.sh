#!/usr/bin/env bash
# Deploys and releases, run on this machine (the Mac for iOS builds). See changes/README.md for entries.
#   after-merge <pre> <post>   called by worktree.sh finish: queues what the merge ships, returns at once
#   run <step>...              queues chosen steps again (a retry): server web github-apk play-internal testflight
# Jobs run one at a time as transient systemd user units, in a worktree detached at main's HEAD.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
main_root="$(git -C "$here" rev-parse --path-format=absolute --git-common-dir)"
main_root="$(cd "$main_root/.." && pwd)"
state="$main_root/.worktrees/.release"
build="$state/build"
logs="$main_root/.worktrees/.logs"
SECRETS="${ALBADR_SECRETS:-$HOME/.config/albadrmubasher}"
SKIPPED=10

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

notify() {
  local msg
  msg="$(cat)"
  if [ -z "${RELEASE_NOTIFY_CMD:-}" ]; then
    say "warning: RELEASE_NOTIFY_CMD is not set ($SECRETS/release.env); no message sent"
    return 0
  fi
  printf '%s\n' "$msg" | bash -c "$RELEASE_NOTIFY_CMD" || say "warning: the notification failed"
}

cmd_job() {
  local s rc failed=0 sha results=()
  mkdir -p "$state"
  exec 9>"$state/job.lock"
  flock 9
  git -C "$main_root" worktree remove --force "$build" 2>/dev/null || rm -rf "$build"
  git -C "$main_root" worktree prune
  git -C "$main_root" worktree add --quiet --detach "$build" main
  # shellcheck disable=SC2064
  trap "git -C '$main_root' worktree remove --force '$build' 2>/dev/null || true" EXIT
  cd "$build"
  sha="$(git rev-parse --short HEAD)"
  say "== release job at $sha: $*"
  if ! (prepare_build); then failed=1; results+=("prepare: FAILED"); fi
  for s in "$@"; do
    if [ "$failed" = 1 ]; then results+=("$s: not run"); continue; fi
    say "== $s"
    set +e
    (set -e; "step_${s//-/_}")
    rc=$?
    set -e
    case "$rc" in
      0) results+=("$s: ok") ;;
      "$SKIPPED") results+=("$s: skipped") ;;
      *) results+=("$s: FAILED"); failed=1 ;;
    esac
  done
  printf 'Albadr release at %s (%s)\n%s\n' "$sha" "$(git log -1 --format=%s)" "$(printf '%s\n' "${results[@]}")" | tee /dev/stderr | notify
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
  job) cmd_job "$@" ;;
  *) die "usage: release.sh after-merge <pre> <post> | run <step>..." ;;
esac
