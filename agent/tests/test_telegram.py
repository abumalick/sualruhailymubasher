import json
import subprocess
from pathlib import Path

import pytest

from sualruhaily_agent.captions import Message
from sualruhaily_agent.telegram import Telegram, TelegramBusy, TelegramError

FIXTURE = Path(__file__).parent / "fixtures" / "telegram-1448.json"
LOCK_PREFIX = ["flock", "-w", "120", "-E", "75"]


class Runner:
    def __init__(self, returncode=0, write=None):
        self.calls = []
        self.returncode = returncode
        self.write = write

    def __call__(self, cmd, **kwargs):
        self.calls.append((cmd, kwargs))
        if self.returncode == 0 and self.write:
            self.write(cmd)
        return subprocess.CompletedProcess(cmd, self.returncode, "", "boom")


def write_export(cmd):
    Path(cmd[cmd.index("-o") + 1]).write_text(FIXTURE.read_text(encoding="utf-8"), encoding="utf-8")


def test_export_runs_tdl_under_the_shared_lock_and_parses_messages(tmp_path):
    runner = Runner(write=write_export)
    lock = tmp_path / "cli.lock"
    telegram = Telegram(runner=runner, lock=lock, tmp_dir=tmp_path / "tmp")

    messages = telegram.export(962)

    [(cmd, kwargs)] = runner.calls
    assert cmd[:7] == [*LOCK_PREFIX, str(lock), "tdl"]
    assert cmd[7:16] == ["chat", "export", "-c", "Sulalruhaily", "-T", "id", "-i", "962", "--all"]
    assert "--with-content" in cmd
    assert kwargs["stdin"] == subprocess.DEVNULL
    assert len(messages) == len(json.loads(FIXTURE.read_text(encoding="utf-8"))["messages"])
    first = next(m for m in messages if m.id == 971)
    assert first == Message(971, 1791632929, "", first.text) and "يعتذر" in first.text
    assert list((tmp_path / "tmp").iterdir()) == []


def test_download_returns_the_single_file_tdl_wrote(tmp_path):
    def write(cmd):
        dest = Path(cmd[cmd.index("-d") + 1])
        (dest / "3174045392_1112_01قوله.mp3").write_bytes(b"audio")

    runner = Runner(write=write)
    lock = tmp_path / "cli.lock"
    dest = tmp_path / "1112"

    path = Telegram(runner=runner, lock=lock, tmp_dir=tmp_path).download(1112, dest)

    [(cmd, _)] = runner.calls
    assert cmd[:7] == [*LOCK_PREFIX, str(lock), "tdl"]
    assert cmd[7:] == ["dl", "-u", "https://t.me/Sulalruhaily/1112", "-d", str(dest), "--restart"]
    assert path == dest / "3174045392_1112_01قوله.mp3"


def test_download_without_a_file_is_an_error(tmp_path):
    with pytest.raises(TelegramError):
        Telegram(runner=Runner(), lock=tmp_path / "l", tmp_dir=tmp_path).download(1, tmp_path / "1")


def test_exit_75_means_busy(tmp_path):
    with pytest.raises(TelegramBusy):
        Telegram(runner=Runner(75), lock=tmp_path / "l", tmp_dir=tmp_path).export(859)


def test_other_failures_are_errors(tmp_path):
    with pytest.raises(TelegramError):
        Telegram(runner=Runner(1), lock=tmp_path / "l", tmp_dir=tmp_path).export(859)
    with pytest.raises(TelegramError):
        Telegram(runner=Runner(1), lock=tmp_path / "l", tmp_dir=tmp_path).download(1, tmp_path / "1")


def test_missing_flock_or_tdl_is_an_error(tmp_path):
    def missing(cmd, **kwargs):
        raise FileNotFoundError("flock")

    with pytest.raises(TelegramError):
        Telegram(runner=missing, lock=tmp_path / "l", tmp_dir=tmp_path).export(859)
