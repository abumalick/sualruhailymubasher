import json
import subprocess
from collections.abc import Callable
from pathlib import Path

from .captions import Message
from .paths import cache_root

CHAT = "Sulalruhaily"
LOCK_WAIT = "120"
BUSY = 75


class TelegramError(Exception):
    pass


class TelegramBusy(TelegramError):
    pass


class Telegram:
    """tdl, always under the machine-wide tdl lock that other Telegram tools share; one call at a time."""

    def __init__(
        self,
        runner: Callable[..., subprocess.CompletedProcess] = subprocess.run,
        lock: Path = Path.home() / ".tdl" / "cli.lock",
        tmp_dir: Path | None = None,
    ):
        self._runner = runner
        self._lock = lock
        self._tmp = tmp_dir or cache_root() / "ingest" / "tmp"

    def _tdl(self, *args: str) -> None:
        cmd = ["flock", "-w", LOCK_WAIT, "-E", str(BUSY), str(self._lock), "tdl", *args]
        try:
            result = self._runner(cmd, stdin=subprocess.DEVNULL, capture_output=True, text=True)
        except OSError as e:
            raise TelegramError(f"could not run tdl: {e}") from e
        if result.returncode == BUSY:
            raise TelegramBusy(f"the tdl lock {self._lock} stayed held for {LOCK_WAIT}s")
        if result.returncode != 0:
            tail = (result.stderr or result.stdout or "").strip()[-500:]
            raise TelegramError(f"tdl {args[0]} exited {result.returncode}: {tail}")

    def export(self, from_id: int) -> list[Message]:
        self._tmp.mkdir(parents=True, exist_ok=True)
        out = self._tmp / f"export-{from_id}.json"
        out.unlink(missing_ok=True)
        try:
            self._tdl("chat", "export", "-c", CHAT, "-T", "id", "-i", str(from_id), "--all", "--with-content", "-o", str(out))
            rows = json.loads(out.read_text(encoding="utf-8"))["messages"]
            return [Message(int(m["id"]), int(m["date"]), m.get("file") or "", m.get("text") or "") for m in rows]
        except (OSError, ValueError, KeyError, TypeError) as e:
            raise TelegramError(f"unreadable tdl export: {e}") from e
        finally:
            out.unlink(missing_ok=True)

    def download(self, msg_id: int, dest: Path) -> Path:
        dest.mkdir(parents=True, exist_ok=True)
        self._tdl("dl", "-u", f"https://t.me/{CHAT}/{msg_id}", "-d", str(dest), "--restart")
        files = [p for p in dest.iterdir() if p.is_file()]
        if len(files) != 1:
            raise TelegramError(f"tdl dl of message {msg_id} left {len(files)} file(s) in {dest}")
        return files[0]
