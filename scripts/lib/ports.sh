# shellcheck shell=bash
# Port helpers for scripts/dev-server.sh.

wh_port_busy() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

# wh_free_port <start> -> first port from <start> that nothing listens on
wh_free_port() {
  local p="$1"
  while wh_port_busy "$p"; do p=$((p + 1)); done
  printf '%s' "$p"
}


# _wh_listen_pids <port> -> pids listening on TCP <port>, from ss (Linux) or lsof
# (macOS); returns 2 only when neither tool is installed. A tool that fails reads as
# "no listeners", so the ownership check stays closed instead of being skipped.
_wh_listen_pids() {
  if command -v ss >/dev/null 2>&1; then
    # The `|| true`s keep a failing tool or "nothing listens" from failing the pipeline
    # under pipefail.
    { ss -ltnpH "sport = :$1" 2>/dev/null || true; } | { grep -o 'pid=[0-9]*' || true; } | cut -d= -f2 | sort -u
  elif command -v lsof >/dev/null 2>&1; then
    { lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null || true; } | sort -u
  else
    return 2
  fi
}

# wh_port_owned_by <port> <dir> -> 0 when a process working in <dir> (or below)
# listens on 127.0.0.1:<port>, 1 when none does (another worktree's server on that
# port does not count), 2 when this host has no tool to tell.
# Needs worktree-common.sh for _wh_cwd.
wh_port_owned_by() {
  local port="$1" dir pids pid cwd
  dir="$(cd "$2" && pwd -P)" || return 1
  pids="$(_wh_listen_pids "$port")" || return 2
  for pid in $pids; do
    cwd="$(_wh_cwd "$pid")"
    # Worktrees live inside the main checkout, but their servers are not its own.
    case "$cwd" in "$dir"/.worktrees | "$dir"/.worktrees/*) continue ;; "$dir" | "$dir"/*) return 0 ;; esac
  done
  return 1
}

# wh_wait_own_port <port> <dir> <pid> <seconds> -> 0 once a process in <dir> listens on
# <port>; 1 when <pid> (the server being waited for) exits or time runs out. Without
# ss or lsof the ownership can't be checked: it says so and returns 0.
wh_wait_own_port() {
  local port="$1" dir="$2" pid="$3" deadline=$((SECONDS + $4)) owned
  while [ "$SECONDS" -lt "$deadline" ]; do
    kill -0 "$pid" 2>/dev/null || return 1
    owned=0; wh_port_owned_by "$port" "$dir" || owned=$?
    case "$owned" in
      0) return 0 ;;
      2) echo "note: neither ss nor lsof is installed; not checking who holds port $port" >&2; return 0 ;;
    esac
    sleep 0.5
  done
  return 1
}
