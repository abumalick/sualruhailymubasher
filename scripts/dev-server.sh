#!/usr/bin/env bash
# Starts this checkout's Worker (API + its own local D1, migrated and seeded) and the
# app's Vite dev server, which proxies /api to that Worker. In a worktree (WH_SLUG set
# by `worktree.sh up`) the Worker gets a per-worktree port and Vite is served through
# portless at https://lessons-radio-<worktree-dir>.dev.sageplex.com; in the main checkout
# both use their default ports. Every D1 command here is --local: wrangler.jsonc
# names the production database.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=/dev/null
. "$root/scripts/lib/worktree-common.sh"
# shellcheck source=/dev/null
. "$root/scripts/lib/ports.sh"

if [ -n "${WH_SLUG:-}" ]; then
  api_port="$(wh_free_port "$(wh_hash_to_port "$WH_SLUG" 18400 300)")"
  inspector_port="$(wh_free_port $((api_port + 1000)))"
else
  api_port=8787
  inspector_port=9229
fi
export API_ORIGIN="http://127.0.0.1:$api_port"

cd "$root/server"
pnpm exec wrangler d1 migrations apply albadr-lessons --local
pnpm exec wrangler d1 execute albadr-lessons --local --file seed/dev.sql >/dev/null
echo "api: $API_ORIGIN (inspector $inspector_port)"
pnpm exec wrangler dev --ip 127.0.0.1 --port "$api_port" --inspector-port "$inspector_port" &
api_pid=$!
trap 'wh_kill_tree "$api_pid"' EXIT

cd "$root/app"
# An empty base makes the app call relative /api/..., which Vite proxies to API_ORIGIN.
export VITE_API_BASE=""
if [ -n "${WH_SLUG:-}" ]; then
  export __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=".dev.sageplex.com" WH_PORTLESS_STATE_DIR="$HOME/.portless-dev"
  # The explicit name (not `run --name`, which appends only the branch's last segment)
  # keeps feat/ui and fix/ui on different hosts.
  # shellcheck disable=SC2016 # $PORT is set by portless for the inner shell
  wh_portless "lessons-radio-$WH_SLUG" sh -c 'pnpm exec vite --port "$PORT" --strictPort --host 127.0.0.1'
else
  pnpm exec vite --strictPort --host 127.0.0.1
fi
