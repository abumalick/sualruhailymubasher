import os
import sqlite3
from collections.abc import Callable, Mapping
from typing import Any
from pathlib import Path

from telethon.errors import FloodWaitError

from .captions import Message

CHAT = "Sulalruhaily"


class TelegramError(Exception):
    pass


class TelegramBusy(TelegramError):
    pass


def settings(environ: Mapping[str, str] = os.environ, home: Path | None = None) -> tuple[int, str, Path]:
    """The job's own Telegram login: API credentials and a session file no other tool uses."""
    try:
        api_id, api_hash = int(environ["TELEGRAM_API_ID"]), environ["TELEGRAM_API_HASH"]
    except (KeyError, ValueError) as e:
        raise TelegramError("TELEGRAM_API_ID and TELEGRAM_API_HASH must be set") from e
    default = (home or Path.home()) / ".config" / "sualruhailymubasher" / "telegram.session"
    return api_id, api_hash, Path(environ.get("TELEGRAM_SESSION") or default)


def client_factory(environ: Mapping[str, str] = os.environ) -> Callable[[], Any]:
    api_id, api_hash, session = settings(environ)

    def make():
        from telethon.sync import TelegramClient

        return TelegramClient(str(session), api_id, api_hash)

    return make


def to_message(m) -> Message:
    name = (m.file.name if m.file else None) or ""
    return Message(m.id, int(m.date.timestamp()), name, m.message or "")


class Telegram:
    """Reads @Sulalruhaily through a Telethon user session; one connection per run, closed with close()."""

    def __init__(self, factory: Callable[[], Any]):
        self._factory = factory
        self._client = None

    def _connected(self):
        if self._client is None:
            client = self._factory()
            self._call(client.connect)
            if not self._call(client.is_user_authorized):
                client.disconnect()
                raise TelegramError("the Telegram session is not logged in: run `sualruhaily-agent telegram-login`")
            self._client = client
        return self._client

    @staticmethod
    def _call(fn, *args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except FloodWaitError as e:
            raise TelegramBusy(f"Telegram asked to wait {e.seconds}s") from e
        except sqlite3.OperationalError as e:
            raise TelegramBusy(f"the Telegram session file is in use: {e}") from e
        except TelegramError:
            raise
        except Exception as e:
            raise TelegramError(f"Telegram call failed: {type(e).__name__}: {e}") from e

    def export(self, from_id: int) -> list[Message]:
        client = self._connected()
        return [to_message(m) for m in self._call(lambda: list(client.iter_messages(CHAT, min_id=from_id - 1, reverse=True)))]

    def download(self, msg_id: int, dest: Path) -> Path:
        client = self._connected()
        message = self._call(client.get_messages, CHAT, ids=msg_id)
        if message is None or not message.media or not message.file:
            raise TelegramError(f"message {msg_id} has no file to download")
        dest.mkdir(parents=True, exist_ok=True)
        target = dest / (message.file.name or f"{msg_id}{message.file.ext or ''}")
        written = self._call(client.download_media, message, file=str(target))
        if not written or not Path(written).is_file():
            raise TelegramError(f"download of message {msg_id} wrote no file")
        return Path(written)

    def close(self) -> None:
        if self._client is not None:
            self._client.disconnect()
            self._client = None
