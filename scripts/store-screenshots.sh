#!/usr/bin/env bash
# Store screenshots from the web build, with real lessons from the production API.
# Usage: scripts/store-screenshots.sh [ios] [android]   (default: ios android)
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
targets=("$@")
[ ${#targets[@]} -gt 0 ] || targets=(ios android)

port="$(node -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{const p=s.address().port;s.close(()=>console.log(p))})')"
base="http://127.0.0.1:${port}"

# VITE_API_BASE unset: the build talks to the production API
env -u VITE_API_BASE pnpm --filter app build >/dev/null
pnpm exec playwright install chromium >/dev/null

(cd app && exec pnpm exec vite preview --host 127.0.0.1 --port "$port" --strictPort) >/dev/null 2>&1 &
preview=$!
trap 'kill "$preview" 2>/dev/null || true' EXIT

for _ in $(seq 1 30); do
  curl -fsS -o /dev/null "$base" 2>/dev/null && break
  sleep 1
done
curl -fsS -o /dev/null "$base" || { echo "preview server did not start on $base" >&2; exit 1; }

node scripts/store-screenshots.mjs "$base" "${targets[@]}"
