# shellcheck shell=bash
# Port helpers for scripts/dev-server.sh.

wh_port_busy() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

# wh_free_port <start> -> first port from <start> that nothing listens on
wh_free_port() {
  local p="$1"
  while wh_port_busy "$p"; do p=$((p + 1)); done
  printf '%s' "$p"
}

# wh_port_owned_by <port> <dir> -> true when a process working in <dir> (or below)
# listens on 127.0.0.1:<port>. Another worktree's server on that port does not count.
wh_port_owned_by() {
  local port="$1" dir pid cwd
  dir="$(cd "$2" && pwd -P)" || return 1
  for pid in $(ss -ltnpH "sport = :$port" 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u); do
    cwd="$(readlink "/proc/$pid/cwd" 2>/dev/null)" || continue
    case "$cwd" in "$dir" | "$dir"/*) return 0 ;; esac
  done
  return 1
}

# wh_wait_own_port <port> <dir> <pid> <seconds> -> 0 once a process in <dir> listens on
# <port>; 1 when <pid> (the server being waited for) exits or time runs out.
wh_wait_own_port() {
  local port="$1" dir="$2" pid="$3" deadline=$((SECONDS + $4))
  while [ "$SECONDS" -lt "$deadline" ]; do
    kill -0 "$pid" 2>/dev/null || return 1
    wh_port_owned_by "$port" "$dir" && return 0
    sleep 0.5
  done
  return 1
}
