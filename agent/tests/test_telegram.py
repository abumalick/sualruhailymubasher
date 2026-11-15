import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest
from telethon.errors import FloodWaitError

from sualruhaily_agent.captions import Message
from sualruhaily_agent.telegram import CHAT, Telegram, TelegramBusy, TelegramError, settings, to_message


def tg_message(id, text="", name=None, ext=None, media=True, date=1794737704):
    file = SimpleNamespace(name=name, ext=ext) if media else None
    return SimpleNamespace(
        id=id, message=text, file=file, media=object() if media else None,
        date=datetime.fromtimestamp(date, timezone.utc),
    )


class FakeClient:
    def __init__(self, messages=(), authorized=True, fail=None):
        self.messages = {m.id: m for m in messages}
        self.authorized = authorized
        self.fail = fail
        self.calls = []
        self.connected = False

    def connect(self):
        if isinstance(self.fail, sqlite3.OperationalError):
            raise self.fail
        self.connected = True

    def is_user_authorized(self):
        return self.authorized

    def iter_messages(self, chat, min_id=0, reverse=False):
        self.calls.append(("iter", chat, min_id, reverse))
        if self.fail:
            raise self.fail
        return [m for i, m in sorted(self.messages.items()) if i > min_id]

    def get_messages(self, chat, ids):
        self.calls.append(("get", chat, ids))
        return self.messages.get(ids)

    def download_media(self, message, file):
        self.calls.append(("download", message.id, file))
        Path(file).write_bytes(b"audio")
        return file

    def disconnect(self):
        self.connected = False


def test_to_message_keeps_the_shape_the_parser_reads():
    assert to_message(tg_message(1112, "شرح دليل الطالب", name="01قوله_x_03_06_1448.mp3")) == Message(
        1112, 1794737704, "01قوله_x_03_06_1448.mp3", "شرح دليل الطالب",
    )
    assert to_message(tg_message(971, "يعتذر شيخنا", media=False)) == Message(971, 1794737704, "", "يعتذر شيخنا")
    assert to_message(tg_message(1093, "#محاضرة", name=None, ext=".jpg")) == Message(1093, 1794737704, "", "#محاضرة")
    assert to_message(SimpleNamespace(id=5, message=None, file=None, media=None,
                                      date=datetime.fromtimestamp(0, timezone.utc))) == Message(5, 0, "", "")


def test_export_reads_from_the_given_id_oldest_first():
    client = FakeClient([tg_message(i, f"m{i}") for i in (960, 961, 962, 963)])
    telegram = Telegram(lambda: client)

    messages = telegram.export(962)

    assert [m.id for m in messages] == [962, 963]
    assert client.calls == [("iter", CHAT, 961, True)]


def test_one_connection_serves_every_call_until_close(tmp_path):
    made = []

    def factory():
        made.append(FakeClient([tg_message(1112, name="a.mp3")]))
        return made[-1]

    telegram = Telegram(factory)
    telegram.export(1112)
    telegram.download(1112, tmp_path / "1112")
    telegram.close()

    assert len(made) == 1 and not made[0].connected


def test_download_writes_the_named_file_into_dest(tmp_path):
    client = FakeClient([tg_message(1112, name="01قوله.mp3")])

    path = Telegram(lambda: client).download(1112, tmp_path / "1112")

    assert path == tmp_path / "1112" / "01قوله.mp3"
    assert path.read_bytes() == b"audio"


def test_download_without_a_file_name_uses_the_message_id(tmp_path):
    client = FakeClient([tg_message(1033, name=None, ext=".m4a")])

    assert Telegram(lambda: client).download(1033, tmp_path / "d") == tmp_path / "d" / "1033.m4a"


def test_download_of_a_missing_or_text_message_is_an_error(tmp_path):
    client = FakeClient([tg_message(971, "text", media=False)])
    with pytest.raises(TelegramError):
        Telegram(lambda: client).download(971, tmp_path / "a")
    with pytest.raises(TelegramError):
        Telegram(lambda: client).download(5, tmp_path / "b")


def test_unauthorized_session_is_an_error_naming_the_login_command():
    with pytest.raises(TelegramError, match="telegram-login"):
        Telegram(lambda: FakeClient(authorized=False)).export(859)


def test_flood_wait_means_busy():
    with pytest.raises(TelegramBusy):
        Telegram(lambda: FakeClient(fail=FloodWaitError(None, capture=30))).export(859)


def test_a_session_file_in_use_means_busy():
    with pytest.raises(TelegramBusy):
        Telegram(lambda: FakeClient(fail=sqlite3.OperationalError("database is locked"))).export(859)


def test_other_failures_are_errors():
    with pytest.raises(TelegramError):
        Telegram(lambda: FakeClient(fail=ConnectionError("down"))).export(859)


def test_settings_come_from_the_environment(tmp_path):
    env = {"TELEGRAM_API_ID": "123", "TELEGRAM_API_HASH": "abc", "TELEGRAM_SESSION": str(tmp_path / "s.session")}
    assert settings(env) == (123, "abc", tmp_path / "s.session")
    assert settings({"TELEGRAM_API_ID": "1", "TELEGRAM_API_HASH": "h"}, home=tmp_path)[2] == (
        tmp_path / ".config" / "sualruhailymubasher" / "telegram.session"
    )
    with pytest.raises(TelegramError, match="TELEGRAM_API_ID"):
        settings({})
