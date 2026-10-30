import fcntl
from contextlib import contextmanager
from pathlib import Path

DEFAULT_LOCK = Path.home() / ".cache" / "albadr-agent" / "run.lock"


@contextmanager
def run_lock(path: Path = DEFAULT_LOCK):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        try:
            fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            yield False
            return
        try:
            yield True
        finally:
            fcntl.flock(f, fcntl.LOCK_UN)
