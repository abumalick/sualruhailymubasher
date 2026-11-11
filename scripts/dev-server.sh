#!/usr/bin/env bash
# Starts this checkout's Worker (API + its own local D1, migrated and seeded) and the
# app's Vite dev server, which proxies /api to that Worker. In a worktree (WH_SLUG set
# by `worktree.sh up`) the Worker gets a per-worktree port and Vite is served through
# portless at https://albadrmubasher-<worktree-dir>.dev.sageplex.com; in the main checkout
# both use their default ports. Every D1 command here is --local: wrangler.jsonc
# names the production database. When either server exits, the other is stopped too.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=/dev/null
. "$root/scripts/lib/worktree-common.sh"
# shellcheck source=/dev/null
. "$root/scripts/lib/ports.sh"

cd "$root/server"
pnpm exec wrangler d1 migrations apply albadr-lessons --local
pnpm exec wrangler d1 execute albadr-lessons --local --file seed/dev.sql >/dev/null

# Ports are picked right before wrangler binds them, to keep the race with another
# worktree's start short; the ownership check below catches the rest.
if [ -n "${WH_SLUG:-}" ]; then
  api_port="$(wh_free_port "$(wh_hash_to_port "$WH_SLUG" 18400 300)")"
  inspector_port="$(wh_free_port $((api_port + 1000)))"
else
  api_port=8787
  inspector_port=9229
fi
export API_ORIGIN="http://127.0.0.1:$api_port"
echo "api: $API_ORIGIN (inspector $inspector_port)"
echo "agent against this API: API_BASE=$API_ORIGIN ALBADR_AGENT_CACHE=$root/.tmp/agent-cache, ADMIN_TOKEN from server/.dev.vars"
pnpm exec wrangler dev --ip 127.0.0.1 --port "$api_port" --inspector-port "$inspector_port" &
api_pid=$!
vite_pid=""
trap 'wh_kill_tree "$api_pid"; [ -z "$vite_pid" ] || wh_kill_tree "$vite_pid"' EXIT

# Vite must not start until this checkout's own Worker holds the port: with a port
# collision, another worktree's Worker would answer and Vite would proxy to it.
if ! wh_wait_own_port "$api_port" "$root" "$api_pid" "${WH_API_TIMEOUT:-90}"; then
  echo "error: this checkout's wrangler did not take port $api_port (exited, or another process holds it)" >&2
  exit 1
fi
until curl -sf --max-time 2 -o /dev/null "$API_ORIGIN/api/health"; do
  kill -0 "$api_pid" 2>/dev/null || { echo "error: wrangler exited before answering" >&2; exit 1; }
  sleep 0.5
done

cd "$root/app"
# An empty base makes the app call relative /api/..., which Vite proxies to API_ORIGIN.
export VITE_API_BASE=""
if [ -n "${WH_SLUG:-}" ]; then
  export __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=".dev.sageplex.com" WH_PORTLESS_STATE_DIR="$HOME/.portless-dev"
  # The explicit name (not `run --name`, which appends only the branch's last segment)
  # keeps feat/ui and fix/ui on different hosts.
  # shellcheck disable=SC2016 # $PORT is set by portless for the inner shell
  wh_portless "albadrmubasher-$WH_SLUG" sh -c 'pnpm exec vite --port "$PORT" --strictPort --host 127.0.0.1' &
else
  pnpm exec vite --strictPort --host 127.0.0.1 &
fi
vite_pid=$!
wh_wait_any "$api_pid" "$vite_pid"
echo "a server exited; stopping the other" >&2
exit 1
