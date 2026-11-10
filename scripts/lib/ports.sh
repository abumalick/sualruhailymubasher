# shellcheck shell=bash
# Port helpers for scripts/dev-server.sh.

wh_port_busy() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

# wh_free_port <start> -> first port from <start> that nothing listens on
wh_free_port() {
  local p="$1"
  while wh_port_busy "$p"; do p=$((p + 1)); done
  printf '%s' "$p"
}
